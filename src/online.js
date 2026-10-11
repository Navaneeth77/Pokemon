import { Peer } from 'peerjs';
import { MOVES } from './moves.js';
import { SPECIES } from './data/species.js';
import { TYPE_COLORS } from './data/types.js';
import { lookById, frontPalette } from './trainers.js';

// Online custom rooms: one player creates a room and shares its code, the other joins with it.
// Peer-to-peer over WebRTC; the free PeerJS cloud service only introduces the two browsers.
//
// Each game is in charge of its own Pokémon: it moves it, decides which hits land on it, and sends
// its state (~20×/s) plus what it does (moves, dodges, switches, Mega Evolution, fainting). The other
// game replays those actions on a "remote" copy so attacks look the same on both screens. The world
// is turned around for the other player, so each of you sees your own side at the bottom.
const PREFIX = 'chaos-arena-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 5;
const PROTOCOL = 1;
const SNAP_EVERY = 0.05;
const TIMEOUT_MS = 9000;

const turnX = x => 360 - x;
const turnY = y => 700 - y;
const r1 = v => Math.round(v * 10) / 10;

export const cleanCode = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
const randomCode = () => Array.from({ length: CODE_LEN }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

function netError(type, message) {
  return Object.assign(new Error(message), { type });
}

// Thin wrapper around PeerJS: a host peer whose id comes from the room code, and one data channel.
class Net {
  constructor(handlers) {
    this.handlers = handlers;
    this.peer = null;
    this.conn = null;
    this.closed = false;
  }

  host() {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const attempt = () => {
        const code = randomCode();
        const peer = new Peer(PREFIX + code.toLowerCase(), { debug: 0 });
        let opened = false;
        peer.on('open', () => {
          opened = true;
          if (this.closed) {
            peer.destroy();
            reject(netError('cancelled', 'Cancelled'));
            return;
          }
          this.peer = peer;
          resolve(code);
        });
        peer.on('error', err => {
          if (!opened && err.type === 'unavailable-id' && ++tries < 5) {
            peer.destroy();
            attempt();
          } else if (!opened) {
            peer.destroy();
            reject(err);
          } else this.handlers.error?.(err);
        });
        peer.on('connection', conn => {
          if (this.closed) return;
          if (this.conn) {
            // Room already has two players.
            conn.on('open', () => {
              conn.send({ t: 'full' });
              setTimeout(() => conn.close(), 400);
            });
            return;
          }
          this.attach(conn);
        });
        // Losing the matchmaking server doesn't drop an open connection; reconnect quietly for new joins.
        peer.on('disconnected', () => {
          if (!peer.destroyed) try { peer.reconnect(); } catch { /* ignore */ }
        });
      };
      attempt();
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 0 });
      this.peer = peer;
      let done = false;
      this.cancelJoin = () => {
        peer.destroy();
        finish(netError('cancelled', 'Cancelled'));
      };
      const finish = err => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };
      const timer = setTimeout(() => finish(netError('timeout', 'Timed out')), 15000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code.toLowerCase(), { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          if (done) return;
          this.attach(conn);
          finish();
        });
        conn.on('error', err => finish(err));
      });
      peer.on('error', err => {
        if (!done) finish(err);
        else this.handlers.error?.(err);
      });
    });
  }

  attach(conn) {
    this.conn = conn;
    conn.on('data', msg => {
      if (this.conn === conn && msg && typeof msg === 'object') this.handlers.message?.(msg);
    });
    conn.on('close', () => {
      if (this.conn !== conn) return;
      this.conn = null;
      this.handlers.close?.();
    });
    conn.on('error', () => {});
    if (conn.open) this.handlers.connect?.();
    else conn.on('open', () => this.handlers.connect?.());
  }

  send(msg) {
    if (!this.conn?.open) return;
    try { this.conn.send(msg); } catch { /* channel closing */ }
  }

  close() {
    const { conn, peer } = this;
    this.closed = true;
    this.cancelJoin?.();
    this.conn = null;
    this.peer = null;
    try { conn?.close(); } catch { /* ignore */ }
    try { peer?.destroy(); } catch { /* ignore */ }
  }
}

