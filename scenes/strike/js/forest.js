// forest.js — Drossel–Schwabl forest-fire model with wind. Pure, no DOM.
// Cells: EMPTY / TREE / FIRE. Trees grow into empty ground; lightning kindles;
// fire eats and leaves warm ash. Self-organized criticality does the rest.
export const EMPTY = 0, TREE = 1, FIRE = 2;

const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

export class Forest {
  constructor(W, H, rng = Math.random) {
    this.W = W; this.H = H; this.rng = rng;
    this.cell = new Uint8Array(W * H);
    this.age = new Uint8Array(W * H);     // tree age (brightness ramp)
    this.heat = new Uint8Array(W * H);    // ember glow, decays
    this.fires = [];                       // active fire cell indices
    this.p = 0.0005;                       // growth: a bare cell refills in ~40 s
    this.strikeEvery = 700;                // strikes often enough to hold the forest at the edge
    this.windA = 0.6;                      // wind angle (radians)
    this.windS = 0.5;                      // wind strength 0..1
    this.trees = 0;
    this.strikes = 0;
    this.burnedTotal = 0;
    this.biggestFire = 0;
    this.fireSize = 0;                     // size of the currently burning run
    this.ageTick = 0;
    // seed the young forest
    const n0 = (W * H * 0.3) | 0;
    for (let i = 0; i < n0; i++) {
      const k = (rng() * W * H) | 0;
      if (this.cell[k] === EMPTY) { this.cell[k] = TREE; this.age[k] = 1 + (rng() * 60) | 0; this.trees++; }
    }
  }
  ignite(i) {
    if (this.cell[i] === TREE) {
      this.cell[i] = FIRE;
      this.fires.push(i);
      this.strikes++;
      return true;
    }
    return false;
  }
  igniteAt(x, y) {
    const W = this.W, H = this.H;
    x |= 0; y |= 0;
    // find nearest tree within a small spiral
    for (let r = 0; r < 24; r++) {
      for (let dy = -r; dy <= r; dy += r ? r * 2 : 1) for (let dx = -r; dx <= r; dx += r ? r * 2 : 1) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (this.ignite(ny * W + nx)) return true;
      }
    }
    return false;
  }
  plant(x, y, r = 5) {
    const W = this.W, H = this.H;
    let n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const nx = x + dx | 0, ny = y + dy | 0;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const i = ny * W + nx;
      if (this.cell[i] === EMPTY) { this.cell[i] = TREE; this.age[i] = 1; this.trees++; n++; }
    }
    return n;
  }
  step() {
    const { cell, age, heat, W, H, rng } = this;
    const N = W * H;
    // — growth: sample positions
    const G = (this.p * N) | 0;
    for (let k = 0; k < G; k++) {
      const i = (rng() * N) | 0;
      if (cell[i] === EMPTY && heat[i] < 120) { cell[i] = TREE; age[i] = 1; this.trees++; }
    }
    // — lightning: rare, uniform in time; the keeper's dice
    if (this.trees > 3000 && rng() < 1 / this.strikeEvery) {
      for (let tries = 0; tries < 60; tries++) {
        const i = (rng() * N) | 0;
        if (this.ignite(i)) break;
      }
    }
    // — fire spread
    if (this.fires.length) {
      const wvx = Math.cos(this.windA), wvy = Math.sin(this.windA);
      const next = this.fires;
      this.fires = [];
      let burnt = 0;
      for (let fi = 0; fi < next.length; fi++) {
        const i = next[fi];
        cell[i] = EMPTY;
        heat[i] = 255;
        this.trees--; burnt++;
        const x = i % W, y = (i / W) | 0;
        for (let d = 0; d < 8; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (cell[ni] !== TREE) continue;
          // probabilistic spread near percolation: partial burns, patchy scars
          const dot = (DX[d] * wvx + DY[d] * wvy);
          const prob = 0.55 + 0.16 * this.windS * dot;
          if (rng() < prob) { cell[ni] = FIRE; this.fires.push(ni); }
        }
      }
      this.burnedTotal += burnt;
      this.fireSize = burnt;   // cells burned this step (intensity)
      if (next.length > this.biggestFire) this.biggestFire = next.length;
    } else {
      this.fireSize = 0;
    }
    // — embers cool slowly: a third of the field per step ≈ ~17 s of glow
    for (let i = 0; i < N; i++) if (heat[i] > 2 && (i + this.ageTick) % 3 === 0) heat[i] -= 1;
    // — aging (sparse sample)
    if (++this.ageTick >= 5) {
      this.ageTick = 0;
      for (let k = 0; k < 3000; k++) {
        const i = (rng() * N) | 0;
        if (cell[i] === TREE && age[i] < 255) age[i]++;
      }
    }
    return this.fires.length;
  }
  cover() { return this.trees / (this.W * this.H); }
}
