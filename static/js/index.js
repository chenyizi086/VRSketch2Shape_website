window.HELP_IMPROVE_VIDEOJS = false;

var INTERP_BASE = "./static/interpolation/stacked";
var NUM_INTERP_FRAMES = 240;

var interp_images = [];
function preloadInterpolationImages() {
  var framesToPreload = Math.min(NUM_INTERP_FRAMES, 10); 
  for (var i = 0; i < framesToPreload; i++) {
    var path = INTERP_BASE + '/' + String(i).padStart(6, '0') + '.jpg';
    interp_images[i] = new Image();
    interp_images[i].src = path;
  }
}

function setInterpolationImage(i) {
  // 載入未預載的圖片
  if (!interp_images[i]) {
    var path = INTERP_BASE + '/' + String(i).padStart(6, '0') + '.jpg';
    interp_images[i] = new Image();
    interp_images[i].src = path;
  }
  
  var image = interp_images[i];
  image.ondragstart = function() { return false; };
  image.oncontextmenu = function() { return false; };
  $('#interpolation-image-wrapper').empty().append(image);
}

$(document).ready(function() {
  // Navbar burger
  $(".navbar-burger").click(function() {
    $(".navbar-burger").toggleClass("is-active");
    $(".navbar-menu").toggleClass("is-active");
  });

  // Carousel
  var options = {
    slidesToScroll: 1,
    slidesToShow: 3,
    loop: true,
    infinite: true,
    autoplay: false,
    autoplaySpeed: 3000,
  }
  var carousels = bulmaCarousel.attach('.carousel', options);

  for (var i = 0; i < carousels.length; i++) {
    carousels[i].on('before:show', state => {
      console.log(state);
    });
  }

  var element = document.querySelector('#my-element');
  if (element && element.bulmaCarousel) {
    element.bulmaCarousel.on('before-show', function(state) {
      console.log(state);
    });
  }

  // Interpolation slider
  preloadInterpolationImages();

  $('#interpolation-slider').on('input', function(event) {
    setInterpolationImage(this.value);
  });
  setInterpolationImage(0);
  $('#interpolation-slider').prop('max', NUM_INTERP_FRAMES - 1);

  bulmaSlider.attach();

  // VR Sketch viewer
  initSketchViewer();
  initObjViewer();
});

/* ========================
   超精簡／加速版 VR Sketch Viewer
   (繪製邏輯保持不變，已是高效實現)
   ======================== */

