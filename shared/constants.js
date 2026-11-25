// Rotbound — constantes partilhadas entre anfitrião (simulação) e clientes (ecrã).
export const VERSION = '0.1.0';
export const TILE = 32;            // píxeis por bloco
export const CHUNK = 32;           // blocos por chunk
export const WORLD = 2048;         // blocos por lado
export const CHUNKS = WORLD / CHUNK;
export const CENTER = WORLD / 2;
export const TICK_RATE = 20;       // ticks de simulação por segundo
export const DT = 1 / TICK_RATE;
export const ACTIVE_CHUNK_RADIUS = 3;
export const PORT = 7777;
export const DISCOVERY_PORT = 7778;
export const MAX_PLAYERS = 4;

// Ciclo do dia (segundos reais) — total 18 min
export const PHASES = [
  { k: 'amanhecer', name: 'Amanhecer', dur: 60 },
  { k: 'dia', name: 'Dia', dur: 600 },
  { k: 'crepusculo', name: 'Crepúsculo', dur: 60 },
  { k: 'noite', name: 'Noite', dur: 360 },
];
export const DAY_LENGTH = PHASES.reduce((a, p) => a + p.dur, 0);

export function phaseAt(clock) {
  let t = clock % DAY_LENGTH;
  for (let i = 0; i < PHASES.length; i++) {
    if (t < PHASES[i].dur) return { i, ...PHASES[i], t, frac: t / PHASES[i].dur };
    t -= PHASES[i].dur;
  }
  return { i: 0, ...PHASES[0], t: 0, frac: 0 };
}
// 0 = dia pleno, 1 = noite cerrada
export function darknessAt(clock) {
  const p = phaseAt(clock);
  if (p.k === 'dia') return 0;
  if (p.k === 'noite') return 1;
  if (p.k === 'crepusculo') return p.frac;
  return 1 - p.frac;
}

// ---------- Terreno ----------
export const T = {
  VAZIO: 0, RELVA: 1, FLORESTA: 2, AREIA: 3, AGUA: 4, AGUA_FUNDA: 5, LAMA: 6,
  ROCHA_CHAO: 7, ASFALTO: 8, SOALHO: 9, TERRA_PODRE: 10, ERVA_SECA: 11, CRATERA: 12, LADRILHO: 13,
};
export const TERRAIN = {
  [T.VAZIO]: { name: 'Vazio', solid: true, color: '#000' },
  [T.RELVA]: { name: 'Relva', color: '#4f7a34' },
  [T.FLORESTA]: { name: 'Relva escura', color: '#36602a' },
  [T.AREIA]: { name: 'Areia', color: '#b9a46a' },
  [T.AGUA]: { name: 'Água', color: '#2f5f8a', slow: 0.5 },
  [T.AGUA_FUNDA]: { name: 'Água funda', solid: true, color: '#1c3d63' },
  [T.LAMA]: { name: 'Lama', color: '#4d4a2e', slow: 0.8 },
  [T.ROCHA_CHAO]: { name: 'Chão de pedra', color: '#6b6b6b' },
  [T.ASFALTO]: { name: 'Asfalto', color: '#3c3c40' },
  [T.SOALHO]: { name: 'Soalho', color: '#7a5a3a' },
  [T.TERRA_PODRE]: { name: 'Terra podre', color: '#3c4428' },
  [T.ERVA_SECA]: { name: 'Erva seca', color: '#7d8040' },
  [T.CRATERA]: { name: 'Cratera', color: '#1e2414' },
  [T.LADRILHO]: { name: 'Ladrilho', color: '#8f9599' },
};

