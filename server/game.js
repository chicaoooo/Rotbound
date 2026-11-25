// Simulação autoritária do anfitrião (JavaScript puro, sem Phaser).
import fs from 'node:fs';
import path from 'node:path';
import {
  CHUNK, CHUNKS, WORLD, CENTER, DT, TICK_RATE, ACTIVE_CHUNK_RADIUS, T, O, OBJECTS, TERRAIN, ZT, ANIMALS, PROJ, PLAYER,
  PHASES, DAY_LENGTH, phaseAt, xpForLevel, SLOT, hash2, VERSION,
} from '../shared/constants.js';
import { BaseWorld, Generator, chunkKey, collideMove, stepPlayer, lineOfSight } from '../shared/world.js';
import { SKILLS } from '../shared/skills.js';
import { FlowField, FF_SIZE } from './flowfield.js';
import { rollLoot, rollBooks, NOTES } from './loot.js';
import { recipeState, learnable, BOOK_FOR } from '../shared/recipes.js';
import { MAIN, DAILY, questTotal } from './quests.js';
import { ACHIEVEMENTS } from './achievements.js';

const key = (x, y) => x + ',' + y;
const unkey = k => k.split(',').map(Number);
const rand = Math.random;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

class ServerWorld extends BaseWorld {
  constructor(seed) { super(seed); this.gen = new Generator(seed); this.saved = new Map(); }
  ensure(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= CHUNKS || cy >= CHUNKS) return null;
    const k = chunkKey(cx, cy);
    let c = this.chunks.get(k);
    if (!c) {
      c = this.gen.generate(cx, cy);
      const s = this.saved.get(k);
      if (s) { c.t.set(s.t); c.o.set(s.o); c.h.set(s.h); c.modified = true; this.saved.delete(k); }
      this.chunks.set(k, c);
    }
    return c;
  }
  chunkAt(x, y) {
    if (x < 0 || y < 0 || x >= WORLD || y >= WORLD) return null;
    return this.ensure((x / CHUNK) | 0, (y / CHUNK) | 0);
  }
}

export class Game {
  constructor(opts, data) {
    this.opts = { name: 'Mundo', seed: 1, password: '', maxPlayers: 4, friendlyFire: false, hardcore: false, savePath: null, cheats: true, ...opts };
    this.items = data.items; this.recipes = data.recipes;
    this.recipeById = Object.fromEntries(this.recipes.map(r => [r.id, r]));
    this.unlocked = new Set(); // receitas aprendidas pelo grupo (partilhadas)
    this.stats = {}; this.qMain = 0; this.daily = []; this.questsDirty = true;
    this.ach = {}; this.achDirty = true; // conquistas desbloqueadas: id → { n: noite, at: data }
    this.world = new ServerWorld(this.opts.seed);
    this.spawn = this.world.gen.findSpawn();
    this.tick = 0;
    this.clock = PHASES[0].dur + 5; // começa de manhã
    this.night = 0;          // número da noite atual (ou da última)
    this.lastPhase = 'dia';
    this.phase = 'dia';
    this.players = new Map(); // id → jogador ligado
    this.savedPlayers = {};   // nome → dados
    this.entities = new Map();
    this.nextId = 1;
    this.projs = [];
    this.fires = [];
    this.drops = new Map();
    this.meta = new Map();    // "x,y" → dados de blocos especiais (baús, donos, combustível...)
    this.built = new Set();   // blocos construídos (para a Podridão os apodrecer)
    this.damaged = new Map(); // "x,y" → tick do último dano (para recuperarem com o tempo)
    this.lights = new Set();  // fontes de luz colocadas
    this.turrets = new Set();
    this.generators = new Set();
    this.purifiers = new Set();
    this.holofotes = new Set();
    this.powered = new Set();
    this.regrow = [];
    this.fx = [];
    this.dirtyTiles = new Map();
    this.dropsDirty = true;
    this.ff = new Map();      // id jogador → {n: FlowField, d: FlowField}
    this.ffDirty = true;
    this.nightPlan = null;
    this.daySpawnT = 30;
    this.animalT = 5;
    this.finale = null;       // {x,y,t} — carga final do Purificador
    this.victory = false;
    this.log = opts.log || (() => {});
    this.chunkPlayers = null;
    if (this.opts.savePath && fs.existsSync(this.opts.savePath)) this.load();
    if (!this.daily.length) this.rollDaily();
  }

  // ======================= Jogadores =======================
  playerCount() { let n = 0; for (const p of this.players.values()) n++; return n; }
  addPlayer(name, send, isLocal) {
    const id = this.nextId++;
    const s = this.savedPlayers[name];
    const p = {
      id, name, send, isLocal, x: this.spawn.x, y: this.spawn.y, a: 0,
      hp: 100, hunger: 100, stamina: 100, infection: 0, dodgeT: 0, dodgeX: 0, dodgeY: 0, kx: 0, ky: 0,
      inv: new Array(SLOT.HOTBAR + SLOT.MAIN + SLOT.BACKPACK).fill(null), invSize: SLOT.HOTBAR + SLOT.MAIN,
      armor: [null, null, null], sel: 0, xp: 0, level: 1, sp: 0, skills: {}, bed: null,
      downed: false, downedT: 0, dead: false, deadT: 0, lying: false, exhausted: false,
      inputs: [], lastSeq: 0, input: { mx: 0, my: 0, fire: false, alt: false, ax: 0, ay: 0, a: 0 },
      cd: 0, reloadT: 0, reloadTotal: 0, staminaT: 0, vaccine: 0, shoutNight: -1, buffT: 0, buffMul: 1, regenT: 0,
      eHold: false, reviveT: 0, openChest: null, invDirty: true, sentChunks: new Set(), color: 0, build: false,
      hungerAcc: 0, regenAcc: 0, starveAcc: 0, lastHit: 0, newbie: !s,
      backpack: null,
    };
    if (s) Object.assign(p, {
      x: s.x, y: s.y, hp: s.hp, hunger: s.hunger, infection: s.infection, inv: s.inv, invSize: s.invSize, armor: s.armor,
      xp: s.xp, level: s.level, sp: s.sp, skills: s.skills || {}, bed: s.bed, vaccine: s.vaccine || 0, backpack: s.backpack || null,
    });
    while (p.inv.length < SLOT.HOTBAR + SLOT.MAIN + SLOT.BACKPACK) p.inv.push(null);
    if (!s) {
      // aparece junto à cama de um companheiro, se existir
      const mate = Object.values(this.savedPlayers).find(q => q.bed) || [...this.players.values()].find(q => q.bed);
      const any = [...this.players.values()][0];
      if (mate && mate.bed) { p.x = mate.bed.x + 0.5; p.y = mate.bed.y + 1.5; }
      else if (any) { p.x = any.x + 1; p.y = any.y; }
      this.giveStarter(p);
    }
    const used = new Set([...this.players.values()].map(q => q.color));
    for (let c = 0; c < 4; c++) if (!used.has(c)) { p.color = c; break; }
    this.unstick(p);
    this.players.set(id, p);
    this.ffDirty = true; this.questsDirty = true; this.achDirty = true;
    return p;
  }
  giveStarter(p) {
    this.addItem(p, 'tocha', 2);
    this.addItem(p, 'bagas', 4);
  }
  unstick(p) {
    if (!this.world.solid(Math.floor(p.x), Math.floor(p.y))) return;
    for (let r = 1; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = Math.floor(p.x) + dx, y = Math.floor(p.y) + dy;
      if (!this.world.solid(x, y)) { p.x = x + 0.5; p.y = y + 0.5; return; }
    }
  }
  removePlayer(id) {
    const p = this.players.get(id); if (!p) return;
    this.savePlayer(p);
    this.players.delete(id); this.ff.delete(id);
    this.broadcast({ t: 'n', text: `${p.name} saiu do jogo.` });
  }
  savePlayer(p) {
    const pos = p.dead ? (p.bed ? { x: p.bed.x + 0.5, y: p.bed.y + 0.5 } : this.spawn) : p;
    this.savedPlayers[p.name] = {
      x: pos.x, y: pos.y, hp: p.dead ? 100 : Math.max(p.hp, 1), hunger: p.hunger, infection: p.infection, inv: p.inv, invSize: p.invSize,
      armor: p.armor, xp: p.xp, level: p.level, sp: p.sp, skills: p.skills, bed: p.bed, vaccine: p.vaccine, backpack: p.backpack,
    };
  }
  sk(p, k) { return p.skills[k] || 0; }
  maxStamina(p) { return 100 + 20 * this.sk(p, 'folego') - (p.infection > 50 ? 30 : 0); }
  alivePlayers() { return [...this.players.values()].filter(p => !p.dead); }

  // ======================= Inventário =======================
  stackOf(id) { return this.items[id]?.stack || 1; }
  newItem(id, n = 1) {
    const d = this.items[id]; const it = { id, n };
    if (d?.dur) it.d = d.dur;
    if (d?.kind === 'ranged' && !d.bow) it.a = 0;
    return it;
  }
  addItem(p, id, n, toGround = true) {
    if (!this.items[id]) return n;
    const st = this.stackOf(id);
    const slots = p.inv;
    if (st > 1) for (let i = 0; i < p.invSize && n > 0; i++) {
      const s = slots[i]; if (s && s.id === id && s.n < st) { const k = Math.min(n, st - s.n); s.n += k; n -= k; }
    }
    for (let i = 0; i < p.invSize && n > 0; i++) {
      if (!slots[i]) { const k = Math.min(n, st); slots[i] = this.newItem(id, k); n -= k; }
    }
    p.invDirty = true;
    if (n > 0 && toGround) { this.dropItem(p.x, p.y, this.newItem(id, n)); this.notice(p, 'Inventário cheio'); n = 0; }
    return n;
  }
  addItemObj(p, it) {
    if (this.stackOf(it.id) > 1) return this.addItem(p, it.id, it.n);
    for (let i = 0; i < p.invSize; i++) if (!p.inv[i]) { p.inv[i] = it; p.invDirty = true; return 0; }
    this.dropItem(p.x, p.y, it); return 0;
  }
  count(p, id) { let n = 0; for (let i = 0; i < p.invSize; i++) if (p.inv[i]?.id === id) n += p.inv[i].n; return n; }
  remove(p, id, n) {
    for (let i = p.invSize - 1; i >= 0 && n > 0; i--) {
      const s = p.inv[i]; if (s && s.id === id) { const k = Math.min(n, s.n); s.n -= k; n -= k; if (s.n <= 0) p.inv[i] = null; }
    }
    p.invDirty = true;
    return n === 0;
  }
  held(p) { return p.inv[p.sel] || null; }
  dropItem(x, y, item, extra = {}) {
    const id = this.nextId++;
    this.drops.set(id, { id, x: x + (rand() - 0.5) * 0.6, y: y + (rand() - 0.5) * 0.6, item, born: this.tick, ...extra });
    this.dropsDirty = true;
    return id;
  }

