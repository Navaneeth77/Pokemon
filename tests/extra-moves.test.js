// The learnset moves with rules of their own (effects-extra.js), each in a real headless battle.
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { loadSpriteSets } from '../server/sprites.js';
import { MOVES } from '../src/moves.js';
import { applyHit } from '../src/combat.js';
import { typeMultiplier } from '../src/data/types.js';

const sprites = loadSpriteSets(), noop = () => {};

function battle(team, foes, format = 3) {
  const ui = new Proxy({ format, log: noop }, { get: (t, k) => t[k] ?? noop });
  const g = new Game(document.createElement('canvas'), sprites, ui);
  g.headless = true;
  Object.assign(g, { selection: team, lead: 0, opponentSelection: foes, difficulty: 'easy' });
  g.start();
  Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
  g.ai = { update: noop, reset: noop, onThreat: noop };
  g.input = { vector: () => ({ x: 0, y: 0 }), clear: noop };
  for (const m of [g.player, g.opponent]) Object.assign(m, { hidden: false, appear: 0, item: null });
  Object.assign(g.player, { x: 180, y: 480 });
  Object.assign(g.opponent, { x: 180, y: 380 });
  return g;
}
const run = (g, s) => { for (let t = 0; t < s; t += 1 / 60) g.update(1 / 60); };
const use = (g, mon, id, s = 1.2) => { mon.cooldowns = {}; const ok = g.useMove(mon, id, 0, true); run(g, s); return ok; };
function rolls(v, fn) { const r = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = r; } }

test('Confuse Ray confuses; a confused Pokémon sometimes hurts itself instead of moving', () => {
  const g = battle(['gengar', 'snorlax', 'lapras'], ['charizard', 'snorlax', 'lapras']), o = g.opponent;
  use(g, g.player, 'confuseRay');
  assert.ok(o.confused > 0);
  const hp = o.hp;
  rolls(0.1, () => assert.equal(g.useMove(o, 'flamethrower'), false, 'the move did not come out'));
  assert.ok(o.hp < hp, 'it hurt itself');
});

test('Attract: an infatuated foe loses half its moves', () => {
  const g = battle(['lopunny', 'snorlax', 'lapras'], ['charizard', 'snorlax', 'lapras']), o = g.opponent;
  rolls(0.2, () => use(g, g.player, 'attract'));
  assert.ok(o.infatuated > 0);
  rolls(0.1, () => assert.equal(g.useMove(o, 'flamethrower'), false));
});

test('Disable locks the foe out of the move it used last', () => {
  const g = battle(['gengar', 'snorlax', 'lapras'], ['charizard', 'snorlax', 'lapras']), o = g.opponent;
  use(g, o, 'flamethrower');
  rolls(0.2, () => use(g, g.player, 'disable'));
  assert.equal(o.disabled?.id, 'flamethrower');
  o.cooldowns = {};
  assert.equal(g.useMove(o, 'flamethrower'), false);
});

test('Endure hangs on with 1 HP; a one-hit KO move KOs without it', () => {
  const g = battle(['garchomp', 'snorlax', 'lapras'], ['blissey', 'snorlax', 'lapras']), o = g.opponent;
  o.endure = 0.9;
  rolls(0.01, () => applyHit(g, g.player, o, MOVES.fissure, { stack: {} }));
  assert.equal(Math.ceil(o.hp), 1, 'Endure left it at 1 HP');
  o.endure = 0;
  rolls(0.01, () => applyHit(g, g.player, o, MOVES.fissure, { stack: {} }));
  assert.equal(o.alive, false, 'Fissure knocked it out');
});

test('Perish Song: everything on the field faints after three turns', () => {
  const g = battle(['lapras', 'snorlax', 'gengar'], ['charizard', 'snorlax', 'lapras']), p = g.player, o = g.opponent;
  use(g, p, 'perishSong');
  assert.ok(p.perish > 0 && o.perish > 0);
  run(g, 10);
  assert.equal(p.alive || o.alive ? [p, o].filter(m => m.alive).length : 0, 0, 'both fainted');
});

test('Baton Pass hands the stat changes to the next Pokémon in', () => {
  const g = battle(['sceptile', 'snorlax', 'lapras'], ['charizard', 'snorlax', 'lapras']);
  g.player.stages = { atk: 2, spe: 1 };
  use(g, g.player, 'batonPass');
  assert.equal(g.switchCD, 0);
  g.switchTo(1, true);
  run(g, 3);
  assert.equal(g.player.species.id, 'snorlax');
  assert.deepEqual({ atk: g.player.stages.atk, spe: g.player.stages.spe }, { atk: 2, spe: 1 });
});

test('Snore only while asleep; Dream Eater only on a sleeping foe; Spit Up needs a stockpile', () => {
  const g = battle(['snorlax', 'gengar', 'lapras'], ['charizard', 'snorlax', 'lapras']), p = g.player, o = g.opponent;
  assert.equal(g.useMove(p, 'snore'), false);
  g.applyStatus(p, 'sleep', { dur: 3 });
  assert.equal(g.useMove(p, 'snore'), true);
  assert.equal(g.useMove(o, 'dreamEater'), true, 'Snorlax is asleep, so the foe can eat its dream');
  run(g, 0.2);
  o.status = { sleep: 0 };
  p.status = {};
  p.cooldowns = {};
  assert.equal(g.useMove(p, 'dreamEater'), false, 'the foe is awake');
  assert.equal(g.useMove(p, 'spitUp'), false);
});

