// Move sequences: a reusable way to give a move its own staged animation without writing a new Action class.
//
// A recipe (data/move-anims.js) is a list of timed steps. The move locks the spot it aims at when it starts
// (the foe's position, or a point in front of the user), and every step runs at its time:
//   anim      the user's sprite animation ('Charge', 'Shoot', 'Attack'…)
//   gather    energy streaming into the user until `until` ({ colors, radius, rate })
//   glow      a glow on the user or `at: 'spot'` ({ rgb, r })
//   cloud     a storm cloud gathering over the spot
//   telegraph a warning circle (or `line`) on the ground at the spot, so the move can be dodged
//   lightning bolts from the sky into the spot ({ n, width, branches })
//   pillar    a column of energy at the spot ({ rgb, height })
//   meteors   things falling onto the spot ({ n, style, spread })
//   spikes    stone or ice spikes bursting out of the ground ({ n, style, spread })
//   missile   a projectile flying from the user to the spot ({ style, dur, rgb, scale })
//   orb       that projectile forming at the user's mouth before it is thrown ({ style, life, rgb, scale })
//   wave      a wave sweeping through the spot ({ rgb, foam })
//   rings     expanding rings at the spot ({ colors, r })
//   burst     particles bursting from the spot ({ colors, n, up })
//   mark      a ground mark at the spot ('scorch', 'frost', 'wet', 'fracture', 'leaves', 'burn', 'energy')
//   shake / flash / hitstop   screen feedback
//   slash     crescent slashes at the spot ({ colors, n, radius, width })
//   beam      a beam from the user's mouth to the spot ({ colors, width, life })
//   dome      a dome of energy over the spot ({ r, rgb, life })
//   tether    a link of energy between the user and the foe ({ rgb, life })
//   dim       the screen tints for a big move ({ alpha, rgb, life })
//   punch     the camera pushes in on the spot (amount)
//   afterimage  ghost copies trail the user ({ n, color })
//   lunge     the user rushes to the foe ({ dur }) and `back` returns it
//   orbit     energy circles the user until `until` ({ colors, r })
//   fx        an element burst: 'splash', 'sparks', 'leaves', 'ice', 'metal', 'debris', 'wind', 'dust', 'flames'
//   where: 'user' puts rings, burst, glow, fx and pillar on the user instead of the spot
//   hit       the damage, at that exact moment: the foe takes the move if it is within `r` of the spot
//             (dodging at the right time avoids it); knockback and stagger as given
// The move's mechanics (accuracy, secondary effects, stat changes…) all resolve inside `hit` (combat.js),
// so what the player sees and what happens can never drift apart.
import { applyHit } from './combat.js';
import { rand, Glow, Ring, Lightning, Pillar, Falling, Spike, Missile, TidalWave, StormCloud, dustCloud, sparkBurst, SlashArc, Beam, PsyDome, Tether, ScreenDim, Afterimage, ChargeOrb,
  waterSplash, electricBurst, leafBurst, iceShatter, metalSparks, debris, windBurst, FIRE } from './effects.js';
import { sfx } from './audio.js';
import { WEATHER_TINT } from './data/move-anims.js';

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

export function runSequence(action) {
  const { move, user } = action, seq = move.seq, t = action.target;
  const spot = seq.aim === 'self' ? { x: user.x, y: user.y } : seq.aim === 'front' ? action.front(seq.dist ?? 90) : { x: t.x, y: t.y };
  action.spot = spot;
  scheduleSteps(action, seq.steps, spot);
  action.at(seq.end ?? 1, () => action.finish(seq.recover ?? 0.1));
}

