// Choreography for the legendary signature ultimates, batch 1: the box legends (Ho-Oh, Kyogre, Groudon, Dialga,
// Palkia, Giratina, Reshiram, Zekrom, Xerneas, Yveltal).
//
// Same rules as ult-choreo.js: wind-up, build-up, climax, aftermath; damage through `a.strike(frac)` with the
// shares adding up to 1; and each keeps the mechanics its old beat script had (Sacred Fire and Blue Flare burn,
// Bolt Strike paralyzes, Roar of Time slows, Geomancy raises Attack and Speed, Oblivion Wing heals).
import {
  Effect, rand, FIRE, FIRE_BLUE, Glow, Ring, Pillar, Spike, Missile, Beam, BeamLine, PsyDome, ScreenDim, Afterimage, EnergyAura,
  GroundMarker, Lightning, TidalWave, RainbowStreak, Ripple, dustCloud, debris, windBurst, electricBurst, waterSplash,
} from './effects.js';
import { sfx } from './audio.js';
import { clampX, clampY, inward, spray, crater, charge, through } from './ult-choreo.js';

const alive = t => t.alive && !t.hidden;
const status = (g, u, t, name, dur) => { if (alive(t)) g.applyStatus(t, name, { source: u, dur }); };

// A clock face on the ground: twelve ticks and two sweeping hands (Roar of Time).
export class ClockFace extends Effect {
  constructor(x, y, r, life, color = '#bfe0ff', speed = 1) {
    super('ground', life);
    Object.assign(this, { x, y, r, color, speed });
  }

  draw(ctx) {
    const t = this.age / this.life, a = Math.min(1, this.age / 0.15) * (t > 0.75 ? (1 - t) / 0.25 : 1);
    const r = this.r * (0.85 + 0.15 * Math.min(1, this.age / 0.3)), k = 0.72;
    ctx.save();
    ctx.globalAlpha = 0.85 * a;
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, r, r * k, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, r * 0.86, r * 0.86 * k, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang) * k, k0 = i % 3 ? 0.88 : 0.78;
      ctx.beginPath();
      ctx.moveTo(this.x + c * r * k0, this.y + s * r * k0);
      ctx.lineTo(this.x + c * r * 0.98, this.y + s * r * 0.98);
      ctx.stroke();
    }
    for (const [len, sp, w] of [[0.5, 1.5, 3], [0.8, 14, 2]]) {
      const ang = this.age * sp * this.speed - Math.PI / 2;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(ang) * r * len, this.y + Math.sin(ang) * r * len * k);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// A tear in space: a jagged slit of void with glowing edges that opens, holds and snaps shut (Spacial Rend).
export class SpaceRift extends Effect {
  constructor(x, y, z, len, ang, life, rgb = [216, 128, 192]) {
    super('air', life);
    Object.assign(this, { x, y, z, len, ang, rgb });
    this.jag = Array.from({ length: 11 }, () => rand(0.5, 1.4));
  }

  draw(ctx) {
    const t = this.age / this.life, open = t < 0.3 ? t / 0.3 : t > 0.75 ? (1 - t) / 0.25 : 1;
    if (open <= 0) return;
    const L = this.len, n = this.jag.length, w = 12 * open, [R, G, B] = this.rgb;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      pts.push([-L / 2 + L * k, Math.sin(k * Math.PI) * w * this.jag[i]]);
    }
    ctx.save();
    ctx.translate(this.x, this.y - this.z);
    ctx.rotate(this.ang);
    ctx.beginPath();
    pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, -y));
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1] * 0.8);
    ctx.closePath();
    ctx.fillStyle = 'rgba(18,6,30,0.92)';
    ctx.fill();
    ctx.strokeStyle = `rgba(${R},${G},${B},0.9)`;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
}

