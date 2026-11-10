/* Business details (/settings/general/, Coach Ed 2026-10-31): what the store's five legal pages and footer print. Reads
   GET /sites/ and GET /sites/{id}/business-profile/; writes PATCH to the same path and PATCH /sites/{id}/settings/ for
   the store email and mobile. Delivery estimates start at suggested values; the Shipping Policy stays offline until the
   owner ticks the review box. It also carries the Social links group (Instagram and TikTok, Phase 2 C4; no colour
   or logo control, owner ruling R3). API strings reach the page through textContent or D.el only. */
(function () {
  var D = window.NODash;
  var token = 0, site = null;
  var GROUPS = [
    ["Business details", "Shown on your legal pages. Your TIN is not printed in the policy text.", [
      ["registered_name", "Registered business name"], ["business_address", "Business address"],
      ["contact_email", "Support email"], ["contact_mobile", "Contact number"],
      ["privacy_contact_email", "Privacy contact email"], ["complaints_contact_name", "Complaints contact or office (optional)"],
      ["dti_business_number", "DTI business name number"], ["tin", "TIN"], ["bir_rsn", "BIR registration serial number"]]],
    ["Delivery estimates", "Suggested values. Review them and change anything that does not match how you ship.", [
      ["shipping_processing_time", "Order processing"], ["shipping_metro_manila_estimate", "Metro Manila"],
      ["shipping_luzon_estimate", "Luzon outside Metro Manila"], ["shipping_visayas_estimate", "Visayas"],
      ["shipping_mindanao_estimate", "Mindanao"], ["shipping_other_areas_estimate", "Other serviceable areas (optional)"]]],
    ["Social links", "Links to your social media pages.", [
      ["instagram_url", "Instagram link"], ["tiktok_url", "TikTok link"]]]
  ];
  var SITE_FIELDS = ["contact_email", "contact_mobile", "instagram_url", "tiktok_url"];
  /* CR-1: every contact box here is the shared group from dashboard.js (window.NOContact): +63 mobile, envelope email. */
  var KINDS = { contact_email: "email", privacy_contact_email: "email", contact_mobile: "phone" };

  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function root() { return document.getElementById("bd-root"); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function say(text) { document.getElementById("bd-live").textContent = text; }

  function field(name, label, value) {
    var w = h("div", "pm-field"), lab = h("label", "pm-label", label), id = "bd-" + name;
    var input = D.el("input", { "class": "pm-input", type: "text", name: name, id: id, autocomplete: "off" });
    var err = h("p", "pm-error"); err.setAttribute("id", id + "-err"); err.hidden = true;
    input.value = value || ""; lab.setAttribute("for", id);
    var C = window.NOContact, kind = KINDS[name], cg = C && kind ? C.group(kind, input, id) : null;
    w.appendChild(lab); w.appendChild(cg ? cg.group : input); if (cg && cg.hint) w.appendChild(cg.hint); w.appendChild(err);
    input.setAttribute("aria-describedby", (cg && cg.hint ? id + "-hint " : "") + id + "-err");
    return w;
  }
  function showErrors(form, fields) {
    Array.prototype.forEach.call(form.querySelectorAll(".pm-error"), function (p) { p.hidden = true; p.textContent = ""; });
    Array.prototype.forEach.call(form.querySelectorAll(".pm-invalid"), function (i) { i.classList.remove("pm-invalid"); i.removeAttribute("aria-invalid"); });
    Array.prototype.forEach.call(form.querySelectorAll(".ct-group-err"), function (g) { g.classList.remove("ct-group-err"); });
    var first = null;
    Object.keys(fields || {}).forEach(function (k) {
      var input = form.querySelector("[name='" + k + "']"), err = input && document.getElementById(input.id + "-err");
      if (!err) return;
      err.textContent = String(fields[k]); err.hidden = false; input.classList.add("pm-invalid"); input.setAttribute("aria-invalid", "true");
      if (input.parentNode && input.parentNode.classList.contains("ct-group")) input.parentNode.classList.add("ct-group-err");
      if (!first) first = input;
    });
    if (first) first.focus();
    return !!first;
  }
  function render(profile, settings, store) {
    var form = D.el("form", { "class": "pm-form", novalidate: "" }), values = Object.assign({}, profile, settings);
    form.appendChild(h("p", "pm-meta", "Store: " + store));
    GROUPS.forEach(function (g) {
      var card = h("section", "pm-card");
      card.appendChild(h("h2", "pm-h2", g[0])); card.appendChild(h("p", "pm-lead", g[1]));
      g[2].forEach(function (f) { card.appendChild(field(f[0], f[1], values[f[0]])); });
      form.appendChild(card);
    });
    var box = D.el("input", { type: "checkbox", id: "bd-confirm", name: "shipping_estimates_confirmed" });
    var lab = h("label", "pm-label", "I reviewed these delivery estimates. Publish my Shipping Policy."); lab.setAttribute("for", "bd-confirm");
    box.checked = !!profile.shipping_estimates_confirmed;
    var save = h("button", "no-btn no-btn-primary", "Save"); save.setAttribute("type", "submit");
    var row = h("div", "pm-check"); row.appendChild(box); row.appendChild(lab);
    form.appendChild(row); form.appendChild(save);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var biz = { shipping_estimates_confirmed: box.checked }, contact = {};
      GROUPS.forEach(function (g) { g[2].forEach(function (f) {
        var raw = form.elements[f[0]].value;
        (SITE_FIELDS.indexOf(f[0]) >= 0 ? contact : biz)[f[0]] = KINDS[f[0]] === "phone" && window.NOContact ? window.NOContact.phoneValue(raw) : raw.trim();
      }); });
      save.disabled = true;
      D.call("PATCH", "/sites/" + site + "/", contact, true).then(function (a) {
        if (!a.ok) return a;
        return D.call("PATCH", "/sites/" + site + "/business-profile/", biz, true);
      }).then(function (res) {
        save.disabled = false;
        if (res.ok) { showErrors(form, {}); D.toast("Saved", "Your business details are saved."); say("Saved."); return; }
        if (showErrors(form, res.data && res.data.fields)) { D.toast("We couldn’t save", "Fix the marked fields and save again.", "error"); return; }
        D.toast("We couldn’t save", "Check your connection and try again.", "error"); say("We couldn’t save. Try again.");
      });
    });
    clear(root()).appendChild(form);
  }
  function load() {
    var mine = ++token;
    clear(root()).appendChild(h("p", "pm-meta", "Loading your business details…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      var sites = D.sitesOf(res);
      if (!res.ok || !sites.length) { clear(root()).appendChild(h("p", "pm-meta", "Business details are not available for this account yet.")); return; }
      site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      Promise.all([D.call("GET", "/sites/" + site + "/business-profile/", null, true), D.call("GET", "/sites/" + site + "/", null, true)]).then(function (r) {
        if (mine !== token) return;
        if (!r[0].ok || !r[1].ok) { clear(root()).appendChild(h("p", "pm-meta", "We couldn’t load your business details. Try again.")); return; }
        render(r[0].data, r[1].data, r[1].data.display_name || r[1].data.subdomain || "");
      });
    });
  }
  window.NOBusiness = { show: load, hide: function () { token++; say(""); } };
})();
