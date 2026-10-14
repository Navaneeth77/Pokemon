// Match server for online battles: matchmaking queue + server-authoritative battles.
//
// Players connect over a WebSocket, say who they are (an anonymous random id their browser keeps), and
// queue with a team. Two compatible players (same format, different ids) are paired into a match; the
// server then runs the game's own battle engine (src/game.js) for that match. Clients only send what
// their player wants to do (movement + button presses); the server decides every hit, faint and the
// winner, and streams the resulting events and state back for both screens to animate.
//
//   npm run server            PORT (default 8787), ALLOWED_ORIGINS (optional, comma separated)
import './shim.js';
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { loadSpriteSets } from './sprites.js';

const { Game } = await import('../src/game.js');
const { SPECIES, ROSTER } = await import('../src/data/species.js');
const { MOVES } = await import('../src/moves.js');
const { ARENAS } = await import('../src/arena.js');
const { LOOKS } = await import('../src/trainers.js');
const { safeName } = await import('../src/names.js');

export const PROTOCOL = 2;
const PORT = Number(process.env.PORT) || 8787;
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
// Testing only: every Pokémon starts with this fraction of its HP so a full match takes seconds.
const TEST_HP = Math.min(1, Math.max(0.01, Number(process.env.MATCH_TEST_HP) || 1));

// Battles are simulated at 60 steps a second, but the server only wakes 30 times a second (two steps
// per wake) and sends each player one message per wake with everything that happened plus the current
// state. Few wake-ups and few messages keep CPU use low enough for small shared hosting plans.
const STEP = 1 / 60;
const WAKE_MS = 1000 / 30;
const MAX_CATCHUP = 6; // after a stall, at most this many steps are made up at once
const QUEUE_TIMEOUT_MS = 3 * 60_000; // nobody compatible found: tell the player, they can retry
const LOAD_TIMEOUT_MS = 45_000; // both players must load the battle within this
const AFK_MS = 60_000; // no input at all for this long in battle forfeits
const MAX_BATTLE_S = 8 * 60; // then the side with more HP left wins
const HEARTBEAT_MS = 15_000;
const RATE = { perSec: 90, burst: 180 };

const sprites = loadSpriteSets();
const ROSTER_SET = new Set(ROSTER);
const LOOK_IDS = new Set(LOOKS.map(l => l.id));
const noop = () => {};
const r1 = v => Math.round(v * 10) / 10;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── Players and connections ──
const players = new Map(); // pid → { pid, name, look, ws, state: 'idle'|'queued'|'match', entry, match, record }
const queues = { 3: [], 6: [] }; // waiting entries per format, oldest first
const matches = new Map();
const records = new Map(); // pid → { w, l, d } — kept in memory for as long as the server runs

function send(ws, msg) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
}

function sendTo(player, msg) {
  send(player?.ws, msg);
}

// ── Validation: nothing from a client is trusted ──
function validTeam(m) {
  const format = m.format === 6 ? 6 : m.format === 3 ? 3 : 0;
  const team = Array.isArray(m.team) ? m.team.map(String) : [];
  if (!format || team.length !== format || new Set(team).size !== format || !team.every(id => ROSTER_SET.has(id))) return null;
  const lead = Number.isInteger(m.lead) && m.lead >= 0 && m.lead < format ? m.lead : 0;
  const mega = {};
  for (const id of team) {
    const pick = m.mega?.[id];
    if (typeof pick === 'string' && SPECIES[id].mega?.includes(pick)) mega[id] = pick;
  }
  return { format, team, lead, mega };
}

// ── Queue ──
function enqueue(player, spec, since = Date.now(), front = false) {
  const entry = { player, ...spec, since };
  player.state = 'queued';
  player.entry = entry;
  const q = queues[spec.format];
  if (front) q.unshift(entry);
  else q.push(entry);
  sendTo(player, { t: 'queued', format: spec.format, since });
  pair(spec.format);
}

function dequeue(player) {
  const e = player.entry;
  if (!e) return;
  const q = queues[e.format], k = q.indexOf(e);
  if (k >= 0) q.splice(k, 1);
  player.entry = null;
  if (player.state === 'queued') player.state = 'idle';
}

// Pairs the longest-waiting player with the next compatible one. Runs synchronously on the single
// event loop, so an entry can never end up in two matches.
function pair(format) {
  const q = queues[format];
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const j = q.findIndex((b, k) => k > i && b.player.pid !== a.player.pid);
    if (j < 0) continue;
    const b = q[j];
    q.splice(j, 1);
    q.splice(i, 1);
    i--;
    a.player.entry = b.player.entry = null;
    createMatch(a, b);
  }
}

