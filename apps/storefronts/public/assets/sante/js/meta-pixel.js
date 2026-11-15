/* Meta Pixel for the home, landing and checkout pages (src/lib/meta.ts). Plain ES5, no inline code.

   Two jobs:
   1. The tracking notice (#no-meta-notice), a blocking popup (adapted from TWCinc app/static/plugins/twc_cookie_consent.js):
      no way to dismiss it (Esc does nothing, no backdrop click), focus stays in the card, the page cannot scroll behind
      it. Accept or Decline writes the one first-party choice cookie and loads the
      page again (without ?cookie-settings=1, the footer link that reopens this notice, so a choice made there takes
      effect on a clean page: after Decline nothing more goes to Meta). Nothing of Meta's loads before Accept.
   2. After Accept the page carries the JSON data block #no-meta ({pixel_id, checkout, events:[{name,id,data}]}). This
      file loads Meta's fbevents.js, initialises the Pixel and tracks each listed event with its eventID, the same id
      the server sent to Django, so Meta pairs the browser and the server event. Purchase appears only on the onboarding
      verify page, once per order, when Django said it was the first time (src/lib/meta.ts onboardingPurchase). */
(function () {
  "use strict";

  var notice = document.getElementById("no-meta-notice");
  if (notice) {
    var choose = function (value) {
      var name = notice.getAttribute("data-cookie") || "";
      var maxAge = parseInt(notice.getAttribute("data-max-age") || "0", 10);
      if (!/^(__Host-)?no_meta_consent$/.test(name) || !(maxAge > 0)) return;
      var secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = name + "=" + value + "; Path=/; Max-Age=" + maxAge + "; SameSite=Lax" + secure;
      var search = window.location.search.replace(/([?&])cookie-settings=[^&]*(&|$)/, function (m, a, b) {
        return b ? a : "";
      });
      if (search === window.location.search) window.location.reload();
      else window.location.assign(window.location.pathname + search + window.location.hash);
    };
    var card = notice.querySelector("[role=dialog]");
    var ring = "0 0 0 3px #6C8CFF"; /* light blue, as the dashboard's focus rings; never gold */
    var controls = notice.querySelectorAll("button, a[href]");
    var setRing = function (el, on) {
      el.style.boxShadow = on ? ring : "";
      el.style.outline = "none";
    };
    for (var c = 0; c < controls.length; c++) {
      controls[c].addEventListener("focus", function (event) { setRing(event.currentTarget, true); });
      controls[c].addEventListener("blur", function (event) { setRing(event.currentTarget, false); });
    }
    var htmlEl = document.documentElement;
    if (htmlEl && htmlEl.style) htmlEl.style.overflow = "hidden";
    if (document.body && document.body.style) document.body.style.overflow = "hidden";
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" || event.key === "Esc") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab" || controls.length === 0) return;
      var first = controls[0];
      var last = controls[controls.length - 1];
      var active = document.activeElement;
      var inside = card && active && card.contains(active);
      if (event.shiftKey && (active === first || active === card || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    });
    document.addEventListener("focusin", function (event) {
      if (card && !card.contains(event.target)) card.focus();
    });
    if (card) card.focus(); /* the card, never the heading: a title is not made focusable */
    var buttons = notice.querySelectorAll("[data-meta-choice]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function (event) {
        choose(event.currentTarget.getAttribute("data-meta-choice") === "1" ? "1" : "0");
      });
    }
  }

  var block = document.getElementById("no-meta");
  if (!block) return;
  var data;
  try {
    data = JSON.parse(block.textContent || "");
  } catch (e) {
    return;
  }
  if (!data || typeof data.pixel_id !== "string" || !/^[0-9]{8,20}$/.test(data.pixel_id)) return;
  if (window.fbq) return;

  var fbq = (window.fbq = function () {
    if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
    else fbq.queue.push(arguments);
  });
  if (!window._fbq) window._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];

  var loader = document.createElement("script");
  loader.async = true;
  loader.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(loader);

  /* On the checkout page Meta's automatic form reading stays off, so the typed email and mobile are never scraped. */
  if (data.checkout === true) fbq("set", "autoConfig", false, data.pixel_id);
  fbq("init", data.pixel_id);

  var events = data.events instanceof Array ? data.events : [];
  for (var j = 0; j < events.length; j++) {
    var item = events[j];
    if (!item || typeof item.name !== "string" || typeof item.id !== "string") continue;
    if (item.name !== "PageView" && item.name !== "ViewContent" && item.name !== "InitiateCheckout" && item.name !== "Purchase") continue;
    fbq("track", item.name, item.data && typeof item.data === "object" ? item.data : {}, { eventID: item.id });
  }
})();
