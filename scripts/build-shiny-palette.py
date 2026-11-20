#!/usr/bin/env python3
# Usage: scripts/build-shiny-palette.py <official normal sprite> <official shiny sprite> <game sprite dir>
# Writes <sprite dir>/shiny.json (normal hex -> shiny hex) for a sheet drawn from a different source than the
# official sprites: every sheet colour is matched to the nearest colour of the official normal sprite, and that
# colour's normal->shiny change (hue shift, saturation and brightness ratio) is applied to the sheet colour.
import sys, os, json, colorsys
from collections import Counter, defaultdict
from PIL import Image
normal, shiny, sprite_dir = sys.argv[1], sys.argv[2], sys.argv[3]
N = Image.open(normal).convert('RGBA'); S = Image.open(shiny).convert('RGBA')
assert N.size == S.size
pairs = defaultdict(Counter)
for (r, g, b, a), (r2, g2, b2, a2) in zip(N.getdata(), S.getdata()):
    if a > 128 and a2 > 128: pairs[(r, g, b)][(r2, g2, b2)] += 1
ref = {n: c.most_common(1)[0][0] for n, c in pairs.items() if sum(c.values()) >= 3}
weight = {n: sum(pairs[n].values()) for n in ref}
def lab(c):   # cheap perceptual-ish distance: weighted RGB
    return c
def dist(a, b):
    rm = (a[0] + b[0]) / 2
    return ((2 + rm / 256) * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + (2 + (255 - rm) / 256) * (a[2] - b[2]) ** 2) ** 0.5
hsv = lambda c: colorsys.rgb_to_hsv(*(v / 255 for v in c))
def shift(c, n, s):
    h, sat, v = hsv(c); hn, sn, vn = hsv(n); hs, ss, vs = hsv(s)
    if sn < 0.12 or sat < 0.08:            # greys: carry the brightness/colour offset in RGB instead
        return tuple(max(0, min(255, round(c[i] + (s[i] - n[i])))) for i in range(3))
    h2 = (h + hs - hn) % 1; s2 = max(0, min(1, sat * (ss / sn if sn else 1))); v2 = max(0, min(1, v * (vs / vn if vn else 1)))
    return tuple(round(x * 255) for x in colorsys.hsv_to_rgb(h2, s2, v2))
colours = Counter()
for f in os.listdir(sprite_dir):
    if f.endswith('-Anim.png'):
        for r, g, b, a in Image.open(os.path.join(sprite_dir, f)).convert('RGBA').getdata():
            if a: colours[(r, g, b)] += 1
out = {}
for c in colours:
    if max(c) < 40: continue                                       # near-black outline stays black
    pool = list(ref)
    hc, sc, vc = hsv(c)
    if sc > 0.25 and vc > 0.2:   # a saturated colour should match a reference of the same hue, not a grey
        same = [n for n in ref if hsv(n)[1] > 0.2 and min(abs(hsv(n)[0] - hc), 1 - abs(hsv(n)[0] - hc)) < 0.08]
        if same: pool = same
    cands = sorted(pool, key=lambda n: dist(c, n))[:3]
    n = min(cands, key=lambda n: dist(c, n) - 2 * min(weight[n], 40) ** 0.5)
    s = ref[n]
    if dist(n, s) < 12: continue                                   # this part doesn't change colour when shiny
    t = shift(c, n, s)
    if t != c: out['%02x%02x%02x' % c] = '%02x%02x%02x' % t
json.dump(out, open(os.path.join(sprite_dir, 'shiny.json'), 'w'), separators=(',', ':'))
changed = sum(colours['%s' % 0] for _ in [])  # placeholder
cov = sum(n for c, n in colours.items() if '%02x%02x%02x' % c in out) / sum(colours.values())
print(f'{os.path.basename(sprite_dir)}: {len(out)}/{len(colours)} colours, {cov:.0%} of pixels change')
