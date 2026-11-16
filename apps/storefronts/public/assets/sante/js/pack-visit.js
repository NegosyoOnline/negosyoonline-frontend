/* The landing page's visitor script (ClickUp z8uq9mfw14), adapted from TWCinc's eco-landing.min.js (the Player.js
   video tracking: play, then the 25, 50, 75, 90 and 100 percent marks, the highest kept by the server). It asks this
   storefront server for a visit, keeps the ref in localStorage (no cookie), and reports how far the video got. Nothing
   goes to Meta or any third party; the ref is the only thing the browser holds. The Player.js library is this
   storefront's own copy (js/player.min.js, v0.0.11). */
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
var player=new playerjs.Player(iframe),duration=0,bound=false,started=false,sent={};
function start(){if(started){return;}started=true;whenRef(function(r){send({op:"event",ref:r,event:"start"});});}
function cross(pct){
MARKS.forEach(function(m){
if(pct>=m&&!sent[m]){sent[m]=true;whenRef(function(r){send({op:"event",ref:r,event:"percent",percent:m});});}
});
}
function bind(){
if(bound){return;}bound=true;
player.on("play",start);
/* timeupdate carries seconds and duration; each mark is sent once, and the server keeps the highest. */
player.on("timeupdate",function(d){var dur=(d&&d.duration)||duration,sec=d&&d.seconds;if(!dur||!sec){return;}cross(sec/dur*100);});
player.on("ended",function(){cross(100);});
try{player.getPaused(function(p){if(p===false){start();}});}catch(e){}
}
player.on("ready",function(){player.getDuration(function(d){duration=d;});bind();});
setTimeout(bind,1200);
});
})();
