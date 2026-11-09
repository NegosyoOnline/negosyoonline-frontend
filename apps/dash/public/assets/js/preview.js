/* TEMPORARY staging preview. Remove this file and its <script> tag in index.html once sign-in works
   against the NegosyoOnline API.

   The API has no sign-in yet, so without this the dashboard always leaves for the public site. On the
   preview hosts only, this lets the dashboard open with a placeholder account and sample data, so the
   UI can be reviewed. API calls are answered here and never reach the network: reads get the sample
   answers below (a site in its free trial with nothing filled in), and everything else, including
   every save, gets a 404 ("not available yet"). The sample answers follow the shapes the TWCinc API
   returns. On any other host this file does nothing. It holds no secrets and shows no real data. */
(function () {
  var PREVIEW_HOSTS = ["dash-staging.negosyonline.com", "localhost", "127.0.0.1"];
  if (PREVIEW_HOSTS.indexOf(location.hostname) === -1) return;

  var cfg = window.NO_CONFIG || {};
  var apiBase = cfg.apiBase || "";
  if (!apiBase || typeof window.fetch !== "function") return;

  try { if (!localStorage.getItem("no_dash_token")) localStorage.setItem("no_dash_token", "preview"); } catch (e) { /* private mode */ }

  var SITE = 1, NAME = "My Business", DAY = 86400000;
  function iso(ms) { return new Date(ms).toISOString(); }
  function trialStart() { return Date.now() - DAY + 3 * 3600000; }
  function trialEnd() { return trialStart() + 14 * DAY; }

  function overview() {
    return {
      site: { id: SITE, business_name: NAME },
      subscription: { state: "trial_active", trial_start_at: iso(trialStart()), trial_end_at: iso(trialEnd()),
        trial_days_left: Math.max(0, Math.ceil((trialEnd() - Date.now()) / DAY)), attention_started_at: null,
        cancelled_at: null, service_end_at: null, download_until: null, reactivate_until: null },
      plan: { name: "NegosyoOnline Subscription", interval: "monthly", price: "2499.00", currency: "PHP" },
      rates: { bytes_per_gb: 1000000000, orders: { included: 1000, unit_price: "5.00" },
        storage: { included_gb: 5, unit_price: "30.00" }, video: { included_gb: 50, unit_price: "10.00" } },
      current_cycle: null, usage: null,
      billing_profile: { company: "", tin: "", mobile: "", email: "", line1: "", barangay: "", city: "", province: "", zip: "" },
      payments_available: true, collection_enabled: true, statements_enabled: true, as_of: iso(Date.now())
    };
  }
  function payment() {
    return { site_id: SITE, state: "trial_active", payment_method: null, recovery: null,
      next_charge: { kind: "first", date: iso(trialEnd()), base_amount: "2499.00", usage_amount: "0.00", total_amount: "2499.00", currency: "PHP" },
      recent_attempts: [] };
  }

  /* GET answers by path. A function is called per request so dates stay current. */
  var ANSWERS = {
    "/me/": { first_name: "Preview", last_name: "User", email: "preview@example.com", email_verified: true, trial_status: "trial_active", site_name: "" },
    "/dashboard/": {},
    "/sites/": { sites: [{ id: SITE, display_name: NAME, subdomain: "mybusiness" }] },
    "/sites/1/": { id: SITE, display_name: NAME, subdomain: "mybusiness", settings: {} },
    "/sites/1/business-profile/": { shipping_estimates_confirmed: false },
    "/billing/sites/": function () { return { sites: [{ id: SITE, business_name: NAME, state: "trial_active", created_at: iso(trialStart()) }], has_more: false }; },
    "/billing/sites/1/overview/": overview,
    "/billing/sites/1/payment/": payment,
    "/billing/sites/1/statements/": { statements: [], has_more: false }
  };

  function json(status, data) {
    return new Response(JSON.stringify(data), { status: status, headers: { "Content-Type": "application/json" } });
  }

  /* The real API answers over the network, long after every script on the page has loaded, and the
     dashboard relies on that. Answers here wait for the page load too, plus a short pause. */
  var loaded = new Promise(function (resolve) {
    if (document.readyState === "complete") resolve(); else window.addEventListener("load", function () { resolve(); });
  });
  function later(make) {
    return loaded.then(function () { return new Promise(function (resolve) { setTimeout(function () { resolve(make()); }, 120); }); });
  }

  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.indexOf(apiBase) !== 0) return realFetch(input, init);
    var path = url.slice(apiBase.length).split("?")[0];
    var method = ((init && init.method) || "GET").toUpperCase();
    return later(function () {
      if (method === "GET" && Object.prototype.hasOwnProperty.call(ANSWERS, path)) {
        var answer = ANSWERS[path];
        return json(200, typeof answer === "function" ? answer() : answer);
      }
      return json(404, { message: "Not available in the staging preview yet." });
    });
  };
})();
