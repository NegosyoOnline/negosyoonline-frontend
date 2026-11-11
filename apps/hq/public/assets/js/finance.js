/* The Finance page: an operator reviews bank transfer proofs (Billing Build B2a, ClickUp z8uq9me581).
   One address, two views: the queue, and one payment. Which payment is open is held in memory only, so a
   reload returns to the queue and no id is ever in an address. The page settles nothing and decides
   nothing about access: the backend does, and the page follows its answer. The user card and Sign out are
   shell.js's.
   The proof has no address. It is read through NOHq.file, held in this tab's memory, shown from an object
   address, and released when the payment is closed. Only the three exact types are ever shown or opened.
   The Preview button opens that same held object in a new tab: no second call, no second audited view.
   Confirm and Reject each open a dialog; Confirm keeps a progress bar up for two seconds at least. */
(function () {
  var H = window.NOHq, $ = function (id) { return document.getElementById(id); };
  var TABS = ["submitted", "confirmed", "rejected", "replaced"];
  var VIEWS = ["boot", "v-queue", "v-pay", "v-closed", "v-down"];
  var STATUS = { submitted: ["Under review", "chip-warn"], confirmed: ["Confirmed", "chip-ok"],
    rejected: ["Rejected", "chip-err"], replaced: ["Replaced", "chip-neutral"] };
  var REASON = { unreadable: "The proof cannot be read", amount_mismatch: "The amount is not the amount due",
    not_received: "The money has not arrived", wrong_account: "Sent to a different account",
    duplicate: "This payment was already counted", other: "Another reason (write a note)" };
  /* A history line or an actor this page has no words for is left out: a raw value is never shown. */
  var EVENT = { submitted: "Submitted", confirmed: "Confirmed", rejected: "Rejected", replaced: "Replaced" };
  var ACTOR = { owner: "the Subscriber", operator: "an operator" };
  var REFUSED = {
    plan_not_offered: "This site already used the Launch Promo. Reject this proof.",
    cancel_scheduled: "This subscription is cancelled and its paid period is still running. It cannot be paid for now.",
    paid_ahead: "The next period of this site is already paid.",
    past_deletion_date: "This site is past its deletion date and can no longer be paid for.",
    billing_exempt: "This site is exempt from billing.",
    invalid_transition: "This subscription cannot take a payment in its current state." };
  var GONE = "This payment is no longer under review. It was decided or replaced by a newer proof.";
  var LOST = "That did not go through. Check the payment before trying again.";
  var AMOUNT = "Enter the amount received, for example 4,999.00.";
  var SHOWN = { "image/jpeg": "img", "image/png": "img", "application/pdf": "pdf" };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var known = false;      /* the backend has said who is signed in */
  var tab = "submitted", cursor = null, listRun = 0;
  var current = null, payRun = 0, proofUrl = null, busy = false, opener = null, dialog = null;
  var HOLD = 2000;        /* how long Confirm's progress bar runs at least, in milliseconds */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.setAttribute("class", cls);
    if (text != null) n.textContent = text;
    return n;
  }
  function show(view) { VIEWS.forEach(function (id) { $(id).hidden = id !== view; }); }
  function say(id, text) { $(id).textContent = text || ""; $(id).hidden = !text; }
  /* "PHP 4,999.00" from whole centavos, or "" for anything else. */
  function money(c) {
    if (typeof c !== "number" || !isFinite(c) || c < 0 || c % 1 !== 0) return "";
    var cents = String(c % 100);
    return "PHP " + String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + (cents.length < 2 ? "0" : "") + cents;
  }
  /* What was typed, in whole centavos, read as text and never through a decimal number. Pesos with at
     most two decimals; commas only where thousands are. Anything else, and zero, is null. */
  function centavos(typed) {
    var m = /^(\d{1,9}|\d{1,3}(?:,\d{3}){1,2})(?:\.(\d{1,2}))?$/.exec(String(typed == null ? "" : typed).trim());
    if (!m) return null;
    var value = Number(m[1].replace(/,/g, "")) * 100 + Number(((m[2] || "") + "00").slice(0, 2));
    return value > 0 ? value : null;
  }
  /* "20 Nov 2026" from a date with no time, as the bank wrote it. */
  function day(date) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
    return m && MONTHS[Number(m[2]) - 1] ? Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1] : "";
  }
  /* The Manila date of a time. */
  function dayOf(iso) { return H.when(iso).split(",")[0]; }
  function waited(iso) {
    var ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms) || ms < 0) return "";
    var n = ms < 3600000 ? [Math.max(1, Math.floor(ms / 60000)), "minute"] : ms < 86400000 ? [Math.floor(ms / 3600000), "hour"]
      : [Math.floor(ms / 86400000), "day"];
    return n[0] + " " + n[1] + (n[0] === 1 ? "" : "s");
  }
  function words(map, key) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : ""; }

  /* True when the answer sent the person to sign in or to the second step. */
  function left(res) {
    var place = H.placeFor(res);
    if (place === "verify") { location.replace("/verify/"); return true; }
    if (place === "sign-in") { location.replace("/sign-in/"); return true; }
    return false;
  }

  /* ---- the queue ---- */

  function row(p) {
    var li = el("li", "batch"), main = el("div", "batch-main"), title = el("div", "batch-title"), end = el("div", "batch-end");
    var review = p.status === "submitted", wait = review ? waited(p.submitted_at) : "";
    var b = el("button", "no-btn no-btn-ghost", review ? "Review" : "View");
    var site = p.site || {}, plan = p.plan || {};
    title.appendChild(el("span", "", site.name || ""));
    if (wait) title.appendChild(el("span", "chip chip-warn", "Waiting " + wait));
    main.appendChild(title);
    main.appendChild(el("span", "item-sub", (plan.name || "") + " · " + money(p.amount_centavos)));
    main.appendChild(el("span", "small", "Transferred " + day(p.transferred_on) + " · Submitted " + H.when(p.submitted_at)));
    b.setAttribute("type", "button");
    b.addEventListener("click", function () { openPayment(p.id); });
    end.appendChild(b);
    li.appendChild(main);
    li.appendChild(end);
    return li;
  }

  function loadQueue(more) {
    var run = ++listRun, body = { status: tab };
    if (more && cursor) body.cursor = cursor;
    if (!more) {
      $("rows").textContent = "";
      $("q-empty").hidden = true;
      $("more-row").hidden = true;
      $("q-loading").hidden = false;
    }
    $("more").disabled = true;
    H.call("POST", "finance/payments/list/", body).then(function (res) {
      if (run !== listRun) return;
      $("q-loading").hidden = true;
      $("more").disabled = false;
      if (left(res)) return;
      if (res.status === 404) { show("v-closed"); return; }
      if (!res.ok) { show("v-down"); return; }
      var d = res.data, items = Array.isArray(d.items) ? d.items : [];
      items.forEach(function (p) { if (p && typeof p.id === "string") $("rows").appendChild(row(p)); });
      cursor = typeof d.next_cursor === "string" && d.next_cursor ? d.next_cursor : null;
      if (typeof d.under_review_count === "number") $("tab-submitted").textContent = "Under review (" + d.under_review_count + ")";
      $("more-row").hidden = !cursor;
      say("q-empty", $("rows").children.length ? "" : tab === "submitted" ? "No payments are waiting for review." : "No payments here yet.");
      show("v-queue");
    });
  }

  function toQueue(message) {
    payRun++;
    closeProof();
    current = null;
    say("q-msg", message);
    show("v-queue");
    loadQueue(false);
  }

  /* ---- one payment ---- */

  function closeProof() {
    if (proofUrl) URL.revokeObjectURL(proofUrl);
    proofUrl = null;
    $("proof-img").removeAttribute("src");
    $("proof-preview").removeAttribute("href");
    ["proof-img", "proof-file", "proof-preview", "proof-err", "proof-loading"].forEach(function (id) { $(id).hidden = true; });
  }

  function loadProof(id, run) {
    closeProof();
    $("proof-loading").hidden = false;
    H.file("finance/payments/proof/", { payment: id }).then(function (res) {
      if (run !== payRun) return;
      $("proof-loading").hidden = true;
      if (left(res)) return;
      var kind = res.ok && res.blob ? words(SHOWN, res.blob.type) : "";
      if (!kind) { $("proof-err").hidden = false; return; }
      proofUrl = URL.createObjectURL(res.blob);
      /* A PDF is not drawn in the page (the CSP allows no frame or object): it is a file tile. Both open from the held object. */
      if (kind === "pdf") $("proof-file").hidden = false;
      else { $("proof-img").setAttribute("src", proofUrl); $("proof-img").hidden = false; }
      $("proof-preview").setAttribute("href", proofUrl);
      $("proof-preview").hidden = false;
    });
  }

  function decided(d) {
    var by = (d.decided_by || "") + ", " + H.when(d.decided_at) + ".";
    if (d.status === "confirmed") {
      return "Confirmed by " + by + (d.cycle ? " Paid period: " + dayOf(d.cycle.start_at) + " to " + dayOf(d.cycle.end_at) + "." : "");
    }
    if (d.status === "rejected") {
      return "Rejected by " + by + " Reason: " + words(REASON, d.reject_reason) + "." + (d.reject_note ? " " + d.reject_note : "");
    }
    return d.status === "replaced" ? "The Subscriber sent a newer proof." : "";
  }

  function paint(d) {
    var status = STATUS[d.status] || ["", "chip-neutral"], site = d.site || {}, plan = d.plan || {}, list = $("history");
    current = d;
    $("p-site").textContent = site.name || "";
    $("p-site-id").textContent = site.id || "";
    $("p-status").textContent = status[0];
    $("p-status").setAttribute("class", "chip " + status[1]);
    $("p-amount").textContent = money(d.amount_centavos);
    $("p-plan").textContent = (plan.name || "") + ", " + plan.months + (plan.months === 1 ? " month" : " months");
    $("p-date").textContent = day(d.transferred_on);
    $("p-ref").textContent = d.transfer_reference || "Not given";
    $("p-submitted").textContent = H.when(d.submitted_at);
    $("p-email").textContent = d.subscriber_email || "";
    say("p-decided", decided(d));
    $("p-decided").setAttribute("class", d.status === "rejected" ? "dash-copy is-rejected" : "dash-copy");
    list.textContent = "";
    (Array.isArray(d.history) ? d.history : []).forEach(function (e) {
      var what = words(EVENT, e && e.code), who = words(ACTOR, e && e.actor);
      if (what && who) list.appendChild(el("li", "event", what + " by " + who + ", " + H.when(e.at)));
    });
    $("act").hidden = d.status !== "submitted";
    $("p-loading").hidden = true;
    $("p-body").hidden = false;
  }

  /* Reads the payment. first: it was just opened, so its proof is read too, once. */
  function readPayment(id, first) {
    var run = payRun;
    H.call("POST", "finance/payments/detail/", { payment: id }).then(function (res) {
      if (run !== payRun || left(res)) return;
      if (res.status === 404) { toQueue(""); return; }
      if (!res.ok) { if (first) show("v-down"); return; }
      paint(res.data);
      if (first) loadProof(id, run);
    });
  }

  function openPayment(id) {
    payRun++;
    closeProof();
    current = null;
    $("p-body").hidden = true;
    $("p-loading").hidden = false;
    show("v-pay");
    readPayment(id, true);
  }

  /* ---- the two dialogs ---- */

  function focusables(box) {
    return box.all(function (n) { return (n.tagName === "INPUT" || n.tagName === "SELECT" || n.tagName === "TEXTAREA" || n.tagName === "BUTTON") && !n.disabled && !n.hidden; });
  }
  function inside(box, n) { for (; n; n = n.parentNode) if (n === box) return true; return false; }
  function onKey(e) {
    if (!dialog) return;
    if (e.key === "Escape") { if (!busy) closeDialog(true); return; }
    if (e.key !== "Tab") return;
    var f = focusables(dialog), first = f[0], last = f[f.length - 1], at = document.activeElement;
    if (!f.length) { e.preventDefault(); return; }
    if (!inside(dialog, at)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  }
  function openDialog(id, from, first) {
    opener = from;
    dialog = $(id);
    dialog.hidden = false;
    document.body.classList.add("modal-open");
    document.addEventListener("keydown", onKey);
    first.focus();
  }
  /* refocus: put focus back on the button that opened it (not when the payment is gone). */
  function closeDialog(refocus) {
    if (!dialog) return;
    dialog.hidden = true;
    dialog = null;
    document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", onKey);
    if (refocus && opener && !$("act").hidden) opener.focus();
  }
  /* A dialog closes by its X or by Escape only. A click on the backdrop does nothing. */

  function lock(on) {
    busy = on;
    ["confirm-go", "confirm-x", "reject-go", "reject-x"].forEach(function (id) { $(id).disabled = on; });
  }

  /* One decision at a time. where.fail(text) shows a message in the open dialog; where.field() in the field it is about.
     hold: the least time, in milliseconds, the dialog stays busy when the backend says yes. A refusal never waits. */
  function act(path, body, hold, where, ok) {
    var run = payRun, id = current.id, wait = hold ? new Promise(function (go) { setTimeout(go, hold); }) : Promise.resolve();
    lock(true);
    where.bar(true);
    where.fail("");
    H.call("POST", "finance/payments/" + path, body).then(function (res) {
      function stop() { lock(false); where.bar(false); }
      if (run !== payRun) { stop(); return; }
      if (left(res)) return;
      if (res.ok) {
        wait.then(function () {
          stop();
          if (run !== payRun) return;
          closeDialog(false);
          toQueue(ok(res.data));
        });
        return;
      }
      stop();
      if (res.status === 404) { closeDialog(false); toQueue(""); return; }
      if (res.status === 409 && res.code === "not_under_review") { closeDialog(false); toQueue(GONE); return; }
      if (res.status === 400 && res.code === "invalid_request") { where.field(); return; }
      if (res.status === 409 && res.code === "amount_mismatch") {
        where.fail("That is not the amount due (" + money(current.amount_centavos) + "). If a different amount arrived, reject the proof.");
        return;
      }
      if (res.status === 409 && words(REFUSED, res.code)) {
        where.fail(REFUSED[res.code]);
        if (res.code === "plan_not_offered") $("reason").value = "duplicate";
        return;
      }
      where.fail(LOST);
      readPayment(id, false);
    });
  }

  /* Confirm payment */
  function badAmount() { say("amount-err", AMOUNT); $("amount").setAttribute("aria-invalid", "true"); }
  var CONFIRM = {
    bar: function (on) { $("confirm-bar").hidden = !on; },
    fail: function (text) { say("confirm-err", text); },
    field: badAmount
  };
  $("open-confirm").addEventListener("click", function () {
    if (busy || !current) return;
    $("amount").value = "";
    $("amount").removeAttribute("aria-invalid");
    say("amount-err", "");
    say("confirm-err", "");
    $("confirm-bar").hidden = true;
    $("mc-sub").textContent = ((current.site || {}).name || "") + " · amount due " + money(current.amount_centavos);
    openDialog("m-confirm", $("open-confirm"), $("amount"));
  });
  $("confirm-x").addEventListener("click", function () { if (!busy) closeDialog(true); });
  $("confirm-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || !current) return;
    var amount = centavos($("amount").value), site = (current.site || {}).name || "";
    say("confirm-err", "");
    say("amount-err", "");
    $("amount").removeAttribute("aria-invalid");
    if (amount === null) { badAmount(); return; }
    act("confirm/", { payment: current.id, amount_received_centavos: amount }, HOLD, CONFIRM, function (paid) {
      return "Payment confirmed: " + money(amount) + " received for " + site + "." +
        (paid && paid.cycle ? " The paid period runs " + dayOf(paid.cycle.start_at) + " to " + dayOf(paid.cycle.end_at) + "." : "");
    });
  });

  /* Reject payment */
  var REJECT = {
    bar: function () {},
    fail: function (text) { say("reject-err", text); },
    field: function () { say("reject-err", "Check the reason and the note."); }
  };
  $("open-reject").addEventListener("click", function () {
    if (busy || !current) return;
    $("reason").value = "";
    $("note").value = "";
    say("reject-err", "");
    $("mr-sub").textContent = (current.site || {}).name || "";
    openDialog("m-reject", $("open-reject"), $("reason"));
  });
  $("reject-x").addEventListener("click", function () { if (!busy) closeDialog(true); });
  $("reject-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || !current) return;
    var reason = $("reason").value, note = String($("note").value || "").trim();
    var wrong = !words(REASON, reason) ? "Choose a reason." : reason === "other" && !note ? "Write a note for this reason."
      : note.length > 300 ? "Keep the note to 300 characters." : "";
    say("reject-err", wrong);
    if (wrong) return;
    act("reject/", { payment: current.id, reason: reason, note: note }, 0, REJECT, function () {
      return "Payment rejected. The Subscriber can send another.";
    });
  });

  $("back").addEventListener("click", function (e) { e.preventDefault(); toQueue(""); });
  $("proof-retry").addEventListener("click", function () { if (current) loadProof(current.id, payRun); });
  $("more").addEventListener("click", function () { if (cursor) loadQueue(true); });
  TABS.forEach(function (name) {
    $("tab-" + name).addEventListener("click", function () {
      tab = name;
      TABS.forEach(function (t) { $("tab-" + t).setAttribute("aria-pressed", String(t === name)); });
      say("q-msg", "");
      loadQueue(false);
    });
  });

  /* Who is signed in comes from me/, the staff route that answers it; the Finance routes do not. */
  function start() {
    show("boot");
    if (known) { loadQueue(false); return; }
    H.call("GET", "me/").then(function (res) {
      if (left(res)) return;
      if (!res.ok) { show("v-down"); return; }
      known = true;
      window.NOHqShell.signedIn(res.data.email);
      loadQueue(false);
    });
  }
  $("retry").addEventListener("click", start);
  TABS.forEach(function (t) { $("tab-" + t).setAttribute("aria-pressed", String(t === tab)); });

  window.NOFinance = { centavos: centavos, money: money };
  start();
})();
