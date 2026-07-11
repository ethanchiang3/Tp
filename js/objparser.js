import * as THREE from 'three';

// 極簡 OBJ 解析器：支援 v / vt / vn / f（多邊形以扇形三角化、支援負索引），
// 產生非索引 BufferGeometry，並將模型置中、縮放到適合檢視的大小。
export function parseOBJ(text) {
  const vs = [], vts = [], vns = [];
  const positions = [], uvs = [], normals = [];
  let hasUV = false, hasNormal = false;

  const resolve = (idx, len) => (idx > 0 ? idx - 1 : len + idx);

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);

    switch (parts[0]) {
      case 'v':
        vs.push([+parts[1], +parts[2], +parts[3]]);
        break;
      case 'vt':
        vts.push([+parts[1], +parts[2]]);
        break;
      case 'vn':
        vns.push([+parts[1], +parts[2], +parts[3]]);
        break;
      case 'f': {
        const verts = parts.slice(1).map((s) => {
          const [vi, ti, ni] = s.split('/');
          return {
            v: resolve(+vi, vs.length),
            t: ti ? resolve(+ti, vts.length) : -1,
            n: ni ? resolve(+ni, vns.length) : -1,
          };
        });
        for (let i = 1; i + 1 < verts.length; i++) {
          for (const w of [verts[0], verts[i], verts[i + 1]]) {
            const p = vs[w.v];
            if (!p) continue;
            positions.push(p[0], p[1], p[2]);
            if (w.t >= 0 && vts[w.t]) {
              uvs.push(vts[w.t][0], vts[w.t][1]);
              hasUV = true;
            } else {
              uvs.push(0, 0);
            }
            if (w.n >= 0 && vns[w.n]) {
              normals.push(vns[w.n][0], vns[w.n][1], vns[w.n][2]);
              hasNormal = true;
            } else {
              normals.push(0, 0, 0);
            }
          }
        }
        break;
      }
    }
  }

  if (positions.length === 0) throw new Error('OBJ 檔中找不到任何面（f 行）');

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (hasUV) geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (hasNormal) geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  else geom.computeVertexNormals();

  // 置中並縮放到最大邊長 2.4
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  const center = new THREE.Vector3();
  bb.getCenter(center);
  const size = new THREE.Vector3().subVectors(bb.max, bb.min);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  geom.translate(-center.x, -center.y, -center.z);
  geom.scale(2.4 / maxDim, 2.4 / maxDim, 2.4 / maxDim);

  return { geometry: geom, hasUV };
}
