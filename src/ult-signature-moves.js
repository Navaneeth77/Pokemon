// Signature-move ultimates staged after each move's official description (Pokédex move text):
//   Bonemerang    – throws the bone it holds; it hits on the way out and again on the way back.
//   Octazooka     – sprays ink in the target's face (may lower accuracy).
//   Attack Order  – calls out its underlings (Combee) to pummel the target; high critical-hit ratio.
//   Chatter       – sound waves of deafening chatter; confuses the target.
//   Gear Grind    – throws steel gears at the target, twice.
//   Fiery Dance   – cloaked in flames, dances and flaps its wings; may raise its Sp. Atk.
//   Glaciate      – blows freezing cold air at the foes; lowers their Speed.
//   Sparkling Aria– bursts into song, emitting many bubbles; the bubbles cure a burn.
//   Multi-Attack  – cloaks itself in high energy and slams into the target.
//   Anchor Shot   – entangles the target with its anchor chain; it can't get away.
//   Clanging Scales – rubs the scales on its whole body to make a huge noise; lowers its own Defense.
//   Photon Geyser – attacks with a pillar of light.
//   Mind Blown    – makes its own head explode, hitting everything around; costs it half its max HP.
//   Overdrive     – twangs a guitar or bass, a huge echo and strong vibration.
//   Aura Wheel    – energy from its cheeks, a wheel of electricity; raises its Speed.
//   Flower Trick  – throws a rigged bouquet; never misses and always lands a critical hit.
//   Salt Cure     – salt-cures the target, which keeps taking damage.
// Visual only: no screen flashes or hit-pause (the feel of a hit stays the game's own).
import { Effect, Glow, Ring, Beam, EnergyAura, ScreenDim, Spike, iceShatter, metalSparks, debris, dustCloud, waterSplash, leafBurst, electricBurst, rand } from './effects.js';
import { glide, spray, inward } from './ult-choreo.js';
import { confuse } from './effects-extra.js';
import { BOUNDS } from './arena.js';
import { sfx } from './audio.js';

const TAU = Math.PI * 2;
const lerp = (a, b, p) => a + (b - a) * p;
const clampPt = (x, y) => ({ x: Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, x)), y: Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, y)) });
const play = (name, ...args) => sfx[name]?.(...args);
const at = v => (typeof v === 'function' ? v() : v);
const body = m => ({ x: m.x, y: m.y, z: m.bodyZ });
const head = m => ({ x: m.x, y: m.y, z: m.headZ ?? m.bodyZ * 1.6 });

function face(a, u, t) {
  a.aim = u.aimAt(t);
  u.face(t.x, t.y);
}

// Something flying from a point to a (moving) point, drawn by `paint`. `to` may be a function, so it keeps
// homing on a target that moves (ultimates can't be dodged).
class Flyer extends Effect {
  constructor({ from, to, dur, arc = 0, paint, onArrive, layer = 'air' }) {
    super(layer, dur);
    const p = at(from);
    Object.assign(this, { p0: { x: p.x, y: p.y, z: p.z ?? 0 }, to, arc, paint, onArrive, x: p.x, y: p.y, z: p.z ?? 0, k: 0 });
  }

  update(dt) {
    this.age += dt;
    this.k = Math.min(1, this.age / this.life);
    const q = at(this.to), k = this.k;
    this.x = lerp(this.p0.x, q.x, k);
    this.y = lerp(this.p0.y, q.y, k);
    this.z = lerp(this.p0.z, q.z ?? 0, k) + this.arc * Math.sin(Math.PI * k);
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

// Something stuck to a Pokémon for a while (ink on its face, salt crusted on it…).
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
    const fade = Math.min(1, (this.life - this.age) / 0.4);
    ctx.globalAlpha = fade;
    this.paint(ctx, this.mon, this.age);
    ctx.globalAlpha = 1;
  }
}

// A drawn-on-the-spot effect (rings of sound, a light pillar…) with its own paint function.
class Painted extends Effect {
  constructor(life, paint, layer = 'air') {
    super(layer, life);
    this.paint = paint;
  }

  draw(ctx) {
    this.paint(ctx, this.age / this.life, this.age);
  }
}

// Draws `fn` at (x, y) scaled up by `s` (chunky pixels, like the sprites).
function big(ctx, x, y, s, fn) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(s, s);
  fn();
  ctx.restore();
}

// ── Pixel art, drawn in code (the game has no sprites for bones, gears, ink, bees, notes, anchors…) ──
const px = (ctx, color, x, y, w = 1, h = 1) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

function drawBone(ctx, x, y, ang, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(s, s);
  const out = '#5a4a36', fill = '#f3ecd9', shade = '#cfc3a6';
  px(ctx, out, -8, -2, 16, 4);
  px(ctx, fill, -8, -1, 16, 2);
  px(ctx, shade, -8, 0, 16, 1);
  for (const sx of [-10, 7]) for (const sy of [-4, 1]) {
    px(ctx, out, sx, sy, 4, 4);
    px(ctx, fill, sx + 1, sy + 1, 2, 2);
  }
  ctx.restore();
}

