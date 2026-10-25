import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ROSTER,ALL_BASE_SPECIES,SPECIES,DEFAULT_TEAM,isPlayable,normalizeTeam} from '../src/data/species.js';
import {isFinalSpecies} from '../src/data/roster-rules.js';
import {freshWallet,rollover,progressMatch,walletAction,walletView,walletLoadout,CATALOG,nextDaily,ECONOMY} from '../src/economy.js';
import {EconomyStore} from '../server/economy-store.js';
import {UI} from '../src/ui.js';
import {readMastery} from '../src/mastery.js';
const now=Date.parse('2026-10-25T12:00:00Z'),pid='economy-test-player',secret='a'.repeat(64);
const summary=(id='m1',extra={})=>({id,result:'win',reason:'ko',duration:70,team:['charizard','raichu','blastoise'],species:{charizard:{damage:800,faints:0,reactions:3,ultimateHits:3}},...extra});
const wallet=()=>rollover(freshWallet(pid,now),now);
function finishBoard(w){for(let i=0;i<3;i++)progressMatch(w,summary('board'+i,{team:[...ROSTER],species:Object.fromEntries(ROSTER.map(id=>[id,{damage:800,reactions:3,ultimateHits:3,faints:0}]))}),now);}
test('canonical eligibility excludes nonfinal stages, preserves regional exceptions and eligible Mega forms',()=>{
 assert.equal(ALL_BASE_SPECIES.length,220);assert.equal(ROSTER.length,137);assert.ok(ROSTER.every(isFinalSpecies));
 for(const id of ['pikachu','eevee','scyther','primeape','chansey','onix','porygon','magneton'])assert.equal(isPlayable(id),false,id);
 for(const id of ['charizard','raichu','lapras','farfetchd','mrMime','heracross','mewtwo','rayquaza','mew','porygonZ'])if(SPECIES[id])assert.ok(isPlayable(id),id);
 for(const id of ROSTER)for(const form of SPECIES[id].mega??[])assert.equal(SPECIES[form].megaOf,id);
 assert.ok(DEFAULT_TEAM.every(isPlayable));
});
test('legacy teams migrate idempotently, preserve backups and do not move mastery',()=>{
 const map=new Map([['msb.teams',JSON.stringify([{name:'Old',team:['pikachu','charizard','onix'],mega:{charizard:'charizardMegaX'}}])],['msb.mastery',JSON.stringify({version:2,species:{pikachu:{xp:777,discovered:[]}},profile:{},matches:[]})]]);
 const old=globalThis.localStorage;globalThis.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 try{const ui={storeTeams:UI.prototype.storeTeams};const a=UI.prototype.loadTeams.call(ui),backup=map.get('msb.teams.pre-final-v1');assert.ok(a[0].team.every(isPlayable));assert.equal(a[0].team[0],'raichu');assert.ok(a[0].team.includes('charizard'));assert.equal(a[0].mega.charizard,'charizardMegaX');
 assert.deepEqual(UI.prototype.loadTeams.call(ui),a);assert.equal(map.get('msb.teams.pre-final-v1'),backup);assert.equal(readMastery().species.pikachu.xp,777);assert.equal(readMastery().species.raichu,undefined);
 }finally{globalThis.localStorage=old;}
 assert.equal(new Set(normalizeTeam(['bad','bad'],6)).size,6);
});
test('daily boards are deterministic and reference eligible available Pokémon',()=>{
 const a=wallet(),b=wallet();assert.deepEqual(a.day,b.day);assert.equal(a.day.missions.length,3);
 for(let i=0;i<50;i++){const w=rollover(freshWallet('player'+i,now),now);for(const m of w.day.missions){assert.ok(isPlayable(m.art));if(m.species)assert.ok(isPlayable(m.species));}}
});
test('only valid completed matches progress; replay, forfeit and short farming do not',()=>{
 const w=wallet();for(const extra of [{reason:'forfeit'},{reason:'cancelled'},{reason:'disconnect'},{duration:3},{species:{charizard:{damage:20}}}])assert.equal(progressMatch(w,summary('bad',extra),now),false);
 assert.equal(progressMatch(w,summary(),now),true);const before=JSON.stringify(w);assert.equal(progressMatch(w,summary(),now),false);assert.equal(JSON.stringify(w),before);assert.equal(w.balance,90);
 const local=wallet();for(let i=0;i<12;i++)progressMatch(local,summary('local'+i),now,{local:true});assert.equal(local.completed,8);
});
test('mission claims and daily bonus credit exactly once',()=>{
 const w=wallet();assert.throws(()=>walletAction(w,'claim',w.day.missions[0].id,now));finishBoard(w);
 for(const m of w.day.missions){const before=w.balance;walletAction(w,'claim',m.id,now);assert.equal(w.balance,before+m.reward);walletAction(w,'claim',m.id,now);assert.equal(w.balance,before+m.reward);}
 const balance=w.balance;walletAction(w,'bonus',null,now);walletAction(w,'bonus',null,now);assert.equal(w.balance,balance+100);
});
test('UTC rollover preserves inventory, lifetime receipts and transactions; backwards clocks cannot reroll',()=>{
 const w=wallet();finishBoard(w);for(const m of w.day.missions)walletAction(w,'claim',m.id,now);walletAction(w,'bonus',null,now);walletAction(w,'buy',CATALOG[0].id,now);
 const old=w.day.key,coins=w.balance,count=w.completed;rollover(w,nextDaily(now)+1);assert.notEqual(w.day.key,old);assert.equal(w.balance,coins);assert.equal(w.completed,count);assert.ok(w.owned.includes(CATALOG[0].id));assert.ok(w.receipts['match:board0']);
 const key=w.day.key;rollover(w,now);assert.equal(w.day.key,key);
});
test('weekly and milestone rewards do not repeat; weekly progress resets independently',()=>{
 const w=wallet();for(let i=0;i<5;i++)progressMatch(w,summary('win'+i),now);
 const before=w.balance;walletAction(w,'weekly',null,now);walletAction(w,'weekly',null,now);assert.equal(w.balance,before+250);
 const lifetime=w.wins;rollover(w,now+8*86400000);assert.equal(w.week.wins,0);assert.equal(w.wins,lifetime);
});
test('purchases validate price and ownership, never go negative, and equipment requires ownership',()=>{
 const w=wallet();assert.throws(()=>walletAction(w,'buy','frame-amethyst',now),/Insufficient/);assert.equal(w.balance,0);assert.throws(()=>walletAction(w,'equip','aura-jade',now));
 finishBoard(w);for(const m of w.day.missions)walletAction(w,'claim',m.id,now);walletAction(w,'bonus',null,now);
 const before=w.balance;walletAction(w,'buy','frame-amethyst',now);walletAction(w,'buy','frame-amethyst',now);assert.equal(w.balance,before-220);assert.equal(w.owned.filter(id=>id==='frame-amethyst').length,1);
 walletAction(w,'equip','frame-amethyst',now);assert.equal(walletLoadout(w).frame.id,'frame-amethyst');walletAction(w,'unequip','frame-amethyst',now);assert.equal(walletLoadout(w).frame,undefined);
 assert.throws(()=>walletAction(w,'grant',10000,now));assert.equal(walletView(w,now).receipts,undefined);
});
test('server ledger persists confirmed transactions and rejects other credentials and arbitrary award operations',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chaos-wallet-'));try{
  const file=path.join(dir,'economy.json'),store=new EconomyStore(file);store.request(pid,secret,'view',null,now);
  assert.equal(store.award({pid,economyAuthenticated:true},summary(),now),true);assert.equal(store.award({pid,economyAuthenticated:true},summary(),now),false);
  assert.equal(store.award({pid,economyAuthenticated:false},summary('forged'),now),false);
  const saved=fs.readFileSync(file,'utf8');assert.ok(!saved.includes(secret));const reload=new EconomyStore(file);assert.equal(reload.request(pid,secret,'view',null,now).balance,90);
  assert.throws(()=>reload.request(pid,'b'.repeat(64),'view',null,now));assert.throws(()=>reload.request(pid,secret,'award',90000,now));assert.equal(reload.request(pid,secret,'view',null,now).balance,90);
  fs.writeFileSync(file,'broken');const broken=new EconomyStore(file);assert.throws(()=>broken.request(pid,secret,'view',null,now));assert.equal(fs.readFileSync(file,'utf8'),'broken');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

import {Game} from '../src/game.js';
import {loadSpriteSets} from '../server/sprites.js';
import {MOVES} from '../src/moves.js';
test('shop loadouts render in real battle hooks without changing combat stats',()=>{
 const noop=()=>{},sprites=loadSpriteSets(),ui=new Proxy({format:3},{get:(t,k)=>t[k]??noop});
 const g=new Game(document.createElement('canvas'),sprites,ui);
 const before=g.playerTeam.members.map(m=>[m.species.id,m.maxHp,m.species.atk,m.species.def,m.species.speed]);
 const w=wallet();w.owned=CATALOG.map(i=>i.id);for(const item of CATALOG)w.equipped[item.kind]=item.id;
 g.flow={economy:{loadout:()=>walletLoadout(w)}};g.start();g.showcase=null;g.state='fighting';g.player.hidden=false;g.opponent.hidden=false;
 assert.deepEqual(g.playerTeam.members.map(m=>[m.species.id,m.maxHp,m.species.atk,m.species.def,m.species.speed]),before);
 assert.equal(g.cosmetics.frame.id,'frame-ember');g.release(g.player);assert.ok(g.effects.some(e=>e.constructor.name==='Ring'));
 g.startUltCutscene(g.player,MOVES[g.player.species.ultimate]);assert.ok(g.effects.some(e=>e.constructor.name==='CosmeticStarburst'));g.render();
});

import {EconomyClient} from '../src/economy-client.js';
test('timeouts retain cached online funds and corrupt local saves are never overwritten',async()=>{
 const map=new Map(),storage=globalThis.localStorage,fetchBefore=globalThis.fetch;
 globalThis.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 try{
  const flow={mm:{pid,url:'ws://unavailable'},economyUI:{notify(){}}},c=new EconomyClient(flow),server=wallet();server.balance=321;c.server=server;
  map.set('msb.economy.server-cache',JSON.stringify(server));const original=map.get('msb.economy.server-cache');
  globalThis.fetch=async()=>{throw Error('offline');};await c.sync();assert.equal(c.server.balance,321);assert.equal(c.connected,false);assert.equal(map.get('msb.economy.server-cache'),original);
  map.set('msb.economy.local','{broken-save');const broken=new EconomyClient(flow);await assert.rejects(()=>broken.action('equip','frame-amethyst'));assert.equal(map.get('msb.economy.local'),'{broken-save');
 }finally{globalThis.localStorage=storage;globalThis.fetch=fetchBefore;}
});
