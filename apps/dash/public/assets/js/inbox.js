/* Inbox (/inbox/, ClickUp z8uq9md3n6, G2 Unified Inbox, frontend F1): one list of the customers who wrote to the owner's Facebook
   page through Pancake, a thread view and a human reply. Built to the approved mockups (b1 to b3 list, c1 to c3 thread).
   Reads GET /sites/{id}/inquiries/conversations/?cursor=, GET .../conversations/{ref}/?cursor= and sends
   POST .../conversations/{ref}/reply/ {text, idempotency_key}. The server reads Pancake and checks the reply window; the
   browser only shows what it is told. A customer's name and message reach the page through textContent only. No page
   token is ever read here, and nothing is stored in the browser: a draft lives in memory until the page is left.
   While the API answers 404 (the INQUIRIES_ENABLED switch is off, or not a Santé site) the page says so and the Inbox
   links stay hidden. The reply-until time shows only when the thread carries reply.expires_at, and the "Reply time
   ended" chip on a list row only when that row says reply_open is false. NOInbox.util holds the pure helpers
   (tests/inbox.test.mjs). Plain ES5. */
(function () {
  var D = window.NODash;
  var TZ = "Asia/Manila", MAX = 2000;
  var token = 0, tload = 0;
  var S = null; /* the screen's state; null while the page is not open */

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(text) { var l = byId("ib-live"); if (l) l.textContent = text; }
  function msgOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function codeOf(res) { return res && res.data && typeof res.data.code === "string" ? res.data.code : ""; }
  function base() { return "/sites/" + S.site + "/inquiries/"; }
  function icon(d, cls) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ["viewBox:0 0 24 24", "fill:none", "stroke:currentColor", "stroke-width:2", "stroke-linecap:round", "stroke-linejoin:round", "aria-hidden:true", "focusable:false"].forEach(function (kv) {
      var i = kv.indexOf(":"); s.setAttribute(kv.slice(0, i), kv.slice(i + 1));
    });
    if (cls) s.setAttribute("class", cls);
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); s.appendChild(p);
    return s;
  }
  var ICON = {
    chat: "M4 5h16v11H9l-5 4z",
    warn: "M12 3l10 18H2zM12 10v5M12 18h.01",
    refresh: "M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4",
    back: "M15 6l-6 6 6 6",
    open: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
  };
  function btn(label, kind, fn, iconPath) {
    var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost"));
    b.setAttribute("type", "button");
    if (iconPath) b.appendChild(icon(iconPath));
    b.appendChild(document.createTextNode(label));
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function busy(b, on) { if (!b) return; if (on) { b.setAttribute("aria-busy", "true"); b.disabled = true; } else { b.removeAttribute("aria-busy"); b.disabled = false; } }

  /* ---------- pure helpers ---------- */

  function validDate(iso) { if (!iso) return null; var d = new Date(iso); return isNaN(d.getTime()) ? null : d; }
  /* The calendar day in Manila as "2026-11-14". */
  function dayKey(d) { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
  function clock(d) { return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(d); }
  function monthDay(d, withYear) {
    var o = { timeZone: TZ, month: "short", day: "numeric" };
    if (withYear) o.year = "numeric";
    return new Intl.DateTimeFormat("en-US", o).format(d);
  }
  function yearOf(d) { return new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric" }).format(d); }
  function shift(now, days) { return new Date(now.getTime() + days * 86400000); }
  /* Which day an instant falls on, as a word: today, yesterday, tomorrow, or null. */
  function relDay(d, now) {
    var k = dayKey(d);
    if (k === dayKey(now)) return "today";
    if (k === dayKey(shift(now, -1))) return "yesterday";
    if (k === dayKey(shift(now, 1))) return "tomorrow";
    return null;
  }
  /* A list row's time: "10:38 AM" today, "Yesterday", the weekday within the last week, else "Nov 8". */
  function listTime(iso, now) {
    var d = validDate(iso); if (!d) return "";
    var rel = relDay(d, now);
    if (rel === "today") return clock(d);
    if (rel === "yesterday") return "Yesterday";
    var age = now.getTime() - d.getTime();
    if (age > 0 && age < 6 * 86400000) return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
    return monthDay(d, yearOf(d) !== yearOf(now));
  }
  /* A day heading in a thread: "Today", "Yesterday", "Nov 12". */
  function dayLabel(iso, now) {
    var d = validDate(iso); if (!d) return "";
    var rel = relDay(d, now);
    if (rel) return rel.charAt(0).toUpperCase() + rel.slice(1);
    return monthDay(d, yearOf(d) !== yearOf(now));
  }
  /* "today, 10:42 AM", "tomorrow, 10:38 AM", "Nov 12, 3:05 PM". */
  function whenText(iso, now) {
    var d = validDate(iso); if (!d) return "";
    var rel = relDay(d, now);
    return (rel || monthDay(d, yearOf(d) !== yearOf(now))) + ", " + clock(d);
  }
  function initialsOf(name) {
    var w = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!w.length) return "?";
    var a = Array.from(w[0])[0], b = w.length > 1 ? Array.from(w[w.length - 1])[0] : "";
    return (a + b).toUpperCase();
  }
  function nameOf(name) { var t = String(name || "").trim(); return t || "Customer"; }
  /* Oldest first. Pancake's own order is not relied on; if any message has no time the order given is kept. */
  function ordered(messages) {
    var rows = messages.map(function (m, i) { var d = validDate(m.at); return { m: m, i: i, t: d ? d.getTime() : null }; });
    if (rows.some(function (r) { return r.t === null; })) return messages.slice();
    rows.sort(function (a, b) { return a.t - b.t || a.i - b.i; });
    return rows.map(function (r) { return r.m; });
  }
  function attachmentLine(types) {
    return types.map(function (t) { return t === "image" || t === "photo" ? "[Photo]" : "[Attachment]"; }).join(" ");
  }
  function bubbleText(m) {
    var parts = [];
    if (m.text) parts.push(m.text);
    if (m.attachments && m.attachments.length) parts.push(attachmentLine(m.attachments));
    return parts.join("\n") || "[Message]";
  }
  /* An idempotency key the API accepts: letters, digits, "_" and "-", 8 to 64 of them. */
  function newKey() {
    var out = "r";
    try {
      var bytes = new Uint8Array(18);
      window.crypto.getRandomValues(bytes);
      for (var i = 0; i < bytes.length; i++) out += (bytes[i] + 256).toString(16).slice(1);
    } catch (e) {
      out += Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    }
    return out.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  }
  var REASON = {
    provider_down: "Pancake did not answer",
    rate_limited: "Pancake is busy right now",
    invalid_credentials: "Pancake did not accept the token",
    expired_credentials: "Pancake did not accept the token",
    forbidden_page: "The token cannot reach this page",
    not_found: "Pancake could not find this conversation",
    bad_response: "Pancake sent an answer we could not read"
  };
  function reasonOf(code) { return Object.prototype.hasOwnProperty.call(REASON, code) ? REASON[code] : "Pancake could not send it"; }
  /* What a failed read means for the screen, from the API's status and error code. */
  function failure(res) {
    var st = res && res.status, code = codeOf(res);
    if (st === 404) return { kind: "gone" };
    if (st === 409 && code === "not_connected") return { kind: "connect" };
    if (st === 409) return { kind: "reconnect", message: msgOf(res, "Pancake did not accept the saved token. Save a new one.") };
    if (st === 403) return { kind: "limited", message: msgOf(res, "This part of your account is not open right now.") };
    if (st === 429) return { kind: "busy", message: msgOf(res, "Too many requests to Pancake. Please wait a moment and try again.") };
    return { kind: "down" };
  }

  /* ---------- state ---------- */

  function fresh() {
    return { site: null, state: "loading", fail: null, items: [], next: null, updated: null, more: false,
      sel: null, selName: "", thread: null, tstate: "", tfail: null, drafts: {}, local: [], notice: null, key: null, sending: false, olderBusy: false };
  }
  function reveal(on) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-inbox-nav]"), function (n) { n.hidden = !on; });
  }
  function withSite(then, mine) {
    if (S.site) { then(); return; }
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!sites.length) { S.state = "failed"; S.fail = { kind: res.ok ? "gone" : "down" }; redraw(); return; }
      S.site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      then();
    });
  }

  /* The nav links stay hidden until the API shows the inbox is open for this site (a 404 means the switch is off). */
  function probe() {
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!sites.length) return;
      var site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      D.call("GET", "/sites/" + site + "/inquiries/connection/", null, true).then(function (r) { if (r.ok) reveal(true); });
    });
  }

  function show() {
    S = fresh(); token++; tload++;
    draw();
    load(false);
  }
  function hide() {
    token++; tload++; S = null; say("");
    var root = byId("ib-root"); if (root) clear(root);
  }

  /* ---------- load ---------- */

  function load(refresh) {
    var mine = ++token;
    if (!refresh) { S.state = "loading"; S.items = []; S.next = null; redraw(); }
    withSite(function () {
      D.call("GET", base() + "conversations/", null, true).then(function (res) {
        if (mine !== token || !S || res.status === 401) return;
        if (!res.ok) { reveal404(res); S.state = "failed"; S.fail = failure(res); redraw(); return; }
        S.items = Array.isArray(res.data.items) ? res.data.items : [];
        S.next = typeof res.data.next_cursor === "string" && res.data.next_cursor ? res.data.next_cursor : null;
        S.state = S.items.length ? "ready" : "empty"; S.fail = null; S.updated = new Date();
        reveal(true);
        redraw();
        say(S.items.length ? "Conversations loaded." : "No conversations yet.");
      });
    }, mine);
  }
  function reveal404(res) { if (res.status === 404) reveal(false); }
  function loadMore(b) {
    if (!S.next) return;
    var mine = token; busy(b, true);
    D.call("GET", base() + "conversations/?cursor=" + encodeURIComponent(S.next), null, true).then(function (res) {
      if (mine !== token || !S || res.status === 401) return;
      busy(b, false);
      if (!res.ok) { D.toast("That did not work", msgOf(res, "We could not load more conversations. Please try again."), "error"); return; }
      var seen = {}; S.items.forEach(function (i) { seen[i.ref] = true; });
      (Array.isArray(res.data.items) ? res.data.items : []).forEach(function (i) { if (!seen[i.ref]) S.items.push(i); });
      S.next = typeof res.data.next_cursor === "string" && res.data.next_cursor ? res.data.next_cursor : null;
      drawList();
    });
  }
  function openThread(ref, name) {
    if (S.sel === ref && S.tstate === "ready") return;
    S.sel = ref; S.selName = name || ""; S.thread = null; S.tstate = "loading"; S.tfail = null; S.local = []; S.notice = null; S.key = null;
    drawList(); drawThread();
    fetchThread(false);
    var back = byId("ib-back"); if (back) back.focus();
  }
  function fetchThread(silent) {
    var mine = ++tload, ref = S.sel;
    D.call("GET", base() + "conversations/" + encodeURIComponent(ref) + "/", null, true).then(function (res) {
      if (mine !== tload || !S || res.status === 401) return;
      if (!res.ok) {
        if (silent && S.thread) { D.toast("That did not work", msgOf(res, "We could not refresh this conversation."), "error"); return; }
        S.tstate = "failed"; S.tfail = failure(res); drawThread(); return;
      }
      S.thread = res.data; S.tstate = "ready"; S.tfail = null;
      S.local = S.local.filter(function (l) { return l.state !== "sent"; }); /* Pancake's own thread now holds what was sent */
      drawThread();
    });
  }
  function loadOlder(b) {
    var t = S.thread; if (!t || !t.next_cursor || S.olderBusy) return;
    var mine = tload, ref = S.sel; S.olderBusy = true; busy(b, true);
    D.call("GET", base() + "conversations/" + encodeURIComponent(ref) + "/?cursor=" + encodeURIComponent(t.next_cursor), null, true).then(function (res) {
      S.olderBusy = false;
      if (mine !== tload || !S || res.status === 401) return;
      busy(b, false);
      if (!res.ok) { D.toast("That did not work", msgOf(res, "We could not load earlier messages. Please try again."), "error"); return; }
      var seen = {}; t.messages.forEach(function (m) { seen[m.id] = true; });
      var older = (Array.isArray(res.data.messages) ? res.data.messages : []).filter(function (m) { return !seen[m.id]; });
      t.messages = older.concat(t.messages);
      t.next_cursor = typeof res.data.next_cursor === "string" && res.data.next_cursor ? res.data.next_cursor : null;
      drawThread();
    });
  }
  function refreshAll(b) {
    busy(b, true);
    load(true);
    if (S.sel) fetchThread(true);
    setTimeout(function () { busy(b, false); }, 600);
  }

  /* ---------- reply ---------- */

  /* The box is kept per conversation, in memory only. */
  function draftOf() { return S.sel && Object.prototype.hasOwnProperty.call(S.drafts, S.sel) ? S.drafts[S.sel] : ""; }
  function send(b, box) {
    if (S.sending) return;
    var text = box.value.trim();
    if (!text || text.length > MAX) return;
    var mine = tload, ref = S.sel, key = S.key || newKey();
    var st = S; S.key = key; S.sending = true; busy(b, true);
    D.call("POST", base() + "conversations/" + encodeURIComponent(ref) + "/reply/", { text: text, idempotency_key: key }, true).then(function (res) {
      st.sending = false;
      if (res.status === 401) return;
      if (S !== st || mine !== tload || S.sel !== ref) return; /* another conversation was opened meanwhile; the API has the record */
      S.local = S.local.filter(function (l) { return l.state !== "failed"; });
      if (!res.ok) {
        if (res.status !== 0) S.key = null; /* a reply the API never saw can use a new key; a lost answer keeps the old one so nothing goes twice */
        S.notice = res.status === 0
          ? "We could not confirm it was sent. Press Try again: it will not be sent twice."
          : msgOf(res, "The reply could not be sent.") + " Nothing reached the customer.";
        drawThread(true); return;
      }
      S.key = null;
      var state = res.data && res.data.state, at = res.data && res.data.created_at;
      if (state === "sent") {
        S.local.push({ text: text, at: at, state: "sent" });
        S.drafts[ref] = ""; S.notice = null; say("Reply sent.");
      } else if (state === "blocked_window") {
        if (S.thread) S.thread.reply = { open: false, reason: "provider_closed" };
        S.notice = null; say("This conversation can no longer be answered here.");
      } else if (state === "sending") {
        S.notice = "Your reply is still being sent. Refresh in a moment to see it.";
      } else {
        var why = reasonOf(res.data && res.data.error_code);
        S.local.push({ text: text, at: at, state: "failed", why: why });
        S.notice = why + ". Nothing reached the customer.";
        S.drafts[ref] = text;
      }
      drawThread(true);
    });
  }

  /* ---------- draw ---------- */

  function draw() {
    var root = clear(byId("ib-root"));
    var wrap = h("div", "ib-wrap"); wrap.setAttribute("id", "ib-wrap");
    root.appendChild(wrap);
    drawBody();
  }
  function singlePane() {
    var f = S.fail;
    return S.state === "failed" && !!f && (f.kind === "gone" || f.kind === "connect" || f.kind === "reconnect" || f.kind === "limited");
  }
  /* After a list read: redraw only the list when the two panes are up, the whole body when the layout changes. */
  function redraw() { if (byId("ib-listbody") && !singlePane()) { drawList(); drawUpdated(); } else drawBody(); }
  function drawUpdated() {
    var u = byId("ib-upd"), box = byId("ib-refresh");
    if (!u || !box || !S) return;
    var f = S.fail, soft = S.state === "failed" && !!f && (f.kind === "down" || f.kind === "busy");
    box.hidden = !(S.state === "ready" || S.state === "empty" || soft);
    u.textContent = S.updated && !box.hidden ? (soft ? "Last updated " : "Updated ") + whenText(S.updated.toISOString(), new Date()) : "";
  }
  function stateBox(iconPath, title, text, actions, err) {
    var box = h("div", "ib-state" + (err ? " ib-err" : "")); if (err) box.setAttribute("role", "alert");
    var tile = h("span", err ? "ib-tile ib-tile-err" : "icon-tile ib-tile"); tile.setAttribute("aria-hidden", "true"); tile.appendChild(icon(iconPath));
    add(box, tile, h("h2", "", title), h("p", "", text));
    if (actions && actions.length) { var a = h("div", "ib-actions"); actions.forEach(function (x) { a.appendChild(x); }); box.appendChild(a); }
    return box;
  }
  function settingsLink(label, kind) {
    var a = h("a", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost"), label);
    a.setAttribute("href", "/settings/inbox/");
    return a;
  }
  function pane(label, cls) { var p = h("section", "ib-pane " + cls); p.setAttribute("aria-label", label); return p; }

  function drawBody() {
    var wrap = byId("ib-wrap"); if (!wrap || !S) return;
    clear(wrap);
    drawUpdated();
    var f = S.fail;
    if (singlePane()) {
      var one = pane("Inbox", ""), pb = h("div", "ib-pane-head"); pb.appendChild(h("h2", "ib-h", "Conversations"));
      add(one, pb);
      if (f.kind === "gone") one.appendChild(stateBox(ICON.chat, "The inbox is not available yet", "It is not open for this site right now. Nothing is wrong with your account."));
      else if (f.kind === "connect") one.appendChild(stateBox(ICON.chat, "Connect your Pancake page", "Add your Pancake page ID and token in Settings to read and answer your customers' Messenger messages here.", [settingsLink("Open inbox settings", "primary")]));
      else if (f.kind === "reconnect") one.appendChild(stateBox(ICON.warn, "Your inbox is paused", f.message, [settingsLink("Open inbox settings", "primary")], true));
      else one.appendChild(stateBox(ICON.warn, "The inbox is not open for you", f.message, null, true));
      wrap.appendChild(one); return;
    }
    var split = h("div", "ib-split");
    add(split, listPane(), threadPane());
    wrap.appendChild(split);
    if (S.sel) drawThread();
  }
  function listPane() {
    var p = pane("Conversations", "ib-listpane" + (S.sel ? " is-hide-phone" : "")); p.setAttribute("id", "ib-listpane");
    var head = h("div", "ib-pane-head"); head.appendChild(h("h2", "ib-h", "Conversations")); p.appendChild(head);
    var body = h("div", "ib-listbody"); body.setAttribute("id", "ib-listbody"); p.appendChild(body);
    fillList(body);
    return p;
  }
  function fillList(body) {
    clear(body);
    if (S.state === "loading") { body.appendChild(h("p", "pm-meta ib-loading", "Loading your conversations…")); return; }
    if (S.state === "empty") { body.appendChild(stateBox(ICON.chat, "No messages yet", "When a customer messages your Facebook page, the conversation will show up here. Press Refresh to check again.")); return; }
    if (S.state === "failed") {
      var f = S.fail || { kind: "down" }, busyNow = f.kind === "busy";
      body.appendChild(stateBox(ICON.warn, busyNow ? "Pancake is busy" : "We couldn't reach Pancake",
        busyNow ? f.message : "Your messages are safe. Pancake did not answer just now. Wait a moment, then press Refresh. If it keeps happening, check your connection in Settings.",
        [btn("Try again", "primary", function (b) { busy(b, true); load(false); }, ICON.refresh), (function () { var a = h("a", "no-btn no-btn-ghost", "Check connection"); a.setAttribute("href", "/settings/inbox/"); return a; })()], true));
      return;
    }
    var ul = h("ul", "ib-list"); ul.setAttribute("id", "ib-list");
    var now = new Date();
    S.items.forEach(function (it) {
      var li = h("li", ""), sel = S.sel === it.ref;
      var b = h("button", "ib-item" + (sel ? " is-sel" : "")); b.setAttribute("type", "button");
      if (sel) b.setAttribute("aria-current", "true");
      var av = h("span", "ib-av", initialsOf(it.display_name)); av.setAttribute("aria-hidden", "true");
      var text = h("span", "ib-it"), top = h("span", "ib-top");
      add(top, h("span", "ib-name", nameOf(it.display_name)), h("span", "ib-time", listTime(it.updated_at, now)));
      add(text, top, h("span", "ib-snip", it.snippet || ""));
      if (it.reply_open === false) text.appendChild(h("span", "chip chip-neutral ib-mini", "Reply time ended"));
      add(b, av, text);
      b.addEventListener("click", function () { openThread(it.ref, nameOf(it.display_name)); });
      li.appendChild(b); ul.appendChild(li);
    });
    body.appendChild(ul);
    if (S.next) { var more = btn("Show more conversations", "ghost", loadMore); more.classList.add("ib-more"); body.appendChild(more); }
  }
  function drawList() {
    var body = byId("ib-listbody"), p = byId("ib-listpane");
    if (!body || !S) return;
    fillList(body);
    if (p) { if (S.sel) p.classList.add("is-hide-phone"); else p.classList.remove("is-hide-phone"); }
    var t = byId("ib-threadpane");
    if (t) { if (S.sel) t.classList.remove("is-hide-phone"); else t.classList.add("is-hide-phone"); }
  }
  function threadPane() {
    var p = pane(S.sel ? "Conversation with " + (S.selName || "customer") : "Conversation", "ib-threadpane" + (S.sel ? "" : " is-hide-phone"));
    p.setAttribute("id", "ib-threadpane");
    if (!S.sel) p.appendChild(stateBox(ICON.chat, "Choose a conversation", "Pick a customer on the left to read the messages and reply."));
    return p;
  }

  function threadHead(name, chip, url) {
    var head = h("div", "ib-thead");
    var back = h("button", "ib-back"); back.setAttribute("type", "button"); back.setAttribute("id", "ib-back");
    back.appendChild(icon(ICON.back)); back.appendChild(h("span", "", "Inbox"));
    back.addEventListener("click", function () { S.sel = null; S.thread = null; S.tstate = ""; tload++; drawList(); var t = byId("ib-threadpane"); if (t) { clear(t); t.setAttribute("aria-label", "Conversation"); t.appendChild(stateBox(ICON.chat, "Choose a conversation", "Pick a customer on the left to read the messages and reply.")); } });
    var av = h("span", "ib-av", initialsOf(name)); av.setAttribute("aria-hidden", "true");
    var nm = h("div", "ib-tname"); nm.appendChild(h("h2", "", nameOf(name))); if (chip) nm.appendChild(chip);
    add(head, back, av, nm);
    if (url) head.appendChild(providerLink(url, "no-btn no-btn-ghost ib-open"));
    return head;
  }
  function providerLink(url, cls) {
    var a = h("a", cls, "Open in Pancake");
    a.setAttribute("href", url); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer");
    a.appendChild(icon(ICON.open));
    return a;
  }
  function safeUrl(u) { return typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : ""; }

  function drawThread(focusBox) {
    var p = byId("ib-threadpane"); if (!p || !S || !S.sel) return;
    clear(p);
    var t = S.thread;
    p.setAttribute("aria-label", "Conversation with " + (t && t.display_name ? t.display_name : S.selName || "customer"));
    p.classList.remove("is-hide-phone");
    if (S.tstate === "loading" || !t) {
      p.appendChild(threadHead(S.selName, null, ""));
      if (S.tstate === "failed") {
        var f = S.tfail || { kind: "down" }, text = f.kind === "gone" ? "This conversation is no longer available." : f.kind === "down" ? "Pancake did not answer just now. Wait a moment, then try again." : f.message || "Please try again.";
        p.appendChild(stateBox(ICON.warn, "We couldn't open this conversation", text, [btn("Try again", "primary", function (b) { busy(b, true); S.tstate = "loading"; drawThread(); fetchThread(false); }, ICON.refresh)], true));
      } else p.appendChild(h("p", "pm-meta ib-loading", "Opening the conversation…"));
      return;
    }
    var name = nameOf(t.display_name || S.selName), now = new Date(), url = safeUrl(t.provider_url);
    var open = !!(t.reply && t.reply.open), until = open && t.reply && t.reply.expires_at ? whenText(t.reply.expires_at, now) : "";
    var chip = open ? (until ? h("span", "chip chip-info", "You can reply until " + until) : null) : h("span", "chip chip-neutral", "Reply time ended");
    p.appendChild(threadHead(name, chip, open ? url : ""));
    /* messages */
    var msgs = h("div", "ib-msgs"); msgs.setAttribute("tabindex", "0"); msgs.setAttribute("aria-label", "Messages");
    if (t.next_cursor) { var older = btn("Show earlier messages", "ghost", loadOlder); older.classList.add("ib-more"); older.setAttribute("style", "align-self:center"); msgs.appendChild(older); }
    var list = ordered(Array.isArray(t.messages) ? t.messages : []).map(function (m) { return { out: m.direction === "out", text: bubbleText(m), at: m.at }; });
    list = list.concat(S.local.map(function (l) { return { out: true, text: l.text, at: l.at, state: l.state, why: l.why }; }));
    var lastDay = "";
    list.forEach(function (m) {
      var d = validDate(m.at), key = d ? dayKey(d) : "";
      if (key && key !== lastDay) { lastDay = key; msgs.appendChild(h("div", "ib-day", dayLabel(m.at, now))); }
      var row = h("div", "ib-msg " + (m.out ? "ib-msg-out" : "ib-msg-in"));
      var meta = h("span", "ib-meta", d ? clock(d) : "");
      if (m.state === "sent") meta.appendChild(h("span", "chip chip-ok ib-mini", "Sent"));
      if (m.state === "failed") meta.appendChild(h("span", "chip chip-danger ib-mini", "Failed: " + m.why));
      add(row, h("p", "ib-bub", m.text), meta);
      msgs.appendChild(row);
    });
    if (!list.length) msgs.appendChild(h("p", "pm-meta", "No messages to show."));
    p.appendChild(msgs);
    p.appendChild(replyBox(name, open, url, focusBox));
    msgs.scrollTop = msgs.scrollHeight;
  }
  function replyBox(name, open, url, focusBox) {
    var wrap = h("div", "ib-reply" + (open ? "" : " is-closed"));
    var lab = h("label", "pm-label sr-only", open ? "Reply to " + name : "Reply"); lab.setAttribute("for", "ib-rb");
    var ta = h("textarea", "pm-input ib-ta"); ta.setAttribute("id", "ib-rb"); ta.setAttribute("rows", open ? "3" : "2"); ta.setAttribute("aria-describedby", "ib-rc");
    var count = h("span", "ib-count", "0 / " + MAX); count.setAttribute("id", "ib-rc");
    var foot = h("div", "ib-rfoot");
    if (!open) {
      var t1 = h("p", "ib-closed-t"); add(t1, h("strong", "", "You can't reply here anymore."), document.createTextNode(" Facebook only allows a reply for a limited time after the customer's last message, and that time has ended."));
      add(wrap, t1, h("p", "ib-closed-s", "You can still answer this customer in Pancake."));
      if (url) { var acts = h("div", "pm-actions"); acts.appendChild(providerLink(url, "no-btn no-btn-primary")); wrap.appendChild(acts); }
      ta.disabled = true; ta.setAttribute("placeholder", "Replying is closed for this conversation");
      var sendOff = btn("Send", "primary"); sendOff.disabled = true;
      add(wrap, lab, ta, add(foot, count, sendOff));
      return wrap;
    }
    if (S.notice) {
      var fail = h("div", "ib-fail"); fail.setAttribute("role", "alert"); fail.appendChild(icon(ICON.warn));
      var body = h("div", ""); add(body, h("strong", "", "Your reply was not sent."), document.createTextNode(" " + S.notice + " Your text is still in the box. Press Try again to send it again."));
      fail.appendChild(body); wrap.appendChild(fail);
    }
    ta.setAttribute("maxlength", String(MAX));
    ta.value = draftOf();
    var go = btn(S.notice ? "Try again" : "Send", "primary", function (b) { send(b, ta); });
    function sync() {
      S.drafts[S.sel] = ta.value;
      count.textContent = ta.value.length + " / " + MAX;
      go.disabled = !ta.value.trim() || S.sending;
    }
    ta.addEventListener("input", sync);
    add(wrap, lab, ta, add(foot, count, go));
    sync();
    if (focusBox) setTimeout(function () { ta.focus(); }, 0);
    return wrap;
  }

  /* The Refresh button belongs to the page header in index.html. */
  (function wire() {
    var b = byId("ib-refresh-btn");
    if (b) b.addEventListener("click", function () { if (S) refreshAll(b); });
  })();

  window.NOInbox = { show: show, hide: hide, probe: probe,
    util: { dayKey: dayKey, listTime: listTime, dayLabel: dayLabel, whenText: whenText, initialsOf: initialsOf, ordered: ordered, bubbleText: bubbleText,
      newKey: newKey, reasonOf: reasonOf, failure: failure } };
})();
