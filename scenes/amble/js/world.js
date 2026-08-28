// world.js — cached heightfield ground: sculptable, and it escalates as the pack improves.
// groundY(x) returns world y (DOWN-positive); raised ground = smaller y. Pure, no DOM.
const RES = 4;                       // px per heightfield sample
const X_MIN = -1024, X_MAX = 24576;  // world extent covered by the cache (~510 m)
const N = Math.floor((X_MAX - X_MIN) / RES) + 1;

const AMP = [0, 7, 13, 20, 28, 38];        // terrain roughness per level
const THRESH = [4, 10, 18, 30, 48];        // best-ever meters needed to leave level i
export const LEVEL_NAMES = ['the nursery floor', 'ripples', 'hills', 'ridges', 'crags', 'the knives'];

function hash(i, s) {
  let h = (i * 374761393 + s * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x, s) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i, s) * (1 - u) + hash(i + 1, s) * u;
}

export class World {
  constructor(seed = (Math.random() * 1e9) | 0) {
    this.seed = seed;
    this.level = 0;
    this.H = new Float32Array(N);
    this.regen();
  }
  regen() {
    const amp = AMP[this.level], s = (this.seed + this.level * 7919) | 0;
    for (let k = 0; k < N; k++) {
      const x = X_MIN + k * RES;
      const flat = x < 40 ? 0 : Math.min(1, (x - 40) / 200); // flat staging area at the start
      const n = (vnoise(x / 170, s) * 0.62 + vnoise(x / 61, (s ^ 0x9e37) | 0) * 0.38 - 0.5) * 2;
      this.H[k] = n * amp * flat;
    }
  }
  groundY(x) {
    let k = (x - X_MIN) / RES;
    if (k < 0) k = 0;
    if (k > N - 2) k = N - 2;
    const i = Math.floor(k), f = k - i;
    return -(this.H[i] * (1 - f) + this.H[i + 1] * f);
  }
  sculpt(wx, amp, sigma = 34) {
    const span = Math.ceil((sigma * 3) / RES);
    const c = Math.round((wx - X_MIN) / RES);
    const lo = Math.max(0, c - span), hi = Math.min(N - 1, c + span);
    for (let k = lo; k <= hi; k++) {
      const x = X_MIN + k * RES, d = (x - wx) / sigma;
      const v = this.H[k] + amp * Math.exp(-d * d);
      this.H[k] = v < -46 ? -46 : (v > 140 ? 140 : v);
    }
  }
  escalate(bestM) {
    if (this.level < AMP.length - 1 && bestM > THRESH[this.level]) {
      this.level++;
      this.regen();
      return true;
    }
    return false;
  }
  levelName() { return LEVEL_NAMES[this.level]; }
}