test('Stockpile then Spit Up: 100 power per stockpile, and the boosts go', () => {
  const g = battle(['swalot', 'snorlax', 'lapras'], ['blissey', 'snorlax', 'lapras']), p = g.player;
  use(g, p, 'stockpile', 0.6);
  use(g, p, 'stockpile', 0.6);
  assert.equal(p.stockpile, 2);
  assert.equal(p.stages.def, 2);
  p.status = {};
  use(g, p, 'spitUp', 1.5);
  assert.equal(p.stockpile, 0);
  assert.equal(p.stages.def ?? 0, 0);
});

test('Fling throws its held item: it needs one, and the item is gone after', () => {
  const g = battle(['tyranitar', 'snorlax', 'lapras'], ['blissey', 'snorlax', 'lapras']), p = g.player;
  assert.equal(g.useMove(p, 'fling'), false);
  p.item = 'lifeOrb';
  assert.equal(g.useMove(p, 'fling'), true);
  run(g, 1.5);
  assert.equal(p.item, null);
});

test('Transform copies the foe (species, moves, stat changes) until it switches out', () => {
  const g = battle(['ditto', 'snorlax', 'lapras'], ['garchomp', 'snorlax', 'lapras']), p = g.player;
  g.opponent.stages = { atk: 1 };
  use(g, p, 'transform');
  assert.equal(p.species.id, 'garchomp');
  assert.deepEqual(p.moves, g.opponent.moves);
  assert.equal(p.stages.atk, 1);
  assert.equal(p.maxHp, p.baseSpecies.hp, 'it keeps its own HP');
  g.switchTo(1, true);
  run(g, 1.5);
  g.switchTo(0, true);
  run(g, 1.5);
  assert.equal(g.player.species.id, 'ditto');
});

test('Metronome uses some other move', () => {
  const g = battle(['clefable', 'snorlax', 'lapras'], ['blissey', 'snorlax', 'lapras']), p = g.player;
  use(g, p, 'metronome', 0.6);
  assert.ok(p.copied && p.copied !== 'metronome', `it used ${p.copied}`);
});

test("Safeguard keeps the foe's statuses off; Mist keeps its stat drops off", () => {
  const g = battle(['lapras', 'snorlax', 'gengar'], ['charizard', 'snorlax', 'lapras']), p = g.player, o = g.opponent;
  use(g, p, 'safeguard');
  assert.equal(g.applyStatus(p, 'burn', { source: o }), false);
  use(g, p, 'mist');
  g.stage(p, { atk: -1 }, o);
  assert.equal(p.stages.atk ?? 0, 0);
});

test('Gravity: Ground moves hit Flying types normally and Fly fails', () => {
  const g = battle(['garchomp', 'snorlax', 'lapras'], ['charizard', 'snorlax', 'lapras']), o = g.opponent;
  assert.equal(typeMultiplier('ground', ['fire', 'flying']), 0.5);
  use(g, g.player, 'gravity');
  assert.ok(g.gravity > 0);
  const hp = o.hp;
  rolls(0.5, () => applyHit(g, g.player, o, MOVES.earthquake, { stack: {} }));
  const dmg = hp - o.hp;
  assert.ok(dmg > 0.15 * o.maxHp, `super effective on Charizard under Gravity (${Math.round(dmg)})`);
  o.cooldowns = {};
  assert.equal(g.useMove(o, 'fly'), false);
});

test('Synchronoise needs a shared type; Skill Swap trades Abilities; Lock-On makes the next move sure', () => {
  const g = battle(['alakazam', 'snorlax', 'lapras'], ['charizard', 'snorlax', 'lapras']), p = g.player, o = g.opponent;
  assert.equal(g.useMove(p, 'synchronoise'), false);
  const [a, b] = [p.species.ability, o.species.ability];
  use(g, p, 'skillSwap');
  assert.deepEqual([p.abilityOverride, o.abilityOverride], [b, a]);
  p.lockOn = 6;
  const stack = {};
  rolls(0.999, () => applyHit(g, p, o, { ...MOVES.focusBlast }, { stack }));
  assert.equal(stack.missed ?? false, false, 'Focus Blast (70%) could not miss');
});

test("online: another screen replays the move the server's Metronome picked, not a new random one", () => {
  const g = battle(['clefable', 'snorlax', 'lapras'], ['blissey', 'snorlax', 'lapras']), o = g.opponent;
  o.remote = true;
  assert.equal(g.useMove(o, 'metronome', 0, true, 'flamethrower'), true);
  assert.equal(o.copied, 'flamethrower');
  o.cooldowns = {};
  g.useMove(o, 'metronome', 0, true);
  run(g, 0.6);
  assert.equal(o.copied, 'flamethrower', 'the plain replay picks nothing by itself');
});
