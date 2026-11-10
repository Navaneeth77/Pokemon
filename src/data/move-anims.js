// Animation recipes for individual moves (see src/move-sequence.js for the steps). A recipe replaces a move's
// generic delivery with its own staged sequence, keeping the move's mechanics. `seq` runs a step sequence;
// `stream` turns it into a continuous stream (Flamethrower's action) with its own look.
const W = '#ffffff';

export const MOVE_ANIMS = {
  // Thunder: a storm cloud gathers over the target, the ground is marked, then the bolt comes down.
  thunderAtk: { seq: { aim: 'target', end: 1.15, steps: [
    { at: 0, anim: 'Charge', gather: { colors: [W, '#fff27a', '#e0b000'], until: 0.55, radius: 30 } },
    { at: 0.1, cloud: { life: 1.1 } },
    { at: 0.25, telegraph: { r: 28, color: '#ffe066', life: 0.75 } },
    { at: 0.9, anim: 'Shoot', lightning: { n: 3, width: 4, branches: 5 }, flash: 0.08, shake: [9, 0.3], mark: 'burn', markSize: 18 },
    { at: 0.9, hit: { r: 30, knockback: 200, stagger: 0.5, hitstop: 0.08 } },
  ] } },
  // Blizzard: a freezing gale whips around the target, then the storm slams down.
  blizzardAtk: { seq: { aim: 'target', end: 1.1, steps: [
    { at: 0, anim: 'Charge', gather: { colors: [W, '#c8f2ff', '#7ab8e8'], until: 0.5, radius: 36, rate: 70 } },
    { at: 0.2, telegraph: { r: 40, color: '#c8f2ff', life: 0.65 } },
    { at: 0.85, anim: 'Shoot', burst: { colors: [W, '#c8f2ff', '#9be6ff'], n: 30, up: 80 }, rings: { colors: [W, '#c8f2ff', '#7ab8e8'], r: 54 }, mark: 'frost', markSize: 34, shake: [6, 0.3], sound: 'ice' },
    { at: 0.85, hit: { r: 42, knockback: 190 } },
  ] } },
  // Stone Edge: the ground under the target splits and stone blades erupt.
  stoneEdgeAtk: { seq: { aim: 'target', end: 0.95, steps: [
    { at: 0, anim: 'Attack' },
    { at: 0.15, telegraph: { r: 26, color: '#c8b080', life: 0.5 } },
    { at: 0.65, spikes: { n: 6, style: 'rock', spread: 24 }, shake: [8, 0.3], sound: 'quake' },
    { at: 0.65, hit: { r: 28, knockback: 230, stagger: 0.5 } },
  ] } },
  // Rock Slide: boulders tumble down onto the target's area.
  rockSlide: { seq: { aim: 'target', end: 1, steps: [
    { at: 0, anim: 'Attack' },
    { at: 0.1, telegraph: { r: 34, color: '#c8b080', life: 0.6 } },
    { at: 0.25, meteors: { n: 4, style: 'rock', spread: 26, dur: 0.45, mark: 'fracture' } },
    { at: 0.72, shake: [6, 0.25], hit: { r: 36, knockback: 170 } },
  ] } },
  // Draco Meteor: the user fires energy skyward; meteors rain down on the target.
  dracoMeteorAtk: { seq: { aim: 'target', end: 1.3, steps: [
    { at: 0, anim: 'Charge', gather: { colors: [W, '#b090ff', '#5a3ad8'], until: 0.45, radius: 36 } },
    { at: 0.45, anim: 'Shoot', pillar: { rgb: [140, 100, 255], height: 260, life: 0.4 }, glow: { rgb: [140, 100, 255], r: 40 } },
    { at: 0.5, telegraph: { r: 44, color: '#b090ff', life: 0.55 } },
    { at: 0.55, meteors: { n: 5, style: 'draco', spread: 34, dur: 0.5, rgb: [160, 120, 255] } },
    { at: 1.05, shake: [12, 0.45], flash: 0.06, mark: 'fracture', markSize: 40 },
    { at: 1.05, hit: { r: 46, knockback: 260, stagger: 0.6, hitstop: 0.1 } },
  ] } },
  // Earth Power: the ground beneath the target glows, then erupts.
  earthPower: { seq: { aim: 'target', end: 0.9, steps: [
    { at: 0, anim: 'Charge' },
    { at: 0.1, telegraph: { r: 30, color: '#e8b060', life: 0.5 }, glow: { at: 'spot', rgb: [230, 160, 80], r: 30 } },
    { at: 0.6, pillar: { rgb: [230, 160, 80], height: 160, life: 0.45 }, burst: { colors: ['#f0d8a0', '#c89850', '#6a4a20'], n: 22 }, mark: 'fracture', shake: [8, 0.3], sound: 'quake' },
    { at: 0.6, hit: { r: 32, knockback: 220 } },
  ] } },
  // Hurricane: a cyclone forms on the target and tears upward.
  hurricane: { seq: { aim: 'target', end: 1, steps: [
    { at: 0, anim: 'Charge', gather: { colors: [W, '#cfeaff', '#8ab8d8'], until: 0.4, radius: 40, rate: 60 } },
    { at: 0.2, telegraph: { r: 32, color: '#cfeaff', life: 0.55 } },
    { at: 0.75, anim: 'Shoot', pillar: { rgb: [210, 240, 255], height: 240, life: 0.6 }, burst: { colors: [W, '#cfeaff'], n: 26, up: 200 }, sound: 'wind' },
    { at: 0.75, hit: { r: 34, knockback: 160, stagger: 0.6 } },
  ] } },
  // Gunk Shot: a heap of toxic sludge is hurled and splashes over the target.
  gunkShotAtk: { seq: { aim: 'target', end: 0.85, steps: [
    { at: 0, anim: 'Attack' },
    { at: 0.15, missile: { style: 'bomb', dur: 0.4, rgb: [170, 70, 190], scale: 1.6 } },
    { at: 0.55, burst: { colors: ['#e0a0f0', '#a040a0', '#5a1f5a'], n: 24 }, mark: 'energy', markRgb: [160, 60, 170], markSize: 26, sound: 'splash' },
    { at: 0.55, hit: { r: 30, knockback: 200 } },
  ] } },
  // Moonblast: the moon's light gathers into an orb that bursts on the target.
  moonblastAtk: { seq: { aim: 'target', end: 0.9, steps: [
    { at: 0, anim: 'Charge', gather: { colors: [W, '#ffc8e4', '#f080b0'], until: 0.4 } },
    { at: 0.4, anim: 'Shoot', missile: { style: 'orb', dur: 0.3, rgb: [255, 180, 220], scale: 1.4 } },
    { at: 0.7, rings: { colors: [W, '#ffc8e4', '#f080b0'], r: 44 }, glow: { at: 'spot', rgb: [255, 170, 220], r: 40 } },
    { at: 0.7, hit: { r: 30, knockback: 190 } },
  ] } },
  // Bug Buzz: a droning sound wave pulses out from the user.
  bugBuzzAtk: { seq: { aim: 'self', end: 0.75, steps: [
    { at: 0, anim: 'Charge' },
    { at: 0.25, anim: 'Shoot', rings: { colors: ['#f0ffd0', '#a8d848', '#5a7a20'], r: 96 }, sound: 'roar' },
    { at: 0.25, hit: { r: 90, knockback: 160 } },
  ] } },
  // Focus Blast: a sphere of focused power is charged in the hands and hurled.
  focusBlast: { seq: { aim: 'target', end: 1, steps: [
    { at: 0, anim: 'Charge', gather: { colors: [W, '#6aa8ff', '#2a5ad8'], until: 0.55, radius: 30 } },
    { at: 0.55, anim: 'Shoot', missile: { style: 'orb', dur: 0.3, rgb: [90, 150, 255], scale: 1.8 } },
    { at: 0.85, rings: { colors: [W, '#6aa8ff', '#2a5ad8'], r: 46 }, shake: [10, 0.35], flash: 0.05, mark: 'fracture', sound: 'explosion' },
    { at: 0.85, hit: { r: 30, knockback: 240, stagger: 0.5 } },
  ] } },
  // Sludge Bomb: a gob of sludge arcs over and bursts.
  sludgeBomb: { seq: { aim: 'target', end: 0.75, steps: [
    { at: 0, anim: 'Shoot', missile: { style: 'bomb', dur: 0.38, rgb: [170, 70, 190], scale: 1.2 } },
    { at: 0.38, burst: { colors: ['#e0a0f0', '#a040a0'], n: 16 }, mark: 'energy', markRgb: [160, 60, 170], markSize: 18, sound: 'splash' },
    { at: 0.38, hit: { r: 26, knockback: 150 } },
  ] } },
  // Shadow Ball: a mass of shadow drifts in and implodes.
  shadowBall: { seq: { aim: 'target', end: 0.8, steps: [
    { at: 0, anim: 'Charge', gather: { colors: ['#c8a0ff', '#7a48b8', '#2a1838'], until: 0.25 } },
    { at: 0.25, anim: 'Shoot', missile: { style: 'orb', dur: 0.32, rgb: [110, 60, 170], scale: 1.4 } },
    { at: 0.57, rings: { colors: ['#c8a0ff', '#7a48b8', '#2a1838'], r: 36 }, glow: { at: 'spot', rgb: [90, 40, 150], r: 34 } },
    { at: 0.57, hit: { r: 28, knockback: 170 } },
  ] } },
  // Dazzling Gleam: a flash of prismatic light all around the user.
  dazzlingGleam: { seq: { aim: 'self', end: 0.6, steps: [
    { at: 0, anim: 'Charge' },
    { at: 0.2, anim: 'Shoot', flash: 0.06, rings: { colors: [W, '#ffe0f0', '#f080b0'], r: 92 }, burst: { colors: [W, '#ffe0f0', '#ffc8e4'], n: 24, up: 60 }, sound: 'pulse' },
    { at: 0.2, hit: { r: 88, knockback: 150 } },
  ] } },
  // Surf: a great wave rises and sweeps over the arena.
  surf: { seq: { aim: 'target', end: 1, steps: [
    { at: 0, anim: 'Charge' },
    { at: 0.15, wave: { rgb: [70, 140, 230], foam: true, life: 0.7 }, sound: 'splash' },
    { at: 0.5, mark: 'wet', markSize: 40, hit: { r: 60, knockback: 200 } },
  ] } },
  // Weather Ball: a ball of the current weather: flame in sun, water in rain, ice in snow, rock in sand.
  weatherBall: { seq: { aim: 'target', end: 0.8, steps: [
    { at: 0, anim: 'Charge', gather: { colors: [W, '#ffffff', '#bfc8d8'], until: 0.25 } },
    { at: 0.25, anim: 'Shoot', missile: { style: 'orb', dur: 0.32, rgb: [255, 255, 255], scale: 1.3 }, weatherTint: true },
    { at: 0.57, rings: { colors: [W, '#bfc8d8'], r: 36 } },
    { at: 0.57, hit: { r: 28, knockback: 170 } },
  ] } },
  // Hydro Pump: a pressurised jet of water.
  hydroPumpAtk: { stream: {
    colors: ['#ffffff', '#86ccff', '#3a8ae8'], rate: 140, speed: [320, 380], life: [0.45, 0.55], sizeEnd: [9, 13], spread: 0.06, track: 1.2,
    duration: 0.9, tick: 0.12, width: 13, reach: 170, knockback: 80, stagger: 0.12, mark: 'wet', sound: () => {},
  } },
  // Scald: a spray of boiling water.
  scald: { stream: {
    colors: ['#ffffff', '#ffd8c0', '#5aa6f0'], rate: 110, speed: [250, 300], life: [0.45, 0.55], sizeEnd: [8, 12], spread: 0.12, track: 1.4,
    duration: 0.8, tick: 0.12, width: 12, reach: 140, knockback: 40, stagger: 0.1, mark: 'wet', sound: () => {},
  } },
};

