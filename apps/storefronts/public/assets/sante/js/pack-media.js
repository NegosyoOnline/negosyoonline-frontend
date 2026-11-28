/* The member Media Library (ClickUp z8uq9mezdk), this storefront's own file. Without it the page still works: the filters are a
   GET form and "Load 12 more" is a link. With it: filters apply on change, the phone drawer, Copy caption, the preview popup, and
   the next cards load by themselves as the end of the grid nears (the link is the fallback). It reads text from the page and puts it in with textContent and setAttribute only;
   the next cards come from this site's own address and are adopted as nodes, never written as HTML text. */
(function () {
  var page = document.querySelector("[data-ml-page]");
  if (!page) return;
  page.classList.add("ml-js");
  var form = page.querySelector("[data-ml-form]");
  var rail = page.querySelector("[data-ml-rail]");
  var scrim = page.querySelector(".ml-scrim");
  var opener = page.querySelector("[data-ml-filters]");
  var live = page.querySelector("[data-ml-live]");
  var dialog = page.querySelector("[data-ml-dialog]");
  var timers = [];

  function say(text) { if (live) { live.textContent = ""; setTimeout(function () { live.textContent = text; }, 30); } }

  /* ---- the filters ---- */
  if (form) {
    form.addEventListener("change", function (e) {
      var t = e.target;
      if (t && (t.type === "radio" || t.tagName === "SELECT")) form.submit();
    });
  }
  function setDrawer(open) {
    if (!rail) return;
    rail.classList.toggle("ml-open", open);
    if (scrim) scrim.hidden = !open;
    if (opener) opener.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { var first = rail.querySelector("input:checked") || rail.querySelector("input"); if (first) first.focus(); }
    else if (opener && opener.offsetParent !== null) opener.focus();
  }
  if (opener) opener.addEventListener("click", function () { setDrawer(!rail.classList.contains("ml-open")); });
  page.querySelectorAll("[data-ml-close]").forEach(function (b) { b.addEventListener("click", function () { setDrawer(false); }); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && rail && rail.classList.contains("ml-open")) setDrawer(false);
  });

  /* ---- Copy caption ---- */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var box = document.createElement("textarea");
      box.value = text;
      box.setAttribute("readonly", "");
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      document.body.removeChild(box);
      if (ok) resolve(); else reject(new Error("copy"));
    });
  }
  /* The button keeps its size: its three labels share one grid cell (pack-media.css) and only data-state changes which shows. */
  function copied(button, ok) {
    button.setAttribute("data-state", ok ? "ok" : "fail");
    say(ok ? "Caption copied." : "The caption could not be copied.");
    clearTimeout(timers[0]);
    timers[0] = setTimeout(function () { button.removeAttribute("data-state"); }, 1800);
  }

  /* ---- the preview popup (after TWCinc's media preview) ---- */
  function part(sel) { return dialog.querySelector(sel); }
  function preview(link) {
    if (!dialog || typeof dialog.showModal !== "function") return false;
    var stage = part("[data-ml-stage]");
    var kind = link.getAttribute("data-kind");
    var file = link.getAttribute("data-file") || "";
    var title = link.getAttribute("data-title") || "";
    var caption = link.getAttribute("data-caption") || "";
    var size = link.getAttribute("data-size") || "";
    var el;
    stage.textContent = "";
    var embed = link.getAttribute("data-embed") || "";
    if (kind === "video" && embed) {
      /* A video in the store's own Bunny library plays in Bunny's player (the page's policy frames that one host). */
      el = document.createElement("iframe");
      el.className = "ml-embed";
      el.setAttribute("src", embed);
      el.setAttribute("title", title || "Video");
      el.setAttribute("allowfullscreen", "");
      el.setAttribute("loading", "lazy");
      el.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      el.setAttribute("allow", "fullscreen; picture-in-picture; encrypted-media");
    } else if (kind === "video") {
      el = document.createElement("video");
      el.setAttribute("controls", "");
      el.setAttribute("playsinline", "");
      el.setAttribute("preload", "metadata");
      if (link.getAttribute("data-poster")) el.setAttribute("poster", link.getAttribute("data-poster"));
      el.setAttribute("src", file);
    } else {
      el = document.createElement("img");
      el.setAttribute("alt", title);
      el.setAttribute("src", file);
    }
    stage.appendChild(el);
    part("[data-ml-dialog-cat]").textContent = link.getAttribute("data-cat") || "";
    part("[data-ml-dialog-title]").textContent = title;
    part("[data-ml-dialog-pub]").textContent = link.getAttribute("data-date") ? "Published " + link.getAttribute("data-date") : "";
    var meta = part("[data-ml-dialog-meta]");
    meta.textContent = "";
    [["Format", link.getAttribute("data-format")], [kind === "video" ? "Duration" : "Dimensions", link.getAttribute("data-dims")], ["File size", size]].forEach(function (f) {
      if (!f[1]) return;
      var tile = document.createElement("div");
      var k = document.createElement("p");
      var v = document.createElement("p");
      k.className = "ml-m-k"; k.textContent = f[0];
      v.className = "ml-m-v"; v.textContent = f[1];
      tile.appendChild(k); tile.appendChild(v); meta.appendChild(tile);
    });
    part("[data-ml-dialog-capbox]").hidden = !caption;
    part("[data-ml-dialog-cap]").textContent = caption;
    var copy = part("[data-ml-dialog-copy]");
    copy.hidden = !caption;
    copy.setAttribute("data-caption", caption);
    copy.removeAttribute("data-state");
    var dl = part("[data-ml-dialog-dl]");
    var href = link.getAttribute("data-download") || "";
    dl.hidden = !href;
    if (href) dl.setAttribute("href", href);
    part("[data-ml-dialog-dl-t]").textContent = "Download original" + (size ? " (" + size + ")" : "");
    dialog.showModal();
    dialog._from = link;
    return true;
  }
  function closePreview() { if (dialog && dialog.open) dialog.close(); }
  if (dialog) {
    dialog.querySelector("[data-ml-dialog-close]").addEventListener("click", closePreview);
    /* A click on the dimmed area is a click on the dialog element itself: its content fills the whole box. */
    dialog.addEventListener("click", function (e) { if (e.target === dialog) closePreview(); });
    dialog.addEventListener("close", function () {
      dialog.querySelector("[data-ml-stage]").textContent = "";
      if (dialog._from && dialog._from.focus) dialog._from.focus();
    });
  }

  /* ---- the next batch, in place ----
     With IntersectionObserver the next 12 cards load by themselves when the end of the grid comes within 600px of the screen
     (the "Load 12 more" link is then hidden by css: .ml-auto). Without it the link stays and loads in place on a click. A failed
     read shows a Retry button instead of leaving the page. */
  var slot = page.querySelector("[data-ml-more-slot]");
  var grid = page.querySelector("[data-ml-grid]");
  var busy = false;
  var sentinel = null;
  var status = null;
  var observer = null;
  function nextLink() { return slot ? slot.querySelector("[data-ml-more]") : null; }
  function setStatus(kind) {
    if (!status) return;
    status.textContent = "";
    if (kind === "loading") {
      var spin = document.createElement("span");
      spin.className = "ml-spin";
      spin.setAttribute("aria-hidden", "true");
      var t = document.createElement("span");
      t.textContent = "Loading more media\u2026";
      status.appendChild(spin); status.appendChild(t);
    } else if (kind === "error") {
      var m = document.createElement("span");
      m.textContent = "More media could not be loaded.";
      var b = document.createElement("button");
      b.type = "button"; b.className = "ml-retry"; b.setAttribute("data-ml-retry", "");
      b.textContent = "Try again";
      status.appendChild(m); status.appendChild(b);
    }
  }
  function stop() {
    if (observer) { observer.disconnect(); observer = null; }
    if (sentinel && sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);
    sentinel = null;
  }
  function watch() {
    if (!observer || !sentinel) return;
    if (!nextLink()) { stop(); return; }
    observer.unobserve(sentinel); observer.observe(sentinel); /* observe again: a tall screen may still show the end */
  }
  function more(link) {
    if (busy) return true;
    var url = new URL(link.getAttribute("href"), location.href);
    url.searchParams.delete("shown");
    url.searchParams.set("fragment", "1");
    url.searchParams.set("offset", link.getAttribute("data-next") || "0");
    if (url.origin !== location.origin || !grid || !slot) return false;
    busy = true;
    link.setAttribute("aria-busy", "true");
    setStatus("loading");
    fetch(url.pathname + url.search, { credentials: "same-origin", headers: { Accept: "text/html" } })
      .then(function (r) { if (!r.ok) throw new Error("status"); return r.text(); })
      .then(function (text) {
        var doc = new DOMParser().parseFromString(text, "text/html");
        var frag = doc.querySelector("[data-ml-frag]");
        if (!frag) throw new Error("shape");
        frag.querySelectorAll(".ml-card").forEach(function (c) {
          var card = document.importNode(c, true);
          card.classList.add("ml-card-in");
          grid.appendChild(card);
        });
        var next = frag.querySelector("[data-ml-more]");
        slot.textContent = "";
        if (next) slot.appendChild(document.importNode(next.parentNode, true));
        busy = false;
        setStatus("");
        say(next ? "More media loaded." : "All media loaded.");
        watch();
      })
      .catch(function () {
        busy = false;
        link.removeAttribute("aria-busy");
        setStatus("error");
      });
    return true;
  }
  if (grid && slot && "IntersectionObserver" in window && nextLink()) {
    page.classList.add("ml-auto");
    sentinel = document.createElement("div");
    sentinel.className = "ml-sentinel";
    sentinel.setAttribute("aria-hidden", "true");
    status = document.createElement("div");
    status.className = "ml-status";
    status.setAttribute("aria-live", "polite");
    slot.parentNode.insertBefore(sentinel, slot);
    slot.parentNode.insertBefore(status, slot);
    observer = new IntersectionObserver(function (entries) {
      var hit = entries.some(function (e) { return e.isIntersecting; });
      var link = nextLink();
      if (hit && link && !busy) more(link); else if (!link) stop();
    }, { rootMargin: "0px 0px 600px 0px", threshold: 0 });
    observer.observe(sentinel);
  }

  page.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    var el;
    if (!t) return;
    if ((el = t.closest("[data-ml-copy], [data-ml-dialog-copy]"))) {
      e.preventDefault();
      copyText(el.getAttribute("data-caption") || "").then(function () { copied(el, true); }, function () { copied(el, false); });
    } else if ((el = t.closest("[data-ml-open]"))) {
      if (preview(el)) e.preventDefault();
    } else if ((el = t.closest("[data-ml-retry]"))) {
      var again = nextLink();
      if (again) more(again);
    } else if ((el = t.closest("[data-ml-more]"))) {
      if (more(el)) e.preventDefault();
    }
  });
})();
