import { Effect } from './effects.js';
import { TYPE_COLORS } from './data/types.js';

const TAU = Math.PI * 2;
const WHITE = '#fff9e7';
const OUTLINE = '#201c37';
const colorsFor = type => TYPE_COLORS[type]?.[0] ?? TYPE_COLORS.normal[0];
const clamp01 = value => Math.max(0, Math.min(1, value));
const easeOut = p => 1 - (1 - p) ** 3;

// The pressure at the contact point releases as the beam tips start to separate.
export const BEAM_CLASH_HOLD = 0.09;

export class ClashImpact extends Effect {
  constructor(x, y, z, { a, b, colors, winner, kind, angle, color, span }) {
    const beam = kind === 'beam';
    super('air', beam ? 0.58 : 0.36);
    this.x = x;
    this.y = y - z;
    this.colors = colors ?? [colorsFor(a), colorsFor(b)];
    this.direction = winner === 'a' ? 1 : winner === 'b' ? -1 : 0;
    this.kind = kind;
    this.angle = angle;
    this.color = color ?? WHITE;
    this.span = span ?? 30;
  }

  draw(ctx) {
    const beam = this.kind === 'beam';
    const hold = beam ? BEAM_CLASH_HOLD : 0.045;
    const charge = clamp01(this.age / hold);
    const release = clamp01((this.age - hold) / (this.life - hold));

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.lineCap = 'round';
    if (beam) this.drawPressure(ctx, charge, release);
    if (this.kind === 'spin') this.drawDeflection(ctx, release);
    else if (this.kind === 'block' && this.direction > 0) this.drawBlock(ctx, release);
    else this.drawShockfront(ctx, release, beam);
    this.drawFragments(ctx, release, beam);
    this.drawCore(ctx, charge, release, beam);
    ctx.restore();
  }

  drawPressure(ctx, charge, release) {
    const opacity = (1 - clamp01(release * 4.5)) * (0.48 + 0.52 * charge);
    if (!opacity) return;
    // Slanted bands race in along each beam and tighten around the contact point.
    const reach = Math.min(62, this.span * 0.8);
    for (const [i, side] of [-1, 1].entries()) {
      for (let band = 0; band < 3; band++) {
        const phase = (this.age * 7 + band / 3) % 1;
        const x = side * (8 + (1 - phase) * reach);
        const width = 7 + (1 - phase) * 10;
        const alpha = opacity * Math.sin(phase * Math.PI);
        ctx.beginPath();
        ctx.moveTo(x - side * 7, -width);
        ctx.quadraticCurveTo(x + side * 5, 0, x - side * 7, width);
        this.strokeEdge(ctx, this.colors[i], 2.5, alpha);
      }
    }

    // Two colors orbit the same core while neither beam has broken away.
    const radius = 10 + charge * 7;
    const rotation = this.age * 15;
    for (let i = 0; i < 2; i++) {
      const start = rotation + i * Math.PI;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 0.84, radius * 1.36, 0, start, start + Math.PI * 0.73);
      this.strokeEdge(ctx, this.colors[i], 3, opacity);
    }
  }

  drawShockfront(ctx, release, beam) {
    if (!release) return;
    const travel = easeOut(release);
    const size = beam ? 1.42 : 0.9;
    const reach = beam ? Math.min(71, this.span * 0.88) : 30;
    for (const [i, side] of [-1, 1].entries()) {
      const leading = this.direction === side;
      const opposing = this.direction && !leading;
      const color = this.colors[this.direction ? 1 - i : i];
      const strength = opposing ? 0.54 : 0.94;
      for (let ring = 0; ring < (beam ? 2 : 1); ring++) {
        const ripple = ring ? clamp01((release - 0.12) / 0.88) : release;
        if (!ripple) continue;
        const sweep = ring ? easeOut(ripple) * 0.68 : travel;
        const x = side * (6 + sweep * (leading ? reach : opposing ? reach * 0.24 : reach * 0.55));
        const height = (9 + sweep * (leading ? 21 : 24)) * size;
        const alpha = (1 - ripple) ** 1.75 * strength * (ring ? 0.55 : 1);
        ctx.beginPath();
        ctx.moveTo(x - side * 12 * size, -height);
        ctx.quadraticCurveTo(x + side * 14 * size, 0, x - side * 12 * size, height);
        this.strokeEdge(ctx, color, (leading ? 5.4 : 3.4) * (1 - ripple * 0.7), alpha);
      }
    }
  }

  drawFragments(ctx, release, beam) {
    if (!release) return;
    const travel = easeOut(release);
    const count = beam ? 14 : 9;
    for (let i = 0; i < count; i++) {
      const a = i * TAU / count + (i % 3 - 1) * 0.13;
      const d = 8 + travel * (24 + i % 5 * (beam ? 9 : 5));
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const x = dx * d + this.direction * travel * (beam ? 25 : 15);
      const y = dy * d;
      const length = (1 - release) * (7 + i % 4 * 5);
      const width = (1 - release) * (i % 3 === 0 ? 3.6 : 1.9);
      ctx.globalAlpha = (1 - release) ** 1.6;
      ctx.fillStyle = i % 3 === 0 ? this.color : this.colors[i % 2];
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - dx * length * 0.42 - dy * width, y - dy * length * 0.42 + dx * width);
      ctx.lineTo(x - dx * length, y - dy * length);
      ctx.lineTo(x - dx * length * 0.42 + dy * width, y - dy * length * 0.42 - dx * width);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawBlock(ctx, release) {
    const travel = easeOut(release);
    const height = 15 + travel * 15;
    const x = 4 + travel * 8;
    ctx.beginPath();
    ctx.moveTo(x - 12, -height);
    ctx.quadraticCurveTo(x + 22, 0, x - 12, height);
    this.strokeEdge(ctx, this.colors[0], 5 - release * 3, (1 - release) ** 1.5);
  }

  drawDeflection(ctx, release) {
    const travel = easeOut(release);
    for (let i = 0; i < 2; i++) {
      const radius = 11 + i * 7 + travel * 22;
      const start = -2.9 + travel * 2.8;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * 0.72, 0, start, start + 2.5 - travel * 0.7);
      this.strokeEdge(ctx, i ? this.colors[1] : '#9feaff', i ? 2.8 : 4.2, (1 - release) ** 1.4);
    }
  }

  drawCore(ctx, charge, release, beam) {
    const fade = 1 - clamp01(release * 3.5);
    if (!fade) return;
    const burst = Math.sin(clamp01(release * 4.5) * Math.PI);
    const radius = (beam ? 10 : 7) + charge * 3 + burst * (beam ? 8 : 4);
    ctx.globalAlpha = fade * 0.42;
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.08, radius * 1.42, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = fade * 0.88;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.68, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#fffdf4';
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.quadraticCurveTo(0, -radius * 0.2, 0, -radius * 1.52);
    ctx.quadraticCurveTo(radius * 0.2, 0, radius, 0);
    ctx.quadraticCurveTo(0, radius * 0.2, 0, radius * 1.52);
    ctx.quadraticCurveTo(-radius * 0.2, 0, -radius, 0);
    ctx.fill();
  }

  strokeEdge(ctx, color, width, alpha) {
    ctx.globalAlpha = alpha * 0.72;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = width + 2.7;
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.82;
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = Math.min(1.35, width * 0.42);
    ctx.stroke();
  }
}
