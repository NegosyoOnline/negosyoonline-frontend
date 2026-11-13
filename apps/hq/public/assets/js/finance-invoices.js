/* The Invoice register page: the queue of paid sales, one sale with the WRITE THIS ON PAPER worksheet, the form that
   records the paper invoice, Void, and the scan of the paper invoice (Billing HQ-F2, ClickUp z8uq9memvq, plan sections
   4.3 and 4.4). One address, two views: the queue, and one sale. Which sale is open is held in memory only, so a
   reload returns to the queue and no id is ever in an address.
   Coach Ed writes each invoice by hand on a preprinted paper book. This page only keeps the record: it never issues an
   invoice, never fills in a serial or the actual issue date, never edits or deletes a record (a mistake is voided).
   The scan has no address: it is read through NOHq.file, held in this tab's memory and shown from an object address that
   is released when the sale is closed. The page decides nothing about access and follows the backend's answer. A code,
   status or plan this page has no words for is left out: a raw value is never shown. */
(function () {
  var H = window.NOHq, F = window.NOFin, $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["boot", "v-queue", "v-sale", "v-closed", "v-down"];
  var TABS = ["ready", "awaiting_upload", "awaiting_verification", "published", "exceptions"];
  var LIMIT = 100;
  var MAX = 300;
  var MAX_SCAN = 8 * 1024 * 1024;
  var PLAN = { monthly: "Monthly Plan", annual: "Annual Plan", launch_promo: "Launch Promo (6 Months)", usage_only: "Storage usage" };
  var ACTION = { pending: "Write", recorded: "Upload scan", uploaded: "Review scan", verified: "View" };
  var STATE = { pending: ["Ready to write", "chip-warn"], recorded: ["Issued, awaiting upload", "chip-warn"],
    uploaded: ["Awaiting verification", "chip-warn"], verified: ["Verified", "chip-ok"] };
  var EVENT = { opened: "Added to the invoice queue", recorded: "Invoice recorded", scan_uploaded: "Scan uploaded",
    scan_rejected: "Scan rejected", verified: "Scan verified", voided: "Invoice voided", statement_linked: "Statement linked" };
  var REJECTED = { unreadable: "the file cannot be read", wrong_invoice: "it is a different invoice",
    amount_mismatch: "the amount differs", other: "for another reason" };
  var TAX = { non_vat: "Non-VAT" };
  var SALE = { cash: "Cash", charge: "Charge" };
  var SCAN_TYPES = ["image/jpeg", "image/png", "application/pdf"];
  var SHOWN = { "image/jpeg": "image", "image/png": "image", "application/pdf": "pdf" };
  var LABEL = { series: "Book", serial_from: "Book", serial_number: "Serial number", issued_on: "Actual issue date",
    sale_type: "Cash or Charge", buyer_name: "Buyer name", buyer_tin: "Buyer TIN", buyer_address: "Buyer address",
    description: "Description", service_start: "Service start", service_end: "Service end", total_sales_centavos: "Total sales",
    discount_centavos: "Discount", discount_kind: "Discount kind", withholding_centavos: "Withholding" };
  var LOST = "That did not go through. Check the sale before trying again.";
  var GONE = "That sale is no longer there.";

  var known = false, filter = "ready", queueRun = 0, saleRun = 0, scanRun = 0, current = null, live = null, books = [];
  var busy = false, scanUrl = null, scanFor = null;
  var dlg = F.dialogs(function () { return busy; });
  var bookChoices = [["", "Choose a book"]];
  var bookBox = F.combo($("r-book"), "Book", bookChoices, "r-book-hint");
  var typeBox = F.combo($("r-type"), "Cash or Charge", [["", "Choose"], ["cash", "Cash"], ["charge", "Charge"]]);
  var kindBox = F.combo($("r-dkind"), "Discount kind", [["", "No discount"], ["senior", "Senior citizen"], ["pwd", "PWD"], ["other", "Other"]], "r-dkind-e");
  var rejectBox = F.combo($("reject-f"), "Reason", [["", "Choose a reason"], ["unreadable", "The file cannot be read"],
    ["wrong_invoice", "This is a different invoice"], ["amount_mismatch", "The amount differs"], ["other", "Another reason"]], "reject-hint");

  function show(view) { VIEWS.forEach(function (id) { $(id).hidden = id !== view; }); }
  function planName(code) { return typeof code === "string" ? F.words(PLAN, code) : ""; }
  function text(v) { return typeof v === "string" ? v : ""; }
  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = "0" + s;
    return s;
  }
  function serialText(book, n) { return (book.series || "") + pad(n, book.serial_width || 4); }
  /* Whole centavos as pesos to type: 249900 is "2499.00". */
  function pesos(c) {
    return typeof c === "number" && c >= 0 && c % 1 === 0 ? String(Math.floor(c / 100)) + "." + pad(c % 100, 2) : "";
  }
  /* The Manila date of an instant as YYYY-MM-DD, or "". */
  function manilaDay(iso) {
    var d = new Date(iso), p = {};
    if (!iso || isNaN(d.getTime())) return "";
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p.year + "-" + p.month + "-" + p.day;
  }
  function checkFields(fields) {
    var names = [];
    Object.keys(fields || {}).forEach(function (k) {
      var w = F.words(LABEL, k);
      if (w && names.indexOf(w) < 0) names.push(w);
    });
    return names.length ? "Check these fields: " + names.join(", ") + "." : "Check the values and try again.";
  }
  /* rows: [label, value, note?]. */
  function facts(dl, rows) {
    dl.textContent = "";
    rows.forEach(function (r) {
      if (!r[1]) return;
      var box = F.el("div", ""), dd = F.el("dd", "", r[1]);
      if (r[2]) { dd.appendChild(F.el("span", "", " ")); dd.appendChild(F.el("span", "small", r[2])); }
      box.appendChild(F.el("dt", "", r[0]));
      box.appendChild(dd);
      dl.appendChild(box);
    });
  }

  /* ---- the queue ---- */

  function row(e) {
    var li = F.el("li", "batch"), main = F.el("div", "batch-main"), title = F.el("div", "batch-title"), end = F.el("div", "batch-end");
    var b = F.el("button", "no-btn no-btn-ghost", F.words(ACTION, e.status) || "Open"), exc = F.el("div", "exc");
    var sub = [planName(e.plan), F.money(e.total_centavos), typeof e.age_days === "number" && e.age_days >= 0 ? F.days(e.age_days) + " old" : ""].filter(Boolean).join(" · ");
    title.appendChild(F.el("span", "", text(e.site_name)));
    if (typeof e.serial === "string" && e.serial) title.appendChild(F.el("span", "chip chip-neutral", e.serial));
    if (e.is_test === true) title.appendChild(F.el("span", "chip chip-info", "TEST"));
    main.appendChild(title);
    if (sub) main.appendChild(F.el("span", "item-sub", sub));
    if (F.exceptionChips(exc, e.exceptions, "")) main.appendChild(exc);
    b.setAttribute("type", "button");
    b.addEventListener("click", function () { openSale(e.item); });
    end.appendChild(b);
    li.appendChild(main);
    li.appendChild(end);
    return li;
  }

  function group(g) {
    var card = F.el("section", "dash-card list-card grp"), head = F.el("div", "grp-head"), list = F.el("ol", "list"), n = 0;
    var when = F.day(g.paid_date);
    (Array.isArray(g.items) ? g.items : []).forEach(function (e) {
      if (e && typeof e.item === "string") { list.appendChild(row(e)); n++; }
    });
    if (!n) return null;
    card.setAttribute("aria-label", when ? "Paid " + when : "Paid");
    head.appendChild(F.el("h2", "", when ? "Paid " + when : "Paid"));
    head.appendChild(F.el("span", "small", "oldest first"));
    card.appendChild(head);
    card.appendChild(list);
    return card;
  }

  function tabs() {
    TABS.forEach(function (name) { $("tab-" + name).setAttribute("aria-pressed", String(name === filter)); });
  }

  function loadQueue() {
    var run = ++queueRun;
    tabs();
    $("q-groups").textContent = "";
    $("q-empty").hidden = true;
    $("q-limit").hidden = true;
    $("q-loading").hidden = false;
    H.call("POST", "finance/invoices/queue/", { filter: filter, limit: LIMIT }).then(function (res) {
      if (run !== queueRun) return;
      $("q-loading").hidden = true;
      if (F.left(res)) return;
      if (res.status === 404) { show("v-closed"); return; }
      if (!res.ok) { show("v-down"); return; }
      var d = res.data, shown = 0;
      (Array.isArray(d.groups) ? d.groups : []).forEach(function (g) {
        var card = g ? group(g) : null;
        if (card) { $("q-groups").appendChild(card); shown++; }
      });
      $("c-ready").textContent = typeof d.pending_count === "number" ? " (" + d.pending_count + ")" : "";
      $("q-empty").hidden = shown > 0;
      $("q-limit").hidden = !(typeof d.count === "number" && d.count >= LIMIT);
      show("v-queue");
    });
  }

  function toQueue(message) {
    saleRun++;
    current = null;
    live = null;
    closeScan();
    dlg.close(false);
    F.say("q-msg", message);
    show("v-queue");
    loadQueue();
  }

  /* ---- the worksheet: WRITE THIS ON PAPER, read only, in the paper form's order ---- */

  function section(box, label, value, note) {
    var s = F.el("div", "paper-sec");
    s.appendChild(F.el("div", "k", label));
    s.appendChild(F.el("div", note ? "v note" : "v", value));
    box.appendChild(s);
  }

  function paper(s) {
    var box = $("w-paper"), head = F.el("div", "paper-label"), sec, dl, item, h = s.header, sold = s.sold_to || {}, dates = s.date || {};
    box.textContent = "";
    head.appendChild(F.el("span", "", "WRITE THIS ON PAPER"));
    box.appendChild(head);

    sec = F.el("div", "paper-sec"); dl = F.el("dl", ""); item = F.el("div", "");
    item.appendChild(F.el("dt", "", "Header (issuer)"));
    if (h && typeof h === "object") {
      var dd = F.el("dd", "", text(h.legal_name)), more = [text(h.trade_name), h.tin ? "TIN " + text(h.tin) : "", h.branch_code ? "Branch " + text(h.branch_code) : "", F.words(TAX, h.tax_type)].filter(Boolean).join(" · ");
      if (more) { dd.appendChild(F.el("br", "")); dd.appendChild(F.el("span", "small", more)); }
      if (h.address) { dd.appendChild(F.el("br", "")); dd.appendChild(F.el("span", "small", text(h.address))); }
      item.appendChild(dd);
    } else {
      item.appendChild(F.el("dd", "v note", "No issuer is verified yet. Verify one on the Issuer page first."));
    }
    dl.appendChild(item); sec.appendChild(dl); box.appendChild(sec);

    if (text(s.number)) section(box, "Number", text(s.number), true);

    sec = F.el("div", "paper-sec"); dl = F.el("dl", "");
    item = F.el("div", ""); item.appendChild(F.el("dt", "", "Payment date")); item.appendChild(F.el("dd", "", F.isDate(dates.payment_date) ? dates.payment_date : "")); dl.appendChild(item);
    item = F.el("div", ""); item.appendChild(F.el("dt", "", "Issue date")); item.appendChild(F.el("dd", "v note", text(dates.issue_date))); dl.appendChild(item);
    sec.appendChild(dl); box.appendChild(sec);

    section(box, "Cash or Charge", F.words(SALE, s.sale_type));

    sec = F.el("div", "paper-sec"); dl = F.el("dl", ""); item = F.el("div", "");
    item.appendChild(F.el("dt", "", "Sold To"));
    var who = F.el("dd", "", text(sold.name));
    [text(sold.address), sold.tin ? "TIN " + text(sold.tin) : ""].filter(Boolean).forEach(function (line) {
      who.appendChild(F.el("br", "")); who.appendChild(F.el("span", "small", line));
    });
    item.appendChild(who); dl.appendChild(item); sec.appendChild(dl); box.appendChild(sec);

    sec = F.el("div", "paper-sec");
    sec.appendChild(F.el("div", "k", "Description"));
    (Array.isArray(s.rows) ? s.rows : []).forEach(function (r) {
      var line = F.el("div", "p-row"), nums = F.el("div", "p-nums"), n;
      if (!r || typeof r !== "object") return;
      line.appendChild(F.el("p", "p-desc", text(r.description)));
      [["Qty", typeof r.quantity === "number" ? String(r.quantity) : ""], ["Unit", F.money(r.unit_centavos)], ["Amount", F.money(r.amount_centavos)]].forEach(function (x) {
        if (!x[1]) return;
        n = F.el("span", "", x[0] + " "); n.appendChild(F.el("b", "num", x[1])); nums.appendChild(n);
      });
      line.appendChild(nums); sec.appendChild(line);
    });
    box.appendChild(sec);

    sec = F.el("div", "paper-sec"); item = F.el("div", "paper-total");
    item.appendChild(F.el("span", "", "Total sales")); item.appendChild(F.el("span", "num", F.money(s.total_sales_centavos)));
    sec.appendChild(item); box.appendChild(sec);

    if (text(s.deductions)) section(box, "Deductions", text(s.deductions), true);
    if (text(s.signature)) section(box, "Signature", text(s.signature), true);
  }

  /* ---- one sale ---- */

  function liveOf(d) {
    var found = null;
    (Array.isArray(d.invoices) ? d.invoices : []).forEach(function (i) {
      if (i && (i.status === "recorded" || i.status === "uploaded" || i.status === "verified")) found = i;
    });
    return found;
  }
  function scansOf(invoice) { return Array.isArray(invoice.scans) ? invoice.scans.filter(function (s) { return s && typeof s.scan === "string"; }) : []; }
  /* The scan the invoice holds now (uploaded or verified), and the last one refused. */
  function activeScan(invoice) {
    var found = null;
    scansOf(invoice).forEach(function (s) { if (s.status === "uploaded" || s.status === "verified") found = s; });
    return found;
  }
  function lastRejected(invoice) {
    var all = scansOf(invoice), s = all.length ? all[all.length - 1] : null;
    return s && s.status === "rejected" ? s : null;
  }

  function history(d) {
    var list = $("s-hist"), paid = F.stamp(d.paid_at);
    list.textContent = "";
    function add(what, at) {
      var li = F.el("li", ""), line = F.el("div", "ev");
      line.appendChild(F.el("span", "", what));
      line.appendChild(F.el("span", "small", F.stamp(at)));
      li.appendChild(line); list.appendChild(li);
    }
    if (paid) add("Payment confirmed", d.paid_at);
    (Array.isArray(d.events) ? d.events : []).forEach(function (e) {
      var what = F.words(EVENT, e && e.code);
      if (what) add(what, e.at);
    });
  }

  function release() {
    if (scanUrl) URL.revokeObjectURL(scanUrl);
    scanUrl = null;
  }
  function closeScan() {
    scanRun++;
    scanFor = null;
    release();
    $("sc-img").removeAttribute("src");
    $("sc-preview").removeAttribute("href");
    ["sc-img", "sc-file-tile", "sc-preview", "sc-err", "sc-loading"].forEach(function (id) { $(id).hidden = true; });
  }

  function loadScan(id) {
    var run = ++scanRun;
    closeScan();
    scanRun = run;
    scanFor = id;
    $("sc-loading").hidden = false;
    H.file("finance/invoices/scan/", { scan: id }).then(function (res) {
      if (run !== scanRun) return;
      $("sc-loading").hidden = true;
      if (F.left(res)) return;
      var kind = res.ok && res.blob ? F.words(SHOWN, res.blob.type) : "";
      if (!kind) { $("sc-err").hidden = false; return; }
      release();
      scanUrl = URL.createObjectURL(res.blob);
      /* A PDF is not drawn in the page (the CSP allows no frame or object): it is a file tile. Both open from the held object. */
      if (kind === "pdf") $("sc-file-tile").hidden = false;
      else { $("sc-img").setAttribute("src", scanUrl); $("sc-img").hidden = false; }
      $("sc-preview").setAttribute("href", scanUrl);
      $("sc-preview").hidden = false;
    });
  }

  function resetForm(d) {
    var s = d.suggested || {}, sold = s.sold_to || {}, rows = Array.isArray(s.rows) ? s.rows : [], hint;
    books = (Array.isArray(d.books) ? d.books : []).filter(function (b) {
      return b && typeof b.serial_from === "number" && typeof b.serial_to === "number" && typeof b.series === "string";
    });
    bookChoices.length = 0;
    bookChoices.push(["", "Choose a book"]);
    $("r-book").textContent = "";
    $("r-book").appendChild(F.el("option", "", "Choose a book")).setAttribute("value", "");
    books.forEach(function (b, i) {
      var label = (b.series ? "Series " + b.series + ", " : "") + "serials " + pad(b.serial_from, b.serial_width || 4) + " to " + pad(b.serial_to, b.serial_width || 4);
      bookChoices.push([String(i), label]);
      $("r-book").appendChild(F.el("option", "", label)).setAttribute("value", String(i));
    });
    $("r-book").value = "";
    bookBox.sync();
    hint = books.filter(function (b) { return typeof b.next_expected_hint === "number"; })
      .map(function (b) { return serialText(b, b.next_expected_hint); });
    $("r-book-hint").textContent = books.length
      ? (hint.length ? "Next expected: " + hint.join(", ") + ". " : "") + "A hint only; type the serial printed on the paper."
      : "No invoice book is active. Add one on the Issuer page first.";
    $("r-serial").value = "";                 /* never filled in */
    $("r-issued").value = "";                 /* never filled in, no default */
    $("r-type").value = "cash"; typeBox.sync();
    $("r-bname").value = text(sold.name);
    $("r-btin").value = text(sold.tin);
    $("r-baddr").value = text(sold.address);
    $("r-desc").value = rows[0] ? text(rows[0].description) : "";
    $("r-sstart").value = manilaDay(d.period_start);
    $("r-send").value = manilaDay(d.period_end);
    $("r-total").value = pesos(d.total_centavos);
    $("r-dkind").value = ""; kindBox.sync();
    $("r-disc").value = "";
    $("r-wh").value = "";
    ["book", "serial", "issued", "bname", "btin", "baddr", "desc", "sstart", "send", "total", "dkind", "disc", "wh"].forEach(function (f) { fieldError(f, ""); });
    F.say("rec-err", "");
    $("rec-go").disabled = false;
  }

  function fieldError(name, message) {
    var e = $("r-" + name + "-e"), input = $("r-" + name);
    e.textContent = message || "";
    e.hidden = !message;
    if (message) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
  }

  function paint(d) {
    var inv, state, chip, rej, sub, exc = $("s-exc"), seen, pending, label;
    current = d;
    live = liveOf(d);
    inv = live;
    state = live ? live.status : "pending";
    rej = inv ? lastRejected(inv) : null;
    chip = F.words(STATE, state) ? STATE[state] : null;
    $("s-site").textContent = text(d.site_name);
    if (rej && state === "recorded") chip = ["Scan rejected", "chip-err"];
    $("s-status").textContent = chip ? chip[0] : "";
    $("s-status").setAttribute("class", "chip " + (chip ? chip[1] : "chip-warn"));
    $("s-status").hidden = !chip;
    $("s-test").hidden = d.is_test !== true;
    pending = !inv;
    $("s-serial").textContent = inv ? "Invoice " + text(inv.serial) : "";
    $("s-serial").hidden = !inv || !text(inv.serial);
    $("s-amount-l").textContent = inv ? "Amount due" : "Amount paid";
    $("s-amount").textContent = F.money(inv ? inv.amount_due_centavos : d.total_centavos);
    sub = d.statement ? ["Statement", text(d.statement)] : ["", ""];
    if (inv) {
      facts($("s-facts"), [["Serial", text(inv.serial)], ["Issue date", F.day(inv.issued_on)], ["Sale date", F.day(d.sale_date)],
        ["Buyer", text(inv.buyer_name)], ["Plan", planName(d.plan)], ["Payment reference", text(d.payment)], sub]);
    } else {
      facts($("s-facts"), [["Plan", planName(d.plan)],
        ["Period", F.dayOf(d.period_start) && F.dayOf(d.period_end) ? F.dayOf(d.period_start) + " to " + F.dayOf(d.period_end) : ""],
        ["Paid date", F.dayOf(d.paid_at)], ["Sale date", F.day(d.sale_date), "(not the invoice issue date)"],
        ["Payment reference", text(d.payment)], ["Age", typeof d.age_days === "number" && d.age_days >= 0 ? F.days(d.age_days) : ""], sub]);
    }
    if (rej && state === "recorded") {
      $("s-rejected").textContent = "The last file was rejected" + (F.words(REJECTED, rej.reject_reason) ? ": " + REJECTED[rej.reject_reason] : "") + ". Upload a new file.";
      $("s-rejected").hidden = false;
    } else $("s-rejected").hidden = true;
    $("s-lines").textContent = "";
    (Array.isArray(d.lines) ? d.lines : []).forEach(function (l) {
      var li = F.el("li", ""), line = F.el("div", "ev");
      if (!l || typeof l.description !== "string") return;
      line.appendChild(F.el("span", "", l.description));
      line.appendChild(F.el("span", "num", F.money(l.amount_centavos)));
      li.appendChild(line); $("s-lines").appendChild(li);
    });
    $("s-exc-box").hidden = !F.exceptionChips(exc, d.exceptions, "");
    seen = inv ? (state === "verified" ? "The Subscriber can open this copy." : "Payment received, invoice copy pending.") : "";
    $("s-sees").textContent = seen;
    $("s-sees-box").hidden = !seen;
    history(d);
    $("s-void-row").hidden = !inv;

    /* The right side: the worksheet and the form for a sale with no invoice; the scan once an invoice is recorded. */
    closeScan();
    $("w-card").hidden = !pending;
    $("rec-card").hidden = !pending;
    $("sc-card").hidden = pending;
    if (pending) {
      paper(d.suggested && typeof d.suggested === "object" ? d.suggested : {});
      resetForm(d);
    } else {
      var scan = activeScan(inv);
      $("sc-upload").hidden = state !== "recorded";
      $("sc-up-row").hidden = state !== "recorded";
      $("sc-check").hidden = state !== "uploaded";
      $("sc-done").hidden = state !== "verified";
      F.say("up-err", "");
      $("sc-file").value = "";
      label = [text(inv.serial), F.day(inv.issued_on), F.money(inv.amount_due_centavos)].filter(Boolean).join(" · ");
      $("m-verify-sub").textContent = label;
      $("m-reject-sub").textContent = label;
      $("m-void-sub").textContent = text(inv.serial) + " · the sale returns to Ready to write. The record, scan and history stay.";
      facts($("sc-kv"), [["Serial", text(inv.serial)], ["Issue date", F.day(inv.issued_on)], ["Amount due", F.money(inv.amount_due_centavos)], ["Buyer", text(inv.buyer_name)]]);
      if (scan && (state === "uploaded" || state === "verified")) loadScan(scan.scan);
    }
    $("s-loading").hidden = true;
    $("s-body").hidden = false;
  }

  /* first: it was just opened, so a failure to read shows the page's down view. */
  function readSale(id, first) {
    var run = saleRun;
    H.call("POST", "finance/invoices/detail/", { item: id }).then(function (res) {
      if (run !== saleRun || F.left(res)) return;
      if (res.status === 404) { toQueue(GONE); return; }
      if (!res.ok) { if (first) show("v-down"); return; }
      paint(res.data);
    });
  }

  function openSale(id) {
    saleRun++;
    current = null;
    live = null;
    closeScan();
    $("s-body").hidden = true;
    $("s-loading").hidden = false;
    F.say("s-msg", "");
    F.say("q-msg", "");
    show("v-sale");
    readSale(id, true);
  }

  /* ---- record the paper invoice ---- */

  /* Pesos typed in a money box, as whole centavos. Blank is zero when zero is allowed; null is not a valid amount. */
  function amount(typed, zeroOk) {
    var t = String(typed || "").trim(), c;
    if (!t) return zeroOk ? 0 : null;
    c = F.centavos(t);
    if (c === null && zeroOk && /^0(\.0{1,2})?$/.test(t)) return 0;
    return c;
  }

  function submitRecord() {
    var errs = {}, bad = false, book = books[Number($("r-book").value)], serialTyped = String($("r-serial").value || "").trim();
    var issued = String($("r-issued").value || "").trim(), bname = String($("r-bname").value || "").trim(), btin = String($("r-btin").value || "").trim();
    var baddr = String($("r-baddr").value || "").trim(), desc = String($("r-desc").value || "").trim();
    var sstart = String($("r-sstart").value || "").trim(), send = String($("r-send").value || "").trim();
    var total = amount($("r-total").value, false), disc = amount($("r-disc").value, true), wh = amount($("r-wh").value, true);
    var kind = $("r-dkind").value, body, id, run = saleRun;
    if (busy || !current) return;
    function no(field, message) { errs[field] = message; bad = true; }
    if (!$("r-book").value || !book) no("book", "Choose the book.");
    if (!/^\d{1,9}$/.test(serialTyped)) no("serial", "Type the serial printed on the paper.");
    if (!F.isDate(issued)) no("issued", "Type the issue date as YYYY-MM-DD.");
    if (!bname || bname.length > 160) no("bname", "Type the buyer's name, at most 160 characters.");
    if (btin.length > 17) no("btin", "At most 17 characters.");
    if (baddr.length > 255) no("baddr", "At most 255 characters.");
    if (!desc || desc.length > MAX) no("desc", "Type the description, at most " + MAX + " characters.");
    if (!F.isDate(sstart)) no("sstart", "Type the date as YYYY-MM-DD.");
    if (!F.isDate(send)) no("send", "Type the date as YYYY-MM-DD.");
    else if (F.isDate(sstart) && send < sstart) no("send", "The service cannot end before it starts.");
    if (total === null) no("total", "Type the total sales in pesos, for example 2499.00.");
    if (disc === null) no("disc", "Type pesos, for example 100.00, or leave it empty.");
    if (wh === null) no("wh", "Type pesos, for example 100.00, or leave it empty.");
    if (disc !== null && disc > 0 && !kind) no("dkind", "Choose the kind of discount.");
    else if (disc === 0 && kind) no("dkind", "There is no discount. Choose No discount, or type the discount.");
    if (total !== null && disc !== null && wh !== null && disc + wh > total) no("disc", "The deductions are more than the total.");
    ["book", "serial", "issued", "bname", "btin", "baddr", "desc", "sstart", "send", "total", "dkind", "disc", "wh"].forEach(function (f) { fieldError(f, errs[f] || ""); });
    F.say("rec-err", "");
    if (bad) return;
    id = current.item;
    body = { item: id, series: book.series, serial_from: book.serial_from, serial_number: Number(serialTyped), issued_on: issued,
      sale_type: $("r-type").value === "charge" ? "charge" : "cash", buyer_name: bname, buyer_tin: btin, buyer_address: baddr,
      description: desc, service_start: sstart, service_end: send, total_sales_centavos: total, discount_centavos: disc,
      withholding_centavos: wh };
    if (disc > 0) body.discount_kind = kind;
    busy = true;
    $("rec-go").disabled = true;
    H.call("POST", "finance/invoices/record/", body).then(function (res) {
      busy = false;
      $("rec-go").disabled = false;
      if (run !== saleRun || F.left(res)) return;
      if (res.ok) { F.say("s-msg", "Recorded. The invoice now waits for its scan."); readSale(id, false); return; }
      if (res.status === 404) { toQueue(GONE); return; }
      if (res.status === 409 && res.code === "duplicate_serial") { F.say("rec-err", "That serial is already recorded in this book."); return; }
      if (res.status === 409 && res.code === "amount_mismatch") { F.say("rec-err", "The total on the invoice is not the amount paid."); return; }
      if (res.status === 409 && res.code === "book_inactive") { F.say("rec-err", "That invoice book is not active. Choose another."); return; }
      /* The sale is not as the page showed it: say so and read it again, so the page shows what it is now. */
      if (res.status === 409 && res.code === "not_pending") { F.say("s-msg", "This sale is not waiting for an invoice."); readSale(id, false); return; }
      if (res.status === 409 && res.code === "already_recorded") { F.say("s-msg", "This sale already has an invoice."); readSale(id, false); return; }
      if (res.status === 400 && res.code === "invalid_request") { F.say("rec-err", checkFields(res.fields)); return; }
      F.say("rec-err", LOST);
    });
  }

  /* ---- the scan: upload, verify, reject ---- */

  function uploadScan() {
    var file = $("sc-file").files && $("sc-file").files[0], id, form, run = saleRun;
    if (busy || !live) return;
    F.say("up-err", "");
    if (!file) { F.say("up-err", "Choose a file first."); return; }
    /* A courtesy check only: the backend decides by the file's first bytes, and its answer is shown. */
    if (SCAN_TYPES.indexOf(file.type) < 0) { F.say("up-err", "Use a JPEG, PNG or PDF file."); return; }
    if (file.size > MAX_SCAN) { F.say("up-err", "The file is over 8 MB."); return; }
    id = current.item;
    form = new FormData();
    form.append("invoice", live.invoice);
    form.append("scan", file);
    busy = true;
    $("sc-up").disabled = true;
    H.upload("finance/invoices/upload/", form).then(function (res) {
      busy = false;
      $("sc-up").disabled = false;
      if (run !== saleRun || F.left(res)) return;
      if (res.ok) { F.say("s-msg", "Uploaded. The scan now waits for verification."); readSale(id, false); return; }
      if (res.status === 404) { toQueue(GONE); return; }
      if (res.status === 409 && res.code === "duplicate_scan") { F.say("up-err", "This file is already attached to an invoice."); return; }
      if (res.status === 409 && res.code === "not_recorded") { F.say("s-msg", "This invoice is not waiting for a scan."); readSale(id, false); return; }
      if (res.status === 503 && res.code === "scan_store_unavailable") { F.say("up-err", "The scan could not be stored. Try again in a moment."); return; }
      if (res.status === 400 && res.code === "invalid_request") { F.say("up-err", "Use a JPEG, PNG or PDF file, up to 8 MB."); return; }
      F.say("up-err", LOST);
    });
  }

  function lock(on) {
    busy = on;
    ["verify-go", "verify-x", "verify-cancel", "reject-go", "reject-x", "reject-cancel", "void-go", "void-x", "void-cancel"].forEach(function (id) { $(id).disabled = on; });
  }

  /* kind: "verify" or "reject". Both name the scan the invoice holds now. */
  function decideScan(kind) {
    var scan = live ? activeScan(live) : null, id, run = saleRun, body, reason = kind === "reject" ? $("reject-f").value : "";
    if (busy || !current || !scan) return;
    if (kind === "reject" && !reason) { F.say("reject-e", "Choose a reason."); $("reject-f").setAttribute("aria-invalid", "true"); return; }
    $("reject-f").removeAttribute("aria-invalid");
    F.say(kind + "-e", "");
    id = current.item;
    body = kind === "reject" ? { scan: scan.scan, reason: reason } : { scan: scan.scan };
    lock(true);
    H.call("POST", "finance/invoices/" + kind + "/", body).then(function (res) {
      lock(false);
      if (run !== saleRun || F.left(res)) return;
      if (res.ok) {
        dlg.close(false);
        F.say("s-msg", kind === "verify" ? "Scan verified." : "Scan rejected. The invoice is back to awaiting upload.");
        readSale(id, false);
        return;
      }
      if (res.status === 404) { toQueue(GONE); return; }
      if (res.status === 409 && res.code === "not_uploaded") { F.say(kind + "-e", "This scan is not waiting for a decision."); readSale(id, false); return; }
      if (res.status === 400 && res.code === "invalid_request") { F.say(kind + "-e", "Choose one of the listed reasons."); return; }
      F.say(kind + "-e", LOST);
      readSale(id, false);
    });
  }

  /* ---- Void ---- */

  function voidInvoice() {
    var field = $("void-f"), reason = String(field.value || "").trim(), id, run = saleRun, wrong;
    if (busy || !current || !live) return;
    wrong = !reason ? "Write a reason." : reason.length > MAX ? "The reason is at most " + MAX + " characters." : "";
    F.say("void-e", wrong);
    if (wrong) { field.setAttribute("aria-invalid", "true"); return; }
    field.removeAttribute("aria-invalid");
    id = current.item;
    lock(true);
    H.call("POST", "finance/invoices/void/", { invoice: live.invoice, reason: reason }).then(function (res) {
      lock(false);
      if (run !== saleRun || F.left(res)) return;
      if (res.ok) {
        dlg.close(false);
        F.say("s-msg", "Invoice voided. The sale is back in Ready to write.");
        readSale(id, false);
        return;
      }
      if (res.status === 404) { toQueue(GONE); return; }
      if (res.status === 400 && res.code === "invalid_request") { F.say("void-e", "Check the reason. It is required and at most " + MAX + " characters."); return; }
      F.say("void-e", LOST);
      readSale(id, false);
    });
  }

  /* ---- wiring ---- */

  TABS.forEach(function (name) {
    $("tab-" + name).addEventListener("click", function () {
      if (filter === name) return;
      filter = name;
      tabs();
      F.say("q-msg", "");
      loadQueue();
    });
  });
  $("s-back").addEventListener("click", function (e) { e.preventDefault(); toQueue(""); });
  $("rec-back").addEventListener("click", function (e) { e.preventDefault(); toQueue(""); });
  $("rec-form").addEventListener("submit", function (e) { e.preventDefault(); submitRecord(); });
  $("sc-up").addEventListener("click", uploadScan);
  $("sc-retry").addEventListener("click", function () { if (scanFor) loadScan(scanFor); });

  $("sc-verify").addEventListener("click", function () {
    if (busy || !live || !activeScan(live)) return;
    F.say("verify-e", "");
    dlg.open("m-verify", $("sc-verify"), $("verify-cancel"));
  });
  $("sc-reject").addEventListener("click", function () {
    if (busy || !live || !activeScan(live)) return;
    $("reject-f").value = "";
    $("reject-f").removeAttribute("aria-invalid");
    rejectBox.sync();
    F.say("reject-e", "");
    dlg.open("m-reject", $("sc-reject"), rejectBox.input);
  });
  $("s-void").addEventListener("click", function () {
    if (busy || !live) return;
    $("void-f").value = "";
    $("void-f").removeAttribute("aria-invalid");
    $("void-count").textContent = "0 of " + MAX;
    F.say("void-e", "");
    dlg.open("m-void", $("s-void"), $("void-f"));
  });
  $("void-f").addEventListener("input", function () { $("void-count").textContent = String($("void-f").value.length) + " of " + MAX; });
  ["verify", "reject", "void"].forEach(function (kind) {
    ["-x", "-cancel"].forEach(function (s) { $(kind + s).addEventListener("click", function () { if (!busy) dlg.close(true); }); });
  });
  $("verify-form").addEventListener("submit", function (e) { e.preventDefault(); decideScan("verify"); });
  $("reject-form").addEventListener("submit", function (e) { e.preventDefault(); decideScan("reject"); });
  $("void-form").addEventListener("submit", function (e) { e.preventDefault(); voidInvoice(); });

  /* Who is signed in comes from me/, the staff route that answers it; the Finance routes do not. */
  function start() {
    show("boot");
    if (known) { loadQueue(); return; }
    H.call("GET", "me/").then(function (res) {
      if (F.left(res)) return;
      if (!res.ok) { show("v-down"); return; }
      known = true;
      window.NOHqShell.signedIn(res.data.email);
      loadQueue();
    });
  }
  $("retry").addEventListener("click", start);
  start();
})();
