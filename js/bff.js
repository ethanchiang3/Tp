import * as THREE from 'three';

// Boundary First Flattening（Sawhney & Crane 2017）的簡化實作：
//   1. 頂點熔接 + 拓撲檢查，非圓盤拓撲自動切縫成圓盤
//   2. 解 Yamabe 方程（u_B = 0）得到目標邊界測地曲率 k̃
//   3. 以原邊界長度 + k̃ 走出平面邊界多邊形（強制閉合）
//   4. cotan Laplacian 調和延拓求出內部 UV
// 內部延拓用的是調和延拓（而非論文的調和共軛），對高度非凸的
// 邊界可能出現翻面，但對常見曲面已足夠。

const EPS = 1e-12;

// ---------------------------------------------------------------- helpers

function weldVertices(pos) {
  // 以位置熔接（容差相對於包圍盒大小），回傳 corner→welded 對照與頂點座標
  const count = pos.count;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < count * 3; i++) {
    const v = pos.array[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const scale = (max - min) || 1;
  const cell = scale * 1e-6;
  const map = new Map();
  const cornerTo = new Int32Array(count);
  const verts = [];
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${Math.round(x / cell)}_${Math.round(y / cell)}_${Math.round(z / cell)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = verts.length;
      verts.push([x, y, z]);
      map.set(key, id);
    }
    cornerTo[i] = id;
  }
  return { cornerTo, verts };
}

function edgeKey(a, b, V) {
  return a < b ? a * V + b : b * V + a;
}

function buildEdges(faces, V) {
  // undirected edge → 相鄰面；directed halfedge 集合
  const edges = new Map();
  const directed = new Set();
  const F = faces.length / 3;
  for (let f = 0; f < F; f++) {
    for (let c = 0; c < 3; c++) {
      const a = faces[f * 3 + c], b = faces[f * 3 + (c + 1) % 3];
      directed.add(a * V + b);
      const k = edgeKey(a, b, V);
      let e = edges.get(k);
      if (!e) { e = []; edges.set(k, e); }
      e.push(f);
    }
  }
  return { edges, directed };
}

function findBoundaryLoops(faces, V) {
  const { edges, directed } = buildEdges(faces, V);
  for (const fs of edges.values()) {
    if (fs.length > 2) throw new Error('模型含有非流形邊（同一條邊接超過兩個面），BFF 無法處理');
  }
  // 外側 halfedge：面上有 (a,b) 但沒有反向 (b,a) → 邊界，外側方向為 b→a。
  // 直接掃每個面的 halfedge，每條邊界邊恰好處理一次。
  const out = new Map();
  const F = faces.length / 3;
  for (let f = 0; f < F; f++) {
    for (let c = 0; c < 3; c++) {
      const a = faces[f * 3 + c], b = faces[f * 3 + (c + 1) % 3];
      if (!directed.has(b * V + a)) {
        if (out.has(b)) throw new Error('模型的邊界結構非流形（頂點接多段邊界），BFF 無法處理');
        out.set(b, a);
      }
    }
  }
  const loops = [];
  const seen = new Set();
  for (const start of out.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let v = start;
    do {
      loop.push(v);
      seen.add(v);
      v = out.get(v);
      if (v === undefined) throw new Error('邊界迴圈中斷，模型可能非流形');
    } while (v !== start && loop.length <= out.size);
    loops.push(loop);
  }
  return { loops, edges };
}

function buildAdjacency(faces, verts, V) {
  const adj = new Map(); // v -> Map(neighbor -> length)
  const get = (v) => { let m = adj.get(v); if (!m) { m = new Map(); adj.set(v, m); } return m; };
  const F = faces.length / 3;
  for (let f = 0; f < F; f++) {
    for (let c = 0; c < 3; c++) {
      const a = faces[f * 3 + c], b = faces[f * 3 + (c + 1) % 3];
      if (!get(a).has(b)) {
        const pa = verts[a], pb = verts[b];
        const l = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
        get(a).set(b, l);
        get(b).set(a, l);
      }
    }
  }
  return adj;
}

