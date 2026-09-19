// One small pixel status badge follows the active surface, including modal menus.
(function(global){
  "use strict";
  var badge=document.createElement('canvas'),lastText='',lastUrgent=false;
  badge.id='prestige-boost';badge.className='boost-display';badge.hidden=true;
  badge.setAttribute('role','img');badge.style.pointerEvents='none';
  function render(){
    var G=global.DotOllie,S=global.SHELL;if(!G||!S)return;
    var inGame=S.getMode()==='game',view=G.getBoostView(inGame?undefined:global.DotProgression.slot());
    var shop=document.querySelector('#pixel-shop[open]'),box=shop&&shop.querySelector('.shop-ask-box');
    var parent=box||(shop&&shop.querySelector('.shop-header'))||document.body;
    if(!shop)badge.style.position='fixed'; // Never let the badge resize the flex-based game shell while measuring it.
    if(badge.parentNode!==parent){if(box)parent.insertBefore(badge,parent.firstChild);else parent.appendChild(badge);}
    badge.hidden=!view.text;
    if(shop)shop.classList.toggle('has-boost',!!view.text&&!box);
    if(!view.text)return;
    badge.setAttribute('aria-label',view.text);badge.classList.toggle('urgent',view.urgent);
    var F=global.DotFont;
    if(lastText!==view.text||lastUrgent!==view.urgent){
      lastText=view.text;lastUrgent=view.urgent;badge.width=F.textWidth(view.text.length)+8;badge.height=F.GLYPH_H+6;
      var c=badge.getContext('2d');c.fillStyle='#101f20';c.fillRect(0,0,badge.width,badge.height);
      c.fillStyle=view.urgent?'#ffb49b':'#5f7473';c.fillRect(0,badge.height-1,badge.width,1);
      F.drawText(c,view.text,4,2,view.urgent?'#ffec27':'#fff1e8');
    }
    if(shop){
      badge.style.position=box?'sticky':'static';badge.style.top=box?'0':'';badge.style.left='';
      badge.style.width=badge.width*2+'px';badge.style.height=badge.height*2+'px';
    }else{
      var r=document.querySelector('#lcd').getBoundingClientRect(),scale=r.width/240;
      badge.style.position='fixed';badge.style.width=badge.width*scale+'px';badge.style.height=badge.height*scale+'px';
      badge.style.left=Math.round(r.right-(badge.width+3)*scale)+'px';
      badge.style.top=Math.round(r.bottom-(inGame?28:badge.height+1)*scale)+'px';
      if(inGame && G._state() && G._state().campPhase==='fish'){
        badge.style.left=Math.round(r.left+64*scale)+'px';badge.style.top=Math.round(r.top+8*scale)+'px';
      }
    }
  }
  global.DotBoostUI={render:render};
  setInterval(render,100);
  global.addEventListener('resize',render);document.addEventListener('visibilitychange',render);render();
})(window);
