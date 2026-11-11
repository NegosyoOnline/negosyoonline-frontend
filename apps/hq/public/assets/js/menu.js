/* The side menu of every signed-in page, from one list. A page that has
   <nav class="side-nav" id="side-nav"> and loads this file gets the menu, with its own entry marked as
   the current page. A later page adds ONE line to MENU and nothing else. No entry leads to the Django
   Admin (R27).
   An entry with a gate ("contacts") is drawn only once POST <gate>/status/ has answered 200: with any other
   answer, offline, or without hq.js, it is not drawn and nothing is said. deep: the entry is current for
   every path below its address. */
(function () {
  /* href: the page's address. label: its name. icon: the path of a 24 by 24 line icon. */
  var MENU = [
    { href: "/", label: "Admin console", icon: "M4 11l8-7 8 7v9H4z" },
    { href: "/finance/", label: "Finance", icon: "M3 6h18v12H3zM3 10h18M7 15h3" },
    { href: "/contacts/", label: "Contacts", icon: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 5.2a3.5 3.5 0 0 1 0 6.6",
      gate: "contacts", deep: true },
  ];
  var open = {};  /* the gates that have answered 200 */
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

  function draw() {
    nav.textContent = "";
    MENU.forEach(function (item) {
      if (item.gate && !open[item.gate]) return;
      var a = document.createElement("a"), label = document.createElement("span");
      a.setAttribute("href", item.href);
      if (location.pathname === item.href || (item.deep && location.pathname.indexOf(item.href) === 0)) a.setAttribute("aria-current", "page");
      a.appendChild(icon(item.icon));
      label.textContent = item.label;
      a.appendChild(label);
      nav.appendChild(a);
    });
    nav.hidden = false;
  }
  draw();

  /* One status call per gate per page load. The call writes no audit entry and carries no value. */
  var H = window.NOHq;
  if (H && H.call) {
    MENU.forEach(function (item) {
      if (!item.gate) return;
      H.call("POST", item.gate + "/status/").then(function (res) {
        if (res.ok && res.status === 200) { open[item.gate] = true; draw(); }
      }, function () {});
    });
  }
})();
