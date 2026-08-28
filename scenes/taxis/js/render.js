// render.js — fade-to-night framebuffer: lamp glow, vehicle trails are free.
const FADE = 9;   // long phosphor — the paths are the picture
const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
export const TYPE_COLORS = [
  [53, 240, 200],    // fear — teal
  [255, 85, 64],     // hunger — ember red
  [124, 252, 154],   // love — mint
  [192, 144, 255],   // wanderlust — violet
];
const LAMP_HUES = [[255, 190, 90], [140, 200, 255], [255, 140, 160], [190, 255, 160]];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 0.5;
    // precomputed additive glow sprite
    const GS = 26;
    this.glow = new Float32Array(GS * GS * 4);
    this.GS = GS;
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
    this.buildBg();
  }
  buildBg() {
    const { W, H } = this;
    this.bg = new Uint32Array(W * H);
    for (let y = 0; y < H; y++) {
      const t = y / H;
      for (let x = 0; x < W; x++) {
        const dith = ((x * 7 + y * 13) & 15) < 5 ? 2 : 0;
        this.bg[y * W + x] = pack(6 + 3 * t + dith | 0, 5 + 3 * t + dith | 0, 9 + 4 * t | 0);
      }
    }
  }
  addGlow(cx, cy, r, g, b) {
    const { W, H, px } = this;
    const R = 11;
    for (let dy = -R; dy <= R; dy++) {
      const Y = (cy | 0) + dy;
      if (Y < 0 || Y >= H) continue;
      for (let dx = -R; dx <= R; dx++) {
        const X = (cx | 0) + dx;
        if (X < 0 || X >= W) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > R * R) continue;
        const f = Math.exp(-d2 / (R * R * 0.09));
        const i = Y * W + X, c = px[i];
        const nr = Math.min(255, (c & 255) + r * f);
        const ng = Math.min(255, ((c >> 8) & 255) + g * f);
        const nb = Math.min(255, ((c >> 16) & 255) + b * f);
        px[i] = pack(nr | 0, ng | 0, nb | 0);
      }
    }
  }
  frame(lamps, vehicles, t) {
    const { px, bg, W, H } = this;
    for (let i = 0; i < px.length; i++) {
      const c = px[i], s = bg[i];
      const r = (s & 255) + ((((c & 255) - (s & 255)) * (256 - FADE)) >> 8);
      const g = ((s >> 8) & 255) + (((((c >> 8) & 255) - ((s >> 8) & 255)) * (256 - FADE)) >> 8);
      const b = ((s >> 16) & 255) + (((((c >> 16) & 255) - ((s >> 16) & 255)) * (256 - FADE)) >> 8);
      px[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
    // lamps
    for (let i = 0; i < lamps.list.length; i++) {
      const l = lamps.list[i];
      const [r, g, b] = LAMP_HUES[l.hue % LAMP_HUES.length];
      const pulse = 1 + 0.1 * Math.sin(t * 2 + i * 1.7);
      this.addGlow(l.x, l.y, r * 0.20 * pulse, g * 0.20 * pulse, b * 0.20 * pulse);
      // hot core
      const cx = l.x | 0, cy = l.y | 0;
      if (cx >= 1 && cy >= 1 && cx < W - 1 && cy < H - 1) {
        px[cy * W + cx] = 0xffffffff;
        px[cy * W + cx + 1] = 0xffffffff; px[cy * W + cx - 1] = 0xffffffff;
        px[(cy + 1) * W + cx] = 0xffffffff; px[(cy - 1) * W + cx] = 0xffffffff;
      }
    }
    // vehicles: heading tick + body dot in wiring color (trails accumulate via fade)
    for (const v of vehicles) {
      const [r, g, b] = TYPE_COLORS[v.wiring];
      const col = pack(r, g, b);
      const bx = v.x | 0, by = v.y | 0;
      if (bx < 1 || by < 1 || bx >= W - 1 || by >= H - 1) continue;
      px[by * W + bx] = col;
      px[by * W + bx + 1] = col; px[by * W + bx - 1] = col;   // 3px body reads at stream scale
      px[(by + 1) * W + bx] = col; px[(by - 1) * W + bx] = col;
      const hx = (v.x + Math.cos(v.a) * 3) | 0, hy = (v.y + Math.sin(v.a) * 3) | 0;
      if (hx >= 0 && hy >= 0 && hx < W && hy < H) px[hy * W + hx] = 0xffe8f0ff;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
