// Ligação ao anfitrião (WebSocket) e estado do mundo do lado do cliente.
import { BaseWorld, Chunk, chunkKey } from '../shared/world.js';
import { CHUNK, VERSION } from '../shared/constants.js';

export class ClientWorld extends BaseWorld {
  addChunkBin(buf) {
    const dv = new DataView(buf);
    const cx = dv.getUint16(2, true), cy = dv.getUint16(4, true);
    const c = new Chunk(cx, cy);
    c.t.set(new Uint8Array(buf, 8, 1024));
    c.o.set(new Uint8Array(buf, 8 + 1024, 1024));
    c.h.set(new Uint16Array(buf, 8 + 2048, 1024));
    this.chunks.set(chunkKey(cx, cy), c);
    return c;
  }
  applyTiles(l) {
    const touched = [];
    for (let i = 0; i < l.length; i += 4) {
      const x = l[i], y = l[i + 1]; const c = this.chunkAt(x, y); if (!c) continue;
      const k = (y % CHUNK) * CHUNK + (x % CHUNK); c.o[k] = l[i + 2]; c.h[k] = l[i + 3]; touched.push(c);
    }
    return touched;
  }
}

export class Net {
  constructor() { this.ws = null; this.handlers = {}; this.onBinary = null; this.onClose = null; this.stats = { rx: 0, tx: 0 }; }
  on(t, fn) { this.handlers[t] = fn; }
  connect(url, name, pass) {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { return reject(new Error('Endereço inválido')); }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('Sem resposta do anfitrião (confirma o IP e a firewall).')); try { ws.close(); } catch {} } }, 7000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name, pass, ver: VERSION }));
      ws.onerror = () => { if (!done) { done = true; clearTimeout(timer); reject(new Error('Não foi possível ligar a ' + url)); } };
      ws.onclose = () => { if (!done) { done = true; clearTimeout(timer); reject(new Error('Ligação fechada')); } else if (this.onClose) this.onClose(this.byeReason); };
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') { this.stats.rx += ev.data.byteLength; if (this.onBinary) this.onBinary(ev.data); return; }
        this.stats.rx += ev.data.length;
        const m = JSON.parse(ev.data);
        if (!done) {
          if (m.t === 'reject') { done = true; clearTimeout(timer); reject(new Error(m.reason)); return; }
          if (m.t === 'welcome') { done = true; clearTimeout(timer); resolve(m); return; }
        }
        if (m.t === 'bye') this.byeReason = m.reason;
        const h = this.handlers[m.t]; if (h) h(m);
      };
    });
  }
  send(m) { if (this.ws && this.ws.readyState === 1) { const s = JSON.stringify(m); this.stats.tx += s.length; this.ws.send(s); } }
  close() { if (this.ws) { this.onClose = null; try { this.ws.close(); } catch {} } }
}
