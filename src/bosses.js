import { bossUltimateVisual } from './raid-cinematics.js';
import { SPECIES } from './data/species.js';
import { LEGENDARY_SKINS, SKIN_NAMES, SHADOW_LUGIA } from './data/skins.js';
import { MOVES } from './moves.js';
import { applyHit } from './combat.js';
import { BOUNDS } from './arena.js';
import { dirFromVector } from './sprite.js';
import { quality } from './quality.js';
import { Slipstream, PressureWave, ElementColumn, RaidAreaBurst, NovaGather } from './legendary-effects.js';
import { drawRaidSigil, drawRaidGroundAura, drawNaturalCharge, LegendaryBeam, PsychicBeam, AeroblastBeam, RaidBurst, bossMouth } from './raid-art.js';
import { outlinedText } from './draw.js';
import { sfx } from './audio.js';
import { Ring, Pillar, ScreenDim, Falling, TidalWave, Lightning, BeamLine, EnergyAura, MegaAura, PsyDome, StormCloud, rainbowBurst, debris, dustCloud, electricBurst, waterSplash, rand } from './effects.js';

// Legendary raids. BossEncounter is the authority (in the browser for solo raids, on the match server
// for co-op): it moves the boss, picks attacks, and decides which hazards hit whom. Screens only draw
// its state (drawBossGround / drawBossHud) and add effects from the same data (BossPresenter), so two
// co-op players always see the same fight and the server never spends time on visuals.

export const RAID_DIFFICULTY = {
  easy: { label: 'EASY', hp: 0.7, dmg: 0.7, tele: 1.25, gap: 1.25, extra: -1 },
  normal: { label: 'NORMAL', hp: 1, dmg: 1, tele: 1, gap: 1, extra: 0 },
  hard: { label: 'HARD', hp: 1.4, dmg: 1.35, tele: 0.85, gap: 0.82, extra: 1 },
  legendary: { label: 'LEGENDARY', hp: 1.9, dmg: 1.7, tele: 0.72, gap: 0.68, extra: 2 },
};

// Boss HP fractions where stages 2, 3 and 4 begin. Each stage has its own attack rotation; stage 4
// opens with the boss's arena-wide cataclysm.
const STAGE_AT = [0.75, 0.5, 0.25];
const INTRO = 3.6, TRANSITION = 2.2, MAX_HAZARDS = 18;
const HOMES = [[180, 205], [110, 240], [250, 240], [180, 275], [128, 185], [232, 185]];

export const BOSSES = {
  rayquaza: {
    name: 'Dark Rayquaza', title: 'SOVEREIGN OF THE SKY', arena: 'skyPillar', type: 'dragon', color: '#75f5b1', rgb: [117, 245, 177], scale: 1.9,
    stages: ['SKY PATROL', 'DRAGON DANCE', 'DELTA STREAM', 'FINAL ASCENT'],
    attacks: [['meteor', 'dive', 'dragonBeam'], ['dive', 'meteor', 'dragonBeam', 'slam', 'ultimate'], ['dive', 'meteor', 'ultimate', 'ring', 'dive', 'lanes'], ['cataclysm', 'dive', 'meteor', 'ultimate', 'dragonBeam', 'dive', 'meteor']],
    cataclysm: 'DRACO SKYFALL', nova: 'TEMPEST VORTEX', ultimate: 'DRAGON ASCENT', ultImpact: [1.38, 1.53], ultDuration: 3,
    anims: { wind: { quake: 'RearUp', meteor: 'Roar', cataclysm: 'Roar' }, strike: { nova: 'Roar', cataclysm: 'Roar', tidal: 'Attack' } },
  },
  mewtwo: {
    name: 'Armored Mewtwo', title: 'THE GENETIC STORM', arena: 'rocketLab', type: 'psychic', color: '#e2a3ff', rgb: [226, 163, 255], scale: 2.6,
    stages: ['AWAKENING', 'MIND OVER MATTER', 'PSYCHIC STORM', 'GENESIS'],
    attacks: [['orbs', 'slam', 'rows'], ['orbs', 'ring', 'cross', 'orbs', 'ultimate'], ['quake', 'orbs', 'ultimate', 'cross', 'ring'], ['cataclysm', 'orbs', 'quake', 'ultimate', 'cross', 'orbs', 'ring']],
    cataclysm: 'PSYCHIC COLLAPSE', ultimate: 'PSYSTRIKE', ultImpact: [3.2, 3.2], ultDuration: 4.3,
    anims: { wind: { quake: 'Pose', meteor: 'Pose', cataclysm: 'Pose' }, strike: { default: 'SpAttack', quake: 'Attack', nova: 'Pose', cataclysm: 'Pose', tidal: 'Attack' } },
  },
  lugia: {
    name: 'Shadow Lugia', title: 'GUARDIAN OF THE TIDES', arena: 'shadowCitadel', type: 'water', color: SHADOW_LUGIA.color, rgb: SHADOW_LUGIA.rgb, scale: 1.9,
    stages: ['CALM SEAS', 'RISING TIDE', 'MAELSTROM', 'HYDRO TEMPEST'],
    attacks: [['tidal', 'storm', 'waterPulse', 'lanes'], ['tidal', 'storm', 'aeroblast', 'waterPulse', 'rows', 'ultimate'], ['aeroblast', 'waterPulse', 'tidal', 'ultimate', 'storm', 'ring'], ['cataclysm', 'tidal', 'storm', 'waterPulse', 'ultimate', 'aeroblast', 'tidal', 'storm']],
    cataclysm: 'HYDRO DELUGE', ultimate: 'AEROBLAST', ultImpact: [1.3, 1.3], ultDuration: 2.1,
    // Lugia never spins: it holds its wings open to charge, fires with Shoot and beats its wings to strike.
    anims: { wind: { default: 'Charge' }, strike: { default: 'Shoot', quake: 'Attack', tidal: 'Attack', dive: 'Attack', nova: 'Attack', cataclysm: 'Attack' } },
  },
};

// Attack patterns. `shape` decides who is hit (see hazardHits), `at` where the hazards go, `fx` which
// effects screens play when they land. Everything is telegraphed for at least 0.9 s.
//   circle · ring (safe inside r0) · lane (column) · row · cross · line · cover (all but the safe circles)
const ATTACKS = {
  slam: { label: 'GROUND SLAM', hint: 'GET CLEAR', shape: 'circle', r: 82, tele: 1.4, power: 150, at: 'target', fx: 'quake' },
  quake: { label: 'SHOCKWAVE', hint: 'GET AWAY FROM IT', shape: 'circle', r: 125, tele: 1.6, power: 140, at: 'boss', fx: 'quake' },
  meteor: { label: 'METEOR STORM', hint: 'KEEP MOVING', shape: 'circle', r: 42, tele: 1.7, power: 125, at: 'scatter', count: 4, step: 0.15, fx: 'meteor', vuln: 1.8 },
  lanes: { label: 'SKY PILLARS', hint: 'LEAVE THE COLUMN', shape: 'lane', r: 30, tele: 1.4, power: 140, at: 'lanes', count: 2, fx: 'pillar' },
  rows: { label: 'PSY WAVE', hint: 'LEAVE THE ROW', shape: 'row', r: 32, tele: 1.4, power: 140, at: 'rows', count: 1, fx: 'beam' },
  ring: { label: 'NOVA BURST', hint: 'GET UNDER IT', shape: 'ring', r0: 72, r: 360, tele: 2.0, power: 170, at: 'boss', fx: 'nova' },
  cross: { label: 'CROSS BEAM', hint: 'DODGE THE CROSS', shape: 'cross', r: 28, tele: 1.5, power: 150, at: 'boss', fx: 'beam' },
  dive: { label: 'DRAGON DIVE', hint: 'SIDESTEP', shape: 'line', r: 38, tele: 1.25, power: 190, at: 'line', fx: 'dive', vuln: 2.6, dash: true },
  orbs: { label: 'PSYSTRIKE', hint: 'STEP OUT', shape: 'circle', r: 32, tele: 1.4, power: 125, at: 'orbs', count: 5, fx: 'psy' },
  tidal: { label: 'TIDAL WAVE', hint: 'STAY DRY — WET TARGETS CONDUCT', shape: 'row', r: 75, tele: 1.5, power: 70, at: 'rows', count: 1, type: 'water', fx: 'tidal' },
  storm: { label: 'THUNDERSTORM', hint: 'MOVE', shape: 'circle', r: 56, tele: 1.3, power: 130, at: 'each', type: 'electric', fx: 'storm', step: 0.2 },
  aeroblast: { label: 'AEROBLAST', hint: 'SIDESTEP', shape: 'line', r: 40, tele: 1.4, power: 180, at: 'line', fx: 'beam', vuln: 2 },
  dragonBeam: { label: 'DRAGON PULSE', hint: 'SIDESTEP THE BEAM', shape: 'line', r: 26, tele: 1.65, power: 155, at: 'line', fx: 'beam', vuln: 1.5 },
  waterPulse: { label: 'WATER PULSE', hint: 'SIDESTEP THE BEAM', shape: 'line', r: 26, tele: 1.65, power: 155, at: 'line', fx: 'beam', type: 'water', vuln: 1.5 },
  cataclysm: { hint: 'FIND COVER', shape: 'cover', r: 46, tele: 2.6, power: 240, at: 'cover', count: 2, fx: 'cataclysm', vuln: 3.2 },
  // Not a hazard: the boss channels its signature move behind a barrier (see startUlt).
  ultimate: { fx: 'ultimate', hint: 'BREAK THE SHIELD!' },
};

