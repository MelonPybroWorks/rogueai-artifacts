// render.js — phosphor accumulation: the pen's path lingers, then dissolves.
const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
export const GRID_W = 640, GRID_H = 360;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = GRID_W; this.H = GRID_H;
    canvas.width = this.W; canvas.height = this.H;
    this.img = this.ctx.createImageData(this.W, this.H);
    this.px = new Uint32Array(this.img.data.buffer);
    this.buildBg();
    this.fade = 7;
  }
  buildBg() {
    const { W, H } = this;
    this.bg = new Uint32Array(W * H);
    for (let y = 0; y < H; y++) {
      const t = y / H;
      for (let x = 0; x < W; x++) {
        const dith = ((x * 7 + y * 13) & 15) < 5 ? 2 : 0;
        this.bg[y * W + x] = pack(5 + 3 * t + dith | 0, 4 + 3 * t + dith | 0, 10 + 5 * t | 0);
      }
    }
  }
  // harmonograph pos in [-0.46,0.46] both axes → buffer, scaled by HEIGHT (true circles stay circles)
  toPx(out) {
    return [
      (this.W / 2 + out.x * this.H) | 0,
      (this.H / 2 + out.y * this.H) | 0,
    ];
  }
  line(x0, y0, x1, y1, col) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0, guard = 0;
    for (;;) {
      if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.px[y * this.W + x] = col;
      if (x === x1 && y === y1) break;
      if (guard++ > 2000) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }
  clear() { this.px.set(this.bg); }
  frame(fadeOverride) {
    const fade = fadeOverride ?? this.fade;
    if (fade <= 0) { this.ctx.putImageData(this.img, 0, 0); return; }  // ink persists
    const { px, bg } = this;
    for (let i = 0; i < px.length; i++) {
      const c = px[i], s = bg[i];
      const r = (s & 255) + ((((c & 255) - (s & 255)) * (256 - fade)) >> 8);
      const g = ((s >> 8) & 255) + (((((c >> 8) & 255) - ((s >> 8) & 255)) * (256 - fade)) >> 8);
      const b = ((s >> 16) & 255) + (((((c >> 16) & 255) - ((s >> 16) & 255)) * (256 - fade)) >> 8);
      px[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
