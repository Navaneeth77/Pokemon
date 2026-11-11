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
import { abilityOf, typesOf, isContact } from './data/abilities.js';
import { ITEMS } from './data/items.js';
import { STAT_NAME } from './stats.js';
import { applyHit } from './combat.js';
import { setSide, toggleTrickRoom, breakScreens, swapCourts } from './field.js';
import { Ring, Glow, Pillar, FloatText, BeamLine, ItemFly, rand } from './effects.js';
import { sfx } from './audio.js';
import { EXTRA_STATUS, extraPower, extraFixed, extraAfterUse, extraOnHit, tickExtra, setExtraTable } from './effects-extra.js';

// The game's move table, set by moves.js once it is built (this module can't import it: moves.js imports this one).
let MOVE_TABLE = {};
export const setMoveTable = t => { MOVE_TABLE = t; setExtraTable(t); };
const hasStatus = mon => Object.values(mon.status ?? {}).some(v => v > 0) || mon.frozen > 0;
const onField = mon => mon?.alive && !mon.hidden;
// A foe running away from the attacker (Pursuit): moving, and the move takes it further off.
const fleeing = (user, t) => t.moving && (t.lastMove.x * (t.x - user.x) + t.lastMove.y * (t.y - user.y)) > 0;

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
    case 'waterSpout': case 'eruption': case 'dragonEnergy': return Math.max(1, Math.round(150 * user.hp / user.maxHp));
    // Reversal / Flail: the less HP it has left, the harder it hits (the games' six steps).
    case 'reversal': case 'flail': { const r = user.hp / user.maxHp; return r < 0.042 ? 200 : r < 0.104 ? 150 : r < 0.208 ? 100 : r < 0.354 ? 80 : r < 0.688 ? 40 : 20; }
    // Wring Out / Crush Grip / Hard Press: the more HP the foe has left, the harder.
    case 'wringOut': case 'crushGrip': return Math.max(1, Math.round(120 * target.hp / target.maxHp));
    case 'hardPress': return Math.max(1, Math.round(100 * target.hp / target.maxHp));
    // Revenge: double if it was just hit; Assurance: double if the foe was just hurt.
    case 'revenge': return game.time - (user.hurtAt ?? -9) < 1.5 ? p * 2 : p;
    case 'assurance': return game.time - (target.hurtAt ?? -9) < 1.5 ? p * 2 : p;
    case 'smellingSalts': return target.status?.para > 0 ? p * 2 : p;
    case 'wakeUpSlap': return target.status?.sleep > 0 ? p * 2 : p;
    // Last Respects: 50 more for every teammate that has fainted.
    case 'lastRespects': return Math.min(300, 50 + 50 * game.teamOf(user).members.filter(m => !m.alive || m.fainted).length);
    case 'frustration': return 102;
    case 'hydroSteam': return game.weather === 'sun' ? Math.round(p * 3) : p; // boosted (not weakened) by the sun
    case 'expandingForce': case 'psyblade': return game.terrain ? Math.round(p * 1.5) : p;
    case 'lashOut': return Object.values(user.stages ?? {}).some(n => n < 0) ? p * 2 : p;
    case 'fishiousRend': case 'boltBeak': return target.action ? p : p * 2; // hits harder when the foe hasn't acted yet
    case 'rageFist': return Math.min(350, 50 + 50 * (user.ab?.hitsTaken ?? 0));
    // Payback: double if it was hit in the last moment; Retaliate: double right after a teammate fainted.
    case 'payback': return game.time - (user.hurtAt ?? -9) < 1.5 ? p * 2 : p;
    case 'retaliate': return game.time - (game.teamOf(user).faintAt ?? -99) < 9 ? p * 2 : p;
    case 'risingVoltage': return game.terrain?.kind === 'electric' && !target.species.fly && !(target.magnetRise > 0) && !abilityOf(target).levitating ? p * 2 : p;
    case 'pursuit': return fleeing(user, target) ? p * 2 : p;
    // Beat Up: every healthy teammate without a status joins in.
    case 'beatUp': return 12 * Math.max(1, game.teamOf(user).members.filter(m => m.alive && !m.fainted && !hasStatus(m)).length);
    default: return extraPower(game, user, target, move) ?? p; // effects-extra.js: Echoed Voice, Rollout, Fling…
  }
}

