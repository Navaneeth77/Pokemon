// Lag-forgiving dodges: online, a dodgeable hit on a player with a slow connection waits up to their one-way delay,
// so a dodge they pressed in time (which reaches the server late) still avoids it.
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { applyHit, MAX_DODGE_GRACE_MS } from '../src/combat.js';
import { MOVES } from '../src/moves.js';
import { loadSpriteSets } from '../server/sprites.js';
import { Latency, pingPayload, pingSentAt } from '../server/latency.js';

const sprites = loadSpriteSets(), noop = () => {};

function battle(graceMs) {
  const ui = new Proxy({ format: 3, log: noop }, { get: (t, k) => t[k] ?? noop });
  const g = new Game(document.createElement('canvas'), sprites, ui);
  g.headless = true;
  Object.assign(g, { selection: ['pikachu', 'snorlax', 'lapras'], opponentSelection: ['blastoise', 'snorlax', 'lapras'], lead: 0, difficulty: 'easy' });
  g.start();
  Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
  for (const m of [g.player, g.opponent]) Object.assign(m, { hidden: false, appear: 0, item: null });
  g.ai.update = () => {};
  if (graceMs != null) g.dodgeGraceMs = () => graceMs;
  return g;
}
const run = (g, ms) => { for (let t = 0; t < ms; t += 1000 / 60) g.update(1 / 60); };
const hitPlayer = (g, move = MOVES.tackle, o = {}) => applyHit(g, g.opponent, g.player, move, { knockback: 0, stagger: 0, ...o });

test('a dodge that reaches the server during the wait avoids a hit its player dodged on screen', () => {
  const g = battle(120), p = g.player, hp = p.hp, ult = p.ult;
  assert.equal(hitPlayer(g), true);
  run(g, 50);
  assert.equal(p.hp, hp, 'nothing lands while the dodge can still arrive');
  assert.ok(g.dodge(p, 1, 0), 'the late dodge starts');
  run(g, 120);
  assert.equal(p.hp, hp, 'dodged: no damage');
  assert.ok(p.ult > ult, 'a dodge still earns its ultimate charge');
});

test('without a dodge the hit lands after the wait, never later than 150 ms', () => {
  const g = battle(120), p = g.player, hp = p.hp;
  hitPlayer(g);
  run(g, 100);
  assert.equal(p.hp, hp);
  run(g, 40);
  assert.ok(p.hp < hp, 'landed after about 120 ms');
  const slow = battle(900), q = slow.player, hp2 = q.hp;
  hitPlayer(slow);
  run(slow, MAX_DODGE_GRACE_MS + 20);
  assert.ok(q.hp < hp2, 'a very slow connection still waits at most 150 ms');
});

test('nothing waits: offline, on a fast connection, for ultimates, with No Guard, or when the dodge is on cooldown', () => {
  const immediate = (g, o, why) => { const hp = g.player.hp; hitPlayer(g, MOVES.tackle, o); assert.ok(g.player.hp < hp, why); };
  immediate(battle(null), {}, 'offline (no match server)');
  immediate(battle(10), {}, 'a fast connection');
  immediate(battle(120), { unblockable: true }, 'an unblockable hit (ultimates)');
  const ng = battle(120); ng.opponent.abilityOverride = 'noGuard';
  immediate(ng, {}, 'No Guard (the attacker)');
  const ng2 = battle(120); ng2.player.abilityOverride = 'noGuard';
  immediate(ng2, {}, 'No Guard (the target)');
  const cd = battle(120); cd.player.dodgeCD = 1;
  immediate(cd, {}, 'the dodge is on cooldown, so it could not arrive in time');
  const dodging = battle(120), hp = dodging.player.hp;
  dodging.dodge(dodging.player, 1, 0);
  hitPlayer(dodging);
  assert.equal(dodging.player.hp, hp, 'already dodging: avoided at once, as always');
});

test('the server measures delay from ping frames, ignoring junk and needing a few samples', () => {
  const l = new Latency();
  assert.equal(l.oneWayMs(), 0);
  for (const rtt of [200, 180, -5, 99999, 220]) l.add(rtt);
  assert.equal(l.oneWayMs(), 120, 'half the median round trip, plus a fifth');
  for (let i = 0; i < 20; i++) l.add(40);
  assert.equal(l.oneWayMs(), 24, 'old samples age out');
  assert.equal(pingSentAt(pingPayload(1234.5)), 1234.5);
  assert.equal(pingSentAt(Buffer.alloc(0)), null, 'the plain heartbeat ping carries no time');
});
