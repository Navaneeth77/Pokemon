import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { USED, applyAliases } from '../src/assets.js';

// Animation timing for every sprite sheet (frame counts, durations, hit frames), read from the same
// AnimData.xml files the browser loads. Images are never decoded on the server. The rules match
// assets.js exactly — the same animations, and a missing optional sheet is skipped — so moves hit on
// the same frames here as in the players' browsers.
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/sprites');
const num = (block, tag) => {
  const m = new RegExp(`<${tag}>(-?\\d+)</${tag}>`).exec(block);
  return m ? Number(m[1]) : null;
};

function loadSet(dir) {
  const xml = fs.readFileSync(path.join(dir, 'AnimData.xml'), 'utf8');
  const defs = [...xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)].map(([, b]) => ({
    name: /<Name>(.*?)<\/Name>/.exec(b)[1], copyOf: /<CopyOf>(.*?)<\/CopyOf>/.exec(b)?.[1] ?? null,
    fw: num(b, 'FrameWidth'), fh: num(b, 'FrameHeight'),
    durations: [...b.matchAll(/<Duration>(\d+)<\/Duration>/g)].map(m => Number(m[1])),
    rushFrame: num(b, 'RushFrame'), hitFrame: num(b, 'HitFrame'), returnFrame: num(b, 'ReturnFrame'),
  }));
  const wanted = defs.filter(d => USED.has(d.name)), sources = new Set(wanted.map(d => d.copyOf ?? d.name)), anims = {};
  for (const d of defs) {
    if (d.copyOf || !sources.has(d.name)) continue;
    if (d.name !== 'Idle' && !fs.existsSync(path.join(dir, `${d.name}-Anim.png`))) continue;
    anims[d.name] = { ...d, image: null, frames: d.durations.length, rows: 8 };
  }
  for (const d of wanted) if (d.copyOf && anims[d.copyOf]) anims[d.name] = { ...anims[d.copyOf], name: d.name };
  applyAliases(path.basename(dir), anims);
  return { anims, portrait: null };
}

export function loadSpriteSets() {
  const sets = {};
  for (const name of fs.readdirSync(ROOT)) {
    const dir = path.join(ROOT, name);
    if (fs.existsSync(path.join(dir, 'AnimData.xml'))) sets[name] = loadSet(dir);
  }
  return sets;
}