// Moves whose damage isn't the usual formula.
export function fixedDamage(game, user, target, move) {
  switch (move.id) {
    case 'seismicToss': case 'nightShade': return FIXED;
    case 'superFang': return Math.max(1, Math.floor(target.hp / 2));
    case 'endeavor': return Math.max(0, target.hp - user.hp);
    case 'naturesMadness': case 'ruination': return Math.max(1, Math.floor(target.hp / 2));
    default: return extraFixed(game, user, target, move) ?? move.fixedDmg ?? null; // OHKO moves, Final Gambit; a Counter / Mirror Coat / Metal Burst blow
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
  extraOnHit(game, attacker, target, move);
  const A = abilityOf(attacker), serene = A.serene ? 2 : 1;
  if (move.id === 'fakeOut' && target.alive) game.applyStatus(target, 'stun', { source: attacker, dur: 0.6 });
  // Dragon Tail and Circle Throw drag the foe out for a random teammate (not a substitute).
  if ((move.id === 'dragonTail' || move.id === 'circleThrow') && target.alive && !target.substitute) game.later(0.3, () => onField(target) && game.dragOut(target, attacker));
  // Ceaseless Edge scatters spikes around the foe's side.
  if (move.id === 'ceaselessEdge') game.setHazard(target.side, 'spikes', attacker);
  // Pluck and Bug Bite eat the foe's Berry.
  if ((move.id === 'pluck' || move.id === 'bugBite') && ITEMS[target.item]?.berry && attacker.alive && !target.remote) {
    const it = ITEMS[target.item];
    game.itemPop(attacker, `It ate the foe's ${it.name}!`);
    it.eat?.(game, attacker, 1);
    game.useUpItem(target);
  }
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
  if (move.id === 'glaiveRush' && user.alive) user.glaiveT = 3; // open to double damage for a moment
  extraAfterUse(game, user, move);
}

// The user may switch out right away (U-turn's rule, for Parting Shot, Teleport, Shed Tail, Chilly Reception).
function pivotReady(game, user, move) {
  if (!user.alive || game.teamOf(user).nextAlive() < 0) return false;
  if (user.side === 'player') game.switchCD = 0;
  else game.foeSwitchCD = 0;
  game.floatText(user, 'SWITCH READY!', '#9fe8ff');
  game.emit('pivot', { mon: user, move });
  return true;
}

// Before a hit's damage: Brick Break and Psychic Fangs shatter screens; Spectral Thief steals the foe's boosts.
export function beforeHit(game, attacker, target, move, stack) {
  if (stack.beforeDone) return;
  stack.beforeDone = true;
  if (['brickBreak', 'psychicFangs', 'ragingBull'].includes(move.id)) breakScreens(game, target.side, attacker);
  if (move.id === 'spectralThief' && !target.remote) {
    const up = Object.fromEntries(Object.entries(target.stages ?? {}).filter(([, n]) => n > 0));
    if (Object.keys(up).length) {
      for (const k of Object.keys(up)) target.stages[k] = 0;
      game.stage(attacker, up);
      game.spawn(new FloatText(attacker.x, attacker.y - attacker.headZ - 20, 'BOOSTS STOLEN!', '#b08aff', 7));
      game.ui.log(`${attacker.species.name} stole the target's boosted stats!`, attacker.side);
    }
  }
}

// Tera Blast hits with the user's higher attacking stat once it has Terastallized.
export const moveCategory = (move, user) => (move.id === 'teraBlast' && user.tera && (user.species.atk ?? 0) > (user.species.spa ?? 0) ? 'physical' : move.cat);

// Counter, Mirror Coat, Metal Burst: a hit of the matching kind during the window comes straight back,
// multiplied, as a hit of the counter move's own type.
export function counterHit(game, attacker, target, move, cat, dmg) {
  const c = target.counter;
  if (!c || attacker === target || move.ultimate || move.counterBlow || (c.cat && c.cat !== cat) || !attacker.alive) return;
  target.counter = null;
  const blow = { ...c.move, fixedDmg: Math.max(1, Math.round(dmg * c.mult)), counterBlow: true, acc: 100 };
  game.later(0.12, () => {
    if (!onField(target) || !onField(attacker) || game.state !== 'fighting') return;
    game.spawn(new BeamLine(target.x, target.y - target.bodyZ, attacker.x, attacker.y - attacker.bodyZ, 0.25, c.color, 4));
    game.spawn(new Ring(attacker.x, attacker.y, { z: attacker.bodyZ, r0: 4, r1: attacker.radius + 16, life: 0.3, color: c.color, width: 3, layer: 'air' }));
    const d = Math.hypot(attacker.x - target.x, attacker.y - target.y) || 1;
    applyHit(game, target, attacker, blow, { dirX: (attacker.x - target.x) / d, dirY: (attacker.y - target.y) / d, knockback: 200, stagger: 0.35, unblockable: true });
  });
}

// Jump Kick / High Jump Kick: missing (or hitting nothing) sends the user crashing down.
export function crashOnMiss(game, attacker, move) {
  if (move.id !== 'jumpKick' && move.id !== 'highJumpKick') return;
  game.ui.log(`${attacker.species.name} kept going and crashed!`, attacker.side);
  game.dotDamage(attacker, 1 / 2, '#ff9a5a');
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
    // ── The competitive pools' status moves (field.js has the side conditions) ──
    case 'encore': {
      const id = game.lastUsed[foe?.side];
      if (!onField(foe) || !id || id === 'encore' || foe.encore || !foe.moves.includes(id)) return fail(game, user);
      foe.encore = { id, t: 5 };
      game.floatText(foe, 'ENCORE!', '#ffd84a');
      return say(`${foe.species.name} received an encore! It must keep using ${MOVE_TABLE[id]?.name ?? 'that move'}.`);
    }
    case 'trick':
    case 'switcheroo': {
      if (!onField(foe) || (!user.item && !foe.item) || foe.remote || (foe.item && abilityOf(foe).stickyHold)) return fail(game, user);
      [user.item, foe.item] = [foe.item, user.item];
      game.spawn(new ItemFly(user.x, user.y, user.bodyZ, foe.x > user.x ? 1 : -1));
      game.spawn(new ItemFly(foe.x, foe.y, foe.bodyZ, user.x > foe.x ? 1 : -1));
      game.floatText(user, 'ITEMS SWAPPED!', '#ffd84a');
      if (!user.item) abilityOf(user).onItemLost?.(game, user);
      if (!foe.item) abilityOf(foe).onItemLost?.(game, foe);
      say(`${user.species.name} switched items with ${foe.species.name}!`);
      if (user.item) say(`${user.species.name} obtained ${ITEMS[user.item]?.name ?? 'an item'}.`);
      return;
    }
    case 'roar':
    case 'whirlwind':
      if (!foe || !game.dragOut(foe, user)) return fail(game, user);
      return;
    case 'curse':
      // Ghost types cut their own HP to curse the foe (¼ of its HP every 3s until it leaves); others power up.
      if (typesOf(user).includes('ghost')) {
        if (!onField(foe) || foe.cursed) return fail(game, user);
        user.hp = Math.max(0, user.hp - Math.floor(user.maxHp / 2));
        foe.cursed = { t: 0 };
        game.floatText(foe, 'CURSED!', '#b08aff');
        say(`${user.species.name} cut its own HP and laid a curse on ${foe.species.name}!`);
        if (!user.alive) game.onFaint(user, foe);
        return;
      }
      return game.stage(user, { atk: 1, def: 1, spe: -1 });
    case 'painSplit': {
      if (!onField(foe) || (foe.substitute && foe.shield > 0)) return fail(game, user);
      const avg = Math.floor((user.hp + foe.hp) / 2);
      for (const m of [user, foe]) {
        m.hp = Math.min(m.maxHp, avg);
        m.trailDelay = 0.45;
      }
      game.spawn(new BeamLine(user.x, user.y - user.bodyZ, foe.x, foe.y - foe.bodyZ, 0.35, '#c8b0ff', 3));
      return say('The battlers shared their pain!');
    }
    case 'yawn':
      if (!onField(foe) || foe.yawn > 0 || hasStatus(foe) || (foe.substitute && foe.shield > 0)) return fail(game, user);
      foe.yawn = 2.5;
      game.floatText(foe, 'DROWSY…', '#c8b0ff');
      return say(`${user.species.name} made ${foe.species.name} drowsy!`);
    case 'teleport':
      if (!pivotReady(game, user, move)) return fail(game, user);
      return;
    case 'healingWish':
      // The user faints; the next Pokémon to come in on its side is restored in full (field.js).
      if (game.teamOf(user).nextAlive() < 0 || user.remote) return fail(game, user);
      game.pending[user.side].healingWish = true;
      say(`${user.species.name} made a healing wish!`);
      user.hp = 0;
      return game.onFaint(user, null);
    case 'destinyBond':
      user.destinyBond = 2.5;
      game.floatText(user, 'DESTINY BOND!', '#b08aff');
      return say(`${user.species.name} is hoping to take its attacker down with it!`);
    case 'partingShot':
      if (onField(foe) && !(foe.substitute && foe.shield > 0)) game.stage(foe, { atk: -1, spa: -1 }, user);
      pivotReady(game, user, move);
      return;
    case 'reflect':
    case 'lightScreen':
    case 'tailwind':
      if (!setSide(game, user.side, move.id, user)) return fail(game, user);
      return;
    case 'auroraVeil':
      if ((game.weather !== 'snow' && game.weather !== 'hail') || !setSide(game, user.side, 'auroraVeil', user)) return fail(game, user);
      return;
    case 'trickRoom':
      return toggleTrickRoom(game, user);
    case 'counter':
    case 'mirrorCoat':
    case 'metalBurst': {
      const look = { counter: ['physical', 2, '#ff9a5a'], mirrorCoat: ['special', 2, '#ff8ad0'], metalBurst: [null, 1.5, '#dfe7f2'] }[move.id];
      user.counter = { t: 1.2, cat: look[0], mult: look[1], color: look[2], move };
      return game.floatText(user, 'READY TO COUNTER!', look[2]);
    }
    case 'shedTail':
      if (user.hp <= user.maxHp / 2 || game.teamOf(user).nextAlive() < 0 || user.remote) return fail(game, user);
      user.hp -= Math.ceil(user.maxHp / 2);
      game.pending[user.side].shedTail = Math.floor(user.maxHp / 4);
      say(`${user.species.name} shed its tail to create a decoy!`);
      pivotReady(game, user, move);
      return;
    case 'chillyReception':
      say(`${user.species.name} is preparing to tell a chillingly bad joke!`);
      game.setWeather('snow', ITEMS[user.item]?.rock === 'snow' ? 40 : 25);
      pivotReady(game, user, move);
      return;
    case 'focusEnergy':
      if (user.focusEnergy) return fail(game, user);
      user.focusEnergy = true;
      game.floatText(user, 'GETTING PUMPED!', '#ffb070');
      return say(`${user.species.name} is getting pumped!`);
    case 'conversion': {
      const t = MOVE_TABLE[user.moves[0]]?.type;
      if (!t || (typesOf(user).length === 1 && typesOf(user)[0] === t)) return fail(game, user);
      user.typeOverride = [t];
      game.floatText(user, `${t.toUpperCase()} TYPE!`, '#9fe8ff');
      return say(`${user.species.name} transformed into the ${t[0].toUpperCase()}${t.slice(1)} type!`);
    }
    case 'soak':
      if (!onField(foe) || (typesOf(foe).length === 1 && typesOf(foe)[0] === 'water') || foe.tera) return fail(game, user);
      foe.typeOverride = ['water'];
      game.floatText(foe, 'SOAKED!', '#7ac8ff');
      return say(`${foe.species.name} transformed into the Water type!`);
    case 'block':
      if (!onField(foe) || foe.blocked > 0) return fail(game, user);
      foe.blocked = 8;
      game.floatText(foe, "CAN'T ESCAPE!", '#ffb070');
      return say(`${foe.species.name} can no longer escape!`);
    case 'clangorousSoul':
      if (user.hp <= user.maxHp / 3) return fail(game, user);
      user.hp -= Math.floor(user.maxHp / 3);
      return game.stage(user, { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 });
    case 'filletAway':
      if (user.hp <= user.maxHp / 2) return fail(game, user);
      user.hp -= Math.floor(user.maxHp / 2);
      return game.stage(user, { atk: 2, spa: 2, spe: 2 });
    case 'courtChange':
      swapCourts(game);
      return say(`${user.species.name} swapped the battle effects affecting each side of the field!`);
    case 'revivalBlessing': {
      const team = game.teamOf(user), i = team.members.findIndex(m => m !== user && (m.fainted || !m.alive));
      if (i < 0 || user.remote) return fail(game, user);
      const m = team.members[i];
      Object.assign(m, { fainted: false, hp: Math.floor(m.maxHp / 2), status: {} });
      game.netSend(user, { t: 'revive', i });
      game.ui.refreshTeam?.(game);
      return say(`${m.species.name} was revived and is ready to fight again!`);
    }
    case 'recycle':
      if (user.item || !user.usedItem) return fail(game, user);
      user.item = user.usedItem;
      user.usedItem = null;
      return game.itemPop(user, `It found its ${ITEMS[user.item]?.name ?? 'item'}!`);
    case 'magnetRise':
      if (user.magnetRise > 0) return fail(game, user);
      user.magnetRise = 15;
      game.floatText(user, 'MAGNET RISE!', '#ffe066');
      return say(`${user.species.name} levitated with electromagnetism!`);
    case 'splash':
      game.floatText(user, 'BUT NOTHING HAPPENED!', '#c9d2de');
      return say('But nothing happened!');
    case 'celebrate':
      game.floatText(user, 'CONGRATULATIONS!', '#ffd84a');
      return say(`Congratulations, ${user.trainer?.name ?? 'Trainer'}!`);
    case 'happyHour':
      game.floatText(user, 'HAPPY HOUR!', '#ffd84a');
      return say('Everyone is caught up in the happy atmosphere!');
    case 'holdHands':
      game.floatText(user, '♥', '#ff8ad0');
      return say(`${user.species.name} and its trainer held hands. They're happy!`);
    // Future Sight / Doom Desire: the attack lands on whichever foe is out 2.5s later.
    case 'futureSightAtk':
    case 'doomDesire': {
      const side = foe?.side, p = game.pending[side];
      if (!side || p.future) return fail(game, user);
      p.future = true;
      say(move.id === 'futureSightAtk' ? `${user.species.name} foresaw an attack!` : `${user.species.name} chose Doom Desire as its destiny!`);
      const rgb = move.id === 'futureSightAtk' ? [255, 120, 210] : [200, 220, 255], color = `rgb(${rgb.join(',')})`;
      game.spawn(new Pillar(user.x, user.y, 0.5, rgb, 160));
      game.later(2.5, () => {
        p.future = false;
        const t = side === 'player' ? game.player : game.opponent;
        if (!onField(t) || game.state !== 'fighting') return;
        game.spawn(new Pillar(t.x, t.y, 0.45, rgb, 240));
        game.spawn(new Ring(t.x, t.y, { r0: 6, r1: 56, life: 0.4, color, width: 4 }));
        game.spawn(new Glow(t.x, t.y, t.bodyZ, 34, rgb, 0.4));
        sfx.pulse?.();
        game.ui.log(`${t.species.name} took the ${move.name} attack!`, t.side);
        applyHit(game, user, t, move, { knockback: 140, stagger: 0.35, dirX: 0, dirY: side === 'player' ? 1 : -1 });
      });
      return;
    }
    default:
      if (EXTRA_STATUS[move.id]) return EXTRA_STATUS[move.id](game, user, move); // effects-extra.js
      return game.floatText(user, `${move.name.toUpperCase()}!`, '#ffffff');
  }
}

