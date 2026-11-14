/* Member notices (ClickUp z8uq9mezdh, /settings/notices/): the Announcements & promos the Subscriber shows on the members' dashboard.
   Reads GET /sites/{id}/member-notices/ and writes POST, PATCH .../{notice}/, DELETE .../{notice}/, and the picture with
   POST and DELETE .../{notice}/image/ (multipart `file`, JPEG, PNG or WebP up to 2 MB). Every status and string comes from the API and
   reaches the page through textContent or D.el only. Times are typed and shown in Philippine time and sent as ISO times with a zone.
   While the API answers 404 (members are switched off, or not a Santé site) the page says notices are not available yet and the
   Notices tab stays hidden (probe). Plain ES5. NONotices.util holds the pure helpers (tests/notices.test.mjs). */
(function () {
  var D = window.NODash;
  var token = 0, S = null;
  var TITLE_MAX = 120, BODY_MAX = 5000, PIC_MAX = 2 * 1024 * 1024, PIC_TYPES = ["image/jpeg", "image/png", "image/webp"];
  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/, LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
  var MANILA = 8 * 3600000; /* UTC+8, no daylight saving */

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(text) { var l = byId("nt-live"); if (l) l.textContent = text; }
  function msgOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function base() { return "/sites/" + S.site + "/member-notices/"; }
  function item(id) { return base() + id + "/"; }
  function btn(label, kind, fn) {
    var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost") + (kind === "danger" ? " nt-danger" : ""), label);
    b.setAttribute("type", "button");
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function busy(b, on) { if (!b) return; if (on) { b.setAttribute("aria-busy", "true"); b.disabled = true; } else { b.removeAttribute("aria-busy"); b.disabled = false; } }

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
  /* The reverse, for the box: an ISO time as "YYYY-MM-DDTHH:mm" in Philippine time; "" for none. */
  function toLocal(iso) {
    var t = iso ? new Date(iso).getTime() : NaN;
    if (isNaN(t)) return "";
    var d = new Date(t + MANILA);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes());
  }
  function whenText(iso) {
    var t = iso ? new Date(iso) : null;
    if (!t || isNaN(t.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(t);
  }
  /* [chip colour, text]: Off when not active, then Ended, Scheduled, or Live by the window. Start counts, end does not (as the API). */
  function statusOf(n, now) {
    if (!n.active) return ["neutral", "Off"];
    var t = now.getTime();
    if (n.ends_at && new Date(n.ends_at).getTime() <= t) return ["neutral", "Ended"];
    if (n.starts_at && new Date(n.starts_at).getTime() > t) return ["warn", "Scheduled"];
    return ["ok", "Live"];
  }
  function windowText(n) {
    var a = whenText(n.starts_at), b = whenText(n.ends_at);
    if (a && b) return a + " to " + b;
    return a ? "From " + a : b ? "Until " + b : "Always on";
  }
  function kindText(kind) { return kind === "promo" ? "Promo" : "Announcement"; }
  /* The form's values as the API body, or {errors: {field: text}}. Titles and bodies are sent as typed, trimmed. */
  function build(v) {
    var errors = {}, title = String(v.title || "").trim(), body = String(v.body || "").trim();
    var starts = toIso(v.starts), ends = toIso(v.ends);
    if (!title) errors.title = "Enter a title.";
    else if (title.length > TITLE_MAX) errors.title = "Keep the title to " + TITLE_MAX + " characters.";
    if (body.length > BODY_MAX) errors.body = "Keep the message to " + BODY_MAX + " characters.";
    if (starts === undefined) errors.starts_at = "Enter a date and time.";
    if (ends === undefined) errors.ends_at = "Enter a date and time.";
    if (!errors.starts_at && !errors.ends_at && starts && ends && new Date(ends).getTime() <= new Date(starts).getTime()) errors.ends_at = "The end must be after the start.";
    if (v.kind !== "announcement" && v.kind !== "promo") errors.kind = "Choose Announcement or Promo.";
    for (var k in errors) { if (Object.prototype.hasOwnProperty.call(errors, k)) return { errors: errors }; }
    return { body: { kind: v.kind, title: title, body: body, starts_at: starts, ends_at: ends, active: !!v.active } };
  }
  function pictureError(file) {
    if (!file) return "";
    if (PIC_TYPES.indexOf(file.type) < 0) return "Use a JPEG, PNG or WebP picture.";
    if (file.size > PIC_MAX) return "The picture is over 2 MB. Choose a smaller one.";
    return "";
  }
  function upsert(list, n) {
    var out = [], found = false;
    list.forEach(function (x) { if (x.id === n.id) { out.push(n); found = true; } else out.push(x); });
    if (!found) out.unshift(n);
    return out;
  }

  /* ---------- load ---------- */

  function show() {
    var mine = ++token, root = clear(byId("nt-root")); S = { site: null, notices: [], editing: null, confirm: "" };
    root.setAttribute("aria-busy", "true");
    add(root, h("p", "nt-meta", "Loading your notices…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!res.ok) { failedPanel(); return; }
      if (!sites.length) { unavailable(); return; }
      S.site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      read(mine);
    });
  }
  function hide() { token++; S = null; say(""); var r = byId("nt-root"); if (r) clear(r); }
  function read(mine) {
    D.call("GET", base(), null, true).then(function (res) {
      if (mine !== token || !S || res.status === 401) return;
      if (res.status === 404) { unavailable(); return; }
      if (!res.ok) { failedPanel(res.status === 403 ? msgOf(res, "") : ""); return; }
      S.notices = res.data && Array.isArray(res.data.notices) ? res.data.notices : [];
      render(); setNav(true);
    });
  }
  function setNav(on) { Array.prototype.forEach.call(document.querySelectorAll("[data-notices-nav]"), function (n) { n.hidden = !on; }); }
  /* The tab stays hidden until the API shows notices are open for this site (a 404 means members are off or it is not a Santé site). */
  function probe() {
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!sites.length) return;
      var site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      D.call("GET", "/sites/" + site + "/member-notices/", null, true).then(function (r) { if (r.ok) setNav(true); });
    });
  }

  function card(id, title, chip) {
    var s = h("section", "nt-card"); s.setAttribute("aria-labelledby", "nt-h-" + id);
    var t = h("h2", "nt-h2", title); t.setAttribute("id", "nt-h-" + id);
    add(s, add(h("div", "nt-head"), t, chip ? h("span", "chip chip-" + chip[0], chip[1]) : null));
    return s;
  }
  function failedPanel(extra) {
    var root = clear(byId("nt-root")); root.removeAttribute("aria-busy");
    var s = card("err", "We couldn’t load your notices");
    s.setAttribute("role", "alert");
    add(s, h("p", "nt-lead", extra || "Check your connection and try again. Nothing was changed."), btn("Try again", "ghost", show));
    root.appendChild(s);
    setNav(false);
  }
  function unavailable() {
    var root = clear(byId("nt-root")); root.removeAttribute("aria-busy");
    root.appendChild(add(card("off", "Notices are not available yet"), h("p", "nt-lead", "They are not open for this site right now. Nothing is wrong with your account.")));
    setNav(false);
  }

  /* ---------- the list ---------- */

  function render() {
    var root = clear(byId("nt-root")); root.removeAttribute("aria-busy");
    if (S.editing) root.appendChild(editor(S.editing));
    var s = card("list", "Announcements & promos");
    add(s, h("p", "nt-lead", "Your members see the notices that are on now at the top of their dashboard, and each new one rings their bell."));
    if (!S.editing) s.appendChild(add(h("div", "nt-actions"), btn("Add notice", "primary", function () { S.editing = { id: "" }; S.confirm = ""; render(); var t = byId("nt-title"); if (t) t.focus(); })));
    if (!S.notices.length) s.appendChild(h("p", "nt-meta", "No notices yet."));
    else {
      var ul = h("ul", "nt-list"), now = new Date();
      S.notices.forEach(function (n) { ul.appendChild(row(n, now)); });
      s.appendChild(ul);
    }
    root.appendChild(s);
  }
  function row(n, now) {
    var li = h("li", "nt-row"), st = statusOf(n, now);
    li.setAttribute("data-notice", n.id);
    var head = add(h("div", "nt-row-head"), h("span", "chip chip-" + (n.kind === "promo" ? "danger" : "neutral"), kindText(n.kind)), h("span", "chip chip-" + st[0], st[1]));
    var main = add(h("div", "nt-row-main"), head, h("h3", "nt-row-title", n.title));
    if (n.body) main.appendChild(h("p", "nt-row-body", n.body));
    main.appendChild(h("p", "nt-meta", windowText(n)));
    var acts = h("div", "nt-row-actions");
    add(acts, btn("Edit", "ghost", function () { S.editing = { id: n.id }; S.confirm = ""; render(); var t = byId("nt-title"); if (t) t.focus(); }));
    add(acts, btn(S.confirm === n.id ? "Confirm delete" : "Delete", "danger", function (b) { remove(b, n); }));
    if (typeof n.image_url === "string" && /^https:\/\//.test(n.image_url)) {
      var img = D.el("img", { "class": "nt-thumb", src: n.image_url, alt: "", width: "96", height: "96", loading: "lazy" });
      add(li, img);
    }
    return add(li, main, acts);
  }

  /* ---------- the editor ---------- */

  function field(id, label, input, hint) {
    var w = h("div", "nt-field"), lab = h("label", "nt-label", label), err = h("p", "nt-error");
    lab.setAttribute("for", id); input.setAttribute("id", id); err.setAttribute("id", id + "-err"); err.hidden = true;
    input.ntErr = err;
    var tip = hint ? h("p", "nt-hint", hint) : null;
    if (tip) { tip.setAttribute("id", id + "-hint"); input.setAttribute("aria-describedby", id + "-hint"); input.setAttribute("data-hint", id + "-hint"); }
    return add(w, lab, input, tip, err);
  }
  function markBad(input, text) {
    var err = input.ntErr; if (!err) return;
    err.textContent = text; err.hidden = false;
    input.classList.add("nt-invalid"); input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", (input.getAttribute("data-hint") ? input.getAttribute("data-hint") + " " : "") + err.id);
  }
  function markOk(input) {
    var err = input.ntErr;
    if (err) { err.hidden = true; err.textContent = ""; }
    input.classList.remove("nt-invalid"); input.removeAttribute("aria-invalid");
    if (input.getAttribute("data-hint")) input.setAttribute("aria-describedby", input.getAttribute("data-hint")); else input.removeAttribute("aria-describedby");
  }
  function find(id) { for (var i = 0; i < S.notices.length; i++) { if (S.notices[i].id === id) return S.notices[i]; } return null; }

  function editor(e) {
    var n = e.id ? find(e.id) : null, s = card("edit", n ? "Edit notice" : "New notice");
    var kind = D.el("select", { "class": "nt-input", name: "kind" });
    [["announcement", "Announcement"], ["promo", "Promo"]].forEach(function (o) { var op = D.el("option", { value: o[0] }, o[1]); kind.appendChild(op); });
    kind.value = n ? n.kind : "announcement";
    var title = D.el("input", { "class": "nt-input", type: "text", name: "title", maxlength: String(TITLE_MAX), autocomplete: "off" });
    title.value = n ? n.title : "";
    var body = D.el("textarea", { "class": "nt-input nt-textarea", name: "body", rows: "5", maxlength: String(BODY_MAX) });
    body.value = n ? n.body || "" : "";
    var starts = D.el("input", { "class": "nt-input", type: "datetime-local", name: "starts_at" });
    var ends = D.el("input", { "class": "nt-input", type: "datetime-local", name: "ends_at" });
    starts.value = n ? toLocal(n.starts_at) : ""; ends.value = n ? toLocal(n.ends_at) : "";
    var active = D.el("input", { type: "checkbox", name: "active", id: "nt-active" });
    active.checked = n ? !!n.active : true;
    var file = D.el("input", { "class": "nt-input", type: "file", name: "file", accept: "image/jpeg,image/png,image/webp" });
    add(s, field("nt-kind", "Type", kind), field("nt-title", "Title", title), field("nt-body", "Message", body, "Optional. Plain text; line breaks are kept."));
    add(s, field("nt-starts_at", "Starts (Philippine time)", starts, "Leave empty to start right away."), field("nt-ends_at", "Ends (Philippine time)", ends, "Leave empty to keep it up until you turn it off."));
    var actLabel = h("label", "nt-label", "Show to members");
    actLabel.setAttribute("for", "nt-active");
    s.appendChild(add(h("div", "nt-field nt-check"), active, actLabel));
    var removePic = false, picNote = null;
    if (n && typeof n.image_url === "string" && n.image_url) {
      picNote = h("p", "nt-meta", "A picture is attached.");
      var rm = btn("Remove picture", "ghost", function () { removePic = true; picNote.textContent = "The picture will be removed when you save."; rm.disabled = true; });
      s.appendChild(add(h("div", "nt-field"), picNote, rm));
    }
    s.appendChild(field("nt-file", n && n.image_url ? "Replace picture" : "Picture", file, "Optional. JPEG, PNG or WebP, up to 2 MB."));
    var fields = { kind: kind, title: title, body: body, starts_at: starts, ends_at: ends, file: file };
    var acts = h("div", "nt-actions");
    add(acts, btn("Save", "primary", function (b) {
      save(b, n, fields, active, file, removePic);
    }), btn("Cancel", "ghost", function () { S.editing = null; render(); }));
    s.appendChild(acts);
    return s;
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

  function save(b, n, f, active, file, removePic) {
    var mine = token;
    var built = build({ kind: f.kind.value, title: f.title.value, body: f.body.value, starts: f.starts_at.value, ends: f.ends_at.value, active: active.checked });
    var chosen = file.files && file.files[0] ? file.files[0] : null, pe = pictureError(chosen);
    var errors = built.errors || {};
    if (pe) errors.file = pe;
    if (built.errors || pe) { showFields(f, errors); return; }
    showFields(f, {});
    busy(b, true);
    D.call(n ? "PATCH" : "POST", n ? item(n.id) : base(), built.body, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok) {
        busy(b, false);
        if (res.status === 404) { unavailable(); return; }
        if (!showFields(f, res.data && res.data.fields)) D.toast("That did not work", msgOf(res, "We could not save. Please try again."), "error");
        return;
      }
      var saved = res.data;
      S.notices = upsert(S.notices, saved);
      picture(saved, chosen, removePic && !chosen, mine, function (final, failed) {
        busy(b, false);
        if (final) S.notices = upsert(S.notices, final);
        if (failed) {
          S.editing = { id: saved.id }; render();
          var box = byId("nt-file"); if (box) { markBad(box, failed); box.focus(); }
          D.toast("Saved, but the picture was not added", failed, "error");
          return;
        }
        S.editing = null; render();
        D.toast("Saved", n ? "The notice was updated." : "The notice was added."); say("Saved.");
      });
    });
  }
  /* The picture step after the notice is saved: upload the chosen file, or remove the attached one. Calls back with the latest notice
     and, when the step failed, the sentence to show. */
  function picture(saved, chosen, removing, mine, done) {
    if (!chosen && !removing) { done(null, ""); return; }
    var req;
    if (chosen) { var form = new FormData(); form.append("file", chosen); req = D.send("POST", item(saved.id) + "image/", form); }
    else req = D.call("DELETE", item(saved.id) + "image/", null, true);
    req.then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (res.ok) { done(res.data, ""); return; }
      var code = res.data && res.data.code;
      var text = res.status === 503 || code === "image_store_not_configured" ? "Picture upload is not set up yet. The notice was saved without it."
        : res.status === 502 || code === "image_not_saved" ? "The picture was not saved. Please try again."
        : (res.data && res.data.fields && res.data.fields.file ? String(Array.isArray(res.data.fields.file) ? res.data.fields.file[0] : res.data.fields.file) : msgOf(res, "The picture was not saved. Please try again."));
      done(null, text);
    });
  }
  function remove(b, n) {
    if (S.confirm !== n.id) { S.confirm = n.id; render(); return; }
    var mine = token; busy(b, true);
    D.call("DELETE", item(n.id), null, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok) { busy(b, false); D.toast("That did not work", msgOf(res, "We could not delete the notice. Please try again."), "error"); return; }
      S.notices = S.notices.filter(function (x) { return x.id !== n.id; }); S.confirm = ""; render();
      D.toast("Deleted", "The notice was deleted."); say("Notice deleted.");
    });
  }

  window.NONotices = { show: show, hide: hide, probe: probe, util: { toIso: toIso, toLocal: toLocal, whenText: whenText, statusOf: statusOf, windowText: windowText, kindText: kindText, build: build, pictureError: pictureError, upsert: upsert, ID_RE: ID_RE } };
})();
