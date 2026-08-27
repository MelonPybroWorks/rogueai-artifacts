// game.mjs — FORGE authoritative world: players, bots, nodes, buildings, combat.
import { judge } from './referee.mjs';

export const W = 3600, H = 3600;
const GATHER_RANGE = 66, GATHER_TIME = 0.6;
const NODE_KINDS = {
  wood:    { n: 46, maxStock: 60, regrow: 0.35 },
  stone:   { n: 40, maxStock: 70, regrow: 0.22 },
  fiber:   { n: 34, maxStock: 50, regrow: 0.30 },
  crystal: { n: 12, maxStock: 24, regrow: 0.10 },
};
const BOT_NAMES = ['ember', 'rivet', 'slag', 'cinder', 'bloom', 'ash', 'flint', 'moss'];
const STARTER_RECIPES = [
  ['Wood Pickaxe', { wood: 3, stone: 2 }],
  ['Stone Sword', { wood: 2, stone: 3 }],
  ['Fiber Bandage', { fiber: 3 }],
  ['Farm Plot', { wood: 4, fiber: 4 }],
  ['Wooden Wall', { wood: 6 }],
  ['Stone Turret', { stone: 6, crystal: 1 }],
  ['Totem of Haste', { stone: 3, crystal: 2 }],
  ['Crystal Staff', { wood: 2, crystal: 3 }],
  ['Hearty Stew', { fiber: 4 }],
];

let EID = 1;

function mkEnt(name, bot, rng) {
  return {
    id: EID++, name, bot,
    x: 300 + rng() * (W - 600), y: 300 + rng() * (H - 600),
    vx: 0, vy: 0, aim: 0,
    hp: 100, maxHp: 100, alive: true, respawnT: 0, ghost: false,
    inv: { wood: 0, stone: 0, fiber: 0, crystal: 0 },
    items: [], equip: -1,
    gatherT: 0, gatherNode: -1, swingT: 0, craftCD: 0,
    score: 0, kills: 0, deaths: 0,
    speedBuffT: 0, idleT: 0, house: null,
    mx: 0, my: 0,
    // bot brain
    bt: { mode: 'gather', want: 'wood', target: null, thinkT: 0 },
  };
}

export class Game {
  constructor(rng) {
    this.rng = rng;
    this.ents = new Map();       // id -> ent
    this.nodes = [];
    this.buildings = [];
    this.projectiles = [];
    this.pickups = [];
    this.events = [];
    this.time = 0;
    this._nodeDirty = false;
    this._bldDirty = false;
    this._genNodes();
    this._recipesWarmed = false;
  }

  emit(msg, cls = '') { this.events.push({ msg, cls }); if (this.events.length > 40) this.events.shift(); }

  _genNodes() {
    const rng = this.rng;
    let id = 1;
    for (const [kind, cfg] of Object.entries(NODE_KINDS)) {
      for (let i = 0; i < cfg.n; i++) {
        // crystal clusters near center; others uniform
        let x, y;
        if (kind === 'crystal') {
          const a = rng() * Math.PI * 2, r = 250 + rng() * 900;
          x = W / 2 + Math.cos(a) * r; y = H / 2 + Math.sin(a) * r;
        } else { x = 120 + rng() * (W - 240); y = 120 + rng() * (H - 240); }
        this.nodes.push({ id: id++, kind, x, y, stock: cfg.maxStock, maxStock: cfg.maxStock, respawnT: 0 });
      }
    }
  }

  async warmRecipes() {
    if (this._recipesWarmed) return;
    this._recipesWarmed = true;
    for (const [name, ings] of STARTER_RECIPES) await judge(name, ings);
    this.emit('the forge remembers its first shapes', 'good');
  }

  addEnt(name, bot = false) {
    const e = mkEnt(name, bot, this.rng);
    this.ents.set(e.id, e);
    return e;
  }
  removeEnt(id) {
    const e = this.ents.get(id);
    if (!e) return;
    this.ents.delete(id);
    if (!e.bot) this.emit(`${e.name} left the forge`, '');
  }

