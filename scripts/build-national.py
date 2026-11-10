#!/usr/bin/env python3
"""Builds src/data/national.js and downloads sprites for every fully evolved Pokémon.

Sources: PokeAPI's CSV tables (stats, types, weights, abilities, names; docs/POKEAPI-LICENSE.md) and the
PMD SpriteCollab sheets the game already uses. Only species with complete sheets (Idle, Walk, Attack and a
portrait) are added. Hand-tuned species in species.js keep their own stats and moves; every fully evolved
species gets its official abilities. A shiny palette (normal colour -> shiny colour) is measured from the
shiny Idle sheet so the game can recolour any sheet without downloading a second set.

Usage: scripts/build-national.py <cache dir> <game.json> [--no-sprites]
  game.json: {"moves": {...}, "species": [...]} dumped from src/moves.js and src/data/species.js.
Needs Pillow for the shiny palettes.
"""
import csv, collections, concurrent.futures as cf, hashlib, io, json, os, re, sys, time, urllib.request, xml.etree.ElementTree as ET
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE, GAME = sys.argv[1], json.load(open(sys.argv[2]))
POKEAPI = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
COLLAB = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/'
USED = {'Idle', 'Walk', 'Attack', 'Strike', 'Shoot', 'SpAttack', 'Swing', 'Charge', 'Hurt', 'Faint', 'Hop', 'RearUp', 'Rotate', 'Double', 'Roar', 'Launch', 'Pose'}


def fetch(url, tries=5):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(1 + i * 2)
        except Exception:
            time.sleep(1 + i * 2)
    raise RuntimeError(f'could not fetch {url}')


def table(name):
    path = os.path.join(CACHE, f'{name}.csv')
    if not os.path.exists(path):
        open(path, 'wb').write(fetch(POKEAPI + f'{name}.csv'))
    return list(csv.DictReader(open(path, encoding='utf-8')))


camel = lambda s: re.sub(r'-([a-z0-9])', lambda m: m.group(1).upper(), s)
key = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())

species = table('pokemon_species')
parent = {int(r['id']): int(r['evolves_from_species_id'] or 0) for r in species}
# Sirfetch'd and Mr. Rime evolve only from the Galarian forms, so Farfetch'd and Mr. Mime count as fully evolved.
has_child = {p for c, p in parent.items() if p and c not in (865, 866)}
names = {int(r['pokemon_species_id']): r['name'] for r in table('pokemon_species_names') if r['local_language_id'] == '9'}
default = {int(r['species_id']): r for r in table('pokemon') if r['is_default'] == '1'}
type_name = {int(r['id']): r['identifier'] for r in table('types')}
types = collections.defaultdict(list)
for r in sorted(table('pokemon_types'), key=lambda r: int(r['slot'])):
    types[int(r['pokemon_id'])].append(type_name[int(r['type_id'])])
stats = collections.defaultdict(dict)
for r in table('pokemon_stats'):
    stats[int(r['pokemon_id'])][int(r['stat_id'])] = int(r['base_stat'])
ability_id = {int(r['id']): r['identifier'] for r in table('abilities')}
ability_name = {camel(ability_id[int(r['ability_id'])]): r['name'] for r in table('ability_names') if r['local_language_id'] == '9' and int(r['ability_id']) in ability_id}
abilities = collections.defaultdict(list)
for r in sorted(table('pokemon_abilities'), key=lambda r: int(r['slot'])):
    abilities[int(r['pokemon_id'])].append(camel(ability_id[int(r['ability_id'])]))

tracker_path = os.path.join(CACHE, 'tracker.json')
if not os.path.exists(tracker_path):
    open(tracker_path, 'wb').write(fetch(COLLAB + 'tracker.json'))
tracker = json.load(open(tracker_path))

existing = {key(s['id']): s for s in GAME['species']}
finals, new = [], []
for r in species:
    dex = int(r['id'])
    if dex > 1025 or dex in has_child:
        continue
    e = tracker.get(f'{dex:04d}') or {}
    ready = {'Idle', 'Walk', 'Attack'} <= set(e.get('sprite_files', {})) and 'Normal' in e.get('portrait_files', {})
    sid = existing[key(r['identifier'])]['id'] if key(r['identifier']) in existing else camel(r['identifier'])
    row = dict(dex=dex, id=sid, ident=r['identifier'], legendary=r['is_legendary'] == '1', mythical=r['is_mythical'] == '1')
    if key(r['identifier']) in existing:
        finals.append(row)
    elif ready:
        finals.append(row)
        new.append(row)
print(f'{len(finals)} fully evolved with sprites, {len(new)} new')

# ── Moves: two attacks of its own type(s), a gap-closer and one coverage move, in its better category ──
MOVES = GAME['moves']
SKIP = {'lugiaWaterPulse', 'voltTackle', 'searingShot', 'nightDaze', 'extremeSpeed', 'triAttack', 'copy', 'foulPlay'}
pool = collections.defaultdict(list)
for mid, m in MOVES.items():
    if m['power'] and m['cat'] != 'status' and mid not in SKIP:
        pool[m['type']].append(mid)
