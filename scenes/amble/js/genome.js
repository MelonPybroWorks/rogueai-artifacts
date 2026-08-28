// genome.js — heredity for soft walkers: nodes, edges, oscillator muscles. Pure, no DOM.
import { rr, ri, gauss } from './rng.js';

export const MIN_NODES = 4, MAX_NODES = 8, MAX_EDGES = 14;
const TAU = Math.PI * 2;

export function cloneGenome(g) {
  return {
    hue: g.hue,
    nodes: g.nodes.map(n => ({ x: n.x, y: n.y, m: n.m })),
    edges: g.edges.map(e => ({ a: e.a, b: e.b, st: e.st, mu: e.mu, amp: e.amp, ph: e.ph, fr: e.fr })),
  };
}

const ekey = (a, b) => (a < b ? a * 32 + b : b * 32 + a);
const hasEdge = (edges, a, b) => { const k = ekey(a, b); return edges.some(e => ekey(e.a, e.b) === k); };

function makeEdge(rng, a, b) {
  const mu = rng() < 0.55;
  return {
    a, b, mu,
    st: mu ? rr(rng, 0.24, 0.5) : rr(rng, 0.8, 1.0),
    amp: rr(rng, 0.10, 0.38),
    ph: rng() * TAU,
    fr: rr(rng, 0.5, 2.6),
  };
}

export function randomGenome(rng) {
  const n = ri(rng, 5, MAX_NODES);
  const nodes = [];
  for (let i = 0; i < n; i++) nodes.push({ x: rng(), y: rng(), m: rr(rng, 0.8, 1.4) });
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const edges = [];
  for (let i = 1; i < n; i++) edges.push(makeEdge(rng, order[i - 1], order[i]));
  const extra = ri(rng, 1, Math.min(5, MAX_EDGES - (n - 1)));
  let guard = 0;
  for (let k = 0; k < extra && guard++ < 40;) {
    const a = Math.floor(rng() * n), b = Math.floor(rng() * n);
    if (a === b || hasEdge(edges, a, b)) continue;
    edges.push(makeEdge(rng, a, b)); k++;
  }
  return { hue: Math.floor(rng() * 360), nodes, edges };
}

// reconnect orphaned components to component 0 via nearest pairs (bone edges)
function repair(g) {
  const n = g.nodes.length;
  const comp = new Array(n).fill(-1);
  let nc = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1) continue;
    const stack = [s]; comp[s] = nc;
    while (stack.length) {
      const u = stack.pop();
      for (const e of g.edges) {
        const v = e.a === u ? e.b : (e.b === u ? e.a : -1);
        if (v >= 0 && comp[v] === -1) { comp[v] = nc; stack.push(v); }
      }
    }
    nc++;
  }
  let guard = 0;
  while (nc > 1 && guard++ < 12) {
    let bi = -1, bj = -1, bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (comp[i] !== 0) continue;
      for (let j = 0; j < n; j++) {
        if (comp[j] === 0) continue;
        const dx = g.nodes[i].x - g.nodes[j].x, dy = g.nodes[i].y - g.nodes[j].y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    if (bi < 0) break;
    const cj = comp[bj];
    g.edges.push({ a: bi, b: bj, st: 0.9, mu: false, amp: 0.2, ph: 0, fr: 1 });
    for (let i = 0; i < n; i++) if (comp[i] === cj) comp[i] = 0;
    nc--;
  }
  return g;
}

