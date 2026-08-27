// render.js — CORDILLERA: hillshade relief + rivers + wetness. One putImageData.
import { px, blend } from './px.js';

export class Renderer {
  constructor(canvas, GW, GH) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.GW = GW; this.GH = GH;
    this.q = 0.7;
    this.tex = new Uint8Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      let h = (x * 374761393 + y * 668265263) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      this.tex[y * GW + x] = (h ^ (h >>> 16)) & 255;
    }
  }

  resize(w, h, q) {
    this.q = q;
    // buffer at GRID resolution — CSS upscales smooth (painterly relief)
    const W = this.GW, H = this.GH;
    this.cv.width = W; this.cv.height = H;
    this.cv.style.imageRendering = 'auto';   // smooth upscale = soft relief
    this.img = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.w = W; this.h = H;
  }

  frame(sim, t) {
    const { buf, w: W, h: H, GW, GH, tex } = this;
    const { height, water, flux } = sim;
    const sx = 1, sy = 1;   // buffer == grid
    for (let gy = 0; gy < GH; gy++) {
      const y0 = gy, y1 = gy + 1;
      const rowG = gy * GW;
      for (let gx = 0; gx < GW; gx++) {
        const i = rowG + gx;
        const h = height[i];
        const w = water[i];
        const f = flux[i];
        // hillshade: light from NW
        const gx2 = gx > 0 ? height[i - 1] : h, gy2 = gy > 0 ? height[i - GW] : h;
        const shade = Math.max(-0.5, Math.min(0.5, (h - gx2) * 8 + (h - gy2) * 8));
        const tx = tex[i];
        let r, g, b;
        if (h < 0) {
          // undersea shelf — deep teal
          const d = Math.min(1, -h * 2.2);
          r = 8 + d * 4; g = 18 - d * 8; b = 40 - d * 16;
        } else {
          // hypsometric ramp: dark moss → sienna → snow
          const e2 = Math.min(1.6, h);
          r = 26 + e2 * 78 + (tx & 7);
          g = 46 + e2 * 40 + ((tx >> 3) & 7);
          b = 24 + e2 * 24;
          if (h > 1.35) { const sn = 190 + (tx & 15); r = sn - 14; g = sn - 8; b = sn; }  // snow
          // hillshade (stronger: relief is the soul of the map)
          const sh = 1 + shade * 1.5;
          r *= sh; g *= sh; b *= sh;
          // wetness darkens toward slate
          const wet = Math.min(0.68, w * 7);
          r *= 1 - wet; g *= 1 - wet * 0.85; b *= 1 - wet * 0.5;
        }
        // water film → rivers
        if (w > 0.004) {
          const depth = Math.min(1, w * 14);
          r = r * (1 - depth) + 30 * depth;
          g = g * (1 - depth) + (90 + depth * 60) * depth;
          b = b * (1 - depth) + (160 + depth * 80) * depth;
        }
        // active channels glow glacier-cyan
        if (f > 0.05) {
          const fb = Math.min(1, f * 3.2);
          r = r * (1 - fb) + 120 * fb;
          g = g * (1 - fb) + 210 * fb;
          b = b * (1 - fb) + 235 * fb;
        }
        buf[gy * W + gx] = px(Math.min(255, r) | 0, Math.min(255, g) | 0, Math.min(255, b) | 0);
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
