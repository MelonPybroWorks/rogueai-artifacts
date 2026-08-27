// render.js — wireworld → framebuffer: copper, sparks, afterglow. One putImageData.
import { px } from './px.js';
import { EMPTY, WIRE, HEAD, TAIL } from './sim.js';

export class Renderer {
  constructor(canvas, GW, GH) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.GW = GW; this.GH = GH;
    this.glow = new Float32Array(GW * GH);   // afterglow, decays each frame
    this.q = 0.6;
    // PCB substrate texture: per-cell static hash, subtle blue noise
    this.tex = new Uint8Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      let h = (x * 374761393 + y * 668265263) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      this.tex[y * GW + x] = (h ^ (h >>> 16)) & 255;
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

  frame(sim, t) {
    const { buf, w: W, h: H, GW, GH, glow } = this;
    const cells = sim.cells;
    const sx = W / GW, sy = H / GH;

    // pass A: decay glow, heads deposit (comet bloom)
    for (let i = 0; i < glow.length; i++) glow[i] *= 0.935;
    for (let y = 2; y < GH - 2; y++) {
      const row = y * GW;
      for (let x = 2; x < GW - 2; x++) {
        const i = row + x;
        if (cells[i] !== HEAD) continue;
        glow[i] += 1.35;
        glow[i - 1] += 0.62; glow[i + 1] += 0.62;
        glow[i - GW] += 0.62; glow[i + GW] += 0.62;
        glow[i - GW - 1] += 0.3; glow[i - GW + 1] += 0.3;
        glow[i + GW - 1] += 0.3; glow[i + GW + 1] += 0.3;
        glow[i - 2] += 0.22; glow[i + 2] += 0.22;
        glow[i - 2 * GW] += 0.22; glow[i + 2 * GW] += 0.22;
      }
    }

    // pass B: colorize
    for (let gy = 0; gy < GH; gy++) {
      const y0 = (gy * sy) | 0, y1 = Math.min(H, ((gy + 1) * sy) | 0) || y0 + 1;
      const rowG = gy * GW;
      for (let gx = 0; gx < GW; gx++) {
        const i = rowG + gx;
        const s = cells[i];
        const gl = glow[i] > 1.6 ? 1.6 : glow[i];
        let c;
        if (s === HEAD) {
          c = px(224, 248, 255);
        } else if (s === TAIL) {
          c = px(235, 118, 44);
        } else if (s === WIRE) {
          // copper trace warming with afterglow
          const rr = 88 + gl * 165, gg2 = 58 + gl * 112, bb = 34 + gl * 50;
          c = px(rr > 255 ? 255 : rr | 0, gg2 > 255 ? 255 : gg2 | 0, bb > 255 ? 255 : bb | 0);
        } else {
          // PCB substrate: faint blue noise + violet haze from the afterglow
          const t = this.tex[i];
          const hz = gl * 16;
          c = px((5 + (t & 3) + hz * 0.7) | 0, (6 + ((t >> 2) & 3) + hz * 0.55) | 0, (11 + ((t >> 4) & 7) + hz) | 0);
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
