/* The pay page (src/views/sante/pack-pay.ts): opens the Xendit invoice by navigation. The link is the fallback if this
   does not run. The address is the page's own data- attribute, put there by the server after it checked it is Xendit's. */
(function(){
var box=document.getElementById("pack-pay");
if(!box){return;}
var url=box.getAttribute("data-pay-url");
if(url){setTimeout(function(){window.location.replace(url);},800);}
})();
