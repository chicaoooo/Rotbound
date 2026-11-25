# Rotbound — Preso à Podridão (v0.1)

Sobrevivência cooperativa top-down com zombies, construção e crafting, para 1 a 4 jogadores em LAN.
Feito em JavaScript com **Phaser 3** (ecrã) e **Electron** (app de PC + rede local), como pede o documento de design.

## Como jogar

Precisas do [Node.js](https://nodejs.org) 20 ou mais recente.

```bash
npm install
npm start            # abre a app (Jogar a solo / Criar jogo / Entrar em jogo)
```

Outras formas:

| Comando | O que faz |
|---|---|
| `npm run server -- --nome "O nosso mundo" --pass segredo` | Anfitrião sem janela (terminal). Joga-se no navegador em `http://IP:7777` |
| `npm run dev` | O mesmo e abre o navegador |
| `npm run dev:4 -- 3` | Abre 3 janelas do jogo ligadas a um anfitrião local (testes de multijogador) |
| `ROTBOUND_LAG=120 npm run dev:4` | Igual, a simular 120 ms de atraso de rede |
| `npm test` | Teste sem ecrã: 2 clientes ligam-se, andam, fazem noite e crafting |
| `npm run dist` | Cria o instalador (Windows/Linux/macOS) com electron-builder |

Opções do servidor: `--nome`, `--seed`, `--pass`, `--porta` (7777), `--max` (4), `--fogo-amigo`, `--hardcore`, `--sem-lan`, `--sem-gravar`, `--saves <pasta>`.

### LAN
- **Criar jogo**: és o anfitrião; o mundo corre e grava no teu computador. O teu IP aparece no menu de pausa (Esc).
- **Entrar em jogo**: a lista mostra os jogos da rede local (broadcast UDP na porta 7778). Se não aparecer nada, escreve o IP.
- Amigos sem a app podem entrar pelo navegador: `http://IP-do-anfitrião:7777`.
- Não é preciso abrir portas no router. Na primeira vez o Windows pode pedir autorização à firewall: aceita para redes privadas.

### Controlos
WASD mover · Shift correr · Espaço esquivar · Rato apontar · Clique esq. atacar/usar/comer · Clique dir. colocar bloco · E interagir (manter = reanimar) · R recarregar · 1–8 / roda barra rápida · B construção · Tab inventário/crafting/habilidades · M mapa · Q largar · G dar a um companheiro · Enter chat · botão do meio ping · Z/X/C emotes · V Grito de Guerra · J missões · Ctrl + roda (ou +/−) zoom · F11 ecrã inteiro.

Comandos de teste (chat, só o anfitrião): `/noite [n]`, `/dia`, `/dar item n`, `/tp x y`, `/centro`, `/zombie tipo n`, `/xp n`, `/guardar`, `/ajuda`.

## O que está feito (por secção do documento)

- **2. Multijogador** — anfitrião autoritário (WebSocket `ws` no Electron), clientes só enviam inputs numerados; previsão local do movimento com correção e repetição dos inputs; outros jogadores e zombies interpolados; zombies enviados em lote binário 10×/s; procura de jogos por UDP; IP manual; palavra-passe; entrar/sair a qualquer momento; personagem guardada por nome; aparece junto à cama de um companheiro; caído 30 s e reanimação com E (4 s); XP partilhada num raio de 30; saque do chefe para cada jogador; chat, pings, emotes; baús partilhados e cadeados; fogo amigo opcional; equilíbrio por número de jogadores (zombies ×(1+0,6(n−1)), limite 200→320, vida do chefe, recursos voltam a crescer mais depressa).
- **3. Dia e noite** — 18 min (1+10+1+6), aviso no crepúsculo, hordas fora da luz (≥20 blocos), Lua de Sangue de 7 em 7, chefe na noite 21, escala de vida/velocidade por noite, dormir salta a noite se todos estiverem deitados.
- **4–5. Jogador e combate** — vida, fome, estamina, infeção (visão turva acima de 50, transformação a 100); arcos de ataque, knockback, atordoamento, críticos; armas de distância com dispersão, ruído, recarga e munição; molotov; durabilidade e reparação.
- **6. Zombies** — Errante, Corredor, Brutamontes, Cuspidor, Explosivo, Escavador e Rei da Podridão (invoca, espalha Podridão, fase de raiva); elites a partir da noite 15; flow field (Dijkstra) que escolhe o ponto mais fraco da base.
- **Estruturas** — plantas desenhadas com várias divisões e portas interiores, rodadas e espelhadas ao acaso: casas com quintal, casas grandes, quintas com celeiro e cultivos, postos de gasolina, hospitais, bibliotecas, oficinas, bunkers de betão, acampamentos militares, cabanas e cabanas de mineiro.
- **7–8. Mapa e recursos** — 2048×2048 blocos em chunks de 32, gerado por seed (altitude, humidade, distância à cratera); floresta, planície, montanhas, pântano, cidade, cratera; casas, hospitais, postos, bunkers, quintas e cabanas com saque; notas de sobreviventes; animais; minimapa e mapa com marcadores.
- **Livros e receitas** — quase todas as receitas das bancadas começam bloqueadas; os livros (Carpintaria, Metalurgia, Manual de Armas, Química) estão nas estantes de casas, quintas, cabanas, oficinas, bibliotecas, hospitais e bunkers. Cada livro ensina uma receita a todo o grupo. A bancada seguinte só se pode fazer depois de aprender todas as receitas da atual.
- **Missões** — canto superior direito (J esconde): 25 missões principais em cadeia, do primeiro machado até purificar o Coração, e 2 missões diárias que mudam a cada amanhecer. São do grupo: recompensas para todos.
- **Conquistas** — separador Conquistas (Tab): 36 conquistas do grupo em 5 categorias, com progresso e aviso quando se desbloqueiam.
- **9–10. Crafting e construção** — todas as receitas das 5 estações + fogueira (em `shared/data/recipes.json`), modo de construção com pré-visualização, recolher blocos, martelo, armadilhas, minas, torres automáticas (balas de um baú encostado), geradores, holofotes, luz real à noite.
- **11. Progressão** — XP, níveis e as 20 habilidades das 4 árvores.
- **12. Podridão e vitória** — a Podridão cresce todas as noites, infeta, apodrece paredes; Purificador limpa 30 blocos; levá-lo ao Coração da Podridão inicia o cerco final de 3 min → vitória e modo livre.
- **13. Morte e gravação** — mochila no local da morte (marcada no mapa), renascer na cama, Hardcore; gravação automática ao amanhecer e ao sair (seed + chunks alterados, em JSON).

## Ainda não feito (próximas fases)
- Cavernas (segunda profundidade) e entradas de mina.
- Janela de troca entre jogadores (por agora: largar itens com Q ou dar com G).
- Arte e sons finais: tudo é desenhado e sintetizado por código.
- O mapa revelado não fica gravado entre sessões.
- Estruturas desenhadas no Tiled (por agora são geradas por código).
- Online pela internet, servidor dedicado e chat de voz (fora do âmbito, secção 2).

## Estrutura
```
shared/   regras partilhadas: constantes, mundo/geração, colisões, itens e receitas (JSON), habilidades
server/   simulação do anfitrião (game.js), flow field, rede (server.js), LAN (discovery.js), servidor de terminal (cli.js)
client/   Phaser: cena, pixel art gerada, HUD, sons, menus (index.html / main.js)
electron/ janela da app, anfitrião e procura de jogos na LAN
tools/    testes (test-net.js) e dev:4
```

## Fazer o .exe (Windows)
Num PC com Windows e Node.js instalado, dentro da pasta do projeto:
```bash
npm install
npm run exe          # dist/Rotbound-0.1.0-portatil.exe  (um só ficheiro, não instala nada)
npm run instalador   # dist/Rotbound Setup 0.1.0.exe       (instalador com atalhos)
```
