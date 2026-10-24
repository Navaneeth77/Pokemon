import { readMastery, level, MASTERY_THRESHOLDS, BADGES, earnedBadges, profileStats, setTitle } from './mastery.js';
import { MOVES } from './moves.js';
import { ARENAS } from './arena.js';
import { BOSSES, BossEncounter, RAID_DIFFICULTY } from './bosses.js';
import { HIT_REACTIONS } from './reactions.js';
import { SPECIES } from './data/species.js';
import { QUALITY, setQuality, qualityName } from './quality.js';
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const portrait = id => `/sprites/${SPECIES[id].sprite}/portrait.png`;
export class ExpansionUI {
  constructor(flow) { this.flow = flow; this.mm = flow.mm; this.timer = null; }
  open(title, html) {
    this.close(false);
    this.el = document.createElement('div'); this.el.className = 'mm-overlay expansion-overlay';
    this.el.innerHTML = `<section class="mm-card expansion-card"><button class="exp-close px-btn" aria-label="Close">✕</button><h2>${title}</h2>${html}</section>`;
    document.body.append(this.el);
    this.el.addEventListener('keydown', e=>{e.stopPropagation();if(e.key==='Escape')this.close();});
    this.el.querySelector('.exp-close').focus();
    this.el.querySelector('.exp-close').onclick = () => this.close();
    return this.el;
  }
  close(cancel = true) {
    clearInterval(this.timer); this.el?.remove(); this.el = null;
    if(cancel && this.raidPending) {this.mm.send({t:'raid-cancel'});this.mm.cancel();this.mm.state='idle';this.raidPending=false;}
    if (cancel && this.drafting) { this.mm.send({ t: 'draft-cancel' }); this.mm.cancel(); this.mm.state = 'idle'; this.drafting = false; }
  }
  // Raid setup: boss, difficulty, team size and how to play (solo, online partner, private room).
  raids() {
    const save = this.flow.save, pick = { difficulty: save.raidDifficulty ?? 'normal', size: save.raidSize ?? 3, kind: 'solo' };
    const seg = (key, options) => `<div class="exp-seg" data-seg="${key}">${options.map(([v, label]) => `<button class="px-btn small${String(pick[key]) === String(v) ? ' primary' : ''}" data-v="${v}">${label}</button>`).join('')}</div>`;
    const el = this.open('LEGENDARY RAIDS', `<p>Four stages as its HP falls · telegraphed attacks that break the arena · strike while it's staggered<br>A faint sends out your next teammate; no revives. In co-op, the raid goes on while either of you can fight.</p>
      <div class="raid-bosses">${Object.entries(BOSSES).map(([id, b]) => `<button class="raid-boss" data-boss="${id}" style="--accent:${b.color}"><img src="${portrait(id)}" alt=""><b>${b.name}</b><small>${b.title}</small><i>${b.stages.join(' → ')}</i></button>`).join('')}</div>
      <div class="raid-opts"><span>DIFFICULTY</span>${seg('difficulty', Object.entries(RAID_DIFFICULTY).map(([k, d]) => [k, d.label]))}
      <span>TEAM</span>${seg('size', [[3, '3 POKÉMON'], [6, '6 POKÉMON']])}
      <span>PLAY</span>${seg('kind', [['solo', 'SOLO'], ['public', 'ONLINE PARTNER'], ['private', 'CREATE ROOM'], ['join', 'JOIN ROOM']])}</div>
      <input class="raid-code hidden" data-code maxlength="6" placeholder="ROOM CODE" aria-label="Raid room code" autocomplete="off" spellcheck="false">
      <p class="exp-status">${this.diffNote(pick.difficulty)}</p>`);
    const status = el.querySelector('.exp-status'), code = el.querySelector('[data-code]');
    el.querySelectorAll('[data-seg]').forEach(box => box.querySelectorAll('button').forEach(btn => btn.onclick = () => {
      const key = box.dataset.seg;
      pick[key] = key === 'size' ? +btn.dataset.v : btn.dataset.v;
      for (const o of box.querySelectorAll('button')) o.classList.toggle('primary', o === btn);
      code.classList.toggle('hidden', pick.kind !== 'join');
      status.textContent = pick.kind === 'join' ? 'Enter the code your friend sees, then pick the same boss.' : this.diffNote(pick.difficulty);
    }));
    el.querySelectorAll('[data-boss]').forEach(b => b.onclick = () => {
      const setup = { boss: b.dataset.boss, kind: pick.kind, difficulty: pick.difficulty, code: code.value.trim().toUpperCase() };
      if (setup.kind === 'join' && !/^[A-F0-9]{6}$/.test(setup.code)) {
        status.textContent = 'Room codes are 6 characters (letters A–F and digits).';
        return;
      }
      save.raidDifficulty = pick.difficulty;
      save.raidSize = pick.size;
      this.flow.persist();
      this.close(false);
      this.prepareRaid(setup, pick.size);
    });
  }

