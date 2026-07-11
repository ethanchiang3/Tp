import * as THREE from 'three';

// 依參數方程 (u,v) ∈ [0,1]² 建立網格，UV 即為參數本身
export function makeParametric(fn, uSeg, vSeg) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const p = new THREE.Vector3();

  for (let iv = 0; iv <= vSeg; iv++) {
    const v = iv / vSeg;
    for (let iu = 0; iu <= uSeg; iu++) {
      const u = iu / uSeg;
      fn(u, v, p);
      positions.push(p.x, p.y, p.z);
      uvs.push(u, v);
    }
  }

  const row = uSeg + 1;
  for (let iv = 0; iv < vSeg; iv++) {
    for (let iu = 0; iu < uSeg; iu++) {
      const a = iv * row + iu;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function buildVase() {
  const pts = [];
  const n = 32;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // 底部圓潤、中段鼓起、頸部收窄再外翻的瓶形輪廓
    const body = 0.32 + 0.55 * Math.sin(Math.PI * Math.pow(t, 0.85));
    const neck = 1 - 0.62 * Math.exp(-Math.pow((t - 0.88) / 0.09, 2));
    const lip = 1 + 0.25 * Math.exp(-Math.pow((t - 1.0) / 0.035, 2));
    pts.push(new THREE.Vector2(Math.max(0.05, body * neck * lip), (t - 0.5) * 2.4));
  }
  return new THREE.LatheGeometry(pts, 72);
}

export const SURFACES = {
  cylinder: {
    name: '圓柱',
    build: () => new THREE.CylinderGeometry(1, 1, 2.2, 72, 1, true),
  },
  sphere: {
    name: '球體',
    build: () => new THREE.SphereGeometry(1.25, 64, 32),
  },
  torus: {
    name: '圓環',
    build: () => new THREE.TorusGeometry(1, 0.42, 36, 72),
  },
  cone: {
    name: '圓錐',
    build: () => new THREE.ConeGeometry(1.1, 2.2, 72, 1, true),
  },
  wave: {
    name: '波浪面',
    build: () => makeParametric((u, v, p) => {
      p.set((u - 0.5) * 2.6, 0.38 * Math.sin(u * Math.PI * 2) * Math.cos(v * Math.PI * 2), (v - 0.5) * 2.6);
    }, 60, 60),
  },
  saddle: {
    name: '馬鞍面',
    build: () => makeParametric((u, v, p) => {
      const x = (u - 0.5) * 2.2;
      const z = (v - 0.5) * 2.2;
      p.set(x, 0.5 * (x * x - z * z), z);
    }, 50, 50),
  },
  vase: {
    name: '花瓶（旋轉曲面）',
    build: buildVase,
  },
};
