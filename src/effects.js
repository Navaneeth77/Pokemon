import { loadImage } from './assets.js';
import { quality } from './quality.js';
import { outlinedText, rainbowRing, megaSymbol } from './draw.js';
import { blit } from './sprite.js';
import { drawNaturalCharge } from './raid-art.js';

export const rand = (a, b) => a + Math.random() * (b - a);
export const FIRE = ['#fffbd0', '#ffe066', '#ffab33', '#ff6a1f', '#d23a17', '#7a3a2a'];
export const FIRE_BLUE = ['#f2fbff', '#bfe9ff', '#6cc8ff', '#2f86ee', '#1f4cc0', '#2a2f4a'];
export const flameColors = mon => (mon.species.flame === 'blue' ? FIRE_BLUE : FIRE);
const WATER = ['#ffffff', '#cdeeff', '#7cc4ff', '#3a86e8'];
const ICE = ['#ffffff', '#d8f6ff', '#9be6ff', '#5cc3e6'];
const SMOKE = ['#9a9aa2', '#7d7e86', '#64656d'];

// Particles live on the ground plane (x, y) with a height z; they are drawn at y - z.
const PARTICLE_DEFAULTS = {
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, gz: 0, drag: 0, life: 0.5, size: 2, sizeEnd: null,
  colors: ['#fff'], round: false, fade: true, alpha: 1, layer: 'air', age: 0,
};

export class ParticleSystem {
  constructor() {
    this.list = [];
    this.pool = [];
  }

  clear() {
    this.pool.push(...this.list);
    this.list.length = 0;
  }

  // Dead particles are recycled to avoid garbage-collection hitches during heavy effects.
  spawn(p) {
    if (this.list.length >= Math.min(this.max ?? quality().particles, quality().particles)) return;
    const q = Object.assign(this.pool.pop() ?? {}, PARTICLE_DEFAULTS, p);
    q.age = 0;
    this.list.push(q);
  }

  update(dt) {
    const l = this.list;
    let w = 0;
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.pool.push(p);
        continue;
      }
      if (p.drag) {
        const f = Math.exp(-p.drag * dt);
        p.vx *= f;
        p.vy *= f;
        p.vz *= f;
      }
      p.vz -= p.gz * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz = 0;
      }
      l[w++] = p;
    }
    l.length = w;
  }

  draw(ctx, layer) {
    for (const p of this.list) {
      if (p.layer !== layer) continue;
      const t = p.age / p.life;
      const s = p.sizeEnd == null ? p.size : p.size + (p.sizeEnd - p.size) * t;
      ctx.globalAlpha = p.alpha * (p.fade ? 1 - t * t : 1);
      ctx.fillStyle = p.colors[Math.min(p.colors.length - 1, Math.floor(t * p.colors.length))];
      if (p.round) {
        ctx.beginPath();
        ctx.arc(p.x, p.y - p.z, Math.max(0.5, s / 2), 0, Math.PI * 2);
        ctx.fill();
      } else {
        const r = Math.max(1, Math.round(s));
        ctx.fillRect(Math.round(p.x - r / 2), Math.round(p.y - p.z - r / 2), r, r);
      }
    }
    ctx.globalAlpha = 1;
  }
}

class Effect {
  constructor(layer, life) {
    this.layer = layer;
    this.life = life;
    this.age = 0;
    this.dead = false;
  }

  update(dt) {
    this.age += dt;
    return !this.dead && this.age < this.life;
  }
}

let ultimateImpactImage = null;
export async function preloadImpactSprite() {
  ultimateImpactImage = await loadImage('/art/ultimate-impact.png');
}
export class UltimateImpact extends Effect {
  constructor(x,y,z,size=64) { super('air',.32);Object.assign(this,{x,y,z,size}); }
  draw(ctx) {
    if (!ultimateImpactImage) return;
    const p=this.age/this.life,size=this.size*(.45+.65*Math.min(1,p*4));
    ctx.save();ctx.globalAlpha=1-p;
    ctx.drawImage(ultimateImpactImage,Math.round(this.x-size/2),Math.round(this.y-this.z-size/2),size,size);
    ctx.restore();
  }
}

export class DamageNumber extends Effect {
  constructor(x, y, value, { color = '#fff', size = 16, crit = false } = {}) {
    super('top', 0.9);
    Object.assign(this, { x, y, value, color, size: crit ? size * 1.25 : size, drift: rand(-14, 14) });
  }

  add(v) {
    this.value += v;
    this.age = Math.min(this.age, 0.08);
  }

  draw(ctx) {
    const t = this.age / this.life;
    const pop = this.age < 0.1 ? 1.5 - this.age * 5 : 1;
    ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    outlinedText(ctx, String(this.value), this.x + this.drift * t, this.y - 18 * Math.min(1, t * 2.2), {
      size: this.size * pop, family: 'Luckiest Guy', weight: 400, color: this.color, lw: 3.5, stroke: '#1a1820', align: 'center',
    });
    ctx.globalAlpha = 1;
  }
}

export class FloatText extends Effect {
  constructor(x, y, text, color = '#fff', size = 8, life = 1.1) {
    super('top', life);
    Object.assign(this, { x, y, text, color, size });
  }

  draw(ctx) {
    const t = this.age / this.life;
    ctx.globalAlpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
    outlinedText(ctx, this.text, this.x, this.y - 10 * t, { size: this.size, italic: true, color: this.color, lw: 2.5, align: 'center' });
    ctx.globalAlpha = 1;
  }
}

