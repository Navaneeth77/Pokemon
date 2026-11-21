// More signature-move ultimates, each staged after the move's official description (PokéAPI move text, quoted
// briefly above each). Legendary and Mythical Pokémon get a whole-arena set piece. Visual only: no screen
// flashes or hit-pause.
import { Effect, Glow, Ring, Beam, BeamLine, EnergyAura, ScreenDim, Spike, Lightning, StormCloud, StormSwirl, ClawSlash, FangBite, SlashArc,
  Afterimage, Pillar, iceShatter, metalSparks, debris, dustCloud, waterSplash, leafBurst, electricBurst, rand } from './effects.js';
import { glide, spray, inward } from './ult-choreo.js';
import { AeroblastBeam } from './raid-art.js';
import { BOUNDS } from './arena.js';
import { sfx } from './audio.js';

const TAU = Math.PI * 2;
const lerp = (a, b, p) => a + (b - a) * p;
const clampPt = (x, y) => ({ x: Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, x)), y: Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, y)) });
const play = (name, ...args) => sfx[name]?.(...args);
const at = v => (typeof v === 'function' ? v() : v);
const body = m => ({ x: m.x, y: m.y, z: m.bodyZ });
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

function face(a, u, t) {
  a.aim = u.aimAt(t);
  u.face(t.x, t.y);
}

// ── Effect shells (same idea as ult-signature-moves.js) ──
class Flyer extends Effect {
  constructor({ from, to, dur, arc = 0, paint, onArrive, layer = 'air' }) {
    super(layer, dur);
    const p = at(from);
    Object.assign(this, { p0: { x: p.x, y: p.y, z: p.z ?? 0 }, to, arc, paint, onArrive, x: p.x, y: p.y, z: p.z ?? 0, k: 0, ang: 0 });
  }

  update(dt) {
    this.age += dt;
    this.k = Math.min(1, this.age / this.life);
    const q = at(this.to), k = this.k, px0 = this.x, py0 = this.y - this.z;
    this.x = lerp(this.p0.x, q.x, k);
    this.y = lerp(this.p0.y, q.y, k);
    this.z = lerp(this.p0.z, q.z ?? 0, k) + this.arc * Math.sin(Math.PI * k);
    const dx = this.x - px0, dy = this.y - this.z - py0;
    if (dx || dy) this.ang = Math.atan2(dy, dx);
    if (k >= 1 && !this.arrived) {
      this.arrived = true;
      this.onArrive?.(this);
    }
    return !this.dead && this.age < this.life;
  }

  draw(ctx) {
    this.paint(ctx, Math.round(this.x), Math.round(this.y - this.z), this.age, this);
  }
}

class Stuck extends Effect {
  constructor(mon, life, paint, layer = 'air') {
    super(layer, life);
    Object.assign(this, { mon, paint });
  }

  update(dt) {
    this.age += dt;
    return !this.dead && this.age < this.life && this.mon.alive && !this.mon.hidden;
  }

  draw(ctx) {
    ctx.globalAlpha = Math.min(1, (this.life - this.age) / 0.3);
    this.paint(ctx, this.mon, this.age);
    ctx.globalAlpha = 1;
  }
}

class Painted extends Effect {
  constructor(life, paint, layer = 'air') {
    super(layer, life);
    this.paint = paint;
  }

  draw(ctx) {
    this.paint(ctx, this.age / this.life, this.age);
  }
}

// ── Pixel art ──
const px = (ctx, color, x, y, w = 1, h = 1) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};
function big(ctx, x, y, s, fn) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(s, s);
  fn();
  ctx.restore();
}
function rotated(ctx, x, y, ang, fn) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(ang);
  fn();
  ctx.restore();
}
function blob(ctx, x, y, r, fill, outline = '#1a1420') {
  ctx.fillStyle = outline;
  ctx.beginPath();
  ctx.arc(x, y, r + 1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}
function drawCoin(ctx, x, y, age) {
  const w = Math.max(1, Math.abs(Math.cos(age * 12)) * 4);
  px(ctx, '#6a4a08', x - w - 1, y - 5, w * 2 + 2, 10);
  px(ctx, '#f2c21c', x - w, y - 4, w * 2, 8);
  px(ctx, '#fff6b0', x - w + 1, y - 3, Math.max(1, w - 1), 2);
}
function drawApple(ctx, x, y) {
  blob(ctx, x, y, 7, '#d8402c');
  blob(ctx, x + 3, y + 1, 4, '#e8603c', '#d8402c');
  px(ctx, '#ffd0c0', x - 4, y - 4, 2, 2);
  px(ctx, '#4a2a10', x, y - 10, 2, 4);
  px(ctx, '#3f9a3a', x + 2, y - 10, 4, 2);
}
function drawBoulder(ctx, x, y, r, age) {
  rotated(ctx, x, y, age * 4, () => {
    ctx.fillStyle = '#3a3028';
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const a0 = (k / 9) * TAU, rr = r * (0.85 + ((k * 7) % 5) * 0.06);
      ctx.lineTo(Math.cos(a0) * (rr + 2), Math.sin(a0) * (rr + 2));
    }
    ctx.fill();
    ctx.fillStyle = '#8a7a64';
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const a0 = (k / 9) * TAU, rr = r * (0.85 + ((k * 7) % 5) * 0.06);
      ctx.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
    }
    ctx.fill();
    px(ctx, '#c8b898', -r * 0.5, -r * 0.5, r * 0.6, 3);
    px(ctx, '#5a4a3a', r * 0.1, r * 0.2, 4, 3);
  });
}
function drawBarb(ctx, x, y, ang) {
  rotated(ctx, x, y, ang, () => {
    px(ctx, '#2a1030', -6, -2, 12, 4);
    px(ctx, '#b060d0', -5, -1, 9, 2);
    px(ctx, '#f0d0ff', 4, -1, 2, 2);
  });
}
function drawGhost(ctx, x, y, age, c = '#c8a8ff') {
  const w = Math.sin(age * 18) * 1.5;
  px(ctx, '#1a0c2a', x - 5, y - 6, 10, 9);
  px(ctx, c, x - 4, y - 5, 8, 7);
  px(ctx, c, x - 4 + w, y + 2, 2, 3);
  px(ctx, c, x + 2 - w, y + 2, 2, 3);
  px(ctx, '#1a0c2a', x - 2, y - 3, 1, 2);
  px(ctx, '#1a0c2a', x + 1, y - 3, 1, 2);
}
function drawLance(ctx, x, y, ang) {
  rotated(ctx, x, y, ang, () => {
    ctx.fillStyle = '#1f4a6a';
    ctx.beginPath();
    ctx.moveTo(30, 0); ctx.lineTo(-22, -7); ctx.lineTo(-26, 0); ctx.lineTo(-22, 7);
    ctx.fill();
    ctx.fillStyle = '#bfefff';
    ctx.beginPath();
    ctx.moveTo(27, 0); ctx.lineTo(-20, -5); ctx.lineTo(-23, 0); ctx.lineTo(-20, 5);
    ctx.fill();
    px(ctx, '#ffffff', -16, -2, 34, 2);
  });
}
function drawPlate(ctx, x, y, ang) {
  rotated(ctx, x, y, ang, () => {
    px(ctx, '#2a1010', -6, -4, 12, 8);
    px(ctx, '#c8402c', -5, -3, 10, 6);
    px(ctx, '#f2c21c', -4, -2, 8, 1);
  });
}
function drawMouse(ctx, x, y, age) {
  const hop = Math.abs(Math.sin(age * 16)) * 3;
  px(ctx, '#3a2a2a', x - 4, y - 6 - hop, 9, 7);
  px(ctx, '#f6f0e8', x - 3, y - 5 - hop, 7, 5);
  px(ctx, '#3a2a2a', x - 5, y - 8 - hop, 3, 3);
  px(ctx, '#3a2a2a', x + 3, y - 8 - hop, 3, 3);
  px(ctx, '#ff8ab0', x - 4, y - 7 - hop, 1, 1);
  px(ctx, '#1a1010', x, y - 4 - hop, 1, 1);
}
function drawTatsugiri(ctx, x, y, ang) {
  rotated(ctx, x, y, ang, () => {
    px(ctx, '#2a1a1a', -6, -4, 12, 8);
    px(ctx, '#ff8a3a', -5, -3, 10, 6);
    px(ctx, '#fff0d0', -5, 0, 10, 2);
    px(ctx, '#1a1010', 2, -2, 1, 1);
  });
}
function drawHex(ctx, x, y, r, fill, line = '#0a2a14') {
  ctx.fillStyle = line;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) ctx.lineTo(x + Math.cos(k * TAU / 6) * (r + 1), y + Math.sin(k * TAU / 6) * (r + 1));
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) ctx.lineTo(x + Math.cos(k * TAU / 6) * r, y + Math.sin(k * TAU / 6) * r);
  ctx.fill();
}
function drawHeart(ctx, x, y, c) {
  px(ctx, '#3a0a20', x - 4, y - 3, 3, 3); px(ctx, '#3a0a20', x + 1, y - 3, 3, 3); px(ctx, '#3a0a20', x - 4, y, 8, 2); px(ctx, '#3a0a20', x - 2, y + 2, 4, 2);
  px(ctx, c, x - 3, y - 2, 2, 2); px(ctx, c, x + 1, y - 2, 2, 2); px(ctx, c, x - 3, y, 6, 1); px(ctx, c, x - 1, y + 1, 2, 2);
}
function drawGem(ctx, x, y, s, c) {
  ctx.fillStyle = '#1a2a3a';
  ctx.beginPath();
  ctx.moveTo(x, y - s - 1); ctx.lineTo(x + s + 1, y); ctx.lineTo(x, y + s + 1); ctx.lineTo(x - s - 1, y);
  ctx.fill();
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y);
  ctx.fill();
  px(ctx, '#ffffff', x - s / 2, y - s / 2, 2, 2);
}
function drawNote(ctx, x, y, color) {
  px(ctx, '#1b1b2a', x - 1, y - 1, 5, 4);
  px(ctx, color, x, y, 3, 2);
  px(ctx, '#1b1b2a', x + 2, y - 8, 2, 9);
  px(ctx, color, x + 2, y - 7, 1, 8);
  px(ctx, color, x + 3, y - 7, 2, 1);
}
// A big open hand reaching sideways (palm, four curled fingers, thumb, cuff); `flip` points it left.
function drawHand(ctx, x, y, s, flip, fill = '#ececf2', cuff = '#e8c84a') {
  big(ctx, x, y, s, () => {
    if (flip) ctx.scale(-1, 1);
    const O = '#2a2a34', shade = 'rgba(0,0,0,0.18)';
    // cuff
    px(ctx, O, -14, -9, 6, 18); px(ctx, cuff, -13, -8, 4, 16); px(ctx, '#62b947', -12, -5, 2, 2); px(ctx, '#62b947', -12, 2, 2, 2);
    // palm
    px(ctx, O, -9, -10, 13, 20); px(ctx, fill, -8, -9, 11, 18); px(ctx, shade, -8, 3, 11, 6);
    // four fingers reaching forward
    for (let k = 0; k < 4; k++) {
      const fy = -9 + k * 5;
      px(ctx, O, 3, fy, 9, 5); px(ctx, fill, 4, fy + 1, 7, 3); px(ctx, shade, 4, fy + 3, 7, 1); px(ctx, O, 10, fy + 1, 1, 1);
    }
    // thumb on top
    px(ctx, O, -4, -14, 9, 5); px(ctx, fill, -3, -13, 7, 3);
  });
}

// A water shuriken: four curved blades round a hole, dark-outlined so it reads on any arena.
function drawShuriken(ctx, x, y, r, ang) {
  const blade = (rr, grow) => {
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a0 = ang + k * Math.PI / 2;
      ctx.moveTo(x + Math.cos(a0 - 0.6) * rr * 0.34, y + Math.sin(a0 - 0.6) * rr * 0.34);
      ctx.quadraticCurveTo(x + Math.cos(a0 - 0.15) * rr * 0.8, y + Math.sin(a0 - 0.15) * rr * 0.8, x + Math.cos(a0 + 0.25) * (rr + grow), y + Math.sin(a0 + 0.25) * (rr + grow));
      ctx.quadraticCurveTo(x + Math.cos(a0 + 0.45) * rr * 0.5, y + Math.sin(a0 + 0.45) * rr * 0.5, x + Math.cos(a0 + 0.9) * rr * 0.34, y + Math.sin(a0 + 0.9) * rr * 0.34);
    }
    ctx.fill();
  };
  ctx.fillStyle = '#0f2a5a'; blade(r + 2, 2);
  ctx.fillStyle = '#5aa6f0'; blade(r, 0);
  ctx.fillStyle = 'rgba(225,246,255,0.9)'; blade(r * 0.6, 0);
  ctx.fillStyle = '#0f2a5a'; ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, TAU); ctx.fill();
}

