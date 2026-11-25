// Servidor do anfitrião: HTTP (ficheiros do jogo) + WebSocket (rede) na mesma porta.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';
import { PORT, TICK_RATE, VERSION, MAX_PLAYERS } from '../shared/constants.js';
import { seedFromString } from '../shared/noise.js';
import { startAnnouncer, lanAddresses } from './discovery.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

export function staticHandler(root = ROOT, extra) {
  return (req, res) => {
    let url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (extra && extra(req, res, url)) return;
    if (url === '/' || url === '/client' || url === '/client/') { res.writeHead(302, { Location: '/client/index.html' }); return res.end(); }
    let file;
    if (url === '/lib/phaser.min.js') file = path.join(root, 'node_modules/phaser/dist/phaser.min.js');
    else if (url.startsWith('/client/') || url.startsWith('/shared/')) file = path.join(root, url);
    if (!file || !file.startsWith(root)) { res.writeHead(404); return res.end('404'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  };
}

export function loadData(root = ROOT) {
  return {
    items: JSON.parse(fs.readFileSync(path.join(root, 'shared/data/items.json'), 'utf8')),
    recipes: JSON.parse(fs.readFileSync(path.join(root, 'shared/data/recipes.json'), 'utf8')),
  };
}

export function startServer(o = {}) {
  const opts = {
    port: PORT, host: '0.0.0.0', name: 'Mundo', seed: String(Date.now() % 1e9), password: '', maxPlayers: MAX_PLAYERS,
    friendlyFire: false, hardcore: false, savePath: null, lan: true, log: console.log, lag: +(process.env.ROTBOUND_LAG || 0), cheats: true, ...o,
  };
  const log = opts.log;
  const game = new Game({ ...opts, seed: seedFromString(opts.seed) }, loadData());
  const conns = new Set();
  const lag = opts.lag;
  const later = (fn) => lag ? setTimeout(fn, lag) : fn();

  return new Promise((resolve, reject) => {
    const handler = staticHandler(ROOT, (req, res, url) => {
      if (url === '/info') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(info()));
        return true;
      }
    });
    const server = http.createServer(handler);
    // o mesmo servidor WebSocket pode atender várias portas (local e, mais tarde, LAN)
    const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
    const attach = (srv) => srv.on('upgrade', (req, sock, head) => wss.handleUpgrade(req, sock, head, (ws) => wss.emit('connection', ws, req)));
    attach(server);
    let lanServer = null;
    function info() { return { name: game.opts.name, host: opts.hostName || 'Anfitrião', players: game.players.size, max: opts.maxPlayers, port: opts.port, pass: !!opts.password, ver: VERSION, night: game.night }; }

    wss.on('connection', (ws, req) => {
      const addr = req.socket.remoteAddress || '';
      const isLocal = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
      let player = null;
      conns.add(ws);
      const sendJSON = (m) => { if (ws.readyState === 1) { const s = JSON.stringify(m); later(() => ws.readyState === 1 && ws.send(s)); } };
      ws.on('message', (data, isBinary) => {
        if (isBinary) return;
        let m; try { m = JSON.parse(data.toString()); } catch { return; }
        later(() => {
          if (!player) {
            if (m.t !== 'hello') return;
            const name = String(m.name || '').trim().slice(0, 16) || 'Sobrevivente';
            const reject = (reason) => { sendJSON({ t: 'reject', reason }); setTimeout(() => ws.close(), 200); };
            if (m.ver !== VERSION) return reject(`Versão diferente (anfitrião ${VERSION}, tu ${m.ver}).`);
            if (opts.password && m.pass !== opts.password) return reject('Palavra-passe errada.');
            if (game.players.size >= opts.maxPlayers) return reject(`O mundo está cheio (${opts.maxPlayers}/${opts.maxPlayers}).`);
            if ([...game.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase())) return reject('Já há um jogador com esse nome neste mundo.');
            player = game.addPlayer(name, sendJSON, isLocal);
            player.ws = ws;
            const w = game.welcome(player); w.ips = lanAddresses().map(a => a.ip); w.port = opts.port; w.local = isLocal;
            sendJSON(w);
            game.broadcast({ t: 'n', text: `${name} entrou no jogo.` });
            log(`[+] ${name} (${addr})`);
            return;
          }
          try { game.handle(player, m); } catch (e) { log('Erro a processar mensagem: ' + e.stack); }
        });
      });
      ws.on('close', () => {
        conns.delete(ws);
        if (player) { game.removePlayer(player.id); log(`[-] ${player.name}`); player = null; }
      });
      ws.on('error', () => {});
    });

    const sendBin = (p, buf) => {
      const ws = p.ws; if (!ws || ws.readyState !== 1) return;
      if (ws.bufferedAmount > 4e6) return;
      later(() => ws.readyState === 1 && ws.send(buf));
    };

    // ciclo de passo fixo a 20 ticks/s
    let last = performance.now(), acc = 0, running = true;
    const stepMs = 1000 / TICK_RATE;
    function loop() {
      if (!running) return;
      const now = performance.now(); acc += now - last; last = now;
      let n = 0;
      while (acc >= stepMs && n < 5) {
        try { game.step(); game.outbound(sendBin); } catch (e) { log('Erro na simulação: ' + e.stack); }
        acc -= stepMs; n++;
      }
      if (acc > stepMs * 5) acc = 0;
      if (game.hardcoreOver) { hardcoreEnd(); return; }
      setTimeout(loop, Math.max(1, stepMs - acc - 1));
    }
    function hardcoreEnd() {
      running = false;
      if (opts.savePath) try { fs.unlinkSync(opts.savePath); } catch {}
      game.opts.savePath = null;
      setTimeout(() => close('Modo Hardcore: o mundo foi apagado.'), 3000);
    }

    let announcer = null;
    // abrir à LAN um mundo que começou a solo (sem o fechar)
    async function openLan(o = {}) {
      if (lanServer || (opts.lan && opts.host !== '127.0.0.1')) return { ok: true, port: opts.port, ips: lanAddresses().map(a => a.ip) };
      opts.password = o.password || ''; opts.maxPlayers = Math.max(2, Math.min(4, +o.maxPlayers || 4));
      let port = PORT, err = null;
      for (; port < PORT + 10; port++) {
        const srv = http.createServer(handler); attach(srv);
        try { await new Promise((res, rej) => { srv.once('error', rej); srv.listen(port, '0.0.0.0', res); }); lanServer = srv; break; }
        catch (e) { err = e; try { srv.close(); } catch {} }
      }
      if (!lanServer) return { ok: false, error: 'Não foi possível abrir a porta para a LAN: ' + (err?.message || '') };
      opts.lan = true; opts.port = port; // os outros entram por esta porta
      announcer = startAnnouncer(info);
      const ips = lanAddresses().map(a => a.ip);
      game.broadcast({ t: 'n', text: 'O mundo está aberto à LAN!', kind: 'good' });
      log(`Aberto à LAN na porta ${port}: ${ips.join(', ')}`);
      return { ok: true, port, ips };
    }
    async function close(reason = 'O anfitrião fechou o mundo.') {
      running = false;
      if (announcer) announcer.stop();
      game.save();
      game.broadcast({ t: 'bye', reason });
      await new Promise(r => setTimeout(r, 150));
      for (const ws of conns) try { ws.close(); } catch {}
      wss.close(); server.close(); if (lanServer) lanServer.close();
      log('Servidor fechado.');
      if (opts.onClose) opts.onClose(reason);
    }

    server.on('error', reject);
    server.listen(opts.port, opts.host, () => {
      opts.port = server.address().port;
      log(`Rotbound ${VERSION} — mundo "${game.opts.name}" (seed ${game.world.seed}) na porta ${opts.port}`);
      const ips = lanAddresses().map(a => a.ip);
      if (opts.lan && ips.length) log('IP para os amigos: ' + ips.map(i => `${i}:${opts.port}`).join(', '));
      if (opts.lan) announcer = startAnnouncer(info);
      setTimeout(loop, stepMs);
      resolve({ game, close, port: opts.port, ips, info, openLan, get lan() { return !!lanServer || opts.lan; } });
    });
  });
}
