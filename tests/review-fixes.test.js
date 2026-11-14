// Regressions for the 14 Nov 2026 codebase review (F01–F13): each test reproduces the reported failure.
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { Game } from '../src/game.js';
import { loadSpriteSets } from '../server/sprites.js';
import { MOVES } from '../src/moves.js';
import { applyHit } from '../src/combat.js';
import { changeStage } from '../src/status.js';
import { freshWallet } from '../src/economy.js';
import { EconomyStore } from '../server/economy-store.js';
import { Matchmaker } from '../src/matchmaking.js';

const sprites = loadSpriteSets(), noop = () => {};
function battle(team, foes) {
  const ui = new Proxy({ format: 3, log: noop }, { get: (t, k) => t[k] ?? noop });
  const g = new Game(document.createElement('canvas'), sprites, ui);
  g.headless = true;
  Object.assign(g, { selection: team, lead: 0, opponentSelection: foes, difficulty: 'easy' });
  g.start();
  Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
  g.ai = { update: noop, reset: noop, onThreat: noop };
  g.input = { vector: () => ({ x: 0, y: 0 }), clear: noop };
  for (const m of [g.player, g.opponent]) Object.assign(m, { hidden: false, appear: 0, item: null });
  Object.assign(g.player, { x: 180, y: 480 });
  Object.assign(g.opponent, { x: 180, y: 380 });
  return g;
}
function rolls(v, fn) { const r = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = r; } }
const benchOut = team => team.members.forEach((m, i) => { if (i !== team.index) Object.assign(m, { hp: 0, fainted: true }); });

// ── Combat ──
test('F02: Mirror Armor against Mirror Armor reflects once and stops', () => {
  const g = battle(['corviknight', 'snorlax', 'lapras'], ['corviknight', 'snorlax', 'lapras']);
  assert.doesNotThrow(() => changeStage(g, g.opponent, { atk: -1 }, g.player));
  // Reflected back to the user, whose own Mirror Armor can't send it again.
  assert.equal(g.player.stages.atk ?? 0, -1);
  assert.equal(g.opponent.stages.atk ?? 0, 0);
});

test('F12: Endure survives a second direct hit while it is still up', () => {
  const g = battle(['garchomp', 'snorlax', 'lapras'], ['blissey', 'snorlax', 'lapras']), o = g.opponent;
  o.hp = 10;
  o.endure = 0.9;
  rolls(0.99, () => applyHit(g, g.player, o, MOVES.earthquake));
  assert.equal(Math.ceil(o.hp), 1);
  rolls(0.99, () => applyHit(g, g.player, o, MOVES.earthquake));
  assert.equal(o.alive, true, 'still standing at 1 HP');
  o.endure = 0;
  rolls(0.99, () => applyHit(g, g.player, o, MOVES.earthquake));
  assert.equal(o.alive, false);
});

test('F11: Destiny Bond on the last Pokémon still takes the attacker down', () => {
  const g = battle(['tyranitar', 'snorlax', 'lapras'], ['gengar', 'snorlax', 'lapras']), o = g.opponent, p = g.player;
  benchOut(g.opponentTeam);
  Object.assign(o, { hp: 1, destinyBond: 2.5 });
  o.ab.cd = 99; // Cursed Body on cooldown, so the hit lands
  rolls(0.99, () => applyHit(g, p, o, MOVES.crunch));
  assert.equal(o.alive, false);
  assert.equal(p.alive, false, 'the attacker went down with it');
  assert.equal(g.state, 'finale');
  assert.equal(g.winner, 'player', 'the attacker still has Pokémon left, so its side wins');
});

test('F11: Destiny Bond when both sides are on their last Pokémon: the Destiny Bond side wins', () => {
  const g = battle(['tyranitar', 'snorlax', 'lapras'], ['gengar', 'snorlax', 'lapras']), o = g.opponent, p = g.player;
  benchOut(g.opponentTeam);
  benchOut(g.playerTeam);
  Object.assign(o, { hp: 1, destinyBond: 2.5 });
  o.ab.cd = 99; // Cursed Body on cooldown, so the hit lands
  rolls(0.99, () => applyHit(g, p, o, MOVES.crunch));
  assert.equal(p.alive, false);
  assert.equal(g.state, 'finale');
  assert.equal(g.winner, 'opponent');
});

