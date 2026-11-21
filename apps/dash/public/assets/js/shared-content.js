/* "From <source store>" copy lists for the Training and Media Library pages (ClickUp z8uq9mhbhd, CP-1 FE; API: CP-1 BE z8uq9mhbhc). A distributor sees what the
   content source store (Live4More) offers and copies it into their own storage; the source's owner sees the Share switch. The API decides everything:
   the store's name, what is offered, the sizes, each item's copy state and whether this site is the source. The section stays hidden when nothing is
   offered. No price, allowance or meter is shown: only the size of the files a copy makes (BILLING, plan section "Storage counting").
   The whole API contract is in API and normalize() below, so aligning to the pushed backend shapes is a change in this one place.
   Every string from the API reaches the page through textContent or D.el only. Plain ES5. NOShared.util holds the pure helpers (tests/shared-content.test.mjs). */
(function () {
  var D = window.NODash;
  var POLL_MS = 3000, POLL_MAX = 200;
  var STATES = ["not_copied", "copying", "copied", "failed"];
  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

  /* ---------- the API contract (one place) ---------- */

  var API = {
    list: function (site) { return D.call("GET", "/sites/" + site + "/shared-content/", null, true); },
    /* body: {kind: "course"|"media", ids: [...]} or {kind, all: true}, plus again: true to copy an item already copied. Answers 202. */
    copy: function (site, body) { return D.call("POST", "/sites/" + site + "/shared-content/copy/", body, true); }
  };
  function httpsUrl(u) { return typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : ""; }
  function num(n) { return typeof n === "number" && isFinite(n) && n > 0 ? n : 0; }
  function item(x) {
    if (!x || typeof x.id !== "string" || !ID_RE.test(x.id) || typeof x.title !== "string") return null;
    var st = STATES.indexOf(x.copy_state) >= 0 ? x.copy_state : "not_copied";
    return { id: x.id, title: x.title, picture: httpsUrl(x.image_url) || httpsUrl(x.thumb_url) || httpsUrl(x.poster_url),
      modules: num(x.module_count), lessons: num(x.lesson_count), isVideo: x.asset_type === "video", bytes: num(x.bytes), state: st };
  }
  /* The GET answer as {isSource, name, courses, media}. */
  function normalize(d) {
    d = d || {};
    var name = d.source_name || (d.source && d.source.name) || "";
    function list(a) { return Array.isArray(a) ? a.map(item).filter(Boolean) : []; }
    return { isSource: d.is_source === true, name: typeof name === "string" ? name.trim() : "", courses: list(d.courses), media: list(d.media) };
  }

  /* ---------- pure helpers ---------- */

  /* 188743680 -> "180 MB". Whole numbers from 10 up, one decimal below; "" for nothing. */
  function sizeText(bytes) {
    var b = num(bytes);
    if (!b) return "";
    var units = ["B", "KB", "MB", "GB"], i = 0, v = b;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    var r = v >= 10 || i === 0 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
    return r + " " + units[i];
  }
  function sizeLine(bytes) {
    var t = sizeText(bytes);
    return t ? "This copies " + t + " of files into your store’s storage." : "";
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function todo(items) { return items.filter(function (x) { return x.state === "not_copied" || x.state === "failed"; }); }

  /* ---------- the section ---------- */

  /* opts: {kind: "course"|"media", site, changed: function () {}} (changed runs after copies finish, so the page can re-read its own list). */
  function create(opts) {
    var el = D.el("div", { "class": "sc-wrap" }), st = null, local = {}, polls = 0, timer = null, dead = false;

    function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
    function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
    function items() { return st ? (opts.kind === "course" ? st.courses : st.media) : []; }
    function stateOf(x) { return local[x.id] || x.state; }
    function btn(label, kind, fn) {
      var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost"), label);
      b.setAttribute("type", "button");
      if (fn) b.addEventListener("click", function () { fn(b); });
      return b;
    }
    function paint() {
      while (el.firstChild) el.removeChild(el.firstChild);
      var list = items();
      if (!st || st.isSource || !list.length) { el.hidden = true; return; }
      el.hidden = false;
      var head = "From " + (st.name || "the source store"), box = h("section", "sc-box");
      var t = h("h2", "sc-h2", head), id = "sc-h-" + opts.kind; t.setAttribute("id", id); box.setAttribute("aria-labelledby", id);
      var open = list.filter(function (x) { return stateOf(x) === "not_copied" || stateOf(x) === "failed"; });
      var top = add(h("div", "sc-head"), t);
      if (open.length) {
        var all = btn("Copy all", "ghost", function (b) { copy(b, { kind: opts.kind, all: true }, open); });
        all.setAttribute("data-copy-all", "");
        top.appendChild(all);
      }
      box.appendChild(top);
      var total = open.reduce(function (n, x) { return n + x.bytes; }, 0), line = sizeLine(total);
      if (open.length && line) box.appendChild(h("p", "sc-size sc-all-size", line));
      var ul = h("ul", "sc-list");
      list.forEach(function (x) { ul.appendChild(row(x)); });
      box.appendChild(ul);
      el.appendChild(box);
    }
    function row(x) {
      var s = stateOf(x), li = h("li", "sc-row");
      li.setAttribute("data-shared", x.id); li.setAttribute("data-state", s);
      if (x.picture) li.appendChild(D.el("img", { "class": "sc-thumb", src: x.picture, alt: "", width: "72", height: "72", loading: "lazy" }));
      var main = h("div", "sc-main");
      add(main, h("h3", "sc-title", x.title));
      var bits = [];
      if (opts.kind === "course") bits.push(plural(x.modules, "module", "modules"), plural(x.lessons, "lesson", "lessons"));
      else bits.push(x.isVideo ? "Video" : "Image");
      var sz = sizeText(x.bytes); if (sz) bits.push(sz);
      main.appendChild(h("p", "sc-meta", bits.join(" · ")));
      var line = sizeLine(x.bytes);
      if (line && s !== "copying") main.appendChild(h("p", "sc-size", line));
      if (s === "failed") { var f = h("p", "sc-fail", "Could not copy. Try again."); f.setAttribute("role", "alert"); main.appendChild(f); }
      var acts = h("div", "sc-actions");
      if (s === "copying") { var c = btn("Copying…", "ghost"); c.disabled = true; c.setAttribute("aria-busy", "true"); acts.appendChild(c); }
      else if (s === "copied") {
        var d = btn("Copied", "ghost"); d.disabled = true; d.setAttribute("data-copied", "");
        var again = btn("Copy again", "ghost", function (b) { copy(b, { kind: opts.kind, ids: [x.id], again: true }, [x]); });
        again.setAttribute("aria-label", "Copy again: " + x.title);
        add(acts, d, again);
      } else {
        var go = btn("Copy to my store", "primary", function (b) { copy(b, { kind: opts.kind, ids: [x.id] }, [x]); });
        go.setAttribute("aria-label", "Copy to my store: " + x.title);
        acts.appendChild(go);
      }
      return add(li, main, acts);
    }
    function say(text) { var l = document.getElementById(opts.kind === "course" ? "tr-live" : "ml-live"); if (l) l.textContent = text; }
    function copy(b, body, targets) {
      if (dead) return;
      targets.forEach(function (x) { local[x.id] = "copying"; });
      paint();
      API.copy(opts.site, body).then(function (res) {
        if (dead || res.status === 401) return;
        if (!res.ok) { targets.forEach(function (x) { local[x.id] = "failed"; }); paint(); return; }
        targets.forEach(function (x) { delete local[x.id]; x.state = "copying"; });
        paint(); poll(true);
      });
    }
    /* Reads the list again until nothing is copying; then the page re-reads its own list, where the copies now are. */
    function poll(reset) {
      if (reset) polls = 0;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        API.list(opts.site).then(function (res) {
          if (dead || res.status === 401) return;
          if (res.ok) { st = normalize(res.data); paint(); }
          var busy = items().some(function (x) { return stateOf(x) === "copying"; });
          if (busy && ++polls < POLL_MAX) { poll(false); return; }
          if (opts.changed) opts.changed();
          say("Copy finished.");
        });
      }, POLL_MS);
    }

    return {
      el: el,
      /* done(isSource) after the first answer; an error or a 404 leaves the section hidden. */
      load: function (done) {
        el.hidden = true;
        API.list(opts.site).then(function (res) {
          if (dead || res.status === 401) return;
          if (res.ok) { st = normalize(res.data); paint(); if (items().some(function (x) { return x.state === "copying"; })) poll(true); }
          if (done) done(!!(st && st.isSource));
        });
      },
      isSource: function () { return !!(st && st.isSource); },
      stop: function () { dead = true; if (timer) clearTimeout(timer); timer = null; }
    };
  }

  /* The source owner's "Share with new stores" switch. onChange(checked, box); the page sends the PATCH and puts the box back if it fails. */
  function shareSwitch(id, on, onChange) {
    var box = D.el("input", { type: "checkbox", id: id, name: "shared" });
    box.checked = !!on;
    var lab = D.el("label", { "class": "sc-switch-label", "for": id }, "Share with new stores");
    box.addEventListener("change", function () { onChange(box.checked, box); });
    var w = D.el("div", { "class": "sc-switch" });
    w.appendChild(box); w.appendChild(lab);
    return w;
  }

  window.NOShared = { create: create, shareSwitch: shareSwitch, util: { sizeText: sizeText, sizeLine: sizeLine, normalize: normalize, todo: todo, plural: plural } };
})();
