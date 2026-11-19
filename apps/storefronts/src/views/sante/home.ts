/* The Santé home page and its basket drawer.

   Transcribed by script from TWCinc's approved templates (commit ac483675c):
   negosyoonline_sante_pack/templates/negosyoonline_sante_pack/home.html and _store_drawer.html.
   Markup, class names, text, order and inline styles are the template's, character for character.
   Do not reformat this file: its text is compared with the template run by run.

   Different from the template, on purpose:
   - asset links point at /assets/sante/ (src/lib/assets.ts) instead of the Django static tag;
   - "Email Us" shows the store's own contact email, and only when it has one, where the template
     printed one fixed support address for every store;
   - the contact form has no CSRF token field: a post carries no sign-in for one to protect;
   - the basket drawer's rows come from the shop (src/views/sante/shop-shell.ts); a visitor with no basket sees it empty;
   - the nav and footer are the functions storeNav and storeFooter, shared with the shop pages;
   - the "Send a Message" card carries id="contact-form", which the template does not have: the
     form posts to /contact/#contact-form so the answer opens at the card, with its note in view;
   - Subject Topic is a required field (Coach Ed, 2026-11-11): it sits in its own block with an
     error line under it, as the name, email and message fields already do;
   - a third script, js/contact-form.js, sends the form without leaving the page and shows the
     checkout popup of pack-storefront.css while it does (Coach Ed, 2026-11-11). */
import { asset } from "../../lib/assets.ts";
import { html, type Markup } from "../../lib/html.ts";
import { cookieSettingsItem } from "../../lib/meta.ts";
import type { HomeModel } from "./model.ts";
import { chatWidgetCss, chatWidgetScript } from "./chat-widget.ts";
import { footerBusiness } from "./footer-business.ts";
import { appNotice } from "./shop-app-notice.ts";

export function storeNav(v: HomeModel): Markup {
  return html`
<!-- NAVBAR -->
<nav class="navbar">
  <div class="navbar-inner">
  <a href="/" class="navbar-logo">
    <img src="${asset("img/navbar-logo.webp")}" alt="Sant&eacute; International">
  </a>
  <ul class="nav-links" id="sfNavLinks">
    <li><a href="/">Home</a></li>
    <li><a href="/#about">About</a></li>
    <li><a href="/#faq">FAQ</a></li>
    <li><a href="/#contact">Contact</a></li>
    <li><a href="/products/">Shop</a></li>
    <li class="nav-track-li"><a href="/dashboard/sign-in/?next=orders">Track Order</a></li>
  </ul>
  <div class="nav-actions">
    <a href="/dashboard/sign-in/?next=orders" class="nav-track">Track Order</a>
    <a href="/cart/" class="nav-cart" aria-label="Basket" data-sf-open-drawer>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
      <span class="nav-cart-count" data-cart-count${!v.drawer.count ? html` hidden` : ""}>${v.drawer.count}</span>
    </a>
    ${v.signed_in ? html`<a href="/dashboard/" class="nav-cta">Dashboard</a>` : html`<a href="/dashboard/sign-in/" class="nav-cta">Login</a>`}
    <button type="button" class="nav-toggle" aria-label="Menu" aria-controls="sfNavLinks" aria-expanded="false" data-sf-nav-toggle>
      <span></span><span></span><span></span>
    </button>
  </div>
  </div>
</nav>
`;
}

/* The Xendit channels the footer shows as text badges when the site offers online payment. The backend sends no channel list, so this is the one place to edit. */
export const XENDIT_BADGES: readonly string[] = ["Visa", "Mastercard", "JCB", "GCash", "Maya", "GrabPay", "ShopeePay", "QR Ph"];

export function storeFooter(v: HomeModel): Markup {
  return html`
<!-- FOOTER -->
<footer class="footer">
  <div class="footer-inner">
    <div class="footer-top">
      <div>
        <img class="footer-logo" src="${asset("img/navbar-logo.webp")}" alt="Sant&eacute; International">
        <p class="footer-tagline">Premium Wellness for Every Filipino Family. Trusted since 2007, present in 20+ countries.</p>
        <div class="payment-row">
          ${v.pay_methods?.direct ? html`<span class="pay-badge">Bank Transfer</span>` : html``}
          ${v.pay_methods?.xendit ? html`${XENDIT_BADGES.map((b) => html`<span class="pay-badge">${b}</span>`)}` : html`<span class="pay-badge">E-wallet</span>`}
        </div>
      </div>
      <div>
        <div class="footer-col-title">Company</div>
        <ul class="footer-links">
          <li><a href="/#about">About Sant&eacute;</a></li>
          <li><a href="/#contact">Contact Us</a></li>
        </ul>
        ${v.biz.contact_email || v.biz.contact_mobile || v.socials.facebook ? html`<ul class="footer-links footer-contact">
          ${v.biz.contact_email ? html`<li><a href="mailto:${v.biz.contact_email}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18v12H3zM3 7l9 6 9-6"/></svg><span>${v.biz.contact_email}</span></a></li>` : ""}
          ${v.biz.contact_mobile ? html`<li><a href="tel:${v.biz.contact_tel}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg><span>${v.biz.contact_mobile}</span></a></li>` : ""}
          ${v.socials.facebook ? html`<li><a href="${v.socials.facebook}" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.5A.5.5 0 0 1 14.5 8z"/></svg><span>${v.socials.facebook_label}</span></a></li>` : ""}
        </ul>` : ""}
      </div>
      <div>
        <div class="footer-col-title">Shop</div>
        <ul class="footer-links">
          <li><a href="/products/">All Products</a></li>
          <li><a href="/products/?category=barley">Sant&eacute; Barley</a></li>
          <li><a href="/products/?category=drinks">Sant&eacute; Special Drinks</a></li>
          <li><a href="/products/?category=essentials">Sant&eacute; Essentials</a></li>
          <li><a href="/products/?category=beauty">Sant&eacute; Beauty</a></li>
        </ul>
      </div>
      ${v.policy_links.length || v.cookie_settings ? html`<div>
        <div class="footer-col-title">Legal</div>
        <ul class="footer-links">
          ${v.policy_links.map((l) => html`<li><a href="${l.path}">${l.label}</a></li>`)}
          ${cookieSettingsItem(v.cookie_settings)}
        </ul>
      </div>` : ""}
    </div>
    ${footerBusiness(v)}
  </div>
</footer>
`;
}

export function storeDrawer(v: HomeModel): Markup {
  return html`
<div class="sf-drawer-overlay" id="sfDrawerOverlay" hidden></div>
<aside class="sf-drawer" id="sfDrawer" aria-hidden="true" aria-label="Shopping basket">
  <header class="sf-drawer-head">
    <button type="button" class="sf-drawer-back" id="sfDrawerClose" aria-label="Continue shopping">&#8592;</button>
    <div class="sf-drawer-title">
      <strong>Continue Shopping</strong>
      <span data-sf-drawer-count>${v.drawer.count_label}</span>
    </div>
    <button type="button" class="sf-drawer-clear" id="sfDrawerClear">Clear Basket</button>
  </header>
  <div class="sf-drawer-shop">
    <span class="sf-drawer-shop-name">&#127978; Shop: Sant&eacute;</span>
    <span class="sf-drawer-pill" data-sf-drawer-count-pill>${v.drawer.count_label}</span>
  </div>
  <div class="sf-drawer-body">
    ${v.drawer.error ? html`<p class="sf-quote-error" role="alert">${v.drawer.error}</p>` : ""}
    <div id="sfDrawerItems">
      ${v.drawer.rows ?? ""}
    </div>
    <div class="sf-drawer-empty" id="sfDrawerEmpty"${v.drawer.lines ? html` hidden` : ""}>
      <p>Your basket is empty.</p>
      <a href="/products/" class="btn-cart">Shop Products</a>
    </div>
    <div class="sf-drawer-subtotal" id="sfDrawerSubtotalRow"${!v.drawer.lines ? html` hidden` : ""}>
      <span>Shop total</span>
      <strong data-sf-drawer-subtotal>&#8369;${v.drawer.subtotal}</strong>
    </div>
  </div>
  ${v.drawer.app ? html`<footer class="sf-drawer-foot">
    ${appNotice(v.drawer.app.href)}
  </footer>` : html`<footer class="sf-drawer-foot">
    <div class="sf-drawer-total"><span>Total</span><strong data-sf-drawer-total>&#8369;${v.drawer.subtotal}</strong></div>
    <p class="sf-drawer-note">Shipping is calculated at checkout.</p>
    <a href="/checkout/" class="btn-cart sf-drawer-checkout${!v.drawer.lines ? html` disabled` : ""}" id="sfDrawerCheckout">Proceed To Checkout</a>
  </footer>`}
</aside>
`;
}