// ---------- Objetos (camada de cima) ----------
// tool: 'hand' (qualquer coisa parte), 'axe' (machado mais eficaz), 'pick' (exige picareta de tier >= tier)
// built: construído por jogadores (os zombies atacam-no; recolhe-se no modo de construção)
export const O = {
  NADA: 0, ARVORE: 1, ARVORE_MORTA: 2, ARBUSTO: 3, ERVA_ALTA: 4, ARBUSTO_BAGAS: 5, ARBUSTO_VAZIO: 6,
  ERVAS_MED: 7, PEDRAS: 8, ROCHA: 9, CARVAO: 10, FERRO: 11, ENXOFRE: 12, CRISTAL: 13, CARRO: 14,
  CAIXOTE: 15, PAREDE_VELHA: 16, CAMA_VELHA: 17, BOMBA_GAS: 18, ARMARIO_MED: 19, CAIXA_MILITAR: 20,
  CORACAO: 21, PLACA: 22, ESTANTE: 23, PAREDE_BETAO: 24, CERCA: 25, CULTIVO: 26, MESA: 27, SACOS: 28, TENDA: 29,
  PAREDE_MADEIRA: 30, PORTA_MADEIRA: 31, ESPIGOES: 32, PAREDE_PEDRA: 33, PAREDE_METAL: 34, PORTA_METAL: 35,
  ARAME: 36, MINA: 37, TORRE: 38, HOLOFOTE: 39, GERADOR: 40, TOCHA: 41, FOGUEIRA: 42, BANCADA: 43,
  FORJA: 44, BANCADA_ARMAS: 45, LABORATORIO: 46, BAU: 47, CAMA: 48, PURIFICADOR: 49,
  PORTA_MADEIRA_ABERTA: 50, PORTA_METAL_ABERTA: 51,
};

export const OBJECTS = [];
function def(id, o) { OBJECTS[id] = { id, hp: 10, solid: false, tool: 'hand', tier: 0, drops: [], ...o }; }
def(O.NADA, { name: '', hp: 0 });
def(O.ARVORE, { name: 'Árvore', hp: 60, solid: true, tool: 'axe', drops: [['madeira', 4, 1], ['madeira', 1, 0.5]], regrow: 'tree' });
def(O.ARVORE_MORTA, { name: 'Tronco morto', hp: 40, solid: true, tool: 'axe', drops: [['madeira', 2, 1]] });
def(O.ARBUSTO, { name: 'Arbusto', hp: 8, drops: [['fibra', 2, 1], ['madeira', 1, 0.3]] });
def(O.ERVA_ALTA, { name: 'Erva alta', hp: 4, drops: [['fibra', 1, 1], ['fibra', 1, 0.4]] });
def(O.ARBUSTO_BAGAS, { name: 'Arbusto de bagas', hp: 6, drops: [['bagas', 3, 1]], becomes: O.ARBUSTO_VAZIO });
def(O.ARBUSTO_VAZIO, { name: 'Arbusto (sem bagas)', hp: 8, drops: [['fibra', 2, 1]], regrowTo: O.ARBUSTO_BAGAS });
def(O.ERVAS_MED, { name: 'Ervas medicinais', hp: 3, drops: [['erva', 1, 1], ['erva', 1, 0.3]] });
def(O.PEDRAS, { name: 'Pedras soltas', hp: 3, drops: [['pedra', 1, 1], ['pedra', 1, 0.5]] });
def(O.ROCHA, { name: 'Rocha', hp: 80, solid: true, tool: 'pick', tier: 1, drops: [['pedra', 3, 1], ['pedra', 1, 0.5]] });
def(O.CARVAO, { name: 'Veio de carvão', hp: 100, solid: true, tool: 'pick', tier: 1, drops: [['carvao', 2, 1], ['pedra', 1, 0.5]] });
def(O.FERRO, { name: 'Minério de ferro', hp: 140, solid: true, tool: 'pick', tier: 1, drops: [['minerio_ferro', 2, 1], ['minerio_ferro', 1, 0.3]] });
def(O.ENXOFRE, { name: 'Enxofre', hp: 100, solid: true, tool: 'pick', tier: 1, drops: [['enxofre', 2, 1]] });
def(O.CRISTAL, { name: 'Cristal da Podridão', hp: 220, solid: true, tool: 'pick', tier: 2, drops: [['cristal', 1, 1], ['cristal', 1, 0.25]] });
def(O.CARRO, { name: 'Carro abandonado', hp: 160, solid: true, tool: 'axe', drops: [['sucata', 4, 1], ['combustivel', 1, 0.6], ['componente', 1, 0.2]] });
def(O.CAIXOTE, { name: 'Caixote', hp: 20, solid: true, loot: 'casa', interact: true });
def(O.PAREDE_VELHA, { name: 'Parede velha', hp: 250, solid: true, tool: 'axe', drops: [['madeira', 2, 1], ['sucata', 1, 0.3]] });
def(O.CAMA_VELHA, { name: 'Cama velha', hp: 20, solid: true, drops: [['tecido', 3, 1], ['madeira', 2, 1]] });
def(O.BOMBA_GAS, { name: 'Bomba de gasolina', hp: 60, solid: true, loot: 'posto', interact: true });
def(O.ARMARIO_MED, { name: 'Armário médico', hp: 40, solid: true, loot: 'hospital', interact: true });
def(O.CAIXA_MILITAR, { name: 'Caixa militar', hp: 80, solid: true, loot: 'bunker', interact: true });
def(O.CORACAO, { name: 'Coração da Podridão', hp: 60000, solid: true, tool: 'none', light: 6, lightColor: 0xa0e040 });
def(O.PAREDE_BETAO, { name: 'Parede de betão', hp: 600, solid: true, tool: 'pick', tier: 1, drops: [['pedra', 3, 1], ['sucata', 1, 0.4]] });
def(O.CERCA, { name: 'Cerca', hp: 30, solid: true, tool: 'axe', drops: [['madeira', 1, 1]] });
def(O.CULTIVO, { name: 'Cultivo abandonado', hp: 4, drops: [['bagas', 2, 0.7], ['fibra', 1, 1], ['erva', 1, 0.15]] });
def(O.MESA, { name: 'Mesa', hp: 25, solid: true, tool: 'axe', drops: [['madeira', 2, 1]] });
def(O.SACOS, { name: 'Sacos de areia', hp: 120, solid: true, drops: [['tecido', 1, 0.6], ['pedra', 1, 0.5]] });
def(O.TENDA, { name: 'Tenda', hp: 20, solid: true, drops: [['tecido', 2, 1], ['corda', 1, 0.5]] });
def(O.ESTANTE, { name: 'Estante', hp: 60, solid: true, loot: 'estante', interact: true, books: true });
def(O.PLACA, { name: 'Nota de sobrevivente', hp: 10, solid: false, interact: true, note: true });

