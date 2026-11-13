/* The Statements page: the internal billing statements and their adjustments (Billing HQ-F3, ClickUp z8uq9mewgk, plan
   docs/superpowers/plans/2026-11-14-hq-f3-statements-page-z8uq9mewgk.md). One address, two views: the list, and one
   statement. Which statement is open is held in memory only, so a reload returns to the list and no id is ever in an
   address. A statement shows its lines, its adjustments and its delivery attempts; Resend sends it again; Adjust makes
   an adjustment that reduces it; View PDF reads the stored file through NOHq.file (held in this tab's memory, shown
   from an object address, released when the statement is closed).
   The staff routes return no bill-to name, email, TIN or address, and none is shown here. The page decides nothing
   about access and follows the backend's answer. A kind, reason, status or code this page has no words for is left
   out: a raw value is never shown. */
(function () {
  var H = window.NOHq, F = window.NOFin, $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["boot", "v-list", "v-one", "v-closed", "v-down"];
  var FILTERS = { all: {}, statement: { document_type: "statement" }, adjustment: { document_type: "adjustment" },
    failed: { delivery_failed: true } };
  var KIND = { monthly: "Monthly", annual: "Annual", launch_promo: "Launch promo", usage_only: "Storage usage",
    final_usage: "Final usage", adjustment: "Adjustment" };
  var DELIVERY = { sent: ["Sent", "chip-ok"], pending: ["Pending", "chip-warn"], failed: ["Failed", "chip-err"] };
  var REASON = { billing_error: "Billing error", duplicate_payment: "Duplicate payment",
    service_not_delivered: "Service not delivered", goodwill: "Goodwill reduction", other: "Other" };
  var MAX_LINES = 10, MAX_DESC = 300;
  var LOST = "That did not go through. Check the statement before trying again.";
  var TEST_NEVER = "A test statement is never emailed.";

  var known = false, loaded = false, filter = "all", cursor = null, shown = 0, listRun = 0, oneRun = 0, current = null, busy = false;
  var pdfUrl = null, pdfRun = 0, lines = [], reasonChoices = [["", "Choose a reason"]];
  var dlg = F.dialogs(function () { return busy; });
  var reasonBox = F.combo($("a-reason"), "Reason", reasonChoices, "a-e");

  function show(view) { VIEWS.forEach(function (id) { $(id).hidden = id !== view; }); }
  /* Whole centavos as PHP text; a reduction is written with a minus sign. */
  function signed(c) {
    if (typeof c !== "number" || c % 1 !== 0) return "";
    return c < 0 ? "−" + F.money(-c) : F.money(c);
  }
  function text(v) { return typeof v === "string" ? v : ""; }
  function period(d) { return F.day(d.period_start) && F.day(d.period_end) ? F.day(d.period_start) + " to " + F.day(d.period_end) : ""; }

  /* ---- the list ---- */

  function cell(tr, label, cls) {
    var td = F.el("td", cls || "");
    td.setAttribute("data-label", label);
    tr.appendChild(td);
    return td;
  }

  /* The delivery chip of a statement as [words, class], or null for an adjustment (it is not emailed). */
  function deliveryOf(s) {
    var d = s.delivery;
    if (s.document_type !== "statement") return null;
    return d && F.words(DELIVERY, d.status) ? DELIVERY[d.status] : ["Not sent yet", "chip-neutral"];
  }

  function row(s) {
    var tr = F.el("tr", ""), td, site = s.site || {}, dv = deliveryOf(s), b = F.el("button", "no-btn no-btn-ghost", "View");
    td = cell(tr, "Number"); td.appendChild(F.el("strong", "", text(s.number)));
    if (s.is_test) td.appendChild(F.el("span", "chip chip-info", "Test"));
    cell(tr, "Issued").textContent = F.dayOf(s.issued_at);
    cell(tr, "Site").textContent = text(site.name);
    cell(tr, "Kind").textContent = F.words(KIND, s.kind);
    cell(tr, "Period").textContent = period(s);
    cell(tr, "Total", "r num").textContent = signed(s.total_centavos);
    td = cell(tr, "Delivery");
    if (dv) td.appendChild(F.el("span", "chip " + dv[1], dv[0]));
    b.setAttribute("type", "button");
    b.setAttribute("aria-label", "View statement " + text(s.number));
    b.addEventListener("click", function () { openOne(s.statement); });
    cell(tr, "").appendChild(b);
    return tr;
  }

  function tabs() {
    Object.keys(FILTERS).forEach(function (k) { $("tab-" + k).setAttribute("aria-pressed", String(k === filter)); });
  }

  function loadList(more) {
    var run = ++listRun, body = {}, k;
    for (k in FILTERS[filter]) body[k] = FILTERS[filter][k];
    if (more && cursor) body.cursor = cursor;
    if (!more) {
      $("l-body").textContent = "";
      shown = 0;
      $("l-empty").hidden = true;
      $("l-card").hidden = true;
      $("l-count").hidden = true;
      $("more-row").hidden = true;
      $("l-loading").hidden = false;
    }
    F.say("l-err", "");
    $("more").disabled = true;
    H.call("POST", "finance/statements/list/", body).then(function (res) {
      if (run !== listRun) return;
      $("l-loading").hidden = true;
      $("more").disabled = false;
      if (F.left(res)) return;
      /* A failed Load more keeps the rows already loaded and says so; the first read shows the down view. */
      if (more && !res.ok) { F.say("l-err", "More statements could not be loaded. Try Load more again."); return; }
      if (res.status === 404) { show("v-closed"); return; }
      if (!res.ok) {
        if (!loaded) show("v-down"); else F.say("l-err", "Statements could not be loaded. Try again.");
        return;
      }
      loaded = true;
      var items = Array.isArray(res.data.items) ? res.data.items : [];
      items.forEach(function (s) { if (s && typeof s === "object" && typeof s.statement === "string") { $("l-body").appendChild(row(s)); shown++; } });
      cursor = typeof res.data.next_cursor === "string" && res.data.next_cursor ? res.data.next_cursor : null;
      $("l-card").hidden = shown === 0;
      $("l-empty").textContent = filter === "failed" ? "No failed deliveries." : "No statements yet.";
      $("l-empty").hidden = shown > 0;
      $("l-count").textContent = "Showing " + shown + (shown === 1 ? " statement." : " statements.");
      $("l-count").hidden = shown === 0;
      $("more-row").hidden = !cursor;
      show("v-list");
    });
  }

  function toList(message) {
    oneRun++;
    current = null;
    closePdf();
    show("v-list");
    loadList(false);
    if (message) F.say("l-err", message);
  }

  /* ---- one statement ---- */

  function closePdf() {
    pdfRun++;
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = null;
    $("o-pdf-open").removeAttribute("href");
    $("o-pdf-open").hidden = true;
    $("o-pdf-load").hidden = true;
    F.say("o-pdf-err", "");
  }

  function fact(dl, label, value) {
    var d = F.el("div", "");
    if (!value) return;
    d.appendChild(F.el("dt", "", label));
    d.appendChild(F.el("dd", "", value));
    dl.appendChild(d);
  }

  function listItem(main, sub) {
    var li = F.el("li", "batch"), box = F.el("div", "batch-main");
    box.appendChild(main);
    if (sub) box.appendChild(F.el("span", "item-sub", sub));
    li.appendChild(box);
    return li;
  }

  function render(d) {
    var isStatement = d.document_type === "statement", dl = $("o-facts"), site = d.site || {}, dv = deliveryOf(d), left;
    current = d;
    $("o-title").textContent = text(d.number);
    $("o-test").hidden = !d.is_test;
    $("o-kind").textContent = F.words(KIND, d.kind);
    $("o-kind").hidden = !F.words(KIND, d.kind);
    $("o-delivery").hidden = !dv;
    if (dv) { $("o-delivery").textContent = dv[0]; $("o-delivery").setAttribute("class", "chip " + dv[1]); }
    dl.textContent = "";
    fact(dl, "Site", text(site.name));
    fact(dl, "Period", period(d));
    fact(dl, "Issued", F.dayOf(d.issued_at));
    fact(dl, "Total", signed(d.total_centavos));
    fact(dl, "Payment reference", text(d.payment_reference));
    if (!isStatement) {
      fact(dl, "Adjusts", text(d.original_number));
      fact(dl, "Reason", F.words(REASON, d.adjustment_reason));
    }
    $("o-lines").textContent = "";
    (Array.isArray(d.lines) ? d.lines : []).forEach(function (l) {
      if (!l || typeof l !== "object") return;
      var tr = F.el("tr", "");
      cell(tr, "Description").textContent = text(l.description);
      cell(tr, "Quantity", "r num").textContent = typeof l.quantity === "number" ? String(l.quantity) : "";
      cell(tr, "Unit price", "r num").textContent = signed(l.unit_centavos);
      cell(tr, "Amount", "r num").textContent = signed(l.amount_centavos);
      $("o-lines").appendChild(tr);
    });
    $("o-lines-empty").hidden = $("o-lines").children.length > 0;
    $("o-adj-card").hidden = !isStatement;
    $("o-del-card").hidden = !isStatement;
    $("o-adj").textContent = "";
    $("o-del").textContent = "";
    if (isStatement) {
      var adj = Array.isArray(d.adjustments) ? d.adjustments : [], atts = Array.isArray(d.deliveries) ? d.deliveries.slice() : [];
      adj.forEach(function (a) {
        if (!a || typeof a.number !== "string") return;
        $("o-adj").appendChild(listItem(F.el("strong", "", a.number + ", " + signed(a.total_centavos)), F.words(REASON, a.reason)));
      });
      $("o-adj-empty").hidden = $("o-adj").children.length > 0;
      left = typeof d.remaining_centavos === "number" ? F.money(d.remaining_centavos) : "";
      $("o-left").textContent = left ? "Left to adjust: " + left : "";
      $("o-left").hidden = !left;
      atts.sort(function (a, b) { return ((b && b.attempt) || 0) - ((a && a.attempt) || 0); });
      atts.forEach(function (a) {
        if (!a || typeof a.attempt !== "number") return;
        var t = F.el("div", "batch-title"), w = F.words(DELIVERY, a.status) ? DELIVERY[a.status] : null;
        t.appendChild(F.el("span", "", "Attempt " + a.attempt));
        if (w) t.appendChild(F.el("span", "chip " + w[1], w[0]));
        $("o-del").appendChild(listItem(t, F.stamp(a.at)));
      });
      $("o-del-empty").hidden = $("o-del").children.length > 0;
    }
    $("o-resend").hidden = !isStatement || !!d.is_test;
    $("o-adjust").hidden = !isStatement || !(typeof d.remaining_centavos === "number" && d.remaining_centavos > 0);
  }

  /* message: a line shown above the cards after an action, "" for none. fresh: a different statement is being opened. */
  function readOne(id, message, fresh) {
    var run = ++oneRun;
    if (fresh) { current = null; closePdf(); }
    show("v-one");
    $("o-body").hidden = true;
    $("o-loading").hidden = false;
    F.say("o-msg", message || "");
    H.call("POST", "finance/statements/detail/", { statement: id }).then(function (res) {
      if (run !== oneRun) return;
      $("o-loading").hidden = true;
      if (F.left(res)) return;
      if (res.status === 404) { toList("That statement was not found."); return; }
      if (!res.ok || !res.data || typeof res.data.statement !== "string") {
        F.say("o-msg", "The statement could not be loaded. Go back and open it again.");
        return;
      }
      render(res.data);
      $("o-body").hidden = false;
    });
  }
  function openOne(id) { readOne(id, "", true); }

  /* ---- View PDF ---- */

  $("o-pdf").addEventListener("click", function () {
    var run, id;
    if (!current || busy) return;
    closePdf();
    run = pdfRun;
    id = current.statement;
    $("o-pdf-load").hidden = false;
    H.file("finance/statements/pdf/", { statement: id }).then(function (res) {
      if (run !== pdfRun) return;
      $("o-pdf-load").hidden = true;
      if (F.left(res)) return;
      if (res.status === 503 && res.code === "store_unavailable") { F.say("o-pdf-err", "The statement file is not available now."); return; }
      if (!res.ok || !res.blob || res.blob.type !== "application/pdf") { F.say("o-pdf-err", "The PDF could not be loaded."); return; }
      pdfUrl = URL.createObjectURL(res.blob);
      $("o-pdf-open").setAttribute("href", pdfUrl);
      $("o-pdf-open").hidden = false;
    });
  });

  /* ---- Resend ---- */

  function lock(on) {
    busy = on;
    ["resend-go", "resend-x", "resend-cancel", "adjust-go", "adjust-x", "adjust-cancel", "a-add"].forEach(function (id) { $(id).disabled = on; });
  }

  $("o-resend").addEventListener("click", function () {
    if (busy || !current) return;
    F.say("resend-e", "");
    dlg.open("m-resend", $("o-resend"), $("resend-go"));
  });
  ["resend-x", "resend-cancel"].forEach(function (id) { $(id).addEventListener("click", function () { if (!busy) dlg.close(true); }); });
  $("resend-form").addEventListener("submit", function (e) {
    var id, run = oneRun;
    e.preventDefault();
    if (busy || !current) return;
    id = current.statement;
    lock(true);
    H.call("POST", "finance/statements/resend/", { statement: id }).then(function (res) {
      lock(false);
      if (run !== oneRun) return;
      if (F.left(res)) return;
      if (res.ok) {
        var s = res.data && res.data.status;
        dlg.close(true);
        readOne(id, s === "sent" ? "The statement was sent." : s === "failed" ? "The email could not be sent. The attempt is recorded."
          : s === "pending" ? "The email is waiting to be sent." : "The attempt is recorded.", false);
        return;
      }
      if (res.status === 409 && res.code === "test_document") { F.say("resend-e", TEST_NEVER); return; }
      if (res.status === 404) { dlg.close(false); toList("That statement was not found."); return; }
      if (res.status === 400) { F.say("resend-e", "Only a statement can be sent."); return; }
      F.say("resend-e", LOST);
      readOne(id, "", false);
    });
  });

  /* ---- Adjust ---- */

  /* The amounts typed, as {sum, ok}: ok is false while any line has no valid amount. */
  function totalOf() {
    var sum = 0, ok = true;
    lines.forEach(function (l) {
      var c = F.centavos(l.amt.value);
      if (c === null) ok = false; else sum += c;
    });
    return { sum: sum, ok: ok };
  }
  function summary() {
    var t = totalOf(), left = current && typeof current.remaining_centavos === "number" ? current.remaining_centavos : 0;
    $("a-sum").textContent = "Total reduction: " + (t.ok ? F.money(t.sum) : "enter every amount") + ". Left to adjust: " + F.money(left) + ".";
  }
  function drawLines() {
    $("a-lines").textContent = "";
    lines.forEach(function (l, i) {
      var box = F.el("div", "field"), n = String(i + 1), rm = F.el("button", "no-btn no-btn-ghost", "Remove line " + n);
      l.dl.textContent = "Line " + n + " description";
      l.dl.setAttribute("for", "a-d-" + n); l.desc.setAttribute("id", "a-d-" + n);
      l.al.textContent = "Line " + n + " amount (PHP)";
      l.al.setAttribute("for", "a-m-" + n); l.amt.setAttribute("id", "a-m-" + n);
      rm.setAttribute("type", "button");
      rm.hidden = lines.length < 2;
      rm.addEventListener("click", function () { if (busy) return; lines.splice(lines.indexOf(l), 1); drawLines(); summary(); });
      box.appendChild(l.dl); box.appendChild(l.desc); box.appendChild(l.al); box.appendChild(l.amt); box.appendChild(rm);
      $("a-lines").appendChild(box);
    });
    $("a-add").hidden = lines.length >= MAX_LINES;
  }
  function addLine() {
    var l = { dl: F.el("label", ""), desc: F.el("input", "input"), al: F.el("label", ""), amt: F.el("input", "input") };
    l.desc.setAttribute("type", "text"); l.desc.setAttribute("maxlength", String(MAX_DESC)); l.desc.setAttribute("autocomplete", "off");
    l.amt.setAttribute("type", "text"); l.amt.setAttribute("inputmode", "decimal"); l.amt.setAttribute("autocomplete", "off");
    l.amt.setAttribute("placeholder", "0.00");
    l.amt.addEventListener("input", summary);
    lines.push(l);
    drawLines();
    summary();
  }

  $("o-adjust").addEventListener("click", function () {
    if (busy || !current) return;
    reasonChoices.length = 0;
    reasonChoices.push(["", "Choose a reason"]);
    $("a-reason").textContent = "";
    $("a-reason").appendChild(F.el("option", "", "Choose a reason")).setAttribute("value", "");
    (Array.isArray(current.reasons) ? current.reasons : []).forEach(function (code) {
      var w = F.words(REASON, code);
      if (!w) return;
      reasonChoices.push([code, w]);
      $("a-reason").appendChild(F.el("option", "", w)).setAttribute("value", code);
    });
    $("a-reason").value = "";
    reasonBox.sync();
    lines = [];
    addLine();
    F.say("a-e", "");
    $("m-adjust-sub").textContent = "Reduce " + text(current.number) + ". Left to adjust: " + F.money(current.remaining_centavos) + ".";
    dlg.open("m-adjust", $("o-adjust"), reasonBox.input);
  });
  $("a-add").addEventListener("click", function () { if (!busy && lines.length < MAX_LINES) addLine(); });
  ["adjust-x", "adjust-cancel"].forEach(function (id) { $(id).addEventListener("click", function () { if (!busy) dlg.close(true); }); });

  $("adjust-form").addEventListener("submit", function (e) {
    var reason = $("a-reason").value, body, id, run = oneRun, wrong = "", t;
    e.preventDefault();
    if (busy || !current) return;
    if (!F.words(REASON, reason)) wrong = "Choose a reason.";
    else if (!lines.length || lines.length > MAX_LINES) wrong = "Use between 1 and " + MAX_LINES + " lines.";
    else if (lines.some(function (l) { return !String(l.desc.value || "").trim(); })) wrong = "Each line needs a description.";
    else if (lines.some(function (l) { return String(l.desc.value).trim().length > MAX_DESC; })) wrong = "A description is at most " + MAX_DESC + " characters.";
    else if (!(t = totalOf()).ok) wrong = "Each amount is a number of pesos above zero, with at most two decimals.";
    else if (t.sum > current.remaining_centavos) wrong = "That is more than is left of the statement.";
    F.say("a-e", wrong);
    if (wrong) return;
    id = current.statement;
    body = { statement: id, reason: reason, lines: lines.map(function (l) {
      return { description: String(l.desc.value).trim(), amount_centavos: -F.centavos(l.amt.value) };
    }) };
    lock(true);
    H.call("POST", "finance/statements/adjust/", body).then(function (res) {
      lock(false);
      if (run !== oneRun) return;
      if (F.left(res)) return;
      if (res.ok) {
        dlg.close(true);
        readOne(id, "Adjustment " + text(res.data && res.data.number) + " was made.", false);
        return;
      }
      if (res.status === 409 && res.code === "exceeds_remaining") { F.say("a-e", "That is more than is left of the statement."); return; }
      if (res.status === 409 && res.code === "not_adjustable") { F.say("a-e", "An adjustment cannot be adjusted."); return; }
      if (res.status === 404) { dlg.close(false); toList("That statement was not found."); return; }
      if (res.status === 400 && res.code === "invalid_request") { F.say("a-e", "Check the reason and the lines. Each line needs a description and an amount."); return; }
      if (res.status === 503 && res.code === "store_unavailable") { F.say("a-e", "The statement store is not available now. Try again later."); return; }
      F.say("a-e", LOST);
      readOne(id, "", false);
    });
  });

  /* ---- wiring ---- */

  Object.keys(FILTERS).forEach(function (k) {
    $("tab-" + k).addEventListener("click", function () {
      if (k === filter) return;
      filter = k;
      cursor = null;
      tabs();
      loadList(false);
    });
  });
  $("o-back").addEventListener("click", function (e) { e.preventDefault(); toList(""); });
  $("more").addEventListener("click", function () { if (cursor) loadList(true); });

  /* Who is signed in comes from me/, the staff route that answers it; the Finance routes do not. */
  function start() {
    show("boot");
    loaded = false;
    tabs();
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
