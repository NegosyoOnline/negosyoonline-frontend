/* Vendored copy of the shared dropdown and calendar scripts, renamed pk- so no page names the platform. Re-copy and rename if the originals change. */
/* PK Select — progressively enhances <select data-pk-select> into a searchable, floating-label
   combobox: typing filters the option panel live, matching the reference "State/Province" combo.
   The native <select> stays in the DOM (visually hidden) and stays the source of truth, so
   existing form code that reads `form.fieldName.value` or listens for the select's "change"
   event keeps working unchanged. */
(function () {
  /* ── Hover bubble for `data-pk-tip` targets ───────────────────────────────────
     ONE element for the whole page, parked on <body> so it escapes every
     ancestor's overflow/stacking context — the same reason the option panel is
     position:fixed. Placement is TOP by default (bubble above the target, arrow
     centred on its bottom edge pointing down) and flips BELOW only when the
     bubble would clip the top of the viewport, because a tooltip rendered
     off-screen is worse than one on the wrong side.

     The arrow is positioned against the TARGET's centre, not the bubble's, so
     it keeps pointing at the row even when the bubble had to be clamped away
     from the viewport edge. pointer-events:none keeps the bubble from stealing
     the hover that is showing it. */
  var TIP = null;
  var TIP_GAP = 10, TIP_PAD = 8;

  function tipNode() {
    if (TIP) return TIP;
    TIP = document.createElement("div");
    TIP.className = "pk-tip";
    TIP.innerHTML = '<span class="pk-tip-text"></span><span class="pk-tip-arrow"></span>';
    document.body.appendChild(TIP);
    return TIP;
  }

  function tipHide() { if (TIP) TIP.classList.remove("is-on"); }

  function tipShow(target, text) {
    if (!text) return tipHide();
    var t = tipNode();
    t.querySelector(".pk-tip-text").textContent = text;
    // Make it laid out before measuring: opacity:0 still has a box, but the
    // previous call may have left it clamped at the far edge, which would
    // wrap the text differently and give a stale height.
    t.style.left = "0px";
    t.style.top = "0px";
    t.classList.add("is-on");

    var r = target.getBoundingClientRect();
    var tw = t.offsetWidth, th = t.offsetHeight;
    var cx = r.left + r.width / 2;

    var top = r.top - th - TIP_GAP, side = "at-top";
    if (top < TIP_PAD) { top = r.bottom + TIP_GAP; side = "at-bottom"; }
    var left = Math.min(Math.max(TIP_PAD, cx - tw / 2), window.innerWidth - tw - TIP_PAD);

    t.classList.remove("at-top", "at-bottom");
    t.classList.add(side);
    t.style.left = left + "px";
    t.style.top = top + "px";
    // Keep the arrow inside the bubble's rounded corners even at full clamp.
    t.querySelector(".pk-tip-arrow").style.left =
      Math.min(Math.max(12, cx - left), tw - 12) + "px";
  }

  // Delegated once for the whole document: panel rows are re-created on every
  // open and every keystroke of the filter, so per-row listeners would leak.
  // ⚠️ The attribute is NAMESPACED for a reason — plain `data-tip` is already
  // taken by Partner HQ's own CSS ::after tooltip (`.phq .act[data-tip]` in
  // partnership.css), and this file is loaded by dashboard/base/base.html on
  // EVERY dashboard page, so an un-namespaced selector would render a second
  // bubble on top of theirs. Do not "simplify" this back to data-tip.
  document.addEventListener("mouseover", function (e) {
    var hit = e.target.closest && e.target.closest("[data-pk-tip]");
    if (hit) tipShow(hit, hit.getAttribute("data-pk-tip"));
  });
  document.addEventListener("mouseout", function (e) {
    var hit = e.target.closest && e.target.closest("[data-pk-tip]");
    // Ignore moves BETWEEN descendants of the same target.
    if (hit && !(e.relatedTarget && hit.contains(e.relatedTarget))) tipHide();
  });
  // A bubble is anchored to viewport coordinates; anything that moves the
  // target underneath it must dismiss it rather than leave it floating.
  window.addEventListener("scroll", tipHide, true);
  window.addEventListener("resize", tipHide);

  function labelFor(select) {
    var sib = select.previousElementSibling;
    if (sib && sib.classList.contains("set-lbl")) return sib.textContent;
    return select.getAttribute("aria-label") || "";
  }

  function enhance(select) {
    if (select.dataset.pkEnhanced) return;
    select.dataset.pkEnhanced = "1";

    var label = labelFor(select);
    var labelSib = select.previousElementSibling;
    if (labelSib && labelSib.classList.contains("set-lbl")) labelSib.style.display = "none";

    var wrap = document.createElement("div");
    wrap.className = "pk-select";
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add("pk-select-native");

    var box = document.createElement("div");
    box.className = "pk-select-box";
    box.innerHTML =
      '<span class="pk-select-label">' + label +
      (select.required ? ' <span class="pk-select-req">*</span>' : "") + "</span>" +
      '<input class="pk-select-input" type="text" autocomplete="off" spellcheck="false">' +
      '<span class="pk-select-caret"><i class="fas fa-chevron-down"></i></span>';
    wrap.appendChild(box);
    var input = box.querySelector(".pk-select-input");
    // Opt-in (data-pk-select-nofilter): a short fixed list. The trigger is read-only (no typing
    // filter, no phone keyboard) and the panel is driven by ArrowDown/ArrowUp, Enter and Space.
    // Selects without the attribute behave exactly as before.
    var nofilter = select.hasAttribute("data-pk-select-nofilter");
    var active = null;
    if (nofilter) { input.readOnly = true; input.setAttribute("inputmode", "none"); }
    function setActive(row) {
      if (active) active.classList.remove("is-active");
      active = row || null;
      if (active) { active.classList.add("is-active"); if (active.scrollIntoView) active.scrollIntoView({ block: "nearest" }); }
    }
    // Optional placeholder shown inside the box when nothing is selected
    // (opt-in via data-placeholder; existing selects without it are unchanged).
    var phText = select.getAttribute("data-placeholder");
    if (phText) input.placeholder = phText;

    var panel = document.createElement("div");
    panel.className = "pk-select-panel";
    wrap.appendChild(panel);

    function currentLabel() {
      var opt = select.options[select.selectedIndex];
      return opt && opt.value ? opt.textContent : "";
    }

    // Optional hover detail: an <option data-pk-tip="…"> surfaces as the styled
    // PK bubble (see tipShow) on its panel row AND on the closed box once
    // chosen. Opt-in per option — a select whose options carry no data-pk-tip is
    // untouched, so this changes nothing for the other combos on the platform.
    // Used by the Commerce recipient picker to reveal the saved shipping
    // address on hover. NOTE the native `title` attribute is deliberately NOT
    // mirrored onto the rendered row/box: the OS tooltip would fire alongside
    // the bubble and you would see the same address twice. Options may still
    // carry `title` for assistive tech — the native <select> stays in the
    // accessibility tree, it is only visually covered by the box.
    function currentTip() {
      var opt = select.options[select.selectedIndex];
      return (opt && opt.value && opt.getAttribute("data-pk-tip")) || "";
    }

    function renderOptions(filterText) {
      panel.innerHTML = "";
      var q = (filterText || "").trim().toLowerCase();
      var any = false;

      // Returns true when the option actually rendered, so a group can tell
      // whether anything survived the filter.
      function renderOption(opt) {
        // Skip the blank "Select…" placeholder option — unless the select opts in
        // with data-keep-blank (filter toolbars whose blank option is a real
        // choice, e.g. "All courses"), so picking it resets the filter.
        if (!opt.value && !opt.disabled && !select.hasAttribute("data-keep-blank")) return false;
        if (q && opt.textContent.toLowerCase().indexOf(q) === -1) return false;
        any = true;
        var row = document.createElement("div");
        row.className = "pk-select-opt" +
          (opt.selected ? " is-selected" : "") + (opt.disabled ? " is-disabled" : "");
        row.textContent = opt.textContent;
        var rowTip = opt.getAttribute("data-pk-tip");
        if (rowTip) row.setAttribute("data-pk-tip", rowTip);
        if (!opt.disabled) {
          row.addEventListener("click", function () {
            select.value = opt.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            input.value = opt.textContent;
            close();
          });
        }
        panel.appendChild(row);
        return true;
      }

      // Walk CHILDREN, not `select.options` — the latter flattens <optgroup>s,
      // which silently discarded the grouping of any grouped select (the Pro
      // checkout's ~30-item bank list was one undifferentiated run). Selects
      // without <optgroup> children never enter that branch and render
      // exactly as before.
      Array.prototype.forEach.call(select.children, function (node) {
        if (node.tagName === "OPTGROUP") {
          var head = document.createElement("div");
          head.className = "pk-select-group";
          head.textContent = node.label;
          panel.appendChild(head);
          var rendered = false;
          Array.prototype.forEach.call(node.children, function (opt) {
            if (renderOption(opt)) rendered = true;
          });
          // A header with nothing under it is noise while filtering.
          if (!rendered) panel.removeChild(head);
        } else if (node.tagName === "OPTION") {
          renderOption(node);
        }
      });

      if (!any) {
        var empty = document.createElement("div");
        empty.className = "pk-select-opt is-disabled";
        empty.textContent = "No matches";
        panel.appendChild(empty);
      }
    }

    function syncFromSelect() {
      input.value = currentLabel();
      // The tip goes on the BOX, not the input: the input is the hover target
      // for its own text only, and a tip on the wrapper would also cover the
      // caret. Cleared (not left stale) when the new selection carries none —
      // and any bubble currently showing the OLD address is dismissed, or it
      // would hang over the field describing a recipient no longer selected.
      var t = currentTip();
      if (t) box.setAttribute("data-pk-tip", t); else box.removeAttribute("data-pk-tip");
      tipHide();
      wrap.classList.toggle("is-empty", !select.value);
      if (wrap.classList.contains("is-open")) renderOptions("");
    }

    // Reflect the native select's disabled state (e.g. a cascade locking a
    // downstream field, or a KYC-locked field): grey it out and block opening.
    function syncDisabled() {
      var off = select.disabled;
      wrap.classList.toggle("is-disabled", off);
      input.disabled = off;
      if (off) close();
    }

    // The panel is position:fixed so it escapes any ancestor's overflow clipping (e.g. the
    // account-settings modal body) — its coordinates must be computed from the box each time
    // it opens, and dropped if the box scrolls out from under it.
    function reposition() {
      var rect = box.getBoundingClientRect();
      var vh = window.innerHeight;
      var spaceBelow = vh - rect.bottom;
      var openUpward = spaceBelow < 160 && rect.top > spaceBelow;
      panel.style.left = rect.left + "px";
      panel.style.width = rect.width + "px";
      // Bound the panel to the space actually available in whichever direction it opens —
      // the CSS max-height is a static fallback; this keeps a long list (e.g. PH provinces)
      // scrollable within the viewport instead of extending past it, where position:fixed
      // content is simply unreachable (no page scroll ever brings it into view).
      var available = (openUpward ? rect.top : spaceBelow) - 16;
      panel.style.maxHeight = Math.max(120, Math.min(320, available)) + "px";
      if (openUpward) {
        panel.style.top = "auto";
        panel.style.bottom = (vh - rect.top + 6) + "px";
      } else {
        panel.style.bottom = "auto";
        panel.style.top = (rect.bottom + 6) + "px";
      }
    }

    function onAncestorScroll(e) {
      if (e.target === panel || panel.contains(e.target)) return;
      close();
    }

    function open() {
      wrap.classList.add("is-open");
      renderOptions("");
      reposition();
      window.addEventListener("resize", reposition);
      document.addEventListener("scroll", onAncestorScroll, true);
      if (nofilter) setActive(panel.querySelector(".pk-select-opt.is-selected") || panel.querySelector(".pk-select-opt:not(.is-disabled)"));
    }
    function close() {
      wrap.classList.remove("is-open");
      // Snap back to the real selection so the field never shows unmatched typed text.
      input.value = currentLabel();
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", onAncestorScroll, true);
    }

    box.addEventListener("click", function () {
      if (select.disabled) return;
      if (!wrap.classList.contains("is-open")) open();
      input.focus();
    });
    input.addEventListener("focus", function () {
      if (select.disabled) { input.blur(); return; }
      if (!wrap.classList.contains("is-open")) open();
      input.select();
    });
    input.addEventListener("input", function () { renderOptions(input.value); });
    input.addEventListener("keydown", function (e) {
      if (nofilter && !select.disabled) {
        var rows = Array.prototype.slice.call(panel.querySelectorAll(".pk-select-opt:not(.is-disabled)"));
        var isOpen = wrap.classList.contains("is-open");
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (!isOpen) { open(); return; }
          var at = rows.indexOf(active);
          setActive(rows[e.key === "ArrowDown" ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1)]);
          return;
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!isOpen) open(); else if (active) active.click(); else close();
          return;
        }
      }
      if (e.key === "Escape") { close(); input.blur(); }
      else if (e.key === "Enter") { e.preventDefault(); }
    });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) close();
    });

    // Options repopulated programmatically (e.g. the PH address province/city/barangay cascade),
    // or the disabled attribute toggled by a cascade / KYC lock.
    new MutationObserver(function () { syncFromSelect(); syncDisabled(); })
      .observe(select, { childList: true, attributes: true, attributeFilter: ["disabled"] });
    select.addEventListener("change", syncFromSelect);

    syncFromSelect();
    syncDisabled();
  }

  function init(root) {
    (root || document).querySelectorAll("select[data-pk-select]").forEach(enhance);
  }

  window.PKSelect = { init: init };
  document.addEventListener("DOMContentLoaded", function () { init(document); });
})();
/* PK Date — progressively enhances <input type="date" data-pk-date> into a custom calendar
   dropdown with the same floating-label box and fixed-position panel as PK Select
   (pk-select.js), so date fields read as one design system with dropdowns instead of the
   browser's native, unstyleable calendar UI. The native input stays in the DOM (visually
   hidden) as the source of truth — existing code reading `form.fieldName.value` (ISO
   yyyy-mm-dd) or listening for "change" keeps working unchanged. */
