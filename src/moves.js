import { animDuration } from './assets.js';
import { dirFromVector } from './sprite.js';
import { LegendaryBeam, AeroblastBeam } from './raid-art.js';
import { skyLegend, CastEnergy, Slipstream, PressureWave, ElementColumn } from './legendary-effects.js';
import { SHADOW_LUGIA, isShadowLugia } from './data/skins.js';
import { applyHit } from './combat.js';
import { BOUNDS } from './arena.js';
import { TYPE_COLORS } from './data/types.js';
import {
  UltimateImpact, FIRE, flameColors, rand, Glow, ClawSlash, Spike, Falling, sparkBurst, FangBite, Beam, Telegraph, FloatText, Ring, Lightning, BeamLine, SlashArc,
  Afterimage, GroundMarker, StormCloud, StormSwirl, Pillar, EnergyAura, ScreenDim, RainbowStreak, waterSplash, iceShatter, dustCloud, electricBurst, leafBurst,
  debris, windBurst, metalSparks, Missile, TidalWave, Moon, Tether, FloatingRock, PsyDome,
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
    this.cancelled = true;
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
    const raisedBeak=skyLegend(this.user)&&(this.user.boss??this.user.species.id)==='lugia';
    return { ...this.front(m.fwd), z: (raisedBeak?this.user.species.headZ+4*(this.user.drawScale??1):m.z) + (skyLegend(this.user)?this.user.lift:this.user.z) };
  }

  // Contact moves from the ground can't reach a foe juggled high above; flyers and aerial moves can.
  canReachAir() {
    return (this.target.air?.h ?? 0) < 60 || !!this.user.species.fly || !!this.move.aerial;
  }

  inReach(extra) {
    const u = this.user, t = this.target;
    if (!t.alive || t.hidden || !this.canReachAir()) return false;
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
    if(skyLegend(this.user)) this.game.spawn(new CastEnergy(this.user,fire-this.t,true));
    this.at(fire, () => {
      this.firing = true;
      this.sound = c.sound(c.duration + 0.05);
      if (c.core) {
        const m = this.mouth(), p = this.front(c.reach);
        this.core = this.game.spawn(new Beam(m.x, m.y - m.z, p.x, p.y - 8, c.duration, { width: 7, colors: c.core }));
      }
      if(skyLegend(this.user)) {
        const u=this.user,p=this.front(c.reach);
        this.jet=this.game.spawn(new LegendaryBeam(u,p.x,p.y-8,'#85d6f6',c.width*1.4,c.duration,true));
        this.game.spawn(new PressureWave(p.x,p.y,40,'water'));
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
    if(this.jet){const p=this.front(c.reach);this.jet.x=p.x;this.jet.y=p.y-8;}
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
    if(this.jet)this.jet.dead=true;
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
const frontOf = (u, ang, d) => ({ x: u.x + Math.cos(ang) * d, y: u.y + Math.sin(ang) * d });
Object.assign(SWING_FX, {
  bite(g, u, ang) {
    const p = frontOf(u, ang, u.radius + 12);
    g.spawn(new FangBite(p.x, p.y, u.bodyZ));
    sfx.bite();
  },
  punch(g, u, ang) {
    const p = frontOf(u, ang, u.radius + 10);
    g.spawn(new Ring(p.x, p.y, { z: u.bodyZ, r0: 2, r1: 13, life: 0.15, color: '#ffe0b0', width: 2, layer: 'air' }));
    windBurst(g, p.x, p.y, u.bodyZ, 6, ['#ffffff', '#ffd8a0']);
    sfx.whoosh();
  },
  dark(g, u, ang, i) {
    g.spawn(new SlashArc(u.x, u.y, u.bodyZ, ang, { radius: u.radius + 13, spread: 2.4, colors: ['#3a2050', '#c8a0ff'], width: 6, mirror: i % 2 === 1 }));
    sfx.slash();
  },
  fireKick(g, u, ang) {
    g.spawn(new SlashArc(u.x, u.y, u.bodyZ - 4, ang, { radius: u.radius + 12, spread: 2.6, colors: ['#ff7a2a', '#fff0a0'], width: 6 }));
    const p = frontOf(u, ang, u.radius + 12);
    for (let i = 0; i < 10; i++) {
      g.particles.spawn({ x: p.x, y: p.y, z: u.bodyZ, vx: rand(-50, 50), vy: rand(-40, 40), vz: rand(20, 70), life: 0.4, size: rand(3, 5), sizeEnd: 1, colors: FIRE });
    }
    sfx.whoosh();
  },
  psy(g, u, ang) {
    g.spawn(new SlashArc(u.x, u.y, u.bodyZ, ang, { radius: u.radius + 12, spread: 2.2, colors: ['#f060a0', '#ffe0f0'], width: 5 }));
    sfx.pulse();
  },
});

// Type-flavoured impact used by the generic melee and dash styles.
export function typeBurst(g, t, type) {
  const z = t.bodyZ, [c1] = TYPE_COLORS[type] ?? ['#ffffff'];
  const rgb = [1, 3, 5].map(i => parseInt(c1.slice(i, i + 2), 16));
  if (type === 'electric') electricBurst(g, t.x, t.y, z, 14);
  else if (type === 'ice') iceShatter(g, t.x, t.y, z);
  else if (type === 'water') waterSplash(g, t.x, t.y);
  else if (type === 'grass' || type === 'bug') leafBurst(g, t.x, t.y, z, 8);
  else if (type === 'steel') metalSparks(g, t.x, t.y, z);
  else if (type === 'rock' || type === 'ground') debris(g, t.x, t.y, 8, 90);
  else if (type === 'fire') {
    for (let i = 0; i < 12; i++) {
      g.particles.spawn({ x: t.x, y: t.y, z, vx: rand(-60, 60), vy: rand(-45, 45), vz: rand(20, 80), life: 0.4, size: rand(3, 5), sizeEnd: 1, colors: FIRE });
    }
  }
  g.spawn(new Glow(t.x, t.y, z, 24, rgb, 0.25));
  g.spawn(new Ring(t.x, t.y, { z, r0: 4, r1: 22, life: 0.25, color: c1, width: 2.5, layer: 'air' }));
}

Object.assign(SWING_FX, {
  arc(g, u, ang, i, move) {
    const m = move.melee;
    g.spawn(new SlashArc(u.x, u.y, u.bodyZ, ang, { radius: u.radius + 13, spread: m.spread ?? 2.4, colors: m.colors, width: m.width ?? 6, mirror: i % 2 === 1 }));
    sfx.slash();
  },
  punchT(g, u, ang, i, move) {
    const p = frontOf(u, ang, u.radius + 10), [c0, c1] = move.melee.colors;
    g.spawn(new Ring(p.x, p.y, { z: u.bodyZ, r0: 2, r1: 15, life: 0.16, color: c0, width: 3, layer: 'air' }));
    windBurst(g, p.x, p.y, u.bodyZ, 8, [c1, c0]);
    sfx.whoosh();
  },
});

const CONNECT_FX = {
  arc: (g, t, move) => typeBurst(g, t, move.type),
  punchT(g, t, move) {
    sparkBurst(g, t.x, t.y, t.bodyZ, true);
    typeBurst(g, t, move.type);
  },
  punch: (g, t) => sparkBurst(g, t.x, t.y, t.bodyZ, true),
  fireKick: (g, t) => g.marks.scorch(t.x, t.y + 2, 9),
  psy: (g, t) => g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 4, r1: 20, life: 0.25, color: '#ffb0d8', width: 2, layer: 'air' })),
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
    if(skyLegend(this.user)) this.game.spawn(new CastEnergy(this.user,Math.max(.1,hit)));
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
    SWING_FX[c.fx](this.game, this.user, this.aim, i, this.move);
    if(skyLegend(this.user)) {
      const p=this.front(this.user.radius+18);
      for(let j=0;j<3;j++) this.game.spawn(new SlashArc(p.x,p.y,this.user.bodyZ,this.aim+(i%2?-.6:.6),{radius:25+j*5,spread:1.6,colors:['#50ae8b','#d6ffdf','#ffffff'],width:5-j,life:.24,mirror:i%2===1}));
    }
    if (!this.inReach(this.move.reach)) return;
    const landed = this.hit({ knockback: h.knockback, stagger: h.stagger ?? 0.28, hitstop: h.hitstop ?? 0.04, critChance: c.critChance });
    if (landed) CONNECT_FX[c.fx]?.(this.game, this.target, this.move);
    if(landed&&skyLegend(this.user))this.game.spawn(new PressureWave(this.target.x,this.target.y,38,'air',this.target.bodyZ));
  }
}

const DASH_BURST = {
  electric(g, t) {
    electricBurst(g, t.x, t.y, t.bodyZ, 18);
    g.marks.burn(t.x, t.y + 2, 9);
    sfx.thunderbolt();
  },
  fire(g, t) {
    for (let i = 0; i < 16; i++) {
      g.particles.spawn({ x: t.x, y: t.y, z: t.bodyZ, vx: rand(-70, 70), vy: rand(-50, 50), vz: rand(20, 90), life: 0.45, size: rand(3, 6), sizeEnd: 1, colors: FIRE });
    }
    g.marks.scorch(t.x, t.y + 2, 10);
  },
  steel(g, t) {
    metalSparks(g, t.x, t.y, t.bodyZ);
    sfx.clang();
  },
  dragon: (g, t) => g.spawn(new Glow(t.x, t.y, t.bodyZ, 26, [150, 100, 255], 0.25)),
};

// Fast dashes (Quick Attack, Extreme Speed, Aerial Ace) with afterimages; can pass through the
// target, repeat, or home in for a guaranteed hit.
class Dash extends MoveAction {
  start() {
    const c = this.move.dash;
    this.passes = 0;
    this.ghostT = 0;
    this.sure = !!c.sure && this.user.distTo(this.target) <= this.move.range;
    this.user.sprite.play('Charge', { loop: true, force: true });
    if(skyLegend(this.user))this.game.spawn(new CastEnergy(this.user,c.windup));
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
    if(skyLegend(u))this.game.spawn(new Slipstream(u,c.dur+.2,'#bcffe5',u.radius*1.6));
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
      if(!skyLegend(u))this.game.spawn(new Afterimage(u, 0.22, c.ghost));
    }
    if (!this.struck && this.canReachAir() && (u.distTo(t) <= u.radius + t.radius + 8 || (this.sure && k >= 1))) {
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
    if (c.burst) (DASH_BURST[c.burst] ?? ((gg, tt) => typeBurst(gg, tt, this.move.type)))(g, t);
    g.spawn(new Ring(t.x, t.y, { z, r0: 4, r1: 22, life: 0.25, color: c.color, width: 3, layer: 'air' }));
    if(skyLegend(this.user))g.spawn(new PressureWave(t.x,t.y,45,'air',z));
    this.hit({ dirX: Math.cos(this.aim), dirY: Math.sin(this.aim), knockback: c.knockback, stagger: 0.28, hitstop: 0.04 });
  }

  cleanup() {
    this.user.phasing = false;
  }
}

// Fires one or more projectiles on the animation's hit frame (Air Slash, Shadow Ball, barrages…),
// optionally after a charge-up and/or with a temporary stat boost.
class Shot extends MoveAction {
  start() {
    const c = this.move.shot;
    if (c.buff) this.empower(c.buff);
    if (c.charge) {
      this.charging = true;
      this.user.sprite.play('Charge', { loop: true, force: true });
      this.game.spawn(new Glow(this.user.x, this.user.y, this.user.bodyZ, 32, c.glow ?? [255, 255, 255], c.charge, true));
      this.at(c.charge, () => this.volley());
    } else this.volley();
  }

  volley() {
    this.charging = false;
    const c = this.move.shot, s = c.speed ?? 0.85, a = this.anim(c.anim ?? 'Shoot', s);
    const hit = this.t + this.timeTo(a, a.hitFrame ?? 2, s);
    if(skyLegend(this.user))this.game.spawn(new CastEnergy(this.user,Math.max(.1,hit-this.t),true));
    const spread = c.spread ?? [0];
    spread.forEach((off, i) => this.at(hit + i * (c.stagger ?? 0), () => this.fire(off, i)));
    const last = hit + (spread.length - 1) * (c.stagger ?? 0);
    this.at(Math.max(this.t + this.timeTo(a, a.frames, s), last + 0.1), () => this.finish(c.recovery ?? 0.12));
  }

  tick(dt) {
    if (!this.charging) return;
    this.retarget(3 * dt);
    this.converge(70, dt, this.move.shot.chargeColors ?? ['#ffffff'], 24);
  }

  empower(t) {
    const u = this.user;
    u.buffT = t;
    this.game.spawn(new FloatText(u.x, u.y - u.headZ - 8, 'STATS ROSE!', '#ffe680'));
    this.game.ui.log(`${u.species.name}'s stats rose sharply!`, u.side);
  }

  fire(off, i) {
    this.retarget();
    const c = this.move.shot, m = this.mouth(), ang = this.aim + off;
    const style = c.styles ? c.styles[i % c.styles.length] : c.style;
    const projectile=this.game.spawn(style
      ? new Orb(this.game, this.user, this.move, m.x, m.y, m.z, ang, style, i)
      : new AirBlade(this.game, this.user, this.move, m.x, m.y, m.z, ang));
    if(skyLegend(this.user))this.game.spawn(new Slipstream(projectile,this.move.range/(projectile.speed||300)+.15,style?'#dab8ff':'#b8f0ff',style?14:20));
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
    if(skyLegend(u))this.game.spawn(new CastEnergy(u,c.charge,true));
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
    if(skyLegend(u))g.spawn(new LegendaryBeam(u,end.x,end.y-10,u.species.id.startsWith('rayquaza')?'#75f5b1':'#a5dcff',c.visualWidth*1.5,c.duration,true));
    else g.spawn(new Beam(m.x, m.y - m.z, end.x, end.y - 10, c.duration, { width: c.visualWidth, colors: c.colors }));
    sfx[c.sound]();
    if (c.rings && !skyLegend(u)) {
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

// Area burst around the user: expanding rings that catch the foe if it is inside the radius.
class Shockwave extends MoveAction {
  start() {
    this.user.sprite.play('Charge', { loop: true, force: true });
    this.at(this.move.shockwave.windup ?? 0.22, () => this.burst());
  }

  tick(dt) {
    if (!this.burst_) this.converge(60, dt, this.move.shockwave.colors, 24);
  }

  burst() {
    const c = this.move.shockwave, u = this.user, g = this.game, t = this.target, R = c.radius;
    this.burst_ = true;
    this.anim(c.anim ?? 'Shoot', 1);
    c.colors.forEach((col, i) => g.spawn(new Ring(u.x, u.y, { r0: 6, r1: R * (1 - i * 0.22), life: 0.32 + 0.08 * (2 - i), color: col, width: 5 - i })));
    g.spawn(new Glow(u.x, u.y, u.bodyZ, R * 0.55, c.rgb, 0.35));
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(R * 1.4, R * 2.3);
      g.particles.spawn({ x: u.x, y: u.y, z: u.bodyZ * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, drag: 3, life: 0.4, size: rand(2, 4), sizeEnd: 1, colors: c.colors });
    }
    c.mark?.(g, u.x, u.y, R);
    g.shake(c.shake ?? 4, 0.25);
    sfx[c.sound ?? 'pulse']();
    const d = u.distTo(t);
    if (t.alive && !t.hidden && d <= R + t.radius) {
      this.at(this.t + Math.min(0.2, (d / R) * 0.2), () => this.hit({
        dirX: (t.x - u.x) / (d || 1), dirY: (t.y - u.y) / (d || 1), knockback: c.knockback ?? 160, stagger: 0.3, hitstop: 0.04,
      }));
    }
    this.at(this.t + 0.42, () => this.finish(0.15));
  }
}

// Status moves: self buffs, healing, regeneration and protective stances.
class Utility extends MoveAction {
  start() {
    const c = this.move.util;
    this.anim(c.anim ?? 'Charge', 1);
    this.at(c.at ?? 0.22, () => UTIL_FX[c.kind](this, this.game, this.user, c));
    this.at(c.end ?? 0.5, () => this.finish(0.08));
  }
}

const UTIL_FX = {
  buff(a, g, u, c) {
    g.buff(u, c.stat, c.mult, c.dur);
    // Swords Dance: blades circle the user.
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      g.spawn(new SlashArc(u.x, u.y, u.bodyZ, ang, { radius: u.radius + 10, spread: 1.2, colors: ['#dfe7f2', '#ffffff'], width: 3, life: 0.4 }));
    }
    g.spawn(new Ring(u.x, u.y, { r0: 6, r1: 40, life: 0.4, color: '#ffe680', width: 3 }));
    sfx.shard();
  },
  heal(a, g, u, c) {
    g.heal(u, u.maxHp * c.pct);
    g.spawn(new Glow(u.x, u.y, u.bodyZ, 34, [140, 255, 170], 0.45));
    g.spawn(new Ring(u.x, u.y, { r0: 34, r1: 6, life: 0.4, color: '#9fffc8', width: 3 }));
    if (c.land) u.landT = 1.2; // Roost: touches down to rest
    sfx.pulse();
  },
  regen(a, g, u, c) {
    u.regen = { t: c.dur, rate: c.rate, acc: 0 };
    g.spawn(new Ring(u.x, u.y, { r0: 8, r1: 30, life: 0.5, color: '#9fd8ff', width: 3 }));
    waterSplash(g, u.x, u.y);
  },
  guard(a, g, u, c) {
    if (c.shieldForm && u.ab.blade) g.toggleForm(u, false);
    u.guard = { t: c.dur, mult: c.mult, punish: !!c.punish, color: c.color, label: c.label };
    g.spawn(new Ring(u.x, u.y, { z: u.bodyZ, r0: 4, r1: u.radius + 16, life: 0.3, color: c.color, width: 3, layer: 'air' }));
    sfx.clang();
  },
};

// Rapid Spin: spins in place while drifting forward, spraying water all around; hits anything close.
class Spin extends MoveAction {
  start() {
    const c = this.move.spin;
    this.allowMove = true;
    this.hits = 0;
    this.tickT = 0.05;
    this.turnT = 0;
    this.user.sprite.play('Rotate', { loop: true, force: true, speed: 1.6 });
    sfx.whoosh();
    sfx.hydro(c.dur);
    this.at(c.dur, () => this.finish(0.15));
  }

