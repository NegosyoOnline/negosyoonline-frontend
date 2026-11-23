/* The Subscribers page (HQ-SUBSCRIBERS, ClickUp z8uq9mhbdn): a read-only list of the subscribers' sites with
   four standing tabs, a search and a "Load more", and one subscriber with their payments. One address, two views:
   which subscriber is open is held in memory only, so a reload returns to the list and no id is in an address.
   The page decides nothing about access and follows the backend's answer: a 404 on the list is the backend
   switch HQ_SUBSCRIBERS_ENABLED being off. Every value is set with textContent; a value this page has no
   words for is left out, a missing date is a dash. Each payment id links to Finance as plain text. */
(function () {
  var H = window.NOHq, F = window.NOFin, $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["boot", "v-list", "v-detail", "v-closed", "v-down"];
  var TABS = ["all", "trial_ending", "unpaid", "suspended_ended"];
  var DASH = "—";
  var PLAN = { monthly: "Monthly", annual: "Annual", launch_promo: "Launch promo" };
  var STATE = { trial_active: "Trial", active: "Active", payment_requires_attention: "Payment needs attention", suspended: "Suspended",
    cancelled: "Cancelled", cancelled_no_payment_method: "Cancelled, no payment method" };
  var CHIP = { trial_active: "chip-info", active: "chip-ok", payment_requires_attention: "chip-warn", suspended: "chip-warn",
    cancelled: "chip-neutral", cancelled_no_payment_method: "chip-neutral" };
  var PAY = { submitted: "Submitted", confirmed: "Confirmed", rejected: "Rejected", replaced: "Replaced" };
  var LOST = "More subscribers could not be loaded. Try Load more again.";

  var known = false, tab = "all", query = "", cursor = null, listRun = 0, detailRun = 0, openId = null;
  var CODE6 = /^\d{6}$/, lineMode = "", lineSite = "", busy = false, lineOn = null;
  var dlg = F.dialogs(function () { return busy; });
  var LINE_LOST = "That did not go through. Check the page before trying again.";
  var CODE_REFUSED = "That code was not accepted. Use the current code from your authenticator app. If you just signed in, wait for the next code (about 30 seconds).";

  function show(view) { VIEWS.forEach(function (id) { $(id).hidden = id !== view; }); }
  function text(v) { return typeof v === "string" ? v : ""; }

  /* ---- what the backend sends, as the page uses it ---- */

  function fromApi(r) {
    r = r && typeof r === "object" ? r : {};
    return { id: text(r.site_id), name: text(r.business_name), address: text(r.site_address), template: text(r.template),
      plan: F.words(PLAN, r.plan), state: F.words(STATE, r.state), chip: F.words(CHIP, r.state) || "chip-neutral", trialing: r.state === "trial_active",
      trialEnds: F.dayOf(r.trial_ends_at), nextDue: F.dayOf(r.next_due_at), lastPayment: F.dayOf(r.last_payment_at),
      email: text(r.owner_email), joined: F.dayOf(r.created_at) };
  }
  function fromPayment(p) {
    p = p && typeof p === "object" ? p : {};
    return { id: text(p.id), status: F.words(PAY, p.status), plan: F.words(PLAN, p.plan), amount: F.money(p.amount_centavos),
      received: F.money(p.amount_received_centavos), transferred: F.day(p.transferred_on), submitted: F.stamp(p.submitted_at),
      decided: F.stamp(p.decided_at) };
  }
  /* Text with a place to break after "@" and before each ".", so a long address wraps at natural points only. */
  function breakable(node, value) {
    String(value).split(/(?=\.)|(?<=@)/).forEach(function (part, i) {
      if (i) node.appendChild(document.createElement("wbr"));
      node.appendChild(document.createTextNode(part));
    });
    return node;
  }
  function orDash(v) { return v || DASH; }

  /* ---- the list ---- */

  function cell(tr, label) {
    var td = F.el("td", "");
    td.setAttribute("data-label", label);
    tr.appendChild(td);
    return td;
  }

  function row(r) {
    var tr = F.el("tr", ""), td, box, b = F.el("button", "no-btn no-btn-ghost", "Open");
    td = cell(tr, "Business");
    box = F.el("div", ""); box.appendChild(F.el("strong", "", r.name));
    if (r.address) box.appendChild(breakable(F.el("span", "small"), r.address));
    td.appendChild(box);
    cell(tr, "Plan").textContent = orDash(r.plan);
    td = cell(tr, "State");
    if (r.state) td.appendChild(F.el("span", "chip " + r.chip, r.state)); else td.textContent = DASH;
    cell(tr, "Next due").textContent = orDash(r.nextDue || (r.trialing ? r.trialEnds : ""));
    td = cell(tr, "Owner email");
    td.setAttribute("class", "sub-wrap");
    if (r.email) td.appendChild(breakable(F.el("span", ""), r.email)); else td.textContent = DASH;
    cell(tr, "Joined").textContent = orDash(r.joined);
    b.setAttribute("type", "button");
    b.setAttribute("aria-label", "Open " + r.name);
    b.addEventListener("click", function () { openOne(r.id); });
    cell(tr, "").appendChild(b);
    return tr;
  }

  function paintTabs() {
    TABS.forEach(function (t) { $("tab-" + t).setAttribute("aria-pressed", String(t === tab)); });
  }

  function emptyWords() {
    if (query) return "No subscribers match that search.";
    return { all: "No subscribers yet.", trial_ending: "No trials end in the next 7 days.", unpaid: "No subscribers are unpaid.",
      suspended_ended: "No subscribers are suspended or ended." }[tab];
  }

  function loadList(more) {
    var run = ++listRun, body = { filter: tab };
    if (query) body.q = query;
    if (more && cursor) body.cursor = cursor;
    if (!more) {
      $("s-body").textContent = "";
      $("s-card").hidden = true;
      $("s-empty").hidden = true;
      $("s-more-row").hidden = true;
      $("s-loading").hidden = false;
      cursor = null;
    }
    F.say("s-err", "");
    $("s-more").disabled = true;
    H.call("POST", "subscribers/list/", body).then(function (res) {
      if (run !== listRun) return;
      $("s-loading").hidden = true;
      $("s-more").disabled = false;
      if (F.left(res)) return;
      if (res.status === 404) { show("v-closed"); return; }
      /* A failed Load more keeps the rows already loaded and says so; it can be tried again. */
      if (more && !res.ok) { F.say("s-err", LOST); $("s-more-row").hidden = false; return; }
      if (res.status === 400 && !more) { F.say("s-err", "Check the search and try again."); show("v-list"); return; }
      if (!res.ok) { show("v-down"); return; }
      var d = res.data || {}, rows = Array.isArray(d.rows) ? d.rows : [];
      rows.forEach(function (r) { var s = fromApi(r); if (s.id) $("s-body").appendChild(row(s)); });
      cursor = typeof d.next === "string" && d.next ? d.next : null;
      $("s-card").hidden = $("s-body").children.length === 0;
      $("s-empty").textContent = emptyWords();
      $("s-empty").hidden = $("s-body").children.length > 0;
      $("s-more-row").hidden = !cursor;
      show("v-list");
    });
  }

  /* ---- one subscriber ---- */

  function fact(dl, label, value) {
    var box = F.el("div", "");
    box.appendChild(F.el("dt", "", label));
    box.appendChild(F.el("dd", "", orDash(value)));
    dl.appendChild(box);
  }

  function payment(p) {
    var li = F.el("li", ""), line = F.el("div", "ev"), a = F.el("a", "", p.id), sub;
    a.setAttribute("href", "/finance/");
    line.appendChild(a);
    if (p.status) line.appendChild(F.el("span", "chip chip-neutral", p.status));
    li.appendChild(line);
    sub = [p.plan, p.amount, p.received ? "received " + p.received : "", p.transferred ? "transferred " + p.transferred : ""].filter(Boolean).join(" · ");
    if (sub) li.appendChild(F.el("div", "item-sub", sub));
    if (p.submitted) li.appendChild(F.el("div", "small", "Submitted " + p.submitted + (p.decided ? " · Decided " + p.decided : "")));
    return li;
  }

  function paint(d) {
    var r = fromApi(d), dl = $("d-facts"), list = $("d-pays"), pays = (Array.isArray(d.payments) ? d.payments : []).map(fromPayment).filter(function (p) { return p.id; });
    $("d-name").textContent = r.name;
    $("d-state").textContent = r.state;
    $("d-state").setAttribute("class", "chip " + r.chip);
    $("d-state").hidden = !r.state;
    $("d-site-id").textContent = r.id;
    dl.textContent = "";
    fact(dl, "Site address", r.address);
    fact(dl, "Template", r.template);
    fact(dl, "Plan", r.plan);
    fact(dl, "Trial ends", r.trialing ? r.trialEnds : "");
    fact(dl, "Next due", r.nextDue);
    fact(dl, "Last payment", r.lastPayment);
    fact(dl, "Owner email", r.email);
    fact(dl, "Joined", r.joined);
    list.textContent = "";
    pays.forEach(function (p) { list.appendChild(payment(p)); });
    $("d-pay-empty").hidden = pays.length > 0;
    paintLine(d.sms_line);
    $("d-loading").hidden = true;
    $("d-err").hidden = true;
    $("d-body").hidden = false;
  }

  /* ---- the SMS line (SMS-INCLUDED): Disable and Re-enable ---- */

  /* sms_line is null (or missing) while SMS_SITE_LINES_ENABLED is off on the server: no card, no buttons. */
  function paintLine(l) {
    var on = l && typeof l === "object" ? l : null, off = on && on.disabled === true, when = on ? F.stamp(on.disabled_at) : "", why = on ? text(on.reason) : "", chip = $("d-line-chip");
    lineOn = on;
    $("d-line").hidden = !on;
    $("d-line-disable").hidden = !on || off;
    $("d-line-reenable").hidden = !on || !off;
    F.say("d-line-err", "");
    if (!on) return;
    chip.textContent = off ? "Disabled" : on.has_line === true ? "On" : "Not serving";
    chip.setAttribute("class", "chip " + (off ? "chip-warn" : on.has_line === true ? "chip-ok" : "chip-neutral"));
    $("d-line-copy").textContent = off ? "HQ disabled this line. The phone gets no texts, and the owner cannot pair or rotate."
      : on.has_line === true ? (on.has_phone === true ? "The owner's phone is paired." : "No phone is paired yet.")
      : "Billing is not serving this subscriber, so there is no line.";
    $("d-line-when").textContent = off ? (when ? "Disabled " + when + ". " : "") + (why ? "Reason: " + why : "") : "";
    $("d-line-when").hidden = !off || !$("d-line-when").textContent;
  }

  function lineLock(on) {
    busy = on;
    ["line-go", "line-x", "line-cancel", "line-reason", "line-code"].forEach(function (id) { $(id).disabled = on; });
  }
  function lineErr(msg, id) {
    F.say("line-err", msg);
    ["line-reason", "line-code"].forEach(function (n) { $(n).removeAttribute("aria-invalid"); });
    if (id) $(id).setAttribute("aria-invalid", "true");
  }
  function lineClose(refocus) {
    $("line-code").value = "";
    $("line-reason").value = "";
    lineMode = "";
    dlg.close(refocus);
  }
  function lineOpen(mode, opener) {
    var off = mode === "disable";
    lineMode = mode;
    lineSite = openId || "";
    $("m-line-h").textContent = off ? "Disable SMS line?" : "Re-enable SMS line?";
    $("m-line-sub").textContent = off ? "This phone gets no texts, and the owner cannot pair or rotate. Give a reason and enter a current code."
      : "The owner can use the line again. Give a reason and enter a current code.";
    $("line-go").textContent = off ? "Disable line" : "Re-enable line";
    $("line-reason").value = "";
    $("line-code").value = "";
    $("line-count").textContent = "0 of 300";
    lineErr("", "");
    dlg.open("m-line", opener, $("line-reason"));
  }
  $("d-line-disable").addEventListener("click", function () { if (!busy) lineOpen("disable", $("d-line-disable")); });
  $("d-line-reenable").addEventListener("click", function () { if (!busy) lineOpen("reenable", $("d-line-reenable")); });
  ["line-x", "line-cancel"].forEach(function (id) { $(id).addEventListener("click", function () { if (!busy) lineClose(true); }); });
  $("line-reason").addEventListener("input", function () { $("line-count").textContent = String($("line-reason").value.length) + " of 300"; });
  $("line-go").addEventListener("click", function () {
    var reason = String($("line-reason").value || "").trim(), code = String($("line-code").value || "").trim(), mode = lineMode, site = lineSite;
    if (busy || !mode) return;
    lineErr("", "");
    if (!reason) { lineErr("Give a reason.", "line-reason"); return; }
    if (!CODE6.test(code)) { lineErr("Enter the 6-digit code from your authenticator app.", "line-code"); return; }
    lineLock(true);
    H.call("POST", "subscribers/sms-line/" + (mode === "disable" ? "disable" : "reenable") + "/", { site_id: site, reason: reason, code: code }).then(function (res) {
      lineLock(false);
      if (F.left(res)) return;
      if (res.ok) {
        lineClose(true);
        if (openId === site) { paintLine(res.data && res.data.sms_line); }
        return;
      }
      /* 404: the line switch is off on this server. No controls, nothing to retry. */
      if (res.status === 404) { lineClose(false); paintLine(null); return; }
      if (res.status === 403 && res.code === "reauth_failed") { lineErr(CODE_REFUSED, "line-code"); return; }
      if (res.status === 409 && (res.code === "already_disabled" || res.code === "not_disabled")) {
        lineClose(false);
        if (openId === site) readOne(site);
        return;
      }
      if (res.status === 400 && res.fields && res.fields.reason) { lineErr("Give a reason of up to 300 characters.", "line-reason"); return; }
      lineErr(LINE_LOST, "");
    });
  });

  function readOne(id) {
    var run = ++detailRun;
    $("d-body").hidden = true;
    $("d-err").hidden = true;
    $("d-loading").hidden = false;
    H.call("POST", "subscribers/detail/", { site_id: id }).then(function (res) {
      if (run !== detailRun || F.left(res)) return;
      $("d-loading").hidden = true;
      if (res.status === 404) { toList(); return; }
      if (!res.ok) { $("d-err").hidden = false; return; }
      paint(res.data || {});
    });
  }

  function openOne(id) {
    openId = id;
    show("v-detail");
    readOne(id);
  }

  function toList() {
    detailRun++;
    openId = null;
    show("v-list");
  }

  /* ---- events ---- */

  TABS.forEach(function (t) {
    $("tab-" + t).addEventListener("click", function () {
      if (t === tab) return;
      tab = t;
      paintTabs();
      loadList(false);
    });
  });
  $("s-form").addEventListener("submit", function (e) {
    e.preventDefault();
    query = String($("s-q").value || "").trim().slice(0, 100);
    loadList(false);
  });
  $("s-more").addEventListener("click", function () { if (cursor) loadList(true); });
  $("back").addEventListener("click", function (e) { e.preventDefault(); toList(); });
  $("d-retry").addEventListener("click", function () { if (openId) readOne(openId); });

  /* Who is signed in comes from me/, the staff route that answers it. */
  function start() {
    show("boot");
    if (known) { loadList(false); return; }
    H.call("GET", "me/").then(function (res) {
      if (F.left(res)) return;
      if (!res.ok) { show("v-down"); return; }
      known = true;
      window.NOHqShell.signedIn(res.data.email);
      loadList(false);
    });
  }
  $("retry").addEventListener("click", start);
  paintTabs();
  start();
})();
