// render.js — MERIDIAN: tiles as tiny cartographic stamps; the collapse front glows.
import { px, blend } from './px.js';
import { TILES, S_GRASS, S_ROAD, S_WATER, S_BUILT } from './tiles.js';
import { RUBBLE } from './sim.js';

const CS = 6;   // tile stamp size in grid pixels

function buildStamps() {
  // returns Uint32Array[T][CS*CS]
  const T = TILES.length + 1;
  const out = [];
  const noise = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) & 255) / 255; };
  for (let t = 0; t < T; t++) {
    const st = new Uint32Array(CS * CS);
    if (t === RUBBLE) {
      for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++)
        st[y * CS + x] = px(58 + noise(x, y) * 20 | 0, 30, 26);
      out.push(st); continue;
    }
    const s = TILES[t].s;
    for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) {
      const n = noise(x * 7 + t * 13, y * 5 + t);
      // base: meadow or block or water body from dominant socket
      const center = s[0] === S_WATER && s[1] === S_WATER ? S_WATER : (s[0] === S_BUILT && s[1] === S_BUILT ? S_BUILT : S_GRASS);
      let c;
      if (center === S_WATER) c = px(26, 64 + n * 20 | 0, 120 + n * 30 | 0);
      else if (center === S_BUILT) c = px(148 + n * 26 | 0, 108 + n * 20 | 0, 52);
      else c = px(30, 52 + n * 22 | 0, 30);
      // road stripes along road sockets
      const roadAt = (d) => s[d] === S_ROAD;
      const nearEdge = (d) => (d === 0 && y < 2) || (d === 1 && x >= CS - 2) || (d === 2 && y >= CS - 2) || (d === 3 && x < 2);
      const midLine = (d) => (d === 0 && y === 1) || (d === 1 && x === CS - 2) || (d === 2 && y === CS - 2) || (d === 3 && x === 1);
      let isRoad = false, isLine = false;
      for (let d = 0; d < 4; d++) if (roadAt(d)) {
        // road runs from edge toward center
        const horiz = (d === 1 || d === 3);
        const inBand = horiz ? (y >= 2 && y <= 3) : (x >= 2 && x <= 3);
        if (inBand) {
          isRoad = true;
          if ((horiz && y === 2 && (x + t) % 2 === 0) || (!horiz && x === 2 && (y + t) % 2 === 0)) isLine = true;
        }
      }
      if (s[0] === S_ROAD && s[1] === S_ROAD && s[2] === S_ROAD && s[3] === S_ROAD) { isRoad = true; isLine = (x === 2 && y === 2); }
      if (isRoad) c = isLine ? px(196, 188, 140) : px(74, 72, 66);
      // water edges shimmer
      if (s.includes(S_WATER) && center !== S_WATER) {
        for (let d = 0; d < 4; d++) if (s[d] === S_WATER && nearEdge(d)) c = px(30, 80 + n * 24 | 0, 150 + n * 40 | 0);
      }
      // windows on built
      if (center === S_BUILT && n > 0.72) c = px(255, 220, 130);
      st[y * CS + x] = c;
    }
    out.push(st);
  }
  return out;
}

export class Renderer {
  constructor(canvas, GW, GH) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.GW = GW; this.GH = GH;
    this.q = 0.85;
    this.stamps = buildStamps();
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
    const { buf, w: W, h: H, GW, GH, stamps, tex } = this;
    const sx = W / GW, sy = H / GH;
    for (let gy = 0; gy < GH; gy++) {
      const y0 = (gy * sy) | 0, y1 = Math.min(H, ((gy + 1) * sy) | 0) || y0 + 1;
      const rowG = gy * GW;
      for (let gx = 0; gx < GW; gx++) {
        const i = rowG + gx;
        const x0 = (gx * sx) | 0, x1 = Math.min(W, ((gx + 1) * sx) | 0) || x0 + 1;
        if (sim.state[i] === 1 || sim.state[i] === 2) {
          // blit the full 6×6 stamp scaled over the cell (roads connect)
          const st = stamps[sim.state[i] === 2 ? RUBBLE : sim.tile[i]];
          const fg = sim.frontier[i];
          const fa = Math.min(200, fg * 6);
          for (let y = y0; y < y1; y++) {
            const sty = Math.min(CS - 1, ((y - y0) * CS / Math.max(1, y1 - y0)) | 0);
            const rowB = y * W;
            for (let x = x0; x < x1; x++) {
              const stx = Math.min(CS - 1, ((x - x0) * CS / Math.max(1, x1 - x0)) | 0);
              let c = st[sty * CS + stx];
              if (fg > 0) c = blend(c, px(255, 250, 220), fa);
              buf[rowB + x] = c;
            }
          }
        } else {
          // superposed: fog of possibility, entropy-coded
          const e = sim.ent[i];
          const v = 12 + Math.min(30, e * 2) + ((tex[i] >> 5) & 3);
          const c = px(v * 0.55 | 0, v * 0.7 | 0, v);
          for (let y = y0; y < y1; y++) {
            const rowB = y * W;
            for (let x = x0; x < x1; x++) buf[rowB + x] = c;
          }
        }
      }
    }
    // decay the frontier glow
    for (let i = 0; i < sim.frontier.length; i++) if (sim.frontier[i] > 0) sim.frontier[i]--;
    this.ctx.putImageData(this.img, 0, 0);
  }
}
