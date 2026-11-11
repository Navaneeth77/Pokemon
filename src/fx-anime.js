// Anime-style punctuation for moves, drawn as pixel art: every shape lands on whole art pixels with hard edges,
// and fades by dithering (pixel.js).
//
//   ImpactFrame   the hit moment: for two frames the picture inverts (as in anime impact frames) and a manga
//                 starburst — black outline, colour, white heart — slams out of the hit point and rings off.
//                 Honours prefers-reduced-motion (no inversion).
//   FocusLines    concentration lines rushing in toward a point while a big move winds up.
//   SpeedLines    streaks pouring past a Pokémon as it dashes.
//   Smear         a solid crescent smear for a melee swing.
import { Effect, rand } from './effects.js';
import { pixelLine, pixelPoly, pixelRing, circlePts } from './pixel.js';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const BIG = 4000; // larger than any view, for full-screen fills in world space

export class ImpactFrame extends Effect {
  constructor(x, y, strength = 1, color = '#ffffff') {
    super('top', 0.16 + 0.04 * strength);
    Object.assign(this, { x: Math.round(x), y: Math.round(y), strength, color, invert: !reducedMotion() });
    const n = 12 + Math.round(strength * 4);
    this.spikes = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2 + rand(-0.12, 0.12), r: rand(0.55, 1) }));
  }

  spike(p, R, scale, k) {
    const r = R * p.r * scale * (0.4 + 0.6 * k), w = 0.22, b = 9 * scale;
    return [
      [this.x + Math.cos(p.a - w) * b, this.y + Math.sin(p.a - w) * b * 0.8],
      [this.x + Math.cos(p.a) * r, this.y + Math.sin(p.a) * r * 0.8],
      [this.x + Math.cos(p.a + w) * b, this.y + Math.sin(p.a + w) * b * 0.8],
    ];
  }

  draw(ctx) {
    const t = this.age, s = this.strength, R = 34 + 18 * s;
    // Frames 1–2: the whole picture inverts.
    if (this.invert && t < 0.034) {
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-BIG, -BIG, BIG * 2, BIG * 2);
      ctx.restore();
    }
    const k = Math.min(1, t / 0.05), a = t < 0.07 ? 1 : Math.max(0, 1 - (t - 0.07) / (this.life - 0.07));
    // Black outline, the type's colour, then a white heart — each a set of hard-edged spikes.
    for (const [col, scale] of [['#000000', 1.18], [this.color, 1], ['#ffffff', 0.55]]) {
      ctx.fillStyle = col;
      for (const p of this.spikes) pixelPoly(ctx, this.spike(p, R, scale, k), a);
    }
    ctx.fillStyle = '#ffffff';
    pixelPoly(ctx, circlePts(this.x, this.y, 5 + 4 * s * (1 - k * 0.5), (5 + 4 * s * (1 - k * 0.5)) * 0.85), a);
    ctx.fillStyle = this.color;
    pixelRing(ctx, this.x, this.y, R * 0.8 * k, R * 0.62 * k, 2, a * 0.9);
  }
}

// Concentration lines: stepped pixel lines rushing in from the edge of view toward (x, y), redrawn every frame.
export class FocusLines extends Effect {
  constructor(x, y, life = 0.35, color = '#ffffff', { inner = 60, outer = 320, n = 26, follow = null } = {}) {
    super('top', life);
    Object.assign(this, { x, y, color, inner, outer, n, follow });
  }

  draw(ctx) {
    const t = this.age / this.life, a = (t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8) * 0.8;
    const cx = this.follow ? this.follow.x : this.x, cy = this.follow ? this.follow.y - this.follow.bodyZ : this.y;
    ctx.fillStyle = this.color;
    for (let i = 0; i < this.n; i++) {
      const ang = rand(0, Math.PI * 2), r0 = this.inner * rand(0.9, 1.4), c = Math.cos(ang), s = Math.sin(ang);
      pixelLine(ctx, cx + c * r0, cy + s * r0, cx + c * this.outer, cy + s * this.outer, i % 4 === 0 ? 2 : 1, a);
    }
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
    ctx.fillStyle = this.color;
    for (let i = 0; i < 6; i++) {
      const off = rand(-m.radius * 1.4, m.radius * 1.4), back = rand(14, 30), len = rand(24, 54);
      const x = m.x + nx * off - c * back, y = m.y - m.bodyZ + ny * off * 0.7 - s * back;
      pixelLine(ctx, x, y, x - c * len, y - s * len, i % 3 === 0 ? 2 : 1, 0.85 * (1 - t));
    }
  }
}

