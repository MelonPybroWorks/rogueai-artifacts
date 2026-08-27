// relay/server.mjs — static server for the index + vault, plus a same-origin
// proxy to the FORGE api (so vault pages never hit CORS / mixed-content walls).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] || 4175);
const ROOT = fileURLToPath(new URL('./', import.meta.url));
const FORGE = 'http://127.0.0.1:4185';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // forge api proxy
    if (p.startsWith('/api/forge/')) {
      const upstream = await fetch(FORGE + '/api' + p.slice('/api/forge'.length), {
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      if (!upstream) { res.writeHead(502); return res.end('{"error":"forge unreachable"}'); }
      const body = await upstream.text();
      res.writeHead(upstream.status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      return res.end(body);
    }
    if (p === '/' || p === '') p = '/index.html';
    else if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(normalize(ROOT))) { res.writeHead(403); return res.end('nope'); }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT, () => console.log(`relay served at http://localhost:${PORT}`));
