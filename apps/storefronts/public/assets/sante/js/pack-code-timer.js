/* Sign-in code step (Coach Ed 2026-11-01): the button of the channel the current code went by stays disabled while its countdown runs
   (anti-spam), the seconds shown inside the button; at zero it opens so the code can be sent again. */
(function () {
  "use strict";
  document.querySelectorAll("button[data-pp-count]").forEach(function (btn) {
    var left = parseInt(btn.getAttribute("data-pp-count"), 10) || 0;
    var label = btn.querySelector("[data-pp-count-label]");
    if (left <= 0) return;
    var t = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(t);
        btn.disabled = false;
        btn.removeAttribute("data-pp-count");
        if (label) label.textContent = "";
        return;
      }
      if (label) label.textContent = " (" + left + "s)";
    }, 1000);
  });
})();