/* The document up to the certification badges; homeDocument() joins this, trustBadges() and homeBottom(). */
function homeTop(v: HomeModel): Markup {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>${v.store_name} | Premium Wellness</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&amp;display=swap">
  <link rel="stylesheet" href="${asset("css/pack-home.css")}">
  <link rel="stylesheet" href="${asset("css/pack-storefront.css")}">
  ${chatWidgetCss()}
</head>
<body>
<a class="sf-skip" href="#main-content">Skip to content</a>
${v.free_shipping_banner ? html`<div class="sf-announce">&#128666; <strong>FREE SHIPPING</strong> on all orders — for a limited time!</div>` : ""}

${storeNav(v)}

<main id="main-content" tabindex="-1">
<div id="home"></div>

<!-- HERO CAROUSEL -->
<div class="hero-carousel" id="heroCarousel">

  <!-- Slides -->
  <div class="carousel-track" id="carouselTrack">

    <!-- Slide 1 -->
    <div class="carousel-slide is-active">
      <div class="hero-content">
        <div class="hero-badge">&#127807; Premium Organic Wellness</div>
        <h1 class="hero-title">Experience the Power of <span>Premium Organic Barley</span></h1>
        <p class="hero-subtitle">Certified pure organic barley grass from New Zealand. Your trusted daily nutrition, made simple.</p>
        <div class="hero-ctas">
          <a href="/products/" class="btn-white">Shop Sant&eacute; Products</a>
          <a href="#about" class="btn-outline-white">Discover Barley</a>
        </div>
        <div class="hero-trust-row">
          <div class="trust-pill">&#10003; 20+ Years Trusted</div>
          <div class="trust-pill">&#10003; 500,000+ Customers</div>
          <div class="trust-pill">&#10003; 20+ Countries</div>
        </div>
      </div>
    </div>

    <!-- Slide 2 -->
    <div class="carousel-slide">
      <div class="hero-content">
        <div class="hero-badge">&#127807; Premium Organic Wellness</div>
        <div class="hero-title">Your Trusted Daily <span>Wellness</span> Partner</div>
        <p class="hero-subtitle">Premium organic wellness products for Filipino families, busy professionals, and active individuals. Good health starts here.</p>
        <div class="hero-ctas">
          <a href="/products/" class="btn-white">Shop Sant&eacute; Products</a>
          <a href="#about" class="btn-outline-white">Discover Barley</a>
        </div>
        <div class="hero-trust-row">
          <div class="trust-pill">&#10003; 20+ Years Trusted</div>
          <div class="trust-pill">&#10003; 500,000+ Customers</div>
          <div class="trust-pill">&#10003; 20+ Countries</div>
        </div>
      </div>
    </div>

    <!-- Slide 3 -->
    <div class="carousel-slide">
      <div class="hero-content">
        <div class="hero-badge">&#127806; From New Zealand's Farms</div>
        <div class="hero-title">From New Zealand's Fields to Your <span>Daily Routine</span></div>
        <p class="hero-subtitle">Pure organic barley grass, harvested at its peak and delivered straight to your door. Wellness made simple.</p>
        <div class="hero-ctas">
          <a href="/products/" class="btn-white">Shop Sant&eacute; Products</a>
          <a href="#about" class="btn-outline-white">Discover Barley</a>
        </div>
        <div class="hero-trust-row">
          <div class="trust-pill">&#10003; BioGro NZ Certified</div>
          <div class="trust-pill">&#10003; No Artificial Additives</div>
          <div class="trust-pill">&#10003; 20+ Countries</div>
        </div>
      </div>
    </div>

  </div><!-- /carousel-track -->

  <!-- Prev / Next arrows -->
  <button class="carousel-arrow prev" id="carouselPrev" aria-label="Previous slide">&#8249;</button>
  <button class="carousel-arrow next" id="carouselNext" aria-label="Next slide">&#8250;</button>

  <!-- Dot indicators -->
  <div class="carousel-dots" id="carouselDots">
    <div class="carousel-dot active" data-index="0"></div>
    <div class="carousel-dot" data-index="1"></div>
    <div class="carousel-dot" data-index="2"></div>
  </div>

</div><!-- /hero-carousel -->

<!-- TRUST + CERTIFICATIONS BAR -->
<div class="trust-bar">


  <!-- Row 1: certification badges -->
  `;
}

/* The one certification band, "Certified, Tested & Recognized Worldwide": label and five badges in TWCinc's order
   (Trusted Since 2007, BioGro NZ Certified, Global Standard, Halal Certified, FDA Registered). The home page and the
   product page both render it, so they cannot drift apart again (Coach Ed, 2026-11-14). Show only badges the brand
   holds: never add one that is not in this set. */
export function trustBadges(): Markup {
  return html`<div class="trust-bar-label">Certified, Tested &amp; Recognized Worldwide</div>
  <div class="trust-bar-inner">

    <div class="trust-item">
      <img src="data:image/webp;base64,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" alt="Trusted Since 2007">
      <span class="trust-item-label">Trusted Since 2007</span>
    </div>

    <div class="trust-item biogro">
      <img src="data:image/webp;base64,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" alt="BioGro NZ Certified Organic">
      <span class="trust-item-label">BioGro NZ Certified</span>
    </div>

    <div class="trust-item">
      <img src="data:image/webp;base64,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" alt="Global Standard">
      <span class="trust-item-label">Global Standard</span>
    </div>

    <!-- Halal Certified , official circular Halal mark -->
    <div class="trust-item trust-item-halal">
      <img
        src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iOTIwcHgiIGhlaWdodD0iOTA5cHgiIHZpZXdCb3g9IjAgMCA5MTkgOTA5IiB2ZXJzaW9uPSIxLjEiPgo8ZyBpZD0ic3VyZmFjZTEiPgo8cGF0aCBzdHlsZT0iIHN0cm9rZTpub25lO2ZpbGwtcnVsZTpub256ZXJvO2ZpbGw6cmdiKDEwMCUsMTAwJSwxMDAlKTtmaWxsLW9wYWNpdHk6MTsiIGQ9Ik0gNDU2LjgzOTg0NCA2MS43NTM5MDYgTCA0NTYuNzk2ODc1IDYxLjc1MzkwNiBMIDQ1Ni43OTY4NzUgNjEuNzEwOTM4IEMgMzQ4LjUxMTcxOSA2MS43MTg3NSAyNTAuNDI1NzgxIDEwNS42ODc1IDE3OS40MDIzNDQgMTc2Ljc3MzQzOCBDIDEwOC40MTAxNTYgMjQ3LjgzMjAzMSA2NC40NzI2NTYgMzQ1Ljk3NjU2MiA2NC40NTMxMjUgNDU0LjMzOTg0NCBMIDY0LjUgNDU0LjMzOTg0NCBMIDY0LjUgNDU0LjQ3NjU2MiBMIDY0LjQ1MzEyNSA0NTQuNDc2NTYyIEMgNjQuNDY0ODQ0IDU2Mi44NTkzNzUgMTA4LjQxMDE1NiA2NjEuMDI3MzQ0IDE3OS40MjU3ODEgNzMyLjEwMTU2MiBDIDI1MC40MzM1OTQgODAzLjE1NjI1IDM0OC40OTIxODggODQ3LjEwOTM3NSA0NTYuNzUgODQ3LjEyODkwNiBMIDQ1Ni43NSA4NDcuMDg1OTM4IEwgNDU2Ljg4NjcxOSA4NDcuMDg1OTM4IEwgNDU2Ljg4NjcxOSA4NDcuMTI4OTA2IEMgNTY1LjE3MTg3NSA4NDcuMTIxMDk0IDY2My4yNjE3MTkgODAzLjE0MDYyNSA3MzQuMjY5NTMxIDczMi4wNzAzMTIgQyA4MDUuMjU3ODEyIDY2MS4wMTU2MjUgODQ5LjE4MzU5NCA1NjIuODcxMDk0IDg0OS4xOTkyMTkgNDU0LjUyMzQzOCBMIDg0OS4xNjQwNjIgNDU0LjUyMzQzOCBMIDg0OS4xNjQwNjIgNDU0LjM5MDYyNSBMIDg0OS4xOTkyMTkgNDU0LjM5MDYyNSBDIDg0OS4xOTkyMTkgMzQ1Ljk5MjE4OCA4MDUuMjQ2MDk0IDI0Ny44MTI1IDczNC4yMzQzNzUgMTc2Ljc0MjE4OCBDIDY2My4yMzQzNzUgMTA1LjY4NzUgNTY1LjE4MzU5NCA2MS43MzQzNzUgNDU2LjkzMzU5NCA2MS43MTA5MzggTCA0NTYuOTMzNTk0IDYxLjc1MzkwNiBaIE0gNDU2Ljc5Njg3NSA0MC4wODIwMzEgTCA0NTYuNzk2ODc1IDQwLjA0Njg3NSBMIDQ1Ni45MzM1OTQgNDAuMDQ2ODc1IEwgNDU2LjkzMzU5NCA0MC4wODIwMzEgQyA1NzEuMjMwNDY5IDQwLjEwOTM3NSA2NzQuNjk1MzEyIDg2LjQ2MDkzOCA3NDkuNTY2NDA2IDE2MS4zOTg0MzggQyA4MjQuNDU3MDMxIDIzNi4zNDM3NSA4NzAuNzk2ODc1IDMzOS45NDUzMTIgODcwLjgxMjUgNDU0LjM5MDYyNSBMIDg3MC44NTU0NjkgNDU0LjM5MDYyNSBMIDg3MC44NTU0NjkgNDU0LjUyMzQzOCBMIDg3MC44MTI1IDQ1NC41MjM0MzggQyA4NzAuNzgxMjUgNTY4LjkyMTg3NSA4MjQuNDY0ODQ0IDY3Mi40ODQzNzUgNzQ5LjYwMTU2MiA3NDcuNDE3OTY5IEMgNjc0LjcxODc1IDgyMi4zNjcxODggNTcxLjIxNDg0NCA4NjguNzQyMTg4IDQ1Ni44ODY3MTkgODY4Ljc1MzkwNiBMIDQ1Ni44ODY3MTkgODY4Ljc5Njg3NSBMIDQ1Ni43NSA4NjguNzk2ODc1IEwgNDU2Ljc1IDg2OC43NTM5MDYgQyAzNDIuNDQ1MzEyIDg2OC43MzA0NjkgMjM4Ljk3MjY1NiA4MjIuMzc4OTA2IDE2NC4wODk4NDQgNzQ3LjQ0OTIxOSBDIDg5LjE5OTIxOSA2NzIuNSA0Mi44NTkzNzUgNTY4LjkxMDE1NiA0Mi44NDc2NTYgNDU0LjQ3NjU2MiBMIDQyLjgwNDY4OCA0NTQuNDc2NTYyIEwgNDIuODA0Njg4IDQ1NC4zMzk4NDQgTCA0Mi44NDc2NTYgNDU0LjMzOTg0NCBDIDQyLjg3NSAzMzkuOTI1NzgxIDg5LjE5OTIxOSAyMzYuMzYzMjgxIDE2NC4wNzAzMTIgMTYxLjQyNTc4MSBDIDIzOC45NjA5MzggODYuNDYwOTM4IDM0Mi40Njg3NSA0MC4wOTc2NTYgNDU2Ljc5Njg3NSA0MC4wODIwMzEgIi8+CjxwYXRoIHN0eWxlPSIgc3Ryb2tlOm5vbmU7ZmlsbC1ydWxlOmV2ZW5vZGQ7ZmlsbDpyZ2IoMTAwJSwxMDAlLDEwMCUpO2ZpbGwtb3BhY2l0eToxOyIgZD0iTSAzMzcuNzIyNjU2IDY2Mi4wODIwMzEgTCAzNDUuODYzMjgxIDYzNy4wMDM5MDYgTCAzNDYuMjYxNzE5IDYzNy4wMDM5MDYgTCAzNTQuNTI3MzQ0IDY2Mi4wODIwMzEgWiBNIDM4Mi42MTMyODEgNjc3LjcxMDkzOCBDIDM3Ny42MjUgNjY0LjMwNDY4OCAzNzEuOTU3MDMxIDY0OC44MTI1IDM2Ni4zMTY0MDYgNjMzLjIwNzAzMSBMIDM1Ny4zOTg0MzggNjA4LjM5NDUzMSBMIDM0OC4zNTkzNzUgNjEwLjIxMDkzOCBMIDMyMi4xMTMyODEgNjc4LjA5NzY1NiBDIDMxNy44MDg1OTQgNjg5LjEyODkwNiAzMTUuODIwMzEyIDY4OS42MzY3MTkgMzA5LjEyMTA5NCA2OTAuNTcwMzEyIEwgMzA5LjEzMjgxMiA2OTUuNjk1MzEyIEwgMzM5LjY5MTQwNiA2OTUuNjk1MzEyIEwgMzM5LjY5MTQwNiA2OTAuNTcwMzEyIEwgMzM1LjkxNDA2MiA2OTAuMTc1NzgxIEMgMzI5Ljg2NzE4OCA2ODkuNTA3ODEyIDMyOS44NjcxODggNjg4LjIwNzAzMSAzMzEuNTYyNSA2ODIuNTc0MjE5IEwgMzM1LjUxNTYyNSA2NjkuOTY4NzUgTCAzNTcuMDIzNDM4IDY2OS45Njg3NSBMIDM2MS43NTM5MDYgNjgzLjM1NTQ2OSBDIDM2My40NDE0MDYgNjg4LjA3NDIxOSAzNjMuMTY3OTY5IDY4OS40MDIzNDQgMzU4LjMzNTkzOCA2OTAuMDQ2ODc1IEwgMzU0LjM3ODkwNiA2OTAuNTcwMzEyIEwgMzU0LjM3ODkwNiA2OTUuNjk1MzEyIEwgMzk1LjU3ODEyNSA2OTUuNjk1MzEyIEwgMzk1LjU3ODEyNSA2OTAuNTcwMzEyIEMgMzg5LjE1NjI1IDY4OS44MDQ2ODggMzg2Ljc4OTA2MiA2ODkuMTI4OTA2IDM4Mi42MTMyODEgNjc3LjcxMDkzOCBaIE0gNTcwLjI4NTE1NiA2NjIuMDgyMDMxIEwgNTc4LjQ0NTMxMiA2MzcuMDAzOTA2IEwgNTc4LjgxMjUgNjM3LjAwMzkwNiBMIDU4Ny4xMDU0NjkgNjYyLjA4MjAzMSBaIE0gNjE1LjE2NDA2MiA2NzcuNzEwOTM4IEMgNjEwLjE3NTc4MSA2NjQuMzA0Njg4IDYwNC41MzUxNTYgNjQ4LjgxMjUgNTk4Ljg5ODQzOCA2MzMuMjA3MDMxIEwgNTg5Ljk4MDQ2OSA2MDguMzk0NTMxIEwgNTgwLjkxNDA2MiA2MTAuMjEwOTM4IEwgNTU0LjY2Nzk2OSA2NzguMDk3NjU2IEMgNTUwLjMzOTg0NCA2ODkuMTI4OTA2IDU0OC40MTc5NjkgNjg5LjYzNjcxOSA1NDEuNzE4NzUgNjkwLjU3MDMxMiBMIDU0MS43MTg3NSA2OTUuNjk1MzEyIEwgNTcyLjI4OTA2MiA2OTUuNjk1MzEyIEwgNTcyLjI4OTA2MiA2OTAuNTcwMzEyIEwgNTY4LjQ3MjY1NiA2OTAuMTc1NzgxIEMgNTYyLjQyOTY4OCA2ODkuNTA3ODEyIDU2Mi40Mjk2ODggNjg4LjIwNzAzMSA1NjQuMTM2NzE5IDY4Mi41NzQyMTkgTCA1NjguMDY2NDA2IDY2OS45Njg3NSBMIDU4OS41NzQyMTkgNjY5Ljk2ODc1IEwgNTk0LjMxMjUgNjgzLjM1NTQ2OSBDIDU5NS45OTIxODggNjg4LjA3NDIxOSA1OTUuNzIyNjU2IDY4OS40MDIzNDQgNTkwLjg4NjcxOSA2OTAuMDQ2ODc1IEwgNTg2Ljk1NzAzMSA2OTAuNTcwMzEyIEwgNTg2Ljk1NzAzMSA2OTUuNjk1MzEyIEwgNjI4LjE1NjI1IDY5NS42OTUzMTIgTCA2MjguMTU2MjUgNjkwLjU3MDMxMiBDIDYyMS43MTQ4NDQgNjg5LjgwNDY4OCA2MTkuMzg2NzE5IDY4OS4xMjg5MDYgNjE1LjE2NDA2MiA2NzcuNzEwOTM4IFogTSA3MjUuNzY5NTMxIDY4NS4wNjI1IEMgNzIzLjAwMzkwNiA2ODguNDY0ODQ0IDcxNy4zNjMyODEgNjg4Ljg1MTU2MiA3MTMuMTgzNTk0IDY4OC44NTE1NjIgQyA3MDkuMDk3NjU2IDY4OC44NTE1NjIgNzA2LjA4MjAzMSA2ODguNzQ2MDk0IDcwMy45Njg3NSA2ODcuNjkxNDA2IEMgNzAxLjYwNTQ2OSA2ODYuNTA3ODEyIDcwMS4zNDM3NSA2ODMuMjIyNjU2IDcwMS4zNDM3NSA2NzYuMzg2NzE5IEwgNzAxLjM0Mzc1IDYzMS4zNTE1NjIgQyA3MDEuMzQzNzUgNjE3LjE3NTc4MSA3MDIuNDA2MjUgNjE2LjI3MzQzOCA3MTEuODcxMDk0IDYxNS40ODQzNzUgTCA3MTEuODcxMDk0IDYxMC4zNDM3NSBMIDY2OS4yMTA5MzggNjEwLjM0Mzc1IEwgNjY5LjIxMDkzOCA2MTUuNDg0Mzc1IEMgNjc4LjAyNzM0NCA2MTYuMjczNDM4IDY3OS4wODIwMzEgNjE3LjE3NTc4MSA2NzkuMDgyMDMxIDYzMS4zNTE1NjIgTCA2NzkuMDgyMDMxIDY3NC42NzE4NzUgQyA2NzkuMDgyMDMxIDY4OC44NTE1NjIgNjc4LjAyNzM0NCA2ODkuODA0Njg4IDY2OC4wNDY4NzUgNjkwLjU3MDMxMiBMIDY2OC4wNDY4NzUgNjk1LjY5NTMxMiBMIDczMy4xMjg5MDYgNjk1LjY5NTMxMiBDIDczNC4yODkwNjIgNjkxLjYxMzI4MSA3MzcuMDU0Njg4IDY3Ny45NjA5MzggNzM3LjgxNjQwNiA2NzIuOTgwNDY5IEwgNzMyLjE3NTc4MSA2NzIuMDYyNSBDIDczMC4wNjI1IDY3OS4wMTk1MzEgNzI3LjgzOTg0NCA2ODIuNTc0MjE5IDcyNS43Njk1MzEgNjg1LjA2MjUgWiBNIDQ5My4xNjQwNjIgNjg1LjA2MjUgQyA0OTAuNDE3OTY5IDY4OC40NjQ4NDQgNDg0Ljc5Njg3NSA2ODguODUxNTYyIDQ4MC41ODk4NDQgNjg4Ljg1MTU2MiBDIDQ3Ni41MTU2MjUgNjg4Ljg1MTU2MiA0NzMuNDkyMTg4IDY4OC43NDYwOTQgNDcxLjQwNjI1IDY4Ny42OTE0MDYgQyA0NjkuMDM1MTU2IDY4Ni41MDc4MTIgNDY4Ljc2MTcxOSA2ODMuMjIyNjU2IDQ2OC43NjE3MTkgNjc2LjM4NjcxOSBMIDQ2OC43NjE3MTkgNjMxLjM1MTU2MiBDIDQ2OC43NjE3MTkgNjE3LjE3NTc4MSA0NjkuODE2NDA2IDYxNi4yNzM0MzggNDc5LjI2MTcxOSA2MTUuNDg0Mzc1IEwgNDc5LjI2MTcxOSA2MTAuMzQzNzUgTCA0MzYuNjU2MjUgNjEwLjM0Mzc1IEwgNDM2LjY1NjI1IDYxNS40ODQzNzUgQyA0NDUuNDIxODc1IDYxNi4yNzM0MzggNDQ2LjQ4MDQ2OSA2MTcuMTc1NzgxIDQ0Ni40ODA0NjkgNjMxLjM1MTU2MiBMIDQ0Ni40ODA0NjkgNjc0LjY3MTg3NSBDIDQ0Ni40ODA0NjkgNjg4Ljg1MTU2MiA0NDUuNDIxODc1IDY4OS44MDQ2ODggNDM1LjQ3NjU2MiA2OTAuNTcwMzEyIEwgNDM1LjQ3NjU2MiA2OTUuNjk1MzEyIEwgNTAwLjUxOTUzMSA2OTUuNjk1MzEyIEMgNTAxLjY4MzU5NCA2OTEuNjEzMjgxIDUwNC40NDUzMTIgNjc3Ljk2MDkzOCA1MDUuMjUgNjcyLjk4MDQ2OSBMIDQ5OS42MTMyODEgNjcyLjA2MjUgQyA0OTcuNDk2MDk0IDY3OS4wMTk1MzEgNDk1LjI3NzM0NCA2ODIuNTc0MjE5IDQ5My4xNjQwNjIgNjg1LjA2MjUgWiBNIDIyNi42MTcxODggNjE1LjQ4NDM3NSBDIDIzNC44OTg0MzggNjE2LjI3MzQzOCAyMzUuOTMzNTk0IDYxNy4xNzU3ODEgMjM1LjkzMzU5NCA2MzEuMzUxNTYyIEwgMjM1LjkzMzU5NCA2NDYuNTgyMDMxIEwgMjA4Ljc4MTI1IDY0Ni41ODIwMzEgTCAyMDguNzgxMjUgNjMxLjM1MTU2MiBDIDIwOC43ODEyNSA2MTcuMTc1NzgxIDIwOS44MzU5MzggNjE2LjI3MzQzOCAyMTcuODQzNzUgNjE1LjQ4NDM3NSBMIDIxNy44NDM3NSA2MTAuMzQzNzUgTCAxNzUuODYzMjgxIDYxMC4zNDM3NSBMIDE3NS44NjMyODEgNjE1LjQ4NDM3NSBDIDE4NS40MTAxNTYgNjE2LjI3MzQzOCAxODYuNDY4NzUgNjE3LjE3NTc4MSAxODYuNDY4NzUgNjMxLjM1MTU2MiBMIDE4Ni40Njg3NSA2NzQuNjcxODc1IEMgMTg2LjQ2ODc1IDY4OC44NTE1NjIgMTg1LjQxMDE1NiA2ODkuODA0Njg4IDE3Ni4zNjcxODggNjkwLjU3MDMxMiBMIDE3Ni4zNjcxODggNjk1LjY5NTMxMiBMIDIxOC4zNTU0NjkgNjk1LjY5NTMxMiBMIDIxOC4zNTU0NjkgNjkwLjU3MDMxMiBDIDIwOS44MzU5MzggNjg5LjgwNDY4OCAyMDguNzgxMjUgNjg4Ljg1MTU2MiAyMDguNzgxMjUgNjc0LjY3MTg3NSBMIDIwOC43ODEyNSA2NTQuNzIyNjU2IEwgMjM1LjkzMzU5NCA2NTQuNzIyNjU2IEwgMjM1LjkzMzU5NCA2NzQuNjcxODc1IEMgMjM1LjkzMzU5NCA2ODguODUxNTYyIDIzNC44OTg0MzggNjg5LjgwNDY4OCAyMjUuNTU0Njg4IDY5MC41NzAzMTIgTCAyMjUuNTU0Njg4IDY5NS42OTUzMTIgTCAyNjguMzIwMzEyIDY5NS42OTUzMTIgTCAyNjguMzIwMzEyIDY5MC41NzAzMTIgQyAyNTkuMjgxMjUgNjg5LjgwNDY4OCAyNTguMjI2NTYyIDY4OC44NTE1NjIgMjU4LjIyNjU2MiA2NzQuNjcxODc1IEwgMjU4LjIyNjU2MiA2MzEuMzUxNTYyIEMgMjU4LjIyNjU2MiA2MTcuMTc1NzgxIDI1OS4yODEyNSA2MTYuMjczNDM4IDI2OC41OTc2NTYgNjE1LjQ4NDM3NSBMIDI2OC41OTc2NTYgNjEwLjM0Mzc1IEwgMjI2LjYxNzE4OCA2MTAuMzQzNzUgTCAyMjYuNjE3MTg4IDYxNS40ODQzNzUgIi8+CjxwYXRoIHN0eWxlPSIgc3Ryb2tlOm5vbmU7ZmlsbC1ydWxlOmV2ZW5vZGQ7ZmlsbDpyZ2IoMTAwJSwxMDAlLDEwMCUpO2ZpbGwtb3BhY2l0eToxOyIgZD0iTSAzODkuMzMyMDMxIDM5NS4zNjMyODEgQyA0MTUuNzk2ODc1IDQxMy44MjgxMjUgNDMwLjI1NzgxMiA0NzEuNjcxODc1IDQzMC4yNTc4MTIgNDcxLjY3MTg3NSBDIDQ0NC42OTUzMTIgMzQyLjIyMjY1NiAzMjYuNzY1NjI1IDMwNS4yMzQzNzUgMzI2Ljc2NTYyNSAzMDUuMjM0Mzc1IEMgMzI2Ljc2NTYyNSAzMDUuMjM0Mzc1IDMyNC4zMjQyMTkgMzEyLjE0NDUzMSAzMjYuNzY1NjI1IDM0Ni43NzM0MzggQyAzMjkuMTQwNjI1IDM4MS41NTQ2ODggMzYyLjc4MTI1IDM3Ni44NjcxODggMzg5LjMzMjAzMSAzOTUuMzYzMjgxICIvPgo8cGF0aCBzdHlsZT0iIHN0cm9rZTpub25lO2ZpbGwtcnVsZTpldmVub2RkO2ZpbGw6cmdiKDEwMCUsMTAwJSwxMDAlKTtmaWxsLW9wYWNpdHk6MTsiIGQ9Ik0gMzE3LjA5NzY1NiA1MDYuMzEyNSBDIDMyNi43NjU2MjUgNDgzLjIzMDQ2OSAzMDkuODY3MTg4IDM1OC4zMzIwMzEgMzA5Ljg2NzE4OCAzMjUuOTUzMTI1IEMgMzA5Ljg2NzE4OCAyOTMuNjcxODc1IDMyMS44Nzg5MDYgMjc1LjE1NjI1IDMyMS44Nzg5MDYgMjc1LjE1NjI1IEMgMzA1LjA3ODEyNSAyNjUuODc4OTA2IDI5My4wODk4NDQgMjI0LjI2MTcxOSAyOTMuMDg5ODQ0IDIyNC4yNjE3MTkgQyAyODguMTk5MjE5IDIzNS44MjQyMTkgMjcxLjM5ODQzOCAyNjEuMjM0Mzc1IDI3MS4zOTg0MzggMjYxLjIzNDM3NSBDIDI3MS4zOTg0MzggMjYxLjIzNDM3NSAzMTkuNTM1MTU2IDQ5MC4xNzk2ODggMjg4LjE5OTIxOSA1MTcuNzk2ODc1IEMgMjU2Ljk0NTMxMiA1NDUuNTA3ODEyIDE5NC4zMjAzMTIgNTUwLjIzMDQ2OSAxNTguMjQyMTg4IDUyNy4xNzU3ODEgQyAxMjIuMDg1OTM4IDUwNC4wMDc4MTIgMTYwLjU5Mzc1IDQyOS45OTYwOTQgMTYwLjU5Mzc1IDQyOS45OTYwOTQgQyAxMzguOTEwMTU2IDQ1NS40MTQwNjIgMTIyLjA4NTkzOCA0ODUuNDg0Mzc1IDEyNC41MDc4MTIgNTE3Ljc5Njg3NSBDIDEyNi45MDIzNDQgNTUwLjIzMDQ2OSAxNTAuOTc2NTYyIDU4Mi40OTYwOTQgMjA4Ljc2NTYyNSA1ODQuODU1NDY5IEMgMjY2LjUxMTcxOSA1ODcuMTg3NSAzMDcuNDI5Njg4IDUyOS40MTQwNjIgMzE3LjA5NzY1NiA1MDYuMzEyNSAiLz4KPHBhdGggc3R5bGU9IiBzdHJva2U6bm9uZTtmaWxsLXJ1bGU6ZXZlbm9kZDtmaWxsOnJnYigxMDAlLDEwMCUsMTAwJSk7ZmlsbC1vcGFjaXR5OjE7IiBkPSJNIDYyNS4yNjk1MzEgNDIwLjc2NTYyNSBDIDU4Ni4wNzgxMjUgNDI1LjIxNDg0NCA1NjQuNTM5MDYyIDQ5MS4wMTk1MzEgNTYyLjc5Njg3NSA0OTYuNTMxMjUgQyA1NjMuNzE0ODQ0IDQ5NC4wNzQyMTkgNTY5LjAyNzM0NCA0ODMuNDU3MDMxIDU5Ni4zNzg5MDYgNDY5LjMyNDIxOSBDIDYyNy42OTE0MDYgNDUzLjA3NDIxOSA2OTAuMjQyMTg4IDQ4Ny44Mzk4NDQgNjkwLjI0MjE4OCA0ODcuODM5ODQ0IEMgNjYxLjQwNjI1IDUxMy4yNTc4MTIgNjA4LjM3MTA5NCA1MTUuNTY2NDA2IDU2NS4wNjY0MDYgNTEwLjkwMjM0NCBDIDUyMS43NDYwOTQgNTA2LjIxODc1IDUyNC4xMjUgNDEzLjgyODEyNSA1MjEuNzQ2MDk0IDM0Mi4yMjI2NTYgQyA1MTkuMjg5MDYyIDI3MC41NjY0MDYgNTA0Ljg2NzE4OCAyNzcuNTA3ODEyIDUwNC44NjcxODggMjc3LjUwNzgxMiBDIDUwNC44NjcxODggMjc3LjUwNzgxMiA1MDcuMjgxMjUgMjQ1LjA3MDMxMiA0NzYuMDMxMjUgMzkzLjAyNzM0NCBDIDQ0NC42OTUzMTIgNTQwLjkwMjM0NCAyNzYuMTc5Njg4IDU3Ny44NjcxODggMjc2LjE3OTY4OCA1NzcuODY3MTg4IEMgMzcwLjEwOTM3NSA1OTEuNzk2ODc1IDQzNy40ODQzNzUgNTQ3Ljg3MTA5NCA0NjEuNDg4MjgxIDUwMS42Njc5NjkgQyA0ODUuNjA5Mzc1IDQ1NS40MTQwNjIgNTAyLjM4NjcxOSAzNTguMzMyMDMxIDUwMi4zODY3MTkgMzU4LjMzMjAzMSBDIDUwMi4zODY3MTkgNDk3LjA2NjQwNiA1MTQuNDgwNDY5IDUzMS42OTE0MDYgNTUwLjYxNzE4OCA1NDcuODcxMDk0IEMgNTg2LjczNDM3NSA1NjQuMTI1IDY1Ni41NTQ2ODggNTQwLjk5MjE4OCA3MDcuMTI1IDUyMi40NjQ4NDQgQyA3MzkuMzA0Njg4IDUxMC43MTA5MzggNzc2Ljk0OTIxOSA1MTUuNTY2NDA2IDc3Ni45NDkyMTkgNTE1LjU2NjQwNiBMIDgwNS43OTY4NzUgNDcxLjY3MTg3NSBDIDgwNS43OTY4NzUgNDcxLjY3MTg3NSA3NjQuODMyMDMxIDQ3My45MTc5NjkgNzM2LjAxNTYyNSA0NjIuNDM3NSBDIDcwNy4xMjUgNDUwLjg1OTM3NSA2NjYuMjE4NzUgNDE2LjE4MzU5NCA2MjUuMjY5NTMxIDQyMC43NjU2MjUgIi8+CjwvZz4KPC9zdmc+Cg=="
        alt="Halal Certified"
        loading="lazy"
      >
      <span class="trust-item-label">Halal Certified</span>
    </div>

    <!-- Philippine FDA Registered , official FDA Philippines wordmark -->
    <div class="trust-item trust-item-fda">
      <img
        src="${asset("img/fda-philippines.png")}"
        alt="Philippine FDA Registered"
        loading="lazy"
      >
      <span class="trust-item-label">FDA Registered</span>
    </div>

  </div>`;
}

/** The "What payment methods do you accept?" answer, from the live methods; it names only what is confirmed. */
export function payFaq(methods: HomeModel["pay_methods"]): Markup {
  if (methods?.direct) return html`We accept bank transfer and e-wallet transfer to our store's accounts. You upload your proof of payment at checkout.`;
  if (methods?.xendit) return html`You pay online at checkout on Xendit's secure page, by card (Visa, Mastercard, JCB), e-wallet (GCash, Maya, GrabPay, ShopeePay) or QR Ph.`;
  return html`You choose how to pay at checkout.`;
}

