// render.js — the midden field IS the framebuffer: pebbles by kind, piles glow as they warm.
const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
export const GRID_W = 400, GRID_H = 240;
export const KIND_COLORS = [
  null,
  [216, 207, 187],   // bone
  [255, 154, 60],    // ember
  [53, 240, 200],    // verdigris
  [192, 144, 255],   // violet
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = GRID_W; this.H = GRID_H;
    canvas.width = this.W; canvas.height = this.H;
    this.img = this.ctx.createImageData(this.W, this.H);
    this.px = new Uint32Array(this.img.data.buffer);
    this.soil = new Uint32Array(this.W * this.H);
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      const dith = ((x * 7 + y * 13) & 15) < 5 ? 3 : 0;
      this.soil[y * this.W + x] = pack(9 + dith, 11 + dith, 8 + dith);
    }
    this.antCol = pack(120, 118, 105);
  }
  frame(midden) {
    const { px, soil, W, H } = this;
    const { cell } = midden;
    for (let i = 0; i < px.length; i++) {
      const c = cell[i];
      if (!c) { px[i] = soil[i]; continue; }
      // pile warmth: brighter where kin surround
      const x = i % W, y = (i / W) | 0;
      const d = midden.sameAround(x, y, c);
      const [r, g, b] = KIND_COLORS[c];
      const warm = Math.min(1, d / 9);
      px[i] = pack(
        Math.min(255, r * (0.66 + 0.5 * warm)) | 0,
        Math.min(255, g * (0.66 + 0.5 * warm)) | 0,
        Math.min(255, b * (0.66 + 0.5 * warm)) | 0);
    }
    // undertakers: dim when empty-handed, carrying-kind color when laden
    for (const a of midden.ants) {
      const x = a.x | 0, y = a.y | 0;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      if (a.carry) {
        const [r, g, b] = KIND_COLORS[a.carry];
        const col = pack(Math.min(255, r + 40), Math.min(255, g + 40), Math.min(255, b + 40));
        px[y * W + x] = col;
        px[y * W + x + 1] = col; px[y * W + x - 1] = col;
        px[(y + 1) * W + x] = col; px[(y - 1) * W + x] = col;
      } else {
        px[y * W + x] = this.antCol;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
