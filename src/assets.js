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

const spriteCache = new Map();
export async function loadSpecies(ids) {
  const sets = await Promise.all(ids.map(id=>{
    if(!spriteCache.has(id))spriteCache.set(id,loadSpriteSet(id).catch(err=>{spriteCache.delete(id);throw err;}));
    return spriteCache.get(id);
  }));
  return Object.fromEntries(ids.map((id, i) => [id, sets[i]]));
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
