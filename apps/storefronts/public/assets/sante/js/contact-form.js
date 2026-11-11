/* The home's "Send a Message" form, sent without leaving the page.

   Not one of the approved TWCinc files: written for this storefront, by Coach Ed's ruling of
   2026-11-11 (ClickUp z8uq9me5qe). With this script the form is sent to the same /contact/
   address in the background. A popup shows progress for at least two seconds, then the
   thank-you line; the form is cleared and the page does not reload, jump or scroll. A refused
   or failed send closes the popup and shows the form's own red lines, with the typed values kept.
   Without this script the form posts as a plain page, which /contact/ still answers.

   The popup is the approved checkout popup of pack-storefront.css (.sf-modal, .sf-modal-card,
   .sf-modal-close) with its loading beat (.sf-otp-loading), as store_checkout.html uses them.
   It is built here from elements, never from markup text, and nothing is styled by a string. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; // the tests read the rules below
  else api.start(root.document, root);
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var FIELDS = ["name", "email", "subject", "message"];
  /* The same lines the API answers, so an empty field is caught before the popup opens. */
  var TEXTS = {
    name: "Please enter your name.",
    email: "Please enter a valid email address.",
    subject: "Please enter a subject.",
    message: "Please enter a message.",
  };
  var FAILED = "We could not send your message. Please try again in a moment.";
  var SENT = "Thanks! Your message has been sent — we'll get back to you shortly.";
  var SENDING = "Sending your message…";
  var MIN_PROGRESS_MS = 2000;
  var PROGRESS_PAD_MS = 50; // clocks and timers round, so the wait is a little over, never under
  var TIMEOUT_MS = 15000;
  var RED = "#d33d44";

  /** The fields that are plainly not filled in. The API has the last word on every field. */
  function checkFields(values) {
    var errors = {};
    var email = String(values.email || "").trim();
    if (!String(values.name || "").trim()) errors.name = TEXTS.name;
    if (!/^\S+@\S+$/.test(email)) errors.email = TEXTS.email;
    if (!String(values.subject || "").trim()) errors.subject = TEXTS.subject;
    if (!String(values.message || "").trim()) errors.message = TEXTS.message;
    return errors;
  }

  /** What /contact/ answered, as one of sent, invalid, limited or failed. Anything unclear is failed. */
  function readAnswer(status, body) {
    var failed = { state: "failed", note: FAILED };
    if (!body || typeof body !== "object") return failed;
    if (status === 200 && body.state === "sent") return { state: "sent" };
    if (status === 400 && body.state === "invalid" && body.errors && typeof body.errors === "object") {
      var errors = {};
      FIELDS.forEach(function (key) {
        if (typeof body.errors[key] === "string" && body.errors[key]) errors[key] = body.errors[key];
      });
      return Object.keys(errors).length ? { state: "invalid", errors: errors } : failed;
    }
    if (status === 429 && body.state === "limited" && typeof body.note === "string" && body.note) {
      return { state: "limited", note: body.note };
    }
    return failed;
  }

  /** How much longer the progress must stay up so that it shows for the whole minimum. */
  function remaining(startedAt, now, minimum) {
    return Math.max(0, minimum - (now - startedAt));
  }

  function start(document, window) {
    var form = document.querySelector("#contact-form form");
    if (!form || !window.fetch || !window.FormData || !window.URLSearchParams) return; // the plain post still works
    var submit = form.querySelector('button[type="submit"]');
    var busy = false;

    function field(key) {
      return form.elements[key];
    }

    function make(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    }

    /* --- the form's own red lines ------------------------------------------------------- */

    function clearMarks() {
      Array.prototype.forEach.call(form.querySelectorAll(".sf-contact-error, .sf-contact-status"), function (node) {
        node.parentNode.removeChild(node);
      });
      FIELDS.forEach(function (key) {
        field(key).style.borderColor = "var(--border)";
        field(key).removeAttribute("aria-invalid");
      });
    }

    function showErrors(errors) {
      var first = null;
      FIELDS.forEach(function (key) {
        if (!errors[key]) return;
        var input = field(key);
        input.style.borderColor = RED;
        input.setAttribute("aria-invalid", "true");
        input.insertAdjacentElement("afterend", make("div", "sf-contact-error", errors[key]));
        first = first || input;
      });
      if (first) first.focus();
    }

    function showNote(text) {
      var note = make("p", "sf-contact-status", text);
      note.setAttribute("role", "status");
      note.style.color = RED;
      form.appendChild(note);
    }

    /* --- the popup ---------------------------------------------------------------------- */

    var modal = make("div", "sf-modal");
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Send a Message");
    var card = make("div", "sf-modal-card");
    card.tabIndex = -1;
    card.style.outline = "none";
    var closeButton = make("button", "sf-modal-close", "✕");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close");
    var live = make("div");
    live.setAttribute("aria-live", "polite");

    var loading = make("div", "sf-otp-loading");
    var pacman = make("div", "sf-otp-pacman");
    pacman.setAttribute("aria-hidden", "true");
    pacman.appendChild(make("div", "sf-otp-pacman-mouth"));
    [0, 0.3, 0.6, 0.9].forEach(function (delay) {
      var dot = make("span", "sf-otp-pacman-dot");
      dot.style.animationDelay = delay + "s";
      pacman.appendChild(dot);
    });
    loading.appendChild(pacman);
    loading.appendChild(make("p", "sf-otp-loading-text", SENDING));

    var done = make("div");
    done.hidden = true;
    done.appendChild(make("p", "", SENT));
    var okButton = make("button", "btn-cart", "Close");
    okButton.type = "button";
    done.appendChild(okButton);

    live.appendChild(loading);
    live.appendChild(done);
    card.appendChild(closeButton);
    card.appendChild(live);
    modal.appendChild(card);
    document.body.appendChild(modal);

    function isDone() {
      return !modal.hidden && !done.hidden;
    }

    function openProgress() {
      loading.hidden = false;
      done.hidden = true;
      closeButton.hidden = true; // a send cannot be called back, so there is nothing to close yet
      modal.hidden = false;
      card.focus({ preventScroll: true });
    }

    function showDone() {
      loading.hidden = true;
      done.hidden = false;
      closeButton.hidden = false;
      okButton.focus({ preventScroll: true });
    }

    function closeModal() {
      modal.hidden = true;
    }

    function closeDone() {
      if (!isDone()) return;
      closeModal();
      submit.focus({ preventScroll: true }); // back to the form, where the visitor was
    }

    closeButton.addEventListener("click", closeDone);
    okButton.addEventListener("click", closeDone);
    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeDone();
    });
    modal.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeDone();
      } else if (event.key === "Tab") {
        // the keyboard stays inside the popup: nothing to reach while sending, two controls after
        event.preventDefault();
        if (isDone()) (document.activeElement === okButton ? closeButton : okButton).focus();
      }
    });

    /* --- sending ------------------------------------------------------------------------ */

    function send() {
      var options = {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new URLSearchParams(new FormData(form)),
        credentials: "same-origin",
        redirect: "error",
      };
      var timer = null;
      if (window.AbortController) {
        var abort = new AbortController();
        options.signal = abort.signal;
        timer = window.setTimeout(function () { abort.abort(); }, TIMEOUT_MS);
      }
      return window
        .fetch("/contact/", options)
        .then(function (response) {
          return response.json().then(function (body) { return readAnswer(response.status, body); });
        })
        .catch(function () { return { state: "failed", note: FAILED }; })
        .then(function (answer) {
          if (timer !== null) window.clearTimeout(timer);
          return answer;
        });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (busy) return;
      clearMarks();
      var values = {};
      FIELDS.forEach(function (key) { values[key] = field(key).value; });
      var errors = checkFields(values);
      if (Object.keys(errors).length) {
        showErrors(errors); // no popup for a form that is plainly not filled in
        return;
      }
      busy = true;
      submit.disabled = true;
      var startedAt = Date.now();
      openProgress();
      send()
        .then(function (answer) {
          if (answer.state !== "sent") return answer; // a refusal is shown at once, in the form
          return new Promise(function (resolve) {
            window.setTimeout(function () { resolve(answer); }, remaining(startedAt, Date.now(), MIN_PROGRESS_MS) + PROGRESS_PAD_MS);
          });
        })
        .then(function (answer) {
          busy = false;
          submit.disabled = false;
          if (answer.state === "sent") {
            FIELDS.forEach(function (key) { field(key).value = ""; });
            showDone();
            return;
          }
          closeModal();
          if (answer.state === "invalid") {
            showErrors(answer.errors);
          } else {
            showNote(answer.note);
            submit.focus({ preventScroll: true });
          }
        });
    });
  }

  return {
    start: start,
    checkFields: checkFields,
    readAnswer: readAnswer,
    remaining: remaining,
    TEXTS: TEXTS,
    FAILED: FAILED,
    SENT: SENT,
    MIN_PROGRESS_MS: MIN_PROGRESS_MS,
  };
});
