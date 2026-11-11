// Held items: one per Pokémon, chosen in the team builder (its kit). Hooks work like abilities
// (data/abilities.js): dealMult / takeMult / crit / evade / absorb / endure / onDeal / onTake / onEnter / tick /
// speedMult / onUse / onStatus / onDebuffed, plus flags. One-use items call g.useUpItem(mon) and are gone
// for the rest of the battle (Harvest and Cud Chew can bring a berry back). Every item shows itself when
// it acts: the item banner (g.itemPop) names it.
import { isContact, isPunch, abilityOf } from './abilities.js';
import { cleanMoves } from './movepool.js';

const dec = (me, k, dt) => (me.it[k] = Math.max(0, (me.it[k] ?? 0) - dt));
const STATUSES = ['burn', 'poison', 'para', 'slow', 'stun', 'sleep'];

// A berry eaten when HP falls to a quarter (half with Gluttony); Ripen doubles it, Cheek Pouch adds a heal.
function berry(name, desc, effect) {
  return {
    name, desc, berry: true, color: '#e05a8a',
    eat: effect, // Pluck and Bug Bite: the attacker eats it at once
    tick(g, me) {
      const at = abilityOf(me).id === 'gluttony' ? 0.5 : name === 'Sitrus Berry' ? 0.5 : 0.25;
      if (me.hp > me.maxHp * at || !me.alive) return;
      g.eatBerry(me, () => effect(g, me, abilityOf(me).id === 'ripen' ? 2 : 1));
    },
  };
}

// +20% to one type's moves.
const TYPE_ITEMS = {
  charcoal: ['Charcoal', 'fire'], mysticWater: ['Mystic Water', 'water'], magnet: ['Magnet', 'electric'], miracleSeed: ['Miracle Seed', 'grass'],
  neverMeltIce: ['Never-Melt Ice', 'ice'], blackBelt: ['Black Belt', 'fighting'], poisonBarb: ['Poison Barb', 'poison'], softSand: ['Soft Sand', 'ground'],
  sharpBeak: ['Sharp Beak', 'flying'], twistedSpoon: ['Twisted Spoon', 'psychic'], silverPowder: ['Silver Powder', 'bug'], hardStone: ['Hard Stone', 'rock'],
  spellTag: ['Spell Tag', 'ghost'], dragonFang: ['Dragon Fang', 'dragon'], blackGlasses: ['Black Glasses', 'dark'], metalCoat: ['Metal Coat', 'steel'],
  silkScarf: ['Silk Scarf', 'normal'], fairyFeather: ['Fairy Feather', 'fairy'],
};