export class Online {
  constructor(game, flow) {
    this.game = game;
    this.flow = flow;
    this.net = null;
    this.clear();
  }

  clear() {
    Object.assign(this, {
      role: null, code: null, room: null, friend: null, me: null, them: null,
      loading: false, meLoaded: false, themLoaded: false, queue: [], snap: null,
      lastSeen: 0, ping: null, snapT: 0, lastAct: null, inBattle: false, entered: false,
    });
  }

  get connected() { return !!this.net?.conn; }

  open() {
    this.close();
    this.net = new Net({
      connect: () => this.onConnect(),
      message: msg => this.onMessage(msg),
      close: () => this.lost('left the room'),
      error: () => {},
    });
    this.pinger = setInterval(() => this.heartbeat(), 1000);
  }

  close() {
    clearInterval(this.pinger);
    this.net?.close();
    this.net = null;
    this.clear();
  }

  // ── Room setup ──
  async create(format, arena) {
    this.open();
    this.role = 'host';
    this.room = { format, arena };
    this.code = await this.net.host();
    return this.code;
  }

  async join(code) {
    this.open();
    this.role = 'guest';
    this.code = code;
    await this.net.join(code);
  }

  onConnect() {
    this.lastSeen = performance.now();
    const save = this.flow.save;
    this.send({ t: 'hello', v: PROTOCOL, name: save.name ?? 'TRAINER', look: save.look ?? null });
    if (this.role === 'host') this.send({ t: 'room', ...this.room });
  }

  send(msg) {
    this.net?.send(msg);
  }

  heartbeat() {
    if (!this.connected) return;
    this.send({ t: 'ping', ts: performance.now() });
    if (this.lastSeen && performance.now() - this.lastSeen > TIMEOUT_MS) this.lost('lost connection');
  }

  lost(why) {
    if (!this.net) return;
    const name = this.friend?.name ?? 'Your friend';
    this.close();
    this.flow.onlineLost(`${name} ${why}.`);
  }

  leave() {
    this.send({ t: 'bye' });
    // Give the goodbye a moment to go out before the channel closes.
    const net = this.net;
    this.net = null;
    clearInterval(this.pinger);
    setTimeout(() => net?.close(), 150);
    this.clear();
  }

  onMessage(m) {
    this.lastSeen = performance.now();
    switch (m.t) {
      case 'ping': this.send({ t: 'pong', ts: m.ts }); return;
      case 'pong': this.ping = Math.round(performance.now() - m.ts); this.flow.onlineUpdate(); return;
      case 'full': this.close(); this.flow.onlineError('That room already has two players.'); return;
      case 'bye': this.lost('left the room'); return;
      case 'hello':
        if (m.v !== PROTOCOL) {
          this.close();
          this.flow.onlineError('Your friend is on a different version of the game — both of you refresh the page.');
          return;
        }
        this.friend = { name: String(m.name ?? 'FRIEND').slice(0, 10).toUpperCase(), look: m.look };
        this.maybeEnter();
        return;
      case 'room':
        if (this.role === 'guest') {
          this.room = { format: m.format === 6 ? 6 : 3, arena: m.arena };
          this.maybeEnter();
        }
        return;
      case 'ready':
        this.them = { team: m.team, lead: m.lead, mega: m.mega ?? {} };
        this.flow.onlineUpdate();
        this.checkStart();
        return;
      case 'loaded':
        this.themLoaded = true;
        this.maybeStart();
        return;
      case 's':
        this.snap = m;
        if (this.inBattle && this.game.state === 'fighting') this.applyState(m);
        return;
      default:
        // Battle actions: replayed in order once the battle is running and no cutscene is playing.
        if (this.inBattle && ['move', 'dodge', 'mega', 'switch', 'faint', 'cancel'].includes(m.t)) this.queue.push(m);
    }
  }

  // Both players are here and the host has said which format and arena: go to team select.
  maybeEnter() {
    if (!this.friend || !this.room || this.entered) return;
    this.entered = true;
    this.flow.enterOnlineLobby();
  }

