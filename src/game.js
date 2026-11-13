import { showStatusRelease } from './move-presentation.js';
import { ClashImpact } from './clash-animation.js';
import { drawCosmeticAura, CosmeticStarburst } from './economy-art.js';
import { newSummary, recordCombat, cosmeticLoadout } from './mastery.js';
import { quality, observeFrame } from './quality.js';
import { BossPresenter, drawBossGround, drawBossHud, drawBossShield } from './bosses.js';
import { Arena, WORLD_W, WORLD_H } from './arena.js';
import { Pokemon, CHARGE_MAX } from './pokemon.js';
import { Trainer } from './trainer.js';
import { Team } from './team.js';
import { SPECIES, DEFAULT_TEAM, OPPONENT_TEAM, spritesFor } from './data/species.js';
import { bossSpritesFor } from './data/skins.js';
import { reactionBetween } from './reactions.js';
import { abilityOf, typesOf } from './data/abilities.js';
import { ITEMS, itemOf, cleanKit, randomKit } from './data/items.js';
import { applyStatus, addBuff, benchStatus, changeStage } from './status.js';
import { comboRole, soften, grounded } from './combat.js';
import { typeMultiplier } from './data/types.js';
import { Showcase, Finale } from './cinema.js';
import { outlinedText } from './draw.js';
import { loadSpecies, measureDims } from './assets.js';
import { WINGS } from './data/wings.js';
import { addFlapAnim } from './flap.js';
import { TYPE_COLORS } from './data/types.js';
import { MOVES, chargedMove, adaptMove } from './moves.js';
import { tickVolatiles, fakeOutFails } from './effects-resolver.js';
import { moveBlocked, onFaintExtra, CALLERS } from './effects-extra.js';
import { roleCooldown } from './roles.js';
import { freshField, tickField, drawField, onEntry, dragOut } from './field.js';
import { OpponentAI } from './ai.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import {
  ItemFly,
  ParticleSystem, DamageNumber, FloatText, FIRE, rand, dustCloud, sendOutBurst, Telegraph, TidalWave, Lightning, leafBurst,
  ThrownBall, MegaAura, RainbowStreak, MegaEmblem, rainbowBurst, BeamLine, WindStreaks, Ring, Glow, Pillar, iceShatter, electricBurst, waterSplash, AbilityFlare, TeraBurst, SpeechBubble,
} from './effects.js';
import { initAudio, sfx, playCry } from './audio.js';
import { EMOTES } from './social.js';
import { music, ARENA_TRACK, RAID_TRACKS } from './music.js';

export const SWITCH_COOLDOWN = 15;
const PANEL_W = 318;
export const HOME = { player: { x: 180, y: 500, dir: 4 }, opponent: { x: 180, y: 215, dir: 0 } };
const ease = t => 1 - (1 - t) * (1 - t);
const DECORATIVE_EFFECTS=new Set(['Ring','Glow','DamageNumber','FloatText','Afterimage','ScreenDim','UltimateImpact','MegaAura','RainbowStreak','MegaEmblem','BeamLine','Lightning','Pillar','LegendaryBeam','PsychicBeam','AeroblastBeam','RaidBurst','RaidAreaBurst','NovaGather','CosmeticStarburst','ClockFace','SpaceRift','Crescent','ChargeOrb','ItemFly','MoveCastCue','ShotRibbon','DashStreak','PulseTrain','MoveImpactCue','WeatherArrival','HazardLanding','BeamWake','StatusRelease','StrikeRelease','ClashImpact']);
const ULT_CUT = 1.3; // length of the cutscene that opens every ultimate
// Shadow Tag traps every foe; Magnet Pull and Arena Trap only some.
// Shadow Tag-style abilities, and Block (the foe can't switch out while it lasts).
const traps = (by, foe) => { if (foe.blocked > 0 || foe.ingrained) return true; const t = abilityOf(by).shadowTag; return typeof t === 'function' ? t(foe) : !!t; };
const ARENA_EVENTS = {
  mtSilver: { name: 'AVALANCHE!', hit: 'AVALANCHE!', n: 3, r: 30, color: '#e8f4ff', status: 'slow',
    fx: (g, z) => { iceShatter(g, z.x, z.y, 10); dustCloud(g, z.x, z.y, 12, 5); g.spawn(new Pillar(z.x, z.y, 0.5, [230, 244, 255], 140)); sfx.quake(); } },
  viridian: { name: 'FALLING TREES!', hit: 'TIMBER!', n: 2, r: 16, lane: true, rgb: '120,200,90', color: '#8fd060', status: 'stun',
    fx: (g, z) => { for (let x = 20; x < WORLD_W; x += 40) leafBurst(g, x, z.y, 6, 4); dustCloud(g, WORLD_W / 2, z.y, 10, 5); sfx.quake(); } },
  cinnabar: { name: 'ERUPTION!', hit: 'LAVA!', n: 4, r: 26, color: '#ff7a2a', status: 'burn',
    fx: (g, z) => { g.spawn(new Pillar(z.x, z.y, 0.6, [255, 120, 40], 200)); g.marks.scorch(z.x, z.y, 24, 6); for (let i = 0; i < 10; i++) g.particles.spawn({ x: z.x, y: z.y, z: 4, vx: rand(-60, 60), vy: rand(-30, 30), vz: rand(120, 260), gz: 400, life: 0.8, size: rand(2, 4), colors: FIRE }); sfx.explosion(); } },
  seafoam: { name: 'TIDAL SURGE!', hit: 'SWEPT AWAY!', n: 1, r: 46, lane: true, rgb: '90,160,255', color: '#5aa6f0', status: 'slow',
    fx: (g, z) => { g.spawn(new TidalWave(z.y - 60, z.y + 60, 0.6, [70, 140, 230], true)); waterSplash(g, WORLD_W / 2, z.y); sfx.splash(); } },
  indigo: { name: 'LIGHTNING STRIKE!', hit: 'ZAP!', n: 3, r: 24, color: '#ffe066', status: 'para',
    fx: (g, z) => { g.spawn(new Lightning(z.x, z.y - 240, z.x, z.y, 0.3)); electricBurst(g, z.x, z.y, 6); g.marks.burn(z.x, z.y, 16); sfx.thunder(); } },
};
const WEATHER_START = { rain: 'It started to rain!', sun: 'The sunlight turned harsh!', sand: 'A sandstorm kicked up!', snow: 'It started to snow!', hail: 'It started to hail!' };
const WEATHER_END = { rain: 'The rain stopped.', sun: 'The harsh sunlight faded.', sand: 'The sandstorm subsided.', snow: 'The snow stopped.', hail: 'The hail stopped.' };
const HAZARD_MAX = { rocks: 1, spikes: 3, toxic: 2, web: 1 };
const HAZARD_NAME = { rocks: 'Stealth Rock', spikes: 'Spikes', toxic: 'Toxic Spikes', web: 'Sticky Web' };
const HAZARD_COLOR = { rocks: '#e8dcc0', spikes: '#d8b878', toxic: '#e0a0f0', web: '#ffffff' };
const TERRAIN_COLOR = { electric: '#ffd84a', grassy: '#5fd04a', psychic: '#ff6ad0', misty: '#ffb0e0' };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Moves Copy can't take: ultimates are excluded separately; these depend on the user's own form.
const NOT_COPYABLE = new Set(['copy', 'copycat', 'kingsShield', 'sleepTalk']);

// Perpendicular distance from (px, py) to a ray; Infinity when outside it.
function rayDist(px, py, x0, y0, ang, len) {
  const dx = px - x0, dy = py - y0, along = dx * Math.cos(ang) + dy * Math.sin(ang);
  if (along < 0 || along > len) return Infinity;
  return Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
}

// A projectile continuing after a reaction carries its new power (and any added status).
function setPower(p, power, extra) {
  p.move = { ...p.move, power: Math.max(1, Math.round(power)), ...(extra || {}) };
}

// Sizes for species without hand-tuned dimensions, and procedural wing flaps, once their sheets load.
export function prepareSprites(sprites, ids) {
  for (const s of Object.values(SPECIES)) {
    if (s.bodyZ == null && ids.includes(s.sprite) && sprites[s.sprite]) Object.assign(s, measureDims(sprites[s.sprite]));
  }
  for (const k of ids) if (WINGS[k.split('~')[0]] && sprites[k]) addFlapAnim(sprites[k], WINGS[k.split('~')[0]]);
}

