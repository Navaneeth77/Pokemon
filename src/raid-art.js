import { loadImage } from './assets.js';
import { quality } from './quality.js';
import { SHADOW_LUGIA, isShadowLugia } from './data/skins.js';

const images = new Map(), pending = new Map();
export function preloadRaidArt(id) {
  if (!['rayquaza', 'mewtwo', 'lugia'].includes(id)) return Promise.resolve();
  if (!pending.has(id)) pending.set(id, loadImage(`/art/raid-${id==='lugia'?'lugia-shadow':id}.png`).then(image => images.set(id, image)).catch(() => { pending.delete(id); }));
  return pending.get(id);
}

export function bossMouth(boss, toward) {
  const angle = toward ? Math.atan2(toward.y - boss.y, toward.x - boss.x) : Math.PI / 2 - boss.dir * Math.PI / 4;
  const mouth = boss.species.mouth ?? { fwd: boss.radius * .4, z: boss.species.headZ * .75 };
  // The imported Shadow Lugia sheet places its beak below the crown; use its mouth height.
  const height = (boss.boss ?? boss.species.megaOf ?? boss.species.id) === 'lugia' && !isShadowLugia(boss) ? boss.species.headZ + 4 * (boss.drawScale ?? 1) : mouth.z;
  return { x: boss.x + Math.cos(angle) * mouth.fwd, y: boss.y + Math.sin(angle) * mouth.fwd - height - boss.lift };
}

export function drawRaidSigil(ctx, id, x, y, size, time, alpha = 1, tilt = 1) {
  if (id !== 'mewtwo') return;
  drawRaidGroundAura(ctx, id, x, y, size, time, alpha, tilt);
}

// Species discs belong on the floor. Only Mewtwo also uses its sigil in the air.
export function drawRaidGroundAura(ctx, id, x, y, size, time, alpha = 1, tilt = .45) {
  const image = images.get(id);
  if (!image) return;
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, tilt); ctx.rotate(time * (id === 'mewtwo' ? -.8 : .55));
  ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  ctx.restore();
}

// Open gusts and spray gather around the body without a flat portal sprite.
export function drawNaturalCharge(ctx, boss, age, power = 1, focused = false, alpha = 1) {
  const shadow = isShadowLugia(boss), ray = (boss.boss ?? boss.species.megaOf ?? boss.species.id) === 'rayquaza', point = focused ? bossMouth(boss) : { x: boss.x, y: boss.y - boss.bodyZ };
  ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 1;
  const radius=focused?12+power*12:boss.radius*1.5,glow=ctx.createRadialGradient(point.x,point.y,0,point.x,point.y,radius);
  glow.addColorStop(0,`rgba(${ray?'155,255,209':shadow?'221,185,255':'191,235,255'},${power*.4*alpha})`);
  glow.addColorStop(.45,`rgba(${ray?'48,130,102':shadow?'102,43,160':'43,97,160'},${power*.18*alpha})`);
  glow.addColorStop(1,'rgba(40,80,120,0)');ctx.fillStyle=glow;ctx.fillRect(point.x-radius,point.y-radius,radius*2,radius*2);
  const count = quality().particles > 500 ? 8 : 4;
  for (let i = 0; i < count; i++) {
    const t = (age * 1.6 + i / count) % 1, side = i % 2 ? 1 : -1;
    const x = point.x + side * (8 + (1 - t) * boss.radius * 1.4), y = point.y + 34 - t * 76;
    ctx.globalAlpha = alpha * (.15 + .4 * power) * Math.sin(t * Math.PI);
    ctx.strokeStyle = ray ? '#c6d5d0' : shadow ? SHADOW_LUGIA.mist : '#c3e8f4';
    ctx.beginPath(); ctx.moveTo(x + side * 9, y + 14);
    ctx.quadraticCurveTo(x - side * 7, y + 4, x - side * 11, y - 22); ctx.stroke();
    if (!ray) {
      ctx.fillStyle = shadow ? SHADOW_LUGIA.mist : '#d3efff';
      ctx.fillRect(x - side * 11, y - 24, 1.5, 3 + power * 3);
    }
  }
  if (focused) {
    const r = 5 + 9 * power, glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, r);
    glow.addColorStop(0, `rgba(${shadow?'242,220,255':'230,248,255'},${alpha * .7})`);
    glow.addColorStop(.3, `rgba(${ray ? '120,224,177' : shadow ? SHADOW_LUGIA.rgb.join(',') : '135,203,240'},${alpha * .32})`);
    glow.addColorStop(1, 'rgba(160,220,245,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = glow; ctx.fillRect(point.x-r, point.y-r, r*2, r*2);
  }
  ctx.restore();
}

