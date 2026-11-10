// Validation for the battle data: every playable Pokémon has four moves that exist, each with mechanics
// (type, category, power or a status effect) and an animation (an Action), an ultimate, and an ability the game
// implements. Prints a summary and exits non-zero on any problem.
//   node scripts/validate-moves.mjs
import '../server/shim.js';

const { SPECIES, ROSTER } = await import('../src/data/species.js');
const { MOVES } = await import('../src/moves.js');
const { ABILITIES } = await import('../src/data/abilities.js');
const { MOVE_ANIMS } = await import('../src/data/move-anims.js');

const problems = [], used = new Set();
for (const id of ROSTER) {
  const s = SPECIES[id];
  if (s.moves.length !== 4 || new Set(s.moves).size !== 4) problems.push(`${id}: needs four different moves (${s.moves.join(', ')})`);
  if (!MOVES[s.ultimate]?.ultimate) problems.push(`${id}: ultimate ${s.ultimate} is missing`);
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
console.log(`${ROSTER.length} Pokémon · ${used.size} moves in use (${fromDex} with official data, ${recipes} with a recipe, the rest hand-made) · ${problems.length} problems`);
for (const p of problems.slice(0, 40)) console.log(' ', p);
process.exit(problems.length ? 1 : 0);
