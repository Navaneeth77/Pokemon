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

test('Endure hangs on with 1 HP through a lethal regular attack', () => {
  const g = battle(['garchomp', 'snorlax', 'lapras'], ['blissey', 'snorlax', 'lapras']), o = g.opponent;
  o.hp = 10;
  o.endure = 0.9;
  rolls(0.99, () => applyHit(g, g.player, o, MOVES.earthquake));
  assert.equal(Math.ceil(o.hp), 1, 'Endure left it at 1 HP');
  o.endure = 0;
  rolls(0.99, () => applyHit(g, g.player, o, MOVES.earthquake));
  assert.equal(o.alive, false);
});

test('Fissure and Sheer Cold ultimates deal normal damage to a healthy target', () => {
  for (const [species, id] of [['dugtrio', 'fissure'], ['lapras', 'sheerCold']]) {
    const g = battle([species, 'snorlax', 'charizard'], ['blissey', 'snorlax', 'charizard']);
    const { player, opponent } = g;
    rolls(0.99, () => applyHit(g, player, opponent, MOVES[id]));
    assert.ok(opponent.hp > 0 && opponent.hp < opponent.maxHp, id);
  }
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
  use(g, p, 'stockpile', 1);
  use(g, p, 'stockpile', 1);
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

test('Synchronoise needs a shared type; Skill Swap trades Abilities', () => {
  const g = battle(['alakazam', 'snorlax', 'lapras'], ['charizard', 'snorlax', 'lapras']), p = g.player, o = g.opponent;
  assert.equal(g.useMove(p, 'synchronoise'), false);
  const [a, b] = [p.species.ability, o.species.ability];
  use(g, p, 'skillSwap');
  assert.deepEqual([p.abilityOverride, o.abilityOverride], [b, a]);
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

test('Magic Coat bounces a status move back; Comeuppance returns the last hit at 1.5×; Bide returns twice what it stored', () => {
  const g = battle(['espeon', 'snorlax', 'lapras'], ['gengar', 'snorlax', 'lapras']), p = g.player, o = g.opponent;
  p.magicCoat = 1.2;
  use(g, o, 'confuseRay');
  assert.ok(o.confused > 0 && !(p.confused > 0), 'the confusion bounced back onto Gengar');
  const g2 = battle(['kingambit', 'snorlax', 'lapras'], ['blissey', 'snorlax', 'lapras']), k = g2.player, b = g2.opponent;
  k.lastHit = { dmg: 100, t: g2.time };
  const hp = b.hp;
  rolls(0.5, () => applyHit(g2, k, b, MOVES.comeuppance, { stack: {} }));
  assert.equal(Math.round(hp - b.hp), 150);
  const g3 = battle(['snorlax', 'lapras', 'gengar'], ['blissey', 'snorlax', 'lapras']), s = g3.player, t = g3.opponent;
  use(g3, s, 'bide', 0.4);
  s.takeHit(80, { dirX: 0, dirY: 1, knockback: 0, stagger: 0 }, g3);
  const thp = t.hp;
  run(g3, 3);
  assert.ok(thp - t.hp >= 150, `Bide returned ${Math.round(thp - t.hp)}`);
});

test('Power Split and Speed Swap change stats until it switches out; Electrify, Telekinesis, Water Sport, Fairy Lock', () => {
  const g = battle(['espeon', 'snorlax', 'lapras'], ['garchomp', 'snorlax', 'lapras']), p = g.player, o = g.opponent;
  const [pa, oa] = [p.species.atk, o.species.atk];
  use(g, p, 'powerSplit');
  assert.equal(p.species.atk, (pa + oa) / 2);
  assert.equal(o.species.atk, (pa + oa) / 2);
  const [ps, os] = [p.species.speed, o.species.speed];
  use(g, p, 'speedSwap');
  assert.deepEqual([p.species.speed, o.species.speed], [os, ps]);
  g.switchTo(1, true);
  run(g, 3);
  g.switchTo(0, true);
  run(g, 3);
  assert.equal(g.player.species.atk, pa, 'back to its own stats after switching');
  use(g, g.player, 'telekinesis');
  assert.ok(o.telekinesis > 0);
  const hp = o.hp;
  applyHit(g, g.player, o, MOVES.earthquake, { stack: {} });
  assert.equal(o.hp, hp, "Ground moves can't reach it");
  use(g, g.player, 'waterSport');
  assert.ok(g.waterSport > 0);
  use(g, g.player, 'fairyLock');
  assert.ok(o.blocked > 0 && g.player.blocked > 0);
  use(g, g.player, 'electrify');
  assert.ok(o.electrified > 0);
});

test('Hail chips everything but Ice types and brings out Castform\'s Snowy Form', () => {
  const g = battle(['castform', 'snorlax', 'lapras'], ['charizard', 'snorlax', 'lapras']), p = g.player, o = g.opponent;
  use(g, p, 'hail', 0.6);
  assert.equal(g.weather, 'hail');
  run(g, 1);
  assert.deepEqual(p.typeOverride, ['ice'], 'Castform turned Ice type (Snowy Form)');
  const hp = o.hp;
  run(g, 3.2);
  assert.ok(o.hp < hp, 'Charizard was chipped by the hail');
});

test('Solar Blade strikes at once in sun; Present can heal; Rollout and Thrash lock it in; Uproar keeps everyone awake', () => {
  const g = battle(['sceptile', 'snorlax', 'lapras'], ['blissey', 'snorlax', 'lapras']), p = g.player, o = g.opponent;
  g.setWeather('sun', 25);
  run(g, 0.1);
  const hp = o.hp;
  use(g, p, 'solarBlade', 0.35);
  assert.ok(o.hp < hp, 'it hit within 0.35s, with no charge');
  const before = o.hp - 1;
  o.hp = before;
  rolls(0.1, () => applyHit(g, p, o, MOVES.present, { stack: {} }));
  assert.ok(o.hp > before, 'Present healed the foe');
  p.cooldowns = {};
  use(g, p, 'rollout', 0.8);
  p.cooldowns = {};
  assert.equal(g.useMove(p, 'leafBlade'), false, 'locked into Rollout');
  p.rampage = null;
  use(g, p, 'thrash', 0.8);
  use(g, p, 'thrash', 0.8);
  assert.ok(p.confused > 0, 'confused after its rampage');
  use(g, p, 'uproar', 0.8);
  assert.equal(g.applyStatus(o, 'sleep', { source: p }), false);
});

test("Own Tempo, Oblivious, Soundproof, Storm Drain and Piercing Drill", () => {
  const g = battle(['gengar', 'snorlax', 'lapras'], ['smeargle', 'snorlax', 'lapras']);
  rolls(0.1, () => use(g, g.player, 'confuseRay'));
  assert.ok(!(g.opponent.confused > 0), 'Own Tempo: no confusion');
  const g2 = battle(['blastoise', 'snorlax', 'lapras'], ['gastrodon', 'snorlax', 'lapras']), gas = g2.opponent, hp = gas.hp;
  applyHit(g2, g2.player, gas, MOVES.hydroPumpAtk, { stack: {} });
  assert.equal(gas.hp, hp, 'Storm Drain soaked up the water');
  const g3 = battle(['exploud', 'snorlax', 'lapras'], ['bastiodon', 'snorlax', 'lapras']), bas = g3.opponent, hp3 = bas.hp;
  applyHit(g3, g3.player, bas, MOVES.hyperVoice, { stack: {} });
  assert.equal(bas.hp, hp3, 'Soundproof: Hyper Voice did nothing');
  const g4 = battle(['excadrill', 'snorlax', 'lapras'], ['blissey', 'snorlax', 'lapras']), ex = g4.player, bl = g4.opponent;
  g4.megaEvolve(ex, true);
  run(g4, 2);
  assert.equal(ex.species.id, 'excadrillMega');
  bl.guard = { mult: 0, color: '#fff', label: 'PROTECT' };
  const hp4 = bl.hp;
  rolls(0.5, () => applyHit(g4, ex, bl, MOVES.ironHead, { stack: {} }));
  assert.ok(bl.hp < hp4, 'Piercing Drill went through Protect');
});
