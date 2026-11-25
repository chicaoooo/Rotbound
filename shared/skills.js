// Árvores de habilidades (secção 11.2). Cada habilidade tem até 3 níveis.
export const TREES = ['Combate', 'Sobrevivência', 'Engenharia', 'Apoio'];
export const SKILLS = {
  maos_firmes: { tree: 'Combate', name: 'Mãos Firmes', desc: '+10 % de dano corpo-a-corpo' },
  recarga: { tree: 'Combate', name: 'Recarga Rápida', desc: '−15 % de tempo de recarga' },
  pontaria: { tree: 'Combate', name: 'Pontaria', desc: '−20 % de dispersão das armas de fogo' },
  furia: { tree: 'Combate', name: 'Fúria', desc: 'Cada morte recupera 5 de estamina' },
  execucao: { tree: 'Combate', name: 'Execução', desc: '+10 % de chance de crítico' },
  estomago: { tree: 'Sobrevivência', name: 'Estômago de Ferro', desc: 'A fome desce 15 % mais devagar' },
  folego: { tree: 'Sobrevivência', name: 'Fôlego', desc: '+20 de estamina máxima' },
  sangue_forte: { tree: 'Sobrevivência', name: 'Sangue Forte', desc: 'A infeção sobe 15 % mais devagar' },
  recoletor: { tree: 'Sobrevivência', name: 'Recoletor', desc: '25 % de chance de recurso extra' },
  furtivo: { tree: 'Sobrevivência', name: 'Furtivo', desc: 'Os zombies detetam-te a −15 % de distância' },
  construtor: { tree: 'Engenharia', name: 'Construtor', desc: '+25 % de vida das paredes' },
  reparador: { tree: 'Engenharia', name: 'Reparador', desc: 'Reparar custa −20 % de materiais' },
  armadilheiro: { tree: 'Engenharia', name: 'Armadilheiro', desc: '+25 % de dano das armadilhas' },
  eficiencia: { tree: 'Engenharia', name: 'Eficiência', desc: '10 % de chance de não gastar ingredientes' },
  tecnico: { tree: 'Engenharia', name: 'Técnico', desc: 'Torres disparam 15 % mais depressa' },
  socorrista: { tree: 'Apoio', name: 'Socorrista', desc: 'Reanimar companheiros demora −25 % de tempo' },
  curandeiro: { tree: 'Apoio', name: 'Curandeiro', desc: 'Curas num companheiro curam +30 %' },
  moral: { tree: 'Apoio', name: 'Moral', desc: 'Companheiros a menos de 8 blocos recuperam estamina 10 % mais depressa' },
  logistica: { tree: 'Apoio', name: 'Logística', desc: 'Munição e comida que dás (G) rendem +1 por cada 5' },
  grito: { tree: 'Apoio', name: 'Grito de Guerra', desc: 'Tecla V, 1×/noite: aliados próximos +15 % de dano durante 10 s' },
};
