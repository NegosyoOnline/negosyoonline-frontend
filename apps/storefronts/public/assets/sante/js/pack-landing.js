/* The landing page script, moved byte for byte from the inline <script> of TWCinc's landing.html (the policy allows no inline script): photo gallery, "tap what sounds like you" lines, phone order bar. */
(function(){
var g=document.querySelector("[data-gallery]");
if(g){
var slides=g.querySelectorAll("[data-gal-slide]"),thumbs=g.querySelectorAll("[data-gal-thumb]"),cur=0;
var on=["ring-2","ring-[#157a38]","ring-offset-2"],off=["opacity-70","ring-1","ring-mint-200"];
var show=function(n){
cur=(n+slides.length)%slides.length;
for(var i=0;i<slides.length;i++){slides[i].hidden=i!==cur;}
for(var j=0;j<thumbs.length;j++){
var sel=j===cur;thumbs[j].setAttribute("aria-current",sel?"true":"false");
for(var a=0;a<on.length;a++){thumbs[j].classList.toggle(on[a],sel);}
for(var b=0;b<off.length;b++){thumbs[j].classList.toggle(off[b],!sel);}
}
};
for(var t=0;t<thumbs.length;t++){(function(k){thumbs[k].addEventListener("click",function(){show(k);});})(t);}
var pv=g.querySelector("[data-gal-prev]"),nx=g.querySelector("[data-gal-next]");
if(pv){pv.addEventListener("click",function(){show(cur-1);});}
if(nx){nx.addEventListener("click",function(){show(cur+1);});}
}
var sc=document.querySelector("[data-selfcheck]");
if(sc){
var items=sc.querySelectorAll("[data-sc-item]"),out=sc.querySelector("[data-sc-count]");
var count=function(){
var n=0;for(var i=0;i<items.length;i++){if(items[i].getAttribute("aria-pressed")==="true"){n+=1;}}
out.textContent=n?n+" of "+items.length+" sound like you — this offer makes sense for you.":out.getAttribute("data-sc-empty");
};
for(var s=0;s<items.length;s++){items[s].addEventListener("click",function(e){
var b=e.currentTarget;b.setAttribute("aria-pressed",b.getAttribute("aria-pressed")==="true"?"false":"true");count();});}
}
var bar=document.querySelector("[data-pp-sticky]"),hero=document.querySelector("[data-pp-hero-cta]");
if(bar&&hero&&"IntersectionObserver" in window){
var hide=function(off){bar.classList.toggle("pp-sticky-off",off);bar.setAttribute("aria-hidden",off?"true":"false");};
new IntersectionObserver(function(es){
var e=es[0];hide(e.isIntersecting||e.boundingClientRect.top>0);
}).observe(hero);
hide(true);
}

/* "Watch Before You Buy": the rotating centre-stage reel carousel, adapted from TWCinc's membership-pack-landing.min.js (the reels part,
   rewritten here, no muted preview). The ring is placed around the centred reel: 0 is the centre, +-1 and +-2 step down in size under a
   deepening sage veil, anything further sits hidden. Previous/Next, a swipe, or a tap on a side reel rotate it. Only the centred reel
   plays: its play button mounts the Bunny player (sound, from 0:00, inline) and a reel that rotates away loses its player. */
var rst=document.querySelector("[data-reel-stage]");
if(rst){
var rcards=[].slice.call(rst.querySelectorAll("[data-reel-card]")),rn=rcards.length;
var rcap=document.querySelector("[data-reel-caption]"),rcnt=document.querySelector("[data-reel-count]");
var RSCALE=[1,0.7,0.54,0.44],RVEIL=[0,0.18,0.4,1],rslots=rcards.map(function(){return null;});
var ractive=0,rlastSwipe=0,rstartX=null;
var rcalm=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var rslot=function(i){var o=((i-ractive)%rn+rn)%rn;return o>rn/2?o-rn:o;};
var rstop=function(card){
var f=card.querySelector("[data-reel]"),pl=f.querySelector("iframe");
if(pl){pl.remove();}
[].forEach.call(f.querySelectorAll("[data-reel-poster],[data-reel-play]"),function(el){el.hidden=false;});
};
var rlayout=function(){
if(!rn){return;}
var w=rcards[0].offsetWidth,gap=window.innerWidth<640?12:20,off=[0];
for(var k=1;k<RSCALE.length;k++){off[k]=off[k-1]+(w*RSCALE[k-1])/2+gap+(w*RSCALE[k])/2;}
rcards.forEach(function(card,i){
var o=rslot(i),d=Math.min(Math.abs(o),RSCALE.length-1),x=(o<0?-1:1)*off[d],prevSlot=rslots[i];
/* the first placement, and a reel wrapping round the ring, jump instead of gliding */
card.style.transition=rcalm||prevSlot===null||Math.abs(prevSlot-o)>1?"none":"";
card.style.transform="translateX(-50%) translateX("+x+"px) scale("+RSCALE[d]+")";
card.style.opacity=d>=RSCALE.length-1?"0":"1";
card.style.zIndex=String(10-d);
card.style.pointerEvents=d>=RSCALE.length-1?"none":"";
card.setAttribute("aria-hidden",d===0?"false":"true");
var f=card.querySelector("[data-reel]");
f.style.boxShadow=d===0?"0 0 0 5px #fff, 0 30px 60px -30px rgba(6,58,24,0.55)":"none";
f.querySelector("[data-reel-veil]").style.opacity=String(RVEIL[d]);
f.querySelector("[data-reel-icon]").style.opacity=d===0?"1":"0";
f.querySelector("[data-reel-play]").tabIndex=d===0?0:-1;
rslots[i]=o;
});
if(rcap){rcap.textContent=rcards[ractive].getAttribute("data-reel-title")||"";}
if(rcnt){rcnt.textContent=ractive+1;}
};
var rrotate=function(i){
ractive=((i%rn)+rn)%rn;
rcards.forEach(function(card,j){if(j!==ractive){rstop(card);}});
rlayout();
};
var rplay=function(card){
var f=card.querySelector("[data-reel]"),btn=f.querySelector("[data-reel-play]");
if(f.querySelector("iframe")){return;}
var pl=document.createElement("iframe");
pl.src=btn.getAttribute("data-src").replace("autoplay=false","autoplay=true").replace("preload=false","preload=true");
pl.title=(btn.getAttribute("aria-label")||"").replace(/^Play /,"");
pl.style.cssText="border:0;position:absolute;top:0;left:0;height:100%;width:100%;";
pl.setAttribute("allow","accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;fullscreen;");
pl.setAttribute("allowfullscreen","true");
pl.setAttribute("referrerpolicy","strict-origin-when-cross-origin");
f.insertBefore(pl,f.firstChild);
[].forEach.call(f.querySelectorAll("[data-reel-poster],[data-reel-play]"),function(el){el.hidden=true;});
};
var rprev=document.querySelector("[data-reel-prev]"),rnext=document.querySelector("[data-reel-next]");
if(rprev){rprev.addEventListener("click",function(){rrotate(ractive-1);});}
if(rnext){rnext.addEventListener("click",function(){rrotate(ractive+1);});}
rst.addEventListener("pointerdown",function(e){rstartX=e.clientX;});
rst.addEventListener("pointerup",function(e){
if(rstartX===null){return;}
var dx=e.clientX-rstartX;rstartX=null;
if(Math.abs(dx)>40){rlastSwipe=Date.now();rrotate(ractive+(dx<0?1:-1));}
});
rst.addEventListener("pointercancel",function(){rstartX=null;});
[].forEach.call(rst.querySelectorAll("[data-reel-play]"),function(btn){
btn.addEventListener("click",function(){
if(Date.now()-rlastSwipe<400){return;}
var card=btn.closest("[data-reel-card]"),i=rcards.indexOf(card);
if(i!==ractive){rrotate(i);return;}
rplay(card);
});
});
window.addEventListener("resize",rlayout);
rlayout();
}
})();

