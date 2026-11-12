import { Effect } from './effects.js';
import { TYPE_COLORS } from './data/types.js';

export const MOVE_PRESENTATIONS = {
  dash: { short: 'DASH', color: '#f0883e' },
  energy: { short: 'ENERGY', color: '#a070f0' },
  beam: { short: 'BEAM', color: '#3ab8e8' },
  status: { short: 'STATUS', color: '#8d97b0' },
  weather: { short: 'WEATHER', color: '#2e7674' },
  hazard: { short: 'HAZARD', color: '#b78a5a' },
  knockback: { short: 'KNOCKBACK', color: '#e0503a' },
  volley: { short: 'MULTI-SHOT', color: '#47782e' },
};

// Presentation follows the finished action and recipe, including moves generated from the move data.
export function presentationOf(move) {
  if (!move || move.ultimate) return null;
  const kind = move.targeting?.kind;
  if (move.dash || move.twoTurn) return 'dash';
  if (move.beam || move.stream || kind === 'bolt') return 'beam';
  if (move.shot || (move.seq && (kind === 'homing' || kind === 'straight'))) {
    const shots = move.shot?.spread?.length ?? move.seq?.steps.filter(step => step.missile).length ?? 1;
    return shots > 1 ? 'volley' : 'energy';
  }
  if (move.util?.kind === 'weather' || move.id === 'chillyReception') return 'weather';
  if (move.util?.kind === 'hazard') return 'hazard';
  if (move.id === 'futureSightAtk' || move.id === 'doomDesire') return 'knockback';
  if (move.util || move.copy || move.cat === 'status') return 'status';
  return 'knockback';
}

const TAU = Math.PI * 2;
const palette = type => TYPE_COLORS[type] ?? TYPE_COLORS.normal;
export const ORIGINAL_PULSES = new Set(['darkPulse', 'dragonPulse', 'waterPulse', 'lugiaWaterPulse']);
const ELEMENT_SHAPE = {
  fire: 'flame', water: 'drop', grass: 'leaf', electric: 'bolt', ice: 'crystal',
  rock: 'crystal', steel: 'crystal', ground: 'crystal', poison: 'drop',
  ghost: 'flame', dark: 'flame', flying: 'crescent', bug: 'leaf',
  dragon: 'leaf', psychic: 'orb', fairy: 'star', normal: 'star', fighting: 'star',
};

function drawElement(ctx, shape, x, y, size, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size, size);
  ctx.beginPath();
  switch (shape) {
    case 'leaf':
      ctx.moveTo(0, -1);
      ctx.quadraticCurveTo(1.4, 0.1, 0, 1);
      ctx.quadraticCurveTo(-0.8, 0.4, 0, -1);
      break;
    case 'flame':
      ctx.moveTo(-0.7, 0.5);
      ctx.quadraticCurveTo(-1, -0.25, 0.5, -1);
      ctx.quadraticCurveTo(0.1, -0.2, 0.8, 0.15);
      ctx.quadraticCurveTo(0.6, 1.2, -0.7, 0.5);
      break;
    case 'drop':
      ctx.moveTo(0, -1);
      ctx.bezierCurveTo(1.8, 0.85, 0.45, 1.1, 0, 1);
      ctx.bezierCurveTo(-0.45, 1.1, -1.8, 0.85, 0, -1);
      break;
    case 'bolt':
      ctx.moveTo(0.25, -1.2);
      ctx.lineTo(-0.85, 0.18);
      ctx.lineTo(-0.05, 0.06);
      ctx.lineTo(-0.28, 1.2);
      ctx.lineTo(0.9, -0.23);
      ctx.lineTo(0.1, -0.12);
      break;
    case 'crystal':
      ctx.moveTo(0.15, -1.1);
      ctx.lineTo(0.85, -0.18);
      ctx.lineTo(0.35, 0.85);
      ctx.lineTo(-0.55, 0.62);
      ctx.lineTo(-0.72, -0.28);
      break;
    case 'crescent':
      ctx.moveTo(-1, 0);
      ctx.quadraticCurveTo(0, -1.3, 1, 0);
      ctx.quadraticCurveTo(0.1, -0.5, -1, 0);
      break;
    case 'star':
      ctx.moveTo(0, -1);
      ctx.lineTo(0.3, -0.27);
      ctx.lineTo(1, 0);
      ctx.lineTo(0.3, 0.27);
      ctx.lineTo(0, 1);
      ctx.lineTo(-0.3, 0.27);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-0.3, -0.27);
      break;
    default:
      ctx.arc(0, 0, 0.72, 0, TAU);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawsNewEffects(move) {
  return move.presentation && move.id !== 'leafStorm' && !ORIGINAL_PULSES.has(move.id);
}

