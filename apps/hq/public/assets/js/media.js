/* The Media library page (ClickUp z8uq9mezdk): every Santé media asset in order, with Up and Down, Publish or Unpublish, Edit,
   Delete behind a confirm dialog, and a form to add one. Port reference (flow only): TWCinc's HQ media library upload screens.
   An image goes to the backend as one multipart request. A video is three steps: (a) a draft asset with its poster, (b) a
   short-lived token, and the browser sends the MP4 straight to the upload address the backend returns, with exactly the headers it
   returns, (c) the backend is told the stored file's address. The page decides nothing: the backend does. Nothing is stored in
   the browser. */
(function () {
  var H = window.NOHq, F = window.NOFin, T = window.NOTrain, $ = function (id) { return document.getElementById(id); };
  var known = false, working = false, assets = [], run = 0, editing = "";
  var MB = 1024 * 1024, IMAGE_MAX = 10 * MB, VIDEO_MAX = 50 * MB;
  var IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"], VIDEO_TYPE = "video/mp4";
  var dlg = F.dialogs(function () { return box.busy(); });
  var box = T.confirmer(dlg);
  var NEW_FIELDS = [["title", "n-title", "n-title-err"], ["category", "n-cat", "n-cat-err"], ["product_category", "n-prod", "n-prod-err"],
    ["crop_ratio", "n-ratio", "n-ratio-err"], ["caption", "n-cap", "n-cap-err"], ["file", "n-file", "n-file-err"], ["poster", "n-poster", "n-poster-err"]];
  var EDIT_FIELDS = [["title", "e-title", "e-title-err"], ["category", "e-cat", "e-cat-err"], ["product_category", "e-prod", "e-prod-err"],
    ["crop_ratio", "e-ratio", "e-ratio-err"], ["caption", "e-cap", "e-cap-err"], ["width", "e-w", "e-w-err"], ["height", "e-ht", "e-ht-err"],
    ["duration_seconds", "e-dur", "e-dur-err"]];
  var NO_STORE = "Files cannot be stored yet: the media store is not set up.";

  function show(view) { ["boot", "v-main", "v-down"].forEach(function (id) { $(id).hidden = id !== view; }); }

  function button(label, aria, fn, disabled) {
    var b = F.el("button", "no-btn no-btn-ghost", label);
    b.setAttribute("type", "button");
    b.setAttribute("aria-label", aria);
    b.disabled = !!disabled;
    b.addEventListener("click", fn);
    return b;
  }

  /* An address worth linking to or sending a file to: https, or http on this computer for the local stand-in. */
  function safeUrl(u) {
    return typeof u === "string" && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)[^\s"'<>]+$/.test(u) ? u : "";
  }

  /* The file a file input holds, or {error}. The backend checks it again. */
  function pick(input, kinds, max, none, wrong, big) {
    var f = input && input.files && input.files[0];
    if (!f) return { error: none };
    if (f.type && kinds.indexOf(f.type) < 0) return { error: wrong };
    if (typeof f.size === "number" && f.size > max) return { error: big };
    return { file: f };
  }
  function image(input, what) {
    return pick(input, IMAGE_TYPES, IMAGE_MAX, "Choose " + what + " first.", "Use a JPEG, PNG or WebP picture.", "The picture is larger than 10 MB.");
  }
  function video(input) {
    return pick(input, [VIDEO_TYPE], VIDEO_MAX, "Choose the video first.", "Use an MP4 video.", "The video is larger than 50 MB.");
  }

  /* ---- the list ---- */

  function draw() {
    var list = $("items"), ids = assets.map(function (a) { return a.id; });
    list.textContent = "";
    $("c-empty").hidden = assets.length > 0;
    assets.forEach(function (a, i) {
      var li = F.el("li", "trn-row"), main = F.el("div", "trn-main"), chips = F.el("div", "fin-row"), acts = F.el("div", "trn-acts"),
        pending = a.asset_type === "video" && !a.file_url;
      main.appendChild(F.el("strong", "", a.title));
      main.appendChild(F.el("p", "small", (a.asset_type === "video" ? "Video" : "Image") + ", " + (a.category_label || a.category) + (a.product_category_label ? ", " + a.product_category_label : "")));
      chips.appendChild(F.el("span", a.published ? "chip chip-ok" : "chip chip-neutral", a.published ? "Published" : "Draft"));
      if (pending) chips.appendChild(F.el("span", "chip chip-warn", "No video yet"));
      main.appendChild(chips);
      acts.appendChild(button("Up", "Move " + a.title + " up", function () { reorder(ids, a.id, -1); }, working || i === 0));
      acts.appendChild(button("Down", "Move " + a.title + " down", function () { reorder(ids, a.id, 1); }, working || i === assets.length - 1));
      acts.appendChild(button(a.published ? "Unpublish" : "Publish", (a.published ? "Unpublish " : "Publish ") + a.title, function () { publish(a); }, working || (!a.published && pending)));
      acts.appendChild(button("Edit", "Edit " + a.title, function () { edit(a.id); }, working));
      acts.appendChild(button("Delete", "Delete " + a.title, function (e) { remove(a, e.target); }, working));
      li.appendChild(main);
      li.appendChild(acts);
      list.appendChild(li);
    });
  }

  function load(message) {
    var mine = ++run;
    return H.call("POST", "media/list/", {}).then(function (res) {
      if (mine !== run) return;
      if (F.left(res)) return;
      if (!res.ok || !Array.isArray(res.data.assets)) { show("v-down"); return; }
      assets = res.data.assets.filter(function (a) { return a && typeof a.id === "string" && typeof a.title === "string"; });
      draw();
      if (editing) fill(editing, false);
      F.say("c-msg", message || "");
      show("v-main");
    });
  }

  function refused(res) {
    if (res.status === 503) return NO_STORE;
    if (res.status === 413) return "The file is too large.";
    return T.LOST;
  }

  function reorder(ids, id, step) {
    var next = T.moved(ids, id, step);
    if (!next || working) return;
    working = true;
    draw();
    F.say("c-msg", "");
    H.call("POST", "media/reorder/", { ids: next }).then(function (res) {
      working = false;
      if (F.left(res)) return;
      if (!res.ok) { F.say("c-msg", T.LOST); draw(); return; }
      load("Order saved.");
    });
  }

  function publish(a) {
    var on = !a.published;
    if (working) return;
    working = true;
    draw();
    H.call("POST", on ? "media/publish/" : "media/unpublish/", { id: a.id }).then(function (res) {
      working = false;
      if (F.left(res)) return;
      if (!res.ok) { F.say("c-msg", res.status === 400 && res.code === "invalid_request" ? "It cannot be published yet. Check its video and fields." : T.LOST); draw(); return; }
      load(on ? "Published. Members can see it." : "Unpublished. Members no longer see it.");
    });
  }

  function remove(a, opener) {
    box.ask(opener, "Delete this media?", "“" + a.title + "” and its files will be deleted. This cannot be undone.", "Delete media", function () {
      return H.call("POST", "media/delete/", { id: a.id }).then(function (res) {
        if (F.left(res)) return true;
        if (res.ok || res.status === 404) { if (editing === a.id) closeEdit(); load("Media deleted."); return true; }
        F.say("confirm-err", T.LOST);
        return false;
      });
    });
  }

  /* ---- the video: steps b and c for an existing video asset ---- */

  /* Resolves {ok: true} or {ok: false, message}. */
  function sendVideo(id, file, progId) {
    var bar = $(progId);
    function say(text) { bar.textContent = text; bar.hidden = !text; }
    function fail(message) { say(""); return { ok: false, message: message }; }
    say("Preparing the upload…");
    return H.call("POST", "media/video/token/", { id: id }).then(function (tok) {
      var d = tok.data, headers;
      if (F.left(tok)) return fail("");
      if (!tok.ok) return fail(refused(tok));
      headers = d && d.headers && typeof d.headers === "object" ? d.headers : null;
      if (!d || !safeUrl(d.upload_url) || !headers || typeof d.public_url !== "string") return fail(T.LOST);
      if (typeof d.max_bytes === "number" && file.size > d.max_bytes) return fail("The video is larger than " + Math.floor(d.max_bytes / MB) + " MB.");
      say("Uploading 0%");
      return H.put(d.method, d.upload_url, headers, file, function (p) { say("Uploading " + p + "%"); }).then(function (sent) {
        if (!sent.ok) return fail("The video did not upload. Check the connection and try again.");
        say("Saving…");
        return H.call("POST", "media/video/attach/", { id: id, url: d.public_url }).then(function (att) {
          if (F.left(att)) return fail("");
          if (att.ok) { say(""); return { ok: true }; }
          return fail(T.first(att.fields, "url") || refused(att));
        });
      });
    });
  }

  /* ---- add ---- */

  function typeChanged() {
    var isVideo = $("n-type").value === "video";
    $("n-image-box").hidden = isVideo;
    $("n-video-box").hidden = !isVideo;
  }
  $("n-type").addEventListener("change", typeChanged);

  function resetNew() {
    ["n-title", "n-cap", "n-file", "n-poster", "n-video"].forEach(function (id) { $(id).value = ""; });
  }

  $("n-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var kind = $("n-type").value === "video" ? "video" : "image", title = $("n-title").value.trim(), form, file, poster, movie, bad = false;
    F.say("n-err", "");
    NEW_FIELDS.forEach(function (f) { T.mark($(f[1]), f[2], ""); });
    F.say("n-prog", "");
    if (!title) { T.mark($("n-title"), "n-title-err", "Enter a title."); bad = true; }
    if (kind === "image") {
      file = image($("n-file"), "the image");
      if (file.error) { T.mark($("n-file"), "n-file-err", file.error); bad = true; }
    } else {
      poster = image($("n-poster"), "the poster image");
      if (poster.error) { T.mark($("n-poster"), "n-poster-err", poster.error); bad = true; }
      movie = video($("n-video"));
      if (movie.error) { T.mark($("n-video"), "n-video-err", movie.error); bad = true; }
    }
    if (bad) return;
    form = new FormData();
    form.append("title", title);
    form.append("asset_type", kind);
    form.append("category", $("n-cat").value);
    form.append("crop_ratio", $("n-ratio").value);
    form.append("caption", $("n-cap").value.trim());
    if ($("n-prod").value) form.append("product_category", $("n-prod").value);
    if (kind === "image") form.append("file", file.file); else form.append("poster", poster.file);
    $("n-go").disabled = true;
    H.upload("media/upload/", form).then(function (res) {
      if (F.left(res)) { $("n-go").disabled = false; return; }
      if (!res.ok || !res.data || typeof res.data.id !== "string") {
        $("n-go").disabled = false;
        if (res.status === 400 && res.code === "invalid_request") { if (!T.showFields(res.fields, NEW_FIELDS)) F.say("n-err", "Check the values and try again."); return; }
        F.say("n-err", refused(res));
        return;
      }
      if (kind === "image") { $("n-go").disabled = false; resetNew(); load("Image added as a draft."); return; }
      sendVideo(res.data.id, movie.file, "n-prog").then(function (sent) {
        $("n-go").disabled = false;
        resetNew();
        if (sent.ok) { load("Video added as a draft."); return; }
        load("The draft was saved, but the video is not uploaded yet. " + sent.message + " Open it with Edit and choose the video again.");
      });
    });
  });

  /* ---- edit ---- */

  function find(id) { return assets.filter(function (a) { return a.id === id; })[0] || null; }
  function closeEdit() { editing = ""; $("v-edit").hidden = true; }

  /* Fills the editor from the list. `focus` is true when the person just opened it. */
  function fill(id, focus) {
    var a = find(id), isVideo, ownThumb, box2 = $("e-links");
    if (!a) { closeEdit(); return; }
    editing = id;
    isVideo = a.asset_type === "video";
    ownThumb = !!a.thumb_url && a.thumb_url !== a.poster_url && a.thumb_url !== a.file_url;
    $("e-h").textContent = "Edit: " + a.title;
    $("e-title").value = a.title;
    $("e-cat").value = a.category || "promo";
    $("e-prod").value = a.product_category || "";
    $("e-ratio").value = a.crop_ratio || "1:1";
    $("e-cap").value = a.caption || "";
    $("e-w").value = a.width ? String(a.width) : "";
    $("e-ht").value = a.height ? String(a.height) : "";
    $("e-dur").value = a.duration_seconds ? String(a.duration_seconds) : "";
    $("e-img-box").hidden = isVideo;
    $("e-vid-box").hidden = !isVideo;
    $("e-poster-box").hidden = !isVideo;
    $("e-video-state").textContent = a.file_url ? "A video is attached." : "No video yet. It cannot be published until one is uploaded.";
    $("e-thumb-state").textContent = ownThumb ? "A thumbnail is set." : "No thumbnail set. The card uses the image or the poster.";
    $("e-thumb-clear").disabled = !ownThumb;
    box2.textContent = "";
    [["Open file", a.file_url], ["Open poster", a.poster_url], ["Open thumbnail", ownThumb ? a.thumb_url : ""]].filter(function (l) { return safeUrl(l[1]); }).forEach(function (l, i) {
      var link = F.el("a", "", l[0]);
      link.setAttribute("href", l[1]);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
      if (i) box2.appendChild(F.el("span", "", " · "));
      box2.appendChild(link);
    });
    $("v-edit").hidden = false;
    if (focus) $("e-title").focus();
  }
  function edit(id) {
    EDIT_FIELDS.forEach(function (f) { T.mark($(f[1]), f[2], ""); });
    ["e-err", "e-file-err", "e-video-err", "e-poster-err", "e-thumb-err", "e-prog"].forEach(function (x) { F.say(x, ""); });
    fill(id, true);
  }
  $("e-close").addEventListener("click", closeEdit);

  $("e-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var title = $("e-title").value.trim(), body = { id: editing }, bad = false;
    F.say("e-err", "");
    EDIT_FIELDS.forEach(function (f) { T.mark($(f[1]), f[2], ""); });
    if (!title) { T.mark($("e-title"), "e-title-err", "Enter a title."); return; }
    body.title = title;
    body.category = $("e-cat").value;
    body.product_category = $("e-prod").value;
    body.crop_ratio = $("e-ratio").value;
    body.caption = $("e-cap").value.trim();
    [["width", "e-w", 20000], ["height", "e-ht", 20000], ["duration_seconds", "e-dur", 86400]].forEach(function (f) {
      var text = $(f[1]).value.trim(), n;
      if (!text) return;
      n = T.whole(text, 0, f[2]);
      if (n === null) { T.mark($(f[1]), f[1] + "-err", "Use a whole number."); bad = true; } else body[f[0]] = n;
    });
    if (bad) return;
    $("e-save").disabled = true;
    H.call("POST", "media/update/", body).then(function (res) {
      $("e-save").disabled = false;
      if (F.left(res)) return;
      if (res.ok) { load("Changes saved."); return; }
      if (res.status === 400 && res.code === "invalid_request") { if (!T.showFields(res.fields, EDIT_FIELDS)) F.say("e-err", "Check the values and try again."); return; }
      F.say("e-err", T.LOST);
    });
  });

  /* One image for the asset: its file, its poster or its thumbnail. */
  function sendImage(kind, inputId, errId, done) {
    var p = image($(inputId), "a picture"), form;
    F.say(errId, "");
    if (p.error) { F.say(errId, p.error); return; }
    form = new FormData();
    form.append("id", editing);
    form.append("kind", kind);
    form.append("file", p.file);
    H.upload("media/file/set/", form).then(function (res) {
      if (F.left(res)) return;
      if (res.ok) { $(inputId).value = ""; done(); return; }
      if (res.status === 400 && T.first(res.fields, "file")) { F.say(errId, T.first(res.fields, "file")); return; }
      F.say(errId, refused(res));
    });
  }
  $("e-file-up").addEventListener("click", function () { sendImage("file", "e-file", "e-file-err", function () { load("Image replaced."); }); });
  $("e-poster-up").addEventListener("click", function () { sendImage("poster", "e-poster", "e-poster-err", function () { load("Poster replaced."); }); });
  $("e-thumb-up").addEventListener("click", function () { sendImage("thumb", "e-thumb", "e-thumb-err", function () { load("Thumbnail set."); }); });
  $("e-thumb-clear").addEventListener("click", function () {
    F.say("e-thumb-err", "");
    H.call("POST", "media/file/clear/", { id: editing }).then(function (res) {
      if (F.left(res)) return;
      if (res.ok) { load("Thumbnail cleared."); return; }
      F.say("e-thumb-err", T.LOST);
    });
  });
  $("e-video-up").addEventListener("click", function () {
    var m = video($("e-video")), id = editing;
    F.say("e-video-err", "");
    if (m.error) { F.say("e-video-err", m.error); return; }
    $("e-video-up").disabled = true;
    sendVideo(id, m.file, "e-prog").then(function (sent) {
      $("e-video-up").disabled = false;
      if (sent.ok) { $("e-video").value = ""; load("Video uploaded."); return; }
      if (sent.message) F.say("e-video-err", sent.message);
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
