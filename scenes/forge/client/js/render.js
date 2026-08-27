// render.js — top-down framebuffer renderer (SwiftShader-safe: one putImageData)
import { px, blend, plotA, softDisc, disc, fillPoly, lineA, circA, hslPx } from './px.js';

const TAU = Math.PI * 2;
const _pts = new Float32Array(16);

const RES_STYLE = {
  wood:    { glow: px(30, 60, 30),  core: px(70, 130, 60) },
  stone:   { glow: px(70, 70, 78),  core: px(130, 130, 142) },
  fiber:   { glow: px(90, 90, 30),  core: px(180, 175, 80) },
  crystal: { glow: px(40, 120, 140), core: px(120, 230, 255) },
};
const BLD_STYLE = {
  farm: px(120, 90, 40), turret: px(140, 140, 160), wall: px(100, 100, 110),
  totem: px(200, 120, 220), house: px(170, 120, 70), generic: px(190, 140, 70),
};

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.q = 0.55;
    this.labels = document.getElementById('labels');
    this._labelPool = [];
    this._mkGround();
    this._swings = [];   // {x,y,aim,t}
    this._shoots = [];   // {x,y,x2,y2,t}
    this._deaths = [];
  }

  _mkGround() {
    // 512×512 wrap tile, dark mossy noise + speckles
    const S = 512;
    this.gtile = new Uint32Array(S * S);
    const h = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      // wrapped 2-octave noise
      const n1 = h(x >> 4, y >> 4) * 0.6 + h(x >> 3, y >> 3) * 0.4;
      const n2 = h(x >> 2, y >> 2);
      const v = 30 + n1 * 30 + n2 * 11;
      let r = v * 0.95, g = v * 1.12, b = v * 0.72;
      if (n2 > 0.93) { r += 22; g += 18; b += 8; }        // dry speckle
      if (n1 < 0.22) { r *= 0.8; g *= 0.85; b *= 0.8; }   // moss hollows
      this.gtile[y * S + x] = px(r | 0, g | 0, b | 0);
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

  // world → buffer
  X(x, cam) { return (x - cam.x) * cam.z * this.q + this.w / 2; }
  Y(y, cam) { return (y - cam.y) * cam.z * this.q + this.h / 2; }

  fxSwing(x, y, aim) { this._swings.push({ x, y, aim, t: 0.25 }); }
  fxShoot(x, y, x2, y2) { this._shoots.push({ x, y, x2, y2, t: 0.2 }); }
  fxDeath(x, y) { this._deaths.push({ x, y, t: 0.7 }); }

  frame(st, cam, t) {
    const { buf, w: W, h: H } = this;
    const zq = cam.z * this.q;

    // 1) ground tile — world-mapped (texel = 2 world units), wrapped
    const S = 512, gt = this.gtile;
    const invZq2 = 0.5 / zq;               // world → texel (2u/texel)
    const cw = cam.x * 0.5, ch2 = cam.y * 0.5;
    for (let y = 0; y < H; y++) {
      const wy = (((ch2 + (y - (H >> 1)) * invZq2) | 0) & (S - 1)) * S;
      const rowB = y * W;
      const base = cw - (W >> 1) * invZq2;
      for (let x = 0; x < W; x++) buf[rowB + x] = gt[wy + (((base + x * invZq2) | 0) & (S - 1))];
    }

    // 2) resource nodes
    for (const nd of st.nodes) {
      const [id, kind, wx, wy, bucket] = nd;
      const sx = this.X(wx, cam), sy = this.Y(wy, cam);
      if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;
      const st2 = RES_STYLE[kind];
      const sz = (0.4 + bucket / 5 * 0.6);
      this._drawNode(kind, sx, sy, sz * zq, st2, bucket <= 0);
    }

    // 3) pickups
    for (const p of st.pickups) {
      const [id, wx, wy, res] = p;
      const sx = this.X(wx, cam), sy = this.Y(wy, cam) + Math.sin(t * 3 + id) * 2;
      if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;
      const st2 = RES_STYLE[res];
      plotA(buf, W, H, sx, sy, st2.core, 230);
      plotA(buf, W, H, sx + 1, sy, st2.core, 160);
      plotA(buf, W, H, sx, sy + 1, st2.core, 160);
    }

    // 4) buildings
    for (const b of st.buildings) {
      const [id, name, emoji, behavior, wx, wy, hp10] = b;
      const sx = this.X(wx, cam), sy = this.Y(wy, cam);
      if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
      const s = 16 * zq;
      const col = BLD_STYLE[behavior] || BLD_STYLE.generic;
      // base
      _pts[0] = sx - s; _pts[1] = sy - s; _pts[2] = sx + s; _pts[3] = sy - s;
      _pts[4] = sx + s; _pts[5] = sy + s; _pts[6] = sx - s; _pts[7] = sy + s;
      fillPoly(buf, W, H, _pts, 4, blend(col, px(0, 0, 0), 40));
      // inner
      const s2 = s * 0.72;
      _pts[0] = sx - s2; _pts[1] = sy - s2; _pts[2] = sx + s2; _pts[3] = sy - s2;
      _pts[4] = sx + s2; _pts[5] = sy + s2; _pts[6] = sx - s2; _pts[7] = sy + s2;
      fillPoly(buf, W, H, _pts, 4, col);
      if (behavior === 'turret') {
        const a = t * 0.7 + id;
        lineA(buf, W, H, sx, sy, sx + Math.cos(a) * s * 1.3, sy + Math.sin(a) * s * 1.3, px(220, 220, 240), 200);
      } else if (behavior === 'farm') {
        for (let r = -1; r <= 1; r++) lineA(buf, W, H, sx - s2, sy + r * s2 * 0.5, sx + s2, sy + r * s2 * 0.5, px(70, 140, 60), 160);
      } else if (behavior === 'totem') {
        circA(buf, W, H, sx, sy, s * (1.2 + 0.2 * Math.sin(t * 2 + id)), px(230, 160, 255), 60);
      }
      // warm hearth glow
      softDisc(buf, W, H, sx | 0, sy | 0, (s * 1.7) | 0, px(255, 170, 90), 20);
      // damage ticks
      if (hp10 < 10) lineA(buf, W, H, sx - s, sy - s - 4, sx - s + (2 * s) * hp10 / 10, sy - s - 4, px(255, 90, 70), 200);
    }

    // 5) death flashes
    for (let i = this._deaths.length - 1; i >= 0; i--) {
      const d = this._deaths[i];
      d.t -= 1 / 60;
      if (d.t <= 0) { this._deaths.splice(i, 1); continue; }
      const sx = this.X(d.x, cam), sy = this.Y(d.y, cam);
      circA(buf, W, H, sx, sy, (0.7 - d.t) * 46 * zq, px(255, 120, 100), (d.t * 300) | 0);
    }

    // 6) players (players: [id,x,y,hp,equipEmoji,aliveFlag,name,bot,score,kills])
    for (const p of st.players) {
      const [id, wx, wy, hp, eqEmoji, aliveF, name, bot] = p;
      if (aliveF !== 1) continue;   // skip dead + ghosts
      const sx = this.X(wx, cam), sy = this.Y(wy, cam);
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
      const col = hslPx((id * 47) % 360, 0.6, 0.58);
      const r = Math.max(2, 8 * zq);
      disc(buf, W, H, sx | 0, sy | 0, r | 0, col);
      circA(buf, W, H, sx, sy, r + 1.5, px(240, 230, 210), id === st.myId ? 200 : 60);
      softDisc(buf, W, H, sx | 0, sy | 0, r * 3.2 | 0, px(255, 180, 100), 14);
      // hp tick
      if (hp < 100) lineA(buf, W, H, sx - 8, sy - r - 5, sx - 8 + 16 * hp / 100, sy - r - 5, px(255, 110, 90), 220);
      // gather progress arc over my own head
      if (id === st.myId && st.meGather > 0) {
        const ga = st.meGather * TAU;
        for (let a2 = -Math.PI / 2; a2 < ga - Math.PI / 2; a2 += 0.3)
          plotA(buf, W, H, sx + Math.cos(a2) * (r + 4), sy + Math.sin(a2) * (r + 4), px(255, 220, 140), 220);
      }
    }

    // 7) swing arcs + projectile tracers
    for (let i = this._swings.length - 1; i >= 0; i--) {
      const s = this._swings[i];
      s.t -= 1 / 60;
      if (s.t <= 0) { this._swings.splice(i, 1); continue; }
      const sx = this.X(s.x, cam), sy = this.Y(s.y, cam);
      const rr = 30 * zq;
      for (let a = -0.9; a <= 0.9; a += 0.18) {
        const ang = s.aim + a;
        plotA(buf, W, H, sx + Math.cos(ang) * rr, sy + Math.sin(ang) * rr, px(255, 230, 180), (s.t * 700) | 0);
      }
    }
    for (let i = this._shoots.length - 1; i >= 0; i--) {
      const s = this._shoots[i];
      s.t -= 1 / 60;
      if (s.t <= 0) { this._shoots.splice(i, 1); continue; }
      lineA(buf, W, H, this.X(s.x, cam), this.Y(s.y, cam), this.X(s.x2, cam), this.Y(s.y2, cam), px(255, 200, 120), (s.t * 800) | 0);
    }

    // 8) projectiles
    for (const pr of st.projectiles) {
      const sx = this.X(pr[0], cam), sy = this.Y(pr[1], cam);
      softDisc(buf, W, H, sx | 0, sy | 0, 4, px(255, 190, 110), 200);
    }

    this.ctx.putImageData(this.img, 0, 0);
    this._labels(st, cam);
  }

  _drawNode(kind, sx, sy, s, st2, depleted) {
    const { buf, w: W, h: H } = this;
    const a = depleted ? 70 : 255;
    if (kind === 'wood') {
      const r = Math.max(2, 9 * s);
      disc(buf, W, H, sx | 0, (sy - r * 0.6) | 0, r | 0, blend(st2.core, px(0, 0, 0), depleted ? 140 : 20));
      lineA(buf, W, H, sx, sy, sx, sy + r * 0.9, px(90, 60, 30), a);
    } else if (kind === 'stone') {
      const r = Math.max(2, 7 * s);
      _pts[0] = sx; _pts[1] = sy - r; _pts[2] = sx + r; _pts[3] = sy - r * 0.2;
      _pts[4] = sx + r * 0.6; _pts[5] = sy + r * 0.8; _pts[6] = sx - r * 0.7; _pts[7] = sy + r * 0.7;
      _pts[8] = sx - r; _pts[9] = sy - r * 0.3;
      fillPoly(buf, W, H, _pts, 5, blend(st2.core, px(0, 0, 0), depleted ? 150 : 30));
    } else if (kind === 'fiber') {
      const r = Math.max(2, 8 * s);
      for (let k = -1; k <= 1; k++)
        lineA(buf, W, H, sx + k * r * 0.5, sy + r * 0.4, sx + k * r * 0.3, sy - r, st2.core, a);
    } else {
      const r = Math.max(2, 6.5 * s);
      _pts[0] = sx; _pts[1] = sy - r * 1.3; _pts[2] = sx + r * 0.8; _pts[3] = sy;
      _pts[4] = sx; _pts[5] = sy + r * 1.3; _pts[6] = sx - r * 0.8; _pts[7] = sy;
      fillPoly(buf, W, H, _pts, 4, blend(st2.core, px(0, 0, 0), depleted ? 150 : 0));
      if (!depleted) softDisc(buf, W, H, sx | 0, sy | 0, r * 2 | 0, st2.glow, 60);
    }
  }

  // DOM labels for names (cheap compositor, no canvas text cost)
  _labels(st, cam) {
    let i = 0;
    const put = (x, y, txt, cls) => {
      let el = this._labelPool[i];
      if (!el) {
        el = document.createElement('div');
        this.labels.appendChild(el);
        this._labelPool[i] = el;
      }
      const sx = (x - cam.x) * cam.z + this.cv.clientWidth / 2;
      const sy = (y - cam.y) * cam.z + this.cv.clientHeight / 2;
      el.style.transform = `translate(-50%,-100%) translate(${sx | 0}px,${sy | 0}px)`;
      el.textContent = txt;
      el.className = 'lbl ' + cls;
      i++;
    };
    for (const p of st.players) {
      if (p[5] !== 1) continue;
      put(p[1], p[2] - 14, p[6] + (p[4] ? ' ' + p[4] : ''), p[7] ? 'bot' : '');
    }
    for (const b of st.buildings) {
      const dx = b[4] - cam.x, dy = b[5] - cam.y;
      if (Math.abs(dx) > 500 || Math.abs(dy) > 300) continue;
      put(b[4], b[5] - 22, `${b[2]} ${b[1]}`, 'bld');
    }
    for (let k = this._labelPool.length - 1; k >= i; k--) {
      this._labelPool[k].remove();
      this._labelPool.pop();
    }
  }
}
