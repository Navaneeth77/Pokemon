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
const PROTOCOL = 1;
const PID_KEY = 'msb.pid';
const CONNECT_TIMEOUT_MS = 8000;
const SILENCE_MS = 10000;
const INPUT_EVERY = 1 / 30;
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
    this.buildOverlay();
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && ['connecting', 'searching'].includes(this.state)) {
        e.preventDefault();
        this.cancel();
      }
    });
    setInterval(() => this.heartbeat(), 2000);
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
    if (this.state === 'connecting') return; // find() reports a connection that never opened
    if (this.busy) this.fail('Lost connection to the match server.', true);
    else if (this.state === 'battle') {
      this.state = 'result';
      this.result = { result: 'loss', reason: 'lost', record: this.record };
      this.stopBattle();
    }
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
    this.setState('connecting');
    try {
      await this.connect();
    } catch (err) {
      if (this.state !== 'connecting') return;
      if (err.code === 'duplicate' || err.code === 'version') this.fail(err.message, err.code === 'duplicate');
      else this.fail("Couldn't reach the match server. Check your connection and try again.", true);
      return;
    }
    if (this.state !== 'connecting') return;
    this.send({ t: 'queue', ...this.spec });
  }

  cancel() {
    if (this.state === 'searching' || this.state === 'connecting') {
      this.send({ t: 'cancel' });
      this.setState('idle');
      sfx.denied?.();
    }
  }

  retry() {
    if (this.spec) this.find(this.spec);
  }

  // "Find New Match" after a result: back to team select and straight into the queue with the same team.
  again() {
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
    if (this.state === 'searching' || this.state === 'connecting') this.send({ t: 'cancel' });
    if (this.match && (this.state === 'battle' || this.state === 'matched' || this.state === 'loading')) this.send({ t: 'leave', id: this.match.id });
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
    switch (m.t) {
      case 'pong':
        this.ping = Math.round(performance.now() - m.ts);
        if (this.state === 'battle') $('#panel .loc').textContent = `ONLINE MATCH · ${this.ping} MS`;
        return;
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
      await this.game.ensureSprites([...m.me.team, ...m.foe.team]);
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
  }

  begin() {
    this.inT = 0;
    this.lastIn = null;
    this.inAge = 0;
  }

  // A button press: the server applies it with the normal rules, and the result comes back as events.
  intent(kind, i) {
    if (this.state !== 'battle' || !this.match) return;
    this.send({ t: 'act', id: this.match.id, k: kind, i });
  }

  // Every frame: the held direction goes to the server when it changes (and now and then regardless).
  tick(dt) {
    if (this.state !== 'battle' || !this.match) return;
    if ((this.inT -= dt) > 0) return;
    this.inT = INPUT_EVERY;
    this.inAge += INPUT_EVERY;
    const g = this.game, v = g.state === 'fighting' && !this.flow.pauseOpen ? g.input.vector() : { x: 0, y: 0 };
    const x = Math.round(v.x * 100) / 100, y = Math.round(v.y * 100) / 100;
    if (this.lastIn && this.lastIn.x === x && this.lastIn.y === y && this.inAge < 0.5) return;
    this.lastIn = { x, y };
    this.inAge = 0;
    this.send({ t: 'in', id: this.match.id, x, y });
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
        g.useMove(mon, e.id, e.l ?? 0, true, e.cp);
        const k = mon.species.moves.indexOf(e.id);
        if (loc === 'player' && k >= 0) g.ui.pressed(k, true);
      } else if (e.t === 'dodge') {
        if (!mon.hidden && !mon.fainted) g.dodge(mon, this.fv(e.x) || 0.01, this.fv(e.y), true);
      } else if (e.t === 'mega') {
        if (e.c) mon.megaChoice = e.c;
        g.megaEvolve(mon, true);
      } else if (e.t === 'switch') g.remoteSwitch(e.i, loc);
      else if (e.t === 'faint') {
        const m = team.members[e.i] ?? mon;
        m.hp = 0;
        g.onFaint(m, foe, MOVES[e.mv], e);
      } else if (e.t === 'cancel') mon.cancelAction();
    }
  }

  onSnapshot(m) {
    const g = this.game, mine = this.flip ? m.B : m.A, theirs = this.flip ? m.A : m.B;
    if (!mine || !theirs) return;
    this.snap = { player: mine, opponent: theirs };
    if (g.state !== 'fighting') return;
    this.applyState(g.playerTeam, mine);
    this.applyState(g.opponentTeam, theirs);
    if (typeof mine.sw === 'number') g.switchCD = mine.sw;
  }

  // HP, meters, statuses and the like straight from the server (positions are smoothed per frame).
  applyState(team, s) {
    const g = this.game;
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
    for (const id of Object.keys(mon.cooldowns)) mon.cooldowns[id] = s.cd?.[id] ?? 0;
    Object.assign(mon.cooldowns, s.cd);
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

  // Our own Pokémon walks straight away from the stick (so movement feels immediate) and is nudged
  // toward the server's position whenever the two drift apart.
  beforePlayer() { return this.puppetBefore(this.game.playerTeam, this.snap.player, true); }
  afterPlayer(dt, pre) { this.puppetAfter(dt, pre, this.snap.player, true); }
  // The opponent glides to wherever the server says it is.
  beforePuppet() { return this.puppetBefore(this.game.opponentTeam, this.snap.opponent, false); }
  afterPuppet(dt, pre) { this.puppetAfter(dt, pre, this.snap.opponent, false); }

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
      const ex = tx - mon.x, ey = ty - mon.y, err = Math.hypot(ex, ey);
      if (err > 120) {
        mon.x = tx;
        mon.y = ty;
      } else if (err > 6) {
        const f = ((err - 6) / err) * (1 - Math.exp(-dt * 6));
        mon.x += ex * f;
        mon.y += ey * f;
      }
      if (!s.mv && !mon.input.x && !mon.input.y && !mon.action) mon.dir = this.fd(s.d);
    } else {
      const k = 1 - Math.exp(-dt * 14);
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
    const rec = r.record ? `<br><small class="mm-rec">Online record: ${r.record.w}W · ${r.record.l}L${r.record.d ? ` · ${r.record.d}D` : ''}</small>` : '';
    return `${title}${who}${esc(why)}${rec}`;
  }

  // ── Search overlay (over the team-select screen) ──
  buildOverlay() {
    const el = document.createElement('div');
    el.id = 'mm-overlay';
    el.className = 'mm-overlay hidden';
    el.innerHTML = '<div class="mm-card"><div class="mm-team"></div><h2 class="mm-title"></h2><p class="mm-text"></p><div class="mm-time"></div><div class="mm-btns"></div></div>';
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
      connecting: ['CONNECTING', 'Reaching the match server<span class="ol-dots"></span>', [['cancel', 'CANCEL']]],
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
    if (state === 'searching') {
      const tickClock = () => {
        const s = Math.floor((Date.now() - (this.queuedAt ?? Date.now())) / 1000);
        time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      };
      tickClock();
      this.clock = setInterval(tickClock, 250);
    }
  }
}
