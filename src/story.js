import { SPECIES, isPlayable, eligibleReplacement, normalizeTeam } from './data/species.js';
import { KANTO_LINES } from './data/kanto.js';
import { TYPE_COLORS, typeMultiplier } from './data/types.js';
import { drawBust, frontPalette } from './trainers.js';
import { music } from './music.js';
import { sfx } from './audio.js';

// Kanto Story Mode: pick a starter, beat the eight Gym Leaders in order, then the Elite Four and the
// Champion. You start with only your starter; Pokémon from the routes and places of the original
// journey become available as the story reaches them, and caught Pokémon evolve along the way.
// Battles run on the normal battle engine; this file holds the campaign data, its save and its screens.

const SAVE_KEY = 'msb.story';
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const portrait = id => `/sprites/${SPECIES[id].sprite}/portrait.png`;
const typeChip = t => `<i style="background:${TYPE_COLORS[t][1]}">${t}</i>`;

export const STARTERS = ['bulbasaur', 'charmander', 'squirtle'];

// Difficulty changes the opposing teams (Easy: earlier evolutions; Hard: evolutions as soon as the story
// allows, more Megas) and the trainers' skill. Within each difficulty every trainer is smarter than the
// last: from Brock's slow, matchup-blind bot to Lance and Blue, who dodge, chain combos and switch out
// bad matchups. Skill only — never extra damage or HP.
export const DIFFICULTY = {
  easy: { label: 'Easy', desc: 'Earlier evolutions on the other side and patient trainers. Good for learning.' },
  normal: { label: 'Normal', desc: 'Lore-accurate teams; trainers get noticeably sharper Gym by Gym.' },
  hard: { label: 'Hard', desc: 'Trainers evolve their teams early, read matchups, chain combos, switch smartly and Mega Evolve more.' },
};

// Bot settings (ai.js) for the first and the last battle of the campaign; the rest are in between.
const AI_CURVE = {
  easy: [{ gap: [2.2, 3.2], dodge: 0.03, charge: 0, ultWait: 5, typeAware: 0, chain: 0, mega: 0.4, guard: 0.15, switch: 0 },
    { gap: [1.1, 2.0], dodge: 0.28, charge: 0.3, ultWait: 1.2, typeAware: 0.8, chain: 0, mega: 0.65, guard: 0.5, switch: 0.2 }],
  normal: [{ gap: [1.8, 2.7], dodge: 0.06, charge: 0, ultWait: 4, typeAware: 0.15, chain: 0, mega: 0.45, guard: 0.25, switch: 0 },
    { gap: [0.5, 1.0], dodge: 0.52, charge: 0.45, ultWait: 0.2, typeAware: 1, chain: 1, mega: 0.88, guard: 0.88, switch: 0.5 }],
  hard: [{ gap: [1.1, 1.9], dodge: 0.25, charge: 0.25, ultWait: 1.5, typeAware: 0.7, chain: 0, mega: 0.7, guard: 0.6, switch: 0.1 },
    { gap: [0.4, 0.8], dodge: 0.62, charge: 0.5, ultWait: 0, typeAware: 1, chain: 1, mega: 0.95, guard: 0.95, switch: 0.65 }],
};

// Trainer looks use the same pixel-portrait system as the player's trainer (trainers.js).
const look = (style, hair, skin, jacket, pants, cap) => ({ style, hair, skin, jacket, pants, ...(cap && { cap }) });

