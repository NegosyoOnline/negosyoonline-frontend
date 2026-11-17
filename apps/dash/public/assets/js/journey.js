/* Prospect List (ClickUp z8uq9meyqk and z8uq9mfw14; the address is /prospect-list/; /journey/ moves here (MOVED in dashboard.js)): the Santé owner's list of the
   people who visited the Membership Pack page, ordered, or messaged the site, newest activity first. Reads GET /sites/{id}/pack/journey/prospects/
   ?stage=&q=&page= (apps/pack/api_journey.py): this site only (layout adapted from TWCinc partnership.js, _section_prospects.html and partnership.css).
   Coach Ed, 2026-11-16: the Steps reached, Events sent to Meta and Recent orders cards are gone and the page is this list alone.
   A row shows the contact the API already holds (his ruling D2), a phone and an email in full; order and message rows are never matched by name.
   The Action column is icon only: SMS and Email open a popup whose Send link opens the owner's own phone or email app, prefilled (nothing is sent by us), Open order opens
   a summary popup (only what the Orders page already shows) with a link to the full order. While the API answers 404 (not a Santé site, or the
   package is off) the page says it is not available yet and its links stay hidden (probe).
   API strings reach the page through textContent or D.el only. Plain ES5. NOJourney.util holds the pure helpers (tests/journey.test.mjs). */
