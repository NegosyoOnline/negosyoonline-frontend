/* The Issuer and invoice books page (Billing HQ-F1, ClickUp z8uq9mektc, plan section 4.2). Two cards: the issuer
   details (the current verified profile, a pending one to verify, and a form that records new details) and
   the invoice books (the list, an Add a book form and an Active switch per book).
   A change never edits a profile: new details are a new unverified profile (B5 C4). Nothing is prefilled,
   defaulted or stored in the browser, and no value is in code: the values come from the Certificate of
   Registration and are typed here (B5 Q3). The tax type is a fixed Non-VAT line and is not sent: the
   backend stores Non-VAT only (the manager's decision, 2026-11-13). A book cannot be edited or deleted: the
   page offers neither. The page decides nothing: the backend does, and it follows the answer. */
(function () {
  var H = window.NOHq, F = window.NOFin, $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["boot", "v-main", "v-closed", "v-down"];
  var TAX = { non_vat: "Non-VAT" };
  var LABEL = { legal_name: "Legal name", trade_name: "Trade name", tin: "TIN", branch_code: "Branch code",
    registered_address: "Registered address", cor_number: "COR number", cor_date: "COR date", contact_email: "Contact email",
    series: "Series", serial_from: "First serial", serial_to: "Last serial", serial_width: "Serial width",
    atp_reference: "Authority reference", atp_date: "Authority date", printer_name: "Printer name", note: "Note" };
  var LOST = "That did not go through. Check the page before trying again.";
  var NOTE_MAX = 300;
  var BOOK_REFUSED = { issuer_not_verified: "No issuer is verified yet. Verify one first.",
    serial_range_overlaps: "These serials overlap an existing book of the same series." };
  var DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

  var known = false, pending = null, loadRun = 0, booksRun = 0, busy = false;
  var dlg = F.dialogs(function () { return busy; });

  function show(view) { VIEWS.forEach(function (id) { $(id).hidden = id !== view; }); }
  /* A real calendar date as YYYY-MM-DD, or false. */
  function isDate(text) {
    var m = DATE.exec(text), d;
    if (!m) return false;
    d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
  }
  /* "Check: Legal name, TIN." from a refusal's field errors; only fields this page names are listed. */
  function checkFields(fields) {
    var names = Object.keys(fields || {}).map(function (k) { return F.words(LABEL, k); }).filter(Boolean);
    return names.length ? "Check these fields: " + names.join(", ") + "." : "Check the values and try again.";
  }
  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = "0" + s;
    return s;
  }
  function facts(dl, rows) {
    dl.textContent = "";
    rows.forEach(function (r) {
      var box = F.el("div", ""), dd = F.el("dd", "", r[1]);
      box.appendChild(F.el("dt", "", r[0]));
      box.appendChild(dd);
      dl.appendChild(box);
    });
  }
  function values(p) {
    var rows = [["Legal name", p.legal_name || ""]];
    if (p.trade_name) rows.push(["Trade name", p.trade_name]);
    rows.push(["TIN", p.tin || ""], ["Branch code", p.branch_code || ""], ["Registered address", p.registered_address || ""],
      ["Tax type", F.words(TAX, p.tax_type)], ["COR number", p.cor_number || ""], ["COR date", isDate(p.cor_date) ? p.cor_date : ""],
      ["Contact email", p.contact_email || ""]);
    return rows;
  }

  /* ---- the issuer card ---- */

  function paintIssuer(d) {
    var cur = d.current && typeof d.current === "object" ? d.current : null, pend = d.pending && typeof d.pending === "object" ? d.pending : null;
    pending = pend && typeof pend.issuer === "string" ? pend : null;
    $("i-chip").hidden = !cur;
    $("i-cur").hidden = !cur;
    $("i-blocked").hidden = !!cur;
    if (cur) {
      var rows = values(cur);
      rows.push(["Verified", F.dayOf(cur.verified_at)]);
      if (cur.verification_note) rows.push(["Verification note", cur.verification_note]);
      facts($("i-cur-facts"), rows);
    }
    /* A verified issuer makes the form's "No issuer is verified yet" line out of date. */
    if (cur && $("b-err").textContent === BOOK_REFUSED.issuer_not_verified) F.say("b-err", "");
    $("i-pend").hidden = !pending;
    if (pending) {
      var prow = values(pending);
      prow.push(["Recorded", F.dayOf(pending.created_at) + ", not verified"]);
      facts($("i-pend-facts"), prow);
    }
  }

  function loadIssuer(message) {
    var run = ++loadRun;
    H.call("POST", "finance/issuer/get/", {}).then(function (res) {
      if (run !== loadRun) return;
      if (F.left(res)) return;
      if (res.status === 404) { show("v-closed"); return; }
      if (!res.ok) { show("v-down"); return; }
      paintIssuer(res.data);
      F.say("i-msg", message || "");
      show("v-main");
      loadBooks();
    });
  }

  /* ---- the books card ---- */

  function book(b) {
    var li = F.el("li", "batch"), main = F.el("div", "batch-main"), title = F.el("div", "batch-title"), end = F.el("div", "batch-end");
    var sw = F.el("button", "sw"), label = F.el("span", "sw-l"), width = typeof b.serial_width === "number" ? b.serial_width : 0;
    var meta = ["Authority reference " + (b.atp_reference || "")];
    if (isDate(b.atp_date)) meta.push("dated " + b.atp_date);
    if (b.printer_name) meta.push("printer " + b.printer_name);
    title.appendChild(F.el("span", "", b.series ? "Series " + b.series : "No series"));
    main.appendChild(title);
    main.appendChild(F.el("span", "item-sub", "Serials " + pad(b.serial_from, width) + " to " + pad(b.serial_to, width) + " · width " + width + " digits"));
    main.appendChild(F.el("span", "small", meta.join(" · ")));
    function paint(on) {
      sw.setAttribute("aria-checked", String(on));
      label.textContent = on ? "Active" : "Not active";
    }
    sw.setAttribute("type", "button");
    sw.setAttribute("role", "switch");
    sw.appendChild(F.el("span", "sw-track")).setAttribute("aria-hidden", "true");
    sw.appendChild(label);
    paint(b.active === true);
    sw.addEventListener("click", function () {
      if (sw.disabled) return;
      var next = sw.getAttribute("aria-checked") !== "true";
      sw.disabled = true;
      F.say("b-msg", "");
      H.call("POST", "finance/invoices/books/active/", { series: b.series, serial_from: b.serial_from, active: next }).then(function (res) {
        sw.disabled = false;
        if (F.left(res)) return;
        if (res.ok) { paint(res.data.active === true); return; }
        if (res.status === 404) { loadBooks(); return; }
        F.say("b-msg", LOST);
      });
    });
    end.appendChild(sw);
    li.appendChild(main);
    li.appendChild(end);
    return li;
  }

  function loadBooks(message) {
    var run = ++booksRun;
    H.call("POST", "finance/invoices/books/", {}).then(function (res) {
      if (run !== booksRun) return;
      if (F.left(res)) return;
      var off = res.status === 404;
      $("b-off").hidden = !off;
      $("b-tools").hidden = off;
      $("books").textContent = "";
      if (off) { F.say("b-msg", ""); return; }
      if (!res.ok) { F.say("b-msg", "Invoice books could not be loaded. Try again."); return; }
      var items = Array.isArray(res.data.items) ? res.data.items : [];
      items.forEach(function (b) { if (b && typeof b.serial_from === "number" && typeof b.serial_to === "number") $("books").appendChild(book(b)); });
      $("b-empty").hidden = $("books").children.length > 0;
      F.say("b-msg", message || "");
    });
  }

  /* ---- Record new details ---- */

  var NEW = ["n-legal", "n-trade", "n-tin", "n-branch", "n-addr", "n-cor", "n-cordate", "n-mail"];
  function toggleForm(openId, formId, on, first) {
    $(formId).hidden = !on;
    $(openId).setAttribute("aria-expanded", String(on));
    if (on) $(first).focus(); else $(openId).focus();
  }
  $("new-open").addEventListener("click", function () {
    NEW.forEach(function (id) { $(id).value = ""; });
    F.say("n-err", "");
    toggleForm("new-open", "f-new", $("f-new").hidden, "n-legal");
  });
  $("n-cancel").addEventListener("click", function () { toggleForm("new-open", "f-new", false); });
  $("f-new").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    var v = {}, wrong = "";
    NEW.forEach(function (id) { v[id] = String($(id).value || "").trim(); });
    if (!v["n-legal"] || !v["n-tin"] || !v["n-branch"] || !v["n-addr"] || !v["n-cor"] || !v["n-cordate"] || !v["n-mail"]) wrong = "Fill in every required field. COR date is YYYY-MM-DD.";
    else if (!isDate(v["n-cordate"])) wrong = "COR date is YYYY-MM-DD.";
    else if (v["n-mail"].indexOf("@") < 1) wrong = "Enter an email address.";
    F.say("n-err", wrong);
    if (wrong) return;
    busy = true;
    $("n-go").disabled = true;
    H.call("POST", "finance/issuer/set/", { legal_name: v["n-legal"], trade_name: v["n-trade"], tin: v["n-tin"], branch_code: v["n-branch"],
      registered_address: v["n-addr"], cor_number: v["n-cor"], contact_email: v["n-mail"], cor_date: v["n-cordate"] }).then(function (res) {
      busy = false;
      $("n-go").disabled = false;
      if (F.left(res)) return;
      if (res.ok) {
        NEW.forEach(function (id) { $(id).value = ""; });
        toggleForm("new-open", "f-new", false);
        loadIssuer("Saved as a new profile, waiting to be verified.");
        return;
      }
      if (res.status === 404) { show("v-closed"); return; }
      F.say("n-err", res.status === 400 && res.code === "invalid_request" ? checkFields(res.fields) : LOST);
    });
  });

  /* ---- Verify ---- */

  function lock(on) {
    busy = on;
    ["verify-go", "verify-x", "verify-cancel"].forEach(function (id) { $(id).disabled = on; });
  }
  $("open-verify").addEventListener("click", function () {
    if (busy || !pending) return;
    $("verify-f").value = "";
    $("verify-f").removeAttribute("aria-invalid");
    $("verify-count").textContent = "0 of " + NOTE_MAX;
    F.say("verify-e", "");
    $("verify-sub").textContent = (pending.legal_name || "") + ", COR " + (pending.cor_number || "") + ".";
    dlg.open("m-verify", $("open-verify"), $("verify-f"));
  });
  $("verify-f").addEventListener("input", function () { $("verify-count").textContent = String($("verify-f").value.length) + " of " + NOTE_MAX; });
  ["verify-x", "verify-cancel"].forEach(function (id) { $(id).addEventListener("click", function () { if (!busy) dlg.close(true); }); });
  /* A refusal that means the page is out of date closes the dialog and reads the profiles again. */
  var STALE = { already_verified: "This profile was already verified.",
    superseded: "A newer profile is already verified. Record new details instead." };
  $("verify-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || !pending) return;
    var note = String($("verify-f").value || "").trim(), id = pending.issuer;
    var wrong = note.length > NOTE_MAX ? "The note is at most " + NOTE_MAX + " characters." : "";
    F.say("verify-e", wrong);
    if (wrong) { $("verify-f").setAttribute("aria-invalid", "true"); return; }
    $("verify-f").removeAttribute("aria-invalid");
    lock(true);
    H.call("POST", "finance/issuer/verify/", { issuer: id, note: note }).then(function (res) {
      lock(false);
      if (F.left(res)) return;
      if (res.ok) { dlg.close(false); loadIssuer("Issuer details verified."); return; }
      if (res.status === 409 && F.words(STALE, res.code)) { dlg.close(false); loadIssuer(STALE[res.code]); return; }
      if (res.status === 404) { dlg.close(false); loadIssuer("That profile is no longer there."); return; }
      F.say("verify-e", res.status === 400 && res.code === "invalid_request" ? "The note is at most " + NOTE_MAX + " characters." : LOST);
    });
  });

  /* ---- Add a book ---- */

  var BOOK = ["b-series", "b-from", "b-to", "b-width", "b-atp", "b-atpd", "b-printer"];
  $("book-open").addEventListener("click", function () {
    BOOK.forEach(function (id) { $(id).value = ""; });
    F.say("b-err", "");
    toggleForm("book-open", "f-book", $("f-book").hidden, "b-series");
  });
  $("b-cancel").addEventListener("click", function () { toggleForm("book-open", "f-book", false); });
  $("f-book").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    var v = {}, wrong = "", from, to, width;
    BOOK.forEach(function (id) { v[id] = String($(id).value || "").trim(); });
    if (!v["b-from"] || !v["b-to"] || !v["b-width"] || !v["b-atp"] || !v["b-atpd"] || !v["b-printer"]) wrong = "Fill in every required field.";
    else if (!/^\d{1,9}$/.test(v["b-from"]) || !/^\d{1,9}$/.test(v["b-to"]) || !/^\d{1,2}$/.test(v["b-width"])) wrong = "Serials and width are whole numbers.";
    else if (!isDate(v["b-atpd"])) wrong = "Authority date is YYYY-MM-DD.";
    else if (Number(v["b-to"]) < Number(v["b-from"])) wrong = "The last serial cannot be before the first.";
    else if (Number(v["b-width"]) < 1) wrong = "Serial width is at least 1.";
    F.say("b-err", wrong);
    if (wrong) return;
    from = Number(v["b-from"]); to = Number(v["b-to"]); width = Number(v["b-width"]);
    busy = true;
    $("b-go").disabled = true;
    H.call("POST", "finance/invoices/books/set/", { series: v["b-series"], serial_from: from, serial_to: to, serial_width: width,
      atp_reference: v["b-atp"], atp_date: v["b-atpd"], printer_name: v["b-printer"] }).then(function (res) {
      busy = false;
      $("b-go").disabled = false;
      if (F.left(res)) return;
      if (res.ok) {
        BOOK.forEach(function (id) { $(id).value = ""; });
        toggleForm("book-open", "f-book", false);
        loadBooks("Book added.");
        return;
      }
      if (res.status === 404) { loadBooks(); return; }
      if (res.status === 409 && F.words(BOOK_REFUSED, res.code)) { F.say("b-err", BOOK_REFUSED[res.code]); return; }
      F.say("b-err", res.status === 400 && res.code === "invalid_request" ? checkFields(res.fields) : LOST);
    });
  });

  /* Who is signed in comes from me/, the staff route that answers it; the Finance routes do not. */
  function start() {
    show("boot");
    if (known) { loadIssuer(""); return; }
    H.call("GET", "me/").then(function (res) {
      if (F.left(res)) return;
      if (!res.ok) { show("v-down"); return; }
      known = true;
      window.NOHqShell.signedIn(res.data.email);
      loadIssuer("");
    });
  }
  $("retry").addEventListener("click", start);
  start();
})();
