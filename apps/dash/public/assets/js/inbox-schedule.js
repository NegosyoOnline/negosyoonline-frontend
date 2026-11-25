/* inbox-schedule.js: the "Schedule SMS" tab of SMS Marketing (INBOX-FIX-9, round 9, Coach Ed 2026-11-24: "put another menu for Schedule SMS").
   Exposes window.NOInboxSchedule { screen(host, ui), util }. It reuses the helpers of inbox-bulk.js (window.NOInboxBulk.util), which loads first,
   and the same house parts (combo, btn, icon). Routes (HQ's schedule-sms-api-r9), all under /sites/{id}/inquiries/sms/bulk/:
   GET status/, POST audience/ {audience, groups, contacts}, POST preview/ {text}, POST test/ {text, idempotency_key},
   POST scheduled/ {text, audience, groups?, contacts?, scheduled_at, idempotency_key}, GET scheduled/?cursor=&limit=, GET scheduled/{id}/,
   PATCH scheduled/{id}/ {text, audience, groups?, contacts?, scheduled_at}, POST scheduled/{id}/cancel/. The server decides every rule
   (422 too_soon / outside_window / too_far, 409 schedule_limit / empty_audience / already_started); the hints here only save a round trip.
   There is no consent wording anywhere (Ruling D1). Words from the API reach the page through textContent only. Plain ES5. */
