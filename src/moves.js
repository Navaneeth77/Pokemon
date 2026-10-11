import { animDuration } from './assets.js';
import { dirFromVector } from './sprite.js';
import { applyHit } from './combat.js';
import { BOUNDS } from './arena.js';
import {
  flameColors, rand, Glow, ClawSlash, FangBite, Beam, Telegraph, FloatText, Ring, Lightning, BeamLine, SlashArc,
  Afterimage, GroundMarker, StormCloud, StormSwirl, Pillar, EnergyAura, ScreenDim, RainbowStreak, waterSplash, iceShatter, dustCloud, electricBurst, leafBurst,
  debris, windBurst, metalSparks,
} from './effects.js';
import { AirBlade, Orb } from './projectiles.js';
import { sfx } from './audio.js';

const WATER_JET = ['#ffffff', '#d4f1ff', '#86ccff', '#3a8ae8'];
const ICE = ['#ffffff', '#d8f6ff', '#9be6ff'];
const ease = t => 1 - (1 - t) * (1 - t);
const clampX = x => Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, x));
const clampY = y => Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, y));

function turnToward(a, b, max) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + Math.max(-max, Math.min(max, d));
}

// Perpendicular distance from (px, py) to a ray of length `len`; Infinity if outside it.
function rayDistance(px, py, x0, y0, ang, len) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const t = (px - x0) * dx + (py - y0) * dy;
  if (t < 0 || t > len) return Infinity;
  return Math.abs((px - x0) * dy - (py - y0) * dx);
}

// A move in progress. Subclasses schedule their phases with `at()` so damage lands on the
// animation's own Rush/Hit frames from AnimData.xml; per-move tuning lives in MOVES below.
class MoveAction {
  constructor(move, user, game) {
    this.move = move;
    this.user = user;
    this.target = user.foe;
    this.game = game;
    this.t = 0;
    this.done = false;
    this.allowMove = false;
    this.events = [];
    this.stack = {};
    this.aim = user.aimAt(this.target);
    user.face(this.target.x, this.target.y);
    this.start();
  }

  at(time, fn) {
    this.events.push({ time, fn });
    this.events.sort((a, b) => a.time - b.time);
  }

  update(dt) {
    this.t += dt;
    while (!this.done && this.events.length && this.events[0].time <= this.t) this.events.shift().fn();
    if (!this.done) this.tick(dt);
  }

  tick() {}
  cleanup() {}

  finish(recovery = 0, root = 0) {
    if (this.done) return;
    this.done = true;
    this.user.busy = recovery;
    this.user.root = root;
    this.cleanup();
  }

  cancel() {
    if (this.done) return;
    this.done = true;
    this.cleanup();
  }

  anim(name, speed = 1) {
    this.user.sprite.play(name, { loop: false, speed, force: true });
    return this.user.sprite.anim;
  }

  timeTo(anim, frame, speed = 1) {
    return animDuration(anim, frame ?? 0) / speed;
  }

  retarget(maxTurn = Infinity) {
    this.aim = turnToward(this.aim, this.user.aimAt(this.target), maxTurn);
    this.user.dir = dirFromVector(Math.cos(this.aim), Math.sin(this.aim));
  }

  front(dist) {
    return { x: this.user.x + Math.cos(this.aim) * dist, y: this.user.y + Math.sin(this.aim) * dist };
  }

  mouth() {
    const m = this.user.species.mouth;
    return { ...this.front(m.fwd), z: m.z + this.user.z };
  }

  inReach(extra) {
    const u = this.user, t = this.target;
    if (!t.alive || t.hidden) return false;
    const d = u.distTo(t);
    if (d > u.radius + t.radius + extra) return false;
    const off = Math.abs(turnToward(this.aim, u.aimAt(t), Infinity) - this.aim);
    return off < 1.3 || d < u.radius + t.radius + 4;
  }

  hit(opts) {
    const u = this.user, t = this.target;
    const d = u.distTo(t) || 1;
    return applyHit(this.game, u, t, this.move, { dirX: (t.x - u.x) / d, dirY: (t.y - u.y) / d, stack: this.stack, ...opts });
  }

  startLunge(maxDist, duration, pad = 6) {
    const u = this.user, t = this.target;
    const left = Math.max(0, Math.min(maxDist, u.distTo(t) - (u.radius + t.radius + pad)));
    this.lunge = { left, speed: left / Math.max(0.05, duration) };
  }

  lungeStep(dt) {
    const l = this.lunge;
    if (!l || l.left <= 0) return;
    const step = Math.min(l.left, l.speed * dt);
    this.user.x += Math.cos(this.aim) * step;
    this.user.y += Math.sin(this.aim) * step;
    l.left -= step;
  }

  converge(rate, dt, colors, radius) {
    const u = this.user, m = this.mouth();
    this.emit = (this.emit ?? 0) + dt * rate;
    for (; this.emit >= 1; this.emit--) {
      const a = rand(0, Math.PI * 2), r = rand(radius * 0.8, radius * 1.2), life = 0.3;
      const x = u.x + Math.cos(a) * r, y = u.y + Math.sin(a) * r * 0.7, z = u.bodyZ + rand(-8, 8);
      this.game.particles.spawn({
        x, y, z, vx: (m.x - x) / life, vy: (m.y - y) / life, vz: (m.z - z) / life,
        life, size: rand(3, 5), sizeEnd: 1, colors, fade: false,
      });
    }
  }
}

// Sustained stream from the mouth (Flamethrower, Hydro Pump): tracks slowly, hits on a fixed tick
// and leaves marks where it lands.
class Stream extends MoveAction {
  start() {
    const c = this.move.stream;
    this.tickT = 0;
    this.markT = 0;
    if (c.charge) {
      this.charging = true;
      this.user.sprite.play('Charge', { loop: true, force: true });
      this.at(c.charge, () => this.open());
    } else this.open();
  }

  open() {
    const c = this.move.stream, s = 0.9;
    this.charging = false;
    const a = this.anim('Shoot', s);
    this.user.sprite.pauseAt = a.hitFrame ?? 2;
    const fire = this.t + this.timeTo(a, a.hitFrame, s);
    this.at(fire, () => {
      this.firing = true;
      this.sound = c.sound(c.duration + 0.05);
      if (c.core) {
        const m = this.mouth(), p = this.front(c.reach);
        this.core = this.game.spawn(new Beam(m.x, m.y - m.z, p.x, p.y - 8, c.duration, { width: 7, colors: c.core }));
      }
    });
    this.at(fire + c.duration, () => {
      this.firing = false;
      this.user.sprite.pauseAt = null;
    });
    this.at(fire + c.duration + 0.2, () => this.finish(0.2));
  }

