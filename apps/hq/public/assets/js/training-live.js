/* The Live trainings page (ClickUp z8uq9mezdj): the scheduled live sessions members see, and one form to create or edit
   them. The start is typed as a date and a 24-hour time in Philippine time (UTC+8, no daylight saving) and sent with that
   offset. A new active live training adds an entry to the bell of every member it is for; the backend does that. The page
   decides nothing: the backend does. Nothing is stored in the browser. */
(function () {
  var H = window.NOHq, F = window.NOFin, T = window.NOTrain, $ = function (id) { return document.getElementById(id); };
  var known = false, lives = [], run = 0, editing = null, saving = false;
  var dlg = F.dialogs(function () { return box.busy(); });
  var box = T.confirmer(dlg);
  var FIELDS = [["title", "f-title", "f-title-err"], ["starts_at", "f-date", "f-starts-err"], ["duration_minutes", "f-dur", "f-dur-err"],
    ["description", "f-desc", "f-desc-err"], ["join_url", "f-join", "f-join-err"], ["site", "f-site", "f-site-err"]];
  var TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
  var PH = 8 * 3600000; /* Philippine time is UTC+8 all year */

  function show(view) { ["boot", "v-main", "v-down"].forEach(function (id) { $(id).hidden = id !== view; }); }
  function two(n) { return (n < 10 ? "0" : "") + n; }
  /* "2026-11-20" and "19:00" in Philippine time from an instant, or null. */
  function partsOf(iso) {
    var t = new Date(iso).getTime(), d;
    if (!iso || isNaN(t)) return null;
    d = new Date(t + PH);
    return { date: d.getUTCFullYear() + "-" + two(d.getUTCMonth() + 1) + "-" + two(d.getUTCDate()), time: two(d.getUTCHours()) + ":" + two(d.getUTCMinutes()) };
  }

  function btn(label, aria, fn) {
    var b = F.el("button", "no-btn no-btn-ghost", label);
    b.setAttribute("type", "button");
    b.setAttribute("aria-label", aria);
    b.addEventListener("click", fn);
    return b;
  }

  function draw() {
    var list = $("lives");
    list.textContent = "";
    $("v-empty").hidden = lives.length > 0;
    lives.forEach(function (x) {
      var li = F.el("li", "trn-row"), main = F.el("div", "trn-main"), chips = F.el("div", "fin-row"), acts = F.el("div", "trn-acts");
      main.appendChild(F.el("strong", "", x.title));
      main.appendChild(F.el("p", "small", F.stamp(x.starts_at) + " (Philippine time), " + x.duration_minutes + " min" + (x.site_id ? ", one site only" : ", every Santé site") + (x.join_url ? ", join link set" : ", no join link") + (x.thumbnail_url ? ", thumbnail set" : "")));
      chips.appendChild(F.el("span", x.active ? "chip chip-ok" : "chip chip-warn", x.active ? "Active" : "Off"));
      main.appendChild(chips);
      acts.appendChild(btn("Edit", "Edit " + x.title, function (e) { edit(x, e.target); }));
      acts.appendChild(btn("Delete", "Delete " + x.title, function (e) { remove(x, e.target); }));
      li.appendChild(main);
      li.appendChild(acts);
      list.appendChild(li);
    });
  }

  function load(message) {
    var mine = ++run;
    return H.call("POST", "training/live/list/", {}).then(function (res) {
      if (mine !== run) return;
      if (F.left(res)) return;
      if (!res.ok || !Array.isArray(res.data.live)) { show("v-down"); return; }
      lives = res.data.live.filter(function (x) { return x && typeof x.id === "string" && typeof x.title === "string"; });
      draw();
      F.say("v-msg", message || "");
      show("v-main");
    });
  }

  function clearErrors() {
    FIELDS.forEach(function (f) { T.mark($(f[1]), f[2], ""); });
    F.say("f-err", "");
    F.say("f-pic-err", "");
  }
  function reset() {
    editing = null;
    ["f-title", "f-date", "f-time", "f-dur", "f-desc", "f-join", "f-site"].forEach(function (id) { $(id).value = ""; });
    $("f-dur").value = "60";
    $("f-active").checked = true;
    $("f-h").textContent = "New live training";
    $("f-save").textContent = "Create live training";
    $("f-cancel").hidden = true;
    $("f-pic-box").hidden = true;
    $("f-note").hidden = false;
    clearErrors();
  }
  function edit(x, opener) {
    var p = partsOf(x.starts_at) || { date: "", time: "" };
    reset();
    editing = x;
    $("f-title").value = x.title;
    $("f-date").value = p.date;
    $("f-time").value = p.time;
    $("f-dur").value = String(x.duration_minutes);
    $("f-desc").value = x.description || "";
    $("f-join").value = x.join_url || "";
    $("f-site").value = x.site_id || "";
    $("f-active").checked = x.active === true;
    $("f-h").textContent = "Edit live training";
    $("f-save").textContent = "Save live training";
    $("f-cancel").hidden = false;
    $("f-pic-box").hidden = false;
    $("f-note").hidden = true;
    $("f-pic").textContent = x.thumbnail_url ? "A thumbnail is set." : "No thumbnail yet.";
    $("f-clear").disabled = !x.thumbnail_url;
    $("f-title").focus();
  }
  $("f-cancel").addEventListener("click", reset);

  $("f-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (saving) return;
    var title = $("f-title").value.trim(), date = $("f-date").value.trim(), time = $("f-time").value.trim(), dur = T.whole($("f-dur").value, 1, 1440),
      join = $("f-join").value.trim(), site = $("f-site").value.trim(), bad = false, body;
    clearErrors();
    if (!title) { T.mark($("f-title"), "f-title-err", "Enter a title."); bad = true; }
    if (!F.isDate(date) || !TIME.test(time)) { T.mark($("f-date"), "f-starts-err", "Enter the date as YYYY-MM-DD and the time as HH:MM, 24-hour, Philippine time."); bad = true; }
    if (dur === null) { T.mark($("f-dur"), "f-dur-err", "Enter a whole number of minutes, from 1 to 1440."); bad = true; }
    if (join && !/^https:\/\/\S+$/.test(join)) { T.mark($("f-join"), "f-join-err", "Use an https link."); bad = true; }
    if (bad) return;
    body = { title: title, starts_at: date + "T" + time + ":00+08:00", duration_minutes: dur, description: $("f-desc").value.trim(), join_url: join,
      site: site || null, active: $("f-active").checked };
    if (editing) body.id = editing.id;
    saving = true;
    $("f-save").disabled = true;
    H.call("POST", editing ? "training/live/update/" : "training/live/create/", body).then(function (res) {
      saving = false;
      $("f-save").disabled = false;
      if (F.left(res)) return;
      if (res.ok) {
        var created = !editing;
        reset();
        load(created ? "Live training created." : "Live training saved.");
        return;
      }
      if (res.status === 400 && res.code === "invalid_request") { if (!T.showFields(res.fields, FIELDS)) F.say("f-err", "Check the values and try again."); return; }
      F.say("f-err", T.LOST);
    });
  });

  function remove(x, opener) {
    box.ask(opener, "Delete this live training?", "“" + x.title + "” will be deleted. This cannot be undone.", "Delete live training", function () {
      return H.call("POST", "training/live/delete/", { id: x.id }).then(function (res) {
        if (F.left(res)) return true;
        if (res.ok || res.status === 404) { if (editing && editing.id === x.id) reset(); load("Live training deleted."); return true; }
        F.say("confirm-err", T.LOST);
        return false;
      });
    });
  }

  $("f-up").addEventListener("click", function () {
    var p = T.picture($("f-file")), form;
    if (!editing || saving) return;
    F.say("f-pic-err", "");
    if (p.error) { F.say("f-pic-err", p.error); return; }
    form = new FormData();
    form.append("kind", "live");
    form.append("id", editing.id);
    form.append("file", p.file);
    H.upload("training/image/set/", form).then(function (res) {
      if (F.left(res)) return;
      if (res.ok) { $("f-file").value = ""; $("f-pic").textContent = "A thumbnail is set."; $("f-clear").disabled = false; editing.thumbnail_url = res.data.thumbnail_url || "set"; load("Thumbnail saved."); return; }
      if (res.status === 400 && T.first(res.fields, "file")) { F.say("f-pic-err", T.first(res.fields, "file")); return; }
      if (res.status === 503) { F.say("f-pic-err", "Pictures cannot be stored yet: the image store is not set up."); return; }
      F.say("f-pic-err", T.LOST);
    });
  });
  $("f-clear").addEventListener("click", function () {
    if (!editing || saving) return;
    F.say("f-pic-err", "");
    H.call("POST", "training/image/clear/", { kind: "live", id: editing.id }).then(function (res) {
      if (F.left(res)) return;
      if (res.ok) { $("f-pic").textContent = "No thumbnail yet."; $("f-clear").disabled = true; editing.thumbnail_url = null; load("Thumbnail removed."); return; }
      F.say("f-pic-err", T.LOST);
    });
  });

  function start() {
    show("boot");
    if (known) { load(""); return; }
    H.call("GET", "me/").then(function (res) {
      if (F.left(res)) return;
      if (!res.ok) { show("v-down"); return; }
      known = true;
      window.NOHqShell.signedIn(res.data.email);
      reset();
      load("");
    });
  }
  $("retry").addEventListener("click", start);
  start();
})();
