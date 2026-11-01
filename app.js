/**
 * WEFT — Pixel-Art Isometric Voxel Engine
 * Inspired by WEFT Engine Alpha screenshots (Dynamic RGB colored lighting)
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
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'shock') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'tab') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.05);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      }
    } catch(e) {
      // Audio might be blocked until user interacts
    }
  }

  // --- Canvas & Rendering Setup ---
  const canvas = document.getElementById('voxel-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  // Pixel scaling factor: renders at low resolution, displayed crisp via CSS pixelated
  const PIXEL_SCALE = 2; // Crispy pixel art rendering
  let viewWidth = 0;
  let viewHeight = 0;

  // Grid Configuration
  const TILE_W = 28;
  const TILE_H = 14;
  const BLOCK_H = 12;
  const HALF_W = TILE_W / 2;
  const HALF_H = TILE_H / 2;

  let gridCols = 52;
  let gridRows = 52;
  let originX = 0;
  let originY = 0;

  // Visual Modes: 'neon' (Image 2) or 'circuits' (Image 1)
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
  let selectedColorIdx = 0;

  // Dynamic light sources (matching Image 2 positions & colors)
  let lights = [
    { x: 12, y: 16, height: 3.5, color: { r: 50, g: 255, b: 130 }, radius: 15, intensity: 1.1, baseIntensity: 1.1, isLamp: true },
    { x: 26, y: 14, height: 4.0, color: { r: 255, g: 60, b: 150 }, radius: 17, intensity: 1.2, baseIntensity: 1.2, isLamp: true },
    { x: 38, y: 18, height: 3.2, color: { r: 255, g: 60, b: 150 }, radius: 14, intensity: 1.0, baseIntensity: 1.0, isLamp: true },
    { x: 44, y: 26, height: 3.8, color: { r: 45, g: 215, b: 255 }, radius: 16, intensity: 1.15, baseIntensity: 1.15, isLamp: true },
    { x: 42, y: 38, height: 3.2, color: { r: 90, g: 255, b: 200 }, radius: 14, intensity: 1.0, baseIntensity: 1.0, isLamp: true },
    { x: 28, y: 44, height: 3.5, color: { r: 255, g: 60, b: 150 }, radius: 15, intensity: 1.1, baseIntensity: 1.1, isLamp: true },
    { x: 14, y: 32, height: 3.0, color: { r: 255, g: 180, b: 45 }, radius: 13, intensity: 1.0, baseIntensity: 1.0, isLamp: true },
    { x: 4,  y: 6,  height: 4.0, color: { r: 255, g: 190, b: 50 }, radius: 18, intensity: 1.2, baseIntensity: 1.2, isLamp: true },
    { x: 46, y: 4,  height: 4.0, color: { r: 255, g: 190, b: 50 }, radius: 18, intensity: 1.2, baseIntensity: 1.2, isLamp: true },
  ];

  // Mouse torch light
  const mouseLight = {
    x: 25,
    y: 25,
    targetX: 25,
    targetY: 25,
    height: 3.0,
    color: { r: 255, g: 235, b: 175 },
    radius: 12,
    intensity: 1.0,
    active: false
  };

  // Shockwave ripples
  const shockwaves = [];

  // Floating embers / dust motes
  const particles = [];
  const MAX_PARTICLES = 40;

  function initParticles() {
    particles.length = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles.push({
        gx: Math.random() * gridCols,
        gy: Math.random() * gridRows,
        z: Math.random() * 5 + 1,
        vz: 0.015 + Math.random() * 0.025,
        vx: (Math.random() - 0.5) * 0.02,
        vy: (Math.random() - 0.5) * 0.02,
        color: LAMP_COLORS[Math.floor(Math.random() * LAMP_COLORS.length)],
        life: Math.random() * 100
      });
    }
  }

  // Resize handler
  function handleResize() {
    const dpr = 1; // Handled by low-res buffer
    const w = window.innerWidth;
    const h = window.innerHeight;

    viewWidth = Math.ceil(w / PIXEL_SCALE);
    viewHeight = Math.ceil(h / PIXEL_SCALE);

    canvas.width = viewWidth;
    canvas.height = viewHeight;

    // Center grid in viewport
    originX = Math.floor(viewWidth / 2);
    originY = Math.floor(viewHeight * 0.22);

    // Calculate required grid size to cover whole screen
    // screen bounds in isometric:
    const neededCols = Math.ceil((viewWidth / HALF_W + viewHeight / HALF_H) * 0.8) + 12;
    gridCols = Math.max(46, neededCols);
    gridRows = Math.max(46, neededCols);
  }

  window.addEventListener('resize', handleResize);
  handleResize();
  initParticles();

  // --- Terrain Height Function ---
  function getTerrainHeight(gx, gy, time) {
    // Gentle rolling topography
    const w1 = Math.sin(gx * 0.14 + time * 0.4) * Math.cos(gy * 0.14 + time * 0.3) * 1.4;
    const w2 = Math.sin(gx * 0.07 - gy * 0.07 + time * 0.2) * 2.0;
    const w3 = Math.cos((gx + gy) * 0.1 + time * 0.5) * 0.8;
    let baseH = w1 + w2 + w3;

    // Apply active shockwaves
    for (let i = 0; i < shockwaves.length; i++) {
      const sw = shockwaves[i];
      const dx = gx - sw.x;
      const dy = gy - sw.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const waveFront = sw.radius;
      const diff = dist - waveFront;
      if (Math.abs(diff) < 4) {
        const falloff = Math.max(0, 1 - sw.age / sw.maxAge);
        baseH += Math.cos(diff * 0.8) * sw.amplitude * falloff;
      }
    }

    return baseH;
  }

  // --- Check if a tile has a Glowing Lamp Pillar ---
  function getLampAt(gx, gy) {
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (l.isLamp && Math.round(l.x) === gx && Math.round(l.y) === gy) {
        return l;
      }
    }
    return null;
  }

  // --- Image 1 Circuit Track check ---
  function isCircuitTile(gx, gy) {
    // Diagonal yellow circuit tracks matching Image 1
    const diag = (gx - gy * 1.5 + 500) % 11;
    return (diag >= 0 && diag < 1.2);
  }

  // --- Lighting Calculation for a voxel ---
  function computeLighting(gx, gy, gz, isLamp, lampObj, time) {
    if (currentMode === 'circuits') {
      // Image 1 aesthetic: dark slate with yellow/orange circuit trails
      const onCircuit = isCircuitTile(gx, gy);
      if (onCircuit) {
        const pulse = 0.8 + 0.2 * Math.sin(time * 3 + (gx + gy) * 0.4);
        return {
          r: Math.floor(255 * pulse),
          g: Math.floor(180 * pulse),
          b: Math.floor(50 * pulse)
        };
      } else {
        // Base dark industrial voxel slate
        const slate = 40 + Math.sin(gx * 0.2 + gy * 0.2) * 5;
        return {
          r: Math.floor(slate * 0.9),
          g: Math.floor(slate * 1.0),
          b: Math.floor(slate * 1.2)
        };
      }
    }

    // Image 2 aesthetic: Moody night with vibrant RGB glowing lamps
    if (isLamp && lampObj) {
      // Self-illuminated lamp block
      return {
        r: Math.min(255, lampObj.color.r + 40),
        g: Math.min(255, lampObj.color.g + 40),
        b: Math.min(255, lampObj.color.b + 40)
      };
    }

    // Ambient night darkness (deep navy charcoal)
    let r = 24;
    let g = 28;
    let b = 38;

    // Accumulate RGB light from all lamps
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      const dx = gx - l.x;
      const dy = gy - l.y;
      const dz = gz - (l.height || 0);
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz * 0.4);

      if (dist < l.radius) {
        // Smoothstep attenuation
        let norm = 1 - (dist / l.radius);
        let atten = norm * norm * (3 - 2 * norm) * l.intensity;

        r += l.color.r * atten * 0.72;
        g += l.color.g * atten * 0.72;
        b += l.color.b * atten * 0.72;
      }
    }

    // Mouse torch light
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

  // --- Main Render Loop ---
  let lastTime = performance.now();
  let animTime = 0;

  function render(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    animTime += dt;

    // Clear background with dark slate
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    // Smooth mouse position damping
    mouseLight.x += (mouseLight.targetX - mouseLight.x) * 0.15;
    mouseLight.y += (mouseLight.targetY - mouseLight.y) * 0.15;

    // Animate lamps pulsing
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (l.isLamp) {
        l.intensity = l.baseIntensity + 0.15 * Math.sin(animTime * 2.5 + i * 1.5);
      }
    }

    // Update shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.age += dt;
      sw.radius += dt * 14;
      if (sw.age >= sw.maxAge) {
        shockwaves.splice(i, 1);
      }
    }

    // Isometric Painter's Algorithm: Draw from back to front
    // Back cells have lowest (gx + gy), front cells have highest (gx + gy)
    const maxSum = (gridCols - 1) + (gridRows - 1);

    for (let sum = 0; sum <= maxSum; sum++) {
      // Determine range of x for this sum
      const minX = Math.max(0, sum - (gridRows - 1));
      const maxX = Math.min(gridCols - 1, sum);

      for (let gx = minX; gx <= maxX; gx++) {
        const gy = sum - gx;

        const lampObj = getLampAt(gx, gy);
        const isLamp = lampObj !== null;

        let terrainH = getTerrainHeight(gx, gy, animTime);
        let blockExtraH = isLamp ? (lampObj.height || 3.0) : 0;
        let totalH = terrainH + blockExtraH;

        // Isometric screen coordinates
        const px = Math.floor(originX + (gx - gy) * HALF_W);
        const py = Math.floor(originY + (gx + gy) * HALF_H - totalH * BLOCK_H);

        // Frustum cull blocks that are completely offscreen
        if (px + HALF_W < -30 || px - HALF_W > viewWidth + 30 ||
            py + BLOCK_H * 3 < -40 || py > viewHeight + 60) {
          continue;
        }

        // Lighting calculation
        const light = computeLighting(gx, gy, totalH, isLamp, lampObj, animTime);

        // Render the 3 faces of the isometric cube
        drawIsometricCube(px, py, BLOCK_H + (isLamp ? 8 : 0), light, isLamp);
      }
    }

    // Render 3D Floating Particles / Embers
    renderParticles(animTime, dt);

    requestAnimationFrame(render);
  }

  // --- Draw a single crisp pixel-art isometric cube ---
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

    if (isLamp) {
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    } else {
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    }
    ctx.fill();

    // Subtle edge highlight on top face for voxel definition
    ctx.strokeStyle = `rgba(${Math.min(255, r + 45)}, ${Math.min(255, g + 45)}, ${Math.min(255, b + 45)}, 0.35)`;
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

    // Lamp subtle aura / glow
    if (isLamp) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const grad = ctx.createRadialGradient(px, py + HALF_H, 2, px, py + HALF_H, HALF_W * 2.2);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.5)`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py + HALF_H, HALF_W * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // --- Render floating particles ---
  function renderParticles(time, dt) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.z += p.vz;
      p.gx += p.vx + Math.sin(time + i) * 0.01;
      p.gy += p.vy + Math.cos(time + i) * 0.01;
      p.life -= dt * 15;

      if (p.life <= 0 || p.z > 8) {
        p.gx = Math.random() * gridCols;
        p.gy = Math.random() * gridRows;
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

  // --- Screen to Isometric Grid Coordinate Conversion ---
  function screenToGrid(screenX, screenY) {
    // Inverse 2:1 isometric transformation
    const dx = screenX - originX;
    const dy = screenY - originY;
    const gx = Math.round((dx / HALF_W + dy / HALF_H) / 2);
    const gy = Math.round((dy / HALF_H - dx / HALF_W) / 2);
    return { gx, gy };
  }

  // --- User Interaction Listeners ---

  // Mouse move: moves dynamic torch light
  window.addEventListener('pointermove', function(e) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) / PIXEL_SCALE;
    const canvasY = (e.clientY - rect.top) / PIXEL_SCALE;

    const grid = screenToGrid(canvasX, canvasY);
    if (grid.gx >= 0 && grid.gx < gridCols && grid.gy >= 0 && grid.gy < gridRows) {
      mouseLight.targetX = grid.gx;
      mouseLight.targetY = grid.gy;
      mouseLight.active = true;
    }
  });

  // Click on canvas: place a glowing lamp pillar or shockwave
  window.addEventListener('pointerdown', function(e) {
    // Avoid clicking buttons/links
    if (e.target.closest('button, a, input, .navbar, .interaction-bar, .modal-card')) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) / PIXEL_SCALE;
    const canvasY = (e.clientY - rect.top) / PIXEL_SCALE;
    const grid = screenToGrid(canvasX, canvasY);

    if (grid.gx >= 0 && grid.gx < gridCols && grid.gy >= 0 && grid.gy < gridRows) {
      const activeColor = LAMP_COLORS[selectedColorIdx];
      // Check if lamp already exists at coordinate
      const existingIdx = lights.findIndex(l => l.isLamp && Math.round(l.x) === grid.gx && Math.round(l.y) === grid.gy);

      if (existingIdx !== -1) {
        // Remove existing lamp
        lights.splice(existingIdx, 1);
        play8BitSound('place');
      } else {
        // Place new glowing lamp!
        lights.push({
          x: grid.gx,
          y: grid.gy,
          height: 3.5,
          color: { r: activeColor.r, g: activeColor.g, b: activeColor.b },
          radius: 16,
          intensity: 1.2,
          baseIntensity: 1.2,
          isLamp: true
        });

        // Trigger ripple
        shockwaves.push({
          x: grid.gx,
          y: grid.gy,
          radius: 0,
          amplitude: 2.5,
          age: 0,
          maxAge: 2.2
        });

        play8BitSound('place');

        // Cycle next color
        selectedColorIdx = (selectedColorIdx + 1) % LAMP_COLORS.length;
        updateColorPill();
      }
    }
  });

  // Spacebar shockwave
  window.addEventListener('keydown', function(e) {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      triggerGlobalShockwave();
    }
  });

  function triggerGlobalShockwave() {
    shockwaves.push({
      x: mouseLight.x || Math.floor(gridCols / 2),
      y: mouseLight.y || Math.floor(gridRows / 2),
      radius: 0,
      amplitude: 3.2,
      age: 0,
      maxAge: 3.0
    });
    play8BitSound('shock');
  }

  // --- UI Controller: Tabs, Modals, Theme Switcher ---

  // Tab switching ("For players" / "For modders")
  const pillPlayers = document.getElementById('pill-players');
  const pillModders = document.getElementById('pill-modders');
  const tabPlayers = document.getElementById('tab-players');
  const tabModders = document.getElementById('tab-modders');

  function setTab(tab) {
    if (tab === 'players') {
      pillPlayers.classList.add('active');
      pillModders.classList.remove('active');
      tabPlayers.classList.add('active');
      tabModders.classList.remove('active');
    } else {
      pillModders.classList.add('active');
      pillPlayers.classList.remove('active');
      tabModders.classList.add('active');
      tabPlayers.classList.remove('active');
    }
    play8BitSound('tab');
  }

  pillPlayers.addEventListener('click', () => setTab('players'));
  pillModders.addEventListener('click', () => setTab('modders'));

  // Theme switch between "Neon Glow" (Image 2) and "Circuit Trails" (Image 1)
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

  // Color pill UI
  const colorDot = document.getElementById('current-color-pill');
  const colorName = document.getElementById('current-color-name');

  function updateColorPill() {
    const c = LAMP_COLORS[selectedColorIdx];
    colorDot.style.backgroundColor = c.hex;
    colorDot.style.boxShadow = `0 0 8px ${c.hex}`;
    colorName.textContent = c.name;
  }
  updateColorPill();

  // Notify Modal
  const btnNotify = document.getElementById('btn-notify');
  const btnDocs = document.getElementById('btn-docs');
  const notifyModal = document.getElementById('notify-modal');
  const modalClose = document.getElementById('modal-close');
  const subscribeForm = document.getElementById('subscribe-form');
  const modalSuccess = document.getElementById('modal-success');

  function openModal() {
    notifyModal.classList.add('open');
    play8BitSound('tab');
  }

  function closeModal() {
    notifyModal.classList.remove('open');
  }

  btnNotify.addEventListener('click', openModal);
  if (btnDocs) btnDocs.addEventListener('click', openModal);
  modalClose.addEventListener('click', closeModal);

  notifyModal.addEventListener('click', function(e) {
    if (e.target === notifyModal) closeModal();
  });

  subscribeForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const email = document.getElementById('subscriber-email').value;
    if (email) {
      modalSuccess.style.display = 'block';
      play8BitSound('place');
      setTimeout(() => {
        closeModal();
        modalSuccess.style.display = 'none';
        subscribeForm.reset();
      }, 2200);
    }
  });

  // Start Animation
  requestAnimationFrame(render);

})();
