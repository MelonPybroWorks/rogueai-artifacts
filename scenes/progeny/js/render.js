// render.js — software framebuffer renderer. One putImageData per frame.
// (vesper lesson: SwiftShader collapses on canvas path raster, not on JS pixels.)
import { px, blend, plotA, softDisc, fillPoly, lineA, circA, hslPx } from './px.js';

const TAU = Math.PI * 2;
const _pts = new Float32Array(32);

const AST_SHADES = [px(30, 40, 56), px(38, 50, 69), px(50, 65, 88), px(62, 79, 105), px(75, 95, 124), px(90, 112, 143)];
const COL = {
  beam: px(126, 224, 194),
  thrust: px(255, 196, 120),
  derelict: px(120, 138, 160),
  dormant: px(110, 140, 175),
  foundry: px(190, 240, 255),
  comet: px(170, 230, 255),
  cometHead: px(225, 246, 255),
  scorch: px(255, 120, 50),
  flareHot: px(255, 236, 200),
  flareMid: px(255, 150, 70),
  flareDeep: px(210, 70, 35),
  warn: px(255, 110, 50),
  cursor: px(126, 224, 194),
};

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.q = 0.5;
    this.fadeA = 64;                     // trail decay (0..255 toward bg)
    this.mouse = { x: -1, y: -1, active: false };
    this._strainCol = new Map();
    this._mkStars();
  }

  _mkStars() {
    this.stars = [];
    for (let i = 0; i < 320; i++) {
      this.stars.push({
        x: Math.random() * 4096, y: Math.random() * 4096,
        par: 0.05 + Math.random() * 0.30,
        big: Math.random() < 0.14,
        b: 90 + Math.random() * 165 | 0,
        tw: Math.random() * TAU,
      });
    }
  }

  resize(cssW, cssH, q) {
    this.q = q;
    const W = Math.max(2, Math.round(cssW * q)), H = Math.max(2, Math.round(cssH * q));
    this.cv.width = W; this.cv.height = H;
    this.img = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.w = W; this.h = H;
    // static vertical bg gradient rows
    this.rows = new Uint32Array(H);
    for (let y = 0; y < H; y++) {
      const t = y / H;
      this.rows[y] = px(9 - t * 5, 14 - t * 7, 25 - t * 12);
    }
    this.buf.fill(px(9, 14, 25));
  }

  strainColor(strain) {
    let c = this._strainCol.get(strain.id);
    if (!c) { c = hslPx(strain.hue, 0.72, 0.62); this._strainCol.set(strain.id, c); }
    return c;
  }

  frame(world, eco, fx, cam, t) {
    const { buf, w: W, h: H, rows } = this;
    const FA = this.fadeA;

    // 1) fade toward bg rows (gives motion trails for free)
    for (let y = 0; y < H; y++) {
      const rc = rows[y];
      const rr = rc & 255, rg = (rc >> 8) & 255, rb = (rc >> 16) & 255;
      const off = y * W;
      for (let x = 0; x < W; x++) {
        const i = off + x, v = buf[i];
        const r = (v & 255) + (((rr - (v & 255)) * FA) >> 8);
        const g = ((v >> 8) & 255) + (((rg - ((v >> 8) & 255)) * FA) >> 8);
        const b = ((v >> 16) & 255) + (((rb - ((v >> 16) & 255)) * FA) >> 8);
        buf[i] = 0xff000000 | (b << 16) | (g << 8) | r;
      }
    }

    // buffer-space camera helpers
    const sx = (wx) => (wx - cam.x) * cam.zoom * this.q + W / 2;
    const sy = (wy) => (wy - cam.y) * cam.zoom * this.q + H / 2;
    const z = cam.zoom * this.q;   // world unit → buffer px

    // 2) nebulae (world space, bounded additive glow)
    this._neb(sx, sy, z, world.R * 0.24, world.R * 0.30, world.R * 0.50, px(22, 54, 86), 30);
    this._neb(sx, sy, z, world.R * 0.78, world.R * 0.62, world.R * 0.58, px(50, 30, 76), 26);
    this._neb(sx, sy, z, world.R * 0.52, world.R * 0.85, world.R * 0.38, px(16, 64, 64), 22);

    // 3) stars (parallax wrap)
    for (const s of this.stars) {
      const ox = cam.x * s.par * cam.zoom * this.q * 0.6;
      const oy = cam.y * s.par * cam.zoom * this.q * 0.6;
      let x = (s.x - ox) % (W + 4); if (x < 0) x += W + 4;
      let y = (s.y - oy) % (H + 4); if (y < 0) y += H + 4;
      const a = (s.b * (0.55 + 0.45 * Math.sin(t * 1.6 + s.tw))) | 0;
      plotA(buf, W, H, x - 2, y - 2, px(a, a, Math.min(255, a + 24)), 255);
      if (s.big) {
        plotA(buf, W, H, x - 1, y - 2, px(a, a, a), 140);
        plotA(buf, W, H, x - 3, y - 2, px(a, a, a), 140);
      }
    }

    // view bounds (world units, margin)
    const vw = W / (2 * z), vh = H / (2 * z);
    const vx0 = cam.x - vw - 100, vx1 = cam.x + vw + 100;
    const vy0 = cam.y - vh - 100, vy1 = cam.y + vh + 100;

    // 4) comets
    for (const c of world.comets) {
      const cx = sx(c.x), cy = sy(c.y);
      const sp = Math.hypot(c.vx, c.vy) || 1;
      lineA(buf, W, H, cx, cy, cx - (c.vx / sp) * 170 * z, cy - (c.vy / sp) * 170 * z, COL.comet, 120);
      softDisc(buf, W, H, cx | 0, cy | 0, Math.max(3, 9 * z) | 0, COL.cometHead, 190);
    }

    // 5) asteroids
    for (const a of world.asteroids) {
      if (a.x < vx0 - a.r || a.x > vx1 + a.r || a.y < vy0 - a.r || a.y > vy1 + a.r) continue;
      const frac = a.maxOre > 0 ? a.ore / a.maxOre : 0;
      const shade = a.dead || frac < 0.04 ? 0 : 1 + Math.min(4, (frac * 4.4) | 0);
      const ax = sx(a.x), ay = sy(a.y);
      const r = Math.max(1.8, a.r * z);
      const nv = a.verts.length;
      for (let i = 0; i < nv; i++) {
        const ang = a.rot + (i / nv) * TAU;
        const rr = r * a.verts[i];
        _pts[i * 2] = ax + Math.cos(ang) * rr;
        _pts[i * 2 + 1] = ay + Math.sin(ang) * rr;
      }
      fillPoly(buf, W, H, _pts, nv, AST_SHADES[shade]);
      if (a.scorch > 0.02)
        softDisc(buf, W, H, ax | 0, ay | 0, r | 0, COL.scorch, (a.scorch * 90) | 0);
    }

    // 6) probes
    const showBeams = cam.zoom > 0.16;
    for (const p of eco.probes) {
      if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue;
      const pxs = sx(p.x), pys = sy(p.y);
      const s = Math.max(1.7, p.size * z * 2.0);

      if (p.state === 'derelict') {
        lineA(buf, W, H, pxs - s, pys - s, pxs + s, pys + s, COL.derelict, 90);
        lineA(buf, W, H, pxs + s, pys - s, pxs - s, pys + s, COL.derelict, 90);
        continue;
      }
      if (p.state === 'dormant') {
        circA(buf, W, H, pxs, pys, s, COL.dormant, 80);
        continue;
      }
      // hull triangle
      const hd = p.heading;
      _pts[0] = pxs + Math.cos(hd) * s * 1.6; _pts[1] = pys + Math.sin(hd) * s * 1.6;
      _pts[2] = pxs + Math.cos(hd + 2.5) * s; _pts[3] = pys + Math.sin(hd + 2.5) * s;
      _pts[4] = pxs + Math.cos(hd - 2.5) * s; _pts[5] = pys + Math.sin(hd - 2.5) * s;
      fillPoly(buf, W, H, _pts, 3, this.strainColor(p.strain));

      if (p.thrust > 0.45) {
        const bx = pxs - Math.cos(hd) * s * 1.8, by = pys - Math.sin(hd) * s * 1.8;
        softDisc(buf, W, H, bx | 0, by | 0, Math.max(2, s * 0.9) | 0, COL.thrust, 150);
      }
      if (p.state === 'mine' && showBeams && p.target && !p.target.dead)
        lineA(buf, W, H, pxs, pys, sx(p.target.x), sy(p.target.y), COL.beam, 26);
      if (p.state === 'foundry') {
        const fr = s * 3.0;
        circA(buf, W, H, pxs, pys, fr, COL.foundry, 110);
        for (let k = 0; k < 3; k++) {
          const a2 = p.heading * 3 + (k / 3) * TAU;
          lineA(buf, W, H, pxs + Math.cos(a2) * fr * 0.4, pys + Math.sin(a2) * fr * 0.4,
                pxs + Math.cos(a2) * fr, pys + Math.sin(a2) * fr, COL.foundry, 90);
        }
      }
    }

    // 7) particles
    for (const q2 of fx.parts) {
      if (q2.x < vx0 || q2.x > vx1 || q2.y < vy0 || q2.y > vy1) continue;
      const a = (q2.life / q2.maxLife * 220) | 0;
      plotA(buf, W, H, sx(q2.x), sy(q2.y), this._fxCol(q2.color), a);
    }

    // 8) rings
    for (const r of fx.rings)
      circA(buf, W, H, sx(r.x), sy(r.y), Math.max(2, r.r * z), this._fxCol(r.color), (r.life / r.maxLife * 200) | 0);

    // 9) solar flare
    const f = world.flare;
    if (f.phase === 'warn') {
      // directional wash from the incoming side
      const pulse = 0.5 + 0.5 * Math.sin(t * 9);
      const aMax = 26 + pulse * 30;
      const nx = f.nx, ny = f.ny;
      const cxh = W / 2, cyh = H / 2;
      const reach = (W + H) * 0.5;
      for (let y = 0; y < H; y += 1) {
        const dy = y - cyh;
        for (let x = 0; x < W; x++) {
          const d = 1 - ((x - cxh) * nx + dy * ny) / reach;   // 1 at incoming edge
          const a = (d > 0.55 ? (d - 0.55) * 2.2 * aMax : 0) | 0;
          if (a > 0) { const i = y * W + x; buf[i] = blend(buf[i], COL.warn, Math.min(70, a)); }
        }
      }
    } else if (f.phase === 'sweep') {
      const nx = f.nx, ny = f.ny;
      const hx = sx(f.ox + nx * f.dist), hy = sy(f.oy + ny * f.dist);
      const bandBack = 340 * z, core = Math.max(2, 16 * z);
      for (let y = 0; y < H; y++) {
        const dy = y - hy, row = y * W;
        for (let x = 0; x < W; x++) {
          const pr = (x - hx) * nx + dy * ny;   // >0 = ahead of front
          if (pr > core || pr < -bandBack) continue;
          const i = row + x;
          if (pr > 0) buf[i] = blend(buf[i], COL.flareHot, 220);
          else {
            const u = 1 + pr / bandBack;        // 1 at core → 0 deep
            buf[i] = blend(buf[i], u > 0.5 ? COL.flareMid : COL.flareDeep, (u * u * 200) | 0);
          }
        }
      }
    }

    // 10) cursor reticle
    if (this.mouse.active && !cam.auto) {
      const mx = this.mouse.x * this.q, my = this.mouse.y * this.q;
      circA(buf, W, H, mx, my, 8, COL.cursor, 120);
      lineA(buf, W, H, mx - 12, my, mx - 5, my, COL.cursor, 120);
      lineA(buf, W, H, mx + 5, my, mx + 12, my, COL.cursor, 120);
      lineA(buf, W, H, mx, my - 12, mx, my - 5, COL.cursor, 120);
      lineA(buf, W, H, mx, my + 5, mx, my + 12, COL.cursor, 120);
    }

    this.ctx.putImageData(this.img, 0, 0);
  }

  _neb(sx, sy, z, wx, wy, wr, col, aMax) {
    const x = sx(wx), y = sy(wy);
    const r = Math.min(wr * z, this.h * 0.62) | 0;
    if (r < 10 || x < -r || x > this.w + r || y < -r || y > this.h + r) return;
    softDisc(this.buf, this.w, this.h, x | 0, y | 0, r, col, aMax);
  }

  _fxCol(str) {
    // fx colors arrive as css strings; cache parsed rgb
    let c = this._strainCol.get(str);
    if (!c) {
      let m = /(\d+)[^\d]+(\d+)%[^\d]+(\d+)%/.exec(str);
      if (m) c = hslPx(+m[1], +m[2] / 100, +m[3] / 100);
      else if (str[0] === '#') c = px(parseInt(str.slice(1, 3), 16), parseInt(str.slice(3, 5), 16), parseInt(str.slice(5, 7), 16));
      else if ((m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(str))) c = px(+m[1], +m[2], +m[3]);
      else c = px(200, 220, 235);
      this._strainCol.set(str, c);
    }
    return c;
  }
}
