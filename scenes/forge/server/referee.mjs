// referee.mjs — the Forge Spirit. Judges recipes: plausibility + invented stats.
// Backend 1: pollinations.ai anonymous text endpoint (public, keyless).
// Backend 2: procedural fallback (material-tier rules) — always available.
// Both produce the same normalized itemDef; server clamps by material value.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CACHE_FILE = new URL('./recipes.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let cache = {};
try { cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8')); } catch { cache = {}; }
function saveCache() {
  try { writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1)); } catch {}
}

const TIERS = { wood: 1, stone: 1.6, fiber: 1.2, crystal: 6 };
const CAPS = {
  dmg: v => Math.min(30, 2 + v * 1.1),
  range: v => Math.min(120, 26 + v * 3),
  gather: v => Math.min(4, 1 + v * 0.12),
  speed: v => Math.min(28, v * 0.9),
  heal: v => Math.min(60, v * 2.2),
  hp: v => Math.min(420, 40 + v * 15),       // building hp
  radius: v => Math.min(140, 40 + v * 3.5),  // auras
  per: v => Math.min(5, Math.max(0, v * 0.07)), // production / 5s tick
};

export function recipeHash(name, ings) {
  const key = Object.entries(ings).filter(([, n]) => n > 0).sort().map(([r, n]) => `${r}:${n}`).join('|');
  return createHash('sha1').update(name.toLowerCase().trim() + '|' + key).digest('hex').slice(0, 16);
}

export function matValue(ings) {
  return Object.entries(ings).reduce((s, [r, n]) => s + (TIERS[r] || 1) * n, 0);
}

// ---------- normalization + clamping (the anti-godsword wall) ----------
export function normalize(raw, ings, backend, flavor) {
  const v = matValue(ings);
  const p = Math.max(0, Math.min(1, +raw.plausibility || 0));
  const kind = ['weapon', 'tool', 'wearable', 'consumable', 'building'].includes(raw.kind) ? raw.kind : 'tool';
  const st = raw.stats || {};
  const scale = 0.5 + 0.5 * p;
  const stats = {};
  for (const k of Object.keys(CAPS)) {
    let val = +st[k] || 0;
    if (val > 0) stats[k] = Math.round(Math.min(val, CAPS[k](v)) * scale * 10) / 10;
  }
  if (kind === 'building') {
    if (!stats.hp) stats.hp = Math.round(CAPS.hp(v) * scale);
    if (st.prod && TIERS[st.prod]) stats.prod = st.prod;
    if (stats.per == null && stats.prod) stats.per = Math.round(CAPS.per(v) * scale * 10) / 10;
  }
  return {
    name: String(raw.name || 'unnamed').slice(0, 40),
    ok: !!raw.ok && p >= 0.42,
    plausibility: Math.round(p * 100) / 100,
    kind, stats,
    emoji: String(raw.emoji || '🔧').slice(0, 4),
    desc: String(raw.desc || '').slice(0, 140),
    value: Math.round(v),
    backend, flavor,
  };
}