// The boss's ultimate: channelled for a few seconds behind a barrier worth a share of its max HP.
// Break the barrier and the ultimate is cancelled and the boss is staggered; let it finish and it hits
// every player for a share of their max HP, dodge or not.
const ULT = { channel: 6.5, barrier: 0.05, stagger: 4, share: { easy: 0.4, normal: 0.55, hard: 0.7, legendary: 0.85 } };

export const attackLabel = (bossId, k) => (k === 'ring' ? BOSSES[bossId]?.nova ?? ATTACKS.ring.label : k === 'cataclysm' || k === 'ultimate' ? BOSSES[bossId]?.[k] : ATTACKS[k]?.label) ?? '';
export const attackHint = k => ATTACKS[k]?.hint ?? '';

// Small seeded random numbers, so a boss's patterns don't depend on Math.random.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampX = x => Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, x));
const clampY = y => Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, y));

function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

export function hazardHits(h, x, y) {
  switch (h.s) {
    case 'circle': return Math.hypot(x - h.x, y - h.y) < h.r;
    case 'ring': { const d = Math.hypot(x - h.x, y - h.y); return d > h.r0 && d < h.r; }
    case 'lane': return Math.abs(x - h.x) < h.r;
    case 'row': return Math.abs(y - h.y) < h.r;
    case 'cross': return Math.abs(x - h.x) < h.r || Math.abs(y - h.y) < h.r;
    case 'line': return segDist(x, y, h.x, h.y, h.x2, h.y2) < h.r;
    case 'cover': return !h.safe.some(([sx, sy, sr]) => Math.hypot(x - sx, y - sy) < sr);
  }
  return false;
}

// The boss on the field: larger, tougher to push around, and drawn bigger. Used by the encounter and,
// online, by the screens (which receive the boss's HP from the server).
export function dressBoss(mon, id, hp = mon.maxHp, sprites = {}) {
  const def = BOSSES[id], s = SPECIES[mon.species.id] ?? mon.baseSpecies, k = def.scale;
  mon.species = {
    ...mon.species, hp, weight: 100, radius: s.radius * k, bodyZ: s.bodyZ * k, headZ: s.headZ * k,
    shadow: s.shadow.map(v => v * k), mouth: s.mouth && { ...s.mouth, z: s.mouth.z * k, fwd: s.mouth.fwd * k },
    fly: s.fly && { ...s.fly, height: s.fly.height * k },
  };
  const skin = LEGENDARY_SKINS[s.sprite];
  if (skin && sprites[skin]) {
    mon.species.sprite = skin;
    mon.species.name = SKIN_NAMES[s.id] ?? def.name;
    mon.setSheet(sprites[skin]);
    mon.portrait = sprites[skin].portrait;
  }
  mon.boss = id;
  mon.drawScale = k;
  mon.launch = () => false;
  return mon;
}

export function evolveRaidBoss(mon, id, sprites) {
  const formId = { rayquaza: 'rayquazaMega', mewtwo: 'mewtwoMegaY' }[id];
  if (!formId || mon.isMega) return false;
  const form = SPECIES[formId], hp = mon.hp, maxHp = mon.maxHp;
  mon.megaEvolve({ ...form, hp: maxHp }, sprites[form.sprite]);
  dressBoss(mon, id, maxHp, sprites);
  mon.hp = hp;
  mon.ab = {};
  return true;
}

export class BossEncounter {
  constructor(games, id, { difficulty = 'normal' } = {}) {
    this.games = games;
    this.id = id;
    this.def = BOSSES[id];
    this.difficulty = RAID_DIFFICULTY[difficulty] ? difficulty : 'normal';
    this.diff = RAID_DIFFICULTY[this.difficulty];
    this.boss = games[0].opponent;
    // Tougher with more Pokémon on the players' side, but not linearly (co-op shouldn't drag on).
    const total = games.reduce((n, g) => n + g.playerTeam.members.length, 0);
    dressBoss(this.boss, id, Math.round(this.boss.maxHp * (4.5 + total * 0.6) * this.diff.hp), games[0].sprites);
    this.boss.hp = this.boss.maxHp;
    Object.assign(this, {
      time: 0, stage: 1, next: 1.2, sequence: 0, targetN: 0, hazards: [], vulnerable: 0, intro: INTRO, transition: 0,
      hv: 0, sentHv: -1, n: 0, group: 0, dash: null, ult: null, ultRelease: null, castUntil: 0, ultN: 0, ultBroken: 0, ultFired: 0, home: { x: 180, y: 205 }, rand: rng([...id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)),
    });
    this.minY = Math.max(205, this.boss.species.headZ + (this.boss.species.fly?.height ?? 0) + 145);
    this.home.y = this.minY;
    for (const g of games) {
      g.raid = this;
      g.foeCanMega = false;
      g.opponentTeam.members[0] = this.boss;
      g.link();
    }
    this.bossUpdate = this.boss.update.bind(this.boss);
    this.boss.update = () => {};
    this.boss.x = 180;
    this.boss.y = -60;
  }

  get phase() { return this.stage; }

  stageFor(frac) {
    return 1 + STAGE_AT.filter(t => frac <= t).length;
  }

  tick(dt) {
    const active = this.games.filter(g => g.state === 'fighting');
    if (!active.length) return;
    const b = this.boss;
    this.time += dt;
    if (!b.alive) {
      this.hazards.length = 0;
      this.ult = null;
      this.ultRelease = null;
      return;
    }
    this.vulnerable = Math.max(0, this.vulnerable - dt);
    const anchored = this.intro <= 0 && !this.dash && (this.ult || this.ultRelease || this.time < this.castUntil || this.transition > 0);
    const anchor = anchored && { x: b.x, y: b.y, z: b.z, flyT: b.flyT, dir: b.dir };
    b.vx = b.vy = 0;
    this.bossUpdate(dt, this.games[0]);
    if (anchor) Object.assign(b, anchor, { moving: false });
    b.stagger = Math.min(b.stagger, 0.12);
    b.frozen = Math.min(b.frozen, 0.8);
    b.vx = b.vy = 0;
    this.move(dt, active);
    if (this.intro > 0) {
      this.intro -= dt;
      b.invuln = true;
      if (this.intro <= 0) b.invuln = false;
      return;
    }
    if (b.hp <= b.maxHp * 0.5 && evolveRaidBoss(b, this.id, this.games[0].sprites)) {
      for (const g of this.games) g.opponentTeam.megaUsed = true;
    }
    if (this.ultRelease) {
      this.resolve(active);
      const release = this.ultRelease;
      release.t += dt;
      if (!release.hit && release.t >= release.impact) {
        release.hit = true;
        this.landUlt(active);
      }
      if (release.t >= this.def.ultDuration) {
        this.ultRelease = null;
        this.vulnerable = 1.5;
      }
      return;
    }
    const stage = this.stageFor(b.hp / b.maxHp);
    if (stage > this.stage) {
      // A new stage: the boss roars and shrugs off damage briefly; pending attacks are called off.
      this.stage = stage;
      this.transition = TRANSITION;
      this.hazards = this.hazards.filter(h => h.hit);
      this.hv++;
      this.vulnerable = 0;
      this.sequence = 0;
      this.next = 0.5;
      this.dash = null;
      this.ult = null;
      this.castUntil = this.time;
    }
    if (this.transition > 0) {
      this.transition -= dt;
      b.invuln = this.transition > 0;
    }
    this.resolve(active);
    if (this.ult && this.transition <= 0 && (this.ult.t -= dt) <= 0) this.fireUlt(active);
    if (this.ult || this.transition > 0 || this.vulnerable > 0 || (this.next -= dt) > 0 || this.dash || this.time < this.castUntil) return;
    this.launch(active);
  }

