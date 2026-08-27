// sim.js — REVERIE: 1500 motes that drift, then gather into the words of a dream.
// Offscreen-canvas text → brightness-sampled targets → eased convergence.
export class Reverie {
  constructor(N, W, H, rand = Math.random) {
    this.N = N; this.W = W; this.H = H;
    this.rand = rand;
    this.x = new Float32Array(N); this.y = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N);
    this.tx = new Float32Array(N); this.ty = new Float32Array(N);   // targets
    this.on = new Uint8Array(N);                                    // has target
    this.t = 0;
    for (let i = 0; i < N; i++) { this.x[i] = rand() * W; this.y[i] = rand() * H; }
    this.mode = 'drift';   // drift | gather | hold | release
    this.hue = 0;
  }

  // sample bright pixels from a text-render canvas → assign particle targets
  setTextTargets(imageData, tw, th) {
    const pts = [];
    const d = imageData.data;
    for (let y = 0; y < th; y += 3) for (let x = 0; x < tw; x += 3) {
      const v = d[(y * tw + x) * 4];   // white text on black → r channel
      if (v > 100) pts.push([x, y]);
    }
    if (pts.length === 0) return 0;
    const sx = this.W / tw * 0.88, sy = this.H / th * 0.5;
    const ox = (this.W - tw * sx) / 2, oy = (this.H - th * sy) / 2;
    for (let i = 0; i < this.N; i++) {
      const p = pts[(this.rand() * pts.length) | 0];
      this.tx[i] = ox + p[0] * sx + (this.rand() - 0.5) * 2;
      this.ty[i] = oy + p[1] * sy + (this.rand() - 0.5) * 2;
      this.on[i] = 1;
    }
    return pts.length;
  }

  step(dt) {
    const { N, W, H, x, y, vx, vy, tx, ty, on } = this;
    this.t += dt;
    const gather = this.mode === 'gather' || this.mode === 'hold';
    for (let i = 0; i < N; i++) {
      if (gather && on[i]) {
        // ease toward target
        const dx = tx[i] - x[i], dy = ty[i] - y[i];
        vx[i] = vx[i] * 0.86 + dx * 0.028;
        vy[i] = vy[i] * 0.86 + dy * 0.028;
      } else {
        // perlin-ish wander
        const a = Math.sin(this.t * 0.4 + i * 0.13) * 1.9 + Math.cos(this.t * 0.23 + i * 0.07) * 1.4;
        vx[i] = vx[i] * 0.96 + Math.cos(a) * 0.05;
        vy[i] = vy[i] * 0.96 + Math.sin(a) * 0.05;
      }
      x[i] += vx[i]; y[i] += vy[i];
      if (x[i] < 0) { x[i] = 0; vx[i] *= -0.5; }
      if (x[i] >= W) { x[i] = W - 1; vx[i] *= -0.5; }
      if (y[i] < 0) { y[i] = 0; vy[i] *= -0.5; }
      if (y[i] >= H) { y[i] = H - 1; vy[i] *= -0.5; }
    }
  }

  scatter() {   // a lucid nudge
    for (let i = 0; i < this.N; i++) {
      const a = this.rand() * 6.283;
      this.vx[i] += Math.cos(a) * 5; this.vy[i] += Math.sin(a) * 5;
    }
  }
}
