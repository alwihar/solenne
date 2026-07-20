import { createPreloader } from "./preloader.js";
import { initWordReveals } from "./ui/reveal.js";
import { initWorks } from "./ui/works.js";
import { initContactForm } from "./ui/form.js";
import { initCursorLight } from "./ui/cursorlight.js";
import { prefersReducedMotion } from "./config.js";

const bootScene = async (preloader) => {
  const canvas = document.getElementById("scene");
  try {
    // Fetch the heavy CDN modules in parallel so the preloader stays short.
    const [{ createStage }, { bindSceneToScroll }] = await Promise.all([
      import("./scene/stage.js"),
      import("./scroll.js"),
    ]);
    const stage = await createStage(canvas, {
      onProgress: (p) => preloader.setProgress(p),
    });
    bindSceneToScroll(stage);

    await preloader.complete();
    document.getElementById("hero")?.classList.add("hero--in");
    if (prefersReducedMotion()) stage.settle();
    else stage.play();
  } catch (err) {
    console.error("[solenne] WebGL stage failed, using fallback:", err);
    document.body.classList.add("no-webgl");
    await preloader.complete();
    document.getElementById("hero")?.classList.add("hero--in");
  }
};

const boot = () => {
  // Always start at the top so the preloader + letter drop intro is seen;
  // browser scroll restoration would otherwise jump mid-page after reload.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  const preloader = createPreloader();
  initWordReveals();
  initWorks();
  initContactForm();
  initCursorLight();
  bootScene(preloader);
};

boot();
