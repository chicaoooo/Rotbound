// Mundo em grelha: chunks, geração procedural com seed, Podridão e colisões.
import { CHUNK, CHUNKS, WORLD, CENTER, T, O, OBJECTS, TERRAIN, PLAYER, hash2 } from './constants.js';
import { makeNoise2D, fbm, mulberry32 } from './noise.js';
import { TEMPLATES, BY_BIOME, CHANCE, transform, CELL, isOutdoor } from './structures.js';

export const chunkKey = (cx, cy) => cx + cy * CHUNKS;

export class Chunk {
  constructor(cx, cy) {
    this.cx = cx; this.cy = cy;
    this.t = new Uint8Array(CHUNK * CHUNK);
    this.o = new Uint8Array(CHUNK * CHUNK);
    this.h = new Uint16Array(CHUNK * CHUNK);
    this.modified = false;
  }
}

export class BaseWorld {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.chunks = new Map();
    this.rot = new Rot(this.seed);
  }
  chunkAt(x, y) {
    if (x < 0 || y < 0 || x >= WORLD || y >= WORLD) return null;
    return this.chunks.get(chunkKey((x / CHUNK) | 0, (y / CHUNK) | 0)) || null;
  }
  getT(x, y) { const c = this.chunkAt(x, y); return c ? c.t[(y % CHUNK) * CHUNK + (x % CHUNK)] : T.VAZIO; }
  getO(x, y) { const c = this.chunkAt(x, y); return c ? c.o[(y % CHUNK) * CHUNK + (x % CHUNK)] : 0; }
  getH(x, y) { const c = this.chunkAt(x, y); return c ? c.h[(y % CHUNK) * CHUNK + (x % CHUNK)] : 0; }
  setTile(x, y, o, h) {
    const c = this.chunkAt(x, y); if (!c) return;
    const i = (y % CHUNK) * CHUNK + (x % CHUNK);
    c.o[i] = o; c.h[i] = h; c.modified = true;
  }
  solid(x, y) {
    const c = this.chunkAt(x, y);
    if (!c) return true;
    const i = (y % CHUNK) * CHUNK + (x % CHUNK);
    return !!(TERRAIN[c.t[i]].solid || OBJECTS[c.o[i]].solid);
  }
}

// ---------- Podridão ----------
export class Rot {
  constructor(seed) {
    this.noise = makeNoise2D(seed ^ 0x51ab);
    this.radius = 70;
    this.patches = [];     // [{x,y,r}] — espalhada pelo chefe
    this.purifiers = [];   // [{x,y,r}] — purificadores com combustível
    this.cleared = false;  // vitória
  }
  state() { return { radius: this.radius, patches: this.patches, purifiers: this.purifiers, cleared: this.cleared }; }
  load(s) { if (!s) return; this.radius = s.radius; this.patches = s.patches || []; this.purifiers = s.purifiers || []; this.cleared = !!s.cleared; }
  isRot(x, y) {
    if (this.cleared) return false;
    for (const p of this.purifiers) { const dx = x - p.x, dy = y - p.y; if (dx * dx + dy * dy < p.r * p.r) return false; }
    const dx = x - CENTER, dy = y - CENTER;
    const d2 = dx * dx + dy * dy;
    const lim = this.radius + 20;
    if (d2 < lim * lim) {
      const r = this.radius + this.noise(x / 35, y / 35) * 18;
      if (d2 < r * r) return true;
    }
    for (const p of this.patches) { const ex = x - p.x, ey = y - p.y; if (ex * ex + ey * ey < p.r * p.r) return true; }
    return false;
  }
}

