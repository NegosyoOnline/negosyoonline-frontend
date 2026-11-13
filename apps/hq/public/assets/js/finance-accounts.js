/* The Receiving accounts page (Billing HQ-RA, ClickUp z8uq9metz0, plan section 5). The accounts Subscribers are told
   to pay into by bank transfer: a status line that says whether Subscribers can pay and, if not, why; the list with an
   Active switch and an Edit button per account; an Add an account form. Four routes, all POST with the path only:
   finance/accounts/list/, add/, edit/ and active/. The page decides nothing: the backend does, and the page follows
   its answer and shows its refusals in words. Nothing is stored in the browser and no value is in an address. */
(function () {
  var H = window.NOHq, F = window.NOFin, $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["boot", "v-main", "v-closed", "v-down"];
  var KIND = { bank: "Bank", ewallet: "E-wallet" };
  var LOST = "That did not go through. Check the page before trying again.";
  var LAST = "Add the new account first, then switch this one off.";
  var EXISTS = "That account is already listed. Edit or reactivate that account instead.";
  var HINT = { account_number: "Use 6 to 40 digits; spaces and dashes are allowed.", sort_order: "Use a whole number from 0 to 999." };
  var NAME = { kind: "Type", provider_name: "Bank or e-wallet name", account_name: "Account name", account_number: "Account number", sort_order: "Order" };

  var loadRun = 0, busy = false, known = false, editing = null;
  var dlg = F.dialogs(function () { return busy; });

  function show(view) { VIEWS.forEach(function (id) { $(id).hidden = id !== view; }); }

  /* The error of one field sits under it (a role=alert line the page makes); typing in the field takes it away. */
  function fieldError(id, text) {
    var input = $(id), eid = id + "-e", p = $(eid);
    if (!p) {
      p = F.el("p", "field-err");
      p.setAttribute("id", eid);
      p.setAttribute("role", "alert");
      input.parentNode.appendChild(p);
    }
    p.textContent = text;
    p.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", eid);
  }
  function clearField(id) {
    var p = $(id + "-e");
    if (p) { p.textContent = ""; p.hidden = true; }
    $(id).removeAttribute("aria-invalid");
    $(id).removeAttribute("aria-describedby");
  }
  function flagFields(ids, bad) {
    ids.forEach(clearField);
    bad.forEach(function (b) { fieldError(b[0], b[1]); });
    if (bad.length) $(bad[0][0]).focus();
  }

  /* One set of fields for the Add form (n-) and one for the Edit dialog (e-). */
  var SETS = {
    n: { ids: ["n-kind", "n-provider", "n-name", "n-number", "n-order"], err: "n-err" },
    e: { ids: ["e-kind", "e-provider", "e-name", "e-number", "e-order"], err: "e-err" }
  };
  var KEY = ["kind", "provider_name", "account_name", "account_number", "sort_order"];
  function keyOf(set, id) { return KEY[SETS[set].ids.indexOf(id)]; }
  SETS.n.ids.concat(SETS.e.ids).forEach(function (id) {
    $(id).addEventListener("input", function () { clearField(id); });
    $(id).addEventListener("change", function () { clearField(id); });
  });

  /* A refusal's field errors: the fields this page has get their own line. */
  function refusal(set, res) {
    var s = SETS[set], bad;
    if (res.status === 409 && res.code === "account_exists") { F.say(s.err, EXISTS); return; }
    if (res.status === 409 && res.code === "last_active_account") { F.say(s.err, LAST); return; }
    if (res.status === 400 && res.code === "invalid_request") {
      bad = s.ids.filter(function (id) { return Object.prototype.hasOwnProperty.call(res.fields || {}, keyOf(set, id)); })
        .map(function (id) { return [id, HINT[keyOf(set, id)] || "Check the " + NAME[keyOf(set, id)].toLowerCase() + "."]; });
      F.say(s.err, bad.length ? "Check these fields: " + bad.map(function (b) { return NAME[keyOf(set, b[0])]; }).join(", ") + "." : "Check the values and try again.");
      flagFields(s.ids, bad);
      return;
    }
    F.say(s.err, LOST);
  }

  /* ---- the status line ---- */

  function status(b) {
    var why = [];
    if (!b || typeof b !== "object") return "";
    if (b.live === true) return "Subscribers can pay by bank transfer.";
    if (b.switch_on !== true) why.push("the bank transfer switch is off");
    if (!(typeof b.active_accounts === "number" && b.active_accounts > 0)) why.push("no account is active");
    if (b.store_available !== true) why.push("the proof store is not available");
    return "Subscribers cannot pay by bank transfer yet" + (why.length ? ": " + why.join("; ") + "." : ".");
  }

  /* ---- the list ---- */

  function row(a) {
    var li = F.el("li", "batch"), main = F.el("div", "batch-main"), title = F.el("div", "batch-title"), end = F.el("div", "batch-end");
    var sw = F.el("button", "sw"), label = F.el("span", "sw-l"), edit = F.el("button", "no-btn no-btn-ghost", "Edit");
    var note = F.el("p", "field-err batch-note");
    note.setAttribute("role", "alert");
    note.hidden = true;
    title.appendChild(F.el("span", "", (F.words(KIND, a.kind) || "Account") + ", " + (a.provider_name || "")));
    main.appendChild(title);
    main.appendChild(F.el("span", "item-sub", (a.account_name || "") + " · " + (a.account_number || "")));
    main.appendChild(F.el("span", "small", "Order " + (typeof a.sort_order === "number" ? a.sort_order : 0)));
    function paint(on) {
      sw.setAttribute("aria-checked", String(on));
      label.textContent = on ? "Active" : "Not active";
    }
    sw.setAttribute("type", "button");
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-label", "Active, " + (a.provider_name || "") + " " + (a.account_number || ""));
    sw.appendChild(F.el("span", "sw-track")).setAttribute("aria-hidden", "true");
    sw.appendChild(label);
    paint(a.active === true);
    sw.addEventListener("click", function () {
      if (sw.disabled || busy) return;
      var was = sw.getAttribute("aria-checked") === "true";
      sw.disabled = true;
      F.say("a-msg", "");
      note.textContent = "";
      note.hidden = true;
      H.call("POST", "finance/accounts/active/", { account: a.id, active: !was }).then(function (res) {
        sw.disabled = false;
        if (F.left(res)) return;
        if (res.ok) { paint(res.data.active === true); load(); return; }
        paint(was);
        if (res.status === 404) { load(); return; }
        /* The refusal sits under this account's own switch, so it is seen where the switch was tapped. */
        note.textContent = res.status === 409 && res.code === "last_active_account" ? LAST : LOST;
        note.hidden = false;
        sw.focus();
      });
    });
    edit.setAttribute("type", "button");
    edit.setAttribute("aria-haspopup", "dialog");
    edit.addEventListener("click", function () { openEdit(a, edit); });
    end.appendChild(sw);
    end.appendChild(edit);
    li.appendChild(main);
    li.appendChild(end);
    li.appendChild(note);
    return li;
  }

  function load(message) {
    var run = ++loadRun;
    H.call("POST", "finance/accounts/list/", {}).then(function (res) {
      if (run !== loadRun) return;
      if (F.left(res)) return;
      if (res.status === 404) { show("v-closed"); return; }
      if (!res.ok) { show("v-down"); return; }
      var items = Array.isArray(res.data.items) ? res.data.items : [];
      $("accounts").textContent = "";
      items.forEach(function (a) { if (a && typeof a.id === "string") $("accounts").appendChild(row(a)); });
      $("a-empty").hidden = $("accounts").children.length > 0;
      F.say("a-status", status(res.data.bank_transfer));
      if (message != null) F.say("a-msg", message);
      show("v-main");
    });
  }

  /* ---- Add an account ---- */

  function toggleForm(on) {
    $("f-acc").hidden = !on;
    $("acc-open").setAttribute("aria-expanded", String(on));
    if (on) $("n-kind").focus(); else $("acc-open").focus();
  }
  $("acc-open").addEventListener("click", function () {
    SETS.n.ids.forEach(function (id) { $(id).value = ""; clearField(id); });
    F.say("n-err", "");
    toggleForm($("f-acc").hidden);
  });
  $("n-cancel").addEventListener("click", function () { toggleForm(false); });
  $("f-acc").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    var v = {}, bad = [], body;
    SETS.n.ids.forEach(function (id) { v[id] = String($(id).value || "").trim(); });
    [["n-kind", "Choose a type."], ["n-provider", "Bank or e-wallet name is required."], ["n-name", "Account name is required."],
      ["n-number", "Account number is required."]].forEach(function (c) { if (!v[c[0]]) bad.push([c[0], c[1]]); });
    if (v["n-order"] && !/^\d{1,3}$/.test(v["n-order"])) bad.push(["n-order", "Order is a whole number."]);
    F.say("n-err", bad.length ? "Fill in every required field." : "");
    flagFields(SETS.n.ids, bad);
    if (bad.length) return;
    body = { kind: v["n-kind"], provider_name: v["n-provider"], account_name: v["n-name"], account_number: v["n-number"] };
    if (v["n-order"]) body.sort_order = Number(v["n-order"]);
    busy = true;
    $("n-go").disabled = true;
    H.call("POST", "finance/accounts/add/", body).then(function (res) {
      busy = false;
      $("n-go").disabled = false;
      if (F.left(res)) return;
      if (res.ok) {
        SETS.n.ids.forEach(function (id) { $(id).value = ""; });
        toggleForm(false);
        load("Account added.");
        return;
      }
      if (res.status === 404) { show("v-closed"); return; }
      refusal("n", res);
    });
  });

  /* ---- Edit ---- */

  function openEdit(a, from) {
    if (busy) return;
    editing = a;
    $("e-kind").value = a.kind || "bank";
    $("e-provider").value = a.provider_name || "";
    $("e-name").value = a.account_name || "";
    $("e-number").value = a.account_number || "";
    $("e-order").value = String(typeof a.sort_order === "number" ? a.sort_order : 0);
    SETS.e.ids.forEach(clearField);
    F.say("e-err", "");
    $("edit-sub").textContent = (a.provider_name || "") + ", " + (a.account_name || "") + ".";
    dlg.open("m-edit", from, $("e-provider"));
  }
  function lock(on) {
    busy = on;
    ["e-go", "edit-x", "e-cancel"].forEach(function (id) { $(id).disabled = on; });
  }
  ["edit-x", "e-cancel"].forEach(function (id) { $(id).addEventListener("click", function () { if (!busy) dlg.close(true); }); });
  $("edit-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || !editing) return;
    var v = {}, bad = [], body = { account: editing.id }, changed = false, was = {
      kind: editing.kind, provider_name: editing.provider_name, account_name: editing.account_name,
      account_number: editing.account_number, sort_order: typeof editing.sort_order === "number" ? editing.sort_order : 0 };
    SETS.e.ids.forEach(function (id) { v[id] = String($(id).value || "").trim(); });
    [["e-provider", "Bank or e-wallet name is required."], ["e-name", "Account name is required."], ["e-number", "Account number is required."]]
      .forEach(function (c) { if (!v[c[0]]) bad.push([c[0], c[1]]); });
    if (!/^\d{1,3}$/.test(v["e-order"])) bad.push(["e-order", "Order is a whole number."]);
    F.say("e-err", bad.length ? "Fill in every required field." : "");
    flagFields(SETS.e.ids, bad);
    if (bad.length) return;
    SETS.e.ids.forEach(function (id) {
      var key = keyOf("e", id), value = key === "sort_order" ? Number(v[id]) : v[id];
      if (value !== was[key]) { body[key] = value; changed = true; }
    });
    if (!changed) { dlg.close(false); load("No changes to save."); return; }
    lock(true);
    H.call("POST", "finance/accounts/edit/", body).then(function (res) {
      lock(false);
      if (F.left(res)) return;
      if (res.ok) { dlg.close(false); load("Account saved."); return; }
      if (res.status === 404) { dlg.close(false); load("That account is no longer there."); return; }
      refusal("e", res);
    });
  });

  /* Who is signed in comes from me/, the staff route that answers it; the Finance routes do not. */
  function start() {
    show("boot");
    if (known) { load(); return; }
    H.call("GET", "me/").then(function (res) {
      if (F.left(res)) return;
      if (!res.ok) { show("v-down"); return; }
      known = true;
      window.NOHqShell.signedIn(res.data.email);
      load();
    });
  }
  $("retry").addEventListener("click", start);
  start();
})();
