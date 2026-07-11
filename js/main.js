import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SURFACES } from './surfaces.js';
import { UNWRAP_METHODS, applyUnwrap } from './unwrap.js';
import { parseOBJ } from './objparser.js';

// ---------------------------------------------------------------- state

const state = {
  surfaceKey: 'cylinder',
  unwrapKey: 'native',
  customGeometry: null,   // 匯入的 OBJ（已置中縮放）
  customHasUV: false,
  geometry: null,         // 目前顯示中的幾何（含展開後 UV）
  image: null,            // 目前貼圖的來源影像（canvas 或 img）
  imageName: '棋盤格',
  // 貼圖變換（以 texture repeat/offset/rotation 表示，center 固定 0.5）
  repeat: new THREE.Vector2(1, 1),
  offset: new THREE.Vector2(0, 0),
  rotation: 0,
  wrap: 'repeat',
};

const WRAP_MODES = {
  repeat: THREE.RepeatWrapping,
  clamp: THREE.ClampToEdgeWrapping,
  mirror: THREE.MirroredRepeatWrapping,
};

// ---------------------------------------------------------------- 3D scene

const viewport = document.getElementById('viewport3d');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x181b22);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(3.2, 2.2, 3.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f52, 1.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
keyLight.position.set(3, 5, 2);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x8899cc, 0.5);
fillLight.position.set(-4, -2, -3);
scene.add(fillLight);

const grid = new THREE.GridHelper(8, 16, 0x333a4d, 0x232837);
grid.position.y = -1.6;
scene.add(grid);

const texture = new THREE.Texture();
texture.colorSpace = THREE.SRGBColorSpace;
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

const material = new THREE.MeshStandardMaterial({
  map: texture,
  side: THREE.DoubleSide,
  roughness: 0.65,
  metalness: 0.05,
});

const mesh = new THREE.Mesh(undefined, material);
scene.add(mesh);

const wireMaterial = new THREE.MeshBasicMaterial({
  wireframe: true,
  color: 0x000000,
  transparent: true,
  opacity: 0.28,
  depthTest: true,
});
const wireMesh = new THREE.Mesh(undefined, wireMaterial);
wireMesh.visible = false;
scene.add(wireMesh);

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// ---------------------------------------------------------------- UV editor

const uvCanvas = document.getElementById('uvCanvas');
const uvCtx = uvCanvas.getContext('2d');
let uvPath = null; // UV 線框的 Path2D（uv 座標系）
let uvView = { scale: 1, ox: 0, oy: 0 }; // uv → canvas px（y 向上）

function uvToCanvas(u, v) {
  return [uvView.ox + u * uvView.scale, uvView.oy - v * uvView.scale];
}

function canvasToUV(x, y) {
  return [(x - uvView.ox) / uvView.scale, (uvView.oy - y) / uvView.scale];
}

function buildUvPath(geom) {
  const uv = geom.attributes.uv;
  if (!uv) return null;
  const path = new Path2D();
  const tri = (a, b, c) => {
    path.moveTo(uv.getX(a), uv.getY(a));
    path.lineTo(uv.getX(b), uv.getY(b));
    path.lineTo(uv.getX(c), uv.getY(c));
    path.closePath();
  };
  const idx = geom.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) tri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
  } else {
    for (let i = 0; i < uv.count; i += 3) tri(i, i + 1, i + 2);
  }
  return path;
}

// 目前貼圖變換的矩陣（uv → 貼圖取樣座標）
function uvTransformMatrix(offset = state.offset, repeat = state.repeat, rotation = state.rotation) {
  return new THREE.Matrix3().setUvTransform(offset.x, offset.y, repeat.x, repeat.y, rotation, 0.5, 0.5);
}

function applyMatrix3ToCtx(ctx, m) {
  const e = m.elements; // column-major
  ctx.transform(e[0], e[1], e[3], e[4], e[6], e[7]);
}