def(O.PAREDE_MADEIRA, { name: 'Parede de madeira', hp: 150, solid: true, built: true, item: 'parede_madeira', repair: 'madeira' });
def(O.PORTA_MADEIRA, { name: 'Porta de madeira', hp: 120, solid: true, built: true, item: 'porta_madeira', door: O.PORTA_MADEIRA_ABERTA, repair: 'madeira', interact: true });
def(O.PORTA_MADEIRA_ABERTA, { name: 'Porta de madeira (aberta)', hp: 120, solid: false, built: true, item: 'porta_madeira', door: O.PORTA_MADEIRA, open: true, repair: 'madeira', interact: true });
def(O.ESPIGOES, { name: 'Espigões de madeira', hp: 100, built: true, item: 'espigoes', trap: 5, repair: 'madeira' });
def(O.PAREDE_PEDRA, { name: 'Parede de pedra', hp: 400, solid: true, built: true, item: 'parede_pedra', repair: 'pedra' });
def(O.PAREDE_METAL, { name: 'Parede de metal', hp: 900, solid: true, built: true, item: 'parede_metal', noDig: true, repair: 'lingote' });
def(O.PORTA_METAL, { name: 'Porta de metal', hp: 700, solid: true, built: true, item: 'porta_metal', door: O.PORTA_METAL_ABERTA, noDig: true, repair: 'lingote', interact: true });
def(O.PORTA_METAL_ABERTA, { name: 'Porta de metal (aberta)', hp: 700, solid: false, built: true, item: 'porta_metal', door: O.PORTA_METAL, open: true, repair: 'lingote', interact: true });
def(O.ARAME, { name: 'Arame farpado', hp: 200, built: true, item: 'arame', trap: 3, slow: 0.4, repair: 'lingote' });
def(O.MINA, { name: 'Mina terrestre', hp: 30, built: true, item: 'mina', mine: 80 });
def(O.TORRE, { name: 'Torre automática', hp: 300, solid: true, built: true, item: 'torre', turret: true, repair: 'lingote' });
def(O.HOLOFOTE, { name: 'Holofote', hp: 150, solid: true, built: true, item: 'holofote', light: 13, lightColor: 0xfff6d0, powered: true, repair: 'lingote' });
def(O.GERADOR, { name: 'Gerador', hp: 250, solid: true, built: true, item: 'gerador', generator: true, interact: true, repair: 'lingote' });
def(O.TOCHA, { name: 'Tocha', hp: 20, built: true, item: 'tocha', light: 5.5, lightColor: 0xffb060 });
def(O.FOGUEIRA, { name: 'Fogueira', hp: 80, built: true, item: 'fogueira', light: 7, lightColor: 0xff9a40, station: 'fogueira', repair: 'pedra' });
def(O.BANCADA, { name: 'Bancada de Trabalho', hp: 200, solid: true, built: true, item: 'bancada', station: 'bancada', repair: 'madeira' });
def(O.FORJA, { name: 'Forja', hp: 400, solid: true, built: true, item: 'forja', station: 'forja', light: 3, lightColor: 0xff6020, repair: 'pedra' });
def(O.BANCADA_ARMAS, { name: 'Bancada de Armas', hp: 400, solid: true, built: true, item: 'bancada_armas', station: 'bancada_armas', repair: 'lingote' });
def(O.LABORATORIO, { name: 'Laboratório', hp: 400, solid: true, built: true, item: 'laboratorio', station: 'laboratorio', light: 2.5, lightColor: 0x80ffd0, repair: 'lingote' });
def(O.BAU, { name: 'Baú', hp: 150, solid: true, built: true, item: 'bau', chest: true, interact: true, repair: 'madeira' });
def(O.CAMA, { name: 'Cama', hp: 120, solid: false, built: true, item: 'cama', bed: true, interact: true, repair: 'madeira' });
def(O.PURIFICADOR, { name: 'Purificador', hp: 1500, solid: true, built: true, item: 'purificador', purifier: true, interact: true, light: 8, lightColor: 0x60ffb0, repair: 'lingote' });

