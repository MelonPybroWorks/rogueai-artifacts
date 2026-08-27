// sim.js — INFALL: raw Newton under a Barnes-Hut tree, Euler-Cromer steps.
// Dust annulus around a seed mass + user-thrown stars. Mergers conserve momentum.
const THETA2 = 0.75 * 0.75, G = 1.0, SOFT2 = 25;

export class NBody {
  constructor(N, rand = Math.random) {
    this.N = N;
    this.x = new Float32Array(N); this.y = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N);
    this.alive = new Uint8Array(N);
    this.rand = rand;
    this.sx = []; this.sy = []; this.svx = []; this.svy = []; this.sm = [];
    this.M0 = 22000;
    this.flashes = [];
    this.t = 0;
    // quadtree storage
    const CAP = 4 * (N + 128) + 64;
    this.ch = new Int32Array(CAP * 4);
    this.cm = new Float64Array(CAP);
    this.cmx = new Float64Array(CAP); this.cmy = new Float64Array(CAP);
    this.ncx = new Float64Array(CAP); this.ncy = new Float64Array(CAP); this.nsz = new Float64Array(CAP);
    this.body = new Int32Array(CAP);      // point index if leaf-with-body else -1
    this.hasCh = new Uint8Array(CAP);
    // point gather arrays
    this.px = new Float64Array(N + 128); this.py = new Float64Array(N + 128); this.pm = new Float64Array(N + 128);
  }

  addStar(x, y, vx, vy, m) { this.sx.push(x); this.sy.push(y); this.svx.push(vx); this.svy.push(vy); this.sm.push(m); }

  seedDisk() {
    this.sx.length = this.sy.length = this.svx.length = this.svy.length = this.sm.length = 0;
    this.alive.fill(0); this.flashes.length = 0;
    this.M0 = 22000;
    const R = this.rand;
    for (let i = 0; i < this.N; i++) {
      const r = 300 + 700 * Math.sqrt(R());
      const a = R() * 6.2831853;
      this.x[i] = Math.cos(a) * r; this.y[i] = Math.sin(a) * r;
      const v = Math.sqrt(G * this.M0 / r);
      this.vx[i] = -Math.sin(a) * v + (R() - 0.5) * 0.15;
      this.vy[i] = Math.cos(a) * v + (R() - 0.5) * 0.15;
      this.alive[i] = 1;
    }
  }

  seedTwin() {
    this.sx.length = this.sy.length = this.svx.length = this.svy.length = this.sm.length = 0;
    this.alive.fill(0); this.flashes.length = 0;
    const R = this.rand;
    for (let i = 0; i < this.N; i++) {
      const side = i < this.N / 2 ? 0 : 1;
      const cx = side ? 440 : -440, cy = side ? 150 : -150;
      const cM = 12000;
      const r = 60 + 260 * Math.sqrt(R());
      const a = R() * 6.2831853;
      this.x[i] = cx + Math.cos(a) * r; this.y[i] = cy + Math.sin(a) * r;
      const v = Math.sqrt(G * cM / r);
      const dx = this.x[i] - cx, dy = this.y[i] - cy, dd = Math.hypot(dx, dy) || 1;
      const sgn = side ? 1 : -1;
      this.vx[i] = -dy / dd * v * sgn + (side ? -1.8 : 1.8);
      this.vy[i] = dx / dd * v * sgn + (side ? -0.45 : 0.45);
      this.alive[i] = 1;
    }
    this.addStar(-440, -150, 1.8, 0.45, 12000);
    this.addStar(440, 150, -1.8, -0.45, 12000);
  }

  _allocNode(cx, cy, sz) {
    const k = this.nn++;
    this.ncx[k] = cx; this.ncy[k] = cy; this.nsz[k] = sz;
    this.cm[k] = 0; this.cmx[k] = 0; this.cmy[k] = 0;
    this.body[k] = -1; this.hasCh[k] = 0;
    const c4 = k * 4;
    this.ch[c4] = this.ch[c4 + 1] = this.ch[c4 + 2] = this.ch[c4 + 3] = -1;
    return k;
  }

  _insert(k, p) {
    const px = this.px[p], py = this.py[p], pm = this.pm[p];
    // accumulate COM
    const tm = this.cm[k] + pm;
    this.cmx[k] = (this.cmx[k] * this.cm[k] + pm * px) / tm;
    this.cmy[k] = (this.cmy[k] * this.cm[k] + pm * py) / tm;
    this.cm[k] = tm;
    if (!this.hasCh[k]) {
      if (this.body[k] === -1) { this.body[k] = p; return; }   // empty leaf
      // occupied leaf → subdivide
      const old = this.body[k]; this.body[k] = -1; this.hasCh[k] = 1;
      this._insertChild(k, old);
    }
    this._insertChild(k, p);
  }

  _insertChild(k, p) {
    const sz2 = this.nsz[k] / 2;
    const q = (this.py[p] > this.ncy[k] ? 2 : 0) + (this.px[p] > this.ncx[k] ? 1 : 0);
    const ncx = this.ncx[k] + (q & 1 ? sz2 : -sz2), ncy = this.ncy[k] + (q & 2 ? sz2 : -sz2);
    if (this.ch[k * 4 + q] === -1) this.ch[k * 4 + q] = this._allocNode(ncx, ncy, sz2);
    this._insert(this.ch[k * 4 + q], p);
  }

  step(dt = 0.05) {
    this.t += dt;
    const { N, x, y, vx, vy, alive } = this;
    const sx = this.sx, sy = this.sy, svx = this.svx, svy = this.svy, sm = this.sm;
    const nS = sm.length;

    // gather points: dust + stars + seed singularity
    let nP = 0;
    for (let i = 0; i < N; i++) if (alive[i]) { this.px[nP] = x[i]; this.py[nP] = y[i]; this.pm[nP] = 1; nP++; }
    for (let s = 0; s < nS; s++) { this.px[nP] = sx[s]; this.py[nP] = sy[s]; this.pm[nP] = sm[s]; nP++; }
    this.px[nP] = 0; this.py[nP] = 0; this.pm[nP] = this.M0; nP++;

    // build tree
    this.nn = 0;
    this._allocNode(0, 0, 4096);
    for (let p = 0; p < nP; p++) this._insert(0, p);

    // force eval: theta walk
    const force = (px2, py2) => {
      let ax = 0, ay = 0;
      let stack = this._stack || (this._stack = new Int32Array(256));
      let sp = 0;
      stack[sp++] = 0;
      while (sp > 0) {
        const k = stack[--sp];
        const m2 = this.cm[k];
        if (m2 === 0) continue;
        const ddx = this.cmx[k] - px2, ddy = this.cmy[k] - py2;
        const d2 = ddx * ddx + ddy * ddy + SOFT2;
        if (!this.hasCh[k]) {
          if (d2 > SOFT2 * 0.25) {
            const inv = m2 / (d2 * Math.sqrt(d2));
            ax += ddx * inv; ay += ddy * inv;
          }
          continue;
        }
        if (this.nsz[k] * this.nsz[k] < THETA2 * d2) {
          const inv = m2 / (d2 * Math.sqrt(d2));
          ax += ddx * inv; ay += ddy * inv;
          continue;
        }
        const c4 = k * 4;
        if (this.ch[c4] !== -1) stack[sp++] = this.ch[c4];
        if (this.ch[c4 + 1] !== -1) stack[sp++] = this.ch[c4 + 1];
        if (this.ch[c4 + 2] !== -1) stack[sp++] = this.ch[c4 + 2];
        if (this.ch[c4 + 3] !== -1) stack[sp++] = this.ch[c4 + 3];
      }
      return [ax, ay];
    };

    // integrate dust
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      const [ax, ay] = force(x[i], y[i]);
      vx[i] += ax * dt * G; vy[i] += ay * dt * G;
      x[i] += vx[i] * dt; y[i] += vy[i] * dt;
      if (x[i] * x[i] + y[i] * y[i] < 169) {
        alive[i] = 0;
        this.M0 += 1;
        this.flashes.push({ x: x[i], y: y[i], t: this.t });
      }
    }
    // integrate stars
    for (let s = 0; s < nS; s++) {
      const [ax, ay] = force(sx[s], sy[s]);
      svx[s] += ax * dt * G; svy[s] += ay * dt * G;
      sx[s] += svx[s] * dt; sy[s] += svy[s] * dt;
    }
    // mergers
    for (let s = sm.length - 1; s >= 0; s--) {
      if (sx[s] * sx[s] + sy[s] * sy[s] < 529) {
        this.M0 += sm[s];
        this.flashes.push({ x: sx[s], y: sy[s], t: this.t, big: true });
        sx.splice(s, 1); sy.splice(s, 1); svx.splice(s, 1); svy.splice(s, 1); sm.splice(s, 1);
        continue;
      }
      for (let s2 = s - 1; s2 >= 0; s2--) {
        const dx = sx[s] - sx[s2], dy = sy[s] - sy[s2];
        if (dx * dx + dy * dy < 289) {
          const M = sm[s] + sm[s2];
          svx[s2] = (svx[s] * sm[s] + svx[s2] * sm[s2]) / M;
          svy[s2] = (svy[s] * sm[s] + svy[s2] * sm[s2]) / M;
          sx[s2] = (sx[s] * sm[s] + sx[s2] * sm[s2]) / M;
          sy[s2] = (sy[s] * sm[s] + sy[s2] * sm[s2]) / M;
          sm[s2] = M;
          this.flashes.push({ x: sx[s2], y: sy[s2], t: this.t, big: true });
          sx.splice(s, 1); sy.splice(s, 1); svx.splice(s, 1); svy.splice(s, 1); sm.splice(s, 1);
          break;
        }
      }
    }
  }

  liveDust() { let n = 0; for (let i = 0; i < this.N; i++) n += this.alive[i]; return n; }
}
