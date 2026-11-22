/* The Domains page: operators see every domain claim, with its state, its registration, its last change and the last
   "confirmed registered" request, and can retry, disconnect, cancel a request or ask for a registration to be confirmed
   (ClickUp z8uq9mhgvh, design z8uq9mcyu0, backend apps/domains/staff.py). One address, no value in it.
   The page calls the five staff routes and nothing else, with no timer. It decides nothing: the backend refuses what is wrong
   and says why in its own words; this page shows that message as it is. Buttons are drawn only where an action can apply, to
   save a round trip. A 404 from the list means the routes are switched off: "Domains is not available".
   "Confirmed registered" answers 202 "requested": a worker reads the provider later, so the result is read from the list
   (Refresh). Claims and sites are shown by public id; a state this page has no words for is shown as the fallback words, never raw.
   Nothing here shows a price or an amount. Text from the backend is set as text, never as markup. */
(function () {
  var H = window.NOHq, F = window.NOFin, $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["boot", "v-main", "v-closed", "v-down"];
  var ROUTE = "domains/";
  var NOWORDS = "A state this page has no words for";
  var LOST = "That did not go through. Refresh the list and check the claim before trying again.";
  var LOAD_ERR = "Could not load. Refresh the list.";

  /* [chip class, words] */
  var STATE = {
    checking: ["chip-neutral", "Checking the name"], quoted: ["chip-neutral", "Quoted"], confirmed: ["chip-info", "Confirmed"],
    awaiting_gate: ["chip-info", "Waiting for payment"], registering: ["chip-info", "Registering"], registered: ["chip-info", "Registered"],
    zone: ["chip-info", "Setting up DNS"], connecting: ["chip-info", "Connecting"], activating: ["chip-info", "Activating"],
    live: ["chip-ok", "Live"], attention: ["chip-warn", "Needs attention"], failed: ["chip-err", "Failed"],
    conflict: ["chip-err", "Conflict"], removal_pending: ["chip-warn", "Being removed"], ended: ["chip-neutral", "Ended"] };
  var REGISTRATION = { intent: ["chip-neutral", "Not sent"], sent: ["chip-info", "Sent"], succeeded: ["chip-ok", "Registered"],
    conflict: ["chip-err", "Conflict"] };
  var CONFIRM = { pending: ["chip-info", "Requested, waiting"], done: ["chip-ok", "Confirmed"], refused: ["chip-warn", "Refused"] };

  /* Why the worker refused a confirm request: the backend writes a short code. Known codes get a sentence, a "read_failed_" or
     "status_failed_" code a general one, "status_<state>" the provider's state in words; any other code is spaced out as plain words. */
  var CONFIRM_WHY = { not_in_conflict: "The registration is no longer in conflict.", paused: "The provider is paused.",
    provider_unavailable: "The provider is not available.", not_in_our_account: "The name is not in our registrar account." };
  function spaced(code) {
    var t = String(code).replace(/_+/g, " ").trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  }
  /* A reason that is a code (letters, digits, underscores) is spaced out; a sentence is left as written. */
  function plainReason(text) { return /^[a-z0-9_]+$/.test(text) ? spaced(text) : text; }
  function confirmWhy(code) {
    var known = own(CONFIRM_WHY, code);
    if (known) return known;
    if (/^read_failed_/.test(code)) return "The provider could not be read.";
    if (/^status_failed_/.test(code)) return "The registration status could not be read.";
    if (/^status_[a-z_]+$/.test(code)) return "The provider shows the registration as " + code.slice(7).replace(/_/g, " ") + ".";
    return plainReason(code);
  }

  var ACTIONS = {
    retry: { path: "retry/", title: "Retry this claim", go: "Retry",
      body: function (c) { return "Retry the set-up of " + label(c) + "? It goes back to setting up DNS. It never buys anything."; },
      ok: function () { return "Retry started."; } },
    disconnect: { path: "disconnect/", title: "Disconnect this domain", go: "Disconnect",
      body: function (c) { return "Disconnect " + label(c) + "? It stops being served at once and its set-up is removed. The registered domain is kept."; },
      ok: function () { return "Disconnect started. The set-up is removed in the background."; } },
    cancel: { path: "cancel-request/", title: "Cancel this request", go: "Cancel request",
      body: function (c) { return "Cancel the request for " + label(c) + "? Nothing was sent to the registrar, so nothing is bought. The name is released and the claim ends."; },
      ok: function () { return "Request cancelled."; } },
    confirm: { path: "confirmed-registered/", title: "Confirm as registered", go: "Ask for confirmation",
      body: function (c) { return "Ask for " + label(c) + " to be confirmed as registered? A background worker reads the registrar and records the result. Nothing is bought. Use this only after you checked the registrar yourself."; },
      ok: function (data) {
        return data && data.status === "pending" ? "A request is already waiting. Refresh to see its result."
          : "Requested. The registrar is read in the background. Refresh to see the result in the Confirm request column."; } } };

  var known = false, run = 0, busy = false, claims = [], eligible = [], counters = {}, filter = "all", pending = null;
  var dlg = F.dialogs(function () { return busy; });

  function stateChoices() {
    return Object.keys(STATE).map(function (k) { return [k, k === "checking" ? "Checking" : STATE[k][1]]; });
  }
  var box = F.combo($("d-state"), "Show claims in state", [["", "All states"], ["all", "All states"]].concat(stateChoices()), "d-err",
    function (value) { filter = value || "all"; paint(); });
  $("d-state").value = "all";
  box.sync();

  function show(view) { VIEWS.forEach(function (id) { $(id).hidden = id !== view; }); }
  function own(map, key) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function str(v) { return typeof v === "string" ? v : ""; }
  function chip(map, key) {
    var m = own(map, key);
    return F.el("span", "chip " + (m ? m[0] : "chip-warn"), m ? m[1] : NOWORDS);
  }
  function button(text) { var b = F.el("button", "no-btn no-btn-ghost", text); b.setAttribute("type", "button"); return b; }
  function call(path, body) { return H.call("POST", ROUTE + path, body); }
  function label(c) { return c.name ? c.name : "this claim of " + (c.store || c.site); }
  /* The store's name: `site_name` on a claim row. Empty when the backend sent none (the id stands in). */
  function storeName(o) { return str(o.site_name); }
  /* "Nov 22, 4:51 PM": the Manila time without the year, on one line. */
  function short(iso) { return F.stamp(iso).replace(/, \d{4}(?=,)/, ""); }

  /* ---- the table ---- */

  function cell(content, cls) {
    var td = F.el("td", cls || "");
    if (content && typeof content === "object") td.appendChild(content);
    else td.textContent = content || "—";
    return td;
  }
  /* A main line and a small grey line, each on one line with an ellipsis; the full text is in title. */
  function stack(main, small, smallTitle) {
    var b = F.el("div", "dm-stack"), m = F.el("span", "lc-id", main), t;
    m.setAttribute("title", main);
    b.appendChild(m);
    if (small) {
      t = F.el("small", "", small);
      t.setAttribute("title", smallTitle || small);
      b.appendChild(t);
    }
    return b;
  }
  /* The status cell: the state and registration chips side by side, the reason, the last confirm request (only when there is
     one: its chip, then the refusal in words and the time) and the short last-change date in small grey text. */
  function statusCell(c) {
    var b = F.el("div", "dm-status"), top = F.el("div", "dm-chips"), k = obj(c.confirm), why, line, note;
    top.appendChild(chip(STATE, c.state));
    if (c.registration) top.appendChild(chip(REGISTRATION, c.registration));
    b.appendChild(top);
    if (plainReason(c.reason)) b.appendChild(F.el("small", "", plainReason(c.reason)));
    if (own(CONFIRM, k.state)) {
      line = F.el("div", "dm-chips");
      line.appendChild(chip(CONFIRM, k.state));
      why = k.state === "refused" ? confirmWhy(str(k.reason)) : "";
      note = [why, short(k.at)].filter(Boolean).join(" · ");
      if (note) line.appendChild(F.el("small", "", note));
      b.appendChild(line);
    }
    if (short(c.state_changed_at)) b.appendChild(F.el("small", "", short(c.state_changed_at)));
    return b;
  }

  function act(c, key, text) {
    var b = button(text);
    b.addEventListener("click", function () { openAction(key, c, b); });
    return b;
  }
  function actions(c) {
    var td = F.el("td", "lc-act"), row = F.el("div", "lc-btns dm-btns");
    if (c.state === "failed") row.appendChild(act(c, "retry", "Retry"));
    if (c.registration === "intent") row.appendChild(act(c, "cancel", "Cancel request"));
    if (c.registration === "conflict" && obj(c.confirm).state !== "pending") row.appendChild(act(c, "confirm", "Confirmed registered"));
    if (c.state !== "removal_pending" && c.state !== "ended") row.appendChild(act(c, "disconnect", "Disconnect"));
    td.appendChild(row);
    return td;
  }

  function claimRow(c) {
    var tr = F.el("tr", ""), name = c.name, regName = c.registration_name, labels = ["Store", "Domain", "Status"];
    var domain = name ? stack(name, regName && regName !== name ? "Registered as " + regName : "") : regName ? stack(regName, "") : "";
    tr.appendChild(cell(c.store ? stack(c.store, c.site, c.site + " · " + c.claim) : stack(c.site, "", c.site + " · " + c.claim), "dm-trunc"));
    tr.appendChild(cell(domain, "dm-trunc"));
    tr.appendChild(cell(statusCell(c), "dm-st"));
    tr.appendChild(actions(c));
    /* The phone layout stacks each row and names each value by the column it is in. */
    Array.prototype.slice.call(tr.children).forEach(function (td, i) { if (labels[i]) td.setAttribute("data-label", labels[i]); });
    return tr;
  }

  function clean(list) {
    return arr(list).filter(function (c) { return c && typeof c.claim === "string" && typeof c.site === "string"; }).map(function (c) {
      return { claim: c.claim, site: c.site, store: storeName(c), name: str(c.name), state: str(c.state), reason: str(c.reason), state_changed_at: str(c.state_changed_at),
        registration: str(c.registration), registration_name: str(c.registration_name), confirm: obj(c.confirm).state ? obj(c.confirm) : null };
    });
  }

  function paint() {
    var body = $("d-rows"), shown = claims.filter(function (c) { return filter === "all" || c.state === filter; }), facts = [], list;
    body.textContent = "";
    shown.forEach(function (c) { body.appendChild(claimRow(c)); });
    $("d-wrap").hidden = shown.length === 0;
    $("d-empty").textContent = claims.length ? "No claim is in that state." : "No domain claims yet.";
    $("d-empty").hidden = shown.length > 0;
    $("d-loading").hidden = true;
    if (typeof counters.purchases_24h === "number") {
      facts.push("Purchases in the last 24 hours: " + counters.purchases_24h + (typeof counters.purchase_cap === "number" ? " of " + counters.purchase_cap : ""));
    }
    if (typeof counters.purchase_enabled === "boolean") facts.push(counters.purchase_enabled ? "Buying is switched on" : "Buying is switched off");
    $("d-facts").textContent = facts.join(" · ");
    $("d-facts").hidden = !facts.length;
    list = $("d-elig");
    list.textContent = "";
    eligible.forEach(function (e) {
      var li = F.el("li", "");
      li.appendChild(F.el("span", "lc-id", e.name || e.id));
      if (e.name) li.appendChild(F.el("small", "", e.id));
      list.appendChild(li);
    });
    $("d-elig-card").hidden = !eligible.length;
  }

  /* ---- loading ---- */

  function take(data) {
    var d = obj(data);
    claims = clean(d.claims);
    /* Each is {id, name}; an older answer is a plain id string. */
    eligible = arr(d.eligible_sites).map(function (s) {
      if (typeof s === "string") return s ? { id: s, name: "" } : null;
      var o = obj(s), id = str(o.id);
      return id ? { id: id, name: str(o.name) } : null;
    }).filter(Boolean);
    counters = obj(d.counters);
  }

  function load(first) {
    var mine = ++run;
    if (first) show("boot");
    $("d-loading").hidden = claims.length > 0;
    call("list/").then(function (res) {
      if (mine !== run) return;
      if (F.left(res)) return;
      if (res.status === 404) { show("v-closed"); return; }
      if (!res.ok) {
        if (first || !known) { show("v-down"); return; }
        F.say("d-err", LOAD_ERR);
        return;
      }
      known = true;
      F.say("d-err", "");
      take(res.data);
      show("v-main");
      paint();
    });
  }

  /* ---- one action behind a confirm dialog ---- */

  function lock(on) {
    busy = on;
    ["act-go", "act-x", "act-cancel"].forEach(function (id) { $(id).disabled = on; });
  }
  function openAction(key, claim, from) {
    var a = own(ACTIONS, key);
    if (busy || !a) return;
    pending = { key: key, claim: claim };
    $("m-act-h").textContent = a.title;
    $("m-act-sub").textContent = a.body(claim);
    $("act-go").textContent = a.go;
    F.say("act-e", "");
    dlg.open("m-act", from, $("act-cancel"));
  }
  function go() {
    var p = pending, a = p && own(ACTIONS, p.key);
    if (busy || !a) return;
    F.say("act-e", "");
    lock(true);
    call(a.path, { claim: p.claim.claim }).then(function (res) {
      lock(false);
      if (F.left(res)) return;
      if (res.ok) {
        dlg.close(false);
        pending = null;
        F.say("d-msg", a.ok(res.data));
        load(false);
        return;
      }
      /* A 404 with no error code: the routes were switched off (or the claim is gone). The list says which. */
      if (res.status === 404) { dlg.close(false); pending = null; F.say("d-msg", ""); load(false); return; }
      /* The backend's own refusal, as it wrote it; a server fault or no answer gets the plain line. */
      F.say("act-e", res.message && res.status >= 400 && res.status < 500 ? res.message : LOST);
      $("act-cancel").focus();
    });
  }

  /* ---- wiring ---- */

  $("act-go").addEventListener("click", go);
  ["act-x", "act-cancel"].forEach(function (id) { $(id).addEventListener("click", function () { if (!busy) { pending = null; dlg.close(true); } }); });
  $("d-refresh").addEventListener("click", function () {
    if (busy) return;
    F.say("d-msg", "");
    load(false);
  });

  /* Who is signed in comes from me/, the staff route that answers it; the domains routes do not. */
  function start() {
    show("boot");
    if (known) { load(true); return; }
    H.call("GET", "me/").then(function (res) {
      if (F.left(res)) return;
      if (!res.ok) { show("v-down"); return; }
      window.NOHqShell.signedIn(res.data.email);
      known = true;
      load(true);
    });
  }
  $("retry").addEventListener("click", start);
  start();
})();
