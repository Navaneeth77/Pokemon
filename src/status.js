import { FloatText, StatArrows, iceShatter, electricBurst, rand } from './effects.js';
import { abilityOf, typesOf } from './data/abilities.js';
import { itemOf } from './data/items.js';
import { STAT_NAME } from './stats.js';

// Status conditions. Durations refresh rather than stack; `guard` is a grace period after the
// status ends during which it can't be re-applied, so freezes, stuns and sleep can't chain-lock.
// Burn, poison and paralysis persist through a switch (and pause on the bench); the rest are cleared.
export const STATUS = {
  burn: { label: 'BRN', word: 'BURNED!', color: '#ff7a3a', dur: 4.5, immune: ['fire'], dot: 0.02, every: 1, verb: 'was burned!' },
  poison: { label: 'PSN', word: 'POISONED!', color: '#c060d0', dur: 6, immune: ['poison', 'steel'], dot: 0.016, every: 1, verb: 'was poisoned!' },
  para: { label: 'PAR', word: 'PARALYZED!', color: '#f2c21c', dur: 4, immune: ['electric'], verb: 'is paralyzed! It may be unable to move!' },
  freeze: { label: 'FRZ', word: 'FROZEN!', color: '#7ad8f0', dur: 1.2, immune: ['ice'], guard: 6, verb: 'was frozen solid!' },
  slow: { label: 'SLW', word: 'SLOWED!', color: '#9fb0c8', dur: 3, verb: 'was slowed down!' },
  stun: { label: 'STN', word: 'STUNNED!', color: '#ffe066', dur: 0.5, guard: 3, verb: 'is stunned!' },
  sleep: { label: 'SLP', word: 'ASLEEP!', color: '#a08ae8', dur: 1.8, guard: 7, verb: 'fell asleep!' },
};
const TIMED = ['burn', 'poison', 'para', 'slow', 'stun', 'sleep'];
const PERSIST = ['burn', 'poison', 'para'];

// Default secondary effect per move type, rolled once per move use when the move names none.
export const TYPE_STATUS = {
  fire: ['burn', 0.1], electric: ['para', 0.12], poison: ['poison', 0.3], ice: ['freeze', 0.07],
  ground: ['slow', 0.15], water: ['slow', 0.06], rock: ['stun', 0.08], fighting: ['stun', 0.06], ghost: ['slow', 0.08],
};

function text(game, mon, str, color, size = 7) {
  game.spawn(new FloatText(mon.x + rand(-4, 4), mon.y - mon.headZ - 14, str, color, size, 1));
}

export function applyStatus(game, mon, name, { dur, source, toxic } = {}) {
  const S = STATUS[name], ab = abilityOf(mon);
  if (!S || !mon.alive || mon.hidden || mon.remote) return false;
  const corrodes = name === 'poison' && source && abilityOf(source).corrosion;
  if ((!corrodes && S.immune?.some(t => typesOf(mon).includes(t))) || ab.immune?.includes(name) || ab.blockStatus?.(game, mon, name)) {
    if (ab.immune?.includes(name) || ab.blockStatus) game.abilityPop(mon, `It can't be ${STATUS[name].word.toLowerCase().replace('!', '')}`);
    else text(game, mon, 'IMMUNE', '#c9d2de', 6);
    return false;
  }
  // Safeguard keeps the foe's statuses off its side.
  if (source && source.side !== mon.side && game.sides?.[mon.side]?.safeguard > 0) {
    text(game, mon, 'SAFEGUARD!', '#9fe8ff', 6);
    return false;
  }
  // Misty Terrain keeps every status off grounded Pokémon; Electric Terrain keeps them awake.
  const onGround = !mon.species.fly && !mon.airborne && !ab.levitating && !itemOf(mon)?.levitating;
  if (onGround && (game.terrain?.kind === 'misty' || (game.terrain?.kind === 'electric' && name === 'sleep'))) {
    text(game, mon, 'TERRAIN PROTECTED IT', '#ffb0e0', 6);
    return false;
  }
  if (mon.sGuard[name] > 0 || (name === 'freeze' && mon.frozen > 0)) {
    text(game, mon, 'RESISTED', '#c9d2de', 6);
    return false;
  }
  if (ab.bounce && source && source !== mon && source.alive && !abilityOf(source).bounce) {
    game.abilityPop(mon, 'Bounced it back!');
    return applyStatus(game, source, name, { dur });
  }
  const d = (dur ?? S.dur) * (ab.statusMult ?? 1) * (ab.statusDur?.(name) ?? 1) * (mon.boss ? 0.3 : 1);
  if (name === 'freeze') {
    mon.freeze(d);
    iceShatter(game, mon.x, mon.y, mon.bodyZ);
  } else {
    const had = mon.status[name] > 0;
    // Toxic: badly poisoned for longer, and every tick hurts more than the last.
    if (name === 'poison' && toxic) {
      mon.status.toxicN = mon.status.toxicN || 1;
      mon.status.poisonT = 1.5;
    }
    mon.status[name] = Math.max(mon.status[name] ?? 0, name === 'poison' && toxic ? 9 : d);
    if (name === 'stun') {
      mon.cancelCharge(game, true);
      mon.stagger = Math.max(mon.stagger, d);
      mon.sprite.play('Hurt', { loop: false, force: true });
    }
    if (name === 'sleep') {
      mon.cancelAction();
      mon.cancelCharge(game, true);
    }
    if (had) return true;
  }
  if (S.guard) mon.sGuard[name] = d + S.guard;
  text(game, mon, S.word, S.color, 8);
  game.ui.log(`${mon.species.name} ${S.verb}`, mon.side);
  if (name === 'poison' && source && abilityOf(source).puppeteer) applyStatus(game, mon, 'slow', { source });
  ab.onStatus?.(game, mon, name, source);
  itemOf(mon)?.onStatus?.(game, mon, name, source);
  return true;
}

