/* Santé store home behavior: copied from the sante_barley storefront main.js. The inline onclick calls became data attributes handled at the end of this file.
   Sales-popup JS intentionally absent (D9: fabricated data removed). */

/* ── Hero carousel + FAQ toggle ── */
  /* ==============================
     HERO CAROUSEL LOGIC
  ============================== */
  (function() {
    var track = document.getElementById('carouselTrack');
    if (!track) return;   // homepage-only element; main.js loads on every storefront page
    var slides  = track.querySelectorAll('.carousel-slide');
    var dots    = document.querySelectorAll('.carousel-dot');
    var btnPrev = document.getElementById('carouselPrev');
    var btnNext = document.getElementById('carouselNext');
    var total   = slides.length;
    var current = 0;
    var timer;

    function goTo(index) {
      // Wrap around
      index = (index + total) % total;
      // Remove active class from old slide
      slides[current].classList.remove('is-active');
      dots[current].classList.remove('active');
      // Move track
      current = index;
      track.style.transform = 'translateX(-' + (100 / total * current) + '%)';
      // Add active class to new slide
      slides[current].classList.add('is-active');
      dots[current].classList.add('active');
    }

    function startAuto() {
      clearInterval(timer);
      timer = setInterval(function() { goTo(current + 1); }, 5000);
    }

    btnNext.addEventListener('click', function() { goTo(current + 1); startAuto(); });
    btnPrev.addEventListener('click', function() { goTo(current - 1); startAuto(); });

    dots.forEach(function(dot) {
      dot.addEventListener('click', function() {
        goTo(parseInt(this.dataset.index));
        startAuto();
      });
    });

    // Swipe support for mobile
    var touchStartX = 0;
    track.addEventListener('touchstart', function(e) { touchStartX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', function(e) {
      var diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) { goTo(diff > 0 ? current + 1 : current - 1); startAuto(); }
    }, { passive: true });

    // Pause on hover
    document.getElementById('heroCarousel').addEventListener('mouseenter', function() { clearInterval(timer); });
    document.getElementById('heroCarousel').addEventListener('mouseleave', startAuto);

    // Start
    startAuto();
  })();

  function toggleFaq(questionEl) {
    var item = questionEl.parentElement;
    var isOpen = item.classList.contains('open');

    // Close all open items
    document.querySelectorAll('.faq-item.open').forEach(function(openItem) {
      openItem.classList.remove('open');
    });

    // If the clicked item was not open, open it
    if (!isOpen) {
      item.classList.add('open');
    }
  }

