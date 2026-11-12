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
//   siphon    motes of energy drifting from the spot back into the user ({ colors, n })
//   blades    swords circling the user (Swords Dance) ({ life })
//   toss      small things thrown from the user to land around the foe (hazards) ({ n, style, rgb, scale, spread })
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
// The move's mechanics (secondary effects, stat changes…) all resolve inside `hit` (combat.js),
// so what the player sees and what happens can never drift apart.
import { applyHit } from './combat.js';
import { rand, Glow, Ring, FloatText, Lightning, Pillar, Falling, Spike, Missile, TidalWave, StormCloud, dustCloud, sparkBurst, SlashArc, Beam, PsyDome, Tether, ScreenDim, Afterimage, ChargeOrb, OrbitBlades,
  waterSplash, electricBurst, leafBurst, iceShatter, metalSparks, debris, windBurst, FIRE } from './effects.js';
import { sfx } from './audio.js';
import { WEATHER_TINT } from './data/move-anims.js';
import { showShotTrail, showStrikeRelease } from './move-presentation.js';

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

// How a recipe reaches the foe (targeting.js): thrown projectiles, a strike on a spot, or an area round the user.
export function recipeKind(seq) {
  if (seq.aim === 'self') return 'self';
  if (seq.aim === 'front') return 'front';
  const hits = seq.steps.filter(s => s.hit);
  if (!hits.length) return 'strike';
  const last = Math.max(...hits.map(s => s.at ?? 0)), missiles = seq.steps.filter(s => s.missile && (s.at ?? 0) <= last);
  return missiles.length >= hits.length ? 'missile' : 'strike';
}

// How far a move reaches right now (a charged move reaches 15% further per level).
export const reachOf = move => (move.targeting?.range ?? move.range ?? 300) * (1 + 0.15 * (move.chargeLevel ?? 0));
const byAt = (a, b) => (a.at ?? 0) - (b.at ?? 0);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function runSequence(action) {
  const { move, user } = action, seq = move.seq, t = action.target, P = move.targeting;
  let spot;
  if (seq.aim === 'self') spot = { x: user.x, y: user.y };
  else if (seq.aim === 'front') spot = action.front(seq.dist ?? 90);
  else {
    // The foe's position, but never beyond the move's reach: out of range it lands short, in plain sight.
    const d = user.distTo(t) || 1, reach = reachOf(move);
    spot = d <= reach ? { x: t.x, y: t.y } : { x: user.x + ((t.x - user.x) / d) * reach, y: user.y + ((t.y - user.y) / d) * reach };
  }
  action.spot = spot;
  if (P && (P.kind === 'homing' || P.kind === 'straight')) return throwSequence(action, spot);
  // A strike drifts after the foe for a while (tracking strength in px/s), never past the move's reach.
  if (P?.kind === 'strike' && P.track > 0) action.track = { until: P.trackTime, speed: P.track, reach: reachOf(move) };
  scheduleSteps(action, seq.steps, spot);
  action.at(seq.end ?? 1, () => action.finish(seq.recover ?? 0.1));
}

// A strike's aim point follows the foe at its tracking speed until it locks; the warning marks move with it.
export function tickSpot(action, dt) {
  const tr = action.track, s = action.spot, t = action.target, u = action.user;
  if (!tr || action.t > tr.until || !t.alive || t.hidden) return;
  const dx = t.x - s.x, dy = t.y - s.y, d = Math.hypot(dx, dy), step = Math.min(d, tr.speed * dt);
  if (d > 0) {
    s.x += (dx / d) * step;
    s.y += (dy / d) * step;
  }
  const du = Math.hypot(s.x - u.x, s.y - u.y);
  if (du > tr.reach) {
    s.x = u.x + ((s.x - u.x) / du) * tr.reach;
    s.y = u.y + ((s.y - u.y) / du) * tr.reach;
  }
  for (const m of action.marks ?? []) if (!m.dead) Object.assign(m, { x: s.x, y: s.y });
}

