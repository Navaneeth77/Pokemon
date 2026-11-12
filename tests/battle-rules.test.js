// Battle rules acceptance: weather, abilities, forms, stat stages, status moves, protection and immunities,
// all checked in a real headless battle (the same engine the match server runs).
import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { typeMultiplier } from '../src/data/types.js';
import { Game } from '../src/game.js';
import { loadSpriteSets } from '../server/sprites.js';
import { MOVES, adaptMove } from '../src/moves.js';
import { applyHit, weatherMult } from '../src/combat.js';
import { typesOf, ABILITIES } from '../src/data/abilities.js';
import { speedRatio } from '../src/stats.js';
import { movePower } from '../src/effects-resolver.js';

const sprites = loadSpriteSets(), noop = () => {};

function battle(team, foes) {
  const ui = new Proxy({ format: 3 }, { get: (t, k) => t[k] ?? noop });
  const g = new Game(document.createElement('canvas'), sprites, ui);
  g.headless = true;
  Object.assign(g, { selection: team, lead: 0, opponentSelection: foes, difficulty: 'easy' });
  g.start();
  Object.assign(g, { showcase: null, state: 'fighting', timers: [] });
  g.ai = { update: noop, reset: noop, onThreat: noop };
  g.input = { vector: () => ({ x: 0, y: 0 }), clear: noop };
  for (const m of [...g.playerTeam.members, ...g.opponentTeam.members]) m.item = null;
  for (const m of [g.player, g.opponent]) Object.assign(m, { hidden: false, appear: 0 });
  Object.assign(g.player, { x: 180, y: 480 });
  Object.assign(g.opponent, { x: 180, y: 280 });
  return g;
}
const run = (g, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60); };
// A fixed roll (no critical hit, middle damage spread) for exact damage comparisons.
function fixedRandom(fn) {
  const real = Math.random;
  Math.random = () => 0.5;
  try { return fn(); } finally { Math.random = real; }
}

test('Venusaur + harsh sunlight: Chlorophyll doubles effective Speed (movement and recharge), and it stops when the sun fades', () => {
  const g = battle(['venusaur', 'snorlax', 'lapras'], ['snorlax', 'lapras', 'dragonite']), v = g.player;
  assert.equal(v.species.ability, 'chlorophyll');
  const travel = () => {
    g.input = { vector: () => ({ x: 1, y: 0 }), clear: noop };
    v.x = 60;
    run(g, 0.5);
    g.input = { vector: () => ({ x: 0, y: 0 }), clear: noop };
    return v.x - 60;
  };
  const plain = travel(), recharge0 = (v.cooldowns.x = 3, run(g, 1), 3 - v.cooldowns.x);
  g.setWeather('sun', 25);
  run(g, 0.1);
  assert.equal(speedRatio(v, g), 2);
  const sunny = travel(), recharge1 = (v.cooldowns.x = 3, run(g, 1), 3 - v.cooldowns.x);
  assert.ok(sunny > plain * 1.4, `moves faster in sun: ${plain.toFixed(1)} → ${sunny.toFixed(1)}`);
  assert.ok(recharge1 > recharge0 * 1.3, `recharges faster in sun: ${recharge0.toFixed(2)} → ${recharge1.toFixed(2)}`);
  g.timedWeather.t = 0.01;
  run(g, 0.2);
  assert.equal(g.weather, null);
  assert.equal(speedRatio(v, g), 1);
});

test('Solar Beam fires at once in harsh sunlight, charges normally without it, and is halved in rain', () => {
  const timeToHit = sun => {
    const g = battle(['venusaur', 'snorlax', 'lapras'], ['snorlax', 'lapras', 'dragonite']), foe = g.opponent;
    if (sun) g.setWeather('sun', 25);
    run(g, 0.05);
    const hp = foe.hp;
    assert.ok(g.useMove(g.player, 'solarBeam', 0, true));
    for (let t = 0; t < 3; t += 1 / 60) {
      g.update(1 / 60);
      if (foe.hp < hp) return t;
    }
    return Infinity;
  };
  const sunny = timeToHit(true), normal = timeToHit(false);
  assert.ok(sunny < 0.45, `instant in sun: ${sunny.toFixed(2)}s`);
  assert.ok(normal > 0.85 && normal < 3, `charges first otherwise: ${normal.toFixed(2)}s`);
  const g = battle(['venusaur', 'snorlax', 'lapras'], ['snorlax', 'lapras', 'dragonite']);
  g.weather = 'rain';
  assert.equal(adaptMove(g, g.player, MOVES.solarBeam).power, MOVES.solarBeam.power / 2);
});

