/* The side menu of every signed-in page, from one list. A page that has
   <nav class="side-nav" id="side-nav"> and loads this file gets the menu, with its own entry marked as
   the current page. A later page adds ONE line to MENU and nothing else. No entry leads to the Django
   Admin (R27).
   The Inbox is the one gated entry: it is not drawn until inbox/status/ answers 200. That one call (a POST
   with the platform in its body, nothing in the address, no audit entry on the backend, no text held) also
   wakes the search and bell buttons. On any other answer, offline, or with no client, nothing is drawn and
   the buttons stay as the page ships them. */
(function () {
  /* href: the page's address. label: its name. icon: the path of a 24 by 24 line icon. */
  var MENU = [
    { href: "/", label: "Admin console", icon: "M4 11l8-7 8 7v9H4z" },
    { href: "/finance/", label: "Finance", icon: "M3 6h18v12H3zM3 10h18M7 15h3" },
  ];
  var INBOX = { href: "/inbox/sms/", label: "Inbox", icon: "M4 5h16v11H8l-4 4zM8 9h8M8 12h5" };
  /* The SVG namespace, read from the wordmark already on the page. */
  var mark = document.querySelector ? document.querySelector("svg") : null;
  var SVG = mark ? mark.namespaceURI : null;
  var nav = document.getElementById("side-nav");
  if (!nav) return;

  function icon(d) {
    var svg = document.createElementNS(SVG, "svg"), path = document.createElementNS(SVG, "path");
    [["viewBox", "0 0 24 24"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "2"],
      ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"], ["focusable", "false"]]
      .forEach(function (a) { svg.setAttribute(a[0], a[1]); });
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
  }

  function entry(item, current) {
    var a = document.createElement("a"), label = document.createElement("span");
    a.setAttribute("href", item.href);
    if (current) a.setAttribute("aria-current", "page");
    a.appendChild(icon(item.icon));
    label.textContent = item.label;
    a.appendChild(label);
    nav.appendChild(a);
    return a;
  }

  nav.textContent = "";
  MENU.forEach(function (item) { entry(item, location.pathname === item.href); });
  nav.hidden = false;

  /* ---- the Inbox, only when the backend says this person may open it ---- */

  var H = window.NOHq;
  if (!H || typeof H.call !== "function") return;

  var pill = null, dots = [];
  function unreadWords(n) { return n > 0 ? "Inbox, " + n + " unread" : "Inbox, no unread texts"; }

  /* The unread number on the menu entry and the dot on the bell. The Inbox page calls this after it has
     read the status again. */
  function setUnread(n) {
    n = typeof n === "number" && n > 0 ? Math.floor(n) : 0;
    if (pill) { pill.textContent = String(n); pill.hidden = n === 0; }
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
    var a = entry(INBOX, location.pathname.indexOf("/inbox/") === 0);
    pill = document.createElement("span");
    pill.setAttribute("class", "count");
    a.appendChild(pill);
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

  window.NOHqMenu = { setUnread: setUnread };
})();
