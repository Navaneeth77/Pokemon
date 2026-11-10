import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';

// 2v2 Tag Battles on a real match server: two players team up; computer trainers fill the other side.
const port = 18895;
const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(port), LEADERBOARD_FILE: `/tmp/chaos-arena-tag-test-${Date.now()}.json`, BOT_MATCH_AFTER_MS: '1000' },
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
      throw new Error(`Timed out waiting for ${t}\n${logs.slice(-800)}`);
    },
    async hello() {
      await once(ws, 'open');
      ws.send(JSON.stringify({ t: 'hello', v: 2, pid, name }));
      return this.wait('welcome');
    },
  };
}

test('two players share a side: only the owner of the active Pokémon controls it, and switching hands over', async () => {
  const a = client('tag-player-00001', 'ASH'), b = client('tag-player-00002', 'BROCK');
  await Promise.all([a.hello(), b.hello()]);
  try {
    a.send({ t: 'queue', format: 'tag', team: ['charizard', 'raichu', 'lucario'], lead: 0, mega: {} });
    await new Promise(r => setTimeout(r, 50));
    b.send({ t: 'queue', format: 'tag', team: ['blastoise', 'gengar', 'garchomp'], lead: 0, mega: {} });
    const [ma, mb] = await Promise.all([a.wait('matched'), b.wait('matched')]);
    assert.equal(ma.id, mb.id);
    assert.equal(ma.you, 'A');
    assert.equal(mb.you, 'A');
    assert.deepEqual(ma.me.team, ['charizard', 'raichu', 'lucario', 'blastoise', 'gengar', 'garchomp']);
    assert.equal(ma.tag.me, 0);
    assert.equal(mb.tag.me, 1);
    assert.equal(ma.tag.partner, 'BROCK');
    assert.equal(ma.ranked, false);
    a.send({ t: 'loaded', id: ma.id });
    b.send({ t: 'loaded', id: mb.id });
    await Promise.all([a.wait('start'), b.wait('start')]);

    // Charizard (ASH's) leads: ASH is in control.
    const first = await a.wait('b', m => m.s?.A && m.e !== undefined && m.s.A.ow !== undefined, 15000);
    assert.equal(first.s.A.ow, 0);
    await a.wait('b', m => m.s?.A, 15000);
    // Switching to BROCK's Blastoise (index 3) hands control to BROCK once the switch goes through.
    for (let i = 0; i < 40; i++) {
      a.send({ t: 'act', id: ma.id, k: 'switch', i: 3 });
      const s = await a.wait('b', m => !!m.s, 5000);
      if (s.s.A.ow === 1) break;
      await new Promise(r => setTimeout(r, 250));
    }
    const after = await b.wait('b', m => m.s?.A?.ow === 1, 15000);
    assert.equal(after.s.A.i, 3);
    // Now ASH's presses are ignored: a switch request from ASH doesn't change the active Pokémon.
    a.send({ t: 'act', id: ma.id, k: 'switch', i: 0 });
    await new Promise(r => setTimeout(r, 600));
    b.messages.length = 0; // only updates from after ASH's ignored press
    const still = await b.wait('b', m => !!m.s, 5000);
    assert.equal(still.s.A.ow, 1);

    // Live list shows the tag battle; the lobby counts both players as battling in tag.
    const lobby = await (await fetch(`http://127.0.0.1:${port}/lobby`, { method: 'POST', body: '{}' })).json();
    assert.equal(lobby.modes.tag.battling, 2);

    // One player leaving: the computer takes over their Pokémon and the battle goes on.
    a.send({ t: 'leave', id: ma.id });
    await new Promise(r => setTimeout(r, 400));
    assert.ok(!b.messages.some(m => m.t === 'end'), 'the battle carries on for the partner');
  } finally {
    a.ws.close();
    b.ws.close();
  }
});
