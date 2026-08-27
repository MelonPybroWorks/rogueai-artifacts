// px.js — software framebuffer helpers (Uint32 RGBA, little-endian: 0xAABBGGRR)
export function px(r, g, b) { return 0xff000000 | (b << 16) | (g << 8) | r; }

// dst += (src - dst) * a  (a in 0..255)
export function blend(dst, src, a) {
  const dr = dst & 255, dg = (dst >> 8) & 255, db = (dst >> 16) & 255;
  const r = dr + (((src & 255) - dr) * a >> 8);
  const g = dg + (((((src >> 8) & 255) - dg) * a) >> 8);
  const b = db + (((((src >> 16) & 255) - db) * a) >> 8);
  return 0xff000000 | (b << 16) | (g << 8) | r;
}

export function plot(buf, W, H, x, y, c) {
  if (x >= 0 && x < W && y >= 0 && y < H) buf[(y | 0) * W + (x | 0)] = c;
}
export function plotA(buf, W, H, x, y, c, a) {
  if (x >= 0 && x < W && y >= 0 && y < H) { const i = (y | 0) * W + (x | 0); buf[i] = blend(buf[i], c, a); }
}

// additive-ish soft disc (glow), alpha peaks at center
export function softDisc(buf, W, H, cx, cy, r, c, aMax) {
  const x0 = Math.max(0, cx - r | 0), x1 = Math.min(W - 1, cx + r | 0);
  const y0 = Math.max(0, cy - r | 0), y1 = Math.min(H - 1, cy + r | 0);
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy, dy2 = dy * dy;
    if (dy2 > r2) continue;
    const row = y * W;
    const dxmax = Math.sqrt(r2 - dy2);
    const xa = Math.max(x0, cx - dxmax | 0), xb = Math.min(x1, cx + dxmax | 0);
    for (let x = xa; x <= xb; x++) {
      const d2 = (x - cx) * (x - cx) + dy2;
      const a = (aMax * (1 - d2 / r2)) | 0;
      if (a > 0) { const i = row + x; buf[i] = blend(buf[i], c, a); }
    }
  }
}

// filled disc, hard edge
export function disc(buf, W, H, cx, cy, r, c) {
  const x0 = Math.max(0, cx - r | 0), x1 = Math.min(W - 1, cx + r | 0);
  const y0 = Math.max(0, cy - r | 0), y1 = Math.min(H - 1, cy + r | 0);
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy, dy2 = dy * dy;
    if (dy2 > r2) continue;
    const dxmax = Math.sqrt(r2 - dy2) | 0;
    const row = y * W;
    for (let x = Math.max(x0, cx - dxmax | 0); x <= Math.min(x1, cx + dxmax | 0); x++) buf[row + x] = c;
  }
}

// scanline polygon fill. pts = flat float array [x0,y0,x1,y1,...], n = point count
const _xn = new Float32Array(24);
export function fillPoly(buf, W, H, pts, n, c) {
  let ymin = 1e9, ymax = -1e9;
  for (let i = 0; i < n; i++) {
    const y = pts[i * 2 + 1];
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
  const y0 = Math.max(0, Math.ceil(ymin)), y1 = Math.min(H - 1, Math.floor(ymax));
  if (y1 < y0) return;
  for (let y = y0; y <= y1; y++) {
    let m = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xi = pts[i * 2], yi = pts[i * 2 + 1];
      const xj = pts[j * 2], yj = pts[j * 2 + 1];
      if ((yi <= y && yj > y) || (yj <= y && yi > y)) {
        _xn[m++] = xi + (y - yi) / (yj - yi) * (xj - xi);
        if (m >= 24) break;
      }
    }
    // insertion sort (m is tiny)
    for (let a = 1; a < m; a++) {
      const v = _xn[a]; let b = a - 1;
      while (b >= 0 && _xn[b] > v) { _xn[b + 1] = _xn[b]; b--; }
      _xn[b + 1] = v;
    }
    const row = y * W;
    for (let k = 0; k + 1 < m; k += 2) {
      const xa = Math.max(0, Math.ceil(_xn[k])), xb = Math.min(W - 1, Math.floor(_xn[k + 1]));
      for (let x = xa; x <= xb; x++) buf[row + x] = c;
    }
  }
}

// Bresenham line with alpha blend
export function lineA(buf, W, H, x0, y0, x1, y1, c, a) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 4096; guard++) {
    if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H) {
      const i = y0 * W + x0; buf[i] = blend(buf[i], c, a);
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// circle outline with alpha
export function circA(buf, W, H, cx, cy, r, c, a) {
  const steps = Math.max(10, (r * 5) | 0);
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    plotA(buf, W, H, (cx + Math.cos(t) * r) | 0, (cy + Math.sin(t) * r) | 0, c, a);
  }
}

// hsl → packed px (h 0..360, s/l 0..1)
export function hslPx(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return px(Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255));
}