  tick(dt) {
    const c = this.move.spin, u = this.user, g = this.game, t = this.target;
    this.spinning = true;
    this.retarget(1.5 * dt);
    u.x = clampX(u.x + Math.cos(this.aim) * c.drive * dt);
    u.y = clampY(u.y + Math.sin(this.aim) * c.drive * dt);
    // Cycling the facing direction makes the sprite visibly spin.
    if ((this.turnT -= dt) <= 0) {
      this.turnT = 0.045;
      u.dir = (u.dir + 1) % 8;
    }
    for (let i = 0; i < 5; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(150, 230);
      g.particles.spawn({ x: u.x + Math.cos(a) * 8, y: u.y + Math.sin(a) * 6, z: u.bodyZ * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rand(20, 70), gz: 260, life: 0.32, size: rand(2, 3.5), sizeEnd: 1, colors: WATER_JET });
    }
    if (Math.random() < dt * 8) g.marks.wet(u.x + rand(-c.radius, c.radius) * 0.7, u.y + rand(-c.radius, c.radius) * 0.5, rand(6, 10));
    if ((this.tickT -= dt) > 0) return;
    this.tickT = c.tick;
    g.spawn(new Ring(u.x, u.y, { r0: 6, r1: c.radius, life: 0.22, color: '#bfe6ff', width: 2 }));
    const d = u.distTo(t);
    if (this.hits < c.maxHits && t.alive && !t.hidden && d <= c.radius + t.radius) {
      this.hits++;
      this.hit({ dirX: (t.x - u.x) / (d || 1), dirY: (t.y - u.y) / (d || 1), knockback: c.knockback, stagger: 0.22, hitstop: 0.03 });
      waterSplash(g, t.x, t.y);
    }
  }

