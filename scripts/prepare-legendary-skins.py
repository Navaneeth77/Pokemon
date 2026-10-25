"""Import the supplied pixel art without generating or interpolating sprite pixels.

Shadow Lugia/Dark Rayquaza use the supplied palette on matching native poses. Armor
uses the supplied poses, mirrored into PMD's eight facings. Original XML timings,
anchors are retained, including Mega Mewtwo's gameplay timing. Armor cells widen
only when the supplied pose needs room.
"""
from pathlib import Path
from collections import Counter, defaultdict
import json
import shutil
import xml.etree.ElementTree as ET
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'art/sources/legendary-skins'
SPRITES = ROOT / 'public/sprites'


def cut(image, box, background=None):
    image = image.crop(box).convert('RGBA')
    if background:
        image.putdata([(0, 0, 0, 0) if p[:3] == background else p for p in image.get_flattened_data()])
    return image.crop(image.getbbox())


def components(image, box, background=None, minimum=80):
    image = image.convert('RGBA')
    pixels, seen, result = image.load(), set(), []
    x0, y0, x1, y1 = box
    def valid(x, y):
        return x0 <= x < x1 and y0 <= y < y1 and pixels[x, y][3] and (not background or pixels[x, y][:3] != background)
    for y in range(y0, y1):
        for x in range(x0, x1):
            if (x, y) in seen or not valid(x, y):
                continue
            queue = [(x, y)]
            seen.add((x, y))
            for a, b in queue:
                for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]:
                    p = (a + dx, b + dy)
                    if p not in seen and valid(*p):
                        seen.add(p)
                        queue.append(p)
            if len(queue) >= minimum:
                xs, ys = zip(*queue)
                bounds = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
                component=Image.new('RGBA',(bounds[2]-bounds[0],bounds[3]-bounds[1]))
                for a,b in queue:component.putpixel((a-bounds[0],b-bounds[1]),pixels[a,b])
                result.append((bounds,component))
    return sorted(result, key=lambda p: (p[0][1], p[0][0]))


def silhouette_error(a, b):
    if a.size != b.size:
        return 1 + abs(a.width - b.width) + abs(a.height - b.height)
    aa, ba = a.getchannel('A'), b.getchannel('A')
    return sum(bool(x) != bool(y) for x, y in zip(aa.get_flattened_data(), ba.get_flattened_data())) / (a.width * a.height)


