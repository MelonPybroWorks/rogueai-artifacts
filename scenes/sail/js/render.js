// render.js — SAIL: cloth as additive woven lines + strain color. Fade trails.
import { px, blend } from './px.js';

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.q = 0.6;
  }

  resize(w, h, q) {
    this.q = q;
    const W = Math.max(2, Math.round(w * q)), H = Math.max(2, Math.round(h * q));
    this.cv.width = W; this.cv.height = H;
    this.img = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.w = W; this.h = H;
    this.ws = W / 960;   // world is fixed 960×540
  }

  frame(sim, t, sky) {
    const { buf, w: W, h: H } = this;
    // sky: slow dusk gradient + fade for trails
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      const r = (c & 255) * 0.90, g = ((c >> 8) & 255) * 0.90, b = ((c >> 16) & 255) * 0.93;
      buf[i] = 0xff000000 | (((b | 0) + 2) << 16) | (((g | 0) + 1) << 8) | (r | 0);
    }
    // cloth: structural constraints as lines; shear only when strained
    const x = sim.x, y = sim.y;
    for (let c = 0; c < sim.cons.length; c++) {
      const con = sim.cons[c];
      if (con.broken) continue;
      if (con.shear) {
        const ddx = x[con.b] - x[con.a], ddy = y[con.b] - y[con.a];
        if (Math.abs(Math.hypot(ddx, ddy) - con.rest) < con.rest * 0.22) continue;  // hide calm shear
      }
      const ax = x[con.a], ay = y[con.a], bx2 = x[con.b], by2 = y[con.b];
      const d = Math.hypot(bx2 - ax, by2 - ay);
      const strain = Math.min(1, Math.abs(d - con.rest) / con.rest);
      // calm weave = dim cyan; strained = warm; about-to-tear = white-hot
      const col = strain > 0.6 ? px(255, 230, 200) : strain > 0.25 ? px(240, 170, 90) : px(70, 150, 170);
      this._line(ax * this.ws, ay * this.ws, bx2 * this.ws, by2 * this.ws, col, 150);
    }
    // pins as bright dots
    for (let i = 0; i < sim.N; i++) {
      if (!sim.pinned[i]) continue;
      const X = (x[i] * this.ws) | 0, Y = (y[i] * this.ws) | 0;
      if (X >= 1 && Y >= 1 && X < W - 1 && Y < H - 1) {
        buf[Y * W + X] = px(255, 240, 200);
        buf[Y * W + X + 1] = px(255, 240, 200);
        buf[Y * W + X + W] = px(255, 240, 200);
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  _line(x0, y0, x1, y1, col, a) {
    const { buf, w: W, h: H } = this;
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) || 1;
    for (let s = 0; s <= steps; s++) {
      const X = (x0 + (x1 - x0) * s / steps) | 0, Y = (y0 + (y1 - y0) * s / steps) | 0;
      if (X >= 0 && Y >= 0 && X < W && Y < H) {
        const i = Y * W + X;
        buf[i] = blend(buf[i], col, a);
      }
    }
  }
}
