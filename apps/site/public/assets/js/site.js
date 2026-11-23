/* Shared header, footer, mobile menu, FAQ accordion, asset slots. No dependencies. */
(function () {
  var cfg = window.NO_CONFIG || {};
  var ANNUAL_PLAN_ENABLED = cfg.ANNUAL_PLAN_ENABLED === true;
  var onHome = location.pathname === "/" || /\/index\.html$/.test(location.pathname);
  var base = onHome ? "" : "/";

  /* Header logo: the approved reversed wordmark from Vercel Blob; text wordmark if it is not configured. */
  var logoUrl = (cfg.assets || {}).logoReversed;
  var logoMarkup = logoUrl
    ? '<img src="' + logoUrl + '" alt="NegosyoOnline" width="1728" height="379" decoding="async" fetchpriority="high">'
    : 'Negosyo<span>Online</span>';

  var header =
    '<a class="skip" href="#main">Skip to content</a>' +
    '<div class="wrap">' +
    '<a class="logo" href="/" aria-label="NegosyoOnline home">' + logoMarkup + '</a>' +
    '<button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>' +
    '<nav class="nav" id="site-nav" aria-label="Main">' +
    '<a href="' + base + '#solution">Shop</a>' +
    '<a href="' + base + '#pricing">Pricing</a>' +
    '<a href="' + base + '#about">About</a>' +
    '<a href="' + base + '#faqs">FAQs</a>' +
    '<a href="/contact">Contact Us</a>' +
    '<a href="/?signin=1">Login</a>' +
    '<a class="btn btn-primary" href="/?signup=1">Start Free Trial</a>' +
    "</nav></div>";

  var footer =
    '<div class="wrap"><div class="footer-grid">' +
    '<div><a class="logo" href="/" aria-label="NegosyoOnline home">' + logoMarkup + '</a>' +
    "<p>Built for Philippine business owners. Run your store, products, and orders from one dashboard, with hosting and security included, for one clear " + (ANNUAL_PLAN_ENABLED ? "price" : "monthly price") + ".</p><p class='footer-tagline'>The All-in-One System for Selling Online.</p></div>" +
    '<div><h3>Company</h3><ul><li><a href="/#about">About NegosyoOnline</a></li><li><a href="/contact">Contact Us</a></li></ul>' +
    '<ul class="footer-contact"><li><a href="mailto:support@negosyoonline.com"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg><span>support@negosyoonline.com</span></a></li><li><a href="tel:+639173098619"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/></svg><span>+63 917 309 8619</span></a></li><li><a href="https://www.facebook.com/negosyoonlineofficial" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8h3V4h-3a4 4 0 00-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8a1 1 0 011-1z"/></svg><span>facebook.com/negosyoonlineofficial</span></a></li></ul></div>' +
    '<div><h3>Platform</h3><ul>' +
    '<li><a href="/#solution">NegosyoOnline Shop</a></li>' +
    '<li><a href="/#pricing">Pricing</a></li><li><a href="/#faqs">FAQs</a></li></ul></div>' +
    '<div><h3>Legal</h3><ul><li><a href="/terms">Terms of Service</a></li><li><a href="/privacy">Privacy Policy</a></li>' +
    '<li><a href="/cancellation-refund">Cancellation and Refund Policy</a></li>' +
    '<li><a href="/referral-terms">Referral Program Terms</a></li></ul></div>' +
    '</div>' +
    '<div class="footer-reg"><div class="footer-reg-ids">' +'<div class="footer-reg-item"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg><div><span>DTI Registration No.</span><b>8526742</b></div></div>' +'<div class="footer-reg-item"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/></svg><div><span>BIR Tax ID No. (TIN)</span><b>273 993 013 00000</b></div></div>' +'</div><img class="footer-seal" src="/assets/img/bir-online-seal.png" alt="BIR Online Registration and Update System seal, registered 2026" width="998" height="336" loading="lazy"></div>' +
    '<div class="legal">&copy; 2026 NegosyoOnline IT Solutions. All rights reserved.</div></div>';

  var h = document.getElementById("site-header");
  if (h) {
    h.className = "site-header"; h.innerHTML = header;
    /* Shadow only once the page has scrolled; the header height never changes. */
    var onScroll = function () { h.classList.toggle("scrolled", window.scrollY > 4); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  var f = document.getElementById("site-footer");
  if (f) { f.className = "site-footer"; f.innerHTML = footer; }

  var btn = document.querySelector(".menu-btn"), nav = document.getElementById("site-nav");
  if (btn && nav) {
    var setOpen = function (open) {
      nav.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    btn.addEventListener("click", function () { setOpen(!nav.classList.contains("open")); });
    nav.addEventListener("click", function (e) { if (e.target.tagName === "A") setOpen(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) { setOpen(false); btn.focus(); }
    });
  }

  /* Approved FAQ, identical on the homepage and /contact. Each entry: [question, answer, category]. */
  window.NO_FAQ_CATS = ["Getting started", "Pricing and billing", "Payments", "Your store"];
  window.NO_FAQ = [
    ["What is NegosyoOnline?", "NegosyoOnline is the all-in-one system for selling online. It puts your storefront, orders, bank and e-wallet payments, hosting, and security into one clear subscription.", 0],
    ["What is currently available?", "NegosyoOnline for Santé distributors: your own Santé website with the Membership Package, ready to sell.", 0],
    ["How do I start, and how does the 14-day free trial work?", "Review the subscription details and create your NegosyoOnline account to begin your 14-day free trial. Each website you add later gets its own 14-day trial. No credit card is needed to sign up, so you can try the service first. You will add your payment method later from inside your account, and you will not be charged during the trial.", 0],
    ["Do I need to be technical to set up my shop?", "No. The dashboard's Help Center guides you through each setup screen step by step, and you can reach us at support@negosyoonline.com or +63 917 309 8619.", 0],
    ["Where can I get help after I register?", "After you register, contact us at support@negosyoonline.com or +63 917 309 8619 for setup guidance, account questions, and billing concerns.", 0],
    ["Will NegosyoOnline Bookings and University be available?", "These are planned future solutions. We will announce them only when they are ready to launch.", 0],

    ["What is included in the subscription?", "Each website is one online shop with its own " + (ANNUAL_PLAN_ENABLED ? "subscription: PHP 2,499 a month on the Monthly Plan, or PHP 24,990 a year on the Annual Plan, which gives you 2 months free and saves PHP 4,998, or 16.7%" : "PHP 2,499 monthly subscription") + ". No VAT is added. Each subscription includes a storefront, product management, order and sales monitoring, one .com domain registered for you, a free yourbusiness.negosyoonline.com address, hosting, security updates, standard support, and the stated usage limits. Payment-provider fees are charged separately. Each website is billed, renewed and cancelled on its own.", 1],
    ["Do I need a card to start the free trial?", "No. Your first website's 14-day free trial begins when you create your account, and each website you add later gets its own. Verify your email to open your dashboard. No credit card is needed to sign up, so you can try the service first.", 1],
    ["Do you take a commission on my sales?", "No. NegosyoOnline charges " + (ANNUAL_PLAN_ENABLED ? "one subscription, monthly or annual," : "one monthly subscription") + " and does not take a percentage of your sales. Payment-provider fees are charged by the provider you choose.", 1],
    ["Are there hidden fees?", "No. NegosyoOnline is designed to show clear pricing, inclusions, and usage limits before you subscribe.", 1],
    ["Is there a limit on orders?", "Your plan includes 500 orders a month. We'll show your usage in your dashboard.", 1],
    ["Can I cancel anytime, and can I get my data?", "Yes. You can cancel a website in Billing at any time, and your other websites continue. Nothing is charged during the free trial, and cancelling then ends the service right away. If a payment needs attention or your subscription is suspended, cancelling ends the service right away. The unpaid cycle is not charged. Once you are subscribed, cancelling stops the next renewal, and you keep access until the end of the " + (ANNUAL_PLAN_ENABLED ? "billing cycle or annual term you paid for, with no prorated refund for unused time" : "billing cycle you paid for") + ". After the service ends, or from the day your subscription is suspended if you do not reactivate it, you have 30 days to download your store data, and you can come back before 90 days have passed (30 days if you never paid). Cancelling after a suspension does not extend these periods.", 1],

    ["How do customers pay?", "Customers pay by bank or e-wallet transfer to your own account and upload proof of payment. You review each proof in your dashboard and confirm the payment yourself.", 2],
    ["Who receives my customers' payments?", "You do. Customer payments go to your own accounts, not to NegosyoOnline. We provide the platform for a " + (ANNUAL_PLAN_ENABLED ? "subscription" : "monthly subscription") + ".", 2],


    ["Can I use my own domain, like yourbusiness.com?", "Yes. Each website's plan includes one .com domain, like yourbusiness.com, and you also get a free yourbusiness.negosyoonline.com address. We register it after that website's first payment and connect it to your store for you, with no technical steps. The domain stays active while your subscription is active. NegosyoOnline holds the registration, so the domain is not transferred to you if you cancel.", 3],
    ["Will my store work well on mobile phones?", "Yes. Your storefront is built to be mobile-friendly, so customers can browse and pay comfortably from their phones.", 3],
  ];

  var faq = document.getElementById("faq-list");
  if (faq) {
    var activeCat = 0;
    var tabs = document.createElement("div");
    tabs.className = "faq-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "FAQ topics");
    window.NO_FAQ_CATS.forEach(function (name, c) {
      var t = document.createElement("button");
      t.type = "button";
      t.className = "faq-tab" + (c === 0 ? " is-active" : "");
      t.setAttribute("role", "tab");
      t.setAttribute("aria-selected", c === 0 ? "true" : "false");
      t.dataset.cat = String(c);
      t.textContent = name;
      tabs.appendChild(t);
    });
    faq.parentNode.insertBefore(tabs, faq);
    window.NO_FAQ.forEach(function (qa, i) {
      var item = document.createElement("div");
      item.className = "faq-item";
      item.dataset.cat = String(qa[2]);
      var open = false; /* all closed by default */
      item.innerHTML =
        '<h3><button class="faq-q" type="button" aria-expanded="' + open + '" aria-controls="faq-a' + i + '" id="faq-q' + i + '"></button></h3>' +
        '<div class="faq-a" id="faq-a' + i + '" role="region" aria-labelledby="faq-q' + i + '"' + (open ? "" : " hidden") + "></div>";
      item.querySelector(".faq-q").textContent = qa[0];
      item.querySelector(".faq-a").textContent = qa[1];
      faq.appendChild(item);
    });
    var showCat = function (c) {
      activeCat = c;
      tabs.querySelectorAll(".faq-tab").forEach(function (t) {
        var on = t.dataset.cat === String(c);
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      });
      faq.querySelectorAll(".faq-item").forEach(function (it) { it.hidden = it.dataset.cat !== String(c); });
    };
    tabs.addEventListener("click", function (e) {
      var t = e.target.closest(".faq-tab");
      if (t) showCat(Number(t.dataset.cat));
    });
    showCat(0);
    faq.addEventListener("click", function (e) {
      var q = e.target.closest(".faq-q");
      if (!q) return;
      var a = document.getElementById(q.getAttribute("aria-controls"));
      var open = q.getAttribute("aria-expanded") === "true";
      faq.querySelectorAll(".faq-q[aria-expanded='true']").forEach(function (other) {
        other.setAttribute("aria-expanded", "false");
        document.getElementById(other.getAttribute("aria-controls")).hidden = true;
      });
      q.setAttribute("aria-expanded", String(!open));
      a.hidden = open;
    });
  }

  /* Background image slots: the Blob URL becomes the section background; without one the plain gradient stays. */
  document.querySelectorAll("[data-bg-asset]").forEach(function (el) {
    var url = (cfg.assets || {})[el.getAttribute("data-bg-asset")];
    if (!url) return;
    var pre = new Image();
    pre.fetchPriority = "high";
    pre.onload = function () { el.style.setProperty("--hero-img", "url(\"" + url + "\")"); el.classList.add("has-bg"); };
    pre.src = url;
  });

  /* Image slots: use the Vercel Blob URL when configured, else a marked placeholder. */
  document.querySelectorAll("[data-asset]").forEach(function (el) {
    var url = (cfg.assets || {})[el.getAttribute("data-asset")];
    var alt = el.getAttribute("data-alt") || "";
    if (url) {
      var img = new Image();
      img.src = url; img.alt = alt;
      if (el.hasAttribute("data-eager")) { img.loading = "eager"; img.fetchPriority = "high"; } else { img.loading = "lazy"; }
      img.decoding = "async";
      el.textContent = ""; el.appendChild(img);
    } else {
      el.textContent = "Approved image pending upload to Vercel Blob: " + (el.getAttribute("data-label") || alt);
    }
  });
})();

/* Every "Start Free Trial" link (/?signup=1) opens the sign-up popup. The /start/ payment return pages do not need it. */
if (!/^\/start(\/|$)/.test(location.pathname)) {
  var signupScript = document.createElement("script");
  signupScript.src = "/assets/js/signup-modal.js";
  document.body.appendChild(signupScript);
}
