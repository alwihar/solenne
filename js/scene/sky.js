import * as THREE from 'three';
import { PALETTE, SCENE_LAYOUT } from '../config.js';

const makeGradientTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, PALETTE.skyTop);
  grad.addColorStop(0.52, PALETTE.skyMid);
  grad.addColorStop(0.78, PALETTE.skyHorizon);
  grad.addColorStop(1.0, '#ffb98a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const makeGlowTexture = () => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 214, 160, 0.85)');
  grad.addColorStop(0.35, 'rgba(255, 148, 94, 0.35)');
  grad.addColorStop(1, 'rgba(255, 122, 89, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
};

// Gradient backdrop plane + sun disc + additive glow sprite.
export const createSky = (scene) => {
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 240),
    new THREE.MeshBasicMaterial({ map: makeGradientTexture(), fog: false }),
  );
  backdrop.position.set(0, 58, SCENE_LAYOUT.horizonZ - 60);
  scene.add(backdrop);

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(SCENE_LAYOUT.sunRadius, 48),
    new THREE.MeshBasicMaterial({ color: PALETTE.sunCore, fog: false }),
  );
  sun.position.set(0, SCENE_LAYOUT.sunY, SCENE_LAYOUT.horizonZ);
  scene.add(sun);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: PALETTE.sunGlow,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  }));
  glow.scale.setScalar(SCENE_LAYOUT.sunRadius * 7);
  glow.position.copy(sun.position);
  glow.position.z += 1;
  scene.add(glow);

  const baseSunY = SCENE_LAYOUT.sunY;
  return {
    update: (t, scrollProgress = 0) => {
      // The sun slowly sinks as you scroll away from the hero.
      const y = baseSunY - scrollProgress * 2.4;
      sun.position.y = y;
      glow.position.y = y;
      const pulse = 1 + Math.sin(t * 0.6) * 0.02;
      glow.scale.setScalar(SCENE_LAYOUT.sunRadius * 7 * pulse);
    },
  };
};
