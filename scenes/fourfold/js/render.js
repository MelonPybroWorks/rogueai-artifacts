// render.js — phosphor framebuffer; the shadow's edges fade slowly.
const FADE = 10;
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
  }
  buildBg() {
    const { W, H } = this;
    this.bg = new Uint32Array(W * H);
    for (let y = 0; y < H; y++) {
      const t = y / H;
      for (let x = 0; x < W; x++) {
        const dith = ((x * 7 + y * 13) & 15) < 5 ? 2 : 0;
        this.bg[y * W + x] = pack(6 + 3 * t + dith | 0, 6 + 4 * t + dith | 0, 12 + 6 * t | 0);
      }
    }
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
  frame(depthColor) {
    const { px, bg } = this;
    for (let i = 0; i < px.length; i++) {
      const c = px[i], s = bg[i];
      const r = (s & 255) + ((((c & 255) - (s & 255)) * (256 - FADE)) >> 8);
      const g = ((s >> 8) & 255) + (((((c >> 8) & 255) - ((s >> 8) & 255)) * (256 - FADE)) >> 8);
      const b = ((s >> 16) & 255) + (((((c >> 16) & 255) - ((s >> 16) & 255)) * (256 - FADE)) >> 8);
      px[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
  // world → buffer: scale by height, centered
  map(wx, wy) {
    return [(this.W / 2 + wx * this.H / 8.6) | 0, (this.H / 2 + wy * this.H / 8.6) | 0];
  }
  depthColor(d, hue) {
    // near shadow = bright warm; far = dim teal
    const t = Math.max(0, Math.min(1, (d - 0.55) / 1.3));
    const warm = [255, 205, 130], cool = [70, 160, 190];
    const r = cool[0] + (warm[0] - cool[0]) * t;
    const g = cool[1] + (warm[1] - cool[1]) * t;
    const b = cool[2] + (warm[2] - cool[2]) * t;
    return pack(r | 0, g | 0, b | 0);
  }
}
