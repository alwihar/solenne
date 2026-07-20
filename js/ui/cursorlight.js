import { prefersReducedMotion } from "../config.js";

// Ring + blob + dot cursor.
// - dot: glued to raw pointer, z-index 70
// - ring: lerped, mix-blend difference, z-index 70, subtle (opacity 0.6)
// - blob: lerped with ring, filled soft white, mix-blend difference, z-index 60
//   Shrinks / ring expands when hovering interactive targets (including 3-D letters).
export const initCursorLight = () => {
  // Bail out on touch-only devices — no hover means no cursor to follow.
  if (window.matchMedia("(hover: none)").matches) return;

  const ring = document.createElement("div");
  ring.className = "cursor-ring";
  const blob = document.createElement("div");
  blob.className = "cursor-blob";
  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  document.body.appendChild(blob);
  document.body.appendChild(ring);
  document.body.appendChild(dot);

  const reducedMotion = prefersReducedMotion();
  const LERP = 0.2;

  // Ring / blob position (lerped).
  let rx = window.innerWidth / 2;
  let ry = window.innerHeight / 2;
  // Target / raw pointer position.
  let tx = rx;
  let ty = ry;

  // Interactive-hover state: set by pointerover OR by body.is-over-letter.
  let pointerOverInteractive = false;

  let rafId = null;

  const placeRing = (x, y) => {
    ring.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  };
  const placeBlob = (x, y) => {
    blob.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  };
  const placeDot = (x, y) => {
    dot.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  };

  placeRing(rx, ry);
  placeBlob(rx, ry);
  placeDot(tx, ty);

  const tick = () => {
    rafId = null;
    rx += (tx - rx) * LERP;
    ry += (ty - ry) * LERP;
    placeRing(rx, ry);
    placeBlob(rx, ry);

    // Check body class set by stage.js raycaster (3-D letter hover).
    const overLetter = document.body.classList.contains("is-over-letter");
    const active = pointerOverInteractive || overLetter;
    ring.classList.toggle("cursor-ring--active", active);
    blob.classList.toggle("cursor-blob--active", active);

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
        placeBlob(rx, ry);
      } else {
        scheduleFrame();
      }
    },
    { passive: true },
  );

  // Grow the ring / shrink the blob over interactive DOM targets.
  const INTERACTIVE = "a, button, .work-card";
  window.addEventListener(
    "pointerover",
    (e) => {
      pointerOverInteractive = e.target.closest(INTERACTIVE) !== null;
      // Ensure the rAF loop runs at least one more tick so the class updates.
      scheduleFrame();
    },
    { passive: true },
  );
};