// ── Shared beats ──
// Dims the arena and charges the user up (a legendary set piece starts here).
function setPiece(a, g, u, { dim = '10,12,24', alpha = 0.55, len = 3, aura = [255, 255, 255], rings = ['#ffffff', '#c8d0e8'], gather } = {}) {
  g.spawn(new ScreenDim(len, alpha, dim));
  g.spawn(new EnergyAura(u, Math.min(1.2, len), true, { glow: aura, rings }));
  if (gather) inward(g, u.x, u.y, u.bodyZ, 26, 96, gather, 0.7);
}
// A hit landing: sparks, two rings and a glow (no flash, no hit-pause).
function impact(g, m, colors, size = 1) {
  spray(g, m.x, m.y, m.bodyZ, Math.round(16 * size), colors, { speed: 120 * size, up: 120 * size, size: [2, 5] });
  for (const [r1, life] of [[26 * size, 0.22], [58 * size, 0.38]]) g.spawn(new Ring(m.x, m.y, { z: m.bodyZ, r0: 6, r1, life, color: colors[0], width: 3, layer: 'air' }));
  g.spawn(new Glow(m.x, m.y, m.bodyZ, 26 * size, rgb(colors[1] ?? colors[0]), 0.3));
}
// `n` things thrown at the foe, `gap` apart, each dealing frac/n.
function hurl(a, g, u, t, { at: t0 = 0, n = 1, gap = 0.08, dur = 0.4, arc = 16, spread = 8, from, paint, frac = 1, kb = 80, onHit } = {}) {
  for (let i = 0; i < n; i++) a.later(t0 + i * gap, () => {
    const off = { x: rand(-spread, spread), y: rand(-spread / 2, spread / 2), z: rand(-spread / 2, spread) };
    const start = from ? at(from) : { x: u.x + rand(-6, 6), y: u.y, z: u.bodyZ + rand(-4, 8) };
    g.spawn(new Flyer({ from: start, to: () => ({ x: t.x + off.x, y: t.y + off.y, z: t.bodyZ + off.z }), dur, arc, paint: (ctx, x, y, age, f) => paint(ctx, x, y, age, f, i),
      onArrive: () => {
        onHit?.(i);
        a.strike(frac / n, { customArt: true, knockback: i === n - 1 ? kb * 2 : kb * 0.4, stagger: 0.25 });
      } }));
  });
}
// The user dashes through the foe (past it), striking on contact.
function rushInto(a, g, u, t, { at: t0 = 0, dur = 0.24, ghost = '#ffffff', lines, frac = 1, kb = 220, anim = 'Walk', past = 34, onHit } = {}) {
  a.later(t0, () => {
    face(a, u, t);
    a.anim(anim, 2);
    const ang = u.aimAt(t), to = clampPt(t.x + Math.cos(ang) * past, t.y + Math.sin(ang) * past);
    glide(a, g, u, to, dur, ghost, { lines });
    a.later(dur * 0.75, () => {
      a.anim('Attack', 1.5);
      onHit?.();
      a.strike(frac, { customArt: true, knockback: kb, stagger: 0.45 });
    });
  });
}
// Something dropped from high above onto the foe.
function fromSky(a, g, t, { at: t0 = 0, dur = 0.5, height = 240, paint, frac = 1, kb = 160, onLand } = {}) {
  a.later(t0, () => {
    g.spawn(new Ring(t.x, t.y, { r0: 24, r1: 10, life: dur, color: '#ffffff', width: 2, hold: true }));
    g.spawn(new Flyer({ from: () => ({ x: t.x, y: t.y, z: height }), to: () => ({ x: t.x, y: t.y, z: t.bodyZ }), dur, paint, onArrive: () => {
      onLand?.();
      a.strike(frac, { customArt: true, knockback: kb, stagger: 0.5 });
    } }));
  });
}
// Particles drifting over the whole arena for `dur` seconds (weather in a set piece).
function weather(a, g, dur, per, make) {
  let t = 0;
  a.ticks.push(dt => {
    if ((t += dt) > dur) return;
    for (let k = 0; k < per; k++) g.particles.spawn(make(k));
  });
}
// The user spins in place, throwing off rings in `colors`.
function spinUser(a, g, u, dur, colors) {
  a.anim('Rotate', 2.5);
  let t = 0, ring = 0;
  a.ticks.push(dt => {
    if ((t += dt) > dur) return;
    if ((ring += dt) >= 0.1) {
      ring = 0;
      g.spawn(new SlashArc(u.x, u.y, u.bodyZ, t * 16, { radius: u.radius + 10, spread: 2.4, colors, width: 4, life: 0.2 }));
    }
  });
}
const status = (g, t, u, name, dur) => { if (t.alive && !t.hidden) g.applyStatus(t, name, { source: u, dur }); };


// A beam fired from `from` through the foe and on to the far edge of the arena (it isn't cut short at the foe).
// Returns the time the beam's front takes to reach the foe.
function fullBeam(a, g, from, t, { width, colors, life = 1.2, speed = 1300, trail } = {}) {
  const ang = Math.atan2(t.y - t.bodyZ - from.y, t.x - from.x), reach = 820;
  const end = { x: from.x + Math.cos(ang) * reach, y: from.y + Math.sin(ang) * reach };
  const beam = g.spawn(new Beam(from.x, from.y, from.x, from.y, life, { width, colors, tapered: true }));
  const total = reach / speed;
  a.ticks.push(() => {
    const k = Math.min(1, beam.age / total);
    beam.set(from.x, from.y, lerp(from.x, end.x, k), lerp(from.y, end.y, k));
    if (trail && Math.random() < 0.7) {
      const q = Math.random() * k;
      g.particles.spawn({ x: lerp(from.x, end.x, q), y: lerp(from.y, end.y, q) + 20, z: 20, vx: rand(-30, 30), vy: rand(-30, 30), vz: rand(10, 60), life: 0.5, size: rand(2, 5), sizeEnd: 1, colors: trail });
    }
  });
  return Math.hypot(t.x - from.x, t.y - t.bodyZ - from.y) / speed;
}

function flameRise(g, u, dur) {
  let t = 0;
  return dt => {
    if ((t += dt) > dur) return;
    for (let k = 0; k < 3; k++) {
      const ang = rand(0, TAU), r = u.radius * rand(0.5, 1.2);
      g.particles.spawn({ x: u.x + Math.cos(ang) * r, y: u.y + Math.sin(ang) * r * 0.5, z: rand(2, u.bodyZ * 1.6), vz: rand(40, 90), gz: -20, life: rand(0.35, 0.6), size: rand(3, 6), sizeEnd: 1,
        colors: ['#fffbd0', '#ffe066', '#ffab33', '#ff6a1f', '#d23a17'] });
    }
  };
}

const FIRE = ['#fffbd0', '#ffe066', '#ffab33', '#ff6a1f', '#d23a17'];
const ELEC = ['#ffffff', '#fff27a', '#ffd23a'];
const ICE = ['#ffffff', '#c8f2ff', '#7ad8f0', '#2b8ac0'];

