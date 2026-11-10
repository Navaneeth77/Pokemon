// The effect resolver: what a move does besides its base damage, from its database entry (data/movedex.js).
//
//   movePower(game, user, target, move)    variable power (Gyro Ball, Low Kick, Stored Power, Water Spout…)
//   damageRule(move)                       fixed damage (Seismic Toss, Super Fang, Endeavor) and the stat used
//   onHit(game, attacker, target, move, dmg, stack)   secondary effects, once per move use: status chances,
//                                          flinch, the target's stat drops, the user's boosts on hit
//   afterUse(game, user, move, stack)      the user's own stat changes (Close Combat, Draco Meteor), pivots
//   statusMove(game, user, move, c)        status moves that aren't plain boosts/status/heal (Substitute, Haze…)
//
// Combat (combat.js) and the Utility action (moves.js) call these, so every effect lands at the moment the
// move connects, together with its animation and the log line.
import { abilityOf } from './data/abilities.js';
import { STAT_NAME } from './stats.js';

const STATUS_OF = { par: 'para', slp: 'sleep', brn: 'burn', psn: 'poison', tox: 'poison', frz: 'freeze' };
const weightOf = mon => mon.species.weight ?? 1;
// Fixed damage scaled to this game's HP (a level-100 Seismic Toss is about a quarter of a typical Pokémon).
const FIXED = 300;

export function movePower(game, user, target, move) {
  const p = move.power;
  switch (move.id) {
    case 'gyroBall': return Math.min(150, Math.round(25 * (target.species.speed / user.species.speed)) + 30);
    case 'lowKick': case 'grassKnot': return [20, 40, 60, 80, 100, 120][Math.min(5, Math.floor(weightOf(target) * 2.2))];
    case 'heavySlam': case 'heatCrash': return [40, 60, 80, 100, 120][Math.min(4, Math.floor(2 * weightOf(user) / weightOf(target)))];
    case 'storedPower': case 'powerTrip': return 20 + 20 * Object.values(user.stages ?? {}).reduce((s, n) => s + Math.max(0, n), 0);
    case 'waterSpout': return Math.max(1, Math.round(150 * user.hp / user.maxHp));
    case 'hydroSteam': return game.weather === 'sun' ? Math.round(p * 3) : p; // boosted (not weakened) by the sun
    case 'expandingForce': case 'psyblade': return game.terrain ? Math.round(p * 1.5) : p;
    case 'lashOut': return Object.values(user.stages ?? {}).some(n => n < 0) ? p * 2 : p;
    case 'fishiousRend': case 'boltBeak': return target.action ? p : p * 2; // hits harder when the foe hasn't acted yet
    case 'rageFist': return Math.min(350, 50 + 50 * (user.ab?.hitsTaken ?? 0));
    default: return p;
  }
}

// Moves whose damage isn't the usual formula.
export function fixedDamage(game, user, target, move) {
  switch (move.id) {
    case 'seismicToss': case 'nightShade': return FIXED;
    case 'superFang': return Math.max(1, Math.floor(target.hp / 2));
    case 'endeavor': return Math.max(0, target.hp - user.hp);
    default: return null;
  }
}

// Body Press uses the user's Defense; Photon Geyser the higher of its attacking stats.
export const attackStatOf = (move, user) => (move.id === 'bodyPress' ? user.species.def : move.id === 'photonGeyser' ? Math.max(user.species.atk, user.species.spa ?? 0) : null);

// Type tweaks: Freeze-Dry is super effective on Water; Thousand Arrows reaches Flying types.
export function typeTweak(move, defTypes, eff) {
  if (move.id === 'freezeDry' && defTypes.includes('water')) return eff * 4;
  if (move.id === 'thousandArrows' && eff === 0) return 1;
  return eff;
}

// Fake Out only works right after the user comes in; it always flinches.
export const fakeOutFails = (game, user, move) => move.id === 'fakeOut' && game.time - (user.enteredAt ?? 0) > 1.5;

export function onHit(game, attacker, target, move, dmg, stack) {
  const d = move.dex;
  if (!d || stack.secondaryDone || !(dmg > 0)) return;
  stack.secondaryDone = true;
  const A = abilityOf(attacker), serene = A.serene ? 2 : 1;
  if (move.id === 'fakeOut' && target.alive) game.applyStatus(target, 'stun', { source: attacker, dur: 0.6 });
  if (A.sheerForce || abilityOf(target).shieldDust || target.item === 'covertCloak') return;
  for (const s of d.secondary ?? []) {
    if (Math.random() * 100 >= s.chance * serene) continue;
    if (s.status && target.alive) game.applyStatus(target, STATUS_OF[s.status], { source: attacker, toxic: s.status === 'tox' });
    if (s.flinch && target.alive && !abilityOf(target).noFlinch) {
      if (game.applyStatus(target, 'stun', { source: attacker, dur: 0.35 })) game.ui.log(`${target.species.name} flinched!`, target.side);
    }
    if (s.boosts && target.alive) game.stage(target, s.boosts, attacker);
    if (s.self && attacker.alive) game.stage(attacker, s.self);
  }
  if (move.id === 'saltCure' && target.alive) target.salted = { by: attacker.side, t: 0 };
  if ((move.id === 'whirlpool' || move.id === 'magmaStorm' || move.id === 'fireSpin') && target.alive) target.bound = { t: 6, tick: 0, by: move.name };
  if (move.id === 'thief' && !attacker.item && target.item) game.knockOffItem(target, attacker, true);
  if (move.id === 'clearSmog' && target.alive) target.stages = {};
}

