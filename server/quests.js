// Missões partilhadas pelo grupo: uma cadeia principal (do primeiro machado até à vitória)
// e 2 missões diárias que mudam a cada amanhecer.
// Cada missão conta eventos: ev = tipo, k = item/tipo (ou lista, ou null = qualquer), n = quantidade.
// As principais contam tudo o que o grupo já fez (se já construíste a Forja, fica logo cumprida);
// as diárias contam só a partir do momento em que aparecem.

export const MAIN = [
  { t: 'Primeiros passos', d: 'Parte erva alta e arbustos à mão para recolher fibra.', ev: 'get', k: 'fibra', n: 6, rew: [['bagas', 3]], xp: 15 },
  { t: 'Lenha', d: 'Corta árvores para juntar madeira (à mão é lento).', ev: 'get', k: 'madeira', n: 10, rew: [['corda', 1]], xp: 20 },
  { t: 'Pedras soltas', d: 'Apanha pedras soltas do chão.', ev: 'get', k: 'pedra', n: 5, rew: [['pedra', 2]], xp: 15 },
  { t: 'Ferramentas', d: 'Faz um Machado de pedra e uma Picareta de pedra (Tab → Crafting).', ev: 'craft', k: ['machado_pedra', 'picareta_pedra'], n: 2, rew: [['tocha', 2]], xp: 30 },
  { t: 'Oficina', d: 'Constrói uma Bancada de Trabalho e coloca-a no chão.', ev: 'place', k: 'bancada', n: 1, rew: [['madeira', 8]], xp: 40 },
  { t: 'Luz contra a noite', d: 'Coloca uma Fogueira. Os zombies não nascem perto da luz.', ev: 'place', k: 'fogueira', n: 1, rew: [['carne_cozinhada', 2]], xp: 30 },
  { t: 'Abrigo', d: 'Constrói 8 paredes de madeira e uma porta à volta da tua base.', ev: 'place', k: ['parede_madeira', 'porta_madeira'], n: 9, rew: [['ligadura', 2]], xp: 50 },
  { t: 'A primeira noite', d: 'Sobrevive até ao amanhecer.', ev: 'night', k: null, n: 1, rew: [['ligadura', 1], ['tocha', 3]], xp: 60 },
  { t: 'Saber é poder', d: 'Procura estantes em casas e cabanas e lê um livro.', ev: 'read', k: null, n: 1, rew: [['tecido', 4]], xp: 40 },
  { t: 'Saqueador', d: 'Abre 4 caixotes, estantes ou armários.', ev: 'loot', k: null, n: 4, rew: [['corda', 2], ['tecido', 2]], xp: 40 },
  { t: 'Descanso', d: 'Faz uma Cama: é o teu ponto de renascimento.', ev: 'place', k: 'cama', n: 1, rew: [['bagas_assadas', 3]], xp: 40 },
  { t: 'Caçador de mortos', d: 'Mata 15 zombies.', ev: 'kill', k: null, n: 15, rew: [['flecha', 10]], xp: 80 },
  { t: 'Ao fundo da mina', d: 'Nas montanhas, mina 6 de minério de ferro e 5 de carvão.', ev: 'get', k: ['minerio_ferro', 'carvao'], n: 11, rew: [['carvao', 3]], xp: 60 },
  { t: 'Carpinteiro', d: 'Aprende todas as receitas da Bancada de Trabalho (livros de Carpintaria).', ev: 'unlock', k: 'bancada', n: 1, rew: [['pedra', 10]], xp: 80 },
  { t: 'Fogo e ferro', d: 'Constrói a Forja.', ev: 'place', k: 'forja', n: 1, rew: [['minerio_ferro', 4]], xp: 80 },
  { t: 'Metal', d: 'Funde 6 lingotes de ferro na Forja.', ev: 'craft', k: 'lingote', n: 6, rew: [['carvao', 4]], xp: 60 },
  { t: 'Lua de Sangue', d: 'Sobrevive à noite 7.', ev: 'nightn', k: null, n: 7, rew: [['balas', 10], ['kit_medico', 1]], xp: 150 },
  { t: 'Ferreiro', d: 'Aprende todas as receitas da Forja (livros de Metalurgia).', ev: 'unlock', k: 'forja', n: 1, rew: [['sucata', 6]], xp: 100 },
  { t: 'Arsenal', d: 'Constrói a Bancada de Armas.', ev: 'place', k: 'bancada_armas', n: 1, rew: [['polvora', 5]], xp: 100 },
  { t: 'Gigantes', d: 'Mata 3 Brutamontes.', ev: 'kill', k: 'brutamontes', n: 3, rew: [['cartuchos', 6]], xp: 120 },
  { t: 'Armeiro', d: 'Aprende todas as receitas da Bancada de Armas (Manuais de Armas, nos bunkers).', ev: 'unlock', k: 'bancada_armas', n: 1, rew: [['componente', 4]], xp: 120 },
  { t: 'Ciência', d: 'Constrói o Laboratório (precisa de Cristais da Podridão).', ev: 'place', k: 'laboratorio', n: 1, rew: [['antibioticos', 2]], xp: 150 },
  { t: 'O Rei da Podridão', d: 'Na noite 21 o Rei acorda. Derrota-o e fica com o Coração Negro.', ev: 'kill', k: 'rei', n: 1, rew: [['kit_medico', 2]], xp: 400 },
  { t: 'Purificador', d: 'Constrói o Purificador no Laboratório.', ev: 'craft', k: 'purificador', n: 1, rew: [['combustivel', 3]], xp: 200 },
  { t: 'Limpar a terra', d: 'Leva o Purificador ao Coração da Podridão (centro do mapa) e aguenta 3 minutos.', ev: 'win', k: null, n: 1, rew: [], xp: 1000 },
];

