/* What the three Training pages share (ClickUp z8uq9mezdj): the first message of a field refusal, the confirm dialog, moving an
   item one place in a list, and the picture size check. A page loads this after finance-common.js. The pages decide nothing:
   the backend does, and they follow its answer. */
(function () {
  var F = window.NOFin, $ = function (id) { return document.getElementById(id); };
  var LOST = "That did not go through. Check the page before trying again.";
  var MAX_PICTURE = 2 * 1024 * 1024;

  /* The first message under a field's refusal, or "". */
  function first(fields, key) {
    var v = fields && fields[key];
    return Array.isArray(v) && typeof v[0] === "string" ? v[0] : typeof v === "string" ? v : "";
  }
  /* Shows or clears one field's message and marks the field. */
  function mark(input, errId, text) {
    F.say(errId, text);
    if (!input) return;
    if (text) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
  }
  /* Writes the backend's field messages for a list of [key, input id, message id]; returns how many were shown. */
  function showFields(fields, list) {
    var n = 0;
    list.forEach(function (f) {
      var m = first(fields, f[0]);
      mark($(f[1]), f[2], m);
      if (m) n++;
    });
    return n;
  }
  /* The list's ids with `id` moved one place up (-1) or down (1), or null when it cannot move. */
  function moved(ids, id, step) {
    var at = ids.indexOf(id), to = at + step, out;
    if (at < 0 || to < 0 || to >= ids.length) return null;
    out = ids.slice();
    out.splice(at, 1);
    out.splice(to, 0, id);
    return out;
  }
  /* A whole number from low to high typed as digits, or null. */
  function whole(text, low, high) {
    var t = String(text == null ? "" : text).trim(), n;
    if (!/^\d{1,9}$/.test(t)) return null;
    n = Number(t);
    return n >= low && n <= high ? n : null;
  }
  /* The picture a file input holds, or a message why not: {file} or {error}. The backend checks the picture again. */
  function picture(input) {
    var f = input && input.files && input.files[0];
    if (!f) return { error: "Choose a picture first." };
    if (typeof f.size === "number" && f.size > MAX_PICTURE) return { error: "The picture is larger than 2 MB." };
    if (f.type && ["image/jpeg", "image/png", "image/webp"].indexOf(f.type) < 0) return { error: "Use a JPEG, PNG or WebP picture." };
    return { file: f };
  }

  /* The confirm dialog (m-confirm): ask(opener, title, sub, go, run). run() resolves true when the dialog may close. */
  function confirmer(dlg) {
    var busy = false, pending = null;
    function lock(on) {
      busy = on;
      ["confirm-go", "confirm-x", "confirm-cancel"].forEach(function (id) { $(id).disabled = on; });
    }
    ["confirm-x", "confirm-cancel"].forEach(function (id) {
      $(id).addEventListener("click", function () { if (!busy) { pending = null; dlg.close(true); } });
    });
    $("confirm-go").addEventListener("click", function () {
      if (busy || !pending) return;
      lock(true);
      pending().then(function (done) {
        lock(false);
        if (done) { pending = null; dlg.close(false); }
      });
    });
    return {
      busy: function () { return busy; },
      ask: function (opener, title, sub, go, run) {
        $("m-confirm-h").textContent = title;
        $("m-confirm-sub").textContent = sub;
        $("confirm-go").textContent = go;
        F.say("confirm-err", "");
        pending = run;
        dlg.open("m-confirm", opener, $("confirm-cancel"));
      }
    };
  }

  window.NOTrain = { first: first, mark: mark, showFields: showFields, moved: moved, whole: whole, picture: picture, confirmer: confirmer, LOST: LOST };
})();
