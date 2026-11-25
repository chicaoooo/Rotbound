// HUD e janelas (HTML por cima do jogo): barras, barra rápida, relógio, minimapa, inventário,
// crafting, habilidades, baús, mapa, chat e avisos.
import { icons } from './art.js';
import { recipeState, learnable, alwaysOn } from '../shared/recipes.js';
import { SKILLS, TREES } from '../shared/skills.js';
import { OBJECTS, TERRAIN, O, T, CHUNK, CHUNKS, WORLD, CENTER, PLAYER_COLORS, PHASES, DAY_LENGTH, phaseAt, STATIONS, SLOT } from '../shared/constants.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const colorCss = (i) => '#' + (PLAYER_COLORS[i] ?? 0xcccccc).toString(16).padStart(6, '0');

export class Hud {
  constructor(game) {
    this.g = game; this.items = game.items; this.recipes = game.recipes;
    this.root = $('#hud'); this.root.innerHTML = HUD_HTML; this.root.style.display = 'block';
    this.inv = null; this.panel = null; this.tab = 'inv'; this.pick = null; this.chest = null; this.mapOpen = false;
    this.craftStation = 'maos'; this.mapZoom = 2; this.markers = [];
    try { this.markers = JSON.parse(localStorage.getItem('rb_markers_' + game.seed) || '[]'); } catch { this.markers = []; }
    this.chunkImgs = new Map();
    this.buildHotbar();
    this.mini = $('#minimap'); this.miniCtx = this.mini.getContext('2d');
    this.map = $('#mapcanvas'); this.mapCtx = this.map.getContext('2d');
    $('#chatin').addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const t = e.target.value.trim(); if (t) this.g.net.send({ t: 'chat', text: t }); e.target.value = ''; this.closeChat(); }
      if (e.key === 'Escape') { e.target.value = ''; this.closeChat(); }
    });
    this.root.addEventListener('contextmenu', e => e.preventDefault());
    this.map.addEventListener('wheel', (e) => { this.mapZoom = Math.max(0.5, Math.min(6, this.mapZoom * (e.deltaY < 0 ? 1.25 : 0.8))); e.preventDefault(); });
    this.map.addEventListener('mousedown', (e) => {
      const r = this.map.getBoundingClientRect(); const me = this.g.me; const z = this.mapZoom;
      const wx = me.x + (e.clientX - r.left - r.width / 2) / z, wy = me.y + (e.clientY - r.top - r.height / 2) / z;
      if (e.button === 1) this.g.net.send({ t: 'ping', x: wx, y: wy, kind: 'mapa' });
      else if (e.button === 2) { this.markers = this.markers.filter(m => Math.hypot(m.x - wx, m.y - wy) > 12 / z); }
      else if (e.button === 0) this.markers.push({ x: wx, y: wy });
      try { localStorage.setItem('rb_markers_' + this.g.seed, JSON.stringify(this.markers)); } catch {}
      e.preventDefault();
    });
    this.tip = $('#tip');
    this.cursorInfo = $('#cursorinfo');
    window.addEventListener('mousemove', (e) => { this.mouseX = e.clientX; this.mouseY = e.clientY; this.cursorInfo.style.left = e.clientX + 18 + 'px'; this.cursorInfo.style.top = e.clientY + 14 + 'px'; if (this.tip.style.display === 'block') { this.tip.style.left = Math.min(innerWidth - 260, e.clientX + 16) + 'px'; this.tip.style.top = Math.min(innerHeight - 140, e.clientY + 16) + 'px'; } });
  }
  destroy() { this.root.innerHTML = ''; this.root.style.display = 'none'; }
  get typing() { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); }
  get blocking() { return !!this.panel || this.mapOpen || this.typing || this.g.paused; }

  // ---------- barra rápida ----------
  buildHotbar() {
    const hb = $('#hotbar');
    for (let i = 0; i < 8; i++) {
      const s = el('div', 'slot hot', `<span class="key">${i + 1}</span>`); s.dataset.i = i;
      s.addEventListener('mousedown', (e) => { if (this.panel === 'inv') this.slotClick({ c: 'p', i }, e); else { this.g.selectSlot(i); } e.stopPropagation(); });
      this.hover(s, () => this.inv?.inv[i]);
      hb.appendChild(s);
    }
  }
  slotHtml(it) {
    if (!it) return '';
    const d = this.items[it.id]; let h = `<img src="${icons[it.id]}" draggable="false">`;
    if (it.n > 1) h += `<span class="n">${it.n}</span>`;
    if (d?.dur && it.d != null && it.d < d.dur) { const f = Math.max(0, it.d / d.dur); h += `<span class="dur"><i style="width:${f * 100}%;background:${f > 0.5 ? '#6c6' : f > 0.2 ? '#dc4' : '#d44'}"></i></span>`; }
    if (d?.kind === 'ranged' && !d.bow) h += `<span class="ammo">${it.a}</span>`;
    return h;
  }
  hover(node, getItem) {
    node.addEventListener('mouseenter', () => { const it = getItem(); if (!it) return; this.showTip(it); });
    node.addEventListener('mouseleave', () => { this.tip.style.display = 'none'; });
  }
  showTip(it) {
    const d = this.items[it.id]; if (!d) return;
    let s = `<b>${esc(d.name)}</b>`;
    if (d.kind === 'melee') s += `<br>Dano ${d.dmg} · ${d.cd <= 0.4 ? 'Rápida' : d.cd >= 0.7 ? 'Lenta' : 'Média'} · alcance ${d.range}`;
    if (d.kind === 'ranged') s += `<br>Dano ${d.dmg}${d.pellets ? ' × ' + d.pellets : ''} · ${d.bow ? 'silencioso' : 'ruído ' + d.noise + ' blocos'}<br>Munição: ${this.items[d.ammo].name}${d.mag > 1 ? ' · carregador ' + d.mag : ''}`;
    if (d.axe) s += `<br>Corta árvores (força ${d.axe})`;
    if (d.pick) s += `<br>Mina ${d.pick >= 2 ? 'pedra, ferro e cristais' : 'pedra, carvão, ferro e enxofre'}`;
    if (d.kind === 'food') s += `<br>+${d.food} de fome${d.inf > 0 ? ` · <span class="bad">+${d.inf} infeção</span>` : d.inf < 0 ? ` · ${d.inf} infeção` : ''}${d.regen ? ' · regenera vida' : ''}`;
    if (d.kind === 'med') s += `<br>${d.heal ? '+' + d.heal + ' vida ' : ''}${d.inf ? d.inf + ' infeção ' : ''}${d.vaccine ? 'imune à infeção ' + d.vaccine + ' noites' : ''}`;
    if (d.kind === 'armor') s += `<br>Reduz o dano em ${Math.round(d.red * 100)} %`;
    if (d.kind === 'place') { const o = OBJECTS[d.obj]; s += `<br>Bloco · vida ${o.hp}<br><span class="dim">Clique direito para colocar (ou B)</span>`; }
    if (d.kind === 'food' || d.kind === 'med' || d.kind === 'book') s += `<br><span class="dim">Clique esquerdo para ${d.kind === 'book' ? 'ler' : 'usar'}</span>`;
    if (d.kind === 'book') { const l = learnable(this.recipes, d.st); const kn = l.filter(r => this.g.unlocked.has(r.id)).length; s += `<br>${esc(STATIONS[d.st].name)}: ${kn}/${l.length} receitas aprendidas`; }
    if (d.dur && it.d != null) s += `<br><span class="dim">Durabilidade ${Math.max(0, Math.round(it.d))}/${d.dur}</span>`;
    if (d.desc) s += `<br><span class="dim">${esc(d.desc)}</span>`;
    this.tip.innerHTML = s; this.tip.style.display = 'block';
  }
  setInv(m) {
    this.inv = m;
    const hs = document.querySelectorAll('#hotbar .slot');
    hs.forEach((s, i) => { s.innerHTML = `<span class="key">${i + 1}</span>` + this.slotHtml(m.inv[i]); s.classList.toggle('sel', i === m.sel); });
    if (this.panel === 'inv') this.renderPanel();
  }

  // ---------- painel (Tab) ----------
  togglePanel(tab) {
    if (this.panel && (!tab || this.tab === tab)) return this.closePanel();
    this.panel = 'inv'; if (tab) this.tab = tab; this.renderPanel(); $('#panel').style.display = 'flex';
  }
  closePanel() {
    this.panel = null; this.pick = null; $('#panel').style.display = 'none'; this.tip.style.display = 'none';
    if (this.chest) { this.g.net.send({ t: 'chestClose' }); this.chest = null; }
  }
  openChest(m) { this.chest = m; this.panel = 'inv'; this.tab = 'inv'; $('#panel').style.display = 'flex'; this.renderPanel(); }
  closeChest() { if (this.chest) { this.chest = null; if (this.panel) this.renderPanel(); } }
  slotClick(ref, e) {
    if (e.button === 0 && e.shiftKey) { this.g.net.send({ t: 'quick', from: ref }); this.pick = null; return this.renderPanel(); }
    if (!this.pick) {
      const it = this.refItem(ref); if (!it) return;
      this.pick = { ...ref, half: e.button === 2 }; return this.renderPanel();
    }
    if (this.pick.c !== ref.c || this.pick.i !== ref.i) this.g.net.send({ t: 'inv', from: { c: this.pick.c, i: this.pick.i }, to: ref, half: this.pick.half });
    this.pick = null; this.renderPanel();
  }
  refItem(ref) {
    if (!this.inv) return null;
    if (ref.c === 'p') return this.inv.inv[ref.i]; if (ref.c === 'a') return this.inv.armor[ref.i]; if (ref.c === 'c') return this.chest?.slots[ref.i];
    return null;
  }
  makeSlot(ref, it, extraCls = '') {
    const s = el('div', 'slot ' + extraCls, this.slotHtml(it));
    if (this.pick && this.pick.c === ref.c && this.pick.i === ref.i) s.classList.add('picked');
    s.addEventListener('mousedown', (e) => { this.slotClick(ref, e); e.stopPropagation(); e.preventDefault(); });
    this.hover(s, () => this.refItem(ref));
    return s;
  }
  renderPanel() {
    const p = $('#panel'); if (!this.panel || !this.inv) return;
    const tabs = $('#tabs', p);
    tabs.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.t === this.tab); b.onclick = () => { this.tab = b.dataset.t; this.renderPanel(); }; });
    const aB = tabs.querySelector('[data-t=ach]'); if (this.ach) aB.innerHTML = `Conquistas <span class="dim small">${this.ach.filter(a => a.done).length}/${this.ach.length}</span>`;
    const spB = tabs.querySelector('[data-t=skills]'); spB.innerHTML = 'Habilidades' + (this.inv.sp ? ` <span class="badge">${this.inv.sp}</span>` : '');
    const body = $('#pbody', p); this._rendering = true; body.innerHTML = '';
    if (this.tab === 'inv') this.renderInv(body);
    if (this.tab === 'craft') this.renderCraft(body);
    if (this.tab === 'skills') this.renderSkills(body);
    if (this.tab === 'ach') this.renderAch(body);
    if (this.tab === 'help') body.innerHTML = HELP_HTML;
    this._rendering = false;
    if (this.tab === 'craft' && this._searchFocus) { const i = $('#craftsearch'); if (i) { i.focus(); const c = this._caret ?? i.value.length; i.setSelectionRange(c, c); } }
  }
  renderInv(body) {
    const m = this.inv;
    const left = el('div', 'col');
    left.appendChild(el('h3', '', `Inventário <span class="dim">(${m.size - 8}${m.size > 32 ? ' com mochila' : ''} espaços + barra rápida)</span>`));
    const hot = el('div', 'grid g8'); for (let i = 0; i < 8; i++) hot.appendChild(this.makeSlot({ c: 'p', i }, m.inv[i], i === m.sel ? 'sel' : '')); left.appendChild(hot);
    const main = el('div', 'grid g8 mt'); for (let i = 8; i < m.size; i++) main.appendChild(this.makeSlot({ c: 'p', i }, m.inv[i])); left.appendChild(main);
    const ar = el('div', 'armor'); ['Cabeça', 'Peito', 'Pernas'].forEach((n, i) => { const w = el('div', 'arw'); w.appendChild(this.makeSlot({ c: 'a', i }, m.armor[i], 'arm')); w.appendChild(el('span', 'dim', n)); ar.appendChild(w); });
    left.appendChild(el('h3', 'mt', 'Armadura'));
    left.appendChild(ar);
    left.appendChild(el('p', 'dim small', 'Clique para pegar e clique noutro espaço para largar · Shift+clique move rápido · clique direito pega metade · Q larga o item da mão · G dá a um companheiro'));
    body.appendChild(left);
    if (this.chest) {
      const right = el('div', 'col');
      right.appendChild(el('h3', '', 'Baú' + (this.chest.lock ? ` <span class="dim">🔒 ${esc(this.chest.lock)}</span>` : ' <span class="dim">(partilhado)</span>')));
      const g = el('div', 'grid g6'); this.chest.slots.forEach((it, i) => g.appendChild(this.makeSlot({ c: 'c', i }, it))); right.appendChild(g);
      body.appendChild(right);
    } else {
      const right = el('div', 'col stats');
      const lvl = `<h3>Nível ${m.lvl}</h3><div class="xpbar"><i style="width:${(m.xp / m.need * 100).toFixed(0)}%"></i></div><p class="dim">${m.xp} / ${m.need} XP${m.sp ? ` · <b class="good">${m.sp} ponto(s) para gastar</b>` : ''}</p>`;
      right.innerHTML = lvl + `<p class="dim">${m.bed ? 'Cama: ' + m.bed.x + ', ' + m.bed.y : 'Sem cama (renasces no ponto inicial)'}</p>`;
      body.appendChild(right);
    }
  }
  stationsNear() {
    const s = new Set(['maos']); const w = this.g.world; const me = this.g.me;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const o = OBJECTS[w.getO(Math.floor(me.x) + dx, Math.floor(me.y) + dy)]; if (o?.station) s.add(o.station); }
    return s;
  }
  count(id) { let n = 0; for (const it of this.inv.inv) if (it && it.id === id) n += it.n; return n; }
  renderCraft(body) {
    const near = this.stationsNear();
    const wrap = el('div', 'craft');
    const st = el('div', 'stations');
    for (const k of ['maos', 'bancada', 'forja', 'bancada_armas', 'laboratorio', 'fogueira']) {
      const l = learnable(this.recipes, k); const kn = l.filter(r => this.g.unlocked.has(r.id)).length;
      const prog = l.length ? ` <span class="prog">${kn}/${l.length}</span>` : '';
      const b = el('button', (this.craftStation === k ? 'on ' : '') + (near.has(k) ? 'near' : ''), STATIONS[k].name + (near.has(k) ? ' ✓' : '') + prog);
      b.onclick = () => { this.craftStation = k; this.renderPanel(); }; st.appendChild(b);
    }
    // barra de pesquisa: procura em todas as estações
    const sbar = el('div', 'csearch');
    const inp = el('input'); inp.type = 'text'; inp.id = 'craftsearch'; inp.placeholder = 'Pesquisar item… (procura em todas as bancadas)'; inp.value = this.craftQuery || ''; inp.autocomplete = 'off';
    const clr = el('button', 'cclear', '✕'); clr.title = 'Limpar'; clr.style.visibility = this.craftQuery ? 'visible' : 'hidden';
    sbar.append(inp, clr); wrap.appendChild(sbar);
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { if (inp.value) { this.craftQuery = ''; this.renderPanel(); } else inp.blur(); e.preventDefault(); }
      if (e.key === 'Tab') { e.preventDefault(); inp.blur(); this.closePanel(); }
      if (e.key === 'Enter') { const first = list.querySelector('.recipe.can .mk'); if (first) first.click(); }
    });
    inp.addEventListener('keyup', (e) => e.stopPropagation());
    inp.addEventListener('input', () => { this.craftQuery = inp.value; this._searchFocus = true; this._caret = inp.selectionStart; this.renderPanel(); });
    inp.addEventListener('focus', () => { this._searchFocus = true; });
    inp.addEventListener('blur', () => { if (!this._rendering) this._searchFocus = false; });
    clr.onclick = () => { this.craftQuery = ''; this._searchFocus = true; this._caret = 0; this.renderPanel(); };
    const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const q = norm((this.craftQuery || '').trim());
    if (!q) wrap.appendChild(st);
    const list = el('div', 'rlist');
    let recipes;
    if (q) {
      // primeiro os itens cujo nome corresponde; depois os que usam esse item como ingrediente
      const byName = this.recipes.filter(r => norm(this.items[r.out].name).includes(q) || norm(r.out).includes(q));
      const byIng = this.recipes.filter(r => !byName.includes(r) && Object.keys(r.in).some(id => norm(this.items[id].name).includes(q)));
      recipes = [...byName, ...byIng];
      const nb = byName.length;
      list.appendChild(el('p', 'dim small sres', recipes.length ? `${nb} resultado(s)${byIng.length ? ` · e ${byIng.length} receita(s) que usam este item` : ''}` : 'Nenhum item encontrado.'));
      recipes._split = nb;
    } else {
      recipes = this.recipes.filter(r => r.st === this.craftStation);
      if (!near.has(this.craftStation)) list.appendChild(el('p', 'warnp', `Tens de estar a menos de 3 blocos de: ${this.craftStation === 'fogueira' ? 'uma Fogueira' : STATIONS[this.craftStation].name}.`));
    }
    recipes.forEach((r, idx) => {
      if (q && idx === recipes._split && idx > 0) list.appendChild(el('p', 'dim small sres', 'Receitas que usam este item:'));
      const d = this.items[r.out];
      const ok = near.has(r.st);
      const rs = recipeState(r, this.g.unlocked, this.recipes);
      const can = rs.ok && ok && Object.entries(r.in).every(([id, q2]) => this.count(id) >= q2);
      const row = el('div', 'recipe' + (can ? ' can' : '') + (rs.ok ? '' : ' locked'));
      const stName = r.st === 'maos' ? 'Mãos' : STATIONS[r.st].name;
      const stTag = q ? `<span class="sttag ${ok ? 'near' : ''}" title="${ok ? 'Estás perto desta estação' : 'Precisas de estar perto desta estação'}">${esc(stName)}${ok ? ' ✓' : ''}</span>` : '';
      row.innerHTML = `<img src="${icons[r.out]}"><div class="rn"><b>${rs.ok ? '' : '🔒 '}${esc(d.name)}${r.n > 1 ? ' ×' + r.n : ''}</b>${stTag}${rs.ok ? '' : `<div class="lockmsg">${rs.gate ? `Aprende todas as receitas desta estação (${rs.have}/${rs.need})` : `Encontra um <img src="${icons[rs.book]}">${esc(this.items[rs.book].name)} (estantes)`}</div>`}<div class="ing">${Object.entries(r.in).map(([id, q2]) => `<span class="${this.count(id) >= q2 ? '' : 'miss'}"><img src="${icons[id]}">${q2} ${esc(this.items[id].name)}</span>`).join('')}</div></div>`;
      const b = el('button', 'mk', rs.ok ? 'Fazer' : '🔒'); b.disabled = !can;
      b.onclick = (e) => { this.g.net.send({ t: 'craft', r: r.id, n: e.shiftKey ? 5 : 1 }); };
      row.appendChild(b);
      const tag = row.querySelector('.sttag'); if (tag) tag.onclick = () => { this.craftStation = r.st; this.craftQuery = ''; this._searchFocus = false; this.renderPanel(); };
      this.hover(row.querySelector('img'), () => ({ id: r.out, n: 1 }));
      list.appendChild(row);
    });
    wrap.appendChild(list);
    const held = this.inv.inv[this.inv.sel];
    if (held && this.items[held.id]?.dur && held.d < this.items[held.id].dur) {
      const rb = el('button', 'repair', `Reparar ${esc(this.items[held.id].name)} (metade dos materiais, na estação onde foi feito)`);
      rb.onclick = () => this.g.net.send({ t: 'repair' }); wrap.appendChild(rb);
    }
    wrap.appendChild(el('p', 'dim small', 'Shift+clique em Fazer cria 5 de uma vez · Enter na pesquisa faz o primeiro item possível · clica na estação de um resultado para a abrir.'));
    body.appendChild(wrap);
  }
  renderSkills(body) {
    const m = this.inv;
    const wrap = el('div', 'skills');
    wrap.appendChild(el('p', '', `Pontos disponíveis: <b class="${m.sp ? 'good' : ''}">${m.sp}</b> · Ganhas 1 ponto por nível (XP de matar, recolher, criar e sobreviver noites).`));
    const cols = el('div', 'scols');
    for (const tr of TREES) {
      const c = el('div', 'scol'); c.appendChild(el('h3', '', tr));
      for (const [k, s] of Object.entries(SKILLS).filter(([, s]) => s.tree === tr)) {
        const lv = m.skills[k] || 0;
        const row = el('div', 'skill', `<b>${esc(s.name)}</b><div class="pips">${[0, 1, 2].map(i => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div><div class="dim small">${esc(s.desc)}</div>`);
        if (m.sp > 0 && lv < 3) { const b = el('button', 'plus', '+'); b.onclick = () => this.g.net.send({ t: 'skill', k }); row.appendChild(b); }
        c.appendChild(row);
      }
      cols.appendChild(c);
    }
    wrap.appendChild(cols); body.appendChild(wrap);
  }

  // ---------- missões (canto superior direito) ----------
  setQuests(m) { this.quests = m; this.renderQuests(); }
  toggleQuests() { this.questsHidden = !this.questsHidden; try { localStorage.setItem('rb_qhide', this.questsHidden ? '1' : ''); } catch {} this.renderQuests(); }
  renderQuests() {
    const box = $('#quests'); const m = this.quests; if (!box || !m) return;
    if (this.questsHidden == null) { try { this.questsHidden = localStorage.getItem('rb_qhide') === '1'; } catch { this.questsHidden = false; } }
    const rew = (r) => r && r.length ? `<div class="qrew" title="Recompensa">🎁${r.map(([id, n]) => `<img src="${icons[id]}">${n}`).join(' ')}</div>` : '';
    const bar = (p, n) => `<div class="qbar"><i style="width:${Math.min(100, p / n * 100)}%"></i></div><span class="qn">${p}/${n}</span>`;
    const prevMain = this._lastMain;
    let h = `<div class="qhead"><span>MISSÕES</span><span class="dim">J ${this.questsHidden ? 'mostrar' : 'esconder'}</span></div>`;
    if (!this.questsHidden) {
      if (m.main) h += `<div class="quest main${prevMain && prevMain !== m.main.t ? ' new' : ''}"><div class="qt"><span class="qnum">${m.idx + 1}/${m.total}</span> ${esc(m.main.t)}</div><div class="qd">${esc(m.main.d)}</div><div class="qprog">${bar(m.main.p, m.main.n)}${rew(m.main.rew)}</div></div>`;
      else h += `<div class="quest main done"><div class="qt">★ Todas as missões principais cumpridas</div></div>`;
      if (m.daily.length) h += `<div class="qsub">Diárias <span class="dim">(mudam ao amanhecer)</span></div>`;
      for (const q of m.daily) h += `<div class="quest${q.done ? ' done' : ''}"><div class="qt">${q.done ? '✓ ' : ''}${esc(q.t)}</div>${q.done ? '' : `<div class="qd">${esc(q.d)}</div><div class="qprog">${bar(q.p, q.n)}${rew(q.rew)}</div>`}</div>`;
    }
    box.innerHTML = h; this._lastMain = m.main?.t;
  }

  // ---------- conquistas ----------
  setAch(m) { this.ach = m.l; if (this.panel && this.tab === 'ach') this.renderPanel(); }
  achPopup(m) {
    const n = $('#achpop'); const d = el('div', 'achpop', `<img src="${icons[m.icon]}"><div><div class="ahead">CONQUISTA DESBLOQUEADA</div><b>${esc(m.title)}</b><div class="dim small">${esc(m.d)}</div></div>`);
    n.appendChild(d); setTimeout(() => d.classList.add('fade'), 4500); setTimeout(() => d.remove(), 5300);
  }
  renderAch(body) {
    const list = this.ach || [];
    const done = list.filter(a => a.done).length;
    const wrap = el('div', 'achwrap');
    wrap.appendChild(el('div', 'achtop', `<b>${done} / ${list.length}</b> conquistas do grupo <div class="xpbar"><i style="width:${list.length ? done / list.length * 100 : 0}%"></i></div>`));
    const cats = [...new Set(list.map(a => a.cat))];
    for (const c of cats) {
      wrap.appendChild(el('h3', 'mt', esc(c)));
      const g = el('div', 'achgrid');
      for (const a of list.filter(a => a.cat === c)) {
        const card = el('div', 'achcard' + (a.done ? ' done' : ''));
        card.innerHTML = `<img src="${icons[a.icon]}"><div class="ainfo"><b>${esc(a.t)}</b><div class="dim small">${esc(a.d)}</div>` +
          (a.done ? `<div class="adone">✓ Desbloqueada${a.done.n ? ' na noite ' + a.done.n : ''}</div>` : `<div class="qprog"><div class="qbar"><i style="width:${a.p / a.n * 100}%"></i></div><span class="qn">${a.p}/${a.n}</span></div>`) + `</div>`;
        g.appendChild(card);
      }
      wrap.appendChild(g);
    }
    body.appendChild(wrap);
  }

  // ---------- chat / avisos ----------
  openChat() { const c = $('#chatin'); c.style.display = 'block'; c.focus(); $('#chat').classList.add('open'); }
  closeChat() { const c = $('#chatin'); c.blur(); c.style.display = 'none'; $('#chat').classList.remove('open'); }
  chat(from, text, c) {
    const log = $('#chatlog'); const line = el('div', 'cl');
    line.innerHTML = from ? `<b style="color:${c === -1 ? '#9cf' : colorCss(c)}">${esc(from)}:</b> ${esc(text)}` : esc(text);
    log.appendChild(line); while (log.children.length > 40) log.firstChild.remove();
    log.scrollTop = log.scrollHeight; line.dataset.t = performance.now();
  }
  notice(text, kind = 'info') {
    const n = $('#notices'); const d = el('div', 'notice ' + kind, esc(text)); n.appendChild(d);
    setTimeout(() => d.classList.add('fade'), kind === 'victory' ? 9000 : 3500); setTimeout(() => d.remove(), kind === 'victory' ? 10000 : 4500);
    while (n.children.length > 4) n.firstChild.remove();
  }
  toast(text) {
    const n = $('#toasts'); const d = el('div', 'toast', esc(text)); n.appendChild(d);
    setTimeout(() => d.classList.add('fade'), 1800); setTimeout(() => d.remove(), 2400);
    while (n.children.length > 6) n.firstChild.remove();
  }
  note(text) { const n = $('#note'); n.innerHTML = `<p>${esc(text)}</p><span class="dim">(clica para fechar)</span>`; n.style.display = 'block'; n.onclick = () => n.style.display = 'none'; }
  hurtFlash(a) { const v = $('#vignette'); v.style.opacity = Math.min(0.8, 0.3 + a); clearTimeout(this._vt); this._vt = setTimeout(() => v.style.opacity = 0, 140); }

  // ---------- atualização por frame ----------
  update(dt) {
    const g = this.g, me = g.me, s = g.meState;
    if (!s) return;
    const bar = (id, v, max = 100) => { const e = $(id); e.style.width = Math.max(0, Math.min(100, v / max * 100)) + '%'; };
    bar('#b-hp i', s.hp); bar('#b-hu i', s.hu); bar('#b-st i', s.st, s.ms); bar('#b-in i', s.in);
    $('#b-hp b').textContent = Math.ceil(s.hp); $('#b-hu b').textContent = Math.ceil(s.hu); $('#b-st b').textContent = Math.ceil(s.st); $('#b-in b').textContent = Math.floor(s.in) + (s.vac ? ' 💉' : '');
    $('#b-in').classList.toggle('danger', s.in > 50);
    $('#b-hu').classList.toggle('danger', s.hu < 15);
    // relógio
    const t = g.time; const ph = phaseAt(g.clock);
    const name = { amanhecer: 'Amanhecer', dia: 'Dia', crepusculo: 'Crepúsculo', noite: 'Noite' }[t.ph];
    const left = Math.max(0, Math.ceil(ph.dur - ph.t));
    $('#clock').innerHTML = `<div class="ph ${t.ph}">${name}</div><div class="cnum">${t.ph === 'noite' ? 'Noite ' + t.n : 'Dia ' + (t.n + 1)}</div><div class="dim">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</div>` +
      (t.b ? '<div class="blood">LUA DE SANGUE</div>' : (((t.n + 1) % 7 === 0 && t.ph !== 'noite') ? '<div class="bloodw">Lua de Sangue esta noite</div>' : '')) +
      (t.fin ? `<div class="blood">Purificador: ${t.fin}s</div>` : '') + (t.v ? '<div class="good">Podridão purificada</div>' : '') +
      (s.rot ? '<div class="rotw">Na Podridão</div>' : '');
    // dial
    const frac = (g.clock % DAY_LENGTH) / DAY_LENGTH; $('#dialhand').style.transform = `rotate(${frac * 360}deg)`;
    // companheiros
    const mates = g.players.filter(p => p.id !== g.myId);
    $('#mates').innerHTML = mates.map(p => `<div class="mate"><b style="color:${colorCss(p.c)}">${esc(p.n)}</b>${p.f & 1 ? ' <span class="bad">CAÍDO ' + p.dt + 's</span>' : p.f & 2 ? ' <span class="dim">morto</span>' : ''}<div class="mhp"><i style="width:${p.hp}%"></i></div></div>`).join('');
    // info junto ao cursor
    const it = this.inv?.inv[this.inv.sel]; let ci = '';
    if (it) {
      const d = this.items[it.id];
      if (d.kind === 'ranged') ci = d.bow ? `${this.count('flecha')} flechas` : `${it.a}/${d.mag} · ${this.count(d.ammo)}`;
      else if (d.kind === 'throw' || d.kind === 'place') ci = `${it.n}`;
      if (d.dur && it.d != null) ci += (ci ? ' · ' : '') + Math.round(it.d / d.dur * 100) + '%';
      if (s.rl) ci = `A recarregar ${Math.round(s.rl * 100)}%`;
    }
    if (s.rv) ci = `A reanimar ${Math.round(s.rv * 100)}%`;
    if (g.build) ci = (ci ? ci + ' · ' : '') + 'CONSTRUÇÃO';
    this.cursorInfo.textContent = ci; this.cursorInfo.style.display = ci && !this.panel ? 'block' : 'none';
    $('#buildhint').style.display = g.build ? 'block' : 'none';
    $('#deadmsg').style.display = g.dead ? 'flex' : 'none';
    // chat esmaece
    const now = performance.now();
    if (!$('#chat').classList.contains('open')) for (const l of $('#chatlog').children) l.style.opacity = now - l.dataset.t > 12000 ? 0 : 1;
    // minimapa a 5 fps
    this._mt = (this._mt || 0) + dt;
    if (this._mt > 0.2) { this._mt = 0; this.drawMinimap(); if (this.mapOpen) this.drawMap(); }
  }

  // ---------- mapa / minimapa ----------
  chunkImage(c) {
    let img = this.chunkImgs.get(c.cx + c.cy * CHUNKS);
    if (!img || img.dirty) {
      if (!img) { const cv = document.createElement('canvas'); cv.width = CHUNK; cv.height = CHUNK; img = { cv, ctx: cv.getContext('2d') }; this.chunkImgs.set(c.cx + c.cy * CHUNKS, img); }
      const id = img.ctx.createImageData(CHUNK, CHUNK); const d = id.data;
      const rot = this.g.world.rot;
      for (let i = 0; i < CHUNK * CHUNK; i++) {
        const x = c.cx * CHUNK + (i % CHUNK), y = c.cy * CHUNK + ((i / CHUNK) | 0);
        let col = TCOL[c.t[i]];
        const o = c.o[i];
        if (o) col = OCOL[o] || col;
        if (rot.isRot(x, y) && (!o || o === O.ARVORE)) col = (c.t[i] === T.AGUA || c.t[i] === T.AGUA_FUNDA) ? 0x2c3420 : o ? 0x3d302a : 0x3c4428;
        d[i * 4] = col >> 16; d[i * 4 + 1] = (col >> 8) & 255; d[i * 4 + 2] = col & 255; d[i * 4 + 3] = 255;
      }
      img.ctx.putImageData(id, 0, 0); img.dirty = false;
    }
    return img.cv;
  }
  markChunk(c) { const img = this.chunkImgs.get(c.cx + c.cy * CHUNKS); if (img) img.dirty = true; }
  markAllChunks() { for (const img of this.chunkImgs.values()) img.dirty = true; }
  drawWorldMap(ctx, w, h, z, big) {
    const me = this.g.me; ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    const x0 = me.x - w / 2 / z, y0 = me.y - h / 2 / z;
    const cx0 = Math.max(0, Math.floor(x0 / CHUNK)), cy0 = Math.max(0, Math.floor(y0 / CHUNK));
    const cx1 = Math.min(CHUNKS - 1, Math.floor((x0 + w / z) / CHUNK)), cy1 = Math.min(CHUNKS - 1, Math.floor((y0 + h / z) / CHUNK));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = cx + cy * CHUNKS; const c = this.g.world.chunks.get(k);
      if (c) ctx.drawImage(this.chunkImage(c), Math.floor((cx * CHUNK - x0) * z), Math.floor((cy * CHUNK - y0) * z), Math.ceil(CHUNK * z), Math.ceil(CHUNK * z));
    }
    const P = (x, y) => [(x - x0) * z, (y - y0) * z];
    const dot = (x, y, r, col, ring) => { const [px, py] = P(x, y); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill(); if (ring) { ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); } };
    // cratera
    const [ccx, ccy] = P(CENTER, CENTER); if (big) { ctx.strokeStyle = 'rgba(150,200,60,0.6)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(ccx, ccy, Math.max(6, this.g.world.rot.radius * z), 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    if (big) {
      // direção da cratera se fora do ecrã
      ctx.fillStyle = '#e09040'; ctx.font = 'bold 12px monospace';
      if (ccx < 0 || ccy < 0 || ccx > w || ccy > h) { const a = Math.atan2(ccy - h / 2, ccx - w / 2); const ex = w / 2 + Math.cos(a) * (Math.min(w, h) / 2 - 30), ey = h / 2 + Math.sin(a) * (Math.min(w, h) / 2 - 30); ctx.fillText('▲ Cratera da Podridão', ex - 60, ey); }
      else ctx.fillText('Cratera', ccx + 8, ccy);
    }
    for (const m of this.markers) { const [px, py] = P(m.x, m.y); ctx.fillStyle = '#ffd040'; ctx.fillRect(px - 3, py - 3, 6, 6); ctx.strokeStyle = '#000'; ctx.strokeRect(px - 3, py - 3, 6, 6); }
    if (this.inv?.bed) dot(this.inv.bed.x, this.inv.bed.y, big ? 5 : 3, '#e04040', true);
    if (this.inv?.bp) { const [px, py] = P(this.inv.bp.x, this.inv.bp.y); ctx.font = (big ? 16 : 11) + 'px sans-serif'; ctx.fillText('🎒', px - 6, py + 5); }
    for (const pg of this.g.pings) dot(pg.x, pg.y, big ? 6 : 4, '#ffe040', true);
    for (const p of this.g.players) if (p.id !== this.g.myId) dot(p.x, p.y, big ? 5 : 3, colorCss(p.c), true);
    const [mx, my] = P(me.x, me.y);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(this.g.aim); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke(); ctx.restore();
  }
  drawMinimap() { const c = this.mini; this.drawWorldMap(this.miniCtx, c.width, c.height, 1.25, false); }
  toggleMap() { this.mapOpen = !this.mapOpen; $('#mapwrap').style.display = this.mapOpen ? 'flex' : 'none'; if (this.mapOpen) { this.map.width = innerWidth * 0.8; this.map.height = innerHeight * 0.8; this.drawMap(); } }
  drawMap() { this.drawWorldMap(this.mapCtx, this.map.width, this.map.height, this.mapZoom, true); const me = this.g.me; this.mapCtx.fillStyle = '#ccc'; this.mapCtx.font = '12px monospace'; this.mapCtx.fillText(`${Math.floor(me.x)}, ${Math.floor(me.y)} · roda: zoom · clique: marcador · clique direito: apagar · botão do meio: ping`, 10, this.map.height - 10); }
}

