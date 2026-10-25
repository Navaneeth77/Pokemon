import { quality } from './quality.js';
import { drawNaturalCharge } from './raid-art.js';

export const skyLegend = mon => ['rayquaza', 'lugia'].includes(mon?.boss ?? mon?.species?.megaOf ?? mon?.species?.id);
const point = actor => ({ x: actor.x, y: actor.y - (actor.bodyZ ?? actor.z ?? 0) });

export class CastEnergy {
  constructor(actor,life,focused=false){Object.assign(this,{actor,life,focused,age:0,layer:'air'});}
  update(dt){this.age+=dt;return this.age<this.life&&!this.actor.hidden&&this.actor.alive;}
  draw(ctx){drawNaturalCharge(ctx,this.actor,this.age,Math.min(1,this.age/this.life),this.focused);}
}

// A short history of the actual moving body/projectile. No repeated creature sprites or portals.
export class Slipstream {
  constructor(actor, life = .5, color = '#b9f7de', width = 16) {
    Object.assign(this, { actor, life, color, width, age: 0, layer: 'air', points: [point(actor)] });
  }
  update(dt) {
    this.age += dt;
    if (this.age >= this.life) return false;
    const p = point(this.actor), last = this.points.at(-1);
    if (!this.actor.dead && !this.actor.hidden && (!last || Math.hypot(p.x-last.x, p.y-last.y) > 1)) this.points.push({ ...p, at: this.age });
    this.points = this.points.filter(p => this.age - (p.at ?? 0) < .18).slice(-12);
    return true;
  }
  draw(ctx) {
    if (this.points.length < 2) return;
    const fade = Math.min(1, (this.life-this.age)*8), n = this.points.length;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [scale, color, alpha] of [[1, this.color, .2], [.45, this.color, .65], [.12, '#ffffff', .95]]) {
      for (let i=1;i<n;i++) {
        const a=this.points[i-1], b=this.points[i];
        ctx.globalAlpha=fade*alpha*i/n; ctx.strokeStyle=color; ctx.lineWidth=this.width*scale*i/n;
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      }
    }
    // Thin boundary trails sell the air displaced around the moving body.
    const a=this.points[0],b=this.points[n-1],d=Math.hypot(b.x-a.x,b.y-a.y)||1;
    ctx.lineWidth=1;ctx.strokeStyle='#e5fbff';ctx.globalAlpha=fade*.6;
    for (const side of [-1,1]) {
      const nx=-(b.y-a.y)/d*this.width*.65*side,ny=(b.x-a.x)/d*this.width*.65*side;
      ctx.beginPath();ctx.moveTo(a.x+nx*.4,a.y+ny*.4);ctx.quadraticCurveTo((a.x+b.x)/2+nx,(a.y+b.y)/2+ny,b.x+nx,b.y+ny);ctx.stroke();
    }
    ctx.restore();
  }
}

// Layered, broken fronts: dust on land, spray over water, pressure in the air.
export class PressureWave {
  constructor(x,y,radius=90,kind='air',z=0,theme=null) {
    Object.assign(this,{x,y,radius,kind,z,theme,age:0,life:.65,layer:z?'air':'ground'});
  }
  update(dt){this.age+=dt;return this.age<this.life;}
  draw(ctx){
    const p=this.age/this.life,r=this.radius*(1-(1-p)**2),water=this.kind==='water',rock=this.kind==='rock';
    const count=quality().particles>500?18:9,tilt=this.z?1:.55;
    ctx.save();ctx.translate(this.x,this.y-this.z);ctx.scale(1,tilt);
    const glow=ctx.createRadialGradient(0,0,r*.65,0,0,Math.max(1,r*1.1));
    glow.addColorStop(0,'rgba(140,210,230,0)');glow.addColorStop(.65,this.theme?`rgba(${this.theme.rgb.join(',')},.22)`:water?'rgba(132,216,255,.22)':rock?'rgba(206,189,170,.18)':'rgba(191,249,232,.2)');glow.addColorStop(1,'rgba(140,210,230,0)');
    ctx.globalAlpha=1-p;ctx.fillStyle=glow;ctx.fillRect(-r*1.1,-r*1.1,r*2.2,r*2.2);
    for(let i=0;i<count;i++){
      const a=i/count*Math.PI*2,rr=r*(.94+.06*Math.sin(i*7.1)),x=Math.cos(a)*rr,y=Math.sin(a)*rr;
      ctx.globalAlpha=(1-p)*(.45+.35*Math.sin(i*2.4)**2);
      ctx.strokeStyle=this.theme?.mist??(water?'#e1f8ff':rock?'#c5bcae':'#e4fff3');ctx.lineWidth=water?3:1.5;
      ctx.beginPath();ctx.arc(0,0,rr,a,a+Math.PI/count*.8);ctx.stroke();
      if(water||rock){
        const lift=Math.sin(p*Math.PI)*(water?25:13)*(1+Math.sin(i*4)**2);
        ctx.fillStyle=this.theme?.mist??(water?'#e1f8ff':i%2?'#74727c':'#aba1a3');
        ctx.fillRect(x,y-lift,water?2:3,water?5:3);
      }
    }
    ctx.restore();
  }
}

