/* Subscriber Media Library editor (ClickUp z8uq9mezdk, /media/). The Subscriber adds the images and videos their members see in the member
   dashboard's Media Library, and publishes, reorders, edits and deletes them. Reads and writes /sites/{id}/media/ (the owner routes of
   apps/media_library). Ported from the earlier HQ editor (flow only; TWCinc: app/media_library/ upload screens) and laid out like the Training
   editor (training.js). An image goes up as one multipart request. A video is three steps: (a) a draft asset created with its poster, (b) a
   short-lived token, and the browser sends the MP4 straight to the upload address the API returns, with exactly the headers it returns,
   (c) the API is told the stored file's address. The page decides nothing: the API does. Every status and string from the API reaches the page
   through textContent or D.el only. While the API answers 404 (members are switched off, or not a Santé site) the page says the Media Library
   is not available yet and its links stay hidden (probe). V-1 (ClickUp z8uq9mkfkd): when the token answers {host: "bunny", upload}, the video goes to
   the store's own Bunny Stream library by TUS (tus.js, as a training lesson), the page then asks attach {video_id} until Bunny has finished
   encoding (409 video_processing), and the asset plays in Bunny's player (embed_url, no file_url). The Blob steps are unchanged. Plain ES5. NOMedia.util holds the pure helpers (tests/media.test.mjs). */
