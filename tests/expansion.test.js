import '../server/shim.js';
import { Falling } from '../src/effects.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Draft } from '../src/draft-rules.js';
import { hitReaction, primeElement } from '../src/reactions.js';
import { SPECIES } from '../src/data/species.js';
import { MEGA_STATS } from '../src/data/mega-stats.js';
import { loadSpriteSets } from '../server/sprites.js';
import { Game } from '../src/game.js';
import { applyHit } from '../src/combat.js';
const sprites = loadSpriteSets(), noop = () => {};
function battle() {
 const ui = new Proxy({format:3},{get:(t,k)=>t[k]??noop});
 const g = new Game(document.createElement('canvas'),sprites,ui);g.start();g.showcase=null;g.state='fighting';
 for(const m of [g.player,g.opponent]) {m.hidden=false;m.appear=0;m.hp=10000;}
 return g;
}
test('snake turn order, unique teams, invalid submissions and final confirmation',()=>{
 const d = new Draft('snake',3,Array.from({length:12},(_,i)=>`p${i}`),0);
 assert.equal(d.choose(1,'p0',1),false);
 for(const s of [0,1,1,0,0,1]) assert.equal(d.choose(s,d.pool[0],1),true);
 assert.deepEqual(d.teams.map(t=>t.length),[3,3]);assert.equal(d.phase,'confirm');
 assert.equal(d.choose(0,'p11',1),false);d.confirm(0);assert.equal(d.phase,'confirm');d.confirm(1);assert.equal(d.phase,'done');
});
test('blind choices remain private; each player receives three own and three transferred',()=>{
 const d = new Draft('trade',6,Array.from({length:12},(_,i)=>`p${i}`),0);
 for(let r=0;r<3;r++) { const t=r*4000+1; d.choose(0,d.pair(0)[0],t); assert.equal(JSON.stringify(d.view(1)).includes('choices'),false); assert.equal(d.view(1).teams[0].length,r*2); d.choose(1,d.pair(1)[1],t); assert.equal(d.phase,'reveal'); d.tick(t+3500); }
 for(let s=0;s<2;s++){assert.equal(new Set(d.teams[s]).size,6);assert.equal(d.origins[s].filter(x=>x==='picked').length,3)}
 assert.equal(d.phase,'confirm');
});
test('draft timeout makes a deterministic legal pick',()=>{const d=new Draft('snake',3,['a','b','c','d','e','f'],0);d.tick(25000);assert.equal(d.teams[0][0],'a');});
test('all 17 Mega stats verified; special and physical changes differ and HP is preserved',()=>{
 assert.equal(Object.keys(MEGA_STATS).length,17);
 for(const [id,v] of Object.entries(MEGA_STATS)) {const m=SPECIES[id],b=SPECIES[m.megaOf];assert.equal(m.hp,b.hp);assert.equal(m.atk,b.atk*v.form.atk/v.base.atk);assert.equal(m.spa,b.atk*v.form.spa/v.base.spa);}
 const g=battle(),p=g.player;p.hp=p.maxHp-100;const form=SPECIES[p.species.mega[0]];p.megaEvolve(form,sprites[form.sprite]);assert.equal(p.hp,p.maxHp-100);p.enter(100,400,0);assert.equal(p.species,form);p.reset(100,400,0);assert.equal(p.isMega,false);
});
test('reaction windows expire and both orders work',()=>{const m={};primeElement(m,'water',0);assert.equal(hitReaction(m,'ice',3,{}).id,'freeze');assert.equal(hitReaction(m,'ice',4,{}),null);primeElement(m,'ice',5);assert.equal(hitReaction(m,'water',6,{}).id,'freeze');});
test('hits respect dodge and shield, consume aura once and respect freeze grace',()=>{
 const g=battle(),p=g.player,o=g.opponent;const water={id:'testwater',name:'Water',type:'water',cat:'special',power:10,cooldown:1,status:['slow',0]};const ice={...water,id:'testice',type:'ice'};
 o.dodgeInv=1;assert.equal(applyHit(g,p,o,water),false);assert.equal(o.elementAura,null);o.dodgeInv=0;
 o.shield=100;applyHit(g,p,o,water);assert.equal(o.elementAura,null);o.shield=0;
 applyHit(g,p,o,water);assert.equal(o.elementAura.type,'water');const stack={};applyHit(g,p,o,ice,{stack});assert.equal(o.elementAura,null);assert.ok(o.frozen>0);const duration=o.frozen;applyHit(g,p,o,ice,{stack});assert.equal(o.frozen,duration);
});

