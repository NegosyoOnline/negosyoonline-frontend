/* What the Finance pages after Payments share (Billing HQ-F1, ClickUp z8uq9mektc; plan decision D5). These
   helpers are COPIED from finance.js, which this change does not touch, so the two files can be made one
   later. Dates differ on purpose: the approved mockup writes "Oct 31, 2026" and "Nov 4, 2026, 9:30 AM", so
   day, dayOf and stamp are this file's own and hq.js's `when` is not used. The page decides nothing about
   access: the backend does, and a page follows its answer. A page loads this after hq.js and shell.js. */
(function () {
  var H = window.NOHq;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var GB_BYTES = 1000000000;      /* decimal gigabytes, as the backend counts them (plan.GB_BYTES) */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.setAttribute("class", cls);
    if (text != null) n.textContent = text;
    return n;
  }
  function say(id, text) {
    var n = document.getElementById(id);
    n.textContent = text || "";
    n.hidden = !text;
  }
  /* "PHP 4,999.00" from whole centavos, or "" for anything else. */
  function money(c) {
    if (typeof c !== "number" || !isFinite(c) || c < 0 || c % 1 !== 0) return "";
    var cents = String(c % 100);
    return "PHP " + String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + (cents.length < 2 ? "0" : "") + cents;
  }
  /* What was typed, in whole centavos, read as text and never through a decimal number. Pesos with at
     most two decimals; commas only where thousands are. Anything else, and zero, is null. */
  function centavos(typed) {
    var m = /^(\d{1,9}|\d{1,3}(?:,\d{3}){1,2})(?:\.(\d{1,2}))?$/.exec(String(typed == null ? "" : typed).trim());
    if (!m) return null;
    var value = Number(m[1].replace(/,/g, "")) * 100 + Number(((m[2] || "") + "00").slice(0, 2));
    return value > 0 ? value : null;
  }
  /* "Oct 31, 2026" from a date with no time (YYYY-MM-DD), or "" when it is not a real date. */
  function day(date) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
    return m && MONTHS[Number(m[2]) - 1] && Number(m[3]) >= 1 && Number(m[3]) <= 31
      ? MONTHS[Number(m[2]) - 1] + " " + Number(m[3]) + ", " + m[1] : "";
  }
  /* The Manila day, month, year and time of an instant, as numbers and text, or null. */
  function manila(iso) {
    var d = new Date(iso), p = {};
    if (!iso || isNaN(d.getTime())) return null;
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p;
  }
  /* "Oct 31, 2026": the Manila date of a time. */
  function dayOf(iso) {
    var p = manila(iso);
    return p ? p.month + " " + p.day + ", " + p.year : "";
  }
  /* "Nov 4, 2026, 9:30 AM": the Manila date and time of a time. */
  function stamp(iso) {
    var p = manila(iso);
    return p ? p.month + " " + p.day + ", " + p.year + ", " + p.hour + ":" + p.minute + " " + p.dayPeriod : "";
  }
  function waited(iso) {
    var ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms) || ms < 0) return "";
    var n = ms < 3600000 ? [Math.max(1, Math.floor(ms / 60000)), "minute"] : ms < 86400000 ? [Math.floor(ms / 3600000), "hour"]
      : [Math.floor(ms / 86400000), "day"];
    return n[0] + " " + n[1] + (n[0] === 1 ? "" : "s");
  }
  /* "12.40 GB" from whole bytes (decimal, two decimals), or "" for anything else. */
  function gb(bytes) {
    if (typeof bytes !== "number" || !isFinite(bytes) || bytes < 0) return "";
    return (bytes / GB_BYTES).toFixed(2) + " GB";
  }
  function words(map, key) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : ""; }
  function inside(box, n) { for (; n; n = n.parentNode) if (n === box) return true; return false; }

  /* True when the answer sent the person to sign in or to the second step. */
  function left(res) {
    var place = H.placeFor(res);
    if (place === "verify") { location.replace("/verify/"); return true; }
    if (place === "sign-in") { location.replace("/sign-in/"); return true; }
    return false;
  }

  /* The house dropdown (the shared twc-select, as the Subscriber dashboard's payments.js builds it): one box, the
     option panel directly below it, a typing filter, and textContent only. The native select stays the source of
     truth, hidden, so the form code reads its value unchanged. Escape closes the list only, never a dialog.
     describedby: the id of the message that speaks about the field. choices: [[value, words], ...], the first
     one being the empty choice. */
  function combo(select, label, choices, describedby) {
    var wrap = el("div", "fin-combo"), box = el("div", "fin-combo-box"), panel = el("div", "fin-combo-panel"), rows = [], vals = [], active = -1;
    var input = el("input", "fin-combo-input");
    input.setAttribute("type", "text"); input.setAttribute("role", "combobox"); input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false"); input.setAttribute("placeholder", choices[0][1]); input.setAttribute("aria-label", label);
    input.setAttribute("aria-autocomplete", "list"); input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", select.id + "-list");
    if (describedby) input.setAttribute("aria-describedby", describedby);
    panel.setAttribute("id", select.id + "-list"); panel.setAttribute("role", "listbox");
    select.parentNode.insertBefore(wrap, select);
    select.setAttribute("class", "fin-combo-native"); select.setAttribute("aria-hidden", "true");
    wrap.appendChild(select); box.appendChild(input); box.appendChild(el("span", "fin-combo-caret")); wrap.appendChild(box); wrap.appendChild(panel);
    function chosen() { var c = choices.filter(function (x) { return x[0] === select.value && x[0]; })[0]; return c ? c[1] : ""; }
    function isOpen() { return wrap.classList.contains("is-open"); }
    function mark(i) {
      active = i;
      rows.forEach(function (r, n) { r.classList.toggle("is-active", n === i); });
      if (i >= 0) input.setAttribute("aria-activedescendant", rows[i].id); else input.removeAttribute("aria-activedescendant");
    }
    function pick(value) { select.value = value; input.value = chosen(); shut(); }
    function draw(q) {
      panel.textContent = ""; rows = []; vals = [];
      choices.forEach(function (c) {
        if (!c[0] || (q && c[1].toLowerCase().indexOf(q) < 0)) return;
        var row = el("div", "fin-combo-opt" + (c[0] === select.value ? " is-selected" : ""), c[1]);
        row.setAttribute("id", select.id + "-opt-" + rows.length); row.setAttribute("role", "option"); row.setAttribute("aria-selected", String(c[0] === select.value));
        row.addEventListener("click", function () { pick(c[0]); });
        rows.push(row); vals.push(c[0]); panel.appendChild(row);
      });
      if (!rows.length) panel.appendChild(el("div", "fin-combo-opt is-disabled", "No matches"));
      mark(-1);
    }
    /* Fixed, so a dialog's scrolling cannot clip it; opens upward only when there is no room below. */
    function place() {
      var r = box.getBoundingClientRect(), below = window.innerHeight - r.bottom, up = below < 160 && r.top > below;
      panel.style.left = r.left + "px"; panel.style.width = r.width + "px";
      panel.style.maxHeight = Math.max(120, Math.min(320, (up ? r.top : below) - 16)) + "px";
      panel.style.top = up ? "auto" : (r.bottom + 6) + "px";
      panel.style.bottom = up ? (window.innerHeight - r.top + 6) + "px" : "auto";
    }
    function onScroll(e) { if (!inside(panel, e.target)) shut(); }
    function onDoc(e) { if (!inside(wrap, e.target)) shut(); }
    function open() {
      if (isOpen()) return;
      wrap.classList.add("is-open"); input.setAttribute("aria-expanded", "true");
      draw(""); place();
      window.addEventListener("resize", place); document.addEventListener("scroll", onScroll, true); document.addEventListener("click", onDoc);
    }
    function shut() {
      wrap.classList.remove("is-open"); input.setAttribute("aria-expanded", "false"); input.value = chosen(); mark(-1);
      window.removeEventListener("resize", place); document.removeEventListener("scroll", onScroll, true); document.removeEventListener("click", onDoc);
    }
    box.addEventListener("click", function () { open(); input.focus(); });
    select.addEventListener("focus", function () { input.focus(); });
    input.addEventListener("focus", function () { if (input.select) input.select(); });
    input.addEventListener("input", function () { open(); draw(String(input.value).trim().toLowerCase()); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Tab") { shut(); return; }
      if (e.key === "Escape" && isOpen()) { e.preventDefault(); e.stopPropagation(); shut(); return; } /* the dialog stays open */
      if (e.key === "Enter") { e.preventDefault(); if (active >= 0) pick(vals[active]); else open(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      if (!isOpen()) { open(); return; }
      var d = e.key === "ArrowDown" ? 1 : -1, n = rows.length;
      if (n) mark(active < 0 ? (d > 0 ? 0 : n - 1) : (active + d + n) % n);
    });
    input.value = chosen();
    return { input: input, sync: function () { shut(); input.value = chosen(); } };
  }

  /* One dialog at a time, with the focus kept inside it. busy(): true while a decision is on its way, when
     Escape closes nothing. A dialog closes by its X, its Cancel or Escape only; a click on the backdrop does
     nothing. close(true) puts focus back on the button that opened it. */
  function dialogs(busy) {
    var dialog = null, opener = null;
    function focusables(box) {
      return box.querySelectorAll("input, textarea, button, select").filter(function (n) { return !n.disabled && !n.hidden; });
    }
    function onKey(e) {
      if (!dialog) return;
      if (e.key === "Escape") { if (!(busy && busy())) close(true); return; }
      if (e.key !== "Tab") return;
      var f = focusables(dialog), first = f[0], last = f[f.length - 1], at = document.activeElement;
      if (!f.length) { e.preventDefault(); return; }
      if (!inside(dialog, at)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    }
    function open(id, from, first) {
      opener = from;
      dialog = document.getElementById(id);
      dialog.hidden = false;
      document.body.classList.add("modal-open");
      document.addEventListener("keydown", onKey);
      first.focus();
    }
    function close(refocus) {
      if (!dialog) return;
      dialog.hidden = true;
      dialog = null;
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", onKey);
      if (refocus && opener && !opener.hidden) opener.focus();
    }
    return { open: open, close: close, isOpen: function () { return !!dialog; } };
  }

  window.NOFin = { el: el, say: say, money: money, centavos: centavos, day: day, dayOf: dayOf, stamp: stamp, waited: waited,
    gb: gb, words: words, inside: inside, left: left, combo: combo, dialogs: dialogs };
})();
