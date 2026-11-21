import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSavedTeam } from '../src/ui.js';
import { cleanWallet, freshWallet, rollover } from '../src/economy.js';
import { SPECIES, spritesFor } from '../src/data/species.js';
import { Game, beamsMeet } from '../src/game.js';
import { loadSpriteSets } from '../server/sprites.js';
import { MOVES } from '../src/moves.js';
import { hasAddedEffect, onHit } from '../src/effects-resolver.js';

const sprites = loadSpriteSets(), noop = () => {};
function duel(attacker, foe) {
  const ui = new Proxy({ format: 1, log: noop }, { get: (t, k) => t[k] ?? noop });
  const g = new Game(document.createElement('canvas'), { ...sprites }, ui); // its own table: trimming tests release sets
  g.headless = true;
  Object.assign(g, { selection: [attacker], lead: 0, opponentSelection: [foe], difficulty: 'easy' });
  g.start();
  Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
  g.ai = { update: noop, reset: noop, onThreat: noop };
  g.input = { vector: () => ({ x: 0, y: 0 }), clear: noop };
  for (const m of [g.player, g.opponent]) Object.assign(m, { hidden: false, appear: 0, item: null });
  return g;
}
// The foe rolls sideways just as the shot arrives; returns whether it was hit and the foe.
function rollThrough(foeAbility) {
  const g = duel('charizard', 'jolteon'), p = g.player, o = g.opponent;
  Object.assign(p, { x: 180, y: 540 }); Object.assign(o, { x: 180, y: 260 });
  if (foeAbility) o.abilityOverride = foeAbility;
  const hp0 = o.hp, ult0 = o.ult;
  assert.ok(g.useMove(p, 'fireBlast'));
  let rolled = 0;
  for (let t = 0; t < 2.5; t += 1 / 60) {
    const shot = g.effects.find(e => e.constructor.name === 'SeqShot' && !e.dead);
    if (shot && Math.hypot(shot.x - o.x, shot.y - o.y) < 60 && !(o.dodgeT > 0) && !rolled && g.dodge(o, 0, 1, true)) rolled++;
    g.update(1 / 60);
  }
  assert.ok(rolled, 'the foe rolled');
  return { hit: o.hp < hp0, charged: o.ult > ult0 };
}

test('saved teams keep only known fields and valid Mega picks', () => {
  const t = cleanSavedTeam({ name: 'x'.repeat(90), format: '3<img src=x onerror=alert(1)>', team: ['charizard', 'blastoise', 'venusaur', { evil: 1 }], lead: 99,
    mega: { charizard: 'charizardMegaY', blastoise: '<svg onload=alert(1)>' }, extra: '<script>' });
  assert.deepEqual(Object.keys(t).sort(), ['format', 'lead', 'mega', 'name', 'rosterVersion', 'team']);
  assert.equal(t.name.length, 40);
  assert.equal(t.format, 3);
  assert.equal(t.lead, t.team.length - 1);
  assert.ok(t.team.every(id => typeof id === 'string' && SPECIES[id]));
  assert.deepEqual(t.mega, SPECIES.charizard.mega.includes('charizardMegaY') ? { charizard: 'charizardMegaY' } : {});
});