export function showMoveCast(game, move, user, angle) {
  if (game.headless || !drawsNewEffects(move)) return;
  if (move.presentation === 'status') return;
  game.spawn(new MoveCastCue(move, user, angle));
}

class MoveCastCue extends Effect {
  constructor(move, user, angle) {
    const dash = move.presentation === 'dash';
    super('air', dash ? 0.18 : 0.28);
    Object.assign(this, { move, user, angle });
  }

  draw(ctx) {
    const { move, user, angle } = this;
    const p = this.age / this.life;
    const [color] = palette(move.type);
    const shape = ELEMENT_SHAPE[move.type];
    const close = move.presentation === 'dash' || move.presentation === 'knockback';
    const count = move.presentation === 'volley' ? 5 : 3;
    const radius = user.radius + 6;
    ctx.save();
    ctx.translate(user.x, user.y - user.bodyZ);
    ctx.rotate(angle);
    ctx.globalAlpha = Math.sin(p * Math.PI) * 0.85;
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.44;
      const reach = radius + (close ? p * 10 : (1 - p) * 18);
      const x = Math.cos(spread) * reach * (move.presentation === 'dash' ? -1 : 1);
      const y = Math.sin(spread) * reach;
      ctx.fillStyle = i === (count - 1) / 2 ? '#fff6dd' : color;
      drawElement(ctx, shape, x, y, 3 + p * 2, spread + p);
    }
    ctx.restore();
  }
}

export function showStatusRelease(game, move, user, target) {
  if (!game.headless && move?.presentation === 'status') {
    const recipient = (move.util?.aim || move.util?.kind === 'ray') && target?.alive && !target.hidden ? target : user;
    game.spawn(new StatusRelease(move, recipient, recipient !== user));
  }
}

class StatusRelease extends Effect {
  constructor(move, recipient, hostile) {
    super('air', 0.46);
    const util = move.util;
    const status = util?.status ?? move.dex?.status;
    const intent = status ?? (move.copy || move.id === 'sleepTalk' ? 'copy'
      : util?.kind === 'guard' || /shield|barrier|reflect|screen/i.test(move.name) ? 'guard'
      : move.dex?.heal || ['heal', 'regen'].includes(util?.kind) ? 'heal'
      : hostile ? 'lower' : 'raise');
    Object.assign(this, { move, recipient, intent });
  }

