/* The Training courses page (ClickUp z8uq9mezdj): every Santé course in the order members see it, with Up and Down,
   Archive or Restore, Delete behind a confirm dialog, and a form to create one. A course opens in its editor
   (/training/course/). The page decides nothing: the backend does. Nothing is stored in the browser. */
(function () {
  var H = window.NOHq, F = window.NOFin, T = window.NOTrain, $ = function (id) { return document.getElementById(id); };
  var known = false, working = false, courses = [], run = 0;
  var dlg = F.dialogs(function () { return box.busy(); });
  var box = T.confirmer(dlg);
  var FIELDS = [["title", "n-title", "n-title-err"], ["description", "n-desc", "n-desc-err"]];

  function show(view) { ["boot", "v-main", "v-down"].forEach(function (id) { $(id).hidden = id !== view; }); }
  function plural(n, one) { return n + " " + one + (n === 1 ? "" : "s"); }

  function button(label, aria, fn, disabled) {
    var b = F.el("button", "no-btn no-btn-ghost", label);
    b.setAttribute("type", "button");
    b.setAttribute("aria-label", aria);
    b.disabled = !!disabled;
    b.addEventListener("click", fn);
    return b;
  }

  function draw() {
    var list = $("courses"), ids = courses.map(function (c) { return c.id; });
    list.textContent = "";
    $("c-empty").hidden = courses.length > 0;
    courses.forEach(function (c, i) {
      var li = F.el("li", "trn-row"), main = F.el("div", "trn-main"), a = F.el("a", "", c.title), chips = F.el("div", "fin-row"), acts = F.el("div", "trn-acts"),
        lessons = c.active_lesson_count;
      a.setAttribute("href", "/training/course/?id=" + encodeURIComponent(c.id));
      main.appendChild(a);
      main.appendChild(F.el("p", "small", plural(c.module_count, "module") + ", " + plural(c.lesson_count, "lesson") + " (" + lessons + " active)" + (c.image_url ? ", picture set" : "")));
      if (c.archived_at) chips.appendChild(F.el("span", "chip chip-neutral", "Archived"));
      else chips.appendChild(F.el("span", c.active ? "chip chip-ok" : "chip chip-warn", c.active ? "Active" : "Off"));
      if (c.active && !c.archived_at && lessons === 0) chips.appendChild(F.el("span", "chip chip-info", "Coming Soon"));
      main.appendChild(chips);
      acts.appendChild(button("Up", "Move " + c.title + " up", function () { reorder(ids, c.id, -1); }, working || i === 0));
      acts.appendChild(button("Down", "Move " + c.title + " down", function () { reorder(ids, c.id, 1); }, working || i === courses.length - 1));
      acts.appendChild(button(c.archived_at ? "Restore" : "Archive", (c.archived_at ? "Restore " : "Archive ") + c.title, function (e) { archive(c, e.target); }, working));
      acts.appendChild(button("Delete", "Delete " + c.title, function (e) { remove(c, e.target); }, working));
      li.appendChild(main);
      li.appendChild(acts);
      list.appendChild(li);
    });
  }

  function load(message) {
    var mine = ++run;
    return H.call("POST", "training/courses/list/", {}).then(function (res) {
      if (mine !== run) return;
      if (F.left(res)) return;
      if (!res.ok || !Array.isArray(res.data.courses)) { show("v-down"); return; }
      courses = res.data.courses.filter(function (c) { return c && typeof c.id === "string" && typeof c.title === "string"; });
      draw();
      F.say("c-msg", message || "");
      show("v-main");
    });
  }

  function reorder(ids, id, step) {
    var next = T.moved(ids, id, step);
    if (!next || working) return;
    working = true;
    draw();
    F.say("c-msg", "");
    H.call("POST", "training/courses/reorder/", { ids: next }).then(function (res) {
      working = false;
      if (F.left(res)) return;
      if (!res.ok) { F.say("c-msg", T.LOST); draw(); return; }
      load("Order saved.");
    });
  }

  function archive(c, opener) {
    var on = !c.archived_at;
    if (working) return;
    working = true;
    draw();
    H.call("POST", "training/courses/update/", { id: c.id, archived: on }).then(function (res) {
      working = false;
      if (F.left(res)) return;
      if (!res.ok) { F.say("c-msg", T.LOST); draw(); return; }
      load(on ? "Course archived. It is off for members." : "Course restored.");
    });
  }

  function remove(c, opener) {
    box.ask(opener, "Delete this course?", "“" + c.title + "”, its modules, its lessons and every member's progress in it will be deleted. This cannot be undone.", "Delete course", function () {
      return H.call("POST", "training/courses/delete/", { id: c.id }).then(function (res) {
        if (F.left(res)) return true;
        if (res.ok || res.status === 404) { load("Course deleted."); return true; }
        F.say("confirm-err", T.LOST);
        return false;
      });
    });
  }

  $("n-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var title = $("n-title").value.trim(), desc = $("n-desc").value.trim();
    F.say("n-err", "");
    FIELDS.forEach(function (f) { T.mark($(f[1]), f[2], ""); });
    if (!title) { T.mark($("n-title"), "n-title-err", "Enter a title."); return; }
    $("n-go").disabled = true;
    H.call("POST", "training/courses/create/", { title: title, description: desc }).then(function (res) {
      $("n-go").disabled = false;
      if (F.left(res)) return;
      if (res.ok && res.data && typeof res.data.id === "string") { location.assign("/training/course/?id=" + encodeURIComponent(res.data.id)); return; }
      if (res.status === 400 && res.code === "invalid_request") {
        if (!T.showFields(res.fields, FIELDS)) F.say("n-err", "Check the values and try again.");
        return;
      }
      F.say("n-err", T.LOST);
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
