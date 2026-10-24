import '@fontsource/pixelify-sans/700.css';
import '@fontsource/luckiest-guy/400.css';
import {preloadImpactSprite} from '../src/effects.js';
import {loadSpecies} from '../src/assets.js';
import {spritesFor} from '../src/data/species.js';
import {Game,prepareSprites} from '../src/game.js';
import {BossEncounter} from '../src/bosses.js';
import {MOVES} from '../src/moves.js';
import {applyHit} from '../src/combat.js';
import {setQuality,qualityName} from '../src/quality.js';
const noop=()=>{},status=document.querySelector('#status'),output=document.querySelector('#results'),button=document.querySelector('#run');
const ids=['charizard','pikachu','rayquaza','blastoise','mewtwo','gengar','lugia','sceptile','lucario','gyarados','articuno'];
await document.fonts.ready;await preloadImpactSprite();
const started=performance.now(),needed=spritesFor(ids),sprites=await loadSpecies(needed);prepareSprites(sprites,needed);
const assetMs=performance.now()-started,ui=new Proxy({format:3},{get:(t,k)=>t[k]??noop}),game=new Game(document.querySelector('canvas'),sprites,ui);
let current=null,last=performance.now();
const results=[],originalQuality=qualityName();
const soakSeconds=Math.min(300,Math.max(0,Number(new URLSearchParams(location.search).get('soak'))||0));
const scenarios=[['3v3',3,'balanced'],['6v6',6,'balanced'],['ultimates',3,'high'],['reactions',3,'high'],['raid-high',3,'high'],['raid-performance',3,'performance']];
if(soakSeconds){scenarios.splice(0);scenarios.push(['soak',3,'high']);document.querySelector('aside p').textContent=`Mixed raid/ultimate/reaction soak: ${soakSeconds} seconds. Leave this tab active.`;}
function setup([name,format,quality]){
 setQuality(quality);ui.format=format;game.selection=ids.slice(0,format);game.opponentSelection=(name.startsWith('raid')||name==='soak')?['rayquaza']:['mewtwo','lugia','sceptile','lucario','gengar','gyarados'].slice(0,format);
 game.start();game.showcase=null;game.state='fighting';game.practice=true;game.timers=[];
 for(const m of [game.player,game.opponent]){m.hidden=false;m.appear=0;}game.gold.hidden=true;
 if(name.startsWith('raid')||name==='soak'){const r=new BossEncounter([game],'rayquaza');r.intro=0;game.opponent.hp=game.opponent.maxHp*.2;}
 game.resize();return{name,quality,started:performance.now(),frames:[],updates:[],renders:[],inputs:[],step:0,maxEffects:0,maxParticles:0,heapStartMB:performance.memory?.usedJSHeapSize/1048576,heapSamples:[]};
}
const q=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))]??0;
function frame(now){
 requestAnimationFrame(frame);const elapsed=now-last;last=now;
 if(!current||document.hidden)return;
 if(game.state!=='fighting'){game.showcase=null;game.finale=null;game.state='fighting';}
 for(const m of [game.player,game.opponent]){m.hp=m.maxHp;m.fainted=false;m.hidden=false;}
 const n=current.step++;
 if(n%60===0 && performance.memory)current.heapSamples.push({seconds:+((now-current.started)/1000).toFixed(1),mb:+(performance.memory.usedJSHeapSize/1048576).toFixed(2)});
 let inputAt=0;
 if(n%45===0 && !['ultimates','soak'].includes(current.name)){inputAt=performance.now();game.playerPress(n/45%4|0);}
 if(n%45===10)game.playerRelease(n/45%4|0);
 if(['ultimates','soak'].includes(current.name)&&n%240===0){game.player.cancelAction();game.player.charging=null;game.startUltCutscene(game.player,MOVES[game.player.species.ultimate]);}
 if(['reactions','soak'].includes(current.name)&&n%45===0){for(const type of ['water','electric','fire','ice'])applyHit(game,game.player,game.opponent,{id:`bench-${type}`,name:type,type,power:2,cat:'special',cooldown:1},{critChance:0});}
 if(current.name.startsWith('raid')||current.name==='soak'){game.raid.boss.hp=game.raid.boss.maxHp*.2;if(n%240===120){game.raid.startUlt();game.raid.ult.t=.5;}}
 const a=performance.now();game.update(Math.min(.05,Math.max(0,elapsed/1000)));const b=performance.now();game.render();const c=performance.now();
 if(n>20){current.frames.push(elapsed);current.updates.push(b-a);current.renders.push(c-b);if(inputAt)current.inputs.push(c-inputAt);}
 current.maxEffects=Math.max(current.maxEffects,game.effects.length);current.maxParticles=Math.max(current.maxParticles,game.particles.list.length);
 status.textContent=` ${current.name} · ${((now-current.started)/1000).toFixed(1)}s`;
 if(now-current.started>=(current.name==='soak'?soakSeconds*1000:6500)){
  results.push({scenario:current.name,quality:current.quality,frames:current.frames.length,frameP95:q(current.frames,.95),frameP99:q(current.frames,.99),frameMax:q(current.frames,1),updateP95:q(current.updates,.95),renderP95:q(current.renders,.95),scriptedInputToRenderP95:current.inputs.length?q(current.inputs,.95):null,maxEffects:current.maxEffects,maxParticles:current.maxParticles,heapStartMB:current.heapStartMB,heapSamples:current.heapSamples,heapMB:performance.memory?.usedJSHeapSize/1048576});
  current=scenarios.length?setup(scenarios.shift()):null;
  output.textContent=JSON.stringify({assetLoadMs:assetMs,results},null,2);
  if(!current){status.textContent=' COMPLETE';button.disabled=false;button.textContent='Complete · reload to run again';setQuality(originalQuality);}
 }
}
button.disabled=false;button.textContent='RUN ALL SCENARIOS';button.onclick=()=>{if(current||!scenarios.length)return;results.length=0;button.disabled=true;current=setup(scenarios.shift());last=performance.now();};
requestAnimationFrame(frame);
