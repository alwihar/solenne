import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { gsap } from "gsap";
import { PALETTE, LETTERS_TEXT, SCENE_LAYOUT, FONT_URL } from "../config.js";

const LETTER_SIZE = 2.6;
const LETTER_DEPTH = 0.7;
const LETTER_GAP = 0.4;
const MAX_WORD_SCALE = 1.85;
const VIEWPORT_FILL = 0.92;

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

const STRAND_COLOR = ROPE_COLOR; // continuation of the hanging rope
const STRAND_RADIUS = ROPE_WIDTH / 2; // 0.0275 — tube diameter matches rope ribbon width

// Drape directions for each letter of "SOLENNE" (indexes 0-6).
// Inner arrays list the dir (+1 right, -1 left) for each strand on that letter.
// "L" (index 2) gets one left-draping strand only — nothing floats in the empty
// right side of the glyph.  "O" and "E" (indexes 1, 3) each include a
// left-draping strand.  All other letters get one or two strands.
const STRAND_PLAN = [
  [1], // 0 S  — single right
  [-1, 1], // 1 O  — left then right
  [-1], // 2 L  — single left (open right side stays clear)
  [-1], // 3 E  — single left
  [1], // 4 N  — single right
  [-1, 1], // 5 N  — left then right
  [1, -1], // 6 E  — right then left
];

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

