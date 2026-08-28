// main.js — boot, figure lifecycle, input, keeper. DOM lives here.
import { Harmonograph, LADDER } from './harmonograph.js';
import { Renderer, GRID_W, GRID_H } from './render.js';

const el = id => document.getElementById(id);
const harm = new Harmonograph();
const R = new Renderer(el('stage'));

const statsEl = el('hud-stats'), logEl = el('hud-log');
const bannerEl = el('banner'), inscEl = el('inscription');

let fps = 0, frames = 0, fpsT = performance.now();
let lastInput = performance.now();
let phase = 'draw';            // draw | hold | dissolve
let phaseT = 0;
let prev = null;
let hue = 45;
let autoHoldUntil = 0;

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII'];
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
function penColor() {
  const h = hue;
  // hsv-ish warm palette around the figure's hue
  const r = 255, g = 180 + 40 * Math.sin(h), b = 120 + 80 * Math.cos(h * 0.7);
  return ((255 << 24) | ((Math.max(40, Math.min(255, b | 0))) << 16) | ((Math.max(120, Math.min(255, g | 0))) << 8) | r) >>> 0;
}
function startFigure(idx = null, why) {
  if (idx === null) harm.next(); else harm.pick(idx);
  R.clear();
  hue = 20 + Math.random() * 60;
  phase = 'draw'; phaseT = 0; prev = null;
  const L = LADDER[harm.ladderIndex];
  banner(`${L.name}`, `ratio ${L.r.toFixed(2)} — figure ${ROMAN[harm.figures % 8] || harm.figures}`);
  addLog(`the machine tunes to ${L.name.toLowerCase()} (${L.r.toFixed(2)})${why ? ' · ' + why : ''}`, true);
}

// ---------- input ----------
let dragging = false, dragX = 0;
addEventListener('pointerdown', e => {
  if (e.target.closest('a')) return;
  dragging = true; dragX = e.clientX; poke();
});
addEventListener('pointermove', e => {
  if (!dragging) return;
  poke();
  const dx = e.clientX - dragX;
  dragX = e.clientX;
  harm.phi += dx * 0.004;      // phase nudge — the rosette twists
});
addEventListener('pointerup', () => { dragging = false; poke(); });
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
  else if (k === 'arrowright' || k === 'n') { startFigure(null, 'by hand'); autoHoldUntil = performance.now() + 120000; }
  else if (k === 'arrowleft') { harm.ladderIndex = (harm.ladderIndex + LADDER.length - 2) % LADDER.length; startFigure(null, 'by hand'); autoHoldUntil = performance.now() + 120000; }
  else if (k >= '1' && k <= '8') { startFigure(+k - 1, 'by hand'); autoHoldUntil = performance.now() + 120000; }
  else if (k === 'r') { harm.newFigure(); phase = 'draw'; phaseT = 0; prev = null; addLog('the pen lifts and falls again', false); }
  else if (k === 'v') showInscription();
});
function poke() {
  lastInput = performance.now();
  document.body.classList.remove('idle');
}

// ---------- loop ----------
let last = performance.now(), hudAcc = 0;
const out = { x: 0, y: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  phaseT += dt;

  if (phase === 'draw') {
    const alive = harm.advance(dt);
    harm.pos(out);
    if (prev) {
      const [x0, y0] = R.toPx(prev);
      const [x1, y1] = R.toPx(out);
      const col = penColor();
      R.line(x0, y0, x1, y1, col);
      R.line(x0, y0 + 1, x1, y1 + 1, col);
      // the pen tip burns white
      if (x1 >= 0 && y1 >= 0 && x1 < GRID_W && y1 < GRID_H) R.px[y1 * GRID_W + x1] = 0xffffffff;
    }
    prev = { x: out.x, y: out.y };
    if (!alive) {
      phase = 'hold'; phaseT = 0;
      banner('THE FIGURE RESTS', `${LADDER[harm.ladderIndex].name.toLowerCase()} — drawn and done`);
      addLog('the ink settles; the machine admires its work', false);
    }
    R.frame(0);          // ink persists — the figure accumulates
  } else if (phase === 'hold') {
    R.frame(0);
    if (phaseT > 9) { phase = 'dissolve'; phaseT = 0; }
  } else if (phase === 'dissolve') {
    R.frame(30);   // the figure dissolves back to the night
    if (phaseT > 3.0) {
      startFigure(now > autoHoldUntil ? null : harm.ladderIndex, null);
      phase = 'draw';
    }
  }

  if ((now - lastInput) / 1000 > 75) document.body.classList.add('idle');
  frames++;
  if (now - fpsT >= 1000) { fps = frames; frames = 0; fpsT = now; }
  hudAcc += dt;
  if (hudAcc > 0.4) {
    hudAcc = 0;
    const L = LADDER[harm.ladderIndex];
    statsEl.innerHTML =
      `<b>${L.name}</b> · ${L.r.toFixed(2)} · figure ${harm.figures + 1}<br>` +
      `ink ${(harm.energy() * 100).toFixed(0)}% · ${phase} · ${fps} fps`;
  }
}
console.log('%cOVERTONE%c the fifth is the sweetest figure', 'color:#ffb347;font-weight:bold', 'color:#55708a');
addLog('four pendulums, one pen; the machine tunes up', true);
banner('OVERTONE', 'every interval has a figure');
startFigure(2, 'the first tuning');
requestAnimationFrame(frame);

window.__overtone = { harm, R, fps: () => fps, startFigure, phase: () => phase };
