// Every ultimate: 150 base power, a high critical-hit ratio, always STAB, the higher of Attack and Sp. Atk (stat
// stages counted), and no drawback or bonus for the user (no recoil, HP cost, stat changes or healing).
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { loadSpriteSets } from '../server/sprites.js';
import { MOVES } from '../src/moves.js';
import { moveCategory } from '../src/effects-resolver.js';

const sprites = loadSpriteSets(), noop = () => {};
function battle(id) {
  const ui = new Proxy({ format: 3, log: noop }, { get: (t, k) => t[k] ?? noop });
  const g = new Game(document.createElement('canvas'), sprites, ui);
  g.headless = true;
  Object.assign(g, { selection: [id, 'snorlax', 'lapras'], opponentSelection: ['blissey', 'snorlax', 'lapras'], lead: 0, difficulty: 'easy' });
  g.start();
  Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
  for (const m of [g.player, g.opponent]) Object.assign(m, { hidden: false, appear: 0 });
  g.ai.update = () => {}; // the foe stands still, so only the ultimate changes anything
  return g;
}
const fire = (g, s = 6) => {
  g.player.ult = 100;
  assert.ok(g.useMove(g.player, g.player.species.ultimate));
  for (let f = 0; f < 60 * s; f++) g.update(1 / 60);
};

test('every ultimate has 150 base power, a high critical-hit ratio and no recoil', () => {
  const ults = Object.values(MOVES).filter(m => m.ultimate);
  assert.ok(ults.length > 100);
  for (const m of ults) {
    assert.equal(m.power, 150, m.id);
    assert.ok(m.critRatio >= 2, `${m.id} crit ratio`);
    assert.equal(m.recoil, undefined, `${m.id} recoil`);
    for (const [, kind] of m.sig?.beats ?? []) assert.ok(kind !== 'buff' && kind !== 'heal', `${m.id} has no self buff or heal`);
  }
});

test('an ultimate hits with the higher of Attack and Sp. Atk, stat stages counted', () => {
  const m = MOVES.mindBlownUlt; // Blacephalon: Sp. Atk 1.23 > Attack 1.17
  const mon = { species: { atk: 1.17, spa: 1.23 }, stages: {} };
  assert.equal(moveCategory(m, mon), 'special');
  mon.stages.atk = 2; // Dragon Dance / Swords Dance
  assert.equal(moveCategory(m, mon), 'physical');
  // A tie (most species share one attack stat) keeps the move's own category.
  assert.equal(moveCategory(MOVES.hydroCannon, { species: { atk: 1.05 }, stages: {} }), MOVES.hydroCannon.cat);
});

test('Dragon Dance makes an ultimate hit harder', () => {
  const hit = dd => {
    const g = battle('dragonite');
    if (dd) g.stage(g.player, { atk: 1, spe: 1 });
    const hp = g.opponent.hp;
    fire(g);
    return hp - g.opponent.hp;
  };
  let plain = 0, danced = 0;
  for (let i = 0; i < 6; i++) { plain += hit(false); danced += hit(true); }
  assert.ok(danced > plain * 1.25, `Dragon Dance boosts the ultimate (${plain} → ${danced})`);
});

test('ultimates cost the user nothing and give it nothing', () => {
  for (const id of ['blacephalon', 'floetteEternal', 'volcarona', 'kommoO', 'morpeko', 'ceruledge']) {
    const g = battle(id), u = g.player, hp = u.hp;
    fire(g);
    assert.equal(u.hp, hp, `${id} keeps its HP`);
    assert.equal(Object.keys(u.buffs ?? {}).filter(k => u.buffs[k]?.t > 0).length, 0, `${id} gets no stat buff`);
  }
});