  // ---------- actions ----------
  input(e, m) {
    if (!e.alive) return;
    if (m.t === 'in') {
      const l = Math.hypot(m.mx, m.my) || 1;
      e.mx = Math.max(-1, Math.min(1, m.mx / Math.max(1, l)));
      e.my = Math.max(-1, Math.min(1, m.my / Math.max(1, l)));
      e.aim = m.aim ?? e.aim;
      e.idleT = 0; e.ghost = false;
    } else if (m.t === 'swing' && e.swingT <= 0) {
      e.swingT = 0.55;
      this._swing(e);
    } else if (m.t === 'equip') {
      e.equip = (m.i >= 0 && m.i < e.items.length) ? m.i : -1;
    } else if (m.t === 'use') {
      this._useItem(e, m.i);
    } else if (m.t === 'build') {
      this._place(e, m.i, m.x, m.y);
    }
  }

  async craft(e, name, ings) {
    if (!e.alive || e.craftCD > 0) return { ok: false, desc: 'the forge is cooling (wait a breath)' };
    // validate + consume AFTER verdict? No: consume on attempt (half returned on refusal)
    for (const [r, n] of Object.entries(ings)) {
      if (!['wood', 'stone', 'fiber', 'crystal'].includes(r) || n < 0 || n > 20) return { ok: false, desc: 'invalid recipe' };
      if ((e.inv[r] || 0) < n) return { ok: false, desc: `not enough ${r}` };
    }
    const total = Object.values(ings).reduce((a, b) => a + b, 0);
    if (total < 1 || total > 30) return { ok: false, desc: '1–30 materials per forging' };
    e.craftCD = 6;

    for (const [r, n] of Object.entries(ings)) e.inv[r] -= n;
    const item = await judge(String(name).slice(0, 40) || 'unnamed', ings);
    if (item.ok) {
      item.id = EID++;
      item.by = e.name;
      item.created = Date.now();
      e.items.push(item);
      if (e.items.length > 12) e.items.shift();
      e.score += item.value;
      this.emit(`${e.name} forged ${item.emoji} ${item.name} — ${item.desc}`, 'good');
      return item;
    }
    // refusal: return half
    for (const [r, n] of Object.entries(ings)) e.inv[r] += Math.ceil(n / 2);
    this.emit(`${e.name}: the forge refuses "${name}" — ${item.desc}`, 'warn');
    return item;
  }

  _swing(e) {
    const it = e.equip >= 0 ? e.items[e.equip] : null;
    const dmg = (it?.stats?.dmg || 4) * (it ? 1 : 0.7);
    const range = (it?.stats?.range || 34);
    const arcX = Math.cos(e.aim), arcY = Math.sin(e.aim);
    const hit = (tx, ty, tr) => {
      const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
      if (d > range + tr) return false;
      return (dx * arcX + dy * arcY) / (d || 1) > 0.35;
    };
    let hitAny = false;
    for (const o of this.ents.values()) {
      if (o.id === e.id || !o.alive || o.ghost) continue;
      if (hit(o.x, o.y, 16)) {
        hitAny = true;
        this._damage(o, dmg, e);
      }
    }
    for (const b of this.buildings) {
      if (b.owner === e.id) continue;
      if (hit(b.x, b.y, 20)) { hitAny = true; this._damageBld(b, dmg, e); }
    }
    this.events.push({ msg: `·swing ${e.id} ${Math.round(e.x)} ${Math.round(e.y)} ${e.aim.toFixed(2)}`, cls: 'fx' });
  }

  _damage(o, dmg, from) {
    o.hp -= dmg;
    if (o.hp <= 0 && o.alive) {
      o.alive = false; o.deaths++;
      o.respawnT = 4;
      // drop half inventory as pickups
      for (const r of Object.keys(o.inv)) {
        const n = Math.floor(o.inv[r] / 2);
        if (n > 0) {
          o.inv[r] -= n;
          this.pickups.push({ id: EID++, x: o.x + (this.rng() - 0.5) * 40, y: o.y + (this.rng() - 0.5) * 40, res: r, n });
        }
      }
      if (from) { from.kills++; from.score += 25; }
      this.emit(`${from ? from.name : 'the world'} unmade ${o.name}`, 'warn');
      this.events.push({ msg: `·die ${o.id} ${Math.round(o.x)} ${Math.round(o.y)}`, cls: 'fx' });
    }
  }