export const STATIONS = {
  maos: { name: 'Mãos' },
  bancada: { name: 'Bancada de Trabalho' },
  forja: { name: 'Forja' },
  bancada_armas: { name: 'Bancada de Armas' },
  laboratorio: { name: 'Laboratório' },
  fogueira: { name: 'Fogueira' },
};

export function isSolidTile(terrain, obj) {
  if (TERRAIN[terrain]?.solid) return true;
  return !!OBJECTS[obj]?.solid;
}

// ---------- Zombies e animais ----------
export const ZT = {
  errante: { id: 1, name: 'Errante', hp: 30, speed: 1.6, dmg: 10, r: 0.34, xp: 10, night: 1, wBreak: 10 },
  corredor: { id: 2, name: 'Corredor', hp: 20, speed: 4.6, dmg: 8, r: 0.3, xp: 12, night: 3, wBreak: 8 },
  brutamontes: { id: 3, name: 'Brutamontes', hp: 200, speed: 1.35, dmg: 30, r: 0.5, xp: 40, night: 5, wBreak: 30, push: 4 },
  cuspidor: { id: 4, name: 'Cuspidor', hp: 40, speed: 2.1, dmg: 15, r: 0.34, xp: 20, night: 7, wBreak: 8, ranged: true },
  explosivo: { id: 5, name: 'Explosivo', hp: 50, speed: 2.5, dmg: 60, r: 0.36, xp: 20, night: 10, wBreak: 0, explode: true },
  escavador: { id: 6, name: 'Escavador', hp: 80, speed: 2.1, dmg: 15, r: 0.34, xp: 25, night: 12, wBreak: 12, dig: true },
  rei: { id: 7, name: 'Rei da Podridão', hp: 3000, speed: 1.4, dmg: 50, r: 0.9, xp: 1000, night: 21, wBreak: 80, boss: true },
};
export const ZT_BY_ID = Object.fromEntries(Object.entries(ZT).map(([k, v]) => [v.id, k]));

export const ANIMALS = {
  coelho: { id: 20, name: 'Coelho', hp: 10, speed: 4.2, r: 0.25, drops: [['carne_crua', 1, 1]] },
  veado: { id: 21, name: 'Veado', hp: 35, speed: 4.6, r: 0.4, drops: [['carne_crua', 3, 1], ['tecido', 1, 0.4]] },
  javali: { id: 22, name: 'Javali', hp: 50, speed: 3.4, r: 0.4, dmg: 12, aggressive: true, drops: [['carne_crua', 3, 1]] },
};
export const ANIMAL_BY_ID = Object.fromEntries(Object.entries(ANIMALS).map(([k, v]) => [v.id, k]));

// Projéteis enviados no lote de entidades
export const PROJ = { acido: 40, molotov: 41, flecha: 42, fogo: 43 };

export const PLAYER = {
  r: 0.32, walk: 4.6, run: 7.0, dodgeSpeed: 12, dodgeTime: 0.25, dodgeCost: 20,
  reach: 2.3, placeReach: 5.5,
};
export const PLAYER_COLORS = [0x4fa3ff, 0xffc93c, 0xff6b9a, 0x7dff8a];

export const SLOT = { HOTBAR: 8, MAIN: 24, BACKPACK: 8, CHEST: 24 };

export function xpForLevel(l) { return 100 + 60 * (l - 1); }

export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
