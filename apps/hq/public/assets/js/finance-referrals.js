/* The Referrals page (Billing B6 FE-1, ClickUp z8uq9mkfpx, plan section 4.6). Read-only view of one account's referral
   code, referrer, referred businesses, Subscription Credit and ledger, plus one audited "Correct balance" action. Two routes,
   both POST with the path only: finance/referrals/view/ and finance/referrals/correct/. The page decides nothing: the backend
   does (404 while the programme is off, 409 exceeds_balance), and the page shows its refusals in words. Nothing is stored in
   the browser and no value is in an address. All wording is a draft for Coach Ed. */
(function () {
  var H = window.NOHq, F = window.NOFin, $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["boot", "v-main", "v-closed", "v-down"];
  var LOST = "That did not go through. Check the page before trying again.";
  var KIND = { earn: "Earned", reserve: "Held for a payment", release: "Released", apply: "Applied to a bill", reverse: "Reversed", correction: "Correction" };
  var ID_RE = /^acc_[A-Za-z0-9]{6,60}$/;
  var shown = null, busy = false, pending = null, requestId = "", known = false;
  var dlg = F.dialogs(function () { return busy; });

  function show(view) { VIEWS.forEach(function (id) { $(id).hidden = id !== view; }); }

  /* Centavos with a sign: "+PHP 1,000.00" or "-PHP 500.00". finance-common's money() refuses a negative. */
  function signed(c) {
    if (typeof c !== "number" || !isFinite(c) || c % 1 !== 0) return "";
    return (c < 0 ? "-" : "+") + F.money(Math.abs(c));
  }
  /* What a Staff user typed, in whole centavos with a sign, read as text; null when it is not an amount. */
  function typedCentavos(text) {
    var t = String(text == null ? "" : text).trim(), neg = t.charAt(0) === "-";
    if (neg || t.charAt(0) === "+") t = t.slice(1).trim();
    var c = F.centavos(t);
    return c === null ? null : (neg ? -c : c);
  }
  function freshId() {
    var c = window.crypto, bytes = new Uint8Array(16), out = "", i;
    if (c && c.getRandomValues) c.getRandomValues(bytes); else for (i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    for (i = 0; i < 16; i++) out += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    return out;
  }

  function row(list, line1, line2, line3) {
    var li = F.el("li", "batch"), main = F.el("div", "batch-main"), title = F.el("div", "batch-title");
    title.appendChild(F.el("span", "", line1));
    main.appendChild(title);
    if (line2) main.appendChild(F.el("span", "item-sub", line2));
    if (line3) main.appendChild(F.el("span", "small", line3));
    li.appendChild(main);
    list.appendChild(li);
  }

  function paint(d) {
    shown = d;
    $("r-result").hidden = false;
    $("r-id").textContent = d.account || "";
    $("r-code").textContent = d.referral_code || "";
    $("r-by").textContent = d.referred_by || "Nobody";
    $("r-bal").textContent = F.money(d.balance_centavos);
    $("r-res").textContent = F.money(d.reserved_centavos);
    $("r-earned").textContent = String(typeof d.earned_count === "number" ? d.earned_count : 0);
    var ref = $("r-referred"), led = $("r-ledger");
    ref.textContent = ""; led.textContent = "";
    (Array.isArray(d.referred) ? d.referred : []).forEach(function (r) {
      if (r && typeof r.account === "string") row(ref, r.account, "Joined " + F.dayOf(r.joined_at));
    });
    (Array.isArray(d.entries) ? d.entries : []).forEach(function (e) {
      if (!e || typeof e.id !== "number") return;
      row(led, (KIND[e.kind] || "Movement") + " " + signed(e.amount_centavos),
        F.stamp(e.recorded_at) + (e.payment ? " · Payment " + e.payment : "") + (e.operator ? " · By " + e.operator : ""),
        e.reason || "");
    });
    $("r-referred-empty").hidden = ref.children.length > 0;
    $("r-ledger-empty").hidden = led.children.length > 0;
  }

  function view(account, message) {
    F.say("r-err", ""); F.say("r-msg", "");
    $("r-account").removeAttribute("aria-invalid");
    $("r-go").disabled = true;
    H.call("POST", "finance/referrals/view/", { account: account }).then(function (res) {
      $("r-go").disabled = false;
      if (F.left(res)) return;
      if (res.status === 404) {
        /* One 404 answers both "switched off" and "no such account". */
        $("r-result").hidden = true; shown = null;
        F.say("r-err", "No account with that id, or referrals are not switched on.");
        $("r-account").setAttribute("aria-invalid", "true"); $("r-account").focus();
        return;
      }
      if (!res.ok) { F.say("r-err", LOST); return; }
      paint(res.data);
      F.say("r-msg", message || "");
    });
  }

  $("r-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = String($("r-account").value || "").trim();
    if (!ID_RE.test(v)) { F.say("r-err", "Enter an account id that starts with acc_."); $("r-account").setAttribute("aria-invalid", "true"); $("r-account").focus(); return; }
    view(v);
  });

  /* ---- Correct balance: step 1 the amount and the reason, step 2 the confirm ---- */
  function step(n) { $("fix-step1").hidden = n !== 1; $("fix-step2").hidden = n !== 2; }
  function lock(on) { busy = on; ["fix-go", "fix-back", "fix-x"].forEach(function (id) { $(id).disabled = on; }); }
  $("r-correct").addEventListener("click", function () {
    if (!shown || busy) return;
    $("fix-amount").value = ""; $("fix-reason").value = ""; pending = null; requestId = freshId();
    F.say("fix-err", ""); F.say("fix-err2", ""); step(1);
    $("fix-sub").textContent = shown.account + " · balance " + F.money(shown.balance_centavos);
    dlg.open("m-fix", $("r-correct"), $("fix-amount"));
  });
  ["fix-x", "fix-cancel"].forEach(function (id) { $(id).addEventListener("click", function () { if (!busy) dlg.close(true); }); });
  $("fix-back").addEventListener("click", function () { if (!busy) { F.say("fix-err2", ""); step(1); $("fix-amount").focus(); } });
  $("fix-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || !shown) return;
    if ($("fix-step1").hidden) { send(); return; }
    var c = typedCentavos($("fix-amount").value), reason = String($("fix-reason").value || "").trim(), bad = [];
    if (c === null) bad.push("Enter an amount in pesos, such as 500 or -500.50.");
    if (!reason) bad.push("A reason is required.");
    F.say("fix-err", bad.join(" "));
    $("fix-amount").setAttribute("aria-invalid", String(c === null));
    $("fix-reason").setAttribute("aria-invalid", String(!reason));
    if (bad.length) { (c === null ? $("fix-amount") : $("fix-reason")).focus(); return; }
    var after = shown.balance_centavos + c;
    if (after < 0) { F.say("fix-err", "That is more than the spendable balance (" + F.money(shown.balance_centavos) + "). Use a smaller amount."); $("fix-amount").setAttribute("aria-invalid", "true"); $("fix-amount").focus(); return; }
    pending = { amount_centavos: c, reason: reason };
    $("fix-sum").textContent = (c < 0 ? "Take " + F.money(-c) + " away from" : "Add " + F.money(c) + " to") + " the Subscription Credit of " + shown.account +
      ". Balance now " + F.money(shown.balance_centavos) + ", after this correction " + F.money(after) + ". Reason: " + reason;
    F.say("fix-err2", ""); step(2); $("fix-go").focus();
  });
  function send() {
    if (!pending) return;
    lock(true);
    H.call("POST", "finance/referrals/correct/", { account: shown.account, amount_centavos: pending.amount_centavos, reason: pending.reason, request_id: requestId }).then(function (res) {
      lock(false);
      if (F.left(res)) return;
      if (res.ok) { dlg.close(false); view(shown.account, "Correction recorded. Balance is now " + F.money(res.data.balance_centavos) + "."); return; }
      if (res.status === 409 && res.code === "exceeds_balance") { F.say("fix-err2", "That is more than the spendable balance. Use a smaller amount."); return; }
      if (res.status === 409 && res.code === "reference_reused") { F.say("fix-err2", "This request was already used for another account. Close this and start again."); return; }
      F.say("fix-err2", res.status === 404 ? "That account or the switch is no longer there." : LOST);
    });
  }

  function start() {
    show("boot");
    if (known) { show("v-main"); return; }
    H.call("GET", "me/").then(function (res) {
      if (F.left(res)) return;
      if (!res.ok) { show("v-down"); return; }
      known = true;
      window.NOHqShell.signedIn(res.data.email);
      show("v-main");
    });
  }
  $("retry").addEventListener("click", start);
  start();
})();
