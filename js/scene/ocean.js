import * as THREE from "three";
import { PALETTE, SCENE_LAYOUT } from "../config.js";

const VERTEX = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;

  void main() {
    vUv = uv;
    vec3 p = position;
    // Sum of sines + cross-chop; damped toward the horizon so it stays crisp.
    float nearness = 1.0 - uv.y; // 1 at camera edge, 0 at horizon
    float w =
      sin(p.x * 0.32 + uTime * 0.9) * 0.16 +
      sin(p.x * 0.11 - uTime * 0.45 + p.y * 0.08) * 0.30 +
      sin(p.y * 0.42 + uTime * 0.7) * 0.18 +
      sin((p.x + p.y) * 0.55 - uTime * 1.1) * 0.07;
    p.z += w * smoothstep(0.05, 0.6, nearness);
    vWave = w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uDusk;
  uniform vec3 uDeep;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uFogColor;
  varying vec2 vUv;
  varying float vWave;

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

  void main() {
    float d = vUv.y; // 0 near camera → 1 at horizon

    // Micro-ripples: two octaves of scrolling noise, denser toward horizon.
    vec2 rippleUv = vec2(vUv.x * 60.0, vUv.y * 220.0 - uTime * 0.9);
    float micro = noise(rippleUv) * 0.65 + noise(rippleUv * 2.7 + 13.7) * 0.35;

    vec3 col = mix(uDeep, uHorizon, pow(d, 1.7));
    // Cool sky reflection in the near field keeps the foreground from browning.
    col = mix(col, uSkyColor, (1.0 - d) * 0.22);
    // Ripple shading: darken troughs, lighten crests.
    col *= 0.92 + micro * 0.16;

    // Sun reflection: a shimmering path widening toward the camera.
    float dx = (vUv.x - 0.5) * 2.0;
    float width = mix(0.34, 0.05, d);
    float streak = exp(-(dx * dx) / (width * width * 0.5));
    float ripple = 0.55 + 0.45 * sin(vUv.y * 90.0 + uTime * 2.2 + vWave * 8.0)
                        * sin(vUv.x * 40.0 - uTime * 1.3);
    // The reflection path fades as the sun sets (uDusk follows scroll).
    float sunlight = 1.0 - uDusk * 0.85;
    col += uSunColor * streak * ripple * micro * mix(0.10, 1.35, pow(d, 1.4)) * sunlight;

    // Sparkle glints where ripples catch the sun path.
    float glint = pow(micro, 7.0) * streak * mix(0.3, 2.2, d);
    col += uSunColor * glint * sunlight;

    // Wave shading + horizon haze blend.
    col += vWave * 0.04;
    col = mix(col, uFogColor, smoothstep(0.86, 1.0, d) * 0.85 * (1.0 - uDusk * 0.5));

    // Night falls: pull the whole surface toward a cold indigo.
    col = mix(col, vec3(0.07, 0.05, 0.14), uDusk * 0.55);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export const createOcean = (scene, quality) => {
  const [segX, segY] = quality.oceanSegments;
  const width = 260;
  const depth = Math.abs(SCENE_LAYOUT.horizonZ) + 40;

  const uniforms = {
    uTime: { value: 0 },
    uDusk: { value: 0 },
    uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
    uHorizon: { value: new THREE.Color(PALETTE.waterHorizon) },
    uSunColor: { value: new THREE.Color(PALETTE.sunGlow) },
    uSkyColor: { value: new THREE.Color(PALETTE.skyMid) },
    uFogColor: { value: new THREE.Color(PALETTE.skyHorizon) },
  };

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth, segX, segY),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    }),
  );
  // Lay the plane flat; uv.y === 1 ends up at the far (horizon) edge.
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0, SCENE_LAYOUT.horizonZ / 2 + 12);
  scene.add(mesh);

  return {
    update: (t, scrollProgress = 0) => {
      uniforms.uTime.value = t;
      uniforms.uDusk.value = scrollProgress;
    },
  };
};
