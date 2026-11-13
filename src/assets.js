// PMD SpriteCollab sheets: one column per frame, one row per facing direction.
// Durations are in 1/60 s game ticks.
export const TICK = 1 / 60;

// Only the animations the game plays are loaded (plus the sheets they are copies of).
export const USED = new Set(['Idle', 'Walk', 'Attack', 'Strike', 'Shoot', 'SpAttack', 'Swing', 'Charge', 'Hurt', 'Faint', 'Hop', 'RearUp', 'Rotate', 'Double', 'Roar', 'Launch', 'Pose']);

// Sheets whose own animation doesn't fit how the Pokémon appears here. Lugia always flies in this
// game, but its Idle, Charge and Rotate sheets stand on the ground with folded wings, and its Swing is
// a full-body spin. So it hovers with its spread-wing flight (a calm, slow wing beat), charges holding
// its wings open (the steady middle of its Shoot sheet) and slashes with its wing-beat Attack.
// Entries: [source, speed, first frame, end frame]. Applied the same way in the browser and on the
// match server, so move timing is identical.
export const ALIASES = {
  lugia: { Idle: ['Walk', 0.4], Charge: ['Shoot', 0.35, 2, 10], Rotate: ['Attack', 1], Swing: ['Attack', 1] },
};

export function applyAliases(id, anims) {
  for (const [name, [from, speed, start = 0, end]] of Object.entries(ALIASES[id==='lugia-shadow'?'lugia':id] ?? {})) {
    const src = anims[from];
    if (!src) continue;
    const durations = src.durations.slice(start, end).map(d => Math.max(1, Math.round(d / speed)));
    const shift = f => (f == null || f < start || f >= start + durations.length ? null : f - start);
    anims[name] = {
      ...src, name, durations, frames: durations.length, offset: (src.offset ?? 0) + start,
      hitFrame: start ? shift(src.hitFrame) : src.hitFrame, rushFrame: start ? shift(src.rushFrame) : src.rushFrame, returnFrame: start ? shift(src.returnFrame) : src.returnFrame,
    };
  }
}

const imageCache = new Map();
export function loadImage(src) {
  if(imageCache.has(src))return imageCache.get(src);
  const pending = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => { try { await img.decode?.(); } catch {} resolve(img); };
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  }).catch(err=>{imageCache.delete(src);throw err;});
  imageCache.set(src,pending);return pending;
}

function parseAnimData(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const num = (node, tag) => {
    const el = node.querySelector(tag);
    return el ? Number(el.textContent) : null;
  };
  return [...doc.querySelectorAll('Anims > Anim')].map(node => ({
    name: node.querySelector('Name').textContent,
    copyOf: node.querySelector('CopyOf')?.textContent ?? null,
    fw: num(node, 'FrameWidth'),
    fh: num(node, 'FrameHeight'),
    durations: [...node.querySelectorAll('Durations > Duration')].map(d => Number(d.textContent)),
    rushFrame: num(node, 'RushFrame'),
    hitFrame: num(node, 'HitFrame'),
    returnFrame: num(node, 'ReturnFrame'),
  }));
}

async function loadSpriteSet(id) {
  const base = `/sprites/${id}`;
  const res = await fetch(`${base}/AnimData.xml`);
  if (!res.ok) throw new Error(`Missing sprite data for ${id}`);
  const defs = parseAnimData(await res.text());
  const wanted = defs.filter(d => USED.has(d.name));
  const sources = new Set(wanted.map(d => d.copyOf ?? d.name));
  const anims = {};
  // A missing optional sheet (e.g. Pose) is skipped; sprite.js falls back to another animation.
  await Promise.all(defs.filter(d => !d.copyOf && sources.has(d.name)).map(async d => {
    let image;
    try {
      image = await loadImage(`${base}/${d.name}-Anim.png`);
    } catch (err) {
      if (d.name === 'Idle') throw err;
      return;
    }
    anims[d.name] = { ...d, image, frames: d.durations.length, rows: Math.max(1, Math.round(image.height / d.fh)) };
  }));
  for (const d of wanted) {
    if (d.copyOf && anims[d.copyOf]) anims[d.name] = { ...anims[d.copyOf], name: d.name };
  }
  applyAliases(id, anims);
  return { anims, portrait: await loadImage(`${base}/portrait.png`) };
}