// ---------- Geração ----------
export class Generator {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.nAlt = makeNoise2D(this.seed ^ 0x1111);
    this.nMoist = makeNoise2D(this.seed ^ 0x2222);
    this.nUrb = makeNoise2D(this.seed ^ 0x3333);
    this.nDet = makeNoise2D(this.seed ^ 0x4444);
  }
  biome(x, y) {
    const dx = x - CENTER, dy = y - CENTER;
    const d = Math.sqrt(dx * dx + dy * dy) / CENTER;
    if (d < 0.055) return 'cratera';
    const alt = fbm(this.nAlt, x / 220, y / 220, 4);
    if (alt < -0.42) return 'agua_funda';
    if (alt < -0.34) return 'agua';
    if (alt < -0.30) return 'praia';
    if (alt > 0.34 && d < 0.9) return 'montanha';
    const urb = fbm(this.nUrb, x / 130, y / 130, 2);
    if (urb > 0.3 && d > 0.14 && d < 0.74) return 'cidade';
    const moist = fbm(this.nMoist, x / 170, y / 170, 3);
    if (moist > 0.3 && d < 0.8) return 'pantano';
    if (moist > -0.08 || d > 0.84) return 'floresta';
    return 'planicie';
  }
  generate(cx, cy) {
    const ch = new Chunk(cx, cy);
    const s = this.seed;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      const x = x0 + lx, y = y0 + ly, i = ly * CHUNK + lx;
      const b = this.biome(x, y);
      const r = hash2(x, y, s), r2 = hash2(y, x, s + 7);
      const dist = Math.hypot(x - CENTER, y - CENTER) / CENTER;
      let t = T.RELVA, o = 0;
      switch (b) {
        case 'cratera':
          t = T.CRATERA;
          if (r < 0.05) o = O.CRISTAL; else if (r < 0.12) o = O.ROCHA;
          break;
        case 'agua_funda': t = T.AGUA_FUNDA; break;
        case 'agua': t = T.AGUA; break;
        case 'praia': t = T.AREIA; if (r < 0.006) o = O.PEDRAS; break;
        case 'montanha': {
          t = T.ROCHA_CHAO;
          const rich = 1.6 - dist;
          if (r < 0.055) o = O.ROCHA;
          else if (r < 0.055 + 0.022 * rich) o = O.CARVAO;
          else if (r < 0.055 + 0.04 * rich) o = O.FERRO;
          else if (dist < 0.25 && r < 0.055 + 0.05 * rich) o = O.CRISTAL;
          else if (r < 0.125) o = O.PEDRAS;
          break;
        }
        case 'pantano': {
          t = this.nDet(x / 9, y / 9) > 0.35 ? T.AGUA : T.LAMA;
          if (t === T.LAMA) {
            if (r < 0.012) o = O.ENXOFRE; else if (r < 0.025) o = O.ERVAS_MED; else if (r < 0.05) o = O.ERVA_ALTA;
            else if (r < 0.062) o = O.ARVORE_MORTA; else if (r < 0.068) o = O.ARVORE;
          }
          break;
        }
        case 'cidade': {
          const road = (x % 40) < 4 || (y % 40) < 4;
          t = road ? T.ASFALTO : (this.nDet(x / 9, y / 9) > 0.05 ? T.ERVA_SECA : T.RELVA);
          if (!road) { if (r < 0.025) o = O.ERVA_ALTA; else if (r < 0.033) o = O.ARBUSTO; else if (r < 0.04) o = O.ARVORE; else if (r < 0.043) o = O.PEDRAS; }
          else if (r < 0.006) o = O.CARRO;
          break;
        }
        case 'floresta':
          t = T.FLORESTA;
          // floresta mais aberta: árvores em manchas, chão com menos tralha
          if (r < (this.nDet(x / 14, y / 14) > 0.25 ? 0.075 : 0.025)) o = O.ARVORE;
          else if (r > 0.5) { const q = r - 0.5; if (q < 0.014) o = O.ARBUSTO; else if (q < 0.021) o = O.ARBUSTO_BAGAS; else if (q < 0.028) o = O.ERVAS_MED; else if (q < 0.032) o = O.PEDRAS; else if (q < 0.034) o = O.ROCHA; else if (q < 0.046) o = O.ERVA_ALTA; }
          break;
        default: // planície
          t = this.nDet(x / 11 + 50, y / 11) > 0.2 ? T.ERVA_SECA : T.RELVA;
          if (r < 0.03) o = O.ERVA_ALTA; else if (r < 0.037) o = O.ARBUSTO; else if (r < 0.045) o = O.ARBUSTO_BAGAS;
          else if (r < 0.049) o = O.PEDRAS; else if (r < 0.051) o = O.ROCHA; else if (r < 0.056) o = O.ARVORE;
      }
      ch.t[i] = t; ch.o[i] = o; ch.h[i] = OBJECTS[o].hp;
    }
    this.structures(ch);
    // Coração da Podridão no centro exato
    if (cx === CENTER / CHUNK && cy === CENTER / CHUNK) {
      for (let ly = 0; ly < 7; ly++) for (let lx = 0; lx < 7; lx++) { const i = ly * CHUNK + lx; ch.o[i] = 0; ch.h[i] = 0; }
      ch.o[3 * CHUNK + 3] = O.CORACAO; ch.h[3 * CHUNK + 3] = OBJECTS[O.CORACAO].hp;
    }
    return ch;
  }
  structures(ch) {
    const rnd = mulberry32((hash2(ch.cx, ch.cy, this.seed + 99) * 4294967296) >>> 0);
    const b = this.biome(ch.cx * CHUNK + 16, ch.cy * CHUNK + 16);
    const dist = Math.hypot(ch.cx * CHUNK + 16 - CENTER, ch.cy * CHUNK + 16 - CENTER) / CENTER;
    const ch0 = CHANCE[b]; if (!ch0 || rnd() > ch0[0]) return;
    let list = BY_BIOME[b];
    if (dist > 0.55) list = list.filter(([k]) => k !== 'bunker'); // bunkers só a meio caminho da Cratera
    const occupied = [];
    for (let k = 0; k < ch0[1]; k++) {
      let s2 = 0; for (const [, w] of list) s2 += w; let r = rnd() * s2; let name = list[0][0];
      for (const [n, w] of list) { r -= w; if (r <= 0) { name = n; break; } }
      const tpl = TEMPLATES[name];
      const grid = transform(tpl.rows, (rnd() * 4) | 0, rnd() < 0.5);
      const h = grid.length, w = grid[0].length;
      if (w > CHUNK - 2 || h > CHUNK - 2) continue;
      for (let attempt = 0; attempt < 8; attempt++) {
        const lx = 1 + ((rnd() * (CHUNK - w - 1)) | 0), ly = 1 + ((rnd() * (CHUNK - h - 1)) | 0);
        if (occupied.some(q => lx < q[0] + q[2] + 1 && lx + w + 1 > q[0] && ly < q[1] + q[3] + 1 && ly + h + 1 > q[1])) continue;
        let wet = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const t = ch.t[(ly + y) * CHUNK + lx + x]; if (t === T.AGUA || t === T.AGUA_FUNDA) wet++; }
        if (wet > 2) continue;
        occupied.push([lx, ly, w, h]);
        this.stamp(ch, tpl, grid, lx, ly, rnd);
        break;
      }
    }
  }
  stamp(ch, tpl, grid, lx, ly, rnd) {
    for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[0].length; x++) {
      const c = grid[y][x]; const i = (ly + y) * CHUNK + lx + x;
      if (!isOutdoor(c) && tpl.floor != null) ch.t[i] = tpl.floor;
      if (c === 'a' || c === 'g') ch.t[i] = T.ASFALTO;
      if (c === 'p' && tpl.field != null) ch.t[i] = tpl.field;
      if (ch.t[i] === T.AGUA || ch.t[i] === T.AGUA_FUNDA) ch.t[i] = T.LAMA;
      const f = CELL[c]; const o = f ? f(rnd()) : 0;
      ch.o[i] = o; ch.h[i] = OBJECTS[o].hp;
    }
  }
  findSpawn() {
    const rnd = mulberry32(this.seed ^ 0xbeef);
    for (let k = 0; k < 4000; k++) {
      const a = rnd() * Math.PI * 2, d = CENTER * (0.8 + rnd() * 0.1);
      const x = Math.round(CENTER + Math.cos(a) * d), y = Math.round(CENTER + Math.sin(a) * d);
      if (x < 40 || y < 40 || x > WORLD - 40 || y > WORLD - 40) continue;
      if (this.biome(x, y) !== 'floresta') continue;
      let ok = true;
      for (let yy = -6; yy <= 6 && ok; yy++) for (let xx = -6; xx <= 6; xx++) { const b = this.biome(x + xx, y + yy); if (b === 'agua' || b === 'agua_funda') { ok = false; break; } }
      if (ok) return { x: x + 0.5, y: y + 0.5 };
    }
    return { x: 200.5, y: 200.5 };
  }
}

