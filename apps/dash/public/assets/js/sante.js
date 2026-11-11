/* The Santé "Sponsor ID" card on Business Settings (ClickUp z8uq9m92ez; mockup approved by Coach Ed 2026-11-11, moved
   into Business Settings by his ruling of the same day). The last card on /settings/business/, shown only when the
   selected site is a Santé site: one row, the site's Sponsor ID, and an Edit dialog. business.js (loaded before this
   file) draws the page, tells this file which site it drew (NOSante.mount) and shares its dialog and field through
   NOBusiness.ui. Reads GET /sites/{id}/sante/settings/; a save is ONE PATCH to that address with {sponsor_id}.
   "A Santé site" is decided from `template` in GET /sites/ (the answer business.js already has), never from a 404:
   the API answers 404 alike for a missing site, a site that is not a Santé site and a switched-off surface. A 404
   on the read shows no card; a 404 on a save reads the whole page again, and Business Settings says what it finds.
   The card adds no rule of its own: the value is trimmed, its case kept, and a refusal is the server's own message.
   Tenant safety as in business.js: the site comes only from business.js's GET /sites/, a dialog keeps the id it was
   opened for, an answer for an older read is dropped, nothing is stored in the browser.
   Plain ES5. API strings reach the page through D.el, textContent or input.value only. */
(function () {
  var D = window.NODash, G = window.NOBusiness, U = G.ui, $ = function (id) { return document.getElementById(id); };
  var PATH = "/sante/settings/";
  var SAVE_FAILED = "We couldn’t save. Check your connection and try again.";
  var S = { seq: 0, site: null, settings: null, parent: null, node: null }; /* memory only, never stored */

  function str(v) { return typeof v === "string" ? v.trim() : ""; }
  function isSante(site) { return !!site && site.template === "sante"; }
  function txt(text) { return D.el("span", {}, text); }
  function chip(kind, text) { return D.el("span", { "class": "chip chip-" + kind }, text); }
  function say(text) { var n = $("bs-live"); if (n) n.textContent = text; } /* Business Settings' own live region */

  /* business.js calls this each time it draws the page for a site: `parent` is its card grid. A site that is not a
     Santé site gets nothing. The same site drawn again (after a Business Settings save) reuses what was read. */
  function mount(site, parent) {
    S.parent = parent || null;
    S.node = null;
    if (!S.parent || !isSante(site)) { S.seq++; S.site = null; S.settings = null; return; }
    if (S.site && S.site.id === site.id && S.settings) { S.site = site; draw(); return; }
    S.site = site;
    S.settings = null;
    load();
  }
  /* business.js calls this when it starts a new read or the page is left: nothing from before is drawn afterwards. */
  function reset() { S.seq++; S.site = null; S.settings = null; S.parent = null; S.node = null; }

  function load() {
    var my = ++S.seq, site = S.site;
    if (!site) return;
    D.call("GET", "/sites/" + site.id + PATH, null, true).then(function (r) {
      if (my !== S.seq || r.status === 401) return; /* a newer read owns the card, or app.js is already signing out */
      if (r.status === 404) { place(null); return; } /* no Santé settings here: no card, the page is otherwise as it was */
      if (!r.ok || !r.data) { drawError(); return; }
      S.settings = r.data;
      draw();
    });
  }
  /* The card takes the last place in the grid; drawn again, it replaces itself. */
  function place(card) {
    var parent = S.parent, old = S.node;
    if (!parent) return;
    if (card) parent.insertBefore(card, old && old.parentNode === parent ? old : null);
    if (old && old.parentNode === parent) parent.removeChild(old);
    S.node = card;
  }
  function shell() {
    var card = D.el("section", { "class": "dash-card acct-card", id: "st-card", "aria-labelledby": "st-h-sponsor" });
    card.appendChild(D.el("h2", { id: "st-h-sponsor" }, "Sponsor ID"));
    return card;
  }
  function drawError() {
    var card = shell();
    var box = D.el("div", { "class": "err-box", role: "alert" });
    box.appendChild(D.el("p", {}, "We could not load the sponsor ID. Check your connection and try again. Nothing was changed."));
    var again = D.el("button", { type: "button", "class": "no-btn no-btn-primary", id: "st-retry" }, "Try again");
    again.addEventListener("click", function () { load(); });
    box.appendChild(again);
    card.appendChild(box);
    place(card);
  }
  function draw(focusId) {
    var settings = S.settings;
    if (!S.parent || !S.site || !settings) return;
    var card = shell();
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
    place(card);
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
