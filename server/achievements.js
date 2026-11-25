// Conquistas do grupo. Usam os mesmos contadores de eventos que as missões (ev:k).
export const ACHIEVEMENTS = [
  // Sobrevivência
  { id: 'noite1', cat: 'Sobrevivência', t: 'Ainda cá estou', d: 'Sobrevive à primeira noite.', ev: 'nightn', n: 1, icon: 'tocha' },
  { id: 'noite7', cat: 'Sobrevivência', t: 'Lua de Sangue', d: 'Sobrevive até à noite 7.', ev: 'nightn', n: 7, icon: 'ligadura' },
  { id: 'noite14', cat: 'Sobrevivência', t: 'Duas luas', d: 'Sobrevive até à noite 14.', ev: 'nightn', n: 14, icon: 'kit_medico' },
  { id: 'noite30', cat: 'Sobrevivência', t: 'Veterano', d: 'Sobrevive até à noite 30.', ev: 'nightn', n: 30, icon: 'armadura_ferro' },
  { id: 'morte', cat: 'Sobrevivência', t: 'Não foi desta', d: 'Morre pela primeira vez.', ev: 'die', n: 1, icon: 'carne_podre' },
  { id: 'reanimar', cat: 'Sobrevivência', t: 'Anjo da guarda', d: 'Reanima companheiros 5 vezes.', ev: 'revive', n: 5, icon: 'kit_medico' },
  { id: 'cozinheiro', cat: 'Sobrevivência', t: 'Chef do apocalipse', d: 'Cozinha 25 refeições.', ev: 'craft', k: ['carne_cozinhada', 'bagas_assadas', 'estufado', 'cha_ervas'], n: 25, icon: 'estufado' },
  { id: 'cacador', cat: 'Sobrevivência', t: 'Caçador', d: 'Caça 25 animais.', ev: 'hunt', n: 25, icon: 'carne_crua' },
  // Combate
  { id: 'kill1', cat: 'Combate', t: 'Primeiro sangue', d: 'Mata o teu primeiro zombie.', ev: 'kill', n: 1, icon: 'lanca' },
  { id: 'kill100', cat: 'Combate', t: 'Limpa-terrenos', d: 'Mata 100 zombies.', ev: 'kill', n: 100, icon: 'taco' },
  { id: 'kill500', cat: 'Combate', t: 'Exterminador', d: 'Mata 500 zombies.', ev: 'kill', n: 500, icon: 'catana' },
  { id: 'kill2000', cat: 'Combate', t: 'Massacre', d: 'Mata 2000 zombies.', ev: 'kill', n: 2000, icon: 'espingarda' },
  { id: 'bruto', cat: 'Combate', t: 'Quanto maior…', d: 'Mata um Brutamontes.', ev: 'kill', k: 'brutamontes', n: 1, icon: 'machado_ferro' },
  { id: 'corredores', cat: 'Combate', t: 'Mais rápido que eles', d: 'Mata 50 Corredores.', ev: 'kill', k: 'corredor', n: 50, icon: 'arco' },
  { id: 'explosivos', cat: 'Combate', t: 'Desminagem', d: 'Mata 15 Explosivos.', ev: 'kill', k: 'explosivo', n: 15, icon: 'mina' },
  { id: 'escavadores', cat: 'Combate', t: 'Debaixo dos pés', d: 'Mata 15 Escavadores.', ev: 'kill', k: 'escavador', n: 15, icon: 'picareta_ferro' },
  { id: 'rei', cat: 'Combate', t: 'Regicida', d: 'Derrota o Rei da Podridão.', ev: 'kill', k: 'rei', n: 1, icon: 'coracao_negro' },
  // Construção
  { id: 'bancada', cat: 'Construção', t: 'Mãos à obra', d: 'Coloca uma Bancada de Trabalho.', ev: 'place', k: 'bancada', n: 1, icon: 'bancada' },
  { id: 'blocos100', cat: 'Construção', t: 'Arquiteto', d: 'Coloca 100 blocos.', ev: 'place', n: 100, icon: 'parede_madeira' },
  { id: 'blocos500', cat: 'Construção', t: 'Mestre de obras', d: 'Coloca 500 blocos.', ev: 'place', n: 500, icon: 'parede_pedra' },
  { id: 'metal', cat: 'Construção', t: 'Fortaleza de aço', d: 'Coloca 50 paredes de metal.', ev: 'place', k: 'parede_metal', n: 50, icon: 'parede_metal' },
  { id: 'tochas', cat: 'Construção', t: 'Que se faça luz', d: 'Coloca 20 tochas.', ev: 'place', k: 'tocha', n: 20, icon: 'tocha' },
  { id: 'torre', cat: 'Construção', t: 'Sentinela', d: 'Coloca uma Torre automática.', ev: 'place', k: 'torre', n: 1, icon: 'torre' },
  { id: 'reparar', cat: 'Construção', t: 'Manutenção em dia', d: 'Repara 50 blocos com o martelo.', ev: 'repair', n: 50, icon: 'martelo' },
  { id: 'artesao', cat: 'Construção', t: 'Artesão', d: 'Cria 200 itens.', ev: 'craft', n: 200, icon: 'corda' },
  // Exploração
  { id: 'lenha', cat: 'Exploração', t: 'Lenhador', d: 'Recolhe 500 de madeira.', ev: 'get', k: 'madeira', n: 500, icon: 'madeira' },
  { id: 'ferro', cat: 'Exploração', t: 'Mineiro', d: 'Recolhe 200 de minério de ferro.', ev: 'get', k: 'minerio_ferro', n: 200, icon: 'minerio_ferro' },
  { id: 'cristais', cat: 'Exploração', t: 'Brilho podre', d: 'Recolhe 25 Cristais da Podridão.', ev: 'get', k: 'cristal', n: 25, icon: 'cristal' },
  { id: 'saque', cat: 'Exploração', t: 'Saqueador', d: 'Abre 50 caixotes, estantes ou armários.', ev: 'loot', n: 50, icon: 'mochila' },
  { id: 'cratera', cat: 'Exploração', t: 'O coração das trevas', d: 'Chega à Cratera da Podridão.', ev: 'visit', k: 'cratera', n: 1, icon: 'cristal' },
  // Progresso
  { id: 'livros10', cat: 'Progresso', t: 'Rato de biblioteca', d: 'Lê 10 livros.', ev: 'read', n: 10, icon: 'livro_carpintaria' },
  { id: 'livrostodos', cat: 'Progresso', t: 'Enciclopédia', d: 'Aprende todas as receitas de todas as bancadas.', ev: 'unlock', k: ['bancada', 'forja', 'bancada_armas', 'laboratorio'], n: 4, icon: 'livro_quimica' },
  { id: 'missoes10', cat: 'Progresso', t: 'Cumpridor', d: 'Cumpre 10 missões principais.', ev: 'quest', n: 10, icon: 'cadeado' },
  { id: 'diarias20', cat: 'Progresso', t: 'Rotina', d: 'Cumpre 20 missões diárias.', ev: 'daily', n: 20, icon: 'bagas' },
  { id: 'laboratorio', cat: 'Progresso', t: 'Cientista', d: 'Coloca um Laboratório.', ev: 'place', k: 'laboratorio', n: 1, icon: 'laboratorio' },
  { id: 'vitoria', cat: 'Progresso', t: 'Terra limpa', d: 'Purifica o Coração da Podridão.', ev: 'win', n: 1, icon: 'purificador' },
];
