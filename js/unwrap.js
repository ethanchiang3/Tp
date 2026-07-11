import * as THREE from 'three';
import { bffUnwrap } from './bff.js';

export const UNWRAP_METHODS = {
  native: '原生參數化',
  bff: 'BFF 保角展開',
  planar: '平面投影',
  cylinder: '圓柱投影',
  sphere: '球面投影',
  box: '方盒投影',
};

// 對每個三角形檢查 u 是否橫跨了 0/1 接縫（atan2 的不連續處），
// 是的話把小的那側 +1，讓三角形在 UV 空間保持連續。
function fixSeam(uvArr) {
  for (let i = 0; i < uvArr.length; i += 6) {
    const u0 = uvArr[i], u1 = uvArr[i + 2], u2 = uvArr[i + 4];
    const max = Math.max(u0, u1, u2);
    const min = Math.min(u0, u1, u2);
    if (max - min > 0.5) {
      for (let k = 0; k < 3; k++) {
        if (uvArr[i + k * 2] < 0.5) uvArr[i + k * 2] += 1;
      }
    }
  }
}

// 投影類展開需要逐三角形設定 UV，因此一律轉為非索引幾何
function prepare(geom) {
  const g = geom.index ? geom.toNonIndexed() : geom.clone();
  g.computeBoundingBox();
  return g;
}

function planarUnwrap(geom) {
  const g = prepare(geom);
  const bb = g.boundingBox;
  const size = new THREE.Vector3().subVectors(bb.max, bb.min);
  // 沿最薄的方向投影（保留面積最大的那一面）
  let axis = 0;
  if (size.y <= size.x && size.y <= size.z) axis = 1;
  else if (size.z <= size.x && size.z <= size.y) axis = 2;
  const [ax, ay] = [[1, 2], [0, 2], [0, 1]][axis];

  const pos = g.attributes.position;
  const comps = ['x', 'y', 'z'];
  const minA = bb.min.getComponent(ax), spanA = size.getComponent(ax) || 1;
  const minB = bb.min.getComponent(ay), spanB = size.getComponent(ay) || 1;
  const uv = new Float32Array(pos.count * 2);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    uv[i * 2] = (p[comps[ax]] - minA) / spanA;
    uv[i * 2 + 1] = (p[comps[ay]] - minB) / spanB;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function cylinderUnwrap(geom) {
  const g = prepare(geom);
  const bb = g.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  const minY = bb.min.y, spanY = (bb.max.y - bb.min.y) || 1;

  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - cx;
    const z = pos.getZ(i) - cz;
    uv[i * 2] = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
    uv[i * 2 + 1] = (pos.getY(i) - minY) / spanY;
  }
  fixSeam(uv);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function sphereUnwrap(geom) {
  const g = prepare(geom);
  const bb = g.boundingBox;
  const center = new THREE.Vector3();
  bb.getCenter(center);

  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).sub(center);
    const len = d.length() || 1;
    uv[i * 2] = Math.atan2(d.z, d.x) / (Math.PI * 2) + 0.5;
    uv[i * 2 + 1] = 1 - Math.acos(THREE.MathUtils.clamp(d.y / len, -1, 1)) / Math.PI;
  }
  fixSeam(uv);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function boxUnwrap(geom) {
  const g = prepare(geom);
  const bb = g.boundingBox;
  const size = new THREE.Vector3().subVectors(bb.max, bb.min);
  size.x = size.x || 1; size.y = size.y || 1; size.z = size.z || 1;

  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  const comps = ['x', 'y', 'z'];

  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const nx = Math.abs(n.x), ny = Math.abs(n.y), nz = Math.abs(n.z);
    // 以三角形法線的主軸決定投影平面
    let ax, ay;
    if (nx >= ny && nx >= nz) [ax, ay] = [2, 1];
    else if (ny >= nx && ny >= nz) [ax, ay] = [0, 2];
    else [ax, ay] = [0, 1];
    for (let k = 0; k < 3; k++) {
      const v = [a, b, c][k];
      uv[(i + k) * 2] = (v[comps[ax]] - bb.min.getComponent(ax)) / size.getComponent(ax);
      uv[(i + k) * 2 + 1] = (v[comps[ay]] - bb.min.getComponent(ay)) / size.getComponent(ay);
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// 回傳帶有新 UV 的幾何。native 表示沿用幾何本身的參數化 UV。
// bff 在拓撲不支援時會 throw（帶說明訊息）。
export function applyUnwrap(baseGeom, method) {
  switch (method) {
    case 'bff': return bffUnwrap(baseGeom);
    case 'planar': return planarUnwrap(baseGeom);
    case 'cylinder': return cylinderUnwrap(baseGeom);
    case 'sphere': return sphereUnwrap(baseGeom);
    case 'box': return boxUnwrap(baseGeom);
    case 'native':
    default:
      if (!baseGeom.attributes.uv) return null; // 交由呼叫端決定 fallback
      return baseGeom.clone();
  }
}
