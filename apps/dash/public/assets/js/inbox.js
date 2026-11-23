/* Inbox (/inbox/, ClickUp z8uq9md3n6 and z8uq9mfj12, Unified Inbox): one list of the conversations of the owner's stored channels,
   website chat, email (the contact form), Facebook Messenger and Facebook comments (channel "FB Comment", ClickUp z8uq9mg9ph; the detail,
   reply, private reply and Hide are in inbox-comments.js), a thread view and a human reply. Built to the approved mockups (b1 to b3 list, c1 to c3
   thread, d1 to d7 the stored channels). Reads GET /sites/{id}/inquiries/conversations/ (paged by stored_cursor), GET
   .../conversations/{ref}/ and sends POST .../conversations/{ref}/reply/ {text, idempotency_key}, POST .../close/, .../reopen/ and
   .../read/. A customer's name and message reach the page through textContent only, and nothing is stored in the browser: a draft
   lives in memory until the page is left. While the API answers 404 (the INQUIRIES_ENABLED switch is off, or not a Santé site) the
   page says so and the Inbox links stay hidden. A neutral channel badge on every conversation, a Channel filter in the house
   dropdown, Close and Reopen, the delivery chips and fixed failure texts of a reply (sent, failed, rate_limited; chat
   "Delivered to chat when the visitor is online"), the unverified-sender and no-email notes, a closed conversation with its reply box
   off, and the chat banners (paused, or the daily limit reached; one at a time, the limit first) fed by GET .../channels/. NOInbox.util
   holds the pure helpers (tests/inbox.test.mjs). INBOX-UI (z8uq9mg7c7): a Messenger photo on the row and the thread head, Sent/Delivered/Seen, the reply-window notice, Enter to send, grouped bubbles, the unread count on the Inbox nav links, search, and a fixed-height layout. Plain ES5. Every word that came from the API or a visitor still reaches the page
   through textContent only. */
