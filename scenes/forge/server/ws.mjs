// ws.mjs — minimal RFC6455 WebSocket server (text frames), zero deps.
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class WSClient {
  constructor(socket) {
    this.sock = socket;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.onMessage = null;   // (string) =>
    this.onClose = null;
    this.alive = true;
    this.id = 0;
  }
  send(str) {
    if (!this.alive) return;
    const payload = Buffer.from(str, 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x81, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81; header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81; header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    try { this.sock.write(Buffer.concat([header, payload])); } catch { this.close(); }
  }
  feed(data) {
    this.buf = Buffer.concat([this.buf, data]);
    while (true) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      const maskOff = off;
      if (masked) off += 4;
      if (this.buf.length < off + len) return;
      let payload = this.buf.subarray(off, off + len);
      if (masked) {
        const mask = this.buf.subarray(maskOff, maskOff + 4);
        const un = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) un[i] = payload[i] ^ mask[i & 3];
        payload = un;
      }
      this.buf = this.buf.subarray(off + len);
      if (op === 0x8) { this.close(); return; }
      if (op === 0x9) { this._pong(payload); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x0) {
        this.frags.push(payload);
        if (fin) {
          const full = Buffer.concat(this.frags).toString('utf8');
          this.frags.length = 0;
          try { this.onMessage && this.onMessage(full); } catch (e) { console.error('ws msg err', e.message); }
        }
      }
    }
  }
  _pong(payload) {
    const header = Buffer.from([0x8A, payload.length]);
    try { this.sock.write(Buffer.concat([header, payload])); } catch { this.close(); }
  }
  close() {
    if (!this.alive) return;
    this.alive = false;
    try { this.sock.destroy(); } catch {}
    this.onClose && this.onClose();
  }
}

// attach to an http.Server
export function attachWSS(server, onConn) {
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || !req.url.startsWith('/ws')) { socket.destroy(); return; }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);
    const client = new WSClient(socket);
    socket.on('data', d => { if (client.alive) client.feed(d); });
    socket.on('error', () => client.close());
    socket.on('close', () => client.close());
    onConn(client, req);
  });
}
