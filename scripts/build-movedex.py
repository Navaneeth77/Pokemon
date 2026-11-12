#!/usr/bin/env python3
"""Builds the move database and Smogon movesets.

Reads Showdown's move table (moves.json) and Smogon's Random Battle sets (gen 9 → 8 → 7) from <cache dir>, and
writes:
  src/data/movedex.js  every move any playable Pokémon's moveset uses: type, category, power, accuracy, priority,
                       flags and effects, in the shape src/moves.js and src/effects-resolver.js expect.
  src/data/smogon.js   SMOGON_ABILITIES (abilities in order of use) and SMOGON_MOVES (four moves per Pokémon,
                       picked from its main Smogon role: signature and same-type attacks first, then the role's
                       setup, recovery and utility, then coverage).

Moves whose core mechanic this game doesn't have (Encore, Trick, Baton Pass, Tera Blast…) are skipped in favour
of the next move in the role.

Usage: scripts/build-movedex.py <cache dir>
"""
import collections, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = sys.argv[1]
key = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())


def camel(name):
    words = re.sub(r"['’]", '', name).replace('-', ' ')
    words = re.sub(r'[^A-Za-z0-9 ]', ' ', words).split()
    return words[0].lower() + ''.join(w[:1].upper() + w[1:].lower() for w in words[1:])


MOVES = json.load(open(os.path.join(CACHE, 'moves.json')))
sets = {}
for g in (7, 8, 9):
    for name, v in json.load(open(os.path.join(CACHE, f'gen{g}randombattle.json' if os.path.exists(os.path.join(CACHE, f'gen{g}randombattle.json')) else f'gen{g}rb.json'))).items():
        sets[key(name)] = v

national = open(os.path.join(ROOT, 'src/data/national.js'), encoding='utf-8').read()
dex = json.loads(re.search(r'export const DEX = (\{.*?\});', national).group(1))
types = {}
for row in re.findall(r'^\s+\[\d+,"(\w+)","[^"]*","([a-z/]+)"', national, re.M):
    types[row[0]] = row[1].split('/')
game = json.load(open(os.path.join(CACHE, 'game.json')))  # existing species: { id, sprite, name, ability, cls }
ultimates = set(json.load(open(os.path.join(CACHE, 'ultimates.json'))))
species_types = json.load(open(os.path.join(CACHE, 'types.json')))
species_ult = json.load(open(os.path.join(CACHE, 'species-ult.json')))

# Mechanics this game doesn't model (yet): never put in a moveset.
UNSUPPORTED = {'encore', 'trick', 'switcheroo', 'batonpass', 'teleport', 'terablast', 'sleeptalk', 'destinybond', 'painsplit', 'counter',
               'mirrorcoat', 'metalburst', 'shedtail', 'revivalblessing', 'transform', 'metronome', 'lastresort', 'courtchange', 'memento',
               'healingwish', 'lunardance', 'partingshot', 'chillyreception', 'whirlwind', 'roar', 'dragontail', 'circlethrow', 'yawn',
               'perishsong', 'disable', 'imprison', 'snatch', 'magiccoat', 'allyswitch', 'skillswap', 'entrainment', 'trickroom',
               'tailwind', 'lightscreen', 'reflect', 'auroraveil', 'focuspunch', 'beakblast', 'shelltrap', 'futuresight', 'doomdesire',
               'filletaway', 'clangoroussoul', 'stuffcheeks', 'spitup', 'stockpile', 'swallow', 'naturepower',
               'copycat', 'mefirst', 'assist', 'sketch', 'mimic', 'conversion', 'conversion2', 'camouflage', 'powertrick', 'powersplit',
               'guardsplit', 'speedswap', 'heartswap', 'psychup', 'spectralthief', 'gastroacid', 'worryseed', 'simplebeam', 'soak',
               'magicpowder', 'forestscurse', 'trickortreat', 'lockon', 'mindreader', 'foresight', 'odorsleuth', 'miracleeye', 'healblock',
               'embargo', 'telekinesis', 'gravity', 'magicroom', 'wonderroom', 'ingrain', 'aquaring', 'focusenergy', 'laserfocus',
               'acupressure', 'curse', 'nightmare', 'spite', 'grudge', 'torment', 'block', 'meanlook', 'spiderweb', 'jawlock',
               'octolock', 'fairylock', 'noretreat', 'stuffcheeks', 'teatime', 'celebrate', 'happyhour', 'holdhands', 'hyperspacefury',
               'rollout', 'iceball', 'uproar', 'thrash', 'petaldance', 'ragingfury', 'bide', 'solarblade', 'meteorbeam', 'electroshot',
               'skullbash', 'razorwind', 'skyattack', 'freezeshock', 'iceburn', 'geomancy', 'phantomforce', 'shadowforce', 'fly',
               'bounce', 'dig', 'dive', 'skydrop', 'focuspunch', 'synchronoise', 'dreameater', 'snore', 'fling', 'naturalgift',
               'present', 'beatup', 'magnitude', 'secretpower'}