export const SIGNATURE_MOVE_ULTS_2 = {

  // Ash-Greninja: Water Shuriken, "hits the target with throwing stars two to five times in a row" — Ash-Greninja's
  // giant shuriken. A whirlpool rises round it as the giant water shuriken forms on its back; it flings a volley of
  // small shuriken, then hurls the giant one, which grinds into the foe and bursts.
  waterShurikenBarrage(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.7);
    const WATER = ['#ffffff', '#9fe8ff', '#5aa6f0', '#1f4a8a'];
    g.spawn(new ScreenDim(2.9, 0.45, '6,18,40'));
    // The whirlpool.
    let tt = 0;
    a.ticks.push(dt => {
      if ((tt += dt) > 1.1) return;
      for (let k = 0; k < 4; k++) {
        const ang = tt * 10 + k * TAU / 4, r = u.radius + 10;
        g.particles.spawn({ x: u.x + Math.cos(ang) * r, y: u.y + Math.sin(ang) * r * 0.5, z: tt * 30, vx: -Math.sin(ang) * 70, vy: Math.cos(ang) * 35, vz: rand(50, 90), gz: 0, life: 0.45, size: rand(2, 4), sizeEnd: 1, colors: WATER });
      }
    });
    // The giant shuriken forms on its back and spins.
    const back = () => ({ x: u.x, y: u.y - u.bodyZ - 8 });
    g.spawn(new Painted(1.5, (ctx, p, age) => {
      const b = back(), r = 5 + Math.min(1, p * 1.6) * 9;
      drawShuriken(ctx, b.x, b.y, r, age * 14);
    }));
    // A volley of small shuriken.
    for (let i = 0; i < 3; i++) a.later(0.5 + i * 0.14, () => {
      face(a, u, t);
      a.anim('Shoot', 2);
      g.spawn(new Flyer({ from: { x: u.x, y: u.y, z: u.bodyZ }, to: () => ({ x: t.x + (i - 1) * 6, y: t.y, z: t.bodyZ }), dur: 0.26, arc: 6,
        paint: (ctx, x, y, age) => drawShuriken(ctx, x, y, 6, age * 30),
        onArrive: () => {
          spray(g, t.x, t.y, t.bodyZ, 6, WATER, { speed: 90, up: 70 });
          a.strike(0.1, { customArt: true, knockback: 20, stagger: 0.2 });
        } }));
    });
    // The giant one.
    a.later(1.5, () => {
      face(a, u, t);
      a.anim('Attack', 1.3);
      g.spawn(new Flyer({ from: back(), to: () => ({ x: t.x, y: t.y, z: t.bodyZ }), dur: 0.36, arc: 30, paint: (ctx, x, y, age, f) => {
        drawShuriken(ctx, x, y, 14, age * 26);
        g.particles.spawn({ x: f.x, y: f.y, z: f.z, vx: rand(-40, 40), vy: rand(-30, 30), vz: rand(0, 40), life: 0.4, size: rand(2, 4), sizeEnd: 1, colors: WATER });
      }, onArrive: () => {
        // It grinds into the foe…
        g.spawn(new Stuck(t, 0.5, (ctx, mon, age) => drawShuriken(ctx, mon.x, mon.y - mon.bodyZ, 14, age * 34)));
        for (let k = 0; k < 4; k++) a.later(k * 0.11, () => {
          spray(g, t.x, t.y, t.bodyZ, 8, WATER, { speed: 130, up: 90 });
          a.strike(0.1, { customArt: true, knockback: 15, stagger: 0.3 });
        });
        // …and bursts.
        a.later(0.5, () => {
          waterSplash(g, t.x, t.y);
          spray(g, t.x, t.y, t.bodyZ, 30, WATER, { speed: 220, up: 200, size: [2, 6] });
          for (const [r1, life, c] of [[60, 0.35, '#ffffff'], [140, 0.55, '#5aa6f0'], [210, 0.75, '#1f4a8a']]) g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 8, r1, life, color: c, width: 5, layer: 'air' }));
          g.marks.wet(t.x, t.y, 40);
          g.shake(8, 0.35);
          a.strike(0.3, { customArt: true, knockback: 260, stagger: 0.55 });
        });
      } }));
    });
    a.end(2.9);
  },

  // Lugia: "A vortex of air is shot at the target." Storm clouds roll in and gales sweep the arena, Lugia rises as
  // the wind spirals into its mouth, then fires the vortex.
  aeroblast(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    setPiece(a, g, u, { dim: '10,16,34', alpha: 0.6, len: 3.4, aura: [200, 220, 255], rings: ['#ffffff', '#c8d8ff'] });
    for (let k = 0; k < 4; k++) g.spawn(new StormCloud(lerp(BOUNDS.minX + 40, BOUNDS.maxX - 40, k / 3), BOUNDS.minY + 20, 3.3, { rgb: [200, 220, 255] }));
    weather(a, g, 3.2, 5, k => ({ x: BOUNDS.minX - 30, y: rand(BOUNDS.minY - 30, BOUNDS.maxY), z: rand(0, 120), vx: rand(380, 520), vy: rand(-30, 30), vz: 0, gz: 0,
      life: rand(0.9, 1.3), size: rand(2, 4), sizeEnd: 1, colors: k % 2 ? ['#ffffff', '#e6f6ff'] : ['#c8d8ff', '#8aa0e0'] }));
    // It rises as the wind spirals into its mouth.
    let rise = 0;
    a.ticks.push(dt => { if ((rise += dt) < 1.1) u.zOverride = 30 * Math.min(1, rise / 0.8); });
    let sp = 0;
    a.ticks.push(dt => {
      if ((sp += dt) > 1.1) return;
      const m = a.mouth();
      for (let k = 0; k < 4; k++) {
        const ang = sp * 12 + k * TAU / 4, r = 90 * (1 - (sp % 0.35) / 0.35) + 10;
        g.particles.spawn({ x: m.x + Math.cos(ang) * r, y: m.y + Math.sin(ang) * r * 0.5, z: m.z, vx: -Math.cos(ang) * 160, vy: -Math.sin(ang) * 80, vz: 0, gz: 0, life: 0.3, size: rand(2, 4), sizeEnd: 1, colors: ['#ffffff', '#c8d8ff'] });
      }
    });
    a.later(1.15, () => {
      face(a, u, t);
      a.anim('Shoot', 0.8);
      const ang = u.aimAt(t);
      g.spawn(new AeroblastBeam(u, u.x + Math.cos(ang) * 720, u.y + Math.sin(ang) * 720 - 10, 110, 1.1));
      g.shake(7, 1);
      play('beamFire');
      for (let k = 0; k < 5; k++) a.later(0.12 + k * 0.18, () => {
        g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 8, r1: 46, life: 0.3, color: '#e6f6ff', width: 3, layer: 'air' }));
        a.strike(k === 4 ? 0.36 : 0.16, { customArt: true, knockback: k === 4 ? 280 : 40, stagger: 0.4 });
      });
      a.later(1.0, () => {
        for (const [r1, life, c] of [[90, 0.4, '#ffffff'], [200, 0.6, '#c8d8ff'], [300, 0.8, '#3a4ab0']]) g.spawn(new Ring(t.x, t.y, { r0: 10, r1, life, color: c, width: 6 }));
        u.zOverride = null;
      });
    });
    a.end(3.1);
  },

  // Magearna: "Unleashes a powerful beam." Its Soul-Heart glows and gathers light, gears and petals circling it,
  // then a colossal pink cannon blast that runs the whole length of the arena.
  fleurCannonUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.5);
    setPiece(a, g, u, { dim: '24,10,22', alpha: 0.65, len: 3.4, aura: [255, 160, 210], rings: ['#ffffff', '#ff9ad0'] });
    const heart = () => ({ x: u.x, y: u.y - u.bodyZ });
    g.spawn(new Painted(1.3, (ctx, p, age) => {
      const h = heart(), r = 6 + p * 14;
      const gl = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, r * 3);
      gl.addColorStop(0, 'rgba(255,240,250,0.95)'); gl.addColorStop(0.4, 'rgba(255,120,190,0.6)'); gl.addColorStop(1, 'rgba(255,120,190,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(h.x - r * 3, h.y - r * 3, r * 6, r * 6);
      big(ctx, h.x, h.y, 1.5, () => drawHeart(ctx, 0, 0, '#ff5aa8'));
      for (let k = 0; k < 8; k++) {
        const ang = age * (k % 2 ? 3 : -3) + (k / 8) * TAU, rr = 44 - p * 14, x = h.x + Math.cos(ang) * rr, y = h.y + Math.sin(ang) * rr * 0.6;
        if (k % 2) { px(ctx, '#3a2a3a', x - 3, y - 3, 6, 6); px(ctx, '#ffd0e8', x - 2, y - 2, 4, 4); }
        else { px(ctx, '#2a2a34', x - 4, y - 4, 8, 8); px(ctx, '#c8ccd8', x - 3, y - 3, 6, 6); px(ctx, '#2a2a34', x - 1, y - 1, 2, 2); }
      }
    }));
    inward(g, u.x, u.y, u.bodyZ, 30, 110, ['#ffffff', '#ff9ad0', '#ffd0e8'], 0.9);
    a.later(1.25, () => {
      face(a, u, t);
      a.anim('Shoot', 0.7);
      const hit = fullBeam(a, g, heart(), t, { width: 58, colors: ['#7a2a5a', '#ff9ad0', '#fff4fa'], life: 1.4, trail: ['#ffffff', '#ff9ad0'] });
      g.shake(6, 1.2);
      play('beamFire');
      for (let k = 0; k < 4; k++) a.later(hit + k * 0.22, () => a.strike(k === 3 ? 0.4 : 0.2, { customArt: true, knockback: k === 3 ? 280 : 50, stagger: 0.45 }));
      a.later(hit + 0.9, () => {
        spray(g, t.x, t.y, t.bodyZ, 30, ['#ffffff', '#ff9ad0', '#ffd0e8', '#7ae07a'], { speed: 220, up: 180, size: [2, 5] });
        for (const [r1, life, c] of [[90, 0.4, '#ffffff'], [190, 0.6, '#ff9ad0'], [280, 0.8, '#7a2a5a']]) g.spawn(new Ring(t.x, t.y, { r0: 10, r1, life, color: c, width: 6 }));
        g.shake(9, 0.4);
      });
    });
    a.end(3.3);
  },
  // "Charging forward while cloaked in electricity. May paralyze."
  voltTackleUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    g.spawn(new EnergyAura(u, 1.2, true, { glow: [255, 230, 90], rings: ['#ffffff', '#ffd23a'] }));
    let t1 = 0;
    a.ticks.push(dt => { if ((t1 += dt) < 1.1 && Math.random() < 0.5) electricBurst(g, u.x, u.y, u.bodyZ, 3); });
    rushInto(a, g, u, t, { at: 0.55, dur: 0.26, ghost: '#ffe066', lines: '#fff6a0', kb: 240, onHit: () => {
      g.spawn(new Lightning(t.x, t.y - 200, t.x, t.y - t.bodyZ, 0.3, { width: 3, branches: 3 }));
      electricBurst(g, t.x, t.y, t.bodyZ, 16);
      impact(g, t, ELEC, 1.2);
    } });
    a.later(1.1, () => status(g, t, u, 'para'));
    a.end(1.6);
  },

  // "A tackle like a raging bull. It can also break barriers."
  ragingBullUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 1);
    for (let k = 0; k < 4; k++) a.later(k * 0.12, () => dustCloud(g, u.x, u.y, 4, 4));
    rushInto(a, g, u, t, { at: 0.55, dur: 0.3, ghost: '#e0a070', lines: '#ffffff', kb: 300, onHit: () => {
      // A barrier shatters: glass-like shards.
      spray(g, t.x, t.y, t.bodyZ, 18, ['#ffffff', '#bfe8ff', '#8ac8f0'], { speed: 200, up: 120, size: [2, 4] });
      dustCloud(g, t.x, t.y, 10, 6);
      impact(g, t, ['#ffffff', '#e0a070'], 1.3);
      g.shake(7, 0.3);
    } });
    a.end(1.5);
  },

  // "Three consecutive kicks that grow stronger with each hit."
  tripleKickUlt(a, g, u, t) {
    face(a, u, t);
    rushInto(a, g, u, t, { at: 0.2, dur: 0.2, ghost: '#ffd0a0', frac: 0.17, kb: 40, past: -10, onHit: () => impact(g, t, ['#ffffff', '#ffd0a0'], 0.7) });
    for (const [i, f] of [[1, 0.33], [2, 0.5]]) a.later(0.45 + i * 0.25, () => {
      face(a, u, t);
      a.anim(i === 2 ? 'Rotate' : 'Attack', 2);
      g.spawn(new SlashArc(t.x, t.y, t.bodyZ, u.aimAt(t) + (i === 2 ? 0 : 0.8), { radius: 18 + i * 6, spread: 2.2, colors: ['#ffd0a0', '#ffffff'], width: 4 + i, life: 0.25 }));
      impact(g, t, ['#ffffff', '#ff9a3a'], 0.8 + i * 0.3);
      a.strike(f, { customArt: true, knockback: i === 2 ? 260 : 60, stagger: 0.35 });
    });
    a.end(1.6);
  },

  // "Launches a huge boulder at the target."
  rockWreckerUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    const hold = { x: u.x, y: u.y, z: u.headZ ?? u.bodyZ * 1.8 };
    g.spawn(new Painted(0.6, (ctx, p) => drawBoulder(ctx, hold.x, hold.y - hold.z - 22 - p * 6, 8 + p * 10, 0)));
    a.later(0.6, () => {
      face(a, u, t);
      a.anim('Attack', 1.2);
      g.spawn(new Flyer({ from: { x: u.x, y: u.y, z: hold.z + 24 }, to: () => body(t), dur: 0.5, arc: 50, paint: (ctx, x, y, age) => drawBoulder(ctx, x, y, 18, age), onArrive: () => {
        debris(g, t.x, t.y, 22, 180);
        dustCloud(g, t.x, t.y, 14, 7);
        g.marks.fracture(t.x, t.y, 34, 6);
        g.shake(9, 0.4);
        impact(g, t, ['#e8dcc0', '#8a7a64'], 1.4);
        a.strike(1, { customArt: true, knockback: 280, stagger: 0.6 });
      } }));
    });
    a.end(1.9);
  },

  // Uxie, Mesprit and Azelf: "Emits a mysterious power." The three lake-guardian lights circle it and strike.
  mysticalPowerUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    setPiece(a, g, u, { dim: '30,10,40', len: 2.8, aura: [255, 190, 230], rings: ['#ffffff', '#ff8ad0'], gather: ['#ffffff', '#ff8ad0', '#fff27a', '#7ab8ff'] });
    const LAKE = [['#fff27a', [255, 240, 120]], ['#ff8ad0', [255, 140, 210]], ['#7ab8ff', [120, 180, 255]]];
    g.spawn(new Painted(1.3, (ctx, p, age) => {
      for (const [k, [c]] of LAKE.entries()) {
        const ang = age * 5 + (k / 3) * TAU, r = 30 - p * 8, x = u.x + Math.cos(ang) * r, y = u.y - u.bodyZ + Math.sin(ang) * r * 0.6;
        blob(ctx, x, y, 5, c);
        px(ctx, '#ffffff', x - 2, y - 2, 2, 2);
      }
    }));
    a.later(1.25, () => {
      a.anim('Shoot', 1);
      for (const [k, [c, col]] of LAKE.entries()) a.later(k * 0.12, () => {
        g.spawn(new Flyer({ from: { x: u.x, y: u.y, z: u.bodyZ + 6 }, to: () => body(t), dur: 0.35, arc: 30 - k * 20, paint: (ctx, x, y) => { blob(ctx, x, y, 6, c); px(ctx, '#ffffff', x - 2, y - 2, 2, 2); },
          onArrive: () => {
            g.spawn(new Glow(t.x, t.y, t.bodyZ, 40, col, 0.35));
            g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 8, r1: 70, life: 0.4, color: c, width: 4, layer: 'air' }));
            a.strike(1 / 3, { customArt: true, knockback: k === 2 ? 220 : 60, stagger: 0.35 });
          } }));
      });
      a.later(0.6, () => g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 10, r1: 160, life: 0.6, color: '#ffffff', width: 5, layer: 'air' })));
    });
    a.end(2.6);
  },

  // Heatran: "Whips up a fiercely burning firestorm at the targets' feet; it keeps hurting them." A magma pool
  // opens under the foe and a fire tornado rages over it, trapping it.
  magmaStormUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    setPiece(a, g, u, { dim: '40,10,4', alpha: 0.6, len: 3.4, aura: [255, 140, 50], rings: ['#ffe066', '#d23a17'], gather: FIRE });
    weather(a, g, 3.2, 2, () => ({ x: rand(BOUNDS.minX, BOUNDS.maxX), y: rand(BOUNDS.minY, BOUNDS.maxY), z: 0, vz: rand(30, 80), gz: -10, life: rand(0.8, 1.4), size: rand(2, 4), sizeEnd: 1, colors: ['#ffab33', '#d23a17'] }));
    a.later(0.7, () => {
      a.anim('Shoot', 1);
      for (let k = 0; k < 8; k++) a.later(k * 0.05, () => g.marks.scorch(t.x + rand(-30, 30), t.y + rand(-14, 14), rand(12, 20), 6));
      g.spawn(new Painted(2.2, (ctx, p) => {
        const r = 46 * Math.min(1, p * 5), fade = p > 0.85 ? 1 - (p - 0.85) / 0.15 : 1;
        const gr = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r);
        gr.addColorStop(0, `rgba(255,240,140,${0.9 * fade})`); gr.addColorStop(0.5, `rgba(255,110,30,${0.8 * fade})`); gr.addColorStop(1, 'rgba(120,20,10,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.ellipse(t.x, t.y, r, r * 0.45, 0, 0, TAU); ctx.fill();
      }, 'ground'));
    });
    // The fire tornado.
    a.later(1.0, () => {
      let tt = 0, hit = 0;
      a.ticks.push(dt => {
        if ((tt += dt) > 1.9) return;
        for (let k = 0; k < 9; k++) {
          const h = rand(0, 110), ang = tt * 9 + rand(0, TAU), r = 10 + h * 0.32;
          g.particles.spawn({ x: t.x + Math.cos(ang) * r, y: t.y + Math.sin(ang) * r * 0.45, z: h, vx: -Math.sin(ang) * 60, vy: Math.cos(ang) * 30, vz: rand(60, 120), gz: 0,
            life: rand(0.3, 0.5), size: rand(3, 7), sizeEnd: 1, colors: FIRE });
        }
        if ((hit += dt) >= 0.3) {
          hit = 0;
          a.strike(0.13, { customArt: true, knockback: 20, stagger: 0.2 });
        }
      });
      g.shake(4, 1.8);
    });
    a.later(3.0, () => {
      impact(g, t, FIRE, 1.6);
      a.strike(0.22, { customArt: true, knockback: 200, stagger: 0.5 });
      if (t.alive) t.bound = { t: 6, tick: 0, by: 'Magma Storm' };
    });
    a.end(3.5);
  },

  // Regigigas: "The target is crushed with great force." Two colossal hands close on the foe and crush it.
  crushGripUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.8);
    setPiece(a, g, u, { dim: '14,14,18', alpha: 0.6, len: 3, aura: [255, 240, 200], rings: ['#ffffff', '#f2c21c'], gather: ['#ffffff', '#f2c21c', '#c8c8d0'] });
    for (let k = 0; k < 6; k++) a.later(0.1 + k * 0.1, () => dustCloud(g, u.x + rand(-30, 30), u.y + rand(-10, 10), 4, 4));
    const hands = new Painted(1.8, (ctx, p) => {
      const close = Math.min(1, Math.max(0, (p - 0.25) / 0.35)), squeeze = p > 0.6 ? Math.sin((p - 0.6) * 40) * 1.5 : 0;
      const gap = lerp(90, t.radius + 10, close) + squeeze, cy = t.y - t.bodyZ;
      drawHand(ctx, t.x - gap, cy, 2.2, false);
      drawHand(ctx, t.x + gap, cy, 2.2, true);
    });
    a.later(0.55, () => { a.anim('Attack', 1); g.spawn(hands); });
    for (let k = 0; k < 4; k++) a.later(1.35 + k * 0.18, () => {
      g.shake(5 + k * 2, 0.2);
      dustCloud(g, t.x, t.y, 5, 5);
      a.strike(k === 3 ? 0.4 : 0.2, { customArt: true, knockback: k === 3 ? 260 : 10, stagger: 0.5 });
    });
    a.later(2.0, () => { debris(g, t.x, t.y, 20, 160); g.marks.fracture(t.x, t.y, 36, 6); impact(g, t, ['#ffffff', '#f2c21c'], 1.5); });
    a.end(2.7);
  },

  // Cobalion, Terrakion, Virizion: "Slicing targets with a sword." Its horn becomes a blade of light that cuts
  // across the arena, then a final cross-cut.
  sacredSwordUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    setPiece(a, g, u, { dim: '10,20,30', len: 2.6, aura: [200, 240, 255], rings: ['#ffffff', '#9fd8ff'], gather: ['#ffffff', '#c8f0ff'] });
    const blade = (ang, life, width) => {
      const cx = t.x, cy = t.y - t.bodyZ, dx = Math.cos(ang) * 220, dy = Math.sin(ang) * 220;
      g.spawn(new BeamLine(cx - dx, cy - dy, cx + dx, cy + dy, life, '#9fd8ff', width));
      g.spawn(new BeamLine(cx - dx, cy - dy, cx + dx, cy + dy, life * 0.8, '#ffffff', width * 0.4));
    };
    for (const [k, ang] of [[0, -0.5], [1, 0.6], [2, -1.2]].values()) a.later(0.65 + k * 0.28, () => {
      rushInto(a, g, u, t, { dur: 0.16, ghost: '#c8f0ff', frac: 0.2, kb: 60, past: k % 2 ? -36 : 36 });
      a.later(0.12, () => { blade(ang, 0.3, 8); metalSparks(g, t.x, t.y, t.bodyZ); });
    });
    a.later(1.65, () => {
      a.anim('Swing', 1.2);
      blade(Math.PI / 4, 0.5, 14);
      blade(-Math.PI / 4, 0.5, 14);
      impact(g, t, ['#ffffff', '#9fd8ff'], 1.5);
      a.strike(0.4, { customArt: true, knockback: 260, stagger: 0.55 });
    });
    a.end(2.3);
  },

  // Tornadus: "Savagely cold winds that make body and spirit tremble; may lower Speed." A gale howls over the arena.
  bleakwindStormUlt(a, g, u, t) {
    stormSetPiece(a, g, u, t, {
      dim: '10,24,30', aura: [170, 240, 220], rings: ['#ffffff', '#9fe8c8'], swirl: true,
      gust: k => ({ colors: k % 3 ? ['#ffffff', '#c8f2ff'] : ['#9fe8c8', '#5ab0a0'] }),
      strike: () => g.spawn(new StormSwirl(t.x, t.y, 70, 0.6)),
      end: () => status(g, t, u, 'slow', 3),
    });
  },

  // Thundurus: "A thunderous tempest; lightning and wind; may paralyze."
  wildboltStormUlt(a, g, u, t) {
    stormSetPiece(a, g, u, t, {
      dim: '14,10,30', aura: [255, 240, 120], rings: ['#ffffff', '#fff27a'],
      gust: k => ({ colors: k % 2 ? ['#ffffff', '#d8d8f0'] : ['#fff27a', '#b8a8f0'] }),
      clouds: true,
      strike: k => {
        g.spawn(new Lightning(t.x + rand(-20, 20), t.y - 260, t.x, t.y - t.bodyZ, 0.3, { width: 3, branches: 4 }));
        electricBurst(g, t.x, t.y, t.bodyZ, 10);
        if (k % 2) g.spawn(new Lightning(rand(BOUNDS.minX, BOUNDS.maxX), BOUNDS.minY - 80, rand(BOUNDS.minX, BOUNDS.maxX), rand(BOUNDS.minY, BOUNDS.maxY), 0.25, { width: 2 }));
      },
      end: () => status(g, t, u, 'para'),
    });
  },

  // Landorus: "Fierce winds and searingly hot sand; may burn."
  sandsearStormUlt(a, g, u, t) {
    stormSetPiece(a, g, u, t, {
      dim: '40,26,10', aura: [255, 200, 120], rings: ['#fff0c8', '#e0a050'], swirl: true,
      gust: k => ({ colors: k % 2 ? ['#e8c890', '#c89a50'] : ['#ffab33', '#d8b070'] }),
      strike: () => { g.spawn(new StormSwirl(t.x, t.y, 70, 0.6)); g.marks.scorch(t.x + rand(-10, 10), t.y, 12, 5); },
      end: () => status(g, t, u, 'burn'),
    });
  },

  // Meloetta: "An ancient song that strikes the hearts of its targets as it dances out of the way; may make them drowsy."
  relicSongUlt(a, g, u, t) {
    face(a, u, t);
    setPiece(a, g, u, { dim: '12,26,22', len: 3, aura: [180, 255, 220], rings: ['#ffffff', '#a8f0c8'] });
    a.anim('Pose', 1);
    // It dances: hops left and right leaving afterimages.
    for (let k = 0; k < 4; k++) a.later(0.15 + k * 0.22, () => {
      const p = clampPt(u.x + (k % 2 ? 26 : -26), u.y + rand(-6, 6));
      glide(a, g, u, p, 0.18, '#a8f0c8');
    });
    // The song: a staff of notes circling out over the arena, then pouring into the foe.
    const notes = ['#a8f0c8', '#ffffff', '#ffd23a', '#7ab8ff'];
    for (let i = 0; i < 20; i++) a.later(0.3 + i * 0.07, () => {
      const c = notes[i % 4], ang = (i / 20) * TAU, r = 120;
      g.spawn(new Flyer({ from: { x: u.x, y: u.y, z: u.bodyZ + 10 }, to: { x: u.x + Math.cos(ang) * r, y: u.y + Math.sin(ang) * r * 0.6, z: 40 }, dur: 0.5,
        paint: (ctx, x, y) => big(ctx, x, y, 1.6, () => drawNote(ctx, 0, 0, c)), onArrive: f => {
          g.spawn(new Flyer({ from: { x: f.x, y: f.y, z: f.z }, to: () => body(t), dur: 0.5 + (i % 5) * 0.05, arc: 20,
            paint: (ctx, x, y) => big(ctx, x, y, 1.6, () => drawNote(ctx, 0, 0, c)), onArrive: () => {
              if (i % 4 === 3) { g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 6, r1: 40, life: 0.3, color: '#a8f0c8', width: 3, layer: 'air' })); a.strike(0.2, { customArt: true, knockback: 50, stagger: 0.25 }); }
            } }));
        } }));
    });
    a.later(2.4, () => { impact(g, t, ['#ffffff', '#a8f0c8'], 1.3); status(g, t, u, 'sleep', 1.5); });
    a.end(2.9);
  },

  // Zygarde: "A powerful light that defies all laws of nature." Its cells swarm in from every edge, then it unleashes
  // the light across the whole arena.
  nihilLightUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.5);
    setPiece(a, g, u, { dim: '4,20,10', alpha: 0.7, len: 3.4, aura: [120, 255, 160], rings: ['#ffffff', '#4af07a'] });
    for (let i = 0; i < 26; i++) a.later(i * 0.03, () => {
      const e = { x: rand(BOUNDS.minX, BOUNDS.maxX), y: Math.random() < 0.5 ? BOUNDS.minY - 20 : BOUNDS.maxY + 20, z: rand(0, 60) };
      g.spawn(new Flyer({ from: e, to: () => ({ x: u.x + rand(-8, 8), y: u.y, z: u.bodyZ }), dur: rand(0.6, 0.9), arc: 20,
        paint: (ctx, x, y) => { drawHex(ctx, x, y, 4, '#4af07a'); px(ctx, '#e8ffe8', x - 1, y - 1, 2, 2); } }));
    });
    a.later(1.1, () => {
      face(a, u, t);
      a.anim('Shoot', 0.7);
      const m = a.mouth();
      const hit = fullBeam(a, g, { x: m.x, y: m.y - m.z }, t, { width: 50, colors: ['#0a3a1a', '#4af07a', '#ffffff'], life: 1.4, trail: ['#4af07a', '#ffffff'] });
      g.shake(6, 1.2);
      play('beamFire');
      for (let k = 0; k < 4; k++) a.later(hit + k * 0.22, () => {
        for (let h = 0; h < 4; h++) { const ang = rand(0, TAU); g.particles.spawn({ x: t.x, y: t.y, z: t.bodyZ, vx: Math.cos(ang) * 120, vy: Math.sin(ang) * 80, vz: rand(40, 120), life: 0.5, size: 4, sizeEnd: 1, colors: ['#4af07a', '#ffffff'] }); }
        a.strike(k === 3 ? 0.4 : 0.2, { customArt: true, knockback: k === 3 ? 260 : 50, stagger: 0.4 });
      });
      a.later(hit + 0.95, () => {
        for (const [r1, life, c] of [[80, 0.35, '#ffffff'], [180, 0.6, '#4af07a']]) g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 10, r1, life, color: c, width: 5, layer: 'air' }));
        g.shake(8, 0.4);
      });
    });
    a.end(3.2);
  },

  // The Tapus: "Hits the target with the force of nature." The guardian's shell closes and nature's power erupts
  // around the foe in rising pillars.
  naturesMadnessUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.8);
    setPiece(a, g, u, { dim: '20,10,30', alpha: 0.6, len: 3, aura: [255, 180, 230], rings: ['#ffffff', '#ffb0e0'], gather: ['#ffffff', '#ffb0e0', '#7ae07a', '#7ab8ff'] });
    const P = [[255, 220, 90], [255, 150, 220], [120, 230, 120], [120, 190, 255]];
    for (let k = 0; k < 8; k++) a.later(0.6 + k * 0.1, () => {
      const ang = (k / 8) * TAU, x = t.x + Math.cos(ang) * 46, y = t.y + Math.sin(ang) * 22;
      g.spawn(new Pillar(x, y, 0.6, P[k % 4], 200));
      leafBurst(g, x, y, 4, 3);
    });
    a.later(1.5, () => {
      g.spawn(new Pillar(t.x, t.y, 0.8, [255, 245, 255], 300));
      for (const [r1, c] of [[70, '#ffffff'], [150, '#ffb0e0'], [230, '#7ae07a']]) g.spawn(new Ring(t.x, t.y, { r0: 8, r1, life: 0.6, color: c, width: 5 }));
      g.shake(8, 0.4);
      a.strike(1, { customArt: true, knockback: 240, stagger: 0.55 });
    });
    a.end(2.6);
  },

  // Melmetal: "Spins itself around the hex nut in its chest, striking twice with its arms." The golden hex nut
  // blazes and spins, a whirl of liquid metal wraps Melmetal as it rolls in, and two crushing blows land, each
  // sending a hexagonal shockwave through the ground.
  doubleIronBashUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    setPiece(a, g, u, { dim: '20,16,8', alpha: 0.6, len: 2.9, aura: [255, 215, 120], rings: ['#fff0b0', '#c8a030'] });
    // The hex nut: a golden hexagon spinning on its chest.
    g.spawn(new Stuck(u, 1.5, (ctx, mon, age) => {
      const cx = mon.x, cy = mon.y - mon.bodyZ, r = 9 + Math.sin(age * 10) * 1.5;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(age * 8);
      ctx.fillStyle = 'rgba(255,220,120,0.35)'; ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, TAU); ctx.fill();
      drawHex(ctx, 0, 0, r, '#f2c21c', '#6a4a08');
      drawHex(ctx, 0, 0, r * 0.45, '#6a4a08', '#6a4a08');
      ctx.restore();
    }));
    // A whirl of liquid metal round it as it rolls in.
    let tt = 0;
    a.ticks.push(dt => {
      if ((tt += dt) > 1.3 || tt < 0.3) return;
      for (let k = 0; k < 3; k++) {
        const ang = tt * 14 + k * TAU / 3, r = u.radius + 14;
        g.particles.spawn({ x: u.x + Math.cos(ang) * r, y: u.y + Math.sin(ang) * r * 0.5, z: u.bodyZ + Math.sin(ang * 2) * 6, vx: -Math.sin(ang) * 80, vy: Math.cos(ang) * 40, vz: 0, gz: 0,
          life: 0.3, size: rand(3, 5), sizeEnd: 1, colors: ['#ffffff', '#c8d0d8', '#6a7480'] });
      }
    });
    a.later(0.35, () => {
      a.anim('Rotate', 2.2);
      const ang = u.aimAt(t);
      glide(a, g, u, clampPt(t.x - Math.cos(ang) * (t.radius + u.radius), t.y - Math.sin(ang) * (t.radius + u.radius)), 0.6, '#c8d0d8');
    });
    const hexWave = (r1, life, c, w) => g.spawn(new Painted(life, (ctx, p) => {
      const r = 10 + (r1 - 10) * (1 - (1 - p) * (1 - p));
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = c; ctx.lineWidth = w * (1 - p) + 1;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) ctx.lineTo(t.x + Math.cos(k * TAU / 6) * r, t.y + Math.sin(k * TAU / 6) * r * 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }, 'ground'));
    for (const k of [0, 1]) a.later(1.0 + k * 0.42, () => {
      face(a, u, t);
      a.anim('Attack', 1.6);
      hexWave(120 + k * 80, 0.55, '#f2c21c', 6);
      hexWave(70 + k * 50, 0.4, '#ffffff', 4);
      metalSparks(g, t.x, t.y, t.bodyZ);
      metalSparks(g, t.x, t.y, t.bodyZ * 1.4);
      debris(g, t.x, t.y, 12 + k * 8, 160);
      g.marks.fracture(t.x, t.y, 26 + k * 14, 6);
      g.shake(6 + k * 4, 0.35);
      a.strike(0.5, { customArt: true, knockback: k ? 300 : 60, stagger: 0.55 });
    });
    a.end(2.4);
  },

  // "Drops an apple from high above; also lowers the target's Defense."
  gravAppleUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Pose', 1);
    fromSky(a, g, t, { at: 0.35, dur: 0.55, height: 260, paint: (ctx, x, y) => big(ctx, x, y, 2, () => drawApple(ctx, 0, 0)), kb: 120, onLand: () => {
      g.shake(8, 0.35);
      dustCloud(g, t.x, t.y, 10, 6);
      g.marks.fracture(t.x, t.y, 30, 6);
      spray(g, t.x, t.y, t.bodyZ, 16, ['#d8402c', '#ffd0c0', '#3f9a3a'], { speed: 140, up: 120 });
      impact(g, t, ['#ffffff', '#d8402c'], 1.2);
    } });
    a.end(1.6);
  },

  // "Acidic liquid created from tart apples."
  appleAcidUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.5);
    hurl(a, g, u, t, { at: 0.35, n: 6, gap: 0.12, dur: 0.42, arc: 26, paint: (ctx, x, y) => { blob(ctx, x, y, 4, '#a8e070', '#2a4a10'); px(ctx, '#f0ffd0', x - 2, y - 2, 2, 2); },
      onHit: () => {
        spray(g, t.x, t.y, t.bodyZ, 8, ['#a8e070', '#e0ff90', '#5a8a20'], { speed: 80, up: 90 });
        g.marks.energy?.(t.x + rand(-8, 8), t.y, 10, [140, 210, 80], 4);
      } });
    a.end(1.6);
  },

  // "Pretends to bow its head, then stabs the target with its disheveled hair."
  falseSurrenderUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Hurt', 0.5); // the bow
    a.later(0.6, () => {
      face(a, u, t);
      a.anim('Attack', 1.6);
      const ang = u.aimAt(t);
      for (let k = 0; k < 5; k++) a.later(k * 0.05, () => {
        const off = (k - 2) * 0.12, d = u.distTo(t);
        g.spawn(new BeamLine(u.x, u.y - u.bodyZ, u.x + Math.cos(ang + off) * d, u.y - u.bodyZ + Math.sin(ang + off) * d, 0.3, '#2a0a20', 5));
        g.spawn(new BeamLine(u.x, u.y - u.bodyZ, u.x + Math.cos(ang + off) * d, u.y - u.bodyZ + Math.sin(ang + off) * d, 0.25, '#c03a8a', 2));
      });
      a.later(0.2, () => { impact(g, t, ['#ffd0f0', '#c03a8a'], 1.2); a.strike(1, { customArt: true, knockback: 230, stagger: 0.5 }); });
    });
    a.end(1.5);
  },

  // "Rends the target with its hard gills."
  fishiousRendUlt(a, g, u, t) {
    face(a, u, t);
    rushInto(a, g, u, t, { at: 0.3, dur: 0.22, ghost: '#5aa6f0', past: -14, frac: 0.4, kb: 40, onHit: () => g.spawn(new FangBite(t.x, t.y, t.bodyZ)) });
    a.later(0.75, () => {
      a.anim('Attack', 1.8);
      g.spawn(new FangBite(t.x, t.y, t.bodyZ));
      waterSplash(g, t.x, t.y);
      impact(g, t, ['#ffffff', '#5aa6f0'], 1.2);
      a.strike(0.6, { customArt: true, knockback: 240, stagger: 0.5 });
    });
    a.end(1.5);
  },

  // Urshifu: "Having mastered the Dark style, strikes the target with a fierce blow. Always a critical hit."
  wickedBlowUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.7);
    setPiece(a, g, u, { dim: '20,6,8', alpha: 0.7, len: 2.4, aura: [255, 80, 80], rings: ['#ffd0d0', '#c03a3a'], gather: ['#ffd0d0', '#c03a3a', '#1a0a10'] });
    rushInto(a, g, u, t, { at: 0.75, dur: 0.18, ghost: '#c03a3a', lines: '#ffd0d0', past: -12, frac: 0, kb: 0 });
    a.later(1.0, () => {
      a.anim('Attack', 1.2);
      for (const [r1, life, c] of [[50, 0.3, '#ffd0d0'], [140, 0.5, '#c03a3a'], [240, 0.7, '#1a0a10']]) g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 8, r1, life, color: c, width: 6, layer: 'air' }));
      spray(g, t.x, t.y, t.bodyZ, 24, ['#ffd0d0', '#c03a3a', '#1a0a10'], { speed: 220, up: 140 });
      g.shake(10, 0.45);
      a.strike(1, { customArt: true, knockback: 320, stagger: 0.6, critChance: 1 });
    });
    a.end(1.9);
  },

  // Glastrier: "Hurls a blizzard-cloaked icicle lance."
  glacialLanceUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    setPiece(a, g, u, { dim: '10,30,60', alpha: 0.6, len: 3, aura: [170, 230, 255], rings: ['#ffffff', '#7ad8f0'], gather: ICE });
    weather(a, g, 2.8, 4, k => ({ x: rand(BOUNDS.minX - 40, BOUNDS.maxX), y: rand(BOUNDS.minY - 40, BOUNDS.maxY), z: rand(120, 220), vx: rand(60, 120), vz: rand(-140, -90), gz: 0,
      life: rand(1.2, 1.8), size: rand(2, 4), sizeEnd: 1, colors: k % 2 ? ['#ffffff', '#c8f2ff'] : ['#c8f2ff', '#7ad8f0'] }));
    const hold = () => ({ x: u.x, y: u.y, z: (u.headZ ?? u.bodyZ * 1.8) + 30 });
    g.spawn(new Painted(1.0, (ctx, p, age) => {
      const h = hold(), s = Math.min(1, p * 3);
      big(ctx, h.x, h.y - h.z, s * 1.4, () => drawLance(ctx, 0, 0, -Math.PI / 2));
      if (Math.random() < 0.6) g.particles.spawn({ x: h.x + rand(-20, 20), y: h.y, z: h.z + rand(-20, 20), vx: rand(-40, 40), vz: rand(-20, 20), life: 0.4, size: 2, colors: ICE });
    }));
    a.later(1.0, () => {
      face(a, u, t);
      a.anim('Attack', 1.2);
      g.spawn(new Flyer({ from: hold(), to: () => body(t), dur: 0.35, paint: (ctx, x, y, age, f) => {
        big(ctx, x, y, 1.4, () => drawLance(ctx, 0, 0, f.ang));
        g.particles.spawn({ x: f.x, y: f.y, z: f.z, vx: rand(-30, 30), vy: rand(-30, 30), vz: rand(-10, 30), life: 0.5, size: rand(2, 5), sizeEnd: 1, colors: ICE });
      }, onArrive: () => {
        iceShatter(g, t.x, t.y, t.bodyZ);
        iceShatter(g, t.x, t.y, t.bodyZ * 1.5);
        for (let k = 0; k < 7; k++) { const ang = (k / 7) * TAU; g.spawn(new Spike(t.x + Math.cos(ang) * 26, t.y + Math.sin(ang) * 13, 'ice', 1.4)); }
        g.marks.frost(t.x, t.y, 40);
        g.shake(9, 0.4);
        impact(g, t, ICE, 1.6);
        a.strike(1, { customArt: true, knockback: 280, stagger: 0.6 });
      } }));
    });
    a.end(2.6);
  },

  // Spectrier: "Sends a frightful amount of small ghosts at opposing Pokémon."
  astralBarrageUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    setPiece(a, g, u, { dim: '10,4,20', alpha: 0.75, len: 3, aura: [200, 160, 255], rings: ['#ffffff', '#c890ff'] });
    hurl(a, g, u, t, {
      at: 0.5, n: 36, gap: 0.04, dur: 0.7, arc: 40, spread: 14,
      from: () => { const ang = rand(0, TAU); return { x: u.x + Math.cos(ang) * 60, y: u.y + Math.sin(ang) * 30, z: u.bodyZ + rand(0, 40) }; },
      paint: (ctx, x, y, age, f, i) => drawGhost(ctx, x + Math.sin(age * 10 + i) * 4, y, age, i % 3 ? '#c8a8ff' : '#e8e0ff'),
      onHit: i => { if (i % 6 === 5) g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 6, r1: 50, life: 0.3, color: '#c890ff', width: 3, layer: 'air' })); },
    });
    a.later(2.2, () => { impact(g, t, ['#ffffff', '#c890ff'], 1.5); g.shake(7, 0.3); });
    a.end(2.7);
  },

  // "Cloaking itself in psychic energy, slams into the target."
  psyshieldBashUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    g.spawn(new EnergyAura(u, 1.1, true, { glow: [255, 140, 210], rings: ['#ffffff', '#ff8ad0'] }));
    g.spawn(new Stuck(u, 1.1, (ctx, mon, age) => {
      ctx.strokeStyle = `rgba(255,138,208,${0.7 + Math.sin(age * 20) * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mon.x, mon.y - mon.bodyZ, mon.radius + 10, 0, TAU);
      ctx.stroke();
    }));
    rushInto(a, g, u, t, { at: 0.6, dur: 0.26, ghost: '#ff8ad0', lines: '#ffd0f0', kb: 280, onHit: () => impact(g, t, ['#ffffff', '#ff8ad0'], 1.3) });
    a.end(1.5);
  },

  // "Swings its stone axes; stone splinters float around the targets."
  stoneAxeUlt(a, g, u, t) {
    face(a, u, t);
    for (const k of [0, 1]) rushInto(a, g, u, t, { at: 0.25 + k * 0.4, dur: 0.18, ghost: '#c8b890', past: k ? 30 : -30, frac: 0.5, kb: k ? 220 : 60, anim: 'Walk', onHit: () => {
      g.spawn(new SlashArc(t.x, t.y, t.bodyZ, u.aimAt(t) + (k ? -0.6 : 0.6), { radius: 26, spread: 2.4, colors: ['#8a7a64', '#e8dcc0'], width: 7, life: 0.3 }));
      debris(g, t.x, t.y, 10, 120);
    } });
    // Splinters left floating round the foe.
    a.later(1.0, () => {
      const bits = Array.from({ length: 7 }, (_, k) => ({ a: (k / 7) * TAU, z: rand(0.4, 1.4) }));
      g.spawn(new Stuck(t, 2.4, (ctx, mon, age) => {
        for (const b of bits) {
          const ang = b.a + age * 1.5, x = mon.x + Math.cos(ang) * (mon.radius + 10), y = mon.y - mon.bodyZ * b.z + Math.sin(ang) * 4;
          px(ctx, '#3a3028', x - 3, y - 3, 6, 6);
          px(ctx, '#c8b890', x - 2, y - 2, 4, 4);
        }
      }));
    });
    a.end(1.7);
  },

  // Basculegion: "Attacks to avenge its allies." Pale spirit flames of fallen allies rise around it and sink into it;
  // wrapped in their glow it surges through the foe on a spectral wave.
  lastRespectsUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.8);
    g.spawn(new ScreenDim(2.8, 0.65, '4,14,22'));
    const SPIRIT = ['#ffffff', '#bff4ff', '#5ad0e8', '#1a6a8a'];
    const flames = Array.from({ length: 6 }, (_, k) => ({ ang: (k / 6) * TAU }));
    // Spirit flames: soft teardrop wisps circling it, rising, then sinking into it.
    g.spawn(new Painted(1.3, (ctx, p, age) => {
      for (const f of flames) {
        const pull = Math.max(0, (p - 0.6) / 0.4), r = 54 * (1 - pull), ang = f.ang + age * 1.5;
        const x = u.x + Math.cos(ang) * r, y = u.y + Math.sin(ang) * r * 0.5 - 18 - Math.sin(age * 4 + f.ang) * 4 - (1 - pull) * 10;
        const gl = ctx.createRadialGradient(x, y, 0, x, y, 16);
        gl.addColorStop(0, 'rgba(220,250,255,0.9)'); gl.addColorStop(0.5, 'rgba(90,208,232,0.45)'); gl.addColorStop(1, 'rgba(26,106,138,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(x - 16, y - 16, 32, 32);
        ctx.fillStyle = '#e8fcff';
        ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.quadraticCurveTo(x + 5, y, x, y + 4); ctx.quadraticCurveTo(x - 5, y, x, y - 9); ctx.fill();
        if (Math.random() < 0.4) g.particles.spawn({ x, y: u.y, z: u.y - y, vz: rand(20, 50), life: 0.4, size: 2, sizeEnd: 1, colors: SPIRIT });
      }
    }));
    a.later(1.25, () => g.spawn(new EnergyAura(u, 1.0, true, { glow: [120, 220, 240], rings: ['#ffffff', '#5ad0e8'] })));
    a.later(1.35, () => {
      face(a, u, t);
      a.anim('Walk', 2);
      const ang = u.aimAt(t), past = clampPt(t.x + Math.cos(ang) * 50, t.y + Math.sin(ang) * 50);
      let tt = 0;
      a.ticks.push(dt => {
        if ((tt += dt) > 0.45) return;
        g.spawn(new Afterimage(u, 0.35, '#5ad0e8'));
        for (let k = 0; k < 4; k++) g.particles.spawn({ x: u.x + rand(-u.radius, u.radius), y: u.y, z: rand(0, 10), vx: rand(-40, 40), vy: rand(-30, 30), vz: rand(40, 100), life: 0.45, size: rand(2, 4), sizeEnd: 1, colors: SPIRIT });
      });
      glide(a, g, u, past, 0.35, '#5ad0e8');
      a.later(0.26, () => {
        for (const [r1, life, c] of [[60, 0.35, '#ffffff'], [150, 0.55, '#5ad0e8'], [230, 0.75, '#1a6a8a']]) g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 8, r1, life, color: c, width: 5, layer: 'air' }));
        spray(g, t.x, t.y, t.bodyZ, 30, SPIRIT, { speed: 200, up: 180, size: [2, 5] });
        waterSplash(g, t.x, t.y);
        g.shake(8, 0.35);
        a.strike(1, { customArt: true, knockback: 280, stagger: 0.6 });
      });
    });
    a.end(2.6);
  },

  // "Lashes out with ruinous claws; may poison, paralyze or put to sleep."
  direClawUlt(a, g, u, t) {
    face(a, u, t);
    rushInto(a, g, u, t, { at: 0.25, dur: 0.2, ghost: '#a040c0', past: -14, frac: 0, kb: 0 });
    for (let k = 0; k < 3; k++) a.later(0.5 + k * 0.17, () => {
      a.anim('Attack', 2);
      g.spawn(new ClawSlash(t.x, t.y, t.bodyZ, u.aimAt(t), k % 2 === 1));
      spray(g, t.x, t.y, t.bodyZ, 8, ['#e070e0', '#a040c0', '#2a0a3a'], { speed: 90, up: 70 });
      a.strike(1 / 3, { customArt: true, knockback: k === 2 ? 220 : 40, stagger: 0.35 });
    });
    a.later(1.1, () => status(g, t, u, ['poison', 'para', 'sleep'][Math.floor(Math.random() * 3)]));
    a.end(1.6);
  },

  // "Launches countless toxic barbs; may poison."
  barbBarrageUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.4);
    a.later(0.3, () => a.anim('Shoot', 1.5));
    hurl(a, g, u, t, { at: 0.35, n: 24, gap: 0.035, dur: 0.32, arc: 6, spread: 14, paint: (ctx, x, y, age, f) => drawBarb(ctx, x, y, f.ang),
      onHit: i => { if (i % 6 === 5) spray(g, t.x, t.y, t.bodyZ, 6, ['#e070e0', '#a040c0'], { speed: 70, up: 60 }); } });
    a.later(1.3, () => status(g, t, u, 'poison', 6));
    a.end(1.7);
  },

  // Enamorus: "Wraps opposing Pokémon in fierce winds brimming with love and hate."
  springtideStormUlt(a, g, u, t) {
    stormSetPiece(a, g, u, t, {
      dim: '30,8,24', aura: [255, 170, 210], rings: ['#ffffff', '#ffb0d0'], swirl: true,
      gust: k => ({ colors: k % 2 ? ['#ffd0e8', '#ff7ab0'] : ['#ffffff', '#c890ff'] }),
      hearts: true,
      strike: () => g.spawn(new StormSwirl(t.x, t.y, 70, 0.6)),
    });
  },

  // "Blows out raging flames as if singing a song."
  torchSongUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.5);
    for (let i = 0; i < 6; i++) a.later(0.1 + i * 0.12, () => {
      const c = ['#ffe066', '#ff6a1f', '#ffffff'][i % 3];
      g.spawn(new Flyer({ from: { x: u.x + rand(-10, 10), y: u.y, z: u.headZ ?? u.bodyZ * 1.6 }, to: { x: u.x + rand(-30, 30), y: u.y, z: (u.headZ ?? 30) + 40 }, dur: 0.8,
        paint: (ctx, x, y, age) => big(ctx, x + Math.sin(age * 6) * 3, y, 1.6, () => drawNote(ctx, 0, 0, c)) }));
    });
    a.later(0.5, () => {
      face(a, u, t);
      a.anim('Shoot', 0.8);
      const m = a.mouth();
      let tt = 0, hit = 0;
      a.ticks.push(dt => {
        if ((tt += dt) > 1.1) return;
        const ang = u.aimAt(t);
        for (let k = 0; k < 7; k++) {
          const aa = ang + rand(-0.15, 0.15) + Math.sin(tt * 18) * 0.12, sp = rand(400, 480);
          g.particles.spawn({ x: m.x, y: m.y, z: m.z, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, vz: rand(-10, 20), gz: 0, drag: 0.3, life: 0.6, size: rand(4, 8), sizeEnd: 1, colors: FIRE });
        }
        if ((hit += dt) >= 0.27) { hit = 0; g.marks.scorch(t.x + rand(-8, 8), t.y, 12, 5); a.strike(0.25, { customArt: true, knockback: 50, stagger: 0.25 }); }
      });
    });
    a.end(1.9);
  },

  // "Toys with the target using light and fluid dance steps."
  aquaStepUlt(a, g, u, t) {
    face(a, u, t);
    for (let k = 0; k < 4; k++) a.later(0.2 + k * 0.28, () => {
      const ang = (k / 4) * TAU + 0.6, p = clampPt(t.x + Math.cos(ang) * 34, t.y + Math.sin(ang) * 20);
      a.anim(k % 2 ? 'Pose' : 'Attack', 2);
      glide(a, g, u, p, 0.16, '#5aa6f0');
      a.later(0.14, () => {
        waterSplash(g, t.x, t.y);
        g.spawn(new SlashArc(t.x, t.y, t.bodyZ, ang + Math.PI, { radius: 22, spread: 2.4, colors: ['#5aa6f0', '#e0f4ff'], width: 4, life: 0.25 }));
        a.strike(0.25, { customArt: true, knockback: k === 3 ? 220 : 40, stagger: 0.3 });
      });
    });
    a.end(1.7);
  },

  // "Discharges all the electricity from its body in one high-damage attack."
  doubleShockUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.7);
    g.spawn(new EnergyAura(u, 0.9, true, { glow: [255, 240, 120], rings: ['#ffffff', '#ffd23a'] }));
    let tt = 0;
    a.ticks.push(dt => { if ((tt += dt) < 0.8) electricBurst(g, u.x, u.y, u.bodyZ, 3); });
    rushInto(a, g, u, t, { at: 0.8, dur: 0.18, ghost: '#ffe066', lines: '#fff6a0', past: -10, kb: 280, onHit: () => {
      for (let k = 0; k < 6; k++) { const ang = (k / 6) * TAU; g.spawn(new Lightning(t.x, t.y - t.bodyZ, t.x + Math.cos(ang) * 120, t.y - t.bodyZ + Math.sin(ang) * 70, 0.35, { width: 3, branches: 2 })); }
      electricBurst(g, t.x, t.y, t.bodyZ, 24);
      impact(g, t, ELEC, 1.6);
      g.shake(8, 0.35);
    } });
    a.end(1.7);
  },

  // "Its fellows gather in droves for a combo attack that hits one to ten times."
  populationBombUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Pose', 1);
    for (let i = 0; i < 10; i++) a.later(0.25 + i * 0.11, () => {
      const side = i % 2 ? 1 : -1, start = clampPt(t.x + side * rand(80, 140), t.y + rand(-40, 40));
      g.spawn(new Flyer({ from: { x: start.x, y: start.y, z: 0 }, to: () => ({ x: t.x + side * 8, y: t.y, z: 4 }), dur: 0.3, arc: 14,
        paint: (ctx, x, y, age) => big(ctx, x, y, 1.6, () => drawMouse(ctx, 0, 0, age)),
        onArrive: () => {
          g.spawn(new Ring(t.x + side * 6, t.y, { z: t.bodyZ, r0: 4, r1: 18, life: 0.18, color: '#ffffff', width: 2, layer: 'air' }));
          a.strike(0.1, { customArt: true, knockback: i === 9 ? 220 : 25, stagger: 0.2 });
          g.spawn(new Flyer({ from: { x: t.x + side * 8, y: t.y, z: 4 }, to: { x: t.x + side * 60, y: t.y + rand(-20, 20), z: 0 }, dur: 0.3, arc: 20, paint: (ctx, x, y, age) => big(ctx, x, y, 1.6, () => drawMouse(ctx, 0, 0, age)) }));
        } }));
    });
    a.end(1.9);
  },

  // Armarouge: its armour blazes up and fires as one great flaming cannon beam across the arena.
  armorCannonUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    g.spawn(new EnergyAura(u, 1.0, true, { glow: [255, 140, 60], rings: ['#ffe066', '#7a3ac0'] }));
    a.ticks.push(flameRise(g, u, 1.0));
    inward(g, u.x, u.y, u.bodyZ, 24, 80, FIRE, 0.8);
    a.later(0.9, () => {
      face(a, u, t);
      a.anim('Shoot', 0.7);
      const m = a.mouth();
      const hit = fullBeam(a, g, { x: m.x, y: m.y - m.z }, t, { width: 46, colors: ['#5a1a6a', '#ff6a1f', '#fff6c0'], life: 1.2, trail: FIRE });
      g.shake(5, 1);
      play('beamFire');
      for (let k = 0; k < 4; k++) a.later(hit + k * 0.2, () => {
        spray(g, t.x, t.y, t.bodyZ, 8, FIRE, { speed: 110, up: 110 });
        g.marks.scorch(t.x + rand(-8, 8), t.y, 14, 6);
        a.strike(k === 3 ? 0.4 : 0.2, { customArt: true, knockback: k === 3 ? 260 : 40, stagger: 0.4 });
      });
      a.later(hit + 0.85, () => impact(g, t, FIRE, 1.6));
    });
    a.end(2.7);
  },

  // "A perfectly timed triple dive, hitting with splashes of water three times."
  tripleDiveUlt(a, g, u, t) {
    face(a, u, t);
    for (let k = 0; k < 3; k++) a.later(0.15 + k * 0.42, () => {
      face(a, u, t);
      a.anim('Hop', 1.6);
      const p = clampPt(t.x + rand(-14, 14), t.y + 6);
      glide(a, g, u, p, 0.3, '#5aa6f0', { onStep: q => { u.zOverride = 40 * Math.sin(Math.PI * q); } });
      a.later(0.3, () => {
        waterSplash(g, t.x, t.y);
        spray(g, t.x, t.y, 4, 14, ['#ffffff', '#9fe8ff', '#5aa6f0'], { speed: 120, up: 160 });
        g.marks.wet(t.x, t.y, 22);
        a.strike(1 / 3, { customArt: true, knockback: k === 2 ? 220 : 40, stagger: 0.3 });
      });
    });
    a.end(1.7);
  },

  // "Summons a torrent around its fist and punches at blinding speed."
  jetPunchUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.5);
    g.spawn(new Stuck(u, 0.6, (ctx, mon, age) => {
      for (let k = 0; k < 8; k++) {
        const ang = age * 20 + (k / 8) * TAU, x = mon.x + Math.cos(ang) * 9, y = mon.y - mon.bodyZ + Math.sin(ang) * 9;
        px(ctx, '#1f4a8a', x - 2, y - 2, 4, 4);
        px(ctx, '#9fe8ff', x - 1, y - 1, 2, 2);
      }
    }));
    rushInto(a, g, u, t, { at: 0.5, dur: 0.1, ghost: '#5aa6f0', lines: '#ffffff', past: -10, kb: 280, onHit: () => {
      waterSplash(g, t.x, t.y);
      impact(g, t, ['#ffffff', '#5aa6f0'], 1.4);
    } });
    a.end(1.3);
  },

  // "Spins furiously by straining its legs."
  spinOutUlt(a, g, u, t) {
    face(a, u, t);
    spinUser(a, g, u, 1.3, ['#c8d0d8', '#8a3ac0']);
    let tt = 0;
    a.ticks.push(dt => { if ((tt += dt) < 1.3 && Math.random() < 0.6) dustCloud(g, u.x, u.y, 2, 4); });
    a.later(0.3, () => glide(a, g, u, clampPt(t.x - Math.cos(u.aimAt(t)) * 20, t.y - Math.sin(u.aimAt(t)) * 20), 0.5, '#c8d0d8', { lines: '#ffffff' }));
    for (let k = 0; k < 4; k++) a.later(0.8 + k * 0.15, () => {
      metalSparks(g, t.x, t.y, t.bodyZ);
      g.marks.burn?.(t.x + rand(-10, 10), t.y + rand(-6, 6), 8);
      a.strike(0.25, { customArt: true, knockback: k === 3 ? 240 : 40, stagger: 0.3 });
    });
    a.end(1.8);
  },

  // "Spins about; leaves targets poisoned."
  mortalSpinUlt(a, g, u, t) {
    face(a, u, t);
    spinUser(a, g, u, 1.2, ['#e070e0', '#ffffff']);
    a.later(0.2, () => glide(a, g, u, clampPt(t.x - Math.cos(u.aimAt(t)) * 24, t.y - Math.sin(u.aimAt(t)) * 24), 0.45, '#e070e0'));
    let tt = 0;
    a.ticks.push(dt => {
      if ((tt += dt) > 1.2 || Math.random() > 0.7) return;
      const ang = rand(0, TAU);
      g.particles.spawn({ x: u.x, y: u.y, z: u.bodyZ, vx: Math.cos(ang) * 110, vy: Math.sin(ang) * 60, vz: rand(10, 40), life: 0.45, size: rand(2, 4), sizeEnd: 1, colors: ['#ffffff', '#e070e0', '#7a2a8a'] });
    });
    for (let k = 0; k < 3; k++) a.later(0.7 + k * 0.18, () => a.strike(1 / 3, { customArt: true, knockback: k === 2 ? 220 : 40, stagger: 0.3 }));
    a.later(1.3, () => status(g, t, u, 'poison', 6));
    a.end(1.8);
  },

  // Dondozo: "Attacks with roguish poise" with its Tatsugiri: the Tatsugiri is launched from its mouth, then
  // Dondozo crashes down after it.
  orderUpUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.5);
    a.later(0.4, () => {
      a.anim('Shoot', 1);
      const m = a.mouth();
      g.spawn(new Flyer({ from: { x: m.x, y: m.y, z: m.z }, to: () => body(t), dur: 0.4, arc: 50, paint: (ctx, x, y, age, f) => big(ctx, x, y, 1.6, () => drawTatsugiri(ctx, 0, 0, f.ang)), onArrive: () => {
        impact(g, t, ['#ffffff', '#ff8a3a'], 1);
        a.strike(0.35, { customArt: true, knockback: 40, stagger: 0.35 });
      } }));
    });
    a.later(0.9, () => {
      face(a, u, t);
      a.anim('Hop', 1.2);
      glide(a, g, u, clampPt(t.x, t.y + 14), 0.4, '#3a4a8a', { onStep: q => { u.zOverride = 70 * Math.sin(Math.PI * q); } });
      a.later(0.4, () => {
        waterSplash(g, t.x, t.y);
        dustCloud(g, t.x, t.y, 12, 7);
        g.marks.fracture(t.x, t.y, 34, 6);
        g.shake(9, 0.4);
        impact(g, t, ['#ffffff', '#f0a050'], 1.5);
        a.strike(0.65, { customArt: true, knockback: 280, stagger: 0.6 });
      });
    });
    a.end(2);
  },

  // Annihilape: "Converts its rage into energy" — it seethes, wreathed in a dark rage aura, then rushes in with a
  // flurry of rage-charged punches and a final blow that bursts in dark spirit flame.
  rageFistUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 1.2);
    const RAGE = ['#ffffff', '#c8a8ff', '#7a3ac0', '#2a0a3a'];
    g.spawn(new EnergyAura(u, 1.0, true, { glow: [150, 80, 220], rings: ['#e0c8ff', '#5a1a7a'] }));
    let tt = 0;
    a.ticks.push(dt => {
      if ((tt += dt) > 0.9) return;
      for (let k = 0; k < 3; k++) g.particles.spawn({ x: u.x + rand(-u.radius, u.radius), y: u.y + rand(-4, 4), z: rand(0, u.bodyZ * 1.5), vx: rand(-15, 15), vz: rand(60, 120), gz: -30,
        life: rand(0.35, 0.55), size: rand(3, 6), sizeEnd: 1, colors: RAGE.slice(1) });
      if (Math.random() < 0.2) g.shake(2, 0.1);
    });
    a.later(0.85, () => {
      face(a, u, t);
      a.anim('Walk', 2.2);
      const ang = u.aimAt(t);
      glide(a, g, u, clampPt(t.x - Math.cos(ang) * (t.radius + u.radius - 2), t.y - Math.sin(ang) * (t.radius + u.radius - 2)), 0.16, '#7a3ac0', { lines: '#c8a8ff' });
    });
    for (let k = 0; k < 4; k++) a.later(1.05 + k * 0.1, () => {
      a.anim('Attack', 2.6);
      const off = rand(-0.5, 0.5), ang = u.aimAt(t) + off;
      g.spawn(new Ring(t.x - Math.cos(ang) * 6, t.y, { z: t.bodyZ + rand(-6, 6), r0: 4, r1: 22, life: 0.18, color: '#c8a8ff', width: 3, layer: 'air' }));
      spray(g, t.x, t.y, t.bodyZ, 6, RAGE, { speed: 110, up: 60 });
      a.strike(0.1, { customArt: true, knockback: 20, stagger: 0.25 });
    });
    a.later(1.6, () => {
      a.anim('Attack', 1.2);
      for (const [r1, life, c, w] of [[50, 0.3, '#ffffff', 6], [130, 0.5, '#c8a8ff', 5], [220, 0.7, '#5a1a7a', 5]]) g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 8, r1, life, color: c, width: w, layer: 'air' }));
      // Dark spirit flame bursts up from the blow.
      for (let k = 0; k < 26; k++) g.particles.spawn({ x: t.x + rand(-10, 10), y: t.y, z: t.bodyZ + rand(-6, 6), vx: rand(-60, 60), vy: rand(-30, 30), vz: rand(120, 260), gz: 60,
        life: rand(0.5, 0.8), size: rand(3, 7), sizeEnd: 1, colors: RAGE });
      g.marks.fracture(t.x, t.y, 28, 6);
      g.shake(9, 0.4);
      a.strike(0.6, { customArt: true, knockback: 300, stagger: 0.6 });
    });
    a.end(2.2);
  },

  // "Spins the pointed part of its body at high speed to pierce the target."
  hyperDrillUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.5);
    const drill = new Stuck(u, 1.2, (ctx, mon, age) => {
      const ang = u.aimAt(t), cx = mon.x + Math.cos(ang) * (mon.radius + 4), cy = mon.y - mon.bodyZ + Math.sin(ang) * (mon.radius + 4);
      rotated(ctx, cx, cy, ang, () => {
        ctx.fillStyle = '#2a2a3a';
        ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(0, -8); ctx.lineTo(0, 8); ctx.fill();
        for (let k = 0; k < 4; k++) { const off = ((age * 40 + k * 5) % 20) - 10; px(ctx, k % 2 ? '#e8dcc0' : '#3a6ad0', 2 + Math.abs(off) * 0.2, off * 0.6, 14 - Math.abs(off) * 0.6, 2); }
      });
    });
    g.spawn(drill);
    rushInto(a, g, u, t, { at: 0.45, dur: 0.3, ghost: '#e8dcc0', lines: '#ffffff', past: -6, frac: 0.3, kb: 30 });
    for (let k = 0; k < 5; k++) a.later(0.85 + k * 0.08, () => {
      spray(g, t.x, t.y, t.bodyZ, 5, ['#ffffff', '#e8dcc0', '#3a6ad0'], { speed: 110, up: 60 });
      a.strike(0.14, { customArt: true, knockback: k === 4 ? 260 : 10, stagger: 0.25 });
    });
    a.end(1.7);
  },

  // Kingambit: "Slashes after kowtowing to make the target let down its guard."
  kowtowCleaveUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Hurt', 0.4); // the kowtow
    g.spawn(new ScreenDim(1.9, 0.6, '12,8,6'));
    a.later(0.8, () => {
      rushInto(a, g, u, t, { dur: 0.14, ghost: '#c8a030', lines: '#ffe8a0', past: 40, frac: 1, kb: 300, anim: 'Walk', onHit: () => {
        const ang = u.aimAt(t) + Math.PI / 2, cy = t.y - t.bodyZ;
        g.spawn(new BeamLine(t.x - Math.cos(ang) * 200, cy - Math.sin(ang) * 200, t.x + Math.cos(ang) * 200, cy + Math.sin(ang) * 200, 0.45, '#c8a030', 12));
        g.spawn(new BeamLine(t.x - Math.cos(ang) * 200, cy - Math.sin(ang) * 200, t.x + Math.cos(ang) * 200, cy + Math.sin(ang) * 200, 0.35, '#ffffff', 4));
        metalSparks(g, t.x, t.y, t.bodyZ);
        impact(g, t, ['#ffe8a0', '#c8a030'], 1.4);
        g.shake(7, 0.3);
      } });
    });
    a.end(1.8);
  },

  // Gholdengo: "Throws out a mass of coins."
  makeItRainUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.5);
    g.spawn(new Glow(u.x, u.y, u.bodyZ, 40, [255, 220, 90], 0.7, true));
    a.later(0.4, () => a.anim('Shoot', 1.3));
    hurl(a, g, u, t, { at: 0.45, n: 30, gap: 0.035, dur: 0.5, arc: 60, spread: 22, paint: (ctx, x, y, age) => big(ctx, x, y, 1.5, () => drawCoin(ctx, 0, 0, age)),
      onHit: i => { if (i % 5 === 4) spray(g, t.x, t.y, t.bodyZ, 6, ['#fff6b0', '#f2c21c'], { speed: 90, up: 110 }); } });
    a.later(1.9, () => impact(g, t, ['#fff6b0', '#f2c21c'], 1.4));
    a.end(2.3);
  },

  // Chi-Yu: "Summons a ruinous disaster." The sky darkens, a ruinous fireball falls on the foe.
  ruinationUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.8);
    setPiece(a, g, u, { dim: '24,4,4', alpha: 0.75, len: 3, aura: [255, 120, 60], rings: ['#ffe0c0', '#c04a2a'], gather: ['#ffe0c0', '#c04a2a', '#1a0808'] });
    weather(a, g, 2.6, 3, () => ({ x: rand(BOUNDS.minX, BOUNDS.maxX), y: rand(BOUNDS.minY, BOUNDS.maxY), z: rand(100, 200), vz: rand(-200, -120), gz: 0, life: 1, size: rand(2, 4), sizeEnd: 1, colors: ['#ff6a1f', '#3a0a0a'] }));
    fromSky(a, g, t, { at: 0.9, dur: 0.75, height: 320, paint: (ctx, x, y, age) => {
      const r = 22 + Math.sin(age * 20) * 2;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
      gr.addColorStop(0, 'rgba(255,220,140,0.9)'); gr.addColorStop(0.5, 'rgba(200,60,20,0.7)'); gr.addColorStop(1, 'rgba(40,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
      blob(ctx, x, y, r * 0.7, '#3a0a0a', '#c04a2a');
    }, frac: 1, kb: 260, onLand: () => {
      for (const [r1, life, c] of [[80, 0.35, '#ffe0c0'], [180, 0.6, '#c04a2a'], [280, 0.8, '#1a0808']]) g.spawn(new Ring(t.x, t.y, { r0: 8, r1, life, color: c, width: 6 }));
      spray(g, t.x, t.y, t.bodyZ, 34, ['#ffe0c0', '#ff6a1f', '#c04a2a', '#1a0808'], { speed: 240, up: 200, size: [3, 7] });
      g.marks.scorch(t.x, t.y, 50, 8);
      g.shake(11, 0.5);
    } });
    a.end(2.6);
  },

  // "Fires a blast of tea that it mixed; may burn."
  matchaGotchaUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.5);
    a.later(0.45, () => {
      face(a, u, t);
      a.anim('Shoot', 0.9);
      const m = a.mouth(), from = { x: m.x, y: m.y - m.z };
      const beam = g.spawn(new Beam(from.x, from.y, from.x, from.y, 0.8, { width: 22, colors: ['#3a5a2a', '#a8d870', '#f0ffd8'], tapered: true }));
      const flight = Math.max(0.1, Math.hypot(t.x - from.x, t.y - t.bodyZ - from.y) / 1100);
      a.ticks.push(() => {
        const front = Math.min(1, beam.age / flight);
        beam.set(from.x, from.y, lerp(from.x, t.x, front), lerp(from.y, t.y - t.bodyZ, front));
      });
      for (let k = 0; k < 3; k++) a.later(flight + k * 0.2, () => {
        spray(g, t.x, t.y, t.bodyZ, 12, ['#f0ffd8', '#a8d870', '#3a5a2a'], { speed: 120, up: 110 });
        g.marks.wet?.(t.x + rand(-8, 8), t.y, 16);
        a.strike(1 / 3, { customArt: true, knockback: k === 2 ? 200 : 40, stagger: 0.3 });
      });
      a.later(flight + 0.5, () => { if (Math.random() < 0.5) status(g, t, u, 'burn'); });
    });
    a.end(1.9);
  },

  // Ogerpon: "Strikes with an ivy-wrapped cudgel." It leaps and brings the club down; vines burst from the ground.
  ivyCudgelUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    setPiece(a, g, u, { dim: '8,24,12', len: 2.6, aura: [140, 230, 120], rings: ['#ffffff', '#4ab04a'], gather: ['#e8ffc8', '#4ab04a', '#1a4a2a'] });
    a.later(0.6, () => {
      face(a, u, t);
      a.anim('Hop', 1.3);
      glide(a, g, u, clampPt(t.x, t.y + 16), 0.42, '#4ab04a', { onStep: q => { u.zOverride = 80 * Math.sin(Math.PI * q); } });
    });
    a.later(1.05, () => {
      a.anim('Attack', 1.5);
      for (let k = 0; k < 8; k++) { const ang = (k / 8) * TAU; g.spawn(new Spike(t.x + Math.cos(ang) * 30, t.y + Math.sin(ang) * 15, 'vine', 1.2)); }
      leafBurst(g, t.x, t.y, t.bodyZ, 16);
      g.marks.leaves?.(t.x, t.y, 40);
      g.marks.fracture(t.x, t.y, 30, 6);
      g.shake(9, 0.4);
      impact(g, t, ['#e8ffc8', '#4ab04a'], 1.6);
      a.strike(1, { customArt: true, knockback: 290, stagger: 0.6 });
    });
    a.end(2.2);
  },

  // Terapagos: "With the power of its crystals, bombards and eliminates the target."
  teraStarstormUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    setPiece(a, g, u, { dim: '8,10,30', alpha: 0.7, len: 3.2, aura: [200, 240, 255], rings: ['#ffffff', '#5ac8f0'] });
    const CRYSTAL = ['#ff8ad0', '#ffd23a', '#7ae07a', '#5ac8f0', '#c890ff'];
    // A crown of prismatic crystals forms over it…
    g.spawn(new Painted(1.1, (ctx, p, age) => {
      for (let k = 0; k < 10; k++) {
        const ang = age * 2 + (k / 10) * TAU, r = 40 + 6 * Math.sin(age * 6 + k);
        drawGem(ctx, u.x + Math.cos(ang) * r, u.y - u.bodyZ - 30 + Math.sin(ang) * r * 0.4, 5, CRYSTAL[k % 5]);
      }
    }));
    // …and rains down on the foe.
    for (let i = 0; i < 24; i++) a.later(1.0 + i * 0.045, () => {
      const c = CRYSTAL[i % 5], off = { x: rand(-24, 24), y: rand(-10, 10) };
      g.spawn(new Flyer({ from: () => ({ x: t.x + off.x - 60, y: t.y + off.y, z: 280 }), to: () => ({ x: t.x + off.x, y: t.y + off.y, z: t.bodyZ * rand(0.4, 1.4) }), dur: 0.35,
        paint: (ctx, x, y) => drawGem(ctx, x, y, 5, c), onArrive: () => {
          g.spawn(new Ring(t.x + off.x, t.y + off.y, { r0: 3, r1: 16, life: 0.25, color: c, width: 2 }));
          if (i % 4 === 3) a.strike(1 / 6, { customArt: true, knockback: i === 23 ? 260 : 40, stagger: 0.3 });
        } }));
    });
    a.later(2.4, () => {
      for (const [r1, c] of [[90, '#ffffff'], [180, '#5ac8f0'], [260, '#ff8ad0']]) g.spawn(new Ring(t.x, t.y, { r0: 8, r1, life: 0.6, color: c, width: 5 }));
      g.shake(9, 0.4);
    });
    a.end(3);
  },

  // Incineroar: "Swings both arms and hits the target."
  darkestLariatUlt(a, g, u, t) {
    face(a, u, t);
    spinUser(a, g, u, 1.1, ['#ff6a1f', '#1a0a10']);
    a.later(0.2, () => glide(a, g, u, clampPt(t.x - Math.cos(u.aimAt(t)) * 18, t.y - Math.sin(u.aimAt(t)) * 18), 0.45, '#c03a3a'));
    for (let k = 0; k < 3; k++) a.later(0.6 + k * 0.17, () => {
      impact(g, t, ['#fff0a0', '#c03a3a'], 0.9 + k * 0.2);
      a.strike(1 / 3, { customArt: true, knockback: k === 2 ? 260 : 40, stagger: 0.35 });
    });
    a.end(1.6);
  },

  // "Swings its strong, heavy fist."
  iceHammerUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    a.later(0.45, () => {
      a.anim('Hop', 1.3);
      glide(a, g, u, clampPt(t.x, t.y + 14), 0.35, '#bdf3ff', { onStep: q => { u.zOverride = 60 * Math.sin(Math.PI * q); } });
    });
    a.later(0.85, () => {
      a.anim('Attack', 1.5);
      for (let k = 0; k < 6; k++) { const ang = (k / 6) * TAU; g.spawn(new Spike(t.x + Math.cos(ang) * 24, t.y + Math.sin(ang) * 12, 'ice', 1.1)); }
      iceShatter(g, t.x, t.y, t.bodyZ);
      g.marks.frost(t.x, t.y, 34);
      g.marks.fracture(t.x, t.y, 28, 6);
      g.shake(8, 0.35);
      impact(g, t, ICE, 1.4);
      a.strike(1, { customArt: true, knockback: 270, stagger: 0.6 });
    });
    a.end(1.8);
  },

  // Oricorio: "Dances with all its might." It whirls through a dance, then the dance's power hits the foe (its own
  // type: Baile Style's flames).
  revelationDanceUlt(a, g, u, t) {
    face(a, u, t);
    for (let k = 0; k < 4; k++) a.later(0.1 + k * 0.22, () => {
      a.anim(k % 2 ? 'Pose' : 'Rotate', 2);
      g.spawn(new Ring(u.x, u.y, { z: u.bodyZ, r0: 10, r1: 50, life: 0.35, color: '#ff6a1f', width: 3, layer: 'air' }));
      for (let i = 0; i < 6; i++) { const ang = rand(0, TAU); g.particles.spawn({ x: u.x, y: u.y, z: u.bodyZ, vx: Math.cos(ang) * 90, vy: Math.sin(ang) * 50, vz: rand(40, 90), life: 0.5, size: rand(2, 4), sizeEnd: 1, colors: ['#ff3a5a', '#ffab33', '#fff0a0'] }); }
    });
    hurl(a, g, u, t, { at: 1.0, n: 5, gap: 0.08, dur: 0.35, arc: 20, spread: 10, paint: (ctx, x, y, age, f) => {
      px(ctx, '#3a0a10', x - 4, y - 2, 8, 4); px(ctx, '#ff3a5a', x - 3, y - 1, 6, 2);
      g.particles.spawn({ x: f.x, y: f.y, z: f.z, vz: 20, life: 0.25, size: 4, sizeEnd: 1, colors: FIRE });
    }, onHit: i => { spray(g, t.x, t.y, t.bodyZ, 6, FIRE, { speed: 80, up: 90 }); if (i === 4) impact(g, t, FIRE, 1.3); } });
    a.end(1.9);
  },
};

// Tornadus / Thundurus / Landorus / Enamorus: a storm over the whole arena that engulfs the foe.
function stormSetPiece(a, g, u, t, { dim, aura, rings, gust, swirl, clouds, hearts, strike, end }) {
  face(a, u, t);
  a.anim('Charge', 0.6);
  setPiece(a, g, u, { dim, alpha: 0.6, len: 3.3, aura, rings });
  // Gale streaming across the whole arena.
  weather(a, g, 3, 6, k => {
    const { colors } = gust(k);
    return { x: BOUNDS.minX - 30, y: rand(BOUNDS.minY - 30, BOUNDS.maxY), z: rand(0, 120), vx: rand(380, 520), vy: rand(-30, 30), vz: rand(-10, 10), gz: 0, life: rand(0.9, 1.3), size: rand(2, 4), sizeEnd: 1, colors };
  });
  if (clouds) for (let k = 0; k < 4; k++) g.spawn(new StormCloud(lerp(BOUNDS.minX + 40, BOUNDS.maxX - 40, k / 3), BOUNDS.minY + 20, 3.2));
  a.later(0.7, () => a.anim('Shoot', 1));
  // The storm closes on the foe.
  let tt = 0, hit = 0, k = 0;
  a.later(0.8, () => a.ticks.push(dt => {
    if ((tt += dt) > 1.9) return;
    for (let i = 0; i < 7; i++) {
      const ang = tt * 10 + rand(0, TAU), r = rand(16, 60), h = rand(0, 90);
      const { colors } = gust(i);
      g.particles.spawn({ x: t.x + Math.cos(ang) * r, y: t.y + Math.sin(ang) * r * 0.45, z: h, vx: -Math.sin(ang) * 160, vy: Math.cos(ang) * 70, vz: rand(20, 70), gz: 0, life: 0.4, size: rand(2, 5), sizeEnd: 1, colors });
    }
    if (hearts && Math.random() < 0.25) {
      const ang = rand(0, TAU), c = Math.random() < 0.5 ? '#ff7ab0' : '#c890ff';
      g.spawn(new Flyer({ from: { x: t.x + Math.cos(ang) * 50, y: t.y + Math.sin(ang) * 20, z: rand(10, 60) }, to: () => body(t), dur: 0.4, paint: (ctx, x, y) => big(ctx, x, y, 1.5, () => drawHeart(ctx, 0, 0, c)) }));
    }
    if ((hit += dt) >= 0.32) {
      hit = 0;
      strike?.(k++);
      a.strike(0.15, { customArt: true, knockback: 30, stagger: 0.2 });
    }
  }));
  if (swirl) a.later(0.8, () => g.spawn(new StormSwirl(t.x, t.y, 80, 2)));
  a.later(2.85, () => {
    impact(g, t, ['#ffffff', rings[1]], 1.5);
    g.shake(7, 0.35);
    a.strike(0.1, { customArt: true, knockback: 240, stagger: 0.5 });
    end?.();
  });
  a.end(3.3);
}
