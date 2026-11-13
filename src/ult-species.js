import { drawBeamRings } from './beam-rings.js';
import { drawChargedSphere, drawOrbCore, ORBS, sphereContact } from './projectiles.js';
import { paintUltimate, ultimateArt } from './ultimate-art.js';
import { BOUNDS } from './arena.js';
import {
  Afterimage, Beam, BeamLine, Effect, FIRE, Glow, Missile, Moon, PsyDome, Ring, ScreenDim, SlashArc, debris, dustCloud, leafBurst, metalSparks, rand, waterSplash,
} from './effects.js';
import { sfx } from './audio.js';
import { glide, spray, through } from './ult-choreo.js';

const TAU = Math.PI * 2;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const lerp = (a, b, p) => a + (b - a) * p;
const point = (x, y) => ({
  x: clamp(x, BOUNDS.minX, BOUNDS.maxX),
  y: clamp(y, BOUNDS.minY, BOUNDS.maxY),
});

function face(action, user, target) {
  action.aim = user.aimAt(target);
  user.face(target.x, target.y);
}

const projectileArt = {
  dreepyDart: { name: 'dreepy', width: 21 },
  waterSnipe: { name: 'water-shot', width: 40, aspect: 0.48 },
  spiritArrow: { name: 'spirit-arrow', width: 25, aspect: 0.62 },
  auraSphere: { name: 'aura-sphere', width: 48, spin: 3 },
};

export class TrackingShot extends Missile {
  constructor(user, target, { duration, style, color, size = 1, bend = 0, height = user.bodyZ, offset = 0, origin, flight }, impact) {
    const heading = user.aimAt(target) + Math.PI / 2;
    const x = origin?.x ?? user.x + Math.cos(heading) * offset;
    const y = origin?.y ?? user.y - height + Math.sin(heading) * offset;
    super(x, y, target.x, target.y - target.bodyZ, 0, duration, style, impact, color, size);
    this.target = target;
    this.owner = user;
    this.action = user.action;
    this.bend = bend;
    this.flight = flight;
    this.lastFracture = 0;
    this.trail = style === 'pyroKick' || style === 'dreepyDart' ? [] : null;
    this.live = { x: this.x0, y: this.y0, z: 0, angle: user.aimAt(target) };
  }

  draw(ctx) {
    if (this.flight?.sphere) {
      drawChargedSphere(ctx, this.live.x, this.live.y, this.flight.radius, this.age, this.flight.sphere, this.live.angle);
      return;
    }
    if (this.style === 'pyroKick') {
      const { x, y, angle } = this.live;
      this.drawWake(ctx, hotStone, 6);
      drawPyroEmber(ctx, x, y, angle, this.age, 2.2, 1, true);
      return;
    }
    if (this.style === 'dreepyDart') this.drawWake(ctx, ['#473d66', '#689e9b', '#a8cebe'], 3);
    const style = projectileArt[this.style];
    if (!style) return super.draw(ctx);
    const { x, y, angle } = this.live;
    const spin = style.spin === undefined ? angle : this.age * style.spin;
    if (!paintUltimate(ctx, style.name, x, y, style.width * this.scale, { angle: spin, aspect: style.aspect })) {
      super.draw(ctx);
    }
  }

  drawWake(ctx, colors, width) {
    ctx.save();
    const count = this.trail.length;
    for (const [i, [x, y]] of this.trail.entries()) {
      const p = (i + 1) / count;
      const size = Math.max(1, Math.round(p * width));
      ctx.fillStyle = colors[Math.min(colors.length - 1, Math.floor(p * colors.length))];
      ctx.globalAlpha = p * 0.79;
      ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
    }
    ctx.restore();
  }

  update(dt) {
    if (this.dead || this.action?.cancelled || !this.owner.alive || this.owner.hidden || !this.target.alive || this.target.hidden) return false;
    if (this.trail) {
      if (this.trail.length === 7) this.trail.shift();
      this.trail.push([this.live.x, this.live.y]);
    }
    this.age += dt;
    const p = Math.min(1, this.age / this.life);
    const x = this.target.x, y = this.target.y - this.target.bodyZ;
    const angle = Math.atan2(y - this.y0, x - this.x0);
    const arc = Math.sin(Math.PI * p) * this.bend;
    let nextX = lerp(this.x0, x, p) - Math.sin(angle) * arc;
    let nextY = lerp(this.y0, y, p) + Math.cos(angle) * arc;
    if (this.flight) {
      const dx = nextX - this.live.x, dy = nextY - this.live.y;
      const step = Math.hypot(dx, dy), budget = Math.min(dt * this.flight.speed, this.flight.range - (this.distance ?? 0));
      const k = step ? Math.min(1, budget / step) : 0;
      nextX = this.live.x + dx * k;
      nextY = this.live.y + dy * k;
      this.distance = (this.distance ?? 0) + step * k;
      if (this.flight.fracture && this.distance - this.lastFracture > 28 && !this.action.game.headless) {
        this.lastFracture = this.distance;
        const g = this.action.game, groundY = nextY + lerp(this.owner.bodyZ, this.target.bodyZ, p);
        g.marks.fracture(nextX, groundY, 13, 4);
        dustCloud(g, nextX, groundY, 4, 3);
      }
    }
    this.live.angle = Math.atan2(nextY - this.live.y, nextX - this.live.x);
    Object.assign(this.live, { x: nextX, y: nextY });
    if (this.flight) {
      if (Math.hypot(nextX - x, nextY - y) <= this.flight.radius + this.target.radius * 0.6 && !this.target.untouchable) {
        this.onArrive(this.live);
        return false;
      }
      return this.distance < this.flight.range && this.age < this.life + 0.3;
    }
    if (p < 1) return true;
    this.onArrive(this.live);
    return false;
  }
}

// A train of rolling flame follows the kicked ember on its actual flight path.
class FireTrain extends Effect {
  constructor(origin, target, life) {
    super('ground', life);
    this.origin = origin;
    this.target = target;
  }

  draw(ctx) {
    const { origin, target } = this;
    const dx = target.x - origin.x, dy = target.y - origin.y;
    const angle = Math.atan2(dy, dx);
    const front = Math.min(1, this.age / 0.36);
    const tail = Math.max(0, front - 0.64 + Math.max(0, this.age - 0.36) * 2.8);
    if (tail >= front) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const p = front - i * 0.115;
      if (p <= tail) continue;
      const x = origin.x + dx * p, y = origin.y + dy * p;
      ctx.globalAlpha = Math.min(1, (p - tail) * 4);
      drawPyroEmber(ctx, x, y, angle, this.age + i * 0.14, 2.8 - i * 0.26, 1, true);
    }
    ctx.restore();
  }
}

class SkiddingEmber extends Effect {
  constructor(x, y, angle, distance, offset) {
    super('air', 0.62);
    Object.assign(this, { x, y, angle, distance, offset });
  }

  position(p) {
    const forward = this.distance * (1 - (1 - p) ** 2);
    const sideways = this.offset * Math.sin(p * Math.PI * 0.5);
    return point(this.x + Math.cos(this.angle) * forward - Math.sin(this.angle) * sideways,
      this.y + Math.sin(this.angle) * forward + Math.cos(this.angle) * sideways);
  }

  draw(ctx) {
    const p = this.age / this.life, head = this.position(p);
    ctx.save();
    for (let i = 4; i > 0; i--) {
      const tail = this.position(Math.max(0, p - i * 0.052));
      ctx.globalAlpha = (1 - p) * (1 - i * 0.16);
      drawPyroEmber(ctx, tail.x, tail.y - 2, this.angle, this.age + i * 0.04, 1.02 - i * 0.16, 0.8, true);
    }
    ctx.globalAlpha = 1 - p * p;
    drawPyroEmber(ctx, head.x, head.y - 3 - 8 * Math.abs(Math.sin(p * Math.PI * 3)) * (1 - p),
      this.angle, this.age, 1.08, 1, true);
    ctx.restore();
  }
}

function drawSteelPlate(ctx, x, y, angle, scale, light) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(-9, -3);
  ctx.lineTo(-3, -6);
  ctx.lineTo(7, -4);
  ctx.lineTo(10, 1);
  ctx.lineTo(3, 5);
  ctx.lineTo(-7, 4);
  ctx.closePath();
  ctx.fillStyle = '#53627a';
  ctx.fill();
  ctx.strokeStyle = '#333e51';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-9, -3);
  ctx.lineTo(-3, -6);
  ctx.lineTo(7, -4);
  ctx.lineTo(3, 1);
  ctx.lineTo(-6, 1);
  ctx.closePath();
  ctx.fillStyle = light;
  ctx.fill();
  ctx.restore();
}

class MeteorArmor extends Effect {
  constructor(user, aim) {
    super('air', 1.37);
    Object.assign(this, { user, aim });
  }

  socket() {
    const { user, aim } = this;
    return {
      x: user.x + Math.cos(aim) * 12 - Math.sin(aim) * 11,
      y: user.y + Math.sin(aim) * 12 + Math.cos(aim) * 11,
      z: user.bodyZ * 0.32,
    };
  }

