import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { gsap } from "gsap";
import { PALETTE, LETTERS_TEXT, SCENE_LAYOUT, FONT_URL } from "../config.js";

const LETTER_SIZE = 2.6;
const LETTER_DEPTH = 0.7;
const LETTER_GAP = 0.5;
const MAX_WORD_SCALE = 1.6;
const VIEWPORT_FILL = 0.86;

// Pendulum feel: soft spring, light damping so pushes keep swinging a while.
const PENDULUM_LENGTH = 2.2;
const SPRING_K = 5.5;
const SPRING_DAMP = 0.85;
const MAX_SWING_SPEED = 1.8;
const HOVER_PUSH = 0.14;
const ROTATION_FACTOR = 0.55;

const ROPE_SEGMENTS = 14;
const ROPE_WIDTH = 0.055;
const ROPE_COLOR = "#2b1746";

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

// A rope rendered as a camera-facing ribbon along a quadratic bezier, so it
// can bow and lag behind the letter instead of staying a rigid line.
const createRopeMesh = () => {
  const vertexCount = (ROPE_SEGMENTS + 1) * 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3),
  );
  const indices = [];
  for (let i = 0; i < ROPE_SEGMENTS; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({
    color: ROPE_COLOR,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  // Positions are rewritten every frame; the stale bounding sphere would
  // otherwise get the rope frustum-culled and never drawn.
  mesh.frustumCulled = false;
  return mesh;
};

const updateRope = (rope, anchorX, topY, attachX, attachY, t, phase) => {
  // Control point bows opposite the letter's displacement (rope inertia),
  // plus a faint travelling wave so it never reads as a dead straight line.
  const midX =
    (anchorX + attachX) / 2 +
    (anchorX - attachX) * 0.45 +
    Math.sin(t * 1.3 + phase) * 0.05;
  const midY = (topY + attachY) / 2;
  const half = ROPE_WIDTH / 2;

  const positions = rope.geometry.attributes.position;
  for (let i = 0; i <= ROPE_SEGMENTS; i += 1) {
    const s = i / ROPE_SEGMENTS;
    const inv = 1 - s;
    const bx = inv * inv * anchorX + 2 * inv * s * midX + s * s * attachX;
    const by = inv * inv * topY + 2 * inv * s * midY + s * s * attachY;
    positions.setXYZ(i * 2, bx - half, by, 0);
    positions.setXYZ(i * 2 + 1, bx + half, by, 0);
  }
  positions.needsUpdate = true;
};

// 3D letters hanging on bending ropes. They drop in random order with random
// heights and timing, swing like pendulums (hover gives them a push), and get
// hoisted out of frame on scroll.
export const createLetters = async (scene, quality, onProgress) => {
  const font = await loadFont(onProgress);
  const group = new THREE.Group();
  scene.add(group);

  const meshes = buildLetterMeshes(font, quality);
  const totalWidth =
    meshes.reduce((sum, l) => sum + l.width, 0) +
    LETTER_GAP * (meshes.length - 1);

  const dropSlots = shuffledIndices(meshes.length);

  let cursor = -totalWidth / 2;
  const letters = meshes.map((entry, i) => {
    const x = cursor + entry.width / 2;
    cursor += entry.width + LETTER_GAP;

    entry.mesh.position.set(x, SCENE_LAYOUT.dropFromY, 0);
    group.add(entry.mesh);

    const rope = createRopeMesh();
    group.add(rope);

    return {
      ...entry,
      rope,
      x,
      phase: i * 1.7 + Math.sin(i * 12.9) * 2,
      dropSlot: dropSlots[i],
      state: {
        dropY: SCENE_LAYOUT.dropFromY * (0.75 + Math.random() * 0.7),
        theta: 0, // pendulum angle, integrated manually
        thetaVel: 0,
      },
    };
  });

  group.position.y = SCENE_LAYOUT.lettersY;

  const progress = { lift: 0 }; // 0 = resting, 1 = hoisted out of frame
  let played = false;
  let lastT = 0;

  const play = () => {
    if (played) return;
    played = true;
    letters.forEach((letter) => {
      const delay = 0.05 + letter.dropSlot * 0.14 + Math.random() * 0.4;
      letter.state.theta = (Math.random() - 0.5) * 0.5;
      letter.state.thetaVel = (Math.random() - 0.5) * 1.6;
      gsap.to(letter.state, {
        dropY: 0,
        duration: 1.5 + Math.random() * 0.8,
        delay,
        ease: "elastic.out(1, 0.55)",
      });
    });
  };

  const settle = () => {
    played = true;
    letters.forEach((letter) => {
      Object.assign(letter.state, { dropY: 0, theta: 0, thetaVel: 0 });
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

  // Called by the stage with a raycaster; a hovered letter gets pushed
  // sideways in the direction the pointer is moving.
  const handleHover = (raycaster, pointerVelX) => {
    if (!played || Math.abs(pointerVelX) < 0.001) return;
    const hits = raycaster.intersectObjects(
      letters.map((l) => l.mesh),
      false,
    );
    if (hits.length === 0) return;
    const hit = letters.find((l) => l.mesh === hits[0].object);
    if (!hit) return;
    const push = THREE.MathUtils.clamp(pointerVelX * HOVER_PUSH, -0.5, 0.5);
    hit.state.thetaVel = THREE.MathUtils.clamp(
      hit.state.thetaVel + push,
      -MAX_SWING_SPEED,
      MAX_SWING_SPEED,
    );
  };

  const update = (t, scrollProgress) => {
    const dt = Math.min(Math.max(t - lastT, 0), 0.05);
    lastT = t;
    progress.lift += ((scrollProgress > 0.02 ? 1 : 0) - progress.lift) * 0.04;

    letters.forEach((letter, i) => {
      const { state } = letter;

      // Damped pendulum + gentle wind so the ropes are never frozen.
      const wind = Math.sin(t * 0.45 + letter.phase) * 0.14;
      const accel =
        -SPRING_K * state.theta - SPRING_DAMP * state.thetaVel + wind;
      state.thetaVel += accel * dt;
      state.theta += state.thetaVel * dt;

      const settled = played && Math.abs(state.dropY) < 0.05;
      const bob = settled ? Math.sin(t * 0.9 + letter.phase) * 0.06 : 0;
      const lift = progress.lift * (SCENE_LAYOUT.liftToY + i * 0.7);

      const y = state.dropY + bob + lift;
      const xOff = Math.sin(state.theta) * PENDULUM_LENGTH * 0.42;

      letter.mesh.position.x = letter.x + xOff;
      letter.mesh.position.y = y;
      letter.mesh.rotation.z = state.theta * ROTATION_FACTOR;
      letter.mesh.rotation.y =
        state.theta * 0.25 + Math.sin(t * 0.4 + letter.phase * 1.3) * 0.05;

      updateRope(
        letter.rope,
        letter.x,
        SCENE_LAYOUT.stringTopY,
        letter.x + xOff,
        y + letter.height / 2 - 0.06,
        t,
        letter.phase,
      );
    });
  };

  return { play, settle, update, fitToViewport, handleHover };
};
