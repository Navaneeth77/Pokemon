import { drawChargedSphere } from './projectiles.js';
// Legendary signature ultimates, batch 4: the mythicals (Jirachi, Deoxys, Shaymin, Victini, Keldeo, Genesect,
// Diancie, Hoopa, Volcanion, Marshadow, Zeraora, Pecharunt). Same rules as ult-legends.js; mechanics kept from the
// old beat scripts: Diamond Storm raises Defense, Steam Eruption burns, Plasma Fists paralyzes, Malignant Chain
// poisons.
import { bladeRun, TrackingShot } from './ult-species.js';
import { spawnStructure, structureField } from './arena-structures.js';
import {
  Effect, rand, FIRE, Glow, Ring, Pillar, Falling, Spike, Missile, Beam, BeamLine, SlashArc, ScreenDim, Afterimage, EnergyAura,
  GroundMarker, Lightning, TidalWave, Tether, Ripple, dustCloud, electricBurst, leafBurst, waterSplash,
} from './effects.js';
import { sfx } from './audio.js';
import { clampX, clampY, inward, spray, crater, charge, glide, through } from './ult-choreo.js';

class SuspendedWater extends Effect {
  constructor(x, y, z, angle, mirror) {
    super('air', 1.22);
    Object.assign(this, { x, y, z, angle, mirror });
  }

  draw(ctx) {
    const reveal = Math.min(1, this.age / 0.14);
    ctx.save();
    ctx.translate(this.x, this.y - this.z);
    ctx.rotate(this.angle);
    ctx.scale(1, this.mirror ? -1 : 1);
    ctx.globalAlpha *= Math.min(1, (this.life - this.age) * 4) * reveal;
    for (let i = 0; i < 14; i++) {
      const p = i / 13;
      if (p > reveal) break;
      const x = -30 + 59 * p, y = 4 - Math.sin(p * Math.PI) * 12 + Math.sin(i * 2 + this.age * 14) * 2;
      ctx.fillStyle = i % 3 ? '#94c5db' : '#e6f8ff';
      ctx.fillRect(Math.round(x), Math.round(y), i % 3 ? 3 : 5, i % 3 ? 2 : 3);
      if (i % 4 === 0) ctx.fillRect(Math.round(x + 3), Math.round(y - 6), 2, 2);
    }
    ctx.restore();
  }
}

class SwordSurge extends Effect {
  constructor(x, y, z, angle) {
    super('air', 0.48);
    Object.assign(this, { x, y, z, angle });
  }

  draw(ctx) {
    const p = this.age / this.life;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.globalAlpha *= Math.min(1, (1 - p) * 3);
    for (let i = 0; i < 19; i++) {
      const drag = 1 - (1 - p) ** 2, distance = drag * (51 + i % 5 * 10);
      const drift = Math.sin(i * 2.4) * (8 + drag * 21);
      const drop = this.z * (1 - p) + Math.sin(p * Math.PI) * (7 + i % 4 * 5);
      ctx.fillStyle = ['#4c92b5', '#8ec9dc', '#e6f8ff'][i % 3];
      ctx.fillRect(Math.round(distance - i % 4 * 6), Math.round(drift - drop),
        Math.max(2, (1 - p) * (4 + i % 5 * 2)), i % 3 === 0 ? 3 : 2);
    }
    ctx.restore();
  }
}

const alive = t => t.alive && !t.hidden;
const status = (g, u, t, name, dur) => { if (alive(t)) g.applyStatus(t, name, { source: u, dur }); };
const rays = (g, x, y, n, len, color, life = 0.4, width = 4) => {
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    g.spawn(new BeamLine(x + Math.cos(ang) * 8, y + Math.sin(ang) * 8, x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.8, life, color, width));
  }
};
// Lifts the foe on a tether and slams it down twice (Malignant Chain).
function chainSlam(a, g, u, t, frac, color, colors, rgb, onSlam) {
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
      g.marks.fracture(t.x, t.y, 24, 6.5);
      g.shake(8, 0.3);
      sfx.quake();
      a.strike(frac / 2, { knockback: 0, stagger: 0.6 });
    }, color, colors, !k);
  }));
}

