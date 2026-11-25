// Pixel art gerada por código (sem ficheiros de imagem): blocos 32×32, objetos, personagens e ícones.
import { T, O, OBJECTS, TERRAIN, ZT, ANIMALS, PLAYER_COLORS, hash2 } from '../shared/constants.js';

const S = 32;
export const frames = {};     // nome → {x,y,w,h}
export const icons = {};      // id de item → dataURL (para o HUD em HTML)
let atlas, actx, cursorX = 0, cursorY = 0, rowH = 0;
const ATLAS_W = 2048;

function hex(c) { return typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c; }
function shade(c, f) {
  c = hex(c); const n = parseInt(c.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }

// --- primitivas ---
function D(ctx) {
  return {
    ctx,
    rect(x, y, w, h, c) { ctx.fillStyle = hex(c); ctx.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, Math.max(2, Math.round(w / 2) * 2), Math.max(2, Math.round(h / 2) * 2)); return this; },
    circ(x, y, r, c) { ctx.fillStyle = hex(c); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); return this; },
    ell(x, y, rx, ry, c, rot = 0) { ctx.fillStyle = hex(c); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); return this; },
    line(x0, y0, x1, y1, c, w = 2) { ctx.strokeStyle = hex(c); ctx.lineWidth = Math.max(2, w); ctx.lineCap = 'square'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); return this; },
    poly(pts, c) { ctx.fillStyle = hex(c); ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fill(); return this; },
    px(x, y, c) { ctx.fillStyle = hex(c); ctx.fillRect(Math.floor(x / 2) * 2, Math.floor(y / 2) * 2, 2, 2); return this; },
  };
}
// limpa o anti-aliasing e acrescenta contorno (aspeto pixel art)
// Pós-processamento "pixel art": tira o anti-aliasing, reduz a paleta, acende a borda de cima,
// escurece a de baixo e põe contorno escuro à volta.
function crisp(ctx, w, h, outline = '#140f12', shadeEdges = true) {
  const im = ctx.getImageData(0, 0, w, h), d = im.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 96 ? 255 : 0;
  const a = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
  // paleta reduzida (posterização)
  for (let i = 0; i < w * h; i++) if (a[i]) for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.min(255, Math.round(d[i * 4 + k] / 17) * 17);
  if (shadeEdges) {
    const src = new Uint8ClampedArray(d);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!a[i]) continue;
      const up = y > 0 && a[i - w], down = y < h - 1 && a[i + w], left = x > 0 && a[i - 1];
      let f = 0;
      if (!up) f = 0.22; else if (!left) f = 0.1;
      if (!down) f = -0.28;
      if (f) for (let k = 0; k < 3; k++) { const v = src[i * 4 + k]; d[i * 4 + k] = f > 0 ? v + (255 - v) * f : v * (1 + f); }
    }
  }
  if (outline) {
    const n = parseInt(outline.slice(1), 16); const or = (n >> 16) & 255, og = (n >> 8) & 255, ob = n & 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (a[i]) continue;
      if ((x > 0 && a[i - 1]) || (x < w - 1 && a[i + 1]) || (y > 0 && a[i - w]) || (y < h - 1 && a[i + w])) { d[i * 4] = or; d[i * 4 + 1] = og; d[i * 4 + 2] = ob; d[i * 4 + 3] = 255; }
    }
  }
  ctx.putImageData(im, 0, 0);
}
// Cada frame fica com 2 px de margem e as bordas "esticadas" para fora (extrusão):
// assim, com zoom fracionário, a placa gráfica nunca vai buscar cor ao frame vizinho.
const PAD = 2;
function add(name, c) {
  const w = c.width, h = c.height;
  if (cursorX + w + PAD * 2 > ATLAS_W) { cursorX = 0; cursorY += rowH; rowH = 0; }
  const x = cursorX + PAD, y = cursorY + PAD;
  actx.drawImage(c, x, y);
  for (let k = 1; k <= PAD; k++) {
    actx.drawImage(c, 0, 0, w, 1, x, y - k, w, 1);          // cima
    actx.drawImage(c, 0, h - 1, w, 1, x, y + h - 1 + k, w, 1); // baixo
    actx.drawImage(c, 0, 0, 1, h, x - k, y, 1, h);          // esquerda
    actx.drawImage(c, w - 1, 0, 1, h, x + w - 1 + k, y, 1, h); // direita
  }
  actx.drawImage(c, 0, 0, 1, 1, x - PAD, y - PAD, PAD, PAD); actx.drawImage(c, w - 1, 0, 1, 1, x + w, y - PAD, PAD, PAD);
  actx.drawImage(c, 0, h - 1, 1, 1, x - PAD, y + h, PAD, PAD); actx.drawImage(c, w - 1, h - 1, 1, 1, x + w, y + h, PAD, PAD);
  frames[name] = { x, y, w, h };
  cursorX += w + PAD * 2; rowH = Math.max(rowH, h + PAD * 2);
}
// Cada sprite é desenhado a metade da resolução (16×16) e ampliado 2× sem suavização:
// píxeis grandes e nítidos.
const PX = 2;
function sprite(name, fn, { w = S, h = S, outline = '#140f12', raw = false } = {}) {
  const lw = w / PX, lh = h / PX;
  const [c, ctx] = canvas(lw, lh); ctx.save(); ctx.scale(1 / PX, 1 / PX); fn(D(ctx), ctx); ctx.restore();
  if (!raw) crisp(ctx, lw, lh, outline, !!outline);
  const [big, bctx] = canvas(w, h); bctx.drawImage(c, 0, 0, w, h); add(name, big); return big;
}

