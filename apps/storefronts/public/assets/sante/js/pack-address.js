/* The delivery address picker, one script for every Santé address form (the Membership Pack onboarding address, the member Home
   address and the shop checkout; ClickUp z8uq9mkmwb, ruling ADDRESS-SHOPEE-PICKER). It replaces the three Province / City / Barangay
   dropdowns with one field, "Province, City, Barangay", that opens a panel of four tabs. Each pick moves to the next tab; the
   tabs stay clickable to go back; the field shows the path and a clear (x) resets it.

   The form posts normally and the server validates and re-renders with errors. The server draws plain text inputs named province,
   city and barangay (and barangay_code on the onboarding form); this file hides them, drives them from the picker and puts the
   buyer's values back after a re-render, so the posted names and values are the ones the dropdowns posted. The region (Metro
   Manila, North Luzon, South Luzon, Visayas, Mindanao, from each province's reg_code) only filters the provinces and is never posted.
   Without this script, or if the data files do not load, the three text inputs stay visible and still post.

   The ZIP follows the existing ZIP lookup (data-zip-url) and is posted from its own input (ADDRESS-FORM-STANDARD). An authoritative
   answer (zip_precision barangay, learned or city_unique) is posted silently. Otherwise (city_approx, or no answer) a pop-up dialog
   (ADDRESS-ZIP-POPUP-LEARN) asks for the 4-digit ZIP: pre-filled and editable for city_approx, empty for no answer; it is required, and
   closing it without a ZIP leaves the address incomplete with the same error. A valid ZIP already in the box (a server re-render)
   shows no dialog. The +63 receiver mobile box is also driven here. Adapted from the merchant membership-pack address script. */