  cleanup() {
    this.spinning = false;
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

const DRAGON_FIRE = ['#ffffff', '#c8ffe0', '#5fe08a', '#1f8a4a'];
const MEGA_FIRE = ['#ffffff', '#fff6b0', '#9fffc8', '#3fd07a', '#1f8a4a'];

// Rayquaza's signature move: it blasts off on a pillar of green energy, roars in the sky wrapped in
// dragon fire above the marked target (out of reach meanwhile), then dives onto it like a comet.
// As Mega Rayquaza everything scales up: higher, brighter, wider, with a bigger crater.
class DragonAscent extends MoveAction {
  start() {
    const u = this.user;
    this.mega = u.isMega;
    this.H = u.boss ? Math.max(this.mega ? 200 : 160, u.y + 120) : this.mega ? 200 : 160;
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
    g.spawn(new ElementColumn(u.x,u.y,this.mega?420:260,this.mega?44:32));
    g.spawn(new Slipstream(u,.65,'#bdffdf',u.radius*1.5));
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
      if (t.alive && !t.hidden) this.marker.set(t.x, t.y);
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
    g.spawn(new Slipstream(u,.45,this.mega?'#fff3bb':'#baffdd',u.radius*1.7));
    if (this.mega) {
      const sy = u.y - u.z - u.species.bodyZ;
      g.spawn(new RainbowStreak(u.x, sy, this.spot.x, this.spot.y - 8, 0.5));
    }
    sfx.dash();
  }

  impact() {
    const u = this.user, g = this.game, { x, y } = this.spot, mega = this.mega;
    const R = this.move.radius * (mega ? 1.35 : 1);
    g.spawn(new UltimateImpact(x,y,12,mega?100:80));
    g.spawn(new PressureWave(x,y,mega?170:130,'rock'));
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
    if (t.alive) {
      this.hit({ dirX: (t.x - x) / (d || 1), dirY: (t.y - y) / (d || 1), knockback: mega ? 380 : 320, stagger: 0.6, unblockable: true });
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

// Meteors or rocks rain onto the target's area; each landing is its own small blast (Draco Meteor, Rock Slide).
class MeteorRain extends MoveAction {
  start() {
    const c = this.move.rain, t = this.target, u = this.user;
    this.spot = { x: t.x, y: t.y };
    this.anim(c.anim ?? 'Shoot', 0.9);
    if (c.flare) {
      const sy = u.y - u.bodyZ;
      this.game.spawn(new BeamLine(u.x, sy, u.x, sy - 200, 0.5, c.flare, 5));
      this.game.spawn(new Glow(u.x, u.y, u.bodyZ, 30, c.glow, 0.4));
      sfx.ascend();
    }
    for (let i = 0; i < c.count; i++) this.at(c.delay + i * c.gap, () => this.drop(i));
    this.at(c.delay + c.count * c.gap + c.fall + 0.2, () => this.finish(c.recovery ?? 0.3));
  }

  drop(i) {
    const c = this.move.rain, t = this.target;
    // The first one aims at the target; the rest scatter around the original area.
    const base = i === 0 && t.alive && !t.hidden ? t : this.spot;
    const a = rand(0, Math.PI * 2), r = i === 0 ? 0 : rand(0, c.spread);
    const x = clampX(base.x + Math.cos(a) * r), y = clampY(base.y + Math.sin(a) * r * 0.7);
    const marker = this.game.spawn(new GroundMarker(x, y, c.radius, c.markRgb));
    this.game.spawn(new Falling(x, y, c.fall, c.style, () => {
      marker.dead = true;
      this.impact(x, y);
    }));
  }

  impact(x, y) {
    const c = this.move.rain, g = this.game;
    for (let i = 0; i < 22; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(40, 140);
      g.particles.spawn({ x, y, z: 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rand(30, 110), drag: 2, life: rand(0.35, 0.6), size: rand(3, 6), sizeEnd: 1, colors: c.colors });
    }
    g.spawn(new Ring(x, y, { r0: 4, r1: c.radius * 1.4, life: 0.35, color: c.colors[0], width: 3 }));
    if (c.glow) g.spawn(new Glow(x, y, 8, c.radius * 1.5, c.glow, 0.3));
    debris(g, x, y, 10, 120);
    g.marks.fracture(x, y, c.crater, 5.5);
    if (c.scorch) g.marks.scorch(x, y, c.crater * 0.7, 5);
    g.shake(5, 0.25);
    sfx.explosion();
    const t = this.target, d = Math.hypot(t.x - x, t.y - y);
    if (t.alive && d <= c.radius + t.radius) this.hit({ dirX: (t.x - x) / (d || 1), dirY: (t.y - y) / (d || 1), knockback: 140, stagger: 0.35 });
  }
}

// Leaps into the air and crashes down on the target's position (Body Slam, G-Max slam, Meteor Mash).
class Slam extends MoveAction {
  start() {
    const c = this.move.slam, u = this.user, t = this.target;
    this.anim(c.anim ?? 'Hop', 1);
    const d = Math.min(this.move.range, u.distTo(t));
    this.from = { x: u.x, y: u.y };
    this.to = { x: clampX(u.x + Math.cos(this.aim) * d), y: clampY(u.y + Math.sin(this.aim) * d) };
    u.zOverride = u.z;
    this.at(c.windup, () => {
      this.jumping = true;
      this.jumpT = 0;
      u.phasing = true;
      sfx.whoosh();
    });
  }

  tick(dt) {
    if (!this.jumping) return;
    const c = this.move.slam, u = this.user;
    this.jumpT += dt;
    const k = Math.min(1, this.jumpT / c.dur);
    u.x = this.from.x + (this.to.x - this.from.x) * k;
    u.y = this.from.y + (this.to.y - this.from.y) * k;
    u.zOverride = c.height * 4 * k * (1 - k);
    if (c.trail) {
      this.ghost = !this.ghost;
      if (this.ghost) this.game.spawn(new Afterimage(u, 0.25, c.trail));
    }
    if (k >= 1) {
      this.jumping = false;
      this.land();
    }
  }

  land() {
    const c = this.move.slam, u = this.user, g = this.game, { x, y } = u, R = this.move.radius;
    u.zOverride = null;
    u.phasing = false;
    g.marks.fracture(x, y, c.crater, 6.5);
    g.spawn(new Ring(x, y, { r0: 8, r1: R * 1.3, life: 0.45, color: c.ring ?? '#f4ead2', width: 5 }));
    g.spawn(new Ring(x, y, { r0: 4, r1: R * 0.8, life: 0.35, color: '#ffffff', width: 3 }));
    if (c.burst) DASH_BURST[c.burst](g, u);
    debris(g, x, y, c.big ? 36 : 18, c.big ? 180 : 130);
    dustCloud(g, x, y, c.big ? 22 : 12, 6);
    g.shake(c.big ? 12 : 7, 0.6);
    g.hitstop(0.06);
    if (c.big) g.punch(x, y, 0.1, 0.4);
    sfx.quake();
    const t = this.target, d = Math.hypot(t.x - x, t.y - y);
    if (t.alive && d <= R + t.radius) this.hit({ dirX: (t.x - x) / (d || 1), dirY: (t.y - y) / (d || 1), knockback: c.big ? 300 : 200, stagger: 0.5, flinchChance: 0.3 });
    this.at(this.t + 0.3, () => this.finish(c.recovery ?? 0.35));
  }

  cleanup() {
    this.user.zOverride = null;
    this.user.phasing = false;
  }
}

// Telekinesis: lifts a Pokémon into the air, carries it along an arc and slams it down.
// `land` runs when it hits the ground; the held Pokémon can't act or move meanwhile.
function telekinesis(action, mon, to, dur, height, land) {
  mon.cancelAction();
  mon.air = null;
  mon.held = true;
  mon.zOverride = mon.z;
  action.tk = { mon, from: { x: mon.x, y: mon.y, z: mon.z }, to, t: 0, dur, height, land };
}

function tkStep(action, dt) {
  const tk = action.tk;
  if (!tk) return;
  const m = tk.mon;
  tk.t += dt;
  const k = Math.min(1, tk.t / tk.dur);
  m.x = tk.from.x + (tk.to.x - tk.from.x) * k;
  m.y = tk.from.y + (tk.to.y - tk.from.y) * k;
  m.zOverride = tk.from.z * (1 - k) + tk.height * 4 * k * (1 - k) + (tk.to.z ?? 0) * k;
  m.flash = 0.55;
  m.flashColor = '#ff9fe0';
  if (Math.random() < 0.8) {
    action.game.particles.spawn({ x: m.x + rand(-m.radius, m.radius), y: m.y, z: m.z + rand(0, m.species.headZ), vz: rand(-20, 20), life: 0.3, size: 2, colors: ['#ffffff', '#ffb0e0', '#c060ff'] });
  }
  if (k < 1) return;
  action.tk = null;
  if (!tk.keep) release(m);
  tk.land?.();
}

function release(mon) {
  mon.held = false;
  mon.zOverride = null;
}

// Psychic: a ring marks where the target stands; whoever is still in it when it closes is seized,
// lifted and slammed down a short way off. Stepping (or dodging) out of the ring escapes it.
const PSY_WINDUP = 0.5;
const PSY_CATCH = 30; // ring radius, plus the target's own size

class PsychicThrow extends MoveAction {
  start() {
    const t = this.target, r = PSY_CATCH + t.radius;
    this.spot = { x: t.x, y: t.y };
    this.user.sprite.play('Charge', { loop: true, force: true });
    this.game.spawn(new Ring(t.x, t.y, { r0: r, r1: r, life: PSY_WINDUP, color: '#ff9fd0', width: 3, hold: true }));
    this.game.spawn(new Ring(t.x, t.y, { r0: r, r1: 4, life: PSY_WINDUP, color: '#ffffff', width: 1.5, hold: true }));
    sfx.zap(0.35);
    this.at(PSY_WINDUP, () => this.seize());
    this.at(PSY_WINDUP + 0.8, () => this.finish(0.3));
  }

  seize() {
    const u = this.user, t = this.target, g = this.game;
    const left = Math.hypot(t.x - this.spot.x, t.y - this.spot.y) > PSY_CATCH + t.radius;
    if (!t.alive || t.hidden || t.untouchable || left || u.distTo(t) > this.move.range) {
      if (t.alive && !t.hidden && (left || t.dodgeInv > 0)) g.spawn(new FloatText(t.x, t.y - t.headZ - 10, 'DODGED!', '#bff3ff'));
      return;
    }
    this.anim('Shoot', 1);
    g.spawn(new Tether(u, t, 0.7));
    sfx.zap(0.4);
    telekinesis(this, t, { x: t.x, y: t.y, z: 45 }, 0.28, 0, null);
    this.tk.keep = true;
    this.at(this.t + 0.34, () => {
      if (!t.alive || t.hidden) return;
      const a = u.aimAt(t);
      const to = { x: clampX(t.x + Math.cos(a) * 50), y: clampY(t.y + Math.sin(a) * 50) };
      sfx.whoosh();
      telekinesis(this, t, to, 0.3, 30, () => {
        g.marks.fracture(t.x, t.y, 18, 5.5);
        g.spawn(new Ring(t.x, t.y, { r0: 6, r1: 34, life: 0.3, color: '#ff9fd0', width: 3 }));
        dustCloud(g, t.x, t.y, 10, 5);
        debris(g, t.x, t.y, 10, 110);
        g.shake(5, 0.3);
        sfx.quake();
        this.hit({ knockback: 20, stagger: 0.3 });
      });
    });
  }

  tick(dt) {
    tkStep(this, dt);
  }

  cleanup() {
    if (this.target.held) release(this.target);
  }
}

// Ultimate: after the cutscene (see Game.startUltCutscene) an arena-wide pattern plays; its hits are
// unblockable (they ignore the dodge window) and reach the target wherever it is.
class Ultimate extends MoveAction {
  start() {
    this.ticks = [];
    this.owned = [];
    this.user.sprite.play('Charge', { loop: true, force: true });
    const fn = ULTS[this.move.id] ?? runSignature;
    this.at(0, () => fn(this, this.game, this.user, this.target));
  }

  tick(dt) {
    this.onTick?.(dt);
    for (const f of this.ticks) f(dt);
    tkStep(this, dt);
  }

  later(dt, fn) {
    this.at(this.t + dt, fn);
  }

  cleanup() {
    const u = this.user;
    if (this.target.held) release(this.target);
    for (const r of this.rocks ?? []) r.dead = true;
    for (const e of this.owned) e.dead = true;
    Object.assign(u, { phasing: false, invuln: false, zOverride: null });
  }

  end(dt) {
    this.later(dt, () => this.finish(0.4));
  }

  // Deals `frac` of the move's power to the target, wherever it is.
  strike(frac, opts = {}) {
    const u = this.user, t = this.target;
    if (!t.alive || t.hidden) return;
    const d = u.distTo(t) || 1;
    if (this.t-(this.lastImpact??-1)>.12) {
      this.lastImpact=this.t;
      this.game.spawn(new UltimateImpact(t.x,t.y,t.bodyZ,u.boss?(frac>=.25?88:frac>=.1?60:28):54));
    }
    applyHit(this.game, u, t, this.move, {
      power: this.move.power * frac, dirX: (t.x - u.x) / d, dirY: (t.y - u.y) / d, knockback: 160, stagger: 0.4,
      unblockable: true, stack: this.stack, ...opts,
    });
  }

  spot() {
    return { x: rand(BOUNDS.minX, BOUNDS.maxX), y: rand(BOUNDS.minY, BOUNDS.maxY) };
  }

  edge() {
    const side = Math.floor(rand(0, 4));
    return side === 0 ? { x: rand(20, 340), y: 90 } : side === 1 ? { x: rand(20, 340), y: 600 } : { x: side === 2 ? 10 : 350, y: rand(110, 590) };
  }

  boom(mag = 8) {
    this.game.shake(mag, 0.5);
    this.game.flash(0.08);
    sfx.explosion();
  }

  erupt(x, y, colors, rgb, height) {
    const g = this.game;
    g.spawn(new Pillar(x, y, 0.5, rgb, height));
    g.spawn(new Ring(x, y, { r0: 4, r1: 26, life: 0.35, color: colors[0], width: 3 }));
    for (let k = 0; k < 8; k++) {
      g.particles.spawn({ x, y, z: 2, vx: rand(-30, 30), vy: rand(-20, 20), vz: rand(80, 180), gz: 140, life: 0.6, size: rand(4, 7), sizeEnd: 1, colors });
    }
  }
}

const ULTS = {
  blastBurn(a, g, u, t) {
    // Mega Charizard X burns with blue flame.
    const fire = flameColors(u), blue = u.species.flame === 'blue';
    const rgb = blue ? [90, 170, 255] : [255, 150, 60], core = blue ? [150, 210, 255] : [255, 170, 80];
    for (let i = 0; i < 18; i++) {
      a.later(0.04 * i, () => {
        const p = a.spot();
        a.erupt(p.x, p.y, fire, rgb, 130);
        g.marks.scorch(p.x, p.y, rand(8, 14), 6);
      });
    }
    for (const [dt, frac] of [[0.5, 0.6], [0.9, 0.4]]) {
      a.later(dt, () => {
        a.erupt(t.x, t.y, fire, core, 320);
        g.marks.scorch(t.x, t.y, 34, 7);
        g.marks.fracture(t.x, t.y, 36, 7);
        a.boom(9);
        a.strike(frac, { knockback: 260, burnChance: 0.5 });
      });
    }
    a.end(1.3);
  },

  thunder(a, g, u, t) {
    g.spawn(new ScreenDim(1.8, 0.5, '10,10,30'));
    for (let i = 0; i < 5; i++) g.spawn(new StormCloud(40 + i * 70, 80 + (i % 2) * 18, 1.8));
    for (let i = 0; i < 14; i++) {
      a.later(0.08 * i, () => {
        const p = i % 4 === 3 ? t : a.spot();
        g.spawn(new Lightning(p.x + rand(-6, 6), 70, p.x, p.y - 4, 0.25, { width: 2.5, branches: 4 }));
        electricBurst(g, p.x, p.y, 4, 12);
        g.marks.burn(p.x, p.y, 10);
        sfx.thunderbolt();
        if (p === t) a.strike(0.15);
      });
    }
    a.later(1.25, () => {
      g.spawn(new Lightning(t.x, 60, t.x, t.y - 4, 0.5, { width: 6, branches: 8 }));
      g.marks.fracture(t.x, t.y, 34, 6.5);
      electricBurst(g, t.x, t.y, 6, 34);
      g.flash(0.15);
      g.shake(10, 0.6);
      sfx.thunder();
      a.strike(0.55, { knockback: 240 });
    });
    a.end(1.7);
  },

  hydroPump(a, g, u, t) {
    const down = t.y > u.y, y0 = down ? 60 : 640, y1 = down ? 640 : 60;
    const wave = g.spawn(new TidalWave(y0, y1, 1.1));
    a.markT = 0;
    a.onTick = dt => {
      if (wave.age >= wave.life) return;
      for (let i = 0; i < 6; i++) {
        g.particles.spawn({ x: rand(0, 360), y: wave.y, z: rand(0, 14), vx: rand(-20, 20), vy: (down ? 1 : -1) * rand(40, 90), vz: rand(40, 120), gz: 300, life: 0.5, size: rand(2, 4), colors: ['#ffffff', '#bfe6ff', '#5aa6f0'] });
      }
      if ((a.markT -= dt) <= 0) {
        a.markT = 0.06;
        g.marks.wet(rand(20, 340), wave.y, rand(10, 18));
      }
    };
    a.later((Math.abs(t.y - y0) / Math.abs(y1 - y0)) * 1.1, () => {
      waterSplash(g, t.x, t.y);
      g.shake(7, 0.4);
      sfx.splash();
      a.strike(1, { dirX: 0, dirY: down ? 1 : -1, knockback: 300, stagger: 0.6 });
    });
    sfx.hydro(1.1);
    a.end(1.4);
  },

  frenzyPlant(a, g, u, t) {
    for (let ring = 1; ring <= 8; ring++) {
      a.later(ring * 0.08, () => {
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2 + ring;
          const x = u.x + Math.cos(ang) * ring * 42, y = u.y + Math.sin(ang) * ring * 30;
          if (x < 10 || x > 350 || y < 90 || y > 600) continue;
          g.spawn(new Spike(x, y, 'vine', 1));
          if (i % 3 === 0) g.marks.leaves(x, y, 10);
        }
        g.shake(3, 0.15);
      });
    }
    for (const [dt, frac] of [[0.45, 0.35], [0.75, 0.35], [1.05, 0.3]]) {
      a.later(dt, () => {
        for (let k = 0; k < 3; k++) g.spawn(new Spike(t.x + rand(-10, 10), t.y + rand(-6, 6), 'vine', 0.9));
        leafBurst(g, t.x, t.y, 10, 14);
        g.marks.fracture(t.x, t.y, 20, 6);
        sfx.quake();
        a.strike(frac, { knockback: 120 });
      });
    }
    a.end(1.4);
  },

  blizzard(a, g, u, t) {
    g.spawn(new ScreenDim(1.9, 0.25, '200,230,255'));
    g.spawn(new StormSwirl(180, 350, 260, 1.9));
    sfx.storm(1.9);
    a.frostT = 0;
    a.onTick = dt => {
      if (a.t > 1.8) return;
      for (let i = 0; i < 8; i++) {
        g.particles.spawn({ x: rand(-40, 360), y: rand(60, 640), z: rand(4, 50), vx: rand(160, 260), vy: rand(30, 70), life: rand(0.3, 0.5), size: rand(1.5, 3), colors: ['#ffffff', '#e2f7ff', '#a6e6ff'] });
      }
      if ((a.frostT -= dt) <= 0) {
        a.frostT = 0.1;
        const p = a.spot();
        g.marks.frost(p.x, p.y, rand(8, 14));
      }
    };
    for (let i = 0; i < 6; i++) a.later(0.3 + i * 0.25, () => a.strike(1 / 6, { knockback: 50, stagger: 0.3, freezeChance: i === 5 ? 0.5 : 0 }));
    a.end(1.9);
  },

  auraStorm(a, g, u, t) {
    const rgb = [90, 150, 255];
    g.spawn(new ScreenDim(1.4, 0.45, '6,12,40'));
    g.spawn(new EnergyAura(u, 1.2, true, { glow: [120, 170, 255], rings: ['#bfe0ff', '#6a9cff'] }));
    for (const [dt, frac] of [[0.25, 0.5], [0.75, 0.5]]) {
      a.later(dt, () => {
        a.anim('Shoot', 1);
        g.spawn(new Pillar(u.x, u.y, 0.6, rgb, 480));
        g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 480, life: 0.6, color: '#bfe0ff', width: 8 }));
        g.spawn(new Ring(u.x, u.y, { r0: 6, r1: 360, life: 0.5, color: '#6a9cff', width: 5 }));
        windBurst(g, u.x, u.y, u.bodyZ, 60, ['#ffffff', '#b8d8ff', '#4a7aff']);
        g.marks.energy(u.x, u.y, 50, rgb, 5);
        a.boom(8);
        a.later((u.distTo(t) / 480) * 0.6, () => {
          g.spawn(new Glow(t.x, t.y, t.bodyZ, 40, rgb, 0.3));
          a.strike(frac, { knockback: 300 });
        });
      });
    }
    a.end(1.4);
  },

  waterShurikenBarrage(a, g, u, t) {
    for (let i = 0; i < 12; i++) {
      a.later(i * 0.08, () => {
        const p = i % 3 === 0 ? { x: u.x, y: u.y } : a.edge();
        g.spawn(new Missile(p.x, p.y, t.x, t.y, 14, 0.3, 'shuriken', () => {
          waterSplash(g, t.x, t.y);
          a.strike(1 / 12, { knockback: 50, stagger: 0.25 });
        }, [120, 190, 255]));
        sfx.whoosh();
      });
    }
    a.end(1.5);
  },

  dracoMeteor(a, g, u, t) {
    const sy = u.y - u.bodyZ;
    g.spawn(new BeamLine(u.x, sy, u.x, sy - 260, 0.5, '#ffb070', 6));
    sfx.ascend();
    for (let i = 0; i < 22; i++) {
      a.later(0.3 + i * 0.06, () => {
        const aimed = i % 5 === 0, p = aimed ? { x: t.x, y: t.y } : a.spot();
        g.spawn(new Falling(p.x, p.y, 0.45, 'draco', () => {
          for (let k = 0; k < 14; k++) {
            g.particles.spawn({ x: p.x, y: p.y, z: 4, vx: rand(-100, 100), vy: rand(-70, 70), vz: rand(30, 110), drag: 2, life: 0.5, size: rand(3, 6), sizeEnd: 1, colors: ['#fff2c0', '#ff9a40', '#a050ff'] });
          }
          g.marks.fracture(p.x, p.y, 20, 6);
          g.shake(4, 0.2);
          sfx.explosion();
          if (aimed) a.strike(0.2, { knockback: 150 });
        }));
      });
    }
    a.end(2.1);
  },

  shadowBallBarrage(a, g, u, t) {
    g.spawn(new ScreenDim(1.5, 0.45, '20,6,30'));
    for (let i = 0; i < 8; i++) {
      a.later(0.1 + i * 0.12, () => {
        const ang = (i / 8) * Math.PI * 2, sx = clampX(t.x + Math.cos(ang) * 110), sy = clampY(t.y + Math.sin(ang) * 80);
        g.spawn(new Glow(sx, sy, 14, 22, [130, 70, 200], 0.25));
        g.spawn(new Missile(sx, sy, t.x, t.y, 14, 0.28, 'ghost', () => {
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 4, r1: 22, life: 0.3, color: '#c8a0ff', width: 3, layer: 'air' }));
          g.marks.energy(t.x, t.y, 14, [110, 60, 170]);
          a.strike(1 / 8, { knockback: 70, stagger: 0.3 });
        }, [150, 90, 220]));
        sfx.pulse();
      });
    }
    a.end(1.5);
  },

  blazeKickOverdrive(a, g, u, t) {
    u.phasing = true;
    for (let i = 0; i < 5; i++) {
      a.later(i * 0.15, () => {
        const ang = (i / 5) * Math.PI * 2;
        g.spawn(new Afterimage(u, 0.3, '#ff7a2a'));
        u.x = clampX(t.x + Math.cos(ang) * 26);
        u.y = clampY(t.y + Math.sin(ang) * 20);
        u.face(t.x, t.y);
        a.aim = u.aimAt(t);
        a.anim('Attack', 2);
        g.spawn(new SlashArc(u.x, u.y, u.bodyZ - 4, a.aim, { radius: u.radius + 12, spread: 2.6, colors: ['#ff7a2a', '#fff0a0'], width: 6, mirror: i % 2 === 1 }));
        for (let k = 0; k < 12; k++) {
          g.particles.spawn({ x: t.x, y: t.y, z: t.bodyZ, vx: rand(-80, 80), vy: rand(-60, 60), vz: rand(20, 90), life: 0.45, size: rand(3, 6), sizeEnd: 1, colors: FIRE });
        }
        g.marks.scorch(t.x + rand(-10, 10), t.y + rand(-6, 6), 9);
        sfx.whoosh();
        a.strike(0.14, { knockback: 40, stagger: 0.3 });
      });
    }
    a.later(0.85, () => {
      a.erupt(t.x, t.y, FIRE, [255, 160, 70], 360);
      g.marks.fracture(t.x, t.y, 30, 6.5);
      a.boom(10);
      a.strike(0.3, { knockback: 300 });
      u.phasing = false;
    });
    a.end(1.2);
  },

  // Mewtwo: the arena turns psychic purple, boulders tear free and pelt the target, a tether seizes it
  // and yanks it into the sky, it's spiked back down, and a psychic dome bursts across the arena.
  psystrike(a, g, u, t) {
    const PSY = ['#ffffff', '#f0c8ff', '#c060ff'];
    g.spawn(new ScreenDim(3.8, 0.6, '46,14,92'));
    g.spawn(new EnergyAura(u, 3.6, true, { glow: [230, 110, 255], rings: ['#ffb0e0', '#c060ff'] }));
    g.spawn(new Ring(u.x, u.y, { r0: 20, r1: 120, life: 0.9, color: '#c060ff', width: 2 }));
    sfx.ascend();
    a.rocks = [];
    for (let i = 0; i < 9; i++) {
      a.later(0.05 + i * 0.05, () => {
        const p = a.spot();
        a.rocks.push(g.spawn(new FloatingRock(p.x, p.y, rand(6, 11))));
        g.marks.fracture(p.x, p.y, 10, 5);
        dustCloud(g, p.x, p.y, 5, 3);
      });
      a.later(0.85 + i * 0.07, () => {
        const r = a.rocks[i];
        if (!r || r.dead) return;
        sfx.whoosh();
        r.throwAt(t, 0.22, () => {
          debris(g, t.x, t.y, 6, 110);
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 4, r1: 20, life: 0.25, color: '#f0c8ff', width: 2, layer: 'air' }));
          g.shake(3, 0.12);
          a.strike(0.035, { knockback: 40, stagger: 0.3 });
        });
      });
    }
    a.later(1.65, () => {
      if (!t.alive || t.hidden) return;
      a.anim('Shoot', 1);
      g.spawn(new Tether(u, t, 1.05));
      telekinesis(a, t, { x: t.x, y: t.y, z: 55 }, 0.4, 0, null);
      a.tk.keep = true;
      sfx.zap(0.7);
    });
    a.later(2.2, () => {
      if (!t.alive || t.hidden) return;
      telekinesis(a, t, { x: t.x, y: t.y, z: 460 }, 0.22, 0, null);
      a.tk.keep = true;
      for (let k = 0; k < 3; k++) g.spawn(new BeamLine(t.x + rand(-8, 8), t.y - 10, t.x + rand(-8, 8), t.y - 400, 0.45, '#f0d0ff', rand(2, 4)));
      g.spawn(new Ring(t.x, t.y, { r0: 6, r1: 36, life: 0.5, color: '#d8a0ff', width: 3 }));
      g.marks.energy(t.x, t.y, 20, [200, 120, 255], 5);
      for (let k = 0; k < 16; k++) {
        g.particles.spawn({ x: t.x + rand(-14, 14), y: t.y, z: rand(10, 120), vz: rand(150, 320), life: 0.5, size: 2, colors: PSY });
      }
      sfx.ascend();
      a.strike(0.12, { knockback: 0, stagger: 0.6 });
    });
    a.later(2.75, () => {
      if (!t.alive || t.hidden) return;
      sfx.whoosh();
      telekinesis(a, t, { x: t.x, y: t.y }, 0.16, 0, () => {
        g.marks.fracture(t.x, t.y, 60, 8);
        for (let i = 0; i < 3; i++) g.marks.fracture(t.x + rand(-60, 60), t.y + rand(-50, 50), 20, 7);
        g.spawn(new Ring(t.x, t.y, { r0: 8, r1: 120, life: 0.45, color: '#ffffff', width: 5 }));
        debris(g, t.x, t.y, 40, 200);
        dustCloud(g, t.x, t.y, 20, 7);
        g.hitstop(0.08);
        g.punch(t.x, t.y, 0.14, 0.45);
        a.boom(12);
        a.strike(0.28, { knockback: 0, stagger: 0.7 });
      });
    });
    a.later(3.2, () => {
      g.spawn(new PsyDome(u.x, u.y, 340, 0.9));
      g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 360, life: 0.6, color: '#ffffff', width: 6 }));
      g.marks.energy(u.x, u.y, 60, [230, 110, 255], 6);
      g.flash(0.1);
      a.boom(12);
      a.strike(0.29, { knockback: 320, stagger: 0.7 });
    });
    a.end(3.9);
  },

  meteorMash(a, g, u, t) {
    u.invuln = true;
    u.zOverride = u.z;
    a.phase = 'rise';
    a.onTick = dt => {
      if (a.phase === 'rise') u.zOverride = Math.min(220, u.zOverride + dt * 600);
      if (a.phase === 'dive') {
        a.diveT += dt;
        const k = Math.min(1, a.diveT / 0.22);
        u.x = a.from.x + (t.x - a.from.x) * k;
        u.y = a.from.y + (t.y - a.from.y) * k;
        u.zOverride = 220 * (1 - k * k);
        g.spawn(new Afterimage(u, 0.25, '#bfe0ff'));
        if (k >= 1) {
          a.phase = 'done';
          u.zOverride = null;
          u.invuln = false;
          g.marks.fracture(u.x, u.y, 70, 7.5);
          for (let i = 0; i < 6; i++) g.marks.fracture(u.x + rand(-120, 120), u.y + rand(-160, 160), 20, 7);
          g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 460, life: 0.6, color: '#dfe7f2', width: 7 }));
          g.spawn(new Ring(u.x, u.y, { r0: 6, r1: 260, life: 0.45, color: '#bfe0ff', width: 4 }));
          metalSparks(g, u.x, u.y, 10);
          debris(g, u.x, u.y, 50, 220);
          dustCloud(g, u.x, u.y, 26, 8);
          g.hitstop(0.1);
          g.punch(u.x, u.y, 0.14, 0.5);
          a.boom(14);
          a.strike(1, { knockback: 340, stagger: 0.7 });
        }
      }
    };
    a.later(0.45, () => {
      a.phase = 'dive';
      a.diveT = 0;
      a.from = { x: u.x, y: u.y };
      sfx.dash();
    });
    a.end(1.2);
  },

  stoneEdge(a, g, u, t) {
    for (let wave = 0; wave < 9; wave++) {
      a.later(wave * 0.07, () => {
        const y = (u.y > 360 ? 590 - wave * 62 : 100 + wave * 62);
        for (let x = 20; x <= 340; x += 40) {
          g.spawn(new Spike(x + rand(-8, 8), y + rand(-10, 10), 'stone', 1));
          if (Math.random() < 0.3) g.marks.fracture(x, y, 12, 6);
        }
        g.shake(3, 0.12);
        sfx.whoosh();
      });
    }
    for (const [dt, frac] of [[0.4, 0.3], [0.7, 0.3], [1.0, 0.4]]) {
      a.later(dt, () => {
        for (let k = 0; k < 4; k++) g.spawn(new Spike(t.x + rand(-12, 12), t.y + rand(-6, 6), 'stone', 0.9));
        debris(g, t.x, t.y, 14, 140);
        g.marks.fracture(t.x, t.y, 22, 6.5);
        sfx.quake();
        a.strike(frac, { knockback: 130, critChance: 0.3 });
      });
    }
    a.end(1.4);
  },

  extremeEvoboost(a, g, u, t) {
    u.buffT = 8;
    g.spawn(new FloatText(u.x, u.y - u.headZ - 8, 'STATS ROSE!', '#ffe680'));
    g.ui.log(`${u.species.name}'s stats rose sharply!`, u.side);
    const colors = [[255, 120, 70], [80, 150, 255], [255, 220, 60], [190, 120, 255], [60, 50, 80], [120, 220, 110], [120, 210, 255]];
    colors.forEach((rgb, i) => {
      const ang = (i / 7) * Math.PI * 2, sx = clampX(180 + Math.cos(ang) * 150), sy = clampY(350 + Math.sin(ang) * 220);
      a.later(0.1, () => g.spawn(new Glow(sx, sy, 16, 20, rgb, 0.4)));
      a.later(0.3 + i * 0.1, () => {
        g.spawn(new Missile(sx, sy, t.x, t.y, 16, 0.3, 'orb', () => {
          g.spawn(new Glow(t.x, t.y, t.bodyZ, 26, rgb, 0.25));
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 4, r1: 20, life: 0.3, color: `rgb(${rgb.join(',')})`, width: 3, layer: 'air' }));
          a.strike(1 / 7, { knockback: 60, stagger: 0.3 });
        }, rgb));
        sfx.shard();
      });
    });
    a.end(1.4);
  },

  gmaxSlam(a, g, u, t) {
    u.invuln = true;
    u.zOverride = u.z;
    let shadow = null;
    a.phase = 'rise';
    a.onTick = dt => {
      if (a.phase === 'rise') u.zOverride = Math.min(420, u.zOverride + dt * 900);
      if (a.phase === 'fall') {
        a.fallT += dt;
        const k = Math.min(1, a.fallT / 0.25);
        u.x = t.x;
        u.y = t.y;
        u.zOverride = 420 * (1 - k);
        if (k >= 1) {
          a.phase = 'done';
          shadow.dead = true;
          u.zOverride = null;
          u.invuln = false;
          g.marks.fracture(u.x, u.y, 95, 8);
          for (let i = 0; i < 8; i++) {
            const p = a.spot();
            g.marks.fracture(p.x, p.y, rand(18, 30), 7.5);
          }
          for (const [r1, c, w] of [[520, '#ffffff', 9], [380, '#ffe6a8', 6], [240, '#f4ead2', 4]]) g.spawn(new Ring(u.x, u.y, { r0: 10, r1, life: 0.7, color: c, width: w }));
          for (let i = 0; i < 6; i++) {
            const p = a.spot();
            debris(g, p.x, p.y, 10, 140);
          }
          dustCloud(g, u.x, u.y, 34, 9);
          g.hitstop(0.12);
          g.punch(u.x, u.y, 0.16, 0.6);
          a.boom(16);
          sfx.quake();
          a.strike(1, { knockback: 320, stagger: 0.8 });
        }
      }
      if (shadow) shadow.set(t.x, t.y);
    };
    a.later(0.5, () => {
      shadow = g.spawn(new GroundMarker(t.x, t.y, 40, '40,40,60'));
    });
    a.later(0.95, () => {
      a.phase = 'fall';
      a.fallT = 0;
      sfx.whoosh();
    });
    a.end(1.6);
  },

  moonblast(a, g, u, t) {
    g.spawn(new ScreenDim(1.8, 0.5, '30,10,40'));
    g.spawn(new Moon(180, 110, 1.8));
    for (let i = 0; i < 20; i++) {
      a.later(0.1 + i * 0.03, () => {
        const p = a.spot();
        g.particles.spawn({ x: p.x, y: p.y, z: rand(40, 200), vz: -rand(40, 120), life: 0.8, size: 2, colors: ['#ffffff', '#ffd0e8'] });
      });
    }
    a.later(0.7, () => {
      g.spawn(new Beam(180, 110, t.x, t.y - 8, 0.6, { width: 26, colors: ['#f080b0', '#ffc8e4', '#ffffff'] }));
      sfx.beamFire();
      a.strike(0.4, { knockback: 80 });
    });
    a.later(1.15, () => {
      g.spawn(new Glow(t.x, t.y, 10, 90, [255, 160, 210], 0.5));
      g.spawn(new Ring(t.x, t.y, { r0: 8, r1: 200, life: 0.5, color: '#ffd0e8', width: 6 }));
      g.marks.energy(t.x, t.y, 40, [255, 150, 210], 6);
      g.marks.fracture(t.x, t.y, 40, 7);
      a.boom(10);
      a.strike(0.6, { knockback: 280 });
    });
    a.end(1.6);
  },
};

