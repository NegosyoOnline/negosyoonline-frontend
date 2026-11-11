/* Onboarding and Completed (Coach Ed 2026-11-01): every sent form, from the mobile code to the dashboard button, turns its own button busy
   (a spinner in the button, no loading card over the page) and holds for at least HOLD_MS before the form goes to the server, so the buyer
   sees that their input is being processed (the next step used to appear too fast to read). */
(function () {
  "use strict";
  var HOLD_MS = 2000;       // how long the button shows its working state before the form is sent
  var GIVE_UP_MS = 45000;   // never leave a buyer behind a button that does not come back
  var timer = null, holdTimer = null, locked = null;

  function reset() {
    clearTimeout(timer);
    clearTimeout(holdTimer);
    if (locked) {
      locked.form.removeAttribute("data-pp-sending");
      locked.form.removeAttribute("data-pp-go");
      if (locked.button) {
        locked.button.removeAttribute("aria-busy");
        var spin = locked.button.querySelector(".pp-spin");
        if (spin && spin.parentNode) spin.parentNode.removeChild(spin);
        if (locked.html !== null) { locked.button.innerHTML = locked.html; locked.button.disabled = false; }  // a labelled button comes back as it was
      }
    }
    locked = null;
  }

  function send(form) {
    form.setAttribute("data-pp-go", "");  // the second submit goes straight through
    if (form.requestSubmit) form.requestSubmit(); else form.submit();
  }

  function busy(form, button) {
    form.setAttribute("data-pp-sending", "");
    locked = { form: form, button: button, html: null };
    if (button) {
      var label = button.getAttribute("data-pp-busy-label");  // sign-in: the button also reads "Verifying…" and is disabled while it holds
      if (label) { locked.html = button.innerHTML; button.textContent = label; button.disabled = true; }
      button.setAttribute("aria-busy", "true");
      var spin = document.createElement("span");
      spin.className = "pp-spin";
      spin.setAttribute("aria-hidden", "true");
      button.insertBefore(spin, button.firstChild);
    }
    holdTimer = setTimeout(function () { send(form); }, HOLD_MS);
    timer = setTimeout(reset, GIVE_UP_MS);
  }

  document.querySelectorAll(".pp-next form, form[data-pp-busy-msg]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      if (e.defaultPrevented) return;  // a refused code box or a failed check keeps the page as it is
      if (form.hasAttribute("data-pp-go")) return;  // the held form, now on its way
      e.preventDefault();
      if (form.hasAttribute("data-pp-sending")) return;
      busy(form, e.submitter || form.querySelector('button[type="submit"], button:not([type])'));
    });
  });

  window.addEventListener("pageshow", function (e) { if (e.persisted) reset(); });  // the Back button restores the page as it was left
})();
