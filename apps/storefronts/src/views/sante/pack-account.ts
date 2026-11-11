/* The member Account page, the email verification and the contact change, in the member dashboard shell.
   Transcribed from TWCinc's negosyoonline_members templates account.html, verify_email.html, change_contact.html,
   change_done.html and _alert.html: text, class names and order are the templates'. Different from them, on purpose:
   - no CSRF field: every POST is checked by its Origin / Sec-Fetch-Site (src/lib/cookies.ts);
   - the "Home address" link is left out: that page (/dashboard/address/) is not in this milestone, so no dead link;
   - the Verify email / Change links always show: the backend's account answer has no data_entry_open flag (TWCinc's
     switches.bind_enforced()). */
import { html, type Markup } from "../../lib/html.ts";
import type { AccountInfo, ChangeField, ChangeState, VerifyEmailState } from "../../lib/pack-api.ts";
import { SIGN_IN_PATH } from "./member.ts";

export const ACCOUNT_PATH = "/dashboard/account/";
export const VERIFY_EMAIL_PATH = "/dashboard/account/verify-email/";
export const changePath = (f: ChangeField) => `/dashboard/account/change-${f}/`;

export type StepErrors = { error_message: string; error_code: string; field_errors: Record<string, string> };
export const NO_STEP_ERRORS: StepErrors = { error_message: "", error_code: "", field_errors: {} };

/** _alert.html: a failed step is a warning when SMS is paused or down, an alert otherwise (field messages go under their field). */
function alert(e: StepErrors): Markup {
  if (!e.error_message) return html``;
  if (e.error_code === "sms_paused" || e.error_code === "sms_unavailable") return html`<div class="note warn" role="alert"><b>${e.error_message}</b></div>`;
  return Object.keys(e.field_errors).length ? html`` : html`<div class="note bad" role="alert">${e.error_message}</div>`;
}

function codeField(e: StepErrors): Markup {
  const bad = !!e.field_errors.code;
  return html`<div class="fld">
<label for="code">6-digit code</label>
<input id="code" class="inp${bad ? " bad" : ""}" type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required${bad ? html` aria-invalid="true" aria-describedby="code-msg"` : ""}>
${bad ? html`<p class="err" id="code-msg">${e.field_errors.code}</p>` : html`<p class="hint">The code expires in 10 minutes.</p>`}
</div>`;
}

export function accountContent(a: AccountInfo): Markup {
  const badge = (state: string) => state === "verified" ? html`<span class="badge ok">Verified</span>` : html`<span class="badge pend">Not verified</span>`;
  return html`${a.hold_banner ? html`<div class="note warn" role="status"><b>${a.hold_banner}</b></div>` : ""}
<h1>Account and security</h1>
<div class="card wide">
<div class="row"><div>Mobile<small>${a.mobile_masked}</small></div>${badge(a.mobile_state)}</div>
<div class="row"><div>Email<small>${a.email_masked}</small></div>${badge(a.email_state)}</div>
<div class="row"><div>Sign-in codes go to<small>${a.default_channel === "email" ? "Your email" : "Your mobile"}</small></div></div>
<p class="links" style="margin:12px 0 0">${a.email_state !== "verified" ? html`<a class="lnk" href="${VERIFY_EMAIL_PATH}">Verify email</a> &middot; ` : ""}<a class="lnk" href="${changePath("mobile")}">Change mobile</a> &middot; <a class="lnk" href="${changePath("email")}">Change email</a></p>
</div>`;
}

export function verifyEmailContent(v: VerifyEmailState, e: StepErrors): Markup {
  if (v.step === "done") {
    return html`<div class="note info" role="status"><b>${v.message || "Your email is verified."}</b> Sign-in codes now go to your email.</div>
<div class="card wide">
<div class="row"><div>Email<small>${v.email_masked}</small></div><span class="badge ok">Verified</span></div>
<div class="row"><div>Sign-in codes go to<small>Your email</small></div></div>
</div>`;
  }
  if (v.step === "code") {
    return html`<div class="card">
<h1>Enter your code</h1>
<p>We sent a 6-digit code to ${v.email_masked}.</p>
${alert(e)}
<form method="post" action="${VERIFY_EMAIL_PATH}">
<input type="hidden" name="action" value="verify">
${codeField(e)}
<button class="btn" type="submit">Verify email</button>
</form>
<form method="post" action="${VERIFY_EMAIL_PATH}" style="margin-top:14px">
<button class="link-btn" type="submit" name="action" value="send">Send a new code</button>
</form>
</div>`;
  }
  return html`<div class="card">
<h1>Verify your email</h1>
<p>We will send a code to ${v.email_masked}.</p>
${alert(e)}
<form method="post" action="${VERIFY_EMAIL_PATH}">
<button class="btn" type="submit" name="action" value="send">Send code</button>
</form>
<p style="margin:14px 0 0"><a class="lnk" href="${ACCOUNT_PATH}">Back to account</a></p>
</div>`;
}

