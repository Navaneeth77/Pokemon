// Side conditions and field effects from the competitive move pools, as in the games with a "turn" of about
// 3s (the sandstorm's tick):
//   Reflect / Light Screen / Aurora Veil   halve physical / special / all damage to that side for 15s
//                                          (24s with Light Clay); a critical hit or Infiltrator goes through,
//                                          Brick Break and Psychic Fangs shatter them
//   Tailwind                               doubles that side's Speed for 12s
//   Trick Room                             twists the arena for 15s: slower Pokémon move and recharge faster
// plus moves that bring in the next Pokémon (Roar, Whirlwind, Dragon Tail, Circle Throw drag the foe out)
// and what waits for it (Healing Wish restores it in full, Shed Tail leaves it a substitute).
import { Ring, Glow, FloatText, rand } from './effects.js';
import { abilityOf } from './data/abilities.js';
import { itemOf } from './data/items.js';
import { sfx } from './audio.js';

export const SIDE_LOOK = {
  reflect: { name: 'Reflect', color: '#ffb46a', rgb: [255, 180, 106] },
  lightScreen: { name: 'Light Screen', color: '#ffe680', rgb: [255, 230, 128] },
  auroraVeil: { name: 'Aurora Veil', color: '#9ff0e0', rgb: [159, 240, 224] },
  tailwind: { name: 'Tailwind', color: '#c8f4ff', rgb: [200, 244, 255] },
};
const SCREENS = ['reflect', 'lightScreen', 'auroraVeil'];
const BANNER_Y = { player: 470, opponent: 250 };
const whose = side => (side === 'player' ? 'your' : "the foe's");

export function freshField() {
  return { sides: { player: {}, opponent: {} }, pending: { player: {}, opponent: {} }, trickRoom: 0 };
}

// Puts up a side condition; false if it is already up.
export function setSide(g, side, kind, by) {
  const s = g.sides[side];
  if (s[kind] > 0) return false;
  const clay = SCREENS.includes(kind) && itemOf(by)?.id === 'lightClay';
  s[kind] = kind === 'tailwind' ? 12 : clay ? 24 : 15;
  const L = SIDE_LOOK[kind];
  g.hud.showBanner(L.name.toUpperCase(), { color: L.color, y: BANNER_Y[side], life: 1, size: 12 });
  g.ui.log(kind === 'tailwind' ? `The Tailwind blew from behind ${whose(side)} team!`
    : `${L.name} made ${whose(side)} team ${kind === 'reflect' ? 'stronger against physical moves' : kind === 'lightScreen' ? 'stronger against special moves' : 'stronger against attacks'}!`, by?.side);
  return true;
}

// Trick Room: using it again while it is up returns the arena to normal.
export function toggleTrickRoom(g, by) {
  if (g.trickRoom > 0) {
    g.trickRoom = 0;
    g.ui.log('The twisted dimensions returned to normal!', by?.side);
    return false;
  }
  g.trickRoom = 15;
  g.hud.showBanner('TRICK ROOM', { color: '#ff8ad0', y: 300, life: 1.2, size: 15 });
  g.ui.log(`${by.species.name} twisted the dimensions!`, by.side);
  return true;
}

export function tickField(g, dt) {
  for (const side of ['player', 'opponent']) {
    const s = g.sides[side];
    for (const k of Object.keys(s)) {
      if ((s[k] -= dt) > 0) continue;
      delete s[k];
      g.ui.log(`${whose(side)[0].toUpperCase()}${whose(side).slice(1)} ${SIDE_LOOK[k]?.name ?? k} wore off!`);
    }
    // Tailwind: streaks of wind drift past that side's Pokémon.
    const mon = side === 'player' ? g.player : g.opponent;
    if (s.tailwind > 0 && mon && !mon.hidden && !g.headless && Math.random() < dt * 14) {
      const dir = side === 'player' ? -1 : 1;
      g.particles.spawn({ x: mon.x + rand(-40, 40), y: mon.y - dir * 40, z: rand(4, 30), vx: rand(-10, 10), vy: dir * rand(160, 220), life: 0.45, size: rand(1.5, 2.5), sizeEnd: 1, colors: ['#ffffff', '#c8f4ff'] });
    }
  }
  if (g.trickRoom > 0 && (g.trickRoom -= dt) <= 0) {
    g.trickRoom = 0;
    g.ui.log('The twisted dimensions returned to normal!');
  }
}

// The damage a side's screens let through (combat.js): ½ for a matching screen.
export function screenMult(g, attacker, target, cat, crit) {
  const s = g.sides?.[target.side];
  if (!s || crit || abilityOf(attacker).infiltrator || attacker.side === target.side) return 1;
  const kind = s.auroraVeil > 0 ? 'auroraVeil' : cat === 'physical' && s.reflect > 0 ? 'reflect' : cat === 'special' && s.lightScreen > 0 ? 'lightScreen' : null;
  if (!kind) return 1;
  // A pane of the screen's colour flickers where the blow meets it.
  const a = Math.atan2(attacker.y - target.y, attacker.x - target.x), r = target.radius + 8;
  g.spawn(new Ring(target.x + Math.cos(a) * r, target.y + Math.sin(a) * r * 0.6, { z: target.bodyZ, r0: 4, r1: 14, life: 0.25, color: SIDE_LOOK[kind].color, width: 2, layer: 'air' }));
  return 0.5;
}