export const LEGEND_ULTS = {
  // Sacred Fire (Ho-Oh): rainbow light fans out from its wings, sacred flames spiral in on the foe one after
  // another, and a column of rainbow fire comes down from the sky. Burns.
  sacredFire(a, g, u, t) {
    const GOLD = [255, 190, 80], HOT = [255, 220, 120];
    g.spawn(new ScreenDim(2.5, 0.5, '40,16,4'));
    g.spawn(new EnergyAura(u, 1, true, { glow: GOLD, rings: ['#fff6c0', '#ff7a2a'] }));
    sfx.megaCharge();
    for (let i = 0; i < 7; i++) {
      a.later(i * 0.08, () => {
        const ang = Math.PI + (i / 6) * Math.PI;
        g.spawn(new RainbowStreak(u.x, u.y - u.bodyZ, u.x + Math.cos(ang) * 110, u.y - u.bodyZ + Math.sin(ang) * 70, 0.6));
      });
    }
    let gather = 0.6;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(110, dt, FIRE, 46); });
    a.later(0.6, () => {
      windBurst(g, u.x, u.y, u.bodyZ, 30, FIRE);
      g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 140, life: 0.4, color: '#ffd060', width: 5 }));
      a.anim('Shoot', 1);
      sfx.whoosh();
    });
    // Twelve pillars of sacred flame spiral in; the last three land on the foe.
    for (let i = 0; i < 12; i++) {
      a.later(0.7 + i * 0.06, () => {
        const ang = i * 0.95, r = 150 * (1 - i / 12) + 6;
        const x = clampX(t.x + Math.cos(ang) * r), y = clampY(t.y + Math.sin(ang) * r * 0.7);
        a.erupt(x, y, FIRE, HOT, 160);
        g.marks.scorch(x, y, rand(10, 14), 6);
        if (i % 3 === 0) g.spawn(new RainbowStreak(x, y, x, y - 90, 0.35));
        if (i % 2 === 0) sfx.flamethrower(0.3);
        if (i >= 9) a.strike(0.15, { knockback: 60, stagger: 0.3 });
      });
    }
    // The column from the sky.
    a.later(1.55, () => {
      g.spawn(new BeamLine(t.x, t.y - 480, t.x, t.y, 0.55, '#ffb040', 24));
      g.spawn(new BeamLine(t.x, t.y - 480, t.x, t.y, 0.4, '#ffffff', 8));
      g.spawn(new Pillar(t.x, t.y, 0.7, HOT, 480));
      for (let k = -2; k <= 2; k++) g.spawn(new RainbowStreak(t.x + k * 9, t.y, t.x + k * 9, t.y - 300, 0.6));
      spray(g, t.x, t.y, 6, 30, FIRE, { speed: 140, up: 300, grav: 380 });
      g.flash(0.12);
      crater(a, g, t.x, t.y, { r: 50, rgb: GOLD, ring: '#fff6c0', mark: (x, y, r) => g.marks.scorch(x, y, r, 7) });
      a.strike(0.55, { knockback: 280, stagger: 0.6 });
    });
    a.later(1.75, () => status(g, u, t, 'burn'));
    a.end(2.5);
  },

  // Origin Pulse (Kyogre): rain pours as its markings glow, a pulse of ocean power rings out, a fan of blue
  // beams converges on the foe, and a tidal wave sweeps the arena.
  originPulse(a, g, u, t) {
    const BLUE = [70, 150, 250], C = ['#e6f6ff', '#3a8ae8', '#0a2a70'];
    g.spawn(new ScreenDim(2.8, 0.6, '4,14,40'));
    g.spawn(new EnergyAura(u, 1.6, true, { glow: BLUE, rings: ['#bfe6ff', '#3a8ae8'] }));
    let rain = 2.4;
    a.ticks.push(dt => {
      if ((rain -= dt) <= 0) return;
      for (let i = 0; i < 5; i++) g.particles.spawn({ x: rand(0, 380), y: rand(60, 640), z: rand(160, 240), vx: -60, vz: -520, life: 0.4, size: 1.5, colors: ['#bfe6ff', '#8ac8ff'], fade: false });
    });
    for (let i = 0; i < 5; i++) a.later(i * 0.14, () => g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 60 + i * 12, life: 0.4, color: '#8ac8ff', width: 2 })));
    sfx.hydro(0.7);
    let gather = 0.7;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(110, dt, C, 50); });
    // The pulse.
    a.later(0.7, () => {
      g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 480, life: 0.6, color: '#ffffff', width: 8 }));
      g.spawn(new Ring(u.x, u.y, { r0: 6, r1: 340, life: 0.5, color: '#3a8ae8', width: 5 }));
      waterSplash(g, u.x, u.y);
      g.marks.wet(u.x, u.y, 40);
      a.anim('Shoot', 1);
      a.boom(8);
      a.later((u.distTo(t) / 480) * 0.6, () => {
        g.spawn(new Ripple(t, '#bfe6ff'));
        a.strike(0.25, { knockback: 120, stagger: 0.3 });
      });
    });
    // Ten beams fan out from around Kyogre and converge on the foe.
    for (let i = 0; i < 10; i++) {
      a.later(0.95 + i * 0.07, () => {
        const base = u.aimAt(t) + Math.PI, ang = base + (i - 4.5) * 0.28, r = 42;
        const x0 = u.x + Math.cos(ang) * r, y0 = u.y + Math.sin(ang) * r * 0.7 - u.bodyZ;
        g.spawn(new Glow(x0, y0 + u.bodyZ, u.bodyZ, 12, BLUE, 0.2));
        g.spawn(new Beam(x0, y0, t.x + rand(-6, 6), t.y - t.bodyZ, 0.3, { width: 7, colors: [C[2], C[1], '#ffffff'] }));
        g.marks.wet(t.x + rand(-14, 14), t.y + rand(-8, 8), rand(8, 12));
        g.spawn(new Ripple(t, '#e6f6ff'));
        if (i % 2 === 0) sfx.pulse();
        a.strike(0.04, { knockback: 30, stagger: 0.25 });
      });
    }
    // The tidal wave.
    a.later(1.8, () => {
      const down = t.y > u.y, y0 = down ? 60 : 640, y1 = down ? 640 : 60, dur = 0.9;
      const w = g.spawn(new TidalWave(y0, y1, dur, BLUE, true));
      a.ticks.push(() => {
        if (w.age >= w.life) return;
        for (let i = 0; i < 4; i++) g.particles.spawn({ x: rand(0, 360), y: w.y, z: rand(0, 14), vx: rand(-20, 20), vy: (down ? 1 : -1) * rand(40, 90), vz: rand(40, 120), gz: 300, life: 0.45, size: rand(2, 4), colors: C });
        if (Math.random() < 0.3) g.marks.wet(rand(20, 340), w.y, rand(8, 14));
      });
      sfx.hydro(dur);
      a.later((Math.abs(t.y - y0) / 580) * dur, () => {
        waterSplash(g, t.x, t.y);
        g.shake(8, 0.4);
        sfx.splash();
        a.strike(0.35, { dirX: 0, dirY: down ? 1 : -1, knockback: 300, stagger: 0.5 });
      });
    });
    a.end(2.8);
  },

  // Precipice Blades (Groudon): its markings glow, it stamps, three lines of magma blades race across the arena
  // through the foe, then a ring of blades erupts around it.
  precipiceBlades(a, g, u, t) {
    const MAGMA = [255, 110, 40], C = ['#ffd060', '#d05020', '#5a1a08'];
    g.spawn(new ScreenDim(2.4, 0.55, '40,10,2'));
    g.spawn(new EnergyAura(u, 0.6, false, { glow: MAGMA, rings: ['#ffd060', '#d05020'] }));
    let heat = 2;
    a.ticks.push(dt => {
      if ((heat -= dt) <= 0 || Math.random() > 0.6) return;
      g.particles.spawn({ x: rand(10, 350), y: rand(80, 620), z: 2, vz: rand(30, 70), life: 0.7, size: rand(1.5, 3), colors: FIRE });
    });
    for (let i = 0; i < 4; i++) a.later(i * 0.09, () => g.marks.scorch(u.x + rand(-24, 24), u.y + rand(-12, 12), 8, 6));
    a.later(0.4, () => {
      a.anim('Attack', 1);
      g.marks.fracture(u.x, u.y, 34, 7);
      g.spawn(new Ring(u.x, u.y, { r0: 8, r1: 110, life: 0.4, color: '#ffd060', width: 5 }));
      dustCloud(g, u.x, u.y, 12, 6);
      g.shake(10, 0.4);
      sfx.quake();
    });
    // Three lines of blades race out; the middle one runs through the foe.
    a.later(0.5, () => {
      const aim = u.aimAt(t), d = u.distTo(t) + 60, steps = Math.max(6, Math.round(d / 24));
      [-0.28, 0, 0.28].forEach(off => {
        const ang = aim + off;
        for (let i = 1; i <= steps; i++) {
          a.later(i * 0.045, () => {
            const k = i / steps, x = clampX(u.x + Math.cos(ang) * d * k), y = clampY(u.y + Math.sin(ang) * d * k);
            g.spawn(new Spike(x, y, 'magma', 0.8));
            g.marks.scorch(x, y, 8, 6);
            if (i % 2 === 0) dustCloud(g, x, y, 2, 4);
            if (i % 3 === 0) g.shake(2, 0.06);
            if (i === steps) {
              if (off === 0) debris(g, t.x, t.y, 12, 140);
              sfx.quake();
              a.strike(off === 0 ? 0.25 : 0.15, { knockback: 80, stagger: 0.45 });
            }
          });
        }
      });
    });
    // The ring of blades.
    a.later(1.45, () => {
      for (let k = 0; k < 10; k++) {
        const ang = (k / 10) * Math.PI * 2;
        a.later(k * 0.02, () => g.spawn(new Spike(t.x + Math.cos(ang) * 40, t.y + Math.sin(ang) * 28, 'magma', 1)));
      }
      for (let k = 0; k < 4; k++) g.spawn(new Spike(t.x + rand(-10, 10), t.y + rand(-6, 6), 'magma', 1.1));
      a.erupt(t.x, t.y, FIRE, MAGMA, 300);
      spray(g, t.x, t.y, 4, 24, FIRE, { speed: 120, up: 280, grav: 400 });
      crater(a, g, t.x, t.y, { r: 56, rgb: MAGMA, ring: '#ffd060', mark: (x, y, r) => g.marks.scorch(x, y, r, 7), shake: 15 });
      sfx.quake();
      a.strike(0.45, { knockback: 260, stagger: 0.7 });
    });
    a.end(2.3);
  },

  // Roar of Time (Dialga): a clock face spreads over the arena, time folds in on the diamond in its chest, the roar
  // freezes the moment in a flash, and a beam of distorted time tears through the foe. Slows.
  roarOfTime(a, g, u, t) {
    const STEEL = [120, 170, 255], C = ['#e0f0ff', '#5a8ae8', '#1a2a6a'];
    g.spawn(new ScreenDim(2.7, 0.65, '6,12,36'));
    g.spawn(new ClockFace(180, 350, 170, 2.5, 'rgba(170,205,255,0.55)', 0.6));
    g.spawn(new ClockFace(u.x, u.y, 60, 1.2, '#bfe0ff', 1.5));
    g.spawn(new Glow(u.x, u.y, u.bodyZ, 22, [220, 240, 255], 0.7, true));
    sfx.roar();
    let gather = 0.7;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(120, dt, C, 50); });
    for (let i = 0; i < 6; i++) a.later(i * 0.11, () => g.spawn(new Ring(u.x, u.y, { r0: 130, r1: 8, life: 0.3, color: C[i % 2], width: 2 })));
    sfx.beamCharge(0.7);
    // Time stops, then the beam.
    a.later(0.7, () => {
      g.flash(0.2);
      g.hitstop(0.07);
      const ang = u.aimAt(t), m = a.mouth(), x1 = u.x + Math.cos(ang) * 720, y1 = u.y + Math.sin(ang) * 720;
      a.anim('Shoot', 1);
      g.spawn(new Beam(m.x, m.y - m.z, x1, y1 - 10, 0.8, { width: 42, colors: [C[2], C[1], '#ffffff'] }));
      for (let d = 50; d < 700; d += 45) {
        const x = u.x + Math.cos(ang) * d, y = u.y + Math.sin(ang) * d;
        if (x < 0 || x > 360 || y < 60 || y > 640) break;
        a.later(d / 1400, () => g.spawn(new Ring(x, y, { z: 12, r0: 6, r1: 40, life: 0.4, color: '#e0f0ff', width: 3, layer: 'air' })));
        g.marks.energy(x + rand(-6, 6), y + rand(-6, 6), rand(6, 10), STEEL, 6);
      }
      g.shake(10, 0.6);
      sfx.beamFire();
      a.later(0.05, () => {
        g.spawn(new Ripple(t, '#e0f0ff'));
        a.strike(0.6, { knockback: 260, stagger: 0.5, dirX: Math.cos(ang), dirY: Math.sin(ang) });
      });
    });
    // Time snaps back around the foe.
    a.later(1.5, () => g.spawn(new ClockFace(t.x, t.y, 60, 0.6, '#ffffff', 5)));
    a.later(1.75, () => {
      for (let i = 0; i < 3; i++) g.spawn(new Ring(t.x, t.y, { r0: 70, r1: 4, life: 0.2 + i * 0.05, color: C[i % 2], width: 3 }));
      crater(a, g, t.x, t.y, { r: 44, rgb: STEEL, ring: '#e0f0ff', mark: (x, y, r) => g.marks.energy(x, y, r, STEEL, 6) });
      a.strike(0.4, { knockback: 260, stagger: 0.6 });
    });
    a.later(1.85, () => status(g, u, t, 'slow', 3));
    a.end(2.6);
  },

  // Spacial Rend (Palkia): its pearls flare, space ripples around the foe, four tears rip open across it, and one
  // vast rend splits the arena and snaps shut.
  spacialRend(a, g, u, t) {
    const PEARL = [230, 140, 210], C = ['#ffe0f8', '#d880c0', '#5a2a8a'];
    g.spawn(new ScreenDim(2.5, 0.6, '24,6,30'));
    for (const s of [-1, 1]) g.spawn(new Glow(u.x + s * 12, u.y, u.bodyZ + 4, 18, PEARL, 0.6, true));
    let gather = 0.5;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(100, dt, C, 44); });
    sfx.beamCharge(0.5);
    for (let i = 0; i < 4; i++) a.later(0.1 + i * 0.1, () => g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 26, r1: 64, life: 0.3, color: C[i % 2], width: 2, layer: 'air' })));
    // Four tears.
    for (let i = 0; i < 4; i++) {
      a.later(0.55 + i * 0.17, () => {
        const ang = i * 0.8 + 0.3;
        a.anim(i % 2 ? 'Attack' : 'Swing', 2);
        g.spawn(new SpaceRift(t.x, t.y, t.bodyZ, 220, ang, 0.55, PEARL));
        g.spawn(new BeamLine(t.x - Math.cos(ang) * 110, t.y - t.bodyZ - Math.sin(ang) * 110, t.x + Math.cos(ang) * 110, t.y - t.bodyZ + Math.sin(ang) * 110, 0.15, '#ffffff', 3));
        spray(g, t.x, t.y, t.bodyZ, 12, ['#ffffff', '#ffe0f8', '#d880c0'], { speed: 140, up: 90, size: [2, 4], life: [0.3, 0.5] });
        g.shake(5, 0.12);
        sfx.slash();
        a.strike(0.1875, { knockback: 60, stagger: 0.35 });
      });
    }
    // The great rend.
    a.later(1.35, () => {
      g.spawn(new SpaceRift(t.x, t.y, t.bodyZ, 520, 1.35, 0.65, PEARL));
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 60, PEARL, 0.5, true));
      g.shake(6, 0.5);
      sfx.zap(0.4);
    });
    a.later(1.8, () => {
      g.flash(0.15);
      g.spawn(new BeamLine(t.x - Math.cos(1.35) * 260, t.y - t.bodyZ - Math.sin(1.35) * 260, t.x + Math.cos(1.35) * 260, t.y - t.bodyZ + Math.sin(1.35) * 260, 0.3, '#ffffff', 6));
      crater(a, g, t.x, t.y, { r: 44, rgb: PEARL, ring: '#ffe0f8', mark: (x, y, r) => g.marks.energy(x, y, r, PEARL, 6) });
      a.strike(0.25, { knockback: 300, stagger: 0.6 });
    });
    a.end(2.4);
  },

  // Shadow Force (Giratina): a portal opens under it and it sinks into the Distortion World, a second portal
  // stalks the foe, and Giratina bursts out of it from below.
  shadowForce(a, g, u, t) {
    const SHADOW = [140, 40, 70], C = ['#d0b8ff', '#7a3a3a', '#140c1c'];
    g.spawn(new ScreenDim(2.6, 0.75, '10,4,12'));
    const home = g.spawn(new GroundMarker(u.x, u.y, 40, '60,10,30'));
    a.owned.push(home);
    let wisps = 0.5;
    a.ticks.push(dt => {
      if ((wisps -= dt) <= 0) return;
      for (let i = 0; i < 2; i++) g.particles.spawn({ x: u.x + rand(-30, 30), y: u.y + rand(-12, 12), z: 0, vz: rand(40, 100), life: 0.5, size: rand(3, 6), sizeEnd: 1, colors: ['#7a3a3a', '#2a1020', '#140c1c'] });
    });
    sfx.zap(0.5);
    // It sinks out of sight.
    a.later(0.4, () => {
      for (let i = 0; i < 3; i++) g.spawn(new Afterimage(u, 0.25 + i * 0.1, '#7a3a3a'));
      spray(g, u.x, u.y, u.bodyZ, 18, ['#2a1020', '#7a3a3a'], { speed: 50, up: 80, grav: -40, size: [4, 8] });
      Object.assign(u, { invuln: true, phasing: true, vanished: true });
      sfx.whoosh();
    });
    a.later(0.65, () => { home.dead = true; });
    // The portal hunts the foe.
    let portal = null;
    a.later(0.6, () => {
      portal = g.spawn(new GroundMarker(t.x, t.y, 34, '120,30,60'));
      a.owned.push(portal);
      a.ticks.push(() => {
        if (portal.dead) return;
        portal.set(t.x, t.y);
        if (Math.random() < 0.5) {
          const ang = rand(0, Math.PI * 2);
          g.particles.spawn({ x: t.x + Math.cos(ang) * 34, y: t.y + Math.sin(ang) * 24, z: 0, vx: -Math.sin(ang) * 40, vy: Math.cos(ang) * 30, vz: rand(30, 80), life: 0.4, size: rand(2, 4), colors: ['#d0b8ff', '#7a3a3a'] });
        }
      });
      sfx.zap(0.7);
    });
    a.later(1.0, () => g.shake(4, 0.3));
    // It bursts out from below.
    a.later(1.35, () => {
      portal.dead = true;
      Object.assign(u, { x: t.x, y: t.y, vanished: false, zOverride: 0 });
      u.face(t.x, t.y + 1);
      a.anim('Attack', 1.5);
      let k = 0;
      a.ticks.push(dt => {
        if (k >= 1) return;
        k = Math.min(1, k + dt / 0.35);
        u.zOverride = 80 * Math.sin(k * Math.PI);
        g.spawn(new Afterimage(u, 0.25, '#7a3a3a'));
        if (k >= 1) Object.assign(u, { zOverride: null, invuln: false, phasing: false });
      });
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        g.spawn(new BeamLine(t.x, t.y, t.x + Math.cos(ang) * 70, t.y + Math.sin(ang) * 40 - 60, 0.4, i % 2 ? '#7a3a3a' : '#2a1020', 5));
      }
      crater(a, g, t.x, t.y, { r: 46, rgb: SHADOW, ring: '#d0b8ff', mark: (x, y, r) => g.marks.energy(x, y, r, SHADOW, 6), stop: 0.12 });
      sfx.roar();
      a.strike(0.7, { knockback: 200, stagger: 0.7 });
    });
    // The shadows close back in.
    a.later(1.85, () => {
      let left = 0.3;
      a.ticks.push(dt => { if ((left -= dt) > 0) inward(g, t.x, t.y, t.bodyZ, 4, 80, ['#140c1c', '#7a3a3a', '#d0b8ff']); });
    });
    a.later(2.15, () => {
      g.spawn(new Ring(t.x, t.y, { r0: 80, r1: 4, life: 0.25, color: '#d0b8ff', width: 4 }));
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 50, SHADOW, 0.35));
      g.shake(6, 0.3);
      a.strike(0.3, { knockback: 160, stagger: 0.4 });
    });
    a.end(2.5);
  },

  // Blue Flare (Reshiram): its tail turbine spins up a ring of blue fire, it looses a volley of blue fireballs,
  // the flames coil around the foe, and a blue-white inferno erupts. Burns.
  blueFlare(a, g, u, t) {
    const BLUE = [110, 190, 255], WHITE = [220, 240, 255];
    g.spawn(new ScreenDim(2.4, 0.55, '4,12,36'));
    g.spawn(new Glow(u.x, u.y, u.bodyZ, 50, BLUE, 0.6, true));
    let spin = 0.6;
    a.ticks.push(dt => {
      if ((spin -= dt) <= 0) return;
      const k = a.t * 10;
      for (let i = 0; i < 3; i++) {
        const ang = k + (i / 3) * Math.PI * 2;
        g.particles.spawn({ x: u.x + Math.cos(ang) * 30, y: u.y + Math.sin(ang) * 14, z: u.bodyZ, vz: rand(10, 40), life: 0.35, size: rand(3, 5), sizeEnd: 1, colors: FIRE_BLUE });
      }
    });
    sfx.beamCharge(0.6);
    // A volley of blue fireballs.
    for (let i = 0; i < 6; i++) {
      a.later(0.6 + i * 0.07, () => {
        const m = a.mouth(), off = (i - 2.5) * 10;
        a.anim('Shoot', 2);
        g.spawn(new Missile(m.x, m.y, t.x + off, t.y, Math.max(20, m.z), 0.3, 'flame', () => {
          spray(g, t.x + off, t.y, t.bodyZ, 6, FIRE_BLUE, { speed: 70, up: 80 });
          g.marks.scorch(t.x + off, t.y + rand(-6, 6), 8, 6);
          a.strike(0.05, { knockback: 40, stagger: 0.25 });
        }, BLUE, 1.4));
        sfx.whoosh();
      });
    }
    // The flames coil around the foe.
    a.later(1.05, () => {
      let left = 0.4;
      a.ticks.push(dt => { if ((left -= dt) > 0) inward(g, t.x, t.y, t.bodyZ, 5, 80, FIRE_BLUE); });
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 50, BLUE, 0.45, true));
      sfx.flamethrower(0.3);
    });
    // The inferno.
    a.later(1.5, () => {
      g.spawn(new Pillar(t.x, t.y, 0.8, BLUE, 540));
      g.spawn(new Pillar(t.x, t.y, 0.6, WHITE, 400));
      a.erupt(t.x, t.y, FIRE_BLUE, BLUE, 300);
      spray(g, t.x, t.y, 6, 34, FIRE_BLUE, { speed: 150, up: 320, grav: 380, size: [3, 6] });
      crater(a, g, t.x, t.y, { r: 50, rgb: BLUE, ring: '#e6f6ff', mark: (x, y, r) => g.marks.scorch(x, y, r, 7), shake: 14 });
      a.strike(0.7, { knockback: 290, stagger: 0.6 });
    });
    a.later(1.7, () => status(g, u, t, 'burn'));
    a.end(2.4);
  },

  // Bolt Strike (Zekrom): its tail generator crackles, it rams the foe three times wrapped in black lightning, and
  // three great bolts come down on it. Paralyzes.
  boltStrike(a, g, u, t) {
    const VOLT = [110, 170, 255], C = ['#ffffff', '#6aa8ff', '#1a2a6a'];
    g.spawn(new ScreenDim(2.6, 0.6, '4,8,30'));
    g.spawn(new EnergyAura(u, 1.6, true, { glow: VOLT, rings: ['#ffffff', '#3a6ad0'] }));
    for (let i = 0; i < 8; i++) {
      a.later(i * 0.06, () => {
        const a0 = rand(0, Math.PI * 2), a1 = a0 + rand(1, 2.5);
        g.spawn(new Lightning(u.x + Math.cos(a0) * 26, u.y - u.bodyZ + Math.sin(a0) * 20, u.x + Math.cos(a1) * 26, u.y - u.bodyZ + Math.sin(a1) * 20, 0.15, { width: 1.5, branches: 1, glow: 'rgba(110,170,255,0.6)' }));
        if (i % 3 === 0) sfx.thunderbolt();
      });
    }
    // Three charges, back and forth through the foe.
    for (let i = 0; i < 3; i++) {
      a.later(0.5 + i * 0.33, () => {
        const p = through(u, t, 80);
        a.anim('Attack', 2);
        sfx.dash();
        charge(a, g, u, t, p, 0.16, i % 2 ? '#3a6ad0' : '#6aa8ff', () => {
          g.spawn(new Lightning(t.x, t.y - t.bodyZ - 30, t.x, t.y, 0.2, { width: 3, branches: 3, glow: 'rgba(110,170,255,0.7)' }));
          electricBurst(g, t.x, t.y, t.bodyZ, 16);
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 6, r1: 70, life: 0.3, color: C[i % 2], width: 5, layer: 'air' }));
          g.marks.burn(t.x, t.y, 14);
          g.hitstop(0.05);
          g.shake(8, 0.25);
          a.strike(0.2, { knockback: 160, stagger: 0.45, dirX: Math.cos(p.ang), dirY: Math.sin(p.ang) });
        }, '#bfe0ff');
      });
    }
    // Three bolts from the sky.
    for (let i = 0; i < 3; i++) {
      a.later(1.6 + i * 0.14, () => {
        g.spawn(new Lightning(t.x + rand(-5, 5), 60, t.x, t.y - 4, 0.4, { width: 5, branches: 7, glow: 'rgba(110,170,255,0.7)' }));
        electricBurst(g, t.x, t.y, 6, 20);
        g.marks.burn(t.x, t.y, 22);
        g.marks.fracture(t.x, t.y, 26, 6.5);
        g.flash(0.1);
        g.shake(9, 0.4);
        sfx.thunder();
        a.strike(0.4 / 3, { knockback: 160, stagger: 0.5 });
      });
    }
    a.later(2.05, () => {
      g.spawn(new Ring(t.x, t.y, { r0: 8, r1: 300, life: 0.5, color: '#bfe0ff', width: 5 }));
      status(g, u, t, 'para');
    });
    a.end(2.5);
  },

  // Geomancy (Xerneas): lights of every colour rise out of the land into its antlers, raising its Attack and Speed;
  // a rainbow burst rings out, and a dome of fairy light closes over the foe.
  geomancy(a, g, u, t) {
    const PINK = [255, 150, 210], LIGHTS = ['#ff8ad0', '#8ad0ff', '#ffe066', '#a0ff9a', '#ffffff'];
    g.spawn(new ScreenDim(2.6, 0.5, '14,10,36'));
    for (const s of [-1, 1]) {
      g.spawn(new RainbowStreak(u.x + s * 6, u.y - u.headZ, u.x + s * 34, u.y - u.headZ - 36, 1));
      g.spawn(new RainbowStreak(u.x + s * 18, u.y - u.headZ - 16, u.x + s * 40, u.y - u.headZ - 14, 1));
    }
    let draw = 0.8;
    a.ticks.push(dt => {
      if ((draw -= dt) <= 0) return;
      for (let i = 0; i < 4; i++) {
        const x = rand(10, 350), y = rand(80, 620), life = 0.6;
        g.particles.spawn({ x, y, z: 0, vx: (u.x - x) / life, vy: (u.y - y) / life, vz: u.bodyZ / life, life, size: rand(2, 4), sizeEnd: 1.5, colors: [LIGHTS[i % 5]], fade: false });
      }
    });
    sfx.megaCharge();
    a.later(0.2, () => g.buff(u, 'atk', 1.25, 8));
    a.later(0.4, () => g.buff(u, 'spd', 1.2, 8));
    // The burst.
    a.later(0.85, () => {
      a.anim('Shoot', 1);
      for (let i = 0; i < 4; i++) g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 480 - i * 60, life: 0.6, color: LIGHTS[i], width: 7 - i }));
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        g.spawn(new RainbowStreak(u.x, u.y - u.bodyZ, u.x + Math.cos(ang) * 120, u.y - u.bodyZ + Math.sin(ang) * 80, 0.45));
      }
      g.marks.energy(u.x, u.y, 44, PINK, 6);
      a.boom(9);
      a.later((u.distTo(t) / 480) * 0.6, () => {
        g.spawn(new Glow(t.x, t.y, t.bodyZ, 40, PINK, 0.3));
        a.strike(0.45, { knockback: 220, stagger: 0.4 });
      });
    });
    // The dome.
    a.later(1.5, () => {
      g.spawn(new PsyDome(t.x, t.y, 90, 0.8, PINK));
      for (let i = 0; i < 5; i++) g.spawn(new RainbowStreak(t.x - 40 + i * 20, t.y, t.x - 40 + i * 20, t.y - 120, 0.5));
      sfx.zap(0.3);
    });
    a.later(1.85, () => {
      spray(g, t.x, t.y, t.bodyZ, 30, LIGHTS, { speed: 150, up: 200, size: [2, 4] });
      crater(a, g, t.x, t.y, { r: 46, rgb: PINK, ring: '#ffffff', mark: (x, y, r) => g.marks.energy(x, y, r, PINK, 6) });
      a.strike(0.55, { knockback: 280, stagger: 0.6 });
    });
    a.end(2.5);
  },

  // Oblivion Wing (Yveltal): it spreads its wings in a crimson X, fires a beam of destruction, drains the foe's life
  // back into itself (heals 15%), and red lightning finishes it.
  oblivionWing(a, g, u, t) {
    const RED = [210, 40, 70], C = ['#ffb0b0', '#c02040', '#200810'];
    g.spawn(new ScreenDim(2.3, 0.65, '30,4,10'));
    for (const s of [-1, 1]) {
      g.spawn(new BeamLine(u.x, u.y - u.bodyZ, u.x + s * 70, u.y - u.bodyZ - 46, 0.7, '#c02040', 9));
      g.spawn(new BeamLine(u.x, u.y - u.bodyZ, u.x + s * 54, u.y - u.bodyZ + 30, 0.7, '#7a1020', 6));
    }
    let fall = 0.6;
    a.ticks.push(dt => {
      if ((fall -= dt) <= 0 || Math.random() > 0.5) return;
      g.particles.spawn({ x: u.x + rand(-60, 60), y: u.y + rand(-10, 10), z: u.bodyZ + rand(10, 50), vx: rand(-10, 10), vz: -rand(20, 50), life: 0.8, size: rand(2, 4), colors: ['#200810', '#c02040'] });
    });
    let gather = 0.5;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(110, dt, C, 44); });
    sfx.beamCharge(0.5);
    // The beam.
    a.later(0.5, () => {
      const ang = u.aimAt(t), m = a.mouth();
      a.anim('Shoot', 1);
      g.spawn(new Beam(m.x, m.y - m.z, u.x + Math.cos(ang) * 720, u.y + Math.sin(ang) * 720 - 10, 0.6, { width: 30, colors: [C[2], C[1], '#ffffff'] }));
      for (let d = 40; d < 700; d += 26) {
        const x = u.x + Math.cos(ang) * d, y = u.y + Math.sin(ang) * d;
        if (x < 0 || x > 360 || y < 60 || y > 640) break;
        g.marks.energy(x + rand(-5, 5), y + rand(-5, 5), rand(6, 10), RED, 6);
      }
      g.shake(9, 0.5);
      g.flash(0.08);
      sfx.beamFire();
      a.strike(0.8, { knockback: 280, stagger: 0.5, dirX: Math.cos(ang), dirY: Math.sin(ang) });
    });
    // Its life flows back into Yveltal.
    a.later(0.75, () => {
      let left = 0.6;
      a.ticks.push(dt => {
        if ((left -= dt) <= 0 || !alive(t)) return;
        for (let i = 0; i < 3; i++) {
          const x = t.x + rand(-10, 10), y = t.y + rand(-6, 6), life = 0.45;
          g.particles.spawn({ x, y, z: t.bodyZ, vx: (u.x - x) / life, vy: (u.y - y) / life, vz: (u.bodyZ - t.bodyZ) / life, life, size: rand(2, 4), sizeEnd: 1.5, colors: ['#ff6080', '#c02040'], fade: false });
        }
      });
    });
    a.later(1.1, () => {
      g.heal(u, u.maxHp * 0.15);
      g.spawn(new Glow(u.x, u.y, u.bodyZ, 40, RED, 0.4));
    });
    // Crimson lightning.
    for (let i = 0; i < 4; i++) {
      a.later(1.35 + i * 0.1, () => {
        const onFoe = i % 2 === 0, p = onFoe ? t : a.spot();
        g.spawn(new Lightning(p.x + rand(-5, 5), 60, p.x, p.y - 4, 0.3, { width: 3, branches: 4, glow: 'rgba(210,40,70,0.6)', core: '#ffb0b0' }));
        g.marks.energy(p.x, p.y, 14, RED, 6);
        g.shake(5, 0.2);
        sfx.thunderbolt();
        if (onFoe) a.strike(0.1, { knockback: 80, stagger: 0.3 });
      });
    }
    a.end(2.2);
  },
};
