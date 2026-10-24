import { outlinedText, roundRect } from './draw.js';
import { TYPE_COLORS } from './data/types.js';
import { CLASS_LABEL } from './data/species.js';
import { WORLD_W, WORLD_H } from './arena.js';
import {
  Ring, Glow, Pillar, Spike, Lightning, rand, debris, dustCloud, windBurst, iceShatter, electricBurst, leafBurst, metalSparks, waterSplash, FIRE,
} from './effects.js';
import { sfx } from './audio.js';
import { quality } from './quality.js';

const ease = t => 1 - (1 - t) * (1 - t);
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// ── Battle intro: both teams slide in on banners before the first send-out. Skippable. ──
export class Showcase {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.dur = 2.6;
    sfx.megaCharge();
  }

  get done() { return this.t >= this.dur; }

  update(dt) {
    this.t += dt;
  }

  skip() {
    this.t = this.dur;
  }

  band(ctx, team, y, fromRight, color, dark) {
    const k = ease(Math.min(1, Math.max(0, (this.t - (fromRight ? 0 : 0.25)) / 0.45)));
    const off = (1 - k) * (fromRight ? WORLD_W : -WORLD_W);
    ctx.save();
    ctx.translate(off, 0);
    ctx.fillStyle = dark;
    const v = this.game.view, L = -v.ox - 20, R = v.w - v.ox + 20;
    ctx.beginPath();
    ctx.moveTo(L, y - 46);
    ctx.lineTo(R, y - 62);
    ctx.lineTo(R, y + 46);
    ctx.lineTo(L, y + 62);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(L, y + 40, R - L, 3);
    outlinedText(ctx, team.trainer.name.toUpperCase(), fromRight ? WORLD_W - 14 : 14, y - 34, {
      family: 'Luckiest Guy', weight: 400, size: 15, color, align: fromRight ? 'right' : 'left', lw: 3,
    });
    const n = team.members.length, step = n > 3 ? 56 : 110, half = n > 3 ? 12 : 25;
    team.members.forEach((m, i) => {
      const x = WORLD_W / 2 + (i - (n - 1) / 2) * step, py = y - 10;
      roundRect(ctx, x - half, py - half, half * 2, half * 2, 5, '#10131a');
      roundRect(ctx, x - half + 2, py - half + 2, half * 2 - 4, half * 2 - 4, 4, TYPE_COLORS[m.species.types[0]][1]);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(m.portrait, x - half + 4, py - half + 4, half * 2 - 8, half * 2 - 8);
      ctx.imageSmoothingEnabled = false;
      const name = m.species.name.toUpperCase();
      outlinedText(ctx, name, x, py + half + 11, { size: n > 3 ? (name.length > 8 ? 4.5 : 5.5) : name.length > 9 ? 7 : 8, align: 'center', lw: 2 });
      if (m.species.class !== 'regular') {
        outlinedText(ctx, CLASS_LABEL[m.species.class].toUpperCase(), x, py - half - 3, { size: n > 3 ? 4.5 : 5.5, align: 'center', color: '#ffd84a', lw: 2 });
      }
    });
    ctx.restore();
  }

  draw(ctx) {
    const g = this.game, t = this.t, fade = t > this.dur - 0.3 ? Math.max(0, (this.dur - t) / 0.3) : Math.min(1, t / 0.15);
    ctx.save();
    ctx.globalAlpha = fade;
    const v = this.game.view;
    ctx.fillStyle = 'rgba(6,8,16,0.82)';
    ctx.fillRect(-v.ox, -v.oy, v.w, v.h);
    this.band(ctx, g.opponentTeam, 210, true, '#f5c542', '#3a2a0a');
    this.band(ctx, g.playerTeam, 450, false, '#ff6a4d', '#3a120c');
    const vk = Math.min(1, Math.max(0, (t - 0.55) / 0.25));
    if (vk > 0) {
      ctx.save();
      ctx.translate(WORLD_W / 2, 332);
      ctx.scale(2.2 - 1.2 * ease(vk), 2.2 - 1.2 * ease(vk));
      ctx.globalAlpha = fade * vk;
      outlinedText(ctx, 'VS', 0, 12, { family: 'Luckiest Guy', weight: 400, size: 38, color: '#ffffff', stroke: '#24100c', lw: 6, align: 'center' });
      ctx.restore();
    }
    outlinedText(ctx, g.arena.theme.name.toUpperCase(), WORLD_W / 2, 120, { size: 10, align: 'center', color: '#ffd84a', lw: 3 });
    outlinedText(ctx, 'PRESS ENTER TO SKIP', WORLD_W / 2, WORLD_H - 18, { size: 6, align: 'center', color: '#c9d2de', lw: 2 });
    ctx.restore();
  }
}

