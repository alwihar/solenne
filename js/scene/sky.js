import * as THREE from "three";
import { PALETTE, SCENE_LAYOUT } from "../config.js";

const makeGradientTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, PALETTE.skyTop);
  grad.addColorStop(0.52, PALETTE.skyMid);
  grad.addColorStop(0.78, PALETTE.skyHorizon);
  grad.addColorStop(1.0, "#ffb98a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const makeGlowTexture = () => {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, "rgba(255, 214, 160, 0.85)");
  grad.addColorStop(0.35, "rgba(255, 148, 94, 0.35)");
  grad.addColorStop(1, "rgba(255, 122, 89, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
};

// Textured sun: bright core → warm limb, fbm granulation, drifting
// horizontal atmosphere bands, soft edge.
const SUN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y);
  }
  float fbm(vec2 p) {
    return noise(p) * 0.6 + noise(p * 2.3 + 7.7) * 0.3 + noise(p * 5.1 + 19.3) * 0.1;
  }

  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float r = length(c);

    // Clean radial falloff: white-hot core -> golden mid -> deep amber limb.
    vec3 core = vec3(1.0, 0.985, 0.94);
    vec3 mid = vec3(1.0, 0.86, 0.55);
    vec3 edge = vec3(1.0, 0.62, 0.36);
    vec3 col = mix(core, mid, smoothstep(0.0, 0.72, r));
    col = mix(col, edge, smoothstep(0.62, 1.0, r));

    // Barely-there large-scale breathing (no blotches at big sizes).
    float breath = fbm(vUv * 2.2 + vec2(uTime * 0.008, 0.0));
    col *= 0.985 + breath * 0.03;

    // Soft atmosphere bands, lower third only, drifting slowly.
    float band = sin(vUv.y * 20.0 + fbm(vUv * 1.8) * 2.5 - uTime * 0.05);
    float bandMask = (band * 0.5 + 0.5) * smoothstep(0.5, 0.05, vUv.y);
    col *= 1.0 - bandMask * 0.1;

    // Hot rim just inside the edge.
    float rim = smoothstep(0.85, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
    col += vec3(1.0, 0.7, 0.4) * rim * 0.12;

    float alpha = 1.0 - smoothstep(0.965, 1.0, r);
    gl_FragColor = vec4(col, alpha);
  }
`;

const SUN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// How far the sun travels down as you scroll: fully below the sea at p=1.
const SUNSET_TRAVEL = SCENE_LAYOUT.sunY + SCENE_LAYOUT.sunRadius + 1.5;

// Gradient backdrop + textured sun disc + additive glow + dusk overlay.
export const createSky = (scene) => {
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 240),
    new THREE.MeshBasicMaterial({ map: makeGradientTexture(), fog: false }),
  );
  backdrop.position.set(0, 58, SCENE_LAYOUT.horizonZ - 60);
  scene.add(backdrop);

  // Darkens the sky as the sun sets (driven by scroll).
  const dusk = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 240),
    new THREE.MeshBasicMaterial({
      color: "#0a0620",
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    }),
  );
  dusk.position.set(0, 58, SCENE_LAYOUT.horizonZ - 59);
  scene.add(dusk);

  const sunUniforms = { uTime: { value: 0 } };
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(SCENE_LAYOUT.sunRadius, 64),
    new THREE.ShaderMaterial({
      uniforms: sunUniforms,
      vertexShader: SUN_VERTEX,
      fragmentShader: SUN_FRAGMENT,
      transparent: true,
      fog: false,
    }),
  );
  sun.position.set(0, SCENE_LAYOUT.sunY, SCENE_LAYOUT.horizonZ);
  scene.add(sun);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: PALETTE.sunGlow,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  glow.scale.setScalar(SCENE_LAYOUT.sunRadius * 7);
  glow.position.copy(sun.position);
  glow.position.z += 1;
  scene.add(glow);

  return {
    update: (t, scrollProgress = 0) => {
      const p = scrollProgress;
      sunUniforms.uTime.value = t;

      // The sun slides into the sea as you scroll; its glow fades with it.
      const y = SCENE_LAYOUT.sunY - p * SUNSET_TRAVEL;
      sun.position.y = y;
      glow.position.y = Math.max(y, 0.4);
      glow.material.opacity = 1 - p * 0.8;
      dusk.material.opacity = p * 0.5;

      const pulse = 1 + Math.sin(t * 0.6) * 0.02;
      glow.scale.setScalar(SCENE_LAYOUT.sunRadius * 7 * pulse * (1 - p * 0.35));
    },
  };
};