  draw(ctx) {
    const { move, recipient, intent } = this;
    const p = this.age / this.life;
    const [color] = palette(move.type);
    const sleep = intent === 'sleep' || intent === 'slp' || move.id === 'yawn' || move.id === 'sleepTalk';
    const hostile = ['lower', 'burn', 'poison', 'para', 'freeze'].includes(intent);
    const r = recipient.radius + 7;
    ctx.save();
    ctx.translate(recipient.x, recipient.y - recipient.bodyZ);
    ctx.lineWidth = 2;
    if (intent === 'guard') {
      ctx.strokeStyle = color;
      ctx.globalAlpha = (1 - p) * 0.8;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(0, 0, r + p * 13, r * 0.87, 0, side * Math.PI / 2 - 0.85, side * Math.PI / 2 + 0.85);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 6; i++) {
      const t = Math.max(0, p - i * 0.045);
      if (!t) continue;
      const a = i * TAU / 6 + t * (intent === 'copy' ? -5 : 3);
      const spread = hostile ? r * (1.4 - t * 0.75) : r * (0.65 + t * 0.85);
      const x = Math.cos(a) * spread;
      const y = Math.sin(a) * spread * 0.52 + (hostile ? 17 : -30) * t;
      ctx.globalAlpha = (1 - p) * 0.95;
      ctx.fillStyle = i % 2 ? '#fff8e7' : color;
      if (sleep) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.beginPath();
        ctx.moveTo(x - 3, y - 2);
        ctx.lineTo(x + 3, y - 2);
        ctx.lineTo(x - 3, y + 3);
        ctx.lineTo(x + 3, y + 3);
        ctx.stroke();
      } else if (intent === 'heal') {
        ctx.fillStyle = i % 2 ? '#e5ffdd' : '#6fe5a0';
        ctx.fillRect(x - 4, y - 1, 8, 2);
        ctx.fillRect(x - 1, y - 4, 2, 8);
      } else {
        drawElement(ctx, ELEMENT_SHAPE[move.type], x, y, 3 + t * 2, a);
      }
    }
    ctx.restore();
  }
}

// A short trail sampled from the actual flight path so a homing fan is readable around turns.
export class ShotRibbon extends Effect {
  constructor(shot, color, move) {
    super('air', 0.2);
    this.shot = shot;
    this.holdInCutscene = true;
    this.color = color;
    this.shape = ELEMENT_SHAPE[move.type];
    this.volley = move.presentation === 'volley';
    this.points = [];
    this.sampleAt = 0;
  }

  update(dt) {
    if (this.shot.dead) return super.update(dt);
    this.sampleAt -= dt;
    if (this.sampleAt <= 0) {
      const { x, y, z } = this.shot;
      this.points.push([x, y - z]);
      if (this.points.length > 7) this.points.shift();
      this.sampleAt = 0.025;
    }
    return true;
  }