// ── Signature ultimates ─────────────────────────────────────────────────────────────
// Each signature is a short script of beats (time, kind, options) drawn in its own palette.
// Damage shares (`frac`) are normalised so a signature always deals its full power in total.
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const MARK_BY_TYPE = {
  fire: (g, x, y, r) => g.marks.scorch(x, y, r, 6),
  water: (g, x, y, r) => g.marks.wet(x, y, r),
  ice: (g, x, y, r) => g.marks.frost(x, y, r),
  grass: (g, x, y, r) => g.marks.leaves(x, y, r),
  electric: (g, x, y, r) => g.marks.burn(x, y, r),
  ground: (g, x, y, r) => g.marks.fracture(x, y, r, 6),
  rock: (g, x, y, r) => g.marks.fracture(x, y, r, 6),
};

function palette(c, type) {
  const rgb = hexRgb(c[1]), dark = hexRgb(c[2]);
  return { c, rgb, dim: dark.map(v => Math.round(v * 0.35)).join(','), mark: MARK_BY_TYPE[type] ?? ((g, x, y, r) => g.marks.energy(x, y, r, rgb, 6)) };
}

function runSignature(a, g, u, t) {
  const S = a.move.sig, P = palette(isShadowLugia(u) ? SHADOW_LUGIA.colors : S.c, a.move.type);
  const total = S.beats.reduce((sum, b) => sum + (b[2]?.frac ?? 0), 0) || 1;
  a.sigLen = S.len ?? Math.max(...S.beats.map(b => b[0])) + 1.5;
  for (const [time, kind, o = {}] of S.beats) a.later(time, () => BEATS[kind](a, g, u, t, { ...o, frac: (o.frac ?? 0) / total }, P));
  a.end(a.sigLen);
}

const BEATS = {
  dim(a, g, u, t, o, P) {
    const dur = o.dur ?? a.sigLen;
    g.spawn(new ScreenDim(dur, o.alpha ?? 0.5, P.dim));
    g.spawn(new EnergyAura(u, Math.min(dur, 2.6), true, { glow: P.rgb, rings: [P.c[0], P.c[1]] }));
  },

  charge(a, g, u, t, o, P) {
    let left = o.dur ?? 0.5;
    if(skyLegend(u))g.spawn(new CastEnergy(u,left,true));
    else g.spawn(new Glow(u.x, u.y, u.bodyZ, 44, P.rgb, left, true));
    a.ticks.push(dt => {
      if ((left -= dt) > 0) a.converge(90, dt, P.c, 34);
    });
    sfx.beamCharge(left);
  },

  // A giant beam from the user through the foe to the edge of the arena.
  beam(a, g, u, t, o, P) {
    const ang = u.aimAt(t), w = o.width ?? 28, m = a.mouth(), off = o.off ?? 0;
    const nx = -Math.sin(ang) * off, ny = Math.cos(ang) * off;
    a.anim('Shoot', 1);
    if(a.move===MOVES.aeroblast)g.spawn(new AeroblastBeam(u,u.x+Math.cos(ang)*720,u.y+Math.sin(ang)*720-10,w*2.4,o.dur??.8));
    else if (skyLegend(u)) g.spawn(new LegendaryBeam(u, u.x + Math.cos(ang) * 720, u.y + Math.sin(ang) * 720 - 10, '#9ed8f5', w * 1.5, o.dur ?? .6,true));
    else g.spawn(new Beam(m.x + nx, m.y - m.z + ny, u.x + Math.cos(ang) * 720 + nx, u.y + Math.sin(ang) * 720 + ny - 10, o.dur ?? 0.6,
      { width: w, colors: [P.c[2], P.c[1], '#ffffff'] }));
    for (let d = 40; d < 700; d += 22) {
      const x = u.x + Math.cos(ang) * d, y = u.y + Math.sin(ang) * d;
      if (x < 0 || x > 360 || y < 60 || y > 640) break;
      if (!skyLegend(u)) {
        P.mark(g, x + rand(-6, 6), y + rand(-6, 6), rand(6, 10));
        if (d % 88 < 22) g.spawn(new Ring(x, y, { z: 10, r0: 4, r1: w * 0.9, life: 0.35, color: P.c[0], width: 3, layer: 'air' }));
      }
    }
    g.shake(9, 0.5);
    g.flash(0.08);
    sfx.beamFire();
    a.strike(o.frac, { knockback: 300, stagger: 0.5, dirX: Math.cos(ang), dirY: Math.sin(ang) });
  },

  // Objects rain across the arena; every few land on the foe.
  rain(a, g, u, t, o, P) {
    const n = o.n ?? 14, every = o.every ?? 4, aimed = Math.ceil(n / every);
    for (let i = 0; i < n; i++) {
      a.later(i * (o.gap ?? 0.06), () => {
        const hit = i % every === 0, p = hit ? { x: t.x, y: t.y } : a.spot();
        g.spawn(new Falling(p.x, p.y, 0.45, o.style ?? 'orb', () => {
          for (let k = 0; k < 10; k++) {
            g.particles.spawn({ x: p.x, y: p.y, z: 4, vx: rand(-90, 90), vy: rand(-60, 60), vz: rand(30, 110), drag: 2, life: 0.45, size: rand(3, 5), sizeEnd: 1, colors: P.c });
          }
          g.spawn(new Ring(p.x, p.y, { r0: 3, r1: 22, life: 0.3, color: P.c[0], width: 3 }));
          P.mark(g, p.x, p.y, rand(8, 12));
          if (o.style === 'rock' || o.style === 'crystal') g.marks.fracture(p.x, p.y, 12, 5);
          g.shake(3, 0.15);
          if (i % 2 === 0) sfx.explosion();
          if (hit) a.strike(o.frac / aimed, { knockback: 120 });
        }, P.rgb));
      });
    }
  },

  // Eruptions all over the arena, then one or more huge ones under the foe.
  pillars(a, g, u, t, o, P) {
    const n = o.n ?? 12, finals = o.finals ?? 1, gap = o.gap ?? 0.05;
    for (let i = 0; i < n; i++) {
      a.later(i * gap, () => {
        const p = a.spot();
        a.erupt(p.x, p.y, P.c, P.rgb, o.height ?? 130);
        P.mark(g, p.x, p.y, rand(8, 14));
      });
    }
    for (let k = 0; k < finals; k++) {
      a.later(n * gap + k * 0.3, () => {
        a.erupt(t.x, t.y, P.c, P.rgb, o.big ?? 340);
        P.mark(g, t.x, t.y, 30);
        g.marks.fracture(t.x, t.y, 32, 7);
        a.boom(10);
        a.strike(o.frac / finals, { knockback: 240, stagger: 0.5 });
      });
    }
  },

  // Strikes from the sky onto the foe: lightning bolts or columns of light.
  sky(a, g, u, t, o, P) {
    const n = o.n ?? 1;
    for (let i = 0; i < n; i++) {
      a.later(i * 0.14, () => {
        if (o.kind === 'bolt') g.spawn(new Lightning(t.x + rand(-5, 5), 60, t.x, t.y - 4, 0.35, { width: 4, branches: 6, glow: `rgba(${P.rgb.join(',')},0.6)` }));
        else {
          g.spawn(new BeamLine(t.x, t.y - 420, t.x, t.y, 0.45, P.c[0], 12));
          g.spawn(new Pillar(t.x, t.y, 0.5, P.rgb, 420));
        }
        g.spawn(new Glow(t.x, t.y, t.bodyZ, 50, P.rgb, 0.4));
        g.spawn(new Ring(t.x, t.y, { r0: 6, r1: 70, life: 0.4, color: P.c[0], width: 4 }));
        P.mark(g, t.x, t.y, 22);
        g.marks.fracture(t.x, t.y, 26, 6.5);
        g.flash(0.1);
        g.shake(8, 0.4);
        if (o.kind === 'bolt') sfx.thunder();
        else sfx.explosion();
        a.strike(o.frac / n, { knockback: 200, stagger: 0.5 });
      });
    }
  },

  // A wall of energy sweeping the whole arena.
  wave(a, g, u, t, o, P) {
    const down = t.y > u.y, y0 = down ? 60 : 640, y1 = down ? 640 : 60, dur = o.dur ?? 1;
    const w = g.spawn(new TidalWave(y0, y1, dur, P.rgb));
    a.ticks.push(() => {
      if (w.age >= w.life) return;
      for (let i = 0; i < 4; i++) {
        g.particles.spawn({ x: rand(0, 360), y: w.y, z: rand(0, 14), vx: rand(-20, 20), vy: (down ? 1 : -1) * rand(40, 90), vz: rand(40, 120), gz: 300, life: 0.45, size: rand(2, 4), colors: P.c });
      }
      if (Math.random() < 0.3) P.mark(g, rand(20, 340), w.y, rand(8, 14));
    });
    sfx.hydro(dur);
    a.later((Math.abs(t.y - y0) / 580) * dur, () => {
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 34, P.rgb, 0.3));
      g.shake(7, 0.4);
      sfx.splash();
      a.strike(o.frac, { dirX: 0, dirY: down ? 1 : -1, knockback: 300, stagger: 0.5 });
    });
  },

  dome(a, g, u, t, o, P) {
    const r = o.r ?? 340;
    g.spawn(new PsyDome(u.x, u.y, r, 0.9, P.rgb));
    g.spawn(new Ring(u.x, u.y, { r0: 10, r1: r, life: 0.6, color: '#ffffff', width: 6 }));
    P.mark(g, u.x, u.y, 50);
    g.flash(0.1);
    a.boom(10);
    a.later(Math.min(0.4, (u.distTo(t) / r) * 0.5), () => a.strike(o.frac, { knockback: 300, stagger: 0.6 }));
  },

  // Volleys of orbs from the arena edges, the user, or a ring around the foe; `big` is one giant orb.
  barrage(a, g, u, t, o, P) {
    const n = o.n ?? 8, big = !!o.big;
    for (let i = 0; i < n; i++) {
      a.later(i * (o.gap ?? 0.09), () => {
        let p;
        if (o.from === 'ring') {
          const ang = (i / n) * Math.PI * 2;
          p = { x: clampX(t.x + Math.cos(ang) * 110), y: clampY(t.y + Math.sin(ang) * 85) };
          g.spawn(new Glow(p.x, p.y, 14, 18, P.rgb, 0.25));
        } else p = o.from === 'user' ? { x: u.x, y: u.y - u.bodyZ + 14 } : a.edge();
        g.spawn(new Missile(p.x, p.y, t.x, t.y, 14, big ? 0.7 : 0.3, o.style ?? 'orb', () => {
          g.spawn(new Glow(t.x, t.y, t.bodyZ, big ? 90 : 24, P.rgb, big ? 0.5 : 0.25));
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 4, r1: big ? 120 : 22, life: 0.35, color: P.c[0], width: big ? 6 : 3, layer: 'air' }));
          if (big) {
            P.mark(g, t.x, t.y, 40);
            g.marks.fracture(t.x, t.y, 40, 7);
            a.boom(12);
          }
          a.strike(o.frac / n, { knockback: big ? 320 : 60, stagger: 0.3 });
        }, P.rgb, big ? 3.2 : 1));
        sfx.pulse();
      });
    }
  },

  // Teleporting strikes all around the foe.
  flurry(a, g, u, t, o, P) {
    const n = o.n ?? 6;
    u.phasing = true;
    for (let i = 0; i < n; i++) {
      a.later(i * 0.13, () => {
        const ang = (i / n) * Math.PI * 2 + 0.4;
        g.spawn(new Afterimage(u, 0.3, P.c[1]));
        u.x = clampX(t.x + Math.cos(ang) * 26);
        u.y = clampY(t.y + Math.sin(ang) * 20);
        u.face(t.x, t.y);
        a.aim = u.aimAt(t);
        a.anim(i % 2 ? 'Attack' : 'Swing', 2);
        g.spawn(new SlashArc(u.x, u.y, u.bodyZ - 4, a.aim, { radius: u.radius + 12, spread: 2.6, colors: [P.c[1], P.c[0]], width: 6, mirror: i % 2 === 1 }));
        typeBurst(g, t, a.move.type);
        sfx.whoosh();
        a.strike(o.frac / n, { knockback: 40, stagger: 0.3 });
      });
    }
    a.later(n * 0.13, () => { u.phasing = false; });
  },

  // Leaps out of sight, then crashes down onto the foe.
  dive(a, g, u, t, o, P) {
    const H = o.height ?? 260, hang = o.hang ?? 0.45;
    let phase = 'rise', ft = 0, from = null, shadow = null;
    u.invuln = true;
    u.zOverride = u.z;
    a.anim('Hop', 1);
    a.ticks.push(dt => {
      shadow?.set(t.x, t.y);
      if (phase === 'rise') u.zOverride = Math.min(H, u.zOverride + dt * 700);
      if (phase !== 'fall') return;
      ft += dt;
      const k = Math.min(1, ft / 0.2);
      u.x = from.x + (t.x - from.x) * k;
      u.y = from.y + (t.y - from.y) * k;
      u.zOverride = H * (1 - k * k);
      g.spawn(new Afterimage(u, 0.2, P.c[1]));
      if (k < 1) return;
      phase = 'done';
      if (shadow) shadow.dead = true;
      u.zOverride = null;
      u.invuln = false;
      g.marks.fracture(u.x, u.y, 60, 7.5);
      P.mark(g, u.x, u.y, 40);
      g.spawn(new Ring(u.x, u.y, { r0: 8, r1: 420, life: 0.55, color: '#ffffff', width: 7 }));
      g.spawn(new Ring(u.x, u.y, { r0: 8, r1: 260, life: 0.45, color: P.c[0], width: 5 }));
      debris(g, u.x, u.y, 36, 200);
      dustCloud(g, u.x, u.y, 22, 7);
      g.hitstop(0.1);
      g.punch(u.x, u.y, 0.14, 0.45);
      a.boom(13);
      sfx.quake();
      a.strike(o.frac, { knockback: 320, stagger: 0.7 });
    });
    a.later(0.2, () => {
      shadow = g.spawn(new GroundMarker(t.x, t.y, 30, P.rgb.join(',')));
      a.owned.push(shadow);
    });
    a.later(0.2 + hang, () => {
      phase = 'fall';
      from = { x: u.x, y: u.y };
      sfx.whoosh();
    });
  },

  // Rows of spikes erupt across the arena, then a cluster impales the foe.
  spikes(a, g, u, t, o, P) {
    const style = o.style ?? 'stone';
    for (let w = 0; w < 9; w++) {
      a.later(w * 0.07, () => {
        const y = u.y > 360 ? 590 - w * 62 : 100 + w * 62;
        for (let x = 20; x <= 340; x += 40) {
          g.spawn(new Spike(x + rand(-8, 8), y + rand(-10, 10), style, 1));
          if (Math.random() < 0.3) P.mark(g, x, y, 10);
        }
        g.shake(3, 0.12);
        sfx.whoosh();
      });
    }
    for (const [dt, f] of [[0.4, 0.3], [0.7, 0.3], [1.0, 0.4]]) {
      a.later(dt, () => {
        for (let k = 0; k < 4; k++) g.spawn(new Spike(t.x + rand(-12, 12), t.y + rand(-6, 6), style, 0.9));
        debris(g, t.x, t.y, 12, 130);
        g.marks.fracture(t.x, t.y, 20, 6);
        sfx.quake();
        a.strike(o.frac * f, { knockback: 130 });
      });
    }
  },

  storm(a, g, u, t, o, P) {
    const n = o.n ?? 12, every = o.every ?? 4, aimed = Math.ceil(n / every);
    for (let i = 0; i < 4; i++) g.spawn(new StormCloud(50 + i * 85, 80 + (i % 2) * 16, n * 0.09 + 0.6));
    for (let i = 0; i < n; i++) {
      a.later(i * 0.09, () => {
        const hit = i % every === 0, p = hit ? { x: t.x, y: t.y } : a.spot();
        g.spawn(new Lightning(p.x + rand(-6, 6), 70, p.x, p.y - 4, 0.25, { width: 2.5, branches: 4, glow: `rgba(${P.rgb.join(',')},0.6)`, core: P.c[0] }));
        P.mark(g, p.x, p.y, 10);
        g.spawn(new Glow(p.x, p.y, 6, 20, P.rgb, 0.2));
        if (i % 2 === 0) sfx.thunderbolt();
        if (hit) a.strike(o.frac / aimed, { knockback: 80, stagger: 0.3 });
      });
    }
  },

  // Giant cuts across the arena through the foe.
  slash(a, g, u, t, o, P) {
    const n = o.n ?? 2, L = o.big ? 560 : 420;
    for (let i = 0; i < n; i++) {
      a.later(i * 0.22, () => {
        const ang = rand(0, Math.PI) + i * 1.1, dx = (Math.cos(ang) * L) / 2, dy = (Math.sin(ang) * L) / 2;
        a.anim('Swing', 1.6);
        g.spawn(new BeamLine(t.x - dx, t.y - dy - 10, t.x + dx, t.y + dy - 10, 0.35, P.c[1], o.big ? 10 : 6));
        g.spawn(new BeamLine(t.x - dx, t.y - dy - 10, t.x + dx, t.y + dy - 10, 0.22, '#ffffff', o.big ? 4 : 2));
        g.spawn(new SlashArc(t.x, t.y, t.bodyZ, ang, { radius: 30, spread: 2.6, colors: [P.c[1], '#ffffff'], width: 7, life: 0.3 }));
        g.marks.fracture(t.x + rand(-8, 8), t.y + rand(-6, 6), o.big ? 40 : 22, 6.5);
        g.flash(0.06);
        g.shake(o.big ? 10 : 6, 0.3);
        sfx.slash();
        a.strike(o.frac / n, { knockback: o.big ? 300 : 120, stagger: 0.45 });
      });
    }
  },

  nova(a, g, u, t, o, P) {
    a.anim('Shoot', 1);
    if(skyLegend(u))g.spawn(new PressureWave(u.x,u.y,480,'air',0,isShadowLugia(u)?SHADOW_LUGIA:null));
    else {
      g.spawn(new Pillar(u.x, u.y, 0.6, P.rgb, 460));
      g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 480, life: 0.6, color: P.c[0], width: 8 }));
      g.spawn(new Ring(u.x, u.y, { r0: 6, r1: 340, life: 0.5, color: P.c[1], width: 5 }));
    }
    windBurst(g, u.x, u.y, u.bodyZ, 50, P.c);
    P.mark(g, u.x, u.y, 46);
    a.boom(9);
    a.later((u.distTo(t) / 480) * 0.6, () => {
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 40, P.rgb, 0.3));
      a.strike(o.frac, { knockback: 300 });
    });
  },

  // A marker follows the foe, then a column of energy drops on it after a delay (Future Sight, Doom Desire).
  mark(a, g, u, t, o, P) {
    const m = g.spawn(new GroundMarker(t.x, t.y, 28, P.rgb.join(',')));
    a.owned.push(m);
    a.ticks.push(() => m.set(t.x, t.y));
    sfx.zap(o.delay ?? 1);
    a.later(o.delay ?? 1, () => {
      m.dead = true;
      g.spawn(new BeamLine(t.x, t.y - 440, t.x, t.y, 0.5, P.c[1], 16));
      g.spawn(new Pillar(t.x, t.y, 0.6, P.rgb, 440));
      g.spawn(new Ring(t.x, t.y, { r0: 8, r1: 110, life: 0.5, color: '#ffffff', width: 6 }));
      if (o.style === 'star') g.spawn(new Glow(t.x, t.y, t.bodyZ, 80, [255, 240, 160], 0.5));
      P.mark(g, t.x, t.y, 34);
      g.marks.fracture(t.x, t.y, 40, 7);
      g.punch(t.x, t.y, 0.12, 0.4);
      a.boom(12);
      a.strike(o.frac, { knockback: 280, stagger: 0.6 });
    });
  },

  // Energy spirals into the foe, then implodes.
  vortex(a, g, u, t, o, P) {
    const dur = o.dur ?? 0.9;
    let left = dur;
    g.spawn(new Glow(t.x, t.y, t.bodyZ, 50, P.rgb, dur, true));
    a.ticks.push(dt => {
      if ((left -= dt) <= 0) return;
      for (let i = 0; i < 3; i++) {
        const ang = rand(0, Math.PI * 2), r = rand(50, 90), x = t.x + Math.cos(ang) * r, y = t.y + Math.sin(ang) * r * 0.6;
        g.particles.spawn({ x, y, z: rand(4, 40), vx: (t.x - x) / 0.4, vy: (t.y - y) / 0.4, life: 0.4, size: rand(2, 4), sizeEnd: 1, colors: P.c, fade: false });
      }
    });
    a.later(dur, () => {
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 70, P.rgb, 0.4));
      g.spawn(new Ring(t.x, t.y, { r0: 90, r1: 4, life: 0.25, color: P.c[0], width: 4 }));
      g.spawn(new Ring(t.x, t.y, { r0: 6, r1: 120, life: 0.45, color: P.c[1], width: 5 }));
      P.mark(g, t.x, t.y, 30);
      a.boom(10);
      a.strike(o.frac, { knockback: 200, stagger: 0.5 });
    });
  },

  // Charges straight through the foe, again and again.
  rush(a, g, u, t, o, P) {
    const passes = o.passes ?? 2;
    let cur = null;
    u.phasing = true;
    a.ticks.push(dt => {
      if (!cur) return;
      cur.t += dt;
      const k = Math.min(1, cur.t / 0.17);
      u.x = cur.from.x + (cur.to.x - cur.from.x) * k;
      u.y = cur.from.y + (cur.to.y - cur.from.y) * k;
      g.spawn(new Afterimage(u, 0.25, P.c[1]));
      if (!cur.hit && (u.distTo(t) < u.radius + t.radius + 12 || k >= 1)) {
        cur.hit = true;
        typeBurst(g, t, a.move.type);
        g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 6, r1: 60, life: 0.35, color: P.c[0], width: 5, layer: 'air' }));
        g.hitstop(0.06);
        g.shake(8, 0.3);
        a.strike(o.frac / passes, { knockback: 260, stagger: 0.5, dirX: Math.cos(cur.ang), dirY: Math.sin(cur.ang) });
      }
      if (k >= 1) cur = null;
    });
    for (let i = 0; i < passes; i++) {
      a.later(i * 0.32, () => {
        const ang = u.aimAt(t), d = u.distTo(t) + 90;
        cur = { t: 0, ang, from: { x: u.x, y: u.y }, to: { x: clampX(u.x + Math.cos(ang) * d), y: clampY(u.y + Math.sin(ang) * d) }, hit: false };
        a.anim('Attack', 2);
        g.spawn(new BeamLine(cur.from.x, cur.from.y - u.bodyZ, cur.to.x, cur.to.y - u.bodyZ, 0.35, P.c[0], 6));
        sfx.dash();
      });
    }
    a.later(passes * 0.32 + 0.1, () => { u.phasing = false; });
  },

  // Seizes the foe with a tether and slams it into the ground twice.
  throw(a, g, u, t, o, P) {
    if (!t.alive || t.hidden) return;
    a.anim('Shoot', 1);
    g.spawn(new Tether(u, t, 1.25, P.rgb));
    telekinesis(a, t, { x: t.x, y: t.y, z: 60 }, 0.35, 0, null);
    a.tk.keep = true;
    sfx.zap(0.6);
    for (const dt of [0.45, 0.85]) {
      a.later(dt, () => {
        if (!t.alive || t.hidden) return;
        sfx.whoosh();
        telekinesis(a, t, a.spot(), 0.3, 70, () => {
          g.marks.fracture(t.x, t.y, 26, 6.5);
          P.mark(g, t.x, t.y, 20);
          debris(g, t.x, t.y, 16, 140);
          g.spawn(new Ring(t.x, t.y, { r0: 6, r1: 50, life: 0.35, color: P.c[0], width: 4 }));
          g.shake(8, 0.35);
          sfx.quake();
          a.strike(o.frac / 2, { knockback: 0, stagger: 0.6 });
        });
      });
    }
  },

  quake(a, g, u, t, o, P) {
    for (let i = 0; i < 10; i++) {
      const p = a.spot();
      g.marks.fracture(p.x, p.y, rand(16, 30), 7);
      dustCloud(g, p.x, p.y, 5, 4);
    }
    g.marks.fracture(t.x, t.y, 50, 7.5);
    P.mark(g, t.x, t.y, 30);
    g.shake(14, 0.8);
    sfx.quake();
    a.strike(o.frac, { knockback: 200, stagger: 0.6 });
  },

  buff: (a, g, u, t, o) => g.buff(u, o.stat, o.mult, o.dur),
  heal: (a, g, u, t, o) => g.heal(u, u.maxHp * o.pct),
  status(a, g, u, t, o) {
    if (t.alive && !t.hidden) g.applyStatus(t, o.name, { source: u, dur: o.dur });
  },
};