/* "We are the Barley Authority" tabs. Written from TWCinc's membership-pack-landing.min.js (data-about-tab / data-about-panel), as proper ARIA
   tabs: aria-selected, one tab in the tab order, Left/Right/Home/End move and select. The 4-second rotation is TWCinc's; it stops for good at the
   first click, key or focus on a tab, and never runs under reduced motion. */
(function(){
var tabs=Array.prototype.slice.call(document.querySelectorAll("[data-about-tab]"));
if(!tabs.length){return;}
var current=0,timer=null;
var still=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function show(i,focus){
current=(i+tabs.length)%tabs.length;
tabs.forEach(function(t,j){
var on=j===current;
t.setAttribute("aria-selected",on?"true":"false");
t.tabIndex=on?0:-1;
var panel=document.getElementById(t.getAttribute("data-about-tab"));
if(panel){panel.hidden=!on;}
});
if(focus){tabs[current].focus();}
}
function stop(){if(timer){clearInterval(timer);timer=null;}}
tabs.forEach(function(t,i){
t.addEventListener("click",function(){stop();show(i,false);});
t.addEventListener("focus",stop);
t.addEventListener("keydown",function(e){
var k=e.key,next=null;
if(k==="ArrowRight"){next=i+1;}
else if(k==="ArrowLeft"){next=i-1;}
else if(k==="Home"){next=0;}
else if(k==="End"){next=tabs.length-1;}
else if(k==="Enter"||k===" "){e.preventDefault();stop();show(i,false);return;}
if(next!==null){e.preventDefault();stop();show(next,true);}
});
});
if(!still){timer=setInterval(function(){show(current+1,false);},4000);}
})();
/* Hero video: the green play button. The video autoplays muted; one click or tap restarts it from 0:00 with sound. Bunny's embed speaks the
   player.js postMessage protocol, so raw messages go to the iframe (targetOrigin = the iframe's own origin, no library). If the player has not
   announced "ready" by click time the messages could be dropped, so the fallback reloads the same URL with muted=false, which also starts at 0:00
   with sound. Neither path loops: the URL has loop=false and the player is told setLoop false before play (Coach Ed, 2026-11-16). Then the button goes, so Bunny's own controls take over. */
(function(){
var btn=document.querySelector("[data-hero-play]");
var fr=document.querySelector(".pp-hero-video iframe");
if(!btn||!fr){return;}
var origin="",ready=false;
try{origin=new URL(fr.src).origin;}catch{return;}
var send=function(m,v){
var o={context:"player.js",version:"0.0.11",method:m};
if(v!==undefined){o.value=v;}
try{fr.contentWindow.postMessage(JSON.stringify(o),origin);}catch{}
};
window.addEventListener("message",function(e){
if(e.origin!==origin||e.source!==fr.contentWindow){return;}
var d=e.data;
if(typeof d==="string"){try{d=JSON.parse(d);}catch{return;}}
if(d&&d.context==="player.js"&&d.event==="ready"){ready=true;}
});
var listen=function(){send("addEventListener","ready");};
fr.addEventListener("load",listen);
listen();
btn.addEventListener("click",function(){
if(ready){
send("setLoop",false);send("setCurrentTime",0);send("unmute");send("setVolume",100);send("play");
}else{
var u=new URL(fr.src);u.searchParams.set("muted","false");u.searchParams.set("autoplay","true");u.searchParams.set("loop","false");
fr.src=u.toString();
}
btn.hidden=true;btn.remove();
});
})();
