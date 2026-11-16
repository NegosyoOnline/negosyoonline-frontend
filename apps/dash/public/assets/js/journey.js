/* Journey (ClickUp z8uq9meyqk, /journey/): the Santé owner sees how many orders and members reached each step, and how many events
   were sent to Meta. Reads GET /sites/{id}/pack/journey/?period=7d|30d|all (apps/pack/api_journey.py): the counts for this site only.
   The page decides nothing and computes no rate: every count comes from the API. The Meta numbers are counts of events sent, not
   people, and the API says per-person Meta attribution is not recorded; this page says so and makes no claim about ad results.
   The period dropdown is the house dropdown, mirrored from products.js combo() (jr- classes in journey.css). While the API answers
   404 (not a Santé site, or the package is off) the page says it is not available yet and its links stay hidden (probe).
   API strings reach the page through textContent or D.el only. Plain ES5. NOJourney.util holds the pure helpers (tests/journey.test.mjs). */
(function () {
  var D = window.NODash;
  var token = 0, S = null;
  var PERIODS = [["7d", "Last 7 days"], ["30d", "Last 30 days"], ["all", "All time"]];
  var STAGES = [["checkout_started", "Checkout started", "People who began checking out"], ["order_placed", "Order placed", "Orders placed for the Membership Pack"],
    ["proof_submitted", "Payment proof submitted", "Orders with a proof of payment sent in"], ["payment_verified", "Payment verified", "Orders whose payment you approved"],
    ["onboarding", "Registration", "Paid members by registration status"], ["dashboard_access", "Member dashboard access", "Members who signed in to the member dashboard"]];
  var PAY = { pending_review: ["warn", "Under review"], rejected: ["danger", "Needs attention"], verified: ["ok", "Verified"] };
  var REG = { ready_to_register: "Ready to register", in_registration: "In registration", registered: "Registered" };

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function root() { return byId("jr-root"); }
  function say(text) { var l = byId("jr-live"); if (l) l.textContent = text; }
  function msgOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function setNav(on) { Array.prototype.forEach.call(document.querySelectorAll("[data-journey-nav]"), function (n) { n.hidden = !on; }); }
  function path(site, period) { return "/sites/" + site + "/pack/journey/?period=" + encodeURIComponent(period); }

  /* ---------- pure helpers ---------- */

  function num(v) { return typeof v === "number" && isFinite(v) && v >= 0 ? Math.floor(v) : 0; }
  function count(v) { return String(num(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function labelOf(list, value) { for (var i = 0; i < list.length; i++) { if (list[i][0] === value) return list[i][1]; } return ""; }
  function human(code) { var t = String(code || "").replace(/_/g, " ").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ""; }
  function periodOf(v) { return labelOf(PERIODS, v) ? v : "30d"; }
  /* The stages in funnel order. A stage the API leaves out is not invented; an unknown one is listed after the known ones. */
  function orderStages(list) {
    var rows = Array.isArray(list) ? list.filter(function (s) { return s && typeof s.key === "string"; }) : [], out = [];
    STAGES.forEach(function (st) { rows.forEach(function (r) { if (r.key === st[0]) out.push(r); }); });
    rows.forEach(function (r) { if (!labelOf(STAGES, r.key)) out.push(r); });
    return out;
  }
  function stageLabel(key) { return labelOf(STAGES, key) || human(key); }
  function stageHint(key) { var h2 = ""; STAGES.forEach(function (s) { if (s[0] === key) h2 = s[2]; }); return h2; }
  function parts(iso) {
    var d = new Date(iso), o = {};
    if (isNaN(d.getTime())) return null;
    try { new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d).forEach(function (p) { o[p.type] = p.value; }); } catch (e) { return null; }
    return o;
  }
  function stamp(iso) { var p = parts(iso); return p ? String(p.month || "").replace(/\.$/, "") + " " + p.day + ", " + p.year + ", " + p.hour + ":" + p.minute + " " + String(p.dayPeriod || "").toUpperCase().replace(/\./g, "") : ""; }
  function orderLink(id) { return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? "/orders/?order=" + encodeURIComponent(id) : "/orders/"; }

  /* ---------- the house dropdown (mirrors products.js combo(), jr- classes) ---------- */

  function combo(select, label) {
    var wrap = h("div", "jr-combo"), box = h("div", "jr-combo-box"), panel = h("div", "jr-combo-panel"), rows = [], active = -1;
    var input = D.el("input", { "class": "jr-combo-input", type: "text", role: "combobox", autocomplete: "off", spellcheck: "false", "aria-label": label, "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": select.id + "-list" });
    panel.setAttribute("id", select.id + "-list"); panel.setAttribute("role", "listbox"); panel.setAttribute("aria-label", label);
    select.parentNode.insertBefore(wrap, select);
    select.classList.add("jr-combo-native"); select.setAttribute("tabindex", "-1"); select.setAttribute("aria-hidden", "true");
    wrap.appendChild(select); box.appendChild(input); box.appendChild(h("span", "jr-combo-caret")); wrap.appendChild(box); wrap.appendChild(panel);
    function opts() { return Array.prototype.slice.call(select.children); }
    function chosen() { var all = opts(), t = all.length ? all[0].textContent : ""; for (var i = 0; i < all.length; i++) if (all[i].value === select.value) { t = all[i].textContent; break; } return t; }
    function isOpen() { return wrap.classList.contains("is-open"); }
    function mark(i) {
      active = i;
      rows.forEach(function (r, n) { r.classList.toggle("is-active", n === i); });
      if (i >= 0) input.setAttribute("aria-activedescendant", rows[i].id); else input.removeAttribute("aria-activedescendant");
    }
    function announce() { if (typeof Event === "function" && select.dispatchEvent) select.dispatchEvent(new Event("change", { bubbles: true })); }
    function draw(q) {
      clear(panel); rows = [];
      opts().forEach(function (op) {
        if (q && op.textContent.toLowerCase().indexOf(q) < 0) return;
        var on = op.value === select.value;
        var row = h("div", "jr-combo-opt" + (on ? " is-selected" : ""), op.textContent);
        row.setAttribute("id", select.id + "-opt-" + rows.length); row.setAttribute("role", "option"); row.setAttribute("aria-selected", String(on));
        row.addEventListener("click", function () { select.value = op.value; input.value = chosen(); announce(); shut(); });
        rows.push(row); panel.appendChild(row);
      });
      if (!rows.length) panel.appendChild(h("div", "jr-combo-opt is-disabled", "No matches"));
      mark(-1);
    }
    function place() {
      if (!box.getBoundingClientRect) return;
      var r = box.getBoundingClientRect(), below = window.innerHeight - r.bottom, up = below < 160 && r.top > below;
      panel.style.left = r.left + "px"; panel.style.width = r.width + "px";
      panel.style.maxHeight = Math.max(120, Math.min(320, (up ? r.top : below) - 16)) + "px";
      panel.style.top = up ? "auto" : (r.bottom + 6) + "px";
      panel.style.bottom = up ? (window.innerHeight - r.top + 6) + "px" : "auto";
    }
    function onScroll(e) { if (!panel.contains || !panel.contains(e.target)) shut(); }
    function onDoc(e) { if (!wrap.contains || !wrap.contains(e.target)) shut(); }
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
    select.addEventListener("change", function () { input.value = chosen(); });
    input.addEventListener("focus", function () { if (input.select) input.select(); });
    input.addEventListener("input", function () { open(); draw(input.value.trim().toLowerCase()); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Tab") { shut(); return; }
      if (e.key === "Escape" && isOpen()) { e.preventDefault(); e.stopPropagation(); shut(); return; }
      if (e.key === "Enter") { e.preventDefault(); if (active >= 0) rows[active].fire ? rows[active].fire("click") : rows[active].click(); else open(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      if (!isOpen()) { open(); return; }
      var d = e.key === "ArrowDown" ? 1 : -1, n = rows.length;
      if (n) mark(active < 0 ? (d > 0 ? 0 : n - 1) : (active + d + n) % n);
    });
    input.value = chosen();
  }

  /* ---------- load ---------- */

  function show() {
    var mine = ++token, r = clear(root());
    S = { site: null, period: "30d", data: null, state: "loading" };
    r.setAttribute("aria-busy", "true");
    add(r, h("p", "jr-meta", "Loading…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      if (!res.ok) { failed(msgOf(res, "")); return; }
      var sites = D.sitesOf(res);
      S.site = sites.length ? D.siteFromQuery(sites.map(function (s) { return s.id; })) : null;
      if (!S.site) { unavailable(); return; }
      frame(); read(mine);
    });
  }
  function hide() { token++; S = null; say(""); var r = root(); if (r) { r.removeAttribute("aria-busy"); clear(r); } }
  function read(mine) {
    var period = S.period, out = byId("jr-results");
    S.state = "loading"; if (out) { out.setAttribute("aria-busy", "true"); }
    D.call("GET", path(S.site, period), null, true).then(function (res) {
      if (mine !== token || !S || period !== S.period || res.status === 401) return;
      if (res.status === 404) { unavailable(); return; }
      if (!res.ok) { S.state = "error"; S.err = msgOf(res, ""); results(); return; }
      S.data = res.data || {}; S.state = "ok"; results(); setNav(true);
    });
  }
  /* The links stay hidden until the API shows the Journey is open for this site (a 404 means not a Santé site, or the package is off). */
  function probe() {
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!sites.length) return;
      var site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      if (!site) return;
      D.call("GET", path(site, "7d"), null, true).then(function (r) { if (r.ok) setNav(true); });
    });
  }

  /* ---------- screens ---------- */

  function card(id, title, lead) {
    var s = h("section", "jr-card"), t = h("h2", "jr-h2", title);
    s.setAttribute("aria-labelledby", "jr-h-" + id); t.setAttribute("id", "jr-h-" + id);
    add(s, t, lead ? h("p", "jr-lead", lead) : null);
    return s;
  }
  function plain(title, text, retry) {
    var r = clear(root()); r.removeAttribute("aria-busy");
    var c = card("note", title, text);
    if (retry) { var b = h("button", "no-btn no-btn-ghost", "Try again"); b.setAttribute("type", "button"); b.addEventListener("click", function () { show(); }); add(c, b); }
    add(r, c); say(title);
  }
  function unavailable() { setNav(false); plain("The Journey is not available yet", "It shows for Santé stores once the Membership Pack is on. There is nothing to set up here for now."); }
  function failed(m) { plain("We could not load the Journey", m || "Please check your connection and try again.", true); }

  /* The period box, drawn once per visit so it keeps showing its value while the numbers reload. */
  function frame() {
    var r = clear(root()); r.removeAttribute("aria-busy");
    var bar = h("div", "jr-bar"), f = h("div", "jr-field"), lab = D.el("label", { "for": "jr-period", "class": "jr-label" }, "Period"), sel = D.el("select", { id: "jr-period", "class": "jr-select" });
    PERIODS.forEach(function (p) { var op = D.el("option", { value: p[0] }, p[1]); if (p[0] === S.period) op.selected = true; sel.appendChild(op); });
    sel.value = S.period;
    sel.addEventListener("change", function () { S.period = periodOf(sel.value); S.data = null; var mine = ++token; read(mine); });
    add(f, lab, sel); add(bar, f, h("p", "jr-stamp", ""));
    var out = h("div", "jr-results"); out.setAttribute("id", "jr-results"); out.setAttribute("aria-live", "polite");
    add(r, bar, out); combo(sel, "Period");
  }

  function results() {
    var out = byId("jr-results"); if (!out || !S) return;
    clear(out); out.removeAttribute("aria-busy");
    if (S.state === "loading") { add(out, h("p", "jr-meta", "Loading…")); return; }
    if (S.state === "error") {
      var e = card("err", "We could not load the Journey", S.err || "Please check your connection and try again."), b = h("button", "no-btn no-btn-ghost", "Try again");
      b.setAttribute("type", "button"); b.addEventListener("click", function () { read(++token); }); add(e, b); add(out, e); say("We could not load the Journey"); return;
    }
    var d = S.data || {}, when = stamp(d.generated_at), sEl = root().querySelector(".jr-stamp");
    if (sEl) sEl.textContent = when ? "Counts as of " + when + " (Manila time)" : "";
    add(out, stagesCard(d), metaCard(d), recentCard(d));
    say("Journey updated for " + labelOf(PERIODS, S.period));
  }

  function stagesCard(d) {
    var c = card("steps", "Steps reached", "How many reached each step in " + labelOf(PERIODS, S.period).toLowerCase() + ". Each step is counted on its own, so a later step can be larger or smaller than the one before it."), list = h("ol", "jr-steps");
    var rows = orderStages(d.stages);
    if (!rows.length) { add(c, h("p", "jr-empty", "Nothing to show for this period yet.")); return c; }
    rows.forEach(function (s) {
      var li = h("li", "jr-step"), main = h("div", "jr-step-main"), name = h("div", "jr-step-name"), hint = stageHint(s.key);
      add(name, h("strong", "", stageLabel(s.key)), hint ? h("span", "jr-step-hint", hint) : null);
      add(main, name, h("span", "jr-num", count(s.count)));
      add(li, main);
      if (s.key === "onboarding" && Array.isArray(s.breakdown) && s.breakdown.length) {
        var ul = h("ul", "jr-break");
        s.breakdown.forEach(function (b) { if (b && typeof b.status === "string") add(ul, add(h("li", ""), h("span", "", REG[b.status] || human(b.status)), h("strong", "", count(b.count)))); });
        add(li, ul);
      }
      add(list, li);
    });
    var any = rows.some(function (s) { return num(s.count) > 0; });
    add(c, list, any ? null : h("p", "jr-empty", "No one has reached these steps in this period yet."));
    return c;
  }

  function metaCard(d) {
    var m = d && typeof d.meta === "object" && d.meta ? d.meta : {}, c = card("meta", "Events sent to Meta", "Counts of events sent to Meta, not counts of people.");
    if (m.connected !== true) {
      add(c, h("p", "jr-state", "Meta is not connected."), h("p", "jr-hint", "No events are sent to Meta until it is connected in your settings."));
    } else {
      var ev = Array.isArray(m.events) ? m.events.filter(function (e) { return e && typeof e.name === "string"; }) : [];
      if (!ev.length) add(c, h("p", "jr-empty", "No events were sent to Meta in this period."));
      else {
        var t = h("table", "jr-table"), cap = h("caption", "jr-sr", "Events sent to Meta, " + labelOf(PERIODS, S.period)), hd = h("thead"), tr = h("tr");
        [["Event", ""], ["Sent", "r"], ["Failed", "r"]].forEach(function (x) { var th = h("th", x[1], x[0]); th.setAttribute("scope", "col"); add(tr, th); });
        var tb = h("tbody");
        ev.forEach(function (e) { var r = h("tr"), th = h("th", "", e.name); th.setAttribute("scope", "row"); add(r, th, h("td", "r", count(e.sent)), h("td", "r", count(e.failed))); add(tb, r); });
        add(t, cap, add(hd, tr), tb); add(c, add(h("div", "jr-scroll"), t));
      }
    }
    if (d && d.attribution && d.attribution.per_person === "not_recorded") add(c, h("p", "jr-note", "Per-person Meta attribution is not recorded, so events are not matched to individual people."));
    return c;
  }

  function recentCard(d) {
    var c = card("recent", "Recent orders", "The latest orders for the Membership Pack. Open one to see its proof of payment."), rows = Array.isArray(d.recent) ? d.recent.filter(function (o) { return o && typeof o === "object"; }) : [];
    if (!rows.length) { add(c, h("p", "jr-empty", "No orders in this period yet.")); return c; }
    var ul = h("ul", "jr-recent");
    rows.forEach(function (o) {
      var li = h("li", "jr-order"), pay = PAY[o.payment_status] || ["neutral", human(o.payment_status)], link = D.el("a", { "class": "jr-order-link", href: orderLink(o.order_id) }, "Order " + (o.order_number || ""));
      var top = add(h("div", "jr-order-top"), link, pay[1] ? h("span", "chip chip-" + pay[0], pay[1]) : null);
      var reg = o.registration_status ? (REG[o.registration_status] || human(o.registration_status)) : "No registration yet";
      var meta = h("p", "jr-order-meta", [stamp(o.placed_at), "Registration: " + reg, "Member dashboard: " + (o.dashboard_access === true ? "signed in" : "not yet")].filter(Boolean).join(" · "));
      add(li, top, meta); add(ul, li);
    });
    add(c, ul);
    return c;
  }

  window.NOJourney = { show: show, hide: hide, probe: probe, util: { orderStages: orderStages, count: count, human: human, periodOf: periodOf, orderLink: orderLink, PERIODS: PERIODS } };
})();