const TCOL = {}; for (const [k, v] of Object.entries(TERRAIN)) TCOL[k] = parseInt(v.color.slice(1), 16);
const OCOL = {
  [O.ARVORE]: 0x1f4a1c, [O.ARVORE_MORTA]: 0x3d302a, [O.ROCHA]: 0x8a8a8e, [O.CARVAO]: 0x2a2a2e, [O.FERRO]: 0xb07040, [O.ENXOFRE]: 0xd8c030, [O.CRISTAL]: 0x8ad040,
  [O.CARRO]: 0x8a4a3a, [O.PAREDE_VELHA]: 0x9a8a7a, [O.CAIXOTE]: 0xc09060, [O.PAREDE_BETAO]: 0xa8a69e, [O.CERCA]: 0x8a6a40, [O.SACOS]: 0xb8a678, [O.TENDA]: 0x5f6a3a, [O.CULTIVO]: 0x7aae40, [O.ESTANTE]: 0x6a4422, [O.CORACAO]: 0xc0ff40,
};
for (const o of OBJECTS) if (o && o.built) OCOL[o.id] = o.id === O.PAREDE_PEDRA ? 0xb0b0b8 : o.id === O.PAREDE_METAL || o.id === O.PORTA_METAL ? 0xc0d0e0 : 0xd09050;

