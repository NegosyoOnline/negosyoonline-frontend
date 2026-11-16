/* The landing page's visitor script (ClickUp z8uq9mfw14), adapted from TWCinc's eco-landing.min.js (the Player.js
   video tracking: play, then the 25, 50, 75, 90 and 100 percent marks, the highest kept by the server). It asks this
   storefront server for a visit, keeps the ref in localStorage (no cookie), and reports how far the video got. Nothing
   goes to Meta or any third party; the ref is the only thing the browser holds. The Player.js library is this
   storefront's own copy (js/player.min.js, v0.0.11).
   Watching means UNMUTED. TWCinc's embed is click-to-play (autoplay and muted off), so there a play is the visitor's
   choice. This storefront's approved hero embed autoplays muted and loops, so play and the time marks would fire for
   anyone who only sits on the page. So "start" is sent the first time the video reports playing with sound, and a
   percent mark counts only the furthest position reached unmuted; muted time never counts, and the loop wrapping back
   to the start neither resets nor re-sends a mark. If the player cannot say whether it is muted, nothing is sent and
   the visit stays at Landing Page. Player.js has no volumechange event, so muted is asked (at most once a second). */
(function(){
var KEY="np:visit-ref",URL="/funnel/membership-pack/visit/",MARKS=[25,50,75,90,100];
function store(v){try{if(v===undefined){return window.localStorage.getItem(KEY)||"";}window.localStorage.setItem(KEY,v);}catch(e){}return "";}
function send(payload){
return fetch(URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),credentials:"same-origin",keepalive:true})
.then(function(r){if(r.status===404&&payload.op!=="begin"){store("");}return r.ok?r.json():null;}).catch(function(){return null;});
}
var iframe=document.querySelector('iframe[src*="mediadelivery.net"]');
if(!iframe){return;}
var ref=store(),waiting=[];
function whenRef(fn){if(ref){fn(ref);}else{waiting.push(fn);}}
send({op:"begin",ref:ref}).then(function(a){
if(a&&typeof a.ref==="string"){ref=a.ref;store(ref);}
waiting.splice(0).forEach(function(fn){if(ref){fn(ref);}});
});
function load(done){
var s=document.createElement("script");s.src="/assets/sante/js/player.min.js?v=48c4f991";s.onload=done;s.onerror=function(){};document.head.appendChild(s);
}
load(function(){
if(typeof playerjs==="undefined"||!playerjs.Player){return;}
var player=new playerjs.Player(iframe),duration=0,bound=false,started=false,sent={},best=0,lastSec=null,lastAsk=0;
function start(){if(started){return;}started=true;whenRef(function(r){send({op:"event",ref:r,event:"start"});});}
function cross(pct){
MARKS.forEach(function(m){
if(pct>=m&&!sent[m]){sent[m]=true;whenRef(function(r){send({op:"event",ref:r,event:"percent",percent:m});});}
});
}
/* One sample taken while the video plays with sound. Only a step forward of a few seconds from the last unmuted
   sample extends the furthest position, so a loop wrapping round or a muted stretch never counts. */
function heard(sec,dur){
start();
var step=lastSec===null||(sec>=lastSec&&sec-lastSec<=3);
lastSec=sec;
if(!step||!dur){return;}
var pct=sec/dur*100;
if(pct>=99){pct=100;}
if(pct>best){best=pct;cross(best);}
}
function ask(sec,dur,force){
var now=Date.now();
if(!force&&now-lastAsk<1000){return;}
lastAsk=now;
try{player.getMuted(function(m){if(m===false){heard(sec,dur);}else{lastSec=null;}});}catch(e){}
}
function bind(){
if(bound){return;}bound=true;
/* timeupdate carries seconds and duration; it only fires while playing. Each mark is sent once, the server keeps the highest. */
player.on("timeupdate",function(d){var dur=(d&&d.duration)||duration,sec=d&&d.seconds;if(!dur||typeof sec!=="number"){return;}ask(sec,dur,false);});
player.on("ended",function(){try{player.getMuted(function(m){if(m===false){start();best=100;cross(100);}});}catch(e){}});
}
player.on("ready",function(){
player.getDuration(function(d){duration=d;});bind();
try{player.getPaused(function(p){if(p===false){ask(0,0,true);}});}catch(e){}
});
setTimeout(bind,1200);
});
})();