// Runs steps around `spot` (status moves use this for their look, with no hit step).
export function scheduleSteps(action, steps, spot) {
  const { move, user, game: g } = action, t = action.target;
  const marks = [];
  for (const step of steps) {
    action.at(step.at ?? 0, () => {
      const p = step.where === 'user' ? { x: user.x, y: user.y } : spot;
      if (step.anim) action.anim(step.anim, step.speed ?? 1);
      if (step.slash) {
        const s = step.slash;
        for (let i = 0; i < (s.n ?? 1); i++) g.spawn(new SlashArc(p.x, p.y, 14, action.aim + (i - ((s.n ?? 1) - 1) / 2) * 0.5, { radius: s.radius ?? 22, spread: s.spread ?? 2.2, colors: s.colors, width: s.width ?? 5, life: 0.3, mirror: i % 2 === 1 }));
      }
      if (step.beam) {
        const m = action.mouth();
        g.spawn(new Beam(m.x, m.y - m.z, p.x, p.y - 10, step.beam.life ?? 0.35, { width: step.beam.width ?? 14, colors: step.beam.colors }));
      }
      if (step.dome) g.spawn(new PsyDome(p.x, p.y, step.dome.r ?? 50, step.dome.life ?? 0.6, step.dome.rgb));
      if (step.tether && t.alive) g.spawn(new Tether(user, t, step.tether.life ?? 0.5, step.tether.rgb));
      if (step.dim) g.spawn(new ScreenDim(step.dim.life ?? 0.6, step.dim.alpha ?? 0.35, step.dim.rgb ?? '8,20,16'));
      if (step.punch) g.punch?.(p.x, p.y, step.punch, 0.25);
      if (step.afterimage) for (let i = 0; i < (step.afterimage.n ?? 3); i++) g.spawn(new Afterimage(user, 0.2 + i * 0.08, step.afterimage.color ?? '#ffffff'));
      if (step.lunge) action.lunge = { from: { x: user.x, y: user.y }, to: { x: t.x - Math.cos(action.aim) * (t.radius + user.radius), y: t.y - Math.sin(action.aim) * (t.radius + user.radius) }, t0: action.t, dur: step.lunge.dur ?? 0.15, ghost: step.lunge.color };
      if (step.back && action.lunge) action.lunge = { from: { x: user.x, y: user.y }, to: action.lunge.from, t0: action.t, dur: step.back.dur ?? 0.2 };
      if (step.orbit) action.orbit = { ...step.orbit, end: step.orbit.until ?? (step.at ?? 0) + 0.5 };
      if (step.fx) FX[step.fx]?.(g, p, step);
      if (step.gather) action.gatherUntil = { ...step.gather, end: step.gather.until ?? (step.at ?? 0) + 0.5 };
      if (step.glow) {
        const p = step.glow.at === 'spot' ? spot : user;
        g.spawn(new Glow(p.x, p.y, step.glow.at === 'spot' ? 8 : user.bodyZ, step.glow.r ?? 30, step.glow.rgb, step.glow.life ?? 0.5));
      }
      // The cloud gathers in the sky above the spot, where the lightning starts.
      if (step.cloud) {
        g.spawn(new StormCloud(spot.x, spot.y - 150, step.cloud.life ?? 1.2));
        action.cloudAt = 150;
      }
      if (step.telegraph) {
        const tg = step.telegraph;
        marks.push(g.spawn(new Ring(spot.x, spot.y, { r0: tg.r, r1: tg.r, life: tg.life ?? 1, color: tg.color ?? '#ffffff', width: 2, hold: true })));
      }
      if (step.lightning) {
        for (let i = 0; i < (step.lightning.n ?? 1); i++) {
          const ox = i ? rand(-18, 18) : 0;
          g.spawn(new Lightning(spot.x + ox, spot.y - (action.cloudAt ?? 260), spot.x + ox * 0.3, spot.y, step.lightning.life ?? 0.3, { width: step.lightning.width ?? 3, branches: step.lightning.branches ?? 4 }));
        }
        sfx.thunder();
      }
      if (step.pillar) g.spawn(new Pillar(spot.x, spot.y, step.pillar.life ?? 0.6, step.pillar.rgb, step.pillar.height ?? 220));
      if (step.meteors) {
        const m = step.meteors;
        for (let i = 0; i < (m.n ?? 3); i++) {
          const x = spot.x + rand(-(m.spread ?? 20), m.spread ?? 20), y = spot.y + rand(-(m.spread ?? 20), m.spread ?? 20) * 0.6;
          g.spawn(new Falling(x, y, (m.dur ?? 0.45) + i * 0.08, m.style ?? 'rock', () => { dustCloud(g, x, y, 6, 4); m.mark && g.marks[m.mark]?.(x, y, 12, 4); }, m.rgb));
        }
      }
      if (step.spikes) {
        const s = step.spikes;
        for (let i = 0; i < (s.n ?? 5); i++) {
          const a = (i / (s.n ?? 5)) * Math.PI * 2, r = i ? rand(6, s.spread ?? 22) : 0;
          g.spawn(new Spike(spot.x + Math.cos(a) * r, spot.y + Math.sin(a) * r * 0.6, s.style ?? 'rock', s.life ?? 0.7));
        }
        g.marks.fracture(spot.x, spot.y, (s.spread ?? 22) + 8, 6);
      }
      if (step.missile) {
        const ms = step.missile, m = action.mouth();
        const rgb = step.weatherTint ? WEATHER_TINT[g.weather] ?? ms.rgb : ms.rgb;
        g.spawn(new Missile(m.x, m.y, spot.x, spot.y, m.z, ms.dur ?? 0.35, ms.style ?? 'orb', () => {}, rgb ?? [255, 255, 255], ms.scale ?? 1));
      }
      if (step.orb) {
        const o = step.orb, m = action.mouth();
        g.spawn(new ChargeOrb(m.x, m.y, m.z, o.life ?? 0.3, o.style ?? 'orb', o.rgb, o.scale ?? 1));
      }
      if (step.wave) g.spawn(new TidalWave(spot.y + 70, spot.y - 70, step.wave.life ?? 0.6, step.wave.rgb, !!step.wave.foam));
      if (step.rings) step.rings.colors.forEach((c, i) => g.spawn(new Ring(p.x, p.y, { r0: 4, r1: (step.rings.r ?? 40) * (1 - i * 0.2), life: 0.3 + i * 0.08, color: c, width: 4 - i })));
      if (step.burst) {
        const b = step.burst;
        for (let i = 0; i < (b.n ?? 14); i++) {
          const a = rand(0, Math.PI * 2), sp = rand(40, 120);
          g.particles.spawn({ x: p.x, y: p.y, z: 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rand(30, b.up ?? 120), gz: 260, life: rand(0.4, 0.7), size: rand(2, 4), sizeEnd: 1, colors: b.colors });
        }
      }
      // Energy marks take the move's colour (markRgb); the rest have their own look.
      if (step.mark) g.marks[step.mark]?.(spot.x, spot.y, step.markSize ?? 22, ...(step.mark === 'energy' ? [step.markRgb ?? [255, 255, 255]] : []), 6);
      if (step.shake) g.shake(...step.shake);
      if (step.flash) g.flash(step.flash);
      if (step.hitstop) g.hitstop(step.hitstop);
      if (step.sound) sfx[step.sound]?.();
      if (step.hit) {
        for (const m of marks) m.dead = true;
        const h = step.hit, near = t.alive && !t.hidden && Math.hypot(t.x - spot.x, t.y - spot.y) <= (h.r ?? 30) + t.radius;
        if (near) {
          const a = Math.atan2(t.y - spot.y, t.x - spot.x) || action.aim;
          applyHit(g, user, t, move, { stack: action.stack, knockback: h.knockback ?? 180, stagger: h.stagger ?? 0.35, hitstop: h.hitstop ?? 0.05, shake: h.shake, dirX: Math.cos(a), dirY: Math.sin(a) });
          sparkBurst(g, t.x, t.y, t.bodyZ, true);
        }
      }
    });
  }
}