  draw(ctx) {
    const socket = this.socket();
    ctx.save();
    ctx.globalAlpha *= Math.min(1, this.age * 8, (this.life - this.age) * 8);
    for (const [i, offset] of [0, -0.8, 0.8, 2.3].entries()) {
      const lock = clamp((this.age - 0.1 - i * 0.07) / 0.25, 0, 1);
      const radius = lerp(39, 5, 1 - (1 - lock) ** 2);
      const angle = this.aim + offset;
      drawSteelPlate(ctx, socket.x + Math.cos(angle) * radius,
        socket.y - socket.z + Math.sin(angle) * radius * 0.52,
        this.aim + offset * (1 - lock * 0.76), 0.7 + lock * 0.25,
        i % 2 ? '#a1b8cb' : '#d5e6f0');
    }
    ctx.restore();
  }
}

class BrokenMeteorArmor extends Effect {
  constructor(x, y, z, aim) {
    super('air', 0.64);
    Object.assign(this, { x, y, z, aim });
  }

  draw(ctx) {
    const p = this.age / this.life;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, (1 - p) * 4);
    for (let i = 0; i < 4; i++) {
      const angle = this.aim + (i - 1.5) * 0.69;
      const travel = (31 + i * 9) * (1 - (1 - p) ** 2);
      const fall = Math.max(0, 1 - p / 0.6);
      const bounce = Math.max(0, Math.sin((p - 0.6) * 12)) * (1 - p) * 16;
      const height = this.z * fall + (12 + i * 3) * Math.sin(Math.PI * fall) + bounce;
      const x = this.x + Math.cos(angle) * travel, y = this.y + Math.sin(angle) * travel;
      ctx.fillStyle = 'rgba(29,34,49,0.23)';
      ctx.beginPath(); ctx.ellipse(x, y, 5, 2, 0, 0, TAU); ctx.fill();
      drawSteelPlate(ctx, x, y - height, angle + p * (i % 2 ? 8 : -7), 0.62, '#b9ccdb');
    }
    ctx.restore();
  }
}

const drumEase = p => p * p * (3 - 2 * p);

class BattleDrum extends Effect {
  constructor(x, y) {
    super('ground', 1.42);
    Object.assign(this, { x, y, lastBeat: -1 });
  }

  draw(ctx) {
    const beat = drumEase(Math.max(0, 1 - (this.age - this.lastBeat) / 0.16));
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha *= Math.min(1, this.age * 14, (this.life - this.age) * 8);
    ctx.fillStyle = 'rgba(38,39,28,0.32)';
    ctx.beginPath(); ctx.ellipse(0, 4, 16, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#665039';
    ctx.fillRect(-13, -7, 26, 11);
    ctx.fillStyle = '#997751';
    for (const x of [-10, -4, 4, 10]) ctx.fillRect(x, -5, 2, 9);
    ctx.beginPath(); ctx.ellipse(0, -7 + beat * 1.5, 14, 6 - beat, 0, 0, TAU);
    ctx.fillStyle = '#c8aa71'; ctx.fill();
    ctx.save();
    ctx.globalAlpha *= beat;
    ctx.fillStyle = '#e7cb8e'; ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#54452e'; ctx.stroke();
    ctx.restore();
  }
}

const DRUM_WAVE_TRAVEL = 0.23;
const DRUM_RIPPLE_RETURN = 0.76;

class DrumWave extends Effect {
  constructor(source, target) {
    super('air', DRUM_WAVE_TRAVEL + 0.09);
    Object.assign(this, { source, target });
  }

  draw(ctx) {
    const p = Math.min(1, this.age / DRUM_WAVE_TRAVEL);
    const { source, target } = this;
    const heading = Math.atan2(target.y - source.y, target.x - source.x);
    ctx.save();
    ctx.translate(lerp(source.x, target.x, p), lerp(source.y - 7, target.y - target.z, p));
    ctx.rotate(heading);
    ctx.globalAlpha *= drumEase(Math.min(1, this.age / 0.065, (this.life - this.age) / 0.12));
    for (const [i, color] of ['#e9f4bc', '#acd071', '#739955'].entries()) {
      const width = 13 + p * 10 + i * 3;
      const offset = -i * (5 + p * 5);
      ctx.beginPath();
      ctx.moveTo(offset - 8, -width);
      ctx.quadraticCurveTo(offset + 11, 0, offset - 8, width);
      ctx.strokeStyle = color;
      ctx.lineWidth = i === 0 ? 3 : 2;
      ctx.stroke();
    }
    ctx.restore();
  }
}

class GrassPulse extends Effect {
  constructor(x, y) {
    super('ground', 1.28);
    Object.assign(this, { x, y });
  }

  radiusAt(age) {
    if (age < 0.36) return lerp(5, 75, drumEase(age / 0.36));
    if (age < DRUM_RIPPLE_RETURN) return lerp(75, 5, drumEase((age - 0.36) / (DRUM_RIPPLE_RETURN - 0.36)));
    return lerp(5, 96, drumEase(Math.min(1, (age - DRUM_RIPPLE_RETURN) / 0.52)));
  }

  draw(ctx) {
    const r = this.radiusAt(this.age);
    // Let the trailing rings swing around the lead ring as the wave turns.
    const reverse = drumEase(Math.max(0, Math.min(1, (this.age - 0.29) / 0.14)));
    const rebound = drumEase(Math.max(0, Math.min(1, (this.age - 0.7) / 0.14)));
    const trailSide = 2 * (reverse - rebound) - 1;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha *= drumEase(Math.min(1, this.age / 0.09, (this.life - this.age) / 0.34));
    for (const [i, color] of ['#e4f1a9', '#a7ce72', '#668a48'].entries()) {
      const radius = r + trailSide * i * Math.min(8, r * 0.25);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.strokeStyle = color;
      ctx.lineWidth = i === 1 ? 3 : 2;
      ctx.stroke();
    }
    for (let i = 0; i < 23; i++) {
      const angle = i * TAU / 23 + this.age * 1.35;
      const radius = Math.max(2, r + trailSide * (i % 4) * 3);
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      const lean = Math.cos(angle) * (-6 * trailSide);
      ctx.beginPath();
      ctx.moveTo(x - 2, y + 1);
      ctx.quadraticCurveTo(x + lean - 3, y - 3, x + lean, y - 7 - i % 4);
      ctx.quadraticCurveTo(x + lean + 2, y - 2, x + 2, y + 1);
      ctx.fillStyle = i % 2 ? '#8fb360' : '#c6de8c';
      ctx.fill();
    }
    ctx.restore();
  }
}

function embersAlong(g, from, target) {
  const dx = target.x - from.x, dy = target.y - from.y;
  const angle = Math.atan2(dy, dx);
  for (let i = 1; i <= 8; i++) {
    const p = i / 9;
    g.particles.spawn({
      x: lerp(from.x, target.x, p), y: lerp(from.y, target.y, p), z: 2,
      vx: Math.cos(angle) * rand(15, 50), vy: Math.sin(angle) * rand(15, 50),
      vz: rand(23, 66), gz: 100, life: rand(0.22, 0.5), size: rand(1, 4), sizeEnd: 1, colors: hotStone,
    });
  }
}

class RootRun extends Effect {
  constructor(user, target, offset, duration, height) {
    super('air', duration);
    Object.assign(this, { x: user.x, y: user.y, target, offset, height });
  }

  draw(ctx) {
    const p = Math.min(1, this.age / this.life);
    const dx = this.target.x - this.x, dy = this.target.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const t = p * i / 12, off = Math.sin(t * Math.PI) * this.offset;
      const x = this.x + dx * t - dy / len * off;
      const y = this.y + dy * t + dx / len * off - Math.sin(t * Math.PI) * this.height * 0.6;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    for (const [color, width] of [['#29442b', 8], ['#6d9244', 5], ['#bed887', 1.4]]) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    }
    ctx.restore();
  }
}

class PressureJet extends Effect {
  constructor(action, target, duration, width) {
    super('air', duration);
    Object.assign(this, { action, target, width });
  }

  draw(ctx) {
    const { action, target: t } = this;
    const from = action.mouth();
    const dx = t.x - from.x, dy = t.y - t.bodyZ - (from.y - from.z);
    const length = Math.hypot(dx, dy);
    const front = Math.min(1, this.age / 0.18) * (length + 42);
    const fade = clamp((this.life - this.age) / 0.2, 0, 1);
    ctx.save();
    ctx.translate(from.x, from.y - from.z);
    ctx.rotate(Math.atan2(dy, dx));
    for (const [color, ratio] of [['#235898', 1.08], ['#429bdd', 0.88], ['#93dcff', 0.54], ['#eefeff', 0.22]]) {
      const width = this.width * ratio * fade;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -width * 0.17);
      ctx.quadraticCurveTo(front * 0.42, -width * 0.74, front, -width * 0.42);
      ctx.quadraticCurveTo(front + width * 0.3, 0, front, width * 0.42);
      ctx.quadraticCurveTo(front * 0.42, width * 0.74, 0, width * 0.17);
      ctx.fill();
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#c6f3ff';
    ctx.globalAlpha *= fade * 0.85;
    for (let i = 0; i < 12; i++) {
      const x = (this.age * 625 + i * 43) % Math.max(front, 1);
      const y = Math.sin(i * 8.7 + this.age * 10) * this.width * 0.39 * Math.min(1, x / 40);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, x - 12 - i % 4 * 5), y);
      ctx.lineTo(x, y + 1);
      ctx.lineWidth = 1 + i % 3;
      ctx.stroke();
    }
    ctx.restore();
    if (length) drawBeamRings(ctx, from.x, from.y - from.z, from.x + dx / length * front, from.y - from.z + dy / length * front, this.width, this.age, '#d5f5ff', fade);
  }
}

