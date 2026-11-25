// Teste sem ecrã: arranca um anfitrião, liga 2 clientes, move-os, faz noite e confirma que tudo flui.
import { startServer } from '../server/server.js';
import WebSocket from 'ws';
import { VERSION } from '../shared/constants.js';

const srv = await startServer({ port: 17777, seed: 'teste', lan: false, savePath: null, log: () => {} });
function client(name) {
  return new Promise((res) => {
    const ws = new WebSocket('ws://127.0.0.1:17777');
    const c = { ws, name, chunks: 0, snaps: 0, ents: 0, me: null, inv: null, notes: [], maxEnts: 0 };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', name, ver: VERSION })));
    ws.on('message', (d, bin) => {
      if (bin) { const dv = new DataView(d.buffer, d.byteOffset, d.byteLength); const t = dv.getUint8(0); if (t === 2) c.chunks++; if (t === 1) { c.ents++; c.maxEnts = Math.max(c.maxEnts, dv.getUint16(2, true)); } return; }
      const m = JSON.parse(d.toString());
      if (m.t === 'welcome') { c.id = m.id; res(c); }
      if (m.t === 's') { c.snaps++; c.me = m.me; c.time = m.time; }
      if (m.t === 'inv') c.inv = m;
      if (m.t === 'n') c.notes.push(m.text);
      if (m.t === 'reject') { console.log('REJ', m.reason); res(c); }
    });
  });
}
const a = await client('Ana'), b = await client('Bruno');
let seq = 0;
const start = { ...a.me };
const iv = setInterval(() => { for (const c of [a, b]) c.ws.send(JSON.stringify({ t: 'i', s: ++seq, mx: 1, my: 0, a: 0, ax: 0, ay: 0 })); }, 50);
await new Promise(r => setTimeout(r, 2000));
clearInterval(iv);
console.log('chunks', a.chunks, b.chunks, 'snaps', a.snaps, 'ents', a.ents);
console.log('A moved from', start.x?.toFixed(2), 'to', a.me.x.toFixed(2), 'ack', a.me.ack);
console.log('inv', a.inv.inv.filter(Boolean).map(i => i.id + 'x' + i.n).join(', '));
a.ws.send(JSON.stringify({ t: 'chat', text: '/noite 5' }));
await new Promise(r => setTimeout(r, 6000));
console.log('time', JSON.stringify(a.time), 'zombies', srv.game.countZ(), 'maxEnts in packet', a.maxEnts);
console.log('notes', a.notes.slice(-4));
// craft test
a.ws.send(JSON.stringify({ t: 'chat', text: '/dar fibra 9' }));
await new Promise(r => setTimeout(r, 200));
a.ws.send(JSON.stringify({ t: 'craft', r: 'corda', n: 3 }));
await new Promise(r => setTimeout(r, 300));
console.log('after craft', a.inv.inv.filter(Boolean).map(i => i.id + 'x' + i.n).join(', '));
// stress: tick time
let t0 = performance.now(); for (let i = 0; i < 100; i++) srv.game.step(); console.log('100 ticks ms', (performance.now() - t0).toFixed(1), 'zombies', srv.game.countZ());
a.ws.close(); b.ws.close();
await srv.close();
process.exit(0);
