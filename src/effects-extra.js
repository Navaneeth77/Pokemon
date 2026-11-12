// Rules for the moves from the full learnsets that need more than the official data (effects-resolver.js calls in):
//   confusion and infatuation (Confuse Ray, Supersonic, Swagger, Attract…), move locks (Disable, Torment, Imprison,
//   Spite), stat tools (Psych Up, the Swaps, Topsy-Turvy, Acupressure, Stockpile, Charge, Laser Focus, Lock-On…),
//   side and field effects (Safeguard, Mist, Lucky Chant, Gravity, Magic Room, Wonder Room), sacrifices and switches
//   (Memento, Perish Song, Final Gambit, Baton Pass, Grudge), ability and type changes (Skill Swap, Worry Seed,
//   Magic Powder…), moves that use other moves (Metronome, Mirror Move, Assist, Nature Power), Mimic, Sketch and
//   Transform, Endure, and attacks with power rules of their own (Echoed Voice, Fury Cutter, Rollout, Fling, Present,
//   the one-hit KO moves…). A "turn" is about 3s, as elsewhere.
import { abilityOf, typesOf } from './data/abilities.js';
import { ITEMS, itemOf } from './data/items.js';
import { accuracyMult } from './stats.js';
import { typeMultiplier, TYPE_COLORS } from './data/types.js';
import { applyHit } from './combat.js';
import { setSide } from './field.js';
import { Ring, Glow, FloatText, rand } from './effects.js';
import { sfx } from './audio.js';

let MOVES = {};
export const setExtraTable = t => (MOVES = t);

const onField = mon => mon?.alive && !mon.hidden;
const hasStatus = mon => Object.values(mon.status ?? {}).some(v => v > 0) || mon.frozen > 0;
const asleep = mon => mon?.status?.sleep > 0;
const log = (g, mon, text) => g.ui.log(text, mon.side);
const fail = (g, mon, text = 'IT FAILED!') => { g.floatText(mon, text, '#c9d2de'); return false; };
const STATS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'];
const bossy = mon => mon.boss || mon.remote;

// Moves Gravity keeps on the ground.
const GRAVITY_BANNED = new Set(['fly', 'bounce', 'magnetRise', 'highJumpKick', 'jumpKick', 'splash', 'skyDrop', 'telekinesis', 'flyingPress']);
// Moves Metronome and Assist never pick.
const NO_CALL = new Set(['metronome', 'mirrorMove', 'assist', 'naturePower', 'copycat', 'copy', 'sleepTalk', 'mimic', 'sketch', 'transform', 'struggle',
  'protect', 'detect', 'endure', 'spikyShield', 'banefulBunker', 'kingsShield', 'obstruct', 'silkTrap', 'counter', 'mirrorCoat', 'metalBurst',
  'destinyBond', 'focusPunch', 'healingWish', 'lunarDance', 'memento', 'finalGambit', 'explosion', 'selfDestruct', 'mistyExplosion', 'shedTail']);

// Moves that use another move: a replayed event names the move picked (game.js useMove).
export const CALLERS = new Set(['metronome', 'mirrorMove', 'assist', 'naturePower']);

// Ids with rules here, for scripts/export-playable.mjs (they may join the move picker).
export const RULED = new Set([
  'endure', 'detect', 'obstruct', 'silkTrap', 'confuseRay', 'supersonic', 'sweetKiss', 'teeterDance', 'swagger', 'flatter', 'attract', 'disable',
  'torment', 'imprison', 'spite', 'meanLook', 'psychUp', 'powerSwap', 'guardSwap', 'heartSwap', 'topsyTurvy', 'acupressure', 'charge',
  'defenseCurl', 'minimize', 'laserFocus', 'lockOn', 'mindReader', 'stockpile', 'swallow', 'spitUp', 'venomDrench', 'spicyExtract',
  'safeguard', 'mist', 'luckyChant', 'gravity', 'magicRoom', 'wonderRoom', 'hail', 'batonPass', 'memento', 'perishSong', 'ingrain', 'refresh',
  'lunarBlessing', 'purify', 'psychoShift', 'grudge', 'skillSwap', 'rolePlay', 'entrainment', 'worrySeed', 'simpleBeam', 'gastroAcid',
  'magicPowder', 'forestsCurse', 'trickOrTreat', 'reflectType', 'odorSleuth', 'foresight', 'corrosiveGas', 'stuffCheeks', 'octolock',
  'metronome', 'mirrorMove', 'assist', 'naturePower', 'mimic', 'sketch', 'transform',
  'round', 'echoedVoice', 'furyCutter', 'rollout', 'iceBall', 'tripleKick', 'waterShuriken', 'grassPledge', 'firePledge', 'waterPledge', 'lastResort',
  'synchronoise', 'present', 'fling', 'snore', 'dreamEater', 'burnUp', 'thrash', 'ragingFury', 'uproar', 'jawlock', 'mistyExplosion',
  'finalGambit', 'fissure', 'sheerCold', 'guillotine', 'hornDrill', 'dive', 'skullBash', 'solarBlade', 'electroShot', 'shadowForce', 'selfDestruct',
  'guardSplit', 'powerSplit', 'powerTrick', 'speedSwap', 'magicCoat', 'comeuppance', 'bide', 'electrify', 'camouflage', 'conversion2', 'waterSport',
  'telekinesis', 'fairyLock',
]);

