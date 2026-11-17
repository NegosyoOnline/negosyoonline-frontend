/* Inbox: the Facebook comment detail (ClickUp z8uq9mg9ph, COMMENTS C3 FE). A Facebook comment is one more channel of the Inbox ("FB Comment"):
   inbox.js keeps ONE list (merged by time with the conversations) and ONE detail pane, and calls this module for what is special to a
   comment: its row (post line, Ad / Answered / Hidden chips), and its detail: the post with a facebook.com link, the comment, the Page's
   replies, and the Reply / Message privately / Hide actions (one private reply per comment within 7 days; Hide asks first). Built on the C1
   contract (backend docs/contracts/comments-api-c1.md), owner routes under /sites/{id}/inquiries/comments/: GET {ref}/, POST {ref}/read/
   (inbox.js), {ref}/reply/, {ref}/private-reply/ (body {text, idempotency_key}) and {ref}/hide/. Every name, comment and caption reaches
   the page through textContent only; the post link is used only when it is a facebook.com https address; nothing is stored in the
   browser (a draft lives in memory until the page is left). Plain ES5. inbox.js calls select(hooks, item), draw(), reload(), deselect(),
   stop(), row(item), and hooks give it the thread pane, the head, the list item and a redraw of the list. */
(function () {
  var D = window.NODash, IB = window.NOInbox, U = IB && IB.util;
  if (!D || !IB || !U) return;
  var MAX = { public: 500, private: 1000 };
  var C = null; /* the open comment's state; null until the first select() and after stop() */

  /* ---------- the words ----------
     Approved by the Supervisor (2026-11-18): the texts below. All of them live in this block. */
  var T = {
    ad: "Ad", answered: "Answered", unanswered: "Unanswered", hidden: "Hidden",
    reply: "Reply", priv: "Message privately", hide: "Hide", send: "Send", cancel: "Cancel",
    opening: "Opening the comment…",
    gone: "This comment is no longer available.", reopenFail: "We could not load this comment just now. Wait a moment, then try again.",
    notSent: "Your reply was not sent.", keepText: " Your text is still in the box.",
    net: "We could not confirm it was sent. Press Try again: it will not be sent twice.",
    sent: "Reply sent.", hid: "Comment hidden.", post: "Post", on: "On",
    confirmHide: "Hide this comment on Facebook? You cannot unhide it from here."
  };
  /* The fixed reason texts of a disabled action (the contract's `reason` codes), and of a send that did not go. Never Meta's words. */
  var REASON = {
    not_connected: "Connect your Facebook Page to reply.",
    reconnect: "Reconnect your Facebook Page to reply.",
    permission_missing: "Turn on comments for your Page to reply.",
    removed: "This comment was deleted on Facebook.",
    own_comment: "This is your Page's own comment.",
    window_closed: "Private reply is only possible within 7 days of the comment.",
    already_sent: "A private message was already sent for this comment.",
    already_hidden: ""
  };
  var LIMIT = "Facebook is limiting replies right now. Try again in a few minutes.", DOWN = "Facebook did not answer. Try again.";
  var FAIL = {
    token_invalid: REASON.reconnect, forbidden_page: REASON.permission_missing, comment_removed: REASON.removed, not_found: REASON.removed,
    rate_limited: LIMIT, blocked_rate: LIMIT, provider_down: DOWN, bad_response: DOWN
  };
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function reasonText(code) { return has(REASON, code) ? REASON[code] : ""; }
  function known(code) { return has(FAIL, code) || (has(REASON, code) && !!REASON[code]); }
  function failTextOf(code) { return has(FAIL, code) ? FAIL[code] : has(REASON, code) && REASON[code] ? REASON[code] : DOWN; }


  /* ---------- small helpers ---------- */

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(text) { var l = byId("ib-live"); if (l) l.textContent = text; }
  function msgOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function codeOf(res) { return res && res.data && typeof res.data.code === "string" ? res.data.code : ""; }
  function busy(b, on) { if (!b) return; if (on) { b.setAttribute("aria-busy", "true"); b.disabled = true; } else { b.removeAttribute("aria-busy"); b.disabled = false; } }
  function icon(d, cls) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ["viewBox:0 0 24 24", "fill:none", "stroke:currentColor", "stroke-width:2", "stroke-linecap:round", "stroke-linejoin:round", "aria-hidden:true", "focusable:false"].forEach(function (kv) {
      var i = kv.indexOf(":"); s.setAttribute(kv.slice(0, i), kv.slice(i + 1));
    });
    if (cls) s.setAttribute("class", cls);
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); s.appendChild(p);
    return s;
  }
  var ICON = { chat: "M4 5h16v11H9l-5 4z", warn: "M12 3l10 18H2zM12 10v5M12 18h.01" };
  function btn(label, kind, fn) {
    var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost")); b.setAttribute("type", "button");
    b.appendChild(document.createTextNode(label));
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function base() { return "/sites/" + C.h.site() + "/inquiries/comments/"; }
  function nameOf(x) { var t = String(x || "").trim(); return t || "Facebook user"; }
  function failure(res) { var st = res && res.status; return st === 404 ? { kind: "gone" } : { kind: "down" }; }

  /* ---------- pure helpers (tests/inbox-comments.test.mjs) ---------- */

  /* A post link only when it is an https facebook.com address; else "". */
  function safeLink(url) { return typeof url === "string" && /^https:\/\/([a-z0-9-]+\.)?facebook\.com\//i.test(url) ? url : ""; }
  /* The disabled actions of a comment as [kind, text] notes, one line per distinct sentence ("already hidden" has no note: the chip says it). */
  function notesFor(c) {
    var out = [], seen = {};
    [["public", c && c.public_reply], ["private", c && c.private_reply], ["hide", c && c.hide]].forEach(function (p) {
      var a = p[1]; if (!a || a.available !== false) return;
      var t = reasonText(a.reason); if (!t || seen[t]) return;
      seen[t] = true; out.push([p[0], t]);
    });
    return out;
  }
  function availableMode(c) {
    if (c && c.public_reply && c.public_reply.available !== false) return "public";
    if (c && c.private_reply && c.private_reply.available !== false) return "private";
    return "public";
  }

  /* ---------- the row, and the chips ---------- */

  function chip(cls, text) { return h("span", "chip " + cls + " ib-mini", text); }
  /* The post line: an "Ad" badge for an ad (withAd), and the caption (a short snippet, may be empty). */
  function postLine(post, withAd) {
    var line = h("span", "cm-post");
    if (withAd && post && post.is_ad === true) line.appendChild(h("span", "ib-ch cm-ad", T.ad));
    line.appendChild(h("span", "cm-cap", post && post.caption ? post.caption : post && post.is_ad ? "" : T.post));
    return line;
  }
  /* The Ad badge, the Unanswered / Answered state and Hidden, as small badges. */
  function chips(c) {
    var out = [];
    if (c && c.post && c.post.is_ad === true) out.push(h("span", "ib-ch cm-ad", T.ad));
    out.push(chip(c && c.answered === true ? "chip-ok" : "chip-neutral", c && c.answered === true ? T.answered : T.unanswered));
    if (c && c.hidden === true) out.push(chip("chip-neutral", T.hidden));
    return out;
  }
  /* What a list row needs of a comment: the name, the post line (the caption) and the badges that follow the channel badge. */
  function row(it) { return { name: nameOf(it.author_name), line: postLine(it.post, false), chips: chips(it) }; }

  /* ---------- select, draw, reload ---------- */

  function stateBox(iconPath, title, text, actions, err) {
    var box = h("div", "ib-state" + (err ? " ib-err" : "")); if (err) box.setAttribute("role", "alert");
    var tile = h("span", err ? "ib-tile ib-tile-err" : "icon-tile ib-tile"); tile.setAttribute("aria-hidden", "true"); tile.appendChild(icon(iconPath));
    add(box, tile, h("h2", "", title), text ? h("p", "", text) : null);
    if (actions && actions.length) { var a = h("div", "ib-actions"); actions.forEach(function (x) { a.appendChild(x); }); box.appendChild(a); }
    return box;
  }
  function ensure(hooks) {
    if (!C) C = { h: hooks, ref: null, name: "", thread: null, tstate: "", tfail: null, drafts: {}, keys: {}, mode: "public", notice: null, sending: false, hiding: false, confirm: false, tload: 0 };
    C.h = hooks;
  }
  function stop() { if (C) C.tload++; C = null; }
  function isOpen(ref) { return !!C && C.ref === ref && C.tstate === "ready"; }
  /* Opens a comment in the thread pane: the loading state at once, the detail read, then the actions. inbox.js marks it read. */
  function select(hooks, it) {
    ensure(hooks);
    C.ref = it.ref; C.name = nameOf(it.author_name); C.thread = null; C.tstate = "loading"; C.tfail = null; C.notice = null; C.confirm = false;
    C.mode = availableMode(it);
    draw();
    fetchThread(false);
    var back = byId("ib-back"); if (back) back.focus();
  }
  function deselect() { if (C) { C.tload++; C.ref = null; C.thread = null; C.tstate = ""; C.tfail = null; C.notice = null; C.confirm = false; } }
  function reload() { if (C && C.ref) fetchThread(true); }
  function itemOf(ref) { return C && C.h.item ? C.h.item(ref) : null; }
  function fetchThread(silent) {
    var mine = ++C.tload, ref = C.ref, st = C;
    D.call("GET", base() + encodeURIComponent(ref) + "/", null, true).then(function (res) {
      if (C !== st || mine !== st.tload || res.status === 401) return;
      if (!res.ok) {
        if (silent && C.thread) { D.toast("That did not work", msgOf(res, "We could not refresh this comment."), "error"); return; }
        C.tstate = "failed"; C.tfail = failure(res); draw(); return;
      }
      C.thread = res.data; C.tstate = "ready"; C.tfail = null;
      var it = itemOf(ref); if (it) mergeInto(it, res.data);
      if (!silent) C.mode = C.mode === "private" && privAvailable() ? "private" : availableMode(C.thread);
      draw(silent);
    });
  }
  function privAvailable() { return !!C.thread && !!C.thread.private_reply && C.thread.private_reply.available !== false; }
  /* A comment item from an answer replaces the row's fields (and the open detail's), keeping the detail's replies and actions. The read
     state is not taken from it: opening marks the comment read and the list's own read keeps that. */
  function mergeInto(target, src) {
    Object.keys(src).forEach(function (k) { if (k !== "replies" && k !== "actions" && k !== "unread") target[k] = src[k]; });
  }
  function merge(comment) {
    if (!comment || typeof comment.ref !== "string") return;
    var it = itemOf(comment.ref); if (it) mergeInto(it, comment);
    if (C.thread && C.thread.ref === comment.ref) mergeInto(C.thread, comment);
  }
  function listChanged() { if (C && C.h.listChanged) C.h.listChanged(); }

  function postCard(post) {
    var card = h("div", "cm-postcard"), link = post ? safeLink(post.permalink) : "";
    var label = h("span", "cm-on", T.on);
    var line = postLine(post, true);
    if (link) {
      var a = D.el("a", { "class": "cm-pl", href: link, target: "_blank", rel: "noopener noreferrer" });
      a.appendChild(line); add(card, label, a);
    } else add(card, label, line);
    return card;
  }
  /* Draws the detail into the thread pane. keepView: a background read; gives back the scroll, the reply box's focus and its selection. */
  function draw(keepView) {
    var p = C && C.h.pane(); if (!p || !C || !C.ref) return;
    var keep = null;
    if (keepView) {
      var om = p.querySelector ? p.querySelector(".ib-msgs") : null, ae = document.activeElement;
      keep = { top: om ? om.scrollTop : 0, ta: !!ae && ae.id === "cm-rb", s: null, e: null };
      if (keep.ta) { keep.s = ae.selectionStart; keep.e = ae.selectionEnd; }
    }
    clear(p);
    p.classList.remove("is-hide-phone");
    p.setAttribute("aria-label", "Comment from " + C.name);
    var c = C.thread;
    if (C.tstate === "loading" || C.tstate === "failed" || !c) {
      p.appendChild(C.h.head(C.name, []));
      if (C.tstate === "failed") {
        var f = C.tfail || { kind: "down" };
        p.appendChild(stateBox(ICON.warn, "We couldn't open this comment", f.kind === "gone" ? T.gone : T.reopenFail, [btn("Try again", "primary", function (b) { busy(b, true); C.tstate = "loading"; draw(); fetchThread(false); })], true));
      } else p.appendChild(h("p", "pm-meta ib-loading", T.opening));
      return;
    }
    p.appendChild(C.h.head(nameOf(c.author_name), chips(c)));
    var now = new Date();
    var msgs = h("div", "ib-msgs cm-msgs"); msgs.setAttribute("tabindex", "0"); msgs.setAttribute("aria-label", "Comment");
    msgs.appendChild(postCard(c.post));
    var rw = h("div", "ib-msg ib-msg-in"), when = U.whenText(c.created_at, now);
    add(rw, h("p", "ib-bub", c.text || ""), h("span", "ib-meta", when));
    msgs.appendChild(rw);
    (Array.isArray(c.replies) ? c.replies : []).forEach(function (r) {
      var out = r.is_page === true, rr = h("div", "ib-msg " + (out ? "ib-msg-out" : "ib-msg-in"));
      add(rr, h("p", "cm-rname", nameOf(r.author_name)), h("p", "ib-bub", r.text || ""), h("span", "ib-meta", U.whenText(r.created_at, now)));
      msgs.appendChild(rr);
    });
    p.appendChild(msgs);
    p.appendChild(composer(c));
    if (keep) {
      msgs.scrollTop = keep.top;
      if (keep.ta) { var ta = byId("cm-rb"); if (ta && !ta.disabled) { try { ta.focus({ preventScroll: true }); } catch (e1) { ta.focus(); } if (keep.s !== null && ta.setSelectionRange) { try { ta.setSelectionRange(keep.s, keep.e); } catch (e2) { /* not a text box now */ } } } }
    }
  }

  /* ---------- reply, message privately, hide ---------- */

  function draftKey() { return C.ref + ":" + C.mode; }
  function draftOf() { return has(C.drafts, draftKey()) ? C.drafts[draftKey()] : ""; }
  function modeAction(c, mode) { return mode === "private" ? c.private_reply : c.public_reply; }
  function composer(c) {
    var wrap = h("div", "ib-reply cm-compose");
    var mode = C.mode, act = modeAction(c, mode), off = !act || act.available === false;
    /* Reply and Message privately choose where the text goes; Hide asks first (there is no unhide in C1). A disabled one says why, below. */
    var modes = h("div", "cm-modes"); modes.setAttribute("role", "group"); modes.setAttribute("aria-label", "How to answer");
    [["public", T.reply, c.public_reply], ["private", T.priv, c.private_reply]].forEach(function (m) {
      var b = btn(m[1], "ghost", function () { if (C.mode === m[0] || (m[2] && m[2].available === false)) return; C.mode = m[0]; C.notice = null; draw(); });
      b.classList.add("cm-mode"); b.setAttribute("aria-pressed", m[0] === mode ? "true" : "false");
      if (m[0] === mode) b.classList.add("is-on");
      if (m[2] && m[2].available === false) { b.setAttribute("aria-disabled", "true"); b.classList.add("is-off"); }
      modes.appendChild(b);
    });
    var hideB = btn(T.hide, "ghost", function () { C.confirm = true; draw(); var y = byId("cm-hide-yes"); if (y) y.focus(); });
    hideB.classList.add("cm-hide"); hideB.setAttribute("id", "cm-hide-btn");
    if (!c.hide || c.hide.available === false) { hideB.disabled = true; hideB.setAttribute("aria-disabled", "true"); }
    modes.appendChild(hideB);
    wrap.appendChild(modes);
    if (C.confirm && c.hide && c.hide.available !== false) {
      var cf = h("div", "ib-note cm-confirm"); cf.setAttribute("role", "alertdialog"); cf.setAttribute("aria-label", T.confirmHide);
      var yes = btn(T.hide, "primary", function (b) { doHide(b); }); yes.setAttribute("id", "cm-hide-yes");
      var no = btn(T.cancel, "ghost", function () { C.confirm = false; draw(); var hb = byId("cm-hide-btn"); if (hb) hb.focus(); });
      var acts = h("div", "cm-confirm-actions"); add(acts, yes, no);
      add(cf, h("span", "", T.confirmHide), acts);
      wrap.appendChild(cf);
    }
    notesFor(c).forEach(function (n) {
      var el = h("p", "ib-note ib-note-info cm-note"); el.appendChild(icon(ICON.chat)); el.appendChild(h("span", "", n[1])); wrap.appendChild(el);
    });
    if (C.notice) {
      var fail = h("div", "ib-fail"); fail.setAttribute("role", "alert"); fail.appendChild(icon(ICON.warn));
      var fb = h("div", ""); add(fb, h("strong", "", T.notSent), document.createTextNode(" " + C.notice + T.keepText)); fail.appendChild(fb); wrap.appendChild(fail);
    }
    var lab = h("label", "pm-label sr-only", mode === "private" ? T.priv : T.reply); lab.setAttribute("for", "cm-rb");
    var ta = h("textarea", "pm-input ib-ta"); ta.setAttribute("id", "cm-rb"); ta.setAttribute("rows", "2"); ta.setAttribute("aria-describedby", "cm-rc");
    ta.setAttribute("maxlength", String(MAX[mode]));
    var count = h("span", "ib-count", "0 / " + MAX[mode]); count.setAttribute("id", "cm-rc");
    var foot = h("div", "ib-rfoot");
    if (off) {
      ta.disabled = true; wrap.classList.add("is-closed");
      var goOff = btn(T.send, "primary"); goOff.disabled = true; goOff.setAttribute("aria-disabled", "true");
      add(wrap, lab, ta, add(foot, count, goOff));
      return wrap;
    }
    ta.value = draftOf();
    var go = btn(C.notice ? "Try again" : T.send, "primary", function (b) { send(b, ta); });
    ta.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return;
      e.preventDefault();
      if (!go.disabled) send(go, ta);
    });
    function sync() { C.drafts[draftKey()] = ta.value; count.textContent = ta.value.length + " / " + MAX[mode]; go.disabled = !ta.value.trim() || C.sending; }
    ta.addEventListener("input", sync);
    add(wrap, lab, ta, add(foot, count, go));
    sync();
    return wrap;
  }
  function send(b, ta) {
    if (C.sending) return;
    var mode = C.mode, text = ta.value.trim();
    if (!text || text.length > MAX[mode]) return;
    var st = C, ref = C.ref, mine = C.tload, kk = ref + ":" + mode, key = C.keys[kk] || (C.keys[kk] = U.newKey());
    C.sending = true; busy(b, true);
    D.call("POST", base() + encodeURIComponent(ref) + "/" + (mode === "private" ? "private-reply" : "reply") + "/", { text: text, idempotency_key: key }, true).then(function (res) {
      st.sending = false;
      if (res.status === 401) return;
      if (C !== st || mine !== st.tload || C.ref !== ref) return; /* another comment was opened meanwhile; the API has the record */
      if (!res.ok) {
        if (res.status !== 0) delete C.keys[kk]; /* a reply the API never saw can use a new key; a lost answer keeps it so nothing goes twice */
        var code = codeOf(res);
        C.notice = res.status === 0 ? T.net : known(code) ? failTextOf(code) : msgOf(res, DOWN);
        draw(true);
        if (res.status === 409) fetchThread(true); /* the reasons changed (window closed, already sent...): show them */
        return;
      }
      delete C.keys[kk];
      merge(res.data && res.data.comment);
      if (res.data && res.data.state === "sent") { C.drafts[kk] = ""; C.notice = null; say(T.sent); }
      else C.notice = failTextOf(res.data && res.data.error_code);
      if (mode === "private" && !privAvailable() && C.thread && C.thread.public_reply && C.thread.public_reply.available !== false) C.mode = "public";
      listChanged(); draw(true);
      fetchThread(true);
    });
  }
  function doHide(b) {
    if (C.hiding || !C.ref) return;
    var st = C, ref = C.ref, mine = C.tload;
    C.hiding = true; busy(b, true);
    D.call("POST", base() + encodeURIComponent(ref) + "/hide/", null, true).then(function (res) {
      st.hiding = false;
      if (res.status === 401) return;
      if (C !== st || mine !== st.tload || C.ref !== ref) return;
      C.confirm = false;
      if (!res.ok) {
        var code = codeOf(res);
        D.toast("That did not work", res.status === 0 ? msgOf(res, DOWN) : known(code) ? failTextOf(code) : msgOf(res, DOWN), "error");
        draw(true);
        if (res.status === 409) fetchThread(true);
        return;
      }
      if (res.data && res.data.state === "sent") { merge(res.data.comment); say(T.hid); listChanged(); draw(true); fetchThread(true); return; }
      D.toast("That did not work", failTextOf(res.data && res.data.error_code), "error");
      draw(true);
    });
  }

  window.NOInboxComments = { select: select, draw: draw, reload: reload, deselect: deselect, stop: stop, isOpen: isOpen, row: row,
    util: { safeLink: safeLink, notesFor: notesFor, reasonText: reasonText, failTextOf: failTextOf, availableMode: availableMode } };
})();
