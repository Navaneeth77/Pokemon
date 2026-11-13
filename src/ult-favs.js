import { spawnStructure, structureField } from './arena-structures.js';
// Signature ultimates of fan favourites, batch 5: Venusaur, Blastoise, Infernape, Scizor, Zoroark, Sylveon, Lapras,
// Aegislash, Umbreon and Espeon. Same rules as ult-legends.js; Sheer Cold keeps its freeze.
import {
  Effect, rand, FIRE, Glow, Ring, Pillar, Falling, Spike, Missile, Beam, BeamLine, SlashArc, PsyDome, ScreenDim, Afterimage,
  RainbowStreak, Ripple, dustCloud, leafBurst, iceShatter, metalSparks, waterSplash,
} from './effects.js';
import { sfx } from './audio.js';
import { clampX, clampY, inward, spray, crater, glide } from './ult-choreo.js';
import { Crescent } from './ult-legends2.js';

class FairyRibbon extends Effect {
  constructor(user, target, side, life) {
    super('air', life);
    Object.assign(this, { user, target, side });
  }

  draw(ctx) {
    const { user, target, side } = this;
    const p = Math.min(1, this.age / 0.25);
    const loosen = Math.max(0, (this.age - this.life + 0.24) / 0.24);
    const fromX = user.x + side * 4, fromY = user.y - user.headZ + 5;
    const toX = target.x, toY = target.y - target.bodyZ;
    const color = side > 0 ? '#e99bbc' : '#91c9e1';
    const edge = side > 0 ? '#986083' : '#577d9c';
    const ribbon = k => {
      const sweep = Math.sin(Math.PI * k);
      return [
        fromX + (toX - fromX) * k + side * (sweep * 45 + Math.sin(k * 7.5) * k * (15 + loosen * 25)),
        fromY + (toY - fromY) * k - sweep * 48 + Math.cos(k * 7.5) * k * 12,
      ];
    };
    ctx.save();
    ctx.globalAlpha *= 1 - loosen;
    const [x, y] = ribbon(0);
    ctx.beginPath();
    ctx.moveTo(x, y - 2);
    for (let i = 1; i <= 20; i++) {
      const k = p * i / 20, [px, py] = ribbon(k);
      ctx.lineTo(px, py - Math.sin(k * 3.2) * 7 - 2);
    }
    for (let i = 20; i >= 0; i--) {
      const k = p * i / 20, [px, py] = ribbon(k);
      ctx.lineTo(px, py + Math.sin(k * 3.2) * 6 + 2);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = edge;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - 1);
    for (let i = 1; i <= 20; i++) {
      const [px, py] = ribbon(p * i / 20);
      ctx.lineTo(px, py - 1);
    }
    ctx.strokeStyle = '#fff1f4';
    ctx.stroke();
    ctx.restore();
  }
}

class IceCrown extends Effect {
  constructor(x, y, life) {
    super('air', life);
    Object.assign(this, { x, y, breakAt: life });
  }