// A short, attached beam: the source follows the mouth instead of the floor or a stale position.
export class LegendaryBeam {
  constructor(boss, x, y, color, width = 20, life = .55, pulse = false) {
    if(isShadowLugia(boss))color=SHADOW_LUGIA.color;
    Object.assign(this, { boss, x, y, color, width, life, pulse, age: 0, layer: 'air' });
  }
  update(dt) { this.age += dt; return !this.dead && this.age < this.life && this.boss.alive && !this.boss.hidden; }
  draw(ctx) {
    const p = this.age / this.life, origin = bossMouth(this.boss, this), reveal = Math.min(1, this.age / .06);
    const x = origin.x + (this.x - origin.x) * reveal, y = origin.y + (this.y - origin.y) * reveal;
    const width = this.width * Math.min(1, this.age / .045) * Math.min(1, (1 - p) * 5);
    ctx.save(); const fade = Math.min(1, (1 - p) * 4);
    const id=this.boss.boss??this.boss.species.megaOf??this.boss.species.id;
    const core = id === 'rayquaza' ? '#d0ffe4' : id === 'lugia' ? (isShadowLugia(this.boss) ? SHADOW_LUGIA.core : '#c7efff') : '#e6caff';
    const dx = x - origin.x, dy = y - origin.y, distance = Math.hypot(dx, dy) || 1, nx = -dy / distance, ny = dx / distance;
    for (const [scale, color, alpha] of [[1.18, '#38214f', .35], [1, this.color, .8], [.55, core, .95], [.22, '#ffffff', 1]]) {
      const mouthWidth = Math.min(10, width * .22) * scale, endWidth = width * .5 * scale;
      ctx.globalAlpha = fade * alpha; ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(origin.x + nx * mouthWidth, origin.y + ny * mouthWidth);
      ctx.lineTo(x + nx * endWidth, y + ny * endWidth);
      ctx.lineTo(x - nx * endWidth, y - ny * endWidth);
      ctx.lineTo(origin.x - nx * mouthWidth, origin.y - ny * mouthWidth);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = fade;
    if (this.boss.boss !== 'mewtwo' && !this.pulse) {
      // Broken pressure trails follow the beam, rather than portal hoops at its mouth.
      ctx.strokeStyle = core; ctx.lineWidth = 1;
      const count = quality().particles > 500 ? 7 : 3;
      for (let i = 0; i < count; i++) {
        const t = (this.age * 2.4 + i / count) % 1, end = Math.min(1, t + .12);
        const offset = (i % 2 ? 1 : -1) * width * (.6 + .1 * Math.sin(this.age * 25 + i));
        ctx.globalAlpha = fade * Math.sin(t * Math.PI) * .75;
        ctx.beginPath(); ctx.moveTo(origin.x + dx * t + nx * offset, origin.y + dy * t + ny * offset);
        ctx.lineTo(origin.x + dx * end + nx * offset * 1.1, origin.y + dy * end + ny * offset * 1.1); ctx.stroke();
      }
      ctx.globalAlpha = fade;
    }
    if ((this.pulse || this.boss.boss === 'mewtwo') && quality().particles > 500) {
      ctx.strokeStyle = this.color; ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const t = (p * 2 + i / 4) % 1, cx = origin.x + dx * t, cy = origin.y + dy * t;
        ctx.beginPath(); ctx.ellipse(cx, cy, width * .8, width * .18, Math.atan2(dy, dx) + Math.PI / 2, 0, Math.PI * 2); ctx.stroke();
      }
    }
    drawRaidSigil(ctx, this.boss.boss, origin.x, origin.y, Math.min(44, 18 + width * .35), this.age * 5, .65);
    ctx.restore();
  }
}

// A focused psychic lance with travelling filaments, rather than flat crossed bars.
export class PsychicBeam {
  constructor(x,y,x2,y2,width=24,life=.65){Object.assign(this,{x,y,x2,y2,width,life,age:0,layer:'air'});}
  update(dt){this.age+=dt;return this.age<this.life;}
  draw(ctx){
    const p=this.age/this.life,fade=Math.min(1,this.age/.045,(1-p)*5),dx=this.x2-this.x,dy=this.y2-this.y,d=Math.hypot(dx,dy)||1;
    ctx.save();ctx.translate(this.x,this.y);ctx.rotate(Math.atan2(dy,dx));ctx.lineCap='round';
    const w=this.width*(.85+.08*Math.sin(this.age*43));
    const g=ctx.createLinearGradient(0,-w,0,w);
    for(const [at,c] of [[0,'rgba(131,56,208,0)'],[.3,'rgba(131,56,208,.12)'],[.5,'rgba(224,180,255,.5)'],[.7,'rgba(131,56,208,.12)'],[1,'rgba(131,56,208,0)']])g.addColorStop(at,c);
    ctx.globalAlpha=fade;ctx.fillStyle=g;ctx.fillRect(0,-w,d,w*2);
    for(const [line,color,alpha] of [[w*.28,'#9e61d7',.65],[w*.1,'#e9c9ff',.95],[1.2,'#fff2ff',1]]){
      ctx.lineWidth=line;ctx.strokeStyle=color;ctx.globalAlpha=fade*alpha;
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(d,0);ctx.stroke();
    }
    for(let i=0;i<(quality().particles>500?8:4);i++){
      const t=(this.age*2.2+i/8)%1,x=t*d,side=i%2?1:-1;
      ctx.globalAlpha=fade*Math.sin(t*Math.PI)*.65;ctx.strokeStyle=i%3?'#dcb1ff':'#ffffff';ctx.lineWidth=.8;
      ctx.beginPath();ctx.moveTo(x-24,side*w*.55);ctx.quadraticCurveTo(x,side*w*.9,x+32,side*w*.2);ctx.stroke();
    }
    ctx.restore();
  }
}

