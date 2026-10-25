import { readMastery, level, MASTERY_THRESHOLDS, BADGES, earnedBadges, profileStats, setTitle, COSMETICS, unlockedCosmetics, equipCosmetic, cosmeticLoadout } from './mastery.js';
import { MOVES } from './moves.js';
import { ARENAS } from './arena.js';
import { BOSSES, BossEncounter, RAID_DIFFICULTY } from './bosses.js';
import { HIT_REACTIONS } from './reactions.js';
import { SPECIES, ROSTER } from './data/species.js';
import { QUALITY, setQuality, qualityName } from './quality.js';
import { music } from './music.js';
import { initAudio, isMuted, setMuted } from './audio.js';
import { preloadRaidArt } from './raid-art.js';
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
    this.where = null;
    clearInterval(this.timer); this.el?.remove(); this.el = null;
    if(cancel && this.raidPending) {this.mm.send({t:'raid-cancel'});this.mm.cancel();this.mm.state='idle';this.raidPending=false;}
    if (cancel && this.drafting) { this.mm.send({ t: 'draft-cancel' }); this.mm.cancel(); this.mm.state = 'idle'; this.drafting = false; }
  }
  // Who is in raids or drafts right now, and which queues already have someone waiting for a partner
  // (public raids by boss, difficulty and team size; drafts by mode, size, ranking and pool).
  lobbyChanged() {
    const l = this.mm.lobby, box = this.where === 'raid' ? l?.raids : this.where === 'draft' ? l?.drafts : null;
    const live = this.el?.querySelector('[data-live]');
    if (!live) return;
    if (!box) {
      live.textContent = l ? '' : 'Checking who is online…';
      return;
    }
    const waiting = Object.entries(box.waiting ?? {});
    const n = box.browsing + box.searching + box.battling + (box.drafting ?? 0);
    const parts = this.where === 'raid'
      ? [`${box.battling} fighting a boss`, `${box.searching} waiting for a partner`, `${box.browsing} choosing`]
      : [`${box.drafting} drafting`, `${box.battling} battling`, `${box.searching} waiting for an opponent`, `${box.browsing} choosing`];
    live.textContent = n ? `● ${n} here now · ${parts.filter(t => !t.startsWith('0 ')).join(' · ')}` : '● Nobody else here right now — start a queue and others will find you.';
    if (this.where === 'raid') {
      for (const tag of this.el.querySelectorAll('[data-wait]')) {
        const mine = waiting.filter(([k]) => k.startsWith(`${tag.dataset.wait}:`)).map(([k, c]) => {
          const [, diff, size] = k.split(':');
          return `${c} waiting · ${RAID_DIFFICULTY[diff]?.label ?? diff} · ${size} Pokémon`;
        });
        tag.textContent = mine.join(' / ');
      }
    } else if (waiting.length) {
      const pool = { regular: 'regular Pokémon', all: 'full roster' };
      live.textContent += ` — waiting: ${waiting.map(([k, c]) => {
        const [mode, size, ranked, roster] = k.split(':');
        return `${c} × ${mode === 'trade' ? 'Blind trade' : 'Snake'} ${size}v${size}, ${ranked}, ${pool[roster] ?? roster}`;
      }).join('; ')}`;
    }
  }

  // Raid setup: boss, difficulty, team size and how to play (solo, online partner, private room).
  raids() {
    const save = this.flow.save, pick = { difficulty: save.raidDifficulty ?? 'normal', size: save.raidSize ?? 3, kind: 'solo' };
    const seg = (key, options) => `<div class="exp-seg" data-seg="${key}">${options.map(([v, label]) => `<button class="px-btn small${String(pick[key]) === String(v) ? ' primary' : ''}" data-v="${v}">${label}</button>`).join('')}</div>`;
    const el = this.open('LEGENDARY RAIDS', `<p>Four stages as its HP falls · telegraphed attacks that break the arena · strike while it's staggered<br>A faint sends out your next teammate; no revives. In co-op, the raid goes on while either of you can fight.</p><p class="exp-live" data-live></p>
      <div class="raid-bosses">${Object.entries(BOSSES).map(([id, b]) => `<button class="raid-boss" data-boss="${id}" style="--accent:${b.color}"><img src="${portrait(id)}" alt=""><b>${b.name}</b><small>${b.title}</small><i>${b.stages.join(' → ')}</i><em class="raid-wait" data-wait="${id}"></em></button>`).join('')}</div>
      <div class="raid-opts"><span>DIFFICULTY</span>${seg('difficulty', Object.entries(RAID_DIFFICULTY).map(([k, d]) => [k, d.label]))}
      <span>TEAM</span>${seg('size', [[3, '3 POKÉMON'], [6, '6 POKÉMON']])}
      <span>PLAY</span>${seg('kind', [['solo', 'SOLO'], ['public', 'ONLINE PARTNER'], ['private', 'CREATE ROOM'], ['join', 'JOIN ROOM']])}</div>
      <input class="raid-code hidden" data-code maxlength="6" placeholder="ROOM CODE" aria-label="Raid room code" autocomplete="off" spellcheck="false">
      <p class="exp-status">${this.diffNote(pick.difficulty)}</p>`);
    this.where = 'raid';
    this.lobbyChanged();
    this.mm.pollLobby(true);
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
        if(!this.mm.features?.includes('raids')) throw new Error('The match server needs the expansion update. Solo raids are available.');
        this.mm.state = 'raid';
        this.mm.send({ t: 'raid-queue', ...setup, format: ui.format, team: ui.selection, lead: ui.lead, mega: ui.megaPick });
        return;
      }
      await Promise.all([g.ensureSprites([...ui.selection, setup.boss], setup.boss), preloadRaidArt(setup.boss)]);
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
  replay(match) {
    if (!match) return;
    const events = (match.events ?? []).slice(0, 600);
    const duration = Math.max(1, match.duration ?? 0, events.at(-1)?.t ?? 0);
    const el = this.open('EVENT REPLAY', `<p>Recorded combat events · ${match.verified ? 'server verified' : 'local battle'}. This is a timeline, not deterministic battle playback. Replays never award XP.</p>
      <button class="px-btn" data-play>PLAY</button><button class="px-btn" data-back>BACK TO MASTERY</button>
      <label>Time <output>0.0s</output><input aria-label="Replay time" type="range" min="0" max="${duration}" step="0.1" value="0"></label>
      <ol class="replay-events"></ol>${match.droppedEvents ? '<p>Event limit reached: the first 600 events are available.</p>' : ''}`);
    const slider = el.querySelector('input'), output = el.querySelector('output'), list = el.querySelector('ol'), play = el.querySelector('[data-play]');
    let playing = false, last = -1;
    const draw = () => {
      const t = +slider.value; output.textContent = `${t.toFixed(1)}s / ${duration}s`;
      const shown = events.filter(e => e.t <= t).slice(-40);
      const n = shown.at(-1)?.n ?? -1;
      if (n === last) return; last = n;
      list.innerHTML = shown.map(e => `<li><time>${e.t.toFixed(1)}s</time> ${e.side === match.replaySide ? 'YOU' : 'FOE'} · ${esc(SPECIES[e.actor]?.name ?? e.actor)} · ${esc(e.kind)} ${esc(MOVES[e.move]?.name ?? e.move ?? e.reaction ?? '')}${e.damage != null ? ` · ${e.damage} damage` : ''}</li>`).join('');
      list.scrollTop = list.scrollHeight;
    };
    slider.oninput = draw;
    play.onclick = () => { if (+slider.value >= duration) slider.value = 0; playing = !playing; play.textContent = playing ? 'PAUSE' : 'PLAY'; draw(); };
    el.querySelector('[data-back]').onclick = () => this.mastery();
    this.timer = setInterval(() => { if (!playing) return; slider.value = Math.min(duration, +slider.value + .1); draw(); if (+slider.value >= duration) { playing = false; play.textContent = 'PLAY'; } }, 100);
    draw();
  }

  mastery(selected = null, compare = null) {
    const data=readMastery(),stats=profileStats(data),earned=new Set(earnedBadges(data).map(b=>b.id));
    const rows=ROSTER.map(id=>[id,data.species[id]??{xp:0,battles:0,wins:0}]).sort((a,b)=>b[1].xp-a[1].xp || SPECIES[a[0]].name.localeCompare(SPECIES[b[0]].name));
    const name=id=>SPECIES[id]?.name??'—', stat=(label,value)=>`<div><small>${label}</small><b>${esc(value??0)}</b></div>`;
    const detail=id=> {
      const r=data.species[id]??{xp:0,discovered:[]},lv=level(r.xp),next=MASTERY_THRESHOLDS[lv],prev=MASTERY_THRESHOLDS[lv-1]??0;
      const reward=COSMETICS.filter(c=>c.at>lv).sort((a,b)=>a.at-b.at)[0];
      return `<section class="mastery-detail"><img loading="lazy" width="64" src="${portrait(id)}" alt=""><h3>${name(id)} · LEVEL ${lv}</h3>
        <div class="mastery-bar"><i style="width:${next?Math.min(100,100*(r.xp-prev)/(next-prev)):100}%"></i></div>
        <p>${r.xp} XP · ${next?`${next-r.xp} to level ${lv+1}`:'Max level'}<br>Next cosmetic: ${reward?`${reward.name} at level ${reward.at}`:'All mastery cosmetics available'}</p>
        <div class="profile-grid">${[['Entered',r.entries],['Completed',r.completed??r.battles],['Wins',r.wins],['Losses',r.losses],['Best streak',r.bestStreak],['KOs',r.kos],['Faints',r.faints],['Hits',r.hits],['Switches',r.switches],['Damage',Math.round(r.damage??0)],['Taken',Math.round(r.received??0)],['Ultimates',r.ultimates],['Megas',r.mega],['Reactions',r.reactions],['Boss damage',Math.round(r.bossDamage??0)],['Raids',r.raids],['Draft wins',`${r.draftWins??0}/${r.drafts??0}`],['Best damage',Math.round(r.bestDamage??0)],['Fastest win',r.bestWin?`${r.bestWin}s`:'—'],['Best raid',r.bestRaid??'—']].map(([k,v])=>stat(k,v)).join('')}</div>
        <p>Milestones: ${MASTERY_THRESHOLDS.map((xp,i)=>`<span class="mastery-milestone${r.xp>=xp?' earned':''}">Lv ${i+1} · ${xp} XP</span>`).join(' ')}</p>
        <p>${(r.milestones??[]).map(m=>`Level ${m.level} earned ${new Date(m.at).toLocaleDateString()}`).join(' · ')}</p>
        <p>Discovered: ${(r.discovered??[]).map(id=>HIT_REACTIONS.find(v=>v.id===id)?.label??id).map(esc).join(', ')||'None yet'}</p></section>`;
    };
    const available=new Set(unlockedCosmetics(data).map(c=>c.id));
    const cosmetics=['frame','pose','effect'].map(kind=>`<label>${kind.toUpperCase()} <select data-cosmetic="${kind}"><option value="">Default</option>${COSMETICS.filter(c=>c.kind===kind).map(c=>`<option value="${c.id}" ${available.has(c.id)?'':'disabled'} ${data.cosmetics[kind]===c.id?'selected':''}>${c.name}${available.has(c.id)?'':` · Level ${c.at}`}</option>`).join('')}</select></label>`).join('');
    const el=this.open('POKÉMON MASTERY',`<p>Saved in this browser only. Cosmetics never change battle stats. Entered counts include unfinished local battles; completed records and XP require a result.</p>
      <h3>TRAINER PROFILE</h3><div class="profile-grid">${stat('Battles',stats.battles)}${stat('Win rate',`${stats.rate}%`)}${stat('Wins',stats.wins)}${stat('Best streak',stats.bestStreak)}${stat('Favourite',name(stats.favorite))}${stat('Top mastery',name(stats.top))}${stat('Favourite arena',ARENAS.find(a=>a.id===stats.arena)?.name??stats.arena??'—')}${stat('Top moves',stats.moves.map(id=>MOVES[id]?.name??id).join(', ')||'—')}</div>
      <h3>BADGES · ${earned.size}/${BADGES.length}</h3><p>Tap an earned badge to wear its title.</p><div class="badge-grid">${BADGES.map(b=>`<button class="badge${earned.has(b.id)?' on':''}${data.title===b.id?' worn':''}" data-title="${b.id}" ${earned.has(b.id)?'':'disabled'}><b>${b.name}</b><small>${b.desc}</small></button>`).join('')}</div>
      <h3>UNLOCKABLE COSMETICS</h3><div class="cosmetic-options">${cosmetics}</div>
      ${selected?`<label>COMPARE WITH <select data-compare><option value="">Choose Pokémon</option>${ROSTER.filter(id=>id!==selected).map(id=>`<option value="${id}" ${compare===id?'selected':''}>${name(id)}</option>`).join('')}</select></label><div class="mastery-compare">${detail(selected)}${compare?detail(compare):''}</div>`:''}
      <h3>ALL POKÉMON</h3><label>Search <input type="search" data-mastery-search placeholder="Pokémon name or type"></label><label>Sort <select data-sort><option value="xp">Mastery</option><option value="name">Name</option><option value="wins">Wins</option><option value="damage">Damage</option></select></label>
      <div class="exp-pool mastery-roster">${rows.map(([id,r])=>`<button data-species="${id}" data-name="${name(id).toLowerCase()} ${SPECIES[id].types.join(' ')}" data-xp="${r.xp}" data-wins="${r.wins??0}" data-damage="${r.damage??0}" class="${id===selected?'on':''}"><div class="exp-mon"><img loading="lazy" src="${portrait(id)}" alt=""><b>${name(id)}</b><small>Level ${level(r.xp)} · ${r.wins??0}W</small></div></button>`).join('')}</div>
      <h3>RECENT MATCHES</h3>${data.matches.map(m=>`<details><summary>${esc(m.result.toUpperCase())} · ${esc(m.mode)} · ${m.duration}s · ${m.verified?'server verified':'this browser'}</summary>${m.events?.length?`<button class="px-btn small" data-replay="${esc(m.id)}">EVENT REPLAY</button>`:''}<p>${Object.entries(m.species).filter(([id])=>SPECIES[id]).map(([id,r])=>`${name(id)}: ${Math.round(r.damage)} damage, ${r.kos} KOs, ${r.reactions} reactions`).join('<br>')}</p></details>`).join('')||'<p>No matches yet.</p>'}`);
    el.querySelectorAll('[data-species]').forEach(b=>b.onclick=()=>this.mastery(b.dataset.species));
    el.querySelector('[data-mastery-search]').oninput=e=>{for(const b of el.querySelectorAll('[data-species]'))b.hidden=!b.dataset.name.includes(e.target.value.toLowerCase());};
    el.querySelector('[data-sort]').onchange=e=>{const key=e.target.value,box=el.querySelector('.mastery-roster');[...box.children].sort((a,b)=>key==='name'?a.dataset.name.localeCompare(b.dataset.name):+b.dataset[key]-+a.dataset[key]).forEach(b=>box.append(b));};
    const selector=el.querySelector('[data-compare]');if(selector)selector.onchange=()=>this.mastery(selected,selector.value||null);
    el.querySelectorAll('[data-cosmetic]').forEach(s=>s.onchange=()=>{equipCosmetic(s.dataset.cosmetic,s.value);this.flow.game.cosmetics=cosmeticLoadout();});
    el.querySelectorAll('[data-title]:not([disabled])').forEach(b=>b.onclick=()=>{setTitle(data.title===b.dataset.title?null:b.dataset.title);this.mastery(selected,compare);});
    el.querySelectorAll('[data-replay]').forEach(b=>b.onclick=()=>this.replay(data.matches.find(m=>m.id===b.dataset.replay)));
  }

  settings() {
    const battle=this.flow.pauseOpen;
    const el=this.open('SETTINGS', `
      ${battle?'':`<section class="settings-section"><h3>TRAINER</h3><div class="settings-row"><div><b>${esc(this.flow.save.name??'TRAINER')}</b><p>Name and trainer appearance</p></div><button class="px-btn" data-edit-trainer>EDIT TRAINER</button></div></section>`}
      <section class="settings-section"><h3>EFFECT QUALITY</h3><p>Choose the amount of particles and visual detail. Attack warnings and safe areas remain visible at every level.</p><div class="settings-quality">${Object.entries(QUALITY).map(([k,v])=>`<button class="px-btn ${qualityName()===k?'primary':''}" data-quality="${k}" aria-pressed="${qualityName()===k}">${v.label}</button>`).join('')}</div></section>
      <section class="settings-section"><h3>AUDIO</h3><div class="settings-row"><button class="px-btn" data-music>♪ MUSIC: ${music.enabled?'ON':'OFF'}</button><button class="px-btn" data-sfx>SFX: ${isMuted()?'OFF':'ON'}</button></div><label class="settings-volume">MUSIC VOLUME <output>${Math.round(music.volume*100)}%</output><input aria-label="Music volume" type="range" min="0" max="100" data-volume value="${Math.round(music.volume*100)}"></label></section>
      <section class="settings-section"><h3>DISPLAY</h3><button class="px-btn" data-fs>FULLSCREEN</button></section>`);
    el.classList.add('settings-overlay');
    el.querySelector('[data-edit-trainer]')?.addEventListener('click',()=>{this.close(false);this.flow.showTrainer('settings');});
    el.querySelectorAll('[data-quality]').forEach(b=>b.onclick=()=>{
      setQuality(b.dataset.quality);this.flow.game.resize();
      el.querySelectorAll('[data-quality]').forEach(o=>{const active=qualityName()===o.dataset.quality;o.classList.toggle('primary',active);o.setAttribute('aria-pressed',String(active));});
    });
    el.querySelector('[data-music]').onclick=()=>{initAudio();music.setEnabled(!music.enabled);};
    el.querySelector('[data-sfx]').onclick=()=>{setMuted(!isMuted());this.flow.syncAudioUi();};
    el.querySelector('[data-volume]').oninput=e=>{initAudio();music.setVolume(+e.target.value/100);el.querySelector('output').textContent=e.target.value+'%';};
    el.querySelector('[data-fs]').onclick=()=>this.flow.toggleFullscreen();
    this.flow.syncFullscreen();
  }
  drafts() {
    const el = this.open('DRAFT BATTLES', `<p>Online · server-controlled choices</p><p class="exp-live" data-live></p><label>QUEUE <select data-ranked><option value="no">UNRANKED</option><option value="yes">RANKED · affects your rating</option></select></label><label>POOL <select data-roster><option value="regular">REGULAR POKÉMON</option><option value="all">FULL LEGAL ROSTER</option></select></label><div class="exp-options"><button class="px-btn primary" data-mode="snake" data-size="3">SNAKE · 3 VS 3</button><button class="px-btn primary" data-mode="snake" data-size="6">SNAKE · 6 VS 6</button><button class="px-btn" data-mode="trade" data-size="6">BLIND TRADE · 6 VS 6</button></div><div class="draft-previews"><article><b>SHARED POOL</b><div><img src="${portrait('charizard')}" alt="Charizard"><img src="${portrait('raichu')}" alt="Raichu"><img src="${portrait('blastoise')}" alt="Blastoise"></div><span>A → B → B → A</span><small>Every pick removes a Pokémon from the common pool.</small></article><article><b>BLIND TRADE</b><div><img src="${portrait('sceptile')}" alt="Sceptile"><span>⇄</span><img src="${portrait('lucario')}" alt="Lucario"></div><span>KEEP ONE · SEND ONE</span><small>Three private rounds; simultaneous reveals.</small></article></div><p class="exp-status" role="status"></p>`);
    this.where = 'draft';
    this.lobbyChanged();
    this.mm.pollLobby(true);
    el.querySelectorAll('[data-mode]').forEach(b => b.onclick = async () => {
      if (this.drafting) return;
      this.drafting = true; this.mm.state = 'connecting';
      el.querySelector('.exp-status').textContent = 'Connecting to the match server…';
      try {
        await this.mm.connectReady();
        if (!this.drafting) return;
        if(!this.mm.features?.includes('drafts')) throw new Error('The match server needs the expansion update for drafts.');
        this.mm.state = 'draft';
        this.mm.send({ t: 'draft-queue', mode: b.dataset.mode, format: +b.dataset.size, ranked:el.querySelector('[data-ranked]').value==='yes', roster:el.querySelector('[data-roster]').value });
      } catch (err) { if (this.el) this.el.querySelector('.exp-status').textContent = err.message || 'Could not connect. Close and retry; bot battles remain available.'; this.drafting = false; this.mm.state = 'idle'; }
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
    const el = this.open(title, `<p>${m.ranked?'RANKED':'UNRANKED'} · ${m.roster==='all'?'FULL ROSTER':'REGULAR POKÉMON'}</p><div class="draft-banner${canPick ? ' go' : ''}">${banner}</div>${order}
      <div class="draft-clock"><i></i><span></span></div><p class="exp-note">${left} · ${snake ? 'picks alternate A–B–B–A; each selected Pokémon leaves the shared pool' : 'you keep one of each pair; the other joins your opponent\'s team'}</p>
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