// Projectile recipes: everything before the throw plays as designed; each thrown missile is a real projectile
// (targeting.js: speed, tracking, hitbox, reach). Its impact steps play where it actually lands, and only a
// projectile that touches the foe deals the hit.
function throwSequence(action, spot) {
  const seq = action.move.seq, steps = seq.steps;
  const hits = steps.filter(s => s.hit).sort(byAt), last = hits[hits.length - 1].at ?? 0;
  const missiles = steps.filter(s => s.missile && (s.at ?? 0) <= last).sort(byAt);
  let groups = hits.map((h, k) => {
    const from = h.at ?? 0, to = k + 1 < hits.length ? hits[k + 1].at ?? 0 : Infinity;
    return { missile: missiles[k], hitAt: from, steps: steps.filter(s => (s.at ?? 0) >= from && (s.at ?? 0) < to && !missiles.includes(s)) };
  });
  // Steps that play when a shot lands (not on the move's own clock).
  const later = new Set(groups.flatMap(gp => gp.steps));
  // One hit thrown as several shots (Air Slash, Power Gem, Tri Attack…): every shot flies and carries an equal part.
  if (hits.length === 1 && missiles.length > 1) {
    const n = missiles.length, last = groups[0], part = s => (s.hit ? { ...s, hit: { ...s.hit, part: 1 / n } } : s);
    groups = missiles.map((ms, k) => ({ missile: ms, hitAt: last.hitAt, steps: k === n - 1 ? last.steps.map(part) : [part(hits[0])] }));
  }
  scheduleSteps(action, steps.filter(s => !later.has(s) && !missiles.includes(s)), spot);
  groups.forEach((gp, k) => action.at(gp.missile.at ?? 0, () => action.game.spawn(new SeqShot(action, gp, k, groups.length))));
  action.at(seq.end ?? 1, () => action.finish(seq.recover ?? 0.1));
}

class SeqShot {
  constructor(action, gp, k = 0, n = 1) {
    const P = action.move.targeting, t = action.target, m = action.mouth(), ms = gp.missile.missile;
    Object.assign(this, { action, gp, P, x: m.x, y: m.y, x0: m.x, y0: m.y, z0: m.z, layer: 'air', isProjectile: true, dead: false, age: 0, traveled: 0, turned: 0 });
    // A projectile like any other (game.js clashes): its own move, owner and target (Rapid Spin can bat it back).
    Object.assign(this, { move: action.move, user: action.user, target: t, elem: action.move.type, radius: P.hitbox, reacted: new Set() });
    // Thrown at where the foe is now; a volley with a fan (targeting.js) deploys its shots across it, left to
    // right, and they curve back in on the foe (Leaf Storm's look).
    // The fan narrows up close, so every shot can still turn back onto a foe that's near.
    const near = Math.min(1, Math.max(0.3, Math.hypot(t.x - m.x, t.y - m.y) / 260));
    this.angle = Math.atan2(t.y - m.y, t.x - m.x) + (P.fan && n > 1 ? (k / (n - 1) - 0.5) * P.fan * near : 0);
    this.span = Math.max(30, Math.hypot(t.x - m.x, t.y - m.y));
    this.reach = reachOf(action.move);
    const rgb = (gp.missile.weatherTint && WEATHER_TINT[action.game.weather]) || ms.rgb || [255, 255, 255];
    this.visual = action.game.spawn(new Missile(m.x, m.y, m.x, m.y, m.z, 99, ms.style ?? 'orb', () => {}, rgb, ms.scale ?? 1));
    this.visual.live = this;
    showShotTrail(action.game, this, action.move, `rgb(${rgb.join(',')})`);
  }

  get z() {
    return this.z0 + (this.target.bodyZ - this.z0) * Math.min(1, this.traveled / this.span);
  }

  update(dt) {
    if (this.dead) return false;
    const P = this.P, t = this.target;
    this.age += dt;
    // Homing: turns toward the foe at its tracking rate, for its tracking time, by no more than its turn limit.
    if (P.track > 0 && this.age >= (P.spreadT ?? 0) && this.age <= P.trackTime && this.turned < P.maxTurn && t.alive && !t.hidden) {
      const want = wrap(Math.atan2(t.y - this.y, t.x - this.x) - this.angle), left = P.maxTurn - this.turned;
      const turn = Math.max(-P.track * dt, Math.min(P.track * dt, want)), k = Math.max(-left, Math.min(left, turn));
      this.angle += k;
      this.turned += Math.abs(k);
    }
    const step = P.speed * dt;
    this.x += Math.cos(this.angle) * step;
    this.y += Math.sin(this.angle) * step;
    this.traveled += step;
    // It hits what it touches: the foe's body inside the projectile's hitbox. A dodge's i-frames let it through.
    if (t.alive && !t.hidden && !t.untouchable && !t.invuln && Math.hypot(t.x - this.x, t.y - this.y) <= P.hitbox + t.radius) return this.impact(true);
    if (Math.hypot(this.x - this.x0, this.y - this.y0) >= this.reach || this.traveled >= this.reach * 1.6) return this.impact(false); // reach from where it was thrown
    return true;
  }

