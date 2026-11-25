// Arranque do cliente: menus (solo, criar/entrar na LAN), ligação e o jogo.
import { buildArt } from './art.js';
import { Net, ClientWorld } from './net.js';
import { Hud, HELP_HTML } from './hud.js';
import { makeScene, snapZoom } from './scene.js';
import * as audio from './audio.js';
import { stepPlayer } from '../shared/world.js';
import { DT, PORT, VERSION } from '../shared/constants.js';

const R = window.rotbound || null;   // ponte do Electron (ausente no navegador)
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem('rb_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('rb_' + k, JSON.stringify(v)); } catch {} } };

let DATA = null, ART = null, G = null, servedByHost = null;

// Ctrl + roda é o zoom do jogo: impede o navegador/Electron de ampliar a página
window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', (e) => { if (e.ctrlKey && ['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Digit0'].includes(e.code)) e.preventDefault(); });

async function boot() {
  const [items, recipes] = await Promise.all([
    fetch(new URL('../shared/data/items.json', import.meta.url)).then(r => r.json()),
    fetch(new URL('../shared/data/recipes.json', import.meta.url)).then(r => r.json()),
  ]);
  DATA = { items, recipes };
  ART = buildArt(items);
  if (!R) { try { const r = await fetch('/info', { cache: 'no-store' }); if (r.ok) servedByHost = await r.json(); } catch {} }
  window.addEventListener('pointerdown', () => audio.unlock(), { once: false });
  audio.setVolume(store.get('vol', 0.6));
  if (R?.autojoin) return connect(R.autojoin, R.autoname || 'Teste', '');
  mainMenu();
}

// ======================= Menus =======================
const HINTS = ['Os zombies não nascem perto da luz.', 'De 7 em 7 noites a lua fica vermelha.', 'Os livros estão nas estantes. Lê-os para aprender receitas.', 'Os Escavadores não atravessam metal.', 'Mata os Explosivos de longe.', 'Chá de ervas baixa a infeção.', 'O Rei da Podridão acorda na noite 21.'];
function show(html) {
  const m = $('#menu'); m.style.display = 'flex';
  m.innerHTML = `<canvas id="menubg"></canvas><div class="box">${html}</div><div class="hint">${HINTS[(Math.random() * HINTS.length) | 0]}</div><div class="ver">Rotbound ${VERSION}</div>`;
  menuBg.start($('#menubg'));
  // foco: o primeiro campo de texto fica logo pronto a escrever
  const first = m.querySelector('.box input[type=text]'); if (first && !first.value) setTimeout(() => first.focus(), 30);
  return m;
}
// diálogo dentro da página (o confirm() nativo do Electron em Windows bloqueia a escrita nas caixas de texto)
function ask(text, okLabel = 'Sim') {
  return new Promise((res) => {
    const d = document.createElement('div'); d.className = 'dialog';
    d.innerHTML = `<div class="box"><p>${esc(text)}</p><div class="actions"><button id="dno">Cancelar</button><button class="pri" id="dyes">${esc(okLabel)}</button></div></div>`;
    $('#menu').appendChild(d);
    d.querySelector('#dno').onclick = () => { d.remove(); res(false); };
    d.querySelector('#dyes').onclick = () => { d.remove(); res(true); };
  });
}

// ---------- fundo animado do menu: clareira à noite, fogueira e zombies a aproximar-se ----------
const menuBg = {
  cv: null, raf: 0, zs: [], parts: [], ground: null, t0: 0,
  start(cv) {
    this.cv = cv; cancelAnimationFrame(this.raf);
    const fit = () => { cv.width = Math.ceil(innerWidth / 2); cv.height = Math.ceil(innerHeight / 2); this.ground = null; };
    fit(); window.onresize = fit;
    if (!this.zs.length) for (let i = 0; i < 9; i++) this.zs.push(this.newZ());
    const loop = (t) => { if (!document.body.contains(cv)) return; this.draw(t / 1000); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  },
  stop() { cancelAnimationFrame(this.raf); },
  newZ() { const a = Math.random() * Math.PI * 2; const types = ['errante', 'errante', 'errante', 'corredor', 'brutamontes', 'cuspidor']; return { a, d: 0.75 + Math.random() * 0.6, sp: 0.012 + Math.random() * 0.02, type: types[(Math.random() * types.length) | 0], wob: Math.random() * 6 }; },
  frame(ctx, name, x, y, rot = 0, sc = 1) {
    const f = ART.frames[name]; if (!f) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(ART.atlas, f.x, f.y, f.w, f.h, -f.w * sc / 2, -f.h * sc / 2, f.w * sc, f.h * sc); ctx.restore();
  },
  buildGround(W, H) {
    const g = document.createElement('canvas'); g.width = W; g.height = H; const c = g.getContext('2d'); c.imageSmoothingEnabled = false;
    const T = 32, cx = W * 0.68, cy = H * 0.56;
    for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) {
      const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      const dd = Math.hypot(x - cx, y - cy) / Math.max(W, H) * 1.3;
      const f = ART.frames[(dd > 0.42 && h < 0.5 ? 'r10_' : 't2_') + ((h * 4) | 0)];
      c.drawImage(ART.atlas, f.x, f.y, T, T, x, y, T, T);
      const o = dd > 0.2 && h > 0.72 ? (dd > 0.42 ? 'o2' : 'o1') : h > 0.66 && dd > 0.12 ? 'o4' : h < 0.02 ? 'o8' : null;
      if (o) { const of = ART.frames[o]; c.drawImage(ART.atlas, of.x, of.y, T, T, x, y, T, T); }
    }
    for (const [dx, dy, o] of [[-3, -1, 'o16'], [-3, 0, 'o16'], [-2, -1, 'o16'], [2, 1, 'o14'], [-1, 1, 'o41'], [1, -1, 'o30'], [2, -1, 'o30']]) { const of = ART.frames[o]; c.drawImage(ART.atlas, of.x, of.y, T, T, Math.round(cx / T + dx) * T, Math.round(cy / T + dy) * T, T, T); }
    return g;
  },
  draw(t) {
    const cv = this.cv, ctx = cv.getContext('2d'); const W = cv.width, H = cv.height; ctx.imageSmoothingEnabled = false;
    if (!this.ground) this.ground = this.buildGround(W, H);
    const cx = W * 0.68, cy = H * 0.56, R = Math.min(W, H) * 0.62;
    ctx.drawImage(this.ground, 0, 0);
    this.frame(ctx, 'o42', Math.round(cx / 32) * 32 + 16, Math.round(cy / 32) * 32 + 16);
    for (const z of this.zs) {
      z.d -= z.sp * 0.016 * (z.type === 'corredor' ? 2 : 1);
      if (z.d < 0.3) Object.assign(z, this.newZ(), { d: 1.25 });
      const wob = Math.sin(t * 3 + z.wob) * 0.04;
      const x = cx + Math.cos(z.a + wob) * z.d * R, y = cy + Math.sin(z.a + wob) * z.d * R;
      this.frame(ctx, 'z_' + z.type, x, y, z.a + Math.PI + wob);
    }
    // escuridão com a luz da fogueira e da tocha
    const fl = 1 + Math.sin(t * 9) * 0.03 + Math.sin(t * 23) * 0.02;
    const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, R * 0.95 * fl);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(4,4,2,0.35)'); g.addColorStop(0.8, 'rgba(4,5,3,0.82)'); g.addColorStop(1, 'rgba(3,4,2,0.95)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const w = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55 * fl); w.addColorStop(0, 'rgba(255,140,50,0.22)'); w.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = w; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
    // faúlhas e névoa
    if (Math.random() < 0.5) this.parts.push({ x: cx + (Math.random() - 0.5) * 10, y: cy, vx: (Math.random() - 0.5) * 12, vy: -20 - Math.random() * 25, l: 1.4 });
    this.parts = this.parts.filter(p => (p.l -= 0.016) > 0);
    for (const p of this.parts) { p.x += p.vx * 0.016; p.y += p.vy * 0.016; ctx.fillStyle = `rgba(255,${150 + (p.l * 70) | 0},60,${p.l / 1.4})`; ctx.fillRect(p.x | 0, p.y | 0, 1, 1); }
    for (let i = 0; i < 6; i++) {
      const fx = ((t * (5 + i) + i * 173) % (W + 300)) - 150, fy = H * (0.12 + i * 0.16);
      const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 140); fg.addColorStop(0, 'rgba(110,140,70,0.07)'); fg.addColorStop(1, 'rgba(110,140,70,0)');
      ctx.fillStyle = fg; ctx.fillRect(fx - 140, fy - 140, 280, 280);
    }
  },
};
function nameRow() { return `<div class="row"><label>O teu nome</label><input id="pname" type="text" maxlength="16" value="${esc(store.get('name', 'Sobrevivente'))}"></div>`; }
function readName() { const n = ($('#pname')?.value || '').trim() || 'Sobrevivente'; store.set('name', n); return n; }
const LOGO = `<div class="logo"><h1><span>ROT</span>BOUND</h1><p>PRESO À PODRIDÃO</p><p class="tag">De dia preparas-te. À noite aguentas.</p></div>`;