/* ── About tabs auto-advance ── */
  const aboutTabs = ['tab-our-story', 'tab-trusted', 'tab-biogro', 'tab-global'];
  let aboutCurrent = 0;
  let aboutTimer = null;

  function switchAboutTab(btn, panelId) {
    document.querySelectorAll('.about-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.about-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(panelId).classList.add('active');
    aboutCurrent = aboutTabs.indexOf(panelId);
    resetAboutTimer();
  }

  function autoAdvanceAbout() {
    aboutCurrent = (aboutCurrent + 1) % aboutTabs.length;
    const panelId = aboutTabs[aboutCurrent];
    const btn = document.querySelector('.about-tab[data-about-panel="' + panelId + '"]');
    document.querySelectorAll('.about-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.about-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(panelId).classList.add('active');
  }

  function resetAboutTimer() {
    clearInterval(aboutTimer);
    aboutTimer = setInterval(autoAdvanceAbout, 4000);
  }

  // Start auto-play on page load — homepage-only section; main.js loads on
  // every storefront page, and an unguarded interval would throw every
  // 4s on pages without .about-tab/.about-panel elements.
  document.addEventListener('DOMContentLoaded', function () {
    if (!document.querySelector('.about-tab')) return;
    aboutTimer = setInterval(autoAdvanceAbout, 4000);

  });

/* ── Testimonials mobile carousel ── */
  // ── Testimonial mobile swipe carousel ──
  (function () {
    function initTestimonialCarousel() {
      var grid = document.querySelector('.testimonials-grid');
      var dots = document.querySelectorAll('.testimonial-mobile-dots span');
      if (!grid || !dots.length) return;

      var cards   = grid.querySelectorAll('.tcard');
      var total   = cards.length;
      var current = 0;
      var timer   = null;

      // Update dots
      function setDot(idx) {
        current = ((idx % total) + total) % total;
        dots.forEach(function (d, i) {
          d.classList.toggle('active', i === current);
        });
      }

      // Scroll to card[idx] centred in the viewport
      function goTo(idx) {
        var target = ((idx % total) + total) % total;
        var card   = cards[target];
        if (!card) return;
        grid.scrollTo({
          left: card.offsetLeft - (grid.offsetWidth - card.offsetWidth) / 2,
          behavior: 'smooth'
        });
        setDot(target);
      }

      // Auto-advance every 4 seconds
      function startAuto() {
        clearInterval(timer);
        timer = setInterval(function () { goTo(current + 1); }, 4000);
      }

      // After manual scroll, find which card is centred and update dots
      var scrollEnd;
      grid.addEventListener('scroll', function () {
        clearTimeout(scrollEnd);
        scrollEnd = setTimeout(function () {
          var centre = grid.scrollLeft + grid.offsetWidth / 2;
          var closest = 0;
          var minDist = Infinity;
          cards.forEach(function (card, i) {
            var dist = Math.abs((card.offsetLeft + card.offsetWidth / 2) - centre);
            if (dist < minDist) { minDist = dist; closest = i; }
          });
          setDot(closest);
          startAuto(); // reset timer after manual swipe
        }, 150);
      }, { passive: true });

      // Kick off
      setDot(0);
      startAuto();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initTestimonialCarousel);
    } else {
      initTestimonialCarousel();
    }
  })();

/* ── Lookbook mobile carousel ── */
  // ── Blog / Wellness Lifestyle mobile carousel ──
  (function () {
    function initBlogCarousel() {
      var grid = document.querySelector('.lookbook-grid');
      var dots = document.querySelectorAll('.blog-mobile-dots span');
      if (!grid || !dots.length) return;

      var cards   = grid.querySelectorAll('.lookbook-card');
      var total   = cards.length;
      var current = 0;
      var timer   = null;

      function setDot(idx) {
        current = ((idx % total) + total) % total;
        dots.forEach(function (d, i) {
          d.classList.toggle('active', i === current);
        });
      }

      function goTo(idx) {
        var target = ((idx % total) + total) % total;
        var card   = cards[target];
        if (!card) return;
        grid.scrollTo({
          left: card.offsetLeft - (grid.offsetWidth - card.offsetWidth) / 2,
          behavior: 'smooth'
        });
        setDot(target);
      }

      function startAuto() {
        clearInterval(timer);
        timer = setInterval(function () { goTo(current + 1); }, 4000);
      }

      var scrollEnd;
      grid.addEventListener('scroll', function () {
        clearTimeout(scrollEnd);
        scrollEnd = setTimeout(function () {
          var centre = grid.scrollLeft + grid.offsetWidth / 2;
          var closest = 0, minDist = Infinity;
          cards.forEach(function (card, i) {
            var dist = Math.abs((card.offsetLeft + card.offsetWidth / 2) - centre);
            if (dist < minDist) { minDist = dist; closest = i; }
          });
          setDot(closest);
          startAuto();
        }, 150);
      }, { passive: true });

      setDot(0);
      startAuto();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initBlogCarousel);
    } else {
      initBlogCarousel();
    }
  })();

  /* ==============================
     HAMBURGER MENU (1024px and below)
     Toggles .is-open on the navbar; closes on a menu link, Escape, an
     outside tap, or a resize back to desktop width.
  ============================== */
  (function() {
    var toggle = document.querySelector('[data-sf-nav-toggle]');
    if (!toggle) return;
    var navbar = toggle.closest('.navbar');

    function setOpen(open) {
      navbar.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    toggle.addEventListener('click', function(e) {
      e.stopPropagation();
      setOpen(!navbar.classList.contains('is-open'));
    });
    navbar.querySelectorAll('.nav-links a').forEach(function(a) {
      a.addEventListener('click', function() { setOpen(false); });
    });
    document.addEventListener('click', function(e) {
      if (navbar.classList.contains('is-open') && !navbar.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && navbar.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    window.addEventListener('resize', function() {
      if (window.innerWidth > 1024 && navbar.classList.contains('is-open')) setOpen(false);
    });
  })();

/* Inline onclick handlers replaced by data attributes (no inline script on this page). */
document.addEventListener('click', function (e) {
  var q = e.target.closest('[data-faq-toggle]');
  if (q) { toggleFaq(q); return; }
  var t = e.target.closest('[data-about-panel]');
  if (t) { switchAboutTab(t, t.getAttribute('data-about-panel')); }
});

/* Basket slide-in: the same code as pack-basket.js (the signed-out member shell loads that file); the home page carries one script only. */
(function () {
  var panel = document.getElementById('pkBasket');
  if (!panel) return;
  var overlay = document.querySelector('.pk-basket-overlay');
  var opener = null;

  function open(from) {
    opener = from;
    overlay.hidden = false;
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pk-basket-lock');
    requestAnimationFrame(function () { panel.classList.add('is-open'); });
    var back = panel.querySelector('.pk-basket-back');
    if (back) back.focus();
  }

  function close() {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pk-basket-lock');
    overlay.hidden = true;
    window.setTimeout(function () { panel.hidden = true; }, 280);
    if (opener) opener.focus();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-pk-basket]');
    if (t) { e.preventDefault(); open(t); return; }
    if (e.target.closest('[data-pk-basket-close]')) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) close();
  });
})();