function drawGear(ctx, x, y, r, ang, fill = '#b9c2cc', dark = '#4a5562') {
  const teeth = Math.max(8, Math.round(r * 1.1));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = dark;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * TAU, rr = i % 2 ? r : r + 3;
    ctx.lineTo(Math.cos(a0) * (rr + 1), Math.sin(a0) * (rr + 1));
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * TAU, rr = i % 2 ? r - 1 : r + 2;
    ctx.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#eef3f8';
  ctx.fillRect(-r * 0.6, -r * 0.6, r * 0.5, 2);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.35, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawInk(ctx, x, y, r) {
  ctx.fillStyle = '#120e1c';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  px(ctx, '#3a3156', x - r * 0.45, y - r * 0.5, Math.max(1, r * 0.5), Math.max(1, r * 0.3));
}

function drawCombee(ctx, x, y, age) {
  // Three honeycomb heads in a triangle, white wings flickering.
  const wing = Math.sin(age * 60) > 0 ? '#ffffff' : '#cfe8ff';
  px(ctx, wing, x - 5, y - 4, 3, 2);
  px(ctx, wing, x + 3, y - 4, 3, 2);
  for (const [dx, dy] of [[-3, -1], [1, -1], [-1, 2]]) {
    px(ctx, '#5a3a10', dx + x - 1, dy + y - 1, 4, 4);
    px(ctx, '#f6c21c', dx + x, dy + y, 2, 2);
  }
  px(ctx, '#1a1008', x - 2, y, 1, 1);
  px(ctx, '#1a1008', x + 2, y, 1, 1);
}

function drawNote(ctx, x, y, color) {
  px(ctx, '#1b1b2a', x - 1, y - 1, 5, 4);
  px(ctx, color, x, y, 3, 2);
  px(ctx, '#1b1b2a', x + 2, y - 8, 2, 9);
  px(ctx, color, x + 2, y - 7, 1, 8);
  px(ctx, color, x + 3, y - 7, 2, 1);
  px(ctx, color, x + 4, y - 6, 1, 2);
}

function drawBubble(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(150,215,255,0.35)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#1f5a9a';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = '#d8f2ff';
  ctx.lineWidth = 1;
  ctx.stroke();
  px(ctx, '#ffffff', x - r * 0.5, y - r * 0.5, 2, 2);
}

function drawAnchor(ctx, x, y, ang) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang + Math.PI / 2);
  const out = '#20262c', iron = '#8e9aa6', hi = '#d6dee6';
  px(ctx, out, -2, -12, 4, 22);
  px(ctx, iron, -1, -11, 2, 20);
  px(ctx, hi, -1, -11, 1, 8);
  px(ctx, out, -7, -8, 14, 3);
  px(ctx, iron, -6, -7, 12, 1);
  px(ctx, out, -4, -16, 8, 5);
  px(ctx, '#20262c', -2, -15, 4, 3);
  ctx.strokeStyle = out;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 4, 9, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = iron;
  ctx.lineWidth = 2;
  ctx.stroke();
  for (const sx of [-1, 1]) {
    px(ctx, out, sx * 9 - 2, 6, 4, 4);
    px(ctx, iron, sx * 9 - 1, 7, 2, 2);
  }
  ctx.restore();
}

function drawChain(ctx, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.floor(d / 6));
  for (let i = 0; i <= n; i++) {
    const p = i / n, x = lerp(x0, x1, p), y = lerp(y0, y1, p);
    px(ctx, '#20262c', x - 2, y - 2, 4, 4);
    px(ctx, i % 2 ? '#8e9aa6' : '#c3ccd5', x - 1, y - 1, 2, 2);
  }
}

function drawFlower(ctx, x, y, petal, centre, s = 1) {
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * TAU - Math.PI / 2;
    px(ctx, '#2a1420', x + Math.cos(a0) * 3 * s - 2, y + Math.sin(a0) * 3 * s - 2, 4 * s, 4 * s);
    px(ctx, petal, x + Math.cos(a0) * 3 * s - 1, y + Math.sin(a0) * 3 * s - 1, 2 * s + 1, 2 * s + 1);
  }
  px(ctx, centre, x - 1, y - 1, 2 * s + 1, 2 * s + 1);
}

function drawBouquet(ctx, x, y, ang) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  px(ctx, '#1d4a22', -1, 0, 3, 10);
  px(ctx, '#3f9a3a', 0, 0, 1, 10);
  px(ctx, '#f7f0e0', -3, 5, 7, 3);
  ctx.restore();
  drawFlower(ctx, x - 4, y - 3, '#ff6fa8', '#ffe066');
  drawFlower(ctx, x + 4, y - 3, '#ff3a5a', '#ffe066');
  drawFlower(ctx, x, y - 8, '#ffd0e8', '#ffb040');
}

function drawSalt(ctx, x, y, s) {
  px(ctx, '#7a7068', x - s, y - s, s * 2 + 1, s * 2 + 1);
  px(ctx, '#fbf7ee', x - s + 1, y - s + 1, s * 2 - 1, s * 2 - 1);
  px(ctx, '#d9cfc0', x, y, s, s);
}

// Stays on the user and keeps rising flames around it (Fiery Dance's cloak of fire).
function flameCloak(g, u, dur, colors) {
  let t = 0;
  return dt => {
    if ((t += dt) > dur) return;
    for (let i = 0; i < 3; i++) {
      const ang = rand(0, TAU), r = u.radius * rand(0.5, 1.2);
      g.particles.spawn({ x: u.x + Math.cos(ang) * r, y: u.y + Math.sin(ang) * r * 0.5, z: rand(2, u.bodyZ * 1.6), vz: rand(40, 90), gz: -20,
        life: rand(0.35, 0.6), size: rand(3, 6), sizeEnd: 1, colors });
    }
  };
}

const FIRE = ['#fffbd0', '#ffe066', '#ffab33', '#ff6a1f', '#d23a17'];

