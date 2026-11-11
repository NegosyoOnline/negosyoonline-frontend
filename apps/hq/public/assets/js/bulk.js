/* The Bulk SMS page: the list of bulk sends with Stop, the three steps (write the text and choose who gets it,
   check and confirm, progress) at /inbox/sms/bulk/ (plan 9, ClickUp z8uq9me128). One address; a batch opens
   inside it, its id held in memory. The page decides nothing about access or validity: the backend does, and
   the page follows its answer. Nothing is stored in the browser. The source (the file's text, the pasted
   numbers or the group ids) lives in a variable from the check until the confirm, a refusal that closes the
   check, a change to the form, or the page being left (pagehide). The fields that hold a number or a file are
   autocomplete="off" and are cleared at the confirm and on pagehide. A full number is written nowhere except
   into the one file the person asks for. There is no timer that asks the backend anything: the list and the
   progress refresh on Refresh and when the tab becomes visible. Names and reasons are written with textContent. */
(function () {
  var H = window.NOHq, $ = function (id) { return document.getElementById(id); };
  var BOOT = ["boot", "v-page", "v-closed", "v-down"];
  var MAX_FILE = 1048576;
  var SHOWN_REFUSED = 200;
  var DOWN = "That did not go through. Check the list before trying again.";
  /* The words for what the backend gives. A value with no words here shows the plain fallback, never itself. */
  var REFUSED = { "The mobile number is not a Philippine mobile.": "Not a Philippine mobile number" };
  var NOT_SENT = { phone_failed: "the gateway phone could not send it", no_report: "the phone did not report back",
    expired: "the phone did not take it in time", staff_limit: "today's limit was reached", day_ended: "the day ended",
    stopped: "the batch was stopped", record_gone: "its record was gone" };
  var SOURCES = { groups: "Groups", file: "CSV file", pasted: "Pasted numbers" };
  var BLOCKED = { running: "A batch is already sending.",
    incoming_off: "Bulk texts need incoming texts to be on, so that replies of STOP are kept.",
    no_room: "No texts are left for bulk today." };
  var SHOWN_CODES = { invalid_request: 1, invalid_text: 1, file_too_large: 1, invalid_file: 1 };

  var status = {}, groups = [], groupsWhy = "", items = [], cursor = null;
  var held = null, checked = null, requestId = "", busy = false;
  var current = null, rows = [], rowsCursor = null, rowsGone = false, runRefresh = 0;
  var dialog = null, opener = null, popRun = null, closedByUs = false;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.setAttribute("class", cls);
    if (text != null) n.textContent = text;
    return n;
  }
  function say(id, text) { $(id).textContent = text || ""; $(id).hidden = !text; }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
  function text(v) { return typeof v === "string" ? v : ""; }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function plural(n, one, many) { return fmt(n) + " " + (n === 1 ? one : many); }
  function words(map, key) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : ""; }
  function showBoot(view) { BOOT.forEach(function (id) { $(id).hidden = id !== view; }); }
  function fieldMessage(res, name) {
    var f = res.fields && res.fields[name];
    return Array.isArray(f) && typeof f[0] === "string" ? f[0] : "";
  }
  /* True when the answer sent the person to sign in or to the second step. */
  function left(res) {
    var place = H.placeFor(res);
    if (place === "verify") { location.replace("/verify/"); return true; }
    if (place === "sign-in") { location.replace("/sign-in/"); return true; }
    return false;
  }
  /* A message the backend wrote, shown only for the codes this page names; any other answer gets the fixed sentence. */
  function shownOr(res, fallback) {
    return SHOWN_CODES[res.code] === 1 && res.message ? res.message : fallback;
  }

  /* ---- times and words ---- */

  /* "Today, 9:12 AM", "Yesterday, 8:40 AM" or "9 Nov, 2:05 PM", in Manila. */
  function dayParts(d) {
    var p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", day: "numeric", month: "short", year: "numeric", hour: "numeric",
      minute: "2-digit", hour12: true }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p;
  }
  function whenWords(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return "";
    var p = dayParts(d), now = dayParts(new Date()), y = dayParts(new Date(Date.now() - 86400000));
    var key = function (q) { return q.year + q.month + q.day; };
    var clock = p.hour + ":" + p.minute + " " + p.dayPeriod;
    if (key(p) === key(now)) return "Today, " + clock;
    if (key(p) === key(y)) return "Yesterday, " + clock;
    return p.day + " " + p.month + ", " + clock;
  }
  /* One figure, rounded up to the hour, or "Under an hour". The backend's own figure when it sends one. */
  function timeLeft(b) {
    var s = typeof b.seconds_left === "number" ? b.seconds_left : num(b.waiting) * 21.5;
    if (s <= 3600) return "Under an hour";
    var h = Math.ceil(s / 3600);
    return "About " + plural(h, "hour", "hours");
  }
  function active(b) { return b.state === "waiting" || b.state === "sending"; }
  function notSent(b) { return num(b.not_sent) + num(b.failed); }
  function handled(b) { return num(b.sent) + notSent(b); }
  function countsLine(b) {
    var size = fmt(num(b.size)), who = text(b.who), ns = fmt(notSent(b));
    if (b.state === "waiting") return size + " texts. Waiting for the phone.";
    if (b.state === "sending") return fmt(num(b.sent)) + " of " + size + " sent, " + ns + " not sent, " + fmt(num(b.waiting)) +
      " waiting. " + timeLeft(b) + " left. Started by " + who + ".";
    if (b.state === "stopped") return "Stopped at " + fmt(handled(b)) + " of " + size + " by " + who + ": " + fmt(num(b.sent)) + " sent, " +
      ns + " not sent, " + fmt(num(b.waiting)) + " never sent.";
    return fmt(handled(b)) + " of " + size + " handled: " + fmt(num(b.sent)) + " sent, " + ns + " not sent. Started by " + who + ".";
  }
  function stateChip(b) {
    var c;
    if (b.state === "waiting") c = el("span", "chip chip-warn", "Waiting");
    else if (b.state === "sending") { c = el("span", "chip chip-info"); c.appendChild(el("span", "dot")); c.appendChild(el("span", "", "Still sending")); }
    else if (b.state === "finished") c = el("span", "chip chip-ok", "Finished");
    else c = el("span", "chip chip-neutral", b.state === "stopped" ? "Stopped" : "Not known");
    return c;
  }
  function barFor(b) {
    var bar = el("div", "bar"), fill = el("span"), size = num(b.size), done = handled(b);
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", String(size));
    bar.setAttribute("aria-valuenow", String(done));
    bar.setAttribute("aria-label", fmt(done) + " of " + fmt(size) + " handled");
    fill.style.width = (size ? Math.min(100, Math.round(done * 100 / size)) : 0) + "%";
    bar.appendChild(fill);
    return bar;
  }

  /* ---- one decision at a time: the pop-up (Coach Ed's rule: no Cancel, a full-width primary, X, Escape) ---- */

  function all(box, test) {
    var out = [];
    (function walk(n) {
      for (var i = 0; i < n.childNodes.length; i++) {
        var c = n.childNodes[i];
        if (c.tagName) { if (test(c)) out.push(c); walk(c); }
      }
    })(box);
    return out;
  }
  function focusables(box) {
    return all(box, function (n) { return (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "BUTTON") && !n.disabled && !n.hidden; });
  }
  function inside(box, n) { for (; n; n = n.parentNode) if (n === box) return true; return false; }
  function onKey(e) {
    if (!dialog) return;
    if (e.key === "Escape") { if (!closedByUs) closePop(true); return; }
    if (e.key !== "Tab") return;
    var f = focusables(dialog), first = f[0], last = f[f.length - 1], at = document.activeElement;
    if (!f.length) { e.preventDefault(); return; }
    if (!inside(dialog, at)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  }
  function openPop(from, title, sub, go, run) {
    opener = from;
    popRun = run;
    $("pop-h").textContent = title;
    $("pop-sub").textContent = sub;
    $("pop-go").textContent = go;
    say("pop-err", "");
    dialog = $("m-pop");
    dialog.hidden = false;
    document.body.classList.add("modal-open");
    document.addEventListener("keydown", onKey);
    $("pop-go").focus();
  }
  function closePop(refocus) {
    if (!dialog) return;
    dialog.hidden = true;
    dialog = null;
    popRun = null;
    document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", onKey);
    if (refocus && opener && !opener.hidden) opener.focus();
  }
  function lock(on) { closedByUs = on; $("pop-go").disabled = on; $("pop-x").disabled = on; }
  $("pop-x").addEventListener("click", function () { if (!closedByUs) closePop(true); });
  $("pop-go").addEventListener("click", function () {
    if (closedByUs || !popRun) return;
    lock(true);
    say("pop-err", "");
    popRun(function () { lock(false); closePop(false); }, function (msg) { lock(false); say("pop-err", msg); });
  });

  /* ---- the list of bulk sends ---- */

  function rowFor(b) {
    var li = el("li", "batch"), main = el("div", "batch-main"), end = el("div", "batch-end"), title = el("span", "batch-title");
    var when = whenWords(b.when), src = words(SOURCES, b.source) || "Bulk send";
    title.appendChild(el("span", "", (when ? when + " · " : "") + src));
    title.appendChild(stateChip(b));
    main.appendChild(title);
    main.appendChild(el("span", "item-sub", countsLine(b)));
    if (active(b)) main.appendChild(barFor(b));
    var view = el("button", "no-btn no-btn-ghost", "View");
    view.setAttribute("type", "button");
    view.addEventListener("click", function () { openBatch(b); });
    end.appendChild(view);
    if (active(b)) {
      var stop = el("button", "no-btn no-btn-ghost stop", "Stop sending");
      stop.setAttribute("type", "button");
      stop.addEventListener("click", function () { askStop(b, stop); });
      end.appendChild(stop);
    }
    li.appendChild(main);
    li.appendChild(end);
    return li;
  }
  function renderRows() {
    $("rows").textContent = "";
    items.forEach(function (b) { $("rows").appendChild(rowFor(b)); });
    $("l-empty").hidden = items.length > 0;
    $("l-foot").hidden = !cursor;
  }
  function loadList(more) {
    var body = {};
    if (more && cursor) body.cursor = cursor;
    return H.call("POST", "bulk/list/", body).then(function (res) {
      if (left(res)) return false;
      if (!res.ok) { say("msg", DOWN); return false; }
      var got = Array.isArray(res.data.results) ? res.data.results : [];
      var fresh = got.filter(function (b) { return b && typeof b.batch === "string"; });
      items = more ? items.concat(fresh) : fresh;
      cursor = typeof res.data.next === "string" && res.data.next ? res.data.next : null;
      renderRows();
      return true;
    });
  }
  $("more").addEventListener("click", function () { if (cursor) loadList(true); });

  /* ---- Stop ---- */

  function askStop(b, from) {
    var waiting = num(b.waiting);
    openPop(from, "Stop this batch?", "Texts already sent stay sent. " + plural(waiting, "text", "texts") + " that " + (waiting === 1 ? "has" : "have") +
      " not been sent will not be sent.", "Stop sending", function (done, fail) {
      H.call("POST", "bulk/stop/", { batch: b.batch }).then(function (res) {
        if (res.ok) { done(); say("msg", "Batch stopped."); refresh(); return; }
        if (left(res)) return;
        if (res.code === "not_running") { done(); say("msg", "That batch is no longer sending."); refresh(); return; }
        if (res.status === 404) { done(); say("msg", "That batch is no longer available."); refresh(); return; }
        fail(DOWN);
      });
    });
  }
  $("p-stop").addEventListener("click", function () { if (current && active(current)) askStop(current, $("p-stop")); });

  /* ---- step 3: the progress ---- */

  function reasonChip(r) {
    var state = text(r.state), reason = words(NOT_SENT, text(r.reason));
    if (state === "sent") return el("span", "chip chip-ok", "Sent");
    if (state === "waiting") return el("span", "chip chip-warn", "Waiting");
    if (state === "queued") return el("span", "chip chip-warn", "With the phone");
    return el("span", "chip chip-neutral", reason ? "Not sent: " + reason : "Not sent");
  }
  function paintStrip(b) {
    var s = $("p-strip");
    s.textContent = "";
    s.appendChild(el("span", "chip chip-ok", fmt(num(b.sent)) + " sent"));
    s.appendChild(el("span", "chip chip-warn", fmt(num(b.waiting)) + " waiting"));
    s.appendChild(el("span", "chip chip-neutral", fmt(notSent(b)) + " not sent"));
    if (active(b)) s.appendChild(el("span", "chip chip-neutral", timeLeft(b)));
  }
  function paintProgress() {
    var b = current;
    $("b-step3").hidden = !b;
    if (!b) return;
    var size = num(b.size), done = handled(b), bar = $("p-bar");
    $("p-fill").style.width = (size ? Math.min(100, Math.round(done * 100 / size)) : 0) + "%";
    bar.setAttribute("aria-valuemax", String(size));
    bar.setAttribute("aria-valuenow", String(done));
    bar.setAttribute("aria-label", fmt(done) + " of " + fmt(size) + " handled");
    paintStrip(b);
    $("p-stop").hidden = !active(b);
    $("p-rows").textContent = "";
    rows.forEach(function (r) {
      var li = el("li");
      li.appendChild(el("span", "item-num", text(r.number)));
      li.appendChild(reasonChip(r));
      $("p-rows").appendChild(li);
    });
    $("p-gone").hidden = !(rowsGone && !rows.length);
    $("p-foot").hidden = !rowsCursor;
  }
  function takeBatch(d) {
    var keep = {};
    ["batch", "state", "when", "who", "source", "size", "sent", "failed", "not_sent", "waiting", "left_out", "text_length", "seconds_left"].forEach(function (k) { keep[k] = d[k]; });
    return keep;
  }
  /* Loads a batch's first page of numbers (or the next page when more is true). */
  function loadOpen(more) {
    if (!current) return Promise.resolve();
    var id = current.batch, body = { batch: id, limit: 100 }, run = ++runRefresh;
    if (more && rowsCursor) body.cursor = rowsCursor;
    return H.call("POST", "bulk/open/", body).then(function (res) {
      if (run !== runRefresh || !current || current.batch !== id) return;
      if (left(res)) return;
      if (res.status === 404) { current = null; paintProgress(); say("msg", "That batch is no longer available."); return; }
      if (!res.ok) { say("msg", DOWN); return; }
      current = takeBatch(res.data);
      var got = Array.isArray(res.data.results) ? res.data.results : [];
      rows = more ? rows.concat(got) : got;
      rowsCursor = typeof res.data.next === "string" && res.data.next ? res.data.next : null;
      rowsGone = !rows.length;
      paintProgress();
    });
  }
  function openBatch(b) {
    current = takeBatch(b);
    rows = [];
    rowsCursor = null;
    rowsGone = false;
    paintProgress();
    return loadOpen(false);
  }
  $("p-more").addEventListener("click", function () { if (rowsCursor) loadOpen(true); });

  /* The form is shown while no batch is sending; it is dropped while one is. */
  function syncForm() {
    var running = items.some(active);
    $("v-form").hidden = running || (status && status.running === true);
    if (!$("v-form").hidden) { /* free to start a batch */ }
    else { dropCheck(); }
  }
  function runningRow() {
    for (var i = 0; i < items.length; i++) if (active(items[i])) return items[i];
    return null;
  }
  function paintStatus() {
    var kept = num(status.reserved_for_codes), cap = 2000;
    $("b-rule-reserve").textContent = fmt(kept) + " texts a day are kept for sign-in codes. Bulk SMS stops at " + fmt(cap - kept) + ".";
    $("b-optout-text").textContent = text(status.opt_out_line).trim();
    paintCount();
  }
  /* Reads the list and the status again, then the open batch. */
  function refresh() {
    if (busy) return Promise.resolve();
    return H.call("POST", "bulk/status/").then(function (st) {
      if (left(st)) return;
      if (st.status === 404) { showBoot("v-closed"); return; }
      if (!st.ok) { say("msg", DOWN); return; }
      status = st.data;
      paintStatus();
      return loadList(false).then(function (ok) {
        if (!ok) return;
        if (current) {
          var fresh = items.filter(function (b) { return b.batch === current.batch; })[0];
          if (fresh) current = takeBatch(fresh);
          return loadOpen(false).then(syncForm);
        }
        var run = runningRow();
        if (run) return openBatch(run).then(syncForm);
        syncForm();
      });
    });
  }
  $("refresh").addEventListener("click", function () { refresh(); });
  document.addEventListener("visibilitychange", function () { if (document.hidden !== true && !$("v-page").hidden) refresh(); });

  /* ---- step 1: write the text and choose who gets it ---- */

  function textLimit() { return num(status.text_max) + text(status.opt_out_line).length; }
  function paintCount() {
    var n = String($("b-text").value || "").length + text(status.opt_out_line).length, max = textLimit() || 160;
    $("b-count").textContent = fmt(n) + " / " + max;
    $("b-count").classList.toggle("over", n > max);
    $("b-check").disabled = n > max || busy;
  }
  function chosen() { return $("to-file").checked ? "file" : $("to-paste").checked ? "pasted" : "groups"; }
  function paintSource() {
    var s = chosen();
    $("o-groups").classList.toggle("on", s === "groups");
    $("o-file").classList.toggle("on", s === "file");
    $("o-paste").classList.toggle("on", s === "pasted");
  }
  function chosenGroups() {
    return all($("b-groups"), function (n) { return n.tagName === "INPUT" && n.checked; }).map(function (n) { return n.getAttribute("value"); });
  }
  function paintGroups() {
    $("b-groups").textContent = "";
    groups.forEach(function (g) {
      var label = el("label"), box = el("input");
      box.setAttribute("type", "checkbox");
      box.setAttribute("value", g.id);
      box.addEventListener("change", dropCheck);
      label.appendChild(box);
      label.appendChild(el("span", "", g.name));
      label.appendChild(el("span", "small", plural(g.count, "contact", "contacts")));
      $("b-groups").appendChild(label);
    });
    $("to-groups").disabled = !!groupsWhy;
    $("b-groups-hint").textContent = groupsWhy || "A contact in two groups gets one text. Contacts who replied STOP are skipped.";
    if (groupsWhy && chosen() === "groups") { $("to-paste").checked = true; paintSource(); }
  }
  function clearInputs() {
    $("b-list").value = "";
    $("b-file").value = "";
    $("b-confirm").value = "";
  }
  /* Drops what was checked, and the source held for the confirm. */
  function dropCheck() {
    held = null;
    checked = null;
    requestId = "";
    $("b-step2").hidden = true;
    say("b-err2", "");
    $("b-confirm").value = "";
    $("b-send").disabled = true;
  }
  $("b-text").addEventListener("input", function () { dropCheck(); say("b-text-err", ""); paintCount(); });
  $("b-list").addEventListener("input", dropCheck);
  $("b-file").addEventListener("change", function () { dropCheck(); say("b-file-err", ""); });
  ["to-groups", "to-file", "to-paste"].forEach(function (id) {
    $(id).addEventListener("change", function () { dropCheck(); say("b-src-err", ""); paintSource(); });
  });
  /* The page is being left (or put in the page cache): nothing typed or chosen stays. */
  window.addEventListener("pagehide", function () {
    held = null;
    checked = null;
    requestId = "";
    clearInputs();
  });

  function clearErrors() { ["b-text-err", "b-file-err", "b-src-err", "b-err", "b-err2"].forEach(function (id) { say(id, ""); }); }
  function fail(res, where) {
    if (left(res)) return;
    if (res.status === 404) {
      /* "Not found" is both a group that is gone and Bulk SMS being closed: the status tells which. */
      if (held && held.source === "groups" || chosen() === "groups") say("b-src-err", "A group is no longer available. Check the list again.");
      else say(where, DOWN);
      refresh();
      return;
    }
    if (res.code === "invalid_text") { say("b-text-err", fieldMessage(res, "text") || res.message || DOWN); return; }
    if (res.code === "invalid_file") { say("b-file-err", shownOr(res, DOWN)); return; }
    if (res.code === "file_too_large") { say(chosen() === "file" ? "b-file-err" : "b-src-err", shownOr(res, DOWN)); return; }
    if (res.code === "invalid_request") {
      var m = fieldMessage(res, "numbers") || fieldMessage(res, "csv") || fieldMessage(res, "groups") || fieldMessage(res, "source");
      say("b-src-err", m || shownOr(res, DOWN));
      return;
    }
    if (res.code === "changed") { dropCheck(); say("b-err", "The list changed since it was checked. Check it again."); return; }
    if (res.code === "batch_running" || res.code === "incoming_off" || res.code === "no_room") {
      var k = res.code === "batch_running" ? "running" : res.code;
      dropCheck();
      say("b-err", BLOCKED[k]);
      refresh();
      return;
    }
    say(where, DOWN);
  }

  /* Builds the source part of a body. Resolves null (and says why) when it cannot. */
  function readSource() {
    var s = chosen(), body = { text: String($("b-text").value || ""), source: s };
    if (s === "groups") {
      body.groups = chosenGroups();
      if (!body.groups.length) { say("b-src-err", "Choose at least one group."); return Promise.resolve(null); }
      return Promise.resolve(body);
    }
    if (s === "pasted") {
      body.numbers = String($("b-list").value || "");
      if (!body.numbers.trim()) { say("b-src-err", "Paste the numbers."); return Promise.resolve(null); }
      return Promise.resolve(body);
    }
    var files = $("b-file").files, f = files && files[0];
    if (!f) { say("b-file-err", "Choose a CSV file."); return Promise.resolve(null); }
    if (f.size > MAX_FILE) { say("b-file-err", "The file is over 1 MB."); return Promise.resolve(null); }
    return f.text().then(function (t) { body.csv = t; return body; }, function () { say("b-file-err", "The file could not be read."); return null; });
  }
  $("b-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    clearErrors();
    dropCheck();
    busy = true;
    paintCount();
    readSource().then(function (body) {
      if (!body) { busy = false; paintCount(); return; }
      return H.call("POST", "bulk/check/", body).then(function (res) {
        busy = false;
        paintCount();
        if (!res.ok) { fail(res, "b-err"); return; }
        held = body;
        showCheck(res.data);
      });
    }).then(null, function () { busy = false; paintCount(); say("b-err", DOWN); });
  });

  /* ---- step 2: check and confirm ---- */

  function showCheck(d) {
    checked = { read: num(d.lines_read), dups: num(d.duplicates), refusedCount: num(d.refused_count), opted: num(d.opted_out),
      eligible: num(d.eligible), used: num(d.used_today), room: num(d.left_today), size: num(d.size), later: num(d.left_out),
      min: num(d.seconds_min), max: num(d.seconds_max), blocked: text(d.blocked), refused: Array.isArray(d.refused) ? d.refused : [] };
    var c = checked;
    $("f-read").textContent = fmt(c.read);
    $("f-dedup").textContent = fmt(c.read - c.refusedCount - c.dups);
    $("f-elig").textContent = fmt(c.eligible);
    $("f-left").textContent = fmt(c.room);
    $("f-size").textContent = fmt(c.size);
    $("f-later").textContent = fmt(c.later);
    $("f-refused").textContent = fmt(c.refusedCount);
    $("f-refused-box").hidden = !(c.refusedCount > 0);
    var blocked = words(BLOCKED, c.blocked);
    say("b-blocked", blocked);
    if (c.blocked === "running") {
      var a = el("a", "", " See the list.");
      a.setAttribute("href", "#bs-h");
      $("b-blocked").appendChild(a);
    }
    var cut = c.later > 0 && !blocked;
    $("b-cut").hidden = !cut;
    $("b-cut-text").textContent = "This batch is cut to the first " + fmt(c.size) + " numbers, all the texts left for bulk today: " + fmt(c.used) +
      " are used, and " + fmt(num(status.reserved_for_codes)) + " of the 2,000 are kept for sign-in codes. The other " + fmt(c.later) +
      " are not sent; download them as a CSV file for a later batch.";
    $("b-refused").textContent = "";
    c.refused.slice(0, SHOWN_REFUSED).forEach(function (r) {
      var li = el("li");
      li.appendChild(el("span", "item-num", "Line " + (r && typeof r.line === "number" ? r.line : "")));
      li.appendChild(el("span", "chip chip-neutral", words(REFUSED, r && r.reason) || "Refused"));
      $("b-refused").appendChild(li);
    });
    say("b-refused-more", c.refusedCount > SHOWN_REFUSED ? "Showing the first " + SHOWN_REFUSED + " of " + fmt(c.refusedCount) + " refused lines." : "");
    $("b-time").textContent = c.size > 0 && !blocked ? "About " + hours(c.min) + " to " + hours(c.max) + " to send, at one text every 18 to 25 seconds." : "";
    var canSend = !blocked && c.size > 0;
    $("b-confirm-row").hidden = !(canSend || c.refused.length);
    $("b-confirm-label").textContent = "Type " + fmt(c.size) + " to confirm";
    $("b-confirm").parentNode.hidden = !canSend;
    $("b-send").hidden = !canSend;
    $("b-send").textContent = "Send this batch of " + fmt(c.size);
    $("b-send").disabled = true;
    $("b-confirm").value = "";
    $("b-left-dl").hidden = !(cut && downloads());
    $("b-left-dl").textContent = "Download the " + fmt(c.later) + " not in this batch";
    $("b-left-note").hidden = $("b-left-dl").hidden;
    $("b-ref-dl").hidden = !(c.refused.length && downloads());
    $("b-step2").hidden = false;
  }
  function hours(seconds) {
    var h = seconds / 3600;
    if (h < 1) return "under an hour";
    var n = Math.round(h);
    return n === 1 ? "1 hour" : n + " hours";
  }
  $("b-confirm").addEventListener("input", function () {
    $("b-send").disabled = !(checked && checked.size > 0 && String($("b-confirm").value || "").trim() === String(checked.size));
  });

  function downloads() { return typeof Blob !== "undefined" && typeof URL !== "undefined" && !!URL.createObjectURL; }
  /* Hands a Blob to the browser as a download and frees its address: at once, or after delay milliseconds, so the
     browser has taken the file. */
  function save(blob, name, delay) {
    var url = null;
    try {
      url = URL.createObjectURL(blob);
      var a = el("a");
      a.setAttribute("href", url);
      a.setAttribute("download", name);
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) { return false; }
    if (delay > 0) setTimeout(function () { URL.revokeObjectURL(url); }, delay);
    else URL.revokeObjectURL(url);
    return true;
  }
  $("b-ref-dl").addEventListener("click", function () {
    if (!checked || !checked.refused.length) return;
    var lines = ["Line,Reason"];
    checked.refused.slice(0, SHOWN_REFUSED).forEach(function (r) { lines.push((r && typeof r.line === "number" ? r.line : "") + "," + (words(REFUSED, r && r.reason) || "Refused")); });
    if (!save(new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv" }), "refused-lines.csv", 0)) { $("b-ref-dl").hidden = true; say("b-err2", "The browser stopped the download."); }
  });
  $("b-left-dl").addEventListener("click", function () {
    if (!held || busy) return;
    busy = true;
    say("b-err2", "");
    H.file("bulk/left-out/", held).then(function (res) {
      busy = false;
      if (!res.ok) {
        if (res.status === 401) { left({ ok: false, status: 401, code: res.code }); return; }
        say("b-err2", res.code === "nothing_left_out" ? "Nothing is left out." : DOWN);
        return;
      }
      if (!save(res.blob, "not-in-this-batch.csv", 1500)) { $("b-left-dl").hidden = true; $("b-left-note").hidden = true; say("b-err2", "The browser stopped the download."); }
    });
  });

  function freshId() {
    var c = window.crypto, bytes = new Uint8Array(16), out = "", i;
    if (!c || typeof c.getRandomValues !== "function") return "";
    c.getRandomValues(bytes);
    for (i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    return out;
  }
  $("b-send").addEventListener("click", function () {
    if (busy || !checked || !held || checked.size < 1) return;
    if (String($("b-confirm").value || "").trim() !== String(checked.size)) return;
    if (!requestId) requestId = freshId();
    if (!requestId) { say("b-err2", DOWN); return; }
    var body = { text: held.text, source: held.source, count: checked.size, request_id: requestId };
    ["groups", "csv", "numbers"].forEach(function (k) { if (held[k] !== undefined) body[k] = held[k]; });
    say("b-err2", "");
    busy = true;
    $("b-send").disabled = true;
    H.call("POST", "bulk/confirm/", body).then(function (res) {
      busy = false;
      if (!res.ok) {
        $("b-send").disabled = false;
        if (res.code === "changed" || res.code === "batch_running" || res.code === "incoming_off" || res.code === "no_room") { fail(res, "b-err2"); return; }
        if (left(res)) return;
        if (res.status === 404) { fail(res, "b-err2"); return; }
        if (SHOWN_CODES[res.code] === 1) { say("b-err2", shownOr(res, DOWN)); return; }
        say("b-err2", DOWN);
        return;
      }
      /* Started (201) or the same press answered again (200): the form and the check are dropped, with the source. */
      dropCheck();
      clearInputs();
      $("b-text").value = "";
      paintCount();
      say("msg", "Batch started.");
      current = takeBatch(res.data);
      rows = [];
      rowsCursor = null;
      rowsGone = false;
      paintProgress();
      refresh();
    });
  });

  /* ---- start ---- */

  function begin() {
    showBoot("v-page");
    paintStatus();
    paintSource();
    paintGroups();
    renderRows();
    var run = runningRow();
    if (run) openBatch(run);
    syncForm();
  }
  function start() {
    showBoot("boot");
    H.call("GET", "me/").then(function (res) {
      if (left(res)) return;
      if (!res.ok) { showBoot("v-down"); return; }
      window.NOHqShell.signedIn(res.data.email);
      return H.call("POST", "bulk/status/").then(function (st) {
        if (left(st)) return;
        if (st.status === 404) { showBoot("v-closed"); return; }
        if (!st.ok || st.data.bulk !== true) { showBoot("v-down"); return; }
        status = st.data;
        return H.call("POST", "contacts/groups/list/").then(function (gl) {
          if (left(gl)) return;
          if (gl.ok && Array.isArray(gl.data.results)) {
            groupsWhy = "";
            groups = gl.data.results.filter(function (g) { return g && typeof g.id === "string"; })
              .map(function (g) { return { id: g.id, name: text(g.name), count: num(g.count) }; });
          } else {
            groups = [];
            groupsWhy = gl.status === 404 ? "Contacts are not turned on." : "Groups could not be loaded.";
          }
          return loadList(false).then(function (ok) {
            if (!ok) { showBoot("v-down"); return; }
            begin();
          });
        });
      });
    });
  }
  $("retry").addEventListener("click", start);
  start();
})();
