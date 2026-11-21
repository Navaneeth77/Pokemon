import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { restoreBattleSides } from '../src/battle-snapshot.js';
import { BattleOutbox, sendQueued } from '../server/outbox.js';

class Socket extends EventEmitter {
  readyState = 1; bufferedAmount = 0; sent = []; callbacks = [];
  send(data, done) { this.sent.push(JSON.parse(data)); this.callbacks.push(done); }
  drain() { this.callbacks.shift()?.(); }
  close(code) { this.code = code; this.readyState = 3; this.emit('close'); }
}

test('slow readers receive latest state and every combat event exactly once in order', t => {
  const ws = new Socket(), out = new BattleOutbox(ws); t.after(() => out.dispose());
  out.send({ t: 'b', ts: 1, s: { x: 1 }, e: [{ id: 1 }] });
  for (let n = 2; n <= 50; n++) out.send({ t: 'b', ts: n, s: { x: n }, e: [{ id: n }] });
  assert.equal(ws.sent.length, 1); assert.equal(out.queue.length, 1);
  ws.drain();
  assert.equal(ws.sent[1].s.x, 50);
  assert.deepEqual(ws.sent.flatMap(m => m.e.map(e => e.id)), Array.from({ length: 50 }, (_, i) => i + 1));
  ws.drain(); assert.equal(out.queue.length, 0); assert.equal(out.timer, null);
});

test('coalescing retains raid hazard deltas and does not cross lifecycle messages', t => {
  const ws = new Socket(), out = new BattleOutbox(ws); t.after(() => out.dispose());
  out.send({ t: 'start' });
  out.send({ t: 'b', ts: 1, raid: { hp: 10, hz: [{ id: 7 }] } });
  out.send({ t: 'b', ts: 2, raid: { hp: 9 } });
  out.send({ t: 'b', e: [{ t: 'move' }] });
  out.send({ t: 'end' });
  out.send({ t: 'b', ts: 3, raid: { hp: 8, hz: [] } });
  for (let i = 0; i < 4; i++) ws.drain();
  assert.deepEqual(ws.sent.map(m => m.t), ['start', 'b', 'end', 'b']);
  assert.deepEqual(ws.sent[1].raid, { hp: 9, hz: [{ id: 7 }] });
  assert.equal(ws.sent[1].e[0].t, 'move'); assert.deepEqual(ws.sent[3].raid.hz, []);
});

test('stalled or oversized queues are bounded and close independently', () => {
  let now = 0;
  const ws = new Socket(), out = new BattleOutbox(ws, { now: () => now, maxAgeMs: 100 });
  out.send({ t: 'b', s: {} }); now = 101; out.flush();
  assert.equal(ws.code, 1013); assert.equal(out.timer, null);
  const big = new Socket(), bounded = new BattleOutbox(big, { maxBytes: 100 });
  bounded.send({ t: 'b', e: ['x'.repeat(101)] });
  assert.equal(big.code, 1013); assert.equal(bounded.queue.length, 0);
});


test('mixed clients share a match and recover complete current state after queued updates', () => {
  const legacy = new Socket(), modern = new Socket();
  modern.compactSnapshots = true;
  // This fixture is a full server snapshot, including values that change from active back to empty.
  const idle = {
    i: 0, sp: 'raichu', x: 160, y: 240, d: 0, fz: 0, ah: 0, hp: [240,180,160], u: 0,
    st: {}, bf: {}, sx: {}, fr: 0, g: 0, sh: 0, fm: null, mv: 0, lx: 0, ly: 1, sg: 0,
    ch: 0, iv: 0, ph: 0, hl: 0, ab: {}, mu: 0, sw: 0, cd: {}, q: 0, ea: null,
    te: 0, it: 0, hz: {}, wx: 0, tr: 0, fs: 0, rm: 0, ow: 0,
  };
  const busy = { ...idle, st: { burn: 1 }, cd: { thunderbolt: 2 }, ch: ['thunderbolt', .5],
    ab: { activated: false }, hz: { spikes: 2 }, fm: 'blade', q: [7, 30], ow: 1, future: 0 };
  function broadcast(msg) {
    const shared = {};
    for (const ws of [legacy, modern]) sendQueued(ws, msg, shared);
  }
  broadcast({ t: 'b', ts: 1, s: { A: busy, B: idle }, e: [] });
  broadcast({ t: 'b', ts: 2, s: { A: busy, B: busy }, e: [{ t: 'dodge' }] });
  broadcast({ t: 'b', ts: 3, s: { A: idle, B: idle }, e: [] });
  broadcast({ t: 'b', e: [{ t: 'move' }] });
  for (const ws of [legacy, modern]) ws.drain();
  for (const [i, packet] of modern.sent.entries()) {
    assert.ok(packet.cs && !packet.s);
    const { cs, ...rest } = packet;
    assert.deepEqual({ ...rest, s: restoreBattleSides(cs) }, legacy.sent[i]);
  }
  assert.deepEqual(modern.sent[1].e.map(e => e.t), ['dodge', 'move']);
  modern.sent[1].cs[0].st.burn = 1;
  assert.deepEqual(modern.sent[1].cs[1].st, {});
  legacy.close(); modern.close();
});