export function tickStatus(game, mon, dt) {
  for (const k in mon.sGuard) mon.sGuard[k] = Math.max(0, mon.sGuard[k] - dt);
  const st = mon.status;
  for (const name of TIMED) {
    if (!(st[name] > 0)) continue;
    st[name] -= dt;
    const S = STATUS[name];
    if (S.dot) {
      st[`${name}T`] = (st[`${name}T`] ?? S.every) - dt;
      if (st[`${name}T`] <= 0) {
        st[`${name}T`] = S.every;
        const toxicN = name === 'poison' ? st.toxicN : 0;
        if (name === 'poison' && abilityOf(mon).poisonHeal) game.heal(mon, mon.maxHp * S.dot * 1.5);
        else game.dotDamage(mon, toxicN ? 0.03 * toxicN : S.dot, S.color);
        if (toxicN) {
          st.toxicN++;
          st.poisonT = 1.5;
        }
        if (!mon.alive) return;
      }
    }
    if (name === 'para') {
      st.paraT = (st.paraT ?? 1) - dt;
      if (st.paraT <= 0) {
        st.paraT = 1;
        if (Math.random() < 0.3 && !mon.action?.move.ultimate) {
          mon.stagger = Math.max(mon.stagger, 0.3);
          mon.cancelCharge(game, true);
          electricBurst(game, mon.x, mon.y, mon.bodyZ, 8);
          text(game, mon, 'FULLY PARALYZED', S.color, 6);
        }
      }
    }
    if (st[name] <= 0) {
      st[name] = 0;
      if (name === 'poison') delete st.toxicN;
      if (name !== 'stun') text(game, mon, `${S.label} WORE OFF`, '#c9d2de', 6);
    }
  }
}

// On switching out: only burn, poison and paralysis follow the Pokémon to the bench.
export function benchStatus(mon) {
  for (const k of Object.keys(mon.status)) if (!PERSIST.some(p => k.startsWith(p))) delete mon.status[k];
}

export function wakeOnHit(mon) {
  if (mon.status.sleep > 0 && mon.status.sleep < STATUS.sleep.dur - 0.3) mon.status.sleep = 0;
}

export const statusSpeed = mon => (mon.status.slow > 0 ? 0.6 : 1) * (mon.status.para > 0 ? 0.75 : 1);

export function statusPills(mon) {
  const out = [];
  if (mon.elementAura?.type === 'water') out.push(['WET', '#71ceff']);
  if (mon.frozen > 0) out.push(['FRZ', STATUS.freeze.color]);
  for (const name of TIMED) if (mon.status[name] > 0) out.push([name === 'poison' && mon.status.toxicN ? 'TOX' : STATUS[name].label, STATUS[name].color]);
  if (mon.seeded) out.push(['SEEDED', '#62b947']);
  return out;
}

