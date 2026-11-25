// Servidor sem janela (anfitrião em terminal). Os jogadores entram pelo jogo (Electron)
// ou pelo navegador em http://IP:7777
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { startServer } from './server.js';

const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const name = get('nome', 'Mundo');
const saveDir = get('saves', path.join(os.homedir(), '.rotbound', 'saves'));
const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'mundo';

const srv = await startServer({
  name, seed: String(get('seed', Math.floor(Math.random() * 1e9))), password: get('pass', '') === true ? '' : get('pass', ''),
  port: +get('porta', 7777), maxPlayers: +get('max', 4), friendlyFire: !!get('fogo-amigo', false), hardcore: !!get('hardcore', false),
  savePath: get('sem-gravar', false) ? null : path.join(saveDir, slug + '.json'), lan: !get('sem-lan', false), hostName: os.hostname(),
});
console.log(`Abre http://localhost:${srv.port} no navegador para jogar.`);
if (get('open', false)) {
  const url = `http://localhost:${srv.port}`;
  exec(process.platform === 'win32' ? `start ${url}` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`, () => {});
}
const stop = async () => { await srv.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
