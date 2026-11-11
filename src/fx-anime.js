// Anime-style punctuation for moves: impact frames, focus (concentration) lines, speed lines and smears.
//
//   ImpactFrame   the hit moment: for two frames the picture inverts (as in anime impact frames) and a black-and-white
//                 starburst slams out of the hit point, then rings off. Honours prefers-reduced-motion (no inversion).
//   FocusLines    concentration lines rushing in toward a point while a big move winds up.
//   SpeedLines    streaks pouring past a Pokémon as it dashes.
//   Smear         a solid crescent smear for a melee swing, thick at the front and tapering behind.
import { Effect, rand } from './effects.js';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const BIG = 4000; // larger than any view, for full-screen fills in world space

export class ImpactFrame extends Effect {
  constructor(x, y, strength = 1, color = '#ffffff') {
    super('top', 0.16 + 0.04 * strength);
    Object.assign(this, { x, y, strength, color, invert: !reducedMotion() });
    const n = 14 + Math.round(strength * 6);
    this.spikes = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2 + rand(-0.12, 0.12), r: rand(0.55, 1) }));
  }

  draw(ctx) {
    const t = this.age, s = this.strength, R = 70 + 40 * s;
    ctx.save();
    // Frames 1–2: the whole picture inverts.
    if (this.invert && t < 0.034) {
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-BIG, -BIG, BIG * 2, BIG * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    // The starburst: black spikes behind, white spikes in front, both snapping outward and fading.
    const k = Math.min(1, t / 0.05), fade = t < 0.06 ? 1 : Math.max(0, 1 - (t - 0.06) / (this.life - 0.06));
    for (const [col, scale, alpha] of [['#000000', 1.15, 0.55], [this.color, 1, 0.95]]) {
      ctx.globalAlpha = alpha * fade;
      ctx.fillStyle = col;
      ctx.beginPath();
      // Bold wedges: a wide base around the core tapering to a sharp tip.
      this.spikes.forEach((p, i) => {
        const r = R * p.r * scale * (0.4 + 0.6 * k), w = 0.2 * scale, b = 14 * scale;
        const x0 = this.x + Math.cos(p.a - w) * b, y0 = this.y + Math.sin(p.a - w) * b * 0.8;
        const x1 = this.x + Math.cos(p.a) * r, y1 = this.y + Math.sin(p.a) * r * 0.8;
        const x2 = this.x + Math.cos(p.a + w) * b, y2 = this.y + Math.sin(p.a + w) * b * 0.8;
        if (i === 0) ctx.moveTo(x0, y0);
        else ctx.lineTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
      });
      ctx.closePath();
      ctx.fill();
    }
    // A hard white core and a ring snapping out.
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 10 + 8 * s * (1 - k * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, R * 0.7 * k, R * 0.55 * k, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// Concentration lines: thin wedges rushing in from the edge of view toward (x, y), redrawn every frame.
export class FocusLines extends Effect {
  constructor(x, y, life = 0.35, color = '#ffffff', { inner = 60, outer = 320, n = 26, follow = null } = {}) {
    super('top', life);
    Object.assign(this, { x, y, color, inner, outer, n, follow });
  }

  draw(ctx) {
    const t = this.age / this.life, a = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
    const cx = this.follow ? this.follow.x : this.x, cy = this.follow ? this.follow.y - this.follow.bodyZ : this.y;
    ctx.save();
    ctx.globalAlpha = 0.55 * a;
    ctx.fillStyle = this.color;
    for (let i = 0; i < this.n; i++) {
      const ang = rand(0, Math.PI * 2), r0 = this.inner * rand(0.9, 1.4), w = rand(0.006, 0.02);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang - w) * this.outer, cy + Math.sin(ang - w) * this.outer);
      ctx.lineTo(cx + Math.cos(ang + w) * this.outer, cy + Math.sin(ang + w) * this.outer);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

// Speed lines pouring backward past a dashing Pokémon.
export class SpeedLines extends Effect {
  constructor(mon, ang, life = 0.25, color = '#ffffff') {
    super('air', life);
    Object.assign(this, { mon, ang, color });
  }

  draw(ctx) {
    const m = this.mon, t = this.age / this.life, c = Math.cos(this.ang), s = Math.sin(this.ang), nx = -s, ny = c;
    ctx.save();
    ctx.globalAlpha = 0.7 * (1 - t);
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const off = rand(-m.radius * 1.4, m.radius * 1.4), back = rand(14, 30), len = rand(26, 60);
      const x = m.x + nx * off - c * back, y = m.y - m.bodyZ + ny * off * 0.7 - s * back;
      ctx.lineWidth = rand(1, 2.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - c * len, y - s * len);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// A solid crescent for a swing: a filled moon shape between two arcs, sweeping in over the first frames.
export class Smear extends Effect {
  constructor(x, y, z, ang, { radius = 26, spread = 2.4, width = 9, colors = ['#ffffff', '#ffd0a0'], life = 0.2, mirror = false } = {}) {
    super('air', life);
    Object.assign(this, { x, y, z, ang, radius, spread, width, colors, mirror });
  }

  draw(ctx) {
    const t = this.age / this.life, sweep = Math.min(1, this.age / 0.06), dir = this.mirror ? -1 : 1;
    const a0 = this.ang - (this.spread / 2) * dir, a1 = a0 + this.spread * sweep * dir;
    const cx = this.x, cy = this.y - this.z, R = this.radius, w = this.width * (1 - t * 0.5);
    ctx.save();
    ctx.globalAlpha = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
    for (const [col, k] of [[this.colors[1], 1], [this.colors[0], 0.45]]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy, R + w * k * 0.5, a0, a1, dir < 0);
      ctx.arc(cx + Math.cos((a0 + a1) / 2) * w * k * 0.6, cy + Math.sin((a0 + a1) / 2) * w * k * 0.6, R - w * k * 0.2, a1, a0, dir > 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
