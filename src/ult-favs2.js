// Signature ultimates of fan favourites, batch 6: Gallade, Togekiss, Swampert, Weavile, Talonflame, Alakazam,
// Milotic, Haxorus, Hydreigon and Porygon-Z. Same rules as ult-legends.js; mechanics kept from the old beat scripts:
// Frozen Shadow Barrage freezes, Serene Tidal Tempest heals 12% and slows, Digital Distortion paralyzes.
import {
  Effect, rand, FIRE, Glow, Ring, Pillar, Falling, Spike, Missile, Beam, BeamLine, SlashArc, PsyDome, ScreenDim, Afterimage, EnergyAura,
  GroundMarker, Lightning, TidalWave, Tether, FloatingRock, RainbowStreak, Ripple, dustCloud, debris, iceShatter, electricBurst, waterSplash,
} from './effects.js';
import { sfx } from './audio.js';
import { clampX, clampY, inward, crater, charge, glide, through, spray } from './ult-choreo.js';

class PsychicHold extends Effect {
  constructor(target, life) {
    super('air', life);
    this.target = target;
  }

  draw(ctx) {
    const t = this.target, p = Math.min(1, this.age * 5), fade = Math.min(1, (this.life - this.age) * 6);
    ctx.save();
    ctx.translate(t.x, t.y - t.bodyZ);
    ctx.globalAlpha *= fade * p;
    for (const [angle, color] of [[-0.67, '#9661c6'], [0.42, '#f4a7e7'], [1.4, '#ffdef9']]) {
      ctx.save();
      ctx.rotate(angle + this.age * 0.24);
      ctx.strokeStyle = color; ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 30 + Math.sin(this.age * 12 + angle) * 4, 13, 0, this.age * 2 + angle, this.age * 2 + angle + 4.6);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

class Whirlpool extends Effect {
  constructor(x, y, size, life) {
    super('ground', life);
    Object.assign(this, { x, y, size });
  }

  draw(ctx) {
    const p = Math.min(1, this.age / 0.24), fade = Math.min(1, (this.life - this.age) * 4);
    const size = this.size * (0.6 + p * 0.4);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha *= fade * p;
    ctx.fillStyle = '#315f7b80';
    ctx.beginPath(); ctx.ellipse(0, 0, size, size * 0.48, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 3; arm++) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const k = i / 24, angle = k * 4.3 + arm * Math.PI * 2 / 3 + this.age * 7;
        const x = Math.cos(angle) * size * k, y = Math.sin(angle) * size * k * 0.49;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      for (const [color, width] of [['#3b719b', 7], ['#87c9de', 4], ['#e0f4f1', 1.4]]) {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
      }
    }
    ctx.restore();
  }
}

const alive = t => t.alive && !t.hidden;
const status = (g, u, t, name, dur) => { if (alive(t)) g.applyStatus(t, name, { source: u, dur }); };
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
const cut = (g, t, ang, L, c1, w = 9) => {
  const dx = Math.cos(ang) * L / 2, dy = Math.sin(ang) * L / 2, y = t.y - t.bodyZ;
  g.spawn(new BeamLine(t.x - dx, y - dy, t.x + dx, y + dy, 0.35, c1, w));
  g.spawn(new BeamLine(t.x - dx, y - dy, t.x + dx, y + dy, 0.25, '#ffffff', w / 3));
};
function beamFrom(a, g, u, t, { off = 0, width, colors, rgb, life = 0.55 }) {
  const ang = u.aimAt(t), m = a.mouth(), nx = -Math.sin(ang) * off, ny = Math.cos(ang) * off;
  g.spawn(new Beam(m.x + nx, m.y - m.z + ny, u.x + Math.cos(ang) * 720 + nx, u.y + Math.sin(ang) * 720 - 10 + ny, life, { width, colors }));
  for (let d = 40; d < 700; d += 30) {
    const x = u.x + Math.cos(ang) * d + nx, y = u.y + Math.sin(ang) * d + ny;
    if (x < 0 || x > 360 || y < 60 || y > 640) break;
    g.marks.energy(x + rand(-5, 5), y + rand(-5, 5), rand(6, 9), rgb, 6);
  }
  return ang;
}

export const FAV_ULTS_2 = {
  // Psychic Blade Dance (Gallade): its elbow blades lengthen with psychic light, two cuts, a dance of strikes around
  // the foe, then one sweeping finishing cut.
  psychicBladeDance(a, g, u, t) {
    const PSY = [255, 140, 210];
    g.spawn(new ScreenDim(2.2, 0.5, '24,8,24'));
    for (const s of [-1, 1]) g.spawn(new BeamLine(u.x + s * 10, u.y - u.bodyZ, u.x + s * 30, u.y - u.bodyZ - 24, 0.6, '#ff8ad0', 5));
    sfx.clang();
    for (let i = 0; i < 2; i++) {
      a.later(0.2 + i * 0.16, () => {
        a.anim('Swing', 2);
        cut(g, t, i ? -0.6 : 0.6, 240, '#ff8ad0');
        g.shake(5, 0.12);
        sfx.slash();
        a.strike(0.15, { knockback: 60, stagger: 0.4 });
      });
    }
    blitz(a, g, u, t, {
      n: 6, gap: 0.11, start: 0.6, frac: 0.4, ghost: '#2a8a5a',
      onHit: (i, ang) => {
        g.spawn(new SlashArc(t.x, t.y, t.bodyZ, ang + Math.PI, { radius: 24, spread: 2.2, colors: ['#ff8ad0', '#ffffff'], width: 5, mirror: i % 2 === 1 }));
        sfx.slash();
      },
    });
    a.later(1.45, () => {
      a.anim('Swing', 1.4);
      cut(g, t, 0.1, 520, '#2a8a5a', 14);
      g.spawn(new SlashArc(t.x, t.y, t.bodyZ, 0.1, { radius: 50, spread: 2.8, colors: ['#ff8ad0', '#ffffff'], width: 9, life: 0.35 }));
      g.flash(0.08);
      crater(a, g, t.x, t.y, { r: 40, rgb: PSY, ring: '#ffffff', stop: 0.12 });
      sfx.slash();
      a.strike(0.3, { knockback: 280, stagger: 0.6 });
    });
    a.end(2.1);
  },

  // Celestial Radiance (Togekiss): it spreads its wings in blessing, stars rain over the foe, a dome of blessed light
  // rises, and a column of light descends.
  celestialRadiance(a, g, u, t) {
    const LIGHT = [255, 240, 180], C = ['#ffffff', '#fff2b0', '#f080b0'];
    g.spawn(new ScreenDim(2.2, 0.45, '30,24,20'));
    for (const s of [-1, 1]) g.spawn(new BeamLine(u.x, u.y - u.bodyZ, u.x + s * 60, u.y - u.bodyZ - 30, 0.8, '#ffffff', 7));
    g.spawn(new Glow(u.x, u.y, u.bodyZ, 50, LIGHT, 0.6, true));
    sfx.megaCharge();
    for (let i = 0; i < 14; i++) {
      a.later(0.2 + i * 0.05, () => {
        const aimed = i % 4 === 0, p = aimed ? { x: t.x, y: t.y } : { x: clampX(t.x + rand(-120, 120)), y: clampY(t.y + rand(-90, 90)) };
        g.spawn(new Falling(p.x, p.y, 0.4, 'star', () => {
          g.spawn(new Ring(p.x, p.y, { r0: 3, r1: 22, life: 0.3, color: '#fff2b0', width: 3 }));
          g.marks.energy(p.x, p.y, 10, LIGHT, 6);
          if (aimed) a.strike(0.4 / 4, { knockback: 60, stagger: 0.3 });
        }, LIGHT));
      });
    }
    a.later(1.1, () => {
      g.spawn(new PsyDome(t.x, t.y, 90, 0.6, [255, 200, 220]));
      a.later(0.2, () => a.strike(0.35, { knockback: 120, stagger: 0.5 }));
    });
    a.later(1.5, () => {
      g.spawn(new BeamLine(t.x, t.y - 480, t.x, t.y, 0.5, '#fff2b0', 22));
      g.spawn(new BeamLine(t.x, t.y - 480, t.x, t.y, 0.35, '#ffffff', 7));
      g.spawn(new Pillar(t.x, t.y, 0.6, LIGHT, 460));
      crater(a, g, t.x, t.y, { r: 40, rgb: LIGHT, ring: '#ffffff', mark: (x, y, r) => g.marks.energy(x, y, r, LIGHT, 6) });
      a.strike(0.25, { knockback: 260, stagger: 0.6 });
    });
    a.end(2.2);
  },

  // Tidal Earthquake (Swampert): it pounds the ground, the earth cracks as a muddy wave rolls over the arena, then
  // stone spikes burst up under the foe.
  tidalEarthquake(a, g, u, t) {
    const mud = [123, 111, 84], colors = ['#d1bc91', '#8d7654', '#5d776f'];
    g.spawn(new ScreenDim(2.08, 0.29, '18,19,13'));
    a.anim('Charge', 0.85);
    dustCloud(g, u.x, u.y, 12, 5);
    a.later(0.28, () => {
      a.anim('Attack', 1.27);
      const from = { x: u.x, y: u.y }, aim = u.aimAt(t), distance = u.distTo(t);
      const steps = Math.max(6, Math.ceil(distance / 29));
      let hit = false;
      g.marks.fracture(from.x, from.y, 28, 6);
      for (let i = 1; i <= steps; i++) a.later(i * 0.39 / steps, () => {
        const x = from.x + Math.cos(aim) * distance * i / steps, y = from.y + Math.sin(aim) * distance * i / steps;
        g.marks.fracture(x, y, 12, 6);
        g.marks.wet(x, y, 13);
        spray(g, x, y, 2, 4, colors, { speed: 75, up: 78 });
        if (hit || !alive(t) || Math.hypot(t.x - x, t.y - y) > t.radius + 22) return;
        hit = true;
        a.strike(0.35, { customArt: true, knockback: 55, stagger: 0.39 });
      });
      sfx.quake();
    });
    a.later(0.71, () => {
      const land = { x: t.x, y: t.y };
      a.anim('Hop', 1.05);
      glide(a, g, u, land, 0.45, '#677f91', {
        onStep(p) {
          u.zOverride = Math.sin(p * Math.PI) * 35;
          if (p < 1) return;
          u.zOverride = null;
          waterSplash(g, u.x, u.y);
          crater(a, g, u.x, u.y, { r: 44, rgb: mud, ring: '#ddc29b', shake: 12, reach: 127 });
          g.marks.wet(u.x, u.y, 44);
          g.marks.fracture(u.x, u.y, 36, 6);
          if (u.distTo(t) <= t.radius + u.radius + 18) a.strike(0.4, { customArt: true, knockback: 160, stagger: 0.5 });
          a.later(0.24, () => {
            const center = { x: land.x, y: land.y };
            g.spawn(new Ring(center.x, center.y, { r0: 9, r1: 97, life: 0.41, color: '#a8946e', width: 4 }));
            if (Math.hypot(t.x - center.x, t.y - center.y) <= 98 + t.radius) a.strike(0.25, { customArt: true, knockback: 200, stagger: 0.6 });
          });
        },
      });
    });
    a.end(1.94);
  },

  // Frozen Shadow Barrage (Weavile): it vanishes into shadow and slashes from every side with ice claws, ice
  // spikes burst under the foe, and the cold sets in as a final burst. Freezes.
  frozenShadowBarrage(a, g, u, t) {
    const ICE = [170, 230, 255];
    g.spawn(new ScreenDim(2.6, 0.6, '8,12,24'));
    for (let i = 0; i < 3; i++) g.spawn(new Afterimage(u, 0.25 + i * 0.1, '#2a1838'));
    sfx.whoosh();
    blitz(a, g, u, t, {
      n: 7, gap: 0.1, start: 0.2, frac: 0.5, ghost: '#9be6ff',
      onHit: (i, ang) => {
        g.spawn(new SlashArc(t.x, t.y, t.bodyZ, ang + Math.PI, { radius: 22, spread: 2.2, colors: ['#9be6ff', '#ffffff'], width: 5, mirror: i % 2 === 1 }));
        iceShatter(g, t.x, t.y, t.bodyZ);
        sfx.slash();
      },
    });
    for (const [dt, f] of [[1.05, 0.1], [1.3, 0.1], [1.55, 0.1]]) {
      a.later(dt, () => {
        for (let k = 0; k < 5; k++) g.spawn(new Spike(t.x + rand(-16, 16), t.y + rand(-8, 8), 'ice', 0.9));
        g.marks.frost(t.x, t.y, 24);
        sfx.shard();
        a.strike(f, { knockback: 50, stagger: 0.4 });
      });
    }
    a.later(2.0, () => {
      for (let i = 0; i < 3; i++) iceShatter(g, t.x + rand(-12, 12), t.y + rand(-6, 6), t.bodyZ);
      crater(a, g, t.x, t.y, { r: 44, rgb: ICE, ring: '#ffffff', mark: (x, y, r) => g.marks.frost(x, y, r) });
      a.strike(0.2, { knockback: 220, stagger: 0.5 });
    });
    a.later(2.1, () => status(g, u, t, 'freeze', 1));
    a.end(2.6);
  },

  // Inferno Sky Dive (Talonflame): fire rains as it climbs out of sight, then it dives through the air as a blazing
  // comet, and flames burst around the foe.
  infernoSkyDive(a, g, u, t) {
    const FLAME = [255, 120, 40];
    g.spawn(new ScreenDim(2.3, 0.5, '40,12,2'));
    g.spawn(new EnergyAura(u, 1.4, true, { glow: FLAME, rings: ['#fff0a0', '#ff7a2a'] }));
    for (let i = 0; i < 10; i++) {
      a.later(0.1 + i * 0.05, () => {
        const aimed = i % 3 === 0, p = aimed ? { x: t.x, y: t.y } : a.spot();
        g.spawn(new Falling(p.x, p.y, 0.4, 'orb', () => {
          a.erupt(p.x, p.y, FIRE, FLAME, 80);
          g.marks.scorch(p.x, p.y, 10, 6);
          if (aimed) a.strike(0.3 / 4, { knockback: 60, stagger: 0.3 });
        }, FLAME));
      });
    }
    const H = 360;
    let phase = null, ft = 0, from = null, shadow = null;
    a.ticks.push(dt => {
      shadow?.set(t.x, t.y);
      if (phase === 'rise') { u.zOverride = Math.min(H, u.zOverride + dt * 1000); g.spawn(new Afterimage(u, 0.2, '#ff7a2a')); }
      if (phase !== 'dive') return;
      ft += dt;
      const k = Math.min(1, ft / 0.24);
      u.x = from.x + (t.x - from.x) * k;
      u.y = from.y + (t.y - from.y) * k;
      u.zOverride = H * (1 - k * k);
      g.spawn(new Afterimage(u, 0.3, '#ffb070'));
      g.particles.spawn({ x: u.x + rand(-8, 8), y: u.y, z: u.zOverride + u.bodyZ, vz: rand(-20, 20), life: 0.4, size: rand(3, 6), sizeEnd: 1, colors: FIRE });
      if (k < 1) return;
      phase = 'done';
      if (shadow) shadow.dead = true;
      Object.assign(u, { zOverride: null, invuln: false });
      crater(a, g, u.x, u.y, { r: 50, rgb: FLAME, ring: '#fff0a0', mark: (x, y, r) => g.marks.scorch(x, y, r, 7) });
      sfx.quake();
      a.strike(0.5, { knockback: 300, stagger: 0.6 });
    });
    a.later(0.5, () => {
      Object.assign(u, { invuln: true, zOverride: u.z });
      phase = 'rise';
      windBurstLite(g, u);
      a.anim('Hop', 1);
      sfx.whoosh();
      shadow = g.spawn(new GroundMarker(t.x, t.y, 30, '255,120,40'));
      a.owned.push(shadow);
    });
    a.later(1.05, () => {
      phase = 'dive';
      from = { x: clampX(t.x + (t.x < 180 ? 110 : -110)), y: clampY(t.y - 60) };
      for (const [w, c, life] of [[12, '#ff7a2a', 0.4], [4, '#fff0a0', 0.3]]) g.spawn(new BeamLine(from.x, from.y - H, t.x, t.y - t.bodyZ, life, c, w));
      sfx.dash();
    });
    for (let i = 0; i < 4; i++) {
      a.later(1.55 + i * 0.06, () => {
        const ang = (i / 4) * Math.PI * 2 + 0.4, x = clampX(t.x + Math.cos(ang) * 40), y = clampY(t.y + Math.sin(ang) * 28);
        a.erupt(x, y, FIRE, FLAME, 200);
        g.marks.scorch(x, y, 12, 6);
        a.strike(0.05, { knockback: 60, stagger: 0.3 });
      });
    }
    a.end(2.3);
  },

  // Psychic Cataclysm (Alakazam): its spoons glow, rocks tear out of the ground and orbit, the foe is seized and
  // slammed, the rocks and a ring of orbs bombard it, and a dome of psychic force bursts.
  psychicCataclysm(a, g, u, t) {
    const rgb = [209, 133, 240], colors = ['#fff0fa', '#eb9cdf', '#8961ba'];
    g.spawn(new ScreenDim(2.16, 0.46, '25,14,36'));
    a.anim('Charge', 0.85);
    u.face(t.x, t.y);
    for (const side of [-1, 1]) a.later(side < 0 ? 0.04 : 0.15, () => {
      g.spawn(new Glow(u.x + side * 12, u.y, u.bodyZ + 6, 13, rgb, 0.59, true));
      g.spawn(new Ring(u.x + side * 12, u.y, { z: u.bodyZ + 6, r0: 22, r1: 5, life: 0.34, color: colors[1], layer: 'air', width: 2 }));
    });
    sfx.ascend();
    a.later(0.37, () => {
      if (!alive(t) || t.untouchable) return;
      a.anim('Shoot', 1);
      const x = t.x, y = t.y, side = x < 180 ? 1 : -1;
      const hold = g.spawn(new PsychicHold(t, 1.43));
      const rubble = [];
      for (let i = 0; i < 4; i++) {
        const angle = (i + 0.5) * Math.PI / 2;
        const px = clampX(x + Math.cos(angle) * 30), py = clampY(y + Math.sin(angle) * 19);
        g.marks.fracture(px, py, 10, 4);
        dustCloud(g, px, py, 4, 3);
        const rock = new FloatingRock(px, py, 5 + i % 2 * 2);
        if (!g.headless) {
          g.spawn(rock);
          rubble.push(rock);
        }
      }
      a.owned.push(...rubble);
      a.ticks.push(() => {
        if (hold.dead) return;
        for (const [i, rock] of rubble.entries()) {
          const angle = a.t * 4.2 + i * Math.PI / 2;
          rock.x = t.x + Math.cos(angle) * 39;
          rock.y = t.y + Math.sin(angle) * 18;
          rock.z = Math.max(10, t.lift * 0.72) + Math.sin(angle * 2) * 6;
        }
      });
      a.owned.push(hold);
      const shadow = g.spawn(new Ring(x, y, { r0: 16, r1: 28, life: 1.44, color: '#a36cb9', width: 2 }));
      a.ticks.push(() => Object.assign(shadow, { x: t.x, y: t.y }));
      a.lift(t, { x, y, z: 48 }, 0.38, 12, () => {
        g.spawn(new Glow(t.x, t.y, t.bodyZ, 39, rgb, 0.27));
        spray(g, t.x, t.y, t.bodyZ, 16, colors, { speed: 88, up: 38 });
        sfx.pulse();
        a.strike(0.25, { customArt: true, knockback: 0, stagger: 0.25 });
      }, colors[1], colors, true);
      a.later(0.41, () => {
        if (!alive(t)) return;
        a.anim('Swing', 1.05);
        a.lift(t, { x: clampX(x + 69 * side), y: clampY(y + 26), z: 61 }, 0.35, 12, () => {
          g.spawn(new Glow(t.x, t.y, t.bodyZ, 31, rgb, 0.25));
          spray(g, t.x, t.y, t.bodyZ, 13, colors, { speed: 87, up: 55 });
          sfx.zap(0.2);
          a.strike(0.24, { customArt: true, knockback: 0, stagger: 0.22 });
        }, colors[1], colors, true);
      });
      a.later(0.89, () => {
        if (!alive(t)) return;
        a.anim('Slam', 1.3);
        sfx.whoosh();
        a.lift(t, { x: clampX(x + 39 * side), y: clampY(y + 21), z: 0 }, 0.23, 0, () => {
          hold.dead = true;
          for (const rock of rubble) {
            rock.dead = true;
            debris(g, rock.x, rock.y, 4, 110);
          }
          const px = t.x, py = t.y;
          g.spawn(new Glow(px, py, 14, 53, rgb, 0.3));
          spray(g, px, py, 12, 23, colors, { speed: 139, up: 110 });
          crater(a, g, px, py, { r: 38, rgb, ring: colors[1], shake: 9, reach: 105 });
          a.strike(0.51, { customArt: true, knockback: 250, stagger: 0.6, hitstop: 0.06 });
        }, colors[1], colors);
      });
    });
    a.end(2.03);
  },

  // Serene Tidal Tempest (Milotic): it coils as a whirlpool forms around the foe, a shimmering wave washes over the
  // arena and restores it (heals 12%), and the water closes around the foe. Slows.
  sereneTidalTempest(a, g, u, t) {
    const aqua = [139, 211, 247], colors = ['#e7f8f8', '#9edbe9', '#d59cb7'];
    g.spawn(new ScreenDim(2.13, 0.29, '10,24,32'));
    a.anim('Charge', 0.85);
    u.face(t.x, t.y);
    sfx.waterRise();
    const center = { x: t.x, y: t.y };
    a.later(0.29, () => {
      a.anim('Shoot', 1.07);
      g.spawn(new Whirlpool(center.x, center.y, 60, 1.13));
      g.marks.wet(center.x, center.y, 41);
      sfx.hydro(0.83);
    });
    const within = r => alive(t) && !t.untouchable && Math.hypot(t.x - center.x, t.y - center.y) <= r + t.radius;
    a.later(0.58, () => {
      if (!within(60)) return;
      spray(g, t.x, t.y, 7, 13, colors, { speed: 94, up: 83 });
      a.strike(0.25, { customArt: true, knockback: 0, stagger: 0.35 });
    });
    a.later(0.81, () => {
      g.heal(u, u.maxHp * 0.12);
      g.spawn(new Glow(u.x, u.y, u.bodyZ, 31, aqua, 0.46));
      const down = t.y >= u.y, y0 = u.y, y1 = down ? 650 : 45;
      const wave = g.spawn(new TidalWave(y0, y1, 0.64, aqua, true));
      let hit = false;
      a.ticks.push(() => {
        if (hit || wave.age >= wave.life || !alive(t) || t.untouchable || Math.abs(wave.y - t.y) > t.radius + 14) return;
        hit = true;
        waterSplash(g, t.x, t.y);
        sfx.splash();
        a.strike(0.45, { customArt: true, knockback: 85, stagger: 0.35 });
      });
    });
    a.later(1.35, () => {
      g.spawn(new Glow(center.x, center.y, 13, 35, aqua, 0.33));
      waterSplash(g, center.x, center.y);
      g.spawn(new Ring(center.x, center.y, { r0: 7, r1: 71, life: 0.44, color: colors[0], width: 4 }));
      if (within(71) && a.strike(0.3, { customArt: true, knockback: 220, stagger: 0.5, hitstop: 0.055 })) status(g, u, t, 'slow', 3);
    });
    a.end(1.96);
  },

  // Dragon Axe Cataclysm (Haxorus): its tusks gleam like axes, it charges through the foe twice, swings two giant
  // axe cuts, then splits the ground.
  dragonAxeCataclysm(a, g, u, t) {
    const AXE = [255, 220, 120];
    g.spawn(new ScreenDim(2.2, 0.6, '24,16,6'));
    for (const s of [-1, 1]) g.spawn(new SlashArc(u.x + s * 8, u.y, u.headZ - 4, s > 0 ? 0 : Math.PI, { radius: 14, spread: 1.6, colors: ['#c8a030', '#fff0a0'], width: 4, life: 0.5 }));
    sfx.clang();
    for (let i = 0; i < 2; i++) {
      a.later(0.1 + i * 0.3, () => {
        const p = through(u, t, 80);
        a.anim('Attack', 2);
        sfx.dash();
        charge(a, g, u, t, p, 0.15, '#c8a030', () => {
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 6, r1: 60, life: 0.3, color: '#fff0a0', width: 4, layer: 'air' }));
          g.hitstop(0.05);
          g.shake(7, 0.2);
          a.strike(0.15, { knockback: 160, stagger: 0.45, dirX: Math.cos(p.ang), dirY: Math.sin(p.ang) });
        }, '#fff0a0');
      });
    }
    for (let i = 0; i < 2; i++) {
      a.later(0.85 + i * 0.22, () => {
        a.anim('Swing', 1.6);
        const ang = i ? -1.1 : 1.1;
        cut(g, t, ang, 480, '#c8a030', 14);
        g.spawn(new SlashArc(t.x, t.y, t.bodyZ, ang, { radius: 44, spread: 2.6, colors: ['#c8a030', '#ffffff'], width: 8, life: 0.35 }));
        for (let k = -3; k <= 3; k++) g.marks.fracture(t.x + Math.cos(ang) * k * 26, t.y + Math.sin(ang) * k * 26, 12, 6.5);
        g.flash(0.06);
        g.shake(10, 0.3);
        sfx.slash();
        a.strike(0.225, { knockback: 200, stagger: 0.5 });
      });
    }
    a.later(1.5, () => {
      for (let i = 0; i < 8; i++) {
        const p = a.spot();
        g.marks.fracture(p.x, p.y, rand(16, 26), 7);
        dustCloud(g, p.x, p.y, 4, 4);
      }
      crater(a, g, t.x, t.y, { r: 56, rgb: AXE, ring: '#fff0a0', shake: 15 });
      sfx.quake();
      a.strike(0.25, { knockback: 220, stagger: 0.6 });
    });
    a.end(2.2);
  },

  // Tri-Dragon Annihilation (Hydreigon): all three heads charge dark energy and fire one after another, then the
  // beams' energy erupts around the foe.
  triDragonAnnihilation(a, g, u, t) {
    const DARK = [130, 70, 180], C = ['#e0c8ff', '#6a3a8a', '#1a0a30'];
    g.spawn(new ScreenDim(2.3, 0.65, '10,4,20'));
    const heads = [-14, 0, 14];
    heads.forEach((off, i) => a.later(i * 0.1, () => {
      const ang = u.aimAt(t), m = a.mouth(), nx = -Math.sin(ang) * off, ny = Math.cos(ang) * off;
      g.spawn(new Glow(m.x + nx, m.y + ny, m.z, 14, DARK, 0.6 - i * 0.1, true));
    }));
    let gather = 0.6;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(120, dt, C, 50); });
    sfx.roar();
    sfx.beamCharge(0.6);
    heads.forEach((off, i) => a.later(0.6 + i * 0.12, () => {
      a.anim('Shoot', 2);
      const ang = beamFrom(a, g, u, t, { off, width: 20, colors: [C[2], C[1], '#ffffff'], rgb: DARK });
      g.shake(7, 0.3);
      sfx.beamFire();
      a.later(0.05, () => {
        g.spawn(new Ripple(t, '#e0c8ff'));
        // Heavy knockback like the old beams: each one launches the foe, as before.
        a.strike(0.25, { knockback: 300, stagger: 0.5, dirX: Math.cos(ang), dirY: Math.sin(ang) });
      });
    }));
    a.later(1.45, () => {
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2, x = clampX(t.x + Math.cos(ang) * 50), y = clampY(t.y + Math.sin(ang) * 36);
        g.spawn(new Pillar(x, y, 0.5, DARK, 200));
      }
      crater(a, g, t.x, t.y, { r: 46, rgb: DARK, ring: '#e0c8ff', mark: (x, y, r) => g.marks.energy(x, y, r, DARK, 6) });
      a.strike(0.25, { knockback: 260, stagger: 0.6 });
    });
    a.end(2.2);
  },

  // Digital Distortion (Porygon-Z): the arena glitches, a volley of data packets fires at the foe, three bolts of
  // corrupted data crash down, and a glitch vortex swallows it. Paralyzes.
  digitalDistortion(a, g, u, t) {
    const NEON = [255, 90, 200], C = ['#ffffff', '#ff5ac8', '#3a6ad0'];
    g.spawn(new ScreenDim(2.6, 0.6, '10,6,24'));
    let glitch = 2.2;
    a.ticks.push(dt => {
      if ((glitch -= dt) <= 0 || Math.random() > 0.5) return;
      const y = rand(80, 620), x = rand(0, 300);
      g.spawn(new BeamLine(x, y, x + rand(20, 60), y, 0.08, Math.random() < 0.5 ? '#ff5ac8' : '#5ad8ff', rand(2, 5)));
    });
    sfx.zap(0.4);
    for (let i = 0; i < 9; i++) {
      a.later(0.1 + i * 0.07, () => {
        const m = a.mouth(), off = (i % 3 - 1) * 12;
        g.spawn(new Missile(m.x, m.y, t.x + off, t.y, Math.max(20, m.z), 0.25, 'crystal', () => {
          g.spawn(new Ring(t.x + off, t.y, { z: t.bodyZ, r0: 3, r1: 18, life: 0.2, color: i % 2 ? '#ff5ac8' : '#5ad8ff', width: 3, layer: 'air' }));
          a.strike(0.4 / 9, { knockback: 30, stagger: 0.25 });
        }, i % 2 ? NEON : [90, 216, 255]));
        sfx.denied();
      });
    }
    for (let i = 0; i < 3; i++) {
      a.later(1.0 + i * 0.14, () => {
        g.spawn(new Lightning(t.x + rand(-5, 5), 60, t.x, t.y - 4, 0.3, { width: 4, branches: 5, glow: 'rgba(255,90,200,0.6)', core: '#ffffff' }));
        electricBurst(g, t.x, t.y, 6, 14);
        g.marks.energy(t.x, t.y, 16, NEON, 6);
        g.flash(0.06);
        sfx.thunder();
        a.strike(0.1, { knockback: 80, stagger: 0.4 });
      });
    }
    a.later(1.5, () => {
      let left = 0.5;
      a.ticks.push(dt => { if ((left -= dt) > 0) inward(g, t.x, t.y, t.bodyZ, 4, 80, ['#ff5ac8', '#5ad8ff', '#ffffff']); });
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 50, NEON, 0.5, true));
    });
    a.later(2.0, () => {
      g.spawn(new Ring(t.x, t.y, { r0: 90, r1: 4, life: 0.25, color: '#5ad8ff', width: 4 }));
      crater(a, g, t.x, t.y, { r: 40, rgb: NEON, ring: '#ffffff', mark: (x, y, r) => g.marks.energy(x, y, r, NEON, 6) });
      a.strike(0.3, { knockback: 240, stagger: 0.5 });
    });
    a.later(2.1, () => status(g, u, t, 'para'));
    a.end(2.6);
  },
};

// A small gust at the user's feet as it takes off.
function windBurstLite(g, u) {
  g.spawn(new Ring(u.x, u.y, { r0: 6, r1: 60, life: 0.3, color: '#ffffff', width: 3 }));
  dustCloud(g, u.x, u.y, 10, 5);
}