(function () {
  'use strict';

  var ZIP_AUTHORITATIVE = ['barangay', 'learned', 'city_unique'];
  var ZIP_ERROR = 'Enter the 4-digit ZIP code for this address.';
  var PICK_ERROR = 'Choose your province, city and barangay.';
  var ZIP_SUGGESTED = 'This is the city ZIP code. Correct it if your barangay uses a different one.';
  var ZIP_MISSING = "We couldn't find the ZIP code for this barangay. Please type it.";
  var ZIP_RE = /^\d{4}$/;
  var FIELD_LABEL = 'Province, City, Barangay';

  // Supervisor decision (ClickUp z8uq9mkmwb): five groups over provinces.json reg_code.
  var REGIONS = [
    { key: 'metro-manila', name: 'Metro Manila', codes: ['13'] },
    { key: 'north-luzon', name: 'North Luzon', codes: ['01', '02', '03', '14'] },
    { key: 'south-luzon', name: 'South Luzon', codes: ['04', '05', '17'] },
    { key: 'visayas', name: 'Visayas', codes: ['06', '07', '08'] },
    { key: 'mindanao', name: 'Mindanao', codes: ['09', '10', '11', '12', '15', '16'] }
  ];
  var LEVELS = ['region', 'province', 'city', 'barangay'];
  var LEVEL_LABEL = { region: 'Region', province: 'Province', city: 'City', barangay: 'Barangay' };

  function regionOf(regCode) {
    for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].codes.indexOf(String(regCode)) !== -1) return REGIONS[i];
    return null;
  }
  function provincesOf(region, provinces) {
    if (!region) return [];
    return provinces.filter(function (p) { return region.codes.indexOf(String(p.reg_code)) !== -1; });
  }
  // The dataset's names are upper case ("DAVAO DEL SUR"); the field and the lists show "Davao Del Sur". The posted value stays the dataset's name.
  function titleCase(text) {
    return String(text || '').toLowerCase()
      .replace(/(^|[\s\-(\/.])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); })
      .replace(/\b(i{1,3}|iv|vi{0,3}|ix|x)\b/gi, function (m) { return m.toUpperCase(); });
  }
  // A saved value written by hand ("Naga", "Camarines Sur") still finds the dataset's name ("NAGA CITY", "CAMARINES SUR").
  function norm(t) { return String(t || '').toUpperCase().replace(/^CITY OF /, '').replace(/ CITY$/, '').replace(/\s+/g, ' ').trim(); }
  function findByName(items, value) {
    if (!value) return null;
    var i;
    for (i = 0; i < items.length; i++) if (items[i].name === value) return items[i];
    var want = norm(value);
    for (i = 0; i < items.length; i++) if (norm(items[i].name) === want) return items[i];
    return null;
  }
  // Search inside a tab: names that start with the typed text first, then names that contain it.
  function filterItems(items, query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return items.slice();
    var starts = [], has = [];
    items.forEach(function (it) {
      var n = String(it.name).toLowerCase();
      if (n.indexOf(q) === 0) starts.push(it);
      else if (n.indexOf(q) !== -1) has.push(it);
    });
    return starts.concat(has);
  }
  function pathText(region, prov, city, brgy) {
    var parts = [];
    // The field shows Province, City, Barangay only (ADDRESS-FORM-STANDARD); the region is the panel's first tab, not part of the text.
    if (prov) parts.push(titleCase(prov.name));
    if (city) parts.push(titleCase(city.name));
    if (brgy) parts.push(titleCase(brgy.name));
    return parts.join(', ');
  }
  // The ZIP states from the lookup's answer; "typed" is what the buyer already typed (a server re-render draws it back).
  //   authoritative (barangay, learned, city_unique): filled, posted silently, no dialog.
  //   entered: a valid 4-digit ZIP is already there (a re-render) and the answer is not authoritative: kept, no dialog.
  //   suggested (city_approx): the dialog opens pre-filled with the suggestion, editable.
  //   missing (no answer): the dialog opens empty; a ZIP is required.
  function zipState(d, typed) {
    var zip = d && d.success && d.zip ? String(d.zip) : '';
    var precision = d && d.success ? d.zip_precision : null;
    if (zip && ZIP_AUTHORITATIVE.indexOf(precision) !== -1) return { kind: 'authoritative', value: zip, readOnly: true, hint: '', dialog: false };
    if (ZIP_RE.test(typed || '')) return { kind: 'entered', value: typed, readOnly: false, hint: '', dialog: false };
    if (zip) return { kind: 'suggested', value: zip, readOnly: false, hint: ZIP_SUGGESTED, dialog: true };
    return { kind: 'missing', value: '', readOnly: false, hint: ZIP_MISSING, dialog: true };
  }

  // The picker's choices, apart from the page: the path (region, province, city, barangay), what each tab lists, what a pick keeps or
  // resets below it, the clear, and putting back the values the server drew. The page code below only draws it.
  function createModel(provinces, cities, brgys) {
    var byProv = {}, byMun = {};
    cities.forEach(function (c) { (byProv[c.prov_code] = byProv[c.prov_code] || []).push(c); });
    brgys.forEach(function (b) { (byMun[b.mun_code] = byMun[b.mun_code] || []).push(b); });
    var m = { region: null, prov: null, city: null, brgy: null };
    m.items = function (level) {
      if (level === 'region') return REGIONS.filter(function (r) { return provincesOf(r, provinces).length; }).map(function (r) { return { name: r.name, key: r.key }; });
      if (level === 'province') return provincesOf(m.region, provinces);
      if (level === 'city') return m.prov ? (byProv[m.prov.prov_code] || []) : [];
      return m.city ? (byMun[m.city.mun_code] || []) : [];
    };
    m.reachable = function (level) {
      if (level === 'region') return true;
      if (level === 'province') return !!m.region;
      if (level === 'city') return !!m.prov;
      return !!m.city;
    };
    m.done = function (level) {
      return level === 'region' ? !!m.region : level === 'province' ? !!m.prov : level === 'city' ? !!m.city : !!m.brgy;
    };
    m.isChosen = function (level, it) {
      if (level === 'region') return !!m.region && m.region.key === it.key;
      return (level === 'province' ? m.prov : level === 'city' ? m.city : m.brgy) === it;
    };
    m.nextTab = function () { return !m.region ? 'region' : !m.prov ? 'province' : !m.city ? 'city' : 'barangay'; };
    m.complete = function () { return !!(m.prov && m.city && m.brgy); };
    // Picking keeps what is below only when the same item is picked again. Returns the tab to show next ("" once the barangay is
    // picked) and whether the lower choices (and so the ZIP) were reset. A region with one province (Metro Manila) picks it too.
    m.pick = function (level, it) {
      var reset = false;
      if (level === 'region') {
        var region = null;
        REGIONS.forEach(function (r) { if (r.key === it.key) region = r; });
        if (m.region !== region) { m.prov = m.city = m.brgy = null; reset = true; }
        m.region = region;
        var provs = provincesOf(region, provinces);
        if (provs.length === 1) { var inner = m.pick('province', provs[0]); return { next: inner.next, reset: reset || inner.reset }; }
        return { next: 'province', reset: reset };
      }
      if (level === 'province') {
        if (m.prov !== it) { m.city = m.brgy = null; reset = true; }
        m.prov = it;
        m.region = regionOf(it.reg_code) || m.region;
        return { next: 'city', reset: reset };
      }
      if (level === 'city') {
        if (m.city !== it) { m.brgy = null; reset = true; }
        m.city = it;
        return { next: 'barangay', reset: reset };
      }
      m.brgy = it;
      return { next: '', reset: false };
    };
    m.clear = function () { m.region = m.prov = m.city = m.brgy = null; };
    // Put back the names the server drew, as far as the data finds them (a name written by hand still matches).
    m.restore = function (saved) {
      m.prov = findByName(provinces, saved.province);
      m.city = m.prov ? findByName(byProv[m.prov.prov_code] || [], saved.city) : null;
      m.brgy = m.city ? findByName(byMun[m.city.mun_code] || [], saved.barangay) : null;
      m.region = m.prov ? regionOf(m.prov.reg_code) : null;
    };
    // What the three inputs post.
    m.values = function () {
      return { province: m.prov ? m.prov.name : '', city: m.city ? m.city.name : '', barangay: m.brgy ? m.brgy.name : '', barangay_code: m.brgy ? m.brgy.brgy_code || '' : '' };
    };
    m.path = function () { return pathText(m.region, m.prov, m.city, m.brgy); };
    return m;
  }

  // The pure parts, for tests/address-picker.test.ts.
  window.PPAddress = { REGIONS: REGIONS, regionOf: regionOf, provincesOf: provincesOf, titleCase: titleCase, norm: norm, findByName: findByName, filterItems: filterItems, pathText: pathText, zipState: zipState, createModel: createModel };

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

  function make(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }

  var uidCount = 0;

  function init(root) {
    bindPhMobile(root.querySelector('input[name="receiver_mobile"], input[name="mobile"]'));
    var mount = root.querySelector('[data-pp-pick-mount]');
    var fallback = root.querySelector('[data-pp-pick-fallback]');
    var provIn = root.querySelector('input[name="province"]');
    var cityIn = root.querySelector('input[name="city"]');
    var brgyIn = root.querySelector('input[name="barangay"]');
    if (!mount || !fallback || !provIn || !cityIn || !brgyIn) return;
    var brgyCode = root.querySelector('input[name="barangay_code"]');
    var zipField = root.querySelector('[data-pp-zip-field]');
    var zipInput = root.querySelector('input[name="postal_code"], input[name="zip"]');
    var zipHint = zipField ? zipField.querySelector('[data-pp-zip-hint]') : null;
    var errBox = root.querySelector('[data-pp-pick-errors]');
    var phUrls = ['data-ph-provinces', 'data-ph-cities', 'data-ph-barangays'].map(function (a) { return root.getAttribute(a) || ''; });
    var zipUrl = root.getAttribute('data-zip-url') || '';
    // The page names the pack's own copies of the data; with none, the text inputs stay and the server rejects a bad form.
    if (phUrls.indexOf('') !== -1) return;

    var M = createModel([], [], []);
    var S = { tab: 'region', query: '', active: 0, view: [], open: false, ready: false };
    var uid = 'ppk' + (++uidCount);

    /* ---- ZIP ---- */
    // With a native <dialog> the ZIP input stays hidden (it still posts) and a short note with a button stands in its row; without
    // one the row is the plain required field it was.
    var useDlg = typeof HTMLDialogElement !== 'undefined' && typeof document.createElement('dialog').showModal === 'function';
    var suggestion = '';
    var zipBtn = null, dlg = null, dlgInput = null, dlgErr = null, dlgConfirmed = false;
    if (zipField && useDlg) {
      zipField.classList.add('pp-zip-note-mode');
      zipBtn = make('button', { type: 'button', 'class': 'pp-zip-edit' });
      zipField.appendChild(zipBtn);
    }
    function zipClearError() {
      if (!zipInput) return;
      zipInput.classList.remove('bad', 'sf-field-invalid');
      zipInput.removeAttribute('aria-invalid');
      if (zipField) zipField.querySelectorAll('.err, .sf-field-error').forEach(function (el) { el.remove(); });
    }
    function showZipError() {
      zipClearError();
      zipField.appendChild(make('p', { 'class': 'err sf-field-error' }, ZIP_ERROR));
      zipInput.classList.add('bad', 'sf-field-invalid');
      zipInput.setAttribute('aria-invalid', 'true');
    }
    function applyZip(st) {
      if (!zipInput) return;
      zipInput.value = st.value;
      zipInput.readOnly = st.readOnly;
      if (zipField) zipField.setAttribute('data-zip-state', st.kind);
      var hint = st.hint;
      if (useDlg && st.kind === 'entered') hint = 'ZIP code: ' + st.value;
      if (zipHint) zipHint.textContent = hint;
      if (zipBtn) zipBtn.textContent = st.kind === 'entered' ? 'Change' : 'Enter ZIP code';
      if (st.kind === 'authoritative' || st.kind === 'suggested' || st.kind === 'entered') zipClearError();
    }
    var IDLE = { kind: 'idle', value: '', readOnly: true, hint: '' };
    var zipSeq = 0;
    function zipIdle() { zipSeq++; suggestion = ''; applyZip(IDLE); zipClearError(); }

    /* The ZIP pop-up: a native modal <dialog> (focus is trapped and the page behind is inert), in the app's colours. Esc, the close
       button and the backdrop all close it; closing without a 4-digit ZIP leaves the box empty and shows the ZIP error. */
    function buildDialog() {
      var t = uid + '-zt', dsc = uid + '-zd', inId = uid + '-zi';
      dlg = make('dialog', { 'class': 'pp-zip-dlg', 'aria-labelledby': t, 'aria-describedby': dsc });
      var card = make('div', { 'class': 'pp-zip-dlg-card' });
      var hd = make('div', { 'class': 'pp-zip-dlg-head' });
      hd.appendChild(make('h2', { id: t }, 'Enter your ZIP code'));
      var x = make('button', { type: 'button', 'class': 'pp-zip-dlg-close', 'aria-label': 'Close' }, '×');
      hd.appendChild(x);
      var p = make('p', { id: dsc, 'class': 'pp-zip-dlg-text' });
      var lb = make('label', { 'for': inId, 'class': 'pp-zip-dlg-label' }, 'ZIP Code *');
      dlgInput = make('input', { type: 'text', id: inId, 'class': 'pp-zip-dlg-input', inputmode: 'numeric', maxlength: '4', autocomplete: 'postal-code', placeholder: 'e.g. 1300', 'aria-describedby': dsc });
      dlgErr = make('p', { 'class': 'pp-zip-dlg-err', role: 'alert', hidden: '' }, ZIP_ERROR);
      var ok = make('button', { type: 'button', 'class': 'pp-zip-dlg-ok' }, 'Continue');
      [hd, p, lb, dlgInput, dlgErr, ok].forEach(function (n) { card.appendChild(n); });
      dlg.appendChild(card);
      document.body.appendChild(dlg);
      dlg._text = p;
      function confirm() {
        var v = (dlgInput.value || '').trim();
        if (!ZIP_RE.test(v)) {
          dlgErr.hidden = false;
          dlgInput.classList.add('is-bad');
          dlgInput.setAttribute('aria-invalid', 'true');
          dlgInput.focus();
          return;
        }
        dlgConfirmed = true;
        suggestion = '';
        applyZip({ kind: 'entered', value: v, readOnly: false, hint: '' });
        dlg.close();
      }
      ok.addEventListener('click', confirm);
      x.addEventListener('click', function () { dlg.close(); });
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });  // the backdrop
      dlgInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); confirm(); } });
      dlgInput.addEventListener('input', function () {
        var digits = dlgInput.value.replace(/\D/g, '').slice(0, 4);
        if (digits !== dlgInput.value) dlgInput.value = digits;
        dlgErr.hidden = true;
        dlgInput.classList.remove('is-bad');
        dlgInput.removeAttribute('aria-invalid');
      });
      dlg.addEventListener('close', function () {
        if (dlgConfirmed) { dlgConfirmed = false; return; }
        if (ZIP_RE.test(zipInput.value)) return;  // "Change" closed without a new ZIP: the one already entered stays
        // Closed without a ZIP: the address stays incomplete, with the same error; the field's button opens it again.
        applyZip({ kind: 'missing', value: '', readOnly: false, hint: ZIP_MISSING });
        showZipError();
      });
    }
    function openDialog(prefill, isSuggestion) {
      if (!useDlg || !zipInput) return;
      if (!dlg) buildDialog();
      if (dlg.open) return;
      dlg._text.textContent = isSuggestion ? ZIP_SUGGESTED : ZIP_MISSING;
      dlgInput.value = prefill || '';
      dlgErr.hidden = true;
      dlgInput.classList.remove('is-bad');
      dlgInput.removeAttribute('aria-invalid');
      dlg.showModal();
      dlgInput.focus();
      dlgInput.select();
    }
    if (zipBtn) zipBtn.addEventListener('click', function () { openDialog(zipInput.value || suggestion, !zipInput.value && !!suggestion); });

    // Shows the lookup's answer. auto: the buyer just picked the place, so a dialog opens now; otherwise (the page was just
    // drawn) the note and its button wait and the Save check opens the dialog.
    function settleZip(st, auto) {
      suggestion = '';
      if (!st.dialog || !useDlg) { applyZip(st); return; }
      suggestion = st.kind === 'suggested' ? st.value : '';
      applyZip({ kind: 'missing', value: '', readOnly: false, hint: ZIP_MISSING });
      if (auto) openDialog(suggestion, !!suggestion);
    }
    // keepTyped: true keeps the ZIP now in the box; a string keeps that ZIP (the one the server drew, on a re-render restore).
    function lookupZip(keepTyped, auto) {
      var typed = typeof keepTyped === 'string' ? keepTyped : (keepTyped && zipInput ? zipInput.value : '');
      if (!zipUrl || !M.complete()) { zipIdle(); return; }
      var seq = ++zipSeq;
      applyZip({ kind: 'pending', value: '', readOnly: true, hint: 'Finding your ZIP code…' });
      fetch(zipUrl + '?province=' + encodeURIComponent(M.prov.name) +
            '&city=' + encodeURIComponent(M.city.name) +
            '&barangay=' + encodeURIComponent(M.brgy.name), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (seq === zipSeq) settleZip(zipState(d, typed), auto); })
        .catch(function () { if (seq === zipSeq) settleZip(zipState({}, typed), auto); });
    }
    if (zipInput) {
      zipInput.addEventListener('input', function () {
        var digits = zipInput.value.replace(/\D/g, '').slice(0, 4);
        if (digits !== zipInput.value) zipInput.value = digits;
        zipClearError();
      });
    }

    /* ---- the picker's markup ---- */
    var holderClass = fallback.firstElementChild ? fallback.firstElementChild.className : 'fld';
    var firstLabel = fallback.querySelector('label');
    var labelClass = firstLabel ? firstLabel.className : '';
    var holder = make('div', { 'class': holderClass + ' pp-pick' });
    var label = make('label', { id: uid + '-lbl', 'for': uid + '-btn' }, FIELD_LABEL + ' *');
    if (labelClass) label.className = labelClass;
    var box = make('div', { 'class': 'pp-pick-box' });
    var btn = make('button', { type: 'button', id: uid + '-btn', 'class': 'pp-pick-btn', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': uid + '-panel', 'aria-labelledby': uid + '-lbl ' + uid + '-txt' });
    var txt = make('span', { id: uid + '-txt', 'class': 'pp-pick-text' });
    var caret = make('span', { 'class': 'pp-pick-caret', 'aria-hidden': 'true' });
    btn.appendChild(txt); btn.appendChild(caret);
    var clear = make('button', { type: 'button', 'class': 'pp-pick-clear', 'aria-label': 'Clear the selected address area', hidden: '' }, '×');
    var backdrop = make('div', { 'class': 'pp-pick-backdrop', hidden: '' });
    var panel = make('div', { id: uid + '-panel', 'class': 'pp-pick-panel', role: 'dialog', 'aria-label': 'Choose province, city and barangay', hidden: '' });
    var head = make('div', { 'class': 'pp-pick-head' });
    var tabs = make('div', { 'class': 'pp-pick-tabs', role: 'tablist', 'aria-label': 'Address level' });
    var tabEls = {};
    LEVELS.forEach(function (lv) {
      var t = make('button', { type: 'button', id: uid + '-tab-' + lv, 'class': 'pp-pick-tab', role: 'tab', 'aria-controls': uid + '-list', 'aria-selected': 'false', tabindex: '-1' }, LEVEL_LABEL[lv]);
      t.setAttribute('data-level', lv);
      tabs.appendChild(t); tabEls[lv] = t;
    });
    var closeBtn = make('button', { type: 'button', 'class': 'pp-pick-close', 'aria-label': 'Close' }, '×');
    head.appendChild(tabs); head.appendChild(closeBtn);
    var searchWrap = make('div', { 'class': 'pp-pick-search-wrap' });
    var search = make('input', { type: 'search', 'class': 'pp-pick-search', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': uid + '-list', 'aria-autocomplete': 'list', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Search' });
    search.setAttribute('aria-label', 'Search this list');
    searchWrap.appendChild(search);
    var list = make('ul', { id: uid + '-list', 'class': 'pp-pick-list', role: 'listbox', tabindex: '-1' });
    var empty = make('p', { 'class': 'pp-pick-empty', role: 'status', hidden: '' });
    panel.appendChild(head); panel.appendChild(searchWrap); panel.appendChild(list); panel.appendChild(empty);
    box.appendChild(btn); box.appendChild(clear); box.appendChild(backdrop); box.appendChild(panel);
    holder.appendChild(label); holder.appendChild(box);
    mount.appendChild(holder);
    fallback.hidden = true;
    var hasServerErrors = !!(errBox && errBox.children.length);
    if (hasServerErrors) { box.classList.add('is-invalid'); btn.setAttribute('aria-invalid', 'true'); btn.setAttribute('aria-describedby', errBox.children[0].id || ''); }

    function setReady(on) {
      S.ready = on;
      btn.disabled = !on;
      if (!on) { txt.textContent = 'Loading…'; txt.className = 'pp-pick-text is-empty'; }
    }

    /* ---- state, inputs, field text ---- */
    function syncInputs() {
      var v = M.values();
      provIn.value = v.province;
      cityIn.value = v.city;
      brgyIn.value = v.barangay;
      if (brgyCode) brgyCode.value = v.barangay_code;
      var path = M.path();
      txt.textContent = path || 'Select province, city, barangay';
      txt.className = 'pp-pick-text' + (path ? '' : ' is-empty');
      btn.title = path;
      clear.hidden = !(M.region || M.prov);
      box.classList.toggle('has-clear', !clear.hidden);
    }
    function clearErrors() {
      if (errBox) errBox.innerHTML = '';
      box.classList.remove('is-invalid');
      btn.removeAttribute('aria-invalid');
      btn.removeAttribute('aria-describedby');
    }
    function showPickError(msg) {
      if (!errBox) return;
      errBox.innerHTML = '';
      var p = make('p', { 'class': 'err sf-field-error pp-pick-msg', id: uid + '-err', role: 'alert' }, msg);
      errBox.appendChild(p);
      box.classList.add('is-invalid');
      btn.setAttribute('aria-invalid', 'true');
      btn.setAttribute('aria-describedby', uid + '-err');
    }

    /* ---- the panel ---- */
    function display(level, it) { return level === 'region' ? it.name : titleCase(it.name); }
    function focusTarget() { return search.hidden || searchWrap.hidden ? list : search; }
    function setActive(i, scroll) {
      var opts = list.children;
      if (!opts.length) { S.active = 0; focusTarget().removeAttribute('aria-activedescendant'); return; }
      S.active = Math.max(0, Math.min(opts.length - 1, i));
      for (var k = 0; k < opts.length; k++) opts[k].classList.toggle('is-active', k === S.active);
      focusTarget().setAttribute('aria-activedescendant', opts[S.active].id);
      if (scroll && opts[S.active].scrollIntoView) opts[S.active].scrollIntoView({ block: 'nearest' });
    }
    function renderList(keepQuery) {
      var level = S.tab;
      var all = M.items(level);
      S.view = filterItems(all, keepQuery ? S.query : '');
      if (!keepQuery) { S.query = ''; search.value = ''; }
      searchWrap.hidden = level === 'region';
      search.placeholder = 'Search ' + LEVEL_LABEL[level].toLowerCase();
      search.setAttribute('aria-label', 'Search ' + LEVEL_LABEL[level].toLowerCase());
      list.setAttribute('aria-labelledby', uid + '-tab-' + level);
      list.innerHTML = '';
      var chosenAt = 0;
      S.view.forEach(function (it, i) {
        var li = make('li', { id: uid + '-o' + i, 'class': 'pp-pick-opt', role: 'option', 'aria-selected': M.isChosen(level, it) ? 'true' : 'false' }, display(level, it));
        li.setAttribute('data-i', String(i));
        if (M.isChosen(level, it)) { li.classList.add('is-chosen'); chosenAt = i; }
        list.appendChild(li);
      });
      empty.hidden = S.view.length > 0;
      empty.textContent = S.view.length ? '' : (S.query ? 'No ' + LEVEL_LABEL[level].toLowerCase() + ' matches “' + S.query.trim() + '”.' : 'Nothing to choose here.');
      setActive(keepQuery && S.query.trim() ? 0 : chosenAt, true);
    }
    function renderTabs() {
      LEVELS.forEach(function (lv) {
        var t = tabEls[lv], on = lv === S.tab, ok = M.reachable(lv);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('tabindex', on ? '0' : '-1');
        if (ok) t.removeAttribute('aria-disabled'); else t.setAttribute('aria-disabled', 'true');
        t.classList.toggle('is-current', on);
        t.classList.toggle('is-done', ok && lv !== S.tab && M.done(lv));
      });
    }
    function go(level, focusList) {
      S.tab = level;
      renderTabs();
      renderList(false);
      if (focusList) focusTarget().focus();
    }
    function openPanel() {
      if (!S.ready || S.open) return;
      S.open = true;
      panel.hidden = false;
      backdrop.hidden = false;
      box.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      go(M.nextTab(), true);
    }
    function closePanel(returnFocus) {
      if (!S.open) return;
      S.open = false;
      panel.hidden = true;
      backdrop.hidden = true;
      box.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      if (returnFocus) btn.focus();
    }
    function choose(level, it) {
      clearErrors();
      var r = M.pick(level, it);
      if (r.reset) zipIdle();
      syncInputs();
      if (r.next) { go(r.next, true); return; }
      closePanel(true);
      lookupZip(false, true);
    }
    function clearAll() {
      M.clear();
      S.tab = 'region';
      syncInputs();
      zipIdle();
      clearErrors();
      if (S.open) go('region', false);
    }

    /* ---- events ---- */
    btn.addEventListener('click', function () { if (S.open) closePanel(true); else openPanel(); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openPanel(); }
    });
    clear.addEventListener('click', function () { clearAll(); btn.focus(); });
    closeBtn.addEventListener('click', function () { closePanel(true); });
    backdrop.addEventListener('click', function () { closePanel(true); });
    tabs.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('.pp-pick-tab') : null;
      if (!t) return;
      var lv = t.getAttribute('data-level');
      if (M.reachable(lv)) go(lv, true);
    });
    tabs.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var avail = LEVELS.filter(M.reachable);
      var i = avail.indexOf(S.tab) + (e.key === 'ArrowRight' ? 1 : -1);
      if (i < 0 || i >= avail.length) return;
      e.preventDefault();
      go(avail[i], false);
      tabEls[avail[i]].focus();
    });
    list.addEventListener('click', function (e) {
      var li = e.target.closest ? e.target.closest('.pp-pick-opt') : null;
      if (!li) return;
      var it = S.view[Number(li.getAttribute('data-i'))];
      if (it) choose(S.tab, it);
    });
    list.addEventListener('mousemove', function (e) {
      var li = e.target.closest ? e.target.closest('.pp-pick-opt') : null;
      if (li && Number(li.getAttribute('data-i')) !== S.active) setActive(Number(li.getAttribute('data-i')), false);
    });
    search.addEventListener('input', function () { S.query = search.value; renderList(true); });
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePanel(true); return; }
      var inTabs = e.target && e.target.classList && e.target.classList.contains('pp-pick-tab');
      if (inTabs || e.target === closeBtn) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(S.active + 1, true); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(S.active - 1, true); }
      else if (e.key === 'Home' && e.target === list) { e.preventDefault(); setActive(0, true); }
      else if (e.key === 'End' && e.target === list) { e.preventDefault(); setActive(S.view.length - 1, true); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (S.view[S.active]) choose(S.tab, S.view[S.active]);
      }
    });
    document.addEventListener('mousedown', function (e) { if (S.open && !box.contains(e.target)) closePanel(false); });
    document.addEventListener('focusin', function (e) { if (S.open && !box.contains(e.target)) closePanel(false); });

    /* ---- the Save check (the ZIP rule is the shop popup's, and the server still checks every field) ---- */
    var form = root.closest('form');
    if (form) {
      form.addEventListener('submit', function (e) {
        if (!S.ready) return;
        if (!M.complete()) {
          e.preventDefault();
          showPickError(PICK_ERROR);
          btn.focus();
          if (btn.scrollIntoView) btn.scrollIntoView({ block: 'center' });
          return;
        }
        if (!zipInput || ZIP_RE.test((zipInput.value || '').trim())) return;
        e.preventDefault();
        var kind = zipField ? zipField.getAttribute('data-zip-state') : '';
        if (kind !== 'missing' && kind !== 'suggested') return;  // the ZIP is still being looked up; try again in a moment
        if (useDlg) { openDialog(suggestion, !!suggestion); return; }
        showZipError();
        if (!zipInput.readOnly) zipInput.focus();
        if (zipInput.scrollIntoView) zipInput.scrollIntoView({ block: 'center' });
      });
    }

    /* ---- the data, then put back what the server rendered ---- */
    var typedZip = zipInput ? zipInput.value : '';
    var saved = { province: provIn.value, city: cityIn.value, barangay: brgyIn.value };
    syncInputs();  // empties the three inputs until the data answers; `saved` holds what the server drew
    setReady(false);
    if (zipInput) applyZip(IDLE);
    Promise.all(phUrls.map(function (u) { return fetch(u).then(function (r) { return r.json(); }); })).then(function (res) {
      M = createModel(res[0], res[1], res[2]);
      M.restore(saved);
      syncInputs();
      setReady(true);
      syncInputs();
      if (M.brgy) lookupZip(typedZip, false);
      else applyZip(IDLE);
    }).catch(function () {
      // The data did not load: the text inputs come back, as the page drew them, and the server validates.
      provIn.value = saved.province; cityIn.value = saved.city; brgyIn.value = saved.barangay;
      holder.remove();
      fallback.hidden = false;
      S.ready = false;
      if (zipInput) { zipInput.readOnly = false; zipInput.value = typedZip; if (zipField) zipField.removeAttribute('data-zip-state'); }
      if (zipHint) zipHint.textContent = '';
    });
  }

  document.querySelectorAll('[data-pp-address]').forEach(init);
})();
