/* TEMPORARY staging preview. Remove this file and its <script> tag in index.html once sign-in works
   against the NegosyoOnline API.

   The API has no sign-in yet, so without this the dashboard always leaves for the public site. On the
   preview hosts only, this lets the dashboard open with a placeholder account and no data, so the UI
   can be reviewed. API calls are answered here and never reach the network: /me/ gets the placeholder
   account, /dashboard/ gets an empty answer, and everything else gets a 404 ("not available yet").
   On any other host this file does nothing. It holds no secrets and shows no real data. */
(function () {
  var PREVIEW_HOSTS = ["dash-staging.negosyonline.com", "localhost", "127.0.0.1"];
  if (PREVIEW_HOSTS.indexOf(location.hostname) === -1) return;

  var cfg = window.NO_CONFIG || {};
  var apiBase = cfg.apiBase || "";
  if (!apiBase || typeof window.fetch !== "function") return;

  try { if (!localStorage.getItem("no_dash_token")) localStorage.setItem("no_dash_token", "preview"); } catch (e) { /* private mode */ }

  var ANSWERS = {
    "/me/": { first_name: "Preview", last_name: "User", email: "preview@example.com", email_verified: true, trial_status: "trial_active", site_name: "" },
    "/dashboard/": {}
  };

  function json(status, data) {
    return new Response(JSON.stringify(data), { status: status, headers: { "Content-Type": "application/json" } });
  }

  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.indexOf(apiBase) !== 0) return realFetch(input, init);
    var path = url.slice(apiBase.length).split("?")[0];
    var method = ((init && init.method) || "GET").toUpperCase();
    if (method === "GET" && Object.prototype.hasOwnProperty.call(ANSWERS, path)) return Promise.resolve(json(200, ANSWERS[path]));
    return Promise.resolve(json(404, { message: "Not available in the staging preview yet." }));
  };
})();
