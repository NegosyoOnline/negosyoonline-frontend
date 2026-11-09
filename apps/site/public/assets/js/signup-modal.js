/* "Start Free Trial" (/?signup=1) opens the sign-up form in a popup. It is the only sign-up surface. */
(function () {
  var dlg = null, loading = false, wanted = "signup";

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src + "?m=" + Date.now(); s.onload = resolve; s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  function build() {
    dlg = document.createElement("dialog");
    dlg.className = "signup-modal";
    dlg.setAttribute("aria-label", "Start your free trial");
    var close = document.createElement("button");
    close.type = "button"; close.className = "signup-modal-close"; close.setAttribute("aria-label", "Close");
    close.innerHTML = "&times;";
    close.addEventListener("click", function () { dlg.close(); });
    dlg.appendChild(close);
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", function () { document.documentElement.classList.remove("signup-open"); });
    document.body.appendChild(dlg);
  }

  function open(mode) {
    wanted = mode === "signin" ? "signin" : "signup";
    if (dlg) { if (window.NOSignup) window.NOSignup.setMode(wanted); show(); return; }
    if (loading) return;
    loading = true;
    fetch("/assets/partials/signup.html?m=" + Date.now(), { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("status " + r.status); return r.text(); })
      .then(function (html) {
        var card = new DOMParser().parseFromString(html, "text/html").querySelector(".form-card");
        if (!card) throw new Error("no form");
        build();
        dlg.appendChild(card);
        return loadScript("/assets/js/api.js").then(function () { return loadScript("/assets/js/start.js"); })
      .then(function () { if (window.NOSignup) window.NOSignup.setMode(wanted, true); });
      })
      .then(show)
      .catch(function () { location.assign("/contact"); })
      .then(function () { loading = false; });
  }

  function show() {
    document.documentElement.classList.add("signup-open");
    if (!dlg.open) dlg.showModal();
    var first = dlg.querySelector("#step1:not([hidden]) #email");
    if (first) first.focus();  /* otherwise the close button gets the focus ring */
  }

  document.addEventListener("click", function (ev) {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target.closest ? ev.target.closest('a[href="/?signup=1"], a[href="/?signin=1"]') : null;
    if (!a || typeof HTMLDialogElement === "undefined") return;
    ev.preventDefault();
    open(a.getAttribute("href") === "/?signin=1" ? "signin" : "signup");
  });

  /* Only ?signup=1 (Start Free Trial, failed social sign-up) opens the popup; the flag is dropped, ref stays for start.js. */
  var params = new URLSearchParams(location.search);
  var ref = (params.get("ref") || "").trim();
  if (ref && ref.length <= 32) {
    /* A referral link does not open the popup. Remember a valid code (30 days) so it survives browsing before the visitor signs up. */
    loadScript("/assets/js/api.js").then(function () {
      return window.NOApi.call("GET", "/referrals/" + encodeURIComponent(ref) + "/").then(function (res) {
        if (res.ok && res.data.valid) window.NOApi.setRefCookie(ref);
      });
    }).catch(function () { /* the popup reads ?ref= again when it opens */ });
  }
  if ((params.get("signup") || params.get("signin")) && typeof HTMLDialogElement !== "undefined") {
    open(params.get("signin") ? "signin" : "signup");
    params.delete("signup"); params.delete("signin");
    var qs = params.toString();
    try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } catch (e) { /* ignore */ }
  }
})();
