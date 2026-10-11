// Abilities: every hook is optional and only runs for the Pokémon currently on the field.
//   dealMult(g, me, foe, move, info) / takeMult(g, me, attacker, move, info) → damage multipliers
//   evade(g, me, attacker, move, dmg) → true negates the hit; absorb(g, me, attacker, move, info) → true soaks it
//   onDeal / onTake(g, me, other, move, dmg, info), onUse(g, me, move), onDodge / onDodged(g, me),
//   onEnter / onLeave(g, me), tick(g, me, dt), pill(me) → [label, colour] shown in the HUD while active,
//   glow(me) → aura colours while active. Flags: immune, statusMult, cdRate, foeCdRate, foeUltMult,
//   dodgeCdMult, dodgeDist, crit(move), stab, convert, weather, aura, pierce, noCrit, noDebuff,
//   bounce, serene, noFlinch, chargeGuard, kbMult, staggerMult, shadowTag, puppeteer.
// `me.ab` is per-entry scratch state, cleared whenever the Pokémon (re)enters the field.

export const isContact = m => !!(m.melee || m.dash || m.slam || m.contact) || m.id === 'waterfall' || m.id === 'iceFang';
export const isRanged = m => !!(m.shot || m.beam || m.stream || m.shockwave) || m.ai === 'ranged';
export const isPunch = m => m.melee?.fx === 'punch' || !!m.punch;
export const typesOf = mon => mon.typeOverride ?? mon.species.types;

const dec = (me, k, dt) => (me.ab[k] = Math.max(0, (me.ab[k] ?? 0) - dt));
const typeBoost = (type, mult) => ({ dealMult: (g, me, foe, move, i) => (i.type === type ? mult : 1) });

function pinch(type, label, color) {
  return {
    desc: `${type[0].toUpperCase()}${type.slice(1)} moves hit 40% harder below 35% HP.`,
    dealMult: (g, me, foe, move, i) => (i.type === type && me.hp < me.maxHp * 0.35 ? 1.4 : 1),
    tick(g, me) {
      const on = me.hp < me.maxHp * 0.35;
      if (on && !me.ab.on) g.abilityPop(me, `${type.toUpperCase()} moves powered up!`);
      me.ab.on = on;
    },
    pill: me => (me.ab.on ? [label, color] : null),
    glow: me => (me.ab.on ? ['#ffffff', color, color] : null),
  };
}

function absorbType(type, word, effect) {
  return {
    absorb(g, me, atk, move, i) {
      if (i.type !== type) return false;
      effect(g, me, i);
      g.abilityPop(me, word);
      return true;
    },
  };
}

function onEntry(stat, mult, dur, text) {
  return { onEnter(g, me) {
    g.buff(me, stat, mult, dur);
    g.abilityPop(me, text);
  } };
}

function contactStatus(status, chance, text) {
  return { onTake(g, me, atk, move, dmg, i) {
    if (i.contact && atk.alive && Math.random() < chance && g.applyStatus(atk, status, { source: me })) g.abilityPop(me, text);
  } };
}

