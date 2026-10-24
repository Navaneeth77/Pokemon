import { SPECIES } from './data/species.js';

// Pokémon Mastery: long-term records kept in this browser only (no account). Each battle builds a
// summary while it runs (recordCombat); when the result is known it is saved once (saveSummary, which
// ignores a summary id it has already seen). Online, the summary comes from the match server. Mastery
// never changes battle stats; it only unlocks badges and cosmetic titles.

export const MASTERY_THRESHOLDS = [0, 100, 250, 500, 900, 1500, 2400, 3600, 5200, 7500];
const KEY = 'msb.mastery', VERSION = 2;
const DIFF_RANK = ['easy', 'normal', 'hard', 'legendary'];
const COUNTERS = ['damage', 'received', 'hits', 'kos', 'faints', 'ultimates', 'mega', 'switches', 'reactions', 'bossDamage'];

const blank = () => ({
  version: VERSION, species: {}, matches: [], processed: [], arenas: {}, moves: {},
  profile: { battles: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0 }, raids: {}, typesWon: [], title: null, cosmetics: {}, entryIds: [],
});
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const num = v => (Number.isFinite(v) ? v : 0);

// Reads whatever is stored, keeping only well-formed parts: corrupt or older data never crashes the
// game, and version 1 saves (before profiles and badges) are carried over.
export function readMastery(storage = localStorage) {
  const clean = blank();
  let x;
  try {
    x = JSON.parse(storage.getItem(KEY));
  } catch {
    return clean;
  }
  if (!isObj(x) || ![1, 2].includes(x.version) || !isObj(x.species)) return clean;
  for (const [id, r] of Object.entries(x.species)) if (SPECIES[id] && isObj(r) && Number.isFinite(r.xp) && Array.isArray(r.discovered)) {
    const cleanRow = clean.species[id] = { ...row(), ...r, entries: num(r.entries ?? r.battles), completed: num(r.completed ?? r.battles), bestDamage: num(r.bestDamage), bestWin: num(r.bestWin), bestRaid: DIFF_RANK.includes(r.bestRaid)?r.bestRaid:null };
    for(const key of [...COUNTERS,'xp','battles','wins','losses','streak','bestStreak','raids','drafts','draftWins']) cleanRow[key]=Math.max(0,num(cleanRow[key]));
    cleanRow.discovered=r.discovered.filter(v=>typeof v==='string').slice(0,16);
    cleanRow.milestones=Array.isArray(r.milestones)?r.milestones.filter(v=>isObj(v)&&Number.isInteger(v.level)&&Number.isFinite(v.at)).slice(-10):[];
  }
  if (isObj(x.cosmetics)) clean.cosmetics = x.cosmetics;
  if (Array.isArray(x.entryIds)) clean.entryIds = x.entryIds.filter(v => typeof v === 'string').slice(-500);
  if (Array.isArray(x.processed)) clean.processed = x.processed.filter(v => typeof v === 'string').slice(-500);
  if (Array.isArray(x.matches)) clean.matches = x.matches.filter(m => isObj(m) && typeof m.result === 'string' && isObj(m.species)).slice(0, 30);
  if (isObj(x.arenas)) clean.arenas = x.arenas;
  if (isObj(x.moves)) clean.moves = x.moves;
  if (isObj(x.profile)) for (const k of Object.keys(clean.profile)) clean.profile[k] = num(x.profile[k]);
  else {
    // Version 1 had no profile: rebuild what the saved matches allow.
    for (const m of clean.matches) {
      clean.profile.battles++;
      if (m.result === 'win') clean.profile.wins++;
      if (m.result === 'loss') clean.profile.losses++;
    }
  }
  if (isObj(x.raids)) for (const [b, d] of Object.entries(x.raids)) if (DIFF_RANK.includes(d)) clean.raids[b] = d;
  if (Array.isArray(x.typesWon)) clean.typesWon = x.typesWon.filter(t => typeof t === 'string').slice(0, 18);
  if (typeof x.title === 'string') clean.title = x.title;
  return clean;
}

