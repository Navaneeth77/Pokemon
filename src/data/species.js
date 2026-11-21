// World units: the arena is 360×640 and sprites are drawn 1:1 in those units.
// mouth/bodyZ/headZ are heights above the Pokémon's own position (which may itself be airborne);
// species without them get values measured from their sprite when it loads (see measureDims).
// `sprite` names a folder in public/sprites. Every Pokémon has four regular `moves`, an `ultimate`
// and an `ability` (data/abilities.js). `mega` lists the forms it can Mega Evolve into (X/Y first).
// Mega forms use their own battle sprites.

import { KANTO_NEW, KANTO_EXISTING, KANTO_MEGAS, TYPE_ULT } from './kanto.js';
import { isFinalSpecies, finalDescendants } from './roster-rules.js';
import { DIMS } from './dims.js';
import { MORE_MEGAS, MORE_MEGA_STATS } from './more-megas.js';

import { MEGA_STATS } from './mega-stats.js';
import { NATIONAL, OFFICIAL_ABILITIES, DEX } from './national.js';
import { NATIONAL_DIMS } from './national-dims.js';
import { SMOGON_ABILITIES, SMOGON_MOVES } from './smogon.js';
import { MOVEDEX } from './movedex.js';
import { officialAbility, ABILITIES } from './abilities.js';

const BASE = { atk: 1, def: 1, weight: 1, class: 'regular' };

function mon(id, name, types, cls, [hp, speed, atk, def, weight], moves, ultimate, ability, extra = {}) {
  return { ...BASE, id, sprite: id, name, types, class: cls, hp, speed, atk, def, weight, moves, ultimate, ability, ...extra };
}
const R = 'regular', L = 'legendary', M = 'mythical';
const hover = (height = 12, amp = 2.5, freq = 3) => ({ fly: { height, amp, freq } });