# Moves the game now has mechanics for: allowed in competitive pools (default movesets still skip them).
POOL_OK = {'encore', 'terablast', 'trick', 'dragontail', 'sleeptalk', 'roar', 'curse', 'painsplit', 'meteorbeam', 'yawn', 'teleport',
           'healingwish', 'switcheroo', 'whirlwind', 'destinybond', 'partingshot', 'reflect', 'lightscreen', 'mirrorcoat', 'trickroom',
           'counter', 'shedtail', 'auroraveil', 'celebrate', 'circlethrow', 'futuresight', 'skyattack', 'fly', 'happyhour', 'holdhands',
           'focusenergy', 'bounce', 'chillyreception', 'tailwind', 'dig', 'metalburst', 'conversion', 'focuspunch', 'copycat',
           'petaldance', 'geomancy', 'block', 'soak', 'clangoroussoul', 'spectralthief', 'courtchange', 'phantomforce',
           'revivalblessing', 'filletaway', 'beatup', 'doomdesire', 'lunardance', 'bugbite'}

DAMAGING = lambda m: m['category'] != 'Status'


def effects(m):
    """The move's data in the game's shape (see src/data/movedex.js header)."""
    out = {'name': m['name'], 'type': m['type'].lower(), 'cat': m['category'].lower(), 'power': m.get('basePower') or 0,
           'acc': 100 if m.get('accuracy') is True else m.get('accuracy', 100), 'pri': m.get('priority', 0), 'target': m.get('target')}
    f = m.get('flags', {})
    for k in ('contact', 'punch', 'bite', 'sound', 'bullet', 'pulse', 'slicing', 'wind', 'powder', 'dance', 'heal', 'charge', 'recharge'):
        if f.get(k):
            out.setdefault('flags', []).append(k)
    sec = m.get('secondary') or {}
    secs = m.get('secondaries') or ([sec] if sec else [])
    for s in secs:
        e = {'chance': s.get('chance', 100)}
        if s.get('status'):
            e['status'] = s['status']
        if s.get('volatileStatus') == 'flinch':
            e['flinch'] = True
        if s.get('boosts'):
            e['boosts'] = s['boosts']
        if s.get('self', {}).get('boosts'):
            e['self'] = s['self']['boosts']
        if len(e) > 1:
            out.setdefault('secondary', []).append(e)
    if m.get('self', {}).get('boosts'):
        out['selfBoosts'] = m['self']['boosts']
    if m.get('boosts'):
        out['boosts'] = m['boosts']  # status moves: on the target ('self' target means the user)
    for k in ('status', 'volatileStatus', 'sideCondition', 'weather', 'terrain', 'selfSwitch', 'multihit', 'critRatio', 'forceSwitch'):
        if m.get(k) not in (None, False):
            out[{'volatileStatus': 'volatile', 'sideCondition': 'side'}.get(k, k)] = m[k]
    if m.get('heal'):
        out['heal'] = m['heal'][0] / m['heal'][1]
    if m.get('drain'):
        out['drain'] = m['drain'][0] / m['drain'][1]
    if m.get('recoil'):
        out['recoil'] = m['recoil'][0] / m['recoil'][1]
    if m.get('ohko'):
        out['ohko'] = True
    if m.get('accuracy') is True:
        out['sure'] = True  # never misses: ignores accuracy and evasion (Swift, Aura Sphere…)
    return out


