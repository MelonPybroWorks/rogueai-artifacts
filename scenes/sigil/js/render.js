// render.js — density log-ramp: the fractal sharpens as the tracer keeps playing.
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
    // density ramp: night → deep teal → phosphor green → amber → white
    this.pal = new Uint32Array(32);
    for (let i = 0; i < 32; i++) {
      const t = i / 31;
      let r, g, b;
      if (t < 0.35) { const u = t / 0.35; r = 5 + 8 * u; g = 12 + 60 * u; b = 22 + 90 * u; }
      else if (t < 0.7) { const u = (t - 0.35) / 0.35; r = 13 + 40 * u; g = 72 + 130 * u; b = 112 + 60 * u; }
      else if (t < 0.92) { const u = (t - 0.7) / 0.22; r = 53 + 190 * u; g = 202 + 40 * u; b = 172 - 60 * u; }
      else { const u = (t - 0.92) / 0.08; r = 243 + 12 * u; g = 242 + 13 * u; b = 235 + 20 * u; }
      this.pal[i] = pack(r | 0, g | 0, b | 0);
    }
    this.ringCol = pack(255, 220, 150);
  }
  frame(sigil, anchorsLive) {
    const { px, pal, W, H } = this;
    const d = sigil.dens;
    for (let i = 0; i < px.length; i++) {
      const v = d[i];
      px[i] = v < 0.5 ? pack(4, 7, 12) : pal[Math.min(31, Math.log(v + 1) * 2.35) | 0];
    }
    // anchor rings
    if (anchorsLive) {
      for (const a of sigil.anchors) {
        const cx = a.x | 0, cy = a.y | 0;
        for (let k = 0; k < 20; k++) {
          const ang = k / 20 * Math.PI * 2;
          const x = (cx + Math.cos(ang) * 6) | 0, y = (cy + Math.sin(ang) * 6) | 0;
          if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = this.ringCol;
        }
        if (cx >= 0 && cy >= 0 && cx < W && cy < H) px[cy * W + cx] = this.ringCol;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
