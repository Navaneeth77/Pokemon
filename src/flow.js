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
import { ARENAS, paintArena } from './arena.js';

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
    this.screen = null;
    this.opening = new Opening($('#intro-canvas'), game.sprites, () => this.pressStart());
    this.tutorial = new Tutorial(game, skipped => this.endTutorial(skipped));
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
    for (const s of ['#trainer-screen', '#format-screen', '#arena-screen', '#title-menu']) $(s).classList.toggle('hidden', s !== id);
    this.screen = { '#trainer-screen': 'trainer', '#format-screen': 'format', '#arena-screen': 'arena', '#title-menu': 'title' }[id] ?? this.screen;
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
    if (this.save.name) this.showTitleMenu();
    else this.showTrainer();
  }

  // ── Title menu (returning players) ──
  showTitleMenu() {
    $('#intro').classList.remove('hidden');
    if (!this.opening.running) {
      this.opening.start();
      this.opening.skip();
    }
    const items = [
      ['START BATTLE', () => this.showFormat()],
      ['EDIT TRAINER', () => this.showTrainer()],
      ['TUTORIAL', () => this.startTutorial()],
    ];
    const menu = $('#title-menu');
    menu.innerHTML = `<div class="tm-who"><canvas width="24" height="24"></canvas><span>${escapeHtml(this.save.name)}</span></div>`
      + items.map(([label], i) => `<button class="tm-item" data-i="${i}">${label}</button>`).join('');
    menu.querySelector('canvas').getContext('2d').drawImage(drawBust(lookById(this.save.look)), 0, 0);
    this.menuItems = items;
    this.menuIndex = 0;
    menu.querySelectorAll('.tm-item').forEach(b => b.addEventListener('click', () => {
      sfx.sendOut();
      items[+b.dataset.i][1]();
    }));
    this.show('#title-menu');
    this.highlightMenu();
  }

  highlightMenu() {
    $('#title-menu').querySelectorAll('.tm-item').forEach((b, i) => b.classList.toggle('on', i === this.menuIndex));
  }

  // ── Trainer setup ──
  showTrainer() {
    music.play('menu');
    const win = $('#trainer-screen .px-window');
    this.pick = Math.max(0, LOOKS.findIndex(l => l.id === this.save.look));
    win.innerHTML = `
      <h2>TRAINER SETUP</h2>
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
      <button class="px-btn primary ts-confirm">CONFIRM TRAINER ▶</button>`;
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
    this.show('#trainer-screen');
    this.renderTrainer();
    if (!isTouchDevice()) input.focus();
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
    if (!name) {
      win.querySelector('.ts-msg').textContent = 'Please enter a name (up to 10 characters).';
      sfx.denied();
      win.querySelector('#trainer-name').focus();
      return;
    }
    sfx.megaBurst();
    this.save.name = name.toUpperCase();
    this.save.look = LOOKS[this.pick].id;
    this.persist();
    this.applyTrainer(this.save.name, LOOKS[this.pick]);
    if (!this.save.tutorialDone) this.startTutorial();
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
    // No format is pre-selected: the player must pick one before continuing.
    this.format = null;
    const page = $('#format-screen');
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
        <h2>1 · CHOOSE BATTLE FORMAT</h2>
        <div class="fm-opts">${opt(3, 'Pick 3 Pokémon. A classic three-on-three showdown.')}${opt(6, 'Pick 6 Pokémon. A full-team marathon battle.')}</div>
        <button class="dex-go" data-a="go" disabled>PICK A FORMAT ABOVE</button>
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
    page.querySelector('[data-a="go"]').addEventListener('click', () => this.confirmFormat());
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
        <div class="dm-stats">${stat('HP', sp.hp, 1900)}${stat('SPD', sp.speed, 130)}${stat('ATK', Math.round(sp.atk * 100), 150)}${stat('DEF', Math.round(sp.def * 100), 140)}</div>
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
    const go = page.querySelector('[data-a="go"]');
    if (!go) return;
    go.disabled = !this.format;
    go.textContent = this.format ? `CONTINUE WITH ${this.format} VS ${this.format} ▶` : 'PICK A FORMAT ABOVE';
  }

  confirmFormat() {
    if (!this.format) {
      sfx.denied();
      return;
    }
    this.closeDexEntry();
    sfx.megaBurst();
    this.save.format = this.format;
    this.persist();
    this.showArena();
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
    this.game.arenaId = pick.id === 'random' ? ARENAS[Math.floor(Math.random() * ARENAS.length)].id : pick.id;
    this.format ??= this.save.format === 6 ? 6 : 3;
    this.show(null);
    this.screen = 'select';
    this.opening.stop();
    $('#intro').classList.add('hidden');
    this.ui.setFormat(this.format);
    this.game.toSelect();
  }

  // ── Pause (P / Esc on desktop, the II button on touch) ──
  togglePause(open = !this.game.paused) {
    const g = this.game;
    if (open && !['fighting', 'intro'].includes(g.state)) return;
    g.paused = open;
    $('#pause-menu').classList.toggle('hidden', !open);
    if (open) g.input.clear();
  }

  toTitle() {
    this.togglePause(false);
    this.tutorial.active && this.tutorial.finish(true);
    this.game.endPractice();
    this.game.toMenu();
    music.play('title');
    this.showTitleMenu();
  }

  onKey(e) {
    const s = this.screen;
    if (this.game.paused && (e.code === 'Escape' || e.code === 'KeyP')) {
      e.preventDefault();
      this.togglePause(false);
      return;
    }
    if (['fighting', 'intro'].includes(this.game.state) && e.code === 'KeyP') {
      e.preventDefault();
      this.togglePause(true);
      return;
    }
    if (e.target.tagName === 'INPUT' && e.code !== 'Enter') return;
    if (s === 'opening') {
      if (['Enter', 'Space'].includes(e.code) || !this.opening.ready) {
        e.preventDefault();
        this.advanceOpening();
      }
    } else if (s === 'title') {
      const n = this.menuItems.length;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') this.menuIndex = (this.menuIndex + 1) % n;
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.menuIndex = (this.menuIndex + n - 1) % n;
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
      else if (a === 'menu') this.toTitle();
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
