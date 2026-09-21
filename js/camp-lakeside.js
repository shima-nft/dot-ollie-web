// 湖畔の夜キャンプ（2026-09-18 作り直し）
//
// ★島さんの絵（js/camp-lakeside-art.js）は1ピクセルも書き換えない。
//   ここでは毎コマ「1枚のピクセル帳」を組み立てて、液晶へ1回で貼る。
//     1. 元絵から「炎」と「煙」だけを抜き、跡を左右の色のディザで埋めた下絵（plate）
//     2. 湖（深さ・岸の映り込み・月の光のくずれ・水面のすじ・波紋）
//     3. 星（1つずつ、ばらばらの間で瞬く）／草と葉の先（風が左から渡ってくる）
//     4. 人物（まばたき・カップ・火を見る）／カエル（まばたき・のど・目線）
//     5. 焚き火の光（強さ×距離で、段階とディザで暖色にする。ぼかしは使わない）
//     6. 煙（粒が生まれて、のぼって、風に流れて、ほどけて消える）
//     7. 炎（形そのものが毎コマ変わる）・先端のちぎれ・火の粉
//
// ★時間の長さを分けている: 炎と火の粉＝短い／煙・草・湖＝中くらい／人物・カエル・星・出来事＝長い。
//   ぜんぶ「種＋時刻」のノイズと、毎回くじを引き直す休みで決まるので、同じ周期で巻き戻らない。
// ★Math.random() は使わない（世界のサイコロをずらさないため）。
(function(g){
 'use strict';
 var W=240,H=160,N=W*H,art=g.DotLakesideArt,prepared=null;
 var ENTRY={x:170,y:128,w:68,h:30}; // generous hit area around the small foreground sign

 // ================= 調整値 =================
 // 炎: 根元の中心x・根元のy・ふだんの高さ・強さで変わる高さ・根元の半幅・1秒のコマ数
 var FIRE={x:119.5,base:114,h:15,hVar:5,w:8.6,fps:12};
 // 焚き火の光: 届く距離（小さいほど近くだけ）・段数・1段の強さ・計算を打ち切る弱さ・湖への効き
 var LIGHT={r:27,steps:5,k:.085,cut:.05,lake:.1,far:.08,face:.9};
 // 風: 突風が左から右へ渡る速さ(px/秒)・次の突風までの休み・長さ・強さ
 var GUST={speed:42,rest:[12,34],dur:[5,9],amp:[.6,1.1]};
 // 煙: 生まれる間・寿命・のぼる速さ・同時にいられる数
 var SMOKE={every:[.13,.32],life:[6,9.5],rise:[5,7.5],max:56};
 var EMBER_MAX=12;
 var COMPOSE_FPS=30;        // ピクセル帳を組み立て直すのは1秒に最大30回
 var REFL_H=8;              // 対岸が湖に映る深さ(px)
 var CROAK_BEAT=2/5.5;      // カエルが鳴くとき、のどがふくらむ間（秒）。音もこの間で鳴る

 var C={white:[255,246,210],yellow:[255,208,92],orange:[255,146,44],red:[236,82,28],dred:[160,40,22],
  deep:[8,28,56],skyref:[62,98,158],bed:[46,78,84],smokeWarm:[150,118,110],smokeCool:[124,134,166]};

 // ================= 小さな道具 =================
 function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
 function hash(n){n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;}
 function h2(a,b){return hash(Math.imul(a|0,374761393)^Math.imul((b|0)+0x9e37,668265263));}
 function noise(t,seed){var i=Math.floor(t),f=t-i;f=f*f*(3-2*f);return hash(i+seed)*(1-f)+hash(i+1+seed)*f;}
 function vnoise(x,y,seed){var ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
  var a=h2(ix+seed,iy),b=h2(ix+1+seed,iy),c=h2(ix+seed,iy+1),d=h2(ix+1+seed,iy+1);
  return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy;}
 var BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(function(v){return (v+.5)/16;});
 function bayer(x,y){return BAYER[(y&3)*4+(x&3)];}
 function mix(c,d,k){return [c[0]+(d[0]-c[0])*k,c[1]+(d[1]-c[1])*k,c[2]+(d[2]-c[2])*k];}

 // ================= 状態 =================
 function create(seed){
  var opt={};try{opt=JSON.parse(g.localStorage.getItem('dotollie-options'))||{};}catch(e){}
  var s={time:0,seed:(seed>>>0)||1,flash:opt.flash!==0,serial:0,
   embers:[],emberAt:1.2,frags:[],fragAt:.4,puffs:[],puffAt:0,
   flareStart:-99,flareAmp:0,flareAt:13,
   gustStart:-99,gustDur:6,gustAmp:0,gustAt:7,
   blinkAt:3.5,blinkStart:-99,blink2:-99,
   cupAt:31,cupStart:-99,cupUntil:-99,lookAt:17,lookStart:-99,lookUntil:-99,
   frogBlinkAt:6,frogBlinkStart:-99,croakAt:11,croakStart:-99,croakUntil:-99,frogLookAt:26,frogLookUntil:-99,frogPump:0,
   rippleAt:19,rippleStart:-99,rippleX:164,rippleY:90,
   starAt:72,starStart:-99,sfx:[],sfxSeq:0};
  // 入った瞬間から煙が空へ届いているように、見えないところで少しだけ先に進めておく
  for(var i=0;i<80;i++)update(s,.1);
  return s;
 }
 function roll(s){return hash(s.seed+(++s.serial)*7919);}
 // 音のための出来事の記録（★音の側は読むだけ。新しいものだけを番号で見分ける。古いものは自然に押し出される）
 function emit(s,type,data){s.sfxSeq++;var e={n:s.sfxSeq,t:s.time,type:type};for(var k in data)e[k]=data[k];s.sfx.push(e);if(s.sfx.length>16)s.sfx.shift();}
 function range(s,r){return r[0]+roll(s)*(r[1]-r[0]);}

 // 風: ふだんのそよ風 ＋ 左から渡ってくる突風。x が右ほど遅れて届く
 function gustAt(s,t,x){if(!s)return 0;var u=t-x/GUST.speed-s.gustStart;if(u<0||u>s.gustDur)return 0;var e=Math.sin(Math.PI*u/s.gustDur);return s.gustAmp*e*e;}
 function wind(s,t,x){return .2+.16*noise(t*.05,261)+gustAt(s,t,x)+.1*(noise(t*.6+x*.015,733)-.5);}
 // 焚き火の強さ（0〜1ちょっと）。ゆっくり・中くらい・速いゆらぎ ＋ ときどき薪がはぜる
 function flare(s,t){if(!s)return 0;var u=t-s.flareStart;if(u<0)return 0;return s.flareAmp*(u<.18?u/.18:Math.exp(-(u-.18)/1.4));}
 function fireSlow(s,t){return .5+.34*(noise(t*.085,117)-.5)+.3*(noise(t*.57,891)-.5)+flare(s,t);}
 function fireI(s,t){return clamp(fireSlow(s,t)+.24*(noise(t*3.3,52)-.5),0,1.4);}
 function fireHeight(s,t){return FIRE.h+(fireI(s,t)-.5)*2*FIRE.hVar+flare(s,t)*4;}
 function fireLean(s,t){return (wind(s,t,FIRE.x)-.3)*2.4+(noise(t*.8,321)-.5)*1.8;}

 function update(s,dt){
  if(!s||!Number.isFinite(dt)||dt<=0)return;
  s.time+=dt;var t=s.time,i;
  if(t>=s.gustAt){s.gustStart=t;s.gustDur=range(s,GUST.dur);s.gustAmp=range(s,GUST.amp);s.gustAt=t+s.gustDur+W/GUST.speed+range(s,GUST.rest);emit(s,'gust',{amp:s.gustAmp,dur:s.gustDur});}
  if(t>=s.flareAt){s.flareStart=t;s.flareAmp=.22+roll(s)*.3;s.flareAt=t+10+roll(s)*28;emit(s,'pop',{k:s.flareAmp});
   for(i=0;i<3+Math.floor(hash(s.seed+Math.floor(t*10))*4);i++)spawnEmber(s,t+i*.07,1.4);}
  var I=fireI(s,t),tip=FIRE.base-fireHeight(s,t),lean=fireLean(s,t);
  // 火の粉: 火が強いほど出やすい
  s.embers=s.embers.filter(function(e){return t-e.born<e.life;});
  if(t>=s.emberAt){for(var n=1+Math.floor(roll(s)*2.2),k=0;k<n;k++)spawnEmber(s,t+k*.12,1);emit(s,'ember',{i:I});s.emberAt=t+(1.3+roll(s)*3.8)/(.55+I*.9);}
  s.embers.forEach(function(e){if(t<e.born)return;var w=wind(s,t,e.x);e.x+=(e.vx+w*5+Math.sin((t-e.born)*4+e.seed)*2.2)*dt;e.y+=e.vy*dt;e.vy*=Math.pow(.72,dt);});
  // 炎の先がちぎれて、ひとかけら上へ抜ける
  s.frags=s.frags.filter(function(f){return t-f.born<f.life;});
  if(t>=s.fragAt){s.frags.push({born:t,x:FIRE.x+lean+(roll(s)-.5)*4,y:tip+1+roll(s)*2,life:.16+roll(s)*.26,vy:-(15+roll(s)*12)});s.fragAt=t+(.22+roll(s)*.9)/(.6+I*.8);}
  s.frags.forEach(function(f){f.y+=f.vy*dt;f.x+=(wind(s,t,f.x)-.2)*6*dt;});
  // 煙: 1つぶずつ生まれて、のぼって、風で流れて、ほどけて消える
  s.puffs=s.puffs.filter(function(p){return t-p.born<p.life&&p.y>4;});
  if(t>=s.puffAt&&s.puffs.length<SMOKE.max){
   s.puffs.push({born:t,x:FIRE.x+lean*.8+(roll(s)-.5)*1.6,y:tip+1,life:range(s,SMOKE.life),vy:range(s,SMOKE.rise),r0:.45+roll(s)*.45,seed:Math.floor(roll(s)*997),a:.7+roll(s)*.5});
   // ときどき間があく（煙に「かたまり」と「すきま」ができる）
   s.puffAt=t+range(s,SMOKE.every)*(noise(t*.23,77)>.68?3.2:1);
  }
  s.puffs.forEach(function(p){var u=(t-p.born)/p.life,up=Math.max(0,FIRE.base-p.y);
   p.y-=p.vy*(1-.5*u)*dt;
   p.x+=(wind(s,t,p.x)*(1.2+up*.09)+(vnoise(p.y*.07,t*.3+p.seed,55)-.5)*3.4)*dt;});
  // 人物: 不規則なまばたき（ときどき2回）・カップ・火をのぞきこむ
  if(t>=s.blinkAt){s.blinkStart=t;s.blink2=roll(s)<.24?t+.3:-99;var r=roll(s);s.blinkAt=t+2.2+r*r*9;}
  if(t>=s.cupAt){s.cupStart=t;s.cupUntil=t+1.6+roll(s)*2.2;s.cupAt=t+24+roll(s)*42;}
  if(t>=s.lookAt){s.lookStart=t;s.lookUntil=t+3+roll(s)*5;s.lookAt=t+28+roll(s)*50;}
  // カエル: 人とはちがう間でまばたき・のど・目線
  if(t>=s.frogBlinkAt){s.frogBlinkStart=t;s.frogBlinkAt=t+3.5+roll(s)*13;}
  s.frogPump+=dt/(.8+.5*noise(t*.07,606));
  // 鳴く: のどは CROAK_BEAT 秒ごとにふくらむ（前半ふくらむ／後半しぼむ）。音はふくらむ瞬間にそろえる
  if(t>=s.croakAt){s.croakStart=t;s.croakUntil=t+1+roll(s)*2.2;s.croakAt=t+14+roll(s)*30;emit(s,'croak',{dur:s.croakUntil-t,beat:CROAK_BEAT,v:Math.floor(roll(s)*3)});}
  if(t>=s.frogLookAt){s.frogLookUntil=t+2+roll(s)*5;s.frogLookAt=t+18+roll(s)*40;}
  // 湖の波紋（魚が跳ねた）と流れ星は、たまにだけ
  if(t>=s.rippleAt){var a=prepare();s.rippleStart=t;var spot=a.waterSpots[Math.floor(roll(s)*a.waterSpots.length)]||[164,90];s.rippleX=spot[0];s.rippleY=spot[1];s.rippleAt=t+18+roll(s)*27;emit(s,'ripple',{x:spot[0]});}
  if(t>=s.starAt){s.starStart=t;s.starAt=t+85+roll(s)*100;}
 }
 function spawnEmber(s,born,boost){if(s.embers.length>=EMBER_MAX)return;
  s.embers.push({born:born,x:FIRE.x+(roll(s)-.5)*6,y:FIRE.base-6-roll(s)*5,vx:(roll(s)-.5)*3,vy:-(9+roll(s)*9)*boost,life:1+roll(s)*2.3,seed:roll(s)*6});}

 // ================= 下ごしらえ（最初の1回だけ） =================
 function prepare(){
  if(prepared)return prepared;
  var raw=g.atob(art.rgb),orig=new Uint8ClampedArray(N*4);
  for(var i=0;i<N;i++){orig[i*4]=raw.charCodeAt(i*3);orig[i*4+1]=raw.charCodeAt(i*3+1);orig[i*4+2]=raw.charCodeAt(i*3+2);orig[i*4+3]=255;}
  var plate=new Uint8ClampedArray(orig);
  function P(x,y){var j=(y*W+x)*4;return [plate[j],plate[j+1],plate[j+2]];}
  function O(x,y){var j=(y*W+x)*4;return [orig[j],orig[j+1],orig[j+2]];}
  function put(x,y,c){var j=(y*W+x)*4;plate[j]=c[0];plate[j+1]=c[1];plate[j+2]=c[2];}
  var x,y,c;

  // --- 1. 炎と煙を抜く（跡は左右の色をディザでつなぐ ＝ 新しい色を作らない） ---
  var cut=new Uint8Array(N),smoke=new Uint8Array(N);
  for(y=86;y<=113;y++)for(x=106;x<=133;x++){c=O(x,y);
   var span=y>=98?1.8+8.2*(y-98)/15:5,inFlame=Math.abs(x-FIRE.x)<=span;
   if(inFlame&&c[0]>175&&c[0]>c[2]*1.6&&y>=97)cut[y*W+x]=1;              // 炎
   else if(y<104&&c[0]>90&&c[0]>c[2]*1.3&&c[0]>c[1]*1.3&&Math.abs(x-FIRE.x)<9)smoke[y*W+x]=1; // 描かれた火の粉
  }
  // 描かれた煙はうす紫〜青灰色（湖や夜空より赤みが強く、明るい）
  for(y=40;y<=104;y++)for(x=116;x<=144;x++){c=O(x,y);if(!cut[y*W+x]&&c[0]>=40&&c[0]>=c[2]*.28&&c[1]<c[2]*1.04&&(c[0]+c[1]+c[2])>150)smoke[y*W+x]=1;}
  function fillRows(mask,glow){
   for(var y=0;y<H;y++)for(var x=0;x<W;x++){if(!mask[y*W+x])continue;
    var l=x,r=x;while(l>0&&mask[y*W+l])l--;while(r<W-1&&mask[y*W+r])r++;
    var f=(x-l)/Math.max(1,r-l);
    // 炎の跡は、左右をなめらかにつないで少し暗くする（炎が縮んだときに見える「火床の奥」）
    if(glow&&y>=104)put(x,y,mix(mix(P(l,y),P(r,y),f),[92,38,22],.35));else put(x,y,bayer(x,y)>f?P(l,y):P(r,y));}
  }
  fillRows(cut,1);fillRows(smoke);

  // --- 2. 湖（水の範囲・月の光の粒・対岸の高さ） ---
  function isWater(c){return c[2]>=58&&c[2]>c[0]*1.8&&c[2]>c[1]*1.2;}
  function isGlint(x,c){return x>=175&&x<=198&&c[0]>135&&c[1]>105;}
  var water=new Uint8Array(N),stack=[[160,88],[130,86],[210,92],[186,80]];
  while(stack.length){var q=stack.pop(),qx=q[0],qy=q[1];
   if(qx<100||qx>234||qy<76||qy>112)continue;var k=qy*W+qx;if(water[k])continue;
   c=P(qx,qy);if(!isWater(c)&&!isGlint(qx,c))continue;water[k]=1;
   stack.push([qx+1,qy],[qx-1,qy],[qx,qy+1],[qx,qy-1]);}
  var glint=new Uint8Array(N),glintRows={},top=new Int16Array(W).fill(-1),waterSpots=[];
  for(y=76;y<=112;y++)for(x=100;x<=234;x++){k=y*W+x;if(!water[k])continue;
   if(top[x]<0)top[x]=y;c=P(x,y);
   if(isGlint(x,c)){glint[k]=1;(glintRows[y]=glintRows[y]||[]).push({x:x,c:c});}
   if(y>=83&&y<=100&&x%3===0&&(x<176||x>198))waterSpots.push([x,y]);}
  fillRows(glint);
  var glintCenter={};Object.keys(glintRows).forEach(function(y){var r=glintRows[y],sx=0;r.forEach(function(p){sx+=p.x;});glintCenter[y]=sx/r.length;});
  // 深さ: 奥（上）は空が映って少し明るく、手前（下）は深く暗い。どちらもディザの層で
  for(y=76;y<=112;y++)for(x=100;x<=234;x++){k=y*W+x;if(!water[k]||glint[k])continue;
   // 水は横に長い破線でまぜる（格子のディザだと布に見える）
   var d=clamp((y-78)/22,0,1),b=h2(Math.floor((x+y*5)/4),y);c=P(x,y);
   if(b<d*d*.8)c=mix(c,C.deep,.26);else if(b<(1-d)*.4)c=mix(c,C.skyref,.14);
   // 月の光が水の中へ少し入る（光の柱のまわりだけ、うすく）
   var gc=glintCenter[y]||186,dx=Math.abs(x-gc);if(dx<=5&&h2(Math.floor((x+y*3)/2)+99,y)<.42*(1-dx/6))c=mix(c,[120,150,205],.2);
   put(x,y,c);}
  // 手前の浅いところに、水越しの石（透明さの手がかり）
  [[150,99],[165,101],[209,98],[139,103],[196,103],[224,100]].forEach(function(p,j){
   for(var u=0;u<3;u++)for(var v=0;v<2;v++){var X=p[0]+u,Y=p[1]+v;if(water[Y*W+X]&&!(u===2&&v===1)&&bayer(X,Y)<.8)put(X,Y,mix(P(X,Y),C.bed,.32+.08*j%2));}});

  // --- 3. 星（元絵の星を明るさで3つに分け、うすい星を少し足す） ---
  function lum(c){return (c[0]+c[1]+c[2])/3;}
  function isSky(c){return Math.max(c[0],c[1],c[2])<92&&c[2]>c[0]*1.5&&c[2]>c[1]*1.08;}
  var stars=[];
  [[132,10,2],[158,12,2],[164,28,2],[141,31,2],[120,29,2],[98,20,2],[103,4,1],[150,24,1],[145,18,1],[181,7,1],[79,27,1],[116,11,0],[206,19,0]].forEach(function(p){
   var bg=P(p[0]-2,p[1]);stars.push({x:p[0],y:p[1],c:P(p[0],p[1]),bg:bg,cls:p[2]});});
  for(var tries=0;tries<600&&stars.length<27;tries++){
   x=94+Math.floor(hash(tries*31+7)*132);y=2+Math.floor(hash(tries*17+3)*38);var ok=true;
   for(var v2=-2;v2<=2&&ok;v2++)for(var u2=-2;u2<=2&&ok;u2++){var cc=P(clamp(x+u2,0,W-1),clamp(y+v2,0,H-1));if(!isSky(cc))ok=false;}
   for(var s2=0;s2<stars.length&&ok;s2++)if(Math.abs(stars[s2].x-x)+Math.abs(stars[s2].y-y)<7)ok=false;
   if(ok&&!(Math.abs(x-135)<3&&Math.abs(y-10)<3)){var bg2=P(x,y),sc=mix(bg2,[170,188,230],.28);put(x,y,sc);stars.push({x:x,y:y,c:sc,bg:bg2,cls:0,added:1});}
  }
  stars.forEach(function(st,j){st.period=[7,8,9][st.cls]+hash(j*13+5)*[7,7,8][st.cls];st.off=hash(j*29+1)*20;st.prob=[.3,.36,.45][st.cls];st.dur=[.6,.4,.5][st.cls];});

  // --- 4. 草と葉の先（上が別の色になっている先っぽだけ動かす） ---
  function green(c){return c[1]>=c[0]&&c[1]>=c[2]*.8&&c[1]>=26&&c[0]<150;}
  function leaf(c){return c[1]>=c[0]*.95&&c[1]>=c[2]*.72&&c[1]>36;}
  function busy(x,y){return (x>=102&&x<=137&&y>=88&&y<=124)||(x>=84&&x<=102&&y>=90&&y<=112)||(x>=132&&x<=148&&y>=104&&y<=120);}
  var tips=[];
  for(y=108;y<H-1;y++)for(x=1;x<W-2;x++){if(busy(x,y))continue;c=P(x,y);var up=P(x,y-1);
   if(green(c)&&!green(up)&&green(P(x,y+1))&&Math.abs(lum(c)-lum(up))>9)tips.push({x:x,y:y,gain:2.3,ph:hash(x*7+y)});}
  for(y=3;y<72;y++)for(x=1;x<W-2;x++){if(x>88&&x<212)continue;c=P(x,y);var up2=P(x,y-1);
   if(leaf(c)&&isSky(up2)&&!leaf(up2))tips.push({x:x,y:y,gain:1.25,ph:hash(x*5+y*3),canopy:1});}

  // --- 5. 焚き火の光が届く範囲（距離で弱まる。空・炎の芯は入れない） ---
  var lit=[],lx=FIRE.x,ly=FIRE.base-5;
  for(y=40;y<H;y++)for(x=0;x<W;x++){var ex=x-lx,ey=(y-ly)*1.9,dd=Math.sqrt(ex*ex+ey*ey),w=1/(1+(dd/LIGHT.r)*(dd/LIGHT.r));
   k=y*W+x;c=P(x,y);if(y<74&&isSky(c))continue;
   // 湖と、その奥の青い森は遠い（画面では近くても、火の光はほとんど届かない）
   if(water[k])w*=LIGHT.lake;else if(y<106&&x>=98&&c[2]>=c[0])w*=LIGHT.far;
   if(w<LIGHT.cut)continue;
   // 火に向いている面ほど暖かくなる: 絵の明るさが「火の方へ明るくなっていく」所 ＝ 火に照らされている側
   if(x>0&&x<W-1&&y<H-1){var gx=lum(P(x+1,y))-lum(P(x-1,y)),gy=lum(P(x,y+1))-lum(P(x,y-1)),inv=1/Math.max(1,dd);
    w*=clamp(1+LIGHT.face*((gx*(lx-x)+gy*(ly-y))*inv)/40,.55,1.9);}
   lit.push(k,Math.min(w,1.25),bayer(x,y));}

  // --- 6. 人物とカエルの「動かすピクセル」 ---
  function figure(c){var m=Math.max(c[0],c[1],c[2]);return lum(c)<16||!(m<80&&(c[2]>=c[0]||c[1]>=c[0]));}
  function region(x0,x1,y0,y1){var r=[];for(var y=y0;y<=y1;y++)for(var x=x0;x<=x1;x++)if(figure(P(x,y)))r.push(y*W+x);return r;}

  var img=null,canvas=null,cctx=null;
  if(typeof document!=='undefined'&&document.createElement){canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
   cctx=canvas.getContext&&canvas.getContext('2d');if(cctx&&cctx.createImageData)img=cctx.createImageData(W,H);else canvas=null;}
  if(!img)img={data:new Uint8ClampedArray(N*4)};
  prepared={orig:orig,plate:plate,water:water,glintRows:glintRows,top:top,waterSpots:waterSpots,stars:stars,tips:tips,lit:lit,
   // 上半身（頭・肩・胸・カップ）は1つのかたまり
   body:region(86,100,92,106),cup:region(95,99,102,107),smokeD:new Float32Array(N),
   img:img,canvas:canvas,cctx:cctx,lastS:null,lastTick:-1,lastMode:''};
  return prepared;
 }

 // ================= 組み立て =================
 function compose(a,s,reduced){
  var d=a.img.data;
  if(reduced||!s){d.set(a.orig);return;}   // 動きを減らす設定 ＝ 島さんの絵そのまま
  d.set(a.plate);
  var t=s.time,plate=a.plate;
  function px(x,y){var j=(y*W+x)*4;return [d[j],d[j+1],d[j+2]];}
  function pp(x,y){var j=(y*W+x)*4;return [plate[j],plate[j+1],plate[j+2]];}
  function set(x,y,c){x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return;var j=(y*W+x)*4;d[j]=c[0];d[j+1]=c[1];d[j+2]=c[2];}
  function blend(x,y,c,k){x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return;var j=(y*W+x)*4;d[j]+=(c[0]-d[j])*k;d[j+1]+=(c[1]-d[j+1])*k;d[j+2]+=(c[2]-d[j+2])*k;}

  // --- 湖 ---
  var lakeWind=wind(s,t,190);
  // 対岸が暗く映る。行ごとにごくわずかに揺れる
  for(var x=100;x<=234;x++){var tp=a.top[x];if(tp<0)continue;
   for(var r=0;r<REFL_H;r++){var y=tp+r;if(!a.water[y*W+x]||y>=H)continue;
    var wob=Math.round((vnoise(y*.9,t*.45,606)-.5)*2*(.35+lakeWind*.7)),sx=clamp(x+wob,0,W-1),sy=tp-1-r;if(sy<0)continue;
    var fade=1-r/REFL_H;if(h2(Math.floor((x+y*7)/3)+wob,y)<fade*.95){var src=pp(sx,sy);blend(x,y,[src[0]*.45,src[1]*.5,src[2]*.62+10],.58);}}}
  // 月の光の粒: 行ごとにずれたり、途切れたり、ときどき白く光る
  Object.keys(a.glintRows).forEach(function(yk){var y=+yk,row=a.glintRows[yk],calm=y<79?.25:1;
   var dx=Math.round((vnoise(y*.7,t*.42,515)-.5)*2.2*(.7+lakeWind*.6)*calm),br=vnoise(y*1.3+9,t*.55,919),mid=Math.floor(row.length/2);
   row.forEach(function(p,j){if(br>.7&&Math.abs(j-mid)<=(br>.84?1:0)&&row.length>2)return;var X=p.x+dx;if(!a.water[y*W+X])return;
    var c=p.c;if(vnoise(y*2.1+j,t*1.6,333)>.82)c=mix(c,[255,250,236],.6);set(X,y,c);});});
  // 水面のうすいすじ（風が強いほど多い）
  for(var i=0;i<14;i++){var P2=5+hash(i*41+3)*6,off=hash(i*7+1)*30,u=(t+off)/P2,k=Math.floor(u),f=u-k;
   var sx2=104+h2(i,k)*122,sy2=80+Math.floor(h2(i+50,k)*22),active=h2(i+90,k)<.3+.55*wind(s,t,sx2);
   if(!active||f>.72)continue;var env=Math.sin(Math.PI*f/.72),len=2+Math.floor(h2(i+20,k)*6),drift=f*P2*(.4+wind(s,t,sx2));
   for(var q=0;q<len;q++){var X2=Math.round(sx2+drift+q);if(!a.water[sy2*W+X2])continue;if(env<.55&&(q+k)%2)continue;blend(X2,sy2,[118,148,200],env>.8?.34:.2);}}
  // 波紋（魚が跳ねた）: 平たい輪が広がって消える
  var ra=t-s.rippleStart;if(ra>=0&&ra<3.2){var rr=1+ra*4.2,ry=Math.max(1,rr*.2),kk=.34*(ra<1.2?1:(3.2-ra)/2),done={};
   for(var ang=0;ang<64;ang++){var th=ang/64*Math.PI*2,X3=Math.round(s.rippleX+Math.cos(th)*rr),Y3=Math.round(s.rippleY+Math.sin(th)*ry),key=Y3*W+X3;
    // 左右の端だけ明るく、上下の辺はとぎれとぎれ（水面の輪は横長にしか見えない）
    if(done[key]||!a.water[key])continue;done[key]=1;if(Math.abs(Math.sin(th))>.5&&(X3+Y3)%2)continue;blend(X3,Y3,[120,150,200],kk);}}

  // --- 星 ---
  a.stars.forEach(function(st,j){var u=(t+st.off)/st.period,k=Math.floor(u),tt=(u-k)*st.period,c=st.c;
   // 明るい星はいつも少しだけまたたく
   if(st.cls===2&&h2(j,Math.floor(t*4.2+j*1.7))<.22)c=mix(c,st.bg,.28);
   var ev=h2(j*7+3,k)<st.prob,es=h2(j*7+1,k)*(st.period-1.4),dur=st.dur*(.7+.7*h2(j*7+2,k));
   if(ev&&tt>=es&&tt<es+dur){var e=Math.sin(Math.PI*(tt-es)/dur),kind=h2(j*7+4,k);
    if(st.cls===2&&kind<.6){c=[255,255,255];if(e>.4){var arm=mix(st.bg,[196,212,255],e>.75?.6:.4);
     [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(o){var X=st.x+o[0],Y=st.y+o[1];if(Math.abs(X-135)+Math.abs(Y-10)>0)blend(X,Y,arm,1);});}}
    else if(st.cls===1&&kind<.5){c=[250,252,255];if(e>.7){blend(st.x+1,st.y,[150,170,220],.5);blend(st.x-1,st.y,[150,170,220],.5);}}
    else if(st.cls===0&&kind<.45)c=mix(st.c,[214,226,255],.7);
    else c=mix(c,st.bg,e>.3?.78:.4);}
   set(st.x,st.y,c);});
  // 流れ星（ごくたまに）
  var sa=t-s.starStart;if(sa>=0&&sa<.7){var hx=128+sa*44,hy=12+sa*15;for(var tr=0;tr<6;tr++){var fx=hx-tr*2,fy=hy-tr*.68;if(tr>sa*16)break;
   blend(fx,fy,[210,224,255],(sa>.5?(.7-sa)*5:1)*(1-tr/6));}}

  // --- 草と葉の先 ---
  a.tips.forEach(function(tp){var w=wind(s,t,tp.x),v=(w-.22)*tp.gain+(vnoise(tp.x*.09,t*.42+tp.ph*3,808)-.5)*(tp.canopy?.6:1.15);
   var o=Math.round(v);if(tp.canopy)o=Math.abs(v)>=1.1?Math.sign(v):0;if(!o)return;
   var sg=o>0?1:-1,x=tp.x,y=tp.y,tip=pp(x,y);set(x,y,pp(x,y-1));set(x+o,y,tip);
   if(Math.abs(o)>=2){set(x+sg,y,tip);set(x+sg,y+1,pp(x,y+1));set(x,y+1,pp(x-sg,y+1));}});

  // --- 人物 ---
  var look=t>=s.lookStart&&t<s.lookUntil;
  //   ★頭と首のつなぎ目は動かさない（頭だけ動かすと首が伸び縮みして見える）。
  //   ★呼吸は描かない（この大きさでは、体を動かすほど不自然になる。2026-09-18 島さんの指定）
  //   火をのぞく ＝ 頭・肩・上半身がいっしょに1px前かがみ
  var headDy=look?1:0,cupOn=!look&&t>=s.cupStart&&t<s.cupUntil;
  if(look)moveUp(a.body,-1);else if(cupOn)moveUp(a.cup,1);
  var bt=t-s.blinkStart,b2=t-s.blink2,closed=(bt>=0&&bt<.12)||(b2>=0&&b2<.11),half=(bt>=.12&&bt<.17);
  if(closed||half){var ey=99+headDy,lid=closed?[194,138,104]:[120,70,52];set(92,ey,closed?lid:mix(pp(92,99),lid,.5));set(94,ey,closed?lid:mix(pp(94,99),lid,.5));}
  // 一か所をまとめて n px 上へ（負なら下へ）。空いた所には、その下にあった色が来る ＝ ピクセルの形のまま
  function moveUp(list,n){
   var out={};
   list.forEach(function(k){out[k-n*W]=1;out[k]=1;});
   Object.keys(out).forEach(function(k){k=+k;var x=k%W,y=(k-x)/W;set(x,y,pp(x,y+n));});}

  // --- カエル ---
  var fb=t-s.frogBlinkStart,fClosed=fb>=0&&fb<.16,fHalf=fb>=.16&&fb<.23;
  var fLook=t<s.frogLookUntil;
  if(fLook){set(137,110,pp(138,110));set(138,110,pp(137,110));set(140,110,pp(141,110));set(141,110,pp(140,110));}
  if(fClosed){[137,138,140,141].forEach(function(x){set(x,110,[141,180,39]);});set(137,109,[151,187,53]);set(140,109,[151,187,53]);}
  else if(fHalf){[138,141].forEach(function(x){set(x,110,[151,187,53]);});}
  var croak=t>=s.croakStart&&t<s.croakUntil,pump=(s.frogPump%1)<.28;
  if(croak&&((t-s.croakStart)%CROAK_BEAT)<CROAK_BEAT/2){[137,138,139,140].forEach(function(x){set(x,116,[251,237,188]);});set(138,117,[243,238,196]);set(139,117,[243,238,196]);set(136,115,[238,232,170]);}
  else if(pump){set(138,116,[250,238,196]);set(139,116,[250,238,196]);}

  // --- 焚き火の光（強さ×距離。段階とディザで） ---
  //   炎と同じコマで変える（光だけが細かくちらつかないように）
  //   炎の大きさ（細かいゆらぎ込み）を0.45秒ぶんならした値 ＝ 炎が伸びると、ほんの少し遅れて周りが明るくなる
  var tl=Math.floor(t*FIRE.fps)/FIRE.fps,avg=0;for(var ai=0;ai<8;ai++)avg+=fireI(s,tl-ai*.06);
  var light=s.flash===false?0:clamp((avg/8-.5)*2.4,-1.1,1.5);
  if(light){var L=a.lit,steps=LIGHT.steps,kk2=LIGHT.k;
   for(var n=0;n<L.length;n+=3){var q2=Math.floor(light*L[n+1]*steps+L[n+2]);if(!q2)continue;var j2=L[n]*4,m=q2*kk2;
    // 明るくなるときは橙へ寄る／暗くなるときは暖かさが引いて少し沈む
    if(m>0){d[j2]+=m*(d[j2]*1.05+52);d[j2+1]+=m*(d[j2+1]*.55+20);d[j2+2]-=m*(d[j2+2]*.18);}
    else{d[j2]+=m*d[j2]*.9;d[j2+1]+=m*d[j2+1]*.7;d[j2+2]+=m*d[j2+2]*.35;}}}
  // ランタンの芯（焚き火とは別の、落ちついたゆらぎ）
  if(noise(t*.9,814)>.55)set(71,79,[255,215,149]);if(noise(t*.7,815)>.7)set(71,80,[255,200,120]);

  // --- 煙 ---
  var D=a.smokeD;D.fill(0);var any=false;
  s.puffs.forEach(function(p){var age=t-p.born;if(age<0)return;var u=age/p.life,rad=p.r0+u*2.9+.8*u*u,al=p.a*1.05*Math.min(1,age/.4)*Math.pow(1-u,1.1);
   if(al<.02)return;any=true;var R=rad+.5;
   for(var y=Math.floor(p.y-R);y<=Math.ceil(p.y+R);y++)for(var x=Math.floor(p.x-R);x<=Math.ceil(p.x+R);x++){if(x<0||y<0||x>=W||y>=H)continue;
    var dd=Math.sqrt((x-p.x)*(x-p.x)+(y-p.y)*(y-p.y));if(dd<R)D[y*W+x]+=al*(1-dd/R);}});
  if(any)for(var y4=6;y4<FIRE.base;y4++)for(var x4=60;x4<200;x4++){var dv=D[y4*W+x4];if(dv<.03)continue;
   var lv=Math.floor(Math.min(dv,1.2)*3+bayer(x4,y4)-.3);if(lv<=0)continue;
   var hk=clamp((FIRE.base-10-y4)/38,0,1),sc=mix(C.smokeWarm,C.smokeCool,hk);blend(x4,y4,sc,Math.min(3,lv)*.21);}

  // --- 炎（形そのものが毎コマ変わる） ---
  //   根元はどっしり・まん中は明るく太い・上はノイズで削られて、伸びたり縮んだり、先が割れたりする。
  //   ノイズは「2Dのかたまり」なので、横線にはならない。
  var tf=Math.floor(t*FIRE.fps)/FIRE.fps,I=fireI(s,tf),Hh=fireHeight(s,tf),lean=fireLean(s,tf);
  var slice=tf*1.9,k0=Math.floor(slice),fk=slice-k0,base=FIRE.base;
  var tongues=[0,1,2,3].map(function(j){return {x:FIRE.x+[-4.2,-1,1.8,4.6][j]+(noise(tf*1.1,50+j*13)-.5)*2.6,h:Hh*[.62,1.05,.9,.55][j]*(.62+.62*noise(tf*1.6+j*3,90+j*7)),w:[2.2,2.8,2.6,2][j]};});
  for(var y5=base-1;y5>=base-Hh*1.5;y5--){var v=(base-y5)/Hh;
   var sway=(vnoise(y5*.3,tf*1.4,77)-.5)*2.6*v,xc=FIRE.x+lean*v*v*1.7+sway,hw=FIRE.w*(.9+.14*I)*Math.pow(Math.max(0,1-v*1.25),.8),amp=.12+.95*Math.min(1,v);
   for(var x5=Math.floor(FIRE.x-12);x5<=Math.ceil(FIRE.x+12);x5++){
    var nz=vnoise(x5*.5,(y5+tf*10)*.4,300+k0*17)*(1-fk)+vnoise(x5*.5,(y5+tf*10)*.4,300+(k0+1)*17)*fk;
    var F=(hw>0?1-Math.abs(x5-xc)/hw:-1)-.18*v;
    for(var j3=0;j3<4;j3++){var tg=tongues[j3],vj=(base-y5)/tg.h;if(vj>=1)continue;var txc=tg.x+lean*vj*vj*1.7+sway*.7;
     var tb=(1-Math.abs(x5-txc)/(tg.w*Math.pow(1-vj,.55)))*.92-.35*vj;if(tb>F)F=tb;}
    F+=(nz-.5)*amp;
    var col=null;
    if(F>.8&&v<.42)col=C.white;else if(F>.6&&v<.8)col=C.yellow;else if(F>.38)col=C.orange;else if(F>.18)col=C.red;else if(F>.08&&bayer(x5,y5)<.5)col=C.dred;
    if(col)set(x5,y5,col);}}
  s.frags.forEach(function(f){var u=(t-f.born)/f.life;if(u<0||u>1)return;set(f.x,f.y,u<.45?C.orange:C.red);if(u<.3)set(f.x,f.y+1,C.red);});
  s.embers.forEach(function(e){var age=t-e.born;if(age<0)return;var u=age/e.life;if(u>.8&&Math.floor(t*12+e.seed)%2)return;
   set(e.x,e.y,u<.35?[255,214,120]:u<.7?[240,140,60]:[176,78,40]);});
 }

 function draw(ctx,s,opt){
  var a=prepare(),reduced=!!(opt&&opt.reduced),mode=(reduced?'r':'m')+(s&&s.flash===false?'f':'');
  var tick=s?Math.floor(s.time*COMPOSE_FPS):-1;
  if(!(a.canvas&&a.lastS===s&&a.lastTick===tick&&a.lastMode===mode)){compose(a,s,reduced);a.lastS=s;a.lastTick=tick;a.lastMode=mode;
   if(a.canvas)a.cctx.putImageData(a.img,0,0);}
  ctx.save();ctx.imageSmoothingEnabled=false;
  if(a.canvas&&ctx.drawImage)ctx.drawImage(a.canvas,0,0);
  else{var d=a.img.data;for(var y=0;y<H;y++){var x0=0;for(var x=1;x<=W;x++){var j=(y*W+x)*4,i0=(y*W+x0)*4;
   if(x<W&&d[j]===d[i0]&&d[j+1]===d[i0+1]&&d[j+2]===d[i0+2])continue;
   ctx.fillStyle='rgb('+d[i0]+','+d[i0+1]+','+d[i0+2]+')';ctx.fillRect(x0,y,x-x0,1);x0=x;}}}
  ctx.restore();
 }
 // 2026-09-19: the way into the mine, a small sign at the bottom left (the FISH sign's twin). Hit area 68x30.
 var MINE_ENTRY={x:2,y:128,w:68,h:30};
 function mineButton(ctx,pressed){
  var y=pressed?139:138;ctx.fillStyle='#081e2b';ctx.fillRect(6,y,55,16);ctx.fillStyle='#62716a';ctx.fillRect(8,y,51,1);
  ctx.fillStyle='#d1c39d';ctx.fillRect(11,y+4,7,1);ctx.fillRect(10,y+5,1,2);ctx.fillRect(18,y+5,1,2);ctx.fillStyle='#9a5528';ctx.fillRect(14,y+5,1,8);
  g.DotFont.drawText(ctx,'MINE',26,y+5,'#e9debc');
 }
 // 2026-09-21(6): the SAVE sign, top right. Same 55x16 plate as MINE / FISH. Hit area 60x24.
 var SAVE_ENTRY={x:176,y:2,w:60,h:24};
 function saveButton(ctx,pressed,ok){
  var y=pressed?7:6;ctx.fillStyle='#081e2b';ctx.fillRect(179,y,55,16);ctx.fillStyle='#62716a';ctx.fillRect(181,y,51,1);
  // a floppy-disk mark: body, shutter, label
  if(ok){// written: the floppy is replaced by a tick, so SAVED fits on the same plate
   ctx.fillStyle='#8fe388';ctx.fillRect(184,y+8,1,2);ctx.fillRect(185,y+9,1,2);ctx.fillRect(186,y+8,1,2);
   ctx.fillRect(187,y+6,1,2);ctx.fillRect(188,y+4,1,2);
   g.DotFont.drawText(ctx,'SAVED',193,y+5,'#8fe388');
  } else {
   ctx.fillStyle='#d1c39d';ctx.fillRect(184,y+4,9,9);ctx.fillStyle='#081e2b';ctx.fillRect(186,y+4,5,3);
   ctx.fillStyle='#9a5528';ctx.fillRect(186,y+9,5,4);
   g.DotFont.drawText(ctx,'SAVE',199,y+5,'#e9debc');
  }
 }
 // 2026-09-22: the way back to the skate run, a small sign at the top left.
 //   The camp must ALWAYS offer a way home, even when the game was opened straight into camp
 //   from a save (no "came from skate" temporary state exists then).
 var ROAD_ENTRY={x:2,y:2,w:60,h:24};
 function roadButton(ctx,pressed){
  var y=pressed?7:6;ctx.fillStyle='#081e2b';ctx.fillRect(6,y,55,16);ctx.fillStyle='#62716a';ctx.fillRect(8,y,51,1);
  // a small board + wheels, read as a skateboard
  ctx.fillStyle='#d1c39d';ctx.fillRect(10,y+7,11,2);
  ctx.fillStyle='#9a5528';ctx.fillRect(11,y+9,2,2);ctx.fillRect(18,y+9,2,2);
  ctx.fillStyle='#e9debc';ctx.fillRect(10,y+6,2,1);ctx.fillRect(19,y+6,2,1);
  g.DotFont.drawText(ctx,'ROAD',26,y+5,'#e9debc');
 }
 function button(ctx,pressed){
  var y=pressed?139:138;ctx.fillStyle='#081e2b';ctx.fillRect(179,y,55,16);ctx.fillStyle='#62716a';ctx.fillRect(181,y,51,1);ctx.fillStyle='#d1c39d';
  ctx.fillRect(184,y+8,1,5);ctx.fillRect(185,y+6,1,2);ctx.fillRect(186,y+4,1,2);ctx.fillRect(187,y+3,5,1);ctx.fillRect(192,y+4,1,6);ctx.fillRect(191,y+10,2,1);
  g.DotFont.drawText(ctx,'FISH',199,y+5,'#e9debc');
 }
 g.DotCampLakeside={enabled:true,ENTRY:ENTRY,MINE_ENTRY:MINE_ENTRY,mineButton:mineButton,ROAD_ENTRY:ROAD_ENTRY,roadButton:roadButton,SAVE_ENTRY:SAVE_ENTRY,saveButton:saveButton,create:create,update:update,draw:draw,button:button,_prepare:prepare,_wind:wind,_fireI:fireI,_gustAt:gustAt,CROAK_BEAT:CROAK_BEAT};
})(typeof window!=='undefined'?window:globalThis);
