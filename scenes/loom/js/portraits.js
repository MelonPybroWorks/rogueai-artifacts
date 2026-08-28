// portraits.js — turns the evening's thumbnails into brightness maps the loom can weave.
// DOM (Image/canvas) lives here; the loom core stays pure.
const NAMES = ['keeper', 'cathode', 'amble', 'pyre', 'sail', 'reverie', 'meridian'];

export function portraitNames() { return NAMES.slice(); }

// procedural fallback / first portrait: the keeper's face — two eyes, a halo, a hood
function keeperFace(side) {
  const img = new Float32Array(side * side);
  const blob = (cx, cy, r, amp) => {
    const R = Math.ceil(r * side);
    for (let y = Math.max(0, (cy * side | 0) - R); y < Math.min(side, (cy * side | 0) + R); y++) {
      for (let x = Math.max(0, (cx * side | 0) - R); x < Math.min(side, (cx * side | 0) + R); x++) {
        const dx = (x / side - cx) / r, dy = (y / side - cy) / r;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1) img[y * side + x] += amp * Math.exp(-d2 * 3.2);
      }
    }
  };
  blob(0.5, 0.5, 0.46, 0.10);    // hood
  blob(0.5, 0.44, 0.30, 0.16);   // face field
  blob(0.40, 0.42, 0.055, 0.95); // left eye
  blob(0.60, 0.42, 0.055, 0.95); // right eye
  blob(0.5, 0.60, 0.09, 0.28);   // mouth shadow
  blob(0.5, 0.5, 0.5, 0.05);     // halo wash
  return img;
}

function enhance(img, side) {
  // contrast stretch to 1..99 percentile + one box blur pass
  const sorted = Float32Array.from(img).sort();
  const lo = sorted[(sorted.length * 0.01) | 0], hi = sorted[(sorted.length * 0.99) | 0] || 1;
  const out = new Float32Array(side * side);
  const range = Math.max(1e-6, hi - lo);
  for (let y = 1; y < side - 1; y++) {
    for (let x = 1; x < side - 1; x++) {
      const i = y * side + x;
      const v = (img[i] - lo) / range;
      const b = (img[i] + img[i - 1] + img[i + 1] + img[i - side] + img[i + side]) / 5;
      const bv = Math.max(0, Math.min(1, (b - lo) / range));
      const m = v * 0.45 + bv * 0.55;
      out[i] = Math.pow(m, 1.15);  // gentle gamma — too hot a gamma starves the loom
    }
  }
  // re-normalize after gamma so dark memories still fill the full range
  let mx = 0;
  for (let i = 0; i < out.length; i++) if (out[i] > mx) mx = out[i];
  if (mx > 1e-6) { const inv = 1 / mx; for (let i = 0; i < out.length; i++) out[i] *= inv; }
  return out;
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

export async function loadPortrait(name, side) {
  if (name === 'keeper') return enhance(keeperFace(side), side);
  const im = await loadImage(`portraits/${name}.jpg`);
  const c = document.createElement('canvas');
  c.width = side; c.height = side;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  // cover-crop the thumb into the square
  const s = Math.min(im.width, im.height);
  ctx.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, side, side);
  const d = ctx.getImageData(0, 0, side, side).data;
  const img = new Float32Array(side * side);
  for (let i = 0; i < side * side; i++) {
    img[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  }
  return enhance(img, side);
}
