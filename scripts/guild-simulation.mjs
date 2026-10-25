// QA only: earn a fixture through the actual combat engine. Never changes player saves.
import '../server/shim.js';
import fs from 'node:fs';
import {Game} from '../src/game.js';
import {OpponentAI} from '../src/ai.js';
import {loadSpriteSets} from '../server/sprites.js';
import {resultSummary} from '../src/mastery.js';
import {freshWallet,progressMatch,walletView} from '../src/economy.js';
const noop=()=>{},sprites=loadSpriteSets(),now=Date.now(),w=freshWallet('guild-qa-fixture',now),matches=[];
for(let round=0;round<5;round++){
 const ui=new Proxy({format:3,headless:true},{get:(t,k)=>t[k]??noop}),g=new Game(document.createElement('canvas'),sprites,ui);
 g.selection=['rayquaza','mewtwo','arceus'];g.opponentSelection=['parasect','raticate','butterfree'];g.story={};g.start();g.showcase=null;g.state='fighting';g.difficulty='easy';
 for(const m of [g.player,g.opponent]){m.hidden=false;m.appear=0;}g.player.x=180;g.player.y=460;g.opponent.x=180;g.opponent.y=220;
 const ai=new OpponentAI(),view=new Proxy(g,{get:(target,k)=>k==='opponent'?g.player:k==='player'?g.opponent:k==='opponentTeam'?g.playerTeam:k==='difficulty'?'hard':k==='switchFoe'?(i=>g.switchTo(i)):typeof target[k]==='function'?target[k].bind(g):target[k]});
 g.input.vector=()=>({...g.player.input});
 for(let i=0;i<60*600&&!['over','finale'].includes(g.state);i++){ai.update(1/60,view);g.update(1/60);}
 const s=resultSummary(g,'player',{id:`simulation-${now}-${round}`,result:g.winner==='player'?'win':'loss',reason:'ko',team:g.selection});
 const accepted=progressMatch(w,s,now);matches.push({duration:s.duration,result:s.result,accepted,damage:Object.values(s.species).reduce((n,r)=>n+r.damage,0)});
}
fs.writeFileSync('scripts/.guild-earned.json',JSON.stringify({wallet:w,matches},null,2));
console.log(JSON.stringify({balance:w.balance,missions:w.day.missions.map(m=>[m.id,m.progress,m.target]),matches}));
