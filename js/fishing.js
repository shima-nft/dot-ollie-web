// A visible side-on pond. Tap / hold / release. Catches are actual pond individuals.
(function(global){
 'use strict';
 var ENTRY={x:174,y:8,w:58,h:22};
 // Field notes open from a small notebook in the top-left corner (touch area 16x16, before casting only).
 var LOG_ICON={x:2,y:2,w:16,h:16};
 // 2026-09-19 Phase 2: the night pond background (js/fishing-pond-art.js) is the stage.
 // SURFACE = its bright water line. STAND_Y = the dock the angler stands on (the old pond's y=49, kept apart now).
 // SHORE = first open water right of the dock posts. SHELTER = the dark water below the roots of the left bank, just above its weed bed.
 var SURFACE=58,FLOOR=147,SHORE=46,HERO_X=29,STAND_Y=49,SHELTER_X=16,SHELTER_Y=92,CAST_MS=520,CAST_RELEASE_MS=180,HIT_MS=380,LAND_MS=650,RESULT_GUARD_MS=650;
 // One attachment calculation drives both the visible rod and the physics endpoints.
 // Body poses remain authored pixels; only the isolated reel rod is redrawn under load.
 function fisherPose(s){var art=global.DotFishingArt,cast=s.phase==='cast',visual=s.fisher||{pull:0,bend:0};
  var index=cast?(s.ms<60?0:s.ms<130?1:s.ms<CAST_RELEASE_MS?2:3):(visual.pull>=.5?1:0),frame=(cast?art.cast:art.reel)[index];
  var ox=HERO_X-art.anchor[0],oy=STAND_Y-art.anchor[1],tip=frame.tip.slice(),control=frame.control;
  if(!cast){var a=art.reel[0],b=art.reel[1],p=visual.pull,load=visual.bend;
   tip=[a.tip[0]+(b.tip[0]-a.tip[0])*p+load*5,a.tip[1]+(b.tip[1]-a.tip[1])*p+load*7];
   control=[a.control[0]+(b.control[0]-a.control[0])*p+load,a.control[1]+(b.control[1]-a.control[1])*p-load*2];
   if(s.phase==='wait'&&s.ms<120){var returnT=s.ms/120;tip=[art.cast[3].tip[0]*(1-returnT)+tip[0]*returnT,art.cast[3].tip[1]*(1-returnT)+tip[1]*returnT];}
  }
  return {frame:frame,index:index,cast:cast,x:ox,y:oy,grip:{x:ox+frame.grip[0],y:oy+frame.grip[1]},
   tip:{x:Math.round(ox+tip[0]),y:Math.round(oy+tip[1])},control:control?{x:ox+control[0],y:oy+control[1]}:null};
 }
 function updateFisher(s,dt){var v=s.fisher,fighting=s.phase==='hit'||s.phase==='reel',target=fighting&&s.held?1:0;
  v.pull+=(target-v.pull)*(1-Math.exp(-dt/(target?.10:.16)));
  var load=fighting?clamp(s.tension*.9+(s.angry?.1:s.bracing?.06:0),0,1):0;
  v.bend+=(load-v.bend)*(1-Math.exp(-dt/(load>v.bend?.08:.18)));
 }
 // The same stepped erosion profile drives rendering, fish clearance and rising bubbles.
 // Left bank of the new pond: grass overhang to x=20, hanging roots until y=76, then open water to the edge
 // (stepped down 1px per row, so a fish top never slips under the roots).
 function bankEdge(y){return y<SURFACE+2?21:y<76?13:y<84?89-y:y<96?5:y<99?101-y:2;}
 // The sand line of the new pond (about y=144..150), gently rolling.
 function bedY(x){return Math.round(146+Math.sin(x*.065)*2+Math.sin(x*.023)*2);}
 function fishRadius(f){return clamp(Math.round(f.cm/3),5,22)/2+4;}
 function keepInWater(f){var halfH=SPECIES[f.type].bottom?2:Math.min(5,Math.round(fishRadius(f)*.4));
  f.y=clamp(f.y,SURFACE+halfH+3,Math.min(bedY(f.x-6),bedY(f.x+6))-halfH-2);
  f.x=clamp(f.x,bankEdge(f.y-halfH)+fishRadius(f)+1,239-fishRadius(f));}
 // IDs 0..2 preserve old records. Personality and size exist before the fish appears.
 var SPECIES=[
  {name:'MINNOW',min:6,max:14,color:15,depth:78,band:30,speed:17,notice:32,watch:.12,chase:31,power:.55,endurance:.65,style:'thrash'},
  {name:'PERCH',min:14,max:28,color:21,depth:98,band:34,speed:10,notice:39,watch:.65,chase:23,power:.8,endurance:.85,style:'surface'},
  {name:'TROUT',min:22,max:40,color:7,depth:118,band:30,speed:6,notice:47,watch:1,chase:18,power:1.1,endurance:1.15,style:'burst'},
  {name:'GOLDEN CARP',min:20,max:45,color:19,depth:107,band:32,speed:8,notice:42,watch:1.35,chase:22,power:1,endurance:1.25,style:'dive',rare:true},
  {name:'LOACH',min:12,max:24,color:18,depth:136,band:6,speed:5,notice:32,watch:.7,chase:19,power:.65,endurance:.8,style:'dive',bottom:true}
 ];
 var TEXTS=['CAUGHT','FIRST CATCH','NEW RECORD','RARE CATCH','BIG CATCH','NOTED','WAS','FIELD NOTES','SEEN','UNSEEN','TAP','???','BEST','cm','!','PAUSED'];
 function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
 function random(s){var x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
 function event(s,type,data){if(s.events.length<16)s.events.push({type:type,data:data});}
 // Sound-only cues (bubbles, thrashing), kept apart from events so gameplay events never hit their cap.
 function sfx(s,type,data){if(s.sfx&&s.sfx.length<8)s.sfx.push({type:type,data:data});}
 // Each fish keeps a home depth inside its species band and picks a new one when it turns at a wall,
 // so the whole water column is used. waterNoise only: the fish AI's own dice are untouched.
 // Never shallower than SURFACE+16: a fish sitting just under the float would take any cast at once,
 // and choosing which fish takes the bait (moving the float) is the game.
 function homeDepth(f,n){var k=SPECIES[f.type];return Math.max(SURFACE+16,Math.round(k.depth+(waterNoise(f.id*131+7,n)-.5)*k.band));}
 function spawn(s,type,x){var k=SPECIES[type],giant=type===2&&random(s)<.08,cm=Math.round((k.min+random(s)*(k.max-k.min))*(giant?1.75:1)*10)/10;
  var f={id:s.nextId++,kind:'fish',type:type,cm:cm,giant:giant,x:x,y:k.depth+random(s)*8-4,home:k.depth+random(s)*6-3,dir:random(s)<.5?-1:1,mode:'swim',watch:0,flee:0,wave:random(s)*6.28,alive:true,turns:0};f.home=homeDepth(f,0);f.y=f.home;return f;}
 function extraType(s){var r=random(s);return r<.10?3:r<.28?4:r<.65?0:1;}
 function create(seed){var s={rng:(seed>>>0)||1,nextId:1,phase:'idle',ms:0,clock:0,accum:0,count:0,largest:0,fish:null,message:'',pool:[],records:{},seen:{},events:[],particles:[],held:false,pressMs:0,bobX:150,bobY:SURFACE,lureY:SURFACE+6,quiet:0,nudgeAge:99,hookId:null,tension:0,fight:null,slack:0,angry:false,impact:0,refill:0,
  // Future relic placements have their own data, separate from fish AI and the running wallet.
  bottomFinds:[],fxRng:((seed^0x6d2b79f5)>>>0)||1,ripples:[],bubbles:[],jets:[],wakes:[],plants:[],waterKick:0,reelSpeed:0,bracing:false,sfx:[],pondSeed:(seed>>>0)||1,seepIn:12+(seed>>>0)%7,seepCount:0,
  wildlife:{wait:7+waterNoise(seed,501)*5,rareWait:48+waterNoise(seed,502)*20,serial:0,moment:null},fisher:{pull:0,bend:0}};
  [0,1,0,2,1,extraType(s)].forEach(function(t,i){var f=spawn(s,t,62+i*29+random(s)*9);f.slot=i;f.shelterCooldown=8+i;
   if(i===3){f.x=SHELTER_X;f.y=SHELTER_Y;f.mode='shelter';f.rest=3.5+random(s)*2;f.dir=1;}keepInWater(f);s.pool.push(f);});plantBeds(s);return s;}
 // Visual randomness never changes fish spawns, sizes or fighting behaviour.
 function fxRandom(s){var x=s.fxRng;x^=x<<13;x^=x>>>17;x^=x<<5;s.fxRng=x>>>0;return s.fxRng/4294967296;}
 // Quiet scenery has no mutable RNG shared with fish, splashes or other water effects.
 function waterNoise(seed,index){var n=(seed^Math.imul(index+1,0x45d9f3b))>>>0;n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;}
 function observing(s){return s.phase==='idle'||s.phase==='wait';}
 function clearWaterPoint(s,x,y){if(s.phase==='wait'&&Math.abs(x-s.bobX)<7&&y<s.lureY+8)return false;
  return !s.pool.some(function(f){return f.alive&&Math.abs(x-f.x)<fishRadius(f)+6&&Math.abs(y-f.y)<10;});}
 function updateSeep(s,dt){if(!observing(s))return;s.seepIn-=dt;if(s.seepIn>0)return;
  var serial=s.seepCount++,seed=s.pondSeed,plant=s.plants[Math.floor(waterNoise(seed,serial*3)*s.plants.length)];
  s.seepIn=14+waterNoise(seed,serial*3+1)*12;
  if(!plant||!clearWaterPoint(s,plant.x,plant.y-4)||s.pool.some(function(f){return f.mode==='look'||f.mode==='approach';}))return;
  // A pair, occasionally three, detaches from one root. No sound or reward cue.
  for(var i=0;i<2+(waterNoise(seed,serial*3+2)>.6?1:0)&&s.bubbles.length<48;i++){
   var x=plant.x+2-i;s.bubbles.push({x:x,base:x,y:plant.y-4,age:-i*.4,speed:9+i*2,size:1,wave:serial+i*2,rare:false,ambient:true});}
 }
 // 2026-09-19: the painted bubble columns became real ones. Every few seconds a short train rises from the foot
 // of one of them (VENTS), under the same quiet rules as the seep. Visual dice only.
 function updateVents(s,dt){if(!observing(s))return;s.ventIn=(s.ventIn==null?1.5:s.ventIn)-dt;if(s.ventIn>0)return;
  s.ventIn=2.2+fxRandom(s)*3.6;var v=VENTS[Math.floor(fxRandom(s)*VENTS.length)];
  if(!clearWaterPoint(s,v[0],v[2])||s.pool.some(function(f){return f.mode==='look'||f.mode==='approach';}))return;
  for(var i=0,n=2+(fxRandom(s)>.55?1:0);i<n&&s.bubbles.length<48;i++)s.bubbles.push({x:v[0],base:v[0],y:v[2],age:-i*.5,speed:8+fxRandom(s)*4,size:1,wave:fxRandom(s)*6.28,rare:false,ambient:true,vent:true});}
 // Added on top of the root seep (2026-09-16, Shima): every 2-5 s, three small bubbles from a plant tip picked by fx dice.
 // Same quiet rules as the seep: only while idle/waiting, never beside the float or while a fish looks/approaches.
 // 2026-09-19 (Shima): plant bubbles are single 1 px bubbles, now and then two, not a train of three.
 function updateSprinkle(s,dt){if(!observing(s))return;s.sprinkleIn=(s.sprinkleIn==null?4:s.sprinkleIn)-dt;if(s.sprinkleIn>0)return;
  s.sprinkleIn=6+fxRandom(s)*9;
  var plant=s.plants[Math.floor(fxRandom(s)*s.plants.length)];
  if(!plant||!clearWaterPoint(s,plant.x,plant.y-plant.height)||s.pool.some(function(f){return f.mode==='look'||f.mode==='approach';}))return;
  weedBubble(s,plant.x,plant.y-plant.height);
 }
 function weedBubble(s,x,y){for(var i=0,n=fxRandom(s)<.2?2:1;i<n&&s.bubbles.length<48;i++)
  s.bubbles.push({x:x,base:x,y:y,age:-i*.7,speed:6+fxRandom(s)*5,size:1,wave:fxRandom(s)*6.28,rare:false});}
 // The painted weeds release bubbles too: each clump (12 px wide) on its own slow clock, 30-70 s apart,
 // from a leaf tip that has open water above it. Same look and rise as the fish's own bubbles.
 var weedTipGroups=null;
 function paintedWeedTips(){if(weedTipGroups)return weedTipGroups;weedTipGroups=[];var b=pond();if(!b)return weedTipGroups;
  function rgb(x,y){var h=b.hex[y*240+x];return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];}
  function leafy(p){return (p[1]>p[0]+20&&p[1]>p[2]+5)||(p[1]>p[0]+30&&p[2]-p[1]<32);}
  var groups={};for(var y=96;y<139;y++)for(var x=2;x<238;x++){var p=rgb(x,y),up=rgb(x,y-1);if(!leafy(p)||leafy(up)||up[2]<up[0]+40)continue;
   var g=Math.floor(x/12);(groups[g]=groups[g]||[]).push([x,y-1]);}
  Object.keys(groups).forEach(function(g){weedTipGroups.push(groups[g]);});return weedTipGroups;}
 function updateWeedBubbles(s,dt){if(!observing(s))return;var groups=paintedWeedTips();if(!s.weedIn)s.weedIn=groups.map(function(){return 4+fxRandom(s)*40;});
  for(var g=0;g<groups.length;g++){s.weedIn[g]-=dt;if(s.weedIn[g]>0)continue;s.weedIn[g]=30+fxRandom(s)*40;
   var tip=groups[g][Math.floor(fxRandom(s)*groups[g].length)];
   if(clearWaterPoint(s,tip[0],tip[1])&&!s.pool.some(function(f){return f.mode==='look'||f.mode==='approach';}))weedBubble(s,tip[0],tip[1]);}}
 // One optional observation at a time, with real quiet gaps. No new fish AI states.
 function updateWildlife(s,dt){var w=s.wildlife;if(!w)return;
  var m=w.moment;
  // The distant shadow is a passer-by, not a state: a cast, a splash or a bite startles it (it speeds up and sinks
  // away), but it is never switched off. It never touches the fish or the bait.
  if(m&&m.kind==='shadow'){m.age+=dt;w.rareWait-=dt;
   if(m.startled==null&&(s.phase==='cast'||s.phase==='hit'||s.nudgeAge<.2))m.startled=m.age;
   m.progress=(m.progress||0)+dt/m.duration*(m.startled!=null?1.8:1);if(m.progress>=1)w.moment=null;return;}
  if(!observing(s)){w.moment=null;return;}
  w.rareWait-=dt;
  if(m){m.age+=dt;var f=m.fishId?s.pool.find(function(f){return f.id===m.fishId;}):null;
   if(m.age>=m.duration||(m.fishId&&(!f||!f.alive||f.mode!=='swim'))){w.moment=null;}
   return;
  }
  w.wait-=dt;if(w.wait>0||s.pool.some(function(f){return f.mode==='look'||f.mode==='approach';}))return;
  var serial=w.serial++,seed=s.pondSeed;w.wait=9+waterNoise(seed,510+serial*3)*10;
  if(w.rareWait<=0){w.moment={kind:'shadow',age:0,duration:4.6,y:118+waterNoise(seed,511+serial*3)*10};w.rareWait=60+waterNoise(seed,512+serial*3)*40;return;}
  // Once bait is cast, only scenery may start. Target selection stays with feeding AI.
  if(s.phase!=='idle')return;
  var choice=null,best=18;
  s.pool.forEach(function(f){if(!f.alive||f.mode!=='swim'||(s.phase==='wait'&&Math.hypot(f.x-s.bobX,f.y-s.lureY)<SPECIES[f.type].notice+16))return;
   s.plants.forEach(function(p){var y=p.y-p.height+3,x=p.x-f.dir*(fishRadius(f)-3),d=Math.hypot(x-f.x,y-f.y);
    if(d<best&&(x-f.x)*f.dir>=0&&x>bankEdge(y-5)+fishRadius(f)+1&&x<238-fishRadius(f)){best=d;choice={kind:'browse',age:0,duration:4.4,fishId:f.id,x:x,y:y,plantX:p.x,dir:f.dir};}});
  });
  if(!choice){var swimmers=s.pool.filter(function(f){return f.alive&&f.mode==='swim'&&f.type===0;});
   var small=swimmers[Math.floor(waterNoise(seed,513+serial*3)*swimmers.length)];
   if(small)choice={kind:'hover',fishId:small.id,age:0,duration:1.8,x:small.x,y:small.y,dir:small.dir};
  }
  w.moment=choice;if(!choice)w.wait=3+waterNoise(seed,514+serial*3)*5;
 }
 // The background already has dense weed beds. Only a few living stalks sit in its sandy gaps:
 // a handful that sway makes the whole bed feel alive without doubling it. [x, kind, height, in front of fish]
 var PLANTS=[[66,0,15,0],[82,1,12,1],[104,3,14,0],[148,2,8,0],[170,4,16,1],[192,1,13,0]];
 function plantBeds(s){PLANTS.forEach(function(q){var x=q[0];
   s.plants.push({x:x,y:bedY(x),height:q[2],kind:q[1],period:1800+fxRandom(s)*2200,phase:fxRandom(s)*6.28,amp:1+fxRandom(s),lean:fxRandom(s)*2-1,push:0,front:!!q[3]});});}
 function ripple(s,x,power,rings){if(s.ripples.length>=16)s.ripples.shift();s.ripples.push({x:x,age:0,power:power,rings:rings||2});}
 function bubbles(s,x,y,cm,rare){var count=rare?5:cm>=30?4:3;
  for(var i=0;i<count&&s.bubbles.length<48;i++)s.bubbles.push({x:x+(fxRandom(s)-.5)*4,y:y,base:x,age:-i*.12,speed:12+fxRandom(s)*15,size:cm>=30?(i%2?2:3):i%3?1:2,wave:fxRandom(s)*6.28,rare:rare});}
 function splash(s,x,y,kind,power){power=power||1;var n=kind==='nudge'?4:kind==='cast'?12:kind==='bite'?16:Math.round(12+power*10);
  for(var i=0;i<n&&s.particles.length<100;i++){var side=i%2?1:-1;s.particles.push({x:x+(fxRandom(s)-.5)*5,y:y,vx:side*(12+fxRandom(s)*32)*power,vy:-(16+fxRandom(s)*28)*Math.sqrt(power),life:.5+fxRandom(s)*.35,size:power>1.5&&i%4===0?2:1});}
  ripple(s,x,power,kind==='nudge'?2:power>1.5?4:3);
  if(kind!=='nudge'){if(s.jets.length>=10)s.jets.shift();s.jets.push({x:x,age:0,kind:kind,power:power});}
  if(power>1.5){s.waterKick=Math.min(1,power*.35);s.waterKickX=x;}}
 function updateWater(s,dt){
  s.wakes.forEach(function(w){w.age+=dt;});s.wakes=s.wakes.filter(function(w){return w.age<w.life;});
  s.plants.forEach(function(p){p.push*=Math.max(0,1-dt*4);});
  s.waterKick=Math.max(0,s.waterKick-dt*1.4);
  s.ripples.forEach(function(r){r.age+=dt;});s.ripples=s.ripples.filter(function(r){return r.age<1.65;});
  s.jets.forEach(function(j){j.age+=dt;});s.jets=s.jets.filter(function(j){return j.age<.55;});
  s.particles.forEach(function(p){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=100*dt;
   if(p.y>=SURFACE&&p.vy>0&&p.life>0){p.life=0;if(s.ripples.length<14)ripple(s,p.x,.25,1);}});s.particles=s.particles.filter(function(p){return p.life>0;});
  s.bubbles.forEach(function(b){b.age+=dt;if(b.age<0)return;b.y-=b.speed*dt;b.x=b.base+Math.sin(b.age*3+b.wave)*(b.rare?3:1.5);
   if(b.y>SURFACE&&b.x<bankEdge(b.y)+b.size+1){b.x=bankEdge(b.y)+b.size+1;b.base=b.x;}
   if(b.y<=SURFACE){b.y=-99;if(!b.ambient)ripple(s,b.x,.3,1);
    else if(observing(s)&&clearWaterPoint(s,b.x,SURFACE)){ripple(s,b.x,.12,1);s.ripples[s.ripples.length-1].ambient=true;}}});s.bubbles=s.bubbles.filter(function(b){return b.y>-50;});
  updateSeep(s,dt);updateSprinkle(s,dt);updateVents(s,dt);updateWeedBubbles(s,dt);
  s.pool.forEach(function(f){if(!f.alive)return;var interval=f.mode==='approach'?450:f.giant?1000:2300,offset=f.id*317;
   if(Math.floor((s.clock+offset)/interval)!==Math.floor((s.clock-dt*1000+offset)/interval)){
    bubbles(s,f.x+f.dir*Math.max(3,f.cm/6),f.y,f.cm,!!SPECIES[f.type].rare);if(f.mode==='approach')sfx(s,'bubble',{cm:f.cm});
    if(f.mode==='look'||f.mode==='approach')ripple(s,s.bobX,.45,2);else if(f.y<SURFACE+19)ripple(s,f.x,.45,2);
   }});
 }
 // Wakes originate at the moving fish, never at an unrelated point on the surface.
 function reactToFish(s,dt){s.pool.forEach(function(f){
  var oldX=f.motionX===undefined?f.x:f.motionX,oldY=f.motionY===undefined?f.y:f.motionY,vx=(f.x-oldX)/dt,vy=(f.y-oldY)/dt,speed=Math.hypot(vx,vy),moving=speed>12;
  var fighting=f.id===s.hookId,angry=fighting&&s.angry,turn=(f.motionVX||0)*vx<-25,jerk=angry&&!f.motionAngry,top=f.y-Math.min(5,f.cm/9);
  f.motionX=f.x;f.motionY=f.y;f.motionVX=vx;f.motionAngry=angry;f.waterCooldown=Math.max(0,(f.waterCooldown||0)-dt);f.waterTravel=(f.waterTravel||0)+speed*dt;
  if(!f.alive)return;
  if(speed>18)s.plants.forEach(function(p){var radius=12+Math.min(16,f.cm*.22),dy=Math.max(0,p.y-p.height-f.y,f.y-p.y),distance=Math.hypot(p.x-f.x,dy);
   if(distance<radius)p.push=clamp(p.push+(vx<0?-1:1)*(1-distance/radius)*Math.min(speed,150)*dt*.45,-3.5,3.5);});
  if(f.waterCooldown>0||(!jerk&&!turn&&(!moving||f.waterTravel<7)))return;
  f.waterCooldown=.18+fxRandom(s)*.17;f.waterTravel=0;
  var dirX=speed>1?vx/speed:f.dir,dirY=speed>1?vy/speed:0,power=clamp(speed/60+f.cm/90,.4,1.5),tail=Math.min(11,f.cm/6);
  if(s.wakes.length<48)s.wakes.push({x:f.x-dirX*tail,y:f.y-dirY*tail,dx:-dirX,dy:-dirY,age:0,life:.3+fxRandom(s)*.15,power:power});
  if(top>SURFACE+10){if(jerk||turn||speed>55){bubbles(s,f.x-dirX*tail,f.y,f.cm,false);if(fighting)sfx(s,'thrash',{cm:f.cm,deep:true});}return;}
  if(!fighting&&speed<25){ripple(s,f.x,.3,1);return;}
  if(fighting)sfx(s,'thrash',{cm:f.cm,deep:false});
  // A brief lateral spray for a near-surface turn or pull; no repeating vertical jet.
  var count=jerk||turn?8:4;
  for(var i=0;i<count&&s.particles.length<100;i++){var side=i%2?1:-1;s.particles.push({x:f.x+side*2,y:SURFACE,vx:vx*.35+side*(10+fxRandom(s)*16)*power,vy:-(8+fxRandom(s)*12)*power,life:.22+fxRandom(s)*.14,size:f.cm>40&&i===0?2:1,kind:'fish'});}
  ripple(s,f.x,jerk||turn?.7:.4,2);
 });}
 // Two abilities + one movement style. Size is the individual variation, not another roll.
 function fightStats(f){var k=SPECIES[f.type],size=clamp(f.cm/((k.min+k.max)/2),.7,2);
  return {power:k.power*Math.sqrt(size),endurance:k.endurance*Math.sqrt(size),pull:39/(.65+k.power*size*.45)};}
 function newFight(){return {state:'calm',age:0,load:0,action:null,round:0,final:false,duration:0};}
 function fightState(s,state,duration){s.fight.state=state;s.fight.age=0;s.fight.duration=duration||0;s.angry=state==='struggle';s.bracing=state==='warn';}
 function warnFish(s,f,stats){var b=s.fight,k=SPECIES[f.type],previous=b.action,action=k.style;
  // The bank and bed redirect a fish's preferred escape, visibly, before it pulls.
  if(action==='dive'&&f.y>bedY(f.x)-25)action='burst';
  else if(action==='surface'&&f.y<SURFACE+21)action='thrash';
  else if(action==='burst'&&f.x>192)action='dive';
  else if(previous===action&&b.round%2)action=f.y>SURFACE+41?'surface':'dive';
  b.action=action;b.round++;b.load=0;
  // Rare fish hesitate with their head still aimed at the same destination.
  fightState(s,'warn',.52+Math.min(.18,stats.power*.08)+(k.rare&&b.round%2===0?.25:0));
  f.dir=action==='dive'||action==='surface'?(f.x>195?-1:1):1;
  bubbles(s,f.x+f.dir*fishRadius(f)*.6,f.y,f.cm,false);
 }
 // Tension is produced by opposing forces, not a species-specific damage stat.
 function updateTension(s,stats,dt){var b=s.fight,pull=b.state==='struggle'?stats.power*(b.action==='burst'?1.25:1):0;
  if(s.held){s.slack=0;s.tension=clamp(s.tension+dt*(pull+.10+(b.state==='calm'?b.load*.12:0)),0,1);}
  else{s.slack+=dt;s.tension=Math.max(0,s.tension-dt*.78);}
 }
 function updateFight(s,f,dt){var stats=fightStats(f),b=s.fight;if(!b)b=s.fight=newFight();
  b.age+=dt;
  var goalX=s.landX||SHORE+fishRadius(f)+3,goalY=SURFACE+9,dist=Math.hypot(f.x-goalX,f.y-goalY);
  if(b.state==='calm'){
   b.load+=dt*(s.held?1.05+s.tension:.3)/(stats.endurance*.7+.45);
   if(b.load>=1||(!b.final&&stats.power>=1&&dist<32)){if(dist<32)b.final=true;warnFish(s,f,stats);}
  }else if(b.age>=b.duration){
   if(b.state==='warn')fightState(s,'struggle',(.65+stats.endurance*.45)*(b.action==='burst'?.9:1.15));
   else if(b.state==='struggle')fightState(s,'tired',.85+.5/stats.endurance+Math.min(.45,b.round*.07));
   else if(b.state==='tired')fightState(s,'calm');
  }
  s.angry=b.state==='struggle';s.bracing=b.state==='warn';updateTension(s,stats,dt);
  // No reeling through a warning or an escape. A resting fish is the clear opportunity.
  var desired=s.held?(s.angry?-5*stats.power:s.bracing?0:stats.pull*(b.state==='tired'?1.18:1)):-2;
  s.reelSpeed+=(desired-s.reelSpeed)*Math.min(1,dt/(desired>0?.12+stats.power*.06:.08));
  var dx=goalX-f.x,dy=goalY-f.y,travel=Math.min(dist,dt*s.reelSpeed);
  f.x+=dx/(dist||1)*travel;f.y+=dy/(dist||1)*travel;
  if(s.angry){var force=(12+stats.power*12)*(1-Math.min(.3,(b.round-1)*.035)),t=b.age/b.duration;
   if(b.action==='burst'){f.x+=force*(.9+Math.sin(t*Math.PI)*.9)*dt;}
   else if(b.action==='dive'){f.x+=f.dir*force*.35*dt;f.y+=force*.8*dt;}
   else if(b.action==='surface'){f.x+=f.dir*force*.35*dt;f.y-=force*dt;}
   else {f.x+=force*.25*dt;f.y+=Math.cos(t*Math.PI*6)*force*.4*dt;}
  }else if(!s.bracing)f.dir=-1;
  keepInWater(f);s.bobX=Math.max(SHORE+2,f.x);s.lureY=f.y;s.bobY=SURFACE+3;
  if(s.tension>=1)escape(s,'LINE BROKE');else if(s.slack>=5)escape(s,'SLIPPED AWAY');
  else if(!s.angry&&!s.bracing&&Math.hypot(f.x-goalX,f.y-goalY)<5)catchFish(s,f);
 }
 function cast(s,x){s.phase='cast';s.ms=0;s.fish=null;s.escapeFx=null;s.message='';s.targetX=clamp(Number.isFinite(x)?x:156,SHORE+5,225);s.lureY=SURFACE+6;s.quiet=0;s.hookId=null;s.fight=null;s.tension=0;s.held=false;s.slack=0;s.bracing=false;s.angry=false;
  var tip=fisherPose(s).tip;s.bobX=tip.x;s.bobY=tip.y+3;
  if(s.wildlife&&!(s.wildlife.moment&&s.wildlife.moment.kind==='shadow'))s.wildlife.moment=null;
  s.pool.forEach(function(f){if(f.mode==='look'||f.mode==='approach'){f.mode='swim';f.watch=0;}});event(s,'cast');}
 function nudge(s){if(s.bobX<=SHORE+8){s.phase='idle';s.ms=0;return;}
  s.bobX=Math.max(SHORE+7,s.bobX-10);s.lureY=Math.max(SURFACE+6,s.lureY-3);s.quiet=0;s.nudgeAge=0;splash(s,s.bobX,SURFACE,'nudge',.5);event(s,'nudge');}
 function press(s,x,y){if(!s||s.held)return false;
  if(s.phase==='idle'){if(contains(LOG_ICON,x,y)){s.phase='log';s.ms=0;return true;}if(y<SURFACE-8)return false;cast(s,x);return true;}
  if(s.phase==='log'){s.phase='idle';s.ms=0;s.held=true;s.pressPhase='log';return true;}
  if(s.phase==='result'&&s.ms<RESULT_GUARD_MS)return false;
  if(s.phase==='cast'||s.phase==='land')return false;
  s.held=true;s.pressMs=s.clock;s.pressX=x;s.pressPhase=s.phase;return true;}
 function release(s,cancel){if(!s)return;var held=s.held,duration=s.clock-s.pressMs,pressedIn=s.pressPhase;s.held=false;s.pressPhase=null;if(!held||cancel)return;
  if(s.phase==='wait'&&pressedIn==='wait'&&duration<=260)nudge(s);
  else if(s.phase==='result'&&pressedIn==='result'&&s.ms>=RESULT_GUARD_MS){
   if(s.fish){s.phase='idle';s.ms=0;s.fish=null;s.escapeFx=null;s.hookId=null;s.tension=0;s.bracing=false;s.angry=false;}
   else cast(s,s.pressX);
   return; // This release belongs only to the result. A new press is required to cast.
  }}
 function tap(s,x,y){press(s,x===undefined?156:x,y===undefined?SURFACE:y);release(s,false);}
 function hook(s,f){s.phase='hit';s.ms=0;s.hookId=f.id;s.tension=.18;s.fight=newFight();s.slack=0;s.angry=false;s.impact=.12;s.bobX=f.x;s.bobY=SURFACE+4;f.mode='hooked';
  s.reelSpeed=0;s.bracing=false;s.landX=SHORE+fishRadius(f)+3;
  // Even the first run has a complete warning after the bite presentation.
  if(fightStats(f).power>=1)warnFish(s,f,fightStats(f));
  s.pool.forEach(function(o){if(o!==f&&(o.mode==='look'||o.mode==='approach')){o.mode='swim';o.watch=0;}});
  if(f.y-Math.min(5,f.cm/9)>SURFACE+10){bubbles(s,f.x,f.y,f.cm,false);ripple(s,Math.max(SHORE+2,f.x),.35,2);}
  else splash(s,Math.max(SHORE+2,f.x),SURFACE,'bite',1+f.cm/65);event(s,'hit');}
 function escape(s,message){var f=s.pool.find(function(o){return o.id===s.hookId;});if(f){f.mode='flee';f.flee=2;f.dir=f.x>205?-1:1;f.toShelter=f.type===2||!!SPECIES[f.type].rare;}
  var tip=fisherPose(s).tip;s.escapeFx={broken:message==='LINE BROKE',x:s.bobX,y:s.bobY,tipX:tip.x,tipY:tip.y,fishId:s.hookId,diveY:f?Math.min(FLOOR-8,Math.max(f.home,f.y+22)):100,tension:s.tension};
  s.phase='result';s.ms=0;s.fish=null;s.message=message;s.hookId=null;s.held=false;s.tension=0;s.angry=false;s.bracing=false;event(s,'miss');}
 function catchFish(s,f){var previous=s.records[f.type]||0;
  s.fish={id:f.id,type:f.type,name:SPECIES[f.type].name,cm:f.cm,giant:f.giant,rare:!!SPECIES[f.type].rare,isNew:!previous,newRecord:f.cm>previous,previous:previous};
  s.records[f.type]=Math.max(previous,f.cm);s.seen[f.type]=true;s.count++;s.largest=Math.max(s.largest,f.cm);f.alive=false;s.phase='land';s.ms=0;s.held=false;s.refill=1.4;s.refillSlot=f.slot;s.refillType=f.type;event(s,'catch',s.fish);}
 function updateFish(s,f,dt){if(!f.alive||f.mode==='hooked')return;var k=SPECIES[f.type],dx=s.bobX-f.x,dy=s.lureY-f.y,d=Math.hypot(dx,dy);
  f.shelterCooldown=Math.max(0,(f.shelterCooldown||0)-dt);
  if(f.mode==='flee'){f.flee-=dt;if(f.toShelter){var ex=SHELTER_X-f.x,ey=SHELTER_Y+1-f.y,ed=Math.hypot(ex,ey);f.x+=ex/(ed||1)*dt*38;f.y+=ey/(ed||1)*dt*38;f.dir=ex>0?1:-1;}
   else{f.x+=f.dir*36*dt;if(f.x>239-fishRadius(f)||f.x<bankEdge(f.y-5)+fishRadius(f)+2)f.dir*=-1;}
   keepInWater(f);if(f.flee<=0){f.mode=f.toShelter?'return':'swim';f.toShelter=false;}return;}
  var eligible=s.phase==='wait'&&s.lureY>SURFACE+9&&d<k.notice&&(!k.bottom||(s.lureY>120&&s.quiet>=2.4));
  if(k.rare&&s.nudgeAge<.13&&d<28){f.mode='flee';f.flee=1.8;f.dir=dx>0?-1:1;f.toShelter=true;return;}
  if(eligible){f.watch+=dt;f.dir=dx>=0?1:-1;f.mode=f.watch<k.watch?'look':'approach';
   if(f.mode==='approach'){var move=Math.min(d,k.chase*dt);f.x+=dx/(d||1)*move;f.y+=dy/(d||1)*move;keepInWater(f);if(Math.hypot(s.bobX-f.x,s.lureY-f.y)<4.5)hook(s,f);}
  }else{f.watch=0;var moment=s.wildlife&&s.wildlife.moment;
   if(s.phase==='idle'&&moment&&moment.fishId===f.id){
    if(moment.kind==='hover'){if(moment.age>.85)f.dir=-moment.dir;return;}
    var dx=moment.x-f.x,dy=moment.y-f.y,distance=Math.hypot(dx,dy),move=Math.min(distance,dt*6);
    f.x+=dx/(distance||1)*move;f.y+=dy/(distance||1)*move;keepInWater(f);return;
   }
   if(f.mode==='shelter'){f.rest-=dt;f.y+=Math.sin(s.clock/900+f.wave)*dt*.8;if(f.rest<=0){f.mode='swim';f.dir=1;f.shelterCooldown=14;}}
   else if(f.mode==='return'){var rx=SHELTER_X-f.x,ry=SHELTER_Y+1-f.y,rd=Math.hypot(rx,ry);f.x+=rx/(rd||1)*dt*14;f.y+=ry/(rd||1)*dt*14;f.dir=rx>0?1:-1;if(rd<3){f.mode='shelter';f.rest=3.5;f.dir=1;}}
   else{f.mode='swim';f.x+=f.dir*k.speed*dt;if(f.x>239-fishRadius(f)||f.x<bankEdge(f.y-5)+fishRadius(f)+2){f.dir*=-1;f.home=homeDepth(f,++f.turns);}
    f.y+=(f.home+Math.sin(s.clock/900+f.wave)*2-f.y)*Math.min(1,dt*2);
    if((f.type===2||k.rare)&&f.shelterCooldown<=0&&f.x<85){f.mode='return';}}
   keepInWater(f);
  }}
 function step(s,dt){s.clock+=dt*1000;s.ms+=dt*1000;s.nudgeAge+=dt;s.impact=Math.max(0,s.impact-dt);
  updateWater(s,dt);updateFisher(s,dt);
  if(s.phase==='log')return;
  if(s.phase==='cast'){var tip=fisherPose(s).tip,t=clamp((s.ms-CAST_RELEASE_MS)/(CAST_MS-CAST_RELEASE_MS),0,1);
   s.bobX=tip.x+(s.targetX-tip.x)*t;s.bobY=tip.y+3+(SURFACE-tip.y-3)*t-Math.sin(t*Math.PI)*23;
   if(t===1){s.phase='wait';s.ms=0;splash(s,s.bobX,SURFACE,'cast',1);event(s,'water');}
  }else if(s.phase==='wait'){s.quiet+=dt;s.bobY=SURFACE+Math.floor(s.clock/300)%2;s.lureY=Math.min(bedY(s.bobX)-7,s.lureY+11*dt);
  }else if(s.phase==='hit'){
   if(s.ms>=HIT_MS){s.phase='reel';s.ms=0;}
  }else if(s.phase==='reel'){updateFight(s,s.pool.find(function(o){return o.id===s.hookId;}),dt);
  }else if(s.phase==='land'&&s.ms>=LAND_MS){s.phase='result';s.ms=0;}
  else if(s.phase==='result'&&s.held&&s.pressPhase==='result'&&s.clock-s.pressMs>=600){s.phase='log';s.ms=0;}
  if(s.phase!=='land'&&(s.phase!=='result'||!s.fish))s.pool.forEach(function(f){updateFish(s,f,dt);
   if(s.phase==='result'&&s.escapeFx&&f.id===s.escapeFx.fishId&&s.ms<650){f.y+=(s.escapeFx.diveY-f.y)*Math.min(1,dt*4);keepInWater(f);}});
  updateWildlife(s,dt);reactToFish(s,dt);
  if(s.refill>0){s.refill-=dt;if(s.refill<=0){s.pool=s.pool.filter(function(f){return f.alive;});var replacement=spawn(s,s.refillSlot===5?extraType(s):s.refillType,225);replacement.slot=s.refillSlot;s.pool.push(replacement);}}}
 function update(s,dt){if(!s||!Number.isFinite(dt)||dt<=0)return;s.accum+=Math.min(dt,30);while(s.accum+1e-9>=1/60){step(s,1/60);s.accum-=1/60;}}
 function leave(s){if(!s)return;release(s,true);s.phase='idle';s.ms=0;s.hookId=null;s.fish=null;s.escapeFx=null;s.fight=null;s.bracing=false;s.angry=false;s.tension=0;s.message='';s.events=[];s.sfx=[];s.particles=[];if(s.wildlife)s.wildlife.moment=null;s.pool.forEach(function(f){f.mode='swim';f.watch=0;});}
 function contains(r,x,y){return x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h;}
 function button(ctx,r,text,pressed){var P=global.DotPalette.COLORS,F=global.DotFont;ctx.fillStyle=P[15];ctx.fillRect(r.x,r.y,r.w,r.h);ctx.fillStyle=P[pressed?14:10];ctx.fillRect(r.x+1,r.y+1,r.w-2,r.h-2);F.drawText(ctx,text,r.x+Math.floor((r.w-F.textWidth(text.length))/2),r.y+Math.floor((r.h-F.GLYPH_H)/2),P[16]);}
 // Opaque, discrete water swatches mixed from the world's existing cyan / green / navy.
 function mixColor(a,b,t){var n=0;for(var i=1;i<7;i+=2)n=(n<<8)|Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t);return '#'+('000000'+n.toString(16)).slice(-6);}
 var waterPalette=null;
 // 2026-09-19: the night pond (tools/pond2bg.py -> js/fishing-pond-art.js) is drawn 1:1, decoded once.
 // Static art = the picture. Everything that moves (fish, angler, rod, line, float, water effects) is drawn on top.
 var pondArt=null;
 function pond(){if(pondArt)return pondArt;var A=global.DotFishingPondArt;if(!A)return null;
  var raw=global.atob(A.rgb),n=A.w*A.h,hex=[],runs=[],canvas=null,i,x,y;
  for(i=0;i<n;i++)hex.push('#'+('00000'+((raw.charCodeAt(i*3)<<16)|(raw.charCodeAt(i*3+1)<<8)|raw.charCodeAt(i*3+2)).toString(16)).slice(-6));
  for(y=0;y<A.h;y++){var x0=0;for(x=1;x<=A.w;x++)if(x===A.w||hex[y*A.w+x]!==hex[y*A.w+x0]){runs.push(x0,y,x-x0,hex[y*A.w+x0]);x0=x;}}
  if(typeof document!=='undefined'&&document.createElement){canvas=document.createElement('canvas');canvas.width=A.w;canvas.height=A.h;
   var c=canvas.getContext&&canvas.getContext('2d');if(c&&c.createImageData){var im=c.createImageData(A.w,A.h);
    for(i=0;i<n;i++){im.data[i*4]=raw.charCodeAt(i*3);im.data[i*4+1]=raw.charCodeAt(i*3+1);im.data[i*4+2]=raw.charCodeAt(i*3+2);im.data[i*4+3]=255;}c.putImageData(im,0,0);}else canvas=null;}
  pondArt={hex:hex,runs:runs,canvas:canvas};return pondArt;}
 // The picture's own colour at a point, so drifting motes, shadows and wakes are tints of the real water.
 function pondHex(x,y){var b=pond();return b?b.hex[clamp(Math.round(y),0,159)*240+clamp(Math.round(x),0,239)]:'#10355a';}
 // A painted leaf at this point (the distant shadow passes behind the weeds, not in front of them).
 function weedy(x,y){var h=pondHex(x,y),r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return (g>r+20&&g>b+5)||(g>r+30&&b-g<32)||(r>g+40&&r>b+10);}
 function drawPond(ctx){var b=pond();if(!b){ctx.fillStyle='#10355a';ctx.fillRect(0,0,240,160);return;}
  if(b.canvas&&ctx.drawImage){ctx.drawImage(b.canvas,0,0);return;}
  for(var i=0;i<b.runs.length;i+=4){ctx.fillStyle=b.runs[i+3];ctx.fillRect(b.runs[i],b.runs[i+1],b.runs[i+2],1);}}
 // ---- 2026-09-19: quiet time in the painted pond (Shima: "the picture itself should live, 95% still") ----
 // The picture is split once into a still plate and the few things that may move. Only water, sky and weeds move:
 //   clouds    : painted cloud pixels (blue only, never tree tips) drift a pixel every ~9-14 s
 //   surface   : glints right of the dock posts, the moon's path and the cabin's reflection break up with a wave
 //   shafts    : the painted light shafts are taken out of the plate and redrawn from their own shape, refracted
 //               by that wave ~0.7 s later (top shifts, bends mid-way, widens, splits, thins out at depth)
 //   water     : a faint, slowly changing caustic net on water pixels only (fish are drawn on top, never warped)
 //   weeds     : the brighter painted leaves bend from a fixed root
 //   bubbles   : the painted bubble columns are removed; the game's own rising bubbles start from their feet (VENTS)
 // Dock, bank, roots, posts, lantern and the angler are never part of any moving layer.
 // Rebuilt at most LIFE_FPS times a second into one canvas.
 var LIFE_FPS=15,LIFE_ON=1,life=null;
 // Where the painted bubble columns stood: [x, top, bottom]. Their feet now release real bubbles.
 var VENTS=[[26,79,101],[77,105,123],[122,94,111],[186,83,126],[229,72,87]];
 function lifeNoise(x,y,seed){var ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
  function h(a,b){return waterNoise(seed,(a&1023)*1031+(b&1023)*7+13);}
  return (h(ix,iy)*(1-fx)+h(ix+1,iy)*fx)*(1-fy)+(h(ix,iy+1)*(1-fx)+h(ix+1,iy+1)*fx)*fy;}
 var LIFE_BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
 function prepareLife(){if(life)return life;var A=global.DotFishingPondArt,b=pond();if(!A||!b||!b.canvas)return null;
  var raw=global.atob(A.rgb),W=240,H=160,N=W*H,base=new Uint8ClampedArray(N*4),i,x,y,k;
  for(i=0;i<N;i++){base[i*4]=raw.charCodeAt(i*3);base[i*4+1]=raw.charCodeAt(i*3+1);base[i*4+2]=raw.charCodeAt(i*3+2);base[i*4+3]=255;}
  var plate=new Uint8ClampedArray(base),cut=new Uint8Array(N);
  function c(x,y){var k=(y*W+x)*4;return [base[k],base[k+1],base[k+2]];}
  function lum(x,y){var k=(y*W+x)*4;return (base[k]+base[k+1]+base[k+2])/3;}
  function setPlate(x,y,p){var k=(y*W+x)*4;plate[k]=p[0];plate[k+1]=p[1];plate[k+2]=p[2];}
  // Fill marked pixels of a row from the nearest unmarked neighbour on that row (the picture's own colours).
  function fillRow(y,x0,x1,mark){for(var x=x0;x<=x1;x++){if(cut[y*W+x]!==mark)continue;var l=x,r=x;
   while(l>0&&cut[y*W+l]===mark)l--;while(r<W-1&&cut[y*W+r]===mark)r++;setPlate(x,y,c((x-l)<=(r-x)?l:r,y));}}
  var sky=c(120,6);
  function isSky(p){return p[0]===sky[0]&&p[1]===sky[1]&&p[2]===sky[2];}
  // A water pixel: blue-green, not a plant, below the surface line. Used to keep every water layer off the land.
  function isWater(p){return p[2]>=p[0]+40&&p[2]>=p[1]-12&&p[1]<p[2]+30;}
  // The dock posts and the roots of the left bank stand in the water: their dark pixels look like water, so the
  // whole area is kept out of every water layer (only the open water around them moves).
  function structure(x,y){return (x<48&&y<81)||(x<22&&y<101);}
  // Clouds: only the painted cloud blues (strong blue, little green). Tree tips and mountains never qualify.
  function isCloud(p){return p[2]>=125&&p[1]<p[2]*.6&&p[0]<120;}
  var clouds=[];
  for(y=10;y<=19;y++)for(x=42;x<W;x++){var p=c(x,y);if(!isCloud(p)||(y>=17&&x>=140&&x<=200))continue;
   clouds.push({x:x,y:y,c:p,layer:y<=15?0:1});cut[y*W+x]=1;setPlate(x,y,sky);}
  function cloudSpot(x,y){return isSky(c(x,y))||cut[y*W+x]===1;}
  // Surface: bright runs on the water right of the dock posts; warm runs only for the moon and the cabin light.
  var runs=[];
  for(y=52;y<=72;y++){var row=[];for(x=48;x<W;x++)row.push(lum(x,y));var sorted=row.slice().sort(function(a,b){return a-b;}),med=sorted[sorted.length>>1];
   for(x=48;x<W;x++){var q=c(x,y);if(lum(x,y)<=med+28||(q[0]>q[2]&&x<176))continue;var x0=x,cols=[];
    while(x<W&&lum(x,y)>med+28&&!(c(x,y)[0]>c(x,y)[2]&&x<176)){cols.push(c(x,y));cut[y*W+x]=2;x++;}
    runs.push({x:x0,y:y,cols:cols,moon:x0>=176&&x0<=200,id:runs.length});fillRow(y,x0,x-1,2);}}
  // The painted bubble columns leave the still picture.
  VENTS.forEach(function(v){for(var y=v[1];y<=v[2];y++){var s=0,n=0;for(var dx=-7;dx<=7;dx++){if(Math.abs(dx)<4)continue;s+=lum(v[0]+dx,y);n++;}
   for(var x=v[0]-3;x<=v[0]+3;x++){var bc=c(x,y);if(lum(x,y)>s/n+8&&bc[2]>=bc[0]&&bc[1]>=bc[0])cut[y*W+x]=4;}fillRow(y,v[0]-5,v[0]+5,4);}});
  // Light shafts: find the painted ones, remember each row's centre, width and colour, then take them out.
  var shaftMask=new Uint8Array(N);
  // Measured on 3x3-smoothed brightness: the deep water is a two-tone dither and its light dots are not light.
  function soft(x,y){var t=0,n=0;for(var yy=y-1;yy<=y+1;yy++)for(var xx=x-1;xx<=x+1;xx++){if(xx<0||xx>=W)continue;t+=lum(xx,y===yy?y:yy);n++;}return t/n;}
  function nearVent(x,y){return VENTS.some(function(v){return Math.abs(x-v[0])<=2&&y>=v[1]-2&&y<=v[2]+2;});}
  for(y=62;y<124;y++)for(x=0;x<W;x++){var p2=c(x,y);if(!isWater(p2)||structure(x,y)||cut[y*W+x]||nearVent(x,y))continue;var s2=0,n2=0;for(var dx2=-20;dx2<=20;dx2+=4){var xx=x+dx2;if(xx<0||xx>=W)continue;s2+=soft(xx,y);n2++;}
   if(soft(x,y)-s2/n2>3)shaftMask[y*W+x]=1;}
  var seen=new Uint8Array(N),shafts=[];
  for(i=0;i<N;i++){if(!shaftMask[i]||seen[i])continue;var stack=[i],part=[];seen[i]=1;
   while(stack.length){var j=stack.pop();part.push(j);[j-1,j+1,j-W,j+W].forEach(function(k){if(k>=0&&k<N&&shaftMask[k]&&!seen[k]){seen[k]=1;stack.push(k);}});}
   if(part.length<60)continue;
   var rows={};part.forEach(function(j){var jx=j%W,jy=(j-jx)/W;(rows[jy]=rows[jy]||[]).push(jx);});
   var ys=Object.keys(rows).map(Number).sort(function(a,b){return a-b;}),top=ys[0],prof=[];
   ys.forEach(function(yy){var xs=rows[yy],mn=Math.min.apply(null,xs),mx=Math.max.apply(null,xs),col=[0,0,0];if(mx-mn>20)return;
    xs.forEach(function(xx){var cc=c(xx,yy);col[0]+=cc[0];col[1]+=cc[1];col[2]+=cc[2];});
    xs.forEach(function(xx){cut[yy*W+xx]=5;});
    prof.push({y:yy,cx:(mn+mx)/2,w:mx-mn+1,col:[col[0]/xs.length,col[1]/xs.length,col[2]/xs.length]});fillRow(yy,Math.max(0,mn-1),Math.min(W-1,mx+1),5);});
   if(prof.length>=12)shafts.push({top:prof[0].y,bottom:prof[prof.length-1].y,prof:prof,id:shafts.length});}
  // Only the three longest become living light; the rest simply leave the picture (a lake, not a stage).
  shafts=shafts.sort(function(a,b){return b.prof.length-a.prof.length;}).slice(0,3);shafts.forEach(function(sh,i){sh.id=i;});
  // Painted weeds: the brighter leaves above the sand.
  var weeds=[];
  //   Both the bright green and the blue-green leaves (whole plants move, not only their lit edges).
  //   Each clump has its own strength: barely, gently or a little more.
  function leaf(p){return (p[1]>p[0]+20&&p[1]>p[2]+5)||(p[1]>p[0]+30&&p[2]-p[1]<32)||(p[0]>p[1]+40&&p[0]>p[2]+10);}   // green, blue-green, the red weed
  for(y=92;y<143;y++)for(x=0;x<W;x++){var p3=c(x,y);if(!leaf(p3)||cut[y*W+x])continue;
   var h=clamp((146-y)/50,0,1),grp=Math.floor(x/9);weeds.push({x:x,y:y,c:p3,h:h,phase:waterNoise(907,grp)*6.28,period:4200+waterNoise(911,grp)*3400,amp:[1,1.6,2.3][Math.floor(waterNoise(913,grp)*3)]});cut[y*W+x]=3;}
  for(y=92;y<143;y++)fillRow(y,0,W-1,3);
  // The surface band, only a few pixels thick: the painted bright line (SURFACE) stays, the row under it becomes
  // a broken darker line, and the next two rows a touch brighter shallow water. Air above / surface / water below.
  for(x=21;x<W;x++){var ks1=((SURFACE+1)*W+x)*4;if(isWater([plate[ks1],plate[ks1+1],plate[ks1+2]])&&LIFE_BAYER[((SURFACE+1)&3)*4+(x&3)]<11){plate[ks1]*=.82;plate[ks1+1]*=.82;plate[ks1+2]*=.86;}
   for(var sr=2;sr<=3;sr++){var ks2=((SURFACE+sr)*W+x)*4;if(isWater([plate[ks2],plate[ks2+1],plate[ks2+2]])&&LIFE_BAYER[((SURFACE+sr)&3)*4+(x&3)]<(sr===2?7:4)){plate[ks2]+=4;plate[ks2+1]+=10;plate[ks2+2]+=9;}}}
  // Water pixels for the caustic net (from the finished plate, so weeds and land are excluded).
  var water=[],cellOf=[],cells=[],cellId={};for(y=SURFACE+3;y<144;y++)for(x=0;x<W;x++){k=(y*W+x)*4;if(!isWater([plate[k],plate[k+1],plate[k+2]])||cut[y*W+x]||structure(x,y))continue;
   var key=(y>>1)*W+(x>>1);if(cellId[key]===undefined){cellId[key]=cells.length/2;cells.push(x>>1,y>>1);}water.push(y*W+x);cellOf.push(cellId[key]);}
  var canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;var cx=canvas.getContext('2d'),img=cx.createImageData(W,H);
  life={base:base,plate:plate,structure:structure,clouds:clouds,cloudSpot:cloudSpot,runs:runs,shafts:shafts,weeds:weeds,water:water,cellOf:cellOf,cells:cells,cellV:new Float32Array(cells.length/2),isWater:isWater,canvas:canvas,cx:cx,img:img,tick:-1,owner:null};
  return life;}
 // The surface wave: a slow swell travelling across the lake. Glints read it now, the light below a moment later.
 function surfaceWave(x,t,seed){return lifeNoise(x*.045-t/1100,t/2600,seed);}
 function composeLife(L,s){var d=L.img.data,t=s.clock,seed=s.pondSeed||1,W=240,plate=L.plate;d.set(plate);
  function put(x,y,col){if(x<0||x>=W||y<0||y>=160)return;var k=(y*W+x)*4;d[k]=col[0];d[k+1]=col[1];d[k+2]=col[2];}
  function blend(x,y,col,a){if(x<0||x>=W||y<0||y>=160)return;var k=(y*W+x)*4;d[k]+=(col[0]-d[k])*a;d[k+1]+=(col[1]-d[k+1])*a;d[k+2]+=(col[2]-d[k+2])*a;}
  function waterAt(x,y){if(x<0||x>=W||L.structure(x,y))return false;var k=(y*W+x)*4;return L.isWater([plate[k],plate[k+1],plate[k+2]]);}
  function from(x,y,sx){sx=Math.max(0,Math.min(W-1,sx));var k=(y*W+x)*4,q=(y*W+sx)*4;d[k]=plate[q];d[k+1]=plate[q+1];d[k+2]=plate[q+2];}
  // The water band itself: in 10 px pieces the dark and light streaks slip a pixel as the wave passes (never a scroll).
  for(var by=51;by<=72;by++){if(by===SURFACE||by===SURFACE+1)continue;for(var seg=48;seg<W;seg+=10){
   var bdx=Math.round((surfaceWave(seg+5,t-(by>SURFACE?300:0),seed+by)-.5)*2.6);if(!bdx)continue;for(var bx=seg;bx<Math.min(W,seg+10);bx++)from(bx,by,bx-bdx);}}
  // Posts and roots below the surface are seen through the water: in 3-row bands they slip a pixel and back.
  //   Above the surface the dock, bank and roots never move.
  for(var ry=SURFACE+2;ry<101;ry++){var band2=Math.floor((ry-SURFACE)/3);for(var rb=0;rb<2;rb++){
   var rv=lifeNoise(rb*7.3+band2*.61,t/1500-band2*.2,seed+51),rdx=rv>.66?1:rv<.34?-1:0;if(!rdx)continue;
   for(var rx=rb?24:0;rx<(rb?48:24);rx++)if(L.structure(rx,ry))from(rx,ry,rx-rdx);}}
  // Clouds (the slowest thing on screen): upper layer ~1 px / 9 s, lower ~1 px / 14 s, both drifting right.
  var off=[Math.floor(t/9000),Math.floor(t/14000)];
  L.clouds.forEach(function(p){var tx=42+((p.x-42+off[p.layer])%198+198)%198;if(L.cloudSpot(tx,p.y))put(tx,p.y,p.c);});
  // Water: a faint caustic net, evaluated on 2x2 cells, lagging the surface. Depth fades it out.
  var ct=t-500,cv=L.cellV,cl=L.cells;
  // Thin meandering lines where either slow noise crosses its middle: a net, never a filled area.
  for(var m=0;m<cv.length;m++){var gx=cl[m*2],gy=cl[m*2+1];cv[m]=Math.min(Math.abs(lifeNoise(gx*.16+ct/5200,gy*.3-ct/3100,seed+41)-.5),Math.abs(lifeNoise(gx*.1-ct/7000,gy*.22+ct/4700,seed+43)-.5));}
  for(var n=0;n<L.water.length;n++){var j=L.water[n],x=j%W,y=(j-x)/W,depth=(y-SURFACE)/86;
   var band=cv[L.cellOf[n]];if(band>.022)continue;
   if(LIFE_BAYER[(y&3)*4+(x&3)]/16>(1-depth)*.9)continue;var k=j*4,g=(1-band/.022)*9*(1-depth*.7);d[k]+=g*.6;d[k+1]+=g;d[k+2]+=g;}
  // The water itself: in 6 px pieces its two-tone dither slips a pixel, the change reaching the depths later
  // than the surface. Flat colours stay flat; nothing scrolls. Just under the surface the water brightens a touch
  // where the wave is up.
  for(var wy=SURFACE+3;wy<140;wy++){var lag=t-(wy-SURFACE)*25;for(var seg=0;seg<W;seg+=6){
   if(lifeNoise(seg*.21+wy*.05,lag/1700,seed+61)<.74)continue;
   for(var wx=seg;wx<Math.min(W-1,seg+5);wx+=2){if(!waterAt(wx,wy)||!waterAt(wx+1,wy))continue;var ka=(wy*W+wx)*4,kb=ka+4;
    for(var ch=0;ch<3;ch++){var tmp=d[ka+ch];d[ka+ch]=d[kb+ch];d[kb+ch]=tmp;}}}}
  for(var sy2=SURFACE+2;sy2<SURFACE+14;sy2++)for(var sx2=48;sx2<W;sx2++){var wv=surfaceWave(sx2,t-200,seed);if(wv<.62||!waterAt(sx2,sy2))continue;
   if(LIFE_BAYER[(sy2&3)*4+(sx2&3)]/16>(wv-.62)/.38*(1-(sy2-SURFACE)/14))continue;var ks=(sy2*W+sx2)*4;d[ks]+=3;d[ks+1]+=6;d[ks+2]+=6;}
  // Light shafts, redrawn from their own painted shape and refracted by the surface ~0.7 s later.
  L.shafts.forEach(function(sh){var len=sh.bottom-sh.top+1,x0=sh.prof[0].cx,
   lead=Math.round((surfaceWave(x0,t-700,seed)-.5)*2.4);
   sh.prof.forEach(function(r){var dd=(r.y-sh.top)/len,late=t-700-(r.y-sh.top)*14;
    var bend=lead*(1-dd)+(lifeNoise(sh.id*3.1,late/2600-dd*1.4,seed+7)-.5)*3.2*Math.sin(dd*Math.PI),
     wide=r.w+Math.round(dd*5+(lifeNoise(sh.id*5.7+2,late/1900,seed+9)-.5)*3*(.4+dd)),
     split=lifeNoise(sh.id*7.3+4,late/3300,seed+11)>.66&&dd>.25&&wide>=4,
     cx=r.cx+bend,left=Math.round(cx-wide/2),a=.8*(1-dd*.75);
    // Here and there the light breaks off for a few rows, then returns.
    if(lifeNoise(sh.id*2.3+r.y*.09,late/2200,seed+13)<.24)return;
    for(var x=left;x<left+wide;x++){if(!waterAt(x,r.y))continue;var edge=x===left||x===left+wide-1,mid=Math.abs(x-cx)<.8;
     if(split&&mid)continue;var bay=LIFE_BAYER[(r.y&3)*4+(x&3)]/16;if(bay>a*(edge?.5:1))continue;blend(x,r.y,r.col,edge?.4:.65);}});});
  // Glints: each short run shifts by a pixel, grows or shrinks by one, or blinks out, as the wave passes.
  //   The moon's path: above the surface it only frays by a pixel; below it breaks and scatters more the deeper it goes.
  L.runs.forEach(function(r){var w=surfaceWave(r.x,t,seed),v=lifeNoise(r.id*.37,t/(r.moon?900:760),seed+17),under=r.y>=SURFACE;
   if(v<(r.moon?(under?.2:.12):.2))return;
   var shift=Math.round((w-.5)*(r.moon?(under?2.6+(r.y-SURFACE)*.2:2.2):3.2)),len=r.cols.length+(v>.7?1:v<.35&&r.cols.length>1?-1:0);
   for(var i=0;i<len;i++){var gx=r.x+shift+i;if(gx<48)continue;put(gx,r.y,r.cols[Math.min(i,r.cols.length-1)]);}});
  // Weeds: fixed root, the middle moves about a pixel and the tips one or two, bending later the higher they are.
  L.weeds.forEach(function(p){var bend=Math.sin(t/p.period*6.283+p.phase-p.h*1.5)*.7+Math.sin(t/(p.period*.43)+p.phase*2)*.3,dx=Math.round(p.amp*Math.pow(p.h,1.3)*bend);put(p.x+dx,p.y,p.c);});
 }
 // Open night sky at a point right now (clouds as they have drifted; stars count as sky, the moon does not).
 function openSky(s,x,y){if(x<0||x>=240||y<0||y>=160)return false;var sk=pondHex(120,6),L=life;
  if(L&&L.owner===s){var k=(y*240+x)*4,d=L.img.data,hx='#'+('00000'+((d[k]<<16)|(d[k+1]<<8)|d[k+2]).toString(16)).slice(-6);if(hx===sk)return true;}
  else if(pondHex(x,y)===sk)return true;
  return STARS.some(function(st){return st[0]===x&&st[1]===y;});}
 function drawPondLive(ctx,s){var L=LIFE_ON?prepareLife():null;if(!L){drawPond(ctx);return;}
  var tick=Math.floor(s.clock*LIFE_FPS/1000);if(L.owner!==s||L.tick!==tick){composeLife(L,s);L.cx.putImageData(L.img,0,0);L.owner=s;L.tick=tick;}
  ctx.drawImage(L.canvas,0,0);}
 // Night sky: the painted stars twinkle and a rare meteor falls, both read from clock + seed (no objects, no state).
 // [x,y,base step,kind 0 nearly still / 1 faint twinkle / 2 occasional flare,1 = gains a 2nd pixel at its peak]
 // Base steps make the depth: 0 dim / 1 normal / 2 bright (the painted crosses).
 // 2026-09-19: the stars are the ones painted in the pond background (no second star field).
 // Crosses are the bright ones, bright dots the normal ones, the rest dim; only a step away from the base is drawn.
 // Most stay almost still: two crosses flare now and then, half the normal dots and a third of the dim ones twinkle.
 var STARS=(function(){var n={cross:0,normal:0};return ((global.DotFishingPondArt&&global.DotFishingPondArt.stars)||[]).map(function(st,i){
  if(st[2])return [st[0],st[1],2,n.cross++<2?2:0,1];if(st[3]>=215)return [st[0],st[1],1,n.normal++%2?0:1];return [st[0],st[1],0,i%3?0:1];});})();
 // One meteor chance per minute of pond time, at an irregular point in the middle of the slot:
 // about 80 s apart on average, never closer than ~30 s, and now and then several quiet minutes.
 var METEOR_SLOT=60000,METEOR_CHANCE=.75,starColors=null;
 function skyColors(){if(!starColors){var P=global.DotPalette.COLORS;starColors=[.28,.48,.72].map(function(t){return mixColor(P[10],P[15],t);});starColors.push(P[16]);}return starColors;}
 // Smooth between hashed knots, so a brightness threshold is crossed at most once per knot (no flicker).
 function skyNoise(seed,index,t){var i=Math.floor(t),f=t-i;f=f*f*(3-2*f);return waterNoise(seed,index+i)*(1-f)+waterNoise(seed,index+i+1)*f;}
 // A slow gate gives long rests; inside it a faster beat steps dim -> brighter -> brighter -> dim.
 // Bright stars never dip below their base: they only swell one step now and then (step 4 = white + a 2nd pixel).
 function starStep(s,k,calm,flash){var star=STARS[k],seed=s.pondSeed||1,base=star[2];if(calm)return base;
  var gate=skyNoise(seed,(k+1)*0x100000,s.clock/(5000+waterNoise(seed,k*7+900)*7000)),beat=skyNoise(seed,(k+1)*0x100000+0x80000,s.clock/(380+waterNoise(seed,k*7+901)*420));
  var open=clamp((gate-[.9,.72,.76][star[3]])/.14,0,1),v=.5+(beat-.5)*open,bright=base>=2,d=bright?(v>.78?1:0):star[3]===2&&v>.8?2:v>.64?1:v<.24?-1:0;
  return clamp(base+d,bright?base:0,flash?4:Math.max(2,base));}
 function meteorAt(s){var seed=s.pondSeed||1,slot=Math.floor(s.clock/METEOR_SLOT);function h(n){return waterNoise(seed,0x7000000+slot*12+n);}
  if(h(0)>=METEOR_CHANCE)return null;
  var age=s.clock-(slot*METEOR_SLOT+METEOR_SLOT*(.25+h(1)*.5)),dur=360+h(2)*240;if(age<0||age>=dur)return null;
  var dir=h(5)<.65?-1:1;
  return {age:age,dur:dur,dir:dir,x:Math.round((dir<0?70:20)+h(3)*150),y:Math.round(2+h(4)*8),slope:.35+h(6)*.3,speed:.045+h(7)*.02,tail:3+Math.floor(h(8)*3),level:h(9)<.35?2:3};}
 function waterColors(){if(!waterPalette){var P=global.DotPalette.COLORS,clear=mixColor(P[8],P[4],.5);waterPalette=[.85,.69,.54,.40,.28,.16].map(function(t){return mixColor(P[10],clear,t);});waterPalette.push(mixColor(clear,P[16],.43),mixColor(clear,P[16],.18));}return waterPalette;}
 function drawWater(ctx,s,front,quiet,flash){var C=waterColors(),P=global.DotPalette.COLORS,clock=quiet?Math.floor(s.clock/180)*180:s.clock;
  function px(x,y,w,h,col){x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);var right=Math.min(240,x+w),bottom=Math.min(FLOOR,y+h);y=Math.max(front?8:SURFACE,y);if(right<=x||bottom<=y)return;ctx.fillStyle=col;
   for(var yy=y;yy<bottom;yy++){var left=Math.max(0,x,bankEdge(yy));if(right>left)ctx.fillRect(left,yy,right-left,1);}}
  if(!front){
   // Six possible 1px motes, with different long rests. Usually only two or three show.
   // Draw behind light, fish and fishing line; this is suspended matter, not sparkle.
   if(observing(s)&&!quiet){
    for(var mote=0;mote<6;mote++){var seed=s.pondSeed||1,period=26000+waterNoise(seed,mote*5)*14000,age=(clock+waterNoise(seed,mote*5+1)*period)%period;
     if(age>15000)continue;
     var mx=25+waterNoise(seed,mote*5+2)*195+Math.sin(age/9000+mote)*4,my=SURFACE+9+waterNoise(seed,mote*5+3)*70-age/6000;
     if(mx<bankEdge(my)+8||my>bedY(mx)-5||!clearWaterPoint(s,mx,my))continue;
     px(mx,my,1,1,mixColor(pondHex(mx,my),C[6],age<2500||age>12500?.12:.22));
   }}
   var moment=s.wildlife&&s.wildlife.moment;
   if(!quiet&&moment&&moment.kind==='shadow'){
    // Far behind the playable fish: no eyes, highlight, hitbox or feeding response. Startled, it sinks and darkens.
    var fled=moment.startled!=null?Math.min(12,(moment.age-moment.startled)*16):0,shade=.4+fled*.012;
    var cx=274-(moment.progress||0)*308,cy=moment.y+fled;
    for(var col=-22;col<=22;col++){var half=Math.round(Math.sqrt(Math.max(0,1-col*col/484))*4);
     for(var row=-half;row<=half;row++){if(Math.abs(row)===half&&(col&1))continue;
      if(s.phase==='wait'&&Math.abs(cx+col-s.bobX)<8)continue;if(weedy(cx+col,cy+row))continue;px(cx+col,cy+row,1,1,mixColor(pondHex(cx+col,cy+row),'#020c1c',shade));}}
    for(var fin=0;fin<7;fin++){if(s.phase==='wait'&&Math.abs(cx+22+fin-s.bobX)<8)continue;
     px(cx+22+fin,cy-Math.floor(fin*.6),1,1+Math.floor(fin*.6)*2,mixColor(pondHex(cx+22+fin,cy),'#020c1c',shade));}
   }
   return;
  }
  // Irregular reflections and a locally displaced surface around a struggling giant.
  if(!quiet&&s.waterKick>0)for(var sx=SHORE;sx<240;sx+=3){var kick=s.waterKick*Math.max(0,1-Math.abs(sx-(s.waterKickX||150))/44),dy=Math.round(Math.sin(clock/160+sx*.17)*kick*3);if(!dy)continue;
   if(dy>0)px(sx,SURFACE,3,dy,pondHex(sx,SURFACE-2));else px(sx,SURFACE+dy+1,3,-dy,pondHex(sx,SURFACE+3));px(sx,SURFACE+dy,3,1,C[7]);}
  s.bubbles.forEach(function(b){if(b.age<0)return;
   if(b.ambient){if(!quiet&&observing(s)&&clearWaterPoint(s,b.x,b.y))px(b.x,b.y,1,1,mixColor(pondHex(b.x,b.y),C[6],b.vent?.7:.3));return;}
   var size=b.size===3?2:b.size;
   if(size===1)px(b.x,b.y,1,1,C[6]);else{px(b.x,b.y,size,1,C[6]);px(b.x-1,b.y+1,1,size-1,C[7]);px(b.x+size,b.y+1,1,size-1,C[2]);px(b.x,b.y+size,size,1,C[3]);}});
  s.wakes.forEach(function(w){var t=w.age/w.life,length=Math.max(1,Math.round((1-t)*(3+w.power*3))),shift=t*3,color=w.y>SURFACE+25?mixColor(pondHex(w.x,w.y),C[6],.28):C[7];
   for(var side=-1;side<=1;side+=2)for(var i=0;i<length;i++){if(t>.6&&i%2)continue;
    px(w.x+w.dx*(i+shift)-w.dy*side*2,w.y+w.dy*(i+shift)+w.dx*side*2,1,1,color);}});
  s.ripples.forEach(function(r){if(r.ambient&&(quiet||!observing(s)||!clearWaterPoint(s,r.x,SURFACE)))return;
   // The pixel ring Shima liked, now lying on the surface: centred on SURFACE and only a pixel thick above (the far
   // arc, darker and thinner) and below (the near arc, brighter). It widens into a flat ellipse, breaks up as it
   // spreads, and at the end only its left and right tips remain before it fades.
   for(var ring=0;ring<r.rings;ring++){var age=r.age-ring*.12;if(age<0||age>1.05)continue;var t=age/1.05,rx=2+t*(10+16*r.power),ry=t<.08?0:1,segments=40;
   for(var part=0;part<segments;part++){if(t>.3&&((part*7+ring*3)%13)<(t-.3)*17)continue;var a=part/segments*Math.PI*2,sn=Math.sin(a),far=sn<-.2;
    if(t>.72&&Math.abs(Math.cos(a))<.85)continue;if(far&&part%2)continue;
    px(r.x+Math.cos(a)*rx,SURFACE+Math.round(sn*ry),part%3?1:2,1,far?C[7]:t<.4?C[6]:C[7]);}}});
  s.jets.forEach(function(j){var frame=Math.floor(j.age/.05),rise=Math.sin(Math.min(1,j.age/.4)*Math.PI),height=(j.kind==='cast'?9:j.kind==='bite'?7:12)*j.power*rise*(quiet?.5:1);
   for(var col=-2;col<=2;col++){var h=height*(1-Math.abs(col)*.19);px(j.x+col*2,SURFACE-h,2,h,C[col%2?7:6]);px(j.x+col*2-1,SURFACE-h-1,2,2,C[6]);}
   if(j.kind==='bite'&&frame===0&&flash!==false&&!quiet)px(j.x-3,SURFACE-3,6,2,P[16]);
   if(j.power>1.7)for(var foam=0;foam<6;foam++)px(j.x-9+foam*4,SURFACE+foam%2,2,1,C[6]);
  });
  s.particles.forEach(function(p){px(p.x,p.y,p.size,p.size+(p.vy>0?1:0),p.life>.25?C[6]:C[7]);});
 }
 function drawPlants(ctx,s,front,quiet){var P=global.DotPalette.COLORS,C=waterColors();
  function pixel(x,y,color,width){x=Math.round(x);y=Math.round(y);if(y<SURFACE||y>=bedY(x)||x<bankEdge(y)||x>=240)return;ctx.fillStyle=color;ctx.fillRect(x,y,width||1,1);}
  function stem(x,y,xx,yy,color,width){var n=Math.ceil(Math.max(Math.abs(xx-x),Math.abs(yy-y)));for(var i=0;i<=n;i++)pixel(x+(xx-x)*i/(n||1),y+(yy-y)*i/(n||1),color,width);}
  s.plants.forEach(function(p){if(p.front!==front)return;
   var moment=s.wildlife&&s.wildlife.moment,nibble=!quiet&&s.phase==='idle'&&moment&&moment.kind==='browse'&&moment.plantX===p.x&&moment.age>3?Math.sin((moment.age-3)*9)*.9:0;
   var clock=Math.floor(s.clock/110)*110,tilt=Math.round(p.lean+Math.sin(clock/p.period*6.28+p.phase)*p.amp*(quiet?.4:1)+p.push*(quiet?.35:1)+nibble);
   var h=p.height,midX=p.x+tilt*.35,midY=p.y-h*.5,tipX=p.x+tilt,tipY=p.y-h,base=front?P[12]:mixColor(P[12],C[4],.3),lit=front?P[4]:mixColor(P[4],C[3],.35);
   stem(p.x,p.y-1,midX,midY,base);stem(midX,midY,tipX,tipY,base,p.kind===4?2:1);
   if(p.kind===1){stem(midX,midY,p.x-4+tilt,tipY+4,lit);stem(midX,midY+2,p.x+4+tilt,tipY+2,base);}
   else if(p.kind===2){stem(p.x,p.y-1,p.x-3+tilt,p.y-h*.7,lit);stem(p.x,p.y-1,p.x+3+tilt,p.y-h*.8,base);}
   else if(p.kind===3){for(var leaf=0;leaf<3;leaf++){var ly=p.y-3-leaf*4,lx=p.x+tilt*(leaf+1)*.2,side=leaf%2?1:-1;
    stem(lx,ly,lx+side*4,ly-3,base);pixel(lx+side*2,ly-2,lit,2);pixel(lx+side*3,ly-3,lit,2);}}
   else{stem(midX,midY,midX-3+tilt*.3,midY-4,lit);if(p.kind===4)stem(midX,midY+5,midX+3,midY+1,lit);}
   pixel(tipX,tipY,lit);
  });
 }
 function draw(ctx,s,pressed,paused,options){var P=global.DotPalette.COLORS,F=global.DotFont,opt=options||{},quiet=!!opt.reduced;
  function box(x,y,w,h,color){ctx.fillStyle=typeof color==='string'?color:P[color];ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));}
  function text(t,x,y,color){F.drawText(ctx,t,Math.round(x),Math.round(y),P[color]);}
  function center(t,y,color){text(t,(240-F.textWidth(t.length))/2,y,color);}
  function line(x,y,xx,yy,color){var n=Math.ceil(Math.max(Math.abs(xx-x),Math.abs(yy-y)));for(var i=0;i<=n;i++)box(x+(xx-x)*i/(n||1),y+(yy-y)*i/(n||1),1,1,color);}
  function numerals(t,x,y,color,scale){var font=F.NUM||F;if(!t.split('').every(function(ch){return font.has(ch);}))font=F;
   scale=scale||1;ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);font.drawText(ctx,t,0,0,P[color]);ctx.restore();}
  function sparkle(x,y,color){box(x,y-2,1,5,color);box(x-2,y,5,1,color);}
  function returnMark(x,y){line(x+6,y-3,x+6,y+1,7);line(x+6,y+1,x,y+1,7);box(x,y,2,3,7);box(x+2,y-1,1,5,7);}
  function collected(){return SPECIES.filter(function(k,i){return !!s.records[i];}).length;}
  function fish(f,x,y,scale,shadow){var k=SPECIES[f.type],len=clamp(Math.round(f.cm/3),5,22),height=k.bottom?3:clamp(Math.round(len*.45),3,8),dir=f.dir||1,b=f.id===s.hookId&&f.mode==='hooked'&&s.phase==='reel'?s.fight:null;
   var rest=s.phase==='idle'&&s.wildlife&&s.wildlife.moment&&s.wildlife.moment.fishId===f.id;
   var active=b&&(b.state==='warn'||b.state==='struggle'),tail=Math.floor(s.clock/(active?65:rest||b&&b.state==='tired'?280:140)+f.id)%2,body=shadow?(typeof shadow==='number'?shadow:5):k.color;
   var live=scale===1&&!shadow&&f.alive,depth=live?clamp(Math.floor((y-SURFACE-4)/20)+(x<bankEdge(y)+30?1:0),0,4):0;
   // 2026-09-19: a touch of the pond's own water at that depth, a lit back and a shaded belly, so the fish
   // sit in the picture. Species colour, eye and markings stay readable (which fish takes the bait is the game).
   if(live)body=mixColor(P[k.color],pondHex(x,y+height),.1+depth*.07);
   var back=live?mixColor(body,'#ffffff',.2):body,belly=live?mixColor(body,'#001428',.32):body;
   // Rotate the complete, unchanged sprite. Inverse nearest-neighbour sampling
   // keeps the outline solid; bending columns used to tear small diving fish apart.
   var angle=active&&(b.action==='dive'||b.action==='surface')?(b.action==='dive'?1:-1)*Math.PI/10:0,pixels=angle?[]:null;
   function px(a,row,w,h,col){if(!angle){box(x+(dir>0?a:-a-w)*scale,y+row*scale,w*scale,h*scale,col);return;}
    for(var iy=0;iy<h;iy++)for(var ix=0;ix<w;ix++)pixels[(Math.round(row)+iy+16)*40+Math.round(a)+ix+20]=col;}
   px(-len/2,-height/2,len,height,body);px(-len/2+2,-height/2-1,len-4,1,body);px(-len/2-3,-2-tail,2,4+tail*2,body);px(-len/2-1,-1,2,2,body);
   if(live&&height>=4){px(-len/2+1,-height/2,len-2,1,back);px(-len/2+1,height/2-1,len-3,1,belly);}
   if(!shadow){px(len/2-2,-1,1,1,depth>2?10:9);px(-1,Math.floor(height/2),3,1,depth>2?waterColors()[2]:k.rare?18:15);if(f.type===1){px(-2,-height/2,1,height,12);if(depth<3)px(1,-height/2,1,height,12);}if(f.type===2&&depth<3){px(-2,-1,1,1,21);px(1,1,1,1,21);}}
   if(angle){var cos=Math.cos(angle),sin=Math.sin(angle);
    for(var ry=-12;ry<=12;ry++)for(var rx=-18;rx<=18;rx++){var sourceX=Math.round(rx*cos+ry*sin),sourceY=Math.round(-rx*sin+ry*cos),color=pixels[(sourceY+16)*40+sourceX+20];
     if(color!==undefined)box(x+(dir>0?rx:-rx-1)*scale,y+ry*scale,scale,scale,color);}}
  }
  box(0,0,240,160,10);ctx.save();
  if(s.impact>0&&opt.shake!==false&&!quiet)ctx.translate(Math.floor(s.clock/35)%2?1:-1,0);
  if(quiet)drawPond(ctx);else drawPondLive(ctx,s);
  // Once a fish is on (or a card is up) the stars hold still and no meteor falls.
  var sky=skyColors(),calmSky=quiet||['idle','cast','wait'].indexOf(s.phase)<0,flashSky=opt.flash!==false;
  // The painted star shows as it is; a brighter step turns it whiter, a dimmer step sinks it into the sky.
  for(var sk=0;sk<STARS.length;sk++){var st=STARS[sk],lit=starStep(s,sk,calmSky,flashSky);if(lit===st[2])continue;
   var own=pondHex(st[0],st[1]),night=pondHex(st[0]-3,st[1]);
   // Strong enough to notice on a phone: one step up = white, two = a small cross, down = nearly gone.
   //   (the quiet twinkle only; the clear white glints and crosses are the separate events below)
   var up=lit-st[2];box(st[0],st[1],1,1,up<0?mixColor(own,night,.8):mixColor(own,P[16],.35));}
  // Every star has its own irregular windows. Bright ones: white -> small cross -> white. Normal ones: a white
  // flash. Dim ones: one step brighter. About three noticeable glints in 15 s, never together.
  if(!calmSky)for(var gi=0;gi<STARS.length;gi++){var gs=STARS[gi],seedG=s.pondSeed||1,tier=gs[2],
   per=[8000,9000,6500][tier]+waterNoise(seedG,gi*17+3)*[5000,5000,4000][tier],dur=[450,550,900][tier],chance=[.15,.25,.5][tier];
   var shifted=s.clock+waterNoise(seedG,gi*17+5)*per,slot=Math.floor(shifted/per),at=shifted-slot*per-waterNoise(seedG,gi*17+slot*29+7)*(per-dur);
   if(waterNoise(seedG,gi*31+slot*13+11)>chance||at<0||at>=dur)continue;var e=at/dur,own=pondHex(gs[0],gs[1]);
   box(gs[0],gs[1],1,1,tier?P[16]:mixColor(own,P[16],.5));
   if(tier===2&&e>.25&&e<.7&&flashSky){var arm2=mixColor(own,P[16],.7);box(gs[0]+1,gs[1],1,1,arm2);box(gs[0]-1,gs[1],1,1,arm2);box(gs[0],gs[1]-1,1,1,arm2);box(gs[0],gs[1]+1,1,1,arm2);}}
  var meteor=!quiet&&observing(s)?meteorAt(s):null;
  if(meteor){var run=Math.floor(meteor.age*meteor.speed),fading=meteor.age>meteor.dur*.7?1:0,head=Math.min(meteor.level-fading,flashSky?3:2);
   // The farthest layer of the sky: it passes behind clouds, mountains and trees, and once its path meets one
   // it has gone beyond them (nothing further along is drawn).
   var gone=run+1;for(var ga=0;ga<=run;ga++)if(!openSky(s,meteor.x+meteor.dir*ga,meteor.y+Math.round(ga*meteor.slope))){gone=ga;break;}
   for(var mi=0;mi<=Math.min(meteor.tail-fading*2,run);mi++){var along=run-mi;if(along>=gone)continue;box(meteor.x+meteor.dir*along,meteor.y+Math.round(along*meteor.slope),1,1,sky[Math.max(0,head-(mi?mi<2?1:2:0))]);}}
  drawWater(ctx,s,false,quiet,opt.flash);
  drawPlants(ctx,s,false,quiet);
  s.bottomFinds.forEach(function(o){box(o.x,o.y||FLOOR-4,4,3,5);box(o.x+1,(o.y||FLOOR-4)-1,2,1,7);});
  s.pool.forEach(function(f){if(!f.alive)return;var hooked=f.id===s.hookId,jitter=hooked&&s.angry&&!quiet?Math.floor(s.clock/70)%3-1:0,moment=s.wildlife&&s.wildlife.moment;
   var peck=!quiet&&s.phase==='idle'&&moment&&moment.kind==='browse'&&moment.fishId===f.id&&moment.age>3?Math.max(0,Math.round(Math.sin((moment.age-3)*9)))*f.dir:0;
   fish(f,f.x+jitter+peck,f.y+jitter,1,false);
   if(f.mode==='look')box(f.x+f.dir*6,f.y-3,1,1,16);});
  drawPlants(ctx,s,true,quiet);
  drawWater(ctx,s,true,quiet,opt.flash);
  var pose=fisherPose(s),A=global.DotFishingArt,frame=pose.frame,lost=s.phase==='result'&&!s.fish&&s.escapeFx,age=s.ms;
  var tipX=pose.tip.x,tipY=pose.tip.y;
  if(lost&&lost.broken&&!quiet&&age<280)tipY-=Math.round(Math.sin(age/280*Math.PI)*4);
  for(var ay=0;ay<frame.rows.length;ay++)for(var ax=0;ax<frame.rows[ay].length;ax++){
   var ch=frame.rows[ay][ax],lx=frame.x+ax,ly=frame.y+ay;
   if(ch===' '||(!pose.cast&&lx>=frame.rodCut[0]&&ly<=frame.rodCut[1]))continue;
   box(pose.x+lx,pose.y+ly,1,1,A.colors[ch.charCodeAt(0)-33]);
  }
  if(!pose.cast){var rod=[];
   // Pixel-stamped curve, never canvas vector strokes or antialiased rotation.
   for(var ri=0;ri<=40;ri++){var rt=ri/40,r=1-rt;
    rod.push({x:Math.round(r*r*pose.grip.x+2*r*rt*pose.control.x+rt*rt*tipX),y:Math.round(r*r*pose.grip.y+2*r*rt*pose.control.y+rt*rt*tipY)});}
   rod.forEach(function(p){box(p.x-1,p.y-1,3,3,9);});
   rod.forEach(function(p,i){box(p.x,p.y,1,1,i>30?36:13);});
  }
  // Show the two loose ends separating in the pond, without a failure card.
  if(lost&&age<650){var t=Math.min(1,age/550),cutX=lost.tipX+(lost.x-lost.tipX)*.65,cutY=lost.tipY+(lost.y-lost.tipY)*.65;
   if(lost.broken){
    var endX=cutX+(tipX+9-cutX)*t,endY=cutY+(tipY+12-cutY)*t;
    line(tipX,tipY,(tipX+endX)/2,(tipY+endY)/2+3,15);line((tipX+endX)/2,(tipY+endY)/2+3,endX-2,endY,15);
    var farX=cutX+3+(lost.x-cutX-3)*t,farY=cutY+(SURFACE-cutY)*t;
    if(age<400)line(farX,farY,lost.x,SURFACE,7);
    if(age<120){var pop=quiet?2:2+Math.floor(age/35);box(cutX-pop,cutY-2,1,1,16);box(cutX+pop,cutY+2,1,1,16);box(cutX,cutY-pop,1,1,16);}
    var bobY=SURFACE-(quiet?0:Math.sin(t*Math.PI*3)*(1-t)*3);box(lost.x-1,bobY-3,3,2,16);box(lost.x-1,bobY-1,3,2,17);
    box(lost.x-5-t*7,SURFACE,3,1,8);box(lost.x+3+t*7,SURFACE,3,1,8);
   }else{var hookX=lost.x+(tipX+8-lost.x)*t,hookY=lost.y+(tipY+15-lost.y)*t;
    line(tipX,tipY,hookX,hookY,15);box(hookX,hookY,1,3,7);box(hookX-1,hookY+3,2,1,7);}
  }
  if(['cast','wait','hit','reel'].indexOf(s.phase)>=0){var dangerous=s.tension>.55,limit=s.tension>.83,lineCol=limit?21:15,visible=!limit||quiet||Math.floor(s.clock/90)%2===0;
   if(visible){var midX=(tipX+s.bobX)/2,midY=(tipY+s.bobY)/2+(!s.held&&s.phase==='reel'?7:2);if((dangerous||s.bracing)&&!quiet)midX+=Math.floor(s.clock/70)%3-1;
    line(tipX,tipY,midX,midY,lineCol);line(midX,midY,s.bobX,s.bobY,lineCol);var hooked=s.pool.find(function(f){return f.id===s.hookId;});if(s.phase!=='cast')line(s.bobX,s.bobY+3,hooked?hooked.x:s.bobX,s.lureY,limit?21:7);}
   box(s.bobX-1,s.bobY-3,3,2,16);box(s.bobX-1,s.bobY-1,3,3,17);
   if(s.phase==='wait')box(s.bobX-1,s.lureY,2,2,19);}
  if(s.phase==='hit')text('!',s.bobX-2,SURFACE-15,19);
  if(s.phase==='land'&&s.fish){var t=s.ms/LAND_MS;fish({type:s.fish.type,cm:s.fish.cm,dir:-1,id:0},s.bobX+(HERO_X-s.bobX)*t,(SURFACE+9)*(1-t)+(STAND_Y-12)*t-Math.sin(t*Math.PI)*24,1,false);}
  ctx.restore();
  // 2026-09-15 島さんの指定: 常設の LOG 札をやめ、左上の小さなノート（AIの仮の絵）から記録を開く
  if(s.phase==='idle'){var nx=LOG_ICON.x+3,ny=LOG_ICON.y+2;box(nx,ny,10,12,10);box(nx+1,ny+1,8,10,38);box(nx+8,ny+1,1,10,16);box(nx+3,ny+4,4,1,19);box(nx+3,ny+6,4,1,36);
   for(var ri=0;ri<3;ri++)box(nx,ny+2+ri*3,2,1,15);}
  if(s.phase==='result'&&s.fish){var caught=s.fish,strong=caught.isNew||caught.newRecord||caught.rare||caught.giant||caught.cm>=35;
   var badge=caught.isNew?'FIRST CATCH':caught.newRecord?'NEW RECORD':caught.rare?'RARE CATCH':caught.giant||caught.cm>=35?'BIG CATCH':'CAUGHT';
   var badgeW=F.textWidth(badge.length),badgeX=Math.floor((240-badgeW)/2),accent=strong?19:15;
   // The pond is the stage. A compact specimen label replaces the large blue card.
   if(quiet||s.ms>=280){box(badgeX-6,30,badgeW+12,14,10);text(badge,badgeX,33,accent);}
   var displayLen=clamp(Math.round(caught.cm/3),5,22),displayScale=clamp(Math.floor(78/(displayLen+6)),3,5),settle=quiet?0:Math.round(3*Math.max(0,1-s.ms/240));
   var specimen={type:caught.type,cm:caught.cm,dir:1,id:caught.id};
   // A small solid shadow separates the fish's original pixels from the moving water.
   fish(specimen,123,66-settle+1,displayScale,true);fish(specimen,122,65-settle,displayScale,false);
   line(80,88,164,88,7);for(var tick=0;tick<=14;tick++)box(80+tick*6,86-(tick%7===0?2:0),1,tick%7===0?5:3,15);
   if(strong&&!quiet&&opt.flash!==false&&s.ms>=300&&s.ms<950){var spread=Math.floor((s.ms-300)/180);sparkle(77-spread,60,19);sparkle(166+spread,76,16);}
   if(quiet||s.ms>=160){
    box(20,97,200,42,10);box(22,96,196,41,16);box(24,98,2,37,35);box(28,114,180,1,15);
    text(caught.name,31,102,10);if(caught.rare)sparkle(209,105,18);
    var detail=caught.isNew?'NOTED '+collected()+'/'+SPECIES.length:(caught.newRecord&&caught.previous?'WAS '+caught.previous.toFixed(1)+'cm':'BEST '+(s.records[caught.type]||caught.cm).toFixed(1)+'cm');
    text(detail,31,122,14);
    var size=caught.cm.toFixed(1),num=F.NUM||F,sizeWidth=num.textWidth(size.length)*2+15;
    numerals(size,209-sizeWidth,118,10,2);numerals('cm',196,125,10);
   }
   if(s.ms>=RESULT_GUARD_MS){if(s.ms<3500)text('TAP',180,145,7);returnMark(210,148);}
  }
  if(s.phase==='log'){
   // One compact journal page: empty spaces, witnessed silhouettes, recorded specimens.
   box(9,24,224,130,10);box(7,22,224,129,10);box(20,24,209,125,16);box(22,26,2,121,35);
   for(var binding=0;binding<6;binding++){box(14,33+binding*19,10,2,7);box(14,32+binding*19,2,4,15);}
   text('FIELD NOTES',30,29,10);numerals(collected()+'/'+SPECIES.length,199,30,10);line(30,41,220,41,7);
   SPECIES.forEach(function(k,i){var yy=46+i*19,known=!!s.records[i],seen=known||!!s.seen[i],recent=s.fish&&s.fish.type===i;
    if(recent)box(26,yy,2,17,18);
    numerals(('0'+(i+1)).slice(-2),30,yy+5,14);
    if(seen){box(46,yy+1,26,15,10);fish({type:i,cm:known?clamp(s.records[i],18,32):24,dir:1,id:i},61,yy+8,1,known?false:7);}
    else{for(var dotted=0;dotted<5;dotted++){box(47+dotted*5,yy+1,2,1,7);box(47+dotted*5,yy+15,2,1,7);}box(46,yy+6,1,5,7);box(71,yy+6,1,5,7);}
    text(known?k.name:'???',78,yy+5,known?10:14);
    if(known){var size=s.records[i].toFixed(1)+'cm',font=F.NUM||F;numerals(size,220-font.textWidth(size.length),yy+5,10);
     if(s.records[i]>=k.min+(k.max-k.min)*.9){box(162,yy+4,7,4,18);box(164,yy+8,3,3,18);box(162,yy+11,7,1,18);}}
    else{var status=seen?'SEEN':'UNSEEN';text(status,220-F.textWidth(status.length),yy+5,14);}
    if(i<4)line(30,yy+18,220,yy+18,15);
   });
   if(s.ms<3500)text('TAP',180,140,14);returnMark(212,144);
  }
  if(paused){box(77,69,86,18,10);center('PAUSED',74,16);}
 }
 global.DotFishing={create:create,press:press,release:release,tap:tap,update:update,leave:leave,draw:draw,button:button,contains:contains,ENTRY:ENTRY,LOG_ICON:LOG_ICON,SPECIES:SPECIES,TEXTS:TEXTS,CAST_MS:CAST_MS,CAST_RELEASE_MS:CAST_RELEASE_MS,BITE_MS:HIT_MS,LAND_MS:LAND_MS,RESULT_GUARD_MS:RESULT_GUARD_MS,SURFACE:SURFACE,FLOOR:FLOOR,bankEdge:bankEdge,bedY:bedY,fisherPose:fisherPose,sky:{STARS:STARS,METEOR_SLOT:METEOR_SLOT,starStep:starStep,meteorAt:meteorAt},_life:function(){return prepareLife();}};   // _life: for checking the moving layers in a browser
})(typeof window!=='undefined'?window:globalThis);
