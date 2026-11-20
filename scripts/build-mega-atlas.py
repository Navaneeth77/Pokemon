#!/usr/bin/env python3
# Usage: scripts/build-mega-atlas.py <atlas.png> <out dir> <base sprite dir> <front.png (unused)> <target height px>
# Builds a game sprite folder from a 5-column x 8-row key-pose atlas on white.
# Columns: S, SW, W, NW, N (the east-facing rows are mirrored). Rows: 0 idle, 1 flared idle, 2 walking step,
# 3 contact attack, 4 ranged attack, 5 hurt, 6 fainted, 7 victory. Each animation is built from these poses.
import sys, os, re, json
from collections import deque
from PIL import Image, ImageOps, ImageEnhance
atlas, out, base, front, target = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
os.makedirs(out, exist_ok=True)
A = Image.open(atlas).convert('RGB'); W, H = A.size; CW, CH = W / 5, H / 8
bgish = lambda v: min(v[:3]) > 226 and max(v[:3]) - min(v[:3]) < 16
def components(img):
    p = img.load(); w, h = img.size; seen = set(); comps = []
    for y in range(h):
        for x in range(w):
            if (x, y) in seen or not p[x, y][3]: continue
            q = deque([(x, y)]); seen.add((x, y)); c = []
            while q:
                a, b = q.popleft(); c.append((a, b))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        n = (a + dx, b + dy)
                        if 0 <= n[0] < w and 0 <= n[1] < h and n not in seen and p[n][3]: seen.add(n); q.append(n)
            comps.append(c)
    return comps
def cell(r, c):
    x0, y0 = round(c * CW), round(r * CH); im = A.crop((x0, y0, round((c + 1) * CW), round((r + 1) * CH))).convert('RGBA'); p = im.load(); w, h = im.size
    seen = set(); q = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
    while q:
        x, y = q.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h) or not bgish(p[x, y]): continue
        seen.add((x, y)); p[x, y] = (0, 0, 0, 0); q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    comps = components(im); main = max(comps, key=len)
    for comp in comps:   # drop specks, effect marks ("!" lines, sparkles) and bits of neighbouring cells
        edge = any(a in (0, w - 1) or b in (0, h - 1) for a, b in comp)
        if comp is not main and (edge or len(comp) < max(12, len(main) * (0.02 if r in (4, 5) else 0.004))):
            for a, b in comp: p[a, b] = (0, 0, 0, 0)
    return im
cells = {(r, c): cell(r, c) for r in range(8) for c in range(5)}
ref = cells[(0, 0)].getbbox(); scale = target / (ref[3] - ref[1])
SW, SH = round(CW * scale), round(CH * scale)
keys = list(cells); big = Image.new('RGB', (SW * len(keys), SH)); mask = Image.new('L', big.size)
for i, k in enumerate(keys):
    s = cells[k].resize((SW, SH), Image.BOX); sp = s.load()
    for y in range(SH):
        for x in range(SW):
            r_, g_, b_, al = sp[x, y]
            if al >= 110:
                kk = 255 / al; big.putpixel((i * SW + x, y), tuple(min(255, round(v * kk)) for v in (r_, g_, b_))); mask.putpixel((i * SW + x, y), 255)
