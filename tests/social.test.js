import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';

// Spectating, quick chat and friends against a real match server (a computer trainer fills the match).
const port = 18894;
const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(port), LEADERBOARD_FILE: `/tmp/chaos-arena-social-test-${Date.now()}.json`, BOT_MATCH_AFTER_MS: '1000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', b => (logs += b));
server.stderr.on('data', b => (logs += b));
await once(server.stdout, 'data');
test.after(() => server.kill());

function client(pid, name) {
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
      ws.send(JSON.stringify({ t: 'hello', v: 2, pid, name }));
      return this.wait('welcome');
    },
  };
}

test('a live battle can be listed, watched and chatted in; friends see where you are', async () => {
  const a = client('social-player-0001', 'ASH'), s = client('social-watcher-0001', 'MISTY');
  const [wa] = await Promise.all([a.hello(), s.hello()]);
  assert.match(wa.code, /^[0-9A-F]{6}$/);
  try {
    a.send({ t: 'queue', format: 3, team: ['charizard', 'raichu', 'lucario'], lead: 0, mega: {}, kit: { charizard: { item: 'leftovers', tera: 'dragon' } } });
    const matched = await a.wait('matched', () => true, 8000);
    assert.equal(matched.me.kit.charizard.item, 'leftovers');
    assert.equal(matched.me.kit.charizard.tera, 'dragon');
    a.send({ t: 'loaded', id: matched.id });
    await a.wait('start');

    s.send({ t: 'live' });
    const live = await s.wait('live');
    assert.equal(live.list.length, 1);
    assert.equal(live.list[0].A.name, 'ASH');

    s.send({ t: 'spectate', id: matched.id });
    const info = await s.wait('spectate');
    assert.deepEqual(info.A.team, ['charizard', 'raichu', 'lucario']);
    await s.wait('b', m => !!m.s);

    a.send({ t: 'emote', id: matched.id, n: 2 });
    assert.equal((await s.wait('emote')).n, 2);
    assert.equal((await a.wait('emote')).side, 'A');
    a.send({ t: 'emote', id: matched.id, n: 99 }); // not one of the lines: ignored

    s.send({ t: 'friends', codes: [wa.code] });
    const friends = await s.wait('friends');
    assert.equal(friends.list[0].name, 'ASH');
    assert.equal(friends.list[0].match, matched.id);

    a.send({ t: 'leave', id: matched.id });
    const end = await s.wait('spectate-end');
    assert.equal(end.id, matched.id);
  } finally {
    a.ws.close();
    s.ws.close();
  }
});
