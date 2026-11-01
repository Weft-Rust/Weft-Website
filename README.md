# WEFT — Voxel Sandbox Engine in Rust 🦀

> *"We'll be here soon."*

A next-generation isometric voxel engine landing page inspired by the WEFT alpha builds. Built with raw HTML5 Canvas, high-performance isometric projection, real-time RGB dynamic light diffusion, retro 8-bit Web Audio, and pixel-perfect aesthetics.

## ✨ Features

- **Dynamic RGB Colored Lighting**: Real-time smooth light attenuation and overlapping color mixing across isometric voxel terrain (recreating the glowing magenta, emerald green, cyan, and amber lamps from WEFT's engine preview).
- **Minecraft / Retro Pixel Art Aesthetic**: Rendered on a crisp pixelated canvas with diamond-faceted voxel geometry, shaded faces, and authentic pixel fonts.
- **Alive & Interactive Terrain**:
  - Gentle undulating terrain waves.
  - Interactive torch light following the cursor.
  - **Click** anywhere to spawn or remove glowing lamp pillars.
  - **Spacebar** or click ripple waves propagating across the landscape.
  - Floating 3D voxel dust/embers.
  - Synthesized 8-bit retro sound effects (Web Audio API).
- **Theme Switcher**:
  - **Neon Glow** (Image 2 style with moody night and multi-colored radiant lanterns).
  - **Circuit Lines** (Image 1 style with industrial dark voxels and glowing yellow energy tracks).
- **For Players & For Modders** toggle views matching the official WEFT design.

## 🚀 Running Locally

Open `index.html` directly in your browser or run a lightweight local server:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080` in your browser.
