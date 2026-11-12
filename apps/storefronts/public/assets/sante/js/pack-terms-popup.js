/* Membership Terms popup of the onboarding details step. TWCinc shows the terms PDF in an iframe; this storefront's
   policy allows no frame of its own pages, so the PDF is drawn with the vendored PDF.js from this host, as the checkout's
   agreement popup does (pack-agreement-popup.js). A plain click on the terms link opens the dialog; a modified click, or a
   browser without <dialog>, follows the link as usual. */
(function () {
  "use strict";
  var dlg = document.getElementById("pp-terms-dlg");
  if (!dlg || typeof dlg.showModal !== "function") return;
  var body = document.getElementById("pp-terms-dlg-body");
  var pages = document.getElementById("pp-terms-pages");
  var status = document.getElementById("pp-terms-status");
  var viewer = pages ? new URL(pages.dataset.viewer, location.origin).href : "";
  var loaded = false, loading = false;

  function say(text) { if (status) { status.hidden = !text; status.textContent = text; } }

  async function render() {
    if (loaded || loading || !pages || !pages.dataset.file) return;
    loading = true;
    try {
      var pdfjs = await import(viewer + "pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = viewer + "pdf.worker.min.mjs";
      var pdf = await pdfjs.getDocument({
        url: pages.dataset.file, isEvalSupported: false, enableScripting: false,
        wasmUrl: viewer + "wasm/", standardFontDataUrl: viewer + "standard_fonts/",
        cMapUrl: viewer + "cmaps/", cMapPacked: true, iccUrl: viewer + "iccs/"
      }).promise;
      var inner = getComputedStyle(pages);
      var width = pages.clientWidth - parseFloat(inner.paddingLeft) - parseFloat(inner.paddingRight);
      for (var n = 1; n <= pdf.numPages; n++) {
        var page = await pdf.getPage(n);
        var base = page.getViewport({ scale: 1 }), css = width / base.width;
        var ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt(16e6 / (base.width * css * base.height * css)));
        var view = page.getViewport({ scale: css * ratio });
        var canvas = document.createElement("canvas");
        canvas.width = view.width; canvas.height = view.height;
        canvas.style.width = view.width / ratio + "px";
        canvas.setAttribute("aria-label", "Membership Terms page " + n);
        pages.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: view }).promise;
      }
      loaded = true;
      say("");
    } catch (e) {
      say("We could not show the Membership Terms here. Please try again in a moment.");
    }
    loading = false;
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var link = e.target.closest ? e.target.closest("a[data-terms-popup]") : null;
    if (!link) return;
    e.preventDefault();
    body.scrollTop = 0;
    dlg.showModal();
    render();
  });
  document.getElementById("pp-terms-dlg-close").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); }); /* the backdrop */
})();
