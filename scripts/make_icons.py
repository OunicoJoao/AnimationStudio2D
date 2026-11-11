"""Gera os ícones do app a partir do desenho do mascote (docs/icon/icon.jpg).

O fundo branco fora do personagem vira a cor manteiga do app; o corpo continua branco
e os traços pretos são preservados com suavização. Precisa do Pillow:
    python3 scripts/make_icons.py
"""
import os
import sys
from collections import deque
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'docs', 'icon', 'icon.jpg')
OUT = os.path.join(ROOT, 'icons')
BUTTER = (246, 207, 110)
INK = (29, 29, 31)


def character_on(bg):
    """Devolve o desenho com o lado de fora pintado em `bg` (RGB)."""
    im = Image.open(SRC).convert('L')
    w, h = im.size
    px = im.load()
    outside = bytearray(w * h)
    q = deque()
    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if px[x, y] > 200:
            q.append((x, y))
            outside[y * w + x] = 1
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not outside[ny * w + nx] and px[nx, ny] > 200:
                outside[ny * w + nx] = 1
                q.append((nx, ny))
    # anel de suavização: pixels cinzas vizinhos do lado de fora
    ring = bytearray(outside)
    for _ in range(3):
        nxt = bytearray(ring)
        for y in range(1, h - 1):
            row = y * w
            for x in range(1, w - 1):
                if ring[row + x] or px[x, y] < 40:
                    continue
                if ring[row + x - 1] or ring[row + x + 1] or ring[row - w + x] or ring[row + w + x]:
                    nxt[row + x] = 1
        ring = nxt
    out = Image.new('RGB', (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            v = px[x, y]
            if outside[y * w + x]:
                op[x, y] = bg
            elif ring[y * w + x]:
                t = v / 255
                op[x, y] = tuple(round(INK[k] * (1 - t) + bg[k] * t) for k in range(3))
            else:
                t = v / 255
                op[x, y] = tuple(round(INK[k] * (1 - t) + 255 * t) for k in range(3)) if v < 235 else (v, v, v)
    return out


def square_crop(img):
    """Recorte quadrado com a cabeça e a xícara, encostado na base (o corpo continua)."""
    w, h = img.size
    side = min(w, h - 90)
    left = (w - side) // 2
    return img.crop((left, h - side, left + side, h))


def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def make(size, path, kind):
    art = square_crop(character_on(BUTTER))
    if kind == 'maskable':
        # zona segura: o desenho ocupa ~80% central
        canvas = Image.new('RGB', (size, size), BUTTER)
        inner = int(size * 0.84)
        canvas.paste(art.resize((inner, inner), Image.LANCZOS), ((size - inner) // 2, size - inner))
        canvas.save(path)
        return
    art = art.resize((size, size), Image.LANCZOS)
    if kind == 'circle':
        mask = Image.new('L', (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
        mask = mask.resize((size, size), Image.LANCZOS)
    else:
        big = rounded_mask(size * 4, int(size * 4 * 0.22)).resize((size, size), Image.LANCZOS)
        mask = big
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(art, (0, 0), mask)
    out.save(path)


def main():
    if not os.path.exists(SRC):
        sys.exit(f'Arquivo não encontrado: {SRC}')
    os.makedirs(OUT, exist_ok=True)
    make(512, os.path.join(OUT, 'icon-512.png'), 'rounded')
    make(192, os.path.join(OUT, 'icon-192.png'), 'rounded')
    make(512, os.path.join(OUT, 'maskable-512.png'), 'maskable')
    make(180, os.path.join(OUT, 'apple-touch-icon.png'), 'maskable')
    make(32, os.path.join(OUT, 'favicon-32.png'), 'rounded')
    make(256, os.path.join(OUT, 'mascot.png'), 'circle')
    print('ícones gerados em', OUT)


if __name__ == '__main__':
    main()
