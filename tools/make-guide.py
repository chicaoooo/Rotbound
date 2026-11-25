# Gera o guia do jogo em PDF a partir dos dados atuais do Rotbound.
import json, os, re
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
                                Image, PageBreak, KeepTogether, NextPageTemplate, CondPageBreak)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = '/tmp/guia'
OUT = os.path.join(ROOT, 'Rotbound_Guia_do_Jogo.pdf')

F = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('DV', F + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DVB', F + 'DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DVI', F + 'DejaVuSans-Oblique.ttf'))
pdfmetrics.registerFont(TTFont('DVM', F + 'DejaVuSansMono.ttf'))
pdfmetrics.registerFontFamily('DV', normal='DV', bold='DVB', italic='DVI', boldItalic='DVB')

RUST = colors.HexColor('#b85a22'); DARK = colors.HexColor('#1c1a14'); INK = colors.HexColor('#24211b')
TOX = colors.HexColor('#5f8a1e'); MUTED = colors.HexColor('#6b6452'); PAPER = colors.HexColor('#f6f2e8'); LINE = colors.HexColor('#d8cfbc')

items = json.load(open(os.path.join(ROOT, 'shared/data/items.json')))
recipes = json.load(open(os.path.join(ROOT, 'shared/data/recipes.json')))
skills_src = open(os.path.join(ROOT, 'shared/skills.js')).read()
SKILLS = re.findall(r"(\w+): \{ tree: '([^']+)', name: '([^']+)', desc: '([^']+)' \}", skills_src)
const_src = open(os.path.join(ROOT, 'shared/constants.js')).read()
ZT = re.findall(r"(\w+): \{ id: \d+, name: '([^']+)', hp: (\d+), speed: ([\d.]+), dmg: (\d+).*?night: (\d+)", const_src)
quests_src = open(os.path.join(ROOT, 'server/quests.js')).read()
MAIN_Q = re.findall(r"\{ t: '([^']+)', d: '([^']+)', ev:", quests_src.split('export const DAILY')[0])
ach_src = open(os.path.join(ROOT, 'server/achievements.js')).read()
ACH = re.findall(r"cat: '([^']+)', t: '([^']+)', d: '([^']+)'", ach_src)

# ---------- estilos ----------
S = {}
S['body'] = ParagraphStyle('body', fontName='DV', fontSize=10, leading=14.5, textColor=INK, spaceAfter=6)
S['small'] = ParagraphStyle('small', parent=S['body'], fontSize=8.5, leading=11.5, textColor=MUTED)
S['h1'] = ParagraphStyle('h1', fontName='DVB', fontSize=20, leading=24, textColor=DARK, spaceBefore=4, spaceAfter=10)
S['h2'] = ParagraphStyle('h2', fontName='DVB', fontSize=13, leading=17, textColor=RUST, spaceBefore=10, spaceAfter=5)
S['bul'] = ParagraphStyle('bul', parent=S['body'], leftIndent=14, bulletIndent=3, spaceAfter=3)
S['cell'] = ParagraphStyle('cell', fontName='DV', fontSize=8.5, leading=11, textColor=INK)
S['cellb'] = ParagraphStyle('cellb', parent=S['cell'], fontName='DVB')
S['head'] = ParagraphStyle('head', parent=S['cell'], fontName='DVB', textColor=colors.white)
S['cap'] = ParagraphStyle('cap', parent=S['small'], alignment=TA_CENTER, fontName='DVI', spaceBefore=3, spaceAfter=10)
S['tip'] = ParagraphStyle('tip', parent=S['body'], fontSize=9.5, leading=13.5, textColor=colors.HexColor('#3a2a10'))

def P(t, s='body'): return Paragraph(t, S[s])
def H1(t): return Paragraph(t, S['h1'])
def H2(t): return Paragraph(t, S['h2'])
def bullets(lst): return [Paragraph(x, S['bul'], bulletText='•') for x in lst]

def table(rows, widths, head=True, zebra=True):
    data = [[c if not isinstance(c, str) else Paragraph(c, S['head'] if (head and i == 0) else S['cell']) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if head else 0)
    st = [('VALIGN', (0, 0), (-1, -1), 'TOP'), ('GRID', (0, 0), (-1, -1), 0.4, LINE),
          ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 5), ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]
    if head: st += [('BACKGROUND', (0, 0), (-1, 0), DARK)]
    if zebra:
        for i in range(1 if head else 0, len(rows)):
            if i % 2 == 0: st.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#efe9dc')))
    t.setStyle(TableStyle(st)); return t

def tipbox(text, title='Dica'):
    t = Table([[Paragraph(f'<b>{title}.</b> {text}', S['tip'])]], colWidths=[170 * mm])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f3e3c8')), ('LINEBEFORE', (0, 0), (0, -1), 3, RUST),
                           ('LEFTPADDING', (0, 0), (-1, -1), 9), ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
    return t

def shot(name, caption, w=170 * mm, crop=None):
    path = os.path.join(SHOTS, name)
    if not os.path.exists(path): return Spacer(1, 1)
    from PIL import Image as PI
    im = PI.open(path)
    if crop:
        im = im.crop(crop); path = os.path.join(SHOTS, 'crop_' + name); im.save(path)
    iw, ih = im.size; h = w * ih / iw
    img = Image(path, width=w, height=h)
    return KeepTogether([img, P(caption, 'cap')])

# ---------- páginas ----------
def cover(c, doc):
    W, H = A4
    c.setFillColor(colors.HexColor('#0f0e0a')); c.rect(0, 0, W, H, fill=1, stroke=0)
    bg = os.path.join(SHOTS, 'noite.png')
    if os.path.exists(bg):
        from PIL import Image as PI
        im = PI.open(bg).crop((330, 110, 1036, 690)); cp = os.path.join(SHOTS, 'cover_bg.png'); im.save(cp)
        iw, ih = im.size; h = H; w = h * iw / ih
        c.drawImage(cp, W / 2 - w / 2, 0, width=w, height=h)
        c.setFillColor(colors.Color(0.05, 0.045, 0.03, alpha=0.6)); c.rect(0, 0, W, H, fill=1, stroke=0)
        c.setFillColor(colors.Color(0.05, 0.045, 0.03, alpha=0.75)); c.rect(0, H - 190 * mm, W, 85 * mm, fill=1, stroke=0)
    icon = os.path.join(ROOT, 'build/icon.png')
    if os.path.exists(icon): c.drawImage(icon, W / 2 - 22 * mm, H - 95 * mm, 44 * mm, 44 * mm, mask='auto')
    c.setFillColor(colors.HexColor('#ddd3bb')); c.setFont('DVB', 46)
    tw = c.stringWidth('ROTBOUND', 'DVB', 46); x = W / 2 - tw / 2
    c.setFillColor(colors.HexColor('#8fb83a')); c.drawString(x, H - 120 * mm, 'ROT')
    c.setFillColor(colors.HexColor('#ddd3bb')); c.drawString(x + c.stringWidth('ROT', 'DVB', 46), H - 120 * mm, 'BOUND')
    c.setFillColor(colors.HexColor('#e09a3c')); c.setFont('DVB', 13)
    c.drawCentredString(W / 2, H - 131 * mm, 'P R E S O   À   P O D R I D Ã O')
    c.setFillColor(colors.HexColor('#ece4d0')); c.setFont('DVB', 22); c.drawCentredString(W / 2, H - 160 * mm, 'Guia do Jogo')
    c.setFont('DV', 11); c.setFillColor(colors.HexColor('#bdb49c'))
    c.drawCentredString(W / 2, H - 170 * mm, 'Sobrevivência cooperativa top-down · 1 a 4 jogadores em LAN')
    c.setFont('DVI', 10); c.drawCentredString(W / 2, H - 178 * mm, 'De dia preparas-te. À noite aguentas.')
    c.setFont('DV', 9); c.setFillColor(colors.HexColor('#8a8270'))
    c.drawCentredString(W / 2, 18 * mm, 'Versão 0.1 · Novembro de 2026')

def page(c, doc):
    W, H = A4
    c.setFillColor(PAPER); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(DARK); c.rect(0, H - 13 * mm, W, 13 * mm, fill=1, stroke=0)
    c.setFillColor(RUST); c.rect(0, H - 13.8 * mm, W, 0.8 * mm, fill=1, stroke=0)
    c.setFont('DVB', 9); c.setFillColor(colors.HexColor('#8fb83a')); c.drawString(20 * mm, H - 8.5 * mm, 'ROT')
    c.setFillColor(colors.HexColor('#ddd3bb')); c.drawString(20 * mm + c.stringWidth('ROT', 'DVB', 9), H - 8.5 * mm, 'BOUND')
    c.setFont('DV', 8.5); c.setFillColor(colors.HexColor('#bdb49c')); c.drawRightString(W - 20 * mm, H - 8.5 * mm, 'Guia do Jogo')
    c.setFillColor(MUTED); c.setFont('DV', 8.5); c.drawCentredString(W / 2, 10 * mm, str(doc.page - 1))

doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=22 * mm, bottomMargin=18 * mm,
                      title='Rotbound — Guia do Jogo', author='Rotbound', subject='Guia do jogo Rotbound v0.1')
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
doc.addPageTemplates([PageTemplate('cover', frames=[frame], onPage=cover), PageTemplate('page', frames=[frame], onPage=page)])

