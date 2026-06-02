(function (global) {
  "use strict";

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function aligned(bytes, padByte) {
    const padding = (4 - bytes.byteLength % 4) % 4;
    const out = new Uint8Array(bytes.byteLength + padding);
    out.set(bytes);
    out.fill(padByte || 0, bytes.byteLength);
    return out;
  }

  function base64UrlFromText(text) {
    const bytes = encoder.encode(text);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function textFromBase64Url(value) {
    const padded = String(value || "").replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(value || "").length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return decoder.decode(bytes);
  }

  function sceneToShareToken(scene) {
    return base64UrlFromText(JSON.stringify(scene));
  }

  function sceneFromShareToken(token) {
    return JSON.parse(textFromBase64Url(String(token || "").replace(/^#/, "").replace(/^data=/, "")));
  }

  function hexToRgb(hex) {
    const clean = String(hex || "#999999").replace("#", "");
    const full = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean.padEnd(6, "0");
    const value = parseInt(full, 16);
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, 1];
  }

  function addVec(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function subVec(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function mulVec(a, scale) {
    return [a[0] * scale, a[1] * scale, a[2] * scale];
  }

  function crossVec(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function lengthVec(a) {
    return Math.hypot(a[0], a[1], a[2]);
  }

  function normalizeVec(a) {
    const len = lengthVec(a) || 1;
    return mulVec(a, 1 / len);
  }

  function pointArray(point) {
    return [point.x || 0, point.y || 0, point.z || 0];
  }

  function fitScene(scene) {
    const points = [];
    (scene.atoms || []).forEach((atom) => points.push(pointArray(atom.pos)));
    (scene.bonds || []).forEach((bond) => {
      points.push(pointArray(bond.a));
      points.push(pointArray(bond.b));
    });
    (scene.edges || []).forEach((edge) => {
      points.push(pointArray(edge.a));
      points.push(pointArray(edge.b));
    });
    if (!points.length) return { center: [0, 0, 0], scale: 1 };
    const min = [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis])));
    const max = [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])));
    const center = mulVec(addVec(min, max), 0.5);
    const radius = Math.max(1, ...points.map((point) => lengthVec(subVec(point, center))));
    return { center, scale: 2 / radius };
  }

  function transformPoint(point, fit) {
    return mulVec(subVec(pointArray(point), fit.center), fit.scale);
  }

  function pushVertex(mesh, position, normal, color) {
    mesh.positions.push(...position);
    mesh.normals.push(...normal);
    mesh.colors.push(...color);
    return mesh.positions.length / 3 - 1;
  }

  function addSphere(mesh, center, radius, color, segments, rings) {
    const base = mesh.positions.length / 3;
    for (let y = 0; y <= rings; y += 1) {
      const theta = y / rings * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      for (let x = 0; x <= segments; x += 1) {
        const phi = x / segments * Math.PI * 2;
        const normal = [Math.cos(phi) * sinTheta, cosTheta, Math.sin(phi) * sinTheta];
        pushVertex(mesh, addVec(center, mulVec(normal, radius)), normal, color);
      }
    }
    for (let y = 0; y < rings; y += 1) {
      for (let x = 0; x < segments; x += 1) {
        const a = base + y * (segments + 1) + x;
        const b = a + segments + 1;
        mesh.indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

  function addCylinder(mesh, start, end, radius, colorStart, colorEnd, segments) {
    const axis = subVec(end, start);
    if (lengthVec(axis) < 1e-8) return;
    const forward = normalizeVec(axis);
    const helper = Math.abs(forward[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
    const right = normalizeVec(crossVec(forward, helper));
    const up = normalizeVec(crossVec(right, forward));
    const base = mesh.positions.length / 3;
    [start, end].forEach((center, row) => {
      const color = row ? colorEnd : colorStart;
      for (let i = 0; i <= segments; i += 1) {
        const angle = i / segments * Math.PI * 2;
        const normal = normalizeVec(addVec(mulVec(right, Math.cos(angle)), mulVec(up, Math.sin(angle))));
        pushVertex(mesh, addVec(center, mulVec(normal, radius)), normal, color);
      }
    });
    for (let i = 0; i < segments; i += 1) {
      const a = base + i;
      const b = base + segments + 1 + i;
      mesh.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  function sceneToMesh(scene) {
    const fit = fitScene(scene);
    const mesh = { positions: [], normals: [], colors: [], indices: [] };
    (scene.atoms || []).forEach((atom) => {
      addSphere(mesh, transformPoint(atom.pos, fit), Math.max(0.01, atom.radius || 0.08) * fit.scale, hexToRgb(atom.color), 24, 16);
    });
    (scene.bonds || []).forEach((bond) => {
      addCylinder(
        mesh,
        transformPoint(bond.a, fit),
        transformPoint(bond.b, fit),
        Math.max(0.004, bond.radius || 0.03) * fit.scale,
        hexToRgb(bond.colorA || bond.color || "#6b7280"),
        hexToRgb(bond.colorB || bond.colorA || bond.color || "#6b7280"),
        18
      );
    });
    (scene.edges || []).forEach((edge) => {
      addCylinder(
        mesh,
        transformPoint(edge.a, fit),
        transformPoint(edge.b, fit),
        Math.max(0.002, edge.radius || 0.01) * fit.scale,
        hexToRgb(edge.color || "#111827"),
        hexToRgb(edge.color || "#111827"),
        8
      );
    });
    return mesh;
  }

  function minMax(values) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < values.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], values[i + axis]);
        max[axis] = Math.max(max[axis], values[i + axis]);
      }
    }
    return { min, max };
  }

  function createGlb(scene) {
    const mesh = sceneToMesh(scene);
    const positions = new Float32Array(mesh.positions);
    const normals = new Float32Array(mesh.normals);
    const colors = new Float32Array(mesh.colors);
    const maxIndex = mesh.indices.length ? Math.max(...mesh.indices) : 0;
    const indexArray = maxIndex > 65535 ? new Uint32Array(mesh.indices) : new Uint16Array(mesh.indices);
    const chunks = [];
    const pushChunk = (typedArray, target) => {
      const byteOffset = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
      chunks.push(aligned(bytes, 0));
      return { buffer: 0, byteOffset, byteLength: bytes.byteLength, target };
    };
    const bufferViews = [
      pushChunk(positions, 34962),
      pushChunk(normals, 34962),
      pushChunk(colors, 34962),
      pushChunk(indexArray, 34963)
    ];
    const bounds = minMax(positions);
    const json = {
      asset: { version: "2.0", generator: "paulmneves.com crystal viewer" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: scene.name || "Crystal" }],
      meshes: [{
        primitives: [{
          attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
          indices: 3,
          material: 0
        }]
      }],
      materials: [{
        pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 }
      }],
      buffers: [{ byteLength: chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0) }],
      bufferViews,
      accessors: [
        { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min: bounds.min, max: bounds.max },
        { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
        { bufferView: 2, componentType: 5126, count: colors.length / 4, type: "VEC4" },
        { bufferView: 3, componentType: maxIndex > 65535 ? 5125 : 5123, count: indexArray.length, type: "SCALAR" }
      ]
    };
    const jsonChunk = aligned(encoder.encode(JSON.stringify(json)), 0x20);
    const binChunk = new Uint8Array(json.buffers[0].byteLength);
    let cursor = 0;
    chunks.forEach((chunk) => {
      binChunk.set(chunk, cursor);
      cursor += chunk.byteLength;
    });
    const total = 12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength;
    const out = new ArrayBuffer(total);
    const view = new DataView(out);
    let offset = 0;
    view.setUint32(offset, 0x46546c67, true); offset += 4;
    view.setUint32(offset, 2, true); offset += 4;
    view.setUint32(offset, total, true); offset += 4;
    view.setUint32(offset, jsonChunk.byteLength, true); offset += 4;
    view.setUint32(offset, 0x4e4f534a, true); offset += 4;
    new Uint8Array(out, offset, jsonChunk.byteLength).set(jsonChunk); offset += jsonChunk.byteLength;
    view.setUint32(offset, binChunk.byteLength, true); offset += 4;
    view.setUint32(offset, 0x004e4942, true); offset += 4;
    new Uint8Array(out, offset, binChunk.byteLength).set(binChunk);
    return new Blob([out], { type: "model/gltf-binary" });
  }

  function downloadGlb(scene, filename) {
    const url = URL.createObjectURL(createGlb(scene));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "crystal.glb";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  global.CrystalModel = {
    createGlb,
    downloadGlb,
    sceneFromShareToken,
    sceneToShareToken
  };
})(typeof window !== "undefined" ? window : globalThis);
