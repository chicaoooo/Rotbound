// Ponte segura entre a janela do jogo e o processo principal.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rotbound', {
  electron: true,
  autojoin: process.env.ROTBOUND_AUTOJOIN || null,
  autoname: process.env.ROTBOUND_NAME || null,
  host: (o) => ipcRenderer.invoke('host:start', o),
  stopHost: () => ipcRenderer.invoke('host:stop'),
  lan: () => ipcRenderer.invoke('lan:list'),
  saves: () => ipcRenderer.invoke('saves:list'),
  deleteSave: (f) => ipcRenderer.invoke('saves:delete', f),
  quit: () => ipcRenderer.invoke('app:quit'),
});