st = [NextPageTemplate('page'), PageBreak()]

# ---------- Índice ----------
st += [H1('Índice')]
toc = ['O que é o Rotbound', 'Instalar e começar a jogar', 'Controlos', 'O ecrã de jogo', 'O dia e a noite', 'O teu sobrevivente',
       'Primeiros passos', 'Crafting, bancadas e livros', 'Construção e defesa', 'Combate e armas', 'Os zombies',
       'O mapa, os biomas e as estruturas', 'A Podridão', 'Missões e conquistas', 'Habilidades', 'Jogar com amigos',
       'Morte e gravação', 'O objetivo final', 'Dicas de sobrevivência']
st += [table([[f'{i + 1}.', t] for i, t in enumerate(toc)], [12 * mm, 158 * mm], head=False)]
st += [PageBreak()]

# ---------- 1 ----------
st += [H1('1. O que é o Rotbound')]
st += [P('O <b>Rotbound</b> é um jogo de sobrevivência visto de cima. Estás preso num mundo infetado por uma <b>Podridão</b> que transforma pessoas em zombies e corrompe a própria terra. '
         'De dia exploras, recolhes recursos, crias ferramentas e constróis a tua base. À noite defendes-te de hordas cada vez maiores.')]
st += [P('O jogo pode ser jogado a solo ou com até 4 amigos na mesma rede (LAN). O mundo é enorme — 2048 × 2048 blocos — e é gerado a partir de uma <i>seed</i>, por isso cada mundo é diferente.')]
st += [H2('Os pilares do jogo')]
st += bullets(['<b>O dia prepara a noite.</b> Tudo o que recolhes e constróis de dia serve para aguentares a noite seguinte.',
               '<b>O mundo é teu para partir e construir.</b> Quase tudo pode ser partido e cada recurso tem utilidade.',
               '<b>Combate com peso.</b> Os golpes empurram, os zombies piscam, o ecrã treme.',
               '<b>A ameaça cresce.</b> As noites ficam mais difíceis e a Podridão espalha-se se não fizeres nada.',
               '<b>Melhor com amigos.</b> Tudo funciona a solo, mas o jogo é pensado para dividir tarefas.'])
