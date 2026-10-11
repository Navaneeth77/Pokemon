import { MOVES } from './moves.js';
import { BOUNDS } from './arena.js';
import { typeMultiplier } from './data/types.js';

// Difficulty only changes behaviour (reaction speed, dodging, charging, combos) — never damage or HP.
const LEVELS = {
  easy: { gap: [1.7, 2.7], dodge: 0.08, charge: 0, ultWait: 4, typeAware: false, chain: false, mega: 0.45, guard: 0.3 },
  medium: { gap: [0.9, 1.8], dodge: 0.3, charge: 0.35, ultWait: 0.8, typeAware: true, chain: false, mega: 0.7, guard: 0.6 },
  hard: { gap: [0.45, 0.95], dodge: 0.55, charge: 0.45, ultWait: 0, typeAware: true, chain: true, mega: 0.9, guard: 0.9 },
};

// Drives whichever opponent Pokémon is currently active.
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
    const cfg = (this.cfg = LEVELS[game.difficulty] ?? LEVELS.medium);
    me.input.x = me.input.y = 0;
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
    if (me.species.mega?.length && !team.megaUsed && me.hp < me.maxHp * cfg.mega && me.canAct() && Math.random() < dt * 0.8) game.megaEvolve(me);
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
      const close = me.species.moves.some(id => ['melee', 'dash', 'area'].includes(MOVES[id].ai) && me.cooldown(id) <= 0);
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

    const want = this.plan === 'melee' ? me.radius + foe.radius + 14 : 140;
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

  // When status moves are worth it: heal when hurt, guard against an incoming attack, buff at range…
  selfWeight(me, foe, mv, dist, game) {
    if (mv.copy) return game.lastUsed[foe.side] && MOVES[game.lastUsed[foe.side]].cat !== 'status' ? 1.3 : 0;
    const u = mv.util;
    if (u.kind === 'heal') return me.hp < me.maxHp * 0.5 ? 2.5 : 0;
    if (u.kind === 'regen') return !me.regen && me.hp < me.maxHp * 0.8 ? 1.2 : 0;
    if (u.kind === 'buff') return !(me.buffs[u.stat]?.t > 0) && dist > 110 ? 1.2 : 0;
    if (u.kind === 'guard') return foe.action && dist < 160 && Math.random() < (this.cfg?.guard ?? 0.6) ? 4 : 0;
    return 0;
  }

  // Weighted pick among ready moves that suit the current distance, favouring good type matchups.
  pickMove(me, foe, dist, game) {
    const options = [];
    for (const id of me.species.moves) {
      const mv = MOVES[id];
      if (me.cooldown(id) > 0) continue;
      let w = 0;
      if (mv.ai === 'self') {
        w = this.selfWeight(me, foe, mv, dist, game);
        if (w) options.push([id, w]);
        continue;
      }
      if (mv.ai === 'melee' && dist <= me.radius + foe.radius + mv.reach + 6) w = 3;
      else if (mv.ai === 'area' && dist <= mv.range) w = 2.5;
      else if (mv.ai === 'dash' && dist >= mv.minRange && dist <= mv.range) w = 1.6;
      else if (mv.ai === 'ranged' && dist >= (mv.minRange ?? 0) && dist <= mv.range) w = mv.aiWeight ?? 1;
      if (!w) continue;
      const eff = this.cfg?.typeAware === false ? 1 : typeMultiplier(mv.type, foe.species.types);
      options.push([id, w * (eff > 1 ? 2 : eff < 1 ? 0.5 : 1)]);
    }
    const total = options.reduce((s, [, w]) => s + w, 0);
    if (!total) return null;
    let r = Math.random() * total;
    for (const [id, w] of options) if ((r -= w) <= 0) return id;
    return options[options.length - 1][0];
  }
}
