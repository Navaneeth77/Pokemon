// Which moves a Pokémon may bring into battle: its default four, its Smogon competitive pool (data/smogon.js) and
// every move it learns in its most recent games that this game can play (data/learnsets.js). The player picks four
// of them in the kit editor; the choice travels in the kit, so the match server checks it with the same function.
import { SMOGON_MOVES, SMOGON_POOLS } from './smogon.js';
import { LEARN_IDS, LEARNSETS, LEARN_GEN } from './learnsets.js';

export const RETIRED_MOVES = new Set([
  // Accuracy and evasion only.
  'doubleTeam', 'kinesis', 'lockOn', 'mindReader', 'minimize', 'sandAttack', 'smokescreen', 'sweetScent',
  // One-hit KOs. Fissure and Sheer Cold also have separate, damage-based ultimates.
  'fissureAtk', 'guillotine', 'hornDrill', 'sheerColdAtk',
]);

const decoded = new Map();
// Its learnset, decoded once (base-36 indexes into LEARN_IDS).
export function learnset(id) {
  if (!decoded.has(id)) decoded.set(id, (LEARNSETS[id] ?? '').split(',').filter(Boolean).map(s => LEARN_IDS[parseInt(s, 36)]));
  return decoded.get(id);
}
// The generation its learnset comes from (9 = Scarlet/Violet; older for Pokémon not in those games).
export const learnGen = id => LEARN_GEN[id] ?? 9;
// Moves Smogon's sets actually run on it: the picker marks them.
export const isCompetitive = (species, move) => !!SMOGON_POOLS[species?.id]?.includes(move);

const pools = new Map();
export function movePool(species) {
  if (!species?.id) return [...(species?.moves ?? [])];
  if (!pools.has(species.id)) {
    const candidates = new Set([...(species.moves ?? []), ...(SMOGON_POOLS[species.id] ?? []), ...learnset(species.id)]);
    pools.set(species.id, [...candidates].filter(id => !RETIRED_MOVES.has(id)));
  }
  return pools.get(species.id);
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

// Use the main Smogon set in slot order, filling any gaps from the arena defaults.
export function competitivePreset(species) {
  const moves = SMOGON_MOVES[species?.id];
  return moves ? cleanMoves(species, moves) ?? [...species.moves] : null;
}