st += [Spacer(1, 6), shot('hud.png', 'O início de um mundo: uma clareira na floresta, perto da borda do mapa.')]
st += [PageBreak()]

# ---------- 2 ----------
st += [H1('2. Instalar e começar a jogar')]
st += [H2('Com o ficheiro .exe (Windows)')]
st += bullets(['<b>Rotbound-0.1.0-portatil.exe</b> — abre diretamente, sem instalar nada.',
               '<b>Rotbound Setup 0.1.0.exe</b> — instalador com atalho no ambiente de trabalho e no menu Iniciar.',
               'Na primeira vez, o Windows pode mostrar «O Windows protegeu o seu PC»: clica em «Mais informações» → «Executar mesmo assim».'])
st += [H2('A partir do código (Node.js)')]
st += [table([['Comando', 'O que faz'],
              ['<font name="DVM">npm install</font>', 'Instala o que o jogo precisa (só na primeira vez).'],
              ['<font name="DVM">npm start</font>', 'Abre o jogo.'],
              ['<font name="DVM">npm run exe</font>', 'Cria o .exe portátil na pasta dist.'],
              ['<font name="DVM">npm run instalador</font>', 'Cria o instalador na pasta dist.'],
              ['<font name="DVM">npm run server</font>', 'Anfitrião sem janela; joga-se no navegador em http://IP:7777.']], [45 * mm, 125 * mm])]
st += [Spacer(1, 6), tipbox('Para criar o .exe ou o instalador, abre a Linha de Comandos <b>como administrador</b> (ou ativa o Modo de programador do Windows).', 'Importante')]
st += [H2('O menu principal')]
st += bullets(['<b>Jogar a solo</b> — um mundo só teu, sem rede.', '<b>Criar jogo (LAN)</b> — és o anfitrião; até 4 jogadores.',
               '<b>Entrar em jogo</b> — mostra os jogos da rede local ou permite escrever o IP do anfitrião.',
               'Ao criar um mundo escolhes o nome, a seed (opcional), fogo amigo e modo Hardcore. Os mundos gravados aparecem na lista para continuar.'])
st += [shot('menu.png', 'O menu principal.', w=140 * mm)]
st += [PageBreak()]

# ---------- 3 ----------
st += [H1('3. Controlos')]
K = lambda k: f'<font name="DVM"><b>{k}</b></font>'
st += [table([['Tecla', 'Ação', 'Tecla', 'Ação'],
              [K('W A S D'), 'Mover', K('Shift'), 'Correr (gasta estamina)'],
              [K('Rato'), 'Apontar', K('Espaço'), 'Esquivar (rolar)'],
              [K('Clique esquerdo'), 'Atacar · usar ferramenta · comer · ler', K('R'), 'Recarregar'],
              [K('Clique direito'), 'Colocar bloco', K('E'), 'Interagir (abrir, apanhar, dormir) · manter para reanimar'],
              [K('1 – 8 / roda'), 'Barra rápida', K('B'), 'Modo de construção'],
              [K('Ctrl + roda'), 'Zoom', K('+ / −'), 'Zoom pelo teclado'],
              [K('Tab'), 'Inventário, crafting, habilidades, conquistas', K('M'), 'Mapa'],
              [K('J'), 'Mostrar/esconder missões', K('Q'), 'Largar item (Shift+Q: a pilha toda)'],
              [K('G'), 'Dar item a um companheiro', K('Enter'), 'Chat'],
              [K('Botão do meio'), 'Ping no mundo', K('Z / X / C'), '«Ajuda!» / «Aqui!» / «Preciso de munição»'],
              [K('V'), 'Grito de Guerra (habilidade)', K('Esc'), 'Menu de pausa (o mundo continua)'],
              [K('F11'), 'Ecrã inteiro', '', '']], [30 * mm, 55 * mm, 28 * mm, 57 * mm])]
st += [Spacer(1, 8), H2('No inventário')]
st += bullets(['Clica num item para o pegar e clica noutro espaço para o largar.', '<b>Shift + clique</b> move rápido (entre a barra rápida, o inventário e um baú aberto).',
               '<b>Clique direito</b> pega metade de uma pilha.', 'Passa o rato por cima de um item para veres os detalhes.'])
st += [H2('Comandos de teste do anfitrião (chat)')]
st += [P('<font name="DVM">/noite [n]</font>, <font name="DVM">/dia</font>, <font name="DVM">/dar item n</font>, <font name="DVM">/tp x y</font>, <font name="DVM">/centro</font>, '
         '<font name="DVM">/zombie tipo n</font>, <font name="DVM">/xp n</font>, <font name="DVM">/guardar</font>, <font name="DVM">/ajuda</font>.', 'small')]
st += [PageBreak()]