(function () {
  var D = window.NODash;
  var token = 0, S = null, dlgClose = null;
  var PAY = { pending_review: ["warn", "Under review"], rejected: ["danger", "Needs attention"], verified: ["ok", "Verified"] };
  var REG = { ready_to_register: "Ready to register", in_registration: "In registration", registered: "Registered" };

  /* TWCinc's eight stages (partnership/stages.py), in funnel order: a row reports the furthest it reached. */
  var PR_STAGES = [["new_lead", "New Lead"], ["landing_page", "Landing Page"], ["start_watching", "Start Watching"], ["done_watching", "Done Watching"],
    ["added_to_cart", "Add to Cart"], ["checked_out", "Checked Out"], ["account_setup", "Account Setup"], ["activated", "Activated"]];
  var PR_SOURCES = { pack_page: "Membership Pack page", webchat: "Website chat", email: "Email", messenger: "FB Messenger" };
  var PR_TONE = { new_lead: "neutral", landing_page: "neutral", start_watching: "info", done_watching: "info", added_to_cart: "warn", checked_out: "info", account_setup: "warn", activated: "ok" };
  var NO_NAME = "No name";
  var ICONS = {
    phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
    mail: "M3 6h18v12H3zM3 7l9 7 9-7",
    sms: "M4 5h16v11H9l-5 4z",
    order: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
    close: "M6 6l12 12M18 6L6 18",
    search: "M11 4a7 7 0 1 0 .01 0zM20 20l-3.5-3.5"
  };

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function root() { return byId("jr-root"); }
  function say(text) { var l = byId("jr-live"); if (l) l.textContent = text; }
  function msgOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function setNav(on) { Array.prototype.forEach.call(document.querySelectorAll("[data-journey-nav]"), function (n) { n.hidden = !on; }); }

  /* ---------- pure helpers ---------- */

  function num(v) { return typeof v === "number" && isFinite(v) && v >= 0 ? Math.floor(v) : 0; }
  function count(v) { return String(num(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function labelOf(list, value) { for (var i = 0; i < list.length; i++) { if (list[i][0] === value) return list[i][1]; } return ""; }
  function human(code) { var t = String(code || "").replace(/_/g, " ").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ""; }
  function parts(iso) {
    var d = new Date(iso), o = {};
    if (isNaN(d.getTime())) return null;
    try { new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d).forEach(function (p) { o[p.type] = p.value; }); } catch (e) { return null; }
    return o;
  }
  function stamp(iso) { var p = parts(iso); return p ? String(p.month || "").replace(/\.$/, "") + " " + p.day + ", " + p.year + ", " + p.hour + ":" + p.minute + " " + String(p.dayPeriod || "").toUpperCase().replace(/\./g, "") : ""; }
  function orderLink(id) { return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? "/orders/?order=" + encodeURIComponent(id) : "/orders/"; }
  function peso(c) {
    if (typeof c !== "number" || !isFinite(c)) return "";
    var s = (Math.abs(c) / 100).toFixed(2).split("."), whole = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (c < 0 ? "-" : "") + "₱" + whole + "." + s[1];
  }
  /* A member's mobile is stored as +639XXXXXXXXX; it shows the way it is dialled here, 09XXXXXXXXX. Anything else shows as it is. */
  function mobileText(m) { var t = typeof m === "string" ? m.trim() : ""; return /^\+639\d{9}$/.test(t) ? "0" + t.slice(3) : t; }
  function emailText(m) { return typeof m === "string" ? m.trim() : ""; }

  function prStage(key) { return labelOf(PR_STAGES, key) || human(key); }
  function prSource(key) { return PR_SOURCES[key] || human(key); }
  /* The avatar: the first letters of the first two words of the name, "?" for a blank name. */
  function initials(name) {
    var w = String(name || "").trim().split(/\s+/).filter(Boolean);
    return w.length ? (w[0].charAt(0) + (w.length > 1 ? w[1].charAt(0) : "")).toUpperCase() : "?";
  }
  function tone(name) { var n = 0, t = String(name || ""); for (var i = 0; i < t.length; i++) n = (n * 31 + t.charCodeAt(i)) % 5; return n; }
  function prPath(site, pr) {
    var q = "?page=" + pr.page + (pr.stage ? "&stage=" + encodeURIComponent(pr.stage) : "") + (pr.q ? "&q=" + encodeURIComponent(pr.q) : "");
    return "/sites/" + site + "/pack/journey/prospects/" + q;
  }
  /* An inline icon, decorative: the text or the button's label beside it says what it is. */
  function icon(name) {
    var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"), p = document.createElementNS(NS, "path");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "jr-ic"); p.setAttribute("d", ICONS[name] || ""); svg.appendChild(p);
    return svg;
  }

  /* ---------- popups ---------- */

  function closeModal(returnFocus) { if (dlgClose) dlgClose(returnFocus); }
  /* A popup over the page: focus moves in and is kept in, Esc and the close button and a click outside close it, focus goes back to the button
     that opened it. build(close) returns the body node. */
  function modal(title, build, opener) {
    closeModal(false);
    var host = root(); if (!host) return;
    var overlay = h("div", "jr-overlay"), dlg = h("div", "jr-dialog"), head = h("div", "jr-dlg-head"), t = h("h2", "jr-dlg-title", title), x = h("button", "jr-dlg-x");
    dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "jr-dlg-h"); t.setAttribute("id", "jr-dlg-h");
    x.setAttribute("type", "button"); x.setAttribute("aria-label", "Close"); x.setAttribute("title", "Close"); add(x, icon("close"));
    function close(returnFocus) {
      if (dlgClose !== close) return;
      dlgClose = null; document.removeEventListener("keydown", onKey); overlay.remove(); document.body.style.overflow = "";
      if (returnFocus && opener && opener.focus) opener.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(true); return; }
      if (e.key !== "Tab") return;
      var items = Array.prototype.filter.call(dlg.querySelectorAll("button, textarea, a"), function (n) { return !n.disabled; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1], now = document.activeElement;
      if (e.shiftKey && (now === first || items.indexOf(now) < 0)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (now === last || items.indexOf(now) < 0)) { e.preventDefault(); first.focus(); }
    }
    x.addEventListener("click", function () { close(true); });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(true); });
    add(head, t, x); add(dlg, head, build(close)); add(overlay, dlg); add(host, overlay);
    dlgClose = close; document.addEventListener("keydown", onKey); document.body.style.overflow = "hidden";
    var f = dlg.querySelector("textarea") || x; if (f && f.focus) f.focus();
  }
  function fact(list, label, value) {
    if (value === "" || value == null) return;
    add(list, h("dt", "", label), typeof value === "string" ? h("dd", "", value) : add(h("dd", ""), value));
  }
  /* Open order: only what the Orders page already shows, and a link to the full order there. */
  function orderPopup(r, opener) {
    modal("Order " + (r.order_number || ""), function () {
      var body = h("div", "jr-dlg-body"), list = h("dl", "jr-facts"), pay = PAY[r.payment_status];
      fact(list, "Order number", r.order_number || "");
      fact(list, "Customer", typeof r.name === "string" ? r.name.trim() : "");
      fact(list, "Placed", stamp(r.placed_at));
      if (pay) fact(list, "Payment", h("span", "chip chip-" + pay[0], pay[1]));
      fact(list, "Amount", peso(r.price_centavos));
      fact(list, "Registration", r.registration_status ? (REG[r.registration_status] || human(r.registration_status)) : "No registration yet");
      var go = D.el("a", { "class": "no-btn no-btn-primary jr-dlg-go", href: orderLink(r.order_id) }, "View full order");
      add(body, list, add(h("div", "jr-dlg-actions"), go));
      return body;
    }, opener);
  }
  /* The link Send opens (Coach Ed, 2026-11-16, option A): the owner's own phone or email app, prefilled. NegosyoOnline sends nothing, makes no
     request, and stores or logs neither the message nor the recipient. encodeURIComponent (never "+") keeps spaces, &, newlines and emoji intact.
     SMS: sms:<number>?&body=<msg>. iOS wants "&body=" after a "?", Android wants "?body=" and ignores the stray "&", so this one form works on both.
     The number stays as shown (09...), which both phones dial. Email: mailto:<address>?subject=...&body=..., the subject only when the site name is known. */
  function smsHref(number, msg) { return "sms:" + number + "?&body=" + encodeURIComponent(msg); }
  function mailHref(address, siteName, msg) {
    var q = (siteName ? "subject=" + encodeURIComponent("From " + siteName) + "&" : "") + "body=" + encodeURIComponent(msg);
    return "mailto:" + address + "?" + q;
  }
  /* SMS and Email: who it is for, a message box that starts empty, and Send, a link that opens the owner's own app. */
  function messagePopup(kind, r, opener) {
    var sms = kind === "sms", to = sms ? mobileText(r.mobile) : emailText(r.email), name = typeof r.name === "string" ? r.name.trim() : "";
    var siteName = S && S.siteName || "";
    function href(msg) { return sms ? smsHref(to, msg) : mailHref(to, siteName, msg); }
    modal(sms ? "SMS" : "Email", function (close) {
      var body = h("div", "jr-dlg-body"), who = h("p", "jr-dlg-to"), lab = D.el("label", { "for": "jr-dlg-msg", "class": "jr-label" }, "Message");
      add(who, h("span", "jr-dlg-to-l", "To "), h("strong", "", name || NO_NAME), h("span", "jr-dlg-to-v", " " + to));
      var ta = D.el("textarea", { id: "jr-dlg-msg", "class": "jr-dlg-msg", rows: "5", maxlength: "1000" });
      var send = D.el("a", { "class": "no-btn no-btn-primary jr-dlg-send", href: href("") }, "Send"), cancel = h("button", "no-btn no-btn-ghost", "Close");
      cancel.setAttribute("type", "button");
      ta.addEventListener("input", function () { send.setAttribute("href", href(ta.value)); });
      cancel.addEventListener("click", function () { close(true); });
      send.addEventListener("click", function () { setTimeout(function () { close(true); }, 0); });
      add(body, who, lab, ta, add(h("div", "jr-dlg-actions"), cancel, send), h("p", "jr-dlg-note", sms ? "Opens your phone's messaging app" : "Opens your email app"));
      return body;
    }, opener);
  }

  /* ---------- load ---------- */

  function show() {
    var mine = ++token, r = clear(root());
    S = { site: null, pr: { stage: "", q: "", page: 1, data: null, state: "loading", req: 0, timer: null } };
    r.setAttribute("aria-busy", "true");
    add(r, h("p", "jr-meta", "Loading…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      if (!res.ok) { failed(msgOf(res, "")); return; }
      var sites = D.sitesOf(res);
      S.site = sites.length ? D.siteFromQuery(sites.map(function (s) { return s.id; })) : null;
      if (!S.site) { unavailable(); return; }
      sites.forEach(function (x) { if (x.id === S.site && typeof x.display_name === "string") S.siteName = x.display_name.trim(); });
      var r2 = clear(root()); r2.removeAttribute("aria-busy");
      add(r2, prospectsCard()); prRead();
    });
  }
  function hide() { token++; closeModal(false); if (S && S.pr && S.pr.timer) clearTimeout(S.pr.timer); S = null; say(""); var r = root(); if (r) { r.removeAttribute("aria-busy"); clear(r); } }
  /* The links stay hidden until the API shows the list is open for this site (a 404 means not a Santé site, or the package is off). */
  function probe() {
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!sites.length) return;
      var site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      if (!site) return;
      D.call("GET", prPath(site, { page: 1, stage: "", q: "" }), null, true).then(function (r) { if (r.ok) setNav(true); });
    });
  }

  /* ---------- screens ---------- */

  function plain(title, text, retry) {
    var r = clear(root()); r.removeAttribute("aria-busy");
    var c = h("section", "jr-card jr-note-card"), t = h("h2", "jr-h2", title);
    add(c, t, text ? h("p", "jr-lead", text) : null);
    if (retry) { var b = h("button", "no-btn no-btn-ghost", "Try again"); b.setAttribute("type", "button"); b.addEventListener("click", function () { show(); }); add(c, b); }
    add(r, c); say(title);
  }
  function unavailable() { setNav(false); plain("The Prospect List is not available yet", "It shows for Santé stores once the Membership Pack is on. There is nothing to set up here for now."); }
  function failed(m) { plain("We could not load the Prospect List", m || "Please check your connection and try again.", true); }

  /* ---------- the prospects card ---------- */

  function prospectsCard() {
    var c = h("section", "jr-card jr-pr-card"), head = h("div", "jr-pr-head"), t = h("h2", "jr-pr-title", "Prospects"), tb = h("div", "jr-pr-tools"), main = h("div", "jr-pr-main"), txt = h("div", "jr-pr-headtxt");
    c.setAttribute("aria-labelledby", "jr-h-prospects"); t.setAttribute("id", "jr-h-prospects");
    add(txt, t, h("p", "jr-pr-lead", "People who visited your Membership Pack page"));
    var lab = D.el("label", { "for": "jr-pr-q", "class": "jr-sr" }, "Search by name, order number, mobile or email");
    var inp = D.el("input", { id: "jr-pr-q", type: "search", "class": "jr-pr-q", placeholder: "Search by name, order number, mobile or email", autocomplete: "off", maxlength: "120" });
    inp.addEventListener("input", function () {
      var pr = S && S.pr; if (!pr) return;
      if (pr.timer) clearTimeout(pr.timer);
      pr.timer = setTimeout(function () { pr.timer = null; var v = inp.value.trim(); if (v !== pr.q) { pr.q = v; pr.page = 1; prRead(); } }, 300);
    });
    /* The same field as the top-right quick search (dash.css .qs-field): a magnifier inside the box. */
    var mag = icon("search"); add(tb, lab, mag, inp); add(head, txt, tb);
    var chips = h("div", "jr-pr-chips"); chips.setAttribute("id", "jr-pr-chips"); chips.setAttribute("role", "group"); chips.setAttribute("aria-label", "Filter prospects by stage");
    var body = h("div", "jr-pr-body"); body.setAttribute("id", "jr-pr-body");
    add(main, chips, body); add(c, head, main);
    prChips(); prBody();
    return c;
  }
  function prRead() {
    var mine = token, pr = S.pr, req = ++pr.req;
    pr.state = "loading"; prBody();
    D.call("GET", prPath(S.site, pr), null, true).then(function (res) {
      if (mine !== token || !S || req !== pr.req || res.status === 401) return;
      if (res.status === 404) { unavailable(); return; }
      if (!res.ok) { pr.state = "error"; pr.err = msgOf(res, ""); prBody(); return; }
      pr.data = res.data || {}; pr.state = "ok"; setNav(true);
      if (typeof pr.data.page === "number" && pr.data.page !== pr.page) pr.page = pr.data.page;
      prChips(); prBody(); say("Prospects updated");
    });
  }
  /* One segmented bar: All and the eight stages. The count of each is in its label for a screen reader and on hover; the bar itself stays plain. */
  function prChips() {
    var box = byId("jr-pr-chips"); if (!box || !S) return;
    var pr = S.pr, counts = pr.data && pr.data.stage_counts || {};
    clear(box);
    [["", "All"]].concat(PR_STAGES).forEach(function (st) {
      var n = counts[st[0] === "" ? "all" : st[0]], on = pr.stage === st[0];
      var b = h("button", "jr-pr-chip" + (on ? " is-on" : ""), st[1]);
      b.setAttribute("type", "button"); b.setAttribute("aria-pressed", String(on));
      if (typeof n === "number") { var lbl = st[1] + ", " + count(n) + (n === 1 ? " person" : " people"); b.setAttribute("aria-label", lbl); b.setAttribute("title", lbl); }
      b.addEventListener("click", function () { if (pr.stage === st[0]) return; pr.stage = st[0]; pr.page = 1; prChips(); prRead(); });
      add(box, b);
    });
  }
  function contactLine(kind, text) {
    return add(h("span", "jr-pr-ct"), icon(kind), h("span", "jr-pr-ct-t", text));
  }
  function actBtn(kind, label, onClick) {
    var b = h("button", "jr-act"); b.setAttribute("type", "button"); b.setAttribute("aria-label", label); b.setAttribute("title", label);
    add(b, icon(kind)); b.addEventListener("click", function () { onClick(b); });
    return b;
  }
  function prRow(r) {
    var tr = h("tr"), name = typeof r.name === "string" ? r.name.trim() : "", order = r.kind === "order", mobile = mobileText(r.mobile), email = emailText(r.email);
    var who = h("div", "jr-pr-who"), av = h("span", "jr-pr-av jr-pr-av-" + tone(name), initials(name)); av.setAttribute("aria-hidden", "true");
    var txt = h("span", "jr-pr-id");
    add(txt, h("span", "jr-pr-name" + (name ? "" : " is-blank"), name || NO_NAME), h("span", "jr-pr-sub", prSource(r.source)));
    add(who, av, txt);
    var contact = h("div", "jr-pr-contact");
    if (mobile) add(contact, contactLine("phone", mobile));
    if (email) add(contact, contactLine("mail", email));
    if (!mobile && !email) add(contact, h("span", "jr-pr-none", "–"));
    var st = prStage(r.stage), stage = h("span", "chip chip-" + (PR_TONE[r.stage] || "neutral"), st);
    var reg = r.registration_status ? h("span", "jr-pr-reg", REG[r.registration_status] || human(r.registration_status)) : null;
    var who2 = name ? " " + name : "", acts = h("div", "jr-acts");
    if (mobile) add(acts, actBtn("sms", "SMS" + who2, function (b) { messagePopup("sms", r, b); }));
    if (email) add(acts, actBtn("mail", "Email" + who2, function (b) { messagePopup("email", r, b); }));
    if (order) add(acts, actBtn("order", "Open order " + (r.order_number || ""), function (b) { orderPopup(r, b); }));
    [["jr-pr-c-who", who], ["jr-pr-c-contact", contact], ["jr-pr-c-video", videoBar(r.video_percent)], ["jr-pr-c-stage", add(h("div", "jr-pr-stage"), stage, reg)],
      ["jr-pr-c-when", h("span", "", stamp(r.last_activity))], ["jr-pr-c-act", acts]].forEach(function (x) { add(tr, add(h("td", x[0]), x[1])); });
    return tr;
  }
  /* The video progress: a bar and the percent. A message has no video, so it shows a dash. */
  function videoBar(v) {
    if (typeof v !== "number" || !isFinite(v)) return h("span", "jr-pr-none", "–");
    var pct = Math.max(0, Math.min(100, Math.floor(v))), w = h("span", "jr-pr-video"), track = h("span", "jr-pr-track"), fill = h("span", "jr-pr-fill");
    fill.style.width = pct + "%"; add(track, fill);
    add(w, track, h("span", "jr-pr-pct", pct + "%"));
    return w;
  }
  function prBody() {
    var box = byId("jr-pr-body"); if (!box || !S) return;
    var pr = S.pr, d = pr.data; clear(box);
    if (pr.state === "loading" && !d) { add(box, h("p", "jr-meta", "Loading…")); return; }
    if (pr.state === "error") {
      var b = h("button", "no-btn no-btn-ghost", "Try again"); b.setAttribute("type", "button"); b.addEventListener("click", function () { prRead(); });
      add(box, h("p", "jr-state", "We could not load the prospects."), h("p", "jr-hint", pr.err || "Please check your connection and try again."), b); return;
    }
    var rows = d && Array.isArray(d.results) ? d.results.filter(function (r) { return r && typeof r === "object"; }) : [];
    box.setAttribute("aria-busy", pr.state === "loading" ? "true" : "false");
    if (!rows.length) {
      var all = d && d.stage_counts && num(d.stage_counts.all) > 0;
      add(box, h("p", "jr-empty", all ? "No one matches this search or stage." : "No prospects yet.")); return;
    }
    var t = h("table", "jr-table jr-pr-table"), hd = h("thead"), tr = h("tr"), tbd = h("tbody");
    ["Prospect", "Contact", "Video progress", "Stage", "Last activity", "ACTION"].forEach(function (x) {
      var th = h("th", "", x); th.setAttribute("scope", "col"); add(tr, th);
    });
    rows.forEach(function (r) { add(tbd, prRow(r)); });
    add(t, add(hd, tr), tbd); add(box, add(h("div", "jr-scroll"), t));
    var pages = num(d.pages) || 1, page = num(d.page) || 1, total = num(d.total), foot = h("div", "jr-pr-foot");
    add(foot, h("span", "jr-pr-count", count(total) + (total === 1 ? " person" : " people")));
    if (pages > 1) {
      var nav = h("div", "jr-pr-pager"), prev = h("button", "no-btn no-btn-ghost", "Previous"), next = h("button", "no-btn no-btn-ghost", "Next");
      prev.setAttribute("type", "button"); next.setAttribute("type", "button");
      prev.disabled = page <= 1; next.disabled = page >= pages;
      prev.addEventListener("click", function () { if (pr.page > 1) { pr.page -= 1; prRead(); } });
      next.addEventListener("click", function () { if (pr.page < pages) { pr.page += 1; prRead(); } });
      add(nav, prev, h("span", "jr-pr-page", "Page " + count(page) + " of " + count(pages)), next); add(foot, nav);
    }
    add(box, foot);
  }

  window.NOJourney = { show: show, hide: hide, probe: probe, util: { initials: initials, videoBar: videoBar, prPath: prPath, count: count, human: human, orderLink: orderLink, mobileText: mobileText, peso: peso, smsHref: smsHref, mailHref: mailHref } };
})();
