// Element reactions between two attacks that meet. `win` is the element that comes out on top;
// the other attack is destroyed. keep: the winner's remaining power; combine: the two merge into one
// stronger attack (sum of both × 0.75) that also carries `status`.
const RULES = [
  { win: 'fire', lose: 'ice', label: 'MELTED!', fx: 'steam', keep: 0.85, color: '#ffb070' },
  { win: 'water', lose: 'fire', label: 'EXTINGUISHED!', fx: 'steam', keep: 0.75, color: '#9fd8ff' },
  { win: 'electric', lose: 'water', label: 'ELECTRIFIED!', fx: 'shock', combine: true, status: ['para', 0.5], color: '#fff27a' },
  { win: 'ice', lose: 'water', label: 'FROZEN SOLID!', fx: 'frost', keep: 1, status: ['slow', 0.6], color: '#bfefff' },
  { win: 'fire', lose: 'grass', label: 'BURNED AWAY!', fx: 'ember', keep: 1.1, color: '#ff8a3d' },
  { win: 'ground', lose: 'electric', label: 'GROUNDED!', fx: 'dust', keep: 0.9, color: '#d8b878' },
  { win: 'grass', lose: 'water', label: 'SOAKED UP!', fx: 'spark', keep: 1.05, color: '#8ad84f' },
  { win: 'fire', lose: 'bug', label: 'SCORCHED!', fx: 'ember', keep: 1, color: '#ff8a3d' },
  { win: 'electric', lose: 'flying', label: 'ZAPPED!', fx: 'shock', keep: 0.9, color: '#fff27a' },
  { win: 'rock', lose: 'fire', label: 'SMOTHERED!', fx: 'dust', keep: 0.8, color: '#c8b080' },
  { win: 'fairy', lose: 'dragon', label: 'DISPELLED!', fx: 'spark', keep: 1, color: '#ffc8e4' },
  { win: 'dark', lose: 'psychic', label: 'DEVOURED!', fx: 'spark', keep: 0.9, color: '#c8a0ff' },
  { win: 'fire', lose: 'flying', label: 'FANNED!', fx: 'ember', combine: true, status: ['burn', 0.4], color: '#ffb070' },
];

export function reactionBetween(a, b) {
  return RULES.find(r => (r.win === a && r.lose === b) || (r.win === b && r.lose === a)) ?? null;
}

// Hit reactions are separate from projectile clashes. One aura is consumed per reaction.
export const HIT_REACTIONS = [
  { id: 'freeze', pair: ['water', 'ice'], label: 'FLASH FREEZE', fx: 'frost', color: '#bfefff', bonus: 0.08, status: 'freeze', duration: 1.6 },
  { id: 'conduct', pair: ['water', 'electric'], label: 'CONDUCTION', fx: 'shock', color: '#fff27a', bonus: 0.18, radius: 90, chains: 2 },
  { id: 'wildfire', pair: ['fire', 'grass'], label: 'WILDFIRE', fx: 'ember', color: '#ff8a3d', bonus: 0.12, status: 'burn', duration: 6 },
  { id: 'melt', pair: ['fire', 'ice'], label: 'MELT', fx: 'steam', color: '#cdefff', bonus: 0.08, cleanse: true },
  { id: 'steam', pair: ['water', 'fire'], label: 'STEAM', fx: 'steam', color: '#dceeff', bonus: 0, cleanse: true },
  { id: 'ground', pair: ['ground', 'electric'], label: 'GROUNDED', fx: 'dust', color: '#d8b878', bonus: 0, ground: true },
  { id: 'fan', pair: ['fire', 'flying'], label: 'FANNED FLAMES', fx: 'ember', color: '#ffb070', bonus: 0.08, status: 'burn', duration: 4.5, radius: 65, chains: 1 },
];
export const AURA_WINDOW = 4;
export function hitReaction(target, type, now, move) {
  const aura = target.elementAura;
  if (!aura || aura.until <= now || (target.reactionUntil ?? 0) > now) return null;
  const rule = HIT_REACTIONS.find(r => r.pair.includes(aura.type) && r.pair.includes(type) && aura.type !== type);
  // Contact Flying moves are not wind attacks.
  if (!rule || (rule.id === 'fan' && type === 'flying' && move.cat !== 'special')) return null;
  return rule;
}
export function primeElement(target, type, now) {
  if (['water', 'ice', 'electric', 'fire', 'grass', 'ground'].includes(type)) target.elementAura = { type, until: now + AURA_WINDOW };
}
