/* Domain (/settings/domain/, ClickUp z8uq9mhgvj, design z8uq9mcyu0 R4.7): "Your website address". The one website address that comes with the
   plan: search a name, check it, buy it after a confirm step, then the setup steps until the www address is live.
   Reads GET /sites/{id}/domain/ and writes POST .../domain/check/, .../buy/ and .../retry/ (the owner routes of apps/domains).
   The API answers {eligible, locked_reason, extensions, registered_name, domain: {id, name, state, label, reason, can_buy, can_retry,
   quote_expires_at}}. Check runs in the worker, so after a Check the page asks again every few seconds until the name is quoted or ended.
   Every status and string comes from the API and reaches the page through textContent or D.el only; an error shows the API's own
   message, never raw data. The only amount the page shows is the year-2 line on the result before Buy (domain.renewal_usd_cents); no first-year price is ever shown. While the API answers 404 (DOMAINS_ENABLED is off,
   or not a Santé site) the page says the address is not available yet. The route is reachable by its address only: no menu link
   points here until Coach Ed's staging OK. All wording is a placeholder until he approves it. Plain ES5.
   NODomain.util holds the pure helpers (tests/domain.test.mjs). */
(function () {
  var D = window.NODash;
  var token = 0, S = null, timer = null;
  var HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
  var STEPS = ["Requested", "Registering", "Connecting", "Activating"];
  /* Which of the four steps each claim state sits on; absent states are not a setup step. */
  var STEP_OF = { confirmed: 0, awaiting_gate: 0, registering: 1, registered: 2, zone: 2, connecting: 2, activating: 3 };
  /* States where the page keeps asking: [seconds]. Everything else waits for the owner. */
  var POLL = { checking: 3, confirmed: 8, awaiting_gate: 8, registering: 8, registered: 8, zone: 8, connecting: 8, activating: 8, removal_pending: 8 };
  /* An error code after which the page re-reads the status, so it shows what is true now. */
  var REFRESH = { not_eligible: 1, domain_exists: 1, domain_in_progress: 1, request_in_progress: 1, purchase_not_open: 1, check_first: 1, quote_expired: 1, name_taken: 1, nothing_to_retry: 1 };
  var LEAD = "Free for your first year: one address for your store.";
  /* The one plain line (FD4/FD6). It carries no amount; the year-2 amount is the separate line yearTwo() builds. Placeholder until Coach Ed's OK. */
  var HOLD = "Your address stays connected while you stay subscribed. From year 2 its renewal is paid. NegosyoOnline registers and holds it for your store.";
  /* Claim states from which the domain is registered, so "Free until" can show. */
  var REGISTERED = { registered: 1, zone: 1, connecting: 1, activating: 1, live: 1, attention: 1 };
  var LOCKED_FALLBACK = "Your own website address unlocks after your first subscription payment is approved.";

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(text) { var l = byId("dm-live"); if (l) l.textContent = text; }
  function btn(label, kind, fn) {
    var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost"), label);
    b.setAttribute("type", "button");
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function busy(b, on) { if (!b) return; if (on) { b.setAttribute("aria-busy", "true"); b.disabled = true; } else { b.removeAttribute("aria-busy"); b.disabled = false; } }
  function base() { return "/sites/" + S.site + "/domain/"; }

  /* ---------- pure helpers ---------- */

  /* The text of a failed call: the name's own message first, then the API's message, then the fallback. Never raw data. */
  function errText(res, fallback) {
    var d = res && res.data, f = d && d.fields && d.fields.name;
    if (typeof f === "string" && f) return f;
    if (d && typeof d.message === "string" && d.message) return d.message;
    return fallback || "Something went wrong. Please try again.";
  }
  function isAnswer(a) { return !!a && typeof a === "object" && typeof a.eligible === "boolean"; }
  /* What a typed name becomes: no scheme, no www., no path, lowercase, and the plan's extension added when none was typed. */
  function cleanName(raw, extensions) {
    var v = String(raw == null ? "" : raw).trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").replace(/[\/?#].*$/, "").replace(/\.$/, "");
    if (!v) return "";
    if (v.indexOf(".") < 0) {
      var ext = Array.isArray(extensions) && typeof extensions[0] === "string" && /^\.[a-z]{2,63}$/.test(extensions[0]) ? extensions[0] : ".com";
      v += ext;
    }
    return v;
  }
  /* The plain line under the search box from the API's `extensions`: "You can choose an address ending in .com, .net or .org."
     Only items shaped like an extension are kept; "" (no line) when none are left or the list is missing. */
  function extHint(extensions) {
    var list = [];
    if (Array.isArray(extensions)) {
      for (var i = 0; i < extensions.length; i++) {
        var e = extensions[i];
        if (typeof e === "string" && /^\.[a-z]{2,63}$/.test(e) && list.indexOf(e) < 0) list.push(e);
      }
    }
    if (!list.length) return "";
    var tail = list.length > 1 ? list.slice(0, -1).join(", ") + " or " + list[list.length - 1] : list[0];
    return "You can choose an address ending in " + tail + ".";
  }
  /* The year-2 line for the result before Buy, from domain.renewal_usd_cents: a positive integer shows US$X.XX; anything else, "". */
  function yearTwo(d) {
    var c = d && typeof d === "object" ? d.renewal_usd_cents : null;
    if (typeof c !== "number" || !isFinite(c) || Math.floor(c) !== c || c <= 0) return "";
    return "Free for the first year. From year 2: US$" + (c / 100).toFixed(2) + " a year, Cloudflare\u2019s renewal price with no markup, billed in pesos at the BSP rate when the renewal bill is made.";
  }
  /* "www.name" for a name that is a plain host, else "" (so nothing odd ever becomes a link). */
  function wwwOf(name) { return typeof name === "string" && HOST_RE.test(name) ? "www." + name : ""; }
  function lockedText(reason) {
    var r = typeof reason === "string" ? reason.trim() : "";
    return !r || /first (subscription )?payment/i.test(r) ? LOCKED_FALLBACK : r;
  }
  /* The screen the answer calls for: locked, search, checking, quoted, expired, progress, live, attention, failed, conflict, removing. */
  function stage(a) {
    if (!isAnswer(a)) return "search";
    if (!a.eligible) return "locked";
    var d = a.domain;
    if (!d || typeof d !== "object") return "search";
    switch (d.state) {
      case "checking": return "checking";
      case "quoted": return d.can_buy === true ? "quoted" : "expired";
      case "confirmed": case "awaiting_gate": case "registering": case "registered": case "zone": case "connecting": case "activating": return "progress";
      case "live": return "live";
      case "attention": return "attention";
      case "failed": return "failed";
      case "conflict": return "conflict";
      case "removal_pending": return "removing";
      default: return "search"; /* ended, or a state this page does not know */
    }
  }
  /* "Nov 22, 2027" (Manila time, like billing). A date-only value is kept as written; anything else is "". */
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dateOf(v) {
    if (typeof v !== "string" || !v) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m) return +m[2] >= 1 && +m[2] <= 12 ? MON[+m[2] - 1] + " " + (+m[3]) + ", " + m[1] : "";
    var t = new Date(v);
    if (isNaN(t.getTime())) return "";
    try { return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(t).replace(/[\u00a0\u202f]/g, " "); } catch (e) { return ""; }
  }
  /* "Free until <date>" for a registered domain whose answer carries free_until; "" otherwise (nothing shows). */
  function freeUntil(a) {
    var d = a && a.domain;
    if (!d || typeof d !== "object" || !Object.prototype.hasOwnProperty.call(REGISTERED, d.state)) return "";
    var t = dateOf(d.free_until != null ? d.free_until : a.free_until);
    return t ? "Free until " + t : "";
  }
  function stepOf(a) { var d = a && a.domain; return d && Object.prototype.hasOwnProperty.call(STEP_OF, d.state) ? STEP_OF[d.state] : -1; }
  function pollSeconds(a) { var d = isAnswer(a) && a.eligible && a.domain; return d && Object.prototype.hasOwnProperty.call(POLL, d.state) ? POLL[d.state] : 0; }

  /* ---------- load ---------- */

  function show() {
    var mine = ++token; stop();
    S = { site: null, answer: null, error: "", confirm: false, typed: "", off: false };
    var root = clear(byId("dm-root")); root.setAttribute("aria-busy", "true");
    add(root, h("p", "dm-meta", "Loading your website address…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      if (!res.ok) { failedPanel(); return; }
      var sites = D.sitesOf(res);
      if (!sites.length) { unavailable(); return; }
      S.site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      read(mine, false);
    });
  }
  function hide() { token++; stop(); S = null; say(""); var r = byId("dm-root"); if (r) clear(r); }
  function stop() { if (timer) { clearTimeout(timer); timer = null; } }

  /* Reads the status. `quiet`: a poll, which keeps the last screen when the read fails. */
  function read(mine, quiet) {
    D.call("GET", base(), null, true).then(function (res) {
      if (mine !== token || !S || res.status === 401) return;
      if (res.status === 404) { unavailable(); return; }
      if (!res.ok || !isAnswer(res.data)) {
        if (quiet && S.answer) { schedule(mine, 15); return; }
        failedPanel(res.status === 403 ? errText(res, "") : "");
        return;
      }
      take(mine, res.data, quiet);
    });
  }
  function take(mine, answer, quiet) {
    var changed = !quiet || JSON.stringify(answer) !== JSON.stringify(S.answer);
    S.answer = answer;
    if (changed) { render(); announce(); }
    schedule(mine, pollSeconds(answer));
  }
  function schedule(mine, seconds) {
    stop();
    if (!seconds) return;
    timer = setTimeout(function () { timer = null; if (mine === token && S) read(mine, true); }, seconds * 1000);
  }
  function announce() {
    var a = S && S.answer, d = a && a.domain, k = stage(a);
    if (k === "checking" || k === "progress" || k === "removing") say(d && typeof d.label === "string" ? d.label : "");
    else if (k === "live") say("Your website address is live.");
    else if (k === "failed" || k === "attention" || k === "conflict") say(d && typeof d.label === "string" ? d.label : "");
  }

  /* ---------- panels ---------- */

  function card(id, title, chip) {
    var s = h("section", "dm-card"); s.setAttribute("aria-labelledby", "dm-h-" + id);
    var t = h("h2", "dm-h2", title); t.setAttribute("id", "dm-h-" + id);
    add(s, add(h("div", "dm-head"), t, chip ? h("span", "chip chip-" + chip[0], chip[1]) : null));
    return s;
  }
  function failedPanel(extra) {
    stop();
    var root = clear(byId("dm-root")); root.removeAttribute("aria-busy");
    var s = card("err", "We couldn’t load your website address");
    s.setAttribute("role", "alert");
    add(s, h("p", "dm-lead", extra || "Check your connection and try again. Nothing was changed."), btn("Try again", "ghost", show));
    root.appendChild(s);
  }
  function unavailable() {
    stop();
    var root = clear(byId("dm-root")); root.removeAttribute("aria-busy");
    if (S) S.off = true;
    root.appendChild(add(card("off", "Your website address is not available yet", ["neutral", "Not available yet"]),
      h("p", "dm-lead", "It is not open for this store right now. Nothing is wrong with your account.")));
  }
  function errorLine() {
    var p = h("p", "dm-error", S.error); p.setAttribute("role", "alert"); p.hidden = !S.error;
    return p;
  }

  /* ---------- render ---------- */

  function render() {
    var root = clear(byId("dm-root")); root.removeAttribute("aria-busy");
    var a = S.answer, k = stage(a), d = a && a.domain;
    if (k === "locked") { root.appendChild(lockedCard(a)); return; }
    if (k === "checking") root.appendChild(checkingCard(d));
    else if (k === "quoted") root.appendChild(quotedCard(a, d));
    else if (k === "progress") root.appendChild(progressCard(d, a));
    else if (k === "live") root.appendChild(liveCard(d, a));
    else if (k === "attention") root.appendChild(attentionCard(d, a));
    else if (k === "failed") root.appendChild(failedCard(d));
    else if (k === "conflict") root.appendChild(conflictCard(d));
    else if (k === "removing") root.appendChild(removingCard(d));
    else root.appendChild(searchCard(a, k === "expired" ? "The check has run out of time. Check the name again." : ""));
  }

  function lockedCard(a) {
    var s = card("locked", "Your website address", ["neutral", "Locked"]);
    return add(s, h("p", "dm-lead", lockedText(a.locked_reason)), h("p", "dm-meta", LEAD));
  }

  /* The search box and "Check name". `note`: the result line of a name that did not pass (the API's reason). */
  function searchCard(a, note) {
    var s = card("search", "Find your address", ["neutral", "Free first year"]);
    var d = a && a.domain, why = note || (d && d.state === "ended" && typeof d.reason === "string" ? d.reason : "");
    add(s, h("p", "dm-lead", LEAD), h("p", "dm-meta", HOLD));
    if (a && typeof a.registered_name === "string" && a.registered_name) {
      add(s, h("p", "dm-meta", "Your registered name is " + a.registered_name + ". Check it to connect it to your store again."));
      if (!S.typed) S.typed = a.registered_name;
    }
    var f = D.el("form", { "class": "dm-form", novalidate: "" });
    var lab = h("label", "dm-label", "Website address"); lab.setAttribute("for", "dm-name");
    var extLine = extHint(a && a.extensions);
    var input = D.el("input", { type: "text", id: "dm-name", "class": "dm-input", autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: "yourbusiness.com", "aria-describedby": extLine ? "dm-hint dm-ext dm-err" : "dm-hint dm-err" });
    input.value = S.typed;
    var hint = h("p", "dm-hint", "Type the name you want. We add the ending for you if you leave it out."); hint.setAttribute("id", "dm-hint");
    var ext = extLine ? h("p", "dm-hint", extLine) : null; if (ext) ext.setAttribute("id", "dm-ext");
    var err = errorLine(); err.setAttribute("id", "dm-err");
    var go = D.el("button", { type: "submit", "class": "no-btn no-btn-primary" }, "Check name");
    add(f, lab, input, hint, ext, err);
    if (why && !S.error) { var r = h("p", "dm-result dm-result-bad", why); r.setAttribute("role", "status"); add(f, r); }
    add(f, add(h("div", "dm-actions"), go));
    f.addEventListener("submit", function (e) { e.preventDefault(); S.typed = input.value; check(go, input.value); });
    input.addEventListener("input", function () { S.typed = input.value; });
    s.appendChild(f);
    return s;
  }

  function checkingCard(d) {
    var s = card("checking", "Checking the name", ["neutral", "Checking"]);
    s.setAttribute("aria-busy", "true");
    return add(s, h("p", "dm-name", d && typeof d.name === "string" ? d.name : ""), h("p", "dm-meta", "This takes a few seconds."));
  }

  function quotedCard(a, d) {
    var s = card("quoted", "This address is available", ["ok", "Available"]);
    add(s, h("p", "dm-name", d.name), h("p", "dm-lead", LEAD), h("p", "dm-meta", HOLD));
    var y2 = yearTwo(d); if (y2) add(s, h("p", "dm-meta dm-year2", y2));
    add(s, errorLine());
    if (S.confirm) {
      var box = h("div", "dm-confirm"); box.setAttribute("role", "group"); box.setAttribute("aria-labelledby", "dm-confirm-h");
      var q = h("p", "dm-confirm-h", "Buy " + d.name + " for your store?"); q.setAttribute("id", "dm-confirm-h");
      add(box, q, h("p", "dm-meta", "You get one address for your store, so check the spelling before you confirm."));
      var yes = btn("Yes, buy it", "primary", function (b) { buy(b, d.name); });
      var no = btn("Cancel", "ghost", function () { S.confirm = false; render(); });
      add(box, add(h("div", "dm-actions"), yes, no));
      s.appendChild(box);
      setTimeout(function () { try { yes.focus(); } catch (e) { /* ignore */ } }, 0);
    } else {
      add(s, add(h("div", "dm-actions"),
        btn("Buy this address", "primary", function () { S.confirm = true; S.error = ""; render(); }),
        btn("Choose another name", "ghost", function () { S.answer = { eligible: true, locked_reason: "", extensions: a.extensions, registered_name: a.registered_name, domain: null }; S.error = ""; S.typed = d.name; render(); })));
    }
    return s;
  }

  function stepList(current) {
    var ol = h("ol", "dm-steps");
    STEPS.forEach(function (t, i) {
      var li = h("li", "dm-step" + (i < current ? " dm-done" : i === current ? " dm-now" : ""), t);
      if (i === current) li.setAttribute("aria-current", "step");
      ol.appendChild(li);
    });
    return ol;
  }
  function freeLine(a) { var t = freeUntil(a); return t ? h("p", "dm-meta dm-free", t) : null; }
  function progressCard(d, a) {
    var s = card("progress", "Setting up your address", ["neutral", "In progress"]);
    s.setAttribute("aria-busy", "true");
    add(s, h("p", "dm-name", d.name), freeLine(a), stepList(stepOf(a)), h("p", "dm-lead", typeof d.label === "string" ? d.label : ""), h("p", "dm-meta", "You can leave this page. We keep going."));
    return s;
  }

  function liveCard(d, a) {
    var s = card("live", "Your website address is live", ["ok", "Live"]);
    var www = wwwOf(d.name);
    if (www) {
      var link = D.el("a", { "class": "dm-link", href: "https://" + www, target: "_blank", rel: "noopener noreferrer" }, www);
      add(s, add(h("p", "dm-name"), link));
    } else add(s, h("p", "dm-name", d.name));
    return add(s, freeLine(a), h("p", "dm-meta", "Your store answers at this address."), h("p", "dm-meta", HOLD));
  }

  function attentionCard(d, a) {
    var s = card("attention", "Your website is not answering yet", ["warn", "Needs a look"]);
    var www = wwwOf(d.name);
    return add(s, www ? h("p", "dm-name", www) : null, freeLine(a), h("p", "dm-lead", typeof d.label === "string" && d.label ? d.label : "Your website is not answering yet."), h("p", "dm-meta", "We keep checking it."));
  }

  function failedCard(d) {
    var s = card("failed", "Something went wrong", ["danger", "Not working"]);
    add(s, d.name ? h("p", "dm-name", d.name) : null, h("p", "dm-lead", (typeof d.reason === "string" && d.reason) || (typeof d.label === "string" && d.label) || "The setup did not finish."), errorLine());
    if (d.can_retry === true) add(s, add(h("div", "dm-actions"), btn("Retry", "primary", retry)));
    return s;
  }

  function conflictCard(d) {
    var s = card("conflict", "Waiting for the NegosyoOnline team", ["warn", "With our team"]);
    return add(s, d.name ? h("p", "dm-name", d.name) : null, h("p", "dm-lead", (typeof d.reason === "string" && d.reason) || "Waiting for the NegosyoOnline team."), h("p", "dm-meta", "There is nothing for you to do right now."));
  }

  function removingCard(d) {
    var s = card("removing", "Disconnecting", ["neutral", "In progress"]);
    s.setAttribute("aria-busy", "true");
    return add(s, d.name ? h("p", "dm-name", d.name) : null, h("p", "dm-lead", typeof d.label === "string" && d.label ? d.label : "Disconnecting"));
  }

  /* ---------- actions ---------- */

  /* A failed write: show the API's message, then read the status again for the codes that mean the screen is out of date. */
  function failed(mine, res, fallback) {
    if (res.status === 404) { unavailable(); return; }
    S.error = errText(res, fallback); S.confirm = false;
    var code = res.data && res.data.code;
    if (typeof code === "string" && Object.prototype.hasOwnProperty.call(REFRESH, code)) {
      var keep = S.error;
      D.call("GET", base(), null, true).then(function (r) {
        if (mine !== token || !S || r.status === 401) return;
        if (r.status === 404) { unavailable(); return; }
        if (r.ok && isAnswer(r.data)) { S.answer = r.data; S.error = keep; render(); schedule(mine, pollSeconds(r.data)); return; }
        render();
      });
      return;
    }
    render();
    var f = byId("dm-err"); if (f && S.error) say(S.error);
  }

  function check(b, raw) {
    var mine = token, name = cleanName(raw, S.answer && S.answer.extensions);
    S.error = "";
    if (!name) { S.error = "Type the address you want, for example yourbusiness.com."; render(); var i = byId("dm-name"); if (i) i.focus(); return; }
    S.typed = name;
    busy(b, true);
    D.call("POST", base() + "check/", { name: name }, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (res.ok && isAnswer(res.data)) { S.error = ""; S.confirm = false; take(mine, res.data, false); return; }
      failed(mine, res, "We could not check that name. Please try again.");
      var i = byId("dm-name"); if (i) i.focus();
    });
  }
  function buy(b, name) {
    var mine = token;
    busy(b, true);
    D.call("POST", base() + "buy/", { name: name }, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (res.ok && isAnswer(res.data)) {
        S.error = ""; S.confirm = false; take(mine, res.data, false);
        D.toast("Requested", "We are setting up your address.");
        return;
      }
      failed(mine, res, "We could not start the purchase. Please try again.");
    });
  }
  function retry(b) {
    var mine = token;
    busy(b, true);
    D.call("POST", base() + "retry/", null, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (res.ok && isAnswer(res.data)) { S.error = ""; take(mine, res.data, false); return; }
      failed(mine, res, "We could not try again. Please try again in a moment.");
    });
  }

  window.NODomain = { show: show, hide: hide, util: { errText: errText, cleanName: cleanName, wwwOf: wwwOf, extHint: extHint, yearTwo: yearTwo, lockedText: lockedText, dateOf: dateOf, freeUntil: freeUntil, stage: stage, stepOf: stepOf, pollSeconds: pollSeconds, isAnswer: isAnswer } };
})();