// 在目前的 ctx 變換（uv 座標系）下，畫出貼圖影像（含環繞模式的鄰近圖磚）
function drawImageTiles(ctx, { previewNeighbors = true } = {}) {
  if (!state.image) return;
  const inv = uvTransformMatrix().invert();
  const range = state.wrap === 'clamp' ? 0 : (previewNeighbors ? 2 : 1);

  for (let j = -range; j <= range; j++) {
    for (let i = -range; i <= range; i++) {
      ctx.save();
      applyMatrix3ToCtx(ctx, inv);
      const flipX = state.wrap === 'mirror' && Math.abs(i) % 2 === 1;
      const flipY = state.wrap === 'mirror' && Math.abs(j) % 2 === 1;
      ctx.translate(i + (flipX ? 1 : 0), j + (flipY ? 1 : 0));
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      // 影像（y 向下）貼進單位 uv 方格（y 向上，v=1 是影像頂端）
      ctx.translate(0, 1);
      ctx.scale(1 / state.image.width, -1 / state.image.height);
      ctx.globalAlpha = (i === 0 && j === 0) ? 1 : 0.45;
      ctx.drawImage(state.image, 0, 0);
      ctx.restore();
    }
  }
}

function drawUV() {
  const w = uvCanvas.clientWidth, h = uvCanvas.clientHeight;
  if (w === 0 || h === 0) return;
  const dpr = Math.min(window.devicePixelRatio, 2);
  if (uvCanvas.width !== Math.round(w * dpr) || uvCanvas.height !== Math.round(h * dpr)) {
    uvCanvas.width = Math.round(w * dpr);
    uvCanvas.height = Math.round(h * dpr);
  }
  const ctx = uvCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#12141a';
  ctx.fillRect(0, 0, w, h);

  // 視圖：把 [-0.18, 1.18]² 塞進 canvas
  const span = 1.36;
  uvView.scale = Math.min(w, h) / span;
  uvView.ox = w / 2 - 0.5 * uvView.scale;
  uvView.oy = h / 2 + 0.5 * uvView.scale;

  // 貼圖影像
  ctx.save();
  ctx.setTransform(dpr * uvView.scale, 0, 0, -dpr * uvView.scale, dpr * uvView.ox, dpr * uvView.oy);
  ctx.beginPath();
  const clipPad = 0.5;
  ctx.rect(-clipPad, -clipPad, 1 + clipPad * 2, 1 + clipPad * 2);
  ctx.clip();
  drawImageTiles(ctx);
  ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 格線
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    let [x0, y0] = uvToCanvas(t, 0), [x1, y1] = uvToCanvas(t, 1);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    [x0, y0] = uvToCanvas(0, t); [x1, y1] = uvToCanvas(1, t);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }

  // UV 線框
  if (uvPath) {
    ctx.save();
    ctx.setTransform(dpr * uvView.scale, 0, 0, -dpr * uvView.scale, dpr * uvView.ox, dpr * uvView.oy);
    ctx.lineWidth = 1 / uvView.scale;
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.55)';
    ctx.stroke(uvPath);
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // UV 單位方格外框與軸標示
  const [bx0, by0] = uvToCanvas(0, 0);
  const [bx1, by1] = uvToCanvas(1, 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx0, by1, bx1 - bx0, by0 - by1);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '12px sans-serif';
  ctx.fillText('U →', bx1 - 28, by0 + 16);
  ctx.fillText('V ↑', bx0 - 26, by1 + 14);
  ctx.fillText('(0,0)', bx0 - 4, by0 + 16);
}

// ---------------------------------------------------------------- texture

