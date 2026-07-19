import * as THREE from "three";
import { PALETTE } from "../config.js";

const makeSoftTexture = () => {
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
  grad.addColorStop(0, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
};

const createMist = (scene, quality, texture) => {
  const sprites = Array.from({ length: quality.mistCount }, (_, i) => {
    const warm = i % 2 === 0;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        color: warm ? PALETTE.mistWarm : PALETTE.mistCool,
        transparent: true,
        opacity: 0.07 + (i % 3) * 0.035,
        depthWrite: false,
      }),
    );
    const spread = 60;
    sprite.position.set(
      (Math.random() - 0.5) * spread,
      0.4 + Math.random() * 3.2,
      -4 - Math.random() * 38,
    );
    const scale = 14 + Math.random() * 18;
    sprite.scale.set(scale, scale * 0.5, 1);
    scene.add(sprite);
    return { sprite, speed: 0.14 + Math.random() * 0.22, spread };
  });

  return (t) => {
    sprites.forEach(({ sprite, speed, spread }, i) => {
      sprite.position.x += speed * 0.016 * (i % 2 === 0 ? 1 : -1);
      if (sprite.position.x > spread / 2) sprite.position.x = -spread / 2;
      if (sprite.position.x < -spread / 2) sprite.position.x = spread / 2;
      sprite.position.y += Math.sin(t * 0.3 + i * 2.1) * 0.0016;
    });
  };
};

// Long soft cloud banks hugging the horizon, lit by the sun.
const CLOUD_TINTS = ["#ffb08a", "#e88a9a", "#b287c9", "#ffc9a1"];

const createClouds = (scene, quality, texture) => {
  const count = quality.small ? 5 : 9;
  const clouds = Array.from({ length: count }, (_, i) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        color: CLOUD_TINTS[i % CLOUD_TINTS.length],
        transparent: true,
        opacity: 0.16 + (i % 3) * 0.07,
        depthWrite: false,
      }),
    );
    sprite.position.set(
      (Math.random() - 0.5) * 160,
      4.5 + Math.random() * 9,
      -58 - Math.random() * 18,
    );
    const w = 26 + Math.random() * 40;
    sprite.scale.set(w, w * (0.14 + Math.random() * 0.1), 1);
    scene.add(sprite);
    return { sprite, speed: 0.05 + Math.random() * 0.09 };
  });

  return (t) => {
    clouds.forEach(({ sprite, speed }, i) => {
      sprite.position.x += speed * 0.016 * (i % 2 === 0 ? 1 : -1);
      if (sprite.position.x > 90) sprite.position.x = -90;
      if (sprite.position.x < -90) sprite.position.x = 90;
    });
  };
};

const createDust = (scene, quality) => {
  const count = quality.dustCount;
  const base = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    base[i * 3] = (Math.random() - 0.5) * 44;
    base[i * 3 + 1] = Math.random() * 11;
    base[i * 3 + 2] = -2 - Math.random() * 40;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(base.slice(), 3));

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: PALETTE.dust,
      size: 0.09,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  );
  scene.add(points);

  return (t) => {
    const attr = geometry.attributes.position;
    for (let i = 0; i < count; i += 1) {
      attr.array[i * 3] = base[i * 3] + Math.sin(t * 0.22 + i * 1.31) * 0.8;
      attr.array[i * 3 + 1] =
        base[i * 3 + 1] + Math.sin(t * 0.35 + i * 0.77) * 0.5;
    }
    attr.needsUpdate = true;
  };
};

// Drifting mist sprites + floating dust particles.
export const createAtmosphere = (scene, quality) => {
  const texture = makeSoftTexture();
  const updateMist = createMist(scene, quality, texture);
  const updateClouds = createClouds(scene, quality, texture);
  const updateDust = createDust(scene, quality);
  return {
    update: (t) => {
      updateMist(t);
      updateClouds(t);
      updateDust(t);
    },
  };
};
