// Official abilities for the National Dex roster, adapted to real-time battles. Same hooks as abilities.js.
// Every one shows itself when it acts: the ability banner and flare (g.abilityPop), stat arrows, a HUD tag
// or an aura while it is active. `weak` marks abilities that hardly matter in battle; a species only uses
// one when it has nothing better (see officialAbility in abilities.js).
import { isContact, isPunch, typesOf, abilityOf } from './abilities.js';
import { Ripple } from '../effects.js';
import { ITEMS } from './items.js';

const STATUSES = ['burn', 'poison', 'para', 'freeze', 'slow', 'stun', 'sleep'];
const dec = (me, k, dt) => (me.ab[k] = Math.max(0, (me.ab[k] ?? 0) - dt));
const hasStatus = me => me.frozen > 0 || STATUSES.some(k => me.status[k] > 0);
const onField = mon => mon?.alive && !mon.hidden;
const special = move => move.cat === 'special';
const physical = move => move.cat === 'physical';

function boost(test, mult, boostText) {
  return { dealMult: (g, me, foe, move, i) => (test(move, i, me, foe, g) ? mult : 1), boostText };
}

function guard(test, mult, guardText) {
  return { takeMult: (g, me, atk, move, i) => (test(move, i, me, atk, g) ? mult : 1), guardText };
}

// Hits of `test` pass harmlessly by.
function immuneTo(test, text) {
  return {
    absorb(g, me, atk, move, i) {
      if (!test(move, i)) return false;
      g.spawn(new Ripple(me));
      g.abilityPop(me, text);
      return 'NO EFFECT';
    },
  };
}

// Hits of one type are drunk in and turned into something useful.
function drinks(type, text, effect) {
  return {
    absorb(g, me, atk, move, i) {
      if (i.type !== type) return false;
      effect(g, me, i);
      g.abilityPop(me, text);
      return 'ABSORBED!';
    },
  };
}

// A bonus active while `test` holds: announced when it switches on, with a HUD tag and an aura.
function whileOn(test, text, label, color, extra = {}) {
  return {
    color,
    tick(g, me, dt) {
      const on = !!test(g, me);
      if (on && !me.ab.on) g.abilityPop(me, text);
      me.ab.on = on;
      extra.tickOn?.(g, me, dt);
    },
    pill: me => (me.ab.on ? [label, color] : null),
    glow: me => (me.ab.on ? ['#ffffff', color, color] : null),
    ...extra,
  };
}

const inWeather = w => (g, me) => g.weather === w;
const weatherSpeed = (w, label, color, text) => whileOn(inWeather(w), text, label, color, { speedMult: me => (me.ab.on ? 1.35 : 1) });
const weatherDodge = (w, label, color) => whileOn(inWeather(w), 'Hidden by the weather!', label, color, {
  evade(g, me) {
    if (!me.ab.on || Math.random() > 0.2) return false;
    g.abilityPop(me, 'It slipped out of sight!');
    return true;
  },
});
const weatherHeal = (w, label, color) => whileOn(inWeather(w), 'Restoring health!', label, color, {
  tickOn(g, me, dt) {
    if (!me.ab.on || (me.ab.ht = (me.ab.ht ?? 0) + dt) < 1.5) return;
    me.ab.ht = 0;
    g.heal(me, me.maxHp * 0.02);
  },
});

// Contact attacks against it hurt or hinder the attacker.
function punish(chance, text, effect) {
  return {
    onTake(g, me, atk, move, dmg, i) {
      if (!i.contact || !atk.alive || Math.random() > chance) return;
      effect(g, me, atk);
      g.abilityPop(me, text);
    },
  };
}
const contactPoison = (chance, name, text) => punish(chance, text, (g, me, atk) => g.applyStatus(atk, name, { source: me }));

// A stat rises when it is hit by something matching `test`.
function hitRaises(test, stat, mult, dur, text, cd = 1) {
  return {
    onTake(g, me, atk, move, dmg, i) {
      if (!me.alive || me.ab.cd > 0 || !test(move, i, me)) return;
      me.ab.cd = cd;
      g.buff(me, stat, mult, dur);
      g.abilityPop(me, text);
    },
    tick: (g, me, dt) => dec(me, 'cd', dt),
  };
}

// Its own attacks may leave a status behind.
function inflicts(test, name, chance, text) {
  return {
    onDeal(g, me, foe, move, dmg, i) {
      if (!foe.alive || !test(move, i) || Math.random() > chance) return;
      if (g.applyStatus(foe, name, { source: me })) g.abilityPop(me, text);
    },
  };
}

// Knocking out a foe raises a stat.
function onKO(stat, mult, text) {
  return { onKO(g, me) {
    g.buff(me, stat, mult, 8);
    g.abilityPop(me, text);
  } };
}

// Weather and terrain setters.
const surge = (kind, text) => ({ onEnter(g, me) {
  g.setTerrain(kind, 20);
  g.abilityPop(me, text);
} });

const statusShield = (names, name, desc) => ({ name, desc, immune: names, weak: true });
const typeBoost = (type, mult, text) => boost((m, i) => i.type === type, mult, text);

