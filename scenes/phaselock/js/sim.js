// sim.js — PHASELOCK: a field of Kuramoto oscillators. Phase in Float32,
// natural freq spread; local 4-neighbor coupling; pacemaker "lighthouses".
// θ̇ = ω + K·mean(sin(θn − θ)). Flash on wrap. Chimera when K ≈ Kc.
export class Kuramoto {
  constructor(W, H, rand = Math.random) {
    this.W = W; this.H = H;
    const N = W * H;
    this.th = new Float32Array(N);       // phase
    this.om = new Float32Array(N);       // natural frequency
    this.pace = new Uint8Array(N);       // lighthouse flag (fixed fast freq)
    this.flash = new Float32Array(N);    // flash envelope (decays)
    this.K = 1.1;                        // coupling (tuned: spirals)
    this.t = 0;
    // spread of natural frequencies
    for (let i = 0; i < N; i++) {
      this.th[i] = rand() * 6.2831853;
      this.om[i] = 1 + (rand() + rand() - 1) * 0.10;    // σ ≈ 0.058 — spiral-wave regime
    }
    this.omegaPace = 2.2;
  }

  setPace(x, y, on) {
    if (x < 1 || y < 1 || x >= this.W - 1 || y >= this.H - 1) return;
    this.pace[y * this.W + x] = on ? 1 : 0;
  }

  step(dt = 0.08) {
    const { W, H, th, om, pace, flash, K } = this;
    this.t += dt;
    const k4 = K * 0.25;
    for (let y = 1; y < H - 1; y++) {
      const row = y * W;
      for (let x = 1; x < W - 1; x++) {
        const i = row + x;
        const c = th[i];
        let s = Math.sin(th[i - 1] - c) + Math.sin(th[i + 1] - c) +
                Math.sin(th[i - W] - c) + Math.sin(th[i + W] - c);
        const omI = pace[i] ? this.omegaPace : om[i];
        const nt = c + dt * (omI + k4 * s);
        if (nt >= 6.2831853) { flash[i] = 1; }            // wrap = flash
        th[i] = nt % 6.2831853;
      }
    }
    // flash decay
    for (let i = 0; i < W * H; i++) flash[i] *= 0.90;
  }

  // global order parameter |mean(e^{iθ})| — 0 chaos, 1 lockstep
  order() {
    let re = 0, im = 0;
    const N = this.W * this.H;
    for (let i = 0; i < N; i++) { re += Math.cos(this.th[i]); im += Math.sin(this.th[i]); }
    return Math.hypot(re, im) / N;
  }
}