export const ITEMS = {
  leftovers: {
    name: 'Leftovers', desc: 'Restores 1.5% of max HP every 1.5s.', color: '#d8784a',
    tick(g, me, dt) {
      if ((me.it.t = (me.it.t ?? 0) + dt) < 1.5 || me.hp >= me.maxHp) return;
      me.it.t = 0;
      g.heal(me, me.maxHp * 0.015);
    },
  },
  blackSludge: {
    name: 'Black Sludge', desc: 'Poison types restore 1.5% max HP every 1.5s; anyone else loses it.', color: '#8a4aa8',
    tick(g, me, dt) {
      if ((me.it.t = (me.it.t ?? 0) + dt) < 1.5) return;
      me.it.t = 0;
      if (me.species.types.includes('poison')) { if (me.hp < me.maxHp) g.heal(me, me.maxHp * 0.015); } else g.dotDamage(me, 0.015, '#8a4aa8');
    },
  },
  lifeOrb: {
    name: 'Life Orb', desc: 'Its attacks hit 25% harder, but each one costs it 3% of its max HP.', color: '#c84ad8',
    dealMult: () => 1.25,
    onDeal(g, me, foe, move) {
      if (me.it.cd > 0 || move.ultimate) return;
      me.it.cd = 0.5;
      g.dotDamage(me, 0.03, '#c84ad8');
    },
    tick: (g, me, dt) => dec(me, 'cd', dt),
  },
  choiceBand: {
    name: 'Choice Band', desc: 'Physical moves hit 35% harder, but every move takes 25% longer to recharge.', color: '#e0b030',
    dealMult: (g, me, f, move) => (move.cat === 'physical' ? 1.35 : 1),
    onUse(g, me, move) { if (me.cooldowns[move.id]) me.cooldowns[move.id] *= 1.25; },
  },
  choiceSpecs: {
    name: 'Choice Specs', desc: 'Special moves hit 35% harder, but every move takes 25% longer to recharge.', color: '#4a8ae0',
    dealMult: (g, me, f, move) => (move.cat === 'special' ? 1.35 : 1),
    onUse(g, me, move) { if (me.cooldowns[move.id]) me.cooldowns[move.id] *= 1.25; },
  },
  choiceScarf: {
    name: 'Choice Scarf', desc: 'Moves 25% faster, but every move takes 25% longer to recharge.', color: '#e04a6a',
    speedMult: () => 1.25,
    onUse(g, me, move) { if (me.cooldowns[move.id]) me.cooldowns[move.id] *= 1.25; },
  },
  focusSash: {
    name: 'Focus Sash', desc: 'At full HP, survives a knockout blow with 1 HP. One use.', color: '#f0a040',
    endure(g, me, dmg) {
      if (me.hp < me.maxHp) return dmg;
      g.itemPop(me, 'It hung on using its Focus Sash!');
      g.useUpItem(me);
      return me.hp - 1;
    },
  },
  assaultVest: { name: 'Assault Vest', desc: 'Takes 30% less from special moves.', color: '#7a5a3a', takeMult: (g, me, a, move) => (move.cat === 'special' ? 0.7 : 1) },
  rockyHelmet: {
    name: 'Rocky Helmet', desc: 'Contact attackers lose 4% of their max HP.', color: '#a08a60',
    onTake(g, me, atk, move, dmg, i) {
      if (!i.contact || !atk.alive) return;
      g.dotDamage(atk, 0.04, '#a08a60');
      g.itemPop(me, 'The helmet hurt the attacker!', true);
    },
  },
  expertBelt: { name: 'Expert Belt', desc: 'Super-effective hits deal 20% more.', color: '#3a3a3a', dealMult: (g, me, f, m, i) => (i.eff > 1 ? 1.2 : 1) },
  scopeLens: { name: 'Scope Lens', desc: 'Critical-hit chance +12%.', color: '#4ad8a0', crit: () => 0.12 },
  quickClaw: { name: 'Quick Claw', desc: 'Its moves recharge 10% faster.', color: '#d8c84a', cdRate: 1.1 },
  brightPowder: {
    name: 'Bright Powder', desc: 'Sometimes (8%) dazzles an attack so it misses.', color: '#f8f0c0',
    evade(g, me) {
      if (Math.random() > 0.08) return false;
      g.itemPop(me, 'The attack missed in the glare!', true);
      return true;
    },
  },
  shellBell: { name: 'Shell Bell', desc: 'Heals 1/8 of the damage it deals.', color: '#f0d8b0', onDeal: (g, me, foe, move, dmg) => dmg > 0 && g.heal(me, dmg / 8) },
  kingsRock: {
    name: "King's Rock", desc: 'Its attacks may make the foe flinch (8%).', color: '#d8b030',
    onDeal(g, me, foe) { if (foe.alive && Math.random() < 0.08 && g.applyStatus(foe, 'stun', { source: me })) g.itemPop(me, 'The foe flinched!', true); },
  },
  loadedDice: { name: 'Loaded Dice', desc: 'Multi-hit moves hit 20% harder.', color: '#e0e0f0', dealMult: (g, me, f, m) => ((m.shot?.spread?.length ?? 0) > 1 || (m.melee?.hits?.length ?? 0) > 1 ? 1.2 : 1) },
  punchingGlove: { name: 'Punching Glove', desc: 'Punches hit 10% harder and never make contact.', color: '#e04a3a', dealMult: (g, me, f, m) => (isPunch(m) ? 1.1 : 1), noContactPunch: true },
  weaknessPolicy: {
    name: 'Weakness Policy', desc: 'A super-effective hit raises its attack sharply (+50% for 8s). One use.', color: '#9a4ad8',
    onTake(g, me, atk, move, dmg, i) {
      if (i.eff <= 1 || !me.alive) return;
      g.buff(me, 'atk', 1.5, 8);
      g.itemPop(me, 'The Weakness Policy activated!');
      g.useUpItem(me);
    },
  },
  airBalloon: {
    name: 'Air Balloon', desc: 'Floats over Ground moves until it is hit. One use.', color: '#e0505a', levitating: true,
    onEnter: (g, me) => g.itemPop(me, 'It floats in the air with its Air Balloon!'),
    absorb(g, me, atk, move, i) {
      if (i.type !== 'ground') return false;
      g.itemPop(me, 'It floated over the attack!', true);
      return 'NO EFFECT';
    },
    onTake(g, me) {
      g.itemPop(me, 'Its Air Balloon popped!');
      g.useUpItem(me);
    },
  },
  heavyDutyBoots: { name: 'Heavy-Duty Boots', desc: 'Unharmed by entry hazards (Stealth Rock, Spikes…).', color: '#5a4a3a', hazardProof: true },
  clearAmulet: { name: 'Clear Amulet', desc: "The foe can't lower its stats.", color: '#c8f0ff', noDebuff: true },
  covertCloak: { name: 'Covert Cloak', desc: "The added effects of moves (burns, flinches…) can't touch it.", color: '#3a5a6a', covert: true },
  whiteHerb: {
    name: 'White Herb', desc: 'Restores lowered stats once.', color: '#f0f0f0',
    onDebuffed(g, me) {
      for (const [k, b] of Object.entries(me.buffs)) if (b.m < 1) delete me.buffs[k];
      for (const [k, n] of Object.entries(me.stages)) if (n < 0) me.stages[k] = 0;
      g.itemPop(me, 'Its White Herb restored its stats!');
      g.useUpItem(me);
    },
  },
  boosterEnergy: { name: 'Booster Energy', desc: 'Powers up Protosynthesis or Quark Drive without sun or terrain.', color: '#5ad8c8' },
  flameOrb: {
    name: 'Flame Orb', desc: 'Burns its holder 3s after it enters (for Guts or Flare Boost).', color: '#ff7a2a',
    tick(g, me, dt) { if ((me.it.t = (me.it.t ?? 0) + dt) >= 3 && !me.it.done) { me.it.done = true; g.applyStatus(me, 'burn', {}); } },
  },
  toxicOrb: {
    name: 'Toxic Orb', desc: 'Poisons its holder 3s after it enters (for Guts, Toxic Boost or Poison Heal).', color: '#a040a0',
    tick(g, me, dt) { if ((me.it.t = (me.it.t ?? 0) + dt) >= 3 && !me.it.done) { me.it.done = true; g.applyStatus(me, 'poison', {}); } },
  },
  // Weather rocks: the matching weather lasts 40s instead of 25s when this Pokémon starts it.
  dampRock: { name: 'Damp Rock', desc: 'Rain it starts lasts 40s instead of 25s.', color: '#5a8ef0', rock: 'rain' },
  heatRock: { name: 'Heat Rock', desc: 'Harsh sunlight it starts lasts 40s instead of 25s.', color: '#ff7a2a', rock: 'sun' },
  smoothRock: { name: 'Smooth Rock', desc: 'A sandstorm it starts lasts 40s instead of 25s.', color: '#c8a060', rock: 'sand' },
  icyRock: { name: 'Icy Rock', desc: 'Snow it starts lasts 40s instead of 25s.', color: '#9fd8ff', rock: 'snow' },
  safetyGoggles: { name: 'Safety Goggles', desc: 'Unharmed by sandstorms; powder and spore moves can\'t touch it.', color: '#3a8a5a', powderProof: true },
  terrainExtender: { name: 'Terrain Extender', desc: 'Terrains it creates last 30s instead of 20s.', color: '#8ad84a', terrainTime: 30 },
  sitrusBerry: berry('Sitrus Berry', 'Restores 25% of max HP when it falls below half.', (g, me, k) => g.heal(me, me.maxHp * 0.25 * k)),
  lumBerry: {
    name: 'Lum Berry', desc: 'Cures its first status condition. One use.', berry: true, color: '#5ad86a',
    eat(g, me) { me.status = {}; me.frozen = 0; },
    onStatus(g, me) { g.eatBerry(me, () => { me.status = {}; me.frozen = 0; }); },
  },
  liechiBerry: berry('Liechi Berry', 'Raises attack 30% when it falls to a quarter HP.', (g, me, k) => g.buff(me, 'atk', 1 + 0.3 * k, 10)),
  salacBerry: berry('Salac Berry', 'Raises speed 30% when it falls to a quarter HP.', (g, me, k) => g.buff(me, 'spd', 1 + 0.3 * k, 10)),
  ...Object.fromEntries(Object.entries(TYPE_ITEMS).map(([id, [name, type]]) => [id, {
    name, desc: `${type[0].toUpperCase()}${type.slice(1)} moves hit 20% harder.`, type, dealMult: (g, me, f, m, i) => (i.type === type ? 1.2 : 1),
  }])),
};
for (const [id, it] of Object.entries(ITEMS)) it.id = id;

