import { freshWallet, rollover, progressMatch, walletAction, walletView, walletLoadout } from './economy.js';
import { resultSummary } from './mastery.js';
const LOCAL='msb.economy.local',CACHE='msb.economy.server-cache';
export function economyCredential(pid){
 const key=`msb.economy.credential.${pid}`;let token;
 try{token=localStorage.getItem(key);}catch{}
 if(!/^[a-f0-9]{64}$/.test(token??'')){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');try{localStorage.setItem(key,token);}catch{}}
 return token;
}
export class EconomyClient {
 constructor(flow){this.flow=flow;this.pid=flow.mm.pid;this.token=economyCredential(this.pid);this.scope='local';this.pending=false;this.connected=false;this.error='';this.listeners=new Set();
  try{this.scope=localStorage.getItem('msb.economy.scope')==='server'?'server':'local';}catch{}
  let raw;try{raw=localStorage.getItem(LOCAL);this.local=raw?JSON.parse(raw):null;}catch{this.localError='Local wallet needs recovery. Your original save was preserved.';}
  try{this.server=JSON.parse(localStorage.getItem(CACHE));}catch{}
  if(this.local&&(this.local.version!==1||!Number.isSafeInteger(this.local.balance)||this.local.balance<0||!Array.isArray(this.local.owned)||!Array.isArray(this.local.history)||!this.local.receipts||!this.local.equipped)){
   this.localError='Local wallet needs recovery. Your original save was preserved.';this.local=null;
  }
  if(!this.local)this.local=freshWallet(this.pid,Date.now());
  if(this.server?.pid!==this.pid||this.server?.version!==1||!Array.isArray(this.server?.owned)||!Array.isArray(this.server?.history)||!this.server?.equipped||!Number.isSafeInteger(this.server?.balance))this.server=null;
  this.clockAt=performance.now();this.clockNow=Math.max(Date.now(),this.local.lastNow??0);rollover(this.local,this.now());
 }
 now(){return this.clockNow+performance.now()-this.clockAt;}
 get wallet(){return this.scope==='server'?this.server:this.local;}
 get view(){return this.wallet?walletView(structuredClone(this.wallet),this.now()):null;}
 loadout(){return walletLoadout(this.wallet);}
 emit(){for(const f of this.listeners)f();}
 async select(scope){this.scope=scope;try{localStorage.setItem('msb.economy.scope',scope);}catch{}this.emit();if(scope==='server')await this.sync();}
 async request(op,id){
  if(!this.flow.mm.url)throw Error('No match server configured. Local play is available.');
  const url=this.flow.mm.url.replace(/^ws/,'http').replace(/\/$/,'')+'/economy';
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pid:this.pid,credential:this.token,op,id}),signal:AbortSignal.timeout(8000)});
  const data=await response.json();if(!response.ok||!data.wallet)throw Error(data.error??'The match server needs the economy update.');
  if(data.wallet.version!==1||data.wallet.pid!==this.pid)throw Error('Invalid server wallet response.');
  this.server=data.wallet;this.clockNow=data.wallet.serverNow;this.clockAt=performance.now();this.connected=true;
  try{localStorage.setItem(CACHE,JSON.stringify(this.server));}catch{}return this.server;
 }
 async sync(){try{await this.request('view');this.error='';}catch(e){this.connected=false;this.error=e.message;}this.emit();}
 saveLocal(next){if(this.localError)throw Error(this.localError);localStorage.setItem(LOCAL,JSON.stringify(next));this.local=next;}
 async action(op,id){if(this.pending)throw Error('A transaction is already processing.');this.pending=true;this.emit();
  const before=this.wallet?.balance??0;
  try{if(this.scope==='server')await this.request(op,id);else{const next=structuredClone(this.local);walletAction(next,op,id,this.now());this.saveLocal(next);}
   this.error='';const delta=(this.wallet?.balance??0)-before;this.emit();return delta;
  }catch(e){this.error=e.message;throw e;}finally{this.pending=false;this.emit();}
 }
 completeLocal(game,win){
  if(game.online||game.practice||!game.summary||!['over','finale'].includes(game.state))return false;
  const summary=resultSummary(game,'player',{result:win?'win':'loss',reason:'ko',team:game.selection});
  const next=structuredClone(this.local);
  if(!progressMatch(next,summary,this.now(),{local:true}))return false;
  try{const earned=next.balance-this.local.balance;this.saveLocal(next);this.emit();this.flow.economyUI?.notify(`Local Journey · ${earned>0?`+${earned} Chaos Coins · `:''}mission progress saved`);return true;}catch{this.error='Local storage is unavailable. No reward was claimed.';return false;}
 }
}