export const ABILITIES = {
  // ── Original roster ──
  blaze: { name: 'Blaze', ...pinch('fire', 'BLAZE', '#ff7a2a') },
  staticReflex: {
    name: 'Static Reflex', desc: 'Dodging an attack sparks a burst of speed: +35% speed for 2.5s.',
    onDodged(g, me) {
      g.buff(me, 'spd', 1.35, 2.5);
      g.abilityPop(me, 'Speed rose!');
    },
  },
  dragonsFury: {
    name: "Dragon's Fury", desc: 'Landing a Dragon-type hit raises attack 20% for 4s.',
    onDeal(g, me, foe, move, dmg, i) {
      if (i.type !== 'dragon' || move.ultimate) return;
      if (!(me.buffs.atk?.t > 0)) g.abilityPop(me, 'Attack rose!');
      g.buff(me, 'atk', 1.2, 4);
    },
  },
  angerPoint: {
    name: 'Anger Point', desc: 'Taking a heavy hit (12%+ of max HP) raises attack 30% for 5s.',
    onTake(g, me, atk, move, dmg) {
      if (dmg < me.maxHp * 0.12 || !me.alive) return;
      g.buff(me, 'atk', 1.3, 5);
      g.abilityPop(me, 'Attack rose sharply!');
    },
  },
  leafRush: {
    name: 'Leaf Rush', desc: 'Using a Grass move grants +30% speed for 2.5s.',
    onUse(g, me, move) {
      if (move.type !== 'grass') return;
      g.buff(me, 'spd', 1.3, 2.5);
      g.abilityPop(me, 'Speed rose!');
    },
  },
  glacialBuild: {
    name: 'Glacial Build', desc: 'Ice hits build chill on the foe; at 3 chill it freezes solid.',
    onDeal(g, me, foe, move, dmg, i) {
      if (i.type !== 'ice' || !foe.alive) return;
      foe.chill = (foe.chill ?? 0) + 1;
      if (foe.chill < 3) return g.floatText(foe, `CHILL ${foe.chill}/3`, '#bdf3ff');
      foe.chill = 0;
      if (g.applyStatus(foe, 'freeze', { source: me })) g.abilityPop(me, 'The chill froze the foe!');
    },
  },
  innerAura: {
    name: 'Inner Aura', desc: 'Each hit landed builds aura (max 5, +5% damage each). A heavy hit taken scatters it.',
    dealMult: (g, me) => 1 + 0.05 * (me.ab.aura ?? 0),
    onDeal(g, me, foe, move) {
      if (move.ultimate) return;
      const n = Math.min(5, (me.ab.aura ?? 0) + 1);
      if (n === 5 && me.ab.aura !== 5) g.abilityPop(me, 'Aura at its peak!');
      me.ab.aura = n;
    },
    onTake(g, me, atk, move, dmg) {
      if (dmg >= me.maxHp * 0.1) me.ab.aura = 0;
    },
    pill: me => (me.ab.aura ? [`AURA ${me.ab.aura}`, '#4a7aff'] : null),
    glow: me => (me.ab.aura >= 3 ? ['#dff0ff', '#6aa8ff', '#2a5ad8'] : null),
  },
  proteanShadow: {
    name: 'Protean Shadow', desc: 'After a 3-hit combo, slips the next attack within 2.5s (8s cooldown).',
    onDeal(g, me) {
      if (me.combo.n >= 3 && !(me.ab.cd > 0) && !(me.ab.ready > 0)) {
        me.ab.ready = 2.5;
        g.abilityPop(me, 'Ready to vanish!');
      }
    },
    evade(g, me) {
      if (!(me.ab.ready > 0)) return false;
      me.ab.ready = 0;
      me.ab.cd = 8;
      me.ab.ghost = 0.5;
      g.abilityPop(me, 'Vanished!');
      return true;
    },
    tick(g, me, dt) {
      dec(me, 'ready', dt);
      dec(me, 'cd', dt);
      dec(me, 'ghost', dt);
    },
    pill: me => (me.ab.ready > 0 ? ['EVASIVE', '#5a8ef0'] : null),
  },
  apexHunter: {
    name: 'Apex Hunter', desc: 'Landing a heavy hit (130+ damage) raises attack 25% for 4s.',
    onDeal(g, me, foe, move, dmg) {
      if (dmg < 130 || move.ultimate) return;
      g.buff(me, 'atk', 1.25, 4);
      g.abilityPop(me, 'Attack rose!');
    },
  },
  cursedBody: {
    name: 'Cursed Body', desc: 'Turns intangible to negate a big hit (8%+ of max HP). 14s cooldown.',
    evade(g, me, atk, move, dmg) {
      if (me.ab.cd > 0 || dmg < me.maxHp * 0.08) return false;
      me.ab.cd = 14;
      me.ab.ghost = 0.8;
      g.abilityPop(me, 'Phased through it!');
      return true;
    },
    tick(g, me, dt) {
      dec(me, 'cd', dt);
      dec(me, 'ghost', dt);
    },
    pill: me => (!(me.ab.cd > 0) ? ['INTANGIBLE', '#7a5aa8'] : null),
  },
  speedBoost: {
    name: 'Speed Boost', desc: 'Speed rises 6% every 4s on the field (up to +30%).',
    tick(g, me, dt) {
      me.ab.t = (me.ab.t ?? 0) + dt;
      if (me.ab.t < 4 || (me.ab.n ?? 0) >= 5) return;
      me.ab.t = 0;
      me.ab.n = (me.ab.n ?? 0) + 1;
      g.abilityPop(me, `Speed +${me.ab.n * 6}%`);
    },
    speedMult: me => 1 + 0.06 * (me.ab.n ?? 0),
    pill: me => (me.ab.n ? [`SPD+${me.ab.n * 6}%`, '#ff9a5a'] : null),
  },
  pressure: { name: 'Pressure', desc: "Its overwhelming presence makes the foe's moves recharge 20% slower.", foeCdRate: 0.8 },
  innerFocus: { name: 'Inner Focus', desc: "Can't be stunned or flinched, and its charged attacks can't be interrupted.", immune: ['stun'], noFlinch: true, chargeGuard: true },
  clearBody: { name: 'Clear Body', desc: "Immune to Slow and Paralysis, and its stats can't be lowered.", immune: ['slow', 'para'], noDebuff: true },
  sandStream: {
    name: 'Sand Stream', desc: 'Whips up a sandstorm that chips foes that are not Rock, Ground or Steel. Takes 15% less damage.',
    weather: 'sand', takeMult: () => 0.85,
  },
  adaptability: { name: 'Adaptability', desc: 'Same-type moves get a 1.5× bonus instead of 1.2×.', stab: 1.5 },
  thickFat: {
    name: 'Thick Fat', desc: 'Takes 40% less Fire and Ice damage, and 15% less while standing still.',
    takeMult: (g, me, atk, move, i) => (i.type === 'fire' || i.type === 'ice' ? 0.6 : 1) * (!me.moving && !me.action ? 0.85 : 1),
  },
  psychicVeil: {
    name: 'Psychic Veil', desc: 'When the foe closes in or starts an ultimate, raises a barrier: −35% damage for 2.5s (10s cooldown).',
    tick(g, me, dt) {
      dec(me, 'cd', dt);
      dec(me, 'veil', dt);
      const f = me.foe;
      if (f?.alive && !f.hidden && me.distTo(f) < 62) this.raise(g, me);
    },
    onFoeUlt(g, me) {
      this.raise(g, me);
    },
    raise(g, me) {
      if (me.ab.cd > 0) return;
      me.ab.veil = 2.5;
      me.ab.cd = 10;
      g.abilityPop(me, 'Barrier raised!');
    },
    takeMult: (g, me) => (me.ab.veil > 0 ? 0.65 : 1),
    pill: me => (me.ab.veil > 0 ? ['VEIL', '#f2588a'] : null),
    glow: me => (me.ab.veil > 0 ? ['#ffffff', '#ffb0e0', '#f2588a'] : null),
  },

  // ── New regular Pokémon ──
  overgrow: { name: 'Overgrow', ...pinch('grass', 'OVERGROW', '#62b947') },
  torrent: { name: 'Torrent', ...pinch('water', 'TORRENT', '#5a8ef0') },
  ironFist: { name: 'Iron Fist', desc: 'Punching moves hit 25% harder.', dealMult: (g, me, foe, move) => (isPunch(move) ? 1.25 : 1) },
  intimidate: {
    name: 'Intimidate', desc: "On entry, lowers the foe's attack by 20% for 6s.",
    onEnter(g, me) {
      if (!me.foe?.alive || me.foe.hidden) return;
      if (g.buff(me.foe, 'atk', 0.8, 6)) g.abilityPop(me, "Foe's attack fell!");
    },
  },
  technician: { name: 'Technician', desc: 'Moves with 65 power or less hit 50% harder.', dealMult: (g, me, foe, move) => (move.power <= 65 && !move.ultimate ? 1.5 : 1) },
  superLuck: { name: 'Super Luck', desc: 'Critical-hit chance +15%.', crit: () => 0.15 },
  illusion: {
    name: 'Illusion', desc: 'Enters disguised: the first hit it takes deals half damage and breaks the illusion.',
    onEnter(g, me) { me.ab.disguise = true; },
    takeMult(g, me) {
      if (!me.ab.disguise) return 1;
      me.ab.disguise = false;
      g.abilityPop(me, 'The illusion broke!');
      return 0.5;
    },
    pill: me => (me.ab.disguise ? ['ILLUSION', '#8a3a3a'] : null),
  },
  pixilate: { name: 'Pixilate', desc: 'Normal-type moves become Fairy-type and hit 20% harder.', convert: { from: 'normal', to: 'fairy', mult: 1.2 } },
  shellArmor: { name: 'Shell Armor', desc: 'Immune to critical hits and takes 10% less damage.', noCrit: true, takeMult: () => 0.9 },
  stanceChange: {
    name: 'Stance Change', desc: 'Attacking switches to Blade Forme (+35% damage and speed, takes 25% more). King\'s Shield switches back to Shield Forme (takes 30% less, deals 20% less, slower) until it attacks again.',
    onUse(g, me, move) {
      if (move.cat !== 'status' && !me.ab.blade) g.toggleForm(me, true);
    },
    dealMult: (g, me) => (me.ab.blade ? 1.35 : 0.8),
    takeMult: (g, me) => (me.ab.blade ? 1.25 : 0.7),
    speedMult: me => (me.ab.blade ? 1.1 : 0.9),
    pill: me => [me.ab.blade ? 'BLADE FORME' : 'SHIELD FORME', me.ab.blade ? '#c84a4a' : '#4a7aa8'],
  },
  moonlitRecovery: {
    name: 'Moonlit Recovery', desc: 'Regenerates 1.2% max HP per second after 3s without taking damage.',
    onTake(g, me) { me.ab.calm = 0; },
    tick(g, me, dt) {
      me.ab.calm = (me.ab.calm ?? 0) + dt;
      if (me.ab.calm < 3 || me.hp >= me.maxHp || g.state !== 'fighting') return;
      me.ab.acc = (me.ab.acc ?? 0) + me.maxHp * 0.012 * dt;
      if (me.ab.acc >= 12) {
        g.heal(me, me.ab.acc);
        me.ab.acc = 0;
      }
    },
    pill: me => (me.ab.calm >= 3 && me.hp < me.maxHp ? ['REGEN', '#46d36b'] : null),
  },
  magicBounce: { name: 'Magic Bounce', desc: 'Status conditions aimed at it are reflected back at the attacker.', bounce: true },

  // ── Legendary ──
  multiscale: {
    name: 'Multiscale', desc: 'Takes 40% less damage while at 95%+ HP.',
    takeMult: (g, me) => (me.hp >= me.maxHp * 0.95 ? 0.6 : 1),
    pill: me => (me.hp >= me.maxHp * 0.95 ? ['MULTISCALE', '#9b8cf2'] : null),
  },
  regenerator: {
    name: 'Regenerator', desc: 'Restores 20% of max HP when switched out.',
    onLeave(g, me) {
      if (me.alive) g.heal(me, me.maxHp * 0.2);
    },
  },
  drizzle: { name: 'Drizzle', desc: 'Summons rain while on the field: Water moves +30%, Fire moves −30%.', weather: 'rain' },
  drought: { name: 'Drought', desc: 'Summons harsh sunlight while on the field: Fire moves +30%, Water moves −30%.', weather: 'sun' },
  temporalFlow: { name: 'Temporal Flow', desc: 'Bends time: its move cooldowns recover 25% faster.', cdRate: 1.25 },
  spatialStep: { name: 'Spatial Step', desc: 'Warps space when dodging: dodges recharge 40% faster and go 40% further.', dodgeCdMult: 0.6, dodgeDist: 1.4 },
  distortion: { name: 'Distortion', desc: 'Distorted space shields it: takes 25% less damage from ranged attacks.', takeMult: (g, me, atk, move) => (isRanged(move) ? 0.75 : 1) },
  turboblaze: { name: 'Turboblaze', desc: 'Its Fire moves ignore type resistances.', pierce: 'fire' },
  teravolt: { name: 'Teravolt', desc: 'Its Electric moves ignore type resistances.', pierce: 'electric' },
  fairyAura: { name: 'Fairy Aura', desc: 'Every Fairy move on the field hits 33% harder.', aura: { type: 'fairy', mult: 1.33 } },
  darkAura: { name: 'Dark Aura', desc: 'Every Dark move on the field hits 33% harder.', aura: { type: 'dark', mult: 1.33 } },
  fullMetalBody: { name: 'Full Metal Body', desc: "Its stats can't be lowered and it can't be stunned.", noDebuff: true, immune: ['stun'] },
  shadowShield: {
    name: 'Shadow Shield', desc: 'The first hit after entering, then one hit every 12s, deals half damage.',
    onEnter(g, me) { me.ab.ready = true; },
    takeMult(g, me) {
      if (!me.ab.ready) return 1;
      me.ab.ready = false;
      me.ab.cd = 12;
      g.abilityPop(me, 'Shadow Shield!');
      return 0.5;
    },
    tick(g, me, dt) {
      if (!me.ab.ready && (me.ab.cd = (me.ab.cd ?? 0) - dt) <= 0) me.ab.ready = true;
    },
    pill: me => (me.ab.ready ? ['SHIELD', '#7a5aa8'] : null),
  },
  intrepidSword: { name: 'Intrepid Sword', desc: 'On entry, attack rises 25% for 8s.', ...onEntry('atk', 1.25, 8, 'Attack rose!') },
  dauntlessShield: { name: 'Dauntless Shield', desc: 'On entry, defense rises 30% for 8s.', ...onEntry('def', 1.3, 8, 'Defense rose!') },
  dynamaxPressure: { name: 'Eternal Pressure', desc: 'Its colossal energy makes the foe charge its ultimate 30% slower.', foeUltMult: 0.7 },
  orichalcumPulse: {
    name: 'Orichalcum Pulse', desc: 'Summons harsh sunlight on entry and hits 20% harder in sunlight.',
    weather: 'sun', dealMult: g => (g.weather === 'sun' ? 1.2 : 1),
  },
  static: { name: 'Static', desc: 'Contact attacks against it may paralyze the attacker (30%).', ...contactStatus('para', 0.3, 'Paralyzed the attacker!') },
  flameBody: { name: 'Flame Body', desc: 'Contact attacks against it may burn the attacker (30%).', ...contactStatus('burn', 0.3, 'Burned the attacker!') },
  lightningPace: {
    name: 'Lightning Pace', desc: 'Its Electric moves recharge 30% faster.',
    onUse(g, me, move) {
      if (move.type === 'electric' && me.cooldowns[move.id]) me.cooldowns[move.id] *= 0.7;
    },
  },
  flashFire: {
    name: 'Flash Fire', desc: 'Absorbs Fire attacks, then its Fire moves hit 40% harder for 6s.',
    ...absorbType('fire', 'Absorbed the flames!', (g, me) => { me.ab.fire = 6; }),
    dealMult: (g, me, foe, move, i) => (i.type === 'fire' && me.ab.fire > 0 ? 1.4 : 1),
    tick: (g, me, dt) => dec(me, 'fire', dt),
    pill: me => (me.ab.fire > 0 ? ['FLASH FIRE', '#ff7a2a'] : null),
    glow: me => (me.ab.fire > 0 ? ['#fff0a0', '#ff9a3a', '#b8461c'] : null),
  },
  pureSpring: { name: 'Pure Spring', desc: 'Status conditions on it last half as long.', statusMult: 0.5 },
  solidRock: { name: 'Solid Rock', desc: 'Super-effective hits deal 25% less damage.', takeMult: (g, me, atk, move, i) => (i.eff > 1 ? 0.75 : 1) },
  frostArmor: { name: 'Frost Armor', desc: 'Attackers that make contact are slowed for 3s.', ...contactStatus('slow', 1, 'Chilled the attacker!') },
  ironWill: { name: 'Iron Will', desc: 'Barely budges: 70% less knockback and half the stagger from hits.', kbMult: 0.3, staggerMult: 0.5 },
  levitate: { name: 'Levitate', desc: 'Floats above the ground: Ground moves deal 70% less damage.', takeMult: (g, me, atk, move, i) => (i.type === 'ground' ? 0.3 : 1) },
  lusterSight: { name: 'Luster Sight', desc: 'Its ranged moves get +15% critical-hit chance.', crit: move => (isRanged(move) ? 0.15 : 0) },
  transistor: { name: 'Transistor', desc: 'Its Electric moves hit 30% harder.', ...typeBoost('electric', 1.3) },
  dragonsMaw: { name: "Dragon's Maw", desc: 'Its Dragon moves hit 30% harder.', ...typeBoost('dragon', 1.3) },

  // ── Mythical ──
  transformMastery: {
    name: 'Transform Mastery', desc: 'Each different move type it uses grants +5% damage (up to +20%).',
    onUse(g, me, move) {
      const seen = (me.ab.types ??= new Set());
      if (seen.has(move.type) || seen.size >= 4) return;
      seen.add(move.type);
      g.abilityPop(me, `Power +${seen.size * 5}%`);
    },
    dealMult: (g, me) => 1 + 0.05 * (me.ab.types?.size ?? 0),
    pill: me => (me.ab.types?.size ? [`MASTERY ${me.ab.types.size}`, '#f2588a'] : null),
  },
  naturalCure: {
    name: 'Natural Cure', desc: 'Status conditions on it last 30% shorter and are cured when it switches out.',
    statusMult: 0.7, onLeave(g, me) { me.status = {}; },
  },
  sereneGrace: { name: 'Serene Grace', desc: 'Doubles the chance of its moves inflicting status conditions or flinching.', serene: true },
  formShift: {
    name: 'Form Shift', desc: 'Dodging shifts to Speed Forme (+30% speed for 3s); attacking shifts to Attack Forme (+15% attack for 3s).',
    onDodge(g, me) {
      g.buff(me, 'spd', 1.3, 3);
      g.abilityPop(me, 'Speed Forme!');
    },
    onUse(g, me, move) {
      if (move.ultimate) return;
      if (!(me.buffs.atk?.t > 0)) g.abilityPop(me, 'Attack Forme!');
      g.buff(me, 'atk', 1.15, 3);
    },
  },
  badDreams: {
    name: 'Bad Dreams', desc: 'Foes that are asleep, frozen or stunned lose 2% max HP per second.',
    tick(g, me, dt) {
      const f = me.foe;
      if (!f?.alive || f.hidden || !(f.status.sleep > 0 || f.frozen > 0 || f.status.stun > 0)) return;
      me.ab.t = (me.ab.t ?? 0) + dt;
      if (me.ab.t < 1) return;
      me.ab.t = 0;
      g.dotDamage(f, 0.02, '#8a6ac8');
    },
  },
  sereneBloom: {
    name: 'Serene Bloom', desc: 'Landing a Grass move heals it for 3% max HP.',
    onDeal(g, me, foe, move, dmg, i) {
      if (i.type !== 'grass' || me.ab.cd > 0) return;
      me.ab.cd = 0.6;
      g.heal(me, me.maxHp * 0.03);
    },
    tick: (g, me, dt) => dec(me, 'cd', dt),
  },
  multitype: {
    name: 'Multitype', desc: 'Takes on the type of the last regular move it used, changing its STAB and weaknesses.',
    onEnter(g, me) { me.typeOverride = null; },
    onUse(g, me, move) {
      if (move.ultimate || me.typeOverride?.[0] === move.type) return;
      me.typeOverride = [move.type];
      g.abilityPop(me, `Became ${move.type.toUpperCase()}-type!`);
    },
  },
  victoryStar: { name: 'Victory Star', desc: '+10% damage and +10% critical-hit chance.', dealMult: () => 1.1, crit: () => 0.1 },
  justified: {
    name: 'Justified', desc: 'Being hit by a Dark move raises attack 30% for 5s.',
    onTake(g, me, atk, move, dmg, i) {
      if (i.type !== 'dark' || !me.alive) return;
      g.buff(me, 'atk', 1.3, 5);
      g.abilityPop(me, 'Attack rose!');
    },
  },
  download: {
    name: 'Download', desc: 'On entry, analyses the current foe: +15% damage against it.',
    onEnter(g, me) {
      me.ab.target = me.foe;
      g.abilityPop(me, 'Foe analysed!');
    },
    dealMult: (g, me, foe) => (foe === me.ab.target ? 1.15 : 1),
  },
  crystalShell: {
    name: 'Crystal Shell', desc: 'A crystal barrier soaks damage equal to 10% max HP; it reforms after 10s without taking damage.',
    onEnter(g, me) { me.shield = me.maxHp * 0.1; },
    onTake(g, me) { me.ab.calm = 0; },
    tick(g, me, dt) {
      me.ab.calm = (me.ab.calm ?? 0) + dt;
      if (me.shield > 0 || me.ab.calm < 10) return;
      me.shield = me.maxHp * 0.1;
      g.abilityPop(me, 'Crystal reformed!');
    },
    pill: me => (me.shield > 0 ? ['CRYSTAL', '#ff70b0'] : null),
  },
  magician: {
    name: 'Magician', desc: "Landing a hit steals the foe's stat boosts.",
    onDeal(g, me, foe) {
      const stolen = Object.entries(foe.buffs).filter(([, b]) => b.t > 0 && b.m > 1);
      if (!stolen.length) return;
      for (const [k, b] of stolen) {
        me.buffs[k] = { ...b };
        delete foe.buffs[k];
      }
      g.abilityPop(me, 'Stole the foe\'s boosts!');
    },
  },
  waterAbsorb: {
    name: 'Water Absorb', desc: 'Water attacks heal it for 25% of their damage instead of hurting.',
    ...absorbType('water', 'Absorbed the water!', (g, me, i) => g.heal(me, i.dmg * 0.25)),
  },
  shadowStep: {
    name: 'Shadow Step', desc: 'After a successful dodge, its next attack within 2s deals 40% more damage.',
    onDodged(g, me) {
      me.ab.step = 2;
      g.abilityPop(me, 'Shadow Step!');
    },
    dealMult: (g, me) => (me.ab.step > 0 ? 1.4 : 1),
    onDeal(g, me) { me.ab.step = 0; },
    tick: (g, me, dt) => dec(me, 'step', dt),
    pill: me => (me.ab.step > 0 ? ['SHADOW STEP', '#7a5aa8'] : null),
  },
  voltAbsorb: {
    name: 'Volt Absorb', desc: 'Electric attacks heal it for 25% of their damage instead of hurting.',
    ...absorbType('electric', 'Absorbed the electricity!', (g, me, i) => g.heal(me, i.dmg * 0.25)),
  },
  poisonPuppeteer: { name: 'Poison Puppeteer', desc: 'Foes it poisons are also slowed.', puppeteer: true },

  // ── Mega forms ──
  toughClaws: { name: 'Tough Claws', desc: 'Contact moves hit 25% harder.', dealMult: (g, me, foe, move) => (isContact(move) ? 1.25 : 1) },
  deltaStream: { name: 'Delta Stream', desc: 'Mysterious strong winds: Flying types lose their weaknesses while it is out.', weather: 'delta' },
  lightningRod: {
    name: 'Lightning Rod', desc: 'Absorbs Electric attacks and raises attack 30% for 5s.',
    ...absorbType('electric', 'Drew in the lightning!', (g, me) => g.buff(me, 'atk', 1.3, 5)),
  },
  shadowTag: { name: 'Shadow Tag', desc: "While it is on the field, the foe can't switch out.", shadowTag: true },
  insomnia: { name: 'Insomnia', desc: "Can't fall asleep or be stunned.", immune: ['sleep', 'stun'] },
  // ── Newcomers ──
  swarm: { name: 'Swarm', ...pinch('bug', 'SWARM', '#a8b820') },
  sharpness: { name: 'Sharpness', desc: 'Slicing moves (blades, claws, cuts) hit 30% harder.', dealMult: (g, me, foe, move) => (move.slice ? 1.3 : 1) },
  sereneWings: {
    name: 'Serene Wings', desc: 'Doubles the chance of status effects and flinches, and Fairy hits heal it for 10% of the damage.', serene: true,
    onDeal(g, me, foe, move, dmg, i) {
      if (i.type === 'fairy') g.heal(me, dmg * 0.1);
    },
  },
  mudArmor: {
    name: 'Mud Armor', desc: "Can't be paralyzed, and takes 25% less damage from Electric and Fire moves.", immune: ['para'],
    takeMult: (g, me, atk, move, i) => (i.type === 'electric' || i.type === 'fire' ? 0.75 : 1),
  },
  iceClaws: {
    name: 'Ice Claws', desc: 'Ice and Dark moves deal 50% more to frozen or slowed foes.',
    dealMult: (g, me, foe, move, i) => ((i.type === 'ice' || i.type === 'dark') && (foe.frozen > 0 || foe.status.slow > 0) ? 1.5 : 1),
  },
  galeWings: {
    name: 'Gale Wings', desc: 'At over half HP, its Flying moves recharge 40% faster.',
    onUse(g, me, move) {
      if (move.type === 'flying' && me.hp > me.maxHp / 2 && me.cooldowns[move.id]) me.cooldowns[move.id] *= 0.6;
    },
  },
  magicGuard: { name: 'Magic Guard', desc: 'Only takes damage from direct attacks: no burn, poison, sandstorm or recoil damage.', noIndirect: true },
  marvelScale: {
    name: 'Marvel Scale', desc: 'Takes 30% less damage while it has a status condition.',
    takeMult: (g, me) => (me.frozen > 0 || ['burn', 'poison', 'para', 'slow', 'stun', 'sleep'].some(k => me.status[k] > 0) ? 0.7 : 1),
  },
  moldBreaker: { name: 'Mold Breaker', desc: "Its attacks ignore the foe's defensive abilities.", moldBreaker: true },
  triFury: {
    name: 'Tri-Fury', desc: 'Every third attack it uses is unleashed by all three heads: +40% damage.',
    onUse(g, me, move) {
      if (move.cat === 'status' || move.ultimate) return;
      me.ab.n = ((me.ab.n ?? 0) + 1) % 3;
      if (me.ab.n === 0) g.abilityPop(me, 'Three heads strike!');
    },
    dealMult: (g, me) => (me.ab.n === 0 && me.action ? 1.4 : 1),
    pill: me => [`FURY ${((me.ab.n ?? 0) % 3) + 1}/3`, '#6a3a8a'],
  },
  analytic: {
    name: 'Analytic', desc: 'Hits 30% harder against a foe that is attacking or recovering from an attack.',
    dealMult: (g, me, foe) => (foe.action || foe.busy > 0 ? 1.3 : 1),
  },
};

const NONE = { name: '—', desc: '' };
for (const [id, a] of Object.entries(ABILITIES)) a.id = id;

export function abilityOf(mon) {
  return (mon && ABILITIES[mon.species.ability]) || NONE;
}
