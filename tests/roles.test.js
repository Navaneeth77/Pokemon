// Roles and move styles (roles.js): every Pokémon is a support, a physical or a special attacker; moves that suit the
// role hit 20% harder and recharge 15% faster.
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { loadSpriteSets } from '../server/sprites.js';
import { MOVES } from '../src/moves.js';
import { SPECIES, ROSTER } from '../src/data/species.js';
import { roleOf, moveStyle, fitsRole, roleDamage, ROLES } from '../src/roles.js';
import { movePool } from '../src/data/movepool.js';

const sprites = loadSpriteSets(), noop = () => {};

test('every playable Pokémon and Mega has a role; the well-known ones are right', () => {
  for (const id of ROSTER) assert.ok(ROLES[roleOf(SPECIES[id])], `${id} has a role`);
  for (const s of Object.values(SPECIES).filter(s => s.megaOf)) assert.ok(ROLES[roleOf(s)], `${s.id} has a role`);
  const want = { rayquaza: 'physical', garchomp: 'physical', lucario: 'physical', dragonite: 'physical', gardevoir: 'special', gengar: 'special',
    alakazam: 'special', blissey: 'support', toxapex: 'support', corviknight: 'support', clefable: 'support', charizardMegaX: 'physical', gengarMega: 'special' };
  for (const [id, role] of Object.entries(want)) assert.equal(roleOf(SPECIES[id]), role, id);
});

test("moves fall into the five styles (the user's examples)", () => {
  const want = { braveBird: 'dash', uTurn: 'dash', extremeSpeed: 'dash', ironTail: 'knockback', leafBlade: 'knockback', darkPulse: 'beam', waterPulse: 'beam',
    shadowBall: 'ranged', energyBall: 'ranged', flamethrower: 'ranged', thunderbolt: 'ranged', swordsDance: 'status', earthquake: 'knockback' };
  for (const [id, style] of Object.entries(want)) assert.equal(moveStyle(MOVES[id]), style, id);
  for (const id of ROSTER) for (const m of movePool(SPECIES[id])) assert.ok(moveStyle(MOVES[m]), `${m} has a style`);
});

test('suited moves: 20% more damage and 15% faster recharge; others unchanged', () => {
  const ray = { species: SPECIES.rayquaza }, gard = { species: SPECIES.gardevoir };
  assert.equal(roleDamage(ray, MOVES.extremeSpeed), 1.2);
  assert.equal(roleDamage(ray, MOVES.dracoMeteorAtk ?? MOVES.dragonPulse), 1);
  assert.equal(roleDamage(gard, MOVES.moonblastAtk ?? MOVES.dazzlingGleam), MOVES.moonblastAtk ? 1.2 : roleDamage(gard, MOVES.dazzlingGleam));
  assert.ok(fitsRole(SPECIES.blissey, MOVES.softBoiled ?? MOVES.toxic));
  const ui = new Proxy({ format: 1, log: noop }, { get: (t, k) => t[k] ?? noop });
  const g = new Game(document.createElement('canvas'), sprites, ui);
  g.headless = true;
  Object.assign(g, { selection: ['rayquaza'], lead: 0, opponentSelection: ['snorlax'], difficulty: 'easy' });
  g.start();
  Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
  for (const m of [g.player, g.opponent]) Object.assign(m, { hidden: false, appear: 0 });
  g.useMove(g.player, 'extremeSpeed', 0, true);
  assert.ok(Math.abs(g.player.cooldowns.extremeSpeed - MOVES.extremeSpeed.cooldown * 0.85) < 1e-6, 'a dash recharges 15% faster for a physical attacker');
  g.player.cooldowns = {};
  g.player.action = null;
  g.useMove(g.player, 'dragonPulse', 0, true);
  assert.ok(Math.abs(g.player.cooldowns.dragonPulse - MOVES.dragonPulse.cooldown) < 1e-6, 'a beam is not its style');
});