  impact(hit) {
    this.dead = true;
    this.visual.dead = true;
    const a = this.action, g = a.game, t = this.target, spot = { x: this.x, y: this.y };
    // Show a near miss when the shot flew past the target.
    if (!hit && t.alive && !t.hidden && Math.hypot(t.x - this.x, t.y - this.y) < 3 * (this.P.hitbox + t.radius) && !a.stack.dodgeShown) {
      a.stack.dodgeShown = true;
      g.spawn(new FloatText(t.x, t.y - t.headZ - 10, 'DODGED!', '#bff3ff'));
    }
    const steps = this.gp.steps.map(s => {
      const out = { ...s, at: (s.at ?? 0) - this.gp.hitAt };
      if (!hit) delete out.hit;
      return out;
    });
    g.spawn(new ImpactRunner(a, steps, spot, this));
    return false;
  }

  draw() {}
}

// Plays a projectile's impact steps after the move itself may have finished (the user is free to act again).
class ImpactRunner {
  constructor(a, steps, spot, shot) {
    Object.assign(this, { src: a, move: shot.move, user: shot.user, game: a.game, target: shot.target, aim: a.aim, stack: a.stack, t: 0, events: [], layer: 'air', holdInCutscene: true });
    scheduleSteps(this, steps, spot);
  }
  get impactShown() { return this.src.impactShown; }
  set impactShown(v) { this.src.impactShown = v; }
  at(time, fn) {
    this.events.push({ time, fn });
    this.events.sort((p, q) => p.time - q.time);
  }
  anim() {}
  mouth() { return { x: this.user.x, y: this.user.y, z: this.user.bodyZ }; }
  front(d) { return { x: this.user.x + Math.cos(this.aim) * d, y: this.user.y + Math.sin(this.aim) * d }; }
  update(dt) {
    this.t += dt;
    while (this.events.length && this.events[0].time <= this.t) this.events.shift().fn();
    return this.events.length > 0;
  }
  draw() {}
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
        (action.marks ??= []).push(marks[marks.length - 1]);
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
      if (step.blades) g.spawn(new OrbitBlades(user, step.blades.life ?? 0.65));
      if (step.toss && t) {
        const s = step.toss;
        for (let i = 0; i < (s.n ?? 3); i++) {
          const x = t.x + rand(-(s.spread ?? 34), s.spread ?? 34), y = t.y + rand(-(s.spread ?? 34), s.spread ?? 34) * 0.6;
          action.at(action.t + i * 0.05, () => g.spawn(new Missile(user.x, user.y, x, y, 22, s.dur ?? 0.32, s.style ?? 'boulder', () => dustCloud(g, x, y, 3, 3), s.rgb ?? [170, 160, 140], s.scale ?? 0.8)));
        }
      }
      if (step.siphon) {
        const s = step.siphon;
        for (let i = 0; i < (s.n ?? 12); i++) {
          const life = rand(0.55, 0.8), x = spot.x + rand(-12, 12), y = spot.y + rand(-6, 6);
          g.particles.spawn({ x, y, z: rand(8, 26), vx: (user.x - x) / life, vy: (user.y - y) / life, vz: rand(-10, 10), life, size: rand(3, 4.5), sizeEnd: 2, colors: s.colors ?? ['#ffffff', '#d8ffb0', '#7ae050'], fade: false });
        }
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
        const h = step.hit;
        if (move.seq && move.presentation === 'knockback') {
          showStrikeRelease(g, move, spot.x, spot.y, 5, action.aim, h.r ?? 30, true);
        }
        const near = t.alive && !t.hidden && Math.hypot(t.x - spot.x, t.y - spot.y) <= (h.r ?? 30) + t.radius;
        if (near) {
          const a = Math.atan2(t.y - spot.y, t.x - spot.x) || action.aim;
          const landed = applyHit(g, user, t, move, { stack: action.stack, knockback: h.knockback ?? 180, stagger: h.stagger ?? 0.35, hitstop: h.hitstop ?? 0.05, shake: h.shake, dirX: Math.cos(a), dirY: Math.sin(a),
            ...(h.part && { power: Math.max(1, Math.round(move.power * h.part)) }) }); // one shot of a split volley
          sparkBurst(g, t.x, t.y, t.bodyZ, true);
          // The move's own landing flourish (visual only), once, as for strikes.
          if (landed && move.impact && !action.impactShown) {
            action.impactShown = true;
            scheduleSteps(action, move.impact.map(s => ({ ...s, at: action.t + (s.at ?? 0) })), { x: t.x, y: t.y });
          }
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
  // Fire Blast's 大: flames streak out along the five strokes of the kanji from the point of impact.
  dai: (g, p) => {
    for (const [dx, dy] of [[0, -1], [-1, -0.15], [1, -0.15], [-0.75, 0.7], [0.75, 0.7]]) {
      for (let i = 0; i < 9; i++) {
        const sp = 60 + i * 14;
        g.particles.spawn({ x: p.x, y: p.y, z: 8, vx: dx * sp, vy: dy * sp * 0.75, vz: rand(10, 40), drag: 1.4, life: rand(0.35, 0.55), size: rand(4, 7), sizeEnd: 1, colors: FIRE });
      }
    }
  },
  // Sludge splattering out and falling, with a few bubbles rising.
  sludge: (g, p, s) => {
    for (let i = 0; i < (s.n ?? 16); i++) { const a = rand(0, Math.PI * 2), sp = rand(70, 150); g.particles.spawn({ x: p.x, y: p.y, z: 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.55, vz: rand(50, 130), gz: 420, life: rand(0.45, 0.75), size: rand(3, 5), sizeEnd: 2, colors: ['#e0a0f0', '#a040c0', '#5a1a6a'] }); }
    for (let i = 0; i < 5; i++) g.particles.spawn({ x: p.x + rand(-10, 10), y: p.y + rand(-5, 5), z: 2, vz: rand(15, 35), life: rand(0.5, 0.8), size: rand(2, 3), colors: ['#f0c0ff', '#c060d0'], round: true });
  },
  // Scalding steam: soft white puffs rising and spreading.
  steam: (g, p, s) => {
    for (let i = 0; i < (s.n ?? 10); i++) g.particles.spawn({ x: p.x + rand(-10, 10), y: p.y + rand(-5, 5), z: rand(6, 18), vx: rand(-15, 15), vz: rand(25, 55), drag: 1.2, life: rand(0.6, 1), size: rand(4, 6), sizeEnd: rand(9, 13), colors: ['#ffffff', '#f0f4f8', '#dde4ea'], alpha: 0.55, round: true });
  },
  // Play Rough's scuffle: a puffy dust cloud with stars popping out of it.
  scuffle: (g, p) => {
    for (let i = 0; i < 10; i++) g.particles.spawn({ x: p.x + rand(-14, 14), y: p.y + rand(-6, 6), z: rand(6, 26), vx: rand(-25, 25), vz: rand(-5, 15), drag: 2, life: rand(0.45, 0.7), size: rand(6, 9), sizeEnd: rand(10, 13), colors: ['#fff0f8', '#ffd0e8', '#f0b0d0'], alpha: 0.85, round: true });
    for (let i = 0; i < 6; i++) g.particles.spawn({ x: p.x, y: p.y, z: 18, vx: rand(-80, 80), vy: rand(-40, 40), vz: rand(40, 100), gz: 200, life: rand(0.4, 0.6), size: 2.5, colors: ['#fff6a0', '#ffffff'] });
  },
  // Fairy glitter: little sparkles that hang in the air and twinkle out.
  glitter: (g, p, s) => {
    for (let i = 0; i < (s.n ?? 16); i++) {
      const a = rand(0, Math.PI * 2), sp = rand(30, 90);
      g.particles.spawn({ x: p.x, y: p.y, z: rand(10, 26), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rand(10, 50), drag: 2.5, life: rand(0.5, 0.9), size: rand(1.5, 3), colors: ['#ffffff', '#ffe0f0', '#fff6a0', '#ffb0d8'] });
    }
  },
  // Feathers flung out, fluttering down.
  feathers: (g, p, s) => {
    for (let i = 0; i < (s.n ?? 10); i++) g.particles.spawn({ x: p.x, y: p.y, z: 14, vx: rand(-90, 90), vy: rand(-40, 40), vz: rand(30, 90), gz: 70, drag: 2.5, life: rand(0.7, 1.1), size: rand(2, 3), colors: ['#ffffff', '#f0f0f0', '#d8d8d8'] });
  },
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
