// Processo principal do Electron: janela, servidor de ficheiros local, anfitrião LAN e procura de jogos.
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { staticHandler, startServer } from '../server/server.js';
import { startListener } from '../server/discovery.js';
import { PORT } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let win = null, host = null, listener = null, quitting = false;
// Definições do jogador (nome, zoom, volume…) num ficheiro da app, para não se perderem ao sair
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = null, saveTimer = null;
function loadSettings() { if (settings) return settings; try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { settings = {}; } return settings; }
function saveSettingsSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveSettingsNow, 300); }
function saveSettingsNow() { clearTimeout(saveTimer); try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings || {}, null, 1)); } catch {} }
ipcMain.on('settings:load', (e) => { e.returnValue = loadSettings(); });
ipcMain.on('settings:save', (e, k, v) => { loadSettings()[k] = v; saveSettingsSoon(); });
// Ícone da janela/barra de tarefas (.ico no Windows) e identidade própria da app no Windows:
// sem isto, a barra de tarefas agrupa a janela com o electron.exe e mostra o ícone do Electron.
const ICON = path.join(__dirname, '..', 'client', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
if (process.platform === 'win32') app.setAppUserModelId('pt.rotbound.game');
const savesDir = () => path.join(app.getPath('userData'), 'saves');
const slug = (s) => (String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mundo');

async function createWindow() {
  const srv = http.createServer(staticHandler());
  // porta interna fixa (se estiver ocupada, usa outra qualquer)
  await new Promise(r => { srv.once('error', () => srv.listen(0, '127.0.0.1', r)); srv.listen(47777, '127.0.0.1', r); });
  win = new BrowserWindow({
    width: 1366, height: 820, minWidth: 960, minHeight: 600, backgroundColor: '#000000', title: 'Rotbound', icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  Menu.setApplicationMenu(null);
  win.setIcon(ICON);
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
  // garante que o teclado chega sempre à página (evita caixas de texto que não aceitam escrita)
  win.on('focus', () => win.webContents.focus());
  win.webContents.on('did-finish-load', () => { win.webContents.setZoomFactor(1); win.webContents.setVisualZoomLevelLimits(1, 1); });
  win.loadURL(`http://127.0.0.1:${srv.address().port}/`);
}

ipcMain.handle('host:start', async (e, o) => {
  if (host) { await host.close(); host = null; }
  fs.mkdirSync(savesDir(), { recursive: true });
  let file = o.file;
  if (!file) { file = slug(o.name) + '.json'; let i = 2; while (fs.existsSync(path.join(savesDir(), file))) file = slug(o.name) + '-' + i++ + '.json'; }
  try {
    host = await startServer({
      name: o.name, seed: o.seed, password: o.password || '', maxPlayers: o.maxPlayers || 4, friendlyFire: !!o.friendlyFire, hardcore: !!o.hardcore,
      savePath: path.join(savesDir(), file), lan: !o.solo, host: o.solo ? '127.0.0.1' : '0.0.0.0', port: o.solo ? 0 : PORT,
      hostName: os.userInfo().username, onClose: () => { host = null; },
    });
    return { ok: true, port: host.port, ips: host.ips };
  } catch (err) {
    host = null;
    return { ok: false, error: err.code === 'EADDRINUSE' ? `A porta ${PORT} já está em uso (há outro mundo aberto neste computador?).` : String(err.message || err) };
  }
});
ipcMain.handle('host:openLan', async (e, o) => host ? host.openLan(o) : { ok: false, error: 'Não há nenhum mundo aberto.' });
ipcMain.handle('host:stop', async () => { if (host) { const h = host; host = null; await h.close(); } return true; });
ipcMain.handle('lan:list', () => listener ? listener.list() : []);
ipcMain.handle('saves:list', () => {
  try {
    return fs.readdirSync(savesDir()).filter(f => f.endsWith('.json')).map(f => {
      try { const d = JSON.parse(fs.readFileSync(path.join(savesDir(), f), 'utf8')); return { file: f, name: d.name, night: d.night, savedAt: d.savedAt, victory: d.victory }; } catch { return null; }
    }).filter(Boolean).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  } catch { return []; }
});
ipcMain.handle('saves:delete', (e, f) => { try { fs.unlinkSync(path.join(savesDir(), path.basename(f))); } catch {} return true; });
ipcMain.handle('app:quit', () => app.quit());

app.whenReady().then(() => {
  listener = startListener();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', async (e) => {
  if (settings) saveSettingsNow();
  if (host && !quitting) { e.preventDefault(); quitting = true; const h = host; host = null; await h.close(); app.quit(); }
  if (listener) listener.stop();
});