// Separate wind funnels or water spouts, anchored to their impacts.
export class ElementColumn {
  constructor(x,y,height=260,width=30,water=false,life=.6,theme=null){
    Object.assign(this,{x,y,height,width,water,life,theme,age:0,layer:'air'});
  }
  update(dt){this.age+=dt;return this.age<this.life;}
  draw(ctx){
    const p=this.age/this.life,fade=Math.min(1,p*8,(1-p)*4),h=this.height*Math.min(1,p*7),w=this.width;
    ctx.save();ctx.translate(this.x,this.y);
    if(this.water){
      const body=ctx.createLinearGradient(0,0,0,-h);
      body.addColorStop(0,this.theme?'rgba(223,185,255,.8)':'rgba(193,239,255,.8)');body.addColorStop(.5,this.theme?'rgba(150,70,226,.65)':'rgba(70,171,226,.65)');body.addColorStop(1,this.theme?'rgba(226,176,255,.2)':'rgba(176,235,255,.2)');
      ctx.globalAlpha=fade;ctx.fillStyle=body;ctx.beginPath();ctx.moveTo(-w*.15,0);
      ctx.bezierCurveTo(-w*.2,-h*.45,-w*.7,-h*.85,-w*.1,-h);
      ctx.quadraticCurveTo(w*.65,-h*.85,w*.15,0);ctx.closePath();ctx.fill();
      const count=quality().particles>500?9:4;
      for(let i=0;i<count;i++){
        const phase=(p*2+i/count)%1,side=i%2?1:-1,offset=side*w*(.12+.25*Math.sin(i*4)**2);
        ctx.globalAlpha=fade*(.4+.4*Math.sin(phase*Math.PI));ctx.strokeStyle=i%3?(this.theme?.mist??'#b9edff'):'#ffffff';ctx.lineWidth=i%3?1:2;
        const y=-h*phase;ctx.beginPath();ctx.moveTo(offset*phase,y);
        ctx.quadraticCurveTo(offset*phase*1.2+Math.sin(p*20+i)*3,y-h*.1,offset*(phase+.12),y-h*.2);ctx.stroke();
        ctx.globalAlpha=fade*(1-phase);ctx.fillStyle=this.theme?.core??'#e2faff';
        ctx.fillRect(offset*(1+phase*2),-h+phase*phase*60,2,4);
      }
      ctx.restore();return;
    }
    // A translucent funnel, with broken front-facing gusts instead of a wire cage.
    const mist=ctx.createLinearGradient(-w,0,w,0);
    mist.addColorStop(0,'rgba(165,185,176,0)');mist.addColorStop(.4,'rgba(165,185,176,.2)');mist.addColorStop(.6,'rgba(207,220,210,.26)');mist.addColorStop(1,'rgba(165,185,176,0)');
    ctx.globalAlpha=fade;ctx.fillStyle=mist;ctx.beginPath();
    for(const side of [-1,1])for(let j=0;j<=24;j++){
      const t=side<0?j/24:1-j/24,x=Math.sin(t*5+this.age*5)*w*.12+side*w*(.17+.7*t*t),y=-h*t;
      if(side<0&&j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }ctx.closePath();ctx.fill();
    const count=quality().particles>500?5:3;
    for(let strand=0;strand<count;strand++){
      const phase=strand/count*Math.PI*2-this.age*16;
      for(let j=1;j<=36;j++){
        const t=j/36,prev=(j-1)/36,a=phase+t*11,pa=phase+prev*11;
        const visibility=Math.max(0,Math.sin(a));if(visibility<.15)continue;
        const r=w*(.17+.7*t*t),pr=w*(.17+.7*prev*prev);
        const x=Math.cos(a)*r+Math.sin(t*5+this.age*5)*w*.12,y=-h*t;
        const px=Math.cos(pa)*pr+Math.sin(prev*5+this.age*5)*w*.12,py=-h*prev;
        for(const [line,alpha] of [[5,.1],[1.1,.75]]){
          ctx.globalAlpha=fade*visibility*alpha*Math.sin(t*Math.PI);ctx.strokeStyle=line>2?'#b6c9be':'#e5eee9';ctx.lineWidth=line;
          ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x,y);ctx.stroke();
        }
      }
    }
    for(let i=0;i<12;i++){
      const t=(this.age*1.3+i/12)%1,a=i*2.4-this.age*11,r=w*(.3+.65*t);
      ctx.globalAlpha=fade*Math.sin(t*Math.PI)*.7;ctx.fillStyle=i%3?'#c1d0c4':'#687c70';
      ctx.fillRect(Math.cos(a)*r,-h*t+Math.sin(a)*r*.2,1+i%2,2);
    }
    ctx.restore();
  }
}

