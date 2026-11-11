/* The Inbox pages of the HQ staff app, SMS only (ClickUp z8uq9me128, plan 5): the list of conversations, one
   conversation with its reply form, and New SMS. One script serves /inbox/sms/ and /inbox/sms/new/.
   Which conversation is open is held in memory only: no number, text or id is in an address, in storage or in
   the console, and a reload returns to the list. Every action is one button press: there is no timer and no
   automatic refresh. The page decides nothing about access or about what a valid text is: the backend does,
   and the page follows its answer. A raw backend value is never shown; the backend's own words are shown only
   for the nine codes named in SHOWN. The user card and Sign out are shell.js's. */
(function () {
  var H = window.NOHq, $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["boot", "v-list", "v-conv", "v-new", "v-closed", "v-down"];
  var WITH_TABS = ["v-list", "v-conv", "v-new"];
  var LIMIT = 160;
  var SHOWN = { invalid_text: 1, invalid_mobile: 1, invalid_request: 1, invalid_cursor: 1, cannot_reply: 1,
    forbidden: 1, rate_limited: 1, limit_reached: 1, sms_paused: 1 };
  var FIXED = {
    sms_unavailable: "The text could not be sent right now. Try again later.",
    request_in_progress: "This text is already being sent. Check the conversation before you send it again." };
  var LOST = "That did not go through. Check the conversation before trying again.";
  var UNSURE = "We could not tell whether it was sent. Look at the conversation before you send again.";
  var GONE = "That conversation is no longer available.";
  var NO_REPLY = "This sender is not a mobile number, so it cannot be replied to.";
  var READ_ONLY = "You can read the Inbox but not send texts.";
  /* The reason words for a text that was not sent. A reason with no words here is not shown. */
  var REASON = { text_lost: "the text was lost before it could be sent", expired: "the phone did not take it in time",
    no_report: "the phone did not report back" };
  var WAITING = { queued: 1, dispatched: 1 };
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
    "November", "December"];

  var status = null;          /* the last inbox/status/ answer */
  var view = "boot", filter = "all", cursor = null, listRun = 0, found = false;
  var conv = null, convRun = 0, pushed = false, busy = false;
  var replyId = null, newId = null;
  var mark = document.querySelector ? document.querySelector("svg") : null;
  var SVG = mark ? mark.namespaceURI : null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.setAttribute("class", cls);
    if (text != null) n.textContent = text;
    return n;
  }
  function icon(d) {
    var svg = document.createElementNS(SVG, "svg"), path = document.createElementNS(SVG, "path");
    [["viewBox", "0 0 24 24"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "2"],
      ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"], ["focusable", "false"]]
      .forEach(function (a) { svg.setAttribute(a[0], a[1]); });
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
  }
  function show(name) {
    view = name;
    VIEWS.forEach(function (id) { $(id).hidden = id !== name; });
    $("tabs").hidden = WITH_TABS.indexOf(name) < 0;
  }
  function say(id, text) { $(id).textContent = text || ""; $(id).hidden = !text; }
  function words(map, key) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : ""; }
  function num(n) { return typeof n === "number" && isFinite(n) ? String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "0"; }

  /* True when the answer sent the person to sign in or to the second step. */
  function left(res) {
    var place = H.placeFor(res);
    if (place === "verify") { location.replace("/verify/"); return true; }
    if (place === "sign-in") { location.replace("/sign-in/"); return true; }
    return false;
  }

  /* ---- times ---- */

  function timeOf(iso) { return H.when(iso).split(", ")[1] || ""; }
  /* The time for today, "9 Nov" for another day this year, the date with its year otherwise. */
  function short(iso) {
    var full = H.when(iso).split(", "), today = H.when(new Date().toISOString()).split(", ");
    if (!full[0]) return "";
    if (full[0] === today[0]) return full[1];
    return full[0].split(" ")[2] === today[0].split(" ")[2] ? full[0].split(" ").slice(0, 2).join(" ") : full[0];
  }
  /* "Wednesday, 11 November 2026", in Manila. */
  function dayLabel(iso) {
    var d = new Date(iso), p = {};
    if (!iso || isNaN(d.getTime())) return "";
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "long", day: "numeric", month: "numeric",
      year: "numeric" }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p.weekday + ", " + p.day + " " + MONTHS[Number(p.month) - 1] + " " + p.year;
  }

  /* ---- the status, on every view ---- */

  function paintStatus() {
    var s = status || {}, online = !!s.phone_online, used = num(s.used_today) + " of " + num(s.cap) + " texts used today";
    [["chip-phone", "chip-phone-text"], ["n-chip-phone", "n-chip-phone-text"]].forEach(function (ids) {
      $(ids[0]).setAttribute("class", "chip " + (online ? "chip-ok" : "chip-warn"));
      $(ids[1]).textContent = online ? "Gateway phone online" : "Gateway phone offline";
    });
    $("chip-used").textContent = used;
    $("n-chip-used").textContent = used;
    $("new-sms").hidden = !s.send;
    $("seg-unread-n").textContent = String(typeof s.unread === "number" ? s.unread : 0);
    $("n-reserve").textContent = num(s.reserved_for_codes) + " texts a day are kept for sign-in codes. Staff texts stop once " +
      num((s.cap || 0) - (s.reserved_for_codes || 0)) + " are used that day.";
    if (window.NOHqMenu) window.NOHqMenu.setUnread(s.unread);
  }

  /* Resolves true when the status is read. A 404 shows the closed card and gives no reason: the page cannot
     tell "switched off" from "no access". */
  function loadStatus() {
    return H.call("POST", "inbox/status/", { platform: "sms" }).then(function (res) {
      if (left(res)) return false;
      if (res.status === 404) { show("v-closed"); return false; }
      if (!res.ok) { if (status) return true; show("v-down"); return false; }
      status = res.data;
      paintStatus();
      return true;
    });
  }

  /* ---- the list ---- */

  function statusChip(row) {
    var s = row.last_status;
    if (row.last_direction !== "out") return null;
    if (words(WAITING, s)) return el("span", "chip chip-warn", "Waiting");
    if (s === "sent") return el("span", "chip chip-ok", "Sent");
    return el("span", "chip chip-neutral", "Not sent");
  }
  function row(c) {
    var li = el("li"), b = el("button", "item" + (c.unread > 0 ? " unread" : "")), tile = el("span", "icon-tile");
    var main = el("span", "item-main"), end = el("span", "item-end"), chip;
    b.setAttribute("type", "button");
    tile.appendChild(icon(c.last_direction === "out" ? "M7 17L17 7M9 7h8v8" : "M17 7L7 17M7 9v8h8"));
    main.appendChild(el("span", "item-num", c.contact));
    main.appendChild(el("span", "item-sub", c.last_direction === "out" ? "Sent" : "Received"));
    end.appendChild(el("span", "item-time", short(c.last_message_at)));
    chip = c.unread > 0 ? el("span", "chip chip-info", c.unread + " unread") : statusChip(c);
    if (!chip && !c.can_reply) chip = el("span", "chip chip-neutral", "Cannot reply");
    if (chip) end.appendChild(chip);
    b.appendChild(tile);
    b.appendChild(main);
    b.appendChild(end);
    b.addEventListener("click", function () { openConversation(c.id); });
    li.appendChild(b);
    return li;
  }
  function paintRows(rows, more) {
    rows.forEach(function (c) { $("rows").appendChild(row(c)); });
    $("more").hidden = !more;
    $("l-empty").hidden = $("rows").children.length > 0;
  }
  function emptyWords() {
    return found ? "No conversation with that number." : filter === "unread" ? "No unread conversations." : "No conversations yet.";
  }

  function loadList(more) {
    var run = ++listRun, body = { platform: "sms", state: filter };
    if (more && cursor) body.cursor = cursor;
    if (!more) {
      $("rows").textContent = "";
      $("more").hidden = true;
      $("l-empty").hidden = true;
      $("l-loading").hidden = false;
      $("found-line").hidden = true;
      found = false;
    }
    return H.call("POST", "inbox/conversations/list/", body).then(function (res) {
      if (run !== listRun) return;
      $("l-loading").hidden = true;
      if (left(res)) return;
      if (res.status === 404) { show("v-closed"); return; }
      if (!res.ok) { say("l-msg", "The conversations could not be loaded. Try again."); return; }
      cursor = res.data.next || null;
      $("l-empty").textContent = emptyWords();
      paintRows(res.data.results || [], !!cursor);
    });
  }

  /* The list view. The status is read again unless the caller has just read it. */
  function showList(message, statusFresh) {
    show("v-list");
    say("l-msg", message || "");
    return Promise.all([statusFresh ? Promise.resolve(true) : loadStatus(), loadList(false)]).then(function () {
      if (location.hash === "#find" && view === "v-list") $("find-number").focus();
    });
  }

  function find(number) {
    var run = ++listRun;
    $("rows").textContent = "";
    $("more").hidden = true;
    $("l-empty").hidden = true;
    $("l-loading").hidden = false;
    say("l-msg", "");
    return H.call("POST", "inbox/conversations/find/", { platform: "sms", number: number }).then(function (res) {
      if (run !== listRun) return;
      $("l-loading").hidden = true;
      if (left(res)) return;
      if (res.status === 404) { show("v-closed"); return; }
      if (!res.ok) { say("l-msg", "The search did not go through. Try again."); return; }
      found = true;
      cursor = null;
      $("found-line").hidden = false;
      $("l-empty").textContent = emptyWords();
      paintRows(res.data.results || [], false);
    });
  }

  /* ---- one conversation ---- */

  function bubble(m) {
    var out = m.direction === "out", st = m.status, cls = "msg " + (out ? "out" : "in");
    var failed = out && (st === "failed" || st === "expired"), meta = el("p", "msg-meta"), box, reason, label;
    if (failed) cls += " failed";
    box = el("div", cls);
    box.appendChild(el("p", "bubble", String(m.body == null ? "" : m.body) + (m.clipped ? " (cut short)" : "")));
    if (!out) {
      meta.appendChild(el("span", "", "Received"));
    } else if (words(WAITING, st)) {
      meta.appendChild(el("span", "", "Waiting to send"));
    } else if (st === "sent") {
      meta.appendChild(el("span", "", "Sent"));
    } else {
      reason = words(REASON, m.reason) || (st === "expired" ? REASON.expired : "");
      label = "Not sent" + (reason ? ": " + reason : "");
      meta.appendChild(failed ? el("strong", "", label) : el("span", "", label));
    }
    if (out && typeof m.author === "string" && m.author) meta.appendChild(el("span", "", m.author));
    meta.appendChild(el("span", "", timeOf(m.at)));
    box.appendChild(meta);
    return box;
  }
  function paintThread() {
    var t = $("thread"), last = "";
    t.textContent = "";
    conv.messages.forEach(function (m) {
      var d = dayLabel(m.at);
      if (d && d !== last) { t.appendChild(el("span", "day", d)); last = d; }
      t.appendChild(bubble(m));
    });
    $("earlier-row").hidden = !conv.next;
  }

  function countOf(textId, countId) {
    var n = String($(textId).value || "").length;
    $(countId).textContent = n + " / " + LIMIT;
    $(countId).setAttribute("class", n > LIMIT ? "counter over" : "counter");
    return n;
  }
  function replyReady() {
    var text = String($("reply-text").value || "");
    $("reply-go").disabled = !(text.trim().length > 0 && text.length <= LIMIT && !busy);
  }
  function newReady() {
    var text = String($("text").value || "");
    $("new-go").disabled = !(text.trim().length > 0 && text.length <= LIMIT && String($("to").value || "").trim().length > 0 && !busy);
  }

  function paintConversation() {
    var canSend = !!(status && status.send);
    $("c-title").textContent = conv.contact;
    $("c-chip").hidden = !conv.can_reply;
    paintThread();
    $("reply-form").hidden = !(conv.can_reply && canSend);
    $("c-noreply").hidden = conv.can_reply && canSend;
    $("c-noreply").textContent = !conv.can_reply ? NO_REPLY : READ_ONLY;
    say("reply-err", "");
    say("reply-box", "");
    countOf("reply-text", "reply-count");
    replyReady();
  }

  function enter(data, push) {
    conv = { id: data.id, contact: String(data.contact || ""), can_reply: !!data.can_reply,
      messages: data.messages || [], next: data.next || null };
    replyId = null;
    $("reply-text").value = "";
    show("v-conv");
    say("c-msg", "");
    paintConversation();
    /* One history entry with the page's own address and no data, so Back closes the conversation. */
    if (push && !pushed && typeof history.pushState === "function") {
      history.pushState(null, "", location.pathname);
      pushed = true;
    }
  }

  function readConversation(id, before) {
    var b = { platform: "sms", conversation: id };
    if (before) b.cursor = before;
    return H.call("POST", "inbox/conversations/open/", b);
  }

  /* An answer that ends the conversation view. Returns true when it was one. */
  function ended(res) {
    if (left(res)) return true;
    if (res.status === 404) { closeConversation(true, GONE); return true; }
    return false;
  }

  function openConversation(id) {
    var run = ++convRun;
    show("v-conv");
    say("c-msg", "");
    $("c-title").textContent = "";
    $("thread").textContent = "";
    $("earlier-row").hidden = true;
    $("reply-form").hidden = true;
    $("c-noreply").hidden = true;
    $("c-loading").hidden = false;
    return readConversation(id).then(function (res) {
      if (run !== convRun) return;
      $("c-loading").hidden = true;
      if (ended(res)) return;
      if (!res.ok) { conv = null; showList("That conversation could not be opened. Try again."); return; }
      enter(res.data, true);
    });
  }

  function closeConversation(fromPop, message) {
    var wasPushed = pushed;
    conv = null;
    convRun++;
    pushed = false;
    if (wasPushed && !fromPop && typeof history.back === "function") history.back();
    showList(message);
  }

  $("back").addEventListener("click", function (e) { e.preventDefault(); closeConversation(false); });
  window.addEventListener("popstate", function () { if (view === "v-conv") closeConversation(true); });

  $("c-refresh").addEventListener("click", function () {
    if (!conv || busy) return;
    var run = ++convRun;
    readConversation(conv.id).then(function (res) {
      if (run !== convRun || !conv) return;
      if (ended(res)) return;
      if (!res.ok) { say("c-msg", "The conversation could not be refreshed. Try again."); return; }
      conv.messages = res.data.messages || [];
      conv.next = res.data.next || null;
      say("c-msg", "");
      paintThread();
    });
  });

  $("earlier").addEventListener("click", function () {
    if (!conv || !conv.next || busy) return;
    var run = ++convRun, root = document.documentElement, before = root ? root.scrollHeight : 0, y = window.scrollY || 0;
    readConversation(conv.id, conv.next).then(function (res) {
      if (run !== convRun || !conv) return;
      if (ended(res)) return;
      if (!res.ok) { say("c-msg", "Earlier texts could not be loaded. Try again."); return; }
      conv.messages = (res.data.messages || []).concat(conv.messages);
      conv.next = res.data.next || null;
      say("c-msg", "");
      paintThread();
      if (root && typeof window.scrollTo === "function") window.scrollTo(0, y + (root.scrollHeight - before));
    });
  });

  /* ---- sending ---- */

  /* 32 random hex characters, kept until the call is answered 200 or 201. */
  function freshId() {
    var c = window.crypto, bytes = new Uint8Array(16), out = "", i;
    if (!c || typeof c.getRandomValues !== "function") return "";
    c.getRandomValues(bytes);
    for (i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    return out;
  }
  function fieldWords(res, field) {
    var f = res.fields && res.fields[field];
    return Array.isArray(f) && typeof f[0] === "string" && f[0] ? f[0] : res.message || "";
  }
  /* The words for a refusal not tied to a field. */
  function refusal(res) {
    if (words(SHOWN, res.code) && res.message) return res.message;
    return words(FIXED, res.code) || LOST;
  }
  function setBusy(on) { busy = on; replyReady(); newReady(); }

  $("reply-text").addEventListener("input", function () { countOf("reply-text", "reply-count"); replyReady(); });
  $("reply-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || !conv || $("reply-go").disabled) return;
    var text = String($("reply-text").value || ""), id = conv.id;
    if (!replyId) replyId = freshId();
    if (!replyId) { say("reply-box", "This browser cannot send a text safely."); return; }
    say("reply-err", "");
    say("reply-box", "");
    setBusy(true);
    H.call("POST", "inbox/conversations/reply/", { platform: "sms", conversation: id, text: text, request_id: replyId })
      .then(function (res) {
        setBusy(false);
        if (!conv || conv.id !== id) return;
        if (res.ok) {
          replyId = null;
          if (res.data && res.data.message) conv.messages.push(res.data.message);
          $("reply-text").value = "";
          countOf("reply-text", "reply-count");
          paintThread();
          replyReady();
          return;
        }
        if (res.status === 0) { say("reply-box", UNSURE); return; }
        if (ended(res)) return;
        if (res.code === "invalid_text") { say("reply-err", fieldWords(res, "text")); return; }
        say("reply-box", refusal(res));
      });
  });

  /* ---- New SMS ---- */

  function showNew() {
    var canSend = !!(status && status.send);
    show("v-new");
    $("n-readonly").hidden = canSend;
    $("n-cols").hidden = !canSend;
    countOf("text", "text-count");
    newReady();
  }
  function clearNewErrors() {
    ["to-err", "text-err", "n-box"].forEach(function (id) { $(id).hidden = true; });
    $("to").removeAttribute("aria-invalid");
    $("text").removeAttribute("aria-invalid");
  }
  function flag(inputId, errId, text) {
    say(errId, text);
    $(inputId).setAttribute("aria-invalid", "true");
  }
  function box(text) { $("n-box-text").textContent = text; $("n-box").hidden = false; }

  $("to").addEventListener("input", newReady);
  $("text").addEventListener("input", function () { countOf("text", "text-count"); newReady(); });
  $("new-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || $("new-go").disabled) return;
    var to = String($("to").value || ""), text = String($("text").value || "");
    if (!newId) newId = freshId();
    clearNewErrors();
    if (!newId) { box("This browser cannot send a text safely."); return; }
    setBusy(true);
    H.call("POST", "inbox/compose/", { platform: "sms", to: to, text: text, request_id: newId }).then(function (res) {
      var made;
      setBusy(false);
      if (res.ok) {
        newId = null;
        $("to").value = "";
        $("text").value = "";
        countOf("text", "text-count");
        newReady();
        made = res.data && res.data.conversation;
        made = made && typeof made === "object" ? made.id : made;
        if (typeof history.replaceState === "function") history.replaceState(null, "", "/inbox/sms/");
        if (typeof made !== "string" || !made) { showList("The text was queued."); return; }
        openConversation(made).then(function () {
          if (view !== "v-conv") say("l-msg", "The text was queued, but the conversation could not be opened.");
        });
        return;
      }
      if (res.status === 0) { box(UNSURE); return; }
      if (left(res)) return;
      if (res.status === 404) { show("v-closed"); return; }
      if (res.code === "invalid_mobile") { flag("to", "to-err", fieldWords(res, "to")); box("Fix the field marked below, then send again."); return; }
      if (res.code === "invalid_text") { flag("text", "text-err", fieldWords(res, "text")); box("Fix the field marked below, then send again."); return; }
      box(refusal(res));
    });
  });

  /* ---- the list's controls ---- */

  function pick(which) {
    filter = which;
    $("seg-all").setAttribute("aria-current", String(which === "all"));
    $("seg-unread").setAttribute("aria-current", String(which === "unread"));
    cursor = null;
    loadList(false);
  }
  $("seg-all").addEventListener("click", function (e) { e.preventDefault(); pick("all"); });
  $("seg-unread").addEventListener("click", function (e) { e.preventDefault(); pick("unread"); });
  $("refresh").addEventListener("click", function () { cursor = null; say("l-msg", ""); loadStatus(); loadList(false); });
  $("more").addEventListener("click", function () { if (cursor && !found) loadList(true); });
  $("show-all").addEventListener("click", function () { cursor = null; loadList(false); });
  $("find-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("find-number"), number = String(input.value || "").trim();
    if (!number) return;
    input.value = "";
    find(number);
  });
  window.addEventListener("hashchange", function () { if (view === "v-list" && location.hash === "#find") $("find-number").focus(); });
  $("retry").addEventListener("click", start);

  /* Who is signed in comes from me/, the staff route that answers it; the Inbox routes do not. */
  function start() {
    show("boot");
    H.call("GET", "me/").then(function (res) {
      if (left(res)) return;
      if (!res.ok) { show("v-down"); return; }
      window.NOHqShell.signedIn(res.data.email);
      loadStatus().then(function (ok) {
        if (!ok) return;
        if (location.pathname === "/inbox/sms/new/") showNew(); else showList("", true);
      });
    });
  }
  start();
})();
