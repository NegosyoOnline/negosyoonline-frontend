/* Settings > Inbox > "Comment auto-replies" (ClickUp z8uq9mg9pk, COMMENTS C4 FE). Built to the C2 API contract (backend docs/c2-api-contract.md,
   ClickUp z8uq9mg9pj comment 1100430000571476) under /sites/{id}/inquiries/comment-rules/: GET (automation + rules), PUT automation/,
   GET posts/ (the post picker), POST preview/ (live variants), POST / and PUT / DELETE {ref}/. A 404 from GET / means auto-replies are
   not available for this site: the card is simply not drawn. Every number, limit, banner and message comes from the API; API strings
   reach the page through textContent or D.el only. The "Turn on comments" prompt reuses inbox-settings.js's connect path (opts.connect).
   Dropdowns are the house combo (NOInbox.combo), never native. Plain ES5. NOCommentRules.util holds the pure helpers (tests/inbox-rules.test.mjs). */
(function () {
  var D = window.NODash;
  var token = 0, R = null;
  var FIELDS = ["trigger", "keywords", "scope", "post_ids", "public_text", "private_text"];
  var TRIGGERS = [["", "Choose when"], ["any", "Any comment"], ["keywords", "Comment containing words"]];
  var SCOPES = [["", "Choose where"], ["all", "All posts and ads"], ["selected", "Selected posts and ads"]];
  var ERR_ID = { trigger: "ibr-when", keywords: "ibr-keywords", scope: "ibr-where", post_ids: "ibr-posts", public_text: "ibr-public", private_text: "ibr-private" };

  function ui() { return window.NOInboxSettings.ui; }
  function h(tag, cls, text) { return ui().h(tag, cls, text); }
  function add() { return ui().add.apply(null, arguments); }
  function clear(n) { return ui().clear(n); }
  function byId(id) { return document.getElementById(id); }
  function say(t) { if (R && R.say) R.say(t); }
  function base() { return "/sites/" + R.site + "/inquiries/comment-rules/"; }
  function msgOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function isObj(x) { return !!x && typeof x === "object"; }
  function focusId(id) { var n = byId(id); if (n && n.focus) n.focus(); }

  /* ---------- pure helpers ---------- */

  /* "a, b ,, c" -> ["a","b","c"] */
  function splitKeywords(s) { return String(s || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean); }
  function pluralVariants(n) { return n + (n === 1 ? " variant" : " variants"); }
  function whenLine(r) {
    if (r.trigger === "keywords") return "Containing: " + (Array.isArray(r.keywords) ? r.keywords.join(", ") : "");
    return "Any comment";
  }
  function whereLine(r) {
    if (r.scope === "selected") { var n = Array.isArray(r.post_ids) ? r.post_ids.length : 0; return n + (n === 1 ? " selected post or ad" : " selected posts and ads"); }
    return "All posts and ads";
  }
  function counterLine(label, c) { return label + ": " + (c && typeof c.count === "number" ? c.count : 0) + " of " + (c && typeof c.cap === "number" ? c.cap : 0); }
  function limitOf(name, fallback) { var l = R && R.data && R.data.automation && R.data.automation.limits; return l && typeof l[name] === "number" ? l[name] : fallback; }

  /* ---------- load ---------- */

  function mount(box, opts) {
    var mine = ++token;
    R = { box: box, site: opts.site, connect: opts.connect, say: opts.say, data: null, form: null, asking: "", down: false, timers: {}, previewSeq: 0, postSeq: 0 };
    load(mine);
  }
  function unmount() { token++; if (R) Object.keys(R.timers).forEach(function (k) { clearTimeout(R.timers[k]); }); R = null; }
  function load(mine) {
    D.call("GET", base(), null, true).then(function (res) {
      if (mine !== token || !R || res.status === 401) return;
      if (res.status === 404) { R.data = null; R.down = false; clear(R.box); return; }
      if (!res.ok || !isObj(res.data) || !isObj(res.data.automation) || !Array.isArray(res.data.rules)) { R.down = true; render(); return; }
      R.down = false; R.data = { automation: res.data.automation, rules: res.data.rules };
      render();
    });
  }
  /* One call that drops a stale answer. A 404 on a rules route means the feature went away: draw nothing. */
  function call(method, path, body, fn) {
    var mine = token;
    D.call(method, path, body, true).then(function (res) {
      if (res.status === 401 || mine !== token || !R) return;
      if (res.status === 404 && path.indexOf("posts/") < 0 && path.indexOf("preview/") < 0 && /\/(rules|comment-rules)\/(automation\/)?$/.test(path)) { R.data = null; clear(R.box); return; }
      fn(res);
    });
  }
  function fail(res, fallback) { D.toast("That did not work", msgOf(res, fallback), "error"); }

  /* ---------- render ---------- */

  function render() {
    if (!R) return;
    var box = clear(R.box);
    if (R.down) {
      var c = ui().card("cr", "Comment auto-replies");
      add(c, h("p", "pm-lead", "We could not load your comment auto-replies. Nothing was changed."), ui().btn("Try again", "ghost", function (b) { ui().busy(b, true); load(token); }));
      box.appendChild(c); return;
    }
    var a = R.data.automation, banner = isObj(a.banner) ? a.banner : null;
    var chip = a.active === true ? ["ok", "On"] : banner && banner.code === "paused_rate_limit" ? ["warn", "Paused"] : a.enabled === true ? ["neutral", "Not running"] : ["neutral", "Off"];
    var s = ui().card("cr", "Comment auto-replies", chip);
    add(s, bannerNode(banner), readyNode(a), masterNode(a), countersNode(a), listNode(), R.form ? formNode() : addNode());
    box.appendChild(s);
  }
  function bannerNode(b) {
    if (!b) return null;
    var p = h("div", "ibr-banner"); p.setAttribute("role", "status"); p.setAttribute("id", "ibr-banner");
    add(p, h("p", "", typeof b.message === "string" ? b.message : ""));
    if (b.code === "paused_rate_limit" && b.paused_until) add(p, h("p", "pm-hint", "Resumes " + ui().whenText(b.paused_until, new Date()) + "."));
    return p;
  }
  /* The comments prompt: only while the API says auto-replies cannot send yet. */
  function readyNode(a) {
    if (a.ready !== false) return null;
    var d = h("div", "ibr-ready");
    if (a.reason === "permission_missing") {
      add(d, h("p", "pm-hint", "Turn on comments for your Page so auto-replies can send."));
      var b = ui().btn("Turn on comments", "ghost", function () { if (R.connect) R.connect(); }); b.setAttribute("id", "ibr-connect");
      add(d, add(h("div", "mk-pause"), b));
    } else {
      add(d, h("p", "pm-hint", "Connect your Facebook Page in Messenger above so auto-replies can send."));
    }
    return d;
  }
  function masterNode(a) {
    return ui().line("Auto-reply to comments", "ibr-sw-master-l", "Switches all your rules on or off together.",
      ui().swtch("ibr-sw-master", "ibr-sw-master-l", a.enabled === true, function (b, next) {
        ui().busy(b, true);
        call("PUT", base() + "automation/", { enabled: next }, function (res) {
          if (!res.ok) { ui().busy(b, false); fail(res, "We could not save. Please try again."); return; }
          R.data.automation = res.data; render(); say(next ? "Auto-replies are on." : "Auto-replies are off."); focusId("ibr-sw-master");
        });
      }));
  }
  function countersNode(a) {
    var d = h("p", "ibr-counters"); d.setAttribute("id", "ibr-counters");
    d.appendChild(h("span", "chip chip-neutral", counterLine("Today", a.today)));
    d.appendChild(h("span", "chip chip-neutral", counterLine("This hour", a.hour)));
    return d;
  }
  function excerptNode(text) {
    var n = h("span", "ibr-excerpt");
    text.split(/(\{[^{}]*\})/).forEach(function (t, i) { if (t) n.appendChild(i % 2 ? h("code", "ibr-code", t) : document.createTextNode(t)); });
    return n;
  }
  function listNode() {
    var rules = R.data.rules, wrap = h("div", "ibr-list");
    if (!rules.length) { add(wrap, h("p", "pm-hint", "No rules yet.")); return wrap; }
    add(wrap, h("p", "pm-hint", "The first rule that is on and matches a comment answers it."));
    rules.forEach(function (r, i) {
      var row = h("div", "ibr-rule"); row.setAttribute("data-ref", r.ref);
      var t = h("div", "ibr-rule-t"), title = h("b", "", whenLine(r)), lid = "ibr-rl-" + i;
      title.setAttribute("id", lid);
      add(t, title, h("span", "", "Where: " + whereLine(r)), excerptNode(r.public_text || ""));
      var sw = ui().swtch("ibr-sw-" + i, lid, r.enabled === true, function (b, next) {
        ui().busy(b, true);
        call("PUT", base() + r.ref + "/", { enabled: next }, function (res) {
          if (!res.ok) { ui().busy(b, false); fail(res, "We could not save. Please try again."); return; }
          replaceRule(res.data); render(); say(next ? "Rule is on." : "Rule is off."); focusId("ibr-sw-" + i);
        });
      });
      var acts = h("div", "ibr-acts");
      if (R.asking === r.ref) {
        var yes = ui().btn("Delete", "danger", function (b) { del(b, r); }); yes.setAttribute("id", "ibr-del-yes");
        var no = ui().btn("Keep rule", "ghost", function () { R.asking = ""; render(); focusId("ibr-del-" + i); });
        add(acts, h("span", "pm-hint", "Delete this rule?"), yes, no);
      } else {
        var ed = ui().btn("Edit", "ghost", function () { openForm(r); }); ed.classList.add("mk-small"); ed.setAttribute("id", "ibr-edit-" + i);
        var dl = ui().btn("Delete", "ghost", function () { R.asking = r.ref; render(); focusId("ibr-del-yes"); }); dl.classList.add("mk-small"); dl.setAttribute("id", "ibr-del-" + i);
        add(acts, ed, dl);
      }
      add(row, t, sw, acts); wrap.appendChild(row);
    });
    return wrap;
  }
  function addNode() {
    var max = limitOf("max_rules", 20), full = R.data.rules.length >= max;
    var d = h("div", "ibr-add");
    var b = ui().btn("Add rule", "primary", function () { openForm(null); }); b.setAttribute("id", "ibr-add"); b.disabled = full;
    add(d, b);
    if (full) add(d, h("p", "pm-hint", "You can have up to " + max + " auto-reply rules."));
    return d;
  }
  function replaceRule(rule) {
    if (!isObj(rule)) return;
    var done = false;
    R.data.rules = R.data.rules.map(function (x) { if (x.ref === rule.ref) { done = true; return rule; } return x; });
    if (!done) R.data.rules.push(rule);
  }
  function del(b, r) {
    ui().busy(b, true);
    call("DELETE", base() + r.ref + "/", null, function (res) {
      if (!res.ok) { ui().busy(b, false); fail(res, "We could not delete the rule. Please try again."); return; }
      R.data.rules = R.data.rules.filter(function (x) { return x.ref !== r.ref; }); R.asking = "";
      render(); say("Rule deleted."); focusId("ibr-add");
    });
  }

  /* ---------- the rule form ---------- */

  function openForm(rule) {
    var posts = {};
    if (rule && Array.isArray(rule.posts)) rule.posts.forEach(function (p) { if (p && p.id) posts[p.id] = p; });
    R.form = { ref: rule ? rule.ref : null, enabled: rule ? rule.enabled !== false : true, trigger: rule ? rule.trigger || "" : "", keywords: rule && Array.isArray(rule.keywords) ? rule.keywords.join(", ") : "",
      scope: rule ? rule.scope || "" : "", postIds: rule && Array.isArray(rule.post_ids) ? rule.post_ids.slice() : [], posts: posts,
      pub: rule ? rule.public_text || "" : "", priv: rule ? rule.private_text || "" : "", errors: {}, general: "", picker: null };
    R.asking = ""; render();
    preview("public"); preview("private"); if (R.form.scope === "selected") searchPosts("", false);
  }
  function closeForm() {
    var f = R.form;
    Object.keys(R.timers).forEach(function (k) { clearTimeout(R.timers[k]); });
    R.form = null; R.previewSeq++; R.postSeq++; render();
    focusId(f && f.ref ? editIdOf(f.ref) : "ibr-add");
  }
  /* Hint text in pieces: the odd pieces are syntax samples, set in <code> (the | reads as a bar there, not as a capital I). */
  function hintCode(parts) {
    var p = h("p", "pm-hint");
    parts.forEach(function (t, i) { p.appendChild(i % 2 ? h("code", "ibr-code", t) : document.createTextNode(t)); });
    return p;
  }
  function field(id, label, ctl, hint) {
    var f = h("div", "pm-field"); f.setAttribute("id", id + "-field");
    var l = h("label", "pm-label", label); l.setAttribute("for", id);
    add(f, l, ctl, hint ? (typeof hint === "string" ? h("p", "pm-hint", hint) : hint) : null);
    return f;
  }
  function errNode(id) { var e = h("p", "pm-hint ibr-err"); e.setAttribute("id", id + "-err"); e.setAttribute("role", "alert"); e.hidden = true; return e; }
  function selectOf(id, list, value) {
    var sel = D.el("select", { "class": "ib-input", id: id });
    list.forEach(function (p) { sel.appendChild(D.el("option", { value: p[0] }, p[1])); });
    sel.value = value; return sel;
  }
  function textarea(id, value, kind) {
    var ta = D.el("textarea", { "class": "pm-input ibr-ta", id: id, rows: "3", "aria-describedby": id + "-err" });
    ta.value = value;
    ta.addEventListener("input", function () {
      if (kind === "public") R.form.pub = ta.value; else R.form.priv = ta.value;
      setErr(kind === "public" ? "public_text" : "private_text", "");
      clearTimeout(R.timers[kind]); R.timers[kind] = setTimeout(function () { preview(kind); }, 350);
    });
    return ta;
  }
  function setErr(name, text) {
    var id = ERR_ID[name], e = byId(id + "-err"), c = byId(id);
    if (R && R.form) R.form.errors[name] = text;
    if (!e) return;
    e.textContent = text; e.hidden = !text;
    if (c) { if (text) c.setAttribute("aria-invalid", "true"); else c.removeAttribute("aria-invalid"); }
  }
  function formNode() {
    var f = R.form, d = h("div", "ibr-form"); d.setAttribute("id", "ibr-form"); d.setAttribute("role", "group"); d.setAttribute("aria-label", f.ref ? "Edit rule" : "Add rule");
    add(d, h("h3", "pm-h2 ibr-h3", f.ref ? "Edit rule" : "Add rule"));
    var gen = h("p", "pm-hint ibr-err", f.general); gen.setAttribute("id", "ibr-general"); gen.setAttribute("role", "alert"); gen.hidden = !f.general; d.appendChild(gen);

    var when = selectOf("ibr-when", TRIGGERS, f.trigger);
    var fWhen = field("ibr-when", "When", add(h("div", ""), when)); fWhen.appendChild(errNode("ibr-when"));
    var kw = D.el("input", { "class": "pm-input", id: "ibr-keywords", type: "text", autocomplete: "off", spellcheck: "false", "aria-describedby": "ibr-keywords-err" }); kw.value = f.keywords;
    kw.addEventListener("input", function () { f.keywords = kw.value; setErr("keywords", ""); });
    var fKw = field("ibr-keywords", "Words to look for", kw, "Separate words with commas."); fKw.appendChild(errNode("ibr-keywords"));
    fKw.hidden = f.trigger !== "keywords";
    var where = selectOf("ibr-where", SCOPES, f.scope);
    var fWhere = field("ibr-where", "Where", add(h("div", ""), where)); fWhere.appendChild(errNode("ibr-where"));
    var picker = h("div", "ibr-picker"); picker.setAttribute("id", "ibr-posts");
    var fPosts = field("ibr-posts", "Posts and ads", picker); fPosts.appendChild(errNode("ibr-posts")); fPosts.hidden = f.scope !== "selected";
    add(d, fWhen, fKw, fWhere, fPosts);

    var pubPrev = h("div", "ibr-prev"); pubPrev.setAttribute("id", "ibr-public-prev"); pubPrev.setAttribute("aria-live", "polite");
    var fPub = field("ibr-public", "Public reply", textarea("ibr-public", f.pub, "public"), hintCode(["Use ", "{Hi|Hello}", " for variants and ", "{name}", " for the first name."]));
    add(fPub, errNode("ibr-public"), pubPrev);
    var privPrev = h("div", "ibr-prev"); privPrev.setAttribute("id", "ibr-private-prev"); privPrev.setAttribute("aria-live", "polite");
    var fPriv = field("ibr-private", "Private reply (optional)", textarea("ibr-private", f.priv, "private"));
    add(fPriv, errNode("ibr-private"), privPrev);
    add(d, fPub, fPriv);

    var row = h("div", "mk-pause ibr-save");
    var save = ui().btn("Save rule", "primary", function (b) { saveForm(b); }); save.setAttribute("id", "ibr-save");
    var cancel = ui().btn("Cancel", "ghost", closeForm); cancel.setAttribute("id", "ibr-cancel");
    add(row, save, cancel); d.appendChild(row);

    when.addEventListener("change", function () { f.trigger = when.value; fKw.hidden = f.trigger !== "keywords"; setErr("trigger", ""); });
    where.addEventListener("change", function () {
      f.scope = where.value; fPosts.hidden = f.scope !== "selected"; setErr("scope", "");
      if (f.scope === "selected" && !f.picker) searchPosts("", false);
    });
    /* The house combos (nothing selected on open, grey placeholder, type to filter) go on once the form is in the page. */
    setTimeout(function () {
      if (!R || R.form !== f) return;
      var nb = window.NOInbox;
      if (nb && nb.combo) {
        if (byId("ibr-when")) nb.combo(byId("ibr-when"), "When", { blankEmpty: true, describedby: "ibr-when-err" });
        if (byId("ibr-where")) nb.combo(byId("ibr-where"), "Where", { blankEmpty: true, describedby: "ibr-where-err" });
      }
      var w = byId("ibr-when"); if (w) { if (w.ibFocus) w.ibFocus(); else if (w.focus) w.focus(); }
      scrollToForm();
      drawPicker();
    }, 0);
    return d;
  }
  /* The form can open far below the list (a phone): bring its top into view; no animation when the person asks for reduced motion. */
  function scrollToForm() {
    var n = byId("ibr-form"); if (!n || !n.scrollIntoView) return;
    var calm = false;
    try { calm = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { calm = false; }
    n.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
  }
  function editIdOf(ref) { for (var i = 0; i < R.data.rules.length; i++) if (R.data.rules[i].ref === ref) return "ibr-edit-" + i; return "ibr-add"; }

  /* ---------- live preview ---------- */

  function preview(kind) {
    if (!R || !R.form) return;
    var text = kind === "public" ? R.form.pub : R.form.priv, box = byId("ibr-" + kind + "-prev");
    if (!box) return;
    if (!text.trim()) { clear(box); return; }
    var mine = token, form = R.form;
    D.call("POST", base() + "preview/", { template: text, kind: kind }, true).then(function (res) {
      if (mine !== token || !R || R.form !== form || res.status === 401) return;
      if ((kind === "public" ? form.pub : form.priv) !== text) return; /* the text moved on; its own preview is on the way */
      var b = byId("ibr-" + kind + "-prev"); if (!b) return;
      clear(b);
      var d = res.data;
      if (!res.ok || !isObj(d)) return;
      /* app.js flattens any body that has an "error" object to {code, message}, so an invalid template arrives either way. */
      if (d.valid === false || (d.valid === undefined && typeof d.message === "string")) {
        var em = isObj(d.error) && typeof d.error.message === "string" ? d.error.message : typeof d.message === "string" ? d.message : "";
        if (em) add(b, h("p", "pm-hint ibr-err", em));
        return;
      }
      add(b, h("p", "pm-hint", pluralVariants(typeof d.variant_count === "number" ? d.variant_count : 0)));
      if (Array.isArray(d.samples) && d.samples.length) {
        var ul = h("ul", "ibr-samples");
        d.samples.forEach(function (x) { if (typeof x === "string") ul.appendChild(h("li", "", x)); });
        b.appendChild(ul);
      }
    });
  }

  /* ---------- the post picker ---------- */

  function searchPosts(q, more) {
    if (!R || !R.form) return;
    var f = R.form, seq = ++R.postSeq, mine = token;
    f.picker = f.picker || { items: [], next: null, loading: false, failed: false, q: "" };
    var pk = f.picker; pk.loading = true; pk.failed = false; pk.q = q; drawPicker();
    var qs = [];
    if (q.length >= 2) qs.push("q=" + encodeURIComponent(q));
    if (more && pk.next) qs.push("cursor=" + encodeURIComponent(pk.next));
    D.call("GET", base() + "posts/" + (qs.length ? "?" + qs.join("&") : ""), null, true).then(function (res) {
      if (mine !== token || !R || R.form !== f || seq !== R.postSeq || res.status === 401) return;
      pk.loading = false;
      if (!res.ok || !isObj(res.data) || !Array.isArray(res.data.items)) { pk.failed = true; drawPicker(); return; }
      pk.items = (more ? pk.items : []).concat(res.data.items.filter(function (p) { return p && typeof p.id === "string"; }));
      pk.next = typeof res.data.next_cursor === "string" && res.data.next_cursor ? res.data.next_cursor : null;
      drawPicker();
    });
  }
  function postLabel(p) { return p && typeof p.caption === "string" && p.caption ? p.caption : (p ? p.id : ""); }
  function postRow(p, checked) {
    var lab = h("label", "ibr-post"), cb = D.el("input", { type: "checkbox" });
    cb.checked = checked;
    cb.addEventListener("change", function () {
      var f = R.form, i = f.postIds.indexOf(p.id);
      if (cb.checked && i < 0) { f.postIds.push(p.id); f.posts[p.id] = p; } else if (!cb.checked && i >= 0) f.postIds.splice(i, 1);
      setErr("post_ids", ""); drawPicker();
    });
    add(lab, cb, h("span", "ibr-post-t", postLabel(p)), p.is_ad ? h("span", "chip chip-info", "Ad") : null);
    return lab;
  }
  /* The picker redraws itself (not the whole form), so what is typed elsewhere stays. The search box keeps its text and focus. */
  function drawPicker() {
    var box = byId("ibr-posts"); if (!box || !R || !R.form) return;
    var f = R.form, pk = f.picker, q0 = byId("ibr-post-q"), typing = !!q0 && document.activeElement === q0, qv = q0 ? q0.value : (pk ? pk.q : "");
    clear(box);
    var count = f.postIds.length;
    add(box, h("p", "pm-hint", count + (count === 1 ? " post or ad selected" : " posts and ads selected")));
    if (count) {
      var sel = h("div", "ibr-chosen");
      f.postIds.forEach(function (id) {
        var chip = h("span", "ibr-pick"), lab = postLabel(f.posts[id] || { id: id });
        var x = ui().btn("Remove", "ghost", function () { f.postIds.splice(f.postIds.indexOf(id), 1); drawPicker(); });
        x.classList.add("mk-small"); x.setAttribute("aria-label", "Remove " + lab);
        add(chip, h("span", "", lab), x); sel.appendChild(chip);
      });
      box.appendChild(sel);
    }
    var q = D.el("input", { "class": "pm-input", type: "search", id: "ibr-post-q", autocomplete: "off", placeholder: "Search posts and ads", "aria-label": "Search posts and ads" });
    q.value = qv;
    q.addEventListener("input", function () { clearTimeout(R.timers.posts); R.timers.posts = setTimeout(function () { if (R && R.form === f) searchPosts(q.value.trim(), false); }, 350); });
    box.appendChild(q);
    if (typing) q.focus();
    if (!pk) return;
    var list = h("div", "ibr-posts-list");
    pk.items.forEach(function (p) { list.appendChild(postRow(p, f.postIds.indexOf(p.id) >= 0)); });
    box.appendChild(list);
    if (pk.loading) add(box, h("p", "pm-hint", "Loading…"));
    else if (pk.failed) add(box, h("p", "pm-hint", "We could not load your posts."), ui().btn("Try again", "ghost", function () { searchPosts(pk.q, false); }));
    else if (!pk.items.length) add(box, h("p", "pm-hint", "No posts found."));
    if (pk.next && !pk.loading) { var m = ui().btn("Load more", "ghost", function () { searchPosts(pk.q, true); }); m.setAttribute("id", "ibr-post-more"); box.appendChild(m); }
  }

  /* ---------- save ---------- */

  function showErrors() {
    if (!R || !R.form) return;
    FIELDS.forEach(function (k) { setErr(k, R.form.errors[k] || ""); });
    var g = byId("ibr-general"); if (g) { g.textContent = R.form.general; g.hidden = !R.form.general; }
  }
  function saveForm(b) {
    var f = R.form, body = { enabled: f.enabled, trigger: f.trigger, scope: f.scope, public_text: f.pub, private_text: f.priv };
    if (f.trigger === "keywords") body.keywords = splitKeywords(f.keywords);
    if (f.scope === "selected") body.post_ids = f.postIds.slice();
    f.errors = {}; f.general = ""; showErrors();
    ui().busy(b, true);
    call(f.ref ? "PUT" : "POST", base() + (f.ref ? f.ref + "/" : ""), body, function (res) {
      if (R.form !== f) return;
      if (!res.ok) {
        ui().busy(b, false);
        var fields = res.data && res.data.fields, first = "";
        if (res.status === 422 && fields) {
          Object.keys(fields).forEach(function (k) { if (ERR_ID[k]) f.errors[k] = fields[k]; });
          for (var i = 0; i < FIELDS.length && !first; i++) if (f.errors[FIELDS[i]]) first = FIELDS[i];
        }
        if (first) {
          showErrors();
          var c = byId(ERR_ID[first]); if (c && c.ibFocus) c.ibFocus(); else focusId(ERR_ID[first]);
          var fe = byId(ERR_ID[first] + "-field"); if (fe && fe.scrollIntoView) fe.scrollIntoView({ block: "center", behavior: "auto" });
          return;
        }
        f.general = msgOf(res, "We could not save the rule. Please try again."); showErrors(); return;
      }
      var wasEdit = !!f.ref;
      replaceRule(res.data);
      R.form = null; R.postSeq++; R.previewSeq++;
      render(); say("Rule saved.");
      focusId(wasEdit ? editIdOf(res.data.ref) : "ibr-add");
    });
  }

  window.NOCommentRules = { mount: mount, unmount: unmount, util: { splitKeywords: splitKeywords, pluralVariants: pluralVariants, whenLine: whenLine, whereLine: whereLine, counterLine: counterLine } };
})();
