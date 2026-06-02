(function () {
  "use strict";

  const status = document.getElementById("share-status");
  const canvas = document.getElementById("shared-crystal-canvas");
  let sceneData = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let root = null;
  let ambientLight = null;
  let directionalLight = null;
  let lightTarget = null;
  let yaw = 0;
  let pitch = 0;
  let zoom = 1;
  let drag = null;
  let pinch = null;
  const activePointers = new Map();

  const DEFAULT_LIGHTING = {
    intensity: 2,
    color: "#ffffff",
    azimuth: 140,
    elevation: 30,
    ambient: 0.25
  };

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function parseShareLocation() {
    const raw = window.location.hash.slice(1);
    if (!raw || raw.startsWith("data=")) {
      const params = new URLSearchParams(raw);
      return {
        token: params.get("data") || "",
        xr: params.get("xr") || ""
      };
    }
    const xrMatch = raw.match(/&xr=(ar|vr)$/);
    return {
      token: xrMatch ? raw.slice(0, xrMatch.index) : raw,
      xr: xrMatch ? xrMatch[1] : ""
    };
  }

  function setFullViewerLink(token) {
    const link = document.getElementById("share-edit-full-viewer");
    if (!link || !token) return;
    link.href = `crystal-viewer.html#state=${token}`;
  }

  function vec(point) {
    if (Array.isArray(point)) return new THREE.Vector3(point[0] || 0, point[1] || 0, point[2] || 0);
    return new THREE.Vector3(point.x || 0, point.y || 0, point.z || 0);
  }

  function sceneFit(data) {
    const points = [];
    (data.atoms || []).forEach((atom) => points.push(vec(atom.pos)));
    (data.bonds || []).forEach((bond) => {
      points.push(vec(bond.a));
      points.push(vec(bond.b));
    });
    (data.edges || []).forEach((edge) => {
      points.push(vec(edge.a));
      points.push(vec(edge.b));
    });
    if (!points.length) return { center: new THREE.Vector3(), scale: 1 };
    const box = new THREE.Box3().setFromPoints(points);
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(1, ...points.map((point) => point.distanceTo(center)));
    return { center, scale: 2 / radius };
  }

  function fitPoint(point, fit) {
    return vec(point).sub(fit.center).multiplyScalar(fit.scale);
  }

  function sceneMaterial() {
    return (sceneData && sceneData.material) || {};
  }

  function material(color, line) {
    const mat = sceneMaterial();
    if (line) return new THREE.MeshBasicMaterial({ color, depthTest: true, depthWrite: true });
    if (mat.unlit) {
      return new THREE.MeshStandardMaterial({
        color,
        roughness: 1,
        metalness: 0,
        flatShading: true
      });
    }
    return new THREE.MeshStandardMaterial({
      color,
      roughness: mat.roughness == null ? 0.9 : mat.roughness,
      metalness: mat.metallic == null ? 0 : mat.metallic
    });
  }

  function lightDirection() {
    const settings = (sceneData && sceneData.lighting) || DEFAULT_LIGHTING;
    if (window.CrystalModel && typeof window.CrystalModel.cameraRelativeLightDirection === "function") {
      const dir = window.CrystalModel.cameraRelativeLightDirection(settings);
      return new THREE.Vector3(dir[0], dir[1], dir[2]);
    }
    return new THREE.Vector3(0, 0, 1);
  }

  function updateLights() {
    if (!directionalLight || !lightTarget) return;
    const settings = (sceneData && sceneData.lighting) || DEFAULT_LIGHTING;
    const dir = lightDirection();
    directionalLight.position.copy(dir).multiplyScalar(5);
    lightTarget.position.set(0, 0, 0);
    directionalLight.intensity = Number(settings.intensity) || 2;
    directionalLight.color.set(settings.color || "#ffffff");
    if (ambientLight) ambientLight.intensity = Number(settings.ambient) || 0.25;
  }

  function addCylinder(parent, start, end, radius, color) {
    const axis = end.clone().sub(start);
    if (axis.length() < 1e-6) return;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, axis.length(), 18, 1, false),
      material(color, false)
    );
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
    parent.add(mesh);
  }

  function buildScene(data) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setClearColor(new THREE.Color(data.background || "#ffffff"), 1);
    scene = new THREE.Scene();
    if (data.depthFade && data.depthFade.enabled) {
      const start = Math.max(0, Number(data.depthFade.start) || 5);
      const end = Math.max(start + 0.001, Number(data.depthFade.end) || 8);
      scene.fog = new THREE.Fog(new THREE.Color(data.background || "#ffffff"), start, end);
    }
    root = new THREE.Group();
    scene.add(root);
    const lighting = data.lighting || DEFAULT_LIGHTING;
    ambientLight = new THREE.AmbientLight(0xffffff, Number(lighting.ambient) || 0.25);
    scene.add(ambientLight);
    directionalLight = new THREE.DirectionalLight(lighting.color || "#ffffff", Number(lighting.intensity) || 2);
    lightTarget = new THREE.Object3D();
    scene.add(lightTarget);
    directionalLight.target = lightTarget;
    scene.add(directionalLight);
    const fit = sceneFit(data);

    (data.atoms || []).forEach((atom) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.01, (atom.radius || 0.08) * fit.scale), 32, 18),
        material(atom.color || "#999999", false)
      );
      mesh.position.copy(fitPoint(atom.pos, fit));
      root.add(mesh);
    });

    (data.bonds || []).forEach((bond) => {
      const start = fitPoint(bond.a, fit);
      const end = fitPoint(bond.b, fit);
      addCylinder(root, start, end, Math.max(0.004, (bond.radius || 0.03) * fit.scale), bond.colorA || bond.color || "#6b7280");
    });

    (data.edges || []).forEach((edge) => {
      const start = fitPoint(edge.a, fit);
      const end = fitPoint(edge.b, fit);
      addCylinder(root, start, end, Math.max(0.002, (edge.radius || 0.01) * fit.scale), edge.color || "#111827");
    });

    camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    updateCamera();
    updateLights();
    resize();
    animate();
  }

  function updateCamera() {
    if (!camera) return;
    const distance = 5.4 / Math.max(0.25, zoom);
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
  }

  function resize() {
    if (!renderer || !camera) return;
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(320, rect.width), Math.max(320, rect.height), false);
    camera.aspect = Math.max(0.1, rect.width / Math.max(1, rect.height));
    camera.updateProjectionMatrix();
  }

  function animate() {
    requestAnimationFrame(animate);
    if (renderer && renderer.xr && renderer.xr.isPresenting) return;
    if (root) {
      if (!drag) yaw += 0.004;
      root.rotation.set(pitch, yaw, 0);
    }
    updateCamera();
    updateLights();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function bindInteraction() {
    const pointerDistance = () => {
      const points = [...activePointers.values()];
      if (points.length < 2) return 0;
      return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    };
    const startPinch = () => {
      const distance = pointerDistance();
      pinch = distance > 0 ? { distance, zoom } : null;
      drag = null;
    };
    const startDragFromPointer = (point) => {
      drag = {
        x: point.x,
        y: point.y,
        yaw,
        pitch
      };
    };
    canvas.addEventListener("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activePointers.size >= 2) startPinch();
      else startDragFromPointer({ x: event.clientX, y: event.clientY });
    });
    canvas.addEventListener("pointermove", (event) => {
      if (activePointers.has(event.pointerId)) {
        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      if (pinch && activePointers.size >= 2) {
        const distance = pointerDistance();
        if (distance > 0) zoom = Math.max(0.25, Math.min(8, pinch.zoom * distance / pinch.distance));
        return;
      }
      if (!drag) return;
      yaw = drag.yaw + (event.clientX - drag.x) * 0.01;
      pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, drag.pitch + (event.clientY - drag.y) * 0.01));
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
      canvas.addEventListener(type, (event) => {
        activePointers.delete(event.pointerId);
        pinch = null;
        drag = null;
        if (activePointers.size === 1) {
          startDragFromPointer([...activePointers.values()][0]);
        }
      });
    });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      zoom = Math.max(0.25, Math.min(8, zoom * Math.exp(-event.deltaY / 600)));
    }, { passive: false });
  }

  function downloadGlb() {
    if (!sceneData || !window.CrystalModel) {
      setStatus("Nothing to export.");
      return;
    }
    try {
      const filename = `${(sceneData.name || "crystal").replace(/[^A-Za-z0-9_-]+/g, "-")}.glb`;
      window.CrystalModel.downloadGlb(sceneData, filename);
      setStatus(`Downloaded ${filename}.`);
    } catch (error) {
      setStatus(`GLB export failed: ${error.message || error}`);
    }
  }

  function iosQuickLookAvailable() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function openIosAr() {
    if (!sceneData || !window.CrystalModel || typeof window.CrystalModel.openUsdzQuickLook !== "function") {
      setStatus("iOS AR export is unavailable.");
      return false;
    }
    const filename = `${(sceneData.name || "crystal").replace(/[^A-Za-z0-9_-]+/g, "-")}.usdz`;
    window.CrystalModel.openUsdzQuickLook(sceneData, filename);
    setStatus("Opening iOS AR Quick Look…");
    return true;
  }

  async function enterXr(mode) {
    if (mode === "ar" && iosQuickLookAvailable() && openIosAr()) return;
    if (!renderer || !scene || !camera) {
      setStatus("3D view is not ready for XR.");
      return;
    }
    if (!window.CrystalXr || typeof window.CrystalXr.startWebXr !== "function") {
      setStatus("XR helper did not load.");
      return;
    }
    try {
      await window.CrystalXr.startWebXr({
        renderer,
        scene,
        camera,
        mode,
        onSessionStart: () => {
          setStatus(`Entered ${mode.toUpperCase()} session. Use your headset or browser controls to exit.`);
        },
        onSessionEnd: () => {
          setStatus(sceneData && sceneData.name ? sceneData.name : "Crystal loaded");
        }
      });
    } catch (error) {
      setStatus(error.message || `${mode.toUpperCase()} failed to start.`);
    }
  }

  function init() {
    const { token, xr } = parseShareLocation();
    setFullViewerLink(token);
    if (!token || !window.CrystalModel) {
      setStatus("Could not load shared crystal data.");
      return;
    }
    try {
      sceneData = window.CrystalModel.sceneFromShareToken(token);
      buildScene(sceneData);
      setStatus(sceneData.name || "Crystal loaded");
      if (xr === "vr" || xr === "ar") {
        enterXr(xr);
      }
    } catch (error) {
      setStatus("Could not load shared crystal data.");
    }
  }

  document.getElementById("share-download-glb")?.addEventListener("click", downloadGlb);
  document.getElementById("share-enter-vr")?.addEventListener("click", () => enterXr("vr"));
  document.getElementById("share-enter-ar")?.addEventListener("click", () => enterXr("ar"));
  bindInteraction();
  window.addEventListener("resize", resize);
  init();
})();
