// render.js — software framebuffer: dark steel plate, ivory sand, amplitude LUT.
const FADE = 13;
const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 0.5;
    this.resize();
    addEventListener('resize', () => this.resize());
    // amplitude → color LUT: settled = bright bone; trembling = dim slate; hot = amber
    this.lut = new Uint32Array(33);
    for (let i = 0; i < 33; i++) {
      const a = i / 32;
      let r, g, b;
      if (a < 0.25) {           // settled → bone
        const t = a / 0.25;
        r = 232 - (232 - 150) * t; g = 220 - (220 - 138) * t; b = 192 - (192 - 110) * t;
      } else {                  // trembling → slate; very hot → amber lick
        const t = Math.min(1, (a - 0.25) / 0.75);
        r = 150 - 100 * t; g = 138 - 80 * t; b = 110 - 40 * t;
        if (a > 0.8) { const u = (a - 0.8) / 0.2; r += (255 - r) * u * 0.7; g += (179 - g) * u * 0.5; }
      }
      this.lut[i] = pack(r | 0, g | 0, b | 0);
    }
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.W = Math.max(480, Math.round(w * this.scale));
    this.H = Math.max(270, Math.round(h * this.scale));
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.img = this.ctx.createImageData(this.W, this.H);
    this.px = new Uint32Array(this.img.data.buffer);
    // plate rect (centered square)
    const S = Math.min(this.W, this.H) * 0.86;
    this.px0 = (this.W - S) / 2; this.py0 = (this.H - S) / 2; this.S = S;
    this.buildBg();
    this.ghost = null; // rebuilt on mode change
  }
  buildBg() {
    const { W, H } = this;
    this.bg = new Uint32Array(W * H);
    for (let y = 0; y < H; y++) {
      const t = y / H;
      const c = pack(3 + 4 * t | 0, 5 + 5 * t | 0, 9 + 7 * t | 0);
      for (let x = 0; x < W; x++) this.bg[y * W + x] = c;
    }
    // steel plate: slightly raised tone + border
    const x0 = Math.round(this.px0), y0 = Math.round(this.py0), S = Math.round(this.S);
    const steel = pack(10, 14, 20), steel2 = pack(12, 17, 24);
    for (let y = y0; y < y0 + S; y++) {
      if (y < 0 || y >= H) continue;
      for (let x = Math.max(0, x0); x < Math.min(W, x0 + S); x++) {
        this.bg[y * W + x] = ((x + y) & 3) === 0 ? steel2 : steel;
      }
    }
    const edge = pack(70, 96, 110);
    for (let k = 0; k < S; k++) {
      const xs = x0 + k;
      if (xs >= 0 && xs < W) {
        if (y0 >= 0) this.bg[y0 * W + xs] = edge;
        if (y0 + S - 1 < H) this.bg[(y0 + S - 1) * W + xs] = edge;
      }
      const ys = y0 + k;
      if (ys >= 0 && ys < H) {
        if (x0 >= 0) this.bg[ys * W + x0] = edge;
        if (x0 + S - 1 < W) this.bg[ys * W + x0 + S - 1] = edge;
      }
    }
  }
  buildGhost(field) {
    // dim teal amplitude map of the plate; computed once per mode
    const { W, S } = this;
    const g = new Uint32Array(W * this.H);
    const x0 = Math.round(this.px0), y0 = Math.round(this.py0), s = Math.round(S);
    for (let yy = 0; yy < s; yy++) {
      const py = y0 + yy;
      if (py < 0 || py >= this.H) continue;
      const v = yy / s;
      for (let xx = 0; xx < s; xx++) {
        const pxx = x0 + xx;
        if (pxx < 0 || pxx >= W) continue;
        const a = Math.min(1, field.at(xx / s, v));
        g[py * W + pxx] = pack(10 + a * 8 | 0, 30 + a * 70 | 0, 34 + a * 80 | 0);
      }
    }
    this.ghost = g;
  }
  frame(field, grains, showGhost, t) {
    const { px, bg, W, H, lut } = this;
    if (showGhost && this.ghost) {
      const g = this.ghost;
      for (let i = 0; i < px.length; i++) {
        const c = px[i], s = g[i];
        const r = (s & 255) + ((((c & 255) - (s & 255)) * (256 - FADE)) >> 8);
        const gg = ((s >> 8) & 255) + (((((c >> 8) & 255) - ((s >> 8) & 255)) * (256 - FADE)) >> 8);
        const b = ((s >> 16) & 255) + (((((c >> 16) & 255) - ((s >> 16) & 255)) * (256 - FADE)) >> 8);
        px[i] = (0xff000000 | (b << 16) | (gg << 8) | r) >>> 0;
      }
    } else {
      for (let i = 0; i < px.length; i++) {
        const c = px[i], s = bg[i];
        const r = (s & 255) + ((((c & 255) - (s & 255)) * (256 - FADE)) >> 8);
        const g2 = ((s >> 8) & 255) + (((((c >> 8) & 255) - ((s >> 8) & 255)) * (256 - FADE)) >> 8);
        const b = ((s >> 16) & 255) + (((((c >> 16) & 255) - ((s >> 16) & 255)) * (256 - FADE)) >> 8);
        px[i] = (0xff000000 | (b << 16) | (g2 << 8) | r) >>> 0;
      }
    }
    // sand
    const { px0, py0, S } = this;
    const n = grains.n, gx = grains.x, gy = grains.y, ga = grains.a;
    for (let i = 0; i < n; i++) {
      const bx = (px0 + gx[i] * S) | 0, by = (py0 + gy[i] * S) | 0;
      if (bx < 0 || by < 0 || bx >= W || by >= H) continue;
      const li = (ga[i] * 32) | 0;
      const c = lut[li > 32 ? 32 : li];
      px[by * W + bx] = c;
      if (li < 8) {   // settled grains get a 2px stamp — the figure is drawn by the still
        if (bx + 1 < W) px[by * W + bx + 1] = c;
        if (by + 1 < H) { px[(by + 1) * W + bx] = c; if (bx + 1 < W) px[(by + 1) * W + bx + 1] = c; }
      }
    }
    // press ring
    if (field.press) {
      const pr = field.press;
      const cx = px0 + pr.x * S, cy = py0 + pr.y * S, rr = pr.r * S * (0.9 + 0.1 * Math.sin(t * 9));
      const col = pack(255, 200, 130);
      for (let k = 0; k < 64; k++) {
        const ang = k / 64 * Math.PI * 2;
        const bx = (cx + Math.cos(ang) * rr) | 0, by = (cy + Math.sin(ang) * rr) | 0;
        if (bx >= 0 && by >= 0 && bx < W && by < H) px[by * W + bx] = col;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
