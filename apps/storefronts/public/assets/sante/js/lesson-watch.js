/* The member lesson page's watch script (ClickUp z8uq9mhbhd, CP-1 R2 fix round 1), after TWCinc's lesson-watch.js
   (app/static/dashboard/subscriber/js/lesson-watch.js) and its lesson:completed handler. A Bunny Stream lesson's embed speaks the player.js
   protocol, so this follows how far the member has got (the furthest point reached) and posts it to this storefront server at each 10 percent
   step (10, 20 ... 90) and at the end (100). It always posts the first crossing of 90 percent, and the player's `ended` (sent with ended: true).
   The server keeps the highest and completes the lesson itself at 90 or more: when the answer says `completed`, the page is updated live
   (Next Lesson turns on, the lesson is ticked in the list, the counts go up), with no reload. There is no "Mark complete" button.
   A step is sent once, and only once the server has taken it, so a failed post is tried again at the next step. Nothing goes to any
   third party. The Player.js library is this storefront's own copy (js/player.min.js, v0.0.11). */
(function(){
var box=document.querySelector('[data-watch="1"]');
var iframe=box&&box.querySelector("iframe");
var id=box&&box.getAttribute("data-lesson-video");
if(!iframe||!id){return;}
var URL="/dashboard/training/lesson/"+encodeURIComponent(id)+"/watch/";
var CHECK='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var PLAY='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7z"/></svg>';
var best=0,sent=0,busy=false,finished=false,ended=false,endSent=false;

function post(percent,isEnd){
var body={percent:percent};
if(isEnd){body.ended=true;}
return fetch(URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),credentials:"same-origin",keepalive:true})
.then(function(r){
if(!r.ok){return null;}
return Promise.resolve(r.json?r.json():{}).then(function(d){return d||{};},function(){return {};});
}).catch(function(){return null;});
}
function flush(){
if(busy||finished){return;}
var step=best>=100?100:Math.floor(best/10)*10;
var needEnd=ended&&!endSent;
if(!needEnd&&(step<10||step<=sent)){return;}
busy=true;
post(step,needEnd).then(function(d){
busy=false;
if(!d){return;}
if(step>sent){sent=step;}
if(needEnd){endSent=true;}
if(d.completed===true){finished=true;completed(d);return;}
flush();
});
}
function reached(pct){
if(pct>best){best=Math.min(100,pct);flush();}
}

/* The page, live: what a reload would show once the lesson is complete. */
function setText(el,t){if(el){el.textContent=t;}}
function completed(d){
var row=document.querySelector(".tr-plist .tr-ls-cur");
var was=!!(row&&row.classList.contains("tr-ls-done"));
if(row){
row.classList.remove("tr-ls-open");row.classList.add("tr-ls-done");
var ic=row.querySelector(".tr-ic");if(ic){ic.innerHTML=CHECK;}
}
var nav=document.querySelector(".tr-lnav");
var nextBtn=document.getElementById("tr-next-lesson");
if(nav&&!nav.querySelector('[data-tr="completed"]')){
var chip=document.createElement("span");chip.className="tr-done";chip.setAttribute("data-tr","completed");chip.innerHTML=CHECK+" Completed";
if(nextBtn&&nextBtn.parentNode===nav){nav.insertBefore(chip,nextBtn);}else{nav.appendChild(chip);}
}
var ring=document.getElementById("tr-ring");
if(ring&&!was){
var done=parseInt(ring.getAttribute("data-done"),10),total=parseInt(ring.getAttribute("data-total"),10);
if(done>=0&&total>0){
done+=1;
var pct=Math.round(done/total*100);
ring.setAttribute("data-done",String(done));
ring.setAttribute("aria-label",done+" of "+total+" lessons complete");
ring.style.setProperty("--p",String(pct));
setText(ring.querySelector("b"),done+"/"+total);
setText(document.getElementById("tr-hero-done"),done+(done===1?" lesson":" lessons")+" completed");
setText(document.getElementById("tr-plist-done"),done+" of "+total+" lessons complete");
var bar=document.querySelector(".tr-plist-head .tr-bar i");
if(bar){bar.style.width=pct+"%";}
var track=document.querySelector(".tr-plist-head .tr-bar");
if(track){track.setAttribute("aria-valuenow",String(pct));}
}
}
if(d.next_unlocked!==true){return;}
var nid=typeof d.next_lesson_id==="string"?d.next_lesson_id:"";
if(nextBtn&&nextBtn.tagName!=="A"){
var url=nextBtn.getAttribute("data-next-url");
if(nid&&nid!==nextBtn.getAttribute("data-next-id")){url="/dashboard/training/lesson/"+encodeURIComponent(nid)+"/"+(url&&url.indexOf("?")>=0?url.slice(url.indexOf("?")):"");}
if(url){
var a=document.createElement("a");a.className="tr-btn tr-btn-go";a.id="tr-next-lesson";a.setAttribute("href",url);a.innerHTML="Next Lesson &rarr;";
nextBtn.parentNode.replaceChild(a,nextBtn);
}
}
var lock=nid?document.querySelector('.tr-plist .tr-ls-lock[data-lesson="'+nid+'"]'):null;
var href=lock&&lock.getAttribute("data-unlock-href");
if(lock&&href){
var link=document.createElement("a");
link.className="tr-ls tr-ls-open";link.setAttribute("href",href);link.setAttribute("data-lesson",nid);
link.innerHTML=lock.innerHTML;
var lic=link.querySelector(".tr-ic");if(lic){lic.innerHTML=PLAY;}
var sr=link.querySelector(".sr-only");if(sr&&sr.parentNode){sr.parentNode.removeChild(sr);}
lock.parentNode.replaceChild(link,lock);
}
}

function load(done){
var s=document.createElement("script");s.src="/assets/sante/js/player.min.js?v=48c4f991";s.onload=done;s.onerror=function(){};document.head.appendChild(s);
}
load(function(){
if(typeof playerjs==="undefined"||!playerjs.Player){return;}
var player=new playerjs.Player(iframe),duration=0,bound=false;
function bind(){
if(bound){return;}bound=true;
player.on("timeupdate",function(d){
var dur=(d&&d.duration)||duration,sec=d&&d.seconds;
if(!dur||typeof sec!=="number"){return;}
reached(sec/dur*100);
});
player.on("ended",function(){ended=true;if(best<100){best=100;}flush();});
}
player.on("ready",function(){player.getDuration(function(d){duration=d;});bind();});
setTimeout(bind,1200);
});
})();
