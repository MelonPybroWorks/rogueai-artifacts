// frost.js — diffusion-limited aggregation on a pane. Pure, no DOM.
// Walkers wander a lattice until they touch the crystal and stick (or don't, by temperature).
export class Frost {
  constructor(W, H, rng = Math.random) {
    this.W = W; this.H = H;
    this.cell = new Uint8Array(W * H);    // 0 = vapor, 1..255 = crystal (age bucket: new=255)
    this.halo = new Uint8Array(W * H);    // 1 = adjacent to crystal (stale-safe after melts)
    this.count = 0;                        // crystal mass
    this.ageTick = 0;                      // global stick counter → age buckets
    this.stickProb = 0.14;                 // cold = low = delicate dendrites; warm = compact
    this.rng = rng;
    this.WALKERS = 3000;
    this.wx = new Int16Array(this.WALKERS);
    this.wy = new Int16Array(this.WALKERS);
    this.cx = W / 2; this.cy = H / 2;      // cluster centroid (running, lazy)
    this.maxR = 10;                        // cluster radius estimate
    this.nSeeds = 0;
    for (let i = 0; i < this.WALKERS; i++) this.respawn(i, true);
    this.stuck = 0; this.evap = 0;
  }
  idx(x, y) { return y * this.W + x; }
  seed(x, y) {
    x |= 0; y |= 0;
    if (x < 2 || y < 2 || x >= this.W - 2 || y >= this.H - 2) return false;
    const i = this.idx(x, y);
    if (!this.cell[i]) {
      this.cell[i] = 255;
      const h = this.halo;
      h[i - 1] = h[i + 1] = h[i - this.W] = h[i + this.W] = 1;
      h[i - this.W - 1] = h[i - this.W + 1] = h[i + this.W - 1] = h[i + this.W + 1] = 1;
      this.count++; this.nSeeds++;
      // a fresh heart pulls the spawn ring onto itself — otherwise the ring
      // orbits the old centroid and the cold start lasts forever
      if (this.count < 20) { this.cx = x; this.cy = y; this.maxR = Math.min(this.maxR, 12); }
    }
    return true;
  }
  respawn(i, anywhere = false) {
    const { rng, W, H } = this;
    if (anywhere || this.count < 50) {
      this.wx[i] = (rng() * W) | 0; this.wy[i] = (rng() * H) | 0;
      return;
    }
    // release on a ring just outside the cluster
    const a = rng() * Math.PI * 2;
    const r = this.maxR + 10 + rng() * 18;
    let x = (this.cx + Math.cos(a) * r) | 0, y = (this.cy + Math.sin(a) * r) | 0;
    if (x < 1) x = 1; else if (x >= W - 1) x = W - 2;
    if (y < 1) y = 1; else if (y >= H - 1) y = H - 2;
    this.wx[i] = x; this.wy[i] = y;
  }
  // one lattice step for walker i; returns 1 if it stuck
  walkOne(i) {
    const { rng, W, H, cell } = this;
    let x = this.wx[i], y = this.wy[i];
    const d = (rng() * 8) | 0;
    x += DX[d]; y += DY[d];
    // walls are hostile to wanderers: hitting the frame recycles the walker
    if (x < 1 || x >= W - 1 || y < 1 || y >= H - 1) { this.respawn(i); return 0; }
    // neighbor probe — halo fast path: one read in open space, eight only near frost
    const i0 = y * W + x;
    if (this.halo[i0] &&
        (cell[i0 - 1] || cell[i0 + 1] || cell[i0 - W] || cell[i0 + W] ||
         cell[i0 - W - 1] || cell[i0 - W + 1] || cell[i0 + W - 1] || cell[i0 + W + 1])) {
      if (rng() < this.stickProb) {
        if (!cell[i0]) {
          cell[i0] = 255;                 // fresh tip
          const h = this.halo;
          h[i0 - 1] = h[i0 + 1] = h[i0 - W] = h[i0 + W] = 1;
          h[i0 - W - 1] = h[i0 - W + 1] = h[i0 + W - 1] = h[i0 + W + 1] = 1;
          this.count++; this.stuck++;
          this.ageTick++;
          // lazy centroid/radius track
          this.cx += (x - this.cx) * 0.01; this.cy += (y - this.cy) * 0.01;
          const dx = x - this.cx, dy = y - this.cy;
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r > this.maxR) this.maxR = r;
          this.respawn(i);
          return 1;
        }
        this.respawn(i);
        return 0;
      }
    }
    // wandered too far beyond the kill radius → recycle
    const dx = x - this.cx, dy = y - this.cy;
    if (this.count > 50 && dx * dx + dy * dy > (this.maxR + 110) * (this.maxR + 110)) {
      this.respawn(i);
      return 0;
    }
    this.wx[i] = x; this.wy[i] = y;
    return 0;
  }
  step(substeps = 4) {
    let s = 0;
    for (let k = 0; k < substeps; k++)
      for (let i = 0; i < this.WALKERS; i++) s += this.walkOne(i);
    // age the crystal slowly: tips dim toward steel blue
    this.ageTick += 0;
    return s;
  }
  // pull one age-compression pass over a random subset (tips stay bright longest)
  agePass(n = 2000) {
    const { cell, rng } = this;
    for (let k = 0; k < n; k++) {
      const i = (rng() * cell.length) | 0;
      if (cell[i] > 1 && rng() < 0.3) cell[i]--;
    }
  }
  // melt n exposed crystal cells (warm brush / sunrise)
  melt(n, cx = null, cy = null, radius = 1e9) {
    const { cell, W, H, rng } = this;
    let melted = 0, guard = 0;
    while (melted < n && guard++ < n * 30 && this.count > 0) {
      let x, y;
      if (cx === null) { x = (rng() * W) | 0; y = (rng() * H) | 0; }
      else {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * radius;
        x = (cx + Math.cos(a) * r) | 0; y = (cy + Math.sin(a) * r) | 0;
        if (x < 1 || x >= W - 1 || y < 1 || y >= H - 1) continue;
      }
      const i = y * W + x;
      if (!cell[i]) continue;
      // only exposed cells melt (tips first)
      if (!(cell[i - 1] && cell[i + 1] && cell[i - W] && cell[i + W])) {
        cell[i] = 0; this.count--; melted++; this.evap++;
      }
    }
    return melted;
  }
  coverage() { return this.count / (this.W * this.H); }
  reset() {
    this.cell.fill(0);
    this.halo.fill(0);
    this.count = 0; this.stuck = 0; this.evap = 0; this.nSeeds = 0;
    this.cx = this.W / 2; this.cy = this.H / 2; this.maxR = 10;
    for (let i = 0; i < this.WALKERS; i++) this.respawn(i, true);
  }
}
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];
