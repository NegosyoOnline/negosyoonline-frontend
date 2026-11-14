/* Orders > Registrations (ClickUp z8uq9meyqj): the Subscriber encodes each paid Membership Package member in Santé by hand, presses
   Start, then Mark registered with the member's Santé member ID. The member is then emailed once, from the store (the API sends it).
   Reads GET /sites/{id}/pack/registrations/?filter=to_register|registered, POST .../{member}/start/ and .../{member}/registered/
   with the row's state_version (backend apps/pack/api_owner.py). The dash decides nothing: every button comes from the row's status,
   and the date of birth, usernames, mobile and address are shown only when the API sends them (never on a registered row).
   API strings reach the page through textContent or D.el only. pack-orders.js asks this file to open and close. */
(function () {
  var D = window.NODash;
  var R = { site: null, filter: "to_register", rows: [], state: "idle", token: 0, busy: false, form: null };
  var STALE = "This registration changed. It was reloaded, try again.";
  var CHIPS = { ready_to_register: ["chip chip-info", "Ready to register"], in_registration: ["chip chip-warn", "In registration"], registered: ["chip chip-ok", "Registered"] };
  var ERR_TEXT = { no_verified_email: "The member's email is not verified.", email_not_sent: "The email service did not accept it.", site_closed: "The store is closed.", bad_sender: "The store's sender address is not valid.", error: "Something went wrong." };

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function btn(label, cls, fn) { var b = h("button", "no-btn " + cls, label); b.setAttribute("type", "button"); if (fn) b.addEventListener("click", function () { fn(b); }); return b; }
  function msg(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function base() { return "/sites/" + R.site + "/pack/registrations/"; }
  function stamp(iso) {
    var d = new Date(iso), o = {};
    if (isNaN(d.getTime())) return "";
    try { new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d).forEach(function (p) { o[p.type] = p.value; }); } catch (e) { return ""; }
    return String(o.month || "").replace(/\.$/, "") + " " + o.day + ", " + o.year + ", " + o.hour + ":" + o.minute + " " + String(o.dayPeriod || "").toUpperCase().replace(/\./g, "");
  }
  function dob(v) {
    var m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null, M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return m ? M[+m[2] - 1] + " " + (+m[3]) + ", " + m[1] : "";
  }
  function place(a) {
    if (!a || typeof a !== "object") return "";
    return [a.line, a.barangay, a.city, a.province, a.zip].filter(function (x) { return typeof x === "string" && x; }).join(", ");
  }

  /* ---- open / close (called by pack-orders.js) ---- */
  function open(site) {
    var root = byId("reg-root"); if (!root) return;
    root.hidden = false;
    if (R.site !== site || R.state === "idle") { R.site = site; R.rows = []; R.form = null; load(); } else render();
  }
  function close() { R.token++; R.state = "idle"; R.form = null; var root = byId("reg-root"); if (root) { root.hidden = true; clear(root); } }
  function load(quiet) {
    var mine = ++R.token;
    if (!quiet) { R.state = "loading"; render(); }
    return D.call("GET", base() + "?filter=" + R.filter, null, true).then(function (r) {
      if (mine !== R.token || r.status === 401) return;
      if (r.status === 404) { R.rows = []; R.state = "off"; render(); return; } /* not a Santé site, or the package is off */
      if (!r.ok) { if (!quiet) { R.state = "error"; render(); } return; }
      R.rows = Array.isArray(r.data.registrations) ? r.data.registrations : [];
      R.state = R.rows.length ? "ok" : "empty"; render();
    });
  }

  /* ---- writes ---- */
  function write(row, kind, body, onInvalid) {
    if (R.busy) return;
    R.busy = true;
    var payload = body || {}; payload.state_version = row.state_version;
    return D.call("POST", base() + encodeURIComponent(row.id) + "/" + kind + "/", payload, true).then(function (r) {
      R.busy = false;
      if (r.status === 401) return;
      if (r.ok) { R.form = null; D.toast(kind === "start" ? "Registration started" : "Marked as registered", kind === "start" ? "" : "The member is being emailed."); return load(true); }
      if (r.status === 409) { R.form = null; D.toast(STALE, "", "error"); return load(true); }
      if (r.status === 422 && onInvalid) { onInvalid(r); render(); return; }
      D.toast("That did not work", msg(r, "We could not save this. Please try again."), "error");
      render();
    });
  }

  /* ---- render ---- */
  function fact(dl, k, v) { add(dl, h("dt", "", k), h("dd", v ? "" : "rg-none", v || "Erased or not given")); }
  function emailLine(row) {
    var e = row.email, p = h("p", "rg-email");
    if (!e) { p.textContent = "No email yet."; return p; }
    var chip, text = "";
    if (e.state === "sent") { chip = h("span", "chip chip-ok", "Email sent"); text = e.sent_at ? "Sent " + stamp(e.sent_at) + "." : ""; }
    else if (e.state === "sending") { chip = h("span", "chip chip-info", "Email sending"); text = "It goes out in a moment."; }
    else if (e.state === "retrying") { chip = h("span", "chip chip-warn", "Email failed, trying again"); text = (ERR_TEXT[e.last_error_code] || "") + " Tried " + e.attempts + (e.attempts === 1 ? " time." : " times."); }
    else { chip = h("span", "chip chip-danger", "Email not sent"); text = "We gave up after " + e.attempts + " tries. " + (ERR_TEXT[e.last_error_code] || "") + " Contact the member yourself."; }
    return add(p, chip, document.createTextNode(" " + text));
  }
  function markForm(row) {
    var f = R.form, box = h("div", "rg-form"), lab = h("label", "", "Santé member ID"), inp = D.el("input", { "class": "rg-input" + (f.err ? " is-bad" : ""), type: "text", id: "rg-sid", autocomplete: "off", maxlength: "32" }), sub = btn(R.busy ? "Saving" : "Mark registered", "no-btn-primary", null);
    lab.setAttribute("for", "rg-sid"); inp.value = f.value || "";
    if (f.err) { inp.setAttribute("aria-invalid", "true"); inp.setAttribute("aria-describedby", "rg-sid-err"); }
    inp.addEventListener("input", function () { f.value = inp.value; });
    function submit() {
      f.value = inp.value; f.err = "";
      write(row, "registered", { sante_member_id: f.value }, function (r) { f.err = (r.data.fields && r.data.fields.sante_member_id) || msg(r, "Enter the Santé member ID."); });
    }
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    sub.addEventListener("click", submit); if (R.busy) sub.disabled = true;
    add(box, lab, inp);
    if (f.err) { var er = h("p", "rg-err", f.err); er.setAttribute("id", "rg-sid-err"); er.setAttribute("role", "alert"); box.appendChild(er); }
    add(box, h("p", "rg-hint", "Type the ID Santé gave this member. The member gets one email from your store when you save."));
    add(box, add(h("div", "rg-actions"), sub, btn("Cancel", "no-btn-ghost", function () { R.form = null; render(); })));
    return box;
  }
  function card(row) {
    var c = h("article", "rg-card"), head = h("div", "rg-head"), chip = CHIPS[row.status];
    c.setAttribute("aria-label", row.name + ", order " + row.order_number);
    add(head, add(h("div", "rg-who"), h("h3", "", row.name), h("p", "rg-sub", "Order " + row.order_number)), chip ? h("span", chip[0], chip[1]) : null);
    c.appendChild(head);
    if (row.status === "registered") {
      var dl = h("dl", "rg-facts");
      add(dl, h("dt", "", "Santé member ID"), h("dd", "", row.sante_member_id), h("dt", "", "Registered"), h("dd", "", stamp(row.registered_at)));
      add(c, dl, emailLine(row));
      return c;
    }
    var d = row.details; /* sent only while the row is ready_to_register or in_registration */
    if (d) {
      var f = h("dl", "rg-facts");
      fact(f, "Date of birth", dob(d.date_of_birth)); fact(f, "First choice username", d.desired_username); fact(f, "Second choice username", d.alternate_username);
      fact(f, "Mobile", d.mobile); fact(f, "Delivery address", place(d.delivery_address));
      if (d.delivery_address && d.delivery_address.receiver_name) fact(f, "Receiver", d.delivery_address.receiver_name);
      c.appendChild(f);
    }
    var acts = h("div", "rg-actions");
    if (row.status === "ready_to_register") acts.appendChild(btn("Start registration", "no-btn-primary", function () { write(row, "start"); }));
    else if (row.status === "in_registration" && !(R.form && R.form.id === row.id)) acts.appendChild(btn("Mark registered", "no-btn-primary", function () { R.form = { id: row.id, value: "", err: "" }; render(); var i = byId("rg-sid"); if (i && i.focus) i.focus(); }));
    if (acts.firstChild) c.appendChild(acts);
    if (row.status === "in_registration" && R.form && R.form.id === row.id) c.appendChild(markForm(row));
    return c;
  }
  function render() {
    var root = byId("reg-root"); if (!root || root.hidden) return;
    clear(root);
    var wrap = h("section", "rg-wrap");
    wrap.setAttribute("aria-labelledby", "rg-h");
    var title = h("h2", "", "Registrations"); title.setAttribute("id", "rg-h");
    add(wrap, add(h("header", "rg-top"), title, h("p", "rg-lead", "Register each paid member in Santé, then record their Santé member ID here. The member is emailed once when you mark them registered.")));
    var seg = h("div", "rg-seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Show");
    [["to_register", "To register"], ["registered", "Registered"]].forEach(function (x) {
      var b = btn(x[1], "", function () { if (R.filter === x[0]) return; R.filter = x[0]; R.form = null; load(); });
      b.setAttribute("aria-pressed", R.filter === x[0] ? "true" : "false"); seg.appendChild(b);
    });
    wrap.appendChild(seg);
    if (R.state === "loading") { var sk = h("div", "rg-skel"); sk.setAttribute("role", "status"); sk.setAttribute("aria-label", "Loading registrations"); add(sk, h("i"), h("i")); wrap.appendChild(sk); }
    else if (R.state === "error") {
      var e = h("div", "rg-card rg-bad"); e.setAttribute("role", "alert");
      add(e, h("h3", "", "We could not load registrations"), h("p", "rg-sub", "Check your connection, then try again."), btn("Try again", "no-btn-ghost", function () { load(); })); wrap.appendChild(e);
    } else if (R.state === "off") wrap.appendChild(add(h("div", "rg-card"), h("h3", "", "Nothing to register here"), h("p", "rg-sub", "Registrations show for a Santé store with the Membership Package turned on.")));
    else if (R.state === "empty") wrap.appendChild(add(h("div", "rg-card"), h("h3", "", R.filter === "registered" ? "No registered members yet" : "No one is waiting to be registered"), h("p", "rg-sub", R.filter === "registered" ? "Members show here after you mark them registered." : "A member shows here after you approve their payment and they send their Santé details.")));
    else R.rows.forEach(function (row) { wrap.appendChild(card(row)); });
    root.appendChild(wrap);
  }

  window.NORegistrations = { open: open, close: close, _state: function () { return R; } };
})();
