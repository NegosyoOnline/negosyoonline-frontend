/* Shipping (/settings/shipping/, Coach Ed 2026-11-04): who pays the J&T shipping fee on a store's product orders.
   Reads and writes GET and PUT /sites/{id}/storefront-settings/ with {customer_shipping: "charge" | "zero"}.
   NOStorefrontSettings.render(container, siteId) is the whole Shipping section for one site and knows nothing about
   how the site was chosen. pick() below is the only site chooser: a plain select, skipped for a single site, and it
   is meant to be replaced by the shared site selector without touching render(). Plain ES5; API strings reach the
   page through textContent or D.el only; no storage key. */
(function () {
  var D = window.NODash;
  var token = 0;
  var SITE_RE = /^[1-9][0-9]{0,9}$/;
  var OPTIONS = [
    { value: "charge", title: "Calculated shipping", copy: "Customers pay the J&T shipping fee calculated at checkout.", tag: "Default" },
    { value: "zero", title: "₱0 shipping", copy: "Your store pays the shipping, customers see ₱0.00." }
  ];
  var NOTE = "The ₱1,488 Membership Pack always ships free; this setting does not change it.";

  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function root() { return document.getElementById("ss-root"); }
  function say(text) { var n = document.getElementById("ss-live"); if (n) n.textContent = text; }

  /* The API sends {message, fields, code}; a plain 404 or 401 body carries no message. */
  function failText(res) {
    var d = res && res.data, f = d && d.fields && d.fields.customer_shipping;
    if (typeof f === "string" && f) return f;
    if (d && typeof d.message === "string" && d.message) return d.message;
    if (res && res.status === 404) return "Shipping settings are not available for this store yet.";
    if (res && res.status === 403) return "Shipping settings can't be changed for this store right now.";
    return "We couldn’t save. Check your connection and try again.";
  }

  function card(opt, checked) {
    var id = "ss-opt-" + opt.value;
    var lab = D.el("label", { "class": "ss-card", "for": id });
    var input = D.el("input", { type: "radio", name: "customer_shipping", id: id, value: opt.value });
    input.checked = checked;
    var body = h("span", "ss-card-body");
    var head = h("span", "ss-card-title", opt.title);
    if (opt.tag) head.appendChild(h("span", "ss-tag", opt.tag));
    body.appendChild(head);
    body.appendChild(h("span", "ss-card-copy", opt.copy));
    lab.appendChild(input);
    lab.appendChild(body);
    return lab;
  }

  function form(container, siteId, saved, mine) {
    var f = D.el("form", { "class": "ss-form", novalidate: "" });
    var fs = D.el("fieldset", { "class": "ss-group", "aria-describedby": "ss-err" });
    fs.appendChild(h("legend", "ss-legend", "Customer shipping fee"));
    OPTIONS.forEach(function (o) { fs.appendChild(card(o, o.value === saved)); });
    var err = D.el("p", { "class": "ss-error", id: "ss-err", role: "alert" });
    err.hidden = true;
    var ok = h("p", "ss-ok"); ok.hidden = true;
    var save = D.el("button", { type: "submit", "class": "no-btn no-btn-primary" }, "Save");
    f.appendChild(fs); f.appendChild(err);
    f.appendChild(h("p", "ss-note", NOTE));
    var row = h("div", "ss-actions"); row.appendChild(save); row.appendChild(ok);
    f.appendChild(row);

    function problem(text) { err.textContent = text; err.hidden = !text; fs.classList.toggle("ss-invalid", !!text); }
    f.addEventListener("change", function () { problem(""); ok.hidden = true; });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var chosen = f.querySelector("input[name='customer_shipping']:checked");
      problem(""); ok.hidden = true;
      if (!chosen) { problem("Choose how shipping is charged."); return; }
      save.disabled = true; save.textContent = "Saving…"; f.setAttribute("aria-busy", "true");
      D.call("PUT", "/sites/" + siteId + "/storefront-settings/", { customer_shipping: chosen.value }, true).then(function (res) {
        if (mine !== token) return;
        save.disabled = false; save.textContent = "Save"; f.removeAttribute("aria-busy");
        if (res.ok && res.data && (res.data.customer_shipping === "charge" || res.data.customer_shipping === "zero")) {
          Array.prototype.forEach.call(f.querySelectorAll("input[name='customer_shipping']"), function (i) { i.checked = i.value === res.data.customer_shipping; });
          ok.textContent = "Saved. New orders use " + (res.data.customer_shipping === "zero" ? "₱0 shipping." : "calculated shipping.");
          ok.hidden = false; say("Saved.");
          D.toast("Saved", "Your shipping setting is saved.");
          return;
        }
        problem(failText(res)); say("We couldn’t save. " + failText(res));
        D.toast("We couldn’t save", "Check the message and try again.", "error");
      });
    });
    clear(container).appendChild(f);
  }

  /* The Shipping section for one site. siteId is the numeric id of a site the Subscriber owns. */
  function render(container, siteId) {
    var mine = ++token;
    clear(container).appendChild(h("p", "ss-meta", "Loading your shipping setting…"));
    D.call("GET", "/sites/" + siteId + "/storefront-settings/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      var v = res.data && res.data.customer_shipping;
      if (!res.ok || (v !== "charge" && v !== "zero")) {
        var box = D.el("div", { "class": "ss-fail", role: "alert" });
        box.appendChild(h("p", "ss-error", res.status === 404 || res.status === 403 ? failText(res) : "We couldn’t load your shipping setting. Try again."));
        var again = D.el("button", { type: "button", "class": "no-btn no-btn-ghost" }, "Try again");
        again.addEventListener("click", function () { render(container, siteId); });
        box.appendChild(again);
        clear(container).appendChild(box);
        return;
      }
      form(container, siteId, v, mine);
    });
  }

  /* Minimal site chooser, replaceable by the shared site selector: it only ever hands render() a site id from GET /sites/. */
  function pick(host) {
    var mine = ++token;
    clear(host).appendChild(h("p", "ss-meta", "Loading your stores…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      var sites = (res.data && res.data.sites) || [];
      if (!res.ok || !sites.length) {
        clear(host).appendChild(h("p", "ss-meta", "Shipping is not available for this account yet."));
        return;
      }
      var ids = sites.map(function (s) { return s.id; });
      var m = /[?&]site=([^&#]*)/.exec(location.search);
      var first = m && SITE_RE.test(m[1]) && ids.indexOf(parseInt(m[1], 10)) >= 0 ? parseInt(m[1], 10) : ids[0];
      clear(host);
      var body = h("div", "ss-body");
      if (sites.length > 1) {
        var wrap = h("div", "ss-pick"), lab = h("label", "ss-pick-label", "Store");
        var sel = D.el("select", { "class": "ss-select", id: "ss-site" });
        lab.setAttribute("for", "ss-site");
        sites.forEach(function (s) {
          var o = D.el("option", { value: String(s.id) }, s.display_name || s.subdomain || "Store " + s.id);
          if (s.id === first) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener("change", function () {
          var id = parseInt(sel.value, 10);
          if (ids.indexOf(id) < 0) return;
          try { history.replaceState(null, "", "/settings/shipping/?site=" + id); } catch (e) { /* ignore */ }
          render(body, id);
        });
        wrap.appendChild(lab); wrap.appendChild(sel);
        host.appendChild(wrap);
      }
      host.appendChild(body);
      render(body, first);
    });
  }

  window.NOStorefrontSettings = { render: render, show: function () { pick(root()); }, hide: function () { token++; say(""); } };
})();