  startUlt() {
    if (this.ult || this.ultRelease || this.dash) return;
    const t = Math.max(4, ULT.channel * this.diff.tele), barrier = Math.round(this.boss.maxHp * ULT.barrier);
    this.ult = { t, d: t, shield: barrier, max: barrier };
    this.ultN++;
    this.next = 1.5;
  }

  // A hit on the boss while it channels: returns how much of it the barrier took.
  absorb(dmg) {
    if (!this.ult) return 0;
    const soak = Math.min(this.ult.shield, dmg);
    this.ult.shield -= soak;
    if (this.ult.shield <= 0) {
      this.ult = null;
      this.ultBroken++;
      this.vulnerable = ULT.stagger;
    }
    return soak;
  }

  fireUlt(active) {
    if (!this.ult) return;
    this.ult = null;
    this.ultFired++;
    this.ultRelease = { t: 0, impact: this.def.ultImpact[this.boss.isMega ? 1 : 0], hit: false };
    this.castUntil = this.time + this.def.ultDuration;
    this.next = 5;
  }

  landUlt(active) {
    const b = this.boss, share = ULT.share[this.difficulty] ?? 0.55;
    for (const g of active) {
      const p = g.player;
      if (p.hidden || !p.alive) continue;
      const before = p.hp, dmg = Math.max(1, Math.round(p.maxHp * share));
      p.takeHit(dmg, { dirX: 0, dirY: 1, knockback: 0, stagger: 0.4, flinch: true }, g);
      g.recordCombat?.('hit', b, p, { damage: before - p.hp, move: 'boss-ultimate' });
      g.netSend(p, { t: 'boss-hit', damage: Math.round(before - p.hp), x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.bodyZ) });
      if (!p.alive) g.onFaint(p, b, { id: `boss-ultimate`, name: this.def.ultimate, type: this.def.type });
    }
  }

  // Glides between a few hovering spots facing the players; dives dash straight down the telegraphed line.
  move(dt, active) {
    const b = this.boss, target = active.map(g => g.player).find(p => p.alive && !p.hidden);
    if (this.intro > 0) {
      const k = Math.min(1, (INTRO - this.intro) / (INTRO * 0.65));
      b.x = 180;
      b.y = -60 + (this.home.y + 60) * (1 - (1 - k) ** 3);
    } else if (this.dash) {
      const d = this.dash;
      d.t += dt;
      const k = Math.min(1, d.t / d.dur);
      b.x = d.x0 + (d.x1 - d.x0) * k;
      b.y = d.y0 + (d.y1 - d.y0) * k;
      if (k >= 1) this.dash = null;
      return;
    } else if (this.ult || this.ultRelease || this.time < this.castUntil || this.transition > 0) {
      return;
    } else if (!this.vulnerable) {
      const dx = this.home.x - b.x, dy = this.home.y - b.y, d = Math.hypot(dx, dy), speed = 55 + 14 * this.stage;
      if (d > 2) {
        b.x += (dx / d) * Math.min(d, speed * dt);
        b.y += (dy / d) * Math.min(d, speed * dt);
      } else {
        const [x, y] = HOMES[Math.floor(this.rand() * HOMES.length)];
        this.home = { x, y: Math.max(this.minY, y) };
      }
    }
    if (target) b.dir = dirFromVector(target.x - b.x, target.y - b.y);
  }

  resolve(active) {
    const b = this.boss;
    for (const h of this.hazards) {
      if (h.hit || h.at > this.time) continue;
      h.hit = true;
      const spec = ATTACKS[h.k];
      const move = { id: `boss-${h.k}`, name: attackLabel(this.id, h.k), type: h.t, cat: 'special', power: h.p, cooldown: 0 };
      for (const g of active) {
        const p = g.player;
        if (p.hidden || !p.alive || !hazardHits(h, p.x, p.y)) continue;
        const before = p.hp;
        applyHit(g, b, p, move, { knockback: h.s === 'cover' ? 90 : 60, stagger: 0.2, critChance: 0 });
        if (p.hp < before) g.netSend(p, { t: 'boss-hit', damage: Math.round(before - p.hp), x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.bodyZ) });
      }
      if (spec.dash && h.last) {
        this.dash = { x0: b.x, y0: b.y, x1: h.x2, y1: h.y2, t: 0, dur: 0.32 };
        this.home = { x: clampX(h.x2), y: clampY(h.y2) };
      }
      if (spec.vuln && h.last) this.vulnerable = spec.vuln * (this.difficulty === 'legendary' ? 0.8 : 1);
    }
    const before = this.hazards.length;
    this.hazards = this.hazards.filter(h => !h.hit || h.at > this.time - 0.6);
    if (this.hazards.length !== before) this.hv++;
  }

  launch(active) {
    const list = this.def.attacks[this.stage - 1], k = list[this.sequence++ % list.length];
    if (k === 'ultimate') return this.startUlt();
    const alive = active.map(g => g.player).filter(p => p.alive && !p.hidden);
    if (!alive.length) {
      this.next = 0.5;
      return;
    }
    const target = alive[this.targetN++ % alive.length], spec = ATTACKS[k], diff = this.diff;
    const tele = Math.max(0.9, spec.tele * diff.tele * (1 - 0.05 * (this.stage - 1)));
    const power = Math.round(spec.power * diff.dmg * (1 + 0.12 * (this.stage - 1)));
    const made = this.place(k, spec, target, alive);
    const group = ++this.group;
    made.forEach((h, i) => Object.assign(h, {
      id: ++this.n, g: group, k, s: spec.shape, r: h.r ?? spec.r, r0: spec.r0, t: spec.type ?? this.def.type, p: power,
      at: this.time + tele + i * (spec.step ?? 0), d: tele + i * (spec.step ?? 0), hit: false, last: i === made.length - 1,
    }));
    this.hazards.push(...made.slice(0, Math.max(0, MAX_HAZARDS - this.hazards.length)));
    this.castUntil = Math.max(this.castUntil, ...made.map(h => h.at + 0.75));
    const aim = made[0];
    if (aim) {
      let dx = (aim.x2 ?? aim.x) - this.boss.x, dy = (aim.y2 ?? aim.y) - this.boss.y;
      if (Math.hypot(dx, dy) < 4) { dx = target.x - this.boss.x; dy = target.y - this.boss.y; }
      this.boss.dir = dirFromVector(dx, dy);
    }
    this.hv++;
    this.next = tele * 0.6 + Math.max(0.9, (2.4 - 0.3 * (this.stage - 1)) * diff.gap);
  }

  // Where an attack's hazards go.
  place(k, spec, target, alive) {
    const b = this.boss, R = this.rand, more = Math.max(0, (spec.count ?? 1) + this.diff.extra + Math.floor((this.stage - 1) / 2));
    switch (spec.at) {
      case 'target': return [{ x: target.x, y: target.y }];
      case 'boss': return [{ x: b.x, y: b.y }];
      case 'each': return alive.map(p => ({ x: p.x, y: p.y }));
      case 'scatter': return Array.from({ length: Math.max(2, more) }, (_, i) => {
        const p = alive[i % alive.length], a = R() * Math.PI * 2, d = i < alive.length ? 0 : 40 + R() * 70;
        return { x: clampX(p.x + Math.cos(a) * d), y: clampY(p.y + Math.sin(a) * d) };
      });
      case 'lanes': return Array.from({ length: Math.max(1, Math.min(4, more)) }, (_, i) => ({ x: clampX(target.x + (i ? (i % 2 ? 1 : -1) * 105 * Math.ceil(i / 2) : 0)), y: 350 }));
      case 'rows': return Array.from({ length: Math.max(1, Math.min(3, more)) }, (_, i) => ({ x: 180, y: clampY(target.y + (i ? (i % 2 ? -1 : 1) * 130 * Math.ceil(i / 2) : 0)) }));
      case 'orbs': {
        const n = Math.max(2, more - 1), turn = R() * Math.PI * 2;
        return [{ x: target.x, y: target.y }, ...Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2 + turn;
          return { x: clampX(target.x + Math.cos(a) * 72), y: clampY(target.y + Math.sin(a) * 72) };
        })];
      }
      case 'line': {
        // From the boss through the target, on to the edge of the arena.
        let dx = target.x - b.x, dy = target.y - b.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        let t = 2000;
        if (dx) t = Math.min(t, ((dx > 0 ? BOUNDS.maxX : BOUNDS.minX) - b.x) / dx);
        if (dy) t = Math.min(t, ((dy > 0 ? BOUNDS.maxY : BOUNDS.minY) - b.y) / dy);
        return [{ x: b.x, y: b.y, x2: b.x + dx * t, y2: b.y + dy * t }];
      }
      case 'cover': {
        // Everything is hit except a couple of safe spots, at least one of them reachable in time.
        // Never inside the boss, and never on top of each other.
        const safe = [], n = Math.max(1, (spec.count ?? 2) - (this.difficulty === 'legendary' ? 1 : 0));
        for (let i = 0, tries = 0; safe.length < n && tries < 40; tries++) {
          const near = i === 0 ? target : null;
          const x = near ? clampX(near.x + (R() - 0.5) * 140) : 60 + R() * 240, y = near ? clampY(near.y + (R() - 0.5) * 140) : 180 + R() * 360;
          if (Math.hypot(x - b.x, y - b.y) < b.radius + spec.r + 24 || safe.some(([sx, sy]) => Math.hypot(x - sx, y - sy) < spec.r * 2.4)) continue;
          safe.push([Math.round(x), Math.round(y), spec.r]);
          i++;
        }
        if (!safe.length) safe.push([Math.round(target.x), Math.round(target.y), spec.r]);
        return [{ x: 180, y: 350, safe }];
      }
    }
    return [];
  }

  // What screens need to draw the fight. Hazards don't change while they are pending, so online they
  // are only sent when the list changes (and every second regardless; see server/raids.js).
  view(withHazards = true) {
    const b = this.boss, r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
    const out = {
      id: this.id, mg: b.isMega, df: this.difficulty, st: this.stage, hp: Math.max(0, Math.round(b.hp)), maxHp: b.maxHp,
      vu: r2(this.vulnerable), in: r2(Math.max(0, this.intro)), tr: r2(Math.max(0, this.transition)), tm: r2(this.time), hv: this.hv,
      ul: this.ult && { t: r2(this.ult.t), d: r2(this.ult.d), sh: Math.round(this.ult.shield), shm: this.ult.max }, un: this.ultN, ub: this.ultBroken, uf: this.ultFired,
      ua: this.ultRelease && { t: r2(this.ultRelease.t), hit: this.ultRelease.hit },
    };
    if (withHazards) {
      out.hz = this.hazards.map(h => ({
        id: h.id, g: h.g, k: h.k, s: h.s, x: r1(h.x), y: r1(h.y), r: h.r, r0: h.r0, x2: h.x2 == null ? undefined : r1(h.x2),
        y2: h.y2 == null ? undefined : r1(h.y2), safe: h.safe, t: h.t, at: r2(h.at), d: r2(h.d),
      }));
    }
    return out;
  }

  snapshot(force = false) {
    const send = force || this.hv !== this.sentHv;
    this.sentHv = this.hv;
    return this.view(send);
  }
}

