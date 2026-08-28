// main.js — boot, foam lifecycle (grow → set → cascade), input, keeper. DOM lives here.
import { Foam } from './foam.js';
import { Renderer, GRID_W, GRID_H } from './render.js';

const el = id => document.getElementById(id);
const foam = new Foam(GRID_W, GRID_H);
const R = new Renderer(el('stage'));

const statsEl = el('hud-stats'), logEl = el('hud-log');
const bannerEl = el('banner'), inscEl = el('inscription');

let fps = 0, frames = 0, fpsT = performance.now();
let lastInput = performance.now();
let phase = 'grow';           // grow | set | cascade
let phaseT = 0;
let cycles = 0;
let cascadeQueue = [];

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
function popAt(x, y, radius) {
  // erase plate first for the ones about to die
  const before = new Set();
  foam.forNear(x, y, radius + 62, (o, oi) => {
    if ((o.x - x) ** 2 + (o.y - y) ** 2 < radius * radius) before.add(oi);
  });
  for (const i of before) R.eraseCircle(foam.circles[i]);
  const n = foam.popAt(x, y, radius);
  // neighbors re-awakened by the wound must be re-drawn when they settle again
  for (const c of foam.circles) {
    if (c.growing && c.drawn) { R.eraseCircle(c); c.drawn = false; }
  }
  return n;
}

// ---------- input ----------
function ptr(e) {
  const rect = el('stage').getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (GRID_W / rect.width), y: (e.clientY - rect.top) * (GRID_H / rect.height) };
}
let downPos = null, downT = 0, dragMoved = 0, lastPop = 0;
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
  if (performance.now() - lastPop > 110) {
    lastPop = performance.now();
    const n = popAt(p.x, p.y, 18);
    if (n) addLog(`${n} cell${n > 1 ? 's' : ''} burst`, false);
  }
});
addEventListener('pointerup', () => {
  poke();
  if (downPos && dragMoved < 40 && performance.now() - downT < 400) {
    const n = popAt(downPos.x, downPos.y, 44);
    if (n > 0) { addLog(`you burst ${n} cells — the foam pours in`, true); }
    else { // clicked water: seed a cell
      for (let t = 0; t < 8; t++) {
        if (foam.seed(downPos.x + (Math.random() - 0.5) * 30, downPos.y + (Math.random() - 0.5) * 30)) break;
      }
      addLog('you blow a bubble into the foam', false);
    }
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
  else if (k === 's') {
    let n = 0;
    for (let t = 0; t < 200 && n < 24; t++) {
      if (foam.seed(Math.random() * GRID_W, Math.random() * GRID_H)) n++;
    }
    addLog(`you blow ${n} bubbles`, true);
  }
  else if (k === 'r') {
    foam.circles = []; foam.grid.clear(); foam.settledCount = 0;
    R.plate.set(R.bg);
    phase = 'grow'; phaseT = 0;
    addLog('the foam is swept; the water waits', true);
  }
  else if (k === 'c') showInscription();
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
  phaseT += dt;

  if (phase === 'grow') {
    const active = foam.step();
    // keep seeding while the water has room
    if (frames % 5 === 0) {
      for (let t = 0; t < 14; t++) {
        if (foam.seed(Math.random() * GRID_W, Math.random() * GRID_H)) break;
      }
    }
    // settle new arrivals into the plate
    for (const c of foam.circles) {
      if (c.settled && !c.drawn) { c.drawn = true; R.settleCircle(c); }
    }
    if (!active && foam.circles.length > 60) {
      phase = 'set'; phaseT = 0;
      banner('THE FOAM IS SET', `${foam.circles.length} cells · every border a treaty`);
      addLog('the foam holds its breath', true);
    }
  } else if (phase === 'set') {
    if (phaseT > 18) {
      phase = 'cascade'; phaseT = 0;
      cascadeQueue = [];
      // pick a wound point, queue 8 pops in a wandering line
      let cx = GRID_W * (0.25 + Math.random() * 0.5), cy = GRID_H * (0.25 + Math.random() * 0.5);
      for (let k = 0; k < 8; k++) {
        cascadeQueue.push({ x: cx, y: cy });
        cx += (Math.random() - 0.5) * 130; cy += (Math.random() - 0.5) * 130;
        cx = Math.max(50, Math.min(GRID_W - 50, cx)); cy = Math.max(50, Math.min(GRID_H - 50, cy));
      }
      banner('THE KEEPER RUNS A FINGER THROUGH IT', 'eight bursts, one wound');
    }
  } else if (phase === 'cascade') {
    if (cascadeQueue.length && (phaseT * 3 | 0) > (8 - cascadeQueue.length)) {
      const p = cascadeQueue.shift();
      popAt(p.x, p.y, 34);
    }
    if (!cascadeQueue.length) {
      phase = 'grow'; phaseT = 0; cycles++;
      addLog('the foam pours back into the wound', true);
    }
  }

  // keeper when idle: an occasional single pop
  const idle = (now - lastInput) / 1000;
  if (idle > 75) {
    document.body.classList.add('idle');
  }

  R.frame(foam, now / 1000);

  frames++;
  if (now - fpsT >= 1000) { fps = frames; frames = 0; fpsT = now; }
  hudAcc += dt;
  if (hudAcc > 0.4) {
    hudAcc = 0;
    const growing = foam.circles.filter(c => c.growing).length;
    statsEl.innerHTML =
      `<b>${foam.circles.length}</b> cells · ${growing} growing · cover ${(foam.coverage() * 100).toFixed(0)}%<br>` +
      `${phase} · cycle ${cycles} · pops ${foam.pops} · ${fps} fps`;
  }
}
console.log('%cSPUME%c every border is a treaty — eight to a cascade', 'color:#7CFC9A;font-weight:bold', 'color:#55708a');
addLog('the water waits; the first seeds sink in', true);
banner('SPUME', 'the foam apportions itself');
requestAnimationFrame(frame);

window.__spume = { foam, R, fps: () => fps, phase: () => phase, popAt };