export function changeTitle(field: ChangeField): string {
  return field === "mobile" ? "Change your mobile number" : "Change your email";
}

export function changeContent(s: ChangeState, e: StepErrors, errorCode = ""): Markup {
  const f = s.field;
  const action = changePath(f);
  const back = html`<p style="margin:14px 0 0"><a class="lnk" href="${ACCOUNT_PATH}">Back to account</a></p>`;
  if (s.step === "replacement") {
    const bad = !!e.field_errors.new_value;
    return html`<div class="card">
<p class="step">Step 2 of 3</p>
<h1>Enter your new ${f === "mobile" ? "mobile" : "email"}</h1>
${alert(e)}
<form method="post" action="${action}">
<input type="hidden" name="action" value="send_replacement">
<div class="fld">
<label for="new_value">${f === "mobile" ? "New mobile number" : "New email"}</label>
<input id="new_value" class="inp${bad ? " bad" : ""}" name="new_value" ${f === "mobile" ? html`type="tel" inputmode="numeric" placeholder="09XX XXX XXXX"` : html`type="email" inputmode="email" placeholder="you@example.com"`} required${bad ? html` aria-invalid="true" aria-describedby="new-msg"` : ""}>
${bad ? html`<p class="err" id="new-msg">${e.field_errors.new_value}</p>` : ""}
</div>
<button class="btn" type="submit">Send code</button>
</form>
${back}
</div>`;
  }
  if (s.step === "replacement_code") {
    return html`<div class="card">
<p class="step">Step 3 of 3</p>
<h1>Confirm your new ${f === "mobile" ? "mobile" : "email"}</h1>
<p>We sent a code to your new ${f === "mobile" ? "mobile number" : "email"}.</p>
${alert(e)}
<form method="post" action="${action}">
<input type="hidden" name="action" value="verify_replacement">
${codeField(e)}
<button class="btn" type="submit">Change ${f === "mobile" ? "mobile" : "email"}</button>
</form>
${back}
</div>`;
  }
  const heading = s.proof_channel === "email" ? "Confirm your current email" : f === "mobile" ? "Confirm your current mobile" : "Confirm your mobile";
  const lede = s.step === "current_code"
    ? html`<p>We sent a code to ${s.proof_masked}.</p>`
    : html`<p>We will ${s.proof_channel === "email" ? "email" : "text"} a code to ${s.proof_masked}${f === "email" && s.proof_channel === "sms" ? " to confirm it is you" : ""}.</p>`;
  return html`<div class="card">
<p class="step">Step 1 of 3</p>
<h1>${heading}</h1>
${lede}
${alert(e)}
${s.step === "current_code" ? html`<form method="post" action="${action}">
<input type="hidden" name="action" value="verify_current">
${codeField(e)}
<button class="btn" type="submit">Continue</button>
</form>
<form method="post" action="${action}" style="margin-top:14px">
<button class="link-btn" type="submit" name="action" value="send_current">Send a new code</button>
</form>` : html`<form method="post" action="${action}">
<button class="btn" type="submit" name="action" value="send_current">${errorCode === "sms_paused" || errorCode === "sms_unavailable" ? "Try again" : "Send code"}</button>
</form>`}
${back}
</div>`;
}

export function changeDoneContent(field: ChangeField): Markup {
  return html`<div class="card">
<h1>${field === "mobile" ? "Your mobile number was changed" : "Your email was changed"}</h1>
<p>For your security, you have been signed out on all devices. Sign in again with your new ${field === "mobile" ? "number" : "email"}.</p>
<a class="btn" href="${SIGN_IN_PATH}">Sign in again</a>
</div>`;
}

export function changeDoneTitle(field: ChangeField): string {
  return field === "mobile" ? "Mobile number changed" : "Email changed";
}
