import { Cutscene } from './cutscene.js';
import { SCENES, BATTLES, CHAPTERS, CAST, STARTER_LINES, RIVAL_OF } from './data/echoes.js';
import { SPECIES, isPlayable, eligibleReplacement, normalizeTeam } from './data/species.js';
import { TYPE_COLORS } from './data/types.js';
import { aiCurve, DIFFICULTY, STARTERS } from './story.js';
import { lookById, frontPalette } from './trainers.js';
import { music } from './music.js';
import { sfx } from './audio.js';

// Pokémon: Echoes of the Sky — the ten-chapter story campaign. Progress is a single position in the
// campaign (scene → battle → scene…), saved after every step, so a refresh resumes exactly where you were
// and finished scenes never replay unless you choose to rewatch a chapter.
const SAVE_KEY = 'msb.echoes';
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const portrait = id => `/sprites/${SPECIES[id].sprite}/portrait.png`;
const NODES = CHAPTERS.flatMap((c, ch) => c.nodes.map(n => ({ ...n, ch })));
const LAST_I = Math.max(...Object.values(BATTLES).map(b => b.i));

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || s.v !== 1) return null;
    const node = Math.max(0, Math.min(NODES.length, s.node | 0));
    const starter = STARTERS.includes(s.starter) ? s.starter : null;
    return {
      v: 1, node, starter: node > NODES.findIndex(n => n.starter) && !starter ? null : starter,
      format: s.format === 6 ? 6 : 3, difficulty: DIFFICULTY[s.difficulty] ? s.difficulty : 'normal',
      pool: Array.isArray(s.pool) ? [...new Set(s.pool.filter(id => SPECIES[id]))] : [], team: Array.isArray(s.team) ? s.team.filter(id => SPECIES[id]) : [],
      megaRing: !!s.megaRing, wins: Math.max(0, s.wins | 0), losses: Math.max(0, s.losses | 0), complete: node >= NODES.length,
    };
  } catch {
    return null;
  }
}

export class Echoes {
  constructor(game, flow, ui) {
    this.game = game;
    this.flow = flow;
    this.ui = ui;
    this.cut = new Cutscene(game);
    this.save = loadSave();
    // A save made after the starter choice but without a starter can't continue: rewind to the choice.
    if (this.save && !this.save.starter && this.save.node > NODES.findIndex(n => n.starter)) this.save.node = NODES.findIndex(n => n.starter);
  }

  persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* storage unavailable */ }
  }

  get chapter() { return NODES[this.save?.node]?.ch ?? CHAPTERS.length - 1; }

  starterForm() {
    const line = STARTER_LINES[this.save.starter];
    return line ? [...line].reverse().find(id => this.save.pool.includes(id)) ?? line[0] : 'pikachu';
  }

  kaiStarter(stage) {
    const line = STARTER_LINES[RIVAL_OF[this.save.starter] ?? 'squirtle'];
    return line[Math.max(0, Math.min(2, stage))];
  }

  // Everything a cutscene needs: who is who, text placeholders, species stand-ins, and save hooks.
  sceneContext(replay) {
    const s = this.save, fs = this.flow.save, cur = this.starterForm(), line = STARTER_LINES[s.starter] ?? [];
    const kaiStage = this.chapter >= 5 ? 2 : this.chapter >= 2 ? 1 : 0;
    const ctx = {
      cast: { ...CAST, player: { name: fs.name ?? 'YOU', color: '#ff8a3d', look: lookById(fs.look) } },
      vars: { P: fs.name ?? 'Trainer', S: SPECIES[cur]?.name ?? '', KS: SPECIES[this.kaiStarter(kaiStage)]?.name ?? '' },
      species: { STARTER: cur, STARTER_0: line[0], STARTER_1: line[1], STARTER_2: line[2], KAISTARTER: this.kaiStarter(kaiStage) },
      // An evolution only plays once: not again if the scene is replayed after being interrupted.
      canEvolve: id => replay || s.pool.includes(id),
      onJoin: ids => {
        if (replay) return;
        for (const id of ids) if (!s.pool.includes(id)) s.pool.push(id);
        this.persist();
      },
      onEvolve: (a, b) => {
        if (a === ctx.species.STARTER) {
          ctx.species.STARTER = b;
          ctx.vars.S = SPECIES[b].name;
        }
        if (replay) return;
        s.pool = s.pool.map(id => (id === a ? b : id));
        s.team = s.team.map(id => (id === a ? b : id));
        this.persist();
      },
      onFlag: f => {
        if (!replay && f === 'megaRing') s.megaRing = true;
        this.persist();
      },
    };
    return ctx;
  }

  speciesIn(scene, ctx) {
    const ids = new Set();
    for (const [kind, ...a] of scene.steps) {
      if (kind === 'mon' || kind === 'ace') ids.add(ctx.species[a[1]] ?? a[1]);
      if (kind === 'evolve') for (const x of a) ids.add(ctx.species[x] ?? x);
    }
    return [...ids].filter(id => SPECIES[id]);
  }

  async playScene(id, replay = false, intoBattle = false) {
    const scene = SCENES[id], ctx = this.sceneContext(replay);
    ctx.intoBattle = intoBattle;
    this.leaveScreens();
    try { await this.cut.prepare(this.speciesIn(scene, ctx)); } catch { /* a missing sheet just won't appear */ }
    this.flow.screen = 'cutscene';
    await this.cut.play(scene, ctx);
  }

  leaveScreens() {
    this.ui.setStory(null);
    this.game.story = null;
    this.game.toMenu();
    this.flow.togglePause(false);
    this.flow.opening.stop();
    this.flow.show(null);
    $('#intro').classList.add('hidden');
  }

  // ── Running the campaign ──
  async resume() {
    if (!this.save) return this.showHome();
    // Only the latest run continues (an older one stops at its next step).
    const run = (this.run = (this.run ?? 0) + 1);
    {
      while (this.save.node < NODES.length) {
        const n = NODES[this.save.node];
        if (n.scene) {
          await this.playScene(n.scene, false, !!NODES[this.save.node + 1]?.battle);
          if (run !== this.run || this.flow.screen !== 'cutscene') return; // left the story mid-scene
        } else if (n.starter && !this.save.starter) {
          const pick = await this.chooseStarter();
          if (!pick || run !== this.run) return;
          this.save.starter = pick;
          if (!this.save.pool.includes(pick)) this.save.pool.unshift(pick);
        } else if (n.battle) {
          this.startBattle(n.battle);
          return; // the battle's result continues the story (onBattleEnd)
        }
        this.save.node++;
        this.persist();
      }
      this.save.complete = true;
      this.persist();
      this.showHome();
    }
  }

  teamOf(def, n) {
    if (def.team) return [...def.team];
    const src = (n <= 3 ? def.three : def.six).slice(-n);
    return src.map(id => (id === 'KAI' ? this.kaiStarter(def.kai) : id));
  }

  startBattle(id) {
    const def = BATTLES[id], s = this.save, g = this.game, ui = this.ui;
    const pool=[...new Set((def.pool??s.pool).map(id=>isPlayable(id)?id:eligibleReplacement(id)))];
    const n = Math.max(1, Math.min(s.format, pool.length));
    const foes = normalizeTeam(this.teamOf(def,n),n);
    this.current = id;
    this.leaveScreens();
    this.flow.screen = 'select';
    g.arenaId = def.arena;
    g.gold.name = def.name;
    g.gold.setPalette(def.wild ? {} : frontPalette(CAST[def.who]?.look ?? {}));
    ui.setFormat(n);
    const last = [...new Set(s.team.filter(x => pool.includes(x)))];
    ui.selection = (last.length ? last : pool).slice(0, n);
    ui.lead = 0;
    ui.setStory({
      stage: { id, name: def.name, where: def.where }, pool: new Set(pool), foes, format: n, difficulty: DIFFICULTY[s.difficulty].label,
      aiConfig: aiCurve(def.i / LAST_I, s.difficulty), mega: (def.megaOn ?? []).includes(s.difficulty), arena: def.arena,
      playerMega: s.megaRing, wild: !!def.wild, spare: def.spare,
      onResult: win => this.onBattleEnd(win), back: () => this.showHome(),
      remember: team => { if (!def.pool) { s.team = [...team]; this.persist(); } },
    });
    g.toSelect();
    music.play('menu');
  }

  onBattleEnd(win) {
    const def = BATTLES[this.current], s = this.save;
    if (win) {
      s.wins++;
      if (NODES[s.node]?.battle === this.current) s.node++;
    } else s.losses++;
    this.persist();
    const box = $('#result-text');
    box.innerHTML = win
      ? `<b class="win">${def.spare ? 'Calmed!' : 'Victory!'}</b><p>${esc(def.spare ? def.calm : `You defeated ${def.name}!`)}</p>
        <div class="st-res-btns"><button class="big-btn" data-a="go">Continue ▶</button></div>`
      : `<b class="lose">Defeat…</b><p>${esc(def.name)} was too strong this time. Your team is ready to try again.</p>
        <div class="st-res-btns"><button class="big-btn" data-a="retry">Retry</button><button class="big-btn alt" data-a="home">Story Menu</button></div>`;
    $('#again-btn').classList.add('hidden');
    $('#leave-btn').hidden = true;
    $('#result-overlay').classList.remove('hidden');
    box.querySelector('[data-a="go"]')?.addEventListener('click', () => this.resume());
    box.querySelector('[data-a="retry"]')?.addEventListener('click', () => this.startBattle(this.current));
    box.querySelector('[data-a="home"]')?.addEventListener('click', () => this.showHome());
    if (win) sfx.megaBurst();
  }

  // ── Screens ──
  page(title, html) {
    this.leaveScreens();
    music.play('menu');
    const page = $('#story-screen');
    page.innerHTML = `
      <header class="pg-head st-head"><span class="dex-lens"></span><span class="dex-leds"><i></i><i></i><i></i></span>
        <h1>${title}</h1><div class="pg-who"><span>${esc(this.flow.save.name ?? 'TRAINER')}</span></div></header>
      <div class="pg-bar"><button class="dex-btn" data-a="menu">◀ MENU</button><span></span></div>${html}`;
    page.querySelector('[data-a="menu"]').addEventListener('click', () => this.flow.toTitle());
    this.flow.show('#story-screen');
    page.scrollTop = 0;
    return page;
  }

  // Story Mode entry: the new adventure or the classic Kanto League challenge.
  openHub() {
    const s = this.save;
    const page = this.page('STORY MODE', `
      <div class="ec-hub">
        <button class="ec-card sky" data-a="echoes"><small>STORY ADVENTURE · 10 CHAPTERS</small><b>Echoes of the Sky</b>
          <span>Join Professor Lyra and your rival Kai to uncover why the sky glows emerald — and why Rayquaza has returned.</span>
          <em>${s ? (s.complete ? 'COMPLETE ✓ · REPLAY' : `CHAPTER ${this.chapter + 1} · CONTINUE ▶`) : 'NEW ▶'}</em></button>
        <button class="ec-card kanto" data-a="kanto"><small>GYM CHALLENGE</small><b>Kanto League</b>
          <span>Catch your way across Kanto, earn eight badges, then face the Elite Four and Champion Blue.</span><em>PLAY ▶</em></button>
      </div>`);
    page.querySelector('[data-a="echoes"]').addEventListener('click', () => this.showHome());
    page.querySelector('[data-a="kanto"]').addEventListener('click', () => this.flow.story.open());
  }

  showHome() {
    this.run = (this.run ?? 0) + 1;
    const s = this.save;
    if (!s) return this.showNew();
    const cur = this.chapter;
    const list = CHAPTERS.map((c, i) => {
      const state = s.complete || i < cur ? 'done' : i === cur ? 'next' : 'locked';
      return `<div class="ec-ch ${state}"><span class="ec-no">${i + 1}</span><b>${state === 'locked' ? '? ? ?' : esc(c.title)}</b>
        ${state === 'done' ? `<button class="dex-btn" data-replay="${i}">REWATCH</button>` : state === 'next' ? '<em>▶ NOW</em>' : '<em>🔒</em>'}</div>`;
    }).join('');
    const team = s.pool.length ? s.pool.map(id => `<span class="st-pmon"><img src="${portrait(id)}" alt=""><b>${SPECIES[id].name}</b></span>`).join('') : '<p class="st-note">Your team will grow as the story goes on.</p>';
    const page = this.page('ECHOES OF THE SKY', `
      <section class="dex-panel ec-hero">
        <small>${s.complete ? 'THE END — THANK YOU FOR PLAYING' : `CHAPTER ${cur + 1}`}</small><b>${esc(s.complete ? 'Echoes of the Sky' : CHAPTERS[cur].title)}</b>
        <div class="st-stats"><span>${s.format} VS ${s.format}</span><span>${DIFFICULTY[s.difficulty].label.toUpperCase()}</span><span>${s.wins} WINS</span>${s.megaRing ? '<span>KEY STONE ✓</span>' : ''}</div>
        <div class="st-actions">${s.complete ? '<button class="dex-go" data-replay="9">WATCH THE ENDING</button>' : '<button class="dex-go" data-a="go">CONTINUE ▶</button>'}</div>
      </section>
      <section class="dex-panel"><h2>YOUR POKÉMON · ${s.pool.length}</h2><div class="st-pool">${team}</div></section>
      <section class="dex-panel"><h2>CHAPTERS</h2><div class="ec-list">${list}</div></section>
      <section class="dex-panel"><h2>SETTINGS</h2>
        <div class="st-opts" data-k="format"><button data-v="3"><b>3 VS 3</b></button><button data-v="6"><b>6 VS 6</b></button></div>
        <div class="st-opts" data-k="difficulty">${Object.entries(DIFFICULTY).map(([k, d]) => `<button data-v="${k}"><b>${d.label.toUpperCase()}</b></button>`).join('')}</div>
        <div class="st-actions"><button class="st-reset" data-a="reset">START OVER</button><button class="st-reset" data-a="hub">OTHER STORIES</button></div>
      </section>`);
    const sync = () => page.querySelectorAll('.st-opts').forEach(g => g.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(s[g.dataset.k]) === b.dataset.v)));
    page.querySelectorAll('.st-opts').forEach(g => g.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      s[g.dataset.k] = g.dataset.k === 'format' ? +b.dataset.v : b.dataset.v;
      this.persist();
      sync();
    })));
    sync();
    page.querySelector('[data-a="go"]')?.addEventListener('click', () => this.resume());
    page.querySelectorAll('[data-replay]').forEach(b => b.addEventListener('click', () => this.rewatch(+b.dataset.replay)));
    page.querySelector('[data-a="hub"]').addEventListener('click', () => this.openHub());
    page.querySelector('[data-a="reset"]').addEventListener('click', e => {
      const b = e.currentTarget;
      if (!b.dataset.sure) {
        b.dataset.sure = '1';
        b.textContent = 'TAP AGAIN TO ERASE THIS STORY';
        return;
      }
      localStorage.removeItem(SAVE_KEY);
      this.save = null;
      this.showNew();
    });
  }

  showNew() {
    const pick = { format: 3, difficulty: 'normal' };
    const page = this.page('ECHOES OF THE SKY', `
      <section class="dex-panel ec-hero"><small>A STORY IN TEN CHAPTERS</small><b>Pokémon: Echoes of the Sky</b>
        <p class="ec-blurb">The sky over your hometown has started to glow emerald, and a great shadow has been seen above the clouds. Professor Lyra needs a research team. You and your best friend Kai are about to become it.</p></section>
      <section class="dex-panel"><h2>BATTLE FORMAT</h2><div class="st-opts" data-k="format">
        <button data-v="3"><b>3 VS 3</b><small>Up to three Pokémon per battle.</small></button><button data-v="6"><b>6 VS 6</b><small>Full teams once yours is big enough.</small></button></div></section>
      <section class="dex-panel"><h2>DIFFICULTY</h2><div class="st-opts" data-k="difficulty">${Object.entries(DIFFICULTY).map(([k, d]) => `<button data-v="${k}"><b>${d.label.toUpperCase()}</b><small>${d.desc}</small></button>`).join('')}</div></section>
      <div class="st-actions"><button class="dex-go" data-a="go">BEGIN THE STORY ▶</button></div>`);
    const sync = () => page.querySelectorAll('.st-opts').forEach(g => g.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(pick[g.dataset.k]) === b.dataset.v)));
    page.querySelectorAll('.st-opts').forEach(g => g.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      pick[g.dataset.k] = g.dataset.k === 'format' ? +b.dataset.v : b.dataset.v;
      sync();
    })));
    sync();
    page.querySelector('[data-a="go"]').addEventListener('click', () => {
      this.save = { v: 1, node: 0, starter: null, format: pick.format, difficulty: pick.difficulty, pool: [], team: [], megaRing: false, wins: 0, losses: 0, complete: false };
      this.persist();
      sfx.megaBurst();
      this.resume();
    });
  }

  // Starter choice (Chapter 1): resolves with the chosen species, or null if the player leaves.
  chooseStarter() {
    return new Promise(resolve => {
      const page = this.page('CHOOSE YOUR PARTNER', `
        <section class="dex-panel"><h2>PROFESSOR LYRA'S POKÉMON</h2><div class="st-starters">${STARTERS.map(id => {
          const sp = SPECIES[id];
          return `<button class="st-starter" data-id="${id}"><span class="ball"><img src="${portrait(id)}" alt=""></span><b>${sp.name}</b><span class="tp">${sp.types.map(t => `<i style="background:${TYPE_COLORS[t][1]}">${t}</i>`).join('')}</span></button>`;
        }).join('')}</div><p class="st-note">Kai will take the one that has the edge on yours. Of course he will.</p>
        <div class="st-actions"><button class="dex-go" data-a="go" disabled>CHOOSE ONE</button></div></section>`);
      let pick = null;
      page.querySelectorAll('.st-starter').forEach(b => b.addEventListener('click', () => {
        pick = b.dataset.id;
        sfx.sendOut();
        page.querySelectorAll('.st-starter').forEach(o => o.classList.toggle('on', o === b));
        const go = page.querySelector('[data-a="go"]');
        go.disabled = false;
        go.textContent = `I CHOOSE ${SPECIES[pick].name.toUpperCase()}! ▶`;
      }));
      page.querySelector('[data-a="go"]').addEventListener('click', () => pick && resolve(pick));
      page.querySelector('[data-a="menu"]').addEventListener('click', () => resolve(null), { once: true });
    });
  }

  // Rewatch a finished chapter's scenes (no effect on progress or your team).
  async rewatch(ch) {
    for (const n of CHAPTERS[ch].nodes) {
      if (!n.scene) continue;
      await this.playScene(n.scene, true);
      if (this.flow.screen !== 'cutscene') return;
    }
    this.showHome();
  }
}