export class Game {
  constructor(canvas, sprites, ui) {
    this.canvas = canvas;
    // Opaque: the arena always covers the canvas, so the browser can skip blending it with the page.
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ui = ui;
    this.headless=ui.headless===true;
    this.sprites = sprites;
    this.arena = new Arena(this.headless);
    this.marks = this.arena.marks;
    this.particles = new ParticleSystem();
    if(this.headless)this.particles.max=-1;
    this.hud = new Hud(this);
    this.red = new Trainer('red', 'Red', 180, 598);
    this.gold = new Trainer('gold', 'Gold', 180, 104);
    // Each Pokémon's kit (data/items.js): its held item, Tera type, chosen moves and, if owned, its shiny colours.
    this.makeTeam = (ids, side, trainer, kits = {}) => new Team(side, trainer, ids.map(id => {
      const s = SPECIES[id], k = cleanKit(s, kits[id], () => true), shiny = k.shiny && sprites[`${s.sprite}~shiny`];
      const mon = new Pokemon(s, shiny || sprites[s.sprite], side);
      Object.assign(mon, { item: k.item, teraType: k.tera, shiny: !!shiny, moveset: k.moves, kitMoves: k.moves });
      return mon;
    }));
    this.selection = [...DEFAULT_TEAM];
    this.playerTeam = this.makeTeam(this.selection, 'player', this.red);
    this.opponentSelection = [...OPPONENT_TEAM];
    this.difficulty = 'medium';
    this.opponentTeam = this.makeTeam(this.opponentSelection, 'opponent', this.gold);
    for (const m of this.opponentTeam.members) m.faceFoeWhileMoving = true;
    this.ai = new OpponentAI();
    this.input = new Input(this);
    this.lead = 0;
    this.reset();
    this.state = 'select';
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
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

  recordCombat(kind, actor, target, details) { recordCombat(this, kind, actor, target, details); }

  reset() {
    this.bossFx?.ultimateVisual?.action.cancel();
    this.bossFx = null;
    this.summary = newSummary(this);
    this.time = 0;
    this.hazards = { player: {}, opponent: {} };
    this.eventN = -1;
    this.eventSeed ??= Math.floor(Math.random() * 2 ** 31);
    this.timedWeather = null;
    this.terrain = null;
    this.effects = [];
    this.timers = [];
    this.particles.clear();
    this.arena.reset();
    this.playerTeam.reset(this.lead, HOME.player);
    this.opponentTeam.reset(this.foeLead ?? 0, HOME.opponent);
    this.link();
    this.red.reset();
    this.gold.reset();
    this.ai.reset();
    this.hud.reset();
    this.input.clear();
    Object.assign(this, {
      hitstopT: 0, lastHitstop: -1, shakeT: 0, shakeDur: 1, shakeMag: 0, slowT: 0, flashT: 0, endT: 0,
      winner: null, buffered: null, megaQueued: 0, cinematic: null, switchCD: 0, foeSwitchCD: 0, switching: false,
      switchMenu: false, windsOn: false, winds: null, punchT: 0, punchDur: 1, punchAmt: 0, punchAt: null,
      weather: null, weatherT: 0, timedWeather: null, terrain: null, finale: null, showcase: null, popT: new Map(), lastUsed: { player: null, opponent: null },
      musicT: 0, legendT: 0, ...freshField(),
    });
    this.ui.showSwitchMenu(false);
  }

  // Team selection screen; the lead chosen there is used by start().
  toSelect() {
    this.raid = null; this.raidState = null; this.raidAlly = null; this.raidCards = []; this.survival = null;
    this.online = null;
    this.endPractice();
    this.paused = false;
    this.reset();
    this.state = 'select';
    this.ui.showSelect(this.lead);
    music.play('menu');
  }

  // Opening, trainer setup and format screens (flow.js): no battle input, battle overlays hidden.
  toMenu() {
    this.raid = null; this.raidState = null; this.raidAlly = null; this.raidCards = []; this.survival = null;
    this.online = null;
    this.paused = false;
    this.reset();
    this.state = 'menu';
    this.ui.hideBattleOverlays();
  }

  // Practice defaults to a passive Snorlax. The move demo can supply its own sparring partner.
  startPractice(team, opponent = 'snorlax') {
    this.practice = true;
    this.selection = team;
    this.opponentSelection = [opponent];
    this.lead = 0;
    this.start(true);
  }

  endPractice() {
    this.practice = false;
  }

  // Shiny Pokémon (in either side's kits) also get their recoloured sheets.
  async ensureSprites(ids, bossId) {
    const shiny = ids.filter(id => SPECIES[id] && (this.kits?.[id]?.shiny || this.foeKits?.[id]?.shiny)).map(id => `${SPECIES[id].sprite}~shiny`);
    const need = [...new Set([...spritesFor(ids), ...shiny, ...bossSpritesFor(bossId)])].filter(k => !this.sprites[k]);
    if (!need.length) return;
    Object.assign(this.sprites, await loadSpecies(need));
    prepareSprites(this.sprites, need);
  }

  later(delay, fn) {
    this.timers.push({ t: delay, fn });
  }

  // The player's team is whichever three Pokémon were picked on the selection screen.
  start(practice = false) {
    this.raid = null; this.raidState = null; this.raidAlly = null; this.raidCards = [];
    if (!practice && this.selection.length !== this.ui.format) return;
    initAudio();
    document.activeElement?.blur?.();
    if (practice) this.online = null;
    if (!this.online) {
      // Against the bot: it leads with its first Pokémon and Megas into its first form.
      this.eventSeed = Math.floor(Math.random() * 2 ** 31);
      this.foeLead = 0;
      this.foeMegaPicks = null;
      if (!this.story) {
        // A Gym Leader picked in Bot Battles (leaders.js), otherwise the usual rival.
        this.gold.name = this.foeTrainer?.name ?? 'Gold';
        this.gold.setPalette(this.foeTrainer?.palette ?? {});
      }
    }
    // Computer trainers carry sensible items; online and in raids each side brings its own kits.
    if (!this.online && !this.raid && !practice) this.foeKits = Object.fromEntries(this.opponentSelection.map(id => [id, randomKit(SPECIES[id])]));
    this.playerTeam = this.makeTeam(this.selection, 'player', this.red, practice ? {} : this.kits ?? {});
    this.opponentTeam = this.makeTeam(this.opponentSelection, 'opponent', this.gold, practice ? {} : this.foeKits ?? {});
    // Online, the opposing team is the other player's: their game drives it (see online.js).
    // Online: Pokémon whose outcomes another machine decides are "remote" here (they only animate).
    // On the match server (online.authority) nothing is remote; with a match server every client Pokémon is.
    for (const m of this.opponentTeam.members) {
      m.faceFoeWhileMoving = !this.online;
      m.remote = !!this.online && !this.online.authority;
    }
    if (this.online?.server) for (const m of this.playerTeam.members) m.remote = true;
    this.playerTeam.members.forEach((m, i) => { m.megaPick = this.megaPicks?.[this.selection[i]] ?? null; });
    this.cosmetics = this.online?.authority ? {} : {...cosmeticLoadout(),...this.flow?.economy?.loadout()};
    this.ui.buildTeam(this);
    this.reset();
    for (const m of this.playerTeam.members) m.megaChoice = m.megaPick;
    this.opponentTeam.members.forEach((m, i) => { m.megaChoice = this.foeMegaPicks?.[this.opponentSelection[i]] ?? null; });
    this.arena.setTheme(practice ? 'mtSilver' : this.arenaId ?? 'mtSilver');
    if (practice) this.opponent.y = 330; // below the tutorial dialogue
    this.ui.setLocation(this.arena.theme.name, this.playerTeam.members.length);
    this.state = 'intro';
    this.ui.onStart();
    this.ui.setActive(this.player);
    this.ui.setVersus(this.gold.name);
    this.gold.hidden = !!this.story?.wild;
    this.spareT = 0;
    music.play(practice ? 'battle' : this.battleTrack(0, true));
    this.online?.begin();
    if (practice) {
      this.hud.showBanner('PRACTICE', { color: '#ffd84a', y: 330, life: 1.2, size: 22 });
      this.beginSendOut();
    } else this.showcase = new Showcase(this);
  }

  // Battle theme: the arena's own, or the legendary theme while a legendary or mythical Pokémon is out
  // (held for a few seconds after it leaves so switches don't flip the music back and forth).
  battleTrack(dt = 0, atStart = false) {
    if (this.raid || this.raidState) {
      const id=this.raid?.id??this.raidState.id,final=(this.raid?.stage??this.raidState.st??1)>=4;
      return RAID_TRACKS[id]?.[final?1:0]??(final?'raidRage':'raid');
    }
    const legend = [this.player, this.opponent].some(m => m?.alive && (atStart || !m.hidden) && m.species.class !== 'regular');
    this.legendT = legend ? 4 : Math.max(0, this.legendT - dt);
    return this.legendT > 0 ? 'legend' : ARENA_TRACK[this.arena.theme?.id] ?? 'battle';
  }

  // Online: tells the other player's game what our Pokémon just did.
  netSend(mon, msg) {
    if (msg.t === 'move') this.recordCombat('move', mon, null, {id:msg.id,ultimate:MOVES[msg.id]?.ultimate});
    if (msg.t === 'mega' || msg.t === 'switch') this.recordCombat(msg.t, mon);
    if (this.online && !mon.remote) this.online.send({ ...msg, side: mon.side });
  }

  // After the team showcase (or when it is skipped): both trainers throw out their leads.
  beginSendOut() {
    this.showcase = null;
    this.sendOut(this.opponent, 0.1, `${this.gold.name} sent out ${this.opponent.species.name}!`);
    this.sendOut(this.player, 0.5, `Go, ${this.player.species.name}!`);
    this.later(1.45, () => {
      this.state = 'fighting';
      this.hud.showBanner('BATTLE START!', { color: '#ff7a2f', y: 330, life: 1.1 });
    });
  }

  skipCinema() {
    // Online both players watch the same intro, so it can't be skipped on one side.
    if (this.showcase) !this.online && this.showcase.skip();
    else if (this.finale) this.finale.skip();
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
    this.recordCombat('entered',mon);
    if (mon.side === 'player' && this.cosmetics?.effect) {
      this.spawn(new Ring(mon.x,mon.y,{r0:8,r1:70,life:.8,color:this.cosmetics.effect.color,width:4}));
    }
    mon.hidden = false;
    mon.appear = 1;
    mon.enteredAt = this.time;
    this.lastUsed[mon.side] = null;
    if (!this.headless) playCry(mon.baseSpecies.dex);
    sendOutBurst(this, mon.x, mon.y, mon.species.bodyZ);
    const [c1] = TYPE_COLORS[mon.species.types[0]];
    const rgb = [1, 3, 5].map(i => parseInt(c1.slice(i, i + 2), 16));
    this.spawn(new Ring(mon.x, mon.y, { r0: 6, r1: 46, life: 0.45, color: c1, width: 3 }));
    if (mon.species.class !== 'regular') {
      this.spawn(new Pillar(mon.x, mon.y, 0.7, rgb, 360));
      this.spawn(new Glow(mon.x, mon.y, mon.species.bodyZ, 60, rgb, 0.6));
      this.shake(6, 0.5);
      mon.sprite.play(['Roar', 'RearUp', 'Pose', 'Charge'].find(a => mon.sprite.has(a)) ?? 'Idle', { loop: false, force: true });
      sfx.roar();
    }
    this.later(0.35, () => {
      if (!mon.hidden && mon.alive) abilityOf(mon).onEnter?.(this, mon);
      if (!mon.hidden && mon.alive) itemOf(mon)?.onEnter?.(this, mon);
      if (!mon.hidden && mon.alive) this.applyHazards(mon);
      if (!mon.hidden && mon.alive) onEntry(this, mon);
    });
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
    if (!forced && (this.switching || this.cinematic || this.switchCD > 0 || cur.recallT > 0 || cur.held || this.ultActive())) return false;
    if (!forced && cur.alive && traps(this.opponent, cur) && !this.opponent.hidden && this.opponent.alive) {
      this.abilityPop(this.opponent, "Can't escape!");
      return false;
    }
    if (!forced) this.switchCD = SWITCH_COOLDOWN;
    this.toggleSwitchMenu(false);
    this.switching = true;
    this.netSend(cur, { t: 'switch', i: index });
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
      this.leaveField(cur);
      this.recall(cur, bringIn);
    } else bringIn();
    return true;
  }

  leaveField(mon) {
    mon.cancelCharge(this, false);
    abilityOf(mon).onLeave?.(this, mon);
    benchStatus(mon);
    if (mon.form) this.setForm(mon, null);
  }

  // Q opens a picker of teammates; the battle keeps running while it is open.
  toggleSwitchMenu(open = !this.switchMenu) {
    if (open && this.state !== 'fighting') return;
    this.switchMenu = open;
    this.ui.showSwitchMenu(open);
  }

  pickSwitch(index) {
    if (this.online?.intent) {
      this.toggleSwitchMenu(false);
      return this.online.intent('switch', index);
    }
    if (!this.switchTo(index)) this.denied();
  }

  replaceOpponent(index) {
    const team = this.opponentTeam;
    team.index = index;
    const mon = team.active;
    mon.enter(HOME.opponent.x, HOME.opponent.y, HOME.opponent.dir);
    this.link();
    this.ai.reset();
    this.netSend(mon, { t: 'switch', i: index });
    this.hud.showBanner(`GOLD SENDS OUT ${mon.species.name.toUpperCase()}!`, { color: '#f5c542', y: 300, life: 1.6, size: 19 });
    this.sendOut(mon, 0.25, `Gold sent out ${mon.species.name}!`);
  }

  // Online: a switch decided elsewhere (the other player, or the match server for either side).
  remoteSwitch(index, side = 'opponent') {
    const team = side === 'player' ? this.playerTeam : this.opponentTeam, cur = team.active, next = team.members[index];
    if (!next || next === cur) return;
    // Their game decides who can still battle.
    if (next.fainted || !next.alive) Object.assign(next, { fainted: false, hp: Math.max(1, next.hp) });
    const home = HOME[side], owner = side === 'player' ? this.red : this.gold;
    const spot = cur.alive && !cur.hidden ? { x: cur.x, y: cur.y } : home;
    const bringIn = () => {
      team.index = index;
      next.enter(spot.x, spot.y, home.dir);
      this.link();
      if (side === 'player') this.ui.setActive(next);
      this.sendOut(next, 0.05, `${owner.name} sent out ${next.species.name}!`);
    };
    if (cur.alive && !cur.hidden && !cur.fainted) {
      this.ui.log(`${owner.name} withdrew ${cur.species.name}!`, side);
      this.leaveField(cur);
      this.recall(cur, bringIn);
    } else bringIn();
  }

  // The opposing side's manual switch (the second player on the match server): same rules and cooldown
  // as the player's own switches.
  switchFoe(index) {
    const team = this.opponentTeam, cur = team.active, next = team.members[index];
    if (this.state !== 'fighting' || !next || !next.alive || next === cur) return false;
    if (this.foeSwitchCD > 0 || this.cinematic || cur.recallT > 0 || cur.held || this.ultActive() || cur.hidden) return false;
    if (cur.alive && traps(this.player, cur) && !this.player.hidden && this.player.alive) {
      this.abilityPop(this.player, "Can't escape!");
      return false;
    }
    this.foeSwitchCD = SWITCH_COOLDOWN;
    this.netSend(cur, { t: 'switch', i: index });
    this.remoteSwitch(index);
    return true;
  }

  denied() {
    sfx.denied();
  }

  // Roar, Whirlwind, Dragon Tail, Circle Throw (field.js).
  dragOut(mon, by) {
    return dragOut(this, mon, by);
  }

  // A landed hit opens a short chain window: a higher combo role (opener → launcher → finisher) can
  // cancel the remaining recovery. Ultimates need a full meter instead of a cooldown.
  canChain(user, move) {
    return user.chainT > 0 && comboRole(move) > user.chainRole && comboRole(move) < 3 && user.alive && !user.hidden && user.recallT <= 0
      && user.frozen <= 0 && user.stagger <= 0 && !user.held && !(user.status.sleep > 0) && user.dodgeT <= 0 && !user.charging
      && !user.action?.move.ultimate;
  }

