import { ROSTER, SPECIES, isPlayable } from './data/species.js';
export const ECONOMY_VERSION=1;
export const ECONOMY={firstWin:40,dailyBonus:100,weeklyReward:250,weeklyWins:5,minSeconds:20,minDamage:250,localDailyMatches:8,milestones:{1:50,10:150,25:250},history:50};
export const CATALOG=[
 {id:'frame-amethyst',kind:'frame',name:'Amethyst Circuit',desc:'A violet trainer portrait frame, visible in your profile and battle HUD.',price:220,rarity:'Rare',color:'#bd9bff'},
 {id:'frame-ember',kind:'frame',name:'Ember Crest',desc:'A warm copper frame for your trainer portrait.',price:280,rarity:'Rare',color:'#ffb475'},
 {id:'title-skybound',kind:'title',name:'Skybound',desc:'Wear Skybound beneath your trainer name in the main menu.',price:160,rarity:'Common',color:'#93d7f7'},
 {id:'title-tempest',kind:'title',name:'Tempest Keeper',desc:'A violet title for your trainer profile.',price:400,rarity:'Rare',color:'#d3b2ff'},
 {id:'aura-amethyst',kind:'aura',name:'Astral Orbit',desc:'Violet motes orbit beneath your active Pokémon. Cosmetic only.',price:480,rarity:'Epic',color:'#c29af6'},
 {id:'aura-jade',kind:'aura',name:'Jade Slipstream',desc:'Broken emerald gusts circle beneath your active Pokémon.',price:420,rarity:'Rare',color:'#91e5bd'},
 {id:'sendout-sapphire',kind:'effect',name:'Sapphire Arrival',desc:'A sapphire pressure ring accompanies your Pokémon’s send-out.',price:200,rarity:'Common',color:'#90d6ff'},
 {id:'pose-hop',kind:'pose',name:'Victory Hop',desc:'Celebrate with Hop on species that support it; their native victory pose is the fallback.',price:260,rarity:'Common',anim:'Hop',color:'#ffe091'},
 {id:'pose-roar',kind:'pose',name:'Victory Roar',desc:'Use Roar in the victory sequence on species that support it.',price:360,rarity:'Rare',anim:'Roar',color:'#ffae8b'},
 {id:'ultimate-astral',kind:'ultimate',name:'Astral Overdrive',desc:'A violet starburst when you begin an ultimate. Existing attack animations and damage stay unchanged.',price:600,rarity:'Epic',color:'#c9a5ff'},
];
export const itemById=id=>CATALOG.find(i=>i.id===id);
const DAY=86400000;
export const dayKey=now=>new Date(now).toISOString().slice(0,10);
export const nextDaily=now=>(Math.floor(now/DAY)+1)*DAY;
export const weekKey=now=>dayKey(Math.floor((now-4*DAY)/(7*DAY))*7*DAY+4*DAY); // Monday UTC
export const nextWeekly=now=>Date.parse(weekKey(now))+7*DAY;
function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function missionPool(pid,date){
 const species=ROSTER.filter(id=>SPECIES[id].class==='regular')[hash(pid+date)%ROSTER.filter(id=>SPECIES[id].class==='regular').length];
 const type=SPECIES[species].types[0];
 return [
 {id:'wins',title:'Victory lap',desc:'Win 2 eligible battles.',metric:'wins',target:2,reward:100,art:'charizard'},
 {id:'ultimate',title:'Signature strike',desc:'Land 3 ultimate hits in completed battles.',metric:'ultimateHits',target:3,reward:90,art:'mewtwo'},
 {id:'reaction',title:'Elemental alchemy',desc:'Trigger 3 elemental reactions.',metric:'reactions',target:3,reward:90,art:'blastoise'},
 {id:'clean',title:'Unbroken team',desc:'Win a battle without a teammate fainting.',metric:'clean',target:1,reward:110,art:'gardevoir'},
 {id:'type',title:`${type[0].toUpperCase()+type.slice(1)} specialist`,desc:`Win with an eligible ${type}-type on your team.`,metric:'typeWin',type,target:1,reward:100,art:species},
 {id:'squad',title:'Full squad',desc:'Complete 2 battles with a team of 3.',metric:'size3',target:2,reward:80,art:'lucario'},
 {id:'species',title:'Partner spotlight',desc:`Win with ${SPECIES[species].name} on your team.`,metric:'speciesWin',species,target:1,reward:120,art:species},
 {id:'streak',title:'Keep the momentum',desc:'Win 2 eligible battles in a row today.',metric:'streak',target:2,reward:120,art:'sceptile'},
 // Raid wins are an optional weekly milestone, never an unavoidable daily requirement.
 ];
}
function missions(pid,date){return missionPool(pid,date).sort((a,b)=>hash(pid+date+a.id)-hash(pid+date+b.id)).slice(0,3).map(m=>({...m,progress:0,claimed:false}));}
export function freshWallet(pid,now){return {version:1,pid,balance:0,owned:[],equipped:{},history:[],receipts:{},wins:0,completed:0,day:null,week:null,lastNow:now};}
export function rollover(w,now){
 now=Math.max(now,w.lastNow||0);w.lastNow=now;
 const date=dayKey(now),week=weekKey(now);
 if(w.day?.key!==date)w.day={key:date,missions:missions(w.pid,date),bonus:false,firstWin:false,streak:0,count:0};
 if(w.week?.key!==week)w.week={key:week,wins:0,claimed:false,raid:false};
 return w;
}
function transaction(w,id,amount,reason,now){
 if(w.receipts[id])return false;
 if(!Number.isSafeInteger(amount)||!Number.isSafeInteger(w.balance+amount)||w.balance+amount<0)throw Error('Insufficient Chaos Coins.');
 w.balance+=amount;w.receipts[id]=1;w.history.unshift({id,amount,reason,at:now});w.history=w.history.slice(0,ECONOMY.history);return true;
}
export function progressMatch(w,s,now,{local=false}={}){
 rollover(w,now);
 // This function is called only by a completed local engine or the authoritative server.
 if(!s?.id||!['win','loss','draw'].includes(s.result)||!['ko','time','team-eliminated'].includes(s.reason)||w.receipts[`match:${s.id}`]||s.duration<ECONOMY.minSeconds)return false;
 const rows=Object.entries(s.species??{}).filter(([id])=>isPlayable(id));
 const sum=k=>rows.reduce((n,[,v])=>n+Math.max(0,Number(v[k])||0),0);
 if(sum('damage')<ECONOMY.minDamage||!rows.length||local&&w.day.count>=ECONOMY.localDailyMatches)return false;
 w.receipts[`match:${s.id}`]=1;w.day.count++;w.completed++;
 const win=s.result==='win',ids=(s.team??rows.map(([id])=>id)).filter(isPlayable);
 w.day.streak=win?w.day.streak+1:0;
 const metrics={wins:+win,ultimateHits:sum('ultimateHits'),reactions:sum('reactions'),clean:+(win&&sum('faints')===0),size3:+(ids.length===3),streak:w.day.streak};
 for(const m of w.day.missions){let n=m.metric==='typeWin'?+(win&&ids.some(id=>SPECIES[id].types.includes(m.type))):m.metric==='speciesWin'?+(win&&ids.includes(m.species)):metrics[m.metric]??0;
  m.progress=Math.min(m.target,m.metric==='streak'?Math.max(m.progress,n):m.progress+n);
 }
 if(win){w.wins++;w.week.wins++;if(!w.day.firstWin){transaction(w,`first:${w.day.key}`,ECONOMY.firstWin,'First victory of the day',now);w.day.firstWin=true;}
  if(ECONOMY.milestones[w.wins])transaction(w,`milestone:${w.wins}`,ECONOMY.milestones[w.wins],`${w.wins} lifetime victories`,now);
  if(s.mode==='raid'&&!w.week.raid){transaction(w,`raid:${w.week.key}`,100,'Weekly boss victory',now);w.week.raid=true;}
 }return true;
}
export function walletAction(w,op,id,now){
 rollover(w,now);
 if(op==='view')return w;
 if(op==='claim'){
  const m=w.day.missions.find(m=>m.id===id);
  if(!m||m.progress<m.target)throw Error('This mission is not complete.');
  transaction(w,`daily:${w.day.key}:${id}`,m.reward,m.title,now);m.claimed=true;
 }else if(op==='bonus'){
  if(!w.day.missions.every(m=>m.progress>=m.target))throw Error('Complete all three missions first.');
  transaction(w,`bonus:${w.day.key}`,ECONOMY.dailyBonus,'Daily board complete',now);w.day.bonus=true;
 }else if(op==='weekly'){
  if(w.week.wins<ECONOMY.weeklyWins)throw Error('Win five eligible battles this week.');
  transaction(w,`weekly:${w.week.key}`,ECONOMY.weeklyReward,'Weekly victory trail',now);w.week.claimed=true;
 }else if(op==='buy'){
  const item=itemById(id);if(!item)throw Error('Unknown cosmetic.');
  if(!w.owned.includes(id)){transaction(w,`purchase:${id}`,-item.price,`Purchased ${item.name}`,now);w.owned.push(id);}
 }else if(op==='equip'||op==='unequip'){
  const item=itemById(id);if(!item||!w.owned.includes(id))throw Error('You do not own this cosmetic.');
  if(op==='equip')w.equipped[item.kind]=id;else if(w.equipped[item.kind]===id)w.equipped[item.kind]=null;
 }else throw Error('Unknown wallet action.');
 return w;
}
export function walletView(w,now){rollover(w,now);const {receipts,...view}=w;return {...view,serverNow:now,resetAt:nextDaily(w.lastNow),weeklyResetAt:nextWeekly(w.lastNow)};}
export const walletLoadout=w=>Object.fromEntries(Object.entries(w?.equipped??{}).flatMap(([kind,id])=>{const item=itemById(id);return item?.kind===kind&&w.owned.includes(id)?[[kind,item]]:[];}));
