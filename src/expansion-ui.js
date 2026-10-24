import { readMastery, level, MASTERY_THRESHOLDS } from './mastery.js';
import { BOSSES, BossEncounter } from './bosses.js';
import { HIT_REACTIONS } from './reactions.js';
import { SPECIES } from './data/species.js';
import { QUALITY, setQuality, qualityName } from './quality.js';
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
  raids() {
    const el = this.open('LEGENDARY RAIDS', `<p>Telegraphed attacks · three phases · vulnerability windows<br>Bring 3 or 6 Pokémon. A faint sends out your next teammate; no revives.</p><div class="exp-options">${Object.entries(BOSSES).map(([id,b]) => `<button class="px-btn" data-boss="${id}"><img width="40" src="${portrait(id)}" alt="">${b.name}<small>${b.title}</small></button>`).join('')}</div><label>TEAM SIZE <select data-size><option value="3">3 Pokémon</option><option value="6">6 Pokémon</option></select></label><label> RAID FORMAT <select data-kind><option value="solo">Solo (offline)</option><option value="public">Online co-op</option><option value="private">Create private room</option><option value="join">Join private room</option></select></label><input data-code maxlength="6" placeholder="Room code" aria-label="Raid room code"><p class="exp-status">Choose your boss to prepare your team.</p>`);
    el.querySelectorAll('[data-boss]').forEach(b => b.onclick = () => {
      const setup = {boss:b.dataset.boss,kind:el.querySelector('[data-kind]').value,code:el.querySelector('[data-code]').value.trim().toUpperCase()};
      const format=+el.querySelector('[data-size]').value;
      this.close(false); this.flow.enterQueueSelect(); this.mm.stop();
      const ui=this.flow.ui; ui.setQueue(null); ui.format=format; ui.raidSetup=setup; ui.setFormat(format); ui.showSelect(0); ui.setVersus(BOSSES[setup.boss].name); document.body.classList.add('raid-setup');
    });
  }
  async startRaidTeam(ui) {
    if(ui.loading) return;
    ui.loading=true; document.body.classList.remove('raid-setup');
    const g=this.flow.game, setup=ui.raidSetup;
    try {
      if(setup.kind !== 'solo') {
        this.raidPending=true; this.mm.state='connecting';
        this.open('CONNECTING TO RAID', '<p class="exp-status">Waking the match server…</p>');
        await this.mm.connectReady();
        if(!this.raidPending) return;
        this.mm.state='raid';
        this.mm.send({t:'raid-queue',...setup,format:ui.format,team:ui.selection,lead:ui.lead,mega:ui.megaPick});
        return;
      }
      await g.ensureSprites([...ui.selection, setup.boss]);
      g.selection=[...ui.selection];g.lead=ui.lead;g.megaPicks={...ui.megaPick};g.opponentSelection=[setup.boss];g.arenaId=BOSSES[setup.boss].arena;g.online=null;g.story=null;
      ui.raidSetup=null;g.foeTrainer={name:BOSSES[setup.boss].name};g.start();new BossEncounter([g],setup.boss);g.gold.hidden=true;ui.setLocation('LEGENDARY RAID · '+BOSSES[setup.boss].name,ui.format);
    } catch(err) {this.open('RAID UNAVAILABLE','<p class="exp-status"></p>').querySelector('.exp-status').textContent=err.message;this.raidPending=false;this.mm.state='idle';}
    finally {ui.loading=false;}
  }
  guide() {
    this.open('ELEMENTAL REACTIONS', `<img class="element-crest" src="/art/element-crest.png" alt="Elemental crest"><p>Land two compatible elements within 4 seconds. A reaction consumes the aura. Shields and dodges prevent priming.</p><div class="reaction-grid">${HIT_REACTIONS.map(r => `<article style="--accent:${r.color}"><b>${r.label}</b><span>${r.pair.join(' + ').toUpperCase()}</span><small>${r.cleanse ? 'Clears burn and frost' : r.status ? `Applies ${r.status}, respecting immunity` : r.ground ? 'Clears paralysis and charge' : 'Bonus damage; up to two nearby wet enemies'}</small></article>`).join('')}</div><p>Reaction cooldown: 1.5s. Freeze protection: 6s after thawing. Chains never hit allies. Ground types resist conduction.</p>`);
  }
  mastery(selected = null) {
    const data=readMastery(), rows=Object.entries(data.species).filter(([id])=>SPECIES[id]).sort((a,b)=>b[1].xp-a[1].xp);
    const total=rows.reduce((n,[,s])=>n+s.battles,0), recent=data.matches;
    const detail=selected&&data.species[selected], sp=SPECIES[selected];
    const el=this.open('POKÉMON MASTERY', `<p>Local to this browser. Clearing browser data removes mastery. Cosmetics never change combat stats.</p><p>${recent.length} recent matches · ${rows.length} Pokémon trained · ${total} species participations</p>${detail?`<section class="mastery-detail"><img width="64" src="${portrait(selected)}" alt=""><h3>${sp.name} · LEVEL ${level(detail.xp)}</h3><progress max="${MASTERY_THRESHOLDS[level(detail.xp)]??detail.xp}" value="${detail.xp}"></progress><p>${detail.xp} XP · ${detail.wins} wins / ${detail.losses} losses · best streak ${detail.bestStreak}</p><p>Damage ${Math.round(detail.damage)} · received ${Math.round(detail.received)} · KOs ${detail.kos} · faints ${detail.faints}<br>Ultimates ${detail.ultimates} · Megas ${detail.mega} · reactions ${detail.reactions}<br>Boss damage ${Math.round(detail.bossDamage)} · raids ${detail.raids} · drafts ${detail.drafts}</p><p>Discovered: ${detail.discovered.join(', ')||'None yet'}</p><p>Title: ${level(detail.xp)>=5?'ELEMENTAL ACE':level(detail.xp)>=2?'RISING STAR':'ROOKIE'} · next title at levels 2 and 5</p></section>`:''}<div class="exp-pool">${rows.map(([id,r])=>`<button data-species="${id}" class="mastery-level-${Math.min(3,level(r.xp))}"><div class="exp-mon"><img src="${portrait(id)}" alt=""><b>${SPECIES[id].name}</b><small>Level ${level(r.xp)} · ${r.xp} XP</small></div></button>`).join('')||'<p>Complete a battle to start your mastery journey.</p>'}</div><h3>RECENT MATCHES</h3>${recent.map(m=>`<details><summary>${m.result.toUpperCase()} · ${m.mode} · ${m.duration}s · ${m.verified?'server verified':'local battle'}</summary><p>${Object.entries(m.species).filter(([id])=>SPECIES[id]).map(([id,r])=>`${SPECIES[id].name}: ${Math.round(r.damage)} damage, ${r.kos} KOs, ${r.reactions} reactions`).join('<br>')}</p></details>`).join('')}`);
    el.querySelectorAll('[data-species]').forEach(b=>b.onclick=()=>this.mastery(b.dataset.species));
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
    this.drafting = true; this.mm.state = 'draft'; this.draft = m;
    const mine = m.you, canPick = m.phase === 'picking' && (m.mode === 'trade' ? !m.chosen : m.turn === mine);
    const card = (id, origin = '') => `<div class="exp-mon"><img src="${portrait(id)}" alt=""><b>${SPECIES[id].name}</b><small>${origin}</small></div>`;
    const el = this.open(m.mode === 'snake' ? 'SHARED-POOL SNAKE' : `BLIND TRADE · ROUND ${Math.min(3, m.round + 1)}`, `<p class="exp-clock" role="status"></p><p>${m.phase === 'confirm' ? 'Final teams — confirm to battle (auto-start after timeout).' : m.phase === 'reveal' ? 'Both choices revealed together!' : canPick ? 'Your choice. Tap a Pokémon.' : 'Waiting for your opponent…'}</p><div class="exp-teams">${[mine, 1 - mine].map(s => `<section><h3>${s === mine ? 'YOUR TEAM' : 'OPPONENT'}</h3><div class="exp-roster">${m.teams[s].map((id, i) => card(id, m.origins[s][i])).join('')}</div></section>`).join('')}</div><div class="exp-pool">${m.pool.map(id => `<button data-pick="${id}" ${canPick ? '' : 'disabled'}>${card(id)}</button>`).join('')}</div>${m.phase === 'confirm' ? `<button class="px-btn primary" data-confirm ${m.confirmed[mine] ? 'disabled' : ''}>${m.confirmed[mine] ? 'CONFIRMED' : 'CONFIRM TEAM'}</button>` : ''}`);
    el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => this.mm.send({ t: 'draft-pick', id: m.id, species: b.dataset.pick }));
    el.querySelector('[data-confirm]')?.addEventListener('click', () => this.mm.send({ t: 'draft-confirm', id: m.id }));
    const tick = () => { const c = el.querySelector('.exp-clock'); if (c) c.textContent = `${Math.max(0, Math.ceil((m.deadline - Date.now()) / 1000))}s · timeout makes a legal automatic choice`; };
    tick(); this.timer = setInterval(tick, 250); return true;
  }
}
