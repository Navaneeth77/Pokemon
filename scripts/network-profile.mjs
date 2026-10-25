import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WebSocket} from 'ws';
const port=18882,base=`http://127.0.0.1:${port}`,dir=await mkdtemp(join(tmpdir(),'arena-profile-'));
const processAt=performance.now();
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:String(port),MAX_MATCHES:'4',MAX_RAIDS:'1',UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:'',LEADERBOARD_FILE:join(dir,'records.json'),ECONOMY_FILE:join(dir,'economy.json')},stdio:['ignore','pipe','pipe']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let errors='';server.stderr.on('data',b=>errors+=b);
const clients=[];
async function client(id){
 const ws=new WebSocket(base.replace('http','ws')),messages=[];let bytes=0,snapshots=0,lastSnapshot=0;const gaps=[],rtts=[];
 ws.on('message',raw=>{bytes+=raw.length;const m=JSON.parse(raw);if(m.t==='b'){const now=performance.now();if(lastSnapshot)gaps.push(now-lastSnapshot);lastSnapshot=now;snapshots++;}if(m.t==='pong')rtts.push(performance.now()-m.ts);messages.push(m);if(messages.length>600)messages.shift();});
 const c={ws,send:m=>ws.send(JSON.stringify(m)),get bytes(){return bytes;},get snapshots(){return snapshots;},gaps,rtts,async wait(type,p=()=>true){for(let i=0;i<400;i++){const n=messages.findIndex(m=>m.t===type&&p(m));if(n>=0)return messages.splice(n,1)[0];await sleep(25);}throw Error(`Timed out waiting for ${type}`);}};
 clients.push(c);await once(ws,'open');c.send({t:'hello',v:2,pid:`profile-${id}`,name:'Profiler'});await c.wait('welcome');return c;
}
const team=['charizard','raichu','blastoise'];
async function pair(id,raid=false){
 const cs=await Promise.all([client(`${id}-a`),client(`${id}-b`)]);
 if(raid){for(const c of cs)c.send({t:'raid-queue',boss:'rayquaza',kind:'public',difficulty:'hard',format:3,team,lead:0,mega:{}});}
 else for(const c of cs)c.send({t:'queue',format:3,team,lead:0,mega:{}});
 const matches=await Promise.all(cs.map(c=>c.wait('matched')));
 cs.forEach((c,i)=>{c.match=matches[i];c.send({t:'loaded',id:c.match.id});});await Promise.all(cs.map(c=>c.wait('start')));return cs;
}
try{
 for(let i=0;i<100;i++){try{const r=await fetch(`${base}/ready`);if(r.ok)break;}catch{}await sleep(50);}
 const startupMs=performance.now()-processAt;
 const ordinary=[...await pair('one'),...await pair('two')],raid=await pair('raid',true);
 const at=performance.now();let tick=0;
 const actions=setInterval(()=>{for(const c of clients)if(c.ws.readyState===1){c.send({t:'ping',ts:performance.now()});c.send({t:'in',id:c.match.id,x:Math.sin(tick/10)*.4,y:0,q:tick});c.send({t:'act',id:c.match.id,k:'press',i:tick%4});c.send({t:'act',id:c.match.id,k:'release',i:tick%4});}tick++;},500);
 await sleep(12000);clearInterval(actions);
 const active=await(await fetch(`${base}/health`)).json();
 const stats=values=>{const a=[...values].sort((a,b)=>a-b);return {n:a.length,p50:+(a[Math.floor(a.length*.5)]??0).toFixed(2),p95:+(a[Math.floor(a.length*.95)]??0).toFixed(2),max:+(a.at(-1)??0).toFixed(2)};};
 const result={startupMs,seconds:(performance.now()-at)/1000,scenario:'two ordinary matches plus one two-player hard raid',players:clients.length,health:active,traffic:clients.map(c=>({raid:!!c.match.raid,bytes:c.bytes,snapshots:c.snapshots,rttMs:stats(c.rtts),snapshotGapMs:stats(c.gaps)})),stderr:errors};
 ordinary.forEach(c=>c.send({t:'leave',id:c.match.id}));raid.forEach(c=>c.send({t:'leave',id:c.match.id}));
 await sleep(250);result.afterLeave=await(await fetch(`${base}/health`)).json();
 await writeFile(process.argv[2]??'docs/network-profile.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{clients.forEach(c=>c.ws.close());server.kill();await once(server,'exit');await rm(dir,{recursive:true,force:true});}
