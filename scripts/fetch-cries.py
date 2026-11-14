#!/usr/bin/env python3
"""Downloads every playable Pokémon's cry from PokeAPI's cries repository (docs/POKEAPI-LICENSE.md) and stores it
as a small mono MP3 in public/cries/<dex>.mp3, which every browser can play. Needs ffmpeg.

Usage: scripts/fetch-cries.py
"""
import concurrent.futures as cf, json, os, re, shutil, subprocess, sys, tempfile, urllib.request

# Checked before downloading anything: without ffmpeg every cry would silently fail to convert.
if not shutil.which('ffmpeg'):
    sys.exit('ffmpeg is required (macOS: brew install ffmpeg; Debian/Ubuntu: sudo apt install ffmpeg).')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/{}.ogg'
OUT = os.path.join(ROOT, 'public/cries')
os.makedirs(OUT, exist_ok=True)

src = open(os.path.join(ROOT, 'src/data/national.js'), encoding='utf-8').read()
dex = sorted(set(json.loads(re.search(r'export const DEX = (\{.*?\});', src).group(1)).values()))


def fetch(n):
    path = os.path.join(OUT, f'{n}.mp3')
    if os.path.exists(path):
        return n, True
    try:
        with urllib.request.urlopen(URL.format(n), timeout=30) as r:
            data = r.read()
    except Exception:
        return n, False
    with tempfile.NamedTemporaryFile(suffix='.ogg') as tmp:
        tmp.write(data)
        tmp.flush()
        ok = subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp.name, '-ac', '1', '-ar', '22050', '-b:a', '40k', path]).returncode == 0
    return n, ok


with cf.ThreadPoolExecutor(8) as ex:
    results = list(ex.map(fetch, dex))
missing = [n for n, ok in results if not ok]
print(f'{len(dex) - len(missing)} cries, missing: {missing}')