// 簡單二元堆的 Dijkstra；sources 距離 0，碰到 targets 中任一點即回傳路徑
function dijkstra(adj, V, sources, targets = null) {
  const dist = new Float64Array(V).fill(Infinity);
  const prev = new Int32Array(V).fill(-1);
  const heap = [];
  const push = (d, v) => {
    heap.push([d, v]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const targetSet = targets ? new Set(targets) : null;
  for (const s of sources) { dist[s] = 0; push(0, s); }
  let hit = -1;
  while (heap.length) {
    const [d, v] = pop();
    if (d > dist[v]) continue;
    if (targetSet && targetSet.has(v)) { hit = v; break; }
    const nbrs = adj.get(v);
    if (!nbrs) continue;
    for (const [w, l] of nbrs) {
      const nd = d + l;
      if (nd < dist[w]) { dist[w] = nd; prev[w] = v; push(nd, w); }
    }
  }
  return { dist, prev, hit };
}

function tracePath(prev, end) {
  const path = [];
  for (let v = end; v !== -1; v = prev[v]) path.push(v);
  return path.reverse();
}

// 沿頂點路徑切縫：路徑上每個頂點把周圍的面依路徑邊分成兩群，
// 其中一群改用複製出的新頂點。狹縫端點（只有一條路徑邊）自然不分割。
function cutAlongPath(faces, verts, path) {
  const alias = new Map(); // 原路徑頂點 -> 所有分身 id
  for (const v of path) alias.set(v, [v]);

  const F = faces.length / 3;
  const vertFaces = new Map();
  for (let f = 0; f < F; f++) {
    for (let c = 0; c < 3; c++) {
      const v = faces[f * 3 + c];
      if (!alias.has(v)) continue;
      let list = vertFaces.get(v);
      if (!list) { list = []; vertFaces.set(v, list); }
      list.push(f);
    }
  }

  for (let i = 0; i < path.length; i++) {
    const v = path[i];
    const blocked = new Set();
    if (i > 0) for (const a of alias.get(path[i - 1])) blocked.add(a);
    if (i < path.length - 1) for (const a of alias.get(path[i + 1])) blocked.add(a);

    const inc = vertFaces.get(v) || [];
    if (inc.length === 0) continue;

    // 以「共用一條含 v 且未被擋住的邊」建立面之間的相鄰關係
    const edgeToFaces = new Map(); // 對面頂點 w -> faces
    for (const f of inc) {
      for (let c = 0; c < 3; c++) {
        const w = faces[f * 3 + c];
        if (w === v) continue;
        let list = edgeToFaces.get(w);
        if (!list) { list = []; edgeToFaces.set(w, list); }
        list.push(f);
      }
    }
    const nbrFaces = new Map();
    for (const [w, fs] of edgeToFaces) {
      if (blocked.has(w) || fs.length !== 2) continue;
      for (let k = 0; k < 2; k++) {
        let list = nbrFaces.get(fs[k]);
        if (!list) { list = []; nbrFaces.set(fs[k], list); }
        list.push(fs[1 - k]);
      }
    }

    // 找連通分量
    const compOf = new Map();
    let nComp = 0;
    for (const f0 of inc) {
      if (compOf.has(f0)) continue;
      const stack = [f0];
      compOf.set(f0, nComp);
      while (stack.length) {
        const f = stack.pop();
        for (const g of (nbrFaces.get(f) || [])) {
          if (!compOf.has(g)) { compOf.set(g, nComp); stack.push(g); }
        }
      }
      nComp++;
    }
    if (nComp < 2) continue;

    // 第 0 群保留原 id，其餘每群用新頂點
    const newIds = [v];
    for (let k = 1; k < nComp; k++) {
      const id = verts.length;
      verts.push(verts[v].slice());
      newIds.push(id);
      alias.get(v).push(id);
    }
    for (const f of inc) {
      const k = compOf.get(f);
      if (k === 0) continue;
      for (let c = 0; c < 3; c++) {
        if (faces[f * 3 + c] === v) faces[f * 3 + c] = newIds[k];
      }
    }
  }
}

// cotan Laplacian（PSD 慣例：(A x)_i = Σ w_ij (x_i − x_j)）與各頂點角度和
function buildLaplacian(faces, verts, V) {
  const W = new Map(); // v -> Map(neighbor -> weight)
  const angleSum = new Float64Array(V);
  const getW = (v) => { let m = W.get(v); if (!m) { m = new Map(); W.set(v, m); } return m; };
  const addW = (a, b, w) => {
    const ma = getW(a);
    ma.set(b, (ma.get(b) || 0) + w);
    const mb = getW(b);
    mb.set(a, (mb.get(a) || 0) + w);
  };
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const F = faces.length / 3;
  for (let f = 0; f < F; f++) {
    const ids = [faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]];
    for (let c = 0; c < 3; c++) {
      const i = ids[c], j = ids[(c + 1) % 3], k = ids[(c + 2) % 3];
      const pi = verts[i], pj = verts[j], pk = verts[k];
      e1.set(pi[0] - pk[0], pi[1] - pk[1], pi[2] - pk[2]);
      e2.set(pj[0] - pk[0], pj[1] - pk[1], pj[2] - pk[2]);
      const cross = e1.clone().cross(e2).length();
      const dot = e1.dot(e2);
      const angle = Math.atan2(cross, dot);
      angleSum[k] += angle;
      const cot = THREE.MathUtils.clamp(dot / Math.max(cross, EPS), -1e3, 1e3);
      addW(i, j, 0.5 * cot);
    }
  }
  return { W, angleSum };
}

// 預條件共軛梯度法解 A_II x = b（interior 以 compact 索引）
function solveCG(csr, b, tol = 1e-9, maxIter = 5000) {
  const n = b.length;
  const x = new Float64Array(n);
  const r = Float64Array.from(b);
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  const Ap = new Float64Array(n);
  const { rowPtr, colIdx, vals, diag } = csr;

  const applyA = (src, dst) => {
    for (let i = 0; i < n; i++) {
      let s = diag[i] * src[i];
      for (let k = rowPtr[i]; k < rowPtr[i + 1]; k++) s += vals[k] * src[colIdx[k]];
      dst[i] = s;
    }
  };

  let bNorm = 0;
  for (let i = 0; i < n; i++) bNorm += b[i] * b[i];
  bNorm = Math.sqrt(bNorm);
  if (bNorm < EPS) return x;

  for (let i = 0; i < n; i++) { z[i] = r[i] / diag[i]; p[i] = z[i]; }
  let rz = 0;
  for (let i = 0; i < n; i++) rz += r[i] * z[i];

  for (let iter = 0; iter < maxIter; iter++) {
    applyA(p, Ap);
    let pAp = 0;
    for (let i = 0; i < n; i++) pAp += p[i] * Ap[i];
    if (Math.abs(pAp) < EPS) break;
    const alpha = rz / pAp;
    let rNorm = 0;
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * Ap[i];
      rNorm += r[i] * r[i];
    }
    if (Math.sqrt(rNorm) < tol * bNorm) break;
    for (let i = 0; i < n; i++) z[i] = r[i] / diag[i];
    let rzNew = 0;
    for (let i = 0; i < n; i++) rzNew += r[i] * z[i];
    const beta = rzNew / rz;
    rz = rzNew;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
  }
  return x;
}

