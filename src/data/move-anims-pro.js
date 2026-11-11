// The pixel-art / anime layer of every move's animation, added on top of its existing look (data/move-anims.js):
//   windup   steps around the user as the move starts (a charge animation at the mouth, focus lines…)
//   impact   steps on the foe the moment the move lands (hand-drawn bursts, smears, rings)
//   fx       steps for a status move (auras, shields, sparks on the foe for aimed ones)
// PRO_ANIMS hand-tunes the most-used moves; every other move gets templateAnims() from its kind, type and power.
// The sprites are the sheets in public/fx (fx-sprites.js); hit timing and mechanics are untouched.
const W = '#ffffff';

// Per type: the light/dark colours, the charge animation and the hand-drawn accent ([sheet, tint]).
const T = {
  normal: { c: ['#f0f0d8', '#a8a878'], charge: ['weaponhit'], accent: ['weaponhit'] },
  fire: { c: ['#ffd060', '#ff5a1a'], charge: ['firespin'], accent: ['flamelash'] },
  water: { c: ['#bfe6ff', '#3a8ae8'], charge: ['bubbles'], accent: ['magickahit'] },
  electric: { c: ['#fff6a0', '#e0b000'], charge: ['spark'], accent: ['radialspark'] },
  grass: { c: ['#c8ff8a', '#3f9a3a'], charge: ['felspell'], accent: ['felspell'] },
  ice: { c: ['#e6f8ff', '#7ab8e8'], charge: ['freezing'], accent: ['nebula'] },
  fighting: { c: ['#ffd0b0', '#c8402c'], charge: ['vortex'], accent: ['vortex'] },
  poison: { c: ['#f0c0ff', '#a040c0'], charge: ['bubbles', '#c060d0'], accent: ['plasmaburst', '#c060d0'] },
  ground: { c: ['#e8d0a0', '#8a6630'], charge: ['plasmaburst', '#c8a060'], accent: ['firebomb', '#c8a060'] },
  flying: { c: ['#ffffff', '#9fc8e8'], charge: ['magickahit', '#e8f6ff'], accent: ['phantom'] },
  psychic: { c: ['#ffd0f0', '#e040a0'], charge: ['magicspell'], accent: ['vortex', '#ff70c0'] },
  bug: { c: ['#f0ffc0', '#7aa830'], charge: ['felspell', '#b8e040'], accent: ['plasmaburst', '#a8d040'] },
  rock: { c: ['#e8dcc0', '#8a7a60'], charge: ['plasmasparkle', '#c8b080'], accent: ['nebula', '#b8a070'] },
  ghost: { c: ['#e0c8ff', '#5a3a8a'], charge: ['midnight'], accent: ['darkbolt'] },
  dragon: { c: ['#d8c8ff', '#5a3ad8'], charge: ['vortex', '#8a5cff'], accent: ['sunburn', '#8a5cff'] },
  dark: { c: ['#c8a0ff', '#2a1838'], charge: ['vortex', '#5a2a8a'], accent: ['darkbolt'] },
  steel: { c: ['#ffffff', '#8f9db2'], charge: ['phantom'], accent: ['phantom'] },
  fairy: { c: ['#ffe0f0', '#f080b0'], charge: ['magicspell', '#ffb0e0'], accent: ['bubbles', '#ff9ad0'] },
};
const sp = ([key, tint], o = {}) => ({ key, tint, ...o });

// Fire Blast's 大: columns of flame in the shape of the kanji around the foe.
const DAI = [[0, -24], [-28, -6], [28, -6], [-18, 20], [18, 20], [0, 0]].map(([dx, dy], i) => ({ at: 0.02 + i * 0.025, sprite: { key: 'fire', dx, dy, z: 0, anchor: 'bottom' } }));