function store(data, storage) {
  try {
    storage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function level(xp) {
  return MASTERY_THRESHOLDS.filter(n => xp >= n).length;
}

// ── While a battle runs ──
export function newSummary(game) {
  return { id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, events: [], droppedEvents: 0, species: { player: {}, opponent: {} }, moves: { player: {}, opponent: {} }, arena: game.arenaId ?? 'mtSilver' };
}

const row = () => ({ damage: 0, received: 0, hits: 0, kos: 0, faints: 0, ultimates: 0, mega: 0, switches: 0, reactions: 0, bossDamage: 0, discovered: [] });

// Only the game that decides a Pokémon's actions records them (remote copies are skipped), so a
// predicted move and the server's confirmation are never both counted.
export function recordCombat(game, kind, actor, target, details = {}) {
  if (game.practice || actor?.remote || !actor || !game.summary) return;
  const summary = game.summary;
  if (kind === 'entered') {
    const rows = summary.species[actor.side];
    const stat = rows[actor.baseSpecies.id] ??= row();
    stat.entered = 1;
    if (!game.online?.authority && actor.side === 'player') saveEntry(summary.id, actor.baseSpecies.id);
  }
  if (kind !== 'entered') {
    summary.events ??= [];
    if (summary.events.length < 600) summary.events.push({
      n: summary.events.length, t: Math.round(game.time * 10) / 10, kind,
      side: actor.side, actor: actor.baseSpecies.id, target: target?.baseSpecies.id,
      move: details.id ?? details.move, damage: details.damage == null ? undefined : Math.round(details.damage), reaction: details.reaction,
    });
    else summary.droppedEvents = (summary.droppedEvents ?? 0) + 1;
  }
  if (actor.boss) {
    if (kind === 'hit' && target && !target.boss) (summary.species[target.side][target.baseSpecies.id] ??= row()).received += details.damage;
    return;
  }
  const side = actor.side, s = (game.summary.species[side][actor.baseSpecies.id] ??= row());
  if (kind === 'hit') {
    s.damage += details.damage;
    s.hits++;
    if (target?.boss) s.bossDamage += details.damage;
    if (target && !target.boss) (game.summary.species[target.side][target.baseSpecies.id] ??= row()).received += details.damage;
  } else if (kind === 'reaction') {
    s.reactions++;
    if (!s.discovered.includes(details.reaction)) s.discovered.push(details.reaction);
  } else if (kind === 'move') {
    if (details.ultimate) s.ultimates++;
    game.summary.moves[side][details.id] = (game.summary.moves[side][details.id] ?? 0) + 1;
  } else if (kind === 'faint') {
    s.faints++;
    if (target && !target.boss) (game.summary.species[target.side][target.baseSpecies.id] ??= row()).kos++;
  } else if (kind === 'mega') s.mega++;
  else if (kind === 'switch') s.switches++;
}

export function resultSummary(game, side = 'player', extra = {}) {
  const raid = game.raid ? { raid: game.raid.id, difficulty: game.raid.difficulty } : {};
  return { events: game.summary.events ?? [], droppedEvents: game.summary.droppedEvents ?? 0, replaySide: side, id: game.summary.id, arena: game.summary.arena, duration: Math.round(game.time), species: game.summary.species[side], moves: game.summary.moves[side], mode: game.raid ? 'raid' : game.online && !game.online.server ? 'friend' : 'battle', survivors: (side === 'player' ? game.playerTeam : game.opponentTeam).members.filter(m => m.alive).map(m => ({id:m.baseSpecies.id,hp:Math.ceil(m.hp),maxHp:m.maxHp})), ...raid, ...extra };
}

// ── When the result is known ──
export function saveSummary(summary, storage = localStorage) {
  if (!summary?.id || !isObj(summary.species) || !['win', 'loss', 'draw'].includes(summary.result)) return false;
  const data = readMastery(storage);
  if (data.processed.includes(summary.id)) return false;
  const win = summary.result === 'win', p = data.profile;
  p.battles++;
  if (win) {
    p.wins++;
    p.streak++;
    p.bestStreak = Math.max(p.bestStreak, p.streak);
  } else {
    if (summary.result === 'loss') p.losses++;
    p.streak = 0;
  }
  for (const [id, s] of Object.entries(summary.species)) {
    if (!/^[A-Za-z0-9]+$/.test(id) || !isObj(s)) continue;
    const r = (data.species[id] ??= { ...row(), battles: 0, wins: 0, losses: 0, xp: 0, streak: 0, bestStreak: 0, raids: 0, drafts: 0, draftWins: 0 });
    const entryKey = `${summary.id}:${id}`;
    if (!data.entryIds.includes(entryKey)) { r.entries = (r.entries ?? 0) + 1; data.entryIds.push(entryKey); }
    r.completed = (r.completed ?? 0) + 1;
    r.bestDamage = Math.max(r.bestDamage ?? 0, num(s.damage));
    if (win && summary.duration > 0) r.bestWin = r.bestWin ? Math.min(r.bestWin, summary.duration) : summary.duration;
    if (summary.mode === 'raid' && win && DIFF_RANK.indexOf(summary.difficulty) > DIFF_RANK.indexOf(r.bestRaid)) r.bestRaid = summary.difficulty;
    r.battles++;
    if (win) {
      r.wins++;
      r.streak++;
    } else {
      if (summary.result === 'loss') r.losses++;
      r.streak = 0;
    }
    r.bestStreak = Math.max(r.bestStreak, r.streak);
    for (const key of COUNTERS) r[key] = (r[key] ?? 0) + Math.max(0, Math.min(1e6, Number(s[key]) || 0));
    r.discovered = [...new Set([...(r.discovered ?? []), ...(Array.isArray(s.discovered) ? s.discovered : [])])].slice(0, 16);
    // XP for taking part, for real damage and for winning; capped per battle so it can't be farmed.
    const beforeLevel = level(r.xp);
    r.xp += matchXP(s, summary.result);
    r.milestones ??= [];
    for (let lv=beforeLevel+1;lv<=level(r.xp);lv++) r.milestones.push({level:lv,match:summary.id,at:Date.now()});
    r.milestones = r.milestones.slice(-10);
    if (summary.mode === 'raid') r.raids++;
    if (summary.mode === 'draft') {
      r.drafts++;
      if (win) r.draftWins++;
    }
    if (win) for (const t of SPECIES[id]?.types ?? []) if (!data.typesWon.includes(t)) data.typesWon.push(t);
  }
  if (summary.mode === 'raid' && win && DIFF_RANK.includes(summary.difficulty)) {
    const best = data.raids[summary.raid];
    if (!best || DIFF_RANK.indexOf(summary.difficulty) > DIFF_RANK.indexOf(best)) data.raids[summary.raid] = summary.difficulty;
  }
  data.arenas[summary.arena] = (data.arenas[summary.arena] ?? 0) + 1;
  for (const [id, n] of Object.entries(summary.moves ?? {})) data.moves[id] = (data.moves[id] ?? 0) + (Number(n) || 0);
  data.entryIds = data.entryIds.slice(-500);
  data.processed.push(summary.id);
  data.processed = data.processed.slice(-500);
  data.matches.unshift(summary);
  data.matches = data.matches.slice(0, 30);
  return store(data, storage);
}

// ── Badges and titles (cosmetic only) ──
const total = (d, k) => Object.values(d.species).reduce((n, r) => n + (r[k] ?? 0), 0);
const topLevel = d => Math.max(0, ...Object.values(d.species).map(r => level(r.xp)));

export const BADGES = [
  { id: 'first-win', name: 'First Victory', desc: 'Win a battle.', test: d => d.profile.wins >= 1 },
  { id: 'veteran', name: 'Veteran', desc: 'Finish 50 battles.', test: d => d.profile.battles >= 50 },
  { id: 'on-fire', name: 'On Fire', desc: 'Win 5 battles in a row.', test: d => d.profile.bestStreak >= 5 },
  { id: 'adept', name: 'Elemental Adept', desc: 'Trigger 25 elemental reactions.', test: d => total(d, 'reactions') >= 25 },
  { id: 'elementalist', name: 'Elementalist', desc: 'Discover all 7 reactions.', test: d => new Set(Object.values(d.species).flatMap(r => r.discovered ?? [])).size >= 7 },
  { id: 'mega', name: 'Mega Master', desc: 'Mega Evolve 10 times.', test: d => total(d, 'mega') >= 10 },
  { id: 'showstopper', name: 'Showstopper', desc: 'Use 50 ultimates.', test: d => total(d, 'ultimates') >= 50 },
  { id: 'raid', name: 'Raid Victor', desc: 'Defeat a legendary raid boss.', test: d => Object.keys(d.raids).length >= 1 },
  { id: 'hunter', name: 'Legend Hunter', desc: 'Defeat Rayquaza, Mewtwo and Lugia.', test: d => ['rayquaza', 'mewtwo', 'lugia'].every(b => d.raids[b]) },
  { id: 'mythbreaker', name: 'Mythbreaker', desc: 'Defeat a raid boss on Legendary.', test: d => Object.values(d.raids).includes('legendary') },
  { id: 'drafter', name: 'Draft Day', desc: 'Win a draft battle.', test: d => total(d, 'draftWins') >= 1 },
  { id: 'collector', name: 'Type Collector', desc: 'Win with Pokémon of all 18 types.', test: d => d.typesWon.length >= 18 },
  { id: 'rising', name: 'Rising Star', desc: 'Reach mastery level 5 with one Pokémon.', test: d => topLevel(d) >= 5 },
  { id: 'bond', name: 'Champion Bond', desc: 'Reach mastery level 10 with one Pokémon.', test: d => topLevel(d) >= 10 },
];

export const earnedBadges = d => BADGES.filter(b => b.test(d));

export function setTitle(id, storage = localStorage) {
  const data = readMastery(storage);
  data.title = id && earnedBadges(data).some(b => b.id === id) ? id : null;
  return store(data, storage);
}

// The chosen title's name, if it is still earned.
export function currentTitle(storage = localStorage) {
  const data = readMastery(storage);
  return earnedBadges(data).find(b => b.id === data.title)?.name ?? null;
}

// Trainer profile figures shown on the Mastery page.
export function profileStats(d) {
  const species = Object.entries(d.species).filter(([id]) => SPECIES[id]);
  const by = k => species.slice().sort((a, b) => (b[1][k] ?? 0) - (a[1][k] ?? 0))[0]?.[0] ?? null;
  const fav = Object.entries(d.arenas).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const moves = Object.entries(d.moves).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
  const p = d.profile, rate = p.battles ? Math.round((p.wins / p.battles) * 100) : 0;
  return { ...p, rate, favorite: by('battles'), top: by('xp'), arena: fav, moves, reactions: total(d, 'reactions'), bossDamage: total(d, 'bossDamage') };
}


export function saveEntry(matchId, id, storage = localStorage) {
  if (!SPECIES[id]) return false;
  const data = readMastery(storage), key = `${matchId}:${id}`;
  if (data.entryIds.includes(key)) return false;
  const r = data.species[id] ??= { ...row(), xp:0, battles:0, wins:0, losses:0, streak:0, bestStreak:0, raids:0, drafts:0, draftWins:0, completed:0 };
  r.entries = (r.entries ?? 0) + 1;
  data.entryIds.push(key); data.entryIds = data.entryIds.slice(-500);
  return store(data, storage);
}

export const COSMETICS = [
  {id:'bronze',kind:'frame',name:'Bronze trainer frame',at:2,color:'#dca26a'},
  {id:'silver',kind:'frame',name:'Silver trainer frame',at:5,color:'#d4e8ff'},
  {id:'champion',kind:'frame',name:'Champion trainer frame',at:10,color:'#ffe074'},
  {id:'hop',kind:'pose',name:'Victory hop',at:3,anim:'Hop'},
  {id:'roar',kind:'pose',name:'Victory roar',at:7,anim:'Roar'},
  {id:'starlight',kind:'effect',name:'Starlight send-out',at:4,color:'#9eeaff'},
  {id:'sunburst',kind:'effect',name:'Sunburst send-out',at:8,color:'#ffd46c'},
];
export const unlockedCosmetics = data => COSMETICS.filter(c => topLevel(data) >= c.at);
export function equipCosmetic(kind, id, storage = localStorage) {
  const data = readMastery(storage);
  if (!['frame','pose','effect'].includes(kind) || (id && !unlockedCosmetics(data).some(c=>c.kind===kind && c.id===id))) return false;
  data.cosmetics[kind] = id || null; return store(data,storage);
}
export function cosmeticLoadout(storage = localStorage) {
  const data = readMastery(storage), available = unlockedCosmetics(data);
  return Object.fromEntries(['frame','pose','effect'].map(kind=>[kind,available.find(c=>c.kind===kind && c.id===data.cosmetics[kind]) ?? null]));
}
export const matchXP = (s, result) => Math.min(100,20+Math.floor(num(s.damage)/100)+(result==='win'?30:0));
