/* Santé setup (ClickUp z8uq9m92ez, mockup approved by Coach Ed 2026-11-11): the /settings/sante/ page. One card with
   one row, the site's Sponsor ID, and an Edit dialog: the Business Settings row and dialog (business.js, loaded
   before this file, shares its dialog and field through NOBusiness.ui). Reads GET /sites/ and
   GET /sites/{id}/sante/settings/; a save is ONE PATCH to that address with {sponsor_id}.
   "Not a Santé site" is decided from `template` in GET /sites/, never from a 404: the API answers 404 alike for a
   missing site, a site that is not a Santé site and a switched-off surface, so a 404 on a Santé site is handled like
   a site that has gone. The page adds no rule of its own: the value is trimmed, its case kept, and a refusal is the
   server's own message. Tenant safety as in business.js: the site id comes only from GET /sites/, a dialog keeps the
   id it was opened for, an answer for an older load is dropped, nothing is stored in the browser.
   Plain ES5. API strings reach the page through D.el, textContent or input.value only. */
(function () {
  var D = window.NODash, G = window.NOBusiness, U = G.ui, $ = function (id) { return document.getElementById(id); };
  var PATH = "/sante/settings/";
  var GONE = "This site is not available.";
  var SAVE_FAILED = "We couldn’t save. Check your connection and try again.";
  var S = { seq: 0, active: false, navBusy: false, site: null, settings: null, notice: "" }; /* memory only, never stored */

  function str(v) { return typeof v === "string" ? v.trim() : ""; }
  function isSante(site) { return !!site && site.template === "sante"; }
  function txt(text) { return D.el("span", {}, text); }
  function chip(kind, text) { return D.el("span", { "class": "chip chip-" + kind }, text); }
  function say(text) { var n = $("st-live"); if (n) n.textContent = text; }
  function root() { return $("st-root"); }
  function mySites(res) { return D.sitesOf(res).filter(function (s) { return s && typeof s.id === "string"; }); }
  function pick(sites) {
    var ids = sites.map(function (s) { return s.id; });
    return sites.length ? sites[ids.indexOf(D.siteFromQuery(ids))] : null;
  }

  /* The site line under the heading, as on Business Settings. Hidden while loading, on an error and when not a Santé site. */
  function head(site) {
    var line = $("st-site-line");
    if (!line) return;
    line.textContent = "";
    line.hidden = !site;
    if (!site) return;
    line.appendChild(txt("Site:"));
    line.appendChild(D.el("strong", {}, G.util.siteLabel(site)));
    if (G.util.hostOf(site)) line.appendChild(D.el("span", { "class": "bs-host" }, G.util.hostOf(site)));
    if (str(site.template_label)) line.appendChild(chip("info", str(site.template_label)));
  }

  /* ---- the reads and the page states ---- */
  function load(again) {
    var body = root();
    if (!body) return;
    var my = ++S.seq;
    U.closeDialog();
    S.site = null; S.settings = null; /* nothing from the site shown before outlives a new read */
    head(null);
    skeleton(body);
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (my !== S.seq || res.status === 401) return; /* a newer read owns the page, or app.js is already signing out */
      if (!res.ok) { drawError(body); return; }
      var sites = mySites(res), site = pick(sites);
      D.setSante(isSante(site)); /* the same answer decides the tab, the More tile and the quick link */
      if (!site) { drawNoSite(body); return; }
      if (!isSante(site)) { drawNotSante(body); return; }
      D.call("GET", "/sites/" + site.id + PATH, null, true).then(function (r) {
        if (my !== S.seq || r.status === 401) return;
        if (r.status === 404) { if (again) drawGone(body); else gone(); return; }
        if (!r.ok || !r.data) { drawError(body); return; }
        S.site = site;
        S.settings = r.data;
        draw();
      });
    });
  }
  /* A Santé site that answers 404 (removed, or not this account's): say only that, and read the list again, once. */
  function gone() {
    S.notice = GONE;
    say(GONE);
    load(true);
  }
  function skeleton(body) {
    body.textContent = "";
    var sk = D.el("div", { "class": "skel", "aria-busy": "true" });
    sk.appendChild(D.el("span", { "class": "sr-only" }, "Loading this site’s Santé setup"));
    sk.appendChild(D.el("div", { "class": "skel-block acct-skel-card", "aria-hidden": "true" }));
    body.appendChild(sk);
  }
  function takeNotice(parent) {
    if (!S.notice) return;
    parent.appendChild(D.el("p", { "class": "err-box bs-notice", id: "st-notice", role: "alert" }, S.notice));
    S.notice = "";
  }
  function errBox(body, title, text) {
    body.textContent = "";
    S.notice = "";
    var box = D.el("div", { "class": "err-box", role: "alert" });
    box.appendChild(D.el("h2", {}, title));
    if (text) box.appendChild(D.el("p", {}, text));
    var again = D.el("button", { type: "button", "class": "no-btn no-btn-primary" }, "Try again");
    again.addEventListener("click", function () { load(); });
    box.appendChild(again);
    body.appendChild(box);
  }
  function drawError(body) { errBox(body, "We could not load this site’s Santé setup", "Check your connection and try again. Nothing was changed."); }
  function drawGone(body) { errBox(body, GONE, ""); }
  /* The "not available" card pattern: a tag, a heading, one line and the way back. */
  function phCard(body, id, tag, title, text) {
    body.textContent = "";
    var wrap = D.el("div", { "class": "stack" });
    takeNotice(wrap);
    var c = D.el("section", { "class": "dash-card ph-card", "aria-labelledby": id });
    c.appendChild(chip("neutral", tag));
    c.appendChild(D.el("h2", { id: id }, title));
    c.appendChild(D.el("p", {}, text));
    c.appendChild(D.el("a", { "class": "no-btn no-btn-ghost", href: "/" }, "Back to Overview"));
    wrap.appendChild(c);
    body.appendChild(wrap);
  }
  function drawNoSite(body) {
    phCard(body, "st-h-nosite", "No site yet", "Create your site first", "Santé setup opens once your first site is created. Finish the setup on Overview.");
  }
  function drawNotSante(body) {
    phCard(body, "st-h-notsante", "Not for this site", "Santé setup is only for Santé sites", "This site is not a Santé site, so there is nothing to set up here.");
  }
  function draw(focusId) {
    var body = root(), site = S.site, settings = S.settings;
    if (!body || !site || !settings) return;
    head(site);
    body.textContent = "";
    var wrap = D.el("div", { "class": "stack" });
    takeNotice(wrap);
    var card = D.el("section", { "class": "dash-card acct-card", "aria-labelledby": "st-h-sponsor" });
    card.appendChild(D.el("h2", { id: "st-h-sponsor" }, "Sponsor ID"));
    card.appendChild(D.el("p", { "class": "dash-copy" }, "New members who register through this site are registered under your own Santé sponsor ID."));
    var sponsor = str(settings.sponsor_id);
    var row = D.el("div", { "class": "acct-set-row" });
    row.appendChild(D.el("div", { "class": "acct-set-label" }, "Sponsor ID"));
    var value = D.el("div", { "class": "acct-set-value" });
    if (sponsor) value.appendChild(txt(sponsor));
    else {
      value.appendChild(D.el("span", { "class": "bs-none" }, "Not added"));
      value.appendChild(chip("warn", "Needed for member registration"));
    }
    row.appendChild(value);
    var action = D.el("div", { "class": "acct-set-action" });
    var edit = D.el("button", { type: "button", "class": "no-btn no-btn-ghost", id: "st-edit", "aria-label": "Edit sponsor ID" }, "Edit");
    edit.addEventListener("click", function () { openEdit(edit); });
    action.appendChild(edit);
    row.appendChild(action);
    if (!sponsor) row.appendChild(D.el("div", { "class": "bs-row-help" }, "Member registration on this site cannot start until you add it. Nothing else on your site waits for it."));
    card.appendChild(row);
    wrap.appendChild(card);
    body.appendChild(wrap);
    var f = focusId ? $(focusId) : null;
    if (f) f.focus();
  }

  /* ---- the Edit dialog: one field, one request, to the site id the dialog was opened for ---- */
  function openEdit(opener) {
    var site = S.site, settings = S.settings;
    if (!site || !settings) return;
    var siteId = site.id, seq = S.seq, key = "sponsor_id", order = [key], fields = {};
    var body = U.openDialog(opener, "Edit sponsor ID");
    var form = D.el("form", { "class": "acct-dlg-form", novalidate: "" });
    form.appendChild(D.el("p", { "class": "dash-copy" }, "For " + G.util.siteLabel(site) + ". New members who register through this site are registered under this sponsor ID."));
    var f = U.field({ key: key, label: "Sponsor ID", value: str(settings.sponsor_id),
      hint: "Letters, digits and hyphens only, up to 32 characters. Leave it blank to remove it." });
    f.input.setAttribute("spellcheck", "false");
    fields[key] = f;
    form.appendChild(f.box);
    var failed = D.el("p", { "class": "ob-err bs-dlg-err", id: "st-dlg-err", role: "alert" });
    failed.hidden = true;
    form.appendChild(failed);
    var save = D.el("button", { type: "submit", "class": "no-btn no-btn-primary", id: "st-dlg-save" }, "Save");
    var cancel = D.el("button", { type: "button", "class": "no-btn no-btn-ghost", id: "st-dlg-cancel" }, "Cancel");
    cancel.addEventListener("click", U.cancelDialog);
    var foot = D.el("div", { "class": "acct-dlg-foot" });
    foot.appendChild(save);
    foot.appendChild(cancel);
    form.appendChild(foot);
    function current() { return seq === S.seq && !!S.site && S.site.id === siteId; }
    function open() { return U.dialogBody() === body; }
    function busy(on) { save.disabled = on; save.textContent = on ? "Saving…" : "Save"; }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (save.disabled || !open() || !current()) return; /* a dialog for a page that was left sends nothing */
      var out = { sponsor_id: String(f.input.value || "").trim() }; /* trimmed, case kept, blank clears it: the server decides the rest */
      failed.hidden = true;
      U.setErrors(fields, order, null);
      busy(true);
      D.call("PATCH", "/sites/" + siteId + PATH, out, true).then(function (res) {
        if (!current()) return; /* the page was left or read again: this answer is not drawn */
        if (res.ok && res.data) {
          S.settings = res.data;
          if (open()) U.closeDialog();
          draw("st-edit");
          D.toast("Saved");
          say("Saved.");
          return;
        }
        if (!open()) return;
        busy(false);
        if (res.status === 401) return; /* app.js is already sending the owner to sign in */
        if (res.status === 404) { U.closeDialog(); gone(); return; }
        var refused = res.data && res.data.fields ? G.util.fieldMessage(res.data.fields[key]) : "", map = {};
        if (refused) { map[key] = refused; U.setErrors(fields, order, map); return; }
        /* A site limited to Billing (403) and too many saves (429) say so in the server's words; anything else is the save-failed line. */
        var told = (res.status === 403 || res.status === 429) && res.data && typeof res.data.message === "string" ? res.data.message : "";
        failed.textContent = told || SAVE_FAILED;
        failed.hidden = false;
        save.focus();
      });
    });
    body.appendChild(form);
    f.input.focus();
  }

  /* The Settings tab, the More tile and the quick link (all hidden in the markup): one read of GET /sites/ shows
     them for a Santé site. Skipped while the page itself is reading, while a read is under way, and once known. */
  function nav() {
    if (S.active || S.navBusy || D.isSante()) return;
    S.navBusy = true;
    D.call("GET", "/sites/", null, true).then(function (res) {
      S.navBusy = false;
      if (res.ok && !S.active) D.setSante(isSante(pick(mySites(res))));
    });
  }

  window.NOSante = {
    show: function () { S.active = true; load(); },
    hide: function () { S.active = false; S.seq++; U.closeDialog(); S.site = null; S.settings = null; S.notice = ""; say(""); },
    nav: nav
  };
})();
