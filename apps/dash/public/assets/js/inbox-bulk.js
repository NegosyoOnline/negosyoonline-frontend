/* inbox-bulk.js: "Text many members" (store bulk SMS, ClickUp z8uq9mbreu), the screen the dash Inbox opens from its toolbar.
   Exposes window.NOInboxBulk { probe(D, site), screen(host, ui), util }. Routes (apps/inquiries store_bulk.py, contract
   store-bulk-sms-be-api-2026-11-23), all under /sites/{id}/inquiries/sms/bulk/: GET status/, POST audience/ {audience}, POST preview/ {text},
   POST test/ {text, idempotency_key}, POST batches/ {text, audience, promotional, idempotency_key, confirm, expected_count}, GET batches/,
   GET batches/{id}/, POST batches/{id}/stop/. Every one answers 404 while the feature is off: probe() then says null and the button stays hidden.
   Ruling D1 (Coach Ed, 2026-11-23): "All my members" is the first and default audience; there is NO consent nudge, warning or consent
   wording anywhere on this screen. The page never shows a list of numbers: only counts, and masked mobiles in a batch's recipients.
   The words the API sends (messages, reason_text, end_message, blocked_message) reach the page through textContent only. Plain ES5. */
(function (root) {
  "use strict";

  /* ---------- pure helpers ---------- */

  var AUDIENCES = [["all", "All my members"], ["promo", "Members who agreed to promo texts"]];
  /* The plain labels for the groups left out of the count, in the order the API counts them. */
  var LEFT_OUT = [["unverified", "Mobile number not verified"], ["invalid_number", "Test number"], ["opted_out", "Asked for no more texts (STOP)"],
    ["not_promo", "Not agreed to promo texts"], ["duplicates", "Repeated number"]];
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
  function willSend(n) { return "Will send to " + plural(num(n), "member", "members"); }
  /* The groups left out of a count, [label, n] for each non-zero one. */
  function leftOut(lo) {
    var out = [];
    if (!lo || typeof lo !== "object") return out;
    LEFT_OUT.forEach(function (p) { var n = num(lo[p[0]]); if (n > 0) out.push([p[1], n]); });
    return out;
  }
  function maxOf(x) { return x && typeof x.max_length === "number" && isFinite(x.max_length) && x.max_length > 0 ? Math.floor(x.max_length) : null; }
  function prefixOf(x) { return x && typeof x.prefix === "string" ? x.prefix : ""; }
  /* The room-left counter for the owner's words. */
  function roomLeft(len, max) {
    if (max === null || max === undefined) return "";
    var r = max - len;
    return r >= 0 ? r + " characters left" : "Over by " + (-r) + " characters";
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

  /* The button shows only when this answers a status with available:true. D.call: the host app's fetch. Resolves the status object, or null
     on a 404 (feature off), any error or a status that does not say available. */
  function probe(D, site) {
    return D.call("GET", base(site) + "status/", null, true).then(function (res) {
      return res && res.ok && available(res.data) ? res.data : null;
    }, function () { return null; });
  }

  /* ---------- the screen ---------- */

  /* ui: { D, h, add, clear, btn, busy, icon, combo, newKey, site, say, back(), gone() }. host: the thread pane. */
  function screen(host, ui) {
    var D = ui.D, h = ui.h, add = ui.add, b0 = base(ui.site);
    var st = { view: "loading", status: null, audience: "all", aud: null, audLoading: false, text: "", promo: false, preview: null, prevErr: "",
      key: null, sure: false, sending: false, testing: false, testNote: "", err: "", note: "", timer: null, poll: null, ptimer: null,
      hist: { items: [], next: null, loading: false, failed: false }, det: null, dead: false, arun: 0, prun: 0 };

    function stop() { st.dead = true; if (st.timer) clearTimeout(st.timer); if (st.poll) clearTimeout(st.poll); st.timer = st.poll = null; }
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
        if (st.view === "main" && !active(st.status.active_batch) && !blockedText(st.status) && !st.aud && !st.audLoading) readAudience();
      });
    }
    /* While a batch is active the status is read again every 5 seconds (the progress card). */
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
            if (was && !active(res.data.active_batch)) { st.note = "Your last batch is done. See History for how it went."; st.aud = null; }
            if (st.view === "main") draw();
          }
          schedulePoll();
        });
      }, 5000);
    }
    function readAudience() {
      var run = ++st.arun, a = st.audience;
      st.audLoading = true; st.aud = null; drawCount();
      D.call("POST", b0 + "audience/", { audience: a }, true).then(function (res) {
        if (!aliveRes(res) || run !== st.arun) return;
        st.audLoading = false;
        if (res.status === 404) { gone(); return; }
        st.aud = res.ok && res.data && typeof res.data === "object" ? res.data : { failed: true };
        draw();
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
    function head(title, sub, backFn, backLabel) {
      var row = h("div", "ib-thead"), back = h("button", "ib-back"); back.setAttribute("type", "button"); back.setAttribute("id", "ib-back");
      back.appendChild(ui.icon("M15 6l-6 6 6 6")); back.appendChild(h("span", "", backLabel || "Inbox"));
      back.addEventListener("click", backFn);
      var nm = h("div", "ib-tname"); nm.appendChild(h("h2", "", title)); if (sub) nm.appendChild(h("p", "ib-sub", sub));
      return add(row, back, nm);
    }
    function link(label, fn, id) {
      var a = h("button", "no-btn no-btn-ghost", label); a.setAttribute("type", "button"); if (id) a.setAttribute("id", id);
      a.addEventListener("click", fn); return a;
    }
    function countsRow(b) {
      var row = h("div", "ib-bk-counts");
      [["Sent", b.sent], ["Failed", b.failed], ["Not sent", b.not_sent], ["Waiting", b.waiting]].forEach(function (p) {
        var c = h("div", "ib-bk-count"); c.appendChild(h("span", "ib-bk-n", String(num(p[1])))); c.appendChild(h("span", "ib-bk-l", p[0])); row.appendChild(c);
      });
      return row;
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

    /* ----- the main screen: progress card or the compose form ----- */
    function draw() {
      if (st.dead) return;
      ui.clear(host); host.classList.remove("is-hide-phone"); host.setAttribute("aria-label", "Text many members");
      if (st.view === "history") return drawHistory();
      if (st.view === "detail") return drawDetail();
      host.appendChild(head("Text many members", "Send one text to your members from your own phone.", function () { stop(); ui.back(); }));
      var body = h("div", "ib-msgs ib-sms-new ib-bk"); body.setAttribute("tabindex", "-1"); host.appendChild(body);
      if (st.view === "loading") { body.appendChild(h("p", "pm-meta ib-loading", "Opening…")); return; }
      if (st.view === "failed") {
        body.appendChild(h("p", "pm-meta", "We could not open this screen just now. Nothing was sent."));
        body.appendChild(ui.btn("Try again", "primary", function (b) { ui.busy(b, true); st.view = "loading"; readStatus(); }));
        return;
      }
      var s = st.status;
      if (st.note) { body.appendChild(note(st.note, false)); }
      body.appendChild(add(h("div", "ib-bk-bar"), link("History", openHistory, "ib-bk-history")));
      var blocked = blockedText(s);
      if (blocked) {
        body.appendChild(note(blocked, true));
        if (s.blocked === "no_line") { var l = h("a", "no-btn no-btn-ghost", "Open Settings > SMS Gateway"); l.setAttribute("href", "/settings/sms-gateway/"); l.setAttribute("id", "ib-bk-gw"); body.appendChild(l); }
        if (!active(s.active_batch)) return;
      }
      if (active(s.active_batch)) { body.appendChild(progressCard(s.active_batch)); body.appendChild(costLine(s)); return; }
      if (s.phone_online === false) body.appendChild(note("Your texting phone is offline. Texts wait until it is back online.", true));
      body.appendChild(form(s));
      body.appendChild(costLine(s));
      drawCount(); drawPreview(); drawConfirm();
    }
    function costLine(s) { return typeof s.cost_note === "string" && s.cost_note ? h("p", "pm-hint ib-bk-cost", s.cost_note) : h("span", ""); }

    function progressCard(b) {
      var card = h("div", "ib-bk-card"); card.setAttribute("id", "ib-bk-progress");
      var top = h("div", "ib-bk-top"); top.appendChild(h("h3", "", stateText(b.state)));
      top.appendChild(h("span", "ib-bk-chip is-" + (b.state || "waiting"), "of " + num(b.size)));
      card.appendChild(top);
      card.appendChild(countsRow(b));
      var p = pauseText(b); if (p) { var pn = note(p, true); pn.setAttribute("id", "ib-bk-pause"); card.appendChild(pn); }
      var e = estimate(b.seconds_left); if (e) card.appendChild(h("p", "pm-hint", e));
      card.appendChild(lines(b));
      var err = h("p", "field-err", st.err); err.setAttribute("role", "alert"); err.hidden = !st.err; card.appendChild(err);
      var stopBtn = ui.btn("Stop sending", "ghost", function (x) { stopBatch(b, x); }); stopBtn.setAttribute("id", "ib-bk-stop");
      card.appendChild(add(h("div", "ib-rfoot"), h("span", ""), stopBtn));
      return card;
    }
    function stopBatch(b, x) {
      ui.busy(x, true); st.err = "";
      D.call("POST", b0 + "batches/" + encodeURIComponent(b.id) + "/stop/", null, true).then(function (res) {
        if (!aliveRes(res)) return;
        if (res.status === 404) { gone(); return; }
        if (!res.ok) { st.err = refusal(res, "We could not stop it. Please try again."); /* not_running: it ended on its own; read again */ if (res.status === 409) { st.aud = null; readStatus(); return; } draw(); return; }
        ui.say("Sending stopped.");
        st.note = "Sending was stopped. Texts already with your phone may still go out."; st.aud = null;
        st.status.active_batch = null; readStatus();
      });
    }

    function form(s) {
      var wrap = h("div", "ib-bk-form");
      var q = typeof s.left_today === "number" && typeof s.daily_limit === "number" ? "Bulk texts left today: " + num(s.left_today) + " of " + num(s.daily_limit) + "." : "";
      if (q) wrap.appendChild(h("p", "pm-hint ib-sms-quota", q));
      /* audience: the house dropdown, All my members first */
      var f1 = h("div", "pm-field ib-fld");
      var l1 = h("label", "pm-label", "Who gets the text"); l1.setAttribute("for", "ib-bk-aud");
      var sel = D.el("select", { "class": "ib-input", id: "ib-bk-aud" });
      AUDIENCES.forEach(function (a) { sel.appendChild(D.el("option", { value: a[0] }, a[1])); });
      sel.value = st.audience;
      sel.addEventListener("change", function () { st.audience = sel.value === "promo" ? "promo" : "all"; st.sure = false; st.key = null; readAudience(); });
      add(f1, l1, sel); wrap.appendChild(f1);
      ui.combo(sel, "Who gets the text");
      var cnt = h("div", "ib-bk-box"); cnt.setAttribute("id", "ib-bk-count"); cnt.setAttribute("aria-live", "polite"); wrap.appendChild(cnt);
      /* the text */
      var max = maxOf(s), pre = prefixOf(s);
      var f3 = h("div", "pm-field");
      var l3 = h("label", "pm-label", "Text"); l3.setAttribute("for", "ib-bk-t"); f3.appendChild(l3);
      if (pre) f3.appendChild(h("p", "pm-hint ib-sms-prefix", "Every text starts with: " + pre));
      var ta = h("textarea", "pm-input ib-ta"); ta.setAttribute("id", "ib-bk-t"); ta.setAttribute("rows", "4"); ta.setAttribute("aria-describedby", "ib-bk-c ib-bk-e");
      if (max !== null) ta.setAttribute("maxlength", String(max + 40));
      ta.value = st.text; f3.appendChild(ta); wrap.appendChild(f3);
      var count = h("span", "ib-count", roomLeft(st.text.length, max)); count.setAttribute("id", "ib-bk-c");
      var err = h("p", "field-err", ""); err.setAttribute("id", "ib-bk-e"); err.setAttribute("role", "alert"); err.hidden = true;
      var pr = h("label", "ib-bk-tick"), prc = D.el("input", { type: "checkbox", id: "ib-bk-promo" }); prc.checked = st.promo;
      prc.addEventListener("change", function () { st.promo = !!prc.checked; st.key = null; });
      add(pr, prc, h("span", "", "Promotional"));
      wrap.appendChild(err);
      wrap.appendChild(add(h("div", "ib-rfoot"), count, pr));
      ta.addEventListener("input", function () {
        st.text = ta.value; st.err = ""; st.testNote = ""; st.sure = false; st.key = null; st.preview = null; st.prevErr = "";
        count.textContent = roomLeft(ta.value.length, max);
        fieldErr(); drawPreview(); drawConfirm(); schedulePreview();
      });
      var pv = h("div", "ib-bk-box"); pv.setAttribute("id", "ib-bk-preview"); wrap.appendChild(pv);
      var t = ui.btn("Send a test to my phone", "ghost", function (x) { sendTest(x); }); t.setAttribute("id", "ib-bk-test");
      var tn = h("p", "pm-hint", ""); tn.setAttribute("id", "ib-bk-testnote"); tn.setAttribute("role", "status");
      wrap.appendChild(t); wrap.appendChild(tn);
      var cf = h("div", "ib-bk-confirm"); cf.setAttribute("id", "ib-bk-confirm"); wrap.appendChild(cf);
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
      if (st.audLoading || !st.aud) { box.appendChild(h("p", "pm-meta", "Counting members…")); return; }
      if (st.aud.failed) { box.appendChild(h("p", "pm-meta", "We could not count your members just now.")); box.appendChild(ui.btn("Try again", "ghost", function () { readAudience(); })); return; }
      var n = num(st.aud.will_send);
      box.appendChild(h("p", "ib-bk-will", willSend(n)));
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
      add(tick, c, h("span", "", "Send to " + plural(n, "member", "members") + " from your phone?"));
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
      D.call("POST", b0 + "batches/", { text: st.text.trim(), audience: st.audience, promotional: st.promo, idempotency_key: key, confirm: true, expected_count: n }, true).then(function (res) {
        st.sending = false;
        if (!aliveRes(res)) return;
        if (res.status === 404) { gone(); return; }
        if (!res.ok) {
          if (res.status !== 0) st.key = null; /* a lost answer keeps the key so nothing is sent twice */
          st.sure = false;
          var code = res.data && res.data.code;
          /* The count moved since the owner looked (D.call keeps only the code and the message): say so, read it again, ask for a new tick. */
          if (res.status === 409 && code === "audience_changed") { st.err = refusal(res, "Your member count changed. Check the new count and send again."); readAudience(); fieldErr(); return; }
          if (res.status === 409) { st.err = refusal(res); readStatus(); return; }
          st.err = refusal(res, "The batch could not be started."); draw(); fieldErr(); return;
        }
        st.key = null; st.sure = false; st.text = ""; st.preview = null; st.prevErr = ""; st.testNote = ""; st.note = ""; st.aud = null;
        st.status.active_batch = res.data;
        ui.say("Sending started.");
        draw(); schedulePoll();
      });
    }

    /* ----- history and batch detail ----- */
    function openHistory() {
      st.view = "history"; st.hist = { items: [], next: null, loading: true, failed: false };
      if (st.poll) { clearTimeout(st.poll); st.poll = null; }
      draw(); loadHistory(null);
    }
    function backToMain() { st.view = "main"; st.det = null; st.aud = null; readStatus(); draw(); }
    function loadHistory(cursor) {
      var h0 = st.hist; h0.loading = true; h0.failed = false;
      D.call("GET", b0 + "batches/?limit=20" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""), null, true).then(function (res) {
        if (!aliveRes(res) || st.hist !== h0) return;
        if (res.status === 404) { gone(); return; }
        h0.loading = false;
        if (!res.ok || !res.data) h0.failed = true;
        else { h0.items = h0.items.concat(Array.isArray(res.data.items) ? res.data.items : []); h0.next = res.data.next_cursor || null; }
        if (st.view === "history") draw();
      });
    }
    function drawHistory() {
      host.appendChild(head("History", "Your batches, newest first.", function () { backToMain(); }, "Back"));
      var body = h("div", "ib-msgs ib-sms-new ib-bk"); body.setAttribute("tabindex", "-1"); host.appendChild(body);
      var hs = st.hist;
      if (hs.failed && !hs.items.length) { body.appendChild(h("p", "pm-meta", "We could not load your batches just now.")); body.appendChild(ui.btn("Try again", "primary", function () { hs.failed = false; loadHistory(null); draw(); })); return; }
      if (hs.loading && !hs.items.length) { body.appendChild(h("p", "pm-meta ib-loading", "Loading…")); return; }
      if (!hs.items.length) { body.appendChild(h("p", "pm-meta", "No batches yet.")); return; }
      var list = h("ul", "ib-bk-hist");
      hs.items.forEach(function (b) {
        var li = h("li", ""), row = h("button", "ib-bk-row"); row.setAttribute("type", "button");
        var top = h("span", "ib-bk-rtop"); top.appendChild(h("span", "ib-bk-when", when(b.created_at))); top.appendChild(h("span", "ib-bk-chip is-" + (b.state || "waiting"), stateText(b.state)));
        row.appendChild(top);
        row.appendChild(h("span", "ib-bk-rsum", plural(num(b.size), "member", "members") + " · " + audienceName(b.audience) + " · Sent " + num(b.sent) + ", Failed " + num(b.failed) + ", Not sent " + num(b.not_sent)));
        if (b.text) row.appendChild(h("span", "ib-bk-rtext", b.text));
        row.addEventListener("click", function () { openDetail(b); });
        li.appendChild(row); list.appendChild(li);
      });
      body.appendChild(list);
      if (hs.next) body.appendChild(ui.btn("Show more", "ghost", function (x) { ui.busy(x, true); loadHistory(hs.next); }));
      else if (hs.failed) body.appendChild(h("p", "pm-meta", "We could not load more."));
    }
    function openDetail(b) {
      st.view = "detail"; st.det = { batch: b, results: [], next: null, loading: true, failed: false };
      draw(); loadDetail(null);
    }
    function loadDetail(cursor) {
      var d0 = st.det; d0.loading = true; d0.failed = false;
      D.call("GET", b0 + "batches/" + encodeURIComponent(d0.batch.id) + "/?limit=" + PAGE + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""), null, true).then(function (res) {
        if (!aliveRes(res) || st.det !== d0) return;
        if (res.status === 404) { gone(); return; }
        d0.loading = false;
        if (!res.ok || !res.data) d0.failed = true;
        else { d0.batch = res.data; d0.results = d0.results.concat(Array.isArray(res.data.results) ? res.data.results : []); d0.next = res.data.next || null; }
        if (st.view === "detail") draw();
      });
    }
    function drawDetail() {
      var d0 = st.det, b = d0.batch;
      host.appendChild(head("Batch", when(b.created_at), function () { st.view = "history"; st.det = null; draw(); }, "History"));
      var body = h("div", "ib-msgs ib-sms-new ib-bk"); body.setAttribute("tabindex", "-1"); host.appendChild(body);
      var card = h("div", "ib-bk-card");
      var top = h("div", "ib-bk-top"); top.appendChild(h("h3", "", stateText(b.state))); top.appendChild(h("span", "ib-bk-chip is-" + (b.state || "waiting"), audienceName(b.audience) + (b.promotional ? " · Promotional" : "")));
      card.appendChild(top); card.appendChild(countsRow(b));
      if (typeof b.end_message === "string" && b.end_message) card.appendChild(note(b.end_message, true));
      card.appendChild(lines(b));
      body.appendChild(card);
      if (d0.failed && !d0.results.length) { body.appendChild(h("p", "pm-meta", "We could not load the recipients just now.")); body.appendChild(ui.btn("Try again", "ghost", function () { loadDetail(null); draw(); })); return; }
      if (d0.loading && !d0.results.length) { body.appendChild(h("p", "pm-meta ib-loading", "Loading…")); return; }
      var ul = h("ul", "ib-bk-rec");
      d0.results.forEach(function (r) {
        var li = h("li", "ib-bk-recrow");
        var l = h("span", "ib-bk-recwho"); l.appendChild(h("strong", "", typeof r.name === "string" && r.name ? r.name : "Member")); l.appendChild(h("span", "ib-bk-mob", maskMobile(r.mobile)));
        var s = h("span", "ib-bk-recst"); s.appendChild(h("span", "ib-bk-chip is-r-" + (r.state || "waiting"), recipientState(r.state)));
        if (typeof r.reason_text === "string" && r.reason_text) s.appendChild(h("span", "ib-bk-reason", r.reason_text));
        add(li, l, s); ul.appendChild(li);
      });
      body.appendChild(ul);
      if (d0.next) body.appendChild(ui.btn("Show more", "ghost", function (x) { ui.busy(x, true); loadDetail(d0.next); }));
    }

    readStatus();
    return { stop: stop };
  }

  root.NOInboxBulk = { probe: probe, screen: screen,
    util: { available: available, audienceName: audienceName, willSend: willSend, leftOut: leftOut, maxOf: maxOf, prefixOf: prefixOf, roomLeft: roomLeft, problem: problem,
      estimate: estimate, active: active, pauseText: pauseText, stateText: stateText, recipientState: recipientState, maskMobile: maskMobile, blockedText: blockedText,
      refusal: refusal, AUDIENCES: AUDIENCES, LEFT_OUT: LEFT_OUT, NO_LINE: NO_LINE, PAGE: PAGE } };
})(typeof window !== "undefined" ? window : globalThis);
