// render.js — software framebuffer renderer (vesper/progeny lesson: no canvas raster).
// One putImageData per frame; fade-to-bg gives motion trails for free.
import { px, blend, plotA, softDisc, disc, fillPoly, lineA, circA, hslPx } from './px.js';
import { CFG } from './config.js';

const TAU = Math.PI * 2;
const _pts = new Float32Array(16);
const BULLET_COLS = new Array(360);
const BULLET_GLOW = new Array(360);

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.q = 0.6;
    this.fadeA = 46;                       // trail decay
    this._strainCol = new Map();
    this._mkStars();
  }

  _mkStars() {
    this.stars = [];
    for (let i = 0; i < 200; i++)
      this.stars.push({ x: Math.random(), y: Math.random(), s: 40 + Math.random() * 160 | 0, v: 0.004 + Math.random() * 0.02 });
  }

  resize(cssW, cssH, q) {
    this.q = q;
    this.cssW = cssW; this.cssH = cssH;
    const W = Math.max(2, Math.round(cssW * q)), H = Math.max(2, Math.round(cssH * q));
    this.cv.width = W; this.cv.height = H;
    this.img = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.w = W; this.h = H;
    // field rect in buffer coords
    const fh = H * 0.94, fw = fh * (CFG.FW / CFG.FH);
    this.fx0 = (W - fw) / 2; this.fy0 = H * 0.03;
    this.fs = fh / CFG.FH;                 // world unit → buffer px
    // bg gradients (field vs margin)
    this.rowsField = new Uint32Array(H);
    this.rowsMargin = new Uint32Array(H);
    for (let y = 0; y < H; y++) {
      const t = y / H;
      this.rowsField[y] = px(16 - t * 7, 9 - t * 4, 30 - t * 12);
      this.rowsMargin[y] = px(7 - t * 3, 4 - t * 2, 13 - t * 5);
    }
    this.buf.fill(px(16, 9, 30));
  }

  // world → buffer
  X(wx) { return this.fx0 + wx * this.fs; }
  Y(wy) { return this.fy0 + wy * this.fs; }
  // css px → world (null outside the field)
  toWorld(cx, cy) {
    const q = this.q;
    const fw = CFG.FW * this.fs, fh = CFG.FH * this.fs;
    const wx = (cx * q - this.fx0) / this.fs, wy = (cy * q - this.fy0) / this.fs;
    if (wx < 0 || wx > CFG.FW || wy < 0 || wy > CFG.FH) return null;
    return { x: wx, y: wy };
  }

  frame(sim, fx, t) {
    const { buf, w: W, h: H } = this;
    const FA = this.fadeA;
    const fx0 = this.fx0 | 0, fx1 = (this.fx0 + CFG.FW * this.fs) | 0;

    // 1) fade toward bg (field brighter than margins)
    for (let y = 0; y < H; y++) {
      const rf = this.rowsField[y], rm = this.rowsMargin[y];
      const fr = rf & 255, fg = (rf >> 8) & 255, fb = (rf >> 16) & 255;
      const mr = rm & 255, mg = (rm >> 8) & 255, mb = (rm >> 16) & 255;
      const off = y * W;
      for (let x = 0; x < W; x++) {
        const i = off + x, v = buf[i];
        const inField = x >= fx0 && x < fx1;
        const tr = inField ? fr : mr, tg = inField ? fg : mg, tb = inField ? fb : mb;
        const r = (v & 255) + (((tr - (v & 255)) * FA) >> 8);
        const g = ((v >> 8) & 255) + (((tg - ((v >> 8) & 255)) * FA) >> 8);
        const b = ((v >> 16) & 255) + (((tb - ((v >> 16) & 255)) * FA) >> 8);
        buf[i] = 0xff000000 | (b << 16) | (g << 8) | r;
      }
    }

    // 2) drifting stars (margins mostly; cheap parallax life)
    for (const s of this.stars) {
      s.y += s.v * 0.016;
      if (s.y > 1) s.y -= 1;
      const x = (s.x * W) | 0, y = (s.y * H) | 0;
      const a = s.s;
      plotA(buf, W, H, x, y, px(a, a * 0.9 | 0, Math.min(255, a + 30)), 200);
    }

    // 3) field border
    const bw = px(90, 60, 130);
    const fy1 = (this.fy0 + CFG.FH * this.fs) | 0;
    for (let x = fx0 - 1; x <= fx1 + 1; x++) { plotA(buf, W, H, x, this.fy0 | 0, bw, 70); plotA(buf, W, H, x, fy1, bw, 70); }
    for (let y = this.fy0 | 0; y <= fy1; y++) { plotA(buf, W, H, fx0 - 1, y, bw, 70); plotA(buf, W, H, fx1 + 1, y, bw, 70); }

    // 4) boss heart
    const hx = this.X(sim.pat.bx), hy = this.Y(sim.pat.by);
    const pulse = 1 + Math.sin(t * 4) * 0.18;
    const heartCol = this._hue(sim.pat.card === 'rings' ? 320 : sim.pat.card === 'star' ? 45 : sim.pat.card === 'rain' ? 210 : sim.pat.card === 'walls' ? 150 : sim.pat.card === 'flower' ? 280 : 190);
    softDisc(buf, W, H, hx | 0, hy | 0, (9 * this.fs * pulse) | 0, heartCol, 120);
    disc(buf, W, H, hx | 0, hy | 0, Math.max(2, 2.6 * this.fs * pulse) | 0, px(255, 240, 250));

    // 5) bullets
    const fs = this.fs;
    for (const b of sim.bullets) {
      const bx = this.X(b.x) | 0, by = this.Y(b.y) | 0;
      if (bx < 2 || bx >= W - 2 || by < 2 || by >= H - 2) continue;
      const hi = b.hue | 0;
      const glow = BULLET_GLOW[hi] || (BULLET_GLOW[hi] = hslPx(hi, 0.85, 0.42));
      const core = BULLET_COLS[hi] || (BULLET_COLS[hi] = hslPx(hi, 0.9, 0.72));
      const r = Math.max(1.6, b.r * fs) | 0;
      softDisc(buf, W, H, bx, by, (r * 1.8) | 0, glow, 90);
      disc(buf, W, H, bx, by, r, core);
    }

    // 6) agents
    for (const a of sim.agents) {
      const ax = this.X(a.x), ay = this.Y(a.y);
      if (ax < -4 || ax > W + 4 || ay < -4 || ay > H + 4) continue;
      const s = Math.max(1.8, 2.6 * fs);
      const col = this._col(a.hue);
      const hd = Math.atan2(a.vy, a.vx);
      _pts[0] = ax + Math.cos(hd) * s * 1.5; _pts[1] = ay + Math.sin(hd) * s * 1.5;
      _pts[2] = ax + Math.cos(hd + 2.6) * s; _pts[3] = ay + Math.sin(hd + 2.6) * s;
      _pts[4] = ax + Math.cos(hd - 2.6) * s; _pts[5] = ay + Math.sin(hd - 2.6) * s;
      fillPoly(buf, W, H, _pts, 3, col);
      if (a.elite) circA(buf, W, H, ax, ay, s * 2.1, px(255, 240, 190), 120);
      if (a.shield > 0) circA(buf, W, H, ax, ay, s * 1.9, px(220, 230, 255), ((a.shield * 120) | 0) & 127);
    }

    // 7) player
    const p = sim.player;
    if (p.alive) {
      const ax = this.X(p.x), ay = this.Y(p.y);
      const s = Math.max(2.2, 3 * fs);
      _pts[0] = ax; _pts[1] = ay - s * 1.6;
      _pts[2] = ax - s; _pts[3] = ay + s;
      _pts[4] = ax + s; _pts[5] = ay + s;
      fillPoly(buf, W, H, _pts, 3, px(245, 250, 255));
      circA(buf, W, H, ax, ay, s * 2.2, px(140, 230, 255), 110 + ((Math.sin(t * 6) * 40) | 0));
      if (p.shield > 0) circA(buf, W, H, ax, ay, s * 3, px(255, 255, 255), (p.shield * 90) | 0);
    }

    // 8) fx particles + rings
    for (const q2 of fx.parts) {
      const a = (q2.life / q2.maxLife * 220) | 0;
      plotA(buf, W, H, this.X(q2.x), this.Y(q2.y), this._fxCol(q2.color), a);
    }
    for (const r of fx.rings)
      circA(buf, W, H, this.X(r.x), this.Y(r.y), Math.max(2, r.r * this.fs * 0.5), this._fxCol(r.color), (r.life / r.maxLife * 200) | 0);

    // 9) bomb flash wash inside field
    if (sim.flash > 0.01) {
      const a = (sim.flash * 120) | 0;
      const fy0 = this.fy0 | 0, fy1 = (this.fy0 + CFG.FH * this.fs) | 0;
      const white = px(255, 240, 250);
      for (let y = fy0; y < fy1; y++) {
        const off = y * W;
        for (let x = fx0; x < fx1; x++) { const i = off + x; buf[i] = blend(buf[i], white, a); }
      }
    }

    this.ctx.putImageData(this.img, 0, 0);
  }

  _hue(h) { return hslPx(h, 0.85, 0.6); }
  _col(hue) {
    const hi = hue | 0;
    let c = this._strainCol.get(hi);
    if (!c) { c = hslPx(hue, 0.55, 0.60); this._strainCol.set(hi, c); }
    return c;
  }
  _fxCol(str) {
    let c = this._strainCol.get(str);
    if (!c) {
      let m = /(\d+)[^\d]+(\d+)%[^\d]+(\d+)%/.exec(str);
      if (m) c = hslPx(+m[1], +m[2] / 100, +m[3] / 100);
      else if (str[0] === '#') c = px(parseInt(str.slice(1, 3), 16), parseInt(str.slice(3, 5), 16), parseInt(str.slice(5, 7), 16));
      else if ((m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(str))) c = px(+m[1], +m[2], +m[3]);
      else c = px(220, 210, 235);
      this._strainCol.set(str, c);
    }
    return c;
  }
}