// Aeroblast is a rotating air tunnel. Water Pulse keeps its compact beam and pulse rings.
export class AeroblastBeam {
  constructor(boss,x,y,width=60,life=.8){Object.assign(this,{boss,x,y,width,life,age:0,layer:'air'});}
  update(dt){this.age+=dt;return this.age<this.life&&this.boss.alive&&!this.boss.hidden;}
  draw(ctx){
    const o=bossMouth(this.boss,this),dx=this.x-o.x,dy=this.y-o.y,d=Math.hypot(dx,dy)||1;
    const fade=Math.min(1,this.age/.06,(1-this.age/this.life)*5),length=d*Math.min(1,this.age/.12),shadow=isShadowLugia(this.boss);
    ctx.save();ctx.translate(o.x,o.y);ctx.rotate(Math.atan2(dy,dx));ctx.lineCap='round';
    const w=this.width*.5;
    const mist=ctx.createLinearGradient(0,-w,0,w);
    mist.addColorStop(0,'rgba(150,110,205,0)');mist.addColorStop(.35,shadow?'rgba(174,109,231,.25)':'rgba(163,207,226,.25)');mist.addColorStop(.5,shadow?'rgba(234,202,255,.45)':'rgba(228,248,255,.45)');mist.addColorStop(.65,shadow?'rgba(174,109,231,.25)':'rgba(163,207,226,.25)');mist.addColorStop(1,'rgba(150,110,205,0)');
    ctx.globalAlpha=fade;ctx.fillStyle=mist;ctx.beginPath();ctx.moveTo(0,-3);ctx.lineTo(length,-w);ctx.lineTo(length,w);ctx.lineTo(0,3);ctx.closePath();ctx.fill();
    // Only the near side of each rotating gust is bright. Broken arcs avoid a mesh.
    const count=quality().particles>500?6:3;
    for(let arm=0;arm<count;arm++){
      const phase=arm*2.399-this.age*20;
      for(let i=1;i<=64;i++){
        const t=i/64,prev=(i-1)/64,a=phase+t*12,pa=phase+prev*12;
        const visible=Math.max(0,Math.cos(a));if(visible<.15)continue;
        const r=4+Math.min(1,t*3)*w,pr=4+Math.min(1,prev*3)*w;
        for(const [line,alpha] of [[9,.12],[2,.45],[.75,.85]]){
          ctx.lineWidth=line;ctx.strokeStyle=line>4?(shadow?'#9958d5':'#8baeca'):(shadow?'#efdaff':'#f0fbff');
          ctx.globalAlpha=fade*alpha*visible*Math.sin(t*Math.PI);
          ctx.beginPath();ctx.moveTo(length*prev,Math.sin(pa)*pr);ctx.lineTo(length*t,Math.sin(a)*r);ctx.stroke();
        }
      }
    }
    for(const [line,alpha] of [[18,.15],[7,.4],[1.5,.9]]){
      ctx.lineWidth=line;ctx.strokeStyle=shadow?'#f1d8ff':'#f0fbff';ctx.globalAlpha=fade*alpha;
      ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(length*.3,-2,length*.6,3,length,0);ctx.stroke();
    }
    // Fast detached shear streaks show the direction of the blast.
    for(let i=0;i<14;i++){
      const t=(this.age*2.7+i/14)%1,x=t*length,y=Math.sin(i*9.1)*this.width*.7;
      ctx.globalAlpha=fade*Math.sin(t*Math.PI)*.6;ctx.strokeStyle=shadow?'#dfb5ff':'#dbf3ff';ctx.lineWidth=.8;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(Math.min(length,x+25),y*.96);ctx.stroke();
    }
    ctx.restore();
  }
}

export class RaidBurst {
  constructor(id, x, y, size = 90, z = 0) {
    Object.assign(this, { id, x, y, size, z, age: 0, life: .6, layer: 'air' });
  }
  update(dt) { this.age += dt; return this.age < this.life; }
  draw(ctx) {
    const p = this.age / this.life;
    drawRaidSigil(ctx, this.id, this.x, this.y - this.z, this.size * (.3 + Math.sin(Math.min(1, p * 2) * Math.PI / 2)), this.age * 2, 1 - p * p);
  }
}