import {saveSummary,readMastery,level} from '../src/mastery.js';
import {BossEncounter, hazardHits} from '../src/bosses.js';
test('mastery storage tolerates corruption and deduplicates result IDs',()=>{
 let value='not json';const storage={getItem:()=>value,setItem:(_k,v)=>value=v};assert.equal(readMastery(storage).version,2);
 const s={id:'match-1',result:'win',arena:'mtSilver',mode:'raid',species:{charizard:{damage:1000,hits:5,kos:1,reactions:1,discovered:['melt']}},moves:{flamethrower:2}};
 assert.equal(saveSummary(s,storage),true);assert.equal(saveSummary(s,storage),false);const data=readMastery(storage);assert.equal(data.species.charizard.battles,1);assert.equal(data.species.charizard.raids,1);assert.equal(level(100),2);
});
test('boss: entrance, telegraphed dodgeable hazards, four HP stages, bounded hazards', () => {
 const g = battle(), b = new BossEncounter([g], 'rayquaza', { difficulty: 'normal' });
 g.player.x = 180; g.player.y = 500;
 assert.ok(b.boss.maxHp > 10000); assert.equal(b.boss.drawScale, 1.9); assert.equal(g.opponent, b.boss);
 for (let t = 0; t < 3.4; t += 1 / 60) b.tick(1 / 60);
 assert.equal(b.hazards.length, 0, 'no attacks during the entrance'); assert.equal(b.boss.invuln, true);
 for (let i = 0; i < 600 && !b.hazards.length; i++) b.tick(1 / 60);
 const h = b.hazards[0]; assert.ok(h, 'attacks after the entrance'); assert.ok(h.at - b.time >= 0.85, 'telegraphed');
 const hp = g.player.hp; g.player.dodgeInv = 9;
 for (let i = 0; i < 600 && !h.hit; i++) b.tick(1 / 60);
 assert.equal(g.player.hp, hp, 'a dodge avoids it');
 b.boss.hp = b.boss.maxHp * 0.2; b.tick(1 / 60);
 assert.equal(b.stage, 4); assert.ok(b.transition > 0); assert.equal(b.boss.invuln, true);
 for (let i = 0; i < 60 * 40; i++) { g.player.dodgeInv = 9; b.tick(1 / 60); assert.ok(b.hazards.length <= 18); }
 assert.ok(b.view().hz.every(h => h.d >= 0.9));
});
test('boss difficulty scales HP; hazard shapes hit where drawn', () => {
 const easy = new BossEncounter([battle()], 'mewtwo', { difficulty: 'easy' }), legend = new BossEncounter([battle()], 'mewtwo', { difficulty: 'legendary' });
 assert.ok(legend.boss.maxHp > easy.boss.maxHp * 2.5);
 assert.equal(new BossEncounter([battle()], 'lugia', { difficulty: 'nonsense' }).difficulty, 'normal');
 assert.equal(hazardHits({ s: 'ring', x: 0, y: 0, r0: 70, r: 300 }, 30, 0), false);
 assert.equal(hazardHits({ s: 'ring', x: 0, y: 0, r0: 70, r: 300 }, 120, 0), true);
 assert.equal(hazardHits({ s: 'line', x: 0, y: 0, x2: 100, y2: 0, r: 20 }, 50, 15), true);
 assert.equal(hazardHits({ s: 'line', x: 0, y: 0, x2: 100, y2: 0, r: 20 }, 50, 30), false);
 assert.equal(hazardHits({ s: 'cover', safe: [[100, 100, 40]] }, 110, 100), false);
 assert.equal(hazardHits({ s: 'cover', safe: [[100, 100, 40]] }, 200, 100), true);
});
test('every boss runs every stage for a minute without errors', () => {
 for (const id of ['rayquaza', 'mewtwo', 'lugia']) for (const difficulty of ['easy', 'legendary']) {
  const g = battle(), b = new BossEncounter([g], id, { difficulty });
  for (const frac of [1, 0.7, 0.45, 0.2]) {
   b.boss.hp = b.boss.maxHp * frac;
   for (let i = 0; i < 60 * 15; i++) { g.player.hp = g.player.maxHp; b.tick(1 / 60); }
   assert.equal(b.stage, 1 + [0.75, 0.5, 0.25].filter(t => frac <= t).length, `${id} ${difficulty} stage`);
  }
 }
});
test('mastery: version 1 saves migrate; profile, raid bests, types and badges', async () => {
 const { readMastery, saveSummary, earnedBadges, setTitle, currentTitle } = await import('../src/mastery.js');
 let value = JSON.stringify({ version: 1, species: { pikachu: { xp: 120, discovered: [], battles: 3, wins: 2 } }, matches: [{ result: 'win', species: {} }, { result: 'loss', species: {} }], processed: ['a'], arenas: {}, moves: {} });
 const storage = { getItem: () => value, setItem: (_k, v) => (value = v) };
 const d = readMastery(storage);
 assert.equal(d.version, 2); assert.equal(d.species.pikachu.xp, 120); assert.equal(d.profile.battles, 2); assert.equal(d.profile.wins, 1);
 assert.ok(saveSummary({ id: 'r1', result: 'win', mode: 'raid', raid: 'mewtwo', difficulty: 'hard', arena: 'indigo', species: { blastoise: { damage: 900, discovered: ['conduct'] } }, moves: {} }, storage));
 assert.ok(saveSummary({ id: 'r2', result: 'win', mode: 'raid', raid: 'mewtwo', difficulty: 'easy', arena: 'indigo', species: { blastoise: { damage: 10 } }, moves: {} }, storage));
 const after = readMastery(storage);
 assert.equal(after.raids.mewtwo, 'hard', 'best difficulty kept'); assert.ok(after.typesWon.includes('water')); assert.equal(after.profile.bestStreak, 2);
 const ids = earnedBadges(after).map(b => b.id); assert.ok(ids.includes('first-win') && ids.includes('raid'));
 setTitle('raid', storage); assert.equal(currentTitle(storage), 'Raid Victor'); setTitle('mythbreaker', storage); assert.equal(currentTitle(storage), null, 'unearned titles cannot be worn');
});


