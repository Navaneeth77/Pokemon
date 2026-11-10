// Signature ultimates of fan favourites, batch 5: Venusaur, Blastoise, Infernape, Scizor, Zoroark, Sylveon, Lapras,
// Aegislash, Umbreon and Espeon. Same rules as ult-legends.js; Sheer Cold keeps its freeze.
import {
  rand, FIRE, Glow, Ring, Pillar, Falling, Spike, Missile, Beam, BeamLine, SlashArc, PsyDome, ScreenDim, Afterimage,
  TidalWave, Tether, RainbowStreak, Ripple, dustCloud, leafBurst, iceShatter, metalSparks, waterSplash,
} from './effects.js';
import { sfx } from './audio.js';
import { clampX, clampY, inward, spray, crater, glide } from './ult-choreo.js';
import { Crescent } from './ult-legends2.js';

const alive = t => t.alive && !t.hidden;
const status = (g, u, t, name, dur) => { if (alive(t)) g.applyStatus(t, name, { source: u, dur }); };
// Teleporting strikes all around the foe; `onHit(i, ang)` draws each one.
function blitz(a, g, u, t, { n, gap, start, frac, ghost, r = 26, onHit }) {
  for (let i = 0; i < n; i++) {
    a.later(start + i * gap, () => {
      const ang = (i / n) * Math.PI * 2 + 0.4;
      u.phasing = true;
      g.spawn(new Afterimage(u, 0.3, ghost));
      u.x = clampX(t.x + Math.cos(ang) * r);
      u.y = clampY(t.y + Math.sin(ang) * r * 0.7);
      u.face(t.x, t.y);
      a.anim(i % 2 ? 'Attack' : 'Swing', 2.5);
      onHit(i, ang);
      g.shake(4, 0.1);
      a.strike(frac / n, { knockback: 30, stagger: 0.3 });
    });
  }
  a.later(start + n * gap, () => { u.phasing = false; });
}
// Lift on a ribbon or tether and slam twice.
function throwTwice(a, g, u, t, frac, color, colors, rgb, onSlam) {
  if (!alive(t)) return;
  a.anim('Shoot', 1);
  g.spawn(new Tether(u, t, 1.2, rgb));
  a.lift(t, { x: t.x, y: t.y, z: 60 }, 0.35, 0, null, color, colors, true);
  sfx.zap(0.6);
  [[0.45, 0], [0.85, 1]].forEach(([dt, k]) => a.later(dt, () => {
    if (!alive(t)) return;
    sfx.whoosh();
    a.lift(t, { x: clampX(t.x + (k ? -60 : 60)), y: clampY(t.y + rand(-30, 30)), z: 0 }, 0.28, 70, () => {
      onSlam();
      g.shake(8, 0.3);
      sfx.quake();
      a.strike(frac / 2, { knockback: 0, stagger: 0.6 });
    }, color, colors, !k);
  }));
}