const LIST = [
  // ── Original roster ──
  mon('charizard', 'Charizard', ['fire', 'flying'], R, [1377, 92, 1.05, 1, 1], ['flamethrower', 'dragonClaw', 'airSlash', 'earthquake'], 'blastBurn', 'blaze', {
    radius: 12, shadow: [11, 4], mouth: { z: 20, fwd: 9 }, bodyZ: 14, headZ: 30, fly: { height: 14, amp: 2.5, freq: 4 },
    faintAnim: 'Faint', mega: ['charizardMegaX'],
  }),
  mon('pikachu', 'Pikachu', ['electric'], R, [1080, 112, 1, 0.9, 0.7], ['thunderbolt', 'quickAttack', 'ironTail', 'voltTackle'], 'thunder', 'staticReflex', {
    radius: 9, shadow: [8, 3], mouth: { z: 12, fwd: 7 }, bodyZ: 9, headZ: 22, faintAnim: 'Faint',
  }),
  mon('rayquaza', 'Rayquaza', ['dragon', 'flying'], L, [1520, 98, 1.15, 1.05, 1.5], ['dragonPulse', 'extremeSpeed', 'dragonClaw', 'airSlash'], 'dragonAscent', 'dragonsFury', {
    radius: 17, shadow: [18, 6], mouth: { z: 44, fwd: 14 }, bodyZ: 30, headZ: 58, fly: { height: 12, amp: 2, freq: 2.5 },
    faintAnim: null, mega: ['rayquazaMega'],
  }),
  mon('gyarados', 'Gyarados', ['water', 'flying'], R, [1630, 66, 1.1, 1.05, 1.6], ['waterfall', 'crunch', 'iceFang', 'hyperBeam'], 'gyaradosHydroPump', 'angerPoint', {
    radius: 20, shadow: [20, 7], mouth: { z: 46, fwd: 12 }, bodyZ: 28, headZ: 62, faintAnim: null,
  }),
  mon('sceptile', 'Sceptile', ['grass'], R, [1300, 104, 1, 0.95, 0.9], ['dragonPulse', 'leafStorm', 'leafBlade', 'aerialAce'], 'sceptileLeafBlade', 'leafRush', {
    radius: 11, shadow: [10, 4], mouth: { z: 18, fwd: 8 }, bodyZ: 13, headZ: 32, faintAnim: null, mega: ['sceptileMega'],
  }),
  mon('articuno', 'Articuno', ['ice', 'flying'], L, [1400, 88, 1.05, 1.08, 1], ['iceBeam', 'airSlash', 'aerialAce', 'iceShard'], 'blizzard', 'glacialBuild', {
    radius: 15, shadow: [15, 5], mouth: { z: 26, fwd: 12 }, bodyZ: 20, headZ: 42, fly: { height: 14, amp: 3, freq: 2.8 }, faintAnim: null,
  }),
  mon('lucario', 'Lucario', ['fighting', 'steel'], R, [1280, 106, 1.1, 1, 0.9], ['auraSphere', 'closeCombat', 'extremeSpeed', 'dragonPulse'], 'auraStorm', 'innerAura', { mega: ['lucarioMega'] }),
  mon('greninja', 'Greninja', ['water', 'dark'], R, [1220, 118, 1.05, 0.92, 0.8], ['nightSlash', 'iceBeam', 'quickAttack', 'darkPulse'], 'waterShurikenBarrage', 'proteanShadow'),
  mon('garchomp', 'Garchomp', ['dragon', 'ground'], R, [1500, 100, 1.12, 1.05, 1.3], ['dragonClaw', 'earthquake', 'flamethrower', 'dragonRush'], 'dracoMeteor', 'apexHunter'),
  mon('gengar', 'Gengar', ['ghost', 'poison'], R, [1180, 108, 1.08, 0.92, 0.8], ['shadowBall', 'sludgeBomb', 'thunderbolt', 'darkPulse'], 'gengarShadowBall', 'cursedBody', { mega: ['gengarMega'] }),
  mon('blaziken', 'Blaziken', ['fire', 'fighting'], R, [1300, 98, 1.08, 0.97, 1], ['blazeKick', 'braveBird', 'flamethrower', 'quickAttack'], 'blazeKickOverdrive', 'speedBoost'),
  mon('mewtwo', 'Mewtwo', ['psychic'], L, [1650, 118, 1.3, 1.15, 1.25], ['psychic', 'shadowBall', 'auraSphere', 'iceBeam'], 'psystrike', 'pressure', {
    aura: ['#ffe6f6', '#ff9fe0', '#b060ff'], mega: ['mewtwoMegaY'],
  }),
  mon('dragonite', 'Dragonite', ['dragon', 'flying'], R, [1550, 86, 1.1, 1.05, 1.5], ['dragonClaw', 'airSlash', 'thunderbolt', 'hyperBeam'], 'dracoMeteor', 'innerFocus', hover()),
  mon('metagross', 'Metagross', ['steel', 'psychic'], R, [1580, 76, 1.12, 1.18, 1.8], ['ironHead', 'zenHeadbutt', 'earthquake', 'bulletPunch'], 'meteorMash', 'clearBody'),
  mon('tyranitar', 'Tyranitar', ['rock', 'dark'], R, [1620, 72, 1.15, 1.12, 1.8], ['crunch', 'rockSlide', 'earthquake', 'hyperBeam'], 'stoneEdge', 'sandStream', { mega: ['tyranitarMega'] }),
  mon('eevee', 'Eevee', ['normal'], R, [1100, 112, 0.98, 0.95, 0.6], ['quickAttack', 'swift', 'ironTail', 'shadowBall'], 'extremeEvoboost', 'adaptability'),
  mon('snorlax', 'Snorlax', ['normal'], R, [1800, 58, 1.1, 1.1, 2.4], ['bodySlam', 'crunch', 'earthquake', 'hyperBeam'], 'gmaxSlam', 'thickFat'),
  mon('gardevoir', 'Gardevoir', ['psychic', 'fairy'], R, [1250, 96, 1.08, 1, 0.8], ['psychic', 'shadowBall', 'thunderbolt', 'energyBall'], 'moonblast', 'psychicVeil', { mega: ['gardevoirMega'] }),

  // ── New regular Pokémon ──
  mon('venusaur', 'Venusaur', ['grass', 'poison'], R, [1560, 74, 1.05, 1.12, 1.6], ['solarBeam', 'sludgeBomb', 'earthquake', 'razorLeaf'], 'petalBlizzard', 'overgrow'),
  mon('blastoise', 'Blastoise', ['water'], R, [1560, 74, 1.05, 1.15, 1.6], ['waterPulse', 'flashCannon', 'rapidSpin', 'surf'], 'hydroCannon', 'torrent'),
  mon('infernape', 'Infernape', ['fire', 'fighting'], R, [1260, 112, 1.1, 0.92, 0.9], ['closeCombat', 'flareBlitz', 'machPunch', 'firePunch'], 'infernoOverdrive', 'ironFist'),
  mon('salamence', 'Salamence', ['dragon', 'flying'], R, [1480, 98, 1.12, 1, 1.3], ['dragonClaw', 'dragonRush', 'flamethrower', 'aerialAce'], 'outrage', 'intimidate', hover(10)),
  mon('scizor', 'Scizor', ['bug', 'steel'], R, [1380, 82, 1.12, 1.12, 1.1], ['bulletPunch', 'xScissor', 'ironHead', 'uTurn'], 'bulletBarrage', 'technician'),
  mon('absol', 'Absol', ['dark'], R, [1200, 108, 1.15, 0.9, 0.9], ['nightSlash', 'suckerPunch', 'psychoCut', 'ironTail'], 'calamityStrike', 'superLuck', { mega: ['absolMega'] }),
  mon('zoroark', 'Zoroark', ['dark'], R, [1180, 112, 1.12, 0.9, 0.9], ['shadowClaw', 'nightDaze', 'flamethrower', 'suckerPunch'], 'illusionAmbush', 'illusion'),
  mon('sylveon', 'Sylveon', ['fairy'], R, [1380, 88, 1.05, 1.08, 0.8], ['moonblastShot', 'dazzlingGleam', 'hyperVoice', 'quickAttack'], 'fairyRibbons', 'pixilate'),
  mon('lapras', 'Lapras', ['water', 'ice'], R, [1700, 68, 1, 1.12, 1.7], ['iceBeam', 'surf', 'bodySlam', 'iceShard'], 'sheerCold', 'shellArmor'),
  mon('aegislash', 'Aegislash', ['steel', 'ghost'], R, [1400, 72, 1, 1, 1.1], ['shadowSneak', 'kingsShield', 'ironHead', 'sacredSword'], 'kingsJudgment', 'stanceChange', { forms: ['aegislash-blade'] }),
  mon('umbreon', 'Umbreon', ['dark'], R, [1600, 86, 0.95, 1.18, 0.9], ['darkPulse', 'foulPlay', 'quickAttack', 'shadowBall'], 'lunarEclipse', 'moonlitRecovery'),
  mon('espeon', 'Espeon', ['psychic'], R, [1180, 112, 1.1, 0.92, 0.8], ['psychic', 'psybeam', 'swift', 'dazzlingGleam'], 'psychicPrism', 'magicBounce'),

  // ── Newcomers ──
  mon('scyther', 'Scyther', ['bug', 'flying'], R, [1200, 114, 1.1, 0.95, 0.8], ['xScissor', 'aerialAce', 'quickAttack', 'swordsDance'], 'razorwindExecution', 'swarm', hover(6, 2, 4)),
  mon('gallade', 'Gallade', ['psychic', 'fighting'], R, [1300, 100, 1.12, 1, 0.9], ['psychoCut', 'sacredSword', 'leafBlade', 'quickGuard'], 'psychicBladeDance', 'sharpness'),
  mon('togekiss', 'Togekiss', ['fairy', 'flying'], R, [1450, 90, 1.05, 1.08, 0.9], ['airSlash', 'dazzlingGleam', 'auraSphere', 'roost'], 'celestialRadiance', 'sereneWings', hover(12, 2.5, 2.6)),
  mon('swampert', 'Swampert', ['water', 'ground'], R, [1650, 76, 1.12, 1.12, 1.7], ['mudShot', 'waterfall', 'earthquake', 'icePunch'], 'tidalEarthquake', 'mudArmor'),
  mon('weavile', 'Weavile', ['dark', 'ice'], R, [1150, 120, 1.12, 0.88, 0.7], ['iceShard', 'nightSlash', 'icePunch', 'swordsDance'], 'frozenShadowBarrage', 'iceClaws'),
  mon('talonflame', 'Talonflame', ['fire', 'flying'], R, [1250, 116, 1.08, 0.92, 0.7], ['braveBird', 'flameCharge', 'flareBlitz', 'roost'], 'infernoSkyDive', 'galeWings', hover(14, 3, 3.2)),
  mon('alakazam', 'Alakazam', ['psychic'], R, [1100, 114, 1.2, 0.85, 0.8], ['psychic', 'psybeam', 'shadowBall', 'recover'], 'psychicCataclysm', 'magicGuard'),
  mon('milotic', 'Milotic', ['water'], R, [1550, 84, 1, 1.15, 1.3], ['surf', 'iceBeam', 'aquaRing', 'dragonTail'], 'sereneTidalTempest', 'marvelScale'),
  mon('haxorus', 'Haxorus', ['dragon'], R, [1400, 100, 1.2, 1, 1.3], ['dragonClaw', 'breakingSwipe', 'earthquake', 'ironTail'], 'dragonAxeCataclysm', 'moldBreaker'),
  mon('hydreigon', 'Hydreigon', ['dark', 'dragon'], R, [1500, 98, 1.15, 1, 1.4], ['darkPulse', 'dragonPulse', 'flamethrower', 'flashCannon'], 'triDragonAnnihilation', 'triFury', hover(10, 2, 2.4)),
  mon('porygonZ', 'Porygon-Z', ['normal'], R, [1350, 96, 1.18, 0.92, 0.9], ['triAttack', 'thunderbolt', 'iceBeam', 'recover'], 'digitalDistortion', 'analytic', { sprite: 'porygon-z', ...hover(8, 2, 3) }),

  // ── Legendary ──
  mon('lugia', 'Lugia', ['psychic', 'flying'], L, [1700, 92, 1.08, 1.2, 1.6], ['airSlash', 'surf', 'extrasensory', 'lugiaWaterPulse'], 'aeroblast', 'multiscale', hover(14, 2.5, 2.4)),
  mon('hoOh', 'Ho-Oh', ['fire', 'flying'], L, [1650, 90, 1.15, 1.1, 1.5], ['braveBird', 'flamethrower', 'extrasensory', 'earthquake'], 'sacredFire', 'regenerator', { sprite: 'ho-oh', ...hover(14, 2.5, 2.4) }),
  mon('kyogre', 'Kyogre', ['water'], L, [1650, 86, 1.2, 1.1, 1.9], ['waterPulse', 'surf', 'iceBeam', 'thunderbolt'], 'originPulse', 'drizzle'),
  mon('groudon', 'Groudon', ['ground'], L, [1700, 80, 1.22, 1.12, 2], ['earthquake', 'firePunch', 'rockSlide', 'flamethrower'], 'precipiceBlades', 'drought'),
  mon('dialga', 'Dialga', ['steel', 'dragon'], L, [1700, 82, 1.18, 1.15, 1.9], ['flashCannon', 'dragonPulse', 'ironHead', 'earthquake'], 'roarOfTime', 'temporalFlow'),
  mon('palkia', 'Palkia', ['water', 'dragon'], L, [1600, 92, 1.2, 1.05, 1.7], ['waterPulse', 'dragonClaw', 'aquaTail', 'dragonPulse'], 'spacialRend', 'spatialStep'),
  mon('giratina', 'Giratina', ['ghost', 'dragon'], L, [1850, 80, 1.1, 1.15, 1.9], ['shadowClaw', 'dragonPulse', 'shadowBall', 'shadowSneak'], 'shadowForce', 'distortion'),
  mon('reshiram', 'Reshiram', ['dragon', 'fire'], L, [1600, 90, 1.2, 1.05, 1.6], ['flamethrower', 'dragonPulse', 'dragonClaw', 'extrasensory'], 'blueFlare', 'turboblaze'),
  mon('zekrom', 'Zekrom', ['dragon', 'electric'], L, [1600, 90, 1.2, 1.05, 1.6], ['thunderbolt', 'dragonClaw', 'crunch', 'thunderPunch'], 'boltStrike', 'teravolt'),
  mon('xerneas', 'Xerneas', ['fairy'], L, [1640, 92, 1.15, 1.05, 1.5], ['moonblastShot', 'dazzlingGleam', 'psyshock', 'megahorn'], 'geomancy', 'fairyAura'),
  mon('yveltal', 'Yveltal', ['dark', 'flying'], L, [1640, 94, 1.15, 1.05, 1.5], ['darkPulse', 'airSlash', 'suckerPunch', 'braveBird'], 'oblivionWing', 'darkAura', hover(14, 2.5, 2.2)),
  mon('solgaleo', 'Solgaleo', ['psychic', 'steel'], L, [1700, 84, 1.18, 1.12, 1.9], ['ironHead', 'zenHeadbutt', 'flameCharge', 'flashCannon'], 'sunsteelStrike', 'fullMetalBody'),
  mon('lunala', 'Lunala', ['psychic', 'ghost'], L, [1650, 92, 1.18, 1.05, 1.5], ['shadowBall', 'moonblastShot', 'psyshock', 'airSlash'], 'moongeistBeam', 'shadowShield', hover(14, 2.5, 2.2)),
  mon('zacian', 'Zacian', ['fairy'], L, [1500, 112, 1.2, 1, 1.2], ['playRough', 'sacredSword', 'ironHead', 'quickAttack'], 'behemothBlade', 'intrepidSword'),
  mon('zamazenta', 'Zamazenta', ['fighting'], L, [1600, 104, 1.1, 1.2, 1.4], ['ironHead', 'closeCombat', 'crunch', 'bodySlam'], 'behemothBash', 'dauntlessShield'),
  mon('eternatus', 'Eternatus', ['poison', 'dragon'], L, [1850, 88, 1.15, 1.05, 2], ['dragonPulse', 'sludgeBomb', 'flamethrower', 'flashCannon'], 'dynamaxCannon', 'dynamaxPressure', hover(10, 2, 2)),
  mon('koraidon', 'Koraidon', ['fighting', 'dragon'], L, [1600, 104, 1.18, 1.05, 1.6], ['dragonClaw', 'closeCombat', 'flareBlitz', 'dragonRush'], 'collisionCourse', 'orichalcumPulse'),
  mon('zapdos', 'Zapdos', ['electric', 'flying'], L, [1420, 100, 1.1, 1, 1], ['thunderbolt', 'drillPeck', 'discharge', 'heatWave'], 'thunderousSkies', 'static', hover(14, 3, 2.8)),
  mon('moltres', 'Moltres', ['fire', 'flying'], L, [1420, 94, 1.12, 1, 1], ['flamethrower', 'airSlash', 'heatWave', 'braveBird'], 'skyInferno', 'flameBody', hover(14, 3, 2.8)),
  mon('raikou', 'Raikou', ['electric'], L, [1380, 112, 1.1, 0.98, 1.2], ['thunderbolt', 'crunch', 'extremeSpeed', 'discharge'], 'voltFangStorm', 'lightningPace'),
  mon('entei', 'Entei', ['fire'], L, [1520, 98, 1.15, 1, 1.5], ['flamethrower', 'flareBlitz', 'crunch', 'heatWave'], 'eruption', 'flashFire'),
  mon('suicune', 'Suicune', ['water'], L, [1520, 96, 1, 1.15, 1.4], ['surf', 'iceBeam', 'auroraBeam', 'extremeSpeed'], 'auroraTide', 'pureSpring'),
  mon('regirock', 'Regirock', ['rock'], L, [1750, 58, 1.1, 1.3, 2.2], ['rockSlide', 'hammerArm', 'earthquake', 'powerGem'], 'regiRockfall', 'solidRock'),
  mon('regice', 'Regice', ['ice'], L, [1650, 64, 1.05, 1.25, 2], ['iceBeam', 'icePunch', 'thunderbolt', 'iceShard'], 'absoluteZero', 'frostArmor'),
  mon('registeel', 'Registeel', ['steel'], L, [1750, 60, 1, 1.32, 2.2], ['flashCannon', 'ironHead', 'hammerArm', 'earthquake'], 'ironFortress', 'ironWill'),
  mon('latias', 'Latias', ['dragon', 'psychic'], L, [1450, 104, 1.05, 1.1, 1], ['dragonPulse', 'extrasensory', 'zenHeadbutt', 'aerialAce'], 'mistBall', 'levitate', { ...hover(12), mega: ['latiasMega'] }),
  mon('latios', 'Latios', ['dragon', 'psychic'], L, [1450, 106, 1.12, 1, 1], ['dragonPulse', 'psyshock', 'dragonRush', 'airSlash'], 'lusterPurge', 'lusterSight', { ...hover(12), mega: ['latiosMega'] }),
  mon('regieleki', 'Regieleki', ['electric'], L, [1250, 125, 1.15, 0.88, 1], ['thunderbolt', 'voltSwitch', 'discharge', 'extremeSpeed'], 'thunderCage', 'transistor'),
  mon('regidrago', 'Regidrago', ['dragon'], L, [1850, 70, 1.18, 0.95, 2], ['dragonClaw', 'dragonPulse', 'crunch', 'hammerArm'], 'dragonEnergy', 'dragonsMaw'),

  // ── Mythical ──
  mon('mew', 'Mew', ['psychic'], M, [1500, 104, 1.1, 1.05, 0.7], ['psychic', 'auraSphere', 'flamethrower', 'copy'], 'psychicGenesis', 'transformMastery', hover(12, 3, 2.6)),
  mon('celebi', 'Celebi', ['psychic', 'grass'], M, [1450, 100, 1.05, 1.05, 0.7], ['magicalLeaf', 'psybeam', 'energyBall', 'dazzlingGleam'], 'futureSight', 'naturalCure', hover(12, 3, 2.6)),
  mon('jirachi', 'Jirachi', ['steel', 'psychic'], M, [1500, 98, 1.05, 1.1, 0.8], ['ironHead', 'zenHeadbutt', 'swift', 'flashCannon'], 'doomDesire', 'sereneGrace', hover(10, 3, 2.6)),
  mon('deoxys', 'Deoxys', ['psychic'], M, [1150, 120, 1.25, 0.85, 1], ['psyshock', 'extremeSpeed', 'zenHeadbutt', 'shadowBall'], 'psychoBoost', 'formShift'),
  mon('darkrai', 'Darkrai', ['dark'], M, [1350, 112, 1.15, 0.95, 1], ['darkPulse', 'suckerPunch', 'sludgeBomb', 'iceBeam'], 'darkVoid', 'badDreams', { ...hover(8, 2, 2), mega: ['darkraiMega'] }),
  mon('shaymin', 'Shaymin', ['grass'], M, [1350, 104, 1.05, 1, 0.6], ['energyBall', 'magicalLeaf', 'airSlash', 'dazzlingGleam'], 'seedFlare', 'sereneBloom'),
  mon('arceus', 'Arceus', ['normal'], M, [1750, 100, 1.15, 1.12, 1.8], ['extremeSpeed', 'earthquake', 'shadowClaw', 'hyperBeam'], 'judgment', 'multitype'),
  mon('victini', 'Victini', ['psychic', 'fire'], M, [1350, 106, 1.12, 1, 0.7], ['searingShot', 'zenHeadbutt', 'flameCharge', 'thunderPunch'], 'vCreate', 'victoryStar', hover(8, 3, 3)),
  mon('keldeo', 'Keldeo', ['water', 'fighting'], M, [1380, 108, 1.12, 0.98, 1], ['aquaJet', 'sacredSword', 'surf', 'closeCombat'], 'secretSword', 'justified'),
  mon('genesect', 'Genesect', ['bug', 'steel'], M, [1400, 100, 1.12, 1.02, 1.3], ['uTurn', 'flashCannon', 'xScissor', 'thunderbolt'], 'technoBlast', 'download'),
  mon('diancie', 'Diancie', ['rock', 'fairy'], M, [1500, 82, 1, 1.2, 1.1], ['powerGem', 'moonblastShot', 'rockSlide', 'dazzlingGleam'], 'diamondStorm', 'crystalShell', { mega: ['diancieMega'] }),
  mon('hoopa', 'Hoopa', ['psychic', 'ghost'], M, [1450, 96, 1.15, 1, 0.9], ['psyshock', 'shadowBall', 'darkPulse', 'zenHeadbutt'], 'hyperspaceFury', 'magician', hover(8, 2.5, 2.6)),
  mon('volcanion', 'Volcanion', ['fire', 'water'], M, [1550, 86, 1.15, 1.08, 1.7], ['scald', 'flamethrower', 'sludgeBomb', 'earthquake'], 'steamEruption', 'waterAbsorb'),
  mon('marshadow', 'Marshadow', ['fighting', 'ghost'], M, [1300, 116, 1.15, 0.95, 0.7], ['shadowSneak', 'closeCombat', 'shadowPunch', 'machPunch'], 'soulStealing', 'shadowStep'),
  mon('zeraora', 'Zeraora', ['electric'], M, [1350, 118, 1.12, 0.95, 0.9], ['thunderPunch', 'voltSwitch', 'closeCombat', 'blazeKick'], 'plasmaFists', 'voltAbsorb', { mega: ['zeraoraMega'] }),
  mon('pecharunt', 'Pecharunt', ['poison', 'ghost'], M, [1500, 82, 1.05, 1.15, 0.8], ['shadowBall', 'sludgeBomb', 'poisonJab', 'hex'], 'malignantChain', 'poisonPuppeteer'),
];