# ---------- 4 ----------
st += [H1('4. O ecrã de jogo')]
st += [shot('noite.png', 'Uma noite junto à fogueira: luz das tochas, cone da lanterna e zombies a aproximar-se.')]
st += [table([['Zona do ecrã', 'O que mostra'],
              ['Canto superior esquerdo', 'Minimapa e, por baixo, o nome e a vida de cada companheiro.'],
              ['Canto superior direito', 'Relógio do dia (fase, número do dia/noite, tempo que falta), aviso de Lua de Sangue e o painel de missões.'],
              ['Canto inferior esquerdo', 'Barras de Vida, Fome, Estamina e Infeção; chat por cima.'],
              ['Centro em baixo', 'Barra rápida (1–8) com o item selecionado em destaque.'],
              ['Junto ao cursor', 'Munição, durabilidade da arma, progresso de recarga ou de reanimação.'],
              ['Bordas do ecrã', 'Setas para companheiros, pings e para a tua mochila perdida.'],
              ['Centro', 'Avisos importantes («A noite aproxima-se», «Lua de Sangue», conquistas…).']], [45 * mm, 125 * mm])]
st += [PageBreak()]

# ---------- 5 ----------
st += [H1('5. O dia e a noite')]
st += [P('Um dia completo dura cerca de <b>18 minutos reais</b>.')]
st += [table([['Fase', 'Duração', 'O que acontece'],
              ['Amanhecer', '1 min', 'Os zombies da noite ardem ao sol. O jogo grava o mundo. Novas missões diárias.'],
              ['Dia', '10 min', 'Poucos zombies (Errantes em grupos pequenos). Tempo para explorar, minar, caçar e construir.'],
              ['Crepúsculo', '1 min', 'O céu fica vermelho e toca um alarme. Hora de voltar à base.'],
              ['Noite', '6 min', 'As hordas nascem fora da luz e marcham para os jogadores. Só vês o que a tua lanterna e as tochas iluminam.']],
             [28 * mm, 20 * mm, 122 * mm])]
st += [H2('A dificuldade sobe todas as noites')]
st += bullets(['Zombies por noite: <b>8 + 4 × número da noite</b> (multiplicado pelo número de jogadores).',
               'Vida dos zombies: +5 % por noite (até +150 %). Velocidade: +2 % por noite (até +40 %).',
               'Os zombies nunca nascem a menos de ~20 blocos de uma fonte de luz.',
               'A partir da noite 15 aparecem <b>zombies de elite</b> (brilho verde): mais vida e melhor saque.',
               '<b>Lua de Sangue</b> de 7 em 7 noites: o dobro dos zombies e uma recompensa ao amanhecer.',
               'Na <b>noite 21</b> (e depois de 21 em 21) acorda o <b>Rei da Podridão</b>.'])
st += [H2('Dormir')]
st += [P('Uma <b>cama</b> é o teu ponto de renascimento. À noite, se todos os jogadores estiverem deitados (E na cama) e não houver zombies perto, o jogo salta para a manhã.')]
st += [PageBreak()]

# ---------- 6 ----------
st += [H1('6. O teu sobrevivente')]
st += [table([['Atributo', 'Máx.', 'Como funciona'],
              ['Vida', '100', 'Desce com dano. Regenera devagar se a fome estiver acima de 50. A 0 ficas caído (em grupo) ou morres.'],
              ['Fome', '100', 'Desce 1 ponto a cada 30 s (mais depressa a correr). A 0 perdes vida aos poucos.'],
              ['Estamina', '100', 'Gasta-se a correr, atacar e esquivar. Recupera quando paras. Sem estamina, os ataques ficam lentos.'],
              ['Infeção', '0 → 100', 'Algumas mordidas somam 5 a 15. Acima de 50 a visão fica turva e a estamina máxima cai. A 100 transformas-te em zombie e morres.']],
             [24 * mm, 18 * mm, 128 * mm])]
st += [H2('Comida e curas')]
food = [(i, d) for i, d in items.items() if d['kind'] in ('food', 'med')]
rows = [['Item', 'Efeito']]
for i, d in food:
    e = []
    if d.get('food'): e.append(f"+{d['food']} fome")
    if d.get('heal'): e.append(f"+{d['heal']} vida")
    if d.get('inf'): e.append(f"{'+' if d['inf'] > 0 else ''}{d['inf']} infeção")
    if d.get('regen'): e.append('regenera vida')
    if d.get('vaccine'): e.append(f"imune à infeção {d['vaccine']} noites")
    rows.append([d['name'], ', '.join(e)])
st += [table(rows, [55 * mm, 115 * mm])]
st += [Spacer(1, 6), tipbox('Carne crua e carne podre aumentam a infeção. Cozinha a carne numa fogueira. O <b>Chá de ervas</b> é a primeira cura de infeção; os <b>Antibióticos</b> vêm do hospital ou do Laboratório.')]
st += [PageBreak()]

# ---------- 7 ----------
st += [H1('7. Primeiros passos')]
st += [P('O painel de missões (canto superior direito) guia-te, mas este é o caminho para sobreviveres à primeira noite:')]
steps = ['Parte <b>erva alta</b> e <b>arbustos</b> à mão para ter <b>fibra</b>. Apanha <b>pedras soltas</b> do chão.',
         'Corta árvores para ter <b>madeira</b> (à mão é lento).',
         'Tab → Crafting: faz <b>Corda</b> (3 fibra), depois um <b>Machado de pedra</b> e uma <b>Picareta de pedra</b>.',
         'Faz e coloca uma <b>Bancada de Trabalho</b> (10 madeira + 4 pedra) com o clique direito.',
         'Faz <b>paredes e uma porta de madeira</b> e fecha um abrigo pequeno. Usa o modo de construção (B).',
         'Coloca uma <b>Fogueira</b> e <b>tochas</b>: os zombies não nascem perto da luz e a fogueira serve para cozinhar.',
         'Procura <b>estantes</b> em casas e cabanas e lê os <b>livros</b> para desbloquear mais receitas.',
         'Antes do crepúsculo, volta para dentro. Mata os zombies que chegarem à porta.']