// Gathering energy rises along the future safe boundary; the actor stays anchored.
export class NovaGather {
  constructor(boss,hazard,rgb,life){Object.assign(this,{boss,hazard,rgb,life,age:0,layer:'air'});}
  update(dt){this.age+=dt;return this.age<this.life&&this.boss.alive;}
  draw(ctx){
    const h=this.hazard,p=Math.min(1,this.age/this.life),r=h.r0??60,rgb=this.rgb.join(',');
    ctx.save();ctx.lineCap='round';
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8+this.age*.25,x=h.x+Math.cos(a)*r,y=h.y+Math.sin(a)*r;
      const phase=(this.age*1.2+i/16)%1,lift=phase*(16+36*p);
      ctx.globalAlpha=Math.sin(phase*Math.PI)*p*.7;ctx.strokeStyle=`rgb(${rgb})`;ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+Math.cos(a+.5)*9,y-lift*.5,x+Math.cos(a)*3,y-lift);ctx.stroke();
      ctx.strokeStyle='#ecf5ff';ctx.lineWidth=.6;ctx.stroke();
    }
    ctx.restore();
  }
}

// Broken streams of mist spiral around the calm eye; no creatures, emblems or
// closed glowing rings. The staggered streaks keep turning as the gale expands.
function windVortex(ctx,h,inner,r,age,opacity){
  const streams=quality().particles>500?8:4;
  for(let arm=0;arm<streams;arm++){
    const phase=arm/streams*Math.PI*2-age*4.2,points=[];
    for(let i=0;i<=32;i++){
      const t=i/32,a=phase+t*3.5,rr=inner+9+(r-inner)*t;
      const ripple=Math.sin(t*17+age*9+arm)*3;
      points.push({x:h.x+Math.cos(a)*(rr+ripple),y:h.y+Math.sin(a)*(rr+ripple),t});
    }
    for(const [width,color,alpha] of [[29,'#a8c8c3',.09],[10,'#d6e8e3',.21],[1.4,'#f0f8f4',.78]]){
      ctx.strokeStyle=color;
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],taper=Math.sin(b.t*Math.PI);
        ctx.globalAlpha=opacity*alpha*taper;ctx.lineWidth=width*(.2+.8*taper);
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      }
    }
    // Short displaced air filaments travel with each spiral instead of outlining a shape.
    for(let j=0;j<3;j++){
      const i=5+((Math.floor(age*24)+arm*5+j*8)%23),a=points[i],b=points[Math.min(32,i+3)];
      ctx.globalAlpha=opacity*.4;ctx.strokeStyle='#e3f0ec';ctx.lineWidth=.65;
      ctx.beginPath();ctx.moveTo(a.x+4,a.y-5);ctx.quadraticCurveTo((a.x+b.x)/2+6,(a.y+b.y)/2-7,b.x+3,b.y-4);ctx.stroke();
    }
  }
}

