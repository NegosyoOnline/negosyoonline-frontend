/* The "Santé Username" row on Business Settings (the site's Santé sponsor ID; ClickUp z8uq9m92ez; mockup approved by Coach Ed 2026-11-11, moved
   into Business Settings and then into the Business identity card by his rulings of the same day). For a Santé site
   it is the last row of the Business identity card, in the place of the "Site type" row: the site's Sponsor ID and
   an Edit dialog. business.js (loaded before this file) draws the page, hands this file the site and its Site type
   row (NOSante.mount) and shares its dialog and field through NOBusiness.ui. Reads GET /sites/{id}/sante/settings/;
   a save is ONE PATCH to that address with {sponsor_id}.
   "A Santé site" is decided from `template` in GET /sites/ (the answer business.js already has), never from a 404:
   the API answers 404 alike for a missing site, a site that is not a Santé site and a switched-off surface. A 404
   on the read puts the Site type row back; a 404 on a save reads the whole page again, and Business Settings says
   what it finds. The row adds no rule of its own: the value is trimmed, its case kept, and a refusal is the server's
   own message.
   Tenant safety as in business.js: the site comes only from business.js's GET /sites/, a dialog keeps the id it was
   opened for, an answer for an older read is dropped, nothing is stored in the browser.
   The screen calls it "Santé Username" (Coach Ed's ruling, 2026-11-11); the API field and this file's names stay sponsor_id.
   Plain ES5. API strings reach the page through D.el, textContent or input.value only. */
(function () {
  var D = window.NODash, G = window.NOBusiness, U = G.ui, $ = function (id) { return document.getElementById(id); };
  var PATH = "/sante/settings/";
  var SAVE_FAILED = "We couldn’t save. Check your connection and try again.";
  var S = { seq: 0, site: null, settings: null, type: null, node: null }; /* memory only, never stored */

  function str(v) { return typeof v === "string" ? v.trim() : ""; }
  function isSante(site) { return !!site && site.template === "sante"; }
  function txt(text) { return D.el("span", {}, text); }
  function say(text) { var n = $("bs-live"); if (n) n.textContent = text; } /* Business Settings' own live region */

  /* business.js calls this each time it draws the page for a site: `slot` is the Site type row it just drew in the
     Business identity card. A site that is not a Santé site keeps that row and gets nothing. For a Santé site the
     Sponsor ID row takes its place at once, so the card does not change shape when the read answers. The same site
     drawn again (after a Business Settings save) reuses what was read. */
  function mount(site, slot) {
    S.type = slot || null;
    S.node = S.type;
    if (!S.type || !isSante(site)) { S.seq++; S.site = null; S.settings = null; S.type = null; S.node = null; return; }
    if (S.site && S.site.id === site.id && S.settings) { S.site = site; draw(); return; }
    S.site = site;
    S.settings = null;
    place(shell([D.el("span", { "class": "bs-none" }, "Loading…")]));
    load();
  }
  /* business.js calls this when it starts a new read or the page is left: nothing from before is drawn afterwards. */
  function reset() { S.seq++; S.site = null; S.settings = null; S.type = null; S.node = null; }

  function load() {
    var my = ++S.seq, site = S.site;
    if (!site) return;
    D.call("GET", "/sites/" + site.id + PATH, null, true).then(function (r) {
      if (my !== S.seq || r.status === 401) return; /* a newer read owns the row, or app.js is already signing out */
      if (r.status === 404) { place(S.type); return; } /* no Santé settings here: the Site type row is back, the page is as it was */
      if (!r.ok || !r.data) { drawError(); return; }
      S.settings = r.data;
      draw();
    });
  }
  /* One row holds the place at the end of the Business identity card; a new one replaces the one there. */
  function place(row) {
    var old = S.node, parent = old && old.parentNode;
    if (!parent || !row || row === old) return;
    parent.insertBefore(row, old);
    parent.removeChild(old);
    S.node = row;
  }
  /* The card's own row pattern: label, value, an action to its right, a help line under it. No Public or Private tag. */
  function shell(values, action, help) {
    var row = D.el("div", { "class": "acct-set-row", id: "st-row" });
    row.appendChild(D.el("div", { "class": "acct-set-label" }, "Santé Username"));
    var value = D.el("div", { "class": "acct-set-value" });
    values.forEach(function (n) { value.appendChild(n); });
    row.appendChild(value);
    if (action) { var a = D.el("div", { "class": "acct-set-action" }); a.appendChild(action); row.appendChild(a); }
    if (help) row.appendChild(D.el("div", { "class": "bs-row-help" }, help));
    return row;
  }
  function drawError() {
    var again = D.el("button", { type: "button", "class": "no-btn no-btn-ghost", id: "st-retry" }, "Try again");
    again.addEventListener("click", function () { load(); });
    place(shell([D.el("span", { "class": "bs-none", role: "alert" }, "We could not load the Santé username.")], again));
  }
  function draw(focusId) {
    var settings = S.settings;
    if (!S.node || !S.site || !settings) return;
    var sponsor = str(settings.sponsor_id);
    var edit = D.el("button", { type: "button", "class": "no-btn no-btn-ghost", id: "st-edit", "aria-label": "Edit Santé username" }, "Edit");
    edit.addEventListener("click", function () { openEdit(edit); });
    place(sponsor ? shell([txt(sponsor)], edit)
      : shell([D.el("span", { "class": "bs-none" }, "Not added")], edit, "Member registration on this site cannot start until you add it."));
    var f = focusId ? $(focusId) : null;
    if (f) f.focus();
  }

  /* ---- the Edit dialog: one field, one request, to the site id the dialog was opened for ---- */
  function openEdit(opener) {
    var site = S.site, settings = S.settings;
    if (!site || !settings) return;
    var siteId = site.id, seq = S.seq, key = "sponsor_id", order = [key], fields = {};
    var body = U.openDialog(opener, "Edit Santé username");
    var form = D.el("form", { "class": "acct-dlg-form", novalidate: "" });
    form.appendChild(D.el("p", { "class": "dash-copy" }, "For " + G.util.siteLabel(site) + ". New members who register through this site are registered under this Santé username."));
    var f = U.field({ key: key, label: "Santé Username", value: str(settings.sponsor_id),
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
        if (res.status === 404) { G.show(); return; } /* the site may have gone: Business Settings reads again (closing this dialog) and says what it finds */
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

  window.NOSante = { mount: mount, reset: reset };
})();