  // Team select for a raid (the start button enters the raid instead of a normal battle).
  prepareRaid(setup, size) {
    this.flow.enterQueueSelect();
    this.mm.stop();
    const ui = this.flow.ui;
    ui.setQueue(null);
    ui.format = size;
    ui.raidSetup = setup;
    ui.setFormat(size);
    ui.showSelect(0);
    ui.setVersus(BOSSES[setup.boss].name);
    document.body.classList.add('raid-setup');
  }

  retryRaid() {
    if (this.lastRaid) this.prepareRaid({ ...this.lastRaid }, this.flow.ui.format);
    else this.raids();
  }

  // Solo raid result, from this browser's own battle.
  soloRaidResult(win) {
    const g = this.flow.game, enc = g.raid, boss = BOSSES[enc.id], own = Object.values(g.summary?.species.player ?? {});
    const sum = k => Math.round(own.reduce((n, s) => n + (s[k] ?? 0), 0)), t = Math.round(enc.time);
    const title = win ? `<b class="win">${boss.name} defeated!</b>` : '<b class="lose">The raid failed…</b>';
    return `${title}${win ? `${boss.title} falls. ` : 'All of your Pokémon fainted. '}<br><small>${RAID_DIFFICULTY[enc.difficulty].label} · reached stage ${enc.stage}/4 · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</small>
      <table class="lb-table raid-party"><thead><tr><th>Boss damage</th><th>Boss HP left</th><th>Reactions</th><th>Faints</th></tr></thead>
      <tbody><tr class="me"><td>${sum('bossDamage').toLocaleString()}</td><td>${Math.round((enc.boss.hp / enc.boss.maxHp) * 100)}%</td><td>${sum('reactions')}</td><td>${sum('faints')}</td></tr></tbody></table>`;
  }

  diffNote(k) {
    const d = RAID_DIFFICULTY[k];
    return `${d.label}: boss HP ×${d.hp} · damage ×${d.dmg} · ${d.tele > 1 ? 'longer' : d.tele < 1 ? 'shorter' : 'normal'} warnings${d.extra > 0 ? ` · +${d.extra} extra hazards` : ''}`;
  }

  async startRaidTeam(ui) {
    if (ui.loading) return;
    ui.loading = true;
    document.body.classList.remove('raid-setup');
    const g = this.flow.game, setup = ui.raidSetup;
    try {
      if (setup.kind !== 'solo') {
        this.raidPending = true;
        this.mm.state = 'connecting';
        this.open('CONNECTING TO RAID', '<p class="exp-status">Waking the match server…</p>');
        await this.mm.connectReady();
        if (!this.raidPending) return;
        this.mm.state = 'raid';
        this.mm.send({ t: 'raid-queue', ...setup, format: ui.format, team: ui.selection, lead: ui.lead, mega: ui.megaPick });
        return;
      }
      await g.ensureSprites([...ui.selection, setup.boss]);
      Object.assign(g, { selection: [...ui.selection], lead: ui.lead, megaPicks: { ...ui.megaPick }, opponentSelection: [setup.boss], arenaId: BOSSES[setup.boss].arena, online: null, story: null });
      ui.raidSetup = null;
      this.lastRaid = setup;
      g.foeTrainer = { name: BOSSES[setup.boss].name };
      g.start();
      new BossEncounter([g], setup.boss, { difficulty: setup.difficulty });
      // No send-out ceremony: the boss makes its own entrance (see BossEncounter's intro).
      Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
      g.player.hidden = false;
      g.player.appear = 1;
      g.opponent.hidden = false;
      g.gold.hidden = true;
      ui.setLocation(`LEGENDARY RAID · ${BOSSES[setup.boss].name} · ${RAID_DIFFICULTY[setup.difficulty].label}`, ui.format);
    } catch (err) {
      this.open('RAID UNAVAILABLE', '<p class="exp-status"></p>').querySelector('.exp-status').textContent = err.message;
      this.raidPending = false;
      this.mm.state = 'idle';
    } finally {
      ui.loading = false;
    }
  }

