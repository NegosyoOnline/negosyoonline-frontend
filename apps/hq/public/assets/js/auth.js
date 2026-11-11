/* The staff sign-in: /sign-in/, /code/ and /verify/ are one document that changes view here, so the
   address a person typed can be shown on the code form from memory alone. It is never put in an address,
   a cookie or storage, and is gone after a reload (design 22.3). The backend checks every code and sets
   the cookie; this page follows its answers and decides nothing about access. */
(function () {
  var H = window.NOHq, $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["sign-in", "code", "verify", "paused", "down"];
  var PATHS = { "sign-in": "/sign-in/", "code": "/code/", "verify": "/verify/" };
  var TITLES = { "sign-in": "Sign in", "code": "Enter your code", "verify": "Two-step sign-in",
    "paused": "Sign-in paused", "down": "Not available" };
  var WRONG_EMAIL = "Enter an email address.";
  var WRONG_CODE = "That code did not work. Check it, or get a new code.";
  var WRONG_SECOND = "That code did not work. Try again.";
  var email = "", fresh = false, recovery = false, busy = false;

  /* Marks a field wrong with the words to show, or clears it. The backend gives no reason, so neither does this. */
  function fail(field, text) {
    var box = $(field + "-err");
    box.textContent = text;
    box.hidden = !text;
    if (text) { $(field).setAttribute("aria-invalid", "true"); $(field).focus(); }
    else $(field).removeAttribute("aria-invalid");
  }

  function paintSecond() {
    var f = $("second");
    $("second-lead").textContent = recovery ? "Enter one of your 10 recovery codes. Each code works once."
      : "Enter the 6-digit code from your authenticator app.";
    $("second-label").textContent = recovery ? "Recovery code" : "Authenticator code";
    $("second-switch").textContent = recovery ? "Use your authenticator app instead" : "Use a recovery code instead";
    f.value = "";
    f.setAttribute("maxlength", recovery ? "12" : "6");
    f.setAttribute("inputmode", recovery ? "text" : "numeric");
    f.setAttribute("autocomplete", recovery ? "off" : "one-time-code");
    f.setAttribute("autocapitalize", recovery ? "characters" : "none");
    f.setAttribute("class", recovery ? "input" : "input code");
    fail("second", "");
    f.focus();
  }

  function show(view, push) {
    var path = PATHS[view];
    VIEWS.forEach(function (v) { $("v-" + v).hidden = v !== view; });
    $("boot").hidden = true;
    document.title = TITLES[view] + " | NegosyoOnline HQ";
    if (path && location.pathname !== path) {
      try { history[push ? "pushState" : "replaceState"](null, "", path); } catch (e) { /* the view still shows */ }
    }
    if (view === "sign-in") { fail("email", ""); $("email").focus(); }
    if (view === "code") {
      $("code-notice").hidden = !fresh;
      fresh = false;
      $("code-sent").textContent = email ? "Code sent to " + email + "." : "Code sent to your email.";
      $("code").value = "";
      fail("code", "");
      $("code").focus();
    }
    if (view === "verify") { recovery = false; paintSecond(); }
  }

  /* A signed-in person has nothing to do here: the console is the first page. */
  function signedIn() { location.replace("/"); }

  function start() {
    H.call("GET", "me/").then(function (res) {
      var place = H.placeFor(res);
      if (place === "console") { signedIn(); return; }
      if (place === "verify" || place === "down") { show(place); return; }
      show(location.pathname === "/code/" ? "code" : "sign-in");
    });
  }

  function send(path, body, field, wrong, then) {
    if (busy) return;
    busy = true;
    H.call("POST", path, body).then(function (res) {
      busy = false;
      if (res.status === 204) { then(); return; }
      if (res.status === 409) { start(); return; }
      if (res.status === 400) { fail(field, wrong); return; }
      if (res.status === 403 && res.code === "sign_in_paused") { show("paused"); return; }
      if (res.status === 401) { show("sign-in"); return; }
      show("down");
    });
  }

  $("v-sign-in").addEventListener("submit", function (e) {
    var typed = $("email").value.trim();
    e.preventDefault();
    if (!typed) { fail("email", WRONG_EMAIL); return; }
    send("sign-in/", { email: typed }, "email", WRONG_EMAIL, function () { email = typed; fresh = true; show("code", true); });
  });

  $("v-code").addEventListener("submit", function (e) {
    var typed = $("code").value.replace(/\s+/g, "");
    e.preventDefault();
    if (!/^\d{6}$/.test(typed)) { fail("code", WRONG_CODE); return; }
    send("sign-in/code/", { code: typed }, "code", WRONG_CODE, function () { show("verify", true); });
  });

  $("v-verify").addEventListener("submit", function (e) {
    var typed = $("second").value.trim();
    e.preventDefault();
    if (!typed) { fail("second", WRONG_SECOND); return; }
    send("sign-in/verify/", { code: typed }, "second", WRONG_SECOND, start);
  });

  $("second-switch").addEventListener("click", function (e) {
    e.preventDefault();
    recovery = !recovery;
    paintSecond();
  });

  window.addEventListener("popstate", start);
  start();
})();
