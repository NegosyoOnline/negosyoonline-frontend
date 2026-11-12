/* The approved +63 mobile box (as the delivery address and checkout): the local part after a fixed +63 prefix, digits only, at most ten,
   shown 9XX XXX XXXX as the buyer types or pastes. A pasted +63 / 63 prefix or a leading 0 is dropped and the caret stays in place. The
   server reads the number and stores E.164. Bind any input[data-pp-phone]. */
(function () {
  "use strict";
  function digits(raw) {
    var d = (raw || "").replace(/\D/g, "");
    if (d.slice(0, 3) === "639") d = d.slice(2);
    else if (d.charAt(0) === "0") d = d.slice(1);
    return d.slice(0, 10);
  }
  function format(raw) {
    var d = digits(raw);
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(" ");
  }
  document.querySelectorAll("input[data-pp-phone]").forEach(function (input) {
    input.addEventListener("input", function () {
      var caret = input.selectionStart == null ? input.value.length : input.selectionStart;
      var before = digits(input.value.slice(0, caret)).length;
      var formatted = format(input.value);
      if (formatted === input.value) return;
      input.value = formatted;
      var pos = 0, seen = 0;
      while (pos < formatted.length && seen < before) {
        if (/\d/.test(formatted.charAt(pos))) seen++;
        pos++;
      }
      if (document.activeElement === input) input.setSelectionRange(pos, pos);
    });
    if (input.value) input.value = format(input.value);
  });
})();
