#!/usr/bin/env python3
# Usage: scripts/build-walk-sheet.py <sheet.png> <out dir> <base sprite dir>
# Builds a game sprite folder from a 4-row x 3-column walk sheet on a green background (the small, native-size grid
# at the left of the sheet: 28x33 cells; rows back, front, left, right; columns step, stand, step). The 8 PMD
# directions reuse the 4 views (diagonals use the side views); every loop is calm (feet locked, 1 px breathing) and
# the faint is the side view lying flat.
import sys, os, re, json
from PIL import Image
sheet, out, base = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
S = Image.open(sheet).convert('RGBA')
CW, CH, BG = 28, 33, {(88, 144, 88), (48, 78, 48)}

def cell(r, c):
    im = S.crop((c * CW + 1, r * CH + 1, (c + 1) * CW, (r + 1) * CH))
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][:3] in BG: px[x, y] = (0, 0, 0, 0)
    return im

VIEW = {'N': 0, 'S': 1, 'W': 2, 'E': 3}
cells = {(v, c): cell(r, c) for v, r in VIEW.items() for c in range(3)}
DIRS = ['S', 'E', 'E', 'E', 'N', 'W', 'W', 'W']   # PMD rows S SE E NE N NW W SW
FW, FH = 48, 56

# Anchor: the base form's lowest pixel below its frame centre (first Walk frame, facing down).
bx = open(os.path.join(base, 'AnimData.xml')).read(); bb = re.search(r'<Name>Walk</Name>(.*?)</Anim>', bx, re.S).group(1)
bfw, bfh = int(re.search(r'<FrameWidth>(\d+)', bb).group(1)), int(re.search(r'<FrameHeight>(\d+)', bb).group(1))
below = Image.open(os.path.join(base, 'Walk-Anim.png')).convert('RGBA').crop((0, 0, bfw, bfh)).getbbox()[3] - bfh / 2
feet = round(FH / 2 + below)

def lowcx(im):
    a = im.getchannel('A').load(); w, h = im.size
    pts = [(x, y) for y in range(h) for x in range(w) if a[x, y]]
    top, bot = min(p[1] for p in pts), max(p[1] for p in pts)
    low = [p for p in pts if p[1] >= bot - (bot - top) * 0.4]
    return sum(p[0] for p in low) / len(low), bot

def place(im, dx=0, dy=0):
    """Frame with `im` standing on the feet line, its lower body centred."""
    cx, bot = lowcx(im)
    f = Image.new('RGBA', (FW, FH))
    f.alpha_composite(im, (round(FW / 2 - cx) + dx, feet - bot + dy))
    return f

FWD = {'S': (0, 2), 'N': (0, -2), 'E': (3, 0), 'W': (-3, 0)}
def frames_for(view, spec):
    stand = cells[(view, 1)]
    out_f = []
    for kind, bob, push in spec:
        im = stand if kind == 'stand' else cells[(view, 0 if kind == 'stepA' else 2)]
        fx, fy = FWD[view]
        if kind == 'faint':
            side = cells[('E' if view in ('E', 'S') else 'W', 1)]
            lying = side.rotate(90 if view in ('E', 'S') else -90, expand=True)
            f = Image.new('RGBA', (FW, FH)); b = lying.getbbox(); lying = lying.crop(b)
            f.alpha_composite(lying, (FW // 2 - lying.width // 2, feet - lying.height))
            out_f.append(f); continue
        out_f.append(place(im, fx * push, bob + fy * push))
    return out_f

ANIMS = [  # name, [(pose, bob px, push)], durations, marks
    ('Idle',   [('stand', 0, 0), ('stand', -1, 0)], [24, 24], {}),
    ('Walk',   [('stepA', 0, 0), ('stand', -1, 0), ('stepB', 0, 0), ('stand', -1, 0)], [10, 10, 10, 10], {}),
    ('Attack', [('stand', 0, 0), ('stepB', 0, 1), ('stepB', 0, 1), ('stand', 0, 0)], [8, 4, 8, 6], {'RushFrame': 1, 'HitFrame': 1, 'ReturnFrame': 3}),
    ('Shoot',  [('stand', 0, 0), ('stepA', 0, 1), ('stepA', 0, 1), ('stand', 0, 0)], [8, 4, 10, 6], {'HitFrame': 1, 'ReturnFrame': 3}),
    ('Charge', [('stand', 0, 0), ('stand', -1, 0)], [10, 10], {}),
    ('Hurt',   [('stand', 0, -1), ('stand', 0, 0)], [2, 8], {}),
    ('Faint',  [('stand', 0, 0), ('faint', 0, 0)], [8, 40], {}),
    ('Pose',   [('stand', -1, 0), ('stand', 0, 0)], [16, 16], {}),
]
lines = ['<?xml version="1.0"?>', '<AnimData>', '  <ShadowSize>1</ShadowSize>', '  <Anims>']
for idx, (name, spec, durs, marks) in enumerate(ANIMS):
    sh = Image.new('RGBA', (FW * len(spec), FH * 8))
    for d, view in enumerate(DIRS):
        for i, f in enumerate(frames_for(view, spec)): sh.alpha_composite(f, (i * FW, d * FH))
    sh.save(os.path.join(out, f'{name}-Anim.png'), optimize=True)
    lines += ['    <Anim>', f'      <Name>{name}</Name>', f'      <Index>{idx}</Index>', f'      <FrameWidth>{FW}</FrameWidth>', f'      <FrameHeight>{FH}</FrameHeight>']
    lines += [f'      <{k}>{v}</{k}>' for k, v in marks.items()]
    lines += ['      <Durations>'] + [f'        <Duration>{t}</Duration>' for t in durs] + ['      </Durations>', '    </Anim>']
lines += ['  </Anims>', '</AnimData>', '']
open(os.path.join(out, 'AnimData.xml'), 'w').write('\n'.join(lines))
# Portrait: the head of the front view, on the base form's portrait backdrop.
front = cells[('S', 1)]; fb = front.getbbox()
head = front.crop((max(0, (fb[0] + fb[2]) // 2 - 14), fb[1], min(front.width, (fb[0] + fb[2]) // 2 + 14), fb[1] + 28))
head = head.resize((head.width * 40 // 28, head.height * 40 // 28), Image.NEAREST)
bp = Image.open(os.path.join(base, 'portrait.png')).convert('RGBA'); por = Image.new('RGBA', (40, 40))
for y in range(40):
    for x in range(40): por.putpixel((x, y), bp.getpixel((0, y)))
por.alpha_composite(head, ((40 - head.width) // 2, 40 - head.height)); por.convert('RGB').save(os.path.join(out, 'portrait.png'))
im0 = Image.new('RGBA', (FW, FH)); im0.alpha_composite(place(cells[('S', 1)])); l, t, r, b = im0.getbbox()
h = max(16, FH / 2 - t); radius = round(min(20, max(8, (r - l) * 0.32))); rnd = lambda v: int(v + 0.5)
print(json.dumps({'frame': [FW, FH], 'height': b - t, 'dims': [radius, rnd(h * .45), rnd(h * .92), rnd(h * .68), rnd(radius * .7), rnd(radius * .36)]}))
