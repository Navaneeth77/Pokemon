import { typeMultiplier } from './data/types.js';
import { abilityOf, isContact, typesOf } from './data/abilities.js';
import { DamageNumber, FloatText, sparkBurst, rand } from './effects.js';
import { applyStatus, TYPE_STATUS, buffMult, wakeOnHit } from './status.js';
import { sfx } from './audio.js';

// Real-time battles are short, so type matchups are softened (2× → 1.5×, ½× → 0.7×) and
// immunities become resistances so every move stays usable.
export function soften(m) {
  if (m === 0) return 0.5;
  if (m > 1) return m >= 4 ? 2 : 1.5;
  if (m < 1) return m <= 0.25 ? 0.5 : 0.7;
  return 1;
}

// Combo roles from a move's own properties: quick openers chain into launchers, launchers into finishers.
export const comboRole = m => (m.ultimate ? 3 : m.cooldown <= 1.6 ? 0 : m.cooldown <= 2.5 ? 1 : 2);
export const COMBO_WINDOW = 1.5;
const ROLE_NAME = ['OPENER', 'LAUNCHER', 'FINISHER'];

const ULT_DEAL = 0.075, ULT_TAKE = 0.05, ULT_DEAL_CAP = 12, ULT_TAKE_CAP = 8;

function moveType(attacker, move, A) {
  if (A.convert && move.type === A.convert.from) return [A.convert.to, A.convert.mult];
  return [move.type, 1];
}

function weatherMult(game, type) {
  if (game.weather === 'rain') return type === 'water' ? 1.3 : type === 'fire' ? 0.7 : 1;
  if (game.weather === 'sun') return type === 'fire' ? 1.3 : type === 'water' ? 0.7 : 1;
  return 1;
}

