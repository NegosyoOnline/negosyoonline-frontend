/* The side menu of every signed-in page, from one list. A page that has
   <nav class="side-nav" id="side-nav"> and loads this file gets the menu, with its own entry marked as
   the current page. A later page adds ONE line to MENU and nothing else. No entry leads to the Django
   Admin (R27). */
(function () {
  /* href: the page's address. label: its name. icon: the path of a 24 by 24 line icon. */
  var MENU = [
    { href: "/", label: "Admin console", icon: "M4 11l8-7 8 7v9H4z" },
    { href: "/finance/", label: "Finance", icon: "M3 6h18v12H3zM3 10h18M7 15h3" },
  ];
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

  nav.textContent = "";
  MENU.forEach(function (item) {
    var a = document.createElement("a"), label = document.createElement("span");
    a.setAttribute("href", item.href);
    if (location.pathname === item.href) a.setAttribute("aria-current", "page");
    a.appendChild(icon(item.icon));
    label.textContent = item.label;
    a.appendChild(label);
    nav.appendChild(a);
  });
  nav.hidden = false;
})();
