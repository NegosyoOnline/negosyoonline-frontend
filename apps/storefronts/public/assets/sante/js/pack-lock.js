/* The rejection dialog on the member Home (TWCinc _pack_panel.html, whose script was inline; the policy allows none).
   The dialog is server-rendered open, so it shows without JavaScript; this closes it and reopens it as a modal (showModal on
   an open dialog throws) and cancels Escape. There is no close control. The send button turns busy on submit. The transfer
   time field opens its picker on click. */
(function () {
  var dlg = document.getElementById("pk-lock");
  if (!dlg || typeof dlg.showModal !== "function") { return; }
  dlg.close();
  dlg.showModal();
  dlg.addEventListener("cancel", function (e) { e.preventDefault(); });
  var f = document.getElementById("pk-resubmit"), b = document.getElementById("pk-send");
  if (f && b) {
    f.addEventListener("submit", function () {
      b.setAttribute("aria-busy", "true");
      b.textContent = "Sending…";
      setTimeout(function () { b.disabled = true; }, 0);
    });
  }
  var pickers = dlg.querySelectorAll("[data-pk-picker]");
  Array.prototype.forEach.call(pickers, function (el) {
    el.addEventListener("click", function () { try { el.showPicker(); } catch { /* not supported */ } });
  });
})();