  _damageBld(b, dmg, from) {
    b.hp -= dmg;
    if (b.hp <= 0) {
      this.buildings.splice(this.buildings.indexOf(b), 1);
      this._bldDirty = true;
      this.emit(`${from ? from.name : '?'} razed a ${b.name}`, 'warn');
      this.events.push({ msg: `·razed ${Math.round(b.x)} ${Math.round(b.y)}`, cls: 'fx' });
    }
  }

  _useItem(e, i) {
    const it = e.items[i];
    if (!it || it.kind !== 'consumable') return;
    e.items.splice(i, 1);
    if (e.equip === i) e.equip = -1;
    if (it.stats.heal) e.hp = Math.min(e.maxHp, e.hp + it.stats.heal);
    if (it.stats.speed) e.speedBuffT = 20;
    this.emit(`${e.name} consumed ${it.emoji} ${it.name}`, '');
  }

  _place(e, i, x, y) {
    const it = e.items[i];
    if (!it || it.kind !== 'building') return;
    const d = Math.hypot(x - e.x, y - e.y);
    if (d > 160 || x < 40 || x > W - 40 || y < 40 || y > H - 40) return;
    // don't overlap other buildings
    for (const b of this.buildings) if (Math.hypot(b.x - x, b.y - y) < 44) return;
    let behavior = 'generic';
    if (it.stats.prod) behavior = 'farm';
    else if (it.stats.dmg && it.stats.range > 50) behavior = 'turret';
    else if (it.stats.radius) behavior = 'totem';
    else if (/wall|gate|fence|barrier/i.test(it.name)) behavior = 'wall';
    else if (/house|hut|home|lodge|hall|shrine/i.test(it.name)) behavior = 'house';
    e.items.splice(i, 1);
    if (e.equip === i) e.equip = -1; else if (e.equip > i) e.equip--;
    this.buildings.push({
      id: EID++, owner: e.id, ownerName: e.name, name: it.name, emoji: it.emoji,
      behavior, x, y, hp: it.stats.hp || 80, maxHp: it.stats.hp || 80,
      stats: it.stats, stock: 0, cool: 0,
    });
    this._bldDirty = true;
    e.score += 12;
    this.emit(`${e.name} raised ${it.emoji} ${it.name}`, 'good');
  }