// The move's own accuracy against the foe, for status moves (Lock-On and Gravity count).
function lands(g, user, foe, move) {
  if (move.sound && abilityOf(foe).soundproof) { g.abilityPop(foe, "Soundproof: it can't hear it!"); return false; }
  if (move.sure || move.acc == null || user.lockOn > 0) { user.lockOn = 0; return true; }
  const ok = Math.random() * 100 < move.acc * accuracyMult(user, foe) * (g.gravity > 0 ? 5 / 3 : 1);
  if (!ok) { g.floatText(foe, 'MISSED!', '#c9d2de'); log(g, user, `${user.species.name}'s ${move.name} missed!`); }
  return ok;
}

export function confuse(g, mon, by) {
  if (!onField(mon) || bossy(mon)) return false;
  if (mon.confused > 0) return fail(g, mon, 'ALREADY CONFUSED');
  if (abilityOf(mon).noConfusion) { g.abilityPop(mon, "It doesn't get confused!"); return false; }
  if (by && by.side !== mon.side && g.sides?.[mon.side]?.safeguard > 0) return fail(g, mon, 'SAFEGUARD!');
  mon.confused = 3 + Math.random() * 3;
  g.floatText(mon, 'CONFUSED!', '#e0a0ff');
  g.spawn(new Ring(mon.x, mon.y, { z: mon.headZ + 4, r0: 4, r1: 16, life: 0.4, color: '#e0a0ff', width: 2, layer: 'air' }));
  log(g, mon, `${mon.species.name} became confused!`);
  return true;
}

// Before a move comes out (game.js useMove): locks, conditions, confusion and infatuation. True = it doesn't.
export function moveBlocked(g, user, id, base) {
  if (base.ultimate) return false;
  const foe = user.foe, no = text => { g.floatText(user, text, '#c9d2de'); return true; };
  // Rollout / Ice Ball keep rolling and Thrash / Raging Fury keep raging; Bide holds still while it stores damage.
  if (user.rampage && user.rampage.id !== id) return no(`LOCKED INTO ${(MOVES[user.rampage.id]?.name ?? 'IT').toUpperCase()}`);
  if (user.bide && id !== 'bide') return no('BIDING!');
  if (user.disabled?.t > 0 && user.disabled.id === id) return no('DISABLED!');
  if (user.tormented > 0 && g.lastUsed[user.side] === id) return no('TORMENTED!');
  if (onField(foe) && foe.imprison > 0 && foe.moves.includes(id)) return no('IMPRISONED!');
  if (g.gravity > 0 && GRAVITY_BANNED.has(id)) return no('GRAVITY!');
  if (id === 'dreamEater' && !asleep(foe)) return no('IT FAILED!');
  if (id === 'burnUp' && !typesOf(user).includes('fire')) return no('IT FAILED!');
  if (id === 'fling' && !itemOf(user)) return no('NOTHING TO FLING');
  if (id === 'synchronoise' && !(onField(foe) && typesOf(foe).some(t => typesOf(user).includes(t)))) return no('IT FAILED!');
  if (id === 'spitUp' && !(user.stockpile > 0)) return no('NOTHING STOCKPILED');
  if (id === 'sheerCold' && onField(foe) && typesOf(foe).includes('ice')) return no('IT FAILED!');
  if (id === 'lastResort' && user.moves.filter(m => m !== 'lastResort').some(m => !user.usedMoves?.has(m))) return no('NOT YET!');
  if (id === 'comeuppance' && !(user.lastHit && g.time - user.lastHit.t < 3)) return no('NOTHING TO RETURN');
  if (user.infatuated > 0 && Math.random() < 0.5) {
    g.floatText(user, 'IMMOBILISED BY LOVE', '#ff9fd0');
    g.startCooldown(user, id, base.cooldown * 0.5);
    return true;
  }
  if (user.confused > 0 && Math.random() < 0.33) {
    g.floatText(user, 'HURT ITSELF IN CONFUSION!', '#e0a0ff');
    log(g, user, `${user.species.name} hurt itself in its confusion!`);
    g.dotDamage(user, 1 / 10, '#e0a0ff');
    g.startCooldown(user, id, base.cooldown * 0.5);
    return true;
  }
  return false;
}

// Power rules (effects-resolver.js movePower); undefined = the move's own power.
export function extraPower(g, user, target, move) {
  const p = move.power, chain = user.chainUse?.id === move.id && g.time - user.chainUse.t < 4 ? user.chainUse.n : 0;
  switch (move.id) {
    case 'echoedVoice': return Math.min(200, 40 * (chain + 1));
    case 'furyCutter': return Math.min(160, 40 * 2 ** chain);
    case 'rollout': case 'iceBall': return Math.min(240, 30 * 2 ** chain);
    case 'spitUp': return 100 * Math.max(1, user.stockpile ?? 0);
    case 'present': return [40, 40, 40, 40, 80, 80, 80, 120][Math.floor(Math.random() * 8)];
    case 'fling': return ITEMS[user.item]?.flingPower ?? 60;
    case 'mistyExplosion': return g.terrain?.kind === 'misty' ? Math.round(p * 1.5) : p;
    case 'round': case 'tripleKick': case 'waterShuriken': case 'grassPledge': case 'firePledge': case 'waterPledge': case 'lastResort':
    case 'synchronoise': case 'snore': case 'dreamEater': case 'burnUp': case 'thrash': case 'ragingFury': case 'uproar': case 'jawlock':
      return p;
    default: return undefined;
  }
}