export const SIGNATURE_MOVE_ULTS = {
  // The bone flies out spinning, hits, sweeps round behind the foe, hits again on the way back, and returns.
  bonemerangUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.5);
    a.later(0.3, () => {
      face(a, u, t);
      a.anim('Attack', 1.2);
      const side = Math.sign(Math.cos(u.aimAt(t)) || 1), loop = () => ({ x: t.x + side * 70, y: t.y - 46, z: t.bodyZ + 10 });
      const spinBone = (ctx, x, y, age) => drawBone(ctx, x, y, age * 22, 1.4);
      const hit = (frac, o) => {
        debris(g, t.x, t.y, 6, 90);
        dustCloud(g, t.x, t.y, 6, 4);
        play('clang');
        a.strike(frac, { customArt: true, knockback: 120, stagger: 0.3, ...o });
      };
      g.spawn(new Flyer({ from: { x: u.x, y: u.y, z: u.bodyZ }, to: () => body(t), dur: 0.42, arc: 18, paint: spinBone, onArrive: () => {
        hit(0.5);
        g.spawn(new Flyer({ from: body(t), to: loop, dur: 0.34, arc: 6, paint: spinBone, onArrive: () => {
          g.spawn(new Flyer({ from: loop(), to: () => body(t), dur: 0.3, paint: spinBone, onArrive: () => {
            hit(0.5, { knockback: 200, stagger: 0.45 });
            g.spawn(new Flyer({ from: body(t), to: () => ({ x: u.x, y: u.y, z: u.bodyZ }), dur: 0.36, arc: 12, paint: spinBone }));
          } }));
        } }));
      } }));
    });
    a.end(2.1);
  },

  // Three gobs of ink sprayed at the foe's face; they splat and the ink stays on its face for a while.
  octazookaUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.45);
    for (let i = 0; i < 3; i++) a.later(0.4 + i * 0.22, () => {
      face(a, u, t);
      a.anim('Shoot', 1.3);
      const m = a.mouth();
      g.spawn(new Flyer({ from: { x: m.x, y: m.y, z: m.z }, to: () => head(t), dur: 0.3, arc: 10, paint: (ctx, x, y, age) => {
        drawInk(ctx, x, y, 5);
        drawInk(ctx, x - Math.cos(a.aim) * 5, y - Math.sin(a.aim) * 5, 3);
      }, onArrive: () => {
        spray(g, t.x, t.y, t.headZ ?? t.bodyZ * 1.5, 12, ['#120e1c', '#2a2240', '#3a3156'], { speed: 90, up: 70, size: [2, 4], life: [0.4, 0.7] });
        g.marks.energy?.(t.x, t.y, 10, [20, 14, 28], 4);
        a.strike(i === 2 ? 0.4 : 0.3, { customArt: true, knockback: 60, stagger: 0.25 });
        if (i === 0) g.spawn(new Stuck(t, 3.2, (ctx, mon) => {
          const y = mon.y - (mon.headZ ?? mon.bodyZ * 1.5);
          drawInk(ctx, mon.x - 3, y, 4);
          drawInk(ctx, mon.x + 4, y + 1, 3);
          px(ctx, '#120e1c', mon.x - 1, y + 3, 1, 4);
        }));
      } }));
    });
    a.end(1.8);
  },

  // Vespiquen calls out its Combee, which swarm the foe in waves and pummel it.
  attackOrderUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Pose', 1);
    const n = 16;
    for (let i = 0; i < n; i++) a.later(0.25 + i * 0.07, () => {
      const ang = rand(0, TAU), start = { x: u.x + Math.cos(ang) * 22, y: u.y + Math.sin(ang) * 12, z: u.bodyZ + rand(0, 14) };
      const off = { x: rand(-10, 10), y: rand(-6, 6), z: rand(-6, 8) };
      g.spawn(new Flyer({ from: start, to: () => ({ x: t.x + off.x, y: t.y + off.y, z: t.bodyZ + off.z }), dur: rand(0.45, 0.6), arc: rand(14, 30),
        paint: (ctx, x, y, age) => big(ctx, x + Math.sin(age * 25) * 2, y, 1.4, () => drawCombee(ctx, 0, 0, age)),
        onArrive: () => {
          g.spawn(new Ring(t.x + off.x, t.y + off.y, { z: t.bodyZ + off.z, r0: 2, r1: 9, life: 0.18, color: '#f6c21c', width: 2, layer: 'air' }));
          if (i % 3 === 2) a.strike(1 / Math.floor(n / 3), { customArt: true, knockback: 40, stagger: 0.2 });
        } }));
    });
    a.end(2.4);
  },

  // Deafening chatter: sound waves and notes roll out at the foe, and the din confuses it.
  chatterUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.4);
    const colors = ['#ff5a8a', '#ffd23a', '#5ac8ff', '#7ae05a'];
    for (let w = 0; w < 4; w++) a.later(0.35 + w * 0.32, () => {
      face(a, u, t);
      a.anim('Shoot', 1.4);
      const m = a.mouth(), ang = u.aimAt(t);
      g.spawn(new Painted(0.55, (ctx, p) => {
        const d = Math.hypot(t.x - m.x, t.y - m.y) * p, cx = m.x + Math.cos(ang) * d, cy = m.y - m.z + Math.sin(ang) * d;
        ctx.globalAlpha = 1 - p * 0.6;
        for (const [w, c] of [[6, '#2a1a3a'], [3, '#ffd23a'], [1, '#fffbe8']]) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w;
          for (const r of [12, 20, 28]) {
            ctx.beginPath();
            ctx.arc(cx - Math.cos(ang) * r, cy - Math.sin(ang) * r, r + 10 * p, ang - 0.9, ang + 0.9);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }));
      for (let k = 0; k < 3; k++) {
        const c = colors[(w + k) % 4], wob = rand(-14, 14);
        g.spawn(new Flyer({ from: { x: m.x, y: m.y, z: m.z }, to: () => ({ x: t.x + wob, y: t.y, z: t.bodyZ + rand(0, 10) }), dur: 0.55 + k * 0.06, arc: 10,
          paint: (ctx, x, y, age) => big(ctx, x, y + Math.sin(age * 14 + k) * 4, 2, () => drawNote(ctx, 0, 0, c)) }));
      }
      a.later(0.55, () => a.strike(0.25, { customArt: true, knockback: 50, stagger: 0.2 }));
    });
    a.later(1.9, () => { if (t.alive && !t.hidden) confuse(g, t, u); });
    a.end(2.3);
  },

  // Two steel gears thrown one after the other; each grinds into the foe, throwing sparks.
  gearGrindUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.5);
    for (const [i, r] of [[0, 14], [1, 11]]) a.later(0.35 + i * 0.32, () => {
      face(a, u, t);
      a.anim('Attack', 1.2);
      const spin = (i ? -1 : 1) * 14;
      g.spawn(new Flyer({ from: { x: u.x, y: u.y, z: u.bodyZ }, to: () => body(t), dur: 0.38, arc: 8, paint: (ctx, x, y, age) => drawGear(ctx, x, y, r, age * spin), onArrive: () => {
        // It keeps grinding against the foe for a moment.
        g.spawn(new Stuck(t, 0.4, (ctx, mon, age) => {
          drawGear(ctx, mon.x + (i ? 6 : -6), mon.y - mon.bodyZ, r, age * spin * 1.5);
          if (Math.random() < 0.6) metalSparks(g, mon.x + (i ? 6 : -6), mon.y, mon.bodyZ);
        }));
        play('clang');
        a.strike(0.5, { customArt: true, knockback: i ? 190 : 80, stagger: 0.35 });
      } }));
    });
    a.end(1.9);
  },

  // Cloaked in fire, it dances and beats its wings: rings of flame roll out and engulf the foe; its Sp. Atk rises.
  fieryDanceUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    a.ticks.push(flameCloak(g, u, 1.9, FIRE));
    g.spawn(new Glow(u.x, u.y, u.bodyZ, 34, [255, 150, 60], 1.9, true));
    for (let i = 0; i < 4; i++) a.later(0.35 + i * 0.3, () => {
      face(a, u, t);
      a.anim(i % 2 ? 'Pose' : 'Attack', 1.3);
      g.spawn(new Ring(u.x, u.y, { z: u.bodyZ, r0: 10, r1: 70, life: 0.4, color: '#ffab33', width: 4, layer: 'air' }));
      for (let k = 0; k < 5; k++) {
        const off = { x: rand(-12, 12), z: rand(0, 14) };
        g.spawn(new Flyer({ from: { x: u.x + rand(-10, 10), y: u.y, z: u.bodyZ + rand(-4, 10) }, to: () => ({ x: t.x + off.x, y: t.y, z: t.bodyZ + off.z }),
          dur: 0.38 + k * 0.04, arc: 16, paint: (ctx, x, y, age) => {
            px(ctx, '#d23a17', x - 3, y - 3, 6, 6);
            px(ctx, FIRE[(k + Math.floor(age * 20)) % 3], x - 2, y - 2, 4, 4);
          } }));
      }
      a.later(0.42, () => {
        spray(g, t.x, t.y, t.bodyZ, 10, FIRE, { speed: 70, up: 120 });
        g.marks.scorch(t.x, t.y, 14, 6);
        a.strike(0.25, { customArt: true, knockback: 60, stagger: 0.25 });
      });
    });
    a.end(2.2);
  },

  // Kyurem, a legendary, freezes the whole field: the arena drops into a blizzard as it gathers ice, then it
  // exhales a colossal cone of freezing air that raises ice spikes across the arena, and the foe freezes solid in a
  // block of ice that shatters. Slows the foe (Glaciate lowers Speed).
  glaciateUlt(a, g, u, t) {
    const ICE = ['#ffffff', '#c8f2ff', '#7ad8f0', '#2b8ac0'];
    face(a, u, t);
    a.anim('Charge', 0.55);
    g.spawn(new ScreenDim(3.5, 0.55, '10,34,70'));
    g.spawn(new EnergyAura(u, 1.0, true, { glow: [150, 220, 255], rings: ['#ffffff', '#4aa8e0'] }));
    inward(g, u.x, u.y, u.bodyZ, 30, 100, ICE, 0.8);
    for (let k = 0; k < 12; k++) a.later(k * 0.06, () => g.marks.frost(u.x + rand(-70, 70), u.y + rand(-34, 34), rand(10, 22)));
    // A blizzard over the whole arena for as long as the move lasts.
    let snowT = 0;
    a.ticks.push(dt => {
      if ((snowT += dt) > 3.3) return;
      for (let k = 0; k < 5; k++) g.particles.spawn({ x: rand(BOUNDS.minX - 40, BOUNDS.maxX), y: rand(BOUNDS.minY - 40, BOUNDS.maxY), z: rand(120, 220),
        vx: rand(60, 120), vy: rand(10, 40), vz: rand(-140, -90), gz: 0, life: rand(1.2, 1.8), size: rand(2, 4), sizeEnd: 1,
        colors: k % 2 ? ['#ffffff', '#c8f2ff'] : ['#c8f2ff', '#7ad8f0'] });
    });
    a.later(0.9, () => {
      face(a, u, t);
      a.anim('Shoot', 0.55);
      g.shake(5, 0.5);
      const m = a.mouth(), ang = u.aimAt(t), dist = Math.hypot(t.x - m.x, t.y - m.y), len = dist + 130;
      // The cone of freezing air.
      g.spawn(new Painted(1.6, (ctx, p, age) => {
        const grow = Math.min(1, p * 5), fade = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1, L = len * grow, half = 22 + 100 * grow;
        const x0 = m.x, y0 = m.y - m.z, cx = Math.cos(ang), cy = Math.sin(ang), nx = -cy, ny = cx;
        const gr = ctx.createLinearGradient(x0, y0, x0 + cx * L, y0 + cy * L);
        gr.addColorStop(0, `rgba(255,255,255,${0.85 * fade})`);
        gr.addColorStop(0.5, `rgba(160,225,255,${0.55 * fade})`);
        gr.addColorStop(1, 'rgba(80,170,230,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(x0 + nx * 6, y0 + ny * 6);
        ctx.lineTo(x0 + cx * L + nx * half, y0 + cy * L + ny * half);
        ctx.lineTo(x0 + cx * L - nx * half, y0 + cy * L - ny * half);
        ctx.lineTo(x0 - nx * 6, y0 - ny * 6);
        ctx.closePath();
        ctx.fill();
        // Gusts racing down the cone.
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * fade})`;
        ctx.lineWidth = 2;
        for (let k = 0; k < 9; k++) {
          const along = ((age * 2.2 + k / 9) % 1) * L, side = ((k * 37) % 17 / 8 - 1) * (half * along / len);
          const sx = x0 + cx * along + nx * side, sy = y0 + cy * along + ny * side;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + cx * 26, sy + cy * 26);
          ctx.stroke();
        }
      }));
      let blowT = 0, hitT = 0;
      a.ticks.push(dt => {
        if ((blowT += dt) > 1.5) return;
        for (let k = 0; k < 10; k++) {
          const aa = ang + rand(-0.38, 0.38), sp = rand(380, 540);
          g.particles.spawn({ x: m.x, y: m.y, z: m.z, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, vz: rand(-30, 30), gz: 0, drag: 0.6,
            life: rand(0.5, 0.75), size: rand(2, 6), sizeEnd: 1, colors: ICE });
        }
        if ((hitT += dt) >= 0.25) {
          hitT = 0;
          a.strike(0.11, { customArt: true, knockback: 40, stagger: 0.2 });
        }
      });
      // Ice spikes burst up in widening rows from Kyurem out across the arena.
      for (let r = 1; r <= 8; r++) a.later(r * 0.09, () => {
        const d = (len * r) / 8, spread = 14 + r * 9, n = 1 + Math.min(3, Math.floor(r / 2));
        for (let k = 0; k < n; k++) {
          const side = n === 1 ? 0 : (k / (n - 1) - 0.5) * 2 * spread;
          const x = u.x + Math.cos(ang) * d - Math.sin(ang) * side, y = u.y + Math.sin(ang) * d + Math.cos(ang) * side;
          const p = clampPt(x, y);
          g.spawn(new Spike(p.x, p.y, 'ice', 2.4 - r * 0.1));
          g.marks.frost(p.x, p.y, rand(12, 20));
        }
        g.shake(2, 0.12);
      });
    });
    // The foe freezes solid in a block of ice…
    a.later(2.4, () => {
      a.anim('Pose', 1);
      g.spawn(new Stuck(t, 0.62, (ctx, mon, age) => {
        const grow = Math.min(1, age / 0.18), w = (mon.radius + 8) * grow, h = (mon.headZ ?? mon.bodyZ * 1.8) + 10;
        const x = mon.x - w, y = mon.y + 4 - h * grow;
        ctx.fillStyle = 'rgba(150,225,255,0.55)';
        ctx.fillRect(x, y, w * 2, h * grow);
        ctx.strokeStyle = '#1f5a8a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w * 2, h * grow);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(x + 3, y + 3, 3, h * grow * 0.6);
        ctx.fillRect(x + 8, y + 3, 6, 2);
      }));
    });
    // …which shatters.
    a.later(3.0, () => {
      iceShatter(g, t.x, t.y, t.bodyZ);
      iceShatter(g, t.x, t.y, t.bodyZ * 1.6);
      spray(g, t.x, t.y, t.bodyZ, 26, ICE, { speed: 180, up: 160, size: [2, 6] });
      for (const [r1, life] of [[60, 0.3], [130, 0.5]]) g.spawn(new Ring(t.x, t.y, { r0: 10, r1, life, color: '#c8f2ff', width: 4 }));
      g.shake(8, 0.35);
      a.strike(0.34, { customArt: true, knockback: 220, stagger: 0.55 });
      if (t.alive && !t.hidden) g.applyStatus(t, 'slow', { source: u, dur: 4 });
    });
    a.end(3.6);
  },

  // It sings: notes rise and a stream of bubbles drifts at the foe and bursts on it (and washes off a burn).
  sparklingAriaUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Pose', 0.9);
    for (let i = 0; i < 6; i++) a.later(0.1 + i * 0.22, () => {
      const c = ['#5ac8ff', '#ff8ad0', '#ffffff'][i % 3];
      g.spawn(new Flyer({ from: { x: u.x + rand(-10, 10), y: u.y, z: u.headZ ?? u.bodyZ * 1.6 }, to: { x: u.x + rand(-30, 30), y: u.y, z: (u.headZ ?? 30) + 40 },
        dur: 0.9, paint: (ctx, x, y, age) => big(ctx, x + Math.sin(age * 6) * 3, y, 2, () => drawNote(ctx, 0, 0, c)) }));
    });
    for (let i = 0; i < 18; i++) a.later(0.4 + i * 0.06, () => {
      const r = rand(3, 7), wob = rand(0, TAU), off = { x: rand(-14, 14), z: rand(-4, 16) };
      g.spawn(new Flyer({ from: { x: u.x, y: u.y, z: u.bodyZ }, to: () => ({ x: t.x + off.x, y: t.y, z: t.bodyZ + off.z }), dur: rand(0.6, 0.8), arc: 14,
        paint: (ctx, x, y, age) => drawBubble(ctx, x + Math.sin(age * 8 + wob) * 4, y, r),
        onArrive: () => {
          g.spawn(new Ring(t.x + off.x, t.y, { z: t.bodyZ + off.z, r0: r, r1: r + 6, life: 0.2, color: '#d8f2ff', width: 1, layer: 'air' }));
          if (i % 3 === 2) a.strike(1 / 6, { customArt: true, knockback: 30, stagger: 0.15 });
        } }));
    });
    a.later(1.9, () => {
      waterSplash(g, t.x, t.y);
      if (t.status?.burn > 0) t.status.burn = 0; // the bubbles wash a burn off the foe
    });
    a.end(2.3);
  },

  // Wrapped in high energy, it charges up and slams straight into the foe.
  multiAttackUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.7);
    // Cloaked in high energy for the whole charge and slam.
    g.spawn(new EnergyAura(u, 1.15, true, { glow: [200, 212, 240], rings: ['#ffffff', '#7a88b0'] }));
    g.spawn(new Glow(u.x, u.y, u.bodyZ, 40, [150, 165, 210], 0.75, true));
    inward(g, u.x, u.y, u.bodyZ, 16, 44, ['#ffffff', '#8a96b0', '#3a4458'], 0.5);
    a.later(0.65, () => {
      face(a, u, t);
      a.anim('Walk', 2);
      const ang = u.aimAt(t), past = clampPt(t.x + Math.cos(ang) * 40, t.y + Math.sin(ang) * 40);
      glide(a, g, u, past, 0.28, '#dfe6f5', { lines: '#ffffff' });
      a.later(0.2, () => {
        a.anim('Attack', 1.4);
        for (const [r1, life] of [[40, 0.25], [90, 0.45]]) g.spawn(new Ring(t.x, t.y, { r0: 8, r1, life, color: '#eef2fa', width: 4 }));
        debris(g, t.x, t.y, 10, 140);
        g.shake(7, 0.3);
        a.strike(1, { customArt: true, knockback: 300, stagger: 0.6 });
      });
    });
    a.end(1.8);
  },

  // The anchor flies out on its chain, hits, and the chain wraps the foe so it can't get away; then a yank.
  anchorShotUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.5);
    a.later(0.35, () => {
      face(a, u, t);
      a.anim('Attack', 1.1);
      const hand = () => ({ x: u.x, y: u.y, z: u.bodyZ });
      g.spawn(new Flyer({ from: hand(), to: () => body(t), dur: 0.4, arc: 14, paint: (ctx, x, y, age, f) => {
        drawChain(ctx, u.x, u.y - u.bodyZ, x, y);
        drawAnchor(ctx, x, y, u.aimAt(t));
      }, onArrive: () => {
        play('clang');
        metalSparks(g, t.x, t.y, t.bodyZ);
        a.strike(0.6, { customArt: true, knockback: 40, stagger: 0.4 });
        // Chain wound round the foe, still attached to the user.
        g.spawn(new Stuck(t, 1.1, (ctx, mon, age) => {
          const cy = mon.y - mon.bodyZ;
          drawChain(ctx, u.x, u.y - u.bodyZ, mon.x, cy);
          ctx.strokeStyle = '#20262c';
          ctx.lineWidth = 3;
          for (let k = 0; k < 2; k++) {
            ctx.beginPath();
            ctx.ellipse(mon.x, cy + k * 6 - 3, mon.radius + 3, 4, 0, 0, TAU);
            ctx.stroke();
          }
          ctx.strokeStyle = '#8e9aa6';
          ctx.lineWidth = 1;
          for (let k = 0; k < 2; k++) {
            ctx.beginPath();
            ctx.ellipse(mon.x, cy + k * 6 - 3, mon.radius + 3, 4, 0, 0, TAU);
            ctx.stroke();
          }
          drawAnchor(ctx, mon.x + mon.radius, cy + 6, 0.4);
        }));
        if (t.alive) g.applyStatus(t, 'slow', { source: u, dur: 4 });
        a.later(1.0, () => {
          a.anim('Attack', 1.3);
          dustCloud(g, t.x, t.y, 8, 5);
          a.strike(0.4, { customArt: true, knockback: 60, stagger: 0.5 });
        });
      } }));
    });
    a.end(2.1);
  },

  // It rattles every scale on its body: a huge clanging noise rolls out in rings; its own Defense drops.
  clangingScalesUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 1);
    let shake = 0;
    a.ticks.push(dt => {
      if ((shake += dt) > 1.6) return;
      if (Math.random() < 0.5) g.particles.spawn({ x: u.x + rand(-u.radius, u.radius), y: u.y, z: rand(4, u.bodyZ * 1.8), vx: rand(-40, 40), vz: rand(30, 70),
        life: 0.35, size: 2, colors: ['#fff6c0', '#e0b030', '#ffffff'] });
    });
    for (let i = 0; i < 4; i++) a.later(0.3 + i * 0.34, () => {
      a.anim(i % 2 ? 'Pose' : 'Charge', 1.6);
      play('clang');
      g.spawn(new Painted(0.6, (ctx, p) => {
        const r = 14 + p * 220, cy = u.y - u.bodyZ;
        ctx.globalAlpha = 1 - p;
        for (const [w, c] of [[5, '#5a3a8a'], [3, '#e0b030'], [1, '#fff6c0']]) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w;
          ctx.beginPath();
          for (let k = 0; k <= 36; k++) {
            const ang = (k / 36) * TAU, rr = r + (k % 2 ? 5 : -5);
            ctx.lineTo(u.x + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.6);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }));
      g.shake(3, 0.2);
      a.later(0.2, () => a.strike(0.25, { customArt: true, knockback: 90, stagger: 0.3 }));
    });
    a.end(2.2);
  },

  // Light gathers on Necrozma, a ring of light marks the ground under the foe, and a pillar of light erupts there.
  photonGeyserUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.6);
    g.spawn(new Glow(u.x, u.y, u.bodyZ, 44, [255, 246, 200], 0.8, true));
    inward(g, u.x, u.y, u.bodyZ, 22, 60, ['#ffffff', '#fff2b0', '#ffd860'], 0.6);
    a.later(0.55, () => {
      g.spawn(new Ring(t.x, t.y, { r0: 30, r1: 8, life: 0.4, color: '#fff2b0', width: 3, hold: true }));
      g.spawn(new Ring(t.x, t.y, { r0: 6, r1: 34, life: 0.4, color: '#ffffff', width: 2 }));
    });
    a.later(0.9, () => {
      a.anim('Shoot', 1);
      const x = t.x, y = t.y;
      g.spawn(new Painted(1.0, (ctx, p) => {
        const grow = Math.min(1, p * 6), fade = 1 - Math.max(0, p - 0.65) / 0.35, w = 30 * grow * fade + 2, top = 0;
        const gr = ctx.createLinearGradient(x - w, 0, x + w, 0);
        gr.addColorStop(0, 'rgba(255,216,96,0)');
        gr.addColorStop(0.3, `rgba(255,242,176,${0.75 * fade})`);
        gr.addColorStop(0.5, `rgba(255,255,255,${fade})`);
        gr.addColorStop(0.7, `rgba(255,242,176,${0.75 * fade})`);
        gr.addColorStop(1, 'rgba(255,216,96,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(x - w, top, w * 2, y - top);
        ctx.fillStyle = `rgba(255,255,255,${0.9 * fade})`;
        ctx.beginPath();
        ctx.ellipse(x, y, w * 1.2, w * 0.4, 0, 0, TAU);
        ctx.fill();
      }));
      for (let k = 0; k < 24; k++) g.particles.spawn({ x: x + rand(-14, 14), y, z: rand(0, 40), vz: rand(220, 420), gz: 0, life: rand(0.4, 0.7), size: rand(2, 4), sizeEnd: 1,
        colors: ['#ffffff', '#fff2b0', '#ffd860'] });
      g.shake(6, 0.35);
      for (let k = 0; k < 3; k++) a.later(k * 0.15, () => a.strike(1 / 3, { customArt: true, knockback: 80, stagger: 0.35 }));
    });
    a.end(2.2);
  },

  // Its head flame swells and its head blows up: a huge blast all around it; it loses half its max HP.
  mindBlownUlt(a, g, u, t) {
    a.anim('Charge', 1);
    const hz = () => (u.headZ ?? u.bodyZ * 1.6) + 6;
    let grow = 0;
    a.ticks.push(dt => {
      if ((grow += dt) > 0.9) return;
      const r = 4 + grow * 16;
      for (let k = 0; k < 3; k++) g.particles.spawn({ x: u.x + rand(-r, r) * 0.6, y: u.y, z: hz() + rand(0, r), vz: rand(30, 80), gz: -20, life: 0.35,
        size: rand(3, 6) + grow * 4, sizeEnd: 1, colors: FIRE });
    });
    a.later(0.95, () => {
      a.anim('Hurt', 1);
      play('explosion');
      for (const [r1, life, c, w] of [[60, 0.3, '#fffbd0', 6], [150, 0.5, '#ffab33', 5], [260, 0.75, '#d23a17', 4]]) {
        g.spawn(new Ring(u.x, u.y, { z: hz() * 0.5, r0: 8, r1, life, color: c, width: w, layer: 'air' }));
      }
      g.spawn(new Glow(u.x, u.y, hz(), 90, [255, 170, 60], 0.6));
      spray(g, u.x, u.y, hz(), 40, FIRE, { speed: 260, up: 220, size: [3, 7], life: [0.5, 0.9] });
      g.marks.scorch(u.x, u.y, 46, 8);
      g.shake(10, 0.45);
      a.later(0.2, () => {
        g.marks.scorch(t.x, t.y, 18, 6);
        a.strike(1, { customArt: true, knockback: 260, stagger: 0.5 });
      });
    });
    a.end(2);
  },

  // It strums: each twang sends a booming echo of electric sound out across the arena, shaking the ground.
  overdriveUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.5);
    for (let i = 0; i < 4; i++) a.later(0.3 + i * 0.3, () => {
      a.anim('Attack', 1.6);
      const cy = () => u.y - u.bodyZ;
      g.spawn(new Painted(0.7, (ctx, p) => {
        const r = 12 + p * 230;
        ctx.globalAlpha = 1 - p;
        for (const [w, c] of [[6, '#7a3ac0'], [3, '#ffe066'], [1, '#ffffff']]) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w;
          ctx.beginPath();
          for (let k = 0; k <= 48; k++) {
            const ang = (k / 48) * TAU, rr = r + Math.sin(k * 3 + p * 30) * 5;
            ctx.lineTo(u.x + Math.cos(ang) * rr, cy() + Math.sin(ang) * rr * 0.6);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }));
      electricBurst(g, u.x, u.y, u.bodyZ, 8);
      g.shake(4, 0.2);
      a.later(0.25, () => {
        electricBurst(g, t.x, t.y, t.bodyZ, 6);
        a.strike(0.25, { customArt: true, knockback: 70, stagger: 0.25 });
      });
    });
    a.end(2.1);
  },

  // A crackling wheel of electricity forms round Morpeko and it rolls into the foe, twice; its Speed rises.
  auraWheelUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.5);
    const wheel = new Stuck(u, 1.6, (ctx, mon, age) => {
      const cy = mon.y - mon.bodyZ, r = mon.radius + 12;
      for (const [w, c] of [[7, '#2a2010'], [4, '#ffe066'], [1, '#ffffff']]) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(mon.x, cy, r, 0, TAU);
        ctx.stroke();
      }
      for (let k = 0; k < 8; k++) {
        const ang = age * 14 + (k / 8) * TAU, x = mon.x + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
        px(ctx, '#2a2010', x - 4, y - 4, 8, 8);
        px(ctx, k % 2 ? '#fff6a0' : '#ffffff', x - 3, y - 3, 6, 6);
      }
    });
    g.spawn(wheel);
    for (let i = 0; i < 2; i++) a.later(0.4 + i * 0.55, () => {
      face(a, u, t);
      a.anim('Walk', 2.2);
      const ang = u.aimAt(t), past = clampPt(t.x + Math.cos(ang) * 36, t.y + Math.sin(ang) * 36);
      glide(a, g, u, past, 0.24, '#ffe066', { lines: '#fff6a0' });
      a.later(0.18, () => {
        electricBurst(g, t.x, t.y, t.bodyZ, 10);
        a.strike(0.5, { customArt: true, knockback: 170, stagger: 0.4 });
      });
    });
    a.end(2);
  },

  // A flourish, then the rigged bouquet is tossed at the foe and goes off in a burst of petals: always a critical hit.
  flowerTrickUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Pose', 1);
    a.later(0.45, () => {
      face(a, u, t);
      a.anim('Attack', 1.2);
      g.spawn(new Flyer({ from: { x: u.x, y: u.y, z: u.bodyZ + 6 }, to: () => body(t), dur: 0.55, arc: 46, paint: (ctx, x, y, age) => big(ctx, x, y, 1.3, () => drawBouquet(ctx, 0, 0, age * 6)),
        onArrive: () => {
          leafBurst(g, t.x, t.y, t.bodyZ, 12);
          spray(g, t.x, t.y, t.bodyZ, 26, ['#ff6fa8', '#ff3a5a', '#ffd0e8', '#ffe066'], { speed: 150, up: 140, size: [2, 4] });
          g.spawn(new Glow(t.x, t.y, t.bodyZ, 36, [255, 120, 170], 0.35));
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 6, r1: 46, life: 0.35, color: '#ff8ab8', width: 4, layer: 'air' }));
          g.shake(5, 0.25);
          a.strike(1, { customArt: true, knockback: 200, stagger: 0.45, critChance: 1 });
        } }));
    });
    a.end(1.8);
  },

  // Salt pours down on the foe and crusts over it; the salt keeps eating at it afterwards.
  saltCureUlt(a, g, u, t) {
    face(a, u, t);
    a.anim('Charge', 0.7);
    for (let i = 0; i < 22; i++) a.later(0.35 + i * 0.035, () => {
      const off = { x: rand(-16, 16), y: rand(-6, 6) }, s = Math.floor(rand(1, 3));
      g.spawn(new Flyer({ from: () => ({ x: t.x + off.x, y: t.y + off.y, z: 150 + rand(0, 60) }), to: () => ({ x: t.x + off.x, y: t.y + off.y, z: rand(2, t.bodyZ * 1.8) }),
        dur: 0.32, paint: (ctx, x, y) => big(ctx, x, y, 2, () => drawSalt(ctx, 0, 0, s)) }));
    });
    a.later(0.5, () => a.anim('Attack', 1));
    a.later(0.75, () => {
      spray(g, t.x, t.y, t.bodyZ, 22, ['#fcf7e6', '#a2968f', '#7a7068'], { speed: 60, up: 90, size: [3, 5] });
      g.marks.energy?.(t.x, t.y, 20, [230, 222, 205], 5);
      play('clang');
      if (a.strike(1, { customArt: true, knockback: 70, stagger: 0.48 }) && t.alive && !t.salted) t.salted = { by: u.side, t: 0 };
      // Salt crystals stay crusted on the foe.
      const bits = Array.from({ length: 9 }, () => ({ x: rand(-1, 1), z: rand(0.2, 1.7), s: Math.floor(rand(1, 3)) }));
      g.spawn(new Stuck(t, 4, (ctx, mon) => {
        for (const b of bits) big(ctx, mon.x + b.x * mon.radius, mon.y - mon.bodyZ * b.z, 2, () => drawSalt(ctx, 0, 0, b.s));
      }));
    });
    a.end(1.9);
  },
};