function mainMenu(msg) {
  if (R) {
    show(`${LOGO}${nameRow()}
      <button class="mbtn" id="solo">Jogar a solo<small>Um mundo só teu, sem rede.</small></button>
      <button class="mbtn" id="create">Criar jogo (LAN)<small>És o anfitrião. Até 4 jogadores na mesma rede.</small></button>
      <button class="mbtn" id="join">Entrar em jogo<small>Procura jogos na rede local ou escreve o IP.</small></button>
      <button class="mbtn" id="help">Controlos e primeiros passos</button>
      <button class="mbtn quit" id="quit">Sair</button><div class="err">${esc(msg || '')}</div>`);
    $('#solo').onclick = () => { readName(); createMenu(true); };
    $('#create').onclick = () => { readName(); createMenu(false); };
    $('#join').onclick = () => { readName(); joinMenu(); };
    $('#quit').onclick = () => R.quit();
  } else {
    const h = servedByHost;
    show(`${LOGO}${nameRow()}
      ${h ? `<button class="mbtn" id="here">Entrar em «${esc(h.name)}»<small>${h.players}/${h.max} jogadores · noite ${h.night}${h.pass ? ' · 🔒 palavra-passe' : ''}</small></button>` : ''}
      ${h?.pass ? `<div class="row"><label>Palavra-passe</label><input id="hpass" type="password"></div>` : ''}
      <button class="mbtn" id="join">Entrar noutro anfitrião (IP)<small>Para criar mundos ou jogar a solo usa a app (npm start) ou npm run server.</small></button>
      <button class="mbtn" id="help">Controlos e primeiros passos</button><div class="err">${esc(msg || '')}</div>`);
    if (h) $('#here').onclick = () => { const n = readName(); connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`, n, $('#hpass')?.value || ''); };
    $('#join').onclick = () => { readName(); joinMenu(); };
  }
  $('#help').onclick = () => { show(`<h2>Controlos</h2>${HELP_HTML}<div class="actions"><button id="back">Voltar</button></div>`); $('#back').onclick = () => mainMenu(); };
}

async function createMenu(solo) {
  const saves = await R.saves();
  show(`<h2>${solo ? 'Jogar a solo' : 'Criar jogo na LAN'}</h2>
    <div class="row"><label>Mundo</label><select id="wsel"><option value="">— Novo mundo —</option>${saves.map(s => `<option value="${esc(s.file)}">${esc(s.name)} · noite ${s.night}${s.victory ? ' · ★' : ''} · ${new Date(s.savedAt).toLocaleString('pt-PT')}</option>`).join('')}</select></div>
    <div id="newopts">
      <div class="row"><label>Nome do mundo</label><input id="wname" type="text" maxlength="24" value="${solo ? 'O meu mundo' : 'Mundo de ' + esc(store.get('name', ''))}"></div>
      <div class="row"><label>Seed</label><input id="wseed" type="text" placeholder="aleatória"></div>
      <div class="row"><label>Fogo amigo</label><input id="wff" type="checkbox"> <span class="dim small">desligado por defeito</span></div>
      <div class="row"><label>Hardcore</label><input id="whc" type="checkbox"> <span class="dim small">a morte apaga o mundo</span></div>
    </div>
    ${solo ? '' : `<div class="row"><label>Palavra-passe</label><input id="wpass" type="text" placeholder="(opcional)"></div>
    <div class="row"><label>Jogadores</label><select id="wmax"><option>2</option><option>3</option><option selected>4</option></select></div>`}
    <div class="err" id="err"></div>
    <div class="actions"><button id="back">Voltar</button>${saves.length ? '<button class="danger" id="del">Apagar mundo</button>' : ''}<button class="pri" id="go">${solo ? 'Jogar' : 'Criar e entrar'}</button></div>`);
  const sel = $('#wsel');
  sel.onchange = () => { $('#newopts').style.display = sel.value ? 'none' : 'block'; if (!sel.value) $('#wname').focus(); };
  $('#wname').focus(); $('#wname').select();
  $('#back').onclick = () => mainMenu();
  if ($('#del')) $('#del').onclick = async () => { if (!sel.value) return; if (!(await ask('Apagar este mundo para sempre?', 'Apagar'))) return; await R.deleteSave(sel.value); createMenu(solo); };
  $('#go').onclick = async () => {
    $('#err').textContent = 'A criar o mundo…';
    const name = $('#wname').value.trim() || 'Mundo';
    const res = await R.host({
      solo, file: sel.value || null, name, seed: $('#wseed').value.trim() || String(Math.floor(Math.random() * 1e9)),
      friendlyFire: $('#wff').checked, hardcore: $('#whc').checked, password: solo ? '' : $('#wpass').value, maxPlayers: solo ? 1 : +$('#wmax').value,
    });
    if (!res.ok) { $('#err').textContent = res.error; return; }
    connect(`ws://127.0.0.1:${res.port}`, store.get('name', 'Sobrevivente'), solo ? '' : $('#wpass').value, { host: true, ips: res.ips, port: res.port, solo });
  };
}

function joinMenu() {
  show(`<h2>Entrar em jogo</h2>
    ${R ? `<div class="dim small">Jogos na rede local:</div><div class="lanlist" id="lan"><div class="lan dim">A procurar…</div></div>` : ''}
    <div class="row"><label>IP do anfitrião</label><input id="ip" type="text" placeholder="ex.: 192.168.1.20" value="${esc(store.get('lastip', ''))}"></div>
    <div class="row"><label>Palavra-passe</label><input id="pass" type="password" placeholder="(se tiver)"></div>
    <div class="dim small">O anfitrião vê o seu IP no menu de pausa (Esc). Na primeira vez, o Windows pode pedir autorização à firewall: aceita para redes privadas.</div>
    <div class="err" id="err"></div>
    <div class="actions"><button id="back">Voltar</button><button class="pri" id="go">Entrar</button></div>`);
  let timer = null;
  $('#back').onclick = () => { clearInterval(timer); mainMenu(); };
  $('#go').onclick = () => {
    let ip = $('#ip').value.trim(); if (!ip) { $('#err').textContent = 'Escreve o IP do anfitrião ou escolhe um jogo da lista.'; return; }
    store.set('lastip', ip); clearInterval(timer);
    if (!/:\d+$/.test(ip)) ip += ':' + PORT;
    connect(`ws://${ip}`, store.get('name', 'Sobrevivente'), $('#pass').value);
  };
  if (R) {
    const refresh = async () => {
      const list = await R.lan(); const box = $('#lan'); if (!box) return clearInterval(timer);
      box.innerHTML = list.length ? list.map(g => `<div class="lan" data-ip="${esc(g.ip)}:${g.port}"><span><b>${esc(g.name)}</b> <span class="dim">· ${esc(g.host)} · noite ${g.night}</span></span><span>${g.players}/${g.max}${g.pass ? ' 🔒' : ''}</span></div>`).join('') : '<div class="lan dim">Nenhum jogo encontrado (podes escrever o IP abaixo).</div>';
      box.querySelectorAll('.lan[data-ip]').forEach(d => { d.onclick = () => { $('#ip').value = d.dataset.ip; box.querySelectorAll('.lan').forEach(x => x.classList.remove('on')); d.classList.add('on'); }; d.ondblclick = () => $('#go').click(); });
    };
    refresh(); timer = setInterval(refresh, 1000);
  }
}

// ======================= Ligação e jogo =======================
async function connect(url, name, pass, hostInfo = null) {
  $('#loading').style.display = 'flex'; $('#loading').textContent = 'A ligar…';
  const net = new Net();
  let welcome;
  try { welcome = await net.connect(url, name, pass); }
  catch (e) { $('#loading').style.display = 'none'; if (hostInfo && R) await R.stopHost(); return mainMenu(e.message); }
  $('#menu').style.display = 'none'; menuBg.stop(); $('#menu').innerHTML = '';
  startGame(net, welcome, hostInfo);
}

function startGame(net, w, hostInfo) {
  const world = new ClientWorld(w.seed); world.rot.load(w.rot);
  G = {
    net, world, items: DATA.items, recipes: DATA.recipes, art: ART, seed: w.seed, myId: w.id, worldName: w.name,
    host: hostInfo, ips: w.ips || [], port: w.port, isLocal: w.local,
    me: { x: w.spawn.x, y: w.spawn.y }, pred: { x: w.spawn.x, y: w.spawn.y, stamina: 100, dodgeT: 0, kx: 0, ky: 0 }, pending: [], seq: 0, offX: 0, offY: 0,
    players: [], plSnaps: [], entSnaps: [], drops: [], pings: [], powered: new Set(w.pw || []), rotCache: new Map(), unlocked: new Set(w.rec || []),
    time: w.time, clock: w.time.c, inv: null, meState: null, keys: new Set(), mouseL: false, mouseR: false, build: false, dead: false, paused: false,
    zoom: store.get('zoom', Math.max(1, Math.min(2, Math.round(innerHeight / 650 * 2) / 2))), aim: 0, dodgeReq: false, gotFirst: false,
    held() { return G.inv ? G.inv.inv[G.inv.sel] : null; },
    setZoom(z) { const nz = snapZoom(z); G.zoom = nz === G.zoom ? snapZoom(z > G.zoom ? G.zoom + 1 / 32 : G.zoom - 1 / 32) : nz; store.set('zoom', G.zoom); G.scene?.applyZoom(); G.hud?.toast(`Zoom ${Math.round(G.zoom * 100)} %`); },
    selectSlot(i) { i = ((i % 8) + 8) % 8; if (G.inv) { G.inv.sel = i; G.hud.setInv(G.inv); } net.send({ t: 'sel', i }); },
  };
  G.hud = new Hud(G);
  // camada de luz
  const lc = $('#light'); G.lightCanvas = lc; G.lightCtx = lc.getContext('2d');
  const resize = () => { lc.width = Math.ceil(innerWidth / 2); lc.height = Math.ceil(innerHeight / 2); };
  resize(); window.addEventListener('resize', resize); G._resize = resize;

  // ---- mensagens ----
  net.onBinary = (buf) => {
    const dv = new DataView(buf); const t = dv.getUint8(0);
    if (t === 2) { const c = world.addChunkBin(buf); G.hud.markChunk(c); G.rotCache.delete(c.cx + c.cy * 64); }
    else if (t === 1) {
      const n = dv.getUint16(2, true); const m = new Map(); let o = 8;
      for (let i = 0; i < n; i++, o += 16) m.set(dv.getUint32(o, true), { id: dv.getUint32(o, true), k: dv.getUint8(o + 4), x: dv.getFloat32(o + 5, true), y: dv.getFloat32(o + 9, true), hp: dv.getUint8(o + 13), f: dv.getUint8(o + 14), a: dv.getUint8(o + 15) / 255 * Math.PI * 2 - Math.PI });
      G.entSnaps.push({ t: performance.now(), m }); if (G.entSnaps.length > 6) G.entSnaps.shift();
    }
  };
  net.on('s', (m) => {
    G.time = m.time;
    if (Math.abs(G.clock - m.time.c) > 1.5) G.clock = m.time.c; else G.clock += (m.time.c - G.clock) * 0.1;
    G.players = m.pl; G.plSnaps.push({ t: performance.now(), pl: m.pl }); if (G.plSnaps.length > 8) G.plSnaps.shift();
    const mine = m.pl.find(p => p.id === G.myId);
    const me = m.me; G.meState = me;
    const wasDead = G.dead; G.dead = !!(mine && mine.f & 2);
    const p = G.pred; const bx = p.x, by = p.y;
    Object.assign(p, { x: me.x, y: me.y, dodgeT: me.dT, dodgeX: me.dX, dodgeY: me.dY, kx: me.kx, ky: me.ky, stamina: me.st, exhausted: me.st < 5, downed: !!(mine && mine.f & 1), lying: !!(mine && mine.f & 4), dead: G.dead });
    G.pending = G.pending.filter(i => i.s > me.ack);
    for (const i of G.pending) stepPlayer(p, i, world, DT);
    const dx = bx - p.x, dy = by - p.y; const sc = G.scene;
    if (!G.gotFirst || Math.hypot(dx, dy) > 4 || wasDead !== G.dead) { G.offX = G.offY = 0; if (sc) { sc.prevX = p.x; sc.prevY = p.y; sc.camX = p.x; sc.camY = p.y; } G.me.x = p.x; G.me.y = p.y; G.gotFirst = true; }
    else { G.offX += dx; G.offY += dy; if (sc && sc.prevX != null) { sc.prevX -= dx; sc.prevY -= dy; } }
    if (m.fx && sc) sc.fx(m.fx);
    // infeção alta: visão turva
    const gc = $('#game'); const inf = me.in;
    gc.style.filter = inf > 50 ? `blur(${((inf - 50) / 50 * 2).toFixed(2)}px) saturate(${1 - (inf - 50) / 120})` : '';
  });
  net.on('fx', (m) => G.scene && G.scene.fx(m.l));
  net.on('tiles', (m) => { for (const c of world.applyTiles(m.l)) G.hud.markChunk(c); });
  net.on('inv', (m) => { G.inv = m; G.hud.setInv(m); });
  net.on('drops', (m) => { G.drops = m.l; });
  net.on('n', (m) => { G.hud.notice(m.text, m.kind); if (m.snd) audio.play(m.snd); G.hud.chat(null, m.text); });
  net.on('toast', (m) => G.hud.toast(m.text));
  net.on('chat', (m) => G.hud.chat(m.from, m.text, m.c));
  net.on('emote', (m) => { G.scene?.bubble(m.id, m.text); const p = G.players.find(p => p.id === m.id); G.hud.chat(p?.n || '?', m.text, p?.c); audio.play('click'); });
  net.on('ping', (m) => { G.pings.push({ x: m.x, y: m.y, from: m.from, c: m.c, t: performance.now() }); audio.play('pickup'); });
  net.on('note', (m) => G.hud.note(m.text));
  net.on('chest', (m) => G.hud.openChest(m));
  net.on('chestClose', () => G.hud.closeChest());
  net.on('quests', (m) => G.hud.setQuests(m));
  net.on('ach', (m) => G.hud.setAch(m));
  net.on('achv', (m) => { G.hud.achPopup(m); audio.play('victory'); G.hud.chat(null, `Conquista desbloqueada: ${m.title}`); });
  net.on('rec', (m) => { G.unlocked = new Set(m.l); if (G.hud.panel) G.hud.renderPanel(); });
  net.on('pw', (m) => { G.powered = new Set(m.l); });
  net.on('rot', (m) => { world.rot.load(m.rot); G.rotCache.clear(); G.hud.markAllChunks(); });
  net.onClose = (reason) => endGame(reason || 'Ligação ao anfitrião perdida.');

  // ---- teclado ----
  const kd = (e) => {
    if (G.hud.typing) return;
    const c = e.code;
    if (c === 'Tab') { e.preventDefault(); if (!G.paused) G.hud.togglePanel(); return; }
    if (c === 'Escape') { if (G.hud.mapOpen) G.hud.toggleMap(); else if (G.hud.panel) G.hud.closePanel(); else togglePause(); return; }
    if (G.paused) return;
    if (c === 'Enter') { e.preventDefault(); G.hud.openChat(); G.keys.clear(); return; }
    if (e.repeat) { G.keys.add(c); return; }
    G.keys.add(c);
    if (c.startsWith('Digit')) { const i = +c.slice(5) - 1; if (i >= 0 && i < 8) G.selectSlot(i); }
    const w = G.scene ? G.scene.mouseWorld() : G.me;
    switch (c) {
      case 'Space': e.preventDefault(); G.dodgeReq = true; break;
      case 'KeyM': G.hud.toggleMap(); break;
      case 'KeyJ': G.hud.toggleQuests(); break;
      case 'KeyB': G.build = !G.build; net.send({ t: 'build', on: G.build }); break;
      case 'KeyE': net.send({ t: 'e', x: w.x, y: w.y }); net.send({ t: 'eh', on: true }); break;
      case 'KeyR': net.send({ t: 'reload' }); break;
      case 'KeyQ': net.send({ t: 'drop', all: e.shiftKey }); break;
      case 'KeyG': net.send({ t: 'give' }); break;
      case 'KeyV': net.send({ t: 'shout' }); break;
      case 'KeyZ': net.send({ t: 'emote', k: 'ajuda' }); break;
      case 'KeyX': net.send({ t: 'emote', k: 'aqui' }); break;
      case 'KeyC': net.send({ t: 'emote', k: 'municao' }); break;
      case 'Equal': case 'NumpadAdd': G.setZoom(G.zoom * 1.12); break;
      case 'Minus': case 'NumpadSubtract': G.setZoom(G.zoom / 1.12); break;
    }
  };
  const ku = (e) => { G.keys.delete(e.code); if (e.code === 'KeyE') net.send({ t: 'eh', on: false }); };
  const blur = () => { G.keys.clear(); G.mouseL = G.mouseR = false; };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', blur);
  G._unbind = () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur); window.removeEventListener('resize', resize); };

  G.phaser = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', backgroundColor: '#000000', pixelArt: true, roundPixels: true, banner: false,
    scale: { mode: Phaser.Scale.RESIZE, width: innerWidth, height: innerHeight }, audio: { noAudio: true },
    scene: [makeScene(G)],
  });
  $('#loading').style.display = 'none';
  const hostMsg = hostInfo && !hostInfo.solo ? ` Os amigos entram com o IP ${(G.ips[0] || '?')}:${G.port} (Esc para ver).` : '';
  setTimeout(() => G?.hud.notice(`Bem-vindo a ${w.name}.${hostMsg}`, 'info'), 600);
  setTimeout(() => G?.hud.toast('Tab: inventário e crafting · B: construção · M: mapa'), 1500);
}