  tick(dt) {
    const c = this.move.stream, colors = c.colors(this.user);
    if (this.charging) {
      this.retarget(3 * dt);
      this.converge(70, dt, colors, 22);
      return;
    }
    if (!this.firing) return;
    this.retarget(c.track * dt);
    const g = this.game, m = this.mouth();
    this.emit = (this.emit ?? 0) + dt * c.rate;
    for (; this.emit >= 1; this.emit--) {
      const a = this.aim + rand(-c.spread, c.spread), sp = rand(c.speed[0], c.speed[1]), life = rand(c.life[0], c.life[1]);
      g.particles.spawn({
        x: m.x, y: m.y, z: m.z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: -(m.z - 8) / life, drag: 0.5,
        life, size: rand(3, 4), sizeEnd: rand(c.sizeEnd[0], c.sizeEnd[1]), colors,
      });
    }
    if (this.core) {
      const p = this.front(c.reach);
      this.core.set(m.x, m.y - m.z, p.x, p.y - 8);
    }
    this.markT -= dt;
    if (this.markT <= 0) {
      this.markT = 0.09;
      const p = this.front(rand(c.reach * 0.6, c.reach * 0.95));
      g.marks[c.mark](p.x + rand(-6, 6), p.y + rand(-6, 6), rand(3, 5));
    }
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = c.tick;
      const t = this.target;
      if (t.alive && rayDistance(t.x, t.y, this.user.x, this.user.y, this.aim, this.move.range) <= c.width + t.radius) {
        const landed = this.hit({
          dirX: Math.cos(this.aim), dirY: Math.sin(this.aim), knockback: c.knockback, stagger: c.stagger,
          critChance: 0.03, burnChance: this.rolled ? 0 : c.burnChance ?? 0,
        });
        this.rolled = true;
        if (landed && c.mark === 'wet' && Math.random() < 0.5) waterSplash(g, t.x, t.y);
      }
    }
  }

  cleanup() {
    this.user.sprite.pauseAt = null;
    this.sound?.stop();
    if (this.core) this.core.dead = true;
  }
}

// What each melee style looks like when it swings, and extra feedback when it connects.
const SWING_FX = {
  claw(g, u, ang, i) {
    const p = { x: u.x + Math.cos(ang) * (u.radius + 10), y: u.y + Math.sin(ang) * (u.radius + 10) };
    g.spawn(new ClawSlash(p.x, p.y, u.bodyZ, ang, i % 2 === 1));
    sfx.slash();
  },
  blade(g, u, ang, i) {
    g.spawn(new SlashArc(u.x, u.y, u.bodyZ, ang, { radius: u.radius + 14, spread: 2.4, colors: ['#5fd04a', '#eaffd8'], width: 6, mirror: i % 2 === 1 }));
    leafBurst(g, u.x + Math.cos(ang) * 18, u.y + Math.sin(ang) * 18, u.bodyZ, 6);
    sfx.slash();
  },
  tail(g, u, ang) {
    g.spawn(new SlashArc(u.x, u.y, u.bodyZ, ang, { radius: u.radius + 12, spread: 3, colors: ['#8f9db2', '#ffffff'], width: 5, life: 0.25 }));
    sfx.whoosh();
  },
};
const CONNECT_FX = {
  blade: (g, t) => g.marks.leaves(t.x, t.y + 2, 10),
  tail(g, t) {
    metalSparks(g, t.x, t.y, t.bodyZ);
    sfx.clang();
  },
};

// Close-range strikes (Dragon Claw, Leaf Blade, Iron Tail): lunge in, then one or more hits that
// only connect if the target is within reach when the hit frame plays.
class Melee extends MoveAction {
  start() {
    const c = this.move.melee, s = c.speed ?? 0.85, a = this.anim(c.anim, s);
    const hit = this.timeTo(a, a.hitFrame ?? 3, s);
    const rush = Math.min(hit * 0.6, this.timeTo(a, a.rushFrame ?? 1, s));
    this.at(rush, () => {
      this.retarget();
      this.startLunge(c.lunge, Math.max(0.06, hit - rush));
    });
    c.hits.forEach((h, i) => this.at(hit + (h.delay ?? 0), () => this.strike(h, i)));
    const last = hit + (c.hits[c.hits.length - 1].delay ?? 0);
    this.at(Math.max(this.timeTo(a, a.frames, s), last + 0.12), () => this.finish(c.recovery ?? 0.12));
  }

  tick(dt) {
    this.lungeStep(dt);
  }

  strike(h, i) {
    const c = this.move.melee;
    this.retarget(0.6);
    SWING_FX[c.fx](this.game, this.user, this.aim, i);
    if (!this.inReach(this.move.reach)) return;
    const landed = this.hit({ knockback: h.knockback, stagger: h.stagger ?? 0.28, hitstop: h.hitstop ?? 0.04, critChance: c.critChance });
    if (landed) CONNECT_FX[c.fx]?.(this.game, this.target);
  }
}

// Fast dashes (Quick Attack, Extreme Speed, Aerial Ace) with afterimages; can pass through the
// target, repeat, or home in for a guaranteed hit.
class Dash extends MoveAction {
  start() {
    const c = this.move.dash;
    this.passes = 0;
    this.ghostT = 0;
    this.sure = !!c.sure && this.user.distTo(this.target) <= this.move.range;
    this.user.sprite.play('Charge', { loop: true, force: true });
    this.at(c.windup, () => this.pass());
  }

  pass() {
    const c = this.move.dash, u = this.user, t = this.target;
    this.retarget();
    const d = u.distTo(t), contact = u.radius + t.radius + 2;
    const len = c.through ? Math.min(c.dist, d + contact + 12) : Math.max(0, Math.min(c.dist, d - contact));
    this.from = { x: u.x, y: u.y };
    this.to = { x: clampX(u.x + Math.cos(this.aim) * len), y: clampY(u.y + Math.sin(this.aim) * len) };
    this.dashT = 0;
    this.dashing = true;
    this.struck = false;
    u.phasing = true;
    this.anim('Attack', 2);
    sfx.dash();
    this.game.spawn(new BeamLine(this.from.x, this.from.y - u.bodyZ, this.to.x, this.to.y - u.bodyZ, 0.3, c.color, c.width ?? 3));
  }

