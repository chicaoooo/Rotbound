// Tabelas de saque e notas de sobreviventes.
export const LOOT = {
  casa: [['tecido', 1, 3, 0.6], ['sucata', 1, 3, 0.5], ['bagas', 2, 4, 0.3], ['ligadura', 1, 1, 0.25], ['corda', 1, 2, 0.3],
    ['combustivel', 1, 1, 0.15], ['componente', 1, 1, 0.12], ['balas', 3, 8, 0.07], ['madeira', 2, 5, 0.3], ['carne_cozinhada', 1, 2, 0.15]],
  hospital: [['ligadura', 1, 3, 0.7], ['antibioticos', 1, 1, 0.35], ['erva', 1, 3, 0.5], ['componente', 1, 2, 0.4], ['tecido', 2, 4, 0.5], ['kit_medico', 1, 1, 0.1]],
  posto: [['combustivel', 1, 3, 0.9], ['sucata', 1, 2, 0.5], ['componente', 1, 1, 0.2], ['molotov', 1, 1, 0.12]],
  bunker: [['balas', 5, 15, 0.7], ['cartuchos', 3, 6, 0.4], ['componente', 1, 3, 0.6], ['lingote', 2, 4, 0.5], ['polvora', 2, 5, 0.4],
    ['pistola', 1, 1, 0.12], ['armadura_couro', 1, 1, 0.15], ['mina', 1, 1, 0.15]],
};

// livros: os mais avançados aparecem mais perto da Cratera e na cidade
export function rollBooks(x, y, biome, where) {
  const d = Math.hypot(x - 1024, y - 1024) / 1024;
  const w = {
    livro_carpintaria: d > 0.6 ? 6 : 2,
    livro_metalurgia: (d > 0.78 ? 1 : 4) + (biome === 'montanha' ? 5 : 0) + (biome === 'cidade' ? 1 : 0),
    livro_armas: (d < 0.62 ? 3 : 0.4) + (where === 'bunker' ? 12 : 0) + (biome === 'cidade' ? 1 : 0),
    livro_quimica: (d < 0.45 ? 2.5 : 0.3) + (where === 'hospital' ? 12 : 0),
  };
  if (biome === 'floresta' || biome === 'planicie' || biome === 'pantano') w.livro_carpintaria += 3;
  const pick = () => { let s = 0; for (const v of Object.values(w)) s += v; let r = Math.random() * s; for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) return k; } return 'livro_carpintaria'; };
  const out = [[pick(), 1]];
  if (Math.random() < 0.35) out.push([pick(), 1]);
  if (Math.random() < 0.4) out.push([Math.random() < 0.5 ? 'tecido' : 'madeira', 1 + (Math.random() * 2 | 0)]);
  return out;
}

export function rollLoot(table, rnd = Math.random) {
  const out = [];
  for (const [id, a, b, p] of LOOT[table] || []) if (rnd() < p) out.push([id, a + Math.floor(rnd() * (b - a + 1))]);
  if (!out.length) out.push([rnd() < 0.5 ? 'tecido' : 'sucata', 1]);
  return out;
}

export const NOTES = [
  'Dia 3. A terra no centro ficou roxa. Os animais fugiram primeiro. Devíamos ter ido com eles.',
  '«Não durmam ao relento. Eles não nascem onde há luz.» — escrito a carvão numa tábua.',
  'O hospital da cidade ainda tem antibióticos no armário do fundo. Fui lá ontem. Não voltei a lá ir.',
  'Os grandes partem madeira como se fosse papel. Pedra aguenta. Metal aguenta mais.',
  'Ouvi dizer que no bunker militar ainda há munição. A sul da cidade, junto às montanhas.',
  'Os que cavam aparecem DENTRO das casas. Só o metal os pára.',
  'Contei sete noites. Na sétima a lua ficou vermelha e vieram todos de uma vez.',
  'A Cratera tem um coração. Bate. Ouço-o daqui à noite.',
  'Dizem que um purificador limpa a Podridão. Precisas do coração negro do Rei para o fazer funcionar.',
  'Os explosivos correm para as paredes. Mata-os de longe, por amor de Deus.',
  'Chá de ervas não cura, mas ajuda. Os antibióticos é que curam.',
  'Sem os livros certos não passas da bancada. Procura nas estantes das casas, das bibliotecas e das oficinas.',
  'Os manuais de armas estão nos bunkers. Os de química, no hospital.',
  'Se fores mordido demasiadas vezes, a febre não passa. E depois já não és tu.',
];
