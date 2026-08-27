// render.js — phase field → light. Waves in teal, flashes in gold, pacemakers ember-red.
import { px } from './px.js';

export class Renderer {
  constructor(canvas, GW, GH) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.GW = GW; this.GH = GH;
    this.q = 0.6;
    this.tex = new Uint8Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      let h = (x * 374761393 + y * 668265263) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      this.tex[y * GW + x] = (h ^ (h >>> 16)) & 255;
    }
    // precompute pulse curve: brightness from phase (sharp flash at θ≈0)
    this.pulse = new Uint8Array(1024);
    for (let k = 0; k < 1024; k++) {
      const th = k / 1024 * 6.2831853;
      const v = Math.pow(0.5 + 0.5 * Math.cos(th), 3.2);   // sharp crest
      this.pulse[k] = (v * 255) | 0;
    }
  }

  resize(w, h, q) {
    this.q = q;
    const W = Math.max(2, Math.round(w * q)), H = Math.max(2, Math.round(h * q));
    this.cv.width = W; this.cv.height = H;
    this.img = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.w = W; this.h = H;
  }

  frame(sim) {
    const { buf, w: W, h: H, GW, GH, tex, pulse } = this;
    const { th, om, pace, flash } = sim;
    const sx = W / GW, sy = H / GH;
    for (let gy = 0; gy < GH; gy++) {
      const y0 = (gy * sy) | 0, y1 = Math.min(H, ((gy + 1) * sy) | 0) || y0 + 1;
      const rowG = gy * GW;
      for (let gx = 0; gx < GW; gx++) {
        const i = rowG + gx;
        const txx = tex[i];
        const pv = pulse[(th[i] * 162.975) & 1023];         // 1024/2π
        const fl = flash[i];
        let c;
        if (pace[i]) {
          // lighthouse: ember core pulsing hard
          const v = 120 + pv;
          c = px(v > 255 ? 255 : v, 60 + (pv >> 2), 30);
        } else {
          // teal wave body + gold flash crest; slight hue shift by natural freq
          const fast = om[i] > 1 ? 14 : 0;
          const r = (pv * (0.20 + fast * 0.004) + fl * 235) | 0;
          const g = (pv * 0.75 + fl * 190) | 0;
          const b = (pv * (0.95 - fast * 0.004) + fl * 90) | 0;
          const bg = 5 + (txx & 3);
          c = px(Math.min(255, bg + r), Math.min(255, bg + 2 + g), Math.min(255, bg + 8 + b));
        }
        const x0 = (gx * sx) | 0, x1 = Math.min(W, ((gx + 1) * sx) | 0) || x0 + 1;
        for (let y = y0; y < y1; y++) {
          const rowB = y * W;
          for (let x = x0; x < x1; x++) buf[rowB + x] = c;
        }
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
