/* The five Inbox platforms that are not built (Facebook Messenger, Instagram, TikTok, Email, Web chat): one
   card that says so. The page calls me/ and inbox/status/ only, so it is shown to a staff member who can open
   the Inbox and to nobody else; it shows no conversation and promises no date. The name comes from the path
   and from this fixed list; next.config.ts routes only these five paths here. */
(function () {
  var H = window.NOHq, $ = function (id) { return document.getElementById(id); };
  var NAMES = { messenger: "Facebook Messenger", instagram: "Instagram", tiktok: "TikTok", email: "Email", webchat: "Web chat" };
  var VIEWS = ["boot", "v-platform", "v-closed", "v-down"];
  var slug = String(location.pathname).split("/").filter(Boolean)[1] || "";
  var name = Object.prototype.hasOwnProperty.call(NAMES, slug) ? NAMES[slug] : "";

  function show(view) {
    VIEWS.forEach(function (id) { $(id).hidden = id !== view; });
    $("tabs").hidden = view !== "v-platform";
    $("p-h1").hidden = view !== "v-platform";
  }
  function left(res) {
    var place = H.placeFor(res);
    if (place === "verify") { location.replace("/verify/"); return true; }
    if (place === "sign-in") { location.replace("/sign-in/"); return true; }
    return false;
  }

  function start() {
    if (!name) { show("v-closed"); return; }
    show("boot");
    H.call("GET", "me/").then(function (res) {
      if (left(res)) return;
      if (!res.ok) { show("v-down"); return; }
      window.NOHqShell.signedIn(res.data.email);
      H.call("POST", "inbox/status/", { platform: "sms" }).then(function (st) {
        if (left(st)) return;
        if (st.status === 404) { show("v-closed"); return; }
        if (!st.ok) { show("v-down"); return; }
        $("p-title").textContent = name + " is not yet available";
        $("p-h1").textContent = "Inbox: " + name;
        [].slice.call($("tabs").children).forEach(function (a) {
          if (a.getAttribute("data-p") === slug) a.setAttribute("aria-current", "page");
        });
        if (window.NOHqMenu) window.NOHqMenu.setUnread(st.data.unread);
        show("v-platform");
      });
    });
  }
  $("retry").addEventListener("click", start);
  start();
})();