def role_moves(v):
    roles = v.get('roles') or {}
    if roles:
        name, r = next(iter(roles.items()))
        return name, list(r.get('moves', []))
    return '', list(v.get('moves', []))


def other_moves(v):
    out = list(v.get('moves', []))
    for r in list((v.get('roles') or {}).values())[1:]:
        out += [m for m in r.get('moves', []) if m not in out]
    return out


# Species whose identity is their gimmick get a hand-picked set (Castform plays the weather; Venusaur is a
# sun sweeper with Chlorophyll).
OVERRIDES = {
    'castform': ['Weather Ball', 'Rain Dance', 'Sunny Day', 'Thunder'],
    'venusaur': ['Solar Beam', 'Sludge Bomb', 'Leech Seed', 'Synthesis'],
}


usage = collections.Counter()
for sid in dex:
    v = sets.get(key(sid))
    if v:
        _, ms = role_moves(v)
        for mv in ms:
            usage[key(mv)] += 1


def pick_four(sid, v):
    if sid in OVERRIDES:
        return [MOVES[key(n)] for n in OVERRIDES[sid]]
    role, pool = role_moves(v)
    # Too few after skipping (the species' ultimate, unsupported moves): its other roles fill the rest.
    if sum(1 for n in pool if key(n) in MOVES and key(n) not in UNSUPPORTED and camel(MOVES[key(n)]['name']) != species_ult.get(sid)) < 4:
        pool += [n for n in other_moves(v) if n not in pool]
    my_types = species_types.get(sid) or types.get(sid) or []
    ult = species_ult.get(sid)
    scored = []
    for name in pool:
        k = key(name)
        m = MOVES.get(k)
        if not m or k in UNSUPPORTED or camel(m['name']) == ult:
            continue
        s = 0.0
        if DAMAGING(m):
            stab = m['type'].lower() in my_types
            s += 3 + (1.5 if stab else 0) + (m.get('basePower') or 60) / 100
            if usage[k] <= 2 and stab:
                s += 4  # signature move
        else:
            setup = any(b > 0 for b in (m.get('boosts') or {}).values()) and m.get('target') == 'self'
            if setup:
                s += 2.5 + (1 if 'Setup' in role or 'Sweeper' in role else 0)
            elif m.get('heal') or k in ('roost', 'recover', 'slackoff', 'softboiled', 'synthesis', 'moonlight', 'morningsun', 'rest', 'wish', 'strengthsap', 'shoreup'):
                s += 2 + (1 if 'Bulky' in role or 'Support' in role or 'Wall' in role else 0)
            else:
                s += 1.6 + (0.8 if 'Support' in role or 'Bulky' in role else 0)
        scored.append((s, name, m))
    scored.sort(key=lambda x: -x[0])
    chosen = []
    for s, name, m in scored:
        damaging = sum(1 for _, _, c in chosen if DAMAGING(c))
        status = len(chosen) - damaging
        if not DAMAGING(m) and status >= 2:
            continue
        if DAMAGING(m) or damaging >= 2 or len(scored) - len(chosen) <= 4 - len(chosen):
            chosen.append((s, name, m))
        if len(chosen) == 4:
            break
    # Never fewer than two attacks.
    for s, name, m in scored:
        if len(chosen) >= 4:
            break
        if (s, name, m) not in chosen:
            chosen.append((s, name, m))
    return [m for _, _, m in chosen[:4]]



movesets, used = {}, {}
for sid in dex:
    v = sets.get(key(sid))
    if not v:
        continue
    four = pick_four(sid, v)
    ids = []
    for m in four:
        mid = camel(m['name'])
        if mid in ultimates:
            mid += 'Atk'  # same name as an ultimate in this game: the regular move gets its own id
        ids.append(mid)
        used[mid] = effects(m)
    movesets[sid] = ids

# Each Pokémon's competitive pool for the move picker: every move in its Smogon sets (all roles; gen 9, falling back
# to gen 8, then 7), minus mechanics this game doesn't model and its own ultimate, plus its default four.
per_gen = {}
for g in (7, 8, 9):
    path = os.path.join(CACHE, f'gen{g}randombattle.json' if os.path.exists(os.path.join(CACHE, f'gen{g}randombattle.json')) else f'gen{g}rb.json')
    per_gen[g] = {key(n): v for n, v in json.load(open(path)).items()}