  // `force` replays a move the other player already used (online): no readiness or cooldown checks.
  useMove(user, id, chargeLevel = 0, force = false, copied = null) {
    const base = MOVES[id];
    if (!base || this.state !== 'fighting' || this.cinematic) return false;
    let chain = false;
    // Taunt blocks status moves; Fake Out only works right after coming in.
    if (!force && base.cat === 'status' && user.taunted > 0) {
      this.floatText(user, 'TAUNTED!', '#ff7a5a');
      return false;
    }
    // Encore: locked into the move it used last for a few seconds (its ultimate stays free).
    if (!force && user.encore?.t > 0 && id !== user.encore.id && !base.ultimate) {
      this.floatText(user, 'ENCORE!', '#ffd84a');
      return false;
    }
    // Sleep Talk works only while asleep: it uses one of the user's other moves at random.
    if (id === 'sleepTalk') return this.sleepTalk(user, force, copied);
    // Snore, like Sleep Talk, only works while asleep.
    if (id === 'snore' && !force) {
      if (!(user.status.sleep > 0)) { this.floatText(user, 'IT FAILED!', '#c9d2de'); return false; }
      return this.moveCD(user, id) > 0 ? false : this.useMove(user, id, 0, true);
    }
    if (!force && fakeOutFails(this, user, base)) {
      this.floatText(user, 'IT FAILED!', '#c9d2de');
      this.startCooldown(user, id, base.cooldown);
      return false;
    }
    if (force) {
      user.charging = null;
      user.cancelAction();
      user.busy = 0;
    } else {
      chain = !user.canAct() && !base.ultimate && this.canChain(user, base);
      if (!user.canAct() && !chain) return false;
      if (this.moveCD(user, id) > 0) return false;
      // Disable, Torment, Imprison, Gravity, a move's own conditions, confusion and infatuation (effects-extra.js).
      if (moveBlocked(this, user, id, base)) return false;
    }
    if (base.ultimate) {
      user.ult = 0;
      abilityOf(user).onUse?.(this, user, base);
      itemOf(user)?.onUse?.(this, user, base);
      this.startUltCutscene(user, base);
      if (user.foe?.alive && !user.foe.hidden) abilityOf(user.foe).onFoeUlt?.(this, user.foe);
      this.netSend(user, { t: 'move', id });
      return true;
    }
    if (base.copy || (copied && CALLERS.has(id))) return this.useCopy(user, copied, id); // a replayed Metronome names its pick
    if (chain) {
      user.cancelAction();
      user.busy = 0;
      user.chainT = 0;
    }
    const move = adaptMove(this, user, chargedMove(base, chargeLevel));
    if (move.sunCharged) {
      this.spawn(new FloatText(user.x, user.y - user.headZ - 26, 'SUNLIGHT!', '#ffe680', 7, 1));
      this.ui.log(`${user.species.name} absorbed the sunlight instantly!`, user.side);
    }
    this.emit('move', { user, move });
    if (!NOT_COPYABLE.has(id)) this.lastUsed[user.side] = id;
    this.startCooldown(user, id, base.cooldown * roleCooldown(user, base)); // roles.js: suited moves recharge 15% faster
    this.muteShake = !move.ultimate;
    try { user.action = new move.Action(move, user, this); } finally { this.muteShake = false; }
    if (base.chargeBoost) this.stage(user, base.chargeBoost); // Meteor Beam
    this.hud.callout(user.side, chargeLevel >= 1 ? `${base.name}! MAX` : `${base.name}!`);
    this.ui.log(`${user.species.name} used ${base.name}!`, user.side);
    if (base.selfBuff && !base.dex) this.buff(user, ...base.selfBuff);
    abilityOf(user).onUse?.(this, user, base);
    itemOf(user)?.onUse?.(this, user, base);
    if (user === this.player) this.ai.onThreat();
    this.netSend(user, { t: 'move', id, l: chargeLevel });
    return true;
  }

  // At most two of a Pokémon's four moves are ever cooling down: putting a third on cooldown makes the
  // one closest to ready usable again, so there are always at least two moves to pick from.
  startCooldown(user, id, t) {
    user.cooldowns[id] = Math.max(user.cooldowns[id] ?? 0, t);
    const cooling = user.moves.filter(m => m !== id && (user.cooldowns[m] ?? 0) > 0);
    cooling.sort((a, b) => user.cooldowns[a] - user.cooldowns[b]);
    while (cooling.length > 1) user.cooldowns[cooling.shift()] = 0;
  }

  // True while either side's ultimate is underway (cutscene or the attack itself): no switching out of it.
  ultActive() {
    return this.cinematic?.kind === 'ult' || [this.player, this.opponent].some(m => m.action?.move.ultimate && !m.action.done);
  }

  useCopy(user, forced = null, key = 'copy') {
    const id = forced ?? this.lastUsed[user.foe?.side], src = MOVES[id];
    if (!src || src.copy || id === 'sleepTalk') {
      user.cooldowns[key] = 1;
      this.spawn(new FloatText(user.x, user.y - user.headZ - 14, 'NOTHING TO COPY YET', '#c9d2de', 7));
      return false;
    }
    this.startCooldown(user, key, Math.max(3, src.cooldown * 1.25));
    user.copied = id;
    showStatusRelease(this, MOVES[key], user);
    user.action = new src.Action(src, user, this);
    this.spawn(new FloatText(user.x, user.y - user.headZ - 18, `COPIED ${src.name.toUpperCase()}!`, '#ff9fd0', 8));
    this.hud.callout(user.side, `Copy → ${src.name}!`);
    this.ui.log(`${user.species.name} copied ${src.name}!`, user.side);
    abilityOf(user).onUse?.(this, user, src);
    this.lastUsed[user.side] = id;
    if (user === this.player) this.ai.onThreat();
    this.netSend(user, { t: 'move', id: key, cp: id });
    return true;
  }

  sleepTalk(user, force, pick) {
    if (force) {
      user.charging = null;
      user.cancelAction();
      user.busy = 0;
    } else {
      if (this.moveCD(user, 'sleepTalk') > 0 || !user.alive || user.hidden || user.action || user.recallT > 0 || user.held) return false;
      if (!(user.status.sleep > 0)) {
        this.floatText(user, 'IT FAILED!', '#c9d2de');
        this.startCooldown(user, 'sleepTalk', 1);
        return false;
      }
      const options = user.moves.filter(m => m !== 'sleepTalk' && MOVES[m] && !MOVES[m].ultimate && !MOVES[m].copy && !MOVES[m].twoTurn);
      if (!options.length) return false;
      pick = options[Math.floor(Math.random() * options.length)];
    }
    const src = MOVES[pick];
    if (!src) return false;
    this.startCooldown(user, 'sleepTalk', MOVES.sleepTalk.cooldown);
    const move = adaptMove(this, user, src);
    showStatusRelease(this, MOVES.sleepTalk, user);
    this.muteShake = true;
    try { user.action = new move.Action(move, user, this); } finally { this.muteShake = false; }
    this.spawn(new FloatText(user.x, user.y - user.headZ - 18, `SLEEP TALK → ${src.name.toUpperCase()}!`, '#c8b0ff', 7));
    this.hud.callout(user.side, `Sleep Talk → ${src.name}!`);
    this.ui.log(`${user.species.name} used Sleep Talk! It used ${src.name} in its sleep!`, user.side);
    abilityOf(user).onUse?.(this, user, src);
    if (user === this.player) this.ai.onThreat();
    this.netSend(user, { t: 'move', id: 'sleepTalk', cp: pick });
    return true;
  }

  // Aegislash: Blade Forme (offence) ⇄ Shield Forme (defence), with a sheet swap.
  toggleForm(mon, blade) {
    if (mon.species.ability !== 'stanceChange') return;
    mon.ab.blade = blade;
    this.setForm(mon, blade ? 'aegislash-blade' : null);
    this.spawn(new FloatText(mon.x, mon.y - mon.headZ - 16, blade ? 'BLADE FORME!' : 'SHIELD FORME!', blade ? '#ff8a6a' : '#9fd8ff', 8));
    this.ui.log(`${mon.species.name} changed to ${blade ? 'Blade' : 'Shield'} Forme!`, mon.side);
    sfx.clang();
  }

  // Touchdown after a launch: dust, and a crater for a hard slam.
  onLand(mon, speed) {
    if (mon.hidden) return;
    dustCloud(this, mon.x, mon.y, speed > 500 ? 12 : 6, speed > 500 ? 5 : 3);
    if (speed > 500) {
      this.marks.fracture(mon.x, mon.y, 16, 5);
      this.shake(4, 0.2);
      sfx.quake();
    }
  }

  moveCD(mon, id) {
    return MOVES[id]?.ultimate ? 100 - mon.ult : mon.cooldown(id);
  }

  // ── Hold-to-charge ──
  beginCharge(mon, id) {
    const move = MOVES[id];
    if (this.state !== 'fighting' || this.cinematic || !move?.chargeable || !mon.canAct() || mon.cooldown(id) > 0) return false;
    mon.charging = { id, move, t: 0, color: TYPE_COLORS[move.type][0] };
    mon.sprite.play('Charge', { loop: true, force: true });
    sfx.zap(0.3);
    return true;
  }

  updateCharge(mon, dt) {
    const c = mon.charging;
    if (this.state !== 'fighting' || mon.recallT > 0) {
      mon.charging = null;
      return;
    }
    const before = c.t;
    c.t += dt;
    const k = Math.min(1, c.t / CHARGE_MAX);
    if (Math.random() < 0.5 + k) {
      const a = rand(0, Math.PI * 2), r = rand(18, 30), life = 0.3, x = mon.x + Math.cos(a) * r, y = mon.y + Math.sin(a) * r * 0.6;
      this.particles.spawn({ x, y, z: mon.bodyZ + rand(-8, 8), vx: (mon.x - x) / life, vy: (mon.y - y) / life, life, size: 2 + 2 * k, sizeEnd: 1, colors: ['#ffffff', c.color], fade: false });
    }
    if (before < CHARGE_MAX && c.t >= CHARGE_MAX) {
      this.spawn(new Ring(mon.x, mon.y, { r0: 30, r1: 4, life: 0.25, color: '#ffffff', width: 3 }));
      this.spawn(new FloatText(mon.x, mon.y - mon.headZ - 16, 'MAX CHARGE!', c.color, 7));
      sfx.shard();
    }
    // Holding past the cap fires automatically, so a charge can never be kept forever.
    if (c.t >= CHARGE_MAX + 0.5 && !mon.remote) this.releaseCharge(mon);
  }

  releaseCharge(mon) {
    const c = mon.charging;
    if (!c) return false;
    mon.charging = null;
    const lvl = c.t < 0.15 ? 0 : Math.min(1, c.t / CHARGE_MAX);
    return this.useMove(mon, c.id, lvl);
  }

  // ── Ability, status and buff plumbing used by abilities.js, status.js and moves ──
  // An ability taking effect: the games' ability banner on the Pokémon's side of the screen, a flare of the
  // ability's colour around the Pokémon and its effect in words above it.
  abilityPop(mon, text) {
    const ab = abilityOf(mon), key = mon, now = performance.now();
    this.ui.log(`${mon.species.name}'s ${ab.name}: ${text}`, mon.side);
    if (now - (this.popT.get(key) ?? 0) < 700) return;
    this.popT.set(key, now);
    const color = ab.color ?? TYPE_COLORS[typesOf(mon)[0]][0];
    if (!mon.hidden) this.spawn(new AbilityFlare(mon, color));
    this.spawn(new FloatText(mon.x, mon.y - mon.headZ - 17, text, '#ffffff', 6, 1.3));
    this.hud.ability(mon.side, ab.name, text, mon.species.name, color);
  }

  // A held item taking effect: the same banner as an ability, naming the item. `quiet` skips the log.
  itemPop(mon, text, quiet = false) {
    const item = ITEMS[mon.item];
    if (!item) return;
    if (!quiet) this.ui.log(`${mon.species.name}'s ${item.name}: ${text}`, mon.side);
    const color = item.color ?? TYPE_COLORS[item.type ?? typesOf(mon)[0]][0];
    if (!mon.hidden) this.spawn(new AbilityFlare(mon, color));
    this.spawn(new FloatText(mon.x, mon.y - mon.headZ - 17, text, '#ffffff', 6, 1.3));
    this.hud.ability(mon.side, item.name, text, mon.species.name, color);
  }

  itemTouch(mon, text) {
    if (this.time - (mon.itTouch ?? -9) < 3) return;
    mon.itTouch = this.time;
    this.itemPop(mon, text, true);
  }

  // A one-use item is gone for the rest of the battle (Unburden reacts; Harvest may bring a berry back).
  useUpItem(mon) {
    if (!mon.item || mon.remote) return;
    mon.usedItem = mon.item;
    mon.item = null;
    abilityOf(mon).onItemLost?.(this, mon);
  }