// ---------- pollinations (public anonymous tier; may 402 under budget) ----------
function promptFor(name, ings) {
  const list = Object.entries(ings).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${r}`).join(', ');
  return `You are the Forge Spirit, item judge of a multiplayer crafting game.
Recipe: ${list}. Desired item name: "${name}".
Judge harshly: stats must match the materials — wood and stone cannot make legendary weapons; buildings need plenty of material; crystal is rare and magical; fiber suits wearables and bows; food needs fiber.
Reply with ONLY minified JSON, no prose:
{"ok":true,"plausibility":0.0-1.0,"kind":"weapon|tool|wearable|consumable|building","emoji":"one emoji","desc":"<=90 chars, witty","stats":{"dmg":0-30,"range":20-120,"gather":1-4,"speed":0-28,"heal":0-60,"hp":0-420,"radius":0-140,"prod":"wood|stone|fiber|crystal or omit","per":0-5}}
Set ok=false if the materials cannot possibly make this thing.`;
}

async function judgeWithPollinations(name, ings, timeoutMs = 12000) {
  const url = 'https://text.pollinations.ai/' + encodeURIComponent(promptFor(name, ings)) + '?model=openai-fast';
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'forge-game/1.0' } });
    const text = await res.text();
    if (!res.ok || text.includes('"error"')) throw new Error('llm ' + res.status);
    // extract first balanced {...}
    const start = text.indexOf('{');
    if (start < 0) throw new Error('no json');
    let depth = 0, end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) throw new Error('unbalanced');
    return JSON.parse(text.slice(start, end + 1));
  } finally { clearTimeout(to); }
}

// ---------- procedural Forge Spirit (always on) ----------
const KW = [
  [/\b(pick|pickaxe|shovel|hoe|saw|tool|chisel|drill)\b/i, 'tool', ['wood', 'stone']],
  [/\b(sword|blade|axe|spear|dagger|maul|maul|hammer|pike|whip|scythe|lance)\b/i, 'weapon', ['wood', 'stone']],
  [/\b(bow|sling|wand|staff|rod|scepter)\b/i, 'weapon', ['wood', 'crystal']],
  [/\b(wall|gate|fence|barrier|rampart)\b/i, 'building', ['stone']],
  [/\b(house|hut|home|tent|lodge|cabin|hall|nest|shrine)\b/i, 'building', ['wood']],
  [/\b(farm|garden|field|orchard|sprinkler)\b/i, 'building', ['fiber', 'wood']],
  [/\b(turret|tower|ballista|cannon|watchtower|lantern)\b/i, 'building', ['stone', 'crystal']],
  [/\b(totem|idol|altar|obelisk|monolith)\b/i, 'building', ['stone', 'crystal']],
  [/\b(potion|brew|stew|soup|tea|salve|meal|pie|bread|tonic|bandage|elixir|medkit)\b/i, 'consumable', ['fiber']],
  [/\b(cloak|boots|sandals|amulet|ring|charm|robe|hat|crown|armor|shield)\b/i, 'wearable', ['fiber', 'crystal']],
];
const FLAVOR = [
  'the spirit hums: "it will hold."',
  '"serviceable," mutters the forge.',
  '"i have seen worse," the anvil admits.',
  'the sparks spell a cautious yes.',
  '"it lacks grandeur. it will do."',
];

function judgeProcedural(name, ings, rngSeed) {
  const v = matValue(ings);
  let kind = 'tool', wants = [], kwHit = false;
  for (const [re, k, mats] of KW) if (re.test(name)) { kind = k; wants = mats; kwHit = true; break; }
  if (!kwHit) kind = 'tool';
  // plausibility: do the ingredients include the right material families, and enough of them?
  let p = 0.5;
  const has = r => (ings[r] || 0) > 0;
  if (wants.length) p += wants.filter(has).length * 0.18;
  if (kind === 'building') p += v >= 10 ? 0.15 : v >= 5 ? 0 : -0.28;
  if (/legendary|god|infinity|infinite|excalibur|divine|ultimate|cosmic/i.test(name)) p -= 0.45;
  if (has('crystal') && /wand|staff|crystal|magic|arcane/i.test(name)) p += 0.2;
  p += Math.min(0.15, v * 0.008);
  p = Math.max(0.05, Math.min(0.97, p));
  const roll = (rngSeed % 1000) / 1000;
  const ok = p >= 0.42;
  const stats = {};
  const s = (x) => Math.round(x * 10) / 10;
  if (kind === 'weapon') { stats.dmg = s(3 + v * 0.55 + roll * 2); stats.range = s(30 + v * 1.4); }
  else if (kind === 'tool') { stats.gather = s(Math.min(4, 1 + v * 0.07)); }
  else if (kind === 'consumable') { stats.heal = s(8 + v * 1.4); }
  else if (kind === 'wearable') { stats.speed = s(Math.min(26, 3 + v * 0.5)); }
  else if (kind === 'building') {
    stats.hp = Math.round(30 + v * 8);
    if (/farm|garden|field|orchard/i.test(name)) { stats.prod = has('fiber') ? 'fiber' : 'wood'; stats.per = s(Math.min(4, 0.5 + v * 0.05)); }
    if (/turret|tower|ballista|cannon/i.test(name)) { stats.dmg = s(2 + v * 0.3); stats.range = s(60 + v * 2); }
    if (/totem|shrine|idol|altar|obelisk/i.test(name)) { stats.radius = Math.round(60 + v * 1.5); }
  }
  const emoji = { weapon: '⚔️', tool: '⛏️', wearable: '🧿', consumable: '🧪', building: '🏛️' }[kind];
  return {
    ok, plausibility: p, kind, emoji, name,
    desc: ok ? FLAVOR[rngSeed % FLAVOR.length] : 'the materials whisper: "we cannot become this."',
    stats,
  };
}

// ---------- public API ----------
let llmAvailable = true;   // flips off after repeated failures; retried slowly
let llmRetryAt = 0;
let llmBusy = Promise.resolve();

export async function judge(name, ings) {
  const hash = recipeHash(name, ings);
  if (cache[hash]) return { ...cache[hash], cached: true };

  const seed = parseInt(hash.slice(0, 8), 16);
  let raw = null, backend = 'old-rules', flavor = '📜';

  if (llmAvailable && Date.now() > llmRetryAt) {
    // serialize LLM calls (politeness to the public endpoint)
    llmBusy = llmBusy.then(async () => {
      try {
        raw = await judgeWithPollinations(name, ings);
        backend = 'forge-spirit'; flavor = '⚡';
        llmAvailable = true;
      } catch (e) {
        llmRetryAt = Date.now() + 45000;         // back off 45s
        raw = null;
      }
      await new Promise(r => setTimeout(r, 1200)); // spacing
    });
    await llmBusy;
  }
  if (!raw) raw = judgeProcedural(name, ings, seed);

  raw.name = raw.name || name;
  const item = normalize(raw, ings, backend, flavor);
  cache[hash] = item;
  if (Object.keys(cache).length % 10 === 0) saveCache();
  return item;
}

export function cacheSize() { return Object.keys(cache).length; }
export function cacheDump() {
  return Object.values(cache).map(i => ({
    name: i.name, emoji: i.emoji, kind: i.kind, ok: i.ok,
    plausibility: i.plausibility, stats: i.stats, desc: i.desc,
    backend: i.backend, value: i.value,
  }));
}
export { saveCache };
