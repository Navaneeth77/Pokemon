// Legendary signature ultimates, batch 2: Solgaleo, Lunala, Zacian, Zamazenta, Eternatus, Koraidon, Arceus, Zapdos,
// Moltres and Darkrai. Same rules as ult-legends.js: staged wind-up → climax → aftermath, damage shares adding up
// to 1 through `a.strike`, and each keeps its old mechanics (Thunderous Skies paralyzes, Dark Void puts the foe to
// sleep between its two halves).
import {
  Effect, rand, FIRE, Glow, Ring, Pillar, Falling, Beam, BeamLine, SlashArc, PsyDome, ScreenDim, Afterimage, EnergyAura,
  GroundMarker, Lightning, StormCloud, Ripple, dustCloud, windBurst, electricBurst,
} from './effects.js';
import { sfx } from './audio.js';
import { spray, crater, charge, through } from './ult-choreo.js';

const alive = t => t.alive && !t.hidden;
const status = (g, u, t, name, dur) => { if (alive(t)) g.applyStatus(t, name, { source: u, dur }); };

// A crescent moon hanging in the sky, with a soft glow (Lunala).
export class Crescent extends Effect {
  constructor(x, y, r, life, color = '#efe4ff', glow = [200, 150, 255]) {
    super('air', life);
    Object.assign(this, { x, y, r, color, glow });
  }

  draw(ctx) {
    const t = this.age / this.life, a = Math.min(1, this.age / 0.25) * (t > 0.8 ? (1 - t) / 0.2 : 1), r = this.r, [R, G, B] = this.glow;
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r * 2.4);
    g.addColorStop(0, `rgba(${R},${G},${B},${0.55 * a})`);
    g.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(this.x - r * 2.4, this.y - r * 2.4, r * 4.8, r * 4.8);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.rect(this.x - r * 3, this.y - r * 3, r * 6, r * 6);
    ctx.arc(this.x + r * 0.45, this.y - r * 0.25, r * 0.85, 0, Math.PI * 2);
    ctx.clip('evenodd');
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Rays of light bursting out of a point.
function rays(g, x, y, n, len, color, life = 0.4, width = 4, spin = 0) {
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + spin;
    g.spawn(new BeamLine(x + Math.cos(ang) * 10, y + Math.sin(ang) * 10, x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.8, life, color, width));
  }
}

// The user leaps out of sight, a marker tracks the foe, and at `fallAt` it drops onto it; `onLand` runs on impact.
function leapOnto(a, g, u, t, { H = 320, rise = 900, fallAt = 0.6, fall = 0.22, ghost = '#ffffff', marker = '255,220,140', trail, onLand }) {
  let phase = 'rise', ft = 0, from = null, shadow = null;
  Object.assign(u, { invuln: true, zOverride: u.z });
  a.anim('Hop', 1);
  a.ticks.push(dt => {
    shadow?.set(t.x, t.y);
    if (phase === 'rise') {
      u.zOverride = Math.min(H, u.zOverride + dt * rise);
      if (u.zOverride < H) g.spawn(new Afterimage(u, 0.2, ghost));
    }
    if (phase !== 'fall') return;
    ft += dt;
    const k = Math.min(1, ft / fall);
    u.x = from.x + (t.x - from.x) * k;
    u.y = from.y + (t.y - from.y) * k;
    u.zOverride = H * (1 - k * k);
    g.spawn(new Afterimage(u, 0.25, ghost));
    trail?.(k);
    if (k < 1) return;
    phase = 'done';
    if (shadow) shadow.dead = true;
    Object.assign(u, { zOverride: null, invuln: false });
    onLand();
  });
  a.later(0.15, () => {
    shadow = g.spawn(new GroundMarker(t.x, t.y, 34, marker));
    a.owned.push(shadow);
  });
  a.later(fallAt, () => {
    phase = 'fall';
    from = { x: u.x, y: u.y };
    sfx.whoosh();
  });
}

