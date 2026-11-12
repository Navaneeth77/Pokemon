import { MOVES } from './moves.js';
import { BOUNDS } from './arena.js';
import { typeMultiplier } from './data/types.js';
import { soften } from './combat.js';
import { roleOf, fitsRole } from './roles.js';

// Difficulty only changes behaviour (reaction speed, dodging, charging, combos, switching) — never damage or HP.
const LEVELS = {
  easy: { gap: [1.7, 2.7], dodge: 0.08, charge: 0, ultWait: 4, typeAware: false, chain: false, mega: 0.45, guard: 0.3, switch: 0 },
  medium: { gap: [0.9, 1.8], dodge: 0.3, charge: 0.35, ultWait: 0.8, typeAware: true, chain: false, mega: 0.7, guard: 0.6, switch: 0.25 },
  hard: { gap: [0.45, 0.95], dodge: 0.55, charge: 0.45, ultWait: 0, typeAware: true, chain: true, mega: 0.9, guard: 0.9, switch: 0.5 },
};

// Drives whichever opponent Pokémon is currently active.
// When the competitive pools' status moves are worth using (see effects-resolver.js statusMove).
const statused = m => Object.values(m.status ?? {}).some(v => v > 0) || m.frozen > 0;
const boosted = m => Object.values(m.stages ?? {}).reduce((n, v) => n + Math.max(0, v), 0);
const benchOk = (game, m) => game.teamOf(m).nextAlive() >= 0;
const sideUp = (game, m, k) => game.sides?.[m.side]?.[k] > 0;
const screen = k => (me, foe, dist, game) => (!sideUp(game, me, k) && dist > 90 ? 1.6 : 0);
const pivot = (me, foe, dist, game) => (benchOk(game, me) && me.hp < me.maxHp * 0.5 ? 1.2 : 0);
const POOL_AI = {
  encore: (me, foe, dist, game) => (game.lastUsed[foe.side] && MOVES[game.lastUsed[foe.side]]?.cat === 'status' && !foe.encore ? 2.2 : 0),
  trick: (me, foe) => (me.item && ['choiceScarf', 'choiceSpecs', 'choiceBand', 'flameOrb', 'toxicOrb', 'laggingTail', 'ironBall'].includes(me.item) && foe.item !== me.item ? 1.6 : 0),
  roar: (me, foe, dist, game) => (boosted(foe) >= 2 && benchOk(game, foe) ? 2.5 : 0),
  sleepTalk: me => (me.status.sleep > 0 ? 5 : 0),
  curse: (me, foe) => ((me.stages.atk ?? 0) < 2 && dist(me, foe) > 100 ? 1.3 : 0),
  painSplit: (me, foe) => (me.hp < foe.hp * 0.7 ? 2 : 0),
  yawn: (me, foe) => (!statused(foe) && !(foe.yawn > 0) ? 1.4 : 0),
  teleport: pivot,
  partingShot: (me, foe, d, game) => (benchOk(game, me) ? 1.3 : 0),
  shedTail: (me, foe, d, game) => (benchOk(game, me) && me.hp > me.maxHp * 0.6 ? 1.3 : 0),
  chillyReception: (me, foe, d, game) => (game.weather !== 'snow' ? 1.2 : 0),
  healingWish: (me, foe, d, game) => (me.hp < me.maxHp * 0.25 && game.teamOf(me).members.some(m => m !== me && m.alive && m.hp < m.maxHp * 0.6) ? 2.5 : 0),
  destinyBond: (me, foe, d) => (me.hp < me.maxHp * 0.25 && foe.action && d < 200 ? 3 : 0),
  reflect: screen('reflect'), lightScreen: screen('lightScreen'), tailwind: screen('tailwind'),
  auroraVeil: (me, foe, d, game) => ((game.weather === 'snow' || game.weather === 'hail') && !sideUp(game, me, 'auroraVeil') ? 2 : 0),
  trickRoom: (me, foe, d, game) => (!(game.trickRoom > 0) && me.species.speed < foe.species.speed ? 1.8 : 0),
  counter: (me, foe, d) => (foe.action && foe.action.move.cat === 'physical' && d < 180 && Math.random() < 0.5 ? 3 : 0),
  mirrorCoat: (me, foe, d) => (foe.action && foe.action.move.cat === 'special' && Math.random() < 0.5 ? 3 : 0),
  metalBurst: (me, foe, d) => (foe.action && d < 220 && Math.random() < 0.4 ? 2.5 : 0),
  focusEnergy: me => (!me.focusEnergy ? 1 : 0),
  conversion: () => 0.3,
  soak: (me, foe) => (!(foe.typeOverride?.[0] === 'water') ? 0.9 : 0),
  block: (me, foe, d, game) => (!(foe.blocked > 0) && benchOk(game, foe) ? 0.8 : 0),
  clangorousSoul: (me, foe, d) => (me.hp > me.maxHp * 0.6 && d > 110 && boosted(me) < 3 ? 1.6 : 0),
  filletAway: (me, foe, d) => (me.hp > me.maxHp * 0.7 && d > 110 && boosted(me) < 3 ? 1.6 : 0),
  courtChange: (me, foe, d, game) => (Object.values(game.hazards?.[me.side] ?? {}).some(Boolean) ? 1.8 : 0),
  revivalBlessing: (me, foe, d, game) => (game.teamOf(me).members.some(m => m !== me && (m.fainted || !m.alive)) ? 3 : 0),
  recycle: me => (!me.item && me.usedItem ? 1.2 : 0),
  magnetRise: (me, foe) => (!(me.magnetRise > 0) && foe.species.types.includes('ground') ? 1.6 : 0),
  futureSightAtk: (me, foe, d, game) => (!game.pending?.[foe.side]?.future ? 1.5 : 0),
  // The learnset moves with rules of their own (effects-extra.js): only when they help, so it never wastes its turn
  // on a move that fails or knocks itself out for nothing.
  endure: me => (me.hp < me.maxHp * 0.3 ? 1.2 : 0),
  confuseRay: (me, foe) => (!(foe.confused > 0) ? 1.3 : 0),
  attract: (me, foe) => (!(foe.infatuated > 0) ? 1.3 : 0),
  disable: (me, foe, d, game) => (game.lastUsed[foe.side] && !foe.disabled ? 1.4 : 0),
  torment: (me, foe) => (!(foe.tormented > 0) ? 0.9 : 0),
  imprison: me => (!(me.imprison > 0) ? 0.8 : 0),
  spite: (me, foe, d, game) => (game.lastUsed[foe.side] ? 0.8 : 0),
  psychUp: (me, foe) => (boosted(foe) >= 2 ? 2 : 0),
  heartSwap: (me, foe) => (boosted(foe) >= 2 ? 1.8 : 0),
  topsyTurvy: (me, foe) => (boosted(foe) >= 2 ? 1.8 : 0),
  acupressure: (me, foe, d) => (d > 110 && boosted(me) < 4 ? 1.1 : 0),
  charge: (me, foe, d) => (!me.charged && d > 100 ? 1.1 : 0),
  laserFocus: me => (!(me.laserFocus > 0) ? 1 : 0),
  lockOn: me => (!(me.lockOn > 0) ? 0.9 : 0),
  stockpile: (me, foe, d) => ((me.stockpile ?? 0) < 3 && d > 100 ? 1.2 : 0),
  swallow: me => (me.stockpile > 0 && me.hp < me.maxHp * 0.6 ? 2 : 0),
  safeguard: screen('safeguard'), mist: screen('mist'), luckyChant: screen('luckyChant'),
  gravity: (me, foe, d, game) => (!(game.gravity > 0) ? 0.6 : 0),
  batonPass: (me, foe, d, game) => (boosted(me) >= 2 && benchOk(game, me) ? 1.6 : 0),
  memento: (me, foe, d, game) => (me.hp < me.maxHp * 0.2 && benchOk(game, me) ? 1.5 : 0),
  perishSong: (me, foe, d, game) => (boosted(foe) >= 2 && benchOk(game, me) ? 1.2 : 0),
  ingrain: me => (!me.ingrained && me.hp < me.maxHp * 0.7 ? 1.1 : 0),
  refresh: me => (statused(me) ? 1.6 : 0),
  lunarBlessing: me => (statused(me) || me.hp < me.maxHp * 0.6 ? 1.6 : 0),
  purify: (me, foe) => (statused(foe) && me.hp < me.maxHp * 0.7 ? 1.6 : 0),
  psychoShift: (me, foe) => (statused(me) && !statused(foe) ? 1.8 : 0),
  grudge: me => (me.hp < me.maxHp * 0.2 ? 1 : 0),
  transform: me => (!me.transformed ? 3 : 0),
  mimic: (me, foe, d, game) => (game.lastUsed[foe.side] ? 1 : 0),
  sketch: (me, foe, d, game) => (game.lastUsed[foe.side] ? 1 : 0),
  mirrorMove: (me, foe, d, game) => (game.lastUsed[foe.side] ? 1 : 0),
  metronome: () => 1.2,
  magicCoat: (me, foe, d, game) => (MOVES[game.lastUsed[foe.side]]?.cat === 'status' ? 1 : 0),
  bide: (me, foe, d) => (d < 120 && me.hp > me.maxHp * 0.5 ? 0.7 : 0),
  waterSport: (me, foe, d, game) => (!(game.waterSport > 0) && foe.species.types.includes('fire') ? 1.4 : 0),
  telekinesis: (me, foe) => (!(foe.telekinesis > 0) ? 0.7 : 0),
  fairyLock: (me, foe) => (!(foe.blocked > 0) ? 0.6 : 0),
  speedSwap: (me, foe) => (foe.species.speed > me.species.speed * 1.2 ? 1.5 : 0),
  powerSplit: (me, foe) => (Math.max(foe.species.atk, foe.species.spa ?? 0) > Math.max(me.species.atk, me.species.spa ?? 0) * 1.2 ? 1.3 : 0),
  guardSplit: (me, foe) => ((foe.species.def + (foe.species.spdef ?? 0)) > (me.species.def + (me.species.spdef ?? 0)) * 1.2 ? 1.3 : 0),
  powerTrick: me => (!me.splitBase && me.species.def > me.species.atk * 1.2 ? 1.3 : 0),
  electrify: (me, foe) => (me.species.types.includes('ground') ? 1.2 : 0.4),
  camouflage: () => 0.4, conversion2: (me, foe, d, game) => (game.lastUsed[foe.side] ? 0.8 : 0),
  ...Object.fromEntries(['supersonic', 'sweetKiss', 'teeterDance', 'swagger', 'flatter'].map(id => [id, (me, foe) => (!(foe.confused > 0) ? 1.1 : 0)])),
  ...Object.fromEntries(['skillSwap', 'rolePlay', 'entrainment', 'worrySeed', 'simpleBeam', 'gastroAcid', 'magicPowder', 'forestsCurse', 'trickOrTreat',
    'reflectType', 'odorSleuth', 'foresight', 'corrosiveGas', 'octolock', 'venomDrench', 'spicyExtract', 'powerSwap', 'guardSwap', 'mindReader',
    'meanLook', 'magicRoom', 'wonderRoom', 'assist', 'naturePower', 'defenseCurl', 'minimize', 'stuffCheeks'].map(id => [id, (me, foe, d) => (d > 100 && Math.random() < 0.3 ? 0.8 : 0)])),
  doomDesire: (me, foe, d, game) => (!game.pending?.[foe.side]?.future ? 1.5 : 0),
  splash: () => 0.05, celebrate: () => 0.05, happyHour: () => 0.05, holdHands: () => 0.05,
};
POOL_AI.switcheroo = POOL_AI.trick;
POOL_AI.whirlwind = POOL_AI.roar;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class OpponentAI {
  constructor() {
    this.reset();
  }

  // Called when a new opponent Pokémon comes out, so it gets a moment before attacking.
  reset() {
    this.gap = 1.1;
    this.plan = 'range';
    this.planT = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 1.5;
    this.dodgeIn = 0;
    this.chargeFor = 0;
  }

  // Called when the player starts an attack: sometimes sidestep it a moment later.
  onThreat() {
    if (Math.random() < (this.cfg?.dodge ?? 0.3)) this.dodgeIn = 0.1 + Math.random() * 0.2;
  }

  update(dt, game) {
    const me = game.opponent, foe = game.player;
    // Story Mode passes its own settings (each trainer sharper than the last); otherwise a difficulty preset.
    const cfg = (this.cfg = game.aiConfig ?? LEVELS[game.difficulty] ?? LEVELS.medium);
    me.input.x = me.input.y = 0;
    if (game.practice) return; // the tutorial's practice target never moves or attacks
    if (game.state !== 'fighting' || me.hidden || !me.alive || !foe.alive || foe.hidden) return;

    this.gap -= dt;
    this.planT -= dt;
    this.strafeT -= dt;
    const dx = foe.x - me.x, dy = foe.y - me.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    // Holding a charged move: release after the planned time.
    if (me.charging) {
      if ((this.chargeFor -= dt) <= 0) game.releaseCharge(me);
      return;
    }
    // Mega Evolve once things get serious.
    const team = game.opponentTeam;
    if (me.species.mega?.length && game.foeCanMega !== false && !team.megaUsed && me.hp < me.maxHp * cfg.mega && me.canAct() && Math.random() < dt * 0.8) game.megaEvolve(me);
    // Smarter trainers pull a Pokémon that is badly matched against yours for one that resists it.
    if (cfg.switch > 0 && (this.switchT = (this.switchT ?? 5) - dt) <= 0) {
      this.switchT = 3;
      const k = me.canAct() && !game.cinematic && !game.ultActive() ? this.pickSwitch(me, foe, team) : -1;
      // Same rules and cooldown as a player's switch; it only sees what is on the field (types, HP).
      if (k >= 0 && Math.random() < cfg.switch && game.switchFoe(k)) {
        this.switchT = 14;
        return;
      }
    }
    // A full meter is spent as soon as there is an opening.
    if (me.ult >= 100) this.ultT = (this.ultT ?? 0) + dt;
    if (me.ult >= 100 && this.ultT >= cfg.ultWait && me.canAct() && this.gap <= 0.3 && game.useMove(me, me.species.ultimate)) {
      this.ultT = 0;
      this.gap = 1.2;
      return;
    }
    if (this.dodgeIn > 0 && (this.dodgeIn -= dt) <= 0) {
      const side = Math.random() < 0.5 ? 1 : -1;
      game.dodge(me, -uy * side, ux * side);
    }

    if (this.planT <= 0) {
      const close = me.moves.some(id => ['melee', 'dash', 'area'].includes(MOVES[id].ai) && me.cooldown(id) <= 0);
      this.plan = close && Math.random() < 0.55 ? 'melee' : 'range';
      this.planT = 2 + Math.random() * 2.5;
    }
    if (this.strafeT <= 0) {
      this.strafe *= -1;
      this.strafeT = 1.2 + Math.random() * 1.8;
    }

    // Hard bots cancel recovery into a follow-up the moment a hit lands (combo chains).
    if (cfg.chain && me.chainT > 0 && !me.canAct()) {
      const id = this.pickMove(me, foe, dist, game);
      if (id && game.useMove(me, id)) return;
    }
    if (me.canAct() && this.gap <= 0) {
      const id = this.pickMove(me, foe, dist, game);
      // Sometimes charge a chargeable move at range instead of firing it straight away.
      if (id && MOVES[id].chargeable && dist > 150 && Math.random() < cfg.charge && game.beginCharge(me, id)) {
        this.chargeFor = 0.4 + Math.random() * 0.8;
        this.gap = 1.2;
        return;
      }
      if (id && game.useMove(me, id)) {
        this.gap = cfg.gap[0] + Math.random() * (cfg.gap[1] - cfg.gap[0]);
        if (MOVES[id].ai !== 'ranged') {
          this.plan = 'range';
          this.planT = 1.5;
        }
        return;
      }
    }

    // Its role sets the distance it keeps: physical attackers press in, special attackers hang back, supports in between.
    const role = roleOf(me.species);
    const want = this.plan === 'melee' ? me.radius + foe.radius + 14 : role === 'special' ? 175 : role === 'support' ? 155 : 115;
    let mx = 0, my = 0;
    if (dist > want + 12) { mx += ux; my += uy; }
    else if (dist < want - 12) { mx -= ux; my -= uy; }
    const strafe = this.plan === 'melee' && dist < 90 ? 0.25 : 0.75;
    mx += -uy * this.strafe * strafe;
    my += ux * this.strafe * strafe;

    const m = 40;
    if (me.x < BOUNDS.minX + m) mx += 0.8;
    if (me.x > BOUNDS.maxX - m) mx -= 0.8;
    if (me.y < BOUNDS.minY + m) my += 0.8;
    if (me.y > BOUNDS.maxY - m) my -= 0.8;
    if ((me.x <= BOUNDS.minX + 2 || me.x >= BOUNDS.maxX - 2) && this.strafeT > 0.4) this.strafeT = 0;

    const len = Math.hypot(mx, my);
    if (len > 0.05) {
      me.input.x = mx / len;
      me.input.y = my / len;
    }
  }

  // A healthy benched Pokémon that resists the foe's types, when the active one is weak to them.
  pickSwitch(me, foe, team) {
    const threat = mon => Math.max(...foe.species.types.map(t => soften(typeMultiplier(t, mon.species.types))));
    if (me.hp < me.maxHp * 0.3 || threat(me) <= 1) return -1;
    let best = -1, bestScore = 0;
    team.members.forEach((m, i) => {
      if (m === me || !m.alive || m.fainted || m.hp < m.maxHp * 0.4) return;
      const score = (threat(m) < 1 ? 2 : threat(m) === 1 ? 1 : 0) + Math.max(...m.species.types.map(t => typeMultiplier(t, foe.species.types))) / 4;
      if (score > bestScore && threat(m) < threat(me)) { best = i; bestScore = score; }
    });
    return bestScore >= 1 ? best : -1;
  }

  // When status moves are worth it: heal when hurt, guard against an incoming attack, buff at range…
  selfWeight(me, foe, mv, dist, game) {
    if (mv.copy) return game.lastUsed[foe.side] && MOVES[game.lastUsed[foe.side]].cat !== 'status' ? 1.3 : 0;
    const u = mv.util;
    if (u.kind === 'heal') return me.hp < me.maxHp * 0.5 ? 2.5 : 0;
    if (u.kind === 'regen') return !me.regen && me.hp < me.maxHp * 0.8 ? 1.2 : 0;
    if (u.kind === 'buff') return !(me.buffs[u.stat]?.t > 0) && dist > 110 ? 1.2 : 0;
    if (u.kind === 'guard') return foe.action && dist < 160 && Math.random() < (this.cfg?.guard ?? 0.6) ? 4 : 0;
    // Setup while at a safe distance and not already boosted; status moves on a foe that has none.
    if (u.kind === 'stages') return dist > 100 && Object.keys(u.self).some(k => u.self[k] > 0 && (me.stages[k] ?? 0) < 2) ? 1.5 : 0;
    if (u.kind === 'special') return (POOL_AI[mv.id] ?? (() => (dist > 100 && Math.random() < 0.5 ? 1.1 : 0)))(me, foe, dist, game);
    if (u.kind === 'ray') return dist < 280 && (u.seed ? !foe.seeded : !Object.values(foe.status).some(v => v > 0)) ? 1.6 : 0;
    // Field moves: set weather or terrain when it isn't already up; lay hazards while the foe has others to send in.
    if (u.kind === 'weather') return game.weather !== u.weather && dist > 90 ? 1.4 : 0;
    if (u.kind === 'terrain') return game.terrain?.kind !== u.terrain && dist > 90 ? 1.4 : 0;
    if (u.kind === 'hazard') return !(game.hazards?.[foe.side]?.[u.hazard] >= 1) && game.teamOf(foe).members.filter(m => m.alive).length > 1 && dist > 90 ? 1.5 : 0;
    return 0;
  }

  // Weighted pick among ready moves that suit the current distance, favouring good type matchups.
  pickMove(me, foe, dist, game) {
    const options = [];
    for (const id of me.moves) {
      const mv = MOVES[id];
      if (me.cooldown(id) > 0) continue;
      if (me.encore?.t > 0 && id !== me.encore.id) continue;
      if (me.taunted > 0 && mv.cat === 'status') continue;
      let w = 0;
      if (mv.ai === 'self') {
        w = this.selfWeight(me, foe, mv, dist, game) * (fitsRole(me.species, mv) ? 1.3 : 1);
        if (w) options.push([id, w]);
        continue;
      }
      if (mv.ai === 'melee' && dist <= me.radius + foe.radius + mv.reach + 6) w = 3;
      else if (mv.ai === 'area' && dist <= mv.range) w = 2.5;
      else if (mv.ai === 'dash' && dist >= mv.minRange && dist <= mv.range) w = 1.6;
      else if (mv.ai === 'ranged' && dist >= (mv.minRange ?? 0) && dist <= mv.range) w = mv.aiWeight ?? 1;
      if (!w) continue;
      // typeAware 0–1: how strongly it favours super-effective moves and avoids resisted ones.
      const aware = this.cfg?.typeAware === true ? 1 : +(this.cfg?.typeAware ?? 1);
      const eff = typeMultiplier(mv.type, foe.species.types);
      if (eff === 0) continue; // never a move the foe is immune to
      options.push([id, w * (eff > 1 ? 1 + aware : eff < 1 ? 1 - 0.5 * aware : 1) * (fitsRole(me.species, mv) ? 1.3 : 1)]); // prefers moves that suit its role
    }
    const total = options.reduce((s, [, w]) => s + w, 0);
    if (!total) return null;
    let r = Math.random() * total;
    for (const [id, w] of options) if ((r -= w) <= 0) return id;
    return options[options.length - 1][0];
  }
}
