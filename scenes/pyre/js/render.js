// render.js — PYRE framebuffer: material palette + fire/lava afterglow. One putImageData.
import { px } from './px.js';
import { EMPTY, STONE, SAND, WATER, OIL, WOOD, FIRE, LAVA, ACID, STEAM, SMOKE } from './sim.js';

export class Renderer {
  constructor(canvas, GW, GH) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.GW = GW; this.GH = GH;
    this.glow = new Float32Array(GW * GH);
    this.q = 0.6;
    // substrate noise
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
    const { buf, w: W, h: H, GW, GH, glow, tex } = this;
    const m = sim.m, life = sim.life;
    const sx = W / GW, sy = H / GH;
    const flick = (t * 13) | 0;

    for (let i = 0; i < glow.length; i++) glow[i] *= 0.90;

    // glow deposits: fire blooms 5x5, lava a tight 3x3
    for (let y = 2; y < GH - 2; y++) {
      const row = y * GW;
      for (let x = 2; x < GW - 2; x++) {
        const i = row + x;
        const mt = m[i];
        if (mt === FIRE) {
          glow[i] += 1.2;
          glow[i - 1] += 0.5; glow[i + 1] += 0.5; glow[i - GW] += 0.5; glow[i + GW] += 0.5;
          glow[i - 2] += 0.22; glow[i + 2] += 0.22; glow[i - 2 * GW] += 0.22; glow[i + 2 * GW] += 0.22;
          glow[i - GW - 1] += 0.2; glow[i - GW + 1] += 0.2; glow[i + GW - 1] += 0.2; glow[i + GW + 1] += 0.2;
        } else if (mt === LAVA) {
          glow[i] += 0.7;
          glow[i - 1] += 0.3; glow[i + 1] += 0.3;
          glow[i - GW] += 0.3; glow[i + GW] += 0.3;
        }
      }
    }

    for (let gy = 0; gy < GH; gy++) {
      const y0 = (gy * sy) | 0, y1 = Math.min(H, ((gy + 1) * sy) | 0) || y0 + 1;
      const rowG = gy * GW;
      for (let gx = 0; gx < GW; gx++) {
        const i = rowG + gx;
        const mt = m[i];
        const txx = tex[i];
        const gl = glow[i] > 1.6 ? 1.6 : glow[i];
        let c;
        switch (mt) {
          case STONE: { const v = 52 + ((txx >> 3) & 15); c = px(v, v - 4, v + 8); break; }
          case SAND: { const v = (txx & 31) - 15; c = px(178 + v, 148 + v, 92 + v * 0.6 | 0); break; }
          case WATER: { const w2 = ((txx + flick * 7) & 31) - 15; c = px(28, 86 + w2, 158 + w2); break; }
          case OIL: { const v = (txx & 15) - 7; const sheen = (txx & 8) ? 26 : 0; c = px(64 + v + sheen, 46 + v + ((sheen * 0.6) | 0), 26); break; }
          case WOOD: {
            if (life[i] > 0) { const v = 40 + (txx & 15); c = px(120 + gl * 120, 50 + gl * 60, 22); } // burning
            else { const v = (txx & 15) - 7; c = px(96 + v, 64 + v, 32); }
            break;
          }
          case FIRE: {
            const fl = ((txx * 2654435761 + flick * 7919) >> 4) & 31;
            c = px(255, 150 + fl * 3 > 255 ? 255 : 150 + fl * 3, 40 + fl * 2);
            break;
          }
          case LAVA: {
            const pl = 12 + ((txx + ((t * 3) | 0) * 5) & 15);
            c = px(196 + pl, 52 + pl, 16);
            break;
          }
          case ACID: { const v = ((txx + flick * 5) & 15) - 7; c = px(64 + v, 190 + v, 40); break; }
          case STEAM: { const v = 120 + ((txx >> 4) & 31); c = px(v, v, v + 8); break; }
          case SMOKE: { const v = 34 + ((txx >> 4) & 15); c = px(v, v, v + 3); break; }
          default: { // EMPTY: night substrate + firelight haze
            const hz = gl * 34;
            c = px((6 + (txx & 3) + hz) | 0, (7 + ((txx >> 2) & 3) + hz * 0.5) | 0, (13 + ((txx >> 4) & 7) + hz * 0.4) | 0);
          }
        }
        // warm halo around hot things
        if ((mt === STONE || mt === WOOD || mt === SAND) && gl > 0.15) {
          const r = c & 255, g2 = (c >> 8) & 255, b2 = (c >> 16) & 255;
          c = px(Math.min(255, r + gl * 90) | 0, Math.min(255, g2 + gl * 40) | 0, b2);
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