  draw(ctx) {
    const p = Math.min(1, this.age / 0.31);
    const scatter = Math.max(0, (this.age - this.breakAt) / 0.36);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha *= (1 - Math.min(1, scatter)) * 0.92;
    for (const [offset, height, width, lean] of [[-36, 32, 10, -13], [31, 40, 11, 13], [-21, 60, 12, -9], [21, 69, 14, 10], [0, 89, 18, -4]]) {
      const lift = scatter * (1 - scatter) * 100;
      ctx.save();
      ctx.translate(offset * (1 + scatter * 1.8), -lift - Math.abs(offset) * 0.13);
      ctx.rotate(Math.sign(offset || 1) * scatter * 0.62);
      const h = Math.max(1, height * p), half = width * (0.45 + p * 0.55);
      ctx.beginPath();
      ctx.moveTo(-half, 0); ctx.lineTo(lean - half * 0.42, -h * 0.8);
      ctx.lineTo(lean, -h); ctx.lineTo(lean + half * 0.55, -h * 0.78);
      ctx.lineTo(half, 0); ctx.lineTo(2, 5); ctx.closePath();
      ctx.fillStyle = '#9bd1e9'; ctx.fill();
      ctx.strokeStyle = '#4e829f'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(2, 5); ctx.lineTo(lean, -h); ctx.lineTo(lean + half * 0.55, -h * 0.78); ctx.lineTo(half, 0); ctx.closePath();
      ctx.fillStyle = '#d9f8ff'; ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

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
      for (let i = 0; i < 12; i++) {
        const ang = a.t * 5 + (i / 12) * Math.PI * 2 + rand(-0.2, 0.2);
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
    a.later(0.38, () => {
      a.anim('Shoot', 0.96);
      const origin = { x: u.x, y: u.y }, angle = u.aimAt(t), distance = u.distTo(t);
      const count = Math.max(5, Math.ceil((distance + 15) / 30));
      let hit = false;
      for (let i = 1; i <= count; i++) a.later(i * 0.59 / count, () => {
        const p = i / count, r = 12 + p * 22;
        const x = origin.x + Math.cos(angle) * (distance + 15) * p, y = origin.y + Math.sin(angle) * (distance + 15) * p;
        g.spawn(new Ring(x, y, { r0: 6, r1: r, life: 0.25, color: p > 0.5 ? C[0] : C[1], width: 2.5 }));
        g.spawn(new Glow(x, y, 12, r, DARK, 0.2));
        if (!hit && alive(t) && !t.untouchable && Math.hypot(t.x - x, t.y - y) <= r + t.radius) {
          hit = true;
          a.strike(0.55, { customArt: true, knockback: 115, stagger: 0.35 });
        }
      });
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

  // Two waves of ribbon light wind around the target before the final pull.
  fairyRibbons(a, g, u, t) {
    const colors = ['#fff5f6', '#ecaccd', '#9ad6ec'];
    g.spawn(new ScreenDim(1.94, 0.23, '34,17,34'));
    u.face(t.x, t.y);
    a.anim('Charge', 0.95);
    for (const [side, at] of [[-1, 0.15], [1, 0.27]]) a.later(at, () => {
      g.spawn(new Glow(u.x + side * 9, u.y, u.headZ, 20, [234, 148, 204], 0.28));
    });
    const aim = u.aimAt(t);
    const reach = Math.max(0, u.distTo(t) - 73);
    const approach = { x: clampX(u.x + Math.cos(aim) * reach), y: clampY(u.y + Math.sin(aim) * reach) };
    a.later(0.34, () => {
      a.anim('Hop', 1.2);
      glide(a, g, u, approach, 0.32, '#d3a0c3', {
        onStep(p) { u.zOverride = p < 1 ? 12 * Math.sin(p * Math.PI) : null; },
      });
    });
    let bound = false;
    for (const [at, side, share] of [[0.55, -1, 0.22], [0.77, 1, 0.23]]) a.later(at, () => {
      if (!alive(t) || u.distTo(t) > 130) return;
      a.anim('Swing', 1.2);
      if (!g.headless) g.spawn(new FairyRibbon(u, t, side, side < 0 ? 0.81 : 0.63));
      sfx.whoosh();
      a.later(0.25, () => {
        if (!alive(t) || t.untouchable || u.distTo(t) > 130) return;
        bound = true;
        const x = t.x, y = t.y, z = t.bodyZ;
        g.spawn(new Glow(x, y, z, 30, [240, 157, 221], 0.25));
        spray(g, x, y, z, 14, colors, { speed: 92, up: 57 });
        a.strike(share, { customArt: true, knockback: 10, stagger: 0.24 });
      });
    });
    a.later(1.08, () => {
      if (!bound || !alive(t) || t.untouchable || u.distTo(t) > 132) return;
      a.anim('Attack', 1.25);
      const x = t.x, y = t.y;
      a.lift(t, { x, y, z: 0 }, 0.32, 31, () => {
        g.spawn(new Glow(x, y, 16, 51, [240, 148, 211], 0.36));
        for (const [color, r1, life] of [['#e49ac9', 56, 0.32], ['#aedfed', 77, 0.46]]) {
          g.spawn(new Ring(x, y, { r0: 7, r1, life, color, width: 4 }));
        }
        spray(g, x, y, 13, 28, colors, { speed: 153, up: 89 });
        sfx.shard();
        g.shake(6, 0.25);
        a.strike(0.55, { customArt: true, knockback: 230, stagger: 0.52, hitstop: 0.058 });
      }, '#efb5de', colors);
    });
    a.end(1.91);
  },

  // Lapras sends cold along the ground from its own position. Ice forms at contact and then breaks apart.
  sheerCold(a, g, u, t) {
    const aqua = [132, 205, 247], colors = ['#f0fcff', '#a0d9ed', '#518fbf'];
    const field = structureField();
    g.spawn(new ScreenDim(2.25, 0.34, '11,25,44'));
    u.face(t.x, t.y);
    a.anim('Charge', 0.81);
    sfx.waterRise();
    const center = { x: t.x, y: t.y }, source = { x: u.x, y: u.y };
    const aim = u.aimAt(t), dx = center.x - source.x, dy = center.y - source.y;
    const release = 0.34, travel = 0.48;
    a.later(release, () => {
      a.anim('Shoot', 1.09);
      sfx.wind(travel);
      if (g.headless) return;
      const gust = new Effect('air', 0.62);
      gust.draw = ctx => {
        const p = Math.min(1, gust.age / travel);
        ctx.save();
        for (let i = 0; i < 34; i++) {
          const trail = i % 7 * 0.055, k = p - trail;
          if (k < 0) continue;
          const spread = Math.sin(i * 7.41 + gust.age * 6) * (11 + k * 39);
          const x = source.x + dx * k - Math.sin(aim) * spread;
          const y = source.y + dy * k + Math.cos(aim) * spread - 12 - (i % 6) * 2;
          ctx.globalAlpha = Math.min(1, k * 5, (gust.life - gust.age) * 9) * (0.56 + i % 3 * 0.15);
          ctx.fillStyle = colors[i % 3];
          ctx.fillRect(Math.round(x), Math.round(y), i % 4 === 0 ? 4 : 2, i % 4 === 0 ? 4 : 2);
          if (i % 4 === 0) {
            ctx.fillRect(Math.round(x - 2), Math.round(y + 1), 8, 2);
            ctx.fillRect(Math.round(x + 1), Math.round(y - 2), 2, 8);
          }
        }
        ctx.restore();
      };
      g.spawn(gust);
    });
    let firstHit = false;
    for (let i = 1; i <= 12; i++) a.later(release + travel * i / 12, () => {
      const k = i / 12, x = source.x + dx * k, y = source.y + dy * k;
      if (i % 3 === 0) spray(g, x, y, 7, 5, colors, { speed: 49, up: 36, life: [0.16, 0.28] });
      if (firstHit || !alive(t) || t.untouchable || Math.hypot(t.x - x, t.y - y) > t.radius + 25) return;
      firstHit = true;
      iceShatter(g, x, y, 8);
      a.strike(0.35, { customArt: true, knockback: 27, stagger: 0.31 });
    });
    let crown;
    a.later(0.86, () => {
      g.marks.frost(center.x, center.y, 43);
      crown = g.spawn(new IceCrown(center.x, center.y + 7, 0.96));
      waterSplash(g, center.x, center.y);
      sfx.ice();
    });
    for (const [i, at] of [0.92, 1.06, 1.21].entries()) a.later(at, () => {
      const x = clampX(center.x + (i - 1) * 23), y = clampY(center.y + (i % 2 ? 8 : -5));
      spawnStructure(g, u, field, x, y, { style: 'ice', type: 'ice', damage: 0.026 });
      g.spawn(new Glow(x, y, 25, 31, aqua, 0.27));
      sfx.shard();
      if (!t.untouchable && Math.hypot(t.x - x, t.y - y) <= t.radius + 32) a.strike(0.15, { customArt: true, knockback: 17, stagger: 0.26 });
    });
    a.later(1.47, () => {
      if (crown) crown.breakAt = crown.age;
      iceShatter(g, center.x, center.y, 33);
      waterSplash(g, center.x, center.y);
      g.spawn(new Glow(center.x, center.y, 34, 58, aqua, 0.38));
      for (const [color, r1, life] of [[colors[0], 56, 0.28], [colors[1], 86, 0.47]]) {
        g.spawn(new Ring(center.x, center.y, { r0: 9, r1, life, color, width: 4 }));
      }
      g.shake(9, 0.29);
      sfx.ice();
      if (t.untouchable || Math.hypot(t.x - center.x, t.y - center.y) > t.radius + 58) return;
      if (a.strike(0.2, { customArt: true, knockback: 220, stagger: 0.5, hitstop: 0.065 })) status(g, u, t, 'freeze', 1.2);
    });
    a.end(2.03);
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
    const gold = [255, 219, 118], dark = [56, 39, 79];
    g.spawn(new ScreenDim(1.94, 0.59, '6,4,12'));
    g.spawn(new Crescent(u.x <= 180 ? 71 : 289, 88, 23, 1.6, '#ffe680', gold));
    a.anim('Charge', 0.85);
    for (let i = 0; i < 4; i++) a.later(i * 0.105, () => {
      g.spawn(new Ring(u.x, u.y, { z: u.bodyZ, layer: 'air', r0: 15 + i * 4, r1: 8, life: 0.35, color: '#e7be68', width: 2 }));
      g.spawn(new Glow(u.x, u.y, u.headZ, 12, gold, 0.25));
    });
    sfx.zap(0.46);
    a.later(0.48, () => {
      a.anim('Shoot', 1.15);
      const aim = u.aimAt(t), start = { x: u.x, y: u.y }, distance = Math.min(655, u.distTo(t) + 52);
      let center;
      for (let i = 0; i <= 15; i++) a.later(i * 0.036, () => {
        const p = i / 15, x = start.x + Math.cos(aim) * distance * p, y = start.y + Math.sin(aim) * distance * p;
        g.spawn(new Ring(x, y, { r0: 7, r1: 24 + i, life: 0.3, color: i % 2 ? '#c89c51' : '#65507d', width: 2 }));
        if (center || !alive(t) || t.untouchable || Math.hypot(t.x - x, t.y - y) > 22 + t.radius) return;
        center = { x, y };
        g.spawn(new PsyDome(x, y, 49, 0.45, dark));
        a.strike(0.5, { customArt: true, knockback: 45, stagger: 0.35 });
        a.later(0.39, () => {
          crater(a, g, x, y, { r: 43, rgb: gold, ring: '#ffe680', reach: 116, mark: (x, y, r) => g.marks.energy(x, y, r, dark, 6) });
          if (Math.hypot(t.x - x, t.y - y) < 58 + t.radius) a.strike(0.5, { customArt: true, knockback: 260, stagger: 0.6 });
        });
      });
      sfx.pulse();
    });
    a.end(1.79);
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
