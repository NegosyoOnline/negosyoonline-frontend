/* What every signed-in page shares: the user chip at the foot of the side panel with its pop-up card (name,
   email, theme, Sign out), the phone-width avatar, the Sign out buttons and the sign-out message. A page
   loads this after hq.js and menu.js and before its own script, and calls NOHqShell.signedIn(email) once
   the backend has answered who is signed in. Until then the chip and the avatar stay hidden, since nothing
   is known about the session, and a plain Sign out button stands in the chip's place. Sign out works in
   every state. */
(function () {
  var H = window.NOHq, T = window.NOHqTheme, $ = function (id) { return document.getElementById(id); };
  var row = $("acct-row"), menu = $("acct-menu"), theme = $("menu-theme");

  function put(id, text) { var n = $(id); if (n) n.textContent = text; }

  function signedIn(email) {
    var me = H.who(email), plain = $("sign-out-0");
    $("acct-ini").textContent = me.initials;
    $("acct-btn").textContent = me.initials;
    $("acct-btn").setAttribute("aria-label", "Signed in as " + me.name);
    $("acct-name").textContent = me.name;
    put("menu-ini", me.initials);
    put("menu-name", me.name);
    put("menu-email", String(email || ""));
    if (plain) plain.hidden = true;
    $("acct-row").hidden = false;
    $("acct-btn").hidden = false;
  }

  /* The pop-up above the chip, as on the Subscriber dashboard: the chip opens and closes it; Escape closes
     it and returns focus to the chip; a click outside closes it. Listeners exist only while it is open. */
  function inside(box, n) { for (; n; n = n.parentNode) if (n === box) return true; return false; }
  function onKey(e) { if (e.key === "Escape") close(true); }
  function onDoc(e) { if (!inside(menu, e.target) && !inside(row, e.target)) close(false); }
  function close(refocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    row.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("click", onDoc);
    if (refocus) row.focus();
  }
  function open() {
    var first = theme && !theme.hidden ? theme : $("sign-out");
    menu.hidden = false;
    row.setAttribute("aria-expanded", "true");
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onDoc);
    if (first) first.focus();
  }
  if (row && menu) row.addEventListener("click", function () { if (menu.hidden) open(); else close(false); });

  /* The pop-up's theme row names the theme it switches to. theme.js owns the choice and its storage. */
  if (theme) {
    theme.hidden = !T;
    if (T) {
      var paint = function (current) {
        var toLight = current === "dark", sun = $("menu-sun"), moon = $("menu-moon");
        put("menu-theme-label", toLight ? "Light theme" : "Dark theme");
        if (sun) sun.hidden = !toLight;
        if (moon) moon.hidden = toLight;
      };
      theme.addEventListener("click", function () { T.set(T.current() === "dark" ? "light" : "dark"); });
      T.onChange(paint);
      paint(T.current());
    }
  }

  /* sign-out is in the pop-up; sign-out-0 stands at the foot of the side panel until the page says who is
     signed in; sign-out-2 and sign-out-3 are a page's own, for phone width. */
  ["sign-out", "sign-out-0", "sign-out-2", "sign-out-3"].forEach(function (id) {
    var b = $(id);
    if (!b) return;
    b.addEventListener("click", function () {
      H.call("POST", "sign-out/").then(function (res) {
        var err = $("sign-out-err");
        if (res.status === 204) { location.assign("/sign-in/"); return; }
        if (err) err.hidden = false;
      });
    });
  });

  window.NOHqShell = { signedIn: signedIn };
})();
