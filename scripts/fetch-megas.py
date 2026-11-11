#!/usr/bin/env python3
"""Downloads the PMD SpriteCollab sheets for Mega Evolutions into public/sprites/<base>-mega/.

For each Mega listed below: AnimData.xml, the animation sheets the game uses and the portrait, from the form's
folder in SpriteCollab (found in <cache>/tracker.json). Files already on disk are kept.

Usage: scripts/fetch-megas.py <cache dir> [base ...]
"""
import json, os, sys, time, urllib.error, urllib.request, xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLLAB = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/'
USED = {'Idle', 'Walk', 'Attack', 'Strike', 'Shoot', 'SpAttack', 'Swing', 'Charge', 'Hurt', 'Faint', 'Hop', 'RearUp', 'Rotate', 'Double', 'Roar', 'Launch', 'Pose'}
# base species id -> (national dex number, the Mega form's name in SpriteCollab)
MEGAS = {
    'slowbro': (80, 'Mega'), 'steelix': (208, 'Mega'), 'skarmory': (227, 'Mega'), 'houndoom': (229, 'Mega'), 'sableye': (302, 'Mega'),
    'mawile': (303, 'Mega'), 'medicham': (308, 'Mega'), 'manectric': (310, 'Mega'), 'sharpedo': (319, 'Mega'), 'camerupt': (323, 'Mega'),
    'altaria': (334, 'Mega'), 'banette': (354, 'Mega'), 'glalie': (362, 'Mega'), 'lopunny': (428, 'Mega'), 'gallade': (475, 'Mega'),
    'excadrill': (530, 'Mega'), 'scrafty': (560, 'Mega'), 'eelektross': (604, 'Mega'), 'dragalge': (691, 'Mega'), 'zygarde': (718, 'Mega'),
    'drampa': (780, 'Mega'), 'tatsugiri': (978, 'Mega'),
}


def fetch(url, tries=5):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(1 + i)
        except Exception:
            time.sleep(1 + i)
    raise RuntimeError(f'could not fetch {url}')


def form_path(tracker, dex, name):
    """The SpriteCollab path ('0080/0002') of the form with this name and a complete Idle/Walk/Attack set."""
    entry = tracker[f'{dex:04d}']
    for k, v in (entry.get('subgroups') or {}).items():
        if v.get('name') == name and {'Idle', 'Walk', 'Attack'} <= set(v.get('sprite_files', {})):
            return f'{dex:04d}/{k}'
    raise SystemExit(f'no complete {name} sheet for #{dex}')


def main():
    cache, only = sys.argv[1], set(sys.argv[2:])
    tracker = json.load(open(os.path.join(cache, 'tracker.json')))
    total = 0
    for base, (dex, name) in MEGAS.items():
        if only and base not in only:
            continue
        path, folder = form_path(tracker, dex, name), f'{base}-mega'
        out = os.path.join(ROOT, 'public/sprites', folder)
        os.makedirs(out, exist_ok=True)
        xml_path = os.path.join(out, 'AnimData.xml')
        if not os.path.exists(xml_path):
            data = fetch(f'{COLLAB}sprite/{path}/AnimData.xml')
            open(xml_path, 'wb').write(data)
            total += len(data)
        anims = {a.findtext('Name'): a.findtext('CopyOf') for a in ET.parse(xml_path).getroot().iter('Anim')}
        for n in sorted({anims[n] or n for n in anims if n in USED}):
            p = os.path.join(out, f'{n}-Anim.png')
            if not os.path.exists(p):
                data = fetch(f'{COLLAB}sprite/{path}/{n}-Anim.png')
                if data:
                    open(p, 'wb').write(data)
                    total += len(data)
        p = os.path.join(out, 'portrait.png')
        if not os.path.exists(p):
            data = fetch(f'{COLLAB}portrait/{path}/Normal.png') or fetch(f'{COLLAB}portrait/{dex:04d}/Normal.png')
            open(p, 'wb').write(data)
            total += len(data)
        print(f'{folder:18s} from {path}: {len(os.listdir(out))} files')
    print(f'downloaded {total / 1e6:.2f} MB')


main()