export class Ring extends Effect {
  // `hold`: stays fully visible until it ends (a warning zone) instead of fading out.
  constructor(x, y, { z = 0, r0 = 4, r1 = 30, life = 0.35, color = '#fff', width = 2, layer = 'ground', hold = false } = {}) {
    super(layer, life);
    Object.assign(this, { x, y, z, r0, r1, color, width, hold });
  }

  draw(ctx) {
    const t = this.age / this.life;
    const e = 1 - (1 - t) * (1 - t);
    ctx.globalAlpha = this.hold ? 0.9 : 1 - t;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.hold ? this.width : this.width * (1 - t) + 0.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y - this.z, this.r0 + (this.r1 - this.r0) * e, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export class Glow extends Effect {
  constructor(x, y, z, r, rgb, life, grow = false) {
    super('air', life);
    Object.assign(this, { x, y, z, r, rgb, grow });
  }

  draw(ctx) {
    const t = this.age / this.life;
    const r = this.grow ? this.r * (0.4 + 0.6 * t) : this.r * (1 + 0.3 * t);
    const a = this.grow ? 0.75 : 0.9 * (1 - t);
    const [R, G, B] = this.rgb;
    const cy = this.y - this.z;
    const g = ctx.createRadialGradient(this.x, cy, 0, this.x, cy, r);
    g.addColorStop(0, `rgba(${R},${G},${B},${a})`);
    g.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(this.x - r, cy - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
  }
}

export class ClawSlash extends Effect {
  constructor(x, y, z, angle, mirror) {
    super('air', 0.3);
    Object.assign(this, { x, y, z, angle, mirror });
  }

  draw(ctx) {
    const t = this.age / this.life;
    const reveal = Math.min(1, this.age / 0.07);
    const alpha = t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55;
    ctx.save();
    ctx.translate(this.x, this.y - this.z);
    ctx.rotate(this.angle);
    if (this.mirror) ctx.scale(1, -1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const p0 = [-6 + i * 4, -15 + i * 5], c = [11 + i * 4, -4 + i * 5], p1 = [6 + i * 4, 13 + i * 5];
      ctx.beginPath();
      for (let s = 0; s <= reveal + 1e-6; s += 0.1) {
        const u = 1 - s;
        const px = u * u * p0[0] + 2 * u * s * c[0] + s * s * p1[0];
        const py = u * u * p0[1] + 2 * u * s * c[1] + s * s * p1[1];
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.globalAlpha = alpha * 0.75;
      ctx.strokeStyle = '#8f5bff';
      ctx.lineWidth = 4.5;
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#dff6ff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
  }
}

export class FangBite extends Effect {
  constructor(x, y, z) {
    super('air', 0.38);
    Object.assign(this, { x, y, z });
  }

  draw(ctx) {
    const t = this.age / this.life;
    const close = Math.min(1, this.age / 0.1);
    const gap = 13 * (1 - close) + 1.5;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y - this.z));
    ctx.globalAlpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#4aa9cc';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 1; i++) {
      const fx = i * 6 + 1;
      ctx.beginPath();
      ctx.moveTo(fx - 2.5, -gap - 7);
      ctx.lineTo(fx + 2.5, -gap - 7);
      ctx.lineTo(fx, -gap + 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fx + 0.5, gap + 7);
      ctx.lineTo(fx + 5.5, gap + 7);
      ctx.lineTo(fx + 3, gap - 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

export class Beam extends Effect {
  constructor(x0, y0, x1, y1, life, { width = 22, colors = ['#ff7b2e', '#ffd36b', '#fffbe8'] } = {}) {
    super('air', life);
    Object.assign(this, { x0, y0, x1, y1, width, colors });
  }

  set(x0, y0, x1, y1) {
    Object.assign(this, { x0, y0, x1, y1 });
  }

  draw(ctx) {
    const t = this.age / this.life;
    const env = t < 0.1 ? t / 0.1 : t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1;
    const w = this.width * env * (1 + 0.12 * Math.sin(this.age * 60));
    const [outer, mid, core] = this.colors;
    const len = Math.hypot(this.x1 - this.x0, this.y1 - this.y0);
    ctx.save();
    ctx.translate(this.x0, this.y0);
    ctx.rotate(Math.atan2(this.y1 - this.y0, this.x1 - this.x0));
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = outer;
    ctx.fillRect(0, -w / 2, len, w);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = mid;
    ctx.fillRect(0, -w * 0.32, len, w * 0.64);
    ctx.globalAlpha = 1;
    ctx.fillStyle = core;
    ctx.fillRect(0, -w * 0.14, len, w * 0.28);
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class Telegraph extends Effect {
  constructor(x, y, angle, length, halfWidth, rgb = '255,96,48') {
    super('ground', Infinity);
    Object.assign(this, { x, y, angle, length, halfWidth, rgb });
  }

  set(x, y, angle) {
    this.x = x;
    this.y = y;
    this.angle = angle;
  }

  draw(ctx) {
    const pulse = 0.5 + 0.5 * Math.sin(this.age * 22);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = `rgba(${this.rgb},${0.1 + 0.1 * pulse + Math.min(0.15, this.age * 0.15)})`;
    ctx.fillRect(0, -this.halfWidth, this.length, this.halfWidth * 2);
    ctx.fillStyle = `rgba(${this.rgb},0.8)`;
    ctx.fillRect(0, -this.halfWidth, this.length, 1);
    ctx.fillRect(0, this.halfWidth - 1, this.length, 1);
    ctx.restore();
  }
}

export function sparkBurst(game, x, y, z, strong) {
  const n = strong ? 16 : 10;
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(50, strong ? 170 : 120);
    game.particles.spawn({
      x, y, z: z + rand(-4, 4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rand(-30, 60), drag: 5,
      life: rand(0.18, 0.32), size: rand(2, 3), colors: ['#ffffff', '#fff1a8', '#ffc65a'],
    });
  }
}

export function waterSplash(game, x, y) {
  for (let i = 0; i < 46; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(30, 120);
    game.particles.spawn({
      x, y, z: rand(2, 12), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rand(60, 170), gz: 420, drag: 0.8,
      life: rand(0.45, 0.8), size: rand(2, 4), colors: WATER,
    });
  }
  for (let i = 0; i < 12; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(20, 50);
    game.particles.spawn({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, drag: 3, life: rand(0.5, 0.8),
      size: 4, sizeEnd: 9, colors: ['#e9f7ff', '#bfe4ff'], alpha: 0.7, round: true, layer: 'ground',
    });
  }
  game.spawn(new Ring(x, y, { r0: 6, r1: 40, life: 0.4, color: '#cfefff', width: 3 }));
}

export function iceShatter(game, x, y, z) {
  for (let i = 0; i < 22; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(40, 130);
    game.particles.spawn({
      x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rand(20, 110), gz: 320, drag: 1.5,
      life: rand(0.35, 0.6), size: rand(2, 4), colors: ICE,
    });
  }
  game.spawn(new Glow(x, y, z, 24, [150, 230, 255], 0.25));
}

export function dustCloud(game, x, y, n = 10, size = 4) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(15, 50);
    game.particles.spawn({
      x, y, z: 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rand(4, 14), drag: 2.5,
      life: rand(0.5, 0.9), size, sizeEnd: size * 2.2, colors: ['#f1f4f8', '#d6dce4', '#c3cad4'], alpha: 0.75, round: true, layer: 'ground',
    });
  }
}

export function sendOutBurst(game, x, y, z) {
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, sp = rand(60, 110);
    game.particles.spawn({
      x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, drag: 4, life: rand(0.3, 0.5),
      size: rand(2, 3), colors: ['#ffffff', '#fff3b8', '#ffd2f0'],
    });
  }
  game.spawn(new Ring(x, y, { r0: 4, r1: 34, life: 0.35, color: '#ffffff', width: 3 }));
  game.spawn(new Glow(x, y, z, 34, [255, 255, 255], 0.3));
}

export class ThrownBall extends Effect {
  constructor(x0, y0, z0, x1, y1, dur, onLand) {
    super('air', dur);
    Object.assign(this, { x0, y0, z0, x1, y1, onLand });
  }

  update(dt) {
    this.age += dt;
    if (this.age < this.life) return true;
    this.onLand();
    return false;
  }

  draw(ctx) {
    const k = Math.min(1, this.age / this.life);
    const x = this.x0 + (this.x1 - this.x0) * k, y = this.y0 + (this.y1 - this.y0) * k;
    const z = this.z0 * (1 - k) + 46 * 4 * k * (1 - k) + 8 * k;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#1d2433';
    ctx.beginPath();
    ctx.ellipse(x, y, 3, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y - z));
    ctx.rotate(this.age * 18);
    ctx.fillStyle = '#1c1b24';
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e3412f';
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#f4f4f4';
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#1c1b24';
    ctx.fillRect(-2.6, -0.5, 5.2, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-0.8, -0.8, 1.6, 1.6);
    ctx.restore();
  }
}

// Rainbow rings rising around a Pokémon while it Mega Evolves; follows the Pokémon.
export class MegaAura extends Effect {
  constructor(mon, life) {
    super('air', life);
    this.mon = mon;
  }

  draw(ctx) {
    const m = this.mon, t = this.age / this.life;
    const fade = t > 0.8 ? 1 - (t - 0.8) / 0.2 : Math.min(1, this.age / 0.15);
    for (let i = 0; i < 3; i++) {
      const p = (this.age * 1.6 + i / 3) % 1;
      rainbowRing(ctx, m.x, m.y - m.bodyZ, 10 + p * 30, 2.5 * (1 - p) + 0.5, this.age * 240, fade * (1 - p));
    }
  }
}

export class RainbowStreak extends Effect {
  constructor(x0, y0, x1, y1, life) {
    super('air', life);
    Object.assign(this, { x0, y0, x1, y1 });
  }

  draw(ctx) {
    const t = this.age / this.life;
    const reach = Math.min(1, t / 0.4);
    const g = ctx.createLinearGradient(this.x0, this.y0, this.x1, this.y1);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60 + this.age * 400}, 95%, 65%)`);
    ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    ctx.strokeStyle = g;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3 + Math.sin(this.age * 40);
    ctx.beginPath();
    ctx.moveTo(this.x0, this.y0);
    ctx.lineTo(this.x0 + (this.x1 - this.x0) * reach, this.y0 + (this.y1 - this.y0) * reach);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export class MegaEmblem extends Effect {
  constructor(x, y, life) {
    super('top', life);
    Object.assign(this, { x, y });
  }

  draw(ctx) {
    const t = this.age / this.life;
    const pop = this.age < 0.15 ? 0.4 + (this.age / 0.15) * 0.8 : this.age < 0.25 ? 1.2 - (this.age - 0.15) * 2 : 1;
    ctx.globalAlpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
    megaSymbol(ctx, this.x, this.y - 6 * t, 9 * pop, this.age * 200);
    ctx.globalAlpha = 1;
  }
}

export function rainbowBurst(game, x, y, z) {
  for (let i = 0; i < 48; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(50, 170);
    const hue = Math.floor(rand(0, 360));
    game.particles.spawn({
      x, y, z: z + rand(-6, 6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rand(-20, 60), drag: 3,
      life: rand(0.4, 0.8), size: rand(2, 4), colors: [`hsl(${hue}, 100%, 85%)`, `hsl(${hue}, 95%, 62%)`],
    });
  }
  game.spawn(new Ring(x, y, { z, r0: 6, r1: 60, life: 0.45, color: '#ffffff', width: 4, layer: 'air' }));
  game.spawn(new Glow(x, y, z, 60, [255, 255, 255], 0.45));
}

function jag(x0, y0, x1, y1, amp) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const n = Math.max(3, Math.round(len / 9));
  const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
  const pts = [[x0, y0]];
  for (let i = 1; i < n; i++) {
    const k = i / n, o = rand(-amp, amp);
    pts.push([x0 + (x1 - x0) * k + nx * o, y0 + (y1 - y0) * k + ny * o]);
  }
  pts.push([x1, y1]);
  return pts;
}

// A jagged bolt (plus forks) between two screen points, re-randomised every few frames.
export class Lightning extends Effect {
  constructor(x0, y0, x1, y1, life, { width = 2, branches = 3, glow = 'rgba(255,240,120,0.55)', core = '#ffffff' } = {}) {
    super('air', life);
    Object.assign(this, { x0, y0, x1, y1, width, branches, glow, core, reroll: 0, paths: [] });
  }

  update(dt) {
    this.reroll -= dt;
    if (this.reroll <= 0) {
      this.reroll = 0.045;
      const len = Math.hypot(this.x1 - this.x0, this.y1 - this.y0);
      const main = jag(this.x0, this.y0, this.x1, this.y1, Math.min(9, len * 0.08));
      this.paths = [main];
      for (let b = 0; b < this.branches && main.length > 2; b++) {
        const [sx, sy] = main[1 + Math.floor(Math.random() * (main.length - 2))];
        const a = Math.atan2(this.y1 - this.y0, this.x1 - this.x0) + rand(-1, 1), l = len * rand(0.12, 0.25);
        this.paths.push(jag(sx, sy, sx + Math.cos(a) * l, sy + Math.sin(a) * l, 4));
      }
    }
    return super.update(dt);
  }

  draw(ctx) {
    const t = this.age / this.life;
    ctx.globalAlpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : Math.random() < 0.15 ? 0.6 : 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    this.paths.forEach((p, i) => {
      const w = i === 0 ? this.width : this.width * 0.5;
      ctx.beginPath();
      p.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = this.glow;
      ctx.lineWidth = w * 3;
      ctx.stroke();
      ctx.strokeStyle = this.core;
      ctx.lineWidth = w;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
}

export class BeamLine extends Effect {
  constructor(x0, y0, x1, y1, life, color, width = 3) {
    super('air', life);
    Object.assign(this, { x0, y0, x1, y1, color, width });
  }

  draw(ctx) {
    const t = this.age / this.life;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';
    ctx.lineWidth = this.width * (1 - t * 0.6);
    ctx.beginPath();
    ctx.moveTo(this.x0, this.y0);
    ctx.lineTo(this.x1, this.y1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// A crescent swipe around (x, y) facing `angle` — blades, tails and aerial slashes.
export class SlashArc extends Effect {
  constructor(x, y, z, angle, { radius = 16, spread = 2, colors = ['#7be05a', '#f0ffe6'], width = 5, life = 0.3, mirror = false } = {}) {
    super('air', life);
    Object.assign(this, { x, y, z, angle, radius, spread, colors, width, mirror });
  }

  draw(ctx) {
    const t = this.age / this.life, reveal = Math.min(1, this.age / 0.08);
    const dir = this.mirror ? -1 : 1;
    const a0 = this.angle - (this.spread / 2) * dir, a1 = a0 + this.spread * reveal * dir;
    ctx.globalAlpha = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(this.x, this.y - this.z, this.radius, a0, a1, dir < 0);
    ctx.strokeStyle = this.colors[0];
    ctx.lineWidth = this.width;
    ctx.stroke();
    ctx.strokeStyle = this.colors[1];
    ctx.lineWidth = this.width * 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// A fading tinted copy of a Pokémon's current frame, left behind by fast dashes.
export class Afterimage extends Effect {
  constructor(mon, life = 0.22, color = '#ffffff') {
    super('air', life);
    const s = mon.sprite;
    this.snap = { a: s.anim, frame: s.frame, row: s.anim.rows > 1 ? mon.dir : 0, x: mon.x, y: mon.y - mon.z };
    this.color = color;
  }

  draw(ctx) {
    const { a, frame, row, x, y } = this.snap;
    blit(ctx, a.image, (frame + (a.offset ?? 0)) * a.fw, row * a.fh, a.fw, a.fh,
      Math.round(x - a.fw / 2), Math.round(y - a.fh / 2 + (a.yOffset ?? 0)), a.fw, a.fh,
      { alpha: 0.5 * (1 - this.age / this.life), flash: 0.75, flashColor: this.color });
  }
}

// Pulsing ground circle marking where a delayed attack will land.
export class GroundMarker extends Effect {
  constructor(x, y, r, rgb) {
    super('ground', Infinity);
    Object.assign(this, { x, y, r, rgb });
  }

  set(x, y) {
    this.x = x;
    this.y = y;
  }

  draw(ctx) {
    const p = 0.5 + 0.5 * Math.sin(this.age * 18);
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.r, this.r * 0.72, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${this.rgb},${0.1 + 0.08 * p})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${this.rgb},${0.55 + 0.35 * p})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.r * 0.45, this.r * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export class StormCloud extends Effect {
  constructor(x, y, life) {
    super('air', life);
    Object.assign(this, { x, y, puffs: Array.from({ length: 7 }, () => [rand(-22, 22), rand(-6, 6), rand(8, 14)]) });
  }

  draw(ctx) {
    const t = this.age / this.life;
    ctx.globalAlpha = 0.9 * Math.min(1, this.age / 0.25) * (t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1);
    for (const [ox, oy, r] of this.puffs) {
      ctx.fillStyle = '#3d4150';
      ctx.beginPath();
      ctx.arc(this.x + ox, this.y + oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (Math.random() < 0.3) {
      ctx.fillStyle = 'rgba(255,240,140,0.55)';
      ctx.beginPath();
      ctx.arc(this.x + rand(-15, 15), this.y + rand(-3, 3), rand(4, 8), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [ox, oy, r] of this.puffs) {
      ctx.fillStyle = '#5b6072';
      ctx.beginPath();
      ctx.arc(this.x + ox - 2, this.y + oy - 3, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// Whirling snow and fog over a Blizzard's area.
export class StormSwirl extends Effect {
  constructor(x, y, r, life) {
    super('air', life);
    Object.assign(this, { x, y, r });
  }

  draw(ctx) {
    const t = this.age / this.life;
    const a = Math.min(1, this.age / 0.3) * (t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1);
    const cy = this.y - 10;
    const g = ctx.createRadialGradient(this.x, cy, 0, this.x, cy, this.r);
    g.addColorStop(0, `rgba(235,248,255,${0.4 * a})`);
    g.addColorStop(1, 'rgba(235,248,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(this.x - this.r, cy - this.r, this.r * 2, this.r * 2);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255,255,255,${0.55 * a})`;
    for (let i = 0; i < 4; i++) {
      const rot = this.age * 5 + (i * Math.PI) / 2, rr = this.r * (0.35 + 0.17 * i);
      ctx.beginPath();
      ctx.ellipse(this.x, cy, rr, rr * 0.6, 0, rot, rot + 1.6);
      ctx.stroke();
    }
  }
}

export function electricBurst(game, x, y, z, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(60, 200);
    game.particles.spawn({
      x, y, z: z + rand(-4, 4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rand(-20, 80), drag: 6,
      life: rand(0.12, 0.3), size: rand(1, 2.5), colors: ['#ffffff', '#fff27a', '#ffd21f'],
    });
  }
  game.spawn(new Glow(x, y, z, 22, [255, 240, 120], 0.2));
}

export function leafBurst(game, x, y, z, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(30, 110);
    game.particles.spawn({
      x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rand(30, 90), gz: 140, drag: 2.5,
      life: rand(0.5, 0.9), size: rand(2, 3), colors: ['#b8f070', '#6cc644', '#3a8a2a'],
    });
  }
}

// Rock and snow chunks thrown up by ground impacts.
export function debris(game, x, y, n = 20, speed = 120) {
  const rock = ['#eef2f6', '#9aa2ae', '#6b7380', '#4a515c'];
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(speed * 0.3, speed);
    game.particles.spawn({
      x, y, z: 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rand(80, 220), gz: 520, drag: 0.6,
      life: rand(0.6, 1.1), size: rand(2, 4), colors: [rock[Math.floor(Math.random() * rock.length)]],
    });
  }
}