export function afterUse(game, user, move, stack = {}) {
  const d = move.dex;
  if (!d || stack.afterDone) return;
  stack.afterDone = true;
  if (d.selfBoosts && user.alive) game.stage(user, d.selfBoosts);
  // Pivot (U-turn, Volt Switch, Flip Turn): the user may switch out right away.
  if (d.selfSwitch && user.alive && game.teamOf(user).nextAlive() >= 0) {
    if (user.side === 'player') game.switchCD = 0;
    else game.foeSwitchCD = 0;
    game.floatText(user, 'SWITCH READY!', '#9fe8ff');
    game.emit('pivot', { mon: user, move });
  }
  if (move.id === 'mortalSpin' || move.id === 'rapidSpin') {
    game.clearHazards?.(user.side, user);
    user.seeded = null;
  }
  if (move.id === 'explosion' || move.id === 'selfDestruct') game.dotDamage(user, 1, '#ff9a5a');
}

// Status moves with their own rules. `c` is the move's util config.
export function statusMove(game, user, move) {
  const foe = user.foe, say = text => game.ui.log(text, user.side);
  switch (move.id) {
    case 'substitute':
      if (user.hp <= user.maxHp / 4 || user.shield > 0) return game.floatText(user, 'IT FAILED!', '#c9d2de');
      user.hp -= Math.floor(user.maxHp / 4);
      user.shield = Math.floor(user.maxHp / 4);
      user.substitute = true;
      return say(`${user.species.name} put in a substitute!`);
    case 'taunt':
      if (!foe?.alive || foe.hidden) return;
      foe.taunted = 6;
      game.floatText(foe, 'TAUNTED!', '#ff7a5a');
      return say(`${foe.species.name} fell for the taunt! It can't use status moves for 6s.`);
    case 'haze':
      for (const m of [game.player, game.opponent]) if (m) m.stages = {};
      return say('All stat changes were eliminated!');
    case 'defog':
      game.hazards = { player: {}, opponent: {} };
      game.terrain = null;
      return say(`${user.species.name} blew away the hazards and terrain!`);
    case 'tidyUp':
      game.hazards = { player: {}, opponent: {} };
      game.stage(user, { atk: 1, spe: 1 });
      return say(`${user.species.name} tidied up!`);
    case 'rest':
      if (user.hp >= user.maxHp) return game.floatText(user, 'IT FAILED!', '#c9d2de');
      user.status = {};
      user.hp = user.maxHp;
      game.applyStatus(user, 'sleep', { dur: 4 });
      return say(`${user.species.name} slept and became healthy!`);
    case 'wish':
      user.wish = { side: user.side, t: 2, hp: user.maxHp / 2 };
      return say(`${user.species.name} made a wish!`);
    case 'healBell':
    case 'aromatherapy':
      for (const m of game.teamOf(user).members) m.status = {};
      return say('A soothing sound cured the team\'s status!');
    case 'bellyDrum':
      if (user.hp <= user.maxHp / 2) return game.floatText(user, 'IT FAILED!', '#c9d2de');
      user.hp -= Math.floor(user.maxHp / 2);
      game.stage(user, { atk: 12 });
      return say(`${user.species.name} cut its own HP and maximised its Attack!`);
    case 'shoreUp':
      return game.heal(user, user.maxHp * (game.weather === 'sand' ? 2 / 3 : 1 / 2));
    case 'strengthSap':
      if (!foe?.alive) return;
      game.heal(user, user.maxHp * 0.3 * (foe.species.atk ?? 1));
      game.stage(foe, { atk: -1 }, user);
      return;
    case 'takeHeart':
      user.status = {};
      game.stage(user, { spa: 1, spd: 1 });
      return;
    default:
      return game.floatText(user, `${move.name.toUpperCase()}!`, '#ffffff');
  }
}

// Ongoing effects ticked by the game: Wish landing, Salt Cure, binding moves, Taunt wearing off.
export function tickVolatiles(game, mon, dt) {
  if (mon.taunted > 0) mon.taunted = Math.max(0, mon.taunted - dt);
  if (mon.wish && (mon.wish.t -= dt) <= 0) {
    const w = mon.wish;
    mon.wish = null;
    const target = w.side === 'player' ? game.player : game.opponent;
    if (target?.alive) {
      game.heal(target, w.hp);
      game.ui.log(`${target.species.name}'s wish came true!`, target.side);
    }
  }
  if (mon.salted && (mon.salted.t += dt) >= 3) {
    mon.salted.t = 0;
    const tough = mon.species.types.some(t => t === 'water' || t === 'steel');
    game.dotDamage(mon, tough ? 1 / 4 : 1 / 8, '#e8e0c8');
    game.ui.log(`${mon.species.name} is hurt by Salt Cure!`, mon.side);
  }
  if (mon.bound) {
    mon.bound.t -= dt;
    if ((mon.bound.tick += dt) >= 2) {
      mon.bound.tick = 0;
      game.dotDamage(mon, 1 / 8, '#ff9a5a');
      game.ui.log(`${mon.species.name} is hurt by ${mon.bound.by}!`, mon.side);
    }
    if (mon.bound.t <= 0) mon.bound = null;
  }
}

export { STAT_NAME };