test('wallets are rebuilt from the mission pool, so stored markup never reaches the page', () => {
  const w = rollover(freshWallet('p1', Date.parse('2026-11-21T10:00:00Z')), Date.parse('2026-11-21T10:00:00Z'));
  const bad = structuredClone(w);
  bad.day.missions[0] = { ...bad.day.missions[0], id: '"><img src=x onerror=alert(1)>', art: '<b>', progress: '1e9', target: '<i>', reward: 'x', title: '<script>' };
  bad.day.missions[1].progress = 999; bad.day.missions[1].claimed = 'yes';
  bad.owned = ['frame-amethyst', 'not-an-item', 5]; bad.equipped = { frame: 'frame-amethyst', title: 'frame-amethyst', aura: 'aura-jade' };
  bad.history = [{ id: 'a', amount: 5, reason: 'ok', at: 1 }, { id: 'b', amount: '<b>', reason: 'x', at: 1 }, { id: 'c', amount: 1, reason: 'y', at: 1e300 }];
  bad.week.wins = '<svg>';
  const c = cleanWallet(bad, 'p1');
  assert.deepEqual(c.day.missions.map(m => m.id), w.day.missions.map(m => m.id));
  for (const m of c.day.missions) { assert.ok(SPECIES[m.art]); assert.ok(Number.isInteger(m.progress) && m.progress <= m.target); assert.equal(typeof m.claimed, 'boolean'); }
  assert.equal(c.day.missions[1].progress, c.day.missions[1].target);
  assert.equal(c.day.missions[1].claimed, false);
  assert.deepEqual(c.owned, ['frame-amethyst']);
  assert.deepEqual(c.equipped, { frame: 'frame-amethyst' });
  assert.deepEqual(c.history.map(h => h.id), ['a']);
  assert.equal(c.week.wins, 0);
  assert.equal(cleanWallet({ ...w, pid: 'other' }, 'p1'), null);
  assert.equal(cleanWallet({ ...w, balance: -1 }, 'p1'), null);
});

test('a dodged projectile counts as a dodge (ultimate charge), and No Guard makes it land', () => {
  const dodged = rollThrough(null);
  assert.equal(dodged.hit, false);
  assert.ok(dodged.charged, 'dodging the shot gave ultimate charge like a melee dodge');
  assert.ok(rollThrough('noGuard').hit, 'No Guard: the dodge does not avoid it');
});

test('a fast projectile cannot skip past a target between frames', () => {
  const g = duel('charizard', 'snorlax'), p = g.player, o = g.opponent;
  Object.assign(p, { x: 180, y: 540 }); Object.assign(o, { x: 180, y: 300 });
  const hp0 = o.hp;
  assert.ok(g.useMove(p, 'fireBlast'));
  for (let t = 0; t < 0.6; t += 1 / 60) g.update(1 / 60);
  const shot = g.effects.find(e => e.constructor.name === 'SeqShot' && !e.dead);
  assert.ok(shot && shot.y > o.y + 100, 'the shot is still well short of the foe');
  // One step carries it from short of the foe to past it (and past its reach).
  shot.P = { ...shot.P, speed: 60 * 250 };
  g.update(1 / 60);
  for (let t = 0; t < 1.5; t += 1 / 60) g.update(1 / 60);
  assert.ok(o.hp < hp0, 'it hit the foe it passed through');
});

test('Sheer Force has one rule, and primary effects ignore Shield Dust and the Covert Cloak', () => {
  assert.equal(hasAddedEffect(MOVES.flamethrower), true);
  assert.equal(hasAddedEffect(MOVES.saltCure), false);
  const g = duel('charizard', 'snorlax'), p = g.player, o = g.opponent;
  o.item = 'covertCloak';
  onHit(g, p, o, MOVES.saltCure, 10, {});
  assert.ok(o.salted, 'Salt Cure still salts through a Covert Cloak');
  o.stages = { atk: 2 };
  onHit(g, p, o, MOVES.clearSmog ?? { ...MOVES.saltCure, id: 'clearSmog' }, 10, {});
  assert.deepEqual(o.stages, {}, 'Clear Smog still resets stat changes');
});

test('beams clash only when their finite paths meet', () => {
  const beam = (aim, range = 260, width = 12) => ({ aim, move: { range, beam: { width } } });
  const A = { x: 100, y: 500 }, B = { x: 100, y: 200 };
  assert.ok(beamsMeet(A, beam(-Math.PI / 2), B, beam(Math.PI / 2)), 'head-on along one lane');
  assert.equal(beamsMeet(A, beam(-Math.PI / 2, 100), B, beam(Math.PI / 2, 100)), false, 'too short to reach each other');
  assert.equal(beamsMeet(A, beam(-Math.PI / 2), { x: 300, y: 200 }, beam(Math.PI / 2)), false, 'parallel lanes far apart');
});

