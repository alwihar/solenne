import { prefersReducedMotion } from "../config.js";

// Minimal ring cursor: a lerping ring + a dot glued to the raw pointer.
// Both use mix-blend difference so they stay legible over any section.
export const initCursorLight = () => {
  // Bail out on touch-only devices — no hover means no cursor to follow.
  if (window.matchMedia("(hover: none)").matches) return;

  const ring = document.createElement("div");
  ring.className = "cursor-ring";
  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  document.body.appendChild(ring);
  document.body.appendChild(dot);

  const reducedMotion = prefersReducedMotion();
  const LERP = 0.2;

  // Ring position (lerped).
  let rx = window.innerWidth / 2;
  let ry = window.innerHeight / 2;
  // Target / raw pointer position.
  let tx = rx;
  let ty = ry;

  let rafId = null;

  const placeRing = (x, y) => {
    ring.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  };
  const placeDot = (x, y) => {
    dot.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  };

  placeRing(rx, ry);
  placeDot(tx, ty);

  const tick = () => {
    rafId = null;
    rx += (tx - rx) * LERP;
    ry += (ty - ry) * LERP;
    placeRing(rx, ry);

    const dx = tx - rx;
    const dy = ty - ry;
    if (dx * dx + dy * dy > 0.25) {
      rafId = requestAnimationFrame(tick);
    }
  };

  const scheduleFrame = () => {
    if (rafId === null) rafId = requestAnimationFrame(tick);
  };

  window.addEventListener(
    "pointermove",
    (e) => {
      tx = e.clientX;
      ty = e.clientY;
      placeDot(tx, ty);
      if (reducedMotion) {
        rx = tx;
        ry = ty;
        placeRing(rx, ry);
      } else {
        scheduleFrame();
      }
    },
    { passive: true },
  );

  // Grow the ring over interactive targets.
  const INTERACTIVE = "a, button, .work-card";
  window.addEventListener(
    "pointerover",
    (e) => {
      const active = e.target.closest(INTERACTIVE) !== null;
      ring.classList.toggle("cursor-ring--active", active);
    },
    { passive: true },
  );
};
