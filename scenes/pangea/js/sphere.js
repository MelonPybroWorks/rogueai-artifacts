// sphere.js — icosphere mesh, face adjacency, biome field (no DOM)
import { CFG } from './config.js';

// value-noise on the sphere (cheap fBm from hashed lattice directions)
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296);
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w);
}
export function fbm(x, y, z, oct = 4) {
  let s = 0, amp = 1, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f, z * f) * amp; norm += amp; amp *= 0.5; f *= 2.1; }
  return s / norm;
}

export class Sphere {
  constructor(rng) {
    this.rng = rng;
    this.build();
    this.assignBiomes();
  }

  build() {
    // icosahedron
    const t = (1 + Math.sqrt(5)) / 2;
    let V = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map(v => { const l = Math.hypot(...v); return v.map(c => c / l); });
    let F = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    for (let s = 0; s < CFG.SUBDIV; s++) {
      const mid = new Map();
      const getMid = (a, b) => {
        const k = a < b ? a * 100000 + b : b * 100000 + a;
        let m = mid.get(k);
        if (m === undefined) {
          const va = V[a], vb = V[b];
          let v = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
          const l = Math.hypot(...v); v = v.map(c => c / l);
          m = V.length; V.push(v); mid.set(k, m);
        }
        return m;
      };
      const F2 = [];
      for (const [a, b, c] of F) {
        const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a);
        F2.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      F = F2;
    }
    this.V = V; this.F = F;

    // face centers + normals (unit sphere → same thing)
    this.C = F.map(([a, b, c]) => {
      const va = V[a], vb = V[b], vc = V[c];
      let x = va[0] + vb[0] + vc[0], y = va[1] + vb[1] + vc[1], z = va[2] + vb[2] + vc[2];
      const l = Math.hypot(x, y, z);
      return [x / l, y / l, z / l];
    });

    // face adjacency via shared edges
    this.adj = F.map(() => []);
    const edge = new Map();
    F.forEach(([a, b, c], fi) => {
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const k = p < q ? p * 100000 + q : q * 100000 + p;
        const prev = edge.get(k);
        if (prev === undefined) edge.set(k, fi);
        else { this.adj[fi].push(prev); this.adj[prev].push(fi); }
      }
    });
  }

  assignBiomes() {
    const off = this.rng() * 900;
    this.faces = this.C.map((c, i) => {
      const [x, y, z] = c;
      const h = fbm(x * 2.3 + off, y * 2.3 + off, z * 2.3 + off, 4);         // elevation
      const m = fbm(x * 3.1 + off + 50, y * 3.1 + off + 50, z * 3.1 + off + 50, 3); // moisture
      const land = h > 0.52;
      // fertility: moist mid-elevation land
      const fert = land ? Math.max(0.08, Math.min(1, (m * 1.4 - 0.2) * (1.2 - Math.abs(h - 0.62) * 3))) : 0;
      return {
        i, h, m, land, fert,
        plants: land ? fert * CFG.PLANT_MAX * (0.4 + this.rng() * 0.6) : 0,
        scorch: 0,              // meteor darkening
        biome: !land ? 0 : h > 0.72 ? 3 : m < 0.34 ? 2 : m > 0.62 ? 4 : 1,  // ocean/hill/arid/lush/plain
      };
    });
  }

  faceAt(dir) {
    // nearest face center to a unit direction (brute force is fine for 1280)
    let best = 0, bd = -2;
    for (let i = 0; i < this.C.length; i++) {
      const c = this.C[i];
      const d = c[0] * dir[0] + c[1] * dir[1] + c[2] * dir[2];
      if (d > bd) { bd = d; best = i; }
    }
    return best;
  }
}
