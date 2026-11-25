// Flow field (Dijkstra multi-fonte) numa janela à volta de cada jogador.
// Blocos construídos são "atravessáveis" com custo proporcional à vida: assim os zombies
// escolhem naturalmente o ponto mais fraco do perímetro de uma base fechada.
import { OBJECTS, TERRAIN } from '../shared/constants.js';

export const FF_SIZE = 128;
const INF = 0x3fffffff;

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v; const top = v[0];
    const lk = k.pop(), lv = v.pop(); const n = k.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        let l = 2 * i + 1; if (l >= n) break; const r = l + 1;
        if (r < n && k[r] < k[l]) l = r;
        if (k[l] >= lk) break;
        k[i] = k[l]; v[i] = v[l]; i = l;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
  topKey() { return this.k[0]; }
}

export class FlowField {
  constructor() {
    this.ox = 0; this.oy = 0;
    this.dist = new Int32Array(FF_SIZE * FF_SIZE);
    this.cost = new Int32Array(FF_SIZE * FF_SIZE);
  }
  // dig = true → campo para Escavadores (passam por baixo de madeira e pedra)
  build(world, cx, cy, sources, dig) {
    const S = FF_SIZE;
    this.ox = Math.floor(cx) - (S >> 1); this.oy = Math.floor(cy) - (S >> 1);
    const dist = this.dist, cost = this.cost;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wx = this.ox + x, wy = this.oy + y, i = y * S + x;
      const t = world.getT(wx, wy);
      let c;
      if (TERRAIN[t].solid) c = -1;
      else {
        const o = OBJECTS[world.getO(wx, wy)];
        if (o.solid) {
          if (!o.built) c = -1;
          else if (dig && !o.noDig) c = 20;
          else c = 10 + Math.round(world.getH(wx, wy) * 10 / 18);
        } else c = TERRAIN[t].slow ? 16 : 10;
        if (o.trap) c += 12;
      }
      cost[i] = c; dist[i] = INF;
    }
    const h = new Heap();
    for (const s of sources) {
      const x = Math.floor(s.x) - this.ox, y = Math.floor(s.y) - this.oy;
      if (x < 0 || y < 0 || x >= S || y >= S) continue;
      const i = y * S + x; dist[i] = 0; h.push(0, i);
    }
    while (h.size) {
      const d = h.topKey(); const i = h.pop();
      if (d > dist[i]) continue;
      const x = i % S, y = (i / S) | 0;
      for (let k = 0; k < 8; k++) {
        const dx = DX[k], dy = DY[k];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        const j = ny * S + nx; const c = cost[j];
        if (c < 0) continue;
        let step = c;
        if (dx && dy) {
          // diagonal só se os dois ortogonais forem livres
          const a = cost[y * S + nx], b = cost[ny * S + x];
          if (a !== 10 && a !== 16 || b !== 10 && b !== 16) continue;
          step = Math.round(c * 1.414);
        }
        const nd = d + step;
        if (nd < dist[j]) { dist[j] = nd; h.push(nd, j); }
      }
    }
  }
  // devolve a célula vizinha com menor distância (coordenadas do mundo) ou null
  next(wx, wy) {
    const S = FF_SIZE; const x = wx - this.ox, y = wy - this.oy;
    if (x < 1 || y < 1 || x >= S - 1 || y >= S - 1) return null;
    const i = y * S + x; let best = this.dist[i], bx = -1, by = -1;
    if (best >= INF) return null;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      const j = ny * S + nx; const d = this.dist[j];
      if (d < best) {
        if (DX[k] && DY[k]) { const a = this.cost[y * S + nx], b = this.cost[ny * S + x]; if (a !== 10 && a !== 16 || b !== 10 && b !== 16) continue; }
        best = d; bx = nx; by = ny;
      }
    }
    if (bx < 0) return null;
    return { x: bx + this.ox, y: by + this.oy };
  }
}
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
