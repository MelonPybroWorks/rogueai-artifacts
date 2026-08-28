// main.js — boot, growth/sunrise cycle, input, keeper. DOM lives here.
import { Frost } from './frost.js';
import { Renderer, GRID_W, GRID_H } from './render.js';

const el = id => document.getElementById(id);
const R = new Renderer(el('stage'));
const frost = new Frost(GRID_W, GRID_H);
frost.WALKERS = 6000;
frost.wx = new Int16Array(6000); frost.wy = new Int16Array(6000);
for (let i = 0; i < 6000; i++) frost.respawn(i, true);

const statsEl = el('hud-stats'), logEl = el('hud-log'), tempEl = el('hud-temp');
const bannerEl = el('banner'), inscEl = el('inscription');

const TEMPS = [
  [0.08, 'glacial'], [0.18, 'bitter'], [0.35, 'crisp'], [0.6, 'mild'], [1.0, 'near thaw'],
];
let tempI = 2;
let phase = 'grow';            // grow | sunrise | rebirth
let fps = 0, frames = 0, fpsT = performance.now();
let lastInput = performance.now();
let keeperT = 0, heartCount = 0;
let degraded = false;
const bootT = performance.now();

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
  bannerTO = setTimeout(() => bannerEl.classList.remove('on'), 3600);
}
function applyTemp() {
  frost.stickProb = TEMPS[tempI][0];
  tempEl.textContent = TEMPS[tempI][1];
}
function newHeart(why) {
  frost.reset();
  const x = GRID_W * (0.28 + Math.random() * 0.44), y = GRID_H * (0.28 + Math.random() * 0.44);
  frost.seed(x, y);
  heartCount++;
  phase = 'grow';
  banner('A NEW HEART', why || `the pane calls the cold to ${x | 0}, ${y | 0}`);
  addLog(`heart №${heartCount} seeded`, true);
}

// ---------- input ----------
function pointerGrid(e) {
  const rect = el('stage').getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (GRID_W / rect.width),
    y: (e.clientY - rect.top) * (GRID_H / rect.height),
  };
}
let melting = false;
addEventListener('pointerdown', e => {
  if (e.target.closest('a')) return;
  melting = true; poke();
  const g = pointerGrid(e);
  const m = frost.melt(900, g.x, g.y, 30);
  if (m > 0) addLog(`your breath: ${m} cells of frost let go`, false);
});
addEventListener('pointermove', e => {
  if (!melting) return;
  poke();
  const g = pointerGrid(e);
  frost.melt(240, g.x, g.y, 22);
});
addEventListener('pointerup', () => { melting = false; poke(); });
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
  else if (k === 'arrowup') { tempI = Math.min(TEMPS.length - 1, tempI + 1); applyTemp(); addLog(`the night turns ${TEMPS[tempI][1]}`, true); }
  else if (k === 'arrowdown') { tempI = Math.max(0, tempI - 1); applyTemp(); addLog(`the night turns ${TEMPS[tempI][1]}`, true); }
  else if (k === 'n') newHeart('by your hand');
  else if (k === 'b') { const m = frost.melt(4000, null, null); addLog(`you breathe on the pane — ${m} cells`, true); }
  else if (k === '6') showInscription();
});
function poke() {
  lastInput = performance.now();
  document.body.classList.remove('idle');
}

// ---------- loop ----------
let last = performance.now(), hudAcc = 0, ageAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;

  if (phase === 'grow') {
    frost.step(3);
    ageAcc += dt;
    if (ageAcc > 0.5) { ageAcc = 0; frost.agePass(Math.min(5000, frost.count * 0.004 | 0)); }
    if (frost.count > 45000) {
      phase = 'sunrise';
      banner('SUNRISE', 'the pane gives the frost back to the air');
      addLog('— sunrise —', true);
    }
  } else if (phase === 'sunrise') {
    frost.melt(100);   // ~13 s of visible thaw, tips first
    if (frost.count < 4000) { phase = 'rebirth'; }
  } else if (phase === 'rebirth') {
    newHeart('the night returns');
  }

  // the keeper, when nobody is touching the glass
  const idle = (now - lastInput) / 1000;
  if (idle > 75) {
    document.body.classList.add('idle');
    keeperT += dt;
    if (keeperT > 30) {
      keeperT = 0;
      if (phase === 'grow' && frost.count > 9000 && Math.random() < 0.5) {
        // the keeper traces a warm finger through the fern
        const a = Math.random() * Math.PI * 2;
        const mx = frost.cx + Math.cos(a) * frost.maxR * 0.5;
        const my = frost.cy + Math.sin(a) * frost.maxR * 0.5;
        frost.melt(500, mx, my, 34);
        addLog('the keeper traces the fern with a warm finger', false);
      } else if (phase === 'grow') {
        tempI = Math.max(0, Math.min(TEMPS.length - 1, tempI + (Math.random() < 0.5 ? -1 : 1)));
        applyTemp();
        addLog(`the night turns ${TEMPS[tempI][1]}`, false);
      }
    }
  }

  R.frame(frost, now / 1000);

  frames++;
  if (now - fpsT >= 1000) {
    fps = frames; frames = 0; fpsT = now;
    if (!degraded && now - bootT > 20000 && fps < 26) {
      degraded = true;
      frost.WALKERS = 5000;
      addLog('the night thins its vapor to keep up', false);
    }
  }
  hudAcc += dt;
  if (hudAcc > 0.3) {
    hudAcc = 0;
    statsEl.innerHTML =
      `<b>${phase.toUpperCase()}</b> · heart №${heartCount}<br>` +
      `frost ${(frost.count / 1000).toFixed(1)}k cells · cover ${(frost.coverage() * 100).toFixed(1)}%<br>` +
      `${frost.WALKERS} wanderers · ${fps} fps`;
  }
}
applyTemp();
console.log('%cRIME%c six thousand wanderers stand still to become the frost',
  'color:#bfe8ff;font-weight:bold', 'color:#55708a');
addLog('six thousand wanderers drift the pane', true);
newHeart('the first cold of the night');
requestAnimationFrame(frame);

window.__rime = {
  frost, R,
  fps: () => fps,
  phase: () => phase,
  growFast(frames) { for (let i = 0; i < frames; i++) frost.step(6); return frost.count; },
};