// Kanto additions: game stats follow the official base stats (bulk → HP and defence, the better attacking
// stat → attack, speed → speed, weight → knockback resistance), on the same scale as the hand-tuned roster.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r2 = v => Math.round(v * 100) / 100;
for (const [dex, id, name, typeStr, [hp, at, df, sa, sd, sp], kg, moves, ability, x = {}] of KANTO_NEW) {
  const types = typeStr.split('/'), bst = hp + at + df + sa + sd + sp;
  const stats = [
    Math.round(clamp(560 + 5 * hp + 0.9 * bst, 800, 1900) / 10) * 10, Math.round(clamp(46 + 0.55 * sp, 52, 124)),
    r2(0.85 + Math.max(at, sa) / 400), r2(0.8 + (df + sd) / 800), r2(clamp(0.45 + 0.35 * Math.log(1 + kg / 10), 0.5, 2.4)),
  ];
  const ult = x.ult ?? (types[0] === 'normal' && types[1] === 'flying' ? 'skyAttack' : TYPE_ULT[types[0]]);
  const extra = { kanto: dex, ...(x.sprite && { sprite: x.sprite }), ...(x.hover && hover(...x.hover)) };
  LIST.push(mon(id, name, types, R, stats, moves.split(' '), ult, ability, extra));
}
for (const [dex, id] of Object.entries(KANTO_EXISTING)) LIST.find(s => s.id === id).kanto = +dex;

