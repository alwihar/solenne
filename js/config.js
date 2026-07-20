// Shared design + quality constants. Everything tweakable lives here.

export const PALETTE = Object.freeze({
  skyTop: "#140f38",
  skyMid: "#5b2a66",
  skyHorizon: "#ff7a59",
  sunCore: "#ffe4b8",
  sunGlow: "#ff9a5c",
  waterDeep: "#2a1a58",
  waterShallow: "#b0486188", // hex w/ alpha stripped in shader use
  waterHorizon: "#e86a52",
  letter: "#fff1df",
  mistWarm: "#ffc4a8",
  mistCool: "#b8a6d9",
  dust: "#ffd9a8",
});

export const LETTERS_TEXT = "SOLENNE";

const isSmallScreen = () => window.matchMedia("(max-width: 768px)").matches;

// Immutable quality tier chosen once at boot.
export const getQuality = () => {
  const small = isSmallScreen();
  return Object.freeze({
    small,
    maxDpr: small ? 1.5 : 2,
    oceanSegments: small ? [96, 48] : [160, 80],
    mistCount: small ? 6 : 12,
    dustCount: small ? 120 : 280,
    letterCurveSegments: small ? 6 : 10,
    letterBevelSegments: small ? 2 : 4,
  });
};

export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const CAMERA = Object.freeze({
  fov: 55,
  near: 0.1,
  far: 300,
  position: Object.freeze({ x: 0, y: 2.6, z: 14 }),
  lookAt: Object.freeze({ x: 0, y: 2.4, z: 0 }),
});

export const SCENE_LAYOUT = Object.freeze({
  horizonZ: -70,
  sunY: 3.4,
  sunRadius: 7,
  lettersY: 2.9, // resting baseline for letter group
  stringTopY: 13, // where the strings vanish above the frame
  dropFromY: 4.2, // hang height before dropping — low enough to be visible in frame
  liftToY: 12, // how far letters rise when scrolled away
});

export const FONT_URL =
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json";
