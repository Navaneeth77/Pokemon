// Real-time hit detection in the shared battle engine: range, tracking, collision and dodging.
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { loadSpriteSets } from '../server/sprites.js';
import { MOVES } from '../src/moves.js';

const sprites = loadSpriteSets(), noop = () => {};

function duel(attacker, foe) {
  const lines = [];
  const ui = new Proxy({ format: 1, log: t => lines.push(t) }, { get: (t, k) => t[k] ?? noop });
  const g = new Game(document.createElement('canvas'), sprites, ui);
  g.headless = true;
  g.lines = lines;
  Object.assign(g, { selection: [attacker], lead: 0, opponentSelection: [foe], difficulty: 'easy' });
  g.start();
  Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
  g.ai = { update: noop, reset: noop, onThreat: noop };
  g.input = { vector: () => ({ x: 0, y: 0 }), clear: noop };
  for (const m of [g.player, g.opponent]) Object.assign(m, { hidden: false, appear: 0, item: null });
  assert.equal(g.player.species.id, attacker);
  return g;
}

// The attacker at the bottom, the foe `dist` px straight ahead of it; `behave(g, foe, t)` steers the foe each frame.
function shoot(attacker, foe, id, dist, behave = null, seconds = 2.5) {
  const g = duel(attacker, foe), p = g.player, o = g.opponent;
  Object.assign(p, { x: 180, y: 540 });
  Object.assign(o, { x: 180, y: 540 - dist });
  const hp0 = o.hp;
  assert.ok(g.useMove(p, id), `${id} should start`);
  for (let t = 0; t < seconds; t += 1 / 60) {
    if (behave) behave(g, o, t);
    g.update(1 / 60);
  }
  return { g, hit: o.hp < hp0 };
}
const walkSideways = (g, o) => Object.assign(o.input, { x: 1, y: 0 });
const runAway = (g, o, t) => {
  Object.assign(o.input, { x: 0, y: -1 });
  if (t > 0.1 && t < 0.12) g.dodge(o, 0, -1);
};

test('every regular attacking move has a targeting profile with range, hitbox, speed and tracking limits', () => {
  for (const [id, m] of Object.entries(MOVES)) {
    if (m.ultimate || m.cat === 'status' || m.util || m.copy) continue;
    const p = m.targeting;
    assert.ok(p, `${id} has a targeting profile`);
    for (const k of ['kind', 'range', 'hitbox', 'speed', 'track', 'trackTime', 'maxTurn', 'acquire']) assert.ok(k in p, `${id}.targeting.${k}`);
    assert.ok(p.range > 0 && p.range <= 420, `${id} range ${p.range} is bounded`);
  }
});

test('Fire Blast hits on contact even with a high random roll', t => {
  t.mock.method(Math, 'random', () => 0.99);
  assert.ok(shoot('charizard', 'snorlax', 'fireBlast', 220).hit);
});

test('Sleep Powder applies on contact even with a high random roll', t => {
  t.mock.method(Math, 'random', () => 0.99);
  const { g } = shoot('venusaur', 'snorlax', 'sleepPowder', 180, null, 1);
  assert.ok(g.opponent.status.sleep > 0);
});

test('Supersonic confuses a valid target even with a high random roll', t => {
  t.mock.method(Math, 'random', () => 0.99);
  const { g } = shoot('noivern', 'snorlax', 'supersonic', 180, null, 1);
  assert.ok(g.opponent.confused > 0);
});

test('Snow Cloak does not randomly evade a connected move in snow', t => {
  t.mock.method(Math, 'random', () => 0.01);
  const { hit } = shoot('charizard', 'glaceon', 'fireBlast', 180, (g, foe, time) => {
    if (time === 0) {
      foe.abilityOverride = 'snowCloak';
      g.setWeather('snow', 25);
    }
  });
  assert.ok(hit);
});

