// world.js — asteroid field, comets, solar flares (no DOM)
import { CFG } from './config.js';
import { SpatialHash, clamp, gauss } from './util.js';

export class World {
  constructor(rng) {
    this.rng = rng;
    this.R = CFG.WORLD;
    this.asteroids = [];
    this.comets = [];
    this.events = [];            // {msg, cls} — drained by HUD
    this.hash = new SpatialHash(170);
    this.time = 0;
    this.oreMined = 0;
    this.flareCount = 0;
    this._genField();
    // flare state machine
    // grace period before the first flare — let the colony establish
    this.flare = { phase: 'idle', t: 100 + rng() * 45, dir: 0, nx: 1, ny: 0, dist: 0, max: 1, kill: CFG.FLARE_KILL };
    this.cometT = 6 + rng() * 10;
  }

  emit(msg, cls = '') { this.events.push({ msg, cls }); if (this.events.length > 24) this.events.shift(); }

  _genField() {
    const rng = this.rng, R = this.R;
    const clusters = 9 + Math.floor(rng() * 3);
    for (let c = 0; c < clusters; c++) {
      const cx = R * 0.12 + rng() * R * 0.76, cy = R * 0.12 + rng() * R * 0.76;
      const n = 8 + Math.floor(rng() * 7);
      for (let i = 0; i < n; i++) {
        const x = clamp(cx + gauss(rng) * 210, 80, R - 80);
        const y = clamp(cy + gauss(rng) * 210, 80, R - 80);
        this._addAsteroid(x, y, false);
      }
    }
    for (let i = this.asteroids.length; i < CFG.ASTEROIDS; i++)
      this._addAsteroid(90 + rng() * (R - 180), 90 + rng() * (R - 180), false);
    for (const a of this.asteroids) this.hash.insert(a, a.x, a.y);
  }

  _addAsteroid(x, y, announce = true, boostRich = 1) {
    const rng = this.rng;
    const r = 8 + Math.pow(rng(), 1.7) * 30;
    const rich = (0.7 + rng() * 0.9) * boostRich;
    const ore = r * r * r * CFG.ORE_PER_R3 * rich;
    const verts = [];
    const nv = 9 + Math.floor(rng() * 5);
    for (let i = 0; i < nv; i++) verts.push(0.72 + rng() * 0.5);
    const a = {
      id: this.asteroids.length, x, y, r, ore, maxOre: ore, rich,
      rot: rng() * Math.PI * 2, spin: (rng() - 0.5) * 0.14,
      verts, scorch: 0, dead: false,
    };
    this.asteroids.push(a);
    if (this.hash) this.hash.insert(a, x, y);
    return a;
  }

