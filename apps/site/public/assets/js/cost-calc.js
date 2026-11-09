/* "Build it yourself" calculator on the home page. Pure arithmetic on the visitor's own inputs; nothing is sent anywhere. */
(function () {
  var form = document.querySelector("[data-diy-calc]");
  if (!form) return;
  var TOOLS_PER_MONTH = 5559;      /* the monthly tool bill listed beside the calculator */
  var WEEKS_PER_MONTH = 4.33;
  var PLAN_PER_YEAR = 24990;       /* NegosyoOnline Annual Plan, for the "years of the plan" line */
  var $ = function (id) { return document.getElementById(id); };
  var hours = $("diy-hours"), months = $("diy-months");

  function peso(n) { return "PHP " + Math.round(n).toLocaleString("en-PH"); }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  function update() {
    var h = Number(hours.value), m = Number(months.value);
    var picked = form.querySelector('input[name="diy-rate"]:checked');
    var rate = picked ? Number(picked.value) : 500;
    var time = h * WEEKS_PER_MONTH * m * rate;
    var cash = TOOLS_PER_MONTH * m;
    var total = time + cash;
    $("diy-hours-out").textContent = plural(h, "hour");
    $("diy-months-out").textContent = plural(m, "month");
    $("diy-time").textContent = peso(time);
    $("diy-cash").textContent = peso(cash);
    $("diy-total").textContent = peso(total);
    var years = total / PLAN_PER_YEAR;
    $("diy-years").innerHTML = "That equals <strong>" + (years >= 10 ? Math.round(years) : years.toFixed(1)) +
      " years</strong> of NegosyoOnline at " + peso(PLAN_PER_YEAR) + " a year on the Annual Plan.";
  }

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", function (e) { e.preventDefault(); });
  update();
})();