// Element-flavoured finishing bursts, distinct from each Pokémon's ultimate.
const FINISH_FX = {
  fire(g, x, y) {
    g.spawn(new Pillar(x, y, 0.8, [255, 140, 50], 480));
    for (let i = 0; i < 40; i++) g.particles.spawn({ x, y, z: 6, vx: rand(-160, 160), vy: rand(-110, 110), vz: rand(60, 220), gz: 160, life: 0.9, size: rand(4, 8), sizeEnd: 1, colors: FIRE });
    g.marks.scorch(x, y, 50, 8);
  },
  water(g, x, y) {
    for (let i = 0; i < 4; i++) g.later(i * 0.08, () => waterSplash(g, x + rand(-20, 20), y + rand(-12, 12)));
    g.marks.wet(x, y, 60, 8);
  },
  electric(g, x, y) {
    for (let i = 0; i < 5; i++) g.later(i * 0.07, () => g.spawn(new Lightning(x + rand(-30, 30), 40, x, y - 4, 0.35, { width: 5, branches: 7 })));
    electricBurst(g, x, y, 10, 40);
    g.marks.burn(x, y, 40);
  },
  ice(g, x, y) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.spawn(new Spike(x + Math.cos(a) * 34, y + Math.sin(a) * 24, 'ice', 1.6));
    }
    iceShatter(g, x, y, 12);
    g.marks.frost(x, y, 60, 8);
  },
  grass(g, x, y) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.spawn(new Spike(x + Math.cos(a) * 34, y + Math.sin(a) * 24, 'vine', 1.6));
    }
    leafBurst(g, x, y, 12, 30);
    g.marks.leaves(x, y, 50, 8);
  },
  rock(g, x, y) {
    debris(g, x, y, 60, 240);
    g.marks.fracture(x, y, 90, 9);
  },
  steel(g, x, y) {
    for (let i = 0; i < 4; i++) metalSparks(g, x + rand(-16, 16), y + rand(-10, 10), 14);
    g.marks.fracture(x, y, 60, 8);
  },
  flying: (g, x, y) => windBurst(g, x, y, 14, 80, ['#ffffff', '#e6f6ff', '#9b8cf2']),
  bug: (g, x, y) => leafBurst(g, x, y, 12, 40),
};
FINISH_FX.ground = FINISH_FX.rock;

function finishBurst(g, x, y, type) {
  const [c1, c2] = TYPE_COLORS[type] ?? ['#ffffff', '#888888'];
  const rgb = hexRgb(c1);
  for (const [r1, col, w, life] of [[520, '#ffffff', 9, 0.8], [360, c1, 7, 0.7], [220, c2, 5, 0.6]]) g.spawn(new Ring(x, y, { r0: 8, r1, life, color: col, width: w }));
  g.spawn(new Glow(x, y, 16, 120, rgb, 0.8));
  for (let i = 0; i < 50; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(120, 320);
    g.particles.spawn({ x, y, z: 14, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rand(-20, 120), drag: 2.5, life: rand(0.6, 1.1), size: rand(2, 5), sizeEnd: 1, colors: ['#ffffff', c1, c2] });
  }
  (FINISH_FX[type] ?? (() => g.marks.energy(x, y, 60, rgb, 8)))(g, x, y);
  dustCloud(g, x, y, 24, 8);
}

const POSES = ['Pose', 'Hop', 'RearUp', 'Roar', 'Rotate', 'Charge'];