pools = {}
for sid in dex:
    # The union of its sets across Gens 9, 8 and 7, newest first.
    names = []
    for g in (9, 8, 7):
        v = per_gen[g].get(key(sid))
        if not v:
            continue
        for n in v.get('moves', []) + [n for r in (v.get('roles') or {}).values() for n in r.get('moves', [])]:
            if n not in names:
                names.append(n)
    if not names:
        continue
    ult = species_ult.get(sid)
    ids = list(movesets.get(sid, []))
    for name in names:
        k = key(name)
        m = MOVES.get(k)
        if not m or (k in UNSUPPORTED and k not in POOL_OK) or camel(m['name']) == ult:
            continue
        mid = camel(m['name'])
        if mid in ultimates:
            mid += 'Atk'
        if mid not in ids:
            ids.append(mid)
        used.setdefault(mid, effects(m))
    pools[sid] = ids


# ── Roles: support, physical attacker or special attacker, from how Smogon's sets play each Pokémon ──
# Support when its main Random Battle role (newest generation first) is a support role; otherwise whichever of physical and
# special attacks dominates its competitive moves; a tie goes to its higher official attacking stat (pokemon_stats.csv).
SUPPORT_ROLES = {'Bulky Support', 'Fast Support'}
official = {}
spath = os.path.join(CACHE, 'pokemon_stats.csv')
if os.path.exists(spath):
    import csv as _csv
    ids = {r['id']: r['identifier'] for r in _csv.DictReader(open(os.path.join(CACHE, 'pokemon.csv')))}
    for r in _csv.DictReader(open(spath)):
        official.setdefault(key(ids.get(r['pokemon_id'], '')), {})[{'2': 'atk', '4': 'spa'}.get(r['stat_id'], '_')] = int(r['base_stat'])
roles = {}
for sid in dex:
    sets = [per_gen[g].get(key(sid)) for g in (9, 8, 7)]
    main = next((list(v['roles'])[0] for v in sets if v and v.get('roles')), None)
    any_support = any(r in SUPPORT_ROLES for v in sets if v for r in (v.get('roles') or {}))
    st = official.get(key(sid)) or next((v for k, v in official.items() if k.startswith(key(sid))), {})  # giratina → giratina-altered
    best = max(st.get('atk', 0), st.get('spa', 0))
    # A support plays a support role and doesn't hit hard (Blissey, Toxapex, Corviknight, Clefable), not a strong attacker
    # that also sets hazards (Garchomp).
    if any_support and best < 100:
        roles[sid] = 'support'
        continue
    cats = collections.Counter(MOVES[key(n)]['category'] for v in sets if v for n in v.get('moves', []) + [n for r in (v.get('roles') or {}).values() for n in r.get('moves', [])] if key(n) in MOVES)
    if cats['Physical'] == cats['Special']:  # no sets: its default moves, then its stats
        cats = collections.Counter(MOVES[key(n)]['category'] for n in [m['name'] for m in pick_four(sid, sets[0])] if key(n) in MOVES) if sets[0] else cats
    if cats['Physical'] != cats['Special']:
        roles[sid] = 'physical' if cats['Physical'] > cats['Special'] else 'special'
    else:
        roles[sid] = 'physical' if st.get('atk', 0) > st.get('spa', 0) else 'special'

