/* The member lesson page's watch script (ClickUp z8uq9mhbhd, CP-1 R2). A Bunny Stream lesson's embed speaks the player.js protocol, so this
   follows how far the member has got (the furthest point reached) and posts it to this storefront server at each 10 percent step
   (10, 20 ... 90) and at the end (100). The server keeps the highest, and it never marks the lesson complete: "Mark complete" is the member's own
   button. A step is sent once, and only once the server has taken it, so a failed post is tried again at the next step. Nothing goes to any
   third party. The Player.js library is this storefront's own copy (js/player.min.js, v0.0.11). */
(function(){
var box=document.querySelector('[data-watch="1"]');
var iframe=box&&box.querySelector("iframe");
var id=box&&box.getAttribute("data-lesson-video");
if(!iframe||!id){return;}
var URL="/dashboard/training/lesson/"+encodeURIComponent(id)+"/watch/";
var best=0,sent=0,busy=false;
function post(percent){
return fetch(URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({percent:percent}),credentials:"same-origin",keepalive:true})
.then(function(r){return r.ok;}).catch(function(){return false;});
}
function flush(){
if(busy){return;}
var step=best>=100?100:Math.floor(best/10)*10;
if(step<10||step<=sent){return;}
busy=true;
post(step).then(function(ok){
busy=false;
if(ok){if(step>sent){sent=step;}flush();}
});
}
function reached(pct){
if(pct>best){best=Math.min(100,pct);flush();}
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
player.on("ended",function(){reached(100);});
}
player.on("ready",function(){player.getDuration(function(d){duration=d;});bind();});
setTimeout(bind,1200);
});
})();