// --- terreno ---
function terrainTile(id, v, rotten) {
  const L = S / PX; const [c, ctx] = canvas(L, L);
  const water = id === T.AGUA || id === T.AGUA_FUNDA;
  const base = rotten ? (water ? '#2c3420' : TERRAIN[T.TERRA_PODRE].color) : TERRAIN[id].color;
  const seed = id * 31 + v * 7 + (rotten ? 99 : 0);
  const P = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
  // base com 3 tons e algum pontilhado (dithering)
  const tones = [shade(base, -0.1), shade(base, 0), shade(base, 0.07)];
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
    const r = hash2(x, y, seed);
    let t = r < 0.18 ? 0 : r > 0.86 ? 2 : 1;
    if (water) t = ((x + y * 2 + v * 3) % 8 < 2) ? 2 : r < 0.25 ? 0 : 1;
    P(x, y, tones[t]);
  }
  const rnd = (k) => hash2(k, v, seed + 3);
  const at = (k) => [(rnd(k) * L) | 0, (rnd(k + 40) * L) | 0];
  if (!rotten && (id === T.RELVA || id === T.FLORESTA || id === T.ERVA_SECA)) {
    // tufos de erva em forma de "v"
    for (let k = 0; k < 4; k++) { const [x, y] = at(k); P(x, y, shade(base, -0.22)); P(x + 1, y - 1, shade(base, 0.16)); P(x + 2, y, shade(base, -0.22)); }
    if (v === 3 && id !== T.FLORESTA) P(5 + (seed % 6), 6, id === T.ERVA_SECA ? '#c8b860' : '#c890a8');
  }
  if (water) { const [x, y] = at(1); P(x, y, shade(base, 0.25)); P(x + 1, y, shade(base, 0.25)); }
  if (rotten && !water) for (let k = 0; k < 3; k++) { const [x, y] = at(k); P(x, y, '#64723a'); P(x + 1, y, '#64723a'); if (k === 1) P(x, y + 2, '#9cbc4a'); }
  if (id === T.ASFALTO) { for (let k = 0; k < 3; k++) { const [x, y] = at(k); P(x, y, shade(base, -0.25)); } if (v === 1) { ctx.fillStyle = '#b0a050'; ctx.fillRect(7, 0, 2, 5); ctx.fillRect(7, 9, 2, 5); } }
  if (id === T.SOALHO) { ctx.fillStyle = shade(base, -0.28); for (let y = 0; y < L; y += 4) ctx.fillRect(0, y, L, 1); for (let r = 0; r < 4; r++) ctx.fillRect(((r * 5 + v * 3) % 14) + 1, r * 4, 1, 4); }
  if (id === T.LADRILHO) { ctx.fillStyle = shade(base, -0.18); ctx.fillRect(0, 7, L, 1); ctx.fillRect(7, 0, 1, L); ctx.fillRect(0, 15, L, 1); ctx.fillRect(15, 0, 1, L); }
  if (id === T.ROCHA_CHAO) for (let k = 0; k < 3; k++) { const [x, y] = at(k); P(x, y, shade(base, -0.2)); P(x + 1, y, shade(base, -0.2)); P(x, y - 1, shade(base, 0.12)); }
  if (id === T.AREIA) for (let k = 0; k < 4; k++) { const [x, y] = at(k); P(x, y, '#d8c890'); }
  if (id === T.LAMA) for (let k = 0; k < 2; k++) { const [x, y] = at(k); P(x, y, shade(base, -0.3)); P(x + 1, y, shade(base, -0.3)); }
  if (id === T.CRATERA) for (let k = 0; k < 3; k++) { const [x, y] = at(k); P(x, y, '#55662a'); }
  const [big, bctx] = canvas(S, S); bctx.drawImage(c, 0, 0, S, S);
  add((rotten ? 'r' : 't') + id + '_' + v, big);
}