test('Castform changes form and type with the weather, and back when it ends', () => {
  const g = battle(['castform', 'snorlax', 'lapras'], ['snorlax', 'lapras', 'dragonite']), c = g.player, forms = [];
  g.on('form', e => forms.push(e.form));
  for (const [w, sprite, type] of [['sun', 'castform-sunny', 'fire'], ['rain', 'castform-rainy', 'water'], ['snow', 'castform-snowy', 'ice']]) {
    g.setWeather(w, 25);
    run(g, 0.1);
    assert.equal(c.form, sprite);
    assert.equal(c.sprite.set, sprites[sprite], 'its sprite changed');
    assert.deepEqual(typesOf(c), [type]);
  }
  g.timedWeather.t = 0.01;
  run(g, 0.1);
  assert.equal(c.form, null);
  assert.deepEqual(typesOf(c), ['normal']);
  assert.deepEqual(forms, ['Sunny Form', 'Rainy Form', 'Snowy Form', 'Normal Form']);
});

test('Drizzle and Drought start their weather on entry, and the weather changes damage', () => {
  const rain = battle(['politoed', 'snorlax', 'lapras'], ['snorlax', 'lapras', 'dragonite']);
  run(rain, 0.1);
  assert.equal(rain.weather, 'rain');
  assert.equal(weatherMult(rain, 'water'), 1.5);
  assert.equal(weatherMult(rain, 'fire'), 0.5);
  const sun = battle(['ninetales', 'snorlax', 'lapras'], ['snorlax', 'lapras', 'dragonite']);
  run(sun, 0.1);
  assert.equal(sun.weather, 'sun');
  assert.equal(weatherMult(sun, 'fire'), 1.5);
  run(sun, 26);
  assert.equal(sun.weather, null, 'ability weather lasts 25s');
});

test('Dragon Dance raises Attack and Speed one stage each, and the boosts are used in damage', () => {
  const g = battle(['dragonite', 'snorlax', 'lapras'], ['snorlax', 'lapras', 'blissey']);
  const hit = () => fixedRandom(() => {
    const foe = g.opponent, hp = foe.hp = foe.maxHp;
    applyHit(g, g.player, foe, MOVES.dragonClaw, { stack: {} });
    return hp - foe.hp;
  });
  const before = hit();
  assert.ok(g.useMove(g.player, 'dragonDance', 0, true));
  run(g, 1);
  assert.deepEqual({ atk: g.player.stages.atk, spe: g.player.stages.spe }, { atk: 1, spe: 1 });
  assert.equal(speedRatio(g.player, g), 1.5);
  const after = hit();
  assert.ok(Math.abs(after / before - 1.25) < 0.06, `+1 Attack ≈ ×1.25 damage: ${before} → ${after}`);
});

test('a light hit interrupts setup and the move still spends its cooldown', () => {
  for (const id of ['dragonDance', 'coil', 'swordsDance', 'bellyDrum']) {
    const g = battle(['dragonite', 'snorlax', 'lapras'], ['snorlax', 'lapras', 'blissey']);
    const { player, opponent } = g;
    assert.ok(g.useMove(player, id), id);
    run(g, 0.4);
    assert.equal(player.action?.settingUp, true, id);
    assert.deepEqual(player.stages, {}, id);
    assert.ok(fixedRandom(() => applyHit(g, opponent, player, MOVES.tackle)), id);
    const hp = player.hp;
    assert.equal(player.action, null, id);
    run(g, 0.5);
    assert.deepEqual(player.stages, {}, id);
    assert.equal(player.buffs.atk, undefined, id);
    assert.equal(player.hp, hp, id);
    assert.ok(g.moveCD(player, id) > 0, id);
    assert.equal(g.useMove(player, id), false, id);
  }
});