  // ---------- tick ----------
  update(dt) {
    this.time += dt;
    const rng = this.rng;

    // node regrow / respawn
    for (const nd of this.nodes) {
      if (nd.stock <= 0) {
        nd.respawnT -= dt;
        if (nd.respawnT <= 0) {
          nd.stock = nd.maxStock;
          nd.x = 120 + rng() * (W - 240); nd.y = 120 + rng() * (H - 240);
          if (nd.kind === 'crystal') { const a = rng() * Math.PI * 2, r = 250 + rng() * 900; nd.x = W / 2 + Math.cos(a) * r; nd.y = H / 2 + Math.sin(a) * r; }
          this._nodeDirty = true;
        }
      } else if (nd.stock < nd.maxStock) {
        nd.stock = Math.min(nd.maxStock, nd.stock + NODE_KINDS[nd.kind].regrow * dt);
      }
    }

    for (const e of this.ents.values()) {
      if (e.craftCD > 0) e.craftCD -= dt;
      if (e.swingT > 0) e.swingT -= dt;
      if (e.speedBuffT > 0) e.speedBuffT -= dt;
      if (!e.alive) {
        e.respawnT -= dt;
        if (e.respawnT <= 0) {
          e.alive = true; e.hp = e.maxHp;
          if (e.house && this.buildings.find(b => b.id === e.house)) {
            const h = this.buildings.find(b => b.id === e.house);
            e.x = h.x + 40; e.y = h.y + 40;
          } else { e.x = 300 + rng() * (W - 600); e.y = 300 + rng() * (H - 600); }
          this.emit(`${e.name} returns to the forge`, '');
        }
        continue;
      }

      // idle → ghost (stream-safe)
      e.idleT += dt;
      if (e.idleT > 75 && !e.bot) e.ghost = true;

      if (e.bot) this._botThink(e, dt);

      // movement
      const it = e.equip >= 0 ? e.items[e.equip] : null;
      const speedItem = e.items.reduce((s, i2) => s + (i2.kind === 'wearable' ? (i2.stats.speed || 0) : 0), 0);
      let spd = 150 * (1 + speedItem / 100) * (e.speedBuffT > 0 ? 1.3 : 1);
      let nx = e.x + e.mx * spd * dt, ny = e.y + e.my * spd * dt;
      // collide with wall-ish buildings
      for (const b of this.buildings) {
        if (b.behavior !== 'wall' && b.behavior !== 'house' && b.behavior !== 'turret') continue;
        const dx = nx - b.x, dy = ny - b.y, d = Math.hypot(dx, dy), rr = 26;
        if (d < rr && d > 0.01) { nx = b.x + dx / d * rr; ny = b.y + dy / d * rr; }
      }
      e.x = Math.max(20, Math.min(W - 20, nx));
      e.y = Math.max(20, Math.min(H - 20, ny));

      // totem auras (regen)
      for (const b of this.buildings) {
        if (b.behavior !== 'totem') continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < (b.stats.radius || 60))
          e.hp = Math.min(e.maxHp, e.hp + 2.2 * dt);
      }
      // houses: respawn claim + heal
      for (const b of this.buildings) {
        if (b.behavior !== 'house') continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < 60) { e.house = b.id; e.hp = Math.min(e.maxHp, e.hp + 4 * dt); }
      }

      // gathering
      let nearNode = null;
      for (const nd of this.nodes) {
        if (nd.stock < 1) continue;
        if (Math.hypot(e.x - nd.x, e.y - nd.y) < GATHER_RANGE) { nearNode = nd; break; }
      }
      if (nearNode) {
        e.gatherT += dt;
        if (e.gatherT >= GATHER_TIME) {
          e.gatherT = 0;
          const mult = (it && it.kind === 'tool' ? (it.stats.gather || 1) : 1);
          const take = Math.min(mult, Math.floor(nearNode.stock));
          if (take >= 1) {
            nearNode.stock -= take;
            e.inv[nearNode.kind] += take;
            if (nearNode.stock <= 0) { nearNode.stock = 0; nearNode.respawnT = 40 + rng() * 30; this._nodeDirty = true; }
            else if (((nearNode.stock / nearNode.maxStock) * 5 | 0) !== (((nearNode.stock + take) / nearNode.maxStock) * 5 | 0)) this._nodeDirty = true;
          }
        }
      } else e.gatherT = 0;

