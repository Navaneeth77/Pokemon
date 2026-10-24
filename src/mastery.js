export const MASTERY_THRESHOLDS = [0,100,250,500,900,1500,2400,3600,5200,7500];
const KEY='msb.mastery';
const blank=()=>({version:1,species:{},matches:[],processed:[],arenas:{},moves:{}});
export function readMastery(storage=localStorage){try{const x=JSON.parse(storage.getItem(KEY));if(x?.version!==1||!x.species||typeof x.species!=='object'||Array.isArray(x.species)||!Array.isArray(x.processed)||!Array.isArray(x.matches))return blank();const clean=blank();clean.processed=x.processed.filter(v=>typeof v==='string').slice(-500);
 for(const [id,r] of Object.entries(x.species))if(r&&typeof r==='object'&&Number.isFinite(r.xp)&&Array.isArray(r.discovered))clean.species[id]=r;
 clean.matches=x.matches.filter(m=>m&&typeof m.result==='string'&&m.species&&typeof m.species==='object').slice(0,30);
 clean.arenas=x.arenas&&typeof x.arenas==='object'?x.arenas:{};clean.moves=x.moves&&typeof x.moves==='object'?x.moves:{};return clean;}catch{return blank();}}
export function level(xp){return MASTERY_THRESHOLDS.filter(n=>xp>=n).length;}
export function newSummary(game) {
 return {id:`local-${Date.now()}-${Math.random().toString(36).slice(2)}`,species:{player:{},opponent:{}},moves:{player:{},opponent:{}},arena:game.arenaId??'mtSilver'};
}
const row=()=>({damage:0,received:0,hits:0,kos:0,faints:0,ultimates:0,mega:0,switches:0,reactions:0,bossDamage:0,discovered:[]});
export function recordCombat(game,kind,actor,target,details={}) {
 if(game.practice || actor?.remote || !actor || !game.summary)return;
 const id=actor.baseSpecies.id,side=actor.side;
 const s=game.summary.species[side][id]??=row();
 if(kind==='hit') {
  s.damage+=details.damage;s.hits++;if(target?.boss)s.bossDamage+=details.damage;
  const t=game.summary.species[target.side][target.baseSpecies.id]??=row();t.received+=details.damage;
 } else if(kind==='reaction'){s.reactions++;if(!s.discovered.includes(details.reaction))s.discovered.push(details.reaction);}
 else if(kind==='move'){if(details.ultimate)s.ultimates++;game.summary.moves[side][details.id]=(game.summary.moves[side][details.id]??0)+1;}
 else if(kind==='faint'){s.faints++;if(target){const t=game.summary.species[target.side][target.baseSpecies.id]??=row();t.kos++;}}
 else if(kind==='mega')s.mega++;
 else if(kind==='switch')s.switches++;
}
export function resultSummary(game,side='player',extra={}) {
 return {id:game.summary.id,arena:game.summary.arena,duration:Math.round(game.time),species:game.summary.species[side],moves:game.summary.moves[side],mode:game.raid?'raid':'battle',...extra};
}
export function saveSummary(summary,storage=localStorage) {
 if(!summary?.id||!summary.species||!['win','loss','draw'].includes(summary.result))return false;
 const data=readMastery(storage);if(data.processed.includes(summary.id))return false;
 for(const [id,s] of Object.entries(summary.species)) {
  if(!/^[A-Za-z0-9]+$/.test(id))continue;
  const r=data.species[id]??={...row(),battles:0,wins:0,losses:0,xp:0,streak:0,bestStreak:0,raids:0,drafts:0,draftWins:0};
  r.battles++;if(summary.result==='win'){r.wins++;r.streak++;}else {if(summary.result==='loss')r.losses++;r.streak=0;}
  r.bestStreak=Math.max(r.bestStreak,r.streak);
  for(const key of ['damage','received','hits','kos','faints','ultimates','mega','switches','reactions','bossDamage'])r[key]=(r[key]??0)+Math.max(0,Math.min(1000000,Number(s[key])||0));
  r.discovered=[...new Set([...(r.discovered??[]),...(s.discovered??[])])].slice(0,16);
  r.xp+=Math.min(100,20+Math.floor((s.damage||0)/100)+(summary.result==='win'?30:0));
  if(summary.mode==='raid')r.raids++;if(summary.mode==='draft'){r.drafts++;if(summary.result==='win')r.draftWins++;}
 }
 data.arenas[summary.arena]=(data.arenas[summary.arena]??0)+1;
 for(const [id,n] of Object.entries(summary.moves??{}))data.moves[id]=(data.moves[id]??0)+n;
 data.processed.push(summary.id);data.processed=data.processed.slice(-500);
 data.matches.unshift(summary);data.matches=data.matches.slice(0,30);
 try{storage.setItem(KEY,JSON.stringify(data));return true;}catch{return false;}
}
