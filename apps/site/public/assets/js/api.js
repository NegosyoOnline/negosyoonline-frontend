/* Shared API helper for the sign-up popup. No dependencies, no secrets.
   The bearer token lives in sessionStorage only so the "Check your email" screen can resend
   the verification link; it is never put in a URL. */
(function () {
  var cfg = window.NO_CONFIG || {};
  var TOKEN_KEY = "no_token";

  function getToken() { try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setToken(t) { try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* private mode */ } }

  /* Resolves {ok, status, data}. Network failure resolves {ok:false, status:0}.
     `credentials` is passed only by the email-code verify call, so the API host's HttpOnly bind cookie
     (login CSRF fix, CA2-09) is stored for the dashboard's code exchange. */
  function call(method, path, body, auth, credentials) {
    var headers = { "Content-Type": "application/json" };
    if (auth) headers.Authorization = "Bearer " + getToken();
    var opts = { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined };
    if (credentials) opts.credentials = "include";
    return fetch(cfg.apiBase + path, opts)
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok, status: r.status, data: data }; });
      })
      .catch(function () { return { ok: false, status: 0, data: { message: "We could not reach the server. Please check your connection and try again." } }; });
  }

  /* 30-day referral attribution cookie. Secure on https. Server re-validates the code at registration. */
  function setRefCookie(code) {
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = "no_ref=" + encodeURIComponent(code) + "; Max-Age=" + (30 * 86400) + "; Path=/; SameSite=Lax" + secure;
  }
  function getRefCookie() {
    var m = document.cookie.match(/(?:^|; )no_ref=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  /* Display dates from backend ISO timestamps, always in Philippine time. */
  function phDate(iso) {
    try { return new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" }); }
    catch (e) { return ""; }
  }

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text) n.textContent = text;
    return n;
  }

  var SOCIAL_ERRORS = {
    not_configured: "That sign-up option is not available yet. Please use an email code instead.",
    cancelled: "Sign-in was cancelled. You can try again or use an email code.",
    failed: "We could not complete that sign-in. Please try again.",
    invalid_state: "That sign-in session expired. Please try again.",
    policies: "Please agree to the policies to create your account.",
    no_account: "We could not find an account for that sign-in. Create your account to start your free trial.",
    email_exists: "An account with that email already exists. Sign in with an email code instead.",
    no_email: "That account did not share an email address, so we cannot create your NegosyoOnline account. Please use another option.",
    disabled: "This account is not active. Please contact support."
  };
  var SOCIAL_ICONS = {
    google: '<svg viewBox="0 0 48 48" width="22" height="22"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg>'
  };
  function socialErrorMessage(code) { return SOCIAL_ERRORS[code] || "We could not complete that sign-in. Please try again."; }

  /* "Continue with Facebook / Google". Only providers the API reports as configured are shown.
     `getQuery` returns the start-URL query string, or null to block the click (it shows its own message).
     Resolves the number of buttons shown. */
  function socialButtons(container, getQuery) {
    return call("GET", "/auth/social/providers/").then(function (res) {
      var list = res.ok && res.data.providers ? res.data.providers : [];
      container.textContent = "";
      list.forEach(function (p) {
        var b = el("button", { type: "button", "class": "btn social-btn" });
        if (SOCIAL_ICONS[p.id]) { var ic = el("span", { "class": "social-ico", "aria-hidden": "true" }); ic.innerHTML = SOCIAL_ICONS[p.id]; b.appendChild(ic); }
        b.appendChild(el("span", {}, "Continue with " + p.label));
        b.addEventListener("click", function () {
          var q = getQuery();
          if (q === null) return;
          b.disabled = true;
          location.assign(cfg.apiBase + "/auth/social/" + encodeURIComponent(p.id) + "/start/?" + q);
        });
        container.appendChild(b);
      });
      return list.length;
    });
  }

  window.NOApi = { socialButtons: socialButtons, socialErrorMessage: socialErrorMessage, call: call, getToken: getToken, setToken: setToken, setRefCookie: setRefCookie, getRefCookie: getRefCookie, phDate: phDate, el: el };
})();
