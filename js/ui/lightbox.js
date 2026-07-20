import { prefersReducedMotion } from "../config.js";

/**
 * Fullscreen lightbox for the Selected Works section.
 * Build once, reuse for every card click.
 */

let overlay = null;
let activeArt = null;

const buildOverlay = () => {
  const el = document.createElement("div");
  el.className = "lb-overlay";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Work study view");

  el.innerHTML = `
    <div class="lb-body">
      <button class="lb-close" aria-label="Close study view">CLOSE ✕</button>
      <div class="lb-canvas-wrap"></div>
      <div class="lb-info">
        <p class="lb-kicker"></p>
        <h2 class="lb-title"></h2>
        <p class="lb-desc"></p>
      </div>
    </div>`;

  document.body.appendChild(el);

  el.querySelector(".lb-close").addEventListener("click", closeLightbox);
  el.addEventListener("click", (e) => {
    if (e.target === el) closeLightbox();
  });

  return el;
};

const closeLightbox = () => {
  if (!overlay) return;
  overlay.classList.remove("lb-overlay--open");
  document.body.classList.remove("lb-open");

  if (activeArt) {
    activeArt.stop();
    activeArt = null;
  }

  // Remove the fullscreen canvas after transition ends
  overlay.addEventListener(
    "transitionend",
    () => {
      const wrap = overlay.querySelector(".lb-canvas-wrap");
      while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    },
    { once: true }
  );
};

const onKeyDown = (e) => {
  if (e.key === "Escape") closeLightbox();
};

/**
 * @param {object} work  — entry from WORKS array (title, year, medium, desc, palette)
 * @param {number} index — 0-based index
 * @param {Function} createArtwork — imported from works.js to avoid circular dep
 */
export const openLightbox = (work, index, createArtwork) => {
  if (!overlay) overlay = buildOverlay();

  // Populate text
  overlay.querySelector(".lb-kicker").textContent =
    `0${index + 1} · ${work.year} · ${work.medium}`;
  overlay.querySelector(".lb-title").textContent = work.title;
  overlay.querySelector(".lb-desc").textContent = work.desc;

  // Build a fresh fullscreen canvas
  const wrap = overlay.querySelector(".lb-canvas-wrap");
  while (wrap.firstChild) wrap.removeChild(wrap.firstChild);

  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  canvas.setAttribute("aria-hidden", "true");
  wrap.appendChild(canvas);

  const art = createArtwork(canvas, work.palette, index + 1);

  if (prefersReducedMotion()) {
    art.drawOnce();
  } else {
    art.setBoost(1.6);
    art.start();
    activeArt = art;
  }

  // Open
  document.body.classList.add("lb-open");
  overlay.classList.add("lb-overlay--open");

  // Trap focus on close button
  const closeBtn = overlay.querySelector(".lb-close");
  closeBtn.focus();

  document.addEventListener("keydown", onKeyDown, { once: true });
};
