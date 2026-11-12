import { summaryHtml } from './results.js';
import { resultSummary, saveSummary } from './mastery.js';
import { MOVES } from './moves.js';
import { TYPE_COLORS } from './data/types.js';
import { SPECIES, ROSTER, isPlayable, normalizeTeam, OPPONENT_TEAM, CLASS_LABEL } from './data/species.js';

const CAT = { physical: 'Physical', special: 'Special', status: 'Status' };
import { ABILITIES } from './data/abilities.js';
import { isMuted, setMuted } from './audio.js';
import { leaderTeam, leaderAi, leaderMega, leaderTrainer } from './leaders.js';
import { ITEMS, ITEM_LIST, TERA_TYPES, cleanKit } from './data/items.js';
import { movePool, isCompetitive, learnGen } from './data/movepool.js';
import { ROLES, STYLES, roleOf, moveStyle, fitsRole } from './roles.js';

// Role badge (roles.js) and a move's style tag, with "+20%" when it suits the Pokémon's role.
const roleBadge = s => { const R = ROLES[roleOf(s)]; return `<b class="role-badge" style="--rc:${R.color}" title="${R.name}: ${R.blurb}">${R.short}</b>`; };
const styleTag = (s, m) => { const st = STYLES[moveStyle(m)]; return st ? `<i class="style-tag" style="--sc:${st.color}">${st.short}</i>${fitsRole(s, m) ? '<i class="fit-tag" title="Suits its role: 20% stronger, recharges 15% faster">+20%</i>' : ''}` : ''; };
const roleLine = s => { const r = roleOf(s), R = ROLES[r]; return `<div class="role-line">${roleBadge(s)} ${R.blurb}. ${R.fits.map(k => STYLES[k].name).join(' and ')} moves are 20% stronger${r === 'support' ? ' (status moves recharge faster)' : ''} and recharge 15% faster.</div>`; };
import { ownsShiny, itemById } from './economy.js';
import { SHINY } from './data/national-dims.js';

