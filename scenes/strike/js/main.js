// main.js — boot, loop, input, keeper, HUD. DOM lives here.
import { Forest, TREE } from './forest.js';
import { Renderer, GRID_W, GRID_H } from './render.js';

const el = id => document.getElementById(id);
const forest = new Forest(GRID_W, GRID_H);
forest.strikeEvery = 600;
const R = new Renderer(el('stage'));

const statsEl = el('hud-stats'), logEl = el('hud-log'), windEl = el('hud-wind');
const bannerEl = el('banner'), inscEl = el('inscription');

let fps = 0, frames = 0, fpsT = performance.now();
let lastInput = performance.now();
let keeperT = 0, gustT = 0;
let speedMul = 1;
let tick = 0;
let lastBurning = 0;

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
const COMPASS = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'];
const windArrow = () => COMPASS[Math.round(((Math.PI * 2 - forest.windA) % (Math.PI * 2)) / (Math.PI / 4)) % 8];

// ---------- input ----------
function pointerGrid(e) {
  const rect = el('stage').getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (GRID_W / rect.width),
    y: (e.clientY - rect.top) * (GRID_H / rect.height),
  };
}
let dragging = false, moved = 0;
addEventListener('pointerdown', e => {
  if (e.target.closest('a')) return;
  dragging = true; moved = 0; poke();
});
function dragMove(e) {
  if (!dragging) return;
  poke();
  const g = pointerGrid(e);
  const n = forest.plant(g.x, g.y, 7);
  moved += n;
}
addEventListener('pointermove', dragMove);
addEventListener('pointerup', e => {
  poke();
  if (dragging && moved < 20) {
    // a click, not a drag: lightning strike
    const g = pointerGrid(e);
    if (forest.igniteAt(g.x, g.y)) {
      banner('STRUCK', 'your spark finds fuel');
      addLog('you struck the forest', true);
    } else addLog('your spark fell on bare ground', false);
  }
  dragging = false;
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
  else if (k === 'arrowup') { forest.p = Math.min(0.002, forest.p * 1.5); addLog(`growth thickens (${forest.p.toFixed(4)})`); }
  else if (k === 'arrowdown') { forest.p = Math.max(0.0001, forest.p / 1.5); addLog(`growth slows (${forest.p.toFixed(4)})`); }
  else if (k === 'w') { forest.windA += Math.PI / 4; addLog(`the wind veers ${windArrow()}`, true); }
  else if (k === 'r') { const f2 = new Forest(GRID_W, GRID_H); forest.cell.set(f2.cell); forest.age.set(f2.age); forest.heat.fill(0); forest.trees = f2.trees; forest.fires = []; banner('NEW GROWTH', 'the keeper reseeds the valley'); }
  else if (k === 'l') showInscription();
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
  tick++;

  forest.step();
  forest.windA += 0.0004 * dt * 60 * Math.sin(now / 47000);  // the wind has a mind, slowly

  // fire-event narration
  const burning = forest.fires.length;
  if (burning > 0 && lastBurning === 0) addLog('smoke on the wind…', false);
  if (burning === 0 && lastBurning > 120) addLog(`a run is done; the embers cool`, true);
  if (burning > 1500 && lastBurning <= 1500) { banner('A RUN', 'the fire finds its weather'); }
  lastBurning = burning;

  // the keeper, when nobody tends the valley
  const idle = (now - lastInput) / 1000;
  if (idle > 75) {
    document.body.classList.add('idle');
    keeperT += dt;
    if (keeperT > 34) {
      keeperT = 0;
      if (Math.random() < 0.55 && forest.trees > 20000) {
        // the keeper calls lightning at a dense stand
        for (let tries = 0; tries < 60; tries++) {
          const i = (Math.random() * GRID_W * GRID_H) | 0;
          if (forest.cell[i] === TREE) { forest.ignite(i); addLog('the keeper calls a strike', true); break; }
        }
      } else {
        forest.windA += (Math.random() - 0.5) * 1.2;
        addLog(`the keeper turns the wind ${windArrow()}`, false);
      }
    }
  }

  R.frame(forest, tick);

  frames++;
  if (now - fpsT >= 1000) { fps = frames; frames = 0; fpsT = now; }
  hudAcc += dt;
  if (hudAcc > 0.3) {
    hudAcc = 0;
    windEl.textContent = windArrow();
    statsEl.innerHTML =
      `cover <b>${(forest.cover() * 100).toFixed(0)}%</b> · wind ${windArrow()}<br>` +
      `${burning > 0 ? `<span style="color:#ffb347">burning ${burning}</span> · ` : ''}strikes ${forest.strikes} · burned ${(forest.burnedTotal / 1000).toFixed(0)}k<br>` +
      `${fps} fps`;
  }
}
console.log('%cSTRIKE%c the sky rolls its dice every six hundred heartbeats',
  'color:#7CFC9A;font-weight:bold', 'color:#55708a');
addLog('the valley grows; the sky keeps its dice', true);
banner('STRIKE', 'a forest at the edge of burning, forever');
requestAnimationFrame(frame);

window.__strike = {
  forest, R,
  fps: () => fps,
  strikeAt: (x, y) => forest.igniteAt(x, y),
};
