/* The Santé Membership Agreement popup (Coach Ed 2026-10-31). Renders the PDF with vendored PDF.js from this host and
   hands the acceptance to the checkout form. Agree stays disabled until the box is ticked and every page has displayed,
   so the buyer never agrees to something that did not show. A classic script: as a module, this file on the CDN would
   need CORS. The server still decides acceptance; nothing here is trusted on its own. */
(function () {
  var dlg = document.getElementById("pp-agr-dlg");
  if (!dlg || typeof dlg.showModal !== "function") return;
  var box = document.getElementById("agreement-box"), agree = document.getElementById("pp-agr-agree");
  var pages = document.getElementById("pp-agr-pages"), status = document.getElementById("pp-agr-status");
  var form = document.getElementById("contact-form"), reaccept = document.getElementById("pp-agr-reaccept");
  var viewer = new URL(dlg.dataset.viewer, location.origin).href; /* absolute: this script's own base is the CDN */
  var pdf = null, scale = 1, shown = false, run = 0;

  function canAgree() { agree.disabled = !(box.checked && shown); }
  function fail() {
    shown = false; canAgree();
    status.hidden = false;
    status.textContent = "We could not show the agreement here. Download it, or try again in a moment.";
  }

  async function load() {
    var pdfjs = await import(viewer + "pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = viewer + "pdf.worker.min.mjs";
    /* The decoders, fonts, character maps and colour profiles come from this host too (a worker cannot fetch them from the CDN). */
    pdf = await pdfjs.getDocument({
      url: dlg.dataset.file, isEvalSupported: false, enableScripting: false,
      wasmUrl: viewer + "wasm/", standardFontDataUrl: viewer + "standard_fonts/",
      cMapUrl: viewer + "cmaps/", cMapPacked: true, iccUrl: viewer + "iccs/"
    }).promise;
  }
  async function draw() {
    var inner = getComputedStyle(pages), mine = ++run;
    /* The room inside the padding. The scrollbar space is reserved in CSS (overflow-y: scroll), so this does not shrink once pages appear. */
    var width = pages.clientWidth - parseFloat(inner.paddingLeft) - parseFloat(inner.paddingRight);
    shown = false; canAgree();
    pages.querySelectorAll("canvas").forEach(function (c) { c.remove(); });
    status.hidden = false; status.textContent = "Loading the agreement…";
    for (var n = 1; n <= pdf.numPages; n++) {
      var page = await pdf.getPage(n);
      if (mine !== run) return;
      var base = page.getViewport({ scale: 1 }), css = (width / base.width) * scale;
      /* Keep the canvas under ~16M pixels: iOS Safari hands back a dead (blank) canvas past that, silently. */
      var ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt(16e6 / (base.width * css * base.height * css)));
      var view = page.getViewport({ scale: css * ratio });
      var canvas = document.createElement("canvas");
      canvas.width = view.width; canvas.height = view.height;
      canvas.style.width = view.width / ratio + "px";
      canvas.setAttribute("aria-label", "Agreement page " + n);
      pages.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: view }).promise;
      if (mine !== run) return;
    }
    status.hidden = true; shown = true; canAgree();
  }
  async function open() {
    box.checked = false; canAgree();
    if (!dlg.open) dlg.showModal();
    try { if (!pdf) await load(); await draw(); } catch (e) { fail(); }
  }
  function zoom(by) { scale = Math.min(3, Math.max(0.75, scale + by)); if (pdf) draw().catch(fail); }

  window.ppAgreement = {
    /* Called from the checkout submit handler once the rest of the form is good. True: the popup took over the submit. */
    gate: function (ev) {
      if (dlg.hasAttribute("data-held")) return false;
      ev.preventDefault(); open(); return true;
    },
  };
  box.addEventListener("change", canAgree);
  document.getElementById("pp-agr-in").addEventListener("click", function () { zoom(0.25); });
  document.getElementById("pp-agr-out").addEventListener("click", function () { zoom(-0.25); });
  document.getElementById("pp-agr-close").addEventListener("click", function () { dlg.close(); });
  document.getElementById("pp-agr-cancel").addEventListener("click", function () { dlg.close(); });
  agree.addEventListener("click", function () {
    if (agree.disabled) return;
    if (form) {
      document.getElementById("agreement_accept").value = "1";
      document.getElementById("agreement_version_id").value = dlg.dataset.version;
      dlg.setAttribute("data-held", ""); dlg.close();
      if (form.requestSubmit) form.requestSubmit(); else form.submit(); /* Safari before 16: the checks already passed */
    } else { agree.disabled = true; dlg.close(); reaccept.submit(); }
  });
  if (dlg.hasAttribute("data-open")) open();
})();
