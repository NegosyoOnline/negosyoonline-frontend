/* The Reconciliation page: each recorded invoice against its payment, statement and adjustments (Billing HQ-F2, ClickUp
   z8uq9memvq, plan section 4.5). Read only. An optional first and last issue date (YYYY-MM-DD) narrow it; empty
   means every invoice. The backend does not page, so the page says how many rows it shows. On a phone the table is
   stacked rows. An exception this page has no words for is left out: a raw value is never shown. */
(function () {
  var H = window.NOHq, F = window.NOFin, $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["boot", "v-main", "v-closed", "v-down"];
  var LOST = "Reconciliation could not be loaded. Try Show again.";
  var run = 0, known = false, loaded = false;

  function show(view) { VIEWS.forEach(function (id) { $(id).hidden = id !== view; }); }

  function cell(tr, label, cls) {
    var td = F.el("td", cls || "");
    td.setAttribute("data-label", label);
    tr.appendChild(td);
    return td;
  }

  function row(e) {
    var tr = F.el("tr", ""), td, adj = Array.isArray(e.adjustments) ? e.adjustments : [], shown = 0;
    td = cell(tr, "Serial"); td.appendChild(F.el("strong", "", typeof e.serial === "string" ? e.serial : ""));
    cell(tr, "Issued").textContent = F.day(e.issued_on);
    cell(tr, "Face amount", "r num").textContent = F.money(e.total_sales_centavos);
    cell(tr, "Amount due", "r num").textContent = F.money(e.amount_due_centavos);
    cell(tr, "Payment date").textContent = F.day(e.payment_date);
    cell(tr, "Amount paid", "r num").textContent = F.money(e.paid_centavos);
    cell(tr, "Site").textContent = typeof e.site_name === "string" ? e.site_name : "";
    cell(tr, "Statement").textContent = typeof e.statement === "string" && e.statement ? e.statement : "None yet";
    td = cell(tr, "Adjustments");
    adj.forEach(function (a) {
      var m = a && typeof a.total_centavos === "number" ? F.money(Math.abs(a.total_centavos)) : "";
      if (!a || typeof a.number !== "string" || !m) return;
      td.appendChild(F.el("div", "", a.number + ", −" + m));
      shown++;
    });
    if (!shown) td.textContent = "None";
    td = cell(tr, "Exceptions");
    var box = F.el("div", "exc");
    if (F.exceptionChips(box, e.exceptions, "")) td.appendChild(box); else td.textContent = "None";
    return tr;
  }

  function load() {
    var mine = ++run, from = String($("r-from").value || "").trim(), to = String($("r-to").value || "").trim(), body = {};
    if ((from && !F.isDate(from)) || (to && !F.isDate(to))) { F.say("r-err", "Use the form YYYY-MM-DD."); return; }
    F.say("r-err", "");
    if (from) body.from = from;
    if (to) body.to = to;
    $("r-loading").hidden = false;
    $("r-go").disabled = true;
    H.call("POST", "finance/invoices/reconcile/", body).then(function (res) {
      if (mine !== run) return;
      $("r-loading").hidden = true;
      $("r-go").disabled = false;
      if (F.left(res)) return;
      if (res.status === 404) { show("v-closed"); return; }
      if (!res.ok) {
        /* A failure of Show keeps what is on the page and says so; the first read shows the down view. */
        if (!loaded) show("v-down"); else F.say("r-err", LOST);
        return;
      }
      loaded = true;
      var items = Array.isArray(res.data.items) ? res.data.items : [], n = 0;
      $("r-body").textContent = "";
      items.forEach(function (e) { if (e && typeof e === "object") { $("r-body").appendChild(row(e)); n++; } });
      $("r-card").hidden = false;
      $("r-empty").hidden = n > 0;
      $("r-count").textContent = "Showing " + n + (n === 1 ? " invoice." : " invoices.");
      $("r-count").hidden = false;
      show("v-main");
    });
  }

  $("r-form").addEventListener("submit", function (e) { e.preventDefault(); load(); });

  /* Who is signed in comes from me/, the staff route that answers it; the Finance routes do not. */
  function start() {
    show("boot");
    loaded = false;
    if (known) { show("v-main"); load(); return; }
    H.call("GET", "me/").then(function (res) {
      if (F.left(res)) return;
      if (!res.ok) { show("v-down"); return; }
      known = true;
      window.NOHqShell.signedIn(res.data.email);
      show("v-main");
      load();
    });
  }
  $("retry").addEventListener("click", start);
  start();
})();
