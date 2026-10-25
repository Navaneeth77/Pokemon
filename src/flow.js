import { EconomyClient } from './economy-client.js';
import { EconomyUI } from './economy-ui.js';
import { ExpansionUI } from './expansion-ui.js';
import { currentTitle, cosmeticLoadout } from './mastery.js';
import { Opening, GAME_TITLE } from './opening.js';
import { AnimatedSprite } from './sprite.js';
import { LOOKS, drawBust, backPalette, lookById } from './trainers.js';
import { Tutorial } from './tutorial.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { music } from './music.js';
import { initAudio, sfx, isMuted, setMuted } from './audio.js';
import { DEFAULT_TEAM, ROSTER, SPECIES, CLASS_LABEL } from './data/species.js';
import { ABILITIES } from './data/abilities.js';
import { MOVES } from './moves.js';
import { TYPE_COLORS } from './data/types.js';
import { ARENAS, paintArena, arenaById } from './arena.js';
import { Online, cleanCode, CODE_LEN } from './online.js';
import { nameAllowed } from './names.js';
import { Matchmaker } from './matchmaking.js';
import { LEADERS, leaderById, leaderBust } from './leaders.js';

// Screen flow before (and around) the battle:
// opening → PRESS START → [title menu for returning players] → trainer setup → tutorial → format → team select → battle.
// Trainer, tutorial progress and format are remembered in localStorage.
const SAVE_KEY = 'msb.save';
const NAME_MAX = 10;
const $ = sel => document.querySelector(sel);

