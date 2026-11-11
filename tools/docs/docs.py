"""Renders the game repository's docs/**/*.md into DEST/docs/: a sidebar of groups, collapsible sections, a search over
every heading and every method of the reference, copy buttons on code. No dependencies; the markdown
the docs use is small (headings, paragraphs, lists, tables, fences, images), so the renderer is too.

build.py calls build_docs() after api_ref.py, so the reference is current."""
import html
import json
import posixpath
import re
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
DOCS = None  # the docs/ folder of the game's checkout, set by build_docs()

# Sidebar: group -> files (docs-relative). Anything not listed lands in "More" so a new page is never lost.
NAV = [
    ("Start", ["modding.md"]),
    ("Content", ["blocks.md", "items.md", "entities.md", "details/liquids.md", "details/effects.md",
                 "details/recipes-loot.md", "details/world-content.md", "block_entities.md",
                 "registration.md", "details/editing-others.md"]),
    ("Behavior", ["events.md", "details/conditions.md", "details/attributes.md",
                  "details/poses-and-modes.md", "details/commands.md", "details/text.md"]),
    ("World from code", ["world-api.md", "details/world-blocks.md", "details/world-entities.md",
                         "details/hitboxes.md", "details/particles-sounds.md"]),
    ("Client", ["client.md", "ui.md", "details/camera.md", "models.md", "shaders.md"]),
    ("Assets", ["textures.md", "ctm.md", "sky.md", "resourcepacks.md", "localization.md",
                "redstone.md", "worldgen.md"]),
]


def out_path(rel):
    """docs-relative .md path -> docs-relative output path."""
    if rel == "modding.md":
        return "index.html"
    return rel[:-3] + ".html"


def slug(text):
    text = re.sub(r"<[^>]+>", "", text).lower()
    text = re.sub(r"[^\w\s-]", "", text)
    return re.sub(r"\s", "-", text.strip())


def esc(t):
    return html.escape(t, quote=False)


class Page:
    def __init__(self, rel, source):
        self.rel = rel
        self.source = source
        self.title = rel
        self.sections = []  # (id, heading text, plain text) for search
        self.items = []  # reference entries
        self.toc = []
        self.html = ""

    def link(self, target):
        m = re.match(r"([^#]*)(#.*)?$", target)
        path, frag = m.group(1), m.group(2) or ""
        if re.match(r"[a-z]+:", target) or not path:
            return target
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(self.rel), path))
        if path.endswith(".md"):
            resolved = out_path(resolved)
        here = posixpath.dirname(out_path(self.rel)) or "."
        return posixpath.relpath(resolved, here) + frag


def inline(text, page):
    stash = []

    def keep(m):
        stash.append("<code>" + esc(m.group(1)) + "</code>")
        return f"\x00{len(stash) - 1}\x00"

    text = re.sub(r"`([^`]+)`", keep, text)
    anchors = []

    def anchor(m):
        anchors.append(f'<a id="{m.group(1)}"></a>')
        return f"\x01{len(anchors) - 1}\x01"

    text = re.sub(r'<a id="([^"]+)"></a>', anchor, text)
    text = esc(text)
    text = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", lambda m: f'<img alt="{m.group(1)}" src="{page.link(m.group(2))}" loading="lazy">', text)
    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: f'<a href="{html.escape(page.link(html.unescape(m.group(2))))}">{m.group(1)}</a>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![\w*])\*([^*\s][^*]*)\*(?![\w*])", r"<em>\1</em>", text)
    text = re.sub(r"\\(\n|$)", "<br>", text)
    text = re.sub(r"\x01(\d+)\x01", lambda m: anchors[int(m.group(1))], text)
    return re.sub(r"\x00(\d+)\x00", lambda m: stash[int(m.group(1))], text)


def plain(text):
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r'<a id="[^"]*"></a>', "", text)
    return re.sub(r"[`*\\]", "", text)


BLOCK_START = re.compile(r"^(#{1,4} |```|\s*[-*] |\s*\d+\. |\||---+$|>)")