test('raid ultimate: shield absorbs hits, blocks reactions and breaks into a punish window', () => {
 const g = battle(), b = new BossEncounter([g], 'lugia');
 b.intro = 0; b.boss.invuln = false; b.startUlt();
 const hp = b.boss.hp, shield = b.ult.shield;
 const move = { id: 'shield-test', name: 'Water', type: 'water', cat: 'special', power: 10, cooldown: 1, status: ['burn', 1] };
 assert.equal(applyHit(g, g.player, b.boss, move, { critChance: 0 }), true);
 assert.equal(b.boss.hp, hp); assert.ok(b.ult.shield < shield);
 assert.equal(b.boss.elementAura, null); assert.equal(b.boss.status.burn ?? 0, 0);
 b.ult.shield = 1;
 applyHit(g, g.player, b.boss, move, { critChance: 0 });
 assert.equal(b.ult, null); assert.equal(b.ultBroken, 1); assert.equal(b.vulnerable, 4);
 assert.ok(b.boss.hp < hp, 'overflow reaches HP');
 b.tick(0.1); assert.equal(b.ultFired, 0);
 assert.equal(b.view().ub, 1); assert.equal(b.view().ul, null);
});

test('raid ultimate: timeout hits both players through dodges once; stage change cancels', () => {
 for (const [difficulty, share] of [['normal', .55], ['legendary', .85]]) {
  const games = [battle(), battle()], b = new BossEncounter(games, 'mewtwo', { difficulty });
  b.intro = 0; b.boss.invuln = false;
  for (const g of games) { g.player.hp = g.player.maxHp; g.player.dodgeInv = 9; }
  b.startUlt(); assert.ok(b.view().ul.sh > 0);
  b.ult.t = .01; b.tick(.02);
  for (const g of games) assert.equal(g.player.hp, g.player.maxHp - Math.round(g.player.maxHp * share));
  assert.equal(b.ultFired, 1); b.tick(.02); assert.equal(b.ultFired, 1);
  b.startUlt(); b.boss.hp = b.boss.maxHp * .7; b.tick(.02);
  assert.equal(b.ult, null); assert.equal(b.ultFired, 1);
 }
});

test('Lugia aliases use valid cropped charge frames and wing beats', () => {
 const a = sprites.lugia.anims;
 assert.equal(a.Charge.offset, 2); assert.equal(a.Charge.frames, 8);
 assert.ok(a.Charge.offset + a.Charge.frames <= a.Shoot.frames);
 assert.ok(a.Charge.durations.every(d => d > 0));
 assert.deepEqual(a.Swing.durations, a.Attack.durations);
 assert.deepEqual(a.Rotate.durations, a.Attack.durations);
});

