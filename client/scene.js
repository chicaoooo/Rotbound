// Cena do Phaser: desenha o estado (mundo, entidades, efeitos) e recolhe os inputs.
// O Phaser só desenha; a simulação corre no anfitrião (com previsão local do próprio movimento).
import { TILE, CHUNK, CHUNKS, DT, OBJECTS, TERRAIN, O, T, ZT, ZT_BY_ID, ANIMAL_BY_ID, PROJ, PLAYER, PLAYER_COLORS, darknessAt, hash2 } from '../shared/constants.js';
import { stepPlayer } from '../shared/world.js';
import * as audio from './audio.js';

const ROT_TERRAIN = new Set([T.RELVA, T.FLORESTA, T.ERVA_SECA, T.LAMA, T.AREIA, T.AGUA, T.AGUA_FUNDA, T.ROCHA_CHAO]);
const OBJ_PARTICLE = { [O.ARVORE]: 0x6a4a2a, [O.ARVORE_MORTA]: 0x4a3a33, [O.ROCHA]: 0x8a8a8e, [O.CARVAO]: 0x2a2a2e, [O.FERRO]: 0xb07040, [O.ENXOFRE]: 0xd8c030, [O.CRISTAL]: 0x9ad848, [O.PAREDE_PEDRA]: 0x9a9aa0, [O.PAREDE_METAL]: 0x8a949c, [O.CARRO]: 0x8a4a3a, [O.PAREDE_BETAO]: 0x8a887e, [O.SACOS]: 0xb8a678, [O.TENDA]: 0x5f6a3a, [O.CERCA]: 0x8a5a30, [O.MESA]: 0x8a5a30 };

export function snapZoom(z) { return Math.max(0.5, Math.min(3, Math.round(z * TILE) / TILE)); }