COVER = {
    'normal': ['ground', 'fighting', 'ghost'], 'fire': ['ground', 'dragon', 'fighting'], 'water': ['ice', 'ground', 'dark'],
    'electric': ['ice', 'steel', 'flying'], 'grass': ['poison', 'ground', 'fairy'], 'ice': ['water', 'ground', 'rock'],
    'fighting': ['rock', 'dark', 'steel'], 'poison': ['ground', 'dark', 'bug'], 'ground': ['rock', 'steel', 'fire'],
    'flying': ['steel', 'normal', 'ground'], 'psychic': ['fairy', 'fighting', 'ghost'], 'bug': ['flying', 'poison', 'rock'],
    'rock': ['ground', 'steel', 'fighting'], 'ghost': ['dark', 'poison', 'fighting'], 'dragon': ['fire', 'ground', 'steel'],
    'dark': ['fighting', 'ghost', 'poison'], 'steel': ['ground', 'rock', 'fighting'], 'fairy': ['psychic', 'fire', 'grass'],
}
PHYS = lambda m: MOVES[m]['cat'] == 'physical'


def moveset(sid, tps, base):
    seed = [int(hashlib.md5(sid.encode()).hexdigest(), 16)]

    def pick_n(lst):
        seed[0] //= 7
        return lst[seed[0] % len(lst)] if lst else None
    atk, spa = base[2], base[4]
    lean = 'physical' if atk > spa * 1.08 else 'special' if spa > atk * 1.08 else 'mixed'
    fits = lambda m: lean == 'mixed' or MOVES[m]['cat'] == lean
    chosen = []

    def take(cands):
        cands = [m for m in cands if m not in chosen]
        good = [m for m in cands if fits(m)] or cands
        good.sort(key=lambda m: -MOVES[m]['power'])
        m = pick_n(good[:3])
        if m:
            chosen.append(m)
        return m

    take(pool[tps[0]])
    take(pool[tps[1]] if len(tps) > 1 else pool[tps[0]])
    # A gap-closer (dash) or, for special attackers, a quick ranged move; own type first.
    stab = pool[tps[0]] + (pool[tps[1]] if len(tps) > 1 else [])
    quick = [m for m in stab if MOVES[m]['ai'] == ('dash' if lean != 'special' else 'ranged') and m not in chosen]
    if not take(quick):
        take([m for t in pool for m in pool[t] if MOVES[m]['ai'] == 'dash' and t in ('normal', tps[0])] or pool['normal'])
    for t in COVER[tps[0]]:
        if take([m for m in pool[t] if fits(m)] or pool[t]):
            break
    while len(chosen) < 4:
        take(stab + pool['normal'])
    return chosen


def stats_of(dex):
    s = stats[int(default[dex]['id'])]
    return [s[1], s[2], s[3], s[4], s[5], s[6]]


rows = []
for r in new:
    p = default[r['dex']]
    pid = int(p['id'])
    tps, base = types[pid], stats_of(r['dex'])
    cls = 'M' if r['mythical'] else 'L' if r['legendary'] else 'R'
    floats = 'flying' in tps or 'levitate' in abilities[pid]
    rows.append([r['dex'], r['id'], names[r['dex']], '/'.join(tps), base, int(p['weight']) / 10, ' '.join(moveset(r['id'], tps, base)), cls,
                 {'sprite': r['ident'], **({'hover': [12, 2.5, 3]} if floats else {})}])

official = {r['id']: abilities[int(default[r['dex']]['id'])] for r in finals}
dex_of = {r['id']: r['dex'] for r in finals}
used_abilities = sorted({a for l in official.values() for a in l})