// ── On screen ──

const RGB = { dragon: [117, 245, 177], psychic: [226, 120, 255], water: [90, 170, 255], electric: [255, 230, 90], fire: [255, 140, 60] };
const typeRgb = (t, fallback, shadow = false) => shadow ? SHADOW_LUGIA.rgb : RGB[t] ?? fallback;
const shadowSplash = (g,x,y) => waterSplash(g,x,y,SHADOW_LUGIA.colors);

const fxOf = h => (h.k === 'cataclysm' ? 'cataclysm' : ATTACKS[h.k]?.fx);
const cataclysmSpots = h => Array.from({length:9},(_,i)=>({x:70+i%3*110,y:170+Math.floor(i/3)*150}))
  .filter(p=>!h.safe.some(([x,y,r])=>Math.hypot(p.x-x,p.y-y)<r+20));
const stormClouds = h => {
  const count=quality().particles>500?7:4;
  return Array.from({length:count},(_,i)=>({x:clampX(h.x+(i-(count-1)/2)*28),y:Math.max(130,h.y-140)-(i%2)*14}));
};
// Animations for the wind-up (held until the attack lands) and for the strike itself. Each boss can
// override these with its own fitting animations (BOSSES[id].anims), so no boss strikes a pose that
// makes no sense for it.
const WIND = { default: 'Charge' };
const STRIKE = { default: 'Shoot', quake: 'Attack', dive: 'Attack', psy: 'SpAttack', ultimate: 'Shoot' };
const animFor = (def, kind, fx) => def.anims?.[kind]?.[fx] ?? def.anims?.[kind]?.default ?? (kind === 'wind' ? WIND : STRIKE)[fx] ?? (kind === 'wind' ? WIND : STRIKE).default;

// The boss gathering power: a swelling glow at its head with spikes of light. Follows the boss.
class BossCharge {
  constructor(boss, life, rgb, kind) {
    Object.assign(this, { layer: 'air', boss, life, rgb, kind, age: 0 });
  }

  update(dt) {
    this.age += dt;
    return this.age < this.life && !this.boss.hidden && this.boss.alive;
  }

  draw(ctx) {
    const b = this.boss, k = Math.min(1, (this.age / this.life) * 1.15), [R, G, B] = this.rgb;
    if ((b.boss === 'rayquaza' || b.boss === 'lugia') && this.kind !== 'beam') {
      drawNaturalCharge(ctx, b, this.age, k, this.kind === 'beam' || this.kind === 'ultimate');
      return;
    }
    const { x, y } = bossMouth(b), r = b.radius * (0.5 + 0.9 * k) * (1 + 0.08 * Math.sin(this.age * 30));
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(10,5,20,${0.95 * k})`);
    grad.addColorStop(0.45, `rgba(${b.boss === 'lugia' ? '65,20,100' : '63,20,100'},${0.8 * k})`);
    grad.addColorStop(0.72, `rgba(${R},${G},${B},${0.6 * k})`);
    grad.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    drawRaidSigil(ctx, b.boss, x, y, Math.min(70, r * 1.65), this.age * 2, .2 + .45 * k);
    ctx.strokeStyle = `rgba(${b.boss === 'lugia' ? '225,185,255' : '196,150,255'},${0.65 * k})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a = this.age * 3 + (i * Math.PI) / 3, r0 = r * 0.35, r1 = r * (0.9 + 0.25 * Math.sin(this.age * 12 + i));
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      ctx.stroke();
    }
  }
}

// Effects and sounds that follow the boss's state: telegraph cues, impacts that crack the arena,
// the boss's aura, the entrance and the stage breaks. Purely cosmetic and bounded by the quality setting.
export class BossPresenter {
  constructor(game) {
    Object.assign(this, { game, seen: new Set(), landed: new Set(), falling: new Set(), stage: 0, intro: false, group: 0, shownHp: null, auraAcc: 0, pulseT: 0, view: null });
  }

