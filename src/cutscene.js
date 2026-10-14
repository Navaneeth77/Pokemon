import { AnimatedSprite, dirFromVector } from './sprite.js';
import { Trainer } from './trainer.js';
import { drawBust, frontPalette, backPalette } from './trainers.js';
import { SPECIES } from './data/species.js';
import { WORLD_W } from './arena.js';
import { addExtraAnims } from './assets.js';
import { music } from './music.js';
import { sfx } from './audio.js';
import { Ring, Glow, Pillar, Lightning, ScreenDim, ThrownBall, PsyDome, dustCloud, sparkBurst, electricBurst, leafBurst, windBurst, waterSplash, iceShatter, sendOutBurst, FIRE } from './effects.js';

// Story cutscenes, staged on the game's own canvas and arenas with the game's existing sprites: trainers
// (your party seen from behind, everyone else facing the camera, as in battle) and the Pokémon sprite
// sheets with their own walk, attack, roar and reaction animations. The director moves and animates them,
// frames the shots (cuts, eased moves, zoom drawn at whole-pixel steps) and drives the effects library;
// dialogue, captions, close-up portraits and letterbox bars sit on top as an overlay. Scenes are step
// lists (data/echoes.js): dialogue, captions and cards wait for a tap / Enter, the rest plays alongside.
const $ = sel => document.querySelector(sel);
const ease = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rand = (a, b) => a + Math.random() * (b - a);
const PARTY = new Set(['player', 'kai', 'lyra']);
// Script positions (0–1 across the stage) → arena world positions.
const WX = x => Math.round(40 + x * (WORLD_W - 80));
const WY = y => Math.round(250 + y * 260);
const ROW_PARTY = 432, ROW_OTHER = 332;

// Location → arena theme plus lighting and weather.
const LOCATIONS = {
  storm: { arena: 'mtSilver', tint: 'rgba(8,12,28,0.62)', rain: true, lightning: true },
  hill: { arena: 'viridian' },
  plaza: { arena: 'indigo' },
  lighthouse: { arena: 'seafoam' },
  hall: { arena: 'indigo', tint: 'rgba(40,20,8,0.4)' },
  painting: { arena: 'indigo', tint: 'rgba(40,20,8,0.4)' },
  forest: { arena: 'viridian', tint: 'rgba(8,36,12,0.18)' },
  shrine: { arena: 'viridian', tint: 'rgba(8,30,20,0.28)' },
  snow: { arena: 'mtSilver' },
  archive: { arena: 'mtSilver', tint: 'rgba(8,18,40,0.5)' },
  city: { arena: 'indigo', tint: 'rgba(24,10,60,0.4)' },
  volcano: { arena: 'cinnabar' },
  ruins: { arena: 'cinnabar', tint: 'rgba(36,10,8,0.3)' },
  observatory: { arena: 'mtSilver', tint: 'rgba(8,6,40,0.6)' },
  fortress: { arena: 'indigo', tint: 'rgba(16,8,36,0.62)' },
  sanctum: { arena: 'indigo', tint: 'rgba(60,24,90,0.3)' },
  pillar: { arena: 'mtSilver', tint: 'rgba(10,40,24,0.4)' },
  airship: { arena: 'indigo', tint: 'rgba(8,16,24,0.45)', rain: true },
  cave: { arena: 'cinnabar', tint: 'rgba(4,4,18,0.78)' },
  dawn: { arena: 'viridian', tint: 'rgba(255,150,100,0.16)' },
  black: { arena: 'indigo', black: true },
};

class MonActor {
  constructor(game, species, x, y, z) {
    this.sp = SPECIES[species];
    this.sprite = new AnimatedSprite(game.sprites[this.sp.sprite]);
    Object.assign(this, { x, y, z, dir: 0, scale: 1, alpha: 1, flash: 0, flashColor: '#ffffff', silhouette: false, path: null, hold: null, bob: z > 0 ? 2 : 0, t: rand(0, 6) });
  }
  update(dt) {
    this.t += dt;
    if (this.path) {
      const p = this.path;
      p.t += dt;
      const k = Math.min(1, p.t / p.d), e = p.fly ? ease(k) : k;
      this.x = lerp(p.x0, p.x1, e);
      this.y = lerp(p.y0, p.y1, e);
      this.z = lerp(p.z0, p.z1, e);
      if (k >= 1) {
        this.path = null;
        if (!this.hold) this.sprite.play('Idle');
      }
    }
    if (this.fade) this.alpha = Math.max(0, Math.min(1, this.alpha + this.fade * dt));
    this.flash = Math.max(0, this.flash - dt * 3);
    this.sprite.update(dt);
    if (this.sprite.done && !this.path) {
      this.hold = null;
      this.sprite.play('Idle');
    }
  }
  lift() { return this.z + (this.bob ? Math.round(Math.sin(this.t * 2.2) * this.bob) : 0); }
  drawShadow(ctx) {
    if (this.alpha <= 0 || this.silhouette) return;
    const [rx, ry] = (this.sp.shadow ?? [10, 4]).map(v => v * this.scale), s = Math.max(0.35, 1 - this.lift() / 160);
    ctx.globalAlpha = 0.3 * this.alpha * s;
    ctx.fillStyle = '#1d2433';
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y) + 1, rx * s, ry * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  draw(ctx) {
    if (this.alpha <= 0) return;
    this.sprite.draw(ctx, this.x, this.y - this.lift(), this.dir, {
      alpha: this.alpha, scale: this.scale, flash: this.silhouette ? 1 : Math.min(0.9, this.flash), flashColor: this.silhouette ? '#05040c' : this.flashColor,
    });
  }
  top() { return this.y - this.lift() - (this.sp.headZ ?? 30) * this.scale - 6; }
}

