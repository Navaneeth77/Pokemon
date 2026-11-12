// Stat stages run from −6 to +6 and reset when a Pokémon switches out.
// Damage stats have diminishing returns. Speed uses its own curve for movement and recharge.
//
// Effective Speed is the species' Speed with its stage, ability (Chlorophyll, Swift Swim…), item (Choice
// Scarf) and paralysis applied. In a real-time battle "acting first" means acting more often, so effective
// Speed drives both how fast the Pokémon moves and how fast its moves recharge: doubled Speed moves it
// 1.5× as fast and recharges its moves 1.35× as fast (log-scaled so huge boosts stay controllable).
import { abilityOf } from './data/abilities.js';
import { itemOf } from './data/items.js';

export const STATS = ['atk', 'def', 'spa', 'spd', 'spe'];
export const STAT_NAME = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' };

const DAMAGE_STAGE_MULTIPLIERS = [1, 1.25, 1.5, 1.65, 1.8, 1.9, 2];
export const damageStageMult = stage => {
  const mult = DAMAGE_STAGE_MULTIPLIERS[Math.min(6, Math.abs(stage))];
  return stage < 0 ? 1 / mult : mult;
};
const speedStageMult = stage => stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
export const stageOf = (mon, stat) => mon.stages?.[stat] ?? 0;

// The Speed number the battle uses (species Speed is on the game's walking scale, about 50–125).
export function effectiveSpeed(mon, game) {
  const ab = abilityOf(mon), item = itemOf(mon);
  let s = mon.species.speed * speedStageMult(stageOf(mon, 'spe'));
  s *= ab.speedMult?.(mon, game) ?? 1;
  s *= item?.speedMult?.() ?? 1;
  if (mon.status?.para > 0 && !ab.quickFeet) s *= 0.5;
  if (game?.sides?.[mon.side]?.tailwind > 0) s *= 2; // Tailwind
  return s;
}

// How much faster (or slower) than its own base Speed it is right now: 2 when its Speed is doubled.
// Under Trick Room the slow get quick and the quick get slow: a Speed of about 85 is the pivot.
export const speedRatio = (mon, game) => {
  const s = effectiveSpeed(mon, game);
  return game?.trickRoom > 0 ? Math.max(0.5, Math.min(2.4, 85 / Math.max(10, s))) : s / mon.species.speed;
};
const log2 = Math.log2;
export const moveFactor = r => Math.max(0.55, Math.min(1.7, 1 + 0.5 * log2(r)));
export const rechargeFactor = r => Math.max(0.6, Math.min(1.6, 1 + 0.35 * log2(r)));