  tick(dt) {
    if (!this.dashing) return;
    const c = this.move.dash, u = this.user, t = this.target;
    this.dashT += dt;
    const k = Math.min(1, this.dashT / c.dur);
    u.x = this.from.x + (this.to.x - this.from.x) * k;
    u.y = this.from.y + (this.to.y - this.from.y) * k;
    this.ghostT -= dt;
    if (this.ghostT <= 0) {
      this.ghostT = 0.025;
      this.game.spawn(new Afterimage(u, 0.22, c.ghost));
    }
    if (!this.struck && (u.distTo(t) <= u.radius + t.radius + 8 || (this.sure && k >= 1))) {
      this.struck = true;
      this.impact();
    }
    if (k < 1) return;
    this.dashing = false;
    this.passes++;
    dustCloud(this.game, u.x, u.y, 4, 3);
    if (this.passes < (c.passes ?? 1)) this.at(this.t + (c.gap ?? 0.08), () => this.pass());
    else {
      u.phasing = false;
      this.at(this.t + 0.12, () => this.finish(c.recovery ?? 0.2));
    }
  }

  impact() {
    const c = this.move.dash, t = this.target, g = this.game, z = t.bodyZ;
    if (c.slash) {
      g.spawn(new SlashArc(t.x, t.y, z, this.aim + 2.4, { radius: 13, spread: 1.6, colors: ['#9fd8ff', '#ffffff'], width: 4 }));
      g.spawn(new SlashArc(t.x, t.y, z, this.aim - 2.4, { radius: 13, spread: 1.6, colors: ['#9fd8ff', '#ffffff'], width: 4, mirror: true }));
      sfx.slash();
    }
    windBurst(g, t.x, t.y, z, 14, [c.color, '#ffffff']);
    g.spawn(new Ring(t.x, t.y, { z, r0: 4, r1: 22, life: 0.25, color: c.color, width: 3, layer: 'air' }));
    this.hit({ dirX: Math.cos(this.aim), dirY: Math.sin(this.aim), knockback: c.knockback, stagger: 0.28, hitstop: 0.04 });
  }

  cleanup() {
    this.user.phasing = false;
  }
}

// Fires one or more projectiles on the animation's hit frame (Air Slash, Dragon Pulse, Energy Ball, Ice Shard).
class Shot extends MoveAction {
  start() {
    const c = this.move.shot, s = c.speed ?? 0.85, a = this.anim(c.anim ?? 'Shoot', s);
    const hit = this.timeTo(a, a.hitFrame ?? 2, s);
    const spread = c.spread ?? [0];
    spread.forEach((off, i) => this.at(hit + i * (c.stagger ?? 0), () => this.fire(off)));
    const last = hit + (spread.length - 1) * (c.stagger ?? 0);
    this.at(Math.max(this.timeTo(a, a.frames, s), last + 0.1), () => this.finish(c.recovery ?? 0.12));
  }

  fire(off) {
    this.retarget();
    const c = this.move.shot, m = this.mouth(), ang = this.aim + off;
    this.game.spawn(c.style
      ? new Orb(this.game, this.user, this.move, m.x, m.y, m.z, ang, c.style)
      : new AirBlade(this.game, this.user, this.move, m.x, m.y, m.z, ang));
    sfx[c.sound]();
    this.allowMove = true;
  }
}

// Charged straight beams (Hyper Beam, Ice Beam) with a visible firing lane during the charge.
class BeamAttack extends MoveAction {
  start() {
    const c = this.move.beam, u = this.user;
    u.sprite.play('Charge', { loop: true, force: true });
    this.charging = true;
    this.tele = this.game.spawn(new Telegraph(u.x, u.y, this.aim, this.move.range, c.width + this.target.radius, c.teleColor));
    this.chargeSound = c.big ? sfx.beamCharge(c.charge) : sfx.zap(c.charge);
    this.at(c.charge, () => this.fire());
  }

  tick(dt) {
    const c = this.move.beam;
    if (this.charging) {
      if (this.t < c.lock) this.retarget(2.2 * dt);
      this.tele.set(this.user.x, this.user.y, this.aim);
      this.converge(80, dt, c.chargeColors, 28);
    } else if (this.firing && !this.hitDone && this.t - this.fireT < 0.2) {
      const t = this.target;
      if (t.alive && rayDistance(t.x, t.y, this.user.x, this.user.y, this.aim, this.move.range) <= c.width + t.radius) {
        this.hitDone = true;
        if (this.hit({ dirX: Math.cos(this.aim), dirY: Math.sin(this.aim), knockback: c.knockback, stagger: c.stagger, hitstop: c.hitstop, freezeChance: c.freezeChance })) {
          this.game.spawn(new Glow(t.x, t.y, t.bodyZ, 34, c.flash, 0.3));
          if (c.mark === 'frost') iceShatter(this.game, t.x, t.y, t.bodyZ);
        }
      }
    }
  }

  fire() {
    const c = this.move.beam, u = this.user, g = this.game;
    this.charging = false;
    this.firing = true;
    this.fireT = this.t;
    this.tele.dead = true;
    const a = this.anim('Shoot', 1);
    u.sprite.pauseAt = a.hitFrame ?? 2;
    const m = this.mouth(), end = this.front(this.move.range);
    g.spawn(new Beam(m.x, m.y - m.z, end.x, end.y - 10, c.duration, { width: c.visualWidth, colors: c.colors }));
    sfx[c.sound]();
    if (c.rings) {
      // Pulse rings travelling down the beam.
      for (let i = 1; i <= 4; i++) {
        const d = (this.move.range * i) / 5, p = this.front(d), z = m.z + (10 - m.z) * (d / this.move.range);
        g.spawn(new Ring(p.x, p.y, { z, r0: 3, r1: 15, life: 0.3 + i * 0.06, color: c.rings, width: 2.5, layer: 'air' }));
      }
    }
    g.shake(c.shake, 0.4);
    if (c.big) {
      u.vx -= Math.cos(this.aim) * 50;
      u.vy -= Math.sin(this.aim) * 50;
    }
    for (let d = 40; d < this.move.range; d += c.markStep) {
      const p = this.front(d);
      if (p.x < BOUNDS.minX - 10 || p.x > BOUNDS.maxX + 10 || p.y < BOUNDS.minY - 20 || p.y > BOUNDS.maxY + 10) break;
      g.marks[c.mark](p.x + rand(-3, 3), p.y + rand(-3, 3), rand(c.markSize[0], c.markSize[1]));
    }
    this.at(this.t + c.duration, () => {
      u.sprite.pauseAt = null;
      if (c.recharge) {
        g.spawn(new FloatText(u.x, u.y - u.headZ - 6, 'MUST RECHARGE!', '#ffd84a'));
        g.ui.log(`${u.species.name} must recharge!`, u.side);
        this.finish(c.recharge, c.recharge);
      } else this.finish(0.2);
    });
  }

