// Which moves a Pokémon may bring into battle: its default four plus everything in its Smogon competitive pool
// (data/smogon.js). The player picks four of them in the kit editor; the choice travels in the kit, so the
// match server checks it with the same function.
import { SMOGON_POOLS } from './smogon.js';

export function movePool(species) {
  return [...new Set([...(species?.moves ?? []), ...(SMOGON_POOLS[species?.id] ?? [])])];
}

// A chosen set of four, cleaned: anything unknown, repeated or outside the pool is dropped and the gaps are
// filled from the default moves, so the result is always four legal moves in the order picked. null means the
// defaults, unchanged.
export function cleanMoves(species, list) {
  if (!species?.moves || !Array.isArray(list)) return null;
  const pool = new Set(movePool(species)), out = [];
  for (const id of list.slice(0, 8)) if (typeof id === 'string' && pool.has(id) && !out.includes(id) && out.length < 4) out.push(id);
  for (const id of species.moves) if (out.length < 4 && !out.includes(id)) out.push(id);
  return out.length === 4 && out.some((id, i) => id !== species.moves[i]) ? out : null;
}
