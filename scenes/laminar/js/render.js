// render.js — LBM grid → framebuffer: ink dyes the wind. One putImageData.
import { px, blend } from './px.js';

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.q = 0.6;
    this._wallC = px(16, 13, 20);
    this._wallEdge = px(60, 50, 66);
  }

  resize(w, h, q) {
    this.q = q;
    const W = Math.max(2, Math.round(w * q)), H = Math.max(2, Math.round(h * q));
    this.cv.width = W; this.cv.height = H;
    this.img = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.w = W; this.h = H;
  }

  frame(sim, t) {
    const { buf, w: W, h: H } = this;
    const GW = sim.W, GH = sim.H;
    const sx = W / GW, sy = H / GH;              // buffer px per cell (float)
    const dyeR = sim.dyeR, dyeG = sim.dyeG, dyeB = sim.dyeB;
    const ux = sim.ux, uy = sim.uy, wall = sim.wall;

    for (let gy = 0; gy < GH; gy++) {
      const y0 = (gy * sy) | 0, y1 = Math.min(H, ((gy + 1) * sy) | 0) || y0 + 1;
      const row0 = gy * GW;
      for (let gx = 0; gx < GW; gx++) {
        const i = row0 + gx;
        const x0 = (gx * sx) | 0, x1 = Math.min(W, ((gx + 1) * sx) | 0) || x0 + 1;
        let c;
        if (wall[i]) {
          // edge glow on walls facing fluid
          const open = !wall[i - 1] || !wall[i + 1] || !wall[i - GW] || !wall[i + GW];
          c = open ? this._wallEdge : this._wallC;
        } else {
          const r = dyeR[i], g = dyeG[i], b = dyeB[i];
          const sp = Math.sqrt(ux[i] * ux[i] + uy[i] * uy[i]);
          const sv = sp * 7.1;                            // 0.14 lattice-u -> ~1
          const s8 = sv > 1 ? 1 : sv;
          // sqrt lift so faint ink trails stay visible
          const lr = r > 0.004 ? Math.sqrt(r * 0.62) * 235 : 0;
          const lg = g > 0.004 ? Math.sqrt(g * 0.62) * 220 : 0;
          const lb = b > 0.004 ? Math.sqrt(b * 0.62) * 240 : 0;
          let rr = 6 + s8 * 20 + lr;
          let gg = 10 + s8 * 30 + lg;
          let bb = 21 + s8 * 55 + lb;
          c = px(rr > 255 ? 255 : rr | 0, gg > 255 ? 255 : gg | 0, bb > 255 ? 255 : bb | 0);
        }
        for (let y = y0; y < y1; y++) {
          const rowB = y * W;
          for (let x = x0; x < x1; x++) buf[rowB + x] = c;
        }
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