st += [table([[f'{i + 1}', s] for i, s in enumerate(steps)], [10 * mm, 160 * mm], head=False)]
st += [Spacer(1, 8), tipbox('Faz uma <b>Cama</b> cedo: é o teu ponto de renascimento. E um <b>Baú</b> para guardar coisas — se morreres, perdes o inventário (fica numa mochila no local da morte).')]
st += [PageBreak()]

# ---------- 8 ----------
st += [H1('8. Crafting, bancadas e livros')]
st += [P('As receitas estão divididas por estações. Para usar uma estação tens de estar <b>a menos de 3 blocos</b> dela. A progressão é: '
         '<b>Mãos → Bancada de Trabalho → Forja → Bancada de Armas → Laboratório</b> (e a <b>Fogueira</b> para cozinhar).')]
st += [H2('Livros: desbloquear receitas')]
st += [P('Quase todas as receitas das bancadas começam <b>bloqueadas</b> (aparecem com um cadeado). Para as aprender tens de encontrar e ler <b>livros</b> (clique esquerdo com o livro na mão). '
         'Cada livro ensina <b>uma receita nova a todo o grupo</b>. Se o grupo já souber tudo desse livro, dá XP.')]
st += [table([['Livro', 'Bancada', 'Onde aparece mais'],
              ['Livro de Carpintaria', 'Bancada de Trabalho', 'Floresta, quintas, cabanas, casas'],
              ['Livro de Metalurgia', 'Forja', 'Montanhas (cabanas de mineiro), oficinas, cidade'],
              ['Manual de Armas', 'Bancada de Armas', 'Bunkers e acampamentos militares'],
              ['Livro de Química', 'Laboratório', 'Hospitais e perto da Cratera']], [45 * mm, 45 * mm, 80 * mm])]
st += [Spacer(1, 6), P('<b>Regra das bancadas:</b> só podes fazer a bancada seguinte depois de aprender <b>todas</b> as receitas da atual. '
                       'A Forja pede as 10 da Bancada de Trabalho; a Bancada de Armas pede as 8 da Forja; o Laboratório pede as 8 da Bancada de Armas.')]
st += [P('Estão sempre abertas: todas as receitas das Mãos e da Fogueira, e uma básica por bancada (paredes e portas de madeira, lingote, pólvora, antibióticos).', 'small')]
st += [shot('crafting.png', 'O separador Crafting: pesquisa, bancadas com o progresso de receitas aprendidas e receitas bloqueadas.', w=140 * mm)]
st += [H2('Pesquisa e reparação')]
st += bullets(['A barra de pesquisa procura um item em <b>todas</b> as bancadas e mostra também as receitas que o usam como ingrediente.',
               '<b>Shift + clique</b> em «Fazer» cria 5 de uma vez; <b>Enter</b> na pesquisa faz o primeiro item possível.',
               'Armas, ferramentas e armaduras gastam-se. Repara-as na estação onde foram feitas com metade dos materiais.'])
st += [PageBreak()]
st += [H2('Todas as receitas')]
STN = {'maos': 'Mãos', 'bancada': 'Bancada de Trabalho', 'forja': 'Forja', 'bancada_armas': 'Bancada de Armas', 'laboratorio': 'Laboratório', 'fogueira': 'Fogueira'}
for stn, nm in STN.items():
    rows = [['Item', 'Ingredientes', '']]
    for r in [r for r in recipes if r['st'] == stn]:
        ing = ', '.join(f"{q} {items[i]['name']}" for i, q in r['in'].items())
        tag = 'base' if (stn in ('maos', 'fogueira') or r.get('base')) else ('final' if r['out'] in ('forja', 'bancada_armas', 'laboratorio') else 'livro')
        rows.append([items[r['out']]['name'] + (f" ×{r['n']}" if r['n'] > 1 else ''), ing, {'base': 'aberta', 'livro': 'livro', 'final': 'todas'}[tag]])
    st += [CondPageBreak(40 * mm), P(f'<b>{nm}</b>'), table(rows, [50 * mm, 95 * mm, 25 * mm]), Spacer(1, 6)]
st += [P('«livro» = aprende-se com um livro · «todas» = abre quando aprenderes todas as receitas dessa bancada.', 'small')]
st += [PageBreak()]

# ---------- 9 ----------
st += [H1('9. Construção e defesa')]
st += bullets(['<b>B</b> ativa o modo de construção: mostra a grelha e uma pré-visualização verde (pode colocar) ou vermelha (não pode).',
               'No modo de construção, <b>clique esquerdo</b> coloca (podes arrastar para fazer paredes seguidas) e <b>clique direito</b> recolhe o bloco.',
               'Fora do modo de construção, o <b>clique direito</b> com um bloco na mão também o coloca.',
               'Blocos danificados mostram rachas. Repara-os com o <b>Martelo</b> (gasta um material do bloco).'])
st += [table([['Bloco', 'Vida', 'Notas'],
              ['Parede de madeira', '150', 'Barata, boa para as primeiras noites.'],
              ['Parede de pedra', '400', 'Os Escavadores passam por baixo.'],
              ['Parede de metal', '900', 'Os Escavadores não conseguem cavar.'],
              ['Porta de madeira / metal', '120 / 700', 'Abre e fecha com E. Os zombies tratam-na como parede.'],
              ['Espigões de madeira', '100', 'Dano contínuo a quem passa.'],
              ['Arame farpado', '200', 'Abranda muito e causa dano. Ideal à frente das paredes.'],
              ['Mina terrestre', '—', 'Uso único, 80 de dano em área.'],
              ['Torre automática', '300', 'Dispara sozinha; tira balas de um baú encostado; à noite precisa de gerador.'],
              ['Holofote', '150', 'Luz forte à noite com gerador. Os Corredores evitam-na.'],
              ['Gerador', '250', 'Alimenta torres e holofotes num raio de 12 blocos. Gasta combustível (E para abastecer).']],
             [45 * mm, 22 * mm, 103 * mm])]