export class Flow {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    try { this.save = JSON.parse(localStorage.getItem(SAVE_KEY)) ?? {}; } catch { this.save = {}; }
    // A saved name that isn't allowed (any more) has to be chosen again.
    if (this.save.name && !nameAllowed(this.save.name)) {
      delete this.save.name;
      this.persist();
    }
    this.screen = null;
    this.opening = new Opening($('#intro-canvas'), game.sprites, () => this.pressStart());
    this.tutorial = new Tutorial(game, skipped => this.endTutorial(skipped));
    this.online = new Online(game, this);
    this.mm = new Matchmaker(game, this);
    this.expansion = new ExpansionUI(this);
    this.economy=new EconomyClient(this);
    this.economyUI=new EconomyUI(this);
    if(this.economy.scope==='server')this.economy.sync();
    // Invite links (?room=CODE) jump straight into that room after the title screen.
    this.pendingRoom = cleanCode(new URLSearchParams(location.search).get('room')) || null;
    if (this.pendingRoom) history.replaceState(null, '', location.pathname);
    game.flow = this;
    if (isTouchDevice()) {
      document.body.classList.add('touch');
      this.touch = new TouchControls(game, () => this.togglePause(true));
      ui.touch = this.touch;
    }
    window.addEventListener('keydown', e => this.onKey(e));
    $('#intro').addEventListener('click', e => {
      if (this.screen === 'opening' && !e.target.closest('button')) this.advanceOpening();
    });
    for (const b of document.querySelectorAll('[data-fs]')) b.addEventListener('click', () => this.toggleFullscreen());
    for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', () => {
      initAudio();
      music.setEnabled(!music.enabled);
    });
    for (const r of document.querySelectorAll('[data-volume]')) {
      r.value = Math.round(music.volume * 100);
      r.addEventListener('input', () => {
        initAudio();
        music.setVolume(r.value / 100);
      });
    }
    music.listeners.add(() => this.syncAudioUi());
    document.addEventListener('fullscreenchange', () => {
      this.syncFullscreen();
      game.resize();
    });
    this.bindPause();
    $('#pause-btn')?.addEventListener('click', e => {
      e.currentTarget.blur();
      this.togglePause(true);
    });
    this.syncAudioUi();
    this.syncFullscreen();
    document.title = GAME_TITLE.full;
    if (this.save.name) this.applyTrainer(this.save.name, lookById(this.save.look));
  }

  persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* storage unavailable */ }
  }

  show(id) {
    for (const s of ['#trainer-screen', '#format-screen', '#arena-screen', '#online-screen', '#story-screen', '#teams-screen', '#title-menu']) $(s).classList.toggle('hidden', s !== id);
    this.screen = { '#trainer-screen': 'trainer', '#format-screen': 'format', '#arena-screen': 'arena', '#online-screen': 'online', '#story-screen': 'story', '#teams-screen': 'teams', '#title-menu': 'title' }[id] ?? this.screen;
  }

  // ── Opening ──
  begin() {
    this.game.toMenu();
    $('#intro').classList.remove('hidden');
    this.show(null);
    this.screen = 'opening';
    this.opening.start();
  }

  advanceOpening() {
    initAudio();
    if (!this.opening.ready) {
      this.opening.skip();
      music.play('title');
    } else this.pressStart();
  }

  pressStart() {
    initAudio();
    sfx.startup();
    music.play('title');
    if (this.save.name && this.pendingRoom) this.joinRoom(this.pendingRoom);
    else if (this.save.name) this.showTitleMenu();
    else this.showTrainer();
  }

  // ── Title menu (returning players) ──
  showTitleMenu() {
    this.ui.raidSetup = null; document.body.classList.remove('raid-setup');
    $('#intro').classList.remove('hidden');
    if (!this.opening.running) {
      this.opening.start();
      this.opening.skip();
    }
    // The two main modes first: battles against the bot, and online matchmaking against other players.
    const items = [
      ['BOT BATTLES', () => this.showFormat(), 'Easy · Medium · Hard'],
      ['ONLINE BATTLES', () => this.enterQueueSelect(), this.onlineSub()],
      ['FRIEND ROOM', () => this.showOnline('home', '', 'title')],
      ['LEGENDARY RAIDS', () => this.expansion.raids(), 'Rayquaza · Mewtwo · Lugia'],
      ['DRAFT BATTLES', () => this.expansion.drafts(), 'Snake · Blind trade · Online'],
      ['DAILY MISSIONS',()=>this.economyUI.open('missions'),'Earn Chaos Coins · Resets at 00:00 UTC'],
      ['CHAOS SHOP',()=>this.economyUI.open('shop'),'Cosmetics · Your signature'],
      ['COLLECTION',()=>this.economyUI.open('collection')],
      ['POKÉMON MASTERY', () => this.expansion.mastery(), 'Records · Levels · Match history'],
      ['ELEMENTAL GUIDE', () => this.expansion.guide()],
      ['MY TEAMS', () => this.showTeams(), 'Build & save your teams'],
      ['SETTINGS', () => this.expansion.settings(), 'Trainer · Effects · Audio · Display'],
      ['TUTORIAL', () => this.startTutorial()],
    ];
    const menu = $('#title-menu');
    const title = this.economy?.loadout().title?.name??currentTitle();
    menu.innerHTML = `<div class="tm-top"><div class="tm-brand"><b>POKÉMON</b><span>CHAOS ARENA · MAIN MENU</span></div><div class="tm-who"><canvas width="24" height="24"></canvas><span>${escapeHtml(this.save.name)}${title ? `<small class="tm-title">${escapeHtml(title)}</small>` : ''}</span></div></div><div class="tm-grid">`
      + items.map(([label, , sub], i) => `${({0:'BATTLE',3:'EXPANSION',5:'TRAINER GUILD',8:'TRAINER & TOOLS'})[i] ? `<h3 class="tm-group">${({0:'BATTLE',3:'EXPANSION',5:'TRAINER GUILD',8:'TRAINER & TOOLS'})[i]}</h3>` : ''}<button class="tm-item${sub ? ' tm-main' : ''}" data-i="${i}">${label}${sub ? `<small>${sub}</small>` : ''}</button>`).join('') + '</div>';
    const frame = this.economy?.loadout().frame??cosmeticLoadout().frame;
    if (frame) menu.querySelector('canvas').style.border = `2px solid ${frame.color}`;
    menu.querySelector('canvas').getContext('2d').drawImage(drawBust(lookById(this.save.look)), 0, 0);
    this.economyUI.mountCounter();
    this.menuItems = items;
    this.menuIndex = 0;
    menu.querySelectorAll('.tm-item').forEach(b => b.addEventListener('click', () => {
      sfx.sendOut();
      items[+b.dataset.i][1]();
    }));
    this.mm?.pollLobby(true);
    this.show('#title-menu');
    this.highlightMenu();
  }

  onlineSub() {
    const n = this.mm?.lobby?.online;
    return n == null ? 'Find a random opponent' : `Find a random opponent · ● ${n} playing online`;
  }

  // New numbers from the match server: the main menu's Online Battles line shows who's online.
  lobbyChanged() {
    if (this.screen !== 'title') return;
    const sub = document.querySelector('#title-menu .tm-item[data-i="1"] small');
    if (sub) sub.textContent = this.onlineSub();
  }

  // The menu is a grid of cards: the card whose centre is nearest in the pressed direction (wrapping
  // from the last row to the first, and back).
  menuNeighbour([dx, dy]) {
    const cards = [...document.querySelectorAll('#title-menu .tm-item')], at = cards[this.menuIndex]?.getBoundingClientRect();
    if (!at) return null;
    const cx = at.left + at.width / 2, cy = at.top + at.height / 2;
    let best = null, bestScore = Infinity, far = null, farScore = -Infinity;
    cards.forEach((c, i) => {
      if (i === this.menuIndex) return;
      const r = c.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
      const along = x * dx + y * dy, across = Math.abs(x * dy) + Math.abs(y * dx);
      if (along > 4) {
        const score = along + across * 3;
        if (score < bestScore) [best, bestScore] = [i, score];
      } else {
        // Nothing further that way: wrap to the farthest card on the opposite side.
        const s = -along - across * 3;
        if (s > farScore) [far, farScore] = [i, s];
      }
    });
    return best ?? far;
  }

  highlightMenu() {
    $('#title-menu').querySelectorAll('.tm-item').forEach((b, i) => b.classList.toggle('on', i === this.menuIndex));
    $('#title-menu .tm-item.on')?.scrollIntoView({block:'nearest'});
  }

  // ── Trainer setup ──
  showTrainer(from = null) {
    this.trainerFrom=from;
    music.play('menu');
    const win = $('#trainer-screen .px-window');
    this.pick = Math.max(0, LOOKS.findIndex(l => l.id === this.save.look));
    win.innerHTML = `
      <h2>${from==='settings'?'EDIT TRAINER':'TRAINER SETUP'}</h2>
      <div class="ts-body">
        <div class="ts-preview"><canvas width="24" height="24"></canvas><div class="ts-name"></div></div>
        <div class="ts-side">
          <label class="ts-label" for="trainer-name">YOUR NAME</label>
          <input id="trainer-name" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" placeholder="RED" />
          <div class="ts-label">CHOOSE YOUR LOOK</div>
          <div class="ts-grid">${LOOKS.map((l, i) => `<button class="ts-pick" data-i="${i}" aria-label="Trainer ${i + 1}"><canvas width="24" height="24"></canvas></button>`).join('')}</div>
        </div>
      </div>
      <div class="ts-msg"></div>
      <button class="px-btn primary ts-confirm">${from==='settings'?'SAVE TRAINER':'CONFIRM TRAINER ▶'}</button>${from==='settings'?'<button class="px-btn ts-back">◀ SETTINGS</button>':''}`;
    win.querySelectorAll('.ts-pick').forEach((b, i) => {
      b.querySelector('canvas').getContext('2d').drawImage(drawBust(LOOKS[i]), 0, 0);
      b.addEventListener('click', () => {
        this.pick = i;
        this.renderTrainer();
      });
    });
    const input = win.querySelector('#trainer-name');
    input.value = this.save.name ?? '';
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, NAME_MAX);
      this.renderTrainer();
    });
    input.addEventListener('focus', () => setTimeout(() => win.querySelector('.ts-confirm').scrollIntoView({ block: 'nearest' }), 300));
    win.querySelector('.ts-confirm').addEventListener('click', () => this.confirmTrainer());
    win.querySelector('.ts-back')?.addEventListener('click',()=>this.backToSettings());
    this.show('#trainer-screen');
    this.renderTrainer();
    if (!isTouchDevice()) input.focus();
  }

  backToSettings() {
    this.trainerFrom=null;this.showTitleMenu();this.expansion.settings();
  }

  renderTrainer() {
    const win = $('#trainer-screen .px-window'), look = LOOKS[this.pick];
    win.querySelectorAll('.ts-pick').forEach((b, i) => b.classList.toggle('on', i === this.pick));
    const ctx = win.querySelector('.ts-preview canvas').getContext('2d');
    ctx.clearRect(0, 0, 24, 24);
    ctx.drawImage(drawBust(look), 0, 0);
    const name = win.querySelector('#trainer-name').value.trim();
    win.querySelector('.ts-name').textContent = name || '???';
  }

  confirmTrainer() {
    const win = $('#trainer-screen .px-window'), name = win.querySelector('#trainer-name').value.trim();
    if (!name || !nameAllowed(name)) {
      win.querySelector('.ts-msg').textContent = name ? "That name isn't allowed — please choose a different one." : 'Please enter a name (up to 10 characters).';
      sfx.denied();
      win.querySelector('#trainer-name').focus();
      return;
    }
    sfx.megaBurst();
    this.save.name = name.toUpperCase();
    this.save.look = LOOKS[this.pick].id;
    this.persist();
    this.applyTrainer(this.save.name, LOOKS[this.pick]);
    if(this.trainerFrom==='settings'){this.backToSettings();return;}
    if (this.pendingRoom) this.joinRoom(this.pendingRoom);
    else if (!this.save.tutorialDone) this.startTutorial();
    else this.showFormat();
  }

  // The chosen trainer replaces "Red": arena sprite colours, name in the HUD, panel and intro.
  applyTrainer(name, look) {
    const g = this.game;
    g.red.name = name;
    g.red.setPalette(backPalette(look));
    g.playerBust = drawBust(look);
    this.ui.setTrainer(name, g.playerBust);
  }

  // ── Tutorial (practice battle) ──
  async startTutorial() {
    this.show(null);
    this.screen = 'tutorial';
    this.opening.stop();
    $('#intro').classList.add('hidden');
    await this.game.ensureSprites([...DEFAULT_TEAM, 'snorlax']);
    this.game.startPractice([...DEFAULT_TEAM]);
    music.play('battle');
    this.tutorial.begin(this.save.name ?? 'TRAINER', lookById(this.save.look));
  }

  endTutorial() {
    this.save.tutorialDone = true;
    this.persist();
    this.game.endPractice();
    this.showFormat();
  }

  // ── Battle format ──
  // Separate battle-setup page (Pokédex style): pick 3v3 or 6v6, and browse every available Pokémon.
  showFormat() {
    music.play('menu');
    this.game.toMenu();
    this.opening.stop();
    $('#intro').classList.add('hidden');
    this.format = this.save.format === 6 ? 6 : 3;
    // Opponent: a random team, or one of the Kanto Gym Leaders / Elite Four / the Champion.
    this.opponent = leaderById(this.save.opponent) ? this.save.opponent : 'random';
    const page = $('#format-screen');
    const leaderCard = st => `<button class="op-card" data-op="${st.id}"><img src="${leaderBust(st)}" alt="">`
      + `<span><b>${st.name}</b><small>${st.kind === 'gym' ? st.where.replace(' City', '').replace(' Island', '') : st.where}</small>`
      + `<i class="op-type" style="background:${TYPE_COLORS[st.type][1]}">${st.type}</i></span></button>`;
    const opt = (n, desc) => `<button class="fm-opt" data-n="${n}"><b>${n} VS ${n}</b><span class="fm-balls">${'<i></i>'.repeat(n)}</span><small>${desc}</small></button>`;
    const chips = ['all', 'regular', 'legendary', 'mythical', 'mega'].map(f => `<button data-f="${f}" class="${f === 'all' ? 'on' : ''}">${f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}</button>`).join('');
    page.innerHTML = `
      <header class="pg-head">
        <span class="dex-lens"></span><span class="dex-leds"><i></i><i></i><i></i></span>
        <h1>BATTLE SETUP</h1>
        <div class="pg-who"><canvas width="24" height="24"></canvas><span>${escapeHtml(this.save.name ?? 'TRAINER')}</span></div>
      </header>
      <div class="pg-bar">
        <button class="dex-btn" data-a="back">◀ MENU</button>
        <span></span>
        <button class="dex-btn" data-pg="fs">FULLSCREEN</button><button class="dex-btn" data-pg="music">♪</button>
      </div>
      <section class="dex-panel pg-format">
        <h2>1 · CHOOSE YOUR OPPONENT</h2>
        <div class="op-grid">
          <button class="op-card random" data-op="random"><span class="op-q">?</span><span><b>Random Team</b><small>A new random team every battle</small></span></button>
        </div>
        <div class="op-group">GYM LEADERS</div>
        <div class="op-grid">${LEADERS.filter(st => st.kind === 'gym').map(leaderCard).join('')}</div>
        <div class="op-group">ELITE FOUR &amp; CHAMPION</div>
        <div class="op-grid">${LEADERS.filter(st => st.kind !== 'gym').map(leaderCard).join('')}</div>
        <h2 class="pg-h2">2 · CHOOSE BATTLE FORMAT</h2>
        <div class="fm-opts">${opt(3, 'Pick 3 Pokémon. A classic three-on-three showdown.')}${opt(6, 'Pick 6 Pokémon. A full-team marathon battle.')}</div>
        <button class="dex-go" data-a="go" disabled>PICK A FORMAT ABOVE</button>
        <div class="pg-online"><span>MORE WAYS TO PLAY</span><div class="pg-modes"><button class="dex-online" data-a="queue">ONLINE BATTLES ▶</button><button class="dex-online friend" data-a="online">FRIEND ROOM ▶</button></div><small>Get matched with a random opponent online, or battle a friend with a room code.</small></div>
      </section>
      <section class="dex-panel pg-dex">
        <h2>POKÉDEX · AVAILABLE POKÉMON <span class="dex-count"></span></h2>
        <div class="dex-tools"><input class="dex-search" type="search" placeholder="SEARCH POKÉMON NAME…" autocomplete="off" spellcheck="false" /><div class="dex-filters">${chips}</div></div>
        <div class="dex-screen"><div class="dex-grid">${ROSTER.map((id, i) => {
          const sp = SPECIES[id], [c1, c2] = TYPE_COLORS[sp.types[0]], [d1] = TYPE_COLORS[sp.types[1] ?? sp.types[0]];
          return `<button class="dex-card c-${sp.class}" data-id="${id}" style="--t1:${c1};--t2:${c2};--t3:${d1}">`
            + `<span class="no">#${String(i + 1).padStart(3, '0')}</span>${sp.mega?.length ? '<span class="mg">MEGA</span>' : ''}`
            + `<span class="ball"><img loading="lazy" src="/sprites/${sp.sprite}/portrait.png" alt=""></span><b>${sp.name}</b>`
            + `<span class="tp">${sp.types.map(t => `<i style="background:${TYPE_COLORS[t][1]}">${t}</i>`).join('')}</span></button>`;
        }).join('')}</div></div>
      </section>`;
    page.querySelector('.pg-who canvas').getContext('2d').drawImage(drawBust(lookById(this.save.look)), 0, 0);
    page.querySelectorAll('.fm-opt').forEach(b => b.addEventListener('click', () => {
      this.format = +b.dataset.n;
      sfx.sendOut();
      this.renderFormat();
    }));
    page.querySelectorAll('.op-card').forEach(b => b.addEventListener('click', () => {
      this.opponent = b.dataset.op;
      sfx.sendOut();
      this.renderFormat();
    }));
    page.querySelector('[data-a="go"]').addEventListener('click', () => this.confirmFormat());
    page.querySelector('[data-a="queue"]').addEventListener('click', () => {
      this.closeDexEntry();
      sfx.sendOut();
      this.enterQueueSelect();
    });
    page.querySelector('[data-a="online"]').addEventListener('click', () => {
      this.closeDexEntry();
      sfx.sendOut();
      this.showOnline('home', '', 'format');
    });
    page.querySelector('[data-a="back"]').addEventListener('click', () => this.showTitleMenu());
    page.querySelector('[data-pg="fs"]').addEventListener('click', () => this.toggleFullscreen());
    const mus = page.querySelector('[data-pg="music"]');
    mus.textContent = music.enabled ? '♪ ON' : '♪ OFF';
    mus.addEventListener('click', () => {
      initAudio();
      music.setEnabled(!music.enabled);
      mus.textContent = music.enabled ? '♪ ON' : '♪ OFF';
    });
    // Pokédex: category tabs and a name-only search; clicking a card opens its entry.
    this.dexFilter = 'all';
    const search = page.querySelector('.dex-search');
    const apply = () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      page.querySelectorAll('.dex-card').forEach(c => {
        const sp = SPECIES[c.dataset.id], f = this.dexFilter;
        const ok = !!((f === 'all' || (f === 'mega' ? sp.mega?.length : sp.class === f)) && (!q || sp.name.toLowerCase().includes(q)));
        c.hidden = !ok;
        shown += ok;
      });
      page.querySelector('.dex-count').textContent = `${shown} / ${ROSTER.length}`;
    };
    search.addEventListener('input', apply);
    page.querySelectorAll('.dex-filters button').forEach(b => b.addEventListener('click', () => {
      this.dexFilter = b.dataset.f;
      page.querySelectorAll('.dex-filters button').forEach(o => o.classList.toggle('on', o === b));
      apply();
    }));
    page.querySelectorAll('.dex-card').forEach(c => c.addEventListener('click', () => this.openDexEntry(c.dataset.id)));
    apply();
    this.show('#format-screen');
    page.scrollTop = 0;
    this.renderFormat();
  }

  // Pokédex entry: the Pokémon animated (a roar or pose), then its stats, ability, moves and ultimate.
  async openDexEntry(id) {
    this.closeDexEntry();
    const sp = SPECIES[id], ab = ABILITIES[sp.ability], [c1, c2] = TYPE_COLORS[sp.types[0]];
    const no = ROSTER.indexOf(id) + 1;
    const stat = (label, v, max) => `<div class="dm-stat"><span>${label}</span><i><b style="width:${Math.min(100, (v / max) * 100)}%"></b></i><em>${v}</em></div>`;
    const move = mid => {
      const m = MOVES[mid], [t1] = TYPE_COLORS[m.type];
      return `<li class="${m.ultimate ? 'ult' : ''}"><i style="background:${t1}">${m.type}</i><b>${m.name}${m.chargeable ? ' ⚡' : ''}</b>`
        + `<span>${m.ultimate ? 'ULTIMATE' : m.cat === 'status' ? 'STATUS' : `${m.cat === 'special' ? 'SPECIAL' : 'PHYSICAL'} · ${m.power}`}</span><small>${m.tag}</small></li>`;
    };
    const megas = (sp.mega ?? []).map(mid => {
      const f = SPECIES[mid], fa = ABILITIES[f.ability];
      return `<div class="dm-mega"><b>${f.name}</b> — <u>${fa.name}</u>: ${fa.desc}</div>`;
    }).join('');
    const wrap = document.createElement('div');
    wrap.className = 'dex-modal';
    wrap.innerHTML = `<div class="dm-card" style="--t1:${c1};--t2:${c2}">
      <button class="dm-close" aria-label="Close">✕</button>
      <div class="dm-stage"><canvas width="200" height="130"></canvas><span class="dm-loading">LOADING…</span></div>
      <div class="dm-head"><span class="dm-no">#${String(no).padStart(3, '0')}</span><b>${sp.name}</b><span class="cls c-${sp.class}">${CLASS_LABEL[sp.class]}</span>
        <span class="tp">${sp.types.map(t => `<i style="background:${TYPE_COLORS[t][1]}">${t}</i>`).join('')}</span></div>
      <div class="dm-body">
        <div class="dm-stats">${stat('HP', sp.hp, 1900)}${stat('SPD', sp.speed, 130)}${stat('ATK', Math.round(sp.atk * 100), 150)}${stat('DEF', Math.round(sp.def * 100), 140)}${stat('SP.ATK', Math.round((sp.spa??sp.atk)*100),180)}${stat('SP.DEF', Math.round((sp.spdef??sp.def)*100),180)}</div>
        <div class="dm-ability"><span>ABILITY</span><b>${ab.name}</b><p>${ab.desc}</p></div>
        <h3>MOVES</h3><ul class="dm-moves">${sp.moves.map(move).join('')}${move(sp.ultimate)}</ul>${megas}
      </div></div>`;
    $('#format-screen').appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    const close = () => this.closeDexEntry();
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    wrap.querySelector('.dm-close').addEventListener('click', close);
    this.dex = { wrap, id, running: true };
    // Load just this Pokémon's sheets, then animate on its own: a pose or move as it opens, idle, and again now and then.
    await this.game.ensureSprites([id]);
    if (this.dex?.wrap !== wrap) return;
    wrap.querySelector('.dm-loading').remove();
    const sprite = new AnimatedSprite(this.game.sprites[sp.sprite]);
    const showName = ['Pose', 'Hop', 'Attack', 'Charge', 'Roar', 'RearUp'].find(n => sprite.has(n)) ?? 'Idle';
    const show = () => sprite.play(showName, { loop: false, force: true });
    show();
    const ctx = wrap.querySelector('canvas').getContext('2d');
    let last = performance.now(), idleT = 0;
    const frame = now => {
      if (!this.dex?.running || this.dex.wrap !== wrap) return;
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sprite.update(dt);
      if (sprite.done) {
        sprite.play('Idle', { force: true });
        idleT = 0;
      }
      if (sprite.anim.name === sprite.resolve('Idle').name && (idleT += dt) > 4) show();
      ctx.clearRect(0, 0, 200, 130);
      ctx.imageSmoothingEnabled = false;
      const ground = 104, lift = sp.fly ? sp.fly.height * 0.6 + Math.sin(now / 300) * 2 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(100, ground + 2, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      sprite.draw(ctx, 100, ground - lift, 0);
    };
    requestAnimationFrame(frame);
  }

  closeDexEntry() {
    if (!this.dex) return;
    this.dex.running = false;
    const w = this.dex.wrap;
    w.classList.remove('open');
    setTimeout(() => w.remove(), 180);
    this.dex = null;
  }

  renderFormat() {
    const page = $('#format-screen');
    page.querySelectorAll('.fm-opt').forEach(b => b.classList.toggle('on', +b.dataset.n === this.format));
    page.querySelectorAll('.op-card').forEach(b => b.classList.toggle('on', b.dataset.op === this.opponent));
    const go = page.querySelector('[data-a="go"]');
    if (!go) return;
    const leader = leaderById(this.opponent);
    go.disabled = !this.format;
    go.textContent = !this.format ? 'PICK A FORMAT ABOVE' : leader ? `CHALLENGE ${leader.name.toUpperCase()} · ${this.format} VS ${this.format} ▶` : `CONTINUE WITH ${this.format} VS ${this.format} ▶`;
  }

  confirmFormat() {
    if (!this.format) {
      sfx.denied();
      return;
    }
    this.closeDexEntry();
    sfx.megaBurst();
    this.save.format = this.format;
    this.save.opponent = this.opponent;
    this.persist();
    const leader = leaderById(this.opponent);
    // A Gym Leader battles in their own arena; a random team lets you pick one.
    if (leader) this.toTeamSelect(leader.arena, leader);
    else this.showArena();
  }

  // ── Arena ──
  showArena() {
    music.play('menu');
    if (this.game.state !== 'menu') this.game.toMenu();
    $('#intro').classList.remove('hidden');
    if (!this.opening.running) {
      this.opening.start();
      this.opening.skip();
    }
    const opts = [...ARENAS, { id: 'random', name: 'Random Arena', desc: 'Let fate pick the battlefield.' }];
    this.arenaIndex = Math.max(0, opts.findIndex(a => a.id === (this.save.arena ?? 'mtSilver')));
    this.arenaOpts = opts;
    const win = $('#arena-screen .px-window');
    this.format ??= this.save.format === 6 ? 6 : 3;
    win.innerHTML = `<h2>CHOOSE ARENA</h2>
      <div class="ar-format">FORMAT: <button data-n="3">3 VS 3</button><button data-n="6">6 VS 6</button></div><div class="ar-grid">${opts.map((a, i) => `<button class="ar-opt" data-i="${i}"><canvas width="96" height="60"></canvas><b>${a.name}</b><small>${a.desc}</small></button>`).join('')}</div>
      <div class="fm-btns"><button class="px-btn" data-a="back">◀ FORMAT</button><button class="px-btn primary" data-a="go">CHOOSE TEAM ▶</button></div>`;
    win.querySelectorAll('.ar-opt').forEach((b, i) => {
      const ctx = b.querySelector('canvas').getContext('2d'), a = opts[i];
      ctx.imageSmoothingEnabled = false;
      if (a.id === 'random') {
        ctx.fillStyle = '#283058';
        ctx.fillRect(0, 0, 96, 60);
        ctx.fillStyle = '#ffd84a';
        ctx.font = '700 34px "Pixelify Sans"';
        ctx.textAlign = 'center';
        ctx.fillText('?', 48, 44);
      } else ctx.drawImage(paintArena(a), 0, 220, 360, 225, 0, 0, 96, 60);
      b.addEventListener('click', () => {
        this.arenaIndex = i;
        this.renderArena();
      });
    });
    win.querySelector('[data-a="go"]').addEventListener('click', () => this.confirmArena());
    win.querySelector('[data-a="back"]').addEventListener('click', () => this.showFormat());
    const fmt = () => win.querySelectorAll('.ar-format button').forEach(b => b.classList.toggle('on', +b.dataset.n === this.format));
    win.querySelectorAll('.ar-format button').forEach(b => b.addEventListener('click', () => {
      this.format = +b.dataset.n;
      this.save.format = this.format;
      this.persist();
      fmt();
    }));
    fmt();
    this.show('#arena-screen');
    this.renderArena();
  }

  renderArena() {
    $('#arena-screen').querySelectorAll('.ar-opt').forEach((b, i) => b.classList.toggle('on', i === this.arenaIndex));
  }

  confirmArena() {
    sfx.megaBurst();
    const pick = this.arenaOpts[this.arenaIndex];
    this.save.arena = pick.id;
    this.persist();
    this.toTeamSelect(pick.id === 'random' ? ARENAS[Math.floor(Math.random() * ARENAS.length)].id : pick.id, null);
  }

  // Bot Battles team select, against a random team (leader = null) or a Gym Leader.
  // ── My Teams: saved teams, built and edited outside any battle ──
  showTeams() {
    music.play('menu');
    this.game.toMenu();
    this.opening.stop();
    $('#intro').classList.add('hidden');
    this.ui.setBuilder(null);
    const page = $('#teams-screen'), list = this.ui.loadTeams();
    const img = id => `<img src="/sprites/${SPECIES[id].sprite}/portrait.png" alt="${SPECIES[id].name}" title="${SPECIES[id].name}">`;
    const card = (t, k) => {
      const ids = t.team.filter(id => SPECIES[id]);
      return `<div class="tb-card"><div class="tb-top"><b>${escapeHtml(t.name)}</b><span class="tb-fmt">${t.format} VS ${t.format}</span></div>
        <div class="tb-mons">${ids.map((id, i) => `<span class="${i === (t.lead | 0) ? 'lead' : ''}">${img(id)}${i === (t.lead | 0) ? '<i>LEAD</i>' : ''}</span>`).join('')}</div>
        <div class="tb-btns"><button class="tb-btn go" data-use="${k}">BATTLE ▶</button><button class="tb-btn" data-edit="${k}">EDIT</button><button class="tb-btn del" data-del="${k}">DELETE</button></div></div>`;
    };
    page.innerHTML = `
      <header class="pg-head">
        <span class="dex-lens"></span><span class="dex-leds"><i></i><i></i><i></i></span>
        <h1>MY TEAMS</h1>${this.ui.rosterMigrated?'<p class="st-note">Legacy teams were updated to eligible final forms. Original teams are backed up in this browser; mastery records were preserved.</p>':''}
        <div class="pg-who"><canvas width="24" height="24"></canvas><span>${escapeHtml(this.save.name ?? 'TRAINER')}</span></div>
      </header>
      <div class="pg-bar"><button class="dex-btn" data-a="back">◀ MENU</button><span></span></div>
      <section class="dex-panel tb-page">
        <h2>SAVED TEAMS <span class="dex-count">${list.length} / 20</span></h2>
        <div class="tb-new"><button class="dex-online" data-new="3">+ NEW 3 VS 3 TEAM</button><button class="dex-online friend" data-new="6">+ NEW 6 VS 6 TEAM</button></div>
        ${list.length ? `<div class="tb-grid">${list.map(card).join('')}</div>` : '<p class="tb-empty">No teams yet. Make one with the buttons above — saved teams can be loaded in any battle (★ Teams on the team screen).</p>'}
      </section>`;
    page.querySelector('.pg-who canvas').getContext('2d').drawImage(drawBust(lookById(this.save.look)), 0, 0);
    page.querySelector('[data-a="back"]').addEventListener('click', () => this.showTitleMenu());
    page.querySelectorAll('[data-new]').forEach(b => b.addEventListener('click', () => this.editTeam(null, +b.dataset.new)));
    page.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => this.editTeam(+b.dataset.edit)));
    page.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => {
      // Battle with it: straight to Battle Setup with the team already picked.
      this.ui.useTeam(list[+b.dataset.use]);
      this.save.format = this.ui.format;
      this.persist();
      this.showFormat();
    }));
    // Deleting asks once more on the same button (no pop-ups).
    page.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      if (!b.classList.contains('sure')) {
        b.classList.add('sure');
        b.textContent = 'SURE?';
        return;
      }
      list.splice(+b.dataset.del, 1);
      this.ui.storeTeams(list);
      this.showTeams();
    }));
    this.show('#teams-screen');
    page.scrollTop = 0;
  }

  // The team picker in builder mode: pick Pokémon, name the team, save (no battle).
  editTeam(k, format) {
    const list = this.ui.loadTeams(), t = k == null ? null : list[k];
    this.format = t?.format ?? format ?? 3;
    this.show(null);
    this.screen = 'select';
    this.opening.stop();
    $('#intro').classList.add('hidden');
    this.ui.setQueue(null);
    this.ui.setLeader(null);
    this.ui.setFormat(this.format);
    this.ui.selection = t ? t.team.filter(id => SPECIES[id]).slice(0, this.format) : [];
    this.ui.lead = t ? Math.min(t.lead | 0, Math.max(0, this.ui.selection.length - 1)) : 0;
    if (t?.mega) Object.assign(this.ui.megaPick, t.mega);
    this.ui.setBuilder({ index: k, name: t?.name ?? `Team ${list.length + 1}` });
    this.game.toSelect();
  }

  toTeamSelect(arenaId, leader) {
    this.game.arenaId = arenaId;
    this.format ??= this.save.format === 6 ? 6 : 3;
    this.show(null);
    this.screen = 'select';
    this.opening.stop();
    $('#intro').classList.add('hidden');
    this.ui.setBuilder(null);
    this.ui.setQueue(null);
    this.ui.setLeader(leader);
    this.ui.setFormat(this.format);
    this.game.toSelect();
  }

  // ── Online matchmaking: team select in queue mode (FIND MATCH instead of a bot battle) ──
  enterQueueSelect() {
    this.closeDexEntry();
    this.togglePause(false);
    if (this.online.net) {
      this.online.leave();
      this.ui.setOnline(null);
    }
    this.show(null);
    this.screen = 'select';
    this.opening.stop();
    $('#intro').classList.add('hidden');
    this.format = this.save.format === 6 ? 6 : 3;
    this.ui.setBuilder(null);
    this.ui.setLeader(null);
    this.ui.setFormat(this.format);
    this.ui.setQueue({ record: this.mm.record });
    this.game.toSelect();
    this.mm.pollLobby(true); // counts you as online in this format straight away
    sfx.megaBurst();
  }

  // ── Pause (P / Esc on desktop, the II button on touch) ──
  // Online the battle can't stop for one player: the menu opens over it and the battle carries on.
  togglePause(open = !this.pauseOpen) {
    const g = this.game, online = this.online.inBattle || this.mm.inBattle;
    if (open && !['fighting', 'intro'].includes(g.state)) return;
    this.pauseOpen = open;
    g.paused = open && !online;
    $('#pause-menu').classList.toggle('hidden', !open);
    $('#pause-menu h2').textContent = online ? 'MENU · BATTLE GOES ON' : 'PAUSED';
    $('#pause-menu [data-p="menu"]').textContent = this.mm.inBattle ? 'FORFEIT & LEAVE' : online ? 'LEAVE BATTLE' : 'MAIN MENU';
    if (open) g.input.clear();
  }

  // ── Online battles (custom rooms) ──
  // `from` is where ◀ BACK returns to: the title menu or the battle setup page.
  showOnline(view = 'home', msg = '', from) {
    if (from) this.onlineFrom = from;
    music.play('menu');
    if (this.game.state !== 'menu') this.game.toMenu();
    $('#intro').classList.remove('hidden');
    if (!this.opening.running) {
      this.opening.start();
      this.opening.skip();
    }
    this.onlineView = view;
    const win = $('#online-screen .px-window'), o = this.online;
    if (view === 'home') {
      this.onlineFormat ??= this.save.format === 6 ? 6 : 3;
      this.onlineArena ??= this.save.arena ?? 'mtSilver';
      const arenas = [...ARENAS, { id: 'random', name: 'Random' }];
      win.innerHTML = `<h2>ONLINE BATTLE</h2>
        <p class="ol-note">Battle a friend over the internet: one of you creates a room and sends the code, the other joins with it.</p>
        <div class="ol-cols">
          <section class="ol-box"><h3>CREATE A ROOM</h3>
            <div class="ol-label">FORMAT</div><div class="ol-fmt"><button data-n="3">3 VS 3</button><button data-n="6">6 VS 6</button></div>
            <div class="ol-label">ARENA</div><div class="ol-arenas">${arenas.map(a => `<button data-id="${a.id}">${a.name}</button>`).join('')}</div>
            <button class="px-btn primary" data-a="create">CREATE ROOM ▶</button>
          </section>
          <section class="ol-box"><h3>JOIN A ROOM</h3>
            <div class="ol-label">ROOM CODE</div>
            <input class="ol-code" maxlength="${CODE_LEN}" placeholder="CODE" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" aria-label="Room code" />
            <button class="px-btn primary" data-a="join">JOIN ROOM ▶</button>
          </section>
        </div>
        <div class="ol-msg">${escapeHtml(msg)}</div>
        <div class="fm-btns"><button class="px-btn" data-a="back">◀ ${this.onlineFrom === 'format' ? 'BATTLE SETUP' : 'MENU'}</button></div>`;
      const sync = () => {
        win.querySelectorAll('.ol-fmt button').forEach(b => b.classList.toggle('on', +b.dataset.n === this.onlineFormat));
        win.querySelectorAll('.ol-arenas button').forEach(b => b.classList.toggle('on', b.dataset.id === this.onlineArena));
      };
      win.querySelectorAll('.ol-fmt button').forEach(b => b.addEventListener('click', () => {
        this.onlineFormat = +b.dataset.n;
        sync();
      }));
      win.querySelectorAll('.ol-arenas button').forEach(b => b.addEventListener('click', () => {
        this.onlineArena = b.dataset.id;
        sync();
      }));
      sync();
      const input = win.querySelector('.ol-code');
      input.addEventListener('input', () => { input.value = cleanCode(input.value); });
      win.querySelector('[data-a="create"]').addEventListener('click', () => this.createRoom());
      win.querySelector('[data-a="join"]').addEventListener('click', () => this.joinRoom(input.value));
      win.querySelector('[data-a="back"]').addEventListener('click', () => this.onlineBack());
    } else if (view === 'hosting') {
      const room = o.room, invite = `${location.origin}${location.pathname}?room=${o.code}`;
      win.innerHTML = `<h2>ROOM CREATED</h2>
        <div class="ol-label">ROOM CODE</div><div class="ol-bigcode" aria-label="Room code ${o.code.split('').join(' ')}">${o.code}</div>
        <div class="ol-share"><button class="px-btn small" data-a="copy">COPY CODE</button><button class="px-btn small" data-a="link">COPY INVITE LINK</button></div>
        <p class="ol-wait">Send the code to your friend: they pick ONLINE BATTLE → JOIN A ROOM.<br>Waiting for them to join<span class="ol-dots"></span></p>
        <p class="ol-sub">${room.format} VS ${room.format} · ${escapeHtml(arenaById(room.arena)?.name ?? '')}</p>
        <div class="fm-btns"><button class="px-btn" data-a="cancel">CLOSE ROOM</button></div>`;
      // Clipboard API first, then the old select-and-copy fallback; the button always says what happened.
      const copy = async (btn, text, done) => {
        const label = btn.dataset.label ??= btn.textContent;
        let ok = false;
        try {
          await navigator.clipboard.writeText(text);
          ok = true;
        } catch {
          const ta = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
          ta.style.cssText = 'position:fixed;opacity:0;top:0';
          document.body.appendChild(ta);
          ta.select();
          try { ok = document.execCommand('copy'); } catch { ok = false; }
          ta.remove();
        }
        btn.textContent = ok ? `${done} ✓` : 'COPY FAILED — SELECT THE CODE';
        btn.classList.toggle('ol-copied', ok);
        btn.classList.toggle('ol-copyfail', !ok);
        if (!ok) getSelection()?.selectAllChildren(win.querySelector('.ol-bigcode'));
        clearTimeout(btn.resetT);
        btn.resetT = setTimeout(() => {
          btn.textContent = label;
          btn.classList.remove('ol-copied', 'ol-copyfail');
        }, 2500);
      };
      win.querySelector('[data-a="copy"]').addEventListener('click', e => copy(e.currentTarget, o.code, 'CODE COPIED'));
      win.querySelector('[data-a="link"]').addEventListener('click', e => copy(e.currentTarget, invite, 'LINK COPIED'));
      win.querySelector('[data-a="cancel"]').addEventListener('click', () => this.cancelOnline());
    } else {
      win.innerHTML = `<h2>ONLINE BATTLE</h2><p class="ol-wait">${escapeHtml(msg)}<span class="ol-dots"></span></p>
        <div class="fm-btns"><button class="px-btn" data-a="cancel">CANCEL</button></div>`;
      win.querySelector('[data-a="cancel"]').addEventListener('click', () => this.cancelOnline());
    }
    this.show('#online-screen');
  }

  onlineBack() {
    if (this.onlineFrom === 'format') this.showFormat();
    else this.showTitleMenu();
  }

  async createRoom() {
    const pick = this.onlineArena, arena = pick === 'random' ? ARENAS[Math.floor(Math.random() * ARENAS.length)].id : pick;
    this.save.format = this.onlineFormat;
    this.persist();
    sfx.sendOut();
    this.showOnline('busy', 'Creating a room');
    try {
      await this.online.create(this.onlineFormat, arena);
      if (this.onlineView === 'busy' && !this.online.friend) this.showOnline('hosting');
    } catch (err) {
      this.online.close();
      if (this.onlineView === 'busy') this.showOnline('home', this.netMessage(err));
    }
  }

  async joinRoom(raw) {
    const code = cleanCode(raw);
    this.pendingRoom = null;
    if (code.length !== CODE_LEN) {
      sfx.denied();
      this.showOnline('home', `Enter the ${CODE_LEN}-character room code.`);
      return;
    }
    sfx.sendOut();
    this.showOnline('busy', `Joining room ${code}`);
    try {
      await this.online.join(code);
      if (this.onlineView === 'busy' && this.screen === 'online') this.showOnline('busy', 'Connected! Getting the room ready');
    } catch (err) {
      this.online.close();
      if (this.onlineView === 'busy') this.showOnline('home', this.netMessage(err, code));
    }
  }

  netMessage(err, code) {
    const t = err?.type;
    if (t === 'peer-unavailable') return `Room ${code} wasn't found. Check the code (rooms close when their creator leaves).`;
    if (t === 'timeout') return 'The connection timed out. Check the code and try again — some strict networks block online play.';
    if (t === 'browser-incompatible') return "This browser doesn't support online play.";
    return "Couldn't reach the online service. Check your internet connection and try again.";
  }

  cancelOnline() {
    this.online.close();
    this.showOnline('home');
  }

  onlineError(msg) {
    this.ui.setOnline(null);
    this.showOnline('home', msg);
  }

  // Both players are connected: team select in room mode (format and arena come from the room).
  enterOnlineLobby() {
    const room = this.online.room;
    this.closeDexEntry();
    this.togglePause(false);
    this.show(null);
    this.screen = 'select';
    this.opening.stop();
    $('#intro').classList.add('hidden');
    this.game.arenaId = room.arena;
    this.ui.setBuilder(null);
    this.ui.setQueue(null);
    this.ui.setLeader(null);
    this.ui.setFormat(room.format);
    this.ui.setOnline(this.onlineInfo());
    this.game.toSelect();
    sfx.megaBurst();
  }

  onlineInfo() {
    const o = this.online;
    return {
      code: o.code, friend: o.friend?.name ?? 'FRIEND', format: o.room?.format ?? 3, arena: arenaById(o.room?.arena)?.name ?? '',
      locked: !!o.me, friendReady: !!o.them, loading: o.loading, ping: o.ping,
    };
  }

  onlineUpdate() {
    if (!this.ui.online) return;
    Object.assign(this.ui.online, this.onlineInfo());
    if (this.game.state === 'select') {
      this.ui.renderOnline();
      this.ui.renderSelection();
    } else if (this.online.inBattle && this.online.ping != null) {
      $('#panel .loc').textContent = `ONLINE · ROOM ${this.online.code} · ${this.online.ping} MS`;
    }
  }

  // The friend left or the connection dropped.
  onlineLost(text) {
    if (this.screen === 'online') {
      this.onlineError(text);
      return;
    }
    const g = this.game;
    this.togglePause(false);
    if (['fighting', 'intro', 'finale'].includes(g.state)) {
      g.state = 'over';
      Object.assign(g, { cinematic: null, showcase: null, finale: null });
    }
    if (!this.ui.online) return;
    this.ui.showNotice('Disconnected', text);
  }

  leaveOnline() {
    this.online.leave();
    this.ui.setOnline(null);
    this.toTitle();
  }

  toTitle() {
    this.ui.setStory(null);
    this.game.story = null;
    this.mm.stop();
    this.ui.setQueue(null);
    this.ui.setBuilder(null);
    if (this.online.net) {
      // Leaving to the title always leaves the room.
      this.online.leave();
      this.ui.setOnline(null);
    }
    this.togglePause(false);
    this.tutorial.active && this.tutorial.finish(true);
    this.game.endPractice();
    this.game.toMenu();
    music.play('title');
    this.showTitleMenu();
  }

  onKey(e) {
    const s = this.screen;
    if (this.pauseOpen && (e.code === 'Escape' || e.code === 'KeyP')) {
      e.preventDefault();
      this.togglePause(false);
      return;
    }
    if (['fighting', 'intro'].includes(this.game.state) && e.code === 'KeyP') {
      e.preventDefault();
      this.togglePause(true);
      return;
    }
    if (e.target.tagName === 'INPUT' && e.code !== 'Enter' && !(s==='trainer' && this.trainerFrom==='settings' && e.code==='Escape')) return;
    if (s === 'opening') {
      if (['Enter', 'Space'].includes(e.code) || !this.opening.ready) {
        e.preventDefault();
        this.advanceOpening();
      }
    } else if (s === 'title') {
      const n = this.menuItems.length;
      const dir = { ArrowDown: [0, 1], KeyS: [0, 1], ArrowUp: [0, -1], KeyW: [0, -1], ArrowRight: [1, 0], KeyD: [1, 0], ArrowLeft: [-1, 0], KeyA: [-1, 0] }[e.code];
      if (dir) this.menuIndex = this.menuNeighbour(dir) ?? this.menuIndex;
      else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        sfx.sendOut();
        this.menuItems[this.menuIndex][1]();
        return;
      } else return;
      e.preventDefault();
      this.highlightMenu();
    } else if (s === 'trainer') {
      const inInput = e.target.tagName === 'INPUT';
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 }[e.code];
      if (step && !inInput) {
        e.preventDefault();
        this.pick = (this.pick + step + LOOKS.length) % LOOKS.length;
        this.renderTrainer();
      } else if(e.code==='Escape' && this.trainerFrom==='settings'){e.preventDefault();this.backToSettings();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        this.confirmTrainer();
      }
    } else if (s === 'arena') {
      const n = this.arenaOpts.length, cols = window.innerWidth <= 520 ? 2 : 3;
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.code];
      if (step) {
        e.preventDefault();
        this.arenaIndex = (this.arenaIndex + step + n) % n;
        this.renderArena();
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.confirmArena();
      } else if (e.code === 'Escape') this.showFormat();
    } else if (s === 'teams') {
      if (e.code === 'Escape') this.showTitleMenu();
    } else if (s === 'online') {
      if (e.code === 'Escape') {
        if (this.onlineView === 'home') this.onlineBack();
        else this.cancelOnline();
      } else if (e.code === 'Enter' && e.target.classList?.contains('ol-code')) this.joinRoom(e.target.value);
    } else if (s === 'format') {
      if (e.target.tagName === 'INPUT') return; // typing in the Pokédex search
      if (this.dex && e.code === 'Escape') {
        this.closeDexEntry();
        return;
      }
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) {
        e.preventDefault();
        this.format = this.format === 3 ? 6 : 3;
        this.renderFormat();
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.confirmFormat();
      } else if (e.code === 'Escape') this.showTitleMenu();
    }
  }

  // ── Fullscreen and audio controls ──
  async toggleFullscreen() {
    const el = document.documentElement;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen ?? document.webkitExitFullscreen).call(document);
      else await (el.requestFullscreen ?? el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
    } catch {
      // Unsupported or denied (e.g. iPhone Safari): the game keeps using the whole browser viewport.
      for (const b of document.querySelectorAll('[data-fs]')) b.textContent = 'FULLSCREEN N/A';
    }
    this.syncFullscreen();
  }

  enterFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    try {
      (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' })?.catch?.(() => {});
    } catch { /* not supported: the battle still fills the browser window */ }
  }

  syncFullscreen() {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    for (const b of document.querySelectorAll('[data-fs]')) b.textContent = on ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
  }

  syncAudioUi() {
    for (const b of document.querySelectorAll('[data-music]')) b.textContent = music.enabled ? '♪ MUSIC: ON' : '♪ MUSIC: OFF';
    for (const r of document.querySelectorAll('[data-volume]')) r.value = Math.round(music.volume * 100);
    for (const b of document.querySelectorAll('[data-sfx]')) b.textContent = isMuted() ? 'SFX: OFF' : 'SFX: ON';
  }

  bindPause() {
    $('#pause-menu').addEventListener('click', e => {
      const a = e.target.closest('[data-p]')?.dataset.p;
      if (a === 'resume') this.togglePause(false);
      else if(a==='settings')this.expansion.settings();
      else if (a === 'menu') {
        if (this.online.inBattle) this.leaveOnline();
        else this.toTitle(); // online matchmaking: leaving forfeits the match
      }
      else if (a === 'sfx') {
        setMuted(!isMuted());
        this.syncAudioUi();
      }
    });
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