// The campaign in order. `six`/`three` are the Normal teams for 6v6/3v3 (ace last); Blue's depend on
// your starter. `megaOn` lists the difficulties in which that trainer may Mega Evolve.
export const STAGES = [
  { id: 'brock', name: 'Brock', where: 'Pewter City Gym', kind: 'gym', type: 'rock', arena: 'mtSilver', badge: ['Boulder Badge', 'octagon', '#a8b0bc'],
    look: look('spiky', '#4a3020', '#c8905a', '#7a8a3a', '#6a5040'), quote: 'My rock-hard willpower is evident even in my Pokémon!',
    six: ['diglett', 'geodude', 'sandshrew', 'cubone', 'graveler', 'onix'], three: ['geodude', 'sandshrew', 'onix'] },
  { id: 'misty', name: 'Misty', where: 'Cerulean City Gym', kind: 'gym', type: 'water', arena: 'seafoam', badge: ['Cascade Badge', 'drop', '#4aa8f0'],
    look: look('bob', '#f08a2a', '#f6d0b0', '#f2d040', '#3a6ad8'), quote: 'My policy is an all-out offensive with Water-type Pokémon!',
    six: ['horsea', 'goldeen', 'shellder', 'psyduck', 'staryu', 'starmie'], three: ['goldeen', 'staryu', 'starmie'] },
  { id: 'surge', name: 'Lt. Surge', where: 'Vermilion City Gym', kind: 'gym', type: 'electric', arena: 'indigo', badge: ['Thunder Badge', 'star', '#f2a83a'],
    look: look('spiky', '#f2d040', '#e8b890', '#5a7a3a', '#3a4a2a'), quote: "Electric Pokémon saved me during the war! You won't last, kiddo!",
    six: ['voltorb', 'pikachu', 'magnemite', 'electabuzz', 'electrode', 'raichu'], three: ['voltorb', 'pikachu', 'raichu'] },
  { id: 'erika', name: 'Erika', where: 'Celadon City Gym', kind: 'gym', type: 'grass', arena: 'viridian', badge: ['Rainbow Badge', 'flower', '#7ad04a'],
    look: look('bob', '#24202c', '#f6d8c0', '#e8b030', '#3a7a3a'), quote: 'I am a student of the art of flower arranging. Shall we begin?',
    six: ['tangela', 'exeggcute', 'weepinbell', 'gloom', 'victreebel', 'vileplume'], three: ['tangela', 'victreebel', 'vileplume'] },
  { id: 'koga', name: 'Koga', where: 'Fuchsia City Gym', kind: 'gym', type: 'poison', arena: 'viridian', badge: ['Soul Badge', 'heart', '#f070b0'],
    look: look('beanie', '#24202c', '#e0a878', '#6a4a8a', '#24202c', '#5a3a7a'), quote: 'Despair to the creeping horror of Poison-type Pokémon!',
    six: ['ekans', 'grimer', 'venomoth', 'golbat', 'muk', 'weezing'], three: ['golbat', 'muk', 'weezing'] },
  { id: 'sabrina', name: 'Sabrina', where: 'Saffron City Gym', kind: 'gym', type: 'psychic', arena: 'indigo', badge: ['Marsh Badge', 'ring', '#f2c232'],
    look: look('long', '#1f3a2a', '#f6d8c0', '#c83a4a', '#2a2a3a'), quote: 'I had a vision of your arrival. I dislike fighting, but you wish it.',
    six: ['abra', 'mrMime', 'jynx', 'slowbro', 'kadabra', 'alakazam'], three: ['mrMime', 'kadabra', 'alakazam'], megaOn: ['hard'] },
  { id: 'blaine', name: 'Blaine', where: 'Cinnabar Island Gym', kind: 'gym', type: 'fire', arena: 'cinnabar', badge: ['Volcano Badge', 'flame', '#e0402a'],
    look: look('cap', '#f4f4f4', '#e0a878', '#d84a2a', '#3a3a48', '#f4f4f4'), quote: "Hah! I'm Blaine, the red-hot Leader! My fiery Pokémon will incinerate you!",
    six: ['growlithe', 'ponyta', 'magmar', 'ninetales', 'rapidash', 'arcanine'], three: ['ninetales', 'rapidash', 'arcanine'] },
  { id: 'giovanni', name: 'Giovanni', where: 'Viridian City Gym', kind: 'gym', type: 'ground', arena: 'viridian', badge: ['Earth Badge', 'leaf', '#3ab06a'],
    look: look('bob', '#24202c', '#e0a878', '#d8783a', '#2a2a3a'), quote: 'Fwahahaha! This is my hideout. You will experience true terror!',
    six: ['dugtrio', 'persian', 'nidoqueen', 'kangaskhan', 'nidoking', 'rhydon'], three: ['nidoqueen', 'nidoking', 'rhydon'], megaOn: ['hard'] },
  { id: 'lorelei', name: 'Lorelei', where: 'Elite Four', kind: 'elite', type: 'ice', arena: 'mtSilver',
    look: look('long', '#c83a2a', '#f6d8c0', '#5a3a8a', '#2a2a3a'), quote: 'No one can best me when it comes to icy Pokémon. Freezing moves are powerful!',
    six: ['seadra', 'dewgong', 'cloyster', 'slowbro', 'jynx', 'lapras'], three: ['cloyster', 'jynx', 'lapras'] },
  { id: 'bruno', name: 'Bruno', where: 'Elite Four', kind: 'elite', type: 'fighting', arena: 'indigo',
    look: look('spiky', '#24202c', '#a86a3a', '#3a3a48', '#24202c'), quote: "We will grind you down with our superior power! Hoo hah!",
    six: ['onix', 'hitmonchan', 'hitmonlee', 'poliwrath', 'golem', 'machamp'], three: ['hitmonchan', 'hitmonlee', 'machamp'] },
  { id: 'agatha', name: 'Agatha', where: 'Elite Four', kind: 'elite', type: 'ghost', arena: 'indigo',
    look: look('bun', '#c8c8d0', '#e8c0a0', '#6a3a8a', '#3a2a4a'), quote: "Pokémon are for battling! I'll show you how a real Trainer battles!",
    six: ['arbok', 'golbat', 'weezing', 'haunter', 'hypno', 'gengar'], three: ['golbat', 'haunter', 'gengar'], megaOn: ['hard'] },
  { id: 'lance', name: 'Lance', where: 'Elite Four', kind: 'elite', type: 'dragon', arena: 'indigo',
    look: look('spiky', '#d03a2a', '#f2c7a0', '#2a2a3a', '#4a3a2a'), quote: 'Dragons are mythical Pokémon. They are hard to catch and raise, but their power is superior!',
    six: ['gyarados', 'seadra', 'dragonair', 'aerodactyl', 'charizard', 'dragonite'], three: ['gyarados', 'aerodactyl', 'dragonite'], megaOn: ['hard'] },
  { id: 'blue', name: 'Blue', where: 'Pokémon League Champion', kind: 'champion', type: 'normal', arena: 'indigo',
    look: look('spiky', '#a0602a', '#f2c7a0', '#3a3a48', '#7a5a3a'), quote: "Hey! I was looking forward to seeing you! I'm the most powerful Trainer in the world!",
    megaOn: ['normal', 'hard'] },
];