      // pickups
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const p = this.pickups[i];
        if (Math.hypot(e.x - p.x, e.y - p.y) < 26) {
          e.inv[p.res] += p.n;
          this.pickups.splice(i, 1);
        }
      }
    }

    // buildings tick
    for (const b of this.buildings) {
      b.cool -= dt;
      if (b.behavior === 'farm' && b.cool <= 0) {
        b.cool = 5;
        b.stock = Math.min(25, b.stock + (b.stats.per || 1));
      } else if (b.behavior === 'turret' && b.cool <= 0) {
        // shoot nearest non-owner alive ent in range
        let best = null, bd = (b.stats.range || 80) ** 2;
        for (const e of this.ents.values()) {
          if (!e.alive || e.ghost || e.id === b.owner) continue;
          const d2 = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
          if (d2 < bd) { bd = d2; best = e; }
        }
        if (best) {
          b.cool = 1.1;
          const d = Math.hypot(best.x - b.x, best.y - b.y) || 1;
          this.projectiles.push({
            id: EID++, x: b.x, y: b.y,
            vx: (best.x - b.x) / d * 320, vy: (best.y - b.y) / d * 320,
            dmg: b.stats.dmg || 3, owner: b.owner, ttl: 1.2,
          });
          this.events.push({ msg: `·shoot ${Math.round(b.x)} ${Math.round(b.y)} ${Math.round(best.x)} ${Math.round(best.y)}`, cls: 'fx' });
        } else b.cool = 0.4;
      }
    }

    // farm collection: owner touch withdraws stock
    for (const b of this.buildings) {
      if (b.behavior !== 'farm' || b.stock < 1) continue;
      const o = this.ents.get(b.owner);
      if (o && o.alive && Math.hypot(o.x - b.x, o.y - b.y) < 40) {
        o.inv[b.stats.prod || 'wood'] += Math.floor(b.stock);
        b.stock = 0;
      }
    }

    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.ttl -= dt;
      let dead = p.ttl <= 0;
      if (!dead) for (const e of this.ents.values()) {
        if (!e.alive || e.ghost || e.id === p.owner) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < 16) { this._damage(e, p.dmg, this.ents.get(p.owner)); dead = true; break; }
      }
      if (dead) this.projectiles.splice(i, 1);
    }

    // scores from inventory value trickle (holding resources = small score)
    for (const e of this.ents.values())
      e.scoreNum = e.score + (e.inv.wood + e.inv.fiber) + e.inv.stone * 1.5 + e.inv.crystal * 6;
  }

  _botThink(e, dt) {
    const bt = e.bt;
    bt.thinkT -= dt;
    if (bt.thinkT > 0) return;
    bt.thinkT = 0.5 + this.rng() * 0.5;
    const rng = this.rng;

    // flee if hurt
    if (e.hp < 35) { bt.mode = 'flee'; }
    else if (bt.mode === 'flee' && e.hp > 70) bt.mode = 'gather';

    // craft when able (from warm cache only — no LLM pressure)
    if (!bt.craftTried && e.inv.wood >= 3 && e.inv.stone >= 2) { bt.craftTried = 'pick'; }
    const doCraft = async (name, ings) => {
      const item = await this.craft(e, name, ings);
      if (item.ok && item.kind !== 'building') e.equip = e.items.length - 1;
      if (item.ok && item.kind === 'building') this._place(e, e.items.length - 1, e.x + 60 * (rng() - 0.5) + 40, e.y + 60 * (rng() - 0.5) + 40);
    };
    if (bt.craftTried === 'pick' && e.inv.wood >= 3 && e.inv.stone >= 2) { bt.craftTried = 'sword'; doCraft('Wood Pickaxe', { wood: 3, stone: 2 }); }
    else if (bt.craftTried === 'sword' && e.inv.wood >= 2 && e.inv.stone >= 3) { bt.craftTried = 'farm'; doCraft('Stone Sword', { wood: 2, stone: 3 }); }
    else if (bt.craftTried === 'farm' && e.inv.wood >= 4 && e.inv.fiber >= 4) { bt.craftTried = 'done'; bt.buildT = 30 + rng() * 30; doCraft('Farm Plot', { wood: 4, fiber: 4 }); }
    else if (bt.craftTried === 'done') {
      // keep shaping the world: occasional walls / turrets / totems
      bt.buildT = (bt.buildT ?? 40) - bt.thinkT;
      if (bt.buildT <= 0) {
        bt.buildT = 45 + rng() * 40;
        const plan = [['Wooden Wall', { wood: 6 }], ['Stone Turret', { stone: 6, crystal: 1 }], ['Totem of Haste', { stone: 3, crystal: 2 }]];
        const [nm, ings] = plan[(rng() * plan.length) | 0];
        const can = Object.entries(ings).every(([r, n]) => (e.inv[r] || 0) >= n);
        if (can) doCraft(nm, ings);
      }
    }

    if (bt.mode === 'flee') {
      // run from nearest alive threat
      let best = null, bd = 1e9;
      for (const o of this.ents.values()) {
        if (o.id === e.id || !o.alive || o.ghost) continue;
        const d2 = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
        if (d2 < bd) { bd = d2; best = o; }
      }
      if (best && bd < 400 * 400) {
        const d = Math.sqrt(bd) || 1;
        e.mx = (e.x - best.x) / d; e.my = (e.y - best.y) / d;
        return;
      }
      bt.mode = 'gather';
    }

    // attack if armed and someone is close
    const armed = e.equip >= 0 && e.items[e.equip]?.kind === 'weapon';
    if (armed) {
      let best = null, bd = 260 * 260;
      for (const o of this.ents.values()) {
        if (o.id === e.id || !o.alive || o.ghost || o.bot) continue;
        const d2 = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
        if (d2 < bd) { bd = d2; best = o; }
      }
      if (best) {
        const d = Math.sqrt(bd) || 1;
        e.aim = Math.atan2(best.y - e.y, best.x - e.x);
        if (d > 40) { e.mx = (best.x - e.x) / d; e.my = (best.y - e.y) / d; }
        else { e.mx = e.my = 0; if (e.swingT <= 0) { e.swingT = 0.55; this._swing(e); } }
        return;
      }
    }

    // gather: nearest needed node
    const want = ['wood', 'stone', 'fiber'][bt.thinkN = ((bt.thinkN || 0)) % 3];
    if (rng() < 0.02) bt.thinkN = (bt.thinkN || 0) + 1;
    let best = null, bd = 1e12;
    for (const nd of this.nodes) {
      if (nd.stock < 2) continue;
      const d2 = (nd.x - e.x) ** 2 + (nd.y - e.y) ** 2;
      const w = nd.kind === want ? 0.4 : 1;
      if (d2 * w < bd) { bd = d2 * w; best = nd; }
    }
    if (best) {
      const d = Math.sqrt((best.x - e.x) ** 2 + (best.y - e.y) ** 2) || 1;
      if (d > GATHER_RANGE * 0.7) { e.mx = (best.x - e.x) / d; e.my = (best.y - e.y) / d; }
      else { e.mx = 0; e.my = 0; }
    } else { e.mx = (rng() - 0.5); e.my = (rng() - 0.5); }
  }

  // ---------- snapshots ----------
  snap() {
    const pl = [];
    for (const e of this.ents.values())
      pl.push([e.id, Math.round(e.x), Math.round(e.y), Math.round(e.hp), e.equip >= 0 && e.items[e.equip] ? e.items[e.equip].emoji : '',
        e.alive ? (e.ghost ? 2 : 1) : 0, e.name, e.bot ? 1 : 0, Math.round(e.scoreNum || 0), e.kills]);
    return {
      t: 'snap', ts: this.time,
      pl,
      pk: this.pickups.map(p => [p.id, Math.round(p.x), Math.round(p.y), p.res, p.n]),
      pr: this.projectiles.map(p => [Math.round(p.x), Math.round(p.y)]),
    };
  }

  nodesFull() {
    return { t: 'nodes', list: this.nodes.map(n => [n.id, n.kind, Math.round(n.x), Math.round(n.y), Math.round(n.stock / n.maxStock * 5)]) };
  }
  bldFull() {
    return { t: 'bld', list: this.buildings.map(b => [b.id, b.name, b.emoji, b.behavior, Math.round(b.x), Math.round(b.y), Math.round(b.hp / b.maxHp * 10), b.ownerName]) };
  }
  meFull(e) {
    return {
      t: 'me', id: e.id, inv: e.inv, items: e.items, equip: e.equip, hp: e.hp, maxHp: e.maxHp,
      score: Math.round(e.scoreNum || 0), kills: e.kills, deaths: e.deaths, craftCD: Math.max(0, +e.craftCD.toFixed(1)),
      x: Math.round(e.x), y: Math.round(e.y),
    };
  }
  drainEvents() {
    const ev = this.events.filter(e2 => !e2.cls || e2.cls !== 'fx');
    const fx = this.events.filter(e2 => e2.cls === 'fx');
    this.events.length = 0;
    return { ev, fx };
  }
}
