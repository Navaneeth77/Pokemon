import { resultSummary } from '../src/mastery.js';
import { randomBytes } from 'node:crypto';
import { BOSSES, BossEncounter, RAID_DIFFICULTY } from '../src/bosses.js';
export class RaidRooms {
  constructor({ send, validate, create, register, remove, snapshot, capacity, award }) {
    Object.assign(this,{send,validate,create,register,remove,snapshot,capacity,award,waiting:[],sessions:new Map()});
  }
  handle(p,m) {
    if(m.t==='raid-cancel') {this.leaveWaiting(p);return true;}
    if(m.t!=='raid-queue') return false;
    if(p.state!=='idle') return true;
    const spec=this.validate(m);
    if(!spec || !BOSSES[m.boss] || !['public','private','join'].includes(m.kind)) {this.send(p,{t:'raid-cancelled',message:'Invalid raid or team.'});return true;}
    if(!this.capacity()) {this.send(p,{t:'raid-cancelled',message:'Raid capacity reached. Try again shortly.'});return true;}
    const entry={player:p,...spec,boss:m.boss,kind:m.kind,difficulty:RAID_DIFFICULTY[m.difficulty]?m.difficulty:'normal',code:randomBytes(3).toString('hex').toUpperCase(),at:Date.now()};
    let other;
    if(m.kind==='public') other=this.waiting.find(e=>e.kind==='public' && e.boss===m.boss && e.format===m.format && e.difficulty===entry.difficulty);
    if(m.kind==='join') {
      other=this.waiting.find(e=>e.kind==='private' && e.code===m.code && e.boss===m.boss && e.format===m.format);
      if(!other){this.send(p,{t:'raid-cancelled',message:'Room not found. Check code, boss, and team size.'});return true;}
    }
    p.state='raid';
    if(!other){this.waiting.push(entry);this.send(p,{t:'raid-waiting',code:m.kind==='private'?entry.code:null});return true;}
    this.waiting.splice(this.waiting.indexOf(other),1);
    entry.difficulty=other.difficulty;
    const session=new RaidSession(this,[other,entry]);this.sessions.set(session.id,session);this.register(session);session.intro();return true;
  }
  leaveWaiting(p) {this.waiting=this.waiting.filter(e=>e.player!==p);if(p.state==='raid')p.state='idle';}
  tick(now) {
    for(const e of [...this.waiting]) if(now-e.at>180000 || !e.player.ws){this.leaveWaiting(e.player);this.send(e.player,{t:'raid-cancelled',message:'Raid lobby expired.'});}
    for(const s of this.sessions.values()) s.housekeeping(now);
  }
}
class RaidSession {
  constructor(manager, entries) {
    this.manager=manager;this.id=randomBytes(6).toString('hex');this.phase='loading';this.created=Date.now();this.entries=entries;this.loaded={A:false,B:false};this.members=[];this.clock=0;
    this.disconnected=new Map();this.eliminated=new Set();this.abandoned=new Set();
    for(const [i,e] of entries.entries()) {
      const boss={player:{pid:`boss-${this.id}-${i}`,name:BOSSES[e.boss].name,record:{},ws:null,state:'idle'},format:e.format,team:[e.boss],lead:0,mega:{}};
      const match=manager.create(e,boss);match.id=this.id;match.arena=BOSSES[e.boss].arena;match.raidSession=this;
      match.loadedBy=()=>{this.loaded[i?'B':'A']=true;if(this.phase==='battle'){manager.send(e.player,{t:'start',id:this.id});return;}if(this.loaded.A&&this.loaded.B)this.begin();};
      match.finish=(winner,reason)=>{if(winner==='A')this.finish('win',reason);else this.eliminated.add(i);};
      match.leave=(_side,reason)=>{if(reason==='disconnect'){this.disconnected.set(i,Date.now()+15000);match.vec.A={x:0,y:0};}else{this.abandoned.add(i);this.eliminated.add(i);if(this.phase==='loading')this.finish('draw','cancelled');}};
      this.members.push(match);
    }
  }
  intro(player = null) {
    this.members.forEach((m,i)=> { if(player && this.entries[i].player!==player)return; this.manager.send(this.entries[i].player,{t:'matched',id:this.id,you:'A',format:m.format,arena:m.arena,raid:this.entries[i].boss,difficulty:this.entries[0].difficulty,allyTeam:this.entries[1-i].team,
      me:{team:this.entries[i].team,lead:this.entries[i].lead,mega:this.entries[i].mega},foe:{name:BOSSES[this.entries[i].boss].name,team:[this.entries[i].boss],lead:0,mega:{}}}); });
  }
  begin() {
    for(const m of this.members){m.begin();const g=m.game;g.showcase=null;g.state='fighting';g.timers=[];for(const p of [g.player,g.opponent]){p.hidden=false;p.appear=0;}g.gold.hidden=true;}
    this.encounter=new BossEncounter(this.members.map(m=>m.game),this.entries[0].boss,{difficulty:this.entries[0].difficulty});this.flushes=0;this.encounter.externalClock=true;
    this.members.forEach((m,i)=>{m.game.recordCombat('entered',m.game.player);m.game.player.x=120+i*120;m.game.combatants=()=>[...this.members.map(m=>m.game.player),this.encounter.boss];});
    this.phase='battle';
  }
  step() {
    if(this.phase!=='battle')return;
    const dt=1/60;this.clock+=dt;this.encounter.tick(dt);
    for(let i=0;i<this.members.length;i++) {
      const m=this.members[i];if(this.eliminated.has(i))continue;
      m.game.update(dt);m.clock=this.clock;
      if(!m.game.playerTeam.remaining)this.eliminated.add(i);
    }
    if(!this.encounter.boss.alive)this.finish('win','ko');
    else if(this.eliminated.size===2)this.finish('loss','team-eliminated');
    else if(this.clock>600)this.finish('loss','time');
  }
  flush() {
    if(!this.encounter)return;
    const boss=this.encounter.snapshot(this.flushes++%30===0);
    this.members.forEach((m,i)=>{
      const g=m.game,other=this.members[1-i].game,ack=m.ack.A&&[m.ack.A.q,Math.round((this.clock-m.ack.A.at)*1000)];
      this.manager.send(this.entries[i].player,{t:'b',ts:Math.round(this.clock*1000),e:m.out.splice(0,256),s:{A:this.manager.snapshot(g.playerTeam,g.switchCD,ack),B:this.manager.snapshot(g.opponentTeam,0,null)},raid:boss,
        ally:{species:other.player.species.id,x:other.player.x,y:other.player.y,dir:other.player.dir,hp:other.player.hp,maxHp:other.player.maxHp,hidden:other.player.hidden,eliminated:this.eliminated.has(1-i),disconnected:this.disconnected.has(1-i)}});
    });
  }
  housekeeping(now) {
    for(const [i,until] of this.disconnected) {
      if(this.entries[i].player.ws?.readyState===1){this.disconnected.delete(i);continue;}
      if(now>=until){this.abandoned.add(i);this.eliminated.add(i);this.disconnected.delete(i);}
    }
    if(this.phase==='loading'&&now-this.created>45000)this.finish('draw','load-timeout');
  }
  abort(reason){this.finish('draw',reason);}
  finish(result,reason) {
    if(this.phase==='done')return;
    this.flush();this.phase='done';this.manager.remove(this.id);this.manager.sessions.delete(this.id);
    // Everyone's share of the fight, from the server's own records of each player's battle.
    const party=this.members.map((m,i)=>{const own=m.game?.summary?.species.player??{},sum=k=>Math.round(Object.values(own).reduce((n,s)=>n+(s[k]??0),0));
      return {name:this.entries[i].player.name,damage:sum('bossDamage'),faints:sum('faints'),reactions:sum('reactions'),survived:!this.eliminated.has(i)};});
    const time=Math.round(this.encounter?.time??0),stage=this.encounter?.stage??1,difficulty=this.entries[0].difficulty;
    this.entries.forEach((e,i)=>{if(!this.abandoned.has(i)&&!this.disconnected.has(i)&&['ko','team-eliminated','time'].includes(reason)&&this.members[i].game)this.manager.award?.(e.player,resultSummary(this.members[i].game,'player',{id:this.id,result,reason,mode:'raid',team:e.team}));e.player.match=null;e.player.state='idle';this.manager.send(e.player,{t:'end',id:this.id,result,reason,raid:e.boss,difficulty,stage,time,party,you:i,summary:this.members[i].game?resultSummary(this.members[i].game,'player',{mode:'raid'}):null,record:e.player.record,delta:0});});
  }
}
