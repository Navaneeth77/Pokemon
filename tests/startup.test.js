import '../server/shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Matchmaker } from '../src/matchmaking.js';
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