function makeCheckerImage() {
  const size = 512, cells = 8;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d');
  const cell = size / cells;
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const hue = (col / cells) * 300;
      const light = (row + col) % 2 === 0 ? 62 : 38;
      ctx.fillStyle = `hsl(${hue}, 45%, ${light}%)`;
      ctx.fillRect(col * cell, row * cell, cell, cell);
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.font = `bold ${size / 10}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('UV', size / 2, size / 2);
  ctx.font = `bold ${size / 18}px sans-serif`;
  ctx.fillText('U →', size / 2, size - cell / 2);       // 底邊 = v=0
  ctx.save();
  ctx.translate(cell / 2, size / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('V →', 0, 0);
  ctx.restore();
  return cvs;
}

function setImage(image, name) {
  state.image = image;
  state.imageName = name;
  texture.image = image;
  texture.needsUpdate = true;
  updateTexture();
  updateStatus();
}

function updateTexture() {
  texture.wrapS = texture.wrapT = WRAP_MODES[state.wrap];
  texture.center.set(0.5, 0.5);
  texture.repeat.copy(state.repeat);
  texture.offset.copy(state.offset);
  texture.rotation = state.rotation;
  texture.needsUpdate = true;
  drawUV();
}

// ---------------------------------------------------------------- geometry

function currentBaseGeometry() {
  if (state.surfaceKey === 'custom') return state.customGeometry;
  return SURFACES[state.surfaceKey].build();
}

function rebuildGeometry() {
  const base = currentBaseGeometry();
  if (!base) return;

  let unwrapKey = state.unwrapKey;
  let geom = applyUnwrap(base, unwrapKey);
  if (!geom) {
    // 原生參數化但幾何沒有 UV（如未含 vt 的 OBJ）→ 改用方盒投影
    unwrapKey = 'box';
    geom = applyUnwrap(base, 'box');
    setStatusNote('此模型沒有內建 UV，已自動改用方盒投影');
    document.getElementById('unwrapSelect').value = 'box';
    state.unwrapKey = 'box';
  }
  if (base !== state.customGeometry && base !== geom) base.dispose();

  if (state.geometry) state.geometry.dispose();
  state.geometry = geom;
  mesh.geometry = geom;
  wireMesh.geometry = geom;
  uvPath = buildUvPath(geom);
  drawUV();
  updateStatus();
}

// ---------------------------------------------------------------- status bar

const statusbar = document.getElementById('statusbar');
let statusNote = '';
let statusNoteTimer = null;

function setStatusNote(msg) {
  statusNote = msg;
  updateStatus();
  clearTimeout(statusNoteTimer);
  statusNoteTimer = setTimeout(() => { statusNote = ''; updateStatus(); }, 6000);
}

function updateStatus() {
  const surfaceName = state.surfaceKey === 'custom' ? '自訂模型' : SURFACES[state.surfaceKey].name;
  const triCount = state.geometry
    ? Math.round((state.geometry.index ? state.geometry.index.count : state.geometry.attributes.position.count) / 3)
    : 0;
  const parts = [
    `曲面：${surfaceName}`,
    `三角形：${triCount.toLocaleString()}`,
    `展開：${UNWRAP_METHODS[state.unwrapKey]}`,
    `貼圖：${state.imageName}`,
  ];
  if (statusNote) parts.push(`⚠ ${statusNote}`);
  statusbar.textContent = parts.join('　·　');
}

// ---------------------------------------------------------------- UV canvas interaction

// 求出讓 fixedUv 對應到 targetSt 的 offset（其餘變換參數給定）
function solveOffset(fixedUv, targetSt, repeat, rotation) {
  const m0 = new THREE.Matrix3().setUvTransform(0, 0, repeat.x, repeat.y, rotation, 0.5, 0.5);
  const q = new THREE.Vector3(fixedUv.x, fixedUv.y, 1).applyMatrix3(m0);
  return new THREE.Vector2(targetSt.x - q.x, targetSt.y - q.y);
}

// 以 fixedUv 為錨點（保持該點取樣不變）套用新的 repeat / rotation
function retransformAround(fixedUv, newRepeat, newRotation) {
  const st = new THREE.Vector3(fixedUv.x, fixedUv.y, 1).applyMatrix3(uvTransformMatrix());
  state.repeat.copy(newRepeat);
  state.rotation = newRotation;
  state.offset.copy(solveOffset(fixedUv, new THREE.Vector2(st.x, st.y), newRepeat, newRotation));
}

// 目前圖片中心（貼圖取樣座標 0.5,0.5）對應的 uv 位置
function imageCenterUV() {
  const inv = uvTransformMatrix().clone().invert();
  const p = new THREE.Vector3(0.5, 0.5, 1).applyMatrix3(inv);
  return new THREE.Vector2(p.x, p.y);
}

let dragging = false;
let lastPointer = null;

uvCanvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastPointer = [e.offsetX, e.offsetY];
  uvCanvas.classList.add('dragging');
  uvCanvas.setPointerCapture(e.pointerId);
});

uvCanvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const [u0, v0] = canvasToUV(lastPointer[0], lastPointer[1]);
  const [u1, v1] = canvasToUV(e.offsetX, e.offsetY);
  lastPointer = [e.offsetX, e.offsetY];
  // 圖片在 uv 空間平移 d ⇒ offset -= R·S·d
  const d = new THREE.Vector2(u1 - u0, v1 - v0);
  const cos = Math.cos(state.rotation), sin = Math.sin(state.rotation);
  const sx = d.x * state.repeat.x, sy = d.y * state.repeat.y;
  state.offset.x -= cos * sx - sin * sy;
  state.offset.y -= sin * sx + cos * sy;
  syncSliders();
  updateTexture();
});

uvCanvas.addEventListener('pointerup', (e) => {
  dragging = false;
  uvCanvas.classList.remove('dragging');
  uvCanvas.releasePointerCapture(e.pointerId);
});

uvCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = Math.pow(1.0015, -e.deltaY); // 向上滾 = 放大圖片 = repeat 變小
  const newRepeat = state.repeat.clone().divideScalar(factor);
  newRepeat.clampScalar(0.05, 50);
  const [u, v] = canvasToUV(e.offsetX, e.offsetY);
  retransformAround(new THREE.Vector2(u, v), newRepeat, state.rotation);
  syncSliders();
  updateTexture();
}, { passive: false });

// ---------------------------------------------------------------- exports

function downloadCanvas(cvs, filename) {
  cvs.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}

function exportUvTemplate() {
  if (!uvPath) return;
  const size = 2048;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.setTransform(size, 0, 0, -size, 0, size); // uv [0,1] → 全幅，y 向上
  ctx.lineWidth = 1.5 / size;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.stroke(uvPath);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3 / size;
  ctx.strokeRect(0, 0, 1, 1);
  downloadCanvas(cvs, 'uv-template.png');
  setStatusNote('已匯出 UV 模板（2048×2048）');
}

function exportBakedTexture() {
  if (!state.image) return;
  const size = 2048;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d');
  ctx.setTransform(size, 0, 0, -size, 0, size);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 1, 1);
  ctx.clip();
  drawImageTiles(ctx, { previewNeighbors: true });
  ctx.restore();
  downloadCanvas(cvs, 'baked-texture.png');
  setStatusNote('已匯出合成貼圖（2048×2048）—— 直接以預設變換套用即可');
}

// ---------------------------------------------------------------- UI wiring

const surfaceSelect = document.getElementById('surfaceSelect');
for (const [key, def] of Object.entries(SURFACES)) {
  surfaceSelect.add(new Option(def.name, key));
}

const unwrapSelect = document.getElementById('unwrapSelect');
for (const [key, name] of Object.entries(UNWRAP_METHODS)) {
  unwrapSelect.add(new Option(name, key));
}

surfaceSelect.addEventListener('change', () => {
  state.surfaceKey = surfaceSelect.value;
  rebuildGeometry();
});

unwrapSelect.addEventListener('change', () => {
  state.unwrapKey = unwrapSelect.value;
  rebuildGeometry();
});

const imageInput = document.getElementById('imageInput');
document.getElementById('uploadImageBtn').addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', () => {
  if (imageInput.files[0]) loadImageFile(imageInput.files[0]);
  imageInput.value = '';
});

document.getElementById('checkerBtn').addEventListener('click', () => {
  setImage(makeCheckerImage(), '棋盤格');
});

const objInput = document.getElementById('objInput');
document.getElementById('uploadObjBtn').addEventListener('click', () => objInput.click());
objInput.addEventListener('change', () => {
  if (objInput.files[0]) loadObjFile(objInput.files[0]);
  objInput.value = '';
});

document.getElementById('wireframeChk').addEventListener('change', (e) => {
  wireMesh.visible = e.target.checked;
});

document.getElementById('exportTemplateBtn').addEventListener('click', exportUvTemplate);
document.getElementById('exportTextureBtn').addEventListener('click', exportBakedTexture);

// --- 貼圖變換控制列 ---

const scaleSlider = document.getElementById('scaleSlider');
const rotSlider = document.getElementById('rotSlider');
const offUSlider = document.getElementById('offUSlider');
const offVSlider = document.getElementById('offVSlider');
const wrapSelect = document.getElementById('wrapSelect');

function syncSliders() {
  const scale = 1 / state.repeat.x;
  scaleSlider.value = THREE.MathUtils.clamp(scale, +scaleSlider.min, +scaleSlider.max);
  rotSlider.value = Math.round(THREE.MathUtils.radToDeg(state.rotation));
  offUSlider.value = THREE.MathUtils.clamp(state.offset.x, -1, 1);
  offVSlider.value = THREE.MathUtils.clamp(state.offset.y, -1, 1);
  document.getElementById('scaleVal').textContent = scale.toFixed(2);
  document.getElementById('rotVal').textContent = `${Math.round(THREE.MathUtils.radToDeg(state.rotation))}°`;
  document.getElementById('offUVal').textContent = state.offset.x.toFixed(2);
  document.getElementById('offVVal').textContent = state.offset.y.toFixed(2);
}

scaleSlider.addEventListener('input', () => {
  const rep = 1 / +scaleSlider.value;
  retransformAround(imageCenterUV(), new THREE.Vector2(rep, rep), state.rotation);
  syncSliders();
  updateTexture();
});

rotSlider.addEventListener('input', () => {
  const rot = THREE.MathUtils.degToRad(+rotSlider.value);
  retransformAround(imageCenterUV(), state.repeat.clone(), rot);
  syncSliders();
  updateTexture();
});

offUSlider.addEventListener('input', () => {
  state.offset.x = +offUSlider.value;
  syncSliders();
  updateTexture();
});

offVSlider.addEventListener('input', () => {
  state.offset.y = +offVSlider.value;
  syncSliders();
  updateTexture();
});

wrapSelect.addEventListener('change', () => {
  state.wrap = wrapSelect.value;
  updateTexture();
});

document.getElementById('resetUvBtn').addEventListener('click', () => {
  state.repeat.set(1, 1);
  state.offset.set(0, 0);
  state.rotation = 0;
  syncSliders();
  updateTexture();
});

// --- 檔案載入 ---

function loadImageFile(file) {
  const img = new Image();
  img.onload = () => {
    setImage(img, file.name);
    URL.revokeObjectURL(img.src);
  };
  img.onerror = () => setStatusNote(`無法讀取圖片：${file.name}`);
  img.src = URL.createObjectURL(file);
}

function loadObjFile(file) {
  file.text().then((text) => {
    const { geometry, hasUV } = parseOBJ(text);
    if (state.customGeometry) state.customGeometry.dispose();
    state.customGeometry = geometry;
    state.customHasUV = hasUV;
    if (!surfaceSelect.querySelector('option[value="custom"]')) {
      surfaceSelect.add(new Option(`自訂：${file.name}`, 'custom'));
    } else {
      surfaceSelect.querySelector('option[value="custom"]').textContent = `自訂：${file.name}`;
    }
    surfaceSelect.value = 'custom';
    state.surfaceKey = 'custom';
    rebuildGeometry();
    setStatusNote(hasUV ? `已載入 ${file.name}` : `已載入 ${file.name}（無內建 UV）`);
  }).catch((err) => setStatusNote(`OBJ 解析失敗：${err.message}`));
}

// 拖放：圖片或 OBJ 都收
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (file.name.toLowerCase().endsWith('.obj')) loadObjFile(file);
  else if (file.type.startsWith('image/')) loadImageFile(file);
  else setStatusNote(`不支援的檔案類型：${file.name}`);
});

// ---------------------------------------------------------------- resize

function resize3D() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize3D).observe(viewport);
new ResizeObserver(drawUV).observe(uvCanvas);

// ---------------------------------------------------------------- init

setImage(makeCheckerImage(), '棋盤格');
rebuildGeometry();
syncSliders();
resize3D();
animate();