def render(page):
    lines = page.source.split("\n")
    out = []
    i = 0
    open_sec = False
    section_text = []
    cur_id = None
    cur_head = None
    seen = {}

    def close_section():
        nonlocal open_sec
        if cur_id is not None:
            page.sections.append((cur_id, cur_head, " ".join(section_text)))
        if open_sec:
            out.append("</div></section>")
            open_sec = False

    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        m = re.match(r"(#{1,4}) (.*)", line)
        if m:
            level, text = len(m.group(1)), m.group(2).strip()
            if level == 1:
                page.title = plain(text)
                out.append(f"<h1>{inline(text, page)}</h1>")
                i += 1
                continue
            base = slug(text)
            n = seen.get(base, 0)
            seen[base] = n + 1
            hid = base if n == 0 else f"{base}-{n}"
            if level == 2:
                close_section()
                cur_id, cur_head, section_text = hid, plain(text), []
                page.toc.append((hid, plain(text)))
                out.append(f'<section class="dsec" id="{hid}"><h2><button class="fold" aria-expanded="true">{inline(text, page)}</button><a class="anchor" href="#{hid}">#</a></h2><div class="sec-body">')
                open_sec = True
            else:
                out.append(f'<h{level} id="{hid}">{inline(text, page)} <a class="anchor" href="#{hid}">#</a></h{level}>')
            i += 1
            continue
        if line.startswith("```"):
            lang = line[3:].strip()
            i += 1
            code = []
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            i += 1
            out.append(f'<div class="code"><button class="cbtn" title="Copy">copy</button><pre><code class="lang-{esc(lang)}">{esc(chr(10).join(code))}</code></pre></div>')
            continue
        if re.match(r"---+$", line):
            out.append("<hr>")
            i += 1
            continue
        if line.startswith("|") and i + 1 < len(lines) and re.match(r"\|[\s:|-]+\|?$", lines[i + 1]):
            def cells(row):
                row = row.strip().strip("|")
                return [c.strip() for c in re.split(r"(?<!\\)\|", row)]
            head = cells(line)
            i += 2
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append(cells(lines[i]))
                i += 1
            t = "<table><thead><tr>" + "".join(f"<th>{inline(c, page)}</th>" for c in head) + "</tr></thead><tbody>"
            for r in rows:
                t += "<tr>" + "".join(f"<td>{inline(c.replace(chr(92) + '|', '|'), page)}</td>" for c in r) + "</tr>"
            out.append(t + "</tbody></table>")
            for r in rows:
                section_text.append(plain(" ".join(r)))
            continue
        lm = re.match(r"(\s*)([-*]|\d+\.) (.*)", line)
        if lm:
            ordered = lm.group(2)[0].isdigit()
            tag = "ol" if ordered else "ul"
            items = []
            while i < len(lines):
                lm = re.match(r"(\s*)([-*]|\d+\.) (.*)", lines[i])
                if lm:
                    items.append([lm.group(3)])
                    i += 1
                elif lines[i].strip() and not BLOCK_START.match(lines[i]) and items:
                    items[-1].append(lines[i].strip())
                    i += 1
                else:
                    break
            out.append(f"<{tag}>")
            for it in items:
                body = "\n".join(it) if any(x.endswith("\\") for x in it) else " ".join(it)
                rendered = inline(body, page)
                if body.startswith('<a id="'):
                    rendered = rendered.replace("</code>: ", '</code><span class="d">', 1) + ("</span>" if "</code><span" in rendered else "")
                out.append(f"<li>{rendered}</li>")
                section_text.append(plain(body))
                idm = re.match(r'<a id="([^"]+)"></a>', body)
                if idm:
                    page.items.append((idm.group(1), plain(body)))
            out.append(f"</{tag}>")
            continue
        para = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not BLOCK_START.match(lines[i]):
            para.append(lines[i].strip())
            i += 1
        body = " ".join(para) if not any(p.endswith("\\") for p in para) else "\n".join(para)
        out.append(f"<p>{inline(body, page)}</p>")
        section_text.append(plain(body))
    close_section()
    page.html = "\n".join(out)