// --- objetos ---
function tree(d, dead, v = 0) {
  if (dead) {
    d.rect(14, 12, 5, 18, '#4a3a33').line(16, 16, 7, 7, '#4a3a33', 3).line(17, 14, 26, 5, '#4a3a33', 3).line(16, 22, 25, 17, '#3d302a', 2).circ(16, 28, 4, '#3d302a');
    return;
  }
  d.rect(14, 22, 5, 9, '#5a3b22');
  const g = ['#2f6b2a', '#326f2c', '#2b6327'][v % 3];
  d.circ(16, 14, 12, shade(g, -0.25)).circ(11, 12, 7, g).circ(21, 11, 7, g).circ(16, 18, 8, g).circ(16, 9, 6, shade(g, 0.12)).circ(12, 9, 3, shade(g, 0.3)).circ(20, 15, 3, shade(g, 0.15));
}
function rock(d, speck, tone = '#8a8a8e') {
  d.poly([4, 24, 6, 10, 14, 4, 24, 6, 29, 16, 27, 27, 14, 29], shade(tone, -0.1)).poly([7, 21, 9, 11, 15, 7, 22, 8, 26, 16, 24, 23, 14, 25], tone).poly([10, 12, 15, 8, 20, 9, 17, 13], shade(tone, 0.25));
  if (speck) for (const [x, y] of [[10, 18], [18, 15], [21, 21], [13, 13], [16, 22], [22, 12]]) d.rect(x, y, 3, 3, speck).px(x, y, shade(speck, 0.4));
}
function planks(d, c, vertical) {
  d.rect(1, 1, 30, 30, c);
  for (let i = 0; i < 4; i++) vertical ? d.rect(1 + i * 8, 1, 1, 30, shade(c, -0.3)) : d.rect(1, 1 + i * 8, 30, 1, shade(c, -0.3));
  d.rect(1, 1, 30, 2, shade(c, 0.2));
}
const OBJ_DRAW = {
  [O.ARVORE]: (d) => tree(d, false), [O.ARVORE_MORTA]: (d) => tree(d, true),
  [O.ARBUSTO]: (d) => d.circ(16, 18, 9, '#3d7a35').circ(11, 15, 5, '#4a8a3f').circ(21, 16, 5, '#4a8a3f').circ(16, 13, 4, '#5a9a4a'),
  [O.ERVA_ALTA]: (d) => { for (let i = 0; i < 7; i++) d.line(8 + i * 3, 28, 6 + i * 3 + (i % 3), 12 + (i % 2) * 5, i % 2 ? '#6a9a40' : '#7db04a', 2); },
  [O.ARBUSTO_BAGAS]: (d) => { d.circ(16, 18, 9, '#2f6a35').circ(11, 15, 5, '#3a7a3f').circ(21, 16, 5, '#3a7a3f'); for (const [x, y] of [[10, 16], [16, 12], [21, 18], [14, 21], [19, 13], [23, 22]]) d.circ(x, y, 2, '#d0304a').px(x - 1, y - 1, '#ff90a0'); },
  [O.ARBUSTO_VAZIO]: (d) => d.circ(16, 18, 8, '#3d6a35').circ(11, 15, 4, '#4a7a3f').circ(21, 16, 4, '#4a7a3f'),
  [O.ERVAS_MED]: (d) => { for (let i = 0; i < 5; i++) d.line(16, 27, 8 + i * 4, 14, '#4f9a50', 2); for (const [x, y] of [[8, 13], [16, 10], [24, 13], [12, 11], [20, 11]]) d.circ(x, y, 2, '#f0f0f0').px(x, y, '#f0d040'); },
  [O.PEDRAS]: (d) => d.circ(11, 20, 4, '#8a8a8e').circ(20, 23, 3, '#7a7a80').circ(18, 15, 3, '#9a9aa0').px(10, 18, '#c0c0c4'),
  [O.ROCHA]: (d) => rock(d), [O.CARVAO]: (d) => rock(d, '#1c1c20'), [O.FERRO]: (d) => rock(d, '#c0703a'), [O.ENXOFRE]: (d) => rock(d, '#e8d030', '#9a9070'),
  [O.CRISTAL]: (d) => { rock(d, null, '#3e4432'); d.poly([10, 24, 13, 6, 17, 24], '#8ad040').poly([15, 24, 20, 3, 24, 24], '#b0e860').poly([19, 26, 25, 12, 28, 26], '#6aa82a').line(19, 6, 20, 18, '#ecffc8', 1); },
  [O.CARRO]: (d) => { d.rect(2, 7, 28, 18, '#7a4030').rect(7, 9, 9, 14, '#5a7a8a').rect(18, 9, 6, 14, '#4a6a78').rect(2, 7, 28, 2, '#9a5a40'); d.rect(4, 5, 5, 3, '#1a1a1a').rect(22, 5, 5, 3, '#1a1a1a').rect(4, 24, 5, 3, '#1a1a1a').rect(22, 24, 5, 3, '#1a1a1a'); d.rect(26, 14, 3, 4, '#8a6a30'); },
  [O.CAIXOTE]: (d) => { d.rect(5, 6, 22, 20, '#a07040').rect(5, 6, 22, 3, '#c09060'); d.line(6, 8, 26, 25, '#704a28', 2).line(26, 8, 6, 25, '#704a28', 2); },
  [O.PAREDE_VELHA]: (d) => { d.rect(0, 0, 32, 32, '#6a5a50'); for (let y = 0; y < 32; y += 8) { d.rect(0, y, 32, 1, '#4a3c34'); for (let x = (y / 8) % 2 ? 0 : 8; x < 32; x += 16) d.rect(x, y, 1, 8, '#4a3c34'); } d.rect(0, 0, 32, 2, '#8a7a6a'); },
  [O.CAMA_VELHA]: (d) => { d.rect(6, 3, 20, 26, '#704a30').rect(8, 5, 16, 22, '#a0a0b8').rect(9, 6, 14, 6, '#e0e0e8').rect(8, 16, 16, 11, '#6a6a90'); },
  [O.BOMBA_GAS]: (d) => { d.rect(8, 4, 16, 24, '#b03030').rect(11, 7, 10, 7, '#202020').rect(12, 8, 8, 5, '#80e080').rect(22, 14, 4, 10, '#303030'); },
  [O.ARMARIO_MED]: (d) => { d.rect(5, 4, 22, 24, '#e8e8e8').rect(5, 4, 22, 2, '#ffffff').rect(14, 9, 4, 14, '#d02020').rect(9, 14, 14, 4, '#d02020'); },
  [O.CAIXA_MILITAR]: (d) => { d.rect(3, 7, 26, 18, '#4a5a30').rect(3, 7, 26, 3, '#5f7040').rect(6, 13, 20, 1, '#2a3418').rect(13, 15, 6, 4, '#c0b060'); },
  [O.CORACAO]: (d) => { d.circ(16, 16, 13, '#1e2a10').circ(16, 16, 10, '#5a7a1a').circ(13, 13, 5, '#9ac040').circ(19, 18, 4, '#6a8a1a').circ(12, 12, 2, '#e0ff90'); d.line(3, 6, 10, 11, '#3a4a1a', 2).line(29, 8, 22, 12, '#3a4a1a', 2).line(5, 28, 11, 21, '#3a4a1a', 2); },
  [O.PAREDE_BETAO]: (d) => { d.rect(0, 0, 32, 32, '#7c7a72').rect(0, 0, 32, 3, '#a09d94'); d.rect(0, 15, 32, 2, '#5c5a54'); for (const [x, y] of [[5, 7], [20, 9], [11, 22], [25, 25], [16, 4]]) d.rect(x, y, 2, 2, '#66645c'); d.line(22, 18, 27, 28, '#55534c', 2); },
  [O.CERCA]: (d) => { d.rect(4, 4, 4, 26, '#8a5a30').rect(24, 4, 4, 26, '#8a5a30').rect(0, 9, 32, 4, '#a06c3a').rect(0, 20, 32, 4, '#a06c3a').rect(4, 2, 4, 3, '#b07a44').rect(24, 2, 4, 3, '#b07a44'); },
  [O.CULTIVO]: (d) => { d.rect(2, 22, 28, 6, '#5a4228'); for (let i = 0; i < 4; i++) { const x = 5 + i * 7; d.line(x, 26, x, 10, '#6a9a34', 2).line(x, 16, x - 3, 12, '#7aae40', 2).line(x, 14, x + 3, 9, '#7aae40', 2); if (i % 2 === 0) d.rect(x - 1, 7, 3, 3, '#d8c040'); else d.rect(x + 1, 9, 3, 3, '#c03a3a'); } },
  [O.MESA]: (d) => { d.rect(4, 7, 24, 16, '#9a6a3a').rect(4, 7, 24, 3, '#b8844c').rect(6, 22, 3, 6, '#6a4422').rect(23, 22, 3, 6, '#6a4422').rect(12, 11, 7, 5, '#d8d0b8').rect(13, 12, 5, 1, '#8a8070'); },
  [O.SACOS]: (d) => { for (const [x, y] of [[1, 17], [11, 17], [21, 17], [6, 8], [16, 8]]) d.rect(x, y, 10, 9, '#b8a678').rect(x, y, 10, 2, '#d0c090').rect(x + 1, y + 7, 8, 2, '#8a7a52'); },
  [O.TENDA]: (d) => { d.poly([2, 28, 16, 4, 30, 28], '#5f6a3a').poly([16, 4, 30, 28, 16, 28], '#4a5430').poly([12, 28, 16, 16, 20, 28], '#202418').line(16, 4, 16, 28, '#3a4024', 2); },
  [O.ESTANTE]: (d) => { d.rect(3, 3, 26, 26, '#5a3a20').rect(5, 5, 22, 22, '#3a2412'); const C = ['#a03030', '#3060a0', '#c0a030', '#307040', '#5a7a2a', '#c06020'];
    for (let row = 0; row < 3; row++) { d.rect(5, 11 + row * 7, 22, 1, '#6a4422'); for (let i = 0; i < 6; i++) if ((row * 7 + i * 3) % 5) d.rect(6 + i * 3.5, 6 + row * 7, 3, 5, C[(row + i) % 6]); } },
  [O.PLACA]: (d) => { d.rect(9, 8, 14, 17, '#e8dcb0').line(11, 12, 21, 12, '#806040', 1).line(11, 16, 20, 16, '#806040', 1).line(11, 20, 18, 20, '#806040', 1); },
  [O.PAREDE_MADEIRA]: (d) => { planks(d, '#9a6a3a', true); d.rect(1, 8, 30, 2, '#6a4422').rect(1, 22, 30, 2, '#6a4422'); for (const x of [4, 12, 20, 28]) { d.px(x, 8, '#d0d0d0').px(x, 22, '#d0d0d0'); } },
  [O.PORTA_MADEIRA]: (d) => { planks(d, '#8a5a30', true); d.rect(4, 4, 24, 24, '#7a4c26').rect(6, 6, 20, 20, '#8a5a30').rect(22, 15, 3, 3, '#e0c040'); },
  [O.PORTA_MADEIRA_ABERTA]: (d) => { d.rect(1, 1, 5, 30, '#8a5a30').rect(1, 1, 5, 2, '#a07040').rect(26, 1, 5, 30, '#6a4422'); },
  [O.ESPIGOES]: (d) => { d.rect(4, 22, 24, 4, '#6a4422'); for (let i = 0; i < 4; i++) { d.poly([5 + i * 6, 24, 8 + i * 6, 4 + (i % 2) * 4, 11 + i * 6, 24], '#a07a4a'); d.px(8 + i * 6, 5 + (i % 2) * 4, '#e0d0b0'); } },
  [O.PAREDE_PEDRA]: (d) => { d.rect(0, 0, 32, 32, '#8a8a90'); for (let y = 0; y < 32; y += 8) { d.rect(0, y, 32, 1, '#5a5a60'); for (let x = (y / 8) % 2 ? 4 : 12; x < 32; x += 16) d.rect(x, y, 1, 8, '#5a5a60'); } d.rect(0, 0, 32, 2, '#aaaab0'); d.rect(3, 3, 4, 2, '#a0a0a8').rect(20, 19, 4, 2, '#a0a0a8'); },
  [O.PAREDE_METAL]: (d) => { d.rect(0, 0, 32, 32, '#6a747c').rect(0, 15, 32, 2, '#4a525a').rect(15, 0, 2, 32, '#4a525a').rect(0, 0, 32, 2, '#9aa4ac'); for (const [x, y] of [[3, 3], [28, 3], [3, 12], [28, 12], [3, 20], [28, 20], [3, 28], [28, 28]]) d.rect(x, y, 2, 2, '#b0bac0'); },
  [O.PORTA_METAL]: (d) => { d.rect(0, 0, 32, 32, '#5a646c').rect(3, 3, 26, 26, '#6a747c').rect(3, 3, 26, 2, '#9aa4ac').rect(22, 14, 4, 4, '#d0b030').rect(6, 8, 12, 2, '#4a525a').rect(6, 22, 12, 2, '#4a525a'); },
  [O.PORTA_METAL_ABERTA]: (d) => { d.rect(1, 1, 5, 30, '#6a747c').rect(1, 1, 5, 2, '#9aa4ac').rect(26, 1, 5, 30, '#4a525a'); },
  [O.ARAME]: (d) => { d.rect(3, 6, 2, 22, '#5a4a3a').rect(27, 6, 2, 22, '#5a4a3a'); for (let k = 0; k < 3; k++) { const y = 10 + k * 6; d.line(3, y, 29, y + 2, '#b0b0b8', 1); for (let x = 6; x < 28; x += 5) d.line(x - 1, y - 2, x + 1, y + 2, '#c8c8d0', 1).line(x + 1, y - 2, x - 1, y + 2, '#c8c8d0', 1); } },
  [O.MINA]: (d) => d.circ(16, 17, 8, '#4a5030').circ(16, 17, 6, '#5a6038').circ(16, 16, 2, '#e03030'),
  [O.TORRE]: (d) => { d.rect(6, 6, 20, 20, '#4a5258').rect(6, 6, 20, 3, '#6a747a').circ(16, 16, 7, '#3a4046').rect(16, 14, 14, 4, '#2a2e32').rect(28, 13, 3, 6, '#1a1c1e'); },
  [O.HOLOFOTE]: (d) => { d.rect(10, 18, 12, 10, '#3a3a40').circ(16, 13, 9, '#5a5a62').circ(16, 13, 7, '#f8f0c0').circ(14, 11, 3, '#ffffff'); },
  [O.GERADOR]: (d) => { d.rect(3, 7, 26, 18, '#c0a020').rect(3, 7, 26, 3, '#e0c040').rect(7, 12, 10, 9, '#3a3a3a').rect(20, 12, 6, 3, '#5a5a5a').rect(20, 17, 6, 3, '#5a5a5a'); for (let i = 0; i < 4; i++) d.rect(8, 13 + i * 2, 8, 1, '#5a5a5a'); },
  [O.TOCHA]: (d) => { d.rect(15, 14, 3, 16, '#6a4422').circ(16, 11, 5, '#ff8a20').circ(16, 10, 3, '#ffd060').px(16, 8, '#ffffff'); },
  [O.FOGUEIRA]: (d) => { for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; d.circ(16 + Math.cos(a) * 10, 17 + Math.sin(a) * 10, 3, '#7a7a80'); } d.line(9, 22, 23, 12, '#5a3a20', 3).line(9, 12, 23, 22, '#5a3a20', 3); d.circ(16, 16, 6, '#ff6a10').circ(16, 15, 4, '#ffb030').circ(16, 14, 2, '#fff0a0'); },
  [O.BANCADA]: (d) => { d.rect(2, 6, 28, 20, '#8a5a30').rect(2, 6, 28, 3, '#aa7a4a').rect(5, 11, 8, 3, '#9a9aa0').line(18, 12, 26, 20, '#6a6a70', 2).rect(20, 10, 4, 4, '#6a4422'); },
  [O.FORJA]: (d) => { d.rect(3, 4, 26, 24, '#5a5a60').rect(3, 4, 26, 3, '#7a7a80').rect(8, 12, 16, 12, '#2a1a14').rect(10, 16, 12, 7, '#ff5a10').rect(12, 18, 8, 4, '#ffb030'); },
  [O.BANCADA_ARMAS]: (d) => { d.rect(2, 6, 28, 20, '#4a5240').rect(2, 6, 28, 3, '#6a7460').rect(5, 12, 14, 3, '#202020').rect(8, 15, 3, 5, '#202020').rect(22, 10, 5, 12, '#c0a040'); },
  [O.LABORATORIO]: (d) => { d.rect(2, 6, 28, 20, '#d8e0e4').rect(2, 6, 28, 3, '#ffffff').rect(6, 10, 4, 10, '#60e0b0').rect(13, 13, 4, 7, '#80c840').rect(20, 11, 6, 9, '#4a5a64').rect(21, 12, 4, 3, '#80ffd0'); },
  [O.BAU]: (d) => { d.rect(4, 7, 24, 19, '#8a5a2a').rect(4, 7, 24, 7, '#a06a34').rect(4, 13, 24, 2, '#5a3a1a').rect(14, 12, 4, 5, '#e0c040').rect(4, 7, 2, 19, '#5a3a1a').rect(26, 7, 2, 19, '#5a3a1a'); },
  [O.CAMA]: (d) => { d.rect(6, 2, 20, 28, '#7a4a28').rect(8, 4, 16, 24, '#c03a3a').rect(9, 5, 14, 6, '#f0f0f0').rect(8, 14, 16, 2, '#a02a2a'); },
  [O.PURIFICADOR]: (d) => { d.rect(4, 4, 24, 24, '#5a6a70').circ(16, 16, 9, '#2a3a40').circ(16, 16, 6, '#60ffb0').circ(16, 16, 3, '#e0fff0'); for (const [x, y] of [[6, 6], [24, 6], [6, 24], [24, 24]]) d.rect(x, y, 3, 3, '#90a0a8'); },
};

