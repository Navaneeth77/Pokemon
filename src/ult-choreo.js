// Choreography for the type ultimates: the ten ultimates most Pokémon fall back on (Giga Impact, Bug Buzz,
// Eruption, Future Sight, Gunk Shot, Fissure, Dynamic Punch, Calamity Strike, Sky Attack, Outrage).
//
// Each one is a full staged sequence: a wind-up on the user, a build-up that shows what the move is, the climax
// on the foe, and the aftermath left on the arena. Damage lands through `a.strike(frac)` at the exact frame the
// visual connects, and the shares of each ultimate add up to 1 (its full power).
//
// `a` is the Ultimate action (moves.js): later(dt, fn), strike(frac, opts), boom(mag), erupt(), spot(), converge(),
// mouth(), anim(), lift() and the per-frame `ticks` list. Effects that never end on their own go in `a.owned`.
import { BOUNDS } from './arena.js';
import {
  rand, FIRE, Glow, Ring, Pillar, Falling, Spike, Missile, BeamLine, SlashArc, PsyDome, ScreenDim, Afterimage, EnergyAura,
  GroundMarker, Glare, Ripple, dustCloud, debris, windBurst, leafBurst,
} from './effects.js';
import { sfx } from './audio.js';

const clampX = x => Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, x));
const clampY = y => Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, y));
const css = rgb => `rgb(${rgb.join(',')})`;

// Particles drawn in from all around a point (energy gathering).
function inward(g, x, y, z, n, r, colors, life = 0.35) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), d = rand(r * 0.7, r * 1.2), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.6;
    g.particles.spawn({ x: px, y: py, z: z + rand(-10, 14), vx: (x - px) / life, vy: (y - py) / life, life, size: rand(2, 4), sizeEnd: 1, colors, fade: false });
  }
}

// Particles thrown out of a point, falling back under gravity.
function spray(g, x, y, z, n, colors, { speed = 110, up = 160, size = [2, 5], life = [0.4, 0.8], grav = 320 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(speed * 0.3, speed);
    g.particles.spawn({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: rand(up * 0.3, up), gz: grav, life: rand(...life), size: rand(...size), sizeEnd: 1, colors });
  }
}

// The big landing every climax shares: layered shockwave rings, a crater, flying rock and dust, and a hit-pause.
function crater(a, g, x, y, { r = 50, rgb, ring = '#ffffff', mark, stop = 0.12, shake = 14 } = {}) {
  g.spawn(new Ring(x, y, { r0: 8, r1: 440, life: 0.6, color: ring, width: 8 }));
  g.spawn(new Ring(x, y, { r0: 8, r1: 260, life: 0.5, color: css(rgb), width: 5 }));
  g.spawn(new Ring(x, y, { r0: 4, r1: 120, life: 0.35, color: '#ffffff', width: 3 }));
  g.spawn(new Glow(x, y, 12, r * 1.8, rgb, 0.5));
  g.marks.fracture(x, y, r, 7.5);
  mark?.(x, y, r * 0.8);
  debris(g, x, y, 30, 200);
  dustCloud(g, x, y, 18, 7);
  g.hitstop(stop);
  g.punch(x, y, 0.16, 0.5);
  a.boom(shake);
}

// Moves the user in a straight line to `to` over `dur`, trailing afterimages (and speed lines, given a colour).
// `onStep(k)` runs every frame with the progress 0…1.
function glide(a, g, u, to, dur, ghost, { lines, onStep } = {}) {
  const from = { x: u.x, y: u.y }, ang = Math.atan2(to.y - from.y, to.x - from.x);
  let k = 0;
  u.phasing = true;
  a.ticks.push(dt => {
    if (k >= 1) return;
    k = Math.min(1, k + dt / dur);
    u.x = from.x + (to.x - from.x) * k;
    u.y = from.y + (to.y - from.y) * k;
    g.spawn(new Afterimage(u, 0.3, ghost));
    if (lines) speedLines(g, u, ang, lines);
    onStep?.(k);
    if (k >= 1) u.phasing = false;
  });
}

// A charge through the foe: `onContact` fires once, when the user reaches it (or the end of the run).
function charge(a, g, u, t, to, dur, ghost, onContact, lines) {
  let hit = false;
  glide(a, g, u, to, dur, ghost, {
    lines,
    onStep: k => {
      if (hit || (u.distTo(t) >= u.radius + t.radius + 10 && k < 1)) return;
      hit = true;
      onContact();
    },
  });
}

// A point `d` past the foe along the user's line to it.
function through(u, t, d) {
  const ang = u.aimAt(t), dist = u.distTo(t) + d;
  return { ang, x: clampX(u.x + Math.cos(ang) * dist), y: clampY(u.y + Math.sin(ang) * dist) };
}

// Speed lines streaming back from a charging Pokémon.
function speedLines(g, u, ang, color) {
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  for (let i = 0; i < 2; i++) {
    const off = rand(-18, 18), x = u.x + nx * off, y = u.y - u.bodyZ + ny * off;
    g.spawn(new BeamLine(x - Math.cos(ang) * 20, y - Math.sin(ang) * 20, x - Math.cos(ang) * rand(70, 120), y - Math.sin(ang) * rand(70, 120), 0.16, color, 2));
  }
}

