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

const light = type => TYPE_COLORS[type]?.[0] ?? '#ffffff';

export function installHitFx(game) {
  let lastFrame = -Infinity, battle = null;
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
    if (crit) game.spawn(new FocusLines(target.x, target.y - z, 0.3, '#ffe14d', { follow: target, inner: 34, outer: 200, n: 18 }));
  });
  game.on('move', ({ user, move }) => {
    if (game.headless || !user || move.ultimate || !((move.power ?? 0) >= 100)) return;
    game.spawn(new FocusLines(user.x, user.y - user.bodyZ, 0.35, '#ffffff', { follow: user, inner: 40, outer: 260, n: 22 }));
  });
}
