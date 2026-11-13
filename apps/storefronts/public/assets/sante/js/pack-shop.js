/* Santé shop checkout. This storefront's own file, not one of the approved TWCinc files: TWCinc's store-checkout.js (the field
   checkmarks, the +63 mobile box, the Confirm Shipping Details popup, the account Copy button, the QR zoom) with the Cash on Delivery
   code popup left out (bank or e-wallet transfer is the only payment), and the ship-mode card switch that TWCinc wrote inline in
   store_checkout.html (the policy allows no inline script). Display only: the server validates every field. */
(function () {
  'use strict';

  /* ---- Shipping Address step: field checkmarks, mobile box, confirm popup ---- */
  (function () {
    var form = document.getElementById('delivery');
    if (!form) return;
    function digitsOnly(v) { return (v || '').replace(/\D/g, ''); }
    var VALID = {
      cf_first_name: function (v) { return !!v.trim(); },
      cf_last_name: function (v) { return !!v.trim(); },
      cf_mobile: function (v) { return /^9\d{9}$/.test(digitsOnly(v)); },
      cf_email: function (v) { return !!v.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); },
      cf_line: function (v) { return !!v.trim(); },
      cf_province: function (v) { return !!v; },
      cf_city: function (v) { return !!v; },
      cf_barangay: function (v) { return !!v; },
      cf_landmark: function (v) { return !!v.trim(); }
    };
    function checkTarget(el) {
      var tw = el.closest('.pk-select');
      var box = tw && tw.querySelector('.pk-select-box');
      if (box) return box;
      return el.closest('.sf-phone-combo') || el.closest('.sf-field-control') || el.parentElement;
    }
    function wrap(el) {
      if (el.closest('.sf-phone-combo') || el.parentElement.classList.contains('sf-field-control')) return;
      var span = document.createElement('span');
      span.className = 'sf-field-control';
      el.parentNode.insertBefore(span, el);
      span.appendChild(el);
    }
    function setOk(el, ok) {
      var target = checkTarget(el);
      var check = target.querySelector('.sf-field-check');
      if (ok && !check) {
        check = document.createElement('span');
        check.className = 'sf-field-check';
        check.textContent = '✓';
        check.setAttribute('aria-hidden', 'true');
        target.appendChild(check);
      }
      target.classList.toggle('sf-field-ok', ok);
      if (ok) {
        target.classList.remove('sf-field-invalid');
        el.classList.remove('sf-field-invalid');
        var holder = el.closest('.sf-field');
        if (holder) holder.querySelectorAll('.sf-field-error').forEach(function (m) { m.remove(); });
      }
    }
    var REQUIRED_MSG = {
      cf_first_name: 'Enter the first name.', cf_last_name: 'Enter the last name.', cf_mobile: 'Enter a valid Philippine mobile number.',
      cf_email: 'Enter a valid email address.'
    };
    function errorAnchor(el) {
      return el.closest('.sf-phone-combo') || el.closest('.sf-field-control') || el.closest('.pk-select') || el;
    }
    function markInvalid(el, msg) {
      var holder = el.closest('.sf-field');
      if (!holder) return;
      if (el.tagName === 'SELECT') checkTarget(el).classList.add('sf-field-invalid');
      else (el.closest('.sf-phone-combo') || el).classList.add('sf-field-invalid');
      if (msg && !holder.querySelector('.sf-field-error')) {
        var p = document.createElement('p');
        p.className = 'sf-field-error'; p.textContent = msg;
        errorAnchor(el).insertAdjacentElement('afterend', p);
      }
    }
    function clearInvalid(el) {
      var holder = el.closest('.sf-field');
      checkTarget(el).classList.remove('sf-field-invalid');
      el.classList.remove('sf-field-invalid');
      if (holder) holder.querySelectorAll('.sf-field-error').forEach(function (m) { m.remove(); });
    }
    function markServerErrors() {
      Object.keys(VALID).forEach(function (id) {
        var el = document.getElementById(id), holder = el && el.closest('.sf-field');
        if (holder && holder.querySelector('.sf-field-error')) markInvalid(el, '');
      });
    }
    function refresh() {
      Object.keys(VALID).forEach(function (id) {
        var el = document.getElementById(id);
        if (el && el.value && VALID[id](el.value)) setOk(el, true);
      });
      var country = document.getElementById('cf_country');
      if (country) setOk(country, true);
      markServerErrors();
    }
    function localDigits(v) {
      var d = digitsOnly(v);
      if (d.indexOf('63') === 0) d = d.slice(2); else if (d.charAt(0) === '0') d = d.slice(1);
      return d.slice(0, 10);
    }
    function groupLocal(d) { return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' '); }
    function clearMobileError(el) {
      var combo = el.closest('.sf-phone-combo'), holder = el.closest('.sf-field');
      if (combo) combo.classList.remove('sf-field-invalid');
      if (holder) holder.querySelectorAll('.sf-field-error').forEach(function (m) { m.remove(); });
    }
    function wireMobile() {
      var el = document.getElementById('cf_mobile');
      if (!el) return;
      el.value = groupLocal(localDigits(el.value));
      el.addEventListener('input', function () {
        var seen = digitsOnly(el.value.slice(0, el.selectionStart)).length;
        var d = localDigits(el.value);
        el.value = groupLocal(d);
        var pos = 0, n = 0;
        while (pos < el.value.length && n < Math.min(seen, d.length)) { if (/\d/.test(el.value.charAt(pos))) n++; pos++; }
        el.setSelectionRange(pos, pos);
        clearMobileError(el);
      });
      el.addEventListener('paste', function (e) {
        var text = (e.clipboardData || window.clipboardData).getData('text');
        e.preventDefault();
        el.value = groupLocal(localDigits(text));
        clearMobileError(el);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.setSelectionRange(el.value.length, el.value.length);
      });
      el.addEventListener('blur', function () {
        var combo = el.closest('.sf-phone-combo'), holder = el.closest('.sf-field');
        if (!el.value.trim() || VALID.cf_mobile(el.value) || !combo || holder.querySelector('.sf-field-error')) return;
        combo.classList.add('sf-field-invalid');
        var p = document.createElement('p');
        p.className = 'sf-field-error'; p.textContent = 'Enter a valid Philippine mobile number.';
        combo.insertAdjacentElement('afterend', p);
      });
    }
    function init() {
      wireMobile();
      Object.keys(VALID).forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (el.tagName !== 'SELECT') wrap(el);
        el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', function () {
          setOk(el, VALID[id](el.value));
          if (id !== 'cf_mobile' && el.value.trim()) clearInvalid(el);
        });
      });
      refresh();
      setTimeout(refresh, 800);
      setTimeout(refresh, 2500);

      var modal = document.getElementById('sfConfirmAddressModal');
      if (!modal) return;
      var confirmed = false;
      function close() { modal.hidden = true; }
      form.addEventListener('submit', function (e) {
        if (confirmed) return;
        var allOk = Object.keys(VALID).every(function (id) {
          var el = document.getElementById(id);
          if (!el || id === 'cf_email') return true;
          return VALID[id](el.value);
        });
        var email = document.getElementById('cf_email');
        if (email && email.value.trim() && !VALID.cf_email(email.value)) allOk = false;
        if (!allOk) {
          e.preventDefault();
          var first = null;
          Object.keys(VALID).forEach(function (id) {
            var el = document.getElementById(id);
            if (!el || (id === 'cf_email' && !el.value.trim()) || VALID[id](el.value)) return;
            clearInvalid(el);
            markInvalid(el, REQUIRED_MSG[id] || 'Enter this part of the address.');
            if (!first) first = el;
          });
          if (first && first.tagName !== 'SELECT') first.focus();
          if (first) first.closest('.sf-field').scrollIntoView({ block: 'center', behavior: 'smooth' });
          return;
        }
        e.preventDefault();
        modal.hidden = false;
      });
      document.getElementById('sfConfirmAddressClose').addEventListener('click', close);
      document.getElementById('sfConfirmReview').addEventListener('click', close);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) close(); });
      document.getElementById('sfConfirmProceed').addEventListener('click', function () {
        close();
        confirmed = true;
        if (form.requestSubmit) form.requestSubmit(); else form.submit();
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  })();

  /* ---- Member ship-mode cards: the two panels and the two summaries follow the chosen card ---- */
  (function () {
    var radios = document.querySelectorAll('#sfShipMode input[name="ship_radio"]');
    if (!radios.length) return;
    function show(v) {
      document.querySelectorAll('[data-sf-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-sf-panel') !== v; });
      document.querySelectorAll('[data-sf-for]').forEach(function (p) { p.hidden = p.getAttribute('data-sf-for') !== v; });
    }
    radios.forEach(function (r) { r.addEventListener('change', function () { if (r.checked) show(r.value); }); });
    var back = document.getElementById('sfBackToChoice'), mine = document.querySelector('#sfShipMode input[value="home"]');
    if (back && mine && !mine.disabled) back.addEventListener('click', function () { mine.checked = true; show('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  })();

  /* ---- Transfer panel: Copy puts the account number on the clipboard ---- */
  (function () {
    var panel = document.getElementById('sfDirectPanel');
    if (!panel) return;
    function legacyCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = !err && false; }
      document.body.removeChild(ta);
      return ok;
    }
    var canModern = !!(navigator.clipboard && window.isSecureContext);
    var canLegacy = !!(document.queryCommandSupported && document.queryCommandSupported('copy'));
    if (!canModern && !canLegacy) return;
    panel.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.hidden = false;
      function done() {
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1800);
      }
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        var text = btn.closest('.sf-acct-numrow').querySelector('[data-num]').textContent.trim();
        if (canModern) {
          navigator.clipboard.writeText(text).then(done, function () { if (legacyCopy(text)) done(); });
        } else if (legacyCopy(text)) {
          done();
        }
      });
    });
  })();

  /* ---- Transfer panel: a tap on a QR code opens it large in a dialog ---- */
  (function () {
    var panel = document.getElementById('sfDirectPanel');
    if (!panel) return;
    var dlg = null, opener = null;
    function open(btn) {
      var img = btn.querySelector('img');
      if (!img) return;
      if (typeof HTMLDialogElement === 'undefined') { window.open(img.src, '_blank', 'noopener'); return; }
      if (!dlg) {
        dlg = document.createElement('dialog'); dlg.className = 'sf-qr-zoom'; dlg.setAttribute('aria-label', 'QR code, enlarged');
        var big = document.createElement('img'), close = document.createElement('button');
        close.type = 'button'; close.className = 'sf-qr-zoom-x'; close.setAttribute('aria-label', 'Close'); close.textContent = '×';
        dlg.appendChild(big); dlg.appendChild(close); document.body.appendChild(dlg);
        close.addEventListener('click', function () { dlg.close(); });
        dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
        dlg.addEventListener('close', function () { if (opener && opener.focus) opener.focus(); });
      }
      var shown = dlg.querySelector('img'); shown.src = img.src; shown.alt = img.alt;
      opener = btn; dlg.showModal();
    }
    panel.querySelectorAll('[data-qr-zoom]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.preventDefault(); open(btn); });
    });
  })();

  /* ---- Place order: one tap only (the order and its proof go in one post) ---- */
  (function () {
    var form = document.getElementById('sfPlaceForm');
    if (!form) return;
    form.addEventListener('submit', function () {
      var btn = form.querySelector('.sf-place-order');
      if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'Placing your order…'; }
    });
  })();
})();