  update(dt, data, now = performance.now()) {
    const g = this.game, boss = g.opponent;
    if (!data || !boss || !BOSSES[data.id]) {
      this.view = null;
      return;
    }
    if (this.ultimateVisual && (!boss.alive || !this.ultimateVisual.update(dt))) {
      this.ultimateVisual.action.cancel();
      this.ultimateVisual = null;
    }
    const def = BOSSES[data.id], tm = data.tm + (data.recv ? Math.min(0.25, (now - data.recv) / 1000) : 0);
    this.view = { ...data, tm, ul: data.ul && { ...data.ul, t: Math.max(0, data.ul.t - (tm - data.tm)) } };
    if (data.ul && data.un !== this.ultN) {
      this.ultN = data.un;
      this.windUp({ k: 'ultimate' }, def, boss, data.ul.t, now);
      g.showRaidUltCard(boss, MOVES[boss.species.ultimate]);
      sfx.bossWarn();
    }
    if ((data.ub ?? 0) > (this.ultBroken ?? 0)) {
      this.charge = null;
      this.play(boss, 'Hurt', 0.8, false);
      g.spawn(new Ring(boss.x, boss.y, { z: boss.bodyZ, r0: boss.radius, r1: boss.radius * 3, life: 0.5, color: '#7fe8ff', width: 5, layer: 'air' }));
      sfx.clang();
      g.shake(4, 0.3);
    }
    if (boss.alive && (data.uf ?? 0) > (this.ultFired ?? 0) && (data.ua || data.ua === undefined)) {
      this.strike({ k: 'ultimate' }, def, boss);
      this.ultimateVisual = bossUltimateVisual(g, boss);
      // Snapshots carry elapsed release time so reconnecting views join the same choreography.
      for (let t = 0; t < Math.min(5, data.ua?.t ?? 0); t += 1 / 60) this.ultimateVisual.update(1 / 60);
      g.showRaidUltCard(boss, MOVES[boss.species.ultimate]);
      sfx.roar();
      g.shake(3, .25);
    }
    this.ultBroken = data.ub ?? 0;
    this.ultFired = data.uf ?? 0;
    if (!data.ul && this.wasChanneling) {
      this.charge = null;
      if (this.chargeFx) this.chargeFx.life = 0;
    }
    this.wasChanneling = !!data.ul;
    this.shownHp = this.shownHp == null ? data.hp : this.shownHp + (data.hp - this.shownHp) * Math.min(1, dt * 5);
    if (data.in > 0 && !this.intro) {
      this.intro = true;
      g.spawn(new ScreenDim(data.in + 0.3, 0.5, '6,8,20'));
      if (data.id==='mewtwo') g.spawn(new PsyDome(180,205,110,INTRO));
      else if (data.id==='lugia') { g.spawn(new TidalWave(110,280,1.5,SHADOW_LUGIA.rgb,false,SHADOW_LUGIA));sfx.splash(); }
      else for(let i=0;i<4;i++)g.spawn(new BeamLine(80+i*65,-80,130+i*35,240,1.3,def.color,2));
      sfx.roar();
      g.shake(3, 1.2);
    }
    if (this.intro && data.in <= 0 && !this.landedIntro) {
      this.landedIntro = true;
      this.breakGround(boss.x, boss.y, def.rgb, 4);
      sfx.quake();
    }
    if (data.mg && !this.megaSeen) {
      this.megaSeen = true;
      g.spawn(new MegaAura(boss, 1.1));
      rainbowBurst(g, boss.x, boss.y, boss.bodyZ);
      g.hud.callout(boss.side, boss.species.name);
      sfx.megaBurst();
    }
    if (data.st > this.stage) {
      if (this.stage > 0) this.stageBreak(def, boss);
      this.stage = data.st;
    }
    for (const h of data.hz ?? []) {
      const left = h.at - tm;
      if (!this.seen.has(h.id)) {
        this.seen.add(h.id);
        if (data.id==='lugia' && h.k==='storm' && left>.2) {
          for(const p of stormClouds(h))g.spawn(new StormCloud(p.x,p.y,left+1.2,SHADOW_LUGIA));
        }
        if (h.g !== this.group) {
          this.group = h.g;
          sfx.bossWarn();
          if (left > 0.2) this.windUp(h, def, boss, left, now);
        }
      }
      if ((h.k === 'meteor' || (h.k === 'cataclysm' && data.id === 'rayquaza')) && left < 0.85 && !this.falling.has(h.id)) {
        this.falling.add(h.id);
        if (h.s === 'circle') g.spawn(new Falling(h.x, h.y, Math.max(0.15, left), data.id === 'rayquaza' ? 'raid-meteor' : 'draco', () => {}, def.rgb));
        else if (h.s === 'cover') for (const p of cataclysmSpots(h)) g.spawn(new Falling(p.x,p.y,Math.max(.15,left),'raid-meteor',()=>{},def.rgb));
      }
      if (h.k === 'cataclysm' && data.id === 'lugia' && left < .65 && !this.falling.has(h.id)) {
        this.falling.add(h.id);
        g.spawn(new TidalWave(100,620,Math.max(.2,left+.18),SHADOW_LUGIA.rgb,true,SHADOW_LUGIA));
      }
      if (h.k === 'tidal' && left < 0.55 && !this.falling.has(h.id)) {
        this.falling.add(h.id);
        g.spawn(new TidalWave(h.y - h.r - 120, h.y + h.r + 30, Math.max(0.2, left + 0.25), SHADOW_LUGIA.rgb, true, SHADOW_LUGIA));
      }
      if (left <= 0 && !this.landed.has(h.id)) {
        this.landed.add(h.id);
        if (h.g !== this.struck) {
          this.struck = h.g;
          this.strike(h, def, boss);
        }
        this.throwAt(h, def, boss);
        this.impact(h, def, boss);
      }
    }
    if (this.seen.size > 300) {
      const keep = new Set((data.hz ?? []).map(h => h.id));
      for (const set of [this.seen, this.landed, this.falling]) for (const id of set) if (!keep.has(id)) set.delete(id);
    }
    this.aura(dt, data, def, boss);
  }

  // The boss gathers power for the whole warning: an attack pose, a swelling glow at its head and
  // energy pulled in from around it (see aura). Meteors are first flung up into the sky.
  windUp(h, def, boss, left, now) {
    const fx = fxOf(h), rgb = typeRgb(h.t, def.rgb, boss.boss === 'lugia'), g = this.game;
    this.play(boss, animFor(def, 'wind', fx), left, true);
    if (this.chargeFx) this.chargeFx.life = 0;
    this.chargeFx = new BossCharge(boss, left, rgb, fx);
    g.spawn(this.chargeFx);
    this.charge = { until: now + left * 1000, rgb };
    if(fx==='nova')g.spawn(new NovaGather(boss,h,rgb,left));
    if (boss.boss === 'lugia' && fx === 'cataclysm') {
      const targets = cataclysmSpots(h).slice(0,3);
      for (const p of targets) g.spawn(new StormCloud(p.x,Math.max(130,p.y-140),left+.35,SHADOW_LUGIA));
    }
    if (fx === 'meteor' || fx === 'cataclysm') {
      for (let i = 0; i < Math.round(10 * Math.max(0.4, quality().particles / 1200)); i++) {
        g.particles.spawn({ x: boss.x + rand(-12, 12), y: boss.y, z: boss.headZ * 0.8, vx: rand(-30, 30), vz: rand(380, 520), life: 0.7, size: rand(3, 5), sizeEnd: 1, colors: ['#ffffff', `rgb(${rgb.join(',')})`] });
      }
    }
    if (fx === 'quake' || fx === 'cataclysm') g.shake(2, Math.min(1.5, left));
  }

  // The moment the attack lands, the boss performs it.
  strike(h, def, boss) {
    const fx = fxOf(h);
    this.play(boss, animFor(def, 'strike', fx), 0.75, false);
    this.charge = null;
    if (fx === 'nova' || fx === 'cataclysm' || fx === 'quake') sfx.roar();
  }