// A solid crescent for a swing: outer colour with a white leading edge, sweeping in over the first frames.
export class Smear extends Effect {
  constructor(x, y, z, ang, { radius = 26, spread = 2.4, width = 9, colors = ['#ffffff', '#ffd0a0'], life = 0.2, mirror = false } = {}) {
    super('air', life);
    Object.assign(this, { x, y, z, ang, radius, spread, width, colors, mirror });
  }

  crescent(R, w, a0, a1) {
    const pts = [], n = 14, cx = this.x, cy = this.y - this.z, mid = (a0 + a1) / 2;
    for (let i = 0; i <= n; i++) {
      const ang = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + Math.cos(ang) * (R + w / 2), cy + Math.sin(ang) * (R + w / 2) * 0.85]);
    }
    // The inner edge is pulled toward the middle of the swing, so the smear is thickest at its centre.
    const ox = Math.cos(mid) * w * 0.6, oy = Math.sin(mid) * w * 0.6 * 0.85;
    for (let i = n; i >= 0; i--) {
      const ang = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + ox + Math.cos(ang) * (R - w * 0.2), cy + oy + Math.sin(ang) * (R - w * 0.2) * 0.85]);
    }
    return pts;
  }

  draw(ctx) {
    const t = this.age / this.life, sweep = Math.min(1, this.age / 0.06), dir = this.mirror ? -1 : 1;
    const a0 = this.ang - (this.spread / 2) * dir, a1 = a0 + this.spread * sweep * dir;
    const w = this.width * (1 - t * 0.5), a = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
    ctx.fillStyle = this.colors[1];
    pixelPoly(ctx, this.crescent(this.radius, w, a0, a1), a);
    ctx.fillStyle = this.colors[0];
    pixelPoly(ctx, this.crescent(this.radius + w * 0.25, w * 0.4, a0, a1), a);
  }
}

// A pixel-art glow: a disc whose coverage falls off toward its edge by dithering (no soft gradient).
export class PixelGlow extends Effect {
  constructor(x, y, z, r, color, life = 0.25) {
    super('air', life);
    Object.assign(this, { x: Math.round(x), y: Math.round(y), z, r, color });
  }

  draw(ctx) {
    const t = this.age / this.life, fade = 1 - t, cy = Math.round(this.y - this.z), R = Math.round(this.r * (1 + 0.3 * t));
    ctx.fillStyle = this.color;
    // Three rings of falling coverage: dense core, half, sparse rim.
    for (const [rr, a] of [[R, 0.25], [R * 0.66, 0.5], [R * 0.36, 0.9]]) pixelPoly(ctx, circlePts(this.x, cy, rr, rr * 0.85, 20), a * fade);
  }
}

// An expanding ring on whole pixels, fading by dithering.
export class PixelRing extends Effect {
  constructor(x, y, { z = 0, r0 = 4, r1 = 30, life = 0.35, color = '#ffffff', width = 2, layer = 'air' } = {}) {
    super(layer, life);
    Object.assign(this, { x, y, z, r0, r1, color, width });
  }

  draw(ctx) {
    const t = this.age / this.life, e = 1 - (1 - t) * (1 - t), r = this.r0 + (this.r1 - this.r0) * e;
    ctx.fillStyle = this.color;
    pixelRing(ctx, this.x, this.y - this.z, r, r * 0.75, Math.max(1, Math.round(this.width * (1 - t * 0.5))), 1 - t);
  }
}

// A jagged lightning bolt on whole pixels: a coloured outline around a white core.
export class PixelBolt extends Effect {
  constructor(x0, y0, x1, y1, life = 0.15, color = '#fff27a') {
    super('air', life);
    const pts = [[x0, y0]], n = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 8));
    for (let i = 1; i < n; i++) pts.push([x0 + ((x1 - x0) * i) / n + rand(-5, 5), y0 + ((y1 - y0) * i) / n + rand(-5, 5)]);
    pts.push([x1, y1]);
    Object.assign(this, { pts, color });
  }

  draw(ctx) {
    const a = 1 - this.age / this.life;
    for (const [col, w] of [[this.color, 3], ['#ffffff', 1]]) {
      ctx.fillStyle = col;
      for (let i = 1; i < this.pts.length; i++) pixelLine(ctx, ...this.pts[i - 1], ...this.pts[i], w, a);
    }
  }
}