// --- personagens (viradas para a direita) ---
function human(d, shirt, skin = '#e0b090', hair = '#3a2a1a') {
  d.ell(15, 16, 8, 11, shade(shirt, -0.15)).ell(15, 16, 7, 10, shirt);
  d.circ(21, 7, 3, skin).circ(21, 25, 3, skin); // mãos
  d.circ(15, 16, 6, skin).ell(13, 16, 5, 6, hair).px(19, 14, '#1a1010').px(19, 18, '#1a1010');
}
function zombie(d, t) {
  const skin = { errante: '#7a9a6a', corredor: '#8aa07a', brutamontes: '#6a8a5a', cuspidor: '#a0a05a', explosivo: '#9a8a5a', escavador: '#7a6a4a', rei: '#4a5a3a' }[t];
  const cloth = { errante: '#5a5a7a', corredor: '#7a4a4a', brutamontes: '#4a4a4a', cuspidor: '#6a7040', explosivo: '#7a5a3a', escavador: '#5a4a30', rei: '#1c2412' }[t];
  if (t === 'brutamontes') {
    d.ell(15, 16, 11, 14, shade(cloth, -0.2)).ell(15, 16, 10, 13, cloth).circ(25, 4, 5, skin).circ(25, 28, 5, skin).circ(15, 16, 7, skin).rect(18, 13, 2, 2, '#ff2020').rect(18, 18, 2, 2, '#ff2020').rect(8, 10, 4, 3, '#4a6a3a');
    return;
  }
  if (t === 'rei') {
    d.ell(30, 32, 22, 27, shade(cloth, -0.2)).ell(30, 32, 20, 25, cloth).circ(52, 10, 8, skin).circ(52, 54, 8, skin).circ(30, 32, 14, skin)
      .rect(37, 26, 4, 3, '#e8d040').rect(37, 35, 4, 3, '#e8d040');
    for (const [x, y] of [[18, 22], [16, 32], [18, 42], [24, 18], [24, 46]]) d.poly([x, y - 4, x - 7, y, x, y + 4], '#9ad848');
    for (const [x, y] of [[10, 14], [8, 48], [40, 8], [42, 56], [22, 6]]) d.circ(x, y, 3, '#4a6a20');
    return;
  }
  const thin = t === 'corredor';
  const bodyR = thin ? 6 : t === 'cuspidor' ? 9 : 8;
  d.ell(14, 16, bodyR, thin ? 9 : 11, shade(cloth, -0.2)).ell(14, 16, bodyR - 1, thin ? 8 : 10, cloth);
  d.line(16, 9, 28, 6, skin, 3).line(16, 23, 28, 25, skin, 3).circ(28, 6, 2, skin).circ(28, 25, 2, skin);
  d.circ(15, 16, 6, skin).rect(18, 13, 2, 2, '#ffe040').rect(18, 18, 2, 2, '#ffe040');
  d.rect(9, 12, 3, 2, shade(skin, -0.3)).rect(11, 20, 2, 3, '#8a2020');
  if (t === 'cuspidor') d.circ(19, 16, 3, '#c0e040').circ(10, 10, 3, '#b0c040');
  if (t === 'explosivo') for (const [x, y] of [[9, 9], [10, 22], [6, 16], [14, 25]]) d.circ(x, y, 3, '#ff9020').px(x, y, '#ffe080');
  if (t === 'escavador') d.line(26, 4, 31, 2, '#e0e0d0', 1).line(26, 27, 31, 29, '#e0e0d0', 1).rect(6, 10, 6, 12, '#5a4a2a');
}
function animal(d, t) {
  if (t === 'coelho') { d.ell(15, 16, 7, 5, '#a08060').circ(22, 16, 4, '#a08060').ell(22, 11, 1.5, 4, '#b09070').ell(22, 21, 1.5, 4, '#b09070').circ(9, 16, 2, '#f0f0f0').px(24, 15, '#101010'); }
  if (t === 'veado') { d.ell(14, 16, 11, 6, '#9a6a3a').circ(26, 16, 4, '#9a6a3a').line(27, 13, 30, 6, '#d8c8a0', 1).line(27, 19, 30, 26, '#d8c8a0', 1).line(29, 8, 26, 6, '#d8c8a0', 1).line(29, 24, 26, 26, '#d8c8a0', 1).px(28, 15, '#101010'); }
  if (t === 'javali') { d.ell(14, 16, 11, 8, '#4a3a2a').circ(25, 16, 5, '#5a4632').rect(29, 13, 2, 2, '#e8e0c0').rect(29, 18, 2, 2, '#e8e0c0').rect(6, 10, 10, 2, '#2a2018').px(26, 14, '#101010'); }
}

