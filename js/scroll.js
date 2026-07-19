import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from './config.js';

gsap.registerPlugin(ScrollTrigger);

// Feeds hero scroll progress (0..1 over the first ~1.2 viewports) into the
// 3D stage so letters lift away and the camera dips as content scrolls over.
export const bindSceneToScroll = (stage) => {
  if (prefersReducedMotion()) return;

  const state = { p: 0 };
  gsap.to(state, {
    p: 1,
    ease: 'none',
    onUpdate: () => stage.setScrollProgress(state.p),
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: '+=120%',
      scrub: 0.6,
    },
  });

  // Hero DOM copy fades out early in the scroll.
  gsap.to('.hero__tagline, .hero__scroll-hint, .hero__kicker', {
    opacity: 0,
    y: -30,
    ease: 'none',
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: '+=45%',
      scrub: true,
    },
  });
};
