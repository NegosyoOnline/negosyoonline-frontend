/* The member shell's menu button (the Santé dashboard bar on a phone). TWCinc wrote this as an inline script in
   shell.html; the storefronts' policy allows no inline script, so the same lines live in this file. */
(function () {
  var n = document.getElementById("pdn"), b = document.getElementById("pdnToggle");
  if (!n || !b) { return; }
  b.addEventListener("click", function () {
    var o = n.classList.toggle("is-open");
    b.setAttribute("aria-expanded", o ? "true" : "false");
  });
})();