function initSketchViewer() {
  const canvas = document.getElementById('sketch-canvas');
  const zoomSlider = document.getElementById('sketch-zoom');
  const resetButton = document.getElementById('sketch-reset');
  const rotateLeft = document.getElementById('sketch-rotate-left');
  const rotateRight = document.getElementById('sketch-rotate-right');
  const rotateXLeft = document.getElementById('sketch-rotate-x-left');
  const rotateXRight = document.getElementById('sketch-rotate-x-right');
  const rotateZLeft = document.getElementById('sketch-rotate-z-left');
  const rotateZRight = document.getElementById('sketch-rotate-z-right');
  const playButton = document.getElementById('sketch-play');
  const statusEl = document.getElementById('sketch-status');
  if (!canvas || !zoomSlider || !resetButton || !rotateLeft || !rotateRight || !rotateXLeft || !rotateXRight || !rotateZLeft || !rotateZRight || !playButton) return;

  const ctx = canvas.getContext('2d');
  const minZoom = parseFloat(zoomSlider.min) || 0.6;
  const maxZoom = parseFloat(zoomSlider.max) || 2.5;
  const defaultZoom = minZoom;

  const state = {
    strokes: [],
    center: { x: 0, y: 0, z: 0 },
    radius: 2,
    angleX: 0,
    angleY: 0,
    angleZ: 0,
    zoom: defaultZoom,
    baseScale: 1,
    dragging: false,
    lastPos: { x: 0, y: 0 },
    revealIndex: 0,
    animating: false
  };
  zoomSlider.value = String(defaultZoom);

  const setStatus = (msg) => {
    if (statusEl) statusEl.textContent = msg;
  };

  const MAX_POINTS_PER_STROKE = 180;
  const MAX_STROKES = 320;

  const preprocessStrokes = (rawStrokes) => {
    let changed = false;
    let strokes = rawStrokes;
    if (strokes.length > MAX_STROKES) {
      strokes = strokes.slice(0, MAX_STROKES);
      changed = true;
    }
    const processed = strokes.map((stroke) => {
      if (stroke.length <= MAX_POINTS_PER_STROKE) return stroke;
      const stride = Math.ceil(stroke.length / MAX_POINTS_PER_STROKE);
      const reduced = [];
      for (let i = 0; i < stroke.length; i += stride) {
        reduced.push(stroke[i]);
      }
      if (stroke.length) reduced.push(stroke[stroke.length - 1]);
      changed = true;
      return reduced;
    });
    return { strokes: processed, changed };
  };

  const transformStrokes = (rawStrokes) => {
    return rawStrokes.map((stroke) =>
      stroke.map((p) => ({
        x: p.y,
        y: -p.x,
        z: p.z
      }))
    );
  };

  const parseCurves = (text) => {
    const lines = text.split(/\r?\n/);
    const strokes = [];
    let current = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('v ')) {
        if (current.length) strokes.push(current);
        current = [];
        continue;
      }
      const cleaned = line.replace(/[+]/g, '');
      const parts = cleaned.split(/\s+/).map(Number);
      if (parts.length >= 3 && parts.every((n) => !Number.isNaN(n))) {
        current.push({ x: parts[0], y: parts[1], z: parts[2] });
      }
    }
    if (current.length) strokes.push(current);
    return strokes;
  };

  const computeStats = (strokes) => {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    strokes.forEach((stroke) => {
      stroke.forEach((p) => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
      });
    });
    const center = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2
    };
    const radius = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 || 1;
    return { center, radius };
  };

  // 使用外部預先算好的 cos/sin
  const rotatePoint = (p, cosY, sinY, cosX, sinX, cosZ, sinZ) => {
    // Y 軸旋轉
    const x1 = cosY * p.x + sinY * p.z;
    const z1 = -sinY * p.x + cosY * p.z;
    // X 軸旋轉
    const y2 = cosX * p.y - sinX * z1;
    const z2 = sinX * p.y + cosX * z1;
    // Z 軸旋轉
    const x3 = cosZ * x1 - sinZ * y2;
    const y3 = sinZ * x1 + cosZ * y2;
    return { x: x3, y: y3, z: z2 };
  };

  const setCanvasSize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 420;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.baseScale = 0.45 * Math.min(width, height) / state.radius;
    draw();
  };

  const applySketch = (strokes, label) => {
    if (!strokes || !strokes.length) return false;
    const { strokes: optimized, changed } = preprocessStrokes(strokes);
    state.strokes = transformStrokes(optimized);
    state.revealIndex = state.strokes.length;
    const stats = computeStats(state.strokes);
    state.center = stats.center;
    state.radius = stats.radius || 1;
    setCanvasSize();
    const baseLabel = label || 'Rendering strokes.';
    const suffix = changed ? ' (Preview downsampled for faster loading.)' : '';
    setStatus(baseLabel + suffix);
    return true;
  };

  const project = (p, cosY, sinY, cosX, sinX, cosZ, sinZ) => {
    const centered = {
      x: p.x - state.center.x,
      y: p.y - state.center.y,
      z: p.z - state.center.z
    };
    const rotated = rotatePoint(centered, cosY, sinY, cosX, sinX, cosZ, sinZ);

    // 去掉透視，單純等比縮放 → 大幅加速
    const scale = state.baseScale * state.zoom;
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);

    return {
      x: w / 2 + rotated.x * scale,
      y: h / 2 - rotated.z * scale
    };
  };

  const draw = () => {
    if (!state.strokes.length) return;

    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.95;

    // 預先計算 sin/cos
    const cosY = Math.cos(state.angleY);
    const sinY = Math.sin(state.angleY);
    const cosX = Math.cos(state.angleX);
    const sinX = Math.sin(state.angleX);
    const cosZ = Math.cos(state.angleZ);
    const sinZ = Math.sin(state.angleZ);

    ctx.beginPath();

    const totalStrokes = state.strokes.length || 1;
    state.strokes.forEach((stroke, index) => {
      if (index >= state.revealIndex) return;
      if (!stroke.length) return;
      const color = getStrokeColor(index / (totalStrokes - 1 || 1));
      ctx.strokeStyle = color;
      ctx.beginPath();
      stroke.forEach((pt, i) => {
        const proj = project(pt, cosY, sinY, cosX, sinX, cosZ, sinZ);
        if (i === 0) {
          ctx.moveTo(proj.x, proj.y);
        } else {
          ctx.lineTo(proj.x, proj.y);
        }
      });
      ctx.stroke();
    });
    if (state.animating && state.revealIndex < state.strokes.length) {
      requestAnimationFrame(() => {
        state.revealIndex = Math.min(state.strokes.length, state.revealIndex + 0.2);
        draw();
      });
    } else {
      state.animating = false;
      playButton.textContent = 'Play';
    }
    syncObjRotation(state.angleX, state.angleY, state.angleZ);
  };

  const getStrokeColor = (t) => {
    const clamp = (val) => Math.max(0, Math.min(1, val));
    const tt = clamp(t);
    const r = 239 * (1 - tt) + 37 * tt;
    const g = 68 * (1 - tt) + 99 * tt;
    const b = 68 * (1 - tt) + 235 * tt;
    return `rgb(${r.toFixed(0)}, ${g.toFixed(0)}, ${b.toFixed(0)})`;
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    const next = Math.min(maxZoom, Math.max(minZoom, state.zoom + delta));
    state.zoom = next;
    zoomSlider.value = next.toFixed(2);
    draw();
  };

  const handlePointerDown = (e) => {
    state.dragging = true;
    state.lastPos = { x: e.clientX, y: e.clientY };
    if (canvas.setPointerCapture) {
      canvas.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e) => {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastPos.x;
    const dy = e.clientY - state.lastPos.y;
    state.lastPos = { x: e.clientX, y: e.clientY };
    state.angleY += dx * 0.0055;
    state.angleX += dy * 0.0055;
    state.angleX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.angleX));
    draw();
  };

  const handlePointerUp = (e) => {
    state.dragging = false;
    if (canvas.releasePointerCapture) {
      canvas.releasePointerCapture(e.pointerId);
    }
  };

  const attachInteractions = () => {
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('dblclick', resetView);
  };

  const resetView = () => {
    state.angleX = 0;
    state.angleY = 0;
    state.angleZ = 0;
    state.zoom = defaultZoom;
    zoomSlider.value = String(defaultZoom);
    draw();
  };

  zoomSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!Number.isFinite(val)) return;
    state.zoom = Math.min(maxZoom, Math.max(minZoom, val));
    zoomSlider.value = String(state.zoom);
    draw();
    syncObjZoom(state.zoom);
  });

  resetButton.addEventListener('click', resetView);
  const stepAngle = Math.PI / 12;
  rotateLeft.addEventListener('click', () => {
    state.angleY -= stepAngle;
    draw();
  });
  rotateRight.addEventListener('click', () => {
    state.angleY += stepAngle;
    draw();
  });
  rotateXLeft.addEventListener('click', () => {
    state.angleX = Math.max(-Math.PI / 2, state.angleX - stepAngle);
    draw();
  });
  rotateXRight.addEventListener('click', () => {
    state.angleX = Math.min(Math.PI / 2, state.angleX + stepAngle);
    draw();
  });
  rotateZLeft.addEventListener('click', () => {
    state.angleZ -= stepAngle;
    draw();
  });
 rotateZRight.addEventListener('click', () => {
   state.angleZ += stepAngle;
   draw();
 });
  playButton.addEventListener('click', () => {
    if (state.animating) {
      state.animating = false;
      playButton.textContent = 'Play';
    } else {
      state.animating = true;
      state.revealIndex = 0;
      playButton.textContent = 'Pause';
      draw();
    }
  });

  window.addEventListener('resize', setCanvasSize);

  // 載入內嵌或外部 curves
  const embedded = Array.isArray(window.SKETCH_CURVES) ? window.SKETCH_CURVES : null;
  if (embedded && embedded.length) {
    applySketch(embedded, 'Rendering strokes from human 3D sketch data.');
  } else {
    setStatus('Loading Strokes.curves…');
    // # D:\sdfusion\sketch3D_final\data\HolmeSketcher\03001627\train\1bbe463ba96415aff1783a44a88d6274\Detail_0624122511
    fetch('Strokes.curves')
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then((text) => {
        const parsed = parseCurves(text);
        applySketch(parsed, 'Rendering strokes fetched from Strokes.curves.');
      })
      .catch((err) => {
        console.error('Failed to load Strokes.curves', err);
        setStatus('Unable to load sketch data. Ensure Strokes.curves is served via a local web server.');
      });
  }

  attachInteractions();
}

