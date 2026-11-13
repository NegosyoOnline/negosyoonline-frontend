/* Products (/products/, ClickUp z8uq9mek5w, CAT-1): the shared Santé catalog.
   The catalog owner's store lists, adds and edits products, uploads one image each and reads a product's history; every other
   Santé store sees the same list read-only. Reads and writes GET and POST /sites/{id}/catalog/products/, PATCH .../{product}/,
   POST and DELETE .../{product}/image/ and GET .../{product}/revisions/. The server decides who may write (can_edit), prices
   and conflicts; the browser only shows them. Money is whole centavos; the earnings rate (the members discount) is sent as
   fixed text such as "0.4000". Plain ES5; API strings reach the page through textContent or D.el only; no storage key.
   NOProducts.util holds the pure helpers (tests/products.test.mjs). */
(function () {
  var D = window.NODash;
  var token = 0;
  var CATEGORIES = [["barley", "Barley"], ["drinks", "Specialty Drinks"], ["essentials", "Essentials"], ["beauty", "Beauty"]];
  var PRODUCT_RE = /^prod_[0-9A-Za-z]+$/;
  var IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
  var IMAGE_MAX = 2 * 1024 * 1024;
  var S = null; /* the screen's state: site, can_edit, products, mode, editing, history */

  var MSG = {
    stale: "This product was changed since you loaded it.",
    readOnly: "Only the catalog owner site can change the shared catalog.",
    billingOnly: "Products can't be changed while your subscription is limited to Billing. Open Billing to continue your plan.",
    imageStore: "Product images can't be stored yet: the image store is not set up.",
    imageNotSaved: "The image could not be stored. Try again.",
    network: "We could not reach the server. Please check your connection and try again.",
    generic: "We couldn’t save. Check your connection and try again.",
    invalid: "Some values are missing or invalid. Check the fields marked below."
  };

  /* ---------- pure helpers ---------- */

  /* "1,400" or "450.50" in pesos to whole centavos, or null. At most two decimals; never a float. */
  function pesosToCentavos(text) {
    var t = String(text == null ? "" : text).replace(/[₱,\s]/g, "");
    var m = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(t);
    if (!m) return null;
    var c = parseInt(m[1], 10) * 100 + (m[2] ? parseInt((m[2] + "0").slice(0, 2), 10) : 0);
    return c > 0 ? c : null;
  }
  function pad(n, w) { var s = String(n); while (s.length < w) s = "0" + s; return s; }
  function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  /* 140000 -> "₱1,400.00" */
  function formatPeso(centavos) {
    if (typeof centavos !== "number" || centavos !== Math.floor(centavos) || centavos < 0) return "";
    return "₱" + group(Math.floor(centavos / 100)) + "." + pad(centavos % 100, 2);
  }
  /* 140000 -> "1400", 45050 -> "450.50": the value that goes back into the price field. */
  function centavosToField(centavos) {
    if (typeof centavos !== "number") return "";
    var w = Math.floor(centavos / 100), c = centavos % 100;
    return c ? w + "." + pad(c, 2) : String(w);
  }
  /* "40" -> "0.4000", "12.5" -> "0.1250"; null unless the percent is from 10 to 50 with at most two decimals. */
  function percentToRate(text) {
    var m = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(String(text == null ? "" : text).replace(/[%\s]/g, ""));
    if (!m) return null;
    var tt = parseInt(m[1], 10) * 100 + (m[2] ? parseInt((m[2] + "0").slice(0, 2), 10) : 0); /* hundredths of a percent */
    if (tt < 1000 || tt > 5000) return null;
    return "0." + pad(tt, 4);
  }
  /* "0.4000" -> "40", "0.1250" -> "12.5" */
  function rateToPercent(rate) {
    var m = /^(\d)\.(\d{1,4})$/.exec(String(rate == null ? "" : rate));
    if (!m) return "";
    var tt = parseInt(m[1], 10) * 10000 + parseInt((m[2] + "0000").slice(0, 4), 10);
    var whole = Math.floor(tt / 100), frac = tt % 100;
    return frac ? whole + "." + pad(frac, 2).replace(/0$/, "") : String(whole);
  }
  /* The members price, as the server computes it: SRP less (SRP x rate) rounded half up to the centavo. */
  function membersPrice(srpCentavos, rate) {
    var m = /^(\d)\.(\d{1,4})$/.exec(String(rate == null ? "" : rate));
    if (typeof srpCentavos !== "number" || !m) return null;
    var r = parseInt(m[1], 10) * 10000 + parseInt((m[2] + "0000").slice(0, 4), 10);
    return srpCentavos - Math.floor((srpCentavos * r + 5000) / 10000);
  }
  function categoryLabel(key) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i][0] === key) return CATEGORIES[i][1];
    return "";
  }
  /* The sentence and field messages for a failed call. kind tells the screen what else to offer. */
  function describeError(res) {
    var d = (res && res.data) || {}, code = d.code, status = res && res.status, fields = d.fields || {};
    if (status === 409 && code === "stale_revision") return { kind: "stale", message: MSG.stale, fields: {} };
    if (status === 409 && code === "code_taken") return { kind: "field", message: "", fields: { code: fields.code || "That product code is already in the catalog." } };
    if (status === 403 && code === "catalog_read_only") return { kind: "readonly", message: MSG.readOnly, fields: {} };
    if (status === 403 && code === "billing_only") return { kind: "billing", message: MSG.billingOnly, fields: {} };
    if (status === 503 && code === "image_store_not_configured") return { kind: "image", message: MSG.imageStore, fields: {} };
    if (status === 502 && code === "image_not_saved") return { kind: "image", message: MSG.imageNotSaved, fields: {} };
    if (status === 404) return { kind: "missing", message: "This product or store is no longer available.", fields: {} };
    var has = Object.keys(fields).length > 0;
    if (status === 400 || has) return { kind: "fields", message: typeof d.message === "string" && d.message ? d.message : MSG.invalid, fields: fields };
    return { kind: "other", message: typeof d.message === "string" && d.message ? d.message : MSG.generic, fields: {} };
  }
  var LABELS = { name: "Name", short_description: "Short description", long_description: "Long description", category: "Category",
    image_url: "Image", weight_kg: "Weight", srp_centavos: "Price (SRP)", earnings_rate: "Members rate", volume_slot: "Volume slot",
    shipping_qty: "Shipping quantity", length_cm: "Length", width_cm: "Width", height_cm: "Height", is_active: "Visibility" };
  var ORDER = ["name", "short_description", "long_description", "category", "image_url", "srp_centavos", "earnings_rate", "is_active",
    "weight_kg", "volume_slot", "shipping_qty", "length_cm", "width_cm", "height_cm"];
  /* What a revision changed against the one before it, as short phrases. No writer is named. */
  function changes(row, before) {
    if (!before) return ["Product added"];
    var out = [];
    ORDER.forEach(function (k) {
      if (row[k] === before[k]) return;
      var label = LABELS[k];
      if (k === "srp_centavos") out.push(label + " " + formatPeso(before[k]) + " to " + formatPeso(row[k]));
      else if (k === "earnings_rate") out.push(label + " " + rateToPercent(before[k]) + "% to " + rateToPercent(row[k]) + "%");
      else if (k === "is_active") out.push(row[k] ? "Shown in shops" : "Hidden from shops");
      else if (k === "category") out.push(label + " " + (categoryLabel(row[k]) || "none"));
      else out.push(label + " changed");
    });
    return out.length ? out : ["Saved with no changes"];
  }
  function stamp(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch (e) { return D.date(iso); }
  }
  function safeImage(url) { return typeof url === "string" && /^https?:\/\//.test(url) ? url : ""; }

  /* ---------- small DOM helpers ---------- */

  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function root() { return document.getElementById("pr-root"); }
  function pane() { return (S && S.innerRoot) || root(); }
  function say(text) { var n = document.getElementById("pr-live"); if (n) n.textContent = text; }
  function button(text, cls, onClick) {
    var b = D.el("button", { type: "button", "class": "no-btn " + cls }, text);
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }
  function failBox(text, retry) {
    var box = D.el("div", { "class": "pr-fail", role: "alert" });
    box.appendChild(h("p", "pr-error", text));
    if (retry) box.appendChild(button("Try again", "no-btn-ghost", retry));
    return box;
  }
  function productPath(p) { return "/sites/" + S.site + "/catalog/products/" + (p ? p.id + "/" : ""); }
  function findProduct(id) {
    for (var i = 0; i < S.products.length; i++) if (S.products[i].id === id) return S.products[i];
    return null;
  }
  function replaceProduct(p) {
    for (var i = 0; i < S.products.length; i++) if (S.products[i].id === p.id) { S.products[i] = p; return; }
    S.products.push(p);
  }

  /* ---------- list ---------- */

  function chip(text, cls) { return h("span", "chip " + cls, text); }

  function card(p) {
    var art = D.el("article", { "class": "pr-card" + (p.is_active ? "" : " pr-card-off") });
    var pic = h("div", "pr-pic"), src = safeImage(p.image_url);
    if (src) pic.appendChild(D.el("img", { src: src, alt: "", loading: "lazy" }));
    else pic.appendChild(h("span", "pr-pic-none", "No image"));
    art.appendChild(pic);
    var body = h("div", "pr-card-body");
    body.appendChild(h("h2", "pr-card-title", p.name));
    body.appendChild(h("p", "pr-code", p.code));
    var chips = h("p", "pr-chips");
    if (categoryLabel(p.category)) chips.appendChild(chip(categoryLabel(p.category), "chip-neutral"));
    chips.appendChild(chip(p.is_active ? "Active" : "Hidden", p.is_active ? "chip-ok" : "chip-neutral"));
    body.appendChild(chips);
    var money = h("dl", "pr-money");
    var a = h("div"); a.appendChild(h("dt", "", "SRP")); a.appendChild(h("dd", "", formatPeso(p.srp_centavos))); money.appendChild(a);
    var b = h("div"); b.appendChild(h("dt", "", "Members price")); b.appendChild(h("dd", "", formatPeso(p.unit_members_price_centavos))); money.appendChild(b);
    body.appendChild(money);
    if (S.canEdit) {
      var row = h("div", "pr-actions");
      var edit = button("Edit", "no-btn-ghost pr-edit", function () { openForm(p); });
      edit.setAttribute("aria-label", "Edit " + p.name);
      var hist = button("History", "no-btn-ghost pr-hist", function () { openHistory(p); });
      hist.setAttribute("aria-label", "History of " + p.name);
      row.appendChild(edit); row.appendChild(hist);
      body.appendChild(row);
    }
    art.appendChild(body);
    return art;
  }

  function listView() {
    S.mode = "list";
    var r = clear(pane());
    r.removeAttribute("aria-busy");
    var bar = h("div", "pr-bar");
    var count = S.products.length;
    bar.appendChild(h("p", "pr-count", count === 1 ? "1 product" : count + " products"));
    if (S.canEdit) bar.appendChild(button("Add product", "no-btn-primary pr-add", function () { openForm(null); }));
    r.appendChild(bar);
    if (!S.canEdit) r.appendChild(h("p", "pr-note", "Santé products are managed centrally, so this list is read-only for your store."));
    if (!count) {
      var empty = h("div", "pr-empty");
      empty.appendChild(h("p", "pr-empty-title", S.canEdit ? "Add your first product" : "No products yet"));
      empty.appendChild(h("p", "pr-meta", S.canEdit ? "Products you add here are shared with every Santé store." : "Products will show here once they are added."));
      r.appendChild(empty);
      return;
    }
    var grid = h("div", "pr-grid");
    S.products.forEach(function (p) { grid.appendChild(card(p)); });
    r.appendChild(grid);
  }

  function loadList(focusId) {
    var mine = ++token;
    var r = clear(pane());
    r.setAttribute("aria-busy", "true");
    r.appendChild(h("p", "pr-meta", "Loading products…"));
    D.call("GET", productPath(), null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      var d = res.data;
      if (!res.ok || !d || !Array.isArray(d.products)) {
        var e = describeError(res);
        r.removeAttribute("aria-busy");
        clear(r).appendChild(failBox(res.status === 404 ? "Products are not available for this store yet." : res.status === 403 && e.kind === "billing" ? e.message : "We couldn’t load your products. Try again.", function () { loadList(); }));
        return;
      }
      S.canEdit = d.can_edit === true;
      S.products = d.products;
      listView();
      if (focusId) { var f = r.querySelector(".pr-edit"); if (f && f.focus) f.focus(); }
    });
  }

  /* ---------- form ---------- */

  var SHIPPING = [["weight_kg", "Weight (kg)", "0.00"], ["volume_slot", "Volume slot", ""], ["shipping_qty", "Shipping quantity", ""],
    ["length_cm", "Length (cm)", ""], ["width_cm", "Width (cm)", ""], ["height_cm", "Height (cm)", ""]];

  function openForm(p) {
    S.mode = "form";
    S.editing = p;
    var mine = ++token;
    var r = clear(pane());
    r.removeAttribute("aria-busy");
    var fields = {}, errs = {};
    var f = D.el("form", { "class": "pr-form", novalidate: "" });

    var head = h("div", "pr-formhead");
    var back = button("Back to products", "no-btn-ghost", function () { token++; loadList(); });
    head.appendChild(back);
    var title = D.el("h2", { "class": "pr-formtitle", tabindex: "-1" }, p ? "Edit product" : "Add product");
    head.appendChild(title);
    f.appendChild(head);

    var top = D.el("div", { "class": "pr-topmsg", role: "alert" });
    top.hidden = true;
    f.appendChild(top);

    function row(name, label, control, hint) {
      var wrap = h("div", "pr-field");
      var lab = D.el("label", { "for": "pr-f-" + name }, label);
      wrap.appendChild(lab);
      control.setAttribute("id", "pr-f-" + name);
      fields[name] = control;
      wrap.appendChild(control);
      if (hint) { wrap.appendChild(h("p", "pr-hint", hint)); }
      var err = D.el("p", { "class": "pr-ferr", id: "pr-e-" + name });
      err.hidden = true;
      errs[name] = err;
      control.setAttribute("aria-describedby", "pr-e-" + name);
      wrap.appendChild(err);
      return wrap;
    }
    function input(type, value, extra) {
      var i = D.el("input", Object.assign({ type: type, "class": "pr-input", autocomplete: "off" }, extra || {}));
      i.value = value == null ? "" : value;
      return i;
    }

    var v = p || {};
    var code = input("text", v.code || "", { maxlength: "64" });
    if (p) { code.readOnly = true; code.setAttribute("aria-readonly", "true"); }
    f.appendChild(row("code", "Product code", code, p ? "The code can't be changed." : "Letters, digits, dots, hyphens or underscores. It is made upper-case."));
    f.appendChild(row("name", "Name", input("text", v.name || "", { maxlength: "120" })));
    var cat = D.el("select", { "class": "pr-input" });
    cat.appendChild(D.el("option", { value: "" }, "No category"));
    CATEGORIES.forEach(function (c) { cat.appendChild(D.el("option", { value: c[0] }, c[1])); });
    cat.value = v.category || "";
    f.appendChild(row("category", "Category", cat));
    var sd = D.el("textarea", { "class": "pr-input pr-area", rows: "3", maxlength: "500" }); sd.value = v.short_description || "";
    f.appendChild(row("short_description", "Short description", sd));
    var ld = D.el("textarea", { "class": "pr-input pr-area pr-area-long", rows: "8", maxlength: "20000" }); ld.value = v.long_description || "";
    f.appendChild(row("long_description", "Long description", ld));

    var price = h("div", "pr-pair");
    price.appendChild(row("srp_centavos", "SRP (₱)", input("text", p ? centavosToField(p.srp_centavos) : "", { inputmode: "decimal" })));
    price.appendChild(row("earnings_rate", "Members discount (%)", input("text", p ? rateToPercent(p.earnings_rate) : "40", { inputmode: "decimal" }), "Between 10 and 50."));
    f.appendChild(price);
    var preview = D.el("p", { "class": "pr-preview", "aria-live": "polite" });
    f.appendChild(preview);
    function refresh() {
      var c = pesosToCentavos(fields.srp_centavos.value), rate = percentToRate(fields.earnings_rate.value);
      var m = c != null && rate ? membersPrice(c, rate) : null;
      preview.textContent = m != null ? "Members price " + formatPeso(m) : "Members price shows once the SRP and discount are valid.";
    }
    fields.srp_centavos.addEventListener("input", refresh);
    fields.earnings_rate.addEventListener("input", refresh);
    refresh();

    var show = D.el("input", { type: "checkbox", id: "pr-f-is_active" });
    show.checked = p ? p.is_active === true : true;
    fields.is_active = show;
    var showRow = h("div", "pr-check");
    var showLab = D.el("label", { "for": "pr-f-is_active" });
    showLab.appendChild(show);
    showLab.appendChild(h("span", "", "Show in shops"));
    showRow.appendChild(showLab);
    showRow.appendChild(h("p", "pr-hint", "Turn this off for a product that is out of stock. A hidden product is neither listed nor orderable."));
    f.appendChild(showRow);

    var det = D.el("details", { "class": "pr-details" });
    det.appendChild(h("summary", "", "Shipping details"));
    var grid = h("div", "pr-dgrid");
    SHIPPING.forEach(function (s) {
      var val = v[s[0]];
      grid.appendChild(row(s[0], s[1], input("text", val == null ? (s[0] === "weight_kg" && !p ? "0.00" : "") : String(val), { inputmode: "decimal" })));
    });
    det.appendChild(grid);
    det.appendChild(h("p", "pr-hint", "Optional for launch. Length, width and height go together."));
    f.appendChild(det);

    var imgBlock = h("fieldset", "pr-image");
    imgBlock.appendChild(h("legend", "", "Image"));
    var imgBody = h("div", "pr-image-body");
    imgBlock.appendChild(imgBody);
    var imgErr = D.el("p", { "class": "pr-ferr", id: "pr-e-image", role: "alert" });
    imgErr.hidden = true;
    imgBlock.appendChild(imgErr);
    f.appendChild(imgBlock);

    var actions = h("div", "pr-actions pr-formactions");
    var save = D.el("button", { type: "submit", "class": "no-btn no-btn-primary" }, p ? "Save changes" : "Add product");
    actions.appendChild(save);
    actions.appendChild(button("Cancel", "no-btn-ghost", function () { token++; loadList(); }));
    f.appendChild(actions);
    r.appendChild(f);

    function fieldError(name, text) {
      var e = errs[name], c = fields[name];
      if (!e) return;
      e.textContent = text || ""; e.hidden = !text;
      if (c) { if (text) c.setAttribute("aria-invalid", "true"); else c.removeAttribute("aria-invalid"); }
    }
    function clearErrors() {
      Object.keys(errs).forEach(function (k) { fieldError(k, ""); });
      top.hidden = true; clear(top);
      imgErr.hidden = true; imgErr.textContent = "";
    }
    function topMessage(text, reload) {
      clear(top); top.hidden = !text;
      if (!text) return;
      top.appendChild(h("p", "pr-error", text));
      if (reload) top.appendChild(button("Reload", "no-btn-ghost", reloadProduct));
      say(text);
    }
    function busy(on) {
      save.disabled = on;
      save.textContent = on ? "Saving…" : (S.editing ? "Save changes" : "Add product");
      if (on) f.setAttribute("aria-busy", "true"); else f.removeAttribute("aria-busy");
    }
    /* Fresh values for this product from the server: the one reaction to a stale revision. */
    function reloadProduct() {
      var id = S.editing && S.editing.id;
      D.call("GET", productPath(), null, true).then(function (res) {
        if (mine !== token || res.status === 401) return;
        if (!res.ok || !res.data || !Array.isArray(res.data.products)) { topMessage("We couldn’t reload the product. Try again.", true); return; }
        S.canEdit = res.data.can_edit === true; S.products = res.data.products;
        var fresh = findProduct(id);
        if (fresh) openForm(fresh); else loadList();
      });
    }
    function applyFailure(res) {
      var e = describeError(res);
      if (e.kind === "image") { imgErr.textContent = e.message; imgErr.hidden = false; say(e.message); return; }
      var shown = false;
      Object.keys(e.fields).forEach(function (k) {
        if (errs[k]) { fieldError(k, e.fields[k]); shown = true; }
        else if (k === "file" || k === "revision") { imgErr.textContent = e.fields[k]; imgErr.hidden = false; shown = true; }
      });
      if (e.kind === "fields" && shown) { topMessage(MSG.invalid); var first = f.querySelector("[aria-invalid='true']"); if (first && first.focus) first.focus(); return; }
      topMessage(e.message, e.kind === "stale");
    }

    /* ----- image ----- */
    function drawImage() {
      clear(imgBody);
      var cur = S.editing;
      if (!cur) { imgBody.appendChild(h("p", "pr-hint", "Save the product first, then add its image.")); return; }
      var wrap = h("div", "pr-image-row"), pic = h("div", "pr-pic pr-pic-sm"), src = safeImage(cur.image_url);
      if (src) pic.appendChild(D.el("img", { src: src, alt: "Current image of " + cur.name }));
      else pic.appendChild(h("span", "pr-pic-none", "No image"));
      wrap.appendChild(pic);
      var side = h("div", "pr-image-side");
      var file = D.el("input", { type: "file", id: "pr-f-image", accept: IMAGE_TYPES.join(","), "class": "pr-file" });
      var pickBtn = button(src ? "Replace image" : "Upload image", "no-btn-ghost", function () { file.click(); });
      side.appendChild(pickBtn); side.appendChild(file);
      if (src) side.appendChild(button("Remove image", "no-btn-ghost", removeImage));
      side.appendChild(h("p", "pr-hint", "JPEG, PNG or WebP, up to 2 MB."));
      wrap.appendChild(side);
      imgBody.appendChild(wrap);
      file.addEventListener("change", function () {
        var one = file.files && file.files[0];
        if (!one) return;
        imgErr.hidden = true;
        if (IMAGE_TYPES.indexOf(one.type) < 0) { imgErr.textContent = "Upload a JPEG, PNG or WebP image."; imgErr.hidden = false; file.value = ""; return; }
        if (one.size > IMAGE_MAX) { imgErr.textContent = "The image is too large. The limit is 2 MB."; imgErr.hidden = false; file.value = ""; return; }
        var form = new FormData();
        form.append("file", one);
        form.append("revision", String(S.editing.revision));
        imageCall("POST", productPath(S.editing) + "image/", form);
      });
    }
    function removeImage() { imageCall("DELETE", productPath(S.editing) + "image/?revision=" + encodeURIComponent(S.editing.revision), null); }
    function imageCall(method, path, form) {
      clearErrors();
      imgBody.setAttribute("aria-busy", "true");
      var req = form ? D.send(method, path, form) : D.call(method, path, null, true);
      req.then(function (res) {
        if (mine !== token || res.status === 401) return;
        imgBody.removeAttribute("aria-busy");
        if (res.ok && res.data && res.data.id) {
          S.editing = res.data; replaceProduct(res.data);
          drawImage(); say("Image saved."); D.toast("Saved", "The product image is updated.");
          return;
        }
        applyFailure(res); drawImage();
      });
    }
    drawImage();

    /* ----- submit ----- */
    function read(name) { return fields[name].value.trim(); }
    function gather() {
      var out = {}, bad = {};
      var name = read("name");
      if (!name) bad.name = "Enter a name."; else out.name = name;
      var c = pesosToCentavos(read("srp_centavos"));
      if (c == null) bad.srp_centavos = "Enter an SRP above ₱0, with up to two decimals."; else out.srp_centavos = c;
      var rate = percentToRate(read("earnings_rate"));
      if (!rate) bad.earnings_rate = "Enter a discount from 10 to 50."; else out.earnings_rate = rate;
      out.category = fields.category.value;
      out.short_description = fields.short_description.value.trim();
      out.long_description = fields.long_description.value.trim();
      out.is_active = fields.is_active.checked;
      SHIPPING.forEach(function (s) {
        var k = s[0], t = read(k);
        if (t === "") {
          if (p && p[k] != null) bad[k] = "Enter a value. A saved value can't be left blank.";
          else if (k === "weight_kg" && !p) out[k] = "0.00";
          return;
        }
        if (k === "shipping_qty") {
          if (!/^[1-9]\d{0,8}$/.test(t)) { bad[k] = "Enter a whole number of 1 or more."; return; }
          out[k] = parseInt(t, 10);
        } else out[k] = t;
      });
      return { out: out, bad: bad };
    }
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      clearErrors();
      var g = gather();
      if (!p) {
        var cd = read("code").toUpperCase();
        if (!cd) g.bad.code = "Enter a product code."; else g.out.code = cd;
      }
      var keys = Object.keys(g.bad);
      if (keys.length) {
        keys.forEach(function (k) { fieldError(k, g.bad[k]); });
        topMessage(MSG.invalid);
        var el = fields[keys[0]]; if (el && el.focus) el.focus();
        return;
      }
      busy(true);
      if (!p) createProduct(g.out); else updateProduct(g.out);
    });
    function done(product, msg) {
      busy(false);
      replaceProduct(product);
      D.toast("Saved", msg);
      token++;
      loadList(product.id);
    }
    function createProduct(out) {
      var wantActive = out.is_active;
      delete out.is_active; /* a new product is created active; hiding is a second step */
      D.call("POST", productPath(), out, true).then(function (res) {
        if (mine !== token || res.status === 401) return;
        if (!(res.ok && res.data && res.data.id)) { busy(false); applyFailure(res); return; }
        var created = res.data;
        if (wantActive) { done(created, "The product is added."); return; }
        D.call("PATCH", productPath(created), { revision: created.revision, is_active: false }, true).then(function (r2) {
          if (mine !== token || r2.status === 401) return;
          if (r2.ok && r2.data && r2.data.id) { done(r2.data, "The product is added and hidden."); return; }
          busy(false);
          S.products.push(created);
          S.editing = created; /* the product exists: carry on editing it instead of creating it twice */
          openForm(created);
          var again = document.getElementById("pr-f-is_active"); if (again) again.checked = false;
          var msg = describeError(r2).message;
          var t = pane().querySelector(".pr-topmsg");
          if (t) { t.hidden = false; clear(t); t.appendChild(h("p", "pr-error", "The product was added, but we couldn’t hide it. " + msg)); }
        });
      });
    }
    function updateProduct(out) {
      var body = { revision: p.revision }, n = 0;
      Object.keys(out).forEach(function (k) {
        var was = p[k];
        if (k === "shipping_qty") { if (was === out[k]) return; }
        else if (k === "is_active" || k === "srp_centavos") { if (was === out[k]) return; }
        else if (String(was == null ? "" : was) === String(out[k])) return;
        body[k] = out[k]; n++;
      });
      if (!n) { busy(false); topMessage("There are no changes to save."); return; }
      body.revision = S.editing.revision;
      D.call("PATCH", productPath(p), body, true).then(function (res) {
        if (mine !== token || res.status === 401) return;
        if (res.ok && res.data && res.data.id) { done(res.data, "Your changes are saved."); return; }
        busy(false); applyFailure(res);
      });
    }
    title.focus();
  }

  /* ---------- history ---------- */

  function openHistory(p) {
    S.mode = "history";
    var mine = ++token;
    var r = clear(pane());
    r.setAttribute("aria-busy", "true");
    var head = h("div", "pr-formhead");
    head.appendChild(button("Back to products", "no-btn-ghost", function () { token++; loadList(); }));
    var title = D.el("h2", { "class": "pr-formtitle", tabindex: "-1" }, "History of " + p.name);
    head.appendChild(title);
    r.appendChild(head);
    var body = h("div", "pr-hist");
    body.appendChild(h("p", "pr-meta", "Loading history…"));
    r.appendChild(body);
    title.focus();
    if (!PRODUCT_RE.test(p.id)) { clear(body).appendChild(failBox("We couldn’t load the history.")); r.removeAttribute("aria-busy"); return; }
    D.call("GET", productPath(p) + "revisions/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      r.removeAttribute("aria-busy");
      var rows = res.data && res.data.revisions;
      clear(body);
      if (!res.ok || !Array.isArray(rows)) { body.appendChild(failBox("We couldn’t load the history. Try again.", function () { openHistory(p); })); return; }
      var list = D.el("ol", { "class": "pr-histlist" });
      rows.forEach(function (rev, i) {
        var li = h("li", "pr-histitem");
        var top = h("p", "pr-histtop");
        top.appendChild(h("span", "pr-histwhen", stamp(rev.changed_at)));
        top.appendChild(chip(rev.source === "seed" ? "Seed" : "Owner", "chip-neutral"));
        li.appendChild(top);
        changes(rev, rows[i + 1]).forEach(function (c) { li.appendChild(h("p", "pr-histchange", c)); });
        list.appendChild(li);
      });
      body.appendChild(list);
    });
  }

  /* ---------- site choice ---------- */

  function start() {
    var mine = ++token;
    S = { site: null, canEdit: false, products: [], mode: "list", editing: null, innerRoot: null };
    var r = clear(root());
    r.setAttribute("aria-busy", "true");
    r.appendChild(h("p", "pr-meta", "Loading your stores…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      var sites = D.sitesOf(res).filter(function (s) { return s && s.template === "sante"; });
      if (!res.ok) { r.removeAttribute("aria-busy"); clear(r).appendChild(failBox("We couldn’t load your stores. Try again.", start)); return; }
      if (!sites.length) {
        r.removeAttribute("aria-busy");
        clear(r).appendChild(h("p", "pr-meta", "Products are available for Santé stores. Create your Santé store to see them here."));
        return;
      }
      var ids = sites.map(function (s) { return s.id; });
      S.site = D.siteFromQuery(ids);
      clear(r);
      if (sites.length > 1) {
        var wrap = h("div", "pr-pick"), lab = D.el("label", { "for": "pr-site", "class": "pr-pick-label" }, "Store");
        var sel = D.el("select", { id: "pr-site", "class": "pr-input" });
        sites.forEach(function (s) {
          var o = D.el("option", { value: String(s.id) }, s.display_name || s.subdomain || "Store");
          if (s.id === S.site) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener("change", function () {
          if (ids.indexOf(sel.value) < 0) return;
          S.site = sel.value;
          loadInto(inner);
        });
        wrap.appendChild(lab); wrap.appendChild(sel);
        r.appendChild(wrap);
      }
      var inner = h("div", "pr-inner");
      r.appendChild(inner);
      r.removeAttribute("aria-busy");
      loadInto(inner);
    });
  }
  /* The list is drawn into #pr-root by listView(); with several stores the chooser sits above and the root is the inner box. */
  function loadInto(inner) {
    S.innerRoot = inner;
    loadList();
  }

  window.NOProducts = {
    util: { pesosToCentavos: pesosToCentavos, formatPeso: formatPeso, centavosToField: centavosToField, percentToRate: percentToRate,
      rateToPercent: rateToPercent, membersPrice: membersPrice, describeError: describeError, changes: changes, categoryLabel: categoryLabel },
    show: function () { start(); },
    hide: function () { token++; say(""); }
  };
})();