function togglePause() {
  const p = $('#pause');
  if (G.paused) { G.paused = false; p.style.display = 'none'; return; }
  G.paused = true; G.keys.clear(); G.mouseL = false;
  const ips = G.ips.length ? G.ips.map(i => `${i}:${G.port}`).join('<br>') : 'sem rede local';
  p.innerHTML = `<div class="box"><h2>Pausa <span class="dim small">(o mundo continua a correr)</span></h2>
    <p>Mundo: <b>${esc(G.worldName)}</b> · seed ${G.seed}</p>
    ${G.host && !G.host.solo ? `<div>És o anfitrião. IP para os amigos:</div><div class="ipbox">${ips}</div><div class="dim small">No navegador também podem abrir http://IP:${G.port}</div>` : ''}
    <div class="row"><label>Volume</label><input id="vol" type="range" min="0" max="1" step="0.05" value="${audio.volume}" style="flex:1"></div>
    <div class="row"><label>Zoom</label><input id="zm" type="range" min="0.5" max="3" step="0.05" value="${G.zoom}" style="flex:1"></div>
    <div class="actions"><button class="pri" id="res">Continuar</button><button id="ctl">Controlos</button><button id="leave">${G.host ? 'Gravar e sair' : 'Sair para o menu'}</button></div></div>`;
  p.style.display = 'flex';
  $('#vol').oninput = (e) => { audio.setVolume(+e.target.value); store.set('vol', +e.target.value); };
  $('#zm').oninput = (e) => { G.zoom = +e.target.value; store.set('zoom', G.zoom); G.scene?.applyZoom(); };
  $('#zm').title = 'Também podes usar Ctrl + roda do rato';
  $('#res').onclick = () => togglePause();
  $('#ctl').onclick = () => { togglePause(); G.hud.togglePanel('help'); };
  $('#leave').onclick = () => endGame(null, true);
}

async function endGame(reason, voluntary) {
  if (!G) return;
  const g = G; G = null;
  g.net.onClose = null; g._unbind();
  try { g.phaser.destroy(true); } catch {}
  g.hud.destroy(); $('#pause').style.display = 'none'; $('#game').style.filter = '';
  const lc = $('#light'); lc.getContext('2d').clearRect(0, 0, lc.width, lc.height);
  g.net.close();
  if (g.host && R) await R.stopHost();
  mainMenu(voluntary ? (g.host ? 'Mundo gravado.' : '') : reason);
}

boot().catch(e => { document.body.innerHTML = `<pre style="color:#f88;padding:20px">Erro a arrancar: ${esc(e.stack || e)}</pre>`; });