export const TYPE_ULTS = {
  // Giga Impact: wrapped in blinding energy, the user tears the ground under itself and rockets through the foe in
  // one straight charge; the aftershock rolls across the arena and the user is left panting.
  gigaImpact(a, g, u, t) {
    const C = ['#ffffff', '#fff2c8', '#e8dcc0'], rgb = [255, 236, 190];
    g.spawn(new ScreenDim(2, 0.55, '40,32,18'));
    g.spawn(new EnergyAura(u, 0.95, true, { glow: rgb, rings: ['#ffffff', '#ffd98a'] }));
    sfx.beamCharge(0.7);
    let wind = 0.7;
    a.ticks.push(dt => {
      if ((wind -= dt) <= 0) return;
      a.converge(130, dt, C, 44);
      if (Math.random() < 0.3) dustCloud(g, u.x + rand(-16, 16), u.y + rand(-5, 5), 1, 3);
    });
    a.later(0.25, () => { g.marks.fracture(u.x, u.y, 20, 6); g.shake(3, 0.45); });
    a.later(0.45, () => {
      const p = through(u, t, 300);
      g.spawn(new BeamLine(u.x, u.y, p.x, p.y, 0.25, 'rgba(255,240,200,0.7)', 3));
    });
    let at = null;
    a.later(0.7, () => {
      const p = through(u, t, 70);
      windBurst(g, u.x, u.y, 6, 26, C);
      dustCloud(g, u.x, u.y, 10, 5);
      a.anim('Attack', 2);
      sfx.dash();
      sfx.whoosh();
      charge(a, g, u, t, p, 0.17, '#fff2c8', () => {
        at = { x: t.x, y: t.y };
        crater(a, g, t.x, t.y, { rgb, mark: (x, y, r) => g.marks.energy(x, y, r, rgb, 6), stop: 0.14 });
        sfx.quake();
        a.strike(0.7, { knockback: 360, stagger: 0.7, dirX: Math.cos(p.ang), dirY: Math.sin(p.ang) });
      }, '#fff6dc');
    });
    a.later(1.3, () => {
      const p = at ?? t;
      g.spawn(new Ring(p.x, p.y, { r0: 20, r1: 520, life: 0.7, color: '#ffffff', width: 9 }));
      g.spawn(new Ring(p.x, p.y, { r0: 10, r1: 360, life: 0.6, color: '#ffe6a8', width: 5 }));
      for (let i = 0; i < 8; i++) {
        const q = a.spot();
        dustCloud(g, q.x, q.y, 3, 5);
      }
      g.shake(8, 0.4);
      sfx.explosion();
      a.strike(0.3, { knockback: 220, stagger: 0.4 });
    });
    // It has to recharge: steam puffs off the user.
    a.later(1.6, () => spray(g, u.x, u.y, u.headZ, 8, ['#ffffff', '#d8d0c0'], { speed: 30, up: 60, grav: -40, size: [3, 6], life: [0.5, 0.9] }));
    a.end(1.9);
  },

  // Bug Buzz: the user's wings resonate, the air shimmers in rings, then crescent sound waves roll into the foe one
  // after another until the whole swarm of sound collapses on it.
  bugBuzz(a, g, u, t) {
    const C = ['#f4ffd0', '#c8f060', '#7aa020'], rgb = [180, 230, 70];
    g.spawn(new ScreenDim(2.1, 0.5, '18,30,4'));
    g.spawn(new EnergyAura(u, 1.4, false, { glow: rgb, rings: ['#f4ffd0', '#a8d040'] }));
    sfx.zap(0.7);
    for (let i = 0; i < 9; i++) {
      a.later(i * 0.075, () => {
        g.spawn(new Ring(u.x, u.y, { z: u.bodyZ, r0: 8, r1: 46 + i * 3, life: 0.3, color: C[i % 3], width: 2, layer: 'air' }));
        g.shake(1.5, 0.08);
      });
    }
    let hum = 0.7;
    a.ticks.push(dt => {
      if ((hum -= dt) <= 0) return;
      for (let i = 0; i < 2; i++) {
        const ang = rand(0, Math.PI * 2), r = rand(22, 40);
        g.particles.spawn({ x: u.x + Math.cos(ang) * r, y: u.y + Math.sin(ang) * r * 0.5, z: u.bodyZ + rand(-10, 10), vx: -Math.sin(ang) * 120, vy: Math.cos(ang) * 60, life: 0.25, size: rand(1.5, 2.5), colors: ['#2a3a10', '#f4ffd0'] });
      }
    });
    // Six sound waves, each a crescent travelling from the user to the foe.
    for (let w = 0; w < 6; w++) {
      a.later(0.7 + w * 0.13, () => {
        const ang = u.aimAt(t), d = u.distTo(t);
        a.anim('Shoot', 2);
        sfx.pulse();
        g.spawn(new Ring(u.x, u.y, { z: u.bodyZ, r0: 10, r1: 70, life: 0.25, color: C[w % 2], width: 3, layer: 'air' }));
        for (let j = 0; j <= 5; j++) {
          a.later(j * 0.035, () => {
            const k = j / 5, x = u.x + Math.cos(ang) * d * k, y = u.y + Math.sin(ang) * d * k;
            g.spawn(new SlashArc(x, y, u.bodyZ * (1 - k) + t.bodyZ * k, ang, { radius: 14 + j * 5, spread: 1.7, colors: [C[w % 2], '#ffffff'], width: 3, life: 0.2 }));
          });
        }
        a.later(0.18, () => {
          g.spawn(new Ripple(t, C[0]));
          a.strike(0.09, { knockback: 50, stagger: 0.25 });
        });
      });
    }
    // The swarm closes in and bursts.
    a.later(1.55, () => {
      let left = 0.35;
      a.ticks.push(dt => { if ((left -= dt) > 0) inward(g, t.x, t.y, t.bodyZ, 5, 90, ['#2a3a10', '#c8f060', '#f4ffd0']); });
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 50, rgb, 0.35, true));
      sfx.zap(0.35);
    });
    a.later(1.9, () => {
      g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 6, r1: 140, life: 0.4, color: '#f4ffd0', width: 6, layer: 'air' }));
      g.spawn(new Ring(t.x, t.y, { r0: 6, r1: 300, life: 0.55, color: C[1], width: 4 }));
      leafBurst(g, t.x, t.y, t.bodyZ, 18);
      spray(g, t.x, t.y, t.bodyZ, 24, ['#f4ffd0', '#a8d040', '#2a3a10']);
      g.marks.energy(t.x, t.y, 34, rgb, 6);
      g.hitstop(0.1);
      a.boom(10);
      a.strike(0.46, { knockback: 280, stagger: 0.5 });
    });
    a.end(2.2);
  },

  // Eruption: the ground cracks and glows around the user, it bursts like a volcano, molten rock rains over the
  // arena, and finally the earth under the foe blows open.
  eruption(a, g, u, t) {
    const LAVA = [255, 120, 40], HOT = [255, 210, 110];
    g.spawn(new ScreenDim(2.6, 0.55, '44,10,2'));
    g.spawn(new EnergyAura(u, 0.8, false, { glow: LAVA, rings: ['#ffd060', '#ff5a1a'] }));
    sfx.quake();
    let rumble = 0.6;
    a.ticks.push(dt => {
      if ((rumble -= dt) <= 0) return;
      if (Math.random() < 0.6) g.particles.spawn({ x: u.x + rand(-20, 20), y: u.y + rand(-8, 8), z: 2, vz: rand(40, 90), life: 0.6, size: rand(2, 3), sizeEnd: 0.5, colors: FIRE });
    });
    for (let ring = 1; ring <= 4; ring++) {
      a.later(ring * 0.1, () => {
        for (let k = 0; k < 5; k++) {
          const ang = (k / 5) * Math.PI * 2 + ring, r = ring * 16;
          const x = u.x + Math.cos(ang) * r, y = u.y + Math.sin(ang) * r * 0.7;
          g.marks.fracture(x, y, 12, 6);
          g.marks.scorch(x, y, 6, 6);
        }
        g.shake(2 + ring, 0.15);
      });
    }
    // The volcano.
    a.later(0.6, () => {
      g.spawn(new Pillar(u.x, u.y, 0.8, LAVA, 560));
      g.spawn(new Pillar(u.x, u.y, 0.6, HOT, 420));
      g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 160, life: 0.45, color: '#ffd060', width: 6 }));
      spray(g, u.x, u.y, u.bodyZ, 34, FIRE, { speed: 90, up: 420, size: [3, 6], life: [0.7, 1.1], grav: 420 });
      g.marks.scorch(u.x, u.y, 34, 7);
      a.anim('Shoot', 1);
      a.boom(11);
      a.strike(0.15, { knockback: 120, stagger: 0.3 });
    });
    // Molten rock rains down; every fourth lands on the foe.
    const n = 16;
    for (let i = 0; i < n; i++) {
      a.later(0.75 + i * 0.05, () => {
        const aimed = i % 4 === 0, p = aimed ? { x: t.x, y: t.y } : a.spot();
        g.spawn(new Falling(p.x, p.y, 0.45, 'orb', () => {
          a.erupt(p.x, p.y, FIRE, LAVA, 90);
          g.marks.scorch(p.x, p.y, rand(10, 15), 6);
          spray(g, p.x, p.y, 4, 8, FIRE, { speed: 70, up: 140 });
          g.shake(3, 0.12);
          if (i % 2 === 0) sfx.explosion();
          if (aimed) a.strike(0.35 / 4, { knockback: 90, stagger: 0.3 });
        }, LAVA));
      });
    }
    // The ground under the foe glows, then blows.
    a.later(1.55, () => {
      const m = g.spawn(new GroundMarker(t.x, t.y, 34, '255,110,30'));
      a.owned.push(m);
      a.ticks.push(() => m.set(t.x, t.y));
      a.markLava = m;
      sfx.quake();
    });
    a.later(1.9, () => {
      a.markLava.dead = true;
      a.erupt(t.x, t.y, FIRE, HOT, 420);
      g.spawn(new Pillar(t.x, t.y, 0.7, LAVA, 520));
      spray(g, t.x, t.y, 6, 30, FIRE, { speed: 120, up: 380, size: [3, 6], life: [0.6, 1], grav: 420 });
      crater(a, g, t.x, t.y, { r: 46, rgb: LAVA, ring: '#ffe0a0', mark: (x, y, r) => g.marks.scorch(x, y, r, 7) });
      a.strike(0.5, { knockback: 290, stagger: 0.6 });
    });
    a.end(2.5);
  },

  // Future Sight: the user's eyes glow, a sphere of psychic power rises out of sight, a lock-on mark settles on the
  // foe while time folds in around it, and then the attack from the future crashes down.
  futureSight(a, g, u, t) {
    const PINK = [255, 140, 210], C = ['#ffffff', '#ffb8e4', '#c060ff'];
    g.spawn(new ScreenDim(2.4, 0.55, '28,6,30'));
    g.spawn(new Glow(u.x, u.y, u.headZ, 16, PINK, 0.6, true));
    g.spawn(new EnergyAura(u, 0.7, false, { glow: PINK, rings: ['#ffd0f0', '#c060ff'] }));
    sfx.beamCharge(0.5);
    let gather = 0.5;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(110, dt, C, 40); });
    // The sphere rises off the top of the screen.
    a.later(0.5, () => {
      const orb = g.spawn(new Glow(u.x, u.y, u.bodyZ, 26, PINK, 0.45));
      a.anim('Shoot', 1);
      a.ticks.push(dt => { orb.z += dt * 700; });
      for (const [r1, c] of [[120, '#ffd0f0'], [80, '#c060ff']]) g.spawn(new Ring(u.x, u.y, { r0: 6, r1, life: 0.4, color: c, width: 3 }));
      sfx.pulse();
    });
    // The future locks onto the foe: a mark that follows it and rings folding in.
    a.later(0.65, () => {
      const m = g.spawn(new GroundMarker(t.x, t.y, 30, '255,140,210'));
      a.owned.push(m);
      a.ticks.push(() => m.set(t.x, t.y));
      a.sightMark = m;
      sfx.zap(1);
    });
    for (let i = 0; i < 5; i++) {
      a.later(0.7 + i * 0.18, () => g.spawn(new Ring(t.x, t.y, { r0: 100, r1: 8, life: 0.35, color: C[i % 3], width: 2 })));
    }
    // Echoes of the attack flicker in around it first.
    for (let i = 0; i < 5; i++) {
      a.later(0.8 + i * 0.1, () => {
        const ang = (i / 5) * Math.PI * 2, x = clampX(t.x + Math.cos(ang) * 100), y = clampY(t.y + Math.sin(ang) * 75);
        g.spawn(new Glow(x, y, 14, 18, PINK, 0.25));
        g.spawn(new Missile(x, y, t.x, t.y, 14, 0.25, 'orb', () => {
          g.spawn(new Ripple(t, '#ffb8e4'));
          a.strike(0.05, { knockback: 40, stagger: 0.25 });
        }, PINK));
        sfx.shard();
      });
    }
    // The attack arrives.
    a.later(1.65, () => {
      a.sightMark.dead = true;
      g.spawn(new BeamLine(t.x, t.y - 460, t.x, t.y, 0.5, '#ffb8e4', 18));
      g.spawn(new BeamLine(t.x, t.y - 460, t.x, t.y, 0.35, '#ffffff', 6));
      g.spawn(new Pillar(t.x, t.y, 0.6, PINK, 460));
      g.spawn(new PsyDome(t.x, t.y, 70, 0.6, PINK));
      g.spawn(new Ripple(t, '#ffffff'));
      g.flash(0.12);
      crater(a, g, t.x, t.y, { r: 40, rgb: PINK, ring: '#ffd0f0', mark: (x, y, r) => g.marks.energy(x, y, r, PINK, 6) });
      a.strike(0.75, { knockback: 280, stagger: 0.6 });
    });
    a.end(2.3);
  },

  // Gunk Shot: the user gathers a heap of sludge and hurls it; the glob bursts over the foe in a shower of toxic
  // blobs, and a geyser of poison erupts under it.
  gunkShot(a, g, u, t) {
    const SLUDGE = [170, 70, 200], C = ['#f0d0ff', '#b050d0', '#5a1a6a'];
    g.spawn(new ScreenDim(2.5, 0.6, '30,6,36'));
    g.spawn(new Glow(u.x, u.y, 2, 40, SLUDGE, 0.5, true));
    let ooze = 0.5;
    a.ticks.push(dt => {
      if ((ooze -= dt) <= 0) return;
      a.converge(90, dt, C, 36);
      if (Math.random() < 0.4) g.particles.spawn({ x: u.x + rand(-18, 18), y: u.y + rand(-6, 6), z: 2, vz: rand(20, 50), life: 0.4, size: rand(2, 4), colors: C });
    });
    sfx.hydro(0.5);
    a.later(0.5, () => {
      const m = a.mouth();
      a.anim('Shoot', 1);
      sfx.whoosh();
      g.spawn(new Missile(m.x, m.y, t.x, t.y, Math.max(40, m.z), 0.4, 'bomb', () => {
        g.spawn(new Ring(t.x, t.y, { r0: 6, r1: 90, life: 0.35, color: C[1], width: 5 }));
        g.marks.energy(t.x, t.y, 40, SLUDGE, 6);
        spray(g, t.x, t.y, t.bodyZ, 30, C, { speed: 150, up: 200, size: [3, 6] });
        a.boom(9);
        sfx.splash();
        a.strike(0.35, { knockback: 160, stagger: 0.4 });
        // The glob bursts into a shower of blobs.
        for (let i = 0; i < 12; i++) {
          a.later(0.05 + i * 0.05, () => {
            const aimed = i % 3 === 0, p = aimed ? { x: t.x, y: t.y } : { x: clampX(t.x + rand(-130, 130)), y: clampY(t.y + rand(-100, 100)) };
            g.spawn(new Falling(p.x, p.y, 0.4, 'orb', () => {
              g.marks.energy(p.x, p.y, rand(10, 16), SLUDGE, 6);
              spray(g, p.x, p.y, 3, 6, C, { speed: 60, up: 90 });
              if (aimed) a.strike(0.25 / 4, { knockback: 50, stagger: 0.25 });
            }, SLUDGE));
          });
        }
      }, SLUDGE, 2.6));
    });
    // The poison geyser.
    a.later(1.75, () => {
      g.spawn(new Pillar(t.x, t.y, 0.7, SLUDGE, 380));
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 70, SLUDGE, 0.6));
      for (let i = 0; i < 16; i++) {
        g.particles.spawn({ x: t.x + rand(-20, 20), y: t.y + rand(-8, 8), z: rand(0, 30), vx: rand(-30, 30), vy: rand(-12, 12), vz: rand(20, 70), drag: 1.5, life: rand(0.8, 1.2), size: rand(6, 11), sizeEnd: 2, colors: ['#7a2a9a', '#5a1a6a', '#3a0a40'] });
      }
      spray(g, t.x, t.y, 4, 18, C, { speed: 60, up: 300, grav: 400 });
      g.hitstop(0.08);
      a.boom(10);
      a.strike(0.4, { knockback: 220, stagger: 0.5 });
    });
    a.later(2, () => { if (t.alive && !t.hidden) g.applyStatus(t, 'poison', { source: u, dur: 6 }); });
    a.end(2.4);
  },

  // Fissure: the user stamps, a crack races across the arena to the foe, the ground gapes open around it with rock
  // jutting from the rim, and the earth slams shut.
  fissure(a, g, u, t) {
    const EARTH = [200, 160, 80];
    g.spawn(new ScreenDim(2.4, 0.5, '30,20,8'));
    a.anim('Attack', 1);
    a.later(0.15, () => {
      g.marks.fracture(u.x, u.y, 30, 7);
      dustCloud(g, u.x, u.y, 12, 6);
      g.spawn(new Ring(u.x, u.y, { r0: 8, r1: 90, life: 0.4, color: '#e8d0a0', width: 4 }));
      g.shake(7, 0.3);
      sfx.quake();
    });
    // The crack runs along the ground to the foe (and a little past it).
    a.later(0.25, () => {
      const ang = u.aimAt(t), d = u.distTo(t) + 50, steps = Math.max(6, Math.round(d / 18));
      for (let i = 1; i <= steps; i++) {
        a.later(i * 0.035, () => {
          const k = i / steps, x = clampX(u.x + Math.cos(ang) * d * k + rand(-5, 5)), y = clampY(u.y + Math.sin(ang) * d * k + rand(-5, 5));
          g.marks.fracture(x, y, rand(10, 15), 7);
          dustCloud(g, x, y, 2, 4);
          if (i % 3 === 0) g.spawn(new Spike(x + rand(-14, 14), y + rand(-6, 6), 'stone', 0.6));
          g.shake(2, 0.06);
          if (i === steps) {
            debris(g, t.x, t.y, 12, 120);
            a.strike(0.3, { knockback: 60, stagger: 0.5 });
          }
        });
      }
    });
    // The ground opens around the foe.
    a.later(1, () => {
      const pit = g.spawn(new GroundMarker(t.x, t.y, 46, '20,12,4'));
      a.owned.push(pit);
      a.ticks.push(() => pit.set(t.x, t.y));
      a.pit = pit;
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        a.later(k * 0.03, () => g.spawn(new Spike(t.x + Math.cos(ang) * 46, t.y + Math.sin(ang) * 32, 'stone', 0.9)));
      }
      g.marks.fracture(t.x, t.y, 56, 7.5);
      dustCloud(g, t.x, t.y, 20, 6);
      g.shake(10, 0.6);
      sfx.quake();
    });
    // It slams shut.
    a.later(1.6, () => {
      a.pit.dead = true;
      for (let i = 0; i < 6; i++) {
        const p = a.spot();
        g.marks.fracture(p.x, p.y, rand(16, 26), 7);
        dustCloud(g, p.x, p.y, 4, 5);
      }
      crater(a, g, t.x, t.y, { r: 70, rgb: EARTH, ring: '#e8d0a0', shake: 16 });
      sfx.quake();
      a.strike(0.7, { knockback: 140, stagger: 0.9 });
    });
    a.end(2.3);
  },

  // Dynamic Punch: the user's fist blazes, it closes in with a flurry of jabs, an uppercut launches the foe, and a
  // final punch drives it into the ground in an explosion.
  dynamicPunch(a, g, u, t) {
    const ORANGE = [255, 140, 60], C = ['#fff0d0', '#ffb070', '#e0763a'];
    g.spawn(new ScreenDim(2.2, 0.5, '36,14,4'));
    g.spawn(new EnergyAura(u, 0.6, false, { glow: ORANGE, rings: ['#fff0d0', '#e0763a'] }));
    const fist = () => { const m = a.mouth(); return { x: m.x, y: m.y, z: u.bodyZ }; };
    let f = fist();
    g.spawn(new Glow(f.x, f.y, f.z, 30, ORANGE, 0.5, true));
    let gather = 0.5;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(120, dt, C, 36); });
    sfx.beamCharge(0.5);
    // Close in.
    a.later(0.5, () => {
      const ang = u.aimAt(t), gap = u.radius + t.radius + 4;
      const to = { x: clampX(t.x - Math.cos(ang) * gap), y: clampY(t.y - Math.sin(ang) * gap) };
      glide(a, g, u, to, 0.12, '#ffb070', { lines: '#ffd8a8' });
      sfx.dash();
    });
    // A flurry of jabs.
    for (let i = 0; i < 5; i++) {
      a.later(0.66 + i * 0.09, () => {
        u.face(t.x, t.y);
        a.anim('Attack', 3);
        const x = t.x + rand(-8, 8), y = t.y + rand(-4, 4);
        g.spawn(new Ring(x, y, { z: t.bodyZ, r0: 3, r1: 26, life: 0.18, color: C[i % 3], width: 3, layer: 'air' }));
        spray(g, x, y, t.bodyZ, 5, C, { speed: 90, up: 60, size: [1.5, 3], life: [0.2, 0.35] });
        g.shake(3, 0.08);
        sfx.hit(false);
        a.strike(0.06, { knockback: 0, stagger: 0.3 });
      });
    }
    // Uppercut: the foe is launched.
    a.later(1.15, () => {
      if (!t.alive || t.hidden) return;
      a.anim('Attack', 1.5);
      g.spawn(new BeamLine(t.x, t.y, t.x, t.y - 140, 0.25, '#ffd8a8', 6));
      windBurst(g, t.x, t.y, t.bodyZ, 14, C);
      a.lift(t, { x: t.x, y: t.y, z: 120 }, 0.28, 0, null, '#ffb070', C, true);
      g.hitstop(0.06);
      sfx.whoosh();
      a.strike(0.2, { knockback: 0, stagger: 0.6 });
    });
    // The finishing blow drives it into the ground.
    a.later(1.55, () => {
      f = fist();
      g.spawn(new Glow(t.x, t.y, 120, 46, ORANGE, 0.25, true));
      sfx.beamCharge(0.15);
    });
    a.later(1.7, () => {
      const land = () => {
        crater(a, g, t.x, t.y, { r: 50, rgb: ORANGE, ring: '#fff0d0', mark: (x, y, r) => g.marks.energy(x, y, r, ORANGE, 6), stop: 0.14, shake: 15 });
        g.spawn(new Pillar(t.x, t.y, 0.5, ORANGE, 240));
        spray(g, t.x, t.y, t.bodyZ, 26, FIRE, { speed: 150, up: 220 });
        sfx.explosion();
        a.strike(0.5, { knockback: 200, stagger: 0.8 });
      };
      if (t.held) a.lift(t, { x: t.x, y: t.y, z: 0 }, 0.12, 0, land, '#ffb070', C);
      else land();
    });
    a.end(2.2);
  },

  // Calamity Strike: darkness swallows the arena, red eyes lock on, the user strikes from the shadows from every
  // side, the cuts close into a star, and one huge cross-cut shatters the dark.
  calamityStrike(a, g, u, t) {
    const VIOLET = [140, 70, 190], C = ['#e0c8ff', '#8a4ac0', '#1a0f24'];
    g.spawn(new ScreenDim(2.3, 0.8, '6,2,12'));
    g.spawn(new Glare(u, t));
    sfx.roar();
    a.later(0.3, () => {
      for (let i = 0; i < 3; i++) g.spawn(new Afterimage(u, 0.3 + i * 0.1, '#2a1438'));
      spray(g, u.x, u.y, u.bodyZ, 16, ['#2a1438', '#6a3a8a'], { speed: 40, up: 50, grav: -60, size: [4, 8] });
      u.phasing = true;
    });
    const L = 280;
    for (let i = 0; i < 6; i++) {
      a.later(0.45 + i * 0.13, () => {
        const ang = (i / 6) * Math.PI * 2 + 0.3;
        g.spawn(new Afterimage(u, 0.3, '#8a4ac0'));
        u.x = clampX(t.x + Math.cos(ang) * 30);
        u.y = clampY(t.y + Math.sin(ang) * 22);
        u.face(t.x, t.y);
        a.anim(i % 2 ? 'Attack' : 'Swing', 2.5);
        const cut = ang + Math.PI / 2, dx = Math.cos(cut) * L / 2, dy = Math.sin(cut) * L / 2;
        g.spawn(new BeamLine(t.x - dx, t.y - dy - 12, t.x + dx, t.y + dy - 12, 0.3, '#6a3a8a', 7));
        g.spawn(new BeamLine(t.x - dx, t.y - dy - 12, t.x + dx, t.y + dy - 12, 0.2, '#ffffff', 2));
        g.spawn(new SlashArc(t.x, t.y, t.bodyZ, cut, { radius: 26, spread: 2.4, colors: ['#8a4ac0', '#ffffff'], width: 5, mirror: i % 2 === 1 }));
        g.shake(4, 0.1);
        sfx.slash();
        a.strike(0.07, { knockback: 30, stagger: 0.3 });
      });
    }
    // The cuts close into a star around the foe…
    a.later(1.3, () => {
      u.phasing = false;
      for (let k = 0; k < 5; k++) {
        const ang = (k / 5) * Math.PI;
        g.spawn(new BeamLine(t.x - Math.cos(ang) * 120, t.y - Math.sin(ang) * 90 - 12, t.x + Math.cos(ang) * 120, t.y + Math.sin(ang) * 90 - 12, 0.4, '#b48cff', 3));
      }
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 60, VIOLET, 0.3, true));
      sfx.zap(0.3);
    });
    // …and one cross-cut shatters the darkness.
    a.later(1.6, () => {
      for (const ang of [Math.PI / 4, -Math.PI / 4]) {
        const dx = Math.cos(ang) * 290, dy = Math.sin(ang) * 290;
        g.spawn(new BeamLine(t.x - dx, t.y - dy - 12, t.x + dx, t.y + dy - 12, 0.45, '#8a4ac0', 14));
        g.spawn(new BeamLine(t.x - dx, t.y - dy - 12, t.x + dx, t.y + dy - 12, 0.3, '#ffffff', 4));
      }
      g.flash(0.15);
      crater(a, g, t.x, t.y, { r: 44, rgb: VIOLET, ring: '#e0c8ff', mark: (x, y, r) => g.marks.energy(x, y, r, VIOLET, 6), stop: 0.14 });
      sfx.slash();
      a.strike(0.58, { knockback: 300, stagger: 0.6 });
    });
    a.end(2.2);
  },

  // Sky Attack: the user glows as wind spirals into it, takes off out of sight, the sky flashes, and it dives on the
  // foe as a blazing comet.
  skyAttack(a, g, u, t) {
    const GOLD = [255, 220, 130], C = ['#ffffff', '#ffe6a0', '#e08a3a'];
    g.spawn(new ScreenDim(2.3, 0.5, '30,20,4'));
    g.spawn(new EnergyAura(u, 1.6, true, { glow: GOLD, rings: ['#ffffff', '#ffb050'] }));
    g.spawn(new Glow(u.x, u.y, u.bodyZ, 50, GOLD, 0.7, true));
    sfx.ascend();
    let gather = 0.7;
    a.ticks.push(dt => { if ((gather -= dt) > 0) inward(g, u.x, u.y, u.bodyZ, 3, 80, ['#ffffff', '#e6f6ff', '#ffe6a0']); });
    const H = 420;
    let phase = 'charge', ft = 0, from = null, shadow = null;
    a.ticks.push(dt => {
      shadow?.set(t.x, t.y);
      if (phase === 'rise') {
        u.zOverride = Math.min(H, u.zOverride + dt * 1100);
        g.spawn(new Afterimage(u, 0.2, '#ffe6a0'));
      }
      if (phase !== 'dive') return;
      ft += dt;
      const k = Math.min(1, ft / 0.26);
      u.x = from.x + (t.x - from.x) * k;
      u.y = from.y + (t.y - from.y) * k;
      u.zOverride = H * (1 - k * k);
      g.spawn(new Afterimage(u, 0.3, '#ffb050'));
      g.particles.spawn({ x: u.x + rand(-8, 8), y: u.y, z: u.zOverride + u.bodyZ, vz: rand(-20, 20), life: 0.4, size: rand(3, 6), sizeEnd: 1, colors: FIRE });
      if (k < 1) return;
      phase = 'done';
      if (shadow) shadow.dead = true;
      u.zOverride = null;
      u.invuln = false;
      windBurst(g, u.x, u.y, 8, 40, C);
      spray(g, u.x, u.y, 8, 24, ['#ffffff', '#fff6dc', '#ffe6a0'], { speed: 160, up: 160, size: [2, 4] });
      crater(a, g, u.x, u.y, { r: 56, rgb: GOLD, ring: '#ffffff', mark: (x, y, r) => g.marks.energy(x, y, r, GOLD, 6) });
      sfx.quake();
      a.strike(0.75, { knockback: 330, stagger: 0.7 });
    });
    // Take-off.
    a.later(0.7, () => {
      u.invuln = true;
      u.zOverride = u.z;
      phase = 'rise';
      windBurst(g, u.x, u.y, 6, 30, C);
      dustCloud(g, u.x, u.y, 12, 6);
      a.anim('Hop', 1);
      sfx.whoosh();
    });
    a.later(0.95, () => {
      g.flash(0.08);
      g.spawn(new BeamLine(0, 100, 360, 70, 0.4, '#ffe6a0', 6));
      shadow = g.spawn(new GroundMarker(t.x, t.y, 32, '255,200,110'));
      a.owned.push(shadow);
    });
    // The dive comes in from high above, off to one side.
    a.later(1.2, () => {
      phase = 'dive';
      from = { x: clampX(t.x + (t.x < 180 ? 120 : -120)), y: clampY(t.y - 60) };
      // The comet's path from the sky, so the dive reads even while it is above the screen.
      for (const [w, c, life] of [[12, '#ffb050', 0.4], [4, '#ffffff', 0.3]]) g.spawn(new BeamLine(from.x, from.y - H, t.x, t.y - t.bodyZ, life, c, w));
      sfx.dash();
    });
    a.later(1.75, () => {
      g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 480, life: 0.6, color: '#ffe6a0', width: 6 }));
      windBurst(g, u.x, u.y, 10, 30, C);
      g.shake(6, 0.3);
      a.strike(0.25, { knockback: 200 });
    });
    a.end(2.2);
  },

  // Outrage: the user roars and is wreathed in draconic fire, rampages through the foe again and again (faster each
  // time), ends in a blast of dragon energy, and is left dizzy from fatigue.
  outrage(a, g, u, t) {
    const DRAGON = [150, 90, 255], C = ['#ffd0e0', '#ff5a7a', '#8a5cff'];
    g.spawn(new ScreenDim(2.6, 0.55, '30,6,20'));
    g.spawn(new EnergyAura(u, 2, true, { glow: DRAGON, rings: ['#ff5a7a', '#b48cff'] }));
    sfx.roar();
    g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 200, life: 0.45, color: '#ff8aa8', width: 5 }));
    g.shake(6, 0.4);
    let rage = 2;
    a.ticks.push(dt => {
      if ((rage -= dt) <= 0 || Math.random() > 0.7) return;
      g.particles.spawn({ x: u.x + rand(-14, 14), y: u.y + rand(-5, 5), z: u.bodyZ + rand(-6, 10), vz: rand(50, 110), life: 0.45, size: rand(3, 5), sizeEnd: 1, colors: ['#ffd0e0', '#ff5a7a', '#8a5cff', '#3a1a90'] });
    });
    const durs = [0.2, 0.18, 0.16, 0.14, 0.12];
    let at = 0.45;
    durs.forEach((dur, i) => {
      a.later(at, () => {
        const p = through(u, t, 80);
        a.anim('Attack', 2.5);
        sfx.dash();
        charge(a, g, u, t, p, dur, i % 2 ? '#ff5a7a' : '#b48cff', () => {
          for (const m of [false, true]) g.spawn(new SlashArc(t.x, t.y, t.bodyZ, p.ang + (m ? 0.6 : -0.6), { radius: 28, spread: 2.4, colors: ['#ff5a7a', '#ffffff'], width: 6, mirror: m }));
          spray(g, t.x, t.y, t.bodyZ, 10, C, { speed: 120, up: 100, size: [2, 4], life: [0.25, 0.45] });
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 6, r1: 60, life: 0.3, color: C[i % 3], width: 4, layer: 'air' }));
          g.hitstop(0.05);
          g.shake(7, 0.2);
          sfx.slash();
          a.strike(0.11, { knockback: 140, stagger: 0.45, dirX: Math.cos(p.ang), dirY: Math.sin(p.ang) });
        }, '#ff8aa8');
      });
      at += dur + 0.07;
    });
    // The final blast of dragon energy.
    a.later(at + 0.15, () => {
      g.spawn(new Pillar(u.x, u.y, 0.6, DRAGON, 460));
      g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 480, life: 0.6, color: '#b48cff', width: 8 }));
      g.spawn(new Ring(u.x, u.y, { r0: 6, r1: 320, life: 0.5, color: '#ff5a7a', width: 5 }));
      g.marks.energy(u.x, u.y, 46, DRAGON, 6);
      a.anim('Shoot', 1);
      a.boom(11);
      sfx.roar();
      a.later((u.distTo(t) / 480) * 0.6, () => {
        g.spawn(new Glow(t.x, t.y, t.bodyZ, 44, DRAGON, 0.3));
        a.strike(0.45, { knockback: 300, stagger: 0.5 });
      });
    });
    // Worn out: dizzy stars circle its head.
    a.later(at + 0.55, () => {
      let dizzy = 0.6;
      a.ticks.push(dt => {
        if ((dizzy -= dt) <= 0) return;
        const k = a.t * 8;
        for (let i = 0; i < 3; i++) g.particles.spawn({ x: u.x + Math.cos(k + i * 2.1) * 12, y: u.y + Math.sin(k + i * 2.1) * 5, z: u.headZ + 8, life: 0.12, size: 2.5, colors: ['#fff6b0'], fade: false });
      });
    });
    a.end(at + 1.1);
  },
};
