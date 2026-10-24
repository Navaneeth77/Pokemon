import '../server/shim.js';
import {loadSpriteSets} from '../server/sprites.js';
import {Game} from '../src/game.js';
import {BossEncounter} from '../src/bosses.js';
import {performance} from 'node:perf_hooks';
const sprites=loadSpriteSets(),noop=()=>{};
function run(format,raid=false){
 const ui=new Proxy({format},{get:(t,k)=>t[k]??noop}),g=new Game(document.createElement('canvas'),sprites,ui);
 g.selection=['charizard','pikachu','rayquaza','blastoise','mewtwo','gengar'].slice(0,format);
 g.opponentSelection=raid?['rayquaza']:['mewtwo','lugia','sceptile','lucario','gengar','gyarados'].slice(0,format);
 const start=()=>{g.start();g.particles.max=-1;if(raid)new BossEncounter([g],'rayquaza');};start();
 const samples=[],mem=process.memoryUsage().heapUsed;
 for(let i=0;i<18000;i++){
  if(['over','finale'].includes(g.state))start();
  const t=performance.now();if(i%30===0)g.playerPress((i/30)%4);if(i%30===10)g.playerRelease(Math.floor(i/30)%4);g.update(1/60);samples.push(performance.now()-t);
 }
 samples.sort((a,b)=>a-b);return{format,raid,steps:samples.length,meanMs:samples.reduce((a,b)=>a+b)/samples.length,p95Ms:samples[17100],p99Ms:samples[17820],maxMs:samples.at(-1),heapDeltaMB:(process.memoryUsage().heapUsed-mem)/1e6,effects:g.effects.length,timers:g.timers.length};
}
console.log(JSON.stringify([run(3),run(6),run(3,true)],null,2));