  // What leaves the boss and flies to where the hazard lands: a bolt of its energy, or for a ground
  // slam a fault line torn through the floor between them.
  throwAt(h, def, boss) {
    const g = this.game, fx = fxOf(h), rgb = typeRgb(h.t, def.rgb, boss.boss === 'lugia'), color = `rgb(${rgb.join(',')})`;
    if (fx === 'psy' || (boss.boss === 'mewtwo' && (fx === 'storm' || fx === 'pillar'))) g.spawn(new PsychicBeam(boss.x,boss.y-boss.bodyZ,h.x,h.s==='lane'?Math.min(BOUNDS.maxY,boss.y+160):h.y,fx==='pillar'?14:9,.42));
    else if (fx === 'quake' && Math.hypot(h.x - boss.x, h.y - boss.y) > 60) this.trench({ x: boss.x, y: boss.y, x2: h.x, y2: h.y }, rgb);
  }

  play(boss, name, hold, loop) {
    boss.sprite.play(name, { loop, force: true });
    boss.animHold = hold;
  }

  impact(h, def, boss) {
    const g = this.game, rgb = typeRgb(h.t, def.rgb, boss.boss === 'lugia'), color = `rgb(${rgb.join(',')})`;
    if (boss.boss === 'mewtwo' && h.s === 'circle') g.spawn(new RaidBurst(boss.boss, h.x2 ?? h.x, h.y2 ?? h.y, Math.min(170, h.r * 2 + 30)));
    if (boss.boss === 'lugia' && fxOf(h) === 'beam') shadowSplash(g, h.x2 ?? h.x, h.y2 ?? h.y);
    switch (h.k === 'cataclysm' ? 'cataclysm' : ATTACKS[h.k]?.fx) {
      case 'quake':
        this.breakGround(h.x, h.y, rgb, h.r > 100 ? 4 : 2, h.r);
        sfx.quake();
        g.shake(7, 0.4);
        break;
      case 'meteor':
        g.marks.scorch(h.x, h.y, h.r * 0.8);
        this.breakGround(h.x, h.y, rgb, 1, h.r);
        sfx.explosion();
        g.shake(5, 0.3);
        break;
      case 'pillar':
        if (boss.boss === 'mewtwo') {
          for (const y of [190,310,430,550]) g.spawn(new Pillar(h.x,y,.55,rgb,300));
          for (const y of [200,350,500]) g.marks.energy(h.x,y,h.r,rgb);
        } else for (const y of [230,400,570]) {
          g.spawn(new ElementColumn(h.x,y,Math.min(128,y-145),h.r*.9,boss.boss==='lugia',.6,boss.boss==='lugia'?SHADOW_LUGIA:null));
          g.spawn(new PressureWave(h.x,y,h.r*1.5,boss.boss==='lugia'?'water':'air',0,boss.boss==='lugia'?SHADOW_LUGIA:null));
          if (boss.boss==='lugia') shadowSplash(g,h.x,y); else g.marks.fracture(h.x,y,22);
        }
        sfx.beamFire();
        g.shake(3, 0.2);
        break;
      case 'beam':
        if(boss.boss==='mewtwo'){
          if(h.s==='row'||h.s==='cross')g.spawn(new PsychicBeam(BOUNDS.minX-30,h.y,BOUNDS.maxX+30,h.y,h.r*.9));
          if(h.s==='cross')g.spawn(new PsychicBeam(h.x,BOUNDS.minY-30,h.x,BOUNDS.maxY+30,h.r*.9));
          if(h.s==='line')g.spawn(new PsychicBeam(boss.x,boss.y-boss.bodyZ,h.x2,h.y2,h.r));
          sfx.beamFire();g.shake(4,.25);break;
        }
        if (h.s !== 'line') g.spawn(new LegendaryBeam(boss, h.x, h.y, color, h.r, .5, boss.boss==='lugia'));
        if (h.s === 'row' || h.s === 'cross') g.spawn(new BeamLine(BOUNDS.minX - 30, h.y, BOUNDS.maxX + 30, h.y, 0.4, color, h.r * 1.4));
        if (h.s === 'row' && boss.boss === 'lugia') {
          g.spawn(new BeamLine(BOUNDS.minX-30,h.y,BOUNDS.maxX+30,h.y,.4,SHADOW_LUGIA.mist,h.r*.65));
          g.spawn(new BeamLine(BOUNDS.minX-30,h.y,BOUNDS.maxX+30,h.y,.35,'#ffffff',h.r*.18));
        }
        if (h.s === 'cross') g.spawn(new BeamLine(h.x, BOUNDS.minY - 30, h.x, BOUNDS.maxY + 30, 0.4, color, h.r * 1.4));
        if (h.s === 'line') {
          if(h.k==='aeroblast')g.spawn(new AeroblastBeam(boss,h.x2,h.y2,h.r*1.7,.8));
          else g.spawn(new LegendaryBeam(boss,h.x2,h.y2,color,h.r*1.5,.6,h.k==='dragonBeam'||boss.boss==='lugia'));
          this.trench(h, rgb);
        }
        sfx.beamFire();
        g.shake(4, 0.25);
        break;
      case 'nova':
        g.spawn(new RaidAreaBurst(boss.boss,h,rgb));
        g.spawn(new ScreenDim(1.15,.24,boss.boss==='lugia'?SHADOW_LUGIA.dim:'7,10,22'));
        for(let i=0;i<5;i++){
          const a=i*Math.PI*2/5,x=h.x+Math.cos(a)*(h.r0+60),y=h.y+Math.sin(a)*(h.r0+60);
          g.marks.fracture(x,y,18);
        }
        if(boss.boss==='rayquaza')sfx.whoosh();
        sfx.explosion();g.shake(8,.45);
        break;
      case 'dive':
        g.spawn(new EnergyAura(boss, 0.55, true));
        g.spawn(new Slipstream(boss,.55,'#baffdd',boss.radius*1.3));
        g.spawn(new PressureWave(h.x2,h.y2,100,'rock'));
        this.trench(h, rgb);
        this.breakGround(h.x2, h.y2, rgb, 2);
        sfx.quake();
        g.shake(8, 0.4);
        break;
      case 'psy':
        g.spawn(new Ring(h.x, h.y, { r0: 6, r1: h.r * 1.4, life: 0.4, color, width: 4 }));
        g.marks.energy(h.x, h.y, h.r, rgb);
        debris(g, h.x, h.y, 10, 110);
        sfx.pulse();
        g.shake(3, 0.2);
        break;
      case 'tidal':
        for (const x of [70, 180, 290]) { g.marks.wet(x, h.y, h.r * 0.7); shadowSplash(g, x, h.y); }
        sfx.splash();
        g.shake(3, 0.25);
        break;
      case 'storm':
        if (boss.boss==='lugia') {
          stormClouds(h).forEach((cloud,i)=>{
            const strike=()=>{
              if(g.opponent!==boss || !boss.alive || g.state!=='fighting')return;
              const a=i*2.4,x=h.x+(i?Math.cos(a)*h.r*.5:0),y=h.y+(i?Math.sin(a)*h.r*.5:0);
              g.spawn(new Lightning(cloud.x,cloud.y,x,y,.32,{width:i?2.5:4,branches:4,core:SHADOW_LUGIA.core,glow:'rgba(177,108,250,.65)'}));
              electricBurst(g,x,y,2,8,SHADOW_LUGIA);shadowSplash(g,x,y);
              if(i%2===0)sfx.thunder();
            };
            if(i)g.later(i*.07,strike);else strike();
          });
        } else g.spawn(new Lightning(h.x+rand(-12,12),h.y-320,h.x,h.y,.35,{width:3,branches:4}));
        if(boss.boss==='lugia') electricBurst(g,h.x,h.y,2,14,SHADOW_LUGIA);
        else electricBurst(g, h.x, h.y, 2, 14);
        g.marks.scorch(h.x, h.y, h.r * 0.6);
        if (boss.boss==='lugia') { shadowSplash(g,h.x,h.y);g.spawn(new PressureWave(h.x,h.y,h.r*1.4,'water',0,SHADOW_LUGIA)); }
        sfx.thunder();
        g.shake(4, 0.25);
        break;
      case 'cataclysm':
        g.spawn(new RaidAreaBurst(boss.boss,h,rgb));
        g.spawn(new ScreenDim(1.4, 0.45, boss.boss==='lugia'?SHADOW_LUGIA.dim:'20,6,6'));
        g.flashT = Math.max(g.flashT, 0.16);
        for (const {x,y} of cataclysmSpots(h)) {
          if(boss.boss==='lugia') {
            shadowSplash(g,x,y);g.marks.wet(x,y,45);g.spawn(new ElementColumn(x,y,Math.min(180,y-150),42,true,.6,SHADOW_LUGIA));
            g.spawn(new PressureWave(x,y,70,'water',0,SHADOW_LUGIA));
          } else this.breakGround(x, y, rgb, 1, 60);
        }
        sfx.explosion();
        sfx.roar();
        g.shake(12, 0.9);
        break;
    }
  }

