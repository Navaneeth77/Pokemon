// A Pokémon with a signature move of its own uses it as its ultimate, and every signature ultimate plays out
// in a real battle and lands its damage.
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { loadSpriteSets } from '../server/sprites.js';
import { SPECIES, ROSTER } from '../src/data/species.js';
import { MOVES } from '../src/moves.js';

const sprites = loadSpriteSets(), noop = () => {};

test('signature moves are the ultimates of their Pokémon (and their Mega forms)', () => {
  const expect = { magearna: 'Fleur Cannon', zygarde: 'Nihil Light', heatran: 'Magma Storm', regigigas: 'Crush Grip', kyurem: 'Glaciate',
    necrozma: 'Photon Geyser', melmetal: 'Double Iron Bash', kingambit: 'Kowtow Cleave', gholdengo: 'Make It Rain', ogerpon: 'Ivy Cudgel', terapagos: 'Tera Starstorm' };
  for (const [id, name] of Object.entries(expect)) {
    assert.equal(MOVES[SPECIES[id].ultimate].name, name, id);
    for (const m of SPECIES[id].mega ?? []) assert.equal(MOVES[SPECIES[m].ultimate].name, name, m);
  }
});

test('every signature ultimate plays out in battle and hits', () => {
  const ids = ROSTER.filter(id => SPECIES[id].ultimate?.endsWith('Ult'));
  assert.ok(ids.length >= 90, `${ids.length} signature ultimates`);
  for (const id of ids) {
    const ui = new Proxy({ format: 3, log: noop }, { get: (t, k) => t[k] ?? noop });
    const g = new Game(document.createElement('canvas'), sprites, ui);
    g.headless = true;
    Object.assign(g, { selection: [id, 'snorlax', 'lapras'], opponentSelection: ['blastoise', 'snorlax', 'lapras'], lead: 0, difficulty: 'easy' });
    g.start();
    Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
    for (const m of [g.player, g.opponent]) Object.assign(m, { hidden: false, appear: 0 });
    g.ai.update = () => {}; // the foe stays in, so the HP checked is the one that was hit
    const before = g.opponent.hp;
    g.player.ult = 100;
    assert.ok(g.useMove(g.player, g.player.species.ultimate), `${id} can use ${g.player.species.ultimate}`);
    for (let f = 0; f < 60 * 6; f++) g.update(1 / 60);
    assert.ok(g.opponent.hp < before, `${id}'s ${MOVES[g.player.species.ultimate].name} hits`);
  }
});