// ── Matches ──
class Match {
  constructor(a, b) {
    this.id = crypto.randomBytes(6).toString('hex');
    this.format = a.format;
    this.arena = ARENAS[Math.floor(Math.random() * ARENAS.length)].id;
    this.side = { A: a, B: b };
    this.loaded = { A: false, B: false };
    this.phase = 'loading';
    this.created = Date.now();
    this.vec = { A: { x: 0, y: 0 }, B: { x: 0, y: 0 } };
    this.active = { A: Date.now(), B: Date.now() };
    this.bufB = null;
    this.megaQueuedB = 0;
    this.lastAct = { player: null, opponent: null };
    this.out = []; // events since the last message
    this.fightT = 0;
    for (const s of ['A', 'B']) {
      const p = this.side[s].player;
      p.state = 'match';
      p.match = this;
      p.matchSide = s;
    }
  }

  other(s) { return s === 'A' ? 'B' : 'A'; }

  intro() {
    for (const s of ['A', 'B']) {
      const me = this.side[s], foe = this.side[this.other(s)];
      sendTo(me.player, {
        t: 'matched', id: this.id, you: s, format: this.format, arena: this.arena,
        me: { team: me.team, lead: me.lead, mega: me.mega },
        foe: { name: foe.player.name, look: foe.player.look, team: foe.team, lead: foe.lead, mega: foe.mega },
      });
    }
  }

  loadedBy(s) {
    if (this.phase !== 'loading') return;
    this.loaded[s] = true;
    if (this.loaded.A && this.loaded.B) this.begin();
  }

