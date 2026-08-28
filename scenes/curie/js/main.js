// main.js — boot, temperature sweep, input, keeper. DOM lives here.
import { Ising, TC } from './ising.js';
import { Renderer, GRID_W, GRID_H } from './render.js';

const el = id => document.getElementById(id);
const ising = new Ising(GRID_W, GRID_H);
const R = new Renderer(el('stage'));

const statsEl = el('hud-stats'), logEl = el('hud-log');
const bannerEl = el('banner'), inscEl = el('inscription');

let fps = 0, frames = 0, fpsT = performance.now();
let lastInput = performance.now();
let sweepT = 0, sweepDir = -1;        // the keeper walks T down then up
let autoHoldUntil = 0;
let lastSide = 0;

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
function crossBanner() {
  const below = ising.T < TC;
  banner('CROSSING THE TRANSITION', below ? 'order condenses out of the noise' : 'the noise takes the lattice back');
  addLog(below ? '— below the critical temperature: order —' : '— above it: the shimmer —', true);
}

// ---------- input ----------
function ptr(e) {
  const rect = el('stage').getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (GRID_W / rect.width) | 0, y: (e.clientY - rect.top) * (GRID_H / rect.height) | 0 };
}
let painting = false, paintVal = 1;
addEventListener('pointerdown', e => {
  if (e.target.closest('a')) return;
  poke();
  painting = true;
  paintVal = e.button === 2 ? -1 : 1;
  const p = ptr(e);
  ising.paint(p.x, p.y, 9, paintVal);
});
addEventListener('pointermove', e => {
  if (!painting) return;
  poke();
  const p = ptr(e);
  ising.paint(p.x, p.y, 9, paintVal);
});
addEventListener('pointerup', () => { painting = false; poke(); });
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
  else if (k === 'arrowup') { ising.T = Math.min(4.5, ising.T + 0.1); addLog(`T → ${ising.T.toFixed(2)}`, false); autoHoldUntil = performance.now() + 90000; }
  else if (k === 'arrowdown') { ising.T = Math.max(0.4, ising.T - 0.1); addLog(`T → ${ising.T.toFixed(2)}`, false); autoHoldUntil = performance.now() + 90000; }
  else if (k === 'q') { ising.quench(); banner('QUENCHED', 'the lattice plunges into the cold'); addLog('quenched: order races across the lattice', true); }
  else if (k === 'b') { ising.reheat(); banner('REHEATED', 'the lattice boils'); addLog('reheated: the shimmer returns', true); }
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

  // the keeper walks the temperature back and forth across Tc
  if (now > autoHoldUntil) {
    sweepT += dt;
    ising.T += sweepDir * dt * 0.011;
    const side = ising.T < TC ? -1 : 1;
    if (side !== lastSide && lastSide !== 0) crossBanner();
    lastSide = side;
    if (ising.T < 1.5) sweepDir = 1;
    else if (ising.T > 3.5) sweepDir = -1;
  }

  ising.step(22000);
  R.frame(ising);

  if ((now - lastInput) / 1000 > 75) document.body.classList.add('idle');
  frames++;
  if (now - fpsT >= 1000) { fps = frames; frames = 0; fpsT = now; }
  hudAcc += dt;
  if (hudAcc > 0.4) {
    hudAcc = 0;
    const rel = ising.T - TC;
    statsEl.innerHTML =
      `T = <b>${ising.T.toFixed(2)}</b> (T<sub>c</sub> 2.269, ${rel < 0 ? 'below' : 'above'})<br>` +
      `order ${(ising.m * 100).toFixed(0)}% · ${fps} fps`;
  }
}
console.log('%cCURIE%c the transition lives at 2.269', 'color:#e8ddc8;font-weight:bold', 'color:#55708a');
addLog('the lattice shimmers at the edge of order', true);
banner('CURIE', 'two hundred and thirty thousand magnets, arguing');
requestAnimationFrame(frame);

window.__curie = { ising, R, fps: () => fps, TC };