test('Aerial Ace needs to make contact during the dash', () => {
  assert.ok(shoot('scizor', 'snorlax', 'aerialAce', 130).hit);
  const moveAside = (g, foe, time) => { if (time > 0.18) foe.x = 310; };
  assert.equal(shoot('scizor', 'snorlax', 'aerialAce', 130, moveAside).hit, false);
});

test('Flamethrower tracks a foe walking across its jet, within its tracking limit', () => {
  assert.equal(MOVES.flamethrower.targeting.kind, 'stream');
  assert.ok(shoot('charizard', 'snorlax', 'flamethrower', 110, walkSideways).hit);
});

test('Flamethrower misses a foe that dodges out of its reach', () => {
  assert.equal(shoot('charizard', 'jolteon', 'flamethrower', 120, runAway).hit, false);
});

test("Flamethrower can't hit a foe outside its effective range", () => {
  assert.equal(shoot('charizard', 'snorlax', 'flamethrower', 260).hit, false);
  assert.ok(shoot('charizard', 'snorlax', 'flamethrower', 120).hit);
});

test('a straight projectile (Fire Blast) is dodged by moving out of its line, and lands on a foe that stays put', () => {
  assert.equal(MOVES.fireBlast.targeting.kind, 'straight');
  assert.ok(shoot('charizard', 'jolteon', 'fireBlast', 280).hit, 'a still foe is hit');
  assert.equal(shoot('charizard', 'jolteon', 'fireBlast', 280, walkSideways).hit, false, 'a foe running out of the line is not');
});

test('a homing projectile (Shadow Ball) curves onto a foe walking sideways', () => {
  assert.equal(MOVES.shadowBall.targeting.kind, 'homing');
  assert.ok(shoot('gengar', 'jolteon', 'shadowBall', 250, walkSideways).hit);
});

test('a dodge roll through a projectile (its i-frames) avoids it', () => {
  // Roll sideways when the fireball is about to arrive.
  let rolled = 0, flew = 0;
  const roll = (g, o) => {
    const shot = g.effects.find(e => e.constructor.name === 'SeqShot' && !e.dead);
    if (shot) flew++;
    if (shot && Math.hypot(shot.x - o.x, shot.y - o.y) < 70 && !(o.dodgeT > 0) && g.dodge(o, 1, 0)) rolled++;
  };
  assert.equal(shoot('charizard', 'jolteon', 'fireBlast', 280, roll).hit, false);
  assert.ok(flew > 0, 'a real projectile was in flight');
  assert.ok(rolled > 0, 'the foe rolled');
});

test("a melee attack (Dragon Claw) can't connect from long range, only up close", () => {
  assert.equal(MOVES.dragonClaw.targeting.kind, 'melee');
  assert.equal(shoot('garchomp', 'snorlax', 'dragonClaw', 250).hit, false);
  assert.ok(shoot('garchomp', 'snorlax', 'dragonClaw', 40).hit);
});

test("Thunder's strike drifts after a slow walker but a fast runner gets clear", () => {
  assert.equal(MOVES.thunderAtk.targeting.kind, 'strike');
  assert.ok(shoot('zapdos', 'snorlax', 'thunderAtk', 200, walkSideways).hit, 'Snorlax walking is caught');
  assert.equal(shoot('zapdos', 'jolteon', 'thunderAtk', 200, walkSideways).hit, false, 'Jolteon running escapes');
});

test('area attacks hit inside their region only (Earthquake)', () => {
  assert.equal(MOVES.earthquake.targeting.kind, 'area');
  assert.ok(shoot('garchomp', 'snorlax', 'earthquake', 60).hit);
  assert.equal(shoot('garchomp', 'snorlax', 'earthquake', 200).hit, false);
});

test('no damage without a valid hit event: out-of-range projectiles fall short; staged moves stop at their reach', () => {
  assert.equal(shoot('gengar', 'snorlax', 'shadowBall', 400).hit, false);
  assert.equal(shoot('charizard', 'snorlax', 'fireBlast', 400).hit, false);
  assert.equal(shoot('zapdos', 'snorlax', 'thunderAtk', 420).hit, false);
});