  // Both players have the battle loaded: build it with the real engine and start the clock.
  begin() {
    const { A, B } = this.side;
    const ui = new Proxy({ format: this.format }, { get: (t, k) => (k in t ? t[k] : noop) });
    const g = new Game(document.createElement('canvas'), sprites, ui);
    g.particles.max = -1; // particles are purely visual: none on the server
    g.input = { vector: () => this.vec.A, clear: noop };
    g.selection = [...A.team];
    g.lead = A.lead;
    g.megaPicks = { ...A.mega };
    g.opponentSelection = [...B.team];
    g.foeLead = B.lead;
    g.foeMegaPicks = { ...B.mega };
    g.arenaId = this.arena;
    g.red.name = A.player.name;
    g.gold.name = B.player.name;
    g.online = {
      authority: true,
      send: msg => this.out.push(msg),
      tick: dt => this.tick(dt),
      begin: noop,
      processEvents: noop,
      beforePuppet: () => this.driveB(),
      afterPuppet: noop,
    };
    g.start();
    if (TEST_HP < 1) for (const m of [...g.playerTeam.members, ...g.opponentTeam.members]) m.hp = Math.max(1, Math.round(m.maxHp * TEST_HP));
    this.game = g;
    this.phase = 'battle';
    this.active.A = this.active.B = Date.now();
    this.broadcast({ t: 'start', id: this.id });
    ensureLoop();
    log(`match ${this.id} started (${A.player.name} vs ${B.player.name}, ${this.format}v${this.format}, ${this.arena})`);
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const s of ['A', 'B']) {
      const ws = this.side[s].player.ws;
      if (ws?.readyState === 1) ws.send(data);
    }
  }

  step() {
    if (this.phase !== 'battle') return;
    const g = this.game;
    g.update(STEP);
    if (g.state === 'fighting') this.fightT += STEP;
    if (g.state === 'finale' || g.state === 'over') return this.finish(g.winner === 'player' ? 'A' : g.winner === 'opponent' ? 'B' : null, 'ko');
    const now = Date.now();
    if (g.state === 'fighting') {
      const afkA = now - this.active.A > AFK_MS, afkB = now - this.active.B > AFK_MS;
      if (afkA || afkB) return this.finish(afkA && afkB ? null : afkA ? 'B' : 'A', 'afk');
    }
    if (this.fightT > MAX_BATTLE_S) {
      const left = team => team.members.reduce((n, m) => n + Math.max(0, m.hp) / m.maxHp, 0);
      const a = left(g.playerTeam), b = left(g.opponentTeam);
      this.finish(Math.abs(a - b) < 0.01 ? null : a > b ? 'A' : 'B', 'time');
    }
  }

  // Engine hook, every step: note when an attack was cut short so both screens stop it too.
  tick() {
    const g = this.game;
    for (const mon of [g.player, g.opponent]) {
      const last = this.lastAct[mon.side];
      if (last && last !== mon.action && last.cancelled && !mon.action) this.out.push({ t: 'cancel', side: mon.side });
      this.lastAct[mon.side] = mon.action;
    }
  }

  // Once per wake: one message per player with the events since the last one and the current state.
  flush() {
    const g = this.game;
    if (!g) return;
    const live = g.state === 'fighting' || g.state === 'intro';
    if (!this.out.length && !live) return;
    const msg = { t: 'b', e: this.out };
    if (live) msg.s = { A: snapshot(g.playerTeam, g.switchCD), B: snapshot(g.opponentTeam, g.foeSwitchCD) };
    this.out = [];
    this.broadcast(msg);
  }

  // Engine hook, before the second player's Pokémon updates: their held direction (sent from their
  // turned-around view) plus anything they pressed during a recovery.
  driveB() {
    const g = this.game, o = g.opponent, v = this.vec.B, fighting = g.state === 'fighting';
    o.input.x = fighting ? -v.x : 0;
    o.input.y = fighting ? -v.y : 0;
    if (fighting && this.bufB) {
      this.bufB.t -= STEP;
      if (g.useMove(o, o.species.moves[this.bufB.i]) || this.bufB.t <= 0) this.bufB = null;
    }
    if (fighting && this.megaQueuedB > 0) {
      this.megaQueuedB -= STEP;
      if (g.megaEvolve(o)) this.megaQueuedB = 0;
    }
    return null;
  }

  input(s, m) {
    if (this.phase !== 'battle') return;
    const x = Number(m.x), y = Number(m.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const len = Math.hypot(x, y), k = len > 1 ? 1 / len : 1;
    this.vec[s] = { x: x * k, y: y * k };
    if (len > 0.1) this.active[s] = Date.now();
  }

  // A button press from one player, applied with exactly the rules an offline player has.
  act(s, m) {
    if (this.phase !== 'battle') return;
    const g = this.game, k = String(m.k), i = Number.isInteger(m.i) ? m.i : -1;
    this.active[s] = Date.now();
    if (g.state !== 'fighting') return;
    if (s === 'A') {
      if (k === 'press' && i >= 0 && i < 4) g.playerPress(i);
      else if (k === 'release' && i >= 0 && i < 4) g.playerRelease(i);
      else if (k === 'dodge') g.playerDodge();
      else if (k === 'ult') g.playerUltimate();
      else if (k === 'mega') g.playerMega();
      else if (k === 'switch' && i >= 0 && i < this.format) g.pickSwitch(i);
      return;
    }
    const o = g.opponent, p = g.player;
    if (k === 'press' && i >= 0 && i < 4) {
      const id = o.species.moves[i];
      if (!id || (MOVES[id]?.chargeable && g.beginCharge(o, id))) return;
      if (!g.useMove(o, id) && o.alive && !o.charging && g.moveCD(o, id) <= 0.25) this.bufB = { i, t: 0.3 };
    } else if (k === 'release' && i >= 0 && i < 4) {
      if (o.charging?.id === o.species.moves[i]) g.releaseCharge(o);
    } else if (k === 'dodge') {
      const v = this.vec.B, held = v.x || v.y;
      g.dodge(o, held ? -v.x : o.x - p.x || 0.01, held ? -v.y : o.y - p.y || -1);
    } else if (k === 'ult') g.useMove(o, o.species.ultimate);
    else if (k === 'mega') {
      if (!g.megaEvolve(o) && o.species.mega?.length && !g.opponentTeam.megaUsed) this.megaQueuedB = 0.8;
    } else if (k === 'switch' && i >= 0 && i < this.format) {
      this.bufB = null;
      g.switchFoe(i);
    }
  }

  // The only place a result is decided. `winner` is 'A', 'B' or null (draw / no contest).
  finish(winner, reason) {
    if (this.phase === 'done') return;
    const wasLoading = this.phase === 'loading';
    this.flush(); // the knockout itself goes out before the result
    this.phase = 'done';
    matches.delete(this.id);
    for (const s of ['A', 'B']) {
      const p = this.side[s].player;
      const result = winner == null ? 'draw' : winner === s ? 'win' : 'loss';
      if (!wasLoading) p.record[result === 'win' ? 'w' : result === 'loss' ? 'l' : 'd']++;
      if (p.match === this) {
        p.match = null;
        p.state = 'idle';
      }
      sendTo(p, { t: 'end', id: this.id, result, reason, record: p.record });
    }
    log(`match ${this.id} ended: ${winner ?? 'draw'} (${reason})`);
  }

  // Before the battle starts (someone never loaded or left): no result. Players still connected and
  // ready are put back at the front of the queue.
  abort(reason, requeue) {
    if (this.phase !== 'loading') return;
    this.phase = 'done';
    matches.delete(this.id);
    for (const s of ['A', 'B']) {
      const e = this.side[s], p = e.player;
      if (p.match !== this) continue;
      p.match = null;
      p.state = 'idle';
      const again = requeue(s) && p.ws?.readyState === 1;
      sendTo(p, { t: 'aborted', id: this.id, reason, requeued: again });
      if (again) enqueue(p, { format: e.format, team: e.team, lead: e.lead, mega: e.mega }, e.since, true);
    }
    log(`match ${this.id} aborted (${reason})`);
  }

  // A player left (closed the page, lost connection, or pressed Leave).
  leave(s, reason) {
    if (this.phase === 'loading') this.abort('opponent-left', k => k !== s);
    else if (this.phase === 'battle') this.finish(this.other(s), reason);
  }
}