(function () {
  var D = window.NODash;
  var SMS = window.NOInboxSms; /* inbox-sms.js loads before this file; without it there is no Text (SMS) channel */
  var BULK = window.NOInboxBulk; /* inbox-bulk.js loads before this file; without it there is no "Text many members" button */
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
    sms: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM11 18h2M9 7h6M9 10h4",
    globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
    mail: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 7l9 6 9-6",
    x: "M6 6l12 12M18 6L6 18",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
    mailOpen: "M3 10l9-6 9 6v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10l9 6 9-6",
    stack: "M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 13h5l1 3h6l1-3h5",
    comment: "M4 4h16v12H9l-5 4zM8 8.5h8M8 11.5h5",
    check: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6",
    unans: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5v5M12 16h.01"
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
    var named = w.filter(function (x) { return /^[A-Za-z0-9\u00C0-\uFFFF]/.test(x); }); /* "Ana Reyes (test)" is AR, not A( */
    if (named.length) w = named;
    if (!w.length) return "?";
    var a = Array.from(w[0])[0], b = w.length > 1 ? Array.from(w[w.length - 1])[0] : "";
    return (a + b).toUpperCase();
  }
  function nameOf(name) { var t = String(name || "").trim(); return t || "Customer"; }
  /* Oldest first; if any message has no time the order given is kept. */
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
  /* ---------- the channels ---------- */

  var CHANNEL = {
    webchat: { label: "Website chat", icon: "globe" },
    email: { label: "Email", icon: "mail" },
    messenger: { label: "FB Messenger", full: "Facebook Messenger", icon: "chat" },
    fbcomment: { label: "FB Comment", full: "Facebook comment", icon: "comment" },
    sms: { label: "Text (SMS)", full: "Text messages (SMS)", icon: "sms" }
  };
  var FILTERS = [["all", "All channels"], ["webchat", "Website chat"], ["email", "Email"], ["messenger", "FB Messenger"], ["fbcomment", "FB Comment"]];
  /* The Channel filter's choices: Text (SMS) only while the API says the feature is there (GET .../channels/ sms_available). */
  function filtersFor(ch) { return SMS && SMS.util.available(ch) ? FILTERS.slice(0, 4).concat([["sms", "Text (SMS)"]], FILTERS.slice(4)) : FILTERS; }
  /* A row's channel: what the API says, else what its ref says (cm_ is a Facebook comment); "" when neither names one. */
  function channelOf(x) {
    var c = x && x.channel;
    if (c === "webchat" || c === "email" || c === "messenger" || c === "sms") return c;
    if (x && x.provider === "messenger") return "messenger";
    if (x && x.provider === "sms") return "sms";
    var ref = x && typeof x.ref === "string" ? x.ref : "";
    return ref.indexOf("wc_") === 0 ? "webchat" : ref.indexOf("em_") === 0 ? "email" : ref.indexOf("fm_") === 0 ? "messenger" : ref.indexOf("cm_") === 0 ? "fbcomment" : ref.indexOf("sm_") === 0 ? "sms" : "";
  }
  function isCommentRef(ref) { return typeof ref === "string" && ref.indexOf("cm_") === 0; }
  function isStored(x) { var c = channelOf(x); return c === "webchat" || c === "email" || c === "messenger" || c === "sms"; }
  function isComment(x) { return channelOf(x) === "fbcomment"; }
  function srcOf(x) { return isComment(x) ? "cm" : "conv"; }
  /* ---------- one list from two newest-first sources (ClickUp z8uq9mg9ph) ----------
     The conversations API (stored_cursor) and the comments API (cursor) each give their items newest first. The page merges them by time.
     A source that has a next page may still hold items older than its last loaded one, so nothing older than the NEWER of the two last
     loaded items is shown while both have a next page: it is held back until the lagging source loads its next page. A source with no
     next page does not limit. A later page therefore never puts a row above rows already shown, and the shown list has no gap. */
  function timeOf(x) { var d = validDate(x && (isComment(x) ? x.created_at : x.updated_at)); return d ? d.getTime() : 0; }
  function sortNewest(items) {
    var rows = items.map(function (m, i) { return { m: m, i: i, t: timeOf(m) }; });
    rows.sort(function (a, b) { return b.t - a.t || a.i - b.i; });
    return rows.map(function (r) { return r.m; });
  }
  /* The oldest loaded time of a source, or null when it has none loaded. */
  function oldestOf(pool, src) {
    var t = null;
    pool.forEach(function (i) { if (srcOf(i) === src) { var x = timeOf(i); if (t === null || x < t) t = x; } });
    return t;
  }
  /* more: { conv: bool, cm: bool }, whether that source has a next page. Items older than the returned time are held back. */
  function horizonOf(pool, more) {
    var hz = -Infinity;
    ["conv", "cm"].forEach(function (src) { if (more && more[src]) { var o = oldestOf(pool, src); if (o !== null && o > hz) hz = o; } });
    return hz;
  }
  function visibleOf(pool, more) {
    var hz = horizonOf(pool, more);
    return sortNewest(pool).filter(function (i) { return timeOf(i) >= hz; });
  }
  /* Which source's next page to read: of the sources that have one, the one whose oldest loaded item is newer (it lags; one with nothing loaded first). */
  function nextSource(pool, more) {
    var best = "", bt = null;
    ["conv", "cm"].forEach(function (src) {
      if (!more || !more[src]) return;
      var o = oldestOf(pool, src), t = o === null ? Infinity : o;
      if (best === "" || t > bt) { best = src; bt = t; }
    });
    return best;
  }
  /* A fresh page of one source into the pool: replaces the source's items, or (keepOld) only updates and adds to them. */
  function mergeSource(pool, src, fresh, keepOld) {
    var seen = {}, out = [];
    fresh.forEach(function (i) { seen[i.ref] = true; out.push(i); });
    pool.forEach(function (i) { if (srcOf(i) !== src || (keepOld && !seen[i.ref])) out.push(i); });
    return out;
  }
  /* The sources a filter combination reads: Channel "FB Comment" reads only comments, the other channels only conversations, All both.
     Comments have no closed state, so Closed reads no comments. */
  function sourcesFor(filter, status) {
    return { conv: filter !== "fbcomment", cm: (!filter || filter === "all" || filter === "fbcomment") && status !== "closed" };
  }
  /* The comments list address: search text, Read/Unread (unread=1 or 0), cursor. */
  function commentQuery(q, unread, cursor, answered) {
    var qs = [];
    if (q) qs.push("q=" + encodeURIComponent(q));
    if (unread === "1" || unread === "0") qs.push("unread=" + unread);
    if (answered === "answered" || answered === "unanswered") qs.push("answered=" + answered);
    if (cursor) qs.push("cursor=" + encodeURIComponent(cursor));
    return qs.length ? "?" + qs.join("&") : "";
  }
  /* The Inbox unread total: conversations plus comments. */
  function unreadSum(a, b) {
    function ok(n) { return typeof n === "number" && isFinite(n) && n > 0 ? Math.floor(n) : 0; }
    return ok(a) + ok(b);
  }
  /* A Messenger thread's 24-hour reply window (reply_window.open); only a Messenger thread can have it closed. */
  var NOTE_WINDOW = "You can reply within 24 hours of the customer's last message.";
  function windowClosed(channel, t) { return channel === "messenger" && !!t && !!t.reply_window && t.reply_window.open === false; }
  function filterItems(items, filter) {
    return filter && filter !== "all" ? items.filter(function (i) { return channelOf(i) === filter; }) : items;
  }
  /* The fixed owner texts of a reply that did not go (mockup d7). Never the mail server's words. */
  var FAIL = {
    sender_not_ready: "Email replies are not set up for this store.",
    no_recipient: "This conversation has no email address to reply to.",
    email_failed: "The email could not be sent. Please try again shortly.",
    rate_limited: "Too many emails have been sent from this store. Please wait and try again.",
    window_closed: NOTE_WINDOW,
    token_invalid: "Reconnect your Facebook Page in Settings > Inbox."
  };
  /* A Facebook Messenger reply that did not go: the existing sentences (the 24-hour note, the Settings > Inbox reconnect line, and the
     wording of inbox-settings.js and inbox-comments.js), never the email texts. Codes are the shared provider outcomes. */
  var M_DOWN = "Facebook did not answer. Try again.", M_LIMIT = "Facebook is limiting replies right now. Try again in a few minutes.";
  var M_FAIL = {
    window_closed: NOTE_WINDOW,
    token_invalid: FAIL.token_invalid, invalid_credentials: FAIL.token_invalid, expired_credentials: FAIL.token_invalid,
    not_configured: "Connect your Facebook Page to reply.",
    forbidden_page: "Messenger needs all the permissions it asks for. Please connect again and allow them.",
    rate_limited: M_LIMIT, blocked_rate: M_LIMIT, provider_down: M_DOWN, bad_response: M_DOWN, not_found: M_DOWN
  };
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  /* `channel` is the thread's (webchat, email, messenger, fbcomment); without one the email and chat texts apply, as before. */
  function failTextOf(code, channel) {
    if (channel === "messenger") return has(M_FAIL, code) ? M_FAIL[code] : M_DOWN;
    if (channel === "fbcomment") {
      var cm = window.NOInboxComments && window.NOInboxComments.util;
      return cm && cm.failTextOf ? cm.failTextOf(code) : M_DOWN;
    }
    return has(FAIL, code) ? FAIL[code] : FAIL.email_failed;
  }
  var CHIP_CHAT = "Delivered to chat when the visitor is online", CHIP_MAIL = "Sent to the mail server";
  var NOTE_NO_EMAIL = "No email address was given. Your reply shows in the chat only while the visitor's browser keeps it.";
  var NOTE_UNVERIFIED = "This address was typed into your contact form and has not been confirmed.";
  var BANNER_LIMIT = ["Today's chat limit was reached.", " Visitors see that chat is not available. Website chat opens again tomorrow."];
  /* The delivery chip of an owner message in a stored thread: [colour, text] or null. `code` is the failure code paired to it. */
  function chipFor(channel, m, code, latestSeen) {
    if (!m || m.direction !== "out") return null;
    if (channel === "sms") return SMS ? SMS.util.chip(m) : null; /* Sending, Sent, or Not sent with the server's own words */
    if (m.delivery_state === "failed") return ["danger", "Failed: " + failTextOf(code, channel)];
    if (channel === "messenger") {
      /* INBOX-UI U2: Sent, Delivered, and Seen on the latest seen message only (Messenger style); an older seen one shows nothing. */
      if (m.delivery_state === "seen") return latestSeen === true ? ["info", "Seen"] : null;
      if (m.delivery_state === "delivered") return ["ok", "Delivered"];
      return m.delivery_state === "sent" ? ["ok", "Sent"] : null;
    }
    if (m.delivery_state !== "sent") return null;
    return channel === "email" ? ["ok", CHIP_MAIL] : ["info", CHIP_CHAT];
  }
  /* INBOX-UI U4: two bubbles belong to one group when the same side sent both, on the same day, at most 5 minutes apart. */
  function grouped(a, b) {
    if (!a || !b || a.out !== b.out) return false;
    var x = validDate(a.at), y = validDate(b.at);
    return !!x && !!y && dayKey(x) === dayKey(y) && y.getTime() >= x.getTime() && y.getTime() - x.getTime() <= 300000;
  }
  /* INBOX-UI U3: with less than 2 hours left of a Messenger thread's 24-hour window, "You can reply until 3:05 PM, today."; else "". */
  function windowNotice(t, now) {
    var rw = t && t.reply_window;
    if (!rw || rw.open === false) return "";
    var d = validDate(rw.closes_at); if (!d) return "";
    var left = d.getTime() - now.getTime();
    if (left <= 0 || left >= 7200000) return "";
    return "You can reply until " + clock(d) + ", " + (relDay(d, now) || monthDay(d, yearOf(d) !== yearOf(now))) + ".";
  }
  /* The Inbox count in the nav: nothing at 0, "99+" above 99. */
  function badgeText(n) { return typeof n !== "number" || !isFinite(n) || n <= 0 ? "" : n > 99 ? "99+" : String(Math.floor(n)); }
  function coarse() { try { return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch (e) { return false; } }
  /* The thread's messages do not carry the failure code; the replies list does (newest first). The failed owner messages, newest
     first, are matched to the failed replies in the same order. A message with no match gets the generic email_failed text. */
  function failCodes(messages, replies) {
    var failedReplies = (Array.isArray(replies) ? replies : []).filter(function (r) { return r && (r.state === "failed" || r.state === "blocked_rate"); });
    var out = {}, n = 0;
    for (var i = messages.length - 1; i >= 0; i--) {
      var m = messages[i];
      if (m.direction === "out" && m.delivery_state === "failed") { var r = failedReplies[n++]; out[m.id] = r && typeof r.error_code === "string" ? r.error_code : ""; }
    }
    return out;
  }
  /* The banner the list shows for the chat, from GET .../channels/: the daily limit first, else a pause, else none. */
  function chatBanner(ch, now) {
    if (!ch || ch.webchat_enabled !== true || ch.webchat_available === false) return null;
    if (ch.chat_limit_reached === true) return { kind: "limit" };
    var until = ch.paused_until ? validDate(ch.paused_until) : null;
    if (until && until.getTime() > now.getTime()) return { kind: "paused", until: ch.paused_until };
    return null;
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
  /* What a failed read means for the screen, from the API's status and error code. */
  function failure(res) {
    var st = res && res.status;
    if (st === 404) return { kind: "gone" };
    if (st === 403) return { kind: "limited", message: msgOf(res, "This part of your account is not open right now.") };
    return { kind: "down" };
  }

  /* The house dropdown, ported from products.js combo() (the pr-combo; payments.js has the original pm-combo): the same box, panel below
     it (above when there is no room), typing filters, textContent only. The native select stays in the page, hidden, as the source of
     truth. With o.blankEmpty the empty option is not typed into the box: the box stays empty and shows that option's text as its grey
     placeholder, so nothing is selected when it opens (the "Pause for" field). Without it the box shows the chosen option ("All
     channels"). select.ibSync() redraws the box after the code sets select.value; select.ibFocus() puts the cursor in the box.
     Focus is the light blue (--link), never gold. Also used by Settings > Inbox (inbox-settings.js, NOInbox.combo). */
  function combo(select, label, o) {
    o = o || {};
    var wrap = h("div", "ib-combo"), box = h("div", "ib-combo-box"), panel = h("div", "ib-combo-panel"), rows = [], active = -1;
    var input = D.el("input", { "class": "ib-combo-input", type: "text", role: "combobox", autocomplete: "off", spellcheck: "false", "aria-label": label, "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": select.id + "-list" });
    if (o.describedby) input.setAttribute("aria-describedby", o.describedby);
    panel.setAttribute("id", select.id + "-list"); panel.setAttribute("role", "listbox");
    select.parentNode.insertBefore(wrap, select);
    select.classList.add("ib-combo-native"); select.setAttribute("tabindex", "-1"); select.setAttribute("aria-hidden", "true");
    wrap.appendChild(select); box.appendChild(input); box.appendChild(h("span", "ib-combo-caret")); wrap.appendChild(box); wrap.appendChild(panel);
    function opts() { return Array.prototype.slice.call(select.children); }
    function chosen() {
      var all = opts(), t = all.length ? all[0].textContent : "";
      for (var i = 0; i < all.length; i++) if (all[i].value === select.value) { t = all[i].textContent; if (o.blankEmpty && all[i].value === "") t = ""; break; }
      if (o.blankEmpty && all.length && all[0].value === "" && !all.some(function (x) { return x.value === select.value; })) t = "";
      return t;
    }
    function isOpen() { return wrap.classList.contains("is-open"); }
    function mark(i) {
      active = i;
      rows.forEach(function (r, n) { r.classList.toggle("is-active", n === i); });
      if (i >= 0) input.setAttribute("aria-activedescendant", rows[i].id); else input.removeAttribute("aria-activedescendant");
    }
    function announce() { if (typeof Event === "function" && select.dispatchEvent) select.dispatchEvent(new Event("change", { bubbles: true })); }
    function draw(q) {
      clear(panel); rows = [];
      opts().forEach(function (op) {
        if (o.blankEmpty && op.value === "") return; /* the placeholder is not a choice */
        if (q && op.textContent.toLowerCase().indexOf(q) < 0) return;
        var on = op.value === select.value && !(o.blankEmpty && op.value === "");
        var row = h("div", "ib-combo-opt" + (on ? " is-selected" : ""), op.textContent);
        row.setAttribute("id", select.id + "-opt-" + rows.length); row.setAttribute("role", "option"); row.setAttribute("aria-selected", String(on));
        row.addEventListener("click", function () { select.value = op.value; input.value = chosen(); announce(); shut(); picked(); });
        rows.push(row); panel.appendChild(row);
      });
      if (!rows.length) panel.appendChild(h("div", "ib-combo-opt is-disabled", "No matches"));
      mark(-1);
    }
    /* Fixed, so the page's scrolling cannot clip it; opens upward only when there is no room below. */
    function place() {
      if (!box.getBoundingClientRect) return;
      var r = box.getBoundingClientRect(), below = window.innerHeight - r.bottom, up = below < 160 && r.top > below;
      panel.style.left = r.left + "px"; panel.style.width = r.width + "px";
      panel.style.maxHeight = Math.max(120, Math.min(320, (up ? r.top : below) - 16)) + "px";
      panel.style.top = up ? "auto" : (r.bottom + 6) + "px";
      panel.style.bottom = up ? (window.innerHeight - r.top + 6) + "px" : "auto";
    }
    function onScroll(e) { if (!panel.contains || !panel.contains(e.target)) shut(); }
    function onDoc(e) { if (!wrap.contains || !wrap.contains(e.target)) shut(); }
    function show() {
      if (isOpen()) return;
      wrap.classList.add("is-open"); input.setAttribute("aria-expanded", "true");
      draw(""); place();
      window.addEventListener("resize", place); document.addEventListener("scroll", onScroll, true); document.addEventListener("click", onDoc);
    }
    function shut() {
      wrap.classList.remove("is-open"); input.setAttribute("aria-expanded", "false"); input.value = chosen(); mark(-1);
      window.removeEventListener("resize", place); document.removeEventListener("scroll", onScroll, true); document.removeEventListener("click", onDoc);
    }
    box.addEventListener("click", function () { show(); input.focus(); });
    select.addEventListener("focus", function () { input.focus(); });
    select.addEventListener("change", function () { input.value = chosen(); });
    select.ibSync = function () { input.value = chosen(); };
    select.ibFocus = function () { input.focus(); };
    /* The text is never highlighted: focus puts the caret at the end. The first printable key typed while the box still shows the chosen label
       starts a fresh query (the label is cleared before the key lands), so it never appends to "Website chat". */
    function caretEnd() { var n = input.value.length; if (input.setSelectionRange) { try { input.setSelectionRange(n, n); } catch (e) { /* not selectable */ } } }
    function picked() { input.focus(); caretEnd(); } /* after a pick the focus stays on the combo that was used */
    input.addEventListener("focus", caretEnd);
    input.addEventListener("input", function () { show(); draw(input.value.trim().toLowerCase()); });
    input.addEventListener("keydown", function (e) {
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && input.value !== "" && input.value === chosen()) input.value = "";
      if (e.key === "Tab") { shut(); return; }
      if (e.key === "Escape" && isOpen()) { e.preventDefault(); e.stopPropagation(); shut(); return; }
      if (e.key === "Enter") { e.preventDefault(); if (active >= 0) { if (rows[active].fire) rows[active].fire("click"); else rows[active].click(); } else show(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      if (!isOpen()) { show(); return; }
      var d = e.key === "ArrowDown" ? 1 : -1, n = rows.length;
      if (n) mark(active < 0 ? (d > 0 ? 0 : n - 1) : (active + d + n) % n);
    });
    if (o.blankEmpty && select.firstChild && select.firstChild.value === "") input.setAttribute("placeholder", select.firstChild.textContent);
    input.value = chosen();
  }

  /* INBOX-UI U1: the initials circle, with the customer's photo over it when the API gave an https address. A photo that does not load
     is taken away, so the initials show. The address is only ever an img src (no-referrer); nothing else is read from it. */
  function avatarNode(name, url) {
    var av = h("span", "ib-av", initialsOf(name)); av.setAttribute("aria-hidden", "true");
    if (typeof url === "string" && /^https:\/\//.test(url)) {
      var img = D.el("img", { "class": "ib-av-img", src: url, alt: "", referrerpolicy: "no-referrer", loading: "lazy", decoding: "async" });
      img.addEventListener("error", function () { if (img.parentNode) img.parentNode.removeChild(img); });
      av.appendChild(img);
    }
    return av;
  }
  function avatarOfRef(ref) { var u = null; if (S) S.items.forEach(function (i) { if (i.ref === ref && typeof i.avatar_url === "string") u = i.avatar_url; }); return u; }

  /* ---------- the unread badge on the Inbox nav links (INBOX-UI U5) ----------
     Inbox reads carry unread_total; on every other view GET .../inquiries/unread/ is read every 60 s while the tab is visible. */
  var NB = { site: null, t: null, n: 0, seq: 0, cn: 0, cm: 0, cmOff: false }; /* cn: unread conversations, cm: unread comments; the badge is their sum */
  function setBadge(n) {
    if (typeof n !== "number" || !isFinite(n) || n < 0) return;
    n = Math.floor(n); NB.n = n;
    Array.prototype.forEach.call(document.querySelectorAll("[data-inbox-nav]"), function (a) {
      if (a.getAttribute("data-route") !== "inbox") return;
      var b = a.querySelector ? a.querySelector(".ib-nb") : null;
      if (!b) { b = h("span", "ib-nb"); b.setAttribute("aria-hidden", "true"); a.appendChild(b); }
      b.hidden = n <= 0; b.textContent = badgeText(n);
      if (n > 0) a.setAttribute("aria-label", "Inbox, " + n + " unread"); else a.removeAttribute("aria-label");
    });
  }
  function badgeSum() { setBadge(unreadSum(NB.cn, NB.cm)); }
  function badgeStop() { NB.seq++; if (NB.t !== null) { clearTimeout(NB.t); NB.t = null; } }
  function badgeOn() { return !S && !!NB.site && !document.hidden; }
  function badgeArm() {
    if (NB.t !== null) { clearTimeout(NB.t); NB.t = null; }
    if (!badgeOn()) return;
    NB.t = setTimeout(function () { NB.t = null; badgeRead(); }, 60000);
  }
  function badgeRead() {
    if (!badgeOn()) return;
    var seq = ++NB.seq;
    D.call("GET", "/sites/" + NB.site + "/inquiries/unread/", null, true).then(function (res) {
      if (seq !== NB.seq || res.status === 401) return;
      if (res.ok && res.data && typeof res.data.count === "number") NB.cn = Math.max(0, Math.floor(res.data.count));
      else if (res.status === 404) NB.cn = 0;
      if (NB.cmOff || !window.NOInboxComments) { badgeSum(); badgeArm(); return; }
      /* there is no count route for comments: their list says unread_total, whatever the filter (one unread page, read quietly) */
      D.call("GET", "/sites/" + NB.site + "/inquiries/comments/" + commentQuery("", "1", ""), null, true).then(function (r2) {
        if (seq !== NB.seq || r2.status === 401) return;
        if (r2.status === 404) { NB.cmOff = true; NB.cm = 0; }
        else if (r2.ok && r2.data && typeof r2.data.unread_total === "number") NB.cm = Math.max(0, Math.floor(r2.data.unread_total));
        badgeSum(); badgeArm();
      });
    });
  }
  /* The unread_total of a list read (never of a search, an Open/Closed or a Read/Unread filter, which may count only their matches). Old answers without it leave the badge alone. */
  function takeUnread(data) { if (S && !S.q && !S.status && !S.unread && data && typeof data.unread_total === "number") { NB.cn = Math.max(0, Math.floor(data.unread_total)); badgeSum(); } }
  /* The comments list's unread_total is the site's whole count and is never filtered, so every comments read may feed the badge. */
  function takeCmUnread(data) { if (data && typeof data.unread_total === "number") { NB.cm = Math.max(0, Math.floor(data.unread_total)); badgeSum(); } }

  /* ---------- state ---------- */

  function fresh() {
    return { site: null, state: "loading", fail: null, items: [], filter: "all", stNext: null, chat: null,
      closing: false, sel: null, selName: "", thread: null, tstate: "", tfail: null, drafts: {}, notice: null, key: null, sending: false,
      q: "", qText: "", qTimer: null, status: "", unread: "", answered: "", pool: [], cmNext: null, more: { conv: false, cm: false }, ex: { conv: false, cm: false } };
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
      S.site = D.siteFromQuery(sites.map(function (s) { return s.id; })); NB.site = NB.site || S.site;
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
      D.call("GET", "/sites/" + site + "/inquiries/channels/", null, true).then(function (r) { if (r.ok) { reveal(true); NB.site = site; badgeRead(); } });
    });
  }

  function show() {
    S = fresh(); token++; tload++;
    badgeStop();
    if (document.body && document.body.classList) document.body.classList.add("ib-fixed");
    draw();
    load(false);
    L.noRetry = false;
    pollStart();
  }
  function hide() {
    closeCompose(); streamClose(); pollStop(); token++; tload++; S = null; say("");
    if (window.NOInboxComments) window.NOInboxComments.stop();
    if (document.body && document.body.classList) document.body.classList.remove("ib-fixed"); if (document.body.classList.remove) document.body.classList.remove("ib-thread");
    var root = byId("ib-root"); if (root) clear(root);
    badgeRead();
  }

  /* ---------- load ---------- */

  /* The conversations address: the stored cursor, the search text (INBOX-UI U5) and the Open/Closed filter when there are any.
     o: { q, status, unread } (default: the screen's own). */
  function listUrl(cursor, o) {
    o = o || S;
    var qs = [];
    if (cursor) qs.push("stored_cursor=" + encodeURIComponent(cursor));
    if (o.q) qs.push("q=" + encodeURIComponent(o.q));
    if (o.status) qs.push("status=" + o.status); /* "open" or "closed"; All conversations sends nothing */
    if (o.unread) qs.push("unread=" + o.unread); /* "1" unread only, "0" read only; All messages sends nothing */
    if (o.answered === "answered" || o.answered === "unanswered") qs.push("answered=" + o.answered); /* the same filter as the comments list */
    return base() + "conversations/" + (qs.length ? "?" + qs.join("&") : "");
  }
  function commentsUrl(cursor, o) { o = o || S; return base() + "comments/" + commentQuery(o.q, o.unread, cursor, o.answered); }
  function stateFor(items) { return items.length || S.q || S.status || S.unread || S.answered || S.filter !== "all" ? "ready" : "empty"; }
  function cursorOf(data, key) { return data && typeof data[key] === "string" && data[key] ? data[key] : null; }
  /* Reads the first page of each source a filter combination needs, both at once. Resolves { unauth, ok, fail, conv, cm, src }:
     conv and cm are the answers' data (null when that source was not read or gave nothing). A comments 404 means the switch is off:
     no comments, no error, and they are not asked for again. Any other comments failure is no comments this time, unless they are the
     only source read. `fail` is the answer that failed the read. */
  function readFirst(src, o) {
    var useCm = src.cm && !NB.cmOff && !!window.NOInboxComments;
    var pc = src.conv ? D.call("GET", listUrl("", o), null, true) : Promise.resolve(null);
    var pm = useCm ? D.call("GET", commentsUrl("", o), null, true) : Promise.resolve(null);
    return Promise.all([pc, pm]).then(function (rr) {
      var c = rr[0], m = rr[1], out = { unauth: false, ok: true, fail: null, conv: null, cm: null, src: { conv: !!src.conv, cm: useCm } };
      if ((c && c.status === 401) || (m && m.status === 401)) { out.unauth = true; return out; }
      if (m && m.status === 404) { NB.cmOff = true; NB.cm = 0; out.src.cm = false; m = null; badgeSum(); }
      if (c) { if (c.ok && c.data) out.conv = c.data; else { out.ok = false; out.fail = c; } }
      if (m) { if (m.ok && m.data) out.cm = m.data; else if (!src.conv) { out.ok = false; out.fail = m; } }
      return out;
    });
  }
  /* Puts a first-page answer into the pool. keep: a background read, which updates and adds to the pages already loaded. */
  function ingest(r, keep) {
    var pool = keep ? S.pool : [];
    if (!keep) { S.stNext = null; S.cmNext = null; S.ex = { conv: false, cm: false }; }
    if (r.conv) {
      var keepC = keep && S.ex.conv;
      pool = mergeSource(pool, "conv", Array.isArray(r.conv.items) ? r.conv.items : [], keepC);
      if (!keepC) S.stNext = cursorOf(r.conv, "stored_next_cursor");
    }
    if (r.cm) {
      var keepM = keep && S.ex.cm;
      pool = mergeSource(pool, "cm", Array.isArray(r.cm.items) ? r.cm.items : [], keepM);
      if (!keepM) S.cmNext = cursorOf(r.cm, "next_cursor");
      takeCmUnread(r.cm);
    }
    S.pool = pool; rebuild();
  }
  function sigNow() { return sigOf([S.pool, S.stNext, S.cmNext]); }
  /* S.items is what the list shows: the pool, newest first, without what is held back. */
  function rebuild() {
    S.more = { conv: !!S.stNext, cm: !!S.cmNext };
    S.items = visibleOf(S.pool, S.more);
  }
  function load(refresh) {
    var mine = ++token;
    if (!refresh) { S.listTop = 0; S.state = "loading"; S.items = []; S.pool = []; S.stNext = null; S.cmNext = null; redraw(); }
    withSite(function () {
      streamOpen();
      readFirst(sourcesFor(S.filter, S.status)).then(function (r) {
        if (mine !== token || !S || r.unauth) return;
        if (!r.ok) { reveal404(r.fail); S.state = "failed"; S.fail = failure(r.fail); redraw(); return; }
        ingest(r, false); S.lsig = sigNow();
        S.state = stateFor(S.items); S.fail = null;
        if (r.conv) takeUnread(r.conv);
        reveal(true);
        redraw();
        say(S.items.length ? "Conversations loaded." : "No conversations yet.");
        if (r.src.conv) loadChat(mine);
      });
    }, mine);
  }
  function reveal404(res) { if (res && res.status === 404) reveal(false); }
  /* The chat's pause and limit, for the two banners. A site without the stored channels answers 404: no banner, nothing wrong. */
  function loadChat(mine) {
    D.call("GET", base() + "channels/", null, true).then(function (res) {
      if (mine !== token || !S || res.status === 401) return;
      var was = SMS ? SMS.util.available(S.chat) : false;
      S.chat = res.ok && res.data && typeof res.data === "object" ? res.data : null;
      /* the Channel filter and the New text button depend on sms_available: the toolbar is built again when that changed */
      if (SMS && SMS.util.available(S.chat) !== was) { var th = byId("ib-tools-host"); if (th) th.removeAttribute("data-mode"); if (!SMS.util.available(S.chat) && S.filter === "sms") S.filter = "all"; }
      if (byId("ib-listbody")) drawList();
      probeBulk(mine);
    });
  }
  /* "Text many members": GET .../sms/bulk/status/ once, only after sms_available is true. S.bulk is the status (available:true) or false;
     a 404 or any error leaves the button hidden. */
  function probeBulk(mine) {
    if (!BULK || !S || S.bulk !== undefined || S.bulkAsked || !SMS || !SMS.util.available(S.chat)) return;
    var st = S; st.bulkAsked = true;
    BULK.probe(D, st.site).then(function (r) {
      if (mine !== token || S !== st) return;
      st.bulk = r || false;
      if (r) { var th = byId("ib-tools-host"); if (th) th.removeAttribute("data-mode"); if (byId("ib-listbody")) drawList(); }
    });
  }
  /* Show more: reads the next page of the source that lags (the one whose last loaded item is newer), and again while that shows nothing new. */
  function loadMore(b) {
    if (!nextSource(S.pool, S.more)) return;
    var mine = token, st = S; busy(b, true);
    function step(n) {
      var src = nextSource(S.pool, S.more), before = S.items.length;
      if (!src) { done(); return; }
      var url = src === "cm" ? commentsUrl(S.cmNext) : listUrl(S.stNext);
      D.call("GET", url, null, true).then(function (res) {
        if (mine !== token || S !== st || res.status === 401) return;
        if (!res.ok) { busy(b, false); D.toast("That did not work", msgOf(res, "We could not load more. Please try again."), "error"); return; }
        var items = Array.isArray(res.data.items) ? res.data.items : [];
        S.pool = mergeSource(S.pool, src, items, true);
        if (src === "cm") { S.cmNext = cursorOf(res.data, "next_cursor"); takeCmUnread(res.data); } else S.stNext = cursorOf(res.data, "stored_next_cursor");
        S.ex[src] = true; rebuild();
        if (S.items.length <= before && nextSource(S.pool, S.more) && n < 4) { step(n + 1); return; }
        done();
      });
    }
    function done() { busy(b, false); S.lsig = ""; drawList(); }
    step(0);
  }
  function itemOf(ref) { var f = null; S.pool.forEach(function (i) { if (i.ref === ref) f = i; }); return f; }
  function cmHooks() {
    return { site: function () { return S ? S.site : ""; }, pane: function () { return byId("ib-threadpane"); }, item: itemOf,
      head: function (name, chips, action, avatar) { return threadHead(name, { channel: "fbcomment", chips: chips, action: action, avatar: avatar }); }, listChanged: function () { if (S) drawList(); } };
  }
  function openThread(ref, name) {
    if (S.sel === ref && S.tstate === "ready") return;
    if (S.composing) { closeCompose(); }
    var CM = window.NOInboxComments, it = itemOf(ref);
    if (it && isComment(it) && CM) {
      if (S.sel === ref && CM.isOpen(ref)) return;
      S.sel = ref; S.selName = name || ""; S.thread = null; S.tstate = ""; S.tfail = null; S.notice = null; S.key = null; tload++;
      drawList();
      CM.select(cmHooks(), it);
      markRead(ref);
      return;
    }
    if (CM) CM.deselect();
    S.sel = ref; S.selName = name || ""; S.thread = null; S.tstate = "loading"; S.tfail = null; S.notice = null; S.key = null;
    drawList(); drawThread();
    fetchThread(false);
    markRead(ref);
    var back = byId("ib-back"); if (back) { try { back.focus({ preventScroll: true }); } catch (e) { back.focus(); } }
  }
  /* Opening an unread conversation or comment marks it read; the dot goes at once, the count drops, and the server has the record. */
  function markRead(ref) {
    var item = itemOf(ref);
    if (!item || item.unread !== true) return;
    if (isComment(item)) {
      item.unread = false; NB.cm = Math.max(0, NB.cm - 1); badgeSum(); drawList();
      D.call("POST", base() + "comments/" + encodeURIComponent(ref) + "/read/", null, true);
      return;
    }
    if (!isStored(item)) return;
    item.unread = false; NB.cn = Math.max(0, NB.cn - 1); badgeSum(); drawList();
    D.call("POST", base() + "conversations/" + encodeURIComponent(ref) + "/read/", null, true);
  }
  function fetchThread(silent) {
    var mine = ++tload, ref = S.sel;
    D.call("GET", base() + "conversations/" + encodeURIComponent(ref) + "/", null, true).then(function (res) {
      if (mine !== tload || !S || res.status === 401) return;
      if (!res.ok) {
        if (silent && S.thread) { D.toast("That did not work", msgOf(res, "We could not refresh this conversation."), "error"); return; }
        S.tstate = "failed"; S.tfail = failure(res); drawThread(); return;
      }
      S.thread = res.data; S.tstate = "ready"; S.tfail = null; S.tsig = sigOf(res.data);
      drawThread();
      if (!silent && SMS && channelOf(res.data.channel ? res.data : { ref: ref }) === "sms") smsStatus(ref);
    });
  }
  /* The texting phone's state and this store's counts, read when a text conversation is opened (and after a send): for the offline note and "Texts left". */
  function smsStatus(ref) {
    D.call("GET", base() + "sms/status/", null, true).then(function (res) {
      if (!S || res.status === 401 || S.sel !== ref) return;
      S.smsStatus = res.ok && res.data && typeof res.data === "object" ? res.data : null;
      drawThread(false, true);
    });
  }

  /* ---------- auto-refresh (ClickUp z8uq9mg799) ----------
     While the Inbox view is shown and the tab is visible, the open conversation is read again every 5 s and the list every 15 s, so a
     customer's new message shows without pressing Refresh. Plain polling: one timer per kind (P.thread, P.list), armed only after the
     last request of that kind has ended, so two never overlap. Hidden tab or leaving the view stops both; coming back (visibilitychange,
     window focus) reads at once and starts them again. An error doubles the wait (5, 10, 20, 40, 60 s at most; the list 15, 30, 60) and a
     success resets it. A background read is silent: no loading state, no error banner, no toast. It redraws only when the data changed,
     and then keeps the reply box's text, the focus, the thread's scroll (the bottom only if it was at the bottom) and the list's scroll.
     The selection, the Channel filter and the pages of "Show more" are never reset (the list read merges the first page into them). */
  var EVERY = { thread: 5000, list: 15000 }, CAP = 60000;
  var P = { epoch: 0, thread: { t: null, fails: 0, busy: false }, list: { t: null, fails: 0, busy: false } };
  function sigOf(x) { try { return JSON.stringify(x); } catch (e) { return ""; } }
  function tabHidden() { return !!document.hidden || document.visibilityState === "hidden"; }
  function pollOn() { return !!S && !tabHidden(); }
  function pollClear(kind) { var p = P[kind]; if (p.t !== null) { clearTimeout(p.t); p.t = null; } }
  function pollArm(kind) {
    var p = P[kind]; pollClear(kind);
    if (!pollOn()) return;
    var wait = Math.min(CAP, (L.live ? HEALTHY : EVERY[kind]) * Math.pow(2, p.fails));
    p.t = setTimeout(function () { p.t = null; pollRun(kind); }, wait);
  }
  function pollStart() { P.epoch++; ["thread", "list"].forEach(function (k) { pollClear(k); P[k].fails = 0; P[k].busy = false; pollArm(k); }); }
  function pollStop() { P.epoch++; ["thread", "list"].forEach(function (k) { pollClear(k); P[k].busy = false; }); }
  /* Read at once (the tab came back); a request already running will arm the next one itself. */
  function pollKick() {
    if (!pollOn()) return;
    ["thread", "list"].forEach(function (k) { pollClear(k); P[k].fails = 0; pollRun(k); });
  }
  function pollRun(kind) {
    var p = P[kind];
    if (!pollOn()) return;
    if (p.busy) return;
    var epoch = P.epoch, started = false;
    function done(result) {
      if (epoch !== P.epoch) return; /* the view was left or opened again meanwhile */
      p.busy = false;
      if (result === "ok") p.fails = 0; else if (result === "fail") p.fails++;
      if (p.again) { p.again = false; pollClear(kind); pollRun(kind); return; } /* a push came while this read ran: read once more */
      pollArm(kind);
    }
    p.busy = true;
    started = kind === "thread" ? pollThread(done) : pollList(done);
    if (started === false) done("skip");
  }
  /* The open conversation. Returns false when there is nothing to read. */
  function pollThread(done) {
    if (!S.sel || S.tstate !== "ready" || !S.thread || S.sending) return false;
    var st = S, ref = S.sel, seq = tload;
    D.call("GET", base() + "conversations/" + encodeURIComponent(ref) + "/", null, true).then(function (res) {
      if (S !== st || seq !== tload || S.sel !== ref || res.status === 401) { done("skip"); return; }
      if (!res.ok) { done("fail"); return; }
      var sig = sigOf(res.data);
      if (sig !== S.tsig) {
        S.thread = res.data; S.tfail = null; S.tsig = sig;
        drawThread(false, true);
      }
      done("ok");
    });
    return true;
  }
  /* The list. A first page that comes back replaces a source's first page only when no "Show more" page of that source is loaded; otherwise it is merged in. */
  function pollList(done) {
    if (S.state !== "ready" && S.state !== "empty") return false;
    var st = S, mine = token;
    readFirst(sourcesFor(S.filter, S.status)).then(function (r) {
      if (S !== st || mine !== token || r.unauth) { done("skip"); return; }
      if (!r.ok) { done("fail"); return; }
      if (r.conv) takeUnread(r.conv);
      var wasPool = S.pool, wasSt = S.stNext, wasCm = S.cmNext;
      ingest(r, true);
      var sig = sigNow();
      if (sig !== S.lsig) {
        var keep = listKeep();
        if (keep === null) { S.pool = wasPool; S.stNext = wasSt; S.cmNext = wasCm; rebuild(); done("skip"); return; } /* the Channel filter is in use: apply it on the next read */
        S.lsig = sig; S.state = stateFor(S.items); S.fail = null;
        redraw(); listRestore(keep);
        if (S.sel && S.tstate === "ready") markRead(S.sel);
      }
      done("ok");
    });
    return true;
  }
  /* What the list redraw must give back: its scroll, and the focused conversation or Show more button. null: do not redraw now. */
  function within(root, node) { for (var n = node; n; n = n.parentNode) { if (n === root) return true; } return false; }
  function listKeep() {
    var body = byId("ib-listbody"), ul = body && body.querySelector ? body.querySelector(".ib-list") : null, ae = document.activeElement, keep = { top: ul ? ul.scrollTop : 0, ref: "", more: false };
    if (!ae || !body || !within(body, ae)) return keep;
    if (ae.closest && ae.closest(".ib-tools")) return null;
    if (ae.hasAttribute && ae.hasAttribute("data-ref")) keep.ref = ae.getAttribute("data-ref");
    else if (ae.classList && ae.classList.contains("ib-more")) keep.more = true;
    return keep;
  }
  function listRestore(keep) {
    var body = byId("ib-listbody"); if (!body) return;
    var ul = body.querySelector ? body.querySelector(".ib-list") : null;
    if (ul && keep.top) ul.scrollTop = keep.top;
    var target = null;
    if (keep.ref) { var rows = body.querySelectorAll ? body.querySelectorAll("button") : []; for (var i = 0; i < rows.length; i++) { if (rows[i].getAttribute("data-ref") === keep.ref) target = rows[i]; } }
    else if (keep.more) target = body.querySelector(".ib-more");
    if (target && target.focus) { try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); } }
  }
  /* ---------- live push (ClickUp z8uq9mg7ak) ----------
     On top of the polls: an EventSource to .../sites/{site}/inquiries/stream/ (the session cookie rides along). While it is live
     ("ready" came, no error since) the polls slow to HEALTHY (60 s) and a pushed event reads what changed at once: the open thread when the
     event is for it, the list always (debounced 300 ms). Any error puts the 5 s / 15 s polls back until the next "ready". A stream the
     browser gave up on (readyState CLOSED: 401, 403, 404, 429, 503, a dead proxy) leaves polling only and is tried again every 60 s,
     never after a 401. EventSource cannot read the status, so on CLOSED one ordinary read of the list tells: a 401 there stops all retries
     (the dashboard's own call also sends the user to sign in). The stream is closed when the tab is hidden or the view is left. */
  var HEALTHY = 60000, RETRY = 60000, DEBOUNCE = 300;
  var L = { es: null, live: false, retry: null, deb: null, noRetry: false };
  function streamReads() { /* the polls re-armed from now with the current interval */
    ["thread", "list"].forEach(function (k) { if (!P[k].busy) pollArm(k); else pollClear(k); });
  }
  /* Read one kind now; if one is running already, once more when it ends. */
  function streamRead(kind) {
    if (!pollOn()) return;
    var p = P[kind];
    if (p.busy) { p.again = true; return; }
    pollClear(kind); p.fails = 0; pollRun(kind);
  }
  function streamClose() {
    if (L.es) { try { L.es.close(); } catch (e) { /* closing a dead stream */ } }
    L.es = null; L.live = false;
    if (L.retry !== null) { clearTimeout(L.retry); L.retry = null; }
    if (L.deb !== null) { clearTimeout(L.deb); L.deb = null; }
  }
  function streamOpen() {
    if (L.es || L.retry !== null || L.noRetry || !pollOn() || !S.site || typeof EventSource === "undefined") return;
    var es;
    try { es = new EventSource(D.cfg.apiBase + base() + "stream/", { withCredentials: true }); } catch (e) { return; }
    L.es = es; L.live = false;
    es.addEventListener("ready", function () {
      if (L.es !== es) return;
      L.live = true;
      streamRead("list"); streamRead("thread"); /* no replay: whatever came while the stream was down is read now */
    });
    function pushed(ev) {
      if (L.es !== es || !pollOn()) return;
      var ref = "";
      try { var d = JSON.parse(ev && ev.data); ref = d && typeof d.ref === "string" ? d.ref : ""; } catch (e) { ref = ""; }
      if (ref && S.sel === ref) streamRead("thread");
      if (L.deb === null) L.deb = setTimeout(function () { L.deb = null; if (L.es === es) streamRead("list"); }, DEBOUNCE);
    }
    es.addEventListener("conversation_updated", pushed);
    es.addEventListener("message_status", pushed);
    es.addEventListener("error", function () {
      if (L.es !== es) return;
      L.live = false; streamReads(); /* the fast polls again until the next "ready" */
      if (es.readyState !== 2) return; /* still CONNECTING: the browser retries by itself */
      streamClose(); streamGaveUp();
    });
  }
  /* The browser gave up: find out whether it was a 401, else try again in 60 s. Polling carries on meanwhile. */
  function streamGaveUp() {
    var epoch = P.epoch;
    L.retry = -1; /* blocks an early reopen while the check runs */
    D.call("GET", base() + "conversations/", null, true).then(function (res) {
      if (epoch !== P.epoch || !S) return;
      if (res.status === 401) { L.noRetry = true; L.retry = null; return; }
      L.retry = setTimeout(function () { L.retry = null; streamOpen(); }, RETRY);
    });
  }
  function onVisible() { if (tabHidden()) { streamClose(); pollStop(); } else { pollKick(); streamOpen(); } }
  function refreshAll(b) {
    busy(b, true);
    load(true);
    if (S.sel) { if (isCommentRef(S.sel) && window.NOInboxComments) window.NOInboxComments.reload(); else fetchThread(true); }
    setTimeout(function () { busy(b, false); }, 600);
  }

  /* ---------- reply ---------- */

  /* The box is kept per conversation, in memory only. */
  function draftOf() { return S.sel && Object.prototype.hasOwnProperty.call(S.drafts, S.sel) ? S.drafts[S.sel] : ""; }
  function send(b, box) {
    if (S.sending) return;
    var text = box.value.trim(), isSms = !!SMS && channelOf(S.thread || { ref: S.sel }) === "sms", limit = isSms ? SMS.util.maxOf(S.thread) : MAX;
    if (!text || limit === null || text.length > limit || (isSms && SMS.util.problem(text, limit))) return;
    var mine = tload, ref = S.sel, key = S.key || newKey();
    var st = S; S.key = key; S.sending = true; busy(b, true);
    D.call("POST", base() + "conversations/" + encodeURIComponent(ref) + "/reply/", { text: text, idempotency_key: key }, true).then(function (res) {
      st.sending = false;
      if (res.status === 401) return;
      if (S !== st || mine !== tload || S.sel !== ref) return; /* another conversation was opened meanwhile; the API has the record */
      if (!res.ok) {
        if (res.status !== 0) S.key = null; /* a reply the API never saw can use a new key; a lost answer keeps the old one so nothing goes twice */
        if (res.status === 409 && codeOf(res) === "closed") {
          if (S.thread) { S.thread.status = "closed"; S.thread.reply = { open: false, reason: "closed" }; }
          S.items.forEach(function (i) { if (i.ref === ref) i.status = "closed"; });
          S.notice = null; drawList(); drawThread(); return;
        }
        var bad = codeOf(res);
        if (isSms) {
          /* the text's own refusals (switch off, answers cannot arrive, opted out) turn the box off with the server's words; anything else is a note */
          if (res.status === 409 && (bad === "sms_off" || bad === "replies_off" || bad === "opted_out") && S.thread) S.thread.reply = { open: false, reason: bad };
          S.notice = SMS.util.refusal(res); drawThread(true); return;
        }
        S.notice = res.status === 0
          ? "We could not confirm it was sent. Press Try again: it will not be sent twice."
          : bad === "window_closed" || bad === "token_invalid" ? failTextOf(bad, channelOf(S.thread || { ref: ref })) : msgOf(res, "The reply could not be sent.");
        drawThread(true); return;
      }
      S.key = null;
      var state = res.data && res.data.state;
      /* The thread now holds the owner's message with its delivery state, sent or failed: read it again. */
      var code = res.data && typeof res.data.error_code === "string" ? res.data.error_code : "";
      if (isSms) {
        /* never "sent" at once: Sending until a thread read says Sent or Not sent; a 200 can be a failure, with the server's own words */
        if (state === "failed") { S.notice = typeof res.data.message === "string" && res.data.message ? res.data.message : "The text could not be sent."; S.drafts[ref] = text; }
        else { S.drafts[ref] = ""; S.notice = null; say("Text is being sent."); }
        drawThread(true); fetchThread(true); smsStatus(ref);
        return;
      }
      if (state === "sent") { S.drafts[ref] = ""; S.notice = null; say("Reply sent."); }
      else if (state === "sending") { S.notice = "Your reply is still being sent. Refresh in a moment to see it."; }
      else { S.notice = failTextOf(code, channelOf(S.thread || { ref: ref })); S.drafts[ref] = text; }
      drawThread(true);
      fetchThread(true);
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
    return S.state === "failed" && !!f && (f.kind === "gone" || f.kind === "limited");
  }
  /* After a list read: redraw only the list when the two panes are up, the whole body when the layout changes. */
  function redraw() { if (byId("ib-listbody") && !singlePane()) drawList(); else drawBody(); }
  function stateBox(iconPath, title, text, actions, err) {
    var box = h("div", "ib-state" + (err ? " ib-err" : "")); if (err) box.setAttribute("role", "alert");
    var tile = h("span", err ? "ib-tile ib-tile-err" : "icon-tile ib-tile"); tile.setAttribute("aria-hidden", "true"); tile.appendChild(icon(iconPath));
    add(box, tile, h("h2", "", title), h("p", "", text));
    if (actions && actions.length) { var a = h("div", "ib-actions"); actions.forEach(function (x) { a.appendChild(x); }); box.appendChild(a); }
    return box;
  }
  /* A conversation or the New text screen fills the right pane (on a phone the list gives way to it). */
  function paneOpen() { return !!(S && (S.sel || S.composing)); }
  function pane(label, cls) { var p = h("section", "ib-pane " + cls); p.setAttribute("aria-label", label); return p; }

  function drawBody() {
    var wrap = byId("ib-wrap"); if (!wrap || !S) return;
    clear(wrap);
    var f = S.fail;
    if (singlePane()) {
      var one = pane("Inbox", ""), pb = h("div", "ib-pane-head"); pb.appendChild(h("h2", "ib-h", "Conversations"));
      add(one, pb);
      if (f.kind === "gone") one.appendChild(stateBox(ICON.chat, "The inbox is not available yet", "It is not open for this site right now. Nothing is wrong with your account."));
      else one.appendChild(stateBox(ICON.warn, "The inbox is not open for you", f.message, null, true));
      wrap.appendChild(one); return;
    }
    var split = h("div", "ib-split"), right = h("div", "ib-rcol");
    var host = h("div", "ib-tools-host" + (paneOpen() ? " is-hide-phone" : "")); host.setAttribute("id", "ib-tools-host");
    add(right, host, threadPane()); /* the right column: the filter toolbar over the open-conversation card */
    add(split, listPane(), right);
    wrap.appendChild(split);
    if (S.sel) drawThread(); else if (S.composing) { smsCompose(true); }
  }
  function listPane() {
    var p = pane("Conversations", "ib-listpane" + (paneOpen() ? " is-hide-phone" : "")); p.setAttribute("id", "ib-listpane");
    var head = h("div", "ib-pane-head ib-lhead"); head.appendChild(h("h2", "ib-h", "Conversations"));
    var togs = h("div", "ib-togs"), at = answeredToggle(), rt = readToggle(); add(togs, at, rt); attachTip(at, togs); attachTip(rt, togs); head.appendChild(togs); p.appendChild(head);
    var body = h("div", "ib-listbody"); body.setAttribute("id", "ib-listbody"); p.appendChild(body);
    fillList(body);
    return p;
  }
  function fillList(body) {
    clear(body);
    syncTools();
    if (S.state === "loading") { body.appendChild(h("p", "pm-meta ib-loading", "Loading your conversations…")); return; }
    if (S.state === "empty") { body.appendChild(stateBox(ICON.chat, "No messages yet", "When a customer messages your Facebook Page, writes in your website chat or sends your contact form, the conversation will show up here. Press Refresh to check again.")); return; }
    if (S.state === "failed") {
      body.appendChild(stateBox(ICON.warn, "We couldn't load your conversations",
        "Your messages are safe. The inbox did not answer just now. Wait a moment, then press Refresh.",
        [btn("Try again", "primary", function (b) { busy(b, true); load(false); }, ICON.refresh)], true));
      return;
    }
    var banners = bannerBox(); if (banners) body.appendChild(banners);
    var shown = filterItems(S.items, S.filter), canMore = !!nextSource(S.pool, S.more);
    if (!shown.length) {
      var none = h("p", "ib-empty-filter", S.q ? "No conversations match \u201C" + S.q + "\u201D." : S.status || S.unread || S.answered ? "No conversations match." : S.filter === "fbcomment" ? "No comments yet." : "No conversations in this channel yet."); none.setAttribute("role", "status");
      body.appendChild(none);
      if (canMore) { var moreEmpty = btn("Show more conversations", "ghost", loadMore); moreEmpty.classList.add("ib-more"); body.appendChild(moreEmpty); }
      return;
    }
    var ul = h("ul", "ib-list"); ul.setAttribute("id", "ib-list");
    /* The list's scroll is remembered as it moves (a hidden phone list reads 0, so it is not trusted then); drawList() gives it back. */
    ul.addEventListener("scroll", function () { if (ul.clientHeight === 0) return; if (S) S.listTop = ul.scrollTop || 0; });
    var now = new Date();
    shown.forEach(function (it) {
      var li = h("li", ""), sel = S.sel === it.ref, unread = it.unread === true;
      var b = h("button", "ib-item" + (sel ? " is-sel" : "") + (unread ? " ib-unread" : "")); b.setAttribute("type", "button");
      if (sel) b.setAttribute("aria-current", "true");
      /* a Facebook comment is one row like the others; its post line and chips come from inbox-comments.js */
      var cmRow = isComment(it) && window.NOInboxComments ? window.NOInboxComments.row(it) : null;
      var rowName = cmRow ? cmRow.name : nameOf(it.display_name);
      var av = cmRow ? avatarNode(rowName, it.avatar_url) : avatarNode(it.display_name, it.avatar_url);
      var text = h("span", "ib-it"), top = h("span", "ib-top"), nm = h("span", "ib-name");
      nm.appendChild(document.createTextNode(rowName));
      var side = h("span", "ib-side"), rs = h("span", "ib-rs " + (unread ? "ib-rs-u" : "ib-rs-r")); /* the time, and under it the read state: closed envelope unread, open envelope read */
      rs.setAttribute("role", "img"); rs.setAttribute("aria-label", unread ? "Unread" : "Read"); rs.setAttribute("title", unread ? "Unread" : "Read");
      rs.appendChild(icon(unread ? ICON.mail : ICON.mailOpen));
      add(side, h("span", "ib-time", listTime(cmRow ? it.created_at : it.updated_at, now)), rs);
      top.appendChild(nm);
      /* the answered state icon, right after the name, on every channel: a comment has its own state, a conversation its item.answered (none when the API does not send it) */
      var stIcon = cmRow ? cmRow.status : window.NOInboxComments ? window.NOInboxComments.statusIcon(it) : null;
      if (stIcon) { top.classList.add("ib-top-cm"); nm.classList.add("ib-name-cm"); top.appendChild(stIcon); }
      var badges = h("span", "ib-badges");
      add(badges, channelBadge(channelOf(it)));
      if (cmRow) cmRow.chips.forEach(function (c) { badges.appendChild(c); });
      if (it.status === "closed") badges.appendChild(h("span", "chip chip-neutral ib-mini", "Closed"));
      add(text, top, h("span", "ib-snip", cmRow ? it.text || "" : it.snippet || ""), cmRow ? cmRow.line : null, badges);
      add(b, av, text, side);
      b.setAttribute("data-ref", it.ref);
      b.addEventListener("click", function () { openThread(it.ref, rowName); });
      li.appendChild(b); ul.appendChild(li);
    });
    body.appendChild(ul);
    if (canMore) { var more = btn("Show more conversations", "ghost", loadMore); more.classList.add("ib-more"); body.appendChild(more); }
  }
  /* A neutral outlined pill with an icon and words, so the channel never depends on colour (P2). */
  function channelBadge(channel) {
    var c = CHANNEL[channel]; if (!c) return null;
    var b = h("span", "ib-ch");
    b.appendChild(icon(ICON[c.icon]));
    b.appendChild(document.createTextNode(c.label));
    if (c.full) { b.setAttribute("aria-label", c.full); b.setAttribute("title", c.full); } /* the short label is shown; the full name stays for screen readers and the tooltip */
    return b;
  }
  var STATUSES = [["all", "All status"], ["open", "Open"], ["closed", "Closed"]];
  /* The filter toolbar (Coach Ed 2026-11-17, built like the Products toolbar): a row ABOVE the open-conversation card, in the right column,
     [Search] [Channel] [Open/Closed] [Refresh]. It filters the list on the left. On a phone it sits above the list and goes while a
     conversation is open. It is one self-contained block (toolbar()) that syncTools() puts into #ib-tools-host, so it can move with
     one change. lite: Refresh alone, for a list with nothing to filter yet. It is rebuilt only when that mode changes, so the cursor
     stays in the search box while the rows change. */
  function syncTools() {
    var host = byId("ib-tools-host"); if (!host || !S) return;
    var mode = S.state === "ready" ? "full" : S.state === "empty" ? "lite" : "none";
    if (host.getAttribute("data-mode") === mode) return;
    clear(host); host.setAttribute("data-mode", mode);
    if (mode !== "none") host.appendChild(toolbar(mode === "lite"));
  }
  function toolbar(lite) {
    var box = h("div", "ib-tools" + (lite ? " is-lite" : "")), row = h("div", "ib-trow");
    box.appendChild(row);
    if (!lite) {
      row.appendChild(searchBox());
      row.appendChild(channelField());
      row.appendChild(statusField());
    }
    var nt = newTextButton(); if (nt) row.appendChild(nt);
    var bk = bulkButton(); if (bk) row.appendChild(bk);
    row.appendChild(refreshButton());
    return box;
  }
  /* The Channel filter: the house dropdown, showing its real default "All channels". */
  function channelField() {
    var fld = h("div", "ib-fld ib-fld-ch");
    var lab = h("label", "pm-label sr-only", "Channel"); lab.setAttribute("for", "ib-filter");
    var sel = D.el("select", { "class": "ib-input", id: "ib-filter" });
    filtersFor(S.chat).forEach(function (f) { var op = D.el("option", { value: f[0] }, f[1]); if (f[0] === S.filter) op.selected = true; sel.appendChild(op); });
    sel.value = S.filter;
    sel.addEventListener("change", function () {
      if (!S || sel.value === S.filter) return;
      var a = sourcesFor(S.filter, S.status), b = sourcesFor(sel.value, S.status), live = !NB.cmOff && !!window.NOInboxComments; /* no comments to read: nothing to ask again */
      if (a.conv === b.conv && (a.cm === b.cm || !live)) { S.filter = sel.value; S.listTop = 0; fillList(byId("ib-listbody")); var again = byId("ib-filter"); if (again && again.ibFocus) again.ibFocus(); return; }
      /* FB Comment reads only comments, the other channels only conversations, All both: a change between those asks the APIs again */
      applyQuery({ q: S.q, status: S.status, unread: S.unread, answered: S.answered, filter: sel.value }, sel, S.filter);
    });
    add(fld, lab, sel);
    combo(sel, "Channel");
    return fld;
  }
  /* The Open/Closed filter: the same house dropdown. Open and Closed ask the API (?status=); All status sends nothing. */
  function statusField() {
    var fld = h("div", "ib-fld ib-fld-st");
    var lab = h("label", "pm-label sr-only", "Status"); lab.setAttribute("for", "ib-status");
    var sel = D.el("select", { "class": "ib-input", id: "ib-status" });
    var cur = S.status || "all";
    STATUSES.forEach(function (f) { var op = D.el("option", { value: f[0] }, f[1]); if (f[0] === cur) op.selected = true; sel.appendChild(op); });
    sel.value = cur;
    sel.addEventListener("change", function () {
      var v = sel.value === "open" || sel.value === "closed" ? sel.value : "";
      if (S && v !== S.status) applyQuery({ q: S.q, status: v, unread: S.unread, answered: S.answered, filter: S.filter }, sel, S.status || "all");
    });
    add(fld, lab, sel);
    combo(sel, "Status");
    return fld;
  }
  /* The Read/Unread filter (Coach Ed 2026-11-17): one icon toggle in the Conversations header, All -> Unread -> Read -> All. Unread sends
     unread=1, Read sends unread=0; All sends nothing. S.unread is "" | "1" | "0". */
  /* The house tooltip for an icon button: dark, fixed under the button (so no scroll box clips it), opens on hover after about 120 ms, at once
     on focus, and on tap (a touch tap toggles it from what it was before the tap, like the other Inbox tooltips). Its words are the button's
     aria-label, read when it opens and again by ibTipRefresh(). One tooltip is open at a time (window.NOInboxTip). */
  var TIP = window.NOInboxTip = window.NOInboxTip || { close: null };
  function attachTip(btnEl, host) {
    var tip = h("span", "cm-tip cm-tip-b"), id = (btnEl.getAttribute("id") || "ib-t") + "-tip", timer = null, touchTap = false, wasOpen = false, held = false, heldT = null;
    tip.setAttribute("id", id); tip.setAttribute("role", "tooltip"); btnEl.setAttribute("aria-describedby", id); host.appendChild(tip);
    function refresh() { tip.textContent = btnEl.getAttribute("aria-label") || ""; }
    function place() {
      if (!btnEl.getBoundingClientRect) return;
      var r = btnEl.getBoundingClientRect(), w = tip.offsetWidth || 160, vw = window.innerWidth || 375;
      tip.style.top = Math.round(r.bottom + 6) + "px"; tip.style.left = Math.round(Math.max(8, Math.min(r.right - w, vw - w - 8))) + "px";
    }
    function shut() {
      if (timer) { clearTimeout(timer); timer = null; }
      tip.classList.remove("is-open"); if (TIP.close === shut) TIP.close = null;
      if (document.removeEventListener) { document.removeEventListener("click", outside); document.removeEventListener("scroll", onScroll, true); }
    }
    /* A toggle repaints its icon inside its own click, so the click target is already out of the page when the click reaches the document: that
       is not an outside click. The list reload and its scroll reset (held by ibTipHold) are not a user scroll either. */
    function outside(e) { var t = e && e.target; if (t && (t === btnEl || (btnEl.contains && btnEl.contains(t)))) return; if (t && document.contains && !document.contains(t)) return; shut(); }
    function onScroll() { if (held) return; shut(); }
    function open() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (TIP.close && TIP.close !== shut) TIP.close();
      refresh(); tip.classList.add("is-open"); TIP.close = shut; place();
      if (document.addEventListener) { document.addEventListener("click", outside); document.addEventListener("scroll", onScroll, true); }
    }
    btnEl.ibTipHold = function (on) { if (heldT) { clearTimeout(heldT); heldT = null; } if (on) held = true; else heldT = setTimeout(function () { held = false; heldT = null; }, 250); };
    btnEl.addEventListener("pointerdown", function (e) { touchTap = !!e && (e.pointerType === "touch" || e.pointerType === "pen"); wasOpen = tip.classList.contains("is-open"); });
    btnEl.addEventListener("mouseenter", function () { if (touchTap || tip.classList.contains("is-open") || timer) return; timer = setTimeout(function () { timer = null; open(); }, 120); });
    btnEl.addEventListener("mouseleave", function () { if (timer) { clearTimeout(timer); timer = null; } if (!document.activeElement || document.activeElement !== btnEl) shut(); });
    btnEl.addEventListener("focus", open);
    btnEl.addEventListener("blur", shut);
    btnEl.addEventListener("keydown", function (e) { if (e.key === "Escape") shut(); });
    btnEl.addEventListener("click", function () { if (touchTap) { if (wasOpen) shut(); else open(); touchTap = false; } else if (tip.classList.contains("is-open")) refresh(); else open(); });
    btnEl.ibTipRefresh = function () { if (tip.classList.contains("is-open")) { refresh(); place(); } };
  }
  var READS = { "": { icon: "stack", text: "Showing all messages", next: "1" }, "1": { icon: "mail", text: "Showing unread", next: "0" }, "0": { icon: "mailOpen", text: "Showing read", next: "" } };
  function readToggle() {
    var b = h("button", "ib-rtog"); b.setAttribute("type", "button"); b.setAttribute("id", "ib-rtog");
    b.addEventListener("click", function () {
      if (!S) return;
      var v = READS[S.unread || ""].next;
      syncRead(v); /* the new state shows at once; applyQuery puts it back when the read fails */
      if (b.ibTipHold) b.ibTipHold(true);
      applyQuery({ q: S.q, status: S.status, unread: v, answered: S.answered, filter: S.filter }, null, "");
    });
    paintRead(b, S.unread || "");
    return b;
  }
  function paintRead(b, v) {
    var r = READS[v] || READS[""];
    clear(b); b.appendChild(icon(ICON[r.icon]));
    b.setAttribute("aria-label", r.text); b.setAttribute("aria-pressed", v ? "true" : "false");
    b.classList.toggle("is-on", !!v); if (b.ibTipRefresh) b.ibTipRefresh();
  }
  /* Shows v on the toggle, or the real S.unread when v is left out. */
  function syncRead(v) { var b = byId("ib-rtog"); if (b && S) paintRead(b, v === undefined ? S.unread || "" : v); }
  /* The Answered/Unanswered filter (Coach Ed 2026-11-18): the same kind of icon toggle as Read/Unread, beside it in the Conversations header,
     All -> Answered -> Unanswered -> All. It sends answered=answered|unanswered to the conversations list and the comments list; All sends nothing.
     It is not the Open/Closed status. S.answered is "" | "answered" | "unanswered". */
  var ANSWERS = { "": { icon: "comment", text: "Showing answered and unanswered", next: "answered" }, answered: { icon: "check", text: "Showing answered only", next: "unanswered" }, unanswered: { icon: "unans", text: "Showing unanswered only", next: "" } };
  function answeredToggle() {
    var b = h("button", "ib-rtog ib-atog"); b.setAttribute("type", "button"); b.setAttribute("id", "ib-atog");
    b.addEventListener("click", function () {
      if (!S) return;
      var v = ANSWERS[S.answered || ""].next;
      paintAns(b, v); /* the new state shows at once; applyQuery puts it back when the read fails */
      if (b.ibTipHold) b.ibTipHold(true);
      applyQuery({ q: S.q, status: S.status, unread: S.unread, answered: v, filter: S.filter }, null, "");
    });
    paintAns(b, S.answered || "");
    return b;
  }
  function paintAns(b, v) {
    var r = ANSWERS[v] || ANSWERS[""];
    clear(b); b.appendChild(icon(ICON[r.icon]));
    b.setAttribute("aria-label", r.text); b.setAttribute("aria-pressed", v ? "true" : "false");
    b.classList.toggle("is-on", !!v); if (b.ibTipRefresh) b.ibTipRefresh();
  }
  function syncAns(v) { var b = byId("ib-atog"); if (b && S) paintAns(b, v === undefined ? S.answered || "" : v); }
  /* "New text": only while the API says the Text (SMS) feature is there. */
  function newTextButton() {
    if (!SMS || !SMS.util.available(S.chat)) return null;
    var b = h("button", "no-btn no-btn-primary ib-rf ib-nt"); b.setAttribute("type", "button"); b.setAttribute("id", "ib-newtext-btn"); b.setAttribute("aria-label", "New text");
    b.appendChild(icon(ICON.sms)); b.appendChild(h("span", "ib-rf-t", "New text"));
    b.addEventListener("click", function () { if (S) smsCompose(false); });
    return b;
  }
  /* "Text many members": only while the bulk status probe said available:true. */
  function bulkButton() {
    if (!BULK || !S || !S.bulk || S.bulk.available !== true || !SMS || !SMS.util.available(S.chat)) return null;
    var b = h("button", "no-btn no-btn-ghost ib-rf ib-nt"); b.setAttribute("type", "button"); b.setAttribute("id", "ib-bulk-btn"); b.setAttribute("aria-label", "Text many members");
    b.appendChild(icon(ICON.sms)); b.appendChild(h("span", "ib-rf-t", "Text many members"));
    b.addEventListener("click", function () { if (S) bulkOpen(); });
    return b;
  }
  /* The Text many members screen (inbox-bulk.js) in the right pane, like the New text screen. */
  function bulkOpen() {
    if (!S || !BULK || !S.bulk) return;
    var host = byId("ib-threadpane"); if (!host) return;
    closeCompose();
    if (S.sel) { S.sel = null; S.thread = null; S.tstate = ""; tload++; if (window.NOInboxComments) window.NOInboxComments.deselect(); }
    S.composing = true;
    var handle = BULK.screen(host, {
      D: D, h: h, add: add, clear: clear, btn: btn, busy: busy, icon: icon, combo: combo, newKey: newKey, site: S.site, say: say,
      back: function () { closeCompose(); resetPane(); drawList(); },
      gone: function () { closeCompose(); if (S) S.bulk = false; var th = byId("ib-tools-host"); if (th) th.removeAttribute("data-mode"); resetPane(); drawList(); }
    });
    S.composing = handle;
    drawList();
  }
  /* The New text screen (inbox-sms.js) in the right pane; closeCompose() puts the pane back. */
  function closeCompose() { if (S && S.composing) { if (S.composing.stop) S.composing.stop(); S.composing = null; } }
  function smsCompose(again) {
    if (!S || !SMS || !SMS.util.available(S.chat)) return;
    var host = byId("ib-threadpane"); if (!host) return;
    if (again && S.composing && S.composing.stop) S.composing.stop();
    if (!again) { closeCompose(); if (S.sel) { S.sel = null; S.thread = null; S.tstate = ""; tload++; if (window.NOInboxComments) window.NOInboxComments.deselect(); } }
    S.composing = true;
    var handle = SMS.compose(host, {
      D: D, h: h, add: add, clear: clear, btn: btn, busy: busy, icon: icon, combo: combo, newKey: newKey, site: S.site, say: say,
      back: function () { closeCompose(); resetPane(); drawList(); },
      gone: function () { closeCompose(); if (S && S.chat) { S.chat.sms_available = false; S.chat.sms_enabled = false; } resetPane(); load(true); },
      done: function (ref, name) { closeCompose(); resetPane(); if (ref) { openThread(ref, name); load(true); } else drawList(); }
    });
    S.composing = handle;
    drawList();
  }
  function resetPane() {
    var t = byId("ib-threadpane");
    if (!t) return;
    clear(t); t.setAttribute("aria-label", "Conversation");
    t.appendChild(stateBox(ICON.chat, "Choose a conversation", "Pick a customer on the left to read the messages and reply."));
  }
  function refreshButton() {
    var b = h("button", "no-btn no-btn-ghost ib-rf"); b.setAttribute("type", "button"); b.setAttribute("id", "ib-refresh-btn");
    b.appendChild(icon(ICON.refresh)); b.appendChild(h("span", "ib-rf-t", "Refresh"));
    b.addEventListener("click", function () { if (S) refreshAll(b); });
    return b;
  }
  /* INBOX-UI U5: the search box above the list. 300 ms after the last key; fewer than 2 characters is the normal list; works with the
     Channel filter (that one only narrows the rows shown). The house text-field look and the light-blue focus border (inbox.css). */
  function searchBox() {
    var wrap = h("div", "ib-search");
    var lab = h("label", "pm-label sr-only", "Search"); lab.setAttribute("for", "ib-q");
    var row = h("div", "ib-sbox ib-qs"), mag = icon(ICON.search, "ib-si"); /* the Products search box: the magnifier inside, no button */
    var inp = D.el("input", { "class": "ib-sin", id: "ib-q", type: "search", maxlength: "80", autocomplete: "off", spellcheck: "false", placeholder: "Name, email or message" });
    inp.value = S.qText;
    var x = h("button", "ib-sclear"); x.setAttribute("type", "button"); x.setAttribute("aria-label", "Clear search"); x.appendChild(icon(ICON.x)); x.hidden = !S.qText;
    var st = S;
    function later() { if (st.qTimer !== null) clearTimeout(st.qTimer); st.qTimer = setTimeout(function () { st.qTimer = null; if (S === st) searchNow(); }, 300); }
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
    if (!S) return;
    if (S.qTimer !== null) { clearTimeout(S.qTimer); S.qTimer = null; }
    var v = S.qText.trim(), q = v.length >= 2 ? v.slice(0, 80) : "";
    if (q === S.q) return;
    applyQuery({ q: q, status: S.status, unread: S.unread, answered: S.answered, filter: S.filter }, null, "");
  }
  /* A new search text, status, Read/Unread or Channel: one read of the first page of the sources it needs; S changes only when the read worked
     (else `box`, the dropdown, goes back to `revert`). The search goes to both APIs, Read/Unread maps to the comments' unread=1/0, and
     Closed reads no comments (they have no closed state). */
  function holdOff() { ["ib-rtog", "ib-atog"].forEach(function (i) { var b = byId(i); if (b && b.ibTipHold) b.ibTipHold(false); }); }
  function applyQuery(next, box, revert) {
    var mine = ++token, st = S;
    readFirst(sourcesFor(next.filter, next.status), next).then(function (r) {
      if (mine !== token || S !== st || r.unauth) return;
      if (!r.ok) {
        D.toast("That did not work", msgOf(r.fail, "We could not search. Please try again."), "error");
        if (box) { box.value = revert || "all"; if (box.ibSync) box.ibSync(); }
        syncRead(); syncAns(); holdOff();
        return;
      }
      S.listTop = 0; S.q = next.q; S.status = next.status; S.unread = next.unread; S.answered = next.answered || ""; S.filter = next.filter;
      ingest(r, false); S.lsig = sigNow();
      S.state = stateFor(S.items); S.fail = null;
      if (r.conv) takeUnread(r.conv);
      fillList(byId("ib-listbody")); syncRead(); syncAns(); holdOff();
      if (box && box.ibFocus) box.ibFocus(); /* focus stays on the combo that was used (the Channel or the Status one) */
      say(!next.q && !next.status && !next.unread && !next.answered && next.filter === "all" ? "Conversations loaded." : S.items.length ? "Search results loaded." : "No conversations match.");
    });
  }
  /* The banner above the list: at most one chat banner (the daily limit first, else a pause). */
  function bannerBox() {
    var rows = [], cb = chatBanner(S.chat, new Date());
    if (cb && cb.kind === "limit") rows.push(banner(BANNER_LIMIT[0], BANNER_LIMIT[1], null));
    else if (cb) {
      var link = h("a", "no-btn no-btn-ghost", "Resume or change in Settings"); link.setAttribute("href", "/settings/inbox/");
      rows.push(banner("Website chat is paused until " + whenText(cb.until, new Date()) + ".", " Visitors see that chat is not available and are pointed to the contact form.", link));
    }
    if (!rows.length) return null;
    var wrap = h("div", "ib-banners");
    rows.forEach(function (r) { wrap.appendChild(r); });
    return wrap;
  }
  function banner(strong, rest, action) {
    var b = h("div", "ib-banner"); b.setAttribute("role", "status");
    b.appendChild(icon(ICON.warn));
    var body = h("div", "ib-bbody"), text = h("div", "");
    add(text, h("strong", "", strong), document.createTextNode(rest));
    add(body, text, action);
    b.appendChild(body);
    return b;
  }
  function drawList() {
    var body = byId("ib-listbody"), p = byId("ib-listpane");
    if (!body || !S) return;
    var top = S.listTop || 0; /* a click, a read mark, a poll or a chip change redraws the rows, never moves the list */
    fillList(body);
    if (document.body && document.body.classList) document.body.classList.toggle("ib-thread", paneOpen()); /* phone: the page heading gives its room to the open thread */
    if (p) { if (paneOpen()) p.classList.add("is-hide-phone"); else p.classList.remove("is-hide-phone"); }
    var th = byId("ib-tools-host"); if (th) { if (paneOpen()) th.classList.add("is-hide-phone"); else th.classList.remove("is-hide-phone"); }
    var t = byId("ib-threadpane");
    if (t) { if (paneOpen()) t.classList.remove("is-hide-phone"); else t.classList.add("is-hide-phone"); }
    var nul = body.querySelector ? body.querySelector(".ib-list") : null;
    if (nul && top) nul.scrollTop = top; /* on the phone the list is hidden while a thread is open: its drawList on "< Inbox" restores it */
  }
  function threadPane() {
    var p = pane(S.sel ? "Conversation with " + (S.selName || "customer") : "Conversation", "ib-threadpane" + (paneOpen() ? "" : " is-hide-phone"));
    p.setAttribute("id", "ib-threadpane");
    if (!S.sel && !S.composing) p.appendChild(stateBox(ICON.chat, "Choose a conversation", "Pick a customer on the left to read the messages and reply."));
    return p;
  }

  /* The thread's head: back (phone), avatar, name with its channel badge and state chip, an optional address, and the action:
     Close or Reopen conversation (mockups d2 to d4). */
  function threadHead(name, o) {
    o = o || {};
    var head = h("div", "ib-thead");
    var back = h("button", "ib-back"); back.setAttribute("type", "button"); back.setAttribute("id", "ib-back");
    back.appendChild(icon(ICON.back)); back.appendChild(h("span", "", "Inbox"));
    back.addEventListener("click", function () { S.sel = null; S.thread = null; S.tstate = ""; tload++; if (window.NOInboxComments) window.NOInboxComments.deselect(); drawList(); var t = byId("ib-threadpane"); if (t) { clear(t); t.setAttribute("aria-label", "Conversation"); t.appendChild(stateBox(ICON.chat, "Choose a conversation", "Pick a customer on the left to read the messages and reply.")); } });
    var av = avatarNode(name, o.avatar);
    var nm = h("div", "ib-tname"); nm.appendChild(h("h2", "", nameOf(name)));
    if (o.channel) {
      var row = h("div", "ib-chrow"); add(row, channelBadge(o.channel));
      if (o.status) row.appendChild(h("span", "chip ib-mini " + (o.status === "closed" ? "chip-neutral" : "chip-ok"), o.status === "closed" ? "Closed" : "Open"));
      if (o.chip) row.appendChild(o.chip);
      (o.chips || []).forEach(function (c) { row.appendChild(c); });
      nm.appendChild(row);
    } else if (o.chip) nm.appendChild(o.chip);
    if (o.sub) nm.appendChild(h("p", "ib-sub", o.sub));
    add(head, back, av, nm);
    if (o.action) head.appendChild(o.action);
    return head;
  }
  /* ---------- close and reopen ---------- */

  function setStatus(b, to) {
    if (S.closing || !S.sel) return;
    var mine = tload, ref = S.sel, st = S;
    S.closing = true; busy(b, true);
    D.call("POST", base() + "conversations/" + encodeURIComponent(ref) + "/" + (to === "closed" ? "close" : "reopen") + "/", null, true).then(function (res) {
      st.closing = false;
      if (res.status === 401) return;
      if (S !== st || mine !== tload || S.sel !== ref) return;
      busy(b, false);
      if (!res.ok) {
        D.toast("That did not work", res.status === 409 ? msgOf(res, "That visitor already has another open conversation.") : msgOf(res, "We could not change this conversation. Please try again."), "error");
        return;
      }
      var status = res.data && res.data.status === "closed" ? "closed" : "open";
      S.items.forEach(function (i) { if (i.ref === ref) i.status = status; });
      if (S.thread) { S.thread.status = status; S.thread.reply = { open: status === "open", reason: status === "open" ? "" : "closed" }; }
      S.notice = null;
      drawList(); drawThread(status === "open");
      say(status === "closed" ? "Conversation closed." : "Conversation reopened.");
    });
  }
  function statusButton(closed) {
    var b = btn(closed ? "Reopen conversation" : "Close conversation", closed ? "primary" : "ghost", function (x) { setStatus(x, closed ? "open" : "closed"); });
    b.classList.add("ib-open");
    return b;
  }

  /* keepView: a background read. Gives back the text of the reply box (it lives in S.drafts), the focus and the scroll. */
  function drawThread(focusBox, keepView) {
    var p = byId("ib-threadpane"); if (!p || !S || !S.sel) return;
    if (isCommentRef(S.sel)) { if (window.NOInboxComments) window.NOInboxComments.draw(); return; }
    var keep = null;
    if (keepView) {
      var om = p.querySelector ? p.querySelector(".ib-msgs") : null, ae = document.activeElement;
      keep = { top: om ? om.scrollTop : 0, bottom: !om || om.scrollHeight - om.scrollTop - om.clientHeight <= 24, ta: !!ae && ae.id === "ib-rb", msgs: !!om && ae === om, s: null, e: null };
      if (keep.ta) { keep.s = ae.selectionStart; keep.e = ae.selectionEnd; }
    }
    clear(p);
    var t = S.thread;
    p.setAttribute("aria-label", "Conversation with " + (t && t.display_name ? t.display_name : S.selName || "customer"));
    p.classList.remove("is-hide-phone");
    if (S.tstate === "loading" || !t) {
      p.appendChild(threadHead(S.selName, { channel: channelOf({ ref: S.sel }), avatar: avatarOfRef(S.sel) }));
      if (S.tstate === "failed") {
        var f = S.tfail || { kind: "down" }, text = f.kind === "gone" ? "This conversation is no longer available." : f.kind === "down" ? "We could not load this conversation just now. Wait a moment, then try again." : f.message || "Please try again.";
        p.appendChild(stateBox(ICON.warn, "We couldn't open this conversation", text, [btn("Try again", "primary", function (b) { busy(b, true); S.tstate = "loading"; drawThread(); fetchThread(false); }, ICON.refresh)], true));
      } else p.appendChild(h("p", "pm-meta ib-loading", "Opening the conversation…"));
      return;
    }
    var name = nameOf(t.display_name || S.selName), now = new Date();
    var channel = channelOf(t.channel ? t : { ref: S.sel });
    var closed = t.status === "closed";
    p.appendChild(threadHead(name, { channel: channel, status: closed ? "closed" : "open", sub: subOf(channel, t), action: statusButton(closed), avatar: typeof t.avatar_url === "string" ? t.avatar_url : avatarOfRef(S.sel) }));
    var note = noteFor(channel, t);
    if (note) p.appendChild(note);
    /* messages */
    var msgs = h("div", "ib-msgs"); msgs.setAttribute("tabindex", "0"); msgs.setAttribute("aria-label", "Messages");
    var codes = failCodes(Array.isArray(t.messages) ? t.messages : [], t.replies);
    var ord = ordered(Array.isArray(t.messages) ? t.messages : []), seenMsg = null;
    ord.forEach(function (m) { if (m.direction === "out" && m.delivery_state === "seen") seenMsg = m; });
    var list = ord.map(function (m) {
      return { out: m.direction === "out", text: bubbleText(m), at: m.at, chip: chipFor(channel, m, codes[m.id], m === seenMsg), tag: channel === "email" && m.direction === "in" && /^Subject: /.test(m.text || "") ? "Contact form" : "" };
    });
    var lastDay = "";
    list.forEach(function (m, idx) {
      var d = validDate(m.at), key = d ? dayKey(d) : "";
      if (key && key !== lastDay) { lastDay = key; msgs.appendChild(h("div", "ib-day", dayLabel(m.at, now))); }
      /* U4: bubbles of one sender within 5 minutes make a group: tight spacing, and the time only under the last of them */
      var same = grouped(m, list[idx + 1]);
      var row = h("div", "ib-msg " + (m.out ? "ib-msg-out" : "ib-msg-in") + (same ? " ib-grp" : ""));
      var meta = h("span", "ib-meta", d && !same ? clock(d) : "");
      if (m.tag) { meta.appendChild(document.createTextNode(" ")); var tag = h("span", "ib-ch"); tag.appendChild(icon(ICON.mail)); tag.appendChild(document.createTextNode(m.tag)); meta.appendChild(tag); }
      if (m.chip) meta.appendChild(h("span", "chip chip-" + m.chip[0] + " ib-mini ib-long", m.chip[1]));
      add(row, h("p", "ib-bub", m.text), same && !m.tag && !m.chip ? null : meta);
      msgs.appendChild(row);
    });
    if (!list.length) msgs.appendChild(h("p", "pm-meta", "No messages to show."));
    p.appendChild(msgs);
    var smsInfo = channel === "sms" && SMS ? smsInfoOf(t) : null;
    p.appendChild(replyBox(name, !closed && !(smsInfo && smsInfo.off), focusBox, windowClosed(channel, t), channel === "messenger" ? windowNotice(t, now) : "", smsInfo));
    if (keep && !keep.bottom) msgs.scrollTop = keep.top; else msgs.scrollTop = msgs.scrollHeight;
    if (keep) {
      var back = null;
      if (keep.ta) { back = byId("ib-rb"); if (back && back.disabled) back = null; }
      else if (keep.msgs) back = msgs;
      if (back) {
        try { back.focus({ preventScroll: true }); } catch (e1) { back.focus(); }
        if (keep.ta && keep.s !== null && back.setSelectionRange) { try { back.setSelectionRange(keep.s, keep.e); } catch (e2) { /* not a text box now */ } }
        if (!keep.bottom) msgs.scrollTop = keep.top;
      }
    }
  }
  /* What a text conversation's reply box needs: the room for the owner's own words (the server's max_length), the store-name prefix, the words when
     the box is off (opted out, switch off, answers cannot arrive, no usable prefix) and the phone/quota lines. */
  function smsInfoOf(t) {
    var u = SMS.util, max = u.maxOf(t), reason = t.reply && t.reply.open === false && typeof t.reply.reason === "string" ? t.reply.reason : "";
    var off = t.status === "closed" ? "" : reason && reason !== "closed" ? u.offText(reason) || "Texts can't be sent right now." : max === null && t.status !== "closed" ? "Texts can't be sent right now." : "";
    return { max: max, prefix: u.prefixOf(t), off: off, offline: u.phoneOffline(S.smsStatus), quota: u.quota(S.smsStatus) };
  }
  /* The line under the name: an email thread's address; a chat visitor's email and mobile number, as far as they left them (the chat's contact ask). */
  function subOf(channel, t) {
    if (channel === "email") return t.contact_email;
    if (channel === "sms") return typeof t.contact_mobile === "string" ? t.contact_mobile : ""; /* masked by the server; the full number never reaches the page */
    if (channel !== "webchat") return "";
    var parts = [];
    if (typeof t.contact_email === "string" && t.contact_email) parts.push(t.contact_email);
    if (typeof t.contact_mobile === "string" && t.contact_mobile) parts.push(t.contact_mobile);
    return parts.join(" \u00B7 ");
  }
  /* The note under a stored thread's head: no email given (chat), or the contact-form address nobody confirmed (email). A note only (P1). */
  function noteFor(channel, t) {
    if (channel === "webchat" && !t.contact_email) return noteBox(NOTE_NO_EMAIL, true);
    if (channel === "email" && t.auth_flag !== "") return noteBox(NOTE_UNVERIFIED, false);
    return null;
  }
  function noteBox(text, info) {
    var n = h("p", "ib-note" + (info ? " ib-note-info" : "")); n.appendChild(icon(info ? ICON.chat : ICON.warn)); n.appendChild(h("span", "", text));
    return n;
  }
  function replyBox(name, open, focusBox, windowOff, winNote, sms) {
    var MAXL = sms && sms.max ? sms.max : MAX; /* a text's room is the server's: 160 less the store-name prefix */
    var wrap = h("div", "ib-reply" + (open ? "" : " is-closed"));
    var lab = h("label", "pm-label sr-only", open ? "Reply to " + name : "Reply"); lab.setAttribute("for", "ib-rb");
    var ta = h("textarea", "pm-input ib-ta"); ta.setAttribute("id", "ib-rb"); ta.setAttribute("rows", open ? "3" : "2"); ta.setAttribute("aria-describedby", "ib-rc");
    var count = h("span", "ib-count", "0 / " + MAXL); count.setAttribute("id", "ib-rc");
    var foot = h("div", "ib-rfoot");
    if (open && windowOff) {
      /* Messenger: the 24-hour window is over. The box is off and the reason is said (the account's plain rule, not an error). */
      ta.disabled = true; ta.setAttribute("aria-describedby", "ib-rn");
      /* Finding 2: the sentence sits above the box, like the open-window notice (U3). */
      var win = h("p", "ib-note ib-note-info ib-wclosed"); win.setAttribute("id", "ib-rn"); win.appendChild(icon(ICON.chat)); win.appendChild(h("span", "", NOTE_WINDOW));
      var sendOff1 = btn("Send", "primary"); sendOff1.disabled = true; sendOff1.setAttribute("aria-disabled", "true");
      add(wrap, win, lab, ta, add(foot, count, sendOff1));
      wrap.classList.add("is-closed");
      return wrap;
    }
    if (!open) {
      /* d4: a closed conversation. The box is off and the reason is said. */
      ta.disabled = true; ta.setAttribute("aria-describedby", "ib-rn");
      var why = h("p", "ib-closed-t"); why.setAttribute("id", "ib-rn");
      if (sms && sms.off) add(why, h("strong", "", sms.off)); else add(why, h("strong", "", "This conversation is closed."), document.createTextNode(" Reopen it to reply."));
      var sendOff0 = btn("Send", "primary"); sendOff0.disabled = true; sendOff0.setAttribute("aria-disabled", "true");
      add(wrap, lab, ta, why, add(foot, count, sendOff0));
      return wrap;
    }
    if (S.notice) {
      var fail = h("div", "ib-fail"); fail.setAttribute("role", "alert"); fail.appendChild(icon(ICON.warn));
      var body = h("div", "");
      add(body, h("strong", "", "Your reply was not sent."), document.createTextNode(" " + S.notice + " Your text is still in the box."));
      fail.appendChild(body); wrap.appendChild(fail);
    }
    if (sms) {
      /* the phone's state and this store's counts above the box, and the words every text starts with */
      if (sms.offline) { var of = h("p", "ib-note ib-wnote"); of.setAttribute("role", "status"); of.appendChild(icon(ICON.warn)); of.appendChild(h("span", "", SMS.util.OFFLINE)); wrap.appendChild(of); }
      if (sms.prefix) wrap.appendChild(h("p", "pm-hint ib-sms-prefix", "Every text starts with: " + sms.prefix));
      if (sms.quota) wrap.appendChild(h("p", "pm-hint ib-sms-quota", sms.quota));
    }
    ta.setAttribute("maxlength", String(sms ? MAXL + 40 : MAX)); /* a text may run a little over so the counter and the words can say so */
    ta.value = draftOf();
    var go = btn(S.notice ? "Try again" : "Send", "primary", function (b) { send(b, ta); });
    /* U4: Enter sends, Shift+Enter is a new line, never while an IME is composing; on a phone Enter is a new line and Send is the button */
    ta.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229 || coarse()) return;
      e.preventDefault();
      if (!go.disabled) send(go, ta);
    });
    function sync() {
      S.drafts[S.sel] = ta.value;
      count.textContent = ta.value.length + " / " + MAXL;
      var bad = sms ? SMS.util.problem(ta.value, MAXL) : "";
      if (sms) { var ep = byId("ib-rp"); if (ep) { ep.textContent = bad; ep.hidden = !bad; } }
      go.disabled = !ta.value.trim() || S.sending || !!bad || (!!sms && !!sms.offline);
    }
    ta.addEventListener("input", sync);
    if (winNote) { var wn = h("p", "ib-note ib-note-info ib-wnote"); wn.setAttribute("role", "status"); wn.appendChild(icon(ICON.chat)); wn.appendChild(h("span", "", winNote)); wrap.insertBefore ? wrap.insertBefore(wn, wrap.firstChild) : wrap.appendChild(wn); }
    if (sms) { var pe = h("p", "field-err", ""); pe.setAttribute("id", "ib-rp"); pe.setAttribute("role", "alert"); pe.hidden = true; add(wrap, lab, ta, pe, add(foot, count, go)); }
    else add(wrap, lab, ta, add(foot, count, go));
    sync();
    if (focusBox) setTimeout(function () { ta.focus(); }, 0);
    return wrap;
  }

  /* The Refresh button is part of the filter row (refreshButton). */
  (function wire() {
    if (document.addEventListener) document.addEventListener("visibilitychange", onVisible);
    if (document.addEventListener) document.addEventListener("visibilitychange", function () { if (tabHidden()) badgeStop(); else if (!S) badgeRead(); });
    if (window.addEventListener) window.addEventListener("focus", function () { pollKick(); if (S) streamOpen(); });
  })();

  window.NOInbox = { show: show, hide: hide, probe: probe,
    util: { dayKey: dayKey, listTime: listTime, dayLabel: dayLabel, whenText: whenText, initialsOf: initialsOf, ordered: ordered, bubbleText: bubbleText,
      newKey: newKey, failure: failure, channelOf: channelOf, filterItems: filterItems, chipFor: chipFor,
      failCodes: failCodes, failTextOf: failTextOf, chatBanner: chatBanner, windowClosed: windowClosed,
      grouped: grouped, windowNotice: windowNotice, badgeText: badgeText,
      timeOf: timeOf, sortNewest: sortNewest, horizonOf: horizonOf, visibleOf: visibleOf, nextSource: nextSource, mergeSource: mergeSource,
      sourcesFor: sourcesFor, commentQuery: commentQuery, unreadSum: unreadSum },
    combo: combo };
})();
