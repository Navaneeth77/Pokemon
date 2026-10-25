import { EVOLUTION_DATA } from './evolution-data.js';
const key=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const byKey=new Map(EVOLUTION_DATA.map(r=>[key(r[1]),r]));
// These evolution edges apply only to Galarian forms, not the Kanto forms shipped here.
const regionalOnly=new Set(['sirfetchd','mr-rime']);
const children=new Map();
for(const row of EVOLUTION_DATA)if(row[2]&&!regionalOnly.has(row[1])){
 const list=children.get(row[2])??[];list.push(row);children.set(row[2],list);
}
export const evolutionRow=id=>byKey.get(key(id));
export const isFinalSpecies=id=>{const row=evolutionRow(id);return !!row&&!children.has(row[0]);};
export function finalDescendants(id){
 const row=evolutionRow(id);if(!row)return [];
 const visit=r=>children.has(r[0])?children.get(r[0]).flatMap(visit):[key(r[1])];return visit(row);
}
