/* Santé shop: the basket slide-in and the product-page quantity stepper. The drawer behaviour is the merchant storefront.js cart
   drawer (open on Add to Cart and on the nav Basket link, close on the back arrow / overlay / Escape, Clear Basket), over the SERVER
   cart: every change is a form post to /cart/ and the drawer is replaced by the one in the answer. No prices are computed here.
   Without script the same forms post and land on the /cart/ page (the merchant's no-script fallback). */
(function () {
  var drawer = document.getElementById('sfDrawer');
  var overlay = document.getElementById('sfDrawerOverlay');

  function open() {
    if (!drawer) return;
    overlay.hidden = false;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sf-noscroll');
  }
  function close() {
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    document.body.classList.remove('sf-noscroll');
  }
  function swapFrom(html) {
    var next = new DOMParser().parseFromString(html, 'text/html').getElementById('sfDrawer');
    if (!next) return false;
    drawer.innerHTML = next.innerHTML;
    var badge = document.querySelector('[data-cart-count]'), label = next.querySelector('[data-sf-drawer-count]');
    if (badge && label) {  // the nav bubble follows the server's count, as the merchant bubble follows its cart
      var n = parseInt(label.textContent, 10) || 0;
      badge.textContent = n;
      badge.hidden = n === 0;
    }
    return true;
  }
  function send(form, submitter) {
    var body = submitter ? new FormData(form, submitter) : new FormData(form);
    // getAttribute: the forms carry a field named "action", which shadows form.action
    return fetch(form.getAttribute('action'), { method: 'POST', body: body, credentials: 'same-origin' }).then(function (r) { return r.text(); });
  }

  if (drawer) {
    document.getElementById('sfDrawerOverlay').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest('#sfDrawerClose')) close();
      var opener = e.target.closest('[data-sf-open-drawer]');
      if (opener) { e.preventDefault(); open(); }
    });
    // Clear Basket: remove every line, then show the server's basket.
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#sfDrawerClear')) return;
      var forms = Array.prototype.slice.call(drawer.querySelectorAll('form[data-sf-drawer-form]')).filter(function (f) {
        return f.querySelector('[name=action]').value === 'remove';
      });
      forms.reduce(function (p, f) { return p.then(function () { return send(f); }); }, Promise.resolve())
        .then(function () { return fetch('/cart/', { credentials: 'same-origin' }).then(function (r) { return r.text(); }); })
        .then(swapFrom);
    });
    // Add to Cart (cards and product page) and the drawer's own stepper / remove forms.
    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form.matches || !form.matches('form[action="/cart/"]')) return;
      e.preventDefault();
      var inDrawer = !!form.closest('#sfDrawer');
      send(form, e.submitter).then(function (html) {
        if (!swapFrom(html)) { form.submit(); return; }
        if (!inDrawer) open();
      }).catch(function () { form.submit(); });
    });
  }

  // Gallery thumbnails: a click puts that photo in the main image (the merchant storefront.js thumb swap).
  var main = document.getElementById('sfGalleryMain');
  var thumbs = document.querySelectorAll('[data-sf-thumb]');
  Array.prototype.forEach.call(thumbs, function (t) {
    t.addEventListener('click', function () {
      if (main) main.src = t.src;
      Array.prototype.forEach.call(thumbs, function (x) { x.classList.remove('active'); });
      t.classList.add('active');
    });
  });

  var input = document.getElementById('sfQty');
  if (!input) return;
  function qty() { var q = parseInt(input.value, 10); if (isNaN(q) || q < 1) q = 1; return Math.min(99, q); }
  var minus = document.querySelector('[data-sf-qty-minus]'), plus = document.querySelector('[data-sf-qty-plus]');
  if (minus) minus.addEventListener('click', function () { input.value = Math.max(1, qty() - 1); });
  if (plus) plus.addEventListener('click', function () { input.value = Math.min(99, qty() + 1); });
})();
