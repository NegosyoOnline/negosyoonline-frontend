/* The side menu of every signed-in page, from one list. A page that has
   <nav class="side-nav" id="side-nav"> and loads this file gets the menu, with its own entry marked as
   the current page. A later page adds ONE line to MENU and nothing else. No entry leads to the Django
   Admin (R27).
   The Inbox is the one gated entry: it is not drawn until inbox/status/ answers 200. That one call (a POST
   with the platform in its body, nothing in the address, no audit entry on the backend, no text held) also
   wakes the search and bell buttons. On any other answer, offline, or with no client, nothing is drawn and
   the buttons stay as the page ships them.
   Settings (ClickUp z8uq9mek62) is the one plain entry after the list: always drawn, last, with Inbox and Contacts in front of it.
   Contacts is the second gated entry (ClickUp z8uq9me128): not drawn until contacts/status/ answers 200, always
   after Inbox when there is one, current for every /contacts/ path. That call carries nothing at all.
   Subscribers is the third gated entry (ClickUp z8uq9mhbdn): not drawn until subscribers/list/ answers 200
   (a 404 is the backend switch HQ_SUBSCRIBERS_ENABLED being off), always last in front of Settings. */
(function () {
  /* href: the page's address. label: its name. icon: the path of a 24 by 24 line icon. */
  var MENU = [
    { href: "/", label: "Admin console", icon: "M4 11l8-7 8 7v9H4z" },
    { href: "/finance/", label: "Finance", icon: "M3 6h18v12H3zM3 10h18M7 15h3", within: true },
    { href: "/lifecycle/", label: "Lifecycle", icon: "M4 7h16v13H4zM9 11h6M2 3h20v4H2z" },
  ];
  /* Settings is always drawn, and always last: the gated entries below go in front of it. */
  var SETTINGS = { href: "/settings/", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2" };
  var INBOX = { href: "/inbox/sms/", label: "Inbox", icon: "M4 5h16v11H8l-4 4zM8 9h8M8 12h5" };
  var CONTACTS = { href: "/contacts/", label: "Contacts", icon: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6" };
  var SUBSCRIBERS = { href: "/subscribers/", label: "Subscribers", icon: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M17 11l2 2 3-3.5" };
  /* The SVG namespace, read from the wordmark already on the page. */
  var mark = document.querySelector ? document.querySelector("svg") : null;
  var SVG = mark ? mark.namespaceURI : null;
  var nav = document.getElementById("side-nav");
  if (!nav) return;
  /* Under 900 px the side menu is not shown: the top bar's avatar opens a sheet (shell.js) with the same
     entries. It is kept from the same list, entry for entry; a page without it draws the side menu alone. */
  var sheet = document.getElementById("sheet-nav");

  function icon(d) {
    var svg = document.createElementNS(SVG, "svg"), path = document.createElementNS(SVG, "path");
    [["viewBox", "0 0 24 24"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "2"],
      ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"], ["focusable", "false"]]
      .forEach(function (a) { svg.setAttribute(a[0], a[1]); });
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
  }

  function link(item, current) {
    var a = document.createElement("a"), label = document.createElement("span");
    a.setAttribute("href", item.href);
    if (current) a.setAttribute("aria-current", "page");
    a.appendChild(icon(item.icon));
    label.textContent = item.label;
    a.appendChild(label);
    return a;
  }
  /* before: an entry already drawn that this one goes in front of (null: at the end). The sheet's copy of
     an entry is its twin, and goes in front of the twin of "before". */
  function entry(item, current, before) {
    var a = link(item, current);
    nav.insertBefore(a, before || null);
    if (sheet) {
      a.twin = link(item, current);
      sheet.insertBefore(a.twin, before ? before.twin : null);
    }
    return a;
  }

  nav.textContent = "";
  if (sheet) sheet.textContent = "";
  /* within: the entry is current for every address under its own (Finance has sub-pages). */
  MENU.forEach(function (item) {
    entry(item, item.within ? location.pathname.indexOf(item.href) === 0 : location.pathname === item.href);
  });
  var settingsLink = entry(SETTINGS, location.pathname === SETTINGS.href, null);
  nav.hidden = false;

  /* ---- the Inbox, only when the backend says this person may open it ---- */

  var H = window.NOHq;
  if (!H || typeof H.call !== "function") return;

  var pills = [], dots = [], contactsLink = null, subscribersLink = null;
  function unreadWords(n) { return n > 0 ? "Inbox, " + n + " unread" : "Inbox, no unread texts"; }

  /* The unread number on the menu entry and the dot on the bell. The Inbox page calls this after it has
     read the status again. */
  function setUnread(n) {
    n = typeof n === "number" && n > 0 ? Math.floor(n) : 0;
    pills.forEach(function (pill) { pill.textContent = String(n); pill.hidden = n === 0; });
    dots.forEach(function (d) { d.hidden = n === 0; });
    ["bell-btn", "bell-btn-2"].forEach(function (id) {
      var b = document.getElementById(id);
      if (b && b.getAttribute("aria-disabled") === null) b.setAttribute("aria-label", unreadWords(n));
      if (b && b.getAttribute("aria-disabled") === null) b.setAttribute("title", unreadWords(n));
    });
  }

  function wake(id, words, to) {
    var b = document.getElementById(id);
    if (!b) return null;
    b.removeAttribute("aria-disabled");
    b.setAttribute("title", words);
    b.setAttribute("aria-label", words);
    b.addEventListener("click", function () { location.assign(to); });
    return b;
  }

  H.call("POST", "inbox/status/", { platform: "sms" }).then(function (res) {
    if (!res || res.status !== 200) return;
    var a = entry(INBOX, location.pathname.indexOf("/inbox/") === 0, contactsLink || subscribersLink || settingsLink);
    [a, a.twin].forEach(function (x) {
      if (!x) return;
      var pill = document.createElement("span");
      pill.setAttribute("class", "count");
      x.appendChild(pill);
      pills.push(pill);
    });
    ["search-btn", "search-btn-2"].forEach(function (id) {
      wake(id, "Find a conversation by full number", "/inbox/sms/#find");
    });
    ["bell-btn", "bell-btn-2"].forEach(function (id) {
      var b = wake(id, unreadWords(0), "/inbox/sms/"), dot;
      if (!b) return;
      dot = document.createElement("span");
      dot.setAttribute("class", "bell-dot");
      dot.setAttribute("aria-hidden", "true");
      b.appendChild(dot);
      dots.push(dot);
    });
    setUnread(res.data && res.data.unread);
  });

  H.call("POST", "contacts/status/").then(function (res) {
    if (!res || res.status !== 200) return;
    contactsLink = entry(CONTACTS, location.pathname.indexOf("/contacts/") === 0, subscribersLink || settingsLink);
  });

  /* Only a 200 draws the entry; a 404 is the switch being off. The body is the smallest the route takes, and the
     answer is not read. */
  H.call("POST", "subscribers/list/", { filter: "all" }).then(function (res) {
    if (!res || res.status !== 200) return;
    subscribersLink = entry(SUBSCRIBERS, location.pathname.indexOf("/subscribers/") === 0, settingsLink);
  });

  window.NOHqMenu = { setUnread: setUnread };
})();
