// render.js — software framebuffer: fade-to-sky trails, heightfield, soft bodies.
// The visible canvas backing store IS the buffer (~0.55 css scale); CSS upscales it.
const TAU = Math.PI * 2;
const FADE = 24;                       // per-frame forget amount (0..255)

function hsv(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [(r + m) * 255 | 0, (g + m) * 255 | 0, (b + m) * 255 | 0];
}
const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
const COOL = [47, 216, 200], WARM = [255, 179, 71];
const lerpRGB = (a, b, t) => pack(a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0);

const boneCache = new Map();
function boneColor(hue, ghost) {
  const key = hue + (ghost ? 1000 : 0);
  let c = boneCache.get(key);
  if (c === undefined) {
    const [r, g, b] = hsv(hue, ghost ? 0.2 : 0.55, ghost ? 0.72 : 0.62);
    c = pack(r, g, b);
    boneCache.set(key, c);
  }
  return c;
}
function nodeColor(hue, ghost) {
  const [r, g, b] = hsv(hue, ghost ? 0.15 : 0.5, ghost ? 0.85 : 0.8);
  return pack(r, g, b);
}

const DIGIT = {
  '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7], '3': [7, 1, 7, 1, 7],
  '4': [5, 5, 7, 1, 1], '5': [7, 4, 7, 1, 7], '6': [7, 4, 7, 5, 7], '7': [7, 1, 1, 2, 2],
  '8': [7, 5, 7, 5, 7], '9': [7, 5, 7, 1, 7], 'm': [0, 5, 7, 5, 5],
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 0.5;
    this.cam = { x: -80, y: -30, zoom: 1.3 };
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.W = Math.max(480, Math.round(w * this.scale));
    this.H = Math.max(270, Math.round(h * this.scale));
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.img = this.ctx.createImageData(this.W, this.H);
    this.px = new Uint32Array(this.img.data.buffer);
    this.sky = new Uint32Array(this.W * this.H);
    this.buildSky();
  }
  buildSky() {
    const { W, H, sky } = this;
    for (let y = 0; y < H; y++) {
      const t = y / H;
      let r, g, b;
      if (t < 0.82) { const u = t / 0.82; r = 4 + 6 * u; g = 6 + 12 * u; b = 14 + 22 * u; }
      else { const u = (t - 0.82) / 0.18; r = 10 + 14 * u; g = 18 + 16 * u; b = 36 + 20 * u; }
      const c = pack(r | 0, g | 0, b | 0);
      for (let x = 0; x < W; x++) sky[y * W + x] = c;
    }
    const mx = (W * 0.78) | 0, my = (H * 0.20) | 0, mr = Math.max(10, (H * 0.045) | 0);
    for (let y = -mr * 3; y <= mr * 3; y++) for (let x = -mr * 3; x <= mr * 3; x++) {
      const d = Math.sqrt(x * x + y * y);
      const sx = mx + x, sy = my + y;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const i = sy * W + sx;
      if (d <= mr) sky[i] = pack(224, 234, 248);
      else if (d <= mr * 3) {
        const a = (1 - (d - mr) / (mr * 2)) * 0.25, s = sky[i];
        const sr = s & 255, sg = (s >> 8) & 255, sb = (s >> 16) & 255;
        sky[i] = pack(sr + (224 - sr) * a | 0, sg + (234 - sg) * a | 0, sb + (248 - sb) * a | 0);
      }
    }
    this.stars = [];
    let s0 = 1234567;
    const rnd = () => { s0 = (Math.imul(s0, 1103515245) + 12345) & 0x7fffffff; return s0 / 0x7fffffff; };
    for (let i = 0; i < 170; i++) {
      this.stars.push({ x: rnd() * W, y: rnd() * H * 0.68, ph: rnd() * TAU, sp: 0.3 + rnd() * 1.2, br: 60 + rnd() * 120 });
    }
  }
  toWorld(cx, cy) {
    const rect = this.canvas.getBoundingClientRect();
    const bx = (cx - rect.left) * (this.W / rect.width);
    const by = (cy - rect.top) * (this.H / rect.height);
    const cam = this.cam;
    return { x: cam.x + (bx - this.W * 0.35) / cam.zoom, y: cam.y + (by - this.H * 0.62) / cam.zoom };
  }
  stamp(x, y, col, th, blend) {
    const { W, H, px } = this;
    for (let j = 0; j < th; j++) for (let i = 0; i < th; i++) {
      const X = x + i, Y = y + j;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const idx = Y * W + X;
      if (!blend) { px[idx] = col; continue; }
      const c = px[idx];
      const r = (c & 255) + (((col & 255) - (c & 255)) * blend | 0);
      const g = ((c >> 8) & 255) + ((((col >> 8) & 255) - ((c >> 8) & 255)) * blend | 0);
      const b = ((c >> 16) & 255) + ((((col >> 16) & 255) - ((c >> 16) & 255)) * blend | 0);
      px[idx] = pack(r > 255 ? 255 : r, g > 255 ? 255 : g, b > 255 ? 255 : b);
    }
  }
  line(x0, y0, x1, y1, col, th, blend) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0, guard = 0;
    for (;;) {
      this.stamp(x, y, col, th, blend);
      if (x === x1 && y === y1) break;
      if (guard++ > 2000) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }
  text3x5(str, x, y, col) {
    for (const ch of str) {
      const rows = DIGIT[ch];
      if (rows) {
        for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
          if ((rows[r] >> (2 - c)) & 1) this.stamp(x + c, y + r, col, 1, 0);
        }
      }
      x += 4;
    }
  }
  drawCreature(c, t, ghost) {
    const { cam, W, H } = this, z = cam.zoom, ox = W * 0.35, oy = H * 0.62;
    const bone = boneColor(c.genome.hue, ghost);
    const node = nodeColor(c.genome.hue, ghost);
    const blend = ghost ? 0.42 : 0;
    let headI = 0, headY = Infinity;
    for (let i = 0; i < c.pts.length; i++) if (c.pts[i].y < headY) { headY = c.pts[i].y; headI = i; }
    for (const e of c.edges) {
      const p1 = c.pts[e.a], p2 = c.pts[e.b];
      const x0 = (p1.x - cam.x) * z + ox, y0 = (p1.y - cam.y) * z + oy;
      const x1 = (p2.x - cam.x) * z + ox, y1 = (p2.y - cam.y) * z + oy;
      let col = bone;
      if (e.mu) {
        const s = Math.sin(e.ph + TAU * e.fr * t);
        col = lerpRGB(COOL, WARM, (s + 1) / 2);
      }
      this.line(x0, y0, x1, y1, col, e.mu ? 3 : 2, blend);
    }
    for (let i = 0; i < c.pts.length; i++) {
      const p = c.pts[i];
      const bx = ((p.x - cam.x) * z + ox) | 0, by = ((p.y - cam.y) * z + oy) | 0;
      this.stamp(bx, by, i === headI ? 0xffffffff : node, 3, blend);
    }
  }
  frame(world, pop, t) {
    const { px, sky, W, H, cam } = this;
    for (let i = 0; i < px.length; i++) {
      const c = px[i], s = sky[i];
      const r = (s & 255) + ((((c & 255) - (s & 255)) * (256 - FADE)) >> 8);
      const g = ((s >> 8) & 255) + (((((c >> 8) & 255) - ((s >> 8) & 255)) * (256 - FADE)) >> 8);
      const b = ((s >> 16) & 255) + (((((c >> 16) & 255) - ((s >> 16) & 255)) * (256 - FADE)) >> 8);
      px[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
    for (const st of this.stars) {
      const tw = st.br * (0.55 + 0.45 * Math.sin(st.ph + t * st.sp)) | 0;
      let sx = (st.x - cam.x * 0.06) % W; if (sx < 0) sx += W;
      const sy = st.y | 0; sx |= 0;
      const i = sy * W + sx, c = px[i];
      const r = Math.min(255, (c & 255) + (tw >> 1));
      const g = Math.min(255, ((c >> 8) & 255) + (tw * 5 >> 3));
      const b = Math.min(255, ((c >> 16) & 255) + tw);
      px[i] = pack(r, g, b);
    }
    const z = cam.zoom, ox = W * 0.35, oy = H * 0.62;
    const EDGE = pack(124, 252, 154), EDGE2 = pack(52, 120, 72);
    const C1 = pack(22, 44, 30), C2 = pack(14, 28, 20), C3 = pack(8, 16, 12), C4 = pack(5, 10, 8);
    const C1d = pack(19, 39, 26), C2d = pack(11, 23, 16), C3d = pack(6, 12, 9);
    for (let bx = 0; bx < W; bx++) {
      const wx = cam.x + (bx - ox) / z;
      const gy = ((world.groundY(wx) - cam.y) * z + oy) | 0;
      if (gy >= 0 && gy < H) px[gy * W + bx] = EDGE;
      if (gy + 1 >= 0 && gy + 1 < H) px[(gy + 1) * W + bx] = EDGE2;
      for (let by = Math.max(0, gy + 2); by < H; by++) {
        const depth = by - gy;
        const dith = ((bx * 7 + by * 13) & 15) < 4;
        let col;
        if (depth <= 6) col = dith ? C1d : C1;
        else if (depth <= 22) col = dith ? C2d : C2;
        else if (depth <= 60) col = dith ? C3d : C3;
        else col = C4;
        px[by * W + bx] = col;
      }
    }
    const wStart = Math.max(0, Math.ceil((cam.x - ox / z) / 250) * 250);
    const wEnd = cam.x + (W - ox) / z;
    const cMark = pack(70, 130, 95), cTxt = pack(60, 120, 88);
    for (let mx = wStart; mx <= wEnd; mx += 250) {
      const bx = ((mx - cam.x) * z + ox) | 0;
      if (bx < 2 || bx >= W - 2) continue;
      const gy = ((world.groundY(mx) - cam.y) * z + oy) | 0;
      const m = Math.round(mx / 50);
      const tall = (m % 20 === 0);
      const len = m === 0 ? 26 : (tall ? 14 : 8);
      for (let k = 0; k < len; k++) {
        const y = gy - 2 - k;
        if (y >= 0 && y < H && (tall || (k & 1) === 0)) px[y * W + bx] = cMark;
      }
      this.text3x5(String(m) + 'm', bx + 3, gy - 12, cTxt);
    }
    if (pop.champion) this.drawCreature(pop.champion, t, true);
    for (const c of pop.creatures) this.drawCreature(c, t, false);
    const lead = pop.leader();
    if (lead) {
      const bx = ((lead.cx - cam.x) * z + ox) | 0, by = ((lead.cy - cam.y) * z + oy - 34) | 0;
      const crown = pack(255, 220, 120);
      this.stamp(bx, by, crown, 1, 0); this.stamp(bx - 1, by - 1, crown, 1, 0); this.stamp(bx + 1, by - 1, crown, 1, 0);
      this.stamp(bx - 2, by - 2, crown, 1, 0); this.stamp(bx + 2, by - 2, crown, 1, 0);
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
