// ising.js — Metropolis dynamics on a square lattice. Pure, no DOM.
// ΔE of a flip = 2·s·(sum of neighbors). Flip if ΔE<0 or rand < exp(−ΔE/T).
export const TC = 2.269;   // the critical temperature (square lattice)

export class Ising {
  constructor(W, H, rng = Math.random) {
    this.W = W; this.H = H; this.rng = rng;
    this.spin = new Int8Array(W * H);
    for (let i = 0; i < W * H; i++) this.spin[i] = rng() < 0.5 ? 1 : -1;
    this.T = TC;
    this.flips = new Int32Array(W * H);    // frame tick of last flip (for sparkle)
    this.tick = 0;
    this.m = 0;
  }
  step(attempts = 30000) {
    const { spin, W, H, rng, T } = this;
    this.tick++;
    let mSum = 0;
    const N = W * H;
    for (let k = 0; k < attempts; k++) {
      const i = (rng() * N) | 0;
      const x = i % W, y = (i / W) | 0;
      const s = spin[i];
      let nb = spin[(y * W + ((x + 1) % W))] + spin[(y * W + ((x + W - 1) % W))];
      nb += spin[(((y + 1) % H) * W + x)] + spin[(((y + H - 1) % H) * W + x)];
      const dE = 2 * s * nb;
      if (dE <= 0 || rng() < Math.exp(-dE / T)) {
        spin[i] = -s;
        this.flips[i] = this.tick;
      }
    }
    for (let i = 0; i < N; i += 7) mSum += spin[i];
    this.m = Math.abs(mSum / Math.ceil(N / 7));
  }
  paint(x, y, r, val) {
    const { W, H, spin } = this;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const nx = (x + dx + W) % W, ny = (y + dy + H) % H;
      const i = ny * W + nx;
      if (spin[i] !== val) { spin[i] = val; this.flips[i] = this.tick; }
    }
  }
  quench() { this.T = 0.6; }
  reheat() { this.T = 4.0; }
}
