/* Confirms the single-use token from the verification email, then signs this browser in with the one-time
   exchange code the API answers with. The token is removed from the address bar at once. The bearer token
   never appears in a URL; the Facebook reconnect uses a one-time link code bound to this browser's cookie. */
(function () {
  var D = window.NODash, cfg = D.cfg || {}, $ = function (id) { return document.getElementById(id); };
  var token = new URLSearchParams(location.search).get("token") || "";
  try { history.replaceState(null, "", location.pathname); } catch (e) { /* ignore */ }

  function show(title, text) { $("h").textContent = title; $("msg").textContent = text; $("h").focus(); }
  function button(label, href, cls) { var go = $("go"); go.textContent = label; go.href = href; go.className = cls; go.hidden = false; }
  function signInButton() { button("Sign In", (cfg.siteUrl || "") + "/?signin=1", "btn btn-primary"); }
  /* Rule G: a browser that holds a token may try the dashboard; anyone else signs in. */
  function stop(title, text) {
    show(title, text);
    if (D.getToken()) button("Go to Dashboard", "/", "btn btn-primary"); else signInButton();
  }
  function signedIn(kept) {
    show("Your email is verified.", "Opening your dashboard...");
    try {
      sessionStorage.setItem("no_toast", "Your email is verified.");
      if (kept) sessionStorage.setItem("no_toast_sub", "Facebook sign-in stays on for this account.");
    } catch (e) { /* ignore */ }
    location.replace("/");
  }
  /* S7: verified, but this browser could not be signed in automatically. */
  function notSignedIn() {
    show("Your email is verified.", "We could not sign you in automatically. Sign in to open your dashboard. Your 14-day free trial is running and no credit card is needed.");
    signInButton();
  }

  /* S3: verification turned Facebook off for this account; offer the reconnect and never redirect on our own. */
  function facebookRemoved(account) {
    var msg = $("msg"), fb = $("fb"), failed = false;
    $("h").textContent = "Your email is verified.";
    msg.textContent = "";
    msg.appendChild(document.createTextNode("You are signed in as "));
    msg.appendChild(D.el("strong", {}, (account && account.email) || ""));
    msg.appendChild(document.createTextNode(". This account was started with Facebook on another browser or device, so for your safety we turned off Facebook sign-in when you verified here. To keep signing in with Facebook, continue with Facebook now."));
    fb.hidden = false;
    button("Go to Dashboard", "/", "btn btn-ghost");
    fb.addEventListener("click", function () {
      if (fb.disabled) return;
      fb.disabled = true;
      D.call("POST", "/auth/social/facebook/link/", null, true, true).then(function (res) {
        if (res.ok && res.data.link_code) {
          location.assign(cfg.apiBase + "/auth/social/facebook/start/?mode=link&link=" + encodeURIComponent(res.data.link_code));
          return;
        }
        if (res.status === 403 && res.data.code === "link_window_closed") {  /* spec S9: the 30 minutes have passed */
          fb.hidden = true;
          msg.appendChild(document.createTextNode(" The time to connect Facebook has passed. You can sign in with an email code or Google."));
          $("h").focus();
          return;
        }
        fb.disabled = false;
        if (!failed) { failed = true; msg.appendChild(document.createTextNode(" We could not start Facebook sign-in. You can go to your dashboard and sign in with an email code or Google.")); }
        $("h").focus();
      });
    });
    /* Coming back from Facebook (back button, bfcache) must not leave a dead button. */
    window.addEventListener("pageshow", function (e) { if (e.persisted && !fb.hidden) fb.disabled = false; });
    $("h").focus();
  }

  if (!token) { stop("This link is not valid", "Open the link from your verification email, or sign in and request a new one."); return; }
  D.call("POST", "/auth/verify-email/", { token: token }, false, true).then(function (res) {
    if (res.status === 0) { stop("We could not reach the server", "Check your connection and open the link again. If it then says the link was used, your email is already verified, so just sign in."); return; }
    if (res.status === 429) { stop("Too many attempts", "Please wait a little and open the link again."); return; }
    if (!res.ok) { stop("This link has expired or was already used", "If you already verified, just sign in. Otherwise sign in and choose Resend verification email to get a new link."); return; }
    if (typeof res.data.exchange_code !== "string" || !res.data.exchange_code) { notSignedIn(); return; }  /* old API (spec 4.7): S7, no exchange POST */
    var removed = res.data.facebook_removed === true, kept = res.data.facebook_kept === true;
    D.call("POST", "/auth/social/exchange/", { code: res.data.exchange_code }, false, true).then(function (ex) {
      if (!ex.ok || !ex.data.token) { notSignedIn(); return; }
      D.setToken(ex.data.token);
      if (removed) facebookRemoved(ex.data.account); else signedIn(kept);
    });
  });
})();
