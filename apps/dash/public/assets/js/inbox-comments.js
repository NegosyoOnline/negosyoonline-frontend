/* Inbox > Comments (ClickUp z8uq9mg9ph, COMMENTS C3 FE). The "Comments" view next to the conversations: the comments on the connected
   Facebook Page's posts and ads, a detail with a public reply, "Message privately" (one private reply per comment, within 7 days) and
   Hide. Built on the C1 contract (backend docs/contracts/comments-api-c1.md), owner routes under /sites/{id}/inquiries/comments/:
   GET status/, GET ?scope=&answered=&q=&cursor= (items, next_cursor, unread_total), GET {ref}/, POST {ref}/read/, {ref}/reply/,
   {ref}/private-reply/ (body {text, idempotency_key}) and {ref}/hide/. A 404 from status/ means the comments switch is off: the tab
   never shows. Every name, comment and caption reaches the page through textContent only; the post link is used only when it is a
   facebook.com https address; nothing is stored in the browser (a draft lives in memory until the page is left). The row look, the
   toolbar and the house dropdown (NOInbox.combo) are the Inbox's own. Plain ES5. inbox.js calls probe() and start(), and the tabs call
   open() and close(). */
(function () {
  var D = window.NODash, IB = window.NOInbox, U = IB && IB.util;
  if (!D || !IB || !U) return;
  var MAX = { public: 500, private: 1000 }, EVERY = 60000;
  var C = null; /* the view's state; null until start() */

  /* ---------- the words ----------
     Approved by the Supervisor (2026-11-18): the labels of Coach Ed's plan and the texts below. All of them live in this block. */
  var T = {
    title: "Comments", ad: "Ad", answered: "Answered", unanswered: "Unanswered", hidden: "Hidden",
    reply: "Reply", priv: "Message privately", hide: "Hide", send: "Send", cancel: "Cancel",
    search: "Name, comment or post", more: "Show more comments",
    loading: "Loading your comments…", opening: "Opening the comment…",
    emptyTitle: "No comments yet.", failTitle: "Comments could not be loaded. Try Refresh.",
    none: "No comments match.", pickTitle: "Choose a comment", pickText: "Pick a comment on the left to read it and reply.",
    gone: "This comment is no longer available.", reopenFail: "We could not load this comment just now. Wait a moment, then try again.",
    notSent: "Your reply was not sent.", keepText: " Your text is still in the box.",
    net: "We could not confirm it was sent. Press Try again: it will not be sent twice.",
    sent: "Reply sent.", hid: "Comment hidden.", post: "Post", on: "On",
    confirmHide: "Hide this comment on Facebook? You cannot unhide it from here."
  };
  /* The fixed reason texts of a disabled action (the contract's `reason` codes), and of a send that did not go. Never Meta's words. */
  var REASON = {
    not_connected: "Connect your Facebook Page to reply.",
    reconnect: "Reconnect your Facebook Page to reply.",
    permission_missing: "Turn on comments for your Page to reply.",
    removed: "This comment was deleted on Facebook.",
    own_comment: "This is your Page's own comment.",
    window_closed: "Private reply is only possible within 7 days of the comment.",
    already_sent: "A private message was already sent for this comment.",
    already_hidden: ""
  };
  var LIMIT = "Facebook is limiting replies right now. Try again in a few minutes.", DOWN = "Facebook did not answer. Try again.";
  var FAIL = {
    token_invalid: REASON.reconnect, forbidden_page: REASON.permission_missing, comment_removed: REASON.removed, not_found: REASON.removed,
    rate_limited: LIMIT, blocked_rate: LIMIT, provider_down: DOWN, bad_response: DOWN
  };
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function reasonText(code) { return has(REASON, code) ? REASON[code] : ""; }
  function known(code) { return has(FAIL, code) || (has(REASON, code) && !!REASON[code]); }
  function failTextOf(code) { return has(FAIL, code) ? FAIL[code] : has(REASON, code) && REASON[code] ? REASON[code] : DOWN; }

  /* ---------- small helpers ---------- */

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(text) { var l = byId("ib-live"); if (l) l.textContent = text; }
  function msgOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function codeOf(res) { return res && res.data && typeof res.data.code === "string" ? res.data.code : ""; }
  function busy(b, on) { if (!b) return; if (on) { b.setAttribute("aria-busy", "true"); b.disabled = true; } else { b.removeAttribute("aria-busy"); b.disabled = false; } }
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
    mail: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 7l9 6 9-6",
    mailOpen: "M3 10l9-6 9 6v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10l9 6 9-6",
    x: "M6 6l12 12M18 6L6 18",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3"
  };
  function btn(label, kind, fn) {
    var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost")); b.setAttribute("type", "button");
    b.appendChild(document.createTextNode(label));
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function base() { return "/sites/" + C.site + "/inquiries/comments/"; }
  function nameOf(x) { var t = String(x || "").trim(); return t || "Facebook user"; }
  function sigOf(x) { try { return JSON.stringify(x); } catch (e) { return ""; } }
  function failure(res) { var st = res && res.status; return st === 404 ? { kind: "gone" } : { kind: "down" }; }

  /* ---------- pure helpers (tests/inbox-comments.test.mjs) ---------- */

  /* The list address from the filters: scope (ad/post), answered (answered/unanswered), q (2 to 80 characters) and the cursor. The
     defaults ("All posts", "All") send nothing. */
  function listQuery(f, cursor) {
    var qs = [];
    if (f.scope === "ad" || f.scope === "post") qs.push("scope=" + f.scope);
    if (f.answered === "answered" || f.answered === "unanswered") qs.push("answered=" + f.answered);
    if (f.q) qs.push("q=" + encodeURIComponent(f.q));
    if (cursor) qs.push("cursor=" + encodeURIComponent(cursor));
    return qs.length ? "?" + qs.join("&") : "";
  }
  /* A post link only when it is an https facebook.com address; else "". */
  function safeLink(url) { return typeof url === "string" && /^https:\/\/([a-z0-9-]+\.)?facebook\.com\//i.test(url) ? url : ""; }
  /* The disabled actions of a comment as [kind, text] notes, one line per distinct sentence ("already hidden" has no note: the chip says it). */
  function notesFor(c) {
    var out = [], seen = {};
    [["public", c && c.public_reply], ["private", c && c.private_reply], ["hide", c && c.hide]].forEach(function (p) {
      var a = p[1]; if (!a || a.available !== false) return;
      var t = reasonText(a.reason); if (!t || seen[t]) return;
      seen[t] = true; out.push([p[0], t]);
    });
    return out;
  }
  function availableMode(c) {
    if (c && c.public_reply && c.public_reply.available !== false) return "public";
    if (c && c.private_reply && c.private_reply.available !== false) return "private";
    return "public";
  }
  function isOn(res) { return !!res && res.ok && !!res.data && res.data.enabled !== false; }

  /* ---------- availability ---------- */

  /* GET status/: cb(true, data) when comments are open for this site (a 404 means the switch is off); anything else is "not available". */
  function probe(site, cb) {
    D.call("GET", "/sites/" + site + "/inquiries/comments/status/", null, true).then(function (res) {
      if (res.status === 401) return;
      cb(isOn(res), res.data);
    });
  }

  /* ---------- state ---------- */

  function fresh(site, host, o) {
    return { site: site, host: host, o: o || {}, on: false, state: "loading", items: [], next: null, unread: 0, extra: false, lsig: "",
      scope: "all", answered: "all", q: "", qText: "", qTimer: null, sel: null, selName: "", thread: null, tstate: "", tfail: null,
      drafts: {}, keys: {}, mode: "public", notice: null, sending: false, hiding: false, confirm: false, token: 0, tload: 0, pollT: null,
      polling: false, status: null };
  }
  function filters() { return { scope: C.scope, answered: C.answered, q: C.q }; }

  /* start(site, host, o, status): builds the view in `host` (a div) and reads the first page. o.onCount(n) gets the unread total,
     o.onDetail(open) says a comment is open (the phone layout), o.onGone() says the API answered 404 (switch turned off). */
  function start(site, host, o, status) {
    stop();
    C = fresh(site, host, o); C.status = status && typeof status === "object" ? status : null;
    shell();
    load(false);
    arm();
  }
  function stop() {
    if (C) { C.token++; C.tload++; if (C.pollT !== null) clearTimeout(C.pollT); if (C.qTimer !== null) clearTimeout(C.qTimer); }
    C = null;
  }
  function open() { if (!C) return; C.on = true; if (C.state !== "loading") load(true); pushDetail(); }
  function close() { if (!C) return; C.on = false; }
  function pushDetail() { if (C && C.o.onDetail) C.o.onDetail(!!C.sel); }

  /* ---------- load ---------- */

  function setCount(n) { if (typeof n !== "number" || !isFinite(n) || n < 0) return; C.unread = Math.floor(n); if (C.o.onCount) C.o.onCount(C.unread); }
  function gone() { var cb = C && C.o.onGone; if (cb) cb(); }
  function stateFor(items) { return items.length || C.q || C.scope !== "all" || C.answered !== "all" ? "ready" : "empty"; }
  function take(res) {
    C.items = Array.isArray(res.data.items) ? res.data.items : [];
    C.next = typeof res.data.next_cursor === "string" && res.data.next_cursor ? res.data.next_cursor : null;
    C.state = stateFor(C.items); C.extra = false; C.lsig = sigOf([C.items, C.next]);
    /* unread_total is the site's whole count and is never filtered, so every list read may feed the badge */
    setCount(res.data.unread_total);
  }
  function load(refresh) {
    var mine = ++C.token, st = C;
    if (!refresh) { C.state = "loading"; C.items = []; C.next = null; fillList(); }
    D.call("GET", base() + listQuery(filters()), null, true).then(function (res) {
      if (mine !== st.token || C !== st || res.status === 401) return;
      if (res.status === 404) { gone(); return; }
      if (!res.ok) {
        if (refresh && (C.state === "ready" || C.state === "empty")) { D.toast("That did not work", msgOf(res, "We could not refresh the comments."), "error"); return; }
        C.state = "failed"; fillList(); return;
      }
      take(res); fillList(); say(C.items.length ? "Comments loaded." : T.none);
    });
  }
  function loadMore(b) {
    if (!C.next) return;
    var st = C, mine = C.token; busy(b, true);
    D.call("GET", base() + listQuery(filters(), C.next), null, true).then(function (res) {
      if (C !== st || mine !== st.token || res.status === 401) return;
      busy(b, false);
      if (!res.ok) { D.toast("That did not work", msgOf(res, "We could not load more comments. Please try again."), "error"); return; }
      var seen = {}; C.items.forEach(function (i) { seen[i.ref] = true; });
      (Array.isArray(res.data.items) ? res.data.items : []).forEach(function (i) { if (!seen[i.ref]) C.items.push(i); });
      C.next = typeof res.data.next_cursor === "string" && res.data.next_cursor ? res.data.next_cursor : null;
      C.extra = true; C.lsig = ""; fillList();
    });
  }
  /* One quiet read every minute while the tab is visible: the count always, and the rows while the view is open. */
  function arm() {
    if (!C) return;
    if (C.pollT !== null) clearTimeout(C.pollT);
    var st = C;
    C.pollT = setTimeout(function () { st.pollT = null; if (C === st) poll(); }, EVERY);
  }
  function poll() {
    var st = C;
    if (document.hidden || st.polling) { arm(); return; }
    st.polling = true;
    var url = st.on ? listQuery(filters()) : "";
    D.call("GET", base() + url, null, true).then(function (res) {
      st.polling = false;
      if (C !== st || res.status === 401) return;
      if (res.status === 404) { gone(); return; }
      if (res.ok && res.data) {
        setCount(res.data.unread_total);
        if (st.on && !st.extra) {
          var items = Array.isArray(res.data.items) ? res.data.items : [], next = typeof res.data.next_cursor === "string" && res.data.next_cursor ? res.data.next_cursor : null;
          if (sigOf([items, next]) !== st.lsig) { st.items = items; st.next = next; st.lsig = sigOf([items, next]); st.state = stateFor(items); fillList(); }
        }
      }
      arm();
    });
  }

  /* ---------- the shell ---------- */

  function pane(label, cls) { var p = h("section", "ib-pane " + cls); p.setAttribute("aria-label", label); return p; }
  function shell() {
    var host = clear(C.host);
    var split = h("div", "ib-split"), right = h("div", "ib-rcol");
    var lp = pane(T.title, "ib-listpane" + (C.sel ? " is-hide-phone" : "")); lp.setAttribute("id", "cm-listpane");
    var head = h("div", "ib-pane-head ib-lhead"); head.appendChild(h("h2", "ib-h", T.title)); lp.appendChild(head);
    var body = h("div", "ib-listbody"); body.setAttribute("id", "cm-listbody"); lp.appendChild(body);
    var th = h("div", "ib-tools-host"); th.setAttribute("id", "cm-tools-host"); th.appendChild(toolbar());
    var dp = pane("Comment", "ib-threadpane is-hide-phone"); dp.setAttribute("id", "cm-detail");
    add(right, th, dp); add(split, lp, right); host.appendChild(split);
    fillList(); fillDetail();
  }

  /* ---------- toolbar: search, two house dropdowns, outlined Refresh ---------- */

  var SCOPES = [["all", "All posts"], ["ad", "Ads only"], ["post", "Posts only"]];
  var ANSWERS = [["all", "All"], ["unanswered", "Unanswered"], ["answered", "Answered"]];
  function toolbar() {
    var box = h("div", "ib-tools"), row = h("div", "ib-trow");
    add(row, searchBox(), field("cm-scope", "Posts", SCOPES, "scope"), field("cm-answered", "Answered", ANSWERS, "answered"), refreshButton());
    box.appendChild(row);
    return box;
  }
  /* A filter: the house dropdown showing its real default ("All posts", "All"). A change asks the API again. */
  function field(id, label, list, key) {
    var fld = h("div", "ib-fld"), lab = h("label", "pm-label sr-only", label); lab.setAttribute("for", id);
    var sel = D.el("select", { "class": "ib-input", id: id });
    list.forEach(function (f) { var op = D.el("option", { value: f[0] }, f[1]); if (f[0] === C[key]) op.selected = true; sel.appendChild(op); });
    sel.value = C[key];
    sel.addEventListener("change", function () {
      if (!C || sel.value === C[key]) return;
      var was = C[key]; C[key] = sel.value; C.sel = null; C.thread = null; pushDetail();
      apply(function () { C[key] = was; sel.value = was; if (sel.ibSync) sel.ibSync(); });
    });
    add(fld, lab, sel);
    IB.combo(sel, label);
    return fld;
  }
  /* The filters changed: one read of the first page. A failed read puts the old value back (undo). */
  function apply(undo) {
    var mine = ++C.token, st = C;
    D.call("GET", base() + listQuery(filters()), null, true).then(function (res) {
      if (mine !== st.token || C !== st || res.status === 401) return;
      if (res.status === 404) { gone(); return; }
      if (!res.ok) { D.toast("That did not work", msgOf(res, "We could not search. Please try again."), "error"); if (undo) undo(); return; }
      take(res); fillList(); fillDetail(); say(C.items.length ? "Comments loaded." : T.none);
    });
  }
  function refreshButton() {
    var b = h("button", "no-btn no-btn-ghost ib-rf"); b.setAttribute("type", "button"); b.setAttribute("id", "cm-refresh-btn");
    b.appendChild(icon(ICON.refresh)); b.appendChild(h("span", "ib-rf-t", "Refresh"));
    b.addEventListener("click", function () { if (!C) return; busy(b, true); load(true); if (C.sel) fetchThread(true); setTimeout(function () { busy(b, false); }, 600); });
    return b;
  }
  /* The Products search box: the magnifier inside, live while typing (300 ms), fewer than 2 characters is the normal list, no button. */
  function searchBox() {
    var wrap = h("div", "ib-search"), lab = h("label", "pm-label sr-only", "Search"); lab.setAttribute("for", "cm-q");
    var row = h("div", "ib-sbox ib-qs"), mag = icon(ICON.search, "ib-si");
    var inp = D.el("input", { "class": "ib-sin", id: "cm-q", type: "search", maxlength: "80", autocomplete: "off", spellcheck: "false", placeholder: T.search });
    inp.value = C.qText;
    var x = h("button", "ib-sclear"); x.setAttribute("type", "button"); x.setAttribute("aria-label", "Clear search"); x.appendChild(icon(ICON.x)); x.hidden = !C.qText;
    var st = C;
    function later() { if (st.qTimer !== null) clearTimeout(st.qTimer); st.qTimer = setTimeout(function () { st.qTimer = null; if (C === st) searchNow(); }, 300); }
    inp.addEventListener("input", function () { st.qText = inp.value; x.hidden = !inp.value; later(); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); searchNow(); }
      else if (e.key === "Escape" && inp.value) { e.preventDefault(); e.stopPropagation(); wipe(); }
    });
    function wipe() { st.qText = ""; inp.value = ""; x.hidden = true; searchNow(); try { inp.focus(); } catch (e) { /* gone */ } }
    x.addEventListener("click", wipe);
    add(row, mag, inp, x); add(wrap, lab, row);
    return wrap;
  }
  function searchNow() {
    if (!C) return;
    if (C.qTimer !== null) { clearTimeout(C.qTimer); C.qTimer = null; }
    var v = C.qText.trim(), q = v.length >= 2 ? v.slice(0, 80) : "";
    if (q === C.q) return;
    var was = C.q; C.q = q; C.sel = null; C.thread = null; pushDetail();
    apply(function () { C.q = was; });
  }

  /* ---------- the list ---------- */

  function stateBox(iconPath, title, text, actions, err) {
    var box = h("div", "ib-state" + (err ? " ib-err" : "")); if (err) box.setAttribute("role", "alert");
    var tile = h("span", err ? "ib-tile ib-tile-err" : "icon-tile ib-tile"); tile.setAttribute("aria-hidden", "true"); tile.appendChild(icon(iconPath));
    add(box, tile, h("h2", "", title), text ? h("p", "", text) : null);
    if (actions && actions.length) { var a = h("div", "ib-actions"); actions.forEach(function (x) { a.appendChild(x); }); box.appendChild(a); }
    return box;
  }
  function chip(cls, text) { return h("span", "chip " + cls + " ib-mini", text); }
  /* The ad / post line of a row and of the detail: an "Ad" badge for an ad, and the caption (a short snippet, may be empty). */
  function postLine(post) {
    var line = h("span", "cm-post");
    if (post && post.is_ad === true) line.appendChild(h("span", "ib-ch cm-ad", T.ad));
    line.appendChild(h("span", "cm-cap", post && post.caption ? post.caption : post && post.is_ad ? "" : T.post));
    return line;
  }
  function notReadyBanner() {
    var s = C.status; if (!s || s.ready !== false) return null;
    var t = reasonText(s.reason); if (!t) return null;
    var wrap = h("div", "ib-banners"), b = h("div", "ib-banner"); b.setAttribute("role", "status");
    b.appendChild(icon(ICON.warn));
    var body = h("div", "ib-bbody"); body.appendChild(h("div", "", t)); b.appendChild(body); wrap.appendChild(b);
    return wrap;
  }
  function fillList() {
    var body = byId("cm-listbody"); if (!body || !C) return;
    var top = 0, ul0 = body.querySelector ? body.querySelector(".ib-list") : null; if (ul0) top = ul0.scrollTop;
    clear(body);
    var lp = byId("cm-listpane"); if (lp) { if (C.sel) lp.classList.add("is-hide-phone"); else lp.classList.remove("is-hide-phone"); }
    var th = byId("cm-tools-host"); if (th) { if (C.sel) th.classList.add("is-hide-phone"); else th.classList.remove("is-hide-phone"); }
    if (C.state === "loading") { body.appendChild(h("p", "pm-meta ib-loading", T.loading)); return; }
    if (C.state === "failed") { body.appendChild(stateBox(ICON.warn, T.failTitle, "", null, true)); return; }
    var nr = notReadyBanner(); if (nr) body.appendChild(nr);
    if (C.state === "empty") { body.appendChild(stateBox(ICON.chat, T.emptyTitle, "")); return; }
    if (!C.items.length) {
      var none = h("p", "ib-empty-filter", C.q ? "No comments match “" + C.q + "”." : T.none); none.setAttribute("role", "status"); body.appendChild(none);
      return;
    }
    var ul = h("ul", "ib-list"); ul.setAttribute("id", "cm-list");
    var now = new Date();
    C.items.forEach(function (it) {
      var li = h("li", ""), sel = C.sel === it.ref, unread = it.unread === true;
      var b = h("button", "ib-item" + (sel ? " is-sel" : "") + (unread ? " ib-unread" : "")); b.setAttribute("type", "button");
      if (sel) b.setAttribute("aria-current", "true");
      var av = h("span", "ib-av", U.initialsOf(it.author_name)); av.setAttribute("aria-hidden", "true");
      var text = h("span", "ib-it"), topr = h("span", "ib-top"), nm = h("span", "ib-name", nameOf(it.author_name));
      var side = h("span", "ib-side"), rs = h("span", "ib-rs " + (unread ? "ib-rs-u" : "ib-rs-r"));
      rs.setAttribute("role", "img"); rs.setAttribute("aria-label", unread ? "Unread" : "Read"); rs.setAttribute("title", unread ? "Unread" : "Read");
      rs.appendChild(icon(unread ? ICON.mail : ICON.mailOpen));
      add(side, h("span", "ib-time", U.listTime(it.created_at, now)), rs);
      topr.appendChild(nm);
      var badges = h("span", "ib-badges");
      badges.appendChild(chip(it.answered === true ? "chip-ok" : "chip-neutral", it.answered === true ? T.answered : T.unanswered));
      if (it.hidden === true) badges.appendChild(chip("chip-neutral", T.hidden));
      add(text, topr, h("span", "ib-snip", it.text || ""), postLine(it.post), badges);
      add(b, av, text, side);
      b.setAttribute("data-ref", it.ref);
      b.addEventListener("click", function () { openComment(it); });
      li.appendChild(b); ul.appendChild(li);
    });
    body.appendChild(ul);
    if (top) ul.scrollTop = top;
    if (C.next) { var more = btn(T.more, "ghost", loadMore); more.classList.add("ib-more"); body.appendChild(more); }
  }

  /* ---------- one comment ---------- */

  function itemOf(ref) { var f = null; C.items.forEach(function (i) { if (i.ref === ref) f = i; }); return f; }
  function openComment(it) {
    if (C.sel === it.ref && C.tstate === "ready") return;
    C.sel = it.ref; C.selName = nameOf(it.author_name); C.thread = null; C.tstate = "loading"; C.tfail = null; C.notice = null; C.confirm = false;
    C.mode = availableMode(it);
    fillList(); fillDetail(); pushDetail();
    fetchThread(false);
    markRead(it);
    var back = byId("cm-back"); if (back) back.focus();
  }
  function markRead(it) {
    if (!it || it.unread !== true) return;
    it.unread = false; setCount(Math.max(0, C.unread - 1)); fillList();
    D.call("POST", base() + encodeURIComponent(it.ref) + "/read/", null, true);
  }
  function fetchThread(silent) {
    var mine = ++C.tload, ref = C.sel, st = C;
    D.call("GET", base() + encodeURIComponent(ref) + "/", null, true).then(function (res) {
      if (C !== st || mine !== st.tload || res.status === 401) return;
      if (!res.ok) {
        if (silent && C.thread) { D.toast("That did not work", msgOf(res, "We could not refresh this comment."), "error"); return; }
        C.tstate = "failed"; C.tfail = failure(res); fillDetail(); return;
      }
      C.thread = res.data; C.tstate = "ready"; C.tfail = null;
      var it = itemOf(ref); if (it) mergeInto(it, res.data);
      if (!silent) C.mode = C.mode === "private" && privAvailable() ? "private" : availableMode(C.thread);
      fillDetail(silent);
    });
  }
  function privAvailable() { return !!C.thread && !!C.thread.private_reply && C.thread.private_reply.available !== false; }
  /* A comment item from an answer replaces the row's fields (and the open detail's), keeping the detail's replies and actions. */
  function mergeInto(target, src) {
    Object.keys(src).forEach(function (k) { if (k !== "replies" && k !== "actions") target[k] = src[k]; });
  }
  function merge(comment) {
    if (!comment || typeof comment.ref !== "string") return;
    var it = itemOf(comment.ref); if (it) mergeInto(it, comment);
    if (C.thread && C.thread.ref === comment.ref) mergeInto(C.thread, comment);
  }

  function detailHead(c) {
    var head = h("div", "ib-thead");
    var back = h("button", "ib-back"); back.setAttribute("type", "button"); back.setAttribute("id", "cm-back");
    back.appendChild(icon(ICON.back)); back.appendChild(h("span", "", T.title));
    back.addEventListener("click", function () { C.sel = null; C.thread = null; C.tstate = ""; C.tload++; fillList(); fillDetail(); pushDetail(); });
    var av = h("span", "ib-av", U.initialsOf(c ? c.author_name : C.selName)); av.setAttribute("aria-hidden", "true");
    var nm = h("div", "ib-tname"); nm.appendChild(h("h2", "", c ? nameOf(c.author_name) : C.selName));
    if (c) {
      var row = h("div", "ib-chrow");
      if (c.post && c.post.is_ad === true) row.appendChild(h("span", "ib-ch cm-ad", T.ad));
      row.appendChild(chip(c.answered === true ? "chip-ok" : "chip-neutral", c.answered === true ? T.answered : T.unanswered));
      if (c.hidden === true) row.appendChild(chip("chip-neutral", T.hidden));
      nm.appendChild(row);
    }
    add(head, back, av, nm);
    return head;
  }
  function postCard(post) {
    var card = h("div", "cm-postcard"), link = post ? safeLink(post.permalink) : "";
    var label = h("span", "cm-on", T.on);
    var line = postLine(post);
    if (link) {
      var a = D.el("a", { "class": "cm-pl", href: link, target: "_blank", rel: "noopener noreferrer" });
      a.appendChild(line); add(card, label, a);
    } else add(card, label, line);
    return card;
  }
  function fillDetail(keepView) {
    var p = byId("cm-detail"); if (!p || !C) return;
    var keep = null;
    if (keepView) {
      var om = p.querySelector ? p.querySelector(".ib-msgs") : null, ae = document.activeElement;
      keep = { top: om ? om.scrollTop : 0, ta: !!ae && ae.id === "cm-rb", s: null, e: null };
      if (keep.ta) { keep.s = ae.selectionStart; keep.e = ae.selectionEnd; }
    }
    clear(p);
    if (!C.sel) { p.classList.add("is-hide-phone"); p.setAttribute("aria-label", "Comment"); p.appendChild(stateBox(ICON.chat, T.pickTitle, T.pickText)); return; }
    p.classList.remove("is-hide-phone");
    p.setAttribute("aria-label", "Comment from " + C.selName);
    var c = C.thread;
    if (C.tstate === "loading" || !c) {
      p.appendChild(detailHead(null));
      if (C.tstate === "failed") {
        var f = C.tfail || { kind: "down" };
        p.appendChild(stateBox(ICON.warn, "We couldn't open this comment", f.kind === "gone" ? T.gone : T.reopenFail, [btn("Try again", "primary", function (b) { busy(b, true); C.tstate = "loading"; fillDetail(); fetchThread(false); })], true));
      } else p.appendChild(h("p", "pm-meta ib-loading", T.opening));
      return;
    }
    p.appendChild(detailHead(c));
    var now = new Date();
    var msgs = h("div", "ib-msgs"); msgs.setAttribute("tabindex", "0"); msgs.setAttribute("aria-label", "Comment");
    msgs.appendChild(postCard(c.post));
    var row = h("div", "ib-msg ib-msg-in"), when = U.whenText(c.created_at, now);
    add(row, h("p", "ib-bub", c.text || ""), h("span", "ib-meta", when));
    msgs.appendChild(row);
    (Array.isArray(c.replies) ? c.replies : []).forEach(function (r) {
      var out = r.is_page === true, rr = h("div", "ib-msg " + (out ? "ib-msg-out" : "ib-msg-in"));
      add(rr, h("p", "cm-rname", nameOf(r.author_name)), h("p", "ib-bub", r.text || ""), h("span", "ib-meta", U.whenText(r.created_at, now)));
      msgs.appendChild(rr);
    });
    p.appendChild(msgs);
    p.appendChild(composer(c));
    if (keep) {
      msgs.scrollTop = keep.top;
      if (keep.ta) { var ta = byId("cm-rb"); if (ta && !ta.disabled) { try { ta.focus({ preventScroll: true }); } catch (e1) { ta.focus(); } if (keep.s !== null && ta.setSelectionRange) { try { ta.setSelectionRange(keep.s, keep.e); } catch (e2) { /* not a text box now */ } } } }
    }
  }

  /* ---------- reply, message privately, hide ---------- */

  function draftKey() { return C.sel + ":" + C.mode; }
  function draftOf() { return has(C.drafts, draftKey()) ? C.drafts[draftKey()] : ""; }
  function modeAction(c, mode) { return mode === "private" ? c.private_reply : c.public_reply; }
  function composer(c) {
    var wrap = h("div", "ib-reply cm-compose");
    var mode = C.mode, act = modeAction(c, mode), off = !act || act.available === false;
    /* Reply and Message privately choose where the text goes; Hide asks first (there is no unhide in C1). A disabled one says why, below. */
    var modes = h("div", "cm-modes"); modes.setAttribute("role", "group"); modes.setAttribute("aria-label", "How to answer");
    [["public", T.reply, c.public_reply], ["private", T.priv, c.private_reply]].forEach(function (m) {
      var b = btn(m[1], "ghost", function () { if (C.mode === m[0] || (m[2] && m[2].available === false)) return; C.mode = m[0]; C.notice = null; fillDetail(); });
      b.classList.add("cm-mode"); b.setAttribute("aria-pressed", m[0] === mode ? "true" : "false");
      if (m[0] === mode) b.classList.add("is-on");
      if (m[2] && m[2].available === false) { b.setAttribute("aria-disabled", "true"); b.classList.add("is-off"); }
      modes.appendChild(b);
    });
    var hideB = btn(T.hide, "ghost", function () { C.confirm = true; fillDetail(); var y = byId("cm-hide-yes"); if (y) y.focus(); });
    hideB.classList.add("cm-hide"); hideB.setAttribute("id", "cm-hide-btn");
    if (!c.hide || c.hide.available === false) { hideB.disabled = true; hideB.setAttribute("aria-disabled", "true"); }
    modes.appendChild(hideB);
    wrap.appendChild(modes);
    if (C.confirm && c.hide && c.hide.available !== false) {
      var cf = h("div", "ib-note cm-confirm"); cf.setAttribute("role", "alertdialog"); cf.setAttribute("aria-label", T.confirmHide);
      var yes = btn(T.hide, "primary", function (b) { doHide(b); }); yes.setAttribute("id", "cm-hide-yes");
      var no = btn(T.cancel, "ghost", function () { C.confirm = false; fillDetail(); var hb = byId("cm-hide-btn"); if (hb) hb.focus(); });
      var acts = h("div", "cm-confirm-actions"); add(acts, yes, no);
      add(cf, h("span", "", T.confirmHide), acts);
      wrap.appendChild(cf);
    }
    notesFor(c).forEach(function (n) {
      var el = h("p", "ib-note ib-note-info cm-note"); el.appendChild(icon(ICON.chat)); el.appendChild(h("span", "", n[1])); wrap.appendChild(el);
    });
    if (C.notice) {
      var fail = h("div", "ib-fail"); fail.setAttribute("role", "alert"); fail.appendChild(icon(ICON.warn));
      var fb = h("div", ""); add(fb, h("strong", "", T.notSent), document.createTextNode(" " + C.notice + T.keepText)); fail.appendChild(fb); wrap.appendChild(fail);
    }
    var lab = h("label", "pm-label sr-only", mode === "private" ? T.priv : T.reply); lab.setAttribute("for", "cm-rb");
    var ta = h("textarea", "pm-input ib-ta"); ta.setAttribute("id", "cm-rb"); ta.setAttribute("rows", "2"); ta.setAttribute("aria-describedby", "cm-rc");
    ta.setAttribute("maxlength", String(MAX[mode]));
    var count = h("span", "ib-count", "0 / " + MAX[mode]); count.setAttribute("id", "cm-rc");
    var foot = h("div", "ib-rfoot");
    if (off) {
      ta.disabled = true; wrap.classList.add("is-closed");
      var goOff = btn(T.send, "primary"); goOff.disabled = true; goOff.setAttribute("aria-disabled", "true");
      add(wrap, lab, ta, add(foot, count, goOff));
      return wrap;
    }
    ta.value = draftOf();
    var go = btn(C.notice ? "Try again" : T.send, "primary", function (b) { send(b, ta); });
    ta.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return;
      e.preventDefault();
      if (!go.disabled) send(go, ta);
    });
    function sync() { C.drafts[draftKey()] = ta.value; count.textContent = ta.value.length + " / " + MAX[mode]; go.disabled = !ta.value.trim() || C.sending; }
    ta.addEventListener("input", sync);
    add(wrap, lab, ta, add(foot, count, go));
    sync();
    return wrap;
  }
  function send(b, ta) {
    if (C.sending) return;
    var mode = C.mode, text = ta.value.trim();
    if (!text || text.length > MAX[mode]) return;
    var st = C, ref = C.sel, mine = C.tload, kk = ref + ":" + mode, key = C.keys[kk] || (C.keys[kk] = U.newKey());
    C.sending = true; busy(b, true);
    D.call("POST", base() + encodeURIComponent(ref) + "/" + (mode === "private" ? "private-reply" : "reply") + "/", { text: text, idempotency_key: key }, true).then(function (res) {
      st.sending = false;
      if (res.status === 401) return;
      if (C !== st || mine !== st.tload || C.sel !== ref) return; /* another comment was opened meanwhile; the API has the record */
      if (!res.ok) {
        if (res.status !== 0) delete C.keys[kk]; /* a reply the API never saw can use a new key; a lost answer keeps it so nothing goes twice */
        var code = codeOf(res);
        C.notice = res.status === 0 ? T.net : known(code) ? failTextOf(code) : msgOf(res, DOWN);
        fillDetail(true);
        if (res.status === 409) fetchThread(true); /* the reasons changed (window closed, already sent...): show them */
        return;
      }
      delete C.keys[kk];
      merge(res.data && res.data.comment);
      if (res.data && res.data.state === "sent") { C.drafts[kk] = ""; C.notice = null; say(T.sent); }
      else C.notice = failTextOf(res.data && res.data.error_code);
      if (mode === "private" && !privAvailable() && C.thread && C.thread.public_reply && C.thread.public_reply.available !== false) C.mode = "public";
      fillList(); fillDetail(true);
      fetchThread(true);
    });
  }
  function doHide(b) {
    if (C.hiding || !C.sel) return;
    var st = C, ref = C.sel, mine = C.tload;
    C.hiding = true; busy(b, true);
    D.call("POST", base() + encodeURIComponent(ref) + "/hide/", null, true).then(function (res) {
      st.hiding = false;
      if (res.status === 401) return;
      if (C !== st || mine !== st.tload || C.sel !== ref) return;
      C.confirm = false;
      if (!res.ok) {
        var code = codeOf(res);
        D.toast("That did not work", res.status === 0 ? msgOf(res, DOWN) : known(code) ? failTextOf(code) : msgOf(res, DOWN), "error");
        fillDetail(true);
        if (res.status === 409) fetchThread(true);
        return;
      }
      if (res.data && res.data.state === "sent") { merge(res.data.comment); say(T.hid); fillList(); fillDetail(true); fetchThread(true); return; }
      D.toast("That did not work", failTextOf(res.data && res.data.error_code), "error");
      fillDetail(true);
    });
  }

  window.NOInboxComments = { probe: probe, start: start, stop: stop, open: open, close: close,
    util: { listQuery: listQuery, safeLink: safeLink, notesFor: notesFor, reasonText: reasonText, failTextOf: failTextOf, availableMode: availableMode, isOn: isOn } };
})();
