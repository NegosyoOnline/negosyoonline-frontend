/* Onboarding verify, as in the merchant Santé OTP modal: six boxes fill the form's hidden `code`; typing moves on, Backspace moves back,
   a pasted code spreads across the boxes and submits at six digits; "Resend OTP (Ns)" stays disabled until its countdown ends. */
(function () {
  "use strict";
  document.querySelectorAll("form[data-pp-otp]").forEach(function (form) {
    var boxes = Array.prototype.slice.call(form.querySelectorAll(".otp-box"));
    var hidden = form.querySelector('input[name="code"]');
    if (!boxes.length || !hidden || boxes[0].disabled) return;
    function sync() { hidden.value = boxes.map(function (b) { return b.value; }).join(""); return hidden.value; }
    function fill(from, digits) {
      for (var i = 0; i < digits.length && from + i < boxes.length; i++) boxes[from + i].value = digits.charAt(i);
      if (sync().length === boxes.length) { if (form.requestSubmit) form.requestSubmit(); else form.submit(); return; }  // requestSubmit runs the submit handlers, so the busy state shows
      boxes[Math.min(from + digits.length, boxes.length - 1)].focus();
    }
    boxes.forEach(function (box, i) {
      box.addEventListener("input", function () {
        var digits = box.value.replace(/\D/g, "");
        box.value = "";
        if (digits) fill(i, digits); else sync();
      });
      box.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !box.value && i > 0) { boxes[i - 1].value = ""; boxes[i - 1].focus(); sync(); }
      });
      box.addEventListener("paste", function (e) {
        var text = ((e.clipboardData || window.clipboardData).getData("text") || "").replace(/\D/g, "");
        if (!text) return;
        e.preventDefault();
        fill(i, text);
      });
    });
    form.addEventListener("submit", function (e) { if (sync().length !== boxes.length) { e.preventDefault(); boxes[0].focus(); } });
    boxes[0].focus();
  });
  document.querySelectorAll("form[data-pp-resend]").forEach(function (form) {
    var remaining = parseInt(form.getAttribute("data-pp-resend"), 10) || 0;
    var btn = form.querySelector(".otp-resend-btn"), timer = form.querySelector("[data-pp-resend-timer]");
    if (!btn || remaining <= 0) return;
    var t = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) { clearInterval(t); btn.disabled = false; timer.textContent = ""; return; }
      timer.textContent = "(" + remaining + "s)";
    }, 1000);
  });
})();
