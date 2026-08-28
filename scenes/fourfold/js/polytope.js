// polytope.js — regular 4-polytopes and the 4D→3D→2D shadow pipeline. Pure, no DOM.
export const POLYTOPES = [
  { name: 'THE SIMPLEST', sub: '5-cell · five corners', build: build5Cell },
  { name: 'THE TESSERACT', sub: '8-cell · sixteen corners', build: buildTesseract },
  { name: 'THE CROSS', sub: '16-cell · eight corners', build: build16Cell },
  { name: 'THE JEWEL', sub: '24-cell · twenty-four corners', build: build24Cell },
];

function build5Cell() {
  // 4-simplex: 5 vertices, every pair joined
  const v = [];
  for (let i = 0; i < 5; i++) {
    const p = [0, 0, 0, 0];
    p[i % 4] = 1.3;
    if (i === 4) { p[0] = p[1] = p[2] = p[3] = -0.325; }
    v.push(p);
  }
  // center it
  const c = [0, 0, 0, 0];
  for (const p of v) for (let k = 0; k < 4; k++) c[k] += p[k] / 5;
  for (const p of v) for (let k = 0; k < 4; k++) p[k] -= c[k];
  const e = [];
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) e.push([i, j]);
  return { v, e };
}

function buildTesseract() {
  const v = [];
  for (let i = 0; i < 16; i++) v.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
  const e = [];
  for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) {
    let diff = 0;
    for (let k = 0; k < 4; k++) if (v[i][k] !== v[j][k]) diff++;
    if (diff === 1) e.push([i, j]);
  }
  return { v, e };
}

function build16Cell() {
  // cross-polytope: ±e_i; edges join all but opposites
  const v = [];
  for (let k = 0; k < 4; k++) {
    const a = [0, 0, 0, 0]; a[k] = 1.5; v.push(a);
    const b = [0, 0, 0, 0]; b[k] = -1.5; v.push(b);
  }
  const e = [];
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
    let dot = 0;
    for (let k = 0; k < 4; k++) dot += v[i][k] * v[j][k];
    if (Math.abs(dot) > 0.5) continue;   // opposites
    e.push([i, j]);
  }
  return { v, e };
}

function build24Cell() {
  // permutations of (±1, ±1, 0, 0)
  const v = [];
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      const p = [0, 0, 0, 0];
      p[a] = sa * 1.06; p[b] = sb * 1.06;
      v.push(p);
    }
  }
  const e = [];
  for (let i = 0; i < 24; i++) for (let j = i + 1; j < 24; j++) {
    let d2 = 0;
    for (let k = 0; k < 4; k++) { const d = v[i][k] - v[j][k]; d2 += d * d; }
    if (d2 < 2.26) e.push([i, j]);   // adjacent pairs sit at edge² = 2 × (1.06)² ≈ 2.25
  }
  return { v, e };
}

// rotate point p in the (a,b) coordinate plane by t
export function rotPlane(p, a, b, t) {
  const c = Math.cos(t), s = Math.sin(t);
  const pa = p[a], pb = p[b];
  p[a] = pa * c - pb * s;
  p[b] = pa * s + pb * c;
}

// 4D → 3D → 2D double perspective shadow. out: {x, y, depth}
export function project(p4, d4, d3, out) {
  const w = d4 / (d4 - p4[3]);               // 4D perspective: shadow moves as w changes
  const x = p4[0] * w, y = p4[1] * w, z = p4[2] * w;
  const zf = d3 / (d3 + z);                  // 3D perspective
  out.x = x * zf;
  out.y = y * zf;
  out.depth = w * zf;                        // brightness cue: nearer shadow = brighter
  return out;
}
