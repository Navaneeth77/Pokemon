export function drawCosmeticAura(ctx,x,y,item,time=0){
 if(!item)return;ctx.save();ctx.translate(x,y);ctx.scale(1,.42);ctx.lineCap='round';
 const jade=item.id==='aura-jade';
 for(let i=0;i<6;i++){const a=time*(jade?2:-1)+i*Math.PI/3,r=25+Math.sin(time*3+i)*3;
  ctx.globalAlpha=.45;ctx.strokeStyle=item.color;ctx.lineWidth=jade?2:1;
  ctx.beginPath();ctx.arc(0,0,r,a,a+(jade?.65:.2));ctx.stroke();
  if(!jade){ctx.globalAlpha=.8;ctx.fillStyle=item.color;ctx.fillRect(Math.cos(a)*r-1,Math.sin(a)*r-1,2,2);}
 }ctx.restore();
}
export class CosmeticStarburst {
 constructor(actor,item){Object.assign(this,{actor,item,age:0,life:.75,layer:'air'});}
 update(dt){this.age+=dt;return this.age<this.life;}
 draw(ctx){const p=this.age/this.life,x=this.actor.x,y=this.actor.y-this.actor.bodyZ;
  ctx.save();ctx.strokeStyle=this.item.color;ctx.lineWidth=1.2;ctx.globalAlpha=1-p;
  for(let i=0;i<12;i++){const a=i*Math.PI/6,r=12+p*60;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);ctx.lineTo(x+Math.cos(a)*(r+8),y+Math.sin(a)*(r+8));ctx.stroke();}ctx.restore();
 }
}