  cleanup() {
    if (this.tele) this.tele.dead = true;
    this.user.sprite.pauseAt = null;
    this.chargeSound?.stop();
  }
}

class Thunderbolt extends MoveAction {
  start() {
    this.user.sprite.play('Charge', { loop: true, force: true });
    this.charging = true;
    sfx.zap(0.3);
    this.at(0.28, () => {
      this.charging = false;
      const a = this.anim('Shoot', 1);
      this.at(this.t + this.timeTo(a, a.hitFrame ?? 2), () => this.strike());
      this.at(this.t + Math.max(0.4, this.timeTo(a, a.frames)), () => this.finish(0.25));
    });
  }

  tick(dt) {
    if (!this.charging) return;
    this.retarget(4 * dt);
    const u = this.user, g = this.game;
    if (Math.random() < 0.7) {
      g.particles.spawn({
        x: u.x + rand(-u.radius, u.radius), y: u.y + rand(-4, 4), z: rand(2, u.headZ), vx: rand(-30, 30), vz: rand(-30, 30),
        life: 0.15, size: 1.5, colors: ['#ffffff', '#fff27a'],
      });
    }
    if (Math.random() < 0.25) {
      const z = u.bodyZ;
      g.spawn(new Lightning(u.x - 9, u.y - z + rand(-6, 6), u.x + 9, u.y - z + rand(-6, 6), 0.08, { width: 1, branches: 0 }));
    }
  }

  // The bolt jumps straight to the target if it is in range and roughly ahead; otherwise it fizzles out.
  strike() {
    this.retarget();
    const u = this.user, t = this.target, g = this.game, m = this.mouth();
    const off = Math.abs(Math.atan2(Math.sin(u.aimAt(t) - this.aim), Math.cos(u.aimAt(t) - this.aim)));
    const reach = t.alive && !t.hidden && u.distTo(t) <= this.move.range && off < 0.5;
    const p = reach ? t : this.front(this.move.range);
    const z = reach ? t.bodyZ : 6;
    g.spawn(new Lightning(m.x, m.y - m.z, p.x, p.y - z, 0.3, { width: 2, branches: 3 }));
    electricBurst(g, p.x, p.y, z, 16);
    g.marks.burn(p.x, p.y + 2, 8);
    sfx.thunderbolt();
    if (reach) this.hit({ knockback: 90, stagger: 0.32, hitstop: 0.05 });
  }
}

// A storm cloud gathers over the target's position (dodgeable once it locks), then a huge bolt strikes from the sky.
class Thunder extends MoveAction {
  start() {
    const t = this.target, g = this.game;
    this.spot = { x: t.x, y: t.y };
    this.user.sprite.play('Charge', { loop: true, force: true });
    this.marker = g.spawn(new GroundMarker(t.x, t.y, this.move.radius, '255,230,80'));
    this.cloud = g.spawn(new StormCloud(t.x, Math.max(70, t.y - 120), 1.2));
    sfx.zap(0.7);
    this.at(0.5, () => (this.locked = true));
    this.at(0.75, () => this.strike());
    this.at(1.1, () => this.finish(0.3));
  }

  tick(dt) {
    const t = this.target;
    if (!this.locked && t.alive && !t.hidden) {
      const k = Math.min(1, dt * 3);
      this.spot.x += (t.x - this.spot.x) * k;
      this.spot.y += (t.y - this.spot.y) * k;
      this.marker.set(this.spot.x, this.spot.y);
      this.cloud.x = this.spot.x;
      this.cloud.y = Math.max(70, this.spot.y - 120);
    }
  }

  strike() {
    const { x, y } = this.spot, g = this.game;
    this.marker.dead = true;
    this.anim('Shoot', 1);
    g.spawn(new Lightning(x + rand(-4, 4), Math.max(0, this.cloud.y), x, y - 4, 0.45, { width: 4, branches: 6 }));
    g.flash(0.12);
    g.shake(8, 0.5);
    g.hitstop(0.06);
    sfx.thunder();
    electricBurst(g, x, y, 4, 30);
    g.spawn(new Ring(x, y, { r0: 6, r1: 50, life: 0.4, color: '#fff7a8', width: 3 }));
    g.spawn(new Glow(x, y, 10, 60, [255, 240, 140], 0.35));
    g.marks.burn(x, y, 18);
    g.marks.fracture(x, y, 26, 5.5);
    const t = this.target, d = Math.hypot(t.x - x, t.y - y);
    if (t.alive && d <= this.move.radius + t.radius) {
      this.hit({ dirX: (t.x - x) / (d || 1), dirY: (t.y - y) / (d || 1), knockback: 200, stagger: 0.5, hitstop: 0.08 });
    }
  }

  cleanup() {
    if (this.marker) this.marker.dead = true;
  }
}

// Jump and slam the ground (flyers land first): cracks the arena around the user and hits everything nearby.
class Earthquake extends MoveAction {
  start() {
    const u = this.user;
    if (u.species.fly) u.landT = 1;
    const s = 0.8, a = this.anim('Hop', s);
    const hit = Math.max(0.3, this.timeTo(a, a.hitFrame ?? a.frames - 1, s));
    sfx.whoosh();
    this.at(hit, () => this.quake());
    this.at(hit + 0.5, () => this.finish(0.35));
  }

  quake() {
    const u = this.user, g = this.game, R = this.move.radius;
    g.marks.fracture(u.x, u.y, R * 0.7, 6.5);
    g.spawn(new Ring(u.x, u.y, { r0: 10, r1: R, life: 0.5, color: '#f4ead2', width: 5 }));
    g.spawn(new Ring(u.x, u.y, { r0: 6, r1: R * 0.7, life: 0.35, color: '#ffffff', width: 3 }));
    debris(g, u.x, u.y, 28, 150);
    dustCloud(g, u.x, u.y, 18, 6);
    g.shake(9, 0.7);
    g.hitstop(0.05);
    sfx.quake();
    const t = this.target, d = u.distTo(t);
    if (t.alive && d <= R + t.radius) this.hit({ power: this.move.power * (d < R * 0.5 ? 1 : 0.75), knockback: 200, stagger: 0.5 });
  }
}