export const LEGEND_ULTS_4 = {
  // Doom Desire (Jirachi): its third eye opens, wishing stars rise and fall around the foe, a star mark locks on,
  // and starlight crashes down from the sky.
  doomDesire(a, g, u, t) {
    const STAR = [255, 240, 150], C = ['#ffffff', '#fff6a0', '#3a5ab0'];
    g.spawn(new ScreenDim(2.5, 0.6, '6,10,34'));
    g.spawn(new Glow(u.x, u.y, u.bodyZ - 4, 16, STAR, 0.7, true));
    for (let i = 0; i < 8; i++) a.later(i * 0.05, () => g.particles.spawn({ x: u.x + rand(-14, 14), y: u.y, z: u.bodyZ, vz: rand(120, 200), life: 0.7, size: rand(3, 4), colors: ['#fff6a0', '#ffffff'] }));
    sfx.megaCharge();
    let m = null;
    a.later(0.3, () => {
      m = g.spawn(new GroundMarker(t.x, t.y, 30, '255,240,150'));
      a.owned.push(m);
      a.ticks.push(() => { if (!m.dead) m.set(t.x, t.y); });
      sfx.zap(1.3);
    });
    // Wishing stars fall around the foe; every third lands on it.
    for (let i = 0; i < 10; i++) {
      a.later(0.4 + i * 0.09, () => {
        const aimed = i % 3 === 0, p = aimed ? { x: t.x, y: t.y } : { x: clampX(t.x + rand(-110, 110)), y: clampY(t.y + rand(-80, 80)) };
        g.spawn(new Falling(p.x, p.y, 0.45, 'star', () => {
          g.spawn(new Ring(p.x, p.y, { r0: 3, r1: 22, life: 0.3, color: '#fff6a0', width: 3 }));
          g.marks.energy(p.x, p.y, 10, STAR, 6);
          if (aimed) a.strike(0.4 / 4, { knockback: 60, stagger: 0.3 });
        }, STAR));
      });
    }
    // Doom arrives.
    a.later(1.6, () => {
      m.dead = true;
      g.spawn(new BeamLine(t.x, t.y - 480, t.x, t.y, 0.55, '#fff6a0', 24));
      g.spawn(new BeamLine(t.x, t.y - 480, t.x, t.y, 0.4, '#ffffff', 8));
      g.spawn(new Pillar(t.x, t.y, 0.7, STAR, 480));
      rays(g, t.x, t.y - t.bodyZ, 10, 100, '#fff6a0', 0.45, 4);
      g.flash(0.12);
      crater(a, g, t.x, t.y, { r: 46, rgb: STAR, ring: '#ffffff', mark: (x, y, r) => g.marks.energy(x, y, r, STAR, 6) });
      a.strike(0.6, { knockback: 280, stagger: 0.6 });
    });
    a.end(2.4);
  },

  // Psycho Boost (Deoxys): its crystal core glows as two strands of energy spiral around it like DNA, it forms a
  // vast orb of psychic power and hurls it, and the blast ripples out.
  psychoBoost(a, g, u, t) {
    const CORE = [255, 140, 110], C = ['#ffffff', '#ff8a6a', '#5a2a8a'];
    g.spawn(new ScreenDim(2.3, 0.65, '14,6,26'));
    g.spawn(new Glow(u.x, u.y, u.bodyZ, 20, [200, 120, 255], 0.65, true));
    const focus = new Effect('air', 0.65);
    focus.draw = ctx => {
      const m = a.mouth(), p = focus.age / focus.life;
      drawChargedSphere(ctx, m.x, m.y - m.z, 2 + 19 * p * p, focus.age, 'psychic');
    };
    if (!g.headless) g.spawn(focus);
    let gather = 0.65;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(110, dt, C, 50); });
    sfx.beamCharge(0.65);
    a.later(0.65, () => {
      const m = a.mouth();
      a.anim('Shoot', 1);
      sfx.pulse();
      g.spawn(new TrackingShot(u, t, {
        origin: { x: m.x, y: m.y - m.z }, duration: 0.54, style: 'orb', color: CORE,
        flight: { speed: 1050, range: 760, radius: 21, sphere: 'psychic' },
      }, ({ x, y }) => {
        const z = t.bodyZ, ground = y + z;
        g.spawn(new Glow(x, ground, z, 69, CORE, 0.42));
        for (const [r1, color] of [[83, '#fff1ed'], [59, '#ff8a6a'], [43, '#c090ff']]) {
          g.spawn(new Ring(x, ground, { z, r0: 6, r1, life: 0.4, color, width: 4, layer: 'air' }));
        }
        crater(a, g, x, ground, { r: 40, rgb: CORE, ring: '#ffffff', shake: 10, reach: 120 });
        a.strike(0.8, { customArt: true, knockback: 170, stagger: 0.6 });
        a.later(0.17, () => {
          g.spawn(new Ring(x, ground, { r0: 10, r1: 87, life: 0.4, color: '#c090ff', width: 4 }));
          if (Math.hypot(t.x - x, t.y - ground) <= 87 + t.radius) a.strike(0.2, { customArt: true, knockback: 200 });
        });
      }));
    });
    a.end(2.2);
  },

  // Seed Flare (Shaymin): petals swirl into it, a flare of light bursts out across the arena, and flowers bloom
  // into pillars of light everywhere.
  seedFlare(a, g, u, t) {
    const LEAF = [190, 255, 140], C = ['#ffffff', '#c8ff8a', '#3f9a3a'];
    g.spawn(new ScreenDim(2.3, 0.45, '10,24,8'));
    let petals = 0.6;
    a.ticks.push(dt => { if ((petals -= dt) > 0) inward(g, u.x, u.y, u.bodyZ, 3, 80, ['#ffc0e0', '#c8ff8a', '#ffffff']); });
    g.spawn(new Glow(u.x, u.y, u.bodyZ, 40, LEAF, 0.6, true));
    sfx.beamCharge(0.6);
    a.later(0.6, () => {
      a.anim('Shoot', 1);
      g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 480, life: 0.6, color: '#ffffff', width: 9 }));
      g.spawn(new Ring(u.x, u.y, { r0: 8, r1: 340, life: 0.5, color: '#c8ff8a', width: 5 }));
      leafBurst(g, u.x, u.y, u.bodyZ, 24);
      g.marks.leaves(u.x, u.y, 44);
      g.flash(0.1);
      a.boom(10);
      a.later((u.distTo(t) / 480) * 0.6, () => {
        g.spawn(new Glow(t.x, t.y, t.bodyZ, 40, LEAF, 0.3));
        a.strike(0.6, { knockback: 260, stagger: 0.5 });
      });
    });
    // Flowers bloom into pillars; every fourth under the foe.
    for (let i = 0; i < 12; i++) {
      a.later(1.05 + i * 0.05, () => {
        const aimed = i % 4 === 0, p = aimed ? { x: t.x, y: t.y } : a.spot();
        g.spawn(new Pillar(p.x, p.y, 0.6, LEAF, aimed ? 320 : 200));
        leafBurst(g, p.x, p.y, 4, 6);
        g.marks.leaves(p.x, p.y, rand(10, 15));
        if (aimed) {
          sfx.explosion();
          a.strike(0.4 / 3, { knockback: 100, stagger: 0.4 });
        }
      });
    }
    a.end(2.2);
  },

  // V-create (Victini): a blazing V flares on its brow, it charges through the foe, carves a V of fire into it, and
  // a V of flame pillars erupts.
  vCreate(a, g, u, t) {
    const FLAME = [255, 120, 40];
    g.spawn(new ScreenDim(2.3, 0.5, '40,10,2'));
    for (const s of [-1, 1]) g.spawn(new BeamLine(u.x, u.y - u.headZ + 4, u.x + s * 22, u.y - u.headZ - 26, 0.8, '#ff5a1a', 7));
    g.spawn(new EnergyAura(u, 0.5, false, { glow: FLAME, rings: ['#fff0a0', '#ff5a1a'] }));
    sfx.flamethrower(0.5);
    a.later(0.45, () => {
      const p = through(u, t, 90);
      a.anim('Attack', 2);
      sfx.dash();
      charge(a, g, u, t, p, 0.16, '#ff5a1a', () => {
        spray(g, t.x, t.y, t.bodyZ, 16, FIRE, { speed: 150, up: 120 });
        g.hitstop(0.06);
        g.shake(8, 0.25);
        a.strike(0.4, { knockback: 160, stagger: 0.5, dirX: Math.cos(p.ang), dirY: Math.sin(p.ang) });
      }, '#ffd8a0');
    });
    a.later(0.77, () => {
      a.anim('Hop', 1.2);
      const aim = u.aimAt(t), dist = u.distTo(t) + 18;
      const x = clampX(u.x + Math.cos(aim) * dist), y = clampY(u.y + Math.sin(aim) * dist);
      glide(a, g, u, { x, y }, 0.32, '#e78839', {
        onStep(p) {
          u.zOverride = Math.sin(p * Math.PI) * 47;
          if (p < 1) return;
          u.zOverride = null;
          a.anim('Slam', 1.48);
          const impact = { x: u.x, y: u.y };
          g.marks.scorch(impact.x, impact.y, 36, 7);
          crater(a, g, impact.x, impact.y, { r: 44, rgb: FLAME, ring: '#fff0a0', shake: 12, reach: 132 });
          spray(g, impact.x, impact.y, 6, 18, FIRE, { speed: 141, up: 129 });
          if (Math.hypot(t.x - impact.x, t.y - impact.y) <= 46 + t.radius) a.strike(0.3, { customArt: true, knockback: 123, stagger: 0.46 });
          for (const side of [-1, 1]) a.later(side < 0 ? 0.07 : 0.15, () => {
            const heading = aim + side * 0.68;
            let hit = false;
            for (let j = 1; j <= 4; j++) a.later(j * 0.043, () => {
              const px = clampX(impact.x + Math.cos(heading) * j * 16), py = clampY(impact.y + Math.sin(heading) * j * 16);
              a.erupt(px, py, FIRE, FLAME, 65 + j * 11);
              g.marks.scorch(px, py, 13, 6);
              if (!hit && Math.hypot(t.x - px, t.y - py) <= t.radius + 32) {
                hit = true;
                a.strike(0.15, { customArt: true, knockback: 58, stagger: 0.35 });
              }
            });
          });
        },
      });
    });
    a.end(2.2);
  },

  // Secret Sword (Keldeo): its horn becomes a blade of water, three cuts flash across the foe, and a wave follows
  // through.
  secretSword(a, g, u, t) {
    const aqua = [126, 201, 249], colors = ['#3f75af', '#dbf5ff'];
    a.anim('Charge', 0.88);
    g.spawn(new ScreenDim(1.77, 0.32, '7,20,36'));
    let swing = 0;
    const blade = new Effect('air', 1.49);
    blade.draw = ctx => {
      const aim = u.aimAt(t), size = Math.min(1, blade.age / 0.36);
      ctx.save();
      ctx.translate(u.x, u.y - u.headZ + 4);
      ctx.rotate(aim + swing);
      ctx.scale(Math.max(0.04, size), 1);
      ctx.beginPath();
      ctx.moveTo(2, -2); ctx.lineTo(27, -4); ctx.lineTo(47, -1); ctx.lineTo(29, 3); ctx.lineTo(2, 2); ctx.closePath();
      ctx.fillStyle = '#6fb1d0'; ctx.fill();
      ctx.strokeStyle = '#d9f4ff'; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.restore();
    };
    if (!g.headless) g.spawn(blade);
    sfx.clang();
    const sheets = [];
    for (const [at, mirror, share] of [[0.43, false, 0.33], [0.79, true, 0.27], [1.16, false, 0.4]]) a.later(at, () => {
      u.face(t.x, t.y);
      a.anim(share === 0.4 ? 'Strike' : 'Swing', 1.55);
      const aim = u.aimAt(t);
      swing = share === 0.4 ? 0 : mirror ? -0.52 : 0.52;
      bladeRun(a, g, u, t, 0.22, colors, mirror, share, share === 0.4 ? 251 : 22, share === 0.4 ? 1.23 : 0.95, 0, () => {
        const { x, y, bodyZ } = t;
        g.marks.wet(x, y, 18);
        if (share !== 0.4) {
          const shift = mirror ? 12 : -12;
          const sheet = new SuspendedWater(x - Math.sin(aim) * shift, y + Math.cos(aim) * shift,
            bodyZ + (mirror ? 2 : 11), aim + (mirror ? 0.67 : -0.67), mirror);
          sheets.push(sheet);
          if (!g.headless) g.spawn(sheet);
          spray(g, x, y, bodyZ, 9, ['#e3f8ff', '#8dcce9'], { speed: 80, up: 45, life: [0.16, 0.29] });
          return;
        }
        for (const sheet of sheets) {
          sheet.dead = true;
          spray(g, sheet.x, sheet.y, sheet.z, 13, ['#e1faff', '#87c2e8'], { speed: 127, up: 77 });
        }
        if (!g.headless) g.spawn(new SwordSurge(x, y, bodyZ, aim));
        for (let i = 1; i <= 4; i++) a.later(i * 0.065, () => {
          const px = clampX(x + Math.cos(aim) * i * 19), py = clampY(y + Math.sin(aim) * i * 19);
          g.marks.wet(px, py, 12 + i * 2);
          if (i === 4) waterSplash(g, px, py);
          else spray(g, px, py, 4, 5, ['#e0faff', '#85c4e6'], { speed: 75, up: 48 });
        });
        g.spawn(new Glow(x, y, bodyZ, 29, aqua, 0.2));
        g.hitstop(0.06);
        g.shake(7, 0.28);
        sfx.splash();
      });
    });
    a.end(1.95);
  },

  // Techno Blast (Genesect): a targeting reticle locks onto the foe, its back cannon charges and fires, then a
  // salvo of missiles follows up.
  technoBlast(a, g, u, t) {
    const drive = [171, 132, 247], colors = ['#352858', '#a788f1', '#e8efff'];
    const muzzle = () => {
      const aim = u.aimAt(t);
      return { x: u.x + Math.cos(aim) * 13, y: u.y - u.headZ + Math.sin(aim) * 15 };
    };
    u.face(t.x, t.y);
    a.anim('Charge', 0.75);
    g.spawn(new ScreenDim(1.8, 0.34, '17,12,34'));
    const charge = new Effect('air', 0.73);
    charge.draw = ctx => {
      const { x, y } = muzzle();
      const p = charge.age / charge.life;
      drawChargedSphere(ctx, x, y, 2 + 12 * p, charge.age, 'psychic');
      ctx.save();
      ctx.strokeStyle = colors[1]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 20 - p * 6, charge.age * 8, charge.age * 8 + 3.9); ctx.stroke();
      ctx.restore();
    };
    if (!g.headless) g.spawn(charge);
    sfx.beamCharge(0.73);
    for (const [at, share] of [[0.74, 0.3], [1.01, 0.7]]) a.later(at, () => {
      a.anim('Shoot', share > 0.5 ? 1.55 : 1.2);
      const from = muzzle(), end = { x: t.x, y: t.y - t.bodyZ };
      const duration = share > 0.5 ? 0.49 : 0.26;
      const beam = g.spawn(new Beam(from.x, from.y, from.x, from.y, duration,
        { width: share > 0.5 ? 31 : 16, colors, tapered: true }));
      const time = Math.max(0.06, Math.hypot(end.x - from.x, end.y - from.y) / 2100);
      a.ticks.push(() => {
        if (beam.age > duration) return;
        const p = Math.min(1, beam.age / time);
        beam.set(from.x, from.y, from.x + (end.x - from.x) * p, from.y + (end.y - from.y) * p);
      });
      sfx.beamFire();
      a.later(time + 0.018, () => {
        if (!alive(t) || t.untouchable || Math.hypot(t.x - end.x, t.y - t.bodyZ - end.y) > t.radius + 17) return;
        const y = end.y + t.bodyZ;
        crater(a, g, end.x, y, { r: share > 0.5 ? 34 : 16, rgb: drive, ring: colors[2], shake: 8, reach: 88 });
        a.strike(share, { customArt: true, knockback: share > 0.5 ? 260 : 70, stagger: 0.5 });
      });
    });
    a.end(1.89);
  },

  // Diamond Storm (Diancie): its diamond flares (Defense up), crystal spikes burst out of the ground toward the foe,
  // and diamonds rain down in a glittering storm.
  diamondStorm(a, g, u, t) {
    const field = structureField(), crystal = { style: 'crystal', damage: 0.03 };
    const PINK = [255, 190, 225], C = ['#ffffff', '#ffc0e0', '#c0508a'];
    g.spawn(new ScreenDim(2.4, 0.5, '30,10,24'));
    g.spawn(new Glow(u.x, u.y, u.headZ, 24, PINK, 0.5, true));
    a.later(0.1, () => {
      g.buff(u, 'def', 1.3, 6);
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        g.spawn(new Spike(u.x + Math.cos(ang) * 22, u.y + Math.sin(ang) * 14, 'crystal', 0.6));
      }
      sfx.shard();
    });
    a.later(0.3, () => {
      const ang = u.aimAt(t), d = u.distTo(t) + 30, steps = Math.max(6, Math.round(d / 26));
      for (let i = 1; i <= steps; i++) {
        a.later(i * 0.04, () => {
          const k = i / steps, x = clampX(u.x + Math.cos(ang) * d * k), y = clampY(u.y + Math.sin(ang) * d * k);
          if (i % 3 === 0) spawnStructure(g, u, field, x, y, crystal);
          else g.spawn(new Spike(x + rand(-8, 8), y + rand(-4, 4), 'crystal', 0.9));
          if (i % 2 === 0) spray(g, x, y, 6, 3, C, { speed: 50, up: 80, size: [1.5, 2.5], life: [0.3, 0.5] });
          if (i % 3 === 0) sfx.shard();
          if (i === steps) {
            for (let n = 0; n < 4; n++) g.spawn(new Spike(t.x + rand(-12, 12), t.y + rand(-6, 6), 'crystal', 1));
            a.strike(0.5, { knockback: 100, stagger: 0.5 });
          }
        });
      }
    });
    for (let i = 0; i < 12; i++) {
      a.later(1.1 + i * 0.06, () => {
        const aimed = i % 3 === 0, p = aimed ? { x: t.x, y: t.y } : { x: clampX(t.x + rand(-120, 120)), y: clampY(t.y + rand(-90, 90)) };
        g.spawn(new Falling(p.x, p.y, 0.4, 'crystal', () => {
          spray(g, p.x, p.y, 4, 6, C, { speed: 80, up: 100, size: [1.5, 3] });
          g.marks.fracture(p.x, p.y, 10, 5);
          if (aimed && Math.hypot(t.x - p.x, t.y - p.y) <= 34 + t.radius) a.strike(0.5 / 4, { knockback: 70, stagger: 0.3 });
        }, PINK));
      });
    }
    a.end(2.4);
  },

  // Hyperspace Fury (Hoopa): portal rings open around the foe, fists punch out of them one after another, and the
  // biggest ring slams shut on it.
  hyperspaceFury(a, g, u, t) {
    const GOLD = [255, 220, 140], C = ['#ffe0a0', '#c060ff', '#2a1050'];
    g.spawn(new ScreenDim(2.4, 0.6, '16,6,30'));
    sfx.zap(0.5);
    a.later(0.1, () => {
      const m = g.spawn(new GroundMarker(t.x, t.y, 30, '192,96,255'));
      a.owned.push(m);
      a.ticks.push(() => { if (!m.dead) m.set(t.x, t.y); });
      a.later(0.8, () => { m.dead = true; });
      let left = 0.5;
      a.ticks.push(dt => { if ((left -= dt) > 0) inward(g, t.x, t.y, t.bodyZ, 3, 60, C); });
    });
    a.later(0.6, () => a.strike(0.2, { knockback: 0, stagger: 0.5 }));
    // Six portals around the foe; fists fly out of them.
    const portals = [];
    for (let k = 0; k < 6; k++) {
      a.later(0.4 + k * 0.04, () => {
        const ang = (k / 6) * Math.PI * 2, p = { x: clampX(t.x + Math.cos(ang) * 90), y: clampY(t.y + Math.sin(ang) * 66) };
        portals.push(p);
        g.spawn(new Ring(p.x, p.y, { z: 16, r0: 14, r1: 14, life: 1.2, color: '#ffd060', width: 3, hold: true, layer: 'air' }));
        g.spawn(new Glow(p.x, p.y, 16, 16, [120, 60, 200], 1.2));
      });
    }
    for (let i = 0; i < 10; i++) {
      a.later(0.7 + i * 0.08, () => {
        const p = portals[i % portals.length];
        if (!p) return;
        g.spawn(new Missile(p.x, p.y, t.x, t.y, 16, 0.16, 'orb', () => {
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 4, r1: 26, life: 0.2, color: '#ffe0a0', width: 3, layer: 'air' }));
          g.shake(3, 0.08);
          sfx.hit(false);
          a.strike(0.55 / 10, { knockback: 30, stagger: 0.3 });
        }, GOLD, 1.5));
      });
    }
    // The great ring.
    a.later(1.65, () => {
      g.spawn(new Ring(t.x, t.y, { r0: 140, r1: 6, life: 0.25, color: '#ffd060', width: 8 }));
      sfx.whoosh();
    });
    a.later(1.9, () => {
      crater(a, g, t.x, t.y, { r: 44, rgb: [192, 96, 255], ring: '#ffe0a0', mark: (x, y, r) => g.marks.energy(x, y, r, [192, 96, 255], 6) });
      a.strike(0.25, { knockback: 280, stagger: 0.6 });
    });
    a.end(2.4);
  },

  // Steam Eruption (Volcanion): the ring on its back vents, steam geysers blow across the arena, and it fires twin
  // jets of scalding steam from its arms. Burns.
  steamEruption(a, g, u, t) {
    const STEAM = [255, 220, 210], C = ['#ffffff', '#ffd0c0', '#5aa6f0'];
    g.spawn(new ScreenDim(2.4, 0.45, '26,14,12'));
    a.anim('Charge', 0.85);
    for (const side of [-1, 1]) g.spawn(new Glow(u.x + side * 15, u.y, u.headZ - 2, 17, [245, 105, 46], 0.66, true));
    let vent = 0.6;
    a.ticks.push(dt => {
      if ((vent -= dt) <= 0) return;
      g.particles.spawn({ x: u.x + rand(-10, 10), y: u.y, z: u.headZ, vx: rand(-20, 20), vz: rand(60, 110), drag: 1, life: 0.8, size: rand(6, 10), sizeEnd: 14, colors: ['#ffffff'], alpha: 0.35, round: true });
    });
    sfx.hydro(0.6);
    // Geysers; every fourth under the foe.
    for (let i = 0; i < 16; i++) {
      a.later(0.2 + i * 0.05, () => {
        const aimed = i % 4 === 0, p = aimed ? { x: t.x, y: t.y } : a.spot();
        g.spawn(new Pillar(p.x, p.y, 0.49, [91, 177, 231], aimed ? 145 : 75));
        g.spawn(new Glow(p.x, p.y, 7, 18, [236, 117, 54], 0.32));
        if (aimed) waterSplash(g, p.x, p.y);
        for (let k = 0; k < 4; k++) g.particles.spawn({ x: p.x + rand(-6, 6), y: p.y, z: rand(10, 60), vx: rand(-15, 15), vz: rand(30, 70), drag: 1, life: 0.9, size: rand(6, 10), sizeEnd: 16, colors: ['#ffffff'], alpha: 0.3, round: true });
        g.marks.wet(p.x, p.y, rand(10, 14));
        if (aimed) {
          sfx.splash();
          a.strike(0.6 / 4, { knockback: 80, stagger: 0.35 });
        }
      });
    }
    // Twin steam jets.
    a.later(1.25, () => {
      const ang = u.aimAt(t), nx = -Math.sin(ang), ny = Math.cos(ang);
      a.anim('Shoot', 1);
      for (const s of [-1, 1]) {
        const x0 = u.x + nx * 16 * s, y0 = u.y - u.bodyZ + ny * 16 * s;
        g.spawn(new Beam(x0, y0, t.x + nx * 6 * s, t.y - t.bodyZ + ny * 6 * s, 0.55, { width: 16, colors: [s < 0 ? '#4b9ccd' : '#e89056', s < 0 ? '#aae7ff' : '#ffd2b0', '#ffffff'] }));
      }
      g.shake(8, 0.4);
      sfx.beamFire();
      a.later(0.05, () => {
        for (let k = 0; k < 10; k++) g.particles.spawn({ x: t.x + rand(-10, 10), y: t.y, z: t.bodyZ, vx: rand(-40, 40), vz: rand(40, 90), drag: 1, life: 0.8, size: rand(6, 10), sizeEnd: 16, colors: ['#ffffff'], alpha: 0.35, round: true });
        waterSplash(g, t.x, t.y);
        spray(g, t.x, t.y, t.bodyZ, 13, FIRE, { speed: 98, up: 85 });
        g.marks.scorch(t.x, t.y, 18, 5);
        crater(a, g, t.x, t.y, { r: 36, rgb: STEAM, ring: '#ffffff', mark: (x, y, r) => g.marks.wet(x, y, r), stop: 0.08, shake: 10 });
        a.strike(0.4, { knockback: 260, stagger: 0.5, dirX: Math.cos(ang), dirY: Math.sin(ang) });
      });
    });
    a.later(1.4, () => status(g, u, t, 'burn'));
    a.end(2.4);
  },

  // Soul-Stealing 7-Star Strike (Marshadow): it slips into the foe's shadow, strikes seven times from it as seven
  // stars light up one by one, then drops on the foe from above and the stars burst.
  soulStealing(a, g, u, t) {
    const GREEN = [140, 230, 170], C = ['#d0ffe0', '#3a8a5a', '#0a1a10'];
    g.spawn(new ScreenDim(2.6, 0.75, '4,12,6'));
    const pool = g.spawn(new GroundMarker(t.x, t.y, 30, '10,26,16'));
    a.owned.push(pool);
    a.ticks.push(() => { if (!pool.dead) pool.set(t.x, t.y); });
    a.later(0.15, () => {
      for (let i = 0; i < 3; i++) g.spawn(new Afterimage(u, 0.25 + i * 0.1, '#3a8a5a'));
      sfx.whoosh();
    });
    const stars = [];
    for (let i = 0; i < 7; i++) {
      a.later(0.3 + i * 0.12, () => {
        const ang = (i / 7) * Math.PI * 2 + 0.2;
        u.phasing = true;
        g.spawn(new Afterimage(u, 0.3, '#3a8a5a'));
        u.x = clampX(t.x + Math.cos(ang) * 26);
        u.y = clampY(t.y + Math.sin(ang) * 18);
        u.face(t.x, t.y);
        a.anim(i % 2 ? 'Attack' : 'Swing', 2.5);
        g.spawn(new SlashArc(t.x, t.y, t.bodyZ, ang + Math.PI, { radius: 22, spread: 2, colors: ['#3a8a5a', '#d0ffe0'], width: 5, mirror: i % 2 === 1 }));
        // The seven stars hang in a ring above the foe.
        const sa = (i / 7) * Math.PI * 2 - Math.PI / 2, star = { x: t.x + Math.cos(sa) * 40, z: t.bodyZ + 60 + Math.sin(sa) * 30 };
        stars.push(star);
        g.spawn(new Glow(star.x, t.y, star.z, 10, GREEN, 1.6 - i * 0.12));
        g.spawn(new Glow(star.x, t.y, star.z, 4, [255, 255, 255], 1.6 - i * 0.12));
        g.shake(4, 0.1);
        sfx.hit(false);
        a.strike(0.6 / 7, { knockback: 30, stagger: 0.3 });
      });
    }
    a.later(1.2, () => {
      u.phasing = false;
      pool.dead = true;
      Object.assign(u, { invuln: true, zOverride: 0 });
      let k = 0;
      a.ticks.push(dt => {
        if (k >= 1) return;
        k = Math.min(1, k + dt / 0.5);
        u.x = t.x;
        u.y = t.y;
        u.zOverride = k < 0.6 ? 140 * (k / 0.6) : 140 * (1 - (k - 0.6) / 0.4);
        g.spawn(new Afterimage(u, 0.2, '#d0ffe0'));
        if (k < 1) return;
        Object.assign(u, { zOverride: null, invuln: false });
        for (const s of stars) g.spawn(new BeamLine(s.x, t.y - s.z, t.x, t.y - t.bodyZ, 0.3, '#d0ffe0', 3));
        crater(a, g, t.x, t.y, { r: 44, rgb: GREEN, ring: '#d0ffe0', mark: (x, y, r) => g.marks.energy(x, y, r, GREEN, 6) });
        sfx.quake();
        a.strike(0.4, { knockback: 280, stagger: 0.6 });
      });
    });
    a.end(2.4);
  },

  // Plasma Fists (Zeraora): its fists crackle with plasma, it blitzes the foe from every side, and three bolts come
  // down. Paralyzes.
  plasmaFists(a, g, u, t) {
    const VOLT = [255, 225, 100];
    g.spawn(new ScreenDim(2.3, 0.55, '8,12,30'));
    for (let i = 0; i < 6; i++) {
      a.later(i * 0.05, () => {
        const s = i % 2 ? -1 : 1;
        g.spawn(new Lightning(u.x + s * 12, u.y - u.bodyZ - 10, u.x + s * 16, u.y - u.bodyZ + 10, 0.12, { width: 1.5, branches: 1, glow: 'rgba(80,160,255,0.6)' }));
      });
    }
    sfx.thunderbolt();
    u.phasing = true;
    for (let i = 0; i < 6; i++) {
      a.later(0.3 + i * 0.11, () => {
        const ang = (i / 6) * Math.PI * 2 + 0.6;
        g.spawn(new Afterimage(u, 0.3, '#ffe066'));
        u.x = clampX(t.x + Math.cos(ang) * 26);
        u.y = clampY(t.y + Math.sin(ang) * 18);
        u.face(t.x, t.y);
        a.anim('Attack', 3);
        g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 4, r1: 30, life: 0.2, color: i % 2 ? '#3a8ae8' : '#ffe066', width: 4, layer: 'air' }));
        electricBurst(g, t.x, t.y, t.bodyZ, 10);
        g.shake(4, 0.1);
        sfx.hit(false);
        a.strike(0.1, { knockback: 30, stagger: 0.3 });
      });
    }
    a.later(1.0, () => { u.phasing = false; });
    for (let i = 0; i < 3; i++) {
      a.later(1.15 + i * 0.14, () => {
        g.spawn(new Lightning(t.x + rand(-5, 5), 60, t.x, t.y - 4, 0.35, { width: 4, branches: 6, glow: 'rgba(80,160,255,0.6)' }));
        electricBurst(g, t.x, t.y, 6, 18);
        g.marks.burn(t.x, t.y, 20);
        g.flash(0.08);
        g.shake(8, 0.3);
        sfx.thunder();
        a.strike(0.4 / 3, { knockback: 140, stagger: 0.5 });
      });
    }
    a.later(1.6, () => {
      crater(a, g, t.x, t.y, { r: 36, rgb: VOLT, ring: '#ffffff', mark: (x, y, r) => g.marks.burn(x, y, r), stop: 0.06, shake: 8 });
      status(g, u, t, 'para');
    });
    a.end(2.2);
  },

  // Malignant Chain (Pecharunt): a toxic chain binds the foe, it is hauled up and slammed down twice, then the chain
  // coils tight and the poison floods in. Poisons.
  malignantChain(a, g, u, t) {
    const TOX = [200, 90, 220], C = ['#ffe0ff', '#c060d0', '#3a0a3a'];
    g.spawn(new ScreenDim(2.6, 0.65, '24,4,26'));
    g.spawn(new EnergyAura(u, 0.4, false, { glow: TOX, rings: ['#ffe0ff', '#c060d0'] }));
    sfx.zap(0.3);
    a.later(0.2, () => chainSlam(a, g, u, t, 0.5, '#c060d0', C, TOX, () => {
      spray(g, t.x, t.y, 4, 14, C, { speed: 120, up: 140 });
      g.marks.energy(t.x, t.y, 22, TOX, 6);
    }));
    // The chain coils and the poison floods in.
    a.later(1.4, () => {
      for (let i = 0; i < 3; i++) g.spawn(new Ring(t.x, t.y, { z: t.bodyZ - 8 + i * 10, r0: 30, r1: 14, life: 0.5, color: '#c060d0', width: 4, layer: 'air' }));
      let left = 0.5;
      a.ticks.push(dt => { if ((left -= dt) > 0) inward(g, t.x, t.y, t.bodyZ, 4, 70, C); });
      sfx.zap(0.5);
    });
    a.later(1.95, () => {
      g.spawn(new Pillar(t.x, t.y, 0.6, TOX, 300));
      for (let i = 0; i < 12; i++) g.particles.spawn({ x: t.x + rand(-20, 20), y: t.y + rand(-8, 8), z: rand(0, 30), vx: rand(-30, 30), vz: rand(20, 70), drag: 1.5, life: rand(0.8, 1.1), size: rand(6, 10), sizeEnd: 2, colors: ['#7a2a9a', '#5a1a6a', '#3a0a40'] });
      crater(a, g, t.x, t.y, { r: 40, rgb: TOX, ring: '#ffe0ff', mark: (x, y, r) => g.marks.energy(x, y, r, TOX, 6) });
      a.strike(0.5, { knockback: 220, stagger: 0.5 });
    });
    a.later(2.05, () => status(g, u, t, 'poison', 7));
    a.end(2.6);
  },
};
