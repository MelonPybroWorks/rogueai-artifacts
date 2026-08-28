// main.js — boot, loop, lamp-dragging, keeper, HUD. DOM lives here.
import { Lamps, Vehicle, WIRINGS } from './vehicles.js';
import { Renderer } from './render.js';

const el = id => document.getElementById(id);
const R = new Renderer(el('stage'));
const W = R.W, H = R.H;

const lamps = new Lamps();
for (let i = 0; i < 5; i++) lamps.add(W * (0.2 + Math.random() * 0.6), H * (0.2 + Math.random() * 0.6), i);
const vehicles = [];
for (let i = 0; i < 100; i++) vehicles.push(new Vehicle(Math.random() * W, Math.random() * H, i % 4));

const statsEl = el('hud-stats'), logEl = el('hud-log');
const bannerEl = el('banner'), inscEl = el('inscription');
const TYPE_CLASS = ['fear', 'hunger', 'love', 'wander'];

let fps = 0, frames = 0, fpsT = performance.now();
let lastInput = performance.now();
let keeperT = 0, moultT = 0;

const logs = [];
function addLog(s, hot) {
  logs.push({ s, hot });
  if (logs.length > 6) logs.shift();
  logEl.innerHTML = logs.map(l => `<div class="${l.hot ? 'hot' : ''}">${l.s}</div>`).join('');
}
let bannerTO = 0;
function banner(big, small) {
  bannerEl.querySelector('.b1').textContent = big;
  bannerEl.querySelector('.b2').textContent = small;
  bannerEl.classList.add('on');
  clearTimeout(bannerTO);
  bannerTO = setTimeout(() => bannerEl.classList.remove('on'), 3400);
}
function scatter() {
  lamps.clear();
  const n = 4 + (Math.random() * 3 | 0);
  for (let i = 0; i < n; i++) lamps.add(W * (0.15 + Math.random() * 0.7), H * (0.15 + Math.random() * 0.7), (Math.random() * 4) | 0);
  addLog(`the keeper sets out ${n} lamps`, true);
}

// ---------- input ----------
function ptr(e) {
  const rect = el('stage').getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
}
let held = null, downPos = null, downT = 0, dragMoved = 0;
addEventListener('pointerdown', e => {
  if (e.target.closest('a')) return;
  poke();
  const p = ptr(e);
  downPos = p; downT = performance.now(); dragMoved = 0;
  // grab nearest lamp within 70px
  held = null;
  let bd = 70 * 70;
  for (const l of lamps.list) {
    const d = (l.x - p.x) ** 2 + (l.y - p.y) ** 2;
    if (d < bd) { bd = d; held = l; }
  }
});
addEventListener('pointermove', e => {
  if (!downPos) return;
  poke();
  const p = ptr(e);
  dragMoved += Math.abs(p.x - downPos.x) + Math.abs(p.y - downPos.y);
  if (held) { held.x = Math.max(10, Math.min(W - 10, p.x)); held.y = Math.max(10, Math.min(H - 10, p.y)); }
});
addEventListener('pointerup', e => {
  poke();
  if (downPos && dragMoved < 60 && performance.now() - downT < 400) {
    // a click: new lamp
    lamps.add(Math.max(12, Math.min(W - 12, downPos.x)), Math.max(12, Math.min(H - 12, downPos.y)), (Math.random() * 4) | 0);
    addLog('you set out a lamp', true);
  }
  downPos = null; held = null;
});
addEventListener('contextmenu', e => e.preventDefault());

function showInscription() {
  inscEl.classList.add('on');
  clearTimeout(showInscription.to);
  showInscription.to = setTimeout(() => inscEl.classList.remove('on'), 9000);
}
addEventListener('keydown', e => {
  poke();
  const k = e.key.toLowerCase();
  if (k === 'h') document.body.classList.toggle('nohud');
  else if (k >= '1' && k <= '4') {
    const w = +k - 1;
    for (let i = 0; i < 3; i++) vehicles.push(new Vehicle(W / 2 + (Math.random() - 0.5) * 60, H / 2 + (Math.random() - 0.5) * 60, w));
    addLog(`three more learn ${WIRINGS[w]}`, true);
  }
  else if (k === 'd') { scatter(); banner('THE KEEPER REARRANGES THE LAMPS', 'the field forgets its habits'); }
  else if (k === 'c') { lamps.clear(); addLog('all lamps out — the field goes dark', true); }
  else if (k === 'w') showInscription();
});
function poke() {
  lastInput = performance.now();
  document.body.classList.remove('idle');
}

// ---------- loop ----------
let last = performance.now(), hudAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;

  // lamps drift like slow boats
  for (const l of lamps.list) {
    l.x += Math.sin(now / 21000 + l.hue * 2.1) * 0.08;
    l.y += Math.cos(now / 26000 + l.hue * 1.3) * 0.08;
  }

  for (const v of vehicles) v.step(lamps, W, H);

  // moulting: every so often a vehicle changes its mind about the light
  moultT += dt;
  if (moultT > 55 && vehicles.length) {
    moultT = 0;
    const v = vehicles[(Math.random() * vehicles.length) | 0];
    const nw = (v.wiring + 1 + (Math.random() * 3 | 0)) % 4;
    addLog(`a ${WIRINGS[v.wiring]} learns ${WIRINGS[nw]}`, false);
    v.wiring = nw;
  }

  // the keeper, when idle
  const idle = (now - lastInput) / 1000;
  if (idle > 75) {
    document.body.classList.add('idle');
    keeperT += dt;
    if (keeperT > 40) { keeperT = 0; scatter(); }
  }

  R.frame(lamps, vehicles, now / 1000);

  frames++;
  if (now - fpsT >= 1000) { fps = frames; frames = 0; fpsT = now; }
  hudAcc += dt;
  if (hudAcc > 0.4) {
    hudAcc = 0;
    const counts = [0, 0, 0, 0];
    for (const v of vehicles) counts[v.wiring]++;
    statsEl.innerHTML =
      counts.map((c, i) => `<span class="${TYPE_CLASS[i]}">${WIRINGS[i]} ${c}</span>`).join(' · ') +
      `<br>${lamps.list.length} lamps · ${vehicles.length} vehicles · ${fps} fps`;
  }
}
console.log('%cTAXIS%c four ways to feel about a light', 'color:#ffb347;font-weight:bold', 'color:#55708a');
addLog('the lamps are lit; the vehicles wake', true);
banner('TAXIS', 'four ways to feel about a light');
requestAnimationFrame(frame);

window.__taxis = { lamps, vehicles, R, fps: () => fps, scatter };
