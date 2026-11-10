// Legendary signature ultimates, batch 3: the Regis (Regirock, Regice, Registeel, Regieleki, Regidrago), Latias,
// Latios, Raikou, Suicune and Mew. Same rules as ult-legends.js; mechanics kept from the old beat scripts:
// Absolute Zero freezes, Iron Fortress raises Defense, Thunder Cage paralyzes, Mist Ball slows.
import {
  rand, Glow, Ring, Spike, Missile, Beam, BeamLine, SlashArc, PsyDome, ScreenDim, Afterimage, EnergyAura, Lightning,
  StormCloud, TidalWave, FloatingRock, FangBite, Ripple, Tether, dustCloud, debris, iceShatter, metalSparks, electricBurst, waterSplash,
} from './effects.js';
import { sfx } from './audio.js';
import { clampX, clampY, inward, spray, crater } from './ult-choreo.js';

const alive = t => t.alive && !t.hidden;
const status = (g, u, t, name, dur) => { if (alive(t)) g.applyStatus(t, name, { source: u, dur }); };

// The Regis' braille dots lighting up one after another on their bodies.
const BRAILLE = {
  regirock: [[-9, 0], [-4, 3], [0, 4], [4, 3], [9, 0], [0, -4]],
  regice: [[-7, -4], [0, -7], [7, -4], [7, 4], [0, 7], [-7, 4]],
  registeel: [[-8, -5], [-8, 5], [0, -6], [0, 6], [8, -5], [8, 5]],
};
function braille(a, g, u, rgb, pattern) {
  pattern.forEach(([dx, dy], i) => a.later(i * 0.06, () => {
    g.spawn(new Glow(u.x + dx, u.y, u.bodyZ + dy, 7, rgb, 0.8));
    g.spawn(new Glow(u.x + dx, u.y, u.bodyZ + dy, 3, [255, 255, 255], 0.8));
  }));
}

// A leap onto the foe (as in ult-legends2.js) for Registeel's slam.
function slam(a, g, u, t, { H = 300, fallAt = 0.55, ghost, onLand }) {
  let phase = 'rise', ft = 0, from = null;
  Object.assign(u, { invuln: true, zOverride: u.z });
  a.anim('Hop', 1);
  a.ticks.push(dt => {
    if (phase === 'rise') u.zOverride = Math.min(H, u.zOverride + dt * 900);
    if (phase !== 'fall') return;
    ft += dt;
    const k = Math.min(1, ft / 0.2);
    u.x = from.x + (t.x - from.x) * k;
    u.y = from.y + (t.y - from.y) * k;
    u.zOverride = H * (1 - k * k);
    g.spawn(new Afterimage(u, 0.25, ghost));
    if (k < 1) return;
    phase = 'done';
    Object.assign(u, { zOverride: null, invuln: false });
    onLand();
  });
  a.later(fallAt, () => {
    phase = 'fall';
    from = { x: u.x, y: u.y };
    sfx.whoosh();
  });
}