function homeBottom(v: HomeModel): Markup {
  return html`


  <!-- Divider -->
  <div class="trust-divider"></div>

  <!-- Row 2: trust claim statements -->
  <div class="trust-claims-title">Why Families Trust Sant&eacute;</div>
  <div class="trust-claims-row">

    <!-- No. 1 , trophy icon -->
    <div class="trust-claim">
      <span class="trust-claim-icon">
        <svg class="filled" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l2.09 6.26L20 9.27l-4.91 4.73L16.18 20 12 17.27 7.82 20l1.09-6L4 9.27l5.91-.01L12 2z"/>
        </svg>
      </span>
      <span class="trust-claim-text">No. 1 Trusted Barley in the Philippines</span>
    </div>

    <!-- Barley Authority , wheat/grain icon -->
    <div class="trust-claim">
      <span class="trust-claim-icon">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 22V12M12 12C12 12 8 10 8 6a4 4 0 0 1 4-4M12 12C12 12 16 10 16 6a4 4 0 0 0-4-4M9 14c-1.5 0-3-1-3-2.5S7.5 9 9 9M15 14c1.5 0 3-1 3-2.5S16.5 9 15 9M9 18c-1.5 0-3-1-3-2.5S7.5 13 9 13M15 18c1.5 0 3-1 3-2.5S16.5 13 15 13"/>
        </svg>
      </span>
      <span class="trust-claim-text">The Barley Authority</span>
    </div>

    <!-- NZ Sourced , leaf/nature icon -->
    <div class="trust-claim">
      <span class="trust-claim-icon">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M17 8C8 10 5.9 16.17 3.82 19.85M17 8C17 8 21 8.69 21 13.06 21 18 16.73 20 12 20c-4 0-8-1-9.18-3.15M17 8H7c-1.1 0-2 .9-2 2v1"/>
        </svg>
      </span>
      <span class="trust-claim-text">New Zealand-Sourced Barley</span>
    </div>

    <!-- 1M+ Advocates , community/people icon -->
    <div class="trust-claim">
      <span class="trust-claim-icon">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <circle cx="9" cy="7" r="3"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
          <circle cx="17" cy="7" r="2"/><path d="M21 21v-1.5a3 3 0 0 0-2-2.83"/>
        </svg>
      </span>
      <span class="trust-claim-text">Trusted by 1M+ Wellness Advocates Worldwide</span>
    </div>

    <!-- Multiple Countries , globe icon -->
    <div class="trust-claim">
      <span class="trust-claim-icon">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9"/>
          <path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 0 1 3.6 9A15 15 0 0 1 12 21 15 15 0 0 1 8.4 12 15 15 0 0 1 12 3z"/>
        </svg>
      </span>
      <span class="trust-claim-text">Available in Multiple Countries</span>
    </div>

  </div>

</div>

<!-- CATEGORY SPLIT LAYOUT -->
<section class="cat-section">
  <div class="cat-split-inner">

    <!-- 1. Santé Barley ,  text left, image right -->
    <div class="cat-split-row">
      <div class="cat-split-text">
        <span class="cat-split-label">[FLAGSHIP WELLNESS]</span>
        <h2 class="cat-split-title">Sant&eacute; Barley</h2>
        <p class="cat-split-desc">Sant&eacute; Barley is the flagship wellness line of Sant&eacute;, made from certified organic barley grass sourced from New Zealand. Designed for daily nutrition support, it is a simple and convenient way to build a healthier routine for the whole family.</p>
        <ul class="cat-split-bullets">
        <li><span class="cat-split-check">&#10003;</span>Certified organic barley grass from New Zealand</li>
        <li><span class="cat-split-check">&#10003;</span>Available in powder, capsule, and sachet formats</li>
        <li><span class="cat-split-check">&#10003;</span>Supports your daily nutrition and wellness routine</li>
        <li><span class="cat-split-check">&#10003;</span>Convenient for busy professionals and active lifestyles</li>
        <li><span class="cat-split-check">&#10003;</span>A trusted everyday wellness essential for the family</li>
        </ul>
        <a href="/products/" class="cat-split-cta">Explore Sant&eacute; Barley &#8594;</a>
      </div>
      <div class="cat-split-image">
        <picture><source type="image/webp" srcset="${asset("img/category_barley.webp")}"><img class="cat-split-img" src="${asset("img/category_barley.png")}" alt="Sant&eacute; Barley, certified organic barley grass from New Zealand" loading="lazy"></picture>
      </div>
    </div>

    <!-- 2. Santé Special Drinks ,  image left, text right -->
    <div class="cat-split-row reverse">
      <div class="cat-split-text">
        <span class="cat-split-label">[DAILY WELLNESS DRINKS]</span>
        <h2 class="cat-split-title">Sant&eacute; Special Drinks</h2>
        <p class="cat-split-desc">Sant&eacute; Special Drinks bring wellness into your daily favorites. From barley-based coffee to chocolate drinks and functional beverages, this line is made for people who want healthier drink options without giving up taste and convenience.</p>
        <ul class="cat-split-bullets">
        <li><span class="cat-split-check">&#10003;</span>Barley-powered drinks for everyday wellness</li>
        <li><span class="cat-split-check">&#10003;</span>Includes coffee, choco, and specialty drink options</li>
        <li><span class="cat-split-check">&#10003;</span>Easy to include in your morning or workday routine</li>
        <li><span class="cat-split-check">&#10003;</span>Great for professionals, parents, and active individuals</li>
        <li><span class="cat-split-check">&#10003;</span>A more intentional way to enjoy your daily drink habit</li>
        </ul>
        <a href="/products/" class="cat-split-cta">Explore Special Drinks &#8594;</a>
      </div>
      <div class="cat-split-image">
        <picture><source type="image/webp" srcset="${asset("img/category_drinks.webp")}"><img class="cat-split-img" src="${asset("img/category_drinks.png")}" alt="Sant&eacute; Special Drinks, wellness drinks for every day" loading="lazy"></picture>
      </div>
    </div>

    <!-- 3. Santé Essentials ,  text left, image right -->
    <div class="cat-split-row">
      <div class="cat-split-text">
        <span class="cat-split-label">[EVERYDAY HEALTH SUPPORT]</span>
        <h2 class="cat-split-title">Sant&eacute; Essentials</h2>
        <p class="cat-split-desc">Sant&eacute; Essentials is a wellness support line made for everyday health-conscious living. From supplements to functional wellness products, this category helps customers build simple habits that support an active and balanced lifestyle.</p>
        <ul class="cat-split-bullets">
        <li><span class="cat-split-check">&#10003;</span>Daily wellness essentials for modern lifestyles</li>
        <li><span class="cat-split-check">&#10003;</span>Includes supplements and functional support products</li>
        <li><span class="cat-split-check">&#10003;</span>Made for families, professionals, and active individuals</li>
        <li><span class="cat-split-check">&#10003;</span>Helps make healthy routines easier and more consistent</li>
        <li><span class="cat-split-check">&#10003;</span>Practical wellness support for everyday living</li>
        </ul>
        <a href="/products/" class="cat-split-cta">Explore Sant&eacute; Essentials &#8594;</a>
      </div>
      <div class="cat-split-image">
        <picture><source type="image/webp" srcset="${asset("img/category_essential.webp")}"><img class="cat-split-img" src="${asset("img/category_essential.png")}" alt="Sant&eacute; Essentials, everyday health support products" loading="lazy"></picture>
      </div>
    </div>

    <!-- 4. Santé Beauty ,  image left, text right -->
    <div class="cat-split-row reverse">
      <div class="cat-split-text">
        <span class="cat-split-label">[BEAUTY FROM WITHIN]</span>
        <h2 class="cat-split-title">Sant&eacute; Beauty</h2>
        <p class="cat-split-desc">Sant&eacute; Beauty combines wellness and self-care through beauty-focused products designed to support a glowing, confident lifestyle. With collagen and barley-powered formulations, this line is made for customers who believe beauty starts from within.</p>
        <ul class="cat-split-bullets">
        <li><span class="cat-split-check">&#10003;</span>Beauty and wellness products for daily self-care</li>
        <li><span class="cat-split-check">&#10003;</span>Includes collagen and barley-powered beauty support</li>
        <li><span class="cat-split-check">&#10003;</span>Designed for healthy, radiant, and confident living</li>
        <li><span class="cat-split-check">&#10003;</span>Perfect for beauty-conscious and wellness-focused customers</li>
        <li><span class="cat-split-check">&#10003;</span>Helps support a consistent beauty-from-within routine</li>
        </ul>
        <a href="/products/" class="cat-split-cta">Explore Sant&eacute; Beauty &#8594;</a>
      </div>
      <div class="cat-split-image">
        <picture><source type="image/webp" srcset="${asset("img/category_beauty.webp")}"><img class="cat-split-img" src="${asset("img/category_beauty.png")}" alt="Sant&eacute; Beauty, collagen and barley-powered beauty products" loading="lazy"></picture>
      </div>
    </div>

  </div>
</section>

<!-- ABOUT -->
<section class="section about-section" id="about">
  <div class="section-inner">

    <h2 class="about-heading">We are the <span>Barley Authority</span></h2>

    <!-- Tab Buttons -->
    <div class="about-tabs">
      <button class="about-tab active" data-about-panel="tab-our-story">
        <span class="about-tab-icon">🌿</span> Our Story
        <span class="about-tab-progress"></span>
      </button>
      <button class="about-tab" data-about-panel="tab-trusted">
        <span class="about-tab-icon">🛡️</span> Trusted Since 2007
        <span class="about-tab-progress"></span>
      </button>
      <button class="about-tab" data-about-panel="tab-biogro">
        <span class="about-tab-icon">🌱</span> Biogro New Zealand
        <span class="about-tab-progress"></span>
      </button>
      <button class="about-tab" data-about-panel="tab-global">
        <span class="about-tab-icon">🌐</span> Global Standard
        <span class="about-tab-progress"></span>
      </button>
    </div>

    <!-- Panel 1: Our Story -->
    <div class="about-panel active" id="tab-our-story">
      <div class="about-panel-img">
        <picture><source type="image/webp" srcset="${asset("img/about_1.webp")}"><img src="${asset("img/about_1.png")}" alt="Our Story" width="1549" height="1015" loading="lazy"></picture>
      </div>
      <div class="about-panel-body">
        <h3>More Than a <span>Wellness Brand</span></h3>
        <p>Sant&eacute; International was built on one simple idea: quality wellness should be accessible to every Filipino family. Since we started, we've been creating products that support healthier, more active, more energized lives, without compromising on quality or safety.</p>
        <p>Today, Sant&eacute; has grown into a global wellness brand with a presence in more than 20 countries. But our heart is still here, with Filipino families, busy professionals, and health-conscious individuals who trust us every single day.</p>
      </div>
    </div>

    <!-- Panel 2: Trusted Since 2007 -->
    <div class="about-panel" id="tab-trusted">
      <div class="about-panel-img">
        <picture><source type="image/webp" srcset="${asset("img/about_2.webp")}"><img src="${asset("img/about_2.png")}" alt="Trusted Since 2007" width="1549" height="1015" loading="lazy"></picture>
      </div>
      <div class="about-panel-body">
        <h3><span>Trusted</span> Since 2007</h3>
        <p>Since 2007, Sant&eacute; has led the way in popularizing barley grass in the Philippines, setting the standard for quality and trust. With years of experience and loyal customers nationwide, we continue to define what true barley expertise means.</p>
        <p>Our commitment to quality has never wavered — from our first sachet to the millions we produce today, every product carries the same promise of purity, safety, and effectiveness.</p>
      </div>
    </div>

    <!-- Panel 3: Biogro New Zealand -->
    <div class="about-panel" id="tab-biogro">
      <div class="about-panel-img">
        <picture><source type="image/webp" srcset="${asset("img/about_3.webp")}"><img src="${asset("img/about_3.png")}" alt="Biogro New Zealand" width="1549" height="1015" loading="lazy"></picture>
      </div>
      <div class="about-panel-body">
        <h3><span>Biogro</span> Certified Barley Source</h3>
        <p>Our barley is grown and certified in New Zealand under BioGro standards, giving you full confidence that every leaf is nurtured in clean soil, pure air, and carefully protected environments.</p>
        <p>BioGro is New Zealand's leading organic certification body. This certification means our barley grass is free from synthetic pesticides, herbicides, and GMOs — only the purest organic farming practices are used.</p>
      </div>
    </div>

    <!-- Panel 4: Global Standard -->
    <div class="about-panel" id="tab-global">
      <div class="about-panel-img">
        <picture><source type="image/webp" srcset="${asset("img/about_4.webp")}"><img src="${asset("img/about_4.png")}" alt="Global Standard" width="1549" height="1015" loading="lazy"></picture>
      </div>
      <div class="about-panel-body">
        <h3><span>Global</span> Standard, Local Impact</h3>
        <p>From New Zealand farms to homes around the world, Sant&eacute; follows strict global quality benchmarks so every serving of barley meets the same high standard — no matter where you enjoy it.</p>
        <p>We are present in more than 20 countries, and every market we serve receives the same internationally-certified, premium-quality product that Filipino families have trusted since 2007.</p>
      </div>
    </div>

  </div>
</section>

<!-- TESTIMONIALS -->
<section class="section testimonials-section">
  <div class="section-inner">
    <div class="section-header">
      <span class="section-label">Customer Stories</span>
      <h2 class="section-title">Real People, Real Results</h2>
      <p class="section-subtitle">Here's what our customers say about making Sant&eacute; part of their daily routine.</p>
    </div>
    <div class="testimonials-grid">
      <div class="tcard">
        <div class="tcard-quote">&ldquo;</div>
        <div class="tcard-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
        <p class="tcard-text">I've been taking Sant&eacute; Barley for two years now and it's become part of my daily routine. I feel more energized in the morning and my digestion has really improved. Highly recommend it to anyone looking for a simple wellness habit.</p>
        <div class="tcard-author">
          <div class="tcard-avatar">M</div>
          <div>
            <div class="tcard-name">Maria D.</div>
            <div class="tcard-loc">Quezon City</div>
          </div>
        </div>
      </div>
      <div class="tcard">
        <div class="tcard-quote">&ldquo;</div>
        <div class="tcard-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
        <p class="tcard-text">Sinubukan ko ang Sant&eacute; Barley dahil sa rekomendasyon ng isang kaibigan, at hindi ako nagdamot ng piso. After a month, mas maliksi na ako sa trabaho. It's now a staple in our household.</p>
        <div class="tcard-author">
          <div class="tcard-avatar">R</div>
          <div>
            <div class="tcard-name">Rico M.</div>
            <div class="tcard-loc">Cebu City</div>
          </div>
        </div>
      </div>
      <div class="tcard">
        <div class="tcard-quote">&ldquo;</div>
        <div class="tcard-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
        <p class="tcard-text">I got the Fit N Trim for my weight management goals and paired it with regular walks. After two months, I can see a real difference. Love that it's natural, and the brand has been around for so long. Feels safe and trustworthy.</p>
        <div class="tcard-author">
          <div class="tcard-avatar">J</div>
          <div>
            <div class="tcard-name">Jen B.</div>
            <div class="tcard-loc">Makati City</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile swipe dots -->
    <div class="testimonial-mobile-dots">
      <span class="active"></span>
      <span></span>
      <span></span>
    </div>

  </div>
</section>

<!-- LOOKBOOK -->
<section class="section lookbook-section">
  <div class="section-inner">
    <div class="section-header">
      <span class="section-label">Wellness Lifestyle</span>
      <h2 class="section-title">Sant&eacute; Fits Into Your Day, Every Day</h2>
      <p class="section-subtitle">Simple wellness habits that work with your real life, not against it.</p>
    </div>
    <div class="lookbook-grid">

      <div class="lookbook-card">
        <div class="lookbook-img-wrap">
          <picture><source type="image/webp" srcset="${asset("img/blog_1.webp")}"><img class="lookbook-bg" src="${asset("img/blog_1.png")}" alt="Morning Wellness Routine" loading="lazy"></picture>
        </div>
        <div class="lookbook-caption">
          <div class="lookbook-title">Morning Wellness Routine</div>
          <div class="lookbook-text">Start your day with Sant&eacute; Barley. One sachet, warm water, and you've already taken the best step for your health. Simple, consistent, effective.</div>
        </div>
      </div>

      <div class="lookbook-card">
        <div class="lookbook-img-wrap">
          <picture><source type="image/webp" srcset="${asset("img/blog_2.webp")}"><img class="lookbook-bg" src="${asset("img/blog_2.png")}" alt="Workday Energy Support" loading="lazy"></picture>
        </div>
        <div class="lookbook-caption">
          <div class="lookbook-title">Workday Energy Support</div>
          <div class="lookbook-text">Long hours at the office? Sant&eacute; Fusion Coffee keeps you going — smooth, rich coffee with the wellness boost of organic barley grass.</div>
        </div>
      </div>

      <div class="lookbook-card">
        <div class="lookbook-img-wrap">
          <picture><source type="image/webp" srcset="${asset("img/blog_3.webp")}"><img class="lookbook-bg" src="${asset("img/blog_3.png")}" alt="Active Lifestyle Support" loading="lazy"></picture>
        </div>
        <div class="lookbook-caption">
          <div class="lookbook-title">Active Lifestyle Support</div>
          <div class="lookbook-text">Para sa mga runners at gym-goers: Sant&eacute; supports your body from the inside. Fuel your workouts and recover better with daily wellness habits.</div>
        </div>
      </div>

    </div>

    <!-- Mobile blog carousel dots -->
    <div class="blog-mobile-dots">
      <span class="active"></span>
      <span></span>
      <span></span>
    </div>

  </div>
</section>

<!-- FAQ -->
<section class="section faq-section" id="faq">
  <div class="section-inner">
    <div class="section-header">
      <span class="section-label">Got Questions?</span>
      <h2 class="section-title">Common Questions, Honest Answers</h2>
    </div>
        <div class="faq-list">

      <div class="faq-item">
        <div class="faq-q" data-faq-toggle>
          What is Sant&eacute; Barley and what's it made from?
          <span class="faq-icon">+</span>
        </div>
        <div class="faq-a">Sant&eacute; Barley is made from premium young barley grass — one of the most nutrient-rich green plants in the world. It's harvested at peak nutrition, carefully processed to preserve its natural goodness, and available as a convenient powder or capsule for your daily routine.</div>
      </div>

      <div class="faq-item">
        <div class="faq-q" data-faq-toggle>
          How do I take Sant&eacute; Barley Powder?
          <span class="faq-icon">+</span>
        </div>
        <div class="faq-a">Mix one sachet with 200 to 250ml of water — warm or cold — and drink once or twice daily. For best absorption, take it on an empty stomach in the morning. You can also blend it into your favorite smoothie or juice.</div>
      </div>

      <div class="faq-item">
        <div class="faq-q" data-faq-toggle>
          Is Sant&eacute; Barley safe for children and pregnant women?
          <span class="faq-icon">+</span>
        </div>
        <div class="faq-a">Sant&eacute; Barley is made from pure organic barley grass and is generally considered safe. We recommend consulting your pediatrician for children under 12, and your OB-GYN if you are pregnant or breastfeeding before starting any supplement.</div>
      </div>

      <div class="faq-item">
        <div class="faq-q" data-faq-toggle>
          How long before I notice any difference?
          <span class="faq-icon">+</span>
        </div>
        <div class="faq-a">Many customers feel more energized and supported within 2 to 4 weeks of consistent daily use. Results vary per person. Sant&eacute; products are designed to complement a healthy lifestyle — not replace medical care.</div>
      </div>

      <div class="faq-item">
        <div class="faq-q" data-faq-toggle>
          Do you ship nationwide in the Philippines?
          <span class="faq-icon">+</span>
        </div>
        <div class="faq-a">Yes! Sant&eacute; ships to all major cities and provinces across the Philippines. Orders are processed within 1 to 2 business days and delivered within 3 to 7 days depending on your location.</div>
      </div>

      <div class="faq-item">
        <div class="faq-q" data-faq-toggle>
          What payment methods do you accept?
          <span class="faq-icon">+</span>
        </div>
        <div class="faq-a">${payFaq(v.pay_methods)}</div>
      </div>

    </div></div>
  </div>
</section>

<section class="section contact-section" id="contact" style="background: var(--bg); padding: 88px 40px;">
  <div class="section-inner">
    <div class="contact-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: start; max-width: 1100px; margin: 0 auto;">

      <div class="contact-info">
        <h2 style="font-size: 36px; font-weight: 800; color: var(--green-dark); margin-bottom: 36px; line-height: 1.2;">Contact Information</h2>

        
        ${v.dist ? html`
        <div class="dist-card">
          ${v.dist.photo ? html`<div class="dist-photo"><img src="/distributor-photo/" alt="${v.dist.name}" width="64" height="64"></div>` : html`<div class="dist-photo" aria-hidden="true">${v.dist.initials}</div>`}
          <div class="dist-text">
            <div class="dist-label">Official Distributor of Sant&eacute; Barley</div>
            <div class="dist-name">${v.dist.name}</div>
            ${v.dist.tel ? html`<a class="dist-phone" href="tel:${v.dist.tel}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${v.dist.phone}</a>` : ""}
          </div>
          ${v.dist.tel ? html`<a class="dist-call" href="tel:${v.dist.tel}" aria-label="Call ${v.dist.name}">Call now</a>` : ""}
        </div><!-- /dist-card -->
        ` : ""}

        <div style="display: flex; flex-direction: column; gap: 28px;">

          <div style="display: flex; align-items: flex-start; gap: 18px;">
            <div style="width: 44px; height: 44px; background: #e8f5e9; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00783A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <div>
              <div style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-light); margin-bottom: 6px;">Office Location</div>
              <div style="font-size: 15px; color: var(--text-secondary); line-height: 1.6;">Sant&eacute; Headquarters, Eton Cyberpod,<br>Ortigas Center, Manila, Philippines</div>
            </div>
          </div>

${v.biz.contact_email ? html`          <div style="display: flex; align-items: flex-start; gap: 18px;">
            <div style="width: 44px; height: 44px; background: #e8f5e9; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00783A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <div>
              <div style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-light); margin-bottom: 6px;">Email Us</div>
              <a href="mailto:${v.biz.contact_email}" style="display: block; font-size: 15px; color: var(--green); font-weight: 600; text-decoration: underline; margin-bottom: 4px;">${v.biz.contact_email}</a>
            </div>
          </div>
