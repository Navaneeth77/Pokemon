import { BOUNDS } from './arena.js';
import { typesOf } from './data/abilities.js';
import { typeMultiplier } from './data/types.js';
import { Spike, Ring } from './effects.js';

export function structureField() {
  return { lastContact: new WeakMap() };
}

class ArenaStructure extends Spike {
  constructor(game, owner, field, x, y, { style = 'stone', type = 'rock', damage = 0.035 } = {}) {
    super(Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, x)), Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, y)), style, 6, true);
    Object.assign(this, { game, side: owner.side, field, type, damage, sinkFor: 0.35, holdInCutscene: true });
  }

  update(dt) {
    if (!super.update(dt)) return false;
    if (this.game.state !== 'fighting') return false;
    const mon = this.side === 'player' ? this.game.opponent : this.game.player;
    const grounded = mon?.alive && !mon.hidden && !mon.remote && !mon.untouchable && mon.lift < 20;
    const sameTarget = this.previousMon === mon, wasInside = sameTarget && this.inside;
    const previousX = this.previousX, previousY = this.previousY;
    this.previousMon = grounded ? mon : null;
    this.inside = false;
    if (!grounded) return true;
    this.previousX = mon.x;
    this.previousY = mon.y;
    if (this.age < 0.2) return true;
    const radiusSq = (10 + mon.radius * 0.65) ** 2;
    this.inside = (mon.x - this.x) ** 2 + (mon.y - this.y) ** 2 <= radiusSq;
    if (wasInside || (!this.inside && !(sameTarget && this.crossed(mon, previousX, previousY, radiusSq)))) return true;

    const last = this.field.lastContact.get(mon) ?? -Infinity;
    if (this.game.time - last < 0.65) return true;
    const scale = typeMultiplier(this.type, typesOf(mon));
    if (!scale) return true;
    this.field.lastContact.set(mon, this.game.time);
    const color = this.style === 'magma' ? '#f09a54' : this.style === 'ice' ? '#a4ddf4' : '#ddc398';
    this.game.dotDamage(mon, this.damage * Math.min(2, scale), color);
    this.game.spawn(new Ring(this.x, this.y, { r0: 5, r1: 20, width: 2, color, life: 0.22 }));
    return true;
  }

  draw(ctx) {
    ctx.save();
    const glow = Math.min(1, this.age / 0.13, (this.life - this.age) / this.sinkFor);
    ctx.globalAlpha *= glow;
    ctx.fillStyle = this.style === 'magma' ? 'rgba(130,53,29,0.37)' : 'rgba(42,36,50,0.23)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 1, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    super.draw(ctx);
  }

  crossed(mon, previousX, previousY, radiusSq) {
    const dx = mon.x - previousX, dy = mon.y - previousY;
    const distanceSq = dx * dx + dy * dy;
    if (!distanceSq || distanceSq > 70 ** 2) return false;
    const t = Math.max(0, Math.min(1, ((this.x - previousX) * dx + (this.y - previousY) * dy) / distanceSq));
    return (previousX + t * dx - this.x) ** 2 + (previousY + t * dy - this.y) ** 2 <= radiusSq;
  }
}

export function spawnStructure(game, owner, field, x, y, options) {
  return game.spawn(new ArenaStructure(game, owner, field, x, y, options));
}
