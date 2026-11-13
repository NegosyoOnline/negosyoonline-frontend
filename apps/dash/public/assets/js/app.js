/* Shared dashboard helpers: API client, page shell, formatting. No dependencies, no secrets.
   The API's HttpOnly session cookie signs every call; nothing is stored in the browser but the theme.
   Every status, date and amount shown comes from the API; nothing is computed or assumed in the browser. */
(function () {
  var cfg = window.NO_CONFIG || {};

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }

  /* There is no dash login page: a signed-out visitor goes to the home site, which opens its sign-in popup. */
  function goSignIn() { location.replace((cfg.siteUrl || "") + "/?signin=1"); }

  /* The API answers errors as {error: {code, message, fields: {name: [messages]}}}. The screens read
     data.code, data.message and data.fields[name] as one string, so the shape is converted here, once. */
  function flatten(data) {
    var e = data && data.error;
    if (!e || typeof e !== "object") return data || {};
    var fields = {};
    Object.keys(e.fields || {}).forEach(function (k) {
      var v = e.fields[k];
      fields[k] = Array.isArray(v) ? v.join(" ") : String(v);
    });
    return { code: e.code, message: e.message, fields: fields };
  }

  /* Resolves {ok, status, data}. The API's session cookie rides every call; nothing is stored here.
     A 401 leaves for the public site, which opens its sign-in popup. The fourth and fifth arguments
     are no longer used; call sites still pass them. */
  function call(method, path, body) {
    var opts = { method: method, credentials: "include" };
    if (body) { opts.headers = { "Content-Type": "application/json" }; opts.body = JSON.stringify(body); }
    return fetch(cfg.apiBase + path, opts)
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (r.status === 401) goSignIn();
          return { ok: r.ok, status: r.status, data: flatten(data) };
        });
      })
      .catch(function () { return { ok: false, status: 0, data: { message: "We could not reach the server. Please check your connection and try again." } }; });
  }

  /* call() for a multipart body (a FormData, e.g. a QR image upload): same cookie, 401 and network handling, and the
     browser sets the multipart Content-Type itself. */
  function send(method, path, form) {
    return fetch(cfg.apiBase + path, { method: method, credentials: "include", body: form })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (r.status === 401) goSignIn();
          return { ok: r.ok, status: r.status, data: flatten(data) };
        });
      })
      .catch(function () { return { ok: false, status: 0, data: { message: "We could not reach the server. Please check your connection and try again." } }; });
  }

  /* /me/ answers {account: {id, email, name, email_verified, created_at}}. The screens read first_name and
     last_name, so the one name is split here: the first word, and everything after it. */
  function accountView(data) {
    var a = (data && data.account) || {};
    var parts = String(a.name || "").trim().split(/\s+/).filter(Boolean);
    return { id: a.id, email: a.email || "", email_verified: a.email_verified === true, created_at: a.created_at,
      name: parts.join(" "), first_name: parts[0] || "", last_name: parts.slice(1).join(" ") };
  }

  /* GET /sites/ answers {items: [...], next_cursor}. One page is enough: an account has one site in the MVP
     (the API's default page is 20). */
  function sitesOf(res) { var d = res && res.data; return d && Array.isArray(d.items) ? d.items : []; }

  /* The site named by ?site= when it is one of the caller's own (ids from GET /sites/), else the first.
     The API checks ownership on every call; this only keeps a pasted or stale id out of the request path. */
  var SITE_ID_RE = /^site_[0-9a-z]{20}$/;
  function siteFromQuery(ids, search) {
    var m = /[?&]site=([^&#]*)/.exec(search == null ? location.search : search);
    return m && SITE_ID_RE.test(m[1]) && ids.indexOf(m[1]) >= 0 ? m[1] : ids[0];
  }

  var PH = { timeZone: "Asia/Manila" };
  function date(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString("en-PH", Object.assign({ year: "numeric", month: "long", day: "numeric" }, PH)); } catch (e) { return ""; }
  }
  function nextPath() {
    var n = new URLSearchParams(location.search).get("next") || "";
    return /^\/[A-Za-z0-9\-_/]*$/.test(n) && n.indexOf("//") !== 0 ? n : "/";
  }

  function messageOf(res, fallback) {
    var m = res && res.data && res.data.message;
    return typeof m === "string" && m ? m : fallback;
  }

  /* First letters of the first and the last word of the name; the email's first letter when there is no name. */
  function initials(a) {
    var f = (a.first_name || "").trim(), l = (a.last_name || "").trim().split(/\s+/).pop();
    return ((f.charAt(0) + l.charAt(0)) || (a.email || "").charAt(0)).toUpperCase();
  }

  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }

  /* Workspace block and account text. The markup is static in index.html; every value lands via textContent.
     The trial chip reads trial_status; /me/ does not carry one until the billing slice, and a missing status shows no chip. */
  var TRIAL_CHIP = { trial_active: ["info", "Free trial"], trial_ended: ["neutral", "Trial ended"], pending_verification: ["neutral", "Free trial"] };
  function fillAccount(a) {
    var name = ((a.first_name || "") + " " + (a.last_name || "")).trim();
    var t = Object.prototype.hasOwnProperty.call(TRIAL_CHIP, a.trial_status) ? TRIAL_CHIP[a.trial_status] : null;
    /* The workspace label is the first site's name, set by setWorkspace(); "My Business" until one is known. */
    paintWorkspace();
    each("[data-acct-initials]", function (n) { n.textContent = initials(a); });
    each("[data-acct-name]", function (n) { n.textContent = name || a.email || ""; });
    each("[data-acct-email]", function (n) { n.textContent = a.email || ""; n.hidden = !name; });
    each("[data-acct-chip]", function (n) {
      n.setAttribute("class", "chip " + (a.email_verified ? "chip-ok" : "chip-neutral"));
      n.textContent = a.email_verified ? "Verified" : "Not verified";
    });
    each("[data-ws-chip]", function (n) {
      if (!t) { n.hidden = true; return; }
      n.setAttribute("class", "chip ws-chip chip-" + t[0]);
      n.textContent = t[1];
      n.hidden = false;
    });
    var row = document.getElementById("acct-row");
    if (row) row.setAttribute("aria-label", "Account menu: " + (name || a.email || ""));
  }

  /* The workspace label comes from the setup answer (first_site.display_name), which the Overview reads. When that is empty
     (a site not made through onboarding), the first site's display_name from GET /sites/ is used (routine decision,
     ClickUp 1100430000508826), and "My Business" only when there is none. */
  var workspace = "", workspaceAsk = 0;
  function paintWorkspace() { each("[data-ws-name]", function (n) { n.textContent = workspace || "My Business"; }); }
  function setWorkspace(name, askSites) {
    workspace = typeof name === "string" ? name.trim() : "";
    paintWorkspace();
    var ask = ++workspaceAsk;
    if (workspace || askSites === false) return; /* a removed first site (deleted) is not "empty": the caller passes false */
    call("GET", "/sites/").then(function (res) {
      if (ask !== workspaceAsk || workspace) return; /* a newer name arrived meanwhile */
      var d = res && res.ok && res.data, first = d && Array.isArray(d.items) ? d.items[0] : null;
      var label = first && typeof first.display_name === "string" ? first.display_name.trim() : "";
      if (label) { workspace = label; paintWorkspace(); }
    });
  }

  /* Theme toggle (account menus and the topbar icon button). Shows the theme you would switch to; theme.js owns the choice and storage. */
  function themeToggles() {
    var api = window.NODashTheme, btns = [];
    each("[data-theme-toggle]", function (b) { btns.push(b); });
    if (!api) { btns.forEach(function (b) { b.hidden = true; }); return; }
    function paint(current) {
      var toLight = current === "dark";
      btns.forEach(function (b) {
        Array.prototype.forEach.call(b.querySelectorAll("[data-theme-label]"), function (n) { n.textContent = toLight ? "Light theme" : "Dark theme"; });
        Array.prototype.forEach.call(b.querySelectorAll("[data-ico]"), function (n) { n.hidden = n.getAttribute("data-ico") !== (toLight ? "sun" : "moon"); });
      });
    }
    btns.forEach(function (b) { b.addEventListener("click", function () { api.set(api.current() === "dark" ? "light" : "dark"); }); });
    api.onChange(paint);
    paint(api.current());
  }

  /* Sidebar collapse (desktop): the edge button squeezes the sidebar to an icon rail and back. Held in memory only, so a reload
     starts expanded; the spec allows just the token and theme storage keys. In the rail the link labels are hidden by CSS, so
     each link gets a title for hover and the toggle keeps an accurate aria-expanded and label. */
  function sideToggle() {
    var side = document.getElementById("side"), btn = document.getElementById("side-toggle");
    if (!side || !btn) return;
    function setRail(rail) {
      if (rail) side.setAttribute("data-collapsed", ""); else side.removeAttribute("data-collapsed");
      btn.setAttribute("aria-expanded", String(!rail));
      btn.setAttribute("aria-label", rail ? "Expand sidebar" : "Collapse sidebar");
      Array.prototype.forEach.call(side.querySelectorAll(".side-nav > a, .side-group"), function (a) {
        if (rail) a.setAttribute("title", a.textContent.trim()); else a.removeAttribute("title");
      });
      if (rail && closeWorkspaceMenu) closeWorkspaceMenu();
    }
    btn.addEventListener("click", function () { setRail(!side.hasAttribute("data-collapsed")); });
    /* Choosing a menu item (or the Settings group, or the workspace button) in the rail brings back the full menu. */
    Array.prototype.forEach.call(side.querySelectorAll(".side-nav > a, .side-group, .ws-btn"), function (a) {
      a.addEventListener("click", function () { if (side.hasAttribute("data-collapsed")) setRail(false); });
    });
  }

  /* Desktop account menu: popover above the account row. Escape (focus returns to the row), a click outside, or
     the row itself closes it; opening moves focus to the first menu button. Listeners exist only while it is open. */
  function accountMenu(rowId, menuId) {
    var row = document.getElementById(rowId), menu = document.getElementById(menuId);
    if (!row || !menu) return;
    function onKey(e) { if (e.key === "Escape") close(true); }
    function onDoc(e) { if (!menu.contains(e.target) && !row.contains(e.target)) close(false); }
    function close(refocus) {
      if (menu.hidden) return;
      menu.hidden = true;
      row.setAttribute("aria-expanded", "false");
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDoc);
      if (refocus) row.focus();
    }
    function open() {
      menu.hidden = false;
      row.setAttribute("aria-expanded", "true");
      document.addEventListener("keydown", onKey);
      document.addEventListener("click", onDoc);
      var first = menu.querySelector("a[href], button");
      if (first) first.focus();
    }
    row.addEventListener("click", function () { if (menu.hidden) open(); else close(false); });
    /* A menu row is a link to a panel: close the menu and leave focus to the router (it focuses the panel h1). */
    Array.prototype.forEach.call(menu.querySelectorAll("[data-menu-link]"), function (a) {
      a.addEventListener("click", function () { close(false); });
    });
  }

  /* Workspace switcher: the logo and name are a button that opens a small menu with the other sites (none yet) and a disabled
     Create Site. Escape (focus returns to the button) or a click outside closes it. Listeners exist only while open. */
  var closeWorkspaceMenu = null; /* set by workspaceMenu(); the sidebar rail closes an open menu through it, never by clicking the button */
  function workspaceMenu() {
    var btn = document.getElementById("ws-btn"), menu = document.getElementById("ws-menu");
    if (!btn || !menu) return;
    function onKey(e) { if (e.key === "Escape") close(true); }
    function onDoc(e) { if (!menu.contains(e.target) && !btn.contains(e.target)) close(false); }
    function close(refocus) {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDoc);
      if (refocus) btn.focus();
    }
    function open() {
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      document.addEventListener("keydown", onKey);
      document.addEventListener("click", onDoc);
    }
    btn.addEventListener("click", function () { if (menu.hidden) open(); else close(false); });
    closeWorkspaceMenu = function () { close(false); };
  }

  /* Notification bell: opens a small panel. There is no notification feed yet, so it only says so. Escape (focus returns
     to the bell) or a click outside closes it. Listeners exist only while it is open. */
  function notifMenus() {
    Array.prototype.forEach.call(document.querySelectorAll(".notif"), function (box) {
      var btn = box.querySelector(".notif-btn"), pop = box.querySelector(".notif-pop");
      if (!btn || !pop) return;
      function onKey(e) { if (e.key === "Escape") close(true); }
      function onDoc(e) { if (!box.contains(e.target)) close(false); }
      function close(refocus) {
        if (pop.hidden) return;
        pop.hidden = true;
        btn.setAttribute("aria-expanded", "false");
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("click", onDoc);
        if (refocus) btn.focus();
      }
      btn.addEventListener("click", function () {
        if (!pop.hidden) { close(false); return; }
        pop.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        document.addEventListener("keydown", onKey);
        document.addEventListener("click", onDoc);
      });
    });
  }


  /* Quick links search: a button that opens a field; typing filters the dashboard pages and Enter or a click opens one.
     Static list (no request). Arrow keys move the highlight, Escape closes and returns focus to the button, and a click
     outside closes it. Labels reach the page through textContent only; hrefs come from this fixed list. */
  var QUICK_LINKS = [
    ["Overview", "", "/"], ["Orders", "", "/orders/"],
    ["Account Settings", "Account", "/account/"], ["Help Center", "Account", "/help/"],
    ["Business Settings", "Settings", "/settings/business/"], ["Billing", "Settings", "/settings/billing/"], ["Payments", "Settings", "/settings/payments/"]
  ];
  function quickSearch() {
    Array.prototype.forEach.call(document.querySelectorAll(".qs"), function (box, n) {
      var btn = box.querySelector(".qs-btn"), field = box.querySelector(".qs-field"), input = box.querySelector(".qs-input"), list = box.querySelector(".qs-list");
      if (!btn || !field || !input || !list) return;
      var active = -1, rows = [];
      list.id = "qs-list-" + n;
      input.setAttribute("aria-controls", list.id);
      function setActive(i) {
        if (!rows.length) { active = -1; input.removeAttribute("aria-activedescendant"); return; }
        active = (i + rows.length) % rows.length;
        rows.forEach(function (r, k) {
          if (k === active) { r.setAttribute("aria-selected", "true"); input.setAttribute("aria-activedescendant", r.id); r.scrollIntoView && r.scrollIntoView({ block: "nearest" }); }
          else r.removeAttribute("aria-selected");
        });
      }
      function render() {
        var q = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        list.textContent = "";
        rows = [];
        QUICK_LINKS.forEach(function (l) {
          var hay = (l[0] + " " + l[1]).toLowerCase();
          if (!q.every(function (t) { return hay.indexOf(t) >= 0; })) return;
          var a = el("a", { "class": "qs-row", href: l[2], role: "option", id: list.id + "-" + rows.length });
          a.appendChild(el("span", { "class": "qs-label" }, l[0]));
          if (l[1]) a.appendChild(el("span", { "class": "qs-hint" }, l[1]));
          a.addEventListener("click", function () { close(false); });
          list.appendChild(a);
          rows.push(a);
        });
        if (!rows.length) list.appendChild(el("p", { "class": "qs-none" }, "No matching pages."));
        setActive(rows.length ? 0 : -1);
      }
      function onKey(e) {
        if (e.key === "Escape") { close(true); }
        else if (e.target !== input) return; /* arrows and Enter belong to the search box only, so other controls keep their keys */
        else if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
        else if (e.key === "Enter" && rows[active]) { e.preventDefault(); rows[active].click(); }
      }
      function onDoc(e) { if (!box.contains(e.target)) close(false); }
      function close(refocus) {
        if (field.hidden) return;
        field.hidden = true; list.hidden = true; btn.hidden = false;
        btn.setAttribute("aria-expanded", "false"); input.setAttribute("aria-expanded", "false");
        input.value = "";
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("click", onDoc);
        if (refocus) btn.focus();
      }
      btn.addEventListener("click", function () {
        field.hidden = false; list.hidden = false; btn.hidden = true;
        btn.setAttribute("aria-expanded", "true"); input.setAttribute("aria-expanded", "true");
        render();
        document.addEventListener("keydown", onKey);
        document.addEventListener("click", onDoc);
        input.focus();
      });
      input.addEventListener("input", render);
    });
  }

  /* Mobile More sheet: native <dialog>, falls back to the open attribute. Focus returns to the opener on close. */
  function moreSheet() {
    var sheet = document.getElementById("more-sheet");
    if (!sheet) return;
    var openers = Array.prototype.slice.call(document.querySelectorAll("[data-sheet-open]")), opener = null;
    var modal = typeof sheet.showModal === "function";
    function expanded(v) { openers.forEach(function (b) { b.setAttribute("aria-expanded", String(v)); }); }
    /* Fallback only: Escape anywhere closes the sheet; the listener exists only while the sheet is open. */
    function onKey(e) { if (e.key === "Escape") close(); }
    function closed() {
      if (!modal) document.removeEventListener("keydown", onKey);
      expanded(false);
      if (opener) { opener.focus(); opener = null; }
    }
    function close() { if (modal) sheet.close(); else if (sheet.hasAttribute("open")) { sheet.removeAttribute("open"); closed(); } }
    openers.forEach(function (b) {
      b.addEventListener("click", function () {
        opener = b;
        if (modal) sheet.showModal();
        else {
          sheet.setAttribute("open", "");
          document.addEventListener("keydown", onKey);
          var first = sheet.querySelector("a[href], button");
          if (first) first.focus();
        }
        expanded(true);
      });
    });
    sheet.addEventListener("close", closed);
    Array.prototype.forEach.call(sheet.querySelectorAll("[data-sheet-close]"), function (b) {
      b.addEventListener("click", function () {
        /* A link that changes the path hands focus to the router (panel h1), so do not send it back to the opener. */
        if (b.tagName === "A" && location.pathname !== b.getAttribute("href")) opener = null;
        close();
      });
    });
    sheet.addEventListener("click", function (e) { if (e.target === sheet) close(); });
  }

  /* Dashboard chrome (index.html). A verified account gets the workspace block, nav, account menu, tab bar and More sheet;
     an unverified one gets the wordmark and a plain Sign out only. `current` is kept for callers. */
  var LEGAL = [["/terms", "Terms"], ["/privacy", "Privacy"], ["/cancellation-refund", "Cancellation and Refund Policy"], ["/referral-terms", "Referral Program Terms"]];
  function shell(account, current) {
    if (!document.getElementById("dash-app")) return;
    var boot = document.getElementById("boot");
    if (boot) boot.remove();
    var full = !!account.email_verified;
    Array.prototype.forEach.call(document.querySelectorAll("[data-full]"), function (n) { n.hidden = !full; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-gate]"), function (n) { n.hidden = full; });
    ["side", "topbar", "site-footer"].forEach(function (id) { var n = document.getElementById(id); if (n) n.hidden = false; });
    if (full) {
      /* Mobile: the topbar avatar opens a copy of the account menu (not the More sheet). The copy is made before the
         account text, theme toggles and sign-out are wired so it gets the same values and handlers. */
      var src = document.getElementById("acct-menu"), bar = document.getElementById("topbar");
      if (src && bar && !document.getElementById("acct-menu-top")) {
        var copy = src.cloneNode(true);
        copy.id = "acct-menu-top";
        copy.className += " acct-menu-top";
        copy.hidden = true;
        /* The page footer is hidden on phones, so the legal links live at the bottom of this menu instead. */
        copy.appendChild(el("div", { "class": "menu-div" }));
        LEGAL.forEach(function (l) {
          copy.appendChild(el("a", { "class": "menu-row menu-link menu-legal", role: "menuitem", href: (cfg.siteUrl || "") + l[0] }, l[1]));
        });
        bar.appendChild(copy);
      }
      fillAccount(account);
      themeToggles();
      sideToggle();
      accountMenu("acct-row", "acct-menu");
      accountMenu("acct-btn", "acct-menu-top");
      workspaceMenu();
      notifMenus();
      quickSearch();
      var ini = document.getElementById("acct-initials");
      if (ini) ini.textContent = initials(account);
      moreSheet();
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-signout]"), function (b) { b.addEventListener("click", signOut); });
    var footer = document.getElementById("site-footer");
    if (footer) {
      footer.textContent = "";
      footer.appendChild(el("p", { "class": "foot-copy" }, "© 2026 NegosyoOnline."));
      var legal = el("nav", { "aria-label": "Legal", "class": "foot-links" });
      LEGAL.forEach(function (l) {
        legal.appendChild(el("a", { href: (cfg.siteUrl || "") + l[0] }, l[1]));
      });
      footer.appendChild(legal);
    }
  }

  function signOut() {
    call("POST", "/auth/logout/", null, true).then(function () { location.replace(cfg.siteUrl || "/"); });
  }

  /* Gate a page: needs a valid /me/ (the session cookie). Resolves the account, or redirects/stops. Every account's email is verified when it is created, so there is no verify step. */
  function requireAccount(current) {
    return call("GET", "/me/", null, true).then(function (res) {
      if (!res.ok) {
        if (res.status === 401) return new Promise(function () {});
        var main = document.getElementById("main");
        if (main) {
          main.textContent = "";
          var box = el("div", { "class": "err-box err-box-center", role: "alert" });
          box.appendChild(el("h2", {}, "We could not load your account"));
          box.appendChild(el("p", {}, messageOf(res, "We could not load your account.")));
          var again = el("button", { type: "button", "class": "no-btn no-btn-ghost" }, "Try again");
          again.addEventListener("click", function () { location.reload(); });
          box.appendChild(again);
          main.appendChild(box);
        }
        return new Promise(function () {});
      }
      var account = accountView(res.data);
      shell(account, current);
      return account;
    });
  }

  function errorSummary(container, fields, labels, message) {
    container.textContent = "";
    var box = el("div", { "class": "error-summary", role: "alert" });
    box.appendChild(el("h2", {}, message || "Please correct the highlighted fields."));
    var keys = Object.keys(fields || {}).filter(function (k) { return labels[k]; });
    if (keys.length) {
      var ul = el("ul");
      keys.forEach(function (k) { var li = el("li"); li.appendChild(el("a", { href: "#" + k }, labels[k] + ": " + fields[k])); ul.appendChild(li); });
      box.appendChild(ul);
    }
    container.appendChild(box); container.focus();
  }

  /* A one-time confirmation after sign-in (held in sessionStorage, shown on the next page, then forgotten). */
  function toast(title, sub, kind) {
    var failed = kind === "error"; /* optional third argument; no argument keeps today's success toast byte for byte */
    var t = el("div", { "class": failed ? "toast toast-error" : "toast", role: "status" });
    t.innerHTML = '<span class="toast-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + (failed ? "M12 7v6M12 17h.01" : "M5 12.5l4.5 4.5L19 7.5") + '"/></svg></span>' +
      '<div class="toast-body"><p class="toast-title"></p><p class="toast-sub"></p></div>' +
      '<button type="button" class="toast-close" aria-label="Dismiss"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<span class="toast-bar" aria-hidden="true"></span>';
    t.querySelector(".toast-title").textContent = title;
    if (sub) t.querySelector(".toast-sub").textContent = sub; else t.querySelector(".toast-sub").remove();
    document.body.appendChild(t);
    var gone = false;
    function close() { if (gone) return; gone = true; t.classList.remove("show"); setTimeout(function () { t.remove(); }, 320); }
    t.querySelector(".toast-close").addEventListener("click", close);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(close, 4500);
  }
  try {
    var flash = sessionStorage.getItem("no_toast"), flashSub = sessionStorage.getItem("no_toast_sub");
    if (flashSub) sessionStorage.removeItem("no_toast_sub");
    if (flash) { sessionStorage.removeItem("no_toast"); toast(flash, flashSub || "Welcome to your NegosyoOnline dashboard."); }
  } catch (e) { /* private mode */ }

  /* After an in-page change that moves the trial status (a cancel on the Billing page), re-read /me/ and refresh the
     sidebar text and trial chip only. Never shell(): that would build the menu a second time. A 401 is handled by call();
     any other failure is a silent no-op and the chip simply stays until the next page load. */
  function refreshAccount() {
    return call("GET", "/me/", null, true).then(function (res) {
      if (res && res.ok && res.data) fillAccount(accountView(res.data));
    });
  }

  window.NODash = { call: call, send: send, el: el, date: date, nextPath: nextPath,
    flatten: flatten, accountView: accountView, initials: initials, sitesOf: sitesOf, siteFromQuery: siteFromQuery, SITE_ID_RE: SITE_ID_RE,
    setWorkspace: setWorkspace, shell: shell, requireAccount: requireAccount, errorSummary: errorSummary,
    cfg: cfg, toast: toast, signOut: signOut, refreshAccount: refreshAccount };
})();