const HUD_HTML = `
<div id="vignette"></div>
<div id="topleft"><canvas id="minimap" width="168" height="168"></canvas><div id="mates"></div></div>
<div id="rightcol"><div id="clockwrap"><div id="dial"><div id="dialhand"></div></div><div id="clock"></div></div><div id="quests"></div></div>
<div id="bars">
  <div class="bar" id="b-hp"><span>Vida</span><i></i><b></b></div>
  <div class="bar" id="b-hu"><span>Fome</span><i></i><b></b></div>
  <div class="bar" id="b-st"><span>Estamina</span><i></i><b></b></div>
  <div class="bar" id="b-in"><span>Infeção</span><i></i><b></b></div>
</div>
<div id="hotbar"></div>
<div id="buildhint">MODO DE CONSTRUÇÃO (B) · clique esquerdo coloca · clique direito recolhe · escolhe o bloco na barra rápida</div>
<div id="notices"></div><div id="toasts"></div><div id="achpop"></div>
<div id="chat"><div id="chatlog"></div><input id="chatin" maxlength="200" placeholder="Escreve e carrega Enter (/ajuda para comandos)"></div>
<div id="panel"><div id="tabs"><button data-t="inv">Inventário</button><button data-t="craft">Crafting</button><button data-t="skills">Habilidades</button><button data-t="ach">Conquistas</button><button data-t="help">Controlos</button><span class="dim tabhint">Tab fecha</span></div><div id="pbody"></div></div>
<div id="mapwrap"><canvas id="mapcanvas"></canvas></div>
<div id="note"></div>
<div id="deadmsg"><div>Morreste…<br><span class="dim">A renascer</span></div></div>
<div id="tip"></div><div id="cursorinfo"></div>
`;

