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
