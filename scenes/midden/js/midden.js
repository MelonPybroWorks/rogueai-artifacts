// midden.js — Deneubourg-style cemetery organization: a gross of undertakers sorting
// four kinds of pebbles into piles by pure local habit. Pure, no DOM.
export const TYPES = 4;
export const ANT_COUNT = 144;   // a gross

export class Midden {
  constructor(W, H, rng = Math.random) {
    this.W = W; this.H = H; this.rng = rng;
    this.cell = new Uint8Array(W * H);      // 0 empty, 1..TYPES pebble kinds
    this.ants = [];
    for (let i = 0; i < ANT_COUNT; i++) {
      this.ants.push({
        x: (rng() * W) | 0, y: (rng() * H) | 0,
        a: rng() * Math.PI * 2,             // heading
        carry: 0,                           // 0 empty-handed, else pebble kind
      });
    }
    this.moved = 0; this.picked = 0; this.dropped = 0;
  }
  scatter(count, type = 0, cx = null, cy = null, spread = 1e9) {
    let n = 0;
    for (let k = 0; k < count * 8 && n < count; k++) {
      let x, y;
      if (cx === null) { x = (this.rng() * this.W) | 0; y = (this.rng() * this.H) | 0; }
      else {
        const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * spread;
        x = (cx + Math.cos(a) * r) | 0; y = (cy + Math.sin(a) * r) | 0;
        if (x < 0 || y < 0 || x >= this.W || y >= this.H) continue;
      }
      const i = y * this.W + x;
      if (this.cell[i]) continue;
      this.cell[i] = type || (1 + (this.rng() * TYPES) | 0);
      n++;
    }
    return n;
  }
  disturb(cx, cy, r) {
    // shove pebbles out of a disc — the footprint of a disturbance
    const { cell, W, H } = this;
    let n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = cx + dx | 0, y = cy + dy | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (!cell[i]) continue;
      const na = this.rng() * Math.PI * 2, nr = r * (0.5 + this.rng());
      const tx = (cx + Math.cos(na) * nr) | 0, ty = (cy + Math.sin(na) * nr) | 0;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const ti = ty * W + tx;
      if (cell[ti]) continue;
      cell[ti] = cell[i]; cell[i] = 0; n++;
    }
    return n;
  }
  // same-kind neighbors in a 5x5 halo (excluding center)
  sameAround(x, y, type) {
    const { cell, W, H } = this;
    let d = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (cell[ny * W + nx] === type) d++;
    }
    return d;
  }
  step() {
    const { ants, cell, W, H, rng } = this;
    for (const a of ants) {
      // correlated walk
      a.a += (rng() - 0.5) * 0.9;
      const sp = a.carry ? 2.6 : 3.2;
      a.x += Math.cos(a.a) * sp; a.y += Math.sin(a.a) * sp;
      if (a.x < 1) { a.x = 1; a.a = Math.PI - a.a; } else if (a.x > W - 2) { a.x = W - 2; a.a = Math.PI - a.a; }
      if (a.y < 1) { a.y = 1; a.a = -a.a; } else if (a.y > H - 2) { a.y = H - 2; a.a = -a.a; }
      const x = a.x | 0, y = a.y | 0;
      const i = y * W + x;
      const c = cell[i];
      if (!a.carry) {
        if (c) {
          const d = this.sameAround(x, y, c);
          const p = (2.2 / (2.2 + d)) ** 2;    // lonely pebbles get lifted
          if (rng() < p) { a.carry = c; cell[i] = 0; this.picked++; }
        }
      } else {
        if (c) {
          const d = this.sameAround(x, y, a.carry);
          const p = (d / (3.5 + d)) ** 2;      // drop where kin gather
          if (rng() < p) {
            // drop in a free neighbor of this spot
            for (let tries = 0; tries < 6; tries++) {
              const nx = x + ((rng() * 5) | 0) - 2, ny = y + ((rng() * 5) | 0) - 2;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
              const ni = ny * W + nx;
              if (!cell[ni]) { cell[ni] = a.carry; a.carry = 0; this.dropped++; break; }
            }
          }
        }
      }
    }
  }
  // clustering metric: mean same-kind neighbors per pebble (rises as piles form)
  order() {
    const { cell, W, H } = this;
    let dSum = 0, n = 0;
    for (let y = 2; y < H - 2; y += 3) for (let x = 2; x < W - 2; x += 3) {
      const c = cell[y * W + x];
      if (c) { dSum += this.sameAround(x, y, c); n++; }
    }
    return n ? dSum / n : 0;
  }
}
