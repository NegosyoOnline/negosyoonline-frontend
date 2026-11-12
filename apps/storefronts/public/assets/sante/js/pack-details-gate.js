/* Onboarding 3 of 3 (Coach Ed 2026-11-01): the Santé details form is checked in the browser before anything is sent. A wrong or empty field
   stops the submit here with its message under it; the server still decides. The messages and the reserved names come from the server's own
   rules (registration_rules.py) through the json_script block, so the two never drift. A message stays under its field until the field is
   right, and changes if the field is wrong in another way. Runs in the capture phase, ahead of pack-busy.js. */
(function () {
  "use strict";
  var form = document.querySelector("form[data-pp-details]");
  var cfgEl = document.getElementById("pp-details-gate");
  if (!form || !cfgEl) return;
  var cfg = JSON.parse(cfgEl.textContent);
  var month = form.elements.dob_month, day = form.elements.dob_day, year = form.elements.dob_year;
  var u1 = form.elements.desired_username, u2 = form.elements.alternate_username, terms = form.elements.terms;
  var dobBox = form.querySelector(".pp-ob-dob");

  function username(v, requiredMsg) {
    if (!v) return requiredMsg;
    if (v.length < 8 || v.length > 20 || !/^[a-zA-Z0-9]+$/.test(v)) return cfg.user_format;
    if (cfg.reserved.indexOf(v.toLowerCase()) !== -1) return cfg.user_reserved;
    return "";
  }

  function dobMessage() {
    var m = parseInt(month.value, 10), d = parseInt(day.value, 10), y = parseInt(year.value, 10);
    if (!m || !d || !y) return cfg.dob_required;
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return cfg.dob_required;  // no 31 February
    var now = new Date(Date.now() + 8 * 3600 * 1000);  // today in Manila (UTC+8, no daylight saving)
    var ty = now.getUTCFullYear(), tm = now.getUTCMonth() + 1, td = now.getUTCDate();
    if (y > ty || (y === ty && (m > tm || (m === tm && d > td)))) return cfg.dob_future;
    var age = ty - y - ((tm < m || (tm === m && td < d)) ? 1 : 0);
    return age < 18 ? cfg.dob_minor : "";
  }

  function secondMessage() {
    var v = u2.value.trim(), first = u1.value.trim();
    var m = username(v, cfg.alt_required);
    if (m) return m;
    return first && v.toLowerCase() === first.toLowerCase() ? cfg.alt_duplicate : "";
  }

  // Each rule: the fields that feed it, the box the message lives in, and what it says.
  var rules = [
    {fields: [month, day, year], box: dobBox, kind: "dob", say: dobMessage},
    {fields: [u1], box: u1.closest(".fld"), kind: "fld", say: function () { return username(u1.value.trim(), cfg.user_required); }},
    {fields: [u2, u1], box: u2.closest(".fld"), kind: "fld", say: secondMessage},
    {fields: [terms], box: terms.closest("label"), kind: "terms", say: function () { return terms.checked ? "" : cfg.terms; }}
  ];

  function errOf(r) {
    return r.kind === "terms" ? (r.box.nextElementSibling && r.box.nextElementSibling.classList.contains("err") ? r.box.nextElementSibling : null)
                              : r.box.querySelector("p.err");
  }

  function clear(r) {
    var err = errOf(r);
    if (err) err.remove();
    if (r.kind === "dob") r.box.classList.remove("is-invalid");
    if (r.kind === "fld") {
      r.fields[0].classList.remove("bad");
      var hint = r.box.querySelector("p.hint[hidden]");
      if (hint) hint.hidden = false;
    }
  }

  function flag(r, message) {
    var err = errOf(r);
    if (!err) {
      err = document.createElement("p");
      err.className = "err" + (r.kind === "terms" ? " pp-ob-terms-err" : "");
      err.setAttribute("role", "alert");
      if (r.kind === "terms") r.box.parentNode.insertBefore(err, r.box.nextSibling); else r.box.appendChild(err);
    }
    err.textContent = message;
    if (r.kind === "dob") r.box.classList.add("is-invalid");
    if (r.kind === "fld") {
      r.fields[0].classList.add("bad");
      var hint = r.box.querySelector("p.hint");
      if (hint) hint.hidden = true;
    }
  }

  // A message already under a field is kept while the field is wrong and cleared once it is right.
  rules.forEach(function (r) {
    r.fields.forEach(function (f) {
      ["input", "change"].forEach(function (t) {
        f.addEventListener(t, function () {
          if (!errOf(r)) return;
          var m = r.say();
          if (m) flag(r, m); else clear(r);
        });
      });
    });
  });

  form.addEventListener("submit", function (ev) {
    var first = null;
    rules.forEach(function (r) {
      var m = r.say();
      if (m) { flag(r, m); if (!first) first = r; } else { clear(r); }
    });
    if (!first) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (first.box.scrollIntoView) first.box.scrollIntoView({behavior: "smooth", block: "center"});
    if (first.kind !== "dob" && first.fields[0].focus) { try { first.fields[0].focus({preventScroll: true}); } catch (e) {} }
  }, true);
})();
