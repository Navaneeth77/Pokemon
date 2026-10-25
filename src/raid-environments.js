// Raid-only scenery. Regular arenas retain their original layouts and selection pool.
export const RAID_ARENAS = [
  { id:'skyPillar', name:'Sky Pillar · Storm Crown', raid:'sky', desc:'Ancient Hoenn stonework above the clouds.',
    ground:[[65,83,85],[78,99,97],[91,113,108],[108,130,119],[126,146,130],[144,161,141]],
    outer:[[14,33,48],[22,48,61],[34,65,75]], rock:['#435d59','#a0b89b','#718c77','#293d3c','#142b31'],ambient:{kind:'wind',n:42,colors:['#c7e8db','#8bb9ad']} },
  { id:'rocketLab', name:'Rocket · Containment Chamber', raid:'lab', desc:'Armored containment, cold machinery and unstable psychic energy.',
    ground:[[27,32,48],[33,40,57],[39,47,66],[46,54,73],[54,63,82],[64,72,91]],
    outer:[[8,12,23],[13,19,31],[21,28,43]],rock:['#384355','#8593a9','#56657c','#1b2538','#0d1423'],ambient:{kind:'mote',n:22,colors:['#c29ded','#8699bb']} },
  { id:'shadowCitadel', name:'Shadow Citadel · Tempest Sea', raid:'sea', desc:'A storm-lashed island fortress inspired by Shadow Lugia and Pokémon XD.',
    ground:[[47,47,62],[57,58,72],[68,68,82],[80,80,92],[92,93,103],[108,107,117]],
    outer:[[10,15,32],[16,23,43],[24,32,55]],rock:['#363747','#9693a6','#666477','#242536','#111626'],ambient:{kind:'rain',n:90,colors:['#a7a1cb','#8b9ebc']} },
];
const slab=(ctx,x,y,w,h,base,edge)=>{ctx.fillStyle=base;ctx.fillRect(x,y,w,h);ctx.strokeStyle=edge;ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,h-1);};
export function paintRaidFloor(ctx,t){
  ctx.save();
  if(t.raid==='sky'){
    for(let y=70;y<640;y+=52)for(let x=-32;x<360;x+=76){
      const shift=(Math.floor(y/52)%2)*38;
      slab(ctx,x+shift,y,74,50,'rgba(130,153,133,.16)','rgba(21,44,43,.4)');
      ctx.strokeStyle='rgba(208,220,175,.13)';ctx.beginPath();ctx.moveTo(x+shift+3,y+2);ctx.lineTo(x+shift+68,y+2);ctx.stroke();
    }
    ctx.strokeStyle='rgba(185,213,155,.25)';ctx.lineWidth=2;
    for(let i=0;i<16;i++){const a=i*Math.PI/8;ctx.beginPath();ctx.arc(180,335,118,a,a+.12);ctx.stroke();}
    for(const x of [5,337])for(const y of [88,550]){
      ctx.fillStyle='#263e3d';ctx.fillRect(x,y,18,58);slab(ctx,x-3,y-5,24,10,'#8a9d83','#344c46');
      ctx.fillStyle='#b9c5a0';ctx.fillRect(x+3,y+7,2,28);
    }
  }else if(t.raid==='lab'){
    for(let y=80;y<640;y+=40)for(let x=0;x<360;x+=60){
      slab(ctx,x+1,y+1,58,38,'rgba(68,82,105,.15)','#222d40');
      ctx.fillStyle='#778197';for(const dx of [5,53])ctx.fillRect(x+dx,y+5,1,1);
    }
    for(const x of [18,340]){ctx.fillStyle='#101c30';ctx.fillRect(x-3,90,7,510);ctx.fillStyle='#7355a0';ctx.fillRect(x,102,1,482);}
    for(const r of [48,55,64]){ctx.strokeStyle=r===55?'#8e74b0':'#1b263b';ctx.lineWidth=r===55?1:5;ctx.beginPath();ctx.ellipse(180,220,r,r*.7,0,0,Math.PI*2);ctx.stroke();}
    for(const x of [32,298])for(const y of [100,570]){slab(ctx,x,y,28,10,'#141c2d','#758096');ctx.fillStyle='#9b4e69';ctx.fillRect(x+4,y+3,20,3);}
  }else{
    for(let y=76;y<640;y+=44)for(let x=-35;x<380;x+=68){
      const shift=Math.floor(y/44)%2*34;
      slab(ctx,x+shift,y,66,42,'rgba(128,126,147,.09)','rgba(19,23,38,.65)');
      ctx.strokeStyle='rgba(182,177,205,.12)';ctx.beginPath();ctx.moveTo(x+shift+3,y+3);ctx.lineTo(x+shift+40,y+2);ctx.stroke();
    }
    for(const x of [8,340]){slab(ctx,x,82,12,520,'#2b2e40','#737183');ctx.fillStyle='#756185';for(let y=112;y<580;y+=70)ctx.fillRect(x+4,y,3,16);}
  }
  ctx.strokeStyle=t.raid==='lab'?'#74829b':'rgba(185,197,182,.45)';ctx.lineWidth=2;ctx.strokeRect(20,96,320,502);
  ctx.restore();
}

