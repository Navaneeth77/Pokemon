import '../server/shim.js';
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
import {BossEncounter} from '../src/bosses.js';
test('mastery storage tolerates corruption and deduplicates result IDs',()=>{
 let value='not json';const storage={getItem:()=>value,setItem:(_k,v)=>value=v};assert.equal(readMastery(storage).version,1);
 const s={id:'match-1',result:'win',arena:'mtSilver',mode:'raid',species:{charizard:{damage:1000,hits:5,kos:1,reactions:1,discovered:['melt']}},moves:{flamethrower:2}};
 assert.equal(saveSummary(s,storage),true);assert.equal(saveSummary(s,storage),false);const data=readMastery(storage);assert.equal(data.species.charizard.battles,1);assert.equal(data.species.charizard.raids,1);assert.equal(level(100),2);
});
test('boss hazards are bounded, telegraphed, phase-based and dodgeable',()=>{
 const g=battle();const b=new BossEncounter([g],'rayquaza');g.opponent.hidden=false;g.opponent.frozen=0;g.player.x=180;g.player.y=500;
 b.tick(2.6);assert.equal(b.hazards.length,1);assert.ok(b.hazards[0].left>0);
 const hp=g.player.hp;g.player.dodgeInv=2;b.tick(1.6);assert.equal(g.player.hp,hp);
 b.boss.hp=b.boss.maxHp*.2;b.tick(.01);assert.equal(b.phase,3);assert.ok(b.hazards.length<=2);
});