# ── Full learnsets: every move each Pokémon learns in its most recent games, for the move picker ──
# Needs <cache>/learnsets.json (Pokémon Showdown's learnsets, as JSON), <cache>/pokemon_species.csv (for the moves a
# Pokémon learns as an earlier evolution) and <cache>/playable.json (node scripts/export-playable.mjs <cache>: the moves
# this game already plays). A move is kept when the game already has it, or when it can be built from the official data
# alone: an attack with a fixed power, or a status move that only changes stats, inflicts a status or heals. Moves that
# need rules of their own (Attract, Baton Pass, Perish Song, OHKO moves, two-turn moves…) wait for those rules.
LEARN, PLAY, SPEC = (os.path.join(CACHE, f) for f in ('learnsets.json', 'playable.json', 'pokemon_species.csv'))
learnsets, learn_gen = {}, {}
if all(os.path.exists(f) for f in (LEARN, PLAY, SPEC)):
    import csv
    LS = json.load(open(LEARN))
    P = json.load(open(PLAY))
    playable, handled = set(P['playable']), {key(h) for h in P['handled']} | POOL_OK
    ident, prevo = {}, {}
    rows = list(csv.DictReader(open(SPEC)))
    for r in rows:
        ident[r['id']] = key(r['identifier'])
    for r in rows:
        if r['evolves_from_species_id']:
            prevo[key(r['identifier'])] = ident[r['evolves_from_species_id']]
    REGION = ('alola', 'galar', 'hisui', 'paldea')

    def chain(k):
        out, base, suf = [k], k, ''
        for r in REGION:
            if k.endswith(r) and k != r:
                base, suf = k[:-len(r)], r
        while base in prevo:
            base = prevo[base]
            out.append(base + suf if base + suf in LS else base)
        return [c for c in out if 'learnset' in LS.get(c, {})]

    gen_of = lambda code: int(code[0]) if code[:1].isdigit() else 0
    regular = lambda code: len(code) > 1 and code[1] not in 'SV'  # not events or Virtual Console transfers
    NOMINAL = {'reversal': 100, 'flail': 100, 'wringout': 120, 'crushgrip': 120, 'hardpress': 100, 'frustration': 102, 'ruination': 100,
               'fling': 60, 'present': 80, 'finalgambit': 100, 'comeuppance': 100, 'fissure': 150, 'sheercold': 150, 'guillotine': 150, 'horndrill': 150}
    # Moves that only do something in a double battle (or would help the foe in a one-on-one): never offered.
    NOT_SINGLES = {'helpinghand', 'coaching', 'dragoncheer', 'aromaticmist', 'followme', 'ragepowder', 'allyswitch', 'afteryou', 'quash',
                   'spotlight', 'gearup', 'magneticflux', 'healpulse', 'floralhealing', 'decorate', 'snatch', 'wideguard', 'craftyshield',
                   'quickguard', 'matblock', 'flowershield', 'rototiller', 'teatime', 'instruct', 'pollenpuff', 'lifedew', 'junglehealing'}
    SELFISH = ('self', 'adjacentAllyOrSelf', 'allies')

    def learn_ok(k, m):
        if m.get('isZ') or m.get('isMax') or m.get('isNonstandard') in ('CAP', 'LGPE', 'Custom', 'Future', 'Unobtainable') or k in NOT_SINGLES:
            return False
        if k in handled:
            return True  # the game has rules for it (effects-resolver.js, effects-extra.js)
        if k in UNSUPPORTED and k not in POOL_OK:
            return False
        if any(m.get(f) for f in ('callsMove', 'selfdestruct', 'pseudoWeather', 'slotCondition', 'stallingMove', 'ohko', 'damage')):
            return False
        if m.get('flags', {}).get('charge'):
            return False  # two-turn moves need their own action
        if m['category'] != 'Status':
            return bool(m.get('basePower')) and not m.get('basePowerCallback')
        if any(m.get(f) for f in ('volatileStatus', 'sideCondition', 'weather', 'terrain', 'condition', 'selfSwitch', 'forceSwitch')):
            return False
        b = m.get('boosts')
        if b and m.get('target') not in SELFISH and any(v > 0 for v in b.values()):
            return False  # it would raise the foe's stats in a one-on-one battle
        if m.get('target') in ('adjacentAlly', 'allySide', 'allyTeam'):
            return False
        return bool(b or m.get('status') or m.get('heal'))

    for sid in dex:
        ks = chain(key(sid))
        if not ks:
            continue
        top = max((gen_of(c) for codes in LS[ks[0]]['learnset'].values() for c in codes if regular(c)), default=0)
        names = sorted({mk for c in ks for mk, codes in LS[c]['learnset'].items() if any(gen_of(x) == top and regular(x) for x in codes)})
        ult, ids = species_ult.get(sid), []
        for mk in names:
            m = MOVES.get(mk)
            if not m or camel(m['name']) == ult:
                continue
            mid = camel(m['name'])
            if mid in ultimates:
                mid += 'Atk'
            if not (mid in playable or mid in used or learn_ok(mk, m)):
                continue
            # Every move it can learn takes the official data (accuracy, priority, flags, effects), hand-made or not.
            e = effects(m)
            if mid not in playable and mk in NOMINAL and not e['power']:
                e['power'] = NOMINAL[mk]
            used.setdefault(mid, e)
            ids.append(mid)
        learnsets[sid] = ids
        if top != 9:
            learn_gen[sid] = top

