/* Orders > Package Order (ClickUp z8uq9me9qw, PK10; design z8uq9me7x9 revision 4): the Subscriber reviews the bank-transfer
   proofs of Membership Package orders. Reads GET /sites/ and GET /sites/{id}/pack/orders/ (one read of everything, the three
   pipeline tiles filter it here), GET .../{order}/ for the detail, GET .../{order}/proofs/{proof}/ as a blob (the file
   never has a URL in the page), POST .../approve/ and .../reject/ with the order's state_version. Every status, name and
   amount comes from the API; API strings reach the page through textContent or D.el only. No per-order billing figure. */
(function () {
  var D = window.NODash;
  var STAGES = [["review", "Under review"], ["rejected", "Needs attention"], ["verified", "Verified"]];
  var STATUS_KEY = { pending_review: "review", rejected: "rejected", verified: "verified" };
  var REASONS = [["amount_mismatch", null], ["payment_not_found", "Payment not found in the receiving account."], ["proof_unreadable", "Proof is unreadable or incomplete."],
    ["reference_mismatch", "Reference number is missing or does not match."], ["wrong_account", "Payment was sent to the wrong account."], ["other", "Other, with a mandatory written explanation."]];
  var STALE = "This order changed. Reload it and try again.";
  var S, token = 0, urls = {}, closeDlg = null;

  function fresh() { return { site: null, tab: "pack", filter: null, rows: [], listState: "loading", open: {}, details: {}, proofSel: {}, proofErr: {}, price: {}, dlg: null, busy: false }; }
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
  var ICON = { doc: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6", receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 9l2 2 4-4", leaf: "M5 19c0-8 5-13.5 14-14-.5 9-6 14-14 14zM5 19 13 11" };

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
  function msg(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function keyOf(o) { return STATUS_KEY[o.payment_status] || ""; }
  function priceOf(o) { var c = typeof o.price_centavos === "number" ? o.price_centavos : S.price[o.id]; return typeof c === "number" ? c : null; }
  function reasonLabel(code, o) {
    if (code !== "amount_mismatch") return REASONS.filter(function (r) { return r[0] === code; })[0][1];
    var p = priceOf(o); return p === null ? "Amount does not match the order total." : "Amount does not match " + peso(p) + ".";
  }

  /* ---- paths ---- */
  function base() { return "/sites/" + S.site + "/pack/orders/"; }
  function find(id) { return S.rows.filter(function (r) { return r.id === id; })[0] || null; }
  function pill() {
    var s = h("span", "md-pp");
    add(s, attr(icon(ICON.leaf, "1.9"), { width: "12", height: "12" }), document.createTextNode("Santé Membership Package"));
    return s;
  }
  function chipsOf(o) {
    var k = keyOf(o);
    return k === "review" ? h("span", "chip chip-warn", "Under review") : k === "rejected" ? h("span", "chip chip-danger", "Needs attention") : k === "verified" ? h("span", "chip chip-ok", "Verified") : null;
  }

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
      if (r.status === 404) { S.rows = []; S.listState = "empty"; render(); return; } /* not a Santé site, or the package is off: nothing to review */
      if (!r.ok) { if (!quiet) { S.listState = "error"; render(); } return; }
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
      S.details[id] = r.data;
      if (typeof r.data.price_centavos === "number") S.price[id] = r.data.price_centavos;
      render();
    });
  }
  function toggle(id) {
    if (S.open[id]) { delete S.open[id]; render(); return; }
    S.open[id] = true; delete S.proofErr[id];
    loadDetail(id).then(function () { loadProof(id); });
  }

  /* ---- proof: the stream is fetched with the session cookie and shown from a blob ---- */
  function proofOf(id) {
    var d = S.details[id]; if (!d || !d.submissions || !d.submissions.length) return null;
    var want = S.proofSel[id];
    var subs = d.submissions.slice().sort(function (a, b) { return a.seq - b.seq; });
    return subs.filter(function (s) { return s.id === want; })[0] || subs[subs.length - 1];
  }
  function loadProof(id) {
    var sub = proofOf(id); if (!sub || urls[sub.id]) return Promise.resolve();
    var mine = token;
    delete S.proofErr[id];
    return fetch(D.cfg.apiBase + base() + encodeURIComponent(id) + "/proofs/" + encodeURIComponent(sub.id) + "/", { credentials: "include" }).then(function (r) {
      if (!r.ok) throw new Error("proof " + r.status);
      return r.blob();
    }).then(function (b) {
      if (mine !== token) return;
      urls[sub.id] = URL.createObjectURL(b); render();
    }).catch(function () { if (mine !== token) return; S.proofErr[id] = true; render(); });
  }
  function openProof(id) { var s = proofOf(id); if (s && urls[s.id]) window.open(urls[s.id], "_blank", "noopener"); }
  function downloadProof(id) {
    var s = proofOf(id); if (!s || !urls[s.id]) return;
    var d = S.details[id], a = D.el("a", { href: urls[s.id], download: "proof-" + (d.order_number || id) + (s.content_type === "application/pdf" ? ".pdf" : "") });
    document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
  }

  /* ---- decisions ---- */
  function decide(id, kind, body, onStale) {
    var o = find(id); if (!o || S.busy) return;
    S.busy = true;
    var payload = body || {}; payload.state_version = o.state_version;
    return D.call("POST", base() + encodeURIComponent(id) + "/" + kind + "/", payload, true).then(function (r) {
      S.busy = false;
      if (r.status === 401) return;
      if (r.ok) {
        S.dlg = null; if (closeDlg) closeDlg(false);
        D.toast(kind === "approve" ? "Payment approved" : "Payment rejected");
        delete S.details[id]; delete S.proofErr[id];
        return reloadList(token, true).then(function () { if (S.open[id]) return loadDetail(id).then(function () { return loadProof(id); }); });
      }
      if (r.status === 409) { /* an old state_version, or the status moved: reload and say so */
        if (onStale) onStale(); else D.toast(STALE, "", "error");
        return reloadList(token, true).then(function () { if (S.open[id]) return loadDetail(id); });
      }
      D.toast("That did not work", msg(r, "We could not save the decision. Please try again."), "error");
    });
  }

  /* ---- render ---- */
  function counts() { var c = { review: 0, rejected: 0, verified: 0, all: S.rows.length }; S.rows.forEach(function (o) { if (c[keyOf(o)] !== undefined) c[keyOf(o)]++; }); return c; }
  function shown() { return S.rows.filter(function (o) { return !S.filter || keyOf(o) === S.filter; }); }
  function fact(dl, k, v, bad) { add(dl, h("dt", "", k), h("dd", bad ? "is-bad" : "", v)); }
  function facts(rows) { var dl = h("dl", "po-facts"); rows.forEach(function (r) { fact(dl, r[0], r[1]); }); return dl; }
  function card(title, sub) { var c = h("div", "po-card"); add(c, h("h3", "", title), sub ? h("p", "po-sub", sub) : null); return c; }
  function errBox(title, text, retry) { var e = h("div", "po-err"); e.setAttribute("role", "alert"); add(e, h("h2", "", title), h("p", "", text), btn("Try again", "no-btn-ghost", retry)); return e; }
  function skel(rows, cols) {
    var s = h("div", "po-skel"); s.setAttribute("role", "status"); s.setAttribute("aria-label", rows === 2 ? "Loading this order" : "Loading orders");
    for (var i = 0; i < rows; i++) { var r = h("div", "po-skel-row"); for (var j = 0; j < cols; j++) r.appendChild(h("i")); s.appendChild(r); }
    return s;
  }

  function proofCard(id, d) {
    var sub = proofOf(id), c = card("Payment proof"), n = d.submissions.length;
    if (!sub) { add(c, h("p", "po-sub", "No proof has been sent.")); return c; }
    add(c, h("p", "po-sub", (n > 1 ? "Proof " + sub.seq + ". " : "") + "Sent " + when(sub.submitted_at) + "."));
    if (S.proofErr[id]) { add(c, errBox("The proof did not load", "Try again.", function () { loadProof(id); })); return c; }
    var url = urls[sub.id];
    if (!url) { var w = h("div", "po-proof"); w.setAttribute("aria-busy", "true"); add(w, h("p", "po-note", "Loading the proof…")); return add(c, w); }
    if (sub.content_type === "application/pdf") {
      var t = h("span", "icon-tile"); t.setAttribute("aria-hidden", "true"); t.appendChild(icon(ICON.doc));
      add(c, add(h("div", "po-pdf"), t, add(h("div"), h("strong", "", "proof-" + (d.order_number || id) + ".pdf"), h("span", "", "PDF"))));
    } else {
      var img = D.el("img", { src: url, alt: "Payment proof, sent " + when(sub.submitted_at) });
      img.style.maxWidth = "100%"; img.style.maxHeight = "456px"; img.style.objectFit = "contain";
      add(c, add(h("div", "po-proof"), img));
    }
    return add(c, add(h("div", "po-actions"), btn("Open", "no-btn-ghost", function () { openProof(id); }), btn("Download", "no-btn-ghost", function () { downloadProof(id); })));
  }
  function historyItems(d) {
    var items = [], n = d.submissions.length;
    d.submissions.forEach(function (s) {
      items.push({ k: "sent", t: n > 1 ? "Proof " + s.seq + " sent" : "Proof sent", s: (s.sender_name || "The buyer") + " sent " + peso(s.amount_sent_centavos) + ". Reference " + s.reference_number + ".", at: s.submitted_at, sub: s.id });
      (s.decisions || []).forEach(function (x) {
        var no = x.decision === "rejected" || x.decision === "reject";
        var text = no ? (x.reason_code === "other" ? x.other_text : x.reason_label) : "";
        items.push({ k: no ? "no" : "yes", t: no ? "Rejected" : "Approved", s: text || "", at: x.decided_at, actor: x.actor_label });
      });
    });
    return items.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
  }
  function historyCard(id, d) {
    var c = card("History"), ol = h("ol", "po-hist");
    historyItems(d).forEach(function (x) {
      var li = h("li", "is-" + x.k), tm = h("time", "", when(x.at) + (x.actor ? " · " + x.actor : ""));
      add(li, h("strong", "", x.t), h("span", "", x.s), tm);
      if (x.sub) add(li, h("br"), btn("View this proof", "no-btn-ghost", function () { S.proofSel[id] = x.sub; render(); loadProof(id); }));
      ol.appendChild(li);
    });
    return add(c, ol);
  }
  function detailGrid(o) {
    var id = o.id, d = S.details[id];
    if (!d) return skel(2, 3);
    if (d.error) return errBox("We could not load this order", d.error, function () { loadDetail(id).then(function () { loadProof(id); }); });
    var sub = proofOf(id), g = h("div", "mc-grid"), left = h("div", "mc-col"), right = h("div", "mc-col"), kind = sub && sub.account_kind === "ewallet" ? "E-wallet" : "Bank";
    add(left, proofCard(id, d), historyCard(id, d));
    add(right, add(card("Buyer"), facts([["Name", d.buyer_name], ["Mobile", d.mobile_masked]])));
    if (sub) {
      add(right, add(card("Paid to", "The account the buyer chose, as it was when they paid."), facts([["Account", sub.account_provider_name + " · " + kind], ["Account name", sub.account_name], ["Account number", "ending " + sub.account_number_last4]])));
      add(right, add(card("Payment details from the buyer"), facts([["Order total", peso(d.price_centavos)], ["Amount sent", peso(sub.amount_sent_centavos)], ["Reference number", sub.reference_number],
        ["Sent from", sub.sender_bank], ["Sender name", sub.sender_name], ["Sender account", sub.sender_account_number], ["Sent on", when(sub.transferred_at)]])));
    }
    return add(g, left, right);
  }
  function actions(o) {
    var k = keyOf(o), box = [];
    if (k === "review" || k === "rejected") box.push(btn("Approve", "no-btn-primary", function () { decide(o.id, "approve"); }));
    if (k === "review") box.push(btn("Reject…", "no-btn-ghost po-btn-danger", function (b) { rejectDialog(o.id, b); }));
    return box;
  }
  function toggler(o) {
    var on = !!S.open[o.id], b = btn("", "no-btn-ghost mc-toggle", function () { toggle(o.id); });
    b.setAttribute("aria-expanded", on ? "true" : "false"); b.setAttribute("aria-label", "Toggle order details");
    var arrow = h("span", "", on ? "▴" : "▾"); arrow.setAttribute("aria-hidden", "true");
    add(b, document.createTextNode("Details "), arrow);
    return b;
  }
  function amountLine(o) { var p = priceOf(o); return p === null ? "" : peso(p); }
  function ticket(o) {
    var t = h("div", "mc-ticket"), stub = h("div", "mc-stub"), body = h("div", "mc-body"), meta = h("div", "mc-meta"), acts = h("div", "mc-actions"), amt = amountLine(o), pay = h("span", "", "Bank or e-wallet transfer");
    add(stub, h("div", "mc-order", o.order_number), add(h("div"), pill()));
    if (amt) { add(pay, document.createTextNode(" · "), h("b", "", amt)); }
    add(meta, pay, h("span", "", "Placed " + placed(o.created_at)));
    add(body, h("div", "mc-cust", o.buyer_name), h("div", "mc-items", "[1x] Membership Pack"), meta);
    actions(o).forEach(function (b) { acts.appendChild(b); }); acts.appendChild(toggler(o));
    add(t, stub, body, acts);
    if (S.open[o.id]) add(t, add(h("div", "mc-detail"), detailGrid(o)));
    return t;
  }
  function tableRow(o) {
    var w = h("div", "mc-rowwrap"), r = h("div", "mc-row"), first = h("span"), act = h("span", "c mc-act"), k = keyOf(o), amt = amountLine(o);
    w.setAttribute("role", "row");
    add(first, h("span", "mc-order", o.order_number), h("span", "mc-date", when(o.created_at).replace(", ", " ")), add(h("span", "mc-pp"), pill()));
    if (k === "review") add(act, h("span", "mc-pointer", "↥ In payment review queue"));
    else { actions(o).forEach(function (b) { act.appendChild(b); }); act.appendChild(toggler(o)); }
    add(r, first, h("span", "", o.buyer_name), h("span", "mc-pay", "Bank or e-wallet transfer"), h("span", "r num", amt), add(h("span", "c"), chipsOf(o)), act);
    add(w, r);
    if (S.open[o.id] && k !== "review") add(w, add(h("div", "mc-detail"), detailGrid(o)));
    return w;
  }
  function listView(root) {
    var c = counts(), rows = shown(), sub = byId("po-sub");
    sub.hidden = false;
    sub.textContent = "Track every order from approval to delivery · " + (S.listState === "ok" ? rows.length : 0) + " under current filters";
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
    if (S.listState === "error") { root.appendChild(errBox("We could not load your orders", "Check your connection, then try again.", load)); return; }
    var queue = S.listState === "ok" ? S.rows.filter(function (o) { return keyOf(o) === "review"; }) : [];
    if (queue.length) {
      root.appendChild(add(h("div", "mc-queue-head"), h("span", "mc-queue-title", "Payment review queue"), h("span", "mc-queue-sub", "newest proof first")));
      queue.forEach(function (o) { root.appendChild(ticket(o)); });
    }
    if (!rows.length) {
      var e = h("section", "dash-card ph-card po-empty"), t = h("span", "icon-tile"); e.setAttribute("aria-labelledby", "po-empty-h"); t.setAttribute("aria-hidden", "true"); t.appendChild(icon(ICON.receipt));
      var hh = h("h2", "", S.listState === "empty" ? "No orders yet" : "No orders match this filter"); hh.setAttribute("id", "po-empty-h");
      root.appendChild(add(e, t, hh, h("p", "", S.listState === "empty" ? "Orders show here when someone buys the Membership Pack from your store." : "Clear the status filter to see every order.")));
      return;
    }
    var tb = h("div", "mc-table"), th = h("div", "mc-th");
    tb.setAttribute("role", "table"); tb.setAttribute("aria-label", "Orders"); th.setAttribute("role", "row");
    [["Order #", ""], ["Customer", ""], ["Payment", ""], ["Total", "r"], ["Status", "c"], ["Action", "c"]].forEach(function (x) { th.appendChild(h("span", x[1], x[0])); });
    add(tb, th); rows.forEach(function (o) { tb.appendChild(tableRow(o)); });
    root.appendChild(tb);
  }
  function placeholder(root) {
    var sub = byId("po-sub"); sub.hidden = true; sub.textContent = "";
    var name = S.tab === "overview" ? "Overview" : "Product Orders", s = h("section", "dash-card ph-card po-empty"), t = h("span", "icon-tile"), hh = h("h2", "", name), p = h("p"), chip = h("span", "chip chip-warn", "Placeholder");
    s.setAttribute("aria-labelledby", "po-ph-h"); hh.setAttribute("id", "po-ph-h"); t.setAttribute("aria-hidden", "true"); t.appendChild(icon(ICON.receipt));
    root.appendChild(add(s, t, hh, add(p, chip), h("p", "", "This tab is a placeholder. Its content has not been designed yet.")));
  }
  function render() {
    var root = byId("po-body"); if (!root) return;
    clear(root); root.removeAttribute("aria-busy");
    if (S.tab !== "pack") placeholder(root); else listView(root);
    Array.prototype.forEach.call(byId("orders-tabs").querySelectorAll("a"), function (a) {
      if (a.getAttribute("data-tab") === S.tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }
  var wired = false;
  function tabsInit() {
    if (wired) return; wired = true;
    Array.prototype.forEach.call(byId("orders-tabs").querySelectorAll("a"), function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); S.tab = a.getAttribute("data-tab"); S.filter = null; S.open = {}; render(); });
    });
  }

  /* ---- the reject dialog: reason, then a confirm step (the one task-required addition to TWCinc's flow) ---- */
  function rejectDialog(id, opener) {
    var o = find(id); if (!o) return;
    if (closeDlg) closeDlg(false);
    var slot = byId("po-dlg-slot"), overlay = h("div", "po-overlay"), dlg = h("div", "po-dialog"), st = { step: 1, reason: "", text: "", err: "", stale: false };
    dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "po-dh");
    function close(returnFocus) {
      if (closeDlg !== close) return;
      closeDlg = null; document.removeEventListener("keydown", onKey); clear(slot); S.dlg = null; document.body.style.overflow = "";
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
    function paint(focusSel) {
      clear(dlg);
      var title = h("h2", "", "Reject order " + o.order_number); title.setAttribute("id", "po-dh"); add(title, add(h("span", "mc-mpp"), pill())); dlg.appendChild(title);
      if (st.step === 1) {
        var fs = h("fieldset", "po-reasons"); fs.appendChild(h("legend", "", "Reason for rejection"));
        REASONS.forEach(function (r) {
          var lab = h("label"), inp = D.el("input", { type: "radio", name: "po-reason", value: r[0] });
          inp.checked = st.reason === r[0];
          inp.addEventListener("change", function () { st.reason = r[0]; st.err = ""; paint("radio"); });
          add(lab, inp, h("span", "", reasonLabel(r[0], o))); fs.appendChild(lab);
        });
        dlg.appendChild(fs);
        if (st.reason === "other") {
          var w = h("div", "po-other"), lab2 = h("label", "", "Explanation (required for Other)"), ta = D.el("textarea", { id: "po-other", maxlength: "500", rows: "3", "class": st.err === "text" ? "is-bad" : "" }), cnt = h("div", "po-count", st.text.length + " of 500");
          lab2.setAttribute("for", "po-other"); ta.value = st.text;
          ta.addEventListener("input", function () { st.text = ta.value; cnt.textContent = st.text.length + " of 500"; });
          add(w, lab2, ta, cnt); dlg.appendChild(w);
        }
        if (st.err === "text") { var e1 = h("p", "po-error", "Explain the reason."); e1.setAttribute("role", "alert"); dlg.appendChild(e1); }
        if (st.err === "reason") { var e2 = h("p", "po-error", "Choose a reason."); e2.setAttribute("role", "alert"); dlg.appendChild(e2); }
        add(dlg, add(h("div", "po-actions"), btn("Cancel", "no-btn-ghost", function () { close(true); }), btn("Continue", "no-btn-primary", function () {
          if (!st.reason) st.err = "reason"; else if (st.reason === "other" && !st.text.trim()) st.err = "text"; else { st.err = ""; st.step = 2; }
          paint(st.step === 2 ? "back" : "radio");
        })));
      } else {
        var rows = [["Order", o.order_number], ["Customer", o.buyer_name], ["Reason", reasonLabel(st.reason, o)]];
        if (st.reason === "other") rows.push(["Explanation", st.text.trim()]);
        var p = h("p", "", "The buyer is told their payment for order " + o.order_number + " needs attention. They see your reason when they sign in and can send a new proof.");
        p.style.marginTop = "14px"; add(dlg, facts(rows), p);
        if (st.stale) { var e3 = h("p", "po-error", STALE); e3.setAttribute("role", "alert"); dlg.appendChild(e3); }
        var go = btn("Confirm Reject", "no-btn-ghost po-btn-danger", function () {
          var body = { reason_code: st.reason }; if (st.reason === "other") body.other_text = st.text.trim();
          go.setAttribute("aria-busy", "true");
          var run = decide(id, "reject", body, function () { st.stale = true; });
          Promise.resolve(run).then(function () { if (closeDlg === close && st.stale) paint("back"); });
        });
        add(dlg, add(h("div", "po-actions"), btn("Back", "no-btn-ghost", function () { st.step = 1; st.stale = false; paint("radio"); }), go));
      }
      var f = focusSel === "back" ? dlg.querySelector("button") : (dlg.querySelector("input") || dlg.querySelector("button"));
      if (f && f.focus) f.focus();
    }
    closeDlg = close; S.dlg = true;
    add(slot, add(overlay, dlg)); document.addEventListener("keydown", onKey); document.body.style.overflow = "hidden";
    paint("radio");
  }

  window.NOPackOrders = { show: show, hide: hide };
})();
