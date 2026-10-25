import '@fontsource/pixelify-sans/700.css';
import '@fontsource/luckiest-guy/400.css';
import {preloadImpactSprite} from '../src/effects.js';
import {loadSpecies} from '../src/assets.js';
import {spritesFor} from '../src/data/species.js';
import {bossSpritesFor} from '../src/data/skins.js';
import {Game,prepareSprites} from '../src/game.js';
import {BOSSES,BossEncounter,attackLabel} from '../src/bosses.js';
import {preloadRaidArt} from '../src/raid-art.js';
import {MOVES} from '../src/moves.js';
import {applyHit} from '../src/combat.js';
import {setQuality,qualityName} from '../src/quality.js';
const noop=()=>{},status=document.querySelector('#status'),output=document.querySelector('#results'),button=document.querySelector('#run');
const ids=['charizard','pikachu','rayquaza','blastoise','mewtwo','gengar','lugia','sceptile','lucario','gyarados','articuno'];
await document.fonts.ready;await Promise.all([preloadImpactSprite(), ...['rayquaza','mewtwo','lugia'].map(preloadRaidArt)]);
const started=performance.now(),needed=[...spritesFor(ids), ...['lugia','mewtwo','rayquaza'].flatMap(bossSpritesFor)],sprites=await loadSpecies(needed);prepareSprites(sprites,needed);
const assetMs=performance.now()-started,ui=new Proxy({format:3},{get:(t,k)=>t[k]??noop}),game=new Game(document.querySelector('canvas'),sprites,ui);
let current=null,last=performance.now();
const results=[],originalQuality=qualityName();
const preview = new URLSearchParams(location.search).get('preview');
const playable = new URLSearchParams(location.search).has('playable');
let previewPaused = false;
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
 if(preview && (game.raid || playable)) {
  if(!previewPaused){game.player.hp=game.player.maxHp;game.update(Math.min(.05,Math.max(0,elapsed/1000)));}
  game.render();status.textContent=` ${preview} · ${game.raid?.ult ? 'CHANNELING' : game.raid?.ultRelease ? 'ULTIMATE' : 'ATTACK'} · ${(game.raid?.time??game.time).toFixed(1)}s`;return;
 }
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
 if(current.name.startsWith('raid')||current.name==='soak'){game.raid.boss.hp=game.raid.boss.maxHp*.2;if(n%240===120){game.raid.startUlt();if(game.raid.ult)game.raid.ult.t=.5;}}
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
if(['rayquaza','mewtwo','lugia'].includes(preview)){
 current=setup(['3v3',3,'high']);previewPaused=true;
 let raid,round=0;
 function restart(){
  game.selection=playable?[preview,'pikachu','charizard']:ids.slice(0,3);
  game.opponentSelection=playable?['mewtwo','gengar','blastoise']:[preview];game.start();game.showcase=null;game.state='fighting';game.practice=true;game.timers=[];
  game.arena.setTheme(BOSSES[preview].arena);
  for(const m of [game.player,game.opponent]){m.hidden=false;m.appear=0;}game.gold.hidden=true;
  if(playable){raid=null;game.ai.update=noop;game.player.x=180;game.player.y=300;game.opponent.x=180;game.opponent.y=470;}
  else {raid=new BossEncounter([game],preview);raid.intro=0;raid.boss.x=180;raid.boss.y=raid.home.y;raid.next=999;}
  document.querySelector('h1').textContent=`Legendary VFX · ${playable?'playable':'raid'} ${++round}`;
 }
 function cast(stage,sequence){raid.ult=null;raid.ultRelease=null;raid.transition=0;raid.vulnerable=0;raid.hazards=[];raid.stage=stage;raid.sequence=sequence;raid.launch([game]);raid.next=999;}
 function castKind(kind){const stage=BOSSES[preview].attacks.findIndex(list=>list.includes(kind));if(stage>=0)cast(stage+1,BOSSES[preview].attacks[stage].indexOf(kind));}
 const step=frames=>{for(let i=0;i<frames;i++)game.update(1/60);};
 restart();
 document.querySelector('aside p').textContent='Actual raid renderer. Starts paused. Restart checks the same game instance twice.';
 const controls=document.createElement('button');controls.textContent='HIDE CONTROLS';
 controls.style.cssText='position:fixed;right:4px;bottom:4px;z-index:6';
 controls.onclick=()=>{const panel=document.querySelector('aside');panel.hidden=!panel.hidden;controls.textContent=panel.hidden?'SHOW CONTROLS':'HIDE CONTROLS';};
 document.body.append(controls);
 button.textContent='CAST ULTIMATE';button.onclick=()=>{if(playable){game.startUltCutscene(game.player,MOVES[game.player.species.ultimate]);return;}if(raid.ultRelease)return;raid.startUlt();if(raid.ult)raid.ult.t=.8;};
 const opening=preview==='rayquaza'?'CAST METEORS':preview==='lugia'?'CAST TIDAL':'CAST ORBS';
 const followup=preview==='rayquaza'?'CAST DASH':preview==='lugia'?'CAST STORM':'CAST SLAM';
 const attacks=playable?game.player.species.moves.map(id=>[`PLAY ${MOVES[id].name.toUpperCase()}`,()=>{game.opponent.y=game.player.y+(MOVES[id].ai==='melee'?70:170);game.player.cancelAction();game.player.busy=0;game.player.cooldowns[id]=0;game.useMove(game.player,id);}])
 :[['CAST BEAM',()=>castKind(preview==='rayquaza'?'dragonBeam':preview==='lugia'?'aeroblast':'cross')],[opening,()=>cast(1,0)],[followup,()=>cast(1,1)],['CAST PILLARS',()=>castKind('lanes')],['CAST NOVA',()=>castKind('ring')],['CAST CATACLYSM',()=>castKind('cataclysm')],...(preview==='rayquaza'?[['CAST SLAM',()=>castKind('slam')]]:preview==='lugia'?[['CAST ROWS',()=>castKind('rows')],['CAST WATER PULSE',()=>castKind('waterPulse')]]:[])];
 for(const [label,run] of [...attacks,['RESTART RAID',restart],['HALF HP',()=>{if(raid)raid.boss.hp=raid.boss.maxHp*.5;else game.megaEvolve(game.player);}],['FINAL HIT',()=>{if(!raid)return;raid.ult=null;raid.ultRelease=null;raid.hazards=[];raid.stage=4;raid.transition=0;raid.next=999;raid.boss.hp=1;raid.boss.invuln=false;game.practice=false;game.startUltCutscene(game.player,MOVES[game.player.species.ultimate]);}],['PAUSE / RESUME',()=>{previewPaused=!previewPaused;}],['STEP 0.5s',()=>step(30)],['STEP 0.1s',()=>step(6)]]){
  const b=document.createElement('button');b.textContent=label;b.onclick=run;button.after(b);
 }
 if(new URLSearchParams(location.search).has('audit')){
  current=null;document.querySelector('aside').hidden=true;controls.hidden=true;
  const gallery=document.createElement('section');gallery.style.cssText='position:relative;z-index:10;background:#101521;padding:12px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;max-width:960px;margin:auto';
  document.body.append(gallery);
  const patterns=[...new Set(BOSSES[preview].attacks.flat())];
  for(const kind of patterns){
   restart();game.ai.update=noop;game.player.dodgeInv=99;
   if(kind==='ultimate'){raid.startUlt();raid.ult.t=.2;}else castKind(kind);
   const title=document.createElement('h2');title.textContent=`${BOSSES[preview].name} · ${attackLabel(preview,kind)}`;title.style.cssText='grid-column:1/-1;margin:10px 0 0';gallery.append(title);
   const at=Math.max(0,...raid.hazards.map(h=>h.at));
   const times=kind==='ultimate'?[.1,.2+(preview==='lugia'?.9:BOSSES[preview].ultImpact[0]),.2+BOSSES[preview].ultDuration*.8]:[at*.5,at+.12,at+.48];
   for(const [i,time] of times.entries()){
    for(let n=0;raid.time<time&&n<1200;n++){game.player.hp=game.player.maxHp;game.update(1/60);}
    game.shakeT=0;game.render();
    const cell=document.createElement('figure');cell.style.margin='0';
    const label=document.createElement('figcaption');label.textContent=`${['Wind-up','Release','Follow-through'][i]} · ${raid.time.toFixed(2)}s`;
    const thumb=document.createElement('canvas');thumb.width=360;thumb.height=640;thumb.style.cssText='width:100%;height:auto;display:block';
    thumb.getContext('2d').drawImage(game.canvas,game.view.ox*game.k,game.view.oy*game.k,360*game.k,640*game.k,0,0,360,640);
    cell.append(label,thumb);gallery.append(cell);
   }
  }
  gallery.dataset.complete='true';
 }
}
requestAnimationFrame(frame);
