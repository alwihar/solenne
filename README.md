# SOLENNE — 3D Artist Portfolio

Premium single-page portfolio for a fictional 3D artist. Inspired by
fanalis.in (letters-on-strings hero, volumetric smoke, 3D depth) but
original: a shader sunset ocean, warmer brighter palette, editorial serif
typography.

## Run

Any static server works:

```sh
python3 -m http.server 4173
# → http://localhost:4173
```

No build step. Three.js + GSAP load via CDN import map (requires internet).

## Design spec (approved 2026-07-19)

**Palette — "sunset warmth":** deep indigo `#1a1440` → violet `#5b2a66` →
coral `#ff7a59` → amber `#ffb347`; warm white text `#fff6ec`, cream section
`#f6ecdf`, ink `#221a33`.

**Structure:**
1. **Preloader** — ring + counter ("IGNITING").
2. **Hero (Three.js, fixed canvas)** — shader ocean with animated waves and a
   sun-reflection streak, giant sun disc + glow at the horizon, gradient sky,
   drifting mist sprites, floating dust particles. Extruded 3D letters
   `SOLENNE` hang on strings, drop from the top with an elastic settle, sway
   idly, react to mouse parallax. On scroll the letters lift away and the
   camera dips while content scrolls over.
3. **Manifesto** — big serif statement, per-word scroll reveal.
4. **Selected Works** — 4 fictional pieces, each card a live generative
   gradient canvas (no images), 3D tilt on hover. Cream background.
5. **Contact** — minimal commission form (client-side validation, mock
   submit), dark gradient. Footer.

**Quality/perf requirements:**
- DPR capped (2 desktop / 1.5 mobile); fewer particles/mist sprites and lower
  geometry segments on small screens.
- `prefers-reduced-motion`: no drop/scrub animation — static settled scene.
- WebGL failure → CSS gradient fallback hero; site remains usable.
- Works canvases pause when offscreen (IntersectionObserver).
- Small focused modules, shared constants in `js/config.js`.

**Non-goals:** no backend (form is mock), no routing, no CMS, no copied
Fanalis assets or copy.