  // ── Team select: both press READY, both load sprites, then the battle starts on both screens ──
  ready(team, lead, mega) {
    if (this.me) return;
    this.me = { team: [...team], lead, mega: { ...mega } };
    this.send({ t: 'ready', ...this.me });
    this.flow.onlineUpdate();
    this.checkStart();
  }

  async checkStart() {
    if (!this.me || !this.them || this.loading || this.meLoaded) return;
    this.loading = true;
    this.flow.onlineUpdate();
    try {
      await this.game.ensureSprites([...this.me.team, ...this.them.team]);
    } catch (err) {
      console.error(err);
      this.loading = false;
      this.lost('could not be reached (loading failed)');
      return;
    }
    this.loading = false;
    if (!this.net) return;
    this.meLoaded = true;
    this.send({ t: 'loaded' });
    this.maybeStart();
  }

  maybeStart() {
    if (!this.meLoaded || !this.themLoaded || this.inBattle) return;
    const g = this.game, { me, them } = this;
    g.selection = [...me.team];
    g.lead = me.lead;
    g.megaPicks = { ...me.mega };
    g.opponentSelection = them.team.filter(id => SPECIES[id]);
    g.foeLead = Math.min(Math.max(0, them.lead | 0), g.opponentSelection.length - 1);
    g.foeMegaPicks = { ...them.mega };
    g.arenaId = this.room.arena;
    g.gold.name = this.friend.name;
    g.gold.setPalette(frontPalette(lookById(this.friend.look)));
    this.queue = [];
    this.snap = null;
    this.lastAct = null;
    this.inBattle = true;
    // Ready-ups from here on belong to the next battle (a rematch).
    this.me = this.them = null;
    this.meLoaded = this.themLoaded = false;
    g.online = this;
    this.flow.ui.format = g.selection.length;
    g.start();
  }

  begin() {
    this.snapT = 0;
  }

  // Back to team select for a rematch (both players ready up again).
  toLobby() {
    this.inBattle = false;
    this.queue = [];
    this.flow.enterOnlineLobby();
  }

  // ── In battle ──
  // Every frame: send our Pokémon's state now and then, and tell the other game when our attack was cut short.
  tick(dt) {
    if (!this.inBattle) return;
    const g = this.game, p = g.player;
    if (this.lastAct && this.lastAct !== p.action && this.lastAct.cancelled && !p.action) this.send({ t: 'cancel' });
    this.lastAct = p.action;
    if ((this.snapT -= dt) > 0) return;
    this.snapT = SNAP_EVERY;
    if (!['fighting', 'intro'].includes(g.state)) return;
    this.send(this.snapshot());
  }

  snapshot() {
    const g = this.game, p = g.player, team = g.playerTeam, ab = {};
    for (const [k, v] of Object.entries(p.ab)) if (v == null || typeof v !== 'object') ab[k] = v;
    return {
      t: 's', i: team.index, x: r1(p.x), y: r1(p.y), d: p.dir, fz: r1(p.z), ah: p.air ? r1(p.air.h) : 0,
      hp: team.members.map(m => Math.ceil(m.hp)), u: r1(p.ult), st: p.status, bf: p.buffs, fr: p.frozen > 0 ? r1(p.frozen) : 0,
      g: p.guard ? [p.guard.mult, p.guard.color, p.guard.label ?? null, !!p.guard.punish] : 0, sh: p.shield || 0, fm: p.form ?? null,
      mv: p.moving ? 1 : 0, lx: r1(p.lastMove.x), ly: r1(p.lastMove.y), sg: p.stagger > 0 ? 1 : 0,
      ch: p.charging ? [p.charging.id, r1(p.charging.t)] : 0, iv: p.invuln ? 1 : 0, ph: p.phasing ? 1 : 0, hl: p.held ? 1 : 0, ab,
    };
  }