// Blue takes the starter that beats yours, like in the original games.
const BLUE = {
  bulbasaur: { six: ['pidgeot', 'rhydon', 'exeggutor', 'gyarados', 'alakazam', 'charizard'], three: ['alakazam', 'gyarados', 'charizard'] },
  charmander: { six: ['pidgeot', 'rhydon', 'arcanine', 'exeggutor', 'alakazam', 'blastoise'], three: ['alakazam', 'arcanine', 'blastoise'] },
  squirtle: { six: ['pidgeot', 'rhydon', 'gyarados', 'arcanine', 'alakazam', 'venusaur'], three: ['alakazam', 'gyarados', 'venusaur'] },
};

const BADGES = STAGES.filter(s => s.kind === 'gym');

// ── Where you have been: the areas reached before each battle (same order as STAGES) and the Pokémon
// found there in the original Red/Blue/FireRed/LeafGreen journey. Legendaries are never included.
export const AREAS = [
  [['Route 1', 'Route 22', 'Route 2', 'Viridian Forest'], 'pidgey rattata spearow mankey nidoranF nidoranM caterpie weedle pikachu'],
  [['Route 3', 'Mt. Moon', 'Route 4', 'Routes 24–25'], 'jigglypuff ekans sandshrew zubat geodude paras clefairy magikarp oddish bellsprout abra'],
  [['Routes 5–6', 'Route 11', "Diglett's Cave", 'Vermilion City'], 'meowth drowzee diglett'],
  [['Routes 9–10', 'Rock Tunnel', 'Routes 7–8', 'Celadon City', 'Route 2 trade'], 'voltorb machop onix growlithe vulpix eevee mrMime'],
  [['Pokémon Tower', 'Celadon Game Corner', 'Routes 12–18', 'Safari Zone', 'Good & Super Rod'],
    'gastly cubone dratini scyther pinsir porygon venonat ditto farfetchd snorlax doduo rhyhorn exeggcute chansey kangaskhan tauros lickitung poliwag goldeen krabby horsea shellder staryu slowpoke psyduck tentacool'],
  [['Saffron City', 'Silph Co.', 'Fighting Dojo', 'Power Plant', 'Cerulean trade'], 'lapras hitmonlee hitmonchan magnemite electabuzz grimer jynx'],
  [['Sea Routes 19–21', 'Seafoam Islands', 'Pokémon Mansion', 'Cinnabar Lab'], 'seel koffing ponyta magmar omanyte kabuto aerodactyl'],
  [['Route 21 grass'], 'tangela'],
  [['Route 23', 'Victory Road', 'Trades with other Trainers'], ''],
  [[], ''], [[], ''], [[], ''], [[], ''],
];

// How each Kanto Pokémon evolves: a level, a Moon Stone (Mt. Moon), a Celadon store stone, or a trade.
const EVO = {
  ivysaur: 16, venusaur: 32, charmeleon: 16, charizard: 36, wartortle: 16, blastoise: 36, metapod: 7, butterfree: 10, kakuna: 7, beedrill: 10,
  pidgeotto: 18, pidgeot: 36, raticate: 20, fearow: 20, arbok: 22, raichu: 'stone', sandslash: 22, nidorina: 16, nidoqueen: 'moon',
  nidorino: 16, nidoking: 'moon', clefable: 'moon', ninetales: 'stone', wigglytuff: 'moon', golbat: 22, gloom: 21, vileplume: 'stone',
  parasect: 24, venomoth: 31, dugtrio: 26, persian: 28, golduck: 33, primeape: 28, arcanine: 'stone', poliwhirl: 25, poliwrath: 'stone',
  kadabra: 16, alakazam: 'trade', machoke: 28, machamp: 'trade', weepinbell: 21, victreebel: 'stone', tentacruel: 30, graveler: 25,
  golem: 'trade', rapidash: 40, slowbro: 37, magneton: 30, dodrio: 31, dewgong: 34, muk: 38, cloyster: 'stone', haunter: 25, gengar: 'trade',
  hypno: 26, kingler: 28, electrode: 30, exeggutor: 'stone', marowak: 28, weezing: 35, rhydon: 42, seadra: 32, seaking: 33, starmie: 'stone',
  gyarados: 20, vaporeon: 'stone', jolteon: 'stone', flareon: 'stone', omastar: 40, kabutops: 40, dragonair: 30, dragonite: 55,
};
// The level of each battle's strongest Pokémon in FireRed/LeafGreen: a level-up evolution is ready
// before a battle once your team could plausibly have reached it (two levels below that).
const LEVEL_CAP = [14, 21, 24, 29, 43, 43, 47, 50, 56, 58, 60, 62, 65];
const NEXT = {};
for (const l of KANTO_LINES) l.slice(0, -1).forEach((id, i) => { NEXT[id] = [l[i + 1]]; });
NEXT.eevee = ['vaporeon', 'jolteon', 'flareon'];
const PREV = {};
for (const [id, evos] of Object.entries(NEXT)) for (const e of evos) PREV[e] = id;