// ai: how the opponent AI judges a move — 'melee' (needs contact), 'dash' (closes a gap),
// 'ranged' (between minRange and range) or 'area' (around the user, within range).
const ULT = 'Ultimate · arena-wide · can\'t be dodged';
const beam = (o) => ({ lock: 0.25, shake: 3, markStep: 18, markSize: [5, 8], stagger: 0.35, hitstop: 0.05, ...o });
const melee = (name, type, power, cooldown, tag, m, more = {}) => ({ name, type, power, cooldown, reach: 24, ai: 'melee', tag, Action: Melee,
  melee: { anim: 'Attack', fx: 'arc', lunge: 42, hits: [{ knockback: 160, hitstop: 0.05 }], ...m }, ...more });
const dash = (name, type, power, cooldown, tag, d, more = {}) => ({ name, type, power, cooldown, range: d.dist, minRange: 20, ai: 'dash', tag, Action: Dash,
  dash: { windup: 0.1, dur: 0.12, burst: 'type', knockback: 160, ...d }, ...more });
const shot = (name, type, power, cooldown, tag, sh, more = {}) => ({ name, type, power, cooldown, range: 260, minRange: 40, ai: 'ranged', tag, Action: Shot,
  shot: { sound: 'pulse', ...sh }, ...more });
const wave = (name, type, power, cooldown, tag, w, more = {}) => ({ name, type, power, cooldown, range: w.radius * 0.9, ai: 'area', tag, Action: Shockwave,
  shockwave: w, ...more });
const ringMark = rgb => (g, x, y, R) => g.marks.energy(x, y, R * 0.45, rgb, 5);
const FIRE3 = ['#fff0a0', '#ff9a3a', '#b8461c'];

const NEW_MOVES = {
  firePunch: melee('Fire Punch', 'fire', 85, 1.6, 'Punch · may burn', { fx: 'punchT', colors: ['#ff7a2a', '#fff0a0'], lunge: 40 }, { punch: true, status: ['burn', 0.2] }),
  thunderPunch: melee('Thunder Punch', 'electric', 85, 1.6, 'Punch · may paralyze', { fx: 'punchT', colors: ['#ffe066', '#ffffff'], lunge: 40 }, { punch: true, status: ['para', 0.2] }),
  icePunch: melee('Ice Punch', 'ice', 85, 1.6, 'Punch · may freeze', { fx: 'punchT', colors: ['#9be6ff', '#ffffff'], lunge: 40 }, { punch: true, status: ['freeze', 0.1] }),
  hammerArm: melee('Hammer Arm', 'fighting', 115, 2.6, 'Crushing smash · may stun', { fx: 'punchT', colors: ['#c8402c', '#ffd0b0'], lunge: 34,
    hits: [{ knockback: 240, stagger: 0.45, hitstop: 0.07 }] }, { punch: true, status: ['stun', 0.15] }),
  shadowPunch: melee('Shadow Punch', 'ghost', 70, 1.4, 'Long-reach phantom jab', { fx: 'punchT', colors: ['#7a5aa8', '#e0c8ff'], lunge: 50 }, { punch: true, reach: 32 }),
  poisonJab: melee('Poison Jab', 'poison', 80, 1.5, 'Jab · may poison', { colors: ['#a848a8', '#f0c0ff'] }, { status: ['poison', 0.3] }),
  xScissor: melee('X-Scissor', 'bug', 48, 1.5, 'Cross slash · 2 hits', { anim: 'Swing', colors: ['#88c040', '#f0ffd0'], lunge: 44,
    hits: [{ knockback: 60 }, { delay: 0.12, knockback: 160, hitstop: 0.05 }] }),
  shadowClaw: melee('Shadow Claw', 'ghost', 75, 1.3, 'Claw · high crit', { colors: ['#45346a', '#d0b8ff'], lunge: 44, critChance: 0.25 }),
  sacredSword: melee('Sacred Sword', 'fighting', 95, 1.8, 'Holy blade · wide arc', { anim: 'Swing', colors: ['#c8d8f0', '#ffffff'], lunge: 46, spread: 3,
    hits: [{ knockback: 180, hitstop: 0.06 }] }),
  aquaTail: melee('Aqua Tail', 'water', 95, 2, 'Tail swing · heavy', { anim: 'Rotate', colors: ['#3a8ae8', '#d4f1ff'], lunge: 32,
    hits: [{ knockback: 210, stagger: 0.4, hitstop: 0.06 }] }),
  playRough: melee('Play Rough', 'fairy', 45, 1.8, '3-hit brawl', { colors: ['#f080b0', '#ffe0f0'],
    hits: [{ knockback: 40 }, { delay: 0.1, knockback: 40 }, { delay: 0.2, knockback: 190, hitstop: 0.05 }] }),
  foulPlay: melee('Foul Play', 'dark', 95, 2, "Uses the foe's own attack stat", { fx: 'dark', lunge: 44, hits: [{ knockback: 170, hitstop: 0.05 }] }, { foul: true }),

  machPunch: dash('Mach Punch', 'fighting', 55, 1.1, 'Lightning-fast jab', { windup: 0.05, dist: 110, dur: 0.08, color: '#ffd8a0', ghost: '#ffb070', knockback: 140 }, { punch: true }),
  flareBlitz: dash('Flare Blitz', 'fire', 115, 2.8, 'Blazing charge · recoil', { windup: 0.16, dist: 170, dur: 0.16, color: '#ffb070', ghost: '#ff7a2a', width: 5, burst: 'fire', knockback: 240 },
    { recoil: 0.12, status: ['burn', 0.15] }),
  flameCharge: dash('Flame Charge', 'fire', 60, 1.6, 'Dash · raises speed', { dist: 150, color: '#ff9a50', ghost: '#ff7a2a', burst: 'fire', knockback: 150 }, { selfBuff: ['spd', 1.2, 3] }),
  aquaJet: dash('Aqua Jet', 'water', 55, 1.1, 'Water-propelled dash', { windup: 0.05, dist: 130, dur: 0.1, color: '#9fd8ff', ghost: '#5aa6f0', knockback: 140 }),
  suckerPunch: dash('Sucker Punch', 'dark', 75, 1.5, 'Shadowy ambush', { windup: 0.04, dist: 140, dur: 0.1, color: '#8a5aaa', ghost: '#3a2050', knockback: 150 }),
  uTurn: dash('U-turn', 'bug', 70, 1.8, 'Hit and pass through', { windup: 0.08, dist: 160, through: true, color: '#a8d848', ghost: '#7aa830', knockback: 120 }),
  shadowSneak: dash('Shadow Sneak', 'ghost', 55, 1.2, 'Shadow dash', { windup: 0.05, dist: 140, dur: 0.1, through: true, color: '#9a7ac8', ghost: '#45346a', knockback: 120 }),
  voltSwitch: dash('Volt Switch', 'electric', 70, 1.8, 'Electric pass-through', { windup: 0.08, dist: 160, through: true, color: '#fff27a', ghost: '#ffe066', burst: 'electric', knockback: 130 }),
  drillPeck: dash('Drill Peck', 'flying', 80, 1.8, 'Spinning dive', { windup: 0.12, dist: 170, dur: 0.14, color: '#e8f6ff', ghost: '#cfeaff', width: 4, knockback: 170 }),
  megahorn: dash('Megahorn', 'bug', 120, 2.8, 'Horn charge', { windup: 0.18, dist: 170, dur: 0.15, color: '#c8f080', ghost: '#88c040', width: 5, knockback: 250 }),

  fireBlast: shot('Fire Blast', 'fire', 115, 3.2, 'Huge fireball · may burn', { style: 'bigFire', sound: 'explosion' }, { status: ['burn', 0.25] }),
  waterPulse: shot('Water Pulse', 'water', 80, 1.8, 'Water orb · may stun', { style: 'water', sound: 'splash' }, { status: ['stun', 0.12] }),
  lugiaWaterPulse: {
    name:'Water Pulse',type:'water',power:95,cooldown:2.4,range:300,minRange:50,ai:'ranged',tag:'Water pulse beam',Action:BeamAttack,
    beam:beam({charge:.35,width:11,visualWidth:14,duration:.5,sound:'pulse',rings:'#b6edff',
      colors:['#3286c9','#8edbff','#effcff'],chargeColors:WATER_JET,teleColor:'90,170,255',flash:[150,220,255],mark:'wet',knockback:150}),
  },
  extrasensory: shot('Extrasensory', 'psychic', 85, 2, 'Psychic orb', { style: 'psy' }),
  psyshock: shot('Psyshock', 'psychic', 50, 2.2, 'Twin psychic orbs', { style: 'psy', spread: [-0.1, 0.1], stagger: 0.06 }),
  psychoCut: shot('Psycho Cut', 'psychic', 70, 1.4, 'Fast psychic blade · high crit', { anim: 'Swing', speed: 1, style: 'psy', sound: 'airSlash' }),
  moonblastShot: shot('Moonblast', 'fairy', 95, 2.4, 'Moonlight orb', { style: 'fairy' }),
  powerGem: shot('Power Gem', 'rock', 32, 1.8, 'Spray of 3 gems', { style: 'gem', spread: [-0.12, 0, 0.12], stagger: 0.05, sound: 'shard' }),
  hex: shot('Hex', 'ghost', 75, 1.8, '×1.6 vs foes with a status', { style: 'ghost' }, { hex: true }),
  magicalLeaf: shot('Magical Leaf', 'grass', 30, 1.4, '3 homing leaves', { style: 'leaf', spread: [-0.2, 0, 0.2], stagger: 0.05, sound: 'shard' }),
  razorLeaf: shot('Razor Leaf', 'grass', 26, 1.3, '4 leaves · high crit', { style: 'leaf', spread: [-0.18, -0.06, 0.06, 0.18], stagger: 0.04, sound: 'shard' }),

  solarBeam: {
    name: 'Solar Beam', type: 'grass', power: 150, cooldown: 6, range: 320, minRange: 80, ai: 'ranged', aiWeight: 0.7, tag: 'Sun-charged beam', Action: BeamAttack,
    beam: beam({
      charge: 0.9, lock: 0.5, width: 15, visualWidth: 20, duration: 0.5, big: true, shake: 6, sound: 'beamFire',
      colors: ['#3f9a3a', '#c8ff8a', '#ffffe8'], chargeColors: ['#ffffff', '#fff6a0', '#8ad84f'], teleColor: '180,255,100', flash: [200, 255, 150],
      mark: 'leaves', markStep: 16, knockback: 260, stagger: 0.45, hitstop: 0.08,
    }),
  },
  flashCannon: {
    name: 'Flash Cannon', type: 'steel', power: 95, cooldown: 2.4, range: 290, minRange: 50, ai: 'ranged', tag: 'Steel light beam', Action: BeamAttack,
    beam: beam({
      charge: 0.35, width: 11, visualWidth: 14, duration: 0.45, sound: 'beamFire',
      colors: ['#8f9db2', '#dfe7f2', '#ffffff'], chargeColors: ['#ffffff', '#dfe7f2', '#8f9db2'], teleColor: '200,215,235', flash: [220, 230, 245], mark: 'scorch', knockback: 150,
    }),
  },
  psybeam: {
    name: 'Psybeam', type: 'psychic', power: 80, cooldown: 2, range: 270, minRange: 40, ai: 'ranged', tag: 'Rippling beam · may stun', Action: BeamAttack, status: ['stun', 0.1],
    beam: beam({
      charge: 0.3, width: 10, visualWidth: 12, duration: 0.45, sound: 'pulse', rings: '#ffb0e0',
      colors: ['#c040a0', '#ff8ad0', '#fff0fa'], chargeColors: ['#ffffff', '#ffb0e0', '#c040a0'], teleColor: '255,120,200', flash: [255, 150, 220], mark: 'scorch', knockback: 120,
    }),
  },
  auroraBeam: {
    name: 'Aurora Beam', type: 'ice', power: 90, cooldown: 2.4, range: 270, minRange: 50, ai: 'ranged', tag: 'Rainbow beam · may slow', Action: BeamAttack, status: ['slow', 0.3],
    beam: beam({
      charge: 0.35, width: 10, visualWidth: 12, duration: 0.45, sound: 'ice', rings: '#c8ffe8',
      colors: ['#62c9d3', '#c8ffe8', '#ffffff'], chargeColors: ICE, teleColor: '150,230,230', flash: [190, 255, 240], mark: 'frost', knockback: 110,
    }),
  },

  surf: {
    name: 'Surf', type: 'water', power: 24, cooldown: 3, range: 150, minRange: 30, ai: 'ranged', tag: 'Tidal stream · may slow', Action: Stream,
    stream: {
      colors: () => WATER_JET, rate: 110, speed: [220, 270], life: [0.5, 0.6], sizeEnd: [10, 14], spread: 0.18, track: 1.2,
      duration: 0.9, tick: 0.12, width: 16, reach: 140, knockback: 50, stagger: 0.12, mark: 'wet', sound: d => sfx.hydro(d),
    },
  },
  scald: {
    name: 'Scald', type: 'water', power: 22, cooldown: 3, range: 150, minRange: 30, ai: 'ranged', tag: 'Boiling stream · may burn', Action: Stream,
    stream: {
      colors: () => ['#ffffff', '#ffe0d0', '#ffb090', '#5aa6f0'], rate: 110, speed: [230, 280], life: [0.5, 0.6], sizeEnd: [9, 13], spread: 0.14, track: 1.4,
      duration: 0.9, tick: 0.12, width: 13, reach: 140, knockback: 40, stagger: 0.1, mark: 'wet', burnChance: 0.3, sound: d => sfx.hydro(d),
    },
  },

  heatWave: wave('Heat Wave', 'fire', 90, 3, 'Scorching wave · may burn', {
    radius: 95, colors: FIRE3, rgb: [255, 150, 60], mark: (g, x, y, R) => g.marks.scorch(x, y, R * 0.45, 6), knockback: 180, sound: 'explosion',
  }, { status: ['burn', 0.25] }),
  searingShot: wave('Searing Shot', 'fire', 95, 2.6, 'Fire burst · may burn', {
    radius: 85, colors: FIRE3, rgb: [255, 150, 60], mark: (g, x, y, R) => g.marks.scorch(x, y, R * 0.4, 6), knockback: 170, sound: 'explosion',
  }, { status: ['burn', 0.3] }),
  nightDaze: wave('Night Daze', 'dark', 95, 2.8, 'Dark shockwave · may slow', {
    radius: 90, colors: ['#c8a0ff', '#6a3a8a', '#2a1838'], rgb: [110, 60, 170], mark: ringMark([110, 60, 170]), knockback: 180,
  }, { status: ['slow', 0.3] }),
  dazzlingGleam: wave('Dazzling Gleam', 'fairy', 85, 2.2, 'Sparkling burst', {
    radius: 85, colors: ['#ffffff', '#ffc8e4', '#f080b0'], rgb: [255, 170, 220], mark: ringMark([255, 160, 210]), knockback: 150,
  }),
  hyperVoice: wave('Hyper Voice', 'normal', 95, 2.6, 'Sonic blast · may stun', {
    radius: 100, colors: ['#ffffff', '#f0f0d8', '#a8a878'], rgb: [240, 240, 220], knockback: 200, sound: 'roar',
  }, { status: ['stun', 0.12] }),
  discharge: wave('Discharge', 'electric', 90, 2.6, 'Electric burst · may paralyze', {
    radius: 90, colors: ['#ffffff', '#fff27a', '#e0b000'], rgb: [255, 230, 90], mark: (g, x, y, R) => g.marks.burn(x, y, R * 0.35), knockback: 150, sound: 'thunderbolt',
  }, { status: ['para', 0.25] }),
};

