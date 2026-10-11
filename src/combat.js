import { typeMultiplier } from './data/types.js';
import { DamageNumber, FloatText, sparkBurst, iceShatter, rand } from './effects.js';
import { sfx } from './audio.js';

// Real-time battles are short, so type matchups are softened (2× → 1.5×, ½× → 0.7×) and
// immunities become resistances so every move stays usable.
function soften(m) {
  if (m === 0) return 0.5;
  if (m > 1) return m >= 4 ? 2 : 1.5;
  if (m < 1) return m <= 0.25 ? 0.5 : 0.7;
  return 1;
}

// Applies one hit of `move` and all of its feedback. `o.stack` groups the ticks of a
// multi-hit move so they share one damage popup and one effectiveness message.
export function applyHit(game, attacker, target, move, o = {}) {
  if (game.state !== 'fighting' || !target.alive || target.hidden || target.invuln) return false;
  const winds = game.deltaStream && target.species.types.includes('flying');
  const raw = typeMultiplier(move.type, target.species.types, winds);
  const calmed = winds && raw < typeMultiplier(move.type, target.species.types);
  const eff = soften(raw);
  const stab = attacker.species.types.includes(move.type) ? 1.2 : 1;
  const crit = Math.random() < (o.critChance ?? 0.06);
  const power = o.power ?? move.power;
  const stats = (attacker.species.atk ?? 1) / (target.species.def ?? 1);
  const dmg = Math.max(1, Math.round(power * stats * eff * stab * (crit ? 1.5 : 1) * rand(0.92, 1.04)));
  const flinch = !!(o.flinchChance && target.action && Math.random() < o.flinchChance);

  target.takeHit(dmg, {
    dirX: o.dirX ?? 0, dirY: o.dirY ?? 0, knockback: o.knockback ?? 100, stagger: o.stagger ?? 0.22, flinch,
  });

  const head = target.y - target.headZ;
  const stack = o.stack;
  if (stack?.popup && !stack.popup.dead && stack.popup.age < 0.45) stack.popup.add(dmg);
  else {
    const color = crit ? '#ffe14d' : eff > 1 ? '#ffb347' : eff < 1 ? '#d7dee8' : '#ffffff';
    const popup = game.spawn(new DamageNumber(target.x + rand(-6, 6), head - 2, dmg, { color, crit, size: eff > 1 ? 19 : 16 }));
    if (stack) stack.popup = popup;
  }
  sparkBurst(game, target.x, target.y, target.bodyZ, eff > 1 || (o.knockback ?? 0) > 150);
  sfx.hit((o.knockback ?? 0) > 150);

  if (!stack?.announced) {
    if (stack) stack.announced = true;
    let y = head - 22;
    if (calmed) {
      game.spawn(new FloatText(target.x, y, 'STRONG WINDS!', '#bff3ff'));
      game.ui.log('The mysterious strong winds weakened the attack!');
      y -= 10;
    }
    if (crit) {
      game.spawn(new FloatText(target.x, y, 'CRITICAL HIT!', '#ffe14d'));
      game.ui.log('A critical hit!');
      y -= 10;
    }
    if (eff > 1) {
      game.spawn(new FloatText(target.x, y, 'SUPER EFFECTIVE!', '#ffb347'));
      game.ui.log("It's super effective!");
    } else if (eff < 1) {
      game.spawn(new FloatText(target.x, y, 'NOT VERY EFFECTIVE', '#c9d2de', 7));
      game.ui.log("It's not very effective…");
    }
  }

  if (flinch) {
    game.spawn(new FloatText(target.x, head - 12, 'FLINCHED!', '#ff9ad5'));
    game.ui.log(`${target.species.name} flinched!`);
  }

  if (target.alive) {
    if (o.freezeChance && target.frozen <= 0 && Math.random() < o.freezeChance) {
      target.freeze(1.3);
      iceShatter(game, target.x, target.y, target.bodyZ);
      game.spawn(new FloatText(target.x, head - 12, 'FROZEN!', '#a6ecff'));
      game.ui.log(`${target.species.name} was frozen solid!`);
    }
    if (o.burnChance && target.burn <= 0 && Math.random() < o.burnChance) {
      target.burn = 4.2;
      target.burnTick = 1;
      game.spawn(new FloatText(target.x, head - 12, 'BURNED!', '#ff8a4a'));
      game.ui.log(`${target.species.name} was burned!`);
    }
  }

  if (o.hitstop) game.hitstop(o.hitstop);
  if (o.shake) game.shake(o.shake);
  if (!target.alive) game.onFaint(target, attacker);
  return true;
}