// ── Shapes shared by many moves, each move giving its own colours, size, count, impact and timing ──
// A projectile charged at the mouth, flown to the target, bursting on impact.
const orb = (colors, rgb, o = {}) => {
  const c = o.charge ?? 0.25, d = o.dur ?? 0.3, hit = c + d;
  return { seq: { aim: 'target', end: hit + (o.after ?? 0.25), steps: [
    { at: 0, anim: 'Charge', gather: { colors, until: c, radius: o.radius ?? 30 } },
    { at: c, anim: 'Shoot', missile: { style: o.style ?? 'orb', dur: d, rgb, scale: o.scale ?? 1.2 } },
    { at: hit, rings: { colors, r: o.r ?? 36 }, ...(o.burst && { burst: { colors, n: o.burst } }), ...(o.mark && { mark: o.mark, markRgb: rgb, markSize: o.markSize ?? 20 }), ...(o.shake && { shake: o.shake }), ...(o.sound && { sound: o.sound }) },
    { at: hit, hit: { r: o.hitR ?? 28, knockback: o.kb ?? 170, stagger: o.stagger ?? 0.35 } },
  ] } };
};
// Something rising out of the ground under the target after a warning.
const erupt = (colors, rgb, o = {}) => ({ seq: { aim: 'target', end: (o.delay ?? 0.55) + 0.3, steps: [
  { at: 0, anim: o.anim ?? 'Charge' },
  { at: 0.1, telegraph: { r: o.r ?? 28, color: colors[1], life: (o.delay ?? 0.55) - 0.1 } },
  { at: o.delay ?? 0.55, ...(o.pillar !== false && { pillar: { rgb, height: o.height ?? 170, life: 0.45 } }), burst: { colors, n: o.n ?? 20, up: o.up ?? 140 }, ...(o.spikes && { spikes: { n: 5, style: o.spikes, spread: o.r ?? 24 } }), ...(o.mark && { mark: o.mark, markRgb: rgb }), shake: o.shake ?? [7, 0.3], ...(o.sound && { sound: o.sound }) },
  { at: o.delay ?? 0.55, hit: { r: (o.r ?? 28) + 2, knockback: o.kb ?? 200, stagger: o.stagger ?? 0.45 } },
] } });
// Rings of sound or power around the user.
const pulse = (colors, r, o = {}) => ({ seq: { aim: 'self', end: (o.at ?? 0.25) + 0.4, steps: [
  { at: 0, anim: 'Charge', ...(o.gather && { gather: { colors, until: o.at ?? 0.25 } }) },
  { at: o.at ?? 0.25, anim: 'Shoot', rings: { colors, r }, burst: { colors, n: o.n ?? 18, up: 60 }, ...(o.flash && { flash: o.flash }), ...(o.shake && { shake: o.shake }), sound: o.sound ?? 'roar' },
  { at: o.at ?? 0.25, hit: { r: r - 6, knockback: o.kb ?? 160 } },
] } });
// Tackles and strikes keep their action; these set their look.
const rush = (color, ghost, o = {}) => ({ dash: { color, ghost, burst: o.burst ?? 'type', width: o.width ?? 5, ...o } });
const strike = (colors, o = {}) => ({ melee: { colors, ...o } });