class AimLine extends Effect {
  constructor(action, target, life, color = '#9de5ff', ground = false) {
    super(ground ? 'ground' : 'air', life);
    Object.assign(this, { action, target, color, ground });
  }

  draw(ctx) {
    const { target: t, action: a } = this;
    const progress = this.age / this.life;
    const x = t.x, y = t.y - (this.ground ? 0 : t.bodyZ);
    const origin = a.mouth(), radius = 25 - 15 * progress;
    ctx.save();
    ctx.globalAlpha *= 0.35 + 0.5 * progress;
    const stroke = () => {
      ctx.strokeStyle = '#163345';
      ctx.lineWidth = this.ground ? 3 : 3.4;
      ctx.stroke();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y - (this.ground ? 0 : origin.z));
    ctx.lineTo(x, y);
    stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.ellipse(x, y, radius, this.ground ? radius * 0.45 : radius, 0, 0, TAU);
    stroke();
    if (!this.ground) for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * (radius - 3), y + Math.sin(angle) * (radius - 3));
      ctx.lineTo(x + Math.cos(angle) * (radius + 6), y + Math.sin(angle) * (radius + 6));
      stroke();
    }
    ctx.restore();
  }
}

class JuggledPyroBall extends Effect {
  constructor(user, target, life) {
    super('air', life);
    Object.assign(this, { user, target });
  }

  height() {
    const p = Math.min(1, this.age / this.life);
    if (p < 0.38) return 4 + 13 * Math.sin(p / 0.38 * Math.PI);
    return 4 + 25 * Math.sin((p - 0.38) / 0.62 * Math.PI * 0.86);
  }

  center() {
    const angle = this.user.aimAt(this.target);
    return {
      x: this.user.x + Math.cos(angle) * 12,
      y: this.user.y + Math.sin(angle) * 12 - this.height(),
      angle,
    };
  }

  draw(ctx) {
    const p = Math.min(1, this.age / this.life);
    const { x, y, angle } = this.center();
    const heat = clamp((p - 0.3) / 0.58, 0, 1);
    drawPyroEmber(ctx, x, y, angle, this.age, lerp(0.7, 1.35, heat), heat);
  }
}

const pebble = [
  '...111...',
  '..12221..',
  '.1223321.',
  '122333221',
  '123332221',
  '.1222221.',
  '..11111..',
];
const ember = [
  '.....11.....',
  '...112211...',
  '..12333211..',
  '.1234554321.',
  '123455554321',
  '.1234554321.',
  '..12233421..',
  '....1111....',
];
const coolStone = ['#3b313a', '#80665d', '#b79a7d'];
const hotStone = ['#883326', '#cb502e', '#ed843d', '#ffba64', '#fff0a5'];

// Pixel clusters use the same stepped edges and small palette as the arena sprites.
function drawPyroEmber(ctx, x, y, angle, time, scale, heat, flying = false) {
  const rows = heat > 0.25 ? ember : pebble;
  const colors = heat > 0.25 ? hotStone : coolStone;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle);
  const baseAlpha = ctx.globalAlpha;
  if (heat > 0.25) {
    const length = (flying ? 26 : 12) * heat;
    for (let i = 0; i < 11; i++) {
      const p = (time * 5 + i / 11) % 1;
      const size = Math.ceil((1 - p) * 3);
      const spread = Math.sin(i * 2.1 + p * 2) * (3 + 6 * p);
      ctx.fillStyle = hotStone[i % 4];
      ctx.globalAlpha = baseAlpha * 0.83 * (1 - p);
      ctx.fillRect(Math.round(-4 - p * length), Math.round(spread), size, size);
    }
  }
  ctx.globalAlpha = baseAlpha;
  ctx.scale(scale, scale);
  for (const [row, pixels] of rows.entries()) {
    for (let col = 0; col < pixels.length; col++) {
      const color = colors[Number(pixels[col]) - 1];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(col - Math.floor(pixels.length / 2), row - Math.floor(rows.length / 2), 1, 1);
    }
  }
  ctx.restore();
}

class PinnedShadow extends Effect {
  constructor(target, life) {
    super('ground', life);
    this.x = target.x;
    this.y = target.y;
    this.releaseAt = life;
  }

  draw(ctx) {
    const { x, y } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= Math.min(1, (this.life - this.age) / 0.25);
    const release = clamp((this.age - this.releaseAt) / 0.26, 0, 1);
    const growth = clamp(this.age / 0.18, 0, 1);
    ctx.fillStyle = 'rgba(43,34,61,.48)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9 + 14 * growth + 12 * release, 4 + 5 * growth, 0, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 12; i++) {
      const heading = i * TAU / 12 + this.age * 0.8;
      const distance = 8 + growth * (10 + i % 3 * 3) + release * 27;
      ctx.fillStyle = i % 3 ? '#77648e' : '#baa6cf';
      ctx.fillRect(Math.round(Math.cos(heading) * distance),
        Math.round(Math.sin(heading) * distance * 0.44), i % 3 ? 2 : 3, 2);
    }
    ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      const reach = (16 + growth * 25) * (1 + release * 0.35);
      ctx.beginPath();
      ctx.moveTo(0, 1);
      ctx.lineTo(side * reach * 0.36, -8);
      ctx.lineTo(side * reach * 0.64, -3);
      ctx.lineTo(side * reach, -9 + 4 * Math.sin(this.age * 14));
      ctx.strokeStyle = '#8a72a8';
      ctx.stroke();
    }
    paintUltimate(ctx, 'spirit-arrow', -5, -7 - release * 12, 24, {
      angle: Math.PI * (0.43 + release * 0.65), aspect: 0.62, alpha: 0.76 * (1 - release),
    });
    ctx.restore();
  }
}

class ShackleChains extends Effect {
  constructor(target, x, y, life = 0.91) {
    super('air', life);
    Object.assign(this, { target, x, y, releaseAt: life });
  }

