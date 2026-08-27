// hud.js — DOM overlay: population, era banner, event log, sparkline
export class Hud {
  constructor() {
    this.el = {
      pop: document.getElementById('hud-pop'),
      herb: document.getElementById('hud-herb'),
      carn: document.getElementById('hud-carn'),
      era: document.getElementById('hud-era'),
      meteors: document.getElementById('hud-meteors'),
      clock: document.getElementById('hud-clock'),
      log: document.getElementById('hud-log'),
      banner: document.getElementById('banner'),
    };
    this.pc = document.getElementById('popcanvas');
    this.pctx = this.pc.getContext('2d');
    this._logItems = [];
    this._t0 = performance.now();
    this._dirty = true;
    this._bannerT = 0;
    this._lastEra = '';
  }

  drainEvents(life) {
    for (const ev of life.events) {
      this._logItems.push({ msg: ev.msg, cls: ev.cls, t: performance.now() });
      this._dirty = true;
      if (ev.msg.startsWith('— ') && ev.msg.endsWith(' —'))
        this._showBanner(ev.msg.replace(/—/g, '').trim(), 'THE ERA TURNS');
    }
    life.events.length = 0;
    while (this._logItems.length > 7) { this._logItems.shift(); this._dirty = true; }
  }

  _showBanner(big, small) {
    this.el.banner.textContent = '';
    this.el.banner.append(big);
    const s = document.createElement('small'); s.textContent = small;
    this.el.banner.append(s);
    this.el.banner.classList.add('show');
    this._bannerT = 3.2;
  }

  step(dt, life) {
    const s = life.stats();
    this._text(this.el.pop, String(s.total));
    this._text(this.el.herb, String(s.herb));
    this._text(this.el.carn, String(s.carn));
    this._text(this.el.era, life.era);
    this._text(this.el.meteors, String(life.meteors));
    const t = (performance.now() - this._t0) / 1000;
    this._text(this.el.clock, `${String((t / 60) | 0).padStart(2, '0')}:${String((t | 0) % 60).padStart(2, '0')}`);

    if (this._bannerT > 0) {
      this._bannerT -= dt;
      if (this._bannerT <= 0) this.el.banner.classList.remove('show');
    }

    const now = performance.now();
    let need = this._dirty;
    for (let i = this._logItems.length - 1; i >= 0; i--) {
      const it = this._logItems[i];
      const age = (now - it.t) / 1000;
      const op = age < 14 ? 1 : Math.max(0, 1 - (age - 14) / 6);
      if (op <= 0) { this._logItems.splice(i, 1); need = true; }
      else if (!it.op || Math.abs(it.op - op) > 0.08) { it.op = op; need = true; }
    }
    if (need) {
      this.el.log.innerHTML = this._logItems
        .map(it => `<div class="ev ${it.cls}" style="opacity:${(it.op ?? 1).toFixed(2)}">${it.msg}</div>`)
        .join('');
      this._dirty = false;
    }

    this._drawSpark(life.popHist);
  }

  _drawSpark(hist) {
    if (hist.length < 2) return;
    const c = this.pctx, W = this.pc.width, H = this.pc.height;
    c.clearRect(0, 0, W, H);
    const max = Math.max(40, ...hist);
    c.beginPath();
    hist.forEach((v, i) => {
      const x = (i / (hist.length - 1)) * W;
      const y = H - 3 - (v / max) * (H - 8);
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    });
    c.strokeStyle = 'rgba(159,224,138,0.8)'; c.lineWidth = 1.2; c.stroke();
    c.lineTo(W, H); c.lineTo(0, H); c.closePath();
    c.fillStyle = 'rgba(159,224,138,0.10)'; c.fill();
  }

  _text(el, v) { if (el._v !== v) { el._v = v; el.textContent = v; } }
}