test('two completed Dragon Dances strengthen Outrage and a healthy neutral foe survives', () => {
  fixedRandom(() => {
    const g = battle(['salamence', 'snorlax', 'lapras'], ['snorlax', 'lapras', 'blissey']);
    const { player, opponent } = g;
    for (let i = 0; i < 2; i++) {
      assert.ok(g.useMove(player, 'dragonDance'));
      run(g, 4.5);
    }
    assert.equal(player.stages.atk, 2);
    player.ult = 100;
    assert.ok(g.useMove(player, player.species.ultimate));
    run(g, 7);
    assert.ok(opponent.alive && opponent.hp < opponent.maxHp);
  });
});

test('Stored Power and Power Trip cap the payoff from stacking stages', () => {
  for (const id of ['storedPower', 'powerTrip']) {
    const power = stages => movePower(null, { stages }, null, MOVES[id]);
    assert.equal(power({ atk: 1, spe: 1, def: -1 }), 40);
    assert.equal(power({ atk: 6, def: 6, spe: 6 }), 140);
  }
});

test('physical and special ultimates use the matching stat stages at impact', () => {
  const damage = (attacker, attackStages = {}, defenseStages = {}) => fixedRandom(() => {
    const g = battle([attacker, 'snorlax', 'lapras'], ['blissey', 'lapras', 'snorlax']);
    const { player, opponent } = g;
    g.stage(player, attackStages);
    g.stage(opponent, defenseStages);
    player.ult = 100;
    const hp = opponent.hp;
    assert.ok(g.useMove(player, player.species.ultimate));
    run(g, 7);
    assert.ok(opponent.hp < hp && opponent.alive);
    return hp - opponent.hp;
  });
  for (const [attacker, offense, defense, otherOffense, otherDefense] of [
    ['rayquaza', 'atk', 'def', 'spa', 'spd'],
    ['blastoise', 'spa', 'spd', 'atk', 'def'],
  ]) {
    const base = damage(attacker);
    const boosted = damage(attacker, { [offense]: 2 });
    const lowered = damage(attacker, { [offense]: -2 });
    const defended = damage(attacker, {}, { [defense]: 2 });
    assert.ok(Math.abs(boosted - 1.5 * base) <= 10, `${attacker}: ${offense} +2 increases damage by 50% (${base} → ${boosted})`);
    assert.ok(Math.abs(lowered - base / 1.5) <= 10, `${attacker}: ${offense} −2 reduces damage by a third (${base} → ${lowered})`);
    assert.equal(defended, lowered, `${attacker}: ${defense} +2 reduces damage by a third`);
    assert.equal(damage(attacker, { [otherOffense]: 2 }), base);
    assert.equal(damage(attacker, {}, { [otherDefense]: 2 }), base);
  }
});

test('Recover restores half of max HP', () => {
  const g = battle(['starmie', 'snorlax', 'lapras'], ['snorlax', 'lapras', 'dragonite']), s = g.player;
  s.hp = Math.round(s.maxHp * 0.3);
  assert.ok(g.useMove(s, 'recover', 0, true));
  run(g, 1);
  assert.ok(Math.abs(s.hp / s.maxHp - 0.8) < 0.02, `${(s.hp / s.maxHp).toFixed(2)} of max HP`);
});

test('Leech Seed drains the foe every 3s and heals the seeder; Grass types are immune', () => {
  const g = battle(['venusaur', 'snorlax', 'lapras'], ['snorlax', 'lapras', 'dragonite']), v = g.player, foe = g.opponent;
  v.hp = Math.round(v.maxHp * 0.5);
  fixedRandom(() => { g.useMove(v, 'leechSeed', 0, true); run(g, 0.6); });
  assert.ok(foe.seeded, 'seeded');
  const foeHp = foe.hp, myHp = v.hp;
  run(g, 3.1);
  assert.equal(foeHp - foe.hp, Math.round(foe.maxHp / 8));
  assert.ok(v.hp > myHp, 'the seeder healed');
  const grass = battle(['venusaur', 'snorlax', 'lapras'], ['venusaur', 'lapras', 'dragonite']);
  fixedRandom(() => { grass.useMove(grass.player, 'leechSeed', 0, true); run(grass, 0.6); });
  assert.equal(grass.opponent.seeded, null);
});

