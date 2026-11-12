/* Funnel policy popup: a plain click on a store policy link shows that page's article in the dialog. A modified click
   opens the link as usual, and if the page cannot be fetched the browser simply goes to it. */
(function () {
  var dlg = document.getElementById("pp-policy-dlg");
  if (!dlg || typeof dlg.showModal !== "function") return;
  var title = document.getElementById("pp-policy-dlg-title"), body = document.getElementById("pp-policy-dlg-body");
  var paths = dlg.getAttribute("data-policy-paths").split(" ").filter(Boolean), latest = 0;

  function show(link) {
    var mine = ++latest, href = link.getAttribute("href");
    title.textContent = link.textContent.trim();
    body.textContent = "Loading…";
    body.scrollTop = 0;
    if (!dlg.open) dlg.showModal();
    fetch(href, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("policy");
      return r.text();
    }).then(function (html) {
      if (mine !== latest) return;
      var article = new DOMParser().parseFromString(html, "text/html").querySelector(".pp-policy");
      if (!article) throw new Error("policy");
      var h1 = article.querySelector("h1"), nav = article.querySelector(".pp-policy-nav");
      title.textContent = h1.textContent;
      h1.remove();
      if (nav) nav.remove();
      body.textContent = "";
      body.appendChild(document.importNode(article, true));
      body.scrollTop = 0;
    }).catch(function () { if (mine === latest) location.assign(href); });
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var link = e.target.closest ? e.target.closest("a[href]") : null;
    if (!link || paths.indexOf(link.getAttribute("href")) < 0) return;
    e.preventDefault();
    show(link);
  });
  document.getElementById("pp-policy-dlg-close").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); }); /* the backdrop */
  dlg.addEventListener("close", function () { latest++; });
})();
