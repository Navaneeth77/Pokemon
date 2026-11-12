// Validation for the battle data: every playable Pokémon has four moves that exist, each with mechanics
// (type, category, power or a status effect) and an animation (an Action), an ultimate, and an ability the game
// implements. Prints a summary and exits non-zero on any problem.
//   node scripts/validate-moves.mjs
import '../server/shim.js';

const { SPECIES, ROSTER } = await import('../src/data/species.js');
const { MOVES, hasChoreography } = await import('../src/moves.js');
const { ABILITIES } = await import('../src/data/abilities.js');
const { MOVE_ANIMS } = await import('../src/data/move-anims.js');

const problems = [], used = new Set(), usedUlts = new Set();
// Aeroblast runs through the beat script, but its beats switch to Lugia's own effects (AeroblastBeam, CastEnergy,
// PressureWave), so it is hand-made.
const HAND_MADE_ULTS = new Set(['aeroblast']);
for (const id of ROSTER) {
  const s = SPECIES[id];
  if (s.moves.length !== 4 || new Set(s.moves).size !== 4) problems.push(`${id}: needs four different moves (${s.moves.join(', ')})`);
  if (!MOVES[s.ultimate]?.ultimate) problems.push(`${id}: ultimate ${s.ultimate} is missing`);
  // Every ultimate needs its own choreography: a bespoke function in ULTS or its own Action (Dragon Ascent).
  else if (MOVES[s.ultimate].Action?.name === 'Ultimate' && !hasChoreography(s.ultimate) && !HAND_MADE_ULTS.has(s.ultimate)) problems.push(`${s.ultimate}: only the shared signature beats (add choreography)`);
  usedUlts.add(s.ultimate);
  if (!ABILITIES[s.ability]) problems.push(`${id}: ability ${s.ability} is not implemented`);
  for (const m of s.moves) {
    const mv = MOVES[m];
    used.add(m);
    if (!mv) { problems.push(`${id}: move ${m} does not exist`); continue; }
    if (!mv.Action && !mv.copy) problems.push(`${m}: no animation (Action)`); // Copy reuses the foe's last move
    if (!mv.type || !mv.cat) problems.push(`${m}: missing type or category`);
    if (mv.cat !== 'status' && !(mv.power > 0) && !mv.dex) problems.push(`${m}: an attack without power`);
    if (mv.cat === 'status' && !mv.util && !mv.copy && !mv.guard) problems.push(`${m}: a status move without an effect`);
    // Every move needs its own look: hand-made, or a recipe in data/move-anims.js (not the bare generated one).
    if (mv.generated && !MOVE_ANIMS[m]) problems.push(`${m}: only the generic look (add a recipe to data/move-anims.js)`);
  }
}
const fromDex = [...used].filter(m => MOVES[m].dex).length, recipes = [...used].filter(m => MOVE_ANIMS[m]).length;
// The competitive pools (move picker): every move a player can choose must exist and be playable, and every
// attacking move needs its targeting profile (range, hitbox, tracking: targeting.js).
const { movePool } = await import('../src/data/movepool.js');
// Everything the move picker offers: the competitive pools and the full learnsets.
const pooled = new Set(ROSTER.flatMap(id => movePool(SPECIES[id])));
for (const m of pooled) {
  const mv = MOVES[m];
  if (!mv) { problems.push(`pool move ${m} does not exist`); continue; }
  if (!mv.Action && !mv.copy) problems.push(`pool move ${m}: no action`);
  if (mv.cat !== 'status' && !mv.ultimate && !mv.util && !mv.targeting) problems.push(`pool move ${m}: no targeting profile`);
}
for (const [id, mv] of Object.entries(MOVES)) if (!mv.ultimate && mv.cat !== 'status' && !mv.util && !mv.copy && !(mv.targeting?.range > 0)) problems.push(`${id}: attacking move without a range`);
console.log(`${pooled.size} moves across the move picker (competitive pools and learnsets)`);
console.log(`${ROSTER.length} Pokémon · ${used.size} moves in use (${fromDex} with official data, ${recipes} with a recipe, the rest hand-made) · ${usedUlts.size} ultimates (${[...usedUlts].filter(u => hasChoreography(u) || HAND_MADE_ULTS.has(u) || MOVES[u].Action?.name !== 'Ultimate').length} choreographed) · ${problems.length} problems`);
for (const p of problems.slice(0, 40)) console.log(' ', p);
process.exit(problems.length ? 1 : 0);
