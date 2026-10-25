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
  const liveTarget=game.player,user=clone(boss),target=clone(liveTarget);
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
  return { user,target,liveTarget,action,t:0,returnT:0,
    get showingTarget(){return liveTarget===game.player&&liveTarget.alive&&!liveTarget.hidden&&(target.held||this.returnT>0);},
    update(dt) {
      this.t+=dt;
      const valid=liveTarget===game.player&&liveTarget.alive&&!liveTarget.hidden;
      if(!valid){target.hidden=true;target.held=false;target.zOverride=null;this.returnT=0;}
      else if(!target.held&&this.returnT<=0){
        Object.assign(target,{x:liveTarget.x,y:liveTarget.y,z:liveTarget.z,dir:liveTarget.dir,hp:liveTarget.hp,species:liveTarget.species,hidden:false,drawScale:liveTarget.drawScale});
        target.sprite.set=liveTarget.sprite.set;
      }
      const held=target.held;
      action.update(dt);
      if(!held&&target.held)target.sprite.play('Hurt',{loop:true,force:true});
      if(valid&&held&&!target.held){this.returnT=.18;this.returnFrom={x:target.x,y:target.y,z:target.z};}
      if(this.returnT>0){
        this.returnT=Math.max(0,this.returnT-dt);const p=1-this.returnT/.18,k=p*p*(3-2*p);
        target.x=this.returnFrom.x+(liveTarget.x-this.returnFrom.x)*k;target.y=this.returnFrom.y+(liveTarget.y-this.returnFrom.y)*k;
        target.zOverride=this.returnFrom.z+(liveTarget.z-this.returnFrom.z)*k;
        if(!this.returnT)target.zOverride=null;
      }
      user.animate(dt);target.animate(dt);
      if(this.t>8&&!action.done)action.cancel();
      return !action.done;
    },
  };
}