  guide() {
    this.open('ELEMENTAL REACTIONS', `<img class="element-crest" src="/art/element-crest.png" alt="Elemental crest"><p>Land two compatible elements within 4 seconds. A reaction consumes the aura. Shields and dodges prevent priming.</p><div class="reaction-grid">${HIT_REACTIONS.map(r => `<article style="--accent:${r.color}"><b>${r.label}</b><span>${r.pair.join(' + ').toUpperCase()}</span><small>${r.cleanse ? 'Clears burn and frost' : r.status ? `Applies ${r.status}, respecting immunity` : r.ground ? 'Clears paralysis and charge' : 'Bonus damage; up to two nearby wet enemies'}</small></article>`).join('')}</div><p>Reaction cooldown: 1.5s. Freeze protection: 6s after thawing. Chains never hit allies. Ground types resist conduction.</p>`);
  }
  // Pokémon Mastery: the trainer profile, badges (choose one as your title), every species you've
  // used with its level and records, and recent matches.
  mastery(selected = null) {
    const data = readMastery(), stats = profileStats(data), earned = new Set(earnedBadges(data).map(b => b.id));
    const rows = Object.entries(data.species).filter(([id]) => SPECIES[id]).sort((a, b) => b[1].xp - a[1].xp);
    const name = id => (id && SPECIES[id] ? SPECIES[id].name : '—');
    const stat = (label, value) => `<div><small>${label}</small><b>${value}</b></div>`;
    const detail = selected && data.species[selected];
    const detailHtml = detail ? (() => {
      const lv = level(detail.xp), next = MASTERY_THRESHOLDS[lv], prev = MASTERY_THRESHOLDS[lv - 1] ?? 0;
      const pct = next ? Math.round(((detail.xp - prev) / (next - prev)) * 100) : 100;
      const found = detail.discovered.map(id => HIT_REACTIONS.find(r => r.id === id)?.label ?? id).join(', ') || 'None yet';
      return `<section class="mastery-detail"><img width="64" src="${portrait(selected)}" alt=""><h3>${name(selected)} · LEVEL ${lv}</h3>
        <div class="mastery-bar"><i style="width:${pct}%"></i></div><p>${detail.xp} XP${next ? ` · ${next - detail.xp} to level ${lv + 1}` : ' · max level'}</p>
        <div class="profile-grid">${stat('Battles', detail.battles)}${stat('Wins', detail.wins)}${stat('Best streak', detail.bestStreak)}${stat('KOs', detail.kos)}${stat('Damage', Math.round(detail.damage).toLocaleString())}${stat('Taken', Math.round(detail.received).toLocaleString())}${stat('Ultimates', detail.ultimates)}${stat('Megas', detail.mega)}${stat('Reactions', detail.reactions)}${stat('Boss damage', Math.round(detail.bossDamage).toLocaleString())}${stat('Raids', detail.raids)}${stat('Drafts won', `${detail.draftWins}/${detail.drafts}`)}</div>
        <p>Reactions discovered: ${found}</p></section>`;
    })() : '';
    const badges = BADGES.map(b => `<button class="badge${earned.has(b.id) ? ' on' : ''}${data.title === b.id ? ' worn' : ''}" data-title="${b.id}" ${earned.has(b.id) ? '' : 'disabled'} title="${b.desc}"><b>${b.name}</b><small>${b.desc}</small></button>`).join('');
    const el = this.open('POKÉMON MASTERY', `<p class="exp-note">Saved in this browser only: clearing browser data or switching devices starts over. Mastery and badges never change battle stats.</p>
      <h3>TRAINER PROFILE</h3>
      <div class="profile-grid">${stat('Battles', stats.battles)}${stat('Win rate', `${stats.rate}%`)}${stat('Wins', stats.wins)}${stat('Best streak', stats.bestStreak)}${stat('Favourite', name(stats.favorite))}${stat('Top mastery', name(stats.top))}${stat('Favourite arena', ARENAS.find(a => a.id === stats.arena)?.name ?? stats.arena ?? '—')}${stat('Reactions', stats.reactions)}${stat('Boss damage', Math.round(stats.bossDamage).toLocaleString())}${stat('Top moves', stats.moves.map(id => MOVES[id]?.name ?? id).join(', ') || '—')}</div>
      <h3>BADGES · ${earned.size}/${BADGES.length}</h3><p class="exp-note">Tap an earned badge to wear it as your title.</p><div class="badge-grid">${badges}</div>
      ${detailHtml}
      <h3>POKÉMON</h3><div class="exp-pool">${rows.map(([id, r]) => `<button data-species="${id}" class="mastery-level-${Math.min(3, level(r.xp))}${id === selected ? ' on' : ''}"><div class="exp-mon"><img src="${portrait(id)}" alt=""><b>${name(id)}</b><small>Level ${level(r.xp)} · ${r.wins}W</small></div></button>`).join('') || '<p>Finish a battle to start your mastery journey.</p>'}</div>
      <h3>RECENT MATCHES</h3>${data.matches.map(m => `<details><summary>${m.result.toUpperCase()} · ${m.mode}${m.raid ? ` · ${BOSSES[m.raid]?.name ?? ''} ${m.difficulty ?? ''}` : ''} · ${m.duration}s · ${m.verified ? 'server verified' : 'this browser'}</summary><p>${Object.entries(m.species).filter(([id]) => SPECIES[id]).map(([id, r]) => `${name(id)}: ${Math.round(r.damage)} damage, ${r.kos} KOs, ${r.reactions} reactions`).join('<br>')}</p></details>`).join('') || '<p>No matches yet.</p>'}`);
    el.querySelectorAll('[data-species]').forEach(b => b.onclick = () => this.mastery(b.dataset.species));
    el.querySelectorAll('[data-title]:not([disabled])').forEach(b => b.onclick = () => {
      setTitle(data.title === b.dataset.title ? null : b.dataset.title);
      this.mastery(selected);
    });
  }

