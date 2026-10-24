import { applyStatus } from './status.js';
import { BeamLine } from './effects.js';
import { typesOf } from './data/abilities.js';
import { hitReaction, primeElement } from './reactions.js';

export function prepareReaction(game, target, type, move, stack, options) {
  if (target.remote || options.reaction || stack.elementChecked || target.shield > 0 || target.guard) return null;
  stack.elementChecked = true;
  const r = hitReaction(target, type, game.time, move);
  if (!r) { primeElement(target, type, game.time); return null; }
  target.elementAura = null;
  target.reactionUntil = game.time + 1.5;
  const count = target.reactionComboUntil > game.time ? Math.min(3, (target.reactionCount ?? 0) + 1) : 1;
  target.reactionCount = count;
  target.reactionComboUntil = game.time + 5;
  return { ...r, bonus: r.bonus * (count === 2 ? 1.25 : count === 3 ? 0.6 : 1) };
}

export function resolveReaction(game, attacker, target, rule, damage, applyHit) {
  if (rule.cleanse) game.marks.removeNear?.(['frost','wet','burn'], target.x,target.y,60);
  if (rule.cleanse) { target.status.burn = 0; target.status.burnT = 0; target.frozen = 0; target.elementAura = null; }
  if (rule.ground) { target.status.para = 0; target.elementAura = null; }
  if (rule.status && target.alive) applyStatus(game, target, rule.status, { source: attacker, dur: rule.duration });
  game.reactFx(target.x, target.y, target.bodyZ, rule);
  game.hud.callout(attacker.side, rule.label);
  game.netSend(attacker, { t: 'reaction', id: rule.id, x: target.x, y: target.y, z: target.bodyZ });
  game.recordCombat?.('reaction', attacker, target, { reaction: rule.id });
  if (!rule.chains) return;
  const candidates = game.combatants?.() ?? [game.player, game.opponent];
  let count = 0;
  for (const other of candidates) {
    if (count >= rule.chains) break;
    if (other === target || other.side === attacker.side || !other.alive || other.hidden || other.remote) continue;
    if (Math.hypot(other.x - target.x, other.y - target.y) > rule.radius) continue;
    if (rule.id === 'conduct' && (typesOf(other).includes('ground') || other.elementAura?.type !== 'water' || other.elementAura.until <= game.time)) continue;
    const hit = applyHit(game, attacker, other, { id: 'reaction-chain', name: rule.label, type: rule.id === 'conduct' ? 'electric' : 'fire', power: Math.min(35, damage * 0.18), cat: 'special', cooldown: 0 }, { reaction: true, stagger: 0, knockback: 0, critChance: 0 });
    if (hit) {
      count++;
      other.elementAura = null;
      other.reactionUntil = game.time + 1.5;
      game.spawn(new BeamLine(target.x, target.y - target.bodyZ, other.x, other.y - other.bodyZ, 0.25, rule.color, 2));
    }
  }
}
