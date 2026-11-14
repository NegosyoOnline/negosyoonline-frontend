/* The course editor (ClickUp z8uq9mezdj): the course's details and picture, its modules, and the lessons of each module. A
   module or lesson is created, edited, moved with Up and Down, or deleted behind a confirm dialog. The video link is an https
   embed link; the backend refuses anything else and the page shows its message. The page decides nothing: the backend does.
   The course is named in the address, /training/course/?id=<course id>. Nothing is stored in the browser. */
(function () {
  var H = window.NOHq, F = window.NOFin, T = window.NOTrain, $ = function (id) { return document.getElementById(id); };
  var match = /[?&]id=([^&#]+)/.exec(location.search || ""), courseId = "";
  var known = false, working = false, tree = null, run = 0, editing = null, adding = null, saving = false;
  var dlg = F.dialogs(function () { return box.busy() || saving; });
  var box = T.confirmer(dlg);
  try { courseId = match ? decodeURIComponent(match[1]) : ""; } catch (e) { courseId = ""; }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(courseId)) { location.replace("/training/"); return; }

  var COURSE_FIELDS = [["title", "e-title", "e-title-err"], ["slug", "e-slug", "e-slug-err"], ["description", "e-desc", "e-desc-err"], ["active", "e-active", "e-active-err"]];
  var LESSON_FIELDS = [["title", "l-title", "l-title-err"], ["duration", "l-dur", "l-dur-err"], ["video_url", "l-video", "l-video-err"], ["description", "l-desc", "l-desc-err"]];

  function show(view) { ["boot", "v-main", "v-down"].forEach(function (id) { $(id).hidden = id !== view; }); }
  function btn(label, aria, fn, disabled, cls) {
    var b = F.el("button", cls || "no-btn no-btn-ghost", label);
    b.setAttribute("type", "button");
    b.setAttribute("aria-label", aria);
    b.disabled = !!disabled;
    b.addEventListener("click", fn);
    return b;
  }

  /* ---- the course ---- */

  function paintCourse(c) {
    $("e-title").value = c.title || "";
    $("e-slug").value = c.slug || "";
    $("e-desc").value = c.description || "";
    $("e-active").checked = c.active === true;
    $("e-state").hidden = false;
    $("e-state").textContent = c.archived_at ? "Archived" : c.active ? "Active" : "Off";
    $("e-state").setAttribute("class", "chip " + (c.archived_at ? "chip-neutral" : c.active ? "chip-ok" : "chip-warn"));
    $("e-pic").textContent = c.image_url ? "A picture is set." : "No picture yet.";
    $("e-clear").disabled = !c.image_url;
    COURSE_FIELDS.forEach(function (f) { T.mark($(f[1]), f[2], ""); });
    F.say("e-err", "");
  }

  function drawModules() {
    var host = $("modules"), mods = tree.modules, ids = mods.map(function (m) { return m.id; });
    host.textContent = "";
    $("m-empty").hidden = mods.length > 0;
    mods.forEach(function (m, i) {
      var card = F.el("div", "trn-mod"), form = F.el("form", "trn-modform"), title = F.el("input", "input"), label = F.el("label", "checks-inline"),
        on = F.el("input", ""), err = F.el("p", "field-err"), acts = F.el("div", "trn-acts"), ol = F.el("ol", "list"), n = i + 1;
      form.setAttribute("novalidate", "");
      form.setAttribute("aria-label", "Module " + n);
      title.setAttribute("type", "text");
      title.setAttribute("maxlength", "120");
      title.setAttribute("aria-label", "Module " + n + " title");
      title.value = m.title;
      on.setAttribute("type", "checkbox");
      on.checked = m.active === true;
      label.appendChild(on);
      label.appendChild(F.el("span", "", "Active"));
      err.setAttribute("role", "alert");
      err.hidden = true;
      var save = F.el("button", "no-btn no-btn-ghost", "Save module");
      save.setAttribute("type", "submit");
      form.appendChild(title);
      form.appendChild(label);
      form.appendChild(save);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var t = title.value.trim();
        err.hidden = true;
        if (!t) { err.textContent = "Enter a module title."; err.hidden = false; return; }
        if (working) return;
        working = true;
        H.call("POST", "training/modules/update/", { id: m.id, title: t, active: on.checked }).then(function (res) {
          working = false;
          if (F.left(res)) return;
          if (res.ok) { load("Module saved."); return; }
          err.textContent = res.status === 400 && T.first(res.fields, "title") ? T.first(res.fields, "title") : T.LOST;
          err.hidden = false;
        });
      });
      acts.appendChild(btn("Up", "Move module " + n + " up", function () { reorderModules(ids, m.id, -1); }, working || i === 0));
      acts.appendChild(btn("Down", "Move module " + n + " down", function () { reorderModules(ids, m.id, 1); }, working || i === mods.length - 1));
      acts.appendChild(btn("Delete", "Delete module " + n, function (e) { removeModule(m, e.target); }, working));
      m.lessons.forEach(function (l, j) {
        var li = F.el("li", "trn-row"), main = F.el("div", "trn-main"), row = F.el("div", "fin-row"), la = F.el("div", "trn-acts"), lids = m.lessons.map(function (x) { return x.id; });
        main.appendChild(F.el("strong", "", l.title));
        row.appendChild(F.el("span", "small", (l.duration ? l.duration + ". " : "") + (l.video_url ? "Video set." : "No video yet.") + (l.image_url ? " Picture set." : "")));
        if (l.active !== true) row.appendChild(F.el("span", "chip chip-warn", "Off"));
        main.appendChild(row);
        la.appendChild(btn("Edit", "Edit lesson " + l.title, function (e) { openLesson(m, l, e.target); }, working));
        la.appendChild(btn("Up", "Move lesson " + l.title + " up", function () { reorderLessons(m.id, lids, l.id, -1); }, working || j === 0));
        la.appendChild(btn("Down", "Move lesson " + l.title + " down", function () { reorderLessons(m.id, lids, l.id, 1); }, working || j === m.lessons.length - 1));
        la.appendChild(btn("Delete", "Delete lesson " + l.title, function (e) { removeLesson(l, e.target); }, working));
        li.appendChild(main);
        li.appendChild(la);
        ol.appendChild(li);
      });
      card.appendChild(form);
      card.appendChild(err);
      card.appendChild(acts);
      card.appendChild(ol);
      if (!m.lessons.length) card.appendChild(F.el("p", "small", "No lessons in this module yet."));
      card.appendChild(btn("Add a lesson", "Add a lesson to module " + n, function (e) { openLesson(m, null, e.target); }, working));
      host.appendChild(card);
    });
  }

  function load(message) {
    var mine = ++run;
    return H.call("POST", "training/courses/get/", { id: courseId }).then(function (res) {
      if (mine !== run) return;
      if (F.left(res)) return;
      if (res.status === 404) { $("h-down").textContent = "This course was not found."; $("retry").hidden = true; show("v-down"); return; }
      if (!res.ok || !Array.isArray(res.data.modules)) { show("v-down"); return; }
      tree = res.data;
      tree.modules = tree.modules.map(function (m) { m.lessons = Array.isArray(m.lessons) ? m.lessons : []; return m; });
      paintCourse(tree);
      drawModules();
      F.say("e-msg", message || "");
      show("v-main");
    });
  }

  $("e-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var title = $("e-title").value.trim(), slug = $("e-slug").value.trim(), body;
    COURSE_FIELDS.forEach(function (f) { T.mark($(f[1]), f[2], ""); });
    F.say("e-err", "");
    F.say("e-msg", "");
    if (!title) { T.mark($("e-title"), "e-title-err", "Enter a title."); return; }
    if (!slug) { T.mark($("e-slug"), "e-slug-err", "Enter a slug."); return; }
    body = { id: courseId, title: title, slug: slug, description: $("e-desc").value.trim(), active: $("e-active").checked };
    $("e-save").disabled = true;
    H.call("POST", "training/courses/update/", body).then(function (res) {
      $("e-save").disabled = false;
      if (F.left(res)) return;
      if (res.ok) { load("Course saved."); return; }
      if (res.status === 400 && res.code === "invalid_request") { if (!T.showFields(res.fields, COURSE_FIELDS)) F.say("e-err", "Check the values and try again."); return; }
      F.say("e-err", T.LOST);
    });
  });

  /* A picture for the course, or for the lesson in the dialog. */
  function sendPicture(kind, id, input, errId, done) {
    var p = T.picture(input), form;
    F.say(errId, "");
    if (p.error) { F.say(errId, p.error); return; }
    form = new FormData();
    form.append("kind", kind);
    form.append("id", id);
    form.append("file", p.file);
    H.upload("training/image/set/", form).then(function (res) {
      if (F.left(res)) return;
      if (res.ok) { done(res.data); return; }
      if (res.status === 400 && T.first(res.fields, "file")) { F.say(errId, T.first(res.fields, "file")); return; }
      if (res.status === 503) { F.say(errId, "Pictures cannot be stored yet: the image store is not set up."); return; }
      F.say(errId, T.LOST);
    });
  }
  function clearPicture(kind, id, errId, done) {
    F.say(errId, "");
    H.call("POST", "training/image/clear/", { kind: kind, id: id }).then(function (res) {
      if (F.left(res)) return;
      if (res.ok) { done(res.data); return; }
      F.say(errId, T.LOST);
    });
  }
  $("e-up").addEventListener("click", function () {
    sendPicture("course", courseId, $("e-file"), "e-pic-err", function () { $("e-file").value = ""; load("Picture saved."); });
  });
  $("e-clear").addEventListener("click", function () {
    clearPicture("course", courseId, "e-pic-err", function () { load("Picture removed."); });
  });

  /* ---- modules ---- */

  $("am-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var title = $("am-title").value.trim();
    T.mark($("am-title"), "am-title-err", "");
    if (!title) { T.mark($("am-title"), "am-title-err", "Enter a module title."); return; }
    $("am-go").disabled = true;
    H.call("POST", "training/modules/create/", { course: courseId, title: title }).then(function (res) {
      $("am-go").disabled = false;
      if (F.left(res)) return;
      if (res.ok) { $("am-title").value = ""; load("Module added."); return; }
      T.mark($("am-title"), "am-title-err", res.status === 400 && T.first(res.fields, "title") ? T.first(res.fields, "title") : T.LOST);
    });
  });

  function reorderModules(ids, id, step) {
    var next = T.moved(ids, id, step);
    if (!next || working) return;
    working = true;
    drawModules();
    H.call("POST", "training/modules/reorder/", { course: courseId, ids: next }).then(function (res) {
      working = false;
      if (F.left(res)) return;
      if (!res.ok) { F.say("e-msg", T.LOST); drawModules(); return; }
      load("Order saved.");
    });
  }
  function reorderLessons(moduleId, ids, id, step) {
    var next = T.moved(ids, id, step);
    if (!next || working) return;
    working = true;
    drawModules();
    H.call("POST", "training/lessons/reorder/", { module: moduleId, ids: next }).then(function (res) {
      working = false;
      if (F.left(res)) return;
      if (!res.ok) { F.say("e-msg", T.LOST); drawModules(); return; }
      load("Order saved.");
    });
  }
  function removeModule(m, opener) {
    box.ask(opener, "Delete this module?", "“" + m.title + "” and its " + m.lessons.length + " lesson" + (m.lessons.length === 1 ? "" : "s") + " will be deleted, with every member's progress in them. This cannot be undone.", "Delete module", function () {
      return H.call("POST", "training/modules/delete/", { id: m.id }).then(function (res) {
        if (F.left(res)) return true;
        if (res.ok || res.status === 404) { load("Module deleted."); return true; }
        F.say("confirm-err", T.LOST);
        return false;
      });
    });
  }
  function removeLesson(l, opener) {
    box.ask(opener, "Delete this lesson?", "“" + l.title + "” will be deleted, with every member's progress in it. This cannot be undone.", "Delete lesson", function () {
      return H.call("POST", "training/lessons/delete/", { id: l.id }).then(function (res) {
        if (F.left(res)) return true;
        if (res.ok || res.status === 404) { load("Lesson deleted."); return true; }
        F.say("confirm-err", T.LOST);
        return false;
      });
    });
  }

  /* ---- the lesson dialog ---- */

  function openLesson(m, l, opener) {
    editing = l;
    adding = l ? null : m;
    $("m-lesson-h").textContent = l ? "Edit lesson" : "New lesson in " + m.title;
    $("l-title").value = l ? l.title : "";
    $("l-dur").value = l ? l.duration || "" : "";
    $("l-video").value = l ? l.video_url || "" : "";
    $("l-desc").value = l ? l.description || "" : "";
    $("l-active").checked = l ? l.active === true : true;
    $("l-pic-box").hidden = !l;
    $("l-pic").textContent = l && l.image_url ? "A picture is set." : "No picture yet.";
    $("l-clear").disabled = !(l && l.image_url);
    LESSON_FIELDS.forEach(function (f) { T.mark($(f[1]), f[2], ""); });
    F.say("l-err", "");
    F.say("l-pic-err", "");
    $("l-save").textContent = l ? "Save lesson" : "Add lesson";
    dlg.open("m-lesson", opener, $("l-title"));
  }
  function lessonLock(on) {
    saving = on;
    ["l-save", "l-cancel", "lesson-x", "l-up", "l-clear"].forEach(function (id) { $(id).disabled = on || (id === "l-clear" && !(editing && editing.image_url)); });
  }
  ["lesson-x", "l-cancel"].forEach(function (id) {
    $(id).addEventListener("click", function () { if (!saving) dlg.close(true); });
  });
  $("l-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (saving) return;
    var title = $("l-title").value.trim(), body;
    LESSON_FIELDS.forEach(function (f) { T.mark($(f[1]), f[2], ""); });
    F.say("l-err", "");
    if (!title) { T.mark($("l-title"), "l-title-err", "Enter a title."); return; }
    body = { title: title, duration: $("l-dur").value.trim(), video_url: $("l-video").value.trim(), description: $("l-desc").value.trim(), active: $("l-active").checked };
    if (editing) body.id = editing.id; else body.module = adding.id;
    lessonLock(true);
    H.call("POST", editing ? "training/lessons/update/" : "training/lessons/create/", body).then(function (res) {
      lessonLock(false);
      if (F.left(res)) return;
      if (res.ok) { dlg.close(false); load(editing ? "Lesson saved." : "Lesson added."); return; }
      if (res.status === 400 && res.code === "invalid_request") { if (!T.showFields(res.fields, LESSON_FIELDS)) F.say("l-err", "Check the values and try again."); return; }
      F.say("l-err", T.LOST);
    });
  });
  $("l-up").addEventListener("click", function () {
    if (saving || !editing) return;
    sendPicture("lesson", editing.id, $("l-file"), "l-pic-err", function (row) {
      $("l-file").value = "";
      editing.image_url = row && row.image_url ? row.image_url : "set";
      $("l-pic").textContent = "A picture is set.";
      $("l-clear").disabled = false;
      load("Picture saved.");
    });
  });
  $("l-clear").addEventListener("click", function () {
    if (saving || !editing) return;
    clearPicture("lesson", editing.id, "l-pic-err", function () {
      editing.image_url = null;
      $("l-pic").textContent = "No picture yet.";
      $("l-clear").disabled = true;
      load("Picture removed.");
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
      load("");
    });
  }
  $("retry").addEventListener("click", start);
  start();
})();
