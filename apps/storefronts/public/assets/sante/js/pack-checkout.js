/* The checkout page's script (TWCinc's checkout.html and _transfer_proof.html carried it as inline blocks; this server's
   policy allows no inline script, so it is one external file). Only the values the templates printed into the script
   (the check address and the email message) are read from data- attributes on the form instead. The Xendit branches are
   not here: this site takes bank or e-wallet transfer only. */
/* A tap on a saved QR code opens it large in one shared dialog. A browser without <dialog> opens the image itself. */
/* The transfer sheet slides open and shut (.pp-co-slide): the class drives the animation, aria-hidden the readers. */
function setSlide(el,open){
if(!el){return;}
el.classList.toggle("is-open",open);
el.setAttribute("aria-hidden",open?"false":"true");
}
function bindQrZoom(root){
var qrs=root.querySelectorAll("[data-qr-zoom]");
var dlg=null;
function open(img){
if(typeof HTMLDialogElement==="undefined"){window.open(img.src,"_blank");return;}
if(!dlg){
dlg=document.createElement("dialog");dlg.className="qr-zoom";dlg.setAttribute("aria-label","QR code, enlarged");
var big=document.createElement("img");var close=document.createElement("button");close.type="button";close.textContent="Close";
dlg.appendChild(big);dlg.appendChild(close);document.body.appendChild(dlg);
close.addEventListener("click",function(){dlg.close();});
dlg.addEventListener("click",function(e){if(e.target===dlg){dlg.close();}});
}
var big=dlg.querySelector("img");big.src=img.src;big.alt=img.alt;
dlg.showModal();
}
for(var k=0;k<qrs.length;k++){
qrs[k].addEventListener("click",function(e){open(e.currentTarget.querySelector("img"));});
}
}
function bindCopy(form){
var copies=form.querySelectorAll("[data-copy]");
for(var k=0;k<copies.length;k++){
if(navigator.clipboard){copies[k].hidden=false;}
copies[k].addEventListener("click",function(e){
var n=e.currentTarget.parentNode.querySelector("[data-num]");
if(n&&navigator.clipboard){navigator.clipboard.writeText(n.textContent.trim());e.currentTarget.textContent="Copied";}
});
}
}
(function(){
var box=document.getElementById("tt-field");
if(!box){return;}
var out=document.getElementById("transferred_at"),date=document.getElementById("tt_date"),hour=document.getElementById("tt_hour"),min=document.getElementById("tt_min"),ap=document.getElementById("tt_ampm");
for(var i=0;i<60;i++){var o=document.createElement("option");o.value=(i<10?"0":"")+i;o.textContent=o.value;min.appendChild(o);}
var posted=box.getAttribute("data-posted")||"",p=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(posted);
if(p){var h=parseInt(p[2],10);date.value=p[1];ap.value=h>=12?"PM":"AM";hour.value=String(h%12||12);min.value=p[3];}
else if(/^\d{4}-\d{2}-\d{2}$/.test(posted)){date.value=posted;}
function build(){
if(!date.value){out.value="";return;}
if(hour.value&&min.value&&ap.value){var h24=(parseInt(hour.value,10)%12)+(ap.value==="PM"?12:0);out.value=date.value+"T"+(h24<10?"0":"")+h24+":"+min.value;}
else{out.value=date.value;}
}
[date,hour,min,ap].forEach(function(el){el.addEventListener("change",build);});
/* Gate before sending (Coach Ed 2026-11-01): with the transfer sheet open, an empty or wrong field stops the submit here, with the
   message under it, so nothing is posted or uploaded until the form is complete. The server still decides. Runs first (capture). */
var panel=document.getElementById("direct-panel"),form=box.closest("form");
if(!form||!panel){return;}
function field(el){return el.closest(".pp-co-field");}
function clearGate(el){
var fld=field(el);if(!fld){return;}
var p;while((p=fld.querySelector(".pp-co-error"))){p.remove();}
el.removeAttribute("aria-invalid");
fld.classList.remove("is-invalid");
var c=el.closest(".pp-co-control");if(c){c.classList.remove("is-invalid");}
el.classList.remove("is-invalid");
var wrap=el.closest(".file");if(wrap){wrap.classList.remove("bad");}
}
function flag(el,message){
var fld=field(el);if(!fld){return;}
var old;while((old=fld.querySelector(".pp-co-error"))){old.remove();}
var p=document.createElement("p");p.className="pp-co-error";p.setAttribute("data-gate","");p.setAttribute("role","alert");p.textContent=message;
fld.appendChild(p);
fld.classList.add("is-invalid");
if(el.classList.contains("pp-co-input")){el.classList.add("is-invalid");}
var wrap=el.closest(".file");if(wrap){wrap.classList.add("bad");}
}
function amountOk(v){v=v.trim().replace(/,/g,"");return /^\d+(\.\d{1,2})?$/.test(v)&&parseFloat(v)>0;}
function ttFilled(){return !!(date.value&&hour.value&&min.value&&ap.value);}
/* The server reads the time as Manila time (UTC+8, no daylight saving) and allows the buyer's clock five minutes of drift. */
function ttFuture(){var t=Date.parse(out.value+":00+08:00");return !isNaN(t)&&t>Date.now()+300000;}
var rules=[
["account_id","Choose the account you paid to.",function(el){return !!el.value;}],
["sender_bank","Enter the sender bank.",function(el){return !!el.value.trim();}],
["reference_number","Enter the reference number.",function(el){return !!el.value.trim();}],
["sender_first_name","Enter the sender's first name.",function(el){return !!el.value.trim();}],
["sender_last_name","Enter the sender's last name.",function(el){return !!el.value.trim();}],
["sender_account_number","Enter the sender account number.",function(el){return !!el.value.trim();}],
["amount_sent","Enter the amount you sent.",function(el){return amountOk(el.value);}],
["tt_date",function(){return ttFilled()?"The time of transfer cannot be in the future.":"Enter the date and exact time of your transfer.";},function(){return ttFilled()&&!ttFuture();}],
["proof","Attach the file.",function(el){return !!(el.files&&el.files.length);}]
];
rules.forEach(function(r){
var el=document.getElementById(r[0]);
if(!el){el=form.querySelector('[name="'+r[0]+'"]');}
if(!el){return;}
["input","change"].forEach(function(t){el.addEventListener(t,function(){if(r[2](el)){clearGate(el);}});});
});
/* Once all four parts are chosen the time is judged at once: a time still in the future keeps (or gets) its message, a good one clears it. */
[date,hour,min,ap].forEach(function(s){s.addEventListener("change",function(){if(!ttFilled()){return;}if(ttFuture()){flag(date,"The time of transfer cannot be in the future.");}else{clearGate(date);}});});
form.addEventListener("submit",function(ev){
if(!panel.classList.contains("is-open")){return;}
var first=null;
rules.forEach(function(r){
var el=document.getElementById(r[0])||form.querySelector('[name="'+r[0]+'"]');
if(!el||el.type==="hidden"){return;}
if(r[2](el)){clearGate(el);return;}
flag(el,typeof r[1]==="function"?r[1]():r[1]);
if(!first){first=el;}
});
if(first){
ev.preventDefault();ev.stopImmediatePropagation();
var btn=form.querySelector('button[type="submit"]');if(btn){btn.disabled=false;}
var tgt=first.id==="tt_date"?document.getElementById("tt-field"):field(first);
if(tgt&&tgt.scrollIntoView){tgt.scrollIntoView({behavior:"smooth",block:"center"});}
if(first.id!=="tt_date"&&first.focus){try{first.focus({preventScroll:true});}catch(e){}}
}
},true);
})();

