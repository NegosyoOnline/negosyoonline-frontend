/* Orders > Product Orders (ClickUp z8uq9mekuw, plan z8uq9mek5v section 10): the Subscriber reviews the bank-transfer proofs of
   Santé shop orders, confirms the payment or cancels with a note, then marks the order shipped and delivered. Same layout as
   Orders > Package Order (pack-orders.js, which this file does not touch). Reads GET /sites/ and GET /sites/{id}/shop/orders/
   (one read of everything, the three stage tiles filter it here), GET .../{order}/ for the detail, GET .../{order}/proofs/{proof}/
   as a blob (the file never has a URL in the page), POST .../confirm-receipt/, .../cancel/, .../ship/ and .../deliver/ with the
   order's state_version. Every status, name and amount comes from the API; API strings reach the page through textContent or
   D.el only. No per-order billing figure. */
(function () {
  var D = window.NODash;
  var STAGES = [["review", "Under review"], ["ship", "To ship"], ["shipped", "Shipped"]];
  var STAGE_OF = { placed: "review", confirmed: "ship", shipped: "shipped", delivered: "shipped", cancelled: "cancelled" };
  var SHIP_MODE = { guest: "Address entered at checkout", home: "Member's saved address", different: "Another address" };
  var EVENT_LABEL = { placed: "Order placed", verified: "Payment confirmed", cancelled: "Order cancelled", shipped: "Marked shipped", delivered: "Marked delivered" };
  var STALE = "This order changed. Reload it and try again.";
  var PAYMENT = "Bank or e-wallet transfer";
  var S, token = 0, urls = {}, closeDlg = null;

  function fresh() { return { site: null, tab: "products", filter: null, rows: [], listState: "loading", listMsg: "", open: {}, details: {}, proofErr: {}, busy: false }; }
  S = fresh();

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function attr(n, o) { Object.keys(o).forEach(function (k) { n.setAttribute(k, o[k]); }); return n; }
  function btn(label, cls, fn) { var b = h("button", "no-btn " + cls, label); b.setAttribute("type", "button"); if (fn) b.addEventListener("click", function () { fn(b); }); return b; }
  function icon(d, w) {
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), p = document.createElementNS(ns, "path");
    [["viewBox", "0 0 24 24"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", w || "2"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"], ["focusable", "false"]].forEach(function (a) { s.setAttribute(a[0], a[1]); });
    p.setAttribute("d", d); s.appendChild(p); return s;
  }
  var ICON = { doc: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6", receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 9l2 2 4-4", bag: "M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" };

  /* ---- formats: centavos to pesos, Manila time ---- */
  function peso(c) {
    if (typeof c !== "number" || !isFinite(c)) return "";
    var s = (Math.abs(c) / 100).toFixed(2).split("."), whole = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (c < 0 ? "-" : "") + "₱" + whole + "." + s[1];
  }
  function parts(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    var o = {};
    try {
      new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d)
        .forEach(function (p) { o[p.type] = p.value; });
    } catch (e) { return null; }
    o.dayPeriod = String(o.dayPeriod || "").toUpperCase().replace(/\./g, "");
    return o;
  }
  function when(iso) { var p = parts(iso); return p ? p.day + " " + p.month.replace(/\.$/, "") + " " + p.year + ", " + p.hour + ":" + p.minute + " " + p.dayPeriod : ""; }
  function placed(iso) { var p = parts(iso); return p ? p.month.replace(/\.$/, "") + " " + p.day + ", " + p.hour + ":" + p.minute + " " + p.dayPeriod : ""; }
  /* A calendar day "YYYY-MM-DD" from the API, shown as "12 Nov 2026" without any time-zone shift. */
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function day(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? parseInt(m[3], 10) + " " + MONTHS[parseInt(m[2], 10) - 1] + " " + m[1] : ""; }
  function manilaToday() {
    try {
      var o = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
      return o.year + "-" + o.month + "-" + o.day;
    } catch (e) { return ""; }
  }
  function msg(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function fieldMsg(res, name) { var f = res && res.data && res.data.fields; return f && typeof f[name] === "string" ? f[name] : ""; }
  function stageOf(o) { return STAGE_OF[o.status] || ""; }

  /* ---- paths ---- */
  function base() { return "/sites/" + S.site + "/shop/orders/"; }
  function find(id) { return S.rows.filter(function (r) { return r.id === id; })[0] || null; }
  function chipOf(o) {
    var s = o.status;
    return s === "placed" ? h("span", "chip chip-warn", "Under review") : s === "confirmed" ? h("span", "chip chip-info", "To ship") : s === "shipped" ? h("span", "chip chip-info", "Shipped")
      : s === "delivered" ? h("span", "chip chip-ok", "Delivered") : s === "cancelled" ? h("span", "chip chip-danger", "Cancelled") : null;
  }
  function shipLine(o) { return (o.buyer_kind === "member" ? "Member" : "Guest") + " · " + (SHIP_MODE[o.ship_mode] || "Delivery address"); }

  /* ---- load ---- */
  function show() { token++; S = fresh(); revokeAll(); tabsInit(); load(); }
  function hide() { token++; if (closeDlg) closeDlg(false); revokeAll(); }
  function revokeAll() { Object.keys(urls).forEach(function (k) { try { URL.revokeObjectURL(urls[k]); } catch (e) { /* ignore */ } }); urls = {}; }
  function load() {
    var mine = ++token; S.listState = "loading"; render();
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      if (!res.ok) { S.listState = "error"; render(); return; }
      var sites = D.sitesOf(res);
      if (!sites.length) { S.rows = []; S.listState = "empty"; render(); return; }
      S.site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      reloadList(mine, false);
    });
  }
  function reloadList(mine, quiet) {
    return D.call("GET", base() + "?filter=all", null, true).then(function (r) {
      if (mine !== token || r.status === 401) return;
      if (r.status === 404) { S.rows = []; S.listState = "empty"; render(); return; } /* not a Santé site, or the shop is off: nothing to review */
      if (!r.ok) { if (!quiet) { S.listState = "error"; S.listMsg = r.status === 403 ? msg(r, "") : ""; render(); } return; } /* 403 billing_only: the API's own sentence */
      S.rows = Array.isArray(r.data.orders) ? r.data.orders : [];
      S.listState = S.rows.length ? "ok" : "empty"; render();
    });
  }
  function loadDetail(id) {
    var mine = token;
    delete S.details[id]; render();
    return D.call("GET", base() + encodeURIComponent(id) + "/", null, true).then(function (r) {
      if (mine !== token || r.status === 401) return;
      if (!r.ok) { S.details[id] = { error: msg(r, "We could not load this order. Try again.") }; render(); return; }
      S.details[id] = r.data; render();
    });
  }
  function toggle(id) {
    if (S.open[id]) { delete S.open[id]; render(); return; }
    S.open[id] = true; delete S.proofErr[id];
    loadDetail(id).then(function () { loadProof(id); });
  }

  /* ---- proof: the stream is fetched with the session cookie and shown from a blob ---- */
  function proofOf(id) { var d = S.details[id]; return d && d.proof ? d.proof : null; }
  function loadProof(id) {
    var p = proofOf(id); if (!p || urls[p.id]) return Promise.resolve();
    var mine = token;
    delete S.proofErr[id];
    return fetch(D.cfg.apiBase + base() + encodeURIComponent(id) + "/proofs/" + encodeURIComponent(p.id) + "/", { credentials: "include" }).then(function (r) {
      if (!r.ok) throw new Error("proof " + r.status);
      return r.blob();
    }).then(function (b) {
      if (mine !== token) return;
      urls[p.id] = URL.createObjectURL(b); render();
    }).catch(function () { if (mine !== token) return; S.proofErr[id] = true; render(); });
  }
  function openProof(id) { var p = proofOf(id); if (p && urls[p.id]) window.open(urls[p.id], "_blank", "noopener"); }
  function downloadProof(id) {
    var p = proofOf(id); if (!p || !urls[p.id]) return;
    var d = S.details[id], a = D.el("a", { href: urls[p.id], download: "proof-" + (d.order_number || id) + (p.content_type === "application/pdf" ? ".pdf" : "") });
    document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
  }

  /* ---- actions: every one carries the order's state_version; an old one answers 409 and reloads ---- */
  var DONE = { "confirm-receipt": "Payment confirmed", cancel: "Order cancelled", ship: "Order marked as shipped", deliver: "Order marked as delivered" };
  function decide(id, kind, body, hooks) {
    var o = find(id); if (!o || S.busy) return Promise.resolve(null);
    S.busy = true; hooks = hooks || {};
    var payload = body || {}; payload.state_version = o.state_version;
    return D.call("POST", base() + encodeURIComponent(id) + "/" + kind + "/", payload, true).then(function (r) {
      S.busy = false;
      if (r.status === 401) return r;
      if (r.ok) {
        if (closeDlg) closeDlg(false);
        D.toast(DONE[kind]);
        delete S.details[id]; delete S.proofErr[id];
        return reloadList(token, true).then(function () { if (S.open[id]) return loadDetail(id).then(function () { return loadProof(id); }); }).then(function () { return r; });
      }
      if (r.status === 409) { /* an old state_version, or the status moved: reload and say so */
        if (hooks.onError) hooks.onError(r.data && r.data.code === "stale" ? STALE : msg(r, STALE)); else D.toast(r.data && r.data.code === "stale" ? STALE : msg(r, STALE), "", "error");
        return reloadList(token, true).then(function () { if (S.open[id]) return loadDetail(id); }).then(function () { return r; });
      }
      if (hooks.onError) hooks.onError(msg(r, "We could not save this. Please try again."), r);
      else D.toast("That did not work", msg(r, "We could not save this. Please try again."), "error");
      return r;
    });
  }

  /* ---- render ---- */
  function counts() { var c = { review: 0, ship: 0, shipped: 0, all: S.rows.length }; S.rows.forEach(function (o) { if (c[stageOf(o)] !== undefined) c[stageOf(o)]++; }); return c; }
  function shown() { return S.rows.filter(function (o) { return !S.filter || stageOf(o) === S.filter; }); }
  function fact(dl, k, v) { add(dl, h("dt", "", k), h("dd", "", v)); }
  function facts(rows) { var dl = h("dl", "po-facts"); rows.forEach(function (r) { if (r[1] !== "" && r[1] != null) fact(dl, r[0], r[1]); }); return dl; }
  function card(title, sub) { var c = h("div", "po-card"); add(c, h("h3", "", title), sub ? h("p", "po-sub", sub) : null); return c; }
  function errBox(title, text, retry) { var e = h("div", "po-err"); e.setAttribute("role", "alert"); add(e, h("h2", "", title), h("p", "", text), btn("Try again", "no-btn-ghost", retry)); return e; }
  function skel(rows, cols) {
    var s = h("div", "po-skel"); s.setAttribute("role", "status"); s.setAttribute("aria-label", rows === 2 ? "Loading this order" : "Loading orders");
    for (var i = 0; i < rows; i++) { var r = h("div", "po-skel-row"); for (var j = 0; j < cols; j++) r.appendChild(h("i")); s.appendChild(r); }
    return s;
  }

  function proofCard(id, d) {
    var p = d.proof, c = card("Payment proof");
    if (!p) { add(c, h("p", "po-sub", "No proof has been sent.")); return c; }
    add(c, h("p", "po-sub", "Sent " + when(p.submitted_at) + "."));
    if (S.proofErr[id]) { add(c, errBox("The proof did not load", "Try again.", function () { loadProof(id); })); return c; }
    var url = urls[p.id];
    if (!url) { var w = h("div", "po-proof"); w.setAttribute("aria-busy", "true"); add(w, h("p", "po-note", "Loading the proof…")); return add(c, w); }
    if (p.content_type === "application/pdf") {
      var t = h("span", "icon-tile"); t.setAttribute("aria-hidden", "true"); t.appendChild(icon(ICON.doc));
      add(c, add(h("div", "po-pdf"), t, add(h("div"), h("strong", "", "proof-" + (d.order_number || id) + ".pdf"), h("span", "", "PDF"))));
    } else {
      var img = D.el("img", { src: url, alt: "Payment proof, sent " + when(p.submitted_at) });
      img.style.maxWidth = "100%"; img.style.maxHeight = "456px"; img.style.objectFit = "contain";
      add(c, add(h("div", "po-proof"), img));
    }
    return add(c, add(h("div", "po-actions"), btn("Open", "no-btn-ghost", function () { openProof(id); }), btn("Download", "no-btn-ghost", function () { downloadProof(id); })));
  }
  function historyCard(d) {
    var c = card("History"), ol = h("ol", "po-hist");
    (d.events || []).forEach(function (e) {
      var kind = e.kind === "cancelled" ? "no" : e.kind === "placed" ? "sent" : "yes";
      var li = h("li", "is-" + kind), who = e.actor_type === "buyer" ? "The buyer" : e.actor_label;
      add(li, h("strong", "", EVENT_LABEL[e.kind] || e.kind), h("span", "", e.note || ""), h("time", "", when(e.created_at) + (who ? " · " + who : "")));
      ol.appendChild(li);
    });
    return add(c, ol);
  }
  function linesCard(d) {
    var c = card("Items"), ul = h("ul", "so-lines");
    (d.lines || []).forEach(function (l) {
      var li = h("li");
      add(li, add(h("span", "so-line-name"), h("strong", "", l.name), h("span", "", l.quantity + " × " + peso(l.srp_centavos))), h("span", "num", peso(l.line_charged_centavos)));
      ul.appendChild(li);
    });
    add(c, ul, facts([["Subtotal", peso(d.subtotal_centavos)], ["Shipping", d.shipping_charged_centavos ? peso(d.shipping_charged_centavos) : "None charged"], ["Order total", peso(d.total_centavos)]]));
    return c;
  }
  function addressText(a) {
    a = a && typeof a === "object" ? a : {};
    return [a.line, a.barangay, a.city, a.province, a.zip].filter(function (x) { return typeof x === "string" && x.trim(); }).join(", ");
  }
  function deliveryCard(d) {
    var a = d.delivery_address && typeof d.delivery_address === "object" ? d.delivery_address : {};
    return add(card("Delivery"), facts([["Receiver", d.receiver_name], ["Mobile", d.receiver_mobile], ["Email", d.contact_email], ["Ship mode", SHIP_MODE[d.ship_mode] || ""],
      ["Address", addressText(a)], ["Landmark", typeof a.landmark === "string" ? a.landmark : ""]]));
  }
  function fulfilmentCard(d) {
    if (!d.shipped_on && !d.delivered_on && !d.cancel_note) return null;
    var rows = d.cancel_note ? [["Cancel note", d.cancel_note]] : [["Courier", d.courier], ["Tracking number", d.tracking_no], ["Shipped on", day(d.shipped_on)], ["Delivered on", day(d.delivered_on)]];
    return add(card(d.cancel_note ? "Cancellation" : "Shipment"), facts(rows));
  }
  function paymentCard(d) {
    var p = d.proof; if (!p) return null;
    var kind = p.account_kind === "ewallet" ? "E-wallet" : "Bank";
    return add(card("Payment details", "The account the buyer chose, as it was when they paid."), facts([["Paid to", p.account_provider_name + " · " + kind], ["Account name", p.account_name], ["Account number", "ending " + p.account_number_last4],
      ["Order total", peso(d.total_centavos)], ["Amount sent", peso(p.amount_sent_centavos)], ["Reference number", p.reference_number]]));
  }
  function detailGrid(o) {
    var id = o.id, d = S.details[id];
    if (!d) return skel(2, 3);
    if (d.error) return errBox("We could not load this order", d.error, function () { loadDetail(id).then(function () { loadProof(id); }); });
    var g = h("div", "mc-grid"), left = h("div", "mc-col"), right = h("div", "mc-col");
    add(left, proofCard(id, d), historyCard(d));
    add(right, linesCard(d), deliveryCard(d), fulfilmentCard(d), paymentCard(d));
    return add(g, left, right);
  }
  function actions(o) {
    var s = o.status, box = [];
    if (s === "placed") {
      box.push(btn("Confirm payment received", "no-btn-primary", function () { decide(o.id, "confirm-receipt"); }));
      box.push(btn("Cancel order…", "no-btn-ghost po-btn-danger", function (b) { formDialog(o.id, "cancel", b); }));
    } else if (s === "confirmed") box.push(btn("Mark shipped…", "no-btn-primary", function (b) { formDialog(o.id, "ship", b); }));
    else if (s === "shipped") box.push(btn("Mark delivered…", "no-btn-primary", function (b) { formDialog(o.id, "deliver", b); }));
    return box;
  }
  function toggler(o) {
    var on = !!S.open[o.id], b = btn("", "no-btn-ghost mc-toggle", function () { toggle(o.id); });
    b.setAttribute("aria-expanded", on ? "true" : "false"); b.setAttribute("aria-label", "Toggle order details");
    var arrow = h("span", "", on ? "▴" : "▾"); arrow.setAttribute("aria-hidden", "true");
    add(b, document.createTextNode("Details "), arrow);
    return b;
  }
  function ticket(o) {
    var t = h("div", "mc-ticket"), stub = h("div", "mc-stub"), body = h("div", "mc-body"), meta = h("div", "mc-meta"), acts = h("div", "mc-actions"), pay = h("span", "", PAYMENT);
    add(stub, h("div", "mc-order", o.order_number));
    add(pay, document.createTextNode(" · "), h("b", "", peso(o.total_centavos)));
    add(meta, pay, h("span", "", "Placed " + placed(o.created_at)));
    add(body, h("div", "mc-cust", o.receiver_name), h("div", "mc-items", shipLine(o)), meta);
    actions(o).forEach(function (b) { acts.appendChild(b); }); acts.appendChild(toggler(o));
    add(t, stub, body, acts);
    if (S.open[o.id]) add(t, add(h("div", "mc-detail"), detailGrid(o)));
    return t;
  }
  function tableRow(o) {
    var w = h("div", "mc-rowwrap"), r = h("div", "mc-row"), first = h("span"), act = h("span", "c mc-act"), s = o.status;
    w.setAttribute("role", "row");
    add(first, h("span", "mc-order", o.order_number), h("span", "mc-date", when(o.created_at).replace(", ", " ")));
    if (s === "placed") add(act, h("span", "mc-pointer", "↥ In the review queue"));
    else { actions(o).forEach(function (b) { act.appendChild(b); }); act.appendChild(toggler(o)); }
    add(r, first, h("span", "", o.receiver_name), h("span", "mc-pay", PAYMENT), h("span", "r num", peso(o.total_centavos)), add(h("span", "c"), chipOf(o)), act);
    add(w, r);
    if (S.open[o.id] && s !== "placed") add(w, add(h("div", "mc-detail"), detailGrid(o)));
    return w;
  }
  function listView(root) {
    var c = counts(), rows = shown(), sub = byId("so-sub");
    sub.hidden = false;
    sub.textContent = "Track every product order from payment to delivery · " + (S.listState === "ok" ? rows.length : 0) + " under current filters";
    var pipe = h("div", "mc-pipe");
    STAGES.forEach(function (st) {
      var b = h("button", "mc-stage" + (S.filter === st[0] ? " active" : ""));
      b.setAttribute("type", "button"); b.setAttribute("aria-pressed", S.filter === st[0] ? "true" : "false");
      add(b, h("span", "mc-count", S.listState === "ok" ? String(c[st[0]]) : "—"), h("span", "mc-label", st[1]));
      b.addEventListener("click", function () { S.filter = S.filter === st[0] ? null : st[0]; render(); });
      pipe.appendChild(b);
    });
    root.appendChild(pipe);
    if (S.filter) {
      var cl = h("div", "mc-clear"), cb = h("button", "", "× Clear status filter — showing all " + c.all + " orders"); cb.setAttribute("type", "button");
      cb.addEventListener("click", function () { S.filter = null; render(); }); root.appendChild(add(cl, cb));
    }
    if (S.listState === "loading") { root.appendChild(skel(3, 4)); return; }
    if (S.listState === "error") { root.appendChild(errBox("We could not load your orders", S.listMsg || "Check your connection, then try again.", load)); return; }
    var queue = S.listState === "ok" ? S.rows.filter(function (o) { return o.status === "placed"; }) : [];
    if (queue.length) {
      root.appendChild(add(h("div", "mc-queue-head"), h("span", "mc-queue-title", "To review"), h("span", "mc-queue-sub", "confirm the payment or cancel the order")));
      queue.forEach(function (o) { root.appendChild(ticket(o)); });
    }
    if (!rows.length) {
      var e = h("section", "dash-card ph-card po-empty"), t = h("span", "icon-tile"); e.setAttribute("aria-labelledby", "so-empty-h"); t.setAttribute("aria-hidden", "true"); t.appendChild(icon(ICON.bag));
      var hh = h("h2", "", S.listState === "empty" ? "No product orders yet" : "No orders match this filter"); hh.setAttribute("id", "so-empty-h");
      root.appendChild(add(e, t, hh, h("p", "", S.listState === "empty" ? "Orders show here when someone buys a product from your store." : "Clear the status filter to see every order.")));
      return;
    }
    var tb = h("div", "mc-table"), th = h("div", "mc-th");
    tb.setAttribute("role", "table"); tb.setAttribute("aria-label", "Product orders"); th.setAttribute("role", "row");
    [["Order #", ""], ["Customer", ""], ["Payment", ""], ["Total", "r"], ["Status", "c"], ["Action", "c"]].forEach(function (x) { th.appendChild(h("span", x[1], x[0])); });
    add(tb, th); rows.forEach(function (o) { tb.appendChild(tableRow(o)); });
    root.appendChild(tb);
  }
  function placeholder(root) {
    var sub = byId("so-sub"); sub.hidden = true; sub.textContent = "";
    var s = h("section", "dash-card ph-card po-empty"), t = h("span", "icon-tile"), hh = h("h2", "", "Overview"), p = h("p"), chip = h("span", "chip chip-warn", "Placeholder");
    s.setAttribute("aria-labelledby", "so-ph-h"); hh.setAttribute("id", "so-ph-h"); t.setAttribute("aria-hidden", "true"); t.appendChild(icon(ICON.receipt));
    root.appendChild(add(s, t, hh, add(p, chip), h("p", "", "This tab is a placeholder. Its content has not been designed yet.")));
  }
  function render() {
    var root = byId("so-body"); if (!root) return;
    clear(root); root.removeAttribute("aria-busy");
    if (S.tab !== "products") placeholder(root); else listView(root);
    Array.prototype.forEach.call(byId("shop-tabs").querySelectorAll("a"), function (a) {
      if (a.getAttribute("data-tab") === S.tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }
  var wired = false;
  /* Overview is a local tab (a placeholder, as on Package Order); Product Orders is this view; Package Order is a route link. */
  function tabsInit() {
    if (wired) return; wired = true;
    Array.prototype.forEach.call(byId("shop-tabs").querySelectorAll("a"), function (a) {
      var t = a.getAttribute("data-tab");
      if (t === "package") return;
      a.addEventListener("click", function (e) { e.preventDefault(); S.tab = t; S.filter = null; S.open = {}; render(); });
    });
  }

  /* ---- the action dialogs: cancel (note required), ship (courier, tracking, date), deliver (date) ---- */
  var FORMS = {
    cancel: { title: "Cancel order", go: "Confirm cancel", danger: true, text: "The buyer is emailed that the order was cancelled, with your note. A cancelled order cannot be reopened.",
      fields: [{ key: "note", label: "Note to the buyer (required)", type: "textarea", max: 500, required: "Write a note of 1 to 500 characters." }] },
    ship: { title: "Mark order shipped", go: "Mark shipped", text: "The buyer is emailed that the order is on its way.",
      fields: [{ key: "courier", label: "Courier (required)", type: "text", max: 60, required: "Enter the courier." }, { key: "tracking_no", label: "Tracking number (optional)", type: "text", max: 64 },
        { key: "shipped_on", label: "Shipped on", type: "date" }] },
    deliver: { title: "Mark order delivered", go: "Mark delivered", text: "The buyer is emailed that the order was delivered.",
      fields: [{ key: "delivered_on", label: "Delivered on", type: "date" }] }
  };
  function formDialog(id, kind, opener) {
    var o = find(id), spec = FORMS[kind]; if (!o) return;
    if (closeDlg) closeDlg(false);
    var slot = byId("so-dlg-slot"), overlay = h("div", "po-overlay"), dlg = h("div", "po-dialog"), inputs = {}, errs = {}, topErr = h("p", "po-error"), today = manilaToday();
    dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "so-dh");
    function close(returnFocus) {
      if (closeDlg !== close) return;
      closeDlg = null; document.removeEventListener("keydown", onKey); clear(slot); document.body.style.overflow = "";
      if (returnFocus && opener && opener.focus) opener.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(true); return; }
      if (e.key !== "Tab") return;
      var items = Array.prototype.filter.call(dlg.querySelectorAll("input, textarea, button"), function (n) { return !n.disabled; });
      var first = items[0], last = items[items.length - 1], now = document.activeElement;
      if (e.shiftKey && (now === first || items.indexOf(now) < 0)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (now === last || items.indexOf(now) < 0)) { e.preventDefault(); first.focus(); }
    }
    function setErr(key, text) {
      var n = errs[key]; if (!n) return;
      n.textContent = text || ""; n.hidden = !text;
      if (text) { inputs[key].setAttribute("aria-invalid", "true"); inputs[key].setAttribute("aria-describedby", n.id); } else { inputs[key].removeAttribute("aria-invalid"); inputs[key].removeAttribute("aria-describedby"); }
    }
    var title = h("h2", "", spec.title + " " + o.order_number); title.setAttribute("id", "so-dh");
    add(dlg, title, facts([["Order", o.order_number], ["Customer", o.receiver_name], ["Total", peso(o.total_centavos)]]));
    var intro = h("p", "", spec.text); intro.style.marginTop = "14px"; dlg.appendChild(intro);
    spec.fields.forEach(function (f) {
      var wrap = h("div", "so-field"), lab = h("label", "", f.label), fid = "so-f-" + f.key, inp, cnt = null;
      lab.setAttribute("for", fid);
      if (f.type === "textarea") { inp = D.el("textarea", { id: fid, maxlength: String(f.max), rows: "3", "class": "so-input so-text" }); cnt = h("div", "po-count", "0 of " + f.max); }
      else if (f.type === "date") { inp = D.el("input", { id: fid, type: "date", "class": "so-input" }); if (today) { inp.value = today; inp.setAttribute("max", today); } }
      else inp = D.el("input", { id: fid, type: "text", maxlength: String(f.max), autocomplete: "off", "class": "so-input" });
      inp.addEventListener("input", function () { setErr(f.key, ""); if (cnt) cnt.textContent = inp.value.length + " of " + f.max; });
      var er = h("p", "po-error"); er.setAttribute("id", fid + "-err"); er.setAttribute("role", "alert"); er.hidden = true;
      inputs[f.key] = inp; errs[f.key] = er; add(wrap, lab, inp, cnt, er); dlg.appendChild(wrap);
    });
    topErr.setAttribute("role", "alert"); topErr.hidden = true; dlg.appendChild(topErr);
    function failTop(text) { topErr.textContent = text; topErr.hidden = !text; }
    var go = btn(spec.go, spec.danger ? "no-btn-ghost po-btn-danger" : "no-btn-primary", function () {
      var body = {}, bad = false; failTop("");
      spec.fields.forEach(function (f) {
        var v = inputs[f.key].value.trim(); setErr(f.key, "");
        if (f.required && !v) { setErr(f.key, f.required); bad = true; return; }
        if (f.type === "date" && v && today && v > today) { setErr(f.key, "Enter a valid date that is not in the future."); bad = true; return; }
        if (v || f.key === "note") body[f.key] = v;
      });
      if (bad) { var first = dlg.querySelector("[aria-invalid]"); if (first && first.focus) first.focus(); return; }
      go.setAttribute("aria-busy", "true"); go.disabled = true;
      Promise.resolve(decide(id, kind, body, {
        onError: function (text, r) {
          var shown = false;
          spec.fields.forEach(function (f) { var m = r && fieldMsg(r, f.key); if (m) { setErr(f.key, m); shown = true; } });
          if (!shown) failTop(text);
        }
      })).then(function () { go.removeAttribute("aria-busy"); go.disabled = false; });
    });
    add(dlg, add(h("div", "po-actions"), btn("Back", "no-btn-ghost", function () { close(true); }), go));
    closeDlg = close;
    add(slot, add(overlay, dlg)); document.addEventListener("keydown", onKey); document.body.style.overflow = "hidden";
    var f0 = dlg.querySelector("input, textarea"); if (f0 && f0.focus) f0.focus();
  }

  window.NOShopOrders = { show: show, hide: hide };
})();
