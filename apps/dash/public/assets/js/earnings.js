/* Earnings (/earnings/, Santé MVP E8 design S1 to S5): member withdrawal requests for one store. Reads GET /sites/,
   GET /sites/{id}/withdrawals/?status=..., GET /sites/{id}/withdrawals/{wid}/; writes POST .../pay/ and .../reject/.
   Until the Subscriber mobile is verified the list is replaced by the blocking mobile task over the E1 routes
   GET /account/mobile/, POST /account/mobile/start/ and /account/mobile/verify/ (Account-level: one mobile opens every
   store). Every figure and state comes from the API; the browser computes nothing it sends. Plain ES5; API strings
   reach the page through textContent or D.el only; no storage key. The manual earning reversal stays API-only. */
(function () {
  var D = window.NODash;
  var SITE_RE = /^[1-9][0-9]{0,9}$/;
  var FILTERS = [["pending", "Pending"], ["paid", "Paid"], ["rejected", "Rejected"], ["all", "All"]];
  var EMPTY = { pending: "No pending withdrawal requests.", paid: "No paid withdrawal requests.",
                rejected: "No rejected withdrawal requests.", all: "No withdrawal requests yet." };
  var token = 0, site = null, filter = "pending", closeDialog = null, last = null;

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(p) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) p.appendChild(arguments[i]); } return p; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function root() { return byId("wd-root"); }
  function say(t) { var l = byId("wd-live"); if (l) l.textContent = t; }
  function msg(res, fb) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fb; }
  function money(s) { var n = parseFloat(s); return isFinite(n) ? "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""; }
  function busy(b, on) { if (!b) return; if (on) { b.setAttribute("aria-busy", "true"); b.disabled = true; } else { b.removeAttribute("aria-busy"); b.disabled = false; } }
  function btn(label, kind, fn) {
    var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost"), label);
    b.setAttribute("type", "button");
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function base() { return "/sites/" + site + "/withdrawals/"; }

  /* The Payments popup pattern (payments.js:35-57): focus stays inside, Escape closes, focus returns to the opener. */
  function dialog(id, titleText, opener, fill) {
    if (closeDialog) closeDialog(false);
    var slot = byId("wd-dialog-slot"), overlay = h("div", "pm-overlay"), dlg = h("div", "pm-dialog"), title = h("h2", "pm-h2", titleText);
    title.setAttribute("id", "wd-h-" + id);
    dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "wd-h-" + id);
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(true); return; }
      if (e.key !== "Tab") return;
      var items = Array.prototype.filter.call(dlg.querySelectorAll("input, textarea, button"), function (n) { return !n.disabled && n.tabIndex >= 0 && n.offsetParent !== null; });
      if (!items.length) return;
      var first = items[0], lastItem = items[items.length - 1], now = document.activeElement;
      if (e.shiftKey && (now === first || items.indexOf(now) < 0)) { e.preventDefault(); lastItem.focus(); }
      else if (!e.shiftKey && (now === lastItem || items.indexOf(now) < 0)) { e.preventDefault(); first.focus(); }
    }
    function close(returnFocus) {
      if (closeDialog !== close) return;
      closeDialog = null; document.removeEventListener("keydown", onKey); clear(slot);
      if (returnFocus && opener && opener.focus) opener.focus();
    }
    closeDialog = close;
    add(dlg, title); fill(dlg, close);
    add(slot, add(overlay, dlg));
    document.addEventListener("keydown", onKey);
    var f = dlg.querySelector("input, textarea, button"); if (f) f.focus();
  }

  /* ---- S5: the blocking mobile task (Account-level E1 API) ---- */
  function mobileTask(mine) {
    var card = h("section", "wd-task"); card.setAttribute("aria-labelledby", "wd-h-mobile");
    var head = h("h2", "pm-h2", "Withdrawals are not open"); head.setAttribute("id", "wd-h-mobile");
    var lead = h("p", "", "Add and verify your mobile number to open withdrawals for your members. Your members' earnings are kept and keep counting.");
    var input = D.el("input", { id: "wd-mobile", name: "mobile" });
    var c = window.NOContact.group("phone", input, "wd-mobile");
    var lab = D.el("label", { "for": "wd-mobile" }, "Mobile number");
    var err = h("p", "wd-error"); err.setAttribute("role", "alert"); err.hidden = true;
    var codeBox = h("div", "wd-field"); codeBox.hidden = true;
    var code = D.el("input", { id: "wd-code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6" });
    add(codeBox, D.el("label", { "for": "wd-code" }, "6-digit code"), code);
    function problem(t) { err.textContent = t || ""; err.hidden = !t; }
    var send = btn("Send code", "primary", function (b) {
      problem(""); busy(b, true);
      D.call("POST", "/account/mobile/start/", { mobile: window.NOContact.phoneValue(input.value) }, true).then(function (res) {
        busy(b, false);
        if (mine !== token) return;
        if (res.status === 404) { problem("Adding a mobile number is not available yet."); return; }
        if (!res.ok) { problem(msg(res, "That did not work. Check the number and try again.")); return; }
        codeBox.hidden = false; verify.hidden = false; code.focus(); say("Code sent.");
      });
    });
    var verify = btn("Verify", "primary", function (b) {
      problem(""); busy(b, true);
      D.call("POST", "/account/mobile/verify/", { code: code.value.replace(/\D/g, "") }, true).then(function (res) {
        busy(b, false);
        if (mine !== token) return;
        if (!res.ok) { problem(msg(res, "That code did not work. Please try again.")); return; }
        D.toast("Mobile verified", "Withdrawals are now open on your stores.");
        load(++token); /* E8-8: re-read; the list replaces the task */
      });
    });
    verify.hidden = true;
    add(card, head, lead, add(h("div", "wd-field"), lab, c.group, c.hint), codeBox, err, add(h("div", "pm-actions"), send, verify));
    clear(root()).appendChild(card);
  }

  /* ---- S1: figures, filter chips and rows ---- */
  function figures(f) {
    var box = h("div", "wd-figs");
    [["Member earnings owed", money(f.member_earnings_owed), "Available and unpaid"],
     ["Pending member earnings", money(f.pending_member_earnings), "Not yet available for withdrawal"],
     ["Pending withdrawals", String(f.withdrawals_to_pay), "Waiting for your payment"]].forEach(function (t) {
      add(box, add(h("section", "wd-fig"), h("h2", "", t[0]), h("p", "", t[1]), h("span", "", t[2])));
    });
    return box;
  }
  function chips() {
    var box = h("div", "wd-chips"); box.setAttribute("role", "group"); box.setAttribute("aria-label", "Filter requests");
    FILTERS.forEach(function (f) {
      var b = btn(f[1], "ghost", function () { filter = f[0]; load(++token); });
      b.className = ""; b.setAttribute("aria-pressed", f[0] === filter ? "true" : "false");
      box.appendChild(b);
    });
    return box;
  }
  function holdNote(w) {
    var hd = w.hold;
    if (!hd) return null;
    if (hd.blocks && hd.blocks.indexOf("record_payout") >= 0) return h("p", "wd-hold", "Paused until " + hd.ends_display + " (security hold). Pay and reject are paused; the request stays as it is.");
    return h("p", "wd-hold", "Payout account changed; new requests paused until " + hd.ends_display + ". You can pay this request.");
  }
  function row(w) {
    var li = h("li", "wd-row");
    var left = add(h("div"), h("strong", "", w.member.name),
      h("p", "wd-meta", money(w.requested) + " requested · " + money(w.net) + " to pay · " + w.destination.masked),
      h("p", "wd-meta", "Requested " + (D.date(w.created_at) || "")));
    var chip = h("span", "chip " + (w.status === "paid" ? "chip-ok" : w.status === "rejected" ? "chip-danger" : "chip-warn"),
      w.status === "paid" ? "Paid" : w.status === "rejected" ? "Rejected" : "Pending");
    var open = btn("Open", "ghost", function (b) { detail(w.id, b); });
    add(li, left, add(h("div"), chip, open), holdNote(w));
    return li;
  }
  function list(data) {
    last = data;
    var box = clear(root());
    add(box, figures(data.figures), chips());
    var rows = data.withdrawals || [];
    if (!rows.length) { box.appendChild(h("p", "wd-meta", EMPTY[filter])); say(EMPTY[filter]); return; }
    var ul = h("ul", "wd-list");
    rows.forEach(function (w) { ul.appendChild(row(w)); });
    box.appendChild(ul);
    say(rows.length + (rows.length === 1 ? " request" : " requests"));
  }

  /* ---- S2: detail and Pay; S3: Reject ---- */
  function facts(w) {
    var dl = h("dl", "wd-facts"), d = w.destination;
    [["Member", w.member.name], ["Requested amount", money(w.requested)], ["Fee you keep when paid", money(w.fee)],
     ["Net payout to send", money(w.net)], ["Payout account", d.kind === "gcash" ? "GCash" : "Bank account"],
     ["Bank", d.kind === "bank" ? d.bank_name : ""], ["Account name", d.account_name], ["Account number", d.account_number],
     ["Requested on", D.date(w.created_at) || ""]].forEach(function (f) {
      if (!f[1]) return;
      add(dl, h("dt", "", f[0]), h("dd", "", f[1]));
    });
    return dl;
  }
  function detail(wid, opener) {
    busy(opener, true);
    D.call("GET", base() + wid + "/", null, true).then(function (res) {
      busy(opener, false);
      if (!res.ok) { D.toast("That did not work", msg(res, "Try again."), "error"); return; }
      var w = res.data;
      dialog("detail", "Withdrawal request", opener, function (dlg, close) {
        add(dlg, facts(w), h("p", "wd-caution", "Pay the account shown here. It is the account the member confirmed for this request, even if they changed it later."));
        if (w.status === "paid") { dlg.appendChild(h("p", "", "Paid " + (D.date(w.paid_at) || "") + " · Reference " + w.payment_reference)); }
        if (w.status === "rejected") { dlg.appendChild(h("p", "", "Rejected: " + (w.reject_reason === "other" ? w.other_text : w.reason_label))); }
        if (w.status !== "pending") { dlg.appendChild(add(h("div", "pm-actions"), btn("Close", "ghost", function () { close(true); }))); return; }
        var blocked = w.hold && w.hold.blocks && w.hold.blocks.indexOf("record_payout") >= 0;
        var ref = D.el("input", { id: "wd-ref", maxlength: "100", autocomplete: "off" });
        var err = h("p", "wd-error"); err.setAttribute("role", "alert"); err.hidden = true;
        var pay = btn("Record payment", "primary", function (b) {
          err.hidden = true;
          if (!ref.value.trim()) { err.textContent = "Enter the payment reference."; err.hidden = false; ref.focus(); return; }
          if (b.getAttribute("data-confirm") !== "1") { b.setAttribute("data-confirm", "1"); b.textContent = "Confirm paid " + money(w.net); return; }
          busy(b, true);
          D.call("POST", base() + wid + "/pay/", { state_version: w.state_version, payment_reference: ref.value }, true).then(function (r) {
            busy(b, false);
            if (!r.ok) { err.textContent = msg(r, "That did not work."); err.hidden = false; if (r.status === 409) load(++token); return; }
            close(false); D.toast("Payment recorded", money(w.net) + " to " + w.destination.masked); load(++token);
          });
        });
        var rej = btn("Reject", "ghost", function () { close(false); reject(w, opener); });
        if (blocked) { /* spec r5: the R-R1 recovery hold blocks pay and reject; the server refuses both regardless */
          pay.disabled = true; rej.disabled = true;
          dlg.appendChild(h("p", "wd-hold", "Paused until " + w.hold.ends_display + " (security hold). Pay and reject are paused."));
        }
        add(dlg, add(h("div", "wd-field"), D.el("label", { "for": "wd-ref" }, "Payment reference"), ref), err,
          add(h("div", "pm-actions"), pay, rej, btn("Cancel", "ghost", function () { close(true); })));
      });
    });
  }
  function reject(w, opener) {
    dialog("reject", "Reject this request", opener, function (dlg, close) {
      var reasons = (last && last.reasons) || [];
      var fs = h("fieldset", "wd-reasons"); fs.appendChild(h("legend", "", "Reason (the member sees it)"));
      reasons.forEach(function (r) {
        var id = "wd-r-" + r.code, input = D.el("input", { type: "radio", name: "wd-reason", id: id, value: r.code });
        fs.appendChild(add(D.el("label", { "for": id }), input, h("span", "", r.label)));
      });
      var other = D.el("textarea", { id: "wd-other", maxlength: "500", rows: "3" });
      var err = h("p", "wd-error"); err.setAttribute("role", "alert"); err.hidden = true;
      var go = btn("Reject request", "primary", function (b) {
        var chosen = dlg.querySelector("input[name='wd-reason']:checked");
        err.hidden = true;
        if (!chosen) { err.textContent = "Choose a reason."; err.hidden = false; return; }
        if (chosen.value === "other" && !other.value.trim()) { err.textContent = "Explain the reason."; err.hidden = false; other.focus(); return; }
        busy(b, true);
        D.call("POST", base() + w.id + "/reject/", { state_version: w.state_version, reason: chosen.value, other_text: other.value }, true).then(function (r) {
          busy(b, false);
          if (!r.ok) { err.textContent = msg(r, "That did not work."); err.hidden = false; if (r.status === 409) load(++token); return; }
          close(false); D.toast("Request rejected", "The full amount is back in the member's balance. No fee was charged."); load(++token);
        });
      });
      add(dlg, fs, add(h("div", "wd-field"), D.el("label", { "for": "wd-other" }, "Explanation (required for Other)"), other),
        h("p", "wd-caution", (last && last.caution) || ""), err,
        add(h("div", "pm-actions"), go, btn("Cancel", "ghost", function () { close(true); })));
    });
  }

  /* ---- load ---- */
  function fail(res) {
    var box = clear(root());
    box.appendChild(h("p", "wd-error", res.status === 403 ? "This store is limited to Billing right now." : "That did not work. Check your connection and try again."));
    box.appendChild(btn("Try again", "ghost", function () { load(++token); }));
  }
  function load(mine) {
    if (mine !== token) return;
    root().setAttribute("aria-busy", "true");
    D.call("GET", base() + "?status=" + filter, null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      root().removeAttribute("aria-busy");
      if (!res.ok) { fail(res); return; }
      if (!res.data.subscriber_mobile_verified) { mobileTask(mine); return; }
      list(res.data);
    });
  }
  function show() {
    var mine = ++token;
    clear(root()).appendChild(h("p", "wd-meta", "Loading withdrawal requests…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      var sites = ((res.data && res.data.sites) || []).filter(function (s) { return s.template === "sante"; });
      if (!res.ok || !sites.length) { clear(root()).appendChild(h("p", "wd-meta", "Earnings are not available for this account yet.")); return; }
      var ids = sites.map(function (s) { return s.id; });
      var m = /[?&]site=([^&#]*)/.exec(location.search);
      site = m && SITE_RE.test(m[1]) && ids.indexOf(parseInt(m[1], 10)) >= 0 ? parseInt(m[1], 10) : ids[0];
      load(mine);
    });
  }
  function hide() { token++; say(""); if (closeDialog) closeDialog(false); }

  /* ---- S5 on Overview: one strip while the Subscriber mobile is not verified and the account has a Santé store ---- */
  function overviewNote(wrap) {
    D.call("GET", "/account/mobile/", null, true).then(function (res) {
      if (!res.ok || res.data.verified || !wrap.isConnected) return;
      D.call("GET", "/sites/", null, true).then(function (s) {
        var any = s.ok && ((s.data && s.data.sites) || []).some(function (x) { return x.template === "sante"; });
        if (!any || !wrap.isConnected || wrap.querySelector("#h-wd-note")) return;
        var box = D.el("section", { "class": "ov-trial ov-setup", "aria-labelledby": "h-wd-note" });
        var txt = D.el("div", { "class": "ov-trial-txt" });
        txt.appendChild(D.el("h2", { id: "h-wd-note" }, "Withdrawals are not open"));
        txt.appendChild(D.el("p", {}, "Verify your mobile number so your members can request withdrawals."));
        var link = D.el("a", { "class": "ov-trial-link", href: "/earnings/" }, "Earnings");
        link.appendChild(D.el("span", { "aria-hidden": "true" }, " ›"));
        add(box, D.el("span", { "class": "ov-trial-ico", "aria-hidden": "true" }, "!"), txt, link);
        wrap.insertBefore(box, wrap.firstChild);
      });
    });
  }

  window.NOEarnings = { show: show, hide: hide, overviewNote: overviewNote };
})();
