/* Orders > Package Order > "Help this member sign in" (ClickUp z8uq9mek5y, MEM-R; design packet v2, mockups 01 to 05, approved by Coach Ed).
   The store owner helps a member who lost both email and mobile: check who they are, give a new email, done. Starts from an order, so
   there is no member search. Reads GET /sites/{id}/members/by-order/?ids= (masked contacts and a running hold per order; 404 while the
   members switch is off, which shows nothing), GET .../members/{id}/recovery/, POST .../recovery/check/ and POST .../recovery/.
   pack-orders.js asks this file for the button, the hold chip and the banner. Every name, contact and time comes from the API and
   reaches the page through textContent or D.el only. The owner judges the check himself; no document is collected. */
(function () {
  var D = window.NODash;
  var CHUNK = 200;
  var ASK = {
    full_name: ["Full name", "Ask: what name is your membership registered under?"],
    delivery_address: ["Delivery address", "Ask: what is your delivery address?"],
    pack_order_number: ["Membership Package order number", "Ask: what is the order number of your Membership Package order?"],
    payout_last4: ["Payout account", "Ask: what are the last 4 digits of your payout account?"]
  };
  var CHECK_FAILED = "We could not save the check. Please try again.";
  var M = { site: null, ids: [], members: {}, token: 0, onChange: null };
  var F = null, closeCb = null, flowToken = 0;

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function btn(label, cls, fn) { var b = h("button", "no-btn " + cls, label); b.setAttribute("type", "button"); if (fn) b.addEventListener("click", function () { fn(b); }); return b; }
  function icon(d) {
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), p = document.createElementNS(ns, "path");
    [["viewBox", "0 0 24 24"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "2"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"], ["focusable", "false"]].forEach(function (a) { s.setAttribute(a[0], a[1]); });
    p.setAttribute("d", d); s.appendChild(p); return s;
  }
  var ICON = { back: "M15 6l-6 6 6 6", info: "M12 8v5M12 16.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" };
  function msg(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function field(res, name) { var f = res && res.data && res.data.fields && res.data.fields[name]; return typeof f === "string" && f ? f : ""; }
  function first(name) { return String(name || "").trim().split(/\s+/)[0] || "the member"; }

  /* Manila time as "Nov 14, 3:10 PM", from the ISO time the API sends. */
  function stamp(iso, fallback) {
    var d = new Date(iso), o = {};
    if (isNaN(d.getTime())) return fallback || "";
    try {
      new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
    } catch (e) { return fallback || ""; }
    return String(o.month || "").replace(/\.$/, "") + " " + o.day + ", " + o.hour + ":" + o.minute + " " + String(o.dayPeriod || "").toUpperCase().replace(/\./g, "");
  }
  function holdText(row) { return row && row.hold_ends_at ? stamp(row.hold_ends_at, row.hold_ends_display || "") : ""; }
  function base() { return "/sites/" + M.site + "/members/"; }

  /* ---- the Pack orders list: who is each order's member, and is a hold running ---- */
  function load(site, orders) {
    var mine = ++M.token;
    M.site = site; M.ids = (orders || []).map(function (o) { return o.id; }).filter(Boolean);
    if (!site || !M.ids.length) { M.members = {}; return Promise.resolve(); }
    var chunks = [];
    for (var i = 0; i < M.ids.length; i += CHUNK) chunks.push(M.ids.slice(i, i + CHUNK));
    return Promise.all(chunks.map(function (c) {
      return D.call("GET", base() + "by-order/?ids=" + c.map(encodeURIComponent).join(","), null, true);
    })).then(function (rs) {
      if (mine !== M.token) return;
      var map = {};
      rs.forEach(function (r) { if (r.ok && r.data && r.data.members && typeof r.data.members === "object") Object.keys(r.data.members).forEach(function (k) { map[k] = r.data.members[k]; }); });
      M.members = map; /* a 404 (switch off, another kind of site) leaves it empty: no button anywhere */
      if (M.onChange) M.onChange();
    });
  }
  function memberOf(order) { var m = order && M.members[order.id]; return m && !m.closed ? m : null; }
  function helpButton(order) {
    if (!memberOf(order)) return null;
    var b = btn("Help this member sign in", "no-btn-ghost mr-help", function () { open(order); });
    b.setAttribute("aria-label", "Help this member sign in, order " + order.order_number);
    return b;
  }
  function holdChip(order) {
    var m = memberOf(order), t = holdText(m);
    return m && t ? h("span", "chip chip-warn mr-chip", "Recovery hold until " + t) : null;
  }
  function banner(order) {
    if (!memberOf(order)) return null;
    var b = h("div", "mr-banner"), p = h("p"), s = h("strong", "", "Member lost their email and mobile?");
    add(p, s, document.createTextNode("You can help them sign in with a new email after you check who they are."));
    return add(b, icon(ICON.info), p, btn("Help this member sign in", "no-btn-primary mr-help-main", function () { open(order); }));
  }

  /* ---- the flow ---- */
  function root() { return byId("mr-root"); }
  function show(on) {
    var r = root(), vw = byId("view-pack-orders"), tabs = byId("orders-tabs");
    if (r) r.hidden = !on;
    if (vw) vw.hidden = on;
    if (tabs) tabs.hidden = on;
  }
  function newFlow(order) {
    return { order: { id: order.id, number: order.order_number }, memberId: M.members[order.id].id, step: "loading", detail: null, answers: {}, miss: false, busy: false,
      check: null, email: "", mobile: "", errs: {}, note: "", expired: false, saved: null };
  }
  function open(order) {
    if (!M.members[order.id]) return;
    flowToken++; F = newFlow(order); show(true); loadDetail();
  }
  function loadDetail() {
    var mine = flowToken; F.step = "loading"; render();
    D.call("GET", base() + encodeURIComponent(F.memberId) + "/recovery/", null, true).then(function (r) {
      if (mine !== flowToken || !F) return;
      if (r.status === 401) return;
      if (r.status === 409 && r.data.code === "member_closed") { F.step = "closed"; F.detail = F.detail || { member: { full_name: "" } }; render(); return; }
      if (!r.ok || !r.data || !r.data.member) { F.step = "error"; F.note = msg(r, "We could not load this member. Try again."); render(); return; }
      F.detail = r.data;
      F.step = r.data.member.closed ? "closed" : "check"; render();
    });
  }
  /* After the flow closes the list is drawn again (and once more when the holds are re-read): put the owner back where they were.
     Done / Cancel / Back to order: scroll that order's row into view and focus its details button. Help another member: the page heading. */
  function restore(back) {
    var a = document.activeElement;
    if (a && a !== document.body && a !== back.el && a.parentNode) return; /* the owner already moved on (back.el: our own focus, on a row the list has since drawn again) */
    var el = null, row = back.keepOpen && back.id ? byId("pk-row-" + back.id) : null;
    if (row) {
      var bs = row.querySelectorAll("button");
      for (var i = 0; i < bs.length && !el; i++) if (bs[i].hasAttribute("aria-expanded")) el = bs[i];
      el = el || bs[0] || null;
      if (row.scrollIntoView) row.scrollIntoView({ block: "center" });
    }
    if (!el) el = byId("h-orders");
    back.el = el; if (el && el.focus) el.focus();
  }
  function close(keepOpen) {
    var cb = closeCb, back = { keepOpen: !!keepOpen, id: F && F.order ? F.order.id : "" };
    flowToken++; F = null; show(false); var r = root(); if (r) clear(r);
    var p = load(M.site, M.ids.map(function (id) { return { id: id }; })); /* the hold may have changed */
    if (cb) cb(!!keepOpen);
    restore(back);
    p.then(function () { restore(back); });
  }
  function reset() {
    flowToken++; M.token++; F = null; M.members = {}; M.ids = [];
    var r = root(), vw = byId("view-pack-orders"), tabs = byId("orders-tabs");
    if (r) { clear(r); r.hidden = true; }
    if (vw) vw.hidden = false;
    if (tabs) tabs.hidden = false;
  }

  function steps(n) {
    var ol = h("ol", "mr-steps"); ol.setAttribute("aria-label", "Steps");
    ["1. Start from the order", "2. Check who they are", "3. New contact", "4. Done"].forEach(function (t, i) {
      var li = h("li", i + 1 < n ? "done" : "", t); if (i + 1 === n) li.setAttribute("aria-current", "step"); ol.appendChild(li);
    });
    return ol;
  }
  function crumb() {
    var nav = h("nav", "mr-crumb"); nav.setAttribute("aria-label", "Breadcrumb");
    function link(t, fn) { var a = h("a", "", t); a.setAttribute("href", "#"); a.addEventListener("click", function (e) { e.preventDefault(); fn(); }); return a; }
    add(nav, link("Orders", function () { close(false); }), h("span", "", "/"), link("Package Order", function () { close(false); }), h("span", "", "/"), link(F.order.number, function () { close(true); }), h("span", "", "/"), h("b", "", "Help this member sign in"));
    return nav;
  }
  function back() {
    var a = h("a", "mr-back"); a.setAttribute("href", "#"); add(a, icon(ICON.back), document.createTextNode("Back to order " + F.order.number));
    a.addEventListener("click", function (e) { e.preventDefault(); close(true); }); return a;
  }
  function head() { var hd = h("header", "view-head"), t = h("h1", "", "Help a member sign in"); t.setAttribute("id", "mr-h1"); t.setAttribute("tabindex", "-1"); return add(hd, h("p", "dash-eyebrow", "Orders"), t); }
  function note(kind, title, text) {
    var b = h("div", "mr-note " + kind), p = h("p"); if (kind === "bad") b.setAttribute("role", "alert");
    add(p, h("strong", "", title), document.createTextNode(text));
    return add(b, kind === "bad" ? null : icon(ICON.info), p);
  }
  function card(title) { var c = h("section", "mr-card"); return add(c, title ? h("h2", "", title) : null); }
  function facts(rows) { var dl = h("dl", "mr-facts"); rows.forEach(function (r) { add(dl, h("dt", "", r[0]), h("dd", "", r[1])); }); return dl; }
  function memberChip(m) {
    return m.email_state === "verified" ? h("span", "chip chip-ok", "Verified") : m.email_state === "pending" ? h("span", "chip chip-info", "Pending verification") : h("span", "chip chip-neutral", "Not verified");
  }
  function memberCard() {
    var m = F.detail.member, c = card(), top = h("div", "mr-titlerow"), t = h("h2", "", m.full_name), t2 = holdText(m), rows = [["Mobile", m.mobile_masked || "—"], ["Email", m.email_masked || "—"]];
    if (t2) rows.push(["Recovery hold", "Recovery hold: running until " + t2]);
    add(top, t, memberChip(m)); add(c, top, facts(rows), h("p", "mr-sub", "Recent recoveries on this member"));
    var ul = h("ul", "mr-hist"), recent = Array.isArray(F.detail.recent_recoveries) ? F.detail.recent_recoveries : [];
    if (!recent.length) ul.appendChild(add(h("li"), h("span", "", "No earlier recoveries")));
    recent.forEach(function (a) {
      var li = h("li"), w = a.field === "mobile" ? "Mobile" : "Email", tm = h("time", "", stamp(a.at));
      add(li, h("span", "", w + ": " + (a.old_masked || "—") + " → " + (a.new_masked || "—")), tm); ul.appendChild(li);
    });
    return add(c, ul);
  }

  /* ---- step 2: check ---- */
  function itemCopy(it) { return ASK[it.key] || [String(it.key).replace(/_/g, " "), "Ask the member about this item."]; }
  function seg(key) {
    var fs = h("fieldset", "mr-seg"), lg = h("legend", "sr-only", itemCopy({ key: key })[0] + ": does it match?");
    add(fs, lg);
    [["matched", "Matched", ""], ["not_matched", "Not matched", "no"]].forEach(function (o) {
      var lab = h("label"), inp = D.el("input", { type: "radio", id: "mr-" + key + "-" + o[0], name: "mr-" + key, value: o[0], "class": o[2] });
      if (F.answers[key] === o[0]) inp.checked = true;
      inp.addEventListener("change", function () { F.answers[key] = o[0]; F.miss = false; render(true); });
      add(lab, inp, h("span", "", o[1])); fs.appendChild(lab);
    });
    return fs;
  }
  function applicable() { return (F.detail.items || []).filter(function (it) { return it && it.applicable; }); }
  function checkStep(root) {
    add(root, back(), steps(2), memberCard());
    var c = card("Check who they are"), ul = h("ul", "mr-chk");
    add(c, h("p", "mr-sub", "Ask the member for these details yourself (by phone, Messenger or in person). Let them say it first, then compare with what you have on file and mark each one. Do not read the answer out to them."));
    applicable().forEach(function (it) {
      var cp = itemCopy(it), ref = typeof it.reference === "string" && it.reference ? it.reference : it.key === "pack_order_number" ? F.order.number : "", li = h("li");
      add(li, h("h3", "", cp[0]), h("p", "mr-ask", cp[1]));
      if (ref) add(li, add(h("div", "mr-onfile"), h("span", "", "On your order records"), h("b", "", ref)));
      add(li, seg(it.key)); ul.appendChild(li);
    });
    add(c, ul);
    if (F.miss) { var e = h("p", "mr-err", "Mark each item Matched or Not matched."); e.setAttribute("role", "alert"); c.appendChild(e); }
    if (F.note) { var n = h("p", "mr-err", F.note); n.setAttribute("role", "alert"); c.appendChild(n); }
    var go = btn("Check", "no-btn-primary", runCheck); go.setAttribute("id", "mr-check"); if (F.busy) { go.disabled = true; go.setAttribute("aria-busy", "true"); }
    add(c, add(h("div", "mr-actions"), go, btn("Cancel", "no-btn-ghost", function () { close(true); })), h("p", "mr-hint", "All items must be Matched. A passed check lasts 15 minutes and can be used once."));
    root.appendChild(c);
  }
  function runCheck() {
    if (F.busy) return;
    var items = applicable(), answers = {}, mine = flowToken;
    for (var i = 0; i < items.length; i++) { var a = F.answers[items[i].key]; if (!a) { F.miss = true; render(true); return; } answers[items[i].key] = a; }
    F.busy = true; F.note = ""; render(true);
    D.call("POST", base() + encodeURIComponent(F.memberId) + "/recovery/check/", { answers: answers }, true).then(function (r) {
      if (mine !== flowToken || !F) return;
      F.busy = false;
      if (r.status === 401) return;
      if (r.status === 409 && r.data.code === "member_closed") { F.step = "closed"; render(); return; }
      if (r.ok && r.data && typeof r.data.check_id === "string") {
        if (r.data.passed) { F.check = { id: r.data.check_id, expires: r.data.expires_at }; F.step = "contact"; F.expired = false; F.note = ""; render(); return; }
        F.step = "blocked"; render(); return;
      }
      F.note = msg(r, CHECK_FAILED); render(true); /* any 409 or 429 is shown as the server words it */
    });
  }

  /* ---- step 5: not matched, or closed ---- */
  function blockedStep(root) {
    add(root, back(), steps(2));
    var b = h("div", "mr-note bad"), box = h("div"), acts = h("div", "mr-actions");
    b.setAttribute("role", "alert");
    add(box, add(h("p"), h("strong", "", "Could not confirm this member"), document.createTextNode("Do not change their contact. Nothing was saved. You can check again.")));
    add(acts, btn("Check again", "no-btn-ghost", function () { F.answers = {}; F.miss = false; F.note = ""; F.step = "check"; render(); }), btn("Back to order " + F.order.number, "no-btn-ghost", function () { close(true); }));
    root.appendChild(add(b, add(box, acts)));
  }
  function closedStep(root) {
    add(root, back(), steps(2));
    var b = note("bad", "This member account is closed", "A closed member cannot be helped to sign in."), acts = h("div", "mr-actions");
    add(acts, btn("Back to order " + F.order.number, "no-btn-ghost", function () { close(true); }));
    add(root, b, acts);
  }

  /* ---- step 3: new contact ---- */
  function minutesLeft() { var t = new Date(F.check && F.check.expires).getTime(); return isNaN(t) ? 0 : Math.max(1, Math.ceil((t - Date.now()) / 60000)); }
  function fld(id, label, input, hint, err) {
    var w = h("div", "mr-field"), lab = h("label", "", label); lab.setAttribute("for", id);
    if (err) input.classList.add("is-bad");
    add(w, lab, input);
    if (err) { var e = h("p", "mr-err", err); e.setAttribute("id", id + "-err"); input.setAttribute("aria-describedby", id + "-err"); input.setAttribute("aria-invalid", "true"); w.appendChild(e); }
    return add(w, hint ? h("p", "mr-hint", hint) : null);
  }
  function contactStep(root) {
    var name = F.detail.member.full_name, hold = holdText(F.detail.member);
    add(root, steps(3));
    if (F.expired) {
      var b = h("div", "mr-note bad"), box = h("div"); b.setAttribute("role", "alert");
      add(box, add(h("p"), h("strong", "", "Check expired"), document.createTextNode("The 15-minute check ran out. Go back and check the member again.")), add(h("div", "mr-actions"), btn("Check again", "no-btn-ghost", function () { F.answers = {}; F.check = null; F.expired = false; F.note = ""; F.step = "check"; render(); })));
      return add(root, add(b, box));
    }
    add(root, note("ok", "Check passed for " + name, "You have " + minutesLeft() + " minutes to finish. The check works once."));
    var c = card("New contact for " + name), form = h("form");
    form.setAttribute("novalidate", "novalidate");
    var em = D.el("input", { id: "mr-email", type: "email", autocomplete: "off", "class": "mr-input" }), mo = D.el("input", { id: "mr-mobile", type: "tel", placeholder: "0917 123 4567", autocomplete: "off", "class": "mr-input" });
    em.value = F.email; mo.value = F.mobile;
    em.addEventListener("input", function () { F.email = em.value; }); mo.addEventListener("input", function () { F.mobile = mo.value; });
    add(c, h("p", "mr-sub", "The member signs in with the new email. We send them a code there."));
    add(form, fld("mr-email", "New email (required)", em, "", F.errs.new_email), fld("mr-mobile", "New mobile (optional)", mo, "The member confirms it later on their Account page.", F.errs.new_mobile),
      note("warn", "Before you save", "This signs the member out everywhere and pauses payout changes and withdrawals for 24 hours. Their old email and mobile are told about it."));
    if (F.note) { var n = h("p", "mr-err", F.note); n.setAttribute("role", "alert"); form.appendChild(n); }
    var go = D.el("button", { type: "submit", id: "mr-save", "class": "no-btn no-btn-primary" }, "Save new contact"); if (F.busy) { go.disabled = true; go.setAttribute("aria-busy", "true"); }
    add(form, add(h("div", "mr-actions"), go, btn("Cancel", "no-btn-ghost", function () { close(true); })));
    form.addEventListener("submit", function (e) { e.preventDefault(); save(); });
    add(c, form); root.appendChild(c);
    if (hold) root.appendChild(h("p", "mr-hint", "A recovery hold is already running for this member (until " + hold + "). Saving restarts the 24-hour hold."));
  }
  function save() {
    if (F.busy) return;
    var mine = flowToken, email = String(F.email || "").trim(), mobile = String(F.mobile || "").trim();
    F.errs = {}; F.note = "";
    if (!email) { F.errs.new_email = "Enter the member's new email. They sign in with it."; render(true); return; }
    F.busy = true; render(true);
    D.call("POST", base() + encodeURIComponent(F.memberId) + "/recovery/", { check_id: F.check.id, new_email: email, new_mobile: mobile }, true).then(function (r) {
      if (mine !== flowToken || !F) return;
      F.busy = false;
      if (r.status === 401) return;
      if (r.ok) { F.saved = { data: r.data || {}, email: !!email, mobile: !!mobile }; F.step = "saved"; D.toast("New contact saved"); render(); return; }
      var code = r.data && r.data.code;
      if (code === "member_closed") { F.step = "closed"; render(); return; }
      if (code === "recovery_check_invalid") { F.expired = true; render(); return; }
      F.errs.new_email = field(r, "new_email"); F.errs.new_mobile = field(r, "new_mobile");
      if (!F.errs.new_email && !F.errs.new_mobile) F.note = msg(r, "We could not save the new contact. Please try again.");
      render(true);
    });
  }

  /* ---- step 4: saved ---- */
  function savedStep(root) {
    var name = F.detail.member.full_name, s = F.saved, d = s.data, hold = d.hold_ends_at ? stamp(d.hold_ends_at, d.hold_ends_display || "") : holdText(F.detail.member), c = h("section", "mr-card"), who = first(name);
    add(root, steps(4));
    add(c, h("span", "chip chip-ok", "Saved"), h("h2", "mr-saved-h", "New contact saved for " + name), h("p", "", "Tell " + who + " to open your store's sign-in page and sign in with the new email. We will send a code there. The email is confirmed when it is entered."),
      facts([["New email", s.email ? (d.email_masked || "—") + " (waiting for the first sign-in)" : "Not changed"], ["New mobile", s.mobile ? (d.mobile_masked || "—") : "Not added"], ["Signed out everywhere", "Yes"], ["Recovery hold", hold ? "Until " + hold : "24 hours"]]));
    add(root, c, note("info", "While the hold runs", who + " cannot change their payout details or request a withdrawal, and you cannot record a payout for them. Their old email and mobile were told about the recovery and when the hold ends."),
      add(h("div", "mr-actions"), btn("Done", "no-btn-primary", function () { close(true); }), btn("Help another member", "no-btn-ghost", function () { close(false); })));
  }

  function render(keepFocus) {
    var r = root(); if (!r || !F) return;
    var ae = document.activeElement, fid = keepFocus && ae && ae.getAttribute ? ae.getAttribute("id") : null;
    clear(r); r.removeAttribute("aria-busy");
    add(r, head());
    var inner = h("div", "mr-wrap");
    if (F.step === "loading") {
      var sk = h("div", "mr-skel"); r.setAttribute("aria-busy", "true"); sk.setAttribute("role", "status"); sk.setAttribute("aria-label", "Loading this member");
      add(inner, back(), sk);
    } else if (F.step === "error") {
      var e = h("div", "mr-note bad"); e.setAttribute("role", "alert");
      add(e, add(h("div"), add(h("p"), h("strong", "", "We could not load this member"), document.createTextNode(F.note)), add(h("div", "mr-actions"), btn("Try again", "no-btn-ghost", loadDetail), btn("Back to order " + F.order.number, "no-btn-ghost", function () { close(true); }))));
      add(inner, e);
    } else {
      add(inner, crumb());
      if (F.step === "check") checkStep(inner); else if (F.step === "contact") contactStep(inner); else if (F.step === "saved") savedStep(inner); else if (F.step === "blocked") blockedStep(inner); else if (F.step === "closed") closedStep(inner);
    }
    r.appendChild(inner);
    var tgt = fid ? byId(fid) : null;
    if (!tgt && !keepFocus) tgt = byId("mr-h1");
    if (tgt && tgt.focus) tgt.focus();
  }

  window.NOMemberRecovery = { load: load, helpButton: helpButton, holdChip: holdChip, banner: banner, open: open, reset: reset,
    onChange: function (fn) { M.onChange = fn; }, onClose: function (fn) { closeCb = fn; } };
})();
