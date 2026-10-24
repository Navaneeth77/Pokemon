import { applyHit } from './combat.js';
import { sfx } from './audio.js';
export const BOSSES = {
  rayquaza: { name: 'Rayquaza', title: 'SOVEREIGN OF THE SKY', arena: 'mtSilver', type: 'dragon', color: '#75f5b1', attacks: ['circle', 'lanes', 'ring'] },
  mewtwo: { name: 'Mewtwo', title: 'THE GENETIC STORM', arena: 'indigo', type: 'psychic', color: '#e2a3ff', attacks: ['ring', 'circle', 'lanes'] },
  lugia: { name: 'Lugia', title: 'GUARDIAN OF THE TIDES', arena: 'seafoam', type: 'water', color: '#8fdbff', attacks: ['lanes', 'ring', 'circle'] },
};
export class BossEncounter {
  constructor(games, id) {
    this.games = games; this.id = id; this.def = BOSSES[id]; this.boss = games[0].opponent;
    this.time = 0; this.phase = 1; this.next = 2.5; this.sequence = 0; this.hazards = []; this.vulnerable = 0;
    const total = games.reduce((n,g)=>n+g.playerTeam.members.length,0);
    this.boss.species = { ...this.boss.species, hp: Math.round(this.boss.maxHp * (2.8 + total * 0.45)), weight: 100 };
    this.boss.hp = this.boss.maxHp; this.boss.boss = true;
    for (const g of games) { g.raid = this; g.foeCanMega = false; g.opponentTeam.members[0] = this.boss; g.link(); }
    this.bossUpdate = this.boss.update.bind(this.boss); this.boss.update = () => {};
    this.boss.launch = () => false;
  }
  tick(dt) {
    const active = this.games.filter(g => g.state === 'fighting');
    if (!active.length || !this.boss.alive) return;
    this.time += dt; this.vulnerable = Math.max(0, this.vulnerable-dt);
    const phase = this.boss.hp / this.boss.maxHp < .33 ? 3 : this.boss.hp / this.boss.maxHp < .66 ? 2 : 1;
    if (phase !== this.phase) { this.phase = phase; this.next = 2; for(const g of active) g.hud.showBanner(`PHASE ${phase}`, {color:this.def.color,life:1.3,size:22}); }
    this.boss.input.x = this.boss.input.y = 0;
    this.bossUpdate(dt, this.games[0]);
    this.boss.x = 180; this.boss.y = 245;
    this.boss.stagger = Math.min(this.boss.stagger, .12);
    this.boss.vx = this.boss.vy = 0;
    for (const h of this.hazards) {
      h.left -= dt;
      if (h.left > 0 || h.hit) continue;
      h.hit = true; this.vulnerable = 1.5;
      for (const g of active) {
        const p = g.player;
        const dist = Math.hypot(p.x-h.x,p.y-h.y);
        const hit = h.kind === 'ring' ? dist > 65 && dist < h.radius : h.kind === 'lanes' ? Math.abs(p.x-h.x)<h.radius : dist < h.radius;
        const before=p.hp;
        if (hit) applyHit(g, this.boss, p, {id:'boss-'+h.kind,name:h.label,type:h.type,cat:'special',power:100+this.phase*28,cooldown:5}, {knockback:50,stagger:.12});
        if(p.hp<before)g.netSend(p,{t:'boss-hit',damage:before-p.hp,x:p.x,y:p.y,z:p.bodyZ});
        g.shake(3,.2);
      }
    }
    this.hazards = this.hazards.filter(h=>h.left>-.35);
    if ((this.next -= dt) > 0) return;
    const kind = this.def.attacks[this.sequence++ % this.def.attacks.length];
    const target = active[(this.sequence-1)%active.length].player;
    const h = { kind, x:kind==='ring'?180:target.x, y:kind==='ring'?245:target.y, radius:kind==='ring'?255:kind==='lanes'?35:65+this.phase*6,
      left:1.5, duration:1.5, type:this.sequence%3===0?'electric':this.def.type, label:kind==='ring'?'ENTER THE SAFE EYE':kind==='lanes'?'LEAVE THE COLUMN':'MOVE OUT OF THE CIRCLE' };
    this.hazards.push(h); this.next = 4.5-this.phase*.45;
    for(const g of active) g.hud.callout('opponent',h.label);
    sfx.megaCharge();
  }
  snapshot() { return {id:this.id,phase:this.phase,hp:this.boss.hp,maxHp:this.boss.maxHp,vulnerable:this.vulnerable,hazards:this.hazards.map(({hit,...h})=>h)}; }
}
export function drawBoss(ctx, data) {
  if (!data || !BOSSES[data.id]) return;
  const def = BOSSES[data.id];
  ctx.save();
  for (const h of data.hazards) {
    ctx.strokeStyle = h.left > 0 ? '#ffe48a' : '#fff'; ctx.fillStyle = h.left > 0 ? '#ff5b4730' : '#ffffff70'; ctx.lineWidth=3;
    if (h.kind==='lanes') {ctx.fillRect(h.x-h.radius,130,h.radius*2,450);ctx.strokeRect(h.x-h.radius,130,h.radius*2,450);}
    else {ctx.beginPath();ctx.arc(h.x,h.y,h.radius,0,Math.PI*2);if(h.kind==='ring')ctx.arc(h.x,h.y,65,0,Math.PI*2,true);ctx.fill();ctx.stroke();}
  }
  ctx.fillStyle='#081222ed';ctx.fillRect(15,145,330,42);ctx.fillStyle='#27364b';ctx.fillRect(24,170,312,9);
  ctx.fillStyle=data.vulnerable>0?'#fff49a':def.color;ctx.fillRect(24,170,312*Math.max(0,data.hp/data.maxHp),9);
  ctx.textAlign='center';ctx.font='bold 11px "Pixelify Sans"';ctx.fillStyle='#fff';ctx.fillText(`${def.name.toUpperCase()} · PHASE ${data.phase} · ${Math.ceil(data.hp)}/${data.maxHp}`,180,160);
  if(data.vulnerable>0){ctx.fillStyle='#fff49a';ctx.fillText('VULNERABLE — STRIKE NOW',180,199);}
  ctx.restore();
}
