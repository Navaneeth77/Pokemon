// World units: the arena is 360×640 and sprites are drawn 1:1 in those units.
// mouth/bodyZ/headZ are heights above the Pokémon's own position (which may itself be airborne).
// `sprite` names a folder in public/sprites; `mega` names the species it Mega Evolves into.

export const PLAYER_TEAM = ['charizard', 'pikachu', 'rayquaza'];
export const OPPONENT_TEAM = ['gyarados', 'sceptile', 'articuno'];

const CHARIZARD_MOVES = ['flamethrower', 'dragonClaw', 'airSlash', 'earthquake'];
const RAYQUAZA_MOVES = ['dragonPulse', 'extremeSpeed', 'dragonClaw', 'dragonAscent'];

export const SPECIES = {
  charizard: {
    id: 'charizard', sprite: 'charizard', name: 'Charizard', trainer: 'RED', types: ['fire', 'flying'],
    hp: 1377, speed: 92, radius: 12, weight: 1, shadow: [11, 4],
    mouth: { z: 20, fwd: 9 }, bodyZ: 14, headZ: 30, fly: { height: 14, amp: 2.5, freq: 4 },
    faintAnim: 'Faint', mega: 'charizardMegaX', moves: CHARIZARD_MOVES,
  },
  charizardMegaX: {
    id: 'charizardMegaX', sprite: 'charizard-mega-x', name: 'Mega Charizard X', trainer: 'RED', types: ['fire', 'dragon'],
    hp: 1377, speed: 100, atk: 1.3, def: 1.2, radius: 13, weight: 1.15, shadow: [12, 4],
    mouth: { z: 22, fwd: 10 }, bodyZ: 16, headZ: 34, fly: { height: 16, amp: 2.5, freq: 4 },
    faintAnim: null, flame: 'blue', aura: ['#e6f8ff', '#8fd8ff', '#3a96f0'], moves: CHARIZARD_MOVES,
  },
  pikachu: {
    id: 'pikachu', sprite: 'pikachu', name: 'Pikachu', trainer: 'RED', types: ['electric'],
    hp: 1050, speed: 108, radius: 9, weight: 0.7, shadow: [8, 3],
    mouth: { z: 12, fwd: 7 }, bodyZ: 9, headZ: 22,
    faintAnim: 'Faint', moves: ['thunderbolt', 'quickAttack', 'ironTail', 'thunder'],
  },
  rayquaza: {
    id: 'rayquaza', sprite: 'rayquaza', name: 'Rayquaza', trainer: 'RED', types: ['dragon', 'flying'],
    hp: 1500, speed: 96, radius: 17, weight: 1.5, shadow: [18, 6],
    mouth: { z: 44, fwd: 14 }, bodyZ: 30, headZ: 58, fly: { height: 12, amp: 2, freq: 2.5 },
    faintAnim: null, mega: 'rayquazaMega', moves: RAYQUAZA_MOVES,
  },
  // Delta Stream: while it is on the field, strong winds cancel Flying-type weaknesses (see combat.js).
  rayquazaMega: {
    id: 'rayquazaMega', sprite: 'rayquaza-mega', name: 'Mega Rayquaza', trainer: 'RED', types: ['dragon', 'flying'],
    hp: 1500, speed: 106, atk: 1.35, def: 1.15, radius: 18, weight: 1.7, shadow: [19, 6],
    mouth: { z: 40, fwd: 14 }, bodyZ: 26, headZ: 54, fly: { height: 14, amp: 2, freq: 2.5 },
    faintAnim: null, ability: 'deltaStream', aura: ['#fff6b0', '#9fffc8', '#3fd07a'], moves: RAYQUAZA_MOVES,
  },
  gyarados: {
    id: 'gyarados', sprite: 'gyarados', name: 'Gyarados', trainer: 'GOLD', types: ['water', 'flying'],
    hp: 1630, speed: 64, radius: 20, weight: 1.6, shadow: [20, 7],
    mouth: { z: 46, fwd: 12 }, bodyZ: 28, headZ: 62,
    faintAnim: null, moves: ['waterfall', 'hydroPump', 'iceFang', 'hyperBeam'],
  },
  sceptile: {
    id: 'sceptile', sprite: 'sceptile', name: 'Sceptile', trainer: 'GOLD', types: ['grass'],
    hp: 1300, speed: 100, radius: 11, weight: 0.9, shadow: [10, 4],
    mouth: { z: 18, fwd: 8 }, bodyZ: 13, headZ: 32,
    faintAnim: null, moves: ['leafBlade', 'energyBall', 'quickAttack', 'earthquake'],
  },
  articuno: {
    id: 'articuno', sprite: 'articuno', name: 'Articuno', trainer: 'GOLD', types: ['ice', 'flying'],
    hp: 1350, speed: 86, radius: 15, weight: 1, shadow: [15, 5],
    mouth: { z: 26, fwd: 12 }, bodyZ: 20, headZ: 42, fly: { height: 14, amp: 3, freq: 2.8 },
    faintAnim: null, moves: ['iceBeam', 'blizzard', 'aerialAce', 'iceShard'],
  },
};