const fail = (game, user) => {
  game.floatText(user, 'IT FAILED!', '#c9d2de');
  game.ui.log('But it failed!', user.side);
};

// Ongoing effects ticked by the game: Wish landing, Salt Cure, binding moves, Taunt wearing off.
export function tickVolatiles(game, mon, dt) {
  tickExtra(game, mon, dt);
  if (mon.taunted > 0) mon.taunted = Math.max(0, mon.taunted - dt);
  for (const k of ['destinyBond', 'blocked', 'magnetRise', 'glaiveT']) if (mon[k] > 0) mon[k] = Math.max(0, mon[k] - dt);
  if (mon.counter && (mon.counter.t -= dt) <= 0) mon.counter = null;
  if (mon.encore && (mon.encore.t -= dt) <= 0) {
    mon.encore = null;
    game.ui.log(`${mon.species.name}'s encore ended!`, mon.side);
  }
  // Yawn: it falls asleep a moment later unless it already has a status.
  if (mon.yawn > 0 && (mon.yawn -= dt) <= 0) {
    mon.yawn = 0;
    if (!hasStatus(mon)) game.applyStatus(mon, 'sleep', { dur: 3 });
  }
  // Curse: ¼ of its max HP every 3s until it leaves the field.
  if (mon.cursed && (mon.cursed.t += dt) >= 3) {
    mon.cursed.t = 0;
    game.dotDamage(mon, 1 / 4, '#8a6ab8');
    game.ui.log(`${mon.species.name} is afflicted by the curse!`, mon.side);
  }
  if (mon.cursed && !game.headless && Math.random() < dt * 6) game.particles.spawn({ x: mon.x + rand(-10, 10), y: mon.y, z: mon.headZ + rand(0, 8), vz: rand(10, 25), vx: rand(-8, 8), life: 0.7, size: rand(2, 3), sizeEnd: 1, colors: ['#d0b8ff', '#6a4a9a'] });
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
