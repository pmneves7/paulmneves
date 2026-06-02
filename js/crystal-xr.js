(function (global) {
  "use strict";

  async function startWebXr(options) {
    const renderer = options && options.renderer;
    const scene = options && options.scene;
    const camera = options && options.camera;
    const mode = options && options.mode;
    if (!renderer || !scene || !camera) {
      throw new Error("3D renderer is not ready for XR.");
    }
    if (!navigator.xr) {
      throw new Error("WebXR is not available. Use HTTPS and a WebXR-capable browser.");
    }
    const sessionMode = mode === "ar" ? "immersive-ar" : "immersive-vr";
    const supported = await navigator.xr.isSessionSupported(sessionMode);
    if (!supported) {
      throw new Error(`${String(mode || "xr").toUpperCase()} is not supported on this device or browser.`);
    }
    if (renderer.xr && renderer.xr.isPresenting) {
      return renderer.xr.getSession();
    }

    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local-floor");

    const previousClearAlpha = renderer.getClearAlpha();
    const previousBackground = scene.background;
    if (mode === "ar") {
      renderer.setClearAlpha(0);
      scene.background = null;
    }

    const session = await navigator.xr.requestSession(sessionMode, {
      optionalFeatures: ["local-floor"]
    });

    const endSession = () => {
      renderer.setAnimationLoop(null);
      renderer.setClearAlpha(previousClearAlpha);
      scene.background = previousBackground;
      if (options && typeof options.onSessionEnd === "function") {
        options.onSessionEnd(session);
      }
    };

    session.addEventListener("end", endSession);
    await renderer.xr.setSession(session);

    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

    if (options && typeof options.onSessionStart === "function") {
      options.onSessionStart(session);
    }
    return session;
  }

  global.CrystalXr = { startWebXr };
})(typeof window !== "undefined" ? window : globalThis);
