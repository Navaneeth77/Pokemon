// PMD SpriteCollab sheets: one column per frame, one row per facing direction.
// Durations are in 1/60 s game ticks.
export const TICK = 1 / 60;

// Only the animations the game plays are loaded (plus the sheets they are copies of).
const USED = new Set(['Idle', 'Walk', 'Attack', 'Strike', 'Shoot', 'SpAttack', 'Swing', 'Charge', 'Hurt', 'Faint', 'Hop', 'RearUp', 'Rotate', 'Double', 'Roar', 'Launch']);

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
  await Promise.all(defs.filter(d => !d.copyOf && sources.has(d.name)).map(async d => {
    const image = await loadImage(`${base}/${d.name}-Anim.png`);
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
