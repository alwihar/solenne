import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { gsap } from "gsap";
import { PALETTE, LETTERS_TEXT, SCENE_LAYOUT, FONT_URL } from "../config.js";

const LETTER_SIZE = 2.6;
const LETTER_DEPTH = 0.7;
const LETTER_GAP = 0.5;
const ROPE_RADIUS = 0.024;
const MAX_WORD_SCALE = 1.6;
const VIEWPORT_FILL = 0.86;

const loadFont = (onProgress) =>
  new Promise((resolve, reject) => {
    new FontLoader().load(
      FONT_URL,
      resolve,
      (e) => {
        if (e.total) onProgress?.(e.loaded / e.total);
      },
      () => reject(new Error(`Failed to load 3D letter font from ${FONT_URL}`)),
    );
  });

const buildLetterMeshes = (font, quality) => {
  const material = new THREE.MeshStandardMaterial({
    color: PALETTE.letter,
    roughness: 0.22,
    metalness: 0.55,
    envMapIntensity: 1.1,
  });

  return [...LETTERS_TEXT].map((char) => {
    const geometry = new TextGeometry(char, {
      font,
      size: LETTER_SIZE,
      height: LETTER_DEPTH,
      curveSegments: quality.letterCurveSegments,
      bevelEnabled: true,
      bevelThickness: 0.055,
      bevelSize: 0.042,
      bevelSegments: quality.letterBevelSegments,
    });
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    // Center each glyph on its own origin so rotation/sway pivots feel right.
    geometry.translate(
      -(bb.min.x + bb.max.x) / 2,
      -(bb.min.y + bb.max.y) / 2,
      -(bb.min.z + bb.max.z) / 2,
    );
    const mesh = new THREE.Mesh(geometry, material);
    const width = bb.max.x - bb.min.x;
    const height = bb.max.y - bb.min.y;
    return { char, mesh, width, height };
  });
};

// Fisher–Yates over a copy: gives each letter a random drop slot.
const shuffledIndices = (count) => {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
};

// 3D letters hanging on ropes. They drop in random order like crates on
// winches — fall, get caught, overshoot, swing — then sway idly.
// On scroll they get hoisted back out of frame.
export const createLetters = async (scene, quality, onProgress) => {
  const font = await loadFont(onProgress);
  const group = new THREE.Group();
  scene.add(group);

  const meshes = buildLetterMeshes(font, quality);
  const totalWidth =
    meshes.reduce((sum, l) => sum + l.width, 0) +
    LETTER_GAP * (meshes.length - 1);

  const ropeMaterial = new THREE.MeshStandardMaterial({
    color: "#2b1746",
    roughness: 0.9,
    metalness: 0.05,
  });
  const ropeGeometry = new THREE.CylinderGeometry(
    ROPE_RADIUS,
    ROPE_RADIUS,
    1,
    6,
  );

  const dropSlots = shuffledIndices(meshes.length);

  let cursor = -totalWidth / 2;
  const letters = meshes.map((entry, i) => {
    const x = cursor + entry.width / 2;
    cursor += entry.width + LETTER_GAP;

    entry.mesh.position.set(x, 0, 0);
    group.add(entry.mesh);

    const rope = new THREE.Mesh(ropeGeometry, ropeMaterial);
    rope.position.x = x;
    group.add(rope);

    return {
      ...entry,
      rope,
      x,
      phase: i * 1.7 + Math.sin(i * 12.9) * 2,
      dropSlot: dropSlots[i],
      state: {
        dropY: SCENE_LAYOUT.dropFromY, // gsap animates these three
        swing: (Math.random() - 0.5) * 0.9,
        twist: (Math.random() - 0.5) * 0.7,
      },
    };
  });

  group.position.y = SCENE_LAYOUT.lettersY;

  const progress = { lift: 0 }; // 0 = resting, 1 = hoisted out of frame
  let played = false;

  const play = () => {
    if (played) return;
    played = true;
    letters.forEach((letter) => {
      const delay = 0.05 + letter.dropSlot * 0.13 + Math.random() * 0.07;
      gsap.to(letter.state, {
        dropY: 0,
        duration: 1.7 + Math.random() * 0.4,
        delay,
        ease: "elastic.out(1, 0.55)",
      });
      gsap.to(letter.state, {
        swing: 0,
        twist: 0,
        duration: 2.6,
        delay: delay + 0.2,
        ease: "elastic.out(1, 0.25)",
      });
    });
  };

  const settle = () => {
    played = true;
    letters.forEach((letter) => {
      Object.assign(letter.state, { dropY: 0, swing: 0, twist: 0 });
    });
  };

  const fitToViewport = (camera) => {
    // Fill most of the viewport width, like the reference site.
    const dist = camera.position.z; // group sits near z=0
    const visibleH =
      2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visibleW = visibleH * camera.aspect;
    const scale = Math.min(
      MAX_WORD_SCALE,
      (visibleW * VIEWPORT_FILL) / totalWidth,
    );
    group.scale.setScalar(scale);
  };

  const update = (t, scrollProgress) => {
    progress.lift += ((scrollProgress > 0.02 ? 1 : 0) - progress.lift) * 0.04;

    letters.forEach((letter, i) => {
      const settled = played && Math.abs(letter.state.dropY) < 0.05;
      const sway = settled ? Math.sin(t * 0.9 + letter.phase) * 0.07 : 0;
      const lift = progress.lift * (SCENE_LAYOUT.liftToY + i * 0.7);
      const y = letter.state.dropY + sway + lift;

      letter.mesh.position.y = y;
      letter.mesh.rotation.z =
        letter.state.swing + Math.sin(t * 0.6 + letter.phase) * 0.024;
      letter.mesh.rotation.y =
        letter.state.twist + Math.sin(t * 0.4 + letter.phase * 1.3) * 0.05;

      // Stretch the rope from the winch point down to the letter's top edge.
      const attachY = y + letter.height / 2;
      const length = Math.max(SCENE_LAYOUT.stringTopY - attachY, 0.1);
      letter.rope.position.y = attachY + length / 2;
      letter.rope.scale.y = length;
    });
  };

  return { play, settle, update, fitToViewport };
};
