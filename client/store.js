// Definições do jogador. Na app (Electron) ficam num ficheiro (settings.json); no navegador, no localStorage.
const R = window.rotbound || null;
let cache = null;
function load() {
  if (cache || !R?.settingsLoad) return cache;
  try { cache = R.settingsLoad() || {}; } catch { cache = {}; }
  // migra o que estiver no localStorage antigo
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); if (!k.startsWith('rb_') || k.slice(3) in cache) continue;
      try { cache[k.slice(3)] = JSON.parse(localStorage.getItem(k)); R.settingsSave(k.slice(3), cache[k.slice(3)]); } catch {}
    }
  } catch {}
  return cache;
}
export const store = {
  get(k, d) {
    const c = load(); if (c) return k in c ? c[k] : d;
    try { const v = localStorage.getItem('rb_' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    const c = load(); if (c) { c[k] = v; try { R.settingsSave(k, v); } catch {} return; }
    try { localStorage.setItem('rb_' + k, JSON.stringify(v)); } catch {}
  },
};