  draw(ctx) {
    if (this.points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';
    for (let i = 1; i < this.points.length; i++) {
      const strength = i / this.points.length;
      const fade = 1 - this.age / this.life;
      ctx.globalAlpha = strength * 0.58 * fade;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 0.55 + strength * (this.volley ? 2.5 : 4.6);
      ctx.beginPath();
      ctx.moveTo(...this.points[i - 1]);
      ctx.lineTo(...this.points[i]);
      ctx.stroke();
      if (strength > 0.64) {
        ctx.globalAlpha = (strength - 0.5) * fade;
        ctx.strokeStyle = '#fff8e4';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
    for (let i = this.points.length - 3; i > 0; i -= 2) {
      const [x, y] = this.points[i];
      const [px, py] = this.points[i - 1];
      const angle = Math.atan2(y - py, x - px);
      const spread = (i % 4 === 1 ? 1 : -1) * (this.volley ? 4 : 7);
      ctx.globalAlpha = 0.74 * (i / this.points.length) * (1 - this.age / this.life);
      ctx.fillStyle = this.color;
      drawElement(ctx, this.shape, x - Math.sin(angle) * spread, y + Math.cos(angle) * spread, this.volley ? 2.8 : 4, angle + Math.PI / 2);
    }
    ctx.restore();
  }
}

export function showShotTrail(game, shot, move, color) {
  if (!game.headless && drawsNewEffects(move)) game.spawn(new ShotRibbon(shot, color ?? palette(move.type)[0], move));
}

export class DashStreak extends Effect {
  constructor(user, move, duration) {
    super('air', duration + 0.13);
    const [color] = palette(move.type);
    this.color = move.dash?.color ?? color;
    this.core = move.dash?.core ?? '#fff6dc';
    this.shape = ELEMENT_SHAPE[move.type];
    this.follow(user);
    this.fromX = this.x;
    this.fromY = this.y;
  }

  follow(user) {
    this.x = user.x;
    this.y = user.y - user.bodyZ;
  }

  draw(ctx) {
    const f = 1 - this.age / this.life;
    const dx = this.x - this.fromX, dy = this.y - this.fromY;
    const lead = Math.hypot(dx, dy);
    ctx.save();
    ctx.translate(this.fromX, this.fromY);
    ctx.rotate(Math.atan2(dy, dx));
    if (lead > 3) {
      const tail = Math.max(0, lead - 72);
      const breadth = 5 + 4 * f;
      ctx.globalAlpha = f * 0.52;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(tail, 0);
      ctx.quadraticCurveTo(lead - 18, -breadth, lead + 2, 0);
      ctx.quadraticCurveTo(lead - 18, breadth, tail, 0);
      ctx.fill();
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const x = lead - 16 - i * 13;
        if (x <= 0) continue;
        const y = (i % 2 ? -1 : 1) * (7 + i * 2);
        ctx.fillStyle = i % 2 ? this.core : this.color;
        drawElement(ctx, this.shape, x, y, 4 - i * 0.5, Math.PI / 2);
      }
      for (let i = -2; i <= 2; i++) {
        const end = lead - Math.abs(i) * 5;
        if (end <= 0) continue;
        ctx.globalAlpha = f * (i === 0 ? 0.95 : 0.52);
        ctx.strokeStyle = i === 0 ? this.core : this.color;
        ctx.lineWidth = i === 0 ? 2 : 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, end - 23 - Math.abs(i) * 12), i * 6);
        ctx.quadraticCurveTo(end - 10, i * 5, end, i * 3);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// The filaments live inside the firing lane and end when the attack is interrupted.
export function showBeamWake(game, move, line, duration, width) {
  if (!game.headless && drawsNewEffects(move)) return game.spawn(new BeamWake(move, line, duration, width));
}

class BeamWake extends Effect {
  constructor(move, line, duration, width) {
    super('air', duration);
    Object.assign(this, { move, line, width });
  }

  draw(ctx) {
    const { x0: x, y0: y, x1: endX, y1: endY } = this.line;
    const length = Math.hypot(endX - x, endY - y);
    if (length < 1) return;
    const fade = Math.min(1, (1 - this.age / this.life) * 4);
    const color = this.move.beam?.colors[1] ?? palette(this.move.type)[0];
    const shape = ELEMENT_SHAPE[this.move.type];
    const amplitude = this.width * 0.6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(endY - y, endX - x));
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const p = (this.age * 4 + i / 9) % 1;
      const side = i % 2 ? 1 : -1;
      const x = length * p;
      const y = side * amplitude * (0.55 + 0.4 * Math.sin(p * TAU + i));
      const tail = Math.min(x, 8 + 18 * p);
      ctx.globalAlpha = fade * Math.min(0.9, p * 6, (1 - p) * 7);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - tail, y + side * 3);
      ctx.quadraticCurveTo(x - tail * 0.55, y + side * 6, x, y);
      ctx.stroke();
      ctx.fillStyle = i % 3 ? color : '#fff8e6';
      drawElement(ctx, shape, x, y, Math.max(2.2, Math.min(5, amplitude * 0.52)), Math.PI / 2);
    }
    ctx.restore();
  }
}

export function showStrikeRelease(game, move, x, y, z, angle, radius, area = false) {
  if (!game.headless && move.presentation === 'knockback') {
    game.spawn(new StrikeRelease(move, x, y - z, angle, radius, area));
  }
}

class StrikeRelease extends Effect {
  constructor(move, x, y, angle, radius, area) {
    super('air', area ? 0.33 : 0.22);
    Object.assign(this, { move, x, y, angle, radius, area });
  }

