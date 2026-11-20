/* The website chat widget of the Santé storefront.

   Not one of the approved TWCinc files: written for this storefront (ClickUp z8uq9mfj12, G3 PR3), to the approved mockups w1 to w6.
   The browser talks only to this site's own /chat/poll/ and /chat/send/ (src/lib/chat-flow.ts), which call Django server to server.
   The visitor's secret lives in an HttpOnly cookie this script never sees. The widget does not exist until the first poll says chat
   is available for this host: while Django has chat switched off, the answer is a 404 and nothing is drawn.

   Every word that came from the server or the visitor is shown with textContent; nothing is built from a string of markup and
   nothing is turned into a link. The visitor wording below is placeholder wording (D6) until Coach Ed approves it.

   Polling: every 20 s while the panel is open, every 60 s after 10 minutes without the visitor doing anything, and not at all after
   30 minutes without. Writing, or opening the panel again, starts it again. A page that is hidden is not polled.

   The conversation as the visitor sees it (their own messages and the store's replies) is kept in this browser's localStorage under
   "no-chat-log" (per store host, as localStorage is per origin), so a reload, a closed tab or a later visit still shows the earlier
   messages next to the store's replies (Coach Ed's ruling Db); Django only returns the store's replies. It holds only message texts,
   ids, times and sides, no name or email. It is dropped 30 days after its last write (the chat cookie's own lifetime), or sooner when
   the server no longer knows the visitor. On a shared device the earlier messages show until those 30 days pass or the server forgets
   the visitor. A log an older version kept in sessionStorage is moved over once. A browser that blocks storage keeps the conversation
   in memory for the page only.

   The first poll (is chat available here?) is remembered in sessionStorage under "no-chat-probe" for 60 s per host, so a visitor
   moving between pages costs one poll a minute, not one per page. An open panel still polls on its own 20 s / 60 s schedule.

   Contact ask (ClickUp z8uq9mgtt2): the form has no name or email field, the visitor just types. After the first message is sent the
   panel shows one optional ask for a mobile number or an email, with Save and Skip, once per conversation. The answer goes to this
   site's own /chat/contact/. The mobile option sits behind CHAT_CONTACT_MOBILE: false makes the ask and its check email-only. The
   answer (saved or skipped) is kept in localStorage under "no-chat-contact" for the same 30 days as the conversation, and dropped
   with it. The number or email itself is never kept in the browser. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; // the tests read the rules below
  else api.start(root.document, root);
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var CHAT_CONTACT_MOBILE = true; // false: the contact ask takes an email only (e.g. if HQ changes the Privacy wording)
  var MAX = 1000;
  var FAST_MS = 20000, SLOW_MS = 60000, SLOW_AFTER_MS = 10 * 60000, STOP_AFTER_MS = 30 * 60000;
  var LOG_KEY = "no-chat-log", LOG_MAX = 80, LOG_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days = CHAT_MAX_AGE of the chat cookie
  var PROBE_KEY = "no-chat-probe", PROBE_MS = 60000;
  var CONTACT_KEY = "no-chat-contact";
  var CONTACT_HREF = "/#contact-form";
  var TEXT = {
    launcher: "Chat with us",
    openLabel: "Open chat",
    closeLabel: "Close chat",
    titleFor: function (store) { return store ? "Chat with " + store : "Chat with us"; },
    sub: "Ask us anything about our products.",
    intro: "Send us a message and the store will reply here.",
    message: "Your message",
    note: "We reply here as soon as we can.",
    send: "Send",
    sending: "Sending…",
    compose: "Write a message",
    status: "The store will reply here as soon as it can.",
    you: "You",
    teamFor: function (store) { return store ? store + " team" : "Store team"; },
    pausedBefore: "Chat is not available right now. Please use the ",
    pausedLink: "contact form",
    pausedAfter: ".",
    today: "Today",
    yesterday: "Yesterday",
    conversation: "Conversation",
    askText: CHAT_CONTACT_MOBILE ? "Leave your mobile number or email so we can reach you if you leave this page." : "Leave your email so we can reach you if you leave this page.",
    askLabel: CHAT_CONTACT_MOBILE ? "Mobile number or email" : "Email",
    askHint: CHAT_CONTACT_MOBILE ? "09171234567 or you@example.com" : "you@example.com",
    save: "Save",
    saving: "Saving…",
    skip: "Skip",
    saved: "Thank you. We saved it."
  };
  /* The three fixed error texts of the mockup (w5), plus the two the form can catch by itself. */
  var ERRORS = {
    failed: "We could not send your message. Please try again in a moment.",
    limited: "You have sent several messages in a short time. Please wait a few minutes and try again.",
    links: "Please remove some of the links and try again.",
    email: "Please enter a valid email address.",
    empty: "Please write a message.",
    contact: CHAT_CONTACT_MOBILE ? "Please enter a mobile number like 09171234567, or an email like you@example.com." : "Please enter an email like you@example.com.",
    contactFailed: "We could not save that. Please try again in a moment."
  };

  /* ---------- the rules, pure ---------- */

  /** How long until the next poll, from how long the visitor has been idle: 0 means stop. */
  function pollDelay(idleMs) {
    if (idleMs >= STOP_AFTER_MS) return 0;
    return idleMs >= SLOW_AFTER_MS ? SLOW_MS : FAST_MS;
  }

  /** The kind of error to show for the answer to a send: one of the fixed texts. */
  function errorKind(status, body) {
    var e = body && typeof body === "object" ? body.error : "";
    if (e === "limited" || status === 429) return "limited";
    if (e === "links" || e === "email" || e === "empty" || e === "contact") return e;
    if (e === "too_long") return "empty";
    return "failed";
  }

  /** The Membership Pack visit ref that pack-visit.js keeps in localStorage ("np:visit-ref", 16-32 of A-Za-z0-9_-), or "" when it is
      absent, malformed or storage is blocked. It rides on a send or contact call so the chat lands on the visitor's prospect row. */
  var VISIT_REF_KEY = "np:visit-ref";
  function visitRef(storage) {
    try {
      var v = storage ? storage.getItem(VISIT_REF_KEY) : "";
      return typeof v === "string" && /^[A-Za-z0-9_-]{16,32}$/.test(v) ? v : "";
    } catch { return ""; }
  }

  function emailOk(value) {
    var v = String(value || "").trim();
    return v === "" || /^[^\s@]+@[^\s@]+$/.test(v);
  }

  /** What a contact entry is: "mobile" (09XXXXXXXXX, 9XXXXXXXXX or +639XXXXXXXXX, spaces, dashes and brackets allowed), "email", or ""
      when it is neither. The server checks again and decides; this only saves a round trip. `mobileOn` defaults to CHAT_CONTACT_MOBILE. */
  function contactKind(value, mobileOn) {
    var v = String(value || "").trim();
    if (!v) return "";
    if (v.indexOf("@") !== -1) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "email" : "";
    if (mobileOn === undefined ? CHAT_CONTACT_MOBILE : mobileOn) {
      var digits = v.replace(/[\s\-().]/g, "");
      if (/^(\+63|0)?9\d{9}$/.test(digits)) return "mobile";
    }
    return "";
  }

  /** Adds the store's replies to the log by id, in order; returns true when something new came. */
  function mergeReplies(log, replies) {
    var seen = {}, added = false, i;
    for (i = 0; i < log.items.length; i++) if (log.items[i].who === "store") seen[log.items[i].id] = true;
    for (i = 0; i < replies.length; i++) {
      var m = replies[i];
      if (!m || typeof m.id !== "number" || typeof m.text !== "string" || seen[m.id]) continue;
      seen[m.id] = true;
      log.items.push({ who: "store", id: m.id, text: m.text, at: typeof m.at === "string" ? m.at : "" });
      if (m.id > log.last) log.last = m.id;
      added = true;
    }
    if (log.items.length > LOG_MAX) log.items = log.items.slice(log.items.length - LOG_MAX);
    log.items.sort(function (a, b) { return (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0); });
    return added;
  }

  function readLog(storage, now) {
    var empty = { items: [], last: 0 };
    try {
      var raw = storage && storage.getItem(LOG_KEY);
      if (!raw) return empty;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.items)) return empty;
      if (typeof data.saved_at === "number" && typeof now === "number" && now - data.saved_at > LOG_TTL_MS) { try { storage.removeItem(LOG_KEY); } catch { /* ignore */ } return empty; }
      var items = [];
      data.items.forEach(function (m) {
        if (m && (m.who === "me" || m.who === "store") && typeof m.text === "string" && typeof m.at === "string") {
          items.push({ who: m.who, id: typeof m.id === "number" ? m.id : 0, text: m.text, at: m.at });
        }
      });
      return { items: items.slice(-LOG_MAX), last: typeof data.last === "number" ? data.last : 0 };
    } catch { return empty; }
  }

  function writeLog(storage, log, now) {
    try {
      if (!storage) return;
      if (!log.items.length) storage.removeItem(LOG_KEY);
      else storage.setItem(LOG_KEY, JSON.stringify({ items: log.items, last: log.last, saved_at: typeof now === "number" ? now : Date.now() }));
    } catch { /* blocked or full: the conversation stays in memory for this page */ }
  }

  /** Whether the contact ask was answered for this conversation: "saved", "skipped" or "" (not yet). Dropped after the conversation's 30 days. */
  function readContact(storage, now) {
    try {
      var raw = storage && storage.getItem(CONTACT_KEY);
      if (!raw) return "";
      var d = JSON.parse(raw);
      if (!d || (d.done !== "saved" && d.done !== "skipped")) return "";
      if (typeof d.at === "number" && typeof now === "number" && now - d.at > LOG_TTL_MS) { try { storage.removeItem(CONTACT_KEY); } catch { /* ignore */ } return ""; }
      return d.done;
    } catch { return ""; }
  }

  function writeContact(storage, done, now) {
    try {
      if (!storage) return;
      if (!done) storage.removeItem(CONTACT_KEY);
      else storage.setItem(CONTACT_KEY, JSON.stringify({ done: done, at: typeof now === "number" ? now : Date.now() }));
    } catch { /* blocked: the ask may show again on this page only */ }
  }

  /** One-time move of a log an older version kept in sessionStorage: copied only when localStorage has none; the old copy always goes. */
  function migrateLog(local, session) {
    try {
      if (!session) return;
      var old = session.getItem(LOG_KEY);
      if (old && local && !local.getItem(LOG_KEY)) {
        var data = JSON.parse(old);
        if (data && Array.isArray(data.items)) local.setItem(LOG_KEY, JSON.stringify({ items: data.items, last: data.last, saved_at: Date.now() }));
      }
      session.removeItem(LOG_KEY);
    } catch { /* blocked: nothing to move */ }
  }

  /** The remembered answer to "is chat available on this host?", or null when there is none, it is older than 60 s, or it is for another host. */
  function readProbe(storage, host, now) {
    try {
      var raw = storage && storage.getItem(PROBE_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || p.host !== host || typeof p.at !== "number" || p.at > now || now - p.at >= PROBE_MS || typeof p.available !== "boolean") return null;
      return { available: p.available, state: typeof p.state === "string" ? p.state : "none" };
    } catch { return null; }
  }

  function writeProbe(storage, host, now, available, state) {
    try { if (storage) storage.setItem(PROBE_KEY, JSON.stringify({ host: host, at: now, available: available, state: state })); } catch { /* blocked: the next page asks again */ }
  }

  function clockOf(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function dayOf(iso, now) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var key = function (x) { return x.getFullYear() + "-" + x.getMonth() + "-" + x.getDate(); };
    if (key(d) === key(now)) return TEXT.today;
    var y = new Date(now.getTime() - 86400000);
    if (key(d) === key(y)) return TEXT.yesterday;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  /* ---------- the widget ---------- */

  function start(doc, win) {
    var script = doc.currentScript || doc.querySelector("script[data-chat-widget]");
    var store = script && script.getAttribute ? String(script.getAttribute("data-store") || "").slice(0, 80) : "";
    var storage = null, session = null; // storage keeps the conversation (localStorage); session keeps the probe
    try { storage = win.localStorage; } catch { storage = null; }
    try { session = win.sessionStorage; } catch { session = null; }
    migrateLog(storage, session);
    var log = readLog(storage, Date.now());

    var S = { open: false, view: "form", state: "none", sending: false, error: "", draft: { text: "", contact: "" },
      contact: readContact(storage, Date.now()), contactBusy: false, contactError: "", contactThanks: false,
      openedAt: "", lastAction: Date.now(), timer: 0, polling: false };
    var el = {};

    function h(tag, cls, text) {
      var n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined && text !== null && text !== "") n.textContent = text;
      return n;
    }
    function add(parent) {
      for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
      return parent;
    }
    function icon(paths) {
      var NS = "http://www.w3.org/2000/svg", s = doc.createElementNS(NS, "svg");
      s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
      s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
      s.setAttribute("aria-hidden", "true"); s.setAttribute("focusable", "false");
      paths.forEach(function (d) { var p = doc.createElementNS(NS, "path"); p.setAttribute("d", d); s.appendChild(p); });
      return s;
    }
    var ICON = {
      chat: ["M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12z"],
      close: ["M6 6l12 12M18 6L6 18"],
      warn: ["M12 3l10 18H2zM12 10v5M12 18h.01"],
      pause: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 9v6M14 9v6"]
    };

    function withRef(payload) { var ref = visitRef(storage); if (ref) payload.pack_visitor_ref = ref; return payload; }

    function note() { S.lastAction = Date.now(); }

    /* ---- talking to our own server ---- */

    function post(path, payload) {
      var ctl = typeof win.AbortController === "function" ? new win.AbortController() : null;
      var timer = ctl ? win.setTimeout(function () { ctl.abort(); }, 20000) : 0;
      return win.fetch(path, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload), signal: ctl ? ctl.signal : undefined
      }).then(function (res) {
        if (timer) win.clearTimeout(timer);
        return res.json().then(function (body) { return { status: res.status, body: body }; }, function () { return { status: res.status, body: null }; });
      }, function () { if (timer) win.clearTimeout(timer); return { status: 0, body: null }; });
    }

    /* ---- the state ---- */

    function viewFor() {
      if (S.state === "paused") return "paused";
      return log.items.length || S.state === "open" || S.state === "closed" ? "convo" : "form";
    }

    function apply(body) {
      S.state = body.state;
      if (body.state === "none" && log.items.length) { log.items = []; log.last = 0; } // the server no longer knows this visitor
      if (body.state === "none" && S.contact) { S.contact = ""; writeContact(storage, "", Date.now()); }
      if (Array.isArray(body.messages)) mergeReplies(log, body.messages);
      writeLog(storage, log);
      S.view = viewFor();
    }

    function poll() {
      if (S.polling) return Promise.resolve(null);
      S.polling = true;
      return post("/chat/poll/", { after_id: log.last }).then(function (r) {
        S.polling = false;
        if (r.status !== 200 || !r.body || r.body.ok !== true) return r;
        if (r.body.available === false) return r;
        apply(r.body);
        return r;
      });
    }

    function refresh() {
      return poll().then(function (r) { if (r && r.status === 200 && S.open && !S.sending) drawPanel(true); return r; });
    }

    function schedule() {
      win.clearTimeout(S.timer);
      if (!S.open) return;
      var wait = pollDelay(Date.now() - S.lastAction);
      if (!wait) return;
      S.timer = win.setTimeout(function () {
        if (!S.open) return;
        if (doc.hidden) { schedule(); return; }
        refresh().then(schedule);
      }, wait);
    }

    /* ---- drawing ---- */

    function build() {
      var rootEl = h("div", "sw-root");
      rootEl.setAttribute("data-chat-root", "");
      el.root = rootEl;
      var launcher = h("button", "sw-launcher");
      launcher.type = "button"; launcher.setAttribute("aria-label", TEXT.openLabel); launcher.setAttribute("aria-haspopup", "dialog");
      launcher.setAttribute("aria-expanded", "false");
      add(launcher, icon(ICON.chat), h("span", "sw-lab", TEXT.launcher));
      launcher.addEventListener("click", openPanel);
      el.launcher = launcher;
      rootEl.appendChild(launcher);
      doc.body.appendChild(rootEl);
      doc.body.classList.add("sw-on"); // pads the footer so the launcher never covers its text
    }

    function header() {
      var head = h("div", "sw-head");
      var av = h("span", "sw-av", (store ? Array.from(store)[0] : "?").toUpperCase()); av.setAttribute("aria-hidden", "true");
      var title = h("h2", "", TEXT.titleFor(store)); title.id = "sw-t";
      var ht = h("div", "sw-ht"); add(ht, title, h("p", "", TEXT.sub));
      var close = h("button", "sw-close"); close.type = "button"; close.setAttribute("aria-label", TEXT.closeLabel);
      close.appendChild(icon(ICON.close));
      close.addEventListener("click", closePanel);
      return add(head, av, ht, close);
    }

    function alertBox() {
      if (!S.error) return null;
      var a = h("p", "sw-alert"); a.setAttribute("role", "alert");
      add(a, icon(ICON.warn), h("span", "", ERRORS[S.error] || ERRORS.failed));
      return a;
    }

    function formView(panel) {
      var form = h("form", "sw-form"); form.setAttribute("novalidate", "");
      var body = h("div", "sw-body");
      var textBad = S.error === "failed" || S.error === "limited" || S.error === "links" || S.error === "empty";
      var msg = h("textarea", "sw-input" + (textBad ? " bad" : ""));
      msg.id = "sw-msg"; msg.rows = 4; msg.maxLength = MAX; msg.setAttribute("aria-describedby", "sw-cnt"); msg.value = S.draft.text;
      var lab = h("label", "sw-label", TEXT.message); lab.setAttribute("for", "sw-msg");
      var hp = h("div", "sw-hp"); hp.setAttribute("aria-hidden", "true");
      var trap = h("input"); trap.type = "text"; trap.name = "website"; trap.tabIndex = -1; trap.autocomplete = "off"; trap.setAttribute("aria-hidden", "true");
      hp.appendChild(trap);
      var field = h("div", "sw-field"); add(field, lab, msg);
      add(body, alertBox(), h("p", "sw-intro", TEXT.intro), field, h("p", "sw-note", TEXT.note), hp);
      var foot = h("div", "sw-foot"), count = h("span", "sw-count", msg.value.length + " / " + MAX); count.id = "sw-cnt";
      var send = h("button", "sw-send", S.sending ? TEXT.sending : TEXT.send); send.type = "submit"; send.disabled = S.sending;
      if (S.sending) send.setAttribute("aria-busy", "true");
      add(foot, count, send);
      msg.addEventListener("input", function () { S.draft.text = msg.value; count.textContent = msg.value.length + " / " + MAX; note(); });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        submit({ text: msg.value, website: trap.value });
      });
      add(form, body, foot);
      panel.appendChild(form);
      el.focus = msg;
    }

    /* The optional contact ask, once the visitor has written: one input, Save and Skip. */
    function askBox() {
      var box = h("form", "sw-ask"); box.setAttribute("novalidate", "");
      var bad = S.contactError !== "";
      var text = h("p", "sw-ask-text", TEXT.askText); text.id = "sw-ask-t";
      var lab = h("label", "sr-only", TEXT.askLabel); lab.setAttribute("for", "sw-contact");
      var input = h("input", "sw-input" + (bad ? " bad" : "")); input.id = "sw-contact"; input.type = "text"; input.maxLength = 254;
      input.autocomplete = "off"; input.value = S.draft.contact; input.setAttribute("aria-describedby", "sw-ask-t");
      input.placeholder = TEXT.askHint;
      input.setAttribute("inputmode", CHAT_CONTACT_MOBILE ? "text" : "email");
      if (bad) input.setAttribute("aria-invalid", "true");
      var save = h("button", "sw-send sw-ask-save", S.contactBusy ? TEXT.saving : TEXT.save); save.type = "submit"; save.disabled = S.contactBusy;
      var skip = h("button", "sw-skip", TEXT.skip); skip.type = "button"; skip.disabled = S.contactBusy;
      var row = h("div", "sw-ask-row"); add(row, save, skip);
      var err = null;
      if (bad) { err = h("p", "sw-ask-err", ERRORS[S.contactError] || ERRORS.contactFailed); err.setAttribute("role", "alert"); }
      input.addEventListener("input", function () { S.draft.contact = input.value; note(); });
      skip.addEventListener("click", function () { note(); S.contact = "skipped"; S.contactError = ""; writeContact(storage, "skipped", Date.now()); drawPanel(false); });
      box.addEventListener("submit", function (e) { e.preventDefault(); saveContact(input.value); });
      return add(box, text, lab, input, err, row);
    }

    function saveContact(value) {
      if (S.contactBusy) return;
      note();
      S.draft.contact = value;
      if (!contactKind(value)) { S.contactError = "contact"; drawPanel(true); return; }
      S.contactError = ""; S.contactBusy = true; drawPanel(true);
      post("/chat/contact/", withRef({ contact: String(value).trim() })).then(function (r) {
        S.contactBusy = false;
        if (r.status === 200 && r.body && r.body.ok === true && r.body.saved === false) { // the owner has chat off or paused: nothing was saved, so the ask stays open
          poll().then(function () { drawPanel(false); });
          return;
        }
        if (r.status === 200 && r.body && r.body.ok === true && r.body.saved === true) {
          S.contact = "saved"; S.contactThanks = true; S.draft.contact = "";
          writeContact(storage, "saved", Date.now());
          drawPanel(false);
          return;
        }
        S.contactError = r.status === 422 && r.body && r.body.error === "contact" ? "contact" : "contactFailed";
        drawPanel(true);
      });
    }

    function convoView(panel) {
      var body = h("div", "sw-body"), list = h("ul", "sw-msgs");
      list.setAttribute("role", "log"); list.setAttribute("aria-live", "polite"); list.setAttribute("aria-label", TEXT.conversation);
      var now = new Date(), lastDay = "";
      log.items.forEach(function (m) {
        var day = dayOf(m.at, now);
        if (day && day !== lastDay) { lastDay = day; list.appendChild(h("li", "sw-day", day)); }
        var li = h("li", "sw-m " + (m.who === "me" ? "sw-m-me" : "sw-m-store"));
        var meta = h("span", "sw-meta");
        if (m.who === "me") meta.textContent = TEXT.you + ", " + clockOf(m.at);
        else add(meta, h("span", "sw-who", TEXT.teamFor(store)), doc.createTextNode(", " + clockOf(m.at)));
        add(li, h("p", "sw-bub", m.text), meta);
        list.appendChild(li);
      });
      add(body, list);
      var asked = log.items.some(function (m) { return m.who === "me"; });
      if (asked && !S.contact) body.appendChild(askBox());
      else if (S.contactThanks) { var thanks = h("p", "sw-thanks", TEXT.saved); thanks.setAttribute("role", "status"); body.appendChild(thanks); }
      panel.appendChild(body);
      var alert = alertBox();
      if (alert) { alert.classList.add("sw-alert-pad"); panel.appendChild(alert); }
      var status = h("p", "sw-status", TEXT.status); status.setAttribute("role", "status");
      panel.appendChild(status);
      var form = h("form", "sw-compose"); form.setAttribute("novalidate", "");
      var lab = h("label", "sr-only", TEXT.compose); lab.setAttribute("for", "sw-reply");
      var ta = h("textarea", "sw-input" + (S.error && S.error !== "email" ? " bad" : "")); ta.id = "sw-reply"; ta.rows = 1; ta.maxLength = MAX;
      ta.placeholder = TEXT.compose; ta.value = S.draft.text;
      var send = h("button", "sw-send", S.sending ? TEXT.sending : TEXT.send); send.type = "submit"; send.disabled = S.sending;
      ta.addEventListener("input", function () { S.draft.text = ta.value; note(); });
      ta.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit({ text: ta.value, website: "" }); }
      });
      form.addEventListener("submit", function (e) { e.preventDefault(); submit({ text: ta.value, website: "" }); });
      add(form, lab, ta, send);
      panel.appendChild(form);
      el.focus = ta;
      win.setTimeout(function () { body.scrollTop = body.scrollHeight; }, 0);
    }

    function pausedView(panel) {
      var box = h("div", "sw-paused"); box.setAttribute("role", "status");
      var tile = h("span", "tile"); tile.appendChild(icon(ICON.pause));
      var p = h("p"), a = h("a", "sw-link", TEXT.pausedLink); a.href = CONTACT_HREF;
      add(p, doc.createTextNode(TEXT.pausedBefore), a, doc.createTextNode(TEXT.pausedAfter));
      add(box, tile, p);
      panel.appendChild(box);
      el.focus = a;
    }

    function drawPanel(keepFocus) {
      if (!S.open || !el.panel) return;
      var hadFocus = keepFocus && el.panel.contains(doc.activeElement);
      var active = hadFocus ? doc.activeElement.id : "";
      var panel = el.panel;
      while (panel.firstChild) panel.removeChild(panel.firstChild);
      panel.appendChild(header());
      if (S.view === "paused") pausedView(panel);
      else if (S.view === "convo") convoView(panel);
      else formView(panel);
      if (hadFocus && active) { var again = doc.getElementById(active); if (again && again.focus) again.focus(); }
    }

    /* ---- opening and closing ---- */

    function openPanel() {
      if (S.open) return;
      S.open = true; note();
      if (!S.openedAt) S.openedAt = new Date().toISOString();
      var panel = h("section", "sw-panel");
      panel.setAttribute("role", "dialog"); panel.setAttribute("aria-labelledby", "sw-t"); panel.setAttribute("aria-modal", "false");
      panel.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); closePanel(); } });
      el.panel = panel;
      el.root.appendChild(panel);
      el.launcher.hidden = true; el.launcher.setAttribute("aria-expanded", "true");
      doc.documentElement.classList.add("sw-lock");
      S.error = "";
      S.view = viewFor();
      drawPanel(false);
      if (el.focus && el.focus.focus) el.focus.focus();
      refresh();
      schedule();
    }

    function closePanel() {
      if (!S.open) return;
      S.open = false;
      win.clearTimeout(S.timer);
      if (el.panel && el.panel.parentNode) el.panel.parentNode.removeChild(el.panel);
      el.panel = null;
      el.launcher.hidden = false; el.launcher.setAttribute("aria-expanded", "false");
      doc.documentElement.classList.remove("sw-lock");
      el.launcher.focus();
    }

    /* ---- sending ---- */

    function submit(values) {
      if (S.sending) return;
      note();
      var text = String(values.text || "").trim();
      S.draft.text = values.text;
      if (!text) { S.error = "empty"; drawPanel(true); return; }
      S.error = ""; S.sending = true; drawPanel(true);
      post("/chat/send/", withRef({ text: text, website: values.website || "",
        opened_at: S.openedAt, after_id: log.last })).then(function (r) {
        S.sending = false;
        if (r.status === 200 && r.body && r.body.ok === true) {
          if (r.body.state === "paused") { S.state = "paused"; S.view = "paused"; drawPanel(false); return; }
          log.items.push({ who: "me", id: 0, text: text, at: new Date().toISOString() });
          S.draft.text = "";
          apply(r.body);
          S.view = "convo";
          drawPanel(true);
          schedule();
          return;
        }
        S.error = errorKind(r.status, r.body);
        drawPanel(true); // the typed text stays in its box
      });
    }

    /* ---- go ---- */

    doc.addEventListener("visibilitychange", function () {
      if (!doc.hidden && S.open) { refresh(); schedule(); }
    });

    var host = win.location && win.location.host ? win.location.host : "";
    var known = readProbe(session, host, Date.now());
    if (known) {
      if (known.available) { S.state = known.state; S.view = viewFor(); build(); }
      return;
    }
    poll().then(function (r) {
      if (!r) return;
      if (r.status === 404) { writeProbe(session, host, Date.now(), false, "none"); return; } // chat is off here: remembered too
      if (r.status !== 200 || !r.body || r.body.ok !== true) return; // a failure is not remembered: the next page asks again
      var ok = r.body.available !== false;
      writeProbe(session, host, Date.now(), ok, S.state);
      if (ok) build(); // not available: nothing is drawn
    });
  }

  return { start: start, pollDelay: pollDelay, errorKind: errorKind, emailOk: emailOk, visitRef: visitRef, contactKind: contactKind, readContact: readContact, writeContact: writeContact, CHAT_CONTACT_MOBILE: CHAT_CONTACT_MOBILE, CONTACT_KEY: CONTACT_KEY, mergeReplies: mergeReplies, readLog: readLog, writeLog: writeLog, migrateLog: migrateLog, LOG_TTL_MS: LOG_TTL_MS, readProbe: readProbe, writeProbe: writeProbe,
    TEXT: TEXT, ERRORS: ERRORS, LOG_KEY: LOG_KEY, PROBE_KEY: PROBE_KEY };
});
