// The shared visual layer every move gets, on top of its own animation:
//   • every hit throws out a realistic burst of its element (fx-real.js), sized by how hard it landed;
//   • hard hits (critical, super effective, or a big share of the foe's HP) get an anime impact frame and a
//     hit-pause; critical hits also get concentration lines;
//   • strong moves (power 100+) wind up with concentration lines on the user.
// It only listens to battle events ('hit', 'move'), so it never changes what a move does, and it does nothing on
// the server (headless).
import { ImpactFrame, FocusLines } from './fx-anime.js';
import { elementBurst } from './fx-real.js';
import { TYPE_COLORS } from './data/types.js';
import { FxSprite } from './fx-sprites.js';

// The hand-drawn hit animation for each type: [hard hit, ordinary hit], each [sheet, tint?] (public/fx).
const HIT_FX = {
  normal: [['weaponhit'], ['weaponhit']],
  fighting: [['vortex'], ['weaponhit', '#ffb080']],
  fire: [['sunburn'], ['flamelash']],
  water: [['bubbles'], ['magickahit']],
  electric: [['radialspark'], ['spark']],
  grass: [['felspell'], ['felspell']],
  ice: [['nebula'], ['freezing']],
  poison: [['felspell', '#c050e0'], ['plasmaburst', '#c060d0']],
  ground: [['firebomb', '#c8a060'], ['weaponhit', '#e0c090']],
  flying: [['phantom'], ['weaponhit']],
  psychic: [['vortex', '#ff70c0'], ['magicspell']],
  bug: [['felspell', '#b8e040'], ['plasmaburst', '#a8d040']],
  rock: [['nebula', '#b8a070'], ['weaponhit', '#d8c8a0']],
  ghost: [['midnight'], ['darkbolt']],
  dragon: [['sunburn', '#8a5cff'], ['vortex', '#8a5cff']],
  dark: [['darkbolt'], ['vortex', '#5a2a8a']],
  steel: [['phantom'], ['weaponhit', '#dfe7f2']],
  fairy: [['magicspell'], ['bubbles', '#ff9ad0']],
};

const light = type => TYPE_COLORS[type]?.[0] ?? '#ffffff';

export function installHitFx(game) {
  let lastFrame = -Infinity, battle = null;
  const lastSprite = new WeakMap();
  game.on('hit', ({ target, move, dmg, crit, eff, guard }) => {
    if (game.headless || !target) return;
    const frac = dmg / Math.max(1, target.maxHp), z = target.bodyZ;
    const s = 0.5 + Math.min(1.4, frac * 5) + (crit ? 0.3 : 0);
    elementBurst(game, move.type, target.x, target.y, z, move.ultimate ? s * 0.7 : s);
    const hard = !guard && (crit || eff >= 2 || frac >= (move.ultimate ? 0.12 : 0.15) || (!move.ultimate && (move.power ?? 0) >= 100));
    // The clock restarts with every battle, so the rate limit does too.
    if (game.playerTeam !== battle || game.time < lastFrame) { battle = game.playerTeam; lastFrame = -Infinity; }
    if (hard && game.time - lastFrame > 0.4) {
      lastFrame = game.time;
      game.spawn(new ImpactFrame(target.x, target.y - z, Math.min(2, 0.8 + frac * 4), light(move.type)));
      game.hitstop(0.06);
    }
    // The hand-drawn hit animation (one at a time per target, so flurries and ultimates don't pile them up).
    const [hardFx, softFx] = HIT_FX[move.type] ?? HIT_FX.normal, [key, tint] = hard ? hardFx : softFx;
    if ((!move.ultimate || frac >= 0.06 || hard) && !(game.time - (lastSprite.get(target) ?? -9) < 0.12 && game.time >= (lastSprite.get(target) ?? -9))) {
      lastSprite.set(target, game.time);
      game.spawn(new FxSprite(key, target.x + (Math.random() - 0.5) * 6, target.y, z, { tint, flip: Math.random() < 0.5 }));
    }
    if (crit) game.spawn(new FocusLines(target.x, target.y - z, 0.3, '#ffe14d', { follow: target, inner: 34, outer: 200, n: 18 }));
  });
  game.on('move', ({ user, move }) => {
    if (game.headless || !user || move.ultimate || !((move.power ?? 0) >= 100)) return;
    game.spawn(new FocusLines(user.x, user.y - user.bodyZ, 0.35, '#ffffff', { follow: user, inner: 40, outer: 260, n: 22 }));
  });
}
