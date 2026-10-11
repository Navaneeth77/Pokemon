// PMD SpriteCollab sheets: one column per frame, one row per facing direction.
// Durations are in 1/60 s game ticks.
export const TICK = 1 / 60;

// Only the animations the game plays are loaded (plus the sheets they are copies of).
const USED = new Set(['Idle', 'Walk', 'Attack', 'Strike', 'Shoot', 'SpAttack', 'Swing', 'Charge', 'Hurt', 'Faint', 'Hop', 'RearUp', 'Rotate', 'Double', 'Roar', 'Launch', 'Pose']);

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
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
  return { anims, portrait: await loadImage(`${base}/portrait.png`) };
}

export async function loadSpecies(ids) {
  const sets = await Promise.all(ids.map(loadSpriteSet));
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
