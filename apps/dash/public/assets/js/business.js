/* Business Settings (NegosyoOnline Onboarding Phase 5, ClickUp z8uq9machb): the /settings/business/ page, which
   /settings/general/ still opens. One page for the selected Site: rows with a Public or Private tag, and Edit dialogs
   in the Account Settings pattern. Reads GET /sites/ and GET /sites/{id}/business-profile/; each dialog writes ONE
   PATCH, to /sites/{id}/ or to /sites/{id}/business-profile/, so a save is whole or not at all.
   Tenant safety: the site id comes only from GET /sites/ (D.siteFromQuery ignores any other ?site=); a dialog keeps
   the id it was opened for; every load has a sequence number and an answer for an older load is dropped; leaving
   the page or changing the site closes an open dialog; nothing is stored in the browser.
   No colour or logo control (owner ruling R3). Plain ES5. API strings reach the page through D.el, textContent or
   input.value only. */
(function () {
  var D = window.NODash, $ = function (id) { return document.getElementById(id); };
  var SUPPORT_EMAIL = "support@negosyoonline.com";
  var PUB = "Public", PRIV = "Private";
  /* [key, label, tag, input kind, note after the label in the dialog] */
  var LEGAL = [
    ["registered_name", "Registered business name", PUB, "", ""],
    ["dti_business_number", "DTI business name number", PUB, "", ""],
    ["bir_rsn", "BIR Official Control Number (OCN)", PUB, "", ""],
    ["tin", "TIN", PRIV, "", ""],
    ["privacy_contact_email", "Privacy contact email", PUB, "email", ""]
  ];
  var ESTIMATES = [
    ["shipping_processing_time", "Order processing", PUB, "", ""],
    ["shipping_metro_manila_estimate", "Metro Manila", PUB, "", ""],
    ["shipping_luzon_estimate", "Luzon outside Metro Manila", PUB, "", ""],
    ["shipping_visayas_estimate", "Visayas", PUB, "", ""],
    ["shipping_mindanao_estimate", "Mindanao", PUB, "", ""],
    ["shipping_other_areas_estimate", "Other serviceable areas", PUB, "", " (optional)"]
  ];
  /* The only rules the page adds: these four may not be sent blank. Every other message is the server's. */
  var REQUIRED = { business_name: "Enter your business name.", display_name: "Enter a site name.",
    contact_email: "Enter your store email.", contact_mobile: "Enter your store mobile." };
  var GONE = "This site is not available.";
  var SAVE_FAILED = "We couldn’t save. Check your connection and try again.";
  var S = { seq: 0, sites: [], site: null, profile: null, dlg: null, notice: "", sealUrl: "", sealMsg: "", sealBusy: false }; /* memory only, never stored */
  /* The BIR registration badge (Coach Ed, 2026-11-12): the owner uploads it here; the storefront footer shows it. The server
     owns every rule (owner only, type read from the bytes); the two checks below only save a round trip and use its words. */
  var SEAL_MAX = 2 * 1024 * 1024, SEAL_TYPES = ["image/jpeg", "image/png", "image/webp"];
  var SEAL_NONE = "Choose an image to upload.", SEAL_TYPE = "Upload a JPEG, PNG or WebP image.", SEAL_BIG = "The file is too large. The limit is 2 MB.";
  var SEAL_OWNER = "Only the account owner can change the badge.";

  /* ---- pure helpers (tested in tests/business.test.mjs) ---- */
  function str(v) { return typeof v === "string" ? v.trim() : ""; }
  /* The sites API sends a field's messages as a list; app.js may already have joined them. Either way: one string. */
  function fieldMessage(v) {
    if (Array.isArray(v)) v = v.length ? v[0] : "";
    return typeof v === "string" ? v : "";
  }
  function mobileShown(v) {
    var m = /^\+63(\d{3})(\d{3})(\d{4})$/.exec(str(v));
    return m ? "+63 " + m[1] + " " + m[2] + " " + m[3] : str(v);
  }
  function siteLabel(site) { return str(site && site.display_name) || str(site && site.subdomain); }
  function hostOf(site) { return str(site && site.host) || str(site && site.subdomain); }
  /* The read-only list on the page. It is worked out here from the two reads and switches nothing on or off. */
  function readiness(site, profile) {
    var s = site || {}, p = profile || {};
    var blank = LEGAL.filter(function (f) { return !str(p[f[0]]); }).length;
    var items = [
      { label: "Business name", done: !!str(p.business_name) },
      { label: "Site name", done: !!str(s.display_name) },
      { label: "Store email and mobile", done: !!(str(s.contact_email) && str(s.contact_mobile)) },
      { label: "Business address", done: !!str(p.business_address) },
      { label: "Legal page details", done: blank === 0, text: blank ? blank + " blank" : "Done" },
      { label: "Shipping Policy", done: p.shipping_estimates_confirmed === true, text: p.shipping_estimates_confirmed === true ? "Published" : "Not reviewed" }
    ];
    items.forEach(function (i) { if (!i.text) i.text = i.done ? "Done" : "Not added"; });
    return { items: items, left: items.filter(function (i) { return !i.done; }).length };
  }
  /* The message for a file the badge cannot take, or "" when it can be sent. */
  function sealProblem(file) {
    if (!file) return SEAL_NONE;
    if (SEAL_TYPES.indexOf(file.type) < 0) return SEAL_TYPE;
    if (file.size > SEAL_MAX) return SEAL_BIG;
    return "";
  }
  function fieldSpec(row, profile) { return { key: row[0], label: row[1] + row[4], tag: row[2], kind: row[3], value: profile[row[0]] }; }
  /* The seven dialogs: one endpoint each ("" is the site itself), and exactly the keys it sends. */
  function specs(site, profile) {
    var s = site || {}, p = profile || {};
    return {
      name: { title: "Edit business name", lead: "Customers see this name on your site.", path: "business-profile/",
        fields: [{ key: "business_name", label: "Business name", tag: PUB, value: p.business_name, hint: "The name customers know you by. Up to 160 characters." }] },
      site: { title: "Edit site name", lead: "Shown at the top of your site and in this dashboard.", path: "",
        fields: [{ key: "display_name", label: "Site name", tag: PUB, value: s.display_name, hint: "Up to 80 characters." }] },
      contact: { title: "Edit store email and mobile", lead: "Customers use these to reach you. They are not your sign-in email or mobile.", path: "",
        fields: [{ key: "contact_email", label: "Store email", tag: PUB, kind: "email", value: s.contact_email },
          { key: "contact_mobile", label: "Store mobile", tag: PUB, kind: "phone", value: s.contact_mobile }] },
      address: { title: "Edit business address", lead: "Customers see this address on your site.", path: "business-profile/",
        fields: [{ key: "business_address", label: "Business address", tag: PUB, value: p.business_address }] },
      social: { title: "Edit social links", lead: "Links to your social media pages. Leave a box blank to remove its link.", path: "",
        fields: [{ key: "facebook_url", label: "Facebook", tag: PUB, value: s.facebook_url, hint: "The full https link to your Facebook page." },
          { key: "instagram_url", label: "Instagram", tag: PUB, value: s.instagram_url, hint: "The full https link to your Instagram page." },
          { key: "tiktok_url", label: "TikTok", tag: PUB, value: s.tiktok_url, hint: "The full https link to your TikTok page." }] },
      legal: { title: "Edit legal page details", lead: "Printed on this site’s legal pages, except your TIN.", path: "business-profile/",
        fields: LEGAL.map(function (r) { return fieldSpec(r, p); }) },
      delivery: { title: "Edit delivery estimates", lead: "Change anything that does not match how you ship.", path: "business-profile/",
        fields: ESTIMATES.map(function (r) { var f = fieldSpec(r, p); f.tag = ""; return f; }),
        check: { key: "shipping_estimates_confirmed", label: "I reviewed these delivery estimates. Publish my Shipping Policy.", value: p.shipping_estimates_confirmed === true } }
    };
  }

  /* ---- small builders ---- */
  function txt(text) { return D.el("span", {}, text); }
  function chip(kind, text) { return D.el("span", { "class": "chip chip-" + kind }, text); }
  function tag(kind) { return D.el("span", { "class": "bs-tag " + (kind === PRIV ? "bs-tag-priv" : "bs-tag-pub") }, kind); }
  function say(text) { var n = $("bs-live"); if (n) n.textContent = text; }
  function editBtn(id, name, label) {
    var b = D.el("button", { type: "button", "class": "no-btn no-btn-ghost", id: id, "aria-label": label }, "Edit");
    b.addEventListener("click", function () { openEdit(b, name); });
    return b;
  }
  function card(id, title, sub, action) {
    var c = D.el("section", { "class": "dash-card acct-card", "aria-labelledby": id });
    var h = D.el("h2", { id: id, "class": "bs-card-h" });
    h.appendChild(txt(title));
    if (action) h.appendChild(action);
    c.appendChild(h);
    if (sub) c.appendChild(D.el("p", { "class": "dash-copy" }, sub));
    return c;
  }
  /* A row: label and its tag, the value, an optional action to its right, an optional help line under it. */
  function row(label, kind, values, action, help) {
    var r = D.el("div", { "class": "acct-set-row" }), l = D.el("div", { "class": "acct-set-label bs-label" });
    l.appendChild(txt(label));
    l.appendChild(tag(kind));
    r.appendChild(l);
    var v = D.el("div", { "class": "acct-set-value" });
    values.forEach(function (n) { v.appendChild(n); });
    r.appendChild(v);
    if (action) { var a = D.el("div", { "class": "acct-set-action" }); a.appendChild(action); r.appendChild(a); }
    if (help) r.appendChild(D.el("div", { "class": "bs-row-help" }, help));
    return r;
  }
  function value(v, shown) {
    var t = str(v);
    return t ? txt(shown || t) : D.el("span", { "class": "bs-none" }, "Not added");
  }

  /* ---- the reads and the page states ---- */
  function head(site, sites) {
    var line = $("bs-site-line"), pick = $("bs-pick");
    if (line) {
      line.textContent = "";
      line.hidden = !site;
      if (site) {
        line.appendChild(txt("Site:"));
        line.appendChild(D.el("strong", {}, siteLabel(site)));
        if (hostOf(site)) line.appendChild(D.el("span", { "class": "bs-host" }, hostOf(site)));
        if (str(site.template_label)) line.appendChild(chip("info", str(site.template_label)));
      }
    }
    if (!pick) return;
    pick.textContent = "";
    pick.hidden = !(site && sites && sites.length > 1);
    if (pick.hidden) return;
    /* More than one site (not in the MVP): the labelled select storefront-settings.js uses, until the shared switcher exists. */
    var sel = D.el("select", { id: "bs-site", "class": "bs-select" });
    sites.forEach(function (s) {
      var o = D.el("option", { value: s.id }, siteLabel(s));
      if (s.id === site.id) o.setAttribute("selected", "");
      sel.appendChild(o);
    });
    sel.value = site.id;
    sel.addEventListener("change", function () { choose(sel.value); });
    pick.appendChild(D.el("label", { "for": "bs-site" }, "Site"));
    pick.appendChild(sel);
  }
  /* Choosing a site puts ?site= in the address (the Settings tabs keep it), drops everything on screen and reads again. */
  function choose(id) {
    try { history.replaceState(null, "", location.pathname + "?site=" + encodeURIComponent(id)); } catch (e) { /* ignore */ }
    load(id);
  }
  function root() { return $("bs-root"); }
  function load(want, again) {
    var body = root();
    if (!body) return;
    var my = ++S.seq;
    closeDialog();
    santeReset();
    S.site = null; S.profile = null; S.sites = []; sealUrlDrop(); S.sealMsg = ""; /* nothing from the site shown before outlives a new read */
    head(null);
    skeleton(body);
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (my !== S.seq || res.status === 401) return; /* a newer read owns the page, or app.js is already signing out */
      if (!res.ok) { drawError(body); return; }
      var sites = D.sitesOf(res).filter(function (s) { return s && typeof s.id === "string"; });
      if (!sites.length) { drawNoSite(body); return; }
      var ids = sites.map(function (s) { return s.id; });
      var id = typeof want === "string" && ids.indexOf(want) >= 0 ? want : D.siteFromQuery(ids);
      D.call("GET", "/sites/" + id + "/business-profile/", null, true).then(function (r) {
        if (my !== S.seq || r.status === 401) return;
        if (r.status === 404) { if (again) drawGone(body); else gone(); return; }
        if (!r.ok || !r.data) { drawError(body); return; }
        S.sites = sites;
        S.site = sites[ids.indexOf(id)];
        S.profile = r.data;
        draw();
      });
    });
  }
  /* A site that answers 404 (removed, or not this account's): say only that, and read the list again, once. */
  function gone() {
    S.notice = GONE;
    say(GONE);
    load(null, true);
  }
  function skeleton(body) {
    body.textContent = "";
    var sk = D.el("div", { "class": "skel", "aria-busy": "true" });
    sk.appendChild(D.el("span", { "class": "sr-only" }, "Loading this site’s settings"));
    for (var i = 0; i < 3; i++) sk.appendChild(D.el("div", { "class": "skel-block acct-skel-card", "aria-hidden": "true" }));
    body.appendChild(sk);
  }
  function takeNotice(parent) {
    if (!S.notice) return;
    parent.appendChild(D.el("p", { "class": "err-box bs-notice", id: "bs-notice", role: "alert" }, S.notice));
    S.notice = "";
  }
  function drawError(body) {
    body.textContent = "";
    S.notice = "";
    var box = D.el("div", { "class": "err-box", role: "alert" });
    box.appendChild(D.el("h2", {}, "We could not load this site’s settings"));
    box.appendChild(D.el("p", {}, "Check your connection and try again. Nothing was changed."));
    var again = D.el("button", { type: "button", "class": "no-btn no-btn-primary" }, "Try again");
    again.addEventListener("click", function () { load(); });
    box.appendChild(again);
    body.appendChild(box);
  }
  function drawGone(body) {
    body.textContent = "";
    S.notice = "";
    var box = D.el("div", { "class": "err-box", role: "alert" });
    box.appendChild(D.el("h2", {}, GONE));
    var again = D.el("button", { type: "button", "class": "no-btn no-btn-primary" }, "Try again");
    again.addEventListener("click", function () { load(); });
    box.appendChild(again);
    body.appendChild(box);
  }
  function drawNoSite(body) {
    body.textContent = "";
    var wrap = D.el("div", { "class": "stack" });
    takeNotice(wrap);
    var c = D.el("section", { "class": "dash-card ph-card", "aria-labelledby": "bs-h-nosite" });
    c.appendChild(chip("neutral", "No site yet"));
    c.appendChild(D.el("h2", { id: "bs-h-nosite" }, "Create your site first"));
    c.appendChild(D.el("p", {}, "Business Settings opens once your first site is created. Finish the setup on Overview."));
    c.appendChild(D.el("a", { "class": "no-btn no-btn-ghost", href: "/" }, "Back to Overview"));
    wrap.appendChild(c);
    body.appendChild(wrap);
  }
  function draw(focusId) {
    var body = root(), site = S.site, profile = S.profile;
    if (!body || !site || !profile) return;
    head(site, S.sites);
    body.textContent = "";
    var wrap = D.el("div", { "class": "stack bs-page" }), grid = D.el("div", { "class": "acct-grid" });
    takeNotice(wrap);
    wrap.appendChild(legendLine());
    wrap.appendChild(readyCard(site, profile));
    /* Reading order is the DOM order, so the stacked phone page and the Tab order match the wide grid. */
    [identityCard(site, profile), contactCard(site, profile), webCard(site), legalCard(profile), deliveryCard(profile)].forEach(function (n) { grid.appendChild(n); });
    wrap.appendChild(grid);
    body.appendChild(wrap);
    if (window.NOSante) window.NOSante.mount(site, $("bs-row-type")); /* a Santé site: its Sponsor ID row takes the Site type row's place */
    var f = focusId ? $(focusId) : null;
    if (f) f.focus();
  }
  /* sante.js (loaded after this file) draws the Santé Sponsor ID row (ClickUp z8uq9m92ez). A new read or leaving the page drops it. */
  function santeReset() { if (window.NOSante) window.NOSante.reset(); }
  /* What the two tags mean, as one plain line under the Site line (Coach Ed's ruling, 2026-11-11: no scope card). */
  function legendLine() {
    var legend = D.el("p", { "class": "bs-legend" });
    [[PUB, "Customers can see this on your site."], [PRIV, "Only you and NegosyoOnline see this."]].forEach(function (l) {
      var item = D.el("span", {});
      item.appendChild(tag(l[0]));
      item.appendChild(txt(l[1]));
      legend.appendChild(item);
    });
    return legend;
  }
  function readyCard(site, profile) {
    var r = readiness(site, profile);
    var c = card("bs-h-ready", "Site readiness", "What this site has and what it still needs. Nothing here is switched on or off by this list.",
      r.left ? chip("warn", r.left + (r.left === 1 ? " item left" : " items left")) : chip("ok", "All done"));
    c.classList.add("bs-ready-card");
    var ul = D.el("ul", { "class": "bs-ready" });
    r.items.forEach(function (i) {
      var li = D.el("li", {});
      li.appendChild(txt(i.label));
      li.appendChild(chip(i.done ? "ok" : "warn", i.text));
      ul.appendChild(li);
    });
    c.appendChild(ul);
    return c;
  }
  function identityCard(site, profile) {
    var c = card("bs-h-id", "Business identity", "The names customers see for this site.");
    c.appendChild(row("Business name", PUB, [value(profile.business_name)], editBtn("bs-edit-name", "name", "Edit business name")));
    c.appendChild(row("Site name", PUB, [value(site.display_name)], editBtn("bs-edit-site", "site", "Edit site name"),
      "Shown at the top of your site and in this dashboard."));
    c.appendChild(row("Business address", PUB, [value(profile.business_address)], editBtn("bs-edit-address", "address", "Edit business address")));
    var type = row("Site type", PRIV, [value(site.template_label), chip("neutral", "Set at setup")], null,
      "Chosen when the site was created. It cannot be changed here.");
    type.setAttribute("id", "bs-row-type"); /* for a Santé site, sante.js puts the Sponsor ID row in this row's place */
    c.appendChild(type);
    return c;
  }
  function contactCard(site, profile) {
    var c = card("bs-h-contact", "Customer contact", "How customers reach this business.");
    c.appendChild(row("Store email", PUB, [value(site.contact_email)], editBtn("bs-edit-contact", "contact", "Edit store email and mobile")));
    c.appendChild(row("Store mobile", PUB, [value(site.contact_mobile, mobileShown(site.contact_mobile))]));
    c.appendChild(row("Facebook", PUB, [value(site.facebook_url)], editBtn("bs-edit-social", "social", "Edit social links")));
    c.appendChild(row("Instagram", PUB, [value(site.instagram_url)]));
    c.appendChild(row("TikTok", PUB, [value(site.tiktok_url)]));
    return c;
  }
  /* What the API knows: the address is reserved for this site. It does not know whether a storefront is being
     served, so this card never says so; a custom domain is handed to the Domain tab and has no state of its own here. */
  function webCard(site) {
    var c = card("bs-h-web", "Web address", "Where this site is found on the internet.");
    c.appendChild(row("NegosyoOnline address", PUB, [value(hostOf(site)), chip("neutral", "Reserved for this site")], null,
      str(site.host) ? "This address was chosen at setup and is never given to another site. To change it, contact " + SUPPORT_EMAIL + "."
        : "Your address will show here once it is set up."));
    c.appendChild(row("Your own domain", PUB, [D.el("span", { "class": "bs-none" }, "None connected"), chip("neutral", "Not available yet")],
      null, /* the Domain page has no menu entry until Coach Ed's staging OK (z8uq9mhgvj): no "Go to Domain" button here either */
      "Connecting your own domain is not available yet. Its status will be shown here when it is."));
    return c;
  }
  function legalCard(profile) {
    var c = card("bs-h-legal", "Legal page details",
      "Printed on this site’s legal pages. Your TIN is not printed in the policy text. These are not your NegosyoOnline invoice details; those are in Billing.",
      editBtn("bs-edit-legal", "legal", "Edit legal page details"));
    LEGAL.forEach(function (f) { c.appendChild(row(f[1], f[2], [value(profile[f[0]])])); });
    c.appendChild(sealRow(profile));
    return c;
  }
  /* ---- the BIR registration badge: preview from a blob, upload / replace / remove ---- */
  function sealUrlDrop() { if (S.sealUrl) { try { URL.revokeObjectURL(S.sealUrl); } catch (e) { /* ignore */ } S.sealUrl = ""; } }
  function sealRow(profile) {
    var has = profile.has_seal === true, id = S.site && S.site.id, my = S.seq;
    var shown = D.el("div", { "class": "bs-seal-shown", id: "bs-seal-shown" });
    if (!has) shown.appendChild(D.el("span", { "class": "bs-none" }, "Not added"));
    else if (S.sealUrl) shown.appendChild(D.el("img", { id: "bs-seal-img", src: S.sealUrl, alt: "Your BIR registration badge", width: "240", style: "max-width:100%;height:auto;border:1px solid #dee2e6;border-radius:6px;background:#fff" }));
    else {
      shown.appendChild(D.el("span", { "class": "bs-none", id: "bs-seal-wait" }, "Loading the badge…"));
      fetch(D.cfg.apiBase + "/sites/" + id + "/business-profile/seal/", { credentials: "include" }).then(function (r) {
        if (!r.ok) throw new Error("seal " + r.status);
        return r.blob();
      }).then(function (b) {
        if (my !== S.seq || !S.site || S.site.id !== id) return;
        S.sealUrl = URL.createObjectURL(b);
        var held = document.activeElement && document.activeElement.id; /* the badge arriving redraws the card: focus stays on the seal control it was on (z8uq9men7r L5) */
        draw(/^bs-seal-/.test(held || "") ? held : undefined);
      }).catch(function () { var w = $("bs-seal-wait"); if (w && my === S.seq) w.textContent = "The badge could not be shown."; });
    }
    var file = D.el("input", { id: "bs-seal-file", type: "file", name: "seal", accept: SEAL_TYPES.join(","), "aria-label": "Business seal image", "aria-describedby": "bs-seal-help bs-seal-msg" });
    var up = D.el("button", { type: "button", "class": "no-btn no-btn-ghost", id: "bs-seal-up" }, has ? "Replace" : "Upload");
    var del = has ? D.el("button", { type: "button", "class": "no-btn no-btn-ghost", id: "bs-seal-del" }, "Remove") : null;
    var msg = D.el("p", { "class": "ob-err", id: "bs-seal-msg", role: "alert" }, S.sealMsg);
    msg.hidden = !S.sealMsg;
    function fail(text) { S.sealMsg = text; draw("bs-seal-file"); }
    function after(res, again) {
      S.sealBusy = false;
      if (my !== S.seq) return;
      if (res.ok && res.data) { S.profile = res.data; S.sealMsg = ""; sealUrlDrop(); draw(again); return; }
      var f = res.data && res.data.fields && res.data.fields.seal;
      fail(f ? fieldMessage(f) : res.status === 403 ? SEAL_OWNER : res.status === 404 ? GONE : SAVE_FAILED);
    }
    up.addEventListener("click", function () {
      if (S.sealBusy) return;
      var f = file.files && file.files[0], bad = sealProblem(f);
      if (bad) { fail(bad); return; }
      var fd = new FormData(); fd.append("seal", f);
      S.sealBusy = true; up.disabled = true;
      D.send("POST", "/sites/" + id + "/business-profile/seal/", fd).then(function (res) { after(res, "bs-seal-up"); }); /* focus returns to Replace, which stays after a successful upload (z8uq9men7r L5) */
    });
    if (del) del.addEventListener("click", function () {
      if (S.sealBusy) return;
      S.sealBusy = true; del.disabled = true;
      D.call("DELETE", "/sites/" + id + "/business-profile/seal/", null, true).then(function (res) { after(res, "bs-seal-file"); });
    });
    var actions = D.el("div", { "class": "bs-seal-actions", style: "display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px" });
    actions.appendChild(file); actions.appendChild(up); if (del) actions.appendChild(del);
    var r = row("BIR registration badge", PUB, [shown], null, null);
    var help = D.el("div", { "class": "bs-row-help", id: "bs-seal-help" }, "A JPEG, PNG or WebP image, up to 2 MB. Shown in the registration block at the bottom of your site.");
    r.appendChild(actions); r.appendChild(help); r.appendChild(msg);
    return r;
  }
  function deliveryCard(profile) {
    var c = card("bs-h-del", "Delivery estimates and Shipping Policy", "Suggested values. Your Shipping Policy stays offline until you review them.",
      editBtn("bs-edit-delivery", "delivery", "Edit delivery estimates"));
    c.classList.add("acct-card-wide");
    c.appendChild(row("Shipping Policy", PRIV, profile.shipping_estimates_confirmed === true
      ? [chip("ok", "Published"), txt("You reviewed these estimates.")]
      : [chip("warn", "Not published"), txt("Review the estimates below to publish it.")]));
    var est = D.el("div", { "class": "bs-est" });
    ESTIMATES.forEach(function (f) { est.appendChild(row(f[1], f[2], [value(profile[f[0]])])); });
    c.appendChild(est);
    return c;
  }

  /* ---- fields and inline errors (label above, red border and the message under the field) ---- */
  function field(o) {
    var id = "bs-f-" + o.key, box = D.el("div", { "class": "ob-field" }), lab = D.el("label", { "class": "ob-label bs-label", "for": id });
    lab.appendChild(txt(o.label));
    if (o.tag) lab.appendChild(tag(o.tag));
    box.appendChild(lab);
    var input = D.el("input", { id: id, name: o.key, "class": "ob-input", autocomplete: "off" }), hints = [];
    input.value = typeof o.value === "string" ? o.value : "";
    if (o.kind === "email" || o.kind === "phone") {
      var g = window.NOContact.group(o.kind, input, id);
      box.appendChild(g.group);
      if (g.hint) { box.appendChild(g.hint); hints.push(g.hint.id); }
    } else {
      input.setAttribute("type", "text");
      box.appendChild(input);
    }
    if (o.hint) { box.appendChild(D.el("p", { "class": "ob-help", id: id + "-help" }, o.hint)); hints.push(id + "-help"); }
    var err = D.el("p", { "class": "ob-err", id: id + "-err", role: "alert" });
    err.hidden = true;
    box.appendChild(err);
    if (hints.length) input.setAttribute("aria-describedby", hints.join(" "));
    return { box: box, input: input, err: err, hints: hints, kind: o.kind || "" };
  }
  /* Shows `map` (key to message) under the fields, clears the rest, and focuses the first refused field. */
  function setErrors(fields, order, map) {
    var first = null;
    order.forEach(function (k) {
      var f = fields[k], msg = map && typeof map[k] === "string" ? map[k] : "", group = f.input.parentNode;
      f.err.textContent = msg;
      f.err.hidden = !msg;
      var described = f.hints.concat(msg ? [f.err.id] : []).join(" ");
      if (described) f.input.setAttribute("aria-describedby", described); else f.input.removeAttribute("aria-describedby");
      if (msg) { f.input.setAttribute("aria-invalid", "true"); f.input.classList.add("ob-invalid"); }
      else { f.input.removeAttribute("aria-invalid"); f.input.classList.remove("ob-invalid"); }
      if (group && group.classList && group.classList.contains("ct-group")) { if (msg) group.classList.add("ct-group-err"); else group.classList.remove("ct-group-err"); }
      if (msg && !first) first = f.input;
    });
    if (first) first.focus();
    return first;
  }

  /* ---- dialog, the Account Settings one: inert siblings, scroll lock, Tab cycles inside, Escape closes ---- */
  function openDialog(opener, title) {
    closeDialog();
    var saved = [];
    Array.prototype.forEach.call(document.body.children, function (c) {
      saved.push([c, c.hasAttribute("inert"), c.getAttribute("aria-hidden")]);
      c.setAttribute("inert", ""); c.setAttribute("aria-hidden", "true");
    });
    var over = D.el("div", { id: "bs-dlg-root", "class": "acct-overlay" });
    var dlg = D.el("div", { id: "bs-dlg", "class": "acct-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "bs-dlg-h" });
    var top = D.el("div", { "class": "acct-dlg-head" });
    top.appendChild(D.el("h2", { id: "bs-dlg-h", tabindex: "-1" }, title));
    var x = D.el("button", { type: "button", "class": "acct-dlg-x", "aria-label": "Close" }, "×");
    x.addEventListener("click", cancelDialog);
    top.appendChild(x);
    var body = D.el("div", { id: "bs-dlg-body", "class": "acct-dlg-body" });
    dlg.appendChild(top);
    dlg.appendChild(body);
    over.appendChild(dlg);
    document.body.appendChild(over);
    document.body.classList.add("acct-lock");
    S.dlg = { root: over, dlg: dlg, body: body, saved: saved, opener: opener };
    document.addEventListener("keydown", dlgKey);
    return body;
  }
  function closeDialog() { /* true when a dialog was open */
    var d = S.dlg;
    if (!d) return false;
    S.dlg = null;
    document.removeEventListener("keydown", dlgKey);
    d.root.remove();
    d.saved.forEach(function (s) {
      if (!s[1]) s[0].removeAttribute("inert");
      if (s[2] === null) s[0].removeAttribute("aria-hidden"); else s[0].setAttribute("aria-hidden", s[2]);
    });
    document.body.classList.remove("acct-lock");
    return true;
  }
  function cancelDialog() {
    var o = S.dlg && S.dlg.opener;
    closeDialog();
    if (o && o.focus) o.focus();
  }
  function focusables() {
    var d = S.dlg && S.dlg.dlg;
    function shown(n) { for (; n && n !== d; n = n.parentNode) if (n.hidden) return false; return true; }
    return d ? Array.prototype.filter.call(d.querySelectorAll("a[href], button, input, select, textarea"), function (n) {
      return !n.disabled && shown(n) && n.getAttribute("tabindex") !== "-1";
    }) : [];
  }
  function dlgKey(e) {
    if (!S.dlg) return;
    if (e.key === "Escape") { e.preventDefault(); cancelDialog(); return; }
    if (e.key !== "Tab") return;
    var items = focusables(), now = document.activeElement;
    if (!items.length) { e.preventDefault(); $("bs-dlg-h").focus(); return; }
    var first = items[0], last = items[items.length - 1], inside = items.indexOf(now) >= 0;
    if (e.shiftKey && (now === first || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (now === last || !inside)) { e.preventDefault(); first.focus(); }
  }

  /* ---- the seven edit dialogs: one form, one request, to the site id the dialog was opened for ---- */
  function openEdit(opener, name) {
    var site = S.site, profile = S.profile;
    if (!site || !profile) return;
    var siteId = site.id, seq = S.seq, spec = specs(site, profile)[name], openerId = opener && opener.getAttribute ? opener.getAttribute("id") : "";
    var body = openDialog(opener, spec.title), fields = {}, order = [], box = null;
    var form = D.el("form", { "class": "acct-dlg-form", novalidate: "" });
    form.appendChild(D.el("p", { "class": "dash-copy" }, "For " + siteLabel(site) + ". " + spec.lead));
    spec.fields.forEach(function (o) { var f = field(o); fields[o.key] = f; order.push(o.key); form.appendChild(f.box); });
    if (spec.check) {
      var lab = D.el("label", { "class": "bs-check", "for": "bs-f-" + spec.check.key });
      box = D.el("input", { type: "checkbox", id: "bs-f-" + spec.check.key, name: spec.check.key });
      box.checked = spec.check.value;
      lab.appendChild(box);
      lab.appendChild(txt(spec.check.label));
      form.appendChild(lab);
    }
    var failed = D.el("p", { "class": "ob-err bs-dlg-err", id: "bs-dlg-err", role: "alert" });
    failed.hidden = true;
    form.appendChild(failed);
    var save = D.el("button", { type: "submit", "class": "no-btn no-btn-primary", id: "bs-dlg-save" }, "Save");
    var cancel = D.el("button", { type: "button", "class": "no-btn no-btn-ghost", id: "bs-dlg-cancel" }, "Cancel");
    cancel.addEventListener("click", cancelDialog);
    var foot = D.el("div", { "class": "acct-dlg-foot" });
    foot.appendChild(save);
    foot.appendChild(cancel);
    form.appendChild(foot);
    function current() { return seq === S.seq && !!S.site && S.site.id === siteId; }
    function open() { return !!S.dlg && S.dlg.body === body; }
    function busy(on) { save.disabled = on; save.textContent = on ? "Saving…" : "Save"; }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (save.disabled || !open() || !current()) return; /* a dialog for a site no longer selected sends nothing */
      var out = {}, missing = {};
      order.forEach(function (k) {
        var raw = fields[k].input.value;
        out[k] = fields[k].kind === "phone" ? window.NOContact.phoneValue(raw) : String(raw || "").trim();
        if (REQUIRED.hasOwnProperty(k) && !out[k]) missing[k] = REQUIRED[k];
      });
      if (box) out[spec.check.key] = box.checked === true;
      failed.hidden = true;
      if (setErrors(fields, order, missing)) return;
      busy(true);
      D.call("PATCH", "/sites/" + siteId + "/" + spec.path, out, true).then(function (res) {
        if (!current()) return; /* the page was left or another site chosen: this answer is not drawn */
        if (res.ok && res.data) {
          saved(spec.path, res.data, siteId);
          if (open()) closeDialog();
          draw(openerId);
          D.toast("Saved");
          say("Saved.");
          return;
        }
        if (!open()) return;
        busy(false);
        if (res.status === 401) return; /* app.js is already sending the owner to sign in */
        if (res.status === 404) { closeDialog(); gone(); return; }
        var sent = res.data && res.data.fields, map = {}, any = false;
        order.forEach(function (k) { var m = sent ? fieldMessage(sent[k]) : ""; if (m) { map[k] = m; any = true; } });
        if (any) { setErrors(fields, order, map); return; }
        setErrors(fields, order, null);
        failed.textContent = SAVE_FAILED;
        failed.hidden = false;
        save.focus();
      });
    });
    body.appendChild(form);
    fields[order[0]].input.focus();
  }
  /* The row shows what the server returned. A site answer replaces the site; a profile answer replaces the profile. */
  function saved(path, data, siteId) {
    if (path) {
      S.profile = data;
      if (typeof data.business_name === "string") S.site.business_name = data.business_name;
      return;
    }
    var at = S.sites.map(function (s) { return s.id; }).indexOf(siteId);
    if (data.id !== siteId || at < 0) return;
    S.sites[at] = data;
    S.site = data;
    if (at === 0 && D.setWorkspace) D.setWorkspace(siteLabel(data)); /* the sidebar label is the first site's name */
  }

  window.NOBusiness = {
    show: function () { load(); },
    hide: function () { S.seq++; sealUrlDrop(); S.sealMsg = ""; closeDialog(); santeReset(); S.site = null; S.profile = null; S.sites = []; S.notice = ""; say(""); },
    util: { sealProblem: sealProblem, fieldMessage: fieldMessage, mobileShown: mobileShown, readiness: readiness, specs: specs, siteLabel: siteLabel, hostOf: hostOf },
    /* The dialog and its field, for sante.js (ClickUp z8uq9m92ez). One dialog is open at a time, whichever page opened it. */
    ui: { openDialog: openDialog, closeDialog: closeDialog, cancelDialog: cancelDialog, dialogBody: function () { return S.dlg ? S.dlg.body : null; },
      field: field, setErrors: setErrors }
  };
})();