// Thread strand that reads as a continuation of the hanging rope: it starts
// at the rope's attachment point on the letter top (0, height/2-0.06, 0),
// arcs over the top-front corner onto the face, then drapes in a lazy S-curve
// and ends in a short drooping tail near one side/bottom edge.
//
// opts.dir — optional forced drape direction: 1 (right) or -1 (left).
//            When omitted a random direction is chosen.
const buildStrand = (width, height, depth, opts = {}) => {
  const seed = Math.random() * 10;
  // Direction the strand drapes across the face: left (-1) or right (+1).
  const dir = opts.dir !== undefined ? opts.dir : Math.random() > 0.5 ? 1 : -1;

  // Z of points lying on the front face, clearing the bevel.
  const faceZ = depth / 2 + 0.15;

  // Attachment point on the letter top in letter-local space.
  const attachY = height / 2 - 0.06;

  // Clamping bounds for on-face (S-curve) points.
  const xMin = -width / 2 + 0.1;
  const xMax = width / 2 - 0.1;
  const yMin = -height / 2 + 0.15; // lowest allowed on-face y
  // yMax for face is attachY (the top attachment), enforced naturally.

  // Scale yDrop so the S-curve's lowest on-face point lands near mid-face
  // (y ≈ 0 ± ~0.3). Derivation: point 5 sits at attachY - yDrop*2.1, so
  // yDrop = attachY/2.1 keeps point 5 right at y=0. A ±15% random jitter
  // adds variety without pushing the strand below the glyph.
  const yDropBase = attachY / 2.1;
  const yDrop = yDropBase * (0.85 + Math.random() * 0.3);

  // x at which the curve starts arcing (slight offset toward the drape side).
  const xStart = THREE.MathUtils.clamp(dir * width * 0.1, xMin, xMax);
  // x where the last on-face point sits — close to but not past the edge.
  const xFaceEnd = THREE.MathUtils.clamp(dir * (width * 0.42), xMin, xMax);
  // The tail is allowed to exit the glyph by at most 0.15 in x.
  const xTailExit = dir * (width / 2 + 0.08);

  // Helper: clamp a candidate x to on-face bounds.
  const cx = (x) => THREE.MathUtils.clamp(x, xMin, xMax);
  // Helper: clamp a candidate y to on-face bounds.
  const cy = (y) => THREE.MathUtils.clamp(y, yMin, attachY);

  // Point 0: at the rope attachment, still on the letter top face (z ~ 0).
  // Point 1: just above the top-front corner — x nudged toward drape side,
  //           z starting to move forward.
  // Points 2-5: on the front face, sweeping across and downward in an S.
  // Points 6-7: drooping tail — exits glyph by at most 0.15 in x, droops
  //             at most 0.45 below the exit y.
  const exitY = cy(attachY - yDrop * 2.1 + Math.sin(seed * 0.9) * 0.06);

  const points = [
    // 0 — rope attachment (top surface, z≈0)
    new THREE.Vector3(0, attachY, 0),
    // 1 — transition over the top-front corner
    new THREE.Vector3(xStart * 0.4, attachY - 0.04, faceZ * 0.55),
    // 2 — arrive on the face just below the top edge
    new THREE.Vector3(
      cx(xStart * 0.7),
      cy(attachY - 0.14 + Math.sin(seed) * 0.06),
      faceZ,
    ),
    // 3 — mid-face, S inflection point (drifts toward the far side)
    new THREE.Vector3(
      cx(dir * width * 0.18 + Math.sin(seed * 1.7) * 0.1),
      cy(attachY - yDrop + Math.sin(seed * 2.3) * 0.1),
      faceZ + Math.sin(seed * 3.1) * 0.03,
    ),
    // 4 — lower on the face, S curve continues toward the far side
    new THREE.Vector3(
      cx(dir * width * 0.32 + Math.sin(seed * 2.9) * 0.08),
      cy(attachY - yDrop * 1.6 + Math.sin(seed * 1.1) * 0.08),
      faceZ + Math.sin(seed * 4.3) * 0.03,
    ),
    // 5 — reaching toward the far edge (still on face)
    new THREE.Vector3(xFaceEnd, exitY, faceZ),
    // 6 — tail begins just past the side edge, starts drooping
    new THREE.Vector3(xTailExit, exitY - 0.08, faceZ),
    // 7 — tail end; droops at most 0.45 below exit point
    new THREE.Vector3(
      xTailExit - dir * 0.06,
      exitY - 0.15 - Math.random() * 0.3,
      faceZ + 0.04,
    ),
  ];

  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, 32, STRAND_RADIUS, 5);
  const material = new THREE.MeshBasicMaterial({
    color: STRAND_COLOR,
    transparent: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
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

    // Use the deterministic per-letter strand plan (falls back to [1] if the
    // word is ever longer than STRAND_PLAN).  Shape randomness (seed, yDrop,
    // etc.) is still handled inside buildStrand — only count and direction are
    // fixed here.
    const dirs = STRAND_PLAN[i] ?? [1];
    dirs.forEach((dir) => {
      entry.mesh.add(
        buildStrand(entry.width, entry.height, LETTER_DEPTH, { dir }),
      );
    });

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
        yank: 0, // extra y offset from click dip animation
        spin: 0, // extra Y-rotation from click spin animation
        spinTarget: 0, // accumulated spin target (not animated by gsap directly)
      },
    };
  });

  group.position.y = SCENE_LAYOUT.lettersY;

  const progress = { lift: 0 }; // 0 = resting, 1 = hoisted out of frame
  let played = false;
  let reducedMotion = false; // set true by settle(); disables re-drop on scroll
  let lastT = 0;

  // Randomise a single letter's swing state and start its drop tween.
  // Extracted so play() and the re-drop path share identical logic.
  //
  // Two-phase drop:
  //   1. Free fall  — accelerating power3.in from the random start height down
  //      PAST the resting point to a small overshoot, duration scaled by
  //      fall distance so higher letters spend longer in the air.
  //   2. Rope catch — elastic.out from the overshoot back to rest (dropY = 0),
  //      duration randomised in [1.6, 2.0] s.  A hard catch jolts the letter
  //      sideways, so thetaVel is bumped a little more than before (±1.8).
  const dropLetter = (letter) => {
    const { state } = letter;
    const startHeight = SCENE_LAYOUT.dropFromY * (0.85 + Math.random() * 0.35);
    state.dropY = startHeight;
    state.yank = 0;
    state.spin = 0;
    state.spinTarget = 0;
    state.theta = (Math.random() - 0.5) * 0.5;
    state.thetaVel = (Math.random() - 0.5) * 1.8;
    // Wider stagger so each letter's fall reads on its own.
    const delay = 0.05 + letter.dropSlot * 0.22 + Math.random() * 0.5;
    const overshoot = -(0.7 + Math.random() * 0.5);
    // Long enough that the slow start → acceleration is visible in frame.
    const fallDuration = 0.55 + startHeight * 0.16;
    const settleDuration = 1.6 + Math.random() * 0.4;
    gsap.killTweensOf(state);
    gsap
      .timeline({ delay })
      .to(state, {
        dropY: overshoot,
        duration: fallDuration,
        ease: "power3.in",
      })
      .to(state, {
        dropY: 0,
        duration: settleDuration,
        ease: "elastic.out(1, 0.32)",
      });
  };

  const play = () => {
    if (played) return;
    played = true;
    letters.forEach(dropLetter);
  };

  const settle = () => {
    reducedMotion = true;
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

  // Resolve a raycaster hit (recursive, for strand children) to a top-level
  // letter object, or null if the hit belongs to a rope or nothing.
  const letterFromHit = (hit) => {
    // Direct hit on a letter mesh.
    const direct = letters.find((l) => l.mesh === hit.object);
    if (direct) return direct;
    // Hit on a child strand — walk up to the parent letter mesh.
    const byParent = letters.find((l) => l.mesh === hit.object.parent);
    return byParent ?? null;
  };

  // Click handler: yank the letter down then spring it back, add a full spin,
  // and kick the pendulum. Returns true when a letter was hit.
  const handleClick = (raycaster) => {
    if (!played) return false;
    const hits = raycaster.intersectObjects(
      letters.map((l) => l.mesh),
      true, // recursive — also tests strand children
    );
    if (hits.length === 0) return false;
    const letter = letterFromHit(hits[0]);
    if (!letter) return false;
    const { state } = letter;

    // Yank: kill existing yank tween, dip down then elastic return.
    gsap.killTweensOf(state, "yank");
    gsap.to(state, { yank: -0.85, duration: 0.14, ease: "power2.out" });
    gsap.to(state, {
      yank: 0,
      duration: 1.6,
      delay: 0.14,
      ease: "elastic.out(1, 0.3)",
    });

    // Spin: accumulate a full turn and tween spin toward the new target.
    gsap.killTweensOf(state, "spin");
    state.spinTarget += Math.PI * 2;
    gsap.to(state, {
      spin: state.spinTarget,
      duration: 1.4,
      ease: "back.out(1.4)",
      overwrite: false,
    });

    // Small random swing kick for tactile feel.
    state.thetaVel += (Math.random() - 0.5) * 1.2;

    return true;
  };

  // Returns true if the ray is over any letter (or its child strands).
  // Used by stage.js to set the pointer cursor cheaply inside the hover block.
  const hitTest = (raycaster) => {
    const hits = raycaster.intersectObjects(
      letters.map((l) => l.mesh),
      true,
    );
    return hits.length > 0 && letterFromHit(hits[0]) !== null;
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

    // Re-drop when the user scrolls back to the top after a full hoist —
    // unless reduced-motion settle() was used (that path skips re-drop).
    if (
      !reducedMotion &&
      progress.lift > 0.9 &&
      scrollProgress < 0.02 &&
      played
    ) {
      progress.lift = 0;
      played = false;
      letters.forEach((letter) => {
        gsap.killTweensOf(letter.state);
      });
      play();
    } else {
      progress.lift += ((scrollProgress > 0.02 ? 1 : 0) - progress.lift) * 0.04;
    }

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

      const y = state.dropY + bob + lift + state.yank;
      const xOff = Math.sin(state.theta) * PENDULUM_LENGTH * 0.42;

      letter.mesh.position.x = letter.x + xOff;
      letter.mesh.position.y = y;
      letter.mesh.rotation.z = state.theta * ROTATION_FACTOR;
      letter.mesh.rotation.y =
        state.theta * 0.25 +
        Math.sin(t * 0.4 + letter.phase * 1.3) * 0.05 +
        state.spin;

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

  return {
    play,
    settle,
    update,
    fitToViewport,
    handleHover,
    handleClick,
    hitTest,
  };
};
