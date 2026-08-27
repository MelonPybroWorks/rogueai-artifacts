// render.js — software 3D: painter-sorted icosphere on a JS framebuffer.
// (SwiftShader lesson: own the pixels; one putImageData per frame.)
import { px, blend, plotA, softDisc, disc, fillPoly, lineA, circA, hslPx } from './px.js';
import { CFG } from './config.js';

const TAU = Math.PI * 2;
const _pts = new Float32Array(8);

// biome base colors
const BIOME = [
  px(16, 34, 68),    // 0 ocean
  px(64, 92, 44),    // 1 plain
  px(120, 100, 58),  // 2 arid
  px(88, 84, 74),    // 3 hill
  px(30, 88, 50),    // 4 lush
];

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.q = 0.55;
    this.fadeA = 58;
    this._strainCol = new Map();
    this._order = null;
    this._mkStars();
  }

  _mkStars() {
    this.stars = [];
    for (let i = 0; i < 260; i++)
      this.stars.push({ x: Math.random() * 4096, y: Math.random() * 4096, b: 60 + Math.random() * 170 | 0, tw: Math.random() * TAU });
  }

  resize(cssW, cssH, q) {
    this.q = q; this.cssW = cssW; this.cssH = cssH;
    const W = Math.max(2, Math.round(cssW * q)), H = Math.max(2, Math.round(cssH * q));
    this.cv.width = W; this.cv.height = H;
    this.img = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.w = W; this.h = H;
    this.rows = new Uint32Array(H);
    for (let y = 0; y < H; y++) {
      const t = y / H;
      this.rows[y] = px(5 - t * 2, 7 - t * 3, 14 - t * 6);
    }
    this.buf.fill(px(5, 7, 14));
  }

  frame(sp, life, fx, cam, sun, t) {
    const { buf, w: W, h: H } = this;
    const FA = this.fadeA;

    // 1) fade toward bg rows (trails)
    for (let y = 0; y < H; y++) {
      const rc = this.rows[y];
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

    // 2) stars (parallax by yaw)
    for (const s of this.stars) {
      let x = (s.x - cam.yaw * 240) % (W + 4); if (x < 0) x += W + 4;
      const y = (s.y * 0.25) % (H + 4);
      const a = (s.b * (0.6 + 0.4 * Math.sin(t * 1.4 + s.tw))) | 0;
      plotA(buf, W, H, x - 2, y - 2, px(a, a, Math.min(255, a + 20)), 255);
    }

    // 3) rotate all verts
    const cy = Math.cos(cam.yaw), sy2 = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp2 = Math.sin(cam.pitch);
    const V = sp.V, n = V.length;
    let RX = this._rx || (this._rx = new Float32Array(n));
    let RY = this._ry || (this._ry = new Float32Array(n));
    let RZ = this._rz || (this._rz = new Float32Array(n));
    if (RX.length < n) { RX = this._rx = new Float32Array(n); RY = this._ry = new Float32Array(n); RZ = this._rz = new Float32Array(n); }
    for (let i = 0; i < n; i++) {
      const v = V[i];
      const x1 = v[0] * cy + v[2] * sy2;
      const z1 = -v[0] * sy2 + v[2] * cy;
      const y1 = v[1] * cp - z1 * sp2;
      const z2 = v[1] * sp2 + z1 * cp;
      RX[i] = x1; RY[i] = y1; RZ[i] = z2;
    }

    // projection params
    const cx = W / 2, cyy = H / 2;
    const f = H * 0.92, dist = cam.dist;
    const R = CFG.RADIUS;

    // 4) sort faces far→near (painter) among camera-facing ones
    const F = sp.F, C = sp.C, NF = F.length;
    if (!this._order || this._order.length < NF) this._order = new Int32Array(NF);
    const order = this._order;
    let m = 0;
    const RC = this._rc || (this._rc = new Float32Array(NF * 3));
    for (let i = 0; i < NF; i++) {
      const c = C[i];
      const x1 = c[0] * cy + c[2] * sy2;
      const z1 = -c[0] * sy2 + c[2] * cy;
      const y1 = c[1] * cp - z1 * sp2;
      const z2 = c[1] * sp2 + z1 * cp;
      RC[i * 3] = x1; RC[i * 3 + 1] = y1; RC[i * 3 + 2] = z2;
      if (z2 > 0.02) order[m++] = i;
    }
    const keys = this._zk || (this._zk = new Float32Array(NF));
    for (let i = 0; i < m; i++) keys[i] = RC[order[i] * 3 + 2];
    // small insertion-ish sort via typed array argsort of visible subset
    const vis = Array.prototype.slice.call(order, 0, m);
    vis.sort((a, b) => RC[a * 3 + 2] - RC[b * 3 + 2]);

    // 5) draw faces
    const sd = sun;
    for (let vi = 0; vi < m; vi++) {
      const fi = vis[vi];
      const face = sp.faces[fi];
      const z2 = RC[fi * 3 + 2];
      // lighting: dot(center, sunDir)
      const lx = RC[fi * 3] * sd.x + RC[fi * 3 + 1] * sd.y + RC[fi * 3 + 2] * sd.z;
      const light = Math.max(0, lx);
      const night = lx < 0 ? Math.max(0, -lx) : 0;
      let col = BIOME[face.biome];
      // vegetation greening
      if (face.land && face.plants > 6) {
        const gAmt = Math.min(1, face.plants / (CFG.PLANT_MAX * 0.8));
        col = blend(col, px(46, 140, 70), (gAmt * 130) | 0);
      }
      if (face.scorch > 0.03) col = blend(col, px(24, 18, 16), Math.min(200, (face.scorch * 210) | 0));
      // day/night shade
      const sh = 0.21 + light * 0.79;
      const r = Math.min(255, ((col & 255) * sh) | 0);
      const g = Math.min(255, (((col >> 8) & 255) * sh) | 0);
      const b = Math.min(255, (((col >> 16) & 255) * (sh * 1.02)) | 0);
      const shaded = px(r, g, b);

      const [a, bI, cI] = F[fi];
      const za = RZ[a] * R, zb = RZ[bI] * R, zc = RZ[cI] * R;
      const da = dist - za, db = dist - zb, dc = dist - zc;
      if (da < 4 || db < 4 || dc < 4) continue;
      // RX/RY/RZ are unit-sphere coords; project p*R with focal f/R (world scale baked)
      _pts[0] = cx + (RX[a] * R) * f / da;
      _pts[1] = cyy - (RY[a] * R) * f / da;
      _pts[2] = cx + (RX[bI] * R) * f / db;
      _pts[3] = cyy - (RY[bI] * R) * f / db;
      _pts[4] = cx + (RX[cI] * R) * f / dc;
      _pts[5] = cyy - (RY[cI] * R) * f / dc;
      fillPoly(buf, W, H, _pts, 3, shaded);
    }

    // 6) atmosphere rim
    const rimR = R * f / dist;
    circA(buf, W, H, cx, cyy, rimR * 0.99, px(90, 140, 200), 26);
    softDisc(buf, W, H, cx | 0, cyy | 0, rimR | 0, px(40, 70, 120), 8);

    // 7) critters
    for (const c of life.critters) {
      const x1 = c.x * cy + c.z * sy2;
      const z1 = -c.x * sy2 + c.z * cy;
      const y1 = c.y * cp - z1 * sp2;
      const z2 = c.y * sp2 + z1 * cp;
      if (z2 < 0.05) continue;
      const pxr = c.x * R, pyr = c.y * R, pzr = z2 * R;
      const d = dist - pzr;
      if (d < 4) continue;
      const sx = cx + (x1 * R) * f / d;
      const sy = cyy - (y1 * R) * f / d;
      // day/night: critters glow at night
      const lit = x1 * sd.x + y1 * sd.y + z2 * sd.z;
      const col = this._col(c.hue);
      const sz = 1 + c.g.size * 1.8;
      if (lit < 0.05) softDisc(buf, W, H, sx | 0, sy | 0, sz * 2.2 | 0 || 2, col, 150);   // night glow
      else { disc(buf, W, H, sx | 0, sy | 0, sz | 0 || 1, col); }
    }

    // 8) fx (particles + rings on sphere shell)
    for (const q2 of fx.parts) {
      const x1 = q2.x * cy + q2.z * sy2, z1 = -q2.x * sy2 + q2.z * cy;
      const y1 = q2.y * cp - z1 * sp2, z2 = q2.y * sp2 + z1 * cp;
      if (z2 < 0.05) continue;
      const d = dist - z2 * R;
      if (d < 4) continue;
      const sx = cx + (x1 * R) * f / d, sy = cyy - (y1 * R) * f / d;
      plotA(buf, W, H, sx, sy, this._fxCol(q2.color), (q2.life / q2.maxLife * 220) | 0);
    }
    for (const r of fx.rings) {
      // approximate ring: small circle at projected center, radius ~ r arc × R
      const x1 = r.x * cy + r.z * sy2, z1 = -r.x * sy2 + r.z * cy;
      const y1 = r.y * cp - z1 * sp2, z2 = r.y * sp2 + z1 * cp;
      if (z2 < 0.05) continue;
      const d = dist - z2 * R;
      if (d < 4) continue;
      const sx = cx + (x1 * R) * f / d, sy = cyy - (y1 * R) * f / d;
      circA(buf, W, H, sx, sy, Math.max(2, r.r * R * f / d), this._fxCol(r.color), (r.life / r.maxLife * 160) | 0);
    }

    this.ctx.putImageData(this.img, 0, 0);
  }

  // css px click → unit direction toward sphere surface (null if missed)
  pickDir(cxCss, cyCss, cam) {
    const x0 = cxCss * this.q - this.w / 2, y0 = -(cyCss * this.q - this.h / 2);
    const f = this.h * 0.92, dist = cam.dist;
    // ray in view space: direction (x0, y0, f) from camera at (0,0,dist)
    // invert rotation: world dir = R^-1 · ray
    const l = Math.hypot(x0, y0, f);
    const dx = x0 / l, dy = y0 / l, dz = f / l;
    // camera looks along -z in rotated space; world-space dir:
    // apply inverse pitch then inverse yaw
    const cp = Math.cos(cam.pitch), sp2 = Math.sin(cam.pitch);
    const cy2 = Math.cos(cam.yaw), sy3 = Math.sin(cam.yaw);
    // view dir in rotated frame is (dx, dy, -dz)... solve intersection with |p|=1:
    // camera pos in rotated frame = (0,0,dist/R)? Use unit-sphere space: dist/R.
    const du = dist / CFG.RADIUS;
    // ray: P(t) = (0,0,du) + t*(dx,dy,-dz) in rotated unit space
    // |P|^2 = 1 → t^2 - 2 t du dz + du^2 - 1 = 0
    const B = -2 * du * dz, C = du * du - 1;
    const disc2 = B * B - 4 * C;
    if (disc2 < 0) return null;
    const t2 = (-B - Math.sqrt(disc2)) / 2;
    const hx = t2 * dx, hy = t2 * dy, hz = du - t2 * dz;
    // unrotate (inverse of yaw*pitch applied in frame())
    // frame did: yaw around Y then pitch around X. Inverse: pitch^-1 then yaw^-1.
    const y1 = hy * cp + hz * sp2;
    const z1 = -hy * sp2 + hz * cp;
    const x2 = hx * cy2 - z1 * sy3;
    const z2 = hx * sy3 + z1 * cy2;
    return [x2, y1, z2];
  }

  _col(hue) {
    const hi = hue | 0;
    let c = this._strainCol.get(hi);
    if (!c) { c = hslPx(hue, 0.6, 0.62); this._strainCol.set(hi, c); }
    return c;
  }
  _fxCol(str) {
    let c = this._strainCol.get(str);
    if (!c) {
      let m = /(\d+)[^\d]+(\d+)%[^\d]+(\d+)%/.exec(str);
      if (m) c = hslPx(+m[1], +m[2] / 100, +m[3] / 100);
      else if (str[0] === '#') c = px(parseInt(str.slice(1, 3), 16), parseInt(str.slice(3, 5), 16), parseInt(str.slice(5, 7), 16));
      else if ((m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(str))) c = px(+m[1], +m[2], +m[3]);
      else c = px(220, 215, 235);
      this._strainCol.set(str, c);
    }
    return c;
  }
}
