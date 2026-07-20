import { prefersReducedMotion } from "../config.js";

export const initCursorLight = () => {
  // Bail out on touch-only devices — no hover capability means no cursor to follow.
  if (window.matchMedia("(hover: none)").matches) return;

  const blob = document.createElement("div");
  blob.className = "cursor-blob";

  const glyph = document.createElement("span");
  glyph.className = "cursor-blob__glyph";
  glyph.textContent = "+";
  blob.appendChild(glyph);
  document.body.appendChild(blob);

  const reducedMotion = prefersReducedMotion();

  const LERP = 0.14;
  const MAX_SPEED = 40; // px/frame beyond which squash is maxed

  // Current lerped position.
  let cx = window.innerWidth / 2;
  let cy = window.innerHeight / 2;

  // Target position.
  let tx = cx;
  let ty = cy;

  // Previous lerped position — for velocity / direction.
  let px = cx;
  let py = cy;

  let rafId = null;

  const applyTransform = (x, y, angle, sx, sy) => {
    blob.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}rad) scale(${sx}, ${sy})`;
  };

  // Seed position so the first frame doesn't pop from (0,0).
  applyTransform(cx, cy, 0, 1, 1);

  const tick = () => {
    rafId = null;

    if (reducedMotion) {
      applyTransform(tx, ty, 0, 1, 1);
    } else {
      // Store previous position before updating.
      px = cx;
      py = cy;

      cx += (tx - cx) * LERP;
      cy += (ty - cy) * LERP;

      // Velocity vector from previous to current lerped position.
      const vx = cx - px;
      const vy = cy - py;
      const speed = Math.sqrt(vx * vx + vy * vy);

      let angle = 0;
      let sx = 1;
      let sy = 1;

      if (speed > 0.15) {
        angle = Math.atan2(vy, vx);
        // Squash: stretch along motion axis, compress on perpendicular.
        const t = Math.min(speed / MAX_SPEED, 1);
        // sx is the axis-aligned scale along the motion direction.
        const stretch = 1 + t * 0.25;
        const squash = 1 / stretch; // preserve area roughly
        sx = stretch;
        sy = squash;
      }

      applyTransform(cx, cy, angle, sx, sy);

      // Keep the rAF loop alive until fully settled.
      const dxRem = tx - cx;
      const dyRem = ty - cy;
      if (dxRem * dxRem + dyRem * dyRem > 0.25 || speed > 0.15) {
        rafId = requestAnimationFrame(tick);
      }
    }
  };

  const scheduleFrame = () => {
    if (rafId === null) {
      rafId = requestAnimationFrame(tick);
    }
  };

  window.addEventListener(
    "pointermove",
    (e) => {
      tx = e.clientX;
      ty = e.clientY;
      scheduleFrame();
    },
    { passive: true },
  );

  // Interactive state: detect hover over clickable targets.
  const INTERACTIVE = "a, button, .work-card";

  window.addEventListener(
    "pointerover",
    (e) => {
      const active = e.target.closest(INTERACTIVE) !== null;
      blob.classList.toggle("cursor-blob--active", active);
    },
    { passive: true },
  );
};
