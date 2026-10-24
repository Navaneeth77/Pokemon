import { saveSummary } from './mastery.js';
import { DamageNumber } from './effects.js';
import { Pokemon } from './pokemon.js';
import { HIT_REACTIONS } from './reactions.js';
import { BOSSES, RAID_DIFFICULTY, dressBoss, evolveRaidBoss } from './bosses.js';
import { MOVES } from './moves.js';
import { SPECIES } from './data/species.js';
import { TYPE_COLORS } from './data/types.js';
import { lookById, frontPalette } from './trainers.js';
import { safeName } from './names.js';
import { sfx } from './audio.js';

// Online matchmaking against random players, through the match server (server/index.js).
//
// The browser picks a team and queues; the server pairs two players of the same format and runs the
// battle itself with the game's engine. Here every Pokémon is "remote": this game only sends what the
// player presses and which way they hold the stick, then animates the moves, hits, faints and switches
// the server reports, with positions, HP and meters following its state updates. The result shown at
// the end is the server's. The second player sees the arena turned around so their side is at the bottom.
const PROTOCOL = 2;
const PID_KEY = 'msb.pid';
const CONNECT_TIMEOUT_MS = 12000; // one attempt; a sleeping server is retried until WAKE_WAIT_MS
const WAKE_WAIT_MS = 75000; // a free-plan server that went to sleep takes up to a minute to wake
const SILENCE_MS = 10000;
const INPUT_GAP_MS = 25; // a changed direction goes out straight away, at most 40 times a second
const PRED_MS = 700; // our own predicted attack waits at least this long for the server to confirm it
// The opponent is shown slightly in the past, between two server updates, so uneven delivery still
// looks smooth; how far in the past adapts to how uneven the connection is.
const INTERP_MIN_MS = 35, INTERP_MAX_MS = 180;
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const portrait = id => `/sprites/${SPECIES[id].sprite}/portrait.png`;

// VITE_MATCH_SERVER_URL (wss://…) in production; a server on this computer (or on the LAN) in development.
export function matchServerUrl() {
  const env = import.meta.env?.VITE_MATCH_SERVER_URL;
  if (env) return env;
  const h = location.hostname;
  const local = h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local') || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h);
  return local ? `ws://${h}:8787` : null;
}

// An anonymous random id this browser keeps, so the server can tell players apart (and never pairs
// a player with themselves). In development ?pid=… lets two tabs act as two different players.
function playerId() {
  const dev = import.meta.env?.DEV && new URLSearchParams(location.search).get('pid');
  if (dev) return `dev-${dev}`.replace(/[^A-Za-z0-9_-]/g, '').padEnd(8, '0').slice(0, 64);
  const make = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  try {
    let id = localStorage.getItem(PID_KEY);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id ?? '')) localStorage.setItem(PID_KEY, (id = make()));
    return id;
  } catch {
    return (playerId.session ??= make());
  }
}