// Fixed damage (effects-resolver.js fixedDamage); undefined = the usual formula.
export function extraFixed(g, user, target, move) {
  switch (move.id) {
    // One-hit KO moves: if they land, the foe faints (a raid boss shrugs it off).
    case 'fissure': case 'sheerCold': case 'guillotine': case 'hornDrill':
      if (target.boss || g.raid) { g.floatText(target, 'UNAFFECTED', '#c9d2de'); return 0; }
      g.floatText(target, "IT'S A ONE-HIT KO!", '#ff7a5a');
      return Math.ceil(target.hp);
    case 'finalGambit': return Math.max(1, Math.ceil(user.hp));
    // Present: one time in five it's a gift that heals the foe instead.
    case 'present':
      if (Math.random() >= 0.2) return undefined;
      g.heal(target, target.maxHp / 4);
      g.floatText(target, 'A PRESENT: HEALED!', '#9fffc8');
      return 0;
    // Comeuppance: the last hit it took (within a turn), back at 1.5×.
    case 'comeuppance': return user.lastHit && g.time - user.lastHit.t < 3 ? Math.round(user.lastHit.dmg * 1.5) : 0;
    default: return undefined;
  }
}

// After a move is used (effects-resolver.js afterUse).
export function extraAfterUse(g, user, move) {
  const id = move.id;
  (user.usedMoves ??= new Set()).add(id);
  if (['echoedVoice', 'furyCutter', 'rollout', 'iceBall'].includes(id)) {
    const same = user.chainUse?.id === id && g.time - user.chainUse.t < 4;
    user.chainUse = { id, n: same ? Math.min(4, user.chainUse.n + 1) : 1, t: g.time };
  }
  if (['mistyExplosion', 'finalGambit'].includes(id) && user.alive) g.dotDamage(user, 1, '#ff9a5a');
  // Rollout / Ice Ball: locked in for five rolls (or until it stops for a moment).
  if ((id === 'rollout' || id === 'iceBall') && user.alive) user.rampage = user.chainUse.n < 5 ? { id, t: 2.5 } : null;
  // Thrash / Raging Fury: locked in for a second use, then it's confused from fatigue.
  if ((id === 'thrash' || id === 'ragingFury') && user.alive) {
    if (user.rampage?.id !== id) user.rampage = { id, t: 3, left: 1, tire: true };
    else if (--user.rampage.left <= 0) { user.rampage = null; confuse(g, user, null); }
  }
  // Uproar: for 3s nobody can sleep, and anyone asleep wakes up.
  if (id === 'uproar' && user.alive) {
    user.uproar = 3;
    for (const mon of [g.player, g.opponent]) if (mon?.status?.sleep > 0) { mon.status.sleep = 0; g.floatText(mon, 'WOKE UP!', '#ffe680'); }
  }
  if (id === 'burnUp' && user.alive) {
    const t = typesOf(user).filter(x => x !== 'fire');
    user.typeOverride = t.length ? t : ['normal'];
    g.floatText(user, 'BURNED OUT!', '#ff9a5a');
  }
  if (id === 'fling' && user.item) { log(g, user, `${user.species.name} flung its ${ITEMS[user.item]?.name ?? 'item'}!`); user.item = null; }
  if (id === 'spitUp' || id === 'swallow') dropStockpile(g, user);
  if (user.electrified > 0) user.electrified = 0; // Electrify lasts one move
}

// When it connects (effects-resolver.js onHit).
export function extraOnHit(g, attacker, target, move) {
  if (move.id === 'jawlock' && onField(target)) {
    attacker.blocked = target.blocked = 8;
    g.floatText(target, "NEITHER CAN ESCAPE!", '#ffb070');
  }
}

function dropStockpile(g, user) {
  const n = user.stockpile ?? 0;
  if (!n) return;
  user.stockpile = 0;
  user.stages.def = (user.stages.def ?? 0) - n;
  user.stages.spd = (user.stages.spd ?? 0) - n;
}

// The move a "use another move" move picks, used through the game's Copycat path.
function useOther(g, user, id, key, label) {
  // Online, the other screens replay the move the server picked (it arrives as its own event: game.js useMove).
  if (user.remote) return false;
  if (!id || !MOVES[id] || MOVES[id].ultimate || NO_CALL.has(id)) return fail(g, user);
  g.floatText(user, `${label} → ${MOVES[id].name.toUpperCase()}!`, '#ffd84a', 8);
  user.cooldowns[key] = 0;
  return g.useCopy(user, id, key);
}

