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

smogon_path = os.path.join(ROOT, 'src/data/smogon.js')
head = open(smogon_path, encoding='utf-8').read().split('\nexport const SMOGON_MOVES')[0].rstrip('\n')
with open(smogon_path, 'w', encoding='utf-8') as f:
    f.write(head + '\n\n// Four moves per Pokémon from its main Smogon role (see scripts/build-movedex.py).\n')
    f.write('export const SMOGON_MOVES = ' + json.dumps(movesets, separators=(',', ':')) + ';\n')

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
print(f'{len(movesets)} movesets, {len(used)} moves')