function snapshot(team, switchCD) {
  const p = team.active, ab = {};
  for (const [k, v] of Object.entries(p.ab)) if (v == null || typeof v !== 'object') ab[k] = v;
  return {
    i: team.index, x: r1(p.x), y: r1(p.y), d: p.dir, fz: r1(p.z), ah: p.air ? r1(p.air.h) : 0,
    hp: team.members.map(m => Math.ceil(Math.max(0, m.hp))), u: r1(p.ult), st: p.status, bf: p.buffs, fr: p.frozen > 0 ? r1(p.frozen) : 0,
    g: p.guard ? [p.guard.mult, p.guard.color, p.guard.label ?? null, !!p.guard.punish] : 0, sh: p.shield || 0, fm: p.form ?? null,
    mv: p.moving ? 1 : 0, lx: r1(p.lastMove.x), ly: r1(p.lastMove.y), sg: p.stagger > 0 ? 1 : 0,
    ch: p.charging ? [p.charging.id, r1(p.charging.t)] : 0, iv: p.invuln ? 1 : 0, ph: p.phasing ? 1 : 0, hl: p.held ? 1 : 0, ab,
    mu: team.megaUsed ? 1 : 0, sw: r1(switchCD ?? 0), cd: Object.fromEntries(Object.entries(p.cooldowns).filter(([, v]) => v > 0).map(([k, v]) => [k, r1(v)])),
  };
}

function createMatch(a, b) {
  const m = new Match(a, b);
  matches.set(m.id, m);
  log(`paired ${a.player.name} + ${b.player.name} → match ${m.id}`);
  m.intro();
}

// ── Messages ──
function onMessage(conn, raw) {
  // Simple token bucket per connection; floods are dropped, then disconnected.
  const now = Date.now();
  conn.tokens = Math.min(RATE.burst, conn.tokens + ((now - conn.refill) / 1000) * RATE.perSec);
  conn.refill = now;
  if (conn.tokens < 1) {
    if (++conn.dropped > 500) conn.ws.close(1008, 'rate limit');
    return;
  }
  conn.tokens--;
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
  if (m.t === 'ping') return send(conn.ws, { t: 'pong', ts: m.ts });
  if (m.t === 'hello') return hello(conn, m);
  const p = conn.player;
  if (!p || p.ws !== conn.ws) return send(conn.ws, { t: 'error', code: 'no-hello', message: 'Say hello first.' });
  switch (m.t) {
    case 'queue': {
      if (p.state === 'match') return sendTo(p, { t: 'error', code: 'in-match', message: 'You are already in a match.' });
      const spec = validTeam(m);
      if (!spec) return sendTo(p, { t: 'error', code: 'bad-team', message: 'That team is not valid for this format.' });
      dequeue(p); // queueing again replaces the old entry (one entry per player)
      return enqueue(p, spec);
    }
    case 'cancel':
      if (p.state === 'queued') {
        dequeue(p);
        sendTo(p, { t: 'cancelled' });
      }
      return;
    case 'loaded':
      if (p.match?.id === m.id) p.match.loadedBy(p.matchSide);
      return;
    case 'in':
      if (p.match?.id === m.id) p.match.input(p.matchSide, m);
      return;
    case 'act':
      if (p.match?.id === m.id) p.match.act(p.matchSide, m);
      return;
    case 'leave':
      if (p.match?.id === m.id) p.match.leave(p.matchSide, 'forfeit');
      return;
  }
}