// Every other fully evolved Pokémon (national.js, generated): the same conversion, with physical and special
// attack and defence kept apart so a Pokémon's better side really is better.
const CLASS = { R, L, M };
// Eternal Flower Floette is a standalone form and does not evolve into Florges.
const eternalFloette = [670, 'floetteEternal', 'Floette (Eternal Flower)', 'fairy',
  [74, 65, 67, 125, 128, 92], 0.9, 'moonblastAtk energyBall calmMind wish', 'R',
  { sprite: 'floette-eternal', hover: [7, 2, 3], ability: 'flowerVeil' }];
for (const [dex, id, name, typeStr, [hp, at, df, sa, sd, sp], kg, moves, cls, x] of [...NATIONAL, eternalFloette]) {
  const types = typeStr.split('/'), bst = hp + at + df + sa + sd + sp;
  const stats = [
    Math.round(clamp(560 + 5 * hp + 0.9 * bst, 800, 1900) / 10) * 10, Math.round(clamp(46 + 0.55 * sp, 52, 124)),
    r2(0.85 + at / 400), r2(0.8 + df / 400), r2(clamp(0.45 + 0.35 * Math.log(1 + kg / 10), 0.5, 2.4)),
  ];
  const ult = types[0] === 'normal' && types[1] === 'flying' ? 'skyAttack' : TYPE_ULT[types[0]];
  LIST.push(mon(id, name, types, CLASS[cls], stats, moves.split(' '), ult, x.ability ?? null, {
    dex, spa: r2(0.85 + sa / 400), spdef: r2(0.8 + sd / 400), sprite: x.sprite, ...(x.hover && hover(...x.hover)),
  }));
}
// Castform's weather forms (Forecast) are loaded with it.
const castform = LIST.find(x => x.id === 'castform');
if (castform) castform.forms = ['castform-sunny', 'castform-rainy', 'castform-snowy'];

