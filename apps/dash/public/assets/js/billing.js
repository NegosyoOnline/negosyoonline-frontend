/* Billing page (Phase 4, /settings/billing/). Reads GET /billing/sites/, .../overview/, .../payment/ and
   .../statements/; every figure, status and date comes from the API. The only browser arithmetic is the meter fill
   width and bytes shown as GB (spec 8.3). API strings reach the page through textContent or D.el only. No storage. */
(function () {
  var D = window.NODash;
  var LABEL = "Internal Billing Statement — Not an Official BIR Receipt or BIR Electronic Invoice.";
  var SITE_RE = /^[1-9][0-9]{0,9}$/, NUMBER_RE = /^NO(BS|CN)(-TEST)?-\d{4}-\d{6}$/;
  var TZ = "Asia/Manila";

  /* ---- pure helpers (no document access; exported as NOBilling.util and node-tested) ---- */
  function q(search, key) { var m = new RegExp("[?&]" + key + "=([^&#]*)").exec(search || ""); if (!m) return null; try { return decodeURIComponent(m[1]); } catch (e) { return null; } }
  function groups(intPart) { var s = intPart, out = ""; while (s.length > 3) { out = "," + s.slice(-3) + out; s = s.slice(0, -3); } return s + out; }
  /* "2499.00" -> "PHP 2,499.00"; string work only, no numeric parse (P4-1). */
  function money(str) {
    var s = String(str), neg = s.charAt(0) === "-", body = neg ? s.slice(1) : s, dot = body.indexOf(".");
    var ip = dot < 0 ? body : body.slice(0, dot), dp = dot < 0 ? "" : body.slice(dot);
    return "PHP " + (neg ? "-" : "") + groups(ip) + dp;
  }
  function whole(n) { return groups(String(n)); }
  function gb(bytes) { return (Math.round(bytes / 1e8) / 10).toFixed(1); } /* display only */
  function pct(count, included) { return included > 0 ? Math.min(count / included, 1) * 100 : 0; } /* width only */
  function fmt(iso, opts) { return new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: TZ }, opts)).format(new Date(iso)).replace(/[  ]/g, " "); }
  function dateShort(iso) { return iso ? fmt(iso, { month: "short", day: "numeric", year: "numeric" }) : ""; }
  function instant(iso) { return iso ? dateShort(iso) + ", " + fmt(iso, { hour: "numeric", minute: "2-digit", hour12: true }) : ""; }
  function monthDay(iso) { return fmt(iso, { month: "short", day: "numeric" }); }
  function rangeShort(a, b) { return monthDay(a) + " to " + dateShort(b); }
  function rangeLong(a, b) { return instant(a) + " to " + instant(b); }
  function trialHead(n) { return n === 1 ? "1 day left in your free trial" : n + " days left in your free trial"; }
  function attentionLead(n, endsIso) { return (n === 0 ? "Fix it today" : "Fix it within " + (n === 1 ? "1 day" : n + " days")) + ", by " + dateShort(endsIso) + ","; }
  function pickSite(search, sites) {
    var raw = q(search, "site"), ids = sites.map(function (s) { return s.id; });
    if (raw !== null && SITE_RE.test(raw) && ids.indexOf(parseInt(raw, 10)) >= 0) return { id: parseInt(raw, 10), corrected: false };
    return { id: ids[0], corrected: true };
  }
  function pickStatement(search) { var n = q(search, "statement"); return n !== null && NUMBER_RE.test(n) ? n : null; }
  /* spec 8.2 step 5 (overview and payment statuses after the parallel fetch) */
  function afterFetch(ovStatus, payStatus, retried) {
    var ok = function (s) { return s >= 200 && s < 300; };
    if ((ovStatus === 404 || payStatus === 404) && !retried) return "retry";
    return ok(ovStatus) && ok(payStatus) ? "render" : "panelH";
  }

  /* One statements-list item to the strings the row shows (design 4.4, N-2, N-16). */
  function statementRow(item) {
    var first = item.is_test ? ["test", "TEST DATA"] : item.document_type === "credit_note" ? ["info", "Credit"]
      : item.status === "replaced" ? ["neutral", "Replaced by " + item.replaced_by] : ["ok", "Issued"];
    var d = item.delivery || {}, links = ["PDF", "JSON"];
    if (item.receipt_attached) links.push("Receipt");
    return {
      numberSub: item.document_type === "credit_note" ? "Credit note" : "Statement",
      chips: [first].concat(item.receipt_attached ? [["ok", "Receipt on file"]] : []),
      cycleText: item.is_test ? "Test cycle" : rangeShort(item.cycle.start_at, item.cycle.end_at),
      total: money(item.total),
      email: d.status === "sent" ? "Emailed " + monthDay(d.last_try_at) : d.status === "sending" ? "Sending" : "Not sent",
      links: links
    };
  }
  /* The server's display_rows to table cells (N-17); the browser never groups or sums. */
  function detailRows(rows) {
    return rows.map(function (r) {
      if (r.type === "order" && r.line_count > 1) {
        var m = /beyond ([0-9,]+)\)/.exec(r.description || "");
        return { desc: "Processed orders above " + (m ? m[1] : "1,000"), note: "Cycle " + r.source_cycle + " · " + r.line_count + " lines, one per order",
          qty: r.quantity_display, unit: r.unit_price, amount: r.amount };
      }
      return { desc: r.description, note: r.source_note, qty: r.quantity_display, unit: r.unit_price, amount: r.amount };
    });
  }
  function deliveryChip(d) {
    d = d || {};
    return d.status === "sent" ? ["ok", "Sent " + dateShort(d.last_try_at)] : d.status === "sending" ? ["info", "Sending"] : ["neutral", "Not sent"];
  }
  /* "on Nov 5, 2026" while the 5th after issue is still ahead of the server's as_of, else "shortly". */
  function receiptDueText(issuedAt, asOf) {
    var ip = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(issuedAt)),
      part = function (t) { return +ip.filter(function (x) { return x.type === t; })[0].value; },
      py = part("year"), pm = part("month") - 1, pd = part("day"),
      due = new Date(Date.UTC(py, pd < 5 ? pm : pm + 1, 5, 12)).toISOString();
    return asOf && due > asOf ? "on " + dateShort(due) : "shortly";
  }
  function receiptExt(type) { return type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : type === "application/pdf" ? "pdf" : "bin"; }

  var ATTEMPT_CHIP = { paid: ["ok", "Paid"], test_payment: ["test", "TEST DATA"], processing: ["info", "Processing"],
    failed: ["danger", "Failed"], under_review: ["warn", "Under review"] };
  var CANCELLED = ["cancelled", "cancelled_no_payment_method"];
  /* What to show, decided from server fields only. ISO UTC strings from one server compare in time order, so the S8
     (ended) and S8b (running) split compares service_end_at with the server's own as_of, never the browser clock. */
  function viewModel(ov, pay, list, search) {
    var sub = ov.subscription, st = sub.state, nc = pay.next_charge, pm = pay.payment_method;
    var asOf = ov.as_of, cyc = ov.current_cycle, avail = ov.payments_available, coll = ov.collection_enabled;
    var cancelled = CANCELLED.indexOf(st) >= 0;
    var ended = cancelled && !!sub.service_end_at && sub.service_end_at <= asOf;
    var running = cancelled && !!sub.service_end_at && sub.service_end_at > asOf;
    var returning = q(search, "setup") === "return" && !(pm && pm.status === "active");
    var notices = [];
    if (st === "suspended") notices.push("SUSPENDED");
    if (ended) notices.push("D");
    if (running) notices.push("D8B");
    if (nc && nc.kind === "final_usage") notices.push("E");
    if (st === "payment_requires_attention") notices.push("A");
    if (returning) notices.push("B");
    if (!avail && st !== "trial_active") notices.push("C"); /* Coach Ed 2026-10-30: no such notice during a trial */
    var paidCycle = !!(cyc && cyc.settlement === "paid" && (st === "active" || running));
    var trial = st === "trial_active", days = sub.trial_days_left, trialEnded = trial && days === 0;
    var activeMethod = !!(pm && pm.status === "active");
    var empty = trial ? ["Nothing is billed during the trial."].concat(ov.statements_enabled ? [
        "After your first successful payment, an internal billing statement for it appears here, with a PDF and a data file you can download."] : [])
      : (ov.statements_enabled ? ["An internal billing statement appears here after each successful payment."] : []);
    return {
      state: st, notices: notices, polling: returning,
      status: trial ? { chip: ["info", "Free trial"], h2: days > 0 ? trialHead(days) : "Your free trial period has ended" }
        : st === "active" ? { chip: ["ok", "Active"], h2: "Your subscription is active" }
        : st === "payment_requires_attention" ? { chip: ["warn", "Payment needs attention"], h2: null }
        : st === "suspended" ? { chip: ["danger", "Suspended"], h2: null }
        : { chip: ["danger", "Cancelled"], h2: null },
      over: { orders: !!(ov.usage && ov.usage.orders.over > 0),
              storage: !!(ov.usage && ov.usage.storage && ov.usage.storage.billable_gb > 0),
              video: !!(ov.usage && ov.usage.video && ov.usage.video.billable_gb > 0) },
      cards: {
        plan: trial ? { firstPayment: avail && days > 0 && !!(nc && nc.kind === "first" && nc.date) } : null,
        preview: !!(nc && st === "active"), /* S2 and S2b only (design 4.3); hidden when next_charge is null */
        usage: paidCycle && !!ov.usage,
        lastPayment: pay.recent_attempts.length ? { chip: ATTEMPT_CHIP[pay.recent_attempts[0].status] || ["neutral", pay.recent_attempts[0].status] } : null,
        cancel: !cancelled && !(st === "suspended" && !!sub.reactivate_until && sub.reactivate_until <= asOf), fees: true, statements: true, /* SA-2 Yes: server as_of only, never the browser clock */
        /* the trial note exists only while trial days remain (never in S1b, any payments flag value; spec 17 M-3) */
        method: { trialNote: trial && days > 0 && avail && !activeMethod }
      },
      actions: {
        addMethod: avail && !returning && !activeMethod && !trialEnded && !cancelled, /* never in S1b (gap 1) */
        replaceMethod: avail && activeMethod && !cancelled,
        updateMethod: avail && st === "payment_requires_attention",
        reactivate: avail && coll && !!(nc && nc.kind === "reactivation") && (st === "suspended" || ended),
        retryFinal: avail && coll && !!(nc && nc.kind === "final_usage"),
        exportData: !!(ended && sub.download_until && sub.download_until > asOf)
      },
      /* S1b: exactly one branch (spec 8.3 S1b, item T) */
      trialBody: !trialEnded ? null
        : !avail ? "Payments are not open yet, so nothing has been charged."
        : activeMethod ? "We have not confirmed your first payment yet. This page updates once our payment provider confirms it."
        : "No payment method was active when your trial ended. Email support@negosyoonline.com for help with this website.",
      /* Cancel card and dialog bodies for trial states only (spec 17 M-3); null elsewhere, where the renderer uses the
         active-cycle or attention/suspended copy */
      cancelBody: !trial ? null : days > 0
        ? "Cancelling during your trial ends your subscription for this site right away, with no fee. Your records are kept and you can export your data for 30 days."
        : "Cancelling ends your subscription for this site right away, with no fee. Your records are kept and you can export your data for 30 days.",
      cancelDialogBody: !trial ? null : days > 0
        ? "Your trial ends now. Nothing is charged. You can export your data for 30 days."
        : "Your subscription for this site ends now. Nothing is charged. You can export your data for 30 days.",
      /* Notice C body (item C): the trial sentence only while trial days remain; every other case, S1b included */
      noticeCBody: "Adding or replacing a payment method isn’t open right now.",
      statementsEmpty: empty
    };
  }

  /* ---- DOM part: builds the page from the view model; D.el and textContent only ---- */
  var countTimer = null, token = 0, pollTimer = null, polls = 0, urls = [], lastPayload = null, stBody = null, openerNumber = null, stCache = null, dialogKey = null;
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function byId(id) { return document.getElementById(id); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function rootEl() { return byId("bl-root"); }
  function bname(s) { return (s || "").trim() || "My Business"; }
  function api(path) { return D.call("GET", path, null, true); }
  function errMsg(res) { var m = res && res.data && res.data.message; return typeof m === "string" ? m : ""; } /* local; dashboard.js messageOf is private */
  function say(text) { var l = byId("bl-live"); if (l) l.textContent = text; }
  function chip(pair) { return h("span", "chip chip-" + pair[0], pair[1]); }
  function para(text, cls) { return h("p", cls || "bl-p", text); }
  /* rows: [label, value, optional class]; value is a string or a node */
  function dl(rows) {
    var d = h("dl", "bl-dl");
    rows.forEach(function (r) {
      if (!r) return;
      var w = h("div", "bl-dl-row" + (r[2] ? " " + r[2] : ""));
      var dd = h("dd", "");
      if (typeof r[1] === "string") dd.textContent = r[1]; else dd.appendChild(r[1]);
      add(w, h("dt", "", r[0]), dd);
      d.appendChild(w);
    });
    return d;
  }
  function both(wide, narrow) { var s = h("span", ""); add(s, h("span", "bl-wide", wide), h("span", "bl-narrow", narrow)); return s; }
  function card(id, title, cls) {
    var s = h("section", "bl-card" + (cls ? " " + cls : ""));
    s.setAttribute("aria-labelledby", "bl-h-" + id);
    var t = h("h2", "bl-h2", title); t.setAttribute("id", "bl-h-" + id); t.setAttribute("tabindex", "-1");
    add(s, t);
    return s;
  }
  function btn(label, kind, fn) {
    var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : kind === "danger" ? "no-btn-ghost bl-danger" : "no-btn-ghost"), label);
    b.setAttribute("type", "button");
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function stopPoll() { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } }
  function stopCount() { if (countTimer) { clearInterval(countTimer); countTimer = null; } }
  /* Live trial countdown to trial_end_at. Visual only (aria-hidden): the heading keeps the static "N days left" text for
     screen readers, so nothing is announced every second. Stops at zero; the next load reports the real state. */
  function countdownEl(endIso) {
    var wrap = h("div", "bl-count"), cells = [];
    wrap.setAttribute("aria-hidden", "true");
    ["days", "hours", "mins", "secs"].forEach(function (u) {
      var cell = h("div", "bl-count-cell"), num = h("span", "bl-count-num", "00");
      add(cell, num, h("span", "bl-count-unit", u)); add(wrap, cell); cells.push(num);
    });
    function tick() {
      var left = Math.max(0, Math.floor((new Date(endIso).getTime() - Date.now()) / 1000));
      var parts = [Math.floor(left / 86400), Math.floor(left % 86400 / 3600), Math.floor(left % 3600 / 60), left % 60];
      parts.forEach(function (n, i) { cells[i].textContent = (n < 10 ? "0" : "") + n; });
      if (left === 0) stopCount();
    }
    stopCount(); tick(); countTimer = setInterval(tick, 1000);
    return wrap;
  }
  function revokeAll() { urls.forEach(function (u) { URL.revokeObjectURL(u); }); urls = []; }
  function base() { return "/billing/sites/" + lastPayload.site + "/"; }
  function focusTop() { var t = byId("h-settings-billing"); if (t) t.focus(); }

  /* ---- load sequence (spec 8.2) ---- */
  function show() { window.removeEventListener("popstate", onPop); window.addEventListener("popstate", onPop); load(false); }
  function hide() {
    window.removeEventListener("popstate", onPop); stopPoll(); stopCount(); revokeAll(); token++;
    say(""); var slot = byId("bl-dialog-slot"); if (slot) clear(slot);
    if (dialogKey) { document.removeEventListener("keydown", dialogKey); dialogKey = null; }
  }
  function onPop() { if ((location.pathname.slice(-1) === "/" ? location.pathname : location.pathname + "/") === "/settings/billing/") load(false); }
  function load(retriedAfter404) {
    var mine = ++token;
    stopPoll(); revokeAll(); say(""); stCache = null; skeleton();
    var marker = q(location.search, "setup") === "return";
    api("/billing/sites/").then(function (res) {
      if (mine !== token || res.status === 401) return;
      if (!res.ok) { panelH(); return; }
      var sites = (res.data && res.data.sites) || [];
      if (!sites.length) { renderNoSite(); return; }
      var pick = pickSite(location.search, sites), number = pickStatement(location.search);
      var clean = "/settings/billing/?site=" + pick.id + (number ? "&statement=" + encodeURIComponent(number) : "");
      if (pick.corrected || marker || location.search !== clean.slice("/settings/billing/".length)) { try { history.replaceState(null, "", clean); } catch (e) { /* ignore */ } }
      var path = "/billing/sites/" + pick.id + "/";
      Promise.all([api(path + "overview/"), api(path + "payment/")]).then(function (r) {
        if (mine !== token) return;
        if (r[0].status === 401 || r[1].status === 401) return;
        /* spec 8.2 step 5: a 404 on the overview OR the payment read re-runs the site list once; a second
           consecutive 404 (or status 0 / 5xx) shows panel H */
        var next = afterFetch(r[0].status, r[1].status, retriedAfter404);
        if (next === "retry") { load(true); return; }
        if (next === "panelH") { panelH(); return; }
        lastPayload = { site: pick.id, sites: sites, ov: r[0].data, pay: r[1].data, search: marker ? "?setup=return" : "" };
        if (marker && r[1].data.payment_method && r[1].data.payment_method.status === "active") { lastPayload.search = ""; say("Your payment method is active."); }
        if (number) { openDetail(number, false); return; }
        render(lastPayload, null);
        api(path + "statements/").then(function (s) { if (mine === token) renderStatements(s, lastPayload); });
        if (lastPayload.search) startPoll(mine);
      });
    });
  }

  /* ---- polling after a return from the provider (spec 5 steps 3 to 5): at most 4 checks, 5 seconds apart ---- */
  function startPoll(mine) { polls = 0; schedule(mine); }
  function schedule(mine) {
    if (polls >= 4) return;
    pollTimer = setTimeout(function () {
      if (mine !== token) return;
      if (document.visibilityState !== "visible") { schedule(mine); return; } /* a hidden tab pauses the count */
      polls++;
      api(base() + "payment/").then(function (res) {
        if (mine !== token || !res.ok) { if (mine === token) schedule(mine); return; }
        lastPayload.pay = res.data;
        if (res.data.payment_method && res.data.payment_method.status === "active") {
          lastPayload.search = ""; render(lastPayload, "method"); say("Your payment method is active."); return;
        }
        schedule(mine);
      });
    }, 5000);
  }
  function checkAgain(b) {
    if (b.getAttribute("aria-busy") === "true") return;
    b.setAttribute("aria-busy", "true");
    var mine = token;
    Promise.all([api(base() + "overview/"), api(base() + "payment/")]).then(function (r) {
      if (mine !== token) return;
      b.removeAttribute("aria-busy");
      if (r[0].ok && r[1].ok) {
        lastPayload.ov = r[0].data; lastPayload.pay = r[1].data;
        var active = r[1].data.payment_method && r[1].data.payment_method.status === "active";
        if (active) { lastPayload.search = ""; stopPoll(); }
        render(lastPayload, active ? "method" : null);
        if (active) say("Your payment method is active.");
      } else { D.toast("That did not work", errMsg(r[0].ok ? r[1] : r[0]) || "We could not check your payment method. Please try again.", "error"); }
    });
  }

  /* ---- panels ---- */
  function skeleton() {
    var r = clear(rootEl()); r.setAttribute("aria-busy", "true");
    add(r, h("p", "bl-sr", "Loading your billing"));
    for (var i = 0; i < 4; i++) { var s = h("div", "bl-card bl-skel"); s.setAttribute("aria-hidden", "true"); add(s, h("span", "bl-skel-line bl-skel-w1"), h("span", "bl-skel-line bl-skel-w2"), h("span", "bl-skel-line bl-skel-w3")); r.appendChild(s); }
  }
  function panelH() {
    var r = clear(rootEl()); r.removeAttribute("aria-busy");
    var s = h("section", "bl-card bl-panel-err"); s.setAttribute("role", "alert");
    add(s, h("h2", "bl-h2", "We couldn’t load your billing"), para("Check your connection and try again. Nothing was changed."),
      btn("Try again", "ghost", function () { load(false); focusTop(); }));
    r.appendChild(s);
  }
  function panelI() {
    var r = clear(rootEl()); r.removeAttribute("aria-busy");
    var s = h("section", "bl-card bl-panel-err"); s.setAttribute("role", "alert");
    add(s, h("h2", "bl-h2", "This statement can’t be shown right now"),
      para("NegosyoOnline has been told. Try again later, or contact support and quote the statement number."));
    r.appendChild(s);
  }
  function renderNoSite() {
    var r = clear(rootEl()); r.removeAttribute("aria-busy");
    var s = card("nosite", "Billing is not available for this account yet");
    add(s, para("There is no website with a subscription on this account."));
    r.appendChild(s);
  }

  /* ---- actions ---- */
  function post(path, body, b) {
    if (b && b.getAttribute("aria-busy") === "true") return Promise.resolve(null);
    if (b) b.setAttribute("aria-busy", "true");
    return D.call("POST", path, body || {}, true).then(function (res) { if (b) b.removeAttribute("aria-busy"); return res; });
  }
  /* Same in-flight guard as post(): a second click while the request is out is ignored and Save is disabled. */
  function put(path, body, b) {
    if (b && b.getAttribute("aria-busy") === "true") return Promise.resolve(null);
    if (b) { b.setAttribute("aria-busy", "true"); b.disabled = true; }
    return D.call("PUT", path, body || {}, true).then(function (res) { if (b) { b.removeAttribute("aria-busy"); b.disabled = false; } return res; });
  }
  /* A refused POST: 503 payments_unavailable re-renders with notice C forced; anything else is a failure toast. */
  function failed(res) {
    if (res.status === 503 && res.data && res.data.code === "payments_unavailable") { lastPayload.ov.payments_available = false; render(lastPayload, null); return; }
    D.toast("That did not work", errMsg(res), "error");
  }
  function refresh() {
    var mine = token;
    return Promise.all([api(base() + "overview/"), api(base() + "payment/")]).then(function (r) {
      if (mine !== token) return;
      if (r[0].ok && r[1].ok) { lastPayload.ov = r[0].data; lastPayload.pay = r[1].data; render(lastPayload, null); } else { panelH(); }
    });
  }
  function startSetup(b) {
    post(base() + "payment-method/setup/", {}, b).then(function (res) {
      if (!res) return;
      if (!res.ok) { failed(res); return; }
      var url = res.data && res.data.redirect_url, ok = false;
      try { ok = typeof url === "string" && new URL(url).protocol === "https:"; } catch (e) { ok = false; }
      if (ok) location.assign(url); else D.toast("That did not work", "The payment page could not be opened. Please try again.", "error");
    });
  }
  function simplePost(suffix) {
    return function (b) { post(base() + suffix, {}, b).then(function (res) { if (!res) return; if (!res.ok) { failed(res); return; } refresh(); }); };
  }

  /* ---- cancel copy: trial bodies come from the view model; the rest are the active-cycle and attention copy ---- */
  function cancelCopy(vm, ov) {
    var cyc = ov.current_cycle, paid = ov.subscription.state === "active" && cyc && cyc.settlement === "paid";
    if (vm.cancelBody) return { card: vm.cancelBody, dialog: vm.cancelDialogBody };
    if (paid) {
      return { card: "If you cancel now, billing and renewal for " + bname(ov.site.business_name) + " stop on " + instant(cyc.end_at) + " Manila time, the end of the cycle you already paid for. Usage from that cycle is charged once, after it ends. Your records are kept and you can export your data for 30 days.",
        narrow: "Billing stops on " + instant(cyc.end_at) + ", the end of the cycle you paid for.",
        dialog: "Billing and renewal stop on " + instant(cyc.end_at) + ". Usage from this cycle is charged once after that. You can reactivate later, before 90 days have passed." };
    }
    return { card: null, dialog: "Your subscription for this site ends now and the unpaid monthly fee is not charged. Usage from your last paid cycle, if any, is still charged once." };
  }

  /* ---- notices ---- */
  function notice(tone, chipPair, title, bodyText, buttons, id) {
    var s = card(id, title, "bl-notice bl-notice-" + tone);
    var head = h("div", "bl-notice-head"); add(head, chip(chipPair)); s.insertBefore(head, s.firstChild);
    if (bodyText) add(s, para(bodyText));
    if (buttons && buttons.length) { var row = h("div", "bl-actions"); buttons.forEach(function (b) { add(row, b); }); add(s, row); }
    return s;
  }
  function noticeEl(code, p, vm) {
    var ov = p.ov, pay = p.pay, sub = ov.subscription, name = bname(ov.site.business_name), nc = pay.next_charge, A = vm.actions;
    if (code === "SUSPENDED") return suspendedEl(p, vm, name);
    if (code === "D") {
      var btns = [];
      if (A.reactivate) btns.push(btn("Reactivate", "primary", simplePost("reactivate/")));
      if (A.exportData) { var a = h("a", "no-btn no-btn-ghost", "Export data"); a.setAttribute("href", "mailto:support@negosyoonline.com"); btns.push(a); }
      return notice("cancelled", ["danger", "Cancelled"], name + " is cancelled",
        "Service ended " + dateShort(sub.service_end_at) + "." + (A.exportData ? " You can export your data until " + dateShort(sub.download_until) + "." : "") + (A.reactivate && sub.reactivate_until ? " You can reactivate until " + dateShort(sub.reactivate_until) + "." : "") + " Records are kept. Your statements stay available below.", btns, "n-d");
    }
    if (code === "D8B") {
      return notice("cancelled", ["danger", "Cancelled"], name + " is cancelled",
        "Billing and renewal stop on " + instant(sub.service_end_at) + " Manila time, the end of the cycle you already paid for. Usage from that cycle is charged once, after it ends.", null, "n-d8b");
    }
    if (code === "E") {
      return notice("attention", ["warn", "Final usage due"], "Last cycle’s usage is still to be paid",
        money(nc.total_amount) + " for usage above the included amounts in your last paid cycle. Paying it does not restart the subscription or start a new cycle.",
        A.retryFinal ? [btn("Retry final payment", "primary", simplePost("final-usage/retry/"))] : null, "n-e");
    }
    if (code === "A") {
      var rec = pay.recovery, body = "";
      if (rec) body = attentionLead(rec.days_left, rec.ends_at) + " so your subscription continues." + (rec.next_retry_at ? " We will try again on " + dateShort(rec.next_retry_at) + "." : "");
      var ab = [];
      if (A.updateMethod) ab.push(btn("Update payment method", "primary", startSetup));
      ab.push(btn("Cancel subscription", "danger", function (b) { openCancel(p, vm, b); }));
      return notice("attention", ["warn", "Payment needs attention"], "We couldn’t collect your payment", body, ab, "n-a");
    }
    if (code === "B") {
      return notice("info", ["info", "Confirming"], "We’re confirming your payment method",
        "Coming back from the payment page is not confirmation. Your method shows here once our payment provider confirms it, usually within a minute.",
        [btn("Check again", "ghost", checkAgain)], "n-b");
    }
    return notice("neutral", ["neutral", "Not available yet"], "Adding a payment method isn’t open yet", vm.noticeCBody, null, "n-c");
  }
  function suspendedEl(p, vm, name) {
    var ov = p.ov, pay = p.pay, sub = ov.subscription, nc = pay.next_charge, pm = pay.payment_method, A = vm.actions;
    var s = card("n-susp", name + " is suspended", "bl-notice bl-notice-cancelled");
    var head = h("div", "bl-notice-head"); add(head, chip(["danger", "Suspended"])); s.insertBefore(head, s.firstChild);
    var kept = sub.delete_after
      ? "Your records are kept until " + dateShort(sub.delete_after) + ". Pay before then to reactivate; after that date this website’s store data is anonymised."
      : "Your records are kept and are not deleted because of a suspension.";
    add(s, para("We couldn’t collect your subscription payment within the 7 days. Pay the balance to restore the subscription. " + kept));
    if (sub.download_until) add(s, para("You can export your data until " + dateShort(sub.download_until) + "."));
    if (A.reactivate && sub.reactivate_until && !sub.delete_after) add(s, para("You can pay and reactivate until " + dateShort(sub.reactivate_until) + "."));  // DV-18
    var due = h("div", "bl-due");
    if (nc && nc.kind === "reactivation") add(due, h("p", "bl-due-amount", money(nc.total_amount)), h("p", "bl-meta", "Unpaid since " + dateShort(sub.attention_started_at)));
    add(due, dl([["Plan", ov.plan.name + " · Monthly"], ["Plan price", money(ov.plan.price) + " per month"],
      pm && pm.status === "active" ? ["Payment method", "Card ending " + pm.last4] : null, ["Restores", "Right after payment clears"]]));
    add(s, due);
    var row = h("div", "bl-actions");
    if (A.reactivate) add(row, btn("Pay balance", "primary", simplePost("reactivate/")));
    if (ov.payments_available) add(row, btn("Update payment method", "ghost", startSetup));
    add(s, row);
    var links = h("p", "bl-links");
    var l1 = h("a", "bl-link", "See what your subscription includes"); l1.setAttribute("href", "#bl-h-fees");
    var l2 = h("a", "bl-link", "Full terms and cancellation"); l2.setAttribute("href", (D.cfg.siteUrl || "") + "/terms");
    add(links, l1, l2); add(s, links);
    return s;
  }

  /* ---- cards ---- */
  function statusCard(p, vm) {
    var ov = p.ov, pay = p.pay, sub = ov.subscription, cyc = ov.current_cycle, nc = pay.next_charge, trial = sub.state === "trial_active";
    /* A row, not a card: title and text on the left, the action on the right, divided by thin lines. */
    var s = card("status", vm.status.h2 && ov.subscription.state === "active" ? "Active Plan" : (vm.status.h2 || "Subscription"), "bl-status bl-row");
    if (!vm.status.h2) s.firstChild.className = "bl-sr";
    var main = h("div", "bl-row-main"), side = h("div", "bl-row-side"), title = s.firstChild;
    s.removeChild(title);
    stopCount();
    var counting = trial && !vm.trialBody && sub.trial_end_at;
    if (counting) { s.className += " bl-row-count"; title.className = "bl-sr"; } /* kept for screen readers; the visible title is the countdown label */
    var titleRow = h("div", "bl-row-title"); add(titleRow, title, counting ? h("span", "bl-h2", "Your free trial ends in") : chip(sub.state === "active" ? ["ok", "Monthly Plan"] : vm.status.chip)); /* an active site shows its billing interval; only monthly exists until the annual build */ add(main, titleRow); /* the countdown label already says "free trial", so no chip beside it */
    add(s, main, side);
    /* Ruling 2026-11-02 (P7.1): a trial may be cancelled at any time, so Cancel Plan shows in every state cards.cancel allows. In the
       trial countdown it sits in the side slot, centred below, so the centred countdown label stays centred (OD-1 option A). */
    if (vm.cards.cancel) { var cb = btn("Cancel Plan", "ghost", function (b) { openCancel(p, vm, b); }); cb.className += " bl-cancel-solid"; add(counting ? side : titleRow, cb); } /* otherwise right-most in the header row */
    if (trial) {
      if (vm.trialBody) add(main, para(vm.trialBody));
      else {
        if (counting) add(main, countdownEl(sub.trial_end_at));
        var endsP = h("p", "bl-p");
        add(endsP, h("span", "bl-line", "Your trial ends " + instant(sub.trial_end_at) + " Manila time."), document.createTextNode(" "),
          h("span", "bl-line", "After that, the subscription is " + money(ov.plan.price) + " per month for this site."));
        add(main, endsP);
      }
      return s;
    }
    add(main, dl([["Product", "NegosyoOnline Store", "bl-wide-row"], /* the interval is in the header chip */ ["Price", money(ov.plan.price) + " per month"],
      cyc ? ["Current cycle", rangeShort(cyc.start_at, cyc.end_at), "bl-wide-row"] : null,
      nc && nc.date ? ["Next payment", instant(nc.date)] : null,
      vm.cards.preview ? ["Estimated total", money(nc.total_amount), "bl-narrow-row"] : null]));
    /* Annual upsell (ruling 2026-10-29: PHP 24,990 per 12-month term, 10 monthly payments, switching at renewal only). Text only: switching is not built yet. */
    if (sub.state === "active") {
      var up = h("div", "bl-upsell");
      add(up, h("b", "bl-upsell-h", "Go annual, get 2 months free"),
        para("PHP 24,990 a year, paid in advance. You save PHP 4,998."));
      /* Not wired: the annual build has no API yet, so the button only says so instead of pretending to switch. */
      var upNote = para("Switching to annual isn’t open yet.", "bl-note"); upNote.hidden = true;
      var upBtn = btn("Switch to annual plan", "primary", function () { upNote.hidden = false; });
      add(up, upBtn, upNote);
      add(main, up);
    }
    return s;
  }
  function planCard(p, vm) {
    var ov = p.ov, nc = p.pay.next_charge, s = card("plan", "Plan");
    add(s, dl([["Plan", ov.plan.name], ["Billing", "Monthly"], ["Price", money(ov.plan.price) + " per month"],
      vm.cards.plan.firstPayment ? ["First payment", instant(nc.date)] : null]));
    add(s, para("Usage meters start with your first paid billing cycle. Nothing is metered or billed during the trial.", "bl-note"));
    return s;
  }
  function meterEl(count, included, over, label) {
    var m = h("div", "bl-meter"); m.setAttribute("role", "img"); m.setAttribute("aria-label", label);
    var f = h("span", "bl-meter-fill" + (over ? " over" : "")); f.style.width = pct(count, included) + "%";
    add(m, f); return m;
  }
  function usageCard(p, vm) {
    var ov = p.ov, u = ov.usage, cyc = ov.current_cycle, R = ov.rates, o = u.orders, running = ov.subscription.state !== "active";
    var s = card("usage", "Usage for this billing cycle");
    /* "?" beside a meter title: what the number means, as a hover/focus tooltip */
    function titled(name, tip) {
      var t = h("p", "bl-meter-title", name), q = h("button", "bl-tip", "?");
      q.setAttribute("type", "button"); q.setAttribute("aria-label", "About " + name.toLowerCase() + ": " + tip); q.setAttribute("data-tip", tip);
      add(t, q); return t;
    }
    var ord = h("div", "bl-meter-block");
    add(ord, titled("Processed orders", "Successful online orders placed this cycle, with SMS notifications included. Above " + whole(o.included) + " orders it is " + money(R.orders.unit_price) + " per order."), h("p", "bl-meter-val", whole(o.count) + " of " + whole(o.included) + " orders included"),
      meterEl(o.count, o.included, vm.over.orders, "Processed orders: " + whole(o.count) + " of " + whole(o.included) + " orders included"));
    if (vm.over.orders) add(ord, para(whole(o.over) + " orders above the allowance. " + money(o.amount) + " so far at " + money(R.orders.unit_price) + " each. " + (running ? "Charged once after this cycle ends." : "Billed with your next renewal."), "bl-over"));
    add(s, ord);
    [["storage", "Media storage", "stored"], ["video", "Video streaming", "streamed"]].forEach(function (m) {
      var snap = u[m[0]], rate = R[m[0]], blk = h("div", "bl-meter-block"), video = m[0] === "video";
      add(blk, titled(m[1], (video ? "Data viewers watched this cycle." : "Total media you store, measured at the end of the cycle.") + " Above " + rate.included_gb + " GB it is " + money(rate.unit_price) + " per GB."));
      var used = snap ? gb(snap.measured_bytes) : "0", lbl = used + " GB " + m[2] + " of " + rate.included_gb + " GB included";
      add(blk, h("p", "bl-meter-val", lbl), meterEl(snap ? snap.measured_bytes : 0, snap ? snap.included_bytes : rate.included_gb, snap ? vm.over[m[0]] : false, m[1] + ": " + lbl));
      add(s, blk);
    });
    return s;
  }
  function methodCard(p, vm) {
    var ov = p.ov, pm = p.pay.payment_method, A = vm.actions, s = card("method", "Payment method");
    var paid = null;
    p.pay.recent_attempts.forEach(function (a) { if (!paid && a.status === "paid") paid = a; });
    if (pm && pm.status === "active") {
      var row = h("div", "bl-method"), brand = (pm.brand || "").toLowerCase();
      add(row, h("span", "bl-brand", (pm.brand || "").toUpperCase()), h("span", "bl-method-name", brand.charAt(0).toUpperCase() + brand.slice(1) + " ending " + pm.last4), chip(["ok", "Active"]), pm.is_test ? chip(["test", "TEST DATA"]) : null);
      add(s, row);
      add(s, para((paid && !vm.cards.lastPayment ? "Last payment: " + money(paid.amount) + " on " + dateShort(paid.date) + ". " : "") + "Only the card brand and last 4 digits are shown.", "bl-note bl-wide"));
      if (A.replaceMethod) { var mrow = h("div", "bl-actions bl-actions-end"); add(mrow, btn("Replace payment method", "ghost", startSetup)); add(s, mrow); }
    } else if (pm && pm.status === "pending_setup") {
      add(s, chip(["info", "Waiting for confirmation"]), para("Your payment method shows here once our payment provider confirms it."));
    } else if (pm && pm.status === "setup_failed") {
      add(s, chip(["warn", "Not added"]), para("Adding the payment method did not finish. You can try again."));
      if (A.addMethod) add(s, btn("Add payment method", "primary", startSetup));
    } else {
      add(s, para(pm ? "No active payment method." : "No payment method added yet."));
      if (vm.cards.method.trialNote) add(s, para("You are not charged during the trial. Add a method before " + instant(ov.subscription.trial_end_at) + " so billing can start when the trial ends. You add it on a secure page hosted by our payment provider. NegosyoOnline never sees or stores your card number.", "bl-note"));
      if (A.addMethod) add(s, btn("Add payment method", "primary", startSetup));
    }
    return s;
  }
  function lastCard(p, vm) {
    var a = p.pay.recent_attempts[0], s = card("last", "Last payment");
    add(s, dl([["Date", dateShort(a.date)], ["Amount", money(a.amount)], ["Status", chip(vm.cards.lastPayment.chip)]]));
    return s;
  }
  function feesCard(p) {
    var ov = p.ov, R = ov.rates, s = card("fees", "What you pay and why");
    add(s, para("NegosyoOnline charges only for your subscription and the usage below. Your customers’ payments and sales are yours and never appear here."));
    var t = h("table", "bl-table"), tb = h("tbody", "");
    var hr = h("tr", ""); ["Charge", "Included", "Rate"].forEach(function (c) { var th = h("th", "", c); th.setAttribute("scope", "col"); add(hr, th); });
    add(t, add(h("thead", ""), hr));
    [["NegosyoOnline Subscription", "Monthly, per site", money(ov.plan.price) + " per month"],
      ["Processed orders", whole(R.orders.included) + " per billing cycle", money(R.orders.unit_price) + " per order above " + whole(R.orders.included)],
      ["Media storage", R.storage.included_gb + " GB", money(R.storage.unit_price) + " per GB above " + R.storage.included_gb + " GB"],
      ["Video delivery", R.video.included_gb + " GB", money(R.video.unit_price) + " per GB above " + R.video.included_gb + " GB"],
      ["Transactional SMS", "Free", "No charge"]].forEach(function (r) {
      var tr = h("tr", ""); r.forEach(function (c) { add(tr, h("td", "", c)); }); add(tb, tr);
    });
    add(t, tb); add(s, t);
    add(s, para("Usage above the included amounts is added to your next renewal payment. It is never charged on its own mid-cycle. 1 GB is 1,000,000,000 bytes.", "bl-note"));
    var links = h("p", "bl-links");
    var l1 = h("a", "bl-link", "Full terms"); l1.setAttribute("href", (D.cfg.siteUrl || "") + "/terms");
    var l2 = h("a", "bl-link", "Cancellation and Refund Policy"); l2.setAttribute("href", (D.cfg.siteUrl || "") + "/cancellation-refund");
    add(links, l1, l2); add(s, links);
    return s;
  }
  /* Billing details and billing address cards. Values come from ov.billing_profile; Save writes them for this site
     (PUT profile/), shows field errors inline and re-renders with the saved profile. The server checks every limit. */
  var DETAIL_FIELDS = [["company", "Company name"], ["tin", "TIN"], ["mobile", "Billing mobile"], ["email", "Billing email"]];
  var ADDRESS_FIELDS = [["line1", "Address line 1"], ["barangay", "Barangay"], ["city", "City"], ["province", "Province"], ["zip", "ZIP code"]];
  function profile(p) { return (p.ov && p.ov.billing_profile) || {}; }
  function detailsCard(p) {
    var d = profile(p), s = card("details", "Billing details");
    add(s, dl(DETAIL_FIELDS.map(function (f) { return [f[1], d[f[0]] || "Not set"]; })));
    var row = h("div", "bl-actions bl-actions-end"); add(row, btn("Update", "ghost", function (b) { openForm("Billing details", DETAIL_FIELDS, d, b); })); add(s, row);
    return s;
  }
  function addressCard(p) {
    var a = profile(p), s = card("address", "Billing address");
    var region = [a.province, a.zip].filter(Boolean).join(", ");
    add(s, dl([["Address line 1", a.line1 || "Not set"], ["Barangay", a.barangay || "Not set"], ["City", a.city || "Not set"],
      ["Province, ZIP, Country", region ? region + ", PH" : "Not set"]]));
    var row = h("div", "bl-actions bl-actions-end"); add(row, btn("Update", "ghost", function (b) { openForm("Billing address", ADDRESS_FIELDS, a, b); })); add(s, row);
    return s;
  }
  function openForm(titleText, fields, values, opener) {
    var slot = clear(byId("bl-dialog-slot")), overlay = h("div", "bl-overlay"), dlg = h("div", "bl-dialog"), inputs = [], errs = {}, save;
    dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "bl-h-form");
    var title = h("h2", "bl-h2", titleText); title.setAttribute("id", "bl-h-form"); add(dlg, title);
    fields.forEach(function (f) {
      var lab = h("label", "bl-label", f[1]), input = h("input", "bl-input");
      lab.setAttribute("for", "bl-f-" + f[0]); input.setAttribute("id", "bl-f-" + f[0]); input.setAttribute("type", "text"); input.setAttribute("maxlength", f[0] === "zip" ? "4" : f[0] === "tin" || f[0] === "mobile" ? "32" : "200");
      input.value = values[f[0]] || ""; inputs.push(input); add(dlg, lab, input);
      var er = h("p", "bl-field-error", ""); er.setAttribute("id", "bl-e-" + f[0]); er.hidden = true; errs[f[0]] = { input: input, node: er }; add(dlg, er);
    });
    function setErrors(map) {
      fields.forEach(function (f) {
        var e = errs[f[0]], msg = map && map[f[0]], has = typeof msg === "string" && msg !== "";
        e.node.textContent = has ? msg : ""; e.node.hidden = !has;
        if (has) { e.input.setAttribute("aria-invalid", "true"); e.input.setAttribute("aria-describedby", "bl-e-" + f[0]); e.input.classList.add("bl-input-invalid"); }
        else { e.input.removeAttribute("aria-invalid"); e.input.removeAttribute("aria-describedby"); e.input.classList.remove("bl-input-invalid"); }
      });
      for (var i = 0; i < fields.length; i++) { if (map && typeof map[fields[i][0]] === "string") { inputs[i].focus(); break; } }
    }
    var cancel = btn("Cancel", "ghost", function () { close(true); });
    save = btn("Save", "primary", function (b) {
      var body = {};
      fields.forEach(function (f, i) { body[f[0]] = (inputs[i].value || "").trim(); });
      setErrors(null);
      put(base() + "profile/", body, b).then(function (res) {
        if (!res) return;
        if (!res.ok) {
          var map = res.data && res.data.fields;
          if (res.status === 400 && map && typeof map === "object" && Object.keys(map).length) { setErrors(map); return; }
          D.toast("That did not work", errMsg(res), "error"); return;
        }
        close(true);
        lastPayload.ov.billing_profile = res.data || body; render(lastPayload, null);
        D.toast("Saved", titleText + " saved.");
      });
    });
    var row = h("div", "bl-actions"); add(row, cancel, save); add(dlg, row); add(overlay, dlg); add(slot, overlay);
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(true); return; }
      if (e.key !== "Tab") return;
      var items = inputs.concat([cancel, save]), first = items[0], last = items[items.length - 1], now = document.activeElement;
      if (e.shiftKey && (now === first || items.indexOf(now) < 0)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (now === last || items.indexOf(now) < 0)) { e.preventDefault(); first.focus(); }
    }
    function close(returnFocus) {
      document.removeEventListener("keydown", onKey); dialogKey = null; clear(slot);
      if (returnFocus && opener && opener.focus) opener.focus();
    }
    dialogKey = onKey; document.addEventListener("keydown", onKey);
    inputs[0].focus();
  }
  /* A payment with no statement yet: show what the payment record holds, read-only. */
  function openPayment(a, pm, opener) {
    var slot = clear(byId("bl-dialog-slot")), overlay = h("div", "bl-overlay"), dlg = h("div", "bl-dialog");
    dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "bl-h-pay");
    var title = h("h2", "bl-h2", "Payment details"); title.setAttribute("id", "bl-h-pay");
    var brand = pm && pm.brand ? pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1).toLowerCase() + " ending " + pm.last4 : null;
    var rows = [["Paid on", dateShort(a.date)], ["Product", "NegosyoOnline Store"], ["Plan", "Monthly"], ["Amount", money(a.amount)], ["Status", chip(ATTEMPT_CHIP[a.status] || ["neutral", a.status])], brand ? ["Payment method", brand] : null];
    var done = btn("Close", "primary", function () { close(true); }), row = h("div", "bl-actions");
    add(row, done); add(dlg, title, dl(rows), para("Your billing statement for this payment appears in Billing History once it is issued.", "bl-note"), row); add(overlay, dlg); add(slot, overlay);
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if (e.key === "Tab") { e.preventDefault(); done.focus(); }
    }
    function close(returnFocus) {
      document.removeEventListener("keydown", onKey); dialogKey = null; clear(slot);
      if (returnFocus && opener && opener.focus) opener.focus();
    }
    dialogKey = onKey; document.addEventListener("keydown", onKey);
    done.focus();
  }
  function statementsShell() {
    var s = card("statements", "Billing History", "bl-statements"); s.setAttribute("id", "bl-statements");
    stBody = h("div", "bl-statements-body", ""); add(stBody, para("Loading statements.", "bl-meta")); add(s, stBody);
    return s;
  }

  function render(p, focusTarget) {
    var ov = p.ov, vm = viewModel(ov, p.pay, null, p.search), r = clear(rootEl());
    r.removeAttribute("aria-busy");
    vm.notices.forEach(function (code) { add(r, noticeEl(code, p, vm)); });
    var trial = ov.subscription.state === "trial_active";
    var status = statusCard(p, vm);
    if (trial) {
      add(r, status);
      var pair = h("div", "bl-grid"); add(pair, planCard(p, vm), methodCard(p, vm)); add(r, pair);
      var info = h("div", "bl-grid"); add(info, detailsCard(p), addressCard(p)); add(r, info);
      add(r, statementsShell());
    } else {
      var split = h("div", "bl-grid-split"); add(split, status, vm.cards.usage ? usageCard(p, vm) : null); add(r, split);
      var mid = h("div", "bl-grid"); add(mid, methodCard(p, vm), vm.cards.lastPayment ? lastCard(p, vm) : null); add(r, mid);
      var info = h("div", "bl-grid"); add(info, detailsCard(p), addressCard(p)); add(r, info);
      add(r, statementsShell());
    }
    if (stCache && stCache.site === p.site) renderStatements(stCache.res, p);
    if (focusTarget === "method") { var t = byId("bl-h-method"); if (t) t.focus(); }
  }

  /* ---- authenticated downloads and the receipt image (spec 8.8): fetch with the bearer header, read a Blob ---- */
  function receiptAbsent() {
    var host = byId("bl-receipt"); if (!host) return;
    clear(host); add(host, para("No physical receipt has been attached to this statement yet."));
  }
  function fetchBlob(path, filename, b, asImage) {
    if (b && b.getAttribute("aria-busy") === "true") return Promise.resolve(null);
    if (b) b.setAttribute("aria-busy", "true");
    return fetch(D.cfg.apiBase + path, { headers: { Authorization: "Bearer " + D.getToken() } }).then(function (r) {
      if (r.status === 401) { D.setToken(""); location.replace((D.cfg.siteUrl || "") + "/?signin=1"); return null; }
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (r.status === 500 && data && data.code === "statement_integrity_error") panelI();
          else if (data && data.code === "receipt_not_found") receiptAbsent();
          else D.toast("That did not work", typeof data.message === "string" ? data.message : "", "error");
          return null;
        });
      }
      return r.blob().then(function (blob) {
        var url = URL.createObjectURL(blob);
        if (asImage) { urls.push(url); return url; }
        var a = document.createElement("a"); a.href = url; a.download = typeof filename === "function" ? filename(blob) : filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 0);
        return url;
      });
    }).catch(function () { D.toast("That did not work", "We could not reach the server. Please check your connection and try again.", "error"); return null; })
      .then(function (v) { if (b) b.removeAttribute("aria-busy"); return v; });
  }
  function linkBtn(label, fn) {
    var b = h("button", "bl-link-btn", label); b.setAttribute("type", "button");
    b.addEventListener("click", function () { fn(b); });
    return b;
  }
  /* The one row action: open that statement's detail view (the PDF, data file and receipt are downloaded from there). */
  function actionBtns(number) {
    return [btn("View Details", "ghost", function (b) { openFromList(number, b); })];
  }

  /* ---- statements card (design 4.4) ---- */
  function openFromList(number, a) {
    openerNumber = number;
    try { history.pushState(null, "", "/settings/billing/?site=" + lastPayload.site + "&statement=" + encodeURIComponent(number)); } catch (e) { /* ignore */ }
    openDetail(number, true);
  }
  function numberLink(number) {
    var a = h("a", "bl-num", number); a.setAttribute("data-number", number);
    a.setAttribute("href", "/settings/billing/?site=" + lastPayload.site + "&statement=" + encodeURIComponent(number));
    a.addEventListener("click", function (e) { e.preventDefault(); openFromList(number, a); });
    return a;
  }
  function renderStatements(res, p) {
    if (!stBody) return;
    stCache = { site: p.site, res: res }; /* a re-render of the page repaints the card from this, without a request */
    clear(stBody);
    if (!res.ok) {
      var err = h("div", "bl-panel-err"); err.setAttribute("role", "alert");
      add(err, h("h3", "bl-h3", "We couldn’t load your billing"), para("Check your connection and try again. Nothing was changed."),
        btn("Try again", "ghost", function () { load(false); focusTop(); }));
      add(stBody, err); return;
    }
    var list = (res.data && res.data.statements) || [], vm = viewModel(p.ov, p.pay, null, p.search);
    /* The label is shown on the statement itself (detail view) and as the footnote under this list. */
    if (!list.length) {
      /* No statements yet (the flag is off): list the payments that went through, so history agrees with Last payment. */
      var paidRows = p.pay.recent_attempts.filter(function (a) { return a.status === "paid"; });
      if (paidRows.length) {
        var pt = h("table", "bl-table"), phr = h("tr", ""), ptb = h("tbody", "");
        add(pt, h("caption", "bl-sr", "Payments received"));
        ["Paid on", "Product", "Plan", "Total", "Status", "Action"].forEach(function (c) { var th = h("th", c === "Total" ? "bl-num-cell" : (c === "Status" || c === "Action" ? "bl-mid-cell" : ""), c); th.setAttribute("scope", "col"); add(phr, th); });
        add(pt, add(h("thead", ""), phr));
        paidRows.forEach(function (a) {
          add(ptb, add(h("tr", ""), h("td", "", dateShort(a.date)), h("td", "", "NegosyoOnline Store"), h("td", "", "Monthly"), h("td", "bl-num-cell", money(a.amount)), add(h("td", "bl-mid-cell"), chip(ATTEMPT_CHIP[a.status] || ["neutral", a.status])), add(h("td", "bl-dl-cell bl-mid-cell"), btn("View Details", "ghost", function (b) { openPayment(a, p.pay.payment_method, b); }))));
        });
        add(pt, ptb); add(stBody, pt, para("Your billing statements appear here once they are issued.", "bl-note"));
        return;
      }
      var box = h("div", "bl-empty bl-empty-center"); add(box, para("No payments yet. Your billing statements appear here once they are issued.", "bl-p"));
      add(stBody, box); return;
    }
    var rows = list.map(function (it) { return { it: it, v: statementRow(it) }; }), name = bname(p.ov.site.business_name);
    var table = h("table", "bl-table bl-desk"), cap = h("caption", "bl-sr", "Internal billing statements for " + name);
    add(table, cap);
    var hr = h("tr", ""); ["Issued", "Product", "Plan", "Cycle", "Total", "Action"].forEach(function (c) { var th = h("th", c === "Total" ? "bl-num-cell" : "", c); th.setAttribute("scope", "col"); add(hr, th); });
    add(table, add(h("thead", ""), hr));
    var tb = h("tbody", ""), cards = h("div", "bl-mobile");
    rows.forEach(function (r) {
      var it = r.it, v = r.v, tr = h("tr", ""), dn = h("td", "bl-dl-cell");
      actionBtns(it.number).forEach(function (b) { add(dn, b); });
      add(tr, h("td", "", dateShort(it.issued_at)), h("td", "", "NegosyoOnline Store"), h("td", "", it.billing_interval === "year" ? "Annual" : "Monthly" /* the statements API has no interval field yet; only monthly exists */), h("td", "", v.cycleText), h("td", "bl-num-cell", v.total), dn);
      add(tb, tr);
      var art = h("article", "bl-art"), top = h("div", "bl-art-top");
      var dl2 = h("div", "bl-art-dl"), facts = h("dl", "bl-art-facts");
      add(top, numberLink(it.number));
      /* the same six facts as the desktop columns, each labelled */
      [["Issued", dateShort(it.issued_at)], ["Product", "NegosyoOnline Store"], ["Plan", it.billing_interval === "year" ? "Annual" : "Monthly"], ["Cycle", v.cycleText], ["Total", v.total]].forEach(function (f) {
        add(facts, h("dt", "", f[0]), h("dd", f[0] === "Total" ? "bl-art-total" : "", f[1]));
      });
      actionBtns(it.number).forEach(function (b) { add(dl2, b); });
      add(art, top, facts, dl2);
      add(cards, art);
    });
    add(table, tb); add(stBody, table, cards);
    add(stBody, para(LABEL, "bl-note"));
    if (res.data.has_more) add(stBody, para("Showing the 200 most recent documents. Ask support@negosyoonline.com for older ones.", "bl-meta"));
    if (openerNumber) {
      var again = stBody.querySelector ? stBody.querySelector('[data-number="' + openerNumber + '"]') : null;
      openerNumber = null; if (again) again.focus();
    }
  }

  /* ---- statement detail (design 4.4, board C) ---- */
  function backToList(push) {
    if (push) { try { history.pushState(null, "", "/settings/billing/?site=" + lastPayload.site); } catch (e) { /* ignore */ } }
    revokeAll();
    var mine = token; render(lastPayload, null);
    api(base() + "statements/").then(function (s) { if (mine === token) renderStatements(s, lastPayload); });
  }
  function detailCard(id, title) { return card(id, title, "bl-detail-card"); }
  function openDetail(number, focus) {
    var mine = token;
    api(base() + "statements/" + encodeURIComponent(number) + "/").then(function (res) {
      if (mine !== token || res.status === 401) return;
      if (res.status === 404) {
        D.toast("That statement was not found.", "", "error");
        try { history.replaceState(null, "", "/settings/billing/?site=" + lastPayload.site); } catch (e) { /* ignore */ }
        backToList(false); return;
      }
      if (res.status === 500 && res.data && res.data.code === "statement_integrity_error") { panelI(); return; }
      if (!res.ok) { D.toast("That did not work", errMsg(res), "error"); backToList(true); return; }
      var data = res.data, doc = data.document;
      if (!doc || doc.label !== LABEL) { panelI(); return; }
      renderDetail(data, number, focus);
    });
  }
  function renderDetail(data, number, focus) {
    var tk = token, doc = data.document, p = lastPayload, r = clear(rootEl()), credit = doc.document_type === "credit_note", path = base() + "statements/" + encodeURIComponent(number) + "/";
    r.removeAttribute("aria-busy");
    var back = h("a", "bl-back", "← Back to Billing"); back.setAttribute("href", "/settings/billing/?site=" + p.site);
    back.addEventListener("click", function (e) { e.preventDefault(); openerNumber = number; backToList(true); });
    var head = h("div", "bl-detail-head"), h1 = h("h1", "bl-h1", doc.number); h1.setAttribute("id", "bl-h-detail"); h1.setAttribute("tabindex", "-1");
    add(head, h1);
    add(head, data.status === "replaced" ? chip(["neutral", "Replaced by " + data.replaced_by]) : chip(["ok", "Issued"]));
    if (data.receipt) add(head, chip(["ok", "Receipt on file"]));
    if (doc.is_test) add(head, chip(["test", "TEST DATA"]));
    if (credit) add(head, chip(["info", "Credit"]));
    var note = h("div", "bl-labelnote", LABEL); note.setAttribute("role", "note");
    add(r, back, head, note);

    var lines = detailCard("lines", "What this payment covers"), t = h("table", "bl-table"), cap = h("caption", "bl-sr", "Statement lines");
    add(t, cap);
    var hr = h("tr", ""); ["Description", "Qty", "Unit (PHP)", "Amount (PHP)"].forEach(function (c) { var th = h("th", c === "Description" ? "" : "bl-num-cell", c); th.setAttribute("scope", "col"); add(hr, th); });
    add(t, add(h("thead", ""), hr));
    var tb = h("tbody", "");
    detailRows(data.display_rows || []).forEach(function (row) {
      var tr = h("tr", ""), c1 = h("td", ""); add(c1, h("span", "bl-line-desc", row.desc), row.note ? h("span", "bl-sub-line", row.note) : null);
      add(tr, c1, h("td", "bl-num-cell", row.qty), h("td", "bl-num-cell", row.unit), h("td", "bl-num-cell", row.amount)); add(tb, tr);
    });
    add(t, tb); add(lines, t);
    var T = doc.totals;
    /* Left of the totals: when and how it was issued, then the footnote. */
    var foot = h("div", "bl-lines-foot"), info = h("div", "bl-lines-info"), kindText = { first: "First payment", renewal: "Renewal", recovery: "Retry", reactivation: "Reactivation", final_usage: "Final usage" };
    add(info, dl([["Issued", doc.issued_at_display], doc.payment ? ["Payment", kindText[doc.payment.kind] || doc.payment.kind] : null,
      doc.payment ? ["Payment reference", doc.payment.reference] : null].filter(Boolean)),
      para("Every line comes from the frozen record made when this statement was issued. Order lines are shown one per order. This page never recalculates them.", "bl-note"));
    add(foot, info, dl([["Subtotal", T.subtotal], ["Tax", T.tax], ["Total", money(T.total), "bl-total"],
      T.amount_paid != null ? ["Paid", money(T.amount_paid)] : null, T.balance != null ? ["Balance", money(T.balance)] : null]));
    add(lines, foot);
    add(r, lines);

    /* Download PDF sits at the top of the lines card, on the title row. */
    var pdfBtn = btn("Download PDF", "primary", function (b) { fetchBlob(path + "pdf/", number + ".pdf", b); }); pdfBtn.className += " bl-lines-dl";
    add(lines, pdfBtn);
    var pair = h("div", "bl-detail-pair"); /* receipt details on the left, the receipt photo on the other side */

    if (!credit) {
      var rc = detailCard("receipt", "Physical receipt"); rc.setAttribute("id", "bl-receipt-card");
      var host = h("div", "bl-receipt"); host.setAttribute("id", "bl-receipt");
      if (data.receipt) {
        var R = data.receipt, panel = h("div", "bl-receipt-img");
        if (R.content_type !== "application/pdf") {
          fetchBlob(path + "receipt/", number + "-receipt." + receiptExt(R.content_type), null, true).then(function (url) {
            if (!url || tk !== token) return;
            var img = h("img", "bl-receipt-photo"); img.setAttribute("alt", "Photo of the physical receipt"); img.setAttribute("src", url);
            clear(panel); add(panel, img);
          });
        }
        add(host, panel,
          para("A record copy of the receipt NegosyoOnline issued by hand for this payment. It was uploaded by NegosyoOnline staff. It is not generated by this system."));
        /* Left card: what is printed on the receipt. Optional fields show only when the record carries them. */
        var dlc = detailCard("receipt-details", "Receipt details");
        var rBtn = btn("Download Receipt", "primary", function (b) { fetchBlob(path + "receipt/", number + "-receipt." + receiptExt(R.content_type), b); }); rBtn.className += " bl-lines-dl";
        add(dlc, rBtn, dl([["Receipt number", R.receipt_number], ["Receipt date", dateShort(R.issued_on)],
          ["Issued by", R.issuer], ["Tax status", R.tax_status], ["TIN", R.tin],
          ["Business address", R.address]]
          .filter(function (x) { return x[1]; })));
        add(pair, dlc);
      } else {
        /* Receipts are uploaded on the 5th of each month: the first 5th after the statement was issued. A due date that
           has already passed on the server is never promised (R2-02: the server as_of, never the browser clock). */
        add(host, para("No physical receipt has been attached to this statement yet. It will be uploaded " +
          receiptDueText(doc.issued_at, lastPayload && lastPayload.ov && lastPayload.ov.as_of) + "."));
      }
      add(rc, host); add(pair, rc); add(r, pair);
    }
    if (focus) h1.focus();
  }
  /* ---- cancel dialog (design 4.5, spec 8.7): modal, Esc closes, Tab stays inside, focus returns to the opener ---- */
  function openCancel(p, vm, opener) {
    var slot = clear(byId("bl-dialog-slot")), c = cancelCopy(vm, p.ov), name = bname(p.ov.site.business_name);
    var overlay = h("div", "bl-overlay"), dlg = h("div", "bl-dialog");
    dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "bl-h-cancel");
    var title = h("h2", "bl-h2", "Cancel " + name + "?"); title.setAttribute("id", "bl-h-cancel");
    var lab = h("label", "bl-label", "Reason (optional)"), input = h("input", "bl-input");
    lab.setAttribute("for", "bl-reason"); input.setAttribute("id", "bl-reason"); input.setAttribute("type", "text"); input.setAttribute("maxlength", "200");
    var keep = btn("Keep subscription", "primary", function () { close(true); });
    var yes = btn("Yes, cancel", "danger", function (b) {
      var reason = (input.value || "").trim();
      post(base() + "cancel/", reason ? { reason: reason } : {}, b).then(function (res) {
        if (!res) return;
        if (!res.ok) { failed(res); return; } /* the dialog stays open on a failure */
        close(false); lastPayload.pay = res.data;
        refresh().then(focusTop);
        D.refreshAccount && D.refreshAccount(); /* the sidebar chip follows the cancel (OI540) */
      });
    });
    var row = h("div", "bl-actions"); add(row, keep, yes);
    add(dlg, title, para(c.dialog), lab, input, row); add(overlay, dlg); add(slot, overlay);
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(true); return; }
      if (e.key !== "Tab") return;
      var items = [input, keep, yes], first = items[0], last = items[items.length - 1], now = document.activeElement;
      if (e.shiftKey && (now === first || items.indexOf(now) < 0)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (now === last || items.indexOf(now) < 0)) { e.preventDefault(); first.focus(); }
    }
    function close(returnFocus) {
      document.removeEventListener("keydown", onKey); dialogKey = null; clear(slot);
      if (returnFocus && opener && opener.focus) opener.focus();
    }
    dialogKey = onKey; document.addEventListener("keydown", onKey);
    keep.focus();
  }


  window.NOBilling = { show: show, hide: hide, util: { money: money, whole: whole, gb: gb, pct: pct, dateShort: dateShort,
    instant: instant, rangeShort: rangeShort, rangeLong: rangeLong, trialHead: trialHead, attentionLead: attentionLead,
    pickSite: pickSite, pickStatement: pickStatement, afterFetch: afterFetch, viewModel: viewModel,
    statementRow: statementRow, detailRows: detailRows, receiptDueText: receiptDueText } };
})();