Object.assign(MOVE_ANIMS, {
  bodyPress: rush('#e8e8f0', '#8f9db2', { windup: 0.2, dist: 130, width: 7, knockback: 230 }),
  flipTurn: rush('#d4f1ff', '#3a8ae8', { through: true, dist: 170 }),
  outrageAtk: strike(['#b090ff', '#ff7a5a'], { fx: 'claw', lunge: 50, hits: [{ knockback: 60 }, { delay: 0.12, knockback: 60 }, { delay: 0.24, knockback: 230, hitstop: 0.07 }] }),
  superpower: strike(['#ff7a2a', '#ffd0b0'], { fx: 'punchT', lunge: 34, hits: [{ knockback: 260, stagger: 0.5, hitstop: 0.08 }] }),
  psychicNoise: pulse(['#ffffff', '#ff8ad0', '#c040a0'], 96, { sound: 'roar' }),
  facade: strike(['#ffffff', '#ffe066'], { fx: 'punchT', lunge: 44 }),
  freezeDry: orb(['#ffffff', '#c8f2ff', '#7ab8e8'], [190, 235, 255], { style: 'crystal', burst: 14, mark: 'frost', sound: 'ice' }),
  alluringVoice: pulse(['#ffffff', '#ffc8e4', '#f080b0'], 92, { sound: 'pulse' }),
  explosion: pulse(['#ffffff', '#ffe066', '#ff7a2a', '#b8461c'], 120, { at: 0.35, gather: true, flash: 0.12, shake: [16, 0.6], n: 40, kb: 300, sound: 'explosion' }),
  return: strike(['#ffffff', '#ffe8a0'], { fx: 'arc', lunge: 46 }),
  heavySlam: rush('#c8d0e0', '#5a6478', { windup: 0.22, dist: 120, width: 8, knockback: 260 }),
  stompingTantrum: erupt(['#ffffff', '#e8d0a0', '#8a6630'], [200, 160, 100], { r: 40, pillar: false, delay: 0.4, mark: 'fracture', sound: 'quake' }),
  grassKnot: erupt(['#ffffff', '#8ad84f', '#3f8f2c'], [120, 210, 80], { r: 20, height: 60, delay: 0.4, mark: 'leaves', kb: 120 }),
  dualWingbeat: strike(['#cfeaff', '#ffffff'], { anim: 'Swing', fx: 'arc', lunge: 48, hits: [{ knockback: 80 }, { delay: 0.14, knockback: 170 }] }),
  tripleAxel: strike(['#c8f2ff', '#ffffff'], { anim: 'Rotate', fx: 'arc', lunge: 40, hits: [{ knockback: 40 }, { delay: 0.12, knockback: 60 }, { delay: 0.24, knockback: 200, hitstop: 0.06 }] }),
  waveCrash: rush('#d4f1ff', '#2b57bd', { windup: 0.16, dist: 190, width: 7, knockback: 250 }),
  nuzzle: strike(['#fff27a', '#ffffff'], { fx: 'arc', lunge: 36 }),
  fakeOut: rush('#ffffff', '#ffd8a0', { windup: 0.02, dist: 110, dur: 0.07 }),
  overheat: orb(['#ffffff', '#ffb070', '#b8461c'], [255, 120, 40], { style: 'flame', scale: 2, dur: 0.35, burst: 24, mark: 'scorch', shake: [10, 0.35], sound: 'explosion', charge: 0.4 }),
  scorchingSands: erupt(['#fff0c0', '#e8b060', '#b8461c'], [230, 150, 70], { r: 30, height: 90, mark: 'scorch' }),
  trailblaze: rush('#e0ffc0', '#62b947', { dist: 160 }),
  storedPower: orb(['#ffffff', '#ff8ad0', '#c040a0'], [255, 120, 200], { scale: 1.5, burst: 16 }),
  hornLeech: strike(['#8ad84f', '#e0ffc0'], { fx: 'arc', lunge: 46 }),
  mysticalFire: orb(['#ffffff', '#ff9ad5', '#ff7a2a'], [255, 140, 170], { style: 'flame', burst: 16, mark: 'scorch' }),
  icicleSpear: orb(['#ffffff', '#c8f2ff'], [200, 240, 255], { style: 'crystal', scale: 0.9, dur: 0.22 }),
  superFang: strike(['#ffffff', '#c8b8a8'], { fx: 'bite', lunge: 44 }),
  bulletSeed: orb(['#e0ffc0', '#8ad84f'], [140, 210, 90], { style: 'seed', scale: 1, dur: 0.25, charge: 0.1 }),
  headlongRush: rush('#e8d0a0', '#8a6630', { windup: 0.15, dist: 190, width: 7, knockback: 250 }),
  supercellSlam: rush('#fff27a', '#e0b000', { windup: 0.15, dist: 180, width: 7, burst: 'electric', knockback: 240 }),
  highJumpKick: rush('#ffd8a0', '#c8402c', { windup: 0.2, dist: 170, width: 6, knockback: 260 }),
  lowKick: strike(['#c8402c', '#ffd0b0'], { fx: 'arc', lunge: 30 }),
  heatCrash: rush('#ffb070', '#b8461c', { windup: 0.22, dist: 120, width: 8, burst: 'fire', knockback: 260 }),
  populationBomb: strike(['#ffffff', '#e8e8d0'], { fx: 'arc', lunge: 40, hits: Array.from({ length: 6 }, (_, i) => ({ delay: i * 0.07, knockback: i === 5 ? 160 : 20 })) }),
  lunge: rush('#d8f080', '#88c040', { dist: 150 }),
  clearSmog: orb(['#ffffff', '#e0e8f0', '#a8b0c0'], [200, 210, 220], { scale: 1.4, burst: 20 }),
  lavaPlume: pulse(['#fff0a0', '#ff9a3a', '#b8461c'], 92, { sound: 'explosion', n: 26 }),
  gyroBall: strike(['#c8d0e0', '#ffffff'], { anim: 'Rotate', fx: 'arc', lunge: 30 }),
  fireLash: strike(['#ff7a2a', '#fff0a0'], { anim: 'Swing', fx: 'arc', lunge: 48, spread: 3 }),
  fieryDance: pulse(['#fff0a0', '#ff9a3a', '#b8461c'], 80, { n: 22, sound: 'flamethrower' }),
  boltBeak: rush('#fff27a', '#e0b000', { windup: 0.08, dist: 170, burst: 'electric' }),
  fishiousRend: strike(['#3a8ae8', '#d4f1ff'], { fx: 'bite', lunge: 44 }),
  waterSpout: erupt(['#ffffff', '#86ccff', '#3a8ae8'], [90, 160, 255], { r: 36, height: 200, mark: 'wet', sound: 'splash' }),
  seismicToss: rush('#ffd8a0', '#c8402c', { windup: 0.2, dist: 110, width: 7, knockback: 280 }),
  thief: strike(['#6a3a8a', '#c8a0ff'], { fx: 'dark', lunge: 46 }),
  crabhammer: strike(['#3a8ae8', '#d4f1ff'], { fx: 'punchT', lunge: 38, critChance: 0.25 }),
  whirlpool: erupt(['#ffffff', '#86ccff', '#3a8ae8'], [90, 160, 255], { r: 30, height: 80, delay: 0.45, mark: 'wet', kb: 80 }),
  endeavor: strike(['#ffffff', '#c8c8b0'], { fx: 'arc', lunge: 40 }),
  megaKick: strike(['#ffffff', '#ffe8a0'], { fx: 'punchT', lunge: 32, hits: [{ knockback: 240, stagger: 0.45, hitstop: 0.07 }] }),
  thousandArrows: erupt(['#ffffff', '#c8f080', '#6a8a30'], [170, 210, 90], { r: 44, spikes: 'rock', delay: 0.5, sound: 'quake' }),
  gigatonHammer: erupt(['#ffffff', '#c8d0e0', '#5a6478'], [200, 210, 225], { r: 34, pillar: false, spikes: 'rock', anim: 'Attack', delay: 0.6, shake: [14, 0.45], kb: 280 }),
  makeItRain: erupt(['#fff8c0', '#ffd84a', '#c89a1a'], [255, 216, 74], { r: 44, height: 40, delay: 0.5, n: 34, up: 60 }),
});