test('loaded sprite sheets are trimmed under a memory budget, keeping what is wanted now and the title screen', () => {
  const g = duel('charizard', 'snorlax');
  const big = () => ({ portrait: { width: 4096, height: 4096 }, anims: {} }); // 64 MiB decoded each
  for (let i = 0; i < 10; i++) { g.sprites[`old${i}`] = big(); g.spriteUse = g.spriteUse ?? new Map(); g.spriteUse.set(`old${i}`, i); }
  g.sprites.wanted = big();
  const titles = ['pikachu', 'eevee'].filter(k => g.sprites[k]);
  g.trimSprites(['wanted']);
  const left = Object.keys(g.sprites).filter(k => k.startsWith('old'));
  assert.ok(left.length < 10, 'old sets were released');
  assert.ok(g.sprites.wanted, 'the set being asked for stays');
  assert.ok(g.sprites.charizard && g.sprites.snorlax, 'the current teams stay');
  for (const k of titles) assert.ok(g.sprites[k], `${k} (title screen) stays`);
  if (left.length) assert.ok(!g.sprites.old0 || g.sprites.old9, 'the least recently wanted go first');
});

test('ensureSprites keeps memory under budget across successive team picks (after loads and on cache hits)', async () => {
  const g = duel('charizard', 'snorlax');
  // 96 MiB decoded each; loads "arrive" through the same in-flight table a real download uses.
  const huge = () => ({ portrait: { width: 4096, height: 6144 }, anims: {} });
  const arrive = ids => { for (const k of spritesFor(ids)) { delete g.sprites[k]; g.spriteLoads.set(k, Promise.resolve().then(() => { g.sprites[k] = huge(); })); } };
  g.spriteLoads = new Map();
  const mib = () => Object.values(g.sprites).reduce((n, set) => n + (set.portrait?.width ?? 0) * (set.portrait?.height ?? 0) * 4, 0) / 2 ** 20;

  arrive(['gengar']);                       // first pick: 2 sets, 192 MiB
  await g.ensureSprites(['gengar']);
  assert.ok(g.sprites.gengar);
  arrive(['lucario']);                      // second pick: 3 more sets; together 480 MiB until trimmed
  await g.ensureSprites(['lucario']);
  assert.ok(mib() <= 320, `trimmed after the load finished (${mib()} MiB)`);
  assert.ok(g.sprites.lucario && g.sprites['lucario-mega'], 'the team just picked stays');
  assert.ok(!g.sprites.gengar || !g.sprites['gengar-mega'], 'the earlier pick was released');

  // A cache hit that changes the picked team also trims: asking for lucario again is free and stays under budget.
  g.sprites.extra = huge(); g.spriteUse.set('extra', 0);
  await g.ensureSprites(['lucario']);
  assert.ok(mib() <= 320 && !g.sprites.extra, 'trimmed on a cache hit');
});

test('ultimate particles are emitted per second, not per update (Hydro Pump, Blizzard at 60 vs 120 Hz)', () => {
  const count = (ult, hz) => {
    const id = Object.keys(SPECIES).find(k => SPECIES[k].ultimate === ult && sprites[SPECIES[k].sprite]);
    assert.ok(id, `a Pokémon with ${ult}`);
    const g = duel(id, 'snorlax'), p = g.player, o = g.opponent;
    Object.assign(p, { x: 180, y: 540 }); Object.assign(o, { x: 180, y: 300 });
    let n = 0;
    const spawn = g.particles.spawn.bind(g.particles);
    g.particles.spawn = q => { n++; return spawn(q); };
    p.ult = 100;
    assert.ok(g.useMove(p, p.species.ultimate), `${ult} starts`);
    for (let i = 0; i < hz * 2; i++) g.update(1 / hz); // two seconds: the charge-up cutscene and the move
    return n;
  };
  for (const ult of ['hydroPump', 'blizzard']) {
    const a = count(ult, 60), b = count(ult, 120);
    assert.ok(a > 0, `${ult} emits`);
    assert.ok(Math.abs(b - a) / a < 0.25, `${ult}: ${a} spawns at 60 Hz vs ${b} at 120 Hz`);
  }
});
