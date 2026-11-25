// Desbloqueio de receitas por livros. As receitas das Mãos e da Fogueira, e as marcadas "base",
// estão sempre disponíveis. A receita que constrói a estação seguinte (ex.: Forja na Bancada)
// só abre quando o grupo já aprendeu todas as outras receitas dessa estação.
export const STATION_IDS = new Set(['bancada', 'forja', 'bancada_armas', 'laboratorio']);
export const BOOK_FOR = { bancada: 'livro_carpintaria', forja: 'livro_metalurgia', bancada_armas: 'livro_armas', laboratorio: 'livro_quimica' };

export const alwaysOn = (r) => r.st === 'maos' || r.st === 'fogueira' || !!r.base;
export const isGate = (r) => r.st !== 'maos' && STATION_IDS.has(r.out);
export const learnable = (recipes, st) => recipes.filter(r => r.st === st && !alwaysOn(r) && !isGate(r));

// estado de uma receita: { ok, gate, have, need, book }
export function recipeState(r, unlocked, recipes) {
  if (alwaysOn(r)) return { ok: true };
  if (isGate(r)) {
    const l = learnable(recipes, r.st); const have = l.filter(x => unlocked.has(x.id)).length;
    return { ok: have >= l.length, gate: true, have, need: l.length };
  }
  return { ok: unlocked.has(r.id), book: BOOK_FOR[r.st] };
}
