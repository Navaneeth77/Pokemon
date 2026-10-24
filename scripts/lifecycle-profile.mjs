import '../server/shim.js';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { loadSpriteSets } from '../server/sprites.js';
import { Game } from '../src/game.js';
import { BossEncounter } from '../src/bosses.js';

const noop = () => {}, sprites = loadSpriteSets();
const ui = new Proxy({ format: 3, headless: true }, { get: (target, key) => target[key] ?? noop });
const game = new Game(document.createElement('canvas'), sprites, ui);
game.ai.update = noop;
const team = ['charizard', 'pikachu', 'rayquaza', 'blastoise', 'mewtwo', 'gengar'];
const started = performance.now(), heap = process.memoryUsage().heapUsed;
let updates = 0, switches = 0, megas = 0, faints = 0;
function advance(frames) { for (let i = 0; i < frames; i++) { game.update(1 / 60); updates++; } }
for (let cycle = 0; cycle < 24; cycle++) {
  ui.format = cycle % 2 ? 6 : 3;
  game.toMenu(); game.toSelect();
  game.selection = team.slice(0, ui.format);
  const raid = cycle % 3 === 0;
  game.opponentSelection = raid ? ['rayquaza'] : team.slice(0, ui.format);
  game.start(); game.showcase = null; game.state = 'fighting'; game.timers = [];
  for (const mon of [game.player, game.opponent]) { mon.hidden = false; mon.appear = 0; }
  if (raid) { const encounter = new BossEncounter([game], 'rayquaza'); encounter.intro = 0; encounter.next = 1e6; }
  assert.equal(game.playerTeam.megaUsed, false);
  assert.equal(game.megaEvolve(game.player), true); advance(150);
  assert.equal(game.player.isMega, true); megas++;
  assert.equal(game.switchTo(1), true); advance(180); switches++;
  assert.equal(game.player, game.playerTeam.members[1]);
  assert.equal(game.playerTeam.members[0].isMega, true);
  assert.equal(game.switchTo(0), false, 'manual switch cooldown remains enforced');
  advance(900); assert.equal(game.switchTo(0), true); advance(180); switches++;
  assert.equal(game.player.isMega, true, 're-entering preserves the form');
  game.player.hp = 0; game.onFaint(game.player, game.opponent, { id: 'tackle', name: 'Tackle', power: 1 });
  advance(180); faints++;
  assert.ok(game.player.alive); assert.equal(game.state, 'fighting');
  game.toMenu();
  assert.equal(game.effects.length, 0); assert.equal(game.timers.length, 0);
  assert.equal(game.playerTeam.megaUsed, false);
  assert.ok(game.playerTeam.members.every(mon => !mon.isMega && mon.hp === mon.maxHp));
}
console.log(JSON.stringify({ cycles: 24, menuSelectBattleMenuTransitions: 24, switches, megas, faints, updates,
  elapsedMs: +(performance.now() - started).toFixed(2), heapDeltaMB: +((process.memoryUsage().heapUsed - heap) / 1048576).toFixed(2),
  finalEffects: game.effects.length, finalTimers: game.timers.length,
  note: 'Headless shared-engine lifecycle stress; no rendered-menu, physical-device or retained-heap guarantee.' }, null, 2));
