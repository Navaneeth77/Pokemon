// Survival: endless waves of computer trainers with one team of three. HP and knock-outs carry over
// between waves; after each cleared wave you pick one of three upgrades. Foes get sharper and stronger
// every wave (legendaries join from wave 5). The best wave reached is kept in this browser.
import { SPECIES, ROSTER } from './data/species.js';
import { ITEMS, randomKit } from './data/items.js';
import { ARENAS } from './arena.js';
import { sfx } from './audio.js';

const BEST_KEY = 'msb.survival.best';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const portrait = id => `/sprites/${SPECIES[id].sprite}/portrait.png`;
const pick = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n);

// Upgrades offered between waves; `ok` hides ones that would do nothing.
const UPGRADES = [
  { id: 'medic', name: 'Field Medic', desc: 'Every Pokémon still standing heals 40% of its max HP.', apply: r => r.carry.forEach(c => c.hp > 0 && (c.hp = Math.min(1, c.hp + 0.4))), ok: r => r.carry.some(c => c.hp > 0 && c.hp < 1) },
  { id: 'revive', name: 'Max Revive', desc: 'Your first fainted Pokémon returns at half HP.', apply: r => { const c = r.carry.find(c => c.hp <= 0); if (c) c.hp = 0.5; }, ok: r => r.carry.some(c => c.hp <= 0) },
  { id: 'power', name: 'Power Surge', desc: 'Your team deals 10% more damage for the rest of the run.', apply: r => (r.boost.atk *= 1.1) },
  { id: 'wall', name: 'Iron Wall', desc: 'Your team takes 8% less damage for the rest of the run.', apply: r => (r.boost.def *= 0.92) },
  { id: 'tempo', name: 'Quick Recharge', desc: 'Your moves recharge 8% faster for the rest of the run.', apply: r => (r.boost.cd *= 1.08) },
  { id: 'battery', name: 'Ultimate Battery', desc: 'Every wave starts with your ultimate meters half full.', apply: r => (r.boost.ult = 50), ok: r => !r.boost.ult },
  { id: 'crate', name: 'Item Crate', desc: 'Each Pokémon gets a fresh held item picked for it.', apply: r => r.team.forEach(id => (r.kits[id] = { ...r.kits[id], item: randomKit(SPECIES[id]).item })) },
];

export class Survival {
  constructor(flow) {
    this.flow = flow;
    this.run = null;
  }

