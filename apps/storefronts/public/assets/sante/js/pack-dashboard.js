/* My Orders: the View Details toggle on each order card (the Barley storefront.js behaviour, bound inside #pp-dash-orders). */
(function () {
  var root = document.getElementById("pp-dash-orders");
  if (!root) { return; }
  root.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".oc-detail-toggle") : null;
    if (!btn || !root.contains(btn)) { return; }
    var card = btn.closest(".oc-card"), box = card && card.querySelector(".oc-detail");
    if (!box) { return; }
    var open = box.hasAttribute("hidden");
    if (open) { box.removeAttribute("hidden"); } else { box.setAttribute("hidden", ""); }
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.innerHTML = open ? "Hide Details &uarr;" : "View Details &rarr;";
  });
})();