class PersonActor {
  constructor(person, back, x, y) {
    this.tr = new Trainer(back ? 'red' : 'gold', person.name, x, y);
    if (person.look) this.tr.setPalette(back ? backPalette(person.look) : frontPalette(person.look));
    Object.assign(this, { x, y, back, alpha: 1, path: null, t: 0, hop: 0 });
  }
  update(dt) {
    this.t += dt;
    this.tr.update(dt);
    if (this.path) {
      const p = this.path;
      p.t += dt;
      const k = Math.min(1, p.t / p.d);
      this.x = lerp(p.x0, p.x1, k);
      this.y = lerp(p.y0, p.y1, k);
      if (k >= 1) this.path = null;
    }
    if (this.fade) this.alpha = Math.max(0, Math.min(1, this.alpha + this.fade * dt));
    this.hop = Math.max(0, this.hop - dt);
  }
  // A one-pixel step while walking, a little hop when reacting or speaking up.
  offset() { return (this.path ? Math.floor(this.t * 8) % 2 : 0) + (this.hop > 0 ? Math.round(Math.sin((this.hop / 0.3) * Math.PI) * 3) : 0); }
  drawShadow(ctx) {
    if (this.alpha <= 0) return;
    this.tr.x = Math.round(this.x);
    this.tr.y = Math.round(this.y);
    ctx.globalAlpha = this.alpha;
    this.tr.drawShadow(ctx);
    ctx.globalAlpha = 1;
  }
  draw(ctx) {
    if (this.alpha <= 0) return;
    this.tr.x = Math.round(this.x);
    this.tr.y = Math.round(this.y) - this.offset();
    ctx.globalAlpha = this.alpha;
    this.tr.draw(ctx);
    ctx.globalAlpha = 1;
  }
  top() { return this.y - 30 - this.offset(); }
}

export class Cutscene {
  constructor(game) {
    this.game = game;
    this.root = $('#cutscene');
    this.root.innerHTML = `<div class="cs-bar top"></div><div class="cs-bar bottom"></div><div class="cs-fade"></div>
      <div class="cs-close hidden"><img alt=""><b></b></div>
      <div class="cs-cap hidden"></div><div class="cs-card hidden"></div>
      <div class="cs-box hidden"><canvas class="cs-face" width="24" height="24"></canvas><div class="cs-body"><b class="cs-name"></b><p class="cs-text"></p></div><i class="cs-more">▼</i></div>
      <button class="cs-skip">SKIP ▶▶</button>`;
    this.box = this.root.querySelector('.cs-box');
    this.cap = this.root.querySelector('.cs-cap');
    this.card = this.root.querySelector('.cs-card');
    this.fadeEl = this.root.querySelector('.cs-fade');
    this.close = this.root.querySelector('.cs-close');
    this.root.addEventListener('pointerdown', e => {
      if (!e.target.closest('.cs-skip')) this.advance();
    });
    this.root.querySelector('.cs-skip').addEventListener('click', () => this.skip());
    window.addEventListener('keydown', e => {
      if (!this.playing) return;
      if (['Enter', 'Space'].includes(e.code)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.advance();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.skip();
      }
    }, true);
  }

  // Plays a scene on the game canvas; resolves when it ends (or is skipped).
  // ctx: { cast, vars, species, onJoin, onEvolve, onFlag, canEvolve }
  async play(scene, ctx) {
    const g = this.game;
    this.sx = ctx;
    this.actors = {};
    this.loc = LOCATIONS.black;
    this.cam = { x: WORLD_W / 2, y: 380, zoom: 1.5, tw: null, auto: true };
    this.fx = { tint: null, flash: 0, flashColor: '#ffffff', boltT: 2, shadow: null, rain: false, lightning: false };
    Object.assign(this, { skipping: false, aborted: false, playing: true, t: 0 });
    g.reset();
    g.state = 'cutscene';
    g.director = this;
    this.root.classList.remove('hidden');
    this.bars('thin');
    this.hideText();
    this.close.classList.add('hidden');
    this.fadeEl.style.opacity = '0';
    for (const step of scene.steps) {
      if (this.aborted) break;
      await this.run(step);
    }
    if (ctx.intoBattle && !this.aborted) await this.battleIntro();
    this.end();
  }