def nav_html(pages, current):
    listed = {rel for _, files in NAV for rel in files}
    groups = [(g, [f for f in files if f in pages]) for g, files in NAV]
    more = sorted(r for r in pages if r not in listed and not r.startswith("reference/"))
    if more:
        groups.append(("More", more))
    ref = sorted((r for r in pages if r.startswith("reference/") and r != "reference/index.md"), key=lambda r: r)
    if "reference/index.md" in pages:
        groups.append(("Reference", ["reference/index.md"] + ref))
    here = posixpath.dirname(out_path(current)) or "."
    parts = []
    for name, files in groups:
        inside = any(f == current for f in files)
        links = []
        for f in files:
            href = posixpath.relpath(out_path(f), here)
            title = pages[f].title if f != "reference/index.md" else "All reference pages"
            title = re.sub(r" reference$", "", title)
            cls = ' class="current" aria-current="page"' if f == current else ""
            links.append(f'<a{cls} href="{href}">{esc(title)}</a>')
        parts.append(f'<details class="group"{" open" if inside else ""}><summary>{name}</summary>{"".join(links)}</details>')
    return "".join(parts)


TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} - Weft docs</title>
<meta name="theme-color" content="#14161e">
<link rel="icon" href="{root}assets/icon.png">
<link rel="stylesheet" href="{root}style.css">
<link rel="stylesheet" href="{root}docs.css">
</head>
<body class="docs" data-root="{root}docs/">
<header class="bar">
  <a class="bar-name" href="{root}index.html">WEFT</a>
  <nav class="bar-links">
    <a href="{root}docs/index.html">Docs</a>
    <a href="{repo}">GitHub</a>
    <a href="{discord}">Discord</a>
  </nav>
</header>
<div class="shell">
  <aside class="side">
    <input id="q" type="search" placeholder="Search the docs" autocomplete="off" aria-label="Search the docs">
    <div id="results" hidden></div>
    <nav class="tree">{nav}</nav>
  </aside>
  <main class="doc">
    {body}
    <p class="edit"><a href="{repo}/blob/master/docs/{rel}">Edit this page on GitHub</a></p>
  </main>
</div>
<script src="{rootdocs}search-index.js"></script>
<script src="{root}docs.js"></script>
</body>
</html>
"""


def build_docs(dist, links, weft):
    global DOCS
    DOCS = Path(weft) / "docs"
    pages = {}
    for path in sorted(DOCS.rglob("*.md")):
        rel = path.relative_to(DOCS).as_posix()
        page = Page(rel, path.read_text(encoding="utf-8"))
        render(page)
        pages[rel] = page
    shutil.copy(HERE / "docs.css", dist / "docs.css")
    shutil.copy(HERE / "docs.js", dist / "docs.js")
    if (DOCS / "img").exists():
        shutil.copytree(DOCS / "img", dist / "docs" / "img")
    index = []
    for rel, page in pages.items():
        target = dist / "docs" / out_path(rel)
        target.parent.mkdir(parents=True, exist_ok=True)
        depth = len(Path(out_path(rel)).parts) - 1
        root = "../" * (depth + 1)
        toc = ""
        if len(page.toc) >= 4:
            toc = '<nav class="toc"><span>On this page</span>' + "".join(f'<a href="#{i}">{esc(t)}</a>' for i, t in page.toc) + '<span class="tools"><button id="fold-all">collapse all</button><button id="unfold-all">expand all</button></span></nav>'
        text = TEMPLATE.format(
            title=esc(page.title), root=root, rootdocs="../" * depth or "./", nav=nav_html(pages, rel),
            body=page.html.replace("</h1>", "</h1>" + toc, 1) if toc else page.html, rel=rel, toc="", **links)
        target.write_text(text, encoding="utf-8", newline="\n")
        url = out_path(rel)
        for sid, head, body in page.sections:
            index.append([page.title, head, f"{url}#{sid}", body[:240]])
        for iid, body in page.items:
            index.append([page.title, body.split(":")[0][:80], f"{url}#{iid}", body[:240]])
        if not page.sections and not page.items:
            index.append([page.title, page.title, url, ""])
    (dist / "docs" / "search-index.js").write_text("window.WEFT_SEARCH=" + json.dumps(index, ensure_ascii=False, separators=(",", ":")) + ";", encoding="utf-8")
    print(f"docs: {len(pages)} pages, {len(index)} searchable entries")
