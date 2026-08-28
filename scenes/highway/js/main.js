// main.js — boot, pacing, input, keeper. DOM lives here.
import { Board, RULESETS } from './turmites.js';
import { Renderer, GRID_W, GRID_H } from './render.js';

const el = id => document.getElementById(id);
const board = new Board(GRID_W, GRID_H);
const R = new Renderer(el('stage'));

const statsEl = el('hud-stats'), logEl = el('hud-log');
const bannerEl = el('banner'), inscEl = el('inscription');

let fps = 0, frames = 0, fpsT = performance.now();
let lastInput = performance.now();
let speed = 14;                  // steps per ant per frame
let currentRule = 0;
let keeperT = 0;

// the first four ants, one of each temper
for (let k = 0; k < 4; k++) {
  board.addAnt(GRID_W * (0.25 + 0.17 * k), GRID_H * (0.3 + 0.15 * (k % 2)), k);
}

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

// ---------- input ----------
function ptr(e) {
  const rect = el('stage').getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (GRID_W / rect.width) | 0, y: (e.clientY - rect.top) * (GRID_H / rect.height) | 0 };
}
addEventListener('pointerdown', e => {
  if (e.target.closest('a')) return;
  poke();
  const p = ptr(e);
  board.addAnt(p.x, p.y, currentRule);
  addLog(`you set down an ant of ${RULESETS[currentRule].name} temper (${RULESETS[currentRule].rule})`, true);
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
  else if (k >= '1' && k <= '4') { currentRule = +k - 1; addLog(`next ants will carry ${RULESETS[currentRule].rule}`, false); }
  else if (k === 'x') { board.cell.fill(0); R.clear(); addLog('the field is plowed; the ants keep walking', true); }
  else if (k === 'r') { board.cell.fill(0); board.ants = []; R.clear(); for (let i = 0; i < 4; i++) board.addAnt(GRID_W * (0.2 + Math.random() * 0.6), GRID_H * (0.2 + Math.random() * 0.6), i); addLog('fresh field, four fresh tempers', true); }
  else if (k === '+') { speed = Math.min(60, speed * 1.5 | 0 || 2); addLog(`the ants hurry (${speed}/frame)`, false); }
  else if (k === '-') { speed = Math.max(1, speed / 1.5 | 0); addLog(`the ants slow (${speed}/frame)`, false); }
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

  board.step(speed);

  const idle = (now - lastInput) / 1000;
  if (idle > 75) {
    document.body.classList.add('idle');
    keeperT += dt;
    if (keeperT > 45) {
      keeperT = 0;
      if (board.fill() > 0.42) {
        board.cell.fill(0); R.clear();
        addLog('the keeper plows the field under', true);
      } else if (board.ants.length < 10 && Math.random() < 0.7) {
        const rs = (Math.random() * 4) | 0;
        board.addAnt(Math.random() * GRID_W, Math.random() * GRID_H, rs);
        addLog(`the keeper sets down an ant of ${RULESETS[rs].name} temper`, false);
      }
    }
  }

  R.frame(board);

  frames++;
  if (now - fpsT >= 1000) { fps = frames; frames = 0; fpsT = now; }
  hudAcc += dt;
  if (hudAcc > 0.4) {
    hudAcc = 0;
    statsEl.innerHTML =
      `<b>${board.ants.length}</b> ants · ${(board.fill() * 100).toFixed(0)}% written<br>` +
      `${board.steps.toLocaleString()} steps · ${speed}/frame · ${fps} fps`;
  }
}
console.log('%cHIGHWAY%c ten thousand steps of chaos first — then the road', 'color:#ffd98a;font-weight:bold', 'color:#55708a');
addLog('four tempers share one field', true);
banner('HIGHWAY', 'ten thousand steps of chaos, then the road');
requestAnimationFrame(frame);

window.__highway = { board, R, fps: () => fps };
