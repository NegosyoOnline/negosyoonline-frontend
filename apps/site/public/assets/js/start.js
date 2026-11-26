/* The Start Free Trial popup: email, then the 6-digit code we mail, then the dashboard.
   Google goes straight through the provider. Name and mobile are completed later in the dashboard.
   Account creation and every state decision is server-side. */
(function () {
  var cfg = window.NO_CONFIG || {}, A = window.NOApi;
  var $ = function (id) { return document.getElementById(id); };
  var status = $("status");
  var validRef = "", email = "", cooldown = null, mode = "signup";
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function clearErrors() {
    status.textContent = "";
    ["email-err", "accept-err", "code-err"].forEach(function (id) { var e = $(id); e.hidden = true; e.textContent = ""; });
    document.querySelectorAll(".field.invalid").forEach(function (f) { f.classList.remove("invalid"); });
    emailInvalid(false);
  }
  function fieldError(id, msg) { var e = $(id); e.textContent = msg; e.hidden = false; }
  /* The email box's error state: the red border, aria-invalid and the link to #email-err, all set and removed together. */
  function emailInvalid(on) {
    var input = $("email");
    input.parentNode.classList.toggle("is-invalid", on);
    if (on) { input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", "email-err"); }
    else { input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby"); }
  }
  function showBanner(message) {
    clearErrors();
    var box = A.el("div", { "class": "error-summary", role: "alert" });
    box.appendChild(A.el("h2", {}, message));
    status.appendChild(box); status.focus();
  }

  function show(step) {
    ["step1", "code"].forEach(function (id) { $(id).hidden = id !== step; });
    var h = $(step).querySelector("h1"); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }
  }

  /* ---------- referral ---------- */
  function initReferral() {
    var param = new URLSearchParams(location.search).get("ref");
    var code = (param || A.getRefCookie() || "").trim();
    if (!code || code.length > 32) return;
    A.call("GET", "/referrals/" + encodeURIComponent(code) + "/").then(function (res) {
      if (res.ok && res.data.valid) {
        validRef = code;
        if (param) A.setRefCookie(code);  /* only a validated code is saved; 30 days */
        $("ref-banner").textContent = "Referred by: " + res.data.referrer_first_name;
        $("ref-banner").hidden = false;
      }
    });
  }

  /* ---------- step 1: email ---------- */
  /* Continuing is the agreement (the notice under the button). The server records its own policy list and
     version when the code is verified with accept_policies. */
  $("email").addEventListener("input", function () {
    $("email-err").hidden = true; emailInvalid(false);
    this.parentNode.classList.toggle("is-valid", EMAIL_RE.test(this.value.trim()));
  });

  function sendCode(btn, label, done) {
    btn.disabled = true; btn.textContent = "Sending...";
    A.call("POST", "/auth/email-code/request/", { email: email }).then(function (res) {
      btn.disabled = false; btn.textContent = label;
      if (res.ok) { clearErrors(); done(); return; }
      var f = res.data.fields || {};
      if (f.email) { fieldError("email-err", f.email); emailInvalid(true); show("step1"); }
      else showBanner(res.status === 429 ? "Too many attempts. Please try again in a few minutes." : (res.data.message || "We could not send the code. Please try again."));
    });
  }

  $("form1").addEventListener("submit", function (e) {
    e.preventDefault();
    clearErrors();
    email = $("email").value.trim();
    if (!EMAIL_RE.test(email)) { fieldError("email-err", "Enter a valid email address."); emailInvalid(true); $("email").focus(); return; }
    sendCode($("btn1"), "Continue", showCode);
  });

  /* ---------- step 2: the code ---------- */
  var boxes = Array.prototype.slice.call(document.querySelectorAll("#otp input"));
  function codeValue() { return boxes.map(function (b) { return b.value; }).join(""); }
  function resetBoxes() { boxes.forEach(function (b) { b.value = ""; b.removeAttribute("aria-invalid"); }); }
  /* The API refuses a second code inside 60 seconds, so the resend button waits that long. */
  function startCooldown() {
    var btn = $("code-resend"), wait = $("code-wait"), count = $("code-count"), left = 60;
    clearInterval(cooldown);
    btn.hidden = true; wait.hidden = false; count.textContent = "1:00";
    cooldown = setInterval(function () {
      left -= 1;
      if (left <= 0) { clearInterval(cooldown); wait.hidden = true; btn.hidden = false; }
      else count.textContent = "0:" + (left < 10 ? "0" : "") + left;
    }, 1000);
  }
  function showCode() {
    $("code-email").textContent = email;
    $("code-msg").textContent = "";
    resetBoxes(); show("code"); boxes[0].focus(); startCooldown();
  }
  /* The validated referral code is sent on sign-up only; the server records it once, at account creation. */
  function verifyBody(code) {
    var body = { email: email, code: code, accept_policies: mode === "signup" };
    if (mode === "signup" && validRef) body.referral_code = validRef;
    return body;
  }
  function submitCode() {
    var code = codeValue();
    if (code.length !== 6) { fieldError("code-err", "Enter all 6 digits of the code."); return; }
    boxes.forEach(function (b) { b.disabled = true; });
    $("code-err").hidden = true;
    A.call("POST", "/auth/email-code/verify/", verifyBody(code), false, true).then(function (res) {
      if (res.ok) {
        $("code-msg").textContent = res.data.created ? "Your account is ready. Opening your dashboard..." : "Welcome back. Opening your dashboard...";
        location.assign(cfg.dashUrl + "/");
        return;
      }
      boxes.forEach(function (b) { b.disabled = false; b.setAttribute("aria-invalid", "true"); });
      fieldError("code-err", res.status === 429 ? "Too many attempts. Please try again in a few minutes." :
        res.data.code === "policies_required" ? "We could not find an account for that email. Start your free trial to create one." :
        (res.data.message || "That code did not work. Please try again."));
      resetBoxes(); boxes.forEach(function (b) { b.setAttribute("aria-invalid", "true"); }); boxes[0].focus();
    });
  }
  boxes.forEach(function (box, i) {
    box.addEventListener("input", function () {
      box.value = box.value.replace(/\D/g, "").slice(-1);
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      if (codeValue().length === 6) submitCode();
    });
    box.addEventListener("keydown", function (ev) {
      if (ev.key === "Backspace" && !box.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ""; }
      else if (ev.key === "ArrowLeft" && i > 0) boxes[i - 1].focus();
      else if (ev.key === "ArrowRight" && i < boxes.length - 1) boxes[i + 1].focus();
    });
    box.addEventListener("paste", function (ev) {
      var text = ((ev.clipboardData || window.clipboardData).getData("text") || "").replace(/\D/g, "").slice(0, 6);
      if (!text) return;
      ev.preventDefault();
      text.split("").forEach(function (d, k) { boxes[k].value = d; });
      boxes[Math.min(text.length, 5)].focus();
      if (text.length === 6) submitCode();
    });
  });
  $("code-verify").addEventListener("click", submitCode);
  $("code-resend").addEventListener("click", function () {
    var btn = this;
    sendCode(btn, "Resend the code", function () { $("code-msg").textContent = "A new code is on its way."; resetBoxes(); boxes[0].focus(); startCooldown(); });
  });
  $("code-back").addEventListener("click", function () { clearInterval(cooldown); clearErrors(); show("step1"); $("email").focus(); });

  /* ---------- social sign-up ---------- */
  A.socialButtons($("social-btns"), function () { return mode; }, function () { return validRef; }).then(function (n) {
    $("social-signup").hidden = !n;
    if (!n) return;  /* no provider configured: the email form stays open */
    $("form1").hidden = true;
    $("show-email").hidden = false;
  });
  /* "Register using email" swaps the provider buttons for the email form; the link below swaps them back. */
  function emailMode(on) {
    $("social-signup").hidden = on;
    $("show-email").hidden = on;
    $("form1").hidden = !on;
    $("show-social").hidden = !on;
    $("show-email").setAttribute("aria-expanded", on ? "true" : "false");
    clearErrors();
    if (on) {
      var names = Array.prototype.map.call(document.querySelectorAll("#social-btns .social-btn span:last-child"), function (s) { return s.textContent.replace("Continue with ", ""); });
      $("show-social").textContent = (mode === "signin" ? "Sign in using " : "Sign up using ") + names.join(" or ");
      $("email").focus();
    }
  }
  $("show-email").addEventListener("click", function () { emailMode(true); });
  $("show-social").addEventListener("click", function () { emailMode(false); });


  /* The same popup serves "Start Free Trial" (signup) and "Login" (signin); only the copy and the request differ. */
  function setMode(m, keepErrors) {
    mode = m === "signin" ? "signin" : "signup";
    var signin = mode === "signin";
    $("h-step1").textContent = signin ? "Welcome back" : "Create your account";
    $("sub1").innerHTML = signin ? "Sign in to your NegosyoOnline dashboard." :
      'Start your 14-day free trial.<br class="br-sm"> No credit card needed. <span class="trial-price">' + (((window.NO_CONFIG || {}).ANNUAL_PLAN_ENABLED === true) ? '&#8369;2,499 a month or &#8369;24,990 a year after the trial.' : '&#8369;2,499 per month after the trial.') + '</span>';
    $("agree").hidden = signin;
    $("show-email").textContent = signin ? "Sign in using email" : "Register using email";
    $("switch-mode-text").textContent = signin ? "New to NegosyoOnline?" : "Already have an account?";
    $("switch-mode").textContent = signin ? "Start your free trial" : "Sign in";
    $("ref-banner").style.display = signin ? "none" : "";
    clearInterval(cooldown); if (!keepErrors) clearErrors(); show("step1");
    if (!$("show-social").hidden) emailMode(true);
  }
  $("switch-mode").addEventListener("click", function () { setMode(mode === "signin" ? "signup" : "signin"); });
  window.NOSignup = { setMode: setMode };

  initReferral();
  var socialError = new URLSearchParams(location.search).get("error");
  if (socialError) { /* a Google sign-in that ended in an error lands back here as /?signin=1&error=<code> */
    try { history.replaceState(null, "", location.pathname); } catch (e) { /* ignore */ }
    showBanner(A.socialErrorMessage(socialError));
  }
})();