  nearestRich(x, y, maxR) {
    let best = null, bd = maxR * maxR;
    this.hash.query(x, y, maxR, (a) => {
      if (a.ore < 4) return false;
      const dx = a.x - x, dy = a.y - y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = a; }
      return false;
    });
    return best;
  }
  // omniscient fallback ("nav charts"): nearest asteroid with ore in whole sector
  chartNearest(x, y) {
    let best = null, bd = Infinity;
    for (const a of this.asteroids) {
      if (a.ore < 4) continue;
      const dx = a.x - x, dy = a.y - y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = a; }
    }
    return best;
  }
  richest() {
    let best = null;
    for (const a of this.asteroids) if (!best || a.ore > best.ore) best = a;
    return best;
  }
  totalOre() { let s = 0; for (const a of this.asteroids) s += a.ore; return s; }

  // ---- comets: deliver fresh ore ----
  sendComet(tx, ty, silent = false) {
    const rng = this.rng, R = this.R;
    const ang = rng() * Math.PI * 2;
    const sx = tx + Math.cos(ang) * R * 0.75, sy = ty + Math.sin(ang) * R * 0.75;
    const dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1;
    this.comets.push({ x: sx, y: sy, vx: dx / d * CFG.COMET_SPEED, vy: dy / d * CFG.COMET_SPEED, tx, ty, t: 0 });
    if (!silent) this.emit('comet inbound — fresh ore', 'good');
  }

  // ---- flares ----
  forceFlare() { if (this.flare.phase === 'idle') this.flare.t = Math.min(this.flare.t, 0.01); }

  _startWarn() {
    const rng = this.rng;
    const dir = rng() * Math.PI * 2;
    this.flare.phase = 'warn'; this.flare.t = CFG.FLARE_WARN;
    this.flare.dir = dir;
    this.flare.nx = Math.cos(dir); this.flare.ny = Math.sin(dir);
    // lethality ramps up over the first several flares (selection pressure grows)
    const ramp = 0.70 + 0.30 * Math.min(1, this.flareCount / 6);
    this.flare.kill = CFG.FLARE_KILL * ramp * (0.85 + rng() * 0.30);
    this.emit('⚠ prominence warning — flare front imminent', 'warn');
  }
  _startSweep() {
    const f = this.flare, R = this.R;
    f.phase = 'sweep'; f.dist = 0;
    // front starts at the world edge facing -n, travels along +n across the diagonal
    f.max = R * Math.SQRT2 + 400;
    f.ox = R / 2 - f.nx * f.max / 2;   // origin point of the front line
    f.oy = R / 2 - f.ny * f.max / 2;
    this.flareCount++;
    this.emit(`flare front #${this.flareCount} — burn line sweeping the sector`, 'warn');
  }
  // signed projection of point along flare normal, relative to front origin
  frontProj(x, y) { const f = this.flare; return (x - f.ox) * f.nx + (y - f.oy) * f.ny; }

  update(dt, probes, onProbeBurn) {
    this.time += dt;
    for (const a of this.asteroids) { a.rot += a.spin * dt; if (a.scorch > 0) a.scorch -= dt * 0.2; }

    // comets
    this.cometT -= dt;
    if (this.cometT <= 0) {
      this.cometT = CFG.COMET_MIN + this.rng() * (CFG.COMET_MAX - CFG.COMET_MIN);
      this.sendComet(300 + this.rng() * (this.R - 600), 300 + this.rng() * (this.R - 600));
    }
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i];
      c.x += c.vx * dt; c.y += c.vy * dt; c.t += dt;
      const dx = c.tx - c.x, dy = c.ty - c.y;
      if (dx * dx + dy * dy < 3600) {
        const a = this._addAsteroid(c.tx, c.ty, false, 1.25);
        this.comets.splice(i, 1);
        if (this.onCometLand) this.onCometLand(a);
      }
    }

    // flare state machine
    const f = this.flare;
    if (f.phase === 'idle') {
      f.t -= dt;
      if (f.t <= 0) this._startWarn();
    } else if (f.phase === 'warn') {
      f.t -= dt;
      if (f.t <= 0) this._startSweep();
    } else if (f.phase === 'sweep') {
      f.dist += CFG.FLARE_SPEED * dt;
      // burn probes the front passes this frame
      const band = CFG.FLARE_SPEED * dt;
      for (let i = probes.length - 1; i >= 0; i--) {
        const p = probes[i];
        if (p.dead || p._flareMark === this.flareCount) continue;   // one hit per flare
        const pr = this.frontProj(p.x, p.y);
        if (pr <= f.dist && pr > f.dist - band - 40) {
          p._flareMark = this.flareCount;
          if (p.ph.shield < f.kill) onProbeBurn(p, i);
          else { p.vx += f.nx * 70; p.vy += f.ny * 70; p.energy = Math.max(1, p.energy - 8); }
        }
      }
      // scorch asteroids at the front (visual)
      if ((this._scorchT = (this._scorchT || 0) + dt) > 0.12) {
        this._scorchT = 0;
        for (const a of this.asteroids) {
          const pr = this.frontProj(a.x, a.y);
          if (Math.abs(pr - f.dist) < 200) a.scorch = 1;
        }
      }
      if (f.dist > f.max) {
        f.phase = 'idle';
        f.t = CFG.FLARE_MIN + this.rng() * (CFG.FLARE_MAX - CFG.FLARE_MIN);
        this.emit('flare passed — the quiet returns', '');
      }
    }
  }
}
