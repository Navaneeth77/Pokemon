import { CATALOG, ECONOMY, itemById } from './economy.js';
import { Ring } from './effects.js';
import { SPECIES } from './data/species.js';
import { AnimatedSprite } from './sprite.js';
import { drawBust, lookById } from './trainers.js';
import { drawCosmeticAura, CosmeticStarburst } from './economy-art.js';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const coin='<i class="chaos-coin" aria-hidden="true"></i>';
const labels={frame:'Frames',title:'Titles',aura:'Auras',effect:'Arrivals',pose:'Victory poses',ultimate:'Ultimate effects'};
const portrait=id=>`/sprites/${SPECIES[id].sprite}/portrait.png`;
export class EconomyUI {
 constructor(flow){this.flow=flow;this.client=flow.economy;this.category='all';this.selected=CATALOG[0].id;
  this.client.listeners.add(()=>this.updateCounters());
 }
 notify(message){let el=document.querySelector('.chaos-toast');if(!el){el=document.createElement('div');el.className='chaos-toast';el.setAttribute('role','status');document.body.append(el);}el.textContent=message;clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>el.remove(),2800);}
 mountCounter(){const menu=document.querySelector('#title-menu'),who=menu.querySelector('.tm-who');if(!who)return;
  const b=document.createElement('button');b.className='chaos-wallet-chip';b.title='Earn Chaos Coins from missions, first victories and milestones';b.innerHTML=`${coin}<b data-chaos-balance>0</b><small data-wallet-label></small>`;b.onclick=()=>this.open('missions');who.append(b);this.updateCounters();
 }
 updateCounters(){const w=this.client.wallet;document.querySelectorAll('[data-chaos-balance]').forEach(el=>{const next=String(w?.balance??0);if(el.textContent!==next){el.textContent=next;el.classList.remove('coin-gain');void el.offsetWidth;el.classList.add('coin-gain');}});
  document.querySelectorAll('[data-wallet-label]').forEach(el=>el.textContent=this.client.scope==='local'?'LOCAL COINS':this.client.connected?'ONLINE COINS':'CACHED · OFFLINE');
 }
 open(page='missions'){this.page=page;const c=this.client,w=c.view;
  const panel=this.flow.expansion.open('',`<div class="chaos-shell"><header class="chaos-header"><div><small class="chaos-eyebrow">CHAOS ARENA / TRAINER GUILD</small><h1>${page==='missions'?'DAILY MISSIONS':page==='collection'?'YOUR COLLECTION':'CHAOS SHOP'}</h1><p>${page==='missions'?'Three pursuits. One daily journey.':page==='collection'?'Your trophies. Your signature.':'Make your entrance unforgettable.'}</p></div><button class="chaos-wallet-chip" data-history title="Recent rewards and purchases">${coin}<b data-chaos-balance>${w?.balance??0}</b><small data-wallet-label></small></button></header>
  <nav class="chaos-nav" aria-label="Trainer guild"><button data-page="missions" ${page==='missions'?'aria-current="page"':''}>MISSION BOARD</button><button data-page="shop" ${page==='shop'?'aria-current="page"':''}>COSMETIC SHOP</button><button data-page="collection" ${page==='collection'?'aria-current="page"':''}>COLLECTION</button></nav>
  <div class="chaos-scope"><div><button data-scope="local" aria-pressed="${c.scope==='local'}">LOCAL JOURNEY</button><button data-scope="server" aria-pressed="${c.scope==='server'}">ONLINE JOURNEY</button></div><span>${c.scope==='local'?'This browser only · bot & solo raids · no transfers':c.connected?'Server-verified matches · anonymous browser wallet':'Server unavailable · cached wallet is read-only'}</span>${c.scope==='server'?'<button data-retry>REFRESH</button>':''}</div>
  <p class="chaos-feedback" role="status">${esc(c.error||c.localError||'')}</p><main class="chaos-content"></main><footer class="chaos-footer">COSMETICS ONLY · NO COMBAT ADVANTAGE <button data-close>RETURN TO GAME</button></footer></div>`);
  panel.classList.add('chaos-overlay');this.panel=panel;
  panel.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const scope=panel.querySelector('.shop-confirm')??panel,buttons=[...scope.querySelectorAll('button:not(:disabled),input,select')].filter(b=>b.offsetParent!==null);if(!buttons.length)return;
   const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  panel.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{this.category='all';this.open(b.dataset.page);});
  panel.querySelectorAll('[data-scope]').forEach(b=>b.onclick=async()=>{await c.select(b.dataset.scope);if(panel.isConnected)this.open(page);});
  panel.querySelector('[data-retry]')?.addEventListener('click',async()=>{await c.sync();if(panel.isConnected)this.open(page);});
  panel.querySelector('[data-close]').onclick=()=>{this.flow.expansion.close(false);this.flow.showTitleMenu();};
  panel.querySelector('[data-history]').onclick=()=>this.history();
  this.content=panel.querySelector('main');this.updateCounters();
  if(!w){this.content.innerHTML='<div class="chaos-empty"><h2>CONNECT YOUR JOURNEY</h2><p>The online wallet has not loaded. Refresh to contact the match server, or continue your Local Journey.</p></div>';return;}
  if(page==='missions')this.missions(w);else this.shop(w,page==='collection');
 }
 missions(w){
  const complete=w.day.missions.filter(m=>m.progress>=m.target).length;
  this.content.innerHTML=`<div class="mission-topline"><span>BOARD ${esc(w.day.key)} · UTC RESET</span><b data-reset></b></div><div class="mission-board">${w.day.missions.map((m,i)=>`<article class="mission-entry mission-${i} ${m.claimed?'claimed':m.progress>=m.target?'complete':''}"><div class="mission-art"><img src="${portrait(m.art)}" alt="${esc(SPECIES[m.art].name)}"><span>0${i+1}</span></div><div class="mission-copy"><small>${m.claimed?'SEALED & CLAIMED':m.progress>=m.target?'OBJECTIVE COMPLETE':m.progress?'IN PROGRESS':'DAILY PURSUIT'}</small><h2>${esc(m.title)}</h2><p>${esc(m.desc)}</p><div class="mission-progress"><span style="width:${m.progress/m.target*100}%"></span></div><div class="mission-tail"><b>${m.progress} / ${m.target}</b><strong>${coin}${m.reward}</strong><button class="px-btn ${m.progress>=m.target&&!m.claimed?'primary':''}" data-claim="${m.id}" ${m.claimed||m.progress<m.target?'disabled':''}>${m.claimed?'CLAIMED':m.progress>=m.target?'CLAIM REWARD':'IN PROGRESS'}</button></div></div></article>`).join('')}</div>
  <div class="mission-rewards"><article class="mission-bonus"><small>THE DAILY TRIPLE</small><h2>Finish the board</h2><div class="mission-seals" aria-label="${complete} of 3 missions complete">${[0,1,2].map(i=>`<i class="${i<complete?'lit':''}"></i>`).join('')}</div><p>Complete all three pursuits for a bonus.</p><strong>${coin}${ECONOMY.dailyBonus}</strong><button class="px-btn" data-bonus ${complete<3||w.day.bonus?'disabled':''}>${w.day.bonus?'BONUS CLAIMED':'CLAIM BONUS'}</button></article>
  <article class="mission-week"><small>WEEKLY VICTORY TRAIL</small><h2>Five victories. A greater prize.</h2><p>Win ${ECONOMY.weeklyWins} eligible battles this week. A first boss victory also grants 100 coins.</p><div class="mission-progress"><span style="width:${Math.min(1,w.week.wins/ECONOMY.weeklyWins)*100}%"></span></div><div class="mission-tail"><b>${Math.min(w.week.wins,5)} / 5</b><strong>${coin}${ECONOMY.weeklyReward}</strong><button class="px-btn" data-weekly ${w.week.wins<5||w.week.claimed?'disabled':''}>${w.week.claimed?'CLAIMED':'CLAIM WEEKLY'}</button></div><small data-week-reset></small></article></div>
  <p class="chaos-rules">First daily victory +${ECONOMY.firstWin} · milestones at 1, 10 and 25 wins. Eligible matches finish naturally, last at least ${ECONOMY.minSeconds}s and deal ${ECONOMY.minDamage}+ damage. ${this.client.scope==='local'?'Local progress counts up to 8 completed matches a day; practice and friend rooms do not count.':'Only completed server battles count. Forfeits, disconnects and cancelled matches do not count.'}</p>`;
  this.content.querySelectorAll('[data-claim]').forEach(b=>b.onclick=()=>this.act('claim',b.dataset.claim));
  this.content.querySelector('[data-bonus]').onclick=()=>this.act('bonus');this.content.querySelector('[data-weekly]').onclick=()=>this.act('weekly');
  const tick=()=>{const now=this.client.now(),format=t=>{const s=Math.max(0,Math.ceil(t/1000));return `${Math.floor(s/3600)}h ${Math.floor(s/60)%60}m ${s%60}s`;};
   this.panel.querySelector('[data-reset]').textContent=`RESETS IN ${format(w.resetAt-now)}`;
   this.panel.querySelector('[data-week-reset]').textContent=`Weekly reset in ${format(w.weeklyResetAt-now)}`;
   if(now>=w.resetAt){clearInterval(this.flow.expansion.timer);if(this.client.scope==='server')this.client.sync().then(()=>{if(this.panel.isConnected)this.open('missions');});else this.open('missions');}
  };tick();this.flow.expansion.timer=setInterval(tick,1000);
 }
 shop(w,collection){
  const items=collection?CATALOG.filter(i=>w.owned.includes(i.id)):CATALOG;
  const kinds=[...new Set(items.map(i=>i.kind))];if(this.category!=='all'&&!kinds.includes(this.category))this.category='all';
  const shown=items.filter(i=>this.category==='all'||i.kind===this.category);
  if(!shown.some(i=>i.id===this.selected))this.selected=shown[0]?.id;
  this.content.innerHTML=`<div class="shop-tabs" aria-label="Cosmetic categories"><button data-category="all" aria-pressed="${this.category==='all'}">${collection?'ALL OWNED':'FEATURED'}</button>${kinds.map(k=>`<button data-category="${k}" aria-pressed="${this.category===k}">${labels[k].toUpperCase()}</button>`).join('')}</div><div class="shop-layout"><div class="shop-gallery">${shown.map(i=>{const owned=w.owned.includes(i.id),equipped=w.equipped[i.kind]===i.id;return `<button class="shop-tile ${i.id===this.selected?'selected':''}" data-item="${i.id}" style="--item-color:${i.color}"><div class="item-symbol item-${i.kind}">${i.kind==='frame'?`<canvas width="24" height="24" data-frame-art aria-label="Trainer frame preview"></canvas>`:i.kind==='title'?`<b>${esc(i.name)}</b>`:`<img src="${portrait('charizard')}" alt="">`}</div><small>${i.rarity.toUpperCase()} · ${labels[i.kind].toUpperCase()}</small><b>${i.name}</b><span>${equipped?'EQUIPPED':owned?'OWNED':coin+i.price}</span></button>`;}).join('')||`<div class="chaos-empty"><img src="${portrait('dragonite')}" alt="Dragonite"><h2>Your collection starts here</h2><p>Earn coins on the mission board, then choose your first signature cosmetic.</p><button class="px-btn" data-browse>BROWSE THE SHOP</button></div>`}</div><aside class="shop-detail"></aside></div>`;
  this.content.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{this.category=b.dataset.category;this.shop(w,collection);});
  this.content.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>{this.selected=b.dataset.item;this.shop(w,collection);if(innerWidth<720)this.content.querySelector('.shop-detail').scrollIntoView({block:'start',behavior:'smooth'});});
  this.content.querySelector('[data-browse]')?.addEventListener('click',()=>this.open('shop'));
  this.content.querySelectorAll('[data-frame-art]').forEach(canvas=>canvas.getContext('2d').drawImage(drawBust(lookById(this.flow.save.look)),0,0));
  if(this.selected)this.detail(itemById(this.selected),w);
 }
 detail(item,w){const owned=w.owned.includes(item.id),equipped=w.equipped[item.kind]===item.id,short=Math.max(0,item.price-w.balance);
  const box=this.content.querySelector('.shop-detail');box.innerHTML=`<div class="shop-preview" style="--item-color:${item.color}"><span>LIVE COSMETIC PREVIEW</span><canvas width="240" height="190" aria-label="${esc(item.name)} preview"></canvas><small>${labels[item.kind].toUpperCase()}</small></div><div class="shop-description"><small>${item.rarity.toUpperCase()} / ${labels[item.kind].toUpperCase()}</small><h2>${item.name}</h2><p>${item.desc}</p><strong>${coin}${item.price}</strong><p class="ownership">${equipped?'CURRENTLY EQUIPPED':owned?'PERMANENTLY OWNED':short?`${short} more coins needed`:'READY TO COLLECT'}</p><button class="px-btn primary" data-purchase ${!owned&&short?'disabled':''}>${owned?equipped?'UNEQUIP':'EQUIP COSMETIC':'PURCHASE'}</button><small>Owned in your ${this.client.scope==='local'?'local browser save':'anonymous online wallet'}. No stat changes.</small></div>`;
  box.querySelector('[data-purchase]').onclick=()=>owned?this.act(equipped?'unequip':'equip',item.id):this.confirm(item,w);
  this.preview(box.querySelector('canvas'),item);
 }
 preview(canvas,item){const ctx=canvas.getContext('2d'),set=this.flow.game.sprites[item.id==='pose-roar'?'rayquaza':'charizard']??this.flow.game.sprites.charizard,sprite=new AnimatedSprite(set);sprite.play(item.kind==='pose'&&sprite.has(item.anim)?item.anim:'Idle',{loop:true,force:true});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,start=performance.now();let last=start;
  const actor={x:120,y:145,bodyZ:25},bust=drawBust(lookById(this.flow.save.look));
  const draw=now=>{if(!canvas.isConnected)return;const t=(now-start)/1000;ctx.clearRect(0,0,240,190);ctx.imageSmoothingEnabled=false;
   ctx.fillStyle='#111627';ctx.fillRect(0,0,240,190);ctx.fillStyle='#7480a0';for(let i=0;i<18;i++)ctx.fillRect((i*67)%240,14+(i*43)%145,1,1);
   ctx.strokeStyle='#313b55';ctx.beginPath();ctx.ellipse(120,148,69,21,0,0,Math.PI*2);ctx.stroke();
   if(item.kind==='frame'||item.kind==='title'){
    ctx.drawImage(bust,0,0,24,24,88,50,64,64);
    if(item.kind==='frame'){ctx.strokeStyle=item.color;ctx.lineWidth=3;ctx.strokeRect(83,45,74,74);for(const x of [80,155])for(const y of [42,117])ctx.fillRect(x,y,5,5);}
    ctx.fillStyle='#eef0fa';ctx.font='16px "Pixelify Sans"';ctx.textAlign='center';ctx.fillText(this.flow.save.name??'TRAINER',120,139);
    if(item.kind==='title'){ctx.fillStyle=item.color;ctx.font='14px "Pixelify Sans"';ctx.fillText(item.name,120,158);}
   }else{
    if(item.kind==='aura')drawCosmeticAura(ctx,120,146,item,t);
    sprite.update(Math.min(.05,(now-last)/1000));sprite.draw(ctx,120,145,0,{scale:item.id==='pose-roar'?1:2});
    if(item.kind==='ultimate'){const burst=new CosmeticStarburst(actor,item);burst.age=t%.75;burst.draw(ctx);}
    if(item.kind==='effect'){const ring=new Ring(120,145,{r0:8,r1:70,life:.8,color:item.color,width:4});ring.age=t%.8;ring.draw(ctx);}
   }last=now;if(!reduced)requestAnimationFrame(draw);
  };requestAnimationFrame(draw);
 }
 confirm(item,w){const overlay=document.createElement('div');overlay.className='shop-confirm';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Confirm cosmetic purchase');overlay.innerHTML=`<section><small>ADD TO YOUR COLLECTION</small><h2>${item.name}</h2><p>Price ${coin}<b>${item.price}</b></p><p>Balance ${w.balance} → <b>${w.balance-item.price}</b> coins</p><p>Permanent ownership in this ${this.client.scope==='local'?'local browser save':'anonymous online wallet'}. No real money.</p><button class="px-btn primary" data-confirm>CONFIRM PURCHASE</button><button class="px-btn" data-cancel>CANCEL</button></section>`;
  this.panel.append(overlay);overlay.querySelector('[data-cancel]').onclick=()=>overlay.remove();const b=overlay.querySelector('[data-confirm]');b.focus();b.onclick=()=>{b.disabled=true;b.textContent='PROCESSING…';this.act('buy',item.id);};
 }
 async act(op,id){try{const delta=await this.client.action(op,id);if(this.flow.screen==='title')this.flow.showTitleMenu();this.notify((op==='equip'||op==='unequip')?'Cosmetic loadout updated':op==='buy'?'Added to your collection':`${delta>0?`+${delta} Chaos Coins`:'Reward already claimed'}`);this.open(this.page);if(delta>0)this.rewardBurst(delta);
  }catch(e){this.panel.querySelector('.shop-confirm')?.remove();const status=this.panel.querySelector('.chaos-feedback');if(status)status.textContent=e.message;}
 }
 rewardBurst(delta){
  const el=this.panel.querySelector('[data-chaos-balance]'),to=this.client.wallet.balance,from=to-delta,start=performance.now();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const draw=now=>{if(!el.isConnected)return;const p=Math.min(1,(now-start)/500);el.textContent=String(Math.round(from+(to-from)*(1-(1-p)**3)));if(p<1)requestAnimationFrame(draw);};requestAnimationFrame(draw);
  const host=el.closest('button');for(let i=0;i<7;i++){const c=document.createElement('i');c.className='chaos-coin reward-spark';c.style.setProperty('--dx',`${(i-3)*14}px`);c.style.setProperty('--dy',`${-25-Math.sin(i)*15}px`);host.append(c);setTimeout(()=>c.remove(),700);}
 }
 history(){const w=this.client.wallet;const box=document.createElement('div');box.className='shop-confirm';box.innerHTML=`<section><h2>COIN CHRONICLE</h2><p>Rewards come from missions, first victories and milestones. Cosmetics never change combat stats.</p><ol class="coin-history">${w?.history?.map(t=>`<li><span>${esc(t.reason)}<small>${new Date(t.at).toISOString().slice(0,16).replace('T',' ')} UTC</small></span><b class="${t.amount>0?'positive':''}">${t.amount>0?'+':''}${t.amount}</b></li>`).join('')||'<li>No transactions yet. Your first victory begins the journey.</li>'}</ol><button class="px-btn">BACK</button></section>`;this.panel.append(box);box.querySelector('button').onclick=()=>box.remove();}
}
