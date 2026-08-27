// hud.js — DOM overlay: inventory, hotbar, leaderboard, log, craft panel, banners
const RES = [['wood', '🌳'], ['stone', '🪨'], ['fiber', '🌾'], ['crystal', '💎']];

export class Hud {
  constructor(net) {
    this.net = net;
    const g = id => document.getElementById(id);
    this.el = {
      score: g('hud-score'), kills: g('hud-kills'), clock: g('hud-clock'), online: g('hud-online'),
      hpfill: g('hpfill'), log: g('hud-log'), inv: g('inv'), hotbar: g('hotbar'),
      banner: g('banner'), death: g('death'), board: g('board'),
    };
    this._t0 = performance.now();
    this._logItems = [];
    this._dirty = true;
    this._bannerT = 0;
    this._me = null;
    this._craftEls();
    this.craftOpen = false;
    this._sel = { wood: 0, stone: 0, fiber: 0, crystal: 0 };
  }

  _craftEls() {
    this.craftEl = document.getElementById('craft');
    this.nameEl = document.getElementById('craft-name');
    this.ingsEl = document.getElementById('ings');
    this.resultEl = document.getElementById('craft-result');
    document.getElementById('craft-close').onclick = () => this.toggleCraft(false);
    document.getElementById('craft-go').onclick = () => this._submitCraft();
    this.ingsEl.innerHTML = RES.map(([r, e]) => `
      <div class="ing" data-r="${r}">
        <span>${e} ${r} <span class="dim" data-have></span></span>
        <span><button data-d="-1">−</button> <span class="n" data-n>0</span> <button data-d="1">+</button></span>
      </div>`).join('');
    for (const row of this.ingsEl.querySelectorAll('.ing')) {
      const r = row.dataset.r;
      row.querySelectorAll('button').forEach(b => b.onclick = () => {
        const cur = this._sel[r];
        const have = this._me ? (this._me.inv[r] || 0) : 0;
        this._sel[r] = Math.max(0, Math.min(have, cur + (+b.dataset.d)));
        row.querySelector('[data-n]').textContent = this._sel[r];
      });
    }
  }

  toggleCraft(force) {
    this.craftOpen = force !== undefined ? force : !this.craftOpen;
    this.craftEl.classList.toggle('hidden', !this.craftOpen);
    if (this.craftOpen) { this.resultEl.innerHTML = ''; setTimeout(() => this.nameEl.focus(), 50); }
  }

  _submitCraft() {
    if (!this._me) return;
    const name = this.nameEl.value.trim();
    if (!name) { this.resultEl.innerHTML = '<span class="no">the forge needs a name.</span>'; return; }
    const total = Object.values(this._sel).reduce((a, b) => a + b, 0);
    if (total < 1) { this.resultEl.innerHTML = '<span class="no">offer at least one material.</span>'; return; }
    this.resultEl.innerHTML = '<span class="dim">the forge spirit deliberates…</span>';
    document.getElementById('craft-go').disabled = true;
    this.net.send({ t: 'craft', name, ings: { ...this._sel } });
    this._sel = { wood: 0, stone: 0, fiber: 0, crystal: 0 };
    for (const row of this.ingsEl.querySelectorAll('.ing')) row.querySelector('[data-n]').textContent = '0';
  }

  craftResult(item) {
    document.getElementById('craft-go').disabled = false;
    if (!item) return;
    const stats = Object.entries(item.stats || {}).filter(([, v]) => v > 0)
      .map(([k, v]) => `${k} ${v}`).join(' · ');
    if (item.ok) {
      this.resultEl.innerHTML =
        `<div class="ok">${item.flavor} ${item.emoji} <b>${item.name}</b> — forged!</div>` +
        `<div class="stats">${stats || 'quiet power'} · plausibility ${item.plausibility}</div>` +
        `<div class="stats">${item.desc}</div>` +
        (item.kind === 'building' ? `<div class="stats">equip it (1–9) and click the ground to place</div>` : '');
      this.banner(`${item.emoji} ${item.name.toUpperCase()}`, 'FORGED');
    } else {
      this.resultEl.innerHTML =
        `<div class="no">${item.flavor || '📜'} the forge refuses.</div><div class="stats">${item.desc} (half your offering returned)</div>`;
    }
  }

