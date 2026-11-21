// Greninja and Battle Bond Greninja are separate Pokémon: ordinary Greninja keeps Protean and has no form change;
// Battle Bond Greninja becomes Ash-Greninja when it knocks out a foe (without using up the team's Mega Evolution).
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { loadSpriteSets } from '../server/sprites.js';
import { SPECIES, ROSTER, spritesFor } from '../src/data/species.js';
import { movePool } from '../src/data/movepool.js';

const sprites = loadSpriteSets(), noop = () => {};

test('Greninja and Battle Bond Greninja are separate Pokémon', () => {
  assert.ok(ROSTER.includes('greninja') && ROSTER.includes('greninjaBond'));
  assert.equal(SPECIES.greninja.ability, 'protean');
  assert.ok(!SPECIES.greninja.mega?.length && !SPECIES.greninjaBond.mega?.length);
  assert.equal(SPECIES.greninjaBond.ability, 'battleBond');
  assert.equal(SPECIES.greninjaAsh.megaOf, 'greninjaBond');
  assert.equal(SPECIES.greninjaMega, undefined);
  assert.deepEqual(movePool(SPECIES.greninjaBond), movePool(SPECIES.greninja));
  // A battle with it loads Ash-Greninja's sheets too, so the form change never swaps to missing sprites.
  assert.ok(spritesFor(['greninjaBond']).includes('greninja-ash'));
});

test('Battle Bond Greninja becomes Ash-Greninja after knocking out a foe', () => {
  const ui = new Proxy({ format: 3, log: noop }, { get: (t, k) => t[k] ?? noop });
  const g = new Game(document.createElement('canvas'), sprites, ui);
  g.headless = true;
  Object.assign(g, { selection: ['greninjaBond', 'snorlax', 'lapras'], opponentSelection: ['blissey', 'snorlax', 'lapras'], lead: 0, difficulty: 'easy' });
  g.start();
  Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
  for (const m of [g.player, g.opponent]) Object.assign(m, { hidden: false, appear: 0 });
  g.ai.update = () => {};
  g.opponent.hp = 1;
  g.opponent.item = null; // no Focus Band luck: the hit must knock it out
  g.player.ult = 100;
  assert.ok(g.useMove(g.player, g.player.species.ultimate));
  for (let f = 0; f < 60 * 5; f++) g.update(1 / 60);
  assert.equal(g.player.species.id, 'greninjaAsh', 'became Ash-Greninja on the KO');
  assert.deepEqual(g.player.species.types, ['water', 'dark']);
  assert.equal(g.player.species.ultimate, 'waterShurikenBarrage');
  assert.ok(!g.playerTeam.megaUsed, 'the team keeps its Mega Evolution');
});