export function windBurst(game, x, y, z, n = 24, colors = ['#ffffff', '#e6f6ff']) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.1, 0.1), sp = rand(160, 280);
    game.particles.spawn({
      x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, drag: 4, life: rand(0.25, 0.45), size: 2, sizeEnd: 1, colors,
    });
  }
}

export function metalSparks(game, x, y, z) {
  for (let i = 0; i < 16; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(60, 170);
    game.particles.spawn({
      x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rand(30, 120), gz: 380, drag: 2,
      life: rand(0.25, 0.5), size: rand(1, 2), colors: ['#ffffff', '#dfe7f2', '#9aa8bc'],
    });
  }
  game.spawn(new Ring(x, y, { z, r0: 3, r1: 16, life: 0.2, color: '#e9eef5', width: 2, layer: 'air' }));
}

// Vertical column of light rising from the ground (lift-offs and impacts).
export class Pillar extends Effect {
  constructor(x, y, life, rgb, height = 260) {
    super('air', life);
    Object.assign(this, { x, y, rgb, height });
  }

  draw(ctx) {
    const t = this.age / this.life;
    const a = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    const w = 26 * (1 - t * 0.6), [R, G, B] = this.rgb;
    const g = ctx.createLinearGradient(0, this.y, 0, this.y - this.height);
    g.addColorStop(0, `rgba(${R},${G},${B},${0.85 * a})`);
    g.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(this.x - w / 2, this.y - this.height, w, this.height);
    ctx.fillStyle = `rgba(255,255,255,${0.8 * a})`;
    ctx.fillRect(this.x - w * 0.15, this.y - this.height * 0.8, w * 0.3, this.height * 0.8);
  }
}

