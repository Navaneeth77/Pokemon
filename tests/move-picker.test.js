// The move picker: each Pokémon brings four moves picked from its competitive pool (data/movepool.js). The pick
// travels in the kit, is cleaned the same way on every client and on the match server, and the battle engine uses
// it everywhere a Pokémon's moves are read (keys 1–4, the AI, Sleep Talk, Encore, the server's input).
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { loadSpriteSets } from '../server/sprites.js';
import { SPECIES, ROSTER } from '../src/data/species.js';
import { MOVES } from '../src/moves.js';
import { cleanKit } from '../src/data/items.js';
import { movePool, cleanMoves } from '../src/data/movepool.js';

const sprites = loadSpriteSets(), noop = () => {};

function battle(me, foe, kits) {
  const ui = new Proxy({ format: 1, log: noop }, { get: (t, k) => t[k] ?? noop });
  const g = new Game(document.createElement('canvas'), sprites, ui);
  g.headless = true;
  Object.assign(g, { selection: [me], lead: 0, opponentSelection: [foe], difficulty: 'easy', kits });
  g.start();
  Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
  g.ai = { update: noop, reset: noop, onThreat: noop };
  g.input = { vector: () => ({ x: 0, y: 0 }), clear: noop };
  for (const m of [g.player, g.opponent]) Object.assign(m, { hidden: false, appear: 0 });
  return g;
}

test('every playable Pokémon has at least four legal moves, all of them real moves', () => {
  for (const id of ROSTER) {
    const pool = movePool(SPECIES[id]);
    assert.ok(pool.length >= 4, `${id} has ${pool.length}`);
    for (const m of pool) assert.ok(MOVES[m], `${id}: ${m} exists`);
    for (const m of SPECIES[id].moves) assert.ok(pool.includes(m), `${id}'s default ${m} is pickable`);
  }
});

test('a picked set is kept in order; illegal, repeated or junk entries are dropped and refilled from the defaults', () => {
  const c = SPECIES.charizard;
  assert.deepEqual(cleanMoves(c, ['fireBlast', 'airSlash', 'focusBlast', 'roost']), ['fireBlast', 'airSlash', 'focusBlast', 'roost']);
  // Spore is not in Charizard's pool, Fire Blast twice, a number and an object: all dropped.
  assert.deepEqual(cleanMoves(c, ['spore', 'fireBlast', 'fireBlast', 7, {}, 'roost']), ['fireBlast', 'roost', ...c.moves.slice(0, 2)]);
  assert.equal(cleanMoves(c, [...c.moves]), null, 'the defaults in their own order are stored as "no change"');
  assert.deepEqual(cleanMoves(c, [...c.moves].reverse()), [...c.moves].reverse(), 'a new order is a change (keys 1–4 follow it)');
  assert.equal(cleanMoves(c, 'fireBlast'), null);
  assert.equal(cleanMoves(c, null), null);
  assert.equal(cleanKit(c, { moves: ['ultimateMove', '__proto__'] }).moves, null);
  assert.deepEqual(cleanKit(c, { item: 'lifeOrb', moves: ['hurricane', 'flamethrower', 'roost', 'focusBlast'] }).moves, ['hurricane', 'flamethrower', 'roost', 'focusBlast']);
});

test('the battle uses the picked moves: key slots, cooldowns and Mega Evolution keep them; the foe keeps its own', () => {
  const picked = ['fireBlast', 'airSlash', 'focusBlast', 'roost'];
  const g = battle('charizard', 'snorlax', { charizard: { moves: picked } }), p = g.player;
  assert.deepEqual(p.moves, picked);
  assert.deepEqual(g.opponent.moves, SPECIES.snorlax.moves, 'no kit: its default four');
  const used = [];
  const real = g.useMove.bind(g);
  g.useMove = (user, id, ...rest) => (user === p && used.push(id), real(user, id, ...rest));
  g.playerPress(1);
  assert.deepEqual(used, ['airSlash'], 'key 2 fires the second picked move');
  assert.ok(g.moveCD(p, 'airSlash') > 0);
  // Mega Evolution swaps the species but keeps the moves.
  p.megaEvolve(SPECIES.charizardMegaX, sprites[SPECIES.charizardMegaX.sprite]);
  assert.equal(p.species.id, 'charizardMegaX');
  assert.deepEqual(p.moves, picked);
});

test('without a pick, a Mega form still uses its own moves', () => {
  const g = battle('charizard', 'snorlax', {}), p = g.player;
  assert.equal(p.moveset ?? null, null);
  p.megaEvolve(SPECIES.charizardMegaX, sprites[SPECIES.charizardMegaX.sprite]);
  assert.deepEqual(p.moves, SPECIES.charizardMegaX.moves);
});