st += [H2('Como os zombies atacam a base')]
st += bullets(['Se houver um caminho aberto até ti, seguem-no.', 'Se a base estiver fechada, escolhem o <b>ponto mais fraco</b> do perímetro e todos atacam aí.',
               'Quando um zombie bate numa parede, ela abana e solta lascas — vês logo onde está a ser atacada.',
               'Pensa no desenho da base: paredes duplas, corredores com armadilhas e portas de reserva.'])
st += [tipbox('Uma base bem iluminada obriga as hordas a nascer longe e a atravessar uma zona aberta antes de chegar às paredes.')]
st += [PageBreak()]

# ---------- 10 ----------
st += [H1('10. Combate e armas')]
st += bullets(['As armas corpo-a-corpo atacam num arco à tua frente. Todos os golpes empurram e atordoam os zombies 0,3 s.',
               'Golpes em zombies atordoados podem ser <b>críticos</b> (×2).',
               'As armas de fogo têm dispersão e fazem <b>ruído</b>, que atrai zombies num raio. O arco é silencioso e as flechas podem ser recuperadas.',
               'O <b>Espaço</b> faz-te rolar e ficas invulnerável durante a esquiva.'])
rows = [['Arma', 'Tipo', 'Dano', 'Notas']]
for i, d in items.items():
    if d['kind'] in ('melee', 'ranged', 'throw'):
        note = []
        if d.get('axe'): note.append('corta árvores')
        if d.get('pick'): note.append('mina ' + ('cristais' if d['pick'] >= 2 else 'pedra e minério'))
        if d.get('hammer'): note.append('repara blocos')
        if d.get('cure'): note.append('cada golpe reduz a infeção')
        if d['kind'] == 'ranged': note.append(('silencioso' if d.get('bow') else f"ruído {d['noise']} blocos") + (f", carregador {d['mag']}" if d.get('mag', 1) > 1 else ''))
        if d['kind'] == 'throw': note.append('fogo em área durante 5 s')
        dmg = f"{d['dmg']}" + (f" × {d['pellets']}" if d.get('pellets') else '') + ('/s' if d['kind'] == 'throw' else '')
        rows.append([d['name'], {'melee': 'Corpo-a-corpo', 'ranged': 'Distância', 'throw': 'Arremesso'}[d['kind']], dmg, ', '.join(note)])
st += [table(rows, [42 * mm, 30 * mm, 18 * mm, 80 * mm])]
st += [Spacer(1, 6), P('<b>Armaduras:</b> couro (−10 % de dano), ferro (−30 %) e Armadura da Podridão (−50 %, os Errantes ignoram-te).')]
st += [shot('px3.png', 'Combate de perto: números de dano, sangue e zombies empurrados.', w=150 * mm)]
st += [PageBreak()]

# ---------- 11 ----------
st += [H1('11. Os zombies')]
st += [P('Os zombies seguem um mapa de direções calculado a partir de todos os jogadores. São atraídos pelo ruído e cada tipo tem um som próprio, para os reconheceres no escuro.')]
DESC = {'errante': 'Anda na direção do ruído ou do jogador. Surge também de dia.', 'corredor': 'Corre muito depressa. Frágil, mas chega primeiro. Evita holofotes.',
        'brutamontes': 'Parte paredes 3× mais depressa e empurra o jogador.', 'cuspidor': 'Fica à distância e cospe ácido que danifica blocos e infeta.',
        'explosivo': 'Corre para as paredes e rebenta. Mata-o de longe.', 'escavador': 'Cava por baixo de madeira e pedra e aparece dentro da base. O metal pára-o.',
        'rei': 'Chefe. Invoca Errantes, espalha Podridão e fica furioso a meio da vida.'}
rows = [['Tipo', 'Vida', 'Dano', 'Aparece', 'Comportamento']]
for k, name, hp, sp, dmg, night in ZT:
    rows.append([f'<b>{name}</b>', hp, dmg, f'noite {night}', DESC.get(k, '')])
st += [table(rows, [30 * mm, 14 * mm, 14 * mm, 20 * mm, 92 * mm])]
st += [H2('Saque')]
st += bullets(['Todos: carne podre (isco), por vezes tecido ou sucata.', 'Brutamontes e Cuspidores: chance de Cristal da Podridão.',
               'Elites: mais chance de saque, incluindo balas e componentes.', 'Rei da Podridão: 5 Cristais e o <b>Coração Negro</b> para cada jogador.'])
st += [H2('Animais')]
st += [P('Coelhos, veados e javalis aparecem de dia na floresta e na planície. Dão carne crua (e o veado, às vezes, tecido). O javali defende-se!')]
st += [PageBreak()]

# ---------- 12 ----------
st += [H1('12. O mapa, os biomas e as estruturas')]
st += [P('O mundo tem 2048 × 2048 blocos. O centro é a <b>Cratera da Podridão</b>: quanto mais perto, mais perigoso e mais rico. Começas sempre na floresta, perto da borda. '
         'O mapa (<b>M</b>) e o minimapa revelam-se à medida que exploras; no mapa, clica para pôr marcadores e usa o botão do meio para pings.')]