// An ice storm over the target's position: swirling snow, frost patches and repeated hits.
class Blizzard extends MoveAction {
  start() {
    const t = this.target;
    this.spot = { x: t.x, y: t.y };
    this.user.sprite.play('Charge', { loop: true, force: true });
    this.marker = this.game.spawn(new GroundMarker(t.x, t.y, this.move.radius, '170,230,255'));
    this.at(0.45, () => this.open());
  }

  open() {
    this.marker.dead = true;
    this.storm = true;
    this.tickT = 0.1;
    this.frostT = 0;
    this.anim('RearUp', 0.6);
    this.game.spawn(new StormSwirl(this.spot.x, this.spot.y, this.move.radius, 1.5));
    sfx.storm(1.5);
    this.at(this.t + 1.4, () => {
      this.storm = false;
      this.finish(0.3);
    });
  }

  tick(dt) {
    const g = this.game, R = this.move.radius, { x, y } = this.spot;
    if (!this.storm) {
      this.retarget(3 * dt);
      this.converge(60, dt, ICE, 24);
      return;
    }
    this.emit = (this.emit ?? 0) + dt * 140;
    for (; this.emit >= 1; this.emit--) {
      const a = rand(0, Math.PI * 2), r = rand(4, R), sp = rand(70, 140);
      g.particles.spawn({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.7, z: rand(2, 40),
        vx: -Math.sin(a) * sp, vy: Math.cos(a) * sp * 0.7, vz: rand(-20, 10), drag: 0.5,
        life: rand(0.3, 0.55), size: rand(1.5, 3), colors: ['#ffffff', '#e2f7ff', '#a6e6ff'],
      });
    }
    if (Math.random() < 0.6) {
      const m = this.mouth(), life = 0.4;
      g.particles.spawn({
        x: m.x, y: m.y, z: m.z, vx: (x - m.x) / life + rand(-20, 20), vy: (y - m.y) / life + rand(-20, 20), vz: -m.z / life,
        life, size: 2, colors: ['#ffffff', '#cdf3ff'],
      });
    }
    this.frostT -= dt;
    if (this.frostT <= 0) {
      this.frostT = 0.22;
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * R * 0.9;
      g.marks.frost(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, rand(6, 11));
    }
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 0.3;
      const t = this.target, d = Math.hypot(t.x - x, t.y - y);
      if (t.alive && d <= R + t.radius) {
        this.hit({ dirX: -(t.y - y) / (d || 1), dirY: (t.x - x) / (d || 1), knockback: 60, stagger: 0.2, freezeChance: 0.06 });
      }
    }
  }

  cleanup() {
    if (this.marker) this.marker.dead = true;
  }
}

const DRAGON_FIRE = ['#ffffff', '#c8ffe0', '#5fe08a', '#1f8a4a'];
const MEGA_FIRE = ['#ffffff', '#fff6b0', '#9fffc8', '#3fd07a', '#1f8a4a'];

// Rayquaza's signature move: it blasts off on a pillar of green energy, roars in the sky wrapped in
// dragon fire above the marked target (out of reach meanwhile), then dives onto it like a comet.
// As Mega Rayquaza everything scales up: higher, brighter, wider, with a bigger crater.
class DragonAscent extends MoveAction {
  start() {
    const u = this.user;
    this.mega = u.isMega;
    this.H = this.mega ? 200 : 160;
    this.fire = this.mega ? MEGA_FIRE : DRAGON_FIRE;
    this.z0 = u.z;
    this.phase = 'crouch';
    u.invuln = true;
    u.zOverride = u.z;
    this.anim(u.sprite.has('Launch') ? 'Launch' : 'RearUp', 1);
    this.game.hud.showBanner('DRAGON ASCENT!', this.mega
      ? { color: '#ffe680', sub: 'MEGA RAYQUAZA', y: 320, life: 1.5, size: 28 }
      : { color: '#7dffb0', y: 330, life: 1.3, size: 26 });
    sfx.ascend();
    this.at(0.18, () => this.liftOff());
    this.at(0.6, () => this.gather());
    this.at(this.mega ? 1.35 : 1.2, () => this.dive());
  }

  liftOff() {
    const u = this.user, g = this.game;
    this.phase = 'rise';
    this.riseT = 0;
    g.spawn(new Pillar(u.x, u.y, 0.5, this.mega ? [255, 240, 150] : [120, 255, 160], this.mega ? 420 : 260));
    g.spawn(new Ring(u.x, u.y, { r0: 6, r1: this.mega ? 90 : 60, life: 0.4, color: '#c8ffe0', width: 4 }));
    dustCloud(g, u.x, u.y, 18, 6);
    windBurst(g, u.x, u.y, 2, this.mega ? 32 : 20, ['#ffffff', '#c8ffe0']);
    g.marks.energy(u.x, u.y, 16, [110, 255, 140], 3);
    g.shake(this.mega ? 6 : 4, 0.3);
  }

  gather() {
    const u = this.user, g = this.game;
    this.phase = 'gather';
    this.arcT = 0;
    if (u.sprite.has('Roar')) this.anim('Roar', 1);
    g.spawn(new ScreenDim(this.mega ? 1.3 : 1.1, this.mega ? 0.55 : 0.38));
    this.marker = g.spawn(new GroundMarker(this.target.x, this.target.y, this.move.radius * (this.mega ? 1.3 : 1), this.mega ? '255,230,120' : '120,255,160'));
    g.spawn(new EnergyAura(u, this.mega ? 0.8 : 0.62, this.mega));
    sfx.roar();
  }