test('F13: dodge distance is the same at every frame rate', () => {
  const distances = [20, 30, 60, 120, 144].map(hz => {
    const g = battle(['raichu', 'snorlax', 'lapras'], ['blissey', 'snorlax', 'lapras']), m = g.player;
    m.dodge(1, 0, true);
    const x0 = m.x;
    for (let i = 0; i < hz; i++) m.update(1 / hz, g); // one second
    return m.x - x0;
  });
  for (const d of distances) assert.ok(Math.abs(d - distances[2]) < 0.01, `${distances}`);
  assert.ok(Math.abs(distances[2] - 400 * 13 / 60) < 0.01, 'same distance online players already had at 60 Hz');
});

test('F05: a screen joining mid-battle is put where the battle really is by the first state update', () => {
  const g = battle(['raichu', 'snorlax', 'lapras'], ['charizard', 'gengar', 'lapras']);
  const mm = Object.assign(Object.create(Matchmaker.prototype), { game: g, flip: false, pred: null, hydrated: false });
  // The server says: the foe's lead has fainted and its second Pokémon is out with 80 HP.
  const s = { i: 1, sp: 'gengar', x: 200, y: 300, d: 4, hp: [0, 80, g.opponentTeam.members[2].maxHp], ab: {}, cd: {} };
  mm.hydrate(g.opponentTeam, s, 'opponent');
  assert.equal(g.opponentTeam.index, 1);
  assert.equal(g.opponent.species.id, 'gengar');
  assert.equal(g.opponentTeam.members[0].fainted, true);
  assert.equal(g.opponent.hp, 80);
  assert.equal(g.opponent.x, 200);
  assert.equal(g.opponent.hidden, false, 'it is shown on the field');
  assert.equal(g.opponentTeam.members[0].hidden, true, 'the old lead is not');
  assert.equal(g.player.foe, g.opponent, 'the new active Pokémon is linked as the foe');
  // A battle watched from the start is unchanged.
  const fresh = battle(['raichu', 'snorlax', 'lapras'], ['charizard', 'gengar', 'lapras']);
  const mm2 = Object.assign(Object.create(Matchmaker.prototype), { game: fresh, flip: false, pred: null });
  const lead = fresh.opponent;
  mm2.hydrate(fresh.opponentTeam, { i: 0, x: lead.x, y: lead.y, d: 0, hp: fresh.opponentTeam.members.map(m => m.maxHp) }, 'opponent');
  assert.equal(fresh.opponent, lead);
  assert.equal(fresh.opponentTeam.members.some(m => m.fainted), false);
});

// ── Wallet persistence ──
test('F03: a wallet save that fails is not reported as committed', async () => {
  const store = new EconomyStore(null);
  let fail = true;
  store.sink = () => fail ? Promise.reject(Error('storage down')) : Promise.resolve();
  const pid = 'wallet-fail-test', secret = 'e'.repeat(64);
  store.request(pid, secret, 'view');
  await assert.rejects(store.committed(pid), /storage down/);
  fail = false;
  store.request(pid, secret, 'view', null, Date.now() + 86_400_000 * 2); // a later day changes the wallet again
  await store.committed(pid);
});

test('F03: the journal file is fsynced and reloads after a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'economy-durable-')), file = path.join(dir, 'economy.json');
  const pid = 'wallet-durable-test', secret = 'f'.repeat(64);
  new EconomyStore(file).request(pid, secret, 'view');
  const again = new EconomyStore(file);
  assert.ok(again.authenticated(pid, secret));
});

