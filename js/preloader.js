// Preloader overlay: blends real load progress with a gentle fake ramp so the
// counter always moves, then resolves when both hit 100%.
export const createPreloader = () => {
  const root = document.getElementById('preloader');
  const counter = document.getElementById('preloader-count');
  if (!root || !counter) {
    return { setProgress: () => {}, complete: () => Promise.resolve() };
  }

  let real = 0;
  let shown = 0;
  let rafId = 0;

  const tick = () => {
    const target = Math.max(real * 100, Math.min(shown + 0.6, 92));
    shown = Math.min(100, shown + (target - shown) * 0.08 + 0.12);
    counter.textContent = String(Math.floor(shown));
    if (shown < 99.5) rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    setProgress: (value) => { real = Math.max(real, Math.min(1, value)); },
    complete: () => new Promise((resolve) => {
      real = 1;
      const finish = () => {
        cancelAnimationFrame(rafId);
        counter.textContent = '100';
        root.classList.add('preloader--done');
        setTimeout(resolve, 500); // let the fade get going before scene plays
      };
      // Give the counter a beat to visually reach 100.
      const wait = () => (shown > 96 ? finish() : setTimeout(wait, 60));
      wait();
    }),
  };
};