// First battle (index into STAGES) before which an evolution is available.
function evoStage(id) {
  const m = EVO[id];
  if (m === 'moon') return 1;
  if (m === 'stone') return 3;
  if (m === 'trade') return 8;
  const i = LEVEL_CAP.findIndex(cap => cap - 2 >= m);
  return i < 0 ? Infinity : i;
}

// Pikachu and Eevee stay selectable after evolving (they are strong in their own right here).
const KEEP_UNEVOLVED = new Set(['pikachu', 'eevee']);
const DEX = id => SPECIES[id].kanto;

// The Pokémon you can bring to battle `i`: your starter and everything found so far, each at the most
// evolved form the story allows by then.
export function poolAt(i, starter) {
  const have = new Set([starter]);
  for (let k = 0; k <= Math.min(i, AREAS.length - 1); k++) for (const id of AREAS[k][1].split(' ')) if (id) have.add(id);
  for (let grew = true; grew;) {
    grew = false;
    for (const id of [...have]) for (const e of NEXT[id] ?? []) if (!have.has(e) && evoStage(e) <= i) { have.add(e); grew = true; }
  }
  return [...new Set([...have].map(id=>isPlayable(id)?id:eligibleReplacement(id)))].filter(storyAllowed).sort((a,b)=>DEX(a)-DEX(b));
}

const lineRoot = id => (PREV[id] ? lineRoot(PREV[id]) : id);
const sameLine = (a, b) => lineRoot(a) === lineRoot(b);

const devolve = id => PREV[id] && id !== 'vaporeon' && id !== 'jolteon' && id !== 'flareon' ? PREV[id] : id;

// Easy: one stage earlier for everyone but the ace (in the League only final forms of three-stage lines
// step back, so it stays a real challenge; nothing turns into a Magikarp).
function easier(stage, id) {
  const l = KANTO_LINES.find(line => line.includes(id));
  if (!l || (stage.kind !== 'gym' && !(l.length === 3 && l[2] === id))) return id;
  const prev = devolve(id);
  return prev === 'magikarp' ? id : prev;
}

// Hard: a Pokémon evolves if the story is about to allow that evolution (at most one battle early).
function stronger(i, id) {
  const e = NEXT[id];
  return e?.length === 1 && evoStage(e[0]) <= i + 1 ? e[0] : id;
}

// The opposing team for a stage, team size and difficulty (ace last). A changed form never duplicates a teammate.
export function teamFor(stage, n, difficulty, starter) {
  const base = stage.id === 'blue' ? BLUE[starter] : stage, i = STAGES.indexOf(stage);
  const src = (n <= 3 ? base.three : base.six).slice(-n);
  const shift = (id, k) => (difficulty === 'easy' ? (k === src.length - 1 ? id : easier(stage, id)) : difficulty === 'hard' ? stronger(i, id) : id);
  const out = [];
  src.forEach((id, k) => {
    const next = shift(id, k);
    out.push(next !== id && (src.includes(next) || out.includes(next)) ? id : next);
  });
  return normalizeTeam(out,n);
}

// Bot skill for battle `i` at a difficulty: interpolated along the campaign (see AI_CURVE).
export const aiFor = (i, difficulty) => aiCurve(i / (STAGES.length - 1), difficulty);

// Bot skill at point t (0 = first battle … 1 = final battle) of a story campaign.
export function aiCurve(t, difficulty) {
  const [a, b] = AI_CURVE[difficulty] ?? AI_CURVE.normal;
  const mix = (x, y) => x + (y - x) * t;
  return {
    gap: [mix(a.gap[0], b.gap[0]), mix(a.gap[1], b.gap[1])], dodge: mix(a.dodge, b.dodge), charge: mix(a.charge, b.charge),
    ultWait: mix(a.ultWait, b.ultWait), typeAware: mix(a.typeAware, b.typeAware), chain: mix(a.chain, b.chain) >= 0.5,
    mega: mix(a.mega, b.mega), guard: mix(a.guard, b.guard), switch: t < 0.3 ? 0 : mix(a.switch, b.switch),
  };
}

