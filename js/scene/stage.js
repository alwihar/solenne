import * as THREE from "three";
import { CAMERA, getQuality } from "../config.js";
import { createSky } from "./sky.js";
import { createOcean } from "./ocean.js";
import { createLetters } from "./letters.js";
import { createAtmosphere } from "./atmosphere.js";

// Builds the whole WebGL stage and returns a small control surface:
// { play(), setScrollProgress(t), dispose() }
export const createStage = async (canvas, { onProgress } = {}) => {
  const quality = getQuality();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxDpr));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#3d2258", 30, 140);

  // Soft studio environment so the letters pick up believable reflections.
  const { RoomEnvironment } =
    await import("three/addons/environments/RoomEnvironment.js");
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.06).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    window.innerWidth / window.innerHeight,
    CAMERA.near,
    CAMERA.far,
  );
  camera.position.set(CAMERA.position.x, CAMERA.position.y, CAMERA.position.z);

  onProgress?.(0.15);

  // Lights: warm key from the sun direction + cool ambient + front fill.
  scene.add(new THREE.AmbientLight("#7a5a9a", 1.1));
  const sunLight = new THREE.DirectionalLight("#ffb347", 2.2);
  sunLight.position.set(0, 6, -50);
  scene.add(sunLight);
  const fill = new THREE.DirectionalLight("#ff9a8a", 1.15);
  fill.position.set(6, 9, 22);
  scene.add(fill);

  const sky = createSky(scene);
  const ocean = createOcean(scene, quality);
  const atmosphere = createAtmosphere(scene, quality);
  onProgress?.(0.35);

  const letters = await createLetters(scene, quality, (p) =>
    onProgress?.(0.35 + p * 0.6),
  );
  onProgress?.(1);

  // Mouse parallax (lerped for weight) + velocity for pushing letters around.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, lastTx: 0 };
  const onPointerMove = (e) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    letters.fitToViewport(camera);
  };
  window.addEventListener("resize", onResize);
  letters.fitToViewport(camera);

  const scroll = { progress: 0 };
  const clock = new THREE.Clock();
  let running = true;

  const lookTarget = new THREE.Vector3();
  const renderFrame = () => {
    if (!running) return;
    const t = clock.getElapsedTime();

    pointer.x += (pointer.tx - pointer.x) * 0.045;
    pointer.y += (pointer.ty - pointer.y) * 0.045;
    pointer.vx = pointer.tx - pointer.lastTx;
    pointer.lastTx = pointer.tx;

    const p = scroll.progress;
    camera.position.x = CAMERA.position.x + pointer.x * 0.9;
    camera.position.y = CAMERA.position.y - pointer.y * 0.45 - p * 1.6;
    lookTarget.set(
      CAMERA.lookAt.x + pointer.x * 1.4,
      CAMERA.lookAt.y - pointer.y * 0.6 - p * 2.2,
      CAMERA.lookAt.z,
    );
    camera.lookAt(lookTarget);

    if (pointer.vx !== 0) {
      pointerNdc.set(pointer.tx, -pointer.ty);
      raycaster.setFromCamera(pointerNdc, camera);
      letters.handleHover(raycaster, pointer.vx * 60); // ~per-second velocity
    }

    sky.update(t, p);
    ocean.update(t);
    atmosphere.update(t);
    letters.update(t, p);

    renderer.render(scene, camera);
    requestAnimationFrame(renderFrame);
  };
  requestAnimationFrame(renderFrame);

  return {
    play: () => letters.play(),
    settle: () => letters.settle(),
    setScrollProgress: (v) => {
      scroll.progress = v;
    },
    dispose: () => {
      running = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    },
  };
};
