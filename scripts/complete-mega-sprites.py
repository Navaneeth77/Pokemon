#!/usr/bin/env python3
"""Complete the partial Mega sheets from their own eight-direction Idle frames.

Run with Pillow installed: python3 scripts/complete-mega-sprites.py
Source art and credits are in public/sprites. Each frame uses nearest-neighbor
rotation and keeps the original tile center so the in-game anchor stays fixed.
"""
from math import cos, pi, sin
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image

SPRITES = Path(__file__).resolve().parents[1] / 'public' / 'sprites'

# (source frame, forward displacement, lift, bank angle), with durations in 60 Hz ticks.
CHIMECHO = {
    'Walk': ([(0, 0, 0, 0), (0, 1, 1, 5), (0, 2, 2, 8), (0, 1, 1, 4),
              (0, 0, 0, 0), (0, -1, 1, -5), (0, -2, 2, -8), (0, -1, 1, -4)], [5] * 8, {}),
    'Attack': ([(0, 0, 0, 0), (0, -4, 2, -12), (0, -6, 4, -19), (0, 7, 4, 18),
                (0, 4, 2, 11), (0, -2, 1, -5), (0, 0, 0, 0)],
               [4, 4, 3, 5, 5, 5, 4], {'RushFrame': 2, 'HitFrame': 3, 'ReturnFrame': 5}),
    'Shoot': ([(0, 0, 0, 0), (0, -2, 3, -7), (0, -4, 6, -12), (0, 3, 3, 10),
               (0, 2, 1, 4), (0, 0, 0, 0)], [5, 4, 4, 6, 5, 5], {'HitFrame': 3}),
    'Charge': ([(0, 0, 0, 0), (0, 0, 2, -6), (0, 0, 4, -9), (0, 0, 5, 0),
                (0, 0, 4, 9), (0, 0, 2, 6)], [6, 5, 5, 5, 5, 5], {'HitFrame': 3}),
    'Hurt': ([(0, -4, 1, -11), (0, -6, 3, -17), (0, -2, 0, -6), (0, 0, 0, 0)], [3, 4, 5, 5], {}),
}

HAWLUCHA = {
    'Shoot': ([(0, 0, 0, 0), (1, -2, 1, -4), (2, -3, 4, -7), (3, 4, 3, 8),
               (4, 3, 1, 4), (0, 0, 0, 0)], [5, 5, 4, 6, 4, 4], {'HitFrame': 3}),
    'Charge': ([(0, 0, 0, 0), (1, -1, -1, -4), (2, -2, -2, -6), (3, -1, 0, -2),
                (4, 0, 2, 2), (5, 0, 1, 0)], [6, 5, 5, 5, 5, 5], {'HitFrame': 4}),
    'Hurt': ([(2, -3, 2, -8), (3, -5, 3, -11), (4, -2, 1, -3), (0, 0, 0, 0)], [3, 4, 4, 5], {}),
}


def complete(folder, motions, aliases):
    out = SPRITES / folder
    xml = out / 'AnimData.xml'
    tree = ET.parse(xml)
    anims = tree.find('Anims')
    idle = next(anim for anim in anims if anim.findtext('Name') == 'Idle')
    width = int(idle.findtext('FrameWidth'))
    height = int(idle.findtext('FrameHeight'))
    sheet = Image.open(out / 'Idle-Anim.png').convert('RGBA')
    assert sheet.height == height * 8
    # Padding prevents edge pixels from getting cut off while a bell swings or a pose lunges.
    padding = 16
    tile_width, tile_height = width + 2 * padding, height + 2 * padding

    names = motions.keys() | aliases.keys()
    for anim in list(anims):
        if anim.findtext('Name') in names:
            anims.remove(anim)
    index = max(int(anim.findtext('Index', '-1')) for anim in anims) + 1

    for name, (poses, ticks, events) in motions.items():
        strip = Image.new('RGBA', (tile_width * len(poses), tile_height * 8))
        for direction in range(8):
            angle = direction * pi / 4
            forward_x, forward_y = sin(angle), cos(angle)
            bank_scale = forward_x if abs(forward_x) > 0.01 else (0.7 if direction == 0 else -0.7)
            for i, (source, forward, lift, bank) in enumerate(poses):
                left, top = source * width, direction * height
                frame = sheet.crop((left, top, left + width, top + height))
                padded = Image.new('RGBA', (tile_width, tile_height))
                padded.paste(frame, (padding, padding))
                # Keep the bell crown / shoulder line stable as the body banks.
                padded = padded.rotate(-bank * bank_scale,
                                       center=(tile_width / 2, tile_height / 2 - height / 4))
                dx = round(forward * forward_x)
                dy = round(forward * forward_y * 0.55) - lift
                shifted = Image.new('RGBA', padded.size)
                shifted.paste(padded, (dx, dy))
                strip.paste(shifted, (i * tile_width, direction * tile_height))
        strip.save(out / f'{name}-Anim.png', optimize=True)
        anim = ET.SubElement(anims, 'Anim')
        for key, value in {'Name': name, 'Index': index, 'FrameWidth': tile_width,
                           'FrameHeight': tile_height, **events}.items():
            ET.SubElement(anim, key).text = str(value)
        durations = ET.SubElement(anim, 'Durations')
        for tick in ticks:
            ET.SubElement(durations, 'Duration').text = str(tick)
        index += 1

    for name, source in aliases.items():
        anim = ET.SubElement(anims, 'Anim')
        ET.SubElement(anim, 'Name').text = name
        ET.SubElement(anim, 'Index').text = str(index)
        ET.SubElement(anim, 'CopyOf').text = source
        index += 1
    ET.indent(tree, space='  ')
    tree.write(xml, encoding='utf-8', xml_declaration=True)


if __name__ == '__main__':
    complete('chimecho-mega', CHIMECHO, {'Swing': 'Attack', 'Hop': 'Attack'})
    complete('hawlucha-mega', HAWLUCHA, {'Attack': 'Swing', 'Hop': 'Double'})
