// render.js — INFALL framebuffer: dust trails via fade, stars as hot cores.
import { px, blend } from './px.js';

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.q = 0.6;
    this.scale = 0.34;   // world units → px at q=1 baseline (fit ~[-2000,2000])
  }

  resize(w, h, q) {
    this.q = q;
    const W = Math.max(2, Math.round(w * q)), H = Math.max(2, Math.round(h * q));
    this.cv.width = W; this.cv.height = H;
    this.img = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.w = W; this.h = H;
    this.u2px = Math.min(W, H) / 2200;   // fit ±1100 world units across the short edge
  }

  toPx(wx, wy) {
    return [(this.w / 2 + wx * this.u2px) | 0, (this.h / 2 + wy * this.u2px) | 0];
  }

  frame(sim, t) {
    const { buf, w: W, h: H } = this;
    const u2 = this.u2px, hw = W >> 1, hh = H >> 1;
    // --- dust as a luminance field: coarse grid, deposits, slow decay ---
    const DW = this.DW || (this.DW = 200), DH = this.DH || (this.DH = 120);
    const dens = this.dens || (this.dens = new Float32Array(DW * DH));
    for (let i = 0; i < dens.length; i++) dens[i] *= 0.965;
    const dScaleX = DW / W, dScaleY = DH / H;
    for (let i = 0; i < sim.N; i++) {
      if (!sim.alive[i]) continue;
      const X = (hw + sim.x[i] * u2) | 0, Y = (hh + sim.y[i] * u2) | 0;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const dx = (X * dScaleX) | 0, dy = (Y * dScaleY) | 0;
      const di = dy * DW + dx;
      const fast = sim.vx[i] * sim.vx[i] + sim.vy[i] * sim.vy[i] > 30;
      dens[di] += fast ? 1.5 : 0.8;
      if (dx + 1 < DW) dens[di + 1] += 0.35;
      if (dy + 1 < DH) dens[di + DW] += 0.35;
    }
    // --- render: buffer pixel ← density → color ramp (deep blue → ice → gold-white) ---
    for (let y = 0; y < H; y++) {
      const drow = ((y * dScaleY) | 0) * DW;
      const rowB = y * W;
      for (let x = 0; x < W; x++) {
        const d = dens[drow + ((x * dScaleX) | 0)];
        let c;
        if (d < 0.06) {
          // deep space background: fade whatever was there
          const p = buf[rowB + x];
          const fr = ((p & 255) * 0.90) | 0;
          const fg = (((p >> 8) & 255) * 0.90) | 0;
          const fb = (((p >> 16) & 255) * 0.90) | 0;
          c = 0xff000000 | (fb << 16) | (fg << 8) | fr;
        } else {
          const lum = 1 - Math.exp(-d * 0.55);
          const core = 1 - Math.exp(-d * 0.16);
          const r = (lum * 90 + core * 165) | 0;
          const g = (lum * 120 + core * 120) | 0;
          const b2 = (lum * 200 + core * 55) | 0;
          c = px(r > 255 ? 255 : r, g > 255 ? 255 : g, b2 > 255 ? 255 : b2);
        }
        buf[rowB + x] = c;
      }
    }
    // the seed singularity: hot white-gold core + halo
    this._glow(hw, hh, 5, px(255, 240, 200), px(255, 190, 90));
    // stars: ember-orange cores, halo ∝ mass
    for (let s = 0; s < sim.sm.length; s++) {
      const X = (hw + sim.sx[s] * u2) | 0, Y = (hh + sim.sy[s] * u2) | 0;
      const r = Math.min(7, 2 + Math.sqrt(sim.sm[s]) * 0.02) | 0;
      this._glow(X, Y, r, px(255, 226, 170), px(255, 140, 60));
    }
    // merger flashes: brief white rings
    for (let f = sim.flashes.length - 1; f >= 0; f--) {
      const fl = sim.flashes[f];
      const age = sim.t - fl.t;
      if (age > 1.6) { sim.flashes.splice(f, 1); continue; }
      const X = (hw + fl.x * u2) | 0, Y = (hh + fl.y * u2) | 0;
      const rr = 3 + age * 26;
      const a = Math.max(0, 1 - age / 1.6) * 220 | 0;
      const col = fl.big ? px(255, 230, 200) : px(200, 220, 255);
      for (let an = 0; an < 28; an++) {
        const th = an / 28 * 6.2831853;
        const X2 = (X + Math.cos(th) * rr) | 0, Y2 = (Y + Math.sin(th) * rr) | 0;
        if (X2 >= 0 && Y2 >= 0 && X2 < W && Y2 < H) {
          const i2 = Y2 * W + X2;
          buf[i2] = blend(buf[i2], col, a);
        }
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  _glow(X, Y, r, core, halo) {
    const { buf, w: W, h: H } = this;
    for (let dy = -r * 2; dy <= r * 2; dy++) {
      const Y2 = Y + dy;
      if (Y2 < 0 || Y2 >= H) continue;
      for (let dx = -r * 2; dx <= r * 2; dx++) {
        const X2 = X + dx;
        if (X2 < 0 || X2 >= W) continue;
        const d2 = dx * dx + dy * dy;
        const i = Y2 * W + X2;
        if (d2 <= r * r * 0.5) buf[i] = core;
        else if (d2 <= r * r * 4) buf[i] = blend(buf[i], halo, Math.max(0, 140 - d2 * 8));
      }
    }
  }
}
