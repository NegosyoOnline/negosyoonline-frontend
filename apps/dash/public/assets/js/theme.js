/* Dashboard theme. Opens in dark on every device, whatever the device's own light or dark setting (Coach Ed's ruling,
   2026-11-10, z8uq9mach5); the theme toggle stores a per-browser choice in localStorage "no_dash_theme", and a saved choice wins.
   Loaded synchronously in <head> before dash.css so the first paint has the right theme.
   Every storage access is guarded: when storage is blocked the dashboard opens in dark and the switch works for this view. */
(function () {
  var KEY = "no_dash_theme", DEFAULT = "dark", root = document.documentElement, override = null, hear = [];
  function valid(v) { return v === "dark" || v === "light" ? v : null; }
  try { override = valid(localStorage.getItem(KEY)); } catch (e) { override = null; }
  function resolved() { return override || DEFAULT; }
  function sync() {
    var t = resolved(), btns = document.querySelectorAll("[data-theme-choice]");
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute("aria-pressed", String(btns[i].getAttribute("data-theme-choice") === t));
  }
  function apply() {
    var t = resolved();
    root.dataset.theme = t;
    root.style.colorScheme = t;
    sync();
    for (var i = 0; i < hear.length; i++) { try { hear[i](t); } catch (e) { /* a listener must not break theming */ } }
  }
  apply();
  function choose(t) {
    override = t;
    try { localStorage.setItem(KEY, t); } catch (e) { /* storage blocked: this page view only */ }
    apply();
  }
  /* Small API for the account menu: current() is the resolved theme, set() stores the override, onChange() hears every change. */
  window.NODashTheme = { current: resolved, set: function (t) { if (valid(t)) choose(t); },
    onChange: function (fn) { hear.push(fn); } };
  function bind() {
    var btns = document.querySelectorAll("[data-theme-choice]");
    for (var i = 0; i < btns.length; i++) {
      (function (b) { b.addEventListener("click", function () { var v = valid(b.getAttribute("data-theme-choice")); if (v) choose(v); }); })(btns[i]);
    }
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();
})();