const util = (name, type, cooldown, tag, u, more = {}) => ({ name, type, power: 0, cooldown, range: 999, minRange: 0, ai: 'self', tag, Action: Utility, util: u, ...more });

Object.assign(NEW_MOVES, {
  swordsDance: util('Swords Dance', 'normal', 7, 'Attack +40% for 6s', { kind: 'buff', stat: 'atk', mult: 1.4, dur: 6, anim: 'Pose' }),
  roost: util('Roost', 'flying', 9, 'Lands to heal 25% HP', { kind: 'heal', pct: 0.25, land: true }),
  recover: util('Recover', 'normal', 10, 'Heals 30% HP', { kind: 'heal', pct: 0.3 }),
  aquaRing: util('Aqua Ring', 'water', 12, 'Regenerates 1.5% HP/s for 8s', { kind: 'regen', dur: 8, rate: 0.015 }),
  quickGuard: util('Quick Guard', 'fighting', 7, 'Blocks every hit for 0.6s', { kind: 'guard', dur: 0.6, mult: 0, color: '#ffd8a0', label: 'GUARD', at: 0.02, end: 0.25 }),
  kingsShield: util("King's Shield", 'steel', 7, 'Shield Forme · blocks 80% for 1.2s · contact lowers foe attack', {
    kind: 'guard', dur: 1.2, mult: 0.2, punish: true, shieldForm: true, color: '#ffe680', label: 'KING\'S SHIELD', at: 0.02, end: 0.3,
  }),
  copy: { name: 'Copy', type: 'normal', power: 0, cooldown: 1, range: 999, minRange: 0, ai: 'self', tag: "Uses the foe's last move", copy: true },

  rapidSpin: { name: 'Rapid Spin', type: 'water', power: 30, cooldown: 3, range: 70, ai: 'area', tag: 'Spinning water spray · up to 4 hits', Action: Spin,
    spin: { dur: 0.9, drive: 70, tick: 0.2, maxHits: 4, radius: 36, knockback: 150 } },
  mudShot: shot('Mud Shot', 'ground', 60, 1.6, 'Mud ball · may slow', { style: 'mud', sound: 'splash' }, { status: ['slow', 0.5] }),
  leafStorm: shot('Leaf Storm', 'grass', 26, 5, '6 homing leaves · lowers own attack', {
    style: 'stormLeaf', spread: [-0.3, -0.18, -0.06, 0.06, 0.18, 0.3], stagger: 0.03, sound: 'shard', charge: 0.3, chargeColors: ['#ffffff', '#c8ff8a', '#3f9a3a'], glow: [140, 240, 100],
  }, { selfBuff: ['atk', 0.8, 4] }),
  triAttack: shot('Tri Attack', 'normal', 30, 2, 'Fire · ice · electric orbs', { styles: ['fire', 'ice', 'electric'], spread: [-0.12, 0, 0.12], stagger: 0.05 },
    { statusPool: [['burn', 0.2], ['freeze', 0.1], ['para', 0.2]] }),
  dragonTail: melee('Dragon Tail', 'dragon', 70, 2.4, 'Tail whip · hurls the foe away', { anim: 'Rotate', colors: ['#7a4cf2', '#e0d0ff'], lunge: 30,
    hits: [{ knockback: 260, stagger: 0.45, hitstop: 0.06 }] }, { push: 1.8 }),
  breakingSwipe: melee('Breaking Swipe', 'dragon', 70, 1.8, "Wide swipe · lowers the foe's attack", { anim: 'Swing', colors: ['#8a5cff', '#f0e0ff'], spread: 3.2, width: 7,
    hits: [{ knockback: 150, hitstop: 0.05 }] }, { debuff: ['atk', 0.85, 4] }),
});

const sig = (name, type, power, c, beats, len) => ({ name, type, power, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate, sig: { c, beats, len } });

