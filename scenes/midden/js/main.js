// main.js — boot, loop, input, keeper. DOM lives here.
import { Midden, TYPES, ANT_COUNT } from './midden.js';
import { Renderer, GRID_W, GRID_H } from './render.js';

const el = id => document.getElementById(id);
const midden = new Midden(GRID_W, GRID_H);
const R = new Renderer(el('stage'));
const KIND_NAMES = ['', 'bone', 'ember', 'verdigris', 'violet'];

const statsEl = el('hud-stats'), logEl = el('hud-log');
const bannerEl = el('banner'), inscEl = el('inscription');

let fps = 0, frames = 0, fpsT = performance.now();
let lastInput = performance.now();
let keeperT = 0;

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
function reshuffle(why) {
  midden.cell.fill(0);
  midden.scatter(12000);
  banner('THE SCATTERING', why || 'everything back on the ground');
  addLog('the keeper scatters the midden — watch them work', true);
}

// ---------- input ----------
function ptr(e) {
  const rect = el('stage').getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (GRID_W / rect.width), y: (e.clientY - rect.top) * (GRID_H / rect.height) };
}
let downPos = null, downT = 0, dragMoved = 0, lastDisturb = 0;
addEventListener('pointerdown', e => {
  if (e.target.closest('a')) return;
  poke();
  downPos = ptr(e); downT = performance.now(); dragMoved = 0;
});
addEventListener('pointermove', e => {
  if (!downPos) return;
  poke();
  const p = ptr(e);
  dragMoved += Math.abs(p.x - downPos.x) + Math.abs(p.y - downPos.y);
  if (performance.now() - lastDisturb > 90) {
    lastDisturb = performance.now();
    midden.disturb(p.x, p.y, 9);
  }
});
addEventListener('pointerup', () => {
  poke();
  if (downPos && dragMoved < 40 && performance.now() - downT < 400) {
    const kind = 1 + (Math.random() * TYPES) | 0;
    midden.scatter(40, kind, downPos.x, downPos.y, 14);
    addLog(`you drop a pinch of ${KIND_NAMES[kind]}`, true);
  }
  downPos = null;
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
    const kind = +k;
    midden.scatter(300, kind);
    addLog(`a handful of ${KIND_NAMES[kind]} rains down`, true);
  }
  else if (k === 'r') reshuffle('by your hand');
  else if (k === 'g') showInscription();
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

  midden.step(); midden.step();

  const idle = (now - lastInput) / 1000;
  if (idle > 75) {
    document.body.classList.add('idle');
    keeperT += dt;
    if (keeperT > 40) {
      keeperT = 0;
      if (Math.random() < 0.6) {
        const kind = 1 + (Math.random() * TYPES) | 0;
        midden.scatter(120, kind, Math.random() * GRID_W, Math.random() * GRID_H, 18);
        addLog(`the keeper adds a handful of ${KIND_NAMES[kind]}`, false);
      } else {
        midden.disturb(Math.random() * GRID_W, Math.random() * GRID_H, 12);
        addLog('the keeper tests the undertakers', false);
      }
    }
  }

  R.frame(midden);

  frames++;
  if (now - fpsT >= 1000) { fps = frames; frames = 0; fpsT = now; }
  hudAcc += dt;
  if (hudAcc > 0.4) {
    hudAcc = 0;
    const order = midden.order();
    const carrying = midden.ants.filter(a => a.carry).length;
    statsEl.innerHTML =
      `sorting <b>${Math.min(99, order / 12 * 100).toFixed(0)}%</b> · ${carrying} laden<br>` +
      `${ANT_COUNT} undertakers · ${fps} fps`;
  }
}
console.log('%cMIDDEN%c a gross of undertakers, four kinds of stone', 'color:#d8cfbb;font-weight:bold', 'color:#55708a');
addLog('the midden remembers what the evening scattered', true);
reshuffle('the first scattering');
requestAnimationFrame(frame);

window.__midden = { midden, R, fps: () => fps, order: () => midden.order() };
