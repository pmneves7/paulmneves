/**
 * Load Laue image data from standard images, NorthStar .hs2, and NeXus .nxs files.
 */
(function (global) {
  "use strict";

  const HS2_SIZES = [
    { width: 512, height: 512 },
    { width: 256, height: 256 }
  ];

  const COLORMAPS = {
    gray: (t) => [t, t, t],
    viridis: viridisMap,
    inferno: infernoMap,
    plasma: plasmaMap,
    magma: magmaMap,
    cividis: cividisMap,
    hot: (t) => [clamp01(t * 3), clamp01(t * 3 - 1), clamp01(t * 3 - 2)],
    coolwarm: (t) => {
      const u = clamp01(t);
      return [0.23 + 0.77 * u, 0.3 + 0.4 * (1 - Math.abs(u - 0.5) * 2), 0.75 * (1 - u)];
    }
  };

  function clamp01(v) {
    return Math.min(1, Math.max(0, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function viridisMap(t) {
    const c0 = [0.267, 0.005, 0.329];
    const c1 = [0.283, 0.141, 0.458];
    const c2 = [0.254, 0.265, 0.530];
    const c3 = [0.164, 0.471, 0.558];
    const c4 = [0.134, 0.658, 0.518];
    const c5 = [0.477, 0.821, 0.318];
    const c6 = [0.993, 0.906, 0.144];
    const stops = [c0, c1, c2, c3, c4, c5, c6];
    const u = clamp01(t) * (stops.length - 1);
    const i = Math.floor(u);
    const f = u - i;
    const a = stops[Math.min(i, stops.length - 1)];
    const b = stops[Math.min(i + 1, stops.length - 1)];
    return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
  }

  function infernoMap(t) {
    return viridisMap(1 - clamp01(t) * 0.85);
  }

  function plasmaMap(t) {
    const u = clamp01(t);
    return [lerp(0.05, 0.94, u), lerp(0.03, 0.98, u * u), lerp(0.53, 0.13, Math.sqrt(u))];
  }

  function magmaMap(t) {
    const u = clamp01(t);
    return [lerp(0.03, 0.98, Math.pow(u, 0.7)), lerp(0.01, 0.55, u), lerp(0.22, 0.12, u)];
  }

  function cividisMap(t) {
    const u = clamp01(t);
    return [lerp(0.0, 0.99, u), lerp(0.13, 0.85, u), lerp(0.30, 0.15, u)];
  }

  function detectHs2Layout(byteLength) {
    for (const { width, height } of HS2_SIZES) {
      const imageBytes = width * height * 2;
      if (byteLength >= imageBytes) {
        return { width, height, imageBytes };
      }
    }
    return null;
  }

  function hs2ImageOffset(buffer, width, height) {
    const imageBytes = width * height * 2;
    const byteLength = buffer.byteLength;
    if (byteLength < imageBytes) return -1;
    if (byteLength === imageBytes) return 0;

    const candidates = [0, byteLength - imageBytes];
    const view = new DataView(buffer);
    const n = width * height;
    let bestOffset = 0;
    let bestMax = -1;

    for (const offset of candidates) {
      if (offset < 0 || offset + imageBytes > byteLength) continue;
      let maxVal = 0;
      for (let i = 0; i < n; i += 1) {
        const val = view.getUint16(offset + i * 2, true);
        if (val > maxVal) maxVal = val;
      }
      if (maxVal > bestMax) {
        bestMax = maxVal;
        bestOffset = offset;
      }
    }
    return bestOffset;
  }

  function readHs2Image(view, offset, width, height) {
    const intensities = new Float32Array(width * height);
    let minVal = Infinity;
    let maxVal = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const srcRow = height - 1 - y;
        const flatIndex = srcRow + x * height;
        const val = view.getUint16(offset + flatIndex * 2, true);
        intensities[y * width + x] = val;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }
    }
    return { intensities, minVal: Number.isFinite(minVal) ? minVal : 0, maxVal };
  }

  function readHs2(buffer) {
    const fileSize = buffer.byteLength;
    const layout = detectHs2Layout(fileSize);
    if (!layout) {
      throw new Error(
        `Unrecognized .hs2 file size (${fileSize} bytes). `
        + "Supported image sizes: 512×512 or 256×256 (16-bit unsigned, little-endian)."
      );
    }

    const offset = hs2ImageOffset(buffer, layout.width, layout.height);
    if (offset < 0) throw new Error("Could not locate image data in .hs2 file.");

    const view = new DataView(buffer);
    const { intensities, minVal, maxVal } = readHs2Image(view, offset, layout.width, layout.height);
    const meta = offset > 0 ? parseHs2Header(buffer, offset) : {};
    meta.hs2Diagnostics = {
      fileSize,
      width: layout.width,
      height: layout.height,
      offset,
      dtype: "uint16",
      endianness: "little",
      order: "column-major, vertically flipped",
      min: minVal,
      max: maxVal
    };
    return {
      width: layout.width,
      height: layout.height,
      intensities,
      maxIntensity: maxVal,
      meta,
      source: "hs2"
    };
  }

  function parseHs2Header(buffer, headerBytes) {
    if (headerBytes < 600) return {};
    const view = new DataView(buffer);
    const meta = {};
    const text = new TextDecoder("ascii").decode(new Uint8Array(buffer, 0, Math.min(headerBytes, 520)));
    const nameMatch = text.match(/[\x20-\x7E]{3,40}/);
    if (nameMatch) meta.specimenName = nameMatch[0].trim();

    for (let off = 400; off < headerBytes - 16; off += 4) {
      const v = view.getFloat32(off, true);
      if (v > 30 && v < 500 && Number.isFinite(v)) {
        meta.detDistanceMm = v;
        break;
      }
    }
    return meta;
  }

  const NEXUS_PRIORITY_PATHS = [
    "entry0/data/CameraDetector_data",
    "entry/data/data",
    "entry/instrument/detector/data",
    "entry/instrument/detector_MR/data"
  ];

  function isNexusFilename(name) {
    return /\.(nxs|nexus|h5|hdf5|nxs\.ngv)$/i.test(name);
  }

  function inferImageShape(shape) {
    const dims = shape.map(Number);

    if (dims.length === 2) {
      return { height: dims[0], width: dims[1], frameOffset: 0 };
    }

    if (dims.length >= 3) {
      const height = dims[dims.length - 2];
      const width = dims[dims.length - 1];
      return { height, width, frameOffset: 0 };
    }

    return null;
  }

  function scoreNexusDataset(path, shape) {
    const name = path.split("/").pop().toLowerCase();
    let score = 0;

    if (shape.length >= 2) score += 10;
    if (shape.length >= 3) score += 5;
    if (/data|image|detector|counts|intensity/.test(name)) score += 20;
    if (/raw|corrected|counts/.test(name)) score += 10;
    if (path.includes("detector")) score += 10;
    if (path.includes("instrument")) score += 5;
    if (NEXUS_PRIORITY_PATHS.includes(path)) score += 50;

    const height = shape[shape.length - 2];
    const width = shape[shape.length - 1];
    if (height >= 64 && width >= 64) score += 15;
    if (height >= 256 && width >= 256) score += 10;

    return score;
  }

  function collectNexusDatasets(node, path, candidates) {
    let keys;
    try {
      keys = node.keys();
    } catch (_) {
      return;
    }

    for (const key of keys) {
      const childPath = path ? `${path}/${key}` : key;
      try {
        const child = node.get(key);
        if (!child) continue;

        if (child.shape && child.shape.length >= 2) {
          candidates.push({ path: childPath, shape: child.shape, node: child });
        }

        if (typeof child.keys === "function") {
          collectNexusDatasets(child, childPath, candidates);
        }
      } catch (_) { /* skip unreadable group member */ }
    }
  }

  function formatNexusShape(shape) {
    return shape.map(Number).join("×");
  }

  function flattenDatasetValue(dataset) {
    if (dataset instanceof Float32Array || dataset instanceof Float64Array
      || dataset instanceof Int32Array || dataset instanceof Uint32Array
      || dataset instanceof Uint16Array || dataset instanceof Int8Array
      || dataset instanceof Uint8Array) {
      return dataset;
    }
    if (Array.isArray(dataset)) {
      return Float32Array.from(dataset.flat(Infinity));
    }
    if (dataset && dataset.data) {
      return dataset.data;
    }
    return Float32Array.from(Object.values(dataset).flat(Infinity));
  }

  function extractFirstFrame(flat, shape, imageShape) {
    const { height, width, frameOffset } = imageShape;
    const frameSize = height * width;
    const offset = frameOffset * frameSize;

    if (flat.subarray) {
      return flat.subarray(offset, offset + frameSize);
    }
    return flat.slice(offset, offset + frameSize);
  }

  function readDatasetFrame(node, shape, imageShape) {
    let dataset;
    try {
      dataset = node.value;
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (/filter|compress|plugin|shuffle/i.test(msg)) {
        throw new Error(
          `Could not read NeXus dataset: compressed data may require h5wasm compression plugins. (${msg})`
        );
      }
      throw err;
    }

    const flat = flattenDatasetValue(dataset);
    const frame = extractFirstFrame(flat, shape, imageShape);
    const intensities = new Float32Array(frame.length);
    let maxVal = 0;
    for (let i = 0; i < frame.length; i += 1) {
      intensities[i] = frame[i] ?? 0;
      if (intensities[i] > maxVal) maxVal = intensities[i];
    }
    return { intensities, maxVal };
  }

  async function readNxs(file) {
    const h5 = await loadH5Wasm();
    const { FS } = await h5.ready;
    const buf = await file.arrayBuffer();
    const mountName = `/tmp_laue_${Date.now()}.nxs`;
    FS.writeFile(mountName, new Uint8Array(buf));
    try {
      const f = new h5.File(mountName, "r");
      const candidates = [];

      for (const path of NEXUS_PRIORITY_PATHS) {
        try {
          const node = f.get(path);
          if (node && node.shape && node.shape.length >= 2) {
            candidates.push({ path, shape: node.shape, node });
          }
        } catch (_) { /* try recursive discovery instead */ }
      }

      collectNexusDatasets(f, "", candidates);

      const seen = new Set();
      const unique = [];
      for (const candidate of candidates) {
        if (seen.has(candidate.path)) continue;
        seen.add(candidate.path);
        unique.push(candidate);
      }

      let best = null;
      let bestScore = -1;
      for (const candidate of unique) {
        const imageShape = inferImageShape(candidate.shape);
        if (!imageShape || imageShape.height < 2 || imageShape.width < 2) continue;
        const score = scoreNexusDataset(candidate.path, candidate.shape);
        if (score > bestScore) {
          bestScore = score;
          best = { ...candidate, imageShape };
        }
      }

      if (!best) {
        const listing = unique
          .slice(0, 20)
          .map((c) => `${c.path} [${formatNexusShape(c.shape)}]`)
          .join("; ");
        const suffix = unique.length
          ? ` Found ${unique.length} dataset(s): ${listing}${unique.length > 20 ? "…" : ""}.`
          : " No multi-dimensional datasets were found.";
        throw new Error(`No suitable detector dataset found in NeXus file.${suffix}`);
      }

      const { intensities, maxVal } = readDatasetFrame(best.node, best.shape, best.imageShape);
      f.close();

      return {
        width: best.imageShape.width,
        height: best.imageShape.height,
        intensities,
        maxIntensity: maxVal,
        meta: {
          nexusPath: best.path,
          nexusShape: best.shape.map(Number)
        },
        source: "nxs"
      };
    } finally {
      try { FS.unlink(mountName); } catch (_) { /* ignore */ }
    }
  }

  async function loadH5Wasm() {
    if (global.h5wasm) return global.h5wasm;

    try {
      const mod = await import("https://cdn.jsdelivr.net/npm/h5wasm@latest/dist/esm/hdf5_hl.js");
      global.h5wasm = mod.default || mod;
      await global.h5wasm.ready;
      return global.h5wasm;
    } catch (err) {
      throw new Error(
        `Failed to load HDF5 reader for NeXus files: ${err && err.message ? err.message : err}`
      );
    }
  }

  function imageDataFromImage(img) {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const n = canvas.width * canvas.height;
    const intensities = new Float32Array(n);
    let maxVal = 0;
    for (let i = 0; i < n; i += 1) {
      const r = imageData.data[i * 4];
      const g = imageData.data[i * 4 + 1];
      const b = imageData.data[i * 4 + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      intensities[i] = lum;
      if (lum > maxVal) maxVal = lum;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      intensities,
      maxIntensity: maxVal,
      meta: {},
      source: "image"
    };
  }

  function loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          resolve(imageDataFromImage(img));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("Could not load image from URL."));
      img.src = url;
    });
  }

  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        try {
          resolve(imageDataFromImage(img));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not decode image file."));
      };
      img.src = url;
    });
  }

  async function loadLaueFile(file) {
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".hs2")) {
      return readHs2(await file.arrayBuffer());
    }
    if (isNexusFilename(name)) {
      return readNxs(file);
    }
    if (file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|tif?f)$/i.test(name)) {
      return loadImageFile(file);
    }
    throw new Error("Unsupported file type. Use PNG/JPEG, .hs2, or NeXus (.nxs, .h5, .hdf5, .nexus).");
  }

  /** PCHIP slopes (monotone cubic Hermite) — smoother, wider tone response than Catmull–Rom. */
  function pchipEndpointSlope(h0, h1, delta0, delta1) {
    let m = ((2 * h0 + h1) * delta0 - h0 * delta1) / (h0 + h1);
    if (Math.sign(m) !== Math.sign(delta0)) m = 0;
    else if (Math.sign(delta0) !== Math.sign(delta1) && Math.abs(m) > 3 * Math.abs(delta0)) {
      m = 3 * delta0;
    }
    return m;
  }

  function pchipSlopes(xs, ys) {
    const n = xs.length;
    const m = new Array(n);
    if (n === 1) return [0];
    const h = new Array(n - 1);
    const delta = new Array(n - 1);
    for (let k = 0; k < n - 1; k += 1) {
      h[k] = xs[k + 1] - xs[k];
      delta[k] = h[k] > 1e-12 ? (ys[k + 1] - ys[k]) / h[k] : 0;
    }
    if (n === 2) {
      m[0] = delta[0];
      m[1] = delta[0];
      return m;
    }
    m[0] = pchipEndpointSlope(h[0], h[1], delta[0], delta[1]);
    m[n - 1] = pchipEndpointSlope(h[n - 2], h[n - 3], delta[n - 2], delta[n - 3]);
    for (let i = 1; i < n - 1; i += 1) {
      if (delta[i - 1] * delta[i] <= 0) {
        m[i] = 0;
      } else {
        const w1 = 2 * h[i] + h[i - 1];
        const w2 = h[i] + 2 * h[i - 1];
        m[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
      }
    }
    return m;
  }

  function hermiteSegment(y0, y1, m0, m1, h, u) {
    const u2 = u * u;
    const u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * y0 +
      (u3 - 2 * u2 + u) * h * m0 +
      (-2 * u3 + 3 * u2) * y1 +
      (u3 - u2) * h * m1
    );
  }

  function evaluateCurve(points, t) {
    if (!points || points.length === 0) return t;
    const sorted = [...points].sort((a, b) => a.x - b.x);
    if (sorted.length === 1) return sorted[0].y;

    const xs = sorted.map((p) => p.x);
    const ys = sorted.map((p) => p.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    if (t <= first.x) {
      if (sorted.length < 2) return first.y;
      const slope = (sorted[1].y - first.y) / (sorted[1].x - first.x || 1);
      return first.y + slope * (t - first.x);
    }
    if (t >= last.x) {
      if (sorted.length < 2) return last.y;
      const prev = sorted[sorted.length - 2];
      const slope = (last.y - prev.y) / (last.x - prev.x || 1);
      return last.y + slope * (t - last.x);
    }

    if (sorted.length === 2) {
      const a = sorted[0];
      const b = sorted[1];
      const u = (t - a.x) / (b.x - a.x || 1);
      return a.y + u * (b.y - a.y);
    }

    const slopes = pchipSlopes(xs, ys);
    for (let i = 0; i < sorted.length - 1; i += 1) {
      if (t >= sorted[i].x && t <= sorted[i + 1].x) {
        const h = sorted[i + 1].x - sorted[i].x || 1;
        const u = (t - sorted[i].x) / h;
        return hermiteSegment(
          sorted[i].y,
          sorted[i + 1].y,
          slopes[i],
          slopes[i + 1],
          h,
          u
        );
      }
    }
    return t;
  }

  function intensityRange(intensities) {
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let i = 0; i < intensities.length; i += 1) {
      const v = intensities[i];
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
    if (!Number.isFinite(minVal)) return { min: 0, max: 1 };
    return { min: minVal, max: maxVal };
  }

  function intensityPercentileRange(intensities, loFrac, hiFrac) {
    const lo = clamp01(loFrac ?? 0.02);
    const hi = clamp01(hiFrac ?? 0.98);
    if (!intensities.length) return { min: 0, max: 1 };
    const sorted = Array.from(intensities).sort((a, b) => a - b);
    const pick = (frac) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(frac * (sorted.length - 1))))];
    const minVal = pick(Math.min(lo, hi));
    const maxVal = pick(Math.max(lo, hi));
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || maxVal <= minVal) {
      return intensityRange(intensities);
    }
    return { min: minVal, max: maxVal };
  }

  function getEffectiveIntensity(val, minI, maxI, invertIntensity) {
    if (!invertIntensity) return val;
    return minI + maxI - val;
  }

  function getEffectiveIntensities(intensities, minI, maxI, invertIntensity) {
    if (!invertIntensity) return intensities;
    const out = new Float32Array(intensities.length);
    for (let i = 0; i < intensities.length; i += 1) {
      out[i] = minI + maxI - intensities[i];
    }
    return out;
  }

  function intensityToDisplayT(val, minI, maxI, display) {
    const span = Math.max(maxI - minI, 1e-12);
    const v = getEffectiveIntensity(val, minI, maxI, display.invertIntensity);
    let t = clamp01((v - minI) / span);
    t = evaluateCurve(display.curvePoints || [], t);
    return t;
  }

  function displayTToRgb(t, colormap, reverseColormap) {
    const lutT = reverseColormap ? 1 - clamp01(t) : clamp01(t);
    return colorForMappedT(lutT, colormap);
  }

  function intensityToRgb(val, minI, maxI, display, colormap) {
    const t = intensityToDisplayT(val, minI, maxI, display);
    return displayTToRgb(t, colormap, display.reverseColormap);
  }

  function displayMappedT(rawT, display) {
    let t = clamp01(rawT);
    t = evaluateCurve(display.curvePoints || [], t);
    return t;
  }

  function colorForMappedT(mappedT, colormap) {
    const mapFn = COLORMAPS[colormap] || COLORMAPS.gray;
    const [r, g, b] = mapFn(clamp01(mappedT));
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  function sampleAt(intensities, width, height, x, y, flipH, flipV) {
    let sx = flipH ? width - 1 - x : x;
    let sy = flipV ? height - 1 - y : y;
    sx = Math.max(0, Math.min(width - 1, sx));
    sy = Math.max(0, Math.min(height - 1, sy));
    return intensities[sy * width + sx];
  }

  function applyDisplayTransform(data, transform) {
    const { width, height, intensities } = data;
    const { rotate90 = 0, flipH = false, flipV = false } = transform || {};
    const rot = ((rotate90 % 4) + 4) % 4;
    const outW = rot % 2 === 1 ? height : width;
    const outH = rot % 2 === 1 ? width : height;
    const out = new Float32Array(outW * outH);

    for (let y = 0; y < outH; y += 1) {
      for (let x = 0; x < outW; x += 1) {
        let sx = x;
        let sy = y;
        if (rot === 1) {
          sx = y;
          sy = width - 1 - x;
        } else if (rot === 2) {
          sx = outW - 1 - x;
          sy = outH - 1 - y;
        } else if (rot === 3) {
          sx = height - 1 - y;
          sy = x;
        }
        out[y * outW + x] = sampleAt(intensities, width, height, sx, sy, flipH, flipV);
      }
    }

    return {
      ...data,
      width: outW,
      height: outH,
      intensities: out,
      maxIntensity: data.maxIntensity
    };
  }

  function renderToImageData(data, display) {
    const {
      colormap = "gray",
      vmin = 0,
      vmax = null
    } = display || {};

    const { width, height, intensities } = data;
    const range = intensityRange(intensities);
    const maxI = vmax ?? range.max ?? 1;
    const minI = vmin ?? range.min ?? 0;

    const imageData = new ImageData(width, height);
    for (let i = 0; i < intensities.length; i += 1) {
      const [r, g, b] = intensityToRgb(intensities[i], minI, maxI, display, colormap);
      imageData.data[i * 4] = r;
      imageData.data[i * 4 + 1] = g;
      imageData.data[i * 4 + 2] = b;
      imageData.data[i * 4 + 3] = 255;
    }
    return imageData;
  }

  function renderColorbar(canvas, display, dataMax) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const {
      colormap = "gray",
      vmin = 0,
      vmax = null
    } = display || {};
    const maxI = vmax ?? dataMax ?? 1;
    const minI = vmin;
    const barDisplay = { ...display, invertIntensity: false };

    for (let row = 0; row < h; row += 1) {
      const frac = 1 - row / Math.max(h - 1, 1);
      const intensity = minI + frac * (maxI - minI);
      const [r, g, b] = intensityToRgb(intensity, minI, maxI, barDisplay, colormap);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, row, w, 1);
    }

    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    return { minI, maxI };
  }

  function gaussianKernel1D(sigma) {
    const radius = Math.max(1, Math.ceil(sigma * 3));
    const size = radius * 2 + 1;
    const kernel = new Float32Array(size);
    let sum = 0;
    for (let i = -radius; i <= radius; i += 1) {
      const w = Math.exp(-(i * i) / (2 * sigma * sigma));
      kernel[i + radius] = w;
      sum += w;
    }
    for (let i = 0; i < size; i += 1) kernel[i] /= sum;
    return { kernel, radius };
  }

  function gaussianBlur(intensities, width, height, sigma) {
    if (!sigma || sigma <= 0) return intensities.slice();
    const { kernel, radius } = gaussianKernel1D(sigma);
    const temp = new Float32Array(intensities.length);
    const out = new Float32Array(intensities.length);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const sx = Math.min(width - 1, Math.max(0, x + k));
          sum += intensities[y * width + sx] * kernel[k + radius];
        }
        temp[y * width + x] = sum;
      }
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const sy = Math.min(height - 1, Math.max(0, y + k));
          sum += temp[sy * width + x] * kernel[k + radius];
        }
        out[y * width + x] = sum;
      }
    }
    return out;
  }

  function fillEmptyRadialBins(avg, count, bins) {
    for (let b = 0; b < bins; b += 1) {
      if (count[b] === 0 || !(avg[b] > 0)) avg[b] = NaN;
    }
    for (let pass = 0; pass < bins; pass += 1) {
      let done = true;
      for (let b = 0; b < bins; b += 1) {
        if (Number.isFinite(avg[b])) continue;
        done = false;
        let lo = b - 1;
        let hi = b + 1;
        while (lo >= 0 && !Number.isFinite(avg[lo])) lo -= 1;
        while (hi < bins && !Number.isFinite(avg[hi])) hi += 1;
        if (lo >= 0 && hi < bins) avg[b] = (avg[lo] + avg[hi]) / 2;
        else if (lo >= 0) avg[b] = avg[lo];
        else if (hi < bins) avg[b] = avg[hi];
      }
      if (done) break;
    }
    for (let b = 0; b < bins; b += 1) {
      if (!Number.isFinite(avg[b]) || avg[b] <= 0) avg[b] = 1;
    }
  }

  function radialNormalize(intensities, width, height, centerX, centerY, nBins) {
    const bins = Math.max(4, Math.round(nBins));
    const sectors = 96;
    const minCoverage = 0.55;
    const n = width * height;
    const out = new Float32Array(n);
    const maxR = Math.max(
      Math.hypot(centerX, centerY),
      Math.hypot(width - centerX, centerY),
      Math.hypot(centerX, height - centerY),
      Math.hypot(width - centerX, height - centerY),
      1e-6
    );
    const sum = new Float64Array(bins);
    const count = new Float64Array(bins);
    const avg = new Float32Array(bins);
    const sectorMask = Array.from({ length: bins }, () => new Uint8Array(sectors));

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const r = Math.hypot(x - centerX, y - centerY);
        const idx = y * width + x;
        const bin = Math.min(bins - 1, Math.floor((r / maxR) * bins));
        const theta = Math.atan2(y - centerY, x - centerX);
        const sector = Math.min(
          sectors - 1,
          Math.floor(((theta + Math.PI) / (Math.PI * 2)) * sectors)
        );
        sum[bin] += intensities[idx];
        count[bin] += 1;
        sectorMask[bin][sector] = 1;
      }
    }

    for (let b = 0; b < bins; b += 1) {
      let covered = 0;
      for (let s = 0; s < sectors; s += 1) covered += sectorMask[b][s];
      const coverage = covered / sectors;
      avg[b] = count[b] > 0 && coverage >= minCoverage
        ? sum[b] / count[b]
        : NaN;
      if (!Number.isFinite(avg[b])) count[b] = 0;
    }
    fillEmptyRadialBins(avg, count, bins);

    const validMeans = [];
    for (let b = 0; b < bins; b += 1) {
      if (avg[b] > 0) validMeans.push(avg[b]);
    }
    validMeans.sort((a, b) => a - b);
    const medianMean = validMeans.length
      ? validMeans[Math.floor(validMeans.length / 2)]
      : 1;
    const meanFloor = Math.max(1e-12, medianMean * 0.01);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const r = Math.hypot(x - centerX, y - centerY);
        const idx = y * width + x;
        const f = Math.min(bins - 1, Math.max(0, (r / maxR) * bins));
        const b0 = Math.floor(f);
        const b1 = Math.min(bins - 1, b0 + 1);
        const t = f - b0;
        const mean = avg[b0] * (1 - t) + avg[b1] * t;
        out[idx] = intensities[idx] / Math.max(mean, meanFloor);
      }
    }
    return out;
  }

  function applyCorrections(data, corrections, centerX, centerY) {
    let intensities = data.intensities;
    if (corrections.gaussianBlur && corrections.blurRadius > 0) {
      intensities = gaussianBlur(intensities, data.width, data.height, corrections.blurRadius);
    }
    if (corrections.radialNormalize) {
      intensities = radialNormalize(
        intensities,
        data.width,
        data.height,
        centerX,
        centerY,
        corrections.radialBins
      );
    }
    if (intensities === data.intensities) {
      return data;
    }
    let maxVal = 0;
    for (let i = 0; i < intensities.length; i += 1) {
      if (intensities[i] > maxVal) maxVal = intensities[i];
    }
    return {
      ...data,
      intensities,
      maxIntensity: maxVal
    };
  }

  global.LaueFormats = {
    COLORMAPS: Object.keys(COLORMAPS),
    loadLaueFile,
    loadImageFile,
    loadImageFromUrl,
    readHs2,
    readNxs,
    renderToImageData,
    renderColorbar,
    applyDisplayTransform,
    applyCorrections,
    gaussianBlur,
    radialNormalize,
    evaluateCurve,
    displayMappedT,
    intensityToDisplayT,
    displayTToRgb,
    intensityToRgb,
    getEffectiveIntensity,
    getEffectiveIntensities,
    colorForMappedT,
    intensityRange,
    intensityPercentileRange
  };
})(window);