let cloudTexture;
function cloudImage(){
  if(cloudTexture)return cloudTexture;
  cloudTexture=document.createElement('canvas');cloudTexture.width=320;cloudTexture.height=100;
  const c=cloudTexture.getContext('2d');
  for(let i=0;i<24;i++){
    const x=35+(i*61.7)%250,y=35+Math.sin(i*4.1)*17,r=24+(i%5)*6;
    const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(178,203,206,.2)');g.addColorStop(.45,'rgba(150,179,188,.1)');g.addColorStop(1,'rgba(128,160,177,0)');
    c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
  }
  return cloudTexture;
}

export function drawRaidBackdrop(ctx,t,time){
  const sky=t.raid==='sky',lab=t.raid==='lab';
  ctx.save();
  const g=ctx.createLinearGradient(0,-200,0,1000);
  g.addColorStop(0,sky?'#0a1b2d':lab?'#070b16':'#0b1020');g.addColorStop(.5,sky?'#365967':lab?'#192136':'#1c2940');g.addColorStop(1,sky?'#8daba5':lab?'#080d19':'#080e20');
  ctx.fillStyle=g;ctx.fillRect(-1600,-1600,3560,3840);
  if(lab){
    for(const side of [-1,1])for(let i=0;i<5;i++){
      const x=side<0?-70-i*103:385+i*103,y=80+(i%2)*95;
      slab(ctx,x-8,y-24,80,450,'#101929','#35445b');
      const glass=ctx.createLinearGradient(x,y,x+64,y);glass.addColorStop(0,'#111e31');glass.addColorStop(.5,'#314b65');glass.addColorStop(1,'#111b30');
      ctx.fillStyle=glass;ctx.fillRect(x,y,64,350);ctx.strokeStyle='#5a6c83';ctx.strokeRect(x,y,64,350);
      ctx.fillStyle=`rgba(160,116,219,${.15+.07*Math.sin(time*.8+i)})`;ctx.fillRect(x+3,y+3,58,344);
      ctx.fillStyle='#81a5b2';ctx.fillRect(x+7,y+8,2,320);ctx.fillStyle='#946482';ctx.fillRect(x+12,y+370,7,3);
      ctx.fillStyle='#18263a';ctx.fillRect(x-14,y+110,92,10);ctx.fillRect(x-14,y+270,92,10);
    }
  }else{
    // Soft cached cloud banks: diffuse edges and parallax, without flat oval puffs.
    const cloud=cloudImage();
    for(let layer=0;layer<3;layer++)for(let i=0;i<10;i++){
      const x=((i*223+time*(layer+1)*7)%2200)-900,y=-110+((i*157+layer*110)%1050);
      ctx.globalAlpha=sky?.42+layer*.12:.16+layer*.06;
      const w=280+layer*150;ctx.drawImage(cloud,x,y,w,w*.32);
    }
    ctx.globalAlpha=1;
    if(!sky){
      for(let i=0;i<30;i++){
        const y=100+i*25,shift=Math.sin(time*.8+i)*18;
        ctx.strokeStyle=`rgba(111,119,160,${.10+(i%3)*.025})`;ctx.lineWidth=i%3?1:2;
        ctx.beginPath();ctx.moveTo(-850+shift,y);ctx.bezierCurveTo(-100,y-14,450,y+10,1200+shift,y);ctx.stroke();
      }
      const flash=Math.max(0,1-(time%9)/.16);
      if(flash){ctx.globalAlpha=flash*.55;ctx.strokeStyle='#b799e6';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-120,20);ctx.lineTo(-145,100);ctx.lineTo(-126,96);ctx.lineTo(-163,195);ctx.stroke();}
    }
  }
  ctx.restore();
}

export function drawRaidAtmosphere(ctx,t,time){
  if(t.raid!=='lab')return;
  ctx.save();ctx.fillStyle=`rgba(197,86,123,${.25+.2*Math.sin(time*2.2)})`;
  for(const x of [26,326])for(let y=112;y<590;y+=78)ctx.fillRect(x,y,6,2);
  ctx.restore();
}
