// npm run dev:4 [n] — arranca um anfitrião local e abre n janelas do jogo (2 a 4) que entram em 127.0.0.1.
// ROTBOUND_LAG=120 npm run dev:4  → simula atraso de rede (ms).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { startServer } from '../server/server.js';

const n = Math.max(1, Math.min(4, +(process.argv[2] || 2)));
const srv = await startServer({ name: 'Teste', seed: 'dev', savePath: null, lan: false });
const require = createRequire(import.meta.url);
let electron; try { electron = require('electron'); } catch { electron = null; }
const names = ['Ana', 'Bruno', 'Carla', 'Duarte'];
const kids = [];
for (let i = 0; i < n; i++) {
  if (electron) kids.push(spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, ROTBOUND_AUTOJOIN: `ws://127.0.0.1:${srv.port}`, ROTBOUND_NAME: names[i] } }));
  else console.log(`Abre http://localhost:${srv.port} (${names[i]})`);
}
const stop = async () => { kids.forEach(k => k.kill()); await srv.close(); process.exit(0); };
process.on('SIGINT', stop);
