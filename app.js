/**
 * WEFT — Pixel-Art Isometric Voxel Engine
 * Inspired by WEFT Engine Alpha (Dynamic RGB colored lighting)
 */

(function() {
  'use strict';

  // --- Web Audio Synthesizer for 8-bit Retro SFX ---
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function play8BitSound(type) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'place') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(640, now + 0.12);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'shock') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.35);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'tab') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.setValueAtTime(720, now + 0.04);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch(e) {
      // Audio fallback
    }
  }

  // --- Canvas Setup ---
  const canvas = document.getElementById('voxel-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  // Pixel scaling for that crisp retro Minecraft isometric look
  const PIXEL_SCALE = 2;
  let viewWidth = 0;
  let viewHeight = 0;

  // Tile dimensions (Isometric 2:1 ratio)
  const TILE_W = 28;
  const TILE_H = 14;
  const BLOCK_H = 12;
  const HALF_W = TILE_W / 2;
  const HALF_H = TILE_H / 2;

  let originX = 0;
  let originY = 0;

  // Grid bounds computed to guarantee 100% full screen coverage
  let minU = 0, maxU = 0;
  let minV = 0, maxV = 0;

  // Visual mode: 'neon' (Image 2) or 'circuits' (Image 1)
  let currentMode = 'neon';

  // Palette presets for lamps
  const LAMP_COLORS = [
    { name: 'Magenta', r: 255, g: 60, b: 150, hex: '#ff3c96' },
    { name: 'Emerald', r: 50, g: 255, b: 130, hex: '#32ff82' },
    { name: 'Cyan',    r: 45, g: 215, b: 255, hex: '#2dd7ff' },
    { name: 'Amber',   r: 255, g: 180, b: 45, hex: '#ffb42d' },
    { name: 'Purple',  r: 185, g: 75, b: 255, hex: '#b94bff' },
    { name: 'Mint',    r: 90, g: 255, b: 200, hex: '#5affc8' }
  ];
  let colorCycleIdx = 0;

  // Default lights placed relative to center (Image 2 aesthetic)
  let lights = [
    { x: -14, y: -6, height: 3.5, color: { r: 50, g: 255, b: 130 }, radius: 18, intensity: 1.2, baseIntensity: 1.2, isLamp: true },
    { x: 10,  y: -12, height: 4.0, color: { r: 255, g: 60, b: 150 }, radius: 19, intensity: 1.3, baseIntensity: 1.3, isLamp: true },
    { x: 22,  y: -2, height: 3.2, color: { r: 255, g: 60, b: 150 }, radius: 16, intensity: 1.1, baseIntensity: 1.1, isLamp: true },
    { x: 24,  y: 14, height: 3.8, color: { r: 45, g: 215, b: 255 }, radius: 18, intensity: 1.2, baseIntensity: 1.2, isLamp: true },
    { x: 18,  y: 26, height: 3.2, color: { r: 90, g: 255, b: 200 }, radius: 16, intensity: 1.1, baseIntensity: 1.1, isLamp: true },
    { x: -2,  y: 22, height: 3.5, color: { r: 255, g: 60, b: 150 }, radius: 17, intensity: 1.2, baseIntensity: 1.2, isLamp: true },
    { x: -18, y: 12, height: 3.0, color: { r: 255, g: 180, b: 45 }, radius: 16, intensity: 1.1, baseIntensity: 1.1, isLamp: true },
    { x: -26, y: -16, height: 4.0, color: { r: 255, g: 190, b: 50 }, radius: 20, intensity: 1.3, baseIntensity: 1.3, isLamp: true },
    { x: 28,  y: -22, height: 4.0, color: { r: 255, g: 190, b: 50 }, radius: 20, intensity: 1.3, baseIntensity: 1.3, isLamp: true },
  ];

  // Mouse torch light
  const mouseLight = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    height: 3.0,
    color: { r: 255, g: 235, b: 175 },
    radius: 13,
    intensity: 1.0,
    active: false
  };

  // Shockwave ripples
  const shockwaves = [];

  // Floating embers / dust motes
  const particles = [];
  const MAX_PARTICLES = 45;

  function initParticles() {
    particles.length = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles.push({
        gx: (Math.random() - 0.5) * 60,
        gy: (Math.random() - 0.5) * 60,
        z: Math.random() * 5 + 1,
        vz: 0.015 + Math.random() * 0.025,
        vx: (Math.random() - 0.5) * 0.02,
        vy: (Math.random() - 0.5) * 0.02,
        color: LAMP_COLORS[Math.floor(Math.random() * LAMP_COLORS.length)],
        life: Math.random() * 100
      });
    }
  }

  // Handle Resize and Full-Screen Grid Bounds Calculation
  function handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    viewWidth = Math.ceil(w / PIXEL_SCALE);
    viewHeight = Math.ceil(h / PIXEL_SCALE);

    canvas.width = viewWidth;
    canvas.height = viewHeight;

    // Center camera in the middle of the screen
    originX = Math.floor(viewWidth / 2);
    originY = Math.floor(viewHeight / 2);

    // Calculate U = (gx - gy) and V = (gx + gy) range to cover entire viewport + safety padding
    const pad = 60; // Extra pixels beyond screen edges to account for hills & drops
    minU = Math.floor((-pad - originX) / HALF_W) - 4;
    maxU = Math.ceil(((viewWidth + pad) - originX) / HALF_W) + 4;

    minV = Math.floor((-pad - originY - 70) / HALF_H) - 6;
    maxV = Math.ceil(((viewHeight + pad) - originY + 70) / HALF_H) + 6;
  }

  window.addEventListener('resize', handleResize);
  handleResize();
  initParticles();

  // Terrain Height Calculation
  function getTerrainHeight(gx, gy, time) {
    const w1 = Math.sin(gx * 0.12 + time * 0.35) * Math.cos(gy * 0.12 + time * 0.28) * 1.5;
    const w2 = Math.sin(gx * 0.06 - gy * 0.06 + time * 0.2) * 2.2;
    const w3 = Math.cos((gx + gy) * 0.09 + time * 0.4) * 0.8;
    let baseH = w1 + w2 + w3;

    // Apply active shockwaves
    for (let i = 0; i < shockwaves.length; i++) {
      const sw = shockwaves[i];
      const dx = gx - sw.x;
      const dy = gy - sw.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const diff = dist - sw.radius;
      if (Math.abs(diff) < 4.5) {
        const falloff = Math.max(0, 1 - sw.age / sw.maxAge);
        baseH += Math.cos(diff * 0.8) * sw.amplitude * falloff;
      }
    }

    return baseH;
  }

  function getLampAt(gx, gy) {
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (l.isLamp && Math.round(l.x) === gx && Math.round(l.y) === gy) {
        return l;
      }
    }
    return null;
  }

  function isCircuitTile(gx, gy) {
    const diag = (gx - gy * 1.5 + 5000) % 11;
    return (diag >= 0 && diag < 1.25);
  }

  // Real-time RGB Lighting calculation
  function computeLighting(gx, gy, gz, isLamp, lampObj, time) {
    if (currentMode === 'circuits') {
      const onCircuit = isCircuitTile(gx, gy);
      if (onCircuit) {
        const pulse = 0.8 + 0.2 * Math.sin(time * 3 + (gx + gy) * 0.4);
        return {
          r: Math.floor(255 * pulse),
          g: Math.floor(180 * pulse),
          b: Math.floor(50 * pulse)
        };
      } else {
        const slate = 38 + Math.sin(gx * 0.2 + gy * 0.2) * 4;
        return {
          r: Math.floor(slate * 0.9),
          g: Math.floor(slate * 1.0),
          b: Math.floor(slate * 1.2)
        };
      }
    }

    // Image 2: Moody dark slate with vibrant multi-colored light
    if (isLamp && lampObj) {
      return {
        r: Math.min(255, lampObj.color.r + 40),
        g: Math.min(255, lampObj.color.g + 40),
        b: Math.min(255, lampObj.color.b + 40)
      };
    }

    let r = 22;
    let g = 26;
    let b = 36;

    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      const dx = gx - l.x;
      const dy = gy - l.y;
      const dz = gz - (l.height || 0);
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz * 0.4);

      if (dist < l.radius) {
        let norm = 1 - (dist / l.radius);
        let atten = norm * norm * (3 - 2 * norm) * l.intensity;

        r += l.color.r * atten * 0.74;
        g += l.color.g * atten * 0.74;
        b += l.color.b * atten * 0.74;
      }
    }

    if (mouseLight.active) {
      const dx = gx - mouseLight.x;
      const dy = gy - mouseLight.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < mouseLight.radius) {
        let norm = 1 - (dist / mouseLight.radius);
        let atten = norm * norm * (3 - 2 * norm) * mouseLight.intensity;
        r += mouseLight.color.r * atten * 0.85;
        g += mouseLight.color.g * atten * 0.85;
        b += mouseLight.color.b * atten * 0.85;
      }
    }

    return {
      r: Math.min(255, Math.floor(r)),
      g: Math.min(255, Math.floor(g)),
      b: Math.min(255, Math.floor(b))
    };
  }

  // --- Render Loop ---
  let lastTime = performance.now();
  let animTime = 0;

  function render(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    animTime += dt;

    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    // Mouse torch position damping
    mouseLight.x += (mouseLight.targetX - mouseLight.x) * 0.15;
    mouseLight.y += (mouseLight.targetY - mouseLight.y) * 0.15;

    // Pulse lamps gently
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (l.isLamp) {
        l.intensity = l.baseIntensity + 0.15 * Math.sin(animTime * 2.5 + i * 1.5);
      }
    }

    // Update ripples
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.age += dt;
      sw.radius += dt * 15;
      if (sw.age >= sw.maxAge) {
        shockwaves.splice(i, 1);
      }
    }

    // Full-screen Painter's Algorithm loop:
    // sum = V = (gx + gy), sorted from lowest to highest
    for (let sum = minV; sum <= maxV; sum++) {
      const minGX = Math.floor((minU + sum) / 2);
      const maxGX = Math.ceil((maxU + sum) / 2);

      for (let gx = minGX; gx <= maxGX; gx++) {
        const gy = sum - gx;

        const lampObj = getLampAt(gx, gy);
        const isLamp = lampObj !== null;

        let terrainH = getTerrainHeight(gx, gy, animTime);
        let blockExtraH = isLamp ? (lampObj.height || 3.0) : 0;
        let totalH = terrainH + blockExtraH;

        const px = Math.floor(originX + (gx - gy) * HALF_W);
        const py = Math.floor(originY + (gx + gy) * HALF_H - totalH * BLOCK_H);

        // Cull blocks off screen
        if (px + HALF_W < -10 || px - HALF_W > viewWidth + 10 ||
            py + BLOCK_H * 3 < -20 || py > viewHeight + 40) {
          continue;
        }

        const light = computeLighting(gx, gy, totalH, isLamp, lampObj, animTime);
        drawIsometricCube(px, py, BLOCK_H + (isLamp ? 8 : 0), light, isLamp);
      }
    }

    // Render 3D Floating Particles
    renderParticles(animTime, dt);

    requestAnimationFrame(render);
  }

  // Draw Isometric Cube
  function drawIsometricCube(px, py, dropH, light, isLamp) {
    const r = light.r;
    const g = light.g;
    const b = light.b;

    // 1. TOP FACE (Diamond)
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + HALF_W, py + HALF_H);
    ctx.lineTo(px, py + TILE_H);
    ctx.lineTo(px - HALF_W, py + HALF_H);
    ctx.closePath();
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fill();

    // Top face stroke
    ctx.strokeStyle = `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, 0.3)`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 2. LEFT FACE (Shadow side)
    const leftR = Math.floor(r * 0.62);
    const leftG = Math.floor(g * 0.62);
    const leftB = Math.floor(b * 0.68);

    ctx.beginPath();
    ctx.moveTo(px - HALF_W, py + HALF_H);
    ctx.lineTo(px, py + TILE_H);
    ctx.lineTo(px, py + TILE_H + dropH);
    ctx.lineTo(px - HALF_W, py + HALF_H + dropH);
    ctx.closePath();
    ctx.fillStyle = isLamp ? `rgb(${Math.floor(r * 0.85)}, ${Math.floor(g * 0.85)}, ${Math.floor(b * 0.9)})` : `rgb(${leftR}, ${leftG}, ${leftB})`;
    ctx.fill();

    // 3. RIGHT FACE (Medium lit side)
    const rightR = Math.floor(r * 0.80);
    const rightG = Math.floor(g * 0.80);
    const rightB = Math.floor(b * 0.84);

    ctx.beginPath();
    ctx.moveTo(px, py + TILE_H);
    ctx.lineTo(px + HALF_W, py + HALF_H);
    ctx.lineTo(px + HALF_W, py + HALF_H + dropH);
    ctx.lineTo(px, py + TILE_H + dropH);
    ctx.closePath();
    ctx.fillStyle = isLamp ? `rgb(${Math.floor(r * 0.92)}, ${Math.floor(g * 0.92)}, ${Math.floor(b * 0.95)})` : `rgb(${rightR}, ${rightG}, ${rightB})`;
    ctx.fill();

    // Lamp radial glow
    if (isLamp) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const grad = ctx.createRadialGradient(px, py + HALF_H, 2, px, py + HALF_H, HALF_W * 2.2);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.55)`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py + HALF_H, HALF_W * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function renderParticles(time, dt) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.z += p.vz;
      p.gx += p.vx + Math.sin(time + i) * 0.01;
      p.gy += p.vy + Math.cos(time + i) * 0.01;
      p.life -= dt * 15;

      if (p.life <= 0 || p.z > 8) {
        p.gx = (Math.random() - 0.5) * 60;
        p.gy = (Math.random() - 0.5) * 60;
        p.z = 1.0;
        p.life = 60 + Math.random() * 40;
      }

      const px = Math.floor(originX + (p.gx - p.gy) * HALF_W);
      const py = Math.floor(originY + (p.gx + p.gy) * HALF_H - p.z * BLOCK_H);

      if (px >= 0 && px < viewWidth && py >= 0 && py < viewHeight) {
        ctx.fillStyle = p.color.hex;
        ctx.fillRect(px, py, 2, 2);
      }
    }
  }

  // Screen to Grid coordinate conversion
  function screenToGrid(screenX, screenY) {
    const dx = screenX - originX;
    const dy = screenY - originY;
    const gx = Math.round((dx / HALF_W + dy / HALF_H) / 2);
    const gy = Math.round((dy / HALF_H - dx / HALF_W) / 2);
    return { gx, gy };
  }

  // User Interactions
  window.addEventListener('pointermove', function(e) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) / PIXEL_SCALE;
    const canvasY = (e.clientY - rect.top) / PIXEL_SCALE;

    const grid = screenToGrid(canvasX, canvasY);
    mouseLight.targetX = grid.gx;
    mouseLight.targetY = grid.gy;
    mouseLight.active = true;
  });

  window.addEventListener('pointerdown', function(e) {
    if (e.target.closest('button, a, .navbar, .pixel-card')) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) / PIXEL_SCALE;
    const canvasY = (e.clientY - rect.top) / PIXEL_SCALE;
    const grid = screenToGrid(canvasX, canvasY);

    const activeColor = LAMP_COLORS[colorCycleIdx];
    const existingIdx = lights.findIndex(l => l.isLamp && Math.round(l.x) === grid.gx && Math.round(l.y) === grid.gy);

    if (existingIdx !== -1) {
      lights.splice(existingIdx, 1);
      play8BitSound('place');
    } else {
      lights.push({
        x: grid.gx,
        y: grid.gy,
        height: 3.5,
        color: { r: activeColor.r, g: activeColor.g, b: activeColor.b },
        radius: 17,
        intensity: 1.25,
        baseIntensity: 1.25,
        isLamp: true
      });

      shockwaves.push({
        x: grid.gx,
        y: grid.gy,
        radius: 0,
        amplitude: 2.5,
        age: 0,
        maxAge: 2.2
      });

      play8BitSound('place');
      colorCycleIdx = (colorCycleIdx + 1) % LAMP_COLORS.length;
    }
  });

  window.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      shockwaves.push({
        x: mouseLight.x || 0,
        y: mouseLight.y || 0,
        radius: 0,
        amplitude: 3.2,
        age: 0,
        maxAge: 3.0
      });
      play8BitSound('shock');
    }
  });

  // Theme Toggle
  const themeToggle = document.getElementById('theme-toggle');
  const themeLabel = themeToggle.querySelector('.theme-label');
  const themeIcon = themeToggle.querySelector('.theme-icon');

  themeToggle.addEventListener('click', function() {
    if (currentMode === 'neon') {
      currentMode = 'circuits';
      themeLabel.textContent = 'Circuit Lines';
      themeIcon.textContent = '⚡';
    } else {
      currentMode = 'neon';
      themeLabel.textContent = 'Neon Glow';
      themeIcon.textContent = '🔮';
    }
    play8BitSound('tab');
  });

  // Start Animation
  requestAnimationFrame(render);

})();
