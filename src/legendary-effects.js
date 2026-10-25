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

// A tapered column with a bright core and travelling pressure contours, anchored to its impact.
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
    for(const [scale,color,alpha] of [[1.5,this.water?'#5689c5':'#4da583',.18],[1,this.water?'#84d7f8':'#8dffc4',.55],[.4,'#e3fff6',.8],[.12,'#ffffff',1]]){
      ctx.globalAlpha=fade*alpha;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-w*scale*.5,0);ctx.lineTo(-w*scale*.12,-h);ctx.lineTo(w*scale*.12,-h);ctx.lineTo(w*scale*.5,0);ctx.closePath();ctx.fill();
    }
    ctx.strokeStyle=this.water?'#dcf6ff':'#c4ffe3';ctx.lineWidth=1;
    const count=quality().particles>500?4:2;
    for(let i=0;i<count;i++){
      const t=(p*2+i/count)%1;ctx.globalAlpha=fade*Math.sin(t*Math.PI)*.8;
      ctx.beginPath();ctx.ellipse(0,-h*t,w*(.65-.4*t),w*.12,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  }
}

// The hazard's actual footprint, sustained through the release. The safe center
// (or cataclysm shelters) is cut out of the storm, never painted over by the blast.
export class RaidAreaBurst {
  constructor(id,hazard,rgb) {
    Object.assign(this,{id,hazard:{...hazard,safe:hazard.safe?.map(p=>[...p])},rgb,age:0,life:1.15,layer:'air'});
  }
  update(dt){this.age+=dt;return this.age<this.life;}
  draw(ctx){
    const h=this.hazard,p=this.age/this.life,fade=Math.min(1,this.age/.06,(1-p)*3);
    const inner=h.s==='ring'?h.r0:20,outer=h.s==='ring'?h.r:520;
    const water=this.id==='lugia',psy=this.id==='mewtwo',rgb=this.rgb.join(',');
    const core=water?'#edceff':psy?'#f8dcff':'#dcfff1';
    ctx.save();
    ctx.beginPath();
    if(h.s==='ring') {ctx.arc(h.x,h.y,h.r,0,Math.PI*2);ctx.moveTo(h.x+h.r0,h.y);ctx.arc(h.x,h.y,h.r0,0,Math.PI*2,true);}
    else {ctx.rect(0,100,360,540);for(const [x,y,r] of h.safe??[]){ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,Math.PI*2,true);}}
    ctx.clip('evenodd');
    const haze=ctx.createRadialGradient(h.x,h.y,inner,h.x,h.y,outer);
    haze.addColorStop(0,`rgba(${rgb},.04)`);haze.addColorStop(.5,`rgba(${rgb},.25)`);haze.addColorStop(1,`rgba(${rgb},.08)`);
    ctx.globalAlpha=fade;ctx.fillStyle=haze;ctx.fillRect(0,100,360,540);
    ctx.lineCap='round';
    // Several moving pressure fronts, not a single one-frame floor ring.
    for(let i=0;i<4;i++){
      const t=(p*1.4+i/4)%1,r=inner+t*(outer-inner);
      ctx.globalAlpha=fade*Math.sin(t*Math.PI)*.85;
      for(const [w,color] of [[13,`rgba(${rgb},.22)`],[4,core]]){
        ctx.strokeStyle=color;ctx.lineWidth=w;ctx.beginPath();
        for(let side=0;side<3;side++){
          const a=side*Math.PI*2/3+this.age*(psy?-1.4:.6);
          ctx.moveTo(h.x+Math.cos(a)*r,h.y+Math.sin(a)*r);ctx.arc(h.x,h.y,r,a,a+1.5);
        }
        ctx.stroke();
      }
    }
    // Airborne gusts, shadow spray or telekinetic shards fill the unsafe field.
    const count=quality().particles>500?54:24;
    for(let i=0;i<count;i++){
      const x=(i*97.31)%360,y=120+(i*71.67)%500,t=(p*1.8+i*.137)%1;
      const lift=Math.sin(t*Math.PI)*(psy?60:25),length=18+(i%4)*7;
      ctx.globalAlpha=fade*Math.sin(t*Math.PI)*.7;ctx.strokeStyle=core;ctx.lineWidth=water?2:1.5;
      ctx.beginPath();ctx.moveTo(x-length*.5,y-lift);
      ctx.bezierCurveTo(x-length*.2,y-lift-13,x+length*.3,y-lift+7,x+length*.5,y-lift-8);ctx.stroke();
      if(psy){
        ctx.fillStyle=`rgb(${rgb})`;ctx.beginPath();ctx.moveTo(x,y-lift-12);ctx.lineTo(x+3,y-lift);ctx.lineTo(x-2,y-lift+5);ctx.closePath();ctx.fill();
      } else if(water){ctx.fillStyle=core;ctx.fillRect(x,y-lift-15,1.5,5);}
    }
    ctx.restore();
    // Keep the exact safe boundary legible after the warning overlay disappears.
    ctx.save();ctx.globalAlpha=fade*.85;ctx.strokeStyle='#aaffd1';ctx.lineWidth=2;
    for(const [x,y,r] of h.s==='ring'?[[h.x,h.y,h.r0]]:h.safe??[]){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }
}