  get best() {
    try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; }
  }

  // Team selection for a new run (the usual builder, labelled for Survival).
  enter() {
    const f = this.flow, ui = f.ui;
    f.closeDexEntry();
    f.show(null);
    f.screen = 'select';
    f.opening.stop();
    document.querySelector('#intro').classList.add('hidden');
    ui.setBuilder(null);
    ui.setLeader(null);
    ui.setQueue(null);
    ui.setFormat(3);
    ui.survival = this;
    document.body.classList.add('survival');
    ui.setVersus(this.best ? `SURVIVAL · BEST ${this.best}` : 'SURVIVAL');
    document.querySelector('.select-card .sub').textContent = 'Endless waves · HP carries over · pick upgrades between waves';
    this.flow.game.toSelect();
    ui.renderSelection();
  }

  begin(ui) {
    this.run = {
      wave: 1, team: [...ui.selection], lead: ui.lead, mega: { ...ui.megaPick }, kits: ui.teamKits(),
      carry: ui.selection.map(() => ({ hp: 1 })), boost: { atk: 1, def: 1, cd: 1, ult: 0 },
    };
    this.wave();
  }

  async wave() {
    const r = this.run, g = this.flow.game, ui = this.flow.ui;
    const pool = ROSTER.filter(id => r.wave >= 5 || SPECIES[id].class === 'regular');
    const foes = pick(pool.filter(id => !r.team.includes(id)), 3);
    ui.loading = true;
    try {
      g.kits = r.kits;
      await g.ensureSprites([...r.team, ...foes]);
    } finally {
      ui.loading = false;
    }
    const alive = r.carry.findIndex(c => c.hp > 0);
    Object.assign(g, {
      selection: [...r.team], opponentSelection: foes, lead: r.carry[r.lead]?.hp > 0 ? r.lead : alive, megaPicks: r.mega, kits: r.kits,
      difficulty: r.wave <= 2 ? 'easy' : r.wave <= 5 ? 'medium' : 'hard', aiConfig: null, story: null, foeCanMega: r.wave >= 4, foeTrainer: null,
      arenaId: ARENAS[(r.wave - 1) % ARENAS.length].id,
      // Foes hit 7% harder and take 4% less per wave; your upgrades count on top (combat.js, pokemon.js).
      survival: { wave: r.wave, foePower: 1 + 0.07 * (r.wave - 1), foeGuard: 1 / (1 + 0.04 * (r.wave - 1)), ...r.boost },
    });
    g.gold.name = `WAVE ${r.wave}`;
    g.start();
    g.playerTeam.members.forEach((m, i) => {
      const c = r.carry[i];
      m.hp = Math.max(0, Math.round(m.maxHp * c.hp));
      m.shownHp = m.trailHp = m.hp;
      if (m.hp <= 0) m.fainted = true;
      if (r.boost.ult) m.ult = r.boost.ult;
    });
    this.flow.ui.setVersus(`WAVE ${r.wave}`);
  }

  // The battle is over (ui.showResult hands Survival the verdict).
  onResult(win) {
    const r = this.run, g = this.flow.game;
    if (!r) return;
    r.carry = g.playerTeam.members.map(m => ({ hp: m.alive ? m.hp / m.maxHp : 0 }));
    if (!win) return this.over();
    r.wave++;
    const options = pick(UPGRADES.filter(u => !u.ok || u.ok(r)), 3);
    this.overlay(`<small>WAVE ${r.wave - 1} CLEARED</small><h2>Choose an upgrade</h2>${this.teamHtml()}
      <div class="sv-ups">${options.map(u => `<button data-up="${u.id}"><b>${u.name}</b><span>${u.desc}</span></button>`).join('')}</div>`, el => {
      el.querySelectorAll('[data-up]').forEach(b => (b.onclick = () => {
        UPGRADES.find(u => u.id === b.dataset.up).apply(r);
        sfx.megaBurst();
        el.remove();
        this.wave();
      }));
    });
  }

  over() {
    const r = this.run, reached = r.wave - 1, best = Math.max(this.best, reached);
    try { localStorage.setItem(BEST_KEY, String(best)); } catch {}
    this.run = null;
    this.overlay(`<small>SURVIVAL OVER</small><h2>${reached} wave${reached === 1 ? '' : 's'} cleared</h2><p>${reached >= best && reached ? 'A new personal best!' : `Best: wave ${best}`}</p>
      <div class="sv-ups"><button data-again><b>Try again</b><span>Pick a team and start again from wave 1.</span></button><button data-menu><b>Main menu</b><span>Back to the title menu.</span></button></div>`, el => {
      el.querySelector('[data-again]').onclick = () => { el.remove(); this.enter(); };
      el.querySelector('[data-menu]').onclick = () => { el.remove(); this.flow.ui.survival = null; this.flow.game.toMenu?.(); this.flow.showTitleMenu(); };
    });
  }

  teamHtml() {
    const r = this.run;
    return `<div class="sv-team">${r.team.map((id, i) => {
      const hp = r.carry[i].hp, item = ITEMS[r.kits[id]?.item];
      return `<div class="${hp <= 0 ? 'down' : ''}"><img src="${portrait(id)}" alt=""><b>${esc(SPECIES[id].name)}</b><i style="--hp:${Math.round(hp * 100)}%"></i><small>${hp <= 0 ? 'FAINTED' : `${Math.round(hp * 100)}% HP`}${item ? ` · ${esc(item.name)}` : ''}</small></div>`;
    }).join('')}</div>`;
  }

  overlay(html, wire) {
    document.querySelector('.sv-overlay')?.remove();
    const el = document.createElement('div');
    el.className = 'sv-overlay';
    el.setAttribute('role', 'dialog');
    el.innerHTML = `<section>${html}</section>`;
    document.body.appendChild(el);
    wire(el);
    el.querySelector('button')?.focus();
  }
}
