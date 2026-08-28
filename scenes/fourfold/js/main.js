// main.js — boot, tumble, input, keeper, HUD. DOM lives here.
import { POLYTOPES, rotPlane, project } from './polytope.js';
import { Renderer } from './render.js';

const el = id => document.getElementById(id);
const R = new Renderer(el('stage'));

const statsEl = el('hud-stats'), logEl = el('hud-log');
const bannerEl = el('banner'), inscEl = el('inscription');

let poly = null, polyIndex = 1;   // start on the tesseract
let verts = [], edges = [];
let spinA = 0.21, spinB = 0.13;   // XW and ZW tumble rates (rad/s)
let velA = 0, velB = 0;           // user-added spin
let frozen = false;
let fps = 0, frames = 0, fpsT = performance.now();
let lastInput = performance.now();
let cycleT = 0, autoHoldUntil = 0;

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
function setPoly(i, why) {
  polyIndex = ((i % POLYTOPES.length) + POLYTOPES.length) % POLYTOPES.length;
  poly = POLYTOPES[polyIndex];
  const built = poly.build();
  verts = built.v; edges = built.e;
  banner(poly.name, `${poly.sub} — a shadow of the fourth dimension`);
  addLog(`the shadow changes: ${poly.sub}${why ? ' · ' + why : ''}`, true);
}
setPoly(1);

// ---------- input ----------
let dragging = false, dragX = 0, dragY = 0;
addEventListener('pointerdown', e => {
  if (e.target.closest('a')) return;
  dragging = true; dragX = e.clientX; dragY = e.clientY; poke();
});
addEventListener('pointermove', e => {
  if (!dragging) return;
  poke();
  velA += (e.clientX - dragX) * 0.0016;
  velB += (e.clientY - dragY) * 0.0016;
  dragX = e.clientX; dragY = e.clientY;
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
  else if (k >= '1' && k <= '4') { setPoly(+k - 1, 'by hand'); autoHoldUntil = performance.now() + 120000; }
  else if (k === 'arrowright' || k === 'n') { setPoly(polyIndex + 1, 'by hand'); autoHoldUntil = performance.now() + 120000; }
  else if (k === ' ') { frozen = !frozen; addLog(frozen ? 'the shadow holds still' : 'the shadow turns again', true); }
  else if (k === 'r') { spinA = 0.1 + Math.random() * 0.35; spinB = 0.1 + Math.random() * 0.35; addLog('the tumble changes its mind', false); }
  else if (k === 'w') showInscription();
});
function poke() {
  lastInput = performance.now();
  document.body.classList.remove('idle');
}

// ---------- loop ----------
let last = performance.now(), hudAcc = 0;
const out = { x: 0, y: 0, depth: 0 };
const projCache = [];
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;

  if (!frozen) {
    const a = (spinA + velA) * dt, b = (spinB + velB) * dt;
    for (const p of verts) {
      rotPlane(p, 0, 3, a);   // XW
      rotPlane(p, 2, 3, b);   // ZW
    }
  }
  velA *= Math.pow(0.3, dt); velB *= Math.pow(0.3, dt);

  // project all corners
  projCache.length = verts.length;
  for (let i = 0; i < verts.length; i++) {
    project(verts[i], 3.4, 2.6, out);
    projCache[i] = { x: out.x, y: out.y, depth: out.depth };
  }
  // edges
  for (const [i, j] of edges) {
    const A = projCache[i], B = projCache[j];
    const [x0, y0] = R.map(A.x, A.y), [x1, y1] = R.map(B.x, B.y);
    const col = R.depthColor((A.depth + B.depth) / 2, polyIndex);
    R.line(x0, y0, x1, y1, col);
    R.line(x0, y0 + 1, x1, y1 + 1, col);
  }
  // corners
  for (const p of projCache) {
    const [x, y] = R.map(p.x, p.y);
    const col = R.depthColor(p.depth * 1.15, polyIndex);
    if (x >= 1 && y >= 1 && x < R.W - 1 && y < R.H - 1) {
      R.px[y * R.W + x] = 0xffffffff;
      R.px[y * R.W + x + 1] = col; R.px[y * R.W + x - 1] = col;
      R.px[(y + 1) * R.W + x] = col; R.px[(y - 1) * R.W + x] = col;
    }
  }
  R.frame();

  // auto-cycle the polytopes
  cycleT += dt;
  if (cycleT > 55 && now > autoHoldUntil) { cycleT = 0; setPoly(polyIndex + 1, 'the keeper turns the jewel'); }
  if ((now - lastInput) / 1000 > 75) document.body.classList.add('idle');

  frames++;
  if (now - fpsT >= 1000) { fps = frames; frames = 0; fpsT = now; }
  hudAcc += dt;
  if (hudAcc > 0.4) {
    hudAcc = 0;
    statsEl.innerHTML =
      `<b>${poly.name}</b> · ${poly.sub}<br>` +
      `tumble XW ${(spinA + velA).toFixed(2)} · ZW ${(spinB + velB).toFixed(2)} rad/s<br>` +
      `${verts.length} corners · ${edges.length} edges · ${fps} fps`;
  }
}
console.log('%cFOURFOLD%c the fourth axis is named w', 'color:#ffb347;font-weight:bold', 'color:#55708a');
addLog('a shadow falls out of the fourth dimension', true);
banner('FOURFOLD', 'sixteen corners turning in two planes at once');
requestAnimationFrame(frame);

window.__fourfold = { fps: () => fps, setPoly, spin: () => [spinA + velA, spinB + velB], get verts() { return verts; } };