const SIGNATURES = {
  petalBlizzard: sig('Petal Blizzard', 'grass', 270, ['#ffe0f0', '#ff7ab0', '#3f9a3a'], [[0, 'dim'], [0.1, 'vortex', { frac: 0.4 }], [1, 'pillars', { n: 10, frac: 0.6 }]]),
  hydroCannon: sig('Hydro Cannon', 'water', 280, ['#ffffff', '#5aa6f0', '#1f4cc0'],
    [[0, 'dim'], [0, 'charge'], [0.5, 'beam', { width: 22, off: -9, frac: 0.35 }], [0.62, 'beam', { width: 22, off: 9, frac: 0.35 }], [1.2, 'nova', { frac: 0.3 }]]),
  infernoOverdrive: sig('Inferno Overdrive', 'fire', 280, ['#fff0a0', '#ff7a2a', '#b8461c'], [[0, 'dim'], [0.1, 'flurry', { n: 6, frac: 0.5 }], [1, 'pillars', { n: 8, frac: 0.5 }]]),
  outrage: sig('Outrage', 'dragon', 280, ['#e0d0ff', '#8a5cff', '#3a1a90'], [[0, 'dim'], [0.1, 'rush', { passes: 4, frac: 0.65 }], [1.5, 'nova', { frac: 0.35 }]]),
  bulletBarrage: sig('Bullet Barrage', 'steel', 270, ['#ffffff', '#dfe7f2', '#c84040'], [[0, 'dim'], [0.1, 'flurry', { n: 8, frac: 0.6 }], [1.3, 'slash', { n: 1, big: true, frac: 0.4 }]]),
  calamityStrike: sig('Calamity Strike', 'dark', 280, ['#e0c8ff', '#6a3a8a', '#1a0f24'], [[0, 'dim', { alpha: 0.6 }], [0.1, 'storm', { n: 10, frac: 0.4 }], [1.2, 'slash', { n: 2, big: true, frac: 0.6 }]]),
  illusionAmbush: sig('Illusion Ambush', 'dark', 270, ['#ffb0b0', '#c03a3a', '#2a1020'], [[0, 'dim', { alpha: 0.6 }], [0.1, 'flurry', { n: 7, frac: 0.55 }], [1.1, 'vortex', { frac: 0.45, dur: 0.6 }]]),
  fairyRibbons: sig('Fairy Ribbon Storm', 'fairy', 270, ['#ffffff', '#ffb0e0', '#5ab0f0'], [[0, 'dim'], [0.1, 'throw', { frac: 0.45 }], [1.4, 'dome', { frac: 0.55 }]]),
  sheerCold: sig('Sheer Cold', 'ice', 270, ['#ffffff', '#bdf3ff', '#2b8794'],
    [[0, 'dim', { alpha: 0.35 }], [0.1, 'wave', { frac: 0.35 }], [0.9, 'spikes', { style: 'ice', frac: 0.45 }], [2, 'nova', { frac: 0.2 }], [2, 'status', { name: 'freeze', dur: 1.2 }]], 2.6),
  kingsJudgment: sig("King's Judgment", 'steel', 280, ['#ffffff', '#c8d8f0', '#45346a'], [[0, 'dim', { alpha: 0.6 }], [0.2, 'slash', { n: 3, frac: 0.55 }], [1, 'dive', { frac: 0.45 }]], 2.4),
  lunarEclipse: sig('Lunar Eclipse', 'dark', 270, ['#fff6c0', '#8a6ab8', '#14101c'], [[0, 'dim', { alpha: 0.7 }], [0.1, 'rain', { n: 12, frac: 0.5 }], [1.3, 'dome', { frac: 0.5 }]], 2.2),
  psychicPrism: sig('Psychic Prism', 'psychic', 270, ['#fff0fa', '#ff8ad0', '#7a2aa0'], [[0, 'dim'], [0.2, 'barrage', { n: 8, from: 'ring', frac: 0.5 }], [1.2, 'vortex', { frac: 0.5, dur: 0.6 }]]),

  aeroblast: sig('Aeroblast', 'flying', 290, ['#ffffff', '#c8d8ff', '#3a4ab0'], [[0, 'dim'], [0, 'charge', { dur: 0.6 }], [0.6, 'beam', { width: 36, frac: 0.75, dur: 0.7 }], [1.3, 'nova', { frac: 0.25 }]]),
  sacredFire: sig('Sacred Fire', 'fire', 290, ['#fff6c0', '#ffb040', '#d04020'],
    [[0, 'dim'], [0.1, 'pillars', { n: 14, frac: 0.45 }], [1.1, 'sky', { kind: 'light', frac: 0.55 }], [1.2, 'status', { name: 'burn' }]]),
  originPulse: sig('Origin Pulse', 'water', 290, ['#e6f6ff', '#3a8ae8', '#0a2a70'],
    [[0, 'dim'], [0.1, 'nova', { frac: 0.3 }], [0.5, 'barrage', { n: 10, from: 'user', frac: 0.4 }], [1.4, 'wave', { frac: 0.3 }]], 2.8),
  precipiceBlades: sig('Precipice Blades', 'ground', 290, ['#ffd060', '#d05020', '#5a1a08'], [[0, 'dim'], [0.1, 'spikes', { style: 'magma', frac: 0.55 }], [1.3, 'quake', { frac: 0.45 }]], 2.2),
  roarOfTime: sig('Roar of Time', 'dragon', 290, ['#e0f0ff', '#5a8ae8', '#1a2a6a'],
    [[0, 'dim', { alpha: 0.65 }], [0, 'charge', { dur: 0.6 }], [0.6, 'beam', { width: 42, frac: 0.6, dur: 0.7 }], [1.3, 'nova', { frac: 0.4 }], [1.4, 'status', { name: 'slow', dur: 3 }]]),
  spacialRend: sig('Spacial Rend', 'dragon', 290, ['#ffe0f8', '#d880c0', '#5a2a8a'], [[0, 'dim', { alpha: 0.6 }], [0.2, 'slash', { n: 4, frac: 0.75 }], [1.2, 'slash', { n: 1, big: true, frac: 0.25 }]]),
  shadowForce: sig('Shadow Force', 'ghost', 290, ['#d0b8ff', '#7a3a3a', '#140c1c'], [[0, 'dim', { alpha: 0.75 }], [0.1, 'dive', { frac: 0.7, hang: 0.7 }], [1.5, 'vortex', { frac: 0.3, dur: 0.5 }]], 2.5),
  blueFlare: sig('Blue Flare', 'fire', 290, ['#ffffff', '#6cc8ff', '#1f4cc0'],
    [[0, 'dim'], [0.1, 'vortex', { frac: 0.3, dur: 0.8 }], [1, 'pillars', { n: 6, frac: 0.7, big: 420 }], [1.6, 'status', { name: 'burn' }]], 2.4),
  boltStrike: sig('Bolt Strike', 'electric', 290, ['#ffffff', '#6aa8ff', '#1a2a6a'],
    [[0, 'dim'], [0.1, 'rush', { passes: 3, frac: 0.65 }], [1.1, 'sky', { kind: 'bolt', n: 3, frac: 0.35 }], [1.6, 'status', { name: 'para' }]]),
  geomancy: sig('Geomancy', 'fairy', 280, ['#ffffff', '#ff9ad0', '#3a6ad0'],
    [[0, 'dim'], [0.1, 'buff', { stat: 'atk', mult: 1.25, dur: 8 }], [0.25, 'buff', { stat: 'spd', mult: 1.2, dur: 8 }], [0.4, 'nova', { frac: 0.45 }], [1.1, 'dome', { frac: 0.55 }]]),
  oblivionWing: sig('Oblivion Wing', 'flying', 280, ['#ffb0b0', '#c02040', '#200810'],
    [[0, 'dim', { alpha: 0.65 }], [0, 'charge'], [0.5, 'beam', { width: 30, frac: 0.8 }], [0.6, 'heal', { pct: 0.15 }], [1.2, 'storm', { n: 6, frac: 0.2 }]], 2.2),
  sunsteelStrike: sig('Sunsteel Strike', 'steel', 290, ['#fff6c0', '#ffb040', '#8a4a10'], [[0, 'dim'], [0.1, 'dive', { frac: 0.8, height: 320 }], [1.3, 'nova', { frac: 0.2 }]], 2.2),
  moongeistBeam: sig('Moongeist Beam', 'ghost', 290, ['#ffffff', '#c890ff', '#2a1a6a'], [[0, 'dim', { alpha: 0.65 }], [0, 'charge', { dur: 0.6 }], [0.6, 'beam', { width: 34, frac: 0.8, dur: 0.7 }], [1.3, 'dome', { frac: 0.2 }]]),
  behemothBlade: sig('Behemoth Blade', 'steel', 290, ['#ffffff', '#ffd060', '#3a6ad0'], [[0, 'dim'], [0.2, 'slash', { n: 1, big: true, frac: 0.55 }], [0.7, 'rush', { passes: 2, frac: 0.45 }]]),
  behemothBash: sig('Behemoth Bash', 'steel', 290, ['#ffffff', '#ff8a60', '#8a2a2a'], [[0, 'dim'], [0.2, 'rush', { passes: 3, frac: 0.7 }], [1.3, 'nova', { frac: 0.3 }]]),
  dynamaxCannon: sig('Dynamax Cannon', 'dragon', 290, ['#ffd0e0', '#ff3a6a', '#4a0a2a'],
    [[0, 'dim', { alpha: 0.7 }], [0, 'charge', { dur: 0.7 }], [0.7, 'beam', { width: 48, frac: 0.8, dur: 0.8 }], [1.3, 'pillars', { n: 10, frac: 0.2 }]], 2.4),
  collisionCourse: sig('Collision Course', 'fighting', 290, ['#fff0a0', '#ff5a3a', '#6a1a1a'], [[0, 'dim'], [0.1, 'rush', { passes: 2, frac: 0.5 }], [0.9, 'dive', { frac: 0.5 }]], 2.3),
  thunderousSkies: sig('Thunderous Skies', 'electric', 280, ['#ffffff', '#fff27a', '#2a3a70'],
    [[0, 'dim', { alpha: 0.6 }], [0.1, 'storm', { n: 16, frac: 0.65 }], [1.7, 'sky', { kind: 'bolt', frac: 0.35 }], [1.8, 'status', { name: 'para' }]], 2.3),
  skyInferno: sig('Sky Inferno', 'fire', 280, ['#fff0a0', '#ff7a2a', '#b8461c'], [[0, 'dim'], [0.1, 'rain', { n: 16, frac: 0.6 }], [1.3, 'pillars', { n: 6, frac: 0.4 }]], 2.4),
  voltFangStorm: sig('Volt Fang Storm', 'electric', 280, ['#ffffff', '#ffe066', '#6a3aa0'], [[0, 'dim'], [0.1, 'flurry', { n: 6, frac: 0.6 }], [1, 'storm', { n: 8, frac: 0.4 }]], 2.2),
  eruption: sig('Eruption', 'fire', 290, ['#ffd060', '#ff5a1a', '#5a1a08'], [[0, 'dim'], [0.1, 'quake', { frac: 0.3 }], [0.4, 'pillars', { n: 18, frac: 0.7, finals: 2 }]], 2.4),
  auroraTide: sig('Aurora Tide', 'water', 280, ['#ffffff', '#9fe8ff', '#4a5ad0'], [[0, 'dim'], [0.2, 'wave', { frac: 0.5 }], [1.2, 'beam', { width: 24, frac: 0.5 }]]),
  regiRockfall: sig('Regi Rockfall', 'rock', 280, ['#e8dcc0', '#b8a070', '#5a5040'], [[0, 'dim'], [0.1, 'rain', { style: 'rock', n: 18, frac: 0.6 }], [1.4, 'quake', { frac: 0.4 }]], 2.3),
  absoluteZero: sig('Absolute Zero', 'ice', 280, ['#ffffff', '#9be6ff', '#1a5a8a'],
    [[0, 'dim', { alpha: 0.4 }], [0.1, 'spikes', { style: 'ice', frac: 0.5 }], [1.3, 'nova', { frac: 0.5 }], [1.4, 'status', { name: 'freeze', dur: 1.2 }]], 2.1),
  ironFortress: sig('Iron Fortress', 'steel', 280, ['#ffffff', '#a3b1c4', '#3a4458'],
    [[0, 'dim'], [0.1, 'buff', { stat: 'def', mult: 1.3, dur: 8 }], [0.3, 'dive', { frac: 0.7, height: 300 }], [1.5, 'nova', { frac: 0.3 }]], 2.4),
  mistBall: sig('Mist Ball', 'psychic', 280, ['#ffffff', '#ffb0e0', '#a04aa0'],
    [[0, 'dim'], [0.2, 'barrage', { n: 8, from: 'user', frac: 0.5 }], [1.2, 'dome', { frac: 0.5 }], [1.3, 'status', { name: 'slow', dur: 3 }]]),
  lusterPurge: sig('Luster Purge', 'psychic', 280, ['#ffffff', '#8fb0ff', '#2a3a90'], [[0, 'dim'], [0, 'charge', { dur: 0.6 }], [0.6, 'beam', { width: 32, frac: 0.8, dur: 0.7 }], [1.3, 'nova', { frac: 0.2 }]]),
  thunderCage: sig('Thunder Cage', 'electric', 290, ['#ffffff', '#fff27a', '#2a6a3a'],
    [[0, 'dim'], [0.1, 'vortex', { frac: 0.25, dur: 0.9 }], [0.3, 'sky', { kind: 'bolt', n: 4, frac: 0.35 }], [1.2, 'nova', { frac: 0.4 }], [1.3, 'status', { name: 'para' }]]),
  dragonEnergy: sig('Dragon Energy', 'dragon', 290, ['#ffe8d0', '#ff7a3a', '#5a1a3a'], [[0, 'dim', { alpha: 0.6 }], [0, 'charge', { dur: 0.7 }], [0.7, 'beam', { width: 46, frac: 0.85, dur: 0.8 }], [1.4, 'nova', { frac: 0.15 }]]),

  psychicGenesis: sig('Genesis Psychic', 'psychic', 280, ['#ffffff', '#ffb0e0', '#c060ff'],
    [[0, 'dim'], [0.1, 'throw', { frac: 0.5 }], [1.5, 'barrage', { n: 7, from: 'ring', frac: 0.3 }], [2.2, 'dome', { frac: 0.2 }]], 3),
  futureSight: sig('Future Sight', 'psychic', 280, ['#ffffff', '#ff8ad0', '#3a8a3a'], [[0, 'dim'], [0.1, 'mark', { delay: 1.2, frac: 0.7 }], [0.3, 'barrage', { n: 5, from: 'ring', frac: 0.3 }]], 2.2),
  doomDesire: sig('Doom Desire', 'steel', 280, ['#ffffff', '#fff6a0', '#3a5ab0'], [[0, 'dim'], [0.1, 'rain', { style: 'star', n: 10, frac: 0.4 }], [0.2, 'mark', { delay: 1.3, style: 'star', frac: 0.6 }]], 2.4),
  psychoBoost: sig('Psycho Boost', 'psychic', 290, ['#ffffff', '#ff8a6a', '#5a2a8a'],
    [[0, 'dim', { alpha: 0.6 }], [0, 'charge', { dur: 0.6 }], [0.6, 'barrage', { n: 1, big: true, from: 'user', frac: 0.8 }], [1.5, 'nova', { frac: 0.2 }]], 2.2),
  darkVoid: sig('Dark Void', 'dark', 280, ['#d0b8ff', '#4a2a6a', '#05030a'],
    [[0, 'dim', { alpha: 0.8 }], [0.1, 'vortex', { frac: 0.5, dur: 1 }], [1.15, 'status', { name: 'sleep', dur: 1.8 }], [1.2, 'storm', { n: 6, frac: 0.5 }]], 2.2),
  seedFlare: sig('Seed Flare', 'grass', 290, ['#ffffff', '#c8ff8a', '#3f9a3a'], [[0, 'dim'], [0, 'charge', { dur: 0.6 }], [0.6, 'nova', { frac: 0.6 }], [1, 'pillars', { n: 12, frac: 0.4 }]], 2.2),
  judgment: sig('Judgment', 'normal', 290, ['#ffffff', '#fff2b0', '#c8a040'], [[0, 'dim', { alpha: 0.55 }], [0.2, 'rain', { n: 20, frac: 0.7 }], [1.7, 'sky', { kind: 'light', frac: 0.3 }]], 2.4),
  vCreate: sig('V-create', 'fire', 290, ['#fff0a0', '#ff5a1a', '#8a1a08'], [[0, 'dim'], [0.1, 'rush', { passes: 1, frac: 0.4 }], [0.6, 'slash', { n: 2, frac: 0.3 }], [1.1, 'pillars', { n: 4, frac: 0.3 }]]),
  secretSword: sig('Secret Sword', 'fighting', 280, ['#ffffff', '#9fd8ff', '#2a5aa8'], [[0, 'dim'], [0.2, 'slash', { n: 3, frac: 0.7 }], [1.1, 'wave', { frac: 0.3 }]], 2.4),
  technoBlast: sig('Techno Blast', 'normal', 280, ['#ffffff', '#c8a0ff', '#4a3a8a'], [[0, 'dim'], [0, 'charge'], [0.5, 'beam', { width: 30, frac: 0.7 }], [1, 'barrage', { n: 6, frac: 0.3 }]]),
  diamondStorm: sig('Diamond Storm', 'rock', 280, ['#ffffff', '#ffc0e0', '#c0508a'],
    [[0, 'dim'], [0.1, 'buff', { stat: 'def', mult: 1.3, dur: 6 }], [0.1, 'spikes', { style: 'crystal', frac: 0.5 }], [1.1, 'rain', { style: 'crystal', n: 12, frac: 0.5 }]], 2.4),
  hyperspaceFury: sig('Hyperspace Fury', 'dark', 290, ['#ffe0a0', '#c060ff', '#2a1050'],
    [[0, 'dim', { alpha: 0.6 }], [0.1, 'vortex', { frac: 0.2, dur: 0.6 }], [0.5, 'barrage', { n: 10, from: 'ring', frac: 0.55 }], [1.7, 'nova', { frac: 0.25 }]], 2.4),
  steamEruption: sig('Steam Eruption', 'water', 290, ['#ffffff', '#ffd0c0', '#5aa6f0'],
    [[0, 'dim'], [0.1, 'pillars', { n: 16, frac: 0.6 }], [1.2, 'beam', { width: 26, frac: 0.4 }], [1.3, 'status', { name: 'burn' }]]),
  soulStealing: sig('Soul-Stealing 7-Star Strike', 'ghost', 290, ['#d0ffe0', '#3a8a5a', '#0a1a10'], [[0, 'dim', { alpha: 0.75 }], [0.1, 'flurry', { n: 7, frac: 0.6 }], [1.2, 'dive', { frac: 0.4 }]], 2.6),
  plasmaFists: sig('Plasma Fists', 'electric', 280, ['#ffffff', '#ffe066', '#3a8ae8'],
    [[0, 'dim'], [0.1, 'flurry', { n: 6, frac: 0.6 }], [1, 'sky', { kind: 'bolt', n: 3, frac: 0.4 }], [1.5, 'status', { name: 'para' }]]),
  razorwindExecution: sig('Razorwind Execution', 'bug', 280, ['#ffffff', '#a8d848', '#2a3a10'],
    [[0, 'dim'], [0.1, 'flurry', { n: 8, frac: 0.55 }], [1.2, 'slash', { n: 3, frac: 0.45 }]], 2.1),
  psychicBladeDance: sig('Psychic Blade Dance', 'psychic', 280, ['#ffffff', '#ff8ad0', '#2a8a5a'],
    [[0, 'dim'], [0.1, 'slash', { n: 2, frac: 0.3 }], [0.6, 'flurry', { n: 6, frac: 0.4 }], [1.5, 'slash', { n: 1, big: true, frac: 0.3 }]], 2.2),
  celestialRadiance: sig('Celestial Radiance', 'fairy', 280, ['#ffffff', '#fff2b0', '#f080b0'],
    [[0, 'dim'], [0.1, 'rain', { style: 'star', n: 14, frac: 0.4 }], [1.1, 'dome', { frac: 0.35 }], [1.5, 'sky', { kind: 'light', frac: 0.25 }]], 2.2),
  tidalEarthquake: sig('Tidal Earthquake', 'ground', 285, ['#e6f6ff', '#5aa6f0', '#6a4a20'],
    [[0, 'dim'], [0.1, 'quake', { frac: 0.35 }], [0.4, 'wave', { frac: 0.4 }], [1.4, 'spikes', { style: 'stone', frac: 0.25 }]], 2.8),
  frozenShadowBarrage: sig('Frozen Shadow Barrage', 'ice', 280, ['#ffffff', '#9be6ff', '#2a1838'],
    [[0, 'dim', { alpha: 0.6 }], [0.1, 'flurry', { n: 7, frac: 0.5 }], [1, 'spikes', { style: 'ice', frac: 0.3 }], [2.1, 'nova', { frac: 0.2 }], [2.1, 'status', { name: 'freeze', dur: 1 }]], 2.6),
  infernoSkyDive: sig('Inferno Sky Dive', 'fire', 285, ['#fff0a0', '#ff7a2a', '#8a1a08'],
    [[0, 'dim'], [0.1, 'rain', { n: 10, frac: 0.3 }], [0.5, 'dive', { frac: 0.5, height: 360 }], [1.4, 'pillars', { n: 4, frac: 0.2 }]], 2.3),
  psychicCataclysm: sig('Psychic Cataclysm', 'psychic', 285, ['#ffffff', '#ffb0e0', '#a04aa0'],
    [[0, 'dim', { alpha: 0.6 }], [0.1, 'throw', { frac: 0.35 }], [1.4, 'barrage', { n: 8, from: 'ring', frac: 0.35 }], [2.3, 'dome', { frac: 0.3 }]], 3),
  sereneTidalTempest: sig('Serene Tidal Tempest', 'water', 280, ['#ffffff', '#9fe8ff', '#f080b0'],
    [[0, 'dim'], [0.1, 'vortex', { frac: 0.25, dur: 0.7 }], [0.9, 'wave', { frac: 0.45 }], [1, 'heal', { pct: 0.12 }], [1.8, 'nova', { frac: 0.3 }], [1.9, 'status', { name: 'slow', dur: 3 }]], 2.4),
  dragonAxeCataclysm: sig('Dragon Axe Cataclysm', 'dragon', 290, ['#fff0a0', '#c8a030', '#3a2a10'],
    [[0, 'dim', { alpha: 0.6 }], [0.1, 'rush', { passes: 2, frac: 0.3 }], [0.8, 'slash', { n: 2, big: true, frac: 0.45 }], [1.4, 'quake', { frac: 0.25 }]], 2.2),
  triDragonAnnihilation: sig('Tri-Dragon Annihilation', 'dark', 290, ['#e0c8ff', '#6a3a8a', '#1a0a30'],
    [[0, 'dim', { alpha: 0.65 }], [0, 'charge', { dur: 0.6 }], [0.6, 'beam', { width: 22, off: -12, frac: 0.25 }], [0.72, 'beam', { width: 22, frac: 0.25 }],
      [0.84, 'beam', { width: 22, off: 12, frac: 0.25 }], [1.4, 'nova', { frac: 0.25 }]]),
  digitalDistortion: sig('Digital Distortion', 'normal', 285, ['#ffffff', '#ff5ac8', '#3a6ad0'],
    [[0, 'dim', { alpha: 0.6 }], [0.1, 'barrage', { n: 9, frac: 0.4 }], [1, 'sky', { kind: 'bolt', n: 3, frac: 0.3 }], [1.5, 'vortex', { frac: 0.3, dur: 0.5 }], [2.1, 'status', { name: 'para' }]], 2.6),
  malignantChain: sig('Malignant Chain', 'poison', 280, ['#ffe0ff', '#c060d0', '#3a0a3a'],
    [[0, 'dim', { alpha: 0.65 }], [0.1, 'throw', { frac: 0.5 }], [1.4, 'vortex', { frac: 0.5, dur: 0.6 }], [2, 'status', { name: 'poison', dur: 7 }]], 2.6),

  // Generic ultimates for Kanto Pokémon without a signature of their own.
  gigaImpact: sig('Giga Impact', 'normal', 270, ['#ffffff', '#e8dcc0', '#8a7a5a'], [[0, 'dim'], [0.1, 'rush', { passes: 3, frac: 0.6 }], [1.3, 'nova', { frac: 0.4 }]]),
  dynamicPunch: sig('Dynamic Punch', 'fighting', 270, ['#fff0d0', '#e0763a', '#7a2a10'], [[0, 'dim'], [0.1, 'flurry', { n: 6, frac: 0.55 }], [1.2, 'slash', { n: 1, big: true, frac: 0.45 }]]),
  gunkShot: sig('Gunk Shot', 'poison', 270, ['#f0d0ff', '#a040c0', '#3a0a40'], [[0, 'dim', { alpha: 0.6 }], [0.1, 'rain', { n: 12, frac: 0.6 }], [1.3, 'vortex', { frac: 0.4, dur: 0.5 }], [1.9, 'status', { name: 'poison', dur: 6 }]], 2.4),
  fissure: sig('Fissure', 'ground', 270, ['#fff0c8', '#c8a050', '#5a4020'], [[0, 'dim'], [0.1, 'quake', { frac: 0.3 }], [1, 'pillars', { n: 8, frac: 0.5 }], [1.6, 'quake', { frac: 0.2 }]]),
  skyAttack: sig('Sky Attack', 'flying', 270, ['#ffffff', '#ffe6a0', '#e08a3a'], [[0, 'dim'], [0.1, 'dive', { frac: 0.7, hang: 0.7 }], [1.6, 'nova', { frac: 0.3 }]]),
  bugBuzz: sig('Bug Buzz', 'bug', 260, ['#f4ffd0', '#a8d040', '#4a6010'], [[0, 'dim'], [0.2, 'barrage', { n: 10, from: 'ring', frac: 0.55 }], [1.3, 'wave', { frac: 0.45 }]]),
};