// Field moves (moves.js) for the Pokémon known for them: they replace the fourth move.
const FIELD_MOVES = {
  stealthRock: ['tyranitar', 'garchomp', 'skarmory', 'hippowdon', 'excadrill', 'heatran', 'rhyperior', 'golem', 'aerodactyl', 'landorus', 'tingLu', 'glimmora', 'probopass', 'gigalith', 'coalossal', 'stonjourner', 'garganacl', 'kleavor'],
  spikes: ['forretress', 'ferrothorn', 'cloyster', 'delphox', 'omastar', 'roserade', 'smeargle', 'greninja', 'qwilfish'],
  toxicSpikes: ['toxapex', 'nidoqueen', 'tentacruel', 'dragalge', 'drapion', 'garbodor', 'skuntank'],
  stickyWeb: ['galvantula', 'ribombee', 'araquanid', 'vikavolt', 'masquerain', 'ariados', 'leavanny', 'spidops'],
  rainDance: ['politoed', 'kingdra', 'ludicolo', 'pelipper', 'barraskewda', 'floatzel'],
  sunnyDay: ['ninetales', 'torkoal', 'venusaur', 'sunflora', 'tropius', 'lilligant', 'leafeon'],
  sandstorm: ['sandslash', 'flygon', 'cacturne', 'sandaconda', 'krookodile'],
  snowscape: ['abomasnow', 'froslass', 'frosmoth', 'arctozolt', 'arctovish', 'beartic', 'cetitan'],
  electricTerrain: ['pincurchin', 'raichu', 'electivire', 'bellibolt'],
  grassyTerrain: ['rillaboom', 'whimsicott', 'meganium'],
  psychicTerrain: ['indeedee', 'hatterene', 'alakazam'],
  mistyTerrain: ['florges', 'sylveon', 'weezing', 'grimmsnarl'],
};
// Movesets from Smogon's sets (smogon.js, built by scripts/build-movedex.py): each Pokémon's real moves. A set
// with fewer than four usable moves keeps enough of its previous moves to fill the rest.
// A species' own hand-made signature move (Lugia's Water Pulse…) stays, replacing its least important attack
// (a damaging move outside its own types, else the last move).
for (const s of LIST) {
  const smogon = SMOGON_MOVES[s.id];
  if (!smogon) continue;
  const signature = s.moves.filter(m => m.startsWith(s.id));
  const moves = [...new Set([...smogon, ...s.moves.filter(m => !signature.includes(m))])].slice(0, 4);
  for (const sig of signature) {
    const drop = [...moves].reverse().find(m => MOVEDEX[m] && MOVEDEX[m].cat !== 'status' && !s.types.includes(MOVEDEX[m].type)) ?? moves[moves.length - 1];
    moves.splice(moves.indexOf(drop), 1, sig);
  }
  s.moves = moves;
}

// Only for Pokémon without a Smogon set: Smogon's sets already include these where they belong.
for (const [move, ids] of Object.entries(FIELD_MOVES)) for (const id of ids) {
  const s = LIST.find(x => x.id === id);
  if (s && !SMOGON_MOVES[id] && !s.moves.includes(move)) s.moves = [...s.moves.slice(0, 3), move];
}

// Official abilities for every fully evolved Pokémon: the one Smogon's sets play it with (Chlorophyll for
// Venusaur, Rough Skin for Garchomp…), else its first official one the game implements (see abilities.js).
for (const s of LIST) {
  s.dex = DEX[s.id] ?? s.dex ?? s.kanto;
  const smogon = SMOGON_ABILITIES[s.id]?.find(a => ABILITIES[a]);
  const pick = smogon ?? (OFFICIAL_ABILITIES[s.id] && officialAbility(OFFICIAL_ABILITIES[s.id]));
  if (pick) Object.assign(s, { ability: pick, abilities: OFFICIAL_ABILITIES[s.id] });
}

// Species whose established signature has its own ultimate choreography.
const signatureUltimates = {
  celebi: 'celebiForestSpiral',
  florges: 'florgesPetalRay',
  greninja: 'greninjaNightSlash',
  cinderace: 'pyroBallUlt',
  decidueye: 'spiritShackleUlt',
  dragapult: 'dragonDartsUlt',
  floetteEternal: 'lightOfRuinUlt',
  inteleon: 'snipeShotUlt',
  garganacl: 'saltCureUlt',
  rillaboom: 'drumBeatingUlt',
  tinkaton: 'gigatonHammerUlt',
  uxie: 'mysticalPowerUlt',
  mesprit: 'mysticalPowerUlt',
  azelf: 'mysticalPowerUlt',
  heatran: 'magmaStormUlt',
  regigigas: 'crushGripUlt',
  cobalion: 'sacredSwordUlt',
  terrakion: 'sacredSwordUlt',
  virizion: 'sacredSwordUlt',
  tornadus: 'bleakwindStormUlt',
  thundurus: 'wildboltStormUlt',
  landorus: 'sandsearStormUlt',
  kyurem: 'glaciateUlt',
  meloetta: 'relicSongUlt',
  zygarde: 'nihilLightUlt',
  silvally: 'multiAttackUlt',
  tapuKoko: 'naturesMadnessUlt',
  tapuLele: 'naturesMadnessUlt',
  tapuBulu: 'naturesMadnessUlt',
  tapuFini: 'naturesMadnessUlt',
  necrozma: 'photonGeyserUlt',
  magearna: 'fleurCannonUlt',
  melmetal: 'doubleIronBashUlt',
  urshifu: 'wickedBlowUlt',
  glastrier: 'glacialLanceUlt',
  spectrier: 'astralBarrageUlt',
  enamorus: 'springtideStormUlt',
  chiYu: 'ruinationUlt',
  ogerpon: 'ivyCudgelUlt',
  terapagos: 'teraStarstormUlt',
  beedrill: 'twineedleUlt',
  raichu: 'voltTackleUlt',
  marowak: 'bonemerangUlt',
  tauros: 'ragingBullUlt',
  octillery: 'octazookaUlt',
  hitmontop: 'tripleKickUlt',
  vespiquen: 'attackOrderUlt',
  chatot: 'chatterUlt',
  rhyperior: 'rockWreckerUlt',
  klinklang: 'gearGrindUlt',
  volcarona: 'fieryDanceUlt',
  ironMoth: 'fieryDanceUlt',
  hawlucha: 'flyingPressUlt',
  primarina: 'sparklingAriaUlt',
  crabominable: 'iceHammerUlt',
  oricorio: 'revelationDanceUlt',
  lycanroc: 'accelerockUlt',
  tsareena: 'tropKickUlt',
  togedemaru: 'zingZapUlt',
  pincurchin: 'zingZapUlt',
  dhelmise: 'anchorShotUlt',
  kommoO: 'clangingScalesUlt',
  blacephalon: 'mindBlownUlt',
  flapple: 'gravAppleUlt',
  appletun: 'appleAcidUlt',
  toxtricity: 'overdriveUlt',
  grimmsnarl: 'falseSurrenderUlt',
  morpeko: 'auraWheelUlt',
  dracozolt: 'boltBeakUlt',
  arctozolt: 'boltBeakUlt',
  dracovish: 'fishiousRendUlt',
  arctovish: 'fishiousRendUlt',
  wyrdeer: 'psyshieldBashUlt',
  kleavor: 'stoneAxeUlt',
  basculegion: 'lastRespectsUlt',
  houndstone: 'lastRespectsUlt',
  sneasler: 'direClawUlt',
  overqwil: 'barbBarrageUlt',
  meowscarada: 'flowerTrickUlt',
  skeledirge: 'torchSongUlt',
  quaquaval: 'aquaStepUlt',
  pawmot: 'doubleShockUlt',
  maushold: 'populationBombUlt',
  armarouge: 'armorCannonUlt',
  ceruledge: 'bitterBladeUlt',
  wugtrio: 'tripleDiveUlt',
  palafin: 'jetPunchUlt',
  revavroom: 'spinOutUlt',
  glimmora: 'mortalSpinUlt',
  dondozo: 'orderUpUlt',
  annihilape: 'rageFistUlt',
  farigiraf: 'twinBeamUlt',
  dudunsparce: 'hyperDrillUlt',
  kingambit: 'kowtowCleaveUlt',
  baxcalibur: 'glaiveRushUlt',
  gholdengo: 'makeItRainUlt',
  walkingWake: 'hydroSteamUlt',
  ironLeaves: 'psybladeUlt',
  sinistcha: 'matchaGotchaUlt',
  archaludon: 'electroShotUlt',
  hydrapple: 'fickleBeamUlt',
  incineroar: 'darkestLariatUlt',
  ursaluna: 'headlongRushUlt',
  greatTusk: 'headlongRushUlt',
};
for (const species of LIST) {
  species.ultimate = signatureUltimates[species.id] ?? species.ultimate;
}