// Temporary stat changes (atk / def / spd). A new change on the same stat replaces the old one.
// `source` is the Pokémon lowering it (Intimidate, a move's debuff), for abilities that react to that.
export function addBuff(game, mon, stat, mult, dur, source = null) {
  if (mon.remote) return false; // online: the owner's game applies it and sends the result
  const ab = abilityOf(mon);
  if (ab.contrary) mult = 1 / mult;
  if (ab.simple) mult = mult >= 1 ? 1 + (mult - 1) * 2 : mult * mult;
  if (mult < 1) {
    if (itemOf(mon)?.noDebuff) {
      game.itemPop(mon, "The Clear Amulet kept its stats up!");
      return false;
    }
    if (ab.noDebuff || ab.keepStat === stat) {
      game.abilityPop(mon, "Stats can't be lowered!");
      return false;
    }
    if (ab.mirror && source && source !== mon && source.alive && !source.hidden) {
      game.abilityPop(mon, 'Reflected the stat drop!');
      return addBuff(game, source, stat, mult, dur);
    }
  }
  mon.buffs[stat] = { m: mult, t: dur };
  const label = { atk: 'ATK', def: 'DEF', spd: 'SPD' }[stat];
  text(game, mon, `${label} ${mult >= 1 ? '▲' : '▼'}`, mult >= 1 ? '#ffe680' : '#9fb8ff', 7);
  if (!mon.hidden) game.spawn(new StatArrows(mon, stat, mult >= 1));
  if (mult < 1 && source && source !== mon) {
    ab.onDebuffed?.(game, mon, source);
    itemOf(mon)?.onDebuffed?.(game, mon, source);
  }
  return true;
}

// Stat stages (stats.js), the main series' way: `changes` like { atk: 1, spe: 1 } (Dragon Dance) or
// { atk: -1 } (Intimidate). `source` is the Pokémon causing a drop, for abilities that react to it.
// Contrary flips the change, Simple doubles it; Clear Body, Hyper Cutter, Clear Amulet and Mirror Armor
// stop or reflect drops; Defiant / Competitive answer them; White Herb undoes them once.
const STAGE_WORDS = { 1: 'rose!', 2: 'rose sharply!', 3: 'rose drastically!', '-1': 'fell!', '-2': 'harshly fell!', '-3': 'severely fell!' };
export function changeStage(game, mon, changes, source = null) {
  if (mon.remote || !mon.alive) return false;
  const ab = abilityOf(mon), item = itemOf(mon), byFoe = source && source !== mon;
  let any = false, dropped = false;
  for (let [stat, n] of Object.entries(changes)) {
    if (ab.contrary) n = -n;
    if (ab.simple) n *= 2;
    if (n < 0 && byFoe) {
      if (game.sides?.[mon.side]?.mist > 0) { text(game, mon, 'PROTECTED BY MIST', '#d8f0ff', 6); continue; }
      if (item?.noDebuff) { game.itemPop(mon, 'The Clear Amulet kept its stats up!'); continue; }
      if (ab.noDebuff || ab.keepStat === (stat === 'spa' ? 'atk' : stat)) { game.abilityPop(mon, `Its ${STAT_NAME[stat]} can't be lowered!`); continue; }
      if (ab.mirror && source.alive && !source.hidden) {
        game.abilityPop(mon, 'It reflected the stat drop!');
        changeStage(game, source, { [stat]: n }, mon);
        continue;
      }
    }
    const before = mon.stages[stat] ?? 0, after = Math.max(-6, Math.min(6, before + n));
    if (after === before) {
      text(game, mon, `${STAT_NAME[stat].toUpperCase()} WON'T GO ${n > 0 ? 'HIGHER' : 'LOWER'}`, '#c9d2de', 6);
      continue;
    }
    mon.stages[stat] = after;
    any = true;
    if (after < before) dropped = true;
    const d = Math.max(-3, Math.min(3, after - before));
    text(game, mon, `${STAT_NAME[stat].toUpperCase()} ${d > 0 ? '▲'.repeat(d) : '▼'.repeat(-d)}`, d > 0 ? '#ffe680' : '#9fb8ff', 7);
    game.ui.log(`${mon.species.name}'s ${STAT_NAME[stat]} ${STAGE_WORDS[d]}`, mon.side);
    if (!mon.hidden) game.spawn(new StatArrows(mon, stat === 'spa' ? 'atk' : stat === 'spd' ? 'def' : stat, d > 0));
    game.emit?.('stage', { mon, stat, from: before, to: after, source });
  }
  if (dropped && byFoe) {
    ab.onDebuffed?.(game, mon, source);
    item?.onDebuffed?.(game, mon, source);
  }
  return any;
}

export const stagePills = mon => Object.entries(mon.stages ?? {}).filter(([, n]) => n)
  .map(([k, n]) => [`${k.toUpperCase()}${n > 0 ? '+' : ''}${n}`, n > 0 ? '#c89a1a' : '#4a6aa8']);

export const buffMult = (mon, stat) => (mon.buffs[stat]?.t > 0 ? mon.buffs[stat].m : 1);

export function tickBuffs(mon, dt) {
  for (const k in mon.buffs) if ((mon.buffs[k].t -= dt) <= 0) delete mon.buffs[k];
}

export function buffPills(mon) {
  return Object.entries(mon.buffs).map(([k, b]) => [`${k.toUpperCase()}${b.m >= 1 ? '▲' : '▼'}`, b.m >= 1 ? '#c89a1a' : '#4a6aa8']);
}