// Applies one hit of `move` and all of its feedback. `o.stack` groups the ticks of a multi-hit move
// so they share one damage popup, one status roll, one combo-chain check and capped ultimate charge.
export function applyHit(game, attacker, target, move, o = {}) {
  if (game.state !== 'fighting' || !target.alive || target.hidden || (target.invuln && !o.unblockable)) return false;
  const stack = o.stack ?? {};
  const A = abilityOf(attacker), D = abilityOf(target), Dfull = D;
  const head = target.y - target.headZ;
  if (target.dodgeInv > 0 && !o.unblockable) {
    if (!stack.dodged) {
      stack.dodged = true;
      game.spawn(new FloatText(target.x, head - 10, 'DODGED!', '#bff3ff'));
      target.gainUlt(game, 3);
      Dfull.onDodged?.(game, target, attacker);
    }
    return false;
  }

  const [type, convertMult] = moveType(attacker, move, A);
  const defTypes = typesOf(target);
  const winds = game.deltaStream && defTypes.includes('flying');
  const raw = typeMultiplier(type, defTypes, winds);
  const calmed = winds && raw < typeMultiplier(type, defTypes);
  let eff = soften(raw);
  if (A.pierce === type && eff < 1) eff = 1;
  // Ultimates already reach everywhere and can't be dodged, so their type advantage is capped.
  if (move.ultimate) eff = Math.min(eff, 1.5);
  const contact = isContact(move);
  const info = { type, eff, contact };

  const stab = typesOf(attacker).includes(type) ? (A.stab ?? 1.2) : 1;
  const crit = !D.noCrit && Math.random() < (o.critChance ?? 0.06) + (A.crit?.(move) ?? 0);
  const power = o.power ?? move.power;
  // Foul Play turns the target's own attack against it.
  const atkSrc = move.foul ? target : attacker;
  const stats = ((atkSrc.species.atk ?? 1) * buffMult(atkSrc, 'atk') * (atkSrc.buffT > 0 ? 1.3 : 1))
    / ((target.species.def ?? 1) * buffMult(target, 'def'));
  const auraMult = [attacker, target].reduce((m, mon) => {
    const au = abilityOf(mon).aura;
    return m * (au && au.type === type && !mon.hidden && mon.alive ? au.mult : 1);
  }, 1) || 1;

  // Combos: hits within the window chain; each step up the opener → launcher → finisher ladder
  // earns a bonus, while long strings scale damage down so nothing loops forever.
  const role = comboRole(move);
  const c = attacker.combo;
  let comboMult = 1;
  if (!move.ultimate) {
    if (c.t <= 0 || c.foe !== target) Object.assign(c, { n: 0, uses: 0, chain: 0, lastRole: -1, foe: target });
    c.n++;
    c.t = COMBO_WINDOW;
    if (!stack.comboChecked) {
      stack.comboChecked = true;
      stack.chainBonus = 1;
      c.uses++;
      if (c.lastRole >= 0 && role > c.lastRole) {
        c.chain++;
        const finish = role === 2 && c.chain >= 2;
        stack.chainBonus = finish ? 1.2 : 1.1;
        game.comboPop(attacker, finish ? 'COMBO FINISH!' : `${ROLE_NAME[c.lastRole]} → ${ROLE_NAME[role]}`, finish);
        if (finish) attacker.gainUlt(game, 6);
      }
      c.lastRole = role;
    }
    comboMult = (c.uses <= 3 ? 1 : Math.max(0.55, 0.88 ** (c.uses - 3))) * stack.chainBonus;
    attacker.chainT = 0.45;
    attacker.chainRole = role;
  }

  let dmg = power * stats * eff * stab * convertMult * auraMult * weatherMult(game, type) * comboMult * (crit ? 1.5 : 1) * rand(0.92, 1.04);
  dmg *= (A.dealMult?.(game, attacker, target, move, info) ?? 1);
  if (move.hex && (target.frozen > 0 || Object.values(target.status).some(v => v > 0))) dmg *= 1.6;

  if (!o.unblockable && D.evade?.(game, target, attacker, move, dmg)) {
    game.spawn(new FloatText(target.x, head - 10, 'EVADED!', '#d8c8ff'));
    return false;
  }
  info.dmg = dmg;
  if (D.absorb?.(game, target, attacker, move, info)) {
    game.spawn(new FloatText(target.x, head - 10, 'ABSORBED!', '#9fffc8'));
    return false;
  }
  dmg *= (D.takeMult?.(game, target, attacker, move, info) ?? 1);
  dmg = Math.max(1, Math.round(dmg));
  if (target.shield > 0) {
    const soak = Math.min(target.shield, dmg);
    target.shield -= soak;
    dmg = Math.max(1, dmg - soak);
    if (target.shield <= 0) game.spawn(new FloatText(target.x, head - 18, 'SHIELD BROKE!', '#ff9fd0', 7));
  }

  const flinch = !!(o.flinchChance && !D.noFlinch && target.action && Math.random() < o.flinchChance * (A.serene ? 2 : 1));
  // Anti-stunlock: after five hits in a row the target briefly can't be staggered and can break free.
  if (!stack.hitCounted) {
    stack.hitCounted = true;
    target.comboHits = (target.comboTimer > 0 ? target.comboHits : 0) + 1;
  }
  target.comboTimer = COMBO_WINDOW;
  if (target.comboHits >= 5 && target.escapeT <= 0 && !move.ultimate) {
    target.escapeT = 1;
    target.comboHits = 0;
    game.spawn(new FloatText(target.x, head - 20, 'BREAK FREE!', '#9fffc8', 8));
  }
  target.combo.t = 0;
  const stagger = target.escapeT > 0 ? 0 : (o.stagger ?? 0.22) * (c.uses > 3 ? 0.6 : 1) * (Dfull.staggerMult ?? 1);

  target.takeHit(dmg, {
    dirX: o.dirX ?? 0, dirY: o.dirY ?? 0, knockback: (o.knockback ?? 100) * (Dfull.kbMult ?? 1), stagger, flinch,
  }, game);
  wakeOnHit(target);

  // Ultimate charge: from damage dealt and taken (never from ultimates), capped per move use.
  if (!move.ultimate) {
    const foeMult = abilityOf(target).foeUltMult ?? 1, selfMult = A.foeUltMult ?? 1;
    const gA = Math.min(ULT_DEAL_CAP - (stack.ultA ?? 0), dmg * ULT_DEAL * foeMult);
    const gT = Math.min(ULT_TAKE_CAP - (stack.ultT ?? 0), dmg * ULT_TAKE * selfMult);
    if (gA > 0) attacker.gainUlt(game, gA);
    if (gT > 0) target.gainUlt(game, gT);
    stack.ultA = (stack.ultA ?? 0) + Math.max(0, gA);
    stack.ultT = (stack.ultT ?? 0) + Math.max(0, gT);
  }

  if (stack.popup && !stack.popup.dead && stack.popup.age < 0.45) stack.popup.add(dmg);
  else {
    const color = crit ? '#ffe14d' : eff > 1 ? '#ffb347' : eff < 1 ? '#d7dee8' : '#ffffff';
    stack.popup = game.spawn(new DamageNumber(target.x + rand(-6, 6), head - 2, dmg, { color, crit, size: eff > 1 ? 19 : 16 }));
  }
  sparkBurst(game, target.x, target.y, target.bodyZ, eff > 1 || (o.knockback ?? 0) > 150);
  sfx.hit((o.knockback ?? 0) > 150);

  if (!stack.announced) {
    stack.announced = true;
    let y = head - 22;
    const say = (str, color, log, size) => {
      game.spawn(new FloatText(target.x, y, str, color, size));
      if (log) game.ui.log(log);
      y -= 10;
    };
    if (calmed) say('STRONG WINDS!', '#bff3ff', 'The mysterious strong winds weakened the attack!');
    if (crit) say('CRITICAL HIT!', '#ffe14d', 'A critical hit!');
    if (eff > 1) say('SUPER EFFECTIVE!', '#ffb347', "It's super effective!");
    else if (eff < 1) say('NOT VERY EFFECTIVE', '#c9d2de', "It's not very effective…", 7);
  }
  if (flinch) {
    game.spawn(new FloatText(target.x, head - 12, 'FLINCHED!', '#ff9ad5'));
    game.ui.log(`${target.species.name} flinched!`);
  }

  A.onDeal?.(game, attacker, target, move, dmg, info);
  Dfull.onTake?.(game, target, attacker, move, dmg, info);

  // Secondary effects: rolled once per move use. Moves name their own; otherwise the type default.
  if (target.alive && !stack.statusRolled) {
    stack.statusRolled = true;
    const serene = A.serene ? 2 : 1;
    const rolls = [];
    if (o.freezeChance) rolls.push(['freeze', o.freezeChance]);
    if (o.burnChance) rolls.push(['burn', o.burnChance]);
    if (move.status) rolls.push(move.status);
    if (!rolls.length && TYPE_STATUS[type]) rolls.push(TYPE_STATUS[type]);
    for (const [name, chance] of rolls) {
      if (Math.random() < chance * serene) applyStatus(game, target, name, { source: attacker });
    }
  }

  if (move.recoil && attacker.alive && !stack.recoiled) {
    stack.recoiled = true;
    game.dotDamage(attacker, (dmg * move.recoil) / attacker.maxHp, '#ffb070');
  }
  if (o.hitstop) game.hitstop(o.hitstop);
  if (o.shake) game.shake(o.shake);
  if (!target.alive) game.onFaint(target, attacker, move);
  return true;
}
