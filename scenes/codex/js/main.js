// main.js — boot, chapter pacing, input, keeper. DOM lives here.
import { Scribe, RULES, RULE_NOTES } from './scribe.js';
import { Renderer, GRID_W } from './render.js';

const el = id => document.getElementById(id);
const scribe = new Scribe(GRID_W);
const R = new Renderer(el('stage'));

const statsEl = el('hud-stats'), logEl = el('hud-log');
const bannerEl = el('banner'), inscEl = el('inscription');

const LINES_PER_CHAPTER = 900;
let fps = 0, frames = 0, fpsT = performance.now();
let lastInput = performance.now();
let paused = false;
let autoHoldUntil = 0;
let lineAcc = 0;

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
function changeChapter(i, why) {
  R.writeSeam();
  scribe.setRule(i);
  scribe.seed(scribe.ruleIndex % 2 === 0);   // alternate: center seed / sparse field
  banner(`RULE ${scribe.rule}`, `the scribe ${RULE_NOTES[scribe.rule] || 'writes'}`);
  addLog(`chapter: rule ${scribe.rule} — ${RULE_NOTES[scribe.rule] || ''}${why ? ' · ' + why : ''}`, true);
}

// ---------- input ----------
addEventListener('pointerdown', e => {
  if (e.target.closest('a')) return;
  poke();
  const rect = el('stage').getBoundingClientRect();
  const x = (e.clientX - rect.left) * (GRID_W / rect.width) | 0;
  scribe.dropBlob(x, 5);
  addLog('you spill ink on the leading edge', false);
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
  else if (k === ' ') { paused = !paused; addLog(paused ? 'the pen rests' : 'the pen moves again'); }
  else if (k === 'arrowright' || k === 'n') { changeChapter(scribe.ruleIndex + 1, 'by hand'); autoHoldUntil = performance.now() + 120000; }
  else if (k === 'arrowleft') { changeChapter(scribe.ruleIndex + RULES.length - 2, 'by hand'); autoHoldUntil = performance.now() + 120000; }
  else if (k === 's') { scribe.seed(false); addLog('the line is re-seeded', false); }
  else if (k === 'r') { R.clear(); scribe.setRule(0); scribe.seed(true); addLog('the scroll is burned; a fresh sheet', true); }
  else if (k === 'x') showInscription();
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

  if (!paused) {
    lineAcc += dt * 20;              // ~20 lines a second — a stately hand
    while (lineAcc >= 1) {
      lineAcc -= 1;
      R.writeRow(scribe.writeLine(), scribe.ruleIndex);
      if (scribe.ruleLines >= LINES_PER_CHAPTER && now > autoHoldUntil) {
        changeChapter(scribe.ruleIndex + 1, 'the pen is dipped');
      }
    }
  }

  const idle = (now - lastInput) / 1000;
  if (idle > 75) {
    document.body.classList.add('idle');
    if (Math.random() < dt / 30) {
      scribe.dropBlob((Math.random() * GRID_W) | 0, 4);
      addLog('the scribe spills a little ink', false);
    }
  }

  R.blit();

  frames++;
  if (now - fpsT >= 1000) { fps = frames; frames = 0; fpsT = now; }
  hudAcc += dt;
  if (hudAcc > 0.4) {
    hudAcc = 0;
    statsEl.innerHTML =
      `<b>RULE ${scribe.rule}</b> · ${RULE_NOTES[scribe.rule] || ''}<br>` +
      `chapter ${scribe.ruleLines}/${LINES_PER_CHAPTER} · scroll ${scribe.lines.toLocaleString()} lines · ${fps} fps`;
  }
}
console.log('%cCODEX%c rule one-ten writes in gliders — the scribe always returns to it',
  'color:#ffd98a;font-weight:bold', 'color:#55708a');
addLog('the scroll begins; the pen is dipped', true);
banner('CODEX', 'the machine writes and never erases');
requestAnimationFrame(frame);

window.__codex = { scribe, R, fps: () => fps, changeChapter };
