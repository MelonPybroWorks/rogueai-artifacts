// main.js — boot, loop, anchor-dragging, mode cycle, keeper. DOM lives here.
import { Sigil, MODES } from './game.js';
import { Renderer, GRID_W, GRID_H } from './render.js';

const el = id => document.getElementById(id);
const sigil = new Sigil(GRID_W, GRID_H);
const R = new Renderer(el('stage'));

const statsEl = el('hud-stats'), logEl = el('hud-log');
const bannerEl = el('banner'), inscEl = el('inscription');

let fps = 0, frames = 0, fpsT = performance.now();
let lastInput = performance.now();
let cycleT = 0, autoHoldUntil = 0;
let breathe = true;

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
function setMode(i, why) {
  sigil.setMode(i);
  const m = sigil.mode();
  banner(m.name, m.rule === 'barnsley' ? 'four transformations, one leaf' : `${m.n} anchors · ratio ${m.r}${m.rule ? ' · ' + m.rule : ''}`);
  addLog(`the die chooses anew: ${m.name.toLowerCase()}${why ? ' · ' + why : ''}`, true);
}

// ---------- input ----------
function ptr(e) {
  const rect = el('stage').getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (GRID_W / rect.width), y: (e.clientY - rect.top) * (GRID_H / rect.height) };
}
let heldAnchor = -1, downPos = null, downT = 0, dragMoved = 0;
addEventListener('pointerdown', e => {
  if (e.target.closest('a')) return;
  poke();
  const p = ptr(e);
  downPos = p; downT = performance.now(); dragMoved = 0;
  heldAnchor = -1;
  let bd = 40 * 40;
  for (let i = 0; i < sigil.anchors.length; i++) {
    const a = sigil.anchors[i];
    const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
    if (d < bd) { bd = d; heldAnchor = i; }
  }
});
addEventListener('pointermove', e => {
  if (!downPos) return;
  poke();
  const p = ptr(e);
  dragMoved += Math.abs(p.x - downPos.x) + Math.abs(p.y - downPos.y);
  if (heldAnchor >= 0) sigil.pull(heldAnchor, p.x, p.y, 0.35);
});
addEventListener('pointerup', () => { downPos = null; heldAnchor = -1; poke(); });
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
  else if (k === 'm' || k === 'tab') { e.preventDefault(); setMode(sigil.modeIndex + 1, 'by hand'); autoHoldUntil = performance.now() + 120000; }
  else if (k >= '3' && k <= '6') { setMode(+k - 3, 'by hand'); autoHoldUntil = performance.now() + 120000; }
  else if (k === 'f') { setMode(4, 'by hand'); autoHoldUntil = performance.now() + 120000; }
  else if (k === 'r') { sigil.dens.fill(0); addLog('the dust settles; the die keeps rolling', false); }
  else if (k === 'b') { breathe = !breathe; addLog(breathe ? 'the anchors breathe again' : 'the anchors hold'); }
  else if (k === 'd') showInscription();
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

  // anchors breathe (slow tiny orbits) unless the fern is up
  if (breathe && sigil.anchors.length) {
    const t = now / 1000;
    for (let i = 0; i < sigil.anchors.length; i++) {
      const a = sigil.anchors[i];
      a.x += Math.sin(t * 0.21 + i * 2.1) * 0.05;
      a.y += Math.cos(t * 0.17 + i * 1.3) * 0.05;
    }
  }

  sigil.step(2400);
  sigil.decay(0.994);

  // mode cycle
  cycleT += dt;
  const idle = (now - lastInput) / 1000;
  if (cycleT > 80 && now > autoHoldUntil) {
    cycleT = 0;
    setMode(sigil.modeIndex + 1, 'the keeper turns the page');
  }
  if (idle > 75) document.body.classList.add('idle');

  R.frame(sigil, heldAnchor >= 0 || idle < 30);

  frames++;
  if (now - fpsT >= 1000) { fps = frames; frames = 0; fpsT = now; }
  hudAcc += dt;
  if (hudAcc > 0.4) {
    hudAcc = 0;
    const m = sigil.mode();
    statsEl.innerHTML =
      `<b>${m.name}</b>${m.rule && m.rule !== 'barnsley' ? ' · ' + m.rule : ''}<br>` +
      `${m.n || '—'} anchors · ~${(2400 * fps / 1000 | 0) || 144}k hops/s · ${fps} fps`;
  }
}
console.log('%cSIGIL%c three anchors and a fair die', 'color:#7CFC9A;font-weight:bold', 'color:#55708a');
addLog('the die is cast; the figure assembles', true);
banner('SIGIL', 'drawn by chance — anchor by anchor');
requestAnimationFrame(frame);

window.__sigil = { sigil, R, fps: () => fps, setMode };