// Coherent travelling pressure shells with a bright core, translucent wake and
// ballistic spray/debris. All layers are clipped out of the hazard's safe spaces.
export class RaidAreaBurst {
  constructor(id,hazard,rgb) {
    Object.assign(this,{id,hazard:{...hazard,safe:hazard.safe?.map(p=>[...p])},rgb,age:0,life:1.55,layer:'air'});
    const inner=hazard.s==='ring'?hazard.r0:20,outer=hazard.s==='ring'?hazard.r:520;
    this.fragments=Array.from({length:quality().particles>500?84:36},(_,i)=>({
      a:i*2.399963,r:inner+12+((i*73.17)%(outer-inner-18)),v:40+(i%7)*12,vz:80+(i%5)*21,size:1.3+i%3,seed:i,
    }));
  }
  update(dt){this.age+=dt;return this.age<this.life;}
  draw(ctx){
    const h=this.hazard,p=this.age/this.life,fade=Math.min(1,this.age/.035,(1-p)*3);
    const inner=h.s==='ring'?h.r0:20,outer=h.s==='ring'?h.r:520;
    const water=this.id==='lugia',psy=this.id==='mewtwo',rgb=this.rgb.join(',');
    const core=water?'#f1dfff':psy?'#fbe7ff':'#e4fff5';
    ctx.save();ctx.beginPath();
    if(h.s==='ring'){ctx.arc(h.x,h.y,h.r,0,Math.PI*2);ctx.moveTo(h.x+h.r0,h.y);ctx.arc(h.x,h.y,h.r0,0,Math.PI*2,true);}
    else {ctx.rect(0,100,360,540);for(const [x,y,r] of h.safe??[]){ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,Math.PI*2,true);}}
    ctx.clip('evenodd');ctx.lineCap='round';
    const progress=Math.min(1,this.age/.72),front=inner+(outer-inner)*(1-(1-progress)**1.5);
    const haze=ctx.createRadialGradient(h.x,h.y,inner,h.x,h.y,Math.max(inner+1,front));
    const mist=this.id==='rayquaza'?'169,199,191':rgb;
    haze.addColorStop(0,`rgba(${mist},0)`);haze.addColorStop(.6,`rgba(${mist},.04)`);haze.addColorStop(1,`rgba(${mist},.16)`);
    ctx.globalAlpha=fade;ctx.fillStyle=haze;ctx.fillRect(0,100,360,540);
    const segments=quality().particles>500?96:40;
    for(const [delay,strength] of [[0,1],[.16,.52]]){
      const age=this.age-delay;if(age<0||age>1.12)continue;
      const q=Math.min(1,age/.72),r=inner+(outer-inner)*(1-(1-q)**1.5),opacity=Math.min(1,age/.045)*(1-Math.max(0,age-.65)/.47)*strength;
      if(this.id==='rayquaza'){if(delay===0)windVortex(ctx,h,inner,r,age,opacity);continue;}
      const width=water?22:psy?15:26;
      const band=ctx.createRadialGradient(h.x,h.y,Math.max(inner,r-width),h.x,h.y,r+width*.4);
      band.addColorStop(0,`rgba(${rgb},0)`);band.addColorStop(.58,`rgba(${rgb},.18)`);band.addColorStop(.84,`rgba(${rgb},.65)`);band.addColorStop(1,`rgba(${rgb},0)`);
      ctx.globalAlpha=opacity;ctx.fillStyle=band;ctx.beginPath();ctx.arc(h.x,h.y,r+width*.4,0,Math.PI*2);ctx.fill();
      // The same core / body / glow separation as Dragon Pulse, with turbulent edges.
      for(const [line,color,alpha] of [[8,`rgb(${rgb})`,.2],[3,core,.7],[.9,'#ffffff',.9]]){
        ctx.lineWidth=line;ctx.strokeStyle=color;ctx.globalAlpha=opacity*alpha;ctx.beginPath();
        for(let i=0;i<=segments;i++){
          const a=i/segments*Math.PI*2,noise=Math.sin(a*11-age*16)*3+Math.sin(a*23+age*13)*1.5;
          const x=h.x+Math.cos(a)*(r+noise),y=h.y+Math.sin(a)*(r+noise)-(water?Math.sin(a*8+age*8)*3:0);
          if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
        }ctx.stroke();
      }
    }
    for(const f of this.fragments){
      const start=(f.r-inner)/(outer-inner)*.52,t=this.age-start;if(t<0||t>.9)continue;
      const a=f.a+(psy?t*.7:this.id==='rayquaza'?-t*3:0),r=f.r+f.v*t,z=Math.max(0,f.vz*t-125*t*t),x=h.x+Math.cos(a)*r,y=h.y+Math.sin(a)*r-z;
      ctx.globalAlpha=fade*Math.min(1,t*12)*(1-t/.9);
      if(psy){
        ctx.save();ctx.translate(x,y);ctx.rotate(t*3+f.seed);ctx.fillStyle='#514762';ctx.strokeStyle=core;ctx.lineWidth=.6;
        ctx.beginPath();ctx.moveTo(-f.size*2,0);ctx.lineTo(-f.size,-f.size*2);ctx.lineTo(f.size*1.5,-f.size);ctx.lineTo(f.size*2,f.size);ctx.lineTo(0,f.size*1.6);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
      }else{
        const length=water?5+f.size*2:14+f.size*6,dx=Math.cos(a)*length,dy=Math.sin(a)*length*.5;
        ctx.strokeStyle=`rgba(${rgb},.5)`;ctx.lineWidth=water?f.size:2;ctx.beginPath();ctx.moveTo(x-dx,y-dy+7);ctx.quadraticCurveTo(x-dx*.5,y-dy*.5-4,x,y);ctx.stroke();
        ctx.strokeStyle=core;ctx.lineWidth=water?1: .7;ctx.beginPath();ctx.moveTo(x-dx*.5,y-dy*.5);ctx.lineTo(x,y);ctx.stroke();
        if(water){ctx.fillStyle=core;ctx.fillRect(x,y,1.5,2.5);}
      }
    }
    ctx.restore();
    ctx.save();ctx.globalAlpha=fade*.8;ctx.strokeStyle='#aaffd1';ctx.lineWidth=2;
    for(const [x,y,r] of h.s==='ring'?[[h.x,h.y,h.r0]]:h.safe??[]){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }
}
