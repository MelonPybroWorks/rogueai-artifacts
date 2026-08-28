// myth.js — connect-the-dots apophenia: walk bright neighbors into a figure, name it. Pure.
const ADJ = ['DROWNED', 'PATIENT', 'SALT-BLIND', 'HOLLOW', 'SEVENTH', 'LANTERNED', 'QUIET', 'ASH', 'LOWER', 'UNWEAVING', 'COPPER', 'FIRST', 'LAST', 'SIGNAL', 'HUMMING'];
const NOUN = ['CARTOGRAPHER', 'KEEPER', 'SHEPHERD', 'ENGINE', 'LOOM', 'TIDE', 'THRESHOLD', 'ARCHIVE', 'ORCHARD', 'BELL', 'FERN', 'HOUND', 'VESSEL', 'SINGER', 'WITNESS'];
const NOUNS = ['LANTERNS', 'SMALL HOURS', 'THREADS', 'STATIC', 'WANDERERS', 'BELLS', 'EMBERS', 'RIVERS', 'DOORS', 'SHADOWS', 'PINS', 'SONGS'];
const NUM = ['TWO', 'THREE', 'FIVE', 'SEVEN', 'NINE', 'ELEVEN', 'TWELVE'];

export function makeName(rng) {
  const p = (a) => a[(rng() * a.length) | 0];
  const r = rng();
  if (r < 0.3) return `THE ${p(ADJ)} ${p(NOUN)}`;
  if (r < 0.5) return `THE ${p(NOUN)} OF ${p(NOUNS)}`;
  if (r < 0.65) return `${p(NOUN)} OF THE ${p(ADJ)} ${p(NOUN)}`;
  if (r < 0.8) return `THE ${p(NUM)} ${p(NOUNS)}`;
  return `THE ${p(NOUN)}'S ${p(NOUN)}`;
}

// walk a constellation: hero star → nearest unvisited neighbors with sane turn angles.
// stars have .az/.alt; we walk in that angular space.
export function walkFigure(stars, rng, heroIdx = -1) {
  let hi = heroIdx;
  if (hi < 0) {
    // hero: bright and not at the very rim
    const cands = [];
    for (let i = 0; i < stars.length; i++) {
      if (stars[i].mag > 0.55 && stars[i].alt > 0.25 && stars[i].alt < 1.25) cands.push(i);
    }
    if (!cands.length) return null;
    hi = cands[(rng() * cands.length) | 0];
  }
  const used = new Set([hi]);
  const chain = [hi];
  const target = 5 + (rng() * 4 | 0);   // 5..8 stars
  let guard = 0;
  while (chain.length < target && guard++ < 60) {
    const cur = stars[chain[chain.length - 1]];
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < stars.length; i++) {
      if (used.has(i)) continue;
      const s = stars[i];
      if (s.mag < 0.18) continue;                       // too faint to join a figure
      let dAz = s.az - cur.az;
      if (dAz > Math.PI) dAz -= 2 * Math.PI; if (dAz < -Math.PI) dAz += 2 * Math.PI;
      const dAlt = s.alt - cur.alt;
      const d = Math.hypot(dAz, dAlt);
      if (d < 0.06 || d > 0.7) continue;                // segment length limits
      // turn-angle sanity: avoid doubling back hard
      if (chain.length > 1) {
        const prev = stars[chain[chain.length - 2]];
        let pAz = cur.az - prev.az;
        if (pAz > Math.PI) pAz -= 2 * Math.PI; if (pAz < -Math.PI) pAz += 2 * Math.PI;
        const pAlt = cur.alt - prev.alt;
        const dot = (pAz * dAz + pAlt * dAlt) / (Math.hypot(pAz, pAlt) * d || 1);
        if (dot < -0.35) continue;                      // no sharp reversals
      }
      // prefer near + bright
      const score = d * (1.6 - s.mag) ;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) break;
    used.add(best);
    chain.push(best);
  }
  return chain.length >= 4 ? chain : null;
}

export class MythBook {
  constructor(rng) {
    this.rng = rng;
    this.count = 0;
    this.active = null;   // {chain, name, segShown, state, t}
    this.log = [];
  }
  // begin a new myth; returns it
  begin(stars, heroIdx = -1) {
    const chain = walkFigure(stars, this.rng, heroIdx);
    if (!chain) return null;
    const myth = {
      chain, name: makeName(this.rng),
      segShown: 0, state: 'forming', t: 0, glow: 0,
    };
    this.count++;
    this.active = myth;
    return myth;
  }
}