  tick(dt) {
    const u = this.user, g = this.game, H = this.H;
    if (this.phase === 'rise') {
      this.riseT += dt;
      const k = Math.min(1, this.riseT / 0.42);
      u.zOverride = this.z0 + (H - this.z0) * k * k;
      for (let i = 0; i < 3; i++) {
        g.particles.spawn({
          x: u.x + rand(-10, 10), y: u.y, z: Math.max(0, u.z - rand(0, 30)), vz: -rand(80, 160),
          life: 0.45, size: rand(2, 4), sizeEnd: 1, colors: this.fire,
        });
      }
    } else if (this.phase === 'gather') {
      u.zOverride = H + Math.sin(this.t * 22) * 2;
      const t = this.target;
      if (this.t < (this.mega ? 1.15 : 1.0) && t.alive && !t.hidden) this.marker.set(t.x, t.y);
      for (let i = 0; i < (this.mega ? 5 : 3); i++) {
        const a = rand(0, Math.PI * 2), r = rand(16, this.mega ? 40 : 30);
        g.particles.spawn({
          x: u.x + Math.cos(a) * r, y: u.y + Math.sin(a) * r * 0.6, z: u.bodyZ + rand(-14, 14),
          vx: -Math.sin(a) * 60, vy: Math.cos(a) * 36, vz: rand(20, 60), life: 0.35, size: rand(3, 5), sizeEnd: 1, colors: this.fire,
        });
      }
      if (this.mega) {
        // Lightning crackles between Mega Rayquaza and the sky, and energy rains down onto the target.
        this.arcT -= dt;
        if (this.arcT <= 0) {
          this.arcT = 0.09;
          const sy = u.y - u.z - u.species.bodyZ;
          g.spawn(new Lightning(u.x + rand(-6, 6), sy, u.x + rand(-40, 40), Math.max(0, sy - rand(60, 120)), 0.12, { width: 1.5, branches: 2, glow: 'rgba(255,240,150,0.55)' }));
        }
        const m = this.marker, a = rand(0, Math.PI * 2), r = rand(0, this.move.radius * 1.3);
        g.particles.spawn({
          x: m.x + Math.cos(a) * r, y: m.y + Math.sin(a) * r * 0.7, z: rand(60, 120), vz: -rand(160, 260),
          life: 0.4, size: 2, sizeEnd: 1, colors: ['#ffffff', '#fff6b0', '#9fffc8'],
        });
      }
    } else if (this.phase === 'dive') {
      this.diveT += dt;
      const k = Math.min(1, this.diveT / 0.18), e = k * k;
      u.x = this.from.x + (this.spot.x - this.from.x) * e;
      u.y = this.from.y + (this.spot.y - this.from.y) * e;
      u.zOverride = H * (1 - e);
      this.ghost = !this.ghost;
      if (this.ghost) g.spawn(new Afterimage(u, 0.3, this.mega ? '#fff6b0' : '#9fffc4'));
      for (let i = 0; i < (this.mega ? 7 : 4); i++) {
        g.particles.spawn({
          x: u.x + rand(-6, 6), y: u.y + rand(-4, 4), z: u.bodyZ + rand(-10, 10), vx: rand(-20, 20), vy: rand(-20, 20), vz: rand(30, 90),
          life: 0.5, size: rand(4, 7), sizeEnd: 1, colors: this.fire,
        });
      }
      if (k >= 1) this.impact();
    } else if (this.phase === 'burn' && this.t < this.burnEnd) {
      // Dragon fire keeps licking up from the crater for a moment.
      const R = this.mega ? 52 : 34;
      for (let i = 0; i < (this.mega ? 4 : 2); i++) {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * R;
        g.particles.spawn({
          x: this.spot.x + Math.cos(a) * r, y: this.spot.y + Math.sin(a) * r * 0.7, z: 0, vz: rand(30, 70),
          life: rand(0.35, 0.6), size: rand(3, 5), sizeEnd: 1, colors: this.fire,
        });
      }
    }
  }

  dive() {
    const u = this.user, g = this.game;
    this.phase = 'dive';
    this.diveT = 0;
    this.from = { x: u.x, y: u.y };
    this.spot = { x: this.marker.x, y: this.marker.y };
    this.marker.dead = true;
    this.aim = Math.atan2(this.spot.y - u.y, this.spot.x - u.x);
    // Seen from above, a dive from the sky reads as moving down the screen, so lean the facing downward.
    u.dir = dirFromVector(this.spot.x - u.x, this.spot.y - u.y + 80);
    this.anim('Attack', 1.2);
    u.phasing = true;
    g.spawn(new EnergyAura(u, 0.22, true));
    if (this.mega) {
      const sy = u.y - u.z - u.species.bodyZ;
      g.spawn(new RainbowStreak(u.x, sy, this.spot.x, this.spot.y - 8, 0.5));
    }
    sfx.dash();
  }

  impact() {
    const u = this.user, g = this.game, { x, y } = this.spot, mega = this.mega;
    const R = this.move.radius * (mega ? 1.35 : 1);
    this.phase = 'burn';
    this.burnEnd = this.t + (mega ? 1.4 : 0.9);
    u.zOverride = null;
    u.invuln = false;
    u.phasing = false;
    g.marks.fracture(x, y, mega ? 95 : 70, mega ? 8 : 7.5);
    if (mega) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + rand(-0.3, 0.3);
        g.marks.fracture(x + Math.cos(a) * 78, y + Math.sin(a) * 56, 22, 7);
      }
    }
    g.marks.energy(x, y, mega ? 40 : 30, mega ? [255, 230, 120] : [110, 255, 140], 5);
    g.spawn(new Pillar(x, y, mega ? 0.65 : 0.5, mega ? [255, 245, 170] : [150, 255, 180], mega ? 480 : 300));
    const rings = mega ? ['#ffffff', '#fff2a8', '#7dffb0', '#ffe680', '#c8ffe0'] : ['#eafff0', '#7dffb0', '#ffe680'];
    rings.forEach((color, i) => this.at(this.t + i * 0.07, () => {
      g.spawn(new Ring(x, y, { r0: 8, r1: (mega ? 170 : 130) * (1 - i * 0.15), life: 0.6 - i * 0.05, color, width: 6 - i }));
    }));
    g.spawn(new Glow(x, y, 10, mega ? 120 : 80, mega ? [255, 245, 170] : [150, 255, 180], mega ? 0.6 : 0.45));
    windBurst(g, x, y, 6, mega ? 64 : 40, ['#ffffff', '#c8ffe0']);
    debris(g, x, y, mega ? 60 : 36, mega ? 230 : 180);
    dustCloud(g, x, y, mega ? 34 : 22, mega ? 9 : 7);
    g.shake(mega ? 15 : 12, mega ? 1 : 0.8);
    g.hitstop(mega ? 0.16 : 0.12);
    g.flash(mega ? 0.16 : 0.1);
    g.punch(x, y, mega ? 0.18 : 0.08, mega ? 0.6 : 0.4);
    sfx.quake();
    sfx.explosion();
    const t = this.target, d = Math.hypot(t.x - x, t.y - y);
    if (t.alive && d <= R + t.radius) {
      this.hit({ dirX: (t.x - x) / (d || 1), dirY: (t.y - y) / (d || 1), power: this.move.power * (d < R * 0.5 ? 1 : 0.7), knockback: mega ? 380 : 320, stagger: 0.6 });
    }
    this.at(this.t + (mega ? 1.4 : 1.0), () => this.finish(0.35));
  }

  cleanup() {
    const u = this.user;
    u.zOverride = null;
    u.invuln = false;
    u.phasing = false;
    if (this.marker) this.marker.dead = true;
  }
}

