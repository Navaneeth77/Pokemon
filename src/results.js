import { MOVES } from './moves.js';
import { SPECIES } from './data/species.js';
import { matchXP } from './mastery.js';
const esc = value => String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
export function summaryHtml(summary) {
  if (!summary) return '';
  const rows=Object.entries(summary.species??{}).filter(([id])=>SPECIES[id]);
  const sum=k=>Math.round(rows.reduce((n,[,s])=>n+(s[k]??0),0));
  const survivors=(summary.survivors??[]).filter(m=>SPECIES[m.id]);
  return `<section class="result-summary"><p>${summary.duration??0}s · ${sum('damage').toLocaleString()} dealt · ${sum('received').toLocaleString()} received<br>${sum('kos')} KOs · ${sum('faints')} faints · ${sum('switches')} switches<br>${sum('ultimates')} ultimates · ${sum('mega')} Megas · ${sum('reactions')} reactions</p>
    <p>Moves: ${Object.entries(summary.moves??{}).map(([id,n])=>`${esc(MOVES[id]?.name??id)} ×${n}`).join(' · ')||'None recorded'}</p><h3>SURVIVING TEAM</h3><div class="result-survivors">${survivors.map(m=>`<span><img loading="lazy" width="32" height="32" src="/sprites/${SPECIES[m.id].sprite}/portrait.png" alt="${esc(SPECIES[m.id].name)}">${esc(SPECIES[m.id].name)} · ${m.hp}/${m.maxHp}</span>`).join('')||'No surviving Pokémon'}</div>
    <h3>MASTERY EARNED</h3><p>${rows.map(([id,s])=>`${SPECIES[id].name} +${matchXP(s,summary.result)} XP`).join(' · ')||'No progression for this result'}</p></section>`;
}