  // Cracks, rubble and a shockwave: the arena takes the hit. Fewer pieces at lower quality.
  breakGround(x, y, rgb, n = 1, r = 70) {
    const g = this.game, q = Math.max(0.35, quality().particles / 1200);
    g.marks.fracture(x, y, Math.min(90, r * 0.9));
    debris(g, x, y, Math.round(22 * q * n), 170);
    dustCloud(g, x, y, Math.round(10 * q * n), 5);
    g.spawn(new Ring(x, y, { r0: 8, r1: r * 1.3, life: 0.45, color: `rgb(${rgb.join(',')})`, width: 4 }));
    if (g.opponent.boss==='rayquaza') g.spawn(new PressureWave(x,y,r*1.45,'rock'));
  }

  // A line attack carves a trench of cracks across the floor.
  trench(h, rgb) {
    const len = Math.hypot(h.x2 - h.x, h.y2 - h.y), steps = Math.min(8, Math.floor(len / 55));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      this.game.marks.fracture(h.x + (h.x2 - h.x) * k, h.y + (h.y2 - h.y) * k, 34);
    }
    debris(this.game, h.x2, h.y2, 16, 150);
  }

  stageBreak(def, boss) {
    const g = this.game;
    g.spawn(new ScreenDim(TRANSITION, 0.4, '10,6,24'));
    g.spawn(new Ring(boss.x, boss.y, { r0: 20, r1: 420, life: 0.9, color: def.color, width: 8 }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      this.breakGround(boss.x + Math.cos(a) * 110, boss.y + 60 + Math.sin(a) * 90, def.rgb, 1);
    }
    sfx.roar();
    sfx.megaBurst();
    g.shake(9, 0.8);
  }

  // A constant glow of particles around the boss: its own colour, gold while staggered, red in the last stage.
  aura(dt, data, def, boss) {
    if (boss.hidden || !boss.alive) return;
    const g = this.game, colors = data.vu > 0 ? ['#ffe28a', '#9e682d', '#20102c'] : data.st >= 4 ? ['#da8aff', '#7d245e', '#29112e', '#0d0917'] : [def.color, '#7c42aa', '#35204d', '#0d0917'];
    this.auraAcc += dt * 60 * (quality().particles >= 1000 ? 2 : quality().particles >= 500 ? 1 : 0.35) * (data.st >= 4 ? 1.6 : 1);
    for (; this.auraAcc >= 1; this.auraAcc--) {
      const a = Math.random() * Math.PI * 2, r = boss.radius * (1 + Math.random() * 0.6);
      g.particles.spawn({
        x: boss.x + Math.cos(a) * r, y: boss.y + Math.sin(a) * r * 0.45, z: Math.random() * boss.headZ, vz: rand(25, 70),
        vx: -Math.cos(a) * 10, vy: -Math.sin(a) * 5, life: rand(0.5, 0.95), size: rand(3, 6), sizeEnd: 0.5, alpha: .8, colors, layer: Math.random() < 0.5 ? 'ground' : 'air',
      });
    }
    if (this.charge && performance.now() < this.charge.until) {
      const hx = boss.x, hy = boss.y, hz = boss.headZ * 0.75, n = quality().particles >= 500 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = boss.radius * rand(1.8, 2.8), life = 0.32;
        g.particles.spawn({ x: hx + Math.cos(a) * d, y: hy + Math.sin(a) * d * 0.5, z: hz + rand(-10, 10), vx: (-Math.cos(a) * d) / life, vy: (-Math.sin(a) * d * 0.5) / life, life, size: 2.5, sizeEnd: 1, fade: false, colors: ['#ffffff', `rgb(${this.charge.rgb.join(',')})`] });
      }
    }
    if (boss.boss === 'mewtwo' && (this.pulseT -= dt) <= 0) {
      this.pulseT = data.st >= 4 ? 0.7 : 1.2;
      g.spawn(new Ring(boss.x, boss.y, { r0: boss.radius * 0.6, r1: boss.radius * 2.2, life: 0.8, color: colors.at(-1), width: 2 }));
    }
  }
}