// Mega forms inherit everything from their base form and have their size re-measured from their own sheet.
const MEGAS = [
  ['charizard', 'charizardMegaX', 'Mega Charizard X', { sprite: 'charizard-mega-x', types: ['fire', 'dragon'], speed: 100, atk: 1.3, def: 1.2, radius: 13, weight: 1.15,
    shadow: [12, 4], mouth: { z: 22, fwd: 10 }, bodyZ: 16, headZ: 34, fly: { height: 16, amp: 2.5, freq: 4 }, faintAnim: null, flame: 'blue',
    aura: ['#e6f8ff', '#8fd8ff', '#3a96f0'], ability: 'toughClaws' }],
  ['rayquaza', 'rayquazaMega', 'Mega Rayquaza', { sprite: 'rayquaza-mega', speed: 106, atk: 1.35, def: 1.15, radius: 18, weight: 1.7, shadow: [19, 6],
    mouth: { z: 40, fwd: 14 }, bodyZ: 26, headZ: 54, fly: { height: 14, amp: 2, freq: 2.5 }, ability: 'deltaStream', aura: ['#fff6b0', '#9fffc8', '#3fd07a'] }],
  ['sceptile', 'sceptileMega', 'Mega Sceptile', { sprite: 'sceptile-mega', types: ['grass', 'dragon'], speed: 116, atk: 1.2, def: 1.02, ability: 'lightningRod', aura: ['#eaffd8', '#7be05a', '#ff7a5a'] }],
  ['lucario', 'lucarioMega', 'Mega Lucario', { sprite: 'lucario-mega', speed: 116, atk: 1.32, ability: 'adaptability', aura: ['#dff0ff', '#6aa8ff', '#2a5ad8'] }],
  ['gengar', 'gengarMega', 'Mega Gengar', { sprite: 'gengar-mega', atk: 1.28, def: 1.02, ability: 'shadowTag', aura: ['#f0d8ff', '#a060e0', '#3a1858'] }],
  ['mewtwo', 'mewtwoMegaY', 'Mega Mewtwo Y', { sprite: 'mewtwo-mega-y', atk: 1.52, def: 1.12, speed: 130, ability: 'insomnia', aura: ['#ffe6f6', '#ff9fe0', '#b060ff'] }],
  ['tyranitar', 'tyranitarMega', 'Mega Tyranitar', { sprite: 'tyranitar-mega', atk: 1.32, def: 1.3, ability: 'sandStream', aura: ['#e8dcc0', '#b8a070', '#5a5040'] }],
  ['gardevoir', 'gardevoirMega', 'Mega Gardevoir', { sprite: 'gardevoir-mega', atk: 1.3, def: 1.08, ability: 'pixilate', aura: ['#ffe8f4', '#ff9fd0', '#e060a0'] }],
  ['absol', 'absolMega', 'Mega Absol', { sprite: 'absol-mega', speed: 120, atk: 1.32, ability: 'magicBounce', aura: ['#ffffff', '#c8d0e8', '#3a3048'] }],
  ['latias', 'latiasMega', 'Mega Latias', { sprite: 'latias-mega', atk: 1.2, def: 1.25, ability: 'levitate', aura: ['#ffe0f0', '#d880c0', '#7a3aa0'] }],
  ['latios', 'latiosMega', 'Mega Latios', { sprite: 'latios-mega', atk: 1.32, def: 1.1, ability: 'levitate', aura: ['#e0ecff', '#7aa0e8', '#2a3a90'] }],
  ['diancie', 'diancieMega', 'Mega Diancie', { sprite: 'diancie-mega', speed: 104, atk: 1.25, def: 1.15, ability: 'magicBounce', aura: ['#ffffff', '#ffc0e0', '#ff70b0'] }],
  ['darkrai', 'darkraiMega', 'Mega Darkrai', { sprite: 'darkrai-mega', atk: 1.32, def: 1.02, ability: 'badDreams', aura: ['#d8c8ff', '#6a3a8a', '#1a0f24'] }],
  ['zeraora', 'zeraoraMega', 'Mega Zeraora', { sprite: 'zeraora-mega', speed: 128, atk: 1.3, ability: 'voltAbsorb', aura: ['#fff8c0', '#ffe066', '#3a8ae8'] }],
  // Sheets redrawn at game scale from fan art supplied by the player (SpriteCollab has no Mega Salamence, Mega Beedrill or Mega Ampharos sprite yet).
  ['salamence', 'salamenceMega', 'Mega Salamence', { sprite: 'salamence-mega', ability: 'aerilate', aura: ['#ffe4e4', '#e0585a', '#2f78b8'] }],
  ['beedrill', 'beedrillMega', 'Mega Beedrill', { sprite: 'beedrill-mega', ability: 'adaptability', faintAnim: 'Faint', aura: ['#fff6d0', '#f2c21c', '#a848a8'] }],
  ['ampharos', 'ampharosMega', 'Mega Ampharos', { sprite: 'ampharos-mega', ability: 'moldBreaker', faintAnim: 'Faint', aura: ['#fffbe0', '#ffd84a', '#6a5cf0'] }],
  // Built from the player's key-pose atlases (one pose per action and direction), art/sources.
  ['golurk', 'golurkMega', 'Mega Golurk', { sprite: 'golurk-mega', ability: 'unseenFist', faintAnim: 'Faint', aura: ['#ffffff', '#c9a05a', '#45346a'] }],
  // Ash-Greninja: Battle Bond Greninja's form after a KO (not a Mega). Built from the player's walk sheet, art/sources/ash-greninja.
  ['greninjaBond', 'greninjaAsh', 'Ash-Greninja', { sprite: 'greninja-ash', formChange: 'bond', ability: 'battleBond', faintAnim: 'Faint', ultimate: 'waterShurikenBarrage', aura: ['#ffffff', '#5a8ef0', '#c8402c'] }],
  ['abomasnow', 'abomasnowMega', 'Mega Abomasnow', { sprite: 'abomasnow-mega', ability: 'snowWarning', faintAnim: 'Faint', aura: ['#ffffff', '#62b947', '#2b8794'] }],
  ['meganium', 'meganiumMega', 'Mega Meganium', { sprite: 'meganium-mega', faintAnim: 'Faint', aura: ['#ffffff', '#62b947', '#b05a80'] }],
  ['meowstic', 'meowsticMega', 'Mega Meowstic', { sprite: 'meowstic-mega', ability: 'trace', faintAnim: 'Faint', aura: ['#ffffff', '#f2588a', '#b02e58'] }],
  ['golisopod', 'golisopodMega', 'Mega Golisopod', { sprite: 'golisopod-mega', ability: 'toughClaws', faintAnim: 'Faint', aura: ['#ffffff', '#a8b820', '#5f6d84'] }],
  ['malamar', 'malamarMega', 'Mega Malamar', { sprite: 'malamar-mega', ability: 'contrary', faintAnim: 'Faint', aura: ['#ffffff', '#6a5848', '#b02e58'] }],
  ['metagross', 'metagrossMega', 'Mega Metagross', { sprite: 'metagross-mega', ability: 'toughClaws', faintAnim: 'Faint', aura: ['#ffffff', '#a3b1c4', '#b02e58'] }],
  ['magearna', 'magearnaMega', 'Mega Magearna', { sprite: 'magearna-mega', faintAnim: 'Faint', aura: ['#ffffff', '#a3b1c4', '#b05a80'] }],
  ['crabominable', 'crabominableMega', 'Mega Crabominable', { sprite: 'crabominable-mega', ability: 'ironFist', faintAnim: 'Faint', aura: ['#ffffff', '#c8402c', '#2b8794'] }],
  ['feraligatr', 'feraligatrMega', 'Mega Feraligatr', { sprite: 'feraligatr-mega', ability: 'dragonize', faintAnim: 'Faint', aura: ['#ffffff', '#5a8ef0', '#4322ad'] }],
  ['barbaracle', 'barbaracleMega', 'Mega Barbaracle', { sprite: 'barbaracle-mega', ability: 'toughClaws', faintAnim: 'Faint', aura: ['#ffffff', '#b8a038', '#802414'] }],
  ['garchomp', 'garchompMega', 'Mega Garchomp', { sprite: 'garchomp-mega', ability: 'sandForce', faintAnim: 'Faint', aura: ['#ffffff', '#7a4cf2', '#8a6630'] }],
  ['heatran', 'heatranMega', 'Mega Heatran', { sprite: 'heatran-mega', faintAnim: 'Faint', aura: ['#ffffff', '#f2833a', '#5f6d84'] }],
  ['delphox', 'delphoxMega', 'Mega Delphox', { sprite: 'delphox-mega', ability: 'levitate', faintAnim: 'Faint', aura: ['#ffffff', '#f2833a', '#b02e58'] }],
  ['emboar', 'emboarMega', 'Mega Emboar', { sprite: 'emboar-mega', ability: 'moldBreaker', faintAnim: 'Faint', aura: ['#ffffff', '#f2833a', '#802414'] }],
  ['chandelure', 'chandelureMega', 'Mega Chandelure', { sprite: 'chandelure-mega', ability: 'infiltrator', faintAnim: 'Faint', aura: ['#ffffff', '#7a5aa8', '#b8461c'] }],
  ['absol', 'absolMegaZ', 'Mega Absol Z', { sprite: 'absol-mega-z', ability: 'sharpness', faintAnim: 'Faint', aura: ['#ffffff', '#6a5848', '#45346a'] }],
  ['garchomp', 'garchompMegaZ', 'Mega Garchomp Z', { sprite: 'garchomp-mega-z', ability: 'levitate', faintAnim: 'Faint', aura: ['#ffffff', '#7a4cf2', '#4322ad'] }],
  ['baxcalibur', 'baxcaliburMega', 'Mega Baxcalibur', { sprite: 'baxcalibur-mega', ability: 'thermalExchange', faintAnim: 'Faint', aura: ['#ffffff', '#7a4cf2', '#2b8794'] }],
  ['froslass', 'froslassMega', 'Mega Froslass', { sprite: 'froslass-mega', ability: 'snowWarning', faintAnim: 'Faint', aura: ['#ffffff', '#62c9d3', '#45346a'] }],
  ['blastoise', 'blastoiseMega', 'Mega Blastoise', { sprite: 'blastoise-mega', ability: 'megaLauncher', faintAnim: 'Faint', aura: ['#ffffff', '#5a8ef0', '#2b57bd'] }],
  ['dragonite', 'dragoniteMega', 'Mega Dragonite', { sprite: 'dragonite-mega', ability: 'multiscale', faintAnim: 'Faint', aura: ['#ffffff', '#7a4cf2', '#5c4cc2'] }],
  ['audino', 'audinoMega', 'Mega Audino', { sprite: 'audino-mega', ability: 'healer', faintAnim: 'Faint', aura: ['#ffffff', '#a8a878', '#b05a80'] }],
  ['pidgeot', 'pidgeotMega', 'Mega Pidgeot', { sprite: 'pidgeot-mega', ability: 'noGuard', faintAnim: 'Faint', aura: ['#ffffff', '#a8a878', '#5c4cc2'] }],
  ['heracross', 'heracrossMega', 'Mega Heracross', { sprite: 'heracross-mega', ability: 'skillLink', faintAnim: 'Faint', aura: ['#ffffff', '#a8b820', '#802414'] }],
  // Drawn from the player's directional sheets (v3, or v4 where redrawn for readability; Raichu Y keeps v3, as the player chose), art/sources/mega-sprite-downloads.
  ['aggron', 'aggronMega', 'Mega Aggron', { sprite: 'aggron-mega', ability: 'filter', faintAnim: 'Faint', aura: ['#ffffff', '#6fd2ea', '#a0a0b4'] }],
  ['blaziken', 'blazikenMega', 'Mega Blaziken', { sprite: 'blaziken-mega', ability: 'speedBoost', faintAnim: 'Faint', aura: ['#ffffff', '#bd4141', '#f0a010'] }],
  ['charizard', 'charizardMegaY', 'Mega Charizard Y', { sprite: 'charizard-mega-y', ability: 'drought', faintAnim: 'Faint', aura: ['#ffffff', '#ee8329', '#084152'] }],
  ['chesnaught', 'chesnaughtMega', 'Mega Chesnaught', { sprite: 'chesnaught-mega', ability: 'bulletproof', faintAnim: 'Faint', aura: ['#ffffff', '#791423', '#7eac4e'] }],
  ['clefable', 'clefableMega', 'Mega Clefable', { sprite: 'clefable-mega', ability: 'magicBounce', faintAnim: 'Faint', aura: ['#ffffff', '#ee7791', '#5ea6ad'] }],
  ['glimmora', 'glimmoraMega', 'Mega Glimmora', { sprite: 'glimmora-mega', ability: 'adaptability', faintAnim: 'Faint', aura: ['#ffffff', '#1a3086', '#327387'] }],
  ['gyarados', 'gyaradosMega', 'Mega Gyarados', { sprite: 'gyarados-mega', ability: 'moldBreaker', faintAnim: 'Faint', aura: ['#ffffff', '#cdac7b', '#207cc1'] }],
  ['lucario', 'lucarioMegaZ', 'Mega Lucario Z', { sprite: 'lucario-mega-z', ability: 'auraGuard', faintAnim: 'Faint', aura: ['#ffffff', '#293d4a', '#eaea88'] }],
  ['mewtwo', 'mewtwoMegaX', 'Mega Mewtwo X', { sprite: 'mewtwo-mega-x', ability: 'steadfast', faintAnim: 'Faint', aura: ['#ffffff', '#6e318c', '#2b68b3'] }],
  ['pinsir', 'pinsirMega', 'Mega Pinsir', { sprite: 'pinsir-mega', ability: 'aerilate', faintAnim: 'Faint', aura: ['#ffffff', '#5a4131', '#a0a0b4'] }],
  ['scizor', 'scizorMega', 'Mega Scizor', { sprite: 'scizor-mega', ability: 'technician', faintAnim: 'Faint', aura: ['#ffffff', '#d53939', '#087599'] }],
  ['scolipede', 'scolipedeMega', 'Mega Scolipede', { sprite: 'scolipede-mega', ability: 'shellArmor', faintAnim: 'Faint', aura: ['#ffffff', '#621010', '#792775'] }],
  ['scovillain', 'scovillainMega', 'Mega Scovillain', { sprite: 'scovillain-mega', ability: 'spicySpray', faintAnim: 'Faint', aura: ['#ffffff', '#335e4b', '#51a156'] }],
  ['staraptor', 'staraptorMega', 'Mega Staraptor', { sprite: 'staraptor-mega', ability: 'contrary', faintAnim: 'Faint', aura: ['#ffffff', '#7b4120', '#a0a0b4'] }],
  ['starmie', 'starmieMega', 'Mega Starmie', { sprite: 'starmie-mega', ability: 'hugePower', faintAnim: 'Faint', aura: ['#ffffff', '#727eec', '#5d4534'] }],
  ['swampert', 'swampertMega', 'Mega Swampert', { sprite: 'swampert-mega', ability: 'swiftSwim', faintAnim: 'Faint', aura: ['#ffffff', '#5a5a8b', '#e87747'] }],
  ['venusaur', 'venusaurMega', 'Mega Venusaur', { sprite: 'venusaur-mega', ability: 'thickFat', faintAnim: 'Faint', aura: ['#ffffff', '#19554d', '#b36f50'] }],
  ['victreebel', 'victreebelMega', 'Mega Victreebel', { sprite: 'victreebel-mega', ability: 'innardsOut', faintAnim: 'Faint', aura: ['#ffffff', '#d8c121', '#412214'] }],
  ['raichu', 'raichuMegaY', 'Mega Raichu Y', { sprite: 'raichu-mega-y', ability: 'noGuard', faintAnim: 'Faint', aura: ['#ffffff', '#ba7b22', '#a0a0b4'] }],
  ...KANTO_MEGAS,
  ...MORE_MEGAS,
];

