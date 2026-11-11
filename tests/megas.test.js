// Every Mega Evolution can actually be used: its sprite set loads (on the match server too), its body size is
// measured, its official types and stats apply, and a Pokémon Mega Evolves into it in a real battle.
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { loadSpriteSets } from '../server/sprites.js';
import { SPECIES, ROSTER } from '../src/data/species.js';
import { MORE_MEGAS, MORE_MEGA_STATS } from '../src/data/more-megas.js';

const sprites = loadSpriteSets(), noop = () => {};
const megas = Object.values(SPECIES).filter(s => s.megaOf);

test('every Mega has a sprite set, a measured body and a base Pokémon in the roster', () => {
  assert.ok(megas.length >= 39, `${megas.length} Megas`);
  for (const m of megas) {
    assert.ok(sprites[m.sprite]?.anims?.Idle, `${m.id}: sprite set ${m.sprite}`);
    assert.ok(m.radius > 0 && m.bodyZ > 0 && m.headZ > 0, `${m.id}: measured body`);
    assert.ok(SPECIES[m.megaOf].mega.includes(m.id), `${m.id}: listed on ${m.megaOf}`);
  }
  for (const [base] of MORE_MEGAS) assert.ok(ROSTER.includes(base), `${base} is playable`);
});

test('the new Megas take their official types and stat changes', () => {
  assert.deepEqual(SPECIES.mawileMega.types, ['steel', 'fairy']);
  assert.equal(SPECIES.mawileMega.ability, 'hugePower');
  assert.deepEqual(SPECIES.altariaMega.types, ['dragon', 'fairy']);
  for (const [, id] of MORE_MEGAS) {
    const v = MORE_MEGA_STATS[id], s = SPECIES[id], b = SPECIES[s.megaOf];
    assert.equal(s.hp, b.hp, `${id} keeps its HP`);
    assert.ok(Math.abs(s.speed - b.speed * v.form.spe / v.base.spe) < 1e-9, `${id} speed scales by the official change`);
  }
});

test('each new Mega Evolves in battle', () => {
  for (const [base, id] of MORE_MEGAS) {
    const ui = new Proxy({ format: 3, log: noop }, { get: (t, k) => t[k] ?? noop });
    const g = new Game(document.createElement('canvas'), sprites, ui);
    g.headless = true;
    Object.assign(g, { selection: [base, 'snorlax', 'lapras'], opponentSelection: ['garchomp', 'dragonite', 'blissey'], megaPicks: { [base]: id }, lead: 0, difficulty: 'easy' });
    g.start();
    Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
    for (const m of [g.player, g.opponent]) Object.assign(m, { hidden: false, appear: 0 });
    g.megaEvolve(g.player, true);
    for (let f = 0; f < 120; f++) g.update(1 / 60);
    assert.equal(g.player.species.id, id, `${base} became ${id}`);
  }
});
