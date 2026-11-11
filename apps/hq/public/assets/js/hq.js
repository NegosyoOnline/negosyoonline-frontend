/* The staff app's client. No dependencies, no secrets, no token: the hq cookie signs every call and this
   page cannot read it (R26). Every call goes from the browser to the hq host itself; nothing passes
   through this app's own server (design 21.1). The page decides nothing about access: it follows the answer. */
(function () {
  var cfg = window.NO_HQ_CONFIG || {};

  /* Resolves {ok, status, code, message, fields, data}. message and fields are the backend's own text for a
     refusal ("" and {} when there is none); a page shows them only for the codes it names. status 0 means no answer could be read: the server was not reached,
     or the staff routes are off and the hq host answered a page this origin may not read. */
  function call(method, path, body) {
    var opts = { method: method, credentials: "include" };
    if (body) { opts.headers = { "Content-Type": "application/json" }; opts.body = JSON.stringify(body); }
    return fetch(cfg.staffApi + "/" + path, opts)
      .then(function (r) {
        if (r.status === 204) return { ok: true, status: 204, code: "", message: "", fields: {}, data: {} };
        return r.json().catch(function () { return {}; }).then(function (data) {
          var e = data && data.error;
          return { ok: r.ok, status: r.status, code: e && typeof e.code === "string" ? e.code : "",
            message: !r.ok && e && typeof e.message === "string" ? e.message : "",
            fields: !r.ok && e && e.fields && typeof e.fields === "object" ? e.fields : {}, data: r.ok ? data || {} : {} };
        });
      })
      .catch(function () { return { ok: false, status: 0, code: "", message: "", fields: {}, data: {} }; });
  }

  /* A private file from the staff routes, as {ok, status, code, blob}. The file is held in this tab's
     memory only; the caller shows it from an object address and releases it. */
  function file(path, body) {
    var opts = { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}) };
    return fetch(cfg.staffApi + "/" + path, opts)
      .then(function (r) {
        if (r.ok) return r.blob().then(function (b) { return { ok: true, status: r.status, code: "", blob: b }; });
        return r.json().catch(function () { return {}; }).then(function (data) {
          var e = data && data.error;
          return { ok: false, status: r.status, code: e && typeof e.code === "string" ? e.code : "", blob: null };
        });
      })
      .catch(function () { return { ok: false, status: 0, code: "", blob: null }; });
  }

  /* Which page the answer to me/ or console/ leads to: "console", "verify", "sign-in", or "down" when the
     answer is none of the three the backend gives a staff page. */
  function placeFor(res) {
    if (res.ok) return "console";
    if (res.status === 401 && res.code === "second_step_required") return "verify";
    if (res.status === 401 && res.code === "unauthenticated") return "sign-in";
    return "down";
  }

  /* "11 Nov 2026, 9:02 AM", in Manila, as the Django console wrote it. */
  function when(iso) {
    var d = new Date(iso), p = {};
    if (!iso || isNaN(d.getTime())) return "";
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p.day + " " + p.month + " " + p.year + ", " + p.hour + ":" + p.minute + " " + p.dayPeriod;
  }

  /* The part of the address before the @, and the first letters of its first two words. */
  function who(email) {
    var name = String(email || "").split("@")[0], parts = name.split(/[._-]+/).filter(Boolean);
    return { name: name, initials: ((parts[0] || "").charAt(0) + (parts[1] || "").charAt(0)).toUpperCase() };
  }

  /* The theme buttons. theme.js owns the choice and its storage. */
  ["theme-toggle", "theme-toggle-2"].forEach(function (id) {
    var b = document.getElementById(id), api = window.NOHqTheme;
    if (!b) return;
    if (!api) { b.hidden = true; return; }
    b.addEventListener("click", function () { api.set(api.current() === "dark" ? "light" : "dark"); });
  });

  window.NOHq = { cfg: cfg, call: call, file: file, placeFor: placeFor, when: when, who: who };
})();