class Waterfall extends MoveAction {
  start() {
    this.anim('RearUp', 0.8);
    this.rearing = true;
    sfx.waterRise();
    this.at(0.45, () => {
      this.rearing = false;
      this.retarget();
      const s = 0.9, a = this.anim('Attack', s);
      const rush = this.timeTo(a, a.rushFrame ?? 1, s), hit = this.timeTo(a, a.hitFrame ?? 3, s);
      this.at(this.t + rush, () => {
        this.startLunge(85, hit - rush, 2);
        this.surging = true;
        sfx.whoosh();
      });
      this.at(this.t + hit, () => this.crash());
      this.at(this.t + Math.max(this.timeTo(a, a.frames, s), hit + 0.15), () => this.finish(0.4));
    });
  }

  tick(dt) {
    const u = this.user, g = this.game;
    if (this.rearing) {
      this.retarget(3 * dt);
      if (Math.random() < 0.8) {
        const a = rand(0, Math.PI * 2);
        g.particles.spawn({
          x: u.x + Math.cos(a) * rand(10, 22), y: u.y + Math.sin(a) * rand(5, 10), z: 0, vz: rand(60, 120), gz: 120,
          life: 0.5, size: rand(2, 3), colors: ['#ffffff', '#9fd6ff', '#4a94ec'],
        });
      }
    }
    if (this.surging) {
      this.lungeStep(dt);
      for (let i = 0; i < 2; i++) {
        g.particles.spawn({
          x: u.x + rand(-8, 8), y: u.y + rand(-4, 4), z: rand(4, 30), vx: rand(-20, 20), vy: rand(-20, 20), vz: rand(20, 60),
          gz: 300, life: 0.4, size: rand(2, 4), colors: ['#ffffff', '#bfe6ff', '#5aa6f0'],
        });
      }
    }
  }

  crash() {
    this.surging = false;
    const u = this.user, p = this.front(u.radius + 8);
    waterSplash(this.game, p.x, p.y);
    this.game.marks.wet(p.x, p.y, 16);
    this.game.marks.fracture(p.x, p.y, 16, 5);
    sfx.splash();
    this.game.shake(4, 0.25);
    if (this.inReach(this.move.reach)) this.hit({ knockback: 240, stagger: 0.38, flinchChance: 0.2, hitstop: 0.07 });
  }
}

class IceFang extends MoveAction {
  start() {
    this.windup = true;
    sfx.ice();
    this.at(0.28, () => {
      this.windup = false;
      this.retarget();
      const s = 0.9, a = this.anim('Attack', s);
      const rush = this.timeTo(a, a.rushFrame ?? 1, s), hit = this.timeTo(a, a.hitFrame ?? 3, s);
      this.at(this.t + rush, () => this.startLunge(36, hit - rush, 2));
      this.at(this.t + hit, () => this.bite());
      this.at(this.t + Math.max(this.timeTo(a, a.frames, s), hit + 0.15), () => this.finish(0.35));
    });
  }

  tick(dt) {
    if (this.windup) {
      this.retarget(3 * dt);
      const m = this.mouth();
      if (Math.random() < 0.7) {
        this.game.particles.spawn({
          x: m.x + rand(-8, 8), y: m.y + rand(-4, 4), z: m.z + rand(-6, 6), vz: rand(-10, 10),
          life: 0.3, size: 2, colors: ['#ffffff', '#bdf3ff'],
        });
      }
    }
    this.lungeStep(dt);
  }

  bite() {
    const u = this.user, t = this.target;
    const reach = this.inReach(this.move.reach);
    const p = reach ? { x: t.x, y: t.y } : this.front(u.radius + 14);
    const z = reach ? t.bodyZ : u.bodyZ;
    this.game.spawn(new FangBite(p.x, p.y, z));
    iceShatter(this.game, p.x, p.y, z);
    this.game.marks.frost(p.x, p.y + 2, 9);
    sfx.bite();
    sfx.ice();
    if (reach) this.hit({ knockback: 90, stagger: 0.3, freezeChance: 0.18, hitstop: 0.05 });
  }
}