// ---------- Colisão AABB contra a grelha ----------
export function collideMove(world, e, dx, dy, r) {
  const EPS = 0.001;
  if (dx) {
    let nx = e.x + dx;
    const minY = Math.floor(e.y - r), maxY = Math.floor(e.y + r - 1e-6);
    if (dx > 0) { const tx = Math.floor(nx + r); for (let ty = minY; ty <= maxY; ty++) if (world.solid(tx, ty)) { nx = tx - r - EPS; break; } }
    else { const tx = Math.floor(nx - r); for (let ty = minY; ty <= maxY; ty++) if (world.solid(tx, ty)) { nx = tx + 1 + r + EPS; break; } }
    e.x = nx;
  }
  if (dy) {
    let ny = e.y + dy;
    const minX = Math.floor(e.x - r), maxX = Math.floor(e.x + r - 1e-6);
    if (dy > 0) { const ty = Math.floor(ny + r); for (let tx = minX; tx <= maxX; tx++) if (world.solid(tx, ty)) { ny = ty - r - EPS; break; } }
    else { const ty = Math.floor(ny - r); for (let tx = minX; tx <= maxX; tx++) if (world.solid(tx, ty)) { ny = ty + 1 + r + EPS; break; } }
    e.y = ny;
  }
}

// Movimento do jogador — usado pelo anfitrião e pela previsão do cliente.
export function stepPlayer(p, inp, world, dt) {
  const res = { ran: false, dodged: false, moved: false };
  if (p.dead || p.lying) return res;
  let mx = inp.mx || 0, my = inp.my || 0;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  let vx = 0, vy = 0;
  if (p.dodgeT > 0) {
    p.dodgeT -= dt;
    vx = p.dodgeX * PLAYER.dodgeSpeed; vy = p.dodgeY * PLAYER.dodgeSpeed;
  } else if (inp.dodge && !p.downed && len > 0.1 && p.stamina >= PLAYER.dodgeCost) {
    p.dodgeT = PLAYER.dodgeTime; p.dodgeX = mx; p.dodgeY = my;
    vx = mx * PLAYER.dodgeSpeed; vy = my * PLAYER.dodgeSpeed; res.dodged = true;
  } else {
    let sp = PLAYER.walk;
    if (p.downed) sp = 0.9;
    else if (inp.run && p.stamina > 1 && len > 0.1) { sp = PLAYER.run; res.ran = true; }
    if (p.exhausted && !p.downed) sp *= 0.8;
    const tx = Math.floor(p.x), ty = Math.floor(p.y);
    const tt = TERRAIN[world.getT(tx, ty)]; if (tt && tt.slow) sp *= tt.slow;
    const oo = OBJECTS[world.getO(tx, ty)]; if (oo && oo.slow) sp *= oo.slow;
    vx = mx * sp; vy = my * sp;
  }
  if (p.kx || p.ky) {
    vx += p.kx; vy += p.ky;
    p.kx *= 0.75; p.ky *= 0.75;
    if (Math.abs(p.kx) < 0.05) p.kx = 0; if (Math.abs(p.ky) < 0.05) p.ky = 0;
  }
  if (vx || vy) { collideMove(world, p, vx * dt, vy * dt, PLAYER.r); res.moved = true; }
  return res;
}

export function lineOfSight(world, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0); const steps = Math.ceil(d * 2);
  for (let i = 1; i < steps; i++) { const t = i / steps; if (world.solid(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t))) return false; }
  return true;
}