// Story teams use Kanto Pokémon; the legendary and mythical ones are left out of the League challenge.
export const storyAllowed = id => isPlayable(id) && !!SPECIES[id]?.kanto && SPECIES[id].class === 'regular';

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || s.v !== 1 || !STARTERS.includes(s.starter)) return null;
    const ids = STAGES.map(st => st.id);
    // Progress is a prefix of the campaign order: anything out of order or unknown is dropped.
    const defeated = [];
    for (const id of ids) if (Array.isArray(s.defeated) && s.defeated.includes(id)) defeated.push(id); else break;
    return {
      v: 1, starter: s.starter, format: s.format === 6 ? 6 : 3, difficulty: DIFFICULTY[s.difficulty] ? s.difficulty : 'normal', defeated,
      wins: Math.max(0, s.wins | 0), losses: Math.max(0, s.losses | 0), complete: defeated.length === STAGES.length,
      team: Array.isArray(s.team) ? s.team.filter(storyAllowed).slice(0, 6) : [],
    };
  } catch {
    return null;
  }
}

export class Story {
  constructor(game, flow, ui) {
    this.game = game;
    this.flow = flow;
    this.ui = ui;
    this.save = loadSave();
    this.bustCache = {};
  }

  persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* storage unavailable: progress lasts this session */ }
  }

  get badges() { return this.save ? Math.min(8, this.save.defeated.length) : 0; }
  get nextIndex() { return this.save ? this.save.defeated.length : 0; }
  // What you can field now: progress decides which areas you have reached (rematches included).
  get stageNow() { return Math.min(this.nextIndex, STAGES.length - 1); }
  get pool() { return poolAt(this.stageNow, this.save.starter); }
  // Battles are as big as the format allows with the Pokémon you have (never padded with extras).
  teamSize(pool = this.pool) { return Math.min(this.save.format, pool.length); }

  bust(stage) {
    return (this.bustCache[stage.id] ??= drawBust(stage.look).toDataURL());
  }

  // ── Entry ──
  open() {
    if (this.save) this.showMap();
    else this.showSetup();
  }

  page(html) {
    this.ui.setStory(null);
    this.game.story = null;
    this.game.toMenu();
    this.flow.togglePause(false);
    this.flow.opening.stop();
    $('#intro').classList.add('hidden');
    music.play('menu');
    const page = $('#story-screen');
    page.innerHTML = `
      <header class="pg-head st-head">
        <span class="dex-lens"></span><span class="dex-leds"><i></i><i></i><i></i></span>
        <h1>KANTO STORY</h1>
        <div class="pg-who"><span>${esc(this.flow.save.name ?? 'TRAINER')}</span></div>
      </header>
      <div class="pg-bar"><button class="dex-btn" data-a="menu">◀ MENU</button><span></span>${this.save ? '<button class="dex-btn" data-a="settings">SETTINGS</button>' : ''}</div>
      ${html}`;
    page.querySelector('[data-a="menu"]').addEventListener('click', () => this.flow.toTitle());
    page.querySelector('[data-a="settings"]')?.addEventListener('click', () => this.showSetup(true));
    this.flow.show('#story-screen');
    page.scrollTop = 0;
    return page;
  }

  // ── New campaign / settings: starter, format and difficulty ──
  showSetup(editing = false) {
    const cur = this.save ?? { format: 3, difficulty: 'normal', starter: null };
    const pick = { ...cur };
    const page = this.page(`
      ${editing ? '' : `<section class="dex-panel"><h2>1 · CHOOSE YOUR STARTER</h2><div class="st-starters">${STARTERS.map(id => {
        const s = SPECIES[id];
        return `<button class="st-starter" data-id="${id}"><span class="ball"><img src="${portrait(id)}" alt=""></span><b>${s.name}</b><span class="tp">${s.types.map(typeChip).join('')}</span></button>`;
      }).join('')}</div><p class="st-note">You start with just your starter. Pokémon from each route, cave and town join your choices as the story reaches them, and they evolve as you progress.</p></section>`}
      <section class="dex-panel"><h2>${editing ? 'BATTLE FORMAT' : '2 · BATTLE FORMAT'}</h2><div class="st-opts" data-k="format">
        <button data-v="3"><b>3 VS 3</b><small>Pick three Pokémon. Every trainer brings three.</small></button>
        <button data-v="6"><b>6 VS 6</b><small>Pick six. Every trainer brings a full team — long, tough battles.</small></button></div></section>
      <section class="dex-panel"><h2>${editing ? 'DIFFICULTY' : '3 · DIFFICULTY'}</h2><div class="st-opts" data-k="difficulty">${Object.entries(DIFFICULTY).map(([k, d]) => `<button data-v="${k}"><b>${d.label.toUpperCase()}</b><small>${d.desc}</small></button>`).join('')}</div></section>
      <div class="st-actions">${editing ? '<button class="dex-go" data-a="back">◀ CAMPAIGN</button><button class="dex-go" data-a="save">SAVE SETTINGS</button><button class="st-reset" data-a="reset">START A NEW CAMPAIGN</button>' : '<button class="dex-go" data-a="go" disabled>CHOOSE A STARTER</button>'}</div>`);
    const sync = () => {
      page.querySelectorAll('.st-starter').forEach(b => b.classList.toggle('on', b.dataset.id === pick.starter));
      page.querySelectorAll('.st-opts').forEach(g => g.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(pick[g.dataset.k]) === b.dataset.v)));
      const go = page.querySelector('[data-a="go"]');
      if (go) {
        go.disabled = !pick.starter;
        go.textContent = pick.starter ? `BEGIN WITH ${SPECIES[pick.starter].name.toUpperCase()} ▶` : 'CHOOSE A STARTER';
      }
    };
    page.querySelectorAll('.st-starter').forEach(b => b.addEventListener('click', () => {
      pick.starter = b.dataset.id;
      sfx.sendOut();
      sync();
    }));
    page.querySelectorAll('.st-opts').forEach(g => g.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      pick[g.dataset.k] = g.dataset.k === 'format' ? +b.dataset.v : b.dataset.v;
      sync();
    })));
    page.querySelector('[data-a="go"]')?.addEventListener('click', () => {
      if (!pick.starter) return;
      this.save = { v: 1, starter: pick.starter, format: pick.format, difficulty: pick.difficulty, defeated: [], wins: 0, losses: 0, complete: false, team: [] };
      this.persist();
      sfx.megaBurst();
      this.showMap();
    });
    page.querySelector('[data-a="back"]')?.addEventListener('click', () => this.showMap());
    page.querySelector('[data-a="save"]')?.addEventListener('click', () => {
      Object.assign(this.save, { format: pick.format, difficulty: pick.difficulty });
      this.persist();
      this.showMap();
    });
    page.querySelector('[data-a="reset"]')?.addEventListener('click', e => {
      const b = e.currentTarget;
      if (!b.dataset.sure) {
        b.dataset.sure = '1';
        b.textContent = 'TAP AGAIN TO ERASE YOUR PROGRESS';
        return;
      }
      localStorage.removeItem(SAVE_KEY);
      this.save = null;
      this.showSetup();
    });
    sync();
  }

  // ── Campaign map: badge case, the road through the League, and the next challenge ──
  showMap(selectId) {
    if (!this.save) return this.showSetup();
    const s = this.save, next = this.nextIndex;
    const sel = STAGES.find(st => st.id === selectId) ?? STAGES[Math.min(next, STAGES.length - 1)];
    const state = i => (i < next ? 'done' : i === next ? 'next' : 'locked');
    const badgeCase = BADGES.map((b, i) => `<span class="st-badge${i < this.badges ? ' got' : ''}" title="${b.badge[0]}">${this.badgeIcon(b)}<small>${b.badge[0].replace(' Badge', '')}</small></span>`).join('');
    const card = (st, i) => `<button class="st-stage ${state(i)}${st === sel ? ' sel' : ''}" data-id="${st.id}" ${state(i) === 'locked' ? 'disabled' : ''}>
        <img class="st-bust" src="${this.bust(st)}" alt=""><span class="st-who"><b>${st.name}</b><small>${st.kind === 'gym' ? st.where.replace(' Gym', '') : st.where}</small></span>
        <span class="st-type" style="background:${TYPE_COLORS[st.type][1]}">${st.type}</span>
        <span class="st-mark">${state(i) === 'done' ? '✓' : state(i) === 'next' ? '▶' : '🔒'}</span></button>`;
    const gyms = STAGES.map((st, i) => (st.kind === 'gym' ? card(st, i) : '')).join('');
    const league = STAGES.map((st, i) => (st.kind !== 'gym' ? card(st, i) : '')).join('');
    const pool = this.pool, areas = AREAS.slice(0, this.stageNow + 1).flatMap(a => a[0]);
    const page = this.page(`
      <section class="dex-panel st-top">
        <div class="st-partner"><span class="ball"><img src="${portrait(pool.find(id => sameLine(id, s.starter)) ?? s.starter)}" alt=""></span><div><small>STARTER</small><b>${SPECIES[pool.find(id => sameLine(id, s.starter)) ?? s.starter].name}</b></div></div>
        <div class="st-stats"><span>${s.format} VS ${s.format}</span><span>${DIFFICULTY[s.difficulty].label.toUpperCase()}</span><span>${s.wins} WINS</span><span>${this.badges}/8 BADGES</span></div>
        <div class="st-case">${badgeCase}</div>
      </section>
      <section class="dex-panel st-box"><h2>YOUR POKÉMON · ${pool.length} AVAILABLE</h2>
        <div class="st-areas">${areas.map(a => `<span>${esc(a)}</span>`).join('')}</div>
        <div class="st-pool">${pool.map(id => `<span class="st-pmon" title="${SPECIES[id].name}"><img src="${portrait(id)}" alt=""><b>${SPECIES[id].name}</b></span>`).join('')}</div>
      </section>
      <div class="st-main">
        <section class="dex-panel"><h2>KANTO GYMS</h2><div class="st-route">${gyms}</div>
          <h2 class="st-h2">POKÉMON LEAGUE ${this.badges < 8 ? '<small>· NEEDS ALL 8 BADGES</small>' : ''}</h2><div class="st-route">${league}</div>
          ${s.complete ? '<button class="dex-go" data-a="hall">HALL OF FAME ▶</button>' : ''}</section>
        <section class="dex-panel st-detail">${this.detailHtml(sel, STAGES.indexOf(sel))}</section>
      </div>`);
    page.querySelectorAll('.st-stage').forEach(b => b.addEventListener('click', () => this.showMap(b.dataset.id)));
    page.querySelector('[data-a="challenge"]')?.addEventListener('click', () => this.challenge(sel));
    page.querySelector('[data-a="hall"]')?.addEventListener('click', () => this.showComplete());
    if (selectId) page.querySelector('.st-detail').scrollIntoView({ block: 'nearest' });
  }

  detailHtml(st, i) {
    const s = this.save, locked = i > this.nextIndex, done = i < this.nextIndex;
    const n = this.teamSize(), team = teamFor(st, n, s.difficulty, s.starter);
    const role = st.kind === 'gym' ? `GYM LEADER · ${st.where.toUpperCase()}` : st.kind === 'elite' ? 'ELITE FOUR' : 'CHAMPION';
    return `
      <div class="st-leader"><img class="st-bust big" src="${this.bust(st)}" alt=""><div><small>${role}</small><b>${st.name}</b>
        <span class="tp">${typeChip(st.type)}</span>${st.badge ? `<span class="st-prize">${this.badgeIcon(st)} ${st.badge[0]}</span>` : ''}</div></div>
      <p class="st-quote">“${esc(st.quote)}”</p>
      <h3>${st.name.toUpperCase()}'S TEAM · ${n} VS ${n} · ${DIFFICULTY[s.difficulty].label.toUpperCase()}</h3>
      <div class="st-team">${team.map((id, k) => `<span class="st-mon"><img src="${portrait(id)}" alt=""><b>${SPECIES[id].name}</b><span class="tp">${SPECIES[id].types.map(typeChip).join('')}</span>${k === team.length - 1 ? '<em>ACE</em>' : ''}</span>`).join('')}</div>
      ${locked ? `<p class="st-lock">🔒 ${st.kind === 'gym' ? 'Beat the previous Gym first.' : this.badges < 8 ? 'Earn all eight badges to enter the Pokémon League.' : 'Defeat the previous Elite Four member first.'}</p>`
        : `<button class="dex-go" data-a="challenge">${done ? `REMATCH ${st.name.toUpperCase()} ▶` : `CHALLENGE ${st.name.toUpperCase()} ▶`}</button>`}`;
  }

  badgeIcon(st) {
    const [, shape, color] = st.badge;
    return `<i class="bdg s-${shape}" style="--c:${color}"></i>`;
  }

  // ── Battle: team select limited to the Pokémon you have found, against the stage's team ──
  challenge(st) {
    const s = this.save, pool = this.pool, n = this.teamSize(pool), foes = teamFor(st, n, s.difficulty, s.starter);
    const g = this.game, ui = this.ui;
    this.current = st;
    this.flow.show(null);
    this.flow.screen = 'select';
    $('#story-screen').classList.add('hidden');
    g.arenaId = st.arena;
    g.gold.name = st.name;
    g.gold.setPalette(frontPalette(st.look));
    ui.setFormat(n);
    // Your last team, with each member at its current form; your starter if you have no team yet.
    const upgrade = id => (pool.includes(id) ? id : pool.find(p => sameLine(p, id)));
    const last = [...new Set(s.team.map(upgrade).filter(Boolean))];
    ui.selection = (last.length ? last : [pool.find(id => sameLine(id, s.starter)) ?? pool[0]]).slice(0, n);
    ui.lead = 0;
    ui.setStory({
      stage: st, pool: new Set(pool), foes, format: n, difficulty: DIFFICULTY[s.difficulty].label, aiConfig: aiFor(STAGES.indexOf(st), s.difficulty),
      mega: (st.megaOn ?? []).includes(s.difficulty), arena: st.arena, playerMega: this.badges >= 8,
    });
    g.toSelect();
  }

  rememberTeam(team) {
    this.save.team = team.filter(storyAllowed);
    this.persist();
  }

  // ── After the battle ──
  onResult(win) {
    const st = this.current, s = this.save;
    if (!st || !s) return;
    const i = STAGES.indexOf(st), first = win && i === this.nextIndex;
    const before = new Set(this.pool);
    if (win) s.wins++;
    else s.losses++;
    if (first) s.defeated.push(st.id);
    s.complete = s.defeated.length === STAGES.length;
    this.persist();
    const box = $('#result-text');
    let html;
    if (win) {
      // New areas and evolutions now open to you.
      const fresh = first ? this.pool.filter(id => !before.has(id)) : [];
      const places = first ? (AREAS[this.stageNow]?.[0] ?? []) : [];
      const evolved = fresh.length ? `<div class="st-new"><small>NEW POKÉMON AVAILABLE${places.length ? ` · ${esc(places.join(' · '))}` : ''}</small>
        <div>${fresh.map(id => `<span class="st-pmon"><img src="${portrait(id)}" alt=""><b>${SPECIES[id].name}</b></span>`).join('')}</div></div>` : '';
      const prize = first && st.badge
        ? `<div class="st-get">${this.badgeIcon(st)}<b>${esc(this.flow.save.name ?? 'You')} received the ${st.badge[0]}!</b></div>`
        : first && st.kind === 'elite' ? `<div class="st-get"><b>${st.name} of the Elite Four defeated!</b></div>`
        : first && st.kind === 'champion' ? '<div class="st-get champ"><b>YOU ARE THE NEW KANTO CHAMPION!</b></div>' : '';
      const nextSt = STAGES[this.nextIndex];
      const tip = nextSt && first ? `<p class="st-next">Next: <b>${nextSt.name}</b> — ${nextSt.where}</p>` : '';
      html = `<b class="win">Victory!</b><p>You defeated ${st.name}!</p>${prize}${evolved}${tip}
        <div class="st-res-btns">${s.complete && first ? '<button class="big-btn" data-a="hall">Hall of Fame ▶</button>' : '<button class="big-btn" data-a="map">Continue ▶</button>'}</div>`;
      sfx.megaBurst();
    } else {
      const strong = Object.keys(TYPE_COLORS).filter(t => typeMultiplier(t, [st.type]) > 1);
      html = `<b class="lose">Defeat…</b><p>${st.name} won this time.</p>
        <p class="st-tip">Tip: ${st.name} uses ${st.type.toUpperCase()}-type Pokémon. ${strong.length ? `Try ${strong.map(t => t.toUpperCase()).join(', ')} moves.` : ''} Dodge (Space) through big attacks.</p>
        <div class="st-res-btns"><button class="big-btn" data-a="retry">Retry</button><button class="big-btn alt" data-a="map">Campaign Map</button></div>`;
    }
    box.innerHTML = html;
    $('#again-btn').classList.add('hidden');
    $('#leave-btn').hidden = true;
    $('#result-overlay').classList.remove('hidden');
    box.querySelector('[data-a="map"]')?.addEventListener('click', () => this.showMap(win && first ? STAGES[this.nextIndex]?.id : st.id));
    box.querySelector('[data-a="retry"]')?.addEventListener('click', () => this.challenge(st));
    box.querySelector('[data-a="hall"]')?.addEventListener('click', () => this.showComplete());
  }

  // ── Campaign completion ──
  showComplete() {
    const s = this.save, team = s.team.slice(0, s.format);
    const page = this.page(`
      <section class="dex-panel st-hall">
        <h2>HALL OF FAME</h2>
        <div class="st-get champ"><b>${esc(this.flow.save.name ?? 'TRAINER')} · KANTO CHAMPION</b></div>
        <div class="st-team">${team.map(id => `<span class="st-mon"><img src="${portrait(id)}" alt=""><b>${SPECIES[id].name}</b></span>`).join('')}</div>
        <div class="st-case">${BADGES.map(b => `<span class="st-badge got">${this.badgeIcon(b)}<small>${b.badge[0].replace(' Badge', '')}</small></span>`).join('')}</div>
        <div class="st-stats"><span>${s.format} VS ${s.format}</span><span>${DIFFICULTY[s.difficulty].label.toUpperCase()}</span><span>${s.wins} VICTORIES</span><span>${s.losses} DEFEATS</span><span>8/8 BADGES</span><span>ELITE FOUR ✓</span><span>CHAMPION ✓</span></div>
        <div class="st-actions"><button class="dex-go" data-a="map">CAMPAIGN MAP</button><button class="dex-go" data-a="new">NEW CAMPAIGN</button></div>
      </section>`);
    page.querySelector('[data-a="map"]').addEventListener('click', () => this.showMap());
    page.querySelector('[data-a="new"]').addEventListener('click', () => this.showSetup(true));
  }
}