  // ======================= Mundo / blocos =======================
  setTile(x, y, o, hp, by) {
    const prev = this.world.getO(x, y);
    const k = key(x, y);
    if (prev !== o) {
      const po = OBJECTS[prev];
      if (po.built) this.built.delete(k);
      if (po.light) this.lights.delete(k);
      if (po.turret) this.turrets.delete(k);
      if (po.generator) this.generators.delete(k);
      if (po.purifier) { this.purifiers.delete(k); this.updatePurifiers(); }
      if (prev === O.HOLOFOTE) this.holofotes.delete(k);
      if (!(po.door && OBJECTS[o].door) && !OBJECTS[o].chest) {
        const m = this.meta.get(k);
        if (m?.chest) for (const it of m.chest) if (it) this.dropItem(x + 0.5, y + 0.5, it);
        if (!OBJECTS[o].built || !po.built) this.meta.delete(k);
      }
    }
    const no = OBJECTS[o];
    if (hp == null) hp = no.hp;
    this.world.setTile(x, y, o, Math.min(65535, Math.round(hp)));
    if (no.built) this.built.add(k);
    if (no.light) this.lights.add(k);
    if (no.turret) this.turrets.add(k);
    if (no.generator) this.generators.add(k);
    if (no.purifier) this.purifiers.add(k);
    if (o === O.HOLOFOTE) this.holofotes.add(k);
    this.dirtyTiles.set(k, [x, y]);
    if (prev !== o && (OBJECTS[prev].solid || no.solid || OBJECTS[prev].built || no.built)) this.ffDirty = true;
  }
  damageTile(x, y, dmg) {
    const o = this.world.getO(x, y); if (!o) return;
    const hp = this.world.getH(x, y) - dmg;
    if (hp <= 0) {
      this.fx.push({ k: 'break', x: x + 0.5, y: y + 0.5, o });
      this.setTile(x, y, 0, 0);
    } else {
      const c = this.world.chunkAt(x, y); c.h[(y % CHUNK) * CHUNK + (x % CHUNK)] = hp; c.modified = true;
      this.dirtyTiles.set(key(x, y), [x, y]);
      if (OBJECTS[o].solid && OBJECTS[o].built) this.ffDirtySoft = true;
      this.markDamaged(x, y);
    }
  }
  // blocos danificados recuperam sozinhos se ninguém lhes tocar durante algum tempo
  markDamaged(x, y) { this.damaged.set(key(x, y), this.tick); }
  updateHealing() {
    if (this.tick % 20) return; // 1× por segundo
    const quiet = TICK_RATE * 8; // 8 s sem levar dano
    for (const [k, last] of this.damaged) {
      const [x, y] = unkey(k); const o = this.world.getO(x, y);
      if (!o) { this.damaged.delete(k); continue; }
      if (this.tick - last < quiet) continue;
      const mx = this.maxHpOf(x, y), hp = this.world.getH(x, y);
      if (hp >= mx) { this.damaged.delete(k); continue; }
      const nh = Math.min(mx, hp + Math.max(1, Math.round(mx * 0.03))); // 3 % da vida por segundo
      const c = this.world.chunkAt(x, y); c.h[(y % CHUNK) * CHUNK + (x % CHUNK)] = nh; c.modified = true;
      this.dirtyTiles.set(k, [x, y]);
      if (nh >= mx) this.damaged.delete(k);
    }
  }
  maxHpOf(x, y) {
    const o = this.world.getO(x, y); const m = this.meta.get(key(x, y));
    return m?.mx || OBJECTS[o].hp;
  }
  findNear(x, y, r, pred) {
    const fx = Math.floor(x), fy = Math.floor(y);
    let best = null, bd = 1e9;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const tx = fx + dx, ty = fy + dy; const o = this.world.getO(tx, ty);
      if (o && pred(OBJECTS[o], tx, ty)) { const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y); if (d < bd) { bd = d; best = { x: tx, y: ty, o, d }; } }
    }
    return best;
  }
  stationNear(p, st) {
    if (st === 'maos') return true;
    return !!this.findNear(p.x, p.y, 3, (o) => o.station === st);
  }
  isLit(x, y, extra = 0) {
    for (const k of this.lights) {
      const [lx, ly] = unkey(k); const o = OBJECTS[this.world.getO(lx, ly)];
      let r = o.light; if (o.powered) { if (!this.powered.has(k)) continue; }
      r += extra;
      if ((lx - x) ** 2 + (ly - y) ** 2 < r * r) return true;
    }
    return false;
  }
  updatePurifiers() {
    this.world.rot.purifiers = [];
    for (const k of this.purifiers) {
      const m = this.meta.get(k); if (!m || !(m.fuel > 0 || m.fuelT > 0)) continue;
      const [x, y] = unkey(k); this.world.rot.purifiers.push({ x, y, r: 30 });
    }
    this.rotDirty = true;
  }

  // ======================= Entradas dos clientes =======================
  onInput(p, m) {
    if (p.inputs.length < 30) p.inputs.push(m);
  }
  handle(p, m) {
    switch (m.t) {
      case 'i': return this.onInput(p, m);
      case 'sel': if (m.i >= 0 && m.i < 8) { p.sel = m.i | 0; p.reloadT = 0; p.invDirty = true; } return;
      case 'craft': return this.craft(p, m.r, m.n || 1);
      case 'inv': return this.invMove(p, m.from, m.to, m.half);
      case 'quick': return this.invQuick(p, m.from);
      case 'drop': return this.dropSlot(p, m.i ?? p.sel, m.all);
      case 'give': return this.give(p);
      case 'e': return this.interact(p, m.x, m.y);
      case 'eh': p.eHold = !!m.on; if (!m.on) p.reviveT = 0; return;
      case 'reload': return this.startReload(p);
      case 'build': p.build = !!m.on; return;
      case 'place': return this.place(p, m.x | 0, m.y | 0);
      case 'collect': return this.collect(p, m.x | 0, m.y | 0);
      case 'chestClose': p.openChest = null; return;
      case 'skill': return this.learn(p, m.k);
      case 'chat': return this.chat(p, String(m.text || '').slice(0, 200));
      case 'ping': this.broadcast({ t: 'ping', x: +m.x, y: +m.y, from: p.name, c: p.color, kind: m.kind || 'local' }); return;
      case 'emote': { const E = { ajuda: 'Ajuda!', aqui: 'Aqui!', municao: 'Preciso de munição' }; if (E[m.k]) this.broadcast({ t: 'emote', id: p.id, text: E[m.k] }); return; }
      case 'shout': return this.shout(p);
      case 'repair': return this.repairItem(p);
      case 'use': return this.useHeld(p, m.x, m.y);
      case 'unequip': return this.unequip(p, m.s | 0);
    }
  }
  chat(p, text) {
    if (!text.trim()) return;
    if (text.startsWith('/') && (this.opts.cheats || p.isLocal)) return this.command(p, text.slice(1).trim().split(/\s+/));
    this.broadcast({ t: 'chat', from: p.name, c: p.color, text });
  }
  command(p, a) {
    const say = (t) => p.send({ t: 'chat', from: 'Sistema', c: -1, text: t });
    switch (a[0]) {
      case 'noite': {
        if (a[1]) this.night = Math.max(0, (+a[1] | 0) - 1);
        this.clock = Math.floor(this.clock / DAY_LENGTH) * DAY_LENGTH + PHASES[0].dur + PHASES[1].dur + PHASES[2].dur - 3;
        if (this.lastPhase === 'noite') this.lastPhase = 'crepusculo';
        return say('A saltar para a noite ' + (this.night + 1) + '.');
      }
      case 'dia': this.clock = Math.ceil(this.clock / DAY_LENGTH) * DAY_LENGTH + PHASES[0].dur + 1; return say('Dia.');
      case 'dar': { const id = a[1], n = +(a[2] || 1); if (!this.items[id]) return say('Item desconhecido. Ex.: /dar lingote 20'); this.addItem(p, id, n); return say(`+${n} ${this.items[id].name}`); }
      case 'tp': p.x = +a[1] + 0.5; p.y = +a[2] + 0.5; this.unstick(p); return;
      case 'centro': p.x = CENTER + 10.5; p.y = CENTER + 10.5; this.unstick(p); return;
      case 'zombie': { const t = a[1] || 'errante'; if (!ZT[t]) return say('Tipos: ' + Object.keys(ZT).join(', ')); for (let i = 0; i < (+a[2] || 1); i++) this.spawnZombie(t, p.x + Math.cos(i) * 8, p.y + Math.sin(i) * 8); return; }
      case 'xp': this.giveXP(p, +a[1] || 500); return;
      case 'ajuda': return say('Comandos: /noite [n], /dia, /dar item n, /tp x y, /centro, /zombie tipo n, /xp n, /guardar');
      case 'guardar': this.save(); return say('Mundo gravado.');
      default: return say('Comando desconhecido. /ajuda');
    }
  }

  // ======================= Crafting =======================
  craft(p, rid, n) {
    const r = this.recipeById[rid]; if (!r || p.dead || p.downed) return;
    const rs = recipeState(r, this.unlocked, this.recipes);
    if (!rs.ok) return this.notice(p, rs.gate ? `Aprende primeiro todas as receitas desta estação (${rs.have}/${rs.need})` : `Receita bloqueada: encontra um ${this.items[rs.book].name}`);
    if (!this.stationNear(p, r.st)) return this.notice(p, 'Precisas de estar perto de: ' + (r.st === 'fogueira' ? 'uma Fogueira' : this.items[r.st]?.name || r.st));
    n = clamp(n | 0, 1, 50);
    let made = 0;
    for (let k = 0; k < n; k++) {
      for (const [id, q] of Object.entries(r.in)) if (this.count(p, id) < q) { if (!made) this.notice(p, 'Faltam ingredientes'); k = n; break; }
      if (k >= n) break;
      const free = rand() < 0.1 * this.sk(p, 'eficiencia');
      if (!free) for (const [id, q] of Object.entries(r.in)) this.remove(p, id, q);
      this.addItem(p, r.out, r.n);
      made++;
      this.giveXP(p, 2);
    }
    if (made) { this.ev('craft', r.out, made); p.send({ t: 'fx', l: [{ k: 'snd', s: 'craft' }] }); if (made && this.items[r.out]) this.toast(p, `+${made * r.n} ${this.items[r.out].name}`); }
  }
  repairItem(p) {
    const it = this.held(p); if (!it || !it.d) return;
    const def = this.items[it.id]; if (it.d >= def.dur) return this.notice(p, 'Não precisa de reparação');
    const r = this.recipes.find(r => r.out === it.id); if (!r) return;
    if (!this.stationNear(p, r.st)) return this.notice(p, 'Repara na estação onde foi feito');
    const mult = 0.5 * (1 - 0.2 * this.sk(p, 'reparador'));
    const need = Object.entries(r.in).map(([id, q]) => [id, Math.max(1, Math.ceil(q * mult))]);
    for (const [id, q] of need) if (this.count(p, id) < q) return this.notice(p, 'Faltam materiais para reparar');
    for (const [id, q] of need) this.remove(p, id, q);
    it.d = def.dur; p.invDirty = true; this.toast(p, def.name + ' reparado');
  }
  // slot refs: {c:'p'|'c'|'a', i}
  slotRef(p, s) {
    if (!s) return null;
    if (s.c === 'p') { if (s.i < 0 || s.i >= p.invSize) return null; return { arr: p.inv, i: s.i }; }
    if (s.c === 'a') { if (s.i < 0 || s.i > 2) return null; return { arr: p.armor, i: s.i, armor: true }; }
    if (s.c === 'c' && p.openChest) {
      const m = this.meta.get(p.openChest); if (!m?.chest) return null;
      if (s.i < 0 || s.i >= m.chest.length) return null; return { arr: m.chest, i: s.i, chest: p.openChest };
    }
    return null;
  }
  invMove(p, from, to, half) {
    const a = this.slotRef(p, from), b = this.slotRef(p, to); if (!a || !b) return;
    const A = a.arr[a.i], B = b.arr[b.i]; if (!A) return;
    if (b.armor && this.items[A.id]?.kind !== 'armor') return;
    if (a.armor && B && this.items[B.id]?.kind !== 'armor') return;
    if (half && A.n > 1 && !B) { const k = Math.floor(A.n / 2); A.n -= k; b.arr[b.i] = { ...A, n: k }; }
    else if (B && B !== A && B.id === A.id && this.stackOf(A.id) > 1) {
      const k = Math.min(A.n, this.stackOf(A.id) - B.n); B.n += k; A.n -= k; if (A.n <= 0) a.arr[a.i] = null;
    } else { a.arr[a.i] = B; b.arr[b.i] = A; }
    p.invDirty = true;
    if (a.chest) this.chestChanged(a.chest); if (b.chest && b.chest !== a.chest) this.chestChanged(b.chest);
  }
  invQuick(p, from) {
    const a = this.slotRef(p, from); if (!a || !a.arr[a.i]) return;
    const it = a.arr[a.i];
    if (a.chest) { a.arr[a.i] = null; const left = this.addItemObjNoGround(p, it); if (left) a.arr[a.i] = left; this.chestChanged(a.chest); return; }
    if (a.armor) { a.arr[a.i] = null; this.addItemObj(p, it); return; }
    if (p.openChest) {
      const m = this.meta.get(p.openChest);
      if (m?.chest) {
        const st = this.stackOf(it.id);
        if (st > 1) for (const s of m.chest) if (s && s.id === it.id && s.n < st && it.n > 0) { const k = Math.min(it.n, st - s.n); s.n += k; it.n -= k; }
        if (it.n > 0) { const j = m.chest.indexOf(null); if (j >= 0) { m.chest[j] = it; a.arr[a.i] = null; } } else a.arr[a.i] = null;
        p.invDirty = true; this.chestChanged(p.openChest); return;
      }
    }
    if (this.items[it.id]?.kind === 'armor') { const old = p.armor[1]; p.armor[1] = it; a.arr[a.i] = old; p.invDirty = true; return; }
    // entre barra rápida e inventário
    const hot = a.i < SLOT.HOTBAR; const r0 = hot ? SLOT.HOTBAR : 0, r1 = hot ? p.invSize : SLOT.HOTBAR;
    for (let i = r0; i < r1; i++) if (!p.inv[i]) { p.inv[i] = it; a.arr[a.i] = null; p.invDirty = true; return; }
  }
  addItemObjNoGround(p, it) {
    const st = this.stackOf(it.id);
    if (st > 1) { const left = this.addItem(p, it.id, it.n, false); return left ? { ...it, n: left } : null; }
    for (let i = 0; i < p.invSize; i++) if (!p.inv[i]) { p.inv[i] = it; p.invDirty = true; return null; }
    return it;
  }
  unequip(p, s) { const it = p.armor[s]; if (!it) return; p.armor[s] = null; this.addItemObj(p, it); p.invDirty = true; }
  chestChanged(k) {
    const m = this.meta.get(k); if (!m) return;
    for (const q of this.players.values()) if (q.openChest === k) q.send({ t: 'chest', k, slots: m.chest, lock: m.lock || null });
    const [x, y] = unkey(k); const c = this.world.chunkAt(x, y); if (c) c.modified = true;
  }
  dropSlot(p, i, all) {
    const it = p.inv[i]; if (!it || p.dead) return;
    let out = it;
    if (!all && it.n > 1) { out = { ...it, n: 1 }; it.n -= 1; } else p.inv[i] = null;
    const a = p.a;
    this.dropItem(p.x + Math.cos(a) * 1.2, p.y + Math.sin(a) * 1.2, out, { from: p.id });
    p.invDirty = true;
  }
  give(p) {
    const it = this.held(p); if (!it) return;
    let best = null, bd = 2.2;
    for (const q of this.players.values()) if (q !== p && !q.dead) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q; } }
    if (!best) return this.notice(p, 'Nenhum companheiro perto');
    p.inv[p.sel] = null; p.invDirty = true;
    let n = it.n; const kind = this.items[it.id]?.kind;
    if ((kind === 'ammo' || kind === 'food') && this.sk(p, 'logistica')) n += Math.floor(n / 5) * this.sk(p, 'logistica');
    if (this.stackOf(it.id) > 1) this.addItem(best, it.id, n); else this.addItemObj(best, it);
    this.toast(best, `${p.name} deu-te ${n}× ${this.items[it.id].name}`);
    this.toast(p, `Deste ${it.n}× ${this.items[it.id].name} a ${best.name}`);
  }
  learn(p, k) {
    if (!SKILLS[k] || p.sp <= 0) return;
    if ((p.skills[k] || 0) >= 3) return;
    p.skills[k] = (p.skills[k] || 0) + 1; p.sp--; p.invDirty = true;
  }
  // ======================= Missões =======================
  ev(ev, k = null, n = 1) {
    this.stats[ev + ':*'] = (this.stats[ev + ':*'] || 0) + n;
    if (k != null) this.stats[ev + ':' + k] = (this.stats[ev + ':' + k] || 0) + n;
    this.questsDirty = true; this.achDirty = true; this.checkQuests();
  }
  checkQuests() {
    for (const st of Object.keys(BOOK_FOR)) if (!this.stats['unlock:' + st] && learnable(this.recipes, st).every(r => this.unlocked.has(r.id))) this.stats['unlock:' + st] = 1;
    while (this.qMain < MAIN.length && questTotal(this.stats, MAIN[this.qMain]) >= MAIN[this.qMain].n) { this.questReward(MAIN[this.qMain], true); this.qMain++; this.questsDirty = true; }
    for (const d of this.daily) {
      const q = DAILY[d.i]; if (d.done || !q) continue;
      if (questTotal(this.stats, q) - d.base >= q.n) { d.done = true; this.questReward(q, false); this.questsDirty = true; }
    }
    for (const a of ACHIEVEMENTS) {
      if (this.ach[a.id] || questTotal(this.stats, a) < a.n) continue;
      this.ach[a.id] = { n: this.night, at: new Date().toISOString() }; this.achDirty = true;
      this.broadcast({ t: 'achv', id: a.id, title: a.t, d: a.d, icon: a.icon });
    }
  }
  achState() {
    return { t: 'ach', l: ACHIEVEMENTS.map(a => ({ id: a.id, cat: a.cat, t: a.t, d: a.d, icon: a.icon, n: a.n, p: Math.min(a.n, questTotal(this.stats, a)), done: this.ach[a.id] || null })) };
  }
  questReward(q, main) {
    const what = q.rew.map(([id, n]) => `${n} ${this.items[id].name}`).join(', ');
    this.broadcast({ t: 'n', text: `${main ? 'Missão cumprida' : 'Missão diária cumprida'}: ${q.t}!`, kind: 'good', snd: 'craft' });
    this.stats[(main ? 'quest' : 'daily') + ':*'] = (this.stats[(main ? 'quest' : 'daily') + ':*'] || 0) + 1;
    for (const p of this.players.values()) { for (const [id, n] of q.rew) this.addItem(p, id, n); if (q.xp) this.giveXP(p, q.xp); this.toast(p, `Recompensa: ${what ? what + ' · ' : ''}+${q.xp} XP`); }
  }
  rollDaily(announce) {
    const pool = DAILY.map((q, i) => i).filter(i => (DAILY[i].minNight || 0) <= this.night);
    const pick = [];
    while (pick.length < 2 && pool.length) pick.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    this.daily = pick.map(i => ({ i, base: questTotal(this.stats, DAILY[i]), done: false }));
    this.questsDirty = true;
    if (announce) this.broadcast({ t: 'toast', text: 'Novas missões diárias' });
  }
  questState() {
    const q = MAIN[this.qMain];
    return {
      t: 'quests', idx: this.qMain, total: MAIN.length,
      main: q ? { t: q.t, d: q.d, p: Math.min(q.n, questTotal(this.stats, q)), n: q.n, rew: q.rew } : null,
      daily: this.daily.map(d => { const q = DAILY[d.i]; return q ? { t: q.t, d: q.d, p: d.done ? q.n : Math.min(q.n, questTotal(this.stats, q) - d.base), n: q.n, done: d.done, rew: q.rew } : null; }).filter(Boolean),
    };
  }
  giveXP(p, n) {
    p.xp += n;
    while (p.xp >= xpForLevel(p.level)) { p.xp -= xpForLevel(p.level); p.level++; p.sp++; this.notice(p, `Nível ${p.level}! +1 ponto de habilidade (Tab)`, 'good'); }
    p.invDirty = true;
  }
  shareXP(x, y, n) { for (const p of this.players.values()) if (!p.dead && Math.hypot(p.x - x, p.y - y) <= 30) this.giveXP(p, n); }
  shout(p) {
    const lvl = this.sk(p, 'grito'); if (!lvl) return this.notice(p, 'Precisas da habilidade Grito de Guerra');
    if (p.shoutNight === this.night) return this.notice(p, 'Já usaste o Grito de Guerra esta noite');
    p.shoutNight = this.night;
    for (const q of this.players.values()) if (!q.dead && Math.hypot(q.x - p.x, q.y - p.y) < 10) { q.buffT = 10; q.buffMul = 1 + 0.15 * lvl; }
    this.broadcast({ t: 'emote', id: p.id, text: 'POR NÓS!' });
    this.fx.push({ k: 'snd', s: 'shout', x: p.x, y: p.y });
  }

  // ======================= Interações =======================
  interact(p, ax, ay) {
    if (p.dead || p.downed) return;
    for (const o of this.players.values()) if (o !== p && o.downed && Math.hypot(o.x - p.x, o.y - p.y) < 1.8) return; // a reanimar (E premido)
    // 1. mochila / itens no chão
    let bestDrop = null, bd = 1.7;
    for (const d of this.drops.values()) { const dd = Math.hypot(d.x - p.x, d.y - p.y); if (dd < bd) { bd = dd; bestDrop = d; } }
    if (bestDrop) {
      if (bestDrop.bp) {
        for (const it of bestDrop.items) this.addItemObj(p, it);
        this.drops.delete(bestDrop.id); this.dropsDirty = true;
        const owner = [...this.players.values()].find(q => q.name === bestDrop.bp);
        if (owner && owner.backpack === bestDrop.id) { owner.backpack = null; owner.invDirty = true; }
        else if (this.savedPlayers[bestDrop.bp]?.backpack === bestDrop.id) this.savedPlayers[bestDrop.bp].backpack = null;
        this.toast(p, 'Mochila recuperada'); return;
      }
      const left = this.addItemObjNoGround(p, bestDrop.item);
      if (left) { bestDrop.item = left; this.notice(p, 'Inventário cheio'); } else this.drops.delete(bestDrop.id);
      this.dropsDirty = true; this.fx.push({ k: 'snd', s: 'pickup', x: p.x, y: p.y }); return;
    }
    // 2. bloco apontado (ou o mais perto)
    let tgt = null;
    if (ax != null) {
      const tx = Math.floor(ax), ty = Math.floor(ay); const o = this.world.getO(tx, ty);
      if (o && OBJECTS[o].interact && Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) < 2.4) tgt = { x: tx, y: ty, o };
    }
    if (!tgt) tgt = this.findNear(p.x, p.y, 2, (o) => o.interact);
    if (!tgt || Math.hypot(tgt.x + 0.5 - p.x, tgt.y + 0.5 - p.y) > 2.4) return;
    const def = OBJECTS[tgt.o]; const k = key(tgt.x, tgt.y);
    const m = this.meta.get(k);
    if (m?.lock && m.lock !== p.name && (def.chest || def.door)) return this.notice(p, `Trancado por ${m.lock}`);
    if (def.chest) {
      let mm = m; if (!mm) { mm = { chest: new Array(SLOT.CHEST).fill(null) }; this.meta.set(k, mm); }
      if (!mm.chest) mm.chest = new Array(SLOT.CHEST).fill(null);
      p.openChest = k; p.send({ t: 'chest', k, slots: mm.chest, lock: mm.lock || null }); return;
    }
    if (def.door) { this.setTile(tgt.x, tgt.y, def.door, this.world.getH(tgt.x, tgt.y)); this.fx.push({ k: 'snd', s: 'door', x: tgt.x, y: tgt.y }); return; }
    if (def.bed) {
      p.bed = { x: tgt.x, y: tgt.y }; p.invDirty = true;
      const ph = phaseAt(this.clock).k;
      if (ph === 'noite' || ph === 'crepusculo') {
        for (const z of this.entities.values()) if (z.kind === 'z' && Math.hypot(z.x - p.x, z.y - p.y) < 15) return this.notice(p, 'Não podes dormir com zombies por perto');
        p.lying = true; p.x = tgt.x + 0.5; p.y = tgt.y + 0.5;
        this.notice(p, this.players.size > 1 ? 'A dormir… (todos têm de estar deitados)' : 'A dormir…');
      } else this.toast(p, 'Ponto de renascimento definido');
      return;
    }
    if (def.loot) {
      if (m?.looted) return this.notice(p, 'Vazio');
      const got = def.books ? rollBooks(tgt.x, tgt.y, this.world.gen.biome(tgt.x, tgt.y)) : rollLoot(def.loot);
      if (!def.books && rand() < (def.loot === 'casa' ? 0.12 : 0.3)) got.push(...rollBooks(tgt.x, tgt.y, this.world.gen.biome(tgt.x, tgt.y), def.loot).slice(0, 1));
      const sum = {}; for (const [id, n] of got) sum[id] = (sum[id] || 0) + n;
      for (const id in sum) { this.addItem(p, id, sum[id]); this.toast(p, `+${sum[id]} ${this.items[id].name}`); this.ev('get', id, sum[id]); }
      this.ev('loot');
      this.fx.push({ k: 'snd', s: 'pickup', x: p.x, y: p.y });
      if (tgt.o === O.CAIXOTE) this.setTile(tgt.x, tgt.y, 0, 0);
      else { this.meta.set(k, { looted: true }); this.world.chunkAt(tgt.x, tgt.y).modified = true; }
      this.giveXP(p, 3); return;
    }
    if (def.note) {
      const n = NOTES[Math.floor(hash2(tgt.x, tgt.y, 5) * NOTES.length)];
      p.send({ t: 'note', text: n }); return;
    }
    if (def.generator || def.purifier) {
      let mm = m || {}; this.meta.set(k, mm);
      if (this.count(p, 'combustivel') <= 0) return this.notice(p, `Combustível: ${mm.fuel || 0}. Precisas de Combustível.`);
      this.remove(p, 'combustivel', 1); mm.fuel = (mm.fuel || 0) + 1; this.world.chunkAt(tgt.x, tgt.y).modified = true;
      this.toast(p, `${def.name}: ${mm.fuel} de combustível`);
      if (def.purifier) this.updatePurifiers();
      this.updatePower(); return;
    }
  }
  useHeld(p, ax, ay) {
    if (p.dead || p.downed) return;
    const it = this.held(p); if (!it) return;
    const d = this.items[it.id];
    if (d.kind === 'food') {
      if (p.hunger >= 99 && !d.inf) return;
      p.hunger = Math.min(100, p.hunger + d.food);
      if (d.inf) this.addInfection(p, d.inf, true);
      if (d.regen) p.regenT = d.regen;
      this.consumeHeld(p); this.fx.push({ k: 'snd', s: 'eat', x: p.x, y: p.y }); return;
    }
    if (d.kind === 'med') {
      // curar um companheiro se o rato estiver em cima dele
      let target = p;
      if (ax != null) for (const q of this.players.values()) if (q !== p && !q.dead && Math.hypot(q.x - ax, q.y - ay) < 0.8 && Math.hypot(q.x - p.x, q.y - p.y) < 2) target = q;
      const mult = target !== p ? 1 + 0.3 * this.sk(p, 'curandeiro') : 1;
      if (d.heal) target.hp = Math.min(100, target.hp + d.heal * mult);
      if (d.inf) this.addInfection(target, d.inf * mult, true);
      if (d.vaccine) target.vaccine = d.vaccine;
      if (target !== p) { this.toast(target, `${p.name} tratou-te`); target.invDirty = true; }
      this.consumeHeld(p); this.fx.push({ k: 'snd', s: 'eat', x: p.x, y: p.y }); return;
    }
    if (d.kind === 'book') return this.readBook(p, it, d);
    if (it.id === 'mochila') {
      if (p.invSize >= SLOT.HOTBAR + SLOT.MAIN + SLOT.BACKPACK) return this.notice(p, 'Já tens uma mochila');
      p.invSize = SLOT.HOTBAR + SLOT.MAIN + SLOT.BACKPACK; this.consumeHeld(p); this.toast(p, '+8 espaços de inventário'); return;
    }
    if (it.id === 'cadeado') {
      if (ax == null) return;
      const tx = Math.floor(ax), ty = Math.floor(ay); const o = OBJECTS[this.world.getO(tx, ty)];
      if (!(o.chest || o.door) || Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) > 2.5) return this.notice(p, 'Aponta para um baú ou porta');
      const k = key(tx, ty); const m = this.meta.get(k) || {}; if (m.lock) return this.notice(p, 'Já está trancado');
      m.lock = p.name; this.meta.set(k, m); this.world.chunkAt(tx, ty).modified = true; this.consumeHeld(p); this.toast(p, 'Trancado só para ti'); return;
    }
  }
  readBook(p, it, d) {
    const left = learnable(this.recipes, d.st).filter(r => !this.unlocked.has(r.id));
    this.consumeHeld(p); this.fx.push({ k: 'snd', s: 'craft', x: p.x, y: p.y });
    if (!left.length) { this.giveXP(p, 15); this.ev('read'); return this.notice(p, `O grupo já sabe tudo do ${d.name}. (+15 XP)`); }
    const r = left[Math.floor(rand() * left.length)];
    this.unlocked.add(r.id); this.giveXP(p, 20); this.ev('read');
    this.broadcast({ t: 'n', text: `${p.name} leu ${d.name}: receita de ${this.items[r.out].name}!`, kind: 'good' });
    const st = d.st; const gate = this.recipes.find(g => g.st === st && recipeState(g, this.unlocked, this.recipes).gate);
    if (left.length === 1 && gate) this.broadcast({ t: 'n', text: `Todas as receitas aprendidas! Já podem construir: ${this.items[gate.out].name}`, kind: 'victory', snd: 'victory' });
    else if (left.length === 1) this.broadcast({ t: 'n', text: `Todas as receitas desta estação foram aprendidas!`, kind: 'good' });
    this.broadcast({ t: 'rec', l: [...this.unlocked] });
  }
  consumeHeld(p) { const it = this.held(p); if (!it) return; it.n--; if (it.n <= 0) p.inv[p.sel] = null; p.invDirty = true; }

  // ======================= Construção =======================
  place(p, x, y) {
    if (p.dead || p.downed) return;
    const it = this.held(p); if (!it) return;
    const d = this.items[it.id]; if (d.kind !== 'place') return;
    if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > PLAYER.placeReach) return;
    if (!this.canPlace(x, y, d.obj)) return;
    const o = OBJECTS[d.obj];
    let hp = o.hp; const meta = { owner: p.name };
    if (o.solid && !o.station && !o.turret) { const lvl = this.sk(p, 'construtor'); if (lvl) { hp = Math.round(o.hp * (1 + 0.25 * lvl)); meta.mx = hp; } }
    if (o.trap || o.mine) meta.tl = this.sk(p, 'armadilheiro');
    if (o.turret) meta.tec = this.sk(p, 'tecnico');
    if (o.purifier) { meta.fuel = 2; }
    if (o.generator) meta.fuel = 0;
    this.consumeHeld(p);
    this.setTile(x, y, d.obj, hp);
    this.meta.set(key(x, y), meta);
    if (o.purifier) { this.updatePurifiers(); this.checkFinale(x, y, p); }
    if (o.generator || o.powered || o.turret) this.updatePower();
    this.fx.push({ k: 'snd', s: 'place', x, y });
    this.ev('place', it.id);
  }
  canPlace(x, y, obj) {
    if (x < 0 || y < 0 || x >= WORLD || y >= WORLD) return false;
    if (this.world.getO(x, y)) return false;
    const t = this.world.getT(x, y); if (TERRAIN[t].solid || t === T.AGUA) return false;
    if (OBJECTS[obj].solid) {
      for (const q of this.players.values()) if (!q.dead && Math.abs(q.x - (x + 0.5)) < 0.5 + PLAYER.r && Math.abs(q.y - (y + 0.5)) < 0.5 + PLAYER.r) return false;
      for (const z of this.entities.values()) if (Math.abs(z.x - (x + 0.5)) < 0.5 + z.r && Math.abs(z.y - (y + 0.5)) < 0.5 + z.r) return false;
    }
    return true;
  }
  collect(p, x, y) {
    if (p.dead || p.downed) return;
    const o = this.world.getO(x, y); const def = OBJECTS[o];
    if (!def.built || Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > PLAYER.placeReach) return;
    const m = this.meta.get(key(x, y));
    if (m?.lock && m.lock !== p.name) return this.notice(p, 'Trancado');
    if (def.purifier && this.finale) return this.notice(p, 'O Purificador está a carregar!');
    const hp = this.world.getH(x, y), mx = this.maxHpOf(x, y);
    if (hp >= mx * 0.9) this.addItem(p, def.item, 1);
    else {
      const r = this.recipes.find(r => r.out === def.item);
      if (r) for (const [id, q] of Object.entries(r.in)) { const n = Math.floor(q / 2 / r.n); if (n) this.addItem(p, id, n); }
      this.toast(p, 'Bloco danificado: recebeste metade dos materiais');
    }
    if (def.chest && m?.chest) for (const it of m.chest) if (it) this.addItemObj(p, it);
    if (m) m.chest = null;
    this.setTile(x, y, 0, 0);
    this.fx.push({ k: 'snd', s: 'pickup', x, y });
  }

  // ======================= Combate do jogador =======================
  startReload(p) {
    const it = this.held(p); if (!it) return; const d = this.items[it.id];
    if (d.kind !== 'ranged' || d.bow || p.reloadT > 0) return;
    if (it.a >= d.mag) return;
    if (this.count(p, d.ammo) <= 0) return this.notice(p, 'Sem munição: ' + this.items[d.ammo].name);
    p.reloadTotal = p.reloadT = d.reload * (1 - 0.15 * this.sk(p, 'recarga'));
    this.fx.push({ k: 'snd', s: 'reload', x: p.x, y: p.y });
  }
  playerAttack(p) {
    const inp = p.input;
    const it = this.held(p); const d = it ? this.items[it.id] : null;
    if (d && d.kind === 'place') return; // colocar é feito com 'place' (clique direito ou modo de construção)
    if (d && (d.kind === 'food' || d.kind === 'med' || d.kind === 'misc' || d.kind === 'book')) { if (p.cd <= 0) { this.useHeld(p, inp.ax, inp.ay); p.cd = 0.5; } return; }
    if (p.cd > 0) return;
    if (d && d.kind === 'ranged') return this.shoot(p, it, d);
    if (d && d.kind === 'throw') return this.throwMolotov(p, it, d);
    if (d && d.kind === 'ammo' || d && d.kind === 'armor' || d && d.kind === 'res') return this.melee(p, null, HANDS);
    this.melee(p, it, d && d.kind === 'melee' ? d : HANDS);
  }
  melee(p, it, d) {
    let cd = d.cd;
    if (p.stamina < 6) cd *= 2; else { p.stamina -= 6; p.staminaT = 0.6; }
    p.cd = cd;
    const a = p.input.a;
    let mult = (1 + 0.1 * this.sk(p, 'maos_firmes')) * (p.buffT > 0 ? p.buffMul : 1);
    let hits = 0;
    const range = d.range, arc = d.arc * Math.PI / 180 / 2;
    for (const z of this.queryEnts(p.x, p.y, range + 1.2)) {
      const dx = z.x - p.x, dy = z.y - p.y, dist = Math.hypot(dx, dy);
      if (dist > range + z.r) continue;
      if (Math.abs(angDiff(Math.atan2(dy, dx), a)) > arc + Math.atan2(z.r, Math.max(dist, 0.1))) continue;
      let dmg = d.dmg * mult;
      const critCh = (z.stun > 0 ? 0.5 : 0) + 0.1 * this.sk(p, 'execucao');
      const crit = rand() < critCh; if (crit) dmg *= 2;
      this.hurtEnt(z, dmg, p, Math.cos(a) * d.kb, Math.sin(a) * d.kb, crit);
      hits++;
      if (d.cure) this.addInfection(p, -d.cure, true);
    }
    if (this.opts.friendlyFire) for (const q of this.players.values()) {
      if (q === p || q.dead) continue; const dx = q.x - p.x, dy = q.y - p.y, dist = Math.hypot(dx, dy);
      if (dist < range + PLAYER.r && Math.abs(angDiff(Math.atan2(dy, dx), a)) < arc) { this.hurtPlayer(q, d.dmg * mult * 0.5, null); hits++; }
    }
    // recolher / partir o bloco apontado
    const tx = Math.floor(p.input.ax), ty = Math.floor(p.input.ay);
    const o = this.world.getO(tx, ty);
    if (o && Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) <= PLAYER.reach && !(hits && OBJECTS[o].built && !d.hammer)) { if (this.hitObject(p, tx, ty, o, d)) hits++; }
    else if (!hits) {
      // sem alvo apontado: tenta o bloco imediatamente à frente
      const fx = Math.floor(p.x + Math.cos(a) * 0.9), fy = Math.floor(p.y + Math.sin(a) * 0.9);
      const o2 = this.world.getO(fx, fy);
      if (o2 && !OBJECTS[o2].built) { if (this.hitObject(p, fx, fy, o2, d)) hits++; }
    }
    this.fx.push({ k: 'swing', id: p.id, x: p.x, y: p.y, a, r: range, arc: d.arc });
    if (hits && it && it.d != null) this.wear(p, it);
  }
  wear(p, it, n = 1) {
    it.d -= n; p.invDirty = true;
    if (it.d <= 0) {
      const i = p.inv.indexOf(it); if (i >= 0) p.inv[i] = null;
      const j = p.armor.indexOf(it); if (j >= 0) p.armor[j] = null;
      this.notice(p, this.items[it.id].name + ' partiu-se!'); this.fx.push({ k: 'snd', s: 'break', x: p.x, y: p.y });
    }
  }
  // partir blocos construídos à pancada (devolve o bloco ao partir)
  hitBuilt(p, x, y, o, d) {
    const def = OBJECTS[o]; const m = this.meta.get(key(x, y));
    if (m?.lock && m.lock !== p.name) { this.notice(p, `Trancado por ${m.lock}`); return false; }
    if (def.purifier && this.finale) { this.notice(p, 'O Purificador está a carregar!'); return false; }
    const dmg = Math.max(d.dmg || 5, d.axe || 0, d.pickPow || 0) * 1.5;
    const hp = this.world.getH(x, y) - dmg;
    this.fx.push({ k: 'chip', x: x + 0.5, y: y + 0.5, o });
    if (hp > 0) {
      const c = this.world.chunkAt(x, y); c.h[(y % CHUNK) * CHUNK + (x % CHUNK)] = hp; c.modified = true;
      this.dirtyTiles.set(key(x, y), [x, y]); this.markDamaged(x, y); this.ffDirtySoft = true;
      return true;
    }
    if (def.item) { this.addItem(p, def.item, 1); this.toast(p, `+1 ${this.items[def.item].name}`); }
    if (def.chest && m?.chest) { for (const it of m.chest) if (it) this.addItemObj(p, it); m.chest = null; }
    this.fx.push({ k: 'break', x: x + 0.5, y: y + 0.5, o });
    this.setTile(x, y, 0, 0);
    return true;
  }
  hitObject(p, x, y, o, d) {
    const def = OBJECTS[o];
    if (def.built) {
      if (d.hammer) {
        const mx = this.maxHpOf(x, y), hp = this.world.getH(x, y);
        if (hp >= mx) return false;
        const mat = def.repair || 'madeira';
        const free = rand() < 0.2 * this.sk(p, 'reparador');
        if (!free && this.count(p, mat) <= 0) { this.notice(p, 'Precisas de ' + this.items[mat].name + ' para reparar'); return false; }
        if (!free) this.remove(p, mat, 1);
        this.world.chunkAt(x, y).h[(y % CHUNK) * CHUNK + (x % CHUNK)] = Math.min(mx, hp + 60); this.world.chunkAt(x, y).modified = true;
        this.dirtyTiles.set(key(x, y), [x, y]);
        this.fx.push({ k: 'snd', s: 'repair', x, y }); this.ev('repair'); return true;
      }
      return this.hitBuilt(p, x, y, o, d);
    }
    if (def.interact && def.loot) { this.interact(p, x + 0.5, y + 0.5); return true; }
    if (def.tool === 'none') { this.notice(p, 'Nada o consegue partir… só um Purificador.'); return false; }
    let dmg;
    if (def.tool === 'pick') {
      const tier = d.pick || 0;
      if (tier < def.tier) { this.notice(p, def.tier >= 2 ? 'Precisas de uma Picareta de ferro' : 'Precisas de uma Picareta'); return false; }
      dmg = d.pickPow;
    } else if (def.tool === 'axe') dmg = d.axe || (d === HANDS ? 5 : 6);
    else dmg = 20;
    const rotten = this.world.rot.isRot(x, y);
    this.fx.push({ k: 'chip', x: x + 0.5, y: y + 0.5, o });
    const hp = this.world.getH(x, y) - dmg;
    if (hp > 0) { this.world.chunkAt(x, y).h[(y % CHUNK) * CHUNK + (x % CHUNK)] = hp; this.dirtyTiles.set(key(x, y), [x, y]); this.markDamaged(x, y); return true; }
    // partido: saque
    let drops = def.drops;
    if (o === O.ARVORE && rotten) drops = OBJECTS[O.ARVORE_MORTA].drops;
    const extra = rand() < 0.25 * this.sk(p, 'recoletor');
    // somar tudo o que caiu do mesmo item num só aviso (ex.: 4 + 1 madeira → «+5 Madeira»)
    const total = {};
    for (const [id, n, ch] of drops) if (rand() < ch) total[id] = (total[id] || 0) + n;
    for (const id in total) { if (extra) total[id]++; this.addItem(p, id, total[id]); this.toast(p, `+${total[id]} ${this.items[id].name}`); this.ev('get', id, total[id]); }
    this.giveXP(p, 1);
    this.fx.push({ k: 'break', x: x + 0.5, y: y + 0.5, o });
    const nb = def.becomes || 0;
    this.setTile(x, y, nb, nb ? OBJECTS[nb].hp : 0);
    // voltar a crescer
    const mult = 1 + 0.25 * Math.max(0, this.players.size - 1);
    let rg = 0, ro = o;
    if (o === O.ARVORE) rg = 600; else if (o === O.ROCHA || o === O.PEDRAS) rg = 700; else if (o === O.ARBUSTO || o === O.ERVA_ALTA) rg = 300;
    else if (o === O.ARBUSTO_BAGAS) { rg = 240; ro = O.ARBUSTO_BAGAS; } else if (o === O.ERVAS_MED) rg = 400;
    if (rg) this.regrow.push({ x, y, o: ro, t: this.tick + Math.round(rg / mult * TICK_RATE) });
    return true;
  }
  shoot(p, it, d) {
    if (p.reloadT > 0) return;
    if (d.bow) {
      if (this.count(p, 'flecha') <= 0) { p.cd = 0.4; return this.notice(p, 'Sem flechas'); }
      this.remove(p, 'flecha', 1);
    } else {
      if (it.a <= 0) { p.cd = 0.3; this.fx.push({ k: 'snd', s: 'click', x: p.x, y: p.y }); return this.startReload(p); }
      it.a--; p.invDirty = true;
    }
    p.cd = d.cd;
    const pellets = d.pellets || 1;
    const spread = d.spread * (1 - 0.2 * this.sk(p, 'pontaria')) * Math.PI / 180;
    const mult = p.buffT > 0 ? p.buffMul : 1;
    const ox = p.x + Math.cos(p.input.a) * 0.5, oy = p.y + Math.sin(p.input.a) * 0.5;
    for (let k = 0; k < pellets; k++) {
      const a = p.input.a + (rand() - 0.5) * spread * 2;
      const hit = this.raycast(ox, oy, a, d.range, p);
      if (hit.ent) {
        const crit = rand() < 0.1 * this.sk(p, 'execucao');
        this.hurtEnt(hit.ent, d.dmg * mult * (crit ? 2 : 1), p, Math.cos(a) * 2.5, Math.sin(a) * 2.5, crit);
        if (d.bow && rand() < 0.5) this.dropItem(hit.x, hit.y, this.newItem('flecha', 1));
      } else if (hit.player) this.hurtPlayer(hit.player, d.dmg * 0.5, null);
      else if (d.bow && rand() < 0.6) this.dropItem(hit.x - Math.cos(a) * 0.4, hit.y - Math.sin(a) * 0.4, this.newItem('flecha', 1));
      this.fx.push({ k: d.bow ? 'arrow' : 'tracer', x1: ox, y1: oy, x2: hit.x, y2: hit.y });
    }
    this.fx.push({ k: 'snd', s: 'shot_' + it.id, x: p.x, y: p.y, shake: d.bow ? 0 : d.pellets ? 0.012 : 0.005 });
    if (d.noise) this.makeNoise(p.x, p.y, d.noise);
    this.wear(p, it);
  }
  raycast(x, y, a, range, shooter) {
    const dx = Math.cos(a), dy = Math.sin(a); const step = 0.2;
    for (let t = 0; t < range; t += step) {
      const px = x + dx * t, py = y + dy * t;
      if (this.world.solid(Math.floor(px), Math.floor(py))) return { x: px, y: py };
      for (const z of this.queryEnts(px, py, 1.2)) if (Math.hypot(z.x - px, z.y - py) < z.r + 0.08) return { x: px, y: py, ent: z };
      if (this.opts.friendlyFire && shooter) for (const q of this.players.values()) if (q !== shooter && !q.dead && Math.hypot(q.x - px, q.y - py) < PLAYER.r) return { x: px, y: py, player: q };
    }
    return { x: x + dx * range, y: y + dy * range };
  }
  throwMolotov(p, it, d) {
    p.cd = 0.8;
    const dist = Math.min(d.range, Math.hypot(p.input.ax - p.x, p.input.ay - p.y));
    const a = p.input.a;
    this.projs.push({ id: this.nextId++, k: PROJ.molotov, x: p.x, y: p.y, vx: Math.cos(a) * dist / 0.6, vy: Math.sin(a) * dist / 0.6, t: 0.6, owner: p.id });
    this.consumeHeld(p);
  }
  makeNoise(x, y, r) {
    const rr = r * r;
    for (const z of this.entities.values()) if (z.kind === 'z' && (z.x - x) ** 2 + (z.y - y) ** 2 < rr) { z.aggro = 12; z.nx = x; z.ny = y; }
  }

  // ======================= Dano =======================
  hurtEnt(z, dmg, p, kx, ky, crit) {
    if (z.dead) return;
    z.hp -= dmg; z.flash = 3;
    z.kx += kx / (z.def.boss ? 6 : z.def.push ? 2.5 : 1); z.ky += ky / (z.def.boss ? 6 : z.def.push ? 2.5 : 1);
    if (!z.def.boss) z.stun = 0.3;
    z.aggro = 15; if (p) { z.nx = p.x; z.ny = p.y; }
    this.fx.push({ k: 'hit', x: z.x, y: z.y, crit: !!crit, dmg: Math.round(dmg), blood: z.kind === 'z' ? 1 : 2 });
    if (z.hp <= 0) this.killEnt(z, p);
  }
  killEnt(z, p) {
    z.dead = true; this.entities.delete(z.id);
    if (z.kind === 'a') {
      for (const [id, n, ch] of z.def.drops) if (rand() < ch) this.dropItem(z.x, z.y, this.newItem(id, n));
      if (p) this.giveXP(p, 3);
      this.ev('hunt', z.type);
      return;
    }
    this.fx.push({ k: 'die', x: z.x, y: z.y, t: z.def.id });
    this.ev('kill', z.type);
    if (z.def.explode) this.explode(z.x, z.y, 2.6, z.def.dmg, true);
    if (z.def.boss) {
      this.broadcast({ t: 'n', text: 'O Rei da Podridão caiu!', kind: 'good' });
      for (const q of this.players.values()) { this.addItem(q, 'cristal', 5); this.addItem(q, 'coracao_negro', 1); this.toast(q, '+5 Cristais da Podridão, +1 Coração Negro'); }
    } else {
      if (rand() < 0.5) this.dropItem(z.x, z.y, this.newItem('carne_podre', 1));
      if (rand() < 0.15 * (z.elite ? 2 : 1)) this.dropItem(z.x, z.y, this.newItem(rand() < 0.5 ? 'tecido' : 'sucata', 1));
      if ((z.type === 'brutamontes' || z.type === 'cuspidor') && rand() < (z.elite ? 0.6 : 0.3)) this.dropItem(z.x, z.y, this.newItem('cristal', 1));
      if (z.elite && rand() < 0.3) this.dropItem(z.x, z.y, this.newItem(rand() < 0.5 ? 'balas' : 'componente', rand() < 0.5 ? 5 : 1));
    }
    this.shareXP(z.x, z.y, Math.round(z.def.xp * (z.elite ? 1.5 : 1)));
    if (p && this.sk(p, 'furia')) p.stamina = Math.min(this.maxStamina(p), p.stamina + 5 * this.sk(p, 'furia'));
  }
  hurtPlayer(p, dmg, src, bite = false) {
    if (p.dead || p.dodgeT > 0) return;
    if (p.lying) p.lying = false;
    const ar = p.armor[1]; let red = 0;
    if (ar) { red = this.items[ar.id].red; this.wear(p, ar); }
    dmg *= (1 - red);
    if (p.downed) { p.downedT -= 3; return; }
    p.hp -= dmg; p.lastHit = this.tick;
    p.send({ t: 'fx', l: [{ k: 'hurt', a: Math.min(1, dmg / 30) }] });
    this.fx.push({ k: 'hit', x: p.x, y: p.y, dmg: Math.round(dmg), blood: 1, pl: 1 });
    if (bite && rand() < 0.35) this.addInfection(p, 5 + rand() * 10); // nem todos os golpes são mordidas
    if (src) { const a = Math.atan2(p.y - src.y, p.x - src.x); const k = src.def?.push || 1.5; p.kx += Math.cos(a) * k * 2; p.ky += Math.sin(a) * k * 2; }
    if (p.hp <= 0) this.downOrDie(p);
  }
  addInfection(p, n, raw = false) {
    if (n > 0 && p.vaccine > 0) return;
    if (n > 0 && !raw) n *= (1 - 0.15 * this.sk(p, 'sangue_forte'));
    else if (n > 0) n *= (1 - 0.15 * this.sk(p, 'sangue_forte'));
    p.infection = clamp(p.infection + n, 0, 100);
    if (p.infection >= 100 && !p.dead) {
      this.broadcast({ t: 'n', text: `${p.name} transformou-se…`, kind: 'bad' });
      const z = this.spawnZombie('errante', p.x, p.y); if (z) z.name = p.name;
      this.die(p);
    }
  }
  downOrDie(p) {
    p.hp = 0;
    const others = [...this.players.values()].filter(q => q !== p && !q.dead && !q.downed).length;
    if (others > 0 && !p.downed) {
      p.downed = true; p.downedT = 30; p.reviveT = 0;
      this.broadcast({ t: 'n', text: `${p.name} caiu! Mantém E premido junto dele para o reanimar.`, kind: 'bad' });
    } else this.die(p);
  }
  die(p) {
    if (p.dead) return;
    p.dead = true; p.deadT = 4; p.downed = false; p.lying = false; p.hp = 0; this.ev('die');
    const items = [...p.inv.slice(0, p.invSize), ...p.armor].filter(Boolean);
    if (p.backpack) { this.drops.delete(p.backpack); }
    if (items.length) {
      p.backpack = this.dropItem(p.x, p.y, null, { bp: p.name, items });
      this.notice(p, 'Morreste. A tua mochila ficou no local (marcada no mapa).', 'bad');
    } else { p.backpack = null; this.notice(p, 'Morreste.', 'bad'); }
    p.inv = new Array(SLOT.HOTBAR + SLOT.MAIN + SLOT.BACKPACK).fill(null); p.armor = [null, null, null];
    p.invDirty = true; this.dropsDirty = true;
    this.broadcast({ t: 'n', text: `${p.name} morreu.`, kind: 'bad' });
    if (this.opts.hardcore) {
      this.broadcast({ t: 'n', text: 'Modo Hardcore: o mundo foi apagado.', kind: 'bad' });
      this.hardcoreOver = true;
    }
  }
  respawn(p) {
    p.dead = false; p.hp = 100; p.hunger = Math.max(p.hunger, 70); p.stamina = this.maxStamina(p); p.infection = 0;
    p.kx = p.ky = 0; p.dodgeT = 0;
    if (p.bed && OBJECTS[this.world.getO(p.bed.x, p.bed.y)].bed) { p.x = p.bed.x + 0.5; p.y = p.bed.y + 0.5; }
    else { if (p.bed) this.notice(p, 'A tua cama foi destruída'); p.bed = null; p.x = this.spawn.x; p.y = this.spawn.y; }
    this.unstick(p); this.giveStarterIfEmpty(p); p.invDirty = true;
  }
  giveStarterIfEmpty(p) { if (!p.inv.some(Boolean)) this.addItem(p, 'tocha', 1); }
  explode(x, y, r, dmg, tiles) {
    this.fx.push({ k: 'boom', x, y, r });
    for (const z of this.queryEnts(x, y, r + 1)) { const d = Math.hypot(z.x - x, z.y - y); if (d < r + z.r) this.hurtEnt(z, dmg * (1 - d / (r + 1)), null, (z.x - x) * 3, (z.y - y) * 3); }
    for (const p of this.players.values()) { const d = Math.hypot(p.x - x, p.y - y); if (d < r) this.hurtPlayer(p, dmg * (1 - d / (r + 1)), { x, y, def: { push: 3 } }); }
    if (tiles) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const tx = Math.floor(x) + dx, ty = Math.floor(y) + dy; const o = OBJECTS[this.world.getO(tx, ty)];
      if (o.built && Math.hypot(tx + 0.5 - x, ty + 0.5 - y) < 2) this.damageTile(tx, ty, 200);
    }
    this.makeNoise(x, y, 20);
  }

  // ======================= Entidades =======================
  spawnZombie(type, x, y, opts = {}) {
    const def = ZT[type]; if (!def) return null;
    const n = this.night;
    const pmult = this.players.size;
    let hp = def.hp * (1 + Math.min(1.5, 0.05 * n));
    if (def.boss) hp = def.hp * (1 + 0.75 * Math.max(0, pmult - 1));
    const inRot = this.world.rot.isRot(Math.floor(x), Math.floor(y));
    const elite = !def.boss && (opts.elite ?? (n >= 15 && rand() < 0.12));
    if (elite) hp *= 1.6; if (inRot) hp *= 1.25;
    const z = {
      id: this.nextId++, kind: 'z', type, def, x, y, hp, maxHp: hp, r: def.r,
      speed: def.speed * (1 + Math.min(0.4, 0.02 * n)) * (inRot ? 1.1 : 1) * (0.9 + rand() * 0.2),
      kx: 0, ky: 0, stun: 0, flash: 0, cd: 0, aggro: 0, nx: 0, ny: 0, elite, wander: rand() * 7, wt: 0, spitT: 2, summonT: 8, rotT: 0, groanT: rand() * 8, atk: 0,
    };
    this.entities.set(z.id, z);
    return z;
  }
  spawnAnimal(type, x, y) {
    const def = ANIMALS[type];
    const a = { id: this.nextId++, kind: 'a', type, def, x, y, hp: def.hp, maxHp: def.hp, r: def.r, speed: def.speed, kx: 0, ky: 0, stun: 0, flash: 0, cd: 0, aggro: 0, wander: rand() * 7, wt: 0, flee: 0 };
    this.entities.set(a.id, a); return a;
  }
  buildHash() {
    this.hash = new Map();
    for (const e of this.entities.values()) {
      const k = (Math.floor(e.x / 4)) + ',' + (Math.floor(e.y / 4));
      let l = this.hash.get(k); if (!l) { l = []; this.hash.set(k, l); } l.push(e);
    }
  }
  *queryEnts(x, y, r) {
    if (!this.hash) return;
    const x0 = Math.floor((x - r) / 4), x1 = Math.floor((x + r) / 4), y0 = Math.floor((y - r) / 4), y1 = Math.floor((y + r) / 4);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const l = this.hash.get(cx + ',' + cy); if (l) for (const e of l) if (!e.dead) yield e;
    }
  }
  nearestPlayer(x, y, includeDowned = true) {
    let best = null, bd = 1e9;
    for (const p of this.players.values()) {
      if (p.dead || (!includeDowned && p.downed)) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; }
    }
    return best ? { p: best, d: Math.sqrt(bd) } : null;
  }
  updateFlowFields() {
    const hasDig = [...this.entities.values()].some(e => e.type === 'escavador');
    const alive = this.alivePlayers();
    for (const p of alive) {
      let f = this.ff.get(p.id); if (!f) { f = { n: new FlowField(), d: null }; this.ff.set(p.id, f); }
      f.n.build(this.world, p.x, p.y, alive, false);
      if (hasDig) { if (!f.d) f.d = new FlowField(); f.d.build(this.world, p.x, p.y, alive, true); } else f.d = null;
    }
  }
  updateZombie(z, dt) {
    const def = z.def;
    if (z.flash > 0) z.flash--;
    if (z.stun > 0) {
      z.stun -= dt;
      collideMove(this.world, z, z.kx * dt, z.ky * dt, z.r); z.kx *= 0.8; z.ky *= 0.8; return;
    }
    if (z.kx || z.ky) { collideMove(this.world, z, z.kx * dt, z.ky * dt, z.r); z.kx *= 0.8; z.ky *= 0.8; if (Math.abs(z.kx) + Math.abs(z.ky) < 0.1) z.kx = z.ky = 0; }
    if (z.cd > 0) z.cd -= dt;
    if (z.aggro > 0) z.aggro -= dt;
    z.atk = 0;
    const ph = this.phase;
    const tx = Math.floor(z.x), ty = Math.floor(z.y);
    // ao amanhecer ardem
    if ((ph === 'amanhecer' || ph === 'dia') && !def.boss && z.night && !this.world.rot.isRot(tx, ty) && !this.finale) { z.hp -= 4 * dt; z.burn = true; if (z.hp <= 0) { this.killEnt(z, null); return; } }
    if ((z.groanT -= dt) <= 0) { z.groanT = 5 + rand() * 9; this.fx.push({ k: 'snd', s: 'groan_' + z.type, x: z.x, y: z.y }); }
    const np = this.nearestPlayer(z.x, z.y);
    if (!np) return;
    let target = np.p, dist = np.d;
    // Armadura da Podridão: os Errantes ignoram-te
    const stealth = target.armor[1] && this.items[target.armor[1].id]?.stealth && z.type === 'errante';
    const detect = 13 * (1 - 0.15 * this.sk(target, 'furtivo')) * (this.phase === 'noite' ? 1.8 : 1);
    const hunting = !stealth && (z.night || z.aggro > 0 || dist < detect || def.boss);
    let sp = z.speed;
    const t0 = TERRAIN[this.world.getT(tx, ty)]; if (t0.slow) sp *= t0.slow;
    const o0 = OBJECTS[this.world.getO(tx, ty)]; if (o0.slow) sp *= o0.slow;
    if (z.elite) sp *= 1.1;
    if (def.boss && z.hp < z.maxHp * 0.5) { sp *= 1.5; z.rage = true; }
    let mx = 0, my = 0;
    if (!hunting) {
      z.wt -= dt; if (z.wt <= 0) { z.wt = 2 + rand() * 4; z.wander = rand() < 0.4 ? null : rand() * Math.PI * 2; }
      if (z.aggro > 0) { mx = z.nx - z.x; my = z.ny - z.y; }
      else if (z.wander != null) { mx = Math.cos(z.wander) * 0.4; my = Math.sin(z.wander) * 0.4; }
    } else {
      // Cuspidor: fica à distância e cospe
      if (def.ranged && dist < 7 && lineOfSight(this.world, z.x, z.y, target.x, target.y)) {
        z.spitT -= dt;
        if (z.spitT <= 0) {
          z.spitT = 2.4; const a = Math.atan2(target.y - z.y, target.x - z.x);
          this.projs.push({ id: this.nextId++, k: PROJ.acido, x: z.x, y: z.y, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, t: 1.4, dmg: def.dmg });
          this.fx.push({ k: 'snd', s: 'spit', x: z.x, y: z.y });
        }
        if (dist < 4.5) { mx = z.x - target.x; my = z.y - target.y; } // recua
        z.atk = 1;
      } else {
        const direct = dist < 7 && lineOfSight(this.world, z.x, z.y, target.x, target.y);
        let next = null;
        if (!direct) {
          const f = this.ff.get(target.id);
          const field = def.dig && f?.d ? f.d : f?.n;
          if (field) next = field.next(tx, ty);
        }
        if (next) {
          const nobj = OBJECTS[this.world.getO(next.x, next.y)];
          const blocked = this.world.solid(next.x, next.y) && !(def.dig && nobj.built && !nobj.noDig);
          if (blocked && nobj.built) {
            const dd = Math.hypot(next.x + 0.5 - z.x, next.y + 0.5 - z.y);
            if (dd < z.r + 0.75) {
              if (def.explode) { this.killEnt(z, null); return; }
              const m = this.meta.get(key(next.x, next.y));
              let brk = def.wBreak * (z.elite ? 1.5 : 1);
              if (m?.mx) brk *= 1;
              this.damageTile(next.x, next.y, brk * dt);
              z.atk = 1;
              if (rand() < 0.05) this.fx.push({ k: 'chip', x: next.x + 0.5, y: next.y + 0.5, o: nobj.id });
            }
          }
          mx = next.x + 0.5 - z.x; my = next.y + 0.5 - z.y;
        } else { mx = target.x - z.x; my = target.y - z.y; }
        // Corredores evitam holofotes acesos
        if (z.type === 'corredor' && this.phase === 'noite') for (const k of this.holofotes) {
          if (!this.powered.has(k)) continue; const [hx, hy] = unkey(k); const d = Math.hypot(z.x - hx, z.y - hy);
          if (d < 13 && d > 0.1) { mx += (z.x - hx) / d * 1.2; my += (z.y - hy) / d * 1.2; }
        }
      }
    }
    // Escavador: atravessa paredes de madeira e pedra
    const len = Math.hypot(mx, my);
    if (len > 0.01) {
      const vx = mx / len * sp * Math.min(1, len * 2), vy = my / len * sp * Math.min(1, len * 2);
      if (def.dig) collideMove(this.digWorld, z, vx * dt, vy * dt, z.r);
      else collideMove(this.world, z, vx * dt, vy * dt, z.r);
      z.a = Math.atan2(vy, vx);
    }
    // ataque ao jogador
    if (hunting && dist < z.r + PLAYER.r + 0.4 && z.cd <= 0) {
      if (def.explode) { this.killEnt(z, null); return; }
      z.cd = def.boss ? 1.4 : 1.0; z.atk = 1;
      this.hurtPlayer(target, def.dmg * (z.elite ? 1.3 : 1), z, true);
      this.fx.push({ k: 'snd', s: 'bite', x: z.x, y: z.y });
    }
    // armadilhas
    if (o0.trap) {
      const m = this.meta.get(key(tx, ty)); const mult = 1 + 0.25 * (m?.tl || 0);
      z.hp -= o0.trap * mult * dt; z.flash = z.flash || (rand() < 0.1 ? 2 : 0);
      this.damageTile(tx, ty, 3 * dt);
      if (z.hp <= 0) { this.killEnt(z, null); return; }
    }
    if (o0.mine) {
      const m = this.meta.get(key(tx, ty)); this.setTile(tx, ty, 0, 0);
      this.explode(tx + 0.5, ty + 0.5, 2.5, o0.mine * (1 + 0.25 * (m?.tl || 0)), false);
    }
    // chefe
    if (def.boss) {
      z.summonT -= dt;
      if (z.summonT <= 0) {
        z.summonT = z.rage ? 7 : 12;
        for (let i = 0; i < (z.rage ? 6 : 4); i++) { const a = rand() * 6.28; const s = this.spawnZombie('errante', z.x + Math.cos(a) * 2, z.y + Math.sin(a) * 2); if (s) s.night = true; }
        this.fx.push({ k: 'snd', s: 'roar', x: z.x, y: z.y, shake: 0.01 });
      }
      z.rotT -= dt;
      if (z.rotT <= 0) { z.rotT = 3; this.world.rot.patches.push({ x: Math.floor(z.x), y: Math.floor(z.y), r: 4 }); if (this.world.rot.patches.length > 150) this.world.rot.patches.shift(); this.rotDirty = true; }
    }
  }
  updateAnimal(a, dt) {
    if (a.flash > 0) a.flash--;
    if (a.kx || a.ky) { collideMove(this.world, a, a.kx * dt, a.ky * dt, a.r); a.kx *= 0.8; a.ky *= 0.8; }
    if (a.stun > 0) { a.stun -= dt; return; }
    if (a.cd > 0) a.cd -= dt;
    const np = this.nearestPlayer(a.x, a.y, false);
    let mx = 0, my = 0, sp = a.speed * 0.3;
    if (np && np.d < 7 || a.aggro > 0) {
      if (a.aggro > 0) a.aggro -= dt;
      if (a.def.aggressive && a.aggro > 0 && np) {
        mx = np.p.x - a.x; my = np.p.y - a.y; sp = a.speed;
        if (np.d < a.r + PLAYER.r + 0.3 && a.cd <= 0) { a.cd = 1.2; this.hurtPlayer(np.p, a.def.dmg, a); }
      } else if (np) { mx = a.x - np.p.x; my = a.y - np.p.y; sp = a.speed; }
    } else {
      a.wt -= dt; if (a.wt <= 0) { a.wt = 2 + rand() * 4; a.wander = rand() < 0.5 ? null : rand() * 6.28; }
      if (a.wander != null) { mx = Math.cos(a.wander); my = Math.sin(a.wander); }
    }
    const l = Math.hypot(mx, my);
    if (l > 0.01) { collideMove(this.world, a, mx / l * sp * dt, my / l * sp * dt, a.r); a.a = Math.atan2(my, mx); }
  }

  // ======================= Ciclo dia/noite e geração de hordas =======================
  updateClock(dt) {
    this.clock += dt;
    const ph = phaseAt(this.clock);
    this.phase = this.finale ? 'noite' : ph.k;
    if (ph.k !== this.lastPhase) {
      const prev = this.lastPhase; this.lastPhase = ph.k;
      if (ph.k === 'crepusculo') this.broadcast({ t: 'n', text: 'A noite aproxima-se… volta à base!', kind: 'warn', snd: 'alarm' });
      if (ph.k === 'noite') this.startNight();
      if (ph.k === 'amanhecer' && prev === 'noite') this.endNight();
    }
    if (this.phase === 'noite' && this.nightPlan) this.nightSpawns(dt);
    else if (this.phase === 'dia') this.daySpawns(dt);
    // dormir
    const alive = this.alivePlayers();
    if (alive.length && alive.every(p => p.lying) && (ph.k === 'noite' || ph.k === 'crepusculo') && !this.finale) {
      let near = false; for (const z of this.entities.values()) if (z.kind === 'z' && alive.some(p => Math.hypot(p.x - z.x, p.y - z.y) < 15)) { near = true; break; }
      if (!near) {
        const base = Math.floor(this.clock / DAY_LENGTH) * DAY_LENGTH;
        if (ph.k === 'crepusculo') this.startNight();
        this.clock = base + DAY_LENGTH + 0.5;
        this.endNight(true); this.lastPhase = 'amanhecer';
        for (const p of alive) p.lying = false;
        for (const z of [...this.entities.values()]) if (z.kind === 'z' && z.night) this.entities.delete(z.id);
        this.broadcast({ t: 'n', text: 'Dormiram até de manhã.', kind: 'good' });
      }
    }
  }
  playerMult() { return 1 + 0.6 * Math.max(0, this.players.size - 1); }
  maxActive() { return Math.min(320, 200 + 40 * Math.max(0, this.players.size - 1)); }
  startNight() {
    this.night++;
    const blood = this.night % 7 === 0;
    const total = Math.round((8 + 4 * this.night) * this.playerMult() * (blood ? 2 : 1));
    this.nightPlan = { total, spawned: 0, acc: 0, blood, boss: this.night % 21 === 0, bossDone: false };
    this.world.rot.radius += 6; this.rotDirty = true;
    this.broadcast({ t: 'n', text: blood ? `Noite ${this.night} — LUA DE SANGUE!` : `Noite ${this.night}`, kind: blood ? 'blood' : 'warn', snd: blood ? 'roar' : 'alarm' });
    for (const k of this.generators) { const m = this.meta.get(k); if (m && m.fuel > 0 && !(m.fuelT > 0)) { m.fuel--; m.fuelT = 360; } }
    this.updatePower();
  }
  endNight(slept) {
    if (this.nightPlan || slept) {
      this.broadcast({ t: 'n', text: `Sobreviveram à noite ${this.night}!`, kind: 'good' });
      for (const p of this.alivePlayers()) { this.giveXP(p, 50); if (p.vaccine > 0) { p.vaccine--; } }
      this.ev('night'); this.stats['nightn:*'] = Math.max(this.stats['nightn:*'] || 0, this.night); this.checkQuests();
      if (this.nightPlan?.blood) for (const p of this.alivePlayers()) { this.addItem(p, 'balas', 5); this.addItem(p, 'ligadura', 1); this.toast(p, 'Recompensa da Lua de Sangue'); }
    }
    this.nightPlan = null;
    this.rollDaily(true);
    // purificadores gastam combustível
    for (const k of this.purifiers) { const m = this.meta.get(k); if (m) { m.fuel = Math.max(0, (m.fuel || 0) - 1); } }
    this.updatePurifiers();
    this.save();
  }
  nightTypes() {
    const n = this.night, blood = this.nightPlan?.blood;
    const w = [['errante', 10]];
    if (n >= 3) w.push(['corredor', blood ? 6 : 4]);
    if (n >= 5) w.push(['brutamontes', blood ? 2.5 : 1.2]);
    if (n >= 7) w.push(['cuspidor', blood ? 3 : 1.8]);
    if (n >= 10) w.push(['explosivo', blood ? 2.5 : 1.4]);
    if (n >= 12) w.push(['escavador', blood ? 2.5 : 1.3]);
    let s = 0; for (const [, x] of w) s += x; let r = rand() * s;
    for (const [t, x] of w) { r -= x; if (r <= 0) return t; }
    return 'errante';
  }
  countZ() { let n = 0; for (const e of this.entities.values()) if (e.kind === 'z') n++; return n; }
  nightSpawns(dt) {
    const pl = this.nightPlan;
    const dur = PHASES[3].dur * 0.75;
    pl.acc += pl.total / dur * dt;
    if (pl.boss && !pl.bossDone && this.alivePlayers().length) {
      const pos = this.findSpawnPos(26, 34);
      if (pos) { const b = this.spawnZombie('rei', pos.x, pos.y); b.night = true; pl.bossDone = true; this.broadcast({ t: 'n', text: 'O REI DA PODRIDÃO ACORDOU!', kind: 'blood', snd: 'roar' }); }
    }
    // hordas: grupos que nascem juntos a intervalos
    pl.waveT = (pl.waveT ?? 4) - dt;
    if (pl.waveT > 0 || pl.spawned >= pl.total) return;
    pl.waveT = 16 + rand() * 10;
    const size = Math.max(3, Math.ceil(pl.total / 10));
    let left = Math.min(size, pl.total - pl.spawned);
    for (let g = 0; g < 3 && left > 0; g++) {
      const pos = this.findSpawnPos(22, 34);
      if (!pos) continue;
      const n = g === 2 ? left : Math.ceil(left / (3 - g));
      for (let i = 0; i < n; i++) {
        if (this.countZ() >= this.maxActive()) { left = 0; break; }
        let x = pos.x + (rand() - 0.5) * 4, y = pos.y + (rand() - 0.5) * 4;
        if (this.world.solid(Math.floor(x), Math.floor(y))) { x = pos.x; y = pos.y; }
        const z = this.spawnZombie(this.nightTypes(), x, y); if (z) { z.night = true; pl.spawned++; left--; }
      }
    }
    this.broadcast({ t: 'fx', l: [{ k: 'snd', s: 'horde' }] });
  }
  daySpawns(dt) {
    this.daySpawnT -= dt;
    if (this.daySpawnT > 0) return;
    this.daySpawnT = 35 + rand() * 25;
    const alive = this.alivePlayers(); if (!alive.length) return;
    let dayZ = 0; for (const e of this.entities.values()) if (e.kind === 'z' && !e.night) dayZ++;
    if (dayZ >= 5 * alive.length) return;
    const p = alive[(rand() * alive.length) | 0];
    const pos = this.findSpawnPos(24, 34, p);
    if (!pos) return;
    const inRot = this.world.rot.isRot(Math.floor(pos.x), Math.floor(pos.y));
    const n = 1 + (rand() * (inRot ? 4 : 2.5) | 0);
    for (let i = 0; i < n; i++) this.spawnZombie(inRot && this.night >= 3 && rand() < 0.3 ? 'corredor' : 'errante', pos.x + rand() * 2, pos.y + rand() * 2);
  }
  findSpawnPos(r0, r1, who) {
    const alive = this.alivePlayers(); if (!alive.length) return null;
    for (let k = 0; k < 14; k++) {
      const p = who || alive[(rand() * alive.length) | 0];
      const a = rand() * Math.PI * 2, d = r0 + rand() * (r1 - r0);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      const tx = Math.floor(x), ty = Math.floor(y);
      if (this.world.solid(tx, ty) || this.world.getT(tx, ty) === T.AGUA) continue;
      if (alive.some(q => Math.hypot(q.x - x, q.y - y) < r0 - 1)) continue;
      if (this.isLit(tx, ty, 14)) continue; // pelo menos ~20 blocos de qualquer luz
      return { x: tx + 0.5, y: ty + 0.5 };
    }
    return null;
  }
  spawnAnimals(dt) {
    this.animalT -= dt; if (this.animalT > 0) return; this.animalT = 8;
    if (this.phase !== 'dia') return;
    let n = 0; for (const e of this.entities.values()) if (e.kind === 'a') n++;
    if (n >= 6 * this.players.size) return;
    const pos = this.findSpawnPos(18, 30); if (!pos) return;
    const b = this.world.gen.biome(Math.floor(pos.x), Math.floor(pos.y));
    if (b !== 'floresta' && b !== 'planicie') return;
    const r = rand(); const t = r < 0.5 ? 'coelho' : r < 0.8 ? 'veado' : 'javali';
    for (let i = 0; i < (t === 'coelho' ? 2 : 1); i++) this.spawnAnimal(t, pos.x + i, pos.y);
  }

  // ======================= Estruturas: torres, geradores, fogo =======================
  updatePower() {
    const gens = [];
    for (const k of this.generators) { const m = this.meta.get(k); if (m && (m.fuelT > 0 || (m.fuel > 0 && this.phase !== 'noite'))) gens.push(unkey(k)); }
    const pw = new Set();
    for (const set of [this.holofotes, this.turrets]) for (const k of set) {
      const [x, y] = unkey(k);
      if (gens.some(([gx, gy]) => Math.hypot(gx - x, gy - y) <= 12)) pw.add(k);
    }
    const changed = pw.size !== this.powered.size || [...pw].some(k => !this.powered.has(k));
    this.powered = pw;
    if (changed) this.broadcast({ t: 'pw', l: [...pw].filter(k => this.holofotes.has(k)) });
  }
  updateStructures(dt) {
    // geradores gastam combustível à noite
    if (this.phase === 'noite') for (const k of this.generators) {
      const m = this.meta.get(k); if (!m) continue;
      if (m.fuelT > 0) { m.fuelT -= dt; if (m.fuelT <= 0) { if (m.fuel > 0) { m.fuel--; m.fuelT = 360; } else { m.fuelT = 0; this.updatePower(); } } }
      else if (m.fuel > 0) { m.fuel--; m.fuelT = 360; this.updatePower(); }
    }
    // torres
    for (const k of this.turrets) {
      const m = this.meta.get(k) || {}; this.meta.set(k, m);
      m.cd = (m.cd || 0) - dt; if (m.cd > 0) continue;
      if (this.phase === 'noite' && !this.powered.has(k)) continue;
      const [x, y] = unkey(k); const cx = x + 0.5, cy = y + 0.5;
      let best = null, bd = 10;
      for (const z of this.queryEnts(cx, cy, 10)) { if (z.kind !== 'z') continue; const d = Math.hypot(z.x - cx, z.y - cy); if (d < bd && lineOfSight(this.world, cx, cy, z.x, z.y)) { bd = d; best = z; } }
      if (!best) { m.cd = 0.3; continue; }
      // munição de um baú encostado
      let chest = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ck = key(x + dx, y + dy); const cm = this.meta.get(ck);
        if (cm?.chest && OBJECTS[this.world.getO(x + dx, y + dy)].chest) { const s = cm.chest.find(s => s && s.id === 'balas'); if (s) { chest = { cm, s, ck }; break; } }
      }
      if (!chest) { m.cd = 1; continue; }
      chest.s.n--; if (chest.s.n <= 0) chest.cm.chest[chest.cm.chest.indexOf(chest.s)] = null;
      if (rand() < 0.2) this.chestChanged(chest.ck);
      m.cd = 0.5 / (1 + 0.15 * (m.tec || 0)); m.a = Math.atan2(best.y - cy, best.x - cx);
      this.hurtEnt(best, 18, null, Math.cos(m.a) * 2, Math.sin(m.a) * 2);
      this.fx.push({ k: 'tracer', x1: cx, y1: cy, x2: best.x, y2: best.y }, { k: 'snd', s: 'shot_torre', x: cx, y: cy });
      this.makeNoise(cx, cy, 12);
    }
    // fogo
    for (const f of this.fires) {
      f.t -= dt;
      for (const z of this.queryEnts(f.x, f.y, f.r + 1)) if (Math.hypot(z.x - f.x, z.y - f.y) < f.r + z.r) { z.hp -= f.dmg * dt; z.flash = 1; z.burnT = 1; if (z.hp <= 0) this.killEnt(z, this.players.get(f.owner)); }
      for (const p of this.players.values()) if (!p.dead && Math.hypot(p.x - f.x, p.y - f.y) < f.r && (this.opts.friendlyFire || p.id === f.owner)) { p.hp -= f.dmg * 0.5 * dt; if (p.hp <= 0) this.downOrDie(p); }
    }
    this.fires = this.fires.filter(f => f.t > 0);
  }
  updateProjectiles(dt) {
    for (const pr of this.projs) {
      pr.t -= dt;
      const nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt;
      if (pr.k === PROJ.acido) {
        const tx = Math.floor(nx), ty = Math.floor(ny);
        if (this.world.solid(tx, ty)) { pr.t = 0; if (OBJECTS[this.world.getO(tx, ty)].built) this.damageTile(tx, ty, 40); this.fx.push({ k: 'acid', x: nx, y: ny }); continue; }
        for (const p of this.players.values()) if (!p.dead && Math.hypot(p.x - nx, p.y - ny) < PLAYER.r + 0.2) { this.hurtPlayer(p, pr.dmg, null); this.addInfection(p, 3); pr.t = 0; this.fx.push({ k: 'acid', x: nx, y: ny }); break; }
      }
      pr.x = nx; pr.y = ny;
      if (pr.t <= 0 && pr.k === PROJ.molotov) {
        this.fires.push({ id: this.nextId++, x: pr.x, y: pr.y, r: 1.8, t: 5, dmg: 10, owner: pr.owner });
        this.fx.push({ k: 'snd', s: 'fire', x: pr.x, y: pr.y }, { k: 'boom', x: pr.x, y: pr.y, r: 1.2, fire: 1 });
        this.makeNoise(pr.x, pr.y, 10);
      }
    }
    this.projs = this.projs.filter(p => p.t > 0);
  }
  updateRegrow() {
    if (this.tick % 20) return;
    const keep = [];
    for (const r of this.regrow) {
      if (r.t > this.tick) { keep.push(r); continue; }
      if (this.world.getO(r.x, r.y)) continue;
      if (this.alivePlayers().some(p => Math.abs(p.x - r.x - 0.5) < 1 && Math.abs(p.y - r.y - 0.5) < 1)) { r.t += 200; keep.push(r); continue; }
      this.setTile(r.x, r.y, r.o, OBJECTS[r.o].hp);
    }
    this.regrow = keep;
  }
  updateRot(dt) {
    if (this.tick % 40) return; // a cada 2 s
    for (const k of this.built) {
      const [x, y] = unkey(k);
      if (this.world.rot.isRot(x, y) && !OBJECTS[this.world.getO(x, y)].purifier) this.damageTile(x, y, 2);
    }
  }
  checkFinale(x, y, p) {
    if (this.victory || this.finale) return;
    if (Math.hypot(x - CENTER, y - CENTER) > 9) return;
    this.finale = { x, y, t: 180 };
    this.broadcast({ t: 'n', text: 'O Purificador começou a carregar no Coração da Podridão! Aguentem 3 minutos!', kind: 'blood', snd: 'roar' });
    this.nightPlan = { total: 999, spawned: 0, acc: 0, blood: true, boss: false, finale: true };
  }
  updateFinale(dt) {
    if (!this.finale) return;
    const f = this.finale;
    if (!OBJECTS[this.world.getO(f.x, f.y)].purifier) { this.finale = null; this.nightPlan = null; this.broadcast({ t: 'n', text: 'O Purificador foi destruído…', kind: 'bad' }); return; }
    f.t -= dt;
    if (this.tick % 10 === 0 && this.countZ() < this.maxActive()) for (let i = 0; i < Math.ceil(this.players.size * 1.5); i++) { const pos = this.findSpawnPos(18, 30); if (pos) { const z = this.spawnZombie(this.nightTypes(), pos.x, pos.y); if (z) z.night = true; } }
    if (f.t <= 0) {
      this.finale = null; this.nightPlan = null; this.victory = true;
      this.world.rot.cleared = true; this.rotDirty = true;
      const c = this.world.chunkAt(CENTER, CENTER); const i = (CENTER % CHUNK) * CHUNK + (CENTER % CHUNK);
      if (c.o[i] === O.CORACAO) this.setTile(CENTER, CENTER, 0, 0);
      for (const z of [...this.entities.values()]) if (z.kind === 'z') { z.hp = 0; this.killEnt(z, null); }
      this.ev('win');
      this.broadcast({ t: 'n', text: 'VITÓRIA! A Podridão foi purificada. O jogo continua em modo livre.', kind: 'victory', snd: 'victory' });
      this.save();
    }
  }

  // ======================= Ciclo principal =======================
  step() {
    const dt = DT;
    this.tick++;
    this.updateClock(dt);
    // chunks ativos
    for (const p of this.players.values()) {
      const pcx = Math.floor(p.x / CHUNK), pcy = Math.floor(p.y / CHUNK);
      for (let dy = -ACTIVE_CHUNK_RADIUS; dy <= ACTIVE_CHUNK_RADIUS; dy++) for (let dx = -ACTIVE_CHUNK_RADIUS; dx <= ACTIVE_CHUNK_RADIUS; dx++) this.world.ensure(pcx + dx, pcy + dy);
    }
    this.buildHash();
    // jogadores
    for (const p of this.players.values()) this.updatePlayer(p, dt);
    this.buildHash();
    if (this.ffDirty || this.tick % 10 === 0 || (this.ffDirtySoft && this.tick % 5 === 0)) {
      if (this.countZ() > 0 || this.ffDirty) this.updateFlowFields();
      this.ffDirty = false; this.ffDirtySoft = false;
    }
    if (!this.digWorld) { const w = this.world; this.digWorld = { solid: (x, y) => { const o = OBJECTS[w.getO(x, y)]; if (o.built && o.solid && !o.noDig) return false; return w.solid(x, y); }, getO: (x, y) => w.getO(x, y), getT: (x, y) => w.getT(x, y) }; }
    for (const e of [...this.entities.values()]) {
      if (e.dead) continue;
      const np = this.nearestPlayer(e.x, e.y);
      if (!np || np.d > 110) { this.entities.delete(e.id); continue; }
      if (e.kind === 'z') this.updateZombie(e, dt); else this.updateAnimal(e, dt);
    }
    // separação ligeira entre zombies (só visual/qualidade)
    if (this.tick % 2 === 0) for (const l of this.hash.values()) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      const a = l[i], b = l[j]; const dx = b.x - a.x, dy = b.y - a.y; const d2 = dx * dx + dy * dy; const rr = (a.r + b.r) * 0.85;
      if (d2 < rr * rr && d2 > 1e-4) { const d = Math.sqrt(d2); const push = (rr - d) * 0.25; collideMove(this.world, a, -dx / d * push, -dy / d * push, a.r); collideMove(this.world, b, dx / d * push, dy / d * push, b.r); }
    }
    this.updateProjectiles(dt);
    this.updateStructures(dt);
    this.spawnAnimals(dt);
    this.updateRegrow();
    this.updateRot(dt);
    this.updateHealing();
    this.updateFinale(dt);
    if (this.tick % 20 === 0) this.updatePower();
    // apanhar automaticamente itens pequenos ao passar
    if (this.tick % 4 === 0) for (const d of [...this.drops.values()]) {
      if (d.bp || this.tick - d.born < 15) continue;
      for (const p of this.players.values()) {
        if (p.dead || p.downed || (d.from === p.id && this.tick - d.born < 60)) continue;
        if (Math.hypot(p.x - d.x, p.y - d.y) < 0.9) {
          const left = this.addItemObjNoGround(p, d.item);
          if (!left) { this.drops.delete(d.id); this.dropsDirty = true; this.ev('get', d.item.id, d.item.n); this.toast(p, `+${d.item.n} ${this.items[d.item.id].name}`); p.send({ t: 'fx', l: [{ k: 'snd', s: 'pickup' }] }); }
          break;
        }
      }
      if (this.tick - d.born > TICK_RATE * 600) { this.drops.delete(d.id); this.dropsDirty = true; }
    }
    if (this.tick % 600 === 0) this.gcChunks();
  }
  updatePlayer(p, dt) {
    if (p.dead) {
      p.deadT -= dt; p.inputs.length = 0;
      if (p.deadT <= 0) this.respawn(p);
      return;
    }
    // inputs (movimento previsto pelo cliente)
    let ran = false, fired = false;
    const q = p.inputs.splice(0, p.inputs.length > 4 ? p.inputs.length - 2 : 2);
    for (const inp of q) {
      if (inp.fire) fired = true; // um clique curto num input intermédio também conta
      if (p.lying && (inp.mx || inp.my)) p.lying = false;
      const r = stepPlayer(p, inp, this.world, dt);
      if (r.ran) ran = true;
      if (r.dodged) { p.stamina -= PLAYER.dodgeCost; p.staminaT = 0.6; this.fx.push({ k: 'snd', s: 'dodge', x: p.x, y: p.y }); }
      p.lastSeq = inp.s;
      p.input = inp; p.a = inp.a;
    }
    if (p.x < 1) p.x = 1; if (p.y < 1) p.y = 1; if (p.x > WORLD - 1) p.x = WORLD - 1; if (p.y > WORLD - 1) p.y = WORLD - 1;
    if (!q.length && (p.kx || p.ky)) stepPlayer(p, { mx: 0, my: 0 }, this.world, dt);
    // estados
    if (p.cd > 0) p.cd -= dt;
    if (p.buffT > 0) p.buffT -= dt;
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      const it = this.held(p); const d = it && this.items[it.id];
      if (!d || d.kind !== 'ranged') p.reloadT = 0;
      else if (p.reloadT <= 0) { const need = d.mag - it.a; const have = this.count(p, d.ammo); const k = Math.min(need, have); this.remove(p, d.ammo, k); it.a += k; p.invDirty = true; }
    }
    const maxSt = this.maxStamina(p);
    if (ran) { p.stamina -= 12 * dt; p.staminaT = 0.6; }
    if (p.staminaT > 0) p.staminaT -= dt;
    else {
      let rate = 28;
      for (const o of this.players.values()) if (o !== p && !o.dead && this.sk(o, 'moral') && Math.hypot(o.x - p.x, o.y - p.y) < 8) rate *= 1 + 0.1 * this.sk(o, 'moral');
      p.stamina = Math.min(maxSt, p.stamina + rate * dt);
    }
    if (p.stamina < 0) p.stamina = 0;
    p.exhausted = p.stamina < 5;
    // fome
    const hungerRate = (1 / 30) * (ran ? 2 : 1) * (1 - 0.15 * this.sk(p, 'estomago'));
    p.hunger = Math.max(0, p.hunger - hungerRate * dt);
    if (p.hunger <= 0) { p.starveAcc += dt; if (p.starveAcc > 3) { p.starveAcc = 0; p.hp -= 1; if (p.hp <= 0) this.downOrDie(p); } }
    if (p.hunger > 50 && !p.downed && p.hp < 100) { p.regenAcc += dt; if (p.regenAcc > 4) { p.regenAcc = 0; p.hp = Math.min(100, p.hp + 1); } }
    if (p.regenT > 0) { p.regenT -= dt; if (!p.downed) p.hp = Math.min(100, p.hp + dt); }
    if (this.tick % 40 === 0 && !this.stats['visit:cratera'] && Math.hypot(p.x - CENTER, p.y - CENTER) < 75) this.ev('visit', 'cratera');
    // Podridão
    if (this.tick % 20 === 0 && this.world.rot.isRot(Math.floor(p.x), Math.floor(p.y))) this.addInfection(p, 0.6);
    // caído
    if (p.downed) {
      p.downedT -= dt;
      if (p.downedT <= 0) this.die(p);
      else if (!this.players.size || [...this.players.values()].every(o => o === p || o.dead || o.downed)) this.die(p);
    }
    // reanimar
    if (p.eHold && !p.downed) {
      let tgt = null;
      for (const o of this.players.values()) if (o !== p && o.downed && Math.hypot(o.x - p.x, o.y - p.y) < 1.8) tgt = o;
      if (tgt) {
        p.reviveT += dt; p.reviveTgt = tgt.id;
        const need = 4 * (1 - 0.25 * this.sk(p, 'socorrista'));
        if (p.reviveT >= need) { tgt.downed = false; tgt.hp = 30; p.reviveT = 0; this.ev('revive'); this.broadcast({ t: 'n', text: `${p.name} reanimou ${tgt.name}!`, kind: 'good' }); }
      } else { p.reviveT = 0; p.reviveTgt = null; }
    } else p.reviveT = 0;
    // ataque contínuo
    if (!p.downed && !p.lying && (p.input.fire || fired)) this.playerAttack(p);
    if (p.openChest) { const [cx, cy] = unkey(p.openChest); if (Math.hypot(cx + 0.5 - p.x, cy + 0.5 - p.y) > 3.5 || !OBJECTS[this.world.getO(cx, cy)].chest) { p.openChest = null; p.send({ t: 'chestClose' }); } }
  }
  gcChunks() {
    for (const [k, c] of this.world.chunks) {
      if (c.modified) continue;
      let near = false;
      for (const p of this.players.values()) if (Math.abs(Math.floor(p.x / CHUNK) - c.cx) <= 6 && Math.abs(Math.floor(p.y / CHUNK) - c.cy) <= 6) { near = true; break; }
      if (!near) this.world.chunks.delete(k);
    }
  }

  // ======================= Rede: mensagens para os clientes =======================
  broadcast(m) { for (const p of this.players.values()) p.send(m); }
  notice(p, text, kind = 'info') { p.send({ t: 'n', text, kind }); }
  toast(p, text) { p.send({ t: 'toast', text }); }
  timeInfo() {
    const ph = phaseAt(this.clock);
    return { c: this.clock, ph: this.finale ? 'noite' : ph.k, n: this.night, b: !!this.nightPlan?.blood, fin: this.finale ? Math.ceil(this.finale.t) : 0, v: this.victory };
  }
  // chamado após cada step pelo servidor
  outbound(sendBin) {
    const time = this.timeInfo();
    const players = [...this.players.values()].map(p => {
      const it = this.held(p);
      return {
        id: p.id, n: p.name, x: +p.x.toFixed(3), y: +p.y.toFixed(3), a: +p.a.toFixed(2), hp: Math.round(p.hp), c: p.color,
        it: it ? it.id : null, f: (p.downed ? 1 : 0) | (p.dead ? 2 : 0) | (p.lying ? 4 : 0) | (p.dodgeT > 0 ? 8 : 0) | (p.reloadT > 0 ? 16 : 0) | (p.buffT > 0 ? 32 : 0),
        dt: p.downed ? Math.ceil(p.downedT) : 0, rv: p.reviveT > 0 ? p.reviveT : 0,
      };
    });
    // FX filtrados por distância
    const fx = this.fx; this.fx = [];
    const tiles = [...this.dirtyTiles.values()]; this.dirtyTiles.clear();
    const tileList = [];
    for (const [x, y] of tiles) tileList.push(x, y, this.world.getO(x, y), this.world.getH(x, y));
    const sendEnts = this.tick % 2 === 0;
    for (const p of this.players.values()) {
      // chunks
      const pcx = Math.floor(p.x / CHUNK), pcy = Math.floor(p.y / CHUNK);
      let sent = 0;
      for (let r = 0; r <= ACTIVE_CHUNK_RADIUS && sent < 6; r++) for (let dy = -r; dy <= r && sent < 6; dy++) for (let dx = -r; dx <= r && sent < 6; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = pcx + dx, cy = pcy + dy; if (cx < 0 || cy < 0 || cx >= CHUNKS || cy >= CHUNKS) continue;
        const k = chunkKey(cx, cy); if (p.sentChunks.has(k)) continue;
        const c = this.world.ensure(cx, cy); sendBin(p, encodeChunk(c)); p.sentChunks.add(k); sent++;
        if (!p.welcomedChunks) p.welcomedChunks = 0; p.welcomedChunks++;
      }
      for (const k of p.sentChunks) { const cx = k % CHUNKS, cy = (k / CHUNKS) | 0; if (Math.abs(cx - pcx) > ACTIVE_CHUNK_RADIUS + 2 || Math.abs(cy - pcy) > ACTIVE_CHUNK_RADIUS + 2) p.sentChunks.delete(k); }
      if (tileList.length) {
        const mine = [];
        for (let i = 0; i < tileList.length; i += 4) if (p.sentChunks.has(chunkKey((tileList[i] / CHUNK) | 0, (tileList[i + 1] / CHUNK) | 0))) mine.push(tileList[i], tileList[i + 1], tileList[i + 2], tileList[i + 3]);
        if (mine.length) p.send({ t: 'tiles', l: mine });
      }
      const me = {
        x: p.x, y: p.y, ack: p.lastSeq, hp: +p.hp.toFixed(1), hu: +p.hunger.toFixed(1), st: +p.stamina.toFixed(1), in: +p.infection.toFixed(1),
        ms: this.maxStamina(p), dT: +p.dodgeT.toFixed(3), dX: p.dodgeX, dY: p.dodgeY, kx: +p.kx.toFixed(3), ky: +p.ky.toFixed(3), vx: +(p.mvx || 0).toFixed(3), vy: +(p.mvy || 0).toFixed(3),
        rl: p.reloadT > 0 ? +(1 - p.reloadT / p.reloadTotal).toFixed(2) : 0, vac: p.vaccine, rot: this.world.rot.isRot(Math.floor(p.x), Math.floor(p.y)) ? 1 : 0,
        rv: p.reviveT > 0 ? +(p.reviveT / (4 * (1 - 0.25 * this.sk(p, 'socorrista')))).toFixed(2) : 0, oc: p.openChest,
      };
      const myFx = fx.filter(f => { const fx0 = f.x ?? f.x1; if (fx0 == null) return true; return Math.hypot(fx0 - p.x, (f.y ?? f.y1) - p.y) < 45; });
      p.send({ t: 's', tk: this.tick, time, pl: players, me, fx: myFx.length ? myFx : undefined });
      if (p.invDirty) {
        p.invDirty = false;
        p.send({ t: 'inv', inv: p.inv.slice(0, p.invSize), size: p.invSize, armor: p.armor, sel: p.sel, xp: p.xp, lvl: p.level, need: xpForLevel(p.level), sp: p.sp, skills: p.skills, bed: p.bed, bp: p.backpack ? (this.drops.get(p.backpack) ? { x: this.drops.get(p.backpack).x, y: this.drops.get(p.backpack).y } : null) : null });
      }
      if (sendEnts) sendBin(p, this.encodeEntities(p));
    }
    if (this.dropsDirty) {
      this.dropsDirty = false;
      const l = [...this.drops.values()].map(d => ({ id: d.id, x: +d.x.toFixed(2), y: +d.y.toFixed(2), it: d.item ? d.item.id : null, n: d.item ? d.item.n : 0, bp: d.bp || null }));
      this.broadcast({ t: 'drops', l });
    }
    if (this.questsDirty && this.tick % 5 === 0) { this.questsDirty = false; this.broadcast(this.questState()); }
    if (this.achDirty && this.tick % 20 === 0) { this.achDirty = false; this.broadcast(this.achState()); }
    if (this.rotDirty) { this.rotDirty = false; this.broadcast({ t: 'rot', rot: this.world.rot.state() }); }
  }
  encodeEntities(p) {
    const list = [];
    for (const e of this.entities.values()) if (Math.abs(e.x - p.x) < 40 && Math.abs(e.y - p.y) < 30) list.push(e);
    const pr = this.projs.filter(e => Math.abs(e.x - p.x) < 40 && Math.abs(e.y - p.y) < 30);
    const fi = this.fires.filter(e => Math.abs(e.x - p.x) < 40 && Math.abs(e.y - p.y) < 30);
    const n = list.length + pr.length + fi.length;
    const buf = new ArrayBuffer(8 + n * 16); const dv = new DataView(buf);
    dv.setUint8(0, 1); dv.setUint16(2, n, true); dv.setUint32(4, this.tick, true);
    let o = 8;
    const put = (id, kind, x, y, hp, flags, a) => {
      dv.setUint32(o, id, true); dv.setUint8(o + 4, kind); dv.setFloat32(o + 5, x, true); dv.setFloat32(o + 9, y, true);
      dv.setUint8(o + 13, hp); dv.setUint8(o + 14, flags); dv.setUint8(o + 15, Math.round(((a || 0) + Math.PI) / (2 * Math.PI) * 255) & 255); o += 16;
    };
    for (const e of list) {
      const kind = e.kind === 'z' ? e.def.id : e.def.id;
      const flags = (e.flash > 0 ? 1 : 0) | (e.stun > 0 ? 2 : 0) | (e.elite ? 4 : 0) | (e.atk ? 8 : 0) | (e.burn || e.burnT > 0 ? 16 : 0) | (e.rage ? 32 : 0);
      if (e.burnT > 0) e.burnT -= 0.1;
      put(e.id, kind, e.x, e.y, Math.max(0, Math.min(255, Math.round(e.hp / e.maxHp * 255))), flags, e.a);
    }
    for (const e of pr) put(e.id, e.k, e.x, e.y, 255, 0, Math.atan2(e.vy, e.vx));
    for (const e of fi) put(e.id, PROJ.fogo, e.x, e.y, Math.round(e.t / 5 * 255), 0, 0);
    return buf;
  }
  welcome(p) {
    return {
      t: 'welcome', id: p.id, seed: this.world.seed, name: this.opts.name, ver: VERSION, time: this.timeInfo(), rot: this.world.rot.state(),
      spawn: this.spawn, rec: [...this.unlocked], ff: this.opts.friendlyFire, hc: this.opts.hardcore, pw: [...this.powered].filter(k => this.holofotes.has(k)),
    };
  }

  // ======================= Gravação =======================
  save() {
    if (!this.opts.savePath) return;
    for (const p of this.players.values()) this.savePlayer(p);
    const chunks = {};
    for (const [k, c] of this.world.chunks) if (c.modified) chunks[k] = { t: Buffer.from(c.t).toString('base64'), o: Buffer.from(c.o).toString('base64'), h: Buffer.from(c.h.buffer, c.h.byteOffset, c.h.byteLength).toString('base64') };
    for (const [k, s] of this.world.saved) chunks[k] = { t: Buffer.from(s.t).toString('base64'), o: Buffer.from(s.o).toString('base64'), h: Buffer.from(s.h.buffer, s.h.byteOffset, s.h.byteLength).toString('base64') };
    const data = {
      version: VERSION, name: this.opts.name, seed: this.world.seed, clock: this.clock, night: this.night, nextId: this.nextId,
      rot: this.world.rot.state(), victory: this.victory, unlocked: [...this.unlocked], quests: { stats: this.stats, main: this.qMain, daily: this.daily, ach: this.ach }, players: this.savedPlayers, meta: Object.fromEntries(this.meta), regrow: this.regrow.map(r => ({ ...r, t: r.t - this.tick })),
      drops: [...this.drops.values()].filter(d => d.bp), options: { friendlyFire: this.opts.friendlyFire, hardcore: this.opts.hardcore, password: this.opts.password },
      savedAt: new Date().toISOString(), chunks,
    };
    try {
      fs.mkdirSync(path.dirname(this.opts.savePath), { recursive: true });
      const tmp = this.opts.savePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, this.opts.savePath);
      this.log('Mundo gravado: ' + this.opts.savePath);
    } catch (e) { this.log('Erro a gravar: ' + e.message); }
  }
  load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.opts.savePath, 'utf8'));
      this.world = new ServerWorld(d.seed); this.spawn = this.world.gen.findSpawn();
      this.opts.seed = d.seed; this.opts.name = d.name || this.opts.name;
      if (d.options) Object.assign(this.opts, { friendlyFire: d.options.friendlyFire, hardcore: d.options.hardcore });
      this.clock = d.clock; this.night = d.night; this.nextId = d.nextId || 1; this.victory = !!d.victory;
      this.lastPhase = phaseAt(this.clock).k;
      if (this.lastPhase === 'noite') this.nightPlan = { total: 0, spawned: 0, acc: 0, blood: this.night % 7 === 0 };
      this.world.rot.load(d.rot);
      this.savedPlayers = d.players || {};
      if (d.quests) { this.stats = d.quests.stats || {}; this.qMain = d.quests.main || 0; this.daily = d.quests.daily || []; this.ach = d.quests.ach || {}; }
      // mundos antigos (antes dos livros) ficam com tudo aprendido
      if (Array.isArray(d.unlocked)) this.unlocked = new Set(d.unlocked);
      else for (const st of Object.keys(BOOK_FOR)) for (const r of learnable(this.recipes, st)) this.unlocked.add(r.id);
      for (const [k, c] of Object.entries(d.chunks || {})) {
        const h = Buffer.from(c.h, 'base64');
        this.world.saved.set(+k, { t: new Uint8Array(Buffer.from(c.t, 'base64')), o: new Uint8Array(Buffer.from(c.o, 'base64')), h: new Uint16Array(h.buffer.slice(h.byteOffset, h.byteOffset + h.byteLength)) });
      }
      this.meta = new Map(Object.entries(d.meta || {}));
      // reconstruir índices de blocos especiais
      for (const [k, s] of this.world.saved) {
        const cx = k % CHUNKS, cy = (k / CHUNKS) | 0;
        for (let i = 0; i < CHUNK * CHUNK; i++) {
          const o = s.o[i]; if (!o) continue; const def = OBJECTS[o];
          const x = cx * CHUNK + (i % CHUNK), y = cy * CHUNK + ((i / CHUNK) | 0); const kk = key(x, y);
          if (def.built) this.built.add(kk); if (def.light) this.lights.add(kk); if (def.turret) this.turrets.add(kk);
          if (def.generator) this.generators.add(kk); if (def.purifier) this.purifiers.add(kk); if (o === O.HOLOFOTE) this.holofotes.add(kk);
          if (s.h[i] < def.hp) this.damaged.set(kk, -1e9); // recupera depois de carregar
        }
      }
      this.regrow = (d.regrow || []).map(r => ({ ...r, t: Math.max(0, r.t) }));
      for (const dr of d.drops || []) this.drops.set(dr.id, { ...dr, born: 0 });
      this.updatePurifiers();
      this.log(`Mundo carregado: ${this.opts.name} (noite ${this.night})`);
    } catch (e) { this.log('Não foi possível carregar o mundo: ' + e.message); }
  }
}

const HANDS = { name: 'Mãos', dmg: 5, cd: 0.45, range: 1.3, arc: 90, kb: 3 };

export function encodeChunk(c) {
  const buf = new ArrayBuffer(8 + 1024 + 1024 + 2048);
  const dv = new DataView(buf);
  dv.setUint8(0, 2); dv.setUint16(2, c.cx, true); dv.setUint16(4, c.cy, true);
  new Uint8Array(buf, 8, 1024).set(c.t);
  new Uint8Array(buf, 8 + 1024, 1024).set(c.o);
  new Uint16Array(buf, 8 + 2048, 1024).set(c.h);
  return buf;
}