// ---------------------------------------------------------------- main

export function bffUnwrap(geometry) {
  const base = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const pos = base.attributes.position;

  // 1. 熔接 + 面表
  const { cornerTo, verts } = weldVertices(pos);
  const faces = Array.from(cornerTo);

  // 2. 拓撲檢查與自動切縫
  let V = verts.length;
  let { loops } = findBoundaryLoops(faces, V);

  // 多個邊界迴圈：在迴圈之間切開直到剩一個
  let guard = 0;
  while (loops.length > 1 && guard++ < 8) {
    const adj = buildAdjacency(faces, verts, verts.length);
    const { prev, hit } = dijkstra(adj, verts.length, loops[0], loops[1]);
    if (hit < 0) throw new Error('模型不連通（有多個獨立部件），BFF 無法處理');
    cutAlongPath(faces, verts, tracePath(prev, hit));
    ({ loops } = findBoundaryLoops(faces, verts.length));
  }
  // 封閉曲面：切一道狹縫製造邊界
  if (loops.length === 0) {
    const adj = buildAdjacency(faces, verts, verts.length);
    const d1 = dijkstra(adj, verts.length, [0]);
    let far1 = 0;
    for (let i = 0; i < verts.length; i++) if (isFinite(d1.dist[i]) && d1.dist[i] > d1.dist[far1]) far1 = i;
    const d2 = dijkstra(adj, verts.length, [far1]);
    let far2 = far1;
    for (let i = 0; i < verts.length; i++) if (isFinite(d2.dist[i]) && d2.dist[i] > d2.dist[far2]) far2 = i;
    cutAlongPath(faces, verts, tracePath(d2.prev, far2));
    ({ loops } = findBoundaryLoops(faces, verts.length));
  }

  V = verts.length;
  const E = buildEdges(faces, V).edges.size;
  const chi = V - E + faces.length / 3;
  if (loops.length !== 1 || chi !== 1) {
    throw new Error('切縫後仍非圓盤拓撲（如圓環等高虧格曲面），BFF 暫不支援');
  }
  const loop = loops[0];

  // 3. 曲率與 Laplacian
  const { W, angleSum } = buildLaplacian(faces, verts, V);
  const isBoundary = new Uint8Array(V);
  for (const v of loop) isBoundary[v] = 1;

  const interior = [];
  const compact = new Int32Array(V).fill(-1);
  for (let i = 0; i < V; i++) {
    if (!isBoundary[i]) { compact[i] = interior.length; interior.push(i); }
  }

  // A_II 的 CSR（對角另存，兼作 Jacobi 預條件）
  const rowPtr = new Int32Array(interior.length + 1);
  const colIdx = [], vals = [];
  const diag = new Float64Array(interior.length);
  for (let ci = 0; ci < interior.length; ci++) {
    const i = interior[ci];
    let d = 0;
    for (const [j, w] of (W.get(i) || [])) {
      d += w;
      if (compact[j] >= 0) { colIdx.push(compact[j]); vals.push(-w); }
    }
    diag[ci] = Math.max(d, EPS);
    rowPtr[ci + 1] = colIdx.length;
  }
  const csr = { rowPtr, colIdx: Int32Array.from(colIdx), vals: Float64Array.from(vals), diag };

  // 4. Yamabe：u_B = 0，解 A_II u_I = Ω_I
  const rhsU = new Float64Array(interior.length);
  for (let ci = 0; ci < interior.length; ci++) rhsU[ci] = 2 * Math.PI - angleSum[interior[ci]];
  const uI = solveCG(csr, rhsU);
  const u = new Float64Array(V);
  for (let ci = 0; ci < interior.length; ci++) u[interior[ci]] = uI[ci];

  // 目標測地曲率 k̃ = k − (A u)|_B
  const kTilde = new Map();
  for (const v of loop) {
    let Au = 0;
    for (const [j, w] of (W.get(v) || [])) Au += w * (u[v] - u[j]);
    kTilde.set(v, Math.PI - angleSum[v] - Au);
  }

  // 5. 走出平面邊界多邊形（邊長用原始長度，因 u_B = 0）
  const m = loop.length;
  const lens = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const a = verts[loop[i]], b = verts[loop[(i + 1) % m]];
    lens[i] = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  const bx = new Float64Array(m), by = new Float64Array(m);
  let phi = 0;
  for (let i = 0; i < m - 1; i++) {
    bx[i + 1] = bx[i] + lens[i] * Math.cos(phi);
    by[i + 1] = by[i] + lens[i] * Math.sin(phi);
    phi += kTilde.get(loop[i + 1]);
  }
  // 依累積弧長分攤閉合誤差
  const gapX = bx[m - 1] + lens[m - 1] * Math.cos(phi);
  const gapY = by[m - 1] + lens[m - 1] * Math.sin(phi);
  let total = 0;
  for (let i = 0; i < m; i++) total += lens[i];
  let acc = 0;
  for (let i = 1; i < m; i++) {
    acc += lens[i - 1];
    bx[i] -= gapX * (acc / total);
    by[i] -= gapY * (acc / total);
  }

  // 6. 調和延拓：A_II x_I = Σ w_ij x_Bj
  const uvX = new Float64Array(V), uvY = new Float64Array(V);
  for (let i = 0; i < m; i++) { uvX[loop[i]] = bx[i]; uvY[loop[i]] = by[i]; }
  const rhsX = new Float64Array(interior.length);
  const rhsY = new Float64Array(interior.length);
  for (let ci = 0; ci < interior.length; ci++) {
    const i = interior[ci];
    for (const [j, w] of (W.get(i) || [])) {
      if (isBoundary[j]) { rhsX[ci] += w * uvX[j]; rhsY[ci] += w * uvY[j]; }
    }
  }
  const xI = solveCG(csr, rhsX);
  const yI = solveCG(csr, rhsY);
  for (let ci = 0; ci < interior.length; ci++) {
    uvX[interior[ci]] = xI[ci];
    uvY[interior[ci]] = yI[ci];
  }

  // 7. 方向修正（避免鏡像）＋ 等比例縮放進 [0,1]
  let area = 0;
  for (let f = 0; f < faces.length / 3; f++) {
    const a = faces[f * 3], b = faces[f * 3 + 1], c = faces[f * 3 + 2];
    area += (uvX[b] - uvX[a]) * (uvY[c] - uvY[a]) - (uvX[c] - uvX[a]) * (uvY[b] - uvY[a]);
  }
  if (area < 0) for (let i = 0; i < V; i++) uvX[i] = -uvX[i];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < V; i++) {
    if (uvX[i] < minX) minX = uvX[i];
    if (uvX[i] > maxX) maxX = uvX[i];
    if (uvY[i] < minY) minY = uvY[i];
    if (uvY[i] > maxY) maxY = uvY[i];
  }
  const scale = 1 / Math.max(maxX - minX, maxY - minY, EPS);
  const padX = (1 - (maxX - minX) * scale) / 2;
  const padY = (1 - (maxY - minY) * scale) / 2;

  const outUV = new Float32Array(pos.count * 2);
  for (let corner = 0; corner < pos.count; corner++) {
    const v = faces[corner];
    outUV[corner * 2] = (uvX[v] - minX) * scale + padX;
    outUV[corner * 2 + 1] = (uvY[v] - minY) * scale + padY;
  }
  base.setAttribute('uv', new THREE.BufferAttribute(outUV, 2));
  return base;
}