// ── Finishing move (the final KO by a strong attack) and the victory sequence that follows. ──
// Normal combat is stopped; the camera, effects and HUD are driven from here. Skippable.
export class Finale {
  constructor(game, { winner, loser, move }) {
    this.game = game;
    this.winner = winner;
    this.loser = loser;
    this.move = move;
    this.raidVictory = !!loser.boss;
    this.finisher = this.raidVictory || !!move && (move.ultimate || move.power >= 90 || move.chargeLevel > 0);
    this.t = this.finisher ? 0 : 1.4;
    this.end = 4.4;
    this.fired = new Set();
    this.dir = { x: Math.sign(loser.x - winner.x) || 1, y: Math.sign(loser.y - winner.y) || -1 };
    this.from = { x: loser.x, y: loser.y };
    const poses = POSES.filter(p => winner.sprite.has(p));
    this.pose = poses[(winner.baseSpecies.id.length + (game.summary?.species?.player?.[winner.baseSpecies.id]?.kos ?? 0)) % poses.length] ?? 'Idle';
    this.type = move?.type ?? winner.species.types[0];
    game.slowT = 0;
  }

  get done() { return this.t >= this.end; }
  get slow() { return this.finisher && this.t < 1.2; }

  once(key, at, fn) {
    if (this.t >= at && !this.fired.has(key)) {
      this.fired.add(key);
      fn();
    }
  }

  skip() {
    this.t = this.end;
  }

  update(dt) {
    const g = this.game, w = this.winner, l = this.loser;
    this.t += dt;
    if (this.raidVictory) {
      this.once('raid-collapse', 0.25, () => {
        l.sprite.play('Faint', { loop: false, force: true });
        const rgb = hexRgb(TYPE_COLORS[l.species.types[0]][0]);
        g.spawn(new Pillar(l.x, l.y, 1.1, rgb, 520));
        g.marks.fracture(l.x, l.y, 100, 8);
        for (let i = 0; i < (quality().particles > 500 ? 6 : 3); i++) {
          const a = i * Math.PI / 3;
          g.spawn(new Ring(l.x + Math.cos(a) * 50, l.y + Math.sin(a) * 30, { r0: 4, r1: 120, life: 0.8, color: TYPE_COLORS[l.species.types[0]][0], width: 3 }));
        }
        sfx.roar();
      });
      l.sprite.update(dt);
    }
    if (this.finisher) {
      this.once('impact', 0, () => {
        g.flash(0.25);
        g.shake(14, 1);
        finishBurst(g, l.x, l.y, this.type);
        sfx.explosion();
        sfx.thunder();
        g.ui.log(`${w.species.name} landed the finishing blow!`, w.side);
      });
      // The defeated Pokémon is blasted away in slow motion.
      const k = Math.min(1, this.t / 1.1);
      l.x = this.from.x + this.dir.x * 70 * ease(k);
      l.y = this.from.y + this.dir.y * 50 * ease(k);
      l.clamp();
    }
    this.once('pose', 1.4, () => {
      w.cancelAction();
      w.hidden = false;
      w.sprite.play(this.pose, { loop: true, force: true });
      const [c1, c2] = TYPE_COLORS[w.species.types[0]];
      g.spawn(new Ring(w.x, w.y, { r0: 6, r1: 90, life: 0.6, color: c1, width: 4 }));
      g.spawn(new Glow(w.x, w.y, w.bodyZ, 50, hexRgb(c1), 0.8));
      for (let i = 0; i < 40; i++) {
        g.particles.spawn({ x: w.x + rand(-60, 60), y: w.y + rand(-40, 20), z: rand(60, 140), vz: rand(-30, 10), gz: 40, life: rand(1.2, 2), size: rand(2, 3), colors: ['#ffffff', c1, c2, '#ffd84a'] });
      }
      (w.side === 'player' ? g.red : g.gold).setPose('point', 3);
      sfx.victory();
    });
    if (this.t > 1.4) {
      w.sprite.update(dt);
      if (this.pose === 'Hop' && w.sprite.done) w.sprite.play('Hop', { loop: true, force: true });
    }
  }

