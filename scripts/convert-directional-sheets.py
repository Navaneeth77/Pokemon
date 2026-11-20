#!/usr/bin/env python3
# Usage: scripts/convert-directional-sheets.py <directional-sprites-v2 dir> <out dir> <base sprite dir> <scale> <timing json> <front.png>
# Converts a directional-sprites-v2 folder (8-row strips, rows S SE E NE N NW W SW = PMD order) into a game
# sprite folder: optional downscale with one shared palette and a dark outline, frames re-anchored to the base
# form's height above the ground, tidy frame size, timing overrides, and a 40x40 head portrait.
import sys, os, re, json
from PIL import Image, ImageEnhance
src, out, base = sys.argv[1], sys.argv[2], sys.argv[3]
scale = float(sys.argv[4]); timing = json.loads(sys.argv[5]) if len(sys.argv) > 5 else {}
os.makedirs(out, exist_ok=True)
xml = open(os.path.join(src, 'AnimData.xml')).read()
anims = []
for m in re.finditer(r'<Anim>(.*?)</Anim>', xml, re.S):
    b = m.group(1)
    anims.append(dict(name=re.search(r'<Name>(.*?)</Name>', b).group(1), fw=int(re.search(r'<FrameWidth>(\d+)', b).group(1)),
                      fh=int(re.search(r'<FrameHeight>(\d+)', b).group(1)), durs=[int(d) for d in re.findall(r'<Duration>(\d+)', b)],
                      marks={k: int(v) for k, v in re.findall(r'<(RushFrame|HitFrame|ReturnFrame)>(\d+)', b)}))
frames = {}   # (anim, frame, row) -> RGBA
for a in anims:
    sheet = Image.open(os.path.join(src, f"{a['name']}-Anim.png")).convert('RGBA')
    for f in range(len(a['durs'])):
        for r in range(8):
            frames[(a['name'], f, r)] = sheet.crop((f * a['fw'], r * a['fh'], f * a['fw'] + a['fw'], r * a['fh'] + a['fh']))
