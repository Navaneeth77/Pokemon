import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Matchmaker } from '../src/matchmaking.js';
import { warmServer, rememberReady } from '../src/server-connection.js';
test.beforeEach(()=>rememberReady('ws://test',false));
test('startup retries temporary readiness failure, then waits for websocket welcome', async () => {
 const original = globalThis.fetch; let requests = 0, connections = 0;
 globalThis.fetch = async () => ({ ok: ++requests > 1, json: async () => ({ready:true}) });
 const mm = {url:'ws://test',httpUrl:'http://test',connect:async()=>{connections++;}};
 try { await Matchmaker.prototype.connectReady.call(mm); assert.equal(requests,2);assert.equal(connections,1); }
 finally {globalThis.fetch=original;}
});
test('startup cancellation aborts the active readiness request and never connects', async () => {
 const original = globalThis.fetch; let signal, connected = false;
 globalThis.fetch = async (_url, options) => new Promise((_resolve,reject)=> {
  signal=options.signal; signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
 });
 const mm={url:'ws://test',httpUrl:'http://test',state:'idle',connect:async()=>{connected=true;}};
 try {
  const pending=Matchmaker.prototype.connectReady.call(mm);
  Matchmaker.prototype.cancel.call(mm);
  await assert.rejects(pending);assert.equal(signal.aborted,true);assert.equal(connected,false);
 } finally {globalThis.fetch=original;}
});

test('legacy protocol-2 health fallback still waits for the websocket welcome',async()=>{
 const original=globalThis.fetch,urls=[];let connected=false;
 globalThis.fetch=async url=>{urls.push(url);return url.endsWith('/ready')?{status:404,ok:false,json:async()=>({})}:{status:200,ok:true,json:async()=>({ok:true})};};
 const mm={url:'ws://test',httpUrl:'http://test',connect:async()=>{connected=true;}};
 try{await Matchmaker.prototype.connectReady.call(mm);assert.deepEqual(urls,['http://test/ready','http://test/health']);assert.equal(connected,true);}
 finally{globalThis.fetch=original;}
});

test('early wake deduplicates requests and a warm connection still waits for welcome',async()=>{
 const original=globalThis.fetch;let requests=0,connected=false,release;
 globalThis.fetch=async()=>{requests++;await new Promise(r=>release=r);return {ok:true,json:async()=>({ready:true})};};
 try{
  const a=warmServer('ws://test'),b=warmServer('ws://test');assert.equal(a,b);release();assert.equal(await a,true);
  const mm={url:'ws://test',httpUrl:'http://test',connect:async()=>{connected=true;}};
  await Matchmaker.prototype.connectReady.call(mm);assert.equal(requests,1);assert.equal(connected,true);
 }finally{globalThis.fetch=original;}
});

test('a failed wake does not suppress the next attempt',async()=>{
 const original=globalThis.fetch;let requests=0;
 globalThis.fetch=async()=>{if(++requests===1)throw Error('offline');return {ok:true,json:async()=>({ready:true})};};
 try{assert.equal(await warmServer('ws://test'),false);assert.equal(await warmServer('ws://test'),true);assert.equal(requests,2);}
 finally{globalThis.fetch=original;}
});

test('readiness retry respects its overall deadline',async()=>{
 const original=globalThis.fetch;let connections=0;
 globalThis.fetch=async()=>({ok:false,json:async()=>({ready:false})});
 const mm={url:'ws://test',httpUrl:'http://test',connect:async()=>{connections++;}},at=performance.now();
 try{await assert.rejects(Matchmaker.prototype.connectReady.call(mm,30),/timed out/);assert.ok(performance.now()-at<300);assert.equal(connections,0);}
 finally{globalThis.fetch=original;}
});

test('interpolated opponent positions do not accumulate a second smoothing delay',()=>{
 const mon={x:10,y:20,z:0,hidden:false,fainted:false};
 const mm={foeSample:{},fx:x=>x,fy:y=>y,fd:d=>d};
 Matchmaker.prototype.puppetAfter.call(mm,1/60,{mon,x:10,y:20},{x:15,y:25,d:0,fz:0},false);
 assert.equal(mon.x,15);assert.equal(mon.y,25);
});

test('co-op partner moves between snapshots and advances its sprite every render frame',()=>{
 let animation,advanced=0;
 const a={species:{id:'charizard'},x:33,y:20,sprite:{play:name=>animation=name,update:dt=>advanced+=dt}};
 const mm=Object.assign(Object.create(Matchmaker.prototype),{game:{raidAlly:a},offset:100,delay:35,
  allyBuf:[{ts:0,i:'charizard',x:0,y:20,d:2},{ts:33,i:'charizard',x:33,y:20,d:2},{ts:66,i:'charizard',x:66,y:20,d:2}]});
 mm.tickAlly(1/60,186);assert.equal(a.x,51);assert.equal(a.y,20);assert.equal(animation,'Walk');assert.equal(advanced,1/60);
 mm.tickAlly(1/60,196);assert.equal(a.x,61);assert.equal(advanced,2/60);
});

test('late snapshots extrapolate only briefly and never slide across a teleport',()=>{
 const mm={offset:100,delay:35,foeBuf:[{ts:0,i:0,x:0,y:0},{ts:33,i:0,x:33,y:0}]};
 assert.equal(Matchmaker.prototype.sampleFoe.call(mm,500).x,113);
 mm.foeBuf[1].x=200;
 assert.equal(Matchmaker.prototype.sampleFoe.call(mm,500).x,200);
});

test('legacy host with blocked HTTP CORS can connect through a valid websocket welcome',async()=>{
 const original=globalThis.fetch;let connections=0;
 globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
 const mm={url:'ws://test',httpUrl:'http://test',connect:async()=>{connections++;}};
 try{await Matchmaker.prototype.connectReady.call(mm);assert.equal(connections,1);}
 finally{globalThis.fetch=original;}
});

test('first queue waits for both team assets and the server welcome',async()=>{
 let assets,connection;const sent=[];
 const mm={url:'ws://test',state:'idle',flow:{save:{},persist(){}},game:{ensureSprites:()=>new Promise(r=>assets=r)},wake(){},setState(s){this.state=s;},
  connectReady:()=>new Promise(r=>connection=r),send:m=>sent.push(m)};
 const pending=Matchmaker.prototype.find.call(mm,{format:3,team:['charizard','raichu','blastoise'],lead:0});
 try{
  connection();await Promise.resolve();assert.equal(sent.length,0);
  assets();await pending;assert.equal(sent.length,1);assert.equal(sent[0].t,'queue');
 }finally{clearTimeout(mm.wakeNote);}
});

test('cancel and immediate retry cannot send the cancelled attempt into the new queue',async()=>{
 const loads=[],connections=[],sent=[];
 const mm={url:'ws://test',state:'idle',flow:{save:{},persist(){}},game:{ensureSprites:()=>new Promise(r=>loads.push(r))},wake(){},setState(s){this.state=s;},drop(){},
  connectReady:()=>new Promise(r=>connections.push(r)),send:m=>sent.push(m)};
 const spec={format:3,team:['charizard','raichu','blastoise'],lead:0};
 const first=Matchmaker.prototype.find.call(mm,spec);Matchmaker.prototype.cancel.call(mm);
 const second=Matchmaker.prototype.find.call(mm,spec);
 try{
  connections[0]();loads[0]();await first;assert.equal(sent.filter(m=>m.t==='queue').length,0);
  connections[1]();loads[1]();await second;assert.equal(sent.filter(m=>m.t==='queue').length,1);
 }finally{clearTimeout(mm.wakeNote);}
});
