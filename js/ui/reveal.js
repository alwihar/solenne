// Per-word scroll reveal for elements marked with [data-reveal-words].
// Splits text into spans once, then toggles a class via IntersectionObserver.
export const initWordReveals = () => {
  const targets = [...document.querySelectorAll('[data-reveal-words]')];

  targets.forEach((el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    el.append(...words.flatMap((word, i) => {
      const span = document.createElement('span');
      span.className = 'w';
      span.style.setProperty('--wd', `${i * 0.045}s`);
      span.textContent = word;
      return [span, document.createTextNode(' ')];
    }));
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.35 });

  targets.forEach((el) => observer.observe(el));
};