export const ITEM_LIST = Object.keys(ITEMS);

// The item a Pokémon is holding right now (Klutz can't use one; a used or knocked-off item is gone; raid
// bosses never hold one).
export function itemOf(mon) {
  const id = mon?.item;
  return id && !mon.boss && !(mon.itemOff > 0) && !abilityOf(mon).noItem ? ITEMS[id] ?? null : null;
}

export const TERA_TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];

// A kit is what a Pokémon brings: { item, tera, shiny, moves }. Anything unknown is dropped, so the server can
// accept kits straight from a client. Shiny is cosmetic and only kept when `shinyOk` says the player owns it.
// moves is the four picked from its pool (data/movepool.js), or null for its default four.
export function cleanKit(species, kit, shinyOk = () => false) {
  const k = kit && typeof kit === 'object' ? kit : {};
  return {
    item: ITEMS[k.item] ? k.item : null,
    tera: TERA_TYPES.includes(k.tera) ? k.tera : species.types[0],
    shiny: !!k.shiny && shinyOk(species.id),
    moves: cleanMoves(species, k.moves),
  };
}

// A sensible kit for a computer trainer's Pokémon, from its stats.
export function randomKit(species, rand = Math.random) {
  const pick = list => list[Math.floor(rand() * list.length)];
  const physical = species.atk >= (species.spa ?? species.atk), bulky = species.hp >= 1400 || species.def >= 1.12, fast = species.speed >= 100;
  const typeItem = Object.keys(ITEMS).find(id => ITEMS[id].type === species.types[0]);
  const pool = ['lifeOrb', 'sitrusBerry', 'expertBelt', typeItem, physical ? 'choiceBand' : 'choiceSpecs', fast ? 'choiceScarf' : 'focusSash',
    ...(bulky ? ['leftovers', 'assaultVest', 'rockyHelmet'] : ['scopeLens', 'weaknessPolicy'])].filter(Boolean);
  return { item: pick(pool), tera: rand() < 0.6 ? species.types[0] : pick(TERA_TYPES), shiny: false };
}