  eatBerry(mon, effect) {
    if (!ITEMS[mon.item]?.berry || mon.remote) return;
    this.itemPop(mon, `It ate its ${ITEMS[mon.item].name}!`);
    effect();
    abilityOf(mon).onBerry?.(this, mon, mon.item);
    this.useUpItem(mon);
  }

  // Knock Off (and Pickpocket): the item flies off; Sticky Hold keeps it.
  knockOffItem(mon, by, steal = false) {
    if (!mon.item || mon.remote) return false;
    if (abilityOf(mon).stickyHold) {
      this.abilityPop(mon, 'Its item is stuck fast!');
      return false;
    }
    const name = ITEMS[mon.item]?.name ?? 'item';
    if (steal && by && !by.item) by.item = mon.item;
    this.floatText(mon, steal ? `${name} STOLEN!` : `${name} KNOCKED OFF!`, '#ffd84a');
    if (!steal) this.spawn(new ItemFly(mon.x, mon.y, mon.bodyZ, by && by.x > mon.x ? -1 : 1));
    this.ui.log(`${mon.species.name}'s ${name} was ${steal ? 'stolen' : 'knocked off'}!`, mon.side);
    this.useUpItem(mon);
    return true;
  }

  // A passive ability doing its work (a damage boost, a reduction): announced at most every 3s per Pokémon.
  abilityTouch(mon, text) {
    if (this.time - (mon.abTouch ?? -9) < 3) return;
    mon.abTouch = this.time;
    this.abilityPop(mon, text);
  }

  // Quick chat (social.js): a speech bubble over that side's trainer for a few seconds.
  showEmote(side, n) {
    const text = EMOTES[n], tr = side === 'player' ? this.red : this.gold;
    if (!text || !tr) return;
    this.spawn(new SpeechBubble(tr, text));
    this.ui.log(`${tr.name}: ${text}`, side);
  }

  floatText(mon, text, color) {
    this.spawn(new FloatText(mon.x + rand(-4, 4), mon.y - mon.headZ - 14, text, color, 7));
  }

  buff(mon, stat, mult, dur, source) {
    return addBuff(this, mon, stat, mult, dur, source);
  }

  // Leech Seed: the seeded Pokémon loses 1/8 of its max HP every 3s and whoever is out on the seeder's side
  // heals that much. Grass types can't be seeded; switching out or Rapid Spin removes the seed.
  seed(mon, by) {
    if (mon.seeded) return this.floatText(mon, 'ALREADY SEEDED', '#c9d2de');
    mon.seeded = { side: by.side, t: 0 };
    leafBurst(this, mon.x, mon.y, mon.bodyZ, 6);
    this.ui.log(`${mon.species.name} was seeded!`, mon.side);
    this.emit('seed', { mon, by });
  }

  tickSeeds(dt) {
    for (const mon of [this.player, this.opponent]) {
      const s = mon?.seeded;
      if (!s || !mon.alive || mon.hidden || (s.t += dt) < 3) continue;
      s.t = 0;
      const healer = s.side === 'player' ? this.player : this.opponent, amount = mon.maxHp / 8;
      if (abilityOf(mon).noIndirect) continue;
      this.dotDamage(mon, 1 / 8, '#62b947');
      this.ui.log(`${mon.species.name}'s health is sapped by Leech Seed!`, mon.side);
      // Green motes flow from the seeded Pokémon to the one it feeds.
      if (healer?.alive && !healer.hidden) {
        for (let i = 0; i < 8; i++) this.particles.spawn({ x: mon.x + rand(-6, 6), y: mon.y, z: mon.bodyZ, vx: (healer.x - mon.x) / 0.7, vy: (healer.y - mon.y) / 0.7, vz: rand(-10, 10), life: 0.7, size: rand(2, 3), colors: ['#e0ffc0', '#62b947'] });
        if (abilityOf(mon).liquidOoze) this.dotDamage(healer, amount / healer.maxHp, '#a040a0');
        else this.heal(healer, amount);
      }
      this.emit('leech', { mon, healer, amount });
    }
  }

  // Stat stages (stats.js): `changes` like { atk: 1, spe: 1 }.
  stage(mon, changes, source) {
    return changeStage(this, mon, changes, source);
  }

  // ── Battle events: mechanics announce what happened (weather start/end, form change, stat stage,
  // protect, immunity, ability…) and the log, HUD, animations and tests listen to the same events. ──
  on(type, fn) {
    ((this.listeners ??= new Map()).get(type) ?? this.listeners.set(type, []).get(type)).push(fn);
    return () => this.listeners.get(type).splice(this.listeners.get(type).indexOf(fn) >>> 0, 1);
  }

  emit(type, data = {}) {
    for (const fn of this.listeners?.get(type) ?? []) fn(data);
    for (const fn of this.listeners?.get('*') ?? []) fn(type, data);
  }

  applyStatus(mon, name, opts) {
    return applyStatus(this, mon, name, opts);
  }

  heal(mon, amount) {
    if (mon.remote || !mon.alive || mon.fainted) return;
    const before = mon.hp;
    mon.hp = Math.min(mon.maxHp, mon.hp + Math.round(amount));
    const got = mon.hp - before;
    if (got <= 0 || mon.hidden) return;
    this.spawn(new DamageNumber(mon.x + rand(-4, 4), mon.y - mon.headZ, got, { color: '#6af08a', size: 12 }));
    for (let i = 0; i < 6; i++) {
      this.particles.spawn({ x: mon.x + rand(-mon.radius, mon.radius), y: mon.y, z: rand(2, mon.headZ), vz: rand(20, 50), life: 0.6, size: 2, colors: ['#ffffff', '#9fffc8', '#46d36b'] });
    }
  }

  // Damage over time (burn, poison, sandstorm, recoil…): a fraction of max HP, no ultimate charge.
  dotDamage(mon, frac, color) {
    if (this.state !== 'fighting' || !mon.alive || mon.hidden || mon.remote || abilityOf(mon).noIndirect) return;
    const dmg = Math.max(1, Math.round(mon.maxHp * frac));
    mon.hp = Math.max(0, mon.hp - dmg);
    mon.trailDelay = 0.45;
    mon.flash = 0.6;
    mon.flashColor = color;
    this.spawn(new DamageNumber(mon.x, mon.y - mon.headZ, dmg, { color, size: 12 }));
    for (let i = 0; i < 6; i++) {
      this.particles.spawn({ x: mon.x + rand(-mon.radius, mon.radius), y: mon.y, z: rand(4, mon.headZ), vz: rand(20, 40), life: 0.5, size: rand(2, 4), sizeEnd: 1, colors: ['#ffffff', color] });
    }
    if (!mon.alive) this.onFaint(mon, mon.foe);
  }

  // Alternate sheet for a form change (Aegislash's Blade Forme); null restores the species' own sheet.
  setForm(mon, spriteId) {
    if ((spriteId ?? null) === (mon.form ?? null)) return;
    const set = this.sprites[spriteId ?? mon.species.sprite];
    if (!set) return;
    mon.form = spriteId;
    mon.setSheet(set);
    this.spawn(new Glow(mon.x, mon.y, mon.bodyZ, 26, [220, 230, 245], 0.25));
  }

  comboPop(mon, text, big) {
    this.hud.combo(mon.side, text, big);
    if (big) {
      sfx.megaBurst();
      this.flash(0.05);
    }
  }

  onUltReady(mon) {
    this.spawn(new FloatText(mon.x, mon.y - mon.headZ - 22, 'ULTIMATE READY!', '#ffd84a', 8, 1.4));
    this.spawn(new Ring(mon.x, mon.y, { r0: 4, r1: 40, life: 0.4, color: '#ffd84a', width: 3 }));
    this.ui.log(`${mon.species.name}'s ultimate is ready!`, mon.side);
    if (mon.side === 'player') {
      sfx.megaBurst();
      this.ui.ultReady();
    }
  }

  // Every ultimate opens with a cutscene: the battle freezes, letterbox bars slide in and the camera
  // pushes in on the user powering up. Then the move plays out across the whole arena.
  startUltCutscene(user, move) {
    if(user.side==='player'&&this.cosmetics?.ultimate)this.spawn(new CosmeticStarburst(user,this.cosmetics.ultimate));
    if (this.raid || this.raidState || this.online?.server || this.online?.authority) {
      const game = this;
      this.showRaidUltCard(user, move);
      user.sprite.play('Charge', { loop: true, force: true });
      user.action = {
        move, t: 0, done: false, allowMove: false,
        update(dt) {
          this.t += dt;
          if (this.t >= ULT_CUT) user.action = new move.Action(move, user, game);
        },
        cancel() { this.done = true; },
      };
      this.hud.callout(user.side, move.name);
      sfx.megaCharge();
      return;
    }
    this.cinematic = { kind: 'ult', mon: user, move, t: 0, ringT: 0 };
    user.sprite.play('Charge', { loop: true, force: true });
    this.hud.callout(user.side, `${move.name}!`);
    this.ui.log(`${user.species.name} unleashed ${move.name}!`, user.side);
    sfx.megaCharge();
  }

  showRaidUltCard(mon, move) {
    this.raidCards ??= [];
    this.raidCards = this.raidCards.filter(c => c.mon !== mon).slice(-1);
    this.raidCards.push({ mon, move, t: 0, compact: true });
  }

  updateUltCutscene(dt) {
    const c = this.cinematic, m = c.mon, [c1] = this.ultColors(c);
    c.t += dt;
    for (let i = 0; i < 3; i++) {
      const a = rand(0, Math.PI * 2), r = rand(30, 60), life = 0.35;
      const x = m.x + Math.cos(a) * r, y = m.y + Math.sin(a) * r * 0.6, z = m.bodyZ + rand(-14, 14);
      this.particles.spawn({ x, y, z, vx: (m.x - x) / life, vy: (m.y - y) / life, life, size: rand(2, 4), sizeEnd: 1, colors: ['#ffffff', c1], fade: false });
    }
    if ((c.ringT -= dt) <= 0) {
      c.ringT = 0.22;
      this.spawn(new Ring(m.x, m.y, { r0: 44, r1: 6, life: 0.3, color: c1, width: 3 }));
    }
    if (c.t < ULT_CUT) return;
    this.cinematic = null;
    this.shake(6, 0.3);
    this.flash(0.06);
    m.sprite.play('Idle', { force: true });
    m.action = new c.move.Action(c.move, m, this);
  }

  ultColors(c) {
    if (c.move.cutsceneColors) return c.move.cutsceneColors;
    return c.move.type === 'fire' && c.mon.species.flame === 'blue' ? ['#6cc8ff', '#1f4cc0'] : TYPE_COLORS[c.move.type];
  }