big = ImageEnhance.Contrast(ImageEnhance.Color(big).enhance(1.08)).enhance(1.06)
q = big.quantize(colors=28, method=Image.FASTOCTREE, kmeans=3, dither=Image.NONE).convert('RGBA'); q.putalpha(mask); qp = q.load(); QW = q.size[0]
for x, y in [(x, y) for y in range(SH) for x in range(QW) if qp[x, y][3] and any(
        not (0 <= x + dx < QW and 0 <= y + dy < SH) or (x + dx) // SW != x // SW or not qp[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]:
    r_, g_, b_, _ = qp[x, y]
    if r_ + g_ + b_ > 140: qp[x, y] = (int(r_ * .25) + 10, int(g_ * .22) + 10, int(b_ * .28) + 16, 255)
small = {k: q.crop((i * SW, 0, i * SW + SW, SH)) for i, k in enumerate(keys)}
COL = [0, 1, 2, 3, 4, 3, 2, 1]; FLIP = [0, 1, 1, 1, 0, 0, 0, 0]          # PMD rows S SE E NE N NW W SW
def pose(r, d, bob=0):
    im = small[(r, COL[d])]
    if FLIP[d]: im = ImageOps.mirror(im)
    return im, bob
ANIMS = [  # name, [(atlas row, bob px)], durations, marks
    ('Idle',   [(0, 0), (0, -1)],                [20, 20], {}),
    ('Walk',   [(0, 0), (0, -1), (0, 0), (0, -1)], [10, 10, 10, 10], {}),   # standing pose + 1 px step: the stride pose flipped like a seizure
    ('Attack', [(1, 0), (3, 0), (3, 0), (0, 0)], [10, 4, 8, 6], {'RushFrame': 1, 'HitFrame': 1, 'ReturnFrame': 3}),
    ('Shoot',  [(1, 0), (4, 0), (4, 0), (0, 0)], [9, 4, 10, 6], {'HitFrame': 1, 'ReturnFrame': 3}),
    ('Charge', [(4, 0), (4, -1)],                [10, 10], {}),
    ('Hurt',   [(5, 0), (5, 0)],                 [2, 8], {}),
    ('Faint',  [(5, 0), (6, 0), (6, 0)],         [6, 10, 30], {}),
    ('Pose',   [(7, 0), (7, -1)],                [16, 16], {}),
]
bx = open(os.path.join(base, 'AnimData.xml')).read(); bb_ = re.search(r'<Name>(?:Walk|Idle)</Name>(.*?)</Anim>', bx, re.S).group(1)
bfw, bfh = int(re.search(r'<FrameWidth>(\d+)', bb_).group(1)), int(re.search(r'<FrameHeight>(\d+)', bb_).group(1))
bname = re.search(r'<Name>(Walk|Idle)</Name>', bx).group(1)
below = Image.open(os.path.join(base, f'{bname}-Anim.png')).convert('RGBA').crop((0, 0, bfw, bfh)).getbbox()[3] - bfh / 2
dy = round(SH / 2 + below - small[(0, 0)].getbbox()[3])
boxes = [im.getbbox() for im in small.values() if im.getbbox()]
half_w = max(max(SW / 2 - b[0], b[2] - SW / 2) for b in boxes); half_h = max(max(SH / 2 - (b[1] + dy - 1), (b[3] + dy) - SH / 2) for b in boxes)
FW, FH = int(-(-2 * half_w // 8) * 8), int(-(-2 * half_h // 8) * 8)
ox, oy = FW // 2 - SW // 2, FH // 2 - SH // 2 + dy
lines = ['<?xml version="1.0"?>', '<AnimData>', '  <ShadowSize>1</ShadowSize>', '  <Anims>']
for idx, (name, seq, durs, marks) in enumerate(ANIMS):
    sheet = Image.new('RGBA', (FW * len(seq), FH * 8))
    for f, (r, bob) in enumerate(seq):
        for d in range(8):
            im, b = pose(r, d, bob); sheet.alpha_composite(im, (f * FW + ox, d * FH + oy + b))
    sheet.save(os.path.join(out, f'{name}-Anim.png'), optimize=True)
    lines += ['    <Anim>', f'      <Name>{name}</Name>', f'      <Index>{idx}</Index>', f'      <FrameWidth>{FW}</FrameWidth>', f'      <FrameHeight>{FH}</FrameHeight>']
    lines += [f'      <{k}>{v}</{k}>' for k, v in marks.items()]
    lines += ['      <Durations>'] + [f'        <Duration>{d}</Duration>' for d in durs] + ['      </Durations>', '    </Anim>']
lines += ['  </Anims>', '</AnimData>', '']
open(os.path.join(out, 'AnimData.xml'), 'w').write('\n'.join(lines))
# portrait: the top of the front-facing idle sprite (head and shoulders), 1:1, on the base form's backdrop
spr = small[(0, 0)]; sb = spr.getbbox(); cx = (sb[0] + sb[2]) // 2
head = spr.crop((cx - 20, sb[1] - 3, cx + 20, sb[1] + 37))
bp = Image.open(os.path.join(base, 'portrait.png')).convert('RGBA'); por = Image.new('RGBA', (40, 40))
for y in range(40):
    for x in range(40): por.putpixel((x, y), bp.getpixel((0, y)))
por.alpha_composite(head, (0, max(0, 37 - (sb[3] - sb[1])) // 2)); por.convert('RGB').save(os.path.join(out, 'portrait.png'))
im0 = Image.new('RGBA', (FW, FH)); im0.alpha_composite(small[(0, 0)], (ox, oy)); l, t, r, b = im0.getbbox()
h = max(16, FH / 2 - t); radius = round(min(20, max(8, (r - l) * 0.32))); rnd = lambda v: int(v + 0.5)
print(json.dumps({'frame': [FW, FH], 'dims': [radius, rnd(h * .45), rnd(h * .92), rnd(h * .68), rnd(radius * .7), rnd(radius * .36)]}))