  draw(ctx) {
    const { x, y, target } = this;
    const form = Math.min(1, this.age / 0.16);
    const snap = clamp((this.age - this.releaseAt) / 0.32, 0, 1);
    ctx.save();
    ctx.globalAlpha *= Math.min(1, this.age * 18, (this.life - this.age) * 6);
    for (let i = 0; i < 4; i++) {
      const angle = (i + 0.5) * TAU / 4, dx = Math.cos(angle), dy = Math.sin(angle);
      const anchor = { x: x + dx * 52, y: y + dy * 28 };
      const end = { x: target.x + dx * 8, y: target.y - target.bodyZ + 4 };
      const heading = Math.atan2(end.y - anchor.y, end.x - anchor.x);
      for (let j = 0; j < 6; j++) {
        const p = j / 6 * form;
        const split = snap * (j < 3 ? -1 : 1) * 23;
        ctx.beginPath();
        ctx.ellipse(lerp(anchor.x, end.x, p) + dx * split, lerp(anchor.y, end.y, p) + dy * split,
          5.3, j % 2 ? 2.1 : 3.4, heading + snap * (j - 2.5) * 0.38, 0, TAU);
        ctx.strokeStyle = '#382540'; ctx.lineWidth = 3.3; ctx.stroke();
        ctx.strokeStyle = j % 2 ? '#ad81c7' : '#d7ace5'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    ctx.restore();
  }
}

class LeafVortex extends Effect {
  constructor(center, life) {
    super('air', life);
    Object.assign(this, { center });
  }

  draw(ctx) {
    const p = this.age / this.life;
    const { x, y } = this.center();
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= Math.min(1, p * 9, (1 - p) * 5);
    for (let i = 0; i < 22; i++) {
      const angle = i * TAU / 11 + (i % 2 ? 0.29 : 0) + this.age * 9;
      const radius = (61 + i % 5 * 7) * (1 - p * 0.78);
      const z = (1 - p) * (i % 5 - 2) * 9;
      const leaf = 3 + i % 3;
      ctx.save();
      ctx.translate(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.55 + z);
      ctx.rotate(angle + Math.PI * 0.55);
      ctx.fillStyle = i % 3 === 0 ? '#d6ec9d' : '#81b362';
      ctx.beginPath();
      ctx.moveTo(-leaf, 0);
      ctx.quadraticCurveTo(-1, -leaf, leaf + 2, -1);
      ctx.quadraticCurveTo(2, leaf * 0.78, -leaf, 0);
      ctx.fill();
      ctx.strokeStyle = '#416b42';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

const RETURNING_LEAVES = 8;

function drawLeafShard(ctx, x, y, angle, age, scale) {
  drawOrbCore(ctx, x, y, ORBS.stormLeaf, age, scale);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(9, 0); ctx.quadraticCurveTo(1, -8, -8, 1);
  ctx.quadraticCurveTo(-1, 7, 9, 0); ctx.closePath();
  ctx.fillStyle = '#b8ef83';
  ctx.fill();
  ctx.strokeStyle = '#42743b'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-7, 1); ctx.lineTo(6, 0);
  ctx.strokeStyle = '#efffd7'; ctx.stroke();
  ctx.restore();
}

class OrbLeaves extends Effect {
  constructor(shot) {
    super('air', shot.life + 0.3);
    this.shot = shot;
  }

  update(dt) {
    return !this.shot.arrived && !this.shot.action.cancelled && this.shot.target.alive && !this.shot.target.hidden && super.update(dt);
  }

  draw(ctx) {
    const { x, y } = this.shot.live, t = this.shot.age;
    ctx.save();
    for (let i = 0; i < RETURNING_LEAVES; i++) {
      const angle = i * TAU / RETURNING_LEAVES + t * 13;
      const radius = 31 + 5 * Math.sin(t * 22 + i);
      const lx = x + Math.cos(angle) * radius, ly = y + Math.sin(angle) * radius * 0.69;
      ctx.globalAlpha = 0.66 + 0.28 * Math.sin(angle) ** 2;
      drawLeafShard(ctx, lx, ly, angle + Math.PI / 2, t + i * 0.07, 0.65);
    }
    ctx.restore();
  }
}

class ReturningLeaf extends Effect {
  constructor(action, origin, index, heading) {
    super('air', 0.92);
    const angle = heading + index * TAU / RETURNING_LEAVES;
    const distance = 61 + index % 3 * 22;
    Object.assign(this, {
      action, origin, index, x: origin.x, y: origin.y,
      apex: { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance * 0.72 },
      launchTime: 0.2 + index % 3 * 0.035,
      turnTime: 0.085 + index * 0.018,
      isProjectile: true,
    });
  }

  update(dt) {
    if (!super.update(dt) || this.action.cancelled) return false;
    const { target: t, game: g } = this.action;
    if (!t.alive || t.hidden) return false;
    const returning = this.age >= this.launchTime + this.turnTime;
    let x, y;
    if (returning) {
      const dx = t.x - this.x, dy = t.y - t.bodyZ - this.y;
      const distance = Math.hypot(dx, dy);
      const step = Math.min(distance, (410 + this.index * 17) * dt);
      x = this.x + dx * step / (distance || 1);
      y = this.y + dy * step / (distance || 1);
      if (!t.untouchable && distance - step < t.radius * 0.6 + 8) {
        const z = t.bodyZ, ground = y + z;
        g.marks.leaves(x, ground, 15);
        if (!g.headless) {
          leafBurst(g, x, ground, z, 6);
          g.spawn(new Glow(x, ground, z, 20, [160, 232, 96], 0.18));
        }
        sfx.shard();
        this.action.strike(0.65 / RETURNING_LEAVES, {
          customArt: true, knockback: 24, stagger: 0.22, hitstop: 0.024,
          dirX: dx / (distance || 1), dirY: dy / (distance || 1),
        });
        return false;
      }
    } else {
      const p = 1 - (1 - Math.min(1, this.age / this.launchTime)) ** 2;
      x = lerp(this.origin.x, this.apex.x, p);
      y = lerp(this.origin.y, this.apex.y, p);
    }
    if (!g.headless && this.age >= (this.nextMote ?? 0)) {
      this.nextMote = this.age + 0.033;
      g.particles.spawn({ x: this.x, y: this.y, life: 0.22, size: 2.8, sizeEnd: 1, colors: ORBS.stormLeaf.trail });
    }
    if (x !== this.x || y !== this.y) this.heading = Math.atan2(y - this.y, x - this.x);
    Object.assign(this, { x, y });
    return true;
  }

  draw(ctx) {
    drawLeafShard(ctx, this.x, this.y, this.heading ?? 0, this.age, 0.95);
  }
}

const water = [105, 195, 255];

function contactBurst(g, x, y, z, angle, colors, size, count = 7) {
  if (g.headless) return;
  const burst = new Effect('air', 0.35);
  burst.draw = ctx => {
    const p = burst.age / burst.life, speed = 1 - (1 - p) ** 2;
    ctx.save();
    ctx.translate(x, y - z);
    ctx.rotate(angle);
    ctx.globalAlpha *= 1 - p * p;
    for (let i = 0; i < count; i++) {
      const theta = i * TAU / count + (i % 2) * 0.14;
      const cos = Math.cos(theta), sin = Math.sin(theta);
      const d = 4 + speed * size * (i % 2 ? 0.8 : 1.1);
      const len = Math.max(1, (1 - p) * size * (i % 2 ? 0.39 : 0.24));
      ctx.beginPath();
      ctx.moveTo(cos * (d + len), sin * (d + len) * 0.78);
      ctx.lineTo(cos * d - sin * 2, sin * d * 0.78 + cos * 2);
      ctx.lineTo(cos * (d - len * 0.32), sin * (d - len * 0.32) * 0.78);
      ctx.lineTo(cos * d + sin * 2, sin * d * 0.78 - cos * 2);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
    }
    ctx.restore();
  };
  g.spawn(burst);
}

export function bladeRun(a, g, u, t, duration, colors, mirror, fraction, knockback, scale = 1, hop = 0, impact) {
  const aim = u.aimAt(t);
  let hit = false;
  glide(a, g, u, through(u, t, 36), duration, colors[0], {
    onStep(p) {
      if (hop) u.zOverride = hop * Math.sin(Math.PI * p);
      if (p === 1) u.zOverride = null;
      if (hit || !t.alive || t.hidden || t.untouchable || u.distTo(t) > u.radius + t.radius + 19) return;
      hit = true;
      g.spawn(new SlashArc(u.x, u.y, u.bodyZ, aim, {
        radius: 33 * scale, spread: 1.9, width: 6 * scale, colors, mirror, life: 0.26,
      }));
      g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, layer: 'air', r0: 3, r1: 23 * scale, life: 0.21, color: colors[1], width: 2 }));
      sfx.slash();
      impact?.();
      a.strike(fraction, { customArt: true, knockback, stagger: knockback > 200 ? 0.5 : 0.22 });
    },
  });
}

function chargeSphere(a, g, u, t, moon) {
  const duration = 0.99, radius = moon ? 18 : 17;
  face(a, u, t);
  a.anim('Charge', 0.9);
  g.spawn(new ScreenDim(1.7, moon ? 0.42 : 0.32, moon ? '31,14,39' : '10,18,44'));
  const origin = () => {
    const aim = u.aimAt(t);
    return { x: u.x + Math.cos(aim) * 23, y: u.y - u.bodyZ + Math.sin(aim) * 23 };
  };
  const skyMoon = { x: u.x <= 180 ? 73 : 287, y: 86 };
  if (moon) g.spawn(new Moon(skyMoon.x, skyMoon.y, 1.22));
  const orb = new Effect('air', duration);
  orb.draw = ctx => {
    const { x, y } = origin();
    drawChargedSphere(ctx, x, y, 2 + (radius - 2) * Math.pow(orb.age / duration, 0.65), orb.age, moon ? 'moon' : 'aura');
  };
  if (!g.headless) {
    g.spawn(orb);
    let emission = 0;
    a.ticks.push(dt => {
      if (a.t >= duration || (emission += dt) < 0.042) return;
      emission -= 0.042;
      const p = origin(), angle = rand(0, TAU), d = rand(23, 43);
      const x = moon ? skyMoon.x + rand(-12, 12) : p.x + Math.cos(angle) * d;
      const y = moon ? skyMoon.y + rand(-12, 12) : p.y + Math.sin(angle) * d;
      const life = moon ? 0.25 : 0.17;
      g.particles.spawn({ x, y, vx: (p.x - x) / life, vy: (p.y - y) / life, life, size: 2.6,
        colors: moon ? ['#fff3fe', '#ecadd9'] : ['#def8ff', '#519dff'], sizeEnd: 1 });
    });
  }
  sfx.beamCharge(duration);
  a.later(duration, () => {
    face(a, u, t);
    a.anim('Shoot', 1.4);
    sfx.whoosh();
    const from = origin();
    const travel = Math.max(0.16, Math.hypot(from.x - t.x, from.y - t.y + t.bodyZ) / 900);
    g.spawn(new TrackingShot(u, t, {
      style: 'orb', duration: travel, origin: from,
      flight: { speed: 900, range: 730, radius, sphere: moon ? 'moon' : 'aura', fracture: !moon },
    }, ({ x, y }) => {
      sphereContact(g, x, y + t.bodyZ, t.bodyZ, moon, 1.5);
      g.shake(8, 0.3);
      sfx.explosion();
      a.strike(1, { customArt: true, knockback: 250, stagger: 0.55 });
    }));
  });
  a.end(2.08);
}

export const SPECIES_ULTIMATES = {
  greninjaNightSlash(a, g, u, t) {
    const colors = ['#4b356b', '#ead6ff'];
    const angle = u.aimAt(t);
    const flank = point(t.x + Math.cos(angle - 1.5) * 74, t.y + Math.sin(angle - 1.5) * 74);
    a.anim('Hop', 1.45);
    glide(a, g, u, flank, 0.34, '#6e558f', { onStep: p => { u.zOverride = Math.sin(p * Math.PI) * 18; } });
    dustCloud(g, u.x, u.y, 7, 4);
    a.later(0.38, () => {
      face(a, u, t);
      a.anim('Swing', 1.6);
      bladeRun(a, g, u, t, 0.25, colors, false, 0.35, 60, 1, 0, () => {
        contactBurst(g, t.x, t.y, t.bodyZ, a.aim, ['#3f255b', '#b788e1', '#f3deff'], 28);
        g.hitstop(0.038);
      });
    });
    a.later(0.82, () => {
      face(a, u, t);
      a.anim('Strike', 1.55);
      bladeRun(a, g, u, t, 0.25, colors, true, 0.65, 245, 1.45, 0, () => {
        contactBurst(g, t.x, t.y, t.bodyZ, a.aim, ['#3f255b', '#b788e1', '#f3deff'], 47, 11);
        for (const offset of [-0.57, 0.57]) {
          const angle = a.aim + offset, dx = Math.cos(angle) * 35, dy = Math.sin(angle) * 35;
          g.spawn(new BeamLine(t.x - dx, t.y - t.bodyZ - dy, t.x + dx, t.y - t.bodyZ + dy, 0.24, '#aa83cf', 5));
        }
        g.hitstop(0.06);
        g.shake(5, 0.25);
      });
    });
    a.end(1.43);
  },

  florgesPetalRay(a, g, u, t) {
    face(a, u, t);
    const colors = ['#a65491', '#f4abd8', '#fff8dd'];
    a.anim('Charge', 0.9);
    sfx.beamCharge(0.55);
    for (let i = 0; i < 5; i++) a.later(i * 0.08, () => {
      g.spawn(new Ring(u.x, u.y, { z: u.headZ - 4, r0: 21, r1: 6, life: 0.3, layer: 'air', color: colors[i % 3], width: 2 }));
      leafBurst(g, u.x, u.y, u.headZ, 3);
    });
    let beam;
    const origin = () => { const m = a.mouth(); return { x: m.x, y: m.y - m.z }; };
    a.later(0.57, () => {
      face(a, u, t);
      a.anim('Shoot', 1.2);
      const p = origin();
      beam = g.spawn(new Beam(p.x, p.y, t.x, t.y - t.bodyZ, 0.67, { width: 26, colors }));
      sfx.beamFire();
    });
    a.ticks.push(() => {
      if (!beam) return;
      const p = origin();
      beam.set(p.x, p.y, t.x, t.y - t.bodyZ);
    });
    for (const [at, frac] of [[0.74, 0.32], [1.03, 0.68]]) a.later(at, () => {
      if (!t.alive || t.hidden || t.untouchable) return;
      spray(g, t.x, t.y, t.bodyZ, frac > 0.5 ? 18 : 9, colors, { speed: 84, up: 44 });
      g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, layer: 'air', r0: 3, r1: 30, life: 0.26, color: colors[2], width: 3 }));
      a.strike(frac, { customArt: true, knockback: frac > 0.5 ? 212 : 45 });
    });
    a.end(1.5);
  },

  celebiForestSpiral(a, g, u, t) {
    const colors = ['#efffd8', '#a8d572', '#4c814d'];
    g.spawn(new ScreenDim(1.9, 0.25, '16,26,19'));
    face(a, u, t);
    a.anim('Charge', 0.85);
    const gather = new Effect('air', 0.7);
    const origin = () => {
      const m = a.mouth();
      return { x: m.x, y: m.y - m.z };
    };
    gather.draw = ctx => {
      const p = origin(), t = gather.age / gather.life;
      drawChargedSphere(ctx, p.x, p.y, 2 + 17 * t, gather.age, 'nature');
    };
    if (!g.headless) {
      g.spawn(new LeafVortex(origin, 0.72));
      g.spawn(gather);
    }
    a.later(0.38, () => {
      g.marks.leaves(u.x, u.y, 22);
      sfx.wind(0.36);
    });
    sfx.beamCharge(0.69);
    a.later(0.71, () => {
      a.anim('Shoot', 1.2);
      const shot = new TrackingShot(u, t, {
        origin: origin(), style: 'orb', duration: 0.52, bend: 11,
        flight: { speed: 1140, range: 735, radius: 18, sphere: 'nature' },
      }, ({ x, y, angle }) => {
        shot.arrived = true;
        const z = t.bodyZ, ground = y + z;
        contactBurst(g, x, ground, z, angle, colors, 56, 12);
        g.spawn(new Glow(x, ground, z, 49, [147, 201, 88], 0.32));
        g.marks.leaves(x, ground, 39);
        for (let i = 0; i < RETURNING_LEAVES; i++) g.spawn(new ReturningLeaf(a, { x, y }, i, angle));
        leafBurst(g, x, ground, z, 14);
        sfx.shard();
        g.shake(5, 0.24);
        a.strike(0.35, { customArt: true, knockback: 75, stagger: 0.32, hitstop: 0.045 });
      });
      if (!g.headless) g.spawn(new OrbLeaves(shot));
      g.spawn(shot);
    });
    a.end(2.35);
  },

  moonblast(a, g, u, t) {
    chargeSphere(a, g, u, t, true);
  },

  blazeKickOverdrive(a, g, u, t) {
    const colors = ['#c44729', '#ffe6a0'];
    a.anim('Charge', 1);
    dustCloud(g, u.x, u.y, 8, 4);
    for (const [at, mirror, frac, hop] of [[0.21, false, 0.22, 16], [0.57, true, 0.27, 9], [1.01, false, 0.51, 43]]) {
      a.later(at, () => {
        face(a, u, t);
        a.anim(mirror ? 'Swing' : 'Attack', 1.5);
        bladeRun(a, g, u, t, frac > 0.4 ? 0.3 : 0.23, colors, mirror, frac, frac > 0.4 ? 300 : 48, 1.3, hop, () => {
          const p = { x: t.x, y: t.y };
          g.marks.scorch(p.x, p.y, frac > 0.4 ? 31 : 12, 6);
          contactBurst(g, p.x, p.y, t.bodyZ, a.aim, ['#bc4b28', '#ff973a', '#ffe4a5'], frac > 0.4 ? 51 : 29, 9);
          g.spawn(new Glow(p.x, p.y, t.bodyZ, frac > 0.4 ? 46 : 25, [247, 109, 37], 0.28));
          g.hitstop(frac > 0.4 ? 0.063 : 0.031);
          spray(g, p.x, p.y, t.bodyZ, frac > 0.4 ? 23 : 9, FIRE, { speed: 142, up: 86 });
          if (frac > 0.4) {
            for (const side of [-1, 1]) {
              g.spawn(new SlashArc(p.x, p.y, t.bodyZ, a.aim + side * 0.75,
                { radius: 43, spread: 1.5, width: 8, life: 0.29, colors: ['#d65327', '#ffe8aa'], mirror: side < 0 }));
            }
            spray(g, p.x, p.y, 7, 17, FIRE, { speed: 93, up: 200, grav: 370 });
            g.marks.fracture(p.x, p.y, 28, 6);
            g.shake(8, 0.28);
            sfx.explosion();
          }
        });
      });
    }
    a.end(1.64);
  },

  meteorMash(a, g, u, t) {
    const colors = ['#535c85', '#a2b7e6', '#f6f3ff'];
    face(a, u, t);
    a.anim('Charge', 0.82);
    g.spawn(new ScreenDim(1.83, 0.26, '14,19,38'));
    const armor = new MeteorArmor(u, a.aim);
    if (!g.headless) g.spawn(armor);
    for (const at of [0.18, 0.34, 0.53]) a.later(at, () => {
      const { x, y, z } = armor.socket();
      g.marks.fracture(x, y, 12, 4);
      metalSparks(g, x, y, z);
      sfx.clang();
    });
    a.later(0.65, () => {
      face(a, u, t);
      a.anim('Strike', 1.45);
      sfx.dash();
      const aim = u.aimAt(t);
      let hit = false;
      const distance = Math.max(0, u.distTo(t) - (u.radius + t.radius) * 0.5);
      glide(a, g, u, point(u.x + Math.cos(aim) * distance, u.y + Math.sin(aim) * distance), 0.43, '#879aca', {
        lines: '#a8bbea',
        onStep() {
          if (hit || !t.alive || t.hidden || t.untouchable || u.distTo(t) > u.radius + t.radius + 8) return;
          hit = true;
          armor.dead = true;
          const x = (u.x + t.x) / 2, y = (u.y + t.y) / 2;
          if (!g.headless) g.spawn(new BrokenMeteorArmor(x, y, t.bodyZ, aim));
          a.later(0.25, () => {
            g.marks.fracture(u.x, u.y, 21, 5);
            dustCloud(g, u.x, u.y, 10, 5);
          });
          contactBurst(g, x, y, t.bodyZ, aim, colors, 42, 9);
          g.marks.fracture(x, y, 44, 7);
          debris(g, x, y, 23, 182);
          metalSparks(g, x, y, t.bodyZ);
          g.spawn(new Glow(x, y, t.bodyZ, 45, [153, 169, 251], 0.29));
          g.spawn(new SlashArc(x, y, t.bodyZ * 0.65, aim, {
            radius: 32, spread: 1.35, width: 4, life: 0.21, colors: ['#728ca8', '#ecf6ff'],
          }));
          g.shake(10, 0.33);
          sfx.clang();
          a.strike(1, { customArt: true, knockback: 340, stagger: 0.7, hitstop: 0.065 });
        },
      });
    });
    a.end(1.69);
  },

  waterShurikenBarrage(a, g, u, t) {
    SPECIES_ULTIMATES.greninjaNightSlash(a, g, u, t);
  },

  frenzyPlant(a, g, u, t) {
    face(a, u, t);
    a.anim('Attack', 0.95);
    dustCloud(g, u.x, u.y, 13, 8);
    g.marks.fracture(u.x, u.y, 19, 5);
    for (const [time, offset, travel, height, fraction] of [
      [0.21, -37, 0.42, 23, 0.2],
      [0.44, 45, 0.51, 33, 0.24],
      [0.81, -78, 0.54, 63, 0.56],
    ]) {
      a.later(time, () => g.spawn(new RootRun(u, t, offset, travel, height)));
      a.later(time + travel, () => {
        const last = height > 50;
        leafBurst(g, t.x, t.y, Math.min(height, 45), last ? 32 : 12);
        dustCloud(g, t.x, t.y, last ? 24 : 9, 10);
        g.marks.fracture(t.x, t.y, last ? 34 : 16, 6);
        g.marks.leaves(t.x, t.y, last ? 23 : 11);
        if (last) { g.shake(7, 0.4); sfx.quake(); }
        else sfx.hit(false);
        a.strike(fraction, { knockback: last ? 300 : 55, stagger: last ? 0.54 : 0.22 });
      });
    }
    a.end(1.79);
  },

  gengarShadowBall(a, g, u, t) {
    const original = { x: u.x, y: u.y };
    const ball = (bend, duration, size, fraction) => {
      face(a, u, t);
      a.anim('Shoot', 1.55);
      sfx.pulse();
      g.spawn(new TrackingShot(u, t, {
        style: 'shadow', color: [142, 81, 213], duration, bend, size,
      }, () => {
        g.marks.energy(t.x, t.y, size * 12, [84, 34, 126], 5);
        g.spawn(new Ring(t.x, t.y, {
          z: t.bodyZ, r0: 5, r1: size * 17, life: 0.3, color: '#a269e7', width: 3, layer: 'air',
        }));
        if (size > 2) { g.shake(4, 0.23); sfx.hit(true); }
        a.strike(fraction, { knockback: size > 2 ? 205 : 55 });
      }));
    };
    const surface = (x, y) => {
      u.x = x;
      u.y = y;
      u.vanished = false;
      face(a, u, t);
      g.spawn(new Ring(x, y, { r0: 6, r1: 25, life: 0.4, color: '#3c2058', width: 5 }));
    };
    const sink = () => {
      g.spawn(new Afterimage(u, 0.22, '#442460'));
      g.spawn(new Glow(u.x, u.y, 2, 24, [34, 11, 55], 0.32, true));
      u.phasing = true;
      u.vanished = true;
    };
    g.spawn(new ScreenDim(1.9, 0.4, '18,8,28'));
    a.later(0.13, sink);
    a.later(0.34, () => {
      const p = point(t.x - 120, t.y + 27);
      surface(p.x, p.y);
      ball(-83, 0.7, 1.7, 0.25);
    });
    a.later(0.54, sink);
    a.later(0.70, () => {
      const p = point(t.x + 120, t.y + 19);
      surface(p.x, p.y);
      ball(77, 0.37, 1.7, 0.25);
    });
    a.later(0.93, sink);
    a.later(1.16, () => {
      const direction = t.y >= original.y ? 1 : -1;
      const p = point(t.x + 16, t.y + direction * (t.radius + u.radius + 16));
      surface(p.x, p.y);
      ball(8, 0.22, 2.75, 0.5);
    });
    a.end(1.79);
  },

  gyaradosHydroPump(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 1);
    sfx.waterRise();
    const duration = 0.79;
    let intake = 0.47;
    a.ticks.push(dt => {
      if ((intake -= dt) <= 0 || g.headless) return;
      const m = a.mouth();
      const angle = rand(0, TAU), distance = rand(30, 67);
      const dx = Math.cos(angle) * distance, dy = Math.sin(angle) * distance * 0.6;
      g.particles.spawn({
        x: m.x + dx, y: m.y + dy, z: m.z, vx: -dx / 0.25, vy: -dy / 0.25,
        life: 0.25, size: 3, sizeEnd: 1, colors: ['#d9f9ff', '#6bc9ff'],
      });
    });
    a.later(0.48, () => {
      a.anim('Shoot', 1);
      g.spawn(new PressureJet(a, t, duration, 41));
      sfx.hydro(duration);
    });
    for (const [time, fraction, force] of [[0.66, 0.22, 100], [0.85, 0.3, 175], [1.07, 0.48, 330]]) {
      a.later(time, () => {
        face(a, u, t);
        waterSplash(g, t.x, t.y);
        g.marks.wet(t.x, t.y, 23);
        if (force > 300) { sfx.splash(); g.shake(7, 0.31); }
        a.strike(fraction, { knockback: force, stagger: 0.35 });
      });
    }
    a.end(1.62);
  },
  sceptileLeafBlade(a, g, u, t) {
    const colors = ['#42914e', '#e7ffc3'];
    a.anim('Charge', 0.9);
    const blades = new Effect('air', 0.44);
    blades.draw = ctx => {
      const p = Math.min(1, blades.age / 0.3), angle = u.aimAt(t);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(u.x - Math.sin(angle) * side * 10, u.y - u.bodyZ + Math.cos(angle) * side * 10);
        ctx.rotate(angle + side * 0.35);
        ctx.scale(Math.max(0.08, p), 1);
        ctx.fillStyle = colors[0];
        ctx.beginPath(); ctx.moveTo(-5, 0); ctx.quadraticCurveTo(5, -8, 27, -2); ctx.quadraticCurveTo(12, 9, -5, 0);
        ctx.fill();
        ctx.strokeStyle = colors[1]; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(24, -2); ctx.stroke();
        ctx.restore();
      }
    };
    if (!g.headless) g.spawn(blades);
    for (const [at, mirror, frac] of [[0.35, false, 0.23], [0.72, true, 0.23], [1.06, false, 0.54]]) {
      a.later(at, () => {
        face(a, u, t);
        a.anim(mirror ? 'Swing' : 'Strike', 1.4);
        bladeRun(a, g, u, t, 0.23, colors, mirror, frac, frac > 0.5 ? 245 : 55, frac > 0.5 ? 1.45 : 1, 0, () => {
          leafBurst(g, t.x, t.y, t.bodyZ, frac > 0.5 ? 19 : 8);
          g.marks.leaves(t.x, t.y, 13);
          contactBurst(g, t.x, t.y, t.bodyZ, a.aim, ['#388b45', '#a5df63', '#f0ffd5'], frac > 0.5 ? 48 : 29);
          g.hitstop(frac > 0.5 ? 0.064 : 0.033);
          if (frac > 0.5) {
            g.spawn(new SlashArc(t.x, t.y, t.bodyZ, a.aim + 0.52, { colors, radius: 43, width: 7, spread: 1.7, life: 0.27 }));
            g.shake(6, 0.23);
          }
        });
      });
    }
    a.end(1.65);
  },

  dragonDartsUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.8);
    const angle = u.aimAt(t);
    const from = { x: u.x, y: u.y };
    glide(a, g, u, point(from.x - Math.cos(angle) * 30, from.y - Math.sin(angle) * 30), 0.28, '#547e7a');
    for (const [at, side, bend, fraction] of [[0.34, -1, -112, 0.47], [0.57, 1, 100, 0.53]]) {
      a.later(at, () => {
        face(a, u, t);
        a.anim('Shoot', 1.25);
        const heading = u.aimAt(t);
        const origin = { x: u.x - Math.sin(heading) * side * 16, y: u.y - u.headZ + Math.cos(heading) * side * 10 };
        g.spawn(new Glow(origin.x, origin.y, 0, 12, [98, 204, 159], 0.2));
        sfx.whoosh();
        g.spawn(new TrackingShot(u, t, {
          style: 'dreepyDart', duration: 0.53, color: [114, 224, 188], size: 1.3, bend, origin,
          flight: { speed: 1180, range: 785, radius: 9 },
        }, ({ x, y, angle }) => {
          const z = t.bodyZ;
          contactBurst(g, x, y + z, z, angle, ['#7663ab', '#63d1a6', '#dcffe4'], side > 0 ? 41 : 31, 9);
          g.spawn(new Glow(x, y + z, z, side > 0 ? 34 : 25, [101, 211, 173], 0.25));
          g.hitstop(side > 0 ? 0.048 : 0.03);
          g.spawn(new Ring(x, y + z, { z, layer: 'air', r0: 3, r1: 28, color: '#b3dfc8', width: 2, life: 0.23 }));
          spray(g, x, y + z, z, side > 0 ? 16 : 9, ['#c5ffdc', '#67bda4', '#755c9f'], { speed: 121, up: 50 });
          sfx.hit(side > 0);
          a.strike(fraction, { customArt: true, knockback: side > 0 ? 165 : 60, stagger: 0.3 });
        }));
      });
    }
    a.end(1.65);
  },

  snipeShotUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.85);
    sfx.waterRise();
    a.later(0.2, () => g.spawn(new AimLine(a, t, 0.69)));
    a.later(0.89, () => {
      face(a, u, t);
      a.anim('Shoot', 1.8);
      sfx.hydro(0.24);
      g.spawn(new TrackingShot(u, t, {
        style: 'waterSnipe', duration: 0.16, color: [112, 230, 255], size: 1.8, height: u.headZ - 4,
        flight: { speed: 2800, range: 730, radius: 9 },
      }, ({ x, y, angle }) => {
        const groundY = y + t.bodyZ;
        contactBurst(g, x, groundY, t.bodyZ, angle, ['#326794', '#81d4f6', '#edffff'], 48, 11);
        g.spawn(new Glow(x, groundY, t.bodyZ, 35, [91, 199, 252], 0.23));
        g.spawn(new BeamLine(x - Math.cos(angle) * 22, y - Math.sin(angle) * 22,
          x + Math.cos(angle) * 42, y + Math.sin(angle) * 42, 0.18, '#b8efff', 4));
        g.spawn(new Ring(x, groundY, {
          z: t.bodyZ, r0: 2, r1: 25, life: 0.33, layer: 'air', color: '#d3f7ff', width: 3,
        }));
        g.marks.wet(x, groundY, 16);
        waterSplash(g, t.x, t.y);
        spray(g, x, groundY, t.bodyZ, 12, ['#e7f8ff', '#8ed4ef', '#458cbf'], { speed: 128, up: 31 });
        g.hitstop(0.045);
        sfx.splash();
        g.shake(3, 0.17);
        a.strike(1, { customArt: true, knockback: 180, stagger: 0.46 });
      }));
    });
    a.end(1.56);
  },

  pyroBallUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Attack', 1.25);
    const ball = g.spawn(new JuggledPyroBall(u, t, 0.97));
    const fire = ['#fff0a5', '#ffba64', '#ed843d', '#cb502e'];
    a.owned.push(ball);
    a.later(0.36, () => { a.anim('Swing', 1.4); sfx.hit(false); });
    a.later(0.58, () => {
      a.anim('Hop', 1.4);
      sfx.flamethrower(0.32);
      dustCloud(g, u.x, u.y, 8, 4);
    });
    a.later(0.95, () => {
      face(a, u, t);
      a.anim('Attack', 1.6);
      sfx.whoosh();
      const origin = ball.center();
      ball.dead = true;
      const height = u.y - origin.y;
      g.spawn(new Glow(origin.x, u.y, height, 19, [239, 120, 52], 0.16));
      spray(g, origin.x, u.y, height, 12, fire, { speed: 100, up: 52, size: [1, 3], life: [0.12, 0.25] });
      g.hitstop(0.035);
      if (!g.headless) g.spawn(new FireTrain({ x: origin.x, y: u.y }, t, 0.64));
      g.spawn(new TrackingShot(u, t, {
        style: 'pyroKick', duration: 0.36, color: [237, 132, 61], origin,
        flight: { speed: 1600, range: 750, radius: 13 },
      }, ({ x, y, angle }) => {
        const groundY = y + t.bodyZ;
        g.marks.scorch(t.x, t.y, 33, 6);
        g.marks.fracture(t.x, t.y, 26, 6);
        debris(g, t.x, t.y, 12, 135);
        for (const [r1, life] of [[27, 0.18], [58, 0.34]]) {
          g.spawn(new Ring(x, groundY, { r0: 5, r1, life, color: '#ffcc83', width: 3 }));
        }
        g.hitstop(0.06);
        for (const [side, length] of [[-1, 69], [1, 88]]) {
          const skid = new SkiddingEmber(x, groundY, angle, length, side * 32);
          if (!g.headless) g.spawn(skid);
          for (let i = 1; i <= 6; i++) {
            const progress = i / 8;
            g.later(skid.life * progress, () => {
              const p = skid.position(progress);
              g.marks.scorch(p.x, p.y, 7 - progress * 3, 4.8);
              spray(g, p.x, p.y, 2, 3, fire, { speed: 51, up: 40, life: [0.16, 0.31] });
            });
          }
        }
        embersAlong(g, { x: origin.x, y: u.y }, t);
        g.spawn(new Glow(x, groundY, t.bodyZ, 25, [238, 133, 56], 0.24));
        spray(g, x, groundY, t.bodyZ, 26, fire, { speed: 156, up: 95, size: [2, 4], life: [0.21, 0.45] });
        dustCloud(g, t.x, t.y, 13, 6);
        sfx.explosion();
        g.shake(4, 0.23);
        a.strike(1, { customArt: true, knockback: 245, burnChance: 0.15 });
      }));
    });
    a.end(1.8);
  },

  spiritShackleUlt(a, g, u, t) {
    let pin, chains;
    face(a, u, t);
    a.anim('Charge', 1);
    g.spawn(new ScreenDim(1.55, 0.19, '22,19,33'));
    a.later(0.16, () => {
      g.spawn(new AimLine(a, t, 0.42, '#af9dc3', true));
      for (const offset of [-1, 1]) {
        g.spawn(new Ring(u.x, u.y, { z: u.bodyZ, r0: 31, r1: 9, life: 0.29 + offset * 0.06, color: '#ae7dcc', layer: 'air', width: 2 }));
      }
    });
    a.later(0.58, () => {
      face(a, u, t);
      a.anim('Shoot', 1.6);
      sfx.slash();
      g.spawn(new TrackingShot(u, t, {
        style: 'spiritArrow', duration: 0.29, color: [185, 142, 252], size: 1.25, bend: -8, height: u.headZ - 5,
        flight: { speed: 1750, range: 730, radius: 8 },
      }, ({ x, y, angle }) => {
        contactBurst(g, x, y + t.bodyZ, t.bodyZ, angle, ['#553565', '#a881bf', '#e9d1f0'], 32);
        pin = g.spawn(new PinnedShadow(t, 1.8));
        chains = g.spawn(new ShackleChains(t, t.x, t.y));
        g.spawn(new Glow(x, y + t.bodyZ, t.bodyZ, 43, [158, 84, 192], 0.3));
        contactBurst(g, t.x, t.y, 4, angle, ['#6d497d', '#b582ce', '#f6dcfb'], 50, 12);
        g.hitstop(0.046);
        spray(g, t.x, t.y, 3, 10, ['#c5aedb', '#79668d', '#4f415f'],
          { speed: 63, up: 44, size: [1, 2], life: [0.16, 0.34] });
        for (const life of [0.21, 0.34]) g.spawn(new Ring(t.x, t.y, {
          r0: 5, r1: life * 95, life, color: '#8972a6', width: 1.5,
        }));
        sfx.shard();
        g.marks.energy(t.x, t.y, 21, [125, 86, 161], 5);
        if (a.strike(0.34, { customArt: true, knockback: 0, stagger: 0.3 }) && t.alive) {
          t.blocked = Math.max(t.blocked, 2);
        }
      }));
    });
    a.later(1.05, () => {
      face(a, u, t);
      a.anim('Shoot', 1.8);
      g.spawn(new TrackingShot(u, t, {
        style: 'spiritArrow', duration: 0.22, color: [226, 192, 255], size: 1.55, bend: 8, height: u.headZ - 5,
        flight: { speed: 2150, range: 730, radius: 8 },
      }, ({ x, y, angle }) => {
        contactBurst(g, x, y + t.bodyZ, t.bodyZ, angle, ['#5e3972', '#bc8fdb', '#f3ddfa'], 46, 9);
        g.spawn(new Glow(x, y + t.bodyZ, t.bodyZ, 28, [165, 110, 204], 0.25));
        const z = t.bodyZ;
        if (pin) { pin.releaseAt = pin.age; pin.life = pin.age + 0.37; }
        if (chains) { chains.releaseAt = chains.age; chains.life = chains.age + 0.37; }
        g.spawn(new Glow(t.x, t.y, 7, 56, [138, 74, 180], 0.39));
        for (const [offset, width, size] of [[-0.85, 6, 43], [0.78, 5, 36]]) {
          const heading = angle + offset, dx = Math.cos(heading) * size, dy = Math.sin(heading) * size;
          g.spawn(new BeamLine(x - dx, y - dy, x + dx, y + dy, 0.27, '#c794e6', width));
        }
        a.later(0.085, () => {
          contactBurst(g, x, y + z, z, angle + 0.5, ['#664883', '#bd94d4', '#f4dff7'], 66, 13);
          g.spawn(new Ring(x, y + z, { r0: 16, r1: 68, color: '#c89ae3', life: 0.36, width: 3 }));
        });
        sfx.shard();
        g.spawn(new SlashArc(t.x, t.y, t.bodyZ, u.aimAt(t), { radius: 23, spread: 1.22, width: 4, colors: ['#8669a6', '#ead6ff'], life: 0.19 }));
        g.hitstop(0.045);
        spray(g, t.x, t.y, t.bodyZ, 18, ['#e6d9f1', '#ac8ec4', '#66557d'],
          { speed: 88, up: 56, size: [1, 3], life: [0.17, 0.36] });
        g.spawn(new Ring(t.x, t.y, { r0: 7, r1: 24, color: '#a98bbf', life: 0.23, width: 1.5 }));
        g.shake(7, 0.29);
        a.strike(0.66, { customArt: true, knockback: 160, stagger: 0.35 });
      }));
    });
    a.end(1.72);
  },

  lightOfRuinUlt(a, g, u, t) {
    const colors = ['#54193c', '#fa83ac', '#fff5d8'];
    face(a, u, t);
    a.anim('Charge', 0.85);
    sfx.beamCharge(0.73);
    a.later(0.76, () => {
      face(a, u, t);
      a.anim('Shoot', 1.18);
      const m = a.mouth(), from = { x: m.x, y: m.y - m.z };
      const beam = g.spawn(new Beam(from.x, from.y, from.x, from.y, 0.75, { width: 32, colors, tapered: true }));
      const flight = Math.max(0.1, Math.hypot(t.x - from.x, t.y - t.bodyZ - from.y) / 1450);
      a.ticks.push(() => {
        const front = Math.min(1, beam.age / flight);
        beam.set(from.x, from.y, lerp(from.x, t.x, front), lerp(from.y, t.y - t.bodyZ, front));
      });
      sfx.beamFire();
      a.later(flight + 0.31, () => {
        if (!t.alive || t.hidden || t.untouchable) return;
        a.strike(1, { customArt: true, knockback: 230, stagger: 0.51, hitstop: 0.047 });
      });
    });
    a.end(1.95);
  },
  drumBeatingUlt(a, g, u, t) {
    const colors = ['#4e713c', '#89ae55', '#d5eca2'];
    face(a, u, t);
    a.anim('Charge', 0.9);
    a.later(0.12, () => {
      const heading = u.aimAt(t);
      const advance = Math.max(0, u.distTo(t) - u.radius - t.radius - 46);
      a.anim('Walk', 1.65);
      glide(a, g, u, point(u.x + Math.cos(heading) * advance, u.y + Math.sin(heading) * advance), 0.34, '#748251', { ease: drumEase });
    });
    let drum, pulse;
    for (const [beat, start] of [0.49, 0.82, 1.15].entries()) a.later(start, () => {
      face(a, u, t);
      const speed = 1.34, anim = a.anim('Attack', speed);
      // The sprite raises both sticks before striking on frame five.
      const frame = Math.min(5, Math.max(0, anim.frames - 1));
      const heading = a.aim;
      if (!drum) {
        const source = point(u.x + Math.cos(heading) * (u.radius + 6), u.y + Math.sin(heading) * (u.radius + 6));
        drum = new BattleDrum(source.x, source.y);
        if (!g.headless) g.spawn(drum);
      }
      a.later(a.timeTo(anim, frame, speed), () => {
        drum.lastBeat = drum.age;
        sfx.drumBeat(beat);
        const aim = Math.atan2(t.y - drum.y, t.x - drum.x);
        const reach = Math.min(170, Math.hypot(t.x - drum.x, t.y - drum.y));
        const target = { ...point(drum.x + Math.cos(aim) * reach, drum.y + Math.sin(aim) * reach), z: t.bodyZ };
        if (!g.headless) g.spawn(new DrumWave(drum, target));
        a.later(DRUM_WAVE_TRAVEL, () => {
          if (!t.alive || t.hidden || t.untouchable || Math.hypot(t.x - target.x, t.y - target.y) > t.radius + 19) return;
          const { x, y, bodyZ } = t;
          leafBurst(g, x, y, bodyZ, 8);
          contactBurst(g, x, y, bodyZ, aim, colors, 22, 6);
          a.strike(0.15, { customArt: true, knockback: 5, stagger: 0.12 });
          if (pulse) return;
          pulse = new GrassPulse(x, y);
          if (!g.headless) g.spawn(pulse);
          g.marks.leaves(x, y, 19);
          a.later(DRUM_RIPPLE_RETURN, () => {
            g.spawn(new Glow(x, y, 9, 35, [150, 207, 96], 0.26));
            g.marks.leaves(x, y, 26);
            leafBurst(g, x, y, 12, 23);
            if (!t.alive || t.hidden || t.untouchable || Math.hypot(t.x - x, t.y - y) > t.radius + 24) return;
            contactBurst(g, t.x, t.y, t.bodyZ, aim, colors, 42, 10);
            g.shake(5, 0.21);
            if (a.strike(0.55, { customArt: true, knockback: 160, stagger: 0.38, hitstop: 0.055 })) {
              g.stage(t, { spe: -1 }, u);
            }
          });
        });
      });
    });
    a.end(2.84);
  },

  gigatonHammerUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.8);
    const side = u.x <= t.x ? -1 : 1;
    const approach = point(t.x + 54 * side, t.y + 10);
    a.later(0.13, () => glide(a, g, u, approach, 0.37, '#e6b2c4'));
    a.later(0.53, () => {
      face(a, u, t);
      a.anim('Hop', 1.1);
      const landing = point(t.x + side * 26, t.y + 8);
      glide(a, g, u, landing, 0.57, '#b49aae', {
        onStep(p) { u.zOverride = 28 * Math.sin(Math.PI * p); },
      });
    });
    a.later(0.94, () => a.anim('Slam', 1.45));
    a.later(1.10, () => {
      const impact = point(u.x + Math.cos(u.aimAt(t)) * 20, u.y + Math.sin(u.aimAt(t)) * 20);
      if (Math.hypot(t.x - impact.x, t.y - impact.y) > t.radius + 21 || t.untouchable) return;
      const customArt = ultimateArt(g, 'debris', t.x, t.y, 88, 0.37, { lift: 0.14, layer: 'ground' });
      for (const [r1, life] of [[34, 0.2], [81, 0.43]]) g.spawn(new Ring(t.x, t.y, { r0: 8, r1, life, color: '#dbcbdc', width: 4 }));
      debris(g, t.x, t.y, 17, 157);
      metalSparks(g, t.x, t.y, t.bodyZ);
      g.marks.fracture(t.x, t.y, 44, 7);
      dustCloud(g, t.x, t.y, 26, 9);
      spray(g, t.x, t.y, 8, 26, ['#e7d9c8', '#b8a7aa', '#7d6876']);
      g.shake(8, 0.38);
      sfx.clang();
      a.strike(1, { customArt, knockback: 285, stagger: 0.58, hitstop: 0.065 });
    });
    a.end(1.67);
  },

  saltCureUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.9);
    const salt = ['#fcf7e6', '#d4c5af', '#a2968f'];
    a.later(0.4, () => {
      a.anim('Slam', 1.4);
      const from = { x: u.x, y: u.y };
      for (let i = 1; i <= 6; i++) a.later(i * 0.065, () => {
        const p = i / 6;
        const x = lerp(from.x, t.x, p), y = lerp(from.y, t.y, p);
        g.marks.fracture(x, y, 8 + 8 * p, 5);
        spray(g, x, y, 3, 6 + 12 * p, salt, { speed: 31, size: [3, 6], life: [0.6, 0.8] });
      });
    });
    a.later(0.79, () => {
      spray(g, t.x, t.y, t.bodyZ, 31, salt, { speed: 70, size: [3, 7] });
      g.marks.energy(t.x, t.y, 22, [212, 197, 175], 5);
      sfx.clang();
      if (a.strike(1, { knockback: 70, stagger: 0.48 }) && t.alive && !t.salted) {
        t.salted = { by: u.side, t: 0 };
      }
    });
    a.end(1.55);
  },

  kingsJudgment(a, g, u, t) {
    const colors = ['#8577ac', '#fff0c4'];
    g.toggleForm(u, false);
    a.anim('Charge', 1);
    g.spawn(new PsyDome(u.x, u.y, 26, 0.35, [157, 183, 227]));
    sfx.clang();
    a.later(0.28, () => {
      g.toggleForm(u, true);
      metalSparks(g, u.x, u.y, u.bodyZ);
    });
    for (const [at, mirror, share, hop] of [[0.35, false, 0.21, 0], [0.66, true, 0.22, 12], [0.96, false, 0.23, 0], [1.27, true, 0.34, 32]]) {
      a.later(at, () => {
        face(a, u, t);
        a.anim(mirror ? 'Swing' : 'Strike', 1.65);
        bladeRun(a, g, u, t, 0.22, colors, mirror, share, share > 0.3 ? 245 : 40, share > 0.3 ? 1.55 : 1.2, hop, () => {
          metalSparks(g, t.x, t.y, t.bodyZ);
          if (share > 0.3) {
            const cy = t.y - t.bodyZ;
            for (const [angle, length, width, life] of [[-0.66, 430, 15, 0.44], [0.68, 242, 6, 0.26]]) {
              const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
              g.spawn(new BeamLine(t.x - dx, cy - dy, t.x + dx, cy + dy, life, colors[0], width));
              g.spawn(new BeamLine(t.x - dx, cy - dy, t.x + dx, cy + dy, life * 0.72, colors[1], width * 0.36));
            }
            contactBurst(g, t.x, t.y, t.bodyZ, a.aim, colors, 43, 9);
            g.hitstop(0.065);
            sfx.clang();
            g.shake(7, 0.25);
            g.marks.fracture(t.x, t.y, 27, 5);
          }
        });
      });
    }
    a.later(1.63, () => {
      u.face(t.x, t.y);
      g.toggleForm(u, false);
      sfx.clang();
    });
    a.end(1.92);
  },
  auraStorm(a, g, u, t) {
    chargeSphere(a, g, u, t, false);
  },
};