  // Letterbox bars plus a name card in the move's type colour.
  drawUltCard(ctx, c) {
    const T = ULT_CUT, e = c.t < 0.2 ? ease(c.t / 0.2) : c.t > T - 0.2 ? ease(Math.max(0, (T - c.t) / 0.2)) : 1;
    if (c.compact && (c.mon.boss === 'rayquaza' || c.mon.boss === 'lugia')) {
      // Channel names already occupy the boss HUD. Keep the release label above the sprite.
      if (!this.bossFx?.view?.ul) {
        ctx.save(); ctx.globalAlpha = e;
        outlinedText(ctx, c.move.name.toUpperCase(), 180, 129, { size: 11, align: 'center', color: '#e4f4ed', lw: 2 });
        ctx.restore();
      }
      return;
    }
    const bar = (c.compact ? 12 : 58) * e, [c1, c2] = this.ultColors(c);
    const seed = c.move.name.split('').reduce((n,ch)=>n+ch.charCodeAt(0),0);
    ctx.save();ctx.strokeStyle=c1;ctx.globalAlpha=.32*e;ctx.lineWidth=2;
    const count=quality().particles>300?8:3;
    for(let i=0;i<count;i++){
      const a=(i/count)*Math.PI*2+c.t*(seed%2?1:-1),r=35+(seed%23)+c.t*18;
      const x=c.mon.x+Math.cos(a)*r,y=c.mon.y-c.mon.bodyZ+Math.sin(a)*r*.65;
      ctx.strokeRect(Math.round(x),Math.round(y),4+(seed+i)%7,4+(seed+i)%7);
    }
    ctx.restore();
    const v = this.view;
    ctx.fillStyle = '#05050a';
    ctx.fillRect(-v.ox, -v.oy, v.w, bar + v.oy);
    ctx.fillRect(-v.ox, WORLD_H - bar, v.w, bar + v.h);
    const slide = (1 - ease(Math.min(1, c.t / 0.3))) * WORLD_W, y = c.compact ? 190 + (c.slot ?? 0) * 60 : WORLD_H - 150;
    ctx.globalAlpha = e;
    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.moveTo(slide - 10, y);
    ctx.lineTo(slide + WORLD_W + 10, y - 16);
    ctx.lineTo(slide + WORLD_W + 10, y + 26);
    ctx.lineTo(slide - 10, y + 42);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = c1;
    ctx.fillRect(slide, y + 34, WORLD_W, 3);
    ctx.textAlign = 'center';
    ctx.font = '400 22px "Luckiest Guy"';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#111';
    ctx.fillStyle = '#fff';
    const name = c.move.name.toUpperCase();
    ctx.strokeText(name, slide + WORLD_W / 2, y + 20);
    ctx.fillText(name, slide + WORLD_W / 2, y + 20);
    ctx.font = 'italic 700 8px "Pixelify Sans"';
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(`${c.mon.boss ? 'LEGENDARY BOSS' : c.mon.trainer.name.toUpperCase()} · ${c.mon.species.name.toUpperCase()}`, slide + WORLD_W / 2, y - 6);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  playerUltimate() {
    if (this.state !== 'fighting') return;
    if (this.online?.intent) return this.online.intent('ult');
    initAudio();
    const p = this.player, ok = this.useMove(p, p.species.ultimate);
    if (!ok) {
      sfx.denied();
      if (p.ult < 100 && p.alive) this.spawn(new FloatText(p.x, p.y - p.headZ - 14, `ULTIMATE ${Math.floor(p.ult)}%`, '#c9d2de', 7));
    }
    this.ui.pressedUlt(ok);
  }

  // Key/button down on a move: chargeable moves start charging, everything else fires at once.
  playerPress(i) {
    if (this.state !== 'fighting') return;
    if (this.online?.intent) return this.online.intent('press', i);
    initAudio();
    const id = this.player.moves[i];
    if (MOVES[id]?.chargeable && this.beginCharge(this.player, id)) {
      this.ui.pressed(i, true);
      return;
    }
    this.playerMove(i);
  }

  playerRelease(i) {
    if (this.online?.intent) return this.online.intent('release', i);
    const p = this.player, id = p.moves[i];
    if (p.charging?.id === id) this.releaseCharge(p);
  }

  // Space: dodge along the held direction, or straight away from the opponent when standing still.
  playerDodge() {
    if (this.state !== 'fighting') return;
    if (this.online?.intent) return this.online.intent('dodge');
    const p = this.player, o = this.opponent, v = this.input.vector();
    const held = v.x || v.y;
    this.dodge(p, held ? v.x : p.x - o.x || 0.01, held ? v.y : p.y - o.y || 1);
  }

  dodge(mon, dx, dy, force = false) {
    if (this.state !== 'fighting') return false;
    const charge = mon.charging;
    mon.charging = null;
    if (!mon.dodge(dx, dy, force)) {
      mon.charging = charge;
      return false;
    }
    this.netSend(mon, { t: 'dodge', x: dx, y: dy });
    abilityOf(mon).onDodge?.(this, mon);
    sfx.dash();
    dustCloud(this, mon.x, mon.y, 5, 3);
    return true;
  }

  playerMove(i) {
    if (this.state !== 'fighting') return;
    initAudio();
    const id = this.player.moves[i];
    if (!id) return;
    const ok = this.useMove(this.player, id);
    // Presses during the last moments of a recovery are buffered instead of dropped.
    if (!ok && this.player.alive && !this.switching && !this.player.charging && this.moveCD(this.player, id) <= 0.25) this.buffered = { i, t: 0.3 };
    else if (!ok) sfx.denied();
    this.ui.pressed(i, ok);
  }

  playerMega() {
    if (this.state !== 'fighting') return;
    if (this.online?.intent) return this.online.intent('mega');
    if (this.story && !this.story.playerMega) return; // story: the Mega Ring comes with the eighth badge
    initAudio();
    // Pressed mid-attack: wait for the attack to finish instead of ignoring the press.
    if (!this.gimmick(this.player) && !this.playerTeam.megaUsed) this.megaQueued = 0.8;
  }

  // The once-per-battle power-up on the M key: Mega Evolution for a Pokémon that has a Mega form,
  // otherwise Terastallization. A team gets one of the two per battle.
  gimmick(mon, force = false) {
    return mon.species.mega?.length || mon.isMega ? this.megaEvolve(mon, force) : this.terastallize(mon, force);
  }

  canTera(mon) {
    return !this.raid && !mon.isMega && !mon.tera && !!mon.teraType;
  }

  // Terastallization: the Pokémon turns to crystal and becomes purely its Tera type for the rest of the
  // battle, keeping its same-type bonus for its original types (see combat.js).
  terastallize(mon, force = false) {
    const team = this.teamOf(mon);
    if (this.state !== 'fighting' || this.cinematic || !this.canTera(mon)) return false;
    if (!force && (this.switching || team.megaUsed || !mon.canAct())) return false;
    team.megaUsed = true;
    mon.tera = mon.teraType;
    this.netSend(mon, { t: 'tera', ty: mon.tera });
    const [c1, c2] = TYPE_COLORS[mon.tera];
    this.spawn(new TeraBurst(mon, c1, c2));
    this.spawn(new Ring(mon.x, mon.y, { r0: 8, r1: 70, life: 0.5, color: c1, width: 4 }));
    this.hud.callout(mon.side, `Tera ${mon.tera.toUpperCase()}!`);
    this.ui.log(`${mon.species.name} terastallized into the ${mon.tera[0].toUpperCase()}${mon.tera.slice(1)} type!`, mon.side);
    this.shake(4, 0.3);
    this.flash(0.04);
    sfx.megaBurst();
    this.recordCombat('mega', mon);
    return true;
  }

  // One Mega Evolution per trainer per battle. The battle pauses briefly while the camera zooms in.
  megaEvolve(mon, force = false) {
    const team = this.teamOf(mon);
    if (this.state !== 'fighting' || this.cinematic || !mon.species.mega?.length || mon.isMega) return false;
    if (!force && (this.switching || team.megaUsed || !mon.canAct())) return false;
    const tr = mon.trainer;
    team.megaUsed = true;
    this.netSend(mon, { t: 'mega', c: mon.megaChoice });
    if (this.raid || this.raidState || this.online?.server || this.online?.authority) {
      const id=mon.species.mega.includes(mon.megaChoice)?mon.megaChoice:mon.species.mega[0], form=SPECIES[id];
      mon.megaEvolve(form,this.sprites[form.sprite]);mon.ab={};abilityOf(mon).onEnter?.(this,mon);
      this.spawn(new MegaAura(mon,1.1));rainbowBurst(this,mon.x,mon.y,mon.bodyZ);this.hud.callout(mon.side,form.name);sfx.megaBurst();return true;
    }
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
    if (this.cinematic.kind === 'ult') return this.updateUltCutscene(dt);
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
        const mega = SPECIES[m.species.mega.includes(m.megaChoice) ? m.megaChoice : m.species.mega[0]];
        m.megaEvolve(mega, this.sprites[mega.sprite]);
        m.ab = {};
        m.form = null;
        abilityOf(m).onEnter?.(this, m);
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
    // Projectiles and callbacks still determine gameplay; visual-only objects need no server lifetime.
    if ((this.headless || this.effects.length >= (quality().particles > 500 ? 400 : 160)) && DECORATIVE_EFFECTS.has(effect.constructor.name)) return effect;
    this.effects.push(effect);
    return effect;
  }

  // `muteShake` is set while a normal (non-ultimate) move's own animation runs: moves never shake the screen or push
  // the camera in. Game events (a knockout, a clash) pass `force` to shake anyway.
  shake(mag, dur = 0.25, force = false) {
    if (this.muteShake && !force) return;
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
    if (this.muteShake) return;
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

  auraWisp(mon, colors = mon.species.aura) {
    if (mon.boss) colors = ['#ae80d9', '#50236a', '#170d26'];
    this.particles.spawn({
      x: mon.x + rand(-mon.radius, mon.radius), y: mon.y + rand(-3, 3), z: mon.z + rand(2, mon.species.headZ),
      vx: rand(-6, 6), vz: rand(14, 30), life: 0.6, size: rand(2, 3), sizeEnd: 1, colors, alpha: 0.85,
    });
  }

  // A fainted Pokémon is replaced automatically by its trainer's next healthy one; the battle ends
  // only when a whole team is down.
  onFaint(mon, by, move, net = null) {
    if (mon.remote && !net) return; // online: the other player's game says when their Pokémon faints
    if (mon.side === 'opponent' && this.story?.spare) {
      // Story Pokémon (Rayquaza…) are calmed, never knocked out.
      mon.hp = Math.max(1, mon.hp);
      this.endScripted();
      return;
    }
    if (mon.fainted) {
      // Online: their last Pokémon going down always ends the battle, even if it was already down here.
      if (net?.last && this.state === 'fighting') this.startFinale(by, mon, move);
      return;
    }
    if (this.practice) {
      mon.hp = mon.maxHp;
      return;
    }
    const team = this.teamOf(mon), next = net ? (net.last ? -1 : 0) : team.nextAlive();
    team.faintAt = this.time; // Retaliate
    this.netSend(mon, { t: 'faint', i: team.members.indexOf(mon), mv: move?.id, last: next < 0 });
    this.recordCombat('faint', mon, by);
    abilityOf(mon).onFaint?.(this, mon, by, move);
    if (!this.headless) playCry(mon.baseSpecies.dex, { rate: 0.8, gain: 0.45 });
    if (by && by !== mon && by.alive && !by.hidden) abilityOf(by).onKO?.(this, by, mon);
    onFaintExtra(this, mon, by, move); // Grudge
    // Destiny Bond: whatever knocks it out goes down with it. Resolved now, before the outcome is chosen —
    // a delayed KO was skipped whenever this was the last Pokémon, because the finale had already begun.
    const bond = mon.destinyBond > 0 && move && by && by !== mon && by.alive && !by.hidden && !by.remote && !by.boss;
    mon.faint();
    dustCloud(this, mon.x, mon.y, 16, 5);
    this.ui.log(`${mon.species.name} fainted!`, mon.side);
    this.hitstop(0.12);
    this.shake(6, 0.4, true);
    sfx.faint();
    if (bond && this.state === 'fighting') {
      this.ui.log(`${mon.species.name} took its attacker down with it!`, mon.side);
      this.spawn(new FloatText(by.x, by.y - by.headZ - 18, 'DESTINY BOND!', '#b08aff', 8));
      by.hp = 0;
      // If that was the attacker's last Pokémon too, this starts the finale with the Destiny Bond side
      // winning (it caused the final KO); the checks below then see the battle is over.
      this.onFaint(by, mon);
    }
    if (this.state !== 'fighting') return;
    if (next < 0) {
      this.startFinale(by, mon, move);
      return;
    }
    if (mon.remote) return; // their game sends in the replacement
    this.later(1.7, () => {
      if (this.state !== 'fighting' || team.active !== mon) return;
      if (team === this.playerTeam) this.switchTo(next, true);
      else this.replaceOpponent(next);
    });
  }

  // Story battles against a Pokémon that must be calmed rather than defeated end once it is worn down
  // (or after a while), straight into the next scene.
  checkSpare(dt) {
    const o = this.opponent, sp = this.story.spare;
    this.spareT += dt;
    if (!o.hidden && (o.hp <= o.maxHp * sp.hp || (sp.time && this.spareT >= sp.time))) this.endScripted();
  }

  endScripted() {
    if (this.state !== 'fighting') return;
    this.state = 'over';
    this.cinematic = null;
    this.toggleSwitchMenu(false);
    for (const m of [this.player, this.opponent]) {
      m.charging = null;
      m.cancelAction();
      m.input.x = m.input.y = 0;
    }
    this.ui.showResult(true, this.player);
  }

  // The battle is decided: stop combat and play the finishing move (if the KO earned one) and victory.
  startFinale(by, mon, move) {
    this.state = 'finale';
    this.winner = by.side;
    this.cinematic = null;
    this.toggleSwitchMenu(false);
    for (const m of [this.player, this.opponent]) m.charging = null;
    this.finale = new Finale(this, { winner: by, loser: mon, move });
  }

  updateEffects(dt, cosmeticOnly = false) {
    const list = this.effects;
    this.effects = [];
    for (const e of list) {
      if (cosmeticOnly && (e.isProjectile || e.holdInCutscene)) this.effects.push(e);
      else if (e.update(dt) !== false) this.effects.push(e);
    }
  }

  update(dt) {
    this.online?.tick(dt);
    if (this.paused) {
      this.ui.update(this, 0);
      return;
    }
    if (this.raidCards?.length) {
      for (const c of this.raidCards) c.t += dt;
      this.raidCards = this.raidCards.filter(c => c.t < ULT_CUT);
    }
    if (this.raid && !this.raid.externalClock) this.raid.tick(dt);
    // Raid boss effects follow the encounter's state (solo: right here; co-op: the server's updates).
    const boss = this.raid?.externalClock ? null : this.raid?.view() ?? this.raidState;
    if (boss) (this.bossFx ??= new BossPresenter(this)).update(dt, boss);
    else this.bossFx = null;
    if (this.state === 'cutscene') {
      // Story cutscene (cutscene.js) staged in the arena with the game's sprites and effects.
      this.director?.update(dt);
      this.updateEffects(dt);
      if(!this.headless)this.particles.update(dt);
      if(!this.headless)this.arena.update(dt);
      this.shakeT -= dt;
      this.ui.update(this, dt);
      return;
    }
    if (this.practice && this.state === 'fighting') {
      // Practice never ends: both sides are topped up.
      for (const m of [this.player, this.opponent]) if (m.hp < m.maxHp * 0.35) m.hp = m.maxHp;
    }
    if (this.hitstopT > 0 && !this.raid && !this.raidState) {
      this.hitstopT -= dt;
      this.shakeT -= dt;
      return;
    }
    if (this.slowT > 0 && !this.raid && !this.raidState) {
      this.slowT -= dt;
      dt *= 0.35;
    }
    this.flashT = Math.max(0, this.flashT - dt);
    if(!this.headless)this.red.update(dt);
    if(!this.headless)this.gold.update(dt);

    if (this.showcase) {
      this.showcase.update(dt);
      if(!this.headless)this.particles.update(dt);
      if(!this.headless)this.hud.update(dt);
      this.ui.update(this, dt);
      if (this.showcase.done) this.beginSendOut();
      return;
    }

    if (this.finale) {
      this.updateFinale(dt);
      return;
    }

    if (this.cinematic) {
      this.updateCinematic(dt);
      this.player.animate(dt);
      this.opponent.animate(dt);
      this.updateEffects(dt, true);
      if(!this.headless)this.particles.update(dt);
      if(!this.headless)this.arena.update(dt);
      if(!this.headless)this.hud.update(dt);
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
      this.foeSwitchCD = Math.max(0, (this.foeSwitchCD ?? 0) - dt);
      this.updateWeather(dt);
      tickField(this, dt);
      this.updateArenaEvents();
      this.tickSeeds(dt);
      for (const m of [this.player, this.opponent]) if (m?.alive && !m.hidden) tickVolatiles(this, m, dt);
      this.online?.processEvents();
      if (this.story?.spare) this.checkSpare(dt);
      if (!this.practice && (this.musicT -= dt) <= 0) {
        this.musicT = 0.5;
        music.play(this.battleTrack(0.5));
      }
      const v = this.input.vector();
      p.input.x = v.x;
      p.input.y = v.y;
      if (this.megaQueued > 0) {
        this.megaQueued -= dt;
        if (this.gimmick(p)) this.megaQueued = 0;
      }
      if (this.buffered) {
        this.buffered.t -= dt;
        const id = p.moves[this.buffered.i];
        if (this.useMove(p, id)) {
          this.ui.pressed(this.buffered.i, true);
          this.buffered = null;
        } else if (this.buffered.t <= 0) this.buffered = null;
      }
    } else {
      p.input.x = p.input.y = 0;
    }

    // The bot drives the opponent offline, and online when the match server plays a computer trainer.
    if ((!this.online || this.online.botFoe) && !this.raid) this.ai.update(dt, this);
    const own = this.online?.beforePlayer?.();
    p.update(dt, this);
    if (own) this.online.afterPlayer(dt, own);
    const puppet = this.online?.beforePuppet();
    this.opponent.update(dt, this);
    if (puppet) this.online.afterPuppet(dt, puppet);
    this.separate();
    this.updateEffects(dt);
    this.updateClashes();
    if(!this.headless)this.particles.update(dt);
    if(!this.headless)this.arena.update(dt);
    if(!this.headless)this.hud.update(dt);
    this.updateWinds();
    if (this.switchMenu && this.state !== 'fighting') this.toggleSwitchMenu(false);

    this.shakeT -= dt;
    this.punchT = Math.max(0, this.punchT - dt);
    this.ui.update(this, dt);
  }

  updateFinale(dt) {
    const f = this.finale;
    const sdt = f.slow ? dt * 0.35 : dt;
    f.update(dt);
    if (this.timers.length) {
      for (const tm of this.timers) tm.t -= dt;
      const due = this.timers.filter(tm => tm.t <= 0);
      this.timers = this.timers.filter(tm => tm.t > 0);
      for (const tm of due) tm.fn();
    }
    for (const m of [this.player, this.opponent]) {
      if (m !== f.winner || f.t < 1.4) m.animate(sdt);
      m.faintT += m.fainted ? sdt : 0;
    }
    if(!this.headless)this.red.update(dt);
    if(!this.headless)this.gold.update(dt);
    this.updateEffects(sdt);
    if(!this.headless)this.particles.update(sdt);
    if(!this.headless)this.arena.update(dt);
    if(!this.headless)this.hud.update(dt);
    this.shakeT -= dt;
    this.ui.update(this, dt);
    if (f.done) {
      this.finale = null;
      this.state = 'over';
      const win = this.winner === 'player';
      this.ui.showResult(win, f.winner);
      if (!win) sfx.defeat();
    }
  }

  // Weather, as in the games since Gen 6: Drizzle, Drought, Sand Stream and Snow Warning start it when their
  // Pokémon comes in, and weather moves start it; either way it lasts 25s (40s with the matching rock),
  // and the newest replaces the old. Air Lock and Cloud Nine cancel its effects while they are out.
  setWeather(w, dur = 25) {
    this.timedWeather = { w, t: dur, at: this.time };
  }

  // Terrains (Electric, Grassy, Psychic, Misty) cover the arena for a while; see combat.js and status.js.
  setTerrain(kind, dur = 20) {
    if (this.terrain?.kind !== kind) {
      const label = `${kind.toUpperCase()} TERRAIN!`;
      this.hud.showBanner(label, { color: TERRAIN_COLOR[kind], y: 300, life: 1.2, size: 15 });
      this.ui.log(`The arena became ${kind} terrain!`);
    }
    this.terrain = { kind, t: dur };
  }

  // ── Entry hazards: set on a side by Stealth Rock, Spikes, Toxic Spikes and Sticky Web; they hit each
  // Pokémon that comes in on that side. Rapid Spin clears its own side; Heavy-Duty Boots ignore them. ──
  setHazard(side, kind, by) {
    const h = this.hazards[side], max = HAZARD_MAX[kind];
    if ((h[kind] ?? 0) >= max) return false;
    h[kind] = (h[kind] ?? 0) + 1;
    const text = { rocks: 'Pointed stones float in the air', spikes: 'Spikes were scattered', toxic: 'Poison spikes were scattered', web: 'A sticky web spreads out' }[kind];
    this.ui.log(`${text} around ${side === 'player' ? 'your' : "the foe's"} side!`, by?.side);
    this.hud.showBanner(HAZARD_NAME[kind].toUpperCase(), { color: HAZARD_COLOR[kind], y: side === 'player' ? 470 : 250, life: 1, size: 12 });
    return true;
  }

  clearHazards(side, by) {
    if (!Object.values(this.hazards[side] ?? {}).some(Boolean)) return;
    this.hazards[side] = {};
    this.floatText(by, 'HAZARDS CLEARED!', '#bff3ff');
    this.ui.log(`${by.species.name} blew away the hazards!`, by.side);
  }

  applyHazards(mon) {
    const h = this.hazards?.[mon.side];
    if (!h || itemOf(mon)?.hazardProof || mon.boss) return;
    const ground = grounded(mon), say = (text, color) => {
      this.spawn(new FloatText(mon.x, mon.y - mon.headZ - 26, text, color, 7, 1.2));
      this.ui.log(`${text[0]}${text.slice(1).toLowerCase()} hit ${mon.species.name}!`, mon.side);
    };
    if (h.rocks) {
      const eff = soften(typeMultiplier('rock', typesOf(mon)));
      this.dotDamage(mon, 0.1 * eff, '#c8b080');
      for (let i = 0; i < 5; i++) this.particles.spawn({ x: mon.x + rand(-14, 14), y: mon.y, z: mon.headZ + 20, vz: -160, life: 0.35, size: rand(3, 5), colors: ['#e8dcc0', '#a08a60'] });
      say('STEALTH ROCK!', '#e8dcc0');
    }
    if (h.spikes && ground) {
      this.dotDamage(mon, [0, 0.06, 0.09, 0.12][h.spikes], '#a08050');
      say('SPIKES!', '#d8b878');
    }
    if (h.toxic && ground) {
      // A grounded Poison type soaks the toxic spikes up.
      if (typesOf(mon).includes('poison')) {
        h.toxic = 0;
        say('ABSORBED TOXIC SPIKES', '#e0a0f0');
      } else if (this.applyStatus(mon, 'poison', { dur: h.toxic > 1 ? 9 : 6 })) say('TOXIC SPIKES!', '#e0a0f0');
    }
    if (h.web && ground && this.buff(mon, 'spd', 0.75, 6)) say('STICKY WEB!', '#ffffff');
  }

  // ── Arena events: every 22s (from 18s in) the arena itself strikes: an avalanche on Mt. Silver, falling
  // trees in Viridian Forest, lava geysers on Cinnabar, a tidal surge at Seafoam, lightning in the stadium.
  // Each is marked on the ground 1.4s ahead so it can be dodged, and hits both sides. Positions come from
  // a seed both players share (eventSeed), so everyone sees the same event. ──
  updateArenaEvents() {
    const ev = ARENA_EVENTS[this.arena.theme.id];
    if (!ev || this.raid || this.raidState || this.practice || this.state !== 'fighting' || this.cinematic) return;
    const k = Math.floor((this.time - 18) / 22);
    if (k < 0 || k <= this.eventN) return;
    this.eventN = k;
    let s = (this.eventSeed + k * 0x9e3779b9) >>> 0;
    const rnd = () => ((s = (s + 0x6d2b79f5) >>> 0), (((s ^ (s >>> 15)) * (s | 1) ^ (s >>> 7)) >>> 0) / 4294967296);
    const zones = Array.from({ length: ev.n }, () => ({ x: 50 + rnd() * 260, y: 140 + rnd() * 430 }));
    this.hud.showBanner(ev.name, { color: ev.color, y: 300, life: 1.3, size: 16 });
    this.ui.log(`${ev.name[0]}${ev.name.slice(1).toLowerCase()}`);
    const marks = ev.lane
      ? zones.map(z => this.spawn(new Telegraph(0, z.y, 0, WORLD_W, ev.r, ev.rgb)))
      : zones.map(z => this.spawn(new Ring(z.x, z.y, { r0: ev.r, r1: ev.r, life: 1.4, color: ev.color, width: 2, hold: true })));
    this.later(1.4, () => {
      for (const m of marks) m.dead = true;
      if (this.state !== 'fighting') return;
      for (const z of zones) {
        ev.fx(this, z);
        for (const mon of [this.player, this.opponent]) {
          if (!mon.alive || mon.hidden || mon.untouchable) continue;
          const inside = ev.lane ? Math.abs(mon.y - z.y) <= ev.r : Math.hypot(mon.x - z.x, mon.y - z.y) <= ev.r + mon.radius * 0.5;
          if (!inside) continue;
          this.dotDamage(mon, 0.07, ev.color);
          if (ev.status && Math.random() < 0.35) this.applyStatus(mon, ev.status, {});
          this.floatText(mon, ev.hit, ev.color);
        }
      }
      this.shake(6, 0.35);
    });
  }

  // Hazards lie around the side's send-out point: floating stones, spikes, purple toxic spikes, a web.
  drawHazards(ctx) {
    const t = this.time;
    for (const [side, h] of Object.entries(this.hazards ?? {})) {
      const { x, y } = HOME[side];
      if (h.web) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#f4f8ff';
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 8; i++) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(i * Math.PI / 4) * 34, y + Math.sin(i * Math.PI / 4) * 16);
          ctx.stroke();
        }
        for (const r of [10, 20, 30]) {
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.47, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
      const ring = (n, r, draw) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.4; draw(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.45, i); } };
      if (h.spikes) ring(3 * h.spikes, 30, (px, py) => { ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.moveTo(px, py - 5); ctx.lineTo(px + 3, py + 1); ctx.lineTo(px - 3, py + 1); ctx.fill(); });
      if (h.toxic) ring(3 * h.toxic, 22, (px, py) => { ctx.fillStyle = '#a848a8'; ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px + 2.5, py + 1); ctx.lineTo(px - 2.5, py + 1); ctx.fill(); });
      if (h.rocks) ring(4, 40, (px, py, i) => {
        const bob = Math.sin(t * 2 + i) * 2, z = 16 + bob;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(px, py, 4, 1.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#b8a888'; ctx.strokeStyle = '#5a4a30'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, py - z - 6); ctx.lineTo(px + 4, py - z); ctx.lineTo(px, py - z + 4); ctx.lineTo(px - 4, py - z); ctx.closePath(); ctx.fill(); ctx.stroke();
      });
    }
  }

  updateWeather(dt) {
    const field = [this.player, this.opponent].filter(m => m?.alive && !m.hidden);
    // A weather ability starts its weather once each time its Pokémon (or its Mega form) comes in.
    for (const m of field) {
      const ab = abilityOf(m), key = `${m.species.id}:${m.enteredAt}`;
      if (!ab.weather || ab.weather === 'delta' || m.abWeatherKey === key || m.remote) continue;
      m.abWeatherKey = key;
      this.abilityPop(m, WEATHER_START[ab.weather]);
      this.setWeather(ab.weather, ITEMS[m.item]?.rock === ab.weather ? 40 : 25);
    }
    if (this.timedWeather && (this.timedWeather.t -= dt) <= 0) {
      this.ui.log(WEATHER_END[this.timedWeather.w]);
      this.timedWeather = null;
    }
    let w = this.timedWeather?.w ?? null;
    if (w && field.some(m => abilityOf(m).noWeather)) w = null;
    if (w !== this.weather && w) {
      const label = WEATHER_START[w];
      this.hud.showBanner(label.toUpperCase(), { color: '#ffffff', y: 300, life: 1.2, size: 15 });
      this.ui.log(label);
    }
    if (w !== this.weather) this.emit('weather', { from: this.weather, to: w });
    this.weather = w;
    if (this.terrain && (this.terrain.t -= dt) <= 0) {
      this.ui.log('The terrain returned to normal.');
      this.terrain = null;
    }
    // Grassy Terrain mends grounded Pokémon a little every 1.5s.
    if (this.terrain?.kind === 'grassy' && (this.terrainT = (this.terrainT ?? 0) + dt) >= 1.5) {
      this.terrainT = 0;
      for (const m of field) if (grounded(m) && m.hp < m.maxHp) this.heal(m, m.maxHp * 0.015);
    }
    if (!w) return;
    const n = w === 'rain' ? 4 : w === 'sand' ? 3 : w === 'snow' ? 2 : w === 'hail' ? 3 : 0;
    for (let i = 0; i < n; i++) {
      if (w === 'rain') this.particles.spawn({ x: rand(-20, 380), y: rand(60, 640), z: 120, vx: -40, vz: -420, life: 0.28, size: 1.5, colors: ['#bfe6ff', '#8fc8f0'] });
      else if (w === 'snow') this.particles.spawn({ x: rand(-20, 380), y: rand(60, 640), z: rand(60, 120), vx: rand(-20, 10), vz: rand(-60, -40), life: 1.6, size: rand(1.5, 2.5), colors: ['#ffffff', '#e0f4ff'] });
      else if (w === 'hail') this.particles.spawn({ x: rand(-20, 380), y: rand(60, 640), z: 120, vx: -30, vz: -300, life: 0.4, size: rand(2, 3), colors: ['#ffffff', '#c8ecff'] });
      else this.particles.spawn({ x: rand(-40, 360), y: rand(60, 640), z: rand(2, 40), vx: rand(160, 240), vy: rand(-10, 20), life: 0.5, size: rand(1.5, 2.5), colors: ['#e8d8b0', '#c8b080'] });
    }
    // Sandstorm: 1/16 of max HP every 3s (a "turn") to anything that isn't Rock, Ground or Steel.
    if (w === 'sand' && (this.weatherT += dt) >= 3) {
      this.weatherT = 0;
      for (const m of field) {
        const ab = abilityOf(m), immune = typesOf(m).some(t => t === 'rock' || t === 'ground' || t === 'steel') || ab.sandProof || ab.weather === 'sand' || ITEMS[m.item]?.id === 'safetyGoggles';
        if (!immune) {
          this.dotDamage(m, 1 / 16, '#c8b080');
          this.ui.log(`${m.species.name} is buffeted by the sandstorm!`, m.side);
        }
      }
    }
    // Hail: 1/16 of max HP every 3s to anything that isn't an Ice type.
    if (w === 'hail' && (this.weatherT += dt) >= 3) {
      this.weatherT = 0;
      for (const m of field) {
        const ab = abilityOf(m);
        if (!typesOf(m).includes('ice') && !ab.weather && ITEMS[m.item]?.id !== 'safetyGoggles') {
          this.dotDamage(m, 1 / 16, '#c8ecff');
          this.ui.log(`${m.species.name} is buffeted by the hail!`, m.side);
        }
      }
    }
    for (const m of field) abilityOf(m).weatherTick?.(this, m, dt, w);
  }

  // A terrain tints the arena floor in its colour, with faint motes drifting up from it.
  drawTerrain(ctx) {
    const t = this.terrain;
    if (!t) return;
    const fade = Math.min(1, t.t / 1.5);
    ctx.save();
    ctx.globalAlpha = 0.16 * fade;
    ctx.fillStyle = TERRAIN_COLOR[t.kind];
    ctx.fillRect(0, 60, WORLD_W, WORLD_H - 60);
    ctx.restore();
    if (Math.random() < 0.35 * fade) this.particles.spawn({ x: rand(0, WORLD_W), y: rand(80, WORLD_H), z: 1, vz: rand(14, 26), life: 1.2, size: rand(1.5, 2.5), sizeEnd: 0.5, colors: ['#ffffff', TERRAIN_COLOR[t.kind]] });
  }

  // Attacks meeting attacks: element reactions decide the winner first (fire melts ice, water douses
  // fire…); otherwise raw power decides, with a cancel when they are close. Each pair reacts once.
  updateClashes() {
    const shots = this.effects.filter(e => e.isProjectile && e.move && e.user && !e.dead && e.move.power >= 20);
    for (let i = 0; i < shots.length; i++) {
      for (let j = i + 1; j < shots.length; j++) {
        const a = shots[i], b = shots[j];
        if (a.dead || b.dead || a.user.side === b.user.side) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius + 4) continue;
        this.resolveMeeting(a, b, (a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(a.z, b.z));
      }
    }
    // Beams, streams and Rapid Spin against incoming projectiles.
    for (const mon of [this.player, this.opponent]) {
      const act = mon.action;
      if (!act || act.done) continue;
      const line = act.firing && (act.move.beam || act.move.stream);
      if (!line && !act.spinning) continue;
      for (const p of shots) {
        if (p.dead || p.user.side === mon.side || p.reacted.has(act)) continue;
        const hit = act.spinning ? Math.hypot(p.x - mon.x, p.y - mon.y) <= act.move.spin.radius + p.radius + 4
          : rayDist(p.x, p.y, mon.x, mon.y, act.aim, act.move.range) <= (line.width ?? 10) + p.radius;
        if (!hit) continue;
        p.reacted.add(act);
        this.resolveAgainstAttack(act, mon, p);
      }
    }
    const A = this.player.action, B = this.opponent.action;
    if (A?.firing && B?.firing && A.move.beam && B.move.beam && !A.clashed && !B.clashed && !A.hitDone && !B.hitDone) {
      const diff = Math.abs(Math.atan2(Math.sin(A.aim - B.aim), Math.cos(A.aim - B.aim)));
      if (diff > Math.PI - 0.6) {
        A.clashed = B.clashed = true;
        const r = reactionBetween(A.move.type, B.move.type);
        const pa = A.move.power * (r?.win === A.move.type ? 1.6 : 1), pb = B.move.power * (r?.win === B.move.type ? 1.6 : 1);
        const win = pa / pb > 1.25 ? A : pb / pa > 1.25 ? B : null;
        const from = A.mouth(), to = B.mouth();
        const x = (from.x + to.x) / 2, y = (from.y + to.y) / 2, z = (from.z + to.z) / 2;
        const reaction = win && r?.win === win.move.type ? r : null;
        if (!this.headless) {
          A.showClashAt(x, y - z, win === A);
          B.showClashAt(x, y - z, win === B);
        }
        this.clashFx(x, y, z, {
          a: A.move.type, b: B.move.type, winner: win === A ? 'a' : win === B ? 'b' : null,
          kind: 'beam',
          angle: Math.atan2(to.y - to.z - (from.y - from.z), to.x - from.x),
          span: Math.hypot(to.x - from.x, to.y - to.z - (from.y - from.z)) / 2,
          colors: [A.move.beam.colors[1], B.move.beam.colors[1]],
          label: reaction?.label, color: reaction?.color,
        });
        for (const act of [A, B]) {
          if (act === win) continue;
          act.hitDone = true;
          act.user.stagger = Math.max(act.user.stagger, 0.35);
          act.user.vx -= Math.cos(act.aim) * 140;
          act.user.vy -= Math.sin(act.aim) * 140;
        }
      }
    }
  }

  // Two projectiles meet.
  resolveMeeting(a, b, x, y, z) {
    const r = reactionBetween(a.elem, b.elem);
    const clash = { a: a.elem, b: b.elem, kind: 'shot', angle: a.angle };
    if (r) {
      let W = r.win === a.elem ? a : b, L = W === a ? b : a;
      // A much stronger attack still bulldozes through a type disadvantage.
      if (L.move.power > W.move.power * 2.2) {
        [W, L] = [L, W];
        this.clashFx(x, y, z, { ...clash, winner: W === a ? 'a' : 'b' });
        L.impact(false);
        setPower(W, W.move.power * 0.7);
        return;
      }
      this.reactFx(x, y, z, r, { ...clash, winner: W === a ? 'a' : 'b' });
      L.impact(false);
      setPower(W, r.combine ? (W.move.power + L.move.power) * 0.75 : W.move.power * r.keep, r.status && { status: r.status });
      if (r.combine) W.s = { ...W.s, scale: (W.s?.scale ?? 1) * 1.4 };
      return;
    }
    const pa = a.move.power, pb = b.move.power;
    this.clashFx(x, y, z, { ...clash, winner: pa / pb > 1.3 ? 'a' : pb / pa > 1.3 ? 'b' : null });
    if (pa / pb > 1.3) {
      b.impact(false);
      setPower(a, pa * 0.6);
    } else if (pb / pa > 1.3) {
      a.impact(false);
      setPower(b, pb * 0.6);
    } else {
      a.impact(false);
      b.impact(false);
    }
  }

  // A projectile flies into a beam, stream or Rapid Spin.
  resolveAgainstAttack(act, mon, p) {
    const elem = act.move.type, r = reactionBetween(elem, p.elem);
    const x = p.x, y = p.y, z = p.z;
    const clash = { a: elem, b: p.elem, kind: 'block', angle: p.angle + Math.PI };
    if (r && r.win === p.elem) {
      // The projectile's element wins: it douses a stream or punches through the spin.
      this.reactFx(x, y, z, r, { ...clash, winner: 'b' });
      if (act.move.stream) act.finish(0.2);
      setPower(p, p.move.power * (r.combine ? 1.3 : r.keep), r.status && { status: r.status });
      return;
    }
    if (act.spinning && !r) {
      // Rapid Spin bats the projectile back at its owner.
      p.angle += Math.PI;
      p.user = mon;
      p.target = mon.foe;
      p.traveled = 0;
      this.showClashImpact(x, y, z, { ...clash, kind: 'spin', angle: p.angle, winner: 'a', label: 'DEFLECTED!', color: '#bfe6ff' });
      this.spawn(new FloatText(x, y - z - 10, 'DEFLECTED!', '#bfe6ff', 8));
      waterSplash(this, x, y);
      return;
    }
    const block = { ...clash, winner: 'a' };
    if (r) this.reactFx(x, y, z, r, block);
    else this.clashFx(x, y, z, { ...block, label: 'BLOCKED!' });
    p.impact(false);
  }

  reactFx(x, y, z, r, clash = null) {
    const FX = {
      steam: () => {
        for (let i = 0; i < 18; i++) this.particles.spawn({ x, y, z, vx: rand(-60, 60), vy: rand(-40, 40), vz: rand(30, 90), drag: 2, life: 0.8, size: rand(4, 7), sizeEnd: 10, colors: ['#ffffff', '#e8eef5'] });
        this.marks.wet(x, y, 12);
      },
      shock: () => {
        electricBurst(this, x, y, z, 22);
        this.marks.burn(x, y, 12);
      },
      frost: () => {
        iceShatter(this, x, y, z);
        this.marks.frost(x, y, 14);
      },
      ember: () => {
        for (let i = 0; i < 16; i++) this.particles.spawn({ x, y, z, vx: rand(-70, 70), vy: rand(-50, 50), vz: rand(20, 90), life: 0.5, size: rand(3, 5), sizeEnd: 1, colors: FIRE });
        this.marks.scorch(x, y, 12);
      },
      dust: () => dustCloud(this, x, y, 10, 5),
      spark: () => this.spawn(new Glow(x, y, z, 30, [255, 255, 255], 0.3)),
    };
    (FX[r.fx] ?? FX.spark)();
    if (clash) this.showClashImpact(x, y, z, { ...clash, color: r.color, label: r.label });
    else this.spawn(new Ring(x, y, { z, r0: 4, r1: 46, life: 0.4, color: r.color, width: 4, layer: 'air' }));
    this.spawn(new FloatText(x, y - z - 12, r.label, r.color, 8));
    this.hitstopT = Math.max(this.hitstopT, 0.04);
    if (r.combine) this.slowT = 0.25;
    sfx.reaction(r.id);
  }

  showClashImpact(x, y, z, clash) {
    if (!this.headless) this.spawn(new ClashImpact(x, y, z, clash));
    this.emit('clash', clash);
  }

  clashFx(x, y, z, clash) {
    const big = clash.kind === 'beam';
    const label = clash.label ?? (clash.winner ? 'OVERPOWERED!' : 'CLASH!');
    this.showClashImpact(x, y, z, { ...clash, label });
    this.spawn(new FloatText(x, y - z - 19, label, clash.color ?? '#fff6df', big ? 10 : 8));
    this.marks.fracture(x, y, big ? 30 : 16, 5);
    this.hitstopT = Math.max(this.hitstopT, 0.06);
    this.slowT = big ? 0.45 : 0.25;
    this.shake(big ? 10 : 6, 0.4, true);
    sfx.explosion();
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
    const wa = b.boss ? 1 : a.boss ? 0 : b.species.weight / (a.species.weight + b.species.weight);
    a.x -= (dx / d) * overlap * wa;
    a.y -= (dy / d) * overlap * wa;
    b.x += (dx / d) * overlap * (1 - wa);
    b.y += (dy / d) * overlap * (1 - wa);
    a.clamp();
    b.clamp();
  }

  // Camera: normally the whole arena; during Mega Evolution it zooms onto the evolving Pokémon.
  camera() {
    if (this.finale) {
      const f = this.finale.focus();
      return { zoom: f.zoom, cx: f.x, cy: f.y, dim: f.dim };
    }
    const c = this.cinematic;
    if (!c && this.punchT > 0 && this.punchAt) {
      const e = Math.sin(Math.PI * (1 - this.punchT / this.punchDur)), zoom = 1 + this.punchAmt * e;
      return { zoom, cx: WORLD_W / 2 + (this.punchAt.x - WORLD_W / 2) * e, cy: WORLD_H / 2 + (this.punchAt.y - WORLD_H / 2) * e, dim: 0 };
    }
    if (!c) return { zoom: 1, cx: WORLD_W / 2, cy: WORLD_H / 2, dim: 0 };
    const ult = c.kind === 'ult', end = ult ? ULT_CUT - 0.25 : 1.45;
    const e = c.t < 0.3 ? ease(c.t / 0.3) : c.t > end ? ease(Math.max(0, 1 - (c.t - end) / 0.25)) : 1;
    const zoom = 1 + (ult ? 0.75 + 0.2 * Math.min(1, c.t / ULT_CUT) : 0.6) * e;
    return {
      zoom,
      cx: WORLD_W / 2 + (c.mon.x - WORLD_W / 2) * e,
      cy: WORLD_H / 2 + (c.mon.y - c.mon.bodyZ - WORLD_H / 2) * e,
      dim: (ult ? 0.6 : 0.45) * e,
    };
  }

  // World point → page (CSS) coordinates; used to place tutorial prompts next to a Pokémon.
  toScreen(x, y) {
    const r = this.canvas.getBoundingClientRect(), v = this.view, sc = r.width / v.w;
    return { x: r.left + (v.ox + x) * sc, y: r.top + (v.oy + y) * sc, scale: sc };
  }

  presentedActor(mon) {
    const visual=this.bossFx?.ultimateVisual;
    if(!visual)return mon;
    if(mon===this.opponent)return visual.user;
    if(mon===visual.liveTarget&&visual.showingTarget)return visual.target;
    return mon;
  }

  renderCutscene() {
    const { ctx, k } = this, d = this.director, v = this.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!d) return;
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      const m = this.shakeMag * (this.shakeT / this.shakeDur);
      sx = Math.round((Math.random() * 2 - 1) * m);
      sy = Math.round((Math.random() * 2 - 1) * m);
    }
    const cam = d.camera();
    // Whole-pixel scale only: zoom is drawn at the nearest step where every sprite pixel stays square and even.
    const s = Math.max(k, Math.round(k * cam.zoom)), z = s / k;
    ctx.setTransform(s, 0, 0, s, Math.round((v.w / 2 - cam.cx * z + sx) * k), Math.round((v.h / 2 - cam.cy * z + sy) * k));
    this.arena.drawBackdrop(ctx);
    this.arena.drawGround(ctx);
    d.drawGround(ctx);
    for (const e of this.effects) if (e.layer === 'ground') e.draw(ctx);
    this.particles.draw(ctx, 'ground');
    const actors = d.list().map(a=>this.presentedActor(a)).sort((a,b)=>a.y-b.y);
    for (const a of actors) a.drawShadow(ctx);
    for(const a of actors)a.draw(ctx);
    drawBossShield(ctx, this.bossFx?.view, this.opponent);
    for (const e of this.effects) if (e.layer === 'air') e.draw(ctx);
    this.particles.draw(ctx, 'air');
    this.arena.drawSnow(ctx);
    for (const e of this.effects) if (e.layer === 'top') e.draw(ctx);
    d.drawOver(ctx, v);
  }

  render() {
    if (this.state === 'cutscene') return this.renderCutscene();
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
    const cam = this.camera(), v = this.view;
    const s = k * cam.zoom;
    ctx.setTransform(s, 0, 0, s,
      Math.round((v.ox + WORLD_W / 2 - cam.cx * cam.zoom + sx) * k),
      Math.round((v.oy + WORLD_H / 2 - cam.cy * cam.zoom + sy) * k));
    this.arena.drawBackdrop(ctx);
    this.arena.drawGround(ctx);
    this.drawTerrain(ctx);
    drawField(this, ctx);
    this.drawHazards(ctx);
    if (cam.dim > 0) {
      ctx.fillStyle = `rgba(14,10,30,${cam.dim})`;
      ctx.fillRect(-1600, -1600, WORLD_W + 3200, WORLD_H + 3200);
    }
    for (const e of this.effects) if (e.layer === 'ground') e.draw(ctx);
    drawBossGround(ctx, this.bossFx?.view, this.opponent);
    if(this.player.alive&&!this.player.hidden)drawCosmeticAura(ctx,this.player.x,this.player.y,this.cosmetics?.aura,this.time);
    this.particles.draw(ctx, 'ground');
    const actors = [this.player,this.opponent,this.red,this.gold,...(this.raidAlly?[this.raidAlly]:[])].map(a=>this.presentedActor(a)).sort((a,b)=>a.y-b.y);
    for (const a of actors) a.drawShadow(ctx);
    for(const a of actors)a.draw(ctx);
    drawBossShield(ctx, this.bossFx?.view, this.opponent);
    if (this.state === 'fighting') this.hud.drawTags(ctx);
    for (const e of this.effects) if (e.layer === 'air') e.draw(ctx);
    this.particles.draw(ctx, 'air');
    this.arena.drawSnow(ctx);
    for (const e of this.effects) if (e.layer === 'top') e.draw(ctx);
    if (this.finale?.slow) this.finale.drawLines(ctx);
    if (this.weather === 'sun') {
      ctx.fillStyle = 'rgba(255,190,90,0.10)';
      ctx.fillRect(-1600, -1600, WORLD_W + 3200, WORLD_H + 3200);
    }
    if (this.flashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.7, this.flashT * 6)})`;
      ctx.fillRect(-1600, -1600, WORLD_W + 3200, WORLD_H + 3200);
    }

    // Screen-space overlays (HUD, cutscene cards) sit over the arena column.
    ctx.setTransform(k, 0, 0, k, Math.round(v.ox * k), Math.round(v.oy * k));
    this.hud.draw(ctx);
    drawBossHud(ctx, this.bossFx?.view, this.bossFx);
    if (this.cinematic?.kind === 'ult') this.drawUltCard(ctx, this.cinematic);
    this.raidCards?.forEach((c, slot) => this.drawUltCard(ctx, { ...c, slot }));
    if (this.showcase) this.showcase.draw(ctx);
    if (this.finale) this.finale.draw(ctx);
  }

  resize() {
    const stage = this.canvas.parentElement, touch = document.body.classList.contains('touch');
    const vw = window.innerWidth, vh = window.visualViewport?.height ?? window.innerHeight;
    stage.style.width = `${vw}px`;
    stage.style.height = `${vh}px`;
    // Side panel (desktop) floats over the scenery on the right; keep the arena clear of it.
    const panel = !touch && vw >= 760 ? PANEL_W + 12 : 0;
    let w, h, ox, oy;
    if (vw / vh >= WORLD_W / WORLD_H) {
      h = WORLD_H;
      w = (WORLD_H * vw) / vh;
      const pw = (panel * WORLD_H) / vh;
      ox = Math.max(0, (w - pw - WORLD_W) / 2);
      if (ox * 2 + WORLD_W > w) ox = (w - WORLD_W) / 2;
      oy = 0;
    } else {
      w = WORLD_W;
      h = (WORLD_W * vh) / vw;
      ox = 0;
      oy = touch ? 0 : (h - WORLD_H) / 2;
    }
    this.view = { w, h, ox, oy };
    document.body.classList.toggle('with-panel', panel > 0);
    // Whole-number render scale; capped (lower on phones) since extra pixels cost fill rate.
    const cssScale = vh / h;
    this.k = Math.max(1, Math.min(quality().ratio, touch ? 2 : 3, Math.round(cssScale * (devicePixelRatio || 1))));
    this.menuRenderDirty = true;
    const width = Math.ceil(w * this.k), height = Math.ceil(h * this.k);
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.particles.max = touch ? 450 : 1200;
  }

  run() {
    let last = null;
    const frame = now => {
      // Scheduled first so an unexpected error in one frame can't stop the game loop for good.
      requestAnimationFrame(frame);
      const frameMs = last === null ? 0 : now - last;
      const dt = Math.min(0.05, frameMs / 1000);
      last = now;
      if (document.hidden) {
        last = null;
        return;
      }
      // The opening has its own animation loop. Team/title menus only need a static arena behind them.
      if (this.state === 'menu' || this.state === 'select') {
        if (this.menuRenderDirty || this.lastRenderedState !== this.state) {
          this.render(); this.menuRenderDirty=false; this.lastRenderedState=this.state;
        }
        return;
      }
      this.lastRenderedState=this.state;
      const start = performance.now();
      this.update(dt);
      const updated = this.profile ? performance.now() : 0;
      this.render();
      const rendered = performance.now();
      if (observeFrame(rendered - start, frameMs)) this.resize();
      if (this.profile) {
        this.profile.push([frameMs, updated - start, rendered - updated]);
        if (this.profile.length > 3600) this.profile.shift();
      }
    };
    requestAnimationFrame(frame);
  }
}
