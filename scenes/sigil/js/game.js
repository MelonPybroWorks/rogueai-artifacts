// game.js — the chaos game: a tracer hops toward random anchors, forever. Pure, no DOM.
// Modes morph; anchors drift; the density field remembers everything (for a while).
export const MODES = [
  { name: 'THE TRIANGLE', n: 3, r: 0.5, rule: null },
  { name: 'THE SQUARE', n: 4, r: 0.5, rule: 'norepeat' },
  { name: 'THE PENTAGON', n: 5, r: 0.618, rule: null },
  { name: 'THE HEXAGON', n: 6, r: 0.55, rule: 'noaway' },
  { name: 'THE FERN', n: 0, r: 0, rule: 'barnsley' },
];

export class Sigil {
  constructor(W, H, rng = Math.random) {
    this.W = W; this.H = H; this.rng = rng;
    this.dens = new Float32Array(W * H);
    this.modeIndex = 0;
    this.anchors = [];
    this.tx = W / 2; this.ty = H / 2;
    this.lastAnchor = -1;
    this.setMode(0);
  }
  setMode(i) {
    this.modeIndex = ((i % MODES.length) + MODES.length) % MODES.length;
    const m = MODES[this.modeIndex];
    const { W, H } = this;
    this.anchors = [];
    if (m.rule === 'barnsley') {
      // fern space: x∈[-2.2,2.7] y∈[0,10] → anchors unused
    } else {
      const R = Math.min(W, H) * 0.42;
      for (let k = 0; k < m.n; k++) {
        const a = -Math.PI / 2 + (k / m.n) * Math.PI * 2;
        this.anchors.push({ x: W / 2 + Math.cos(a) * R, y: H / 2 + Math.sin(a) * R });
      }
    }
    this.tx = W / 2; this.ty = H / 2;
    this.lastAnchor = -1;
  }
  mode() { return MODES[this.modeIndex]; }
  step(n = 2000) {
    const m = this.mode();
    if (m.rule === 'barnsley') return this.stepFern(n);
    const { dens, W, H, rng, anchors } = this;
    const r = m.r;
    let placed = 0;
    for (let k = 0; k < n; k++) {
      let ai = (rng() * anchors.length) | 0;
      if (m.rule === 'norepeat' && anchors.length > 1) {
        if (ai === this.lastAnchor) continue;
      } else if (m.rule === 'noaway' && anchors.length > 2) {
        // hexagon: no anchor two away from the last
        const diff = Math.abs(ai - this.lastAnchor);
        if (diff === 2 || diff === anchors.length - 2) continue;
      }
      this.lastAnchor = ai;
      const a = anchors[ai];
      this.tx += (a.x - this.tx) * r;
      this.ty += (a.y - this.ty) * r;
      const x = this.tx | 0, y = this.ty | 0;
      if (x >= 0 && y >= 0 && x < W && y < H) { dens[y * W + x]++; placed++; }
    }
    return placed;
  }
  stepFern(n) {
    const { dens, W, H, rng } = this;
    let x = this.fx || 0, y = this.fy || 0;
    let placed = 0;
    for (let k = 0; k < n; k++) {
      const u = rng();
      let nx, ny;
      if (u < 0.01) { nx = 0; ny = 0.16 * y; }
      else if (u < 0.86) { nx = 0.85 * x + 0.04 * y; ny = -0.04 * x + 0.85 * y + 1.6; }
      else if (u < 0.93) { nx = 0.2 * x - 0.26 * y; ny = 0.23 * x + 0.22 * y + 1.6; }
      else { nx = -0.15 * x + 0.28 * y; ny = 0.26 * x + 0.24 * y + 0.44; }
      x = nx; y = ny;
      // fern space x∈[-2.2,2.7], y∈[0,10] — keep the leaf's true 1:2 aspect
      const sc = H * 0.088;
      const px = (W / 2 + (x - 0.25) * sc) | 0, py = (H - 6 - y * sc) | 0;
      if (px >= 0 && py >= 0 && px < W && py < H) { dens[py * W + px]++; placed++; }
    }
    this.fx = x; this.fy = y;
    return placed;
  }
  decay(f = 0.994) {
    const d = this.dens;
    for (let i = 0; i < d.length; i++) d[i] *= f;
  }
  // drag anchor i toward (x,y) with slack
  pull(i, x, y, k = 0.25) {
    const a = this.anchors[i];
    if (!a) return;
    a.x += (x - a.x) * k; a.y += (y - a.y) * k;
  }
}
