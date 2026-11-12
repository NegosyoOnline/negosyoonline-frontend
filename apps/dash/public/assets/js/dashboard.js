/* Subscriber dashboard: Overview (trial and optional kpis from GET /dashboard/), honest "not available yet" panels
   for Orders, Products, Storefront, Earnings, People and Usage, and path routing (History API). Every status and date comes from the API; only the greeting
   reads the clock. API strings reach the page through textContent, D.el or input.value only. */
(function () {
  var D = window.NODash, $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["overview", "orders", "orders-new", "products", "storefront", "media-library", "earnings", "people", "usage", "subscription", "account", "help", "referral",
    "settings-general", "settings-plans", "settings-billing", "settings-payments", "settings-shipping", "settings-domain", "settings-automation", "settings-notification"];
  var TAB_VIEWS = ["overview", "orders", "orders-new", "products"]; /* every other view is reached through the mobile More sheet */
  var ROUTES = {
    "/": { view: "overview", title: "Dashboard | NegosyoOnline" },
    "/orders/": { view: "orders", title: "Orders | NegosyoOnline" },
    "/orders/new/": { view: "orders-new", title: "Add order | NegosyoOnline" },
    "/products/": { view: "products", title: "Products | NegosyoOnline" },
    "/storefront/": { view: "storefront", title: "Storefront | NegosyoOnline" },
    "/media-library/": { view: "media-library", title: "Media Library | NegosyoOnline" },
    "/earnings/": { view: "earnings", title: "Earnings | NegosyoOnline" },
    "/people/": { view: "people", title: "People | NegosyoOnline" },
    "/usage/": { view: "usage", title: "Usage | NegosyoOnline" },
    "/subscription/": { view: "subscription", title: "My Subscription | NegosyoOnline" },
    "/account/": { view: "account", title: "Account Settings | NegosyoOnline" },
    "/help/": { view: "help", title: "Help Center | NegosyoOnline" },
    "/referral/": { view: "referral", title: "Referral | NegosyoOnline" },
    "/settings/business/": { view: "settings-general", title: "Business Settings | NegosyoOnline" },
    "/settings/general/": { view: "settings-general", title: "Business Settings | NegosyoOnline" }, /* the old address still opens the page (Phase 5 D9) */
    "/settings/plans/": { view: "settings-plans", title: "Plans | NegosyoOnline" },
    "/settings/billing/": { view: "settings-billing", title: "Billing | NegosyoOnline" },
    "/settings/payments/": { view: "settings-payments", title: "Payments | NegosyoOnline" },
    "/settings/shipping/": { view: "settings-shipping", title: "Shipping | NegosyoOnline" },
    "/settings/domain/": { view: "settings-domain", title: "Domain | NegosyoOnline" },
    "/settings/automation/": { view: "settings-automation", title: "Automation Tools | NegosyoOnline" },
    "/settings/notification/": { view: "settings-notification", title: "Notification | NegosyoOnline" }
  };
  /* An address that has moved: the address bar is rewritten to where its content now lives. Santé setup is a card on
     Business Settings (ClickUp z8uq9m92ez, Coach Ed's ruling of 2026-11-11), so an old link or bookmark still works. */
  var MOVED = { "/settings/sante/": "/settings/business/" };
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  function messageOf(res, fallback) {
    var m = res && res.data && res.data.message;
    return typeof m === "string" && m ? m : fallback;
  }

  function greeting(account) {
    var first = (account.first_name || "").trim(), word;
    try {
      var hour = parseInt(new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" }).format(new Date()), 10);
      if (isNaN(hour)) throw new Error("hour");
      word = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    } catch (e) { word = "Welcome"; }
    return first ? word + ", " + first : word;
  }

  /* The path is only a key into ROUTES; it never reaches a selector, HTML markup or a URL. Hosting rewrites every
     dashboard path to index.html (vercel.json). An unknown path falls back to Overview and the address bar is reset to "/". */
  function currentPath() { var p = location.pathname || "/"; return p.slice(-1) === "/" ? p : p + "/"; }
  var shownView = null;
  function route(initial) {
    var p = currentPath();
    if (has(MOVED, p)) p = MOVED[p]; /* the replaceState below puts the new address, with its query string, in the bar */
    var known = has(ROUTES, p);
    var r = known ? ROUTES[p] : ROUTES["/"];
    if (r.view !== "overview" && dlgClose()) OB.reopen = true; /* CR-2 11.2 item 7(c): the popup never outlives "/" */
    /* A known path keeps its query string (the Billing page reads ?site= and ?setup=); an unknown path resets to "/". */
    if (typeof history !== "undefined" && history.replaceState && (!known || location.pathname !== p)) { try { history.replaceState(null, "", known ? p + location.search : "/"); } catch (e) { /* ignore */ } }
    VIEWS.forEach(function (v) { $("view-" + v).hidden = v !== r.view; });
    Array.prototype.forEach.call(document.querySelectorAll("#side [data-route], #tabs [data-route], #set-tabs [data-route]"), function (a) {
      if (a.getAttribute("data-route") === r.view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var more = $("tab-more");
    if (more) { if (TAB_VIEWS.indexOf(r.view) < 0) more.setAttribute("aria-current", "page"); else more.removeAttribute("aria-current"); }
    var inSettings = r.view.indexOf("settings-") === 0, group = $("settings-link"), setTabs = $("set-tabs");
    if (setTabs) setTabs.hidden = !inSettings;
    if (group) { if (inSettings) group.setAttribute("aria-current", "page"); else group.removeAttribute("aria-current"); }
    document.title = r.title;
    var B = window.NOBilling; /* billing.js loads after this file; entering and leaving the Billing view only */
    if (B && shownView === "settings-billing" && r.view !== "settings-billing") B.hide();
    if (B && r.view === "settings-billing" && shownView !== "settings-billing") B.show();
    var P = window.NOPayments; /* payments.js loads after this file; same enter/leave hooks as Billing */
    if (P && shownView === "settings-payments" && r.view !== "settings-payments") P.hide();
    if (P && r.view === "settings-payments" && shownView !== "settings-payments") P.show();
    var PO = window.NOPackOrders; /* pack-orders.js loads after this file; entering and leaving Orders only */
    if (PO && shownView === "orders" && r.view !== "orders") PO.hide();
    if (PO && r.view === "orders" && shownView !== "orders") PO.show();
    var G = window.NOBusiness; /* business.js loads after this file; same enter/leave hooks as Billing */
    if (G && shownView === "settings-general" && r.view !== "settings-general") G.hide();
    if (G && r.view === "settings-general" && shownView !== "settings-general") G.show();
    var S = window.NOStorefrontSettings; /* storefront-settings.js loads after this file; same enter/leave hooks as Billing */
    if (S && shownView === "settings-shipping" && r.view !== "settings-shipping") S.hide();
    if (S && r.view === "settings-shipping" && shownView !== "settings-shipping") S.show();
    var E = window.NOEarnings; /* earnings.js loads after this file; same enter/leave hooks as Billing (E8 S1 to S5) */
    if (E && shownView === "earnings" && r.view !== "earnings") E.hide();
    if (E && r.view === "earnings" && shownView !== "earnings") E.show();
    var A = window.NOAccount; /* account.js loads after this file; entering the Account view only (Phase 4 spec D15) */
    if (A && r.view === "account" && shownView !== "account") A.show();
    shownView = r.view;
    if (!initial) $("h-" + r.view).focus();
    if (r.view === "overview" && OB.reopen) { OB.reopen = false; load(); } /* returning to "/" reopens from server state */
  }

  /* A plain left click on a link to a known dashboard path is handled here (History API); anything else, such as a
     modified click, another origin or an unknown path, is left to the browser. */
  function onLinkClick(e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    var href = a ? a.getAttribute("href") : null;
    if (!href || !has(ROUTES, href) || (a.target && a.target !== "_self")) return;
    e.preventDefault();
    /* Moving between Settings tabs keeps ?site= so General, Billing and Payments stay on the same store. */
    var store = /[?&]site=site_[0-9a-z]{20}/.exec(location.search), keep = store && href.indexOf("/settings/") === 0 && currentPath().indexOf("/settings/") === 0;
    if (href !== currentPath() && typeof history !== "undefined" && history.pushState) history.pushState(null, "", keep ? href + "?" + store[0].slice(1) : href);
    route(false);
  }

  function chip(kind, text) { return D.el("span", { "class": "chip chip-" + kind }, text); }

  function skeleton(body) {
    body.textContent = "";
    var sk = D.el("div", { "class": "skel", "aria-busy": "true" });
    sk.appendChild(D.el("span", { "class": "sr-only" }, "Loading your dashboard"));
    sk.appendChild(D.el("div", { "class": "skel-block skel-banner", "aria-hidden": "true" }));
    sk.appendChild(D.el("div", { "class": "skel-block skel-need", "aria-hidden": "true" }));
    var kpis = D.el("div", { "class": "skel-row", "aria-hidden": "true" });
    for (var i = 0; i < 4; i++) kpis.appendChild(D.el("div", { "class": "skel-block skel-kpi" }));
    sk.appendChild(kpis);
    var row = D.el("div", { "class": "skel-row", "aria-hidden": "true" });
    row.appendChild(D.el("div", { "class": "skel-block skel-mon" }));
    row.appendChild(D.el("div", { "class": "skel-block skel-money" }));
    sk.appendChild(row);
    body.appendChild(sk);
  }

  function errorBox(body, res) {
    body.textContent = "";
    var box = D.el("div", { "class": "err-box", role: "alert" });
    box.appendChild(D.el("h2", {}, "We could not load your dashboard"));
    box.appendChild(D.el("p", {}, messageOf(res, "Check your connection and try again.")));
    var again = D.el("button", { type: "button", "class": "no-btn no-btn-ghost" }, "Try again");
    again.addEventListener("click", function () { load(true); });
    box.appendChild(again);
    body.appendChild(box);
  }

  function trialBanner(trial, headId) {
    headId = headId || "h-trial";
    var t = trial || {}, start = D.date(t.trial_start_at), end = D.date(t.trial_end_at);
    var byStatus = {
      trial_active: { chip: ["info", "Free trial"], head: "Your " + t.trial_days + "-day free trial is active",
        copy: [start && "Started " + start, end && "Ends " + end].filter(Boolean).join(" · ") },
      trial_ended: { chip: ["neutral", "Trial ended"], head: "Your free trial has ended",
        copy: (end ? "Ended " + end + ". " : "") + "Your account and records are kept." },
      pending_verification: { chip: ["neutral", "Free trial"], head: "Your free trial started when you created your account", copy: "Verify your email to open your dashboard." }
    };
    var v = has(byStatus, t.status) ? byStatus[t.status] : { chip: null, head: "Trial status", copy: "" };
    var box = D.el("section", { "class": "trial-banner", "aria-labelledby": headId });
    if (v.chip) box.appendChild(chip(v.chip[0], v.chip[1]));
    box.appendChild(D.el("h2", { id: headId }, v.head));
    if (v.copy) box.appendChild(D.el("p", {}, v.copy));
    return box;
  }

  function referralCard(ref, headId) {
    headId = headId || "h-ref";
    var card = D.el("section", { "class": "dash-card ref-card", "aria-labelledby": headId });
    card.appendChild(D.el("h2", { id: headId }, "Your referral link"));
    if (!ref) {
      card.appendChild(D.el("p", { "class": "dash-copy" }, "Your referral link becomes available once you have an active paid subscription. See the Referral Program Terms."));
      return card;
    }
    card.appendChild(D.el("p", { "class": "dash-copy" }, "Share your link with other business owners."));
    var code = D.el("p", { "class": "ref-code" });
    code.appendChild(D.el("span", { "class": "ref-code-label" }, "Referral code"));
    code.appendChild(D.el("strong", {}, ref.code));
    card.appendChild(code);
    var field = D.el("div", { "class": "ref-field" });
    var input = D.el("input", { type: "text", readonly: "", "aria-label": "Your referral link" });
    input.value = ref.link;
    var copy = D.el("button", { type: "button", "class": "no-btn no-btn-primary" }, "Copy");
    field.appendChild(input); field.appendChild(copy);
    var msg = D.el("p", { "class": "ref-status", role: "status" });
    copy.addEventListener("click", function () {
      var done = function () { msg.textContent = "Referral link copied."; };
      var manual = function () { input.select(); msg.textContent = "Press Ctrl+C or Cmd+C to copy."; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ref.link).then(done, manual);
      else manual();
    });
    if (navigator.share) {
      var share = D.el("button", { type: "button", "class": "no-btn no-btn-ghost" }, "Share");
      share.addEventListener("click", function () { navigator.share({ title: "NegosyoOnline", url: ref.link }).catch(function () {}); });
      field.appendChild(share);
    }
    card.appendChild(field); card.appendChild(msg);
    return card;
  }

  function backLink() { return D.el("a", { "class": "no-btn no-btn-ghost", href: "/" }, "Back to Overview"); }

  /* My Subscription: the real trial status from the /dashboard/ data already loaded (no extra request), then an honest
     "not available yet" card. Before the data loads, or if it failed, only the card shows. */
  function renderSubscription(trial) {
    var body = $("sub-body");
    if (!body) return;
    body.textContent = "";
    var wrap = D.el("div", { "class": "stack" });
    if (trial) wrap.appendChild(trialBanner(trial, "h-trial-sub"));
    var card = D.el("section", { "class": "dash-card ph-card", "aria-labelledby": "h-sub-ph" });
    card.appendChild(chip("neutral", "Not available yet"));
    card.appendChild(D.el("h2", { id: "h-sub-ph" }, "Plans and payment are not available yet"));
    card.appendChild(D.el("p", {}, trial
      ? "Choosing a plan and paying for your subscription are not part of your dashboard yet. Your trial details are shown above."
      : "Choosing a plan and paying for your subscription are not part of your dashboard yet."));
    card.appendChild(backLink());
    wrap.appendChild(card);
    body.appendChild(wrap);
  }

  /* Referral panel: the same referral card as Overview from the /dashboard/ data already loaded (no extra request).
     Before the data loads, or if it failed, an honest note points back to Overview. */
  function renderReferral(loaded, ref) {
    var body = $("ref-body");
    if (!body) return;
    body.textContent = "";
    var wrap = D.el("div", { "class": "stack" });
    if (loaded) wrap.appendChild(referralCard(ref || null, "h-ref-panel"));
    else {
      var card = D.el("section", { "class": "dash-card ph-card", "aria-labelledby": "h-ref-ph" });
      card.appendChild(D.el("h2", { id: "h-ref-ph" }, "Your referral link"));
      card.appendChild(D.el("p", {}, "Your referral details are not loaded yet. Go back to Overview to try again."));
      card.appendChild(backLink());
      wrap.appendChild(card);
    }
    body.appendChild(wrap);
  }

  /* Account Settings: read-only values from the /me/ account already in hand. */
  function renderAccountPanel(a) {
    var body = $("acct-body");
    if (!body) return;
    body.textContent = "";
    var wrap = D.el("div", { "class": "stack" });
    var name = ((a.first_name || "") + " " + (a.last_name || "")).trim();
    var info = D.el("section", { "class": "dash-card", "aria-labelledby": "h-acct-info" });
    info.appendChild(D.el("h2", { id: "h-acct-info" }, "Your details"));
    var dl = D.el("dl", { "class": "acct-rows" });
    dl.appendChild(D.el("dt", {}, "Name"));
    dl.appendChild(D.el("dd", {}, name || "Not provided"));
    dl.appendChild(D.el("dt", {}, "Email"));
    dl.appendChild(D.el("dd", {}, a.email || ""));
    dl.appendChild(D.el("dt", {}, "Email status"));
    var dd = D.el("dd");
    dd.appendChild(a.email_verified ? chip("ok", "Verified") : chip("neutral", "Not verified"));
    dl.appendChild(dd);
    info.appendChild(dl);
    wrap.appendChild(info);
    var card = D.el("section", { "class": "dash-card ph-card", "aria-label": "Changing account details" });
    card.appendChild(chip("neutral", "Not available yet"));
    card.appendChild(D.el("p", {}, "Changing your account details is not available yet."));
    card.appendChild(backLink());
    wrap.appendChild(card);
    body.appendChild(wrap);
  }

  /* Overview. Every figure comes from the optional res.data.kpis object on GET /dashboard/; the browser formats it and computes the
     two conversion rates from the sent counts. The live API does not send kpis yet. With no kpis, Verified sales, Member earnings
     owed, the Needs action counts and the Order Monitoring total, chips and chart read "Not yet" or "-"; Orders placed,
     Fulfillment backlog, Money to watch, Top products and the Traffic counts read 0 (₱0 for money). No other value is invented. */
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function peso(v) { v = num(v); return v === null ? null : "₱" + v.toLocaleString("en-PH", { maximumFractionDigits: 0 }); }
  function obj(v) { return v && typeof v === "object" ? v : {}; }
  function trialStrip(trial) {
    var t = trial || {}, end = D.date(t.trial_end_at);
    var byStatus = {
      trial_active: { head: "Free trial active", copy: end ? "Ends " + end : "" },
      trial_ended: { head: "Your free trial has ended", copy: (end ? "Ended " + end + ". " : "") + "Your account and records are kept." },
      pending_verification: { head: "Your free trial started when you created your account", copy: "Verify your email to open your dashboard." }
    };
    var v = has(byStatus, t.status) ? byStatus[t.status] : { head: "Trial status", copy: "" };
    var box = D.el("section", { "class": "ov-trial", "aria-labelledby": "h-trial" });
    var ico = D.el("span", { "class": "ov-trial-ico", "aria-hidden": "true" }, "i");
    var txt = D.el("div", { "class": "ov-trial-txt" });
    txt.appendChild(D.el("h2", { id: "h-trial" }, v.head));
    if (v.copy) txt.appendChild(D.el("p", {}, v.copy));
    var link = D.el("a", { "class": "ov-trial-link", href: "/settings/billing/" }, "Billing");
    link.appendChild(D.el("span", { "aria-hidden": "true" }, " ›"));
    box.appendChild(ico); box.appendChild(txt); box.appendChild(link);
    return box;
  }

  function needsAction(k) {
    var n = obj(k.needs_action);
    var items = [
      ["payments_to_review", "Payments to review", "Verify receipt first", "/orders/", "amber"],
      ["ready_to_fulfill", "Ready to book", "Payment checks passed", "/orders/", "blue"],
      ["withdrawals_to_pay", "Pending Withdrawal", "Send disbursement", "/earnings/", "red"],
      ["member_registrations", "Member registrations", "Registration still pending", "/people/", "blue"]
    ];
    var total = 0, seen = 0;
    items.forEach(function (it) { var c = num(n[it[0]]); if (c !== null) { total += c; seen++; } });
    var card = D.el("section", { "class": "dash-card ov-need", "aria-labelledby": "h-need" });
    var head = D.el("div", { "class": "ov-need-head" });
    head.appendChild(D.el("h2", { id: "h-need" }, "Needs action"));
    if (seen === items.length && total > 0) head.appendChild(D.el("span", { "class": "ov-pill", "aria-label": total + " items need action" }, String(total)));
    card.appendChild(head);
    card.appendChild(D.el("p", { "class": "ov-sub" }, "Items that can delay payments, delivery or member service"));
    var grid = D.el("div", { "class": "ov-need-grid" });
    items.forEach(function (it) {
      var c = num(n[it[0]]);
      var a = D.el("a", { "class": "ov-need-item ov-" + it[4], href: it[3] });
      a.appendChild(D.el("span", { "class": "ov-need-num" }, c === null ? "-" : String(c)));
      var t = D.el("span", { "class": "ov-need-txt" });
      t.appendChild(D.el("strong", {}, it[1]));
      t.appendChild(D.el("span", {}, c === null ? "Not yet" : it[2]));
      a.appendChild(t);
      grid.appendChild(a);
    });
    card.appendChild(grid);
    return card;
  }

  function kpiTiles(k) {
    var sales = obj(k.verified_sales), placed = obj(k.orders_placed), back = obj(k.fulfillment_backlog), owed = obj(k.member_earnings_owed);
    var pct = num(sales.change_pct);
    var pctText = pct === null ? "" : (pct >= 0 ? "+" : "−") + Math.abs(Math.round(pct)) + "% vs last month";
    var tiles = [
      ["green", "Verified sales", peso(sales.amount), "This month", pctText, pct !== null && pct < 0 ? "down" : "up"],
      ["blue", "Orders placed", num(placed.month) === null ? "0" : String(placed.month), "This month", num(placed.today) > 0 ? "+" + placed.today + " today" : "", "up"],
      ["amber", "Fulfillment backlog", num(back.count) === null ? "0" : String(back.count), "Orders eligible to ship now", "", ""],
      ["red", "Member earnings owed", peso(owed.amount), "Available and unpaid", "", ""]
    ];
    var row = D.el("div", { "class": "ov-kpis" });
    tiles.forEach(function (t) {
      var c = D.el("section", { "class": "ov-kpi ov-" + t[0] });
      c.appendChild(D.el("h2", {}, t[1]));
      c.appendChild(D.el("p", { "class": "ov-kpi-val" + (t[2] === null ? " ov-kpi-none" : "") }, t[2] === null ? "Not yet" : t[2]));
      if (t[2] !== null) {
        var note = D.el("p", { "class": "ov-kpi-note" }, t[3]);
        if (t[4]) { note.appendChild(D.el("span", { "aria-hidden": "true" }, " · ")); note.appendChild(D.el("span", { "class": "ov-" + (t[5] || "muted") }, t[4])); }
        c.appendChild(note);
      }
      row.appendChild(c);
    });
    return row;
  }

  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function monitoring(k) {
    var m = obj(k.monitoring), weekly = Array.isArray(m.weekly) && m.weekly.length === 7 ? m.weekly.map(num) : null;
    var total = num(m.week_total);
    var card = D.el("section", { "class": "dash-card ov-mon", "aria-labelledby": "h-mon" });
    var head = D.el("div", { "class": "ov-mon-head" });
    var tile = D.el("span", { "class": "ov-mon-ico" }); tile.setAttribute("aria-hidden", "true");
    var ht = D.el("div", { "class": "ov-mon-title" });
    ht.appendChild(D.el("h2", { id: "h-mon" }, "Order Monitoring"));
    ht.appendChild(D.el("p", {}, "Track your weekly customer order activity."));
    head.appendChild(tile); head.appendChild(ht);
    head.appendChild(D.el("p", { "class": "ov-mon-total" }, total === null ? "Not yet" : total + (total === 1 ? " order this week" : " orders this week")));
    card.appendChild(head);
    var chips = D.el("div", { "class": "ov-chips" });
    [["for_booking", "For Booking", "amber"], ["for_pickup", "For Pickup", "violet"], ["shipping", "Shipping", "blue"], ["delivered", "Delivered", "grey"]].forEach(function (c) {
      var v = num(m[c[0]]);
      var chipEl = D.el("div", { "class": "ov-chip" });
      var dot = D.el("span", { "class": "ov-dot ov-" + c[2], "aria-hidden": "true" });
      var src = $("ov-ico-" + c[0]);
      if (src && src.cloneNode) { var glyph = src.cloneNode(true); glyph.removeAttribute("id"); dot.appendChild(glyph); }
      chipEl.appendChild(dot);
      var t = D.el("span", { "class": "ov-chip-txt" });
      t.appendChild(D.el("strong", {}, v === null ? "-" : String(v)));
      t.appendChild(D.el("span", {}, c[1]));
      chipEl.appendChild(t);
      chips.appendChild(chipEl);
    });
    card.appendChild(chips);
    card.appendChild(D.el("p", { "class": "ov-week-label" }, "Weekly Orders · Sun to Sat"));
    var chart = D.el("div", { "class": "ov-chart" });
    if (!weekly) {
      chart.appendChild(D.el("p", { "class": "ov-chart-none" }, "Not yet"));
    } else {
      var max = Math.max.apply(null, weekly.map(function (x) { return x || 0; }));
      chart.setAttribute("role", "img");
      chart.setAttribute("aria-label", "Orders per day this week: " + DAYS.map(function (d, i) { return d + " " + (weekly[i] || 0); }).join(", "));
      DAYS.forEach(function (d, i) {
        var v = weekly[i] || 0, col = D.el("div", { "class": "ov-bar-col", "aria-hidden": "true" });
        col.appendChild(D.el("span", { "class": "ov-bar-n" }, v > 0 ? String(v) : ""));
        var bar = D.el("span", { "class": "ov-bar" + (v > 0 ? "" : " ov-bar-zero") });
        if (v > 0) bar.style.height = Math.max(8, Math.round(v / max * 64)) + "px";
        col.appendChild(bar);
        col.appendChild(D.el("span", { "class": "ov-bar-d" }, d));
        chart.appendChild(col);
      });
    }
    card.appendChild(chart);
    return card;
  }

  function moneyToWatch(k) {
    var m = obj(k.money_to_watch), pay = obj(m.payment_proofs), cod = obj(m.cod_remittance), pend = obj(m.pending_member_earnings);
    function orders(o, tail) { var c = num(o.orders); return c === null ? "" : c + (c === 1 ? " order" : " orders") + tail; }
    var rows = [
      ["Payment proofs awaiting review", (num(pay.orders) === null ? "0 orders · Not verified" : orders(pay, " · Not verified")), peso(pay.amount), "amber"],
      ["COD remittance to confirm", (num(cod.orders) === null ? "" : cod.orders + " delivered product " + (cod.orders === 1 ? "order" : "orders")), peso(cod.amount), "amber"],
      ["Pending member earnings", "Not yet available for withdrawal", peso(pend.amount), "blue"]
    ];
    var card = D.el("section", { "class": "dash-card ov-money", "aria-labelledby": "h-money" });
    card.appendChild(D.el("h2", { id: "h-money" }, "Money to watch"));
    card.appendChild(D.el("p", { "class": "ov-sub" }, "Amounts still needing a separate step"));
    var list = D.el("ul", { "class": "ov-money-list" });
    rows.forEach(function (r) {
      var li = D.el("li", {});
      var l = D.el("div", {});
      l.appendChild(D.el("strong", {}, r[0]));
      if (r[1]) l.appendChild(D.el("span", {}, r[1]));
      li.appendChild(l);
      li.appendChild(D.el("span", { "class": "ov-amt ov-" + r[3] }, r[2] === null ? "₱0" : r[2]));
      list.appendChild(li);
    });
    card.appendChild(list);
    return card;
  }

  /* Top products and Traffic and conversion. Both read optional kpis objects (kpis.top_products.items[] and kpis.traffic); a missing figure reads 0, a rate is 0.0% when its denominator is 0, and nothing is invented. */
  function cnt(v) { v = num(v); return v === null ? 0 : v; }
  function whole(v) { return cnt(v).toLocaleString("en-PH", { maximumFractionDigits: 0 }); }
  function rate(a, b) { a = cnt(a); b = cnt(b); return (b > 0 ? a / b * 100 : 0).toFixed(1) + "%"; }

  function topProducts(k) {
    var t = obj(k.top_products), items = Array.isArray(t.items) ? t.items.slice(0, 5) : [];
    var card = D.el("section", { "class": "dash-card ov-mon ov-tp", "aria-labelledby": "h-tp" });
    var head = D.el("div", { "class": "ov-mon-head" });
    var ht = D.el("div", { "class": "ov-mon-title" });
    ht.appendChild(D.el("h2", { id: "h-tp" }, "Top products this month"));
    ht.appendChild(D.el("p", {}, "Your best sellers by units sold."));
    head.appendChild(ht);
    card.appendChild(head);
    var table = D.el("table", { "class": "ov-tp-table" });
    var hr = D.el("tr", {});
    [["Product", ""], ["Units", "ov-num"], ["Sales", "ov-num"]].forEach(function (c) { hr.appendChild(D.el("th", { scope: "col", "class": c[1] }, c[0])); });
    var th = D.el("thead", {}); th.appendChild(hr); table.appendChild(th);
    var tb = D.el("tbody", {});
    items.forEach(function (it, i) {
      it = obj(it);
      var tr = D.el("tr", {}), first = D.el("td", {}), cell = D.el("div", { "class": "ov-tp-name" });
      cell.appendChild(D.el("span", { "class": "ov-rank ov-rank-" + (i + 1), "aria-hidden": "true" }, String(i + 1)));
      cell.appendChild(D.el("span", {}, typeof it.name === "string" ? it.name : ""));
      first.appendChild(cell);
      tr.appendChild(first);
      tr.appendChild(D.el("td", { "class": "ov-num" }, whole(it.units)));
      tr.appendChild(D.el("td", { "class": "ov-num" }, peso(it.sales) || "₱0"));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    card.appendChild(table);
    if (!items.length) card.appendChild(D.el("p", { "class": "ov-tp-none" }, "No sales yet this month."));
    return card;
  }

  function traffic(k) {
    var t = obj(k.traffic);
    var rows = [["Store visits", t.store_visits], ["Product views", t.product_views], ["Reached checkout", t.reached_checkout], ["Orders", t.orders]];
    var max = Math.max.apply(null, rows.map(function (r) { return cnt(r[1]); }));
    var card = D.el("section", { "class": "dash-card ov-money ov-tr", "aria-labelledby": "h-tr" });
    card.appendChild(D.el("h2", { id: "h-tr" }, "Traffic and conversion"));
    card.appendChild(D.el("p", { "class": "ov-sub" }, "From your public storefront this month"));
    var list = D.el("ul", { "class": "ov-tr-list" });
    rows.forEach(function (r) {
      var v = cnt(r[1]), li = D.el("li", {});
      li.appendChild(D.el("span", { "class": "ov-tr-lbl" }, r[0]));
      var track = D.el("span", { "class": "ov-tr-track", "aria-hidden": "true" }), fill = D.el("span", { "class": "ov-tr-fill" });
      fill.style.width = max > 0 && v / max >= 0.02 ? (v / max * 100) + "%" : "0%"; /* under 2% a bar is only a dot, so the number alone carries it */
      track.appendChild(fill); li.appendChild(track);
      li.appendChild(D.el("strong", {}, whole(v)));
      list.appendChild(li);
    });
    card.appendChild(list);
    var conv = D.el("div", { "class": "ov-tr-conv" });
    [["Visit to order", rate(t.orders, t.store_visits)], ["Checkout to order", rate(t.orders, t.reached_checkout)]].forEach(function (c) {
      var d = D.el("div", {});
      d.appendChild(D.el("span", {}, c[0]));
      d.appendChild(D.el("strong", {}, c[1]));
      conv.appendChild(d);
    });
    card.appendChild(conv);
    card.appendChild(D.el("p", { "class": "ov-tr-note" }, "Checkout means a visitor reached the Shipping Address step. Visits are counted once per visitor each day."));
    return card;
  }

  function render(body, data) {
    body.textContent = "";
    var k = obj(data.kpis), wrap = D.el("div", { "class": "ov-stack" });
    if (data.trial) wrap.appendChild(trialStrip(data.trial)); /* no trial data until the billing slice: no strip */
    wrap.appendChild(kpiTiles(k));
    wrap.appendChild(needsAction(k));
    var bottom = D.el("div", { "class": "ov-bottom" });
    bottom.appendChild(monitoring(k));
    bottom.appendChild(moneyToWatch(k));
    wrap.appendChild(bottom);
    var lower = D.el("div", { "class": "ov-bottom" });
    lower.appendChild(topProducts(k));
    lower.appendChild(traffic(k));
    wrap.appendChild(lower);
    body.appendChild(wrap);
  }

  /* Runs once per page load and on "Try again"; switching panels never refetches. Only GET /account/setup/ is
     read: the API has no /dashboard/ yet, so the Overview renders from an empty payload (no trial strip, no
     figures) through the same render() as before. The first load always shows today's skeleton (spec 6.1
     item 8, D13). A setup read that fails, or answers a state or shape this page does not know, or a removed first
     site whose follow-up sites read fails (checkRemoved, D1), never draws the normal Overview: it draws the setup load-error state with "Try again" (Phase 7 B1, ClickUp z8uq9machp). On a
     retry the clicked button is about to be removed, so focus moves to the Overview h1, which stays in place
     (audit F8). */
  function load(retry) {
    OB.reopen = false; /* Phase 3 N7: any load clears the return re-read; a redraw that still shows the strip sets it again */
    var body = $("ov-body");
    skeleton(body);
    if (retry) $("h-overview").focus();
    D.call("GET", "/account/setup/", null, true).then(function (st) {
      if (st.status === 401) return; /* call() is leaving for sign-in */
      lastSetup = st.ok ? obj(st.data) : null; /* Phase 3 S2: every handled setup answer, before routing */
      D.setWorkspace(siteName(lastSetup));
      lastDash = { ok: true, status: 200, data: {} };
      renderSubscription(null);
      renderReferral(true, null);
      var v = setupView(st);
      if (v === "error") return setupFailed(body); /* Phase 7 B1: an Account whose setup is unknown never sees the normal Overview */
      obRoute(v, st.data);
    });
  }
  /* The Overview's own setup load-error state, in the dashboard's error box. Leaving and returning to "/" reads again. */
  function setupFailed(body) {
    obHeader();
    body.textContent = "";
    var box = D.el("div", { "class": "err-box", role: "alert" });
    box.appendChild(D.el("h2", {}, "We couldn't load your setup"));
    var again = D.el("button", { type: "button", "class": "no-btn no-btn-ghost" }, "Try again");
    again.addEventListener("click", function () { load(true); });
    box.appendChild(again);
    body.appendChild(box);
    OB.reopen = true;
  }

  /* ---- Subscriber onboarding (Phase 2, ClickUp z8uq9mach7) ----------------------------------------------------
     GET /account/setup/ decides what the Overview shows. Resume is from server state only: OB.started ("Get started" tapped) and
     OB.completedName (the save that finished setup) live in memory and are lost on reload by design; nothing is
     stored in the browser. Santé is the only Site type (owner ruling 2026-11-04): the create body always carries
     template "sante" and there is no type control. API strings reach the page only through textContent, D.el or
     input.value. */
  var SUPPORT_EMAIL = "support@negosyoonline.com";
  var CHECK_DELAY_MS = 600; /* the live check waits for a pause in typing; well inside the 60 per 10 minutes throttle */
  var NAME_ERR = "Use 1 to 80 characters.";
  var BIZ_ERR = "Enter your business name.";
  var EMAIL_ERR = "Enter your email address.";
  var MOBILE_ERR = "Enter your mobile number.";
  var EMAIL_BAD = "Enter a valid email address."; /* CR-3: the server's own words (sites._clean_base); the server stays the authority */
  var MOBILE_BAD = "Enter a valid Philippine mobile number.";
  var CREATE_FB = "Check your connection and tap Create again. Nothing was lost.";
  var SAVE_FB = "Check your connection and try again. Nothing was lost.";
  var BLOCKED_VIEW = { first_site_removed: "b3" };
  var OB = { started: false, completedName: null, elig: null, busy: false, timer: null, seq: 0, lastChecked: "", lastResult: null, reopen: false };
  var account0 = {}, lastDash = null, lastSetup = null; /* lastSetup: the latest GET /account/setup/ answer of this page load (Phase 3 spec S1-S3); memory only, never stored */
  var optOpen = false; /* the setup card: collapsed on page load, kept across redraws of this page load; memory only, never stored */

  function setupView(res) {
    if (!res) return "error";
    if (res.status === 401) return "signout";
    if (!res.ok) return "error";
    var d = obj(res.data), fs = obj(d.first_site);
    if (d.state === "not_started") return "not_started";
    if (d.state === "in_progress") return d.minimum_completed_at ? "complete" : typeof fs.id === "string" && fs.id !== "" ? "step3" : "error"; /* CR-2 11.4: a finished Account that cleared one contact in Business Settings keeps the normal Overview */
    if (d.state === "minimum_complete") return "complete";
    if (d.state === "blocked" && has(BLOCKED_VIEW, d.blocked_reason)) return BLOCKED_VIEW[d.blocked_reason];
    return "error"; /* an unknown state, shape or blocked reason is a failed read, never the normal Overview (Phase 7 B1) */
  }
  /* The setup answer says whether a first site can be created (can_create_site); there is no launch gate or trial check. */
  function step2Slot(elig) { return obj(elig).can_create_site === true ? "step2" : "reread"; }
  function countOf(setup) { var f = obj(obj(setup).first_site); return 1 + (typeof f.id === "string" && f.id !== "" && !f.deleted ? 1 : 0); }
  function siteNameError(v) { var t = String(v == null ? "" : v).trim(); return t.length >= 1 && t.length <= 80 ? "" : NAME_ERR; }
  function createBody(name, address) {
    return { template: "sante", subdomain: String(address == null ? "" : address).trim().toLowerCase(), display_name: String(name == null ? "" : name).trim() };
  }
  function createOutcome(res) {
    var st = res ? res.status : 0, d = obj(res && res.data), f = obj(d.fields);
    if (st === 201) return { kind: "created", subdomain: typeof d.subdomain === "string" ? d.subdomain : "" };
    if ((st === 400 || st === 409) && typeof f.subdomain === "string") return { kind: "field", field: "subdomain", text: f.subdomain };
    if (st === 400 && typeof f.display_name === "string") return { kind: "field", field: "display_name", text: f.display_name };
    if (st === 409 && d.code === "site_limit_reached") return { kind: "already" };
    if (st === 409 && d.code === "first_site_removed") return { kind: "reread" };
    if (st === 404) return { kind: "gone" };
    if (st === 401) return { kind: "signout" };
    return { kind: "alert", text: st ? messageOf(res, CREATE_FB) : CREATE_FB };
  }
  function saveOutcome(res) {
    var st = res ? res.status : 0, d = obj(res && res.data), f = obj(d.fields);
    if (st === 200) return { kind: "saved" };
    if (st === 400 && Object.keys(f).length) return { kind: "fields", fields: f };
    if (st === 404) return { kind: "reread" };
    if (st === 401) return { kind: "signout" };
    return { kind: "alert", text: st ? messageOf(res, SAVE_FB) : SAVE_FB };
  }
  function prefill(detail, first) {
    var d = obj(detail), f = obj(first);
    var biz = typeof d.business_name === "string" ? d.business_name.trim() : "";
    if (!biz && typeof f.display_name === "string" && f.display_name.trim() && f.display_name !== f.subdomain) biz = f.display_name.trim();
    return { business_name: biz, contact_email: typeof d.contact_email === "string" ? d.contact_email : "",
      contact_mobile: typeof d.contact_mobile === "string" ? d.contact_mobile : "" };
  }
  function detailsErrors(v) {
    var e = {};
    if (!String(v.business_name || "").trim()) e.business_name = BIZ_ERR;
    var mail = String(v.contact_email || "").trim(), mob = String(v.contact_mobile || "").trim();
    if (!mail) e.contact_email = EMAIL_ERR;
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) e.contact_email = EMAIL_BAD; /* CR-3: a shape check only; both bad fields show together */
    if (!mob) e.contact_mobile = MOBILE_ERR;
    else if (!/^\+639\d{9}$/.test(mob)) e.contact_mobile = MOBILE_BAD; /* CR-3: the rule of normalize_ph_mobile. CR-2: email AND mobile; contact_mobile is phValue(), "" when no digits follow +63 */
    return e;
  }
  function liveStatus(res, value) {
    var d = obj(res && res.data);
    if (res && res.ok && d.status === "available") return { kind: "available", text: value + " is available" };
    if (res && res.ok && typeof d.message === "string" && d.message) return { kind: "error", text: d.message };
    if (res && res.status === 429 && messageOf(res, "")) return { kind: "meta", text: messageOf(res, "") };
    return { kind: "clear", text: "" };
  }
  function suffixOf(elig) { var s = obj(elig).site_host_suffix; return typeof s === "string" && s ? "." + s : ""; }

  /* ---- Overview handoff (Phase 3, ClickUp z8uq9mach8) ----------------------------------------------------------
     The eyebrow names the Site from first_site.display_name of the last setup answer; a blank, missing or removed
     Site leaves exactly "Overview". Text only (textContent), never a guessed name. */
  function siteName(setup) {
    var f = setup && typeof setup === "object" ? setup.first_site : null;
    if (!f || typeof f !== "object" || f.deleted === true || typeof f.display_name !== "string") return "";
    return f.display_name.trim();
  }
  /* One setup notice for a FINISHED Account whose setup answer lists missing data (Phase 3 N1-N5): the trial-strip
     markup with its own heading id. The server's missing list is shown as received, never re-derived. The popup is
     never reopened for a finished Account (CR-2). Every gap links to Business Settings, which edits the business
     name, the site name and the store contacts (Phase 5, ClickUp z8uq9machb). */
  var SETUP_LABELS = [["business_name", "business name"], ["site_name", "site name"], ["public_contact", "store email and mobile"]];
  function setupNote(setup) {
    var s = setup && typeof setup === "object" ? setup : null;
    if (!s || s.state !== "in_progress" || !s.minimum_completed_at || !Array.isArray(s.missing)) return null;
    var labels = SETUP_LABELS.filter(function (l) { return s.missing.indexOf(l[0]) >= 0; }).map(function (l) { return l[1]; });
    if (!labels.length) return null;
    var box = D.el("section", { "class": "ov-trial ov-setup", "aria-labelledby": "h-setup-note" });
    var ico = D.el("span", { "class": "ov-trial-ico", "aria-hidden": "true" }, "!");
    var txt = D.el("div", { "class": "ov-trial-txt" });
    txt.appendChild(D.el("h2", { id: "h-setup-note" }, "Setup needs attention"));
    txt.appendChild(D.el("p", {}, "Missing: " + labels.join(", ")));
    var link = D.el("a", { "class": "ov-trial-link", href: "/settings/business/" }, "Business Settings");
    link.appendChild(D.el("span", { "aria-hidden": "true" }, " ›"));
    box.appendChild(ico); box.appendChild(txt); box.appendChild(link);
    return box;
  }
  function headParts() {
    var v = $("view-overview");
    return { head: v.querySelector(".view-head"), eyebrow: v.querySelector(".dash-eyebrow"), sub: v.querySelector(".view-sub"), h1: $("h-overview") };
  }
  /* Restores today's Overview header (greeting, eyebrow, sub-line); the eyebrow carries the Site name when the last
     setup answer has one (Phase 3 E2-E4). Every onboarding heading, "Set up your business" and "N of 3 done" included,
     lives in the onboarding popup (CR-2, CR-5); the page header never changes otherwise. */
  function obHeader() {
    var p = headParts(), name = siteName(lastSetup);
    p.eyebrow.hidden = false; p.sub.hidden = false;
    p.eyebrow.textContent = name ? "Overview · " + name : "Overview";
    p.h1.textContent = greeting(account0);
  }
  function showToday(withCard) {
    obHeader();
    var body = $("ov-body");
    if (!lastDash || !lastDash.ok) { errorBox(body, lastDash); return; }
    render(body, lastDash.data || {});
    var wrap = body.firstChild, note = setupNote(lastSetup), strip = wrap.querySelector(".ov-trial");
    var rf = (lastDash.data || {}).referral; /* the server sends a referral only to a subscribed Account (services.referral_summary) */
    if (rf && typeof rf === "object") { /* a subscriber: the Free Trial banner goes, the card takes its slot (no card behind the popup) */
      if (withCard) wrap.insertBefore(optionalCard(), strip);
      wrap.removeChild(strip);
    } /* a trial or lapsed Account keeps its banner and gets no card; found before the notice is added */
    if (note) { wrap.insertBefore(note, wrap.firstChild); OB.reopen = true; } /* Phase 3 N2, N7: above the card and the trial strip; returning to "/" re-reads (route) */
    if (window.NOEarnings) window.NOEarnings.overviewNote(wrap); /* E8 S5: "Withdrawals are not open" strip, async */
  }
  function obSkeleton() {
    var body = dlgOpen();
    if (!body) return;
    dlgHead("plain");
    body.textContent = "";
    var sk = D.el("div", { "class": "skel ob-skel", "aria-busy": "true" });
    sk.appendChild(D.el("span", { "class": "sr-only", role: "status" }, "Loading your setup"));
    sk.appendChild(D.el("div", { "class": "skel-block skel-ob-head", "aria-hidden": "true" }));
    sk.appendChild(D.el("div", { "class": "skel-block skel-ob-bar", "aria-hidden": "true" }));
    var card = D.el("div", { "class": "skel-ob-card", "aria-hidden": "true" });
    for (var i = 0; i < 5; i++) card.appendChild(D.el("div", { "class": "skel-block skel-ob-line" }));
    sk.appendChild(card);
    body.appendChild(sk);
  }
  /* The setup load-error card inside the popup, for a failed follow-up read made after setup returned an onboarding
     state (spec r3 6.1 item 2), the sites read of checkRemoved() after a re-read included; the first load's failures
     are drawn on the Overview by setupFailed(). retry re-runs exactly that follow-up read; every retry function starts with obSkeleton(),
     so "Try again" shows the setup skeleton (D13). */
  function drawSetupError(retry) {
    var body = dlgOpen();
    if (!body) return;
    dlgHead("plain");
    body.textContent = "";
    var box = D.el("div", { "class": "err-box", role: "alert" });
    box.appendChild(D.el("h2", {}, "We couldn't load your setup"));
    box.appendChild(D.el("p", {}, "Check your connection and try again. Nothing you saved has been lost."));
    var again = D.el("button", { type: "button", "class": "no-btn no-btn-ghost" }, "Try again");
    again.addEventListener("click", function () { dlgHeading().focus(); retry(); }); /* focus returns to the dialog heading (spec 11.2 item 6) */
    box.appendChild(again);
    body.appendChild(box);
  }
  /* Every onboarding render goes through here; an unknown view fails toward the blocked card path. The first load
     never passes "error" here: load() draws setupFailed() instead. */
  function obRoute(view, data, why) {
    if (view === "today") return toToday(false);
    if (view === "complete") return toToday(true);
    if (view === "error") return drawSetupError(function () { reread(why || "retry"); });
    if (view === "b3") return checkRemoved(data, why);
    if (view === "not_started") return loadEligibility(false);
    if (view === "step3") return drawStep3Load(obj(data).first_site, why === "already" ? "already" : null, null);
    drawBlocked(view, countOf(data), !!why);
  }

  /* ---- Onboarding popup (CR-2, CR-5, Coach Ed 2026-11-04) ----------------------------------------------------
     Steps 1-3, the blocked cards B1-B5 and Completion render in one dialog over today's Overview that cannot be closed
     until setup is done: no close control, no Escape branch and no backdrop handler. While it is open every body child
     outside it is inert and aria-hidden, the page scroll is locked, Tab cycles inside (the billing.js openForm trap
     without its Escape branch) and focus that lands outside returns to the dialog's heading. It opens only on the
     Overview route. It closes only when onboarding routes to today's Overview or Completion's "Go to my dashboard",
     or when the route leaves "/" ("Go to Billing" included; returning re-runs load()). */
  var DLG = { open: false, saved: [] };
  function dlgOpen() {
    if (DLG.open) return $("ob-dlg-body");
    if (shownView !== "overview") { OB.reopen = true; return null; } /* a late answer after leaving "/" draws nothing */
    showToday(false); /* the page behind is today's Overview, or today's error box (spec 11.2 item 5) */
    DLG.saved = [];
    Array.prototype.forEach.call(document.body.children, function (c) {
      DLG.saved.push([c, c.hasAttribute("inert"), c.getAttribute("aria-hidden")]);
      c.setAttribute("inert", ""); c.setAttribute("aria-hidden", "true");
    });
    var root = D.el("div", { id: "ob-dlg-root", "class": "ob-overlay" });
    var dlg = D.el("div", { id: "ob-dlg", "class": "ob-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "ob-dlg-h" });
    var head = D.el("div", { "class": "ob-dlg-head" });
    head.appendChild(D.el("h1", { id: "ob-dlg-h", tabindex: "-1" }, "Set up your business"));
    /* OI520: the popup cannot be closed, so the head carries the dash's own sign-out (app.js signOut, no new storage). */
    var out = D.el("button", { type: "button", "class": "ob-signout" }, "Sign out");
    out.addEventListener("click", D.signOut);
    head.appendChild(out);
    dlg.appendChild(head);
    dlg.appendChild(D.el("div", { id: "ob-dlg-body", "class": "ob-dlg-body" }));
    root.appendChild(dlg);
    document.body.appendChild(root);
    document.body.classList.add("ob-lock");
    DLG.open = true;
    document.addEventListener("keydown", dlgKey);
    document.addEventListener("focusin", dlgFocusIn);
    $("ob-dlg-h").focus();
    return $("ob-dlg-body");
  }
  function dlgClose() { /* returns true when it closed an open popup */
    if (!DLG.open) return false;
    DLG.open = false;
    document.removeEventListener("keydown", dlgKey);
    document.removeEventListener("focusin", dlgFocusIn);
    var root = $("ob-dlg-root");
    if (root) root.remove();
    DLG.saved.forEach(function (s) {
      if (!s[1]) s[0].removeAttribute("inert");
      if (s[2] === null) s[0].removeAttribute("aria-hidden"); else s[0].setAttribute("aria-hidden", s[2]);
    });
    DLG.saved = [];
    document.body.classList.remove("ob-lock");
    return true;
  }
  function dlgHeading() { var d = $("ob-dlg"); return (d && $(d.getAttribute("aria-labelledby"))) || $("ob-dlg-h"); }
  /* mode: "welcome" (Step 1), "step" (Steps 2-3, with "N of 3 done"), "plain" (setup skeleton and load-error card),
     "done" (Completion: the card's own h1#h-done labels the dialog and the head is hidden). */
  function dlgHead(mode, n) {
    var h = $("ob-dlg-h"), box = h.parentNode, count = $("ob-dlg-count");
    box.hidden = mode === "done";
    $("ob-dlg").setAttribute("aria-labelledby", mode === "done" ? "h-done" : "ob-dlg-h");
    if (mode === "done") return;
    var first = (account0.first_name || "").trim();
    h.textContent = mode === "welcome" ? (first ? "Welcome, " + first + "!" : "Welcome!") : "Set up your business";
    if (mode !== "step") { if (count) count.remove(); return; }
    if (!count) { count = D.el("p", { id: "ob-dlg-count", "class": "ob-count" }); box.appendChild(count); }
    count.textContent = n + " of 3 done";
  }
  function dlgFocusables() {
    var d = $("ob-dlg");
    /* A control inside a hidden ancestor is not a Tab stop: Completion hides the head, and its Sign out must not trap Tab. */
    function shown(n) { for (; n && n !== d; n = n.parentNode) if (n.hidden) return false; return true; }
    return d ? Array.prototype.filter.call(d.querySelectorAll("a[href], button, input, select, textarea"), function (n) {
      return !n.disabled && shown(n) && n.getAttribute("tabindex") !== "-1";
    }) : [];
  }
  function dlgKey(e) {
    if (e.key !== "Tab") return; /* Escape and every other key do nothing here (CR-2: not closable) */
    var items = dlgFocusables(), now = document.activeElement;
    if (!items.length) { e.preventDefault(); dlgHeading().focus(); return; }
    var first = items[0], last = items[items.length - 1], inside = items.indexOf(now) >= 0;
    if (e.shiftKey && (now === first || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (now === last || !inside)) { e.preventDefault(); first.focus(); }
  }
  function dlgFocusIn(e) {
    var t = e.target;
    if (!DLG.open || (t && t.closest && t.closest("#ob-dlg-root"))) return;
    dlgHeading().focus();
  }
  function toToday(withCard) { /* today's Overview in the main region; from the popup, focus moves to the Overview h1 */
    var was = dlgClose();
    showToday(withCard);
    if (was) $("h-overview").focus();
  }

  var STEP_LABELS = [["Confirm your email", "Email confirmed"], ["Create your site", "Create your site"], ["Add business details", "Business details"]];
  function progressBar(n) {
    var bar = D.el("div", { "class": "ob-bar", role: "progressbar", "aria-label": "Required setup", "aria-valuemin": "0", "aria-valuemax": "3", "aria-valuenow": String(n) });
    bar.appendChild(D.el("span", { "class": "ob-bar-fill ob-fill-" + n, "aria-hidden": "true" }));
    return bar;
  }
  function tracker(n) { /* desktop only (dash.css shows it at 900px and up); n = steps done, the next one is current */
    var ol = D.el("ol", { "class": "ob-tracker" });
    STEP_LABELS.forEach(function (s, i) {
      var li = D.el("li", { "class": i < n ? "ob-tr-done" : i === n ? "ob-tr-now" : "ob-tr-next" });
      if (i === n) li.setAttribute("aria-current", "step");
      li.appendChild(D.el("span", { "class": "ob-tr-mark", "aria-hidden": "true" }, i < n ? "✓" : String(i + 1)));
      li.appendChild(D.el("span", {}, s[1]));
      ol.appendChild(li);
    });
    return ol;
  }
  function obStack(host, n, withBar) {
    host.textContent = "";
    var s = D.el("div", { "class": "ob-stack" });
    if (withBar) { s.appendChild(progressBar(n)); s.appendChild(tracker(n)); }
    host.appendChild(s);
    return s;
  }
  var CARDS = {
    b1: ["Site setup opens soon", "Your email is confirmed and your account is ready. Creating your site isn't open yet. We'll keep your place, so check back here soon.", ""],
    b2: ["We can't set up your site yet", "Something on our side needs fixing before you can continue. Our support team can sort it out.", "support"],
    b3: ["Your site was removed", "Please contact support to continue setting up your business.", "support"],
    b4: ["Your site is limited to Billing right now", "Open Billing to see what's needed. You can finish setup after that.", "billing"],
    b5: ["Your trial or plan isn't active", "Creating your Santé site needs an active 14-day free trial or subscription. Open Billing to see your plan.", "billing"]
  };
  /* B1-B5 inside the onboarding popup (CR-5, spec 12.2): the "Set up your business" head with "N of 3 done", the bar
     and the tracker, then the card. Opening straight onto a card focuses the dialog heading (dlgOpen); replacing
     content already in the popup focuses the card heading when the caller asks, else the dialog heading. After the
     route has left "/" nothing is drawn and the popup reopens on return (dlgOpen sets OB.reopen). */
  function drawBlocked(kind, n, focus) {
    var was = DLG.open, host = dlgOpen();
    if (!host) return;
    dlgHead("step", n);
    var s = obStack(host, n, true), c = CARDS[kind];
    var card = D.el("section", { "class": "dash-card ob-card ob-blocked", "aria-labelledby": "ob-h-blocked" });
    card.appendChild(D.el("h2", { id: "ob-h-blocked", tabindex: "-1" }, c[0]));
    card.appendChild(D.el("p", { "class": "ob-copy" }, c[1]));
    if (c[2] === "billing") card.appendChild(D.el("a", { "class": "no-btn no-btn-primary", href: "/settings/billing/" }, "Go to Billing"));
    if (c[2] === "support") {
      card.appendChild(D.el("a", { "class": "no-btn no-btn-ghost", href: "mailto:" + SUPPORT_EMAIL }, "Contact support"));
      card.appendChild(D.el("p", { "class": "ob-help" }, SUPPORT_EMAIL));
    }
    s.appendChild(card);
    if (was) $(focus ? "ob-h-blocked" : "ob-dlg-h").focus();
  }
  /* No request: the setup answer already in hand carries can_create_site and site_host_suffix. */
  function loadEligibility(focus) {
    OB.elig = obj(lastSetup);
    if (!OB.started) return drawStep1();
    drawSlot(false, focus);
  }
  function drawSlot(afterReread, focus) {
    var slot = step2Slot(OB.elig);
    if (slot === "step2") return drawStep2(focus);
    if (slot === "reread") return afterReread ? drawBlocked("b2", 1, focus) : reread("can_create");
    drawBlocked(slot, 1, focus);
  }
  /* why: "can_create" (the setup answer said no), "already" (409 site_limit_reached), "reread" (409 first_site_removed),
     "gone" (404 on a write), "save" (after a save that was refused or did not complete). */
  function reread(why) {
    obSkeleton();
    D.call("GET", "/account/setup/", null, true).then(function (st) {
      if (st.status === 401) return;
      lastSetup = st.ok ? obj(st.data) : null;
      D.setWorkspace(siteName(lastSetup));
      var v = setupView(st);
      if (v === "not_started" && why === "can_create") return drawBlocked("b2", 1, true);
      if (v === "not_started") return loadEligibility(true);
      obRoute(v, st.data, why);
    });
  }
  /* Spec r3 6.1 item 6, D14: first_site_removed shows B3 only when the Account owns no live Site. GET /sites/ lists
     live Sites only (access.sites_of, access.py:11-12); a non-empty list (an operator test owner whose earliest test
     Site was soft-deleted) keeps today's Overview. A sites read that fails never draws the normal Overview (D1, Coach
     Ed 2026-11-11, ClickUp z8uq9machp; this replaces the "failed read keeps today's Overview" part of D14): on the
     first load it draws the Overview's setup load-error state, whose "Try again" runs load() again; after a re-read
     made inside the popup (why is set) it draws the popup's own load-error card, whose "Try again" runs that re-read
     again. No setup skeleton here: on the first load today's skeleton is still showing, and an answer that renders
     today's Overview must never show the setup skeleton. */
  function checkRemoved(data, why) {
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (res.status === 401) return;
      if (!res.ok) return why ? drawSetupError(function () { reread(why); }) : setupFailed($("ov-body"));
      if (D.sitesOf(res).length === 0) return drawBlocked("b3", countOf(data), !!why);
      toToday(false);
    });
  }

  function progressCard(n) { /* Step 1 (design 5.1, Main board) */
    var card = D.el("section", { "class": "dash-card ob-progress", "aria-label": "Setup progress" });
    var row = D.el("div", { "class": "ob-prog-row" });
    row.appendChild(D.el("span", { "class": "ob-prog-label" }, "Required setup"));
    row.appendChild(D.el("span", { "class": "ob-prog-count" }, n + " of 3 done"));
    card.appendChild(row);
    card.appendChild(progressBar(n));
    var ol = D.el("ol", { "class": "ob-steps" });
    STEP_LABELS.forEach(function (s, i) {
      var li = D.el("li", { "class": i < n ? "ob-step-done" : "ob-step-todo" });
      li.appendChild(D.el("span", { "class": "ob-dot", "aria-hidden": "true" }, i < n ? "✓" : ""));
      li.appendChild(D.el("span", {}, s[0]));
      ol.appendChild(li);
    });
    card.appendChild(ol);
    return card;
  }
  /* Contact inputs (CR-1, Coach Ed): every phone and email box in the dash looks and behaves the same. A mobile box is a fixed
     "+63" cell plus the local part: digits only, at most ten, shown 9XX XXX XXXX as the owner types or pastes, and a pasted
     +63 / 63 prefix or leading 0 is dropped (the same box as the Santé pack delivery address, re-written here because the dash
     is static). An email box is an envelope cell plus the input. The cell is decoration (aria-hidden); the label and a hidden
     hint carry the +63 context. The server reads the number with normalize_ph_mobile, so a mobile goes out as "+63" + ten
     digits, or an empty string. Business.js reuses this through window.NOContact. */
  function phDigits(raw) {
    var d = String(raw || "").replace(/\D/g, "");
    if (d.slice(0, 3) === "639") d = d.slice(2);
    else if (d.charAt(0) === "0") d = d.slice(1);
    return d.slice(0, 10);
  }
  function phFormat(raw) {
    var d = phDigits(raw);
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(" ");
  }
  function phValue(shown) { var d = phDigits(shown); return d ? "+63" + d : ""; }
  function bindPhone(input) {
    input.addEventListener("input", function () {
      var caret = input.selectionStart == null ? input.value.length : input.selectionStart;
      var before = phDigits(input.value.slice(0, caret)).length, formatted = phFormat(input.value);
      if (formatted === input.value) return;
      input.value = formatted;
      var pos = 0, seen = 0;
      while (pos < formatted.length && seen < before) { if (/\d/.test(formatted.charAt(pos))) seen++; pos++; }
      if (document.activeElement === input && typeof input.setSelectionRange === "function") input.setSelectionRange(pos, pos);
    });
  }
  function envelopeIcon() {
    var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"), a, b;
    [["viewBox", "0 0 24 24"], ["width", "20"], ["height", "20"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "1.8"],
      ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"], ["focusable", "false"]].forEach(function (p) { svg.setAttribute(p[0], p[1]); });
    a = document.createElementNS(NS, "rect");
    [["x", "3"], ["y", "5"], ["width", "18"], ["height", "14"], ["rx", "2"]].forEach(function (p) { a.setAttribute(p[0], p[1]); });
    b = document.createElementNS(NS, "path"); b.setAttribute("d", "M3 7l9 6 9-6");
    svg.appendChild(a); svg.appendChild(b);
    return svg;
  }
  /* Wraps `input` (already carrying its id, name and value) in the shared group. Returns {group, hint}; hint is the hidden
     description of a mobile box (null for an email box). */
  function contactGroup(kind, input, id) {
    var group = D.el("div", { "class": "ct-group", id: id + "-group" }), cell, hint = null;
    if (kind === "phone") {
      cell = D.el("span", { "class": "ct-pre", "aria-hidden": "true" }, "+63");
      input.setAttribute("type", "tel"); input.setAttribute("inputmode", "numeric");
      input.setAttribute("placeholder", "9XX XXX XXXX"); input.setAttribute("autocomplete", "tel-national");
      input.value = phFormat(input.value);
      bindPhone(input);
      hint = D.el("span", { "class": "sr-only", id: id + "-hint" }, "Philippine mobile number. The +63 country code is already added. Enter ten digits starting with 9.");
    } else {
      cell = D.el("span", { "class": "ct-pre ct-pre-ico", "aria-hidden": "true" });
      cell.appendChild(envelopeIcon());
      input.setAttribute("type", "email");
    }
    group.appendChild(cell); group.appendChild(input);
    return { group: group, hint: hint };
  }
  window.NOContact = { group: contactGroup, phoneValue: phValue, phoneShown: phFormat };

  function obField(name, label, opts) {
    opts = opts || {};
    var id = "ob-" + name, w = D.el("div", { "class": "ob-field" });
    w.appendChild(D.el("label", { "class": "ob-label", "for": id }, label));
    var input = D.el("input", { "class": "ob-input", id: id, name: name, type: opts.type || "text", autocomplete: opts.autocomplete || "off" });
    if (opts.inputmode) input.setAttribute("inputmode", opts.inputmode);
    input.value = opts.value || "";
    if (opts.required) { input.setAttribute("required", ""); input.setAttribute("aria-required", "true"); }
    var group = null, hint = null;
    if (opts.kind) {
      var cg = contactGroup(opts.kind, input, id);
      group = cg.group; hint = cg.hint;
      w.appendChild(group);
      if (hint) w.appendChild(hint);
    } else if (opts.suffix !== undefined) {
      group = D.el("div", { "class": "ob-addr", id: id + "-group" });
      group.appendChild(input);
      if (opts.suffix) group.appendChild(D.el("span", { "class": "ob-suffix" }, opts.suffix));
      w.appendChild(group);
    } else w.appendChild(input);
    var msg = D.el("p", { "class": opts.status ? "ob-status" : "ob-err", id: id + "-msg" });
    if (opts.status) msg.setAttribute("role", "status"); else msg.hidden = true;
    var help = opts.help ? D.el("p", { "class": "ob-help", id: id + "-help" }, opts.help) : null;
    if (opts.status) { w.appendChild(msg); if (help) w.appendChild(help); } else { if (help) w.appendChild(help); w.appendChild(msg); }
    input.setAttribute("aria-describedby", (help ? help.id + " " : "") + (hint ? hint.id + " " : "") + msg.id);
    return { wrap: w, input: input, msg: msg, group: group, contact: !!opts.kind };
  }
  function setFieldError(f, text) {
    f.msg.textContent = text || "";
    f.msg.hidden = !text;
    if (f.contact) { if (text) f.group.classList.add("ct-group-err"); else f.group.classList.remove("ct-group-err"); }
    if (text) { f.input.setAttribute("aria-invalid", "true"); f.input.classList.add("ob-invalid"); }
    else { f.input.removeAttribute("aria-invalid"); f.input.classList.remove("ob-invalid"); }
  }
  function setAddress(f, st) {
    f.group.classList.remove("ob-addr-ok"); f.group.classList.remove("ob-addr-err");
    f.msg.className = "ob-status"; f.msg.textContent = ""; f.input.removeAttribute("aria-invalid");
    if (st.kind === "available") {
      f.group.classList.add("ob-addr-ok"); f.msg.classList.add("ob-ok");
      f.msg.appendChild(D.el("span", { "class": "ob-ico", "aria-hidden": "true" }, "✓"));
    } else if (st.kind === "error") {
      f.group.classList.add("ob-addr-err"); f.msg.classList.add("ob-bad"); f.input.setAttribute("aria-invalid", "true");
    }
    if (st.text) f.msg.appendChild(D.el("span", {}, st.text));
  }
  function alertBox(title, text) {
    var box = D.el("div", { "class": "ob-alert", role: "alert" });
    box.appendChild(D.el("strong", {}, title));
    box.appendChild(D.el("p", {}, text));
    return box;
  }
  function infoBox(title, text) {
    var box = D.el("div", { "class": "ob-info", role: "status" });
    box.appendChild(D.el("strong", {}, title));
    box.appendChild(D.el("p", {}, text));
    return box;
  }
  function drawStep1() {
    var host = dlgOpen();
    if (!host) return;
    dlgHead("welcome");
    var s = obStack(host, 1, false);
    s.appendChild(D.el("p", { "class": "ob-intro" }, "Let's set up your business in 3 quick steps. We save as you go, so you can stop anytime and pick up where you left off, even on another phone or computer."));
    s.appendChild(progressCard(1));
    var go = D.el("button", { type: "button", "class": "no-btn no-btn-primary no-btn-block ob-primary" }, "Get started"); /* OI520 ruling: the CTA sits right under the checklist */
    go.addEventListener("click", function () { OB.started = true; drawSlot(false, true); });
    s.appendChild(go);
    /* OI520 ruling: the confirmed-email line is a notice, not a step card, so it reads as information only. */
    var note = D.el("div", { "class": "ob-notice", role: "status" });
    note.appendChild(D.el("span", { "class": "ob-notice-ico", "aria-hidden": "true" }, "✓"));
    var nb = D.el("div", { "class": "ob-notice-body" });
    nb.appendChild(D.el("strong", {}, "Your email is confirmed"));
    var row = D.el("p", { "class": "ob-notice-mail" });
    row.appendChild(D.el("span", { "class": "ob-mail-addr" }, account0.email || ""));
    row.appendChild(chip("ok", "Verified"));
    nb.appendChild(row);
    nb.appendChild(D.el("p", { "class": "ob-notice-copy" }, "We use this email for your account and sign-in."));
    note.appendChild(nb);
    s.appendChild(note);
  }
  function drawStep2(focus) {
    var host = dlgOpen();
    if (!host) return;
    dlgHead("step", 1);
    var s = obStack(host, 1, true), e = obj(OB.elig);
    var form = D.el("form", { "class": "dash-card ob-card", "aria-labelledby": "ob-h-site", novalidate: "" });
    form.appendChild(D.el("p", { "class": "ob-eyebrow" }, "Step 2 of 3"));
    form.appendChild(D.el("h2", { id: "ob-h-site", tabindex: "-1" }, "Create your site"));
    if (e.first_site_entitlement === "trial") form.appendChild(D.el("p", { "class": "ob-banner" }, "Your Santé site is part of your 14-day free trial. Set it up and test it before you launch."));
    var name = obField("display_name", "Site name", { help: "Shown at the top of your site. You can change it later." });
    var addr = obField("subdomain", "Web address", { suffix: suffixOf(e), status: true,
      help: "3 to 30 lowercase letters, digits or single hyphens. This can't be changed later." });
    addr.input.setAttribute("autocapitalize", "none");
    addr.input.setAttribute("spellcheck", "false");
    form.appendChild(name.wrap);
    form.appendChild(addr.wrap);
    var type = D.el("div", { "class": "ob-field" });
    type.appendChild(D.el("span", { "class": "ob-label" }, "Site type"));
    var box = D.el("div", { "class": "ob-type" });
    box.appendChild(D.el("strong", {}, "Santé"));
    box.appendChild(D.el("span", {}, "Includes member sign-up and the Membership Pack."));
    type.appendChild(box);
    type.appendChild(D.el("p", { "class": "ob-help" }, "You can't change the site type after you create the site."));
    form.appendChild(type);
    var alertSlot = D.el("div", { "class": "ob-alert-slot" });
    form.appendChild(alertSlot);
    var btn = D.el("button", { type: "submit", "class": "no-btn no-btn-primary no-btn-block ob-primary" }, "Create my site");
    form.appendChild(btn);
    form.appendChild(D.el("p", { "class": "ob-note" }, "Your site is saved as soon as you tap Create."));
    s.appendChild(form);
    var later = D.el("div", { "class": "ob-later" });
    later.appendChild(D.el("h2", { "class": "ob-later-h" }, "Optional, any time"));
    later.appendChild(D.el("p", {}, "Socials and Billing open up after you create your site. Products and your own domain are coming soon."));
    s.appendChild(later);
    OB.lastChecked = ""; OB.lastResult = null;
    wireLiveCheck(addr);
    form.addEventListener("submit", function (ev) { ev.preventDefault(); onCreate(name, addr, btn, alertSlot); });
    if (focus) $("ob-h-site").focus();
  }
  function wireLiveCheck(addr) {
    addr.input.addEventListener("input", function () {
      if (OB.timer) { clearTimeout(OB.timer); OB.timer = null; }
      var value = addr.input.value.trim().toLowerCase();
      if (value && value === OB.lastChecked && OB.lastResult) { setAddress(addr, OB.lastResult); return; }
      setAddress(addr, { kind: "clear", text: "" });
      if (!value || value === OB.lastChecked) return;
      OB.timer = setTimeout(function () { OB.timer = null; runCheck(addr, value); }, CHECK_DELAY_MS);
    });
  }
  function runCheck(addr, value) {
    var mine = ++OB.seq;
    OB.lastChecked = value; OB.lastResult = null;
    setAddress(addr, { kind: "checking", text: "Checking…" });
    D.call("POST", "/sites/subdomain-check/", { subdomain: value }, true).then(function (res) {
      if (mine !== OB.seq || res.status === 401) return; /* a newer check or a sign-out wins */
      OB.lastResult = liveStatus(res, value);
      if (addr.input.value.trim().toLowerCase() === value) setAddress(addr, OB.lastResult);
    });
  }
  function onCreate(name, addr, btn, alertSlot) {
    if (OB.busy) return;
    alertSlot.textContent = "";
    setFieldError(name, "");
    var nameErr = siteNameError(name.input.value);
    if (nameErr) { setFieldError(name, nameErr); name.input.focus(); return; }
    if (OB.timer) { clearTimeout(OB.timer); OB.timer = null; }
    OB.seq++;  /* no live check fires or lands after Create (audit r3 PLAN-10) */
    OB.busy = true; btn.disabled = true; btn.textContent = "Creating your site…";
    D.call("POST", "/sites/", createBody(name.input.value, addr.input.value), true).then(function (res) {
      OB.busy = false; btn.disabled = false; btn.textContent = "Create my site";
      var o = createOutcome(res), d = obj(res.data);
      if (o.kind === "signout") return;
      if (o.kind === "created" && typeof d.id === "string" && d.id !== "") return drawStep3Load({ id: d.id, subdomain: o.subdomain, display_name: d.display_name }, "created", o.subdomain);
      if (o.kind === "created") return reread("save");
      if (o.kind === "field" && o.field === "subdomain") { OB.seq++; OB.lastChecked = ""; OB.lastResult = null; setAddress(addr, { kind: "error", text: o.text }); addr.input.focus(); return; }
      if (o.kind === "field") { setFieldError(name, o.text); name.input.focus(); return; }
      if (o.kind === "already") return reread("already");
      if (o.kind === "reread" || o.kind === "gone") return reread(o.kind);
      alertSlot.appendChild(alertBox("We couldn't create your site", o.text));
    });
  }

  function statusStrip(cls, text) {
    var p = D.el("p", { "class": cls, role: "status" });
    p.appendChild(D.el("span", { "class": "ob-ico", "aria-hidden": "true" }, "✓"));
    p.appendChild(D.el("span", {}, text));
    return p;
  }
  function drawStep3Load(first, arrival, createdSub) {
    obSkeleton();
    D.call("GET", "/sites/" + first.id + "/", null, true).then(function (res) {
      if (res.status === 401) return;
      if (!res.ok) return drawSetupError(function () { drawStep3Load(first, arrival, createdSub); });
      drawStep3(first, res.data, arrival, createdSub);
    });
  }
  function drawStep3(first, detail, arrival, createdSub) {
    var host = dlgOpen();
    if (!host) return;
    dlgHead("step", 2);
    var s = obStack(host, 2, true), v = prefill(detail, first);
    if (arrival === "created") s.appendChild(statusStrip("ob-success", "Your site " + createdSub + " is created and saved."));
    if (arrival === "already") s.appendChild(infoBox("Your site is already created", "It was made in another tab or device. We've moved you to the next step."));
    var form = D.el("form", { "class": "dash-card ob-card", "aria-labelledby": "ob-h-biz", novalidate: "" });
    form.appendChild(D.el("p", { "class": "ob-eyebrow" }, "Step 3 of 3"));
    form.appendChild(D.el("h2", { id: "ob-h-biz", tabindex: "-1" }, "Add business details"));
    form.appendChild(D.el("p", { "class": "ob-copy" }, "This is what customers see on your site."));
    var f = {};
    f.biz = obField("business_name", "Business name", { value: v.business_name, help: "The name customers know you by.", autocomplete: "organization" });
    form.appendChild(f.biz.wrap);
    var fs = D.el("fieldset", { "class": "ob-fieldset" });
    fs.appendChild(D.el("legend", {}, "How customers can reach you"));
    f.email = obField("contact_email", "Email", { kind: "email", value: v.contact_email, autocomplete: "email", required: true });
    f.mobile = obField("contact_mobile", "Mobile number", { kind: "phone", value: v.contact_mobile, required: true });
    fs.appendChild(f.email.wrap);
    fs.appendChild(f.mobile.wrap);
    form.appendChild(fs);
    var alertSlot = D.el("div", { "class": "ob-alert-slot" });
    form.appendChild(alertSlot);
    var btn = D.el("button", { type: "submit", "class": "no-btn no-btn-primary no-btn-block ob-primary" }, "Save and finish");
    form.appendChild(btn);
    form.appendChild(D.el("p", { "class": "ob-note" }, "You can change your email and mobile number later in Settings › Business Settings."));
    s.appendChild(form);
    if (arrival === "notdone") alertSlot.appendChild(alertBox("We couldn't save your details", "Check your details and tap Save and finish again."));
    form.addEventListener("submit", function (ev) { ev.preventDefault(); onSave(first, f, btn, alertSlot); });
    if (arrival) $("ob-h-biz").focus();
  }
  function onSave(first, f, btn, alertSlot) {
    if (OB.busy) return;
    alertSlot.textContent = "";
    [f.biz, f.email, f.mobile].forEach(function (x) { setFieldError(x, ""); });
    var values = { business_name: f.biz.input.value.trim(), contact_email: f.email.input.value.trim(), contact_mobile: phValue(f.mobile.input.value) };
    var errs = detailsErrors(values);
    var bad = null;
    [["business_name", f.biz], ["contact_email", f.email], ["contact_mobile", f.mobile]].forEach(function (o) {
      if (errs[o[0]]) { setFieldError(o[1], errs[o[0]]); if (!bad) bad = o[1]; }
    });
    if (bad) { bad.input.focus(); return; } /* first invalid field, order Business name, Email, Mobile number (spec 11.5) */
    OB.busy = true; btn.disabled = true; btn.textContent = "Saving…";
    /* Two calls: the contacts live on the site, the business name on its business profile. The first failure
       is shown as before; saving again repeats both, which is harmless. */
    var contacts = { contact_email: values.contact_email, contact_mobile: values.contact_mobile };
    D.call("PATCH", "/sites/" + first.id + "/", contacts, true).then(function (a) {
      if (!a.ok) return a;
      return D.call("PATCH", "/sites/" + first.id + "/business-profile/", { business_name: values.business_name }, true);
    }).then(function (res) {
      OB.busy = false; btn.disabled = false; btn.textContent = "Save and finish";
      var o = saveOutcome(res);
      if (o.kind === "signout") return;
      if (o.kind === "fields") return showSaveFields(f, o.fields, alertSlot);
      if (o.kind === "reread") return reread("save");
      if (o.kind === "alert") { alertSlot.appendChild(alertBox("We couldn't save your details", o.text)); return; }
      afterSave(first);
    });
  }
  function showSaveFields(f, fields, alertSlot) {
    var map = { business_name: f.biz, contact_email: f.email, contact_mobile: f.mobile }, first = null, other = false;
    Object.keys(fields).forEach(function (k) { if (has(map, k)) setFieldError(map[k], String(fields[k])); else other = true; });
    ["business_name", "contact_email", "contact_mobile"].forEach(function (k) { if (!first && has(fields, k)) first = map[k]; });
    if (other || !first) alertSlot.appendChild(alertBox("We couldn't save your details", SAVE_FB));
    if (first) first.input.focus();
  }
  /* Spec 6.3: after a 200 the setup is re-read (with the setup skeleton, spec 6.1 item 8). Still in_progress redraws
     Step 3 from the saved server values with the alert box. */
  function afterSave(first) {
    obSkeleton();
    D.call("GET", "/account/setup/", null, true).then(function (st) {
      if (st.status === 401) return;
      lastSetup = st.ok ? obj(st.data) : null;
      D.setWorkspace(siteName(lastSetup));
      var v = setupView(st), fsx = obj(obj(st.data).first_site);
      if (v === "complete") { OB.completedName = fsx.display_name || first.display_name || "Your site"; return drawCompletion(); }
      if (v === "step3") return drawStep3Load(first, "notdone", null);
      obRoute(v, st.data, "save");
    });
  }
  function drawCompletion() {
    var host = dlgOpen();
    if (!host) return;
    dlgHead("done");
    var s = obStack(host, 3, false);
    var card = D.el("section", { "class": "dash-card ob-card ob-done", "aria-labelledby": "h-done" });
    card.appendChild(D.el("span", { "class": "ob-done-ico", "aria-hidden": "true" }, "✓"));
    card.appendChild(D.el("h1", { id: "h-done", tabindex: "-1" }, "You're all set up!"));
    card.appendChild(D.el("p", { "class": "ob-copy" }, OB.completedName + " has its site, and customers know how to reach you."));
    card.appendChild(progressBar(3));
    card.appendChild(D.el("p", { "class": "ob-help" }, "Required setup: 3 of 3 done"));
    var go = D.el("button", { type: "button", "class": "no-btn no-btn-primary ob-primary" }, "Go to my dashboard");
    go.addEventListener("click", function () { dlgClose(); OB.completedName = null; showToday(true); $("h-overview").focus(); });
    card.appendChild(go);
    s.appendChild(card);
    $("h-done").focus();
  }
  var OPTIONAL = [
    ["Add your socials", "Links to your social media pages", "/settings/business/"],
    ["See your Santé products", "The Santé catalog your site sells", ""],
    ["Set up Billing", "Your plan and payment method", "/settings/billing/"],
    ["Your own domain", "Use a .com address for your site", ""],
    ["Launch checklist", "See what's left before you go live", ""]
  ];
  function optionalCard() { /* never counted, no dismiss (design 5.9); a row without a live page is not a link (spec C9) */
    var card = D.el("section", { "class": "dash-card ob-card ob-optional ob-notify", "aria-labelledby": "ob-h-ready" });
    var head = D.el("div", { "class": "ob-opt-head" });
    var h2 = D.el("h2", { id: "ob-h-ready" });
    var toggle = D.el("button", { type: "button", "class": "ob-opt-toggle", "aria-expanded": optOpen ? "true" : "false", "aria-controls": "ob-opt-rows" }, "Complete these steps to finish setting up your account");
    var chev = D.el("span", { "class": optOpen ? "ob-chev ob-chev-open" : "ob-chev", "aria-hidden": "true" }, "›");
    toggle.insertBefore(D.el("span", { "class": "ov-trial-ico", "aria-hidden": "true" }, "i"), toggle.firstChild); /* the banner's info icon; the whole head is the button */
    toggle.appendChild(chev);
    h2.appendChild(toggle);
    head.appendChild(h2);
    card.appendChild(head);
    var ul = D.el("ul", { "class": "ob-rows", id: "ob-opt-rows" });
    ul.hidden = !optOpen;
    toggle.addEventListener("click", function () { /* a collapse is memory only: no request, no storage; the next redraw reads optOpen */
      optOpen = !optOpen;
      toggle.setAttribute("aria-expanded", optOpen ? "true" : "false");
      chev.setAttribute("class", optOpen ? "ob-chev ob-chev-open" : "ob-chev");
      ul.hidden = !optOpen;
    });
    OPTIONAL.forEach(function (o) {
      var li = D.el("li", {});
      var row = D.el(o[2] ? "a" : "div", o[2] ? { "class": "ob-row", href: o[2] } : { "class": "ob-row ob-row-off" });
      row.appendChild(D.el("span", { "class": "ob-row-tile", "aria-hidden": "true" }));
      var t = D.el("span", { "class": "ob-row-txt" });
      t.appendChild(D.el("strong", {}, o[0]));
      t.appendChild(D.el("span", {}, o[1]));
      row.appendChild(t);
      row.appendChild(o[2] ? D.el("span", { "class": "ob-chev", "aria-hidden": "true" }, "›") : chip("neutral", "Coming soon"));
      li.appendChild(row);
      ul.appendChild(li);
    });
    card.appendChild(ul);
    return card;
  }

  window.NOOnboarding = { util: { setupView: setupView, step2Slot: step2Slot, countOf: countOf, siteNameError: siteNameError,
    createBody: createBody, createOutcome: createOutcome, saveOutcome: saveOutcome, prefill: prefill,
    detailsErrors: detailsErrors, liveStatus: liveStatus, suffixOf: suffixOf } };

  D.requireAccount("dashboard").then(function (account) {
    account0 = account || {};
    $("h-overview").textContent = greeting(account0);
    renderAccountPanel(account);
    renderSubscription(null);
    renderReferral(false);
    /* The page modules (billing.js, business.js and the rest) are blocking script tags after this file, and route()
       opens a module only if its global is already there. When /me/ answers before those files have run, the first
       route and the first load wait for DOMContentLoaded, by which time every one of them has run; otherwise the
       page would keep its heading over an empty body (ClickUp z8uq9me2uu). The two navigation listeners wait with
       them: a route() from a click before the first route would record the view as shown with its module missing. */
    var start = function () {
      route(true);
      window.addEventListener("popstate", function () { route(false); });
      document.addEventListener("click", onLinkClick);
      load();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  });
})();
