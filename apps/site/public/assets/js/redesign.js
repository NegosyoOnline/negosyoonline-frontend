(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');

  var revealSel = '[data-reveal], [data-reveal-stagger], .rd-pile, .rd-tile';
  var targets = Array.prototype.slice.call(document.querySelectorAll(revealSel));
  var steps = Array.prototype.slice.call(document.querySelectorAll('.rd-step'));
  var stage = document.querySelector('.rd-stage');

  function showAll() {
    targets.forEach(function (el) { el.classList.add('is-in'); });
  }

  function activate(step) {
    steps.forEach(function (s) { s.classList.toggle('is-active', s === step); });
    if (stage) stage.setAttribute('data-active', step.getAttribute('data-step'));
  }

  if (steps.length) activate(steps[0]);

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    showAll();
    if (steps.length && !('IntersectionObserver' in window)) {
      steps.forEach(function (s) { s.classList.add('is-active'); });
    }
    return;
  }

  var revealObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        revealObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
  targets.forEach(function (el) { revealObs.observe(el); });

  if (steps.length) {
    var stepObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) activate(entry.target);
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(function (s) { stepObs.observe(s); });
  }
})();

(function () {
  'use strict';
  var root = document.querySelector('[data-reel]');
  if (!root) return;
  var stage = root.querySelector('[data-reel-stage]');
  var items = Array.prototype.slice.call(root.querySelectorAll('.rd-reel-item'));
  var cap = root.querySelector('[data-reel-caption]');
  var count = root.querySelector('[data-reel-count]');
  var n = items.length;
  var cur = 0;

  function render() {
    items.forEach(function (el, i) {
      var d = (((i - cur) % n) + n) % n;
      if (d > n / 2) d -= n;
      var far = Math.abs(d) > 2;
      el.setAttribute('data-pos', far ? 'far' : String(d));
      el.setAttribute('aria-hidden', d === 0 ? 'false' : 'true');
    });
    cap.textContent = items[cur].getAttribute('data-name');
    count.textContent = String(cur + 1);
  }
  function go(step) { cur = (((cur + step) % n) + n) % n; render(); }

  root.querySelector('[data-reel-prev]').addEventListener('click', function () { go(-1); });
  root.querySelector('[data-reel-next]').addEventListener('click', function () { go(1); });
  items.forEach(function (el, i) {
    el.addEventListener('click', function () {
      var d = (((i - cur) % n) + n) % n;
      if (d > n / 2) d -= n;
      if (d !== 0 && Math.abs(d) <= 2) go(d);
    });
  });
  stage.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  });
  var startX = null;
  stage.addEventListener('pointerdown', function (e) { startX = e.clientX; });
  stage.addEventListener('pointerup', function (e) {
    if (startX === null) return;
    var dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  });
  stage.addEventListener('pointercancel', function () { startX = null; });

  // auto-advance: runs while the reel is on screen; stops for good once the visitor uses it
  var AUTO = 4000, autoTimer = null, onScreen = false, userTook = false, over = false;
  var reduceReel = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function autoTick() { autoTimer = null; go(1); autoUpdate(); }
  function autoUpdate() {
    var should = !userTook && !reduceReel && onScreen && !document.hidden && !over;
    if (should && !autoTimer) autoTimer = setTimeout(autoTick, AUTO);
    else if (!should && autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  }
  ['pointerdown', 'keydown', 'click'].forEach(function (ev) {
    root.addEventListener(ev, function (e) { if (ev === 'click' && !e.isTrusted) return; userTook = true; autoUpdate(); });
  });
  root.addEventListener('mouseenter', function () { over = true; autoUpdate(); });
  root.addEventListener('mouseleave', function () { over = false; autoUpdate(); });
  document.addEventListener('visibilitychange', autoUpdate);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; autoUpdate(); }, { threshold: 0.35 }).observe(root);
  }
  render();
})();

(function () {
  'use strict';
  var root = document.querySelector('[data-dash]');
  if (!root) return;
  var tabs = Array.prototype.slice.call(root.querySelectorAll('.rd-dtab'));
  var panels = Array.prototype.slice.call(root.querySelectorAll('.rd-dpanel'));
  function select(i, focus) {
    tabs.forEach(function (t, j) {
      var on = j === i;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      panels[j].classList.toggle('is-active', on);
      if (on) panels[j].removeAttribute('hidden'); else panels[j].setAttribute('hidden', '');
    });
    if (focus) tabs[i].focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { userStopped = true; select(i, false); update(); });
    t.addEventListener('keydown', function (e) {
      var k = e.key, n = tabs.length;
      userStopped = true; update();
      if (k === 'ArrowDown' || k === 'ArrowRight') { e.preventDefault(); select((i + 1) % n, true); }
      else if (k === 'ArrowUp' || k === 'ArrowLeft') { e.preventDefault(); select((i - 1 + n) % n, true); }
      else if (k === 'Home') { e.preventDefault(); select(0, true); }
      else if (k === 'End') { e.preventDefault(); select(n - 1, true); }
    });
  });

  var DUR = 5000, timer = null, cur = 0, userStopped = false, visible = false, hovered = false, focused = false;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var origSelect = select;
  select = function (i, focus) { cur = i; origSelect(i, focus); if (timer) { restart(); } };
  function restart() {
    root.classList.remove('is-playing');
    void root.offsetWidth;
    root.classList.add('is-playing');
    clearTimeout(timer);
    timer = setTimeout(function () { select((cur + 1) % tabs.length, false); }, DUR);
  }
  function update() {
    var should = !userStopped && !reduce && visible && !document.hidden && !hovered && !focused;
    if (should && !timer) { restart(); }
    else if (!should && timer) { clearTimeout(timer); timer = null; root.classList.remove('is-playing'); }
  }
  root.addEventListener('mouseenter', function () { hovered = true; update(); });
  root.addEventListener('mouseleave', function () { hovered = false; update(); });
  root.addEventListener('focusin', function () { focused = true; update(); });
  root.addEventListener('focusout', function () { focused = false; update(); });
  document.addEventListener('visibilitychange', update);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; update(); }, { threshold: 0.35 }).observe(root);
  }
})();

