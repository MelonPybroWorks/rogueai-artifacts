// main.js — boot, loop, input, idle bowing. DOM lives here.
import { Field, MODES } from './field.js';
import { Grains } from './grains.js';
import { Renderer } from './render.js';

const el = id => document.getElementById(id);
const field = new Field();
const grains = new Grains(14000);
const R = new Renderer(el('stage'));

const statsEl = el('hud-stats'), logEl = el('hud-log'), songEl = el('hud-song');
const bannerEl = el('banner'), inscEl = el('inscription');

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
let auto = true;                  // auto-advance songs
let autoT = 0;                    // time on current song
let autoHoldUntil = 0;            // manual override pauses auto
let ghostUntil = 3000;            // show the field ghost at boot
let ghostPinned = false;
let fps = 0, frames = 0, fpsT = performance.now();
let lastInput = performance.now();
let bowT = 0;                     // idle ghost-finger timer

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
function songLabel() {
  return `song ${ROMAN[field.modeIndex]}`;
}
function changeSong(i, why) {
  field.setMode(i);
  R.buildGhost(field);
  ghostUntil = performance.now() + 2600;
  autoT = 0;
  songEl.textContent = songLabel();
  banner(`THE PLATE CHANGES ITS SONG`, `${songLabel()} of nine — (${field.n}, ${field.m})`);
  addLog(`${songLabel().toLowerCase()} — (${field.n}, ${field.m})${why ? ' · ' + why : ''}`, true);
}

// ---------- input ----------
let pressing = false;
function pointerUnit(e) {
  const rect = el('stage').getBoundingClientRect();
  const bx = (e.clientX - rect.left) * (R.W / rect.width);
  const by = (e.clientY - rect.top) * (R.H / rect.height);
  return { x: (bx - R.px0) / R.S, y: (by - R.py0) / R.S };
}
addEventListener('pointerdown', e => {
  if (e.target.closest('a')) return;
  pressing = true; poke();
  const u = pointerUnit(e);
  field.press = { x: u.x, y: u.y, r: 0.10, amp: 0.9, until: performance.now() + 400 };
});
addEventListener('pointermove', e => {
  if (!pressing) return;
  poke();
  const u = pointerUnit(e);
  field.press = { x: u.x, y: u.y, r: 0.10, amp: 0.9, until: performance.now() + 250 };
});
addEventListener('pointerup', () => { pressing = false; poke(); });
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
  else if (k === 'arrowright' || k === 'd') { changeSong(field.modeIndex + 1, 'by hand'); autoHoldUntil = performance.now() + 90000; }
  else if (k === 'arrowleft' || k === 'a') { changeSong(field.modeIndex - 1, 'by hand'); autoHoldUntil = performance.now() + 90000; }
  else if (k === 'r') { grains.scatter(); addLog('the keeper shakes the plate', true); }
  else if (k === 's') {
    const done = grains.sprinkle(0.5 + (Math.random() - 0.5) * 0.4, 0.5 + (Math.random() - 0.5) * 0.4, 600, 0.12);
    addLog(`a pinch of fresh sand (${done})`, false);
  }
  else if (k === 'f') { ghostPinned = !ghostPinned; addLog(ghostPinned ? 'the song made visible' : 'the song made secret'); }
  else if (k === 'c') { auto = !auto; addLog(auto ? 'the keeper resumes the ladder' : 'the ladder rests', true); }
  else if (k === '9') showInscription();
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

  field.tick(now);
  grains.step(field);

  autoT += dt;
  if (auto && autoT > 45 && now > autoHoldUntil) changeSong(field.modeIndex + 1, 'the keeper turns the peg');

  // idle: the keeper bows the plate edge
  const idle = (now - lastInput) / 1000;
  if (idle > 75) {
    document.body.classList.add('idle');
    bowT += dt;
    if (bowT > 26) {
      bowT = 0;
      const a = Math.random() * Math.PI * 2;
      field.press = { x: 0.5 + 0.38 * Math.cos(a), y: 0.5 + 0.38 * Math.sin(a), r: 0.09, amp: 0.8, until: now + 2600 };
      addLog('the keeper bows the edge of the plate', false);
    }
  }

  R.frame(field, grains, ghostPinned || now < ghostUntil, now / 1000);

  frames++;
  if (now - fpsT >= 1000) { fps = frames; frames = 0; fpsT = now; }
  hudAcc += dt;
  if (hudAcc > 0.3) {
    hudAcc = 0;
    const settle = Math.max(0, Math.min(99, (1 - grains.meanAmplitude(field) / 0.59) * 100));
    statsEl.innerHTML =
      `<b>${songLabel()}</b> / IX · (${field.n}, ${field.m})<br>` +
      `settled ${settle.toFixed(0)}% · ${grains.n} grains · ${fps} fps`;
  }
}
songEl.textContent = songLabel();
console.log('%cFIGURE%c the plate knows nine songs; the sand knows them all by heart',
  'color:#e8dcc0;font-weight:bold', 'color:#55708a');
addLog('the plate wakes; nine songs in the ladder', true);
banner('FIGURE', 'the plate sings — the sand remembers');
requestAnimationFrame(frame);

window.__figure = {
  field, grains, R,
  fps: () => fps,
  changeSong,
  settle() { return grains.meanAmplitude(field); },
};