export const LEGEND_ULTS_3 = {
  // Regi Rockfall (Regirock): its braille glows, boulders burst out of the ground all over the arena and hover, then
  // they rain on the foe from every side, and Regirock pounds the ground.
  regiRockfall(a, g, u, t) {
    const SAND = [232, 210, 160];
    g.spawn(new ScreenDim(2.4, 0.5, '30,24,14'));
    braille(a, g, u, [255, 200, 120], BRAILLE.regirock);
    sfx.quake();
    a.rocks = [];
    for (let i = 0; i < 12; i++) {
      a.later(0.3 + i * 0.04, () => {
        const p = a.spot();
        a.rocks.push(g.spawn(new FloatingRock(p.x, p.y, rand(8, 13))));
        g.marks.fracture(p.x, p.y, 12, 6);
        dustCloud(g, p.x, p.y, 5, 4);
        if (i % 3 === 0) g.shake(3, 0.1);
      });
    }
    // Every boulder flies at the foe.
    for (let i = 0; i < 12; i++) {
      a.later(0.95 + i * 0.05, () => {
        const r = a.rocks[i];
        if (!r || r.dead) return;
        if (i % 2 === 0) sfx.whoosh();
        r.throwAt(t, 0.2, () => {
          debris(g, t.x, t.y, 6, 120);
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 4, r1: 24, life: 0.25, color: '#e8dcc0', width: 3, layer: 'air' }));
          g.shake(4, 0.12);
          a.strike(0.05, { knockback: 50, stagger: 0.3 });
        });
      });
    }
    // The pound.
    a.later(1.75, () => {
      a.anim('Attack', 1);
      for (let i = 0; i < 8; i++) {
        const p = a.spot();
        g.marks.fracture(p.x, p.y, rand(16, 28), 7);
        dustCloud(g, p.x, p.y, 4, 5);
      }
      for (let k = 0; k < 6; k++) g.spawn(new Spike(t.x + rand(-26, 26), t.y + rand(-14, 14), 'stone', 0.8));
      crater(a, g, t.x, t.y, { r: 56, rgb: SAND, ring: '#e8dcc0', shake: 16 });
      sfx.quake();
      a.strike(0.4, { knockback: 220, stagger: 0.7 });
    });
    a.end(2.4);
  },

  // Absolute Zero (Regice): its braille glows icy blue, frost races across the floor, rows of ice spikes march to
  // the foe, it is sealed in ice, and the ice shatters. Freezes.
  absoluteZero(a, g, u, t) {
    const ICE = [170, 230, 255];
    g.spawn(new ScreenDim(2.2, 0.45, '8,24,40'));
    braille(a, g, u, [180, 240, 255], BRAILLE.regice);
    for (let ring = 1; ring <= 6; ring++) {
      a.later(0.1 + ring * 0.06, () => {
        g.spawn(new Ring(u.x, u.y, { r0: ring * 40, r1: ring * 40 + 30, life: 0.5, color: '#bdf3ff', width: 2 }));
        for (let k = 0; k < 6; k++) {
          const ang = rand(0, Math.PI * 2), r = ring * 40;
          g.marks.frost(clampX(u.x + Math.cos(ang) * r), clampY(u.y + Math.sin(ang) * r * 0.75), rand(10, 16));
        }
      });
    }
    sfx.ice();
    // Ice spikes march on the foe.
    a.later(0.5, () => {
      const ang = u.aimAt(t), d = u.distTo(t), steps = Math.max(5, Math.round(d / 30));
      for (let i = 1; i <= steps; i++) {
        a.later(i * 0.05, () => {
          const k = i / steps, x = u.x + Math.cos(ang) * d * k, y = u.y + Math.sin(ang) * d * k;
          for (const off of [-16, 16]) g.spawn(new Spike(x - Math.sin(ang) * off, y + Math.cos(ang) * off, 'ice', 0.9));
          g.marks.frost(x, y, 12);
          if (i === steps) {
            iceShatter(g, t.x, t.y, t.bodyZ);
            sfx.shard();
            a.strike(0.5, { knockback: 60, stagger: 0.5 });
          }
        });
      }
    });
    // Sealed in ice…
    a.later(1.15, () => {
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        g.spawn(new Spike(t.x + Math.cos(ang) * 14, t.y + Math.sin(ang) * 9, 'ice', 0.55));
      }
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 40, ICE, 0.5, true));
      sfx.ice();
    });
    // …and it shatters.
    a.later(1.6, () => {
      for (let i = 0; i < 3; i++) iceShatter(g, t.x + rand(-10, 10), t.y + rand(-6, 6), t.bodyZ);
      spray(g, t.x, t.y, t.bodyZ, 30, ['#ffffff', '#bdf3ff', '#5ab0d8'], { speed: 160, up: 180, size: [2, 4] });
      crater(a, g, t.x, t.y, { r: 46, rgb: ICE, ring: '#ffffff', mark: (x, y, r) => g.marks.frost(x, y, r) });
      sfx.shard();
      a.strike(0.5, { knockback: 260, stagger: 0.6 });
    });
    a.later(1.7, () => status(g, u, t, 'freeze', 1.2));
    a.end(2.2);
  },

  // Iron Fortress (Registeel): its braille glows, a steel shell clamps around it (Defense up), it leaps and crashes
  // down in a storm of sparks, and the shockwave rolls out.
  ironFortress(a, g, u, t) {
    const STEEL = [180, 195, 215];
    g.spawn(new ScreenDim(2.4, 0.5, '14,18,26'));
    braille(a, g, u, [220, 230, 255], BRAILLE.registeel);
    a.later(0.15, () => {
      g.buff(u, 'def', 1.3, 8);
      for (let i = 0; i < 3; i++) g.spawn(new Ring(u.x, u.y, { z: u.bodyZ, r0: 40 - i * 8, r1: 26 - i * 6, life: 0.4, color: ['#ffffff', '#a3b1c4', '#3a4458'][i], width: 4, layer: 'air' }));
      metalSparks(g, u.x, u.y, u.bodyZ);
      sfx.clang();
    });
    a.later(0.45, () => {
      dustCloud(g, u.x, u.y, 12, 6);
      slam(a, g, u, t, {
        H: 300, fallAt: 0.55, ghost: '#a3b1c4',
        onLand: () => {
          for (let i = 0; i < 4; i++) metalSparks(g, u.x + rand(-14, 14), u.y + rand(-8, 8), 8);
          crater(a, g, u.x, u.y, { r: 60, rgb: STEEL, ring: '#ffffff', shake: 16 });
          sfx.clang();
          sfx.quake();
          a.strike(0.7, { knockback: 300, stagger: 0.7 });
        },
      });
    });
    a.later(1.65, () => {
      g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 480, life: 0.6, color: '#a3b1c4', width: 8 }));
      g.shake(7, 0.3);
      a.strike(0.3, { knockback: 220 });
    });
    a.end(2.3);
  },

  // Thunder Cage (Regieleki): lightning bars rise in a ring around the foe and crackle, energy spirals inside the
  // cage, bolts strike down into it, and the cage bursts. Paralyzes.
  thunderCage(a, g, u, t) {
    const VOLT = [255, 240, 120];
    g.spawn(new ScreenDim(2.6, 0.55, '4,20,10'));
    g.spawn(new EnergyAura(u, 0.5, true, { glow: VOLT, rings: ['#ffffff', '#fff27a'] }));
    sfx.thunderbolt();
    // The cage: eight bars of lightning around the foe, re-struck until it bursts.
    for (let pulse = 0; pulse < 8; pulse++) {
      a.later(0.15 + pulse * 0.13, () => {
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2 + pulse * 0.05, x = t.x + Math.cos(ang) * 44, y = t.y + Math.sin(ang) * 30;
          g.spawn(new Lightning(x, y - 90, x, y, 0.14, { width: 1.8, branches: 1, glow: 'rgba(255,240,120,0.6)' }));
        }
        g.spawn(new Ring(t.x, t.y, { r0: 44, r1: 46, life: 0.14, color: '#fff27a', width: 2 }));
        if (pulse % 2 === 0) sfx.zap(0.12);
      });
    }
    a.later(0.2, () => {
      let left = 0.9;
      a.ticks.push(dt => { if ((left -= dt) > 0) inward(g, t.x, t.y, t.bodyZ, 3, 40, ['#ffffff', '#fff27a', '#2a6a3a']); });
    });
    a.later(1.05, () => a.strike(0.25, { knockback: 0, stagger: 0.5 }));
    // Bolts down into the cage.
    for (let i = 0; i < 4; i++) {
      a.later(0.45 + i * 0.16, () => {
        g.spawn(new Lightning(t.x + rand(-5, 5), 60, t.x, t.y - 4, 0.3, { width: 4, branches: 6, glow: 'rgba(255,240,120,0.6)' }));
        electricBurst(g, t.x, t.y, 6, 14);
        g.marks.burn(t.x, t.y, 16);
        g.flash(0.06);
        g.shake(6, 0.25);
        sfx.thunder();
        a.strike(0.35 / 4, { knockback: 40, stagger: 0.4 });
      });
    }
    // The cage bursts.
    a.later(1.3, () => {
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        g.spawn(new Lightning(t.x, t.y - 10, t.x + Math.cos(ang) * 120, t.y + Math.sin(ang) * 80, 0.3, { width: 3, branches: 3, glow: 'rgba(255,240,120,0.6)' }));
      }
      crater(a, g, t.x, t.y, { r: 44, rgb: VOLT, ring: '#ffffff', mark: (x, y, r) => g.marks.burn(x, y, r) });
      a.strike(0.4, { knockback: 280, stagger: 0.6 });
    });
    a.later(1.45, () => status(g, u, t, 'para'));
    a.end(2.2);
  },

  // Dragon Energy (Regidrago): its arms form a dragon's head, draconic energy floods into the jaws, and it fires a
  // colossal dragon beam; the blast echoes back.
  dragonEnergy(a, g, u, t) {
    const DRAGON = [255, 130, 80], C = ['#ffe8d0', '#ff7a3a', '#5a1a3a'];
    g.spawn(new ScreenDim(2.4, 0.6, '30,8,14'));
    g.spawn(new EnergyAura(u, 0.9, true, { glow: DRAGON, rings: ['#ffe8d0', '#ff7a3a'] }));
    // The jaws.
    for (let i = 0; i < 3; i++) {
      a.later(0.1 + i * 0.15, () => {
        const ang = u.aimAt(t), m = a.mouth();
        for (const s of [-1, 1]) g.spawn(new SlashArc(m.x, m.y, m.z, ang + s * 0.5, { radius: 22 + i * 3, spread: 1.4, colors: ['#ff7a3a', '#ffe8d0'], width: 5, life: 0.4, mirror: s > 0 }));
      });
    }
    let gather = 0.75;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(140, dt, C, 60); });
    sfx.roar();
    sfx.beamCharge(0.75);
    a.later(0.75, () => {
      const ang = u.aimAt(t), m = a.mouth();
      a.anim('Shoot', 1);
      g.spawn(new Beam(m.x, m.y - m.z, u.x + Math.cos(ang) * 720, u.y + Math.sin(ang) * 720 - 10, 0.85, { width: 46, colors: [C[2], C[1], '#ffffff'] }));
      for (let d = 40; d < 700; d += 22) {
        const x = u.x + Math.cos(ang) * d, y = u.y + Math.sin(ang) * d;
        if (x < 0 || x > 360 || y < 60 || y > 640) break;
        g.marks.energy(x + rand(-8, 8), y + rand(-8, 8), rand(8, 12), DRAGON, 6);
        if (d % 66 < 22) g.spawn(new SlashArc(x, y, 12, ang + Math.PI / 2, { radius: 30, spread: 2.2, colors: ['#ff7a3a', '#ffe8d0'], width: 4, life: 0.35 }));
      }
      g.shake(12, 0.7);
      g.flash(0.1);
      sfx.beamFire();
      a.later(0.05, () => a.strike(0.85, { knockback: 300, stagger: 0.5, dirX: Math.cos(ang), dirY: Math.sin(ang) }));
    });
    a.later(1.55, () => {
      crater(a, g, t.x, t.y, { r: 44, rgb: DRAGON, ring: '#ffe8d0', mark: (x, y, r) => g.marks.energy(x, y, r, DRAGON, 6) });
      a.strike(0.15, { knockback: 200, stagger: 0.4 });
    });
    a.end(2.3);
  },

  // Mist Ball (Latias): a soft pink mist rolls over the arena, it forms balls of mist and lobs them at the foe, and
  // the mist closes into a dome around it. Slows.
  mistBall(a, g, u, t) {
    const PINK = [255, 180, 225], C = ['#ffffff', '#ffb0e0', '#a04aa0'];
    g.spawn(new ScreenDim(2.4, 0.45, '30,14,30'));
    let mist = 2;
    a.ticks.push(dt => {
      if ((mist -= dt) <= 0 || Math.random() > 0.5) return;
      g.particles.spawn({ x: rand(0, 360), y: rand(80, 620), z: rand(4, 30), vx: rand(20, 50), drag: 0.5, life: 1.2, size: rand(10, 18), sizeEnd: 14, colors: ['#ffe0f4'], alpha: 0.18, round: true });
    });
    g.spawn(new Glow(u.x, u.y, u.bodyZ, 34, PINK, 0.5, true));
    let gather = 0.45;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(90, dt, C, 44); });
    sfx.zap(0.4);
    for (let i = 0; i < 8; i++) {
      a.later(0.45 + i * 0.09, () => {
        const m = a.mouth(), off = (i % 3 - 1) * 14;
        a.anim('Shoot', 2);
        g.spawn(new Missile(m.x, m.y, t.x + off, t.y, Math.max(20, m.z), 0.32, 'orb', () => {
          for (let k = 0; k < 5; k++) g.particles.spawn({ x: t.x + off + rand(-8, 8), y: t.y + rand(-5, 5), z: t.bodyZ, vx: rand(-30, 30), vz: rand(10, 40), drag: 1, life: 0.7, size: rand(6, 10), sizeEnd: 12, colors: ['#ffe0f4'], alpha: 0.4, round: true });
          g.spawn(new Ripple(t, '#ffd0ec'));
          a.strike(0.5 / 8, { knockback: 40, stagger: 0.25 });
        }, PINK, 1.6));
        sfx.pulse();
      });
    }
    a.later(1.35, () => {
      g.spawn(new PsyDome(t.x, t.y, 80, 0.7, PINK));
      let left = 0.3;
      a.ticks.push(dt => { if ((left -= dt) > 0) inward(g, t.x, t.y, t.bodyZ, 4, 80, ['#ffffff', '#ffd0ec']); });
    });
    a.later(1.7, () => {
      crater(a, g, t.x, t.y, { r: 40, rgb: PINK, ring: '#ffffff', mark: (x, y, r) => g.marks.energy(x, y, r, PINK, 6) });
      a.strike(0.5, { knockback: 240, stagger: 0.5 });
    });
    a.later(1.8, () => status(g, u, t, 'slow', 3));
    a.end(2.3);
  },

  // Luster Purge (Latios): light gathers into a brilliant orb before it, it fires a prism beam of pure light, and the
  // light flares out around the foe.
  lusterPurge(a, g, u, t) {
    const BLUE = [150, 180, 255], C = ['#ffffff', '#8fb0ff', '#2a3a90'];
    g.spawn(new ScreenDim(2.3, 0.55, '6,10,34'));
    g.spawn(new EnergyAura(u, 0.7, true, { glow: BLUE, rings: ['#ffffff', '#8fb0ff'] }));
    a.later(0.05, () => {
      const m = a.mouth();
      g.spawn(new Glow(m.x, m.y, m.z, 30, [230, 240, 255], 0.6, true));
    });
    let gather = 0.6;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(130, dt, C, 54); });
    for (let i = 0; i < 4; i++) a.later(i * 0.13, () => g.spawn(new Ring(u.x, u.y, { z: u.bodyZ, r0: 80, r1: 6, life: 0.3, color: C[i % 2], width: 2, layer: 'air' })));
    sfx.beamCharge(0.6);
    a.later(0.65, () => {
      const ang = u.aimAt(t), m = a.mouth(), x1 = u.x + Math.cos(ang) * 720, y1 = u.y + Math.sin(ang) * 720 - 10;
      a.anim('Shoot', 1);
      g.spawn(new Beam(m.x, m.y - m.z, x1, y1, 0.75, { width: 32, colors: [C[2], C[1], '#ffffff'] }));
      // Prism fringes either side of the beam.
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      ['#ff9ad0', '#9affd0', '#ffe066'].forEach((c, i) => {
        const o = 18 + i * 4;
        for (const s of [-1, 1]) g.spawn(new BeamLine(m.x + nx * o * s, m.y - m.z + ny * o * s, x1 + nx * o * s, y1 + ny * o * s, 0.4, c, 1.5));
      });
      for (let d = 50; d < 700; d += 30) {
        const x = u.x + Math.cos(ang) * d, y = u.y + Math.sin(ang) * d;
        if (x < 0 || x > 360 || y < 60 || y > 640) break;
        g.marks.energy(x + rand(-5, 5), y + rand(-5, 5), rand(6, 10), BLUE, 6);
      }
      g.shake(9, 0.5);
      g.flash(0.1);
      sfx.beamFire();
      a.later(0.05, () => {
        g.spawn(new Ripple(t, '#ffffff'));
        a.strike(0.8, { knockback: 280, stagger: 0.5, dirX: Math.cos(ang), dirY: Math.sin(ang) });
      });
    });
    a.later(1.45, () => {
      for (let k = 0; k < 10; k++) {
        const ang = (k / 10) * Math.PI * 2;
        g.spawn(new BeamLine(t.x, t.y - t.bodyZ, t.x + Math.cos(ang) * 90, t.y - t.bodyZ + Math.sin(ang) * 70, 0.35, k % 2 ? '#8fb0ff' : '#ffffff', 3));
      }
      crater(a, g, t.x, t.y, { r: 40, rgb: BLUE, ring: '#ffffff', mark: (x, y, r) => g.marks.energy(x, y, r, BLUE, 6) });
      a.strike(0.2, { knockback: 220, stagger: 0.4 });
    });
    a.end(2.2);
  },

  // Volt Fang Storm (Raikou): it roars as thunderclouds gather on its back, pounces on the foe from every side with
  // electrified fangs, then calls lightning down around it.
  voltFangStorm(a, g, u, t) {
    const VOLT = [255, 230, 110];
    g.spawn(new ScreenDim(2.3, 0.55, '20,10,30'));
    g.spawn(new StormCloud(u.x, u.y - 40, 1.2));
    g.spawn(new EnergyAura(u, 0.5, true, { glow: VOLT, rings: ['#ffffff', '#6a3aa0'] }));
    sfx.roar();
    a.later(0.2, () => sfx.thunderbolt());
    u.phasing = true;
    for (let i = 0; i < 6; i++) {
      a.later(0.4 + i * 0.12, () => {
        const ang = (i / 6) * Math.PI * 2 + 0.4;
        g.spawn(new Afterimage(u, 0.3, '#ffe066'));
        u.x = clampX(t.x + Math.cos(ang) * 28);
        u.y = clampY(t.y + Math.sin(ang) * 20);
        u.face(t.x, t.y);
        a.anim('Attack', 2.5);
        g.spawn(new FangBite(t.x, t.y, t.bodyZ));
        g.spawn(new Lightning(u.x, u.y - u.bodyZ, t.x, t.y - t.bodyZ, 0.15, { width: 2, branches: 2, glow: 'rgba(255,230,110,0.6)' }));
        electricBurst(g, t.x, t.y, t.bodyZ, 10);
        g.shake(4, 0.1);
        sfx.bite();
        a.strike(0.1, { knockback: 30, stagger: 0.3 });
      });
    }
    a.later(1.15, () => { u.phasing = false; });
    for (let i = 0; i < 8; i++) {
      a.later(1.25 + i * 0.08, () => {
        const onFoe = i % 4 === 0, p = onFoe ? { x: t.x, y: t.y } : { x: clampX(t.x + rand(-90, 90)), y: clampY(t.y + rand(-70, 70)) };
        g.spawn(new Lightning(p.x + rand(-5, 5), 70, p.x, p.y - 4, 0.28, { width: 3, branches: 4, glow: 'rgba(255,230,110,0.6)' }));
        g.marks.burn(p.x, p.y, 12);
        if (i % 2 === 0) sfx.thunder();
        if (onFoe) a.strike(0.2, { knockback: 120, stagger: 0.4 });
      });
    }
    a.later(1.9, () => crater(a, g, t.x, t.y, { r: 36, rgb: VOLT, ring: '#ffffff', mark: (x, y, r) => g.marks.burn(x, y, r), shake: 9 }));
    a.end(2.3);
  },

  // Aurora Tide (Suicune): aurora ribbons ripple across the sky, it runs on the water as a purifying wave sweeps
  // the arena, then it fires an aurora beam.
  auroraTide(a, g, u, t) {
    const AQUA = [150, 230, 255], AURORA = ['#9affd0', '#9fe8ff', '#b48cff', '#ff9ad0'];
    g.spawn(new ScreenDim(2.4, 0.55, '4,20,34'));
    for (let r = 0; r < 4; r++) {
      a.later(r * 0.08, () => {
        const y = 90 + r * 18;
        for (let x = 0; x < 360; x += 30) g.spawn(new BeamLine(x, y + Math.sin(x / 40 + r) * 10, x + 30, y + Math.sin((x + 30) / 40 + r) * 10, 1.8, AURORA[r], 4));
      });
    }
    g.spawn(new EnergyAura(u, 0.6, true, { glow: AQUA, rings: ['#ffffff', '#9fe8ff'] }));
    sfx.hydro(0.4);
    // The purifying wave.
    a.later(0.35, () => {
      const down = t.y > u.y, y0 = down ? 60 : 640, y1 = down ? 640 : 60, dur = 0.85;
      const w = g.spawn(new TidalWave(y0, y1, dur, AQUA, true));
      a.ticks.push(() => {
        if (w.age >= w.life) return;
        for (let i = 0; i < 3; i++) g.particles.spawn({ x: rand(0, 360), y: w.y, z: rand(0, 14), vx: rand(-20, 20), vy: (down ? 1 : -1) * rand(40, 90), vz: rand(40, 120), gz: 300, life: 0.45, size: rand(2, 4), colors: ['#ffffff', '#9fe8ff', '#4a5ad0'] });
      });
      sfx.hydro(dur);
      a.later((Math.abs(t.y - y0) / 580) * dur, () => {
        waterSplash(g, t.x, t.y);
        g.shake(7, 0.35);
        sfx.splash();
        a.strike(0.5, { dirX: 0, dirY: down ? 1 : -1, knockback: 260, stagger: 0.5 });
      });
    });
    // The aurora beam.
    a.later(1.35, () => {
      const ang = u.aimAt(t), m = a.mouth(), x1 = u.x + Math.cos(ang) * 720, y1 = u.y + Math.sin(ang) * 720 - 10;
      a.anim('Shoot', 1);
      g.spawn(new Beam(m.x, m.y - m.z, x1, y1, 0.6, { width: 24, colors: ['#4a5ad0', '#9fe8ff', '#ffffff'] }));
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      AURORA.forEach((c, i) => {
        const o = (i - 1.5) * 7;
        g.spawn(new BeamLine(m.x + nx * o, m.y - m.z + ny * o, x1 + nx * o, y1 + ny * o, 0.45, c, 2));
      });
      g.shake(8, 0.4);
      sfx.beamFire();
      a.later(0.05, () => {
        crater(a, g, t.x, t.y, { r: 36, rgb: AQUA, ring: '#ffffff', mark: (x, y, r) => g.marks.frost(x, y, r), stop: 0.08, shake: 10 });
        a.strike(0.5, { knockback: 260, stagger: 0.5, dirX: Math.cos(ang), dirY: Math.sin(ang) });
      });
    });
    a.end(2.3);
  },

  // Genesis Psychic (Mew): bubbles float up everywhere, Mew lifts the foe in a bubble and bounces it off the ground
  // twice, a ring of orbs fires in, and a bright pink dome pops.
  psychicGenesis(a, g, u, t) {
    const PINK = [255, 170, 230], C = ['#ffffff', '#ffb0e0', '#c060ff'];
    g.spawn(new ScreenDim(3, 0.45, '30,10,36'));
    let bubbles = 2.6;
    a.ticks.push(dt => {
      if ((bubbles -= dt) <= 0 || Math.random() > 0.4) return;
      g.particles.spawn({ x: rand(10, 350), y: rand(80, 620), z: 0, vz: rand(30, 60), vx: rand(-10, 10), life: 1.2, size: rand(4, 8), sizeEnd: 8, colors: ['#ffd0f0', '#c8f0ff'], alpha: 0.5, round: true });
    });
    g.spawn(new PsyDome(u.x, u.y, 30, 0.6, PINK));
    sfx.zap(0.4);
    // Lift and bounce.
    a.later(0.3, () => {
      if (!alive(t)) return;
      a.anim('Shoot', 1);
      g.spawn(new Tether(u, t, 1.2, PINK));
      a.lift(t, { x: t.x, y: t.y, z: 60 }, 0.35, 0, null, '#ffb0e0', C, true);
      sfx.zap(0.6);
    });
    for (const [dt, k] of [[0.75, 0], [1.15, 1]]) {
      a.later(dt, () => {
        if (!alive(t)) return;
        const to = { x: clampX(t.x + (k ? -60 : 60)), y: clampY(t.y + rand(-30, 30)), z: 0 };
        sfx.whoosh();
        a.lift(t, to, 0.3, 60, () => {
          g.spawn(new PsyDome(t.x, t.y, 44, 0.35, PINK));
          g.marks.energy(t.x, t.y, 20, PINK, 6);
          g.shake(7, 0.3);
          sfx.quake();
          a.strike(0.25, { knockback: 0, stagger: 0.6 });
        }, '#ffb0e0', C, !k);
      });
    }
    // A ring of orbs.
    for (let i = 0; i < 7; i++) {
      a.later(1.6 + i * 0.07, () => {
        const ang = (i / 7) * Math.PI * 2, x = clampX(t.x + Math.cos(ang) * 100), y = clampY(t.y + Math.sin(ang) * 75);
        g.spawn(new Glow(x, y, 14, 18, PINK, 0.25));
        g.spawn(new Missile(x, y, t.x, t.y, 14, 0.25, 'orb', () => {
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 4, r1: 22, life: 0.3, color: '#ffb0e0', width: 3, layer: 'air' }));
          a.strike(0.3 / 7, { knockback: 40, stagger: 0.25 });
        }, PINK));
        sfx.shard();
      });
    }
    a.later(2.3, () => {
      g.spawn(new PsyDome(t.x, t.y, 100, 0.6, PINK));
      spray(g, t.x, t.y, t.bodyZ, 26, ['#ffffff', '#ffd0f0', '#c8f0ff'], { speed: 150, up: 180 });
      crater(a, g, t.x, t.y, { r: 40, rgb: PINK, ring: '#ffffff', mark: (x, y, r) => g.marks.energy(x, y, r, PINK, 6) });
      a.strike(0.2, { knockback: 260, stagger: 0.5 });
    });
    a.end(2.9);
  },
};