smogon_path = os.path.join(ROOT, 'src/data/smogon.js')
head = open(smogon_path, encoding='utf-8').read().split('\nexport const SMOGON_MOVES')[0].rstrip('\n')
head = re.sub(r'(\n+// Four moves per Pokémon[^\n]*)+$', '', head)  # written again below
with open(smogon_path, 'w', encoding='utf-8') as f:
    f.write(head + '\n\n// Four moves per Pokémon from its main Smogon role (see scripts/build-movedex.py).\n')
    f.write('export const SMOGON_MOVES = ' + json.dumps(movesets, separators=(',', ':')) + ';\n')
    f.write('\n// Every move a Pokémon may pick in the move picker: its Smogon competitive pool (see scripts/build-movedex.py).\n')
    f.write('export const SMOGON_POOLS = ' + json.dumps(pools, separators=(',', ':')) + ';\n')
    f.write('\n// Each Pokémon\'s role: support, physical or special attacker (see scripts/build-movedex.py).\n')
    f.write('export const SMOGON_ROLES = ' + json.dumps(roles, separators=(',', ':')) + ';\n')

with open(os.path.join(ROOT, 'src/data/movedex.js'), 'w', encoding='utf-8') as f:
    f.write("""// Generated by scripts/build-movedex.py from Showdown's move table. Do not edit by hand.
// Every move a playable Pokémon's moveset uses: { name, type, cat (physical/special/status), power, acc (0–100),
// pri (priority), target, flags [contact, punch, bite, sound, bullet, pulse, slicing, wind, powder, dance, heal…],
// secondary [{ chance, status, flinch, boosts (target), self (user) }], selfBoosts, boosts, status, volatile,
// side (hazards), weather, terrain, heal, drain, recoil, multihit, selfSwitch, critRatio }.
// Moves named like one of this game's ultimates get an "Atk" suffix (thunderAtk is the regular Thunder).
export const MOVEDEX = {
""")
    for mid in sorted(used):
        f.write(f'  {mid}: {json.dumps(used[mid], separators=(",", ":"))},\n')
    f.write('};\n')
if learnsets:
    ids = sorted({m for v in learnsets.values() for m in v})
    index = {m: i for i, m in enumerate(ids)}
    b36 = lambda n: '0123456789abcdefghijklmnopqrstuvwxyz'[n // 36] + '0123456789abcdefghijklmnopqrstuvwxyz'[n % 36] if n >= 36 else '0123456789abcdefghijklmnopqrstuvwxyz'[n]
    assert len(ids) < 36 * 36
    with open(os.path.join(ROOT, 'src/data/learnsets.js'), 'w', encoding='utf-8') as f:
        f.write("""// Generated by scripts/build-movedex.py from Pokémon Showdown's learnsets. Do not edit by hand.
// Every move each Pokémon learns in its most recent games (level-up, TM, egg and tutor moves, and moves it learns as an
// earlier evolution; not event moves) that this game can play. LEARN_IDS lists the moves; LEARNSETS gives each
// Pokémon's as base-36 indexes into it, joined by commas. LEARN_GEN names the generation used when it isn't 9.
""")
        f.write('export const LEARN_IDS = ' + json.dumps(ids, separators=(',', ':')) + ';\n')
        f.write('export const LEARNSETS = ' + json.dumps({k: ','.join(b36(index[m]) for m in v) for k, v in learnsets.items()}, separators=(',', ':')) + ';\n')
        f.write('export const LEARN_GEN = ' + json.dumps(learn_gen, separators=(',', ':')) + ';\n')
    sizes = sorted(len(v) for v in learnsets.values())
    print(f'learnsets: {len(learnsets)} Pokémon, {len(ids)} moves, {sizes[len(sizes) // 2]} per Pokémon (median), {sizes[-1]} at most')
print(f'{len(movesets)} movesets, {len(pools)} pools, {len(used)} moves')