// Element bursts for the `fx` step.
const FX = {
  splash: (g, p) => waterSplash(g, p.x, p.y),
  sparks: (g, p, s) => electricBurst(g, p.x, p.y, 10, s.n ?? 16),
  leaves: (g, p, s) => leafBurst(g, p.x, p.y, 10, s.n ?? 12),
  ice: (g, p) => iceShatter(g, p.x, p.y, 10),
  metal: (g, p) => metalSparks(g, p.x, p.y, 10),
  debris: (g, p, s) => debris(g, p.x, p.y, s.n ?? 16, 140),
  wind: (g, p, s) => windBurst(g, p.x, p.y, 10, s.n ?? 20, s.colors),
  dust: (g, p, s) => dustCloud(g, p.x, p.y, s.n ?? 10, 5),
  // Wisps of shadow curling up and fading.
  wisps: (g, p, s) => {
    for (let i = 0; i < (s.n ?? 14); i++) g.particles.spawn({ x: p.x + rand(-12, 12), y: p.y + rand(-5, 5), z: rand(6, 24), vx: rand(-20, 20), vz: rand(30, 70), gz: -20, drag: 1, life: rand(0.5, 0.9), size: rand(2, 4), sizeEnd: 1, colors: ['#c8a0ff', '#7a48b8', '#3a2050'] });
  },
  flames: (g, p, s) => {
    for (let i = 0; i < (s.n ?? 18); i++) g.particles.spawn({ x: p.x + rand(-10, 10), y: p.y + rand(-6, 6), z: rand(2, 10), vx: rand(-40, 40), vy: rand(-20, 20), vz: rand(60, 160), life: rand(0.4, 0.7), size: rand(3, 6), sizeEnd: 1, colors: FIRE });
  },
};

// Every frame of a Sequence: energy streaming in or circling while it charges, and the user's lunge.
export function tickGather(action, dt) {
  const u = action.user, l = action.lunge;
  if (l) {
    const k = Math.min(1, (action.t - l.t0) / l.dur);
    u.x = l.from.x + (l.to.x - l.from.x) * k;
    u.y = l.from.y + (l.to.y - l.from.y) * k;
    if (l.ghost && Math.random() < 0.5) action.game.spawn(new Afterimage(u, 0.2, l.ghost));
    if (k >= 1) action.lunge = null;
  }
  const o = action.orbit;
  if (o && action.t <= o.end) {
    const a = action.t * 9;
    for (let i = 0; i < 2; i++) action.game.particles.spawn({ x: u.x + Math.cos(a + i * Math.PI) * (o.r ?? 22), y: u.y + Math.sin(a + i * Math.PI) * (o.r ?? 22) * 0.5, z: u.bodyZ, life: 0.3, size: rand(2, 3.5), sizeEnd: 1, colors: o.colors, fade: false });
  }
  const gth = action.gatherUntil;
  if (!gth || action.t > gth.end) return;
  for (let i = 0; i < (gth.rate ?? 40) * dt; i++) {
    const a = rand(0, Math.PI * 2), r = gth.radius ?? 34, x = u.x + Math.cos(a) * r, y = u.y + Math.sin(a) * r * 0.6;
    action.game.particles.spawn({ x, y, z: u.bodyZ + rand(-8, 12), vx: (u.x - x) / 0.35, vy: (u.y - y) / 0.35, life: 0.35, size: rand(2, 3.5), sizeEnd: 1, colors: gth.colors, fade: false });
  }
}

export const rgbOf = hex;
