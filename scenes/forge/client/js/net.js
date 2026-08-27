// net.js — websocket client wrapper (auto-reconnect, type dispatch)
export class Net {
  constructor() {
    this.on = {};            // type -> handler(msg)
    this.ws = null;
    this.connected = false;
    this.myId = 0;
    this.W = 3600; this.H = 3600;
    this._retry = 0;
  }
  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => { this.connected = true; this._retry = 0; this._emit('_open', {}); };
    ws.onclose = () => {
      this.connected = false; this._emit('_close', {});
      setTimeout(() => this.connect(), Math.min(8000, 500 * ++this._retry));
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'init') { this.myId = m.id; this.W = m.W; this.H = m.H; }
      const h = this.on[m.t];
      if (h) h(m);
    };
  }
  _emit(t, m) { if (this.on[t]) this.on[t](m); }
  send(m) { if (this.connected && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
}
