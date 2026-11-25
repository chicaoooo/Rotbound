# Gera o ícone do Rotbound em pixel art (32×32 ampliado) → build/icon.png, build/icon.ico, client/icon.png
from PIL import Image, ImageDraw
N = 32
im = Image.new('RGBA', (N, N), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
P = lambda x, y, c: d.point((x, y), fill=c)
# placa de fundo arredondada com moldura de ferrugem
d.rounded_rectangle((0, 0, 31, 31), radius=6, fill='#140f0b')
d.rounded_rectangle((1, 1, 30, 30), radius=5, fill='#8a3f15')
d.rounded_rectangle((2, 2, 29, 29), radius=4, fill='#1c1912')
# brilho da fogueira em baixo
for r, c in [(12, '#2a2014'), (9, '#3a2614'), (6, '#4a2c12')]: d.ellipse((16 - r, 31 - r, 16 + r, 31 + r), fill=c)
d.rounded_rectangle((2, 2, 29, 29), radius=4, outline='#1c1912')
# cabeça de zombie
skin, dark, light = '#7fae3a', '#4f7420', '#a8d860'
d.ellipse((7, 5, 25, 24), fill='#0e0c08')
d.ellipse((8, 6, 24, 23), fill=skin)
d.ellipse((8, 15, 24, 23), fill=dark)
d.rectangle((10, 17, 22, 22), fill=skin)
for x, y in [(11, 8), (12, 7), (13, 7), (19, 7)]: P(x, y, light)
# olhos (órbitas escuras com brilho amarelo)
for ex in (11, 18):
    d.rectangle((ex, 12, ex + 3, 15), fill='#0e0c08')
    d.rectangle((ex + 1, 13, ex + 2, 14), fill='#ffd23a')
    P(ex + 1, 13, '#fff7c0')
# nariz e boca cosida
P(15, 16, '#2e4410'); P(16, 16, '#2e4410')
d.rectangle((11, 19, 21, 20), fill='#2a0d08')
for x in range(12, 21, 2): P(x, 18, '#d8d0b0'); P(x, 21, '#d8d0b0')
# ferida / podridão
P(21, 9, '#8e2a1f'); P(22, 10, '#8e2a1f'); P(21, 10, '#c03a2a')
P(9, 16, '#2e4410'); P(9, 17, '#2e4410')
# gotas de podridão a escorrer
for x, h in [(13, 3), (19, 2)]:
    for k in range(h): P(x, 24 + k, '#9ad848' if k < h - 1 else '#c8f070')
# pescoço/ombros
d.rectangle((12, 24, 20, 26), fill=dark); d.rectangle((8, 27, 24, 29), fill='#4a4a5a'); d.rectangle((8, 27, 24, 27), fill='#5e5e70')
d.rounded_rectangle((2, 2, 29, 29), radius=4, outline=None)
big = im.resize((256, 256), Image.NEAREST)
big.save('build/icon.png'); big.resize((64, 64), Image.NEAREST).save('client/icon.png')
big.save('build/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('ok')
