import { applyHit } from './combat.js';
import { rand, Ring, Glow, iceShatter, leafBurst } from './effects.js';
import { BOUNDS } from './arena.js';

class Projectile {
  constructor(game, user, move, x, y, z, angle, speed, maxDist, radius) {
    Object.assign(this, { game, user, target: user.foe, move, x, y, z0: z, angle, speed, maxDist, radius });
    this.layer = 'air';
    this.isProjectile = true;
    this.age = 0;
    this.traveled = 0;
    this.dead = false;
    this.stack = {};
    this.span = Math.max(30, Math.hypot(this.target.x - x, this.target.y - y));
  }

  // Height descends from the launch point toward the target's body height.
  get z() {
    const k = Math.min(1, this.traveled / this.span);
    return this.z0 + (this.target.bodyZ - this.z0) * k;
  }

  outside() {
    return this.x < BOUNDS.minX - 40 || this.x > BOUNDS.maxX + 40 || this.y < BOUNDS.minY - 70 || this.y > BOUNDS.maxY + 40;
  }

  hitOpts(extra) {
    return { dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), stack: this.stack, ...extra };
  }

  update(dt) {
    this.age += dt;
    const step = this.speed * dt;
    this.x += Math.cos(this.angle) * step;
    this.y += Math.sin(this.angle) * step;
    this.traveled += step;
    this.trail(dt);
    const t = this.target;
    if (t.alive && !t.hidden && !t.invuln && Math.hypot(t.x - this.x, t.y - this.y) <= this.radius + t.radius) this.impact(true);
    else if (this.traveled >= this.maxDist || this.outside()) this.impact(false);
    return !this.dead;
  }
}

export class AirBlade extends Projectile {
  constructor(game, user, move, x, y, z, angle) {
    super(game, user, move, x, y, z, angle, 330, move.range, 8);
  }

  trail() {
    if (Math.random() < 0.6) {
      this.game.particles.spawn({
        x: this.x, y: this.y, z: this.z, vx: rand(-12, 12), vy: rand(-12, 12), life: 0.25,
        size: 2, colors: ['#e9fbff', '#a6e9ff'],
      });
    }
  }

  impact(hit) {
    this.dead = true;
    const z = this.z;
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(50, 130);
      this.game.particles.spawn({
        x: this.x, y: this.y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, drag: 5,
        life: 0.25, size: 2, colors: ['#ffffff', '#bdf0ff'],
      });
    }
    this.game.spawn(new Ring(this.x, this.y, { z, r0: 3, r1: 18, life: 0.22, color: '#dff7ff', width: 2, layer: 'air' }));
    if (hit) applyHit(this.game, this.user, this.target, this.move, this.hitOpts({ knockback: 110, stagger: 0.25, flinchChance: 0.3 }));
  }

  draw(ctx) {
    const z = this.z;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 3; i >= 0; i--) {
      ctx.save();
      ctx.translate(this.x - Math.cos(this.angle) * i * 7, this.y - Math.sin(this.angle) * i * 7 - z);
      ctx.rotate(this.angle);
      ctx.globalAlpha = i === 0 ? 1 : 0.35 / i;
      ctx.beginPath();
      ctx.arc(-7, 0, 11, -1.15, 1.15);
      ctx.strokeStyle = '#2f7fa8';
      ctx.lineWidth = 5.5;
      ctx.stroke();
      ctx.strokeStyle = '#8fe3ff';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

// Energy projectiles that differ by style: look, speed, trail, impact and the ground mark left behind.
const ORBS = {
  grass: {
    speed: 210, radius: 10, glow: [130, 235, 90], core: '#f6ffe6', knockback: 120, leaves: true,
    trail: ['#e0ffc0', '#8ad84f', '#3f8f2c'],
    mark: (g, x, y) => { g.marks.energy(x, y, 13, [110, 220, 80]); g.marks.leaves(x, y, 12); },
  },
  ice: {
    speed: 380, radius: 6, shard: true, glow: [150, 230, 255], knockback: 50,
    trail: ['#ffffff', '#c8f2ff'], mark: (g, x, y) => g.marks.frost(x, y, 7),
  },
};

export class Orb extends Projectile {
  constructor(game, user, move, x, y, z, angle, style) {
    const s = ORBS[style];
    super(game, user, move, x, y, z, angle, s.speed, move.range, s.radius);
    this.s = s;
  }

  trail() {
    const s = this.s, back = this.angle + Math.PI;
    for (let i = 0; i < (s.shard ? 1 : 2); i++) {
      this.game.particles.spawn({
        x: this.x + rand(-3, 3), y: this.y + rand(-3, 3), z: this.z + rand(-3, 3),
        vx: Math.cos(back) * 30 + rand(-12, 12), vy: Math.sin(back) * 30 + rand(-12, 12),
        life: rand(0.2, 0.35), size: s.shard ? 2 : rand(3, 5), sizeEnd: 1, colors: s.trail,
      });
    }
  }

  impact(hit) {
    this.dead = true;
    const g = this.game, s = this.s, z = this.z;
    for (let i = 0; i < 16; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(50, 150);
      g.particles.spawn({
        x: this.x, y: this.y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rand(-10, 50), drag: 4,
        life: rand(0.25, 0.45), size: rand(2, 4), sizeEnd: 1, colors: s.trail,
      });
    }
    if (s.shard) iceShatter(g, this.x, this.y, z);
    else {
      g.spawn(new Glow(this.x, this.y, z, 30, s.glow, 0.3));
      g.spawn(new Ring(this.x, this.y, { z, r0: 4, r1: 26, life: 0.3, color: s.trail[1], width: 3, layer: 'air' }));
    }
    if (s.leaves) leafBurst(g, this.x, this.y, z, 10);
    s.mark(g, this.x, this.y);
    if (hit) applyHit(g, this.user, this.target, this.move, this.hitOpts({ knockback: s.knockback, stagger: 0.3, hitstop: 0.03 }));
  }

  draw(ctx) {
    const s = this.s, cy = this.y - this.z;
    if (s.shard) {
      ctx.save();
      ctx.translate(this.x, cy);
      ctx.rotate(this.angle);
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(0, -2.4);
      ctx.lineTo(-6, 0);
      ctx.lineTo(0, 2.4);
      ctx.closePath();
      ctx.fillStyle = '#e8fbff';
      ctx.fill();
      ctx.strokeStyle = '#4fb2d8';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      return;
    }
    const pulse = 1 + Math.sin(this.age * 30) * 0.12;
    const [R, G, B] = s.glow;
    const g = ctx.createRadialGradient(this.x, cy, 0, this.x, cy, 15 * pulse);
    g.addColorStop(0, `rgba(${R},${G},${B},0.95)`);
    g.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(this.x - 16, cy - 16, 32, 32);
    ctx.fillStyle = s.core;
    ctx.beginPath();
    ctx.arc(this.x, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
