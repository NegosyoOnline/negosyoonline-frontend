/* The Finance page: an operator reviews bank transfer proofs (Billing Build B2a, ClickUp z8uq9me581).
   One address, two views: the queue, and one payment. Which payment is open is held in memory only, so a
   reload returns to the queue and no id is ever in an address. The page settles nothing and decides
   nothing about access: the backend does, and the page follows its answer. The user card and Sign out are
   shell.js's.
   The proof has no address. It is read through NOHq.file, held in this tab's memory, shown from an object
   address, and released when the payment is closed. Only the three exact types are ever shown or opened. */
(function () {
  var H = window.NOHq, $ = function (id) { return document.getElementById(id); };
  var TABS = ["submitted", "confirmed", "rejected", "replaced"];
  var VIEWS = ["boot", "v-queue", "v-pay", "v-closed", "v-down"];
  var STATUS = { submitted: ["Under review", "chip-warn"], confirmed: ["Confirmed", "chip-ok"],
    rejected: ["Rejected", "chip-neutral"], replaced: ["Replaced", "chip-neutral"] };
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
  var current = null, payRun = 0, proofUrl = null, pending = null, busy = false;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.setAttribute("class", cls);
    if (text != null) n.textContent = text;
    return n;
  }
  function show(view) { VIEWS.forEach(function (id) { $(id).hidden = id !== view; }); }
  function say(id, text) { $(id).textContent = text || ""; $(id).hidden = !text; }
  /* What an action answered. The message sits above the payment and the operator is at the forms below,
     so it is brought to the middle of the view, clear of the phone header: an answer nobody sees reads as a button that did nothing. */
  function tell(text) {
    var m = $("p-msg");
    say("p-msg", text);
    if (text && typeof m.scrollIntoView === "function") m.scrollIntoView({ block: "center" });
  }

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
    $("proof-pdf").removeAttribute("href");
    $("proof-img").hidden = true;
    $("proof-pdf").hidden = true;
    $("proof-err").hidden = true;
    $("proof-loading").hidden = true;
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
      if (kind === "pdf") { $("proof-pdf").setAttribute("href", proofUrl); $("proof-pdf").hidden = false; }
      else { $("proof-img").setAttribute("src", proofUrl); $("proof-img").hidden = false; }
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

  function resetActions() {
    pending = null;
    $("confirm-step").hidden = true;
    $("confirm-form").hidden = false;
    say("amount-err", "");
    $("amount").removeAttribute("aria-invalid");
    say("reject-err", "");
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
    list.textContent = "";
    (Array.isArray(d.history) ? d.history : []).forEach(function (e) {
      var what = words(EVENT, e && e.code), who = words(ACTOR, e && e.actor);
      if (what && who) list.appendChild(el("li", "event", what + " by " + who + ", " + H.when(e.at)));
    });
    resetActions();
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
    say("p-msg", "");
    $("amount").value = "";
    $("reason").value = "";
    $("note").value = "";
    $("p-body").hidden = true;
    $("p-loading").hidden = false;
    show("v-pay");
    readPayment(id, true);
  }

  function lock(on) {
    busy = on;
    ["confirm-go", "confirm-yes", "confirm-no", "reject-go"].forEach(function (id) { $(id).disabled = on; });
  }

  /* One decision at a time. done(res) handles what only that action answers. */
  function act(path, body, done) {
    var run = payRun, id = current.id;
    lock(true);
    say("p-msg", "");
    H.call("POST", "finance/payments/" + path, body).then(function (res) {
      lock(false);
      if (run !== payRun || left(res)) return;
      if (res.ok) { $("act").hidden = true; tell(done(res.data)); readPayment(id, false); return; }
      if (res.status === 404) { toQueue(""); return; }
      if (res.status === 409 && res.code === "not_under_review") { toQueue(GONE); return; }
      if (res.status === 400 && res.code === "invalid_request") { resetActions(); done(null); return; }
      resetActions();
      if (res.status === 409 && res.code === "amount_mismatch") {
        tell("That is not the amount due (" + money(current.amount_centavos) + "). If a different amount arrived, reject the proof.");
        return;
      }
      if (res.status === 409 && words(REFUSED, res.code)) {
        tell(REFUSED[res.code]);
        if (res.code === "plan_not_offered") $("reason").value = "duplicate";
        return;
      }
      tell(LOST);
      readPayment(id, false);
    });
  }

  function badAmount() { say("amount-err", AMOUNT); $("amount").setAttribute("aria-invalid", "true"); }

  $("confirm-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || !current) return;
    var amount = centavos($("amount").value);
    resetActions();
    if (amount === null) { badAmount(); return; }
    pending = amount;
    $("confirm-ask").textContent = "Confirm " + money(amount) + " received for " + ((current.site || {}).name || "") +
      "? This starts the paid period and cannot be undone.";
    $("confirm-form").hidden = true;
    $("confirm-step").hidden = false;
  });
  $("confirm-no").addEventListener("click", function () { if (!busy) resetActions(); });
  $("confirm-yes").addEventListener("click", function () {
    if (busy || !current || pending === null) return;
    act("confirm/", { payment: current.id, amount_received_centavos: pending }, function (paid) {
      if (!paid) { badAmount(); return ""; }
      return "Payment confirmed." + (paid.cycle ? " The paid period runs " + dayOf(paid.cycle.start_at) + " to " + dayOf(paid.cycle.end_at) + "." : "");
    });
  });

  $("reject-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || !current) return;
    var reason = $("reason").value, note = String($("note").value || "").trim();
    var wrong = !words(REASON, reason) ? "Choose a reason." : reason === "other" && !note ? "Write a note for this reason."
      : note.length > 300 ? "Keep the note to 300 characters." : "";
    say("reject-err", wrong);
    if (wrong) return;
    act("reject/", { payment: current.id, reason: reason, note: note }, function (rejected) {
      if (!rejected) { say("reject-err", "Check the reason and the note."); return ""; }
      return "Proof rejected. The Subscriber can send another.";
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