export const DAILY = [
  { t: 'Limpeza', d: 'Mata 10 zombies.', ev: 'kill', k: null, n: 10, rew: [['ligadura', 2]], xp: 40 },
  { t: 'Caça', d: 'Caça 2 animais.', ev: 'hunt', k: null, n: 2, rew: [['carne_cozinhada', 2]], xp: 30 },
  { t: 'Cozinheiro', d: 'Cozinha 3 refeições numa fogueira.', ev: 'craft', k: ['carne_cozinhada', 'bagas_assadas', 'estufado', 'cha_ervas'], n: 3, rew: [['erva', 2]], xp: 30 },
  { t: 'Lenhador', d: 'Recolhe 30 de madeira.', ev: 'get', k: 'madeira', n: 30, rew: [['corda', 2]], xp: 30 },
  { t: 'Pedreiro', d: 'Recolhe 20 de pedra.', ev: 'get', k: 'pedra', n: 20, rew: [['tocha', 3]], xp: 30 },
  { t: 'Explorador', d: 'Abre 3 caixotes, estantes ou armários.', ev: 'loot', k: null, n: 3, rew: [['tecido', 3]], xp: 40 },
  { t: 'Fortificar', d: 'Coloca 6 blocos de defesa (paredes, portas, espigões ou arame).', ev: 'place', k: ['parede_madeira', 'porta_madeira', 'parede_pedra', 'parede_metal', 'porta_metal', 'espigoes', 'arame'], n: 6, rew: [['madeira', 10]], xp: 40 },
  { t: 'Manutenção', d: 'Repara 3 blocos danificados com o martelo.', ev: 'repair', k: null, n: 3, rew: [['pedra', 6]], xp: 30, minNight: 2 },
  { t: 'Leitor', d: 'Lê um livro.', ev: 'read', k: null, n: 1, rew: [['ligadura', 1]], xp: 40 },
  { t: 'Os especiais', d: 'Mata 3 zombies especiais (Corredores, Brutamontes, Cuspidores, Explosivos ou Escavadores).', ev: 'kill', k: ['corredor', 'brutamontes', 'cuspidor', 'explosivo', 'escavador'], n: 3, rew: [['balas', 8]], xp: 60, minNight: 4 },
  { t: 'Recoletor', d: 'Apanha 10 bagas.', ev: 'get', k: 'bagas', n: 10, rew: [['estufado', 1]], xp: 25 },
  { t: 'Mineiro', d: 'Mina 6 de minério de ferro.', ev: 'get', k: 'minerio_ferro', n: 6, rew: [['carvao', 3]], xp: 40, minNight: 3 },
];

export function questTotal(stats, q) {
  const keys = q.k == null ? ['*'] : Array.isArray(q.k) ? q.k : [q.k];
  let n = 0; for (const k of keys) n += stats[q.ev + ':' + k] || 0;
  return n;
}