function syncObjZoom(zoomValue) {
  // 讓左邊 slider 控制右邊 OBJ viewer 的縮放
  if (!window.objViewerState) return;

  // sketch 的 zoom 範圍：0.6 ~ 2.5
  const minIn = 0.6;
  const maxIn = 2.5;

  // OBJ viewer 裡自己用 wheel 的範圍：0.35 ~ 3
  const minOut = 0.35;
  const maxOut = 3.0;

  // 轉成 0~1
  const t = Math.max(0, Math.min(1, (zoomValue - minIn) / (maxIn - minIn)));

  // 線性映射到 OBJ 的 zoom 範圍
  const mappedZoom = minOut + t * (maxOut - minOut);

  window.objViewerState.zoom = mappedZoom;
}

function initObjViewer() {
  const canvasIds = ['obj-viewer-left', 'obj-viewer-right'];
  const canvases = canvasIds.map((id) => document.getElementById(id)).filter(Boolean);
  if (!canvases.length) return;
  const contexts = canvases.map((canvas) => canvas.getContext('2d'));

  const state = {
    vertices: [],
    edges: [],
    faces: [],
    center: { x: 0, y: 0, z: 0 },
    radius: 1,
    angleX: 0,
    angleY: 0,
    angleZ: 0,
    zoom: 1,
    dragging: false,
    autoRotate: true,
    lastPos: { x: 0, y: 0 },
    message: 'Loading OBJ...'
  };
  window.objViewerState = state;

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
  const normalizeVec = (vec) => {
    const len = Math.hypot(vec.x, vec.y, vec.z) || 1;
    return { x: vec.x / len, y: vec.y / len, z: vec.z / len };
  };

  const setCanvasSize = () => {
    canvases.forEach((canvas, idx) => {
      const rect = canvas.getBoundingClientRect();
      const width = (rect.width || 320);
      const height = (rect.height || 260);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      contexts[idx].setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  };

  const rotatePoint = (p) => {
    const cosY = Math.cos(state.angleY);
    const sinY = Math.sin(state.angleY);
    const cosX = Math.cos(state.angleX);
    const sinX = Math.sin(state.angleX);
    const cosZ = Math.cos(state.angleZ);
    const sinZ = Math.sin(state.angleZ);

    // Y rotation
    const x1 = cosY * p.x + sinY * p.z;
    const z1 = -sinY * p.x + cosY * p.z;

    // X rotation
    const y2 = cosX * p.y - sinX * z1;
    const z2 = sinX * p.y + cosX * z1;

    // Z rotation
    const x3 = cosZ * x1 - sinZ * y2;
    const y3 = sinZ * x1 + cosZ * y2;

    return { x: x3, y: y3, z: z2 };
  };

  const project = (vertex, width, height, scale) => {
    const centered = {
      x: vertex.x - state.center.x,
      y: vertex.y - state.center.y,
      z: vertex.z - state.center.z
    };
    const rotated = rotatePoint(centered);
    return {
      x: width / 2 + rotated.x * scale,
      y: height / 2 - rotated.y * scale,
      depth: rotated.z,
      rotated
    };
  };

  const render = () => {
    const hasData = state.vertices.length > 0;
    canvases.forEach((canvas, idx) => {
      const ctx = contexts[idx];
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, width, height);

      if (!hasData) {
        if (idx === 0 && state.message) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '14px "Noto Sans", sans-serif';
          ctx.fillText(state.message, 20, 30);
        }
        return;
      }

      const scale = state.zoom * 0.45 * Math.min(width, height) / (state.radius || 1);
      const projected = state.vertices.map((v) => project(v, width, height, scale));

      if (state.faces.length) {
        const lightDir = normalizeVec({ x: 0.4, y: 0.75, z: 0.55 });
        const facesSorted = state.faces
          .map((indices) => {
            const pts = indices.map((idx) => projected[idx]);
            if (!pts.every(Boolean)) return null;
            const depth = pts.reduce((sum, p) => sum + p.depth, 0) / pts.length;
            const ra = pts[0].rotated;
            const rb = pts[1].rotated;
            const rc = pts[2].rotated;
            const ab = { x: rb.x - ra.x, y: rb.y - ra.y, z: rb.z - ra.z };
            const ac = { x: rc.x - ra.x, y: rc.y - ra.y, z: rc.z - ra.z };
            const normal = normalizeVec({
              x: ab.y * ac.z - ab.z * ac.y,
              y: ab.z * ac.x - ab.x * ac.z,
              z: ab.x * ac.y - ab.y * ac.x
            });
            const intensity = 0.35 + 0.65 * Math.max(0, normal.x * lightDir.x + normal.y * lightDir.y + normal.z * lightDir.z);
            return { pts, depth, intensity };
          })
          .filter(Boolean)
          .sort((a, b) => a.depth - b.depth);

        facesSorted.forEach((face) => {
          const shade = Math.round(175 + 60 * face.intensity);
          const strokeShade = Math.round(shade * 0.8);
          ctx.beginPath();
          ctx.moveTo(face.pts[0].x, face.pts[0].y);
          for (let i = 1; i < face.pts.length; i++) {
            ctx.lineTo(face.pts[i].x, face.pts[i].y);
          }
          ctx.closePath();
          ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
          ctx.strokeStyle = `rgb(${strokeShade}, ${strokeShade}, ${strokeShade})`;
          ctx.fill();
          ctx.stroke();
        });
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(38, 50, 80, 0.35)';
      state.edges.forEach(([a, b]) => {
        const va = projected[a];
        const vb = projected[b];
        if (!va || !vb) return;
        ctx.beginPath();
        ctx.moveTo(va.x, va.y);
        ctx.lineTo(vb.x, vb.y);
        ctx.stroke();
      });

      drawAxes(width, height, scale, ctx);
    });

    // if (hasData && !state.dragging && state.autoRotate) {
    //   state.angleY += 0.0015;
    // }

    requestAnimationFrame(render);
  };

  const drawAxes = (width, height, scale, ctx) => {
    const drawAxis = (vec, color, label) => {
      const startRot = { x: 0, y: 0, z: 0 };
      const endRot = { x: vec.x, y: vec.y, z: vec.z };
      const start = project(startRot, width, height, scale);
      const end = project(endRot, width, height, scale);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '11px "Noto Sans", sans-serif';
      ctx.fillText(label, end.x + 4, end.y - 4);
    };

    ctx.save();
    drawAxis({ x: 0, y: 0, z: state.radius * 0.7 }, '#ef4444', '+X');
    drawAxis({ x: 0, y: state.radius * 0.7, z: 0 }, '#22c55e', '+Y');
    drawAxis({ x: state.radius * 0.7, y: 0, z: 0 }, '#2563eb', '+Z');
    ctx.restore();
  };

  const parseOBJ = (text) => {
    const vertices = [];
    const edgesSet = new Set();
    const faces = [];
    const lines = text.split(/\r?\n/);
    const MAX_OBJ_EDGES = 4000;
    const MAX_OBJ_FACES = 2000;
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.startsWith('v ')) {
        const [, x, y, z] = trimmed.split(/\s+/);
        vertices.push({ x: parseFloat(x), y: parseFloat(y), z: parseFloat(z) });
      } else if (trimmed.startsWith('f ')) {
        const indices = trimmed
          .slice(2)
          .trim()
          .split(/\s+/)
          .map((token) => parseInt(token.split('/')[0], 10) - 1)
          .filter((idx) => idx >= 0);
        if (indices.length >= 3) faces.push(indices);
        for (let i = 0; i < indices.length; i++) {
          const a = indices[i];
          const b = indices[(i + 1) % indices.length];
          const key = a < b ? `${a}-${b}` : `${b}-${a}`;
          edgesSet.add(key);
        }
      }
    });
    const edgesRaw = Array.from(edgesSet).map((key) => key.split('-').map(Number));
    const downsample = (arr, limit) => {
      if (arr.length <= limit) return arr;
      const stride = Math.ceil(arr.length / limit);
      const reduced = [];
      for (let i = 0; i < arr.length && reduced.length < limit; i += stride) {
        reduced.push(arr[i]);
      }
      if (!reduced.length) reduced.push(arr[arr.length - 1]);
      return reduced;
    };
    const edges = downsample(edgesRaw, MAX_OBJ_EDGES);
    const facesOptimized = downsample(faces, MAX_OBJ_FACES);
    return { vertices, edges, faces: facesOptimized };
  };

  const computeStats = (verts) => {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    verts.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    });
    return {
      center: {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        z: (minZ + maxZ) / 2
      },
      radius: Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 || 1
    };
  };

  const handlePointerDown = (canvas) => (e) => {
    state.dragging = true;
    state.autoRotate = false;
    state.lastPos = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
      if (!state.dragging) return;
      const dx = e.clientX - state.lastPos.x;
      const dy = e.clientY - state.lastPos.y;
      state.lastPos = { x: e.clientX, y: e.clientY };

      state.angleY += dx * 0.0055;
      state.angleX += dy * 0.0055;
      state.angleX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.angleX));

      draw();

      // ⭐新增：同步旋轉到右邊 OBJ viewer
      syncObjRotation(state.angleX, state.angleY, state.angleZ);
  };

  const handlePointerUp = (canvas) => (e) => {
    state.dragging = false;
    canvas.releasePointerCapture && canvas.releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    state.zoom = clamp(state.zoom + delta, 0.35, 3);
  };

  canvases.forEach((canvas) => {
    canvas.addEventListener('pointerdown', handlePointerDown(canvas));
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp(canvas));
    canvas.addEventListener('wheel', handleWheel, { passive: false });
  });

  window.addEventListener('resize', setCanvasSize);

  setCanvasSize();
  render();

  fetch('1bbe463ba96415aff1783a44a88d6274.obj')
    .then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then((text) => {
      const { vertices, edges, faces } = parseOBJ(text);
      state.vertices = vertices;
      state.edges = edges;
      state.faces = faces;
      const stats = computeStats(vertices);
      state.center = stats.center;
      state.radius = stats.radius;
      state.message = '';
      setCanvasSize();
    })
    .catch((err) => {
      console.error('Failed to load OBJ viewer', err);
      state.message = 'Failed to load OBJ.';
    });
}

function syncObjRotation(angleX, angleY, angleZ) {
  if (!window.objViewerState) return;
  window.objViewerState.angleX = angleX;
  window.objViewerState.angleY = angleY;
  window.objViewerState.angleZ = angleZ;
}