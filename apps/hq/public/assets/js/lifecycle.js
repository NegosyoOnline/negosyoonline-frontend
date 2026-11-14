/* The Lifecycle page: the one approver reads the dry run of site erasure, proposes a batch of 1 to 25 due sites,
   reads the frozen batch and approves it by typing the line the page shows, cancels a batch, and places or
   releases holds (ClickUp z8uq9mb22v, plan docs/plans/2026-11-13-hq-lifecycle-page-plan.md, backend
   apps/lifecycle/staff.py). One address, two views held in memory: the overview, and one batch. Which batch is
   open is a variable, never in the address, so a reload returns to the overview.
   The page calls the seven staff routes and nothing else, with no timer. It decides nothing: the backend
   refuses what is wrong and this page's checks only save a round trip. Sites are shown by public id only;
   a code, a count key or a status this page has no words for is shown as the fallback words, never raw.
   Text the staff wrote (a hold's reference, an approval reason) is set as text, never as markup. */
(function () {
  var H = window.NOHq, F = window.NOFin, $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["boot", "v-main", "v-batch", "v-closed", "v-down"];
  var ROUTE = "lifecycle/erasure/";
  var NOWORDS = "a reason this page has no words for";
  var MAX_REASON = 300, MAX_REF = 100, MAX_SITES = 25, MAX_ATTEMPTS = 5, FINGERPRINT = 12;
  var LOST = "That did not go through. Check the batch before trying again.";
  var LOAD_ERR = "Could not load. Reload the page.";

  var TEMPLATE = { sante: "Sante" };
  var BATCH_STATUS = { proposed: ["chip-info", "Proposed"], approved: ["chip-info", "Approved"], running: ["chip-info", "Running"],
    done: ["chip-ok", "Done"], needs_attention: ["chip-warn", "Needs attention"], cancelled: ["chip-neutral", "Cancelled"] };
  var ITEM_STATUS = { pending: ["chip-neutral", "Waiting"], excluded: ["chip-neutral", "Excluded"], skipped: ["chip-warn", "Skipped"],
    erased: ["chip-ok", "Erased"], failed: ["chip-err", "Failed"] };
  /* Why a site was stopped, skipped or failed, as a label. */
  var REASON = { already_erased: "Already erased", held: "Held", payment_under_review: "Payment proof under review",
    unpaid_usage: "Open usage charges, an operator must decide", no_longer_due: "No longer due", date_changed: "The deletion date changed",
    retention_switched_off: "Account disposal is switched off", pack_purge_refused: "Pack records could not be cleared",
    store_unavailable: "The private file store could not be reached", error: "An error stopped it" };
  /* The same codes in a sentence after a site id, for a refused proposal. */
  var PROBLEM = { already_in_batch: "is already in a batch", not_due: "is not due yet", already_erased: "was already erased", held: "is held",
    payment_under_review: "has a payment proof under review", unpaid_usage: "has open usage charges an operator must decide",
    retention_switched_off: "would dispose of its account and account disposal is switched off" };
  var ACCOUNT_WHY = { catalog_owner: "it owns the shared catalog", other_live_site: "another site is live",
    retention_switched_off: "account disposal is switched off" };
  var HOLD = { legal: "Legal", fraud: "Fraud", dispute: "Dispute", regulator: "Regulator", other: "Other" };
  var COUNT = { sites: "Sites", business_profiles: "Business profiles", web_addresses_retired: "Web addresses retired",
    site_seal_files: "Seal files", sante_site_settings: "Site settings", site_payment_accounts: "Receiving accounts",
    site_payment_qr_files: "Payment QR files", members: "Members", member_sessions: "Member sessions",
    member_otp_challenges: "Member sign-in codes", member_address_events: "Member address events", pack_orders: "Pack orders",
    pack_proof_submissions: "Pack payment proofs", pack_proof_files: "Pack proof files", pack_checkout_tokens: "Pack checkout tokens",
    sante_registrations: "Sante registrations", shop_orders: "Shop orders", shop_proof_submissions: "Shop payment proofs",
    shop_proof_files: "Shop proof files", meta_settings: "Meta settings", meta_order_contexts: "Meta order contexts",
    inbox_conversations: "Inbox conversations", inbox_messages: "Inbox messages", inbox_contacts: "Inbox contacts",
    inbox_groups: "Inbox groups", inquiry_connections: "Inquiry connections", inquiry_conversations: "Inquiry conversations" };
  /* The counts that are private files the erasure deletes. Pack proof files stay (backend plan D14). */
  var DELETED_FILES = ["site_seal_files", "site_payment_qr_files", "shop_proof_files"];
  var RAN = { done: 1, needs_attention: 1, running: 1, approved: 1 };

  var known = false, loadRun = 0, listRun = 0, batchRun = 0, busy = false;
  var eligible = [], near = [], refused = [], bySite = {}, batches = [], holds = [];
  var listOk = false, batchesOk = false, retentionOn = true, firstBatch = false;
  var selected = {}, current = null, excluded = {}, opener = null;
  var dlg = F.dialogs(function () { return busy; });

  function show(view) { VIEWS.forEach(function (id) { $(id).hidden = id !== view; }); }
  function own(map, key) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null; }
  function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function plural(n, one, many) { return num(n) + " " + (n === 1 ? one : many); }
  function chip(cls, text) { return F.el("span", "chip " + cls, text); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function button(text, cls) { var b = F.el("button", cls || "no-btn no-btn-ghost", text); b.setAttribute("type", "button"); return b; }
  function call(path, body) { return H.call("POST", ROUTE + path, body); }

  /* ---- counts, in words ---- */

  function rowsOf(counts) {
    var t = 0;
    Object.keys(obj(counts)).forEach(function (k) { if (!/_files$/.test(k) && typeof counts[k] === "number") t += counts[k]; });
    return t;
  }
  function deletedFiles(counts) {
    var t = 0;
    DELETED_FILES.forEach(function (k) { if (typeof obj(counts)[k] === "number") t += counts[k]; });
    return t;
  }
  function plannedFiles(planned) { return typeof obj(planned).private_files === "number" ? planned.private_files : 0; }
  /* [label, number] for each count above zero; a key with no words is summed into "Other records". */
  function countLines(counts) {
    var lines = [], other = 0;
    Object.keys(obj(counts)).forEach(function (k) {
      var n = counts[k], label = own(COUNT, k);
      if (typeof n !== "number" || n <= 0) return;
      if (label) lines.push([label, n]); else other += n;
    });
    if (other) lines.push(["Other records", other]);
    return lines;
  }
  function totals(rows, files) { return plural(rows, "row", "rows") + " to blank or delete, " + plural(files, "private file", "private files"); }

  /* The row under a due site: the counts per table, in words. Hidden until Details opens it. */
  function details(counts, id, cols) {
    var tr = F.el("tr", "lc-detrow"), td = F.el("td", ""), box = F.el("div", "lc-det"), dl = F.el("dl", ""), lines = countLines(counts);
    tr.setAttribute("id", id);
    tr.hidden = true;
    td.setAttribute("colspan", String(cols));
    lines.forEach(function (l) {
      var d = F.el("div", "");
      d.appendChild(F.el("dt", "", l[0]));
      d.appendChild(F.el("dd", "", num(l[1])));
      dl.appendChild(d);
    });
    if (!lines.length) dl.appendChild(F.el("div", "", "Nothing to blank or delete."));
    box.appendChild(dl);
    td.appendChild(box);
    tr.appendChild(td);
    return tr;
  }
  function disclosure(box) {
    var b = button("Details");
    b.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-controls", box.getAttribute("id"));
    b.addEventListener("click", function () {
      var open = box.hidden;
      box.hidden = !open;
      b.setAttribute("aria-expanded", String(open));
    });
    return b;
  }

  /* ---- chips ---- */

  function accountChip(action, why) {
    if (action === "dispose") return chip("chip-info", "Account will be disposed of");
    if (action !== "keep") return chip("chip-warn", "Account step: " + NOWORDS);
    if (!why) return chip("chip-neutral", "Account kept");
    return chip("chip-neutral", "Account kept: " + (own(ACCOUNT_WHY, why) || NOWORDS));
  }
  function noticeChip(notice) {
    if (notice === "sent") return chip("chip-ok", "Service-end email sent");
    if (notice === "not_sent") return chip("chip-warn", "No service-end email was sent");
    if (notice === "no_notice_for_state") return chip("chip-neutral", "Paused, no notice sent for this state");
    return chip("chip-neutral", "Notice: " + NOWORDS);
  }
  function statusChip(map, status) {
    var s = own(map, status);
    return s ? chip(s[0], s[1]) : chip("chip-warn", "A status this page has no words for");
  }
  function holdWords(code) { return own(HOLD, code) || "a reason this page has no words for"; }

  /* ---- time ---- */

  /* "6 days", "3 hours", "12 minutes" until a time, or "" once it has passed or is not a time. */
  function until(iso) {
    var ms = new Date(iso).getTime() - Date.now(), n;
    if (!iso || isNaN(ms) || ms <= 0) return "";
    if (ms < 3600000) { n = Math.max(1, Math.floor(ms / 60000)); return plural(n, "minute", "minutes"); }
    if (ms < 86400000) { n = Math.floor(ms / 3600000); return plural(n, "hour", "hours"); }
    n = Math.floor(ms / 86400000);
    return plural(n, "day", "days");
  }
  function expired(b) { return b.status === "proposed" && !until(b.expires_at); }

  /* ---- the overview ---- */

  function overdue(e) {
    var d = e.days_overdue;
    if (typeof d !== "number") return "";
    return d > 0 ? plural(d, "day", "days") : "Today";
  }
  function blocked(e) { return retentionOn === false && e.account_reason === "retention_switched_off"; }

  /* One table cell; text may be "" (shown as a dash) or a node. */
  function cell(content, cls) {
    var td = F.el("td", cls || "");
    if (content && typeof content === "object") td.appendChild(content);
    else td.textContent = content || "—";
    return td;
  }
  function stack(main, small) {
    var box = F.el("div", "");
    box.appendChild(F.el("span", "lc-id", main));
    if (small) box.appendChild(F.el("small", "", small));
    return box;
  }
  function act(btn) { var td = F.el("td", "lc-act"); if (btn) td.appendChild(btn); return td; }
  function holdBtn(site) {
    var hold = button("Hold");
    hold.addEventListener("click", function () { openHold(site, true, hold); });
    return hold;
  }
  /* The rows of a table, or a plain line when there are none. */
  function fill(rowsId, wrapId, emptyId, rows, ok) {
    var body = $(rowsId);
    body.textContent = "";
    if (ok) rows.forEach(function (r) { r.forEach(function (tr) { body.appendChild(tr); }); });
    $(wrapId).hidden = !ok || rows.length === 0;
    $(emptyId).hidden = !ok || rows.length > 0;
  }

  function eligibleRow(e, i) {
    var tr = F.el("tr", ""), id = "s-" + i, cb = F.el("input", ""), sel = F.el("td", ""), chips = F.el("div", "lc-chips"), st = F.el("td", "");
    var ended = F.dayOf(e.service_ended_at), due = F.dayOf(e.deletion_due_at), det = details(e.counts, id + "-det", 9), why = F.el("small", "", "");
    var more = disclosure(det);
    cb.setAttribute("type", "checkbox");
    cb.setAttribute("id", id);
    cb.setAttribute("aria-label", "Select " + e.site);
    cb.setAttribute("aria-describedby", id + "-d");
    cb.checked = selected[e.site] === true;
    cb.disabled = blocked(e);
    cb.addEventListener("change", function () {
      if (cb.checked) selected[e.site] = true; else delete selected[e.site];
      syncPropose();
    });
    sel.appendChild(cb);
    tr.appendChild(sel);
    tr.appendChild(cell(stack(e.site, own(TEMPLATE, e.template) || ""), ""));
    tr.appendChild(cell(ended));
    tr.appendChild(cell(due));
    tr.appendChild(cell(overdue(e)));
    tr.appendChild(cell(totals(rowsOf(e.counts), typeof e.private_files === "number" ? e.private_files : 0)));
    chips.appendChild(accountChip(e.account_action, e.account_reason));
    chips.appendChild(noticeChip(e.notice));
    if (e.usage_to_write_off === true) chips.appendChild(chip("chip-neutral", "Open usage will be written off first"));
    st.appendChild(chips);
    why.setAttribute("id", id + "-d");
    if (blocked(e)) why.textContent = "Cannot be selected: its account would be disposed of and account disposal is switched off";
    st.appendChild(why);
    tr.appendChild(st);
    tr.appendChild(act(more));
    tr.appendChild(act(holdBtn(e.site)));
    return [tr, det];
  }

  function selectedSites() { return eligible.filter(function (e) { return selected[e.site] === true; }).map(function (e) { return e.site; }); }

  function syncPropose() {
    var n = selectedSites().length, max = firstBatch ? 1 : MAX_SITES, why = "";
    if (n === 0) why = "Select at least one site.";
    else if (n > max) why = firstBatch ? "The first batch in this environment is one site. Unselect the others." : "A batch holds at most " + MAX_SITES + " sites.";
    $("a-sel").textContent = firstBatch ? n + " selected. The first batch is one site." : n + " of " + MAX_SITES + " selected";
    F.say("a-why", why);
    $("propose").disabled = busy || !!why;
  }

  /* The count shown on a tab, or nothing while its list is not loaded. */
  function tabCount(key, ok, n) { $("n-" + key).textContent = ok ? " (" + num(n) + ")" : ""; }

  function paintA() {
    fill("a-rows", "a-wrap", "a-empty", eligible.map(eligibleRow), listOk);
    tabCount("a", listOk, eligible.length);
    $("a-bar").hidden = !listOk || eligible.length === 0;
    F.say("a-err", listOk ? "" : LOAD_ERR);
    if (!listOk) F.say("a-why", "");
    else syncPropose();
  }

  /* Not yet due: sites coming up within 14 days, and due sites stopped for a reason other than a hold. A held site is
     listed under Holds only. */
  function stoppedRows() { return refused.filter(function (r) { return r.reason_code !== "held"; }); }
  function stoppedRow(r) {
    var tr = F.el("tr", ""), due = F.dayOf(r.deletion_due_at), label = own(REASON, r.reason_code);
    tr.appendChild(cell(stack(r.site, "")));
    tr.appendChild(cell(due));
    tr.appendChild(cell(chip("chip-warn", label || NOWORDS.charAt(0).toUpperCase() + NOWORDS.slice(1))));
    tr.appendChild(act(r.reason_code === "already_erased" ? null : holdBtn(r.site)));
    return [tr];
  }
  function nearRow(r) {
    var tr = F.el("tr", ""), d = r.days_until, due = F.dayOf(r.deletion_due_at);
    tr.appendChild(cell(stack(r.site, "")));
    tr.appendChild(cell(due));
    tr.appendChild(cell(typeof d === "number" && d > 0 ? plural(d, "day", "days") : "Due today"));
    tr.appendChild(act(holdBtn(r.site)));
    return [tr];
  }

  function paintB() {
    var rows = stoppedRows().map(stoppedRow).concat(near.map(nearRow));
    fill("b-rows", "b-wrap", "b-empty", rows, listOk);
    tabCount("b", listOk, rows.length);
    F.say("b-err", listOk ? "" : LOAD_ERR);
  }

  function outcome(b) {
    var c = { erased: 0, skipped: 0, failed: 0 };
    arr(b.items).forEach(function (it) { if (it && own(c, it.status) !== null) c[it.status]++; });
    return c.erased + " erased, " + c.skipped + " skipped, " + c.failed + " failed";
  }
  function batchRow(b) {
    var tr = F.el("tr", ""), open = button("Open"), left, status = F.el("td", "");
    var when = b.approved_at ? "Approved " + F.stamp(b.approved_at) : F.stamp(b.proposed_at) ? "Proposed " + F.stamp(b.proposed_at) : "";
    var sites = plural(arr(b.items).length, "site", "sites"), expires = "";
    if (b.status === "proposed") { left = until(b.expires_at); expires = left ? "In " + left : "Expired"; }
    status.appendChild(statusChip(BATCH_STATUS, b.status));
    tr.appendChild(cell(stack(b.id, "")));
    tr.appendChild(status);
    tr.appendChild(cell(stack(sites, b.status !== "proposed" && b.status !== "cancelled" ? outcome(b) : "")));
    tr.appendChild(cell(when));
    tr.appendChild(cell(expires));
    open.addEventListener("click", function () { openBatch(b, ""); });
    tr.appendChild(act(open));
    return [tr];
  }
  /* The due date of a held site comes from the dry run, which still lists it. */
  function dueOf(site) {
    var all = refused.concat(near), i;
    for (i = 0; i < all.length; i++) if (all[i].site === site) return F.dayOf(all[i].deletion_due_at);
    return "";
  }
  function holdRow(h) {
    var tr = F.el("tr", ""), rel = button("Release"), placed = F.dayOf(h.placed_at);
    rel.addEventListener("click", function () { openRelease(h.site, h.reason_code, h.reference, rel); });
    tr.appendChild(cell(stack(h.site, "")));
    tr.appendChild(cell(chip("chip-warn", holdWords(h.reason_code))));
    tr.appendChild(cell(h.reference || ""));
    tr.appendChild(cell(placed));
    tr.appendChild(cell(listOk ? dueOf(h.site) : ""));
    tr.appendChild(act(rel));
    return [tr];
  }

  function paintCD() {
    fill("c-rows", "c-wrap", "c-empty", batches.map(batchRow), batchesOk);
    fill("d-rows", "d-wrap", "d-empty", holds.map(holdRow), batchesOk);
    tabCount("c", batchesOk, batches.length);
    tabCount("d", batchesOk, holds.length);
    F.say("c-err", batchesOk ? "" : LOAD_ERR);
    F.say("d-err", batchesOk ? "" : LOAD_ERR);
  }

  function paintTop(asOf) {
    var at = F.stamp(asOf);
    var asof = listOk && at ? "As of " + at : "";
    $("l-asof").textContent = asof;
    $("l-asof").hidden = !asof;
    $("l-ret").hidden = !(listOk && retentionOn === false);
  }

  function paintMain(asOf) {
    paintTop(asOf);
    paintA();
    paintB();
    paintCD();
  }

  /* ---- the tabs: one list at a time, the chosen one kept while the lists reload ---- */

  var TABS = ["a", "b", "c", "d"], tab = "a";
  function selectTab(key, focus) {
    tab = key;
    TABS.forEach(function (k) {
      var on = k === key;
      $("tab-" + k).setAttribute("aria-selected", String(on));
      $("pan-" + k).hidden = !on;
    });
    if (focus) $("tab-" + key).focus();
  }
  function tabKey(e) {
    var i = TABS.indexOf(tab), n = TABS.length, go = -1;
    if (e.key === "ArrowRight") go = (i + 1) % n;
    else if (e.key === "ArrowLeft") go = (i + n - 1) % n;
    else if (e.key === "Home") go = 0;
    else if (e.key === "End") go = n - 1;
    if (go < 0) return;
    e.preventDefault();
    selectTab(TABS[go], true);
  }

  /* Takes the two answers into memory. Selections that are still on the due list stay. */
  function takeList(res) {
    var d = res.data;
    listOk = res.ok;
    eligible = listOk ? arr(d.eligible).filter(function (e) { return e && typeof e.site === "string"; }) : [];
    near = listOk ? arr(d.near).filter(function (r) { return r && typeof r.site === "string"; }) : [];
    refused = listOk ? arr(d.refused).filter(function (r) { return r && typeof r.site === "string"; }) : [];
    retentionOn = listOk ? d.retention_enabled !== false : true;
    bySite = {};
    eligible.forEach(function (e) { bySite[e.site] = e; });
    Object.keys(selected).forEach(function (s) { if (!bySite[s] || blocked(bySite[s])) delete selected[s]; });
  }
  function takeBatches(data, ok) {
    batchesOk = ok;
    batches = ok ? arr(data.batches).filter(function (b) { return b && typeof b.id === "string"; }) : [];
    holds = ok ? arr(data.holds).filter(function (h) { return h && typeof h.site === "string"; }) : [];
    firstBatch = ok && !batches.some(function (b) { return own(RAN, b.status) !== null; });
  }

  /* Reads both lists. first: nothing is on the screen yet, so a failure shows the closed or down view. */
  function load(first) {
    var run = ++loadRun;
    listRun++;
    $("a-loading").hidden = false;
    $("a-wrap").setAttribute("aria-busy", "true");
    return Promise.all([call("list/"), call("batches/")]).then(function (rs) {
      var a = rs[0], b = rs[1];
      if (run !== loadRun) return;
      $("a-loading").hidden = true;
      $("a-wrap").removeAttribute("aria-busy");
      if (F.left(a) || F.left(b)) return;
      if (a.status === 404 || b.status === 404) { show("v-closed"); return; }
      if (first && !a.ok && !b.ok) { show("v-down"); return; }
      takeList(a);
      takeBatches(b.data, b.ok);
      paintMain(a.data.as_of);
      if (current) { if (!$("ap-area").hidden) syncApprove(); } else show("v-main");
    });
  }

  /* Reads list/ only: after a write that can change the due list. Returns a promise that settles when it is painted. */
  function reloadList() {
    var run = ++listRun;
    return call("list/").then(function (res) {
      if (run !== listRun || F.left(res)) return;
      if (res.status === 404) { show("v-closed"); return; }
      takeList(res);
      paintTop(res.data.as_of);
      paintA();
      paintB();
    });
  }

  /* Reads batches/ only. cb(res) runs unless a newer read took over; 401 leaves the page. */
  function readBatches(cb) {
    var run = ++batchRun;
    return call("batches/").then(function (res) {
      if (run !== batchRun || F.left(res)) return;
      if (res.status === 404) { show("v-closed"); return; }
      if (res.ok) takeBatches(res.data, true);
      cb(res);
    });
  }

  function findBatch(id) {
    return batches.filter(function (b) { return b.id === id; })[0] || null;
  }

  /* ---- Propose ---- */

  function problemLines(list) {
    var out = [];
    arr(list).forEach(function (line) {
      var m = /^(.+?): (\S+)$/.exec(String(line));
      if (!m) { out.push("A site is stopped for " + NOWORDS + "."); return; }
      out.push(m[1] + " " + (own(PROBLEM, m[2]) || "is stopped for " + NOWORDS) + ".");
    });
    return out;
  }

  function propose() {
    var sites = selectedSites();
    if (busy || !sites.length || $("propose").disabled) return;
    busy = true;
    $("propose").disabled = true;
    F.say("pr-err", "");
    call("propose/", { sites: sites }).then(function (res) {
      busy = false;
      syncPropose();
      if (F.left(res)) return;
      if (res.ok) { openBatch(res.data, "Batch " + res.data.id + " proposed. Nothing has been deleted."); return; }
      if (res.status === 404) { readBatches(function () { F.say("pr-err", LOST); $("propose").focus(); }); return; }
      if (res.status === 409 && res.code === "not_proposable") {
        F.say("pr-err", "Some sites cannot be proposed: " + problemLines(res.fields.sites).join(" ") + " Nothing was proposed.");
        reloadList().then(function () { $("propose").focus(); });
        return;
      }
      if (res.status === 400 && res.code === "invalid_request") {
        F.say("pr-err", arr(res.fields.sites)[0] || res.message || LOST);
        $("propose").focus();
        return;
      }
      F.say("pr-err", LOST);
      $("propose").focus();
    });
  }

  /* ---- One batch ---- */

  function openBatch(b, message) {
    batchRun++;
    current = b;
    excluded = {};
    F.say("bt-msg", message);
    show("v-batch");
    paintBatch();
    if (!$("ap-area").hidden) $("ap-reason").focus();
    else if (message) $("st-refresh").focus();
    else $("bt-back").focus();
  }

  function planned(it) { return obj(obj(it).planned); }

  function keptItems() {
    return arr(current.items).filter(function (it) { return it && !excluded[it.site]; });
  }

  function paintBatch() {
    var b = current, at = F.stamp(b.proposed_at), fp = String(b.digest || "").slice(0, FINGERPRINT);
    $("bt-h").textContent = "Batch " + b.id;
    $("bt-chip").setAttribute("class", "chip " + (own(BATCH_STATUS, b.status) ? BATCH_STATUS[b.status][0] : "chip-warn"));
    $("bt-chip").textContent = own(BATCH_STATUS, b.status) ? BATCH_STATUS[b.status][1] : "A status this page has no words for";
    $("bt-meta").textContent = [at ? "Proposed " + at : "", fp ? "List fingerprint " + fp : ""].filter(Boolean).join(" · ");
    if (b.status === "proposed" && !expired(b)) { $("st-area").hidden = true; paintApprove(); } else { $("ap-area").hidden = true; paintStatus(); }
  }

  /* The notice of a site, read from the dry run of the same site: "sent", "not_sent", ... or "" when that site is not on it now. */
  function noticeOf(site) { return bySite[site] ? bySite[site].notice : ""; }

  function itemRow(it, i) {
    var li = F.el("li", ""), box = F.el("div", "batch"), main = F.el("div", "batch-main"), end = F.el("div", "batch-end");
    var sel = F.el("div", "lc-sel"), cb = F.el("input", ""), id = "k-" + i, label = F.el("label", "", "Keep " + it.site + " in this batch");
    var p = planned(it), due = F.dayOf(it.deletion_due_at), chips = F.el("div", "batch-title"), sub = F.el("span", "item-sub");
    var det = details(p.counts, id + "-det"), n = noticeOf(it.site);
    cb.setAttribute("type", "checkbox");
    cb.setAttribute("id", id);
    cb.setAttribute("aria-describedby", id + "-d");
    label.setAttribute("for", id);
    cb.checked = !excluded[it.site];
    cb.addEventListener("change", function () {
      if (cb.checked) delete excluded[it.site]; else excluded[it.site] = true;
      syncApprove();
    });
    sub.setAttribute("id", id + "-d");
    sub.textContent = [due ? "Due " + due : "", plural(rowsOf(p.counts), "row", "rows") + ", " + plural(plannedFiles(p), "file", "files")].filter(Boolean).join(" · ");
    sel.appendChild(cb);
    sel.appendChild(label);
    main.appendChild(sel);
    main.appendChild(sub);
    chips.appendChild(accountChip(p.account_action, p.account_reason));
    if (n) chips.appendChild(noticeChip(n));
    main.appendChild(chips);
    end.appendChild(disclosure(det));
    box.appendChild(main);
    box.appendChild(end);
    li.appendChild(box);
    li.appendChild(det);
    return li;
  }

  function paintApprove() {
    var b = current, list = $("ap-items"), left = until(b.expires_at), exp = F.stamp(b.expires_at);
    list.textContent = "";
    arr(b.items).forEach(function (it, i) { if (it && typeof it.site === "string") list.appendChild(itemRow(it, i)); });
    $("ap-fp").textContent = String(b.digest || "").slice(0, FINGERPRINT);
    $("ap-exp").textContent = exp ? exp + (left ? " (in " + left + ")" : "") : "";
    $("ap-reason").value = "";
    $("ap-count").textContent = "0 of " + MAX_REASON;
    $("ap-confirm").value = "";
    F.say("ap-reason-e", "");
    F.say("ap-err", "");
    $("ap-reason").removeAttribute("aria-invalid");
    $("ap-confirm").removeAttribute("aria-invalid");
    $("ap-area").hidden = false;
    syncApprove();
  }

  function line() { return "erase batch " + current.id + " " + keptItems().length + " sites"; }

  /* The totals, the line to type and the button, from the sites still ticked. */
  function syncApprove() {
    var kept = keptItems(), rows = 0, files = 0, accounts = 0, noEmail = 0, unknown = 0, text;
    kept.forEach(function (it) {
      var p = planned(it), n = noticeOf(it.site);
      rows += rowsOf(p.counts);
      files += plannedFiles(p);
      if (p.account_action === "dispose") accounts++;
      if (!n) unknown++; else if (n === "not_sent") noEmail++;
    });
    $("ap-n").textContent = String(kept.length);
    $("ap-rows").textContent = num(rows);
    $("ap-files").textContent = num(files);
    $("ap-acc").textContent = String(accounts);
    text = String(noEmail) + (unknown ? " (" + unknown + " not known)" : "");
    $("ap-noemail").textContent = "";
    $("ap-noemail").appendChild(noEmail > 0 ? chip("chip-warn", text) : F.el("span", "", text));
    $("ap-line").textContent = line();
    var ready = kept.length > 0 && $("ap-confirm").value.trim() === line();
    $("ap-go").disabled = busy || !ready;
    $("ap-why").textContent = kept.length === 0 ? "Keep at least one site, or cancel the batch." : ready ? "The line matches." : "The button stays off until the line matches.";
  }

  function paintStatus() {
    var b = current, list = $("st-items"), at = F.stamp(b.approved_at), hint = "", cancellable;
    list.textContent = "";
    arr(b.items).forEach(function (it) { if (it && typeof it.site === "string") list.appendChild(statusItem(it)); });
    $("st-approved").textContent = at ? "Approved " + at + ". Reason: " + (b.approval_reason || "") : "";
    $("st-approved").hidden = !at;
    if (expired(b)) hint = "This proposal expired. Make the list again.";
    else if (b.status === "approved") hint = "Waiting for the next run. A run starts within about 5 minutes.";
    else if (b.status === "running") hint = "Running. Refresh to see progress.";
    else if (b.status === "needs_attention") hint = "Some sites failed " + MAX_ATTEMPTS + " times and need attention. Cancel the batch or ask engineering.";
    else if (b.status === "cancelled") hint = "This batch was cancelled.";
    F.say("st-hint", hint);
    F.say("st-err", "");
    cancellable = b.status === "approved" || b.status === "needs_attention" || b.status === "proposed";
    $("st-cancel").hidden = !cancellable;
    $("st-area").hidden = false;
  }

  function statusItem(it) {
    var li = F.el("li", "batch"), main = F.el("div", "batch-main"), title = F.el("div", "batch-title"), parts = [], why, at;
    title.appendChild(F.el("span", "", it.site));
    title.appendChild(statusChip(ITEM_STATUS, it.status));
    main.appendChild(title);
    if (it.status === "erased") {
      parts.push(plural(rowsOf(it.counts), "row", "rows") + ", " + plural(deletedFiles(it.counts), "file", "files"));
      at = F.stamp(it.erased_at);
      if (at) parts.push(at);
      if (it.account_disposed === true) parts.push("account disposed of");
    } else if (it.status === "skipped" || it.status === "failed") {
      why = it.reason_code ? (own(REASON, it.reason_code) || NOWORDS.charAt(0).toUpperCase() + NOWORDS.slice(1)) : "";
      if (why) parts.push(why);
      if (typeof it.attempts === "number" && it.attempts > 0) parts.push(it.attempts + " of " + MAX_ATTEMPTS + " attempts");
    }
    if (parts.length) main.appendChild(F.el("span", "item-sub", parts.join(" · ")));
    li.appendChild(main);
    return li;
  }

  /* Reads batches/ again and shows the open batch as it is now. gone: said when it no longer exists. */
  function refreshOpen(message, gone, focusAfter) {
    var id = current.id;
    readBatches(function (res) {
      var fresh;
      if (!res.ok) { F.say($("ap-area").hidden ? "st-err" : "ap-err", LOAD_ERR); return; }
      paintCD();
      fresh = findBatch(id);
      if (!fresh) { toMain(gone || "That batch no longer exists."); return; }
      current = fresh;
      F.say("bt-msg", message);
      paintBatch();
      if (focusAfter) focusAfter();
    });
  }

  function toMain(message) {
    batchRun++;
    current = null;
    busy = false;
    dlg.close(false);
    F.say("l-msg", message);
    show("v-main");
    load(false);
  }

  /* ---- Approve ---- */

  function lockApprove(on) {
    busy = on;
    ["ap-reason", "ap-confirm", "ap-go", "ap-cancel"].forEach(function (id) { $(id).disabled = on; });
    Array.prototype.slice.call($("ap-items").querySelectorAll("input")).forEach(function (c) { c.disabled = on; });
    if (!on) syncApprove();
  }

  function reasonProblem(text) {
    if (!text) return "Write a reason.";
    if (text.length > MAX_REASON) return "The reason is at most " + MAX_REASON + " characters.";
    if (text.indexOf("@") >= 0) return "The reason cannot hold an email address.";
    return "";
  }

  function approve(e) {
    var reason = String($("ap-reason").value || "").trim(), typed = String($("ap-confirm").value || "").trim(), wrong, ex, id;
    e.preventDefault();
    if (busy || !current) return;
    F.say("ap-err", "");
    if (!keptItems().length) { F.say("ap-err", "Every site was excluded. Cancel the batch instead."); return; }
    wrong = reasonProblem(reason);
    F.say("ap-reason-e", wrong);
    if (wrong) { $("ap-reason").setAttribute("aria-invalid", "true"); $("ap-reason").focus(); return; }
    $("ap-reason").removeAttribute("aria-invalid");
    if (typed !== line()) { $("ap-go").disabled = true; return; }
    ex = arr(current.items).filter(function (it) { return it && excluded[it.site]; }).map(function (it) { return it.site; });
    id = current.id;
    lockApprove(true);
    call("approve/", { batch: id, confirmation: typed, exclude: ex, reason: reason }).then(function (res) {
      lockApprove(false);
      if (F.left(res) || !current || current.id !== id) return;
      if (res.ok) {
        current = res.data;
        F.say("bt-msg", "Approved. The run starts within about 5 minutes.");
        paintBatch();
        $("st-refresh").focus();
        return;
      }
      if (res.status === 409 && res.code === "confirmation_mismatch") {
        F.say("ap-err", "That does not match the batch and the number of sites. Check the line above.");
        $("ap-confirm").setAttribute("aria-invalid", "true");
        $("ap-confirm").focus();
        return;
      }
      if (res.status === 400 && res.code === "invalid_request") {
        if (res.fields.reason) { F.say("ap-reason-e", arr(res.fields.reason)[0] || "Check the reason."); $("ap-reason").setAttribute("aria-invalid", "true"); $("ap-reason").focus(); return; }
        if (res.fields.exclude) {
          F.say("ap-err", keptItems().length ? arr(res.fields.exclude)[0] || LOST : "Every site was excluded. Cancel the batch instead.");
          (Array.prototype.slice.call($("ap-items").querySelectorAll("input"))[0] || $("ap-go")).focus();
          return;
        }
      }
      if (res.status === 409 && res.code === "proposal_expired") {
        current.status = "cancelled";
        F.say("bt-msg", "This proposal expired. Make the list again.");
        paintBatch();
        load(false);
        return;
      }
      if (res.status === 409 && res.code === "wrong_status") { refreshOpen("This batch was already decided."); load(false); return; }
      if (res.status === 404) { refreshOpen("", "That batch no longer exists."); return; }
      F.say("ap-err", LOST);
    });
  }

  /* ---- Cancel ---- */

  function lockCancel(on) {
    busy = on;
    ["cancel-go", "cancel-x", "cancel-back", "cancel-f"].forEach(function (id) { $(id).disabled = on; });
  }
  function openCancel(from) {
    if (busy || !current) return;
    $("cancel-f").value = "";
    $("cancel-f").removeAttribute("aria-invalid");
    $("cancel-count").textContent = "0 of " + MAX_REASON;
    F.say("cancel-e", "");
    dlg.open("m-cancel", from, $("cancel-f"));
  }
  function cancel(e) {
    var reason = String($("cancel-f").value || "").trim(), wrong = reasonProblem(reason), id;
    e.preventDefault();
    if (busy || !current) return;
    F.say("cancel-e", wrong);
    if (wrong) { $("cancel-f").setAttribute("aria-invalid", "true"); $("cancel-f").focus(); return; }
    $("cancel-f").removeAttribute("aria-invalid");
    id = current.id;
    lockCancel(true);
    call("cancel/", { batch: id, reason: reason }).then(function (res) {
      lockCancel(false);
      if (F.left(res) || !current || current.id !== id) return;
      if (res.ok) {
        current = res.data;
        dlg.close(false);
        F.say("bt-msg", "Batch cancelled.");
        paintBatch();
        $("st-refresh").focus();
        load(false);
        return;
      }
      if (res.status === 400 && res.code === "invalid_request") { F.say("cancel-e", arr(res.fields.reason)[0] || "Check the reason."); $("cancel-f").focus(); return; }
      if (res.status === 409 && res.code === "wrong_status") {
        F.say("cancel-e", "This batch cannot be cancelled now.");
        refreshOpen("", "", null);
        return;
      }
      if (res.status === 404) { dlg.close(false); refreshOpen("", "That batch no longer exists."); return; }
      F.say("cancel-e", LOST);
    });
  }

  /* ---- Holds ---- */

  function lockHold(on) {
    busy = on;
    ["hold-go", "hold-x", "hold-cancel", "hold-site", "hold-reason", "hold-ref"].forEach(function (id) { $(id).disabled = on; });
  }
  function clearHold() {
    ["hold-site-e", "hold-reason-e", "hold-ref-e", "hold-e"].forEach(function (id) { F.say(id, ""); });
    ["hold-site", "hold-reason", "hold-ref"].forEach(function (id) { $(id).removeAttribute("aria-invalid"); });
  }
  /* site: prefilled and read-only when it comes from a row; typed when readOnly is false. */
  function openHold(site, readOnly, from) {
    if (busy) return;
    clearHold();
    $("hold-site").value = site || "";
    if (readOnly) $("hold-site").setAttribute("readonly", "readonly"); else $("hold-site").removeAttribute("readonly");
    $("hold-reason").value = "";
    $("hold-ref").value = "";
    if (readOnly) dlg.open("m-hold", from, $("hold-reason")); else dlg.open("m-hold", from, $("hold-site"));
  }
  function holdFieldError(id, text) { F.say(id + "-e", text); $(id).setAttribute("aria-invalid", "true"); }
  function placeHold(e) {
    var site = String($("hold-site").value || "").trim(), reason = $("hold-reason").value, ref = String($("hold-ref").value || "").trim(), first = null;
    e.preventDefault();
    if (busy) return;
    clearHold();
    if (!site) { holdFieldError("hold-site", "Write the site id."); first = first || $("hold-site"); }
    if (!reason) { holdFieldError("hold-reason", "Choose a reason."); first = first || $("hold-reason"); }
    if (ref.length > MAX_REF || ref.indexOf("@") >= 0) { holdFieldError("hold-ref", "At most " + MAX_REF + " characters, and no email address."); first = first || $("hold-ref"); }
    if (first) { first.focus(); return; }
    lockHold(true);
    call("hold/", { site: site, reason_code: reason, reference: ref }).then(function (res) {
      lockHold(false);
      if (F.left(res)) return;
      if (res.ok) { afterHold("Hold placed on " + site + ".", res.data); return; }
      if (res.status === 404) { dlg.close(false); recheck(); return; }
      if (res.status === 409 && res.code === "already_held") { holdFieldError("hold-site", "This site already has a hold."); $("hold-site").focus(); return; }
      if (res.status === 400 && res.code === "invalid_request") {
        var f = res.fields, at = null;
        if (f.site) { holdFieldError("hold-site", "No such site."); at = at || $("hold-site"); }
        if (f.reason_code) { holdFieldError("hold-reason", "Choose one of the listed reasons."); at = at || $("hold-reason"); }
        if (f.reference) { holdFieldError("hold-ref", "At most " + MAX_REF + " characters, and no email address."); at = at || $("hold-ref"); }
        if (at) { at.focus(); return; }
      }
      F.say("hold-e", LOST);
    });
  }

  /* A hold was placed or released: the answer is the overview, so paint the batches and holds from it,
     then read the due list again because a held site leaves it. */
  function afterHold(message, data) {
    dlg.close(false);
    takeBatches(data, true);
    F.say("l-msg", message);
    paintCD();
    if (current) { var fresh = findBatch(current.id); if (fresh) current = fresh; }
    reloadList();
  }
  /* A 404 from a write: the switch went off, or the target is gone. batches/ decides which. */
  function recheck() {
    readBatches(function () { paintCD(); reloadList(); });
  }

  var releasing = null;
  function openRelease(site, code, reference, from) {
    var held = holds.filter(function (h) { return h.site === site; })[0];
    var why = held ? held.reason_code : code, ref = held ? held.reference : reference, text;
    if (busy) return;
    releasing = site;
    text = "Release the hold on " + site + "?" + (why ? " Reason: " + holdWords(why) + "." : "") + (ref ? " Reference: " + ref + "." : "") +
      " The site can be proposed again once it is due.";
    $("m-release-sub").textContent = text;
    F.say("release-e", "");
    dlg.open("m-release", from, $("release-cancel"));
  }
  function lockRelease(on) {
    busy = on;
    ["release-go", "release-x", "release-cancel"].forEach(function (id) { $(id).disabled = on; });
  }
  function release() {
    var site = releasing;
    if (busy || !site) return;
    lockRelease(true);
    call("hold/release/", { site: site }).then(function (res) {
      lockRelease(false);
      if (F.left(res)) return;
      if (res.ok) { afterHold("Hold released on " + site + ".", res.data); return; }
      if (res.status === 404) { dlg.close(false); recheck(); return; }
      if (res.status === 409 && res.code === "not_held") { F.say("release-e", "This site has no hold."); recheck(); return; }
      if (res.status === 400 && res.code === "invalid_request") { F.say("release-e", "No such site."); return; }
      F.say("release-e", LOST);
    });
  }

  /* ---- wiring ---- */

  function counter(field, out) { $(field).addEventListener("input", function () { $(out).textContent = String($(field).value.length) + " of " + MAX_REASON; }); }
  counter("ap-reason", "ap-count");
  counter("cancel-f", "cancel-count");
  $("ap-confirm").addEventListener("input", function () {
    $("ap-confirm").removeAttribute("aria-invalid");
    F.say("ap-err", "");
    syncApprove();
  });
  $("approve-form").addEventListener("submit", approve);
  $("ap-cancel").addEventListener("click", function () { openCancel($("ap-cancel")); });
  $("st-cancel").addEventListener("click", function () { openCancel($("st-cancel")); });
  $("cancel-form").addEventListener("submit", cancel);
  ["cancel-x", "cancel-back"].forEach(function (id) { $(id).addEventListener("click", function () { if (!busy) dlg.close(true); }); });
  $("hold-form").addEventListener("submit", placeHold);
  ["hold-x", "hold-cancel"].forEach(function (id) { $(id).addEventListener("click", function () { if (!busy) dlg.close(true); }); });
  $("release-go").addEventListener("click", release);
  ["release-x", "release-cancel"].forEach(function (id) { $(id).addEventListener("click", function () { if (!busy) dlg.close(true); }); });
  $("d-place").addEventListener("click", function () { openHold("", false, $("d-place")); });
  $("propose").addEventListener("click", propose);
  $("st-refresh").addEventListener("click", function () { if (!busy && current) refreshOpen("", "That batch no longer exists."); });
  selectTab("a", false);
  TABS.forEach(function (k) { $("tab-" + k).addEventListener("click", function () { selectTab(k, false); }); $("tab-" + k).addEventListener("keydown", tabKey); });
  $("bt-back").addEventListener("click", function (e) { e.preventDefault(); if (!busy) toMain(""); });

  /* Who is signed in comes from me/, the staff route that answers it; the lifecycle routes do not. */
  function start() {
    show("boot");
    if (known) { load(true); return; }
    H.call("GET", "me/").then(function (res) {
      if (F.left(res)) return;
      if (!res.ok) { show("v-down"); return; }
      known = true;
      window.NOHqShell.signedIn(res.data.email);
      load(true);
    });
  }
  $("retry").addEventListener("click", start);
  start();
})();