  settings() {
    const el = this.open('EFFECTS QUALITY', `<p>Essential attack warnings and status indicators stay visible at every quality level.</p><div class="exp-options">${Object.entries(QUALITY).map(([k, v]) => `<button class="px-btn ${qualityName() === k ? 'primary' : ''}" data-quality="${k}">${v.label}</button>`).join('')}</div>`);
    el.querySelectorAll('[data-quality]').forEach(b => b.onclick = () => { setQuality(b.dataset.quality); this.flow.game.resize(); this.settings(); });
  }
  drafts() {
    const el = this.open('DRAFT BATTLES', `<p>Unranked online · regular Pokémon · server-controlled choices</p><div class="exp-options"><button class="px-btn primary" data-mode="snake" data-size="3">SNAKE · 3 VS 3</button><button class="px-btn primary" data-mode="snake" data-size="6">SNAKE · 6 VS 6</button><button class="px-btn" data-mode="trade" data-size="6">BLIND TRADE · 6 VS 6</button></div><p>Snake: pick from a shared pool in A–B–B–A order.<br>Trade: choose one Pokémon and give the other to your opponent. Three rounds, simultaneous reveals.</p><p class="exp-status" role="status"></p>`);
    el.querySelectorAll('[data-mode]').forEach(b => b.onclick = async () => {
      if (this.drafting) return;
      this.drafting = true; this.mm.state = 'connecting';
      el.querySelector('.exp-status').textContent = 'Connecting to the match server…';
      try {
        await this.mm.connectReady();
        if (!this.drafting) return;
        this.mm.state = 'draft';
        this.mm.send({ t: 'draft-queue', mode: b.dataset.mode, format: +b.dataset.size });
      } catch { if (this.el) this.el.querySelector('.exp-status').textContent = 'Could not connect. Close and retry; bot battles remain available.'; this.drafting = false; this.mm.state = 'idle'; }
    });
  }
  onMessage(m) {
    if (m.t === 'matched' && this.raidPending) {this.raidPending=false;this.flow.ui.raidSetup=null;this.close(false);return false;}
    if (m.t === 'raid-waiting') {this.open('RAID LOBBY',`<p class="exp-status"></p>`).querySelector('.exp-status').textContent=m.code ? `Room code: ${m.code}. Share with a friend. Expires in 3 minutes.` : 'Waiting for a co-op partner…';return true;}
    if (m.t === 'raid-cancelled') {this.raidPending=false;this.mm.state='idle';this.open('RAID ENDED','<p class="exp-status"></p>').querySelector('.exp-status').textContent=m.message;return true;}
    if (m.t === 'matched' && this.drafting) { this.drafting = false; this.close(false); return false; }
    if (!m.t.startsWith('draft-')) return false;
    if (m.t === 'draft-waiting') { if (this.el) this.el.querySelector('.exp-status').textContent = 'Finding a compatible opponent… Cancel anytime.'; return true; }
    if (m.t === 'draft-cancelled') { this.drafting = false; this.mm.state = 'idle'; this.open('DRAFT ENDED', `<p class="exp-status"></p>`).querySelector('.exp-status').textContent = m.message; return true; }
    if (m.t !== 'draft-state') return true;
    this.drafting = true;
    this.mm.state = 'draft';
    this.draft = m;
    this.renderDraft(m);
    return true;
  }