const shuffle = list => list[Math.floor(Math.random() * list.length)];

// Status moves (effects-resolver.js statusMove). Return value is ignored.
export const EXTRA_STATUS = {
  endure(g, user) { user.endure = 0.9; g.floatText(user, 'ENDURE!', '#ffd84a'); log(g, user, `${user.species.name} braced itself!`); },
  confuseRay(g, user, move) { if (lands(g, user, user.foe, move)) confuse(g, user.foe, user); },
  swagger(g, user, move) { const f = user.foe; if (onField(f) && lands(g, user, f, move)) { g.stage(f, { atk: 2 }, user); confuse(g, f, user); } },
  flatter(g, user, move) { const f = user.foe; if (onField(f) && lands(g, user, f, move)) { g.stage(f, { spa: 1 }, user); confuse(g, f, user); } },
  attract(g, user, move) {
    const f = user.foe;
    if (!onField(f) || bossy(f) || f.infatuated > 0) return fail(g, user);
    if (abilityOf(f).noInfatuation) { g.abilityPop(f, "It doesn't fall in love!"); return; }
    if (!lands(g, user, f, move)) return;
    f.infatuated = 6;
    g.floatText(f, 'FELL IN LOVE!', '#ff9fd0');
    for (let i = 0; i < 6; i++) g.particles.spawn({ x: f.x + rand(-12, 12), y: f.y, z: f.headZ + rand(0, 8), vz: rand(15, 35), life: 0.8, size: rand(2, 3), sizeEnd: 1, colors: ['#ffd0e8', '#ff70b0'] });
    log(g, f, `${f.species.name} fell in love!`);
  },
  disable(g, user, move) {
    const f = user.foe, id = g.lastUsed[f?.side];
    if (!onField(f) || !id || MOVES[id]?.ultimate || f.disabled?.t > 0) return fail(g, user);
    if (!lands(g, user, f, move)) return;
    f.disabled = { id, t: 9 };
    g.floatText(f, `${MOVES[id].name.toUpperCase()} DISABLED!`, '#ffb070');
    log(g, f, `${f.species.name}'s ${MOVES[id].name} was disabled!`);
  },
  torment(g, user) { const f = user.foe; if (!onField(f) || f.tormented > 0) return fail(g, user); f.tormented = 9; g.floatText(f, 'TORMENTED!', '#ff7a5a'); log(g, f, `${f.species.name} was subjected to torment!`); },
  imprison(g, user) { user.imprison = 12; g.floatText(user, 'IMPRISON!', '#b08aff'); log(g, user, `${user.species.name} sealed any moves its foe shares with it!`); },
  spite(g, user) {
    const f = user.foe, id = g.lastUsed[f?.side];
    if (!onField(f) || !id || MOVES[id]?.ultimate) return fail(g, user);
    f.cooldowns[id] = (f.cooldowns[id] ?? 0) + 6;
    g.floatText(f, 'SPITE!', '#8a6ab8');
    log(g, f, `${f.species.name}'s ${MOVES[id].name} needs much longer to recharge!`);
  },
  psychUp(g, user) { const f = user.foe; if (!onField(f)) return fail(g, user); user.stages = { ...f.stages }; g.floatText(user, 'COPIED STAT CHANGES', '#c8a0ff'); },
  powerSwap: (g, user) => swapStages(g, user, ['atk', 'spa'], 'Attack and Sp. Atk'),
  guardSwap: (g, user) => swapStages(g, user, ['def', 'spd'], 'Defense and Sp. Def'),
  heartSwap: (g, user) => swapStages(g, user, STATS, 'stat changes'),
  topsyTurvy(g, user) {
    const f = user.foe;
    if (!onField(f) || !Object.values(f.stages ?? {}).some(Boolean)) return fail(g, user);
    for (const k of Object.keys(f.stages)) f.stages[k] = -f.stages[k];
    g.floatText(f, 'STATS INVERTED!', '#c8a0ff');
    log(g, f, `${f.species.name}'s stat changes were all reversed!`);
  },
  acupressure(g, user) { const open = STATS.filter(k => (user.stages[k] ?? 0) < 6); if (!open.length) return fail(g, user); g.stage(user, { [shuffle(open)]: 2 }); },
  charge(g, user) { user.charged = true; g.floatText(user, 'CHARGED!', '#ffe066'); g.stage(user, { spd: 1 }); },
  defenseCurl(g, user) { g.stage(user, { def: 1 }); },
  minimize(g, user) { g.stage(user, { evasion: 2 }); },
  laserFocus(g, user) { user.laserFocus = 6; g.floatText(user, 'LASER FOCUS!', '#ff7a5a'); },
  lockOn(g, user) { if (!onField(user.foe)) return fail(g, user); user.lockOn = 6; g.floatText(user.foe, 'LOCKED ON!', '#ffd84a'); },
  stockpile(g, user) {
    if ((user.stockpile ?? 0) >= 3) return fail(g, user);
    user.stockpile = (user.stockpile ?? 0) + 1;
    g.floatText(user, `STOCKPILE ${user.stockpile}`, '#ffd84a');
    g.stage(user, { def: 1, spd: 1 });
  },
  swallow(g, user) {
    const n = user.stockpile ?? 0;
    if (!n || user.hp >= user.maxHp) return fail(g, user);
    g.heal(user, user.maxHp * [0.25, 0.5, 1][n - 1]);
    dropStockpile(g, user);
  },
  venomDrench(g, user) { const f = user.foe; if (!onField(f) || !(f.status?.poison > 0)) return fail(g, user); g.stage(f, { atk: -1, spa: -1, spe: -1 }, user); },
  spicyExtract(g, user) { const f = user.foe; if (!onField(f)) return fail(g, user); g.stage(f, { atk: 2, def: -2 }, user); },
  safeguard(g, user) { if (!setSide(g, user.side, 'safeguard', user)) fail(g, user); },
  mist(g, user) { if (!setSide(g, user.side, 'mist', user)) fail(g, user); },
  luckyChant(g, user) { if (!setSide(g, user.side, 'luckyChant', user)) fail(g, user); },
  gravity(g, user) {
    if (g.gravity > 0) return fail(g, user);
    g.gravity = 15;
    g.hud.showBanner('GRAVITY', { color: '#b8a0ff', y: 300, life: 1.2, size: 15 });
    log(g, user, 'Gravity intensified!');
    for (const mon of [g.player, g.opponent]) if (onField(mon)) { mon.magnetRise = 0; if (mon.air) mon.air = null; }
  },
  magicRoom(g, user) { for (const mon of [g.player, g.opponent]) if (onField(mon)) mon.magicRoomT = 15; g.hud.showBanner('MAGIC ROOM', { color: '#ffd0a0', y: 300, life: 1.2, size: 15 }); log(g, user, "Held items can't be used for a while!"); },
  wonderRoom(g, user) { for (const mon of [g.player, g.opponent]) if (onField(mon)) mon.wonderRoomT = 15; g.hud.showBanner('WONDER ROOM', { color: '#a0e0ff', y: 300, life: 1.2, size: 15 }); log(g, user, 'Defense and Sp. Def were swapped for a while!'); },
  batonPass(g, user) {
    const team = g.teamOf(user);
    if (team.nextAlive() < 0) return fail(g, user);
    g.pending[user.side].baton = { stages: { ...user.stages }, shield: user.substitute ? user.shield : 0 };
    if (user.side === 'player') g.switchCD = 0;
    else g.foeSwitchCD = 0;
    g.floatText(user, 'BATON READY: SWITCH!', '#9fe8ff');
    log(g, user, `${user.species.name} is ready to pass its boosts on!`);
    g.emit('pivot', { mon: user, move: MOVES.batonPass });
  },
  memento(g, user) {
    const f = user.foe;
    if (onField(f)) g.stage(f, { atk: -2, spa: -2 }, user);
    g.dotDamage(user, 1, '#8a6ab8');
  },
  perishSong(g, user) {
    for (const mon of [g.player, g.opponent]) if (onField(mon) && !(mon.perish > 0) && !bossy(mon) && !abilityOf(mon).soundproof) mon.perish = 9.4;
    g.hud.showBanner('PERISH SONG', { color: '#d8c8ff', y: 300, life: 1.2, size: 15 });
    log(g, user, 'All Pokémon that hear the song will faint in three turns! Switch out to escape it.');
  },
  ingrain(g, user) { if (user.ingrained) return fail(g, user); user.ingrained = true; user.ingrainT = 0; g.floatText(user, 'PLANTED ITS ROOTS', '#7ac850'); log(g, user, `${user.species.name} planted its roots! It can't switch out.`); },
  refresh(g, user) { if (!hasStatus(user) || user.status.sleep > 0) return fail(g, user); user.status = {}; user.frozen = 0; g.floatText(user, 'STATUS CURED!', '#9fffc8'); },
  lunarBlessing(g, user) { user.status = {}; user.frozen = 0; g.heal(user, user.maxHp / 4); },
  purify(g, user) { const f = user.foe; if (!onField(f) || !hasStatus(f)) return fail(g, user); f.status = {}; f.frozen = 0; g.heal(user, user.maxHp / 2); },
  psychoShift(g, user) {
    const f = user.foe, name = Object.keys(user.status ?? {}).find(k => user.status[k] > 0 && k !== 'sleep');
    if (!onField(f) || !name || hasStatus(f)) return fail(g, user);
    if (g.applyStatus(f, name, { source: user })) user.status = {};
  },
  grudge(g, user) { user.grudge = 3; g.floatText(user, 'GRUDGE!', '#8a6ab8'); },
  skillSwap(g, user) {
    const f = user.foe;
    if (!onField(f) || bossy(f)) return fail(g, user);
    const a = user.abilityOverride ?? user.species.ability, b = f.abilityOverride ?? f.species.ability;
    [user.abilityOverride, f.abilityOverride] = [b, a];
    g.floatText(user, 'SKILLS SWAPPED!', '#c8a0ff');
    log(g, user, `${user.species.name} swapped Abilities with ${f.species.name}!`);
  },
  rolePlay(g, user) { const f = user.foe; if (!onField(f)) return fail(g, user); user.abilityOverride = f.abilityOverride ?? f.species.ability; g.floatText(user, `COPIED ${abilityOf(user).name?.toUpperCase() ?? 'ITS ABILITY'}`, '#c8a0ff'); },
  entrainment(g, user) { const f = user.foe; if (!onField(f) || bossy(f)) return fail(g, user); f.abilityOverride = user.abilityOverride ?? user.species.ability; g.floatText(f, 'ENTRAINED!', '#c8a0ff'); },
  worrySeed(g, user) { const f = user.foe; if (!onField(f) || bossy(f)) return fail(g, user); f.abilityOverride = 'insomnia'; if (f.status?.sleep > 0) f.status.sleep = 0; g.floatText(f, 'INSOMNIA!', '#7ac850'); },
  simpleBeam(g, user) { const f = user.foe; if (!onField(f) || bossy(f)) return fail(g, user); f.abilityOverride = 'simple'; g.floatText(f, 'SIMPLE!', '#c8a0ff'); },
  gastroAcid(g, user) { const f = user.foe; if (!onField(f) || bossy(f)) return fail(g, user); f.abilityOff = 999; g.floatText(f, 'ABILITY SUPPRESSED!', '#b060d0'); },
  magicPowder: (g, user) => setTypes(g, user.foe, ['psychic'], 'PSYCHIC TYPE!'),
  forestsCurse: (g, user) => user.foe && setTypes(g, user.foe, [...typesOf(user.foe).filter(t => t !== 'grass'), 'grass'], 'GRASS ADDED!'),
  trickOrTreat: (g, user) => user.foe && setTypes(g, user.foe, [...typesOf(user.foe).filter(t => t !== 'ghost'), 'ghost'], 'GHOST ADDED!'),
  reflectType(g, user) { const f = user.foe; if (!onField(f)) return fail(g, user); user.typeOverride = [...typesOf(f)]; g.floatText(user, 'COPIED ITS TYPE', '#c8a0ff'); },
  odorSleuth(g, user) { const f = user.foe; if (!onField(f)) return fail(g, user); f.identified = true; if ((f.stages.evasion ?? 0) > 0) f.stages.evasion = 0; g.floatText(f, 'IDENTIFIED!', '#ffd84a'); },
  corrosiveGas(g, user) { const f = user.foe; if (!onField(f) || !f.item || bossy(f)) return fail(g, user); log(g, f, `${f.species.name}'s ${ITEMS[f.item]?.name ?? 'item'} corroded away!`); f.item = null; g.floatText(f, 'ITEM CORRODED!', '#b060d0'); },
  stuffCheeks(g, user) {
    const it = ITEMS[user.item];
    if (!it?.eat) return fail(g, user, 'NO BERRY');
    it.eat(g, user);
    user.item = null;
    g.stage(user, { def: 2 });
  },
  octolock(g, user) { const f = user.foe; if (!onField(f) || f.octolocked) return fail(g, user); f.blocked = 9; f.octolocked = { t: 0, by: user }; g.floatText(f, 'OCTOLOCKED!', '#ffb070'); },
  metronome(g, user) {
    const pool = Object.keys(MOVES).filter(id => !MOVES[id].ultimate && !MOVES[id].copy && !NO_CALL.has(id) && MOVES[id].Action && !MOVES[id].twoTurn);
    return useOther(g, user, shuffle(pool), 'metronome', 'METRONOME');
  },
  mirrorMove(g, user) { return useOther(g, user, g.lastUsed[user.foe?.side], 'mirrorMove', 'MIRROR MOVE'); },
  assist(g, user) {
    const mates = g.teamOf(user).members.filter(m => m !== user && m.alive);
    return useOther(g, user, shuffle(mates.flatMap(m => m.moves).filter(id => MOVES[id] && !NO_CALL.has(id))), 'assist', 'ASSIST');
  },
  naturePower(g, user) {
    const id = { electric: 'thunderbolt', grassy: 'energyBall', misty: 'moonblastShot', psychic: 'psychic' }[g.terrain?.kind] ?? 'triAttack';
    return useOther(g, user, MOVES[id] ? id : 'triAttack', 'naturePower', 'NATURE POWER');
  },
  mimic: (g, user) => learnFromFoe(g, user, 'mimic', false),
  sketch: (g, user) => learnFromFoe(g, user, 'sketch', true),
  // Guard Split / Power Split average two stats with the foe; Power Trick swaps its own Attack and Defense; Speed Swap
  // trades Speed. Each works on a copy of its species' stats that goes back when it leaves the field.
  guardSplit: (g, user) => splitStats(g, user, user.foe, ['def', 'spdef'], 'shared its guard'),
  powerSplit: (g, user) => splitStats(g, user, user.foe, ['atk', 'spa'], 'shared its power'),
  powerTrick(g, user) { const s = ownStats(user); [s.atk, s.def] = [s.def, s.atk]; g.floatText(user, 'POWER TRICK!', '#c8a0ff'); log(g, user, `${user.species.name} switched its Attack and Defense!`); },
  speedSwap(g, user) {
    const f = user.foe;
    if (!onField(f) || bossy(f)) return fail(g, user);
    const a = ownStats(user), b = ownStats(f);
    [a.speed, b.speed] = [b.speed, a.speed];
    g.floatText(user, 'SPEED SWAPPED!', '#c8a0ff');
  },
  magicCoat(g, user) { user.magicCoat = 1.2; g.floatText(user, 'MAGIC COAT!', '#9fe8ff'); },
  bide(g, user) { user.bide = { t: 2.5, dmg: 0 }; g.floatText(user, 'BIDING ITS TIME', '#ffd84a'); log(g, user, `${user.species.name} is storing energy!`); },
  electrify(g, user) { const f = user.foe; if (!onField(f)) return fail(g, user); f.electrified = 4; g.floatText(f, 'ELECTRIFIED!', '#ffe066'); },
  camouflage(g, user) {
    const t = { electric: 'electric', grassy: 'grass', misty: 'fairy', psychic: 'psychic' }[g.terrain?.kind] ?? 'normal';
    user.typeOverride = [t];
    g.floatText(user, `${t.toUpperCase()} TYPE!`, TYPE_COLORS[t][0]);
  },
  conversion2(g, user) {
    const last = MOVES[g.lastUsed[user.foe?.side]];
    const options = last ? Object.keys(TYPE_COLORS).filter(t => typeMultiplier(last.type, [t]) < 1) : [];
    if (!options.length) return fail(g, user);
    const t = shuffle(options);
    user.typeOverride = [t];
    g.floatText(user, `${t.toUpperCase()} TYPE!`, TYPE_COLORS[t][0]);
  },
  waterSport(g, user) { if (g.waterSport > 0) return fail(g, user); g.waterSport = 15; log(g, user, "Fire's power was weakened!"); g.hud.showBanner('WATER SPORT', { color: '#86ccff', y: 300, life: 1.2, size: 15 }); },
  telekinesis(g, user) {
    const f = user.foe;
    if (!onField(f) || bossy(f) || g.gravity > 0 || f.telekinesis > 0) return fail(g, user);
    f.telekinesis = 9;
    g.floatText(f, 'HURLED INTO THE AIR!', '#c8a0ff');
    log(g, f, `${f.species.name} was hurled into the air! Every move hits it, but Ground moves can't.`);
  },
  fairyLock(g, user) {
    for (const mon of [g.player, g.opponent]) if (onField(mon)) mon.blocked = Math.max(mon.blocked ?? 0, 3.5);
    g.floatText(user, 'FAIRY LOCK!', '#ff9fd0');
    log(g, user, 'No one will be able to run away for a while!');
  },
  transform(g, user) {
    const f = user.foe;
    if (!onField(f) || user.transformed || f.transformed || bossy(f) || f.species.id === user.species.id) return fail(g, user);
    user.transformed = { species: user.species, set: user.sprite.set, portrait: user.portrait, moveset: user.moveset ?? null };
    user.species = { ...f.species, hp: user.species.hp, id: f.species.id };
    user.moveset = [...f.moves];
    user.stages = { ...f.stages };
    user.sprite.set = f.sprite.set;
    user.portrait = f.portrait;
    user.sprite.play(user.idleAnim(), { force: true });
    g.spawn(new Glow(user.x, user.y, user.bodyZ, 34, [255, 159, 224], 0.5));
    g.floatText(user, `TRANSFORMED INTO ${f.species.name.toUpperCase()}!`, '#ff9fd0', 8);
    log(g, user, `${user.species.name === f.species.name ? 'It' : user.species.name} transformed into ${f.species.name}!`);
    if (user === g.player) g.ui.setActive?.(user);
  },
};
// The same rules under other names.
Object.assign(EXTRA_STATUS, {
  supersonic: EXTRA_STATUS.confuseRay, sweetKiss: EXTRA_STATUS.confuseRay, teeterDance: EXTRA_STATUS.confuseRay,
  mindReader: EXTRA_STATUS.lockOn, foresight: EXTRA_STATUS.odorSleuth,
});

