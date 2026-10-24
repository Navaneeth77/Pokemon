import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {saveEntry,saveSummary,readMastery,cosmeticLoadout,equipCosmetic,unlockedCosmetics} from '../src/mastery.js';
import {GroundFX} from '../src/groundfx.js';
import {appendBattleEvents} from '../src/event-buffer.js';
import {resolveReaction} from '../src/elemental.js';
import {FinalHitReplay} from '../src/final-hit-replay.js';
import {setQuality} from '../src/quality.js';
test('final-hit visual capture is bounded, chronological and released on exit',()=>{
 const replay=new FinalHitReplay(),canvas=document.createElement('canvas'),game={canvas,view:{ox:0,oy:0},k:1};
 setQuality('high');
 for(let i=0;i<1000;i++)replay.capture(game,i*100);
 assert.equal(replay.frames.length,12);assert.equal(replay.clip().length,12);
 assert.equal(replay.clip().at(-1),replay.frames[(replay.cursor+11)%12]);
 assert.ok(replay.frames.reduce((n,f)=>n+f.width*f.height*4,0)<3*1024*1024);
 setQuality('performance');for(let i=1000;i<1020;i++)replay.capture(game,i*200);
 assert.equal(replay.frames.length,6);const frames=replay.clip();replay.clear();
 assert.ok(frames.every(f=>f.width===0&&f.height===0));assert.equal(replay.clip().length,0);
 setQuality('balanced');
});
function memory(){let s=null;return{getItem:()=>s,setItem:(_k,v)=>s=v};}
test('entered and completed progression dedupe independently; cosmetics unlock without stat effects',()=>{
 const storage=memory();assert.equal(saveEntry('one','pikachu',storage),true);assert.equal(saveEntry('one','pikachu',storage),false);
 assert.equal(readMastery(storage).species.pikachu.completed,0);
 assert.equal(equipCosmetic('frame','champion',storage),false);
 const summary={id:'one',result:'win',mode:'raid',raid:'lugia',difficulty:'hard',arena:'seafoam',duration:90,species:{pikachu:{damage:1200,discovered:[]}},moves:{}};
 saveSummary(summary,storage);assert.equal(saveSummary(summary,storage),false);
 let d=readMastery(storage);assert.equal(d.species.pikachu.entries,1);assert.equal(d.species.pikachu.completed,1);
 assert.equal(d.species.pikachu.bestDamage,1200);assert.equal(d.species.pikachu.bestWin,90);assert.equal(d.species.pikachu.bestRaid,'hard');
 for(let i=0;i<3;i++)saveSummary({...summary,id:`more-${i}`},storage);
 d=readMastery(storage);assert.ok(unlockedCosmetics(d).some(c=>c.id==='bronze'));
 assert.equal(equipCosmetic('frame','bronze',storage),true);assert.equal(cosmeticLoadout(storage).frame.color,'#dca26a');
});
test('melt removes nearby wet/frost ground and clears freeze without clearing distant marks',()=>{
 const marks=new GroundFX();marks.frost(100,100,10);marks.wet(110,100,10);marks.frost(300,300,10);marks.scorch(100,100,10);
 const target={x:100,y:100,bodyZ:10,status:{burn:3},frozen:1,alive:true};
 resolveReaction({marks,reactFx:()=>{},hud:{callout:()=>{}},netSend:()=>{}},{side:'player'},target,{id:'melt',cleanse:true},10,()=>{});
 assert.equal(target.frozen,0);assert.equal(target.status.burn,0);
 assert.equal(marks.list.length,2);assert.ok(marks.list.some(m=>m.kind==='frost'&&m.x===300));
});
test('background event backlog stays bounded and retains KO/Mega state events',()=>{
 let events=[{t:'faint',side:'opponent',i:2,last:true},{t:'mega',side:'player',c:'rayquazaMega'}];
 for(let i=0;i<10000;i++)events=appendBattleEvents(events,[{t:'move',id:String(i)}]);
 assert.ok(events.length<=256);assert.ok(events.some(e=>e.last));assert.ok(events.some(e=>e.t==='mega'));
});

import {DraftRooms} from '../server/drafts.js';
import {SPECIES} from '../src/data/species.js';
test('ranked and unranked drafts cannot pair; full roster stays server-controlled and legal',()=>{
 const sent=[],started=[];const rooms=new DraftRooms((p,m)=>sent.push({p,m}),(...entries)=>started.push(entries),()=>true);
 const a={state:'idle',name:'A'},b={state:'idle',name:'B'},c={state:'idle',name:'C'};
 rooms.handle(a,{t:'draft-queue',mode:'snake',format:3,ranked:true,roster:'all'});
 rooms.handle(b,{t:'draft-queue',mode:'snake',format:3,ranked:false,roster:'all'});
 assert.equal(rooms.rooms.size,0);assert.equal(rooms.waiting.length,2);
 rooms.handle(c,{t:'draft-queue',mode:'snake',format:3,ranked:true,roster:'all'});
 assert.equal(rooms.rooms.size,1);assert.equal(rooms.waiting.length,1);
 const room=[...rooms.rooms.values()][0];assert.equal(room.ranked,true);assert.ok(room.draft.pool.every(id=>SPECIES[id]&&!SPECIES[id].megaOf));
 for(let i=0;i<6;i++)room.draft.choose(room.draft.turn,room.draft.pool[0]);room.draft.confirm(0);room.draft.confirm(1);rooms.complete(room);
 assert.equal(started.length,1);assert.ok(started[0].every(e=>e.ranked===true&&e.team.length===3));
});
