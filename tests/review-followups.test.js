// Follow-ups from the 21 Nov review of the audit fixes.
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EconomyStore } from '../server/economy-store.js';
import { originChecker } from '../server/origins.js';
import { Game } from '../src/game.js';

const pid = 'drain-player-0001', secret = 'a'.repeat(64), now = Date.UTC(2026, 10, 21, 12);

test('shutdown drain stores wallet changes made through a sink (Redis), saving a failed write again', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-drain-'));
  try {
    const store = new EconomyStore(path.join(dir, 'economy.json'));
    let calls = 0, flushed = 0;
    store.sink = () => (++calls === 1 ? Promise.reject(Error('storage down')) : Promise.resolve());
    store.flushNow = () => { flushed++; };
    store.request(pid, secret, 'view', null, now); // a new wallet: one write, which fails
    await new Promise(r => setTimeout(r, 0));
    assert.ok(store.unsaved.has(pid), 'the failed write leaves the wallet unsaved');
    assert.equal(await store.drain(Date.now() + 2000), true);
    assert.equal(calls, 2, 'the wallet was written again');
    assert.equal(store.unsaved.size + store.commits.size, 0);
    assert.ok(flushed >= 1, 'queued writes are sent at once');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('shutdown drain gives up at its deadline when storage keeps failing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-drain-'));
  try {
    const store = new EconomyStore(path.join(dir, 'economy.json'));
    store.sink = () => Promise.reject(Error('storage down'));
    store.request(pid, secret, 'view', null, now);
    const started = Date.now();
    assert.equal(await store.drain(started + 600), false);
    assert.ok(Date.now() - started < 1500, 'bounded by the deadline');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the match server accepts this project\'s Vercel previews and local pages, not other sites', () => {
  const allowed = originChecker('');
  for (const o of [undefined, 'https://pokemon-gules-delta.vercel.app', 'https://pokemon-2es7zacgm-navaneeth77s-projects.vercel.app',
    'https://pokemon-git-master-navaneeth77s-projects.vercel.app', 'http://localhost:5174', 'http://127.0.0.1:5175']) assert.ok(allowed(o), String(o));
  for (const o of ['https://evil.example', 'https://pokemon-copy.vercel.app', 'https://pokemon-x-someoneelse-projects.vercel.app',
    'https://pokemon-x-navaneeth77s-projects.vercel.app.evil.example', 'http://pokemon-x-navaneeth77s-projects.vercel.app']) assert.equal(allowed(o), false, o);
  const listed = originChecker('https://game.example');
  assert.ok(listed('https://game.example') && listed('https://pokemon-abc-navaneeth77s-projects.vercel.app'));
  assert.equal(listed('https://pokemon-gules-delta.vercel.app'), false, 'ALLOWED_ORIGINS replaces the default');
  assert.ok(originChecker('*')('https://anything.example'));
});

test('trimming keeps the current battle\'s raid boss and Tag partner sheets; a Pokédex load does not unpin them', async () => {
  const g = Object.assign(Object.create(Game.prototype), { sprites: {}, spriteUse: new Map(), selection: [], opponentSelection: [], playerTeam: {}, opponentTeam: {} });
  const big = () => ({ portrait: { width: 4096, height: 4096 }, anims: {} }); // 64 MiB decoded each
  for (const k of ['boss-skin', 'ally', 'old1', 'old2', 'old3', 'old4', 'dex']) g.sprites[k] = big();
  g.battleSprites = ['boss-skin', 'ally'];
  ['old1', 'old2', 'old3', 'old4'].forEach((k, i) => g.spriteUse.set(k, i));
  g.spriteUse.set('boss-skin', -2); g.spriteUse.set('ally', -1); // wanted longest ago, yet pinned
  g.trimSprites(['dex']);
  assert.ok(g.sprites['boss-skin'] && g.sprites.ally && g.sprites.dex);
  assert.ok(!g.sprites.old1, 'unpinned sets are released first');

  g.sprites.pikachu = big();
  await g.ensureSprites(['pikachu'], null, { extra: true });
  assert.deepEqual(g.battleSprites, ['boss-skin', 'ally'], 'an extra load leaves the battle pinned');
});