export const FAV_ULTS = {
  // Petal Blizzard (Venusaur): the flower on its back blooms, a whirlwind of petals circles the arena and closes in on
  // the foe, then flowers burst into bloom all around it.
  petalBlizzard(a, g, u, t) {
    const PINK = [255, 170, 210], LEAF = [140, 220, 110], PETALS = ['#ffc0e0', '#ff8ac0', '#ffffff', '#8fe060'];
    g.spawn(new ScreenDim(2.4, 0.45, '14,24,10'));
    g.spawn(new Glow(u.x, u.y, u.headZ, 40, PINK, 0.6, true));
    let storm = 1.4;
    a.ticks.push(dt => {
      if ((storm -= dt) <= 0) return;
      const k = 1 - Math.max(0, storm) / 1.4, cx = 180 + (t.x - 180) * k, cy = 350 + (t.y - 350) * k, R = 170 * (1 - k) + 40;
      for (let i = 0; i < 6; i++) {
        const ang = a.t * 5 + (i / 6) * Math.PI * 2 + rand(-0.2, 0.2);
        g.particles.spawn({ x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R * 0.6, z: rand(10, 60), vx: -Math.sin(ang) * 160, vy: Math.cos(ang) * 90, life: 0.3, size: rand(2, 4), colors: [PETALS[i % 4]], fade: true });
      }
    });
    sfx.wind(1.2);
    a.later(1.0, () => a.strike(0.4, { knockback: 60, stagger: 0.5 }));
    for (let i = 0; i < 10; i++) {
      a.later(1.2 + i * 0.05, () => {
        const ang = (i / 10) * Math.PI * 2, aimed = i % 4 === 0;
        const p = aimed ? { x: t.x, y: t.y } : { x: clampX(t.x + Math.cos(ang) * 70), y: clampY(t.y + Math.sin(ang) * 50) };
        g.spawn(new Pillar(p.x, p.y, 0.6, i % 2 ? PINK : LEAF, aimed ? 300 : 180));
        leafBurst(g, p.x, p.y, 4, 6);
        spray(g, p.x, p.y, 4, 6, PETALS, { speed: 70, up: 120 });
        g.marks.leaves(p.x, p.y, rand(10, 14));
        if (aimed) {
          sfx.explosion();
          a.strike(0.6 / 3, { knockback: 100, stagger: 0.4 });
        }
      });
    }
    a.end(2.3);
  },

  // Hydro Cannon (Blastoise): it braces, its shell cannons swing forward glowing, two massive water beams fire one
  // after the other, and the water explodes into a geyser.
  hydroCannon(a, g, u, t) {
    const BLUE = [90, 166, 240], C = ['#ffffff', '#5aa6f0', '#1f4cc0'];
    g.spawn(new ScreenDim(2.2, 0.5, '4,12,36'));
    const cannons = () => {
      const ang = u.aimAt(t), nx = -Math.sin(ang), ny = Math.cos(ang);
      return [-1, 1].map(s => ({ x: u.x + nx * 14 * s + Math.cos(ang) * 8, y: u.y + ny * 14 * s + Math.sin(ang) * 8, ang }));
    };
    for (const c of cannons()) g.spawn(new Glow(c.x, c.y, u.headZ, 16, BLUE, 0.5, true));
    let gather = 0.5;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(110, dt, C, 44); });
    dustCloud(g, u.x, u.y, 8, 5);
    sfx.beamCharge(0.5);
    [0, 1].forEach(i => a.later(0.5 + i * 0.13, () => {
      const c = cannons()[i];
      a.anim('Shoot', 1.5);
      g.spawn(new Beam(c.x, c.y - u.headZ, c.x + Math.cos(c.ang) * 720, c.y + Math.sin(c.ang) * 720 - 10, 0.55, { width: 22, colors: [C[2], C[1], '#ffffff'] }));
      for (let d = 40; d < 700; d += 30) {
        const x = c.x + Math.cos(c.ang) * d, y = c.y + Math.sin(c.ang) * d;
        if (x < 0 || x > 360 || y < 60 || y > 640) break;
        g.marks.wet(x + rand(-5, 5), y + rand(-5, 5), rand(6, 10));
      }
      // The recoil shoves Blastoise back a little.
      u.x = clampX(u.x - Math.cos(c.ang) * 6);
      u.y = clampY(u.y - Math.sin(c.ang) * 6);
      waterSplash(g, c.x, c.y);
      g.shake(9, 0.4);
      sfx.beamFire();
      a.later(0.05, () => a.strike(0.35, { knockback: 200, stagger: 0.45, dirX: Math.cos(c.ang), dirY: Math.sin(c.ang) }));
    }));
    a.later(1.25, () => {
      g.spawn(new Pillar(t.x, t.y, 0.6, BLUE, 360));
      for (let i = 0; i < 3; i++) waterSplash(g, t.x + rand(-12, 12), t.y + rand(-6, 6));
      spray(g, t.x, t.y, 4, 26, ['#ffffff', '#bfe6ff', '#5aa6f0'], { speed: 120, up: 300, grav: 420 });
      crater(a, g, t.x, t.y, { r: 44, rgb: BLUE, ring: '#ffffff', mark: (x, y, r) => g.marks.wet(x, y, r) });
      sfx.splash();
      a.strike(0.3, { knockback: 260, stagger: 0.5 });
    });
    a.end(2.1);
  },

  // Inferno Overdrive (Infernape): the flame on its head roars up, it pummels the foe from every side with blazing
  // fists, then fire pillars spiral up around it.
  infernoOverdrive(a, g, u, t) {
    const FLAME = [255, 130, 50];
    g.spawn(new ScreenDim(2.3, 0.5, '40,12,2'));
    g.spawn(new Pillar(u.x, u.y, 0.5, FLAME, 160));
    let blaze = 0.4;
    a.ticks.push(dt => {
      if ((blaze -= dt) <= 0) return;
      g.particles.spawn({ x: u.x + rand(-6, 6), y: u.y, z: u.headZ + rand(0, 10), vz: rand(80, 160), life: 0.4, size: rand(3, 6), sizeEnd: 1, colors: FIRE });
    });
    sfx.flamethrower(0.4);
    blitz(a, g, u, t, {
      n: 6, gap: 0.11, start: 0.35, frac: 0.5, ghost: '#ff7a2a',
      onHit: () => {
        spray(g, t.x, t.y, t.bodyZ, 8, FIRE, { speed: 100, up: 80, size: [2, 4], life: [0.25, 0.45] });
        g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 4, r1: 28, life: 0.2, color: '#ffd060', width: 4, layer: 'air' }));
        sfx.hit(false);
      },
    });
    for (let i = 0; i < 8; i++) {
      a.later(1.1 + i * 0.06, () => {
        const ang = i * 1.1, r = 70 * (1 - i / 8) + 4, last = i >= 6;
        const x = clampX(t.x + Math.cos(ang) * r), y = clampY(t.y + Math.sin(ang) * r * 0.7);
        a.erupt(x, y, FIRE, FLAME, last ? 300 : 180);
        g.marks.scorch(x, y, 12, 6);
        if (last) a.strike(0.25, { knockback: 160, stagger: 0.5 });
      });
    }
    a.later(1.65, () => crater(a, g, t.x, t.y, { r: 40, rgb: FLAME, ring: '#fff0a0', mark: (x, y, r) => g.marks.scorch(x, y, r, 7), shake: 11 }));
    a.end(2.1);
  },

  // Bullet Barrage (Scizor): its pincers glint, it fires off a stream of bullet punches in and out at blinding speed,
  // then crosses its claws in a giant X.
  bulletBarrage(a, g, u, t) {
    const STEEL = [220, 60, 60];
    g.spawn(new ScreenDim(2.2, 0.5, '30,8,8'));
    for (const s of [-1, 1]) a.later(0.1 + (s + 1) * 0.08, () => {
      g.spawn(new Glow(u.x + s * 14, u.y, u.bodyZ, 10, [255, 255, 255], 0.3));
      metalSparks(g, u.x + s * 14, u.y, u.bodyZ);
      sfx.clang();
    });
    const home = { x: u.x, y: u.y };
    for (let i = 0; i < 8; i++) {
      a.later(0.4 + i * 0.1, () => {
        const ang = Math.atan2(t.y - home.y, t.x - home.x) + (i % 2 ? 0.25 : -0.25), gap = u.radius + t.radius + 2;
        const to = { x: clampX(t.x - Math.cos(ang) * gap), y: clampY(t.y - Math.sin(ang) * gap) };
        glide(a, g, u, to, 0.05, '#d04040');
        a.later(0.05, () => {
          u.face(t.x, t.y);
          a.anim('Attack', 3);
          metalSparks(g, t.x, t.y, t.bodyZ);
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 3, r1: 22, life: 0.15, color: '#ffffff', width: 3, layer: 'air' }));
          g.shake(3, 0.08);
          sfx.hit(false);
          a.strike(0.6 / 8, { knockback: 20, stagger: 0.3 });
        });
      });
    }
    a.later(1.3, () => {
      a.anim('Swing', 1.5);
      for (const ang of [Math.PI / 4, -Math.PI / 4]) {
        const dx = Math.cos(ang) * 150, dy = Math.sin(ang) * 150;
        g.spawn(new BeamLine(t.x - dx, t.y - t.bodyZ - dy, t.x + dx, t.y - t.bodyZ + dy, 0.4, '#d04040', 12));
        g.spawn(new BeamLine(t.x - dx, t.y - t.bodyZ - dy, t.x + dx, t.y - t.bodyZ + dy, 0.3, '#ffffff', 4));
      }
      g.flash(0.08);
      crater(a, g, t.x, t.y, { r: 40, rgb: STEEL, ring: '#ffffff', stop: 0.12 });
      sfx.slash();
      a.strike(0.4, { knockback: 280, stagger: 0.6 });
    });
    a.end(2.1);
  },

  // Illusion Ambush (Zoroark): illusions of it ring the foe, each lunges in turn, then the illusion collapses into a
  // vortex of shadow.
  illusionAmbush(a, g, u, t) {
    const DARK = [170, 60, 80], C = ['#ff8a9a', '#a02a40', '#1a0a14'];
    g.spawn(new ScreenDim(2.3, 0.7, '20,4,10'));
    sfx.zap(0.4);
    for (let i = 0; i < 7; i++) {
      a.later(0.08 + i * 0.03, () => {
        const ang = (i / 7) * Math.PI * 2 + 0.4, x = u.x, y = u.y;
        Object.assign(u, { x: clampX(t.x + Math.cos(ang) * 60), y: clampY(t.y + Math.sin(ang) * 42) });
        u.face(t.x, t.y);
        g.spawn(new Afterimage(u, 0.9, '#a02a40'));
        Object.assign(u, { x, y });
      });
    }
    blitz(a, g, u, t, {
      n: 7, gap: 0.11, start: 0.4, frac: 0.55, ghost: '#ff8a9a',
      onHit: (i, ang) => {
        g.spawn(new SlashArc(t.x, t.y, t.bodyZ, ang + Math.PI, { radius: 24, spread: 2.2, colors: ['#a02a40', '#ff8a9a'], width: 5, mirror: i % 2 === 1 }));
        sfx.slash();
      },
    });
    a.later(1.25, () => {
      let left = 0.5;
      a.ticks.push(dt => { if ((left -= dt) > 0) inward(g, t.x, t.y, t.bodyZ, 5, 90, C); });
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 50, DARK, 0.5, true));
      sfx.zap(0.5);
    });
    a.later(1.75, () => {
      g.spawn(new Ring(t.x, t.y, { r0: 90, r1: 4, life: 0.25, color: '#ff8a9a', width: 4 }));
      crater(a, g, t.x, t.y, { r: 40, rgb: DARK, ring: '#ff8a9a', mark: (x, y, r) => g.marks.energy(x, y, r, DARK, 6) });
      a.strike(0.45, { knockback: 260, stagger: 0.6 });
    });
    a.end(2.2);
  },

  // Fairy Ribbon Storm (Sylveon): its ribbons stream out and wrap the foe, swing it up and down twice, then a dome
  // of fairy light bursts around it.
  fairyRibbons(a, g, u, t) {
    const PINK = [255, 150, 200], C = ['#ffffff', '#ffb0d8', '#5ab0f0'];
    g.spawn(new ScreenDim(2.6, 0.45, '30,10,26'));
    for (let i = 0; i < 4; i++) {
      a.later(i * 0.05, () => {
        const ang = u.aimAt(t) + (i - 1.5) * 0.4;
        g.spawn(new RainbowStreak(u.x, u.y - u.bodyZ, u.x + Math.cos(ang) * 60, u.y - u.bodyZ + Math.sin(ang) * 40, 0.5));
      });
    }
    sfx.zap(0.3);
    a.later(0.2, () => throwTwice(a, g, u, t, 0.45, '#ffb0d8', C, PINK, () => {
      g.spawn(new PsyDome(t.x, t.y, 40, 0.35, PINK));
      spray(g, t.x, t.y, 4, 12, C, { speed: 100, up: 120 });
      g.marks.energy(t.x, t.y, 18, PINK, 6);
    }));
    a.later(1.35, () => {
      for (let i = 0; i < 6; i++) g.spawn(new RainbowStreak(t.x - 50 + i * 20, t.y, t.x - 50 + i * 20, t.y - 110, 0.5));
      g.spawn(new PsyDome(t.x, t.y, 100, 0.7, PINK));
      sfx.zap(0.3);
    });
    a.later(1.7, () => {
      spray(g, t.x, t.y, t.bodyZ, 30, C, { speed: 160, up: 200 });
      crater(a, g, t.x, t.y, { r: 44, rgb: PINK, ring: '#ffffff', mark: (x, y, r) => g.marks.energy(x, y, r, PINK, 6) });
      a.strike(0.55, { knockback: 260, stagger: 0.6 });
    });
    a.end(2.4);
  },

  // Sheer Cold (Lapras): it sings as snow begins to fall, a freezing wave sweeps the arena, ice spikes burst up under
  // the foe, and the cold shatters around it. Freezes.
  sheerCold(a, g, u, t) {
    const ICE = [190, 240, 255], C = ['#ffffff', '#bdf3ff', '#2b8794'];
    g.spawn(new ScreenDim(2.6, 0.35, '10,30,40'));
    let snow = 2.4;
    a.ticks.push(dt => {
      if ((snow -= dt) <= 0) return;
      for (let i = 0; i < 3; i++) g.particles.spawn({ x: rand(0, 380), y: rand(60, 640), z: rand(120, 200), vx: rand(-20, -5), vz: -rand(50, 90), life: 1.4, size: rand(1.5, 3), colors: ['#ffffff', '#e6f6ff'], fade: false });
    });
    for (let i = 0; i < 5; i++) a.later(i * 0.12, () => g.spawn(new Ring(u.x, u.y, { z: u.headZ, r0: 10, r1: 50 + i * 10, life: 0.5, color: '#bdf3ff', width: 2, layer: 'air' })));
    sfx.ice();
    a.later(0.3, () => {
      const down = t.y > u.y, y0 = down ? 60 : 640, y1 = down ? 640 : 60, dur = 0.8;
      const w = g.spawn(new TidalWave(y0, y1, dur, ICE, true));
      a.ticks.push(() => {
        if (w.age >= w.life) return;
        if (Math.random() < 0.6) g.marks.frost(rand(20, 340), w.y, rand(10, 16));
      });
      sfx.hydro(dur);
      a.later((Math.abs(t.y - y0) / 580) * dur, () => {
        iceShatter(g, t.x, t.y, t.bodyZ);
        a.strike(0.35, { dirX: 0, dirY: down ? 1 : -1, knockback: 200, stagger: 0.5 });
      });
    });
    for (const [dt, f] of [[1.2, 0.15], [1.45, 0.15], [1.7, 0.15]]) {
      a.later(dt, () => {
        for (let k = 0; k < 5; k++) g.spawn(new Spike(t.x + rand(-16, 16), t.y + rand(-8, 8), 'ice', 0.9));
        g.marks.frost(t.x, t.y, 26);
        iceShatter(g, t.x, t.y, 8);
        sfx.shard();
        a.strike(f, { knockback: 60, stagger: 0.4 });
      });
    }
    a.later(2.0, () => {
      for (let i = 0; i < 3; i++) iceShatter(g, t.x + rand(-12, 12), t.y + rand(-6, 6), t.bodyZ);
      crater(a, g, t.x, t.y, { r: 44, rgb: ICE, ring: '#ffffff', mark: (x, y, r) => g.marks.frost(x, y, r) });
      a.strike(0.2, { knockback: 220, stagger: 0.5 });
    });
    a.later(2.05, () => status(g, u, t, 'freeze', 1.2));
    a.end(2.6);
  },

  // King's Judgment (Aegislash): its shield flares, it switches to Blade Forme in a flash, three royal cuts cross the
  // foe, then it rises and drives down blade-first.
  kingsJudgment(a, g, u, t) {
    const ROYAL = [200, 216, 240], C = ['#ffffff', '#c8d8f0', '#45346a'];
    g.spawn(new ScreenDim(2.4, 0.6, '14,10,26'));
    for (let i = 0; i < 3; i++) g.spawn(new Ring(u.x, u.y, { z: u.bodyZ, r0: 28 - i * 5, r1: 30 - i * 5, life: 0.4, color: C[i], width: 3, layer: 'air', hold: true }));
    sfx.clang();
    a.later(0.35, () => {
      g.spawn(new Glow(u.x, u.y, u.bodyZ, 50, ROYAL, 0.3));
      g.flash(0.06);
      metalSparks(g, u.x, u.y, u.bodyZ);
      sfx.clang();
    });
    for (let i = 0; i < 3; i++) {
      a.later(0.5 + i * 0.18, () => {
        const ang = [0.3, -0.7, 1.2][i], L = 280;
        a.anim('Swing', 2);
        g.spawn(new BeamLine(t.x - Math.cos(ang) * L / 2, t.y - t.bodyZ - Math.sin(ang) * L / 2, t.x + Math.cos(ang) * L / 2, t.y - t.bodyZ + Math.sin(ang) * L / 2, 0.35, '#7a5ab0', 9));
        g.spawn(new BeamLine(t.x - Math.cos(ang) * L / 2, t.y - t.bodyZ - Math.sin(ang) * L / 2, t.x + Math.cos(ang) * L / 2, t.y - t.bodyZ + Math.sin(ang) * L / 2, 0.25, '#ffffff', 3));
        metalSparks(g, t.x, t.y, t.bodyZ);
        g.shake(5, 0.12);
        sfx.slash();
        a.strike(0.55 / 3, { knockback: 80, stagger: 0.4 });
      });
    }
    a.later(1.1, () => {
      Object.assign(u, { invuln: true, zOverride: u.z });
      let k = 0;
      const from = { x: u.x, y: u.y };
      a.ticks.push(dt => {
        if (k >= 1) return;
        k = Math.min(1, k + dt / 0.55);
        if (k < 0.6) u.zOverride = 220 * (k / 0.6);
        else {
          const f = (k - 0.6) / 0.4;
          u.x = from.x + (t.x - from.x) * f;
          u.y = from.y + (t.y - from.y) * f;
          u.zOverride = 220 * (1 - f * f);
          g.spawn(new Afterimage(u, 0.25, '#c8d8f0'));
        }
        if (k < 1) return;
        Object.assign(u, { zOverride: null, invuln: false });
        g.spawn(new BeamLine(t.x, t.y - 200, t.x, t.y, 0.3, '#ffffff', 6));
        crater(a, g, t.x, t.y, { r: 50, rgb: ROYAL, ring: '#ffffff', mark: (x, y, r) => g.marks.fracture(x, y, r, 7), shake: 14 });
        sfx.clang();
        a.strike(0.45, { knockback: 280, stagger: 0.7 });
      });
    });
    a.end(2.3);
  },

  // Lunar Eclipse (Umbreon): its rings glow, a moon rises and darkens into an eclipse, shards of moonlight rain on
  // the foe, and a dome of darkness closes over it.
  lunarEclipse(a, g, u, t) {
    const GOLD = [255, 220, 100], DARK = [60, 40, 90];
    g.spawn(new ScreenDim(2.2, 0.75, '6,4,12'));
    for (const [dx, dz] of [[-10, 6], [10, 6], [0, -4], [-6, 14], [6, 14]]) g.spawn(new Glow(u.x + dx, u.y, u.bodyZ + dz, 6, GOLD, 1.8));
    g.spawn(new Crescent(180, 116, 26, 2, '#ffe680', [255, 220, 100]));
    sfx.zap(0.5);
    for (let i = 0; i < 12; i++) {
      a.later(0.35 + i * 0.07, () => {
        const aimed = i % 3 === 0, p = aimed ? { x: t.x, y: t.y } : { x: clampX(t.x + rand(-110, 110)), y: clampY(t.y + rand(-80, 80)) };
        g.spawn(new Falling(p.x, p.y, 0.4, 'crystal', () => {
          g.spawn(new Ring(p.x, p.y, { r0: 3, r1: 20, life: 0.3, color: '#ffe680', width: 2 }));
          g.marks.energy(p.x, p.y, 10, DARK, 6);
          if (aimed) a.strike(0.5 / 4, { knockback: 60, stagger: 0.3 });
        }, GOLD));
      });
    }
    a.later(1.35, () => {
      g.spawn(new PsyDome(t.x, t.y, 90, 0.7, DARK));
      let left = 0.3;
      a.ticks.push(dt => { if ((left -= dt) > 0) inward(g, t.x, t.y, t.bodyZ, 4, 80, ['#1a1028', '#3a2a5a', '#ffe680']); });
    });
    a.later(1.7, () => {
      crater(a, g, t.x, t.y, { r: 40, rgb: GOLD, ring: '#ffe680', mark: (x, y, r) => g.marks.energy(x, y, r, DARK, 6) });
      a.strike(0.5, { knockback: 260, stagger: 0.6 });
    });
    a.end(2.2);
  },

  // Psychic Prism (Espeon): the gem on its forehead flares, light splits into a ring of coloured orbs around the foe,
  // they fire in one by one, and the colours spiral together and burst.
  psychicPrism(a, g, u, t) {
    const PINK = [255, 150, 230], HUES = [[255, 90, 90], [255, 180, 60], [255, 240, 90], [120, 230, 120], [90, 180, 255], [150, 110, 255], [230, 110, 230], [255, 255, 255]];
    g.spawn(new ScreenDim(2.3, 0.5, '24,8,30'));
    g.spawn(new Glow(u.x, u.y, u.headZ + 2, 14, [255, 80, 120], 0.6, true));
    sfx.beamCharge(0.5);
    HUES.forEach((rgb, i) => {
      const ang = (i / 8) * Math.PI * 2, x = clampX(t.x + Math.cos(ang) * 100), y = clampY(t.y + Math.sin(ang) * 75);
      a.later(0.3 + i * 0.03, () => g.spawn(new Glow(x, y, 14, 16, rgb, 0.6)));
      a.later(0.6 + i * 0.08, () => {
        g.spawn(new Missile(x, y, t.x, t.y, 14, 0.22, 'orb', () => {
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 4, r1: 24, life: 0.25, color: `rgb(${rgb.join(',')})`, width: 3, layer: 'air' }));
          a.strike(0.5 / 8, { knockback: 30, stagger: 0.25 });
        }, rgb));
        sfx.shard();
      });
    });
    a.later(1.35, () => {
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        g.spawn(new RainbowStreak(t.x + Math.cos(ang) * 80, t.y - t.bodyZ + Math.sin(ang) * 50, t.x, t.y - t.bodyZ, 0.4));
      }
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 50, PINK, 0.4, true));
      sfx.zap(0.4);
    });
    a.later(1.75, () => {
      g.spawn(new Ripple(t, '#ffffff'));
      crater(a, g, t.x, t.y, { r: 40, rgb: PINK, ring: '#ffffff', mark: (x, y, r) => g.marks.energy(x, y, r, PINK, 6) });
      a.strike(0.5, { knockback: 260, stagger: 0.6 });
    });
    a.end(2.2);
  },
};
