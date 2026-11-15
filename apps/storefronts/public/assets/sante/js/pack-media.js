/* The member Media Library (ClickUp z8uq9mezdk), this storefront's own file. Without it the page still works: the filters are a
   GET form and "Load 12 more" is a link. With it: filters apply on change, the phone drawer, Copy caption, the preview popup, and
   "Load 12 more" adds the next cards in place. It reads text from the page and puts it in with textContent and setAttribute only;
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
  function copied(button, ok) {
    var t = button.querySelector(".ml-act-t") || button;
    var was = button.getAttribute("data-label") || t.textContent;
    button.setAttribute("data-label", was);
    t.textContent = ok ? "Copied" : "Copy failed";
    say(ok ? "Caption copied." : "The caption could not be copied.");
    clearTimeout(timers[0]);
    timers[0] = setTimeout(function () { t.textContent = was; }, 1800);
  }

  /* ---- the preview popup ---- */
  function preview(link) {
    if (!dialog || typeof dialog.showModal !== "function") return false;
    var stage = dialog.querySelector("[data-ml-stage]");
    var kind = link.getAttribute("data-kind");
    var file = link.getAttribute("data-file") || "";
    var el;
    stage.textContent = "";
    if (kind === "video") {
      el = document.createElement("video");
      el.setAttribute("controls", "");
      el.setAttribute("playsinline", "");
      el.setAttribute("preload", "metadata");
      if (link.getAttribute("data-poster")) el.setAttribute("poster", link.getAttribute("data-poster"));
      el.setAttribute("src", file);
    } else {
      el = document.createElement("img");
      el.setAttribute("alt", link.getAttribute("data-title") || "");
      el.setAttribute("src", file);
    }
    stage.appendChild(el);
    dialog.querySelector("[data-ml-dialog-title]").textContent = link.getAttribute("data-title") || "";
    dialog.querySelector("[data-ml-dialog-cap]").textContent = link.getAttribute("data-caption") || "";
    dialog.showModal();
    dialog._from = link;
    return true;
  }
  function closePreview() { if (dialog && dialog.open) dialog.close(); }
  if (dialog) {
    dialog.querySelector("[data-ml-dialog-close]").addEventListener("click", closePreview);
    dialog.addEventListener("click", function (e) { if (e.target === dialog) closePreview(); });
    dialog.addEventListener("close", function () {
      dialog.querySelector("[data-ml-stage]").textContent = "";
      if (dialog._from && dialog._from.focus) dialog._from.focus();
    });
  }

  /* ---- Load 12 more, in place ---- */
  function more(link) {
    var slot = page.querySelector("[data-ml-more-slot]");
    var grid = page.querySelector("[data-ml-grid]");
    var url = new URL(link.getAttribute("href"), location.href);
    url.searchParams.delete("shown");
    url.searchParams.set("fragment", "1");
    url.searchParams.set("offset", link.getAttribute("data-next") || "0");
    if (url.origin !== location.origin || !grid || !slot) return false;
    link.setAttribute("aria-busy", "true");
    fetch(url.pathname + url.search, { credentials: "same-origin", headers: { Accept: "text/html" } })
      .then(function (r) { if (!r.ok) throw new Error("status"); return r.text(); })
      .then(function (text) {
        var doc = new DOMParser().parseFromString(text, "text/html");
        var frag = doc.querySelector("[data-ml-frag]");
        if (!frag) throw new Error("shape");
        frag.querySelectorAll(".ml-card").forEach(function (c) { grid.appendChild(document.importNode(c, true)); });
        var next = frag.querySelector("[data-ml-more]");
        slot.textContent = "";
        if (next) slot.appendChild(document.importNode(next.parentNode, true));
        say("More media loaded.");
      })
      .catch(function () { link.removeAttribute("aria-busy"); location.assign(link.getAttribute("href")); });
    return true;
  }

  page.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    var el;
    if (!t) return;
    if ((el = t.closest("[data-ml-copy]"))) {
      e.preventDefault();
      copyText(el.getAttribute("data-caption") || "").then(function () { copied(el, true); }, function () { copied(el, false); });
    } else if ((el = t.closest("[data-ml-open]"))) {
      if (preview(el)) e.preventDefault();
    } else if ((el = t.closest("[data-ml-more]"))) {
      if (more(el)) e.preventDefault();
    }
  });
})();
