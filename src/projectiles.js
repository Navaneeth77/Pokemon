import { applyHit } from './combat.js';
import { rand, Ring, Glow, iceShatter, leafBurst } from './effects.js';
import { BOUNDS } from './arena.js';
import { skyLegend, PressureWave } from './legendary-effects.js';

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
    this.elem = move.type; // element used for projectile-vs-attack reactions
    this.reacted = new Set();
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
    // A dodging target is untouchable: the projectile flies straight through.
    if (t.alive && !t.hidden && !t.untouchable && Math.hypot(t.x - this.x, t.y - this.y) <= this.radius + t.radius) this.impact(true);
    else if (this.traveled >= this.maxDist || this.outside()) this.impact(false);
    return !this.dead;
  }
}

export class AirBlade extends Projectile {
  constructor(game, user, move, x, y, z, angle) {
    super(game, user, move, x, y, z, angle, 330, move.range, 8);
    this.elem = 'flying';
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
    if(skyLegend(this.user))this.game.spawn(new PressureWave(this.x,this.y,32,'air',z));
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
      if(skyLegend(this.user))ctx.scale(1.4,1.4);
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
  aura: {
    speed: 290, radius: 9, glow: [90, 150, 255], core: '#eef6ff', knockback: 150,
    trail: ['#dff0ff', '#6aa8ff', '#2a5ad8'], mark: (g, x, y) => g.marks.energy(x, y, 13, [90, 150, 255]),
  },
  ghost: {
    speed: 240, radius: 10, glow: [130, 70, 200], core: '#24122e', knockback: 120,
    trail: ['#c8a0ff', '#7a48b8', '#2a1838'], mark: (g, x, y) => g.marks.energy(x, y, 13, [110, 60, 170]),
  },
  poison: {
    speed: 220, radius: 9, glow: [180, 70, 200], core: '#f0c0ff', knockback: 100,
    trail: ['#e0a0f0', '#a040a0', '#5a1f5a'], mark: (g, x, y) => g.marks.energy(x, y, 14, [160, 60, 170]),
  },
  shuriken: {
    speed: 360, radius: 8, shape: 'shuriken', glow: [90, 170, 255], knockback: 70,
    trail: ['#ffffff', '#9fd8ff', '#3a8ae8'], mark: (g, x, y) => g.marks.wet(x, y, 7),
  },
  star: {
    speed: 330, radius: 7, shape: 'star', glow: [255, 230, 120], knockback: 50, homing: 2.2,
    trail: ['#ffffff', '#fff2a8', '#ffd040'], mark: () => {},
  },
  moon: {
    speed: 200, radius: 15, scale: 1.8, glow: [255, 160, 210], core: '#fff4fa', knockback: 260,
    trail: ['#ffffff', '#ffc8e4', '#f080b0'], mark: (g, x, y) => { g.marks.energy(x, y, 26, [255, 150, 210], 5); g.marks.fracture(x, y, 22, 5); },
  },
  // Extreme Evoboost: one orb per Eeveelution colour.
  evo: {
    speed: 280, radius: 8, glow: [255, 255, 255], core: '#ffffff', knockback: 70, evo: true,
    trail: ['#ffffff', '#ffe8a0', '#ffb070'], mark: () => {},
  },
};
const orb = (glow, core, trail, mark, extra = {}) => ({ speed: 260, radius: 9, glow, core, knockback: 120, trail, mark, ...extra });
const energyMark = (rgb, r = 13) => (g, x, y) => g.marks.energy(x, y, r, rgb);
const FIRE_TRAIL = ['#fff0a0', '#ff9a3a', '#b8461c'];
Object.assign(ORBS, {
  fire: orb([255, 140, 60], '#fff2c0', FIRE_TRAIL, (g, x, y) => g.marks.scorch(x, y, 12)),
  bigFire: orb([255, 120, 40], '#fff6d0', FIRE_TRAIL, (g, x, y) => { g.marks.scorch(x, y, 20); g.marks.fracture(x, y, 14, 5); },
    { radius: 13, scale: 1.6, speed: 230, knockback: 210 }),
  water: orb([90, 160, 255], '#e6f6ff', ['#ffffff', '#86ccff', '#3a8ae8'], (g, x, y) => g.marks.wet(x, y, 12)),
  psy: orb([255, 120, 200], '#fff0fa', ['#ffe0f0', '#ff8ad0', '#c040a0'], energyMark([255, 120, 200]), { speed: 300 }),
  fairy: orb([255, 170, 220], '#fff6fb', ['#ffffff', '#ffc8e4', '#f080b0'], energyMark([255, 160, 210], 16), { radius: 11, scale: 1.2, speed: 230, knockback: 160 }),
  dark: orb([90, 50, 120], '#1a0f24', ['#c8a0ff', '#6a3a8a', '#2a1838'], energyMark([110, 60, 170])),
  gem: orb([255, 150, 200], '#ffffff', ['#ffffff', '#ffc0e0', '#c0508a'], (g, x, y) => g.marks.fracture(x, y, 7, 4), { radius: 6, scale: 0.7, speed: 340, knockback: 60 }),
  leaf: orb([130, 235, 90], '#f6ffe6', ['#e0ffc0', '#8ad84f', '#3f8f2c'], (g, x, y) => g.marks.leaves(x, y, 7),
    { radius: 6, scale: 0.65, speed: 300, knockback: 50, homing: 1.8, leaves: true }),
  stormLeaf: orb([150, 245, 100], '#ffffff', ['#ffffff', '#b8ff7a', '#3f8f2c'], (g, x, y) => g.marks.leaves(x, y, 10),
    { radius: 8, scale: 0.85, speed: 330, knockback: 70, homing: 2.6, leaves: true }),
  electric: orb([255, 230, 90], '#ffffff', ['#ffffff', '#fff27a', '#e0b000'], (g, x, y) => g.marks.burn(x, y, 9), { speed: 320, radius: 8 }),
  mud: orb([150, 110, 60], '#e8d0a0', ['#d8b878', '#8a6630', '#4a3418'], (g, x, y) => g.marks.fracture(x, y, 9, 4), { speed: 250, radius: 9 }),
});
// Element of each orb style (Tri Attack's orbs carry their own element).
const STYLE_ELEM = {
  fire: 'fire', bigFire: 'fire', water: 'water', shuriken: 'water', ice: 'ice', electric: 'electric', grass: 'grass', leaf: 'grass', stormLeaf: 'grass',
  mud: 'ground', psy: 'psychic', fairy: 'fairy', moon: 'fairy', dark: 'dark', ghost: 'ghost', poison: 'poison', aura: 'fighting', gem: 'rock',
};

const EVO_COLORS = [[255, 120, 70], [80, 150, 255], [255, 220, 60], [190, 120, 255], [60, 50, 80], [120, 220, 110], [120, 210, 255]];

export class Orb extends Projectile {
  constructor(game, user, move, x, y, z, angle, style, variant = 0) {
    let s = ORBS[style];
    if (s.evo) {
      const [R, G, B] = EVO_COLORS[variant % EVO_COLORS.length];
      s = { ...s, glow: [R, G, B], trail: ['#ffffff', `rgb(${R},${G},${B})`, `rgb(${R >> 1},${G >> 1},${B >> 1})`] };
    }
    // Charged shots fly bigger and hit harder (power is already scaled on the move itself).
    const k = 1 + 0.6 * (move.chargeLevel ?? 0);
    super(game, user, move, x, y, z, angle, s.speed, move.range, s.radius * k);
    this.s = k > 1 ? { ...s, scale: (s.scale ?? 1) * k, knockback: s.knockback * k } : s;
    this.power = move.power;
    this.elem = STYLE_ELEM[style] ?? move.type;
  }

