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
    { at: 0.15, missile: { style: 'orb', dur: 0.4, rgb: [170, 70, 190], scale: 1.6 } },
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
    { at: 0, anim: 'Shoot', missile: { style: 'orb', dur: 0.38, rgb: [170, 70, 190], scale: 1.2 } },
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

// In Weather Ball's sequence the ball takes the weather's colours.
export const WEATHER_TINT = { sun: [255, 140, 60], rain: [90, 160, 255], snow: [190, 235, 255], sand: [200, 170, 110] };