  // One draft screen for both modes: whose turn it is, the pick order, both teams as they grow (and
  // where each Pokémon came from), the choices, and a countdown that ends in a fair automatic pick.
  renderDraft(m) {
    const mine = m.you, foe = 1 - mine, names = m.names ?? ['PLAYER 1', 'PLAYER 2'], snake = m.mode === 'snake';
    const canPick = m.phase === 'picking' && (snake ? m.turn === mine : !m.chosen);
    const deadline = Date.now() + (m.left ?? Math.max(0, m.deadline - Date.now()));
    const card = (id, origin = '') => `<div class="exp-mon"><img src="${portrait(id)}" alt=""><b>${SPECIES[id].name}</b>${origin ? `<small class="from-${origin}">${origin === 'picked' ? 'own pick' : 'handed over'}</small>` : ''}</div>`;
    const done = m.teams[0].length + m.teams[1].length, total = m.format * 2;
    const order = snake ? `<div class="draft-order">${Array.from({ length: total }, (_, k) => {
      const s = [0, 1, 1, 0][k % 4];
      return `<i class="${s === mine ? 'me' : 'foe'}${k === done && m.phase === 'picking' ? ' now' : ''}${k < done ? ' done' : ''}">${s === mine ? 'YOU' : 'OPP'}</i>`;
    }).join('')}</div>` : '';
    const banner = m.phase === 'confirm' ? 'FINAL TEAMS — CONFIRM TO BATTLE'
      : m.phase === 'reveal' ? 'REVEAL! BOTH CHOICES ARE IN'
      : canPick ? (snake ? 'YOUR PICK' : 'CHOOSE ONE — THE OTHER GOES TO YOUR OPPONENT')
      : snake ? `${esc(names[foe])} IS PICKING…` : 'WAITING FOR YOUR OPPONENT\'S SECRET CHOICE…';
    const left = snake ? `${Math.max(0, m.format - m.teams[mine].length)} picks left for you` : `round ${Math.min(3, m.round + 1)} of 3`;
    const title = snake ? `SNAKE DRAFT · ${m.format} VS ${m.format}` : `BLIND TRADE · ROUND ${Math.min(3, m.round + 1)}/3`;
    const el = this.open(title, `<div class="draft-banner${canPick ? ' go' : ''}">${banner}</div>${order}
      <div class="draft-clock"><i></i><span></span></div><p class="exp-note">${left} · ${snake ? 'picks alternate A–B–B–A so nobody gets two strong picks in a row' : 'you keep one of each pair; the other joins your opponent\'s team'}</p>
      <div class="exp-teams">${[mine, foe].map(s => `<section><h3>${s === mine ? 'YOUR TEAM' : esc(names[foe])} · ${m.teams[s].length}/${m.format}</h3><div class="exp-roster">${m.teams[s].map((id, i) => card(id, snake ? '' : m.origins[s][i])).join('') || '<small>—</small>'}</div></section>`).join('')}</div>
      <div class="exp-pool">${m.pool.map(id => `<button data-pick="${id}" ${canPick ? '' : 'disabled'}>${card(id)}</button>`).join('')}</div>
      ${m.phase === 'confirm' ? `<button class="px-btn primary" data-confirm ${m.confirmed[mine] ? 'disabled' : ''}>${m.confirmed[mine] ? 'CONFIRMED — WAITING' : 'CONFIRM TEAM'}</button>` : ''}`);
    el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
      for (const o of el.querySelectorAll('[data-pick]')) o.disabled = true;
      this.mm.send({ t: 'draft-pick', id: m.id, species: b.dataset.pick });
    });
    el.querySelector('[data-confirm]')?.addEventListener('click', () => this.mm.send({ t: 'draft-confirm', id: m.id }));
    const span = (m.phase === 'reveal' ? 3500 : 25000), bar = el.querySelector('.draft-clock i'), txt = el.querySelector('.draft-clock span');
    const tick = () => {
      const ms = Math.max(0, deadline - Date.now());
      bar.style.width = `${Math.min(100, (ms / span) * 100)}%`;
      bar.classList.toggle('low', ms < 6000 && m.phase === 'picking');
      txt.textContent = m.phase === 'reveal' ? 'next round soon' : `${Math.ceil(ms / 1000)}s${m.phase === 'picking' ? ' · then an automatic legal pick' : ' · then the battle starts'}`;
    };
    tick();
    this.timer = setInterval(tick, 200);
  }
}
