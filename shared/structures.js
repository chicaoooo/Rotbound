// Estruturas pré-desenhadas (plantas em texto). Cada letra é um bloco; o gerador escolhe uma
// planta conforme o bioma, roda-a/espelha-a ao acaso e copia-a para o chunk.
//
// Legenda:
//  ' ' limpa objetos (mantém o terreno)   '.' chão interior
//  '#' parede velha   'B' parede de betão   'd' porta (abertura)   'f' cerca   's' sacos de areia
//  'c' caixote (70 %)  'C' caixote   'e' estante (85 %)   'b' cama velha   't' mesa
//  'm' armário médico   'x' caixa militar (80 %)   'g' bomba de gasolina   'k' carro (60 %)
//  'T' tenda   'p' cultivo   'n' nota (50 %)   'a' asfalto   'r' rocha   'o' ferro   'v' carvão
import { T, O } from './constants.js';

export const TEMPLATES = {
  casa: { floor: T.SOALHO, rows: [
    'fffffffffffff',
    'f           f',
    'f ######### f',
    'f #b..#.e.# f',
    'f #...d...# f',
    'f #t.c#..c# f',
    'f ###d##### f',
    'f    n      f',
    'fffff   fffff',
  ] },
  casa_grande: { floor: T.SOALHO, rows: [
    '#################',
    '#e...#.....#b..b#',
    '#....d.....d....#',
    '#t...#..t..#..c.#',
    '###d###...###d###',
    '#.......t.......#',
    '#c......t......e#',
    '####d#######d####',
  ] },
  quinta: { floor: T.SOALHO, field: T.LAMA, rows: [
    'ffffffffffffffffffffff',
    'f########   #########f',
    'f#b..e.#    #...c..t#f',
    'f#.....d    #.......#f',
    'f#t..c.#    d.......#f',
    'f###d###    #..c....#f',
    'f           ##d######f',
    'f                    f',
    'f  ppppppppppppppp   f',
    'f                    f',
    'f  ppppppppppppppp   f',
    'f                    f',
    'f  ppppppppppppppp   f',
    'fffffffffff  fffffffff',
  ] },
  posto: { floor: T.LADRILHO, rows: [
    'aaaaaaaaaaaaaaaaaaaa',
    'a#########aaaaaaaaaa',
    'a#c.t..e.#aaagaaagaa',
    'a#.......daaaaaaaaaa',
    'a#t..c..n#aaagaaagaa',
    'a#########aaaaaaaaaa',
    'aaaaaaaaaaaaaaaaaaaa',
    'aaakaaaaaaaaaakaaaaa',
    'aaaaaaaaaaaaaaaaaaaa',
  ] },
  hospital: { floor: T.LADRILHO, rows: [
    '########################',
    '#m.b.b.#........#b.b.bm#',
    '#......d........d......#',
    '#b.b.bm#...tt...#m.b.b.#',
    '########...tt...########',
    '#e..m..#........#c..c..#',
    '#......d........d......#',
    '#t..c..#........#m..e..#',
    '#########dd#############',
  ] },
  bunker: { floor: T.LADRILHO, rows: [
    '  sss      sss  ',
    '                ',
    'BBBBBBBddBBBBBBB',
    'Bx.x.xB..Bb..b.B',
    'B.....B..B.....B',
    'B.....d..d.....B',
    'Bx...xB..Bt..e.B',
    'BBBBBBB..BBBBBBB',
    'Bc.t....n.....cB',
    'Bx............xB',
    'BBBBBBBBBBBBBBBB',
  ] },
  biblioteca: { floor: T.SOALHO, rows: [
    '##################',
    '#e.e.e.e.#.e.e.e.#',
    '#........#.......#',
    '#e.e.e.e.d.e.e.e.#',
    '#........#.......#',
    '#e.e.e.e.#.t...t.#',
    '####d#####d#######',
    '#t..t..t...n....c#',
    '#................#',
    '########dd########',
  ] },
  acampamento: { floor: null, rows: [
    'ssssssssss  ssssssssss',
    's                    s',
    's TT  TT     x  x    s',
    's TT  TT          k  s',
    's                    s',
    's  ssss    TT  TT    s',
    's  sxxs    TT  TT    s',
    's  s  s              s',
    's     t  t   c   c   s',
    's                    s',
    'ssssssssssssssssssssss',
  ] },
  cabana: { floor: T.SOALHO, rows: [
    '#####d##',
    '#b..e..#',
    '#......#',
    '#t...c.#',
    '###d####',
    '   n    ',
  ] },
  mineiro: { floor: T.ROCHA_CHAO, rows: [
    'rr  ########',
    'r   #e..b..#',
    '    #.....c#',
    'o   d..t...#',
    'vo  #c.....#',
    '    ########',
    ' o v      k ',
    'r  o   r    ',
  ] },
  oficina: { floor: T.ASFALTO, rows: [
    '################',
    '#k...k..#e.t.c.#',
    '#.......#......#',
    '#.......d......#',
    '#k...k..#t..e..#',
    '#.......#####d##',
    '#..............#',
    '#######dddd#####',
  ] },
};