export function mutate(src, rng, rate = 1) {
  const g = cloneGenome(src);
  const P = p => rng() < p * rate;
  for (const n of g.nodes) {
    if (P(0.10)) n.x = Math.min(1, Math.max(0, n.x + gauss(rng) * 0.07));
    if (P(0.10)) n.y = Math.min(1, Math.max(0, n.y + gauss(rng) * 0.07));
    if (P(0.05)) n.m = Math.min(1.8, Math.max(0.5, n.m + gauss(rng) * 0.12));
  }
  for (const e of g.edges) {
    if (P(0.07)) e.st = Math.min(1, Math.max(0.15, e.st + gauss(rng) * 0.06));
    if (e.mu) {
      if (P(0.08)) e.amp = Math.min(0.5, Math.max(0.04, e.amp + gauss(rng) * 0.05));
      if (P(0.08)) e.fr = Math.min(3.2, Math.max(0.3, e.fr * Math.exp(gauss(rng) * 0.14)));
      if (P(0.08)) e.ph = (e.ph + gauss(rng) * 0.6 + TAU * 20) % TAU;
    }
    if (P(0.02)) { e.mu = !e.mu; e.st = e.mu ? 0.32 : 0.9; }
    if (P(0.05)) { // rewire one endpoint
      const na = Math.floor(rng() * g.nodes.length);
      if (rng() < 0.5) { if (na !== e.b && !hasEdge(g.edges, na, e.b)) e.a = na; }
      else if (na !== e.a && !hasEdge(g.edges, e.a, na)) e.b = na;
    }
  }
  if (P(0.07) && g.edges.length < MAX_EDGES) {
    for (let t = 0; t < 12; t++) {
      const a = Math.floor(rng() * g.nodes.length), b = Math.floor(rng() * g.nodes.length);
      if (a !== b && !hasEdge(g.edges, a, b)) { g.edges.push(makeEdge(rng, a, b)); break; }
    }
  }
  if (P(0.07) && g.edges.length > g.nodes.length - 1) {
    g.edges.splice(Math.floor(rng() * g.edges.length), 1);
  }
  if (P(0.05) && g.nodes.length < MAX_NODES) { // bud a node near an existing one
    const si = Math.floor(rng() * g.nodes.length), s = g.nodes[si];
    const node = {
      x: Math.min(1, Math.max(0, s.x + gauss(rng) * 0.15)),
      y: Math.min(1, Math.max(0, s.y + gauss(rng) * 0.15)),
      m: rr(rng, 0.8, 1.4),
    };
    g.nodes.push(node);
    const ni = g.nodes.length - 1;
    g.edges.push(makeEdge(rng, si, ni));
    let bi = -1, bd = Infinity;
    for (let i = 0; i < ni; i++) {
      if (i === si) continue;
      const dx = g.nodes[i].x - node.x, dy = g.nodes[i].y - node.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi >= 0 && g.edges.length < MAX_EDGES && !hasEdge(g.edges, bi, ni)) g.edges.push(makeEdge(rng, bi, ni));
  }
  if (P(0.05) && g.nodes.length > MIN_NODES) { // prune a node
    const vi = Math.floor(rng() * g.nodes.length);
    g.nodes.splice(vi, 1);
    g.edges = g.edges.filter(e => e.a !== vi && e.b !== vi);
    for (const e of g.edges) { if (e.a > vi) e.a--; if (e.b > vi) e.b--; }
  }
  if (P(0.5)) g.hue = (g.hue + Math.round(gauss(rng) * 10) + 360) % 360;
  return repair(g);
}

export function crossover(a, b, rng) {
  const fromA = rng() < 0.5;
  const base = fromA ? a : b, oth = fromA ? b : a;
  const g = cloneGenome(base);
  const nn = Math.min(g.nodes.length, oth.nodes.length);
  for (let i = 0; i < nn; i++) if (rng() < 0.5) {
    g.nodes[i].x = oth.nodes[i].x; g.nodes[i].y = oth.nodes[i].y; g.nodes[i].m = oth.nodes[i].m;
  }
  const ne = Math.min(g.edges.length, oth.edges.length);
  for (let i = 0; i < ne; i++) if (rng() < 0.5) {
    const s = oth.edges[i], d = g.edges[i];
    d.st = s.st; d.mu = s.mu; d.amp = s.amp; d.ph = s.ph; d.fr = s.fr;
  }
  if (rng() < 0.3) g.hue = oth.hue;
  return g;
}