(function () {
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  var WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

  // Inline SVG icons (currentColor) so the widget renders on hosts that don't
  // load Font Awesome — the hq.* and merchant shells mount this widget without
  // FA, which turned the FA <i> glyphs into empty tofu boxes.
  var SVG_L = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>';
  var SVG_R = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>';
  var SVG_CAL = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="17" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="8" y1="2.5" x2="8" y2="6"></line><line x1="16" y1="2.5" x2="16" y2="6"></line></svg>';

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function labelFor(input) {
    var sib = input.previousElementSibling;
    if (sib && sib.classList.contains("set-lbl")) return sib.textContent;
    return input.getAttribute("aria-label") || "";
  }

  function enhance(input) {
    if (input.dataset.pkEnhanced) return;
    input.dataset.pkEnhanced = "1";

    // Opt-in: data-align="right" anchors the panel's RIGHT edge to the box (panel
    // grows leftward). Used where the field sits at the right edge of its row so
    // the calendar opens toward the left instead of spilling off-screen. Default
    // stays left-anchored (e.g. the Account Settings form).
    var alignRight = input.getAttribute("data-align") === "right";

    var label = labelFor(input);
    var labelSib = input.previousElementSibling;
    if (labelSib && labelSib.classList.contains("set-lbl")) labelSib.style.display = "none";

    var wrap = document.createElement("div");
    wrap.className = "pk-date";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.classList.add("pk-date-native");

    var box = document.createElement("div");
    box.className = "pk-date-box";
    box.setAttribute("tabindex", "0");
    box.innerHTML =
      '<span class="pk-date-label">' + label +
      (input.required ? ' <span class="pk-select-req">*</span>' : "") + "</span>" +
      '<span class="pk-date-value"></span>' +
      '<span class="pk-date-ic">' + SVG_CAL + '</span>';
    wrap.appendChild(box);
    var valueEl = box.querySelector(".pk-date-value");

    var panel = document.createElement("div");
    panel.className = "pk-date-panel";
    wrap.appendChild(panel);

    // Three drill-down levels — click the header to zoom out (days -> months ->
    // years), click a cell to zoom back in. Lets a birthdate in, say, 1975 be
    // reached in a handful of clicks instead of ~600 "previous month" clicks.
    var LEVEL_DAYS = "days", LEVEL_MONTHS = "months", LEVEL_YEARS = "years";
    var view = { y: 0, m: 0, level: LEVEL_DAYS };

    function parsed() {
      if (!input.value) return null;
      var p = input.value.split("-");
      return { y: +p[0], m: +p[1] - 1, d: +p[2] };
    }

    function setValue(y, m, d) {
      input.value = y + "-" + pad(m + 1) + "-" + pad(d);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function syncFromInput() {
      var v = parsed();
      var placeholder = input.getAttribute("data-placeholder") || "Select date";
      valueEl.textContent = v ? MONTHS[v.m] + " " + v.d + ", " + v.y : placeholder;
      wrap.classList.toggle("is-empty", !v);
      var today = new Date();
      view.y = v ? v.y : today.getFullYear();
      view.m = v ? v.m : today.getMonth();
      if (wrap.classList.contains("is-open")) renderPanel();
    }

    // Reflect the native input's disabled state (e.g. the Account Settings KYC
    // identity lock): grey the box out, drop it from the tab order, and block
    // opening. The native input is visually hidden, so its own :disabled styling
    // never reaches the screen — without this the calendar stays fully clickable
    // on a locked field and the member picks a value the server then discards.
    // Mirrors syncDisabled() in pk-select.js.
    function syncDisabled() {
      var off = input.disabled;
      wrap.classList.toggle("is-disabled", off);
      box.setAttribute("tabindex", off ? "-1" : "0");
      if (off) close();
    }

    function renderPanel() {
      if (view.level === LEVEL_YEARS) renderYears();
      else if (view.level === LEVEL_MONTHS) renderMonths();
      else renderDays();
    }

    function renderDays() {
      var sel = parsed();
      var today = new Date();
      var first = new Date(view.y, view.m, 1).getDay();
      var total = new Date(view.y, view.m + 1, 0).getDate();

      var html = '<div class="pk-date-head">' +
        '<button type="button" class="pk-date-nav" data-nav="-1" data-navunit="month">' + SVG_L + '</button>' +
        '<span class="pk-date-month pk-date-zoom" data-zoom="' + LEVEL_MONTHS + '">' + MONTHS[view.m] + " " + view.y + "</span>" +
        '<button type="button" class="pk-date-nav" data-nav="1" data-navunit="month">' + SVG_R + '</button>' +
        "</div>" +
        '<div class="pk-date-week">' + WEEKDAYS.map(function (w) { return "<span>" + w + "</span>"; }).join("") + "</div>" +
        '<div class="pk-date-grid">';

      for (var i = 0; i < first; i++) html += '<span class="pk-date-cell is-blank"></span>';
      for (var d = 1; d <= total; d++) {
        var isSel = !!(sel && sel.y === view.y && sel.m === view.m && sel.d === d);
        var isToday = today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d;
        html += '<button type="button" class="pk-date-cell' +
          (isSel ? " is-selected" : "") + (isToday ? " is-today" : "") +
          '" data-day="' + d + '">' + d + "</button>";
      }
      html += "</div>" +
        '<div class="pk-date-foot">' +
        '<button type="button" class="pk-date-link" data-action="clear">Clear</button>' +
        '<button type="button" class="pk-date-link" data-action="today">Today</button>' +
        "</div>";
      panel.innerHTML = html;
    }

    function renderMonths() {
      var sel = parsed();
      var today = new Date();
      var html = '<div class="pk-date-head">' +
        '<button type="button" class="pk-date-nav" data-nav="-1" data-navunit="year">' + SVG_L + '</button>' +
        '<span class="pk-date-month pk-date-zoom" data-zoom="' + LEVEL_YEARS + '">' + view.y + "</span>" +
        '<button type="button" class="pk-date-nav" data-nav="1" data-navunit="year">' + SVG_R + '</button>' +
        "</div>" +
        '<div class="pk-date-mgrid">';

      for (var mi = 0; mi < 12; mi++) {
        var isSel = !!(sel && sel.y === view.y && sel.m === mi);
        var isToday = today.getFullYear() === view.y && today.getMonth() === mi;
        html += '<button type="button" class="pk-date-mcell' +
          (isSel ? " is-selected" : "") + (isToday ? " is-today" : "") +
          '" data-month="' + mi + '">' + MONTHS[mi].slice(0, 3) + "</button>";
      }
      html += "</div>";
      panel.innerHTML = html;
    }

    function renderYears() {
      var sel = parsed();
      var today = new Date();
      var base = Math.floor(view.y / 12) * 12;
      var html = '<div class="pk-date-head">' +
        '<button type="button" class="pk-date-nav" data-nav="-1" data-navunit="decade">' + SVG_L + '</button>' +
        '<span class="pk-date-month">' + base + '–' + (base + 11) + "</span>" +
        '<button type="button" class="pk-date-nav" data-nav="1" data-navunit="decade">' + SVG_R + '</button>' +
        "</div>" +
        '<div class="pk-date-mgrid">';

      for (var yi = base; yi < base + 12; yi++) {
        var isSel = !!(sel && sel.y === yi);
        var isToday = today.getFullYear() === yi;
        html += '<button type="button" class="pk-date-mcell' +
          (isSel ? " is-selected" : "") + (isToday ? " is-today" : "") +
          '" data-year="' + yi + '">' + yi + "</button>";
      }
      html += "</div>";
      panel.innerHTML = html;
    }

    function reposition() {
      var rect = box.getBoundingClientRect();
      var vh = window.innerHeight;
      var spaceBelow = vh - rect.bottom;
      var openUpward = spaceBelow < 320 && rect.top > spaceBelow;
      if (alignRight) {
        panel.style.left = Math.max(6, rect.right - (panel.offsetWidth || 270)) + "px";
      } else {
        panel.style.left = rect.left + "px";
      }
      if (openUpward) {
        panel.style.top = "auto";
        panel.style.bottom = (vh - rect.top + 6) + "px";
      } else {
        panel.style.bottom = "auto";
        panel.style.top = (rect.bottom + 6) + "px";
      }
    }

    function onAncestorScroll(e) {
      if (e.target === panel || panel.contains(e.target)) return;
      close();
    }

    function open() {
      // Single choke point for every path into the calendar (box click, Enter,
      // Space) — keep the guard here rather than on each handler.
      if (input.disabled) return;
      view.level = LEVEL_DAYS;
      wrap.classList.add("is-open");
      renderPanel();
      reposition();
      window.addEventListener("resize", reposition);
      document.addEventListener("scroll", onAncestorScroll, true);
    }
    function close() {
      wrap.classList.remove("is-open");
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", onAncestorScroll, true);
    }
    function toggle() { wrap.classList.contains("is-open") ? close() : open(); }

    box.addEventListener("click", toggle);
    box.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      else if (e.key === "Escape") close();
    });
    panel.addEventListener("click", function (e) {
      // Stop here — renderPanel() below replaces panel.innerHTML on nav/zoom/
      // cell clicks, detaching e.target from the DOM before this event finishes
      // bubbling. The document-level "click outside closes it" listener then
      // sees a detached target (wrap.contains() is false for it) and closes
      // the panel right after it re-renders. Never let panel clicks bubble.
      e.stopPropagation();

      var zoom = e.target.closest("[data-zoom]");
      if (zoom) { view.level = zoom.dataset.zoom; renderPanel(); return; }

      var nav = e.target.closest("[data-nav]");
      if (nav) {
        var dir = parseInt(nav.dataset.nav, 10);
        var unit = nav.dataset.navunit;
        if (unit === "year") {
          view.y += dir;
        } else if (unit === "decade") {
          view.y += dir * 12;
        } else {
          view.m += dir;
          if (view.m < 0) { view.m = 11; view.y--; }
          else if (view.m > 11) { view.m = 0; view.y++; }
        }
        renderPanel();
        return;
      }
      var monthCell = e.target.closest("[data-month]");
      if (monthCell) { view.m = parseInt(monthCell.dataset.month, 10); view.level = LEVEL_DAYS; renderPanel(); return; }

      var yearCell = e.target.closest("[data-year]");
      if (yearCell) { view.y = parseInt(yearCell.dataset.year, 10); view.level = LEVEL_MONTHS; renderPanel(); return; }

      var day = e.target.closest("[data-day]");
      if (day) { setValue(view.y, view.m, parseInt(day.dataset.day, 10)); view.level = LEVEL_DAYS; close(); return; }
      var action = e.target.closest("[data-action]");
      if (action && action.dataset.action === "clear") {
        input.value = "";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        close();
      } else if (action && action.dataset.action === "today") {
        var t = new Date();
        setValue(t.getFullYear(), t.getMonth(), t.getDate());
        view.level = LEVEL_DAYS;
        close();
      }
    });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) close();
    });

    // The disabled attribute may be toggled after enhancement (a cascade, or a
    // modal re-render), same as pk-select.js watches for.
    new MutationObserver(syncDisabled)
      .observe(input, { attributes: true, attributeFilter: ["disabled"] });

    input.addEventListener("change", syncFromInput);
    syncFromInput();
    syncDisabled();
  }

  function init(root) {
    (root || document).querySelectorAll('input[type="date"][data-pk-date]').forEach(enhance);
  }

  window.PKDate = { init: init };
  document.addEventListener("DOMContentLoaded", function () { init(document); });
})();