// Battle Bond Greninja is its own Pokémon (as in Sun & Moon): Greninja with Battle Bond instead of Protean. When it
// knocks out a foe it becomes Ash-Greninja (abilities-official.js battleBond, Game.bondForm). Ordinary Greninja
// keeps Protean and has no form change.
{
  const g = LIST.find(s => s.id === 'greninja');
  LIST.splice(LIST.indexOf(g) + 1, 0, { ...g, id: 'greninjaBond', name: 'Greninja (Battle Bond)', ability: 'battleBond', abilities: ['battleBond'], bondForm: 'greninjaAsh', moves: [...g.moves] });
}

export const SPECIES = {};
for (const s of LIST) SPECIES[s.id] = s;
for (const [baseId, id, name, o] of MEGAS) {
  const base = SPECIES[baseId];
  // A form reached another way (Battle Bond) isn't on the Mega list.
  if (!o.formChange && !(base.mega ??= []).includes(id)) base.mega.push(id);
  const own = o.sprite && o.sprite !== base.sprite;
  const dims = own ? { radius: undefined, shadow: undefined, mouth: undefined, bodyZ: undefined, headZ: undefined } : {};
  SPECIES[id] = { ...base, ...dims, id, name, megaOf: baseId, mega: null, faintAnim: own ? null : base.faintAnim, ...o, sprite: o.sprite ?? base.sprite };
  const verified = MEGA_STATS[id] ?? MORE_MEGA_STATS[id];
  if (verified) {
    const { base: b, form: f } = verified;
    base.baseStats = b;
    Object.assign(SPECIES[id], {
      baseStats: f, types: verified.types, hp: base.hp,
      atk: base.atk * f.atk / b.atk, def: base.def * f.def / b.def,
      spa: base.atk * f.spa / b.spa, spdef: base.def * f.spd / b.spd,
      speed: base.speed * f.spe / b.spe,
    });
  }
}

