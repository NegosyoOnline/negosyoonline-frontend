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
})();
