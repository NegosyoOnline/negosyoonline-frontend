/* Dashboard theme. Follows the device (prefers-color-scheme); the account menu's theme toggle stores a per-device override in
   localStorage "no_dash_theme". Loaded synchronously in <head> before dash.css so the first paint has the right theme.
   Every storage access is guarded: when storage is blocked the device value is used and the switch works for this view. */
(function () {
  var KEY = "no_dash_theme", root = document.documentElement, override = null, mq = null, hear = [];
  function valid(v) { return v === "dark" || v === "light" ? v : null; }
  try { override = valid(localStorage.getItem(KEY)); } catch (e) { override = null; }
  try { mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null; } catch (e) { mq = null; }
  function resolved() { return override || (mq && mq.matches ? "dark" : "light"); }
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
  if (mq) {
    var onDevice = function () { if (!override) apply(); };
    if (mq.addEventListener) mq.addEventListener("change", onDevice); else if (mq.addListener) mq.addListener(onDevice);
  }
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
