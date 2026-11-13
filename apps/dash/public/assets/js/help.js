/* Help Center (ClickUp z8uq9mekvc). The articles are static HTML in index.html; this file only does two small things:
   it points each link marked data-site-path at the public site (the host comes from config.js, so staging and production
   each open their own), and it scrolls to an article when the address carries its #anchor, which the browser cannot do
   while the view is still hidden. Plain ES5, no API call, nothing stored. */
(function () {
  var D = window.NODash;
  function siteLinks() {
    var base = D && D.cfg && typeof D.cfg.siteUrl === "string" ? D.cfg.siteUrl.replace(/\/+$/, "") : "";
    Array.prototype.forEach.call(document.querySelectorAll("#view-help a[data-site-path]"), function (a) {
      var path = a.getAttribute("data-site-path");
      if (base && /^\/[a-z-]+(#[a-z-]+)?$/.test(path)) { a.setAttribute("href", base + path); a.setAttribute("rel", "noopener"); a.setAttribute("target", "_blank"); }
      else a.removeAttribute("href"); /* no site address configured: plain text rather than a dead link */
    });
  }
  function toAnchor() {
    var id = (location.hash || "").slice(1), n = /^help-[a-z]+$/.test(id) ? document.getElementById(id) : null;
    if (n && !document.getElementById("view-help").hidden && n.scrollIntoView) n.scrollIntoView();
  }
  siteLinks();
  window.addEventListener("load", toAnchor);
  window.addEventListener("hashchange", toAnchor);
  window.NOHelp = { siteLinks: siteLinks, toAnchor: toAnchor };
})();
