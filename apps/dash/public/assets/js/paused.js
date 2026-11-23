/* Paused store banner (H3, ClickUp z8uq9mhpbf; contract z8uq9mhpbe). When HQ has suspended the owner's store, the site payload
   the dashboard already reads (GET /sites/, the same item the other probes use) carries held: true, and a banner sits at the top
   of every view. Reading is unchanged: nothing is hidden or blocked here, the API decides what the owner can still do.
   Any other answer (no field, false, a string "true", a failed read) leaves the banner hidden. The field name is FIELD, in one place.
   The text is fixed in index.html; nothing from the API is written to the page. Plain ES5. */
(function () {
  var D = window.NODash, FIELD = "held";

  function banner() { return document.getElementById("paused-banner"); }
  function set(on) { var b = banner(); if (b) b.hidden = !on; }

  /* The caller's site (the one named by ?site= if it is theirs, else the first) is held only when its `held` is exactly true. */
  function heldOf(sites, search) {
    if (!sites || !sites.length) return false;
    var ids = sites.map(function (x) { return x && x.id; });
    var id = D.siteFromQuery(ids, search), site = null;
    sites.forEach(function (x) { if (x && x.id === id) site = x; });
    return !!site && site[FIELD] === true;
  }

  function probe() {
    D.call("GET", "/sites/", null, true).then(function (res) {
      set(!!(res && res.ok) && heldOf(D.sitesOf(res)));
    });
  }

  window.NOPaused = { probe: probe, util: { heldOf: heldOf } };
})();