st += [table([['Bioma', 'Recursos principais', 'Perigo'],
              ['Floresta', 'Madeira, bagas, ervas medicinais, animais', 'Baixo'], ['Planície', 'Fibra, animais, bagas, cultivos', 'Baixo'],
              ['Montanhas', 'Pedra, carvão, minério de ferro', 'Médio'], ['Pântano', 'Enxofre, ervas, fibra', 'Médio-alto'],
              ['Cidade', 'Sucata, componentes, combustível, tecido, livros', 'Alto'], ['Cratera da Podridão', 'Cristais da Podridão', 'Extremo']],
             [38 * mm, 100 * mm, 32 * mm])]
st += [H2('Estruturas')]
st += [P('As estruturas são plantas desenhadas com várias divisões, portas interiores e mobília, rodadas e espelhadas ao acaso. Têm <b>caixotes</b>, <b>estantes</b> com livros, armários e caixas para saquear (E).')]
st += [table([['Estrutura', 'Como é', 'Onde'],
              ['Casa / Casa grande', '2 a 4 divisões, quintal com cerca, camas, mesas, estantes', 'Cidade, planície, floresta'],
              ['Quinta', 'Casa e celeiro com cerca e filas de cultivos', 'Planície'],
              ['Posto de gasolina', 'Loja, bombas de combustível, carros', 'Cidade'],
              ['Hospital', '4 enfermarias com armários médicos', 'Cidade'],
              ['Biblioteca', 'Salas cheias de estantes', 'Cidade, floresta (rara)'],
              ['Oficina', 'Garagem com carros e arrumos', 'Cidade, planície'],
              ['Bunker', 'Paredes de betão, arsenal com caixas militares', 'Cidade, montanha'],
              ['Acampamento militar', 'Sacos de areia, tendas, caixas militares', 'Planície, floresta'],
              ['Cabana / Cabana de mineiro', 'Pequenas; a de mineiro tem minério à volta', 'Floresta, pântano, montanha']],
             [42 * mm, 83 * mm, 45 * mm])]
st += [PageBreak()]
st += [shot('st_quinta.png', 'Uma quinta: casa, celeiro, cerca e cultivos.', w=150 * mm), shot('st_hosp.png', 'Um hospital e, em baixo, um posto de gasolina.', w=150 * mm)]
st += [PageBreak()]
st += [shot('st_mil.png', 'Um acampamento militar com sacos de areia, tendas e caixas militares.', w=150 * mm), shot('mapa.png', 'O mapa (M): zonas exploradas, marcadores e a direção da Cratera.', w=150 * mm)]
st += [PageBreak()]

# ---------- 13 ----------
st += [H1('13. A Podridão')]
st += [P('A Podridão começa na Cratera, no centro do mapa, e <b>espalha-se um pouco todas as noites</b>, transformando a relva em terra podre (verde-tóxica) e as árvores em troncos mortos.')]
st += bullets(['Dentro da Podridão, os zombies nascem também de dia e são mais fortes.', 'A tua infeção sobe lentamente enquanto lá estiveres.',
               'Os recursos são mais raros e valiosos (Cristais).', 'Se a Podridão chegar à tua base, as paredes começam a apodrecer (perdem vida aos poucos).',
               'Um <b>Purificador</b> limpa a Podridão num raio de 30 blocos enquanto tiver combustível.'])
st += [Spacer(1, 6)]

# ---------- 14 ----------
st += [H1('14. Missões e conquistas')]
st += [H2('Missões (canto superior direito · J esconde)')]
st += [P(f'Há <b>{len(MAIN_Q)} missões principais</b> em cadeia, do primeiro machado até à vitória, e <b>2 missões diárias</b> que mudam a cada amanhecer. '
         'As missões são <b>do grupo</b>: o que qualquer jogador faz conta para todos, e a recompensa (itens + XP) vai para todos.')]
rows = [['#', 'Missão principal', 'O que fazer']] + [[str(i + 1), t, d] for i, (t, d) in enumerate(MAIN_Q)]
st += [table(rows, [9 * mm, 38 * mm, 123 * mm])]
st += [P('As missões principais contam o que o grupo já fez antes (se já construíste a Forja, essa missão fica logo cumprida). Itens recebidos como recompensa ou por comandos não contam.', 'small')]
st += [PageBreak()]
st += [H2('Conquistas (Tab → Conquistas)')]
st += [P(f'São <b>{len(ACH)} conquistas</b> do grupo. Quando desbloqueias uma, aparece um aviso no topo do ecrã.')]
cats = []
for c, t, d in ACH:
    if c not in cats: cats.append(c)
for c in cats:
    rows = [[c, '']] + [[t, d] for cc, t, d in ACH if cc == c]
    st += [CondPageBreak(30 * mm), table(rows, [50 * mm, 120 * mm]), Spacer(1, 5)]
st += [shot('ac2.png', 'O separador Conquistas.', w=140 * mm)]
st += [PageBreak()]

# ---------- 15 ----------
st += [H1('15. Habilidades')]
st += [P('Ganhas XP ao matar zombies, recolher recursos, criar itens, ler livros, cumprir missões e sobreviver a noites. Cada nível dá <b>1 ponto de habilidade</b> (Tab → Habilidades). '
         'Cada habilidade tem até 3 níveis. A XP das mortes é partilhada com todos os jogadores num raio de 30 blocos.')]