export function makeScene(G) {
  return class GameScene extends Phaser.Scene {
    constructor() { super('game'); }
    create() {
      const art = G.art;
      this.textures.addCanvas('atlas', art.atlas);
      const tex = this.textures.get('atlas');
      for (const [n, f] of Object.entries(art.frames)) tex.add(n, 0, f.x, f.y, f.w, f.h);
      this.ground = this.add.blitter(0, 0, 'atlas').setDepth(0);
      this.decalG = this.add.graphics().setDepth(1);
      this.objs = this.add.blitter(0, 0, 'atlas').setDepth(2);
      this.buildG = this.add.graphics().setDepth(2.5);
      this.ghost = this.add.image(0, 0, 'atlas', 'o30').setAlpha(0.5).setDepth(2.6).setVisible(false);
      this.fxG = this.add.graphics().setDepth(6);
      this.topG = this.add.graphics().setDepth(7);
      this.dropPool = []; this.entImgs = new Map(); this.plObjs = new Map(); this.texts = [];
      this.particles = []; this.tracers = []; this.swings = []; this.decals = []; this.floats = []; this.flashes = [];
      this.cam = this.cameras.main; this.cam.setRoundPixels(true); this.cam.setBackgroundColor('#000');
      this.applyZoom();
      this.camX = G.me.x; this.camY = G.me.y;
      this.acc = 0; this.lightScan = 0; this.lights = [];
      this.input.mouse.disableContextMenu();
      this.input.on('pointerdown', (p) => this.onPointer(p, true));
      this.input.on('pointerup', (p) => this.onPointer(p, false));
      this.input.on('wheel', (p, over, dx, dy) => {
        if (p.event && p.event.ctrlKey) { G.setZoom(G.zoom * (dy > 0 ? 1 / 1.12 : 1.12)); return; } // Ctrl + roda: zoom
        if (G.hud.blocking) return; G.selectSlot((G.inv?.sel ?? 0) + (dy > 0 ? 1 : -1));
      });
      this.hitAnims = new Map(); this.animPool = [];
      this.scale.on('resize', () => this.applyZoom());
      G.scene = this;
    }
    // zoom "ajustado" para cada bloco ocupar um número inteiro de píxeis no ecrã (sem riscas entre blocos)
    applyZoom() { G.zoom = snapZoom(G.zoom); this.cam.setZoom(G.zoom); }

    // ---------------- entradas ----------------
    onPointer(p, down) {
      if (G.hud.blocking && down) return;
      audio.unlock();
      const btn = p.button;
      if (btn === 0) {
        G.mouseL = down;
        if (down) G.clickLatch = true; // garante que um clique rápido chega ao anfitrião
        if (down && G.build) { this.placeAtCursor(); this.lastPlace = this.cursorTile(); }
      }
      if (btn === 2) {
        G.mouseR = down;
        if (down) {
          if (G.build) G.net.send({ t: 'collect', ...this.cursorTile() });
          else { const it = G.held(); if (it && G.items[it.id].kind === 'place') { this.placeAtCursor(); this.lastPlace = this.cursorTile(); } }
        }
      }
      if (btn === 1 && down) { const w = this.mouseWorld(); G.net.send({ t: 'ping', x: w.x, y: w.y }); }
    }
    cursorTile() { const w = this.mouseWorld(); return { x: Math.floor(w.x), y: Math.floor(w.y) }; }
    placeAtCursor() { const c = this.cursorTile(); G.net.send({ t: 'place', x: c.x, y: c.y }); }
    mouseWorld() { const p = this.input.activePointer; const w = this.cam.getWorldPoint(p.x, p.y); return { x: w.x / TILE, y: w.y / TILE }; }

    sendInput() {
      const k = G.keys; const blocked = G.hud.typing || G.paused;
      let mx = 0, my = 0;
      if (!blocked) { if (k.has('KeyW') || k.has('ArrowUp')) my -= 1; if (k.has('KeyS') || k.has('ArrowDown')) my += 1; if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1; if (k.has('KeyD') || k.has('ArrowRight')) mx += 1; }
      const w = this.mouseWorld();
      const inp = {
        t: 'i', s: ++G.seq, mx, my, run: !blocked && (k.has('ShiftLeft') || k.has('ShiftRight')), dodge: G.dodgeReq && !blocked,
        a: +G.aim.toFixed(3), fire: !!((G.mouseL || G.clickLatch) && !G.build && !G.hud.blocking), ax: +w.x.toFixed(2), ay: +w.y.toFixed(2),
      };
      G.dodgeReq = false; G.clickLatch = false;
      G.net.send(inp);
      const p = G.pred; this.prevX = p.x; this.prevY = p.y;
      if (!G.dead) { stepPlayer(p, inp, G.world, DT); if (G.pending.length < 120) G.pending.push(inp); }
      // construção contínua ao arrastar
      if (G.build && G.mouseL && !G.hud.blocking) { const c = this.cursorTile(); if (!this.lastPlace || c.x !== this.lastPlace.x || c.y !== this.lastPlace.y) { this.placeAtCursor(); this.lastPlace = c; } }
    }

    // ---------------- ciclo ----------------
    update(time, delta) {
      const dt = Math.min(0.1, delta / 1000);
      G.clock += dt;
      // aim
      const mw = this.mouseWorld();
      const me = G.me;
      G.aim = Math.atan2(mw.y - me.y, mw.x - me.x);
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 4) { this.sendInput(); this.acc -= DT; n++; }
      if (this.acc > DT) this.acc = 0;
      const a = this.acc / DT;
      const decay = Math.exp(-dt * 10); G.offX *= decay; G.offY *= decay;
      if (this.prevX == null) { this.prevX = G.pred.x; this.prevY = G.pred.y; }
      me.x = this.prevX + (G.pred.x - this.prevX) * a + G.offX;
      me.y = this.prevY + (G.pred.y - this.prevY) * a + G.offY;
      // câmara com ligeira inclinação para o rato
      // câmara presa ao jogador + inclinação suave para o rato (calculada no ecrã, sem realimentação)
      const ptr = this.input.activePointer, zz = this.cam.zoom;
      let lx = (ptr.x - this.scale.width / 2) / (TILE * zz) * 0.2, ly = (ptr.y - this.scale.height / 2) / (TILE * zz) * 0.2;
      const ll = Math.hypot(lx, ly); if (ll > 3) { lx *= 3 / ll; ly *= 3 / ll; }
      if (G.hud.blocking) { lx = 0; ly = 0; }
      const k = 1 - Math.exp(-dt * 6);
      this.leanX = (this.leanX || 0) + (lx - (this.leanX || 0)) * k; this.leanY = (this.leanY || 0) + (ly - (this.leanY || 0)) * k;
      this.camX = me.x + this.leanX; this.camY = me.y + this.leanY;
      // câmara alinhada ao píxel do ecrã
      const z = this.cam.zoom;
      this.cam.centerOn(Math.round(this.camX * TILE * z) / z, Math.round(this.camY * TILE * z) / z);
      this.drawWorld(time);
      this.drawDrops();
      this.drawEntities(time);
      this.drawPlayers(time, dt);
      this.drawFx(dt);
      this.drawBuild();
      this.drawLights(dt);
      G.hud.update(dt);
    }

    isRot(x, y) {
      const ck = ((x / CHUNK) | 0) + ((y / CHUNK) | 0) * CHUNKS;
      let c = G.rotCache.get(ck);
      if (!c) { c = new Uint8Array(CHUNK * CHUNK); const x0 = ((x / CHUNK) | 0) * CHUNK, y0 = ((y / CHUNK) | 0) * CHUNK; for (let i = 0; i < CHUNK * CHUNK; i++) c[i] = G.world.rot.isRot(x0 + (i % CHUNK), y0 + ((i / CHUNK) | 0)) ? 1 : 0; G.rotCache.set(ck, c); }
      return c[(y % CHUNK) * CHUNK + (x % CHUNK)] === 1;
    }

    drawWorld(time) {
      const v = this.cam.worldView;
      const tx0 = Math.floor(v.x / TILE) - 1, ty0 = Math.floor(v.y / TILE) - 1, tx1 = Math.ceil((v.x + v.width) / TILE) + 1, ty1 = Math.ceil((v.y + v.height) / TILE) + 1;
      this.ground.clear(); this.objs.clear();
      const w = G.world; const wave = Math.floor(time / 700);
      const cracks = []; const animObjs = [];
      for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
        const c = w.chunkAt(x, y); if (!c) continue;
        const i = (y % CHUNK) * CHUNK + (x % CHUNK);
        const t = c.t[i];
        let vv = (hash2(x, y, 11) * 4) | 0;
        if (t === T.AGUA || t === T.AGUA_FUNDA) vv = (vv + wave) & 3;
        const rot = ROT_TERRAIN.has(t) && this.isRot(x, y);
        this.ground.create(x * TILE, y * TILE, (rot ? 'r' : 't') + t + '_' + vv);
        const o = c.o[i];
        if (o) {
          let f = 'o' + o;
          if (o === O.ARVORE) { if (rot) f = 'o' + O.ARVORE_MORTA; else { const tv = (hash2(x, y, 3) * 3) | 0; if (tv) f += '_' + tv; } }
          const hk = x + ',' + y; const ht = this.hitAnims.get(hk);
          if (ht != null) animObjs.push([x, y, f, ht]); else this.objs.create(x * TILE, y * TILE, f);
          const def = OBJECTS[o];
          if (def.hp > 30 && c.h[i] < def.hp * 0.85 && (def.built || def.solid)) cracks.push(x, y, c.h[i] / def.hp);
        }
      }
      this.drawHitAnims(animObjs);
      for (let k = 0; k < cracks.length; k += 3) { const f = cracks[k + 2]; this.objs.create(cracks[k] * TILE, cracks[k + 1] * TILE, f < 0.3 ? 'crack3' : f < 0.6 ? 'crack2' : 'crack1'); }
      // manchas de sangue no chão
      const g = this.decalG; g.clear();
      const now = performance.now();
      this.decals = this.decals.filter(d => now - d.t < 40000);
      for (const d of this.decals) { const al = Math.min(0.55, (40000 - (now - d.t)) / 40000); g.fillStyle(d.c, al); g.fillCircle(d.x * TILE, d.y * TILE, d.r); g.fillCircle(d.x * TILE + d.r * 0.7, d.y * TILE + d.r * 0.3, d.r * 0.6); }
      // ciclo das luzes (a 10 Hz)
      if (time - this.lightScan > 100) { this.lightScan = time; this.scanLights(tx0, ty0, tx1, ty1); }
    }
    // animação ao bater num objeto: abana, achata e pisca
    drawHitAnims(list) {
      const now = performance.now(); const DUR = 240;
      let i = 0;
      for (const [x, y, f, t0] of list) {
        const age = now - t0; if (age > DUR) { this.hitAnims.delete(x + ',' + y); this.objs.create(x * TILE, y * TILE, f); continue; }
        const t = age / DUR, k = 1 - t;
        let img = this.animPool[i]; if (!img) { img = this.add.image(0, 0, 'atlas', f).setDepth(2.05).setOrigin(0.5, 0.95); this.animPool[i] = img; }
        img.setVisible(true).setFrame(f)
          .setPosition(x * TILE + 16 + Math.sin(t * 38) * 2.5 * k, y * TILE + 30)
          .setScale(1 + 0.12 * Math.sin(t * Math.PI) * k, 1 - 0.1 * Math.sin(t * Math.PI) * k)
          .setRotation(Math.sin(t * 26) * 0.09 * k);
        if (age < 60) img.setTintFill(0xffffff); else img.clearTint();
        i++;
      }
      for (; i < this.animPool.length; i++) this.animPool[i].setVisible(false);
    }
    scanLights(tx0, ty0, tx1, ty1) {
      const L = []; const w = G.world; const m = 14;
      for (let y = ty0 - m; y <= ty1 + m; y++) for (let x = tx0 - m; x <= tx1 + m; x++) {
        const o = w.getO(x, y); if (!o) continue; const def = OBJECTS[o]; if (!def.light) continue;
        if (def.powered && !G.powered.has(x + ',' + y)) continue;
        L.push({ x: x + 0.5, y: y + 0.5, r: def.light, c: def.lightColor, flick: o === O.TOCHA || o === O.FOGUEIRA });
      }
      this.lights = L;
    }
    drawDrops() {
      const list = G.drops; let i = 0;
      const v = this.cam.worldView; const bob = Math.sin(performance.now() / 300) * 2;
      for (const d of list) {
        if (d.x * TILE < v.x - 40 || d.x * TILE > v.right + 40 || d.y * TILE < v.y - 40 || d.y * TILE > v.bottom + 40) continue;
        let img = this.dropPool[i]; if (!img) { img = this.add.image(0, 0, 'atlas', 'backpack').setDepth(3); this.dropPool[i] = img; }
        img.setVisible(true).setFrame(d.bp ? 'backpack' : 'i_' + d.it).setScale(d.bp ? 0.8 : 0.6).setPosition(d.x * TILE, d.y * TILE + bob);
        i++;
      }
      for (; i < this.dropPool.length; i++) this.dropPool[i].setVisible(false);
    }
    interpEntities() {
      const S = G.entSnaps; if (!S.length) return [];
      const rt = performance.now() - 140;
      let s0 = S[0], s1 = S[0];
      for (let i = 0; i < S.length; i++) { if (S[i].t <= rt) s0 = S[i]; if (S[i].t >= rt) { s1 = S[i]; break; } s1 = S[i]; }
      const span = s1.t - s0.t; const a = span > 0 ? Math.max(0, Math.min(1, (rt - s0.t) / span)) : 1;
      const out = [];
      for (const [id, e1] of s1.m) {
        const e0 = s0.m.get(id);
        if (e0) out.push({ ...e1, x: e0.x + (e1.x - e0.x) * a, y: e0.y + (e1.y - e0.y) * a });
        else out.push(e1);
      }
      return out;
    }
    drawEntities(time) {
      const ents = this.interpEntities();
      const seen = new Set();
      const g = this.fxG;
      for (const e of ents) {
        seen.add(e.id);
        let img = this.entImgs.get(e.id);
        let frame, scale = 1;
        if (e.k < 20) frame = 'z_' + ZT_BY_ID[e.k];
        else if (e.k < 40) frame = 'a_' + ANIMAL_BY_ID[e.k];
        else if (e.k === PROJ.acido) frame = 'acid';
        else if (e.k === PROJ.molotov) { frame = 'i_molotov'; scale = 0.7; }
        else if (e.k === PROJ.fogo) frame = null;
        if (e.k === PROJ.fogo) {
          if (Math.random() < 0.9) for (let i = 0; i < 2; i++) this.particles.push({ x: e.x + (Math.random() - 0.5) * 3, y: e.y + (Math.random() - 0.5) * 3, vx: 0, vy: -1.5 - Math.random(), life: 0.5, max: 0.5, c: Math.random() < 0.5 ? 0xff7020 : 0xffc040, s: 3 });
          continue;
        }
        if (!img) { img = this.add.image(0, 0, 'atlas', frame).setDepth(4); this.entImgs.set(e.id, img); }
        img.setFrame(frame).setPosition(e.x * TILE, e.y * TILE).setScale(scale);
        if (e.k < 40) img.setRotation(e.a);
        else img.setRotation(e.k === PROJ.molotov ? time / 80 : 0);
        if (e.f & 1) img.setTintFill(0xffffff);
        else if (e.f & 16) img.setTint(0xffa060);
        else if (e.f & 4) img.setTint(0x90ff90);
        else if (e.f & 32) img.setTint(0xff7090);
        else img.clearTint();
        if (e.f & 8) img.setScale(scale * (1 + 0.06 * Math.sin(time / 40)));
        // elites brilham
        if (e.f & 4) { g.fillStyle(0x60ff60, 0.12); g.fillCircle(e.x * TILE, e.y * TILE, 20); }
        if (e.f & 16 && Math.random() < 0.4) this.particles.push({ x: e.x, y: e.y, vx: 0, vy: -2, life: 0.4, max: 0.4, c: 0xff8020, s: 3 });
        // barra de vida
        if (e.k < 40 && (e.hp < 255 || e.k === ZT.brutamontes.id || e.k === ZT.rei.id)) {
          const big = e.k === ZT.rei.id; const w = big ? 70 : 26; const yy = e.y * TILE - (big ? 44 : 22);
          g.fillStyle(0x000000, 0.6); g.fillRect(e.x * TILE - w / 2, yy, w, big ? 6 : 3);
          g.fillStyle(e.k < 20 ? (big ? 0x8ad040 : 0xd04040) : 0xd0a040, 0.9); g.fillRect(e.x * TILE - w / 2, yy, w * e.hp / 255, big ? 6 : 3);
        }
      }
      for (const [id, img] of this.entImgs) if (!seen.has(id)) { img.destroy(); this.entImgs.delete(id); }
    }
    interpPlayers() {
      const S = G.plSnaps; if (!S.length) return new Map();
      const rt = performance.now() - 100;
      let s0 = S[0], s1 = S[0];
      for (let i = 0; i < S.length; i++) { if (S[i].t <= rt) s0 = S[i]; if (S[i].t >= rt) { s1 = S[i]; break; } s1 = S[i]; }
      const span = s1.t - s0.t; const a = span > 0 ? Math.max(0, Math.min(1, (rt - s0.t) / span)) : 1;
      const m = new Map();
      for (const p1 of s1.pl) { const p0 = s0.pl.find(q => q.id === p1.id); m.set(p1.id, p0 ? { ...p1, x: p0.x + (p1.x - p0.x) * a, y: p0.y + (p1.y - p0.y) * a } : p1); }
      return m;
    }
    drawPlayers(time, dt) {
      const ps = this.interpPlayers();
      const seen = new Set();
      for (const p of G.players) {
        seen.add(p.id);
        const mine = p.id === G.myId;
        const ip = mine ? { ...p, x: G.me.x, y: G.me.y, a: G.aim } : (ps.get(p.id) || p);
        let o = this.plObjs.get(p.id);
        if (!o) {
          o = {
            body: this.add.image(0, 0, 'atlas', 'p0').setDepth(5), held: this.add.image(0, 0, 'atlas', 'i_lanca').setDepth(5.1).setScale(0.75),
            name: this.add.text(0, 0, p.n, { fontFamily: 'monospace', fontSize: '11px', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(7.5),
            tag: this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ff6060', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(7.5),
            bubble: this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '13px', color: '#111', backgroundColor: '#fff', padding: { x: 5, y: 2 } }).setOrigin(0.5, 1).setDepth(7.6).setVisible(false),
            swing: 0, swingA: 0, swingArc: 0,
          };
          this.plObjs.set(p.id, o);
        }
        const px = ip.x * TILE, py = ip.y * TILE;
        const dead = p.f & 2, down = p.f & 1, lying = p.f & 4, dodge = p.f & 8;
        o.body.setVisible(!dead).setPosition(px, py);
        if (down || lying) o.body.setFrame(down ? 'p_down' : 'p' + p.c).setRotation(lying ? -Math.PI / 2 : 0);
        else o.body.setFrame('p' + p.c).setRotation(ip.a);
        o.body.setAlpha(dodge ? 0.6 : 1);
        if (p.f & 32) o.body.setTint(0xffd0a0); else o.body.clearTint();
        // item na mão (com animação de golpe)
        if (p.it && !dead && !down && !lying) {
          let ha = ip.a;
          if (o.swing > 0) { o.swing -= dt; const f = 1 - Math.max(0, o.swing) / 0.14; ha = o.swingA - o.swingArc / 2 + o.swingArc * f; }
          const kind = G.items[p.it]?.kind;
          const dist = kind === 'ranged' || kind === 'melee' ? 14 : 12;
          o.held.setVisible(true).setFrame('i_' + p.it).setPosition(px + Math.cos(ha + 0.5) * dist, py + Math.sin(ha + 0.5) * dist).setRotation(ha + (kind === 'melee' ? Math.PI / 4 : 0));
          o.held.setFlipY(Math.cos(ha) < 0 && kind === 'ranged');
        } else o.held.setVisible(false);
        o.name.setVisible(!mine && !dead).setPosition(px, py - 18).setText(p.n).setColor('#' + PLAYER_COLORS[p.c].toString(16).padStart(6, '0'));
        let tag = '';
        if (down) tag = `CAÍDO ${p.dt}s` + (p.rv ? ` · ${Math.round(p.rv / 4 * 100)}%` : '');
        else if (lying) tag = 'zzz';
        o.tag.setVisible(!!tag).setText(tag).setPosition(px, py - (mine ? 18 : 30));
        if (o.bubbleT > 0) { o.bubbleT -= dt; o.bubble.setVisible(true).setPosition(px, py - 34); } else o.bubble.setVisible(false);
      }
      for (const [id, o] of this.plObjs) if (!seen.has(id)) { o.body.destroy(); o.held.destroy(); o.name.destroy(); o.tag.destroy(); o.bubble.destroy(); this.plObjs.delete(id); }
    }
    bubble(id, text) { const o = this.plObjs.get(id); if (o) { o.bubble.setText(text); o.bubbleT = 3; } }

    // ---------------- efeitos ----------------
    fx(list) {
      const me = G.me;
      for (const f of list) {
        const x = f.x ?? f.x1, y = f.y ?? f.y1;
        const dist = x != null ? Math.hypot(x - me.x, y - me.y) : 0;
        const vol = Math.max(0, 1 - dist / 40), pan = x != null ? Math.max(-1, Math.min(1, (x - me.x) / 20)) : 0;
        switch (f.k) {
          case 'snd': audio.play(f.s, vol, pan); if (f.shake) this.cam.shake(90, f.shake * vol); if (f.s.startsWith('shot_')) this.flashes.push({ x, y, t: 0.06 }); break;
          case 'swing': { const o = this.plObjs.get(f.id); if (o) { o.swing = 0.14; o.swingA = f.a; o.swingArc = Math.min(2.4, f.arc * Math.PI / 180); } this.swings.push({ id: f.id, x: f.x, y: f.y, a: f.a, r: f.r, arc: f.arc * Math.PI / 180, life: 0.1 }); audio.play('swing', vol, pan); break; }
          case 'hit': {
            for (let i = 0; i < (f.crit ? 14 : 8); i++) { const a = Math.random() * 6.28, s = 2 + Math.random() * 5; this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, max: 0.4, c: f.blood === 2 ? 0xa02020 : f.pl ? 0xc02020 : 0x6a1a1a, s: 3 }); }
            if (Math.random() < 0.5) this.decals.push({ x: x + (Math.random() - 0.5) * 0.5, y: y + (Math.random() - 0.5) * 0.5, r: 4 + Math.random() * 6, c: f.blood === 2 ? 0x701515 : 0x4a1010, t: performance.now() });
            if (this.decals.length > 220) this.decals.shift();
            if (!f.pl) this.floatText(x, y - 0.3, (f.crit ? '✦' : '') + f.dmg, f.crit ? '#ffe040' : '#ffffff');
            audio.play(f.crit ? 'crit' : 'hit', vol, pan); break;
          }
          case 'die': audio.play('die', vol, pan); for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, s = 1 + Math.random() * 4; this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, max: 0.6, c: 0x3a4a2a, s: 4 }); } this.decals.push({ x, y, r: 11, c: 0x3a1010, t: performance.now() }); break;
          case 'chip': { this.hitAnims.set(Math.floor(x) + ',' + Math.floor(y), performance.now()); const c = OBJ_PARTICLE[f.o] || 0x6a5a40; for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28; this.particles.push({ x, y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 0.3, max: 0.3, c, s: 2 }); } audio.play('chip', vol, pan); break; }
          case 'break': { const c = OBJ_PARTICLE[f.o] || 0x7a6a50; for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, s = 1 + Math.random() * 5; this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, max: 0.6, c, s: 3 }); } audio.play('break', vol, pan); break; }
          case 'tracer': this.tracers.push({ ...f, life: 0.07, c: 0xfff0a0 }); this.flashes.push({ x: f.x1, y: f.y1, t: 0.05 }); break;
          case 'arrow': this.tracers.push({ ...f, life: 0.12, c: 0xc0a070 }); audio.play('shot_arco', vol, pan); break;
          case 'boom': {
            for (let i = 0; i < (f.fire ? 25 : 50); i++) { const a = Math.random() * 6.28, s = 2 + Math.random() * 9; this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7, max: 0.7, c: [0xff9020, 0xffd040, 0x606060, 0xff5010][i % 4], s: 4 }); }
            if (!f.fire) { this.cam.shake(300, 0.02 * Math.max(0.2, vol)); audio.play('boom', vol, pan); this.decals.push({ x, y, r: 26, c: 0x1a1410, t: performance.now() }); }
            this.flashes.push({ x, y, t: 0.15, r: 7 }); break;
          }
          case 'acid': for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28; this.particles.push({ x, y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 0.5, max: 0.5, c: 0xa0e040, s: 3 }); } audio.play('acid', vol, pan); break;
          case 'hurt': G.hud.hurtFlash(f.a); this.cam.shake(120, 0.006 + f.a * 0.01); audio.play('hurt'); break;
        }
      }
    }
    floatText(x, y, text, color) {
      let t = this.texts.find(t => !t.visible);
      if (!t) { t = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(7.4); this.texts.push(t); }
      t.setText(text).setColor(color).setPosition(x * TILE + (Math.random() - 0.5) * 10, y * TILE).setVisible(true).setAlpha(1);
      this.floats.push({ t, life: 0.7 });
    }
    drawFx(dt) {
      const g = this.fxG; g.clear();
      for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; g.fillStyle(p.c, Math.max(0, p.life / p.max)); g.fillRect(p.x * TILE - p.s / 2, p.y * TILE - p.s / 2, p.s, p.s); }
      this.particles = this.particles.filter(p => p.life > 0);
      if (this.particles.length > 1500) this.particles.splice(0, this.particles.length - 1500);
      for (const t of this.tracers) { t.life -= dt; g.lineStyle(2, t.c, Math.max(0, t.life * 12)); g.lineBetween(t.x1 * TILE, t.y1 * TILE, t.x2 * TILE, t.y2 * TILE); }
      this.tracers = this.tracers.filter(t => t.life > 0);
      for (const s of this.swings) {
        s.life -= dt; const o = s.id === G.myId ? G.me : null; const x = (o ? o.x : s.x) * TILE, y = (o ? o.y : s.y) * TILE;
        g.lineStyle(3, 0xffffff, Math.max(0, s.life * 5)); g.beginPath(); g.arc(x, y, s.r * TILE * 0.85, s.a - s.arc / 2, s.a + s.arc / 2); g.strokePath();
      }
      this.swings = this.swings.filter(s => s.life > 0);
      for (const f of this.floats) { f.life -= dt; f.t.y -= 30 * dt; f.t.setAlpha(Math.max(0, f.life / 0.7)); if (f.life <= 0) f.t.setVisible(false); }
      this.floats = this.floats.filter(f => f.life > 0);
      // pings
      const now = performance.now();
      G.pings = G.pings.filter(p => now - p.t < 7000);
      for (const p of G.pings) { const b = Math.sin(now / 150) * 3; g.fillStyle(0xffe040, 0.9); g.fillTriangle(p.x * TILE - 7, p.y * TILE - 20 + b, p.x * TILE + 7, p.y * TILE - 20 + b, p.x * TILE, p.y * TILE - 6 + b); g.lineStyle(2, 0xffe040, 0.6); g.strokeCircle(p.x * TILE, p.y * TILE, 6 + ((now - p.t) / 60) % 14); }
    }
    drawBuild() {
      const g = this.buildG; g.clear();
      const it = G.held(); const d = it && G.items[it.id];
      const show = G.build || (d && d.kind === 'place');
      if (!show || G.hud.blocking) { this.ghost.setVisible(false); return; }
      const c = this.cursorTile(); const me = G.me;
      if (G.build) {
        g.lineStyle(1, 0xffffff, 0.12);
        for (let k = -6; k <= 7; k++) { g.lineBetween((c.x + k) * TILE, (c.y - 6) * TILE, (c.x + k) * TILE, (c.y + 7) * TILE); g.lineBetween((c.x - 6) * TILE, (c.y + k) * TILE, (c.x + 7) * TILE, (c.y + k) * TILE); }
      }
      if (d && d.kind === 'place') {
        const t = G.world.getT(c.x, c.y);
        const ok = !G.world.getO(c.x, c.y) && !TERRAIN[t].solid && t !== T.AGUA && Math.hypot(c.x + 0.5 - me.x, c.y + 0.5 - me.y) <= PLAYER.placeReach;
        this.ghost.setVisible(true).setFrame('o' + d.obj).setPosition(c.x * TILE + 16, c.y * TILE + 16).setTint(ok ? 0x80ff80 : 0xff6060);
        g.lineStyle(2, ok ? 0x40ff40 : 0xff4040, 0.9); g.strokeRect(c.x * TILE, c.y * TILE, TILE, TILE);
      } else {
        this.ghost.setVisible(false);
        const o = G.world.getO(c.x, c.y); const def = OBJECTS[o];
        g.lineStyle(2, def?.built ? 0xffc040 : 0xffffff, 0.6); g.strokeRect(c.x * TILE, c.y * TILE, TILE, TILE);
      }
    }

    // ---------------- luz (camada escura com círculos de luz) ----------------
    drawLights(dt) {
      const cv = G.lightCanvas, ctx = G.lightCtx; const W = cv.width, H = cv.height; const sc = W / this.scale.width;
      ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, W, H);
      let dark = darknessAt(G.clock); if (G.time.fin) dark = 1;
      const z = this.cam.zoom; const v = this.cam.worldView;
      const S = (x, y) => [((x * TILE) - v.x) * z * sc, ((y * TILE) - v.y) * z * sc];
      const R = (r) => r * TILE * z * sc;
      const now = performance.now();
      if (dark > 0.01) {
        ctx.fillStyle = G.time.b ? `rgba(30,2,6,${0.94 * dark})` : `rgba(3,3,10,${0.93 * dark})`;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'destination-out';
        const L = G.art.light, C = G.art.cone;
        const circle = (x, y, r, al = 1) => { const [sx, sy] = S(x, y); const rr = R(r); if (sx + rr < 0 || sy + rr < 0 || sx - rr > W || sy - rr > H) return; ctx.globalAlpha = al; ctx.drawImage(L, sx - rr, sy - rr, rr * 2, rr * 2); };
        for (const l of this.lights) circle(l.x, l.y, l.r * (l.flick ? 1 + Math.sin(now / 90 + l.x) * 0.04 : 1));
        for (const p of G.players) {
          if (p.f & 2) continue;
          const mine = p.id === G.myId; const pos = mine ? G.me : (this.plObjs.get(p.id)?.body ?? p);
          const x = mine ? pos.x : pos.x / TILE, y = mine ? pos.y : pos.y / TILE; const a = mine ? G.aim : p.a;
          circle(x, y, 3.6, 0.95);
          const [sx, sy] = S(x, y); const rr = R(12.5);
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.globalAlpha = 0.95; ctx.drawImage(C, 0, -rr, rr, rr * 2); ctx.restore();
        }
        for (const f of this.flashes) circle(f.x, f.y, f.r || 4, 0.8);
        for (const e of this.entImgs.values()) { /* zombies não emitem luz */ }
        ctx.globalAlpha = 1;
        // cor quente das fontes de luz
        ctx.globalCompositeOperation = 'lighter';
        for (const l of this.lights) {
          const [sx, sy] = S(l.x, l.y); const rr = R(l.r * 0.8); if (sx + rr < 0 || sy + rr < 0 || sx - rr > W || sy - rr > H) continue;
          const c = l.c || 0xffa040; const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr);
          gr.addColorStop(0, `rgba(${c >> 16},${(c >> 8) & 255},${c & 255},${0.22 * dark})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gr; ctx.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
        }
      }
      // crepúsculo: céu vermelho
      if (G.time.ph === 'crepusculo') { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(170,40,20,${0.22 * (1 - Math.abs(dark - 0.5) * 2) + 0.05})`; ctx.fillRect(0, 0, W, H); }
      if (G.meState?.rot) { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(60,90,20,0.12)'; ctx.fillRect(0, 0, W, H); }
      this.flashes = this.flashes.filter(f => (f.t -= dt) > 0);
      // setas nas bordas (companheiros, pings, mochila) numa camada com a resolução total do ecrã → texto nítido
      const oc = G.overCtx, OW = G.overCanvas.width, OH = G.overCanvas.height, os = OW / this.scale.width;
      oc.setTransform(1, 0, 0, 1, 0, 0); oc.clearRect(0, 0, OW, OH);
      const SO = (x, y) => [((x * TILE) - v.x) * z * os, ((y * TILE) - v.y) * z * os];
      const arrow = (x, y, col, label) => {
        let [sx, sy] = SO(x, y); const m = 30 * os;
        if (sx > m && sy > m && sx < OW - m && sy < OH - m) return;
        const cx = OW / 2, cy = OH / 2; const a = Math.atan2(sy - cy, sx - cx);
        const t = Math.min(Math.abs((OW / 2 - m) / Math.cos(a)), Math.abs((OH / 2 - m) / Math.sin(a)));
        sx = Math.round(cx + Math.cos(a) * t); sy = Math.round(cy + Math.sin(a) * t);
        oc.save(); oc.translate(sx, sy); oc.rotate(a); oc.fillStyle = col; oc.beginPath(); oc.moveTo(13 * os, 0); oc.lineTo(-7 * os, -9 * os); oc.lineTo(-7 * os, 9 * os); oc.closePath(); oc.fill(); oc.strokeStyle = '#000'; oc.lineWidth = 2 * os; oc.stroke(); oc.restore();
        oc.font = `bold ${Math.round(12 * os)}px "Segoe UI", system-ui, sans-serif`; oc.textAlign = 'center'; oc.textBaseline = 'middle';
        const lx = Math.round(sx - Math.cos(a) * 30 * os), ly = Math.round(sy - Math.sin(a) * 24 * os);
        oc.lineWidth = 3 * os; oc.strokeStyle = 'rgba(0,0,0,0.85)'; oc.strokeText(label, lx, ly); oc.fillStyle = '#fff'; oc.fillText(label, lx, ly);
      };
      for (const p of G.players) if (p.id !== G.myId && !(p.f & 2)) arrow(p.x, p.y, '#' + PLAYER_COLORS[p.c].toString(16).padStart(6, '0'), p.n + ' ' + Math.round(Math.hypot(p.x - G.me.x, p.y - G.me.y)) + 'm');
      for (const p of G.pings) arrow(p.x, p.y, '#ffe040', p.from);
      if (G.inv?.bp) arrow(G.inv.bp.x, G.inv.bp.y, '#c08040', 'Mochila ' + Math.round(Math.hypot(G.inv.bp.x - G.me.x, G.inv.bp.y - G.me.y)) + 'm');
    }
  };
}
