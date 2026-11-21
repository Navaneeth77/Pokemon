// Lag-forgiving dodges: online, a dodgeable hit on a player with a slow connection waits up to their one-way delay,
// so a dodge they pressed in time (which reaches the server late) still avoids it.
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { applyHit, MAX_DODGE_GRACE_MS } from '../src/combat.js';
import { MOVES } from '../src/moves.js';
import { loadSpriteSets } from '../server/sprites.js';
import { Latency } from '../server/latency.js';
import { WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

test('the server measures delay from echoed game pings, only accepting times it sent', () => {
  const l = new Latency();
  assert.equal(l.oneWayMs(), 0);
  for (const [sent, back] of [[1000, 1200], [2000, 2180], [3000, 3220]]) assert.equal(l.echo(l.stamp(sent), back), true);
  assert.equal(l.oneWayMs(), 120, 'half the median round trip, plus a fifth');
  assert.equal(l.echo(500, 4000), false, 'a time the server never sent is ignored');
  assert.equal(l.echo(1000, 5000), false, 'nor can an old one be replayed');
  for (let i = 0; i < 20; i++) l.echo(l.stamp(10000 + i * 1000), 10040 + i * 1000);
  assert.equal(l.oneWayMs(), 24, 'old samples age out');
});

// The real server, behind nothing: a player whose replies come back 200 ms late is measured at about 120 ms one
// way (half of 200, plus a fifth), one who answers at once at about 0. Ping frames would not work behind Render.
test('the match server measures each player\'s delay with game messages (works behind a proxy)', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-latency-'));
  const server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: '0', LEADERBOARD_FILE: path.join(dir, 'lb.json'), ECONOMY_FILE: path.join(dir, 'eco.json'), UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(server, 'close');
  t.after(async () => { server.kill('SIGKILL'); await closed; fs.rmSync(dir, { recursive: true, force: true }); });
  let port;
  for await (const line of createInterface({ input: server.stdout })) { const m = /match server on :(\d+)/.exec(line); if (m) { port = Number(m[1]); break; } }
  const player = (pid, delay) => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`), seen = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: 2, pid, name: 'T' })));
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.t !== 'sping') return;
      seen.push(m.ow);
      setTimeout(() => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'spong', ts: m.ts })), delay);
      if (seen.length >= 6) { ws.close(); resolve(seen); }
    });
    ws.on('error', reject);
  });
  const [slow, fast] = await Promise.all([player('latency-slow-0001', 200), player('latency-fast-0001', 0)]);
  assert.ok(Math.abs(slow.at(-1) - 120) <= 15, `slow player measured at ${slow.at(-1)} ms one way`);
  assert.ok(fast.at(-1) <= 10, `fast player measured at ${fast.at(-1)} ms one way`);
  assert.equal(slow[0], 0, 'no extra time before a few samples are in');
});
