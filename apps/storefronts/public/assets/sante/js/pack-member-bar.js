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
