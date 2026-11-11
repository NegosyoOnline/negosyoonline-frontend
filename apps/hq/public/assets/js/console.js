/* The admin console: who is signed in, when the session ends, and that person's last sign-in events, as
   the backend gives them. It writes nothing. The labels are the Django console's own words. */
(function () {
  var H = window.NOHq, $ = function (id) { return document.getElementById(id); };
  var EVENT = { admin_sign_in_ok: "Signed in", admin_sign_in_failed: "Wrong code", admin_locked: "Sign-in paused",
    admin_sign_out: "Signed out" };
  var SURFACE = { hq: "Admin console", django_admin: "Operator admin" };
  var STEP = { email: "email code", totp: "authenticator code", recovery: "recovery code" };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    n.setAttribute("class", cls);
    if (text != null) n.textContent = text;
    return n;
  }

  /* One event, or null for an action this page has no words for: a raw value is never shown. */
  function row(e) {
    var label = Object.prototype.hasOwnProperty.call(EVENT, e.action) ? EVENT[e.action] : null;
    if (!label) return null;
    var where = [SURFACE[e.surface], STEP[e.step]].filter(Boolean).join(" · ");
    var li = el("li", "event"), main = el("span", "item-main"), time = el("time", "item-time", H.when(e.at));
    main.appendChild(el("span", "item-num", label));
    if (where) main.appendChild(el("span", "item-sub", where));
    time.setAttribute("datetime", String(e.at || ""));
    li.appendChild(main);
    li.appendChild(time);
    return li;
  }

  function paint(d) {
    var me = H.who(d.email), list = $("events");
    $("who-h").textContent = "Signed in as " + (d.email || "");
    $("times").textContent = "Verified at " + H.when(d.verified_at) + ". Session ends " + H.when(d.expires_at) + ".";
    $("acct-ini").textContent = me.initials;
    $("acct-btn").textContent = me.initials;
    $("acct-btn").setAttribute("aria-label", "Signed in as " + me.name);
    $("acct-name").textContent = me.name;
    list.textContent = "";
    (Array.isArray(d.events) ? d.events : []).forEach(function (e) {
      var li = row(e || {});
      if (li) list.appendChild(li);
    });
    list.hidden = list.children.length === 0;
    $("events-empty").hidden = list.children.length > 0;
    $("boot").hidden = true;
    $("v-console").hidden = false;
  }

  ["sign-out", "sign-out-2"].forEach(function (id) {
    $(id).addEventListener("click", function () {
      H.call("POST", "sign-out/").then(function (res) {
        if (res.status === 204) { location.assign("/sign-in/"); return; }
        $("sign-out-err").hidden = false;
      });
    });
  });

  H.call("GET", "console/").then(function (res) {
    var place = H.placeFor(res);
    if (place === "console") { paint(res.data); return; }
    if (place === "verify") { location.replace("/verify/"); return; }
    if (place === "sign-in") { location.replace("/sign-in/"); return; }
    $("boot").hidden = true;
    $("v-down").hidden = false;
  });
})();