// ai: how the opponent AI judges a move — 'melee' (needs contact), 'dash' (closes a gap),
// 'ranged' (between minRange and range) or 'area' (around the user, within range).
export const MOVES = {
  flamethrower: {
    name: 'Flamethrower', type: 'fire', power: 22, cooldown: 3.2, range: 150, minRange: 40, ai: 'ranged', tag: 'Stream · burns the ground', Action: Stream,
    stream: {
      colors: flameColors, rate: 120, speed: [250, 300], life: [0.5, 0.62], sizeEnd: [10, 14], spread: 0.12, track: 1.5,
      duration: 1.0, tick: 0.12, width: 12, reach: 140, knockback: 35, stagger: 0.1, mark: 'scorch', burnChance: 0.1,
      sound: d => sfx.flamethrower(d),
    },
  },
  hydroPump: {
    name: 'Hydro Pump', type: 'water', power: 24, cooldown: 4.2, range: 170, minRange: 50, ai: 'ranged', tag: 'Pressure jet · pushes back', Action: Stream,
    stream: {
      colors: () => WATER_JET, charge: 0.3, rate: 170, speed: [330, 380], life: [0.4, 0.48], sizeEnd: [6, 9], spread: 0.05, track: 1,
      duration: 0.7, tick: 0.1, width: 11, reach: 160, knockback: 110, stagger: 0.15, mark: 'wet', core: ['#3a8ae8', '#a6dcff', '#ffffff'],
      sound: d => sfx.hydro(d),
    },
  },
  dragonClaw: {
    name: 'Dragon Claw', type: 'dragon', power: 62, cooldown: 1.3, reach: 26, ai: 'melee', tag: 'Melee · lunge, 2 hits', Action: Melee,
    melee: { anim: 'Strike', fx: 'claw', lunge: 46, hits: [{ knockback: 50 }, { delay: 0.15, knockback: 170, hitstop: 0.05 }] },
  },
  leafBlade: {
    name: 'Leaf Blade', type: 'grass', power: 95, cooldown: 1.5, reach: 24, ai: 'melee', tag: 'Melee · high crit', Action: Melee,
    melee: { anim: 'Swing', fx: 'blade', lunge: 44, critChance: 0.25, hits: [{ knockback: 150, hitstop: 0.05 }] },
  },
  ironTail: {
    name: 'Iron Tail', type: 'steel', power: 120, cooldown: 2.4, reach: 22, ai: 'melee', tag: 'Melee · heavy knockback', Action: Melee,
    melee: { anim: 'Rotate', speed: 1, fx: 'tail', lunge: 30, hits: [{ knockback: 230, stagger: 0.4, hitstop: 0.07 }] },
  },
  airSlash: {
    name: 'Air Slash', type: 'flying', power: 80, cooldown: 1.6, range: 270, minRange: 40, ai: 'ranged', tag: 'Projectile · may flinch', Action: Shot,
    shot: { anim: 'Swing', speed: 0.8, sound: 'airSlash' },
  },
  dragonPulse: {
    name: 'Dragon Pulse', type: 'dragon', power: 95, cooldown: 2.4, range: 300, minRange: 50, ai: 'ranged', tag: 'Pulse beam', Action: BeamAttack,
    beam: {
      charge: 0.35, lock: 0.25, width: 11, visualWidth: 14, duration: 0.5, shake: 3, sound: 'pulse', rings: '#9fe0ff',
      colors: ['#5a3fd0', '#9d7cff', '#eef6ff'], chargeColors: ['#ffffff', '#c8b8ff', '#7a5cff'], teleColor: '150,110,255', flash: [170, 130, 255],
      mark: 'dragon', markStep: 18, markSize: [5, 8], knockback: 150, stagger: 0.35, hitstop: 0.05,
    },
  },
  energyBall: {
    name: 'Energy Ball', type: 'grass', power: 85, cooldown: 2.2, range: 260, minRange: 50, ai: 'ranged', tag: 'Energy orb', Action: Shot,
    shot: { style: 'grass', sound: 'pulse' },
  },
  iceShard: {
    name: 'Ice Shard', type: 'ice', power: 30, cooldown: 1.4, range: 240, minRange: 30, ai: 'ranged', tag: 'Fast · 3 shards', Action: Shot,
    shot: { anim: 'Attack', speed: 1.2, style: 'ice', spread: [-0.14, 0, 0.14], stagger: 0.05, sound: 'shard' },
  },
  quickAttack: {
    name: 'Quick Attack', type: 'normal', power: 60, cooldown: 1.5, range: 130, minRange: 30, ai: 'dash', tag: 'Dash strike', Action: Dash,
    dash: { windup: 0.08, dist: 130, dur: 0.16, color: '#ffffff', ghost: '#ffffff', knockback: 160 },
  },
  extremeSpeed: {
    name: 'Extreme Speed', type: 'normal', power: 55, cooldown: 3.2, range: 160, minRange: 30, ai: 'dash', tag: 'Double dash · 2 hits', Action: Dash,
    dash: { windup: 0.12, dist: 170, dur: 0.1, through: true, passes: 2, gap: 0.1, color: '#d8fff0', ghost: '#9fffd6', width: 4, knockback: 140 },
  },
  aerialAce: {
    name: 'Aerial Ace', type: 'flying', power: 75, cooldown: 2, range: 170, minRange: 20, ai: 'dash', tag: 'Homing slash · never misses', Action: Dash,
    dash: { windup: 0.15, dist: 180, dur: 0.18, sure: true, slash: true, color: '#e8f6ff', ghost: '#cfeaff', knockback: 120 },
  },
  earthquake: {
    name: 'Earthquake', type: 'ground', power: 150, cooldown: 6, range: 85, radius: 90, ai: 'area', tag: 'Area · fractures ground', Action: Earthquake,
  },
  thunderbolt: {
    name: 'Thunderbolt', type: 'electric', power: 95, cooldown: 1.8, range: 210, minRange: 40, ai: 'ranged', tag: 'Instant bolt', Action: Thunderbolt,
  },
  thunder: {
    name: 'Thunder', type: 'electric', power: 200, cooldown: 7, range: 280, minRange: 60, radius: 30, ai: 'ranged', tag: 'Sky strike · dodgeable', Action: Thunder,
  },
  dragonAscent: {
    name: 'Dragon Ascent', type: 'flying', power: 250, cooldown: 11, range: 300, minRange: 60, radius: 50, ai: 'ranged', tag: 'Soar & dive · shockwave', Action: DragonAscent,
  },
  waterfall: {
    name: 'Waterfall', type: 'water', power: 100, cooldown: 2.8, reach: 24, ai: 'melee', tag: 'Surging lunge', Action: Waterfall,
  },
  iceFang: {
    name: 'Ice Fang', type: 'ice', power: 76, cooldown: 2.4, reach: 20, ai: 'melee', tag: 'Bite · may freeze', Action: IceFang,
  },
  hyperBeam: {
    name: 'Hyper Beam', type: 'normal', power: 210, cooldown: 10, range: 330, minRange: 90, ai: 'ranged', aiWeight: 0.6, tag: 'Huge beam · must recharge', Action: BeamAttack,
    beam: {
      charge: 0.95, lock: 0.6, width: 16, visualWidth: 22, duration: 0.5, big: true, recharge: 1.3, shake: 7, sound: 'beamFire',
      colors: ['#ff7b2e', '#ffd36b', '#fffbe8'], chargeColors: ['#ffffff', '#ffe08a', '#ff9a3c'], teleColor: '255,96,48', flash: [255, 200, 120],
      mark: 'scorch', markStep: 14, markSize: [4, 6], knockback: 300, stagger: 0.5, hitstop: 0.1,
    },
  },
  iceBeam: {
    name: 'Ice Beam', type: 'ice', power: 120, cooldown: 4, range: 260, minRange: 50, ai: 'ranged', tag: 'Beam · frost trail, may freeze', Action: BeamAttack,
    beam: {
      charge: 0.4, lock: 0.3, width: 9, visualWidth: 8, duration: 0.45, shake: 3, sound: 'ice',
      colors: ['#5cc3e6', '#bdf3ff', '#ffffff'], chargeColors: ICE, teleColor: '120,220,255', flash: [170, 235, 255],
      mark: 'frost', markStep: 16, markSize: [6, 9], knockback: 80, stagger: 0.35, freezeChance: 0.2, hitstop: 0.05,
    },
  },
  blizzard: {
    name: 'Blizzard', type: 'ice', power: 30, cooldown: 7, range: 230, radius: 64, ai: 'ranged', tag: 'Ice storm over the target', Action: Blizzard,
  },
};
for (const [id, m] of Object.entries(MOVES)) m.id = id;