// Telegraphs on the arena floor (world space, under the Pokémon): a dark warning area that fills up
// as the attack gets close, then a white flash when it lands.
export function drawBossGround(ctx, view, boss) {
  if (!view || !BOSSES[view.id]) return;
  const def = BOSSES[view.id];
  if (boss && !boss.hidden && boss.alive) {
    const pulse = 0.5 + 0.5 * Math.sin(view.tm * 4), rgb = view.vu > 0 ? [255, 220, 80] : view.st >= 4 ? [255, 90, 60] : def.rgb;
    const r = boss.radius * (2 + pulse * 0.3), grad = ctx.createRadialGradient(boss.x, boss.y, 2, boss.x, boss.y, r);
    grad.addColorStop(0, 'rgba(8,4,18,0.9)');
    grad.addColorStop(.55, 'rgba(38,13,62,0.7)');
    grad.addColorStop(.8, `rgba(${rgb.join(',')},0.22)`);
    grad.addColorStop(1, 'rgba(15,5,28,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(boss.x, boss.y, r, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    drawRaidGroundAura(ctx, view.id, boss.x, boss.y, r * 2.4, view.tm, view.ul ? .8 : .4, .45);
  }
  for (const h of view.hz ?? []) {
    const left = h.at - view.tm;
    if (left < -0.35) continue;
    const landed = left <= 0, p = landed ? 1 : Math.max(0, Math.min(1, 1 - left / h.d));
    const flash = landed ? 1 + left / 0.35 : 0;
    const blink = !landed && left < 0.45 && Math.floor(left * 14) % 2 === 0;
    ctx.save();
    ctx.beginPath();ctx.rect(BOUNDS.minX-10,BOUNDS.minY-10,BOUNDS.maxX-BOUNDS.minX+20,BOUNDS.maxY-BOUNDS.minY+20);ctx.clip();
    const broad=h.s!=='circle';
    ctx.fillStyle = landed ? `rgba(255,255,255,${(broad?.08:.75) * flash})` : `rgba(255,${blink ? 40 : 70},50,${0.16 + 0.22 * p})`;
    ctx.strokeStyle = landed ? `rgba(255,255,255,${flash*(broad?.25:1)})` : blink ? '#ffffff' : '#ffd36a';
    ctx.lineWidth = 2;
    shapePath(ctx, h, 1);
    ctx.fill('evenodd');
    ctx.setLineDash(landed ? [] : [6, 4]);
    ctx.stroke();
    if (!landed && h.s !== 'cover' && h.s !== 'ring') {
      // The inner fill grows toward the edge: when it reaches it, the attack lands.
      ctx.fillStyle = `rgba(255,80,40,${0.22 + 0.2 * p})`;
      shapePath(ctx, h, p);
      ctx.fill();
    }
    if (h.s === 'cover' || h.s === 'ring') {
      ctx.setLineDash([]);
      ctx.strokeStyle = '#7dffa5';
      ctx.lineWidth = 3;
      for (const [sx, sy, sr] of h.s === 'cover' ? h.safe : [[h.x, h.y, h.r0]]) {
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.stroke();
        if (!landed) outlinedText(ctx, 'SAFE', sx, sy + 3, { size: 9, color: '#bfffd0', align: 'center' });
      }
    }
    ctx.restore();
  }
}

function shapePath(ctx, h, k) {
  const X0 = BOUNDS.minX - 10, X1 = BOUNDS.maxX + 10, Y0 = BOUNDS.minY - 10, Y1 = BOUNDS.maxY + 10;
  ctx.beginPath();
  if (h.s === 'circle') ctx.arc(h.x, h.y, h.r * k, 0, Math.PI * 2);
  else if (h.s === 'ring') {
    ctx.arc(h.x, h.y, Math.max(h.r0 + 1, h.r * k), 0, Math.PI * 2);
    ctx.moveTo(h.x+h.r0,h.y);
    ctx.arc(h.x, h.y, h.r0, 0, Math.PI * 2, true);
  } else if (h.s === 'lane') ctx.rect(h.x - h.r * k, Y0, h.r * 2 * k, Y1 - Y0);
  else if (h.s === 'row') ctx.rect(X0, h.y - h.r * k, X1 - X0, h.r * 2 * k);
  else if (h.s === 'cross') {
    ctx.rect(h.x - h.r * k, Y0, h.r * 2 * k, Y1 - Y0);
    ctx.rect(X0, h.y - h.r * k, X1 - X0, h.r * 2 * k);
  } else if (h.s === 'line') {
    const a = Math.atan2(h.y2 - h.y, h.x2 - h.x), len = Math.hypot(h.x2 - h.x, h.y2 - h.y), w = h.r * k;
    const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
    ctx.moveTo(h.x + nx, h.y + ny);
    ctx.lineTo(h.x2 + nx, h.y2 + ny);
    ctx.lineTo(h.x2 - nx, h.y2 - ny);
    ctx.lineTo(h.x - nx, h.y - ny);
    ctx.closePath();
    if (k === 1) ctx.arc(h.x2, h.y2, w, 0, Math.PI * 2);
  } else if (h.s === 'cover') {
    ctx.rect(X0, Y0, X1 - X0, Y1 - Y0);
    for (const [sx, sy, sr] of h.safe) {
      ctx.moveTo(sx + sr, sy);
      ctx.arc(sx, sy, sr, 0, Math.PI * 2, true);
    }
  }
}

// Screen space: the boss bar (stages marked on it), the warning for the next attack, the entrance
// card and the stage banners.
export function drawBossHud(ctx, view, presenter) {
  if (!view || !BOSSES[view.id]) return;
  const def = BOSSES[view.id], frac = Math.max(0, view.hp / view.maxHp), shown = Math.max(frac, (presenter?.shownHp ?? view.hp) / view.maxHp);
  const x = 14, y = 84, w = 332;
  ctx.save();
  ctx.fillStyle = 'rgba(6,10,22,0.86)';
  ctx.fillRect(x - 4, y - 2, w + 8, 34);
  ctx.strokeStyle = view.st >= 4 ? '#ff6a4a' : def.color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 3.5, y - 1.5, w + 7, 33);
  outlinedText(ctx, `${view.mg ? 'MEGA ' : ''}${def.name.toUpperCase()} · ${def.stages[view.st - 1]}`, x, y + 9, { size: 9, color: '#ffffff' });
  outlinedText(ctx, `${RAID_DIFFICULTY[view.df]?.label ?? ''} · STAGE ${view.st}/4`, x + w, y + 9, { size: 8, color: view.st >= 4 ? '#ffb090' : '#cfe0ff', align: 'right' });
  const by = y + 14, bh = 9;
  ctx.fillStyle = '#1c2536';
  ctx.fillRect(x, by, w, bh);
  ctx.fillStyle = '#f3f3f3';
  ctx.fillRect(x, by, w * shown, bh);
  ctx.fillStyle = view.vu > 0 ? '#ffe05a' : view.st >= 4 ? '#ff5a3c' : def.color;
  ctx.fillRect(x, by, w * frac, bh);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, by, w * frac, 3);
  ctx.fillStyle = '#05070d';
  for (const t of STAGE_AT) ctx.fillRect(Math.round(x + w * t), by - 2, 2, bh + 4);
  outlinedText(ctx, `${Math.ceil(view.hp).toLocaleString()} / ${view.maxHp.toLocaleString()}`, x + w / 2, by + 8, { size: 8, color: '#ffffff', align: 'center' });
  // The warning for the attack coming in next, or the opening to strike back.
  const pending = (view.hz ?? []).filter(h => h.at > view.tm).sort((a, b) => a.at - b.at)[0];
  if (view.ul) {
    ctx.fillStyle = 'rgba(6,10,22,0.9)';
    ctx.fillRect(x - 4, y + 34, w + 8, 44);
    outlinedText(ctx, `${def.ultimate} · ${view.ul.t.toFixed(1)}s`, 180, y + 46, { size: 11, color: '#ffffff', align: 'center', lw: 3 });
    ctx.fillStyle = '#203848';
    ctx.fillRect(x, y + 51, w, 7);
    ctx.fillStyle = '#7fe8ff';
    ctx.fillRect(x, y + 51, w * Math.max(0, view.ul.sh / view.ul.shm), 7);
    outlinedText(ctx, 'BREAK THE SHIELD TO STOP THE ULTIMATE!', 180, y + 71, { size: 9, color: '#7fe8ff', align: 'center', lw: 3 });
  } else if (view.vu > 0) {
    const on = Math.floor(view.tm * 6) % 2 === 0;
    outlinedText(ctx, 'STAGGERED — STRIKE NOW!', 180, y + 46, { size: 11, color: on ? '#fff27a' : '#ffd23a', align: 'center', lw: 3 });
  } else if (pending) {
    const on = pending.at - view.tm < 0.5 && Math.floor(view.tm * 10) % 2 === 0;
    outlinedText(ctx, `⚠ ${attackLabel(view.id, pending.k)} — ${attackHint(pending.k)}`, 180, y + 46, { size: 10, color: on ? '#ffffff' : '#ff8f6a', align: 'center', lw: 3 });
  }
  if (view.in > 0) {
    // Entrance: letterbox bars and the boss's name.
    const t = INTRO - view.in, a = Math.min(1, t / 0.4, view.in / 0.4);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#000';
    ctx.fillRect(-200, 0, 760, 46);
    ctx.fillRect(-200, 594, 760, 60);
    outlinedText(ctx, 'A LEGENDARY POKÉMON APPEARS', 180, 300, { size: 10, color: '#ffe9a8', align: 'center', lw: 3 });
    outlinedText(ctx, def.name.toUpperCase(), 180, 338, { size: 34, family: 'Luckiest Guy', weight: 400, color: def.color, align: 'center', lw: 5 });
    outlinedText(ctx, def.title, 180, 360, { size: 10, color: '#ffffff', align: 'center', lw: 3 });
  } else if (view.tr > 0) {
    const t = TRANSITION - view.tr, a = Math.min(1, t / 0.3, view.tr / 0.4);
    ctx.globalAlpha = a;
    outlinedText(ctx, `STAGE ${view.st}`, 180, 320, { size: 30, family: 'Luckiest Guy', weight: 400, color: view.st >= 4 ? '#ff6a4a' : def.color, align: 'center', lw: 5 });
    outlinedText(ctx, def.stages[view.st - 1], 180, 342, { size: 11, color: '#ffffff', align: 'center', lw: 3 });
    if (view.st >= 4) outlinedText(ctx, `${def.name.toUpperCase()} IS ENRAGED!`, 180, 360, { size: 10, color: '#ffb090', align: 'center', lw: 3 });
  }
  ctx.restore();
}

// Draw over the actors so the barrier visibly encloses the boss.
export function drawBossShield(ctx, view, boss) {
  if (!view?.ul || !boss || boss.hidden || !boss.alive) return;
  const frac = Math.max(0, view.ul.sh / view.ul.shm);
  const r = Math.max(boss.radius * 1.6, boss.headZ * 0.7), y = boss.y - boss.bodyZ;
  ctx.save();
  ctx.translate(boss.x, y);
  ctx.fillStyle = 'rgba(80,200,255,0.13)';
  ctx.strokeStyle = '#7fe8ff';
  ctx.lineWidth = 2 + frac * 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 1.15, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.lineWidth = 1.5;
  for (let i = 0; i < Math.floor((1 - frac) * 8); i++) {
    ctx.save(); ctx.rotate(i * 2.4);
    ctx.beginPath(); ctx.moveTo(r * 0.85, 0); ctx.lineTo(r * 0.55, 7);
    ctx.lineTo(r * 0.65, -8); ctx.lineTo(r * 0.3, -4); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}
