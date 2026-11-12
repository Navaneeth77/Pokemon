// Attacks meeting in mid-air (game.js updateClashes): projectiles clash or react, beams and jets block projectiles,
// Rapid Spin bats them back, and two beams fired at each other clash.
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { loadSpriteSets } from '../server/sprites.js';

const sprites = loadSpriteSets(), noop = () => {};
function duel(a, b, ma, mb, { delayB = 0, dist = 220, spinAt = null } = {}) {
  const ui = new Proxy({ format: 1, log: noop }, { get: (t, k) => t[k] ?? noop });
  const g = new Game(document.createElement('canvas'), sprites, ui);
  g.headless = true;
  Object.assign(g, { selection: [a], lead: 0, opponentSelection: [b], difficulty: 'easy' });
  g.start();
  Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
  g.ai = { update: noop, reset: noop, onThreat: noop };
  g.input = { vector: () => ({ x: 0, y: 0 }), clear: noop };
  for (const m of [g.player, g.opponent]) Object.assign(m, { hidden: false, appear: 0, item: null });
  Object.assign(g.player, { x: 180, y: 480 });
  Object.assign(g.opponent, { x: 180, y: 480 - dist });
  const events = [], cf = g.clashFx.bind(g), rf = g.reactFx.bind(g);
  g.clashFx = (...args) => { events.push('clash'); return cf(...args); };
  g.reactFx = (...args) => { events.push('reaction'); return rf(...args); };
  const hp = [g.player.hp, g.opponent.hp];
  if (ma) g.useMove(g.player, ma, 0, true);
  let fired = !delayB;
  if (!delayB) g.useMove(g.opponent, mb, 0, true);
  for (let t = 0; t < 2.5; t += 1 / 60) {
    if (!fired && t >= delayB) { g.useMove(g.opponent, mb, 0, true); fired = true; }
    if (spinAt) { const shot = g.effects.find(e => e.isProjectile && !e.dead && e.user === g.opponent); if (shot && Math.hypot(shot.x - g.player.x, shot.y - g.player.y) < spinAt) { g.useMove(g.player, 'rapidSpin', 0, true); spinAt = null; } }
    g.update(1 / 60);
  }
  return { events, toPlayer: hp[0] - g.player.hp, toFoe: hp[1] - g.opponent.hp };
}

test('two projectiles of the same strength cancel out', () => {
  const r = duel('gengar', 'gengar', 'shadowBall', 'shadowBall');
  assert.ok(r.events.includes('clash'));
  assert.equal(r.toPlayer + r.toFoe, 0);
});

test("type reactions between volley shots: Water Gun puts out Ember's embers", () => {
  const r = duel('charizard', 'blastoise', 'ember', 'waterGun');
  assert.ok(r.events.filter(e => e === 'reaction').length >= 2);
  assert.equal(r.toFoe, 0, 'no ember got through');
});

test('a flame jet blocks a projectile', () => {
  const r = duel('charizard', 'alakazam', 'flamethrower', 'shadowBall', { delayB: 0.15, dist: 140 });
  assert.ok(r.events.includes('clash'));
  assert.equal(r.toPlayer, 0);
});

test('two beams fired at each other clash; the much stronger one wins', () => {
  const even = duel('tyranitar', 'tyranitar', 'darkPulse', 'darkPulse');
  assert.ok(even.events.includes('clash'));
  assert.equal(even.toPlayer + even.toFoe, 0, 'equal beams cancel');
  const ice = duel('mamoswine', 'metagross', 'iceBeam', 'flashCannon');
  assert.ok(ice.events.includes('clash'));
  assert.equal(ice.toPlayer, 0, 'Flash Cannon lost the clash');
  assert.ok(ice.toFoe > 0, 'Ice Beam went through');
});

test('Rapid Spin bats a projectile back at whoever threw it', () => {
  const r = duel('starmie', 'alakazam', null, 'shadowBall', { dist: 180, spinAt: 110 });
  assert.equal(r.toPlayer, 0);
  assert.ok(r.toFoe > 0, 'Alakazam took its own Shadow Ball');
});
