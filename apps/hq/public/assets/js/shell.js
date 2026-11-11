/* What every signed-in page shares: the user card in the side panel, the phone-width avatar, the Sign out
   buttons and the sign-out message. A page loads this after hq.js and menu.js and before its own script,
   and calls NOHqShell.signedIn(email) once the backend has answered who is signed in. Until then the
   user card and the avatar stay hidden: nothing is known about the session. Sign out works in every state. */
(function () {
  var H = window.NOHq, $ = function (id) { return document.getElementById(id); };

  function signedIn(email) {
    var me = H.who(email);
    $("acct-ini").textContent = me.initials;
    $("acct-btn").textContent = me.initials;
    $("acct-btn").setAttribute("aria-label", "Signed in as " + me.name);
    $("acct-name").textContent = me.name;
    $("acct-row").hidden = false;
    $("acct-btn").hidden = false;
  }

  /* sign-out is the side panel's button; sign-out-2 and sign-out-3 are a page's own, for phone width. */
  ["sign-out", "sign-out-2", "sign-out-3"].forEach(function (id) {
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
