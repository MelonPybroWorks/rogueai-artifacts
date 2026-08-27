// sim.js — SAIL: verlet cloth. particles + breakable distance constraints.
// wind gusts, gravity, tearing, fraying. The banner remembers every rip.
export class Cloth {
  constructor(CW, CH, spacing = 10, rand = Math.random) {
    this.CW = CW; this.CH = CH;               // cloth grid (particles)
    this.N = CW * CH;
    this.spacing = spacing;
    this.x = new Float32Array(this.N); this.y = new Float32Array(this.N);
    this.px_ = new Float32Array(this.N); this.py_ = new Float32Array(this.N);
    this.pinned = new Uint8Array(this.N);
    // constraints: pairs of indices + rest length; broken flag
    this.cons = [];
    this.rand = rand;
    this.wind = 0.6;
    this.windDir = 1;
    this.gustT = 0;
    this.buildBanner();
  }

  idx(cx, cy) { return cy * this.CW + cx; }

  buildBanner() {
    // a wide banner hanging from two top pins, slight sag
    const { CW, CH, spacing } = this;
    const ox = 40, oy = 46;
    for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
      const i = this.idx(cx, cy);
      this.x[i] = ox + cx * spacing;
      this.y[i] = oy + cy * spacing + Math.sin(cx / CW * Math.PI) * 12;   // initial sag
      this.px_[i] = this.x[i]; this.py_[i] = this.y[i];
      this.pinned[i] = (cy === 0 && cx % 4 === 0) ? 1 : 0;   // pinned every 4th along the top
    }
    this.cons.length = 0;
    for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
      const i = this.idx(cx, cy);
      if (cx < CW - 1) this.cons.push({ a: i, b: i + 1, rest: spacing, broken: 0, shear: 0 });
      if (cy < CH - 1) this.cons.push({ a: i, b: this.idx(cx, cy + 1), rest: spacing, broken: 0, shear: 0 });
      if (cx < CW - 1 && cy < CH - 1 && ((cx + cy) & 1) === 0) {  // shear diagonals, checkerboard
        this.cons.push({ a: i, b: this.idx(cx + 1, cy + 1), rest: spacing * 1.414, broken: 0, shear: 1 });
        this.cons.push({ a: this.idx(cx + 1, cy), b: this.idx(cx, cy + 1), rest: spacing * 1.414, broken: 0, shear: 1 });
      }
    }
  }

  step(dt, boundsW, boundsH, t) {
    const { N, x, y, px_, py_, pinned } = this;
    // wind: base + gusting sine + slow noise
    this.gustT += dt;
    const gust = Math.sin(this.gustT * 0.7) * 0.5 + Math.sin(this.gustT * 1.7 + 1.3) * 0.3;
    const wNow = (this.wind + gust) * this.windDir;
    const g = 900 * dt * dt;   // gravity per step²
    for (let i = 0; i < N; i++) {
      if (pinned[i]) continue;
      const vx = (x[i] - px_[i]) * 0.985, vy = (y[i] - py_[i]) * 0.985;
      px_[i] = x[i]; py_[i] = y[i];
      x[i] += vx + wNow * (0.4 + 0.6 * Math.sin(y[i] * 0.01 + t * 0.5)) * dt * 60 * 0.02;
      y[i] += vy + g * 0.016;
      // bounds
      if (x[i] < 4) x[i] = 4; if (x[i] > boundsW - 4) x[i] = boundsW - 4;
      if (y[i] > boundsH - 4) y[i] = boundsH - 4;
      if (y[i] < 2) y[i] = 2;
    }
    // constraint relaxation (2 iterations — checkerboard shear halves the count)
    for (let it = 0; it < 2; it++) {
      for (let c = 0; c < this.cons.length; c++) {
        const con = this.cons[c];
        if (con.broken) continue;
        const a = con.a, b = con.b;
        const dx = x[b] - x[a], dy = y[b] - y[a];
        const d = Math.hypot(dx, dy) || 1e-6;
        const diff = (d - con.rest) / d;
        // tear if over-stretched
        if (d > con.rest * 2.4) { con.broken = 1; continue; }
        const w1 = pinned[a] ? 0 : 1, w2 = pinned[b] ? 0 : 1;
        const ws = w1 + w2;
        if (ws === 0) continue;
        const f = diff * 0.5 * (con.shear ? 0.7 : 1.0);
        x[a] += dx * f * (2 * w1 / ws); y[a] += dy * f * (2 * w1 / ws);
        x[b] -= dx * f * (2 * w2 / ws); y[b] -= dy * f * (2 * w2 / ws);
      }
    }
  }

  // tear constraints crossing a segment (mouse slash)
  tear(x0, y0, x1, y1) {
    for (let c = 0; c < this.cons.length; c++) {
      const con = this.cons[c];
      if (con.broken) continue;
      const ax = this.x[con.a], ay = this.y[con.a], bx = this.x[con.b], by = this.y[con.b];
      // segment-segment intersection
      const d = (x1 - x0) * (by - ay) - (y1 - y0) * (bx - ax);
      if (Math.abs(d) < 1e-9) continue;
      const t = ((ax - x0) * (by - ay) - (ay - y0) * (bx - ax)) / d;
      const u = ((ax - x0) * (y1 - y0) - (ay - y0) * (x1 - x0)) / d;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) con.broken = 1;
    }
  }

  // grab and pull the nearest particle
  grab(x, y, r) {
    let best = -1, bd = r * r;
    for (let i = 0; i < this.N; i++) {
      const d = (this.x[i] - x) ** 2 + (this.y[i] - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  pull(i, x, y) {
    if (i < 0 || this.pinned[i]) return;
    this.x[i] += (x - this.x[i]) * 0.6;
    this.y[i] += (y - this.y[i]) * 0.6;
  }

  stats() {
    let broken = 0;
    for (const c of this.cons) if (c.broken) broken++;
    return { broken, total: this.cons.length };
  }
}