import { bossUltimateVisual } from '../src/raid-cinematics.js';
import { MOVES } from '../src/moves.js';
import { resultSummary } from '../src/mastery.js';
test('raid cinematics: player winds up without freezing the raid; legendary visuals cannot damage live actors', () => {
 for (const id of ['rayquaza', 'mewtwo', 'lugia']) {
  const g = battle(); g.opponentSelection = [id]; g.start(); g.showcase = null; g.state = 'fighting';
  for (const m of [g.player, g.opponent]) { m.hidden = false; m.appear = 0; }
  const b = new BossEncounter([g], id); b.intro = 0;
  const before = [g.player.hp, b.boss.hp, g.player.x, g.player.y];
  const visual = bossUltimateVisual(g, b.boss);
  for (let i = 0; i < 480 && !visual.action.done; i++) { visual.update(1 / 60); g.updateEffects(1 / 60); }
  assert.equal(visual.action.done, true, id);
  assert.deepEqual([g.player.hp, b.boss.hp, g.player.x, g.player.y], before, id);
  assert.equal(g.player.held, false);
  const move = MOVES[g.player.species.ultimate];
  g.startUltCutscene(g.player, move);
  assert.equal(g.cinematic, null); assert.equal(g.raidCards.length, 1);
  const windup = g.player.action; windup.update(.6); assert.equal(g.player.action, windup);
  windup.update(.71); assert.notEqual(g.player.action, windup); assert.equal(g.player.action.move, move);
 }
});
test('event replay is bounded and boss damage received is included in summaries', () => {
 const g = battle(); g.opponent.boss = 'rayquaza';
 g.recordCombat('hit', g.opponent, g.player, {damage: 77, move: 'boss-ultimate'});
 for (let i = 0; i < 650; i++) g.recordCombat('move', g.player, null, {id: 'flamethrower'});
 const summary = resultSummary(g);
 assert.equal(summary.events.length, 600); assert.equal(summary.droppedEvents, 51);
 assert.equal(summary.species[g.player.baseSpecies.id].received, 77);
});

test('ultimate audit: every roster ultimate finishes its existing choreography without errors', () => {
 const seen = new Set();
 for (const species of Object.values(SPECIES)) {
  if (!species.ultimate || species.megaOf || seen.has(species.ultimate)) continue;
  seen.add(species.ultimate);
  const g = battle(); g.selection = [species.id, 'pikachu', 'blastoise']; g.start(); g.showcase = null; g.state = 'fighting';
  for (const m of [g.player,g.opponent]) {m.hidden=false;m.appear=0;m.hp=100000;}
  g.particles.max=-1;
  g.startUltCutscene(g.player, MOVES[species.ultimate]);
  for (let i=0;i<720;i++) {
   if(g.cinematic)g.updateUltCutscene(1/60);
   else if(g.player.action && !g.player.action.done)g.player.action.update(1/60);
   g.updateEffects(1/60);
  }
  assert.equal(g.cinematic,null,species.ultimate);
  assert.equal(g.player.action?.done,true,species.ultimate);
 }
 assert.ok(seen.size >= 91);
});

import { evolveRaidBoss } from '../src/bosses.js';
test('raid Mega evolution: exact half HP trigger, health preservation and idempotent co-op state', () => {
 for(const id of ['rayquaza','mewtwo','lugia']) {
  const g=battle();g.opponentSelection=[id];g.start();g.showcase=null;g.state='fighting';
  for(const m of [g.player,g.opponent]){m.hidden=false;m.appear=0;}
  const b=new BossEncounter([g],id);b.intro=0;b.next=100;
  const max=b.boss.maxHp;b.boss.hp=max*.51;b.tick(1/60);assert.equal(b.boss.isMega,false);
  b.boss.hp=max*.5;b.tick(1/60);
  assert.equal(b.boss.isMega,id!=='lugia');assert.equal(b.boss.hp,max*.5);assert.equal(b.boss.maxHp,max);
  if(id!=='lugia') {
   const form=b.boss.species;assert.equal(b.view().mg,true);b.tick(1/60);assert.equal(b.boss.species,form);
   const remote=battle();remote.opponentSelection=[id];remote.start();
   const r=new BossEncounter([remote],id);r.boss.hp=max*.5;
   assert.equal(evolveRaidBoss(r.boss,id,sprites),true);assert.equal(evolveRaidBoss(r.boss,id,sprites),false);
   assert.equal(r.boss.maxHp,max);assert.equal(r.boss.hp,max*.5);assert.equal(r.boss.species.id,form.id);
  }
 }
});