  update(dt) {
    // Homing projectiles (Swift) curve toward the target.
    const t = this.target;
    if (this.s.homing && t.alive && !t.hidden) {
      const want = Math.atan2(t.y - this.y, t.x - this.x);
      this.angle += Math.max(-this.s.homing * dt, Math.min(this.s.homing * dt, Math.atan2(Math.sin(want - this.angle), Math.cos(want - this.angle))));
    }
    return super.update(dt);
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
    if (s.shape) {
      this.drawShape(ctx, cy);
      return;
    }
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
    const pulse = (1 + Math.sin(this.age * 30) * 0.12) * (s.scale ?? 1);
    const [R, G, B] = s.glow;
    const g = ctx.createRadialGradient(this.x, cy, 0, this.x, cy, 15 * pulse);
    g.addColorStop(0, `rgba(${R},${G},${B},0.95)`);
    g.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(this.x - 16 * pulse, cy - 16 * pulse, 32 * pulse, 32 * pulse);
    ctx.fillStyle = s.core;
    ctx.beginPath();
    ctx.arc(this.x, cy, 4.5 * (s.scale ?? 1), 0, Math.PI * 2);
    ctx.fill();
  }

  // Spinning water shuriken or Swift star.
  drawShape(ctx, cy) {
    const s = this.s, points = s.shape === 'star' ? 5 : 4, outer = s.shape === 'star' ? 6 : 8, inner = outer * 0.38;
    ctx.save();
    ctx.translate(this.x, cy);
    ctx.rotate(this.age * 18);
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 ? inner : outer, a = (i / (points * 2)) * Math.PI * 2;
      if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.moveTo(r, 0);
    }
    ctx.closePath();
    ctx.fillStyle = s.trail[1];
    ctx.fill();
    ctx.strokeStyle = s.trail[2];
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
