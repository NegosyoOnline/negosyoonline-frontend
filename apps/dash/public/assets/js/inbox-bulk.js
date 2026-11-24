/* inbox-bulk.js: "Text many members" (store bulk SMS, ClickUp z8uq9mbreu), the screen the dash Inbox opens from its toolbar.
   Exposes window.NOInboxBulk { probe(D, site), screen(host, ui), util }. Routes (apps/inquiries store_bulk.py, contract
   store-bulk-sms-be-api-2026-11-23), all under /sites/{id}/inquiries/sms/bulk/: GET status/, POST audience/ {audience}, POST preview/ {text},
   POST test/ {text, idempotency_key}, POST batches/ {text, audience, idempotency_key, confirm, expected_count}, GET batches/,
   GET batches/{id}/, POST batches/{id}/stop/. Every one answers 404 while the feature is off: probe() then says null and the button stays hidden.
   Ruling D1 (Coach Ed, 2026-11-23): "All my members" is the first and default audience; there is NO consent nudge, warning or consent
   wording anywhere on this screen. The page never shows a list of numbers: only counts, and masked mobiles in a batch's recipients.
   The words the API sends (messages, reason_text, end_message, blocked_message) reach the page through textContent only. Plain ES5. */
(function (root) {
  "use strict";

  /* ---------- pure helpers ---------- */

  var AUDIENCES = [["all", "All my members"], ["pick", "Chosen groups and contacts"]];
  /* The plain labels for the groups left out of the count, in the order the API counts them. */
  var LEFT_OUT = [["unverified", "Mobile number not verified"], ["invalid_number", "Test number"], ["opted_out", "Asked for no more texts (STOP)"],
    ["duplicates", "Repeated number"]];
  var STATES = { waiting: "Waiting to start", sending: "Sending", finished: "Finished", stopped: "Stopped", ended: "Ended" };
  var RSTATES = { waiting: "Waiting", queued: "With your phone", sent: "Sent", failed: "Failed", not_sent: "Not sent" };
  var PAUSES = {
    outside_window: "Paused: it is outside sending hours (8:00 am to 8:00 pm, Manila time). It goes on at 8:00 am.",
    daily_cap: "Paused: today's limit is reached. It goes on tomorrow morning.",
    phone_offline: "Paused: your phone is offline. It goes on when your phone is back online."
  };
  var NO_LINE = "Pair your phone in Settings → SMS Gateway to text many members.";
  var PAGE = 50;

  function available(st) { return !!st && typeof st === "object" && st.available === true; }
  function num(n) { return typeof n === "number" && isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function audienceName(a) { for (var i = 0; i < AUDIENCES.length; i++) if (AUDIENCES[i][0] === a) return AUDIENCES[i][1]; return AUDIENCES[0][1]; }
  /* "Will send to 95 members". */
  function willSend(n, aud) { return "Will send to " + (aud === "pick" ? plural(num(n), "recipient", "recipients") : plural(num(n), "member", "members")); }
  /* The groups left out of a count, [label, n] for each non-zero one. */
  function leftOut(lo) {
    var out = [];
    if (!lo || typeof lo !== "object") return out;
    LEFT_OUT.forEach(function (p) { var n = num(lo[p[0]]); if (n > 0) out.push([p[1], n]); });
    return out;
  }
  /* Always 160 and only the typed text (no store-name prefix, even from old data); null when the payload has no usable max_length. */
  function maxOf(x) { return x && typeof x.max_length === "number" && isFinite(x.max_length) && x.max_length > 0 ? 160 : null; }
  /* The counter for the owner's words, the same "N / 160" as New SMS and replies. */
  function roomLeft(len, max) {
    if (max === null || max === undefined) return "";
    return len + " / " + max;
  }
  /* What is wrong with a text before the server sees it, or ""; the same plain-SMS and no-link rules as inbox-sms.js. The server decides. */
  function problem(text, max) {
    var S = root.NOInboxSms;
    return S && S.util && S.util.problem ? S.util.problem(text, max === undefined ? null : max) : "";
  }
  /* "About 34 minutes left" from the server's seconds_left (an estimate); "" when it is not active. */
  function estimate(sec) {
    var s = num(sec);
    if (s <= 0) return "";
    if (s < 60) return "Less than a minute left";
    var m = Math.round(s / 60);
    if (m < 60) return "About " + plural(m, "minute", "minutes") + " left";
    var hr = Math.floor(m / 60), rest = m % 60;
    return "About " + plural(hr, "hour", "hours") + (rest ? " " + plural(rest, "minute", "minutes") : "") + " left";
  }
  function active(b) { return !!b && (b.state === "waiting" || b.state === "sending"); }
  function pauseText(b) { return b && active(b) && PAUSES[b.paused_reason] ? PAUSES[b.paused_reason] : ""; }
  function stateText(s) { return STATES[s] || "Waiting to start"; }
  function recipientState(s) { return RSTATES[s] || "Waiting"; }
  /* The mobile shown for a recipient: the API sends it masked; anything that is not is masked here so a full number never reaches the page. */
  function maskMobile(m) {
    var s = typeof m === "string" ? m : "";
    if (!s) return "";
    if (s.indexOf("*") >= 0) return s;
    var d = s.replace(/[^0-9+]/g, "");
    return d.length > 8 ? d.slice(0, 6) + "***" + d.slice(-4) : "***";
  }
  /* The words for a 'blocked' status: the server's message, with a safe fallback. */
  function blockedText(st) {
    if (!st || !st.blocked) return "";
    if (typeof st.blocked_message === "string" && st.blocked_message) return st.blocked_message;
    return st.blocked === "no_line" ? NO_LINE : "Texting many members is not available right now.";
  }
  /* The words for a call that did not go: the server's message, a field message, or a plain fallback; never an error code. */
  function refusal(res, fallback) {
    var d = res && res.data, f = d && d.fields, first = f ? f[Object.keys(f)[0]] : null;
    if (d && typeof d.message === "string" && d.message) return d.message;
    if (typeof first === "string" && first) return first;
    if (Array.isArray(first) && typeof first[0] === "string" && first[0]) return first[0];
    if (res && res.status === 0) return "We could not reach the server. Please try again.";
    return fallback || "That did not work. Please try again.";
  }
  function when(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; }
  }
  function base(site) { return "/sites/" + site + "/inquiries/sms/bulk/"; }
  /* The ids of a pick (groups or contacts), for the audience and batch bodies. */
  function idsOf(list) { return list.map(function (x) { return x.id; }); }
  /* The contacts the picker offers (GET /sites/{id}/contacts/?q= results): { id, name, label (name and the MASKED mobile), optedOut }. A full number is never shown. */
  function contactItems(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (c) {
      if (!c || (typeof c.id !== "string" && typeof c.id !== "number") || c.id === "") return;
      var name = [c.first_name, c.last_name].map(function (x) { return typeof x === "string" ? x.trim() : ""; }).filter(Boolean).join(" ") || "Contact";
      var mob = maskMobile(c.mobile_masked);
      out.push({ id: c.id, name: name, label: mob ? name + " \u00B7 " + mob : name, optedOut: c.opted_out === true });
    });
    return out;
  }
  /* The groups the picker offers (GET /sites/{id}/contacts/groups/): { id, name, label (name and its count) }. */
  function groupItems(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (g) {
      if (!g || (typeof g.id !== "string" && typeof g.id !== "number") || g.id === "" || typeof g.name !== "string" || !g.name) return;
      out.push({ id: g.id, name: g.name, label: typeof g.count === "number" ? g.name + " (" + num(g.count) + ")" : g.name });
    });
    return out;
  }

  /* The button shows only when this answers a status with available:true. D.call: the host app's fetch. Resolves the status object, or null
     on a 404 (feature off), any error or a status that does not say available. */
  function probe(D, site) {
    return D.call("GET", base(site) + "status/", null, true).then(function (res) {
      return res && res.ok && available(res.data) ? res.data : null;
    }, function () { return null; });
  }

  /* ---------- the screen ---------- */

  /* The Bulk SMS tab (Coach Ed 2026-11-24, INBOX-FIX-7). Two views in the tab's own pane:
     "main": while a batch is sending, a progress card on top (the Site readiness card layout: title and state chip, a divider, rows) with Refresh and Stop sending;
             then the History card: a table (date, audience, sent / failed / not sent, status, message, a View button that opens the batch's details under its row),
             with a primary "Send Bulk SMS" button above the table, hidden while a batch is sending.
     "form": the compose form laid out like HQ's Bulk SMS page (the message and who gets it on the left, the rules on the right, then the check and confirm card).
     ui: { D, h, add, clear, btn, busy, icon, combo, newKey, site, say, gone() }. host: the tab's pane. */
  function screen(host, ui) {
    var D = ui.D, h = ui.h, add = ui.add, b0 = base(ui.site);
    var st = { view: "loading", status: null, audience: "all", pickG: [], pickC: [], groups: null, found: [], csrun: 0, ctimer: null, contactsOn: false, aud: null, audLoading: false, text: "", preview: null, prevErr: "",
      key: null, sure: false, sending: false, testing: false, testNote: "", err: "", note: "", timer: null, poll: null,
      hist: { items: [], next: null, loading: false, failed: false }, open: {}, dead: false, arun: 0, prun: 0 };

    function stop() { st.dead = true; if (st.timer) clearTimeout(st.timer); if (st.poll) clearTimeout(st.poll); if (st.ctimer) clearTimeout(st.ctimer); st.timer = st.poll = st.ctimer = null; }
    function gone() { stop(); ui.gone(); }
    function aliveRes(res) { return !st.dead && !(res && res.status === 401); }

    /* ----- reads ----- */
    function readStatus(then) {
      D.call("GET", b0 + "status/", null, true).then(function (res) {
        if (!aliveRes(res)) return;
        if (res.status === 404) { gone(); return; }
        if (!res.ok || !res.data || typeof res.data !== "object" || res.data.available !== true) { if (st.view === "loading") st.view = "failed"; draw(); return; }
        st.status = res.data;
        if (st.view === "loading" || st.view === "failed") st.view = "main";
        if (then) then(); else draw();
        schedulePoll();
        if (st.view === "form" && !active(st.status.active_batch) && !blockedText(st.status) && !st.aud && !st.audLoading) readAudience();
      });
    }
    /* While a batch is active the status is read again every 5 seconds (the progress card); the Refresh button reads it at once. */
    function schedulePoll() {
      if (st.poll) { clearTimeout(st.poll); st.poll = null; }
      if (st.dead || !st.status || !active(st.status.active_batch)) return;
      st.poll = setTimeout(function () {
        st.poll = null;
        var was = st.status && st.status.active_batch;
        D.call("GET", b0 + "status/", null, true).then(function (res) {
          if (!aliveRes(res)) return;
          if (res.status === 404) { gone(); return; }
          if (res.ok && res.data && res.data.available === true) {
            st.status = res.data;
            if (was && !active(res.data.active_batch)) { st.note = "Your last batch is done. See how it went in the history below."; st.aud = null; loadHistory(null, true); }
            if (st.view === "main" || st.view === "form") draw();
          }
          schedulePoll();
        });
      }, 5000);
    }
    function picked() { return st.pickG.length + st.pickC.length > 0; }
    /* The audience body: all, or the chosen groups and contacts (ids only). */
    function audBody() { return st.audience === "pick" ? { audience: "pick", groups: idsOf(st.pickG), contacts: idsOf(st.pickC) } : { audience: "all" }; }
    function readAudience() {
      var run = ++st.arun;
      st.aud = null;
      /* nothing picked: no count, nothing to ask */
      if (st.audience === "pick" && !picked()) { st.audLoading = false; drawCount(); return; }
      st.audLoading = true; drawCount();
      D.call("POST", b0 + "audience/", audBody(), true).then(function (res) {
        if (!aliveRes(res) || run !== st.arun) return;
        st.audLoading = false;
        if (res.status === 404) { gone(); return; }
        st.aud = res.ok && res.data && typeof res.data === "object" ? res.data : { failed: true };
        if (document.getElementById("ib-bk-count")) drawCount(); else draw(); /* the form is left as it is, so a dropdown stays open */
      });
    }
    /* Contacts are offered only while GET /sites/{id}/contacts/status/ answers; a 404 (STORE_CONTACTS_ENABLED off) or any error hides the option. */
    function readContacts() {
      D.call("GET", "/sites/" + ui.site + "/contacts/status/", null, true).then(function (res) {
        if (st.dead || !(res && res.ok && res.data && res.data.contacts === true)) return;
        st.contactsOn = true; if (st.view === "form") draw();
      });
    }
    function readGroups() {
      if (st.groups) return;
      st.groups = { list: [], loading: true, failed: false };
      var g0 = st.groups;
      D.call("GET", "/sites/" + ui.site + "/contacts/groups/", null, true).then(function (res) {
        if (st.dead || st.groups !== g0) return;
        g0.loading = false;
        if (res && res.ok && res.data) g0.list = groupItems(Array.isArray(res.data) ? res.data : res.data.results || res.data.items); else g0.failed = true;
        var sel = document.getElementById("ib-bk-gsel"); if (sel) { fillGroups(sel); if (sel.ibRedraw) sel.ibRedraw(); }
      });
    }
    /* The contact search: at least two characters, 300 ms after the last key, only the newest answer is used. */
    function searchContacts(raw) {
      if (st.ctimer) clearTimeout(st.ctimer);
      var q = String(raw || "").trim(), run = ++st.csrun, sel = document.getElementById("ib-bk-csel");
      if (q.length < 2) { st.found = []; if (sel) { fillContacts(sel); sel.ibRedraw(); } return; }
      st.ctimer = setTimeout(function () {
        st.ctimer = null;
        D.call("GET", "/sites/" + ui.site + "/contacts/?q=" + encodeURIComponent(q), null, true).then(function (res) {
          if (st.dead || run !== st.csrun || (res && res.status === 401)) return;
          st.found = res && res.ok && res.data ? contactItems(res.data.results) : [];
          var s2 = document.getElementById("ib-bk-csel"); if (s2) { fillContacts(s2); s2.ibRedraw(); }
        });
      }, 300);
    }
    function fillGroups(sel) {
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      sel.appendChild(D.el("option", { value: "" }, "Choose a group"));
      ((st.groups && st.groups.list) || []).forEach(function (g) {
        if (!st.pickG.some(function (x) { return x.id === g.id; })) sel.appendChild(D.el("option", { value: String(g.id) }, g.label));
      });
      sel.value = "";
    }
    function fillContacts(sel) {
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      sel.appendChild(D.el("option", { value: "" }, "Search a contact by name or number"));
      st.found.forEach(function (c) {
        if (st.pickC.some(function (x) { return x.id === c.id; })) return;
        var o = D.el("option", { value: String(c.id) }, c.label); if (c.optedOut) o.setAttribute("data-tag", "No texts"); sel.appendChild(o);
      });
      sel.value = "";
    }
    /* The picks changed: show the chips, ask for the count again (the newest answer wins) and ask for a new tick. */
    function pickChanged() {
      st.sure = false; st.key = null; st.err = "";
      drawChips(); readAudience(); fieldErr();
    }
    function drawChips() {
      [["ib-bk-gchips", st.pickG, "group"], ["ib-bk-cchips", st.pickC, "contact"]].forEach(function (t) {
        var box = document.getElementById(t[0]); if (!box) return;
        ui.clear(box);
        t[1].forEach(function (it) {
          var chip = h("span", "ib-bk-pchip"); chip.appendChild(h("span", "", it.label || it.name));
          var x = h("button", "ib-bk-pchip-x", "\u00D7"); x.setAttribute("type", "button"); x.setAttribute("aria-label", "Remove " + (it.name || "this " + t[2]));
          x.addEventListener("click", function () {
            var arr = t[1]; arr.splice(arr.indexOf(it), 1);
            var gs = document.getElementById("ib-bk-gsel"), cs = document.getElementById("ib-bk-csel");
            if (gs) fillGroups(gs); if (cs) fillContacts(cs);
            pickChanged();
          });
          chip.appendChild(x); box.appendChild(chip);
        });
      });
    }
    /* The preview and its inline error: 400 ms after the last key. A 422 (a web link, a character, too long) shows on the field. */
    function schedulePreview() {
      if (st.timer) clearTimeout(st.timer);
      st.timer = setTimeout(function () {
        st.timer = null;
        var t = st.text.trim(), run = ++st.prun;
        if (!t) { st.preview = null; st.prevErr = ""; drawPreview(); return; }
        D.call("POST", b0 + "preview/", { text: t }, true).then(function (res) {
          if (!aliveRes(res) || run !== st.prun) return;
          if (res.status === 404) { gone(); return; }
          if (res.ok && res.data && typeof res.data.text === "string") { st.preview = res.data; st.prevErr = ""; }
          else { st.preview = null; st.prevErr = refusal(res, "This text cannot be sent."); }
          drawPreview();
        });
      }, 400);
    }

    /* ----- pieces ----- */
    function note(text, warn) {
      var n = h("p", "ib-note" + (warn ? "" : " ib-note-info")); n.setAttribute("role", "status");
      n.appendChild(ui.icon(warn ? "M12 3l10 18H2zM12 10v5M12 18h.01" : "M4 5h16v11H9l-5 4z")); n.appendChild(h("span", "", text));
      return n;
    }
    function lines(b) {
      var out = h("div", "ib-bk-lines");
      if (b.text) out.appendChild(h("p", "ib-bk-text", b.text));
      var lo = leftOut(b.left_out);
      if (lo.length) {
        var ul = h("ul", "ib-bk-left");
        lo.forEach(function (p) { ul.appendChild(h("li", "", p[0] + ": " + p[1])); });
        out.appendChild(h("p", "pm-hint", "Left out of this batch:")); out.appendChild(ul);
      }
      return out;
    }
    /* A dash card: the title (and an optional chip or button at its right), a divider, then the body. */
    function dcard(id, title, side) {
      var c = h("section", "dash-card ib-bk-dc"); c.setAttribute("aria-labelledby", id);
      var t = h("h2", "", title); t.setAttribute("id", id);
      c.appendChild(add(h("div", "ib-bk-dh"), t, side || null));
      return c;
    }
    function costLine(s) { return typeof s.cost_note === "string" && s.cost_note ? h("p", "pm-hint ib-bk-cost", s.cost_note) : h("span", ""); }

    /* ----- drawing ----- */
    function draw() {
      if (st.dead) return;
      ui.clear(host); host.classList.remove("is-hide-phone"); host.setAttribute("aria-label", "Bulk SMS");
      var body = h("div", "ib-bk ib-bk-page"); body.setAttribute("tabindex", "-1"); host.appendChild(body);
      if (st.view === "loading") { body.appendChild(h("p", "pm-meta ib-loading", "Opening…")); return; }
      if (st.view === "failed") {
        body.appendChild(h("p", "pm-meta", "We could not open this screen just now. Nothing was sent."));
        body.appendChild(ui.btn("Try again", "primary", function (b) { ui.busy(b, true); st.view = "loading"; readStatus(); }));
        return;
      }
      if (st.view === "form" && !active(st.status.active_batch)) { drawForm(body); return; }
      st.view = "main";
      drawMain(body);
    }
    function drawMain(body) {
      var s = st.status, running = active(s.active_batch);
      if (st.note) body.appendChild(note(st.note, false));
      var blocked = blockedText(s);
      if (blocked) {
        body.appendChild(note(blocked, true));
        if (s.blocked === "no_line") { var l = h("a", "no-btn no-btn-ghost", "Open SMS Settings"); l.setAttribute("href", "/sms/settings/"); l.setAttribute("id", "ib-bk-gw"); body.appendChild(l); }
      }
      if (running) { body.appendChild(progressCard(s.active_batch)); body.appendChild(costLine(s)); }
      /* the History card; its Send Bulk SMS button is hidden while a batch is sending (and while the line is blocked) */
      var side = null;
      if (!running && !blocked) { side = ui.btn("Send Bulk SMS", "primary", function () { openForm(); }); side.setAttribute("id", "ib-bk-send"); }
      /* B1-B3: no outer card; the title and the button sit above the table, in one row; only the table box is the card */
      var card = h("section", "ib-bk-dc ib-bk-histsec"); card.setAttribute("aria-labelledby", "ib-bk-h-hist");
      var ht = h("h2", "", "Bulk SMS history"); ht.setAttribute("id", "ib-bk-h-hist");
      card.appendChild(add(h("div", "ib-bk-dh"), ht, side || null));
      card.setAttribute("id", "ib-bk-hist");
      body.appendChild(card);
      drawHistory(card, running ? s.active_batch.id : "");
    }

    /* The progress card (the Site readiness card layout): the title and the state chip, a divider, the rows. Refresh instead of View; Stop sending kept. */
    function progressCard(b) {
      var chip = h("span", "ib-bk-chip is-" + (b.state || "waiting"), stateText(b.state));
      var card = dcard("ib-bk-h-run", "Sending now", chip); card.classList.add("ib-bk-run"); card.setAttribute("id", "ib-bk-progress");
      var total = num(b.size), done = num(b.sent) + num(b.failed) + num(b.not_sent);
      var bar = h("div", "ib-bk-bar2"); bar.setAttribute("role", "progressbar"); bar.setAttribute("aria-valuemin", "0"); bar.setAttribute("aria-valuemax", String(total));
      bar.setAttribute("aria-valuenow", String(Math.min(done, total))); bar.setAttribute("aria-label", "Texts handled so far");
      var fill = h("span", ""); fill.setAttribute("style", "width:" + (total ? Math.min(100, Math.round(done / total * 100)) : 0) + "%"); bar.appendChild(fill);
      card.appendChild(bar);
      var p = pauseText(b); if (p) { var pn = note(p, true); pn.setAttribute("id", "ib-bk-pause"); card.appendChild(pn); }
      var e = estimate(b.seconds_left); if (e) card.appendChild(h("p", "dash-copy ib-bk-est", e));
      var rows = h("ul", "ib-bk-rows");
      [["Sent", num(b.sent) + " of " + total, "ok"], ["Failed", num(b.failed) + " of " + total, num(b.failed) ? "warn" : ""], ["Not sent", num(b.not_sent) + " of " + total, num(b.not_sent) ? "warn" : ""],
        ["Waiting", String(num(b.waiting)), ""], ["Started", when(b.created_at), ""], ["Who gets it", audienceName(b.audience), ""]].forEach(function (r) {
        if (!r[1]) return;
        var li = h("li", ""); li.appendChild(h("span", "", r[0]));
        li.appendChild(h("span", "ib-bk-v" + (r[2] ? " is-" + r[2] : ""), r[1])); rows.appendChild(li);
      });
      card.appendChild(rows);
      card.appendChild(lines({ text: b.text, left_out: b.left_out }));
      var err = h("p", "field-err", st.err); err.setAttribute("role", "alert"); err.hidden = !st.err; card.appendChild(err);
      var rf = ui.btn("Refresh", "ghost", function (x) { refreshNow(x); }, "M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"); rf.setAttribute("id", "ib-bk-refresh");
      var stopBtn = ui.btn("Stop sending", "ghost", function (x) { stopBatch(b, x); }); stopBtn.setAttribute("id", "ib-bk-stop");
      card.appendChild(add(h("div", "ib-bk-foot"), rf, stopBtn));
      return card;
    }
    function refreshNow(x) {
      ui.busy(x, true);
      var was = st.status && st.status.active_batch;
      D.call("GET", b0 + "status/", null, true).then(function (res) {
        if (!aliveRes(res)) return;
        if (res.status === 404) { gone(); return; }
        if (res.ok && res.data && res.data.available === true) {
          st.status = res.data;
          if (was && !active(res.data.active_batch)) { st.note = "Your last batch is done. See how it went in the history below."; st.aud = null; }
          loadHistory(null, true); draw(); schedulePoll(); return;
        }
        ui.busy(x, false);
      });
    }
    function stopBatch(b, x) {
      ui.busy(x, true); st.err = "";
      D.call("POST", b0 + "batches/" + encodeURIComponent(b.id) + "/stop/", null, true).then(function (res) {
        if (!aliveRes(res)) return;
        if (res.status === 404) { gone(); return; }
        if (!res.ok) { st.err = refusal(res, "We could not stop it. Please try again."); /* not_running: it ended on its own; read again */ if (res.status === 409) { st.aud = null; readStatus(); return; } draw(); return; }
        ui.say("Sending stopped.");
        st.note = "Sending was stopped. Texts already with your phone may still go out."; st.aud = null;
        st.status.active_batch = null; readStatus(); loadHistory(null, true);
      });
    }

    /* ----- the compose form (HQ's Bulk SMS layout: the form and the rules side by side, then Check and confirm) ----- */
    function openForm() { st.view = "form"; st.err = ""; st.note = ""; st.aud = null; st.audience = "all"; st.pickG = []; st.pickC = []; st.found = []; draw(); readAudience(); }
    function closeForm() { st.view = "main"; st.err = ""; draw(); }
    function drawForm(body) {
      var s = st.status;
      var cols = h("div", "ib-bk-cols");
      var main = h("div", "ib-bk-colmain"), aside = h("div", "ib-bk-aside");
      var blocked = blockedText(s);
      if (blocked) {
        main.appendChild(note(blocked, true));
        if (s.blocked === "no_line") { var l = h("a", "no-btn no-btn-ghost", "Open SMS Settings"); l.setAttribute("href", "/sms/settings/"); l.setAttribute("id", "ib-bk-gw"); main.appendChild(l); }
        main.appendChild(ui.btn("Back to history", "ghost", function () { closeForm(); }));
        cols.appendChild(main); body.appendChild(cols); return;
      }
      if (s.phone_online === false) main.appendChild(note("Your texting phone is offline. Texts wait until it is back online.", true));
      var card = dcard("ib-bk-h-new", "New batch: write the text and choose who gets it"); card.classList.add("ib-bk-formcard");
      card.appendChild(form(s));
      main.appendChild(card);
      var c2 = dcard("ib-bk-h-chk", "Check and confirm"); c2.classList.add("ib-bk-formcard");
      var cnt = h("div", "ib-bk-box"); cnt.setAttribute("id", "ib-bk-count"); cnt.setAttribute("aria-live", "polite"); c2.appendChild(cnt);
      var pv = h("div", "ib-bk-box"); pv.setAttribute("id", "ib-bk-preview"); c2.appendChild(pv);
      var t = ui.btn("Send a test to my phone", "ghost", function (x) { sendTest(x); }); t.setAttribute("id", "ib-bk-test");
      var tn = h("p", "pm-hint", ""); tn.setAttribute("id", "ib-bk-testnote"); tn.setAttribute("role", "status");
      c2.appendChild(t); c2.appendChild(tn);
      var cf = h("div", "ib-bk-confirm"); cf.setAttribute("id", "ib-bk-confirm"); c2.appendChild(cf);
      main.appendChild(c2); main.appendChild(costLine(s));
      var rules = h("section", "dash-card ib-bk-rules"); rules.setAttribute("aria-labelledby", "ib-bk-h-rules");
      var rh = h("h2", "", "How bulk sending works"); rh.setAttribute("id", "ib-bk-h-rules"); rules.appendChild(rh);
      var ul = h("ul", "ib-bk-left");
      ["One text for every member, sent from your own phone.", "No web links.", "Members who replied STOP are skipped.", "Sending runs from 8:00 am to 8:00 pm, Manila time.",
        typeof s.left_today === "number" && typeof s.daily_limit === "number" ? "Bulk texts left today: " + num(s.left_today) + " of " + num(s.daily_limit) + "." : ""].forEach(function (t2) { if (t2) ul.appendChild(h("li", "", t2)); });
      rules.appendChild(ul); aside.appendChild(rules);
      add(cols, main, aside); body.appendChild(cols);
      drawChips(); drawCount(); drawPreview(); drawConfirm();
    }
    function form(s) {
      var wrap = h("div", "ib-bk-form");
      /* the text */
      var max = maxOf(s);
      var f3 = h("div", "pm-field");
      var l3 = h("label", "pm-label", "Message"); l3.setAttribute("for", "ib-bk-t"); f3.appendChild(l3);
      var ta = h("textarea", "pm-input ib-ta"); ta.setAttribute("id", "ib-bk-t"); ta.setAttribute("rows", "4"); ta.setAttribute("aria-describedby", "ib-bk-c ib-bk-e");
      if (max !== null) ta.setAttribute("maxlength", String(max + 40));
      ta.value = st.text; f3.appendChild(ta); wrap.appendChild(f3);
      var count = h("span", "ib-count" + (max !== null && st.text.length > max ? " is-over" : ""), roomLeft(st.text.length, max)); count.setAttribute("id", "ib-bk-c");
      var err = h("p", "field-err", ""); err.setAttribute("id", "ib-bk-e"); err.setAttribute("role", "alert"); err.hidden = true;
      wrap.appendChild(err);
      wrap.appendChild(add(h("div", "ib-rfoot"), h("span", "pm-hint", "One text for every number. One SMS of plain characters. No web links."), count));
      ta.addEventListener("input", function () {
        st.text = ta.value; st.err = ""; st.testNote = ""; st.sure = false; st.key = null; st.preview = null; st.prevErr = "";
        count.textContent = roomLeft(ta.value.length, max); count.classList.toggle("is-over", max !== null && ta.value.length > max);
        fieldErr(); drawPreview(); drawConfirm(); schedulePreview();
      });
      /* audience: "All my members" first and the default (Coach Ed's ruling D1); "Chosen groups and contacts" only while contacts are on */
      var fs = h("fieldset", "ib-bk-sendto"); fs.appendChild(h("legend", "pm-label", "Send to"));
      var pickBox = h("div", "ib-bk-pick"); pickBox.setAttribute("id", "ib-bk-pick"); pickBox.hidden = st.audience !== "pick";
      AUDIENCES.forEach(function (a) {
        if (a[0] === "pick" && !st.contactsOn) return;
        var opt = h("label", "ib-bk-opt"), r = D.el("input", { type: "radio", name: "ib-bk-to", id: "ib-bk-to-" + a[0], value: a[0] });
        if (st.audience === a[0]) { r.checked = true; r.setAttribute("checked", "checked"); }
        r.addEventListener("change", function () {
          if (!r.checked || st.audience === a[0]) return;
          st.audience = a[0]; st.sure = false; st.key = null; st.err = "";
          pickBox.hidden = a[0] !== "pick";
          if (a[0] === "pick") readGroups();
          readAudience(); fieldErr();
        });
        add(opt, r, h("span", "", a[1]));
        fs.appendChild(opt);
      });
      if (st.contactsOn) {
        var gf = h("div", "pm-field"), gl = h("label", "pm-label", "Groups"); gl.setAttribute("for", "ib-bk-gsel");
        var gsel = D.el("select", { "class": "ib-input", id: "ib-bk-gsel" });
        fillGroups(gsel); var gch = h("div", "ib-bk-chips"); gch.setAttribute("id", "ib-bk-gchips"); add(gf, gl, gsel, gch);
        var cf = h("div", "pm-field"), cl = h("label", "pm-label", "Contacts"); cl.setAttribute("for", "ib-bk-csel");
        var csel = D.el("select", { "class": "ib-input", id: "ib-bk-csel" });
        fillContacts(csel); var cch = h("div", "ib-bk-chips"); cch.setAttribute("id", "ib-bk-cchips"); add(cf, cl, csel, cch);
        add(pickBox, gf, cf); fs.appendChild(pickBox); wrap.appendChild(fs);
        gsel.addEventListener("change", function () {
          var g = ((st.groups && st.groups.list) || []).filter(function (x) { return String(x.id) === gsel.value; })[0];
          if (!g) return;
          st.pickG.push(g); fillGroups(gsel); if (gsel.ibSync) gsel.ibSync(); pickChanged();
        });
        csel.addEventListener("change", function () {
          var c = st.found.filter(function (x) { return String(x.id) === csel.value; })[0];
          if (!c) return;
          st.pickC.push(c); fillContacts(csel); if (csel.ibSync) csel.ibSync(); pickChanged();
        });
        ui.combo(gsel, "Group", { blankEmpty: true });
        ui.combo(csel, "Contact", { blankEmpty: true, remote: function (q) { searchContacts(q); }, emptyText: function (q) { return String(q || "").trim().length < 2 ? "Type at least 2 letters of a name or number" : "No contacts found."; } });
        drawChips();
        if (st.audience === "pick") readGroups();
      } else wrap.appendChild(fs);
      var foot = h("div", "ib-bk-formfoot"); foot.appendChild(h("span", "pm-hint", "Nothing is sent at this step."));
      var cancel = ui.btn("Cancel", "ghost", function () { closeForm(); }); cancel.setAttribute("id", "ib-bk-cancel"); foot.appendChild(cancel);
      wrap.appendChild(foot);
      return wrap;
    }
    function textProblem() {
      var s = st.status, max = s ? maxOf(s) : null;
      return problem(st.text, max) || st.prevErr;
    }
    function fieldErr() {
      var e = document.getElementById("ib-bk-e"); if (!e) return;
      var p = st.err || textProblem(); e.textContent = p; e.hidden = !p;
    }
    function textOk() { return !!st.text.trim() && !textProblem(); }

    function drawCount() {
      var box = document.getElementById("ib-bk-count"); if (!box) return;
      ui.clear(box);
      if (st.audience === "pick" && !picked()) { box.appendChild(h("p", "pm-meta", "Choose at least one group or contact to see who gets it.")); drawConfirm(); return; }
      if (st.audLoading || !st.aud) { box.appendChild(h("p", "pm-meta", "Counting members…")); return; }
      if (st.aud.failed) { box.appendChild(h("p", "pm-meta", "We could not count your members just now.")); box.appendChild(ui.btn("Try again", "ghost", function () { readAudience(); })); return; }
      var n = num(st.aud.will_send);
      box.appendChild(h("p", "ib-bk-will", willSend(n, st.audience)));
      var lo = leftOut(st.aud.left_out);
      if (lo.length) {
        box.appendChild(h("p", "pm-hint", "Left out:"));
        var ul = h("ul", "ib-bk-left");
        lo.forEach(function (p) { ul.appendChild(h("li", "", p[0] + ": " + p[1])); });
        box.appendChild(ul);
      } else if (n === 0) box.appendChild(h("p", "pm-hint", "No members can be texted yet."));
      drawConfirm();
    }
    function drawPreview() {
      var box = document.getElementById("ib-bk-preview"); if (!box) return;
      ui.clear(box); fieldErr();
      if (st.preview) {
        box.appendChild(h("p", "pm-hint", "This is exactly how it will arrive:"));
        box.appendChild(h("p", "ib-bk-text", st.preview.text));
      }
      var tb = document.getElementById("ib-bk-test"); if (tb) tb.disabled = !textOk() || st.testing || !st.preview;
      drawConfirm();
    }
    function drawConfirm() {
      var box = document.getElementById("ib-bk-confirm"); if (!box) return;
      ui.clear(box);
      var n = st.aud && !st.aud.failed ? num(st.aud.will_send) : 0;
      if (!n || !textOk() || !st.preview) return;
      var tick = h("label", "ib-bk-tick"), c = D.el("input", { type: "checkbox", id: "ib-bk-sure" }); c.checked = st.sure;
      add(tick, c, h("span", "", "Send to " + (st.audience === "pick" ? plural(n, "recipient", "recipients") : plural(n, "member", "members")) + " from your phone?"));
      var go = ui.btn("Start sending", "primary", function (x) { confirmSend(x, n); }); go.setAttribute("id", "ib-bk-go"); go.disabled = !st.sure || st.sending;
      c.addEventListener("change", function () { st.sure = !!c.checked; go.disabled = !st.sure || st.sending; });
      box.appendChild(tick); box.appendChild(go);
    }
    function sendTest(x) {
      if (st.testing || !textOk()) return;
      st.testing = true; st.testNote = ""; ui.busy(x, true);
      D.call("POST", b0 + "test/", { text: st.text.trim(), idempotency_key: ui.newKey() }, true).then(function (res) {
        st.testing = false;
        if (!aliveRes(res)) return;
        if (res.status === 404) { gone(); return; }
        var tn = document.getElementById("ib-bk-testnote"), tb = document.getElementById("ib-bk-test");
        if (tb) ui.busy(tb, false);
        var msg = res.ok ? "A test text is on its way to your phone. It counts as one of today's texts." : refusal(res, "The test text could not be sent.");
        st.testNote = msg; if (tn) tn.textContent = msg;
        if (res.ok) ui.say("Test text is on its way.");
      });
    }
    function confirmSend(x, n) {
      if (st.sending || !st.sure) return;
      var key = st.key || ui.newKey(); st.key = key; st.sending = true; st.err = ""; ui.busy(x, true);
      D.call("POST", b0 + "batches/", Object.assign(audBody(), { text: st.text.trim(), idempotency_key: key, confirm: true, expected_count: n }), true).then(function (res) {
        st.sending = false;
        if (!aliveRes(res)) return;
        if (res.status === 404) { gone(); return; }
        if (!res.ok) {
          if (res.status !== 0) st.key = null; /* a lost answer keeps the key so nothing is sent twice */
          st.sure = false;
          var code = res.data && res.data.code;
          /* The count moved since the owner looked (D.call keeps only the code and the message): say so, read it again, ask for a new tick. */
          if (res.status === 409 && code === "audience_changed") { st.err = refusal(res, "Your member count changed. Check the new count and send again."); readAudience(); fieldErr(); return; }
          if (res.status === 409) { st.err = refusal(res); st.view = "main"; readStatus(); return; }
          st.err = refusal(res, "The batch could not be started."); draw(); fieldErr(); return;
        }
        st.key = null; st.sure = false; st.text = ""; st.preview = null; st.prevErr = ""; st.testNote = ""; st.note = ""; st.aud = null;
        st.status.active_batch = res.data; st.view = "main";
        ui.say("Sending started.");
        draw(); schedulePoll(); loadHistory(null, true);
      });
    }

    /* ----- history: the table and the details that open under a row ----- */
    function loadHistory(cursor, reset) {
      if (reset) st.hist = { items: [], next: null, loading: true, failed: false };
      var h0 = st.hist; h0.loading = true; h0.failed = false;
      D.call("GET", b0 + "batches/?limit=20" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""), null, true).then(function (res) {
        if (!aliveRes(res) || st.hist !== h0) return;
        if (res.status === 404) { gone(); return; }
        h0.loading = false;
        if (!res.ok || !res.data) h0.failed = true;
        else { h0.items = h0.items.concat(Array.isArray(res.data.items) ? res.data.items : []); h0.next = res.data.next_cursor || null; }
        if (st.view === "main") draw();
      });
    }
    function drawHistory(card, hideId) {
      var hs = st.hist;
      var items = hs.items.filter(function (b) { return !hideId || b.id !== hideId; }); /* the running batch has its own card above */
      if (hs.failed && !hs.items.length) { card.appendChild(h("p", "pm-meta", "We could not load your batches just now.")); card.appendChild(ui.btn("Try again", "primary", function () { loadHistory(null, true); draw(); })); return; }
      if (hs.loading && !hs.items.length) { card.appendChild(h("p", "pm-meta ib-loading", "Loading…")); return; }
      if (!items.length) { card.appendChild(h("p", "pm-meta", "No batches yet.")); return; }
      var box = h("div", "ib-bk-tbox"), tbl = h("table", "ib-bk-table");
      var head = h("tr", "");
      ["Date", "Audience", "Sent / Failed / Not sent", "Status", "Message", ""].forEach(function (t, i) { var th = h("th", i === 5 ? "ib-bk-th-act" : "", t); th.setAttribute("scope", "col"); if (i === 5) th.appendChild(h("span", "bl-sr", "Details")); head.appendChild(th); });
      tbl.appendChild(add(h("thead", ""), head));
      var tb = h("tbody", "");
      items.forEach(function (b) {
        var open = !!st.open[b.id], tr = h("tr", "ib-bk-tr" + (open ? " is-open" : ""));
        tr.appendChild(h("td", "ib-bk-when", when(b.created_at)));
        tr.appendChild(h("td", "", audienceName(b.audience)));
        tr.appendChild(h("td", "ib-bk-nums", num(b.sent) + " / " + num(b.failed) + " / " + num(b.not_sent)));
        var sc = h("td", ""); sc.appendChild(h("span", "ib-bk-chip is-" + (b.state || "waiting"), stateText(b.state))); tr.appendChild(sc);
        tr.appendChild(h("td", "ib-bk-rtext", b.text || ""));
        var ac = h("td", "ib-bk-act"), v = ui.btn(open ? "Hide" : "View", "ghost", function () { toggle(b); });
        v.classList.add("ib-bk-view"); v.setAttribute("aria-expanded", open ? "true" : "false"); v.setAttribute("aria-controls", "ib-bk-d-" + b.id); v.setAttribute("data-batch", b.id);
        ac.appendChild(v); tr.appendChild(ac); tb.appendChild(tr);
        if (open) {
          var dr = h("tr", "ib-bk-dr"), td = h("td", ""); td.setAttribute("colspan", "6"); td.setAttribute("id", "ib-bk-d-" + b.id);
          var dw = h("div", "ib-bk-dwrap"); drawDetail(dw, st.open[b.id]); td.appendChild(dw); dr.appendChild(td); tb.appendChild(dr);
        }
      });
      tbl.appendChild(tb); box.appendChild(tbl); card.appendChild(box);
      if (hs.next) card.appendChild(ui.btn("Show more", "ghost", function (x) { ui.busy(x, true); loadHistory(hs.next, false); }));
      else if (hs.failed) card.appendChild(h("p", "pm-meta", "We could not load more."));
    }
    function toggle(b) {
      if (st.open[b.id]) { delete st.open[b.id]; draw(); return; }
      st.open[b.id] = { batch: b, results: [], next: null, loading: true, failed: false };
      draw(); loadDetail(b.id, null);
    }
    function loadDetail(id, cursor) {
      var d0 = st.open[id]; if (!d0) return;
      d0.loading = true; d0.failed = false;
      D.call("GET", b0 + "batches/" + encodeURIComponent(id) + "/?limit=" + PAGE + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""), null, true).then(function (res) {
        if (!aliveRes(res) || st.open[id] !== d0) return;
        if (res.status === 404) { gone(); return; }
        d0.loading = false;
        if (!res.ok || !res.data) d0.failed = true;
        else { d0.batch = res.data; d0.results = d0.results.concat(Array.isArray(res.data.results) ? res.data.results : []); d0.next = res.data.next || null; }
        if (st.view === "main") draw();
      });
    }
    /* B4: a flat inline detail under the row (no card, no tiles): the state and date as a small header, one stat line, the end reason as a plain
       icon + text line, the message, the left-out reasons as a short inline list. */
    function drawDetail(td, d0) {
      var b = d0.batch, box = h("div", "ib-bk-flat");
      var hd = h("p", "ib-bk-fh"); hd.appendChild(h("strong", "", stateText(b.state))); hd.appendChild(h("span", "ib-bk-fd", when(b.created_at)));
      box.appendChild(hd);
      box.appendChild(h("p", "ib-bk-stat", [["Sent", b.sent], ["Failed", b.failed], ["Not sent", b.not_sent], ["Waiting", b.waiting]].map(function (p) { return p[0] + " " + num(p[1]); }).join(" \u00B7 ")));
      if (typeof b.end_message === "string" && b.end_message) {
        var em = h("p", "ib-bk-endl"); em.appendChild(ui.icon("M12 3l10 18H2zM12 10v5M12 18h.01")); em.appendChild(h("span", "", b.end_message)); box.appendChild(em);
      }
      if (b.text) box.appendChild(h("p", "ib-bk-text", b.text));
      var lo = leftOut(b.left_out);
      if (lo.length) {
        var ul = h("ul", "ib-bk-lo"); ul.appendChild(h("li", "ib-bk-lo-t", "Left out:"));
        lo.forEach(function (p) { ul.appendChild(h("li", "", p[0] + ": " + p[1])); });
        box.appendChild(ul);
      }
      td.appendChild(box);
      if (d0.failed && !d0.results.length) { td.appendChild(h("p", "pm-meta", "We could not load the recipients just now.")); td.appendChild(ui.btn("Try again", "ghost", function () { loadDetail(b.id, null); draw(); })); return; }
      if (d0.loading && !d0.results.length) { td.appendChild(h("p", "pm-meta ib-loading", "Loading…")); return; }
      var ul = h("ul", "ib-bk-rec");
      d0.results.forEach(function (r) {
        var li = h("li", "ib-bk-recrow");
        var l = h("span", "ib-bk-recwho"); l.appendChild(h("strong", "", typeof r.name === "string" && r.name ? r.name : "Member")); l.appendChild(h("span", "ib-bk-mob", maskMobile(r.mobile)));
        var s = h("span", "ib-bk-recst"); s.appendChild(h("span", "ib-bk-chip is-r-" + (r.state || "waiting"), recipientState(r.state)));
        if (typeof r.reason_text === "string" && r.reason_text) s.appendChild(h("span", "ib-bk-reason", r.reason_text));
        add(li, l, s); ul.appendChild(li);
      });
      td.appendChild(ul);
      if (d0.next) td.appendChild(ui.btn("Show more", "ghost", function (x) { ui.busy(x, true); loadDetail(b.id, d0.next); }));
    }

    readContacts(); loadHistory(null, true); readStatus(); /* the Bulk SMS tab: the status (a running batch's card) and the history table */
    return { stop: stop };
  }

  root.NOInboxBulk = { probe: probe, screen: screen,
    util: { available: available, audienceName: audienceName, willSend: willSend, leftOut: leftOut, maxOf: maxOf, roomLeft: roomLeft, problem: problem,
      estimate: estimate, active: active, pauseText: pauseText, stateText: stateText, recipientState: recipientState, maskMobile: maskMobile, blockedText: blockedText,
      contactItems: contactItems, groupItems: groupItems, refusal: refusal, AUDIENCES: AUDIENCES, LEFT_OUT: LEFT_OUT, NO_LINE: NO_LINE, PAGE: PAGE } };
})(typeof window !== "undefined" ? window : globalThis);
