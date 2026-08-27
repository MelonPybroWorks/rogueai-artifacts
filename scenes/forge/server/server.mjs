// server.mjs — FORGE: http static + websocket + 20Hz authoritative loop
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachWSS } from './ws.mjs';
import { Game, W, H } from './game.mjs';

const PORT = Number(process.argv[2] || 4185);
const ROOT = fileURLToPath(new URL('../client/', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

// deterministic-ish rng
let seed = (Date.now() % 2147483647) >>> 0;
const rng = () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const game = new Game(rng);
game.warmRecipes();

// bots keep the world alive for spectators
const BOTS = 6;
for (let i = 0; i < BOTS; i++) {
  const b = game.addEnt(['ember', 'rivet', 'slag', 'cinder', 'bloom', 'ash'][i], true);
  b.inv.wood = 4; b.inv.stone = 3; b.inv.fiber = 2;
}

const http = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p === '') p = '/index.html';
    else if (p.endsWith('/')) p += 'index.html';
    if (p === '/state') {   // spectator/health endpoint
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({
        players: [...game.ents.values()].filter(e => !e.bot).length,
        bots: [...game.ents.values()].filter(e => e.bot).length,
        buildings: game.buildings.length, time: Math.round(game.time),
      }));
    }
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(normalize(ROOT))) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});

const socks = new Set();

attachWSS(http, (ws) => {
  socks.add(ws);
  // spectators stream immediately (nodes/buildings are quasi-static)
  ws.send(JSON.stringify(game.nodesFull()));
  ws.send(JSON.stringify(game.bldFull()));
  let me = null;
  ws.onMessage = (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!me) {
      if (m.t !== 'join') return;
      const name = String(m.name || '').replace(/[^\w \-·]/g, '').slice(0, 16) || 'smith';
      me = game.addEnt(name, false);
      ws._ent = me;
      ws.send(JSON.stringify({ t: 'init', id: me.id, W, H }));
      game.emit(`${name} enters the forge`, 'good');
      return;
    }
    if (m.t === 'craft') {
      game.craft(me, m.name, m.ings || {}).then(item => {
        ws.send(JSON.stringify({ t: 'craft', item }));
        ws.send(JSON.stringify(game.meFull(me)));
      });
      return;
    }
    if (m.t === 'respawn-now') { if (!me.alive) me.respawnT = Math.min(me.respawnT, 0.1); return; }
    game.input(me, m);
  };
  ws.onClose = () => { socks.delete(ws); if (me) game.removeEnt(me.id); };
});

// loops
const DT = 1 / 20;
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  let e = (now - last) / 1000; last = now;
  if (e > 0.5) e = 0.5;
  game.update(e);
}, 1000 * DT);

setInterval(() => {
  const snap = JSON.stringify(game.snap());
  const { ev, fx } = game.drainEvents();
  const evMsg = ev.length || fx.length ? JSON.stringify({ t: 'ev', ev, fx }) : null;
  const ndMsg = game._nodeDirty ? JSON.stringify(game.nodesFull()) : null;
  const bldMsg = game._bldDirty ? JSON.stringify(game.bldFull()) : null;
  game._nodeDirty = game._bldDirty = false;
  forEachSock(s => {
    s.send(snap);
    if (evMsg) s.send(evMsg);
    if (ndMsg) s.send(ndMsg);
    if (bldMsg) s.send(bldMsg);
  });
}, 100);

// per-player private state at 2Hz
setInterval(() => {
  forEachSock((s, ent) => { if (ent) s.send(JSON.stringify(game.meFull(ent))); });
}, 500);

function forEachSock(cb) { for (const s of socks) if (s.alive) cb(s, s._ent); }

http.listen(PORT, () => console.log(`FORGE on http://localhost:${PORT} (world ${W}x${H})`));
