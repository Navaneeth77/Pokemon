import { FloatText, iceShatter, electricBurst, rand } from './effects.js';
import { abilityOf, typesOf } from './data/abilities.js';

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

export function applyStatus(game, mon, name, { dur, source } = {}) {
  const S = STATUS[name], ab = abilityOf(mon);
  if (!S || !mon.alive || mon.hidden) return false;
  if (S.immune?.some(t => typesOf(mon).includes(t)) || ab.immune?.includes(name)) {
    text(game, mon, 'IMMUNE', '#c9d2de', 6);
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
  const d = (dur ?? S.dur) * (ab.statusMult ?? 1);
  if (name === 'freeze') {
    mon.freeze(d);
    iceShatter(game, mon.x, mon.y, mon.bodyZ);
  } else {
    const had = mon.status[name] > 0;
    mon.status[name] = Math.max(mon.status[name] ?? 0, d);
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
        game.dotDamage(mon, S.dot, S.color);
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
  if (mon.frozen > 0) out.push(['FRZ', STATUS.freeze.color]);
  for (const name of TIMED) if (mon.status[name] > 0) out.push([STATUS[name].label, STATUS[name].color]);
  return out;
}

// Temporary stat changes (atk / def / spd). A new change on the same stat replaces the old one.
export function addBuff(game, mon, stat, mult, dur) {
  if (mult < 1 && abilityOf(mon).noDebuff) {
    game.abilityPop(mon, "Stats can't be lowered!");
    return false;
  }
  mon.buffs[stat] = { m: mult, t: dur };
  const label = { atk: 'ATK', def: 'DEF', spd: 'SPD' }[stat];
  text(game, mon, `${label} ${mult >= 1 ? '▲' : '▼'}`, mult >= 1 ? '#ffe680' : '#9fb8ff', 7);
  return true;
}

export const buffMult = (mon, stat) => (mon.buffs[stat]?.t > 0 ? mon.buffs[stat].m : 1);

export function tickBuffs(mon, dt) {
  for (const k in mon.buffs) if ((mon.buffs[k].t -= dt) <= 0) delete mon.buffs[k];
}

export function buffPills(mon) {
  return Object.entries(mon.buffs).map(([k, b]) => [`${k.toUpperCase()}${b.m >= 1 ? '▲' : '▼'}`, b.m >= 1 ? '#c89a1a' : '#4a6aa8']);
}
