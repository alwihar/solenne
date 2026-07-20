import { createArtwork } from "./works.js";
import { prefersReducedMotion } from "../config.js";

const PORTRAIT_PALETTE = ["#140f38", "#ff7a59", "#ffb347", "#b287c9"];

export const initAbout = () => {
  const canvas = document.getElementById("about-portrait-canvas");
  if (!canvas) return;

  const reduced = prefersReducedMotion();
  const art = createArtwork(canvas, PORTRAIT_PALETTE, 7);

  if (reduced) {
    art.drawOnce();
  } else {
    // Start animation only when canvas is in view
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) art.start();
        else art.stop();
      },
      { threshold: 0.05 },
    );
    visibilityObserver.observe(canvas);
  }

  // Scroll reveal for right column
  if (!reduced) {
    const revealEls = document.querySelectorAll(".manifesto__portrait-col");
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("about-reveal--visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    // Skip animation — show immediately
    document
      .querySelectorAll(".manifesto__portrait-col")
      .forEach((el) => el.classList.add("about-reveal--visible"));
  }
};