(function () {
  'use strict';
  var root = document.querySelector('[data-flow]');
  if (!root) return;
  var tabs = Array.prototype.slice.call(root.querySelectorAll('.rd-hstep'));
  var panels = Array.prototype.slice.call(root.querySelectorAll('.rd-hpanel'));
  var DUR = 6000, timer = null, cur = 0, userStopped = false, visible = false, hovered = false, focused = false;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function show(i, focus) {
    cur = i;
    tabs.forEach(function (t, j) {
      var on = j === i;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      panels[j].classList.toggle('is-active', on);
      if (on) panels[j].removeAttribute('hidden'); else panels[j].setAttribute('hidden', '');
    });
    if (focus) tabs[i].focus();
    if (timer) restart();
  }
  function restart() {
    root.classList.remove('is-playing');
    void root.offsetWidth;
    root.classList.add('is-playing');
    clearTimeout(timer);
    timer = setTimeout(function () { show((cur + 1) % tabs.length, false); }, DUR);
  }
  function update() {
    var should = !userStopped && !reduce && visible && !document.hidden && !hovered && !focused;
    if (should && !timer) { restart(); }
    else if (!should && timer) { clearTimeout(timer); timer = null; root.classList.remove('is-playing'); }
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { userStopped = true; show(i, false); update(); });
    t.addEventListener('keydown', function (e) {
      var k = e.key, n = tabs.length;
      if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].indexOf(k) < 0) return;
      e.preventDefault();
      userStopped = true;
      if (k === 'ArrowDown' || k === 'ArrowRight') show((i + 1) % n, true);
      else if (k === 'ArrowUp' || k === 'ArrowLeft') show((i - 1 + n) % n, true);
      else if (k === 'Home') show(0, true);
      else show(n - 1, true);
      update();
    });
  });
  root.addEventListener('mouseenter', function () { hovered = true; update(); });
  root.addEventListener('mouseleave', function () { hovered = false; update(); });
  root.addEventListener('focusin', function () { focused = true; update(); });
  root.addEventListener('focusout', function () { focused = false; update(); });
  document.addEventListener('visibilitychange', update);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; update(); }, { threshold: 0.4 }).observe(root);
  }
})();

// comparison tables: a tappable "Swipe to compare" bar under each scroller that jumps to the far end (and back)
(function () {
  'use strict';
  var scrollers = Array.prototype.slice.call(document.querySelectorAll('.rd-cmp-scroll'));
  scrollers.forEach(function (sc) {
    var wrap = document.createElement('div');
    wrap.className = 'rd-cmp-wrap';
    sc.parentNode.insertBefore(wrap, sc);
    wrap.appendChild(sc);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rd-swipe';
    btn.setAttribute('aria-label', 'Scroll the comparison table sideways');
    wrap.appendChild(btn);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function atEnd() { return sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 4; }
    function sync() {
      var end = atEnd();
      btn.textContent = end ? '← Back to start' : 'Swipe to compare →';
      btn.classList.toggle('is-end', end);
      btn.style.display = sc.scrollWidth <= sc.clientWidth + 1 ? 'none' : '';
    }
    btn.addEventListener('click', function () {
      sc.scrollTo({ left: atEnd() ? 0 : sc.scrollWidth, behavior: reduce ? 'auto' : 'smooth' });
    });
    sc.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  });
})();

/* Pricing card: Monthly / Annual toggle, switched by NO_CONFIG.ANNUAL_PLAN_ENABLED (assets/js/config.js). While it is
   false nothing annual is shown: the toggle, the annual price and the savings line stay hidden in the markup, and this
   block does nothing. */
(function () {
  if ((window.NO_CONFIG || {}).ANNUAL_PLAN_ENABLED !== true) return;
  var group = document.querySelector('[data-pcycle]');
  if (!group) return;
  var btns = Array.prototype.slice.call(group.querySelectorAll('[data-cycle]'));
  var prices = Array.prototype.slice.call(document.querySelectorAll('[data-price]'));
  function choose(cycle) {
    btns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cycle') === cycle ? 'true' : 'false'); });
    prices.forEach(function (p) { p.hidden = p.getAttribute('data-price') !== cycle; });
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { choose(b.getAttribute('data-cycle')); }); });
  var heading = document.querySelector('[data-pheading]');
  if (heading) heading.innerHTML = 'One simple price for your<br>all-in-one system.';
  var word = document.querySelector('[data-sub-word]');
  if (word) word.textContent = 'One clear subscription, monthly or annual';
  Array.prototype.forEach.call(document.querySelectorAll('[data-psave], [data-annual-only]'), function (el) { el.hidden = false; });
  choose('monthly');
  group.hidden = false;
})();