// A copy of its species' stats it can change for as long as it stays in (Pokémon.enter puts the real one back).
function ownStats(mon) {
  if (!mon.splitBase) { mon.splitBase = mon.species; mon.species = { ...mon.species }; }
  return mon.species;
}

function splitStats(g, user, foe, keys, what) {
  if (!onField(foe) || bossy(foe)) return fail(g, user);
  const a = ownStats(user), b = ownStats(foe);
  for (const k of keys) { const avg = (a[k] + b[k]) / 2; a[k] = b[k] = avg; }
  g.floatText(user, what.toUpperCase().replace('ITS ', '') + '!', '#c8a0ff');
  log(g, user, `${user.species.name} ${what} with ${foe.species.name}!`);
}

function swapStages(g, user, keys, what) {
  const f = user.foe;
  if (!onField(f)) return fail(g, user);
  for (const k of keys) [user.stages[k], f.stages[k]] = [f.stages[k] ?? 0, user.stages[k] ?? 0];
  g.floatText(user, 'SWAPPED!', '#c8a0ff');
  log(g, user, `${user.species.name} swapped ${what} with ${f.species.name}!`);
}

function setTypes(g, mon, types, text) {
  if (!onField(mon) || mon.tera || bossy(mon)) return fail(g, mon);
  mon.typeOverride = types;
  g.floatText(mon, text, '#c8a0ff');
}