// Sizes for species without hand-tuned dimensions (measured from their sprites, see dims.js).
for (const s of Object.values(SPECIES)) {
  const d = s.bodyZ == null && (DIMS[s.sprite] ?? NATIONAL_DIMS[s.sprite]);
  if (d) Object.assign(s, { radius: d[0], shadow: [d[0], d[5]], bodyZ: d[1], headZ: d[2], mouth: { z: d[3], fwd: d[4] } });
}

export const ALL_BASE_SPECIES = LIST.map(s => s.id);
export const ROSTER = ALL_BASE_SPECIES.filter(isFinalSpecies);
const legalRoster = new Set(ROSTER);
export const isPlayable = id => legalRoster.has(id);
export function eligibleReplacement(id,used=new Set()) {
 const descendants=finalDescendants(id);
 return ROSTER.find(p=>!used.has(p)&&descendants.includes(p.toLowerCase()))
  ?? ROSTER.find(p=>!used.has(p)&&SPECIES[p].class==='regular'&&SPECIES[p].types.some(t=>SPECIES[id]?.types.includes(t)))
  ?? ROSTER.find(p=>!used.has(p));
}
export function normalizeTeam(ids,size=Math.min(6,Math.max(1,ids?.length||3))) {
 const input=Array.isArray(ids)?ids:[],used=new Set(),out=[];
 // Reserve retained teammates so replacements cannot displace them.
 const reserved=new Set(input.filter(isPlayable));
 for(const id of input.slice(0,size)) {
  const next=isPlayable(id)&&!used.has(id)?id:eligibleReplacement(id,new Set([...used,...reserved]));
  if(next){out.push(next);used.add(next);}
 }
 while(out.length<size){const next=eligibleReplacement(null,used);if(!next)break;out.push(next);used.add(next);}
 return out;
}
// All 151, in Pokédex order.
export const KANTO = LIST.filter(s => s.kanto && isPlayable(s.id)).sort((a, b) => a.kanto - b.kanto).map(s => s.id);
export const DEFAULT_TEAM = ['charizard', 'raichu', 'rayquaza'];
export const OPPONENT_TEAM = ['gyarados', 'sceptile', 'articuno'];
export const CLASS_LABEL = { regular: 'Regular', legendary: 'Legendary', mythical: 'Mythical' };

// Sprite folders a team needs: base forms, Mega forms and alternate battle forms (Aegislash's Blade).
export function spritesFor(ids) {
  const out = new Set();
  for (const id of ids) {
    const s = SPECIES[id];
    out.add(s.sprite);
    for (const m of s.mega ?? []) out.add(SPECIES[m].sprite);
    if (s.bondForm) out.add(SPECIES[s.bondForm].sprite); // Battle Bond: Ash-Greninja
    for (const f of s.forms ?? []) out.add(f);
  }
  return [...out];
}