export const MOVES = {
  // ── Regular moves ─────────────────────────────────────────────────────────────
  flamethrower: {
    name: 'Flamethrower', type: 'fire', power: 22, cooldown: 3.2, range: 150, minRange: 40, ai: 'ranged', tag: 'Stream · burns the ground', Action: Stream,
    stream: {
      colors: flameColors, rate: 120, speed: [250, 300], life: [0.5, 0.62], sizeEnd: [10, 14], spread: 0.12, track: 1.5,
      duration: 1.0, tick: 0.12, width: 12, reach: 140, knockback: 35, stagger: 0.1, mark: 'scorch', burnChance: 0.1,
      sound: d => sfx.flamethrower(d),
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
  ironHead: {
    name: 'Iron Head', type: 'steel', power: 100, cooldown: 2, reach: 24, ai: 'melee', tag: 'Melee · may flinch', Action: Melee,
    melee: { anim: 'Attack', fx: 'tail', lunge: 40, hits: [{ knockback: 200, stagger: 0.4, hitstop: 0.06 }] },
  },
  zenHeadbutt: {
    name: 'Zen Headbutt', type: 'psychic', power: 90, cooldown: 1.8, reach: 24, ai: 'melee', tag: 'Melee · psychic ram', Action: Melee,
    melee: { anim: 'Attack', fx: 'psy', lunge: 44, hits: [{ knockback: 180, hitstop: 0.05 }] },
  },
  crunch: {
    name: 'Crunch', type: 'dark', power: 85, cooldown: 1.8, reach: 22, ai: 'melee', tag: 'Melee · bite', Action: Melee,
    melee: { anim: 'Attack', fx: 'bite', lunge: 36, hits: [{ knockback: 120, stagger: 0.35, hitstop: 0.05 }] },
  },
  closeCombat: {
    name: 'Close Combat', type: 'fighting', power: 42, cooldown: 2.2, reach: 22, ai: 'melee', tag: 'Melee · 3-hit flurry', Action: Melee,
    melee: { anim: 'Attack', fx: 'punch', lunge: 40, hits: [{ knockback: 40 }, { delay: 0.1, knockback: 40 }, { delay: 0.2, knockback: 210, hitstop: 0.05 }] },
  },
  nightSlash: {
    name: 'Night Slash', type: 'dark', power: 80, cooldown: 1.4, reach: 24, ai: 'melee', tag: 'Melee · high crit', Action: Melee,
    melee: { anim: 'Swing', fx: 'dark', lunge: 46, critChance: 0.3, hits: [{ knockback: 140, hitstop: 0.05 }] },
  },
  blazeKick: {
    name: 'Blaze Kick', type: 'fire', power: 90, cooldown: 1.6, reach: 24, ai: 'melee', tag: 'Melee · may burn', Action: Melee,
    melee: { anim: 'Attack', fx: 'fireKick', lunge: 44, hits: [{ knockback: 170, hitstop: 0.05 }] },
  },
  bodySlam: {
    name: 'Body Slam', type: 'normal', power: 105, cooldown: 2.6, range: 110, radius: 30, minRange: 0, ai: 'area', tag: 'Leap & crush', Action: Slam,
    slam: { windup: 0.12, dur: 0.38, height: 40, crater: 22 },
  },
  airSlash: {
    name: 'Air Slash', type: 'flying', power: 80, cooldown: 1.6, range: 270, minRange: 40, ai: 'ranged', tag: 'Projectile · may flinch', Action: Shot,
    shot: { anim: 'Swing', speed: 0.8, sound: 'airSlash' },
  },
  energyBall: {
    name: 'Energy Ball', type: 'grass', power: 85, cooldown: 2.2, range: 260, minRange: 50, ai: 'ranged', tag: 'Energy orb', Action: Shot,
    shot: { style: 'grass', sound: 'pulse' },
  },
  auraSphere: {
    name: 'Aura Sphere', type: 'fighting', power: 85, cooldown: 2, range: 270, minRange: 40, ai: 'ranged', tag: 'Aura orb', Action: Shot,
    shot: { style: 'aura', sound: 'pulse' },
  },
  shadowBall: {
    name: 'Shadow Ball', type: 'ghost', power: 85, cooldown: 2, range: 260, minRange: 40, ai: 'ranged', tag: 'Shadow orb', Action: Shot,
    shot: { style: 'ghost', sound: 'pulse' },
  },
  sludgeBomb: {
    name: 'Sludge Bomb', type: 'poison', power: 85, cooldown: 2.2, range: 240, minRange: 40, ai: 'ranged', tag: 'Toxic glob', Action: Shot,
    shot: { style: 'poison', sound: 'splash' },
  },
  swift: {
    name: 'Swift', type: 'normal', power: 30, cooldown: 1.6, range: 250, minRange: 30, ai: 'ranged', tag: '3 homing stars', Action: Shot,
    shot: { style: 'star', spread: [-0.16, 0, 0.16], stagger: 0.05, sound: 'shard' },
  },
  iceShard: {
    name: 'Ice Shard', type: 'ice', power: 30, cooldown: 1.4, range: 240, minRange: 30, ai: 'ranged', tag: 'Fast · 3 shards', Action: Shot,
    shot: { anim: 'Attack', speed: 1.2, style: 'ice', spread: [-0.14, 0, 0.14], stagger: 0.05, sound: 'shard' },
  },
  dragonPulse: {
    name: 'Dragon Pulse', type: 'dragon', power: 95, cooldown: 2.4, range: 300, minRange: 50, ai: 'ranged', tag: 'Pulse beam', Action: BeamAttack,
    beam: beam({
      charge: 0.35, width: 11, visualWidth: 14, duration: 0.5, sound: 'pulse', rings: '#9fe0ff',
      colors: ['#5a3fd0', '#9d7cff', '#eef6ff'], chargeColors: ['#ffffff', '#c8b8ff', '#7a5cff'], teleColor: '150,110,255', flash: [170, 130, 255],
      mark: 'dragon', knockback: 150,
    }),
  },
  darkPulse: {
    name: 'Dark Pulse', type: 'dark', power: 90, cooldown: 2.4, range: 280, minRange: 50, ai: 'ranged', tag: 'Dark wave beam', Action: BeamAttack,
    beam: beam({
      charge: 0.35, width: 11, visualWidth: 14, duration: 0.5, sound: 'pulse', rings: '#c8a0ff',
      colors: ['#2a1838', '#6a3a8a', '#e0c8ff'], chargeColors: ['#ffffff', '#b890e0', '#4a2a6a'], teleColor: '120,60,170', flash: [140, 80, 200],
      mark: 'scorch', knockback: 140,
    }),
  },
  iceBeam: {
    name: 'Ice Beam', type: 'ice', power: 120, cooldown: 4, range: 260, minRange: 50, ai: 'ranged', tag: 'Beam · frost trail, may freeze', Action: BeamAttack,
    beam: beam({
      charge: 0.4, lock: 0.3, width: 9, visualWidth: 8, duration: 0.45, sound: 'ice', markStep: 16, markSize: [6, 9],
      colors: ['#5cc3e6', '#bdf3ff', '#ffffff'], chargeColors: ICE, teleColor: '120,220,255', flash: [170, 235, 255],
      mark: 'frost', knockback: 80, freezeChance: 0.2,
    }),
  },
  hyperBeam: {
    name: 'Hyper Beam', type: 'normal', power: 210, cooldown: 10, range: 330, minRange: 90, ai: 'ranged', aiWeight: 0.6, tag: 'Huge beam · must recharge', Action: BeamAttack,
    beam: beam({
      charge: 0.95, lock: 0.6, width: 16, visualWidth: 22, duration: 0.5, big: true, recharge: 1.3, shake: 7, sound: 'beamFire',
      colors: ['#ff7b2e', '#ffd36b', '#fffbe8'], chargeColors: ['#ffffff', '#ffe08a', '#ff9a3c'], teleColor: '255,96,48', flash: [255, 200, 120],
      mark: 'scorch', markStep: 14, markSize: [4, 6], knockback: 300, stagger: 0.5, hitstop: 0.1,
    }),
  },
  psychic: {
    name: 'Psychic', type: 'psychic', power: 110, cooldown: 3.2, range: 220, minRange: 0, ai: 'ranged', tag: 'Seize & slam · step out of the ring', Action: PsychicThrow,
  },
  quickAttack: {
    name: 'Quick Attack', type: 'normal', power: 60, cooldown: 1.5, range: 130, minRange: 30, ai: 'dash', tag: 'Dash strike', Action: Dash,
    dash: { windup: 0.08, dist: 130, dur: 0.16, color: '#ffffff', ghost: '#ffffff', knockback: 160 },
  },
  voltTackle: {
    name: 'Volt Tackle', type: 'electric', power: 95, cooldown: 2.4, range: 150, minRange: 30, ai: 'dash', tag: 'Electric charge', Action: Dash,
    dash: { windup: 0.12, dist: 150, dur: 0.15, color: '#fff27a', ghost: '#ffe066', width: 4, burst: 'electric', knockback: 210 },
  },
  extremeSpeed: {
    name: 'Extreme Speed', type: 'normal', power: 55, cooldown: 3.2, range: 160, minRange: 30, ai: 'dash', tag: 'Double dash · 2 hits', Action: Dash,
    dash: { windup: 0.12, dist: 170, dur: 0.1, through: true, passes: 2, gap: 0.1, color: '#d8fff0', ghost: '#9fffd6', width: 4, knockback: 140 },
  },
  aerialAce: {
    name: 'Aerial Ace', type: 'flying', power: 75, cooldown: 2, range: 170, minRange: 20, ai: 'dash', tag: 'Homing slash · never misses', Action: Dash,
    dash: { windup: 0.15, dist: 180, dur: 0.18, sure: true, slash: true, color: '#e8f6ff', ghost: '#cfeaff', knockback: 120 },
  },
  braveBird: {
    name: 'Brave Bird', type: 'flying', power: 105, cooldown: 2.6, range: 170, minRange: 30, ai: 'dash', tag: 'Flaming dive', Action: Dash,
    dash: { windup: 0.16, dist: 170, dur: 0.16, color: '#ffb070', ghost: '#ff9a50', width: 4, burst: 'fire', knockback: 230 },
  },
  dragonRush: {
    name: 'Dragon Rush', type: 'dragon', power: 100, cooldown: 2.6, range: 170, minRange: 30, ai: 'dash', tag: 'Charging rush', Action: Dash,
    dash: { windup: 0.15, dist: 170, dur: 0.16, color: '#b89cff', ghost: '#8a6cff', width: 4, burst: 'dragon', knockback: 240 },
  },
  bulletPunch: {
    name: 'Bullet Punch', type: 'steel', power: 55, cooldown: 1.2, range: 120, minRange: 20, ai: 'dash', tag: 'Lightning-fast jab', Action: Dash,
    dash: { windup: 0.05, dist: 120, dur: 0.09, color: '#dfe7f2', ghost: '#c8d2e0', burst: 'steel', knockback: 140 },
  },
  earthquake: {
    name: 'Earthquake', type: 'ground', power: 150, cooldown: 6, range: 85, radius: 90, ai: 'area', tag: 'Area · fractures ground', Action: Earthquake,
  },
  rockSlide: {
    name: 'Rock Slide', type: 'rock', power: 55, cooldown: 3, range: 240, minRange: 40, ai: 'ranged', tag: 'Falling boulders', Action: MeteorRain,
    rain: { delay: 0.25, count: 3, gap: 0.12, fall: 0.4, spread: 30, radius: 18, crater: 14, style: 'rock', markRgb: '200,180,120', colors: ['#d8d0c0', '#8a8070', '#5a5048'] },
  },
  thunderbolt: {
    name: 'Thunderbolt', type: 'electric', power: 95, cooldown: 1.8, range: 210, minRange: 40, ai: 'ranged', tag: 'Instant bolt', Action: Thunderbolt,
  },
  waterfall: {
    name: 'Waterfall', type: 'water', power: 100, cooldown: 2.8, reach: 24, ai: 'melee', tag: 'Surging lunge', Action: Waterfall,
  },
  iceFang: {
    name: 'Ice Fang', type: 'ice', power: 76, cooldown: 2.4, reach: 20, ai: 'melee', tag: 'Bite · may freeze', Action: IceFang,
  },

  ...NEW_MOVES,

  // ── Signature ultimates (R / 5) ─────────────────────────────────────────────────
  ...SIGNATURES,
  blastBurn: { name: 'Blast Burn', type: 'fire', power: 280, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  thunder: { name: 'Thunder', type: 'electric', power: 270, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  dragonAscent: {
    name: 'Dragon Ascent', type: 'flying', power: 290, cooldown: 30, range: 300, minRange: 60, radius: 50, ai: 'ranged', ultimate: true, tag: ULT, Action: DragonAscent,
  },
  hydroPump: { name: 'Hydro Pump', type: 'water', power: 260, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  frenzyPlant: { name: 'Frenzy Plant', type: 'grass', power: 270, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  blizzard: { name: 'Blizzard', type: 'ice', power: 260, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  auraStorm: { name: 'Aura Storm', type: 'fighting', power: 270, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  waterShurikenBarrage: { name: 'Water Shuriken Barrage', type: 'water', power: 260, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  dracoMeteor: { name: 'Draco Meteor', type: 'dragon', power: 280, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  shadowBallBarrage: { name: 'Shadow Ball Barrage', type: 'ghost', power: 260, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  blazeKickOverdrive: { name: 'Blaze Kick Overdrive', type: 'fire', power: 270, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  psystrike: { name: 'Psystrike', type: 'psychic', power: 320, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  meteorMash: { name: 'Meteor Mash', type: 'steel', power: 270, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  stoneEdge: { name: 'Stone Edge', type: 'rock', power: 270, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  extremeEvoboost: { name: 'Extreme Evoboost', type: 'normal', power: 240, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  gmaxSlam: { name: 'G-Max Slam', type: 'normal', power: 300, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
  moonblast: { name: 'Moonblast', type: 'fairy', power: 270, cooldown: 30, ultimate: true, tag: ULT, Action: Ultimate },
};
for (const [id, m] of Object.entries(MOVES)) m.id = id;

// Faster pace: every regular move recovers 30% sooner (ultimates charge a meter instead).
for (const m of Object.values(MOVES)) if (!m.ultimate && m.cooldown) m.cooldown = Math.max(0.6, Math.round(m.cooldown * 7) / 10);

// Physical moves hit up close and knock harder; special moves work at range; status moves don't attack.
for (const m of Object.values(MOVES)) {
  m.cat = m.util || m.copy ? 'status' : m.shot || m.beam || m.stream || m.shockwave || m.ultimate || ['thunderbolt', 'psychic'].includes(m.id) ? 'special' : 'physical';
}
// Moves that send the foe flying upward (start of an aerial combo), with launch speed.
const LAUNCH = {
  aerialAce: 230, ironTail: 220, aquaTail: 200, hammerArm: 240, dragonTail: 160, breakingSwipe: 170, sacredSword: 200, blazeKick: 190, extremeSpeed: 180,
  megahorn: 240, waterfall: 260, closeCombat: 150, playRough: 150, xScissor: 170, ironHead: 180, zenHeadbutt: 170, bodySlam: 200, earthquake: 230, voltTackle: 200,
  flareBlitz: 220, dragonRush: 220, drillPeck: 190, braveBird: 200, uTurn: 160, firePunch: 170, thunderPunch: 170, icePunch: 170, shadowPunch: 150,
};
for (const [id, v] of Object.entries(LAUNCH)) MOVES[id].launch = v;
// Moves that can follow a juggled foe into the air.
for (const id of ['aerialAce', 'braveBird', 'drillPeck', 'uTurn', 'extremeSpeed', 'quickAttack', 'xScissor', 'shadowSneak', 'machPunch', 'aquaJet', 'voltSwitch', 'suckerPunch']) MOVES[id].aerial = true;
// Slicing moves (Gallade's Sharpness).
for (const id of ['psychoCut', 'sacredSword', 'leafBlade', 'nightSlash', 'xScissor', 'aerialAce', 'shadowClaw', 'airSlash', 'dragonClaw']) MOVES[id].slice = true;
// Moves that drag the foe toward the user instead of pushing it away.
for (const id of ['psychoCut', 'shadowSneak', 'hex']) MOVES[id].pull = true;

// Hold-to-charge moves: up to +60% power, bigger projectiles and beams, and a shorter wind-up on release.
const CHARGEABLE = ['hyperBeam', 'solarBeam', 'dragonPulse', 'lugiaWaterPulse', 'darkPulse', 'iceBeam', 'flashCannon', 'psybeam', 'auroraBeam', 'auraSphere', 'shadowBall',
  'energyBall', 'sludgeBomb', 'moonblastShot', 'waterPulse', 'fireBlast', 'extrasensory', 'psyshock', 'powerGem', 'hex', 'discharge', 'hyperVoice',
  'dazzlingGleam', 'nightDaze', 'heatWave', 'searingShot'];
for (const id of CHARGEABLE) MOVES[id].chargeable = true;

export function chargedMove(m, lvl) {
  if (!lvl) return m;
  const c = { ...m, chargeLevel: lvl, power: Math.round(m.power * (1 + 0.6 * lvl)), range: m.range && Math.round(m.range * (1 + 0.15 * lvl)) };
  if (m.beam) {
    c.beam = { ...m.beam, charge: m.beam.charge * (1 - 0.7 * lvl), width: m.beam.width * (1 + 0.4 * lvl), visualWidth: m.beam.visualWidth * (1 + 0.6 * lvl),
      knockback: m.beam.knockback * (1 + 0.3 * lvl) };
  }
  if (m.shockwave) c.shockwave = { ...m.shockwave, radius: m.shockwave.radius * (1 + 0.35 * lvl), windup: 0.08 };
  return c;
}