// Swirling energy aura that follows a Pokémon (dragon fire by default); larger as a diving comet.
export class EnergyAura extends Effect {
  constructor(mon, life, comet = false, tint = null) {
    super('air', life);
    Object.assign(this, { mon, comet, tint });
  }

  draw(ctx) {
    const m = this.mon, t = this.age / this.life;
    const a = Math.min(1, this.age / 0.12) * (t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1);
    if (m.boss === 'rayquaza' || m.boss === 'lugia') {
      drawNaturalCharge(ctx, m, this.age, 1, false, a);
      return;
    }
    const cx = m.x, cy = m.y - m.bodyZ, r = this.comet ? 42 : 34;
    const [R, G, B] = this.tint?.glow ?? [90, 230, 140];
    const [r1, r2] = this.tint?.rings ?? ['rgba(160,255,200,1)', 'rgba(255,230,120,1)'];
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(230,255,240,${0.55 * a})`);
    g.addColorStop(0.5, `rgba(${R},${G},${B},${0.35 * a})`);
    g.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85 * a;
    for (let i = 0; i < 3; i++) {
      const rot = this.age * (8 + i * 3) + i * 2.1, rr = r * (0.55 + 0.15 * i);
      ctx.strokeStyle = i === 1 ? r2 : r1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr, rr * 0.45, 0.4 * i - 0.4, rot, rot + 2.2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// Darkens the arena floor for a dramatic beat while everything above it stays bright.
export class ScreenDim extends Effect {
  constructor(life, alpha, rgb = '8,20,16') {
    super('ground', life);
    Object.assign(this, { alpha, rgb });
  }

  draw(ctx) {
    if (quality().particles <= 220) return;
    const t = this.age / this.life;
    ctx.fillStyle = `rgba(${this.rgb},${this.alpha * Math.min(1, this.age / 0.15) * (t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1)})`;
    ctx.fillRect(-1600, -1600, 3560, 3840);
  }
}

// Delta Stream: gusts streaking across the whole arena for as long as the strong winds last.
export class WindStreaks extends Effect {
  constructor() {
    super('air', Infinity);
    this.streaks = Array.from({ length: 26 }, () => this.make(true));
  }

  make(anywhere) {
    return { x: anywhere ? rand(-60, 360) : rand(-160, -40), y: rand(60, 620), len: rand(30, 90), sp: rand(260, 420), a: rand(0.15, 0.4) };
  }

  update(dt) {
    this.age += dt;
    this.streaks.forEach((s, i) => {
      s.x += s.sp * dt;
      s.y -= s.sp * 0.18 * dt;
      if (s.x - s.len > 360) this.streaks[i] = this.make(false);
    });
    return !this.dead;
  }

  draw(ctx) {
    const k = Math.min(1, this.age / 0.6);
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.2;
    for (const s of this.streaks) {
      ctx.strokeStyle = `rgba(235,250,255,${s.a * k})`;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.len, s.y + s.len * 0.18);
      ctx.stroke();
    }
  }
}

// Thorny vines or jagged stone blades bursting out of the ground.
const SPIKE_COLORS = {
  vine: ['#3f9a3a', '#1f5a22', '#8fe060'], stone: ['#8a8f98', '#4f545e', '#e2e6ec'], ice: ['#bfefff', '#4fa8c8', '#ffffff'],
  crystal: ['#ffc0e0', '#c0508a', '#ffffff'], dark: ['#3a2a4a', '#140c1c', '#a080d0'], magma: ['#b8461c', '#5a1a08', '#ffd060'],
};

export class Spike extends Effect {
  constructor(x, y, style, life) {
    super('air', life);
    Object.assign(this, { x, y, style });
    this.blades = Array.from({ length: 4 }, () => ({ dx: rand(-9, 9), dy: rand(-3, 3), h: rand(16, 30), w: rand(4, 7), lean: rand(-0.35, 0.35) }))
      .sort((p, q) => p.dy - q.dy);
  }

  draw(ctx) {
    const t = this.age / this.life, grow = Math.min(1, this.age / 0.1), sink = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    const [fill, edge, ridge] = SPIKE_COLORS[this.style] ?? SPIKE_COLORS.stone;
    ctx.lineWidth = 1;
    for (const b of this.blades) {
      const h = b.h * grow * sink, bx = this.x + b.dx, by = this.y + b.dy, tx = bx + b.lean * h, ty = by - h;
      ctx.beginPath();
      ctx.moveTo(bx - b.w, by);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx + b.w, by);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = ridge;
      ctx.stroke();
    }
  }
}

// A meteor (draco) or boulder (rock) dropping from the sky onto (x, y), then calling onLand.
export class Falling extends Effect {
  constructor(x, y, dur, style, onLand, rgb = [255, 255, 255]) {
    super('air', dur);
    Object.assign(this, { x, y, style, onLand, rgb, h: 280, dx: ['draco', 'orb', 'raid-meteor'].includes(style) ? -70 : 0 });
  }

  update(dt) {
    this.age += dt;
    if (this.age < this.life) return true;
    this.onLand();
    return false;
  }

  draw(ctx) {
    const k = Math.min(1, this.age / this.life), e = k * k;
    const x = this.x + this.dx * (1 - e), y = this.y - this.h * (1 - e);
    ctx.globalAlpha = 0.25 * k;
    ctx.fillStyle = '#1d2433';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 4 + 8 * k, 2 + 3 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (this.style === 'orb' || this.style === 'star' || this.style === 'crystal') {
      const [R, G, B] = this.rgb;
      ctx.strokeStyle = `rgba(${R},${G},${B},0.5)`;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - this.dx * 0.4, y - 50);
      ctx.stroke();
      const r = ctx.createRadialGradient(x, y, 0, x, y, 12);
      r.addColorStop(0, '#ffffff');
      r.addColorStop(0.45, `rgba(${R},${G},${B},0.9)`);
      r.addColorStop(1, `rgba(${R},${G},${B},0)`);
      ctx.fillStyle = r;
      ctx.fillRect(x - 12, y - 12, 24, 24);
      if (this.style !== 'orb') {
        ctx.fillStyle = this.style === 'star' ? '#fff6b0' : '#ffd8ec';
        ctx.beginPath();
        const n = this.style === 'star' ? 5 : 4;
        for (let i = 0; i < n * 2; i++) {
          const rr = i % 2 ? 2.5 : 6, a = (i / (n * 2)) * Math.PI * 2 + this.age * 6;
          if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      }
    } else if (this.style === 'draco' || this.style === 'raid-meteor') {
      const large = this.style === 'raid-meteor', radius = large ? 20 : 12, tail = large ? 110 : 60;
      const g = ctx.createLinearGradient(x, y, x - this.dx * 0.5, y - tail);
      g.addColorStop(0, 'rgba(255,200,120,0.9)');
      g.addColorStop(1, 'rgba(160,80,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = large ? 17 : 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - this.dx * 0.5, y - tail);
      ctx.stroke();
      if (large) {
        ctx.strokeStyle = '#fff2be'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - this.dx * .22, y - 40); ctx.stroke();
        ctx.fillStyle = '#56353f'; ctx.beginPath();
        for (let i = 0; i < 7; i++) {
          const a = i * Math.PI * 2 / 7 + this.age * 4, rr = i % 2 ? 8 : 11;
          if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill();
      }
      const r = ctx.createRadialGradient(x, y, 0, x, y, radius);
      r.addColorStop(0, '#fff4d0');
      r.addColorStop(0.5, 'rgba(255,140,60,0.9)');
      r.addColorStop(1, 'rgba(160,60,255,0)');
      ctx.fillStyle = r;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    } else {
      ctx.fillStyle = '#7a7266';
      ctx.beginPath();
      ctx.ellipse(x, y, 7, 6, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b4ab9c';
      ctx.beginPath();
      ctx.ellipse(x - 2, y - 2, 3.5, 2.5, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3e3a34';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, 7, 6, 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// A projectile flying from (x0, y0) to (x1, y1), drawn at height z, calling onArrive when it lands.
export class Missile extends Effect {
  constructor(x0, y0, x1, y1, z, dur, style, onArrive, rgb = [255, 255, 255], scale = 1) {
    super('air', dur);
    Object.assign(this, { x0, y0, x1, y1, z, style, onArrive, rgb, scale });
    this.isProjectile = true; // frozen during cutscenes like real projectiles
  }

  update(dt) {
    this.age += dt;
    if (this.age < this.life) return true;
    this.onArrive();
    return false;
  }

  draw(ctx) {
    const k = Math.min(1, this.age / this.life);
    const x = this.x0 + (this.x1 - this.x0) * k, y = this.y0 + (this.y1 - this.y0) * k - this.z;
    const [R, G, B] = this.rgb;
    ctx.strokeStyle = `rgba(${R},${G},${B},0.45)`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - (this.x1 - this.x0) * 0.12, y - (this.y1 - this.y0) * 0.12);
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(this.scale, this.scale);
    if (this.style === 'shuriken') {
      ctx.rotate(this.age * 20);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? 3 : 9, a = (i / 8) * Math.PI * 2;
        if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.moveTo(r, 0);
      }
      ctx.closePath();
      ctx.fillStyle = '#9fd8ff';
      ctx.fill();
      ctx.strokeStyle = '#2a6ac8';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 13);
      g.addColorStop(0, `rgba(${R},${G},${B},0.95)`);
      g.addColorStop(1, `rgba(${R},${G},${B},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(-13, -13, 26, 26);
      ctx.fillStyle = this.style === 'ghost' ? '#24122e' : '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// A wall of water sweeping across the whole arena from y0 to y1.
export class TidalWave extends Effect {
  constructor(y0, y1, dur, rgb = [70, 140, 230], foam = false) {
    super('air', dur);
    Object.assign(this, { y0, y1, rgb: rgb.join(','), foam });
  }

  get y() {
    return this.y0 + (this.y1 - this.y0) * Math.min(1, this.age / this.life);
  }

  draw(ctx) {
    const y = this.y, dir = Math.sign(this.y1 - this.y0) || 1, t = this.age / this.life;
    ctx.globalAlpha = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
    const g = ctx.createLinearGradient(0, y, 0, y - dir * 70);
    g.addColorStop(0, `rgba(${this.rgb},0.85)`);
    g.addColorStop(1, `rgba(${this.rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.min(y, y - dir * 70), 360, 70);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = 0; x <= 360; x += 8) {
      const chop = this.foam ? Math.sin(x * .21 - this.age * 11) * 2 : 0;
      const wy = y - dir * (6 + Math.sin(x * 0.08 + this.age * 18) * 4 + chop);
      if (x) ctx.lineTo(x, wy);
      else ctx.moveTo(x, wy);
    }
    ctx.stroke();
    if (this.foam) {
      const alpha = ctx.globalAlpha, step = quality().particles > 500 ? 12 : 24;
      // Broken foam patches and spray, rather than parallel ornamental wave lines.
      ctx.globalAlpha = alpha * .85; ctx.fillStyle = '#e4f8ff';
      for (let x = 0; x < 360; x += step) {
        const wave = Math.sin(x * .16 + this.age * 18), crest = y - dir * (7 + wave * 4);
        ctx.fillRect(x, crest, 5 + wave * 2, 3);
        ctx.globalAlpha = alpha * .4;
        ctx.fillRect(x + 3, crest - dir * (6 + Math.sin(x * .31) * 4), 8 + wave * 3, 2);
        ctx.globalAlpha = alpha * .85;
        ctx.fillRect(x + 5, crest - dir * (12 + 9 * Math.sin(x * .3 + this.age * 9)), 2, 3);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// Gardevoir's moon hanging in the sky above the arena.
export class Moon extends Effect {
  constructor(x, y, life) {
    super('air', life);
    Object.assign(this, { x, y });
  }

  draw(ctx) {
    const t = this.age / this.life, grow = Math.min(1, this.age / 0.35), a = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
    const r = 26 * grow;
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r * 2.4);
    g.addColorStop(0, `rgba(255,190,225,${0.8 * a})`);
    g.addColorStop(1, 'rgba(255,150,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(this.x - r * 2.4, this.y - r * 2.4, r * 4.8, r * 4.8);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#fff4fa';
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(240,170,205,0.6)';
    for (const [dx, dy, cr] of [[-8, -6, 5], [7, 4, 6], [-3, 10, 3]]) {
      ctx.beginPath();
      ctx.arc(this.x + dx * grow, this.y + dy * grow, cr * grow, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// Psychic tether: a wavy, sparkling line of light from one Pokémon to the one it's holding.
export class Tether extends Effect {
  constructor(a, b, life, rgb = [230, 150, 255]) {
    super('air', life);
    Object.assign(this, { a, b, rgb });
  }

  draw(ctx) {
    const { a, b } = this, t = this.age / this.life;
    const fade = Math.min(1, this.age / 0.1) * (t > 0.85 ? (1 - t) / 0.15 : 1);
    const x0 = a.x, y0 = a.y - a.bodyZ, x1 = b.x, y1 = b.y - b.bodyZ;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const [R, G, B] = this.rgb;
    const at = k => {
      const w = Math.sin(k * 10 - this.age * 16) * 4 * Math.sin(Math.PI * k);
      return [x0 + dx * k + nx * w, y0 + dy * k + ny * w];
    };
    for (let s = 0; s <= len; s += 3.5) {
      const [x, y] = at(s / len), tw = 0.5 + 0.5 * Math.sin(s * 0.8 + this.age * 22);
      ctx.fillStyle = tw > 0.85 ? `rgba(255,255,255,${fade})` : `rgba(${R},${G},${B},${fade * (0.45 + 0.5 * tw)})`;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    // Sparkles travelling along the line toward the held Pokémon.
    ctx.strokeStyle = `rgba(255,255,255,${fade})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const [x, y] = at((this.age * 1.6 + i / 3) % 1), r = 3;
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.stroke();
    }
  }
}

// A boulder torn out of the ground by telekinesis: rises, hangs in the air, then flies at a target.
export class FloatingRock extends Effect {
  constructor(x, y, size) {
    super('air', 99);
    this.isProjectile = true; // frozen during cutscenes
    const verts = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, r = size * rand(0.75, 1.1);
      verts.push([Math.cos(a) * r, Math.sin(a) * r * 0.8]);
    }
    Object.assign(this, { x, y, z: 0, size, verts, hover: rand(26, 44), seed: rand(0, 6), fly: null });
  }

  throwAt(target, dur, onHit) {
    this.fly = { target, t: 0, dur, x: this.x, y: this.y, z: this.z, onHit };
  }

  update(dt) {
    this.age += dt;
    if (this.dead) return false;
    const f = this.fly;
    if (!f) {
      this.z = Math.min(this.hover, this.z + dt * 110);
      return true;
    }
    f.t += dt;
    const k = Math.min(1, f.t / f.dur), tg = f.target;
    this.x = f.x + (tg.x - f.x) * k;
    this.y = f.y + (tg.y - f.y) * k;
    this.z = f.z + (tg.bodyZ - f.z) * k;
    if (k < 1) return true;
    f.onHit();
    return false;
  }

  draw(ctx) {
    const s = this.size, bob = this.fly ? 0 : Math.sin(this.age * 3 + this.seed) * 2;
    ctx.fillStyle = `rgba(0,0,0,${0.3 * Math.max(0.3, 1 - this.z / 120)})`;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, s * 0.9, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    const cx = this.x, cy = this.y - this.z - s * 0.4 + bob;
    ctx.beginPath();
    this.verts.forEach(([vx, vy], i) => (i ? ctx.lineTo(cx + vx, cy + vy) : ctx.moveTo(cx + vx, cy + vy)));
    ctx.closePath();
    ctx.fillStyle = '#8c7a66';
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,200,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,220,0.35)';
    ctx.fillRect(cx - s * 0.4, cy - s * 0.45, s * 0.5, s * 0.25);
  }
}

// A translucent psychic sphere that swells out from (x, y) over the whole arena.
export class PsyDome extends Effect {
  constructor(x, y, r1, life, rgb = [170, 90, 255]) {
    super('air', life);
    Object.assign(this, { x, y, r1, rgb: rgb.join(',') });
  }

  draw(ctx) {
    const t = this.age / this.life, g0 = Math.min(1, t / 0.55), r = this.r1 * (1 - (1 - g0) * (1 - g0));
    const a = t > 0.55 ? 1 - (t - 0.55) / 0.45 : 1;
    if (r < 1) return;
    const g = ctx.createRadialGradient(this.x, this.y - r * 0.25, r * 0.05, this.x, this.y, r);
    g.addColorStop(0, `rgba(255,200,255,${0.06 * a})`);
    g.addColorStop(0.75, `rgba(${this.rgb},${0.22 * a})`);
    g.addColorStop(1, `rgba(245,210,255,${0.55 * a})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,235,255,${0.85 * a})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}
