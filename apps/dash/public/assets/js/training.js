/* Subscriber Training editor (ClickUp z8uq9mezdj, /training/, /training/course/?id=, /training/live/). The Subscriber writes the courses, modules,
   lessons and live trainings their members see in the member dashboard. Reads and writes /sites/{id}/training/ (courses, modules, lessons, live;
   pictures are multipart `file`, JPEG, PNG or WebP up to 2 MB). Every status and string from the API reaches the page through textContent or D.el only.
   Live times are typed and shown in Philippine time and sent as ISO times with a zone. A lesson's video link is turned into an embed link
   here (YouTube and Vimeo watch links); the API accepts embed links only and says so for anything else. While the API answers 404 (members are
   switched off, or not a Santé site) the pages say Training is not available yet and the Training links stay hidden (probe).
   Plain ES5. NOTraining.util holds the pure helpers (tests/training.test.mjs). */
(function () {
  var D = window.NODash;
  var token = 0, S = null;
  var TITLE_MAX = 120, LESSON_TITLE_MAX = 160, DESC_MAX = 5000, LESSON_DESC_MAX = 10000, DUR_MAX = 20, URL_MAX = 500;
  var PIC_MAX = 2 * 1024 * 1024, PIC_TYPES = ["image/jpeg", "image/png", "image/webp"];
  var LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/, ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  var ROOTS = { "training": "tr-root", "training-course": "tc-root", "training-live": "tl-root" };
  var MANILA = 8 * 3600000; /* UTC+8, no daylight saving */

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(text) { var l = byId("tr-live"); if (l) l.textContent = text; }
  function msgOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function root() { return byId(ROOTS[S ? S.view : "training"]); }
  function base() { return "/sites/" + S.site + "/training/"; }
  function btn(label, kind, fn) {
    var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost") + (kind === "danger" ? " tr-danger" : ""), label);
    b.setAttribute("type", "button");
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function busy(b, on) { if (!b) return; if (on) { b.setAttribute("aria-busy", "true"); b.disabled = true; } else { b.removeAttribute("aria-busy"); b.disabled = false; } }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  /* ---------- pure helpers ---------- */

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  /* "2026-11-20T09:30" typed in Philippine time -> "2026-11-20T01:30:00.000Z"; "" -> null; anything else -> undefined (not a time). */
  function toIso(local) {
    var v = String(local || "").trim();
    if (!v) return null;
    var m = LOCAL_RE.exec(v);
    if (!m) return undefined;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - MANILA;
    if (isNaN(t)) return undefined;
    var iso = new Date(t).toISOString();
    return toLocal(iso) === v ? iso : undefined; /* a day that rolled over (month 13, hour 99) is not a time */
  }
  function toLocal(iso) {
    var t = iso ? new Date(iso).getTime() : NaN;
    if (isNaN(t)) return "";
    var d = new Date(t + MANILA);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes());
  }
  function whenText(iso) {
    var t = iso ? new Date(iso) : null;
    if (!t || isNaN(t.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(t) + " (Philippine time)";
  }
  /* A watch link becomes the embed link the API accepts. YouTube: watch?v=, youtu.be/, shorts/, live/, embed/. Vimeo: vimeo.com/123,
     vimeo.com/123/hash (a private video, hash kept as ?h=) and player.vimeo.com/video/123. Anything else is returned as typed, so the API
     can refuse it with its own sentence. "" stays "". */
  function toEmbed(link) {
    var v = String(link || "").trim();
    if (!v) return "";
    var m = /^https?:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})(?:[&?#\/].*)?$/.exec(v)
      || /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[?#\/].*)?$/.exec(v);
    if (m) return "https://www.youtube.com/embed/" + m[1];
    m = /^https?:\/\/(?:www\.)?vimeo\.com\/(?:channels\/[A-Za-z0-9_-]+\/|groups\/[A-Za-z0-9_-]+\/videos\/)?(\d{1,15})(?:\/([0-9a-f]{6,20}))?(?:[?#].*)?$/.exec(v)
      || /^https?:\/\/player\.vimeo\.com\/video\/(\d{1,15})(?:\?(?:[^#]*&)?h=([0-9a-f]{6,20}))?(?:[&#].*)?$/.exec(v);
    if (m) return "https://player.vimeo.com/video/" + m[1] + (m[2] ? "?h=" + m[2] : "");
    return v;
  }
  function pictureError(file) {
    if (!file) return "";
    if (PIC_TYPES.indexOf(file.type) < 0) return "Use a JPEG, PNG or WebP picture.";
    if (file.size > PIC_MAX) return "The picture is over 2 MB. Choose a smaller one.";
    return "";
  }
  function hasErrors(errors) { for (var k in errors) { if (Object.prototype.hasOwnProperty.call(errors, k)) return true; } return false; }
  function textErr(value, name, max, required) {
    var v = String(value || "").trim();
    if (required && !v) return "Enter " + name + ".";
    if (v.length > max) return "Keep it to " + max + " characters.";
    return "";
  }
  /* The forms' values as the API body, or {errors: {field: text}}. Text is sent trimmed. */
  function buildCourse(v) {
    var errors = {}, title = String(v.title || "").trim(), description = String(v.description || "").trim();
    var e = textErr(title, "a title", TITLE_MAX, true); if (e) errors.title = e;
    e = textErr(description, "", DESC_MAX, false); if (e) errors.description = e;
    if (hasErrors(errors)) return { errors: errors };
    return { body: { title: title, description: description, active: !!v.active } };
  }
  function buildModule(v) {
    var title = String(v.title || "").trim(), e = textErr(title, "a title", TITLE_MAX, true);
    if (e) return { errors: { title: e } };
    var body = { title: title };
    if (v.active !== undefined) body.active = !!v.active;
    return { body: body };
  }
  function buildLesson(v) {
    var errors = {}, title = String(v.title || "").trim(), duration = String(v.duration || "").trim(), description = String(v.description || "").trim();
    var link = toEmbed(v.video_url), e = textErr(title, "a title", LESSON_TITLE_MAX, true);
    if (e) errors.title = e;
    e = textErr(duration, "", DUR_MAX, false); if (e) errors.duration = e;
    e = textErr(description, "", LESSON_DESC_MAX, false); if (e) errors.description = e;
    if (link.length > URL_MAX) errors.video_url = "Keep the link to " + URL_MAX + " characters.";
    if (hasErrors(errors)) return { errors: errors };
    return { body: { title: title, duration: duration, description: description, video_url: link || null, active: !!v.active } };
  }
  function buildLive(v) {
    var errors = {}, title = String(v.title || "").trim(), description = String(v.description || "").trim(), join = String(v.join_url || "").trim();
    var starts = toIso(v.starts), mins = String(v.minutes || "").trim(), n = mins === "" ? null : (/^\d{1,4}$/.test(mins) ? parseInt(mins, 10) : NaN);
    var e = textErr(title, "a title", TITLE_MAX, true); if (e) errors.title = e;
    e = textErr(description, "", DESC_MAX, false); if (e) errors.description = e;
    if (!starts) errors.starts_at = starts === null ? "Enter the date and time." : "Enter a date and time.";
    if (n !== null && (isNaN(n) || n < 1 || n > 1440)) errors.duration_minutes = "Use a whole number of minutes from 1 to 1440.";
    if (join) { if (join.length > URL_MAX) errors.join_url = "Keep the link to " + URL_MAX + " characters."; else if (!/^https:\/\/[^\s\/]+/.test(join)) errors.join_url = "Use an https link."; }
    if (hasErrors(errors)) return { errors: errors };
    var body = { title: title, starts_at: starts, description: description, join_url: join || null, active: !!v.active };
    if (n !== null) body.duration_minutes = n;
    return { body: body };
  }
  /* Moves item `id` one place up (-1) or down (+1) inside the visible ids, leaving the hidden ones where they are; returns the whole list of
     ids in the new order, or null when it cannot move. */
  function moved(all, visible, id, dir) {
    var at = visible.indexOf(id), to = at + dir;
    if (at < 0 || to < 0 || to >= visible.length) return null;
    var a = all.indexOf(visible[at]), b = all.indexOf(visible[to]);
    if (a < 0 || b < 0) return null;
    var out = all.slice(); out[a] = visible[to]; out[b] = visible[at];
    return out;
  }
  function upsert(list, x) {
    var out = [], found = false;
    list.forEach(function (y) { if (y.id === x.id) { out.push(x); found = true; } else out.push(y); });
    if (!found) out.push(x);
    return out;
  }
  function byIds(rows, ids) {
    var map = {}; rows.forEach(function (r) { map[r.id] = r; });
    return ids.map(function (i) { return map[i]; }).filter(Boolean);
  }
  function courseChip(c) { return c.archived_at ? ["neutral", "Archived"] : c.active ? ["ok", "On"] : ["neutral", "Off"]; }
  function liveChip(l, now) {
    if (!l.active) return ["neutral", "Off"];
    var end = new Date(l.starts_at).getTime() + (l.duration_minutes || 60) * 60000;
    return end <= now.getTime() ? ["neutral", "Ended"] : ["ok", "Upcoming"];
  }
  function tabOf(search) { return /[?&]tab=archive(&|#|$)/.test(search == null ? location.search : search) ? "archive" : "courses"; }
  function queryId(search) { var m = /[?&]id=([^&#]*)/.exec(search == null ? location.search : search); return m && ID_RE.test(m[1]) ? m[1] : ""; }

  /* ---------- load ---------- */

  function siteQuery() { var m = /[?&]site=(site_[0-9a-z]{20})/.exec(location.search); return m ? "site=" + m[1] : ""; }
  function href(path, extra) {
    var q = [];
    if (extra) q.push(extra);
    if (S && S.site && siteQuery()) q.push(siteQuery());
    return path + (q.length ? "?" + q.join("&") : "");
  }
  function link(label, to, cls) {
    var a = D.el("a", { "class": cls || "tr-link", href: to }, label);
    return a;
  }
  function go(to) { if (D.go) D.go(to); else location.assign(to); }

  function show(view) {
    var mine = ++token, r = clear(byId(ROOTS[view]));
    if (S && S.sc) S.sc.stop();
    S = { view: view, site: null, courses: [], live: [], course: null, tab: tabOf(), editing: "", confirm: "", adding: "", lesson: null };
    r.setAttribute("aria-busy", "true");
    add(r, h("p", "tr-meta", "Loading…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!res.ok) { failedPanel(); return; }
      if (!sites.length) { unavailable(); return; }
      S.site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      read(mine);
    });
  }
  function hide(view) { token++; if (S && S.sc) S.sc.stop(); S = null; say(""); var r = byId(ROOTS[view]); if (r) clear(r); }
  function read(mine) {
    var view = S.view, path;
    if (view === "training") path = base() + "courses/";
    else if (view === "training-live") path = base() + "live/";
    else {
      var id = queryId();
      if (!id) { missingCourse(); return; }
      S.courseId = id; path = base() + "courses/" + id + "/";
    }
    D.call("GET", path, null, true).then(function (res) {
      if (mine !== token || !S || res.status === 401) return;
      if (res.status === 404) { if (view === "training-course") { missingCourse(); return; } unavailable(); return; }
      if (!res.ok) { failedPanel(res.status === 403 ? msgOf(res, "") : ""); return; }
      var d = res.data || {};
      if (view === "training") S.courses = Array.isArray(d.courses) ? d.courses : [];
      else if (view === "training-live") S.live = Array.isArray(d.live) ? d.live : [];
      else { S.course = d; if (!Array.isArray(S.course.modules)) S.course.modules = []; }
      render(); setNav(true);
      if (view === "training") sharedList(mine);
    });
  }
  /* "From <source store>": what the content source offers, and the Share switch when this site is the source (shared-content.js). */
  function sharedList(mine) {
    if (!window.NOShared || S.sc) return;
    S.sc = window.NOShared.create({ kind: "course", site: S.site, changed: function () { reloadCourses(); } });
    S.sc.load(function () { if (mine === token && S) render(); });
  }
  function reloadCourses() {
    var mine = token;
    D.call("GET", base() + "courses/", null, true).then(function (res) {
      if (mine !== token || !S || res.status === 401 || !res.ok) return;
      S.courses = Array.isArray(res.data && res.data.courses) ? res.data.courses : S.courses; render();
    });
  }
  function setNav(on) { Array.prototype.forEach.call(document.querySelectorAll("[data-training-nav]"), function (n) { n.hidden = !on; }); }
  /* The links stay hidden until the API shows Training is open for this site (a 404 means members are off or it is not a Santé site). */
  function probe() {
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!sites.length) return;
      var site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      D.call("GET", "/sites/" + site + "/training/courses/", null, true).then(function (r) { if (r.ok) setNav(true); });
    });
  }

  function card(id, title, chip) {
    var s = h("section", "tr-card"); s.setAttribute("aria-labelledby", "tr-h-" + id);
    var t = h("h2", "tr-h2", title); t.setAttribute("id", "tr-h-" + id);
    add(s, add(h("div", "tr-head"), t, chip ? h("span", "chip chip-" + chip[0], chip[1]) : null));
    return s;
  }
  function failedPanel(extra) {
    var r = clear(root()); r.removeAttribute("aria-busy");
    var s = card("err", "We couldn’t load Training");
    s.setAttribute("role", "alert");
    var view = S ? S.view : "training";
    add(s, h("p", "tr-lead", extra || "Check your connection and try again. Nothing was changed."), btn("Try again", "ghost", function () { show(view); }));
    r.appendChild(s);
    setNav(false);
  }
  function unavailable() {
    var r = clear(root()); r.removeAttribute("aria-busy");
    r.appendChild(add(card("off", "Training is not available yet"), h("p", "tr-lead", "It is not open for this site right now. Nothing is wrong with your account.")));
    setNav(false);
  }
  function missingCourse() {
    var r = clear(root()); r.removeAttribute("aria-busy");
    r.appendChild(add(card("gone", "We can’t find that course"), h("p", "tr-lead", "It may have been deleted."), link("Back to your courses", href("/training/"), "no-btn no-btn-ghost")));
  }

  /* The three linked tabs: Courses, Archive and Live trainings. */
  function tabs(active) {
    var nav = h("nav", "tr-tabs"); nav.setAttribute("aria-label", "Training");
    [["courses", "Courses", href("/training/")], ["archive", "Archive", href("/training/", "tab=archive")], ["live", "Live trainings", href("/training/live/")]].forEach(function (t) {
      var a = D.el("a", { "class": "tr-tab", href: t[2] }, t[1]);
      if (t[0] === active) a.setAttribute("aria-current", "page");
      if (t[0] === "courses" || t[0] === "archive") a.addEventListener("click", function (e) { /* these two stay on this page: only the list changes */
        if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !S || S.view !== "training") return;
        e.preventDefault();
        if (S.tab !== t[0]) { try { history.pushState(null, "", t[2]); } catch (x) { /* ignore */ } S.tab = t[0]; S.confirm = ""; render(); }
      });
      nav.appendChild(a);
    });
    return nav;
  }
  function render() {
    var r = clear(root()); r.removeAttribute("aria-busy");
    if (S.view === "training") renderCourses(r);
    else if (S.view === "training-live") renderLive(r);
    else renderCourse(r);
  }

  /* ---------- field helpers ---------- */

  function field(id, label, input, hint) {
    var w = h("div", "tr-field"), lab = h("label", "tr-label", label), err = h("p", "tr-error");
    lab.setAttribute("for", id); input.setAttribute("id", id); err.setAttribute("id", id + "-err"); err.hidden = true;
    input.trErr = err;
    var tip = hint ? h("p", "tr-hint", hint) : null;
    if (tip) { tip.setAttribute("id", id + "-hint"); input.setAttribute("aria-describedby", id + "-hint"); input.setAttribute("data-hint", id + "-hint"); }
    return add(w, lab, input, tip, err);
  }
  function markBad(input, text) {
    var err = input.trErr; if (!err) return;
    err.textContent = text; err.hidden = false;
    input.classList.add("tr-invalid"); input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", (input.getAttribute("data-hint") ? input.getAttribute("data-hint") + " " : "") + err.id);
  }
  function markOk(input) {
    var err = input.trErr;
    if (err) { err.hidden = true; err.textContent = ""; }
    input.classList.remove("tr-invalid"); input.removeAttribute("aria-invalid");
    if (input.getAttribute("data-hint")) input.setAttribute("aria-describedby", input.getAttribute("data-hint")); else input.removeAttribute("aria-describedby");
  }
  function showFields(f, errors) {
    var first = null;
    Object.keys(f).forEach(function (k) { markOk(f[k]); });
    Object.keys(errors || {}).forEach(function (k) {
      var box = f[k]; if (box) { var m = errors[k]; markBad(box, String(Array.isArray(m) ? m[0] : m)); if (!first) first = box; }
    });
    if (first) first.focus();
    return !!first;
  }
  function input(cls, type, name, max) {
    var a = { "class": "tr-input" + (cls ? " " + cls : ""), type: type, name: name, autocomplete: "off" };
    if (max) a.maxlength = String(max);
    return D.el("input", a);
  }
  function textarea(name, max, rows) { return D.el("textarea", { "class": "tr-input tr-textarea", name: name, rows: String(rows || 4), maxlength: String(max) }); }
  function checkbox(id, label, on) {
    var box = D.el("input", { type: "checkbox", name: id, id: id }); box.checked = !!on;
    var lab = h("label", "tr-label", label); lab.setAttribute("for", id);
    return { box: box, wrap: add(h("div", "tr-field tr-check"), box, lab) };
  }
  function fileInput() { return D.el("input", { "class": "tr-input", type: "file", name: "file", accept: "image/jpeg,image/png,image/webp" }); }
  function httpsPic(url) { return typeof url === "string" && /^https:\/\//.test(url) ? url : ""; }
  function thumb(url) {
    var u = httpsPic(url);
    return u ? D.el("img", { "class": "tr-thumb", src: u, alt: "", width: "96", height: "96", loading: "lazy" }) : null;
  }
  /* The picture step after a row is saved: upload the chosen file, or remove the attached one. done(latest row or null, sentence on failure). */
  function picture(path, chosen, removing, mine, done) {
    if (!chosen && !removing) { done(null, ""); return; }
    var req;
    if (chosen) { var form = new FormData(); form.append("file", chosen); req = D.send("POST", path, form); }
    else req = D.call("DELETE", path, null, true);
    req.then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (res.ok) { done(res.data, ""); return; }
      var code = res.data && res.data.code;
      var text = res.status === 503 || code === "image_store_not_configured" ? "Picture upload is not set up yet. It was saved without the picture."
        : res.status === 502 || code === "image_not_saved" ? "The picture was not saved. Please try again."
        : (res.data && res.data.fields && res.data.fields.file ? String(Array.isArray(res.data.fields.file) ? res.data.fields.file[0] : res.data.fields.file) : msgOf(res, "The picture was not saved. Please try again."));
      done(null, text);
    });
  }
  function pictureControls(s, label, current, idPrefix) {
    var file = fileInput(), state = { remove: false };
    if (httpsPic(current)) {
      var img = thumb(current), note = h("p", "tr-meta", "A picture is attached."), rm;
      rm = btn("Remove picture", "ghost", function () { state.remove = true; note.textContent = "The picture will be removed when you save."; rm.disabled = true; });
      s.appendChild(add(h("div", "tr-field tr-pic"), img, add(h("div", "tr-pic-side"), note, rm)));
    }
    s.appendChild(field(idPrefix + "-file", httpsPic(current) ? "Replace " + label : label[0].toUpperCase() + label.slice(1), file, "Optional. JPEG, PNG or WebP, up to 2 MB."));
    return { file: file, state: state };
  }
  function apiFields(res) { return res && res.data && res.data.fields ? res.data.fields : null; }

  /* ---------- /training/: the course list ---------- */

  function renderCourses(r) {
    var archived = S.tab === "archive", rows = S.courses.filter(function (c) { return archived === !!c.archived_at; });
    r.appendChild(tabs(archived ? "archive" : "courses"));
    if (S.adding === "course" && !archived) r.appendChild(newCourseCard());
    var s = card("list", archived ? "Archive" : "Courses");
    add(s, h("p", "tr-lead", archived ? "Archived courses are hidden from your members. Restore one to bring it back, switched off." : "Your members learn from the courses that are On, in this order. Open a course to add its modules and lessons."));
    if (!archived && S.adding !== "course") s.appendChild(add(h("div", "tr-actions"), btn("New course", "primary", function () { S.adding = "course"; S.confirm = ""; render(); var t = byId("tr-new-title"); if (t) t.focus(); })));
    if (!rows.length) s.appendChild(h("p", "tr-meta", archived ? "No archived courses." : "No courses yet."));
    else {
      var ul = h("ul", "tr-list"), ids = rows.map(function (c) { return c.id; });
      rows.forEach(function (c, i) { ul.appendChild(courseRow(c, i, rows.length, ids)); });
      s.appendChild(ul);
    }
    r.appendChild(s);
    if (S.sc && !archived) r.appendChild(S.sc.el);
  }
  function courseRow(c, i, n, visible) {
    var li = h("li", "tr-row"), st = courseChip(c), nl = c.lesson_count || 0, ml = c.module_count || 0;
    li.setAttribute("data-course", c.id);
    var main = add(h("div", "tr-row-main"), add(h("div", "tr-row-head"), h("span", "chip chip-" + st[0], st[1])), h("h3", "tr-row-title", c.title));
    main.appendChild(h("p", "tr-meta", plural(ml, "module", "modules") + " · " + plural(nl, "lesson", "lessons") + (nl && c.active_lesson_count !== nl ? " (" + c.active_lesson_count + " on)" : "")));
    if (c.copied_from && !c.active && !c.archived_at) main.appendChild(h("p", "tr-meta tr-review", "Review and publish"));
    if (S.sc && S.sc.isSource() && !c.archived_at) main.appendChild(window.NOShared.shareSwitch("tr-share-" + c.id, c.shared, function (on, box) {
      var mine = token; box.disabled = true;
      D.call("PATCH", base() + "courses/" + c.id + "/", { shared: on }, true).then(function (res) {
        if (res.status === 401 || mine !== token || !S) return;
        if (!res.ok) { box.disabled = false; box.checked = !on; D.toast("That did not work", msgOf(res, "We could not change the course. Please try again."), "error"); return; }
        S.courses = upsert(S.courses, res.data); render();
      });
    }));
    var acts = h("div", "tr-row-actions");
    add(acts, link("Edit", href("/training/course/", "id=" + c.id), "no-btn no-btn-ghost"));
    if (!c.archived_at) {
      var up = btn("Up", "ghost", function (b) { reorderCourse(b, c.id, -1, visible); }), dn = btn("Down", "ghost", function (b) { reorderCourse(b, c.id, 1, visible); });
      up.setAttribute("aria-label", "Move " + c.title + " up"); dn.setAttribute("aria-label", "Move " + c.title + " down");
      up.disabled = i === 0; dn.disabled = i === n - 1;
      add(acts, up, dn, btn(c.active ? "Turn off" : "Turn on", "ghost", function (b) { patchCourse(b, c, { active: !c.active }, c.active ? "The course is off." : "The course is on."); }));
      add(acts, btn("Archive", "ghost", function (b) { patchCourse(b, c, { archived: true }, "The course was archived."); }));
    } else add(acts, btn("Restore", "ghost", function (b) { patchCourse(b, c, { archived: false }, "The course was restored. It is off until you turn it on."); }));
    add(acts, btn(S.confirm === c.id ? "Confirm delete" : "Delete", "danger", function (b) { removeCourse(b, c); }));
    var img = thumb(c.image_url);
    if (img) li.appendChild(img);
    return add(li, main, acts);
  }
  function newCourseCard() {
    var s = card("new", "New course"), title = input("", "text", "title", TITLE_MAX), f = { title: title };
    add(s, field("tr-new-title", "Title", title, "You add the modules and lessons on the next page."));
    add(s, add(h("div", "tr-actions"), btn("Create course", "primary", function (b) {
      var built = buildCourse({ title: title.value, description: "", active: false });
      if (built.errors) { showFields(f, built.errors); return; }
      showFields(f, {});
      var mine = token; busy(b, true);
      D.call("POST", base() + "courses/", { title: built.body.title }, true).then(function (res) {
        if (res.status === 401 || mine !== token || !S) return;
        busy(b, false);
        if (!res.ok) { if (res.status === 404) { unavailable(); return; } if (!showFields(f, apiFields(res))) D.toast("That did not work", msgOf(res, "We could not create the course. Please try again."), "error"); return; }
        D.toast("Course created", "Add its modules and lessons, then turn it on."); go(href("/training/course/", "id=" + res.data.id));
      });
    }), btn("Cancel", "ghost", function () { S.adding = ""; render(); })));
    return s;
  }
  function patchCourse(b, c, body, done) {
    var mine = token; busy(b, true);
    D.call("PATCH", base() + "courses/" + c.id + "/", body, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok) { busy(b, false); D.toast("That did not work", msgOf(res, "We could not change the course. Please try again."), "error"); return; }
      S.courses = upsert(S.courses, res.data); S.confirm = ""; render(); say(done);
      D.toast("Saved", done);
    });
  }
  function reorderCourse(b, id, dir, visible) {
    var ids = moved(S.courses.map(function (c) { return c.id; }), visible, id, dir);
    if (!ids) return;
    var mine = token; busy(b, true);
    D.call("POST", base() + "courses/reorder/", { ids: ids }, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok) { busy(b, false); D.toast("That did not work", msgOf(res, "We could not move the course. Please try again."), "error"); return; }
      S.courses = res.data && Array.isArray(res.data.courses) ? res.data.courses : byIds(S.courses, ids); render(); say("Course moved.");
    });
  }
  function removeCourse(b, c) {
    if (S.confirm !== c.id) { S.confirm = c.id; render(); return; }
    var mine = token; busy(b, true);
    D.call("DELETE", base() + "courses/" + c.id + "/", null, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok) { busy(b, false); D.toast("That did not work", msgOf(res, "We could not delete the course. Please try again."), "error"); return; }
      S.courses = S.courses.filter(function (x) { return x.id !== c.id; }); S.confirm = ""; render();
      D.toast("Deleted", "The course, its modules and lessons were deleted."); say("Course deleted.");
    });
  }

  /* ---------- /training/course/?id=: the course editor ---------- */

  function renderCourse(r) {
    var c = S.course;
    var back = link("← Your courses", href("/training/"), "tr-back"); r.appendChild(back);
    r.appendChild(courseCard(c));
    r.appendChild(modulesCard(c));
  }
  function courseCard(c) {
    var st = courseChip(c), s = card("course", "Course details", st);
    var title = input("", "text", "title", TITLE_MAX); title.value = c.title || "";
    var desc = textarea("description", DESC_MAX, 4); desc.value = c.description || "";
    var on = checkbox("tr-active", "Show to members", c.active);
    add(s, field("tr-title", "Title", title), field("tr-description", "Description", desc, "Optional. Plain text; line breaks are kept."), on.wrap);
    if (c.archived_at) s.appendChild(h("p", "tr-meta", "This course is archived. Restore it from the Archive tab to show it to members."));
    var pic = pictureControls(s, "cover picture", c.image_url, "tr-cover");
    var f = { title: title, description: desc, file: pic.file };
    s.appendChild(add(h("div", "tr-actions"), btn("Save course", "primary", function (b) {
      var built = buildCourse({ title: title.value, description: desc.value, active: on.box.checked });
      var chosen = pic.file.files && pic.file.files[0] ? pic.file.files[0] : null, errors = built.errors || {}, pe = pictureError(chosen);
      if (pe) errors.file = pe;
      if (built.errors || pe) { showFields(f, errors); return; }
      showFields(f, {});
      var mine = token, body = built.body; busy(b, true);
      if (c.archived_at) delete body.active; /* switching it on would bring it back from the Archive; that is Restore's job */
      D.call("PATCH", base() + "courses/" + c.id + "/", body, true).then(function (res) {
        if (res.status === 401 || mine !== token || !S) return;
        if (!res.ok) { busy(b, false); if (res.status === 404) { missingCourse(); return; } if (!showFields(f, apiFields(res))) D.toast("That did not work", msgOf(res, "We could not save. Please try again."), "error"); return; }
        keepCourse(res.data);
        picture(base() + "courses/" + c.id + "/image/", chosen, pic.state.remove && !chosen, mine, function (final, failed) {
          busy(b, false);
          if (final) keepCourse(final);
          render();
          if (failed) { var box = byId("tr-cover-file"); if (box) { markBad(box, failed); box.focus(); } D.toast("Saved, but the picture was not added", failed, "error"); return; }
          D.toast("Saved", "The course was updated."); say("Course saved.");
        });
      });
    })));
    return s;
  }
  function keepCourse(row) { /* the course row has no modules; keep the tree */
    var modules = S.course.modules; S.course = row; S.course.modules = modules;
  }
  function modulesCard(c) {
    var s = card("modules", "Modules and lessons");
    add(s, h("p", "tr-lead", "Members go through the lessons in this order, and each lesson unlocks after the one before it."));
    var ids = c.modules.map(function (m) { return m.id; });
    if (!c.modules.length) s.appendChild(h("p", "tr-meta", "No modules yet. Add the first one below."));
    c.modules.forEach(function (m, i) { s.appendChild(moduleBlock(m, i, c.modules.length, ids)); });
    var title = input("", "text", "title", TITLE_MAX), f = { title: title }, add_ = h("div", "tr-add");
    add(add_, field("tr-newmod", "New module", title, "Example: Getting started."), add(h("div", "tr-actions"), btn("Add module", "primary", function (b) {
      var built = buildModule({ title: title.value });
      if (built.errors) { showFields(f, built.errors); return; }
      showFields(f, {});
      var mine = token; busy(b, true);
      D.call("POST", base() + "courses/" + c.id + "/modules/", built.body, true).then(function (res) {
        if (res.status === 401 || mine !== token || !S) return;
        busy(b, false);
        if (!res.ok) { if (!showFields(f, apiFields(res))) D.toast("That did not work", msgOf(res, "We could not add the module. Please try again."), "error"); return; }
        var m = res.data; if (!Array.isArray(m.lessons)) m.lessons = [];
        S.course.modules = upsert(S.course.modules, m); render(); say("Module added.");
      });
    })));
    s.appendChild(add_);
    return s;
  }
  function moduleBlock(m, i, n, ids) {
    var box = h("section", "tr-module"); box.setAttribute("data-module", m.id); box.setAttribute("aria-label", "Module: " + m.title);
    var title = input("", "text", "title", TITLE_MAX); title.value = m.title || ""; title.setAttribute("aria-label", "Module title");
    var on = checkbox("tr-mon-" + m.id, "On", m.active);
    var f = { title: title };
    var head = add(h("div", "tr-mod-head"), add(h("div", "tr-field tr-mod-title"), title, title.trErr = h("p", "tr-error")), on.wrap);
    title.trErr.hidden = true; title.trErr.setAttribute("id", "tr-mt-" + m.id + "-err");
    var acts = h("div", "tr-row-actions");
    var up = btn("Up", "ghost", function (b) { reorderModule(b, m.id, -1, ids); }), dn = btn("Down", "ghost", function (b) { reorderModule(b, m.id, 1, ids); });
    up.setAttribute("aria-label", "Move " + m.title + " up"); dn.setAttribute("aria-label", "Move " + m.title + " down");
    up.disabled = i === 0; dn.disabled = i === n - 1;
    add(acts, btn("Save module", "primary", function (b) {
      var built = buildModule({ title: title.value, active: on.box.checked });
      if (built.errors) { showFields(f, built.errors); return; }
      showFields(f, {});
      var mine = token; busy(b, true);
      D.call("PATCH", base() + "modules/" + m.id + "/", built.body, true).then(function (res) {
        if (res.status === 401 || mine !== token || !S) return;
        busy(b, false);
        if (!res.ok) { if (!showFields(f, apiFields(res))) D.toast("That did not work", msgOf(res, "We could not save the module. Please try again."), "error"); return; }
        m.title = res.data.title; m.active = res.data.active; render(); D.toast("Saved", "The module was updated."); say("Module saved.");
      });
    }), up, dn, btn(S.confirm === m.id ? "Confirm delete" : "Delete module", "danger", function (b) { removeModule(b, m); }));
    add(box, head, acts);
    if (S.confirm === m.id) box.appendChild(h("p", "tr-meta tr-warn", "This deletes the module and its " + plural(m.lessons.length, "lesson", "lessons") + ". Press Confirm delete to continue."));
    var ul = h("ul", "tr-lessons"), lids = m.lessons.map(function (l) { return l.id; });
    m.lessons.forEach(function (l, j) { ul.appendChild(lessonRow(m, l, j, m.lessons.length, lids)); });
    if (!m.lessons.length) box.appendChild(h("p", "tr-meta", "No lessons in this module yet."));
    else box.appendChild(ul);
    if (S.lesson && S.lesson.module === m.id && !S.lesson.id) box.appendChild(lessonForm(m, null));
    else box.appendChild(add(h("div", "tr-actions"), btn("Add lesson", "ghost", function () { S.lesson = { module: m.id, id: "" }; S.confirm = ""; render(); var t = byId("tr-lt"); if (t) t.focus(); })));
    return box;
  }
  function reorderModule(b, id, dir, ids) {
    var next = moved(ids, ids, id, dir);
    if (!next) return;
    var mine = token; busy(b, true);
    D.call("POST", base() + "courses/" + S.course.id + "/modules/reorder/", { ids: next }, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok) { busy(b, false); D.toast("That did not work", msgOf(res, "We could not move the module. Please try again."), "error"); return; }
      S.course.modules = res.data && Array.isArray(res.data.modules) ? res.data.modules : byIds(S.course.modules, next);
      S.course.modules.forEach(function (m) { if (!Array.isArray(m.lessons)) m.lessons = []; });
      render(); say("Module moved.");
    });
  }
  function removeModule(b, m) {
    if (S.confirm !== m.id) { S.confirm = m.id; render(); return; }
    var mine = token; busy(b, true);
    D.call("DELETE", base() + "modules/" + m.id + "/", null, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok) { busy(b, false); D.toast("That did not work", msgOf(res, "We could not delete the module. Please try again."), "error"); return; }
      S.course.modules = S.course.modules.filter(function (x) { return x.id !== m.id; }); S.confirm = ""; render();
      D.toast("Deleted", "The module and its lessons were deleted."); say("Module deleted.");
    });
  }

  function lessonRow(m, l, j, n, lids) {
    if (S.lesson && S.lesson.id === l.id) { var li0 = h("li", "tr-lesson tr-lesson-edit"); li0.appendChild(lessonForm(m, l)); return li0; }
    var li = h("li", "tr-lesson"); li.setAttribute("data-lesson", l.id);
    var main = add(h("div", "tr-row-main"), h("h4", "tr-lesson-title", l.title));
    var bits = [l.duration || "", l.video_url ? "Video" : l.needs_video ? "Add your video" : "No video"].filter(Boolean);
    var meta = h("p", "tr-meta", bits.join(" · ")); if (!l.active) meta.appendChild(h("span", "chip chip-neutral tr-off", "Off"));
    main.appendChild(meta);
    var acts = h("div", "tr-row-actions");
    var up = btn("Up", "ghost", function (b) { reorderLesson(b, m, l.id, -1, lids); }), dn = btn("Down", "ghost", function (b) { reorderLesson(b, m, l.id, 1, lids); });
    up.setAttribute("aria-label", "Move " + l.title + " up"); dn.setAttribute("aria-label", "Move " + l.title + " down");
    up.disabled = j === 0; dn.disabled = j === n - 1;
    add(acts, btn("Edit", "ghost", function () { S.lesson = { module: m.id, id: l.id }; S.confirm = ""; render(); var t = byId("tr-lt"); if (t) t.focus(); }), up, dn,
      btn(S.confirm === l.id ? "Confirm delete" : "Delete", "danger", function (b) { removeLesson(b, m, l); }));
    var img = thumb(l.image_url); if (img) li.appendChild(img);
    return add(li, main, acts);
  }
  function reorderLesson(b, m, id, dir, lids) {
    var next = moved(lids, lids, id, dir);
    if (!next) return;
    var mine = token; busy(b, true);
    D.call("POST", base() + "modules/" + m.id + "/lessons/reorder/", { ids: next }, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok) { busy(b, false); D.toast("That did not work", msgOf(res, "We could not move the lesson. Please try again."), "error"); return; }
      m.lessons = res.data && Array.isArray(res.data.lessons) ? res.data.lessons : byIds(m.lessons, next); render(); say("Lesson moved.");
    });
  }
  function removeLesson(b, m, l) {
    if (S.confirm !== l.id) { S.confirm = l.id; render(); return; }
    var mine = token; busy(b, true);
    D.call("DELETE", base() + "lessons/" + l.id + "/", null, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok) { busy(b, false); D.toast("That did not work", msgOf(res, "We could not delete the lesson. Please try again."), "error"); return; }
      m.lessons = m.lessons.filter(function (x) { return x.id !== l.id; }); S.confirm = ""; render();
      D.toast("Deleted", "The lesson was deleted."); say("Lesson deleted.");
    });
  }
  function lessonForm(m, l) {
    var s = h("div", "tr-form");
    s.appendChild(h("h4", "tr-lesson-title", l ? "Edit lesson" : "New lesson"));
    var title = input("", "text", "title", LESSON_TITLE_MAX); title.value = l ? l.title : "";
    var video = input("", "url", "video_url", URL_MAX); video.value = l && l.video_url ? l.video_url : "";
    var dur = input("", "text", "duration", DUR_MAX); dur.value = l ? l.duration || "" : "";
    var desc = textarea("description", LESSON_DESC_MAX, 5); desc.value = l ? l.description || "" : "";
    var on = checkbox("tr-lon", "Show to members", l ? l.active : true);
    add(s, field("tr-lt", "Title", title), field("tr-lv", "Video link", video, "Paste a YouTube or Vimeo link. We turn it into an embed link for you."), field("tr-ld", "Duration", dur, "Optional. Shown as typed, for example 6:30."), field("tr-ldesc", "Description", desc, "Optional. Plain text; line breaks are kept."), on.wrap);
    var pic = pictureControls(s, "lesson picture", l ? l.image_url : "", "tr-lp");
    var f = { title: title, video_url: video, duration: dur, description: desc, file: pic.file };
    add(s, add(h("div", "tr-actions"), btn("Save lesson", "primary", function (b) {
      var built = buildLesson({ title: title.value, video_url: video.value, duration: dur.value, description: desc.value, active: on.box.checked });
      var chosen = pic.file.files && pic.file.files[0] ? pic.file.files[0] : null, errors = built.errors || {}, pe = pictureError(chosen);
      if (pe) errors.file = pe;
      if (built.errors || pe) { showFields(f, errors); return; }
      showFields(f, {});
      var mine = token; busy(b, true);
      D.call(l ? "PATCH" : "POST", l ? base() + "lessons/" + l.id + "/" : base() + "modules/" + m.id + "/lessons/", built.body, true).then(function (res) {
        if (res.status === 401 || mine !== token || !S) return;
        if (!res.ok) { busy(b, false); if (!showFields(f, apiFields(res))) D.toast("That did not work", msgOf(res, "We could not save the lesson. Please try again."), "error"); return; }
        var saved = res.data; m.lessons = upsert(m.lessons, saved);
        picture(base() + "lessons/" + saved.id + "/image/", chosen, pic.state.remove && !chosen, mine, function (final, failed) {
          busy(b, false);
          if (final) m.lessons = upsert(m.lessons, final);
          if (failed) {
            S.lesson = { module: m.id, id: saved.id }; render();
            var box = byId("tr-lp-file"); if (box) { markBad(box, failed); box.focus(); }
            D.toast("Saved, but the picture was not added", failed, "error"); return;
          }
          S.lesson = null; render(); D.toast("Saved", l ? "The lesson was updated." : "The lesson was added."); say("Lesson saved.");
        });
      });
    }), btn("Cancel", "ghost", function () { S.lesson = null; render(); })));
    return s;
  }

  /* ---------- /training/live/: live trainings ---------- */

  function renderLive(r) {
    r.appendChild(tabs("live"));
    if (S.editing) r.appendChild(liveForm(S.editing === "new" ? null : findLive(S.editing)));
    var s = card("live", "Live trainings");
    add(s, h("p", "tr-lead", "Your members see the next live training that has not ended on their Training page. A new one that is on rings their bell."));
    if (!S.editing) s.appendChild(add(h("div", "tr-actions"), btn("New live training", "primary", function () { S.editing = "new"; S.confirm = ""; render(); var t = byId("tl-title"); if (t) t.focus(); })));
    if (!S.live.length) s.appendChild(h("p", "tr-meta", "No live trainings yet."));
    else {
      var ul = h("ul", "tr-list"), now = new Date();
      S.live.slice().sort(function (a, b) { return new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(); }).forEach(function (l) { ul.appendChild(liveRow(l, now)); });
      s.appendChild(ul);
    }
    r.appendChild(s);
  }
  function findLive(id) { for (var i = 0; i < S.live.length; i++) { if (S.live[i].id === id) return S.live[i]; } return null; }
  function liveRow(l, now) {
    var li = h("li", "tr-row"), st = liveChip(l, now);
    li.setAttribute("data-live", l.id);
    var main = add(h("div", "tr-row-main"), add(h("div", "tr-row-head"), h("span", "chip chip-" + st[0], st[1])), h("h3", "tr-row-title", l.title));
    main.appendChild(h("p", "tr-meta", whenText(l.starts_at) + " · " + plural(l.duration_minutes || 60, "minute", "minutes")));
    var acts = h("div", "tr-row-actions");
    add(acts, btn("Edit", "ghost", function () { S.editing = l.id; S.confirm = ""; render(); var t = byId("tl-title"); if (t) t.focus(); }),
      btn(S.confirm === l.id ? "Confirm delete" : "Delete", "danger", function (b) { removeLive(b, l); }));
    var img = thumb(l.thumbnail_url); if (img) li.appendChild(img);
    return add(li, main, acts);
  }
  function liveForm(l) {
    var s = card("liveform", l ? "Edit live training" : "New live training");
    var title = input("", "text", "title", TITLE_MAX); title.value = l ? l.title : "";
    var starts = input("", "datetime-local", "starts_at"); starts.value = l ? toLocal(l.starts_at) : "";
    var mins = input("", "number", "duration_minutes"); mins.setAttribute("min", "1"); mins.setAttribute("max", "1440"); mins.setAttribute("inputmode", "numeric"); mins.value = l ? String(l.duration_minutes || 60) : "60";
    var join = input("", "url", "join_url", URL_MAX); join.value = l && l.join_url ? l.join_url : "";
    var desc = textarea("description", DESC_MAX, 4); desc.value = l ? l.description || "" : "";
    var on = checkbox("tl-active", "Show to members", l ? l.active : true);
    add(s, field("tl-title", "Title", title), field("tl-starts", "Starts (Philippine time)", starts), field("tl-mins", "Length in minutes", mins), field("tl-join", "Join link", join, "Optional. The https link your members open to join, such as a Zoom or Google Meet link."), field("tl-desc", "Description", desc, "Optional. Plain text; line breaks are kept."), on.wrap);
    var pic = pictureControls(s, "thumbnail", l ? l.thumbnail_url : "", "tl-pic");
    var f = { title: title, starts_at: starts, duration_minutes: mins, join_url: join, description: desc, file: pic.file };
    add(s, add(h("div", "tr-actions"), btn("Save", "primary", function (b) {
      var built = buildLive({ title: title.value, starts: starts.value, minutes: mins.value, join_url: join.value, description: desc.value, active: on.box.checked });
      var chosen = pic.file.files && pic.file.files[0] ? pic.file.files[0] : null, errors = built.errors || {}, pe = pictureError(chosen);
      if (pe) errors.file = pe;
      if (built.errors || pe) { showFields(f, errors); return; }
      showFields(f, {});
      var mine = token; busy(b, true);
      D.call(l ? "PATCH" : "POST", l ? base() + "live/" + l.id + "/" : base() + "live/", built.body, true).then(function (res) {
        if (res.status === 401 || mine !== token || !S) return;
        if (!res.ok) { busy(b, false); if (res.status === 404) { unavailable(); return; } if (!showFields(f, apiFields(res))) D.toast("That did not work", msgOf(res, "We could not save. Please try again."), "error"); return; }
        var saved = res.data; S.live = upsert(S.live, saved);
        picture(base() + "live/" + saved.id + "/thumbnail/", chosen, pic.state.remove && !chosen, mine, function (final, failed) {
          busy(b, false);
          if (final) S.live = upsert(S.live, final);
          if (failed) {
            S.editing = saved.id; render();
            var box = byId("tl-pic-file"); if (box) { markBad(box, failed); box.focus(); }
            D.toast("Saved, but the picture was not added", failed, "error"); return;
          }
          S.editing = ""; render(); D.toast("Saved", l ? "The live training was updated." : "The live training was added."); say("Saved.");
        });
      });
    }), btn("Cancel", "ghost", function () { S.editing = ""; render(); })));
    return s;
  }
  function removeLive(b, l) {
    if (S.confirm !== l.id) { S.confirm = l.id; render(); return; }
    var mine = token; busy(b, true);
    D.call("DELETE", base() + "live/" + l.id + "/", null, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok) { busy(b, false); D.toast("That did not work", msgOf(res, "We could not delete the live training. Please try again."), "error"); return; }
      S.live = S.live.filter(function (x) { return x.id !== l.id; }); S.confirm = ""; render();
      D.toast("Deleted", "The live training was deleted."); say("Live training deleted.");
    });
  }

  /* Back and Forward between the Courses and Archive tabs change only the query string, which the router does not treat as a new page. */
  window.addEventListener("popstate", function () {
    if (S && S.view === "training" && byId("tr-root") && byId("tr-root").firstChild) { var t = tabOf(); if (t !== S.tab) { S.tab = t; S.confirm = ""; render(); } }
  });

  window.NOTraining = { show: show, hide: hide, probe: probe, util: { toIso: toIso, toLocal: toLocal, whenText: whenText, toEmbed: toEmbed, pictureError: pictureError,
    buildCourse: buildCourse, buildModule: buildModule, buildLesson: buildLesson, buildLive: buildLive, moved: moved, upsert: upsert, courseChip: courseChip,
    liveChip: liveChip, tabOf: tabOf, queryId: queryId, ID_RE: ID_RE } };
})();