// --- ícones de itens ---
const ICON = {
  madeira: (d) => { d.rect(4, 8, 24, 7, '#8a5a30').rect(6, 17, 22, 7, '#9a6a3a').circ(5, 11, 3.5, '#c09060').circ(7, 20, 3.5, '#d0a070'); },
  fibra: (d) => { for (let i = 0; i < 6; i++) d.line(8 + i * 3, 28, 12 + i * 2, 4, i % 2 ? '#a0b050' : '#b8c060', 2); d.rect(9, 16, 16, 3, '#8a6a30'); },
  pedra: (d) => { d.circ(14, 18, 9, '#8a8a8e').circ(18, 14, 7, '#9a9aa0').circ(15, 12, 3, '#c0c0c4'); },
  carvao: (d) => { d.circ(13, 18, 8, '#2a2a2e').circ(20, 14, 7, '#1c1c20').px(17, 11, '#6a6a7a').px(10, 16, '#5a5a6a'); },
  minerio_ferro: (d) => { rock(d, '#c0703a'); },
  enxofre: (d) => { d.circ(14, 18, 8, '#d8c030').circ(19, 13, 6, '#e8d850').px(17, 11, '#fff8a0'); },
  sucata: (d) => { d.rect(5, 14, 14, 10, '#7a7a80').rect(14, 8, 12, 9, '#9a6a4a').line(6, 26, 26, 22, '#5a5a60', 3).px(16, 10, '#c0c0c0'); },
  tecido: (d) => { d.poly([5, 10, 26, 6, 28, 22, 7, 26], '#c0b0a0').line(8, 14, 24, 11, '#a09080', 1).line(9, 19, 25, 16, '#a09080', 1); },
  componente: (d) => { d.rect(6, 8, 20, 16, '#2a6a3a').rect(10, 12, 12, 8, '#1a1a1a'); for (let i = 0; i < 4; i++) { d.rect(11 + i * 3, 5, 1, 3, '#d0c060').rect(11 + i * 3, 24, 1, 3, '#d0c060'); } },
  combustivel: (d) => { d.rect(8, 6, 16, 22, '#c02a2a').rect(8, 6, 16, 3, '#e04a4a').rect(17, 2, 5, 5, '#303030').line(11, 12, 21, 24, '#902020', 2); },
  erva: (d) => { for (let i = 0; i < 4; i++) d.line(16, 28, 7 + i * 6, 10, '#4f9a50', 2); for (const [x, y] of [[7, 9], [13, 7], [19, 7], [25, 9]]) d.circ(x, y, 2.5, '#f0f0f0'); },
  corda: (d) => { d.circ(16, 16, 10, '#b08a50').circ(16, 16, 6, 'rgba(0,0,0,0)'); d.ctx.globalCompositeOperation = 'destination-out'; d.circ(16, 16, 5, '#000'); d.ctx.globalCompositeOperation = 'source-over'; d.line(10, 10, 22, 22, '#8a6a30', 1); },
  lingote: (d) => { d.poly([4, 22, 9, 12, 27, 12, 28, 22], '#9aa4ac').poly([9, 12, 12, 8, 25, 8, 27, 12], '#c0cad0'); },
  polvora: (d) => { d.ell(16, 22, 12, 6, '#2a2a2a').ell(16, 18, 8, 5, '#3a3a3a').px(14, 16, '#6a6a6a'); },
  cristal: (d) => { d.poly([9, 26, 13, 6, 18, 26], '#8ad040').poly([14, 26, 20, 3, 25, 26], '#b0e860').line(19, 7, 20, 20, '#ecffc8', 1); },
  coracao_negro: (d) => { d.circ(11, 13, 7, '#1a2410').circ(21, 13, 7, '#1a2410').poly([4, 15, 16, 29, 28, 15], '#1a2410').circ(10, 11, 2, '#6a8a2a'); },
  carne_podre: (d) => { d.ell(16, 17, 11, 8, '#6a7a40').circ(12, 15, 3, '#8a9a50').px(20, 19, '#3a4a20').px(14, 21, '#3a4a20'); },
  bagas: (d) => { for (const [x, y] of [[10, 14], [17, 11], [22, 17], [14, 21], [20, 23]]) d.circ(x, y, 4, '#d0304a').px(x - 1, y - 2, '#ff90a0'); d.line(16, 4, 17, 10, '#3a6a2a', 2); },
  carne_crua: (d) => { d.ell(16, 16, 11, 8, '#d05060').ell(14, 15, 6, 4, '#e88090').circ(25, 20, 3, '#f0f0e0'); },
  carne_cozinhada: (d) => { d.ell(16, 16, 11, 8, '#8a4a2a').ell(14, 15, 6, 4, '#a86a3a').circ(25, 20, 3, '#f0f0e0'); },
  bagas_assadas: (d) => { for (const [x, y] of [[10, 14], [17, 11], [22, 17], [14, 21], [20, 23]]) d.circ(x, y, 4, '#7a2030').px(x - 1, y - 2, '#c05060'); },
  estufado: (d) => { d.ell(16, 18, 12, 9, '#6a4a3a').ell(16, 15, 10, 5, '#a06030').circ(12, 15, 2, '#d05050').circ(19, 14, 2, '#50a050'); },
  cha_ervas: (d) => { d.rect(8, 10, 14, 16, '#e0e0e0').rect(9, 11, 12, 4, '#7aa050').rect(22, 14, 4, 7, '#e0e0e0'); },
  ligadura: (d) => { d.rect(6, 11, 20, 10, '#f0f0f0').rect(6, 11, 20, 2, '#ffffff').rect(14, 11, 4, 10, '#e0d0d0'); },
  antibioticos: (d) => { d.rect(10, 9, 12, 18, '#f0a020').rect(9, 5, 14, 5, '#ffffff').rect(12, 15, 8, 6, '#ffffff'); },
  kit_medico: (d) => { d.rect(4, 8, 24, 18, '#e8e8e8').rect(13, 4, 6, 5, '#909090').rect(14, 11, 4, 12, '#d02020').rect(10, 15, 12, 4, '#d02020'); },
  vacina: (d) => { d.line(5, 27, 22, 10, '#e0f0ff', 5).line(22, 10, 28, 4, '#c0c0c0', 1).line(8, 24, 18, 14, '#60e0b0', 3); },
  lanca: (d) => { d.line(4, 28, 24, 8, '#9a6a3a', 3).poly([22, 6, 29, 3, 26, 10], '#c0c0c0'); },
  machado_pedra: (d) => { d.line(8, 28, 20, 6, '#8a5a30', 3).poly([17, 5, 27, 8, 25, 16, 18, 12], '#8a8a8e'); },
  picareta_pedra: (d) => { d.line(10, 28, 18, 8, '#8a5a30', 3).poly([6, 10, 16, 4, 28, 9, 17, 9], '#8a8a8e'); },
  taco: (d) => { d.line(6, 28, 24, 6, '#9a6a3a', 5); for (const [x, y] of [[20, 8], [24, 12], [17, 11], [22, 5]]) d.px(x, y, '#e0e0e0').px(x + 1, y - 1, '#e0e0e0'); },
  catana: (d) => { d.line(6, 28, 10, 24, '#3a2a1a', 4).poly([9, 22, 26, 4, 29, 6, 12, 25], '#d0d8e0').line(12, 22, 27, 6, '#ffffff', 1); },
  machado_ferro: (d) => { d.line(8, 28, 20, 6, '#6a4422', 3).poly([16, 4, 28, 7, 27, 18, 18, 12], '#b0bac0'); },
  picareta_ferro: (d) => { d.line(10, 28, 18, 8, '#6a4422', 3).poly([5, 11, 16, 3, 29, 9, 17, 8], '#b0bac0'); },
  lamina_podridao: (d) => { d.line(6, 28, 10, 24, '#1c2412', 4).poly([9, 22, 26, 3, 30, 5, 12, 25], '#7ab830').line(12, 22, 27, 5, '#e8ffc0', 1); },
  martelo: (d) => { d.line(8, 28, 18, 10, '#8a5a30', 3).rect(12, 4, 14, 7, '#7a7a80'); },
  arco: (d) => { d.ctx.strokeStyle = '#8a5a30'; d.ctx.lineWidth = 3; d.ctx.beginPath(); d.ctx.arc(8, 16, 13, -1.2, 1.2); d.ctx.stroke(); d.line(12, 4, 12, 28, '#e0e0e0', 1); },
  pistola: (d) => { d.rect(6, 10, 20, 6, '#3a3a40').rect(8, 15, 6, 11, '#2a2a2e').rect(24, 10, 3, 3, '#5a5a60'); },
  cacadeira: (d) => { d.rect(2, 13, 28, 4, '#3a3a40').rect(2, 15, 10, 7, '#6a4422').rect(16, 17, 6, 3, '#5a3a1a'); },
  espingarda: (d) => { d.rect(2, 12, 28, 4, '#2a2a2e').rect(2, 14, 8, 7, '#3a3a40').rect(14, 16, 5, 9, '#2a2a2e').rect(20, 16, 3, 5, '#3a3a40'); },
  molotov: (d) => { d.rect(11, 12, 10, 16, '#4a8a4a').rect(13, 7, 6, 6, '#3a6a3a').rect(13, 3, 6, 5, '#e0d0b0').circ(16, 3, 3, '#ff8020'); },
  flecha: (d) => { d.line(5, 27, 25, 7, '#9a6a3a', 2).poly([23, 5, 29, 3, 27, 9], '#c0c0c0').line(5, 27, 9, 27, '#e0e0e0', 2).line(5, 27, 5, 23, '#e0e0e0', 2); },
  balas: (d) => { for (let i = 0; i < 3; i++) d.rect(8 + i * 6, 10, 4, 14, '#d0a030').rect(8 + i * 6, 7, 4, 4, '#c08040'); },
  cartuchos: (d) => { for (let i = 0; i < 2; i++) d.rect(8 + i * 9, 8, 7, 16, '#c02a2a').rect(8 + i * 9, 20, 7, 5, '#d0a030'); },
  armadura_couro: (d) => { d.poly([6, 6, 12, 4, 20, 4, 26, 6, 26, 26, 6, 26], '#8a5a30').rect(13, 4, 6, 6, '#5a3a1a').rect(6, 16, 20, 2, '#6a4422'); },
  armadura_ferro: (d) => { d.poly([6, 6, 12, 4, 20, 4, 26, 6, 26, 26, 6, 26], '#9aa4ac').rect(13, 4, 6, 6, '#5a646c').rect(6, 16, 20, 2, '#6a747c').px(10, 10, '#e0e8f0'); },
  armadura_podridao: (d) => { d.poly([6, 6, 12, 4, 20, 4, 26, 6, 26, 26, 6, 26], '#3a4a22').rect(13, 4, 6, 6, '#1c2412').poly([10, 20, 13, 10, 16, 20], '#9ad848').poly([17, 20, 20, 12, 23, 20], '#9ad848'); },
  livro_carpintaria: (d) => book(d, '#8a5a2a', '#d0a060'),
  livro_metalurgia: (d) => book(d, '#4a5a6a', '#c0ccd8'),
  livro_armas: (d) => book(d, '#4a5a30', '#d0b040'),
  livro_quimica: (d) => book(d, '#2a6a5a', '#80ffd0'),
  mochila: (d) => { d.rect(7, 7, 18, 21, '#6a5a3a').rect(9, 4, 14, 5, '#5a4a2a').rect(10, 15, 12, 8, '#7a6a4a').rect(15, 15, 2, 3, '#d0b030'); },
  cadeado: (d) => { d.ctx.strokeStyle = '#a0a0a8'; d.ctx.lineWidth = 3; d.ctx.beginPath(); d.ctx.arc(16, 13, 6, Math.PI, 0); d.ctx.stroke(); d.rect(8, 13, 16, 13, '#d0b030').rect(15, 17, 2, 5, '#5a4a10'); },
};