fw0, fh0 = anims[0]['fw'], anims[0]['fh']
if scale != 1:
    SW, SH = round(fw0 * scale), round(fh0 * scale); keys = list(frames)
    big = Image.new('RGB', (SW * len(keys), SH)); mask = Image.new('L', big.size)
    for i, k in enumerate(keys):
        s = frames[k].resize((SW, SH), Image.BOX); sp = s.load()
        for y in range(SH):
            for x in range(SW):
                r, g, b, al = sp[x, y]
                if al >= 110:
                    kk = 255 / al; big.putpixel((i * SW + x, y), tuple(min(255, round(v * kk)) for v in (r, g, b))); mask.putpixel((i * SW + x, y), 255)
    big = ImageEnhance.Contrast(big).enhance(1.06)
    q = big.quantize(colors=28, method=Image.FASTOCTREE, kmeans=3, dither=Image.NONE).convert('RGBA'); q.putalpha(mask); qp = q.load(); W = q.size[0]
    edge = [(x, y) for y in range(SH) for x in range(W) if qp[x, y][3] and any(
        not (0 <= x + dx < W and 0 <= y + dy < SH) or (x + dx) // SW != x // SW or not qp[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in edge:
        r, g, b, _ = qp[x, y]
        if r + g + b > 140: qp[x, y] = (int(r * .25) + 10, int(g * .22) + 10, int(b * .28) + 16, 255)
    frames = {k: q.crop((i * SW, 0, i * SW + SW, SH)) for i, k in enumerate(keys)}
else:
    for k, im in frames.items():   # harden any soft alpha
        im.putalpha(im.getchannel('A').point(lambda v: 255 if v >= 128 else 0))
# anchor to the base form: its lowest pixel's distance below the frame centre (first Walk frame, facing down)
bx = open(os.path.join(base, 'AnimData.xml')).read(); bb_ = re.search(r'<Name>Walk</Name>(.*?)</Anim>', bx, re.S).group(1)
bfw, bfh = int(re.search(r'<FrameWidth>(\d+)', bb_).group(1)), int(re.search(r'<FrameHeight>(\d+)', bb_).group(1))
below = Image.open(os.path.join(base, 'Walk-Anim.png')).convert('RGBA').crop((0, 0, bfw, bfh)).getbbox()[3] - bfh / 2
cw, ch = next(iter(frames.values())).size
ref = frames[(anims[0]['name'], 0, 0)].getbbox()
dy = round(ch / 2 + below - ref[3])            # shift so the idle front frame sits like the base form
boxes = [im.getbbox() for im in frames.values() if im.getbbox()]
half_w = max(max(cw / 2 - b[0], b[2] - cw / 2) for b in boxes)
half_h = max(max(ch / 2 - (b[1] + dy), (b[3] + dy) - ch / 2) for b in boxes)
FW = int(-(-2 * half_w // 8) * 8); FH = int(-(-2 * half_h // 8) * 8)
ox, oy = FW // 2 - cw // 2, FH // 2 - ch // 2 + dy
lines = ['<?xml version="1.0"?>', '<AnimData>', '  <ShadowSize>1</ShadowSize>', '  <Anims>']
for idx, a in enumerate(anims):
    n = len(a['durs']); sheet = Image.new('RGBA', (FW * n, FH * 8))
    for f in range(n):
        for r in range(8):
            im = frames[(a['name'], f, r)]; bb = im.getbbox()
            if bb: assert 0 <= bb[0] + ox and bb[2] + ox <= FW and 0 <= bb[1] + oy and bb[3] + oy <= FH, (a['name'], f, r)
            sheet.alpha_composite(im, (f * FW + ox, r * FH + oy))
    sheet.save(os.path.join(out, f"{a['name']}-Anim.png"), optimize=True)
    durs = timing.get(a['name'], a['durs'])
    lines += ['    <Anim>', f"      <Name>{a['name']}</Name>", f'      <Index>{idx}</Index>', f'      <FrameWidth>{FW}</FrameWidth>', f'      <FrameHeight>{FH}</FrameHeight>']
    lines += [f'      <{k}>{v}</{k}>' for k, v in a['marks'].items()]
    lines += ['      <Durations>'] + [f'        <Duration>{d}</Duration>' for d in durs] + ['      </Durations>', '    </Anim>']
lines += ['  </Anims>', '</AnimData>', '']
open(os.path.join(out, 'AnimData.xml'), 'w').write('\n'.join(lines))
# portrait: 40x40 around the head (top quarter of the front sprite), on the base form's portrait backdrop
front = Image.open(sys.argv[6]).convert('RGBA'); fb = front.getbbox(); fp = front.load()
topq = [(x, y) for y in range(fb[1], fb[1] + (fb[3] - fb[1]) // 4) for x in range(fb[0], fb[2]) if fp[x, y][3]]
hx = sum(x for x, _ in topq) // len(topq)
head = front.crop((hx - 20, fb[1] - 2, hx + 20, fb[1] + 38))
bp = Image.open(os.path.join(base, 'portrait.png')).convert('RGBA'); por = Image.new('RGBA', (40, 40))
for y in range(40):
    for x in range(40): por.putpixel((x, y), bp.getpixel((0, y)))
por.alpha_composite(head); por.convert('RGB').save(os.path.join(out, 'portrait.png'))
im0 = Image.new('RGBA', (FW, FH)); im0.alpha_composite(frames[(anims[0]['name'], 0, 0)], (ox, oy)); l, t, r, b = im0.getbbox()
h = max(16, FH / 2 - t); radius = round(min(20, max(8, (r - l) * 0.32))); rnd = lambda v: int(v + 0.5)
print('frame', FW, FH, 'DIMS', json.dumps([radius, rnd(h * .45), rnd(h * .92), rnd(h * .68), rnd(radius * .7), rnd(radius * .36)]))
