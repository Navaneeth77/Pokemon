// How each move finds and reaches its target. Every regular attacking move has a profile (move.targeting), built
// from its action and tuned per move below; the actions read their numbers from it, so what a move can reach is
// exactly what it says here:
//
//   kind       homing     a projectile that curves after the foe, within its limits (Swift, Aura Sphere, Shadow Ball)
//              straight   a projectile that flies on the line it was thrown (Ice Shard, Rock Blast, Focus Blast)
//              beam       a corridor that fires after a charge; the aim turns slowly while charging (Ice Beam)
//              stream     a jet whose aim swings after the foe at a limited rate (Flamethrower, Hydro Pump)
//              bolt       an instant strike along the user's aim (Thunderbolt): it lands if the foe is in that line
//              strike     a blow aimed at a spot on the ground that drifts after the foe for a while (Thunder, Rock Slide)
//              melee      contact up close; a short lunge at most (Dragon Claw, Tackle)
//              dash       a rush across a set distance (Extreme Speed, Brave Bird)
//              area       everything within a radius of the user (Earthquake, Dazzling Gleam)
//   range      how far it reaches, in arena pixels (the arena is 360 wide; the two starting spots are 285 apart)
//   hitbox     the projectile's radius / the beam's half-width / the strike's or area's radius / melee reach
//   speed      projectile speed (px/s); travel time is distance ÷ speed (instant moves: Infinity)
//   track      tracking strength: turn rate in rad/s (projectiles, beams, streams, bolts), drift in px/s (strikes)
//   trackTime  how long it keeps tracking after it is released (s)
//   maxTurn    the most it may turn in total while tracking (rad)
//   acquire    'release': aims at the foe as it is thrown; 'cast': locks the foe's position when the move starts
//   fan        volleys: the shots deploy across this angle (rad), fly straight for spreadT seconds, then home back in

const SHARDS = /shard|blast$|spear|missile|cutter|scale|seed|cut$|slash|pin|rock|bomb$/i;
// Swift, Aura Sphere and similar moves have stronger homing.
const STRONG_HOMING = { track: 4.5, trackTime: 1.4, maxTurn: 2.4 };
// Most special orbs bend gently toward a foe that moves.
const SOFT_HOMING = { track: 1.4, trackTime: 0.7, maxTurn: 0.6 };

// Per-move tuning on top of the defaults.
export const TARGETING_TUNING = {
  shadowBall: { track: 1.6 }, energyBall: { track: 1.4 }, sludgeBomb: { kind: 'homing', ...SOFT_HOMING, track: 1.2 }, moonblastShot: { kind: 'homing', ...SOFT_HOMING, track: 1.5 }, moonblastAtk: { kind: 'homing', ...SOFT_HOMING, track: 1.5 },
  fireBlast: { kind: 'straight', speed: 420 }, focusBlast: { kind: 'straight', speed: 380 }, overheat: { kind: 'straight', speed: 420 },
  gunkShotAtk: { kind: 'straight' }, pyroBall: { kind: 'straight' }, poltergeist: { track: 2.4, maxTurn: 1.2 },
  iceShard: { speed: 760 }, vacuumWave: { speed: 760 }, aquaCutter: { speed: 700 }, airCutter: { speed: 650 }, psychoCut: { speed: 680 },
  weatherBall: { track: 1.2 },
  // Ground strikes: how fast the aim point drifts after the foe.
  thunderAtk: { track: 70, range: 320 }, hurricane: { track: 60 }, blizzardAtk: { track: 40, range: 260 }, rockSlide: { track: 30 }, dracoMeteorAtk: { track: 25 },
  earthPower: { track: 45 }, photonGeyser: { track: 55 }, expandingForce: { track: 40 }, grassKnot: { track: 70 }, flowerTrick: { track: 90 },
  makeItRain: { track: 30 }, thousandArrows: { track: 50 }, surf: { track: 20, range: 240 },
};
// Volleys that deploy in a fan and follow the foe, like Leaf Storm's leaves.
const FAN = { kind: 'homing', track: 4.4, trackTime: 1.2, maxTurn: 2.2, spreadT: 0.1 };
Object.assign(TARGETING_TUNING, {
  pinMissile: { ...FAN, fan: 1.1, speed: 440 }, scaleShot: { ...FAN, fan: 1.2, speed: 420 }, rockBlast: { ...FAN, fan: 1.0, speed: 400 },
  bulletSeed: { ...FAN, fan: 1.1, speed: 460 }, icicleSpear: { ...FAN, fan: 1.0, speed: 460 },
  seedBomb: { ...FAN, fan: 0.9, speed: 420 }, iceShard: { ...FAN, fan: 0.8, speed: 560 }, mudShot: { ...FAN, fan: 0.9, speed: 420 },
  ancientPower: { ...FAN, fan: 1.0, speed: 380 }, sludgeBomb: { ...FAN, fan: 0.9, speed: 420 },
  airSlash: { ...FAN, fan: 0.7, speed: 520 }, psyshock: { ...FAN, fan: 0.8, speed: 460 }, powerGem: { ...FAN, fan: 1.0, speed: 440 },
  triAttack: { ...FAN, fan: 1.0, speed: 420 }, swift: { ...FAN, fan: 1.2, speed: 440 },
  // Older single projectiles fired in a spread (Shot): the same fan.
  magicalLeaf: { ...FAN, fan: 0.9 }, razorLeaf: { ...FAN, fan: 0.75 }, acidSpray: { ...FAN, fan: 0.7 }, dragonDarts: { ...FAN, fan: 0.7 },
  boneRush: { ...FAN, fan: 1.1 }, bonemerang: { ...FAN, fan: 0.8 }, twineedle: { ...FAN, fan: 0.6 }, waterShuriken: { ...FAN, fan: 1.1 },
  // Single shots made split volleys (moves.js, move-anims.js).
  ...Object.fromEntries(['ember', 'rockThrow', 'smackDown', 'mudSlap', 'sludge', 'hex', 'leafage', 'waterGun', 'poisonSting', 'dragonBreath', 'magnetBomb',
    'frostBreath', 'silverWind', 'ominousWind', 'mudBomb', 'mysticalFire', 'storedPower', 'extrasensory', 'clearSmog'].map(id => [id, { ...FAN, fan: 0.9 }])),
  ...Object.fromEntries(['fairyWind', 'gust', 'airCutter', 'psychoCut', 'vacuumWave'].map(id => [id, { ...FAN, fan: 0.7 }])),
});
// Explicit homing profiles for hand-tuned moves.
for (const id of ['swift', 'magicalLeaf', 'shockWave', 'magnetBomb', 'disarmingVoice']) TARGETING_TUNING[id] = { ...TARGETING_TUNING[id], kind: 'homing', ...STRONG_HOMING };