const $ = sel => document.querySelector(sel);
const TEAMS_KEY = 'msb.teams';
const KITS_KEY = 'msb.kits'; // each Pokémon's held item, Tera type, chosen moves and shiny switch, by species
const SHINY_SET = new Set(SHINY);
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
    this.selection = []; // nothing is picked for you: the team starts empty
    this.megaPick = {};
    try { this.kits = JSON.parse(localStorage.getItem(KITS_KEY)) ?? {}; } catch { this.kits = {}; }
    this.lead = 0;
    this.filter = 'all';
    this.foes = [...OPPONENT_TEAM];
    this.difficulty = 'medium';
    this.leader = null;
    this.builder = null; // { index, name } while making or editing a saved team (My Teams) // a Gym Leader / Elite Four / Champion to battle instead of a random team
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
        // Online, "again" is a rematch in the same room; after a matchmaking battle it queues again.
        const online = game.flow?.online;
        if (game.online?.server) game.online.again();
        else if (game.raid && !game.raid.externalClock) game.flow.expansion.retryRaid();
        else if (online?.connected) online.toLobby();
        else if (this.online) game.flow?.leaveOnline();
        else game.toSelect();
      });
    }
    $('#leave-btn').addEventListener('click', e => {
      e.currentTarget.blur();
      game.flow?.leaveOnline();
    });
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
    if (this.builder) return this.saveBuilder();
    if (this.raidSetup) return this.game.flow.expansion.startRaidTeam(this);
    if (this.survival) return this.survival.begin(this);
    const btn = $('#start-btn');
    this.game.flow?.enterFullscreen();
    if (this.online) {
      // Online: lock in the team; the battle starts once both players are ready.
      this.game.flow.online.ready(this.selection, this.lead, this.megaPick, this.teamKits());
      return;
    }
    if (this.queue) {
      // Matchmaking: queue with this team; the match server finds the opponent.
      const mega = {};
      for (const id of this.selection) if (SPECIES[id].mega?.length) mega[id] = this.megaPick[id] ?? SPECIES[id].mega[0];
      this.game.flow.mm.find({ format: this.tagQueue ? 'tag' : this.format, team: [...this.selection], lead: this.lead, mega, kit: this.teamKits() });
      return;
    }
    this.loading = true;
    btn.disabled = true;
    btn.textContent = 'Loading…';
    try {
      this.game.kits = this.teamKits();
      await this.game.ensureSprites([...this.selection, ...this.foes]);
      this.game.selection = [...this.selection];
      this.game.opponentSelection = [...this.foes];
      this.game.difficulty = this.difficulty;
      const L = this.leader;
      this.game.aiConfig = this.story?.aiConfig ?? (L ? leaderAi(L, this.difficulty) : null); // later leaders play sharper
      this.game.story = this.story;
      this.game.foeCanMega = this.story ? this.story.mega : L ? leaderMega(L, this.difficulty) : true;
      this.game.foeTrainer = L ? leaderTrainer(L) : null;
      if (this.story) (this.story.remember ?? (t => this.game.flow.story.rememberTeam(t)))(this.selection);
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
      btn.style.setProperty('--t', TYPE_COLORS[s.types[0]][0]);
      btn.title = `${s.name} · ${s.types.join(' / ')}${s.mega?.length ? ' · can Mega Evolve' : ''}`;
      btn.innerHTML = `<span class="no"></span>${s.mega?.length ? '<span class="mg">M</span>' : ''}`
        + `<span class="pic"><img loading="lazy" src="${portrait(s)}" alt=""></span><span class="nm">${s.name}</span>`;
      btn.addEventListener('click', () => {
        this.toggle(id);
        this.showInfo(id);
      });
      btn.addEventListener('mouseenter', () => this.showInfo(id));
      box.appendChild(btn);
      const text = s.name.toLowerCase(); // search matches Pokémon names only
      this.cards.push({ id, btn, no: btn.querySelector('.no'), species: s, text });
    }
    const search = $('#roster-search');
    search.addEventListener('input', e => {
      this.query = e.target.value.trim().toLowerCase();
      this.applyFilter();
    });
    search.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const hit = this.cards.find(c => !c.btn.hidden && !this.selection.includes(c.id));
      if (!hit || !this.query) return;
      this.toggle(hit.id);
      this.showInfo(hit.id);
      search.value = '';
      this.query = '';
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
        this.renderSelection(); // a Gym Leader's team depends on the difficulty
      });
    }
    $('.sel-back').addEventListener('click', e => {
      e.currentTarget.blur();
      if (this.builder) this.game.flow?.showTeams();
      else this.game.flow?.toTitle();
    });
    // Switch between 3v3 and 6v6 right here as well.
    const fmtSwitch = document.createElement('div');
    fmtSwitch.className = 'fmt-switch';
    fmtSwitch.innerHTML = '<button data-n="3" title="3 VS 3">3v3</button><button data-n="6" title="6 VS 6">6v6</button>'
      + '<button data-n="3" data-tag title="2v2 Tag Battle: you and a partner bring three Pokémon each" class="tag-fmt">2v2 TAG</button>';
    fmtSwitch.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const n = +b.dataset.n, flow = this.game.flow;
      this.tagQueue = 'tag' in b.dataset;
      if (flow) {
        flow.format = n;
        flow.save.format = n;
        flow.persist();
      }
      this.setFormat(n);
      this.renderSelection();
    }));
    const actions = document.createElement('div');
    actions.className = 'team-actions';
    actions.innerHTML = '<button class="mini-btn" data-t="teams" title="Save this team, or load one you saved">★ Teams</button>'
      + '<button class="mini-btn" data-t="random" title="Fill the empty slots with random Pokémon (from the ones shown)">Random</button>'
      + '<button class="mini-btn" data-t="clear" title="Remove every Pokémon from your team">Clear</button>';
    actions.querySelector('[data-t="random"]').addEventListener('click', e => {
      e.currentTarget.blur();
      this.fillRandom();
    });
    actions.querySelector('[data-t="clear"]').addEventListener('click', e => {
      e.currentTarget.blur();
      this.clearTeam();
    });
    actions.querySelector('[data-t="teams"]').addEventListener('click', e => {
      e.currentTarget.blur();
      this.toggleTeams();
    });
    $('.dock-top').append(actions, fmtSwitch);
    const ar = document.createElement('button');
    ar.className = 'mini-btn format-link';
    ar.textContent = 'Arena ▸';
    ar.title = 'Change the arena';
    ar.addEventListener('click', () => this.game.flow?.showArena());
    $('.sel-links').append(ar);
    this.rollFoes();
    this.showInfo(this.selection[0]);
    this.renderSelection();
  }

  // The bot fields three random, distinct Pokémon; rolled again for every new battle.
  rollFoes() {
    if(this.raidSetup){this.foes=[this.raidSetup.boss];$('.foe > span').textContent='Legendary boss';$('#foe-team').innerHTML=`<img src="${portrait(SPECIES[this.raidSetup.boss])}" alt="Boss">`;return;}
    if (this.story) {
      // Story: the Gym Leader's (or Elite Four's / Champion's) own team.
      this.foes = [...this.story.foes];
      $('.foe > span').textContent = `${this.story.stage.name}'s team:`;
      $('#foe-team').innerHTML = this.foes.map(id => `<img src="${portrait(SPECIES[id])}" alt="${SPECIES[id].name}" title="${SPECIES[id].name}">`).join('');
      return;
    }
    if (this.leader) {
      this.foes = leaderTeam(this.leader, this.format, this.difficulty);
      this.foeBasis = this.foeKey();
      $('.foe > span').textContent = `${this.leader.name}'s team`;
      $('#foe-team').innerHTML = this.foes.map(id => `<img src="${portrait(SPECIES[id])}" alt="${SPECIES[id].name}" title="${SPECIES[id].name}">`).join('');
      return;
    }
    $('.foe > span').textContent = 'Opponent';
    const special = this.selection.filter(id => SPECIES[id].class !== 'regular').length;
    const pick = (pool, n) => {
      const out = [];
      while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      return out;
    };
    const legends = ROSTER.filter(id => SPECIES[id].class !== 'regular'), regulars = ROSTER.filter(id => SPECIES[id].class === 'regular');
    const strong = Math.min(special, this.format);
    this.foes = [...pick(legends, strong), ...pick(regulars, this.format - strong)].sort(() => Math.random() - 0.5);
    this.foeBasis = this.foeKey();
    $('#foe-team').innerHTML = this.foes.map(id => `<img src="${portrait(SPECIES[id])}" alt="${SPECIES[id].name}" title="${SPECIES[id].name}">`).join('');
  }

  // What the bot's team depends on: re-rolled (or rebuilt for a leader) when this changes.
  foeKey() {
    if (this.leader) return `L|${this.leader.id}|${this.format}|${this.difficulty}`;
    return `${this.format}|${this.selection.filter(id => SPECIES[id].class !== 'regular').length}`;
  }

  // My Teams builder: the team screen saves a team instead of starting a battle.
  setBuilder(info) {
    this.builder = info;
    document.body.classList.toggle('builder', !!info);
    if (!info) {
      if (!this.queue && !this.online && !this.story && !this.leader) this.setVersus('Gold');
      return;
    }
    $('.matchup').innerHTML = `<span class="gold">${info.index == null ? 'NEW TEAM' : 'EDIT TEAM'}</span>`;
    $('.select-card .sub').textContent = 'Pick your Pokémon, tap one to set the lead, then save';
    const bar = $('#online-bar');
    bar.innerHTML = `<label class="tb-name">Team name <input maxlength="18" value="${esc(info.name)}" spellcheck="false" /></label>`;
    bar.querySelector('input').addEventListener('input', e => (info.name = e.target.value));
    this.renderSelection();
  }

  saveBuilder() {
    const b = this.builder, list = this.loadTeams(), name = (b.name ?? '').trim().slice(0, 18) || `Team ${list.length + 1}`;
    const mega = {};
    for (const id of this.selection) if (this.megaPick[id]) mega[id] = this.megaPick[id];
    const entry = { name, format: this.format, team: [...this.selection], lead: this.lead, mega };
    if (b.index != null && list[b.index]) list.splice(b.index, 1);
    const same = list.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
    if (same >= 0) list.splice(same, 1); // one team per name
    list.unshift(entry);
    this.storeTeams(list);
    this.game.flow?.showTeams();
  }

  // Bot Battles: battle this Gym Leader / Elite Four member / Champion (null: a random team).
  setLeader(st) {
    this.leader = st;
    document.body.classList.toggle('vsleader', !!st);
    this.setVersus(st ? st.name : 'Gold');
    $('.select-card .sub').textContent = st ? `${st.where} · ${st.type} type` : 'VS BOT';
    this.foeBasis = null;
  }

  applyFilter() {
    let shown = 0;
    for (const c of this.cards) {
      const s = c.species;
      const ok = !!(this.filter === 'all' || (this.filter === 'mega' ? s.mega?.length : s.class === this.filter))
        && (!this.query || c.text.includes(this.query)) && (!this.story || this.story.pool.has(c.id));
      c.btn.hidden = !ok;
      shown += ok;
    }
    $('#roster-count').textContent = shown < this.cards.length ? `${shown} found` : '';
    $('#roster').classList.toggle('none', !shown);
  }

  showInfo(id) {
    $('#mon-info').innerHTML = id ? this.infoCompact(id) : '<p class="mi-empty">Tap a Pokémon to see its stats and moves, and tap again to remove it.</p>';
    $('#mon-info .mi-edit')?.addEventListener('click', () => this.openKit(id));
  }

  // Team screen: everything needed to pick a Pokémon in a few lines.
  infoCompact(id) {
    const s = SPECIES[id], ab = ABILITIES[s.ability];
    const mv = mid => {
      const m = MOVES[mid];
      return `<li><b style="color:${TYPE_COLORS[m.type][0]}">${m.name}</b>${m.chargeable ? ' <em title="Hold to charge">⚡</em>' : ''}<small>${m.ultimate ? 'ULT' : m.power}</small></li>`;
    };
    const megas = (s.mega ?? []).map(m => SPECIES[m].name).join(' / ');
    return `
      <div class="mi-head"><img src="${portrait(s)}" alt=""><div class="mi-name"><b>${s.name}</b>${s.class !== 'regular' ? ` <span class="cls c-${s.class}">${CLASS_LABEL[s.class]}</span>` : ''}
        <div class="tp">${typeChips(s.types)}</div></div>
        <div class="mi-stats"><span>HP<b>${s.hp}</b></span><span>SPD<b>${s.speed}</b></span><span>ATK<b>${Math.round(s.atk * 100)}</b></span><span>DEF<b>${Math.round(s.def * 100)}</b></span></div></div>
      ${roleLine(s)}
      <div class="abil"><u>${ab.name}</u> — ${esc(ab.desc)}</div>
      <ul class="mi-moves">${this.movesOf(id).map(mv).join('')}${mv(s.ultimate)}</ul><button class="mi-edit">✎ EDIT MOVES · item · Tera</button>${megas ? `<div class="mega-line">Mega Evolves into <u>${megas}</u></div>` : ''}`;
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
      <div class="stats">${stat('HP', s.hp, 1900)}${stat('SPD', s.speed, 130)}${stat('ATK', Math.round(s.atk * 100), 150)}${stat('DEF', Math.round(s.def * 100), 140)}${stat('SP.ATK', Math.round((s.spa??s.atk)*100),180)}${stat('SP.DEF', Math.round((s.spdef??s.def)*100),180)}</div>
      <div class="abil"><u>${ab.name}</u> — ${esc(ab.desc)}</div>
      <ul class="mv">${this.movesOf(id).map(moveLine).join('')}${moveLine(s.ultimate)}</ul>${megas}`;
  }

  // The team can't change once READY is pressed (friend room) or while searching for a match.
  get teamLocked() {
    return !!(this.online?.locked || (this.queue && this.game.flow?.mm.busy));
  }

  toggle(id) {
    if (this.teamLocked) return;
    if (this.story && !this.story.pool.has(id)) return; // story: only Pokémon found so far
    const i = this.selection.indexOf(id);
    if (i >= 0) return this.removeAt(i);
    if (this.selection.length >= this.format) {
      // Full team: say so instead of ignoring the tap.
      const box = $('#team-summary');
      box.classList.remove('nope');
      void box.offsetWidth;
      box.classList.add('nope');
      $('#team-count').innerHTML = `YOUR TEAM <i class="warn">full · remove one first</i>`;
      return;
    }
    this.selection.push(id);
    this.renderSelection();
  }

  removeAt(i) {
    if (this.teamLocked || !this.selection[i]) return;
    this.selection.splice(i, 1);
    if (i < this.lead) this.lead--;
    else if (i === this.lead) this.lead = 0;
    this.renderSelection();
  }

  // ── Kits: held item, Tera type and shiny colours (bought in the Trainer Guild shop), per species ──
  ownsShiny(id) {
    return SHINY_SET.has(id) && ownsShiny(this.game?.flow?.economy?.wallet, id);
  }

  kitOf(id) {
    return cleanKit(SPECIES[id], this.kits[id], sid => this.ownsShiny(sid));
  }

  // The four moves this Pokémon brings: the ones picked in its kit, else its defaults.
  movesOf(id) {
    return this.kitOf(id).moves ?? SPECIES[id].moves;
  }

  teamKits(ids = this.selection) {
    return Object.fromEntries(ids.map(id => [id, this.kitOf(id)]));
  }

  setKit(id, patch) {
    this.kits[id] = { ...this.kitOf(id), ...patch };
    try { localStorage.setItem(KITS_KEY, JSON.stringify(this.kits)); } catch { /* storage full or blocked */ }
    this.renderSelection();
  }

  // The kit editor: one Pokémon's ability (official), held item, Tera type and shiny switch.
  openKit(id) {
    document.querySelector('.kit-overlay')?.remove();
    const s = SPECIES[id], ab = ABILITIES[s.ability], overlay = document.createElement('div');
    overlay.className = 'kit-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', `${s.name}'s kit`);
    // Moves: your four sit pinned at the top, each with an ✕ to take it out; tap a move in the list to add it to the
    // first empty slot (tap it again to take it out). Keys 1–4 follow the slots.
    const byName = (a, b) => MOVES[a].name.localeCompare(MOVES[b].name), CAT = { physical: 'PHYS', special: 'SPEC', status: 'STATUS' };
    const pool = [...movePool(s)].sort((a, b) => fitsRole(s, MOVES[b]) - fitsRole(s, MOVES[a]) || byName(a, b)), gen = learnGen(id);
    let query = '';
    const meta = m => `${CAT[m.cat] ?? ''}${m.cat === 'status' ? '' : ` ${m.power}`} · ${m.sure || m.acc == null ? '—' : `${m.acc}%`}`;
    let draft = [...(this.kitOf(id).moves ?? s.moves)], msg = '';
    const saveMoves = () => this.setKit(id, { moves: draft.filter(Boolean) });
    const poolBtn = mid => {
      const m = MOVES[mid], on = draft.includes(mid), full = draft.filter(Boolean).length >= 4;
      return `<button data-mv="${mid}" data-q="${esc(`${m.name} ${m.type} ${m.cat}`.toLowerCase())}" class="${on ? 'on' : full ? 'full' : ''}" style="--tc:${TYPE_COLORS[m.type][0]}" title="${esc(m.tag ?? '')}">`
        + `<span class="kp-text"><b>${m.name}${isCompetitive(s, mid) ? '<i class="kp-star" title="Used in competitive sets">★</i>' : ''}</b><small>${styleTag(s, m)} ${m.type.toUpperCase()} · ${meta(m)}</small><span>${esc(m.tag ?? '')}</span></span>`
        + `<em class="kp-act">${on ? '✓' : '+'}</em></button>`;
    };
    const slotHtml = (mid, i) => mid
      ? `<div class="km-slot" style="--tc:${TYPE_COLORS[MOVES[mid].type][0]}"><i>${i + 1}</i><span><b>${MOVES[mid].name}</b><small>${styleTag(s, MOVES[mid])} ${meta(MOVES[mid])}</small></span><button class="km-x" data-rm="${i}" aria-label="Remove ${esc(MOVES[mid].name)}">✕</button></div>`
      : `<div class="km-slot empty"><i>${i + 1}</i><span><b>Empty</b><small>tap a move below to add it</small></span></div>`;
    const draw = () => {
      const panel = overlay.querySelector('.kit-panel'), scroll = panel?.scrollTop ?? 0, focusSearch = document.activeElement?.classList.contains('kp-search');
      const k = this.kitOf(id), owned = this.ownsShiny(id), price = itemById(`shiny-${id}`)?.price, n = draft.filter(Boolean).length;
      const attacks = pool.filter(m => MOVES[m].cat !== 'status'), status = pool.filter(m => MOVES[m].cat === 'status');
      const changed = String(draft) !== String(s.moves);
      overlay.innerHTML = `<section class="kit-panel">
        <header><img src="${portrait(s)}" alt=""><div><h2>${s.name}</h2><p><b>${esc(ab?.name ?? '')}</b> · ${esc(ab?.desc ?? '')}</p></div><button class="kit-x" aria-label="Close">×</button></header>
        ${roleLine(s)}
        <div class="km-pin">
          <h3>MOVES <b class="km-count${n < 4 ? ' short' : ''}">${n}/4</b><small>Tap ✕ to remove a move. Tap a move in the list to add it.</small></h3>
          <div class="km-slots">${draft.map(slotHtml).join('')}</div>
          ${msg ? `<p class="km-msg">${msg}</p>` : n < 4 ? '<p class="km-msg soft">Any slot left empty gets one of its default moves in battle.</p>' : ''}
          ${changed ? '<button class="kit-reset" data-reset>↺ Back to its default moves</button>' : ''}
        </div>
        <h4 class="kit-sub">ALL ${pool.length} MOVES IT CAN LEARN <small>${gen === 9 ? 'Scarlet/Violet' : `Gen ${gen} games`} · ★ = used in competitive sets</small></h4>
        <input class="kp-search" type="search" placeholder="Search moves: name, type or physical/special/status" value="${esc(query)}" aria-label="Search moves">
        <h4 class="kit-sub" data-group-head="atk">ATTACKS · <span>${attacks.length}</span></h4>
        <div class="kit-pool" data-group="atk">${attacks.map(poolBtn).join('')}</div>
        ${status.length ? `<h4 class="kit-sub" data-group-head="st">STATUS MOVES · <span>${status.length}</span></h4><div class="kit-pool" data-group="st">${status.map(poolBtn).join('')}</div>` : ''}
        <p class="kit-note kp-none" hidden>No move matches that.</p>
        <p class="kit-note">Mega forms keep these moves. Its ultimate (${MOVES[s.ultimate]?.name ?? '—'}) stays the same.</p>
        <h3>HELD ITEM <small>${k.item ? esc(ITEMS[k.item].desc) : 'Holds nothing.'}</small></h3>
        <div class="kit-items"><button data-item="" class="${k.item ? '' : 'on'}">None</button>${ITEM_LIST.map(i => `<button data-item="${i}" class="${k.item === i ? 'on' : ''}" title="${esc(ITEMS[i].desc)}">${ITEMS[i].name}</button>`).join('')}</div>
        <h3>TERA TYPE <small>Press M in battle to Terastallize (once per battle, instead of a Mega Evolution).</small></h3>
        <div class="kit-tera">${TERA_TYPES.map(t => `<button data-tera="${t}" class="${k.tera === t ? 'on' : ''}" style="--tc:${TYPE_COLORS[t][0]}">${t}</button>`).join('')}</div>
        <h3>SHINY</h3>
        ${!SHINY_SET.has(id) ? '<p class="kit-note">No shiny colours exist for this Pokémon yet.</p>'
          : owned ? `<button class="kit-shiny ${k.shiny ? 'on' : ''}" data-shiny>✦ ${k.shiny ? 'SHINY ON' : 'SHINY OFF'}</button>`
          : `<p class="kit-note">Buy Shiny ${s.name} in the Trainer Guild shop (${price} Chaos Coins), then switch it on here.</p>`}
      </section>`;
      overlay.querySelector('.kit-panel').scrollTop = scroll;
      // Search filters the list in place (no redraw, so typing keeps going).
      const search = overlay.querySelector('.kp-search'), filter = () => {
        const q = query.trim().toLowerCase();
        let shown = 0;
        for (const g of overlay.querySelectorAll('[data-group]')) {
          let n = 0;
          for (const b of g.querySelectorAll('[data-mv]')) { const ok = !q || b.dataset.q.includes(q); b.hidden = !ok; n += ok; }
          const head = overlay.querySelector(`[data-group-head="${g.dataset.group}"]`);
          head.hidden = g.hidden = !n;
          head.querySelector('span').textContent = n;
          shown += n;
        }
        overlay.querySelector('.kp-none').hidden = !!shown;
      };
      search.addEventListener('input', () => { query = search.value; filter(); });
      search.addEventListener('keydown', e => e.key === 'Escape' && query && (e.stopPropagation(), (search.value = query = ''), filter()));
      filter();
      if (focusSearch) { search.focus(); search.setSelectionRange(query.length, query.length); }
      overlay.querySelector('.kit-x').onclick = () => overlay.remove();
      overlay.querySelectorAll('[data-rm]').forEach(b => (b.onclick = () => { draft[+b.dataset.rm] = null; msg = ''; saveMoves(); draw(); }));
      overlay.querySelectorAll('[data-mv]').forEach(b => (b.onclick = () => {
        const mid = b.dataset.mv, at = draft.indexOf(mid), free = draft.indexOf(null);
        msg = '';
        if (at >= 0) draft[at] = null;
        else if (free >= 0) draft[free] = mid;
        else msg = `Already 4 moves. Tap ✕ on one to make room for ${MOVES[mid].name}.`;
        if (!msg) saveMoves();
        draw();
      }));
      overlay.querySelector('[data-reset]')?.addEventListener('click', () => { draft = [...s.moves]; msg = ''; this.setKit(id, { moves: null }); draw(); });
      overlay.querySelectorAll('[data-item]').forEach(b => (b.onclick = () => { this.setKit(id, { item: b.dataset.item || null }); draw(); }));
      overlay.querySelectorAll('[data-tera]').forEach(b => (b.onclick = () => { this.setKit(id, { tera: b.dataset.tera }); draw(); }));
      overlay.querySelector('[data-shiny]')?.addEventListener('click', () => { this.setKit(id, { shiny: !k.shiny }); draw(); });
    };
    draw();
    overlay.addEventListener('click', e => e.target === overlay && overlay.remove());
    overlay.addEventListener('keydown', e => e.key === 'Escape' && overlay.remove());
    document.body.appendChild(overlay);
    overlay.querySelector('.kit-x').focus();
  }

  // ── Saved teams: kept in this browser (localStorage), up to 20 ──
  loadTeams() {
    try {
      const list = JSON.parse(localStorage.getItem(TEAMS_KEY));
      if(!Array.isArray(list))return [];
      const clean=list.filter(t=>t&&typeof t.name==='string'&&Array.isArray(t.team)).slice(0,20).map(t=>({...t,team:normalizeTeam(t.team,t.format===6||t.team.length>3?6:3),rosterVersion:1}));
      if(JSON.stringify(clean)!==JSON.stringify(list)){
        if(!localStorage.getItem('msb.teams.pre-final-v1'))localStorage.setItem('msb.teams.pre-final-v1',JSON.stringify(list));
        this.storeTeams(clean);this.rosterMigrated=true;
      }return clean;
    } catch {
      return [];
    }
  }

  storeTeams(list) {
    try { localStorage.setItem(TEAMS_KEY, JSON.stringify(list.slice(0, 20))); } catch { /* storage full or blocked */ }
  }

  toggleTeams(open = !this.teamsOpen) {
    this.teamsOpen = open;
    if (!this.teamsPanel) {
      this.teamsPanel = document.createElement('div');
      this.teamsPanel.className = 'teams-panel';
      $('.select-card').appendChild(this.teamsPanel);
    }
    this.teamsPanel.classList.toggle('hidden', !open);
    if (open) this.renderTeams();
  }

  renderTeams() {
    const list = this.loadTeams(), full = this.selection.length === this.format, left = this.format - this.selection.length;
    const mons = t => t.team.filter(id => SPECIES[id]).map(id => `<img src="${portrait(SPECIES[id])}" alt="${SPECIES[id].name}">`).join('');
    const rows = list.length
      ? list.map((t, k) => `<div class="tp-row"><button class="tp-load" data-k="${k}" title="Load this team"><b>${esc(t.name)}</b><span class="tp-fmt">${t.format}v${t.format}</span><span class="tp-mons">${mons(t)}</span></button>`
        + `<button class="tp-del" data-k="${k}" title="Delete this team" aria-label="Delete">✕</button></div>`).join('')
      : '<p class="tp-empty">No saved teams yet. Pick a team, name it and press Save.</p>';
    this.teamsPanel.innerHTML = `<div class="tp-head"><b>★ SAVED TEAMS</b><button class="tp-close" aria-label="Close">✕</button></div>
      <div class="tp-save"><input class="tp-name" maxlength="18" placeholder="Name this team" value="${esc(this.teamDraft ?? `Team ${list.length + 1}`)}" />
        <button class="mini-btn" data-a="save" ${full ? '' : 'disabled'}>Save current team</button></div>
      ${full ? '' : `<p class="tp-hint">Pick ${left} more Pokémon to save this team.</p>`}
      <div class="tp-list">${rows}</div>`;
    const name = this.teamsPanel.querySelector('.tp-name');
    name.addEventListener('input', () => (this.teamDraft = name.value));
    name.addEventListener('keydown', e => {
      if (e.key === 'Enter' && full) this.saveTeam(name.value);
    });
    this.teamsPanel.querySelector('.tp-close').addEventListener('click', () => this.toggleTeams(false));
    this.teamsPanel.querySelector('[data-a="save"]').addEventListener('click', () => this.saveTeam(name.value));
    this.teamsPanel.querySelectorAll('.tp-load').forEach(b => b.addEventListener('click', () => this.useTeam(list[+b.dataset.k])));
    this.teamsPanel.querySelectorAll('.tp-del').forEach(b => b.addEventListener('click', () => {
      list.splice(+b.dataset.k, 1);
      this.storeTeams(list);
      this.renderTeams();
    }));
  }

  saveTeam(rawName) {
    if (this.selection.length !== this.format) return;
    const list = this.loadTeams(), name = (rawName ?? '').trim().slice(0, 18) || `Team ${list.length + 1}`;
    const mega = {};
    for (const id of this.selection) if (this.megaPick[id]) mega[id] = this.megaPick[id];
    const entry = { name, format: this.format, team: [...this.selection], lead: this.lead, mega };
    const same = list.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
    if (same >= 0) list.splice(same, 1); // saving under an existing name replaces it
    list.unshift(entry);
    this.storeTeams(list);
    this.teamDraft = null;
    this.renderTeams();
  }

  useTeam(t) {
    if (!t || this.teamLocked) return;
    const flow = this.game.flow;
    // A room or a story battle decides the format; otherwise the saved team brings its own.
    if (t.format !== this.format && !this.online && !this.story) {
      if (flow) {
        flow.format = t.format;
        flow.save.format = t.format;
        flow.persist();
      }
      this.setFormat(t.format);
    }
    const ids = t.team.filter(id => SPECIES[id] && (!this.story || this.story.pool.has(id))).slice(0, this.format);
    this.selection = [...new Set(ids)];
    this.lead = Math.max(0, Math.min(t.lead | 0, this.selection.length - 1));
    Object.assign(this.megaPick, t.mega ?? {});
    this.toggleTeams(false);
    this.renderSelection();
    if (this.selection.length) this.showInfo(this.selection[this.lead]);
  }

  clearTeam() {
    if (this.teamLocked) return;
    this.selection = [];
    this.lead = 0;
    this.renderSelection();
  }

  // Fills the empty slots with random Pokémon, from the ones the search and filter show (or anyone).
  fillRandom() {
    if (this.teamLocked) return;
    const shown = this.cards.filter(c => !c.btn.hidden && !this.selection.includes(c.id)).map(c => c.id);
    const pool = shown.length ? shown : ROSTER.filter(id => !this.selection.includes(id) && (!this.story || this.story.pool.has(id)));
    while (this.selection.length < this.format && pool.length) this.selection.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
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
    this.trainerName = name;
    this.trainerBust = bust;
    this.setVersus(this.online?.friend ?? (this.queue ? '???' : this.leader?.name ?? 'Gold'));
  }

  setVersus(foe) {
    const name = esc(this.trainerName ?? 'Red');
    const icon = `<canvas class="pt-icon" width="24" height="24"></canvas>`;
    $('#panel .title').innerHTML = `${icon}${name} <span>vs</span> ${esc(foe)}`;
    if (this.trainerBust) $('#panel .title canvas').getContext('2d').drawImage(this.trainerBust, 0, 0);
    $('.matchup').innerHTML = `<span class="red">${name}</span> <span class="vs">VS</span> <span class="gold">${esc(foe.toUpperCase())}</span>`;
  }

  // Online room state on the team-select screen: null when playing the bot.
  // info: { code, friend, format, arena, locked, friendReady, loading, ping }
  setOnline(info) {
    this.online = info;
    document.body.classList.toggle('online', !!info);
    this.setVersus(info?.friend ?? 'Gold');
    $('.select-card .sub').textContent = info ? `Friend room · ${info.format} vs ${info.format} · ${info.arena}` : 'VS BOT';
    this.renderOnline();
    this.renderSelection();
  }

  // Online matchmaking on the team-select screen (FIND MATCH): null otherwise. info: { record }
  setQueue(info) {
    this.queue = info;
    document.body.classList.toggle('mm', !!info);
    if (!info && !this.online && !this.story) {
      this.setVersus('Gold');
      $('.select-card .sub').textContent = 'VS BOT';
      this.renderOnline();
      return;
    }
    if (!info) return;
    this.setVersus('???');
    $('.select-card .sub').textContent = 'Online battle · random opponent';
    this.renderOnline();
    this.renderSelection();
  }

  lobbyChanged() {
    if (this.queue && this.game?.state === 'select') this.renderOnline();
  }

  queueChanged() {
    if (this.queue && this.game?.state === 'select') {
      this.queue.record = this.game.flow?.mm.record ?? this.queue.record;
      this.renderOnline();
      this.renderSelection();
    }
  }

  // Story battle on the team-select screen: null otherwise.
  // info: { stage, pool (Set of selectable ids), foes, format, difficulty, aiConfig, mega, arena, playerMega }
  setStory(info) {
    this.story = info;
    document.body.classList.toggle('story', !!info);
    this.setVersus(info ? info.stage.name : 'Gold');
    $('.select-card .sub').textContent = info
      ? `${info.back ? 'Story' : 'Kanto Story'} · ${info.stage.where} · ${info.format} vs ${info.format} · ${info.difficulty} — choose from your ${info.pool.size} Pokémon`
      : 'Pick your team · click a team slot to set your lead';
    if (info) this.rollFoes();
    this.renderOnline();
    if (info) this.renderSelection();
  }

  renderOnline() {
    const bar = $('#online-bar'), o = this.online;
    if (this.builder) return; // the builder's name field lives here
    if (this.story && !o) {
      const back = this.story.back;
      bar.innerHTML = `<span class="ob-room">${back ? 'STORY' : 'KANTO'} <b>${esc(this.story.stage.name.toUpperCase())}</b></span><button class="mini-btn" data-a="map">◀ ${back ? 'Story menu' : 'Campaign map'}</button>`;
      bar.querySelector('[data-a="map"]').addEventListener('click', () => (back ? back() : this.game.flow?.story.showMap(this.story.stage.id)));
      return;
    }
    if (this.queue && !o) {
      // Who's online (per format) and the leaderboard, from the match server.
      const mm = this.game.flow?.mm, d = mm?.lobby, me = d?.me;
      const count = f => d.modes[f].browsing + d.modes[f].searching + d.modes[f].battling;
      bar.innerHTML = (d ? `<span class="ob-live" title="${d.modes[3].searching + d.modes[6].searching} searching · ${d.modes[3].battling + d.modes[6].battling} battling">● ${d.online} online</span>`
        + `<span class="ob-mode${this.format === 3 ? ' on' : ''}">3v3 · ${count(3)}</span><span class="ob-mode${this.format === 6 ? ' on' : ''}">6v6 · ${count(6)}</span>` : '<span class="ob-ping">Checking who\'s online…</span>')
        + (me ? `<span class="ob-ping">#${me.rank} · ${me.rating}</span>` : '')
        + '<button class="mini-btn" data-a="lb">🏆 Leaderboard</button><button class="mini-btn" data-a="live">👁 Watch live</button><button class="mini-btn" data-a="friends">👥 Friends</button>';
      bar.querySelector('[data-a="lb"]').addEventListener('click', e => {
        e.currentTarget.blur();
        mm?.showLeaderboard();
      });
      bar.querySelector('[data-a="live"]').addEventListener('click', () => this.game.flow?.social.openLive());
      bar.querySelector('[data-a="friends"]').addEventListener('click', () => this.game.flow?.social.openFriends());
      return;
    }
    if (!o) {
      bar.innerHTML = '';
      return;
    }
    const friend = esc(o.friend);
    const state = o.loading ? 'Loading Pokémon…' : o.friendReady ? `${friend} is READY ✓` : `${friend} is choosing…`;
    bar.innerHTML = `<span class="ob-room">ROOM <b>${esc(o.code ?? '')}</b></span><span class="ob-state${o.friendReady ? ' ok' : ''}">${state}</span>`
      + `<span class="ob-ping">${o.ping != null ? `${o.ping} ms` : ''}</span><button class="mini-btn" data-a="leave">Leave room</button>`;
    bar.querySelector('[data-a="leave"]').addEventListener('click', () => this.game.flow?.leaveOnline());
  }

  // Under each team member: its held item, Tera type and shiny star; tapping any of them opens its kit.
  kitChips(id) {
    const k = this.kitOf(id);
    return `<span class="kit-chips" data-kit="${id}" title="Item, Tera type and shiny">`
      + `<em>${k.item ? esc(ITEMS[k.item].name) : '+ ITEM'}</em><em class="tera" style="--tc:${TYPE_COLORS[k.tera][0]}">${k.tera.slice(0, 3).toUpperCase()}</em>${k.shiny ? '<em class="sh">✦</em>' : ''}</span>`
      + `<span class="edit-moves${k.moves ? ' edited' : ''}" data-kit="${id}" role="button" title="Choose ${esc(SPECIES[id].name)}'s 4 moves">✎ ${k.moves ? 'MOVES ✓' : 'EDIT MOVES'}</span>`;
  }

  renderSelection() {
    if (this.foeBasis !== this.foeKey()) this.rollFoes();
    const full = this.selection.length >= this.format;
    for (const c of this.cards) {
      const k = this.selection.indexOf(c.id);
      c.btn.classList.toggle('sel', k >= 0);
      c.btn.classList.toggle('full', k < 0 && full);
      c.no.textContent = k < 0 ? '' : k === this.lead ? 'LEAD' : String(k + 1);
    }
    const box = $('#team-summary'), left = this.format - this.selection.length;
    box.dataset.n = this.format;
    $('#team-count').innerHTML = `YOUR TEAM <i>${this.selection.length}/${this.format}</i>${left > 0 ? '' : '<i class="lead-hint"> · tap one to lead</i>'}`;
    const locked = this.teamLocked;
    document.querySelectorAll('.team-actions button').forEach(b => {
      b.disabled = locked || (b.dataset.t === 'teams' ? false : b.dataset.t === 'clear' ? !this.selection.length : !left);
    });
    box.innerHTML = Array.from({ length: this.format }, (_, i) => i).map(i => {
      const id = this.selection[i];
      if (!id) return '<div class="slot empty"><span class="plus">+</span></div>';
      const s = SPECIES[id];
      // Pokémon with two Mega forms pick X or Y here, so nothing needs choosing mid-battle.
      const xy = s.mega?.length > 1
        ? `<span class="xy">${s.mega.map((m, k) => `<em data-id="${id}" data-m="${m}" class="${(this.megaPick[id] ?? s.mega[0]) === m ? 'on' : ''}">${'XY'[k]}</em>`).join('')}</span>`
        : '';
      return `<button class="slot${i === this.lead ? ' lead' : ''}" data-i="${i}" title="${i === this.lead ? 'Leads the battle' : 'Tap to lead with this one'}">`
        + `${i === this.lead ? '<b class="lead-tag">LEAD</b>' : ''}<i class="rm" data-rm="${i}" title="Remove ${s.name}">×</i>`
        + `<img src="${portrait(s)}" alt=""><span>${s.name}</span>${roleBadge(s)}${xy}${this.kitChips(id)}</button>`;
    }).join('');
    box.querySelectorAll('button.slot').forEach(b => b.addEventListener('click', () => {
      this.lead = +b.dataset.i;
      this.renderSelection();
    }));
    box.querySelectorAll('.rm').forEach(x => x.addEventListener('click', ev => {
      ev.stopPropagation();
      this.removeAt(+x.dataset.rm);
    }));
    box.querySelectorAll('[data-kit]').forEach(e => e.addEventListener('click', ev => {
      ev.stopPropagation();
      this.openKit(e.dataset.kit);
    }));
    box.querySelectorAll('.xy em').forEach(e => e.addEventListener('click', ev => {
      ev.stopPropagation();
      this.megaPick[e.dataset.id] = e.dataset.m;
      this.renderSelection();
    }));
    document.querySelectorAll('.fmt-switch button').forEach(b => b.classList.toggle('on', +b.dataset.n === this.format && ('tag' in b.dataset) === !!(this.tagQueue && this.queue)));
    const start = $('#start-btn');
    start.disabled = !full;
    start.textContent = full ? `Start ${this.format}v${this.format} battle ▶` : `Pick ${this.format - this.selection.length} more`;
    if (this.raidSetup && full) start.textContent = 'ENTER LEGENDARY RAID ▶';
    if (this.survival && full) start.textContent = 'START SURVIVAL ▶';
    if (this.story && full) start.textContent = `Battle ${this.story.stage.name} ▶`;
    if (this.builder) start.textContent = full ? '✓ Save team' : `Pick ${this.format - this.selection.length} more`;
    if (this.queue) {
      const busy = !!this.game.flow?.mm.busy;
      start.disabled = !full || busy;
      if (full) start.textContent = busy ? 'Searching…' : this.tagQueue ? 'Find 2v2 Tag Battle ▶' : `Find ${this.format}v${this.format} match ▶`;
    }
    if (this.online && full) {
      start.disabled = !!this.online.locked;
      start.textContent = this.online.loading ? 'Loading…' : this.online.locked ? `Waiting for ${this.online.friend}…` : 'READY ▶';
    }
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
    this.moveEls = mon.moves.map((id, i) => {
      const m = MOVES[id];
      const [c1, c2] = TYPE_COLORS[m.type];
      const btn = document.createElement('button');
      btn.className = 'move';
      btn.style.setProperty('--c1', c1);
      btn.style.setProperty('--c2', c2);
      btn.innerHTML = `<span class="key">${i + 1}</span>
        <span class="info"><span class="name">${m.name}${m.chargeable ? ' <em class="hold">⚡ HOLD</em>' : ''} ${styleTag(mon.species, m)}</span><span class="meta">${m.cat === 'status' ? CAT.status : `${CAT[m.cat]} · ${m.power}`} · ${esc(m.tag)}</span></span>
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
    this.game.flow?.economy?.completeLocal(this.game,win);
    if ((!this.game.online || !this.game.online.server) && !this.game.practice) saveSummary(resultSummary(this.game, 'player', {result:win?'win':'loss'}));
    if (this.game.online?.server) {
      // Matchmaking: the match server's verdict, whatever this screen saw.
      this.resultText.innerHTML = this.game.online.resultHtml(winner);
      $('#again-btn').textContent = 'Find New Match';
      $('#again-btn').classList.remove('hidden');
      $('#leave-btn').textContent = 'Main Menu';
      $('#leave-btn').hidden = false;
      this.resultOverlay.classList.remove('hidden');
      return;
    }
    $('#leave-btn').textContent = this.online ? 'Leave room' : 'Main Menu';
    if (this.game.survival) return this.game.flow.survival.onResult(win);
    if (this.game.story) {
      if (this.game.story.onResult) this.game.story.onResult(win, winner);
      else this.game.flow.story.onResult(win, winner);
      return;
    }
    if (this.game.raid && !this.game.raid.externalClock) {
      this.resultText.innerHTML = this.game.flow.expansion.soloRaidResult(win) + summaryHtml(resultSummary(this.game,'player',{result:win?'win':'loss'}));
      $('#again-btn').textContent = 'Raid Again';
      $('#again-btn').classList.remove('hidden');
      $('#leave-btn').hidden = false;
      this.resultOverlay.classList.remove('hidden');
      return;
    }
    const who = winner ? `<img class="win-mon" src="${winner.portrait.src}" alt="">${winner.species.name} wins the battle for ${esc(winner.trainer.name)}!` : '';
    const foe = esc(this.game.gold.name);
    this.resultText.innerHTML = win
      ? `<b class="win">Victory!</b>${who}<br>${foe} is out of usable Pokémon.`
      : `<b class="lose">Defeat…</b>${who}<br>All of your Pokémon fainted.`;
    this.resultText.innerHTML += summaryHtml(resultSummary(this.game,'player',{result:win?'win':'loss'}));
    $('#again-btn').textContent = this.online ? 'Rematch' : 'Restart Battle';
    $('#again-btn').classList.remove('hidden');
    $('#leave-btn').hidden = false;
    this.resultOverlay.classList.remove('hidden');
  }

  // Online: the other player left or the connection dropped.
  showNotice(title, text) {
    this.resultText.innerHTML = `<b class="lose">${esc(title)}</b>${esc(text)}`;
    $('#again-btn').textContent = 'Main Menu';
    $('#again-btn').classList.remove('hidden');
    $('#leave-btn').hidden = true;
    this.selectOverlay.classList.add('hidden');
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
    if (game.state === 'select' || game.state === 'menu' || game.state === 'cutscene') return;
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

    // The M button: Mega Evolution for Pokémon with a Mega form, Terastallization for everyone else.
    const used = game.playerTeam.megaUsed, megas = p.species.mega ?? [], tera = !megas.length && !p.isMega;
    const mega = (tera && !p.teraType && !p.tera) || game.raid || (game.story && !game.story.playerMega) ? 'hidden' : used || p.isMega || p.tera ? 'used' : !locked && !game.cinematic ? 'ready' : 'locked';
    const megaKey = `${mega}|${p.species.id}|${p.megaChoice}|${p.tera}`;
    if (megaKey !== this.megaState) {
      this.megaState = megaKey;
      this.megaBtn.className = `mega-btn ${mega}${tera ? ' tera' : ''}`;
      this.megaBtn.querySelector('.name').textContent = tera ? 'Terastallize' : 'Mega Evolve';
      const target = megas.length ? SPECIES[megas.includes(p.megaChoice) ? p.megaChoice : megas[0]] : null;
      this.megaBtn.querySelector('.meta').textContent = mega === 'hidden' ? ''
        : p.tera ? `${p.species.name} is ${p.tera.toUpperCase()} type now`
        : p.isMega ? `${p.baseSpecies.name} has Mega Evolved · ${ABILITIES[p.species.ability].name}`
        : used ? 'Already used this battle (one per team)'
        : tera ? `Once per battle · becomes pure ${p.teraType.toUpperCase()} type (keeps its own type bonus)`
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
