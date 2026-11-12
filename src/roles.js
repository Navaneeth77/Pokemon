// Pokémon roles and move styles.
//
// Every Pokémon is a support, a physical attacker or a special attacker (data/smogon.js SMOGON_ROLES, from how Smogon's
// sets play it; a Mega Evolution goes by its own stat changes). Every move has a style:
//   status     casting moves (Swords Dance, Toxic, Reflect)
//   dash       rushes across the arena (Brave Bird, U-turn, Extreme Speed; Fly, Dig)
//   knockback  close-range blows that send the foe flying (Iron Tail, Leaf Blade; Earthquake's shockwave)
//   beam       charged beams and pulses (Dark Pulse, Water Pulse, Ice Beam)
//   ranged     projectiles, jets, bolts and blows from afar (Shadow Ball, Energy Ball, Flamethrower, Thunderbolt)
// Moves that suit the role hit 20% harder and recharge 15% faster: physical attackers with dash and knockback moves,
// special attackers with beam and ranged moves, supports with status moves. Ultimates are outside the system.
import { SMOGON_ROLES } from './data/smogon.js';
import { SPECIES } from './data/species.js';

export const ROLES = {
  physical: { name: 'Physical attacker', short: 'PHYSICAL', color: '#e8603c', fits: ['dash', 'knockback'], blurb: 'Closes in and lands its hits' },
  special: { name: 'Special attacker', short: 'SPECIAL', color: '#8a5cf0', fits: ['beam', 'ranged'], blurb: 'Attacks from a distance' },
  support: { name: 'Support', short: 'SUPPORT', color: '#2fae8f', fits: ['status'], blurb: 'Casts status moves' },
};
export const STYLES = {
  status: { name: 'Status', short: 'STATUS', color: '#8d97b0' },
  dash: { name: 'Dash', short: 'DASH', color: '#f0883e' },
  knockback: { name: 'Knockback', short: 'KNOCKBACK', color: '#e0503a' },
  beam: { name: 'Beam', short: 'BEAM', color: '#3ab8e8' },
  ranged: { name: 'Ranged', short: 'RANGED', color: '#a070f0' },
};
export const ROLE_DAMAGE = 1.2;
export const ROLE_COOLDOWN = 0.85;

const cache = new Map();
// The role of a species (a Mega Evolution: by how its stats change, else its base form's).
export function roleOf(species) {
  if (!species) return 'special';
  if (cache.has(species.id)) return cache.get(species.id);
  let role = SMOGON_ROLES[species.id];
  if (!role && species.megaOf) {
    const base = SPECIES[species.megaOf], baseRole = SMOGON_ROLES[species.megaOf] ?? 'special', f = species.baseStats, b = base?.baseStats;
    if (!f || !b) role = baseRole;
    else if (baseRole === 'support' && Math.max(f.atk, f.spa) < 100) role = 'support';
    else if (f.atk !== f.spa) role = f.atk > f.spa ? 'physical' : 'special';
    else role = f.atk - b.atk > f.spa - b.spa ? 'physical' : f.spa - b.spa > f.atk - b.atk ? 'special' : baseRole;
  }
  role ??= (species.spa ?? species.atk) > species.atk ? 'special' : 'physical';
  cache.set(species.id, role);
  return role;
}

// A move's style (null for ultimates).
export function moveStyle(m) {
  if (!m) return null;
  if (m.cat === 'status' || m.util || m.copy) return 'status';
  if (m.ultimate) return null;
  const k = m.targeting?.kind;
  if (k === 'dash' || m.twoTurn) return 'dash';
  if (k === 'beam') return 'beam';
  if (k === 'melee') return 'knockback';
  if (k === 'area') return (m.officialCat ?? m.cat) === 'special' ? 'ranged' : 'knockback';
  return 'ranged';
}

export const fitsRole = (species, m) => !m?.ultimate && ROLES[roleOf(species)].fits.includes(moveStyle(m));
// The role bonus: damage for a suited attack, recharge for any suited move.
export const roleDamage = (mon, m) => (fitsRole(mon.species, m) && moveStyle(m) !== 'status' ? ROLE_DAMAGE : 1);
export const roleCooldown = (mon, m) => (fitsRole(mon.species, m) ? ROLE_COOLDOWN : 1);
