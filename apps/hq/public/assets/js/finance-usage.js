/* The Usage review page: an operator decides the storage usage records the backend held for review (Billing
   HQ-F1, ClickUp z8uq9mektc, plan section 4.1). One address, two views: the list, and one record. Which record
   is open is held in memory only, so a reload returns to the list and no id is ever in an address.
   Admit (only a record that arrived late) and Dismiss (every record) each open a dialog with a required
   reason. A decision changes the record's status and nothing else: no amount is shown or typed here, the
   price of a line is the backend's. The page decides nothing about access and follows the backend's answer.
   A reason, an event or an actor this page has no words for is left out: a raw value is never shown. */
(function () {
  var H = window.NOHq, F = window.NOFin, $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["boot", "v-list", "v-one", "v-closed", "v-down"];
  var REASON = { late_over_72h: "Arrived more than 72 hours after the period ended", no_cycle: "No billing cycle",
    after_service_end: "Measured after service ended" };
  var EVENT = { recorded_needs_review: "Held for review", operator_dismissed: "Dismissed, not billable",
    operator_counted: "Admitted, billed", operator_held: "Held", operator_written_off: "Written off" };
  var ACTOR = { intake: "the system", sweep: "the system", operator: "an operator" };
  var ADMITTABLE = "late_over_72h";
  var MAX = 300;
  var GONE = "This record is no longer waiting for review. It was already decided.";
  var LOST = "That did not go through. Check the record before trying again.";
  var NOT_ADMISSIBLE = "Only a record that arrived more than 72 hours late can be admitted. Dismiss it instead.";

  var known = false, cursor = null, listRun = 0, oneRun = 0, current = null, busy = false;
  var dlg = F.dialogs(function () { return busy; });

  function show(view) { VIEWS.forEach(function (id) { $(id).hidden = id !== view; }); }

  /* ---- the list ---- */

  function row(e) {
    var li = F.el("li", "batch"), main = F.el("div", "batch-main"), title = F.el("div", "batch-title"), end = F.el("div", "batch-end");
    var b = F.el("button", "no-btn no-btn-ghost", "Review"), why = F.words(REASON, e.reason), site = e.site || {};
    var measured = F.gb(e.measured_bytes), ended = F.dayOf(e.period_end_at), got = F.stamp(e.received_at);
    var sub = [measured ? measured + " measured" : "", ended ? "Period ended " + ended : ""].filter(Boolean).join(" · ");
    title.appendChild(F.el("span", "", site.name || ""));
    if (why) title.appendChild(F.el("span", "chip chip-warn", why));
    main.appendChild(title);
    if (sub) main.appendChild(F.el("span", "item-sub", sub));
    if (got) main.appendChild(F.el("span", "small", "Received " + got));
    b.setAttribute("type", "button");
    b.addEventListener("click", function () { openRecord(e.entry); });
    end.appendChild(b);
    li.appendChild(main);
    li.appendChild(end);
    return li;
  }

  function loadList(more) {
    var run = ++listRun, body = {};
    if (more && cursor) body.cursor = cursor;
    if (!more) {
      $("u-rows").textContent = "";
      $("u-empty").hidden = true;
      $("more-row").hidden = true;
      $("u-loading").hidden = false;
    }
    $("more").disabled = true;
    H.call("POST", "finance/usage/review/list/", body).then(function (res) {
      if (run !== listRun) return;
      $("u-loading").hidden = true;
      $("more").disabled = false;
      if (F.left(res)) return;
      if (res.status === 404) { show("v-closed"); return; }
      if (!res.ok) { show("v-down"); return; }
      var d = res.data, items = Array.isArray(d.items) ? d.items : [];
      items.forEach(function (e) { if (e && typeof e.entry === "string") $("u-rows").appendChild(row(e)); });
      cursor = typeof d.next_cursor === "string" && d.next_cursor ? d.next_cursor : null;
      if (typeof d.needs_review_count === "number") $("u-count").textContent = d.needs_review_count + " need review";
      $("more-row").hidden = !cursor;
      $("u-empty").hidden = $("u-rows").children.length > 0;
      show("v-list");
    });
  }

  function toList(message) {
    oneRun++;
    current = null;
    dlg.close(false);
    F.say("u-msg", message);
    show("v-list");
    loadList(false);
  }

  /* ---- one record ---- */

  function paint(d) {
    var why = F.words(REASON, d.reason), site = d.site || {}, list = $("uo-hist");
    current = d;
    $("uo-site").textContent = site.name || "";
    $("uo-reason").textContent = why;
    $("uo-reason").hidden = !why;
    $("uo-gb").textContent = F.gb(d.measured_bytes);
    $("uo-cycle").textContent = typeof d.cycle === "number" ? "Cycle " + d.cycle : "None";
    $("uo-pend").textContent = F.dayOf(d.period_end_at);
    $("uo-recv").textContent = F.stamp(d.received_at);
    list.textContent = "";
    (Array.isArray(d.history) ? d.history : []).forEach(function (e) {
      var what = F.words(EVENT, e && e.code), who = F.words(ACTOR, e && e.actor), li, line;
      if (!what || !who) return;
      li = F.el("li", "");
      line = F.el("div", "ev");
      line.appendChild(F.el("span", "", what + " by " + who));
      line.appendChild(F.el("span", "small", F.stamp(e.at)));
      li.appendChild(line);
      list.appendChild(li);
    });
    $("uo-admit").hidden = d.reason !== ADMITTABLE;
    $("uo-dismiss").hidden = false;          /* every record can be dismissed */
    $("uo-note").hidden = d.reason === ADMITTABLE;
    $("uo-loading").hidden = true;
    $("uo-body").hidden = false;
  }

  /* first: it was just opened, so a failure to read shows the page's down view. */
  function readRecord(id, first) {
    var run = oneRun;
    H.call("POST", "finance/usage/review/detail/", { entry: id }).then(function (res) {
      if (run !== oneRun || F.left(res)) return;
      if (res.status === 404) { toList(""); return; }
      if (res.status === 409 && res.code === "not_under_review") { toList(GONE); return; }
      if (!res.ok) { if (first) show("v-down"); return; }
      paint(res.data);
    });
  }

  function openRecord(id) {
    oneRun++;
    current = null;
    $("uo-body").hidden = true;
    $("uo-loading").hidden = false;
    F.say("u-msg", "");
    show("v-one");
    readRecord(id, true);
  }

  /* ---- the two dialogs ---- */

  function lock(on) {
    busy = on;
    ["admit-go", "admit-x", "admit-cancel", "dismiss-go", "dismiss-x", "dismiss-cancel"].forEach(function (id) { $(id).disabled = on; });
  }

  /* kind: "admit" or "dismiss". The reason is required, at most 300 characters, and goes with the entry. */
  function decide(kind, done) {
    var field = $(kind + "-f"), reason = String(field.value || "").trim(), id, run = oneRun;
    if (busy || !current) return;
    var wrong = !reason ? "Write a reason." : reason.length > MAX ? "The reason is at most " + MAX + " characters." : "";
    F.say(kind + "-e", wrong);
    if (wrong) { field.setAttribute("aria-invalid", "true"); return; }
    field.removeAttribute("aria-invalid");
    id = current.entry;
    lock(true);
    H.call("POST", "finance/usage/review/" + kind + "/", { entry: id, reason: reason }).then(function (res) {
      lock(false);
      if (run !== oneRun) return;
      if (F.left(res)) return;
      if (res.ok) { toList(done); return; }
      if (res.status === 404) { toList(""); return; }
      if (res.status === 409 && res.code === "not_under_review") { toList(GONE); return; }
      if (res.status === 409 && res.code === "not_admissible") { F.say(kind + "-e", NOT_ADMISSIBLE); return; }
      if (res.status === 400 && res.code === "invalid_request") { F.say(kind + "-e", "Check the reason. It is required and at most " + MAX + " characters."); return; }
      F.say(kind + "-e", LOST);
      readRecord(id, false);
    });
  }

  ["admit", "dismiss"].forEach(function (kind) {
    var open = kind === "admit" ? "uo-admit" : "uo-dismiss";
    $(open).addEventListener("click", function () {
      if (busy || !current) return;
      $(kind + "-f").value = "";
      $(kind + "-f").removeAttribute("aria-invalid");
      $(kind + "-count").textContent = "0 of " + MAX;
      F.say(kind + "-e", "");
      dlg.open("m-" + kind, $(open), $(kind + "-f"));
    });
    $(kind + "-f").addEventListener("input", function () { $(kind + "-count").textContent = String($(kind + "-f").value.length) + " of " + MAX; });
    ["-x", "-cancel"].forEach(function (s) { $(kind + s).addEventListener("click", function () { if (!busy) dlg.close(true); }); });
    $(kind + "-form").addEventListener("submit", function (e) {
      e.preventDefault();
      decide(kind, kind === "admit" ? "Admitted" : "Dismissed, not billable");
    });
  });

  $("u-back").addEventListener("click", function (e) { e.preventDefault(); toList(""); });
  $("more").addEventListener("click", function () { if (cursor) loadList(true); });

  /* Who is signed in comes from me/, the staff route that answers it; the Finance routes do not. */
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
  start();
})();
