// Writes the moves this game can already play, for scripts/build-movedex.py: every regular (non-ultimate) move in
// src/moves.js and the moves with rules of their own in src/effects-resolver.js (power, fixed damage, status).
// Usage: node scripts/export-playable.mjs <cache dir>
import '../server/shim.js';
import fs from 'node:fs';
import path from 'node:path';
const { MOVES } = await import('../src/moves.js');
const src = fs.readFileSync(new URL('../src/effects-resolver.js', import.meta.url), 'utf8');
const cases = start => { const i = src.indexOf(start), j = src.indexOf('\n}\n', i); return [...src.slice(i, j).matchAll(/case '([a-zA-Z0-9]+)'/g)].map(m => m[1]); };
const out = {
  playable: Object.keys(MOVES).filter(id => !MOVES[id].ultimate && !MOVES[id].generated),
  handled: [...new Set([...cases('export function movePower'), ...cases('export function fixedDamage'), ...cases('export function statusMove')])],
};
fs.writeFileSync(path.join(process.argv[2], 'playable.json'), JSON.stringify(out));
console.log(`${out.playable.length} hand-made moves, ${out.handled.length} with rules of their own`);
