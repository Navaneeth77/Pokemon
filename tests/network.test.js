import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const port=18879;
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:String(port),LEADERBOARD_FILE:'/tmp/chaos-arena-test-records.json'},stdio:['ignore','pipe','pipe']});
let logs='';server.stderr.on('data',b=>logs+=b);
await once(server.stdout,'data');
function client(id){const ws=new WebSocket(`ws://127.0.0.1:${port}`),messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));return {ws,messages,send:m=>ws.send(JSON.stringify(m)),async wait(t,p=()=>true){for(let i=0;i<400;i++){const k=messages.findIndex(m=>m.t===t&&p(m));if(k>=0)return messages.splice(k,1)[0];await new Promise(r=>setTimeout(r,25));}throw new Error(`Timed out ${t}: ${logs}`);},async hello(extra={}){await once(ws,'open');this.send({t:'hello',v:2,pid:id,name:'Test',...extra});await this.wait('welcome');}}}
async function pair(prefix){const a=client(prefix+'-playera'),b=client(prefix+'-playerb');await Promise.all([a.hello(),b.hello()]);return[a,b];}
test('HTTP wallet rejects fabricated rewards, prices and invalid online teams',async()=>{
 const pid=`eco-http-${Date.now()}`,credential='d'.repeat(64),url=`http://127.0.0.1:${port}/economy`;
 const request=async q=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pid,credential,...q})});return {status:r.status,body:await r.json()};};
 assert.equal((await request({op:'view'})).body.wallet.balance,0);
 assert.equal((await request({op:'grant',amount:999999})).status,400);
 assert.equal((await request({op:'buy',id:'frame-amethyst',price:0})).status,400);
 assert.equal((await request({op:'view'})).body.wallet.balance,0);
 const c=client(pid);try{await c.hello({economyToken:credential});c.send({t:'queue',format:3,team:['charizard','pikachu','rayquaza']});assert.equal((await c.wait('error')).code,'bad-team');}finally{c.ws.close();}
});
test('server readiness and two-player snake draft launch',async()=>{
 assert.equal((await(await fetch(`http://localhost:${port}/ready`)).json()).ready,true);
 const cs=await pair('snake');try{
 for(const c of cs)c.send({t:'draft-queue',mode:'snake',format:3});
 let states=await Promise.all(cs.map(c=>c.wait('draft-state')));
 for(let i=0;i<6;i++){const turn=states[0].turn;cs[turn].send({t:'draft-pick',id:states[0].id,species:states[turn].pool[0]});states=await Promise.all(cs.map(c=>c.wait('draft-state')));}
 for(const c of cs)c.send({t:'draft-confirm',id:states[0].id});
 const ms=await Promise.all(cs.map(c=>c.wait('matched')));assert.equal(ms[0].id,ms[1].id);assert.equal(ms[0].me.team.length,3);
 cs.forEach((c,i)=>c.send({t:'loaded',id:ms[i].id}));await Promise.all(cs.map(c=>c.wait('start')));
 }finally{cs.forEach(c=>c.ws.close());}
});
test('private co-op uses shared boss HP; forged damage ignored; disconnect survives',async()=>{
 const cs=await pair('raid');const spec={t:'raid-queue',boss:'rayquaza',format:3,team:['charizard','raichu','rayquaza'],lead:0,mega:{}};
 try{
 cs[0].send({...spec,kind:'private'});const lobby=await cs[0].wait('raid-waiting');
 cs[1].send({...spec,kind:'join',code:lobby.code});const ms=await Promise.all(cs.map(c=>c.wait('matched')));assert.equal(ms[0].id,ms[1].id);
 cs.forEach((c,i)=>c.send({t:'loaded',id:ms[i].id}));await Promise.all(cs.map(c=>c.wait('start')));
 const snaps=await Promise.all(cs.map(c=>c.wait('b',m=>!!m.raid)));assert.equal(snaps[0].raid.hp,snaps[1].raid.hp);assert.ok(snaps[0].ally);
 cs[0].send({t:'damage',id:ms[0].id,hp:0,damage:999999});const next=await cs[0].wait('b',m=>m.ts>snaps[0].ts);assert.equal(next.raid.hp,snaps[0].raid.hp);
 cs[1].ws.close();const disconnected=await cs[0].wait('b',m=>m.ally?.disconnected);assert.equal(disconnected.raid.hp,snaps[0].raid.hp);
 const rejoined = client('raid-playerb'); cs[1] = rejoined; await rejoined.hello();
 const restored = await rejoined.wait('matched'); assert.equal(restored.id, ms[0].id);
 rejoined.send({t:'loaded', id:restored.id}); await rejoined.wait('start');
 const resumed = await rejoined.wait('b',m=>!!m.raid); assert.ok(resumed.raid.hp > 0);
 }finally{cs.forEach(c=>c.ws.close());}
});
test('blind trade completes three rounds and launches six distinct picks',async()=>{
 const cs=await pair('trade');try{
 for(const c of cs)c.send({t:'draft-queue',mode:'trade',format:6});
 let states=await Promise.all(cs.map(c=>c.wait('draft-state',m=>m.phase==='picking')));
 for(let r=0;r<3;r++){
  cs[0].send({t:'draft-pick',id:states[0].id,species:states[0].pool[0]});
  const hidden=await cs[1].wait('draft-state',m=>m.phase==='picking');assert.equal(hidden.teams[0].length,r*2);
  cs[1].send({t:'draft-pick',id:states[1].id,species:states[1].pool[0]});
  await Promise.all(cs.map(c=>c.wait('draft-state',m=>m.phase==='reveal')));
  states=await Promise.all(cs.map(c=>c.wait('draft-state',m=>m.phase===(r===2?'confirm':'picking') && m.round===r+1)));
 }
 for(const c of cs)c.send({t:'draft-confirm',id:states[0].id});
 const ms=await Promise.all(cs.map(c=>c.wait('matched')));for(const m of ms)assert.equal(new Set(m.me.team).size,6);
 }finally{cs.forEach(c=>c.ws.close());}
});
test.after(()=>server.kill());

test('ranked draft uses authoritative Elo; unranked queue remains a separate mode',async()=>{
 const cs=await pair('ranked-draft');try{
 for(const c of cs)c.send({t:'draft-queue',mode:'snake',format:3,ranked:true,roster:'all'});
 let states=await Promise.all(cs.map(c=>c.wait('draft-state')));assert.ok(states.every(s=>s.ranked));
 for(let i=0;i<6;i++){const turn=states[0].turn;cs[turn].send({t:'draft-pick',id:states[0].id,species:states[turn].pool[0]});states=await Promise.all(cs.map(c=>c.wait('draft-state')));}
 for(const c of cs)c.send({t:'draft-confirm',id:states[0].id});
 const ms=await Promise.all(cs.map(c=>c.wait('matched')));assert.ok(ms.every(m=>m.ranked));
 cs.forEach((c,i)=>c.send({t:'loaded',id:ms[i].id}));await Promise.all(cs.map(c=>c.wait('start')));
 cs[1].send({t:'leave',id:ms[1].id});const end=await cs[0].wait('end');assert.equal(end.ranked,true);assert.ok(end.delta>0);assert.equal(end.record.w,1);
 }finally{cs.forEach(c=>c.ws.close());}
});
