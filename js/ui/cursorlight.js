import { prefersReducedMotion } from "../config.js";

export const initCursorLight = () => {
  // Bail out on touch-only devices — no hover capability means no cursor to follow.
  if (window.matchMedia("(hover: none)").matches) return;

  const el = document.createElement("div");
  el.className = "cursor-light";
  document.body.appendChild(el);

  const reducedMotion = prefersReducedMotion();

  // Current rendered position (lerped toward target).
  let currentX = window.innerWidth / 2;
  let currentY = window.innerHeight / 2;

  // Target position updated on every pointermove.
  let targetX = currentX;
  let targetY = currentY;

  let rafId = null;
  let isVisible = false;

  const LERP_FACTOR = 0.12;

  const setTransform = (x, y) => {
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  // Seed the element at the viewport centre so the first lerp starts centred.
  setTransform(currentX, currentY);

  const tick = () => {
    rafId = null;

    if (reducedMotion) {
      // No interpolation — jump straight to target.
      setTransform(targetX, targetY);
    } else {
      currentX += (targetX - currentX) * LERP_FACTOR;
      currentY += (targetY - currentY) * LERP_FACTOR;
      setTransform(currentX, currentY);

      // Keep animating until we've settled within half a pixel.
      if (Math.abs(targetX - currentX) > 0.5 || Math.abs(targetY - currentY) > 0.5) {
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
      targetX = e.clientX;
      targetY = e.clientY;
      scheduleFrame();
    },
    { passive: true },
  );

  // Visibility: hide while in hero viewport (top half of first screen), fade in below.
  const updateVisibility = () => {
    const heroThreshold = window.innerHeight * 0.5;
    const shouldShow = window.scrollY >= heroThreshold;

    if (shouldShow !== isVisible) {
      isVisible = shouldShow;
      el.classList.toggle("cursor-light--on", isVisible);
    }
  };

  window.addEventListener("scroll", updateVisibility, { passive: true });

  // Run once immediately in case the page loads scrolled down.
  updateVisibility();
};
