/* The member Home's Copy button for the courier tracking number (this storefront's own file; the policy allows no inline script).
   The button is hidden in the markup and shown only where the browser can copy, so a browser without clipboard access shows the number to copy by hand. */
(function () {
  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  var canModern = !!(navigator.clipboard && navigator.clipboard.writeText);
  var canLegacy = !!(document.queryCommandSupported && document.queryCommandSupported("copy"));
  if (!canModern && !canLegacy) { return; }
  document.querySelectorAll("[data-mh-copy]").forEach(function (btn) {
    btn.hidden = false;
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-mh-copy") || "";
      function done(ok) {
        btn.textContent = ok ? "Copied" : "Copy failed";
        setTimeout(function () { btn.textContent = "Copy"; }, 1800);
      }
      if (canModern) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(legacyCopy(text)); });
      } else {
        done(legacyCopy(text));
      }
    });
  });
})();
