import { Buffer } from 'node:buffer';
import { createHash, timingSafeEqual } from 'node:crypto';
import { DurableObject } from 'cloudflare:workers';
import { verifier } from './atlas-password.mjs';

const ROOT = '/workspace/biome-atlas';
const FILES = new Map([
  [ROOT + '/', ['index.html', 'text/html']],
  [ROOT + '/style.css', ['style.css', 'text/css']],
  [ROOT + '/app.js', ['app.js', 'text/javascript']],
]);
const MAP = ROOT + '/map.json';
const INSTALL = ROOT + '/install';
const MAX_MAP_BYTES = 1_900_000;
const MAX_ASSET_BYTES = 200_000;

function reply(status, body = null, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, no-transform',
      'Cloudflare-CDN-Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      ...headers,
    },
  });
}

async function authenticate(request, env) {
  const [salt, digest] = verifier.split(':');
  const authorization = request.headers.get('Authorization');
  const encoded = authorization?.match(/^Basic ([A-Za-z0-9+/]{64})$/i)?.[1];
  if (encoded) {
    const login = Buffer.from(encoded, 'base64').toString('utf8');
    const password = login.match(/^weft:([A-Za-z0-9_-]{43})$/)?.[1];
    if (password) {
      const actual = createHash('sha256').update(salt + ':' + password).digest();
      if (timingSafeEqual(actual, Buffer.from(digest, 'hex'))) return null;
    }
  }
  if (authorization) {
    const key = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.ATLAS_LOGIN_LIMIT.limit({ key });
    if (!success) return reply(429, 'Too many attempts.', { 'Retry-After': '60' });
  }
  return reply(401, 'Enter the atlas password.', {
    'WWW-Authenticate': 'Basic realm="Weft Biome Atlas", charset="UTF-8"',
  });
}

async function readJson(request, maxBytes) {
  if (Number(request.headers.get('Content-Length')) > maxBytes) return { error: 413 };
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.body ?? []) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) return { error: 413 };
    chunks.push(chunk);
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes));
    return { text, data: JSON.parse(text) };
  } catch {
    return { error: 400 };
  }
}

function validMap(map) {
  if (!Array.isArray(map?.nodes) || !Array.isArray(map.edges) ||
      !map.nodes.every(node => node && typeof node.id === 'string' &&
        typeof node.title === 'string' && typeof node.group === 'string' &&
        typeof node.status === 'string' && typeof node.note === 'string' &&
        Number.isFinite(node.x) && Number.isFinite(node.y)) ||
      !['notes', 'frames'].every(key => map[key] == null ||
        (Array.isArray(map[key]) && map[key].every(item => item && typeof item.id === 'string')))) return false;
  const ids = new Set(map.nodes.map(node => node.id));
  return ids.size === map.nodes.length &&
    map.edges.every(edge => edge && typeof edge.id === 'string' && typeof edge.label === 'string' &&
      edge.from !== edge.to && ids.has(edge.from) && ids.has(edge.to)) &&
    new Set(map.edges.map(edge => edge.id)).size === map.edges.length;
}

function revision(text) {
  return '"' + createHash('sha256').update(text).digest('hex') + '"';
}

function requestedRevision(request, header) {
  return request.headers.get(header)?.match(/^(?:W\/)?("[a-f0-9]{64}")$/)?.[1];
}

export class BiomeAtlas extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS atlas (id INTEGER PRIMARY KEY CHECK (id = 1), document TEXT NOT NULL, revision TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS files (name TEXT PRIMARY KEY, contents TEXT NOT NULL)');
  }

  async install(request) {
    if (request.headers.get('If-None-Match') !== '*') return reply(428);
    const { data, error } = await readJson(request, 3_000_000);
    if (error) return reply(error);
    if (typeof data?.map !== 'string' || Buffer.byteLength(data.map) > MAX_MAP_BYTES ||
        [...FILES.values()].some(([name]) => typeof data.files?.[name] !== 'string' ||
          Buffer.byteLength(data.files[name]) > MAX_ASSET_BYTES)) return reply(400);
    try {
      if (!validMap(JSON.parse(data.map))) return reply(400);
    } catch {
      return reply(400);
    }

    return this.ctx.storage.transactionSync(() => {
      if (this.sql.exec('SELECT 1 FROM atlas WHERE id = 1').toArray().length) return reply(412);
      this.sql.exec('INSERT INTO atlas VALUES (1, ?, ?)', data.map, revision(data.map));
      for (const [name] of FILES.values()) {
        this.sql.exec('INSERT INTO files VALUES (?, ?)', name, data.files[name]);
      }
      return reply(204);
    });
  }

  async save(request) {
    const expected = requestedRevision(request, 'If-Match');
    if (!expected) return reply(428);
    const { data, text, error } = await readJson(request, MAX_MAP_BYTES);
    if (error) return reply(error);
    if (!validMap(data)) return reply(400);
    const etag = revision(text);
    const result = this.sql.exec('UPDATE atlas SET document = ?, revision = ? WHERE id = 1 AND revision = ?', text, etag, expected);
    return result.rowsWritten ? reply(204, null, { ETag: etag }) : reply(412);
  }

  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === INSTALL) return this.install(request);
    if (request.method === 'PUT') return this.save(request);
    const head = request.method === 'HEAD';
    if (path === MAP) {
      const match = requestedRevision(request, 'If-None-Match') ?? '';
      const [map] = this.sql.exec(
        'SELECT CASE WHEN revision != ? AND ? = 0 THEN document END AS document, revision FROM atlas WHERE id = 1',
        match, Number(head),
      ).toArray();
      if (!map) return reply(404);
      const headers = { 'Content-Type': 'application/json; charset=utf-8', ETag: map.revision };
      return match === map.revision ? reply(304, null, headers) : reply(200, map.document, headers);
    }
    const [name, type] = FILES.get(path);
    const [file] = this.sql.exec('SELECT contents FROM files WHERE name = ?', name).toArray();
    return file ? reply(200, head ? null : file.contents, { 'Content-Type': type + '; charset=utf-8' }) : reply(404);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path !== ROOT && !path.startsWith(ROOT + '/')) return env.ASSETS.fetch(request);
    if (url.hostname !== 'weft.download') return reply(404);
    if (url.protocol !== 'https:' || path === ROOT) {
      return reply(308, null, { Location: 'https://weft.download' + (path === ROOT ? ROOT + '/' : path) });
    }
    if (path !== MAP && path !== INSTALL && !FILES.has(path)) return reply(404);

    const denied = await authenticate(request, env);
    if (denied) return denied;

    const read = request.method === 'GET' || request.method === 'HEAD';
    const write = (path === INSTALL && request.method === 'POST') || (path === MAP && request.method === 'PUT');
    if ((!read || path === INSTALL) && !write) return reply(405);
    if (write) {
      if (request.headers.get('Origin') !== url.origin) return reply(403);
      if (request.headers.get('Content-Type') !== 'application/json') return reply(415);
    }
    return env.BIOME_ATLAS.getByName('shared').fetch(request);
  },
};
