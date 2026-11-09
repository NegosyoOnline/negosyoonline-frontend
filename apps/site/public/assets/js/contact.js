/* Contact form: posts to POST /v1/contact/. Field errors are shown inline and in a summary. */
(function () {
  var cfg = window.NO_CONFIG || {};
  var form = document.getElementById("contact-form");
  var status = document.getElementById("form-status");
  var btn = document.getElementById("submit-btn");
  if (!form) return;

  var LABELS = {
    full_name: "Full name", business_email: "Business email", mobile: "Mobile number",
    business_name: "Business name", message: "Message", consent: "Privacy Policy consent"
  };

  function clearErrors() {
    status.textContent = "";
    Object.keys(LABELS).forEach(function (k) {
      var e = document.getElementById(k + "-err");
      if (e) { e.hidden = true; e.textContent = ""; }
      var el = document.getElementById(k);
      if (el) {
        el.removeAttribute("aria-invalid"); el.removeAttribute("aria-describedby");
        if (el.closest(".field")) el.closest(".field").classList.remove("invalid");
      }
    });
  }

  function showErrors(fields, message) {
    var keys = Object.keys(fields || {}).filter(function (k) { return LABELS[k]; });
    var box = document.createElement("div");
    box.className = "error-summary";
    box.setAttribute("role", "alert");
    var h = document.createElement("h2");
    h.textContent = message || "Please correct the highlighted fields.";
    box.appendChild(h);
    if (keys.length) {
      var ul = document.createElement("ul");
      keys.forEach(function (k) {
        var li = document.createElement("li"), a = document.createElement("a");
        a.href = "#" + k; a.textContent = LABELS[k] + ": " + fields[k];
        li.appendChild(a); ul.appendChild(li);
        var e = document.getElementById(k + "-err"), el = document.getElementById(k);
        if (e) { e.textContent = fields[k]; e.hidden = false; }
        if (el) {
          el.setAttribute("aria-invalid", "true"); el.setAttribute("aria-describedby", k + "-err");
          if (el.closest(".field")) el.closest(".field").classList.add("invalid");
        }
      });
      box.appendChild(ul);
    }
    status.textContent = ""; status.appendChild(box); status.focus();
  }

  /* Mobile: the +63 is fixed in the field. Keep the 10 digits after it, drop a leading 0 or 63, show as 9XX XXX XXXX. */
  function mobileDigits(v) {
    var d = String(v || "").replace(/\D/g, "");
    if (d.indexOf("63") === 0) d = d.slice(2);
    if (d.charAt(0) === "0") d = d.slice(1);
    return d.slice(0, 10);
  }
  form.mobile.addEventListener("input", function () {
    var d = mobileDigits(form.mobile.value);
    form.mobile.value = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(" ");
    var ok = /^9\d{9}$/.test(d);
    form.mobile.parentNode.classList.toggle("is-valid", ok);
    form.mobile.parentNode.classList.toggle("is-invalid", d !== "" && !ok && (mobileTouched || d.charAt(0) !== "9"));
  });
  var mobileTouched = false;
  form.mobile.addEventListener("blur", function () { mobileTouched = true; form.mobile.dispatchEvent(new Event("input")); });

  /* Blue check when valid; red when a filled field is not (after leaving it). Business name is optional: check only. */
  var TEXT_CHECKS = {
    full_name: { ok: function (v) { return v.trim().length >= 2; }, red: true },
    business_name: { ok: function (v) { return v.trim().length >= 2; }, red: false },
    business_email: { ok: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }, red: true }
  };
  Object.keys(TEXT_CHECKS).forEach(function (name) {
    var el = form[name], rule = TEXT_CHECKS[name], touched = false;
    var run = function () {
      var ok = rule.ok(el.value), filled = el.value.trim() !== "";
      el.parentNode.classList.toggle("is-valid", ok);
      el.parentNode.classList.toggle("is-invalid", rule.red && filled && !ok && touched);
    };
    el.addEventListener("input", run); el.addEventListener("change", run);
    el.addEventListener("blur", function () { touched = true; run(); });
    setTimeout(run, 400);  /* catches browser autofill */
  });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    clearErrors();
    var mobile = mobileDigits(form.mobile.value);
    var body = {
      full_name: form.full_name.value, business_email: form.business_email.value,
      mobile: mobile ? "+63" + mobile : "", business_name: form.business_name.value,
      message: form.message.value, consent: form.consent.checked, website: form.website.value
    };
    /* Quick checks for a faster response; the server validates everything again. */
    var local = {};
    if (!body.full_name.trim()) local.full_name = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.business_email.trim())) local.business_email = "Enter a valid email address.";
    if (!/^9\d{9}$/.test(mobile)) local.mobile = "Enter a valid Philippine mobile number, for example 917 309 8619.";
    if (!body.message.trim()) local.message = "Enter your message.";
    if (!body.consent) local.consent = "You must agree to the Privacy Policy to send an inquiry.";
    if (Object.keys(local).length) { showErrors(local, "Please correct the highlighted fields."); return; }
    btn.disabled = true; btn.textContent = "Sending...";
    fetch(cfg.apiBase + "/contact/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok, status: r.status, data: data }; });
    }).then(function (res) {
      if (res.ok) {
        form.reset();
        var s = document.createElement("div");
        s.className = "success"; s.setAttribute("role", "status");
        s.textContent = "Thank you. Your inquiry has been received.";
        status.textContent = ""; status.appendChild(s); status.focus();
      } else if (res.status === 429) {
        showErrors({}, "Too many messages sent. Please try again later.");
      } else {
        showErrors(res.data.fields, res.data.message || "We could not send your message. Please try again.");
      }
    }).catch(function () {
      showErrors({}, "We could not reach the server. Please check your connection and try again.");
    }).then(function () {
      btn.disabled = false; btn.textContent = "Send Inquiry";
    });
  });
})();
