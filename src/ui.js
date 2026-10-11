import { MOVES } from './moves.js';
import { TYPE_COLORS } from './data/types.js';
import { SPECIES, ROSTER, OPPONENT_TEAM, DEFAULT_TEAM, CLASS_LABEL } from './data/species.js';

const CAT = { physical: 'Physical', special: 'Special', status: 'Status' };
import { ABILITIES } from './data/abilities.js';
import { isMuted, setMuted } from './audio.js';

const $ = sel => document.querySelector(sel);
const hpColor = r => (r > 0.5 ? '#46d36b' : r > 0.2 ? '#f4c430' : '#ec4b3c');
const portrait = s => `/sprites/${s.sprite}/portrait.png`;
const typeChips = types => types.map(t => `<i style="background:${TYPE_COLORS[t][0]}">${t}</i>`).join('');
const esc = str => str.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function moveLine(id) {
  const m = MOVES[id], [c1] = TYPE_COLORS[m.type];
  return `<li><b style="color:${c1}">${m.name}</b>${m.chargeable ? ' <em title="Hold to charge">⚡</em>' : ''}`
    + `<span>${m.ultimate ? 'ULT' : m.power} · ${esc(m.tag)}</span></li>`;
}

export class UI {
  constructor() {
    this.moveEls = [];
    this.mates = [];
    this.menuCards = [];
    this.cards = [];
    this.selection = [...DEFAULT_TEAM];
    this.megaPick = {};
    this.lead = 0;
    this.filter = 'all';
    this.foes = [...OPPONENT_TEAM];
    this.difficulty = 'medium';
    this.format = 3;
    this.query = '';
    this.logEl = $('#log');
    this.selectOverlay = $('#select-overlay');
    this.resultOverlay = $('#result-overlay');
    this.resultText = $('#result-text');
  }

  bind(game) {
    this.game = game;
    this.buildRoster();
    this.buildTeam(game);
    $('#start-btn').addEventListener('click', e => {
      e.currentTarget.blur();
      this.startBattle();
    });
    for (const sel of ['#again-btn', '#restart-btn']) {
      $(sel).addEventListener('click', e => {
        e.currentTarget.blur();
        game.toSelect();
      });
    }
    const mute = $('#mute-btn');
    mute.addEventListener('click', () => {
      setMuted(!isMuted());
      mute.textContent = isMuted() ? 'Sound: Off' : 'Sound: On';
      mute.blur();
    });
    const ult = $('#ult-btn');
    this.ult = { btn: ult, name: ult.querySelector('.name'), meta: ult.querySelector('.meta'), cd: ult.querySelector('.cd'), cdt: ult.querySelector('.cdt'), last: '' };
    ult.addEventListener('mousedown', e => e.preventDefault());
    ult.addEventListener('click', () => game.playerUltimate());
    this.abilityBox = $('#ability-box');
    this.megaBtn = $('#mega-btn');
    this.megaState = '';
    this.megaBtn.addEventListener('mousedown', e => e.preventDefault());
    this.megaBtn.addEventListener('click', () => game.playerMega());
    // Clicking the arena skips the intro showcase or the finishing sequence.
    $('#game').addEventListener('click', () => game.skipCinema());
  }

  async startBattle() {
    if (this.selection.length !== this.format || this.loading) return;
    const btn = $('#start-btn');
    this.game.flow?.enterFullscreen();
    this.loading = true;
    btn.disabled = true;
    btn.textContent = 'Loading…';
    try {
      await this.game.ensureSprites([...this.selection, ...this.foes]);
      this.game.selection = [...this.selection];
      this.game.opponentSelection = [...this.foes];
      this.game.difficulty = this.difficulty;
      this.game.lead = this.lead;
      this.game.megaPicks = { ...this.megaPick };
      this.game.start();
    } catch (err) {
      console.error(err);
      btn.textContent = 'Failed to load — retry';
    } finally {
      this.loading = false;
      btn.disabled = false;
    }
  }