test('Protect blocks incoming attacks while it is up', () => {
  const g = battle(['garchomp', 'snorlax', 'lapras'], ['snorlax', 'lapras', 'dragonite']), foe = g.opponent;
  assert.ok(g.useMove(foe, 'protect', 0, true));
  run(g, 0.1);
  const hp = foe.hp;
  assert.equal(applyHit(g, g.player, foe, MOVES.dragonClaw, { stack: {} }), false);
  assert.equal(foe.hp, hp);
  run(g, 1.2);
  assert.equal(applyHit(g, g.player, foe, MOVES.dragonClaw, { stack: {} }), true, 'and drops afterwards');
});

test('Type immunities are a double resistance: the hit lands for a quarter of the damage', () => {
  assert.equal(typeMultiplier('ground', ['flying']), 0.25);
  assert.equal(typeMultiplier('normal', ['ghost']), 0.25);
  assert.equal(typeMultiplier('dragon', ['fairy']), 0.25);
  assert.equal(typeMultiplier('electric', ['ground', 'dragon']), 0.125, 'stacks with a resistance');
  const g = battle(['garchomp', 'zapdos', 'lapras'], ['corviknight', 'garchomp', 'dragonite']);
  const foe = g.opponent, hp = foe.hp;
  assert.equal(applyHit(g, g.player, foe, MOVES.earthquake, { stack: {} }), true, 'Ground vs Flying lands');
  assert.ok(foe.hp < hp, 'and deals some damage');
  const g2 = battle(['zapdos', 'snorlax', 'lapras'], ['garchomp', 'lapras', 'dragonite']), hp2 = g2.opponent.hp;
  assert.equal(applyHit(g2, g2.player, g2.opponent, MOVES.thunderbolt, { stack: {} }), true, 'Electric vs Ground lands');
  assert.ok(hp2 - g2.opponent.hp < 0.2 * g2.opponent.maxHp, 'but only weakly');
  assert.ok(MOVES.thunderWave.util.immune.includes('ground'), 'status moves keep their own immunities (Thunder Wave vs Ground)');
});

test('Intimidate lowers the foe\'s Attack a stage, and its attacks really hit softer', () => {
  const plain = battle(['snorlax', 'lapras', 'blissey'], ['dragonite', 'lapras', 'blissey']);
  const scared = battle(['gyarados', 'lapras', 'blissey'], ['dragonite', 'lapras', 'blissey']);
  assert.equal(scared.player.species.ability, 'intimidate');
  plain.opponent.stages = {};
  scared.opponent.stages = {};
  ABILITIES.intimidate.onEnter(scared, scared.player);
  assert.equal(scared.opponent.stages.atk, -1);
  const dmg = (g, target) => fixedRandom(() => {
    target.species = { ...target.species, def: 1, spdef: 1 };
    const hp = target.hp = target.maxHp;
    applyHit(g, g.opponent, target, MOVES.dragonClaw, { stack: {} });
    return hp - target.hp;
  });
  const normal = dmg(plain, plain.player), lowered = dmg(scared, scared.player);
  assert.ok(Math.abs(lowered / normal - 0.8) < 0.05, `−1 Attack ≈ ×0.8: ${normal} → ${lowered}`);
});

test('Toxic damage grows each tick; Thunder Wave paralyses (Speed halved) but not Ground types', () => {
  const g = battle(['toxapex', 'snorlax', 'lapras'], ['snorlax', 'lapras', 'dragonite']), foe = g.opponent;
  fixedRandom(() => { g.useMove(g.player, 'toxic', 0, true); run(g, 0.6); });
  const hits = [];
  let hp = foe.hp;
  for (let i = 0; i < 3; i++) { run(g, 1.5); hits.push(hp - foe.hp); hp = foe.hp; }
  assert.ok(hits[0] > 0 && hits[1] > hits[0] && hits[2] > hits[1], `escalating: ${hits}`);
  const t = battle(['zapdos', 'snorlax', 'lapras'], ['snorlax', 'lapras', 'dragonite']);
  fixedRandom(() => { t.useMove(t.player, 'thunderWave', 0, true); run(t, 0.6); });
  assert.ok(t.opponent.status.para > 0);
  assert.equal(speedRatio(t.opponent, t), 0.5);
  const ground = battle(['zapdos', 'snorlax', 'lapras'], ['garchomp', 'lapras', 'dragonite']);
  fixedRandom(() => { ground.useMove(ground.player, 'thunderWave', 0, true); run(ground, 0.6); });
  assert.ok(!(ground.opponent.status.para > 0));
});