export class Matchmaker {
  constructor(game, flow) {
    this.game = game;
    this.flow = flow;
    this.server = true; // tells the engine every Pokémon here is driven by the match server
    this.url = matchServerUrl();
    this.pid = playerId();
    this.ws = null;
    this.welcomed = false;
    this.state = 'idle'; // idle | connecting | searching | matched | loading | battle | result | error
    this.record = null;
    this.ping = null;
    this.spec = null;
    this.match = null;
    this.result = null;
    this.events = [];
    this.snap = { player: null, opponent: null };
    this.lobby = null; // who's online + leaderboard, from the match server (see pollLobby)
    this.buildOverlay();
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && this.lbOpen) {
        e.preventDefault();
        this.hideLeaderboard();
      } else if (e.code === 'Escape' && ['connecting', 'searching'].includes(this.state)) {
        e.preventDefault();
        this.cancel();
      }
    });
    setInterval(() => this.heartbeat(), 1000);
    setInterval(() => this.pollLobby(), 5000);
    this.wake();
  }

  get httpUrl() { return this.url.replace(/^ws/, 'http'); }

  // A sleeping match server starts waking on its first request, so the game knocks as soon as it
  // loads: by the time the player has picked a team the server is usually up.
  wake() {
    if (this.url) fetch(`${this.httpUrl}/health`, { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
  }

  // ── Who's online and the leaderboard ──
  // While the main menu or the Online Battles screen is open, the game checks in with the match server
  // every few seconds (on the Online Battles screen it also counts you as online, in your format).
  async pollLobby(force = false) {
    const f = this.flow, onQueue = !!f.ui.queue && this.game.state === 'select';
    if (!this.url || document.hidden || this.lobbyBusy) return;
    if (!force && !onQueue && f.screen !== 'title' && !this.busy && !this.lbOpen) return;
    this.lobbyBusy = true;
    try {
      const here = onQueue || this.busy;
      const body = JSON.stringify(here ? { pid: this.pid, fmt: this.spec?.format && this.busy ? this.spec.format : f.ui.format } : { pid: this.pid });
      const res = await fetch(`${this.httpUrl}/lobby`, { method: 'POST', body, headers: { 'content-type': 'text/plain' }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
      this.lobby = await res.json();
      f.lobbyChanged?.();
      f.ui.lobbyChanged?.();
      if (this.state === 'searching') this.renderLive();
      if (this.lbOpen) this.renderLeaderboard();
    } catch {
      /* server asleep or offline: keep the last numbers */
    } finally {
      this.lobbyBusy = false;
    }
  }

  // "3 others searching for 3 VS 3" under the search timer.
  renderLive() {
    const el = this.el.querySelector('.mm-live'), fmt = this.spec?.format ?? 3, m = this.lobby?.modes?.[fmt];
    if (!el) return;
    const others = m ? Math.max(0, m.searching - 1) : null;
    el.textContent = others == null ? '' : others ? `${others} other player${others > 1 ? 's' : ''} searching for ${fmt} VS ${fmt}` : `You're the first one searching for ${fmt} VS ${fmt}`;
  }

  showLeaderboard() {
    this.lbOpen = true;
    if (!this.lb) {
      this.lb = Object.assign(document.createElement('div'), { id: 'lb-overlay', className: 'mm-overlay' });
      this.lb.addEventListener('click', e => e.target === this.lb && this.hideLeaderboard());
    }
    if (!this.lb.isConnected) document.body.appendChild(this.lb);
    this.lb.classList.remove('hidden');
    this.renderLeaderboard();
    this.pollLobby(true);
  }

  hideLeaderboard() {
    this.lbOpen = false;
    this.lb?.classList.add('hidden');
  }

  renderLeaderboard() {
    const d = this.lobby, me = d?.me;
    const rows = d?.top?.length
      ? d.top.map(r => `<tr class="${r.me ? 'me' : ''}"><td>#${r.rank}</td><td>${esc(r.name)}${r.me ? ' <b>(you)</b>' : ''}</td><td>${r.rating}</td><td>${r.w}W · ${r.l}L</td></tr>`).join('')
      : `<tr><td colspan="4" class="lb-empty">${this.url ? (d ? 'No ranked players yet — win the first online battle!' : 'Loading…') : 'The leaderboard needs the online match server.'}</td></tr>`;
    const you = me ? `You: <b>#${me.rank}</b> of ${d.players} · rating <b>${me.rating}</b> · ${me.w}W ${me.l}L` : 'Play an online battle to get ranked (everyone starts at 1000).';
    const live = d ? `<div class="lb-live">● ${d.online} online · 3v3: ${d.modes[3].battling + d.modes[3].searching + d.modes[3].browsing} · 6v6: ${d.modes[6].battling + d.modes[6].searching + d.modes[6].browsing}</div>` : '';
    this.lb.innerHTML = `<div class="mm-card lb-card"><h2 class="mm-title">🏆 LEADERBOARD</h2>${live}
      <table class="lb-table"><thead><tr><th>Rank</th><th>Trainer</th><th>Rating</th><th>Record</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="lb-you">${you}</p><div class="mm-btns"><button class="px-btn primary" data-a="close">CLOSE</button></div></div>`;
    this.lb.querySelector('[data-a="close"]').addEventListener('click', () => this.hideLeaderboard());
  }

  get inBattle() { return this.state === 'battle'; }
  get busy() { return ['connecting', 'searching', 'matched', 'loading'].includes(this.state); }

  // ── Connection ──
  connect() {
    if (this.ws?.readyState === 1 && this.welcomed) return Promise.resolve();
    this.drop();
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(this.url); } catch (err) { return reject(err); }
      this.ws = ws;
      this.cancelConnect = () => { clearTimeout(timer); reject(Object.assign(new Error('cancelled'), { code: 'cancelled' })); };
      this.lastSeen = performance.now();
      const timer = setTimeout(() => {
        reject(Object.assign(new Error('timeout'), { code: 'timeout' }));
        if (this.ws === ws) this.drop();
      }, CONNECT_TIMEOUT_MS);
      ws.onopen = () => {
        const save = this.flow.save;
        ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, pid: this.pid, name: save.name ?? 'TRAINER', look: save.look ?? null }));
      };
      ws.onmessage = ev => {
        if (this.ws !== ws) return;
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (!m || typeof m !== 'object') return;
        this.lastSeen = performance.now();
        if (!this.welcomed) {
          if (m.t === 'welcome') {
            clearTimeout(timer);
            this.welcomed = true;
            this.record = m.record;
            resolve();
          } else if (m.t === 'error') {
            clearTimeout(timer);
            reject(Object.assign(new Error(m.message), { code: m.code }));
            this.drop();
          }
          return;
        }
        this.onMessage(m);
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        clearTimeout(timer);
        reject(Object.assign(new Error('closed'), { code: 'closed' }));
        if (this.ws !== ws) return;
        this.ws = null;
        this.welcomed = false;
        this.onClosed();
      };
    });
  }

  // Closes the socket without treating it as a lost connection.
  drop() {
    this.cancelConnect?.();
    this.cancelConnect = null;
    const ws = this.ws;
    this.ws = null;
    this.welcomed = false;
    if (ws) {
      ws.onclose = ws.onmessage = null;
      try { ws.close(); } catch { /* already closed */ }
    }
  }

  send(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  heartbeat() {
    if (!this.ws || !this.welcomed) return;
    this.send({ t: 'ping', ts: performance.now() });
    if (performance.now() - this.lastSeen > SILENCE_MS) {
      const ws = this.ws;
      this.ws = null;
      this.welcomed = false;
      try { ws.close(); } catch { /* ignore */ }
      this.onClosed();
    }
  }

  onClosed() {
    if(this.match?.raid && this.state==='battle'){
      this.state='connecting';this.game.paused=true;this.game.hud.callout('player','RECONNECTING · 15s GRACE');
      this.connectReady().catch(()=>{this.game.paused=false;this.result={result:'draw',reason:'lost'};this.state='result';this.stopBattle();});return;
    }
    if (this.state === 'connecting') return; // find() reports a connection that never opened
    if (this.busy) this.fail('Lost connection to the match server.', true);
    else if (this.state === 'battle') {
      this.state = 'result';
      this.result = { result: 'loss', reason: 'lost', record: this.record };
      this.stopBattle();
    }
  }

  async connectReady() {
    if (!this.url) throw new Error('No match server configured');
    this.readyAbort?.abort();
    const controller = this.readyAbort = new AbortController();
    const epoch = this.connectEpoch = (this.connectEpoch ?? 0) + 1;
    const until = Date.now() + WAKE_WAIT_MS;
    for (let attempt = 0; Date.now() < until; attempt++) {
      if (epoch !== this.connectEpoch) throw new Error('cancelled');
      try {
        const res = await fetch(`${this.httpUrl}/ready`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]) });
        if (!res.ok || !(await res.json()).ready) throw new Error('not ready');
        if (epoch !== this.connectEpoch) throw new Error('cancelled');
        await this.connect();
        return;
      } catch (err) {
        if (epoch !== this.connectEpoch || ['duplicate', 'version'].includes(err.code)) throw err;
        await new Promise(resolve => { this.retryResolve = resolve; this.retryTimer = setTimeout(resolve, Math.min(8000, 500 * 2 ** attempt) * (0.8 + Math.random() * 0.4)); });
      }
    }
    throw new Error('Server startup timed out');
  }

  // ── Queue ──
  async find(spec) {
    if (this.busy) return;
    this.spec = { format: spec.format, team: [...spec.team], lead: spec.lead, mega: { ...spec.mega } };
    this.flow.save.format = spec.format;
    this.flow.persist();
    if (!this.url) {
      this.fail('Online matchmaking is not available on this site yet: no match server is configured.', false);
      return;
    }
    this.result = null;
    this.waking = false;
    this.setState('connecting');
    this.wake();
    // Still connecting after a few seconds: the server is most likely waking up, so say so and keep trying.
    const until = Date.now() + WAKE_WAIT_MS;
    clearTimeout(this.wakeNote);
    this.wakeNote = setTimeout(() => {
      if (this.state !== 'connecting') return;
      this.waking = true;
      this.setState('connecting');
    }, 3500);
    for (;;) {
      try {
        await this.connectReady();
        break;
      } catch (err) {
        if (this.state !== 'connecting') return;
        if (err.code === 'duplicate' || err.code === 'version') return this.fail(err.message, err.code === 'duplicate');
        if (Date.now() > until) return this.fail("Couldn't reach the match server. Check your connection and try again.", true);
        await new Promise(r => setTimeout(r, 2000));
        if (this.state !== 'connecting') return;
      }
    }
    clearTimeout(this.wakeNote);
    if (this.state !== 'connecting') return;
    this.send({ t: 'queue', ...this.spec });
  }

  cancel() {
    this.readyAbort?.abort();
    this.connectEpoch = (this.connectEpoch ?? 0) + 1;
    clearTimeout(this.retryTimer); this.retryResolve?.();
    clearTimeout(this.wakeNote);
    if (this.state === 'searching' || this.state === 'connecting') {
      this.send({ t: 'cancel' });
      this.setState('idle');
      this.drop();
      sfx.denied?.();
    }
  }

  retry() {
    if (this.spec) this.find(this.spec);
  }

  // "Find New Match" after a result: back to team select and straight into the queue with the same team.
  again() {
    if(this.match?.raid || this.match?.draftMode){const raid=this.match.raid;this.stop();this.flow.showTitleMenu();if(raid)this.flow.expansion.raids();else this.flow.expansion.drafts();return;}
    const spec = this.spec;
    clearTimeout(this.koTimer);
    this.match = null;
    this.result = null;
    this.state = 'idle';
    this.flow.enterQueueSelect();
    if (spec) this.find(spec);
  }

  // Leaves whatever is going on (title menu, another mode). A running match is forfeited.
  stop() {
    this.readyAbort?.abort();
    this.connectEpoch = (this.connectEpoch ?? 0) + 1;
    clearTimeout(this.retryTimer); this.retryResolve?.();
    clearTimeout(this.wakeNote);
    if (this.state === 'searching' || this.state === 'connecting') this.send({ t: 'cancel' });
    if (this.match && (this.state === 'battle' || this.state === 'matched' || this.state === 'loading')) this.send({ t: 'leave', id: this.match.id });
    this.cancelConnect?.();
    this.cancelConnect = null;
    const ws = this.ws;
    this.ws = null;
    this.welcomed = false;
    if (ws) {
      ws.onclose = ws.onmessage = null;
      setTimeout(() => { try { ws.close(); } catch { /* ignore */ } }, 150);
    }
    clearTimeout(this.koTimer);
    this.match = null;
    this.events = [];
    this.setState('idle');
  }

  onMessage(m) {
    if (this.flow.expansion?.onMessage(m)) return;
    switch (m.t) {
      case 'pong': {
        // Round-trip time: the median of the last few, so one slow reply doesn't throw it off.
        const rtt = performance.now() - m.ts;
        this.rtts = [...(this.rtts ?? []).slice(-6), rtt];
        this.rtt = [...this.rtts].sort((a, b) => a - b)[this.rtts.length >> 1];
        this.ping = Math.round(rtt);
        if (this.state === 'battle') $('#panel .loc').textContent = `ONLINE MATCH · ${this.ping} MS`;
        return;
      }
      case 'queued':
        this.queuedAt = Date.now();
        this.setState('searching');
        return;
      case 'cancelled':
        if (this.state === 'searching') this.setState('idle');
        return;
      case 'queue-timeout':
        this.fail('No opponent found right now. Try again in a moment.', true);
        return;
      case 'matched':
        this.onMatched(m);
        return;
      case 'aborted':
        if (this.match?.id !== m.id) return;
        this.match = null;
        if (m.requeued) {
          this.note = m.reason === 'load-timeout' ? "Your opponent didn't load in time — searching again" : 'Your opponent left — searching again';
          this.setState('searching');
        } else this.fail(m.reason === 'load-timeout' ? 'The battle took too long to load. Try again.' : 'The match was cancelled.', true);
        return;
      case 'start':
        if (this.match?.id === m.id && (this.state === 'loading' || this.state === 'matched')) this.beginBattle();
        return;
      case 'b':
        if (m.raid) {
          // Pending hazards only come when they change; keep the last list otherwise.
          const prev = this.game.raidState;
          this.game.raidState = { ...m.raid, hz: m.raid.hz ?? prev?.hz ?? [], recv: performance.now() };
          const b = this.game.opponent;
          if (b && m.raid.mg) evolveRaidBoss(b, m.raid.id, this.game.sprites);
          if (b && b.maxHp !== m.raid.maxHp) b.species = { ...b.species, hp: m.raid.maxHp };
        }
        if(m.ally) this.updateAlly(m.ally);
        // One message per server wake-up: what happened since the last one, then the current state.
        if (!this.match || (this.state !== 'battle' && this.state !== 'result')) return;
        if (Array.isArray(m.e)) for (const e of m.e) if (e) this.events.push(e);
        if (m.s && this.state === 'battle') this.onSnapshot(m.s, m.ts);
        return;
      case 'ev':
        if (this.match && (this.state === 'battle' || this.state === 'result') && m.e) this.events.push(m.e);
        return;
      case 's':
        if (this.match && this.state === 'battle') this.onSnapshot(m);
        return;
      case 'end':
        if (this.match?.id === m.id) this.onEnd(m);
        return;
      case 'error':
        if (this.busy) this.fail(m.message ?? 'Something went wrong.', true);
        return;
    }
  }

  async onMatched(m) {
    this.match = m;
    this.note = null;
    this.flip = m.you === 'B';
    this.setState('matched');
    sfx.megaBurst?.();
    try {
      await this.game.ensureSprites([...m.me.team, ...m.foe.team, ...(m.allyTeam ?? [])]);
    } catch (err) {
      console.error(err);
      if (this.match === m) this.fail('Could not load the battle. Check your connection and try again.', true);
      this.send({ t: 'leave', id: m.id });
      return;
    }
    if (this.match !== m || this.state !== 'matched') return;
    this.send({ t: 'loaded', id: m.id });
    this.setState('loading');
  }

  // ── Battle ──
  beginBattle() {
    const g = this.game, m = this.match, ui = this.flow.ui;
    this.flow.show(null); this.flow.opening.stop(); this.flow.screen='battle'; document.querySelector('#intro').classList.add('hidden');
    g.selection = [...m.me.team];
    g.lead = m.me.lead;
    g.megaPicks = { ...m.me.mega };
    g.opponentSelection = [...m.foe.team];
    g.foeLead = m.foe.lead;
    g.foeMegaPicks = { ...m.foe.mega };
    g.arenaId = m.arena;
    g.gold.name = safeName(m.foe.name);
    g.gold.setPalette(frontPalette(lookById(m.foe.look)));
    this.events = [];
    this.snap = { player: null, opponent: null };
    this.result = null;
    this.state = 'battle';
    this.hideOverlay();
    this.flow.togglePause(false);
    ui.format = g.selection.length;
    g.online = this;
    g.start();
    if (m.raid) {
      Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
      dressBoss(g.opponent, m.raid);
      for (const p of [g.player, g.opponent]) {
        p.hidden = false;
        p.appear = 0;
      }
      g.gold.hidden = true;
      $('#panel .loc').textContent = `CO-OP RAID · ${BOSSES[m.raid]?.name ?? ''} · ${RAID_DIFFICULTY[m.difficulty]?.label ?? ''}`;
    }
  }

  updateAlly(s) {
    const g=this.game,sp=SPECIES[s.species];if(!sp || !g.sprites[sp.sprite])return;
    if(g.raidAlly?.species.id!==sp.id){g.raidAlly=new Pokemon(sp,g.sprites[sp.sprite],'player');g.raidAlly.reset(s.x,s.y,s.dir);g.raidAlly.remote=true;}
    const a=g.raidAlly;Object.assign(a,{x:s.x,y:s.y,dir:s.dir,hp:s.hp,hidden:s.hidden||s.eliminated});a.sprite.dir=s.dir;a.sprite.update(1/30);
    if(s.disconnected)g.hud.callout('player','PARTNER DISCONNECTED · 15s GRACE');
  }

  begin() {
    this.lastIn = null;
    this.inAt = 0;
    this.inSeq = 0;
    this.sentAt = new Map(); // direction update number → when it was sent
    this.pred = { moves: [], dodge: 0, charge: null, released: null, buffer: null };
    this.hist = []; // where our own Pokémon was over the last moment, for lining it up with the server
    this.histMon = null;
    this.corr = null;
    this.foeBuf = []; // the opponent's recent positions with the server's clock, oldest first
    this.offs = [];
    this.offset = null;
    this.delay = null;
    this.foeSample = null;
  }

  // A button press: the server applies it with the normal rules, and the result comes back as events.
  // Attacks and dodges also start here straight away (see predict), so they never wait for the round trip.
  intent(kind, i) {
    if (this.state !== 'battle' || !this.match) return;
    this.send({ t: 'act', id: this.match.id, k: kind, i });
    this.predict(kind, i);
  }

  // Our own attack or dodge starts on this screen at once, using the same rules the server uses. When
  // the server's copy of it arrives it is skipped; if the server never confirms it (it disagreed about
  // whether the move was ready), the attack is called off. Ultimates, Mega Evolution, Copy and switching
  // wait for the server, because they pause the battle or depend on what the opponent did.
  predict(kind, i) {
    const g = this.game, p = g.player, pr = this.pred, now = performance.now();
    if (!pr || g.state !== 'fighting' || g.cinematic || g.switching || p.hidden || p.fainted || this.flow.pauseOpen) return;
    if (kind === 'dodge') {
      const o = g.opponent, v = g.input.vector(), held = v.x || v.y;
      if (g.dodge(p, held ? v.x : p.x - o.x || 0.01, held ? v.y : p.y - o.y || 1)) pr.dodge = now;
      return;
    }
    const id = p.species.moves[i], m = MOVES[id];
    if (!m || m.copy || m.ultimate) return;
    if (kind === 'press') {
      if (m.chargeable) {
        if (g.beginCharge(p, id)) {
          pr.charge = { id, at: now };
          g.ui.pressed(i, true);
        }
      } else if (!this.tryMove(i, now) && p.alive && !p.charging && g.moveCD(p, id) <= 0.25) {
        pr.buffer = { i, t: 0.3 }; // the server holds a press made just before recovering; so do we
      }
    } else if (kind === 'release' && p.charging?.id === id) {
      pr.charge = null;
      if (g.releaseCharge(p)) {
        pr.moves.push({ id, at: now });
        pr.released = { id, at: now };
      }
    }
  }

  tryMove(i, now) {
    const g = this.game, id = g.player.species.moves[i];
    if (!g.useMove(g.player, id)) return false;
    this.pred.moves.push({ id, at: now });
    this.pred.buffer = null;
    g.ui.pressed(i, true);
    return true;
  }

  // The server confirmed one of our moves: true when we already started it ourselves.
  confirm(id) {
    const list = this.pred?.moves, k = list ? list.findIndex(e => e.id === id) : -1;
    if (k < 0) return false;
    list.splice(0, k + 1); // anything predicted before it was never used by the server
    return true;
  }

  // Every frame: predictions the server never confirmed run out, and the held direction goes to the
  // server as soon as it changes (and every half second regardless).
  tick(dt) {
    if (this.state !== 'battle' || !this.match) return;
    const g = this.game, p = g.player, pr = this.pred, now = performance.now();
    if (pr) {
      // Time stands still for predictions while a cutscene pauses the battle.
      if (g.cinematic) for (const e of pr.moves) e.at += dt * 1000;
      const limit = Math.max(PRED_MS, (this.rtt ?? 150) * 2.5 + 200);
      pr.moves = pr.moves.filter(e => {
        if (now - e.at < limit) return true;
        if (p.action?.move.id === e.id) p.cancelAction();
        return false;
      });
      if (pr.dodge && now - pr.dodge > limit) pr.dodge = 0;
      if (pr.buffer && g.state === 'fighting' && !g.cinematic) {
        pr.buffer.t -= dt;
        if (!this.tryMove(pr.buffer.i, now) && pr.buffer.t <= 0) pr.buffer = null;
      }
    }
    const v = g.state === 'fighting' && !this.flow.pauseOpen ? g.input.vector() : { x: 0, y: 0 };
    const x = Math.round(v.x * 100) / 100, y = Math.round(v.y * 100) / 100;
    const same = this.lastIn && this.lastIn.x === x && this.lastIn.y === y, since = now - this.inAt;
    if (since < INPUT_GAP_MS || (same && since < 500)) return;
    this.lastIn = { x, y };
    this.inAt = now;
    const q = ++this.inSeq;
    this.sentAt.set(q, now);
    this.sentAt.delete(q - 120);
    this.send({ t: 'in', id: this.match.id, x, y, q });
  }

  local(side) { return (side === 'player') !== this.flip ? 'player' : 'opponent'; }
  fx(x) { return this.flip ? 360 - x : x; }
  fy(y) { return this.flip ? 700 - y : y; }
  fv(v) { return this.flip ? -v : v; }
  fd(d) { return this.flip ? (d + 4) % 8 : d; }

  // Replays what happened on the server, in order, once the battle is running and no cutscene is playing.
  processEvents() {
    const g = this.game;
    while (this.events.length && g.state === 'fighting' && !g.cinematic) {
      const e = this.events.shift(), loc = this.local(e.side);
      const team = loc === 'player' ? g.playerTeam : g.opponentTeam, mon = team.active, foe = loc === 'player' ? g.opponent : g.player;
      if (e.t === 'move') {
        if (mon.hidden || mon.fainted) continue;
        if (loc === 'player' && this.confirm(e.id)) continue; // already playing: we started it ourselves
        g.useMove(mon, e.id, e.l ?? 0, true, e.cp);
        const k = mon.species.moves.indexOf(e.id);
        if (loc === 'player' && k >= 0) g.ui.pressed(k, true);
      } else if (e.t === 'dodge') {
        if (loc === 'player' && this.pred?.dodge) {
          this.pred.dodge = 0;
          continue;
        }
        if (!mon.hidden && !mon.fainted) g.dodge(mon, this.fv(e.x) || 0.01, this.fv(e.y), true);
      } else if (e.t === 'mega') {
        if (e.c) mon.megaChoice = e.c;
        g.megaEvolve(mon, true);
      } else if (e.t === 'switch') {
        if (loc === 'player' && this.pred) Object.assign(this.pred, { moves: [], dodge: 0, charge: null, released: null, buffer: null });
        g.remoteSwitch(e.i, loc);
      } else if (e.t === 'faint') {
        const m = team.members[e.i] ?? mon;
        m.hp = 0;
        g.onFaint(m, foe, MOVES[e.mv], e);
      } else if (e.t === 'boss-hit') {
        g.spawn(new DamageNumber(e.x,e.y-e.z,e.damage,{color:'#ffb080',size:18}));mon.flash=1;
      } else if (e.t === 'reaction') {
        const r = HIT_REACTIONS.find(r => r.id === e.id);
        if (r) { g.reactFx(this.fx(e.x), this.fy(e.y), e.z, r); g.hud.callout(loc, r.label); }
      } else if (e.t === 'cancel') {
        // Only the attack the server cut short (not a newer one we have already started).
        if (!e.id || mon.action?.move.id === e.id) mon.cancelAction();
      }
    }
  }

  onSnapshot(m, ts) {
    const g = this.game, mine = this.flip ? m.B : m.A, theirs = this.flip ? m.A : m.B;
    if (!mine || !theirs) return;
    this.snap = { player: mine, opponent: theirs };
    const now = performance.now();
    if (typeof ts === 'number' && this.foeBuf) {
      this.trackClock(ts, now);
      const b = this.foeBuf;
      b.push({ ts, i: theirs.i, x: theirs.x, y: theirs.y, d: theirs.d, fz: theirs.fz, ah: theirs.ah, mv: theirs.mv, lx: theirs.lx, ly: theirs.ly });
      const shown = now - this.offset - this.delay;
      while (b.length > 2 && (b[1].ts < shown - 100 || b.length > 90)) b.shift();
    }
    if (g.state !== 'fighting') return;
    this.applyState(g.playerTeam, mine, true);
    this.applyState(g.opponentTeam, theirs, false);
    if (typeof mine.sw === 'number') g.switchCD = mine.sw;
    this.measureDrift(mine, now);
  }

  // How far the server's copy of our Pokémon is from where ours was at the same moment. Our screen
  // moves first, so the server's position is compared with where we were when it got our input, not
  // with where we are now (which would drag us backwards on every update).
  measureDrift(s, now) {
    const g = this.game, mon = g.playerTeam.active;
    if (!this.hist || g.playerTeam.members[s.i] !== mon || mon.hidden || mon.fainted || mon.recallT > 0) return;
    const sent = s.q && this.sentAt.get(s.q[0]);
    const at = sent ? sent + s.q[1] : now - (this.rtt ?? 120) - 25;
    const tx = this.fx(s.x), ty = this.fy(s.y), past = this.pastPos(at) ?? mon;
    const ex = tx - past.x, ey = ty - past.y;
    this.corr = Math.hypot(ex, ey) > 120 ? { snap: true, x: tx, y: ty } : { x: ex, y: ey };
  }

  pastPos(t) {
    const h = this.hist;
    if (!h.length || t < h[0].t) return null;
    for (let k = h.length - 1; k >= 0; k--) {
      if (h[k].t > t) continue;
      const a = h[k], b = h[k + 1];
      if (!b) return a;
      const f = (t - a.t) / (b.t - a.t || 1);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    return null;
  }

  // The server's clock against ours: the fastest update sets the baseline, and the spread of the rest
  // sets how far in the past the opponent is shown.
  trackClock(ts, now) {
    const w = this.offs;
    w.push({ at: now, off: now - ts });
    while (w.length > 2 && w[0].at < now - 3000) w.shift();
    let min = Infinity;
    for (const e of w) if (e.off < min) min = e.off;
    this.offset = min;
    const late = w.map(e => e.off - min).sort((a, b) => a - b);
    const want = Math.min(INTERP_MAX_MS, Math.max(INTERP_MIN_MS, late[Math.floor(late.length * 0.9)] + 20));
    this.delay = this.delay == null ? want : this.delay + (want - this.delay) * 0.05;
  }

  // Where the opponent was a moment ago, between the two server updates around that moment (or a
  // little past the newest one, in the same direction, while the next is late).
  sampleFoe(now) {
    const b = this.foeBuf;
    if (!b?.length || this.offset == null) return null;
    const t = now - this.offset - this.delay;
    let k = b.length - 1;
    while (k >= 0 && b[k].ts > t) k--;
    if (k < 0) return b[0];
    const a = b[k], c = b[k + 1];
    if (!c) {
      const p = b[k - 1];
      if (!p || p.i !== a.i || Math.hypot(a.x - p.x, a.y - p.y) > 60) return a;
      const ahead = Math.min(t - a.ts, 80) / (a.ts - p.ts || 1);
      return { ...a, x: a.x + (a.x - p.x) * ahead, y: a.y + (a.y - p.y) * ahead };
    }
    const f = (t - a.ts) / (c.ts - a.ts || 1);
    if (a.i !== c.i || Math.hypot(c.x - a.x, c.y - a.y) > 120) return f < 0.5 ? a : c;
    return { ...(f < 0.5 ? a : c), x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f, fz: a.fz + (c.fz - a.fz) * f, ah: a.ah + (c.ah - a.ah) * f };
  }

  // HP, meters, statuses and the like straight from the server (positions are smoothed per frame).
  applyState(team, s, own) {
    const g = this.game, pr = own ? this.pred : null, now = performance.now();
    s.hp?.forEach((hp, k) => {
      const m = team.members[k];
      if (m && !m.fainted) m.hp = Math.max(0, Math.min(m.maxHp, hp));
    });
    if (s.mu) team.megaUsed = true;
    const mon = team.members[s.i];
    if (mon !== team.active || mon.hidden || mon.fainted) return;
    if (mon.ult < 100 && s.u >= 100) g.onUltReady(mon);
    mon.ult = s.u;
    mon.status = s.st ?? {};
    mon.elementAura = s.ea ?? null;
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
    // While one of our own moves is still on its way to the server, our cooldowns run here (the same
    // rules as the server's); the server's numbers would briefly say the move is ready again.
    if (!pr?.moves.length) {
      for (const id of Object.keys(mon.cooldowns)) mon.cooldowns[id] = s.cd?.[id] ?? 0;
      Object.assign(mon.cooldowns, s.cd);
    }
    if (s.sg && mon.stagger <= 0 && !mon.action) mon.sprite.play('Hurt', { loop: false, force: true });
    mon.stagger = s.sg ? 0.12 : 0;
    const id = s.ch ? s.ch[0] : null, mv = id && MOVES[id];
    if (pr) {
      // Our own charge started or released here first: keep showing that until the server agrees.
      if (pr.charge && (id === pr.charge.id || now - pr.charge.at > PRED_MS)) pr.charge = null;
      if (pr.released && (id !== pr.released.id || now - pr.released.at > PRED_MS)) pr.released = null;
      if (pr.charge || pr.released) return;
    }
    if (mv) {
      if (mon.charging?.id !== mv.id) {
        mon.charging = { id: mv.id, move: mv, t: s.ch[1], color: TYPE_COLORS[mv.type][0] };
        mon.sprite.play('Charge', { loop: true, force: true });
      } else mon.charging.t = own ? Math.max(mon.charging.t, s.ch[1]) : s.ch[1];
    } else mon.charging = null;
  }

  // Our own Pokémon walks straight away from the stick (so movement feels immediate) and is eased
  // toward the server's position only by how far the two really drifted apart (see measureDrift).
  beforePlayer() { return this.puppetBefore(this.game.playerTeam, this.snap.player, true); }
  afterPlayer(dt, pre) { this.puppetAfter(dt, pre, this.snap.player, true); }
  // The opponent follows the server's positions, shown a moment in the past and interpolated.
  beforePuppet() {
    this.foeSample = this.sampleFoe(performance.now());
    return this.puppetBefore(this.game.opponentTeam, this.foeSample ?? this.snap.opponent, false);
  }
  afterPuppet(dt, pre) { this.puppetAfter(dt, pre, this.foeSample ?? this.snap.opponent, false); }

  puppetBefore(team, s, own) {
    const g = this.game, mon = team.active;
    const live = s && g.state === 'fighting' && team.members[s.i] === mon && !mon.hidden && !mon.fainted && mon.recallT <= 0;
    if (!own) {
      mon.input.x = live && s.mv ? this.fv(s.lx) : 0;
      mon.input.y = live && s.mv ? this.fv(s.ly) : 0;
    }
    return live ? { mon, x: mon.x, y: mon.y } : null;
  }

  puppetAfter(dt, pre, s, own) {
    const mon = pre.mon;
    if (mon.hidden || mon.fainted) return;
    const tx = this.fx(s.x), ty = this.fy(s.y);
    if (own) {
      if (this.histMon !== mon) {
        this.histMon = mon;
        this.hist = [];
        this.corr = null;
      }
      const c = this.corr;
      if (c?.snap) {
        mon.x = c.x;
        mon.y = c.y;
        this.hist = [];
        this.corr = null;
      } else if (c && Math.hypot(c.x, c.y) > 3) {
        const f = 1 - Math.exp(-dt * 10), dx = c.x * f, dy = c.y * f;
        mon.x += dx;
        mon.y += dy;
        c.x -= dx;
        c.y -= dy;
        for (const h of this.hist) {
          h.x += dx;
          h.y += dy;
        }
      }
      const now = performance.now();
      this.hist.push({ t: now, x: mon.x, y: mon.y });
      while (this.hist.length > 2 && this.hist[0].t < now - 1500) this.hist.shift();
      if (!s.mv && !mon.input.x && !mon.input.y && !mon.action) mon.dir = this.fd(s.d);
    } else {
      // Interpolated positions are already smooth: follow them closely. Without the server's clock
      // (an older server), glide toward the latest update instead.
      const k = 1 - Math.exp(-dt * (this.foeSample ? 30 : 14));
      if (Math.hypot(tx - pre.x, ty - pre.y) > 120) {
        mon.x = tx;
        mon.y = ty;
      } else {
        mon.x = pre.x + (tx - pre.x) * k;
        mon.y = pre.y + (ty - pre.y) * k;
      }
      mon.dir = this.fd(s.d);
    }
    mon.vx = mon.vy = 0;
    const k = 1 - Math.exp(-dt * 14);
    mon.z += (s.fz - mon.z) * k;
    if (s.ah > 0) {
      mon.air ??= { h: s.ah, vz: 0, t: 1, juggle: 0, g: 950 };
      mon.air.h += (s.ah - mon.air.h) * k;
      mon.air.vz = 0;
    } else mon.air = null;
  }

  // ── Result: always the server's ──
  onEnd(m) {
    if(m.summary) saveSummary({...m.summary,id:m.id,result:m.result,verified:true});
    this.result = m;
    this.record = m.record;
    if (this.state !== 'battle') {
      if (this.awaitingResult) this.flow.ui.showResult(m.result === 'win', null);
      return;
    }
    this.state = 'result';
    if (m.reason === 'ko') {
      // The knockout is already in the event stream: the finishing sequence plays, then the result.
      clearTimeout(this.koTimer);
      this.koTimer = setTimeout(() => {
        const g = this.game;
        if (g.online === this && g.state !== 'over' && !g.finale) this.stopBattle();
      }, 8000);
      return;
    }
    this.stopBattle();
  }

  stopBattle() {
    const g = this.game;
    this.flow.togglePause(false);
    if (['fighting', 'intro', 'finale'].includes(g.state)) {
      g.state = 'over';
      Object.assign(g, { cinematic: null, showcase: null, finale: null });
      g.toggleSwitchMenu(false);
    }
    g.ui.showResult(this.result?.result === 'win', null);
  }

  resultHtml(winner) {
    const r = this.result, foe = esc(this.match?.foe ? safeName(this.match.foe.name) : 'Your opponent');
    if (!r) {
      this.awaitingResult = true;
      return '<b>Battle over</b>Confirming the result with the match server…';
    }
    this.awaitingResult = false;
    const title = r.result === 'win' ? '<b class="win">Victory!</b>' : r.result === 'loss' ? '<b class="lose">Defeat…</b>' : '<b>Draw</b>';
    const who = winner ? `<img class="win-mon" src="${winner.portrait.src}" alt="">${esc(winner.species.name)} wins the battle for ${esc(winner.trainer.name)}!<br>` : '';
    const why = {
      ko: { win: `${foe} is out of usable Pokémon.`, loss: 'All of your Pokémon fainted.' },
      disconnect: { win: `${foe} disconnected — you win by forfeit.`, loss: 'You disconnected, so the match was forfeited.' },
      forfeit: { win: `${foe} left the battle — you win by forfeit.`, loss: 'You left the battle.' },
      afk: { win: `${foe} stopped playing — you win.`, loss: 'You were inactive for too long.', draw: 'Both players were inactive.' },
      time: { win: "Time's up! You had more HP left.", loss: "Time's up! Your opponent had more HP left.", draw: "Time's up! It's dead even." },
      error: { draw: 'The match server had a problem, so this match has no result.' },
      lost: { loss: 'Lost connection to the match server — the match counts as a forfeit.' },
    }[r.reason]?.[r.result] ?? '';
    const delta = r.delta ? ` (${r.delta > 0 ? '+' : ''}${r.delta})` : '';
    const rating = r.record?.rating != null ? `<br><small class="mm-rating">Rating <b>${r.record.rating}</b>${delta}${r.rank ? ` · Rank #${r.rank}` : ''}</small>` : '';
    const rec = r.record ? `${rating}<br><small class="mm-rec">Online record: ${r.record.w}W · ${r.record.l}L${r.record.d ? ` · ${r.record.d}D` : ''}</small>` : '';
    if (r.raid && r.party) return this.raidResultHtml(r);
    const stats = r.summary ? Object.entries(r.summary.species).map(([id,s])=>`${esc(SPECIES[id]?.name??id)}: ${Math.round(s.damage)} damage · ${s.kos} KOs · ${s.reactions} reactions`).join('<br>') : '';
    return `${title}${who}${esc(why)}${r.raid || this.match?.draftMode ? '<br><small>Unranked · no rating change</small>' : rec}<br><small>${stats}</small>`;
  }

  // Co-op raid result: who did what, from the server's records.
  raidResultHtml(r) {
    const boss = BOSSES[r.raid], total = r.party.reduce((n, p) => n + p.damage, 0) || 1;
    const title = r.result === 'win' ? `<b class="win">${esc(boss?.name ?? 'Boss')} defeated!</b>` : `<b class="lose">The raid failed…</b>`;
    const why = { ko: '', 'team-eliminated': 'Every Pokémon on your side fainted.', time: 'Time ran out.', cancelled: 'The raid was cancelled.', 'load-timeout': 'Your partner did not load in time.' }[r.reason] ?? '';
    const rows = r.party.map((p, i) => `<tr class="${i === r.you ? 'me' : ''}"><td>${esc(p.name)}${i === r.you ? ' <b>(you)</b>' : ''}</td><td>${p.damage.toLocaleString()}</td><td>${Math.round((p.damage / total) * 100)}%</td><td>${p.reactions}</td><td>${p.survived ? 'Standing' : 'Fainted'}</td></tr>`).join('');
    return `${title}${esc(why)}<br><small>${RAID_DIFFICULTY[r.difficulty]?.label ?? ''} · reached stage ${r.stage}/4 · ${Math.floor(r.time / 60)}:${String(r.time % 60).padStart(2, '0')}</small>
      <table class="lb-table raid-party"><thead><tr><th>Trainer</th><th>Boss damage</th><th>Share</th><th>Reactions</th><th>End</th></tr></thead><tbody>${rows}</tbody></table><small>Unranked · no rating change</small>`;
  }

  // ── Search overlay (over the team-select screen) ──
  buildOverlay() {
    const el = document.createElement('div');
    el.id = 'mm-overlay';
    el.className = 'mm-overlay hidden';
    el.innerHTML = '<div class="mm-card"><div class="mm-team"></div><h2 class="mm-title"></h2><p class="mm-text"></p><div class="mm-time"></div><p class="mm-live"></p><div class="mm-btns"></div></div>';
    document.body.appendChild(el);
    this.el = el;
  }

  hideOverlay() {
    this.el.classList.add('hidden');
    clearInterval(this.clock);
  }

  fail(message, canRetry) {
    this.errorText = message;
    this.canRetry = canRetry;
    this.match = null;
    this.drop();
    this.setState('error');
  }

  setState(state) {
    this.state = state;
    this.flow.ui.queueChanged?.();
    if (state === 'idle' || state === 'battle' || state === 'result') {
      this.hideOverlay();
      return;
    }
    const el = this.el, m = this.match, team = m ? m.me.team : this.spec?.team ?? [];
    const foe = m ? esc(safeName(m.foe.name)) : '';
    const views = {
      connecting: ['CONNECTING', this.waking ? 'Waking up the match server — after a quiet spell this can take up to a minute<span class="ol-dots"></span>' : 'Reaching the match server<span class="ol-dots"></span>', [['cancel', 'CANCEL']]],
      searching: ['SEARCHING', `${this.note ? `${esc(this.note)}<br>` : ''}Looking for an opponent for a ${this.spec?.format ?? 3} VS ${this.spec?.format ?? 3} battle<span class="ol-dots"></span>`, [['cancel', 'CANCEL']]],
      matched: ['OPPONENT FOUND!', `You will battle <b>${foe}</b>.<br>Loading the battle<span class="ol-dots"></span>`, []],
      loading: ['OPPONENT FOUND!', `Waiting for <b>${foe}</b> to finish loading<span class="ol-dots"></span>`, []],
      error: ['ONLINE BATTLE', esc(this.errorText ?? 'Something went wrong.'), [...(this.canRetry ? [['retry', 'TRY AGAIN']] : []), ['back', 'BACK TO TEAM']]],
    };
    const [title, text, btns] = views[state];
    el.className = `mm-overlay mm-${state}`;
    el.querySelector('.mm-title').textContent = title;
    el.querySelector('.mm-text').innerHTML = text;
    const foeTeam = m ? `<span class="mm-vs">VS</span>${m.foe.team.map(id => `<img src="${portrait(id)}" alt="">`).join('')}` : '';
    el.querySelector('.mm-team').innerHTML = team.map((id, i) => `<img src="${portrait(id)}" alt="" style="--i:${i}">`).join('') + foeTeam;
    const box = el.querySelector('.mm-btns');
    box.innerHTML = btns.map(([a, label], i) => `<button class="px-btn${i === 0 && a !== 'cancel' ? ' primary' : ''}" data-a="${a}">${label}</button>`).join('');
    box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'cancel') this.cancel();
      else if (a === 'retry') this.retry();
      else if (a === 'back') this.setState('idle');
    }));
    clearInterval(this.clock);
    const time = el.querySelector('.mm-time');
    time.textContent = '';
    el.querySelector('.mm-live').textContent = '';
    if (state === 'searching') {
      this.renderLive();
      this.pollLobby(true);
      const tickClock = () => {
        const s = Math.floor((Date.now() - (this.queuedAt ?? Date.now())) / 1000);
        time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      };
      tickClock();
      this.clock = setInterval(tickClock, 250);
    }
  }
}