export const OFFICIAL = {
  // ── Weather, terrain and the field ──
  snowWarning: { name: 'Snow Warning', desc: 'Summons snow while on the field: Ice types take 30% less physical damage.', weather: 'snow' },
  airLock: { name: 'Air Lock', desc: 'While it is on the field, the weather has no effect.', noWeather: true, onEnter: (g, me) => g.abilityPop(me, 'The effects of weather disappeared!') },
  cloudNine: { name: 'Cloud Nine', desc: 'While it is on the field, the weather has no effect.', noWeather: true, onEnter: (g, me) => g.abilityPop(me, 'The effects of weather disappeared!') },
  electricSurge: { name: 'Electric Surge', desc: 'Turns the arena into Electric Terrain for 20s on entry: grounded Electric moves +30%, no sleep.', ...surge('electric', 'An electric current ran across the arena!') },
  grassySurge: { name: 'Grassy Surge', desc: 'Turns the arena into Grassy Terrain for 20s on entry: grounded Grass moves +30%, grounded Pokémon slowly heal.', ...surge('grassy', 'Grass grew across the arena!') },
  psychicSurge: { name: 'Psychic Surge', desc: 'Turns the arena into Psychic Terrain for 20s on entry: grounded Psychic moves +30%.', ...surge('psychic', 'The arena got weird!') },
  mistySurge: { name: 'Misty Surge', desc: 'Turns the arena into Misty Terrain for 20s on entry: grounded Pokémon resist Dragon moves and status.', ...surge('misty', 'Mist swirled across the arena!') },
  sandSpit: {
    name: 'Sand Spit', desc: 'Getting hit whips up a sandstorm for 15s.',
    onTake(g, me) {
      if (g.weather === 'sand' || me.ab.cd > 0) return;
      me.ab.cd = 10;
      g.setWeather('sand', 15);
      g.abilityPop(me, 'It spat out sand!');
    },
    tick: (g, me, dt) => dec(me, 'cd', dt),
  },
  seedSower: {
    name: 'Seed Sower', desc: 'Getting hit turns the arena into Grassy Terrain.',
    onTake(g, me) {
      if (g.terrain?.kind === 'grassy') return;
      g.setTerrain('grassy', 15);
      g.abilityPop(me, 'Seeds sprouted across the arena!');
    },
  },
  hadronEngine: {
    name: 'Hadron Engine', desc: 'Turns the arena into Electric Terrain on entry; special moves +30% in Electric Terrain.',
    ...surge('electric', 'It summoned Electric Terrain!'), dealMult: (g, me, f, move) => (g.terrain?.kind === 'electric' && special(move) ? 1.3 : 1),
  },
  neutralizingGas: { name: 'Neutralizing Gas', desc: "While it is on the field, the foe's ability does nothing.", gas: true, onEnter: (g, me) => g.abilityPop(me, 'Neutralizing gas filled the area!') },

  // ── On entry ──
  unnerve: { name: 'Unnerve', desc: 'Makes the foe too nervous to focus: its ultimate charges 15% slower.', foeUltMult: 0.85, onEnter: (g, me) => g.abilityPop(me, 'The foe is too nervous!') },
  frisk: { name: 'Frisk', weak: true, desc: "On entry, checks the foe's held item.", onEnter: (g, me) => g.abilityPop(me, ITEMS[me.foe?.item] ? `The foe holds ${ITEMS[me.foe.item].name}!` : 'The foe holds nothing!') },
  anticipation: {
    name: 'Anticipation', weak: true, desc: 'On entry, shudders if the foe knows a super-effective move, and dodges 25% further for 8s.',
    onEnter(g, me) {
      g.abilityPop(me, 'It shuddered!');
      me.ab.dodge = 8;
    },
    tick: (g, me, dt) => dec(me, 'dodge', dt),
  },
  forewarn: { name: 'Forewarn', weak: true, desc: "On entry, reads the foe's strongest move.", onEnter: (g, me) => g.abilityPop(me, `It foresaw ${me.foe?.species.ultimate ? "the foe's ultimate" : 'an attack'}!`) },
  download: {
    name: 'Download', desc: 'On entry, compares the foe\'s defences: raises attack 20% for 10s.',
    onEnter(g, me) {
      g.buff(me, 'atk', 1.2, 10);
      g.abilityPop(me, 'Attack rose!');
    },
  },
  trace: {
    name: 'Trace', desc: "On entry, copies the foe's ability.",
    onEnter(g, me) {
      const id = me.foe?.species.ability;
      if (!onField(me.foe) || !id || id === 'trace' || id === 'neutralizingGas') return;
      me.abilityOverride = id;
      g.abilityPop(me, `It traced ${abilityOf(me.foe).name}!`);
      abilityOf(me).onEnter?.(g, me);
    },
  },
  supersweetSyrup: {
    name: 'Supersweet Syrup', desc: "On entry, a sickly sweet scent slows the foe for 6s.",
    onEnter(g, me) {
      if (!onField(me.foe)) return;
      g.buff(me.foe, 'spd', 0.8, 6, me);
      g.abilityPop(me, 'A sweet scent filled the air!');
    },
  },
  ...Object.fromEntries([['beadsOfRuin', 'Beads of Ruin', 'def'], ['swordOfRuin', 'Sword of Ruin', 'def'], ['tabletsOfRuin', 'Tablets of Ruin', 'atk'], ['vesselOfRuin', 'Vessel of Ruin', 'atk']].map(([id, name, stat]) => [id, {
    name, desc: `While it is on the field, the foe's ${stat === 'atk' ? 'attack' : 'defence'} is 20% lower.`, color: '#b06ad8',
    onEnter(g, me) {
      if (onField(me.foe)) g.abilityPop(me, `The foe's ${stat === 'atk' ? 'attack' : 'defence'} weakened!`);
    },
    [stat === 'atk' ? 'takeMult' : 'dealMult']: () => 0.8 ** (stat === 'atk' ? 1 : -1),
    boostText: 'Its ruin weakened the foe!', guardText: 'Its ruin weakened the attack!',
  }])),
  zeroToHero: {
    name: 'Zero to Hero', desc: 'After switching out once, it returns as a hero: +30% damage.',
    onLeave(g, me) { me.hero = true; },
    onEnter(g, me) { if (me.hero) g.abilityPop(me, 'It underwent a heroic transformation!'); },
    dealMult: (g, me) => (me.hero ? 1.3 : 1),
    pill: me => (me.hero ? ['HERO', '#3a8ae8'] : null),
  },

  // ── Knock-outs ──
  moxie: { name: 'Moxie', desc: 'Knocking out a foe raises attack 20% for 8s.', ...onKO('atk', 1.2, 'Its confidence soared! Attack rose!') },
  chillingNeigh: { name: 'Chilling Neigh', desc: 'Knocking out a foe raises attack 20% for 8s.', ...onKO('atk', 1.2, 'A chilling neigh! Attack rose!') },
  grimNeigh: { name: 'Grim Neigh', desc: 'Knocking out a foe raises attack 20% for 8s.', ...onKO('atk', 1.2, 'A grim neigh! Attack rose!') },
  beastBoost: {
    name: 'Beast Boost', desc: 'Knocking out a foe raises its best stat for 8s.',
    onKO(g, me) {
      const s = me.species, stat = s.speed > 95 && s.speed / 100 > Math.max(s.atk, s.def) ? 'spd' : s.def > Math.max(s.atk, s.spa ?? 0) ? 'def' : 'atk';
      g.buff(me, stat, 1.25, 8);
      g.abilityPop(me, 'Its power surged!');
    },
  },
  supremeOverlord: {
    name: 'Supreme Overlord', desc: 'Hits 8% harder for each fainted teammate.',
    dealMult: (g, me) => 1 + 0.08 * (g.teamOf?.(me)?.members.filter(m => !m.alive).length ?? 0),
    onEnter(g, me) { if (g.teamOf?.(me)?.members.some(m => !m.alive)) g.abilityPop(me, 'It gained strength from its fallen allies!'); },
  },
  aftermath: {
    name: 'Aftermath', desc: 'Knocked out by a contact move, it blasts the attacker for 15% of its max HP.',
    onFaint(g, me, by, move) {
      if (!by?.alive || !move || !isContact(move)) return;
      g.abilityPop(me, 'It exploded as it fainted!');
      g.dotDamage(by, 0.15, '#ff9a5a');
    },
  },
  innardsOut: {
    name: 'Innards Out', desc: 'Knocked out, it hits back for 20% of its max HP.',
    onFaint(g, me, by) {
      if (!by?.alive) return;
      g.abilityPop(me, 'It lashed out as it fainted!');
      g.dotDamage(by, Math.min(0.3, (me.maxHp * 0.2) / by.maxHp), '#ff6a8a');
    },
  },

  // ── When hit ──
  weakArmor: {
    name: 'Weak Armor', desc: 'Physical hits lower its defence and raise its speed sharply.',
    onTake(g, me, atk, move) {
      if (!physical(move) || me.ab.cd > 0 || !me.alive) return;
      me.ab.cd = 3;
      g.buff(me, 'def', 0.85, 5);
      g.buff(me, 'spd', 1.3, 5);
      g.abilityPop(me, 'Armor shed: speed rose!');
    },
    tick: (g, me, dt) => dec(me, 'cd', dt),
  },
  stamina: { name: 'Stamina', desc: 'Getting hit raises defence 15% for 5s.', ...hitRaises(() => true, 'def', 1.15, 5, 'Defence rose!', 2) },
  rattled: {
    name: 'Rattled', desc: 'Bug, Dark and Ghost hits, or being intimidated, raise its speed 30%.',
    ...hitRaises((m, i) => ['bug', 'dark', 'ghost'].includes(i.type), 'spd', 1.3, 5, 'Speed rose!'),
    onIntimidated(g, me) {
      g.buff(me, 'spd', 1.3, 5);
      g.abilityPop(me, 'Rattled: speed rose!');
    },
  },
  waterCompaction: { name: 'Water Compaction', desc: 'Water hits raise its defence sharply.', ...hitRaises((m, i) => i.type === 'water', 'def', 1.4, 6, 'Defence rose sharply!') },
  steamEngine: { name: 'Steam Engine', desc: 'Fire and Water hits raise its speed drastically.', ...hitRaises((m, i) => i.type === 'fire' || i.type === 'water', 'spd', 1.5, 6, 'Full steam ahead!') },
  thermalExchange: { name: 'Thermal Exchange', desc: "Fire hits raise its attack; it can't be burned.", immune: ['burn'], ...hitRaises((m, i) => i.type === 'fire', 'atk', 1.2, 5, 'Attack rose!') },
  electromorphosis: {
    name: 'Electromorphosis', desc: 'Getting hit charges it: its next Electric move hits 60% harder.',
    onTake(g, me) {
      if (!me.ab.charged) g.abilityPop(me, 'It became charged!');
      me.ab.charged = true;
    },
    dealMult(g, me, foe, move, i) {
      if (i.type !== 'electric' || !me.ab.charged) return 1;
      me.ab.charged = false;
      return 1.6;
    },
    pill: me => (me.ab.charged ? ['CHARGED', '#e0b000'] : null),
  },
  windPower: {
    name: 'Wind Power', desc: 'Wind moves charge it: its next Electric move hits 60% harder.',
    onTake(g, me, atk, move) {
      if (!move.wind) return;
      me.ab.charged = true;
      g.abilityPop(me, 'The wind charged it!');
    },
    dealMult(g, me, foe, move, i) {
      if (i.type !== 'electric' || !me.ab.charged) return 1;
      me.ab.charged = false;
      return 1.6;
    },
    pill: me => (me.ab.charged ? ['CHARGED', '#e0b000'] : null),
  },
  berserk: {
    name: 'Berserk', desc: 'Dropping below half HP raises its attack 30% for 8s.',
    onTake(g, me, atk, move, dmg) {
      if (me.ab.done || !me.alive || me.hp > me.maxHp / 2 || me.hp + dmg <= me.maxHp / 2) return;
      me.ab.done = true;
      g.buff(me, 'atk', 1.3, 8);
      g.abilityPop(me, 'It went berserk!');
    },
  },
  angerShell: {
    name: 'Anger Shell', desc: 'Dropping below half HP raises attack and speed but lowers defence.',
    onTake(g, me, atk, move, dmg) {
      if (me.ab.done || !me.alive || me.hp > me.maxHp / 2 || me.hp + dmg <= me.maxHp / 2) return;
      me.ab.done = true;
      g.buff(me, 'atk', 1.3, 8);
      g.buff(me, 'spd', 1.3, 8);
      g.abilityPop(me, 'Its shell cracked with anger!');
    },
  },
  cottonDown: { name: 'Cotton Down', desc: 'Getting hit scatters cotton that slows the attacker.', ...punish(1, 'Cotton fluff scattered!', (g, me, atk) => g.buff(atk, 'spd', 0.8, 4, me)) },
  gooey: { name: 'Gooey', desc: 'Contact with it slows the attacker for 4s.', ...punish(1, 'The attacker got stuck in goo!', (g, me, atk) => g.buff(atk, 'spd', 0.75, 4, me)) },
  tanglingHair: { name: 'Tangling Hair', desc: 'Contact with it slows the attacker for 4s.', ...punish(1, 'Tangled the attacker!', (g, me, atk) => g.buff(atk, 'spd', 0.75, 4, me)) },
  roughSkin: { name: 'Rough Skin', desc: 'Contact with it hurts the attacker (3% of its max HP).', ...punish(1, 'Rough skin cut the attacker!', (g, me, atk) => g.dotDamage(atk, 0.03, '#d8b878')) },
  ironBarbs: { name: 'Iron Barbs', desc: 'Contact with it hurts the attacker (3% of its max HP).', ...punish(1, 'Iron barbs pierced the attacker!', (g, me, atk) => g.dotDamage(atk, 0.03, '#c8d0e0')) },
  poisonPoint: { name: 'Poison Point', desc: 'Contact with it may poison the attacker (30%).', ...contactPoison(0.3, 'poison', 'Poisoned the attacker!') },
  effectSpore: {
    name: 'Effect Spore', desc: 'Contact with it may poison, paralyse or put the attacker to sleep (30%).',
    ...punish(0.3, 'Spores burst out!', (g, me, atk) => g.applyStatus(atk, ['poison', 'para', 'sleep'][Math.floor(Math.random() * 3)], { source: me })),
  },
  cuteCharm: { name: 'Cute Charm', desc: 'Contact with it may charm the attacker, lowering its attack (30%).', ...punish(0.3, 'The attacker was charmed!', (g, me, atk) => g.buff(atk, 'atk', 0.8, 5, me)) },
  mummy: { name: 'Mummy', desc: "Contact with it switches off the attacker's ability for 10s.", ...punish(1, "The attacker's ability was wrapped up!", (g, me, atk) => (atk.abilityOff = 10)) },
  lingeringAroma: { name: 'Lingering Aroma', desc: "Contact with it switches off the attacker's ability for 10s.", ...punish(1, 'A lingering aroma clung to the attacker!', (g, me, atk) => (atk.abilityOff = 10)) },
  wanderingSpirit: { name: 'Wandering Spirit', desc: "Contact with it switches off the attacker's ability for 6s.", ...punish(0.5, 'Its spirit wandered into the attacker!', (g, me, atk) => (atk.abilityOff = 6)) },
  perishBody: { name: 'Perish Body', weak: true, desc: 'Contact with it slows the attacker.', ...punish(0.5, 'A chilling touch!', (g, me, atk) => g.applyStatus(atk, 'slow', { source: me })) },
  synchronize: {
    name: 'Synchronize', desc: 'When it gets burned, poisoned or paralysed, the foe that did it gets the same.',
    onStatus(g, me, name, source) {
      if (!['burn', 'poison', 'para'].includes(name) || !source || source === me || !source.alive) return;
      g.abilityPop(me, 'It synchronised the status!');
      g.applyStatus(source, name, {});
    },
  },
  colorChange: {
    name: 'Color Change', desc: 'Takes on the type of the last move that hit it.',
    onTake(g, me, atk, move, dmg, i) {
      if (!me.alive || me.typeOverride?.[0] === i.type) return;
      me.typeOverride = [i.type];
      g.abilityPop(me, `It became ${i.type.toUpperCase()}-type!`);
    },
  },
  gulpMissile: {
    name: 'Gulp Missile', desc: 'After using a Water move it holds prey; the next foe to hit it takes 10% of its max HP.',
    onUse(g, me, move) {
      if (move.type === 'water' && !me.ab.prey) {
        me.ab.prey = true;
        g.abilityPop(me, 'It caught some prey!');
      }
    },
    onTake(g, me, atk) {
      if (!me.ab.prey || !atk.alive) return;
      me.ab.prey = false;
      g.dotDamage(atk, 0.1, '#5aa6f0');
      g.abilityPop(me, 'It spat out its prey!');
    },
    pill: me => (me.ab.prey ? ['GULPING', '#3a8ae8'] : null),
  },

  // ── Its own attacks ──
  hugePower: { name: 'Huge Power', desc: 'Physical moves hit 35% harder.', ...boost(m => physical(m), 1.35, 'Huge power!') },
  purePower: { name: 'Pure Power', desc: 'Physical moves hit 35% harder.', ...boost(m => physical(m), 1.35, 'Pure power!') },
  hustle: { name: 'Hustle', desc: 'Physical moves hit 25% harder.', ...boost(m => physical(m), 1.25, 'Hustling!') },
  guts: { name: 'Guts', desc: 'While it has a status condition, physical moves hit 40% harder.', ...boost((m, i, me) => physical(m) && hasStatus(me), 1.4, 'Guts!') },
  flareBoost: { name: 'Flare Boost', desc: 'While burned, special moves hit 40% harder.', ...boost((m, i, me) => special(m) && me.status.burn > 0, 1.4, 'Flare boost!') },
  toxicBoost: { name: 'Toxic Boost', desc: 'While poisoned, physical moves hit 40% harder.', ...boost((m, i, me) => physical(m) && me.status.poison > 0, 1.4, 'Toxic boost!') },
  sheerForce: { name: 'Sheer Force', desc: 'Moves with an added effect hit 30% harder but lose the effect.', sheerForce: true },
  reckless: { name: 'Reckless', desc: 'Moves with recoil hit 20% harder.', ...boost(m => !!m.recoil, 1.2, 'Reckless!') },
  rockHead: { name: 'Rock Head', desc: 'Takes no recoil damage.', rockHead: true },
  skillLink: { name: 'Skill Link', desc: 'Multi-hit moves hit 30% harder.', ...boost(m => (m.shot?.spread?.length ?? 0) > 1 || (m.melee?.hits?.length ?? 0) > 1, 1.3, 'Every hit landed!') },
  megaLauncher: { name: 'Mega Launcher', desc: 'Pulse and aura moves hit 40% harder.', ...boost(m => !!m.pulse, 1.4, 'Mega launch!') },
  strongJaw: { name: 'Strong Jaw', desc: 'Biting moves hit 40% harder.', ...boost(m => !!m.bite, 1.4, 'Strong jaw!') },
  punkRock: { name: 'Punk Rock', desc: 'Sound moves hit 30% harder; takes half damage from them.', ...boost(m => !!m.sound, 1.3, 'Punk rock!'), takeMult: (g, me, atk, move) => (move.sound ? 0.5 : 1) },
  liquidVoice: { name: 'Liquid Voice', desc: 'Sound moves become Water-type.', convert: { test: m => !!m.sound, to: 'water', mult: 1 } },
  sniper: { name: 'Sniper', desc: 'Critical hits deal 2× instead of 1.5×.', critDmg: 2 },
  merciless: { name: 'Merciless', desc: 'Always lands critical hits on poisoned foes.', crit: (move, foe) => (foe?.status.poison > 0 ? 1 : 0) },
  tintedLens: { name: 'Tinted Lens', desc: 'Resisted moves hit with normal power.', tinted: true },
  scrappy: { name: 'Scrappy', desc: "Normal and Fighting moves hit Ghost types; it can't be intimidated.", scrappy: true, noIntimidate: true },
  mindsEye: { name: "Mind's Eye", desc: "Normal and Fighting moves hit Ghost types, and evasion abilities don't fool it.", scrappy: true, keenEye: true, noIntimidate: true },
  noGuard: { name: 'No Guard', desc: "Its attacks can't be dodged, and it can't dodge attacks either.", noGuard: true, onEnter: (g, me) => g.abilityPop(me, 'No guard: every blow will land!') },
  infiltrator: { name: 'Infiltrator', desc: 'Its attacks slip through shields and barriers.', infiltrator: true },
  unaware: { name: 'Unaware', desc: "Ignores the foe's stat changes when attacking and being attacked.", unaware: true },
  stakeout: { name: 'Stakeout', desc: 'Hits a foe that just came in (3s) twice as hard.', ...boost((m, i, me, foe, g) => g.time - (foe.enteredAt ?? -99) < 3, 2, 'Stakeout!') },
  neuroforce: { name: 'Neuroforce', desc: 'Super-effective hits deal 25% more.', ...boost((m, i) => i.eff > 1, 1.25, 'Neuroforce!') },
  waterBubble: {
    name: 'Water Bubble', desc: "Water moves hit 50% harder; takes half damage from Fire and can't be burned.", immune: ['burn'],
    ...typeBoost('water', 1.5, 'Water bubble!'), takeMult: (g, me, atk, move, i) => (i.type === 'fire' ? 0.5 : 1),
  },
  steelworker: { name: 'Steelworker', desc: 'Steel moves hit 30% harder.', ...typeBoost('steel', 1.3) },
  steelySpirit: { name: 'Steely Spirit', desc: 'Steel moves hit 30% harder.', ...typeBoost('steel', 1.3) },
  rockyPayload: { name: 'Rocky Payload', desc: 'Rock moves hit 30% harder.', ...typeBoost('rock', 1.3) },
  sandForce: { name: 'Sand Force', desc: 'In a sandstorm, Rock, Ground and Steel moves hit 30% harder; immune to sandstorm damage.', sandProof: true, ...boost((m, i, me, f, g) => g.weather === 'sand' && ['rock', 'ground', 'steel'].includes(i.type), 1.3, 'Sand force!') },
  solarPower: whileOn(inWeather('sun'), 'Soaking up the sun!', 'SOLAR POWER', '#ff9a3a', {
    name: 'Solar Power', desc: 'In harsh sunlight, special moves hit 40% harder but it loses 1% HP every second.',
    dealMult: (g, me, f, move) => (me.ab.on && special(move) ? 1.4 : 1),
    tickOn(g, me, dt) {
      if (!me.ab.on || (me.ab.st = (me.ab.st ?? 0) + dt) < 1) return;
      me.ab.st = 0;
      g.dotDamage(me, 0.01, '#ff9a3a');
    },
  }),
  normalize: { name: 'Normalize', desc: 'All its moves become Normal-type and hit 20% harder.', convert: { test: () => true, to: 'normal', mult: 1.2 } },
  refrigerate: { name: 'Refrigerate', desc: 'Normal-type moves become Ice-type and hit 20% harder.', convert: { from: 'normal', to: 'ice', mult: 1.2 } },
  aerilate: { name: 'Aerilate', desc: 'Normal-type moves become Flying-type and hit 20% harder.', convert: { from: 'normal', to: 'flying', mult: 1.2 } },
  galvanize: { name: 'Galvanize', desc: 'Normal-type moves become Electric-type and hit 20% harder.', convert: { from: 'normal', to: 'electric', mult: 1.2 } },
  protean: {
    name: 'Protean', desc: 'Becomes the type of the move it is about to use.',
    onUse(g, me, move) {
      if (move.ultimate || me.typeOverride?.[0] === move.type) return;
      me.typeOverride = [move.type];
      g.abilityPop(me, `It became ${move.type.toUpperCase()}-type!`);
    },
  },
  poisonTouch: { name: 'Poison Touch', desc: 'Its contact moves may poison the foe (30%).', ...inflicts((m, i) => i.contact, 'poison', 0.3, 'Poisoned the foe!') },
  toxicChain: { name: 'Toxic Chain', desc: 'Its attacks may badly poison the foe (25%).', ...inflicts(() => true, 'poison', 0.25, 'A toxic chain!') },
  corrosion: { name: 'Corrosion', desc: 'Can poison even Steel and Poison types.', corrosion: true, ...inflicts((m, i) => i.type === 'poison', 'poison', 0.2, 'It corroded the foe!') },
  stench: { name: 'Stench', weak: true, desc: 'Its attacks may make the foe flinch (10%).', ...inflicts(() => true, 'stun', 0.1, 'The stench made the foe flinch!') },
  compoundEyes: { name: 'Compound Eyes', desc: 'Its ranged moves land with precision: +10% damage and +10% critical-hit chance.', ...boost(m => special(m), 1.1, 'Precise aim!'), crit: m => (special(m) ? 0.1 : 0) },
  keenEye: { name: 'Keen Eye', weak: true, desc: "Evasion abilities don't fool it.", keenEye: true },
  victoryStar: { name: 'Victory Star', desc: '+10% damage and +10% critical-hit chance.', dealMult: () => 1.1, crit: () => 0.1 },
  defeatist: {
    name: 'Defeatist', desc: 'Below half HP it loses heart: deals 40% less damage.', color: '#8a8aa8',
    dealMult: (g, me) => (me.hp < me.maxHp / 2 ? 0.6 : 1),
    tick(g, me) {
      const on = me.hp < me.maxHp / 2;
      if (on && !me.ab.on) g.abilityPop(me, 'It lost its will to fight!');
      me.ab.on = on;
    },
    pill: me => (me.ab.on ? ['DEFEATIST', '#6a6a88'] : null),
  },
  truant: {
    name: 'Truant', desc: 'After each attack it loafs around for 1.4s before it can attack again.', color: '#a8a878',
    onUse(g, me, move) {
      if (move.cat === 'status' || move.ultimate) return;
      me.ab.loaf = 1.4;
      g.abilityPop(me, 'It is loafing around!');
    },
    tick(g, me, dt) {
      if (!(me.ab.loaf > 0)) return;
      dec(me, 'loaf', dt);
      for (const id in me.cooldowns) me.cooldowns[id] = Math.max(me.cooldowns[id], me.ab.loaf);
    },
    pill: me => (me.ab.loaf > 0 ? ['LOAFING', '#8a8a6a'] : null),
  },
  slowStart: {
    name: 'Slow Start', desc: 'For its first 8s on the field, its attack and speed are halved.', color: '#a0a0b8',
    onEnter(g, me) {
      me.ab.slow = 8;
      g.abilityPop(me, "It can't get it going!");
    },
    tick(g, me, dt) {
      if (!(me.ab.slow > 0)) return;
      dec(me, 'slow', dt);
      if (me.ab.slow <= 0) g.abilityPop(me, 'It finally got its act together!');
    },
    dealMult: (g, me) => (me.ab.slow > 0 ? 0.5 : 1),
    speedMult: me => (me.ab.slow > 0 ? 0.5 : 1),
    pill: me => (me.ab.slow > 0 ? [`SLOW START ${Math.ceil(me.ab.slow)}`, '#6a6a88'] : null),
  },
  moody: {
    name: 'Moody', desc: 'Every 6s one stat rises sharply and another falls.',
    tick(g, me, dt) {
      if ((me.ab.t = (me.ab.t ?? 0) + dt) < 6) return;
      me.ab.t = 0;
      const stats = ['atk', 'def', 'spd'].sort(() => Math.random() - 0.5);
      g.buff(me, stats[0], 1.4, 6);
      g.buff(me, stats[1], 0.9, 6);
      g.abilityPop(me, 'Its mood swung!');
    },
  },
  prankster: {
    name: 'Prankster', desc: 'Its status moves recharge 40% faster.',
    onUse(g, me, move) {
      if (move.cat === 'status' && me.cooldowns[move.id]) me.cooldowns[move.id] *= 0.6;
    },
  },
  triage: {
    name: 'Triage', desc: 'Its healing and draining moves recharge 40% faster.',
    onUse(g, me, move) {
      if ((move.drain || move.util?.kind === 'heal') && me.cooldowns[move.id]) me.cooldowns[move.id] *= 0.6;
    },
  },
  hungerSwitch: {
    name: 'Hunger Switch', desc: 'Every 8s it switches between Full Belly and Hangry (Dark moves +25%).',
    tick(g, me, dt) {
      if ((me.ab.t = (me.ab.t ?? 0) + dt) < 8) return;
      me.ab.t = 0;
      me.ab.hangry = !me.ab.hangry;
      g.abilityPop(me, me.ab.hangry ? 'It got hangry!' : 'Its belly is full!');
    },
    dealMult: (g, me, f, m, i) => (me.ab.hangry && i.type === 'dark' ? 1.25 : 1),
    pill: me => [me.ab.hangry ? 'HANGRY' : 'FULL BELLY', me.ab.hangry ? '#6a3a8a' : '#d8a820'],
  },

  // ── Defence ──
  sturdy: {
    name: 'Sturdy', desc: 'At full HP, a blow that would knock it out leaves it with 1 HP.',
    endure(g, me, dmg) {
      if (me.hp < me.maxHp) return dmg;
      g.spawn(new Ripple(me, '#e8dcc0'));
      g.abilityPop(me, 'It endured the hit!');
      return me.hp - 1;
    },
  },
  furCoat: { name: 'Fur Coat', desc: 'Takes 40% less damage from physical moves.', ...guard(m => physical(m), 0.6, 'Its fur softened the blow!') },
  iceScales: { name: 'Ice Scales', desc: 'Takes 40% less damage from special moves.', ...guard(m => special(m), 0.6, 'Its scales deflected it!') },
  fluffy: {
    name: 'Fluffy', desc: 'Takes 40% less from contact moves but 60% more from Fire.',
    takeMult: (g, me, atk, move, i) => (i.contact ? 0.6 : 1) * (i.type === 'fire' ? 1.6 : 1), guardText: 'The fluff cushioned it!',
  },
  heatproof: { name: 'Heatproof', desc: 'Takes half damage from Fire moves and burns.', ...guard((m, i) => i.type === 'fire', 0.5, 'Heatproof!'), statusDur: n => (n === 'burn' ? 0.5 : 1) },
  filter: { name: 'Filter', desc: 'Super-effective hits deal 25% less.', ...guard((m, i) => i.eff > 1, 0.75, 'It filtered the hit!') },
  prismArmor: { name: 'Prism Armor', desc: 'Super-effective hits deal 25% less.', ...guard((m, i) => i.eff > 1, 0.75, 'Its prism armor dulled it!') },
  battleArmor: { name: 'Battle Armor', desc: 'Immune to critical hits and takes 10% less damage.', noCrit: true, takeMult: () => 0.9 },
  wonderGuard: {
    name: 'Wonder Guard', desc: 'Only super-effective hits really hurt it: everything else deals 85% less.',
    takeMult: (g, me, atk, move, i) => (i.eff > 1 ? 1 : 0.15), guardText: 'A mysterious power protected it!',
  },
  teraShell: { name: 'Tera Shell', desc: 'At full HP every hit is resisted.', ...guard((m, i, me) => me.hp >= me.maxHp, 0.6, 'Its shell gleamed!') },
  purifyingSalt: { name: 'Purifying Salt', desc: 'Immune to status conditions; takes half damage from Ghost moves.', immune: STATUSES, ...guard((m, i) => i.type === 'ghost', 0.5, 'The salt purified it!') },
  goodAsGold: { name: 'Good as Gold', desc: "Its stats can't be lowered and status moves can't touch it.", noDebuff: true, immune: ['slow', 'stun', 'sleep'] },
  comatose: { name: 'Comatose', desc: 'Drowsing forever: immune to every status condition.', immune: STATUSES },
  shieldsDown: {
    name: 'Shields Down', desc: 'Above half HP its shell blocks status and 25% of damage; below, it hits 30% harder.',
    blockStatus: (g, me) => me.hp > me.maxHp / 2,
    takeMult: (g, me) => (me.hp > me.maxHp / 2 ? 0.75 : 1),
    dealMult: (g, me) => (me.hp <= me.maxHp / 2 ? 1.3 : 1),
    pill: me => [me.hp > me.maxHp / 2 ? 'METEOR FORM' : 'CORE FORM', me.hp > me.maxHp / 2 ? '#a08a60' : '#e04a4a'],
  },
  schooling: {
    name: 'Schooling', desc: 'Above a quarter HP it fights as a school: takes 30% less and deals 30% more.',
    takeMult: (g, me) => (me.hp > me.maxHp / 4 ? 0.7 : 1),
    dealMult: (g, me) => (me.hp > me.maxHp / 4 ? 1.3 : 1),
    pill: me => (me.hp > me.maxHp / 4 ? ['SCHOOL', '#3a8ae8'] : null),
    glow: me => (me.hp > me.maxHp / 4 ? ['#ffffff', '#86ccff', '#3a8ae8'] : null),
  },
  disguise: {
    name: 'Disguise', desc: 'Its disguise takes the first hit for it.',
    onEnter(g, me) { me.ab.mask ??= true; },
    takeMult(g, me) {
      if (!me.ab.mask) return 1;
      me.ab.mask = false;
      g.spawn(new Ripple(me, '#f0e0a0'));
      g.abilityPop(me, 'Its disguise was busted!');
      return 0.05;
    },
    pill: me => (me.ab.mask ? ['DISGUISED', '#c8a018'] : null),
  },
  iceFace: {
    name: 'Ice Face', desc: 'Its ice face takes the first physical hit; snow restores it.',
    onEnter(g, me) { me.ab.mask ??= true; },
    takeMult(g, me, atk, move) {
      if (!me.ab.mask || !physical(move)) return 1;
      me.ab.mask = false;
      g.abilityPop(me, 'Its ice face shattered!');
      return 0.05;
    },
    tick(g, me) {
      if (!me.ab.mask && g.weather === 'snow') {
        me.ab.mask = true;
        g.abilityPop(me, 'Its ice face was restored!');
      }
    },
    pill: me => (me.ab.mask ? ['ICE FACE', '#7ab8e8'] : null),
  },
  overcoat: { name: 'Overcoat', desc: 'Unharmed by sandstorms; spores and powders bounce off.', sandProof: true, immune: ['sleep'] },
  suctionCups: { name: 'Suction Cups', desc: 'Anchored in place: hits can\'t knock it back.', kbMult: 0 },
  heavyMetal: { name: 'Heavy Metal', desc: 'So heavy it barely budges: 60% less knockback.', kbMult: 0.4 },
  lightMetal: { name: 'Light Metal', desc: 'Light on its feet: 15% faster, but knocked back further.', speedMult: () => 1.15, kbMult: 1.3 },
  bulletproof: { name: 'Bulletproof', desc: 'Ball and bomb moves bounce off it.', ...immuneTo(m => !!m.bullet, 'It is bulletproof!') },
  soundproof: { name: 'Soundproof', desc: 'Sound moves have no effect on it.', ...immuneTo(m => !!m.sound, 'It blocked out the sound!') },
  armorTail: { name: 'Armor Tail', desc: 'Lightning-fast priority strikes have no effect on it.', ...immuneTo(m => !!m.priority, 'Its tail blocked the strike!') },
  queenlyMajesty: { name: 'Queenly Majesty', desc: 'Lightning-fast priority strikes have no effect on it.', ...immuneTo(m => !!m.priority, 'Its majesty repelled the strike!') },
  dazzling: { name: 'Dazzling', desc: 'Lightning-fast priority strikes have no effect on it.', ...immuneTo(m => !!m.priority, 'It dazzled the attacker!') },
  earthEater: { name: 'Earth Eater', desc: 'Ground moves heal it instead (25% of their damage).', ...drinks('ground', 'It ate the earth!', (g, me, i) => g.heal(me, i.dmg * 0.25)) },
  wellBakedBody: { name: 'Well-Baked Body', desc: 'Fire moves raise its defence sharply instead of hurting.', ...drinks('fire', 'Defence rose sharply!', (g, me) => g.buff(me, 'def', 1.4, 6)) },
  sapSipper: { name: 'Sap Sipper', desc: 'Grass moves raise its attack 30% instead of hurting.', ...drinks('grass', 'Attack rose!', (g, me) => g.buff(me, 'atk', 1.3, 5)) },
  stormDrain: { name: 'Storm Drain', desc: 'Water moves raise its attack 30% instead of hurting.', ...drinks('water', 'It drew in the water!', (g, me) => g.buff(me, 'atk', 1.3, 5)) },
  motorDrive: { name: 'Motor Drive', desc: 'Electric moves raise its speed 30% instead of hurting.', ...drinks('electric', 'Speed rose!', (g, me) => g.buff(me, 'spd', 1.3, 5)) },
  drySkin: {
    name: 'Dry Skin', desc: 'Water moves heal it; Fire hurts 25% more. Rain heals it, harsh sun saps it.',
    ...drinks('water', 'It soaked up the water!', (g, me, i) => g.heal(me, i.dmg * 0.25)),
    takeMult: (g, me, atk, move, i) => (i.type === 'fire' ? 1.25 : 1),
    weatherTick(g, me, dt, w) {
      if ((w !== 'rain' && w !== 'sun') || (me.ab.wt = (me.ab.wt ?? 0) + dt) < 1.5) return;
      me.ab.wt = 0;
      if (w === 'rain') g.heal(me, me.maxHp * 0.02);
      else g.dotDamage(me, 0.015, '#ff9a3a');
    },
  },
  guardDog: { name: 'Guard Dog', desc: "Intimidate raises its attack instead; it can't be knocked back much.", guardDog: true, kbMult: 0.5 },
  oblivious: { name: 'Oblivious', weak: true, desc: "Too oblivious to be intimidated or charmed.", noIntimidate: true },
  ownTempo: { name: 'Own Tempo', weak: true, desc: "Goes at its own pace: can't be intimidated or stunned.", noIntimidate: true, immune: ['stun'] },
  hyperCutter: { name: 'Hyper Cutter', weak: true, desc: "Its attack can't be lowered.", keepStat: 'atk' },
  bigPecks: { name: 'Big Pecks', weak: true, desc: "Its defence can't be lowered.", keepStat: 'def' },
  whiteSmoke: { name: 'White Smoke', desc: "Its stats can't be lowered.", noDebuff: true },
  mirrorArmor: { name: 'Mirror Armor', desc: 'Stat drops aimed at it are reflected back at the foe.', mirror: true },
  defiant: {
    name: 'Defiant', desc: 'When the foe lowers its stats, its attack rises 30%.',
    onDebuffed(g, me) {
      g.buff(me, 'atk', 1.3, 6);
      g.abilityPop(me, 'Defiant! Attack rose!');
    },
  },
  competitive: {
    name: 'Competitive', desc: 'When the foe lowers its stats, its attack rises 30%.',
    onDebuffed(g, me) {
      g.buff(me, 'atk', 1.3, 6);
      g.abilityPop(me, 'Competitive! Attack rose!');
    },
  },
  contrary: { name: 'Contrary', desc: 'Stat changes work in reverse: drops become boosts.', contrary: true },
  simple: { name: 'Simple', desc: 'Stat changes on it are doubled.', simple: true },
  steadfast: { name: 'Steadfast', weak: true, desc: 'Being stunned or flinching raises its speed.', onStatus(g, me, name) {
    if (name !== 'stun') return;
    g.buff(me, 'spd', 1.3, 4);
    g.abilityPop(me, 'Speed rose!');
  } },
  emergencyExit: {
    name: 'Emergency Exit', desc: 'Dropping below half HP gives it a burst of speed and an instant dodge.',
    onTake(g, me, atk, move, dmg) {
      if (me.ab.done || !me.alive || me.hp > me.maxHp / 2 || me.hp + dmg <= me.maxHp / 2) return;
      me.ab.done = true;
      me.dodgeCD = 0;
      g.buff(me, 'spd', 1.5, 4);
      g.abilityPop(me, 'It is making a run for it!');
    },
  },

  // ── Status ──
  limber: statusShield(['para'], 'Limber', "Can't be paralysed."),
  immunity: statusShield(['poison'], 'Immunity', "Can't be poisoned."),
  pastelVeil: statusShield(['poison'], 'Pastel Veil', "Can't be poisoned."),
  waterVeil: statusShield(['burn'], 'Water Veil', "Can't be burned."),
  magmaArmor: statusShield(['freeze'], 'Magma Armor', "Can't be frozen."),
  vitalSpirit: statusShield(['sleep', 'stun'], 'Vital Spirit', "Can't fall asleep or be stunned."),
  sweetVeil: statusShield(['sleep'], 'Sweet Veil', "Can't fall asleep."),
  flowerVeil: { name: 'Flower Veil', weak: true, desc: "Its stats can't be lowered.", noDebuff: true },
  aromaVeil: statusShield(['stun'], 'Aroma Veil', "Can't be stunned."),
  leafGuard: whileOn(inWeather('sun'), 'Shielded by the sun!', 'LEAF GUARD', '#62b947', {
    name: 'Leaf Guard', weak: true, desc: "In harsh sunlight it can't get status conditions.", blockStatus: (g, me) => g.weather === 'sun',
  }),
  hydration: whileOn(inWeather('rain'), 'The rain is washing it clean!', 'HYDRATION', '#5a8ef0', {
    name: 'Hydration', desc: 'In the rain its status conditions are washed away.',
    tickOn(g, me) {
      if (me.ab.on && hasStatus(me)) {
        me.status = {};
        me.frozen = 0;
        g.abilityPop(me, 'Its status was washed away!');
      }
    },
  }),
  shedSkin: {
    name: 'Shed Skin', desc: 'Every 3s, it has a 1-in-3 chance to shed off a status condition.',
    tick(g, me, dt) {
      if ((me.ab.t = (me.ab.t ?? 0) + dt) < 3) return;
      me.ab.t = 0;
      if (!hasStatus(me) || Math.random() > 0.33) return;
      me.status = {};
      g.abilityPop(me, 'It shed its skin and its status!');
    },
  },
  earlyBird: { name: 'Early Bird', weak: true, desc: 'Wakes up twice as fast.', statusDur: n => (n === 'sleep' ? 0.5 : 1) },
  quickFeet: { name: 'Quick Feet', desc: 'While it has a status condition, it is 40% faster.', speedMult: me => (hasStatus(me) ? 1.4 : 1), pill: me => (hasStatus(me) ? ['QUICK FEET', '#ff9a5a'] : null) },
  poisonHeal: { name: 'Poison Heal', desc: 'Poison heals it instead of hurting.', poisonHeal: true },

  // ── Weather ──
  swiftSwim: weatherSpeed('rain', 'SWIFT SWIM', '#5a8ef0', 'It swims swiftly in the rain!'),
  chlorophyll: weatherSpeed('sun', 'CHLOROPHYLL', '#62b947', 'The sunlight sped it up!'),
  sandRush: weatherSpeed('sand', 'SAND RUSH', '#c8a060', 'It rushes through the sand!'),
  slushRush: weatherSpeed('snow', 'SLUSH RUSH', '#7ab8e8', 'It rushes through the snow!'),
  sandVeil: { ...weatherDodge('sand', 'SAND VEIL', '#c8a060'), name: 'Sand Veil', weak: true, sandProof: true, desc: 'In a sandstorm, it sometimes slips out of sight (20%) and takes no sandstorm damage.' },
  snowCloak: { ...weatherDodge('snow', 'SNOW CLOAK', '#7ab8e8'), name: 'Snow Cloak', weak: true, desc: 'In snow, it sometimes slips out of sight (20%).' },
  rainDish: { ...weatherHeal('rain', 'RAIN DISH', '#5a8ef0'), name: 'Rain Dish', weak: true, desc: 'Heals 2% max HP every 1.5s in the rain.' },
  iceBody: { ...weatherHeal('snow', 'ICE BODY', '#7ab8e8'), name: 'Ice Body', weak: true, desc: 'Heals 2% max HP every 1.5s in snow.' },
  flowerGift: { ...whileOn(inWeather('sun'), 'It bloomed in the sun!', 'FLOWER GIFT', '#ff9ad5', { dealMult: (g, me) => (me.ab.on ? 1.25 : 1), takeMult: (g, me) => (me.ab.on ? 0.85 : 1) }), name: 'Flower Gift', desc: 'In harsh sunlight it hits 25% harder and takes 15% less.' },
  protosynthesis: {
    ...whileOn((g, me) => g.weather === 'sun' || me.item === 'boosterEnergy', 'Protosynthesis activated!', 'PROTOSYNTHESIS', '#ff9a3a', {
      dealMult: (g, me) => (me.ab.on ? 1.3 : 1), speedMult: me => (me.ab.on && me.species.speed >= 100 ? 1.3 : 1),
    }), name: 'Protosynthesis', desc: 'In harsh sunlight (or with Booster Energy) its best stats rise 30%.',
  },
  quarkDrive: {
    ...whileOn((g, me) => g.terrain?.kind === 'electric' || me.item === 'boosterEnergy', 'Quark Drive activated!', 'QUARK DRIVE', '#7ab8ff', {
      dealMult: (g, me) => (me.ab.on ? 1.3 : 1), speedMult: me => (me.ab.on && me.species.speed >= 100 ? 1.3 : 1),
    }), name: 'Quark Drive', desc: 'On Electric Terrain (or with Booster Energy) its best stats rise 30%.',
  },
  surgeSurfer: { ...whileOn((g) => g.terrain?.kind === 'electric', 'It surfs the current!', 'SURGE SURFER', '#ffd84a', { speedMult: me => (me.ab.on ? 1.4 : 1) }), name: 'Surge Surfer', desc: 'On Electric Terrain it is 40% faster.' },
  grassPelt: { ...whileOn((g) => g.terrain?.kind === 'grassy', 'Its pelt toughened!', 'GRASS PELT', '#62b947', { takeMult: (g, me) => (me.ab.on ? 0.75 : 1) }), name: 'Grass Pelt', desc: 'On Grassy Terrain it takes 25% less damage.' },
  forecast: {
    name: 'Forecast', desc: 'Changes type with the weather: Fire in sun, Water in rain, Ice in snow.',
    tick(g, me) {
      const t = { sun: 'fire', rain: 'water', snow: 'ice' }[g.weather] ?? null;
      if ((me.typeOverride?.[0] ?? null) === t) return;
      me.typeOverride = t ? [t] : null;
      if (t) g.abilityPop(me, `It became ${t.toUpperCase()}-type!`);
    },
  },

  // ── Held items ──
  unburden: {
    name: 'Unburden', desc: 'Once its held item is used up or lost, it moves 50% faster.',
    onItemLost(g, me) {
      me.ab.free = true;
      g.abilityPop(me, 'Unburdened: speed rose!');
    },
    speedMult: me => (me.ab.free ? 1.5 : 1),
    pill: me => (me.ab.free ? ['UNBURDEN', '#ff9a5a'] : null),
  },
  gluttony: { name: 'Gluttony', desc: 'Eats its berry at half HP instead of a quarter.' },
  ripen: { name: 'Ripen', desc: 'Its berries work twice as well.' },
  cheekPouch: { name: 'Cheek Pouch', desc: 'Eating a berry also restores 15% of its max HP.', onBerry: (g, me) => g.heal(me, me.maxHp * 0.15) },
  harvest: {
    name: 'Harvest', desc: 'A berry it eats grows back after 10s (4s in harsh sunlight).',
    onBerry(g, me, id) { me.ab.regrow = { id, t: g.weather === 'sun' ? 4 : 10 }; },
    tick(g, me, dt) {
      const r = me.ab.regrow;
      if (!r || me.item || (r.t -= dt) > 0) return;
      me.ab.regrow = null;
      me.item = r.id;
      g.abilityPop(me, `It harvested another ${ITEMS[r.id].name}!`);
    },
  },
  cudChew: {
    name: 'Cud Chew', desc: 'Chews a berry it ate and eats it again 5s later.',
    onBerry(g, me, id) { if (!me.ab.chewed) me.ab.cud = { id, t: 5 }; },
    tick(g, me, dt) {
      const c = me.ab.cud;
      if (!c || me.item || (c.t -= dt) > 0) return;
      me.ab.cud = null;
      me.ab.chewed = true;
      me.item = c.id;
      g.abilityPop(me, 'It chewed its berry again!');
      ITEMS[c.id].tick?.(g, me, 0);
    },
  },
  pickpocket: {
    name: 'Pickpocket', desc: "Contact attacks against it let it steal the attacker's item when its own hands are empty.",
    onTake(g, me, atk, move, dmg, i) {
      if (!i.contact || me.item || !atk.item || !me.alive) return;
      if (g.knockOffItem(atk, me, true)) g.abilityPop(me, 'It picked the attacker\'s pocket!');
    },
  },
  stickyHold: { name: 'Sticky Hold', desc: "Its held item can't be knocked off or stolen.", stickyHold: true },
  shieldDust: { name: 'Shield Dust', desc: 'The added effects of moves (burns, flinches, stat drops) can\'t touch it.', shieldDust: true },
  wonderSkin: { name: 'Wonder Skin', desc: 'The added effects of moves can\'t touch it.', shieldDust: true },
  liquidOoze: { name: 'Liquid Ooze', desc: 'Draining moves used on it hurt the attacker instead of healing it.', liquidOoze: true },
  magnetPull: { name: 'Magnet Pull', desc: "Steel-type foes can't switch out while it is on the field.", shadowTag: foe => typesOf(foe).includes('steel') },
  arenaTrap: { name: 'Arena Trap', desc: "Grounded foes can't switch out while it is on the field.", shadowTag: foe => !foe.species.fly },

  // ── Signature abilities ──
  auraBreak: { name: 'Aura Break', desc: 'Dark and Fairy moves against it deal 25% less.', ...guard((m, i) => i.type === 'dark' || i.type === 'fairy', 0.75, 'It broke the aura!') },
  powerConstruct: {
    name: 'Power Construct', desc: 'Below half HP its cells gather once: it heals 30% of its max HP and its defence rises.', color: '#3aff8a',
    onTake(g, me, atk, move, dmg) {
      if (me.ab.done || !me.alive || me.hp > me.maxHp / 2) return;
      me.ab.done = true;
      g.heal(me, me.maxHp * 0.3);
      g.buff(me, 'def', 1.3, 15);
      g.abilityPop(me, 'Its cells gathered: Complete Forme!');
    },
    glow: me => (me.ab.done ? ['#e8ffe8', '#3aff8a', '#1a6a3a'] : null),
  },
  soulHeart: { name: 'Soul-Heart', desc: 'Every knockout on the field raises its attack.', ...onKO('atk', 1.2, 'Its Soul-Heart blazed: attack rose!') },
  teraShift: {
    name: 'Tera Shift', desc: 'Enters in its Terastal Form: takes 20% less damage.', color: '#7ad8ff',
    onEnter: (g, me) => g.abilityPop(me, 'It transformed into its Terastal Form!'),
    ...guard(() => true, 0.8, 'Its crystal shell held!'),
    glow: () => ['#ffffff', '#b8f0ff', '#7ad8ff'],
  },

  // ── Weak or support abilities (kept so every species has its real one) ──
  runAway: { name: 'Run Away', weak: true, desc: 'Its dodges recharge 15% faster.', dodgeCdMult: 0.85 },
  pickup: { name: 'Pickup', weak: true, desc: 'Picks things up: 10% faster dodge recharge.', dodgeCdMult: 0.9 },
  honeyGather: { name: 'Honey Gather', weak: true, desc: 'Gathers honey: heals 2% when it switches out.', onLeave: (g, me) => me.alive && g.heal(me, me.maxHp * 0.02) },
  illuminate: { name: 'Illuminate', weak: true, desc: 'Lights up the arena: evasion abilities don\'t fool it.', keenEye: true },
  telepathy: { name: 'Telepathy', weak: true, desc: 'Reads minds: dodges recharge 15% faster.', dodgeCdMult: 0.85 },
  tangledFeet: { name: 'Tangled Feet', weak: true, desc: 'Dodges go 20% further.', dodgeDist: 1.2 },
  healer: { name: 'Healer', weak: true, desc: 'Status conditions on it last 30% shorter.', statusMult: 0.7 },
  friendGuard: { name: 'Friend Guard', weak: true, desc: 'Takes 10% less damage.', takeMult: () => 0.9 },
  plus: { name: 'Plus', weak: true, desc: 'Electric moves hit 10% harder.', ...typeBoost('electric', 1.1) },
  minus: { name: 'Minus', weak: true, desc: 'Electric moves hit 10% harder.', ...typeBoost('electric', 1.1) },
  damp: { name: 'Damp', weak: true, desc: 'Dampens the arena: Fire moves against it deal 10% less.', ...guard((m, i) => i.type === 'fire', 0.9) },
  rivalry: { name: 'Rivalry', weak: true, desc: 'Hits Pokémon of its own type 20% harder.', ...boost((m, i, me, foe) => typesOf(foe).some(t => typesOf(me).includes(t)), 1.2, 'Rivalry!') },
  stall: { name: 'Stall', weak: true, desc: 'Takes 10% less damage but moves 10% slower.', takeMult: () => 0.9, speedMult: () => 0.9 },
  klutz: { name: 'Klutz', weak: true, desc: "Can't use held items, but dodges 10% further.", dodgeDist: 1.1, noItem: true },
  symbiosis: { name: 'Symbiosis', weak: true, desc: 'Heals 2% when it switches out.', onLeave: (g, me) => me.alive && g.heal(me, me.maxHp * 0.02) },
  receiver: { name: 'Receiver', weak: true, desc: 'Takes 10% less damage.', takeMult: () => 0.9 },
  powerOfAlchemy: { name: 'Power of Alchemy', weak: true, desc: 'Takes 10% less damage.', takeMult: () => 0.9 },
  dancer: { name: 'Dancer', weak: true, desc: 'Dodges go 20% further.', dodgeDist: 1.2 },
  battery: { name: 'Battery', weak: true, desc: 'Special moves hit 10% harder.', ...boost(m => special(m), 1.1) },
  powerSpot: { name: 'Power Spot', weak: true, desc: 'Moves hit 10% harder.', dealMult: () => 1.1 },
  stalwart: { name: 'Stalwart', weak: true, desc: 'Barely budges: 30% less knockback.', kbMult: 0.7 },
  propellerTail: { name: 'Propeller Tail', weak: true, desc: 'Moves 10% faster.', speedMult: () => 1.1 },
  screenCleaner: { name: 'Screen Cleaner', weak: true, desc: 'Its attacks slip through shields.', infiltrator: true },
  ballFetch: { name: 'Ball Fetch', weak: true, desc: 'Dodges recharge 15% faster.', dodgeCdMult: 0.85 },
  hospitality: { name: 'Hospitality', weak: true, desc: 'Heals 2% when it switches out.', onLeave: (g, me) => me.alive && g.heal(me, me.maxHp * 0.02) },
  myceliumMight: { name: 'Mycelium Might', weak: true, desc: 'Its attacks ignore the foe\'s defensive abilities.', moldBreaker: true },
  costar: { name: 'Costar', weak: true, desc: 'Takes 10% less damage.', takeMult: () => 0.9 },
  curiousMedicine: { name: 'Curious Medicine', weak: true, desc: 'Status conditions on it last 30% shorter.', statusMult: 0.7 },
  mimicry: { name: 'Mimicry', weak: true, desc: 'Takes on the type of the terrain.', tick(g, me) {
    const t = { electric: 'electric', grassy: 'grass', psychic: 'psychic', misty: 'fairy' }[g.terrain?.kind] ?? null;
    if ((me.typeOverride?.[0] ?? null) !== t) me.typeOverride = t ? [t] : null;
  } },
  unseenFist: { name: 'Unseen Fist', desc: 'Its contact moves strike through protective guards.', unseenFist: true },
  opportunist: { name: 'Opportunist', desc: 'When the foe raises a stat, it copies the boost.', tick(g, me) {
    const f = me.foe;
    if (!onField(f)) return;
    for (const [k, b] of Object.entries(f.buffs)) {
      if (b.m > 1 && b.t > 0 && !(me.buffs[k]?.t > 0) && me.ab.copied !== b) {
        me.ab.copied = b;
        g.buff(me, k, b.m, b.t);
        g.abilityPop(me, 'It copied the boost!');
      }
    }
  } },
  rksSystem: {
    name: 'RKS System', desc: 'Takes on the type of the last regular move it used.',
    onUse(g, me, move) {
      if (move.ultimate || me.typeOverride?.[0] === move.type) return;
      me.typeOverride = [move.type];
      g.abilityPop(me, `Its memory switched to ${move.type.toUpperCase()}!`);
    },
  },
};
OFFICIAL.libero = { ...OFFICIAL.protean, name: 'Libero' };
OFFICIAL.wimpOut = { ...OFFICIAL.emergencyExit, name: 'Wimp Out' };
OFFICIAL.windRider = {
  name: 'Wind Rider', desc: 'Wind moves raise its attack instead of hurting it.',
  absorb(g, me, atk, move) {
    if (!move.wind) return false;
    g.buff(me, 'atk', 1.3, 5);
    g.abilityPop(me, 'It rode the wind! Attack rose!');
    return 'ABSORBED!';
  },
};
