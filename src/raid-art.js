import { loadImage } from './assets.js';
import { quality } from './quality.js';

const images = new Map(), pending = new Map();
export function preloadRaidArt(id) {
  if (id !== 'mewtwo') return Promise.resolve();
  if (!pending.has(id)) pending.set(id, loadImage(`/art/raid-${id}.png`).then(image => images.set(id, image)).catch(() => { pending.delete(id); }));
  return pending.get(id);
}

export function bossMouth(boss, toward) {
  const angle = toward ? Math.atan2(toward.y - boss.y, toward.x - boss.x) : Math.PI / 2 - boss.dir * Math.PI / 4;
  const mouth = boss.species.mouth ?? { fwd: boss.radius * .4, z: boss.species.headZ * .75 };
  // Lugia's Shoot sheet holds its beak above its chest; its ordinary move origin sits too low.
  const height = boss.boss === 'lugia' ? boss.species.headZ + 4 * (boss.drawScale ?? 1) : mouth.z;
  return { x: boss.x + Math.cos(angle) * mouth.fwd, y: boss.y + Math.sin(angle) * mouth.fwd - height - boss.lift };
}

export function drawRaidSigil(ctx, id, x, y, size, time, alpha = 1, tilt = 1) {
  if (id !== 'mewtwo') return;
  const image = images.get(id);
  if (!image) return;
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, tilt); ctx.rotate(time * (id === 'mewtwo' ? -.8 : .55));
  ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  ctx.restore();
}

// Open gusts and spray gather around the body without a flat portal sprite.
export function drawNaturalCharge(ctx, boss, age, power = 1, focused = false, alpha = 1) {
  const ray = boss.boss === 'rayquaza', point = focused ? bossMouth(boss) : { x: boss.x, y: boss.y - boss.bodyZ };
  ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 1;
  const count = quality().particles > 500 ? 6 : 3;
  for (let i = 0; i < count; i++) {
    const t = (age * 1.6 + i / count) % 1, side = i % 2 ? 1 : -1;
    const x = point.x + side * (8 + (1 - t) * boss.radius), y = point.y + 24 - t * 52;
    ctx.globalAlpha = alpha * (.12 + .25 * power) * Math.sin(t * Math.PI);
    ctx.strokeStyle = ray ? '#c6d5d0' : '#c3e8f4';
    ctx.beginPath(); ctx.moveTo(x + side * 9, y + 14);
    ctx.quadraticCurveTo(x - side * 7, y + 4, x - side * 11, y - 12); ctx.stroke();
  }
  if (focused) {
    const r = 5 + 9 * power, glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, r);
    glow.addColorStop(0, `rgba(230,248,255,${alpha * .7})`);
    glow.addColorStop(.3, `rgba(${ray ? '120,224,177' : '135,203,240'},${alpha * .32})`);
    glow.addColorStop(1, 'rgba(160,220,245,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = glow; ctx.fillRect(point.x-r, point.y-r, r*2, r*2);
  }
  ctx.restore();
}

// A short, attached beam: the source follows the mouth instead of the floor or a stale position.
export class LegendaryBeam {
  constructor(boss, x, y, color, width = 20, life = .55) {
    Object.assign(this, { boss, x, y, color, width, life, age: 0, layer: 'air' });
  }
  update(dt) { this.age += dt; return this.age < this.life && this.boss.alive && !this.boss.hidden; }
  draw(ctx) {
    const p = this.age / this.life, origin = bossMouth(this.boss, this), reveal = Math.min(1, this.age / .06);
    const x = origin.x + (this.x - origin.x) * reveal, y = origin.y + (this.y - origin.y) * reveal;
    const width = this.width * Math.min(1, this.age / .045) * Math.min(1, (1 - p) * 5);
    ctx.save(); const fade = Math.min(1, (1 - p) * 4);
    const core = this.boss.boss === 'rayquaza' ? '#d0ffe4' : this.boss.boss === 'lugia' ? '#c7efff' : '#e6caff';
    const dx = x - origin.x, dy = y - origin.y, distance = Math.hypot(dx, dy) || 1, nx = -dy / distance, ny = dx / distance;
    for (const [scale, color, alpha] of [[1.18, '#38214f', .35], [1, this.color, .8], [.55, core, .95], [.22, '#ffffff', 1]]) {
      const mouthWidth = Math.min(10, width * .22) * scale, endWidth = width * .5 * scale;
      ctx.globalAlpha = fade * alpha; ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(origin.x + nx * mouthWidth, origin.y + ny * mouthWidth);
      ctx.lineTo(x + nx * endWidth, y + ny * endWidth);
      ctx.lineTo(x - nx * endWidth, y - ny * endWidth);
      ctx.lineTo(origin.x - nx * mouthWidth, origin.y - ny * mouthWidth);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = fade;
    if (this.boss.boss === 'mewtwo' && quality().particles > 500) {
      ctx.strokeStyle = this.color; ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const t = (p * 2 + i / 4) % 1, cx = origin.x + dx * t, cy = origin.y + dy * t;
        ctx.beginPath(); ctx.ellipse(cx, cy, width * .8, width * .18, Math.atan2(dy, dx) + Math.PI / 2, 0, Math.PI * 2); ctx.stroke();
      }
    }
    drawRaidSigil(ctx, this.boss.boss, origin.x, origin.y, Math.min(44, 18 + width * .35), this.age * 5, .65);
    ctx.restore();
  }
}

export class RaidBurst {
  constructor(id, x, y, size = 90, z = 0) {
    Object.assign(this, { id, x, y, size, z, age: 0, life: .6, layer: 'air' });
  }
  update(dt) { this.age += dt; return this.age < this.life; }
  draw(ctx) {
    const p = this.age / this.life;
    drawRaidSigil(ctx, this.id, this.x, this.y - this.z, this.size * (.3 + Math.sin(Math.min(1, p * 2) * Math.PI / 2)), this.age * 2, 1 - p * p);
  }
}