export const HELP_HTML = `
<div class="help">
<table>
<tr><td>W A S D</td><td>Mover</td><td>Shift</td><td>Correr</td></tr>
<tr><td>Rato</td><td>Apontar</td><td>Espaço</td><td>Esquivar (rolar)</td></tr>
<tr><td>Clique esquerdo</td><td>Atacar / usar ferramenta / comer</td><td>R</td><td>Recarregar</td></tr>
<tr><td>Clique direito</td><td>Colocar bloco</td><td>E</td><td>Interagir (abrir, apanhar, dormir) · manter para reanimar</td></tr>
<tr><td>1 – 8 / roda</td><td>Barra rápida</td><td>B</td><td>Modo de construção</td></tr>
<tr><td>Ctrl + roda</td><td>Zoom (aproximar / afastar)</td><td>+ / −</td><td>Zoom (teclado)</td></tr>
<tr><td>Tab</td><td>Inventário e crafting</td><td>M</td><td>Mapa</td></tr>
<tr><td>Q</td><td>Largar item (Shift+Q: pilha)</td><td>G</td><td>Dar item a um companheiro</td></tr>
<tr><td>Enter</td><td>Chat</td><td>Botão do meio</td><td>Ping no mundo</td></tr>
<tr><td>Z / X / C</td><td>«Ajuda!» / «Aqui!» / «Preciso de munição»</td><td>V</td><td>Grito de Guerra (habilidade)</td></tr>
<tr><td>Esc</td><td>Menu de pausa</td><td>J</td><td>Mostrar/esconder missões</td></tr>
</table>
<h3>Primeiros passos</h3>
<ol>
<li>Parte erva alta e arbustos à mão para ter <b>fibra</b>; apanha <b>pedras soltas</b>; corta árvores (lento à mão) para ter <b>madeira</b>.</li>
<li>Crafting (Tab): Corda → Machado e Picareta de pedra → <b>Bancada de Trabalho</b>.</li>
<li>Quase todas as receitas das bancadas estão bloqueadas 🔒: lê <b>livros</b> (clique esquerdo) que encontras nas <b>estantes</b> de casas, quintas, cabanas, oficinas e bibliotecas. Cada livro ensina uma receita a todo o grupo. Só podes fazer a bancada seguinte depois de aprender todas as receitas da atual.</li>
<li>Antes do crepúsculo: paredes, uma porta, tochas e uma fogueira. Os zombies não nascem perto da luz.</li>
<li>Faz uma <b>cama</b> (ponto de renascimento) e um <b>baú</b>. Cozinha carne na fogueira; chá de ervas baixa a infeção.</li>
<li>Montanhas: carvão e ferro → <b>Forja</b>. Cidade: sucata e componentes → <b>Bancada de Armas</b>. Cristais → <b>Laboratório</b>.</li>
<li>Objetivo: derrotar o Rei da Podridão (noite 21), construir o Purificador e levá-lo ao Coração da Podridão, no centro do mapa.</li>
</ol>
</div>`;
