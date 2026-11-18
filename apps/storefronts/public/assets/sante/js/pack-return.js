/* The return page (src/views/sante/pack-return.ts), from TWCinc's return.html script: polls the status path every 3 seconds.
   Paid goes on to the onboarding page; after 5 polls still waiting it says it is still checking; after 20 it stops.
   The server decides every state: this only reads and shows it. */
(function(){
var root=document.getElementById("pack-return");
if(!root||root.getAttribute("data-poll")!=="1"){return;}
var url=root.getAttribute("data-status-path"),onboarding=root.getAttribute("data-onboarding-path"),tries=0;
function show(name,body){
var panes=root.querySelectorAll("[data-state]");
for(var i=0;i<panes.length;i++){panes[i].hidden=panes[i].getAttribute("data-state")!==name;}
var c=root.querySelector("[data-continue]");
if(c){c.hidden=!(body&&body.pay_url);}
}
function again(fn){setTimeout(fn,3000);}
function poll(){
tries+=1;
var x=new XMLHttpRequest();
x.open("GET",url,true);
x.setRequestHeader("Accept","application/json");
x.onload=function(){
var b={};try{b=JSON.parse(x.responseText);}catch(e){}
if(b.state==="paid"){show("paid",b);window.location.href=onboarding;return;}
if(b.state==="under_review"||b.state==="needs_attention"){window.location.href=onboarding;return;}
if(b.state==="expired"||b.state==="no_invoice"||b.state==="mismatch"){show(b.state,b);return;}
if(b.state==="none"){show("expired",b);return;}
if(tries>=20){show("checking",b);return;}
if(b.state==="waiting"&&tries>=5){show("checking",b);}
again(poll);
};
x.onerror=function(){if(tries>=20){show("checking",{});}else{again(poll);}};
x.send();
}
poll();
})();
