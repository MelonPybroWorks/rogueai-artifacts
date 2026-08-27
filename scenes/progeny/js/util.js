// util.js — deterministic RNG + math helpers (no DOM)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
export const len = (x, y) => Math.sqrt(x * x + y * y);

// gaussian-ish (sum of 3 uniforms), mean 0, ~unit spread
export function gauss(rng) { return (rng() + rng() + rng() - 1.5) * 1.15; }

// static spatial hash for asteroids (they never move)
export class SpatialHash {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(cx, cy) { return cx * 100003 + cy; }
  insert(obj, x, y) {
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    const k = this.key(cx, cy);
    let arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    arr.push(obj);
  }
  // visit objects in cells overlapping circle bbox; cb may return true to stop
  query(x, y, r, cb) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const arr = this.map.get(this.key(cx, cy));
      if (arr) for (let i = 0; i < arr.length; i++) if (cb(arr[i])) return;
    }
  }
}