test('Dragon Ascent visually rises above the arena before its dive in both boss forms', () => {
 for(const mega of [false,true]) {
  const g=battle();g.opponentSelection=['rayquaza'];g.start();g.showcase=null;g.state='fighting';
  for(const m of [g.player,g.opponent]) {m.hidden=false;m.appear=0;}
  const b=new BossEncounter([g],'rayquaza'); b.boss.y=230;
  if(mega)evolveRaidBoss(b.boss,'rayquaza',sprites);
  const v=bossUltimateVisual(g,b.boss), liveZ=b.boss.z;
  for(let i=0;i<55;i++)v.update(1/60);
  assert.ok(v.user.z > 300, 'drawn altitude follows the rise');
  assert.ok(v.user.y-v.user.z < 0, 'Rayquaza rises above the arena');
  assert.equal(b.boss.z,liveZ,'visual rise does not move the authoritative boss');
  for(let i=0;i<45;i++)v.update(1/60);
  assert.ok(v.user.z < 100, 'returns from the sky for impact');
 }
});

test('presentation renders the ordinary intro, boss defeat and victory without runtime errors', () => {
 const g=battle();g.start();g.render();g.showcase=null;g.state='fighting';
 for(const m of [g.player,g.opponent]) {m.hidden=false;m.appear=0;}
 new BossEncounter([g],'rayquaza');g.opponent.hp=0;
 g.startFinale(g.player,g.opponent,null);
 for(const t of [.1,.3,1.4,2.8]) {g.finale.update(t);g.render();}
});

test('online ultimate and Mega presentation never stop the authoritative clock or dodge timers',()=>{
 const g=battle();g.online={authority:true,server:true,send:noop,tick:noop,processEvents:noop,beforePuppet:noop,afterPuppet:noop};
 g.opponent.dodgeCD=2;g.startUltCutscene(g.player,MOVES[g.player.species.ultimate]);
 assert.equal(g.cinematic,null);g.update(.1);assert.ok(g.time>0);assert.ok(g.opponent.dodgeCD<2);
 g.player.cancelAction();g.player.busy=0;const hp=g.player.hp;
 assert.equal(g.megaEvolve(g.player,true),true);assert.equal(g.cinematic,null);assert.equal(g.player.hp,hp);
});
test('reactions respect type immunity, switching and fainting; conduction only chains to nearby wet enemies',()=>{
 const g=battle(),p=g.player,t=g.opponent,wet=g.opponentTeam.members[1],dry=g.opponentTeam.members[2],ally=g.playerTeam.members[1];
 for(const m of [p,t,wet,dry,ally]){m.hidden=false;m.appear=0;m.hp=m.maxHp;}
 t.x=150;t.y=250;wet.x=170;wet.y=250;dry.x=180;dry.y=250;ally.x=175;ally.y=250;
 const move=type=>({id:`reaction-${type}`,name:type,type,cat:'special',power:2,cooldown:1,status:['slow',0]});
 primeElement(t,'water',g.time);primeElement(wet,'water',g.time);primeElement(ally,'water',g.time);
 g.combatants=()=>[p,t,wet,dry,ally];const hp=[wet.hp,dry.hp,ally.hp];
 applyHit(g,p,t,move('electric'),{critChance:0});assert.ok(wet.hp<hp[0]);assert.equal(dry.hp,hp[1]);assert.equal(ally.hp,hp[2]);
 assert.equal(wet.elementAura,null,'chain consumes the aura');
 primeElement(t,'water',g.time);t.enter(180,250,0);assert.equal(t.elementAura,null,'switch clears priming');t.hidden=false;
 t.species={...t.species,types:['ice']};primeElement(t,'water',g.time);applyHit(g,p,t,move('ice'),{critChance:0});assert.equal(t.frozen,0,'Ice type is immune');
 primeElement(t,'fire',g.time);t.hp=0;t.faint();assert.equal(t.elementAura,null,'faint clears priming');assert.equal(applyHit(g,p,t,move('water')),false);
});

test('headless matches skip arena art and decorative effects while preserving landing callbacks and timers',()=>{
 const ui=new Proxy({format:3,headless:true},{get:(t,k)=>t[k]??noop});
 const g=new Game(document.createElement('canvas'),sprites,ui);g.start();g.showcase=null;g.state='fighting';g.timers=[];
 for(const m of [g.player,g.opponent]){m.hidden=false;m.appear=0;}
 assert.equal(g.arena.ground,null);assert.equal(g.arena.flakes.length,0);
 g.marks.fracture(180,250,100);assert.equal(g.marks.list.length,0);
 let landed=0,timed=0;g.spawn(new Falling(180,250,.05,'draco',()=>landed++));g.later(.05,()=>timed++);
 for(let i=0;i<12;i++)g.update(1/60);
 assert.equal(landed,1);assert.equal(timed,1);assert.ok(g.time>0);
});