  // HP, meter, statuses and the like straight from the other game (positions are smoothed per frame).
  applyState(s) {
    const g = this.game, team = g.opponentTeam;
    s.hp?.forEach((hp, k) => {
      const m = team.members[k];
      if (m && !m.fainted) m.hp = Math.max(0, Math.min(m.maxHp, hp));
    });
    const mon = team.members[s.i];
    if (mon !== g.opponent || mon.hidden || mon.fainted) return;
    if (mon.ult < 100 && s.u >= 100) g.onUltReady(mon);
    mon.ult = s.u;
    mon.status = s.st ?? {};
    mon.buffs = s.bf ?? {};
    mon.frozen = s.fr;
    mon.shield = s.sh;
    mon.guard = s.g ? { t: 1, mult: s.g[0], color: s.g[1], label: s.g[2], punish: s.g[3] } : null;
    if ((s.fm ?? null) !== (mon.form ?? null)) g.setForm(mon, s.fm);
    for (const k of Object.keys(mon.ab)) if (typeof mon.ab[k] !== 'object' && !(k in s.ab)) delete mon.ab[k];
    Object.assign(mon.ab, s.ab);
    mon.invuln = !!s.iv;
    mon.phasing = !!s.ph;
    mon.held = !!s.hl;
    if (s.sg && mon.stagger <= 0 && !mon.action) mon.sprite.play('Hurt', { loop: false, force: true });
    mon.stagger = s.sg ? 0.12 : 0;
    const mv = s.ch && MOVES[s.ch[0]];
    if (mv) {
      if (mon.charging?.id !== mv.id) {
        mon.charging = { id: mv.id, move: mv, t: s.ch[1], color: TYPE_COLORS[mv.type][0] };
        mon.sprite.play('Charge', { loop: true, force: true });
      } else mon.charging.t = s.ch[1];
    } else mon.charging = null;
  }

  processEvents() {
    const g = this.game;
    while (this.queue.length && g.state === 'fighting' && !g.cinematic) {
      const e = this.queue.shift(), mon = g.opponent;
      if (e.t === 'move') {
        if (!mon.hidden && !mon.fainted) g.useMove(mon, e.id, e.l ?? 0, true, e.cp);
      } else if (e.t === 'dodge') {
        if (!mon.hidden && !mon.fainted) g.dodge(mon, -e.x || 0.01, -e.y, true);
      } else if (e.t === 'mega') {
        if (e.c) mon.megaChoice = e.c;
        g.megaEvolve(mon, true);
      } else if (e.t === 'switch') g.remoteSwitch(e.i);
      else if (e.t === 'faint') {
        const m = g.opponentTeam.members[e.i] ?? mon;
        m.hp = 0;
        g.onFaint(m, g.player, MOVES[e.mv], e);
      } else if (e.t === 'cancel') mon.cancelAction();
    }
  }

  // The other player's active Pokémon follows their game: it animates here (walking, attacks),
  // while its position glides to where they say it is.
  beforePuppet() {
    const g = this.game, mon = g.opponent, s = this.snap;
    const live = s && g.state === 'fighting' && g.opponentTeam.members[s.i] === mon && !mon.hidden && !mon.fainted && mon.recallT <= 0;
    mon.input.x = live && s.mv ? -s.lx : 0;
    mon.input.y = live && s.mv ? -s.ly : 0;
    return live ? { mon, x: mon.x, y: mon.y } : null;
  }

  afterPuppet(dt, pre) {
    const g = this.game, mon = pre.mon, s = this.snap;
    if (mon !== g.opponent || mon.hidden || mon.fainted) return;
    const tx = turnX(s.x), ty = turnY(s.y), k = 1 - Math.exp(-dt * 14);
    if (Math.hypot(tx - pre.x, ty - pre.y) > 120) {
      mon.x = tx;
      mon.y = ty;
    } else {
      mon.x = pre.x + (tx - pre.x) * k;
      mon.y = pre.y + (ty - pre.y) * k;
    }
    mon.vx = mon.vy = 0;
    mon.dir = (s.d + 4) % 8;
    mon.z += (s.fz - mon.z) * k;
    if (s.ah > 0) {
      mon.air ??= { h: s.ah, vz: 0, t: 1, juggle: 0, g: 950 };
      mon.air.h += (s.ah - mon.air.h) * k;
      mon.air.vz = 0;
    } else mon.air = null;
  }
}