// Story cutscenes also use some of each sheet's reaction animations (nodding, looking up, flinching…).
const EXTRA = new Set(['Nod', 'LookUp', 'Cringe', 'Sleep', 'Wake', 'Pain', 'DeepBreath', 'Sit', 'Tumble', 'Laying']);
export async function addExtraAnims(id, set) {
  if (!set || set.extrasLoaded) return;
  set.extrasLoaded = true;
  try {
    const defs = parseAnimData(await (await fetch(`/sprites/${id}/AnimData.xml`)).text()), byName = Object.fromEntries(defs.map(d => [d.name, d]));
    await Promise.all(defs.filter(d => EXTRA.has(d.name) && !set.anims[d.name]).map(async d => {
      const src = byName[d.copyOf ?? d.name];
      if (!src) return;
      if (set.anims[src.name]) {
        set.anims[d.name] = { ...set.anims[src.name], name: d.name };
        return;
      }
      try {
        const image = await loadImage(`/sprites/${id}/${src.name}-Anim.png`);
        set.anims[d.name] = { ...src, name: d.name, image, frames: src.durations.length, rows: Math.max(1, Math.round(image.height / src.fh)) };
      } catch { /* not downloaded for this species */ }
    }));
    set.resolved = null;
  } catch { /* extras are optional */ }
}

// Shiny sheets: the normal sheets recoloured through the species' shiny palette (public/sprites/<id>/
// shiny.json, normal colour → shiny colour, measured from SpriteCollab's shiny sheet).
function recolor(img, palette) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height), px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const to = palette.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    if (to === undefined) continue;
    px[i] = to >> 16;
    px[i + 1] = (to >> 8) & 255;
    px[i + 2] = to & 255;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

async function loadShinySet(id) {
  const [set, res] = await Promise.all([loadSpriteSet(id), fetch(`/sprites/${id}/shiny.json`)]);
  if (!res.ok) throw new Error(`No shiny colours for ${id}`);
  const palette = new Map(Object.entries(await res.json()).map(([a, b]) => [parseInt(a, 16), parseInt(b, 16)]));
  const sheets = new Map(), anims = {};
  for (const [name, a] of Object.entries(set.anims)) {
    if (!sheets.has(a.image)) sheets.set(a.image, recolor(a.image, palette));
    anims[name] = { ...a, image: sheets.get(a.image) };
  }
  // The portrait is shown in <img> tags too, so it stays an image.
  const portrait = new Image();
  portrait.src = recolor(set.portrait, palette).toDataURL();
  try { await portrait.decode?.(); } catch {}
  return { anims, portrait };
}

const spriteCache = new Map();
export async function loadSpecies(ids) {
  const sets = await Promise.all(ids.map(id=>{
    const load = id.endsWith('~shiny') ? () => loadShinySet(id.slice(0, -6)) : () => loadSpriteSet(id);
    if(!spriteCache.has(id))spriteCache.set(id,load().catch(err=>{spriteCache.delete(id);throw err;}));
    return spriteCache.get(id);
  }));
  return Object.fromEntries(ids.map((id, i) => [id, sets[i]]));
}

// The dev roster playback cycles through hundreds of decoded sheets in one tab.
export function releaseSpriteSet(id) {
  spriteCache.delete(id);
  spriteCache.delete(`${id}~shiny`);
  const prefix = `/sprites/${id}/`;
  for (const path of imageCache.keys()) {
    if (path.startsWith(prefix)) imageCache.delete(path);
  }
}

export function animDuration(anim, upToFrame = anim.frames) {
  let ticks = 0;
  for (let i = 0; i < upToFrame; i++) ticks += anim.durations[i];
  return ticks * TICK;
}

// Body dimensions from the first down-facing Idle frame, for species without hand-tuned values.
export function measureDims(set) {
  const a = set.anims.Idle;
  const c = document.createElement('canvas');
  c.width = a.fw;
  c.height = a.fh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(a.image, 0, 0, a.fw, a.fh, 0, 0, a.fw, a.fh);
  const d = ctx.getImageData(0, 0, a.fw, a.fh).data;
  let top = a.fh, left = a.fw, right = 0;
  for (let y = 0; y < a.fh; y++) {
    for (let x = 0; x < a.fw; x++) {
      if (!d[(y * a.fw + x) * 4 + 3]) continue;
      top = Math.min(top, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  const h = Math.max(16, a.fh / 2 - top);
  const radius = Math.round(Math.min(20, Math.max(8, (right - left + 1) * 0.32)));
  return {
    radius, shadow: [radius, Math.round(radius * 0.36)], bodyZ: Math.round(h * 0.45), headZ: Math.round(h * 0.92),
    mouth: { z: Math.round(h * 0.68), fwd: Math.round(radius * 0.7) },
  };
}
