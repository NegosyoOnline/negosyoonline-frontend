/* Payments page (/settings/payments/, Coach Ed 2026-10-30): the owner chooses which payment methods buyers see at
   checkout and sets each one up. Reads GET /sites/ and GET /sites/{id}/payment-methods/; writes PATCH (on/off),
   POST/DELETE .../accounts/ (bank and e-wallet accounts, optional QR image) and PUT/DELETE .../xendit/ (secret key and
   webhook token, write-only). Every status comes from the API: a method shows at checkout only while it is on AND set
   up (`available`). API strings reach the page through textContent or D.el only. Secrets are never kept or shown.

   The Xendit section is hidden (Coach Ed 2026-11-11, ClickUp z8uq9me4hq: bank transfer is the payment method for
   launch until a payment gateway is approved). While XENDIT_SECTION_ENABLED is false the page draws no Xendit row or
   card, sends nothing to .../xendit/ and does not read the `xendit` block, which the API may leave out. */
(function () {
  var D = window.NODash;
  /* Off = the Xendit row, card, key form and webhook block are not drawn. Set it to true to bring them back. */
  var XENDIT_SECTION_ENABLED = false;
  var token = 0, site = null, data = null, closeDialog = null;

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(text) { var l = byId("pm-live"); if (l) l.textContent = text; }
  function msg(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function base() { return "/sites/" + site + "/payment-methods/"; }
  function btn(label, kind, fn) {
    var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost") + (kind === "danger" ? " pm-danger" : ""), label);
    b.setAttribute("type", "button");
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function busy(b, on) { if (!b) return; if (on) { b.setAttribute("aria-busy", "true"); b.disabled = true; } else { b.removeAttribute("aria-busy"); b.disabled = false; } }
  /* chip = [colour, text]: the card's status, top right. */
  function card(id, title, lead, chip) {
    var s = h("section", "pm-card"); s.setAttribute("aria-labelledby", "pm-h-" + id);
    var t = h("h2", "pm-h2", title); t.setAttribute("id", "pm-h-" + id);
    add(s, add(h("div", "pm-head"), t, chip ? h("span", "chip chip-" + chip[0], chip[1]) : null), lead ? h("p", "pm-lead", lead) : null);
    return s;
  }

  /* A form in a popup (Coach Ed 2026-10-30), the same pattern as Billing's forms: focus stays inside, Escape closes,
     Cancel returns focus to the button that opened it. Field errors show inside and the popup stays open. */
  function dialog(id, titleText, opener, fill) {
    if (closeDialog) closeDialog(false);
    var slot = byId("pm-dialog-slot"), overlay = h("div", "pm-overlay"), dlg = h("div", "pm-dialog"), title = h("h2", "pm-h2", titleText);
    title.setAttribute("id", "pm-h-" + id);
    dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "pm-h-" + id);
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(true); return; }
      if (e.key !== "Tab") return;
      var items = Array.prototype.filter.call(dlg.querySelectorAll("input, select, button"), function (n) { return !n.disabled && n.tabIndex >= 0 && n.offsetParent !== null; });
      var first = items[0], last = items[items.length - 1], now = document.activeElement;
      if (e.shiftKey && (now === first || items.indexOf(now) < 0)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (now === last || items.indexOf(now) < 0)) { e.preventDefault(); first.focus(); }
    }
    function close(returnFocus) {
      if (closeDialog !== close) return;
      closeDialog = null; document.removeEventListener("keydown", onKey); clear(slot);
      if (returnFocus && opener && opener.focus) opener.focus();
    }
    closeDialog = close;
    add(dlg, title); fill(dlg, close);
    add(slot, add(overlay, dlg));
    document.addEventListener("keydown", onKey);
    dlg.querySelector("input, select").focus();
  }

  /* ---- load ---- */
  function show() { load(); }
  function hide() { token++; say(""); if (closeDialog) closeDialog(false); }
  function load() {
    var mine = ++token, root = clear(byId("pm-root"));
    root.setAttribute("aria-busy", "true");
    add(root, h("p", "pm-meta", "Loading your payment settings…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      if (!res.ok) { failedPanel(); return; }
      var sites = D.sitesOf(res);
      if (!sites.length) { noSite(); return; }
      site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      D.call("GET", base(), null, true).then(function (r) {
        if (mine !== token || r.status === 401) return;
        if (!r.ok) { failedPanel(); return; }
        data = r.data; render();
      });
    });
  }
  function failedPanel() {
    var root = clear(byId("pm-root")); root.removeAttribute("aria-busy");
    var s = card("err", "We couldn’t load your payment settings", "Check your connection and try again. Nothing was changed.");
    s.setAttribute("role", "alert"); add(s, btn("Try again", "ghost", load)); root.appendChild(s);
  }
  function noSite() {
    var root = clear(byId("pm-root")); root.removeAttribute("aria-busy");
    root.appendChild(card("nosite", "Payments are not available for this account yet", "There is no website on this account."));
  }

  /* ---- render ---- */
  function render() {
    var root = clear(byId("pm-root")); root.removeAttribute("aria-busy");
    add(root, methodsCard(), accountsCard(), XENDIT_SECTION_ENABLED ? xenditCard() : null);
  }

  /* One row per method: name, what it needs, status chip and the on/off switch. */
  function ready(name) { return name === "direct" ? data.accounts.length > 0 : data.xendit.configured && !data.xendit.key_failed; }
  function status(name) {
    if (data.available[name]) return ["ok", "Active"];
    if (name === "xendit" && data.xendit.key_failed) return ["warn", "The Xendit key stopped working"];
    if (!ready(name)) return ["warn", name === "direct" ? "No account added yet" : "No Xendit key saved yet"];
    return ["neutral", "Off"];
  }
  function methodRow(name, title, desc) {
    var row = h("div", "pm-method"), text = h("div", "pm-method-text"), id = "pm-sw-" + name, st = status(name);
    var sw = D.el("input", { type: "checkbox", role: "switch", id: id, "class": "pm-switch" });
    sw.checked = ready(name) && !!data.enabled[name]; sw.disabled = !ready(name); /* nothing to switch on until it is set up */
    var lab = h("label", "pm-method-name", title); lab.setAttribute("for", id);
    add(text, add(h("div", "pm-method-title"), lab, h("span", "chip chip-" + st[0], st[1])), h("p", "pm-meta", desc));
    sw.addEventListener("change", function () {
      var body = {}; body[name + "_enabled"] = sw.checked; sw.disabled = true;
      D.call("PATCH", base(), body, true).then(function (res) {
        if (res.status === 401) return;
        sw.disabled = false;
        if (!res.ok) { sw.checked = !sw.checked; D.toast("That did not work", msg(res, "We could not save the change. Please try again."), "error"); return; }
        data = res.data; refreshMethods();
        say(title + (sw.checked ? " is on." : " is off."));
      });
    });
    return add(row, text, sw);
  }
  function methodsCard() {
    var s = card("methods", "Payment methods at checkout");
    s.setAttribute("id", "pm-methods");
    add(s, methodRow("direct", "Bank or e-wallet transfer", "Buyers send the amount to one of your accounts and upload their proof. You verify each payment."),
      XENDIT_SECTION_ENABLED ? methodRow("xendit", "Pay Online with Xendit", "Buyers pay on Xendit’s secure page. Needs your own Xendit account.") : null);
    if (!data.available.direct && !(XENDIT_SECTION_ENABLED && data.available.xendit)) add(s, h("p", "pm-warn", "No payment method is showing, so buyers cannot check out."));
    return s;
  }
  function refreshMethods() { var old = byId("pm-methods"); if (old) old.parentNode.replaceChild(methodsCard(), old); }

  /* ---- bank and e-wallet accounts ---- */
  function field(id, label, input, hint) {
    var w = h("div", "pm-field"), lab = h("label", "pm-label", label), err = h("p", "pm-error"); lab.setAttribute("for", id);
    input.setAttribute("id", id); err.setAttribute("id", id + "-err"); err.hidden = true;
    var tip = hint ? h("p", "pm-hint", hint) : null;
    if (tip) { tip.setAttribute("id", id + "-hint"); input.setAttribute("data-hint", id + "-hint"); input.setAttribute("aria-describedby", id + "-hint"); }
    return add(w, lab, input, tip, err);
  }
  /* A field's error: shown next to it, named by aria-invalid and aria-describedby (its hint stays in the list). */
  function markBad(input, err, text) {
    err.textContent = text; err.hidden = false;
    input.classList.add("pm-invalid"); input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", (input.getAttribute("data-hint") ? input.getAttribute("data-hint") + " " : "") + err.id);
  }
  function markOk(input, err) {
    if (err) { err.hidden = true; err.textContent = ""; }
    input.classList.remove("pm-invalid"); input.removeAttribute("aria-invalid");
    if (input.getAttribute("data-hint")) input.setAttribute("aria-describedby", input.getAttribute("data-hint")); else input.removeAttribute("aria-describedby");
  }
  /* The house dropdown (the shared twc-select) on the dash: same box, panel below it and typing filter, in dash colours
     and textContent only. The native select stays the source of truth, so the form code reads it unchanged. */
  function combo(select, label) {
    var wrap = h("div", "pm-combo"), box = h("div", "pm-combo-box"), panel = h("div", "pm-combo-panel"), rows = [], active = -1;
    var input = D.el("input", { "class": "pm-combo-input", type: "text", role: "combobox", autocomplete: "off", spellcheck: "false", placeholder: select.options[0].textContent, "aria-label": label, "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": select.id + "-list", "aria-describedby": select.id + "-err" });
    panel.setAttribute("id", select.id + "-list"); panel.setAttribute("role", "listbox");
    select.parentNode.insertBefore(wrap, select);
    select.classList.add("pm-combo-native"); select.setAttribute("tabindex", "-1"); select.setAttribute("aria-hidden", "true");
    add(wrap, select, add(box, input, h("span", "pm-combo-caret")), panel);
    function chosen() { var o = select.options[select.selectedIndex]; return o && o.value ? o.textContent : ""; }
    function isOpen() { return wrap.classList.contains("is-open"); }
    function mark(i) {
      active = i;
      rows.forEach(function (r, n) { r.classList.toggle("is-active", n === i); });
      if (i >= 0) input.setAttribute("aria-activedescendant", rows[i].id); else input.removeAttribute("aria-activedescendant");
    }
    function draw(q) {
      clear(panel); rows = [];
      Array.prototype.forEach.call(select.options, function (o) {
        if (!o.value || (q && o.textContent.toLowerCase().indexOf(q) < 0)) return;
        var row = h("div", "pm-combo-opt" + (o.selected ? " is-selected" : ""), o.textContent);
        row.setAttribute("id", select.id + "-opt-" + rows.length); row.setAttribute("role", "option"); row.setAttribute("aria-selected", String(o.selected));
        row.addEventListener("click", function () { select.value = o.value; select.dispatchEvent(new Event("change", { bubbles: true })); shut(); });
        rows.push(row); panel.appendChild(row);
      });
      if (!rows.length) panel.appendChild(h("div", "pm-combo-opt is-disabled", "No matches"));
      mark(-1);
    }
    /* Fixed, so the popup's scrolling cannot clip it; opens upward only when there is no room below. */
    function place() {
      var r = box.getBoundingClientRect(), below = window.innerHeight - r.bottom, up = below < 160 && r.top > below;
      panel.style.left = r.left + "px"; panel.style.width = r.width + "px";
      panel.style.maxHeight = Math.max(120, Math.min(320, (up ? r.top : below) - 16)) + "px";
      panel.style.top = up ? "auto" : (r.bottom + 6) + "px";
      panel.style.bottom = up ? (window.innerHeight - r.top + 6) + "px" : "auto";
    }
    function onScroll(e) { if (!panel.contains(e.target)) shut(); }
    function onDoc(e) { if (!wrap.contains(e.target)) shut(); }
    function show() {
      if (isOpen()) return;
      wrap.classList.add("is-open"); input.setAttribute("aria-expanded", "true");
      draw(""); place();
      window.addEventListener("resize", place); document.addEventListener("scroll", onScroll, true); document.addEventListener("click", onDoc);
    }
    function shut() {
      wrap.classList.remove("is-open"); input.setAttribute("aria-expanded", "false"); input.value = chosen(); mark(-1);
      window.removeEventListener("resize", place); document.removeEventListener("scroll", onScroll, true); document.removeEventListener("click", onDoc);
    }
    box.addEventListener("click", function () { show(); input.focus(); });
    select.addEventListener("focus", function () { input.focus(); }); /* a label click or a server error lands on the native select */
    select.addEventListener("change", function () { input.value = chosen(); });
    input.addEventListener("focus", function () { input.select(); });
    input.addEventListener("input", function () { show(); draw(input.value.trim().toLowerCase()); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Tab") { shut(); return; }
      if (e.key === "Escape" && isOpen()) { e.preventDefault(); e.stopPropagation(); shut(); return; } /* the popup stays open */
      if (e.key === "Enter") { e.preventDefault(); if (active >= 0) rows[active].click(); else show(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      if (!isOpen()) { show(); return; }
      var d = e.key === "ArrowDown" ? 1 : -1, n = rows.length;
      if (n) mark(active < 0 ? (d > 0 ? 0 : n - 1) : (active + d + n) % n);
    });
    input.value = chosen();
  }
  /* Shows each field's message and puts focus on the first invalid field in the form's own order, not the order the
     server listed them. Returns false when no field was named (the caller then shows a toast and restores focus). */
  function showErrors(form, fields) {
    Array.prototype.forEach.call(form.querySelectorAll(".pm-error"), function (p) { p.hidden = true; p.textContent = ""; });
    Array.prototype.forEach.call(form.querySelectorAll(".pm-input"), function (i) { markOk(i, null); });
    var any = false;
    Object.keys(fields || {}).forEach(function (k) {
      var input = form.querySelector("[name='" + k + "']"), err = input && byId(input.id + "-err");
      if (!input || !err) return;
      markBad(input, err, String(fields[k])); any = true;
    });
    if (!any) return false;
    var order = Array.prototype.slice.call(form.querySelectorAll("input, select"));
    var first = order.filter(function (i) { return i.getAttribute("aria-invalid") === "true"; })[0];
    if (first) first.focus();
    return true;
  }
  /* The account number rule of the API (apps/payments/services.py NUMBER_RE): digits, spaces and hyphens, 1 to 40
     characters, at least one digit. A letter gets its own message; the API's "Enter the account number." covers the rest. */
  function numberError(v) {
    v = v.trim();
    if (/[^0-9 -]/.test(v)) return "Use digits only. Spaces and hyphens are fine.";
    if (!/\d/.test(v)) return "Enter the account number.";
    return "";
  }
  function accountsCard() {
    var n = data.accounts.length, st = n ? ["ok", n === 1 ? "1 account added" : n + " accounts added"] : ["danger", "No account added yet"];
    var s = card("accounts", "Bank and e-wallet accounts", "Add the accounts where buyers send their payment. Buyers who choose transfer see these accounts in full at checkout, then upload their proof for you to verify.", st);
    if (XENDIT_SECTION_ENABLED) s.classList.add("pm-half"); /* half width beside the Xendit card; full width while it is hidden */
    var list = h("ul", "pm-list");
    data.accounts.forEach(function (a) {
      var li = h("li", "pm-acct"), info = h("div", "pm-acct-text");
      var typeLabel = { savings: "Savings", checking: "Checking" }[a.account_type];  /* a legacy bank row has none yet: shows plain "Bank" */
      add(info, h("strong", "", a.provider_name + " · " + (a.kind === "ewallet" ? "E-wallet" : "Bank" + (typeLabel ? " (" + typeLabel + ")" : ""))),
        h("span", "pm-meta", a.account_name + " · ending " + a.account_number_last4 + (a.has_qr ? " · QR code added" : "")));
      add(li, info, add(h("div", "pm-acct-actions"), btn("Change", "ghost", function (b) { openAccount(b, a); }), btn("Remove", "danger", function (b) { removeAccount(a, b); })));
      list.appendChild(li);
    });
    if (data.accounts.length) s.appendChild(list);
    return add(s, add(h("div", "pm-actions"), btn("Add account", "primary", openAccount)));
  }
  /* The QR image is cropped to a square before it is sent (Coach Ed 2026-10-31), with the house cropper (Cropper.js,
     aspect ratio 1, view mode 2) so only the code is kept. The cropped PNG replaces the chosen file; Cancel clears it. A
     browser that cannot build the replacement file sends the original as chosen. */
  /* What the API accepts for the QR (apps/payments/services.py QR_MAX and QR_ERRORS, apps/common/private_files.py
     IMAGE_TYPES and sniff): JPEG, PNG or WebP, up to 2 MB, and the file's first bytes must say so too. */
  var QR_MAX = 2 * 1024 * 1024, QR_TYPES = ["image/jpeg", "image/png", "image/webp"];
  var QR_WRONG_TYPE = "Upload a JPEG, PNG or WebP image.", QR_TOO_BIG = "The file is too large. The limit is 2 MB.";
  var QR_UNREADABLE = "That image could not be read. Choose a different JPEG, PNG or WebP image.";
  function sniffImage(b) {
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
    return "";
  }
  function cropQr(input, form, box) {
    var cropper = null, url = "", pick = 0, err = null;
    function leave() {
      if (cropper) { cropper.destroy(); cropper = null; }
      if (url) { URL.revokeObjectURL(url); url = ""; }
      clear(box); box.hidden = true; form.removeAttribute("data-cropping");
      Array.prototype.forEach.call(form.children, function (n) { if (n !== box) n.hidden = false; });
    }
    function swap(blob, name) {
      try { var dt = new DataTransfer(); dt.items.add(new File([blob], name, { type: blob.type })); input.files = dt.files; return true; }
      catch (e) { return false; }
    }
    /* The file is refused: say why next to the field, drop the file, keep focus on the file input. */
    function refuse(text) {
      leave(); input.value = "";
      markBad(input, err, text); input.focus();
    }
    function crop(file) {
      url = URL.createObjectURL(file);
      var img = h("img", "pm-crop-img"); img.setAttribute("alt", "The QR code image to crop");
      var use = btn("Use this area", "primary"), cancel = btn("Cancel", "ghost", function () { input.value = ""; leave(); input.focus(); });
      clear(box);
      add(box, h("p", "pm-crop-lead", "Drag the square over your QR code so only the code is kept."), add(h("div", "pm-crop-stage"), img),
        add(h("div", "pm-actions"), cancel, use));
      Array.prototype.forEach.call(form.children, function (n) { if (n !== box) n.hidden = true; });
      box.hidden = false; form.setAttribute("data-cropping", "1");
      img.addEventListener("load", function () {
        cropper = new window.Cropper(img, { aspectRatio: 1, viewMode: 2, autoCropArea: 0.8, background: false, responsive: true });
      });
      img.addEventListener("error", function () { refuse(QR_UNREADABLE); }); /* a corrupt file that passed the type check */
      img.setAttribute("src", url);
      use.addEventListener("click", function () {
        if (!cropper) return;
        busy(use, true);
        cropper.getCroppedCanvas({ maxWidth: 1000, maxHeight: 1000, fillColor: "#fff" }).toBlob(function (png) {
          function done(blob, ext) { if (blob) swap(blob, "qr." + ext); busy(use, false); leave(); }
          if (png && png.size <= QR_MAX) { done(png, "png"); return; }
          cropper.getCroppedCanvas({ maxWidth: 1000, maxHeight: 1000, fillColor: "#fff" }).toBlob(function (jpg) { done(jpg, "jpg"); }, "image/jpeg", 0.9);
        }, "image/png");
      });
      use.focus();
    }
    input.addEventListener("change", function () {
      var file = input.files && input.files[0], mine = ++pick;
      err = err || form.querySelector("#" + input.id + "-err");
      markOk(input, err);
      if (!file) return;
      var declared = String(file.type || "").split(";")[0].trim().toLowerCase();
      if (QR_TYPES.indexOf(declared) < 0) { refuse(QR_WRONG_TYPE); return; }
      if (file.size > QR_MAX) { refuse(QR_TOO_BIG); return; }
      function go() { if (mine === pick && window.Cropper && window.URL && URL.createObjectURL) crop(file); }
      if (!file.slice) { go(); return; }
      /* The API also reads the first bytes, so a renamed file is refused here, before the crop panel opens. */
      new Promise(function (ok, no) { var s = file.slice(0, 12); if (s.arrayBuffer) s.arrayBuffer().then(ok, no); else no(); }).then(function (buf) {
        if (mine !== pick) return;
        if (QR_TYPES.indexOf(sniffImage(new Uint8Array(buf))) < 0) { refuse(QR_WRONG_TYPE); return; }
        go();
      }, function () { go(); });
    });
  }
  function openAccount(opener, acct) {
    dialog("account", acct ? "Change account" : "Add an account", opener, function (dlg, close) { add(dlg, accountForm(close, acct)); });
  }
  /* acct = change that account: opens with its saved number filled in; a new QR (cropped like on Add) replaces the
     current one, and no new file keeps it. A change goes out as a multipart POST, the one form that carries the file. */
  function accountForm(close, acct) {
    var form = D.el("form", { "class": "pm-form", novalidate: "" }), kind = D.el("select", { "class": "pm-input", name: "kind" });
    [["", "Choose one"], ["bank", "Bank"], ["ewallet", "E-wallet"]].forEach(function (o) { kind.appendChild(D.el("option", { value: o[0] }, o[1])); });
    var atype = D.el("select", { "class": "pm-input", name: "account_type" });
    [["", "Choose one"], ["savings", "Savings"], ["checking", "Checking"]].forEach(function (o) { atype.appendChild(D.el("option", { value: o[0] }, o[1])); });
    var qr = D.el("input", { "class": "pm-input pm-file", type: "file", name: "qr", accept: "image/jpeg,image/png,image/webp" });
    var cropBox = h("div", "pm-crop"); cropBox.hidden = true;
    add(form, field("pm-kind", "Type", kind),
      field("pm-actype", "Account type", atype),
      field("pm-provider", "Bank or e-wallet name", D.el("input", { "class": "pm-input", type: "text", name: "provider_name", maxlength: "60", placeholder: "e.g. BDO, GCash" })),
      field("pm-acname", "Account name", D.el("input", { "class": "pm-input", type: "text", name: "account_name", maxlength: "120", autocomplete: "off" })),
      field("pm-acnum", "Account number", D.el("input", { "class": "pm-input", type: "text", name: "account_number", maxlength: "40", inputmode: "numeric", autocomplete: "off" })),
      field("pm-qr", acct && acct.has_qr ? "Replace QR code (optional)" : "QR code (optional)", qr,
        acct && acct.has_qr ? "A QR code is already added. Choose a new image only to replace it. A JPEG, PNG or WebP image." : "A JPEG, PNG or WebP image buyers can scan."));
    form.querySelector("#pm-qr-err").setAttribute("role", "alert"); /* spoken when the file is refused */
    if (acct) { kind.value = acct.kind; form.querySelector("[name='provider_name']").value = acct.provider_name; form.querySelector("[name='account_name']").value = acct.account_name; form.querySelector("[name='account_number']").value = acct.account_number || ""; }
    if (acct && acct.account_type !== "ewallet") atype.value = acct.account_type || "";  /* a legacy bank row opens on "Choose one": the owner must pick Savings or Checking */
    combo(kind, "Type");
    combo(atype, "Account type");
    /* Savings or Checking applies to a bank only; an e-wallet is its own type and the server sets it. */
    var atypeField = atype.closest(".pm-field");
    function syncType() { atypeField.style.display = kind.value === "bank" ? "" : "none"; }
    kind.addEventListener("change", syncType); syncType();
    cropQr(qr, form, cropBox);
    var submit = btn(acct ? "Save" : "Add account", "primary"); submit.setAttribute("type", "submit");
    add(form, add(h("div", "pm-actions"), btn("Cancel", "ghost", function () { close(true); }), submit), cropBox);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (submit.getAttribute("aria-busy") === "true") return;
      var numInput = form.querySelector("[name='account_number']"), bad = numberError(numInput.value);
      if (bad) { showErrors(form, { account_number: bad }); return; }
      var fd = new FormData();
      ["kind", "account_type", "provider_name", "account_name", "account_number"].forEach(function (k) { fd.append(k, k === "account_type" && kind.value !== "bank" ? "" : form.querySelector("[name='" + k + "']").value); });
      if (qr.files && qr.files[0]) fd.append("qr", qr.files[0]);
      busy(submit, true);
      D.send("POST", base() + "accounts/" + (acct ? acct.id + "/" : ""), fd).then(function (res) {
        if (res.status === 401) return;
        busy(submit, false);
        if (!res.ok) {
          /* The Save button was disabled while it was busy, so focus fell to the page: put it on the first invalid field, or back on Save. */
          if (!showErrors(form, res.data && res.data.fields)) { D.toast("That did not work", msg(res, "We could not add the account. Please try again."), "error"); submit.focus(); }
          return;
        }
        var done = acct ? "Account changed." : "Account added.";
        close(false); D.toast("Saved", done); say(done); reload();
      });
    });
    return form;
  }
  function removeAccount(a, b) {
    if (b.getAttribute("data-confirm") !== "true") { b.setAttribute("data-confirm", "true"); b.textContent = "Confirm remove"; return; }
    busy(b, true);
    D.call("DELETE", base() + "accounts/" + a.id + "/", null, true).then(function (res) {
      if (res.status === 401) return;
      busy(b, false);
      if (!res.ok) { D.toast("That did not work", msg(res, "We could not remove the account. Please try again."), "error"); return; }
      say("Account removed."); reload();
    });
  }

  /* ---- Xendit: reached only while XENDIT_SECTION_ENABLED is true ---- */
  // navigator.clipboard exists only on https or localhost, so plain http copies through a hidden textarea.
  function copyText(text, button, done) {
    if (navigator.clipboard) { navigator.clipboard.writeText(text).then(done); return; }
    var area = D.el("textarea", { readonly: "readonly", "aria-hidden": "true", style: "position:fixed;opacity:0" }, text);
    document.body.appendChild(area); area.select();
    var ok = document.execCommand("copy");
    document.body.removeChild(area); button.focus();
    if (ok) done();
  }

  function xenditCard() {
    var x = data.xendit;
    var st = !x.configured ? ["danger", "Not set up"] : x.key_failed ? ["danger", "Key stopped working"] : ["ok", x.key_mode === "live" ? "Live key saved" : "Test key saved"];
    var s = card("xendit", "Xendit", "Connect your own Xendit account so buyers can pay online. Payments go straight to your Xendit balance.", st);
    s.classList.add("pm-half");
    if (x.key_failed) add(s, h("p", "pm-warn", "Xendit no longer accepts the saved key, so buyers do not see Pay Online. Save a working key below."));
    if (x.webhook_url) {
      var hook = h("div", "pm-hook"), group = h("div", "pm-group"), code = h("code", "pm-code", x.webhook_url);
      code.setAttribute("title", x.webhook_url); group.appendChild(code);
      group.appendChild(btn("Copy", "ghost", function (b) { copyText(x.webhook_url, b, function () { b.textContent = "Copied"; say("Webhook URL copied."); }); }));
      var tip = "In your Xendit Dashboard, open Settings, then Webhooks, and paste this URL for invoice payments.", q = h("button", "bl-tip", "?");
      q.setAttribute("type", "button"); q.setAttribute("aria-label", "About the webhook URL: " + tip); q.setAttribute("data-tip", tip);
      add(hook, add(h("p", "pm-label", "Webhook URL"), q), group);
      s.appendChild(hook);
    }
    var actions = add(h("div", "pm-actions"), btn(x.configured ? "Change key" : "Add Xendit key", "primary", openKey));
    if (x.configured) actions.appendChild(btn("Remove key", "danger", removeKey));
    return add(s, actions);
  }
  function openKey(opener) {
    dialog("key", data.xendit.configured ? "Change your Xendit key" : "Add your Xendit key", opener, function (dlg, close) { add(dlg, keyForm(close)); });
  }
  /* new-password keeps browsers and password managers from filling a saved value in; Show lets the owner check it. */
  function secret(id, label, name, hint) {
    var input = D.el("input", { "class": "pm-input", type: "password", name: name, autocomplete: "new-password", spellcheck: "false", "data-1p-ignore": "", "data-lpignore": "true" });
    var w = field(id, label, input, hint), box = h("div", "pm-secret");
    w.insertBefore(box, input);
    var eye = h("button", "pm-eye"); eye.setAttribute("type", "button"); eye.setAttribute("aria-label", "Show " + label); eye.setAttribute("aria-pressed", "false");
    eye.appendChild(eyeIcon());
    eye.addEventListener("click", function () {
      var hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      eye.setAttribute("aria-pressed", String(hidden)); eye.setAttribute("aria-label", (hidden ? "Hide " : "Show ") + label);
    });
    add(box, input, eye);
    return w;
  }
  /* The eye; its slash shows only while the value is visible. */
  function eyeIcon() {
    var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    [["viewBox", "0 0 24 24"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "1.8"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"]].forEach(function (a) { svg.setAttribute(a[0], a[1]); });
    [["path", { d: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" }], ["circle", { cx: "12", cy: "12", r: "3" }], ["path", { d: "M4 4l16 16", "class": "pm-eye-off" }]].forEach(function (p) {
      var n = document.createElementNS(ns, p[0]);
      Object.keys(p[1]).forEach(function (k) { n.setAttribute(k, p[1][k]); });
      svg.appendChild(n);
    });
    return svg;
  }
  function keyForm(close) {
    var form = D.el("form", { "class": "pm-form", novalidate: "", autocomplete: "off" });
    add(form, secret("pm-key", "Secret API key", "api_key", "In Xendit Dashboard, go to Settings, API Keys and click Generate Secret Key. Set Money-in to Write and Money-out to Read. The key starts with xnd_production_ (or xnd_development_ on a test website), not xnd_public_."),
      secret("pm-token", "Webhook verification token", "webhook_token", "From Xendit Dashboard, Settings, Webhooks."));
    var save = btn("Save", "primary"); save.setAttribute("type", "submit");
    add(form, add(h("div", "pm-actions"), btn("Cancel", "ghost", function () { close(true); }), save),
      h("p", "pm-hint", "We check the key with Xendit before saving it. Saved keys are never shown again."));
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (save.getAttribute("aria-busy") === "true") return;
      var key = form.querySelector("[name='api_key']"), tok = form.querySelector("[name='webhook_token']");
      var missing = {};
      if (!key.value.trim()) missing.api_key = "Enter your Xendit secret key.";
      if (!tok.value.trim()) missing.webhook_token = "Enter the webhook verification token.";
      if (showErrors(form, missing)) return;
      busy(save, true);
      D.call("PUT", base() + "xendit/", { api_key: key.value.trim(), webhook_token: tok.value.trim() }, true).then(function (res) {
        if (res.status === 401) return;
        busy(save, false);
        key.value = ""; tok.value = ""; /* never kept in the page */
        if (!res.ok) { if (!showErrors(form, res.data && res.data.fields)) D.toast("That did not work", msg(res, "We could not save the key. Please try again."), "error"); return; }
        close(false); D.toast("Saved", "Xendit key saved."); say("Xendit key saved."); reload();
      });
    });
    return form;
  }
  function removeKey(b) {
    if (b.getAttribute("data-confirm") !== "true") { b.setAttribute("data-confirm", "true"); b.textContent = "Confirm remove key"; return; }
    busy(b, true);
    D.call("DELETE", base() + "xendit/", null, true).then(function (res) {
      if (res.status === 401) return;
      busy(b, false);
      if (!res.ok) { D.toast("That did not work", msg(res, "We could not remove the key. Please try again."), "error"); return; }
      var waiting = res.data && res.data.awaiting_xendit_orders;
      if (waiting) D.toast("Key removed", waiting + (waiting === 1 ? " order still waits" : " orders still wait") + " for a Xendit payment. Without a key they are not checked, and each one expires on its own when its payment window ends.", "info");
      say("Xendit key removed."); reload();
    });
  }
  function reload() {
    var mine = token;
    D.call("GET", base(), null, true).then(function (r) {
      if (mine !== token || r.status === 401) return;
      if (!r.ok) { failedPanel(); return; }
      data = r.data; render();
    });
  }

  window.NOPayments = { show: show, hide: hide };
})();
