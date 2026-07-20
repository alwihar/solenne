import { prefersReducedMotion } from "../config.js";
import { openLightbox } from "./lightbox.js";

const WORKS = Object.freeze([
  {
    title: "Ember Tide",
    year: "2026",
    medium: "WEBGL SIMULATION",
    desc: "A shoreline remembers every sunset it has ever burned through.",
    palette: ["#1a1440", "#ff7a59", "#ffb347", "#ff8fa3"],
  },
  {
    title: "Salt Cathedral",
    year: "2025",
    medium: "RAYMARCHED STILL",
    desc: "Light bends differently in rooms built from the ocean's patience.",
    palette: ["#10254a", "#4fc3c8", "#f6ecdf", "#7a5a9a"],
  },
  {
    title: "Midnight Bloom",
    year: "2025",
    medium: "PARTICLE STUDY",
    desc: "Ten thousand petals falling upward, each one a second before dawn.",
    palette: ["#221a33", "#b04861", "#ff8fa3", "#5b2a66"],
  },
  {
    title: "Helios Drift",
    year: "2024",
    medium: "GENERATIVE FILM",
    desc: "The sun forgets its own name on the way down to the horizon.",
    palette: ["#2c1650", "#ffb347", "#e86a52", "#ffe4b8"],
  },
]);

const TILT_MAX_DEG = 5;

// Slowly orbiting radial-gradient blobs — every card is live, no images.
export const createArtwork = (canvas, palette, seed) => {
  const ctx = canvas.getContext("2d");
  const blobs = palette.slice(1).flatMap((color, i) => [
    {
      color,
      r: 0.55 + i * 0.12,
      speed: 0.11 + i * 0.05,
      phase: seed + i * 2.4,
    },
    {
      color,
      r: 0.3 + i * 0.09,
      speed: 0.16 + i * 0.04,
      phase: seed * 1.7 + i * 4.1,
    },
  ]);

  let raf = 0;
  let speedBoost = 1;
  let last = 0;
  let t = seed * 10;

  const draw = (now) => {
    const dt = Math.min((now - last) / 1000, 0.05) || 0.016;
    last = now;
    t += dt * speedBoost;

    const { width: w, height: h } = canvas;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    blobs.forEach((blob) => {
      const cx = w * (0.5 + 0.38 * Math.sin(t * blob.speed + blob.phase));
      const cy =
        h * (0.5 + 0.36 * Math.cos(t * blob.speed * 1.31 + blob.phase * 1.9));
      const radius = Math.max(w, h) * blob.r * 0.5;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `${blob.color}55`);
      grad.addColorStop(1, `${blob.color}00`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });

    raf = requestAnimationFrame(draw);
  };

  return {
    start: () => {
      if (!raf) raf = requestAnimationFrame(draw);
    },
    stop: () => {
      cancelAnimationFrame(raf);
      raf = 0;
    },
    setBoost: (v) => {
      speedBoost = v;
    },
    drawOnce: () =>
      draw(performance.now()) || cancelAnimationFrame(raf) || (raf = 0),
  };
};

const attachTilt = (card) => {
  const onMove = (e) => {
    if (!card.classList.contains("work-card--visible")) return;
    const rect = card.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(900px) rotateY(${nx * TILT_MAX_DEG}deg) rotateX(${-ny * TILT_MAX_DEG}deg) translateY(-4px)`;
  };
  const onLeave = () => {
    card.style.transform = "";
  };
  card.addEventListener("pointermove", onMove);
  card.addEventListener("pointerleave", onLeave);
};

const buildMarquee = () => {
  const text =
    "SELECTED WORKS · 2024 — 2026 · LIGHT STUDIES · COMMISSIONS OPEN ·";
  const segments = 6;

  // Build one "half" track with several repetitions for seamless looping
  const makeTrack = () => {
    const track = document.createElement("div");
    track.className = "works__marquee-track";
    track.setAttribute("aria-hidden", "true");
    for (let i = 0; i < segments; i++) {
      const span = document.createElement("span");
      span.textContent = text;
      track.appendChild(span);
    }
    return track;
  };

  // Two identical tracks side-by-side; animation scrolls -50% to loop back
  const inner = document.createElement("div");
  inner.className = "works__marquee-inner";
  inner.appendChild(makeTrack());
  inner.appendChild(makeTrack());

  const strip = document.createElement("div");
  strip.className = "works__marquee";
  strip.setAttribute("aria-hidden", "true");
  strip.appendChild(inner);

  return strip;
};

export const initWorks = () => {
  const grid = document.getElementById("works-grid");
  if (!grid) return;
  const reduced = prefersReducedMotion();

  // Insert marquee strip before the grid
  const worksSection = grid.closest(".works");
  if (worksSection) {
    const head = worksSection.querySelector(".works__head");
    const marquee = buildMarquee();
    head.after(marquee);
  }

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("work-card--visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );

  WORKS.forEach((work, i) => {
    const card = document.createElement("article");
    card.className = "work-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `Open study: ${work.title}`);
    // Stagger delays: 0, 0.12, 0.24, 0.36 s
    card.style.setProperty("--reveal-delay", `${i * 0.12}s`);

    const refNum = String(i + 1).padStart(3, "0");
    card.innerHTML = `
      <div class="work-card__frame-wrap">
        <span class="work-card__corner-tl" aria-hidden="true"></span>
        <span class="work-card__corner-br" aria-hidden="true"></span>
        <div class="work-card__frame">
          <canvas width="800" height="600" aria-label="${work.title} — generative artwork"></canvas>
          <span class="work-card__view">VIEW STUDY →</span>
        </div>
      </div>
      <div class="work-card__meta">
        <span class="work-card__ref"><strong>REF ${refNum}</strong> &mdash; ${work.title.toUpperCase()}</span>
        <span class="work-card__info">${work.year}<br>${work.medium}</span>
      </div>`;

    grid.append(card);

    const art = createArtwork(
      card.querySelector("canvas"),
      work.palette,
      i + 1,
    );

    const openCard = () => openLightbox(work, i, createArtwork);
    card.addEventListener("click", openCard);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openCard();
      }
    });

    if (reduced) {
      art.drawOnce();
      card.classList.add("work-card--visible");
      return;
    }

    // Pause canvas when offscreen
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) art.start();
        else art.stop();
      },
      { threshold: 0.05 },
    );
    visibilityObserver.observe(card);

    card.addEventListener("pointerenter", () => art.setBoost(3));
    card.addEventListener("pointerleave", () => art.setBoost(1));
    attachTilt(card);

    // Scroll reveal
    revealObserver.observe(card);
  });
};