const r0 = v => Math.round(v);

// The profile for one move (ultimates and status moves have none: ultimates are cinematic and reach everywhere).
export function profileOf(id, m, recipeKind) {
  if (m.ultimate || m.cat === 'status' || m.util || m.copy) return null;
  const tune = TARGETING_TUNING[id] ?? {};
  let p;
  if (m.seq) {
    const kind = recipeKind ?? 'strike', hit = m.seq.steps.find(s => s.hit)?.hit;
    if (kind === 'missile') {
      const first = m.seq.steps.find(s => s.missile), dur = first?.missile.dur ?? 0.35;
      const homing = m.dex?.sure ? STRONG_HOMING : SHARDS.test(m.name) || m.cat === 'physical' ? null : SOFT_HOMING;
      p = { kind: homing ? 'homing' : 'straight', range: 290, hitbox: 10 * (first?.missile.scale ?? 1), speed: r0(Math.max(360, Math.min(820, 200 / dur))), track: 0, trackTime: 0, maxTurn: 0, acquire: 'release', ...homing };
    } else if (kind === 'self') {
      p = { kind: 'area', range: hit?.r ?? 80, hitbox: hit?.r ?? 80, speed: Infinity, track: 0, trackTime: 0, maxTurn: 0, acquire: 'cast' };
    } else {
      // A spot on the ground: locked where the foe stands when the move starts, drifting after it until just
      // before the blow lands (the last 0.2s give the foe a fair chance to get clear).
      const at = m.seq.steps.find(s => s.hit)?.at ?? 0.5;
      p = { kind: 'strike', range: 280, hitbox: hit?.r ?? 30, speed: Infinity, track: 35, trackTime: Math.max(0, at - 0.2), maxTurn: Math.PI, acquire: 'cast' };
    }
  } else if (m.shot) {
    p = { kind: 'straight', range: m.range ?? 260, hitbox: 8, speed: 300, track: 0, trackTime: 1.2, maxTurn: 1.6, acquire: 'release' };
  } else if (m.beam) {
    p = { kind: 'beam', range: m.range ?? 290, hitbox: m.beam.width ?? 10, speed: Infinity, track: 2.2, trackTime: m.beam.lock ?? 0.25, maxTurn: Math.PI, acquire: 'cast' };
  } else if (m.stream) {
    p = { kind: 'stream', range: m.range ?? m.stream.reach ?? 150, hitbox: m.stream.width ?? 14, speed: Infinity, track: m.stream.track ?? 2.5, trackTime: m.stream.duration ?? 1, maxTurn: Math.PI, acquire: 'cast' };
  } else if (m.dash || m.twoTurn) {
    p = { kind: 'dash', range: m.range ?? m.dash?.dist ?? 200, hitbox: 8, speed: m.dash ? r0((m.dash.dist ?? 200) / (m.dash.dur ?? 0.12)) : 1200, track: 0, trackTime: 0, maxTurn: 0.9, acquire: 'release' };
  } else if (m.shockwave || m.spin || m.slam || /earthquake|bulldoze/i.test(id)) {
    const R = m.shockwave?.radius ?? m.spin?.radius ?? m.radius ?? m.range ?? 85;
    p = { kind: 'area', range: R, hitbox: R, speed: Infinity, track: 0, trackTime: 0, maxTurn: 0, acquire: 'cast' };
  } else if (id === 'thunderbolt') {
    p = { kind: 'bolt', range: m.range ?? 210, hitbox: 16, speed: Infinity, track: 4, trackTime: 0.3, maxTurn: Math.PI, acquire: 'cast' };
  } else {
    // Contact moves (and the remaining hand-made strikes): reach plus a short lunge.
    p = { kind: 'melee', range: (m.reach ?? 24) + (m.melee?.lunge ?? 42), hitbox: m.reach ?? 24, speed: Infinity, track: 0, trackTime: 0, maxTurn: 1.3, acquire: 'release' };
  }
  return { ...p, ...tune };
}