// ── Match server ──
// A fake Upstash endpoint: writes can be delayed or made to fail, and the last value per wallet is kept.
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const ECO_PID = 'redis-order-player', ECO_SECRET = 'a1'.repeat(32);
const redisMock = { store: new Map(), writes: [], delays: [], fail: false };
{
  const w = freshWallet(ECO_PID, Date.now());
  w.owned.push('frame-amethyst', 'frame-ember');
  redisMock.store.set(ECO_PID, JSON.stringify({ credential: hash(ECO_SECRET), wallet: w }));
}
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    const cmd = JSON.parse(body);
    if (cmd[0] === 'HGETALL') return res.end(JSON.stringify({ result: cmd[1].includes('wallet') ? [...redisMock.store].flat() : [] }));
    if (cmd[0] === 'EVAL' && cmd[2] === '0') return res.end(JSON.stringify({ result: 1 })); // the startup scripting check
    // The revision-checked write (CAS_SCRIPT in server/index.js), emulated: a value is only stored when its
    // revision is newer than the stored one. Like real Redis, a write the client gave up on still runs later.
    if (cmd[0] === 'EVAL') {
      if (cmd[3].includes('wallet')) {
        const delay = redisMock.delays.shift() ?? 0;
        if (delay) await new Promise(r => setTimeout(r, delay));
        if (redisMock.fail) { res.statusCode = 500; return res.end(JSON.stringify({ error: 'down' })); }
        const args = cmd.slice(4);
        for (let i = 0; i < args.length; i += 3) {
          const [field, value, rev] = args.slice(i, i + 3);
          if (Number(rev) > Number(redisMock.store.get(`rev:${field}`) ?? -1)) redisMock.store.set(field, value).set(`rev:${field}`, rev);
        }
        redisMock.writes.push(cmd);
      }
      return res.writableEnded ? undefined : res.end(JSON.stringify({ result: 1 }));
    }
    res.end(JSON.stringify({ result: null }));
  });
});
mock.listen(0);
await once(mock, 'listening');