export const LEGEND_ULTS_2 = {
  // Sunsteel Strike (Solgaleo): it blazes like the sun, leaps into the sky, a sun rises over the foe, and it falls
  // as a meteor of sunlight.
  sunsteelStrike(a, g, u, t) {
    const SUN = [255, 200, 90], C = ['#fff6c0', '#ffb040', '#8a4a10'];
    g.spawn(new ScreenDim(2.4, 0.5, '36,22,4'));
    g.spawn(new Glow(u.x, u.y, u.bodyZ, 60, SUN, 0.6, true));
    g.spawn(new EnergyAura(u, 1.6, true, { glow: SUN, rings: ['#fff6c0', '#ffb040'] }));
    for (let i = 0; i < 3; i++) a.later(i * 0.15, () => rays(g, u.x, u.y - u.bodyZ, 12, 70, '#ffe08a', 0.3, 3, i * 0.26));
    let gather = 0.5;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(110, dt, C, 50); });
    sfx.megaCharge();
    a.later(0.5, () => {
      windBurst(g, u.x, u.y, 6, 28, C);
      dustCloud(g, u.x, u.y, 12, 6);
      leapOnto(a, g, u, t, {
        H: 340, fallAt: 0.8, fall: 0.24, ghost: '#ffd060', marker: '255,200,90',
        trail: () => g.particles.spawn({ x: u.x + rand(-10, 10), y: u.y, z: u.zOverride + u.bodyZ, vz: rand(-20, 30), life: 0.4, size: rand(3, 6), sizeEnd: 1, colors: FIRE }),
        onLand: () => {
          rays(g, t.x, t.y, 16, 160, '#fff6c0', 0.5, 5);
          g.spawn(new Pillar(t.x, t.y, 0.6, SUN, 460));
          crater(a, g, t.x, t.y, { r: 60, rgb: SUN, ring: '#fff6c0', mark: (x, y, r) => g.marks.scorch(x, y, r, 7), shake: 16 });
          sfx.quake();
          a.strike(0.8, { knockback: 320, stagger: 0.7 });
        },
      });
    });
    // A sun rises over the foe while Solgaleo is up there.
    a.later(0.85, () => {
      g.spawn(new Glow(t.x, t.y, 200, 70, SUN, 0.5, true));
      a.later(0.1, () => rays(g, t.x, t.y - 200, 14, 80, '#ffe08a', 0.35, 3));
      sfx.beamCharge(0.4);
    });
    a.later(1.8, () => {
      g.spawn(new Ring(t.x, t.y, { r0: 10, r1: 480, life: 0.6, color: '#ffe08a', width: 7 }));
      g.shake(6, 0.3);
      a.strike(0.2, { knockback: 200 });
    });
    a.end(2.3);
  },

  // Moongeist Beam (Lunala): night falls and a crescent moon rises, moonlight drifts down into Lunala's wings, and it
  // fires a beam of ghostly moonlight; a dome of night closes on the foe.
  moongeistBeam(a, g, u, t) {
    const VIOLET = [190, 140, 255], C = ['#ffffff', '#c890ff', '#2a1a6a'];
    g.spawn(new ScreenDim(2.4, 0.7, '10,4,30'));
    g.spawn(new Crescent(180, 120, 26, 2.2));
    let moon = 0.7;
    a.ticks.push(dt => {
      if ((moon -= dt) <= 0) return;
      a.converge(100, dt, C, 50);
      if (Math.random() < 0.6) g.particles.spawn({ x: rand(20, 340), y: rand(80, 620), z: rand(120, 200), vz: -rand(60, 120), life: 0.9, size: rand(1.5, 3), colors: ['#ffffff', '#c890ff'] });
    });
    for (const s of [-1, 1]) g.spawn(new BeamLine(u.x, u.y - u.bodyZ, u.x + s * 64, u.y - u.bodyZ - 30, 0.7, '#c890ff', 6));
    sfx.beamCharge(0.7);
    a.later(0.7, () => {
      const ang = u.aimAt(t), m = a.mouth();
      a.anim('Shoot', 1);
      g.spawn(new Beam(m.x, m.y - m.z, u.x + Math.cos(ang) * 720, u.y + Math.sin(ang) * 720 - 10, 0.75, { width: 34, colors: [C[2], C[1], '#ffffff'] }));
      for (let d = 50; d < 700; d += 40) {
        const x = u.x + Math.cos(ang) * d, y = u.y + Math.sin(ang) * d;
        if (x < 0 || x > 360 || y < 60 || y > 640) break;
        g.spawn(new Ring(x, y, { z: 12, r0: 6, r1: 34, life: 0.4, color: '#e8d8ff', width: 2, layer: 'air' }));
        g.marks.energy(x + rand(-5, 5), y + rand(-5, 5), rand(6, 10), VIOLET, 6);
      }
      g.shake(9, 0.5);
      g.flash(0.08);
      sfx.beamFire();
      a.later(0.05, () => {
        g.spawn(new Ripple(t, '#e8d8ff'));
        a.strike(0.8, { knockback: 280, stagger: 0.5, dirX: Math.cos(ang), dirY: Math.sin(ang) });
      });
    });
    a.later(1.5, () => {
      g.spawn(new PsyDome(t.x, t.y, 80, 0.6, VIOLET));
      crater(a, g, t.x, t.y, { r: 40, rgb: VIOLET, ring: '#e8d8ff', mark: (x, y, r) => g.marks.energy(x, y, r, VIOLET, 6) });
      a.strike(0.2, { knockback: 220, stagger: 0.5 });
    });
    a.end(2.3);
  },

  // Behemoth Blade (Zacian): a golden sword forms in its jaws, one colossal overhead cut splits the arena through the
  // foe, then two lightning-fast passes cross it.
  behemothBlade(a, g, u, t) {
    const GOLD = [255, 210, 90], C = ['#ffffff', '#ffd060', '#3a6ad0'];
    g.spawn(new ScreenDim(2.2, 0.55, '6,14,36'));
    g.spawn(new EnergyAura(u, 0.6, false, { glow: GOLD, rings: ['#ffffff', '#3a6ad0'] }));
    for (let i = 1; i <= 6; i++) {
      a.later(i * 0.06, () => {
        const ang = u.aimAt(t), m = a.mouth();
        g.spawn(new BeamLine(m.x, m.y - m.z, m.x + Math.cos(ang) * i * 9, m.y - m.z + Math.sin(ang) * i * 9, 0.5, '#ffd060', 5));
        g.spawn(new BeamLine(m.x, m.y - m.z, m.x + Math.cos(ang) * i * 9, m.y - m.z + Math.sin(ang) * i * 9, 0.4, '#ffffff', 2));
      });
    }
    let gather = 0.45;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(100, dt, C, 40); });
    sfx.clang();
    // The overhead cut.
    a.later(0.5, () => {
      a.anim('Swing', 1.4);
      const ang = -Math.PI / 2 + 0.25, L = 300;
      g.spawn(new BeamLine(t.x - Math.cos(ang) * L, t.y - Math.sin(ang) * L - 12, t.x + Math.cos(ang) * L, t.y + Math.sin(ang) * L - 12, 0.45, '#ffd060', 14));
      g.spawn(new BeamLine(t.x - Math.cos(ang) * L, t.y - Math.sin(ang) * L - 12, t.x + Math.cos(ang) * L, t.y + Math.sin(ang) * L - 12, 0.3, '#ffffff', 4));
      g.spawn(new SlashArc(t.x, t.y, t.bodyZ, ang, { radius: 50, spread: 2.6, colors: ['#ffd060', '#ffffff'], width: 9, life: 0.35 }));
      for (let k = -4; k <= 4; k++) g.marks.fracture(t.x + Math.cos(ang) * k * 30, t.y + Math.sin(ang) * k * 30, 12, 6.5);
      g.flash(0.1);
      crater(a, g, t.x, t.y, { r: 40, rgb: GOLD, ring: '#ffffff', stop: 0.12 });
      sfx.slash();
      a.strike(0.55, { knockback: 160, stagger: 0.6 });
    });
    // Two crossing passes.
    for (let i = 0; i < 2; i++) {
      a.later(1.05 + i * 0.32, () => {
        const p = through(u, t, 90);
        a.anim('Attack', 2);
        sfx.dash();
        charge(a, g, u, t, p, 0.14, i ? '#3a6ad0' : '#ffd060', () => {
          g.spawn(new SlashArc(t.x, t.y, t.bodyZ, p.ang + Math.PI / 2, { radius: 34, spread: 2.8, colors: ['#ffd060', '#ffffff'], width: 7, mirror: i === 1 }));
          spray(g, t.x, t.y, t.bodyZ, 10, ['#ffffff', '#ffd060', '#8ab0ff'], { speed: 140, up: 80, size: [2, 3], life: [0.25, 0.4] });
          g.hitstop(0.06);
          g.shake(8, 0.25);
          sfx.clang();
          a.strike(0.225, { knockback: 180, stagger: 0.45, dirX: Math.cos(p.ang), dirY: Math.sin(p.ang) });
        }, '#fff2c0');
      });
    }
    a.end(2.2);
  },

  // Behemoth Bash (Zamazenta): a great shield of light forms in front of it, it rams the foe shield-first three
  // times, then slams the shield down in a shockwave.
  behemothBash(a, g, u, t) {
    const RED = [255, 130, 90], C = ['#ffffff', '#ff8a60', '#8a2a2a'];
    g.spawn(new ScreenDim(2.4, 0.55, '30,8,8'));
    g.spawn(new EnergyAura(u, 1.7, true, { glow: RED, rings: ['#ffffff', '#ff8a60'] }));
    const shieldAt = () => {
      const ang = u.aimAt(t), d = u.radius + 8;
      return { x: u.x + Math.cos(ang) * d, y: u.y + Math.sin(ang) * d };
    };
    let shield = 1.85;
    a.ticks.push(dt => {
      if ((shield -= dt) <= 0) return;
      const p = shieldAt();
      if (Math.random() < 0.7) g.spawn(new Glow(p.x, p.y, u.bodyZ, 30, RED, 0.12));
    });
    for (let i = 0; i < 3; i++) {
      a.later(i * 0.12, () => {
        const p = shieldAt();
        g.spawn(new Ring(p.x, p.y, { z: u.bodyZ, r0: 4, r1: 30 - i * 6, life: 0.5, color: C[i], width: 3, layer: 'air' }));
      });
    }
    sfx.clang();
    for (let i = 0; i < 3; i++) {
      a.later(0.45 + i * 0.32, () => {
        const p = through(u, t, 80);
        a.anim('Attack', 2);
        sfx.dash();
        charge(a, g, u, t, p, 0.16, i % 2 ? '#8a2a2a' : '#ff8a60', () => {
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 8, r1: 80, life: 0.35, color: '#ffffff', width: 6, layer: 'air' }));
          g.spawn(new Glow(t.x, t.y, t.bodyZ, 40, RED, 0.25));
          dustCloud(g, t.x, t.y, 8, 5);
          g.hitstop(0.06);
          g.shake(9, 0.25);
          sfx.clang();
          sfx.hit(true);
          a.strike(0.7 / 3, { knockback: 220, stagger: 0.5, dirX: Math.cos(p.ang), dirY: Math.sin(p.ang) });
        }, '#ffd0c0');
      });
    }
    a.later(1.6, () => {
      a.anim('Attack', 1);
      g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 480, life: 0.6, color: '#ffffff', width: 8 }));
      g.spawn(new Ring(u.x, u.y, { r0: 8, r1: 320, life: 0.5, color: '#ff8a60', width: 5 }));
      g.marks.fracture(u.x, u.y, 44, 7.5);
      dustCloud(g, u.x, u.y, 16, 6);
      a.boom(11);
      sfx.quake();
      a.later((u.distTo(t) / 480) * 0.6, () => a.strike(0.3, { knockback: 260, stagger: 0.5 }));
    });
    a.end(2.3);
  },

  // Dynamax Cannon (Eternatus): the sky turns crimson, Dynamax energy swirls into its core, it fires a colossal beam,
  // and red Dynamax pillars burst out of the ground across the arena.
  dynamaxCannon(a, g, u, t) {
    const RED = [255, 60, 110], C = ['#ffd0e0', '#ff3a6a', '#4a0a2a'];
    g.spawn(new ScreenDim(2.5, 0.75, '40,2,16'));
    let swirl = 2;
    a.ticks.push(dt => {
      if ((swirl -= dt) <= 0) return;
      for (let i = 0; i < 2; i++) {
        const ang = a.t * 3 + i * Math.PI + rand(-0.3, 0.3), r = rand(120, 170);
        g.particles.spawn({ x: 180 + Math.cos(ang) * r, y: 200 + Math.sin(ang) * r * 0.4, z: 140, vx: -Math.sin(ang) * 80, vy: Math.cos(ang) * 30, life: 0.6, size: rand(3, 6), colors: ['#ff3a6a', '#4a0a2a'] });
      }
    });
    g.spawn(new Glow(u.x, u.y, u.bodyZ, 30, RED, 0.75, true));
    let gather = 0.75;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(140, dt, C, 60); });
    for (let i = 0; i < 6; i++) a.later(i * 0.12, () => g.spawn(new Ring(u.x, u.y, { z: u.bodyZ, r0: 90, r1: 8, life: 0.3, color: C[i % 2], width: 3, layer: 'air' })));
    sfx.beamCharge(0.75);
    a.later(0.75, () => {
      const ang = u.aimAt(t), m = a.mouth();
      a.anim('Shoot', 1);
      g.spawn(new Beam(m.x, m.y - m.z, u.x + Math.cos(ang) * 720, u.y + Math.sin(ang) * 720 - 10, 0.85, { width: 48, colors: [C[2], C[1], '#ffffff'] }));
      for (let d = 40; d < 700; d += 22) {
        const x = u.x + Math.cos(ang) * d, y = u.y + Math.sin(ang) * d;
        if (x < 0 || x > 360 || y < 60 || y > 640) break;
        g.marks.energy(x + rand(-8, 8), y + rand(-8, 8), rand(8, 12), RED, 6);
        if (d % 66 < 22) g.spawn(new Ring(x, y, { z: 10, r0: 4, r1: 44, life: 0.35, color: '#ffd0e0', width: 3, layer: 'air' }));
      }
      g.shake(12, 0.7);
      g.flash(0.12);
      sfx.beamFire();
      a.later(0.05, () => a.strike(0.8, { knockback: 300, stagger: 0.5, dirX: Math.cos(ang), dirY: Math.sin(ang) }));
    });
    // Dynamax pillars; two of the ten rise under the foe.
    for (let i = 0; i < 10; i++) {
      a.later(1.45 + i * 0.05, () => {
        const aimed = i === 3 || i === 7, p = aimed ? { x: t.x, y: t.y } : a.spot();
        g.spawn(new Pillar(p.x, p.y, 0.6, RED, aimed ? 380 : 240));
        g.spawn(new Ring(p.x, p.y, { r0: 4, r1: 30, life: 0.35, color: '#ff8aa8', width: 3 }));
        g.marks.energy(p.x, p.y, 14, RED, 6);
        g.shake(3, 0.12);
        if (aimed) {
          sfx.explosion();
          a.strike(0.1, { knockback: 120, stagger: 0.4 });
        }
      });
    }
    a.end(2.4);
  },

  // Collision Course (Koraidon): it revs up kicking dust and sparks, charges through the foe twice, then leaps and
  // crashes down on it.
  collisionCourse(a, g, u, t) {
    const ORANGE = [255, 120, 60], C = ['#fff0a0', '#ff5a3a', '#6a1a1a'];
    g.spawn(new ScreenDim(2.3, 0.5, '36,10,4'));
    g.spawn(new EnergyAura(u, 0.6, false, { glow: ORANGE, rings: ['#fff0a0', '#ff5a3a'] }));
    let rev = 0.45;
    a.ticks.push(dt => {
      if ((rev -= dt) <= 0) return;
      const back = u.aimAt(t) + Math.PI;
      g.particles.spawn({ x: u.x + rand(-6, 6), y: u.y + rand(-3, 3), z: 2, vx: Math.cos(back) * rand(80, 160), vy: Math.sin(back) * rand(40, 80), vz: rand(20, 60), gz: 200, life: 0.4, size: rand(3, 5), sizeEnd: 1, colors: ['#d8c8a8', '#a08a60'] });
      if (Math.random() < 0.4) g.particles.spawn({ x: u.x, y: u.y, z: 4, vx: Math.cos(back) * 200, vy: Math.sin(back) * 100, vz: 60, gz: 300, life: 0.3, size: 2, colors: ['#fff0a0'] });
    });
    g.marks.scorch(u.x, u.y, 14, 6);
    sfx.roar();
    for (let i = 0; i < 2; i++) {
      a.later(0.45 + i * 0.3, () => {
        const p = through(u, t, 80);
        a.anim('Attack', 2);
        sfx.dash();
        charge(a, g, u, t, p, 0.15, '#ff5a3a', () => {
          g.spawn(new Ring(t.x, t.y, { z: t.bodyZ, r0: 6, r1: 70, life: 0.3, color: '#fff0a0', width: 5, layer: 'air' }));
          spray(g, t.x, t.y, t.bodyZ, 12, FIRE, { speed: 140, up: 100, size: [2, 4], life: [0.3, 0.5] });
          g.marks.scorch(t.x, t.y, 12, 6);
          g.hitstop(0.05);
          g.shake(8, 0.25);
          a.strike(0.25, { knockback: 180, stagger: 0.45, dirX: Math.cos(p.ang), dirY: Math.sin(p.ang) });
        }, '#ffb070');
      });
    }
    a.later(1.1, () => {
      windBurst(g, u.x, u.y, 6, 20, C);
      leapOnto(a, g, u, t, {
        H: 260, fallAt: 0.4, fall: 0.2, ghost: '#ff5a3a', marker: '255,120,60',
        onLand: () => {
          a.erupt(t.x, t.y, FIRE, ORANGE, 260);
          crater(a, g, t.x, t.y, { r: 56, rgb: ORANGE, ring: '#fff0a0', mark: (x, y, r) => g.marks.scorch(x, y, r, 7), shake: 15 });
          sfx.quake();
          a.strike(0.5, { knockback: 320, stagger: 0.7 });
        },
      });
    });
    a.end(2.3);
  },

  // Judgment (Arceus): a golden wheel of light turns around it, it hurls orbs of light into the sky, they rain down
  // across the arena, and a pillar of holy light comes down on the foe.
  judgment(a, g, u, t) {
    const GOLD = [255, 230, 150], C = ['#ffffff', '#fff2b0', '#c8a040'];
    g.spawn(new ScreenDim(2.5, 0.55, '30,24,8'));
    g.spawn(new EnergyAura(u, 1.6, true, { glow: GOLD, rings: ['#fff2b0', '#c8a040'] }));
    for (let i = 0; i < 4; i++) a.later(i * 0.1, () => g.spawn(new Ring(u.x, u.y, { z: u.bodyZ, r0: 30 + i * 6, r1: 34 + i * 6, life: 0.8, color: C[i % 3], width: 2, layer: 'air', hold: true })));
    let gather = 0.6;
    a.ticks.push(dt => { if ((gather -= dt) > 0) a.converge(110, dt, C, 50); });
    sfx.megaCharge();
    // Orbs fly up out of sight.
    for (let i = 0; i < 5; i++) {
      a.later(0.55 + i * 0.05, () => {
        const orb = g.spawn(new Glow(u.x + rand(-20, 20), u.y, u.bodyZ, 14, GOLD, 0.4));
        a.ticks.push(dt => { orb.z += dt * 800; });
      });
    }
    a.later(0.55, () => { a.anim('Shoot', 1); sfx.pulse(); });
    // Judgment rains down; every fourth light lands on the foe.
    for (let i = 0; i < 20; i++) {
      a.later(0.85 + i * 0.045, () => {
        const aimed = i % 4 === 0, p = aimed ? { x: t.x, y: t.y } : a.spot();
        g.spawn(new Falling(p.x, p.y, 0.4, 'star', () => {
          g.spawn(new Ring(p.x, p.y, { r0: 3, r1: 26, life: 0.3, color: '#fff2b0', width: 3 }));
          g.spawn(new Glow(p.x, p.y, 6, 24, GOLD, 0.25));
          g.marks.energy(p.x, p.y, rand(8, 12), GOLD, 6);
          if (i % 3 === 0) sfx.explosion();
          if (aimed) a.strike(0.7 / 5, { knockback: 90, stagger: 0.3 });
        }, GOLD));
      });
    }
    a.later(1.9, () => {
      g.spawn(new BeamLine(t.x, t.y - 480, t.x, t.y, 0.55, '#fff2b0', 26));
      g.spawn(new BeamLine(t.x, t.y - 480, t.x, t.y, 0.4, '#ffffff', 9));
      g.spawn(new Pillar(t.x, t.y, 0.7, GOLD, 480));
      rays(g, t.x, t.y, 12, 110, '#fff2b0', 0.4, 4);
      g.flash(0.12);
      crater(a, g, t.x, t.y, { r: 46, rgb: GOLD, ring: '#ffffff', mark: (x, y, r) => g.marks.energy(x, y, r, GOLD, 6) });
      a.strike(0.3, { knockback: 280, stagger: 0.6 });
    });
    a.end(2.6);
  },

  // Thunderous Skies (Zapdos): it flies up into gathering storm clouds, lightning hammers the arena, and it comes
  // down on the foe as a bolt itself. Paralyzes.
  thunderousSkies(a, g, u, t) {
    const VOLT = [255, 240, 120];
    g.spawn(new ScreenDim(2.4, 0.6, '8,10,30'));
    g.spawn(new EnergyAura(u, 0.6, true, { glow: VOLT, rings: ['#ffffff', '#fff27a'] }));
    for (let i = 0; i < 6; i++) a.later(i * 0.05, () => g.spawn(new StormCloud(30 + i * 60, 76 + (i % 2) * 18, 2.1)));
    sfx.storm(1.8);
    a.later(0.4, () => {
      windBurst(g, u.x, u.y, 6, 24, ['#ffffff', '#fff27a']);
      leapOnto(a, g, u, t, {
        H: 420, rise: 1200, fallAt: 1.25, fall: 0.12, ghost: '#fff27a', marker: '255,240,120',
        onLand: () => {
          g.spawn(new Lightning(t.x, 50, t.x, t.y - 4, 0.5, { width: 7, branches: 9, glow: 'rgba(255,240,120,0.7)' }));
          electricBurst(g, t.x, t.y, 6, 30);
          g.marks.burn(t.x, t.y, 30);
          crater(a, g, t.x, t.y, { r: 50, rgb: VOLT, ring: '#ffffff', shake: 14 });
          sfx.thunder();
          a.strike(0.35, { knockback: 280, stagger: 0.6 });
        },
      });
    });
    // Sixteen bolts; every fourth on the foe.
    for (let i = 0; i < 16; i++) {
      a.later(0.55 + i * 0.065, () => {
        const aimed = i % 4 === 0, p = aimed ? { x: t.x, y: t.y } : a.spot();
        g.spawn(new Lightning(p.x + rand(-6, 6), 80, p.x, p.y - 4, 0.25, { width: 2.5, branches: 4, glow: 'rgba(255,240,120,0.6)' }));
        g.marks.burn(p.x, p.y, 10);
        g.spawn(new Glow(p.x, p.y, 6, 20, VOLT, 0.2));
        if (i % 2 === 0) sfx.thunderbolt();
        if (aimed) a.strike(0.65 / 4, { knockback: 80, stagger: 0.3 });
      });
    }
    a.later(1.85, () => status(g, u, t, 'para'));
    a.end(2.3);
  },

  // Sky Inferno (Moltres): its wings flare, fire rains from the sky across the arena, then it swoops through the foe
  // and leaves a wall of flame behind.
  skyInferno(a, g, u, t) {
    const FLAME = [255, 140, 50], C = ['#fff0a0', '#ff7a2a', '#b8461c'];
    g.spawn(new ScreenDim(2.4, 0.5, '40,14,4'));
    g.spawn(new EnergyAura(u, 0.6, true, { glow: FLAME, rings: ['#fff0a0', '#ff7a2a'] }));
    let wings = 0.6;
    a.ticks.push(dt => {
      if ((wings -= dt) <= 0) return;
      for (const s of [-1, 1]) g.particles.spawn({ x: u.x + s * rand(20, 46), y: u.y + rand(-4, 4), z: u.bodyZ + rand(0, 16), vz: rand(40, 100), life: 0.4, size: rand(3, 5), sizeEnd: 1, colors: FIRE });
    });
    sfx.flamethrower(0.6);
    // Fire rains down; every fourth on the foe.
    for (let i = 0; i < 16; i++) {
      a.later(0.5 + i * 0.05, () => {
        const aimed = i % 4 === 0, p = aimed ? { x: t.x, y: t.y } : a.spot();
        g.spawn(new Falling(p.x, p.y, 0.4, 'orb', () => {
          a.erupt(p.x, p.y, FIRE, FLAME, 80);
          g.marks.scorch(p.x, p.y, rand(9, 13), 6);
          if (i % 2 === 0) sfx.explosion();
          if (aimed) a.strike(0.6 / 4, { knockback: 80, stagger: 0.3 });
        }, FLAME));
      });
    }
    // The swoop and the firewall.
    a.later(1.45, () => {
      const p = through(u, t, 100), from = { x: u.x, y: u.y };
      a.anim('Attack', 2);
      sfx.dash();
      charge(a, g, u, t, p, 0.2, '#ff7a2a', () => {
        crater(a, g, t.x, t.y, { r: 36, rgb: FLAME, ring: '#fff0a0', mark: (x, y, r) => g.marks.scorch(x, y, r, 7), stop: 0.08, shake: 10 });
        a.strike(0.4, { knockback: 240, stagger: 0.5, dirX: Math.cos(p.ang), dirY: Math.sin(p.ang) });
      }, '#ffd8a0');
      for (let k = 1; k <= 8; k++) {
        a.later(0.03 * k, () => {
          const x = from.x + (p.x - from.x) * (k / 8), y = from.y + (p.y - from.y) * (k / 8);
          g.spawn(new Pillar(x, y, 0.7, FLAME, 120));
          g.marks.scorch(x, y, 10, 6);
        });
      }
    });
    a.end(2.3);
  },

  // Dark Void (Darkrai): darkness spreads across the floor, a black void swallows the foe and puts it to sleep, then
  // nightmares strike it as dark lightning.
  darkVoid(a, g, u, t) {
    const VOID = [90, 50, 140], C = ['#d0b8ff', '#4a2a6a', '#05030a'];
    g.spawn(new ScreenDim(2.3, 0.85, '4,2,8'));
    for (let i = 0; i < 4; i++) a.later(i * 0.1, () => g.spawn(new Ring(u.x, u.y, { r0: 10, r1: 420, life: 0.9, color: i % 2 ? '#2a1438' : '#4a2a6a', width: 10 - i * 2 })));
    a.anim('Shoot', 1);
    sfx.zap(0.5);
    // The void.
    a.later(0.35, () => {
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 70, [20, 10, 30], 0.8, true));
      let left = 0.75;
      a.ticks.push(dt => {
        if ((left -= dt) <= 0) return;
        for (let i = 0; i < 4; i++) {
          const ang = rand(0, Math.PI * 2), r = rand(50, 90), x = t.x + Math.cos(ang) * r, y = t.y + Math.sin(ang) * r * 0.6;
          g.particles.spawn({ x, y, z: rand(4, 40), vx: (t.x - x) / 0.4 - Math.sin(ang) * 60, vy: (t.y - y) / 0.4 + Math.cos(ang) * 30, life: 0.4, size: rand(3, 6), sizeEnd: 1, colors: ['#05030a', '#4a2a6a', '#d0b8ff'], fade: false });
        }
      });
      sfx.zap(0.75);
    });
    a.later(1.1, () => {
      g.spawn(new Ring(t.x, t.y, { r0: 90, r1: 4, life: 0.25, color: '#d0b8ff', width: 4 }));
      g.spawn(new Glow(t.x, t.y, t.bodyZ, 60, VOID, 0.4));
      g.marks.energy(t.x, t.y, 30, VOID, 6);
      a.boom(8);
      a.strike(0.5, { knockback: 60, stagger: 0.5 });
    });
    a.later(1.15, () => {
      status(g, u, t, 'sleep', 1.8);
      for (let i = 0; i < 3; i++) g.particles.spawn({ x: t.x + 6 + i * 4, y: t.y, z: t.headZ + 6 + i * 8, vx: 10, vz: 18, life: 0.9, size: 3 + i, colors: ['#d0b8ff'], fade: true });
    });
    // Nightmares.
    for (let i = 0; i < 6; i++) {
      a.later(1.3 + i * 0.1, () => {
        const onFoe = i % 2 === 0, p = onFoe ? t : a.spot();
        g.spawn(new Lightning(p.x + rand(-6, 6), 70, p.x, p.y - 4, 0.25, { width: 2.5, branches: 4, glow: 'rgba(120,70,180,0.6)', core: '#d0b8ff' }));
        g.marks.energy(p.x, p.y, 12, VOID, 6);
        if (i % 2 === 0) sfx.thunderbolt();
        if (onFoe) a.strike(0.5 / 3, { knockback: 50, stagger: 0.3 });
      });
    }
    a.end(2.2);
  },
};

