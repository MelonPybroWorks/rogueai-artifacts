// render.js — plate layer (settled foam, written once) + live rims for the growing.
const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
export const GRID_W = 640, GRID_H = 360;
const HUES = [
  [53, 240, 200], [94, 200, 232], [159, 216, 176],
  [255, 217, 160], [192, 144, 255], [255, 154, 128],
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = GRID_W; this.H = GRID_H;
    canvas.width = this.W; canvas.height = this.H;
    this.img = this.ctx.createImageData(this.W, this.H);
    this.px = new Uint32Array(this.img.data.buffer);
    this.plate = new Uint32Array(this.W * this.H);
    this.buildBg();
    this.plate.set(this.bg);
  }
  buildBg() {
    const { W, H } = this;
    this.bg = new Uint32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dith = ((x * 7 + y * 13) & 15) < 5 ? 3 : 0;
      this.bg[y * W + x] = pack(6 + dith, 10 + dith, 12 + dith);
    }
  }
  disc(plate, cx, cy, r, col) {
    const { W, H } = this;
    const r2 = r * r;
    for (let y = Math.max(0, cy - r | 0); y <= Math.min(H - 1, cy + r | 0); y++) {
      for (let x = Math.max(0, cx - r | 0); x <= Math.min(W - 1, cx + r | 0); x++) {
        const dx = x - cx, dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) plate[y * W + x] = col;
      }
    }
  }
  settleCircle(c) {
    const [r, g, b] = HUES[c.hue % 6];
    // matte fill, slightly darker toward the middle (meniscus)
    const fill = pack(r * 0.42 | 0, g * 0.42 | 0, b * 0.42 | 0);
    const rimC = pack(Math.min(255, r * 0.9 + 30) | 0, Math.min(255, g * 0.9 + 30) | 0, Math.min(255, b * 0.9 + 30) | 0);
    this.disc(this.plate, c.x | 0, c.y | 0, c.r | 0, fill);
    // rim ring
    const { W, H } = this;
    const steps = Math.max(12, (c.r * 6) | 0);
    for (let k = 0; k < steps; k++) {
      const a = k / steps * Math.PI * 2;
      const x = (c.x + Math.cos(a) * (c.r - 0.5)) | 0, y = (c.y + Math.sin(a) * (c.r - 0.5)) | 0;
      if (x >= 0 && y >= 0 && x < W && y < H) this.plate[y * W + x] = rimC;
    }
  }
  eraseCircle(c) {
    // restore water where the circle stood
    const { W, H } = this;
    const r = c.r + 1;
    for (let y = Math.max(0, c.y - r | 0); y <= Math.min(H - 1, c.y + r | 0); y++) {
      for (let x = Math.max(0, c.x - r | 0); x <= Math.min(W - 1, c.x + r | 0); x++) {
        const dx = x - c.x, dy = y - c.y;
        if (dx * dx + dy * dy <= r * r) this.plate[y * W + x] = this.bg[y * W + x];
      }
    }
  }
  frame(foam, t) {
    this.px.set(this.plate);
    // growing rims pulse
    const { px, W, H } = this;
    for (const c of foam.circles) {
      if (!c.growing) continue;
      const [r, g, b] = HUES[c.hue % 6];
      const pulse = 0.75 + 0.25 * Math.sin(t * 3 + c.born);
      const col = pack(Math.min(255, r * pulse + 40) | 0, Math.min(255, g * pulse + 40) | 0, Math.min(255, b * pulse + 40) | 0);
      const steps = Math.max(10, (c.r * 5) | 0);
      for (let k = 0; k < steps; k++) {
        const a = k / steps * Math.PI * 2;
        const x = (c.x + Math.cos(a) * c.r) | 0, y = (c.y + Math.sin(a) * c.r) | 0;
        if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = col;
      }
      // bright seed core
      const cx = c.x | 0, cy = c.y | 0;
      if (cx >= 0 && cy >= 0 && cx < W && cy < H) px[cy * W + cx] = col;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
