// Exercise the real server with a leaderboard snapshot pending during graceful shutdown.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function client(port, id) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`), messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw)));
  return {
    ws, send: m => ws.send(JSON.stringify(m)),
    async wait(t) { for (let i = 0; i < 400; i++) { const k = messages.findIndex(m => m.t === t); if (k >= 0) return messages.splice(k, 1)[0]; await new Promise(r => setTimeout(r, 25)); } throw new Error(`Timed out ${t}`); },
    async hello() { await once(ws, 'open'); this.send({ t: 'hello', v: 2, pid: id, name: 'Test' }); await this.wait('welcome'); },
  };
}

async function stopDuringSave(t, writeDelayMs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-board-'));
  const file = path.join(dir, 'records.json');
  const server = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env, PORT: '0', LEADERBOARD_FILE: file, ECONOMY_FILE: path.join(dir, 'economy.json'),
      UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', LEADERBOARD_WRITE_DELAY_MS: String(writeDelayMs),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  server.stderr.on('data', chunk => { stderr += chunk; });
  const closed = once(server, 'close');
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
    await closed;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  let port;
  for await (const line of createInterface({ input: server.stdout })) {
    const match = /match server on :(\d+)/.exec(line);
    if (match) { port = Number(match[1]); break; }
  }
  assert.ok(port, `server exited before listening: ${stderr}`);
  const a = client(port, 'durable-player-a'), b = client(port, 'durable-player-b');
  try {
    await Promise.all([a.hello(), b.hello()]);
    a.send({ t: 'queue', format: 3, team: ['charizard', 'blastoise', 'venusaur'] });
    b.send({ t: 'queue', format: 3, team: ['gengar', 'snorlax', 'lucario'] });
    const ms = await Promise.all([a.wait('matched'), b.wait('matched')]);
    a.send({ t: 'loaded', id: ms[0].id }); b.send({ t: 'loaded', id: ms[1].id });
    await Promise.all([a.wait('start'), b.wait('start')]);
    b.send({ t: 'leave', id: ms[1].id });
    const end = await a.wait('end');
    assert.equal(end.record.w, 1);
  } finally {
    a.ws.close(); b.ws.close();
  }
  // The temporary file appears after the flush starts and before it replaces the durable snapshot.
  await t.waitFor(() => assert.ok(fs.existsSync(`${file}.tmp`)), { timeout: 10000 });
  assert.equal(fs.existsSync(file), false);
  const started = performance.now();
  server.kill('SIGTERM');
  const [code, signal] = await once(server, 'close', { signal: AbortSignal.timeout(9000) });
  assert.equal(signal, null);
  return { file, code, stderr, elapsed: performance.now() - started };
}

test('shutting down during a slow leaderboard write keeps the finished match', async t => {
  const { file, code, stderr } = await stopDuringSave(t, 1500);
  assert.equal(code, 0, stderr);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved['durable-player-a']?.w, 1);
  assert.equal(saved['durable-player-b']?.l, 1);
});

test('shutdown reports an unfinished leaderboard write when the five-second grace period expires', async t => {
  const { file, code, stderr, elapsed } = await stopDuringSave(t, 30000);
  assert.equal(code, 1);
  assert.match(stderr, /unsaved leaderboard changes/);
  assert.ok(elapsed >= 4900 && elapsed < 7500, `shutdown took ${elapsed} ms`);
  assert.equal(fs.existsSync(file), false);
});