export const PRO_ANIMS = {
  knockOff: {
    windup: [{ at: 0, sprite: { key: 'vortex', tint: '#5a2a8a', at: 'user', speed: 1.4 } }],
    impact: [{ at: 0, smear: { width: 16, radius: 28, spread: 3, colors: ['#c8a0ff', '#2a1838'] }, sprite: { key: 'darkbolt' } },
      { at: 0.06, sprite: { key: 'plasmasparkle', tint: '#ffe680', n: 3, spread: 26 } }],
  },
  uTurn: {
    windup: [{ at: 0, sprite: { key: 'felspell', tint: '#b8e040', at: 'user', speed: 1.6 } }],
    impact: [{ at: 0, smear: { n: 2, step: Math.PI, width: 11, colors: ['#f0ffc0', '#7aa830'] } }, { at: 0.04, pring: { r: 46, color: '#a8d848' } }],
  },
  closeCombat: {
    windup: [{ at: 0, focus: { life: 0.35 }, where: 'user' }],
    impact: [
      { at: 0, smear: { width: 12, colors: [W, '#e0763a'] }, sprite: { key: 'weaponhit' } },
      { at: 0.1, smear: { width: 12, turn: 2.2, colors: [W, '#c8402c'] }, sprite: { key: 'weaponhit', tint: '#ffb080' } },
      { at: 0.2, smear: { n: 2, width: 16, radius: 30, colors: [W, '#c8402c'] }, sprite: { key: 'vortex' } },
    ],
  },
  iceBeam: { windup: [{ at: 0, sprite: { key: 'freezing', at: 'mouth', speed: 1.5 } }], impact: [{ at: 0, sprite: { key: 'nebula' }, spikes: { n: 5, style: 'ice', spread: 18 } }] },
  thunderbolt: { windup: [{ at: 0, sprite: { key: 'spark', at: 'user' } }], impact: [{ at: 0, sprite: { key: 'radialspark' }, bolt: {} }] },
  focusBlast: {
    windup: [{ at: 0, sprite: { key: 'magicspell', tint: '#6aa8ff', at: 'user' }, focus: { life: 0.55 }, where: 'user' }],
    impact: [{ at: 0, sprite: { key: 'sunburn', tint: '#6aa8ff' } }, { at: 0.05, sprite: { key: 'weaponhit', tint: '#bfe0ff' } }],
  },
  stoneEdgeAtk: { impact: [{ at: 0, sprite: { key: 'nebula', tint: '#b8a070' }, spikes: { n: 7, style: 'rock', spread: 30 } }] },
  fireBlast: { windup: [{ at: 0, sprite: { key: 'firespin', at: 'user' } }], impact: [{ at: 0, sprite: { key: 'sunburn' } }, ...DAI] },
  roost: { fx: [{ at: 0.05, sprite: { key: 'protection', tint: '#e8f6ff', at: 'user' }, element: { type: 'flying', s: 1.2 }, where: 'user' }] },
  psychic: { windup: [{ at: 0, sprite: { key: 'magicspell', at: 'user' } }], impact: [{ at: 0, sprite: { key: 'vortex', tint: '#ff70c0' } }] },
  suckerPunch: {
    windup: [{ at: 0, sprite: { key: 'darkbolt', at: 'user', speed: 1.4 } }],
    impact: [{ at: 0, smear: { width: 14, colors: ['#c8a0ff', '#1a0f24'] }, sprite: { key: 'vortex', tint: '#3a2050' } }],
  },
  swordsDance: {
    fx: [{ at: 0.05, sprite: { key: 'phantom', at: 'user', n: 4, spread: 18 }, focus: { life: 0.5 }, where: 'user' },
      { at: 0.25, smear: { n: 4, step: Math.PI / 2, width: 8, radius: 22, colors: [W, '#dfe7f2'] }, where: 'user' }],
  },
  psyshock: { impact: [{ at: 0, sprite: { key: 'magicspell' } }, { at: 0.05, sprite: { key: 'plasmaburst', tint: '#ff8ad0', n: 3, spread: 16 } }] },
  calmMind: { fx: [{ at: 0.05, sprite: { key: 'protection', tint: '#ffb0e0', at: 'user' }, pring: { r: 50, color: '#ffb0e0' }, where: 'user' }, { at: 0.3, pring: { r: 70, color: '#ffd0ec' }, where: 'user' }] },
  shadowBall: { windup: [{ at: 0, sprite: { key: 'midnight', at: 'mouth', speed: 1.5 } }], impact: [{ at: 0, sprite: { key: 'darkbolt' } }, { at: 0.05, sprite: { key: 'midnight' } }] },
  bodyPress: { impact: [{ at: 0, sprite: { key: 'nebula', tint: '#dfe7f2' }, pring: { r: 60, color: '#e8e8f0', width: 3 } }] },
  recover: { fx: [{ at: 0.05, sprite: { key: 'magicspell', tint: '#7dffb0', at: 'user' }, where: 'user' }] },
  earthPower: { impact: [{ at: 0, sprite: { key: 'fire', tint: '#c8a060', z: 0, anchor: 'bottom' } }, { at: 0.03, sprite: { key: 'firebomb', tint: '#c8a060' } }] },
  gigaDrain: { impact: [{ at: 0, sprite: { key: 'felspell' } }] },
  braveBird: { windup: [{ at: 0, sprite: { key: 'phantom', at: 'user' }, focus: { life: 0.3 }, where: 'user' }], impact: [{ at: 0, sprite: { key: 'sunburn', tint: '#ffffff' } }] },
  ironHead: { impact: [{ at: 0, sprite: { key: 'phantom' }, smear: { width: 12, colors: [W, '#8f9db2'] } }] },
  dracoMeteorAtk: { impact: [{ at: 0, sprite: { key: 'sunburn', tint: '#8a5cff' } }, { at: 0.08, sprite: { key: 'firebomb', tint: '#8a5cff', n: 2, spread: 30 } }] },
  protect: { fx: [{ at: 0, sprite: { key: 'protection', at: 'user' }, where: 'user' }] },
  thunderWave: { fx: [{ at: 0.1, sprite: { key: 'spark', n: 3, spread: 16 } }] },
  drainPunch: { impact: [{ at: 0, sprite: { key: 'felspell', tint: '#ffb080' } }] },
  liquidation: { impact: [{ at: 0, sprite: { key: 'bubbles' }, smear: { width: 12, colors: ['#bfe6ff', '#3a8ae8'] } }] },
  nastyPlot: { fx: [{ at: 0.05, sprite: { key: 'darkbolt', at: 'user' }, focus: { life: 0.4, color: '#c8a0ff' }, where: 'user' }] },
  sludgeBomb: { impact: [{ at: 0, sprite: { key: 'bubbles', tint: '#c060d0' } }] },
  doubleEdge: { impact: [{ at: 0, sprite: { key: 'weaponhit' }, pring: { r: 50 } }] },
  outrageAtk: { windup: [{ at: 0, sprite: { key: 'vortex', tint: '#8a5cff', at: 'user' } }], impact: [{ at: 0, sprite: { key: 'vortex', tint: '#8a5cff' } }] },
  playRough: { impact: [{ at: 0, sprite: { key: 'magicspell' } }, { at: 0.1, sprite: { key: 'bubbles', tint: '#ff9ad0' } }] },
  voltSwitch: { impact: [{ at: 0, sprite: { key: 'radialspark' } }] },
  dragonDance: { fx: [{ at: 0.05, sprite: { key: 'vortex', tint: '#8a5cff', at: 'user' }, focus: { life: 0.45, color: '#b48cff' }, where: 'user' }] },
  poisonJab: { impact: [{ at: 0, sprite: { key: 'plasmaburst', tint: '#c060d0' }, smear: { width: 10, colors: ['#f0c0ff', '#a040c0'] } }] },
  superpower: { windup: [{ at: 0, focus: { life: 0.4 }, where: 'user' }], impact: [{ at: 0, sprite: { key: 'vortex' } }] },
  energyBall: { windup: [{ at: 0, sprite: { key: 'felspell', at: 'mouth', speed: 1.5 } }], impact: [{ at: 0, sprite: { key: 'felspell' } }] },
  surf: { impact: [{ at: 0, sprite: { key: 'bubbles' } }] },
  flareBlitz: { windup: [{ at: 0, sprite: { key: 'firespin', at: 'user' } }], impact: [{ at: 0, sprite: { key: 'sunburn' } }] },
  gunkShotAtk: { impact: [{ at: 0, sprite: { key: 'felspell', tint: '#a040c0' } }] },
  toxic: { fx: [{ at: 0.1, sprite: { key: 'bubbles', tint: '#a040c0' } }] },
  bulkUp: { fx: [{ at: 0.05, sprite: { key: 'vortex', at: 'user' }, focus: { life: 0.4 }, where: 'user' }] },
  quickAttack: { impact: [{ at: 0, sprite: { key: 'weaponhit' } }] },
  airSlash: { impact: [{ at: 0, smear: { n: 2, width: 10, colors: [W, '#cfeaff'] }, sprite: { key: 'phantom' } }] },
  moonblastAtk: { windup: [{ at: 0, sprite: { key: 'magicspell', at: 'mouth' } }], impact: [{ at: 0, sprite: { key: 'magicspell' } }, { at: 0.05, pring: { r: 60, color: '#ffd0e8' } }] },
  hurricane: { impact: [{ at: 0, sprite: { key: 'phantom', n: 2, spread: 20 } }] },
  thunderAtk: { impact: [{ at: 0, sprite: { key: 'lightning', z: 0, anchor: 'bottom' } }] },
  willOWisp: { fx: [{ at: 0.1, sprite: { key: 'bluefire', n: 3, spread: 20 } }] },
  explosion: { impact: [{ at: 0, sprite: { key: 'sunburn', n: 3, spread: 30 } }] },
  flamethrower: { impact: [{ at: 0, sprite: { key: 'flamelash' } }] },
  scald: { impact: [{ at: 0, sprite: { key: 'bubbles' } }] },
  darkPulse: { windup: [{ at: 0, sprite: { key: 'vortex', tint: '#5a2a8a', at: 'mouth' } }], impact: [{ at: 0, sprite: { key: 'darkbolt' } }] },
  dazzlingGleam: { impact: [{ at: 0, sprite: { key: 'magicspell' } }] },
  leafStorm: { impact: [{ at: 0, sprite: { key: 'felspell', n: 2, spread: 20 } }] },
  flashCannon: { windup: [{ at: 0, sprite: { key: 'phantom', at: 'mouth' } }], impact: [{ at: 0, sprite: { key: 'phantom' } }] },
  solarBeam: { windup: [{ at: 0, sprite: { key: 'felspell', tint: '#fff6a0', at: 'mouth' } }], impact: [{ at: 0, sprite: { key: 'sunburn', tint: '#fff6a0' } }] },
  heatWave: { impact: [{ at: 0, sprite: { key: 'flamelash' } }] },
  fakeOut: { impact: [{ at: 0, sprite: { key: 'weaponhit' }, focus: { life: 0.25 } }] },
  extremeSpeed: { windup: [{ at: 0, focus: { life: 0.3 }, where: 'user' }], impact: [{ at: 0, sprite: { key: 'phantom' } }] },
  auraSphere: { windup: [{ at: 0, sprite: { key: 'magicspell', tint: '#6aa8ff', at: 'mouth' } }], impact: [{ at: 0, sprite: { key: 'sunburn', tint: '#6aa8ff' } }] },
};

