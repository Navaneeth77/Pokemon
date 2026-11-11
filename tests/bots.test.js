import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { botDifficulty } from '../server/bots.js';

// A server of its own, with computer trainers stepping in after 1.5 s instead of 25 s.
const port = 18893;
const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(port), LEADERBOARD_FILE: `/tmp/chaos-arena-bot-test-${Date.now()}.json`, BOT_MATCH_AFTER_MS: '1500' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', b => (logs += b));
server.stderr.on('data', b => (logs += b));
await once(server.stdout, 'data');
test.after(() => server.kill());

function client(pid) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`), messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw)));
  return {
    ws, messages,
    send: m => ws.send(JSON.stringify(m)),
    async wait(t, ok = () => true, ms = 10000) {
      for (let waited = 0; waited < ms; waited += 25) {
        const k = messages.findIndex(m => m.t === t && ok(m));
        if (k >= 0) return messages.splice(k, 1)[0];
        await new Promise(r => setTimeout(r, 25));
      }
      throw new Error(`Timed out waiting for ${t}\n${logs.slice(-600)}`);
    },
    async hello() {
      await once(ws, 'open');
      ws.send(JSON.stringify({ t: 'hello', v: 2, pid, name: 'SOLO' }));
      await this.wait('welcome');
    },
  };
}

test('difficulty leans harder the longer the win streak', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const share = streak => {
    const n = { easy: 0, medium: 0, hard: 0 };
    for (let i = 0; i < 4000; i++) n[botDifficulty(streak, rand)]++;
    return { easy: n.easy / 4000, hard: n.hard / 4000 };
  };
  const fresh = share(0), hot = share(6);
  assert.ok(fresh.easy > 0.45 && fresh.hard < 0.1, JSON.stringify(fresh));
  assert.ok(hot.hard > 0.6 && hot.easy < 0.1, JSON.stringify(hot));
  assert.ok(share(3).hard > share(1).hard, 'more hard bots at 3 than at 1');
});

test('alone in the queue: a computer trainer steps in, plays, and never says so', async () => {
  const c = client('solo-player-0001');
  await c.hello();
  try {
    c.send({ t: 'queue', format: 3, team: ['charizard', 'raichu', 'lucario'], lead: 0, mega: {} });
    await c.wait('queued');
    const matched = await c.wait('matched', () => true, 8000);
    assert.equal(matched.format, 3);
    assert.equal(matched.foe.team.length, 3);
    assert.ok(matched.foe.name && matched.ranked !== false);
    assert.ok(!/bot|computer|\bai\b/i.test(JSON.stringify(matched)), `the match never says it is a bot: ${JSON.stringify(matched.foe)}`);

    c.send({ t: 'loaded', id: matched.id });
    await c.wait('start');
    // The bot fights back: within a while it uses a move or dodges (side "opponent" on the server).
    await c.wait('b', m => m.e?.some(e => e && e.side === 'opponent' && ['move', 'dodge'].includes(e.t)), 15000);

    // Only the human counts as online.
    const lobby = await (await fetch(`http://127.0.0.1:${port}/lobby`, { method: 'POST', body: '{}' })).json();
    assert.equal(lobby.modes[3].battling, 1);
    assert.equal(lobby.online, 1);

    // Leaving forfeits like any ranked match: a loss, a normal rating change, the win streak reset.
    c.send({ t: 'leave', id: matched.id });
    const end = await c.wait('end');
    assert.equal(end.result, 'loss');
    assert.ok(end.delta < 0 && end.delta > -32, `ordinary rating change: ${end.delta}`);
    assert.equal(end.record.streak, 0);
    assert.ok(!/bot|computer/i.test(JSON.stringify({ result: end.result, reason: end.reason })));
  } finally {
    c.ws.close();
  }
});

test('two players queueing together still meet each other, not bots', async () => {
  const a = client('pair-player-0001'), b = client('pair-player-0002');
  await Promise.all([a.hello(), b.hello()]);
  try {
    a.send({ t: 'queue', format: 6, team: ['charizard', 'raichu', 'lucario', 'blastoise', 'gengar', 'garchomp'], lead: 0, mega: {} });
    b.send({ t: 'queue', format: 6, team: ['venusaur', 'gyarados', 'alakazam', 'dragonite', 'tyranitar', 'metagross'], lead: 0, mega: {} });
    const [ma, mb] = await Promise.all([a.wait('matched'), b.wait('matched')]);
    assert.equal(ma.id, mb.id);
    assert.equal(ma.foe.name, 'SOLO');
  } finally {
    a.ws.close();
    b.ws.close();
  }
});

test('alone in a draft queue: a computer drafter takes the other seat, drafts, confirms and battles', async () => {
  const c = client('draft-solo-0001');
  await c.hello();
  try {
    c.send({ t: 'draft-queue', mode: 'snake', format: 3 });
    let s = await c.wait('draft-state');
    assert.equal(s.names[0], 'SOLO');
    assert.ok(s.names[1] && s.names[1] !== 'SOLO', `a computer drafter joined: ${s.names[1]}`);
    for (let n = 0; n < 40 && s.phase !== 'confirm'; n++) {
      if (s.phase === 'picking' && s.turn === s.you) c.send({ t: 'draft-pick', id: s.id, species: s.pool[0] });
      s = await c.wait('draft-state');
    }
    assert.equal(s.phase, 'confirm');
    assert.equal(s.teams[0].length, 3);
    assert.equal(s.teams[1].length, 3, 'the computer drafted its own three');
    c.send({ t: 'draft-confirm', id: s.id });
    const m = await c.wait('matched');
    assert.deepEqual(m.foe.team, s.teams[1]);
    c.send({ t: 'loaded', id: m.id });
    await c.wait('start');
    const foe = m.you === 'A' ? 'B' : 'A';
    await c.wait('b', b => b.e?.some(e => e.t === 'move' && e.side === (foe === 'A' ? 'player' : 'opponent')), 20000);
    c.send({ t: 'leave', id: m.id });
    await c.wait('end');
  } finally {
    c.ws.close();
  }
});

test('alone in a public raid: a computer ally comes along and fights the boss', async () => {
  const c = client('raid-solo-0001');
  await c.hello();
  try {
    c.send({ t: 'raid-queue', kind: 'public', boss: 'rayquaza', format: 3, team: ['charizard', 'raichu', 'lucario'], lead: 0, mega: {} });
    await c.wait('raid-waiting');
    const m = await c.wait('matched', x => !!x.raid);
    assert.equal(m.allyTeam.length, 3, 'the ally brought a team of three');
    c.send({ t: 'loaded', id: m.id });
    await c.wait('start');
    const first = await c.wait('b', b => !!b.ally && !b.ally.hidden);
    // The ally is played by the AI: it moves around the arena.
    await c.wait('b', b => b.ally && Math.hypot(b.ally.x - first.ally.x, b.ally.y - first.ally.y) > 20, 15000);
    assert.ok(!/TypeError|ReferenceError/.test(logs), 'no server errors');
  } finally {
    c.ws.close();
  }
});
