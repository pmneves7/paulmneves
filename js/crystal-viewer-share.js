(function () {
  "use strict";

  const status = document.getElementById("share-status");
  const canvas = document.getElementById("shared-crystal-canvas");
  let sceneData = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let root = null;
  let yaw = 0;
  let pitch = 0;
  let zoom = 1;
  let drag = null;

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function vec(point) {
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

  function material(color, line) {
    if (line) return new THREE.MeshBasicMaterial({ color, depthTest: true, depthWrite: true });
    return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
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
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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
    root.add(new THREE.AmbientLight(0xffffff, 0.35));
    const light = new THREE.DirectionalLight(0xffffff, 1.6);
    light.position.set(2, 3, 4);
    root.add(light);
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
    if (root) {
      if (!drag) yaw += 0.004;
      root.rotation.set(pitch, yaw, 0);
    }
    updateCamera();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function bindInteraction() {
    canvas.addEventListener("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      drag = {
        x: event.clientX,
        y: event.clientY,
        yaw,
        pitch
      };
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drag) return;
      yaw = drag.yaw + (event.clientX - drag.x) * 0.01;
      pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, drag.pitch + (event.clientY - drag.y) * 0.01));
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
      canvas.addEventListener(type, () => {
        drag = null;
      });
    });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      zoom = Math.max(0.25, Math.min(8, zoom * Math.exp(-event.deltaY / 600)));
    }, { passive: false });
  }

  function downloadGlb() {
    if (!sceneData || !window.CrystalModel) return;
    window.CrystalModel.downloadGlb(sceneData, `${(sceneData.name || "crystal").replace(/[^A-Za-z0-9_-]+/g, "-")}.glb`);
  }

  async function enterXr(mode) {
    if (!navigator.xr) {
      setStatus(`${mode.toUpperCase()} requires a WebXR browser on HTTPS.`);
      return;
    }
    const sessionMode = mode === "ar" ? "immersive-ar" : "immersive-vr";
    const supported = await navigator.xr.isSessionSupported(sessionMode);
    setStatus(supported ? `${mode.toUpperCase()} is supported by this device, but full session controls are still experimental.` : `${mode.toUpperCase()} is not supported by this device.`);
  }

  try {
    const token = window.location.hash.replace(/^#data=/, "");
    sceneData = window.CrystalModel.sceneFromShareToken(token);
    buildScene(sceneData);
    setStatus(sceneData.name || "Crystal loaded");
  } catch (error) {
    setStatus("Could not load shared crystal data.");
  }

  document.getElementById("share-download-glb")?.addEventListener("click", downloadGlb);
  document.getElementById("share-enter-vr")?.addEventListener("click", () => enterXr("vr"));
  document.getElementById("share-enter-ar")?.addEventListener("click", () => enterXr("ar"));
  bindInteraction();
  window.addEventListener("resize", resize);
})();