// Every other move: a pixel-art layer chosen from how it works (its Action), its type and its power.
export function templateAnims(m) {
  const t = T[m.type] ?? T.normal, pw = m.power ?? 0, strong = pw >= 100, kind = m.Action?.name, cols = [W, t.c[1]];
  const focus = strong ? [{ at: 0, focus: { life: 0.35 }, where: 'user' }] : [];
  switch (kind) {
    case 'Melee':
      return { windup: focus, impact: [{ at: 0, smear: { n: pw >= 80 ? 2 : 1, width: 8 + Math.round(pw / 20), radius: 22, colors: cols } }, ...(strong ? [{ at: 0.02, sprite: sp(t.accent) }] : [])] };
    case 'Dash':
      return { windup: [{ at: 0, sprite: sp(t.charge, { at: 'user', speed: 1.5 }) }, ...focus], impact: [{ at: 0, smear: { n: 2, step: Math.PI, width: 10, colors: cols } }] };
    case 'BeamAttack':
      return { windup: [{ at: 0, sprite: sp(t.charge, { at: 'mouth', speed: 1.4 }) }, ...focus], impact: [{ at: 0.02, sprite: sp(t.accent), pring: { r: 44, color: t.c[0] } }] };
    case 'Sequence': case 'Shot': case 'Stream': case 'Thunderbolt':
      return { windup: [{ at: 0, sprite: sp(t.charge, { at: 'mouth', speed: 1.6 }) }, ...focus], impact: strong ? [{ at: 0.02, sprite: sp(t.accent) }] : [] };
    case 'Shockwave': case 'Earthquake':
      return { windup: focus, impact: [{ at: 0, sprite: sp(t.accent) }, { at: 0.03, pring: { r: 70, color: t.c[0], width: 3 } }] };
    case 'Utility': {
      const k = m.util?.kind;
      if (k === 'ray') return { fx: [{ at: 0.1, sprite: sp(t.accent) }] };
      if (k === 'heal' || k === 'weatherHeal') return { fx: [{ at: 0.05, sprite: { key: 'magicspell', tint: '#7dffb0', at: 'user' }, where: 'user' }] };
      return { fx: [{ at: 0.05, sprite: { key: 'protection', tint: t.c[1], at: 'user' }, pring: { r: 46, color: t.c[0] }, where: 'user' }] };
    }
    default:
      return {};
  }
}
