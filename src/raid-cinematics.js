import { AnimatedSprite } from './sprite.js';
import { MOVES } from './moves.js';

// Run the existing legendary move choreography on detached actors. Damage, telekinesis and
// movement cannot alter the live raid; only the encounter decides its outcome.
export function bossUltimateVisual(game, boss) {
  const clone = mon => {
    const copy = Object.assign(Object.create(Object.getPrototypeOf(mon)), mon);
    copy.sprite = new AnimatedSprite(mon.sprite.set);
    copy.action = null; copy.charging = null; copy.input = { x: 0, y: 0 };
    copy.status = { ...mon.status }; copy.cooldowns = { ...mon.cooldowns };
    return copy;
  };
  const user = clone(boss), target = clone(game.player);
  if (boss.boss === 'lugia') user.zOverride = user.z;
  user.foe = target; target.foe = user;
  const stage = Object.create(game);
  stage.state = 'presentation'; // applyHit rejects non-combat stages
  stage.hud = Object.create(game.hud);
  stage.hud.showBanner = () => {}; // the raid's compact signature card already names this move
  for (const key of ['spawn', 'shake', 'flash', 'punch']) stage[key] = game[key].bind(game);
  stage.hitstop = () => {};
  const move = MOVES[boss.species.ultimate];
  const action = new move.Action(move, user, stage);
  return { user, target, action, t: 0,
    update(dt) {
      this.t += dt;
      action.update(dt); user.animate(dt); target.animate(dt);
      if (this.t > 8 && !action.done) action.cancel();
      return !action.done;
    },
  };
}
