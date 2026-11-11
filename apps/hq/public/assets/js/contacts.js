/* The Contacts pages: the list, one contact, the groups and the two-step CSV upload (plan 7, ClickUp z8uq9me128).
   One document serves four addresses (/contacts/, /contacts/new/, /contacts/groups/, /contacts/upload/); none
   holds a value. An existing contact has no address: it opens inside the list page, its id held in memory, and
   Back closes it. The page decides nothing about access: the backend does, and the page follows its answer.
   Nothing is stored in the browser. A number the person types to Find is cleared from the field after the call
   and is never written to the page; the file's text lives in a variable until the save or until the person
   leaves. A name or a group name is only ever written with textContent. */
(function () {
  var H = window.NOHq, $ = function (id) { return document.getElementById(id); };
  var BOOT = ["boot", "v-page", "v-closed", "v-down"];
  var INNER = ["v-list", "v-form", "v-groups", "v-upload"];
  var DOWN = "That did not go through. Check the list before trying again.";
  var MAX_FILE = 1048576;
  /* The four reasons the backend gives for a refused line, in words, keyed on its sentences. */
  var REASONS = {
    "This line has fewer than three columns.": "Fewer than three columns",
    "The first name is missing or too long.": "First name missing or too long",
    "The last name is too long.": "Last name too long",
    "The mobile number is not a Philippine mobile.": "Not a Philippine mobile number"
  };

  var change = false, groups = [];
  var items = [], cursor = null, activeQuery = "", listRun = 0;
  var editId = null, formMode = "add", pushed = false, formOpen = false;
  var dialog = null, opener = null, popRun = null, busy = false;
  var csvText = null, checked = null, checkedGroup = "";
  var existing = null;     /* the id of the contact that already has the number typed, from the 409 */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.setAttribute("class", cls);
    if (text != null) n.textContent = text;
    return n;
  }
  function say(id, text) { $(id).textContent = text || ""; $(id).hidden = !text; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function words(map, key) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : ""; }
  function text(v) { return typeof v === "string" ? v : ""; }
  function fieldMessage(res, name) {
    var f = res.fields && res.fields[name];
    return Array.isArray(f) && typeof f[0] === "string" ? f[0] : "";
  }
  function showBoot(view) { BOOT.forEach(function (id) { $(id).hidden = id !== view; }); }
  function showInner(view) {
    INNER.forEach(function (id) { $(id).hidden = id !== view; });
    $("seg-row").hidden = !(view === "v-list" || view === "v-groups");
    $("list-actions").hidden = !(view === "v-list" && change);
    $("g-form").hidden = !change;
    $("back").hidden = !(view === "v-form" || view === "v-upload");
    $("seg-contacts").setAttribute("aria-current", view === "v-groups" ? "false" : "true");
    $("seg-groups").setAttribute("aria-current", view === "v-groups" ? "true" : "false");
    $("title").textContent = view === "v-form" ? (formMode === "edit" ? "Edit contact" : "Add contact") : view === "v-upload" ? "Upload contacts" : "Contacts";
  }
  /* True when the answer sent the person to sign in or to the second step. */
  function left(res) {
    var place = H.placeFor(res);
    if (place === "verify") { location.replace("/verify/"); return true; }
    if (place === "sign-in") { location.replace("/sign-in/"); return true; }
    return false;
  }
  function name(c) { return (text(c.first_name) + " " + text(c.last_name)).trim(); }
  function groupName(id) {
    for (var i = 0; i < groups.length; i++) if (groups[i].id === id) return groups[i].name;
    return "";
  }
  /* The groups as this page holds them: its own copies, with only the fields it uses. */
  function own(list) {
    return list.filter(function (g) { return g && typeof g.id === "string"; })
      .map(function (g) { return { id: g.id, name: text(g.name), count: typeof g.count === "number" ? g.count : 0 }; });
  }
  function sortGroups() {
    groups.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0; });
  }
  function option(value, label) { var o = el("option", "", label); o.setAttribute("value", value); return o; }
  function fillSelect(sel, first) {
    var keep = sel.value;
    sel.textContent = "";
    if (first) sel.appendChild(option("", first));
    groups.forEach(function (g) { sel.appendChild(option(g.id, g.name)); });
    sel.value = groupName(keep) ? keep : "";
  }

  /* ---- one decision at a time: the pop-up (Coach Ed's rule: no Cancel, a full-width primary, X, Escape) ---- */

  /* Every element under box that passes test (childNodes works in a browser and in the test page). */
  function all(box, test) {
    var out = [];
    (function walk(n) {
      for (var i = 0; i < n.childNodes.length; i++) {
        var c = n.childNodes[i];
        if (c.tagName) { if (test(c)) out.push(c); walk(c); }
      }
    })(box);
    return out;
  }
  function focusables(box) {
    return all(box, function (n) { return (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "BUTTON") && !n.disabled && !n.hidden; });
  }
  function inside(box, n) { for (; n; n = n.parentNode) if (n === box) return true; return false; }
  function onKey(e) {
    if (!dialog) return;
    if (e.key === "Escape") { if (!busy) closePop(true); return; }
    if (e.key !== "Tab") return;
    var f = focusables(dialog), first = f[0], last = f[f.length - 1], at = document.activeElement;
    if (!f.length) { e.preventDefault(); return; }
    if (!inside(dialog, at)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  }
  /* title, sub, go: the words; run: what the primary button does (it gets done(), fail(text)). */
  function openPop(from, title, sub, go, run) {
    opener = from;
    popRun = run;
    $("pop-h").textContent = title;
    $("pop-sub").textContent = sub;
    $("pop-go").textContent = go;
    say("pop-err", "");
    dialog = $("m-pop");
    dialog.hidden = false;
    document.body.classList.add("modal-open");
    document.addEventListener("keydown", onKey);
    $("pop-go").focus();
  }
  function closePop(refocus) {
    if (!dialog) return;
    dialog.hidden = true;
    dialog = null;
    popRun = null;
    document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", onKey);
    if (refocus && opener && !opener.hidden) opener.focus();
  }
  function lock(on) { busy = on; $("pop-go").disabled = on; $("pop-x").disabled = on; }
  $("pop-x").addEventListener("click", function () { if (!busy) closePop(true); });
  $("pop-go").addEventListener("click", function () {
    if (busy || !popRun) return;
    lock(true);
    say("pop-err", "");
    popRun(function () { lock(false); closePop(false); }, function (msg) { lock(false); say("pop-err", msg); });
  });

  /* ---- the list ---- */

  function rowFor(c) {
    var li = el("li", "batch"), main = el("div", "batch-main"), end = el("div", "batch-end"), strip = el("span", "strip");
    var b = el("button", "no-btn no-btn-ghost", change ? "Edit" : "View");
    var gs = Array.isArray(c.groups) ? c.groups : [];
    main.appendChild(el("span", "batch-title", name(c)));
    main.appendChild(el("span", "item-sub num", text(c.mobile)));
    if (gs.length) gs.forEach(function (g) { strip.appendChild(el("span", "chip chip-neutral", text(g && g.name))); });
    else strip.appendChild(el("span", "small", "No group"));
    main.appendChild(strip);
    b.setAttribute("type", "button");
    b.addEventListener("click", function () { openContact(c.id, b); });
    end.appendChild(b);
    li.appendChild(main);
    li.appendChild(end);
    return li;
  }
  function renderRows() {
    $("rows").textContent = "";
    items.forEach(function (c) { $("rows").appendChild(rowFor(c)); });
    var none = !items.length;
    var filtered = !!(activeQuery || $("find-group").value);
    say("l-empty", none ? (filtered ? "No contacts match." : "No contacts yet.") : "");
    $("l-foot").hidden = none;
    $("l-count").textContent = "Showing " + plural(items.length, "contact", "contacts") + ". Numbers are masked.";
    $("more-row").hidden = !cursor;
    $("find-note").hidden = !activeQuery;
  }
  function loadList(more) {
    var run = ++listRun, body = {}, g = $("find-group").value;
    if (activeQuery) body.query = activeQuery;
    if (g) body.group = g;
    if (more && cursor) body.cursor = cursor;
    if (!more) { items = []; cursor = null; $("rows").textContent = ""; say("l-empty", ""); $("l-foot").hidden = true; }
    $("l-loading").hidden = false;
    $("more").disabled = true;
    return H.call("POST", "contacts/list/", body).then(function (res) {
      if (run !== listRun) return;
      $("l-loading").hidden = true;
      $("more").disabled = false;
      if (left(res)) return;
      if (!res.ok) { showBoot("v-down"); return; }
      var d = res.data, got = Array.isArray(d.results) ? d.results : [];
      got.forEach(function (c) { if (c && typeof c.id === "string") items.push(c); });
      cursor = typeof d.next === "string" && d.next ? d.next : null;
      renderRows();
    });
  }
  function toList(message) {
    formOpen = false;
    editId = null;
    clearForm();
    showInner("v-list");
    say("msg", message);
    loadList(false);
  }

  $("find-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = String($("find-q").value || "").trim();
    $("find-q").value = "";
    if (q.length < 2) { say("find-err", "Type at least 2 letters or a full number."); return; }
    say("find-err", "");
    activeQuery = q;
    loadList(false);
  });
  $("show-all").addEventListener("click", function () { activeQuery = ""; say("find-err", ""); loadList(false); });
  $("find-group").addEventListener("change", function () { loadList(false); });
  $("more").addEventListener("click", function () { if (cursor) loadList(true); });

  /* ---- one contact ---- */

  function clearForm() {
    ["c-first", "c-last", "c-num"].forEach(function (id) { $(id).value = ""; });
    $("c-groups").textContent = "";
    ["c-first-err", "c-last-err", "c-num-err", "c-groups-err", "c-err"].forEach(function (id) { say(id, ""); });
    $("c-existing").hidden = true;
    existing = null;
  }
  function boxes(checkedIds) {
    var legend = el("legend", "", "Groups");
    $("c-groups").textContent = "";
    $("c-groups").appendChild(legend);
    groups.forEach(function (g) {
      var label = el("label"), box = el("input");
      box.setAttribute("type", "checkbox");
      box.setAttribute("value", g.id);
      box.checked = checkedIds.indexOf(g.id) >= 0;
      box.disabled = !change;
      label.appendChild(box);
      label.appendChild(el("span", "", g.name));
      $("c-groups").appendChild(label);
    });
  }
  function showForm(mode, c) {
    formMode = mode;
    formOpen = true;
    clearForm();
    existing = null;
    editId = c ? c.id : null;
    $("c-first").value = c ? text(c.first_name) : "";
    $("c-last").value = c ? text(c.last_name) : "";
    $("c-num").value = c ? text(c.mobile) : "";
    boxes(c && Array.isArray(c.groups) ? c.groups.map(function (g) { return g.id; }) : []);
    ["c-first", "c-last", "c-num"].forEach(function (id) { $(id).disabled = !change; });
    $("c-save").hidden = !change;
    $("c-delete").hidden = !(change && mode === "edit");
    $("c-ro").hidden = change;
    $("c-recorded").hidden = mode !== "edit";
    say("msg", "");
    showInner("v-form");
    $("back").setAttribute("href", "/contacts/");
  }
  function openContact(id, from) {
    if (typeof id !== "string") return Promise.resolve();
    return H.call("POST", "contacts/open/", { contact: id }).then(function (res) {
      if (left(res)) return;
      if (res.status === 404) { toList("That contact is no longer available."); return; }
      if (!res.ok) { say("msg", DOWN); return; }
      showForm("edit", res.data);
      if (!pushed) {
        /* Opened from the add form (the existing-contact button): the add address is not kept as the place to go back to. */
        if (location.pathname.indexOf("/contacts/new") === 0) history.replaceState(null, "", "/contacts/");
        history.pushState(null, "", location.pathname);
        pushed = true;
      }
    });
  }
  /* Leaving the form: the address entry made for it is taken back, and the list shows with the message. */
  function leaveForm(message) {
    var was = pushed;
    pushed = false;
    toList(message);
    if (was && history.back) history.back();
    else if (!was && location.pathname.indexOf("/contacts/new") === 0) history.replaceState(null, "", "/contacts/");
  }
  window.addEventListener("popstate", function () {
    if (formOpen && formMode === "edit") { pushed = false; closePop(false); toList(""); }
  });
  $("back").addEventListener("click", function (e) {
    if (formMode === "add" && !pushed && location.pathname.indexOf("/contacts/new") === 0) return; /* a plain link back */
    if (!formOpen) return;
    e.preventDefault();
    leaveForm("");
  });

  function formFail(res) {
    if (left(res)) return;
    if (res.status === 404) { leaveForm("That contact is no longer available."); return; }
    if (res.code === "invalid_request") {
      var shown = false;
      [["first_name", "c-first-err"], ["last_name", "c-last-err"], ["mobile", "c-num-err"], ["groups", "c-groups-err"]].forEach(function (p) {
        var m = fieldMessage(res, p[0]);
        if (m) { say(p[1], m); shown = true; }
      });
      if (!shown) say("c-err", res.message || DOWN);
      return;
    }
    if (res.code === "already_exists") {
      say("c-num-err", "That number is already a contact.");
      existing = res.fields && typeof res.fields.contact === "string" ? res.fields.contact : null;
      $("c-existing").hidden = !existing;
      return;
    }
    if (res.code === "forbidden" || res.code === "group_limit") { say("c-err", res.message || DOWN); return; }
    say("c-err", DOWN);
  }
  $("c-existing").addEventListener("click", function () {
    var id = existing;
    if (id) openContact(id, $("c-existing"));
  });
  $("c-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!change || busy) return;
    ["c-first-err", "c-last-err", "c-num-err", "c-groups-err", "c-err"].forEach(function (id) { say(id, ""); });
    $("c-existing").hidden = true;
    var first = String($("c-first").value || "").trim(), mobile = String($("c-num").value || "").trim(), bad = false;
    if (!first) { say("c-first-err", "Enter a first name."); bad = true; }
    if (!mobile) { say("c-num-err", "Enter a mobile number."); bad = true; }
    if (bad) return;
    var body = { first_name: first, last_name: String($("c-last").value || "").trim(), mobile: mobile,
      groups: all($("c-groups"), function (n) { return n.tagName === "INPUT" && n.checked; }).map(function (n) { return n.getAttribute("value"); }) };
    var edit = formMode === "edit" && editId;
    if (edit) body.contact = editId;
    busy = true;
    $("c-save").disabled = true;
    H.call("POST", edit ? "contacts/edit/" : "contacts/add/", body).then(function (res) {
      busy = false;
      $("c-save").disabled = false;
      if (!res.ok) { formFail(res); return; }
      $("c-num").value = "";
      leaveForm(edit ? "Contact saved." : "Contact added.");
    });
  });
  $("c-delete").addEventListener("click", function () {
    if (!change || !editId) return;
    openPop($("c-delete"), "Delete this contact?", "Its name, number and group memberships are removed now. This cannot be undone.", "Delete contact", function (done, fail) {
      H.call("POST", "contacts/delete/", { contact: editId }).then(function (res) {
        if (res.ok) { done(); leaveForm("Contact deleted."); return; }
        if (left(res)) return;
        if (res.status === 404) { done(); leaveForm("That contact is no longer available."); return; }
        fail(res.code === "forbidden" && res.message ? res.message : DOWN);
      });
    });
  });

  /* ---- the groups ---- */

  function groupRow(g) {
    var li = el("li", "batch"), main = el("div", "batch-main"), end = el("div", "batch-end");
    main.appendChild(el("span", "batch-title", g.name));
    main.appendChild(el("span", "item-sub", plural(g.count || 0, "contact", "contacts")));
    li.appendChild(main);
    if (change) {
      var rn = el("button", "no-btn no-btn-ghost", "Rename"), rm = el("button", "no-btn no-btn-ghost stop", "Remove");
      rn.setAttribute("type", "button");
      rm.setAttribute("type", "button");
      rn.addEventListener("click", function () { renameRow(li, g); });
      rm.addEventListener("click", function () { removeGroup(g, rm); });
      end.appendChild(rn);
      end.appendChild(rm);
    }
    li.appendChild(end);
    return li;
  }
  function renderGroups() {
    sortGroups();
    $("g-rows").textContent = "";
    groups.forEach(function (g) { $("g-rows").appendChild(groupRow(g)); });
    $("g-empty").hidden = groups.length > 0;
    fillSelect($("find-group"), "All groups");
  }
  function groupFail(res) {
    if (left(res)) return;
    if (res.code === "already_exists") { say("g-err", "A group with that name already exists."); return; }
    if (res.code === "invalid_request") { say("g-err", fieldMessage(res, "name") || res.message || DOWN); return; }
    if (res.code === "group_limit" || res.code === "forbidden") { say("g-err", res.message || DOWN); return; }
    if (res.status === 404) { say("g-err", "That group is no longer available."); reloadGroups(); return; }
    say("g-err", DOWN);
  }
  function reloadGroups() {
    return H.call("POST", "contacts/groups/list/").then(function (res) {
      if (res.ok && Array.isArray(res.data.results)) { groups = own(res.data.results); renderGroups(); }
    });
  }
  $("g-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!change || busy) return;
    var n = String($("g-name").value || "").trim();
    say("g-err", "");
    if (!n) { say("g-err", "Enter a name for the group."); return; }
    H.call("POST", "contacts/groups/add/", { name: n }).then(function (res) {
      if (!res.ok) { groupFail(res); return; }
      $("g-name").value = "";
      groups.push({ id: res.data.id, name: text(res.data.name), count: res.data.count || 0 });
      renderGroups();
    });
  });
  function renameRow(li, g) {
    li.textContent = "";
    var form = el("form", "find"), input = el("input", "input"), save = el("button", "no-btn no-btn-primary", "Save"), x = el("button", "icon-btn modal-x");
    input.setAttribute("maxlength", "60");
    input.setAttribute("aria-label", "New name of the group");
    input.value = g.name;
    save.setAttribute("type", "submit");
    x.setAttribute("type", "button");
    x.setAttribute("aria-label", "Close");
    x.appendChild(el("span", "", "×"));
    function close() { renderGroups(); }
    x.addEventListener("click", close);
    input.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var n = String(input.value || "").trim();
      say("g-err", "");
      if (!n) { say("g-err", "Enter a name for the group."); return; }
      H.call("POST", "contacts/groups/rename/", { group: g.id, name: n }).then(function (res) {
        if (!res.ok) { groupFail(res); return; }
        g.name = text(res.data.name);
        g.count = typeof res.data.count === "number" ? res.data.count : g.count;
        renderGroups();
      });
    });
    form.appendChild(input);
    form.appendChild(save);
    form.appendChild(x);
    li.appendChild(form);
    input.focus();
  }
  function removeGroup(g, from) {
    openPop(from, "Remove this group?", "Its " + plural(g.count || 0, "contact", "contacts") + (g.count === 1 ? " stays" : " stay") + " in Contacts.", "Remove group", function (done, fail) {
      H.call("POST", "contacts/groups/remove/", { group: g.id }).then(function (res) {
        if (res.ok) { done(); groups = groups.filter(function (x) { return x !== g; }); renderGroups(); return; }
        if (left(res)) return;
        if (res.status === 404) { done(); say("g-err", "That group is no longer available."); reloadGroups(); return; }
        fail(res.code === "forbidden" && res.message ? res.message : DOWN);
      });
    });
  }

  /* ---- the upload ---- */

  function dropUpload() { csvText = null; checked = null; checkedGroup = ""; $("u-step2").hidden = true; say("u-err2", ""); }
  function startUpload() {
    $("u-ro").hidden = change;
    $("u-body").hidden = !change;
    dropUpload();
    $("u-done").hidden = true;
    fillSelect($("u-group"));
    $("u-nogroup").hidden = groups.length > 0;
    $("u-check").disabled = !groups.length;
  }
  $("u-file").addEventListener("change", function () { dropUpload(); say("u-file-err", ""); });
  $("u-group").addEventListener("change", function () { dropUpload(); say("u-group-err", ""); });
  $("u-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!change || busy) return;
    var files = $("u-file").files, f = files && files[0], g = $("u-group").value;
    say("u-file-err", "");
    say("u-group-err", "");
    say("u-err", "");
    dropUpload();
    if (!f) { say("u-file-err", "Choose a CSV file."); return; }
    if (f.size > MAX_FILE) { say("u-file-err", "The file is over 1 MB."); return; }
    if (!g) { say("u-group-err", "Choose a group."); return; }
    busy = true;
    $("u-check").disabled = true;
    f.text().then(function (t) {
      csvText = t;
      return H.call("POST", "contacts/upload/check/", { group: g, csv: t });
    }).then(function (res) {
      busy = false;
      $("u-check").disabled = false;
      if (!res.ok) { csvText = null; uploadFail(res, "u-err"); return; }
      showCheck(res.data, g);
    }, function () { busy = false; $("u-check").disabled = false; csvText = null; say("u-file-err", "The file could not be read."); });
  });
  function uploadFail(res, where) {
    if (left(res)) return;
    if (res.code === "changed") { dropUpload(); say("u-err", "The file or the list of contacts is not as it was when it was checked. Check it again."); return; }
    if (res.code === "file_too_large" || res.code === "invalid_file" || res.code === "forbidden" || res.status === 404 || res.code === "invalid_request") {
      say(where, (res.status === 404 ? "That group is no longer available." : res.message) || DOWN);
      return;
    }
    say(where, DOWN);
  }
  function showCheck(d, g) {
    var n = function (v) { return typeof v === "number" ? v : 0; };
    checked = { lines: n(d.lines), news: n(d.new), existing: n(d.existing), repeated: n(d.repeated), refusedCount: n(d.refused_count),
      refused: Array.isArray(d.refused) ? d.refused : [] };
    checkedGroup = g;
    var gname = groupName(g);
    $("f-lines").textContent = checked.lines;
    $("f-new").textContent = checked.news;
    $("f-existing").textContent = checked.existing;
    $("f-refused").textContent = checked.refusedCount;
    $("f-repeated").textContent = checked.repeated;
    $("f-repeated-box").hidden = !(checked.repeated > 0);
    var s = $("u-sentence");
    s.textContent = "";
    var b1 = el("strong", "", plural(checked.news, "new contact", "new contacts")), b2 = el("strong", "", gname);
    s.appendChild(b1);
    s.appendChild(el("span", "", " will be added to "));
    s.appendChild(b2);
    s.appendChild(el("span", "", ". The " + checked.existing + " numbers already in contacts are not added again; they are put in " + gname + " and keep their names."));
    $("u-results").textContent = "";
    checked.refused.slice(0, 200).forEach(function (r) {
      var li = el("li");
      li.appendChild(el("span", "item-num", "Line " + (r && typeof r.line === "number" ? r.line : "")));
      li.appendChild(el("span", "chip chip-neutral", words(REASONS, r && r.reason) || "Refused"));
      $("u-results").appendChild(li);
    });
    say("u-more", checked.refusedCount > 200 ? "Showing the first 200 of " + checked.refusedCount + " refused lines." : "");
    $("u-download").hidden = !(checked.refused.length && typeof Blob !== "undefined" && typeof URL !== "undefined");
    var go = $("u-save");
    go.textContent = checked.news > 0 ? "Add " + plural(checked.news, "contact", "contacts") : checked.existing > 0 ? "Put " + plural(checked.existing, "contact", "contacts") + " in " + gname : "Nothing to add.";
    go.disabled = checked.news === 0 && checked.existing === 0;
    $("u-step2").hidden = false;
  }
  $("u-download").addEventListener("click", function () {
    if (!checked || !checked.refused.length) return;
    var lines = ["Line,Reason"];
    checked.refused.forEach(function (r) { lines.push((typeof r.line === "number" ? r.line : "") + "," + (words(REASONS, r.reason) || "Refused")); });
    var url;
    try {
      url = URL.createObjectURL(new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv" }));
      var a = el("a");
      a.setAttribute("href", url);
      a.setAttribute("download", "refused-lines.csv");
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) { $("u-download").hidden = true; }
    if (url) URL.revokeObjectURL(url);
  });
  $("u-save").addEventListener("click", function () {
    if (!change || busy || !checked || csvText === null || (checked.news === 0 && checked.existing === 0)) return;
    var c = checked, g = checkedGroup, gname = groupName(g);
    say("u-err2", "");
    busy = true;
    $("u-save").disabled = true;
    H.call("POST", "contacts/upload/", { group: g, csv: csvText, expected_new: c.news }).then(function (res) {
      busy = false;
      if (!res.ok) { $("u-save").disabled = false; uploadFail(res, "u-err2"); return; }
      var d = res.data, added = typeof d.added === "number" ? d.added : 0, had = typeof d.existing === "number" ? d.existing : 0;
      dropUpload();
      $("u-file").value = "";
      $("u-body").hidden = true;
      $("u-done-text").textContent = plural(added, "contact", "contacts") + " added to " + gname + ". " + had + " were already contacts.";
      $("u-done").hidden = false;
    });
  });

  /* ---- start ---- */

  var known = false;
  function begin() {
    var path = location.pathname;
    renderGroups();
    showBoot("v-page");
    if (path.indexOf("/contacts/new") === 0) { showForm("add", null); return; }
    if (path.indexOf("/contacts/groups") === 0) { showInner("v-groups"); return; }
    if (path.indexOf("/contacts/upload") === 0) { showInner("v-upload"); startUpload(); return; }
    showInner("v-list");
    loadList(false);
  }
  function start() {
    showBoot("boot");
    var who = known ? Promise.resolve({ ok: true }) : H.call("GET", "me/");
    who.then(function (res) {
      if (left(res)) return;
      if (!res.ok) { showBoot("v-down"); return; }
      if (!known) { known = true; window.NOHqShell.signedIn(res.data.email); }
      return H.call("POST", "contacts/status/").then(function (st) {
        if (left(st)) return;
        if (st.status === 404) { showBoot("v-closed"); return; }
        if (!st.ok) { showBoot("v-down"); return; }
        change = st.data.change === true;
        return H.call("POST", "contacts/groups/list/").then(function (gl) {
          if (left(gl)) return;
          if (!gl.ok || !Array.isArray(gl.data.results)) { showBoot("v-down"); return; }
          groups = own(gl.data.results);
          begin();
        });
      });
    });
  }
  $("retry").addEventListener("click", start);
  start();
})();