` : ""}        </div>

        <div style="margin-top: 40px;">
          <div style="font-size: 18px; font-weight: 700; color: var(--green-dark); margin-bottom: 18px;">Follow Our Journey</div>
          <div style="display: flex; gap: 14px;">
            <a href="https://www.facebook.com/SanteOrganicBarleyShopOfficial" target="_blank" rel="noopener noreferrer" aria-label="Follow Sant&eacute; Organic Barley Shop on Facebook" class="contact-social-link social-fb" style="width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>
            ${v.socials.instagram ? html`
            <a href="${v.socials.instagram}" target="_blank" rel="noopener noreferrer" aria-label="Follow us on Instagram" class="contact-social-link social-ig" style="width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            </a>
            ` : ""}
            ${v.socials.tiktok ? html`
            <a href="${v.socials.tiktok}" target="_blank" rel="noopener noreferrer" aria-label="Follow us on TikTok" class="contact-social-link social-tt" style="width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>
            </a>
            ` : ""}
          </div>
        </div>
      </div>

      <div class="contact-form-wrap" id="contact-form" style="background: white; border-radius: 24px; padding: 40px; box-shadow: 0 8px 40px rgba(0,0,0,0.08); border: 1px solid var(--border);">
        <h3 style="font-size: 24px; font-weight: 800; color: var(--green-dark); margin-bottom: 8px;">Send a Message</h3>
        <p style="font-size: 14px; color: var(--text-light); margin-bottom: 28px;">We typically respond within 2-4 hours.</p>

        
        <form method="post" action="${v.contact_path}" novalidate style="display: flex; flex-direction: column; gap: 16px;">
          <div aria-hidden="true" style="position:absolute; left:-10000px; width:1px; height:1px; overflow:hidden;"><label>Leave this field empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div>
              <input type="text" name="name" value="${v.cf.values.name}" placeholder="Your Name" aria-label="Your Name" maxlength="120" style="width: 100%; padding: 14px 16px; border: 1.5px solid ${v.cf.errors.name ? html`#d33d44` : html`var(--border)`}; border-radius: 10px; font-size: 14px; font-family: var(--font); outline: none; transition: border 0.2s; background: #fafafa;">
              ${v.cf.errors.name ? html`<div class="sf-contact-error">${v.cf.errors.name}</div>` : ""}
            </div>
            <div>
              <input type="email" name="email" value="${v.cf.values.email}" placeholder="Email Address" aria-label="Email Address" maxlength="254" style="width: 100%; padding: 14px 16px; border: 1.5px solid ${v.cf.errors.email ? html`#d33d44` : html`var(--border)`}; border-radius: 10px; font-size: 14px; font-family: var(--font); outline: none; transition: border 0.2s; background: #fafafa;">
              ${v.cf.errors.email ? html`<div class="sf-contact-error">${v.cf.errors.email}</div>` : ""}
            </div>
          </div>
          <div>
            <input type="text" name="subject" value="${v.cf.values.subject}" placeholder="Subject Topic" aria-label="Subject Topic" maxlength="200" style="width: 100%; padding: 14px 16px; border: 1.5px solid ${v.cf.errors.subject ? html`#d33d44` : html`var(--border)`}; border-radius: 10px; font-size: 14px; font-family: var(--font); outline: none; transition: border 0.2s; background: #fafafa;">
            ${v.cf.errors.subject ? html`<div class="sf-contact-error">${v.cf.errors.subject}</div>` : ""}
          </div>
          <div>
            <textarea name="message" placeholder="How can we help you?" aria-label="How can we help you?" rows="5" maxlength="4000" style="width: 100%; padding: 14px 16px; border: 1.5px solid ${v.cf.errors.message ? html`#d33d44` : html`var(--border)`}; border-radius: 10px; font-size: 14px; font-family: var(--font); outline: none; resize: vertical; transition: border 0.2s; background: #fafafa;">${v.cf.values.message}</textarea>
            ${v.cf.errors.message ? html`<div class="sf-contact-error">${v.cf.errors.message}</div>` : ""}
          </div>
          <button type="submit" style="background: var(--green); color: white; border: none; padding: 16px; border-radius: 10px; font-size: 15px; font-weight: 700; font-family: var(--font); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: background 0.2s;">
            <span>SEND MESSAGE</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
          ${v.cf.sent ? html`<p class="sf-contact-status" role="status" style="color: var(--green);">Thanks! Your message has been sent &mdash; we'll get back to you shortly.</p>` : ""}
          ${v.cf.note ? html`<p class="sf-contact-status" role="status" style="color: #d33d44;">${v.cf.note}</p>` : ""}
        </form>
      </div>

    </div>
  </div>
</section>



<div class="sales-popup" id="salesPopup" hidden>
  <div class="sales-popup-icon">
    <!-- Cart icon -->
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
    <div class="sales-popup-badge">
      <!-- Check icon -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
  </div>
  <div class="sales-popup-body">
    <div class="sales-popup-name" id="salesName"></div>
    <div class="sales-popup-product" id="salesProduct"></div>
    <div class="sales-popup-time" id="salesTime"></div>
  </div>
  <button class="sales-popup-close">&#x2715;</button>
</div>
</main>

${storeFooter(v)}
${storeDrawer(v)}
<script src="${asset("js/pack-home.js")}"></script>
<script src="${asset("js/pack-store.js")}"></script>
<script src="${asset("js/contact-form.js")}"></script>
${chatWidgetScript(v.store_name)}
${v.tracking ?? ""}
</body>
</html>
`;
}

export function homeDocument(v: HomeModel): Markup {
  return html`${homeTop(v)}${trustBadges()}${homeBottom(v)}`;
}