rows = [['Árvore', 'Habilidade', 'Efeito por nível']] + [[tr, nm, ds] for k, tr, nm, ds in SKILLS]
st += [table(rows, [30 * mm, 40 * mm, 100 * mm])]
st += [P('As árvores levam cada jogador a especializar-se: <b>linha da frente</b> (Combate), <b>explorador</b> (Sobrevivência), <b>construtor</b> (Engenharia) ou <b>apoio</b>.', 'small')]
st += [PageBreak()]

# ---------- 16 ----------
st += [H1('16. Jogar com amigos')]
st += [H2('Na mesma rede (LAN)')]
st += bullets(['Um jogador escolhe <b>Criar jogo (LAN)</b> e é o anfitrião: o mundo corre e grava no computador dele.',
               'Os outros escolhem <b>Entrar em jogo</b>: os jogos da rede aparecem na lista. Se não aparecer nada, escrevem o IP do anfitrião (vê-se no menu de pausa, Esc).',
               'Também se pode entrar pelo navegador: <font name="DVM">http://IP-do-anfitrião:7777</font>.',
               'Na primeira vez, o Windows do anfitrião pede autorização à firewall: aceita (redes privadas e públicas).',
               'Todos têm de ter <b>a mesma versão</b> do jogo.'])
st += [H2('Pela internet com o Radmin VPN')]
st += bullets(['Todos instalam o Radmin VPN e entram na mesma rede.', 'O anfitrião cria o jogo; os outros entram com o <b>IP do Radmin</b> do anfitrião (começa por <b>26.</b>).',
               'Na firewall, permite o Rotbound em redes <b>públicas</b> (o Windows costuma tratar a rede do Radmin como pública).'])
st += [H2('Cooperação')]
st += bullets(['<b>Caído em vez de morto:</b> a 0 de vida ficas caído 30 s; um companheiro reanima-te mantendo <b>E</b> premido 4 s.',
               'Os baús são partilhados; com um <b>Cadeado</b> (Forja) um baú ou porta passa a ser só teu.',
               'Receitas aprendidas, missões e conquistas são do grupo.',
               'Dormir só salta a noite se todos estiverem deitados. Cada jogador tem a sua cama.',
               '<b>G</b> dá o item da mão a um companheiro; <b>Q</b> larga-o no chão.',
               'Mais jogadores = mais zombies (×1,6 com 2, ×2,8 com 4) e um chefe com mais vida.'])
st += [Spacer(1, 6)]

# ---------- 17 ----------
st += [H1('17. Morte e gravação')]
st += bullets(['Ao morrer, deixas uma <b>mochila</b> com todo o inventário no local da morte (marcada no mapa e com uma seta no ecrã). Apanha-a com E.',
               'Renasces na tua cama ou, se não houver, no ponto inicial.', 'Se morreres outra vez antes de a recuperar, a primeira mochila desaparece.',
               'Se a infeção chegar a 100, transformas-te num zombie que fica no mundo.', '<b>Modo Hardcore</b> (opcional): a morte apaga o mundo.',
               'O jogo grava automaticamente a cada amanhecer e quando sais. Os mundos ficam em <font name="DVM">%APPDATA%\\rotbound\\saves</font>.'])
st += [PageBreak()]

# ---------- 18 ----------
st += [H1('18. O objetivo final')]
st += [P('Para vencer, tens de <b>purificar o Coração da Podridão</b>, no centro do mapa (coordenadas 1024, 1024).')]
goal = [['1', '<b>Progredir nas bancadas</b> com livros até ao Laboratório (precisa de Cristais da Podridão).'],
        ['2', '<b>Derrotar o Rei da Podridão</b> na noite 21. Cada jogador recebe 5 Cristais e o <b>Coração Negro</b>.'],
        ['3', '<b>Construir o Purificador</b> no Laboratório: 15 lingotes, 10 componentes, 8 cristais e o Coração Negro.'],
        ['4', '<b>Levá-lo à Cratera</b> e colocá-lo a menos de 9 blocos do Coração da Podridão.'],
        ['5', '<b>Aguentar 3 minutos</b>: fica noite e chegam hordas sem parar. Se o Purificador for destruído, falhas.']]
st += [table(goal, [10 * mm, 160 * mm], head=False)]
st += [Spacer(1, 8), P('Se aguentares, a Podridão desaparece do mapa, o Coração é destruído e aparece a mensagem de <b>VITÓRIA</b>. Depois, o jogo continua em <b>modo livre</b>.')]

# ---------- 19 ----------
st += [H1('19. Dicas de sobrevivência')]
st += bullets(['Luz é vida: tochas e fogueiras à volta da base empurram as hordas para longe.',
               'Faz cama e baú cedo. Guarda no baú o que não precisas de levar.',
               'Bebe <b>Chá de ervas</b> sempre que a infeção passar de 30.',
               'Paredes duplas no lado por onde as hordas costumam chegar; arame farpado e espigões à frente.',
               'Mata os <b>Explosivos</b> à distância — rebentam paredes.',
               'Os <b>Escavadores</b> (noite 12) só param em paredes de metal. Prepara a Forja antes disso.',
               'Lê todos os livros que encontrares: cada um é uma receita nova para o grupo.',
               'Antes da noite 7 (Lua de Sangue), tem comida, ligaduras e uma base bem fechada.',
               'Em grupo, dividam tarefas: um constrói, outro explora à procura de livros, outro caça e cozinha.',
               'Usa o mapa (M) para marcar cidades, bunkers e hospitais que encontres.'])
st += [Spacer(1, 14), P('<i>Boa sorte, sobrevivente. A Podridão não espera.</i>', 'cap')]

doc.build(st)
print('PDF:', OUT)
