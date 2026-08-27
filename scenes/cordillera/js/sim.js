// sim.js — CORDILLERA: hydraulic erosion, the fast way.
// height[] terrain · water[] depth · flux to 4 neighbors · sediment capacity model.
// Drains at the borders (the world is an island in a patient ocean).
export class Erosion {
  constructor(W, H, rand = Math.random) {
    this.W = W; this.H = H;
    this.height = new Float32Array(W * H);
    this.water = new Float32Array(W * H);
    this.sed = new Float32Array(W * H);        // suspended sediment
    this.flux = new Float32Array(W * H);       // flow speed proxy (render + erosion)
    this.rand = rand;
    this.rain = 0.006;                          // base rainfall per cell per step
    this.t = 0;
    this._noiseSeeds();
    this.genTerrain(1);
  }

  _noiseSeeds() {
    const R = this.rand;
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = (R() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  _vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const p = this.perm;
    const h = (X, Y) => p[(p[X & 255] + Y) & 255] / 255;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return h(xi, yi) * (1 - u) * (1 - v) + h(xi + 1, yi) * u * (1 - v) +
           h(xi, yi + 1) * (1 - u) * v + h(xi + 1, yi + 1) * u * v;
  }

  genTerrain(mode) {
    const { W, H, height } = this;
    height.fill(0); this.water.fill(0); this.sed.fill(0); this.flux.fill(0);
    const oct = (x, y) => {
      let a = 0, amp = 1, f = 1, tot = 0;
      for (let o = 0; o < 5; o++) { a += this._vnoise(x * f, y * f) * amp; tot += amp; amp *= 0.5; f *= 2; }
      return a / tot;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const nx = x / W * 6, ny = y / H * 6;
      let h = oct(nx, ny);
      if (mode === 1) h = Math.pow(h, 2.1) * 2.2;                    // alps: rare peaks
      else if (mode === 2) h = h * h * 1.1 + 0.12 * oct(nx * 3, ny * 3); // coastal plain
      else h = Math.abs(h - 0.5) * 2.4;                               // cratered ridges
      // edge falloff → island
      const ex = Math.min(x, W - 1 - x) / W, ey = Math.min(y, H - 1 - y) / H;
      const edge = Math.min(1, Math.min(ex, ey) * 14);
      height[i] = h * edge - (1 - edge) * 0.35;
    }
  }

  step() {
    const { W, H, height, water, sed, flux, rand } = this;
    this.t++;
    // --- rain: uniform drizzle + a wandering storm cell ---
    const rainCells = 220;
    for (let k = 0; k < rainCells; k++) {
      const i = (rand() * W * H) | 0;
      water[i] += this.rain * (0.5 + rand());
    }
    // storm cell: concentrated rain in a moving disc
    const stx = W * (0.5 + 0.35 * Math.sin(this.t * 0.0011)), sty = H * (0.5 + 0.35 * Math.cos(this.t * 0.0013));
    for (let k = 0; k < 60; k++) {
      const a = rand() * 6.283, r = rand() * 26;
      const x = (stx + Math.cos(a) * r) | 0, y = (sty + Math.sin(a) * r) | 0;
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1) water[y * W + x] += this.rain * 3.2;
    }
    // --- flow + erosion ---
    for (let y = 1; y < H - 1; y++) {
      const row = y * W;
      for (let x = 1; x < W - 1; x++) {
        const i = row + x;
        const w = water[i];
        if (w < 0.002) { flux[i] *= 0.9; continue; }
        const hTot = height[i] + w;
        // distribute to lower neighbors
        let totalDrop = 0;
        const drops = this._drop || (this._drop = new Float32Array(4));
        const nb = [i - 1, i + 1, i - W, i + W];
        for (let d = 0; d < 4; d++) {
          const j = nb[d];
          const drop = hTot - (height[j] + water[j]);
          drops[d] = drop > 0 ? drop : 0;
          totalDrop += drops[d];
        }
        if (totalDrop <= 0) { flux[i] *= 0.9; continue; }
        // move a decisive fraction of water downhill
        const outFrac = Math.min(0.6, 0.5 * totalDrop);
        const outflow = w * outFrac;
        let v = 0;
        for (let d = 0; d < 4; d++) {
          if (drops[d] <= 0) continue;
          const j = nb[d];
          const share = outflow * (drops[d] / totalDrop);
          water[j] += share;
          water[i] -= share;
          v += share;
          // sediment rides the flow
          const sMove = sed[i] * (share / (w + 1e-6));
          sed[j] += sMove; sed[i] -= sMove;
        }
        flux[i] = flux[i] * 0.85 + v * 15 * 0.15;
        // --- erosion law ---
        const speed = flux[i];
        const capacity = Math.min(0.5, speed * 0.012 * (0.4 + totalDrop));
        if (sed[i] < capacity && height[i] > -0.2) {
          // erode
          const bite = Math.min(0.0035, (capacity - sed[i]) * 0.05);
          height[i] -= bite; sed[i] += bite;
        } else if (sed[i] > capacity) {
          // deposit
          const spill = Math.min(0.002, (sed[i] - capacity) * 0.08);
          height[i] += spill; sed[i] -= spill;
        }
      }
    }
    // --- evaporation + border drain ---
    for (let x = 0; x < W; x++) { water[x] = 0; water[(H - 1) * W + x] = 0; }
    for (let y = 0; y < H; y++) { water[y * W] = 0; water[y * W + W - 1] = 0; }
    const evap = 0.9975;
    for (let i = 0; i < W * H; i++) {
      water[i] *= evap; if (water[i] > 0.02) water[i] += 0.0004;
      if (water[i] < 0.0005) water[i] = 0;
    }
  }

  // sculpt: raise/lower terrain along a disc
  sculpt(cx, cy, r, amt) {
    const { W, H, height } = this;
    for (let y = Math.max(1, cy - r | 0); y <= Math.min(H - 2, cy + r | 0); y++)
      for (let x = Math.max(1, cx - r | 0); x <= Math.min(W - 2, cx + r | 0); x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 > r * r) continue;
        height[y * W + x] += amt * (1 - d2 / (r * r));
      }
  }

  stats() {
    let wet = 0, river = 0;
    for (let i = 0; i < this.water.length; i++) { if (this.water[i] > 0.01) wet++; if (this.flux[i] > 0.12) river++; }
    return { wet, river };
  }
}