function book(d, c, mark) {
  d.poly([7, 6, 23, 4, 26, 24, 10, 27], shade(c, -0.25)).poly([6, 5, 22, 3, 25, 23, 9, 26], c).rect(8, 24, 15, 2, '#e8e0c8').line(9, 7, 11, 25, shade(c, -0.4), 2);
  d.circ(16, 14, 4, mark);
}
function lightTex(size, inner = 0) {
  const [c, ctx] = canvas(size, size); const g = ctx.createRadialGradient(size / 2, size / 2, size * inner / 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size); return c;
}
function coneTex(size) {
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(0, size / 2, 0, 0, size / 2, size);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.7, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, size / 2); const a = 0.45;
  ctx.arc(0, size / 2, size, -a, a); ctx.closePath(); ctx.fill(); return c;
}

export function buildArt(items) {
  [atlas, actx] = canvas(ATLAS_W, 2048);
  // terreno: 4 variantes cada, normal e podre
  for (const id of Object.values(T)) for (let v = 0; v < 4; v++) { terrainTile(id, v, false); terrainTile(id, v, true); }
  for (const [id, fn] of Object.entries(OBJ_DRAW)) sprite('o' + id, fn);
  sprite('o' + O.ARVORE + '_1', (d) => tree(d, false, 1)); sprite('o' + O.ARVORE + '_2', (d) => tree(d, false, 2));
  for (let k = 1; k <= 3; k++) sprite('crack' + k, (d) => { const c = 'rgb(20,10,10)'; d.line(8, 6, 14, 14, c, 1).line(14, 14, 11, 22, c, 1); if (k > 1) d.line(22, 8, 18, 16, c, 1).line(18, 16, 24, 25, c, 1); if (k > 2) d.line(4, 20, 12, 26, c, 1).line(26, 4, 28, 12, c, 1); }, { outline: null });
  for (const t of Object.keys(ZT)) sprite('z_' + t, (d) => zombie(d, t), t === 'rei' ? { w: 64, h: 64 } : {});
  for (const t of Object.keys(ANIMALS)) sprite('a_' + t, (d) => animal(d, t));
  PLAYER_COLORS.forEach((c, i) => sprite('p' + i, (d) => human(d, c, ['#e0b090', '#c08a60', '#f0c8a0', '#8a5a3a'][i], ['#3a2a1a', '#1a1a1a', '#a06030', '#2a1a10'][i])));
  sprite('p_down', (d) => { d.ell(16, 16, 12, 7, '#606070').circ(26, 16, 5, '#e0b090'); });
  sprite('acid', (d) => d.circ(16, 16, 5, '#a0e040').circ(14, 14, 2, '#e0ff90'));
  sprite('backpack', (d) => ICON.mochila(d));
  sprite('ping', (d) => d.poly([16, 30, 6, 12, 16, 2, 26, 12], '#ffe040').circ(16, 12, 4, '#ffffff'));
  // ícones de itens
  for (const id of Object.keys(items)) {
    const def = items[id];
    let fn = ICON[id];
    if (!fn && def.kind === 'place') fn = OBJ_DRAW[def.obj];
    if (!fn) fn = (d) => d.circ(16, 16, 8, '#c0c0c0');
    const c = sprite('i_' + id, fn);
    icons[id] = c.toDataURL();
  }
  const light = lightTex(256), cone = coneTex(512), glow = lightTex(64, 0);
  return { atlas, frames, light, cone, glow };
}