  // Camera target: the finishing blow first, then the winner.
  focus() {
    const w = this.winner, l = this.loser, t = this.t;
    if (this.finisher && t < 1.3) {
      const k = Math.min(1, t / 0.15);
      return { x: l.x, y: l.y - l.bodyZ, zoom: 1 + 0.9 * k, dim: 0.35 * k };
    }
    const k = ease(Math.min(1, (t - 1.3) / 0.4));
    return { x: w.x, y: w.y - w.bodyZ, zoom: 1 + 0.7 * k, dim: 0.4 };
  }

  drawLines(ctx) {
    // Radial speed lines while the finishing blow lands.
    const f = this.focus(), a = Math.max(0, 1 - this.t / 1.2);
    ctx.save();
    ctx.globalAlpha = 0.5 * a;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2 + this.t * 0.6, r0 = 120 + (i % 3) * 30;
      ctx.beginPath();
      ctx.moveTo(f.x + Math.cos(ang) * r0, f.y + Math.sin(ang) * r0);
      ctx.lineTo(f.x + Math.cos(ang) * 600, f.y + Math.sin(ang) * 600);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Screen-space overlay: "FINISH!" over the blow, then the winner's name and victory banner.
  draw(ctx) {
    const t = this.t, w = this.winner;
    if (this.finisher && t < 1.3) {
      const k = Math.min(1, t / 0.2), [c1] = TYPE_COLORS[this.type];
      ctx.save();
      ctx.translate(WORLD_W / 2, 300);
      ctx.rotate(-0.08);
      ctx.scale(1.8 - 0.8 * ease(k), 1.8 - 0.8 * ease(k));
      ctx.globalAlpha = t > 1.1 ? Math.max(0, (1.3 - t) / 0.2) : 1;
      outlinedText(ctx, this.raidVictory ? 'LEGEND DEFEATED!' : 'FINISH!', 0, 14, { family: 'Luckiest Guy', weight: 400, size: this.raidVictory ? 28 : 44, color: '#ffffff', stroke: '#24100c', lw: 7, align: 'center' });
      outlinedText(ctx, (this.move?.name ?? this.loser.species.name).toUpperCase(), 0, 40, { family: 'Luckiest Guy', weight: 400, size: 13, color: c1, stroke: '#24100c', lw: 4, align: 'center' });
      ctx.restore();
    }
    if (t > 1.7) {
      const k = ease(Math.min(1, (t - 1.7) / 0.35)), win = w.side === 'player';
      ctx.save();
      ctx.translate((1 - k) * -WORLD_W, 0);
      ctx.fillStyle = win ? 'rgba(111,22,15,0.92)' : 'rgba(58,42,10,0.92)';
      const v = this.game.view;
      ctx.fillRect(-v.ox, 470, v.w, 74);
      ctx.fillStyle = win ? '#ff6a4d' : '#f5c542';
      ctx.fillRect(-v.ox, 470, v.w, 3);
      ctx.fillRect(-v.ox, 541, v.w, 3);
      outlinedText(ctx, `${w.species.name.toUpperCase()} WINS!`, WORLD_W / 2, 506, { family: 'Luckiest Guy', weight: 400, size: w.species.name.length > 12 ? 20 : 26, color: '#ffffff', stroke: '#24100c', lw: 5, align: 'center' });
      outlinedText(ctx, `${w.trainer.name.toUpperCase()} IS VICTORIOUS`, WORLD_W / 2, 530, { family: 'Luckiest Guy', weight: 400, size: 11, color: '#ffd84a', stroke: '#24100c', lw: 3, align: 'center' });
      ctx.restore();
    }
    outlinedText(ctx, this.game.arena.theme.name.toUpperCase(), WORLD_W / 2, 120, { size: 10, align: 'center', color: '#ffd84a', lw: 3 });
    outlinedText(ctx, 'PRESS ENTER TO SKIP', WORLD_W / 2, WORLD_H - 12, { size: 6, align: 'center', color: '#c9d2de', lw: 2 });
  }
}