function hello(conn, m) {
  if (m.v !== PROTOCOL) return send(conn.ws, { t: 'error', code: 'version', message: 'The game was updated — refresh the page.' });
  const pid = typeof m.pid === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(m.pid) ? m.pid : null;
  if (!pid) return send(conn.ws, { t: 'error', code: 'bad-id', message: 'Missing player id.' });
  let p = players.get(pid);
  if (p && p.ws && p.ws !== conn.ws) {
    if (p.ws.readyState === 1) {
      // Same player in another tab: never let one person hold two queue entries or matches.
      if (p.state !== 'idle') return send(conn.ws, { t: 'error', code: 'duplicate', message: 'You are already searching or battling in another tab.' });
      p.ws.close(4000, 'replaced');
    } else {
      // Their old connection is going away: whatever it held is cleared now, not when it finally closes.
      if (p.state === 'queued') dequeue(p);
      if (p.match) p.match.leave(p.matchSide, 'disconnect');
    }
  }
  if (!records.has(pid)) records.set(pid, { w: 0, l: 0, d: 0 });
  if (!p) players.set(pid, (p = { pid, state: 'idle', entry: null, match: null, record: records.get(pid) }));
  p.ws = conn.ws;
  p.name = safeName(m.name);
  p.look = LOOK_IDS.has(m.look) ? m.look : null;
  conn.player = p;
  send(conn.ws, { t: 'welcome', v: PROTOCOL, record: p.record });
}

function onClose(conn) {
  const p = conn.player;
  if (!p || p.ws !== conn.ws) return;
  p.ws = null;
  if (p.state === 'queued') dequeue(p);
  if (p.match) p.match.leave(p.matchSide, 'disconnect');
  if (p.state === 'idle') players.delete(p.pid);
}

// ── Clock: runs only while a battle is going on (60 steps a second, 30 wake-ups); housekeeping 1×/s ──
let loop = null, last = 0, acc = 0;
function ensureLoop() {
  if (loop) return;
  last = performance.now();
  acc = 0;
  loop = setInterval(runBattles, WAKE_MS);
}

function runBattles() {
  const now = performance.now();
  acc = Math.min(acc + (now - last) / 1000, MAX_CATCHUP * STEP);
  last = now;
  const live = [...matches.values()].filter(m => m.phase === 'battle');
  if (!live.length) {
    clearInterval(loop);
    loop = null;
    return;
  }
  while (acc >= STEP) {
    acc -= STEP;
    for (const m of live) {
      try {
        m.step();
      } catch (err) {
        console.error(`match ${m.id} crashed`, err);
        m.finish(null, 'error');
      }
    }
  }
  for (const m of live) if (m.phase === 'battle') m.flush();
}

setInterval(() => {
  {
    const t = Date.now();
    for (const q of Object.values(queues)) {
      for (const e of [...q]) {
        if (e.player.ws?.readyState !== 1) dequeue(e.player);
        else if (t - e.since > QUEUE_TIMEOUT_MS) {
          dequeue(e.player);
          sendTo(e.player, { t: 'queue-timeout' });
        }
      }
    }
    for (const m of matches.values()) {
      if (m.phase === 'loading' && t - m.created > LOAD_TIMEOUT_MS) m.abort('load-timeout', s => m.loaded[s]);
    }
  }
}, 1000);

// ── HTTP (health check) + WebSocket ──
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: players.size, matches: matches.size, queued: queues[3].length + queues[6].length }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  server,
  maxPayload: 4096,
  verifyClient: ({ origin }) => !ORIGINS.length || ORIGINS.includes(origin),
});

wss.on('connection', ws => {
  const conn = { ws, player: null, tokens: RATE.burst, refill: Date.now(), dropped: 0, alive: true };
  ws.on('pong', () => (conn.alive = true));
  ws.on('message', data => onMessage(conn, data.toString()));
  ws.on('close', () => onClose(conn));
  ws.on('error', noop);
  ws.conn = conn;
});

// Connections that stop answering pings are dropped (which also clears their queue entry or match).
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.conn.alive) {
      ws.terminate();
      continue;
    }
    ws.conn.alive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

server.listen(PORT, () => log(`match server on :${PORT} (${Object.keys(sprites).length} sprite sets${TEST_HP < 1 ? `, TEST HP ×${TEST_HP}` : ''})`));
