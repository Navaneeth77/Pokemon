import { Arena, WORLD_W, WORLD_H } from './arena.js';
import { Pokemon } from './pokemon.js';
import { Trainer } from './trainer.js';
import { Team } from './team.js';
import { SPECIES, PLAYER_TEAM, OPPONENT_TEAM } from './data/species.js';
import { MOVES } from './moves.js';
import { OpponentAI } from './ai.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import {
  ParticleSystem, DamageNumber, FloatText, FIRE, rand, dustCloud, sendOutBurst,
  ThrownBall, MegaAura, RainbowStreak, MegaEmblem, rainbowBurst, BeamLine, WindStreaks,
} from './effects.js';
import { initAudio, sfx } from './audio.js';

export const SWITCH_COOLDOWN = 15;
const PANEL_W = 318;
const HOME = { player: { x: 180, y: 500, dir: 4 }, opponent: { x: 180, y: 215, dir: 0 } };
const ease = t => 1 - (1 - t) * (1 - t);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Game {
  constructor(canvas, sprites, ui) {
    this.canvas = canvas;
    // Opaque: the arena always covers the canvas, so the browser can skip blending it with the page.
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ui = ui;
    this.sprites = sprites;
    this.arena = new Arena();
    this.marks = this.arena.marks;
    this.particles = new ParticleSystem();
    this.hud = new Hud(this);
    this.red = new Trainer('red', 'Red', 180, 598);
    this.gold = new Trainer('gold', 'Gold', 180, 104);
    const team = (ids, side, trainer) => new Team(side, trainer, ids.map(id => new Pokemon(SPECIES[id], sprites[SPECIES[id].sprite], side)));
    this.playerTeam = team(PLAYER_TEAM, 'player', this.red);
    this.opponentTeam = team(OPPONENT_TEAM, 'opponent', this.gold);
    for (const m of this.opponentTeam.members) m.faceFoeWhileMoving = true;
    this.ai = new OpponentAI();
    this.input = new Input(this);
    this.lead = 0;
    this.reset();
    this.state = 'select';
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get player() { return this.playerTeam.active; }
  get opponent() { return this.opponentTeam.active; }

  // Mega Rayquaza's Delta Stream: strong winds while it is out on the field.
  get deltaStream() {
    return [this.player, this.opponent].some(m => m.species.ability === 'deltaStream' && m.alive && !m.hidden);
  }

  teamOf(mon) {
    return mon.side === 'player' ? this.playerTeam : this.opponentTeam;
  }

  link() {
    this.player.foe = this.opponent;
    this.opponent.foe = this.player;
  }

  reset() {
    this.time = 0;
    this.effects = [];
    this.timers = [];
    this.particles.clear();
    this.arena.reset();
    this.playerTeam.reset(this.lead, HOME.player);
    this.opponentTeam.reset(0, HOME.opponent);
    this.link();
    this.red.reset();
    this.gold.reset();
    this.ai.reset();
    this.hud.reset();
    this.input.clear();
    Object.assign(this, {
      hitstopT: 0, lastHitstop: -1, shakeT: 0, shakeDur: 1, shakeMag: 0, slowT: 0, flashT: 0, endT: 0,
      winner: null, buffered: null, megaQueued: 0, cinematic: null, switchCD: 0, switching: false,
      switchMenu: false, windsOn: false, winds: null, punchT: 0, punchDur: 1, punchAmt: 0, punchAt: null,
    });
    this.ui.showSwitchMenu(false);
  }

  // Team selection screen; the lead chosen there is used by start().
  toSelect() {
    this.reset();
    this.state = 'select';
    this.ui.showSelect(this.lead);
  }

  later(delay, fn) {
    this.timers.push({ t: delay, fn });
  }

  start() {
    initAudio();
    document.activeElement?.blur?.();
    this.reset();
    this.state = 'intro';
    this.ui.onStart();
    this.ui.setActive(this.player);
    this.sendOut(this.opponent, 0.1, `Gold sent out ${this.opponent.species.name}!`);
    this.sendOut(this.player, 0.5, `Go, ${this.player.species.name}!`);
    this.later(1.45, () => {
      this.state = 'fighting';
      this.hud.showBanner('BATTLE START!', { color: '#ff7a2f', y: 330, life: 1.1 });
    });
  }

  sendOut(mon, delay, line, onOut) {
    const tr = mon.trainer;
    this.later(delay, () => {
      tr.setPose('raise', 0.3);
      this.ui.log(line, mon.side);
    });
    this.later(delay + 0.3, () => {
      tr.setPose('throw', 0.4);
      const h = tr.hand();
      sfx.whoosh();
      this.spawn(new ThrownBall(h.x, h.y, h.z, mon.x, mon.y, 0.5, () => {
        this.release(mon);
        onOut?.();
      }));
    });
  }

  release(mon) {
    mon.hidden = false;
    mon.appear = 1;
    sendOutBurst(this, mon.x, mon.y, mon.species.bodyZ);
    const player = mon.side === 'player';
    this.spawn(new FloatText(mon.x, mon.y + (player ? 26 : 18), `Go, ${mon.species.name}!`, player ? '#ff8a3d' : '#f5c542', 8, 1.5));
    this.hud.flashPanel(mon.side);
    sfx.sendOut();
  }

  // Red recall beam: the Pokémon turns red and shrinks back into its ball.
  recall(mon, done) {
    mon.cancelAction();
    mon.recallT = 0.0001;
    mon.input.x = mon.input.y = 0;
    const tr = mon.trainer, h = tr.hand();
    tr.setPose('point', 0.5);
    this.spawn(new BeamLine(h.x, h.y - h.z, mon.x, mon.y - mon.bodyZ, 0.4, '#ff5a4a', 3));
    sfx.recall();
    this.later(0.42, () => {
      mon.hidden = true;
      mon.recallT = 0;
      done();
    });
  }

  // Manual switches share one team cooldown (the first is free). Forced replacements after a
  // faint ignore the cooldown so the battle can never get stuck.
  switchTo(index, forced = false) {
    const team = this.playerTeam, cur = team.active, next = team.members[index];
    if (this.state !== 'fighting' || !next || !next.alive || next === cur) return false;
    if (!forced && (this.switching || this.cinematic || this.switchCD > 0 || cur.recallT > 0)) return false;
    if (!forced) this.switchCD = SWITCH_COOLDOWN;
    this.toggleSwitchMenu(false);
    this.switching = true;
    this.buffered = null;
    this.megaQueued = 0;
    const spot = cur.alive && !cur.hidden ? { x: cur.x, y: cur.y } : HOME.player;
    const bringIn = () => {
      team.index = index;
      next.enter(spot.x, spot.y, HOME.player.dir);
      this.link();
      this.ui.setActive(next);
      this.sendOut(next, 0.05, `Go, ${next.species.name}!`, () => (this.switching = false));
    };
    if (cur.alive && !cur.hidden) {
      this.ui.log(`Come back, ${cur.species.name}!`, 'player');
      this.recall(cur, bringIn);
    } else bringIn();
    return true;
  }

  // Q opens a picker of teammates; the battle keeps running while it is open.
  toggleSwitchMenu(open = !this.switchMenu) {
    if (open && this.state !== 'fighting') return;
    this.switchMenu = open;
    this.ui.showSwitchMenu(open);
  }

  pickSwitch(index) {
    if (!this.switchTo(index)) this.denied();
  }

  replaceOpponent(index) {
    const team = this.opponentTeam;
    team.index = index;
    const mon = team.active;
    mon.enter(HOME.opponent.x, HOME.opponent.y, HOME.opponent.dir);
    this.link();
    this.ai.reset();
    this.hud.showBanner(`GOLD SENDS OUT ${mon.species.name.toUpperCase()}!`, { color: '#f5c542', y: 300, life: 1.6, size: 19 });
    this.sendOut(mon, 0.25, `Gold sent out ${mon.species.name}!`);
  }

  denied() {
    sfx.denied();
  }

  useMove(user, id) {
    if (this.state !== 'fighting' || this.cinematic || !user.canAct() || user.cooldown(id) > 0) return false;
    const move = MOVES[id];
    user.cooldowns[id] = move.cooldown;
    user.action = new move.Action(move, user, this);
    this.hud.callout(user.side, `${move.name}!`);
    this.ui.log(`${user.species.name} used ${move.name}!`, user.side);
    return true;
  }

  playerMove(i) {
    if (this.state !== 'fighting') return;
    initAudio();
    const id = this.player.species.moves[i];
    if (!id) return;
    const ok = this.useMove(this.player, id);
    // Presses during the last moments of a recovery are buffered instead of dropped.
    if (!ok && this.player.alive && !this.switching && this.player.cooldown(id) <= 0.25) this.buffered = { i, t: 0.3 };
    else if (!ok) sfx.denied();
    this.ui.pressed(i, ok);
  }

  playerMega() {
    if (this.state !== 'fighting') return;
    initAudio();
    // Pressed mid-attack: wait for the attack to finish instead of ignoring the press.
    if (!this.megaEvolve(this.player) && this.player.species.mega && !this.playerTeam.megaUsed) this.megaQueued = 0.8;
  }

  // One Mega Evolution per trainer per battle. The battle pauses briefly while the camera zooms in.
  megaEvolve(mon) {
    const team = this.teamOf(mon);
    if (this.state !== 'fighting' || this.cinematic || this.switching || team.megaUsed || !mon.species.mega || !mon.canAct()) return false;
    const tr = mon.trainer;
    team.megaUsed = true;
    this.cinematic = { mon, t: 0, swapped: false };
    tr.setPose('point', 1.7);
    const h = tr.hand();
    this.spawn(new RainbowStreak(h.x, h.y - h.z, mon.x, mon.y - mon.bodyZ, 0.7));
    this.spawn(new MegaAura(mon, 1.1));
    this.hud.callout(mon.side, 'Mega Evolution!');
    this.ui.log(`${tr.name}'s Mega Ring is reacting!`, mon.side);
    sfx.megaCharge();
    return true;
  }

  updateCinematic(dt) {
    const c = this.cinematic, m = c.mon;
    c.t += dt;
    if (!c.swapped) {
      m.appear = Math.min(1, c.t / 0.9);
      if (c.t > 0.2) {
        const a = rand(0, Math.PI * 2), r = rand(26, 36), life = 0.3, z = m.bodyZ;
        const x = m.x + Math.cos(a) * r, y = m.y + Math.sin(a) * r * 0.6;
        const hue = Math.floor(rand(0, 360));
        this.particles.spawn({
          x, y, z: z + rand(-10, 10), vx: (m.x - x) / life, vy: (m.y - y) / life, life, size: 3, sizeEnd: 1,
          colors: [`hsl(${hue}, 100%, 80%)`], fade: false,
        });
      }
      if (c.t >= 0.95) {
        c.swapped = true;
        const baseName = m.species.name;
        const mega = SPECIES[m.species.mega];
        m.megaEvolve(mega, this.sprites[mega.sprite]);
        m.appear = 1;
        rainbowBurst(this, m.x, m.y, m.bodyZ);
        this.spawn(new MegaEmblem(m.x, m.y - m.headZ - 12, 1.3));
        this.shake(5, 0.35);
        sfx.megaBurst();
        this.ui.log(`${baseName} has Mega Evolved into ${mega.name}!`, m.side);
      }
    } else {
      m.appear = Math.max(0, m.appear - dt * 2);
    }
    if (c.t >= 1.75) {
      m.appear = 0;
      this.cinematic = null;
    }
  }

  spawn(effect) {
    this.effects.push(effect);
    return effect;
  }

  shake(mag, dur = 0.25) {
    if (this.shakeT <= 0 || mag >= this.shakeMag * (this.shakeT / this.shakeDur)) {
      this.shakeMag = mag;
      this.shakeDur = dur;
      this.shakeT = dur;
    }
  }

  // Brief impact freezes, capped and spaced out so rapid hits never feel like stutter.
  hitstop(t) {
    if (this.time - this.lastHitstop < 0.35) return;
    this.lastHitstop = this.time;
    this.hitstopT = Math.max(this.hitstopT, Math.min(t, 0.07));
  }

  flash(t) {
    this.flashT = Math.max(this.flashT, t);
  }

  // Quick camera push-in on a big impact.
  punch(x, y, amount, dur) {
    Object.assign(this, { punchT: dur, punchDur: dur, punchAmt: amount, punchAt: { x, y } });
  }

  // Footstep dust for walkers, wing-beat gusts kicking up snow under flyers.
  groundDust(mon) {
    const fly = !!mon.species.fly;
    for (let i = 0; i < (fly ? 2 : 1); i++) {
      const a = (i ? 0 : Math.PI) + rand(-0.4, 0.4);
      this.particles.spawn({
        x: mon.x + rand(-3, 3), y: mon.y + 1, z: 1,
        vx: fly ? Math.cos(a) * rand(18, 30) : -mon.lastMove.x * 12 + rand(-6, 6),
        vy: fly ? Math.sin(a) * 8 + rand(-4, 4) : -mon.lastMove.y * 12 + rand(-4, 4),
        vz: rand(3, 8), life: fly ? 0.55 : 0.45, size: 3, sizeEnd: 7,
        colors: ['#eef1f5', '#d4dae2'], alpha: fly ? 0.6 : 0.8, round: true, layer: 'ground',
      });
    }
  }

  auraWisp(mon) {
    this.particles.spawn({
      x: mon.x + rand(-mon.radius, mon.radius), y: mon.y + rand(-3, 3), z: mon.z + rand(2, mon.species.headZ),
      vx: rand(-6, 6), vz: rand(14, 30), life: 0.6, size: rand(2, 3), sizeEnd: 1, colors: mon.species.aura, alpha: 0.85,
    });
  }

  burnDamage(mon) {
    if (this.state !== 'fighting') return;
    const dmg = Math.max(1, Math.round(mon.maxHp * 0.02));
    mon.hp = Math.max(0, mon.hp - dmg);
    mon.trailDelay = 0.45;
    mon.flash = 0.6;
    mon.flashColor = '#ff8a3d';
    this.spawn(new DamageNumber(mon.x, mon.y - mon.headZ, dmg, { color: '#ff9a5a', size: 12 }));
    for (let i = 0; i < 8; i++) {
      this.particles.spawn({
        x: mon.x + rand(-mon.radius, mon.radius), y: mon.y, z: rand(4, mon.headZ), vz: rand(20, 40),
        life: 0.5, size: rand(3, 5), sizeEnd: 1, colors: FIRE,
      });
    }
    if (!mon.alive) this.onFaint(mon, mon.foe);
  }

  // A fainted Pokémon is replaced automatically by its trainer's next healthy one; the battle ends
  // only when a whole team is down.
  onFaint(mon, by) {
    mon.faint();
    dustCloud(this, mon.x, mon.y, 16, 5);
    this.ui.log(`${mon.species.name} fainted!`, mon.side);
    this.hitstop(0.12);
    this.shake(6, 0.4);
    sfx.faint();
    if (this.state !== 'fighting') return;
    const team = this.teamOf(mon), next = team.nextAlive();
    if (next < 0) {
      this.state = 'ending';
      this.endT = 0;
      this.winner = by.side;
      this.slowT = 0.7;
      return;
    }
    this.later(1.7, () => {
      if (this.state !== 'fighting' || team.active !== mon) return;
      if (team === this.playerTeam) this.switchTo(next, true);
      else this.replaceOpponent(next);
    });
  }

  updateEffects(dt, cosmeticOnly = false) {
    const list = this.effects;
    this.effects = [];
    for (const e of list) {
      if (cosmeticOnly && e.isProjectile) this.effects.push(e);
      else if (e.update(dt) !== false) this.effects.push(e);
    }
  }

  update(dt) {
    if (this.hitstopT > 0) {
      this.hitstopT -= dt;
      this.shakeT -= dt;
      return;
    }
    if (this.slowT > 0) {
      this.slowT -= dt;
      dt *= 0.35;
    }
    this.flashT = Math.max(0, this.flashT - dt);
    this.red.update(dt);
    this.gold.update(dt);

    if (this.cinematic) {
      this.updateCinematic(dt);
      this.player.animate(dt);
      this.opponent.animate(dt);
      this.updateEffects(dt, true);
      this.particles.update(dt);
      this.arena.update(dt);
      this.hud.update(dt);
      this.shakeT -= dt;
      this.ui.update(this, dt);
      return;
    }

    if (this.timers.length) {
      for (const tm of this.timers) tm.t -= dt;
      const due = this.timers.filter(tm => tm.t <= 0);
      this.timers = this.timers.filter(tm => tm.t > 0);
      for (const tm of due) tm.fn();
    }

    const p = this.player;
    if (this.state === 'fighting') {
      this.time += dt;
      this.switchCD = Math.max(0, this.switchCD - dt);
      const v = this.input.vector();
      p.input.x = v.x;
      p.input.y = v.y;
      if (this.megaQueued > 0) {
        this.megaQueued -= dt;
        if (this.megaEvolve(p)) this.megaQueued = 0;
      }
      if (this.buffered) {
        this.buffered.t -= dt;
        const id = p.species.moves[this.buffered.i];
        if (this.useMove(p, id)) {
          this.ui.pressed(this.buffered.i, true);
          this.buffered = null;
        } else if (this.buffered.t <= 0) this.buffered = null;
      }
    } else {
      p.input.x = p.input.y = 0;
    }

    this.ai.update(dt, this);
    p.update(dt, this);
    this.opponent.update(dt, this);
    this.separate();
    this.updateEffects(dt);
    this.particles.update(dt);
    this.arena.update(dt);
    this.hud.update(dt);
    this.updateWinds();
    if (this.switchMenu && this.state !== 'fighting') this.toggleSwitchMenu(false);

    if (this.state === 'ending') {
      this.endT += dt;
      if (this.endT > 1.9) {
        this.state = 'over';
        const win = this.winner === 'player';
        (win ? this.red : this.gold).setPose('point');
        this.hud.showBanner(win ? 'RED WINS!' : 'GOLD WINS!', { sub: win ? 'VICTORY' : 'DEFEAT', band: true, y: 250 });
        this.ui.showResult(win);
        if (win) sfx.victory();
        else sfx.defeat();
      }
    }
    this.shakeT -= dt;
    this.punchT = Math.max(0, this.punchT - dt);
    this.ui.update(this, dt);
  }

  updateWinds() {
    const on = this.deltaStream;
    if (on === this.windsOn) return;
    this.windsOn = on;
    if (on) {
      this.winds = this.spawn(new WindStreaks());
      this.ui.log('Mysterious strong winds are protecting Flying-type Pokémon!');
      this.hud.showBanner('DELTA STREAM', { color: '#bff3ff', y: 300, life: 1.4, size: 24 });
      sfx.wind(1.2);
    } else {
      if (this.winds) this.winds.dead = true;
      this.ui.log('The mysterious strong winds have dissipated!');
    }
  }

  separate() {
    const a = this.player, b = this.opponent;
    if (a.fainted || b.fainted || a.hidden || b.hidden || a.phasing || b.phasing) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.01;
    const overlap = a.radius + b.radius - d;
    if (overlap <= 0) return;
    const wa = b.species.weight / (a.species.weight + b.species.weight);
    a.x -= (dx / d) * overlap * wa;
    a.y -= (dy / d) * overlap * wa;
    b.x += (dx / d) * overlap * (1 - wa);
    b.y += (dy / d) * overlap * (1 - wa);
    a.clamp();
    b.clamp();
  }

  // Camera: normally the whole arena; during Mega Evolution it zooms onto the evolving Pokémon.
  camera() {
    const c = this.cinematic;
    if (!c && this.punchT > 0 && this.punchAt) {
      const e = Math.sin(Math.PI * (1 - this.punchT / this.punchDur)), zoom = 1 + this.punchAmt * e;
      const halfW = WORLD_W / (2 * zoom), halfH = WORLD_H / (2 * zoom);
      return {
        zoom,
        cx: clamp(WORLD_W / 2 + (this.punchAt.x - WORLD_W / 2) * e, halfW, WORLD_W - halfW),
        cy: clamp(WORLD_H / 2 + (this.punchAt.y - WORLD_H / 2) * e, halfH, WORLD_H - halfH),
        dim: 0,
      };
    }
    if (!c) return { zoom: 1, cx: WORLD_W / 2, cy: WORLD_H / 2, dim: 0 };
    const e = c.t < 0.3 ? ease(c.t / 0.3) : c.t > 1.45 ? ease(Math.max(0, 1 - (c.t - 1.45) / 0.3)) : 1;
    const zoom = 1 + 0.6 * e;
    const halfW = WORLD_W / (2 * zoom), halfH = WORLD_H / (2 * zoom);
    return {
      zoom,
      cx: clamp(WORLD_W / 2 + (c.mon.x - WORLD_W / 2) * e, halfW, WORLD_W - halfW),
      cy: clamp(WORLD_H / 2 + (c.mon.y - c.mon.bodyZ - WORLD_H / 2) * e, halfH, WORLD_H - halfH),
      dim: 0.45 * e,
    };
  }

  render() {
    const { ctx, k } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#bcc4cf';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      const m = this.shakeMag * (this.shakeT / this.shakeDur);
      sx = (Math.random() * 2 - 1) * m;
      sy = (Math.random() * 2 - 1) * m;
    }
    const cam = this.camera();
    const s = k * cam.zoom;
    ctx.setTransform(s, 0, 0, s,
      Math.round((WORLD_W / 2 - cam.cx * cam.zoom + sx) * k),
      Math.round((WORLD_H / 2 - cam.cy * cam.zoom + sy) * k));
    this.arena.drawGround(ctx);
    if (cam.dim > 0) {
      ctx.fillStyle = `rgba(14,10,30,${cam.dim})`;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    for (const e of this.effects) if (e.layer === 'ground') e.draw(ctx);
    this.particles.draw(ctx, 'ground');
    const actors = [this.player, this.opponent, this.red, this.gold].sort((a, b) => a.y - b.y);
    for (const a of actors) a.drawShadow(ctx);
    for (const a of actors) a.draw(ctx);
    for (const e of this.effects) if (e.layer === 'air') e.draw(ctx);
    this.particles.draw(ctx, 'air');
    this.arena.drawSnow(ctx);
    for (const e of this.effects) if (e.layer === 'top') e.draw(ctx);
    if (this.flashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.7, this.flashT * 6)})`;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    ctx.setTransform(k, 0, 0, k, 0, 0);
    this.hud.draw(ctx);
  }

  resize() {
    const stage = this.canvas.parentElement;
    const wide = innerWidth >= 760;
    let h, w;
    if (wide) {
      h = innerHeight - 24;
      w = (h * 9) / 16;
      const maxW = innerWidth - 24 - PANEL_W;
      if (w > maxW) {
        w = maxW;
        h = (w * 16) / 9;
      }
    } else {
      w = Math.min(innerWidth - 24, 480);
      h = (w * 16) / 9;
    }
    stage.style.width = `${Math.floor(w)}px`;
    stage.style.height = `${Math.floor(h)}px`;
    // Capped: beyond 3× the extra pixels cost fill rate without visibly sharper pixel art.
    this.k = Math.max(1, Math.min(3, Math.round((h * (devicePixelRatio || 1)) / WORLD_H)));
    this.canvas.width = WORLD_W * this.k;
    this.canvas.height = WORLD_H * this.k;
  }

  run() {
    let last = performance.now();
    const frame = now => {
      // rAF timestamps can be slightly earlier than the performance.now() read before the first frame;
      // a negative step would run every timer backwards, so clamp it.
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      this.update(dt);
      this.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
