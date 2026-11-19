/* The member dashboard bar's script (this storefront's own file; the policy allows no inline script). It is loaded in the head so the
   saved theme is set before the page paints, then it runs the two dropdowns, the Light/Dark switch and the notification bell.
   Theme: localStorage "no-member-theme" = "dark" | "light"; a browser that blocks storage keeps the light theme for the page.
   Bell: /dashboard/notifications/ (list and count), .../read/ (one) and .../read-all/ (all), same origin, no token in the page. */
(function () {
  var KEY = "no-member-theme";
  var root = document.documentElement;
  function saved() { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { window.localStorage.setItem(KEY, v); } catch (e) { /* storage blocked: the choice lasts for this page */ } }
  function apply(v) { if (v === "dark") { root.setAttribute("data-theme", "dark"); } else { root.removeAttribute("data-theme"); } }
  apply(saved());

  function ready(fn) { if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", fn); } else { fn(); } }

  /* The "Earn with Santé" menu: the button opens the list; Esc closes it and returns focus to the button; a click elsewhere closes it. */
  ready(function () {
    var earn = document.querySelector("[data-pdn-earn]");
    if (!earn) { return; }
    var btn = earn.querySelector("[data-pdn-earn-btn]"), pop = earn.querySelector("[data-pdn-earn-pop]");
    function set(open) { pop.hidden = !open; btn.setAttribute("aria-expanded", open ? "true" : "false"); }
    btn.addEventListener("click", function () { set(pop.hidden); });
    document.addEventListener("click", function (e) { if (!pop.hidden && !earn.contains(e.target)) { set(false); } }, true);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !pop.hidden) { set(false); btn.focus(); }
    });
    earn.addEventListener("focusout", function (e) { if (!pop.hidden && e.relatedTarget && !earn.contains(e.relatedTarget)) { set(false); } });
  });


  /* The More sheet of the bottom navigation (phones and tablets): the More button opens it; Esc, the close button and a tap on the backdrop close it
     and return focus to the button; Tab stays inside it while it is open; the page behind does not scroll. */
  ready(function () {
    var sheet = document.querySelector("[data-mbn-sheet]"), btn = document.querySelector("[data-mbn-more]");
    if (!sheet || !btn) { return; }
    var root2 = document.documentElement;
    function focusables() { return Array.prototype.slice.call(sheet.querySelectorAll("a[href], button:not([disabled])")); }
    function set(open) {
      sheet.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) { root2.classList.add("mbn-lock"); var f = focusables(); if (f.length) { f[0].focus(); } }
      else { root2.classList.remove("mbn-lock"); }
    }
    btn.addEventListener("click", function () { set(sheet.hidden); });
    sheet.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-mbn-close]")) { set(false); btn.focus(); } });
    document.addEventListener("keydown", function (e) {
      if (sheet.hidden) { return; }
      if (e.key === "Escape") { set(false); btn.focus(); return; }
      if (e.key === "Tab") {
        var f = focusables(); if (!f.length) { return; }
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener("resize", function () { if (!sheet.hidden && window.innerWidth > 1024) { set(false); } });
  });

  ready(function () {
    var user = document.querySelector("[data-pdn-user]");
    var bell = document.querySelector("[data-pdn-bell]");
    if (!user || !bell) { return; }
    var userBtn = user.querySelector("[data-pdn-user-btn]"), userPop = user.querySelector("[data-pdn-user-pop]");
    var bellBtn = bell.querySelector("[data-pdn-bell-btn]"), bellPop = bell.querySelector("[data-pdn-bell-pop]");

    function setOpen(btn, pop, open) { pop.hidden = !open; btn.setAttribute("aria-expanded", open ? "true" : "false"); }
    function closeAll() { setOpen(userBtn, userPop, false); setOpen(bellBtn, bellPop, false); }
    userBtn.addEventListener("click", function (e) { e.stopPropagation(); var o = userPop.hidden; closeAll(); setOpen(userBtn, userPop, o); });
    bellBtn.addEventListener("click", function (e) { e.stopPropagation(); var o = bellPop.hidden; closeAll(); setOpen(bellBtn, bellPop, o); if (o) { load(); } });
    document.addEventListener("click", function (e) { if (!user.contains(e.target) && !bell.contains(e.target)) { closeAll(); } });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && (!userPop.hidden || !bellPop.hidden)) { var btn = userPop.hidden ? bellBtn : userBtn; closeAll(); btn.focus(); }
    });

    var seg = user.querySelector("[data-pdn-theme]");
    if (seg) {
      seg.addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        apply(next); save(next);
      });
    }

    var badge = bell.querySelector("[data-pdn-badge]"), list = bell.querySelector("[data-pdn-bell-list]");
    var empty = bell.querySelector("[data-pdn-bell-empty]"), readAll = bell.querySelector("[data-pdn-readall]");

    function count(n) {
      n = Number(n) || 0;
      badge.hidden = n < 1;
      badge.textContent = n > 99 ? "99+" : String(n);
      bellBtn.setAttribute("aria-label", n > 0 ? "Notifications, " + n + " unread" : "Notifications");
    }
    function post(url, body) {
      return window.fetch(url, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body || {})
      }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }
    function target(url) { return typeof url === "string" && /^\/(?![\/\\])/.test(url) ? url : ""; }
    function when(iso) {
      var d = new Date(iso);
      return isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
    function draw(items) {
      list.textContent = "";
      items.forEach(function (n) {
        var li = document.createElement("li"), b = document.createElement("button");
        b.type = "button";
        b.className = "pdn-bell-item" + (n.read_at ? "" : " is-unread");
        b.appendChild(document.createTextNode(n.title));
        var small = document.createElement("small");
        small.textContent = when(n.created_at);
        b.appendChild(small);
        b.addEventListener("click", function () {
          var go = target(n.url);
          var done = function (r) { if (r) { count(r.unread_count); } if (go) { window.location.assign(go); } };
          if (n.read_at) { done(null); } else { post("/dashboard/notifications/read/", { id: n.id }).then(done); }
        });
        li.appendChild(b);
        list.appendChild(li);
      });
      empty.hidden = items.length > 0;
      readAll.hidden = items.length === 0;
    }
    function load() {
      window.fetch("/dashboard/notifications/", { credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (d && Array.isArray(d.notifications)) { draw(d.notifications); count(d.unread_count); } })
        .catch(function () { /* the bell stays as it was */ });
    }
    readAll.addEventListener("click", function () {
      post("/dashboard/notifications/read-all/").then(function (r) { if (r) { count(r.unread_count); load(); } });
    });
    load();
  });
})();
