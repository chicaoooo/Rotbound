// Procurar jogos na LAN: o anfitrião anuncia por broadcast UDP a cada segundo (porta 7778).
import dgram from 'node:dgram';
import os from 'node:os';
import { DISCOVERY_PORT } from '../shared/constants.js';

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (a.family === 'IPv4' && !a.internal) out.push({ ip: a.address, netmask: a.netmask });
  }
  return out;
}
function broadcastAddrs() {
  const set = new Set(['255.255.255.255']);
  for (const { ip, netmask } of lanAddresses()) {
    const i = ip.split('.').map(Number), m = netmask.split('.').map(Number);
    set.add(i.map((v, k) => (v | (~m[k] & 255)) & 255).join('.'));
  }
  return [...set];
}

export function startAnnouncer(getInfo) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  let timer = null;
  sock.on('error', () => {});
  sock.bind(() => {
    try { sock.setBroadcast(true); } catch {}
    const tick = () => {
      const msg = Buffer.from(JSON.stringify({ rotbound: 1, ...getInfo() }));
      for (const a of broadcastAddrs()) sock.send(msg, DISCOVERY_PORT, a, () => {});
    };
    tick(); timer = setInterval(tick, 1000);
  });
  return { stop() { clearInterval(timer); try { sock.close(); } catch {} } };
}

export function startListener(onChange) {
  const games = new Map();
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', (e) => { console.warn('[LAN] procura automática indisponível:', e.message); });
  sock.on('message', (buf, rinfo) => {
    try {
      const m = JSON.parse(buf.toString());
      if (!m.rotbound) return;
      games.set(rinfo.address + ':' + m.port, { ...m, ip: rinfo.address, seen: Date.now() });
      onChange && onChange(list());
    } catch {}
  });
  sock.bind(DISCOVERY_PORT);
  const gc = setInterval(() => { const now = Date.now(); let ch = false; for (const [k, g] of games) if (now - g.seen > 3500) { games.delete(k); ch = true; } if (ch && onChange) onChange(list()); }, 1000);
  function list() { return [...games.values()].map(({ seen, rotbound, ...g }) => g); }
  return { list, stop() { clearInterval(gc); try { sock.close(); } catch {} } };
}
