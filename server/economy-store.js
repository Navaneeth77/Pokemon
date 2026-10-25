import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { freshWallet, walletAction, walletView, progressMatch, rollover } from '../src/economy.js';
export class EconomyStore {
 constructor(file){this.file=file;this.data={version:1,players:{}};this.error=null;
  try{const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.version!==1||!data.players)throw Error('Unsupported economy save');this.data=data;}
  catch(e){if(e.code!=='ENOENT')this.error='Economy storage could not be loaded. Existing data was preserved.';}
 }
 hash(secret){return crypto.createHash('sha256').update(secret).digest('hex');}
 authenticated(pid,secret){return typeof secret==='string'&&/^[a-f0-9]{64}$/.test(secret)&&this.data.players[pid]?.credential===this.hash(secret);}
 commit(next){if(this.error)throw Error(this.error);fs.mkdirSync(path.dirname(this.file),{recursive:true});
  const temp=this.file+'.tmp';const fd=fs.openSync(temp,'w',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(next));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temp,this.file);this.data=next;
 }
 request(pid,secret,op,id,now=Date.now()){
  if(this.error)throw Error(this.error);
  if(!/^[A-Za-z0-9_-]{8,64}$/.test(pid??'')||!/^[a-f0-9]{64}$/.test(secret??''))throw Error('Invalid anonymous wallet credential.');
  const next=structuredClone(this.data),old=next.players[pid];
  if(old&&!this.authenticated(pid,secret))throw Error('This wallet belongs to another browser credential. No balance was changed.');
  const record=next.players[pid]??={credential:this.hash(secret),wallet:freshWallet(pid,now)};
  walletAction(record.wallet,op,id,now);this.commit(next);return walletView(record.wallet,now);
 }
 award(player,summary,now=Date.now()){
  if(!player?.economyAuthenticated||!this.data.players[player.pid])return false;
  try{const next=structuredClone(this.data),w=next.players[player.pid].wallet;rollover(w,now);
   if(!progressMatch(w,summary,now))return false;this.commit(next);return true;
  }catch(e){console.error('Economy reward could not be persisted; no reward committed.');return false;}
 }
}