with open(os.path.join(ROOT, 'src/data/national.js'), 'w') as f:
    f.write('// Generated by scripts/build-national.py from PokeAPI (docs/POKEAPI-LICENSE.md) and PMD SpriteCollab. Do not edit by hand.\n')
    f.write('// Every fully evolved Pokémon with complete SpriteCollab sheets that species.js does not hand-tune.\n')
    f.write('// Row: [dex, id, name, types, base stats [HP, Atk, Def, SpA, SpD, Spe], kg, moves, class R/L/M, extra]\n')
    f.write('export const NATIONAL = [\n')
    for row in rows:
        f.write('  ' + json.dumps(row, ensure_ascii=False, separators=(',', ':')) + ',\n')
    f.write('];\n\n// Official abilities (slot 1, slot 2, hidden) of every fully evolved Pokémon in the game.\n')
    f.write('export const OFFICIAL_ABILITIES = ' + json.dumps(official, separators=(',', ':')) + ';\n\n')
    f.write('// National Pokédex numbers.\nexport const DEX = ' + json.dumps(dex_of, separators=(',', ':')) + ';\n\n')
    f.write('// English names of those abilities.\nexport const ABILITY_NAMES = ' + json.dumps({a: ability_name.get(a, a) for a in used_abilities}, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(f'wrote {len(rows)} rows, {len(used_abilities)} abilities')


# ── Sprites (new species) and shiny palettes (every fully evolved species) ──
def sprite_job(r, folder):
    d = f'{r["dex"]:04d}'
    out = os.path.join(ROOT, 'public/sprites', folder)
    os.makedirs(out, exist_ok=True)
    xml_path = os.path.join(out, 'AnimData.xml')
    if not os.path.exists(xml_path):
        data = fetch(f'{COLLAB}sprite/{d}/AnimData.xml')
        open(xml_path, 'wb').write(data)
    anims = {a.findtext('Name'): a.findtext('CopyOf') for a in ET.parse(xml_path).getroot().iter('Anim')}
    sheets = {anims[n] or n for n in anims if n in USED}
    for n in sheets:
        path = os.path.join(out, f'{n}-Anim.png')
        if not os.path.exists(path):
            data = fetch(f'{COLLAB}sprite/{d}/{n}-Anim.png')
            if data:
                open(path, 'wb').write(data)
    if not os.path.exists(os.path.join(out, 'portrait.png')):
        open(os.path.join(out, 'portrait.png'), 'wb').write(fetch(f'{COLLAB}portrait/{d}/Normal.png'))
    shiny_path = os.path.join(out, 'shiny.json')
    if not os.path.exists(shiny_path):
        # Compared against SpriteCollab's current normal sheet: a sheet downloaded earlier may be an older drawing.
        sheet = anims.get('Idle') or 'Idle'
        shiny, normal = fetch(f'{COLLAB}sprite/{d}/0000/0001/{sheet}-Anim.png'), fetch(f'{COLLAB}sprite/{d}/{sheet}-Anim.png')
        if shiny and normal:
            a = Image.open(io.BytesIO(normal)).convert('RGBA')
            b = Image.open(io.BytesIO(shiny)).convert('RGBA')
            votes = collections.defaultdict(collections.Counter)
            if a.size == b.size:
                for pa, pb in zip(a.getdata(), b.getdata()):
                    if pa[3] and pb[3] and pa[:3] != pb[:3]:
                        votes['%02x%02x%02x' % pa[:3]]['%02x%02x%02x' % pb[:3]] += 1
            palette = {k: v.most_common(1)[0][0] for k, v in votes.items()}
            json.dump(palette, open(shiny_path, 'w'), separators=(',', ':'))
    return folder


if '--no-sprites' in sys.argv:
    sys.exit()
jobs = [(r, r['ident']) for r in new] + [(r, existing[key(r['ident'])]['sprite']) for r in finals if key(r['ident']) in existing]
done = 0
with cf.ThreadPoolExecutor(8) as ex:
    for fut in cf.as_completed([ex.submit(sprite_job, r, folder) for r, folder in jobs]):
        fut.result()
        done += 1
        if done % 50 == 0:
            print(f'{done}/{len(jobs)} sprite folders')
print('sprites done')


# ── Body measurements (as measureDims in src/assets.js does in the browser) and the shiny list ──
def js_round(v):
    return int(v + 0.5) if v >= 0 else -int(-v + 0.5)


def measure(folder):
    root = ET.parse(os.path.join(ROOT, 'public/sprites', folder, 'AnimData.xml')).getroot()
    anims = {a.findtext('Name'): a for a in root.iter('Anim')}
    idle = anims['Idle']
    src = anims.get(idle.findtext('CopyOf')) if idle.findtext('CopyOf') else idle
    fw, fh = int(src.findtext('FrameWidth')), int(src.findtext('FrameHeight'))
    img = Image.open(os.path.join(ROOT, 'public/sprites', folder, f'{src.findtext("Name")}-Anim.png')).convert('RGBA').crop((0, 0, fw, fh))
    box = img.getchannel('A').getbbox()
    top, left, right = (box[1], box[0], box[2] - 1) if box else (fh, fw, 0)
    h = max(16, fh / 2 - top)
    radius = js_round(min(20, max(8, (right - left + 1) * 0.32)))
    return [radius, js_round(h * 0.45), js_round(h * 0.92), js_round(h * 0.68), js_round(radius * 0.7), js_round(radius * 0.36)]


dims = {r['ident']: measure(r['ident']) for r in new}
palette = lambda r: os.path.join(ROOT, 'public/sprites', r['ident'] if r in new else existing[key(r['ident'])]['sprite'], 'shiny.json')
shiny = sorted(r['id'] for r in finals if os.path.exists(palette(r)) and os.path.getsize(palette(r)) > 2)
with open(os.path.join(ROOT, 'src/data/national-dims.js'), 'w') as f:
    f.write('// Generated by scripts/build-national.py. Body sizes measured from each new sprite\'s first Idle frame,\n')
    f.write('// as measureDims (src/assets.js) does: [radius, bodyZ, headZ, mouth z, mouth forward, shadow height].\n')
    f.write('export const NATIONAL_DIMS = ' + json.dumps(dims, separators=(',', ':')) + ';\n\n')
    f.write('// Species with a shiny palette (public/sprites/<sprite>/shiny.json).\n')
    f.write('export const SHINY = ' + json.dumps(shiny, separators=(',', ':')) + ';\n')
print(f'measured {len(dims)} sprites, {len(shiny)} shiny palettes')