(function(){
var f=document.getElementById("contact-form"),b=document.getElementById("contact-btn"),m=document.getElementById("mobile"),e=document.getElementById("email"),agree=document.getElementById("agree"),agreeMsg=document.getElementById("agree-msg"),enroll=document.getElementById("enrollment_authorized"),enrollMsg=document.getElementById("enrollment-msg"),checks=0,wait,malformed=f?(f.dataset.emailError||""):"";
if(!f){return;}
/* 9XX XXX XXXX as the buyer types or pastes: ten digits at most, a leading 0 or 63 dropped, the caret kept in place. The server strips the spaces. */
function formatMobile(){
var left=m.value.slice(0,m.selectionStart||0).replace(/\D/g,"").length,d=m.value.replace(/\D/g,"").replace(/^0/,"");
if(d.length>10)d=d.replace(/^63/,"");
d=d.slice(0,10);
m.value=[d.slice(0,3),d.slice(3,6),d.slice(6)].filter(Boolean).join(" ");
if(document.activeElement===m){var at=left+(left>6?2:left>3?1:0);m.setSelectionRange(at,at);}
}
m.addEventListener("input",formatMobile);
formatMobile();
/* Green border and check once a field is correct, as on the shop checkout (storefront.js setFieldOk). */
function isGood(el){
if(el===m)return /^9\d{9}$/.test(el.value.replace(/\D/g,""));
if(el.name==="amount_sent"){var n=el.value.trim().replace(/,/g,"");return /^\d+(\.\d{1,2})?$/.test(n)&&parseFloat(n)>0;}  /* the transfer sheet's Amount */
return !!el.value.trim()&&el.validity.valid;
}
function setOk(el){
var fld=el.closest(".pp-co-field"),box=el.parentNode,ok=isGood(el)&&(!isContact(el)||el.dataset.cleared===el.value)&&!el.dataset.taken&&!(fld&&fld.querySelector(".pp-co-error"));
box.classList.toggle("pp-co-ok",ok);
if(ok){el.classList.remove("is-invalid");box.classList.remove("is-invalid");}
}
/* The mobile and email get their check only after the server clears them (Coach Ed 2026-10-31); a limited or failed check leaves the field unmarked, and Continue still decides. */
function isContact(el){return el===m||el===e;}
function fieldOf(el){return el.closest(".pp-co-field");}
/* A message the server printed stands until that field is edited: the check neither asks about the field nor touches it, and Continue stays with the server. */
[m,e].forEach(function(el){if(fieldOf(el).querySelector(".pp-co-error"))el.dataset.refused="1";});
function clearTaken(el){
var p=fieldOf(el).querySelector(".pp-co-error");
if(p)p.remove();
delete el.dataset.taken;
delete el.dataset.refused;
(el===m?el.parentNode:el).classList.remove("is-invalid");
}
function showTaken(el,message){
var p=fieldOf(el).querySelector(".pp-co-error");
if(!p){p=document.createElement("p");p.className="pp-co-error";fieldOf(el).appendChild(p);}
p.textContent=message;
el.dataset.taken="1";
(el===m?el.parentNode:el).classList.add("is-invalid");
}
function check(){
var sent={mobile:isGood(m)&&!m.dataset.refused?m.value:"",email:isGood(e)&&!e.dataset.refused?e.value:""},run=++checks;
if(!sent.mobile&&!sent.email)return;
var body=new URLSearchParams({mobile:sent.mobile,email:sent.email});
fetch(f.dataset.checkPath,{method:"POST",body:body,credentials:"same-origin"}).then(function(r){
if(!r.ok)throw r;
return r.json();
}).then(function(data){
if(run!==checks)return;
[[m,"mobile"],[e,"email"]].forEach(function(pair){
var el=pair[0],name=pair[1];
if(!sent[name]||el.value!==sent[name])return;
if(data.errors[name]===malformed&&document.activeElement===el)return;  /* every address passes through this while it is typed: leaving the field, or Continue, gives the refusal */
if(data.errors[name]){showTaken(el,data.errors[name]);}else{clearTaken(el);el.dataset.cleared=el.value;}
setOk(el);
});
}).catch(function(){});
}
Array.prototype.forEach.call(f.querySelectorAll("input.pp-co-input[required],#mobile"),function(el){
if(el!==m){var w=document.createElement("span");w.className="pp-co-control";el.parentNode.insertBefore(w,el);w.appendChild(el);}
var c=document.createElement("span");c.className="pp-co-check";c.textContent="✓";c.setAttribute("aria-hidden","true");el.parentNode.appendChild(c);
el.addEventListener("input",function(){
if(!isContact(el)){var fe=el.closest(".pp-co-field"),er=fe&&fe.querySelector(".pp-co-error");if(er)er.remove();el.classList.remove("is-invalid");el.parentNode.classList.remove("is-invalid");}  /* an edit retires the old error; the next check decides */
if(isContact(el)){delete el.dataset.cleared;checks++;clearTaken(el);}
setOk(el);
if(el===m&&isGood(m))check();
if(el===e){clearTimeout(wait);if(isGood(e))wait=setTimeout(check,600);}
});
el.addEventListener("blur",function(){
setOk(el);
if(isContact(el)&&isGood(el)&&!el.dataset.taken&&el.dataset.cleared!==el.value){clearTimeout(wait);check();}
});
setOk(el);
});
f.addEventListener("submit",function(ev){
var taken=m.dataset.taken?m:e.dataset.taken?e:null;
if(taken){ev.preventDefault();taken.focus();return;}
if(!enroll.checked){ev.preventDefault();enrollMsg.hidden=false;enroll.focus();return;}
if(!agree.checked){ev.preventDefault();agreeMsg.hidden=false;agree.focus();return;}
/* The Membership Terms popup opens only when the rest of the form is good, so a buyer never agrees to the terms and is then sent back to fix a field. */
var bad=null;
Array.prototype.forEach.call(f.querySelectorAll("input.pp-co-input[required],#mobile"),function(el){
if(!bad&&el.closest("#direct-panel:not(.is-open)")===null&&!isGood(el)){bad=el;}
});
if(bad){ev.preventDefault();setOk(bad);(bad===m?bad.parentNode:bad).classList.add("is-invalid");bad.focus();return;}
if(window.ppAgreement&&window.ppAgreement.gate(ev))return;
setTimeout(function(){b.disabled=true;},0);
});
agree.addEventListener("change",function(){if(agree.checked)agreeMsg.hidden=true;});
enroll.addEventListener("change",function(){if(enroll.checked)enrollMsg.hidden=true;});
/* The transfer card opens the accounts and receipt form under it and renames the button. */
var pay=f.querySelectorAll('input[name=pay_method]'),panel=document.getElementById("direct-panel"),label=document.getElementById("contact-btn-label");
function syncPay(){
var v="";for(var i=0;i<pay.length;i++){if(pay[i].checked){v=pay[i].value;}}
setSlide(panel,v==="direct");
if(v==="direct"&&label.dataset.direct){label.textContent=label.dataset.direct;}
}
for(var p=0;p<pay.length;p++){pay[p].addEventListener("change",syncPay);}
bindCopy(f);bindQrZoom(f);
window.addEventListener("pageshow",function(){b.disabled=false;if(isGood(m)||isGood(e))check();});
})();
(function(){
var f=document.getElementById("place-form"),b=document.getElementById("place-btn");
if(!f){return;}
var d=document.getElementById("direct-panel");
setSlide(d,true);
bindCopy(f);bindQrZoom(f);
f.addEventListener("submit",function(){
b.setAttribute("aria-busy","true");
b.textContent="Placing order…";
setTimeout(function(){b.disabled=true;},0);
});
})();