const port = 18897, dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-review-'));
const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(port), LEADERBOARD_FILE: path.join(dataDir, 'records.json'), ECONOMY_FILE: path.join(dataDir, 'economy.json'),
    UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${mock.address().port}`, UPSTASH_REDIS_REST_TOKEN: 'test', REDIS_TIMEOUT_MS: '1000', BOT_AFTER_MS: '0', MAX_MATCHES: '8' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stderr.on('data', b => logs += b);
// Fails fast (instead of hanging) if the server can't start, e.g. the port is taken.
await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(([code]) => { throw Error(`server exited (${code}): ${logs}`); })]);
test.after(() => { server.kill(); mock.close(); });

function client(pid) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`), messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw)));
  return {
    ws, messages, send: m => ws.send(JSON.stringify(m)),
    async wait(t, p = () => true) {
      for (let i = 0; i < 400; i++) {
        const k = messages.findIndex(m => m.t === t && p(m));
        if (k >= 0) return messages.splice(k, 1)[0];
        await new Promise(r => setTimeout(r, 25));
      }
      throw new Error(`Timed out ${t}: ${logs}`);
    },
    async hello(extra = {}) { await once(ws, 'open'); this.send({ t: 'hello', v: 2, pid, name: 'Test', ...extra }); await this.wait('welcome'); },
  };
}
const health = async () => (await fetch(`http://127.0.0.1:${port}/health`)).json();
const wallet = (op, id) => fetch(`http://127.0.0.1:${port}/economy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pid: ECO_PID, credential: ECO_SECRET, op, id }) });

test('F01: a malformed team closes only that connection; the server and other players carry on', async () => {
  const bad = client('malformed-team-a'), good = client('malformed-team-b');
  await Promise.all([bad.hello(), good.hello()]);
  try {
    bad.send({ t: 'queue', format: 3, team: [{ toString: null }, 'raichu', 'snorlax'] });
    assert.equal((await bad.wait('error')).code, 'bad-team');
    bad.send({ t: 'friends', codes: [{ toString: null }] });
    bad.send({ t: 'invite', room: { toString: null }, code: { toString: null } });
    await new Promise(r => setTimeout(r, 200));
    assert.equal((await health()).ready, true);
    good.send({ t: 'live' });
    assert.ok(Array.isArray((await good.wait('live')).list));
    assert.equal(server.exitCode, null, 'the server is still running');
  } finally { bad.ws.close(); good.ws.close(); }
});

test('battle messages without a match id from a player not in a match are ignored, not a crash', async () => {
  const c = client('idle-battle-messages');
  await c.hello();
  try {
    for (const t of ['in', 'act', 'loaded', 'leave']) c.send({ t });
    c.send({ t: 'live' });
    assert.ok(Array.isArray((await c.wait('live')).list), 'the same connection still works');
    assert.equal(c.messages.some(m => m.code === 'bad-message'), false);
  } finally { c.ws.close(); }
});

test('F07: a connection cannot switch to another player id', async () => {
  const c = client('hello-first-id');
  await c.hello();
  const before = (await health()).players;
  c.send({ t: 'hello', v: 2, pid: 'hello-second-id', name: 'Other' });
  assert.equal((await c.wait('error')).code, 'identity-locked');
  assert.equal((await health()).players, before);
  c.ws.close();
  await once(c.ws, 'close');
  await new Promise(r => setTimeout(r, 100));
  assert.equal((await health()).players, before - 1, 'no orphaned player left behind');
});

test('F06: an unranked draft whose opponent leaves during loading is not requeued as ranked', async () => {
  const a = client('draft-abort-a'), b = client('draft-abort-b');
  await Promise.all([a.hello(), b.hello()]);
  try {
    for (const c of [a, b]) c.send({ t: 'draft-queue', mode: 'snake', format: 3 });
    let states = await Promise.all([a, b].map(c => c.wait('draft-state')));
    const cs = [a, b];
    for (let i = 0; i < 6; i++) {
      const turn = states[0].turn;
      cs[turn].send({ t: 'draft-pick', id: states[0].id, species: states[turn].pool[0] });
      states = await Promise.all(cs.map(c => c.wait('draft-state')));
    }
    for (const c of cs) c.send({ t: 'draft-confirm', id: states[0].id });
    const [ma] = await Promise.all(cs.map(c => c.wait('matched')));
    b.ws.close();
    const aborted = await a.wait('aborted', m => m.id === ma.id);
    assert.equal(aborted.requeued, false);
    assert.equal(a.messages.some(m => m.t === 'queued'), false);
  } finally { a.ws.close(); b.ws.close(); }
});

test('F03/F04: wallet changes are answered only once stored, and an older write never overwrites a newer one', async () => {
  // The first write is held back; the second request must wait for it rather than race it.
  redisMock.delays.push(600);
  const [r1, r2] = await Promise.all([wallet('equip', 'frame-amethyst'), new Promise(r => setTimeout(r, 50)).then(() => wallet('equip', 'frame-ember'))]);
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(JSON.parse(redisMock.store.get(ECO_PID)).wallet.equipped.frame, 'frame-ember');
  // Storage down: the change is not reported as saved.
  redisMock.fail = true;
  const r3 = await wallet('equip', 'frame-amethyst');
  assert.equal(r3.status, 503);
  redisMock.fail = false;
  // Retrying is safe; it lands and the newest choice is what's stored.
  const r4 = await wallet('equip', 'frame-amethyst');
  assert.equal(r4.status, 200);
  assert.equal(JSON.parse(redisMock.store.get(ECO_PID)).wallet.equipped.frame, 'frame-amethyst');
});

test('F04: a write that timed out and runs late in Redis cannot replace a newer wallet', async () => {
  const stored = () => JSON.parse(redisMock.store.get(ECO_PID)).wallet.equipped.frame;
  // Write A is held well past the server's Redis timeout (1 s in this test), then still lands.
  redisMock.delays.push(2500);
  const a = await wallet('equip', 'frame-ember');
  assert.equal(a.status, 503, 'A was not confirmed');
  const b = await wallet('equip', 'frame-amethyst');
  assert.equal(b.status, 200, 'B was confirmed');
  assert.equal(stored(), 'frame-amethyst');
  await new Promise(r => setTimeout(r, 2500)); // A finally runs in "Redis"
  assert.equal(stored(), 'frame-amethyst', 'the late, older write was ignored');
  // After a restart the server would load what is stored: still the newest confirmed choice.
  const view = await (await wallet('view')).json();
  assert.equal(view.wallet.equipped.frame, stored());
  assert.equal((await health()).economy.ok, true, '/health reports the wallet store as working');
});
