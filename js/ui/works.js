import { prefersReducedMotion } from '../config.js';

const WORKS = Object.freeze([
  {
    title: 'Ember Tide',
    year: '2026',
    medium: 'WEBGL SIMULATION',
    palette: ['#1a1440', '#ff7a59', '#ffb347', '#ff8fa3'],
  },
  {
    title: 'Salt Cathedral',
    year: '2025',
    medium: 'RAYMARCHED STILL',
    palette: ['#10254a', '#4fc3c8', '#f6ecdf', '#7a5a9a'],
  },
  {
    title: 'Midnight Bloom',
    year: '2025',
    medium: 'PARTICLE STUDY',
    palette: ['#221a33', '#b04861', '#ff8fa3', '#5b2a66'],
  },
  {
    title: 'Helios Drift',
    year: '2024',
    medium: 'GENERATIVE FILM',
    palette: ['#2c1650', '#ffb347', '#e86a52', '#ffe4b8'],
  },
]);

const TILT_MAX_DEG = 5;

// Slowly orbiting radial-gradient blobs — every card is live, no images.
const createArtwork = (canvas, palette, seed) => {
  const ctx = canvas.getContext('2d');
  const blobs = palette.slice(1).flatMap((color, i) => [
    { color, r: 0.55 + i * 0.12, speed: 0.11 + i * 0.05, phase: seed + i * 2.4 },
    { color, r: 0.30 + i * 0.09, speed: 0.16 + i * 0.04, phase: seed * 1.7 + i * 4.1 },
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
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    blobs.forEach((blob) => {
      const cx = w * (0.5 + 0.38 * Math.sin(t * blob.speed + blob.phase));
      const cy = h * (0.5 + 0.36 * Math.cos(t * blob.speed * 1.31 + blob.phase * 1.9));
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
    start: () => { if (!raf) raf = requestAnimationFrame(draw); },
    stop: () => { cancelAnimationFrame(raf); raf = 0; },
    setBoost: (v) => { speedBoost = v; },
    drawOnce: () => draw(performance.now()) || cancelAnimationFrame(raf) || (raf = 0),
  };
};

const attachTilt = (card) => {
  const onMove = (e) => {
    const rect = card.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform =
      `perspective(900px) rotateY(${nx * TILT_MAX_DEG}deg) rotateX(${-ny * TILT_MAX_DEG}deg) translateY(-4px)`;
  };
  const onLeave = () => { card.style.transform = ''; };
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerleave', onLeave);
};

export const initWorks = () => {
  const grid = document.getElementById('works-grid');
  if (!grid) return;
  const reduced = prefersReducedMotion();

  WORKS.forEach((work, i) => {
    const card = document.createElement('article');
    card.className = 'work-card';
    card.innerHTML = `
      <div class="work-card__frame">
        <canvas width="800" height="600" aria-label="${work.title} — generative artwork"></canvas>
        <span class="work-card__view">VIEW STUDY →</span>
      </div>
      <div class="work-card__meta">
        <span class="work-card__index">0${i + 1}</span>
        <h3 class="work-card__title">${work.title}</h3>
        <span class="work-card__info">${work.year}<br>${work.medium}</span>
      </div>`;
    grid.append(card);

    const art = createArtwork(card.querySelector('canvas'), work.palette, i + 1);

    if (reduced) {
      art.drawOnce();
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) art.start(); else art.stop();
    }, { threshold: 0.05 });
    observer.observe(card);

    card.addEventListener('pointerenter', () => art.setBoost(3));
    card.addEventListener('pointerleave', () => art.setBoost(1));
    attachTilt(card);
  });
};