  draw(ctx) {
    const { move, area } = this;
    const p = this.age / this.life;
    const [color, shadow] = palette(move.type);
    const slice = move.slice || move.melee?.fx === 'claw';
    const r = this.radius * (area ? 0.25 + 0.75 * p : 0.62 + 0.38 * p);
    const count = area ? 10 : slice ? 3 : move.bite ? 6 : 5;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(area ? 0 : this.angle);
    ctx.lineCap = 'round';
    ctx.globalAlpha = (1 - p) * 0.9;
    for (let i = 0; i < count; i++) {
      const a = area ? TAU * i / count : (i - (count - 1) / 2) * (move.bite ? 0.6 : 0.26);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * (area ? 0.58 : 1);
      ctx.fillStyle = i % 2 ? color : '#fff6dc';
      if (slice && !area) {
        ctx.strokeStyle = i % 2 ? shadow : color;
        ctx.lineWidth = 4 - p * 2;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.45, y - r * 0.58);
        ctx.quadraticCurveTo(x + r * 0.4, y, x, y + r * 0.55);
        ctx.stroke();
        ctx.strokeStyle = '#fff6dc';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      } else {
        const shape = move.bite ? 'crystal' : move.punch ? 'star' : ELEMENT_SHAPE[move.type];
        drawElement(ctx, shape, x, y, (area ? 6 : 5) * (1 - p * 0.5), a + Math.PI / 2);
      }
    }
    ctx.restore();
  }
}

export class PulseTrain extends Effect {
  constructor(from, to, move) {
    super('air', move.beam.duration);
    Object.assign(this, { from, to, type: move.type, id: move.id, width: move.beam.visualWidth, colors: move.beam.colors });
  }

  draw(ctx) {
    const dx = this.to.x - this.from.x, dy = this.to.y - this.from.y, length = Math.hypot(dx, dy);
    const [edge, rim, core] = this.colors;
    ctx.save();
    ctx.translate(this.from.x, this.from.y);
    ctx.rotate(Math.atan2(dy, dx));
    for (let i = 0; i < 7; i++) {
      const p = this.age * 3.3 - i * 0.2;
      if (p <= 0 || p >= 1) continue;
      const r = this.width * (0.52 + p * 0.45);
      ctx.globalAlpha = Math.min(1, p * 8, (1 - p) * 5, (1 - this.age / this.life) * 4);
      ctx.beginPath();
      if (this.id === 'bubbleBeam') {
        ctx.ellipse(length * p, (i % 2 ? 1 : -1) * r * 0.5, r * 0.47, r * 0.47, 0, 0, TAU);
      } else if (this.id === 'twinBeam') {
        const y = Math.sin(p * TAU * 2) * r;
        ctx.moveTo(length * p + 3.5, y);
        ctx.arc(length * p, y, 3.5, 0, TAU);
        ctx.moveTo(length * p + 3.5, -y);
        ctx.arc(length * p, -y, 3.5, 0, TAU);
      } else {
        ctx.ellipse(length * p, 0, r * 0.43, r, this.type === 'dragon' ? Math.sin(p * TAU * 2) * 0.3 : 0, 0, TAU);
      }
      ctx.lineWidth = 4;
      ctx.strokeStyle = this.type === 'dark' ? '#201027' : edge;
      ctx.stroke();
      ctx.lineWidth = this.type === 'water' ? 1.6 : 2.2;
      ctx.strokeStyle = this.type === 'dark' ? rim : core;
      ctx.stroke();
      if (this.type === 'water') {
        ctx.fillStyle = core;
        ctx.fillRect(length * p - 5, r + 2, 2, 2);
        ctx.fillRect(length * p + 6, -r - 4, 2, 2);
      }
    }
    ctx.restore();
  }
}

export function showMoveImpact(game, move, target, direction) {
  if (game.headless || !drawsNewEffects(move)) return;
  game.spawn(new MoveImpactCue(move, target, direction));
}