  banner(big, small) {
    this.el.banner.innerHTML = '';
    this.el.banner.append(big);
    const s = document.createElement('small'); s.textContent = small;
    this.el.banner.append(s);
    this.el.banner.classList.add('show');
    this._bannerT = 2.6;
  }

  events(list) {
    for (const ev of list) {
      this._logItems.push({ msg: ev.msg, cls: ev.cls, t: performance.now() });
      this._dirty = true;
    }
    while (this._logItems.length > 8) { this._logItems.shift(); this._dirty = true; }
  }

  step(dt, st) {
    const me = this._me;
    // inventory chips
    let invHtml = '';
    for (const [r, e] of RES) invHtml += `<span class="chip">${e} ${me ? me.inv[r] || 0 : 0}</span>`;
    this._html(this.el.inv, invHtml);
    // have-counts in craft panel
    if (this.craftOpen && me)
      for (const row of this.ingsEl.querySelectorAll('.ing'))
        row.querySelector('[data-have]').textContent = `(have ${me.inv[row.dataset.r] || 0})`;

    // hotbar
    if (me) {
      let hb = '';
      me.items.forEach((it, i) => {
        hb += `<div class="slot ${me.equip === i ? 'eq' : ''}" data-i="${i}"><span class="k">${i + 1}</span>${it.emoji}<span class="nm">${it.name}</span></div>`;
      });
      this._html(this.el.hotbar, hb);
      for (const slot of this.el.hotbar.querySelectorAll('.slot'))
        slot.onclick = () => this.net.send({ t: 'equip', i: +slot.dataset.i });
    }

    this._text(this.el.score, String(me ? me.score : 0));
    this._text(this.el.kills, String(me ? me.kills : 0));
    const s = (performance.now() - this._t0) / 1000;
    this._text(this.el.clock, `${String((s / 60) | 0).padStart(2, '0')}:${String((s | 0) % 60).padStart(2, '0')}`);
    this._text(this.el.online, String(st.players.filter(p => !p[7]).length + st.players.filter(p => p[7]).length));
    this.el.hpfill.style.width = me ? Math.max(0, me.hp / me.maxHp * 100) + '%' : '0%';

    // leaderboard (top 6 by score)
    const rows = [...st.players].sort((a, b) => b[8] - a[8]).slice(0, 6);
    let bh = '<div class="hd">SMITHS</div>';
    for (const p of rows) bh += `<div class="${p[0] === st.myId ? 'me' : ''}">${p[6]} ${p[8]}${p[9] ? ' ⚔' + p[9] : ''}</div>`;
    this._html(this.el.board, bh);

    // death overlay
    const dead = me && st.players.find(p => p[0] === st.myId && p[5] === 0);
    this.el.death.classList.toggle('hidden', !dead);

    if (this._bannerT > 0) {
      this._bannerT -= dt;
      if (this._bannerT <= 0) this.el.banner.classList.remove('show');
    }

    const now = performance.now();
    let need = this._dirty;
    for (let i = this._logItems.length - 1; i >= 0; i--) {
      const it = this._logItems[i];
      const age = (now - it.t) / 1000;
      const op = age < 16 ? 1 : Math.max(0, 1 - (age - 16) / 6);
      if (op <= 0) { this._logItems.splice(i, 1); need = true; }
      else if (!it.op || Math.abs(it.op - op) > 0.08) { it.op = op; need = true; }
    }
    if (need) {
      this.el.log.innerHTML = this._logItems
        .map(it => `<div class="ev ${it.cls}" style="opacity:${(it.op ?? 1).toFixed(2)}">${it.msg}</div>`).join('');
      this._dirty = false;
    }
  }

  setMe(me) { this._me = me; }

  _text(el, v) { if (el._v !== v) { el._v = v; el.textContent = v; } }
  _html(el, v) { if (el._h !== v) { el._h = v; el.innerHTML = v; } }
}
