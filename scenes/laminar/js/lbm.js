// lbm.js — D2Q9 Lattice-Boltzmann fluid + semi-Lagrangian dye. Pure typed arrays.
// Grid W×H. f[dir][cell] distribution. Walls = bounce-back flags.
// D2Q9:  0 rest; 1-4 axis; 5-8 diagonals
const CX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
const CY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const WT = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];

export class LBM {
  constructor(W, H) {
    this.W = W; this.H = H;
    const N = W * H;
    this.f = []; this.g = [];
    for (let d = 0; d < 9; d++) { this.f.push(new Float32Array(N)); this.g.push(new Float32Array(N)); }
    this.wall = new Uint8Array(N);
    this.ux = new Float32Array(N); this.uy = new Float32Array(N);
    this.rho = new Float32Array(N);
    // dye (ink) field, advected semi-Lagrangian
    this.dyeR = new Float32Array(N); this.dyeG = new Float32Array(N); this.dyeB = new Float32Array(N);
    this.tau = 0.62;                  // relaxation (viscosity) — 0.55..0.9 stable
    this.inletU = 0.10;               // inlet speed (lattice units, < 0.15 stable)
    this._initEquil();
  }

  _initEquil() {
    const { W, H } = this;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      for (let d = 0; d < 9; d++) this.f[d][i] = WT[d];
      this.rho[i] = 1;
    }
  }

  setWall(x, y, v) {
    if (x < 1 || y < 1 || x >= this.W - 1 || y >= this.H - 1) return;
    const i = y * this.W + x;
    this.wall[i] = v ? 1 : 0;
    if (v) { for (let d = 0; d < 9; d++) this.f[d][i] = WT[d]; this.dyeR[i] = this.dyeG[i] = this.dyeB[i] = 0; }
  }

  // circle of walls
  disc(cx, cy, r, v = 1) {
    for (let y = Math.max(1, cy - r | 0); y <= Math.min(this.H - 2, cy + r | 0); y++)
      for (let x = Math.max(1, cx - r | 0); x <= Math.min(this.W - 2, cx + r | 0); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.setWall(x, y, v);
  }

  // inject dye + momentum at a point
  stir(x, y, dx, dy, r, col) {
    const { W, H } = this;
    for (let yy = Math.max(1, y - r | 0); yy <= Math.min(H - 2, y + r | 0); yy++)
      for (let xx = Math.max(1, x - r | 0); xx <= Math.min(W - 2, x + r | 0); xx++) {
        const d2 = (xx - x) ** 2 + (yy - y) ** 2;
        if (d2 > r * r) continue;
        const i = yy * W + xx;
        if (this.wall[i]) continue;
        // momentum: blend distributions toward equilibrium at the pushed velocity
        const vx = this.ux[i] + dx, vy = this.uy[i] + dy;
        if (vx * vx + vy * vy < 0.09) {
          this.ux[i] = vx; this.uy[i] = vy;
          const v2 = vx * vx + vy * vy, rr = this.rho[i] || 1;
          for (let d = 0; d < 9; d++) {
            const eu = CX[d] * vx + CY[d] * vy;
            const feq = WT[d] * rr * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * v2);
            this.f[d][i] += (feq - this.f[d][i]) * 0.35;
          }
        }
        const k = 1 - d2 / (r * r);
        this.dyeR[i] = Math.min(1.8, this.dyeR[i] + col[0] * k * 0.5);
        this.dyeG[i] = Math.min(1.8, this.dyeG[i] + col[1] * k * 0.5);
        this.dyeB[i] = Math.min(1.8, this.dyeB[i] + col[2] * k * 0.5);
      }
  }

  step() {
    const { W, H, wall, ux, uy, rho, tau } = this;
    const f0 = this.f[0], f1 = this.f[1], f2 = this.f[2], f3 = this.f[3], f4 = this.f[4];
    const f5 = this.f[5], f6 = this.f[6], f7 = this.f[7], f8 = this.f[8];
    const g0 = this.g[0], g1 = this.g[1], g2 = this.g[2], g3 = this.g[3], g4 = this.g[4];
    const g5 = this.g[5], g6 = this.g[6], g7 = this.g[7], g8 = this.g[8];
    const u0 = this.inletU, itau = 1 / tau;
    const W0 = 4 / 9, W1 = 1 / 9, W2 = 1 / 36;

    // --- collide (unrolled) + velocity accumulate + sanity damper ---
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        if (wall[i]) { ux[i] = 0; uy[i] = 0; continue; }
        const a0 = f0[i], a1 = f1[i], a2 = f2[i], a3 = f3[i], a4 = f4[i];
        const a5 = f5[i], a6 = f6[i], a7 = f7[i], a8 = f8[i];
        const r = a0 + a1 + a2 + a3 + a4 + a5 + a6 + a7 + a8;
        const vx = (a1 - a3 + a5 - a6 - a7 + a8) / r;
        const vy = (a2 - a4 + a5 + a6 - a7 - a8) / r;
        const v2 = vx * vx + vy * vy;
        if (!(r > 0.25) || r > 3 || v2 > 0.09) {   // NaN / blowup -> heal to rest
          f0[i] = W0; f1[i] = f2[i] = f3[i] = f4[i] = W1;
          f5[i] = f6[i] = f7[i] = f8[i] = W2;
          rho[i] = 1; ux[i] = 0; uy[i] = 0;
          continue;
        }
        rho[i] = r; ux[i] = vx; uy[i] = vy;
        const u5 = vx + vy, u6 = vy - vx;          // eu for diagonals (5:+u5, 7:-u5, 6:+u6, 8:-u6)
        f0[i] = a0 + (W0 * r * (1 - 1.5 * v2) - a0) * itau;
        f1[i] = a1 + (W1 * r * (1 + 3 * vx + 4.5 * vx * vx - 1.5 * v2) - a1) * itau;
        f3[i] = a3 + (W1 * r * (1 - 3 * vx + 4.5 * vx * vx - 1.5 * v2) - a3) * itau;
        f2[i] = a2 + (W1 * r * (1 + 3 * vy + 4.5 * vy * vy - 1.5 * v2) - a2) * itau;
        f4[i] = a4 + (W1 * r * (1 - 3 * vy + 4.5 * vy * vy - 1.5 * v2) - a4) * itau;
        f5[i] = a5 + (W2 * r * (1 + 3 * u5 + 4.5 * u5 * u5 - 1.5 * v2) - a5) * itau;
        f7[i] = a7 + (W2 * r * (1 - 3 * u5 + 4.5 * u5 * u5 - 1.5 * v2) - a7) * itau;
        f6[i] = a6 + (W2 * r * (1 + 3 * u6 + 4.5 * u6 * u6 - 1.5 * v2) - a6) * itau;
        f8[i] = a8 + (W2 * r * (1 - 3 * u6 + 4.5 * u6 * u6 - 1.5 * v2) - a8) * itau;
      }
    }
    // --- stream (pull, unrolled) + bounce-back at walls ---
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        if (wall[i]) continue;
        g0[i] = f0[i];
        // d1 (+x): src (x-1,y)   d3 (-x): src (x+1,y)
        g1[i] = x > 0 ? (wall[i - 1] ? f3[i] : f1[i - 1]) : f1[i];
        g3[i] = x < W - 1 ? (wall[i + 1] ? f1[i] : f3[i + 1]) : f3[i];
        // d2 (+y): src (x,y-1)   d4 (-y): src (x,y+1)
        g2[i] = y > 0 ? (wall[i - W] ? f4[i] : f2[i - W]) : f2[i];
        g4[i] = y < H - 1 ? (wall[i + W] ? f2[i] : f4[i + W]) : f4[i];
        // d5 (+x,+y): src (x-1,y-1)   d7 (-x,-y): src (x+1,y+1)
        g5[i] = (x > 0 && y > 0) ? (wall[i - W - 1] ? f7[i] : f5[i - W - 1]) : f5[i];
        g7[i] = (x < W - 1 && y < H - 1) ? (wall[i + W + 1] ? f5[i] : f7[i + W + 1]) : f7[i];
        // d6 (-x,+y): src (x+1,y-1)   d8 (+x,-y): src (x-1,y+1)
        g6[i] = (x < W - 1 && y > 0) ? (wall[i - W + 1] ? f8[i] : f6[i - W + 1]) : f6[i];
        g8[i] = (x > 0 && y < H - 1) ? (wall[i + W - 1] ? f6[i] : f8[i + W - 1]) : f8[i];
      }
    }
    // inlet (left): equilibrium at inlet speed; outlet (right): zero-gradient
    const v2i = u0 * u0;
    const e0 = W0 * (1 - 1.5 * v2i), eR = W1 * (1 + 3 * u0 + 4.5 * u0 * u0 - 1.5 * v2i);
    const eL = W1 * (1 - 3 * u0 + 4.5 * u0 * u0 - 1.5 * v2i), eY = W1 * (1 - 1.5 * v2i);
    const eD1 = W2 * (1 + 3 * u0 + 4.5 * u0 * u0 - 1.5 * v2i);
    const eD2 = W2 * (1 - 3 * u0 + 4.5 * u0 * u0 - 1.5 * v2i);
    for (let y = 1; y < H - 1; y++) {
      const i = y * W;
      if (!wall[i]) {
        g0[i] = e0; g1[i] = eR; g2[i] = eY; g3[i] = eL; g4[i] = eY;
        g5[i] = eD1; g6[i] = eD2; g7[i] = eD2; g8[i] = eD1;
      }
      const o = i + W - 1;
      g0[o] = g0[o - 1]; g1[o] = g1[o - 1]; g2[o] = g2[o - 1]; g3[o] = g3[o - 1]; g4[o] = g4[o - 1];
      g5[o] = g5[o - 1]; g6[o] = g6[o - 1]; g7[o] = g7[o - 1]; g8[o] = g8[o - 1];
    }
    // swap f <-> g
    this.f = [g0, g1, g2, g3, g4, g5, g6, g7, g8];
    this.g = [f0, f1, f2, f3, f4, f5, f6, f7, f8];

    // --- dye advection (semi-Lagrangian) ---
    const { dyeR, dyeG, dyeB } = this;
    const NR = this._nr || (this._nr = new Float32Array(W * H));
    const NG = this._ng || (this._ng = new Float32Array(W * H));
    const NB = this._nb || (this._nb = new Float32Array(W * H));
    for (let y = 1; y < H - 1; y++) {
      const row = y * W;
      for (let x = 1; x < W - 1; x++) {
        const i = row + x;
        if (wall[i]) { NR[i] = NG[i] = NB[i] = 0; continue; }
        // backtrace
        let bx = x - ux[i], by = y - uy[i];
        bx = bx < 0.5 ? 0.5 : bx > W - 1.5 ? W - 1.5 : bx;
        by = by < 0.5 ? 0.5 : by > H - 1.5 ? H - 1.5 : by;
        const x0 = bx | 0, y0 = by | 0, fx2 = bx - x0, fy2 = by - y0;
        const i00 = y0 * W + x0, i10 = i00 + 1, i01 = i00 + W, i11 = i01 + 1;
        NR[i] = (dyeR[i00] * (1 - fx2) + dyeR[i10] * fx2) * (1 - fy2) + (dyeR[i01] * (1 - fx2) + dyeR[i11] * fx2) * fy2;
        NG[i] = (dyeG[i00] * (1 - fx2) + dyeG[i10] * fx2) * (1 - fy2) + (dyeG[i01] * (1 - fx2) + dyeG[i11] * fx2) * fy2;
        NB[i] = (dyeB[i00] * (1 - fx2) + dyeB[i10] * fx2) * (1 - fy2) + (dyeB[i01] * (1 - fx2) + dyeB[i11] * fx2) * fy2;
      }
    }
    // decay + copy back
    for (let i = 0; i < W * H; i++) {
      dyeR[i] = NR[i] * 0.9982; dyeG[i] = NG[i] * 0.9982; dyeB[i] = NB[i] * 0.9982;
    }
  }
}
