/* Billing page (/settings/billing/), ClickUp z8uq9mek5q. SaaS plan only, paid by bank transfer with a proof.
   Reads GET /sites/{id}/billing/, billing/payment/, billing/payments/ and, for the Annual saving, GET /plan/;
   writes POST billing/payments/ (multipart), billing/cancel/ and billing/reactivate/; a proof is shown only from
   billing/payments/{id}/proof/ through a blob URL. Every status, date and amount comes from the API; the only
   browser arithmetic is integer centavos to pesos for display. API strings reach the page through textContent only.
   Nothing is kept in the browser: no storage, and no payment detail outlives the form.
   Owner documents (ClickUp z8uq9mhbgh), under Payment history, each its own card and each hidden when its route answers 404 (its switch is off):
   GET billing/statements/ (limit, cursor), statements/{number}/ and statements/{number}/pdf/; GET billing/invoices/ and invoices/{id}/copy/;
   GET and PUT billing/profile/. The PDF and the invoice copy are fetched with the sign-in cookie and held as a blob URL, never as an address. */
(function () {
  var D = window.NODash;
  var TZ = "Asia/Manila";
  var SUPPORT = "support@negosyoonline.com";
  var BEST_BADGE = "Best Value";
  var PLANS = {
    monthly: { name: "NegosyoOnline Monthly", card: "NegosyoOnline Monthly", short: "Monthly" },
    launch_promo: { name: "NegosyoOnline Launch Promo (6 Months)", card: "Launch Promo (6 Months)", short: "Launch Promo (6 months)" },
    annual: { name: "NegosyoOnline Annual", card: "NegosyoOnline Annual", short: "Annual" }
  };
  var ORDER = ["monthly", "launch_promo", "annual"];
  var FEATURES = ["Storefront and orders in one place", "One online shop", "Hosting and security updates", "No platform fees on your sales",
    "No hidden fees, no VAT added", "Free custom domain, like yourbusiness.com, after your first payment"];
  var REASONS = {
    unreadable: "We could not read your proof. Send a clearer photo or file.",
    amount_mismatch: "The amount we received is not the amount due.",
    not_received: "We did not see the transfer in our account.",
    wrong_account: "The transfer went to a different account.",
    duplicate: "This transfer was already counted.",
    other: "Another reason"
  };
  var NOT_PAYABLE = {
    billing_exempt: "Billing does not apply to this site.",
    cancel_scheduled: "Your subscription is cancelled. Keep your subscription first, then pay.",
    past_deletion_date: "The last date to pay has passed. Email " + SUPPORT + ".",
    paid_ahead: "You have already paid for the next term."
  };
  var NOTRIAL_NOTE = "Billing is for your site’s plan. It includes 500 orders a month; orders above 500 are PHP 5 each. NegosyoOnline never takes a share of your sales.";
  var TYPES = ["image/jpeg", "image/png", "application/pdf"];

  /* ---- pure helpers (no document access; exported as NOBilling.util and node-tested) ---- */
  function q(search, key) { var m = new RegExp("[?&]" + key + "=([^&#]*)").exec(search || ""); if (!m) return null; try { return decodeURIComponent(m[1]); } catch (e) { return null; } }
  function groups(intPart) { var s = intPart, out = ""; while (s.length > 3) { out = "," + s.slice(-3) + out; s = s.slice(0, -3); } return s + out; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  /* Integer centavos to "PHP 4,999.00": an integer split, never decimal arithmetic. */
  function peso(c) { var n = Math.abs(Math.round(+c || 0)); return "PHP " + (c < 0 ? "-" : "") + groups(String(Math.floor(n / 100))) + "." + pad(n % 100); }
  function fmt(iso, opts) { return new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: TZ }, opts)).format(new Date(iso)).replace(/[  ]/g, " "); }
  function dateShort(iso) { return iso ? fmt(iso, { month: "short", day: "numeric", year: "numeric" }) : ""; }
  function instant(iso) { return iso ? dateShort(iso) + ", " + fmt(iso, { hour: "numeric", minute: "2-digit", hour12: true }) : ""; }
  function range(a, b) { return dateShort(a) + " to " + dateShort(b); }
  /* Plan usage (z8uq9mhbgp): "Nov 21 – Dec 20", the year only when the two dates are in different years. */
  function dateNoYear(iso) { return iso ? fmt(iso, { month: "short", day: "numeric" }) : ""; }
  /* period_end is an exclusive instant: the last included day is the day of (period_end minus 1 ms). */
  function lastDay(iso) { var t = new Date(iso).getTime(); return isNaN(t) ? iso : new Date(t - 1).toISOString(); }
  function periodText(a, b) {
    if (!a || !b) return "";
    var e = lastDay(b);
    return fmt(a, { year: "numeric" }) === fmt(e, { year: "numeric" }) ? dateNoYear(a) + " – " + dateNoYear(e) : dateShort(a) + " – " + dateShort(e);
  }
  /* 1 GB = 1,000,000,000 bytes. The used figure has one decimal place; a whole-number limit reads "5 GB". */
  function gbText(bytes, trim) { var t = (Math.max(0, +bytes || 0) / 1e9).toFixed(1); return (trim ? t.replace(/\.0$/, "") : t) + " GB"; }
  /* Whole-number percent used, rounded down so "100%" is never shown before the limit is reached; null when the limit is not a positive number. */
  function pctOf(used, limit) { return limit > 0 && used >= 0 ? Math.floor(used * 100 / limit) : null; }
  var ORDER_SUB = {
    billing_month: "Orders placed on your store this billing month, not counting cancelled ones.",
    trial: "Orders placed on your store during your trial, not counting cancelled ones.",
    calendar_month: "Orders placed on your store this month, not counting cancelled ones."
  };
  function planOf(code) { return PLANS[code] || { name: code || "Plan", card: code || "Plan", short: code || "Plan" }; }
  function sortOffers(list) {
    var rank = function (o) { var i = ORDER.indexOf(o.plan); return i < 0 ? ORDER.length : i; };
    return (list || []).slice().sort(function (a, b) { return rank(a) - rank(b); });
  }
  function perUnit(o) { return o.months === 1 ? " a month" : o.months === 12 ? " a year" : ""; }
  /* "A, PHP 1; B, PHP 2 a month; or C, PHP 3 a year." from the offers the backend names. */
  function offersLine(offers) {
    var parts = sortOffers(offers).map(function (o) { return planOf(o.plan).name + ", " + peso(o.amount_centavos) + perUnit(o); });
    if (!parts.length) return "";
    if (parts.length === 1) return parts[0] + ".";
    return parts.slice(0, -1).join("; ") + "; or " + parts[parts.length - 1] + ".";
  }
  /* "6 months, starts when your trial ends on Nov 22, 2026." (the period start is the backend's). */
  function startsText(o, inTrial) {
    if (o.starts_at_confirmation) return "starts when your payment is approved";
    return o.period_start_at ? (inTrial ? "starts when your trial ends on " : "starts on ") + dateShort(o.period_start_at) : "starts when your payment is approved";
  }
  function monthsText(o) { return o.months === 1 ? "1 month" : o.months + " months"; }
  function offerLines(o, inTrial) {
    var first = (o.plan === "annual" ? "Pay for a year. " : "") + monthsText(o) + ", " + startsText(o, inTrial) + ".";
    if (o.then && o.plan === "launch_promo") {
      return [first + " Then " + peso(o.then.amount_centavos) + " a month " + (o.then.first_due_at ? "from " + dateShort(o.then.first_due_at) : "after that") + "."];
    }
    return [first];
  }
  function consentText(o, inTrial) {
    var c = o.consent || {}, then = c.then || o.then || {}, due = c.first_due_at || then.first_due_at;
    return "Launch Promo: " + peso(o.amount_centavos) + " paid once for " + monthsText(o) + ", " + (o.starts_at_confirmation ? "starting when your payment is approved"
      : o.period_start_at ? "starting " + (inTrial ? "when your trial ends on " : "on ") + dateShort(o.period_start_at) : "starting when your payment is approved") +
      ". After that your site continues at " + peso(then.amount_centavos) + " a month, with the first monthly payment due " + (due ? dateShort(due) : "when the " + monthsText(o) + " end") +
      ". Cancel any time before then to stop it.";
  }
  /* "4,999" or "4999.5" to "4999.00" / "4999.50", or null when it is not a positive peso amount with at most 2 decimals. */
  function amountText(raw) {
    var m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(raw == null ? "" : raw).replace(/,/g, "").trim());
    if (!m) return null;
    var whole = m[1].replace(/^0+(?=\d)/, ""), frac = ((m[2] || "") + "00").slice(0, 2);
    return /^0+$/.test(whole) && /^0+$/.test(frac) ? null : whole + "." + frac;
  }
  /* Date + 1 to 12 + minute + AM/PM to the backend's local Manila "YYYY-MM-DDTHH:MM". */
  function localStamp(date, hour, minute, ap) { return date + "T" + pad((+hour % 12) + (ap === "PM" ? 12 : 0)) + ":" + minute; }
  /* The current Manila wall time as "YYYY-MM-DDTHH:MM" (to refuse a future time before any call). */
  function manilaNow(d) {
    var p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(d || new Date()).forEach(function (x) { p[x.type] = x.value; });
    return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute;
  }
  function mb(bytes) { return Math.max(1, Math.round(bytes / 1048576)) + " MB"; }
  /* The page's checks, the backend's rules: errors by field key, empty when the form may be sent. */
  function validate(v, ctx) {
    var e = {};
    function text(key, val, max, label) {
      var s = String(val || "").trim();
      if (!s) e[key] = label + " is required."; else if (s.length > max) e[key] = label + " is too long.";
    }
    text("bank", v.bank, 80, "Sender bank"); text("ref", v.ref, 64, "Reference number");
    text("first", v.first, 80, "First name"); text("last", v.last, 80, "Last name");
    var acct = String(v.acct || "").trim();
    if (!acct) e.acct = "Account number is required.";
    else if (!/^[0-9 -]+$/.test(acct) || acct.length < 6 || acct.length > 34) e.acct = "Use 6 to 34 digits, spaces or dashes.";
    if (!String(v.amount || "").trim()) e.amount = "Amount is required.";
    else if (!amountText(v.amount)) e.amount = "Enter a peso amount above zero, with up to 2 decimals.";
    if (!v.date || !v.hour || !v.minute || !v.ap) e.time = "Choose the date and the time of the transfer.";
    else if (localStamp(v.date, v.hour, v.minute, v.ap) > ctx.now) e.time = "The time of transfer cannot be in the future.";
    if (!v.file) e.file = "Add your payment receipt.";
    else if (TYPES.indexOf(v.file.type) < 0) e.file = "The receipt must be a JPEG, PNG or PDF.";
    else if (v.file.size > ctx.maxBytes) e.file = "The receipt is too large. The limit is " + mb(ctx.maxBytes) + ".";
    if (ctx.needConsent && !v.consent) e.consent = "Tick the box to accept the Launch Promo terms.";
    return e;
  }
  /* Why a refused submit, in words (never the raw API text). */
  function refusal(res) {
    var c = res && res.data && res.data.code, s = res && res.status;
    if (s === 429 || c === "rate_limited") return "You have sent too many proofs. Please try again in an hour.";
    if (c === "paid_ahead") return NOT_PAYABLE.paid_ahead;
    if (c === "too_early") return "You can pay for the next term later. The date is shown on this page.";
    if (c === "past_deletion_date") return NOT_PAYABLE.past_deletion_date;
    if (c === "billing_exempt") return NOT_PAYABLE.billing_exempt;
    if (c === "cancel_scheduled") return NOT_PAYABLE.cancel_scheduled;
    if (c === "already_cancelled") return "Your subscription is already cancelled.";
    if (c === "payment_required") return "Your service has already ended. Pay to bring your site back.";
    if (s === 0) return "We could not reach the server. Please check your connection and try again.";
    if (s === 400) return "Please check the details and try again.";
    return "That did not work. Please try again.";
  }
  var FIELD_OF = { transferred_at: "time", transferred_on: "time", renewal_consent: "consent", consent_version: "consent", proof: "file",
    sender_bank: "bank", transfer_reference: "ref", sender_first_name: "first", sender_last_name: "last", sender_account_number: "acct", amount_sent: "amount" };
  var LABEL_OF = { plan: "Plan", transferred_at: "Time of Transfer", transferred_on: "Time of Transfer", proof: "Payment Receipt", transfer_reference: "Reference Number",
    sender_bank: "Sender Bank", sender_first_name: "Sender First Name", sender_last_name: "Sender Last Name", sender_account_number: "Sender Account Number",
    amount_sent: "Amount", renewal_consent: "Launch Promo terms", consent_version: "Launch Promo terms" };
  function routeOf(search) {
    var pay = q(search, "pay");
    return { pay: pay === "choose" || pay === "send" ? pay : null, plan: pay === "send" ? q(search, "plan") : null };
  }
  function urlFor(site, pay, plan) { return "/settings/billing/?site=" + site + (pay ? "&pay=" + pay : "") + (pay === "send" && plan ? "&plan=" + encodeURIComponent(plan) : ""); }

  /* ---- state ---- */
  var S = null, token = 0, tickTimer = null, urls = [], dlg = null, busy = false;
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function byId(id) { return document.getElementById(id); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function rootEl() { return byId("bl-root"); }
  function say(text) { var l = byId("bl-live"); if (l) l.textContent = text; }
  function chip(kind, text) { return h("span", "chip chip-" + kind, text); }
  function attrs(n, o) { Object.keys(o).forEach(function (k) { n.setAttribute(k, o[k]); }); return n; }
  function para(text, cls) { return h("p", cls || "bl-line", text); }
  function btn(label, kind, fn, extra) {
    var b = attrs(h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : kind === "cancel" ? "bl-btn-cancel" : kind === "danger" ? "bl-btn-danger" : "no-btn-ghost") + (extra ? " " + extra : ""), label), { type: "button" });
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function setDisabled(b, on) { b.disabled = !!on; if (on) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled"); }
  function facts(rows) {
    var d = h("dl", "bl-facts");
    rows.forEach(function (r) { if (r) add(d, add(h("div", ""), h("dt", "", r[0]), typeof r[1] === "string" ? h("dd", "", r[1]) : add(h("dd", ""), r[1]))); });
    return d;
  }
  function focusTop() { var t = byId("h-settings-billing"); if (t) t.focus(); }
  function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }
  function revokeAll() { urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }); urls = []; }
  function base() { return "/sites/" + S.site + "/billing/"; }
  function api(path) { return D.call("GET", path); }
  function toast(title, sub, kind) { if (D.toast) D.toast(title, sub, kind); }

  /* ---- data ---- */
  function fetchAll(site) {
    var b = "/sites/" + site + "/billing/";
    return Promise.all([api(b), api(b + "payment/"), api(b + "payments/?limit=20")]).then(function (r) {
      return { billing: r[0], pay: r[1], list: r[2] };
    });
  }
  function adopt(site, r) {
    S = { site: S ? S.site : site, sites: S ? S.sites : null, billing: r.billing.data, pay: r.pay.ok ? r.pay.data : null,
      payments: r.list.ok && r.list.data && Array.isArray(r.list.data.items) ? r.list.data.items : [], plans: S && S.plans ? S.plans : null };
    if (site) S.site = site;
  }
  function reload() {
    var mine = token;
    return fetchAll(S.site).then(function (r) {
      if (mine !== token) return false;
      if (r.billing.status === 401) return false;
      if (!r.billing.ok) return false;
      adopt(S.site, r);
      return true;
    });
  }
  function newest(status) {
    var l = S.payments.slice().sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : a.submitted_at > b.submitted_at ? -1 : 0; });
    for (var i = 0; i < l.length; i++) if (l[i].status === status) return l[i];
    return null;
  }
  function underReview() { return (S.pay && S.pay.under_review) || newest("submitted"); }
  function latestPay() {
    if (S.pay && S.pay.latest) return S.pay.latest;
    return S.payments.slice().sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : -1; })[0] || null;
  }
  function accounts() { return (S.pay && S.pay.transfer_accounts) || []; }
  function canPay() { return !!(S.pay && S.pay.payable && S.pay.offers && S.pay.offers.length && accounts().length && !S.billing.billing_exempt); }
  function inTrial() { return S.billing.state === "trial_active"; }

  /* ---- load ---- */
  function show() { window.removeEventListener("popstate", onPop); window.addEventListener("popstate", onPop); load(); }
  function hide() {
    window.removeEventListener("popstate", onPop); stopTick(); revokeAll(); token++; DOCS = null; closeDialog(false); say("");
  }
  function onPop() {
    if ((location.pathname.slice(-1) === "/" ? location.pathname : location.pathname + "/") !== "/settings/billing/") return;
    if (S) { render(); focusTop(); } else load();
  }
  function load() {
    var mine = ++token;
    DOCS = null; stopTick(); revokeAll(); closeDialog(false); say(""); skeleton();
    D.call("GET", "/sites/").then(function (res) {
      if (mine !== token || res.status === 401) return;
      if (!res.ok) { panelH(); return; }
      var sites = D.sitesOf(res);
      if (!sites.length) { renderNoSite(); return; }
      var ids = sites.map(function (s) { return s.id; }), site = D.siteFromQuery(ids, location.search);
      fetchAll(site).then(function (r) {
        if (mine !== token || r.billing.status === 401) return;
        if (r.billing.status === 404) { renderUnavailable(); return; }
        if (!r.billing.ok) { panelH(); return; }
        S = null; adopt(site, r); S.sites = sites;
        var want = urlFor(site, routeOf(location.search).pay, routeOf(location.search).plan);
        if (location.pathname + location.search !== want) { try { history.replaceState(null, "", want); } catch (e) { /* ignore */ } }
        render();
      });
    });
  }

  /* ---- panels ---- */
  function skeleton() {
    var r = clear(rootEl()); r.setAttribute("aria-busy", "true");
    add(r, h("p", "bl-sr", "Loading your billing"));
    for (var i = 0; i < 3; i++) add(r, add(attrs(h("div", "bl-card bl-skel"), { "aria-hidden": "true" }), h("span", "bl-skel-line bl-skel-w1"), h("span", "bl-skel-line bl-skel-w2"), h("span", "bl-skel-line bl-skel-w3")));
  }
  function plain(title, text) {
    var r = clear(rootEl()); r.removeAttribute("aria-busy");
    return add(r, add(h("section", "bl-card"), h("h2", "bl-h2", title), para(text)));
  }
  function panelH() {
    var r = clear(rootEl()); r.removeAttribute("aria-busy");
    var s = attrs(h("section", "bl-card bl-panel-err"), { role: "alert" });
    add(s, h("h2", "bl-h2", "We couldn’t load your billing"), para("Check your connection and try again. Nothing was changed."), btn("Try again", "ghost", function () { load(); focusTop(); }));
    r.appendChild(s);
  }
  function renderNoSite() { plain("Billing is not available for this account yet", "There is no website with a subscription on this account."); }
  function renderUnavailable() { plain("Billing is not available for this site yet", "Please check again later."); }

  /* ---- routing between the home, the plan choice and the payment details ---- */
  function go(pay, plan) {
    try { history.pushState(null, "", urlFor(S.site, pay, plan)); } catch (e) { /* ignore */ }
    render(); focusTop();
  }
  function render() {
    stopTick(); revokeAll(); closeDialog(false);
    var rt = routeOf(location.search), r = clear(rootEl());
    r.removeAttribute("aria-busy");
    if (rt.pay === "choose") return renderChoose(r);
    if (rt.pay === "send") return renderSend(r, rt.plan);
    renderHome(r);
  }

  /* ---- home: hero, Plan and Payment cards, payment history ---- */
  function countdown(endIso) {
    var wrap = attrs(h("div", "bl-tiles"), { "aria-hidden": "true" }), nums = [];
    ["Days", "Hours", "Mins", "Secs"].forEach(function (u, i) {
      if (i) add(wrap, h("i", "", ":"));
      var num = h("b", "", "00"); nums.push(num); add(wrap, add(h("div", "bl-tile"), num, h("span", "", u)));
    });
    function tick() {
      var left = Math.max(0, Math.floor((new Date(endIso).getTime() - Date.now()) / 1000));
      [Math.floor(left / 86400), Math.floor(left % 86400 / 3600), Math.floor(left % 3600 / 60), left % 60].forEach(function (n, i) { nums[i].textContent = pad(n); });
      if (left === 0) stopTick();
    }
    stopTick(); tick(); tickTimer = setInterval(tick, 1000);
    return wrap;
  }
  function downloadLine(b) {
    return b.download_until && b.download_until > new Date().toISOString() ? "You can download your data until " + dateShort(b.download_until) + "." : null;
  }
  /* What the top of the page says, decided from the API's fields only. */
  function heroModel() {
    var b = S.billing, st = b.state, p = S.pay, offers = (p && p.offers) || [], pay = canPay();
    var cancelBtn = b.can_cancel ? "cancel" : null;
    if (b.billing_exempt) return { chip: ["ok", "No billing"], head: "Billing does not apply to this site.", lines: [], actions: [] };
    if (p && !p.payable && p.not_payable_reason === "past_deletion_date") {
      return { chip: ["danger", "Last date passed"], head: "The last date to pay has passed.", lines: ["Email " + SUPPORT + "."], actions: [] };
    }
    var m;
    if (st === "trial_active") {
      m = { head: "Your free trial ends in", tiles: b.trial_end_at, lines: ["Your trial ends " + instant(b.trial_end_at) + " Manila time.",
        offers.length ? "After that, pick a plan: " + offersLine(offers) : "After that, pick a plan."], actions: [pay ? "pay" : null, cancelBtn] };
    } else if (st === "active") {
      var paid = b.current_cycle && b.current_cycle.settlement === "paid";
      m = { chip: ["ok", "Active"], head: "Your subscription is active", lines: [paid ? "Paid until " + dateShort(b.current_cycle.end_at) + "." : "Your next payment is due " + dateShort(b.next_due_at) + ".",
        paid && b.next_due_at ? "Next payment due " + dateShort(b.next_due_at) + ": " + peso(b.plan.price_centavos) + "." : null],
        meta: p && p.not_payable_reason === "too_early" && p.payable_from ? "You can pay for the next term from " + dateShort(p.payable_from) + "." : null,
        actions: [pay ? "pay-next" : null, cancelBtn] };
    } else if (st === "payment_requires_attention") {
      m = { chip: ["warn", "Payment needs attention"], head: "Pay by " + dateShort(b.attention_ends_at) + " to keep your site online.", lines: [], actions: [pay ? "pay" : null, cancelBtn] };
    } else if (st === "suspended") {
      m = { chip: ["danger", "Suspended"], head: "Your site is limited to Billing.", lines: [b.deletion_due_at ? "Your data is kept until " + dateShort(b.deletion_due_at) + (b.pay_by ? "; pay by " + dateShort(b.pay_by) + " to continue." : ".") : null, downloadLine(b)], actions: [pay ? "pay" : null], data: true };
    } else if (b.can_reactivate) {
      m = { chip: ["danger", "Cancelled"], head: "Cancelled.", lines: ["Your site stays online until " + dateShort(b.service_end_at) + "."], actions: ["reactivate"] };
    } else {
      m = { chip: ["danger", st === "cancelled_no_payment_method" ? "Trial ended" : "Cancelled"], head: "Your site is limited to Billing.",
        lines: [b.deletion_due_at ? "Pay to bring it back; your data is kept until " + dateShort(b.deletion_due_at) + "." : "Pay to bring it back.", downloadLine(b)], actions: [pay ? "pay" : null], data: true };
    }
    return m;
  }
  /* The data-request paragraph (z8uq9mep8q): at the bottom of the Billing-only notice, for a suspended or ended site only. */
  function dataNote() {
    var base = String((D.cfg && D.cfg.siteUrl) || "").replace(/\/+$/, "");
    var p = h("p", "bl-line bl-data");
    function link(label, href) { return attrs(h("a", "", label), { href: href }); }
    function t(s) { return h("span", "", s); }
    add(p, t("To ask for a copy of your store data, or for any other request about your data, email "), link(SUPPORT, "mailto:" + SUPPORT),
      t(" from your account email. What happens to your data after the service ends is set out in our "), link("Terms of Service", base + "/terms"),
      t(" and "), link("Privacy Policy", base + "/privacy"), t("."));
    return p;
  }
  function heroEl(m) {
    var el = h("header", "bl-hero"), acts = h("div", "bl-actions");
    if (m.chip) add(el, chip(m.chip[0], m.chip[1]));
    var head = h("h2", "bl-head", m.head); head.setAttribute("id", "bl-hd");
    add(el, head);
    if (m.tiles) add(el, countdown(m.tiles));
    m.lines.forEach(function (l) { if (l) add(el, para(l)); });
    if (m.meta) add(el, para(m.meta, "bl-meta"));
    m.actions.forEach(function (a) {
      if (a === "pay") add(acts, btn("Pay by bank transfer", "primary", function () { go("choose"); }));
      else if (a === "pay-next") add(acts, btn("Pay for the next period", "primary", function () { go("choose"); }));
      else if (a === "reactivate") add(acts, btn("Keep my subscription", "primary", function (b) { reactivate(b); }));
    });
    if (acts.children.length) add(el, acts);
    if (m.data) add(el, dataNote());
    return el;
  }
  function planRows() {
    var b = S.billing, c = newest("confirmed");
    if (inTrial()) return { rows: [["Plan", "Free trial"], ["Length", b.plan.trial_days + " days"], ["After the trial", "Pick a plan"]],
      note: ((S.pay && S.pay.offers && S.pay.offers.length) ? "Pick " + offersLine(S.pay.offers) + " " : "") + NOTRIAL_NOTE };
    var rows, cancelled = b.state === "cancelled" || b.state === "cancelled_no_payment_method";
    if (c) {
      var p = planOf(c.plan), amt = peso(c.amount_centavos - (c.usage_centavos || 0));
      if (c.plan === "monthly") rows = [["Plan", p.name], ["Billing", "Monthly"], ["Price", amt + " a month"]];
      else {
        rows = [["Plan", p.name], ["Billing", (c.plan === "annual" ? "12 months" : "6 months") + ", paid once"], ["Price", amt]];
        if (c.cycle) rows.push(["Ends", dateShort(c.cycle.end_at)]);
        if (c.plan === "launch_promo" && !cancelled) rows.push(["Then", peso(b.plan.price_centavos) + " a month"]);
      }
    } else rows = [["Plan", b.plan.name], ["Billing", "Monthly"], ["Price", peso(b.plan.price_centavos) + " a month"]];
    return { rows: rows, note: NOTRIAL_NOTE };
  }
  function planCard() {
    var pr = planRows(), s = attrs(h("section", "bl-card"), { "aria-labelledby": "bl-pl" });
    add(s, attrs(h("h2", "bl-h2", "Plan"), { id: "bl-pl" }), facts(pr.rows), para(pr.note, "bl-meta bl-cardnote"));
    return s;
  }
  function proofRows(p) {
    return [["Plan", planOf(p.plan).name], ["Amount", peso(p.amount_centavos)],
      p.transferred_at ? ["Time of transfer", instant(p.transferred_at)] : ["Date of transfer", p.transferred_on ? dateShort(p.transferred_on + "T12:00:00+08:00") : ""],
      p.transfer_reference ? ["Reference", p.transfer_reference] : null, ["Sent", instant(p.submitted_at)]];
  }
  function rejectBox(p) {
    var box = h("div", "bl-reject");
    add(box, add(h("p", ""), h("strong", "", REASONS[p.reject_reason] || "Your proof was not accepted.")));
    if (p.reject_reason === "other" && p.reject_note) add(box, h("p", "", p.reject_note));
    add(box, h("p", "", "Your money has not been counted. Send a new proof, or contact us if you have already paid the right amount."));
    return box;
  }
  function payCard() {
    var s = attrs(h("section", "bl-card"), { "aria-labelledby": "bl-pm" }), top = h("div", "bl-top"), acts = h("div", "bl-actions");
    add(top, attrs(h("h2", "bl-h2", "Payment"), { id: "bl-pm" }));
    var rev = underReview(), last = latestPay(), pay = canPay(), body;
    function viewBtn(p) { return btn("View proof", "ghost", function (b) { openProof(p, b); }); }
    if (rev) {
      add(top, chip("warn", "Proof under review")); body = facts(proofRows(rev));
      add(acts, viewBtn(rev)); if (pay) add(acts, btn("Replace proof", "ghost", function () { go("choose"); }));
    } else if (last && last.status === "rejected") {
      add(top, chip("reject", "Proof rejected")); body = add(h("div", ""), rejectBox(last), facts(proofRows(last)));
      if (pay) add(acts, btn("Send a new proof", "primary", function () { go("choose"); }));
      add(acts, viewBtn(last));
    } else if (last && last.status === "confirmed") {
      add(top, chip("ok", "Approved"));
      var only = S.billing.billing_only, cy = last.cycle;
      body = facts([only ? ["Last payment", "Approved " + dateShort(last.decided_at)] : ["Status", "Payment approved"], only ? null : ["Approved", dateShort(last.decided_at)],
        cy ? [only ? "Plan ran" : "Plan runs", range(cy.start_at, cy.end_at)] : null]);
      if (pay) add(acts, btn(only ? "Pay by bank transfer" : "Pay for the next period", "primary", function () { go("choose"); }));
      add(acts, viewBtn(last));
    } else {
      add(top, chip("neutral", "No payment yet"));
      body = para(pay ? "Pay by bank transfer to continue after your trial. No payment method is stored; you send a transfer and add your proof." : "Payments are not open yet.");
      if (pay) add(acts, btn("Pay by bank transfer", "primary", function () { go("choose"); }));
    }
    add(s, top, body);
    if (acts.children.length) add(s, acts);
    return s;
  }
  function histEl() {
    var s = attrs(h("section", "bl-card bl-hist"), { "aria-labelledby": "bl-hi" });
    add(s, attrs(h("h2", "bl-h2", "Payment history"), { id: "bl-hi" }));
    if (!S.payments.length) { add(s, para("No payments yet. Your payments appear here once you send a proof.", "bl-empty")); return s; }
    var CH = { submitted: ["warn", "Under review"], confirmed: ["ok", "Approved"], rejected: ["reject", "Rejected"], replaced: ["neutral", "Replaced"] };
    S.payments.forEach(function (p) {
      var c = CH[p.status] || ["neutral", p.status], row = h("div", "bl-hrow");
      add(row, h("span", "", dateShort(p.submitted_at)), h("span", "", planOf(p.plan).short), h("span", "", peso(p.amount_centavos)), chip(c[0], c[1]),
        btn("View proof", "ghost", function (b) { openProof(p, b); }));
      add(s, row);
    });
    return s;
  }
  /* ---- Plan usage: media storage and orders against the plan's limits; display only, hidden quietly when the route is missing or fails ---- */
  function meterEl(id, name, valText, pct, sub, period) {
    var cls = pct >= 100 ? " pu-red" : pct >= 80 ? " pu-amber" : "", w = Math.min(100, pct);
    var nm = attrs(h("span", "pu-name", name), { id: id });
    if (period) add(nm, h("span", "pu-period", " " + period));
    var val = add(h("span", "pu-val", valText + " "), h("span", "pu-pct", "(" + pct + "%)"));
    var fill = h("div", "pu-fill"); fill.style.width = w + "%";
    var track = attrs(h("div", "pu-track"), { role: "progressbar", "aria-labelledby": id, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(w), "aria-valuetext": valText });
    return add(h("div", "pu-meter" + cls), add(h("div", "pu-row"), nm, val), add(track, fill), h("p", "pu-sub", sub));
  }
  /* Order overage (z8uq9mhpaz): the limit and the price come from the meters answer; any missing piece keeps the plain limit line. */
  function overageLine(od) {
    var c = od.overage_centavos_per_order;
    if (od.overage_applies !== true || !(c > 0) || !(od.limit > 0)) return "";
    var n = c / 100, price = "PHP " + (n === Math.floor(n) ? String(n) : n.toFixed(2));
    return "You have reached your plan’s " + od.limit + " orders. Orders above " + od.limit + " are billed at " + price + " each on your next bill.";
  }
  function usageCard(m) {
    var st = m && m.storage, od = m && m.orders;
    if (!st || !od) return null;
    var sp = pctOf(st.used_bytes, st.limit_bytes), op = pctOf(od.count, od.limit);
    if (sp === null || op === null) return null;
    var s = attrs(h("section", "bl-card"), { "aria-labelledby": "bl-pu" });
    add(s, attrs(h("h2", "bl-h2", "Plan usage"), { id: "bl-pu" }),
      meterEl("bl-pu-s", "Media storage", gbText(st.used_bytes) + " of " + gbText(st.limit_bytes, true), sp, "Images and videos in your Media Library."),
      meterEl("bl-pu-o", "Orders this period", od.count + " of " + od.limit, op, ORDER_SUB[od.period_kind] || ORDER_SUB.billing_month, periodText(od.period_start, od.period_end)));
    if (sp >= 100 || op >= 100) add(s, attrs(h("p", "pu-limit pu-red", op >= 100 && overageLine(od) || "You have reached your plan’s limit."), { role: "status" }));
    return s;
  }
  function paintUsage(slot, mine) {
    api(base() + "meters/").then(function (r) {
      if (mine !== token || !slot.parentNode || !r || !r.ok) return;
      var card = usageCard(r.data);
      if (card) { slot.removeAttribute("hidden"); add(clear(slot), card); }
    }, function () { /* hidden quietly */ });
  }
  function renderHome(r) {
    var b = S.billing;
    var hm = heroModel();
    add(r, heroEl(hm));
    var usage = attrs(h("div", "bl-usage"), { hidden: "" });
    if (b.billing_exempt) { add(r, usage); paintUsage(usage, token); } /* display only, so an exempt site sees it too */
    if (!b.billing_exempt) {
      docsEl = h("div", "bl-docs");
      add(r, add(h("div", "bl-two"), planCard(), payCard()), usage, histEl(), docsEl);
      paintUsage(usage, token);
      docsStart(); paintDocs();
      if (b.outstanding_centavos > 0) add(r, para("Unpaid usage: " + peso(b.outstanding_centavos), "bl-meta"));
    }
    /* Cancel sits last on the page, never in the status block; same button, same conditions, only the place moved. */
    if (hm.actions.indexOf("cancel") !== -1) add(r, add(h("div", "bl-cancelrow"), btn("Cancel subscription", "cancel", function (x) { openCancel(x); })));
  }

  /* ---- owner documents: Statements, BIR invoices, Billing details (each hidden while its route answers 404) ---- */
  var DOCS = null, docsEl = null, PAGE = 10;
  function listState() { return { s: "idle", items: [], next: null, more: false, busy: false }; }
  function docsStart() {
    if (DOCS) return;
    DOCS = { stm: listState(), inv: listState(), prof: { s: "idle", data: null } };
    loadList("stm", false); loadList("inv", false); loadProfile();
  }
  function listPath(kind, cursor) {
    return base() + (kind === "stm" ? "statements/" : "invoices/") + "?limit=" + PAGE + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
  }
  function loadList(kind, more) {
    var L = DOCS[kind], mine = token, docs = DOCS;
    if (L.busy) return Promise.resolve();
    L.busy = true; if (!more) L.s = "loading";
    return api(listPath(kind, more ? L.next : null)).then(function (res) {
      if (mine !== token || docs !== DOCS) return;
      L.busy = false;
      if (res.status === 401) return;
      if (res.status === 404) { L.s = "hidden"; L.items = []; L.next = null; }
      else if (res.ok && res.data && Array.isArray(res.data.items)) {
        L.items = more ? L.items.concat(res.data.items) : res.data.items; L.next = res.data.next_cursor || null; L.s = "ok";
      } else if (more) toast("That did not work", "We could not load more. Please try again.", "error");
      else L.s = "error";
      paintDocs();
    });
  }
  function loadProfile() {
    var P = DOCS.prof, mine = token, docs = DOCS;
    P.s = "loading";
    return api(base() + "profile/").then(function (res) {
      if (mine !== token || docs !== DOCS) return;
      if (res.status === 401) return;
      if (res.status === 404) P.s = "hidden";
      else if (res.ok && res.data) { P.s = "ok"; P.data = res.data; }
      else P.s = "error";
      paintDocs();
    });
  }
  function paintDocs() {
    if (!docsEl || !DOCS) return;
    clear(docsEl);
    var cards = [stmCard(), invCard(), profCard()];
    cards.forEach(function (c) { if (c) add(docsEl, c); });
  }
  function docCard(id, title) {
    var s = attrs(h("section", "bl-card bl-hist bl-doc"), { "aria-labelledby": id });
    add(s, attrs(h("h2", "bl-h2", title), { id: id }));
    return s;
  }
  /* Idle, loading and a hidden route draw no card; a failed read draws the card with a retry. */
  function docFail(card, retry) {
    add(card, para("We could not load this. Nothing was changed.", "bl-empty"), btn("Try again", "ghost", function () { retry(); }));
    return card;
  }
  function moreBtn(kind) {
    var L = DOCS[kind];
    if (!L.next) return null;
    var b = btn("Load more", "ghost", function (x) {
      if (L.busy) return;
      x.setAttribute("aria-busy", "true"); setDisabled(x, true); loadList(kind, true);
    }, "bl-more");
    return b;
  }
  function testChip(row) { return row.is_test ? chip("neutral", "Test") : null; }
  function dayRange(a, b) { return range(a, b); }
  function drow(main, amount, actions) {
    var row = h("div", "bl-drow");
    add(row, main, h("span", "bl-damt", amount));
    if (actions) add(row, actions);
    return row;
  }

  function stmCard() {
    var L = DOCS.stm;
    if (L.s === "idle" || L.s === "loading" || L.s === "hidden") return null;
    var card = docCard("bl-st", "Statements");
    if (L.s === "error") return docFail(card, function () { loadList("stm", false); paintDocs(); });
    if (!L.items.length) { add(card, para("No statements yet.", "bl-empty")); return card; }
    L.items.forEach(function (st) {
      var main = h("div", "bl-dmain"), title = h("div", "bl-dtitle");
      add(title, h("b", "", st.number)); var t = testChip(st); if (t) add(title, t);
      add(main, title, h("span", "bl-meta bl-dline", "Issued " + dateShort(st.issued_at)), h("span", "bl-meta bl-dline", "Period " + dayRange(st.period_start, st.period_end)));
      var acts = h("div", "bl-dacts");
      add(acts, btn("View", "ghost", function (b) { openStatement(st, b); }), btn("Download PDF", "ghost", function (b) { downloadStatement(st, b); }));
      add(card, drow(main, peso(st.total_centavos), acts));
    });
    var m = moreBtn("stm"); if (m) add(card, add(h("div", "bl-dmore"), m));
    return card;
  }
  function invCard() {
    var L = DOCS.inv;
    if (L.s === "idle" || L.s === "loading" || L.s === "hidden") return null;
    var card = docCard("bl-iv", "BIR invoices");
    if (L.s === "error") return docFail(card, function () { loadList("inv", false); paintDocs(); });
    if (!L.items.length) { add(card, para("No invoices yet.", "bl-empty")); return card; }
    L.items.forEach(function (it) {
      var main = h("div", "bl-dmain"), title = h("div", "bl-dtitle");
      add(title, h("b", "", "Paid " + dateShort(it.paid_at))); var t = testChip(it); if (t) add(title, t);
      add(main, title, h("span", "bl-meta bl-dline", "Period " + dayRange(it.period_start_at, it.period_end_at)));
      var acts = null;
      if (it.state === "available") acts = add(h("div", "bl-dacts"), btn("View copy", "ghost", function (b) { openInvoiceCopy(it, b); }));
      else {
        add(main, h("span", "bl-meta bl-dline bl-dmsg", it.message || ""));
        /* An unseen stand-in the size of the View copy button, so the amount lines up with rows that have it (hidden on phones). */
        acts = attrs(h("span", "no-btn no-btn-ghost bl-dpad", "View copy"), { "aria-hidden": "true" });
      }
      add(card, drow(main, peso(it.total_centavos), acts));
    });
    var m = moreBtn("inv"); if (m) add(card, add(h("div", "bl-dmore"), m));
    return card;
  }
  function profCard() {
    var P = DOCS.prof;
    if (P.s === "idle" || P.s === "loading" || P.s === "hidden") return null;
    var card = docCard("bl-bd", "Billing details");
    if (P.s === "error") return docFail(card, function () { loadProfile(); paintDocs(); });
    var d = P.data || {}, none = "Not added yet";
    add(card, facts([["Company name", d.company_name || none], ["Billing email", d.billing_email || none], ["Address", d.address || none], ["TIN", d.tin || none]]));
    add(card, add(h("div", "bl-actions"), btn("Edit", "ghost", function (b) { openProfile(b); })), para("These details appear on future documents only.", "bl-meta bl-cardnote"));
    return card;
  }

  /* A private file is fetched with the cookie and held as a blob URL: the page never has an address for it. */
  function fetchPrivate(path) {
    return fetch(D.cfg.apiBase + path, { method: "GET", credentials: "include" })
      .then(function (r) { return r.ok ? r.blob() : null; }).catch(function () { return null; });
  }
  function downloadStatement(st, opener) {
    if (opener.getAttribute("aria-busy") === "true") return;
    opener.setAttribute("aria-busy", "true"); setDisabled(opener, true);
    var mine = token;
    fetchPrivate(base() + "statements/" + encodeURIComponent(st.number) + "/pdf/").then(function (blob) {
      opener.removeAttribute("aria-busy"); setDisabled(opener, false);
      if (mine !== token) return;
      if (!blob) { toast("That did not work", "We could not download the statement. Please try again.", "error"); return; }
      var url = URL.createObjectURL(blob), a = attrs(h("a", ""), { href: url, download: st.number + ".pdf" });
      a.hidden = true; document.body.appendChild(a);
      if (a.click) a.click();
      a.remove();
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } }, 4000);
    });
  }
  function openInvoiceCopy(it, opener) {
    openDialog("Copy of your invoice", opener, function (box, d) {
      var hold = h("div", "bl-proof"), slotEl = h("div", "");
      add(hold, para("Loading the copy…", "bl-meta")); add(box, hold, slotEl);
      fetchPrivate(base() + "invoices/" + encodeURIComponent(it.id) + "/copy/").then(function (blob) {
        if (dlg !== d) return;
        clear(hold);
        if (!blob) { add(hold, para("We could not load the copy. Please try again.", "bl-meta")); return; }
        var url = URL.createObjectURL(blob); d.url = url;
        var pdf = blob.type === "application/pdf";
        if (pdf) add(hold, para("This copy is a PDF.", "bl-meta"));
        else add(hold, attrs(h("img", "bl-proof-img"), { src: url, alt: "The copy of your invoice" }));
        add(slotEl, attrs(h("a", "no-btn no-btn-primary bl-full", pdf ? "Open the copy (PDF)" : "Open the copy"), { href: url, target: "_blank", rel: "noopener" }));
      });
    });
  }
  function party(obj, rows) {
    var o = obj || {};
    return rows.map(function (k) { return o[k] ? String(o[k]) : null; }).filter(Boolean).join("\n");
  }
  function openStatement(st, opener) {
    openDialog("Statement " + st.number, opener, function (box, d) {
      var hold = h("div", "bl-sdetail");
      add(hold, para("Loading the statement…", "bl-meta")); add(box, hold);
      api(base() + "statements/" + encodeURIComponent(st.number) + "/").then(function (res) {
        if (dlg !== d || res.status === 401) return;
        clear(hold);
        if (!res.ok || !res.data || !res.data.number) { add(hold, para("We could not load the statement. Please try again.", "bl-meta")); return; }
        var s = res.data, iss = s.issuer || {}, lines = Array.isArray(s.lines) ? s.lines : [];
        add(hold, facts([["Number", s.number], s.label ? ["Document", s.label] : null, ["Issued", dateShort(s.issued_at)], ["Period", dayRange(s.period_start, s.period_end)],
          s.original_number ? ["Adjusts", s.original_number] : null, s.payment_reference ? ["Payment reference", s.payment_reference] : null,
          ["Issued by", [iss.legal_name, iss.registered_address, iss.tin ? "TIN " + iss.tin : ""].filter(Boolean).join("\n")],
          ["Billed to", party(s.bill_to, ["name", "address", "email"]) + (s.bill_to && s.bill_to.tin ? "\nTIN " + s.bill_to.tin : "")]]));
        var ul = h("div", "bl-slines");
        lines.forEach(function (l) {
          /* An order-overage line carries its own label with the count and price, so they are not repeated beside it. */
          add(ul, add(h("div", "bl-sline"), h("span", "", l.description), l.kind === "orders" ? null : h("span", "bl-meta", l.quantity + " × " + peso(l.unit_centavos)), h("b", "", peso(l.amount_centavos))));
        });
        add(hold, ul, add(h("div", "bl-total"), h("span", "", "Total"), h("b", "", peso(s.total_centavos))));
        if (s.is_test) add(hold, chip("neutral", "Test"));
      });
    });
  }

  /* Billing details: the four fields the API takes, its field messages shown beside them. */
  var PROFILE_FIELDS = [["company_name", "Company name", 160, "text"], ["billing_email", "Billing email", 254, "email"], ["address", "Address", 255, "text"], ["tin", "TIN", 17, "text"]];
  function openProfile(opener) {
    var cur = (DOCS && DOCS.prof.data) || {}, docs = DOCS;
    openDialog("Billing details", opener, function (box, d) {
      var F = {}, banner = attrs(h("p", "bl-note"), { role: "alert", tabindex: "-1" }); banner.hidden = true;
      add(box, banner);
      PROFILE_FIELDS.forEach(function (f) {
        var id = "bl-pf-" + f[0], input = f[0] === "address" ? attrs(h("textarea", "bl-input bl-textarea"), { rows: "3" }) : attrs(h("input", "bl-input"), { type: f[3] });
        attrs(input, { id: id, name: f[0], maxlength: String(f[2]), autocomplete: "off" }); input.value = cur[f[0]] || "";
        var err = attrs(h("p", "bl-ferr"), { id: id + "-err", role: "alert" }); err.hidden = true;
        input.setAttribute("aria-describedby", id + "-err");
        F[f[0]] = { input: input, err: err };
        add(box, add(h("div", "bl-field"), attrs(h("label", "bl-label", f[1]), { "for": id }), input, err));
      });
      function paint(key, msg) {
        var e = F[key]; e.err.textContent = msg || ""; e.err.hidden = !msg;
        if (msg) e.input.setAttribute("aria-invalid", "true"); else e.input.removeAttribute("aria-invalid");
      }
      var save = btn("Save", "primary", null, "bl-full"), cancel = btn("Cancel", "ghost", function () { if (!d.busy) closeDialog(true); }, "bl-full");
      add(box, add(h("div", "bl-dlg-acts"), save, cancel));
      save.addEventListener("click", function () {
        if (d.busy) return;
        var body = {};
        PROFILE_FIELDS.forEach(function (f) { body[f[0]] = F[f[0]].input.value.trim(); paint(f[0], ""); });
        banner.hidden = true;
        d.busy = true; save.setAttribute("aria-busy", "true"); setDisabled(save, true);
        D.call("PUT", base() + "profile/", body).then(function (res) {
          d.busy = false; save.removeAttribute("aria-busy"); setDisabled(save, false);
          if (res.status === 401 || dlg !== d) return;
          if (res.ok) {
            if (docs === DOCS && DOCS) { DOCS.prof.data = res.data; DOCS.prof.s = "ok"; }
            closeDialog(true); paintDocs(); toast("Billing details saved", "They appear on future documents only.");
            return;
          }
          var fields = res.data && res.data.fields, shown = false;
          if (res.status === 400 && fields) {
            Object.keys(fields).forEach(function (k) { if (F[k]) { paint(k, String(fields[k])); shown = true; } });
          }
          if (!shown) {
            banner.textContent = res.status === 429 ? "You have saved too many times. Please try again later." : res.status === 0 ? refusal(res) : "That did not work. Please try again.";
            banner.hidden = false;
          }
          var first = PROFILE_FIELDS.filter(function (f) { return !F[f[0]].err.hidden; })[0];
          if (first) F[first[0]].input.focus(); else if (banner.focus) banner.focus();
        });
      });
    });
  }

  /* ---- pop-ups: X and Escape close; no Cancel button; a click outside does nothing ---- */
  function closeDialog(returnFocus) {
    if (!dlg) return;
    var d = dlg; dlg = null;
    document.removeEventListener("keydown", d.onKey);
    var slot = byId("bl-dialog-slot"); if (slot) clear(slot);
    if (d.url) { try { URL.revokeObjectURL(d.url); } catch (e) { /* ignore */ } }
    if (returnFocus && d.opener && d.opener.focus) d.opener.focus();
  }
  function openDialog(titleText, opener, fill) {
    closeDialog(false);
    var slot = clear(byId("bl-dialog-slot")), overlay = h("div", "bl-overlay"), box = attrs(h("div", "bl-dialog"), { role: "dialog", "aria-modal": "true", "aria-labelledby": "bl-dlg-h" });
    var x = attrs(h("button", "bl-x", "×"), { type: "button", "aria-label": "Close" });
    var d = { opener: opener, busy: false, url: null, box: box };
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); if (!d.busy) closeDialog(true); return; }
      if (e.key !== "Tab") return;
      var items = Array.prototype.slice.call(box.querySelectorAll("button, a[href], input, textarea")).filter(function (n) { return !n.disabled && !n.hidden; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1], now = document.activeElement;
      if (e.shiftKey && (now === first || items.indexOf(now) < 0)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (now === last || items.indexOf(now) < 0)) { e.preventDefault(); first.focus(); }
    }
    d.onKey = onKey; dlg = d;
    x.addEventListener("click", function () { if (!d.busy) closeDialog(true); });
    add(box, x, attrs(h("h2", "bl-dlg-h", titleText), { id: "bl-dlg-h" }));
    fill(box, d);
    add(overlay, box); add(slot, overlay);
    document.addEventListener("keydown", onKey);
    x.focus();
  }
  function openCancel(opener) {
    var b = S.billing, paid = b.current_cycle && b.current_cycle.settlement === "paid" && b.state === "active";
    var text = paid ? "Your site stays online until " + dateShort(b.current_cycle.end_at) + ", then it is limited to Billing."
      : "Your site’s service ends now. Nothing is charged." + (b.deletion_due_at ? " Your data is kept until " + dateShort(b.deletion_due_at) + "." : "");
    openDialog("Cancel your subscription?", opener, function (box, d) {
      var yes = btn("Cancel subscription", "danger", function () {
        if (d.busy) return;
        d.busy = true; yes.setAttribute("aria-busy", "true");
        D.call("POST", base() + "cancel/").then(function (res) {
          d.busy = false; yes.removeAttribute("aria-busy");
          if (res.status === 401) return;
          if (!res.ok) { toast("That did not work", refusal(res), "error"); if (res.status === 409) { closeDialog(false); load(); } return; }
          S.billing = res.data; closeDialog(false); render(); focusTop();
          if (D.refreshAccount) D.refreshAccount();
          toast("Subscription cancelled", ""); reload().then(function (ok) { if (ok) render(); });
        });
      }, "bl-full");
      add(box, para(text), yes);
    });
  }
  function reactivate(b) {
    if (busy) return;
    busy = true; b.setAttribute("aria-busy", "true");
    D.call("POST", base() + "reactivate/").then(function (res) {
      busy = false; b.removeAttribute("aria-busy");
      if (res.status === 401) return;
      if (!res.ok) { toast("That did not work", refusal(res), "error"); if (res.status === 409) load(); return; }
      S.billing = res.data; render(); focusTop();
      if (D.refreshAccount) D.refreshAccount();
      toast("Your subscription continues", ""); reload().then(function (ok) { if (ok) render(); });
    });
  }
  /* The proof is read only from .../payments/{id}/proof/, with the cookie, and shown from a blob URL. */
  function fetchProof(id) {
    return fetch(D.cfg.apiBase + base() + "payments/" + encodeURIComponent(id) + "/proof/", { method: "GET", credentials: "include" })
      .then(function (r) { return r.ok ? r.blob() : null; }).catch(function () { return null; });
  }
  function openProof(p, opener) {
    openDialog("Proof of payment", opener, function (box, d) {
      var hold = h("div", "bl-proof"), slotEl = h("div", "");
      add(hold, para("Loading the proof…", "bl-meta")); add(box, hold, slotEl);
      fetchProof(p.id).then(function (blob) {
        if (dlg !== d) return;
        clear(hold);
        if (!blob) { add(hold, para("We could not load the proof. Please try again.", "bl-meta")); return; }
        var url = URL.createObjectURL(blob); d.url = url;
        var pdf = blob.type === "application/pdf" || (p.proof && p.proof.content_type === "application/pdf");
        if (pdf) add(hold, para("This proof is a PDF.", "bl-meta"));
        else add(hold, attrs(h("img", "bl-proof-img"), { src: url, alt: "The proof of payment you sent" }));
        add(slotEl, attrs(h("a", "no-btn no-btn-primary bl-full", pdf ? "Open the proof (PDF)" : "Open the proof"), { href: url, target: "_blank", rel: "noopener" }));
      });
    });
  }

  /* ---- page A: choose a plan ---- */
  function backLink(label, fn) {
    var a = attrs(h("a", "bl-back", label), { href: "/settings/billing/?site=" + S.site });
    a.addEventListener("click", function (e) { e.preventDefault(); fn(); });
    return a;
  }
  function notPayable(r) {
    var reason = S.pay && S.pay.not_payable_reason, text = !S.pay || !S.pay.offers || !accounts().length ? "Payments are not open yet."
      : reason === "too_early" && S.pay.payable_from ? "You can pay for the next term from " + dateShort(S.pay.payable_from) + "." : NOT_PAYABLE[reason] || "You cannot pay right now.";
    add(r, backLink("← Back to billing", function () { go(null); }), add(h("section", "bl-card"), h("h2", "bl-h2", "Pay by bank transfer"), para(text)));
  }
  function planCardEl(o, trial, saving) {
    var promo = o.plan === "launch_promo", art = attrs(h("article", "bl-plan" + (promo ? " bl-plan-hot" : "")), { "aria-labelledby": "bl-pl-" + o.plan });
    if (promo) add(art, h("span", "bl-badge bl-badge-top", BEST_BADGE));
    var desc = h("div", "bl-plan-desc");
    offerLines(o, trial).forEach(function (l) { add(desc, h("p", "bl-plan-line", l)); });
    if (o.plan === "annual" && saving) add(desc, add(h("p", "bl-save bl-plan-line", "Save " + peso(saving)), h("span", "bl-pill", "2 months FREE")));
    var ul = h("ul", "bl-feat"); FEATURES.forEach(function (f) { add(ul, h("li", "", f)); });
    add(art, attrs(h("h2", "bl-plan-name", planOf(o.plan).card), { id: "bl-pl-" + o.plan }), h("p", "bl-plan-price", peso(o.amount_centavos)), desc, ul,
      btn(promo ? "Pay for this plan" : "Choose", promo ? "primary" : "ghost", function () { go("send", o.plan); }, "bl-full"));
    return art;
  }
  function annualSaving() {
    if (S.plans) return Promise.resolve(S.plans);
    return api("/plan/").then(function (res) {
      var a = res.ok && res.data && Array.isArray(res.data.plans) ? res.data.plans.filter(function (p) { return p.plan === "annual"; })[0] : null;
      S.plans = { annual: a && a.saving_centavos > 0 ? a.saving_centavos : 0 };
      return S.plans;
    });
  }
  function renderChoose(r) {
    if (!canPay()) return notPayable(r);
    var offers = sortOffers(S.pay.offers), trial = inTrial(), mine = token;
    var sec = h("section", "bl-choose"), plans = h("div", "bl-plans bl-plans-" + Math.min(offers.length, 3));
    var title = h("h2", "bl-choose-h", "Choose how to pay"); title.setAttribute("id", "bl-ch");
    add(sec, title, h("p", "bl-meta bl-choose-sub", "Pick a plan. You pay by bank transfer and send your proof on the next page."), plans);
    add(r, backLink("← Back to billing", function () { go(null); }), sec);
    function draw(saving) { clear(plans); offers.forEach(function (o) { add(plans, planCardEl(o, trial, saving)); }); }
    var hasAnnual = offers.some(function (o) { return o.plan === "annual"; });
    draw(0);
    if (hasAnnual) annualSaving().then(function (pl) { if (mine === token && pl.annual && routeOf(location.search).pay === "choose") draw(pl.annual); });
  }

  /* ---- page B: payment details ---- */
  function field(key, label, ph, extra) {
    var w = h("div", "bl-field"), id = "bl-f-" + key, input = attrs(h("input", "bl-input"), { id: id, name: key, placeholder: ph, autocomplete: "off" });
    if (extra) attrs(input, extra);
    var err = attrs(h("p", "bl-ferr"), { id: id + "-err", role: "alert" }); err.hidden = true;
    input.setAttribute("aria-describedby", id + "-err");
    add(w, attrs(h("label", "bl-label", label + " *"), { "for": id }), input, err);
    return { wrap: w, input: input, err: err };
  }
  function renderSend(r, code) {
    var offer = canPay() ? S.pay.offers.filter(function (o) { return o.plan === code; })[0] : null;
    if (!offer) {
      try { history.replaceState(null, "", urlFor(S.site, "choose")); } catch (e) { /* ignore */ }
      return renderChoose(r);
    }
    var trial = inTrial(), promo = !!(offer.consent && offer.consent.required), maxBytes = (S.pay.proof_rules && S.pay.proof_rules.max_bytes) || 5242880;
    var F = {}, errs = {}, touched = {}, banner = attrs(h("p", "bl-note"), { role: "alert", tabindex: "-1" });
    banner.hidden = true;
    var left = attrs(h("section", "bl-card"), { "aria-labelledby": "bl-sp" });
    add(left, attrs(h("h2", "bl-h2", "Your payment details"), { id: "bl-sp" }));
    if (underReview()) add(left, h("p", "bl-note", "Sending a new proof replaces the one under review."));
    add(left, banner);
    var grid = h("div", "bl-grid2");
    [["bank", "Sender Bank", "BDO", { maxlength: "80" }], ["ref", "Reference Number", "1234 5678 90", { maxlength: "64" }], ["first", "Sender First Name", "Juan", { maxlength: "80" }],
      ["last", "Sender Last Name", "dela Cruz", { maxlength: "80" }], ["acct", "Sender Account Number", "1234 5678 12", { maxlength: "34", inputmode: "numeric" }],
      ["amount", "Amount", peso(offer.amount_centavos).replace("PHP ", ""), { inputmode: "decimal" }]].forEach(function (f) { F[f[0]] = field(f[0], f[1], f[2], f[3]); add(grid, F[f[0]].wrap); });
    add(left, grid);
    var tw = h("div", "bl-field"), tl = attrs(h("span", "bl-label", "Time of Transfer *"), { id: "bl-tt" }), tg = attrs(h("div", "bl-time"), { role: "group", "aria-labelledby": "bl-tt" });
    var date = attrs(h("input", "bl-input"), { id: "bl-f-date", type: "date", "aria-label": "Date of transfer", max: manilaNow().slice(0, 10) });
    function sel(id, label, first, vals) {
      var s = attrs(h("select", "bl-input"), { id: id, "aria-label": label });
      add(s, attrs(h("option", "", first), { value: "" })); vals.forEach(function (v) { add(s, attrs(h("option", "", v), { value: v })); });
      return s;
    }
    var hours = [], mins = [], i;
    for (i = 1; i <= 12; i++) hours.push(String(i));
    for (i = 0; i < 60; i++) mins.push(pad(i));
    var hr = sel("bl-f-hr", "Hour", "Hour", hours), mn = sel("bl-f-mn", "Minute", "Min", mins), ap = sel("bl-f-ap", "AM or PM", "AM/PM", ["AM", "PM"]);
    var terr = attrs(h("p", "bl-ferr"), { id: "bl-f-time-err", role: "alert" }); terr.hidden = true;
    add(tg, date, hr, mn, ap); add(tw, tl, tg, terr); add(left, tw);
    F.time = { err: terr, controls: [date, hr, mn, ap] };
    [date, hr, mn, ap].forEach(function (n) { n.setAttribute("aria-describedby", "bl-f-time-err"); });
    var fw = h("div", "bl-field"), file = attrs(h("input", "bl-input bl-drop"), { id: "bl-f-file", type: "file", accept: TYPES.join(","), "aria-describedby": "bl-f-file-err" });
    var ferr = attrs(h("p", "bl-ferr"), { id: "bl-f-file-err", role: "alert" }); ferr.hidden = true;
    F.file = { err: ferr, controls: [file] };
    add(fw, attrs(h("label", "bl-label", "Upload the Payment Receipt *"), { "for": "bl-f-file" }), file, h("p", "bl-meta bl-hint", "JPEG, PNG or PDF, up to " + mb(maxBytes) + "."), ferr);
    add(left, fw, h("p", "bl-meta", "We review your proof and confirm your payment."));
    var consent = null, consentErr = null;
    if (promo) {
      var cb = attrs(h("input", ""), { type: "checkbox", id: "bl-consent" }), cwrap = h("div", "bl-consent");
      consentErr = attrs(h("p", "bl-ferr"), { id: "bl-consent-err", role: "alert" }); consentErr.hidden = true;
      F.consent = { err: consentErr, controls: [cb] };
      cb.setAttribute("aria-describedby", "bl-consent-err");
      add(cwrap, para(consentText(offer, trial), "bl-consent-text"), add(h("label", "bl-check"), cb, h("span", "", "I understand and accept the Launch Promo terms above.")), consentErr);
      add(left, cwrap); consent = cb;
    }
    var send = btn("Send proof — " + peso(offer.amount_centavos), "primary", null, "bl-full"); send.setAttribute("id", "bl-send");
    /* While Send is disabled, a visible line says what is still needed; it is the button's description and is hidden when all is valid. */
    var need = h("p", "bl-meta", ""); need.setAttribute("id", "bl-send-need"); need.hidden = true;
    send.setAttribute("aria-describedby", "bl-send-need");
    add(left, send, need);
    var NAMES = { bank: "Sender Bank", ref: "Reference Number", first: "Sender First Name", last: "Sender Last Name", acct: "Sender Account Number", amount: "Amount",
      time: "Time of Transfer", file: "Payment Receipt", consent: "Launch Promo terms" };
    var KEYS = ["bank", "ref", "first", "last", "acct", "amount", "time", "file", "consent"];

    function values() {
      return { bank: F.bank.input.value, ref: F.ref.input.value, first: F.first.input.value, last: F.last.input.value, acct: F.acct.input.value, amount: F.amount.input.value,
        date: date.value, hour: hr.value, minute: mn.value, ap: ap.value, file: file.files && file.files[0] || null, consent: consent ? consent.checked : false };
    }
    function check() { return validate(values(), { now: manilaNow(), maxBytes: maxBytes, needConsent: promo }); }
    function paint(key, on) {
      var e = F[key] && F[key].err; if (!e) return;
      var msg = errs[key] && on ? errs[key] : "";
      e.textContent = msg; e.hidden = !msg;
      (F[key].controls || (F[key].input ? [F[key].input] : [])).forEach(function (c) { if (msg) c.setAttribute("aria-invalid", "true"); else c.removeAttribute("aria-invalid"); });
    }
    function update() {
      errs = check();
      Object.keys(F).forEach(function (k) { paint(k, !!touched[k]); });
      var missing = KEYS.filter(function (k) { return errs[k]; }).map(function (k) { return NAMES[k]; });
      need.textContent = missing.length ? "Still needed: " + missing.join(", ") : ""; need.hidden = !missing.length;
      setDisabled(send, busy || Object.keys(errs).length > 0);
    }
    /* Focus the first shown error in form order, else the alert message; never leave it on a disabled button or body. */
    function focusFirstBad() {
      var bad = KEYS.filter(function (k) { return F[k] && !F[k].err.hidden; })[0], f = bad && F[bad], t = f && (f.controls ? f.controls[0] : f.input);
      var el = (t && t.focus) ? t : (!banner.hidden && banner.focus ? banner : null);
      if (!el) return;
      /* preventScroll then centre it: the browser's own focus scroll can leave the field under the sticky top bar. */
      el.focus({ preventScroll: true });
      if (el.scrollIntoView) el.scrollIntoView({ block: "center" });
    }
    function mark(key) { return function () { touched[key] = true; update(); }; }
    ["bank", "ref", "first", "last", "acct", "amount"].forEach(function (k) {
      F[k].input.addEventListener("input", update); F[k].input.addEventListener("change", update); F[k].input.addEventListener("blur", mark(k));
    });
    [date, hr, mn, ap].forEach(function (n) { n.addEventListener("input", update); n.addEventListener("change", function () { touched.time = true; update(); }); });
    file.addEventListener("input", update); file.addEventListener("change", function () { touched.file = true; update(); });
    if (consent) { consent.addEventListener("input", update); consent.addEventListener("change", function () { touched.consent = true; update(); }); }

    send.addEventListener("click", function () {
      if (busy) return;
      update(); if (Object.keys(errs).length) { Object.keys(errs).forEach(function (k) { touched[k] = true; }); update(); focusFirstBad(); return; }
      var v = values(), fd = new FormData();
      fd.append("plan", offer.plan);
      fd.append("transferred_at", localStamp(v.date, v.hour, v.minute, v.ap)); fd.append("transferred_on", v.date);
      fd.append("transfer_reference", v.ref.trim()); fd.append("sender_bank", v.bank.trim());
      fd.append("sender_first_name", v.first.trim()); fd.append("sender_last_name", v.last.trim());
      fd.append("sender_account_number", v.acct.trim()); fd.append("amount_sent", amountText(v.amount));
      if (promo) { fd.append("renewal_consent", "true"); fd.append("consent_version", offer.consent.version); }
      fd.append("proof", v.file);
      busy = true; send.setAttribute("aria-busy", "true"); setDisabled(send, true); banner.hidden = true;
      var mine = token;
      D.send("POST", base() + "payments/", fd).then(function (res) {
        busy = false; send.removeAttribute("aria-busy");
        if (mine !== token || res.status === 401) return;
        if (res.ok) { /* 201 new, 200 the same file again: both are a proof under review */
          toast("Proof sent", "We will review your proof and confirm your payment.");
          reload().then(function () { try { history.pushState(null, "", urlFor(S.site, null)); } catch (e) { /* ignore */ } render(); focusTop(); });
          return;
        }
        var fields = res.data && res.data.fields, shown = false, rest = [], unknown = false;
        if (res.status === 400 && fields) {
          Object.keys(fields).forEach(function (k) {
            var key = FIELD_OF[k];
            if (key && F[key]) { errs[key] = String(fields[k]); touched[key] = true; paint(key, true); shown = true; return; }
            if (LABEL_OF[k]) { if (rest.indexOf(LABEL_OF[k]) < 0) rest.push(LABEL_OF[k]); } else unknown = true;
          });
        }
        /* A field with no place on this form is named in the banner, by the page's own label; an unknown key is never quoted. */
        if (rest.length) { banner.textContent = "Check these fields: " + rest.join(", ") + "."; banner.hidden = false; }
        else if (!shown || unknown) { banner.textContent = refusal(res); banner.hidden = false; }
        setDisabled(send, false); focusFirstBad();
        if (res.status === 409) {
          toast("That did not work", refusal(res), "error");
          reload().then(function (ok) { if (ok && mine === token) { render(); focusTop(); } });
        }
      });
    });

    /* right column: where to send the money, and the summary */
    var side = h("div", "bl-side"), to = attrs(h("section", "bl-card"), { "aria-labelledby": "bl-to" });
    add(to, attrs(h("h2", "bl-h2", "Send exactly " + peso(offer.amount_centavos) + " to this account"), { id: "bl-to" }));
    accounts().forEach(function (a) {
      var no = h("span", "bl-acctno", a.account_number), cp = btn("Copy", "ghost", function () {
        try { navigator.clipboard.writeText(a.account_number).then(function () { toast("Copied", ""); }, function () { /* ignore */ }); } catch (e) { /* ignore */ }
      }, "bl-copy");
      add(to, facts([[a.kind === "ewallet" ? "E-wallet" : "Bank", a.provider_name], ["Account name", a.account_name], ["Account number", add(h("span", ""), no, cp)]]));
    });
    var sum = attrs(h("aside", "bl-card"), { "aria-labelledby": "bl-su" });
    add(sum, attrs(h("h2", "bl-h2", "Summary"), { id: "bl-su" }), h("p", "bl-sum-name", planOf(offer.plan).name));
    offerLines(offer, trial).forEach(function (l) { add(sum, h("p", "bl-meta", l)); });
    add(sum, add(h("div", "bl-total"), h("span", "", "Total"), h("b", "", peso(offer.amount_centavos))));
    add(side, to, sum);
    add(r, add(h("div", "bl-backs"), backLink("← Change plan", function () { go("choose"); }), backLink("Back to billing", function () { go(null); })), add(h("div", "bl-pay"), left, side));
    update();
  }

  /* Billing-only check for the dashboard shell (dashboard.js, ClickUp z8uq9mfvgn): reads the same GET /sites/{id}/billing/ and
     calls onBillingOnly() only when the answer is a 200 with billing_only exactly true. Any other answer does nothing. */
  function probe(onBillingOnly) {
    D.call("GET", "/sites/", null, true).then(function (res) {
      var sites = res && res.ok ? D.sitesOf(res) : [];
      if (!sites.length) return;
      var site = D.siteFromQuery(sites.map(function (x) { return x.id; }));
      if (!site) return;
      api("/sites/" + site + "/billing/").then(function (r) {
        if (r && r.ok && r.data && r.data.billing_only === true) onBillingOnly();
      });
    });
  }

  window.NOBilling = { show: show, hide: hide, probe: probe, util: { peso: peso, dateShort: dateShort, periodText: periodText, gbText: gbText, pctOf: pctOf, instant: instant, offersLine: offersLine, offerLines: offerLines,
    consentText: consentText, amountText: amountText, localStamp: localStamp, manilaNow: manilaNow, validate: validate, refusal: refusal, routeOf: routeOf, urlFor: urlFor, sortOffers: sortOffers } };
})();