export function breakScreens(g, side, by) {
  const s = g.sides?.[side];
  if (!s || !SCREENS.some(k => s[k] > 0)) return;
  for (const k of SCREENS) delete s[k];
  const mon = side === 'player' ? g.player : g.opponent;
  if (mon) g.spawn(new FloatText(mon.x, mon.y - mon.headZ - 22, 'SCREENS SHATTERED!', '#ffe680', 7));
  g.ui.log(`${by.species.name} shattered ${whose(side)} screens!`, by.side);
  sfx.shard?.();
}

// Court Change: the two sides trade their hazards and side conditions.
export function swapCourts(g) {
  [g.sides.player, g.sides.opponent] = [g.sides.opponent, g.sides.player];
  [g.hazards.player, g.hazards.opponent] = [g.hazards.opponent, g.hazards.player];
}

// Roar, Whirlwind, Dragon Tail, Circle Throw: the target is dragged out and a random healthy teammate is
// brought in. Online the match server (or the target's own game) decides.
export function dragOut(g, mon, by) {
  if (g.state !== 'fighting' || mon.remote || !mon.alive || mon.hidden || mon.recallT > 0 || mon.boss || g.raid || g.raidState || g.survival) return false;
  if (abilityOf(mon).suctionCups || mon.ingrained) {
    g.abilityPop(mon, 'It anchored itself!');
    return false;
  }
  const team = g.teamOf(mon), options = team.members.map((m, i) => i).filter(i => i !== team.index && team.members[i].alive && !team.members[i].fainted);
  if (!options.length || g.ultActive()) return false;
  const i = options[Math.floor(Math.random() * options.length)];
  g.spawn(new FloatText(mon.x, mon.y - mon.headZ - 18, 'DRAGGED OUT!', '#ffb070', 8));
  g.ui.log(`${mon.species.name} was dragged out!`, mon.side);
  if (team === g.playerTeam) return g.switchTo(i, true);
  g.netSend(mon, { t: 'switch', i });
  g.remoteSwitch(i);
  g.ai.reset?.();
  return true;
}

// What waits for the next Pokémon on a side: Healing Wish's full recovery, Shed Tail's substitute.
export function onEntry(g, mon) {
  const p = g.pending?.[mon.side];
  if (!p || mon.remote) return;
  if (p.healingWish && mon.alive) {
    p.healingWish = false;
    mon.status = {};
    g.heal(mon, mon.maxHp);
    g.spawn(new Glow(mon.x, mon.y, mon.bodyZ, 40, [255, 220, 250], 0.7));
    for (let i = 0; i < 16; i++) g.particles.spawn({ x: mon.x + rand(-20, 20), y: mon.y, z: rand(30, 70), vz: rand(-40, -10), vx: rand(-12, 12), life: 1, size: rand(2, 3.5), sizeEnd: 1, colors: ['#ffffff', '#ffd8f4', '#ffb0e0'] });
    g.ui.log(`The healing wish came true for ${mon.species.name}!`, mon.side);
  }
  if (p.shedTail > 0 && mon.alive) {
    mon.shield = p.shedTail;
    mon.substitute = true;
    p.shedTail = 0;
    g.spawn(new Ring(mon.x, mon.y, { z: mon.bodyZ, r0: 4, r1: mon.radius + 14, life: 0.4, color: '#c8f0a0', width: 3, layer: 'air' }));
    g.ui.log(`${mon.species.name} took over the substitute!`, mon.side);
  }
}

// Ground glows under each Pokémon whose side has screens up, and a faint warped grid for Trick Room.
export function drawField(g, ctx) {
  const now = performance.now() / 1000;
  for (const mon of [g.player, g.opponent]) {
    const s = mon && !mon.hidden && g.sides?.[mon.side];
    if (!s) continue;
    const up = SCREENS.filter(k => s[k] > 0);
    up.forEach((k, i) => {
      const fade = Math.min(1, s[k] / 1.5), r = mon.radius + 12 + i * 5;
      ctx.save();
      ctx.globalAlpha = (0.32 + 0.12 * Math.sin(now * 3 + i)) * fade;
      ctx.strokeStyle = SIDE_LOOK[k].color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -now * 18 * (i % 2 ? -1 : 1);
      ctx.beginPath();
      ctx.ellipse(mon.x, mon.y, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }
  if (g.trickRoom > 0) {
    const fade = Math.min(1, g.trickRoom / 1.5);
    ctx.save();
    ctx.globalAlpha = (0.07 + 0.03 * Math.sin(now * 2)) * fade;
    ctx.strokeStyle = '#ff8ad0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= 360; x += 40) { ctx.moveTo(x, 60); ctx.lineTo(x + Math.sin(now + x) * 6, 660); }
    for (let y = 60; y <= 660; y += 40) { ctx.moveTo(0, y); ctx.lineTo(360, y + Math.sin(now + y) * 4); }
    ctx.stroke();
    ctx.restore();
  }
}

// Online: the field as the server sees it (side timers and Trick Room), for the snapshot.
export const sideSnap = (g, side) => {
  const s = g?.sides?.[side];
  return s && Object.keys(s).length ? Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(v * 10) / 10])) : 0;
};