  // ── Selection screen: searchable, filterable roster; details of the hovered Pokémon; team slots ──
  buildRoster() {
    const box = $('#roster');
    for (const id of ROSTER) {
      const s = SPECIES[id];
      const btn = document.createElement('button');
      btn.className = `card c-${s.class}`;
      btn.innerHTML = `<span class="no"></span>${s.mega?.length ? '<span class="mg">MEGA</span>' : ''}`
        + `<img loading="lazy" src="${portrait(s)}" alt=""><span class="nm">${s.name}</span>`
        + `<span class="tp">${s.types.map(t => `<i style="background:${TYPE_COLORS[t][0]}"></i>`).join('')}</span>`
        + `<span class="ab">${ABILITIES[s.ability].name}</span>`;
      btn.addEventListener('click', () => {
        this.toggle(id);
        this.showInfo(id);
      });
      btn.addEventListener('mouseenter', () => this.showInfo(id));
      box.appendChild(btn);
      const text = s.name.toLowerCase(); // search matches Pokémon names only
      this.cards.push({ id, btn, no: btn.querySelector('.no'), species: s, text });
    }
    $('#roster-search').addEventListener('input', e => {
      this.query = e.target.value.trim().toLowerCase();
      this.applyFilter();
    });
    for (const b of document.querySelectorAll('#roster-filters button')) {
      b.addEventListener('click', () => {
        this.filter = b.dataset.f;
        for (const o of document.querySelectorAll('#roster-filters button')) o.classList.toggle('on', o === b);
        this.applyFilter();
      });
    }
    $('#reroll-btn').addEventListener('click', e => {
      e.currentTarget.blur();
      this.rollFoes();
    });
    for (const b of document.querySelectorAll('#difficulty button')) {
      b.addEventListener('click', () => {
        this.difficulty = b.dataset.d;
        for (const o of document.querySelectorAll('#difficulty button')) o.classList.toggle('on', o === b);
        b.blur();
      });
    }
    const fmt = document.createElement('button');
    fmt.className = 'mini-btn format-link';
    fmt.textContent = '◀ Change format';
    fmt.addEventListener('click', () => this.game.flow?.showFormat());
    // Switch between 3v3 and 6v6 right here as well.
    const fmtSwitch = document.createElement('div');
    fmtSwitch.className = 'fmt-switch';
    fmtSwitch.innerHTML = '<button data-n="3">3 VS 3</button><button data-n="6">6 VS 6</button>';
    fmtSwitch.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const n = +b.dataset.n, flow = this.game.flow;
      if (flow) {
        flow.format = n;
        flow.save.format = n;
        flow.persist();
      }
      this.setFormat(n);
      this.renderSelection();
    }));
    $('.team-summary').before(fmtSwitch);
    const ar = document.createElement('button');
    ar.className = 'mini-btn format-link';
    ar.textContent = '◀ Change arena';
    ar.addEventListener('click', () => this.game.flow?.showArena());
    $('#start-btn').after(fmt, ar);
    this.rollFoes();
    this.showInfo(this.selection[0]);
    this.renderSelection();
  }

  // The bot fields three random, distinct Pokémon; rolled again for every new battle.
  rollFoes() {
    const special = this.selection.filter(id => SPECIES[id].class !== 'regular').length;
    const pick = (pool, n) => {
      const out = [];
      while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      return out;
    };
    const legends = ROSTER.filter(id => SPECIES[id].class !== 'regular'), regulars = ROSTER.filter(id => SPECIES[id].class === 'regular');
    const strong = Math.min(special, this.format);
    this.foes = [...pick(legends, strong), ...pick(regulars, this.format - strong)].sort(() => Math.random() - 0.5);
    this.foeBasis = `${this.format}|${special}`;
    $('#foe-team').innerHTML = this.foes.map(id => {
      const s = SPECIES[id];
      return `<span class="foe-mon"><img src="${portrait(s)}" alt="">${s.name}</span>`;
    }).join('');
  }

  applyFilter() {
    let shown = 0;
    for (const c of this.cards) {
      const s = c.species;
      const ok = !!(this.filter === 'all' || (this.filter === 'mega' ? s.mega?.length : s.class === this.filter))
        && (!this.query || c.text.includes(this.query));
      c.btn.hidden = !ok;
      shown += ok;
    }
    $('#roster-count').textContent = `${shown} / ${this.cards.length}`;
  }

  showInfo(id) {
    $('#mon-info').innerHTML = this.infoHtml(id);
  }

  // Details card for one Pokémon (team select and the battle-setup Pokédex share it).
  infoHtml(id) {
    const s = SPECIES[id], ab = ABILITIES[s.ability];
    const stat = (label, v, max) => `<div class="st"><span>${label}</span><i><b style="width:${Math.min(100, (v / max) * 100)}%"></b></i><em>${v}</em></div>`;
    const megas = (s.mega ?? []).map(m => {
      const f = SPECIES[m], fa = ABILITIES[f.ability];
      return `<div class="mega-line"><b>${f.name}</b> ${typeChips(f.types)} — <u>${fa.name}</u>: ${esc(fa.desc)}</div>`;
    }).join('');
    return `
      <div class="mi-head"><img src="${portrait(s)}" alt=""><div><b>${s.name}</b> <span class="cls c-${s.class}">${CLASS_LABEL[s.class]}</span>
        <div class="tp">${typeChips(s.types)}</div></div></div>
      <div class="stats">${stat('HP', s.hp, 1900)}${stat('SPD', s.speed, 130)}${stat('ATK', Math.round(s.atk * 100), 150)}${stat('DEF', Math.round(s.def * 100), 140)}</div>
      <div class="abil"><u>${ab.name}</u> — ${esc(ab.desc)}</div>
      <ul class="mv">${s.moves.map(moveLine).join('')}${moveLine(s.ultimate)}</ul>${megas}`;
  }

  toggle(id) {
    const i = this.selection.indexOf(id);
    if (i >= 0) {
      this.selection.splice(i, 1);
      if (i < this.lead) this.lead--;
      else if (i === this.lead) this.lead = 0;
    } else if (this.selection.length < this.format) this.selection.push(id);
    this.renderSelection();
  }

  setFormat(n) {
    this.format = n;
    this.selection = this.selection.slice(0, n);
    if (this.lead >= this.selection.length) this.lead = 0;
    this.rollFoes();
  }

  hideBattleOverlays() {
    this.selectOverlay.classList.add('hidden');
    this.resultOverlay.classList.add('hidden');
    this.showSwitchMenu(false);
  }

  setLocation(arena, n) {
    $('#panel .loc').textContent = `${arena.toUpperCase()} · ${n} VS ${n}`;
  }

  // The player's trainer name and portrait in the side panel and on the team-select header.
  setTrainer(name, bust) {
    const icon = `<canvas class="pt-icon" width="24" height="24"></canvas>`;
    $('#panel .title').innerHTML = `${icon}${name} <span>vs</span> Gold`;
    $('#panel .title canvas').getContext('2d').drawImage(bust, 0, 0);
    $('.matchup').innerHTML = `<span class="red">${name}</span> <span class="vs">VS</span> <span class="gold">GOLD</span>`;
  }

  renderSelection() {
    const special = this.selection.filter(id => SPECIES[id].class !== 'regular').length;
    if (this.foeBasis !== `${this.format}|${special}`) this.rollFoes();
    const full = this.selection.length >= this.format;
    for (const c of this.cards) {
      const k = this.selection.indexOf(c.id);
      c.btn.classList.toggle('sel', k >= 0);
      c.btn.classList.toggle('full', k < 0 && full);
      c.no.textContent = k < 0 ? '' : k === this.lead ? 'LEAD' : String(k + 1);
    }
    const box = $('#team-summary');
    box.innerHTML = `<div class="team-count">YOUR TEAM ${this.selection.length}/${this.format}</div>` + Array.from({ length: this.format }, (_, i) => i).map(i => {
      const id = this.selection[i];
      if (!id) return '<div class="slot empty">Empty slot</div>';
      const s = SPECIES[id];
      // Pokémon with two Mega forms pick X or Y here, so nothing needs choosing mid-battle.
      const xy = s.mega?.length > 1
        ? `<span class="xy">${s.mega.map((m, k) => `<em data-id="${id}" data-m="${m}" class="${(this.megaPick[id] ?? s.mega[0]) === m ? 'on' : ''}">${'XY'[k]}</em>`).join('')}</span>`
        : '';
      return `<button class="slot${i === this.lead ? ' lead' : ''}" data-i="${i}"><img src="${portrait(s)}" alt="">`
        + `<span>${s.name}</span><b>${i === this.lead ? 'LEAD' : 'Set as lead'}</b>${xy}</button>`;
    }).join('');
    box.querySelectorAll('button.slot').forEach(b => b.addEventListener('click', () => {
      this.lead = +b.dataset.i;
      this.renderSelection();
    }));
    box.querySelectorAll('.xy em').forEach(e => e.addEventListener('click', ev => {
      ev.stopPropagation();
      this.megaPick[e.dataset.id] = e.dataset.m;
      this.renderSelection();
    }));
    document.querySelectorAll('.fmt-switch button').forEach(b => b.classList.toggle('on', +b.dataset.n === this.format));
    const start = $('#start-btn');
    start.disabled = !full;
    start.textContent = full ? `Start ${this.format}v${this.format} Battle` : `Pick ${this.format - this.selection.length} more`;
    this.applyFilter();
  }

  // Teammate cards appear twice: in the side panel and in the Q switch picker over the arena.
  buildTeam(game) {
    $('#team').innerHTML = '';
    $('#sm-list').innerHTML = '';
    this.mates = [];
    this.menuCards = [];
    const card = (parent, i, key) => {
      const btn = document.createElement('button');
      btn.className = 'mate';
      btn.innerHTML = `${key ? `<span class="k">${i + 1}</span>` : ''}<img alt=""><span class="nm"></span><span class="bar"><i></i></span><span class="ub"><i></i></span><span class="st"></span>`;
      btn.addEventListener('mousedown', e => e.preventDefault());
      btn.addEventListener('click', () => {
        if (game.state === 'fighting') game.pickSwitch(i);
      });
      parent.appendChild(btn);
      return { btn, img: btn.querySelector('img'), nm: btn.querySelector('.nm'), bar: btn.querySelector('.bar i'), ub: btn.querySelector('.ub i'), st: btn.querySelector('.st'), last: '' };
    };
    game.playerTeam.members.forEach((m, i) => {
      this.mates.push(card($('#team'), i, false));
      this.menuCards.push(card($('#sm-list'), i, true));
    });
    this.switchLabel = $('#switch-cd');
    this.menuLabel = $('#sm-cd');
  }

  showSwitchMenu(open) {
    $('#switch-menu').classList.toggle('hidden', !open);
  }

  showSelect() {
    if (this.game?.state === 'select' && this.started) this.rollFoes();
    this.renderSelection();
    this.selectOverlay.classList.remove('hidden');
    this.resultOverlay.classList.add('hidden');
  }

  onStart() {
    this.started = true;
    this.selectOverlay.classList.add('hidden');
    this.resultOverlay.classList.add('hidden');
    this.logEl.innerHTML = '';
  }

  // Four regular moves (⚡ = hold to charge), the ultimate with its meter, and the ability.
  setActive(mon) {
    const box = $('#moves');
    box.innerHTML = '';
    this.moveEls = mon.species.moves.map((id, i) => {
      const m = MOVES[id];
      const [c1, c2] = TYPE_COLORS[m.type];
      const btn = document.createElement('button');
      btn.className = 'move';
      btn.style.setProperty('--c1', c1);
      btn.style.setProperty('--c2', c2);
      btn.innerHTML = `<span class="key">${i + 1}</span>
        <span class="info"><span class="name">${m.name}${m.chargeable ? ' <em class="hold">⚡ HOLD</em>' : ''}</span><span class="meta">${m.cat === 'status' ? CAT.status : `${CAT[m.cat]} · ${m.power}`} · ${esc(m.tag)}</span></span>
        <span class="type">${m.type.toUpperCase()}</span><span class="cd"></span><span class="cdt"></span>`;
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        this.game.playerPress(i);
      });
      btn.addEventListener('mouseup', () => this.game.playerRelease(i));
      btn.addEventListener('mouseleave', () => this.game.playerRelease(i));
      btn.addEventListener('touchstart', e => {
        e.preventDefault();
        this.game.playerPress(i);
      }, { passive: false });
      btn.addEventListener('touchend', () => this.game.playerRelease(i));
      box.appendChild(btn);
      return { btn, id, cd: btn.querySelector('.cd'), cdt: btn.querySelector('.cdt'), meta: btn.querySelector('.meta'), last: '' };
    });
    const ult = MOVES[mon.species.ultimate];
    this.ult.name.textContent = ult.name;
    this.ult.meta.textContent = `Ultimate · ${ult.type.toUpperCase()} · charge the meter by fighting`;
    this.ult.last = '';
    this.abilityLast = '';
  }

  showResult(win, winner) {
    const who = winner ? `<img class="win-mon" src="${winner.portrait.src}" alt="">${winner.species.name} wins the battle for ${winner.trainer.name}!` : '';
    this.resultText.innerHTML = win
      ? `<b class="win">Victory!</b>${who}<br>Gold is out of usable Pokémon.`
      : `<b class="lose">Defeat…</b>${who}<br>All of your Pokémon fainted.`;
    this.resultOverlay.classList.remove('hidden');
  }

  log(text, side = '') {
    const el = document.createElement('div');
    el.className = `entry ${side}`;
    el.textContent = text;
    this.logEl.prepend(el);
    while (this.logEl.children.length > 7) this.logEl.lastChild.remove();
  }

  flashButton(el, ok) {
    if (!el) return;
    el.classList.remove('flash', 'denied');
    void el.offsetWidth;
    el.classList.add(ok ? 'flash' : 'denied');
  }

  pressed(i, ok) {
    this.flashButton(this.moveEls[i]?.btn, ok);
  }

  pressedUlt(ok) {
    this.flashButton(this.ult?.btn, ok);
  }

  ultReady() {
    this.ult.btn.classList.remove('ready-pop');
    void this.ult.btn.offsetWidth;
    this.ult.btn.classList.add('ready-pop');
  }

  update(game) {
    if (document.body.dataset.state !== game.state) document.body.dataset.state = game.state;
    this.touch?.update();
    if (game.state === 'select' || game.state === 'menu') return;
    const p = game.player;
    const locked = game.state !== 'fighting' || p.frozen > 0 || !p.alive || game.switching;
    for (const m of this.moveEls) {
      // Copy shows which move it would take right now.
      if (MOVES[m.id].copy) {
        const src = MOVES[game.lastUsed?.[p.foe?.side]];
        const text = src ? `Copy → ${src.name} (${src.type})` : 'Nothing to copy yet — wait for the foe to attack';
        if (m.meta.textContent !== text) m.meta.textContent = text;
      }
      const cd = game.moveCD(p, m.id), charging = p.charging?.id === m.id;
      const key = `${locked ? 1 : 0}|${Math.ceil(cd * 10)}|${charging ? Math.floor(p.charging.t * 10) : -1}`;
      if (key === m.last) continue;
      m.last = key;
      m.cd.style.height = `${(cd / MOVES[m.id].cooldown) * 100}%`;
      m.cdt.textContent = charging ? `CHARGE ${Math.min(100, Math.round((p.charging.t / 1.2) * 100))}%` : cd > 0 ? `${cd.toFixed(1)}s` : '';
      m.btn.classList.toggle('cooling', cd > 0);
      m.btn.classList.toggle('charging', charging);
      m.btn.classList.toggle('locked', locked);
    }

    const ult = Math.floor(p.ult), ukey = `${locked ? 1 : 0}|${ult}`;
    if (ukey !== this.ult.last) {
      this.ult.last = ukey;
      this.ult.cd.style.height = `${100 - ult}%`;
      this.ult.cdt.textContent = ult >= 100 ? 'READY!' : `${ult}%`;
      this.ult.btn.classList.toggle('cooling', ult < 100);
      this.ult.btn.classList.toggle('full', ult >= 100);
      this.ult.btn.classList.toggle('locked', locked);
    }

    const ab = p.species.ability, abKey = `${p.species.id}|${ab}`;
    if (abKey !== this.abilityLast) {
      this.abilityLast = abKey;
      const a = ABILITIES[ab];
      this.abilityBox.innerHTML = `<b>${a.name}</b><span>${esc(a.desc)}</span>`;
    }

    const used = game.playerTeam.megaUsed, megas = p.species.mega ?? [];
    const mega = !megas.length && !p.isMega ? 'hidden' : used || p.isMega ? 'used' : !locked && !game.cinematic ? 'ready' : 'locked';
    const megaKey = `${mega}|${p.species.id}|${p.megaChoice}`;
    if (megaKey !== this.megaState) {
      this.megaState = megaKey;
      this.megaBtn.className = `mega-btn ${mega}`;
      const target = megas.length ? SPECIES[megas.includes(p.megaChoice) ? p.megaChoice : megas[0]] : null;
      this.megaBtn.querySelector('.meta').textContent = mega === 'hidden' ? ''
        : p.isMega ? `${p.baseSpecies.name} has Mega Evolved · ${ABILITIES[p.species.ability].name}`
        : used ? 'Already used this battle (one per team)'
        : `Once per battle · becomes ${target.name} (${ABILITIES[target.ability].name})`;
    }

    const cd = Math.ceil(game.switchCD);
    const canSwitch = game.state === 'fighting' && !game.switching && cd <= 0;
    game.playerTeam.members.forEach((m, i) => {
      const active = i === game.playerTeam.index;
      const status = active ? 'ACTIVE' : !m.alive ? 'FAINTED' : cd > 0 ? `${cd}s` : canSwitch ? 'SWITCH' : '—';
      const key = `${m.portrait.src}|${Math.ceil(m.hp)}|${status}|${Math.floor(m.ult)}`;
      for (const el of [this.mates[i], this.menuCards[i]]) {
        if (key === el.last) continue;
        el.last = key;
        el.img.src = m.portrait.src;
        el.nm.textContent = m.species.name.replace('Mega ', 'M. ');
        const r = m.hp / m.maxHp;
        el.bar.style.width = `${r * 100}%`;
        el.bar.style.background = hpColor(r);
        el.ub.style.width = `${Math.min(100, m.ult)}%`;
        el.st.textContent = status;
        el.btn.className = `mate ${active ? 'active' : !m.alive ? 'fainted' : status === 'SWITCH' ? 'ready' : 'cooling'}`;
      }
    });
    this.menuLabel.textContent = cd > 0 ? `ready in ${cd}s` : '';
    const label = cd > 0 ? `Switch ready in ${cd}s` : canSwitch ? 'Switch ready · Q' : 'Switching…';
    if (this.switchLabel.textContent !== label) {
      this.switchLabel.textContent = label;
      this.switchLabel.classList.toggle('ready', cd <= 0 && canSwitch);
    }
  }
}