(function () {
  var D = window.NODash;
  var token = 0, S = null, ABORT = null;
  var MB = 1024 * 1024, IMAGE_MAX = 10 * MB, VIDEO_MAX = 50 * MB;
  var IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"], VIDEO_TYPE = "video/mp4";
  var TITLE_MAX = 160, CAPTION_MAX = 5000;
  var CATEGORIES = [["promo", "Product Promo"], ["ad", "Ad Creative"], ["page", "Page Post"]];
  var PRODUCTS = [["", "None"], ["barley", "Barley"], ["drinks", "Drinks"], ["essentials", "Essentials"], ["beauty", "Beauty"]];
  var RATIOS = [["4:5", "4:5"], ["1:1", "1:1"], ["9:16", "9:16"], ["16:9", "16:9"]];
  var TYPES = [["image", "Image"], ["video", "Video"]];
  var POLL_MS = 3000, POLL_MAX = 200; /* attach is asked again every 3 s while Bunny encodes, for up to ten minutes */
  var TOO_LARGE = "This video is too large to upload.";
  var NO_STORE = "Files cannot be stored yet: the media store is not set up.";
  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(text) { var l = byId("ml-live"); if (l) l.textContent = text; }
  function msgOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function root() { return byId("ml-root"); }
  function base() { return "/sites/" + S.site + "/media/"; }
  function btn(label, kind, fn) {
    var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost") + (kind === "danger" ? " ml-danger" : ""), label);
    b.setAttribute("type", "button");
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function busy(b, on) { if (!b) return; if (on) { b.setAttribute("aria-busy", "true"); b.disabled = true; } else { b.removeAttribute("aria-busy"); b.disabled = false; } }

  /* ---------- pure helpers ---------- */

  function labelOf(list, value) { for (var i = 0; i < list.length; i++) { if (list[i][0] === value) return list[i][1]; } return ""; }
  function has(list, value) { for (var i = 0; i < list.length; i++) { if (list[i][0] === value) return true; } return false; }
  /* An address worth showing as a picture or linking to: https, nothing else. */
  /* Bunny's player for a video in the store's own library: https://iframe.mediadelivery.net/embed/<library>/<video>, nothing else is ever framed. */
  function embedUrl(u) { return typeof u === "string" && /^https:\/\/iframe\.mediadelivery\.net\/embed\/\d{1,12}\/[A-Za-z0-9-]{8,64}$/.test(u) ? u : ""; }
  function httpsUrl(u) { return typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : ""; }
  /* An address the browser may send a file to: https, or http on this computer for the local stand-in. */
  function safeUrl(u) { return typeof u === "string" && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)[^\s"'<>]+$/.test(u) ? u : ""; }
  /* The file a file input holds, or {error}. The API checks it again. */
  function pick(file, kinds, max, none, wrong, big) {
    if (!file) return { error: none };
    if (file.type && kinds.indexOf(file.type) < 0) return { error: wrong };
    if (typeof file.size === "number" && file.size > max) return { error: big };
    return { file: file };
  }
  function imageCheck(file, what) { return pick(file, IMAGE_TYPES, IMAGE_MAX, "Choose " + what + " first.", "Use a JPEG, PNG or WebP picture.", "The picture is larger than 10 MB."); }
  /* The type only: the size limit depends on where the video goes (the media store, 50 MB, or the store's own Bunny library), so the API
     decides after the token (the media store's max_bytes, below) or at attach (Bunny, video_too_large). */
  function videoCheck(file) { return pick(file, [VIDEO_TYPE], Infinity, "Choose the video first.", "Use an MP4 video.", ""); }
  function whole(text, max) { var v = String(text || "").trim(); if (!/^\d{1,6}$/.test(v)) return null; var n = parseInt(v, 10); return n <= max ? n : null; }
  function hasErrors(errors) { for (var k in errors) { if (Object.prototype.hasOwnProperty.call(errors, k)) return true; } return false; }
  /* The fields as the API body, or {errors: {field: text}}. Text is sent trimmed. */
  function buildAsset(v, editing) {
    var errors = {}, title = String(v.title || "").trim(), caption = String(v.caption || "").trim(), body;
    if (!title) errors.title = "Enter a title."; else if (title.length > TITLE_MAX) errors.title = "Keep it to " + TITLE_MAX + " characters.";
    if (caption.length > CAPTION_MAX) errors.caption = "Keep it to " + CAPTION_MAX + " characters.";
    if (!has(CATEGORIES, v.category)) errors.category = "Choose a category.";
    if (!has(PRODUCTS, v.product_category || "")) errors.product_category = "Choose a product.";
    if (!has(RATIOS, v.crop_ratio)) errors.crop_ratio = "Choose a crop ratio.";
    body = { title: title, category: v.category, product_category: v.product_category || null, crop_ratio: v.crop_ratio, caption: caption };
    if (editing) {
      [["width", 20000], ["height", 20000], ["duration_seconds", 86400]].forEach(function (f) {
        var text = String(v[f[0]] || "").trim(), n;
        if (!text) return;
        n = whole(text, f[1]);
        if (n === null) errors[f[0]] = "Use a whole number."; else body[f[0]] = n;
      });
    }
    return hasErrors(errors) ? { errors: errors } : { body: body };
  }
  /* Moves item `id` one place up (-1) or down (+1); returns the whole list of ids in the new order, or null when it cannot move. */
  function moved(ids, id, dir) {
    var at = ids.indexOf(id), to = at + dir;
    if (at < 0 || to < 0 || to >= ids.length) return null;
    var out = ids.slice(); out[at] = ids[to]; out[to] = id;
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
  function valid(a) { return !!a && typeof a.id === "string" && ID_RE.test(a.id) && typeof a.title === "string"; }
  function pending(a) { return a.asset_type === "video" && !a.file_url && !embedUrl(a.embed_url); }
  function hasVideo(a) { return !!a.file_url || !!embedUrl(a.embed_url); }
  function picture(a) { return httpsUrl(a.thumb_url) || httpsUrl(a.poster_url) || (a.asset_type === "image" ? httpsUrl(a.file_url) : ""); }
  function apiFields(res) { return res && res.data && res.data.fields ? res.data.fields : null; }
  function refused(res) {
    if (res.status === 503) return NO_STORE;
    if (res.status === 413) return "The file is too large.";
    return msgOf(res, "That did not work. Please try again.");
  }

  /* ---------- load ---------- */

  function setNav(on) { Array.prototype.forEach.call(document.querySelectorAll("[data-media-nav]"), function (n) { n.hidden = !on; }); }

  function show() {
    var mine = ++token, r = clear(root());
    if (S && S.sc) S.sc.stop();
    S = { site: null, assets: [], adding: false, editing: "", confirm: "", sc: null };
    r.setAttribute("aria-busy", "true");
    add(r, h("p", "ml-meta", "Loading…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!res.ok) { failedPanel(); return; }
      if (!sites.length) { unavailable(); return; }
      S.site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      if (!S.site) { unavailable(); return; } /* no site id, so no media request */
      read(mine);
    });
  }
  function hide() { token++; if (ABORT) { try { ABORT(); } catch (e) { /* ignore */ } ABORT = null; } if (S && S.sc) S.sc.stop(); S = null; say(""); var r = root(); if (r) clear(r); }
  function read(mine) {
    D.call("GET", base(), null, true).then(function (res) {
      if (mine !== token || !S || res.status === 401) return;
      if (res.status === 404) { unavailable(); return; }
      if (!res.ok) { failedPanel(res.status === 403 ? msgOf(res, "") : ""); return; }
      var d = res.data || {};
      S.assets = Array.isArray(d.assets) ? d.assets.filter(valid) : [];
      render(); setNav(true);
      sharedList(mine);
    });
  }
  /* "From <source store>": what the content source offers, and the Share switch when this site is the source (shared-content.js). */
  function sharedList(mine) {
    if (!window.NOShared || S.sc) return;
    S.sc = window.NOShared.create({ kind: "media", site: S.site, changed: function () { reload(); } });
    S.sc.load(function () { if (mine === token && S) render(); });
  }
  /* The links stay hidden until the API shows the Media Library is open for this site (a 404 means members are off or it is not a Santé site). */
  function probe() {
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!sites.length) return;
      var site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      if (!site) return;
      D.call("GET", "/sites/" + site + "/media/", null, true).then(function (r) { if (r.ok) setNav(true); });
    });
  }

  function card(id, title, chip) {
    var s = h("section", "ml-card"); s.setAttribute("aria-labelledby", "ml-h-" + id);
    var t = h("h2", "ml-h2", title); t.setAttribute("id", "ml-h-" + id);
    add(s, add(h("div", "ml-head"), t, chip ? h("span", "chip chip-" + chip[0], chip[1]) : null));
    return s;
  }
  function failedPanel(extra) {
    var r = clear(root()); r.removeAttribute("aria-busy");
    var s = card("err", "We couldn’t load the Media Library");
    s.setAttribute("role", "alert");
    add(s, h("p", "ml-lead", extra || "Check your connection and try again. Nothing was changed."), btn("Try again", "ghost", function () { show(); }));
    r.appendChild(s);
    setNav(false);
  }
  function unavailable() {
    var r = clear(root()); r.removeAttribute("aria-busy");
    r.appendChild(add(card("off", "The Media Library is not available yet"), h("p", "ml-lead", "It is not open for this site right now. Nothing is wrong with your account.")));
    setNav(false);
  }

  /* ---------- field helpers ---------- */

  function field(id, label, input, hint) {
    var w = h("div", "ml-field"), lab = h("label", "ml-label", label), err = h("p", "ml-error");
    lab.setAttribute("for", id); input.setAttribute("id", id); err.setAttribute("id", id + "-err"); err.hidden = true;
    input.mlErr = err;
    var tip = hint ? h("p", "ml-hint", hint) : null;
    if (tip) { tip.setAttribute("id", id + "-hint"); input.setAttribute("aria-describedby", id + "-hint"); input.setAttribute("data-hint", id + "-hint"); }
    return add(w, lab, input, tip, err);
  }
  function markBad(input, text) {
    var err = input.mlErr; if (!err) return;
    err.textContent = text; err.hidden = false;
    input.classList.add("ml-invalid"); input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", (input.getAttribute("data-hint") ? input.getAttribute("data-hint") + " " : "") + err.id);
  }
  function markOk(input) {
    var err = input.mlErr;
    if (err) { err.hidden = true; err.textContent = ""; }
    input.classList.remove("ml-invalid"); input.removeAttribute("aria-invalid");
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
  function input(type, name, max) {
    var a = { "class": "ml-input", type: type, name: name, autocomplete: "off" };
    if (max) a.maxlength = String(max);
    return D.el("input", a);
  }
  function textarea(name, max) { return D.el("textarea", { "class": "ml-input ml-textarea", name: name, rows: "3", maxlength: String(max) }); }
  function select(name, options, value) {
    var s = D.el("select", { "class": "ml-input", name: name });
    options.forEach(function (o) { var op = D.el("option", { value: o[0] }, o[1]); if (o[0] === value) op.selected = true; s.appendChild(op); });
    s.value = value;
    return s;
  }
  function fileInput(name, accept) { return D.el("input", { "class": "ml-input", type: "file", name: name, accept: accept }); }
  function chosen(box) { return box && box.files && box.files[0] ? box.files[0] : null; }

  /* A file straight to a store address the API named (a video to the media store), with exactly the headers it gave and no cookie.
     progress(percent) as it goes. Resolves {ok, status}; status 0 means it was not sent or no answer was read. */
  function put(method, url, headers, body, progress) {
    return new Promise(function (resolve) {
      var x = new XMLHttpRequest();
      try {
        x.open(method || "PUT", url);
        Object.keys(headers || {}).forEach(function (k) { x.setRequestHeader(k, headers[k]); });
      } catch (e) { resolve({ ok: false, status: 0 }); return; }
      x.upload.onprogress = function (e) { if (e && e.lengthComputable && e.total > 0) progress(Math.min(100, Math.round(e.loaded * 100 / e.total))); };
      x.onload = function () { resolve({ ok: x.status >= 200 && x.status < 300, status: x.status }); };
      x.onerror = x.onabort = x.ontimeout = function () { resolve({ ok: false, status: 0 }); };
      x.send(body);
    });
  }

  /* The upload block of a Bunny token: the TUS endpoint (https, or http on this computer for the local stand-in) and the four signed values. */
  function uploadOk(u) {
    return !!u && typeof u === "object" && !!safeUrl(u.endpoint) && ["library_id", "video_id", "signature", "expires"].every(function (k) { return (typeof u[k] === "string" || typeof u[k] === "number") && String(u[k]); });
  }
  /* Why attach refused: Bunny's too-large answer by its own words, else the field text or the API's message. */
  function attachWhy(att) {
    var f = apiFields(att), code = att.data && att.data.code;
    if (code === "video_too_large") return TOO_LARGE;
    return (f && (f.video_id || f.url)) || (att.status === 502 ? "The uploaded video could not be found. Try again." : refused(att));
  }
  /* A video to the store's own Bunny library: TUS with the signed headers, then attach {video_id} until Bunny has finished (409 video_processing). */
  function sendBunny(id, file, up, line, fail, mine) {
    var FAILED = "The video did not upload. Check the connection and try again.";
    if (!window.NOTus || !uploadOk(up)) return Promise.resolve(fail("That did not work. Please try again."));
    line("Uploading 0%");
    var t = window.NOTus.upload(file, {
      endpoint: up.endpoint,
      headers: { AuthorizationSignature: up.signature, AuthorizationExpire: up.expires, VideoId: up.video_id, LibraryId: up.library_id },
      metadata: { filetype: file.type, title: file.name || "video" },
      onProgress: function (p) { if (mine === token && S) line("Uploading " + p + "%"); }
    });
    ABORT = t.abort;
    function ask(n) {
      return D.call("POST", base() + id + "/video/attach/", { video_id: String(up.video_id) }, true).then(function (att) {
        if (att.status === 401 || mine !== token || !S) return { ok: false, message: "" };
        if (att.ok) { line(""); return { ok: true, asset: att.data }; }
        if (att.status === 409 && att.data && att.data.code === "video_processing") {
          if (n >= POLL_MAX) return fail("The video is taking longer than usual to process. Try again in a few minutes.");
          return new Promise(function (go) { setTimeout(go, POLL_MS); }).then(function () { return mine !== token || !S ? { ok: false, message: "" } : ask(n + 1); });
        }
        return fail(attachWhy(att));
      });
    }
    return t.promise.then(function () {
      ABORT = null;
      if (mine !== token || !S) return { ok: false, message: "" };
      line("Processing…");
      return ask(0);
    }, function () { ABORT = null; return mine !== token || !S ? { ok: false, message: "" } : fail(FAILED); });
  }

  /* The video steps (b) and (c) for an existing video asset. Resolves {ok: true, asset} or {ok: false, message}. `note` shows the progress. */
  function sendVideo(id, file, note, mine) {
    function line(text) { note.textContent = text; note.hidden = !text; }
    function fail(message) { line(""); return { ok: false, message: message }; }
    line("Preparing the upload…");
    return D.call("POST", base() + id + "/video/token/", {}, true).then(function (tok) {
      if (tok.status === 401 || mine !== token || !S) return { ok: false, message: "" };
      var d = tok.data, headers;
      if (!tok.ok) return fail(refused(tok));
      if (d && d.host === "bunny") return sendBunny(id, file, d.upload, line, fail, mine);
      headers = d && d.headers && typeof d.headers === "object" ? d.headers : null;
      if (!d || !safeUrl(d.upload_url) || !headers || typeof d.public_url !== "string") return fail("That did not work. Please try again.");
      if (typeof d.max_bytes === "number" && file.size > d.max_bytes) return fail("The video is larger than " + Math.floor(d.max_bytes / MB) + " MB.");
      line("Uploading 0%");
      return put(d.method, d.upload_url, headers, file, function (p) { line("Uploading " + p + "%"); }).then(function (sent) {
        if (mine !== token || !S) return { ok: false, message: "" };
        if (!sent.ok) return fail("The video did not upload. Check the connection and try again.");
        line("Saving…");
        return D.call("POST", base() + id + "/video/attach/", { url: d.public_url }, true).then(function (att) {
          if (att.status === 401 || mine !== token || !S) return { ok: false, message: "" };
          if (att.ok) { line(""); return { ok: true, asset: att.data }; }
          var f = apiFields(att);
          return fail((f && f.url) || refused(att));
        });
      });
    });
  }

  /* ---------- render ---------- */

  function render() {
    var r = clear(root()); r.removeAttribute("aria-busy");
    var editing = S.editing ? findAsset(S.editing) : null;
    if (S.editing && !editing) S.editing = "";
    if (editing) r.appendChild(editCard(editing));
    else if (S.adding) r.appendChild(newCard());
    r.appendChild(listCard());
    if (S.sc && !editing && !S.adding) r.appendChild(S.sc.el);
  }
  function findAsset(id) { return S.assets.filter(function (a) { return a.id === id; })[0] || null; }

  function listCard() {
    var s = card("list", "Your media"), ids = S.assets.map(function (a) { return a.id; });
    add(s, h("p", "ml-lead", "Your members see the media that is Published, in this order, in the Media Library of their dashboard. A new one starts as a draft."));
    if (!S.adding && !S.editing) s.appendChild(add(h("div", "ml-actions"), btn("Add media", "primary", function () { S.adding = true; S.confirm = ""; render(); var t = byId("ml-n-title"); if (t) t.focus(); })));
    if (!S.assets.length) { s.appendChild(h("p", "ml-meta", "No media yet.")); return s; }
    var ul = h("ul", "ml-list");
    S.assets.forEach(function (a, i) { ul.appendChild(row(a, i, ids)); });
    s.appendChild(ul);
    return s;
  }
  function row(a, i, ids) {
    var li = h("li", "ml-row"), isVideo = a.asset_type === "video", open = pending(a), pic = picture(a), hidden = a.active === false;
    li.setAttribute("data-asset", a.id);
    var head = add(h("div", "ml-row-head"), h("span", "chip chip-" + (hidden ? "neutral" : a.published ? "ok" : "neutral"), hidden ? "Hidden" : a.published ? "Published" : "Draft"), h("span", "chip chip-neutral", isVideo ? "Video" : "Image"));
    if (open) head.appendChild(h("span", "chip chip-warn", "No video yet"));
    var detail = [a.category_label || labelOf(CATEGORIES, a.category), a.product_category_label || labelOf(PRODUCTS, a.product_category || "")].filter(Boolean).join(" · ");
    var main = add(h("div", "ml-row-main"), head, h("h3", "ml-row-title", a.title), detail ? h("p", "ml-meta", detail) : null, hidden ? h("p", "ml-meta", "Hidden from members") : null);
    if (a.copied_from && !a.published && !hidden) main.appendChild(h("p", "ml-meta ml-review", "Review and publish"));
    if (S.sc && S.sc.isSource()) main.appendChild(window.NOShared.shareSwitch("ml-share-" + a.id, a.shared, function (on, box) {
      var mine = token; box.disabled = true;
      D.call("PATCH", base() + a.id + "/", { shared: on }, true).then(function (res) {
        if (res.status === 401 || mine !== token || !S) return;
        if (!res.ok) { box.disabled = false; box.checked = !on; D.toast("That did not work", refused(res), "error"); return; }
        if (valid(res.data)) S.assets = upsert(S.assets, res.data);
        render();
      });
    }));
    var acts = h("div", "ml-row-actions");
    var up = btn("Up", "ghost", function (b) { reorder(b, a.id, -1, ids); }), dn = btn("Down", "ghost", function (b) { reorder(b, a.id, 1, ids); });
    up.setAttribute("aria-label", "Move " + a.title + " up"); dn.setAttribute("aria-label", "Move " + a.title + " down");
    up.disabled = i === 0; dn.disabled = i === ids.length - 1;
    var pub = btn(a.published ? "Unpublish" : "Publish", "ghost", function (b) { publish(b, a); });
    pub.setAttribute("aria-label", (a.published ? "Unpublish " : "Publish ") + a.title);
    if (!a.published && open) { pub.disabled = true; pub.setAttribute("title", "Upload the video first."); }
    var ed = btn("Edit", "ghost", function () { S.editing = a.id; S.adding = false; S.confirm = ""; render(); var t = byId("ml-e-title"); if (t) t.focus(); });
    ed.setAttribute("aria-label", "Edit " + a.title);
    var del = btn(S.confirm === a.id ? "Confirm delete" : "Delete", "danger", function (b) { removeAsset(b, a); });
    del.setAttribute("aria-label", (S.confirm === a.id ? "Confirm delete " : "Delete ") + a.title);
    add(acts, ed, up, dn, pub, del);
    if (pic) li.appendChild(D.el("img", { "class": "ml-thumb", src: pic, alt: "", width: "96", height: "96", loading: "lazy" }));
    add(li, main, acts);
    if (S.confirm === a.id) li.appendChild(h("p", "ml-meta ml-warn", "This deletes “" + a.title + "” and its files. Press Confirm delete to continue."));
    return li;
  }

  /* ---------- actions ---------- */

  function fail(b, res, fallback) { busy(b, false); D.toast("That did not work", msgOf(res, fallback), "error"); }
  function reorder(b, id, dir, ids) {
    var next = moved(ids, id, dir);
    if (!next) return;
    var mine = token; busy(b, true);
    D.call("POST", base() + "reorder/", { ids: next }, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok) { fail(b, res, "We could not move it. Please try again."); return; }
      S.assets = res.data && Array.isArray(res.data.assets) ? res.data.assets.filter(valid) : byIds(S.assets, next);
      render(); say("Order saved.");
    });
  }
  function publish(b, a) {
    var on = !a.published, mine = token; busy(b, true);
    D.call("POST", base() + a.id + "/" + (on ? "publish/" : "unpublish/"), {}, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok) { busy(b, false); D.toast("That did not work", res.status === 400 ? "It cannot be published yet. Check its video and fields." : msgOf(res, "Please try again."), "error"); return; }
      if (valid(res.data)) S.assets = upsert(S.assets, res.data);
      S.confirm = ""; render();
      var done = on ? "Published. Members can see it." : "Unpublished. Members no longer see it.";
      D.toast(on ? "Published" : "Unpublished", done); say(done);
    });
  }
  function removeAsset(b, a) {
    if (S.confirm !== a.id) { S.confirm = a.id; render(); return; }
    var mine = token; busy(b, true);
    D.call("DELETE", base() + a.id + "/", null, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok && res.status !== 404) { fail(b, res, "We could not delete it. Please try again."); return; }
      S.assets = S.assets.filter(function (x) { return x.id !== a.id; }); S.confirm = ""; if (S.editing === a.id) S.editing = ""; render();
      D.toast("Deleted", "The media and its files were deleted."); say("Media deleted.");
    });
  }
  function reload(then) {
    var mine = token;
    D.call("GET", base(), null, true).then(function (res) {
      if (mine !== token || !S || res.status === 401) return;
      if (res.ok && res.data && Array.isArray(res.data.assets)) S.assets = res.data.assets.filter(valid);
      render(); if (then) then();
    });
  }

  /* The add form: an image is one request; a video is created as a draft with its poster, then uploaded. */
  function newCard() {
    var s = card("new", "Add media"), type = select("asset_type", TYPES, "image"), title = input("text", "title", TITLE_MAX);
    var cat = select("category", CATEGORIES, "promo"), prod = select("product_category", PRODUCTS, ""), ratio = select("crop_ratio", RATIOS, "1:1"), cap = textarea("caption", CAPTION_MAX);
    var file = fileInput("file", IMAGE_TYPES.join(",")), poster = fileInput("poster", IMAGE_TYPES.join(",")), video = fileInput("video", VIDEO_TYPE);
    var imageBox = add(h("div", "ml-box"), field("ml-n-file", "Image", file, "JPEG, PNG or WebP, up to 10 MB."));
    var videoBox = add(h("div", "ml-box"), field("ml-n-poster", "Poster image", poster, "Shown on the card before the video plays. JPEG, PNG or WebP, up to 10 MB."), field("ml-n-video", "Video (MP4)", video, "MP4 only."));
    videoBox.hidden = true;
    type.addEventListener("change", function () { var v = type.value === "video"; imageBox.hidden = v; videoBox.hidden = !v; });
    var note = h("p", "ml-meta ml-progress"); note.setAttribute("role", "status"); note.hidden = true;
    var f = { title: title, category: cat, product_category: prod, crop_ratio: ratio, caption: cap, file: file, poster: poster, video: video };
    add(s, field("ml-n-type", "Type", type), field("ml-n-title", "Title", title), field("ml-n-cat", "Category", cat), field("ml-n-prod", "Product (optional)", prod),
      field("ml-n-ratio", "Crop ratio", ratio), field("ml-n-cap", "Caption (members copy this)", cap), imageBox, videoBox, note);
    add(s, add(h("div", "ml-actions"), btn("Add media", "primary", function (b) {
      var kind = type.value === "video" ? "video" : "image";
      var built = buildAsset({ title: title.value, category: cat.value, product_category: prod.value, crop_ratio: ratio.value, caption: cap.value }, false);
      var errors = built.errors || {}, img, poster1, movie;
      if (kind === "image") { img = imageCheck(chosen(file), "the image"); if (img.error) errors.file = img.error; }
      else {
        poster1 = imageCheck(chosen(poster), "the poster image"); if (poster1.error) errors.poster = poster1.error;
        movie = videoCheck(chosen(video)); if (movie.error) errors.video = movie.error;
      }
      if (hasErrors(errors)) { showFields(f, errors); return; }
      showFields(f, {});
      var mine = token, create = { title: built.body.title, asset_type: kind, category: built.body.category, crop_ratio: built.body.crop_ratio, caption: built.body.caption };
      if (built.body.product_category) create.product_category = built.body.product_category;
      busy(b, true);
      /* (1) the draft, as JSON, with no file; (2) its image (or the video's poster) as a multipart request; (3) for a video, token, PUT and attach. */
      D.call("POST", base(), create, true).then(function (res) {
        if (res.status === 401 || mine !== token || !S) return;
        if (!res.ok || !valid(res.data)) {
          busy(b, false);
          if (res.status === 404) { unavailable(); return; }
          if (!showFields(f, apiFields(res))) D.toast("That did not work", refused(res), "error");
          return;
        }
        var id = res.data.id, form = new FormData(), pic = kind === "image" ? img.file : poster1.file;
        S.assets = upsert(S.assets, res.data);
        form.append("kind", kind === "image" ? "file" : "poster"); form.append("file", pic);
        D.send("POST", base() + id + "/image/", form).then(function (up) {
          if (up.status === 401 || mine !== token || !S) return;
          if (!up.ok) {
            busy(b, false);
            var uf = apiFields(up), why = (uf && uf.file) || refused(up);
            S.adding = false; S.editing = id; reload(function () {
              var box = byId(kind === "image" ? "ml-e-file" : "ml-e-poster"); if (box) markBad(box, why);
              D.toast("Saved as a draft, but the picture was not added", why, "error");
            });
            return;
          }
          if (valid(up.data)) S.assets = upsert(S.assets, up.data);
          if (kind === "image") { busy(b, false); S.adding = false; render(); D.toast("Added", "The image was added as a draft."); say("Image added as a draft."); return; }
          sendVideo(id, movie.file, note, mine).then(function (sent) {
            if (mine !== token || !S) return;
            busy(b, false);
            if (sent.ok) { if (valid(sent.asset)) S.assets = upsert(S.assets, sent.asset); S.adding = false; render(); D.toast("Added", "The video was added as a draft."); say("Video added as a draft."); return; }
            S.adding = false; S.editing = id; reload(function () {
              var box = byId("ml-e-video"); if (box && sent.message) markBad(box, sent.message);
              D.toast("Saved, but the video is not uploaded", sent.message || "Open it with Edit and choose the video again.", "error");
            });
          });
        });
      });
    }), btn("Cancel", "ghost", function () { S.adding = false; render(); })));
    return s;
  }

  /* The edit form: the fields, then one control for each file (image, poster, thumbnail, video). */
  function editCard(a) {
    var isVideo = a.asset_type === "video", s = card("edit", "Edit: " + a.title, a.active === false ? ["neutral", "Hidden"] : a.published ? ["ok", "Published"] : ["neutral", "Draft"]);
    var title = input("text", "title", TITLE_MAX); title.value = a.title || "";
    var cat = select("category", CATEGORIES, a.category || "promo"), prod = select("product_category", PRODUCTS, a.product_category || ""), ratio = select("crop_ratio", RATIOS, a.crop_ratio || "1:1");
    var cap = textarea("caption", CAPTION_MAX); cap.value = a.caption || "";
    var w = input("text", "width", 5), ht = input("text", "height", 5), dur = input("text", "duration_seconds", 5);
    [w, ht, dur].forEach(function (n) { n.setAttribute("inputmode", "numeric"); });
    w.value = a.width ? String(a.width) : ""; ht.value = a.height ? String(a.height) : ""; dur.value = a.duration_seconds ? String(a.duration_seconds) : "";
    var f = { title: title, category: cat, product_category: prod, crop_ratio: ratio, caption: cap, width: w, height: ht, duration_seconds: dur };
    add(s, field("ml-e-title", "Title", title), field("ml-e-cat", "Category", cat), field("ml-e-prod", "Product (optional)", prod), field("ml-e-ratio", "Crop ratio", ratio),
      field("ml-e-cap", "Caption (members copy this)", cap), field("ml-e-w", "Width in pixels (optional)", w), field("ml-e-ht", "Height in pixels (optional)", ht),
      field("ml-e-dur", "Length in seconds (optional)", dur));
    add(s, add(h("div", "ml-actions"), btn("Save changes", "primary", function (b) {
      var built = buildAsset({ title: title.value, category: cat.value, product_category: prod.value, crop_ratio: ratio.value, caption: cap.value, width: w.value, height: ht.value, duration_seconds: dur.value }, true);
      if (built.errors) { showFields(f, built.errors); return; }
      showFields(f, {});
      var mine = token; busy(b, true);
      D.call("PATCH", base() + a.id + "/", built.body, true).then(function (res) {
        if (res.status === 401 || mine !== token || !S) return;
        busy(b, false);
        if (!res.ok) { if (res.status === 404) { S.editing = ""; reload(); return; } if (!showFields(f, apiFields(res))) D.toast("That did not work", refused(res), "error"); return; }
        if (valid(res.data)) S.assets = upsert(S.assets, res.data);
        S.editing = ""; render(); D.toast("Saved", "The changes were saved."); say("Changes saved.");
      });
    }), btn("Close", "ghost", function () { S.editing = ""; render(); })));
    /* the files */
    var files = h("div", "ml-files");
    add(files, h("h3", "ml-h3", "Files"));
    var links = h("p", "ml-meta ml-links"), ownThumb = !!httpsUrl(a.thumb_url) && a.thumb_url !== a.poster_url && a.thumb_url !== a.file_url;
    [["Open file", a.file_url], ["Open poster", a.poster_url], ["Open thumbnail", ownThumb ? a.thumb_url : ""]].filter(function (l) { return httpsUrl(l[1]); }).forEach(function (l, i) {
      if (i) links.appendChild(h("span", "", " · "));
      links.appendChild(D.el("a", { "class": "ml-link", href: l[1], target: "_blank", rel: "noopener noreferrer" }, l[0]));
    });
    if (links.firstChild) files.appendChild(links);
    if (!isVideo) files.appendChild(imageControl(a, "file", "e-file", "Replace the image", "Image replaced."));
    else {
      files.appendChild(h("p", "ml-meta", hasVideo(a) ? "A video is attached." : "No video yet. It cannot be published until one is uploaded."));
      if (embedUrl(a.embed_url)) files.appendChild(player(a));
      files.appendChild(videoControl(a));
      files.appendChild(imageControl(a, "poster", "e-poster", "Replace the poster image", "Poster replaced."));
    }
    files.appendChild(imageControl(a, "thumb", "e-thumb", "Thumbnail (optional)", "Thumbnail set.", ownThumb));
    s.appendChild(files);
    return s;
  }
  /* One image for the asset: its file, its poster or its thumbnail. */
  function imageControl(a, kind, id, label, done, clearable) {
    var box = fileInput("file", IMAGE_TYPES.join(",")), w = h("div", "ml-file");
    add(w, field("ml-" + id, label, box, kind === "thumb" ? (clearable ? "A thumbnail is set." : "No thumbnail set. The card uses the image or the poster.") : "JPEG, PNG or WebP, up to 10 MB."));
    var acts = h("div", "ml-actions");
    acts.appendChild(btn("Upload", "ghost", function (b) {
      var p = imageCheck(chosen(box), "a picture");
      if (p.error) { showFields({ file: box }, { file: p.error }); return; }
      showFields({ file: box }, {});
      var form = new FormData(), mine = token; form.append("kind", kind); form.append("file", p.file); busy(b, true);
      D.send("POST", base() + a.id + "/image/", form).then(function (res) {
        if (res.status === 401 || mine !== token || !S) return;
        busy(b, false);
        if (!res.ok) { var fl = apiFields(res); showFields({ file: box }, { file: (fl && fl.file) || refused(res) }); return; }
        if (valid(res.data)) S.assets = upsert(S.assets, res.data);
        render(); D.toast("Saved", done); say(done);
      });
    }));
    if (kind === "thumb") {
      var clr = btn("Clear thumbnail", "ghost", function (b) {
        var mine = token; busy(b, true);
        D.call("DELETE", base() + a.id + "/image/", null, true).then(function (res) {
          if (res.status === 401 || mine !== token || !S) return;
          if (!res.ok) { fail(b, res, "We could not clear it. Please try again."); return; }
          if (valid(res.data)) S.assets = upsert(S.assets, res.data);
          render(); D.toast("Saved", "The thumbnail was cleared."); say("Thumbnail cleared.");
        });
      });
      clr.disabled = !clearable;
      acts.appendChild(clr);
    }
    w.appendChild(acts);
    return w;
  }
  /* A video in the store's own Bunny library plays in Bunny's player, 16:9, with the asset's title for screen readers. */
  function player(a) {
    var fr = D.el("iframe", { "class": "ml-player", src: embedUrl(a.embed_url), title: a.title, allowfullscreen: "" });
    fr.setAttribute("loading", "lazy"); fr.setAttribute("referrerpolicy", "strict-origin-when-cross-origin"); fr.setAttribute("allow", "fullscreen; picture-in-picture; encrypted-media");
    return fr;
  }
  function videoControl(a) {
    var box = fileInput("video", VIDEO_TYPE), w = h("div", "ml-file"), note = h("p", "ml-meta ml-progress");
    note.setAttribute("role", "status"); note.hidden = true;
    add(w, field("ml-e-video", hasVideo(a) ? "Replace the video (MP4)" : "Video (MP4)", box, "MP4 only."), note);
    w.appendChild(add(h("div", "ml-actions"), btn("Upload video", "ghost", function (b) {
      var m = videoCheck(chosen(box));
      if (m.error) { showFields({ video: box }, { video: m.error }); return; }
      showFields({ video: box }, {});
      var mine = token; busy(b, true);
      sendVideo(a.id, m.file, note, mine).then(function (sent) {
        if (mine !== token || !S) return;
        busy(b, false);
        if (sent.ok) { if (valid(sent.asset)) S.assets = upsert(S.assets, sent.asset); render(); D.toast("Saved", "The video was uploaded."); say("Video uploaded."); return; }
        if (sent.message) showFields({ video: box }, { video: sent.message });
      });
    })));
    return w;
  }

  window.NOMedia = { show: show, hide: hide, probe: probe, util: { buildAsset: buildAsset, imageCheck: imageCheck, videoCheck: videoCheck, moved: moved, upsert: upsert,
    safeUrl: safeUrl, httpsUrl: httpsUrl, embedUrl: embedUrl, hasVideo: hasVideo, pending: pending, picture: picture, whole: whole } };
})();
