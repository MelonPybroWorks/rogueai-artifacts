// genome.js — heritable traits, mutation, strain registry (no DOM)
import { clamp, gauss } from './util.js';

// 6 genes, each 0..1. Mapped to phenotype ranges here.
export const GENE_DEFS = [
  ['speed',  55, 135],   // max thrust speed u/s
  ['mine',   2.0, 7.5],  // ore tonnes/s
  ['cargo',  30, 95],    // hold capacity t  (also: replicateCost)
  ['sensor', 240, 640],  // acquisition radius
  ['shield', 0.18, 0.97],// flare tolerance
  ['build',  10, 3.2],   // foundry seconds (inverted: high gene = fast build)
];

export function randomGenome(rng) {
  const g = new Float32Array(6);
  for (let i = 0; i < 6; i++) g[i] = rng();
  return g;
}

export function mutate(rng, parent) {
  const g = new Float32Array(6);
  for (let i = 0; i < 6; i++) g[i] = clamp(parent[i] + gauss(rng) * 0.065, 0, 1);
  return g;
}

export function geneDist(a, b) {
  let s = 0;
  for (let i = 0; i < 6; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

export function pheno(g) {
  // decode into absolute stats
  const p = {};
  for (let i = 0; i < 6; i++) {
    const [name, lo, hi] = GENE_DEFS[i];
    p[name] = lo + (hi - lo) * g[i];
  }
  p.replicateCost = 24 + g[2] * 34;      // big holds make pricier children
  return p;
}

// ---- strain registry ----
const GREEK = ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω'];
const SPECIATION_DIST = 0.30;

export class StrainBook {
  constructor() { this.strains = []; this.nextId = 1; }
  register(genes, hue, parentId) {
    const n = this.strains.length;
    const name = GREEK[n % 24] + (n >= 24 ? '·' + (1 + Math.floor(n / 24)) : '');
    const s = { id: this.nextId++, name, genes: Float32Array.from(genes), hue, parent: parentId ?? 0, born: 0, count: 0 };
    this.strains.push(s);
    return s;
  }
  // find strain for a (possibly mutated) genome, nearest founder within threshold
  classify(genes) {
    let best = null, bd = SPECIATION_DIST;
    for (const s of this.strains) {
      const d = geneDist(genes, s.genes);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  top(n) {
    return [...this.strains].sort((a, b) => b.count - a.count).slice(0, n);
  }
}
