/* Onboarding 2 of 3, delivery address. The form posts normally and the server validates and re-renders with errors, so this file only
   drives the province -> city -> barangay cascade, the ZIP row and its Save check, the +63 mobile, and puts back the buyer's choices
   after a re-render (each select's data-value). Adapted from the merchant membership-pack address script. */
(function () {
  'use strict';

  var ZIP_AUTHORITATIVE = ['barangay', 'city_unique'];

  // Receiver Mobile is the local part after a fixed +63 prefix: digits only, at most 10, shown 9XX XXX XXXX.
  // A pasted +63 / 63 prefix or a leading 0 is dropped; nothing else is thrown away while typing, so the box
  // never swallows a key (the server checks the number and stores E.164).
  var PH_LOCAL_RE = /^9\d{9}$/;
  function phLocalDigits(raw) {
    var d = (raw || '').replace(/\D/g, '');
    if (d.slice(0, 3) === '639') d = d.slice(2);
    else if (d.charAt(0) === '0') d = d.slice(1);
    return d.slice(0, 10);
  }
  function formatPhLocal(raw) {
    var d = phLocalDigits(raw);
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ');
  }
  function bindPhMobile(input) {
    if (!input) return;
    input.addEventListener('input', function () {
      var caret = input.selectionStart == null ? input.value.length : input.selectionStart;
      var digitsBefore = phLocalDigits(input.value.slice(0, caret)).length;
      var formatted = formatPhLocal(input.value);
      if (formatted === input.value) return;
      input.value = formatted;
      var pos = 0, seen = 0;
      while (pos < formatted.length && seen < digitsBefore) {
        if (/\d/.test(formatted.charAt(pos))) seen++;
        pos++;
      }
      if (document.activeElement === input) input.setSelectionRange(pos, pos);
    });
    // On load (a server re-render) only a complete number is regrouped, so a rejected value
    // stays exactly as the buyer typed it next to its error.
    if (PH_LOCAL_RE.test(phLocalDigits(input.value))) input.value = formatPhLocal(input.value);
  }

  function init(root) {
    bindPhMobile(root.querySelector('input[name="receiver_mobile"], input[name="mobile"]'));
    var prov = root.querySelector('select[name="province"]');
    var city = root.querySelector('select[name="city"]');
    var brgy = root.querySelector('select[name="barangay"]');
    if (!prov || !city || !brgy) return;
    var brgyCode = root.querySelector('input[name="barangay_code"]');
    var zipField = root.querySelector('[data-pp-zip-field]');
    var zipInput = root.querySelector('input[name="postal_code"], input[name="zip"]');
    var zipHint = zipField ? zipField.querySelector('[data-pp-zip-hint]') : null;
    var phUrls = ['data-ph-provinces', 'data-ph-cities', 'data-ph-barangays'].map(function (a) { return root.getAttribute(a) || ''; });
    var zipUrl = root.getAttribute('data-zip-url') || '';
    var PH = { provinces: [], cities: [], brgys: [] };

    function esc(text) {
      return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }
    function fill(sel, items, codeKey) {
      sel.innerHTML = '<option value=""></option>' + items.map(function (it) {
        return '<option value="' + esc(it.name) + '" data-code="' + esc(it[codeKey]) + '">' + esc(it.name) + '</option>';
      }).join('');
    }
    function reset(sel) { sel.innerHTML = '<option value=""></option>'; }
    function lock(sel, locked) {
      if (locked) { sel.value = ''; sel.setAttribute('disabled', ''); }
      else { sel.removeAttribute('disabled'); }
    }
    function codeOf(sel) {
      var opt = sel.selectedOptions && sel.selectedOptions[0];
      return opt ? opt.getAttribute('data-code') || '' : '';
    }
    // Select a restored value and tell twc-select (it listens for change).
    // A saved value written by hand ("Naga", "Camarines Sur") still finds the dataset's name ("NAGA CITY", "CAMARINES SUR").
    function norm(t) { return String(t || '').toUpperCase().replace(/^CITY OF /, '').replace(/ CITY$/, '').replace(/\s+/g, ' ').trim(); }
    function choose(sel, value) {
      if (!value) return false;
      sel.value = value;
      if (sel.value !== value) {
        var want = norm(value), hit = null;
        Array.prototype.forEach.call(sel.options, function (o) { if (!hit && o.value && norm(o.value) === want) hit = o.value; });
        if (hit === null) return false;
        sel.value = hit;
      }
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // The ZIP row (spec 2026-10-09 rev 8.4 M-36; R53a), as on the shop's member address popup:
    // hidden while the barangay lookup is authoritative (the server derives the ZIP and ignores
    // a typed one); shown when it is not, with the city ZIP for city_approx and blank otherwise.
    // Hiding clears the value, the hint, the invalid state and the server's ZIP error line, so a
    // hidden row posts an empty postal_code.
    function zipShow(show, keepTyped) {
      if (!zipField) return;
      zipField.hidden = !show;
      if (show || keepTyped) return;
      if (zipInput) {
        zipInput.value = '';
        zipInput.classList.remove('bad', 'sf-field-invalid');
        zipInput.removeAttribute('aria-invalid');
      }
      if (zipHint) zipHint.textContent = '';
      zipField.querySelectorAll('.err').forEach(function (el) { el.remove(); });
    }
    function applyZipState(d, keepTyped) {
      if (!zipInput) return;
      var precision = d && d.success ? d.zip_precision : null;
      if (ZIP_AUTHORITATIVE.indexOf(precision) !== -1) { zipShow(false); return; }
      var typed = keepTyped ? zipInput.value : '';
      var cityZip = (precision === 'city_approx' && d.zip) ? d.zip : '';
      zipShow(true);
      zipInput.value = typed || cityZip;
      if (zipHint) {
        zipHint.textContent = cityZip
          ? 'This is the city ZIP code. Correct it if your barangay uses a different one.'
          : "We couldn't find the ZIP code for this barangay. Please type it.";
      }
    }

    // The ZIP Save check (spec 2026-10-09 rev 8.4 M-36 "Submit check"; R55), the shop popup's
    // rule: while the ZIP row is visible, Save is blocked until it holds 4 digits, with the
    // server's own message in the row's error line. A hidden row never blocks, and every other
    // field is still checked by the server. Typing in the ZIP box clears the error.
    var form = root.closest('form');
    if (form) {
      form.addEventListener('submit', function (e) {
        if (!zipField || zipField.hidden || !zipInput) return;
        if (/^\d{4}$/.test((zipInput.value || '').trim())) return;
        e.preventDefault();
        var line = zipField.querySelector('.err');
        if (!line) {
          line = document.createElement('p');
          line.className = 'err sf-field-error';
          zipField.appendChild(line);
        }
        line.textContent = 'Enter the 4-digit ZIP code for this address.';
        zipInput.classList.add('bad', 'sf-field-invalid');
        zipInput.setAttribute('aria-invalid', 'true');
        zipInput.focus();
      });
    }
    if (zipInput) {
      zipInput.addEventListener('input', function () {
        zipInput.classList.remove('bad', 'sf-field-invalid');
        zipInput.removeAttribute('aria-invalid');
        if (zipField) zipField.querySelectorAll('.err').forEach(function (el) { el.remove(); });
      });
    }
    function lookupZip(keepTyped) {
      if (!zipUrl || !prov.value || !city.value || !brgy.value) { zipShow(false, keepTyped); return; }
      fetch(zipUrl + '?province=' + encodeURIComponent(prov.value) +
            '&city=' + encodeURIComponent(city.value) +
            '&barangay=' + encodeURIComponent(brgy.value), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) { applyZipState(d, keepTyped); })
        .catch(function () { applyZipState({}, keepTyped); });
    }

    var restoring = false;
    prov.addEventListener('change', function () {
      var code = codeOf(prov);
      if (!restoring) zipShow(false);
      reset(brgy); lock(brgy, true);
      if (brgyCode) brgyCode.value = '';
      if (code) {
        fill(city, PH.cities.filter(function (c) { return String(c.prov_code) === String(code); }), 'mun_code');
        lock(city, false);
      } else {
        reset(city); lock(city, true);
      }
    });
    city.addEventListener('change', function () {
      var code = codeOf(city);
      if (!restoring) zipShow(false);
      if (brgyCode) brgyCode.value = '';
      if (code) {
        fill(brgy, PH.brgys.filter(function (b) { return String(b.mun_code) === String(code); }), 'brgy_code');
        lock(brgy, false);
      } else {
        reset(brgy); lock(brgy, true);
      }
    });
    brgy.addEventListener('change', function () {
      if (brgyCode) brgyCode.value = codeOf(brgy);
      lookupZip(restoring);
    });

    if (phUrls.indexOf('') !== -1) return;  // the page names the pack's own copies; with none, the selects stay empty and the server rejects the form
    Promise.all(phUrls.map(function (u) { return fetch(u).then(function (r) { return r.json(); }); })).then(function (res) {
      PH.provinces = res[0]; PH.cities = res[1]; PH.brgys = res[2];
      fill(prov, PH.provinces, 'prov_code');
      lock(prov, false);
      restoring = true;
      if (choose(prov, prov.getAttribute('data-value')) && choose(city, city.getAttribute('data-value'))) {
        choose(brgy, brgy.getAttribute('data-value'));
      }
      restoring = false;
    }).catch(function () { /* selects stay empty; the server rejects a missing field */ });
  }

  document.querySelectorAll('[data-pp-address]').forEach(init);
})();