  // Into a battle, handheld style: two white flashes, then the letterbox closes.
  async battleIntro() {
    if (this.skipping) return;
    this.hideText();
    this.close.classList.add('hidden');
    sfx.megaCharge?.();
    for (let i = 0; i < 2; i++) {
      this.fx.flash = 1;
      this.fx.flashColor = '#ffffff';
      await this.wait(0.22);
    }
    this.bars('closed');
    await this.wait(0.7);
  }

  end() {
    this.playing = false;
    this.root.classList.add('hidden');
    this.hideText();
    this.close.classList.add('hidden');
    if (this.game.state === 'cutscene') this.game.state = 'menu';
    this.game.director = null;
  }

  // Leaving the story mid-scene: stop at once (the scene plays again from the start next time).
  stop() {
    this.aborted = true;
    this.skipping = true;
    this.waiter?.();
    this.end();
  }

  skip() {
    this.skipping = true;
    this.waiter?.();
  }

  advance() {
    if (this.typing) {
      this.typed = Infinity;
      return;
    }
    this.waiter?.();
  }

  hideText() {
    this.box.classList.add('hidden');
    this.cap.classList.add('hidden');
    this.card.className = 'cs-card hidden';
  }

  wait(secs) {
    if (this.skipping) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        this.waiter = null;
        resolve();
      };
      const timer = secs != null ? setTimeout(done, secs * 1000) : null;
      this.waiter = done;
    });
  }

  fill(text) {
    return String(text).replace(/\{(\w+)\}/g, (_, k) => this.sx.vars[k] ?? k);
  }
  species(id) { return this.sx.species[id] ?? id; }
  person(id) { return this.sx.cast[id] ?? { name: id, color: '#fff' }; }

  async run(step) {
    const [kind, ...a] = step;
    switch (kind) {
      case 'bg': return this.setLocation(a[0], a[1] ?? {});
      case 'music': music.play(a[0]); return;
      case 'sfx': sfx[a[0]]?.(); return;
      case 'in': return this.enter(a[0], a[1], a[2] ?? {});
      case 'out': return this.exit(a[0], a[1]);
      case 'move': return this.walk(a[0], a[1], a[2]);
      case 'pose': {
        const act = this.actors[a[0]];
        if (act instanceof PersonActor) act.tr.setPose(a[1], a[2] ?? 1.2);
        else this.animate(a[0], a[1]);
        return;
      }
      case 'emote': return this.emote(a[0], a[1]);
      case 'face': return;
      case 'say': return this.say(a[0], a[1]);
      case 'cap': return this.caption(a[0]);
      case 'title': return this.titleCard(a[0], a[1]);
      case 'reveal': return this.reveal(a[0], a[1]);
      case 'mon': return this.addMon(a[0], a[1], a[2], a[3], a[4] ?? {});
      case 'monMove': return this.flyTo(a[0], a[1], a[2], a[3]);
      case 'monAnim': return this.animate(a[0], a[1], a[2]);
      case 'monOff': {
        const m = this.actors[a[0]];
        if (m) m.fade = -2;
        return;
      }
      case 'fx': return this.effect(a[0], a[1] ?? {});
      case 'cam': return this.shot(a[0], a[1], a[2], a[3] ?? 1);
      case 'shot': return this.shot(a[0], a[1], a[2], a[3] ?? 0);
      case 'wait': return this.wait(a[0]);
      case 'fade': return this.fade(a[0], a[1] ?? 0.6);
      case 'bars': return this.bars(a[0]);
      case 'closeup': return this.closeup(a[0], a[1]);
      case 'join': return this.joinCard(a[0]);
      case 'evolve': return this.evolveCard(a[0], a[1]);
      case 'credits': return this.credits(a[0]);
      case 'flag': this.sx.onFlag?.(a[0]); return;
      case 'ace': return this.ace(a[0], a[1], a[2] ?? {});
      default: return;
    }
  }

  // ── Stage ──
  setLocation(name, opts) {
    const g = this.game, loc = LOCATIONS[name] ?? LOCATIONS.black;
    this.loc = loc;
    g.arena.setTheme(loc.arena);
    g.effects = [];
    g.particles.clear();
    this.actors = {};
    this.cam.auto = true;
    this.fx.tint = opts.night ? 'rgba(8,10,40,0.55)' : opts.emerald ? 'rgba(20,90,50,0.42)' : loc.tint;
    this.fx.rain = !!loc.rain || !!opts.rain;
    this.fx.lightning = !!loc.lightning;
    const cx = WORLD_W / 2;
    if (opts.crystal || opts.glow) g.spawn(new Glow(cx, ROW_OTHER - 20, 10, 22, [110, 240, 170], 9999));
    if (opts.mural) this.ringOfPillars(cx, ROW_OTHER - 30);
  }

  ringOfPillars(cx, cy) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.game.spawn(new Pillar(cx + Math.cos(a) * 70, cy + Math.sin(a) * 34, 9999, [110, 240, 170], 120));
    }
  }

  enter(id, x, o) {
    const p = this.person(id), back = PARTY.has(id) && !o.front, y = (back ? ROW_PARTY : ROW_OTHER) + (o.dy ?? 0);
    const tx = WX(x);
    let act = this.actors[id];
    if (!act) {
      const from = o.from === 'left' ? -40 : o.from === 'right' ? WORLD_W + 40 : tx;
      act = this.actors[id] = new PersonActor(p, back, from, y);
      if (!o.from) act.alpha = 0;
    }
    act.fade = act.alpha < 1 ? 3 : 0;
    if (Math.abs(act.x - tx) > 1) act.path = { x0: act.x, y0: act.y, x1: tx, y1: y, t: 0, d: Math.max(0.3, Math.abs(act.x - tx) / 110) };
  }

  exit(id, to) {
    const act = this.actors[id];
    if (!act) return;
    if (to === 'left' || to === 'right') {
      const x1 = to === 'left' ? -50 : WORLD_W + 50;
      act.path = { x0: act.x, y0: act.y, z0: act.z ?? 0, x1, y1: act.y, z1: act.z ?? 0, t: 0, d: Math.abs(act.x - x1) / 120 };
      if (act instanceof MonActor) {
        act.dir = dirFromVector(x1 - act.x, 0);
        if (!act.z) act.sprite.play('Walk');
      }
      setTimeout(() => this.actors[id] === act && delete this.actors[id], (act.path.d + 0.1) * 1000);
    } else {
      act.fade = -3;
      setTimeout(() => this.actors[id] === act && delete this.actors[id], 400);
    }
  }

  walk(id, x, dur) {
    const act = this.actors[id];
    if (!act) return;
    const tx = WX(x);
    act.path = { x0: act.x, y0: act.y, x1: tx, y1: act.y, z0: act.z ?? 0, z1: act.z ?? 0, t: 0, d: dur ?? Math.max(0.3, Math.abs(act.x - tx) / 110) };
    if (act instanceof MonActor) {
      act.dir = dirFromVector(tx - act.x, 0);
      act.sprite.play('Walk');
    }
  }

  // Script coordinates for Pokémon: y below 0.7 means airborne (higher up = further off the ground).
  monPos(x, y) {
    const air = y < 0.7;
    return { x: WX(x), y: air ? 372 : Math.round(392 + (y - 0.82) * 100), z: air ? Math.round((0.72 - y) * 190) : 0 };
  }

  addMon(key, species, x, y, o) {
    const id = this.species(species), sp = SPECIES[id];
    if (!sp || !this.game.sprites[sp.sprite]) return;
    const p = this.monPos(x, y), m = new MonActor(this.game, id, p.x, p.y, p.z);
    m.dir = { front: 0, right: 2, left: 6, back: 4 }[o.dir ?? 'front'] ?? 0;
    m.silhouette = !!o.shadow;
    m.scale = Math.max(1, Math.round(o.scale ?? 1)); // whole multiples only
    if (o.fade) {
      m.alpha = 0;
      m.fade = 2;
    }
    this.actors[key] = m;
    if (o.from) {
      const f = this.monPos(o.from[0], o.from[1]);
      Object.assign(m, { x: f.x, y: f.y, z: f.z });
      const fly = p.z > 0 || f.z > 0;
      m.path = { x0: f.x, y0: f.y, z0: f.z, x1: p.x, y1: p.y, z1: p.z, t: 0, d: o.dur ?? 1.2, fly };
      m.dir = dirFromVector(p.x - f.x, p.y - f.y + (f.z - p.z) * 0.3);
      m.sprite.play(fly ? 'Idle' : 'Walk');
    }
    if (o.glow) this.game.spawn(new Glow(p.x, p.y, p.z + (sp.bodyZ ?? 16), 30, [110, 240, 170], 9999));
    if (o.roar || o.impact) this.impact(m, o.impact);
  }

  // A trainer throws a Poké Ball and their ace bursts out in front of them, with a type-themed flourish.
  ace(who, species, o) {
    const tr = this.actors[who], g = this.game, id = this.species(species);
    if (!tr || !SPECIES[id]) return;
    tr.tr.setPose('throw', 0.6);
    const x = Math.round(tr.x + (o.dx ?? (tr.x > WORLD_W / 2 ? -42 : 42))), y = Math.round(tr.y + (o.dy ?? 34));
    const land = () => {
      sendOutBurst(g, x, y, 16);
      this.placeMon(o.key ?? 'ace', id, x, y, 0, { impact: true, dir: o.dir ?? 'front' });
      const z = 16;
      ({
        water: () => waterSplash(g, x, y), leaf: () => leafBurst(g, x, y, z, 18), ice: () => iceShatter(g, x, y, z), zap: () => electricBurst(g, x, y, z, 22),
        fire: () => { for (let i = 0; i < 22; i++) g.particles.spawn({ x, y, z, vx: rand(-80, 80), vy: rand(-40, 40), vz: rand(30, 120), life: 0.7, size: rand(3, 6), sizeEnd: 1, colors: FIRE }); },
        psychic: () => g.spawn(new PsyDome(x, y, 70, 1.2)), dark: () => { g.spawn(new ScreenDim(1.2, 0.55, '20,8,36')); this.fx.flash = 0.5; this.fx.flashColor = '#7a4aa0'; },
        dragon: () => { windBurst(g, x, y, z, 26, ['#ffffff', '#c8b0ff']); g.spawn(new Ring(x, y, { r0: 8, r1: 110, life: 0.6, color: '#b080ff', width: 4 })); },
      })[o.fx]?.();
    };
    if (this.skipping) return land();
    return new Promise(resolve => g.spawn(new ThrownBall(tr.x - 6, tr.y, 22, x, y, 0.5, () => {
      land();
      setTimeout(resolve, 650);
    })));
  }

  placeMon(key, id, x, y, z, o = {}) {
    const m = new MonActor(this.game, id, x, y, z);
    m.dir = { front: 0, right: 2, left: 6, back: 4 }[o.dir ?? 'front'] ?? 0;
    this.actors[key] = m;
    if (o.impact) this.impact(m, o.big);
    return m;
  }

  // A dramatic arrival: white flash, dust and a shockwave, the ground shakes, and it roars.
  impact(m, big) {
    const g = this.game;
    m.flash = 1;
    m.flashColor = '#ffffff';
    if (m.z <= 2) {
      dustCloud(g, m.x, m.y, big ? 18 : 10, big ? 6 : 4);
      g.spawn(new Ring(m.x, m.y, { r0: 6, r1: big ? 90 : 50, life: 0.5, color: '#ffffff', width: 3 }));
    }
    g.shake(big ? 7 : 4, big ? 0.5 : 0.3);
    this.animate(null, null, false, m);
  }

  animate(key, anim, loop, actor) {
    const m = actor ?? this.actors[key];
    if (!(m instanceof MonActor)) return;
    const name = anim ?? ['Roar', 'RearUp', 'Pose', 'Attack'].find(n => m.sprite.has(n)) ?? 'Idle';
    m.sprite.play(name, { loop: !!loop, force: true });
    m.hold = name;
    if (name === 'Roar' || (!anim && !loop)) sfx.roar();
  }

  flyTo(key, x, y, dur) {
    const m = this.actors[key];
    if (!(m instanceof MonActor)) return;
    const p = y == null ? { x: WX(x), y: m.y, z: m.z } : this.monPos(x, y);
    m.path = { x0: m.x, y0: m.y, z0: m.z, x1: p.x, y1: p.y, z1: p.z, t: 0, d: dur ?? 1, fly: true };
    if (Math.abs(p.x - m.x) + Math.abs(p.y - m.y) > 4) m.dir = dirFromVector(p.x - m.x, p.y - m.y);
    if (m.z <= 0 && p.z <= 0) m.sprite.play('Walk');
  }

  emote(id, e) {
    const a = this.actors[id];
    if (!a) return;
    a.emote = e;
    a.emoteT = 1.6;
    if (a instanceof PersonActor && (e === '!' || e === '♪' || e === '💢')) a.hop = 0.3;
    if (a instanceof MonActor) {
      const pick = (...n) => n.find(x => a.sprite.has(x)) ?? 'Idle';
      this.animate(null, e === '!' ? pick('Cringe', 'Hop') : e === '♪' ? pick('Hop', 'Pose') : e === '…' ? pick('Nod', 'Idle') : e === '?' ? pick('LookUp', 'Idle') : 'Idle', false, a);
    }
  }

  // Camera: dur 0 is a cut, otherwise an eased move. Zoom is drawn at whole-pixel steps by the game.
  shot(zoom, x = 0.5, y = 0.5, dur = 0) {
    this.cam.auto = zoom == null;
    if (zoom == null) return;
    const to = { zoom, x: WX(x), y: WY(y) };
    if (!dur || this.skipping) Object.assign(this.cam, to, { tw: null });
    else this.cam.tw = { from: { zoom: this.cam.zoom, x: this.cam.x, y: this.cam.y }, to, t: 0, d: dur };
  }

  // Frame everyone on stage (the default medium shot).
  autoFrame() {
    const list = Object.values(this.actors).filter(a => a.alpha > 0.05 && a.x > -10 && a.x < WORLD_W + 10);
    if (!list.length) return { x: WORLD_W / 2, y: 380, zoom: 1.5 };
    const xs = list.map(a => a.x), ys = list.map(a => a.y - (a.lift?.() ?? 0));
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys) - 40, maxY = Math.max(...ys) + 10;
    const v = this.game.view, zoom = Math.max(1.2, Math.min(2.4, Math.min(v.w / (maxX - minX + 180), v.h / (maxY - minY + 170))));
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 + 10, zoom };
  }

  effect(kind, o) {
    const g = this.game, f = this.fx, x = WX(o.x ?? 0.5), y = o.y != null ? WY(o.y) : 360;
    if (kind === 'storm') f.rain = !o.off;
    else if (kind === 'emerald' || kind === 'flash') {
      f.flash = Math.min(1, o.power ?? 1);
      f.flashColor = kind === 'emerald' ? '#6af0a0' : o.color ?? '#ffffff';
      if ((o.power ?? 1) >= 0.6) sfx.megaBurst?.();
    } else if (kind === 'tint') f.tint = o.off ? null : o.color ?? 'rgba(20,90,50,0.35)';
    else if (kind === 'shake') {
      g.shake(o.power ?? 5, 0.4);
      sfx.quake?.();
    } else if (kind === 'pulse') {
      for (let i = 0; i < (o.n ?? 3); i++) setTimeout(() => this.playing && g.spawn(new Ring(x, y, { r0: 6, r1: 120, life: 0.7, color: o.color ?? '#6af0a0', width: 3 })), i * 160);
      sfx.zap?.(0.4);
    } else if (kind === 'beam') g.spawn(new Pillar(x, ROW_OTHER + 20, o.dur ?? 3, [110, 240, 170], 300));
    else if (kind === 'bolt') this.bolt(x);
    else if (kind === 'burst') sparkBurst(g, x, y, 20, true);
    else if (kind === 'sparkle') for (let i = 0; i < 3; i++) g.spawn(new Glow(x + rand(-60, 60), y + rand(-20, 20), rand(10, 40), 10, [255, 255, 255], 0.8));
    else if (kind === 'leaves') leafBurst(g, x, y, 20, 14);
    else if (kind === 'wind') windBurst(g, x, y, 20);
    else if (kind === 'zap') electricBurst(g, x, y, 20, 18);
    else if (kind === 'dim') g.spawn(new ScreenDim(o.dur ?? 2, o.alpha ?? 0.5));
    else if (kind === 'clear') Object.assign(f, { rain: false, tint: null, lightning: false });
    else if (kind === 'shadowPass') f.shadow = { x0: WX(o.from ?? -0.4), x1: WX(o.to ?? 1.4), y: y + 40, t: 0, d: o.dur ?? 2.4, r: o.r ?? 70 };
    else if (kind === 'pillars') this.ringOfPillars(x, y);
  }

  bolt(x) {
    const g = this.game, gy = ROW_OTHER + rand(-40, 60);
    g.spawn(new Lightning(x + rand(-20, 20), 120, x, gy, 0.35, { width: 3, branches: 4, glow: 'rgba(200,230,255,0.6)' }));
    this.fx.flash = 0.7;
    this.fx.flashColor = '#e8f0ff';
    g.shake(3, 0.2);
    sfx.zap?.(0.3);
  }

  bars(mode) {
    const h = mode === 'wide' ? '13vh' : mode === 'off' ? '0px' : mode === 'closed' ? '51vh' : '6vh';
    for (const b of this.root.querySelectorAll('.cs-bar')) b.style.height = h;
  }

  // A framed close-up: a Pokémon's own expression portrait, or a character's bust.
  closeup(who, emotion) {
    if (!who) {
      this.close.classList.add('hidden');
      return;
    }
    const img = this.close.querySelector('img'), id = this.species(who), sp = SPECIES[id];
    if (sp) {
      img.onerror = () => { img.onerror = null; img.src = `/sprites/${sp.sprite}/portrait.png`; };
      img.src = `/sprites/${sp.sprite}/portrait${emotion ? `-${emotion}` : ''}.png`;
      this.close.querySelector('b').textContent = sp.name;
    } else {
      const p = this.person(who);
      img.onerror = null;
      img.src = p.look ? drawBust(p.look).toDataURL() : '';
      this.close.querySelector('b').textContent = this.fill(p.name);
    }
    this.close.classList.remove('hidden', 'show');
    void this.close.offsetWidth;
    this.close.classList.add('show');
  }

  async say(id, text) {
    const p = id === 'n' ? null : this.person(id);
    this.cap.classList.add('hidden');
    this.box.classList.remove('hidden');
    this.box.classList.toggle('narrate', !p);
    this.box.style.setProperty('--c', p?.color ?? '#c9d2de');
    this.box.querySelector('.cs-name').textContent = p ? this.fill(p.name) : '';
    const face = this.box.querySelector('.cs-face'), fg = face.getContext('2d');
    fg.clearRect(0, 0, 24, 24);
    face.hidden = !p?.look;
    if (p?.look) fg.drawImage(drawBust(p.look), 0, 0);
    const act = this.actors[id];
    if (act instanceof PersonActor) act.hop = Math.max(act.hop, 0.15);
    const full = this.fill(text), el = this.box.querySelector('.cs-text');
    if (this.skipping) return;
    this.typing = true;
    this.typed = 0;
    await new Promise(resolve => {
      const tick = () => {
        if (!this.playing || this.skipping) return resolve();
        this.typed += 1.6;
        const n = Math.min(full.length, Math.floor(this.typed));
        el.textContent = full.slice(0, n);
        if (n >= full.length) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });
    el.textContent = full;
    this.typing = false;
    await this.wait();
  }

  async caption(text) {
    this.box.classList.add('hidden');
    this.cap.innerHTML = esc(this.fill(text));
    this.cap.classList.remove('hidden', 'show');
    void this.cap.offsetWidth;
    this.cap.classList.add('show');
    await this.wait();
    this.cap.classList.add('hidden');
  }

  async showCard(html, cls, secs) {
    this.box.classList.add('hidden');
    this.card.className = `cs-card ${cls}`;
    this.card.innerHTML = html;
    await this.wait(secs);
    this.card.className = 'cs-card hidden';
  }

  titleCard(chapter, title) {
    sfx.megaCharge?.();
    return this.showCard(`<small>${esc(chapter)}</small><b>${esc(title)}</b>`, 'title', 3);
  }

  reveal(name, sub) {
    this.fx.flash = 1;
    this.fx.flashColor = '#ffffff';
    this.game.shake(7, 0.5);
    return this.showCard(`<b>${esc(this.fill(name))}</b><small>${esc(this.fill(sub ?? ''))}</small>`, 'reveal', 4);
  }

  joinCard(ids) {
    const list = [].concat(ids).map(id => this.species(id)).filter(id => SPECIES[id]);
    if (!list.length) return;
    this.sx.onJoin?.(list);
    sfx.sendOut?.();
    for (const id of list) {
      const m = Object.values(this.actors).find(a => a instanceof MonActor && a.sp.id === id);
      if (m) this.animate(null, m.sprite.has('Hop') ? 'Hop' : null, false, m);
    }
    return this.showCard(`<div class="cs-joins">${list.map(id => `<span><img src="/sprites/${SPECIES[id].sprite}/portrait.png" alt=""><b>${SPECIES[id].name}</b></span>`).join('')}</div>
      <b>${list.map(id => SPECIES[id].name).join(' and ')} joined your team!</b>`, 'join', 2.6);
  }

  // Evolution on stage: the camera closes in, the Pokémon pulses white, and the new form appears.
  async evolveCard(from, to) {
    const a = this.species(from), b = this.species(to);
    if (!SPECIES[a] || !SPECIES[b] || a === b || this.sx.canEvolve?.(a) === false) return;
    this.sx.onEvolve?.(a, b);
    await this.prepare([b]).catch(() => {});
    if (this.skipping) return;
    let key = Object.keys(this.actors).find(k => this.actors[k] instanceof MonActor && this.actors[k].sp.id === a);
    if (!key) {
      key = '_evo';
      this.addMon(key, a, 0.5, 0.86, { fade: true });
    }
    const m = this.actors[key], g = this.game;
    if (!m) return;
    this.box.classList.add('hidden');
    const saved = { zoom: this.cam.zoom, x: this.cam.x, y: this.cam.y, auto: this.cam.auto };
    this.cam.auto = false;
    this.cam.tw = { from: { zoom: this.cam.zoom, x: this.cam.x, y: this.cam.y }, to: { zoom: 2.4, x: m.x, y: m.y - 20 }, t: 0, d: 0.6 };
    g.spawn(new Glow(m.x, m.y, 16, 40, [255, 255, 255], 3));
    for (let i = 0; i < 6 && !this.skipping; i++) {
      m.flash = 1;
      await this.wait(0.24 - i * 0.02);
      m.flash = 0;
      await this.wait(0.14);
    }
    this.fx.flash = 1;
    this.fx.flashColor = '#ffffff';
    const n = new MonActor(g, b, m.x, m.y, m.z);
    n.dir = m.dir;
    this.actors[key] = n;
    g.spawn(new Ring(m.x, m.y, { r0: 6, r1: 70, life: 0.6, color: '#ffffff', width: 3 }));
    this.animate(null, null, false, n);
    await this.showCard(`<b>${SPECIES[a].name} evolved into ${SPECIES[b].name}!</b>`, 'join', 2.6);
    this.cam.tw = { from: { zoom: this.cam.zoom, x: this.cam.x, y: this.cam.y }, to: saved, t: 0, d: 0.6 };
    this.cam.auto = saved.auto;
  }

  async credits(lines) {
    this.box.classList.add('hidden');
    this.card.className = 'cs-card credits';
    this.card.innerHTML = `<div class="cs-roll">${lines.map(l => (l ? `<p>${esc(this.fill(l))}</p>` : '<br>')).join('')}</div>`;
    await this.wait(16);
    this.card.className = 'cs-card hidden';
  }

  async fade(dir, secs) {
    this.fadeEl.style.transition = `opacity ${secs}s`;
    this.fadeEl.style.opacity = dir === 'out' ? '1' : '0';
    if (!this.skipping) await new Promise(r => setTimeout(r, secs * 1000));
  }

  // ── Called by the game loop while a cutscene is on screen ──
  update(dt) {
    this.t += dt;
    const g = this.game, c = this.cam, f = this.fx;
    for (const a of Object.values(this.actors)) {
      a.update(dt);
      if (a.emoteT) a.emoteT = Math.max(0, a.emoteT - dt);
    }
    if (c.tw) {
      const tw = c.tw;
      tw.t += dt;
      const k = ease(Math.min(1, tw.t / tw.d));
      c.zoom = lerp(tw.from.zoom, tw.to.zoom, k);
      c.x = lerp(tw.from.x, tw.to.x, k);
      c.y = lerp(tw.from.y, tw.to.y, k);
      if (k >= 1) c.tw = null;
    } else if (c.auto) {
      const tgt = this.autoFrame(), k = 1 - Math.exp(-dt * 2.5);
      c.x = lerp(c.x, tgt.x, k);
      c.y = lerp(c.y, tgt.y, k);
      c.zoom = lerp(c.zoom, tgt.zoom, k);
    }
    f.flash = Math.max(0, f.flash - dt * 2.2);
    if (f.shadow && (f.shadow.t += dt) >= f.shadow.d) f.shadow = null;
    if (f.rain) for (let i = 0; i < 5; i++) g.particles.spawn({ x: rand(-40, WORLD_W + 40), y: rand(160, 620), z: 140, vx: -60, vz: -520, life: 0.28, size: 1.5, colors: ['#bfe6ff', '#8fc8f0'] });
    if (f.lightning && (f.boltT -= dt) <= 0) {
      f.boltT = rand(3.5, 7);
      this.bolt(rand(60, WORLD_W - 60));
    }
  }

  camera() {
    return { zoom: this.cam.zoom, cx: this.cam.x, cy: this.cam.y, dim: 0 };
  }

  list() {
    return Object.values(this.actors);
  }

  // World space, under the actors: the passing shadow of something huge overhead.
  drawGround(ctx) {
    const s = this.fx.shadow;
    if (!s) return;
    const k = s.t / s.d, x = lerp(s.x0, s.x1, ease(k));
    ctx.globalAlpha = 0.45 * Math.sin(Math.PI * k);
    ctx.fillStyle = '#05060c';
    ctx.beginPath();
    ctx.ellipse(Math.round(x), s.y, s.r * 1.6, s.r * 0.5, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(Math.round(x + s.r * 1.4), s.y - s.r * 0.3, s.r * 0.9, s.r * 0.22, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // World space, over everything: emotes, then lighting tint and flashes.
  drawOver(ctx, view) {
    for (const a of Object.values(this.actors)) if (a.emoteT > 0) this.drawEmote(ctx, a);
    const x0 = -view.ox - 800, y0 = -view.oy - 800, w = view.w * 3 + 1600, h = view.h * 3 + 1600;
    if (this.loc.black) {
      ctx.fillStyle = '#000';
      ctx.fillRect(x0, y0, w, h);
    }
    if (this.fx.tint) {
      ctx.fillStyle = this.fx.tint;
      ctx.fillRect(x0, y0, w, h);
    }
    if (this.fx.flash > 0) {
      ctx.globalAlpha = Math.min(0.85, this.fx.flash);
      ctx.fillStyle = this.fx.flashColor;
      ctx.fillRect(x0, y0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  drawEmote(ctx, a) {
    const x = Math.round(a.x + 8), y = Math.round(a.top() - (1 - Math.min(1, (1.6 - a.emoteT) * 6)) * 6);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1c1b24';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - 6.5, y - 8.5, 13, 11, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = a.emote === '💢' ? '#e0362f' : '#1c1b24';
    ctx.font = '700 8px "Pixelify Sans", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(a.emote === '💢' ? '#' : a.emote, x, y);
    ctx.textAlign = 'left';
  }

  // Load every Pokémon a scene uses, with its reaction animations.
  async prepare(ids) {
    const g = this.game;
    await g.ensureSprites(ids);
    await Promise.all(ids.map(id => addExtraAnims(SPECIES[id].sprite, g.sprites[SPECIES[id].sprite])));
  }
}