// A status move's look, around the user: rings, a glow and particles in its colours.
const aura = (colors, rgb, o = {}) => ({ fx: [
  { at: 0.05, glow: { rgb, r: o.r ?? 30 }, rings: { colors, r: o.r ?? 34 } },
  { at: 0.15, burst: { colors, n: o.n ?? 14, up: o.up ?? 90 }, ...(o.sound && { sound: o.sound }) },
] });
const beamLook = (colors, o = {}) => ({ beam: { colors: [colors[2] ?? colors[1], colors[1], '#ffffff'], chargeColors: ['#ffffff', ...colors.slice(1)], ...o } });

Object.assign(MOVE_ANIMS, {
  // Status moves.
  rest: aura([W, '#c8b8f0', '#a08ae8'], [160, 140, 232], { up: 30, n: 8 }),
  wish: aura([W, '#fff6b0', '#ffd84a'], [255, 230, 120], { up: 220, n: 10 }),
  haze: aura([W, '#d8dce8', '#9aa0b0'], [200, 205, 220], { r: 70, n: 30, up: 30 }),
  substitute: aura([W, '#ffd0e8', '#ff9fd0'], [255, 170, 210], { n: 10 }),
  shiftGear: aura([W, '#c8d0e0', '#6a7488'], [200, 210, 225], { sound: 'clang' }),
  rockPolish: aura([W, '#e8dcc0', '#a08a60'], [230, 220, 190], { n: 18 }),
  defog: aura([W, '#e8f6ff', '#9fc8e8'], [220, 240, 255], { r: 80, n: 26, up: 40, sound: 'wind' }),
  coil: aura([W, '#e0a0f0', '#a040a0'], [180, 90, 200]),
  strengthSap: aura([W, '#c8ff8a', '#3f9a3a'], [150, 230, 110]),
  honeClaws: aura([W, '#c8a0ff', '#3a2050'], [140, 100, 200], { sound: 'slash' }),
  tidyUp: aura([W, '#ffffff', '#c8c8b0'], [240, 240, 230], { r: 70, n: 20, up: 40 }),
  milkDrink: aura([W, '#fff8f0', '#f0d8c0'], [255, 240, 225]),
  healBell: aura([W, '#fff6b0', '#ffd84a'], [255, 230, 120], { r: 60, sound: 'pulse' }),
  softBoiled: aura([W, '#fff8f0', '#ffe8a0'], [255, 240, 200]),
  cosmicPower: aura([W, '#b8a0ff', '#3a2a90'], [140, 120, 255], { n: 20, up: 120 }),
  taunt: aura([W, '#ff9a7a', '#c84a3a'], [230, 110, 90], { sound: 'roar' }),
  aromatherapy: aura([W, '#ffe0f0', '#9fffc8'], [220, 255, 220], { r: 60 }),
  takeHeart: aura([W, '#ff8ad0', '#c040a0'], [255, 130, 200]),
  tailGlow: aura([W, '#fff27a', '#e0b000'], [255, 240, 120], { n: 18 }),
  glare: aura([W, '#ffe066', '#c8a018'], [255, 220, 100], { n: 6 }),
  stunSpore: aura([W, '#fff27a', '#c8a018'], [255, 240, 140], { n: 20, up: 40 }),
  bellyDrum: aura([W, '#ffd0b0', '#c8402c'], [230, 120, 100], { sound: 'roar' }),
  shoreUp: aura([W, '#f0d8a0', '#c89850'], [230, 200, 140], { n: 20, up: 50 }),
  hypnosis: aura([W, '#ffb0e0', '#a040c0'], [220, 140, 230], { n: 10 }),
  autotomize: aura([W, '#c8d0e0', '#6a7488'], [200, 210, 225], { n: 16, up: 40 }),
  cottonGuard: aura([W, '#ffffff', '#e8f0d8'], [250, 250, 240], { n: 24, up: 40 }),

  // Attacks.
  temperFlare: rush('#ffb070', '#ff7a2a', { burst: 'fire', dist: 160 }),
  meteorMashAtk: strike(['#c8d0e0', '#fff6b0'], { fx: 'punchT', lunge: 40, hits: [{ knockback: 220, hitstop: 0.07 }] }),
  bugBite: strike(['#a8d848', '#f0ffd0'], { fx: 'bite', lunge: 40 }),
  sacredFireAtk: orb([W, '#ffd070', '#ff5a2a'], [255, 140, 50], { style: 'flame', scale: 2, charge: 0.35, burst: 26, mark: 'scorch', shake: [8, 0.3], sound: 'explosion' }),
  boltStrikeAtk: rush('#fff27a', '#3a8ae8', { windup: 0.2, dist: 200, width: 8, burst: 'electric', knockback: 270 }),
  hiddenPowerElectric: orb([W, '#fff27a', '#e0b000'], [255, 235, 100], { style: 'crystal', burst: 10 }),
  hiddenPowerGround: orb([W, '#e8d0a0', '#8a6630'], [210, 170, 110], { style: 'crystal', burst: 10 }),
  hiddenPowerGrass: orb([W, '#c8ff8a', '#3f9a3a'], [150, 230, 110], { style: 'crystal', burst: 10 }),
  hiddenPowerRock: orb([W, '#e8dcc0', '#a08a60'], [210, 190, 150], { style: 'crystal', burst: 10 }),
  hiddenPowerIce: orb([W, '#c8f2ff', '#7ab8e8'], [190, 235, 255], { style: 'crystal', burst: 10 }),
  petalBlizzardAtk: pulse([W, '#ffd0e8', '#ff8ac0'], 90, { n: 34, sound: 'wind' }),
  powerTrip: strike(['#6a3a8a', '#ffe066'], { fx: 'dark', lunge: 44 }),
  airCutter: orb([W, '#e8f6ff', '#9fc8e8'], [230, 245, 255], { style: 'crystal', scale: 1.4, dur: 0.22, charge: 0.12, sound: 'airSlash' }),
  chatter: pulse([W, '#ffe066', '#3a8ae8'], 80, { sound: 'roar' }),
  magmaStorm: erupt([W, '#ff9a3a', '#b8461c'], [255, 110, 40], { r: 34, height: 220, delay: 0.6, mark: 'scorch', sound: 'explosion' }),
  pounce: rush('#d8f080', '#88c040', { dist: 140, windup: 0.08 }),
  tailSlap: strike([W, '#f0e8d0'], { anim: 'Rotate', fx: 'arc', lunge: 34, hits: Array.from({ length: 4 }, (_, i) => ({ delay: i * 0.09, knockback: i === 3 ? 150 : 25 })) }),
  gearGrind: strike(['#c8d0e0', '#ffffff'], { anim: 'Rotate', fx: 'arc', lunge: 38, hits: [{ knockback: 60 }, { delay: 0.14, knockback: 170 }] }),
  dynamicPunchAtk: strike(['#c8402c', '#ffe066'], { fx: 'punchT', lunge: 36, hits: [{ knockback: 260, stagger: 0.6, hitstop: 0.09 }] }),
  vacuumWave: orb([W, '#bfe0ff', '#6aa8ff'], [170, 210, 255], { charge: 0.04, dur: 0.18, scale: 0.9 }),
  bleakwindStorm: erupt([W, '#cfeaff', '#8ab8d8'], [210, 240, 255], { r: 40, height: 240, delay: 0.55, sound: 'wind' }),
  relicSong: pulse([W, '#fff6b0', '#c8a018'], 90, { sound: 'pulse' }),
  crossChop: strike(['#c8402c', '#ffd0b0'], { anim: 'Swing', fx: 'arc', lunge: 44, critChance: 0.25, hits: [{ knockback: 60 }, { delay: 0.1, knockback: 200 }] }),
  spiritShackle: orb([W, '#c8a0ff', '#45346a'], [150, 110, 200], { style: 'crystal', dur: 0.25, burst: 12 }),
  sparklingAria: pulse([W, '#d4f1ff', '#86ccff'], 92, { n: 30, sound: 'splash' }),
  iceHammer: strike(['#9be6ff', '#ffffff'], { fx: 'punchT', lunge: 34, hits: [{ knockback: 250, stagger: 0.5, hitstop: 0.08 }] }),
  revelationDance: pulse([W, '#ffd070', '#ff9a3a'], 84, { n: 24, sound: 'pulse' }),
  accelerock: rush('#e8dcc0', '#a08a60', { windup: 0.03, dist: 150, dur: 0.08 }),
  darkestLariat: strike(['#3a2050', '#ff7a5a'], { anim: 'Rotate', fx: 'dark', lunge: 34, hits: [{ knockback: 60 }, { delay: 0.12, knockback: 200 }] }),
  multiAttack: strike([W, '#e8e8f0'], { fx: 'claw', lunge: 50, hits: [{ knockback: 240, hitstop: 0.07 }] }),
  anchorShot: strike(['#8f9db2', '#ffffff'], { anim: 'Swing', fx: 'arc', lunge: 54, reach: 34 }),
  clangingScales: pulse([W, '#b090ff', '#5a3ad8'], 96, { shake: [6, 0.3], sound: 'clang' }),
  photonGeyser: erupt([W, '#fff6b0', '#ffd84a'], [255, 240, 160], { r: 30, height: 300, delay: 0.6, n: 26, sound: 'beamFire' }),
  fleurCannon: beamLook([W, '#ffc8e4', '#f080b0'], { width: 14, visualWidth: 22, charge: 0.6, big: true, shake: 7 }),
  doubleIronBash: strike(['#c8d0e0', '#ffffff'], { fx: 'punchT', lunge: 40, hits: [{ knockback: 80 }, { delay: 0.15, knockback: 220, hitstop: 0.06 }] }),
  grassyGlide: rush('#e0ffc0', '#62b947', { dist: 150, windup: 0.06 }),
  pyroBall: orb([W, '#ffb070', '#b8461c'], [255, 130, 50], { style: 'flame', scale: 1.8, charge: 0.3, burst: 22, mark: 'scorch', shake: [7, 0.3], sound: 'explosion' }),
  burningJealousy: pulse([W, '#ff9a3a', '#c040a0'], 88, { n: 26, sound: 'flamethrower' }),
  pollenPuff: orb([W, '#fff6b0', '#ffd0e8'], [255, 230, 210], { scale: 1.5, burst: 18 }),
  thunderFang: strike(['#fff27a', '#ffffff'], { fx: 'bite', lunge: 40 }),
  gravApple: erupt([W, '#c8ff8a', '#c8402c'], [200, 80, 60], { r: 26, pillar: false, delay: 0.5, n: 16, kb: 220 }),
  appleAcid: orb([W, '#c8ff8a', '#62b947'], [170, 230, 90], { burst: 16, mark: 'energy' }),
  overdrive: pulse([W, '#fff27a', '#c040a0'], 96, { n: 26, shake: [5, 0.3], sound: 'thunderbolt' }),
  expandingForce: erupt([W, '#ff8ad0', '#c040a0'], [255, 120, 200], { r: 40, height: 120, delay: 0.5 }),
  auraWheel: rush('#fff27a', '#3a2050', { burst: 'electric', dist: 170 }),
  wickedBlow: strike(['#3a2050', '#ff7a5a'], { fx: 'punchT', lunge: 44, hits: [{ knockback: 230, hitstop: 0.07 }] }),
  stoneAxe: erupt([W, '#e8dcc0', '#a08a60'], [210, 190, 150], { r: 24, pillar: false, spikes: 'rock', anim: 'Swing', delay: 0.45 }),
  direClaw: strike(['#a848a8', '#f0c0ff'], { fx: 'claw', lunge: 46 }),
  flowerTrick: erupt([W, '#ffd0e8', '#62b947'], [255, 180, 210], { r: 22, height: 60, delay: 0.4, n: 18 }),
  torchSong: pulse([W, '#ffb070', '#ff5a2a'], 86, { n: 24, sound: 'flamethrower' }),
  aquaStep: rush('#d4f1ff', '#5aa6f0', { dist: 150 }),
  lashOut: strike(['#3a2050', '#c8a0ff'], { fx: 'dark', lunge: 46, hits: [{ knockback: 60 }, { delay: 0.1, knockback: 180 }] }),
  doubleShock: strike(['#fff27a', '#ffffff'], { fx: 'punchT', lunge: 38, hits: [{ knockback: 260, stagger: 0.5, hitstop: 0.09 }] }),
  bite: strike([W, '#ffffff'], { fx: 'bite', lunge: 38 }),
  saltCure: erupt([W, '#f0ecdc', '#c8c0a8'], [240, 236, 220], { r: 24, pillar: false, delay: 0.4, n: 22, up: 60 }),
  armorCannon: beamLook([W, '#ffb070', '#b8461c'], { width: 15, visualWidth: 22, charge: 0.55, big: true, shake: 8 }),
  bitterBlade: strike(['#b090ff', '#ff7a2a'], { anim: 'Swing', fx: 'arc', lunge: 48, spread: 3 }),
  jetPunch: rush('#d4f1ff', '#3a8ae8', { windup: 0.02, dist: 150, dur: 0.07 }),
  mortalSpin: pulse([W, '#e0a0f0', '#a040a0'], 70, { n: 22, sound: 'whoosh' }),
  aquaCutter: orb([W, '#d4f1ff', '#3a8ae8'], [120, 190, 255], { style: 'crystal', scale: 1.6, dur: 0.2, charge: 0.1, sound: 'airSlash' }),
  rageFist: strike(['#7a5aa8', '#ff5a5a'], { fx: 'punchT', lunge: 44, hits: [{ knockback: 220, hitstop: 0.07 }] }),
  kowtowCleave: strike(['#3a2050', '#e0e0f0'], { anim: 'Swing', fx: 'arc', lunge: 52, spread: 3 }),
  hydroSteam: beamLook([W, '#ffe0d0', '#5aa6f0'], { width: 13, visualWidth: 20 }),
  psyblade: strike(['#ff8ad0', '#ffffff'], { anim: 'Swing', fx: 'arc', lunge: 52, spread: 3 }),
  matchaGotcha: orb([W, '#c8ff8a', '#62b947'], [150, 220, 110], { scale: 1.3, burst: 22, mark: 'energy' }),
  ivyCudgel: strike(['#62b947', '#ffffff'], { fx: 'punchT', lunge: 40, hits: [{ knockback: 230, hitstop: 0.07 }] }),
  fickleBeam: beamLook([W, '#b090ff', '#5a3ad8'], { width: 11, visualWidth: 16 }),
  teraStarstorm: beamLook([W, '#ffe8ff', '#b0a0ff'], { width: 16, visualWidth: 26, charge: 0.6, big: true, shake: 8 }),
});

// In Weather Ball's sequence the ball takes the weather's colours.
export const WEATHER_TINT = { sun: [255, 140, 60], rain: [90, 160, 255], snow: [190, 235, 255], sand: [200, 170, 110] };
