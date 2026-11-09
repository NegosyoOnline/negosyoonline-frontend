/* Landing page after a social sign-in. The API redirects here with a one-time code in the
   address fragment (never sent to a server). It is removed from the address bar at once,
   then traded for the normal session token. */
(function () {
  var D = window.NODash, $ = function (id) { return document.getElementById(id); };
  var frag = new URLSearchParams(location.hash.replace(/^#/, ""));
  var code = frag.get("code") || "", error = frag.get("error") || "";
  try { history.replaceState(null, "", location.pathname); } catch (e) { /* ignore */ }

  function fail(text) {
    $("h").textContent = "We could not sign you in";
    $("msg").textContent = text;
    $("retry").href = ((window.NO_CONFIG || {}).siteUrl || "") + "/?signin=1";
    $("retry").hidden = false;
    $("h").focus();
  }

  /* Only Facebook reconnect (link mode) lands here with #error=; the owner is still signed in. */
  if (!code && error) {
    $("h").textContent = "We could not connect Facebook";
    /* The verification link is single use, so these cannot say "try again": point to the sign-in options that still work. */
    var RETRYABLE = { cancelled: 1, failed: 1, invalid_state: 1 };
    $("msg").textContent = RETRYABLE[error]
      ? "Facebook was not connected. You can sign in with an email code or Google."
      : D.socialErrorMessage(error);
    $("retry").textContent = "Go to Dashboard";
    $("retry").href = "/";
    $("retry").hidden = false;
    $("h").focus();
    return;
  }
  if (!code) { fail("This sign-in link is not valid. Please try again."); return; }
  D.call("POST", "/auth/social/exchange/", { code: code }, false, true).then(function (res) {
    if (res.ok && res.data.token) { D.setToken(res.data.token); try { sessionStorage.setItem("no_toast", "You are signed in."); } catch (e) { /* ignore */ } location.replace("/"); return; }
    fail(res.status === 429 ? "Too many attempts. Please wait a little and try again."
      : (res.data.message || "This sign-in link has expired or was already used. Please try again."));
  });
})();