class MoveImpactCue extends Effect {
  constructor(move, target, direction) {
    const volley = move.presentation === 'volley';
    super('air', volley ? 0.17 : 0.24);
    Object.assign(this, { move, x: target.x, y: target.y - target.bodyZ, angle: direction, radius: volley ? 12 : 20 });
  }

  draw(ctx) {
    const { move } = this;
    const p = this.age / this.life, r = this.radius * (0.35 + p * 0.65);
    const [color, core] = palette(move.type);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.globalAlpha = (1 - p) * 0.85;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    if (move.slice) {
      // Three cuts open across the direction of contact, then peel away.
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.55, i * r * 0.38 - r * 0.38);
        ctx.quadraticCurveTo(r * 0.72, i * r * 0.38 - r * 0.18, r * 0.86, i * r * 0.38 + r * 0.46);
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      const physical = move.presentation === 'dash' || move.presentation === 'knockback';
      ctx.ellipse(0, 0, r * (physical ? 0.52 : 0.7), r, 0, physical ? -1.18 : 0, physical ? 1.18 : TAU);
      ctx.strokeStyle = color;
      ctx.lineWidth = physical ? 3.7 : 2.7;
      ctx.stroke();
      ctx.strokeStyle = core;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < (move.presentation === 'volley' ? 3 : 5); i++) {
        const a = (i - 2) * 0.62, d = r * (1.05 + i % 2 * 0.23);
        ctx.fillStyle = i % 2 ? color : '#fff8e9';
        drawElement(ctx, ELEMENT_SHAPE[move.type], Math.cos(a) * d, Math.sin(a) * d, physical ? 3.6 : 2.7, a + p);
      }
    }
    ctx.restore();
  }
}

export class HazardLanding extends Effect {
  constructor(home, kind, color) {
    super('ground', 0.52);
    Object.assign(this, { home, kind, color });
  }

  draw(ctx) {
    const p = this.age / this.life, r = 10 + p * 34;
    ctx.save();
    ctx.translate(this.home.x, this.home.y);
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = this.color;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.55;
      ctx.beginPath();
      if (this.kind === 'web') {
        const b = a + TAU / 6;
        ctx.moveTo(0, 0);
        ctx.lineTo(x, y);
        ctx.lineTo(Math.cos(b) * r, Math.sin(b) * r * 0.55);
        ctx.stroke();
      } else {
        ctx.fillStyle = this.kind === 'toxic' ? (i % 2 ? '#eab0ff' : this.color) : this.color;
        const rise = Math.sin(p * Math.PI) * (this.kind === 'rocks' ? 16 : 7);
        const shape = this.kind === 'toxic' ? 'drop' : 'crystal';
        drawElement(ctx, shape, x, y - rise, this.kind === 'rocks' ? 7 : 4.5, (i % 3 - 1) * 0.45);
      }
    }
    ctx.restore();
  }
}

export class WeatherArrival extends Effect {
  constructor(user, weather, color) {
    super('air', 0.65);
    Object.assign(this, { x: user.x, y: user.y - user.bodyZ, weather, color });
  }

  draw(ctx) {
    const p = this.age / this.life, r = 12 + p * 50;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha = (1 - p) * 0.85;
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10 + (this.weather === 'sand' ? p * 2 : 0);
      const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.55;
      if (this.weather === 'hail' || this.weather === 'snow' || this.weather === 'sand') {
        const shape = this.weather === 'sand' ? 'crystal' : this.weather === 'hail' ? 'orb' : 'star';
        drawElement(ctx, shape, x, y - (i % 3) * 8 * p, 2.5 + i % 3, a + p);
      } else {
        ctx.beginPath();
        ctx.moveTo(x, y);
        if (this.weather === 'rain') ctx.lineTo(x - 4, y + 12);
        else ctx.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 6);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
