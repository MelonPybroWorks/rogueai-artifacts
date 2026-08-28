// grains.js — sand on the plate: kicked hard where the plate moves, still where it doesn't.
// Pure, no DOM. Unit-square world; the renderer maps to pixels.
export class Grains {
  constructor(count, rng = Math.random) {
    this.n = count;
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.a = new Float32Array(count);   // last field amplitude under each grain
    this.rng = rng;
    this.scatter();
  }
  scatter() {
    for (let i = 0; i < this.n; i++) {
      this.x[i] = this.rng(); this.y[i] = this.rng();
      this.vx[i] = 0; this.vy[i] = 0;
    }
  }
  // add a pinch of fresh sand near (ux,uy)
  sprinkle(ux, uy, count, spread = 0.05) {
    let done = 0;
    for (let i = 0; i < this.n && done < count; i++) {
      // recycle the most settled grains first (they're invisible anyway — on nodes)
      if (Math.abs(this.vx[i]) + Math.abs(this.vy[i]) < 0.0004) {
        this.x[i] = ux + (this.rng() - 0.5) * spread;
        this.y[i] = uy + (this.rng() - 0.5) * spread;
        this.vx[i] = 0; this.vy[i] = 0;
        done++;
      }
    }
    return done;
  }
  step(field, kick = 0.0022, damp = 0.90) {
    const { x, y, vx, vy, rng, n } = this;
    for (let i = 0; i < n; i++) {
      const a = field.at(x[i], y[i]);
      this.a[i] = a;
      if (a > 0.012) {
        const k = kick * a;
        vx[i] += (rng() - 0.5) * k * 2;
        vy[i] += (rng() - 0.5) * k * 2;
      }
      vx[i] *= damp; vy[i] *= damp;
      let nx = x[i] + vx[i], ny = y[i] + vy[i];
      if (nx < 0) { nx = -nx; vx[i] = -vx[i]; } else if (nx > 1) { nx = 2 - nx; vx[i] = -vx[i]; }
      if (ny < 0) { ny = -ny; vy[i] = -vy[i]; } else if (ny > 1) { ny = 2 - ny; vy[i] = -vy[i]; }
      x[i] = nx; y[i] = ny;
    }
  }
  // convergence metric: mean field amplitude under the grains (falls as the figure forms)
  meanAmplitude(field) {
    let s = 0;
    for (let i = 0; i < this.n; i += 7) s += field.at(this.x[i], this.y[i]);
    return s / Math.ceil(this.n / 7);
  }
}