(function (root) {
  "use strict";

  var BU = root.NOInboxBulk && root.NOInboxBulk.util;
  var MAX = 160, STEP = 15, MIN_AHEAD = 10 * 60000, DAYS = 30, FROM = 8 * 60, TO = 20 * 60;
  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  /* The server's states, in the owner's words: scheduled is Scheduled, waiting and sending are Sending, finished is Sent, ended and stopped are Not sent. */
  var STATES = { scheduled: "Scheduled", waiting: "Sending", sending: "Sending", finished: "Sent", cancelled: "Cancelled", ended: "Not sent", stopped: "Not sent" };
  var CHIP = { scheduled: "waiting", waiting: "sending", sending: "sending", finished: "finished", cancelled: "stopped", ended: "ended", stopped: "ended" };
  var REASONS = { batch_running: "Another batch was still sending at the start time.", empty_audience: "There was nobody to send to at the start time.",
    outside_window: "The start time came after texts may go out (08:00 to 20:00 Manila time).", daily_cap: "The store's daily bulk text limit was reached at the start time.",
    phone_offline: "Your phone was offline at the start time." };
  /* The plain words for a refusal when the server sends none, by code. */
  var FALLBACK = {
    too_soon: "Choose a time at least 10 minutes from now.",
    outside_window: "Texts go out only from 08:00 to 20:00 Manila time.",
    too_far: "Choose a time within the next 30 days.",
    invalid: "Choose a date and time.",
    schedule_limit: "You can have at most 20 scheduled texts. Cancel one first.",
    empty_audience: "There is nobody to send to.",
    already_started: "That text has already started or was cancelled, so it cannot be changed."
  };

  var SLOT_CODES = { too_soon: 1, outside_window: 1, too_far: 1 };

  /* ---------- pure helpers ---------- */

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function num(n) { return typeof n === "number" && isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
  function stateText(s) { return STATES[s] || "Scheduled"; }
  function isScheduled(b) { return !!b && b.state === "scheduled"; }
  /* The small muted line under a status: the server's words, else a plain line for a known reason code. */
  function reasonText(b) {
    if (!b || (b.state !== "ended" && b.state !== "stopped")) return "";
    if (typeof b.end_message === "string" && b.end_message) return b.end_message;
    return REASONS[b.end_reason] || (typeof b.end_reason === "string" && b.end_reason && b.end_reason.indexOf("_") < 0 ? b.end_reason : "");
  }
  /* Manila (UTC+8, no daylight time) parts of an instant. */
  function manila(ms) {
    var t = new Date(ms + 8 * 3600000);
    return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), dow: t.getUTCDay() };
  }
  function dateKey(p) { return p.y + "-" + pad(p.mo) + "-" + pad(p.d); }
  function timeKey(p) { return pad(p.h) + ":" + pad(p.mi); }
  function dateLabel(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || ""); if (!m) return "";
    var dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
    return DOW[dow] + ", " + MON[+m[2] - 1] + " " + (+m[3]);
  }
  function timeLabel(key) {
    var m = /^(\d{2}):(\d{2})$/.exec(key || ""); if (!m) return "";
    var h = +m[1];
    return (h % 12 === 0 ? 12 : h % 12) + ":" + m[2] + " " + (h < 12 ? "am" : "pm");
  }
  /* The instant (ms) of a Manila date "YYYY-MM-DD" and time "HH:MM", or null. */
  function slotMs(date, time) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ""), t = /^(\d{2}):(\d{2})$/.exec(time || "");
    return d && t ? Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]) - 8 * 3600000 : null;
  }
  /* The ISO instant sent to the API, with the Manila offset: 2026-11-25T09:30:00+08:00. */
  function isoOf(date, time) { return slotMs(date, time) === null ? "" : date + "T" + time + ":00+08:00"; }
  /* The client-side hint for a chosen slot: { code, text } or null. The server has the last word. */
  function slotProblem(date, time, now) {
    var ms = slotMs(date, time); if (ms === null) return null;
    var mins = +time.slice(0, 2) * 60 + +time.slice(3);
    if (mins < FROM || mins >= TO) return { code: "outside_window", text: FALLBACK.outside_window };
    if (ms < now + MIN_AHEAD) return { code: "too_soon", text: FALLBACK.too_soon };
    if (ms > now + DAYS * 86400000) return { code: "too_far", text: FALLBACK.too_far };
    return null;
  }
  /* The dates the picker offers: today and the next 30 days, Manila, leaving out a day with no time left to pick (Today, late in the evening). [value, label]. */
  function dateOptions(now) {
    var out = [];
    for (var i = 0; i <= DAYS; i++) { var k = dateKey(manila(now + i * 86400000)); if (timeOptions(now, k).length) out.push([k, (i === 0 ? "Today, " : i === 1 ? "Tomorrow, " : "") + dateLabel(k)]); }
    return out;
  }
  /* The times the picker offers: every 15 minutes from 8:00 am to 7:45 pm (the window is 08:00 up to, not including, 20:00). [value, label].
     With now and a date: only the times that pass slotProblem for that day (Today: at least 10 minutes ahead). */
  function timeOptions(now, date) {
    var out = [];
    for (var m = FROM; m < TO; m += STEP) { var k = pad(Math.floor(m / 60)) + ":" + pad(m % 60); if (date && slotProblem(date, k, now)) continue; out.push([k, timeLabel(k)]); }
    return out;
  }
  function when(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; }
  }
  function base(site) { return "/sites/" + site + "/inquiries/sms/bulk/"; }
  function idsOf(list) { return list.map(function (x) { return x.id; }); }
  /* A saved pick back into a chip: an object with an id (and a name or label), or a bare id. */
  function toPick(x, kind) {
    if (x === null || x === undefined) return null;
    var o = typeof x === "object" ? x : { id: x };
    if ((typeof o.id !== "string" && typeof o.id !== "number") || o.id === "") return null;
    var items = kind === "group" ? BU.groupItems([o]) : BU.contactItems([o]);
    if (items.length) return items[0];
    var name = typeof o.name === "string" && o.name ? o.name : typeof o.label === "string" && o.label ? o.label : kind === "group" ? "Group" : "Contact";
    return { id: o.id, name: name, label: name };
  }
  /* The words for a refusal: the server's message, else the plain words for its code, else the fallback. */
  function say(res, fallback) {
    var d = res && res.data;
    if (d && typeof d.message === "string" && d.message) return d.message;
    var f = d && d.fields, first = f ? f[Object.keys(f)[0]] : null;
    if (typeof first === "string" && first) return first;
    if (d && FALLBACK[d.code]) return FALLBACK[d.code];
    return BU.refusal(res, fallback);
  }

  /* ---------- the screen ---------- */

  /* Two views in the tab's pane. "list": the title "Scheduled SMS" and a primary "Schedule SMS" button above the table box (no outer card).
     "form": the round 9 Bulk form (Send to above Message, 0 / 160, the count line, Send Test SMS) plus the date and the time, and Schedule or Save changes.
     ui: { D, h, add, clear, btn, busy, icon, combo, newKey, site, say, gone() }. host: the tab's pane. */
  function screen(host, ui) {
    var D = ui.D, h = ui.h, add = ui.add, b0 = base(ui.site);
    var st = { view: "list", status: null, edit: null, audience: "all", needPick: false, keepAud: false, pickG: [], pickC: [], groups: null, found: [], q: "", contactsOn: false,
      csrun: 0, ctimer: null, stimer: null, aud: null, audLoading: false, arun: 0, text: "", preview: null, prevErr: "", prun: 0, timer: null, date: "", time: "", slotErr: "",
      key: null, errField: "", origDate: "", origTime: "", saving: false, testing: false, testNote: "", err: "", note: "", confirm: null, dead: false,
      hist: { items: [], next: null, loading: false, failed: false } };

    function stop() { st.dead = true; if (st.timer) clearTimeout(st.timer); if (st.ctimer) clearTimeout(st.ctimer); if (st.stimer) clearTimeout(st.stimer); st.timer = st.ctimer = st.stimer = null; }
    function gone() { stop(); ui.gone(); }
    function aliveRes(res) { return !st.dead && !(res && res.status === 401); }
    function el(id) { return document.getElementById(id); }
    /* Results and server errors show as the dash toast (an error style for errors), never as a line under the buttons. */
    function toast(title, sub, kind) { if (D.toast) D.toast(title, sub || "", kind); }

    /* ----- reads ----- */
    function readStatus() {
      D.call("GET", b0 + "status/", null, true).then(function (res) {
        if (!aliveRes(res)) return;
        if (res.status === 404) { gone(); return; }
        if (res.ok && res.data && res.data.available === true) { st.status = res.data; if (st.view === "form") draw(); }
      });
    }
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
        if (res && res.ok && res.data) g0.list = BU.groupItems(Array.isArray(res.data) ? res.data : res.data.results || res.data.items); else g0.failed = true;
        var sel = el("ib-sc-to"); if (sel) { fillSend(sel); if (sel.ibRedraw) sel.ibRedraw(); }
        drawChips();
      });
    }
    function picked() { return st.pickG.length + st.pickC.length > 0; }
    function audBody() { return st.audience === "pick" ? { audience: "pick", groups: idsOf(st.pickG), contacts: idsOf(st.pickC) } : { audience: "all" }; }
    function readAudience() {
      var run = ++st.arun;
      st.aud = null;
      if (st.keepAud || st.needPick || (st.audience === "pick" && !picked())) { st.audLoading = false; drawCount(); return; }
      st.audLoading = true; drawCount();
      D.call("POST", b0 + "audience/", audBody(), true).then(function (res) {
        if (!aliveRes(res) || run !== st.arun) return;
        st.audLoading = false;
        if (res.status === 404) { gone(); return; }
        st.aud = res.ok && res.data && typeof res.data === "object" ? res.data : { failed: true };
        if (st.aud.failed) toast(say(res, "We could not count your members just now."), "", "error");
        drawCount();
      });
    }
    function searchContacts(raw) {
      if (st.ctimer) clearTimeout(st.ctimer);
      var q = String(raw || "").trim(), run = ++st.csrun, sel = el("ib-sc-to");
      if (q.length < 2) { st.found = []; if (sel) { fillSend(sel); sel.ibRedraw(); } return; }
      st.ctimer = setTimeout(function () {
        st.ctimer = null;
        D.call("GET", "/sites/" + ui.site + "/contacts/?q=" + encodeURIComponent(q), null, true).then(function (res) {
          if (st.dead || run !== st.csrun || (res && res.status === 401)) return;
          st.found = res && res.ok && res.data ? BU.contactItems(res.data.results) : [];
          var s2 = el("ib-sc-to"); if (s2) { fillSend(s2); s2.ibRedraw(); }
        });
      }, 300);
    }
    /* ONE house dropdown for who gets it, the same as the Bulk form: All my members first and the default, then the groups, then the contacts found. */
    function fillSend(sel) {
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      var q = String(st.q || "").trim().toLowerCase();
      sel.appendChild(D.el("option", { value: "" }, st.needPick ? "Choose who gets it" : "Add a group or contact"));
      if (!q || "all my members".indexOf(q) >= 0) sel.appendChild(D.el("option", { value: "all" }, "All my members"));
      ((st.groups && st.groups.list) || []).forEach(function (g) {
        if (st.pickG.some(function (x) { return x.id === g.id; })) return;
        if (q && g.label.toLowerCase().indexOf(q) < 0) return;
        sel.appendChild(D.el("option", { value: "g:" + g.id, "data-tag": "Group" }, g.label));
      });
      st.found.forEach(function (c) {
        if (st.pickC.some(function (x) { return x.id === c.id; })) return;
        sel.appendChild(D.el("option", { value: "c:" + c.id, "data-tag": c.optedOut ? "Contact · No texts" : "Contact" }, c.label));
      });
      sel.value = ""; /* All my members shows as a chip under the input, so the input keeps its placeholder */
    }
    function pickChanged(explicitAll) {
      st.audience = picked() ? "pick" : "all"; st.needPick = !picked() && explicitAll !== true; st.keepAud = false; st.q = ""; st.key = null; st.err = "";
      var sel = el("ib-sc-to"); if (sel) { fillSend(sel); if (sel.ibSync) sel.ibSync(); }
      drawChips(); readAudience(); fieldErr();
    }
    /* The chips under the Send to input, the same as Bulk: while All my members is chosen its chip (count, with a remove) then every group as a
       display-only chip; otherwise the chosen groups and contacts, each with a remove. */
    function allChosen() { return !st.keepAud && !st.needPick && !picked(); }
    function chip(label, onRemove, name) {
      var c = h("span", "ib-bk-pchip"); c.appendChild(h("span", "", label));
      if (onRemove) {
        var x = h("button", "ib-bk-pchip-x", "\u00D7"); x.setAttribute("type", "button"); x.setAttribute("aria-label", "Remove " + name);
        x.addEventListener("click", onRemove); c.appendChild(x);
      }
      return c;
    }
    function drawChips() {
      var box = el("ib-sc-chips"); if (!box) return;
      ui.clear(box);
      if (allChosen()) {
        var n = st.aud && !st.aud.failed && typeof st.aud.will_send === "number" ? " (" + num(st.aud.will_send) + ")" : "";
        box.appendChild(chip("All my members" + n, function () { pickChanged(); }, "All my members"));
        ((st.groups && st.groups.list) || []).forEach(function (g) { box.appendChild(chip(g.label || g.name, null)); });
        return;
      }
      st.pickG.map(function (it) { return [it, st.pickG, "group"]; }).concat(st.pickC.map(function (it) { return [it, st.pickC, "contact"]; })).forEach(function (t) {
        var it = t[0];
        box.appendChild(chip(it.label || it.name, function () { var arr = t[1]; arr.splice(arr.indexOf(it), 1); pickChanged(); }, it.name || "this " + t[2]));
      });
    }
    function schedulePreview() {
      if (st.timer) clearTimeout(st.timer);
      st.timer = setTimeout(function () {
        st.timer = null;
        var t = st.text.trim(), run = ++st.prun;
        if (!t || BU.onlyFirst(t)) { st.preview = null; st.prevErr = ""; drawPreview(); return; }
        D.call("POST", b0 + "preview/", { text: t }, true).then(function (res) {
          if (!aliveRes(res) || run !== st.prun) return;
          if (res.status === 404) { gone(); return; }
          if (res.ok && res.data && typeof res.data.text === "string") { st.preview = res.data; st.prevErr = ""; }
          else { st.preview = null; st.prevErr = BU.refusal(res, "This text cannot be sent."); }
          drawPreview();
        });
      }, 400);
    }

    /* ----- the list ----- */
    function loadList(cursor, reset) {
      if (reset) st.hist = { items: [], next: null, loading: true, failed: false };
      var h0 = st.hist; h0.loading = true; h0.failed = false;
      D.call("GET", b0 + "scheduled/?limit=20" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""), null, true).then(function (res) {
        if (!aliveRes(res) || st.hist !== h0) return;
        if (res.status === 404) { gone(); return; }
        h0.loading = false;
        if (!res.ok || !res.data) h0.failed = true;
        else { h0.items = h0.items.concat(Array.isArray(res.data.items) ? res.data.items : []); h0.next = res.data.next_cursor || null; }
        if (st.view === "list") draw();
      });
    }
    function drawList(body) {
      if (st.note) { var n = h("p", "ib-note ib-note-info"); n.setAttribute("role", "status"); n.appendChild(ui.icon("M4 5h16v11H9l-5 4z")); n.appendChild(h("span", "", st.note)); body.appendChild(n); }
      var sec = h("section", "ib-bk-dc ib-bk-histsec"); sec.setAttribute("aria-labelledby", "ib-sc-h"); sec.setAttribute("id", "ib-sc-hist");
      var ht = h("h2", "", "Scheduled SMS"); ht.setAttribute("id", "ib-sc-h");
      var go = ui.btn("Schedule SMS", "primary", function () { openForm(null); }); go.setAttribute("id", "ib-sc-send");
      sec.appendChild(add(h("div", "ib-bk-dh"), ht, go));
      body.appendChild(sec);
      var hs = st.hist, items = hs.items;
      if (hs.failed && !items.length) { sec.appendChild(h("p", "pm-meta", "We could not load your scheduled texts just now.")); sec.appendChild(ui.btn("Try again", "primary", function () { loadList(null, true); draw(); })); return; }
      if (hs.loading && !items.length) { sec.appendChild(h("p", "pm-meta ib-loading", "Loading…")); return; }
      if (!items.length) { sec.appendChild(h("p", "pm-meta", "Nothing is scheduled yet.")); return; }
      var box = h("div", "ib-bk-tbox"), tbl = h("table", "ib-bk-table ib-sc-table"), head = h("tr", "");
      ["Date and time", "Audience", "Message", "Status", ""].forEach(function (t, i) { var th = h("th", i === 4 ? "ib-bk-th-act" : "", t); th.setAttribute("scope", "col"); if (i === 4) th.appendChild(h("span", "bl-sr", "Actions")); head.appendChild(th); });
      tbl.appendChild(add(h("thead", ""), head));
      var tb = h("tbody", "");
      items.forEach(function (b) {
        var tr = h("tr", "ib-bk-tr ib-sc-tr");
        tr.appendChild(h("td", "ib-bk-when", when(b.scheduled_at) + " (Manila)"));
        tr.appendChild(BU.audienceCell(h, b));
        tr.appendChild(h("td", "ib-bk-rtext", b.text || ""));
        var sc = h("td", ""); sc.appendChild(h("span", "ib-bk-chip is-" + (CHIP[b.state] || "waiting"), stateText(b.state)));
        var why = reasonText(b); if (why) sc.appendChild(h("span", "ib-sc-why", why));
        tr.appendChild(sc);
        var ac = h("td", "ib-bk-act");
        if (isScheduled(b)) {
          var e = ui.btn("Edit", "ghost", function () { startEdit(b, e); }); e.classList.add("ib-bk-view"); e.classList.add("ib-sc-edit"); e.setAttribute("data-sched", b.id);
          var c = ui.btn("Cancel", "ghost", function () { st.confirm = b; draw(); }); c.classList.add("ib-bk-view"); c.classList.add("ib-sc-cancel"); c.setAttribute("data-sched", b.id);
          ac.appendChild(add(h("div", "ib-sc-acts"), e, c));
        }
        tr.appendChild(ac); tb.appendChild(tr);
      });
      tbl.appendChild(tb); box.appendChild(tbl); sec.appendChild(box);
      if (hs.next) sec.appendChild(ui.btn("Show more", "ghost", function (x) { ui.busy(x, true); loadList(hs.next, false); }));
    }
    /* Cancel asks once in a small dialog. */
    function drawConfirm() {
      var b = st.confirm; if (!b) return;
      var back = ui.btn("Keep it", "ghost", function () { st.confirm = null; draw(); }); back.setAttribute("id", "ib-sc-dlg-back");
      var yes = ui.btn("Yes, cancel it", "primary", function (x) { cancelOne(b, x); }); yes.setAttribute("id", "ib-sc-dlg-go");
      var dlg = h("div", "ib-bk-dlg"); dlg.setAttribute("id", "ib-sc-dlg"); dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "ib-sc-dlg-t");
      var q = h("p", "ib-bk-dlg-t", "Cancel the text scheduled for " + when(b.scheduled_at) + "?"); q.setAttribute("id", "ib-sc-dlg-t");
      var er = h("p", "field-err", st.err); er.setAttribute("role", "alert"); er.hidden = !st.err;
      dlg.appendChild(add(h("div", "ib-bk-dlg-box"), q, er, add(h("div", "ib-bk-dlg-btns"), back, yes)));
      dlg.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); st.confirm = null; draw(); } });
      host.appendChild(dlg); if (back.focus) back.focus();
    }
    function cancelOne(b, x) {
      ui.busy(x, true); st.err = "";
      D.call("POST", b0 + "scheduled/" + encodeURIComponent(b.id) + "/cancel/", null, true).then(function (res) {
        if (!aliveRes(res)) return;
        if (res.status === 404) { gone(); return; }
        if (!res.ok) {
          st.confirm = null;
          st.note = say(res, "We could not cancel it. Please try again.");
          loadList(null, true);
          draw(); return;
        }
        st.confirm = null; st.note = "The scheduled text was cancelled."; ui.say("Scheduled text cancelled.");
        loadList(null, true); draw();
      });
    }

    /* ----- drawing ----- */
    function draw() {
      if (st.dead) return;
      ui.clear(host); host.classList.remove("is-hide-phone"); host.setAttribute("aria-label", "Schedule SMS");
      var body = h("div", "ib-bk ib-bk-page"); body.setAttribute("tabindex", "-1"); host.appendChild(body);
      if (st.view === "form") { drawForm(body); return; }
      drawList(body);
      if (st.confirm) drawConfirm();
    }

    /* ----- the form ----- */
    function resetForm() {
      st.audience = "all"; st.needPick = true; st.keepAud = false; st.pickG = []; st.pickC = []; st.found = []; st.q = ""; st.aud = null; st.text = ""; st.preview = null; st.prevErr = "";
      st.date = ""; st.time = ""; st.slotErr = ""; st.key = null; st.err = ""; st.note = ""; st.testNote = ""; st.edit = null;
    }
    function openForm(item, detail) {
      resetForm(); st.view = "form";
      if (item) {
        var d = detail || item; st.edit = item; st.needPick = false; /* an edit already has its audience */
        st.text = typeof d.text === "string" ? d.text : "";
        var p = d.scheduled_at ? manila(Date.parse(d.scheduled_at)) : null;
        if (p && isFinite(p.y)) { st.date = dateKey(p); st.time = timeKey(p); st.origDate = st.date; st.origTime = st.time; }
        if (d.audience === "pick") {
          st.audience = "pick";
          (Array.isArray(d.groups) ? d.groups : []).forEach(function (g) { var x = toPick(g, "group"); if (x) st.pickG.push(x); });
          (Array.isArray(d.contacts) ? d.contacts : []).forEach(function (c) { var x = toPick(c, "contact"); if (x) st.pickC.push(x); });
          if (!picked()) { st.needPick = true; st.keepAud = true; } /* the API does not send the picks back: they stay as saved unless the owner chooses again; nothing silently becomes everyone */
        }
        st.preview = st.text.trim() ? { text: st.text } : null;
      }
      draw(); readAudience(); if (!st.status) readStatus();
      if (st.text.trim()) schedulePreview();
    }
    function startEdit(b, x) {
      ui.busy(x, true);
      D.call("GET", b0 + "scheduled/" + encodeURIComponent(b.id) + "/", null, true).then(function (res) {
        if (!aliveRes(res)) return;
        if (res.status === 404) { /* gone from the server: show the list again, not a dead form */ st.note = "That scheduled text is no longer there."; loadList(null, true); draw(); return; }
        if (res.ok && res.data && res.data.state && res.data.state !== "scheduled") { st.note = FALLBACK.already_started; loadList(null, true); draw(); return; }
        openForm(b, res.ok && res.data ? Object.assign({}, b, res.data) : null);
      });
    }
    function closeForm() { st.view = "list"; st.err = ""; draw(); }
    function drawForm(body) {
      var s = st.status, cols = h("div", "ib-bk-cols"), main = h("div", "ib-bk-colmain"), aside = h("div", "ib-bk-aside");
      var blocked = s ? BU.blockedText(s) : "";
      if (blocked) { var bn = h("p", "ib-note"); bn.setAttribute("role", "status"); bn.appendChild(h("span", "", blocked)); main.appendChild(bn); }
      var title = st.edit ? "Edit scheduled text" : "Schedule a text: write it, choose who gets it and when";
      var card = h("section", "dash-card ib-bk-dc ib-bk-formcard"); card.setAttribute("aria-labelledby", "ib-sc-h-new");
      var t = h("h2", "", title); t.setAttribute("id", "ib-sc-h-new"); card.appendChild(add(h("div", "ib-bk-dh"), t));
      card.appendChild(form()); main.appendChild(card);
      if (s && typeof s.cost_note === "string" && s.cost_note) main.appendChild(h("p", "ib-bk-will ib-fn-hint ib-bk-cost", s.cost_note));
      var rules = h("section", "dash-card ib-bk-rules"); rules.setAttribute("aria-labelledby", "ib-sc-h-rules");
      var rh = h("h2", "", "How scheduled sending works"); rh.setAttribute("id", "ib-sc-h-rules"); rules.appendChild(rh);
      var ul = h("ul", "ib-bk-left");
      ["One text for every member, sent from your own phone.", "No web links.", "Members who replied STOP are skipped.", "Sending runs from 8:00 am to 8:00 pm, Manila time.",
        "Choose a time at least 10 minutes from now and within 30 days.", "You can keep up to 20 texts scheduled. Edit or cancel one until it starts."].forEach(function (x) { ul.appendChild(h("li", "", x)); });
      rules.appendChild(ul); aside.appendChild(rules);
      /* the way back is a small text link above the form, not a button: the form has exactly two buttons */
      var back = h("a", "ib-sc-backlink", "\u2190 Scheduled SMS"); back.setAttribute("id", "ib-sc-back"); back.setAttribute("href", "/sms/schedule/");
      back.addEventListener("click", function (e) { if (e && e.preventDefault) e.preventDefault(); closeForm(); });
      body.appendChild(back);
      add(cols, main, aside); body.appendChild(cols);
      drawChips(); drawCount(); drawPreview();
      if (st.contactsOn) readGroups();
    }
    function setOptions(sel, opts, keep, chosen) {
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      sel.appendChild(D.el("option", { value: "" }, keep));
      var has = false;
      opts.forEach(function (o) { if (o[0] === chosen) has = true; sel.appendChild(D.el("option", { value: o[0] }, o[1])); });
      if (chosen && !has) sel.appendChild(D.el("option", { value: chosen }, sel.id === "ib-sc-date" ? dateLabel(chosen) : timeLabel(chosen)));
      sel.value = chosen || "";
    }
    function form() {
      var wrap = h("div", "ib-bk-form ib-sc-form");
      /* 1. who: the same ONE house dropdown as Bulk, above the message */
      var fs = h("div", "pm-field ib-bk-sendto");
      var l1 = h("label", "pm-label", "Send to"); l1.setAttribute("for", "ib-sc-to"); fs.appendChild(l1);
      var sel = D.el("select", { "class": "ib-input", id: "ib-sc-to" });
      fillSend(sel); fs.appendChild(sel);
      var ch = h("div", "ib-bk-chips"); ch.setAttribute("id", "ib-sc-chips"); fs.appendChild(ch);
      wrap.appendChild(fs);
      sel.addEventListener("change", function () {
        var v = sel.value; if (!v) return;
        if (v === "all") { st.pickG = []; st.pickC = []; pickChanged(true); return; }
        var id = v.slice(2), g;
        if (v.indexOf("g:") === 0) { g = ((st.groups && st.groups.list) || []).filter(function (x) { return String(x.id) === id; })[0]; if (g) st.pickG.push(g); }
        else { g = st.found.filter(function (x) { return String(x.id) === id; })[0]; if (g) st.pickC.push(g); }
        if (g) pickChanged();
      });
      ui.combo(sel, "Send to", { blankEmpty: true, remote: function (q) { st.q = String(q || ""); fillSend(sel); sel.ibRedraw(); if (st.contactsOn) searchContacts(q); },
        emptyText: function (q) { return st.contactsOn && String(q || "").trim().length < 2 ? "Type at least 2 letters of a name or number" : "No groups or contacts found."; } });
      var wrapEl = sel.parentNode, inEl = wrapEl.all ? wrapEl.all(function (n) { return n.tagName === "INPUT"; })[0] : wrapEl.querySelector("input");
      function resetQ() { if (!st.q) return; st.q = ""; fillSend(sel); if (sel.ibSync) sel.ibSync(); }
      if (inEl) inEl.addEventListener("keydown", function (e) { if (e.key === "Escape" || e.key === "Tab") resetQ(); });
      function onOut(e) {
        if (!el("ib-sc-to")) { document.removeEventListener("click", onOut); return; }
        if (wrapEl.contains && wrapEl.contains(e.target)) return;
        resetQ();
      }
      document.addEventListener("click", onOut);
      /* 2. the text */
      var f3 = h("div", "pm-field");
      var l3 = h("label", "pm-label", "Message"); l3.setAttribute("for", "ib-sc-t"); var lrow = h("div", "ib-fn-row"); lrow.appendChild(l3); f3.appendChild(lrow);
      var ta = h("textarea", "pm-input ib-ta"); ta.setAttribute("id", "ib-sc-t"); ta.setAttribute("rows", "4"); ta.setAttribute("aria-describedby", "ib-sc-c ib-sc-e"); ta.setAttribute("maxlength", String(MAX + 40));
      ta.value = st.text; f3.appendChild(ta); wrap.appendChild(f3);
      var count = h("span", "ib-count" + (st.text.length > MAX ? " is-over" : ""), st.text.length + " / " + MAX); count.setAttribute("id", "ib-sc-c");
      var err = h("p", "field-err", ""); err.setAttribute("id", "ib-sc-e"); err.setAttribute("role", "alert"); err.hidden = true; wrap.appendChild(err);
      var kit = BU.firstNameKit({ ui: ui, ta: ta, max: MAX, onChange: function () { changed(); } });
      lrow.appendChild(kit.button);
      wrap.appendChild(add(h("div", "ib-rfoot"), h("span", "ib-bk-will ib-fn-hint", "Press + First name to greet each person by name"), add(h("span", "ib-cntgrp"), count)));
      wrap.appendChild(kit.help);
      function changed() {
        st.text = ta.value; st.err = ""; st.testNote = ""; st.key = null; st.preview = null; st.prevErr = "";
        count.textContent = ta.value.length + " / " + MAX; count.classList.toggle("is-over", ta.value.length > MAX);
        kit.refresh(); fieldErr(); drawPreview(); schedulePreview();
      }
      ta.addEventListener("input", changed);
      /* 3. when: a date and a time, both house dropdowns, Manila time */
      var row = h("div", "ib-sc-when");
      var fd = h("div", "pm-field"), ld = h("label", "pm-label", "Date"); ld.setAttribute("for", "ib-sc-date"); fd.appendChild(ld);
      fixSlot(false);
      var sd = D.el("select", { "class": "ib-input", id: "ib-sc-date" }); setOptions(sd, dateOptions(Date.now()), "Choose a date", st.date); fd.appendChild(sd);
      var ft = h("div", "pm-field"), lt = h("label", "pm-label", "Time (Manila)"); lt.setAttribute("for", "ib-sc-time"); ft.appendChild(lt);
      var stm = D.el("select", { "class": "ib-input", id: "ib-sc-time" }); setOptions(stm, timeOptions(Date.now(), st.date), "Choose a time", st.time); ft.appendChild(stm);
      add(row, fd, ft); wrap.appendChild(row);
      ui.combo(sd, "Date", { blankEmpty: true }); ui.combo(stm, "Time", { blankEmpty: true });
      var de = h("p", "field-err", ""); de.setAttribute("id", "ib-sc-de"); de.setAttribute("role", "alert"); de.hidden = true; wrap.appendChild(de);
      wrap.appendChild(h("p", "ib-bk-will ib-fn-hint", "Manila time, 8:00 am to 8:00 pm. At least 10 minutes from now and up to 30 days ahead."));
      function slotChanged(userDate) { st.date = sd.value; st.time = stm.value; st.slotErr = ""; st.err = ""; st.key = null; if (userDate === true) refreshSlot(true); fieldErr(); drawPreview(); }
      /* a new date: the time stays when that day offers it, else the first time of that day; a stale list is rebuilt when the owner comes back to it or each half minute */
      sd.addEventListener("change", function () { slotChanged(true); }); stm.addEventListener("change", function () { slotChanged(false); });
      ["focusin", "mousedown", "touchstart"].forEach(function (ev) { if (row.addEventListener) row.addEventListener(ev, function () { refreshSlot(false); }); });
      tickSlot();
      /* 4. the buttons; nothing is written below them (results and errors are toasts) */
      var cnt = h("p", "ib-bk-will ib-fn-hint"); cnt.setAttribute("id", "ib-sc-count"); cnt.setAttribute("aria-live", "polite");
      var tb = ui.btn("Send Test SMS", "ghost", function (x) { sendTest(x); }); tb.setAttribute("id", "ib-sc-test");
      var go = ui.btn(st.edit ? "Save changes" : "Schedule", "primary", function (x) { save(x); }); go.setAttribute("id", "ib-sc-go");
      fs.appendChild(cnt);
      wrap.appendChild(add(h("div", "ib-bk-actions"), add(h("div", "ib-bk-btns"), tb, go)));
      return wrap;
    }
    function textProblem() { return BU.problem(st.text, MAX) || st.prevErr; }
    function textOk() { return !!st.text.trim() && !textProblem(); }
    /* The text error under the message, the slot error under the date and time, the form error above the buttons. */
    function fieldErr() {
      var e = el("ib-sc-e"); if (e) { var p = textProblem() || (st.errField === "text" ? st.err : ""); e.textContent = p; e.hidden = !p; }
      var de = el("ib-sc-de"); if (de) { var sp = st.slotErr || (st.date && st.time && !same() ? (slotProblem(st.date, st.time, Date.now()) || {}).text || "" : ""); de.textContent = sp; de.hidden = !sp; }
    }
    function readyCount() { return st.keepAud ? true : st.needPick ? false : !!st.aud && !st.aud.failed && !st.audLoading && num(st.aud.will_send) > 0; }
    /* an edit that keeps its saved time is not checked again, here or by the server (it checks the time only when sent) */
    function same() { return !!st.edit && st.date === st.origDate && st.time === st.origTime; }
    function slotOk() { return !!st.date && !!st.time && (same() || !slotProblem(st.date, st.time, Date.now())); }
    /* Choose the date and the time that are offered now (no DOM). A new form starts on the first day with a time left and its first time; a time the
       chosen day does not offer becomes that day's first time. An edit keeps its saved date and time. userDate: the owner just chose the date, so it stays. */
    function fixSlot(userDate) {
      if (same()) return;
      var now = Date.now();
      if (!userDate) { var dopts = dateOptions(now); if (!dopts.some(function (o) { return o[0] === st.date; })) st.date = dopts.length ? dopts[0][0] : ""; }
      if (st.date) { var topts = timeOptions(now, st.date); if (topts.length && !topts.some(function (o) { return o[0] === st.time; })) st.time = topts[0][0]; }
    }
    function refreshSlot(userDate) {
      var sd = el("ib-sc-date"), stm = el("ib-sc-time"); if (!sd || !stm) return;
      if (userDate !== true) { st.date = sd.value || st.date; st.time = stm.value || st.time; } else st.date = sd.value;
      fixSlot(userDate === true);
      setOptions(sd, dateOptions(Date.now()), "Choose a date", st.date); setOptions(stm, timeOptions(Date.now(), st.date), "Choose a time", st.time);
      if (sd.ibSync) sd.ibSync(); if (stm.ibSync) stm.ibSync();
      st.slotErr = ""; fieldErr(); drawPreview();
    }
    function tickSlot() {
      if (st.stimer) clearTimeout(st.stimer);
      st.stimer = setTimeout(function () { st.stimer = null; if (st.dead || st.view !== "form" || !el("ib-sc-date")) return; refreshSlot(false); tickSlot(); }, 30000);
      if (st.stimer && typeof st.stimer.unref === "function") st.stimer.unref();
    }
    /* The chips carry the counts; there is no "Will send to" line. Only a kept audience (an edit) says so, in the label format. */
    function drawCount() {
      var box = el("ib-sc-count"); if (box) { ui.clear(box); if (st.keepAud) box.appendChild(document.createTextNode("Staying with the groups and contacts you chose before.")); }
      drawChips(); drawPreview();
    }
    function drawPreview() {
      fieldErr();
      var ok = textOk() && !!st.preview, tb = el("ib-sc-test"), go = el("ib-sc-go");
      if (tb) tb.disabled = !ok || st.keepAud || st.needPick || st.testing; /* a test needs an audience picked on this form */
      if (go) go.disabled = !ok || !readyCount() || !slotOk() || st.saving;
    }
    function sendTest(x) {
      if (st.testing || !textOk() || st.keepAud || st.needPick) return;
      st.testing = true; st.testNote = ""; ui.busy(x, true);
      D.call("POST", b0 + "test/", Object.assign(audBody(), { text: st.text.trim(), idempotency_key: ui.newKey() }), true).then(function (res) {
        st.testing = false;
        if (!aliveRes(res)) return;
        if (res.status === 404) { gone(); return; }
        var tb = el("ib-sc-test");
        if (tb) ui.busy(tb, false);
        if (res.ok) { toast("A test text is on its way to your phone.", "It counts as one of today's texts."); ui.say("Test text is on its way."); return; }
        toast(say(res, "The test text could not be sent."), "", "error");
      });
    }
    function save(x) {
      if (st.saving || !textOk() || !readyCount()) return;
      var hint = same() ? null : slotProblem(st.date, st.time, Date.now());
      if (!st.date || !st.time) { st.slotErr = "Choose a date and a time."; fieldErr(); return; }
      if (hint) { st.slotErr = hint.text; fieldErr(); return; }
      var editing = st.edit, body = st.keepAud ? {} : audBody();
      body.text = st.text.trim(); body.scheduled_at = isoOf(st.date, st.time);
      if (editing && st.date === st.origDate && st.time === st.origTime) delete body.scheduled_at; /* the server checks the time only when it is sent */
      if (!editing) { st.key = st.key || ui.newKey(); body.idempotency_key = st.key; }
      st.saving = true; st.err = ""; st.errField = ""; st.slotErr = ""; ui.busy(x, true);
      D.call(editing ? "PATCH" : "POST", b0 + "scheduled/" + (editing ? encodeURIComponent(editing.id) + "/" : ""), body, true).then(function (res) {
        st.saving = false;
        if (!aliveRes(res)) return;
        if (res.status === 404) { if (editing) { st.view = "list"; st.note = "That scheduled text is no longer there."; loadList(null, true); draw(); return; } gone(); return; }
        if (!res.ok) { failed(res, x); return; }
        st.view = "list"; st.key = null; st.note = "";
        toast(editing ? "Your changes were saved." : "Scheduled for " + when(body.scheduled_at) + " (Manila time).");
        ui.say(editing ? "Changes saved." : "Text scheduled.");
        loadList(null, true); draw();
      });
    }
    /* A refusal: the date and time field for the slot codes, the message field for a text error, the form for the rest. already_started: the list is read again. */
    function failed(res, x) {
      var code = res.data && res.data.code, f = res.data && res.data.fields;
      if (res.status !== 0 && code !== "idempotency_conflict") st.key = null; /* a lost answer keeps the key so nothing is scheduled twice */
      if (res.status === 409 && code === "already_started") { st.view = "list"; st.note = ""; toast(say(res, FALLBACK.already_started), "", "error"); loadList(null, true); draw(); return; }
      ui.busy(x, false);
      if (SLOT_CODES[code] || (f && (f.scheduled_at || f.date || f.time))) { toast(say(res, "Choose another time."), "", "error"); return; }
      if (f && f.text) { st.err = say(res, "This text cannot be sent."); st.errField = "text"; fieldErr(); return; }
      toast(say(res, "We could not schedule it. Please try again."), "", "error"); /* invalid_audience and the rest */
    }

    readContacts(); readStatus(); loadList(null, true);
    return { stop: stop };
  }

  root.NOInboxSchedule = { screen: screen,
    util: { stateText: stateText, isScheduled: isScheduled, reasonText: reasonText, manila: manila, dateKey: dateKey, dateLabel: dateLabel, timeLabel: timeLabel, slotMs: slotMs, isoOf: isoOf,
      slotProblem: slotProblem, dateOptions: dateOptions, timeOptions: timeOptions, say: say, STATES: STATES, FALLBACK: FALLBACK } };
})(typeof window !== "undefined" ? window : globalThis);