// Mimic (until it switches out) and Sketch (for the rest of the battle): the move slot becomes the foe's last move.
function learnFromFoe(g, user, slot, keep) {
  const id = g.lastUsed[user.foe?.side];
  if (!id || !MOVES[id] || MOVES[id].ultimate || NO_CALL.has(id) || user.moves.includes(id)) return fail(g, user);
  if (!keep && !user.mimicSaved) user.mimicSaved = { list: user.moveset ?? null };
  user.moveset = user.moves.map(m => (m === slot ? id : m));
  g.floatText(user, `LEARNED ${MOVES[id].name.toUpperCase()}!`, '#ffd84a', 8);
  log(g, user, `${user.species.name} ${keep ? 'sketched' : 'learned'} ${MOVES[id].name}!`);
  if (user === g.player) g.ui.setActive?.(user);
}

// Every frame for the Pokémon on the field (effects-resolver.js tickVolatiles).
export function tickExtra(g, mon, dt) {
  if (mon.rampage && (mon.rampage.t -= dt) <= 0) {
    const r = mon.rampage;
    mon.rampage = null;
    if (r.tire) confuse(g, mon, null);
  }
  for (const k of ['confused', 'infatuated', 'tormented', 'imprison', 'endure', 'laserFocus', 'lockOn', 'grudge', 'magicRoomT', 'wonderRoomT', 'magicCoat', 'electrified', 'telekinesis', 'uproar']) {
    if (!(mon[k] > 0)) continue;
    mon[k] = Math.max(0, mon[k] - dt);
    if (mon[k] === 0 && ['confused', 'infatuated', 'tormented'].includes(k)) log(g, mon, `${mon.species.name} ${k === 'confused' ? 'snapped out of its confusion' : k === 'infatuated' ? 'got over its infatuation' : 'is no longer tormented'}!`);
  }
  if (mon.disabled && (mon.disabled.t -= dt) <= 0) { log(g, mon, `${mon.species.name}'s ${MOVES[mon.disabled.id]?.name ?? 'move'} is no longer disabled!`); mon.disabled = null; }
  if (mon.confused > 0 && !g.headless && Math.random() < dt * 5) g.particles.spawn({ x: mon.x + Math.cos(g.time * 6) * 10, y: mon.y, z: mon.headZ + 8, life: 0.4, size: 2, sizeEnd: 1, colors: ['#ffffff', '#e0a0ff'] });
  // Perish Song: a count each turn, then it faints.
  if (mon.perish > 0) {
    const before = Math.ceil(mon.perish / 3);
    mon.perish -= dt;
    const after = Math.ceil(Math.max(0, mon.perish) / 3);
    if (after !== before && after > 0) g.floatText(mon, `PERISH ${after}`, '#d8c8ff');
    if (mon.perish <= 0) { mon.perish = 0; log(g, mon, `${mon.species.name}'s perish count fell to 0!`); g.dotDamage(mon, 1, '#d8c8ff'); }
  }
  // Bide: after storing for a while, the damage it took goes back at twice the amount.
  if (mon.bide && (mon.bide.t -= dt) <= 0) {
    const b = mon.bide, foe = mon.foe;
    mon.bide = null;
    if (!b.dmg || !onField(foe) || !mon.alive) { fail(g, mon); return; }
    g.floatText(mon, 'BIDE UNLEASHED!', '#ffd84a');
    g.spawn(new Ring(mon.x, mon.y, { z: mon.bodyZ, r0: 6, r1: 40, life: 0.4, color: '#ffd84a', width: 3, layer: 'air' }));
    const a = Math.atan2(foe.y - mon.y, foe.x - mon.x);
    applyHit(g, mon, foe, { ...MOVES.bide, cat: 'physical', util: null, fixedDmg: Math.round(b.dmg * 2), acc: 100, sure: true }, { knockback: 220, stagger: 0.4, dirX: Math.cos(a), dirY: Math.sin(a), unblockable: false });
  }
  // Ingrain: a little HP back every turn.
  if (mon.ingrained && (mon.ingrainT = (mon.ingrainT ?? 0) + dt) >= 3) { mon.ingrainT = 0; g.heal(mon, mon.maxHp / 16); }
  // Octolock: Defense and Sp. Def drop every turn.
  if (mon.octolocked && (mon.octolocked.t += dt) >= 3) { mon.octolocked.t = 0; g.stage(mon, { def: -1, spd: -1 }, mon.octolocked.by); }
}

// When it faints (game.js onFaint): Grudge empties the move that knocked it out.
export function onFaintExtra(g, mon, by, move) {
  if (mon.grudge > 0 && by && move && !move.ultimate && by.alive) {
    by.cooldowns[move.id] = 9999;
    g.floatText(by, `${move.name.toUpperCase()} LOST ITS PP!`, '#8a6ab8');
    log(g, by, `${by.species.name}'s ${move.name} lost all its PP due to the grudge!`);
  }
}