// estruturas possíveis por bioma: [nome, peso]
export const BY_BIOME = {
  cidade: [['casa', 4], ['casa_grande', 3], ['posto', 1.2], ['hospital', 0.8], ['biblioteca', 1.2], ['oficina', 1.4], ['bunker', 0.5]],
  planicie: [['quinta', 3], ['casa', 2], ['acampamento', 0.8], ['oficina', 0.6]],
  floresta: [['cabana', 4], ['casa', 1], ['acampamento', 0.5], ['biblioteca', 0.3]],
  pantano: [['cabana', 3], ['casa', 1]],
  montanha: [['mineiro', 4], ['bunker', 0.7], ['cabana', 1]],
};
// probabilidade de um chunk ter estruturas e quantas tenta
export const CHANCE = { cidade: [1, 2], planicie: [0.28, 1], floresta: [0.16, 1], pantano: [0.1, 1], montanha: [0.16, 1] };

export function transform(rows, rot, mirror) {
  const w = Math.max(...rows.map(r => r.length));
  let g = rows.map(r => r.padEnd(w, ' ').split(''));
  if (mirror) g = g.map(r => r.reverse());
  for (let k = 0; k < rot; k++) {
    const h = g.length, ww = g[0].length;
    const n = [];
    for (let x = 0; x < ww; x++) { const row = []; for (let y = h - 1; y >= 0; y--) row.push(g[y][x]); n.push(row); }
    g = n;
  }
  return g;
}

const OUTDOOR = new Set([' ', 'f', 's', 'T', 'k', 'p', 'r', 'o', 'v', 'a', 'g']);
export const CELL = {
  '#': () => O.PAREDE_VELHA, 'B': () => O.PAREDE_BETAO, 'f': () => O.CERCA, 's': () => O.SACOS, 'T': () => O.TENDA, 'p': () => O.CULTIVO,
  'c': (r) => r < 0.7 ? O.CAIXOTE : 0, 'C': () => O.CAIXOTE, 'e': (r) => r < 0.85 ? O.ESTANTE : 0, 'b': () => O.CAMA_VELHA, 't': () => O.MESA,
  'm': () => O.ARMARIO_MED, 'x': (r) => r < 0.8 ? O.CAIXA_MILITAR : 0, 'g': () => O.BOMBA_GAS, 'k': (r) => r < 0.6 ? O.CARRO : 0,
  'n': (r) => r < 0.5 ? O.PLACA : 0, 'r': () => O.ROCHA, 'o': () => O.FERRO, 'v': () => O.CARVAO,
};
export const isOutdoor = (ch) => OUTDOOR.has(ch);