def palette_for(original, reference, region, background=None):
    options = [im for _, im in components(reference, region, background)]
    xml = ET.parse(SPRITES / original / 'AnimData.xml')
    idle = next(a for a in xml.findall('.//Anim') if a.findtext('Name') == 'Idle')
    fw, fh = int(idle.findtext('FrameWidth')), int(idle.findtext('FrameHeight'))
    source = Image.open(SPRITES / original / 'Idle-Anim.png').convert('RGBA')
    votes, errors = defaultdict(Counter), []
    for row in range(8):
        for col in range(source.width // fw):
            frame = cut(source, (col * fw, row * fh, (col + 1) * fw, (row + 1) * fh))
            best = min(options, key=lambda p: silhouette_error(frame, p))
            error = silhouette_error(frame, best)
            errors.append(error)
            if error > .08:
                continue
            for a, b in zip(frame.get_flattened_data(), best.get_flattened_data()):
                if a[3] and b[3]:
                    votes[a[:3]][b[:3]] += 1
    palette = {a: c.most_common(1)[0][0] for a, c in votes.items()}
    print(original, 'matched poses:', len([e for e in errors if e < .08]), '/', len(errors), 'palette:', palette)
    if len(palette) < 8:
        raise ValueError(f'Insufficient matching source pixels for {original}')
    return palette


def recolor(original, destination, palette):
    src, dst = SPRITES / original, SPRITES / destination
    dst.mkdir(exist_ok=True)
    shutil.copyfile(src / 'AnimData.xml', dst / 'AnimData.xml')
    for path in src.glob('*.png'):
        image = Image.open(path).convert('RGBA')
        mapped = {}
        for color in set(image.get_flattened_data()):
            rgb = color[:3]
            nearest = min(palette, key=lambda c: sum((a-b)**2 for a, b in zip(c, rgb)))
            mapped[color] = (*palette.get(rgb, palette[nearest]), color[3]) if color[3] else color
        image.putdata([mapped[p] for p in image.get_flattened_data()])
        image.save(dst / path.name, optimize=True)


def restore_shadow_eyes(reference):
    """Copy the supplied red eye pixels, including details a majority palette loses.

    Match native poses to the reference silhouette first, then use exact local
    native eye patterns to carry those same pixels into intermediate animation frames.
    The native alpha mask and all original frame anchors remain unchanged.
    """
    options = [im for _,im in components(reference,(10,34,489,613),(0,128,128))]
    options += [im for _,im in components(reference,(490,34,650,320),(0,128,128))]
    red = {(255,0,0),(128,0,0)}
    xml = ET.parse(SPRITES/'lugia/AnimData.xml')
    frames, patterns = [], {3:{},2:{}}
    cache, heads = {}, defaultdict(list)
    for anim in xml.findall('.//Anim'):
        if anim.find('CopyOf') is not None: continue
        name=anim.findtext('Name')
        if not (SPRITES/f'lugia/{name}-Anim.png').exists():continue
        fw=int(anim.findtext('FrameWidth'));fh=int(anim.findtext('FrameHeight'))
        original=Image.open(SPRITES/f'lugia/{name}-Anim.png').convert('RGBA')
        for row in range(8):
            for col in range(original.width//fw):
                cell=original.crop((col*fw,row*fh,(col+1)*fw,(row+1)*fh));bounds=cell.getbbox()
                if not bounds: continue
                frame=cell.crop(bounds);key=(frame.size,frame.tobytes())
                if key not in cache:
                    best=min(options,key=lambda im:silhouette_error(frame,im))
                    mask={}
                    if silhouette_error(frame,best)<.005:
                        for y in range(frame.height):
                            for x in range(frame.width):
                                c=best.getpixel((x,y))
                                if c[:3] in red and c[3] and frame.getpixel((x,y))[3]:mask[x,y]=c
                    cache[key]=mask
                    for (x,y),color in mask.items():
                        for radius,table in patterns.items():
                            box=(x-radius,y-radius,x+radius+1,y+radius+1)
                            table[frame.crop(box).tobytes()]=color
                mask=cache[key]
                if mask:
                    xs,ys=zip(*mask);box=(min(xs)-3,min(ys)-3,max(xs)+4,max(ys)+4)
                    patch=frame.crop(box);seed=next(iter(mask));offset=(seed[0]-box[0],seed[1]-box[1])
                    detail={(x-box[0],y-box[1]):c for (x,y),c in mask.items()}
                    item=(patch,offset,frame.getpixel(seed),detail)
                    if not any(patch.tobytes()==h[0].tobytes() for h in heads[row]):heads[row].append(item)
                frames.append((name,row,col*fw+bounds[0],row*fh+bounds[1],frame,mask))
    sheets={};counts=Counter()
    for name,row,ox,oy,frame,mask in frames:
        if name not in sheets:sheets[name]=Image.open(SPRITES/f'lugia-shadow/{name}-Anim.png').convert('RGBA')
        if not mask:
            mask={}
            for y in range(frame.height):
                for x in range(frame.width):
                    pixel=frame.getpixel((x,y))
                    if not pixel[3] or max(pixel[:3])>160:continue
                    for radius,table in patterns.items():
                        color=table.get(frame.crop((x-radius,y-radius,x+radius+1,y+radius+1)).tobytes())
                        if color:
                            mask[x,y]=color;break
        if not mask and heads[row]:
            # Some intermediate poses change a few cheek pixels. Align the complete
            # eye group to its nearest native head, within this same facing only.
            best=(1,None)
            for patch,offset,seed,detail in heads[row]:
                raw=patch.tobytes()
                for y in range(frame.height//2):
                    for x in range(frame.width):
                        if frame.getpixel((x,y))!=seed:continue
                        px,py=x-offset[0],y-offset[1]
                        candidate=frame.crop((px,py,px+patch.width,py+patch.height)).tobytes()
                        error=sum(a!=b for a,b in zip(raw,candidate))/len(raw)
                        if error<best[0]:best=(error,(px,py,detail))
            if best[0]<=.15:
                px,py,detail=best[1]
                mask={(px+x,py+y):c for (x,y),c in detail.items()
                      if 0<=px+x<frame.width and 0<=py+y<frame.height and frame.getpixel((px+x,py+y))[3]}
        for (x,y),color in mask.items():sheets[name].putpixel((ox+x,oy+y),color)
        counts[name]+=len(mask)
    for name,image in sheets.items():image.save(SPRITES/f'lugia-shadow/{name}-Anim.png',optimize=True)
    print('Shadow eye pixels imported:',dict(counts))
    reference.crop((495,327,535,367)).save(SPRITES/'lugia-shadow/portrait.png')


def shadow_disc():
    # Reuse the existing SpriteCook ground aura, preserving every alpha value.
    import colorsys
    image=Image.open(ROOT/'public/art/raid-lugia.png').convert('RGBA')
    image.putdata([(*[round(v*255) for v in colorsys.hsv_to_rgb(.755, max(.25,colorsys.rgb_to_hsv(r/255,g/255,b/255)[1]), max(r,g,b)/255)],a)
                   if a else (r,g,b,a) for r,g,b,a in image.get_flattened_data()])
    image.save(ROOT/'public/art/raid-lugia-shadow.png',optimize=True)


def armor_frames():
    image = Image.open(SOURCES / 'armored-mewtwo.png')
    bg = (196, 200, 242)
    def rows(x0, x1, edges):
        return [[im for _, im in sorted(components(image, (x0, a, x1, b), bg, 45), key=lambda p:p[0][0])]
                for a,b in zip(edges,edges[1:])]
    idle = [[cut(image,box,bg) for box in pair] for pair in [
        [(74,19,101,50),(103,19,135,50)],[(76,51,101,84),(103,51,135,82)],
        [(79,86,105,117),(107,84,131,115)],[(77,119,102,151),(104,117,132,149)],
        [(79,154,102,183),(104,150,130,181)],
    ]]
    walk = rows(145,213,[14,44,77,107,137,171])
    attack=[]
    for y0,y1 in [(32,68),(68,107),(107,141),(141,172),(172,207)]:
        # Find complete connected poses across the row. Fixed-width cells cut
        # through the tail and copied pixels from neighboring poses.
        poses=sorted(components(image,(214,y0,368,y1),bg,80),key=lambda p:p[0][0])
        attack.append([im for _,im in poses[:4]])  # fifth pose includes baked-in blue VFX
    hurt = [im for _,im in components(image,(0,110,66,253),bg,80)]
    if len(hurt)!=5 or any(len(seq)!=4 for seq in attack):raise ValueError('Incomplete armor pose extraction')
    for name, group in [('idle',idle),('walk',walk),('attack',attack)]:
        if len(group)!=5 or any(len(row)<2 for row in group):
            raise ValueError(f'Incomplete armor {name} extraction')
    return idle,walk,attack,hurt


def armor_set(original, destination):
    idle,walk,attack,hurt=armor_frames()
    source=SPRITES/original;dest=SPRITES/destination;dest.mkdir(exist_ok=True)
    xml=ET.parse(source/'AnimData.xml')
    # Source sheet's five facings: Down, Up, Left, DownLeft, UpLeft.
    directions=[(0,False),(3,True),(2,True),(4,True),(1,False),(4,False),(2,False),(3,False)]
    for anim in xml.findall('.//Anim'):
        if anim.find('CopyOf') is not None:continue
        name=anim.findtext('Name');fw=int(anim.findtext('FrameWidth'));fh=int(anim.findtext('FrameHeight'))
        frames=len(anim.find('Durations'));poses=[]
        for row,flip in directions:
            if name=='Walk':seq=walk[row]
            elif name in ['Hurt','Faint','Pain','Cringe','Tumble','Laying']:seq=[hurt[row]]
            elif name in ['Attack','Swing','Double','Hop','Rotate']:seq=attack[row][:3]
            elif name in ['Shoot','Charge','Pose','DeepBreath']:seq=[attack[row][2],attack[row][3]]
            else:seq=idle[row]
            poses.append([ImageOps.mirror(p) if flip else p for p in seq])
        # Preserve existing timing; widen cells only when the supplied tail/armor needs room.
        fw=max(fw,((max(p.width for seq in poses for p in seq)+7)//8)*8)
        fh=max(fh,((2*max(p.height for seq in poses for p in seq)+7)//8)*8)
        anim.find('FrameWidth').text=str(fw);anim.find('FrameHeight').text=str(fh)
        sheet=Image.new('RGBA',(fw*frames,fh*8))
        for direction,seq in enumerate(poses):
            for col in range(frames):
                index=min(len(seq)-1,int(col/max(1,frames)*len(seq)))
                hit=int(anim.findtext('HitFrame') or max(1,frames//3))
                returned=int(anim.findtext('ReturnFrame') or frames)
                if name in ['Charge','Pose','DeepBreath']:index=len(seq)-1
                elif name=='Shoot':index=1 if hit<=col<returned else 0
                elif name in ['Attack','Swing','Double','Hop','Rotate']:
                    index=(min(len(seq)-2,int(col/max(1,hit)*(len(seq)-1))) if col<hit else len(seq)-1) if col<returned else 0
                pose=seq[index]
                sheet.alpha_composite(pose,(col*fw+(fw-pose.width)//2,direction*fh+fh//2+5-pose.height))
        sheet.save(dest/f'{name}-Anim.png',optimize=True)
    xml.write(dest/'AnimData.xml',encoding='utf-8',xml_declaration=True)
    portrait=Image.open(SOURCES/'armored-mewtwo.png').crop((4,4,44,44))
    portrait.save(dest/'portrait.png')


if __name__ == '__main__':
    lugia = Image.open(SOURCES / 'shadow-lugia.png')
    ray = Image.open(SOURCES / 'dark-rayquaza.png')
    palettes = {
        'lugia': palette_for('lugia', lugia, (10, 34, 159, 613), (0, 128, 128)),
        'rayquaza': palette_for('rayquaza', ray, (145, 35, 367, 625)),
    }
    recolor('lugia', 'lugia-shadow', palettes['lugia'])
    restore_shadow_eyes(lugia)
    shadow_disc()
    recolor('rayquaza', 'rayquaza-dark', palettes['rayquaza'])
    recolor('rayquaza-mega', 'rayquaza-mega-dark', palettes['rayquaza'])
    armor_set('mewtwo','mewtwo-armored')
    armor_set('mewtwo-mega-y','mewtwo-armored-mega-y')
    (SOURCES / 'palettes.json').write_text(json.dumps({name: {','.join(map(str,k)):v for k,v in p.items()} for name,p in palettes.items()}, indent=2)+'\n')
