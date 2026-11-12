/* The member Home's payment and registration panels and the rejection dialog.

   Transcribed from TWCinc's negosyoonline_sante_pack/_pack_panel.html (C7 panel, C9 dialog), _registration_panel.html,
   _details_form.html and _mobile_confirm.html. Text, class names and order are the templates'. Different from them, on purpose:
   - no CSRF field: every POST is checked by its Origin / Sec-Fetch-Site (src/lib/cookies.ts);
   - the Xendit states (awaiting_xendit, xendit_mismatch, retry) are not here: bank transfer with proof is the only method;
   - the price is the order's own (price_centavos), not a written figure;
   - the proof hint says "up to 4 MB" (TWCinc said 10 MB): a Vercel Function body is capped at 4.5 MB;
   - the dialog's script and the date field's showPicker handler are the external js/pack-lock.js (the policy allows no inline script);
   - the details form is TWCinc's own: one date field, the two usernames and, while the member has no address, the
     delivery address block (the backend's member/registration/details takes date_of_birth and delivery_address). */
import { html, safe, type Markup } from "../../lib/html.ts";
import type { MemberPack, MobileCheck, RegistrationCard } from "../../lib/pack-api.ts";
import { termsDialog, termsField } from "./pack-terms.ts";

export const RESUBMIT_PATH = "/dashboard/pack/resubmit/";
export const REG_DETAILS_PATH = "/dashboard/registration/details/";
/** A refused post re-renders the page; the fragment lands it on the registration card, not the top (a phone shows the error). */
export const REG_ANCHOR = "#registration";
export const REG_MOBILE_SEND_PATH = "/dashboard/registration/mobile/send/";
export const REG_MOBILE_VERIFY_PATH = "/dashboard/registration/mobile/verify/";

export type FieldErrors = Record<string, string>;
export type PanelErrors = { error_message: string; field_errors: FieldErrors };
export const NO_ERRORS: PanelErrors = { error_message: "", field_errors: {} };

/** 148800 as ₱1,488.00 */
export function pesos(centavos: number): string {
  const whole = Math.trunc(centavos / 100);
  const cents = Math.abs(centavos % 100).toString().padStart(2, "0");
  return `₱${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

/* The terms tick and popup (the onboarding details step's, pack-forms.css), for the details form while terms_required. */
const TERMS_CSS = `
.pp-ob-terms{display:flex;align-items:flex-start;gap:12px;margin:8px 0 12px;font-size:15px;line-height:1.5}
.pp-ob-terms input{flex:0 0 auto;width:22px;height:22px;margin:1px 0 0;appearance:none;-webkit-appearance:none;border:1.5px solid #767676;border-radius:4px;background:#fff;cursor:pointer}
.pp-ob-terms input:checked{border-color:#2e7d32;background:#2e7d32 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12.5 5 5 9-10'/%3E%3C/svg%3E") center/80% no-repeat}
.pp-ob-terms input:focus-visible{outline:2px solid #2e7d32;outline-offset:2px}
.pp-ob-terms .lnk{color:#1a6207;font-weight:600;text-decoration:underline;text-underline-offset:3px}
.pp-ob-terms-err{margin:6px 0 12px}
.pp-policy-dlg{position:fixed;inset:0;width:calc(100% - 24px);max-width:60rem;height:fit-content;max-height:calc(100dvh - 32px);margin:auto;padding:0;overflow:hidden;border:0;border-radius:16px;background:#fff;color:inherit}
.pp-policy-dlg[open]{display:flex;flex-direction:column}
.pp-policy-dlg::backdrop{background:rgba(20,32,27,.55)}
.pp-policy-dlg-head{display:flex;flex:none;gap:12px;align-items:center;justify-content:space-between;padding:12px 12px 12px 20px;border-bottom:1px solid #dee2e6}
.pp-policy-dlg-head h2{margin:0;font-size:20px;font-weight:700;line-height:1.3}
.pp-policy-dlg-close{flex:none;width:44px;height:44px;border:0;border-radius:8px;background:none;color:inherit;font-size:26px;line-height:1;cursor:pointer}
.pp-policy-dlg-close:hover{background:#f6f6f6}
.pp-policy-dlg-body{min-height:0;padding:16px 20px 24px;overflow-y:auto;overscroll-behavior:contain;font-size:16px;line-height:1.6}
body:has(.pp-policy-dlg[open]){overflow:hidden}
.pp-terms-body{display:flex;flex-direction:column;gap:10px}
.pp-agr-pages{flex:1;min-height:0;overflow-x:auto;overflow-y:scroll;padding:8px;background:#f6f6f6;-webkit-overflow-scrolling:touch}
.pp-agr-pages canvas{display:block;margin:0 auto 8px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.pp-agr-status{padding:16px;margin:0;text-align:center}
.pp-agr-status[hidden]{display:none}
`;

const PANEL_CSS = `
.pk-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px;margin:0 0 16px}
.pk-card h2{margin:0}
.pk-top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 8px}
.pk-chip{display:inline-block;font-size:13px;font-weight:700;border-radius:999px;padding:3px 12px;white-space:nowrap}
.pk-chip.wait{background:#FFF4D6;color:#5A3F00;border:1px solid #E6C86A}
.pk-chip.rev{background:#E3ECFA;color:#173A75}
.pk-chip.att{background:#FCE9E7;color:#7A1710;border:1px solid #E7A39C}
.pk-chip.ok{background:#DCEFE6;color:#0F5238}
.pk-chip.no{background:#ECEFED;color:#3B4842;border:1px solid #B9C3BE}
.pk-reason{background:#FCE9E7;color:#5E120C;border-radius:8px;padding:12px 14px;margin:0 0 14px;font-size:15px;overflow-wrap:anywhere}
.pk-reason b{display:block;font-size:13px;letter-spacing:.3px;text-transform:uppercase;margin:0 0 2px}
.pk-file{display:flex;align-items:center;border:1px dashed #8A9791;border-radius:8px;padding:12px 14px;background:#fff;min-height:48px;font-size:15px}
.pk-file input{max-width:100%}
.pk-file.bad{border:2px solid var(--err)}
.pk-dlg{position:fixed;inset:0;margin:auto;z-index:50;width:calc(100% - 24px);max-width:520px;height:fit-content;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow:hidden;background:#fff;color:var(--ink);border:0;border-radius:14px;padding:0;box-shadow:0 0 0 100vmax rgba(20,32,27,.55)}
.pk-dlg[open]{display:flex;flex-direction:column}
.pk-dlg:modal{box-shadow:none}
.pk-dlg::backdrop{background:rgba(20,32,27,.55)}
.pk-dlg-head{flex:none;padding:16px 20px;border-bottom:1px solid var(--line)}
.pk-dlg-head h1{font-size:22px;margin:0}
.pk-dlg-body{flex:1 1 auto;min-height:0;padding:16px 20px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.pk-dlg-foot{flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 20px;padding-bottom:max(12px,env(safe-area-inset-bottom));border-top:1px solid var(--line)}
.pk-dlg-foot .btn{width:100%}
.pk-dlg form{margin:0}
.pk-dlg .pk-so{display:flex;justify-content:center}
.pk-linkbtn{min-height:44px;padding:0 14px;border:0;background:none;font:inherit;font-size:15px;color:#4B5A53;text-decoration:none;cursor:pointer;border-radius:8px}
.pk-linkbtn:hover{text-decoration:underline;color:var(--ink)}
.pk-linkbtn:focus-visible{outline:3px solid #7FB89E;outline-offset:2px}
.pk-dlg .pk-sect{border-top:1px solid var(--line);margin-top:18px;padding-top:16px}
body:has(.pk-dlg[open]){overflow:hidden}
.pk-grid{display:grid;grid-template-columns:1fr;gap:0 16px}
.pk-grid .fld{min-width:0}
@media (min-width:820px){.pk-dlg-head,.pk-dlg-body,.pk-dlg-foot{padding-left:24px;padding-right:24px}.pk-dlg:has(.pk-grid){max-width:760px}.pk-grid{grid-template-columns:1fr 1fr}.pk-dlg:has(.pk-grid) .pk-reason{margin-bottom:10px}}
`;

const bad = (fe: FieldErrors, name: string): string => (fe[name] ? " bad" : "");
const aria = (fe: FieldErrors, name: string, id: string): Markup =>
  fe[name] ? html` aria-invalid="true" aria-describedby="${id}-msg"` : html``;

/* ---- the mobile confirmation and the details form (the registration card's, and the dialog's) ----------------------- */

export function mobileConfirm(idp: string, mobile: MobileCheck, e: PanelErrors): Markup {
  const fe = e.field_errors;
  return html`${e.error_message ? html`<div class="note bad" role="alert">${e.error_message}</div>` : ""}
<p class="hint" style="margin:6px 0 12px"><b>Confirm your mobile number</b>: we'll text you a code, then you can add your delivery address.</p>
<form method="post" action="${REG_MOBILE_SEND_PATH}${REG_ANCHOR}" novalidate>
${mobile.locked ? html`
<p class="hint">We'll text the code to ${mobile.mobile}. If that is not your number, contact the store and include your order number.</p>` : html`
<div class="fld"><label for="${idp}-mobile">Mobile number</label>
<input id="${idp}-mobile" class="inp${bad(fe, "mobile")}" type="tel" name="mobile" autocomplete="tel" inputmode="tel" style="max-width:260px" value="${mobile.code_sent_to || mobile.mobile}">
${fe.mobile ? html`<p class="err">${fe.mobile}</p>` : html`<p class="hint">Fix it here if it's wrong.</p>`}</div>`}
<button class="btn inline" type="submit">${mobile.code_sent_to ? "Send a new code" : "Send code"}</button>
</form>
${mobile.code_sent_to ? html`
<form method="post" action="${REG_MOBILE_VERIFY_PATH}${REG_ANCHOR}" novalidate style="margin-top:16px">
<div class="fld"><label for="${idp}-code">6-digit code sent to ${mobile.code_sent_to}</label>
<input id="${idp}-code" class="inp${bad(fe, "code")}" type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" style="max-width:260px"></div>
<button class="btn inline" type="submit">Confirm number</button>
</form>` : ""}`;
}

/** The active agreement version the terms popup shows (null: none published); only passed while the card needs the terms. */
export type TermsVersion = { version: number | null };

export function detailsForm(idp: string, reg: RegistrationCard, mobile: MobileCheck, e: PanelErrors, posted: Record<string, string> = {}, terms: TermsVersion | null = null): Markup {
  if (mobile.pending) return mobileConfirm(idp, mobile, e);
  const fe = e.field_errors;
  const dob = fe.date_of_birth ?? fe.dob;
  return html`
${reg.details_erased ? html`<div class="note" role="status">Your details were removed after 90 days to protect your privacy. Please enter them again to finish your registration.</div>` : ""}
<form method="post" action="${REG_DETAILS_PATH}${REG_ANCHOR}" novalidate>
${e.error_message && !Object.keys(fe).length ? html`<div class="note bad" role="alert">${e.error_message}</div>` : ""}
<div class="fld"><label for="${idp}-dob">Date of birth</label>
<input id="${idp}-dob" class="inp${dob ? " bad" : ""}" type="date" name="date_of_birth" style="max-width:260px" value="${posted.date_of_birth ?? ""}"${dob ? html` aria-invalid="true" aria-describedby="${idp}-dob-msg"` : ""}>
${dob ? html`<p class="err" id="${idp}-dob-msg">${dob}</p>` : ""}</div>
<div class="fld"><label for="${idp}-u1">Preferred Santé username</label>
<input id="${idp}-u1" class="inp${bad(fe, "desired_username")}" type="text" name="desired_username" maxlength="20" autocomplete="off" autocapitalize="none" value="${posted.desired_username ?? ""}"${aria(fe, "desired_username", `${idp}-u1`)}>
${fe.desired_username ? html`<p class="err" id="${idp}-u1-msg">${fe.desired_username}</p>` : html`<p class="hint">8 to 20 letters or numbers.</p>`}</div>
<div class="fld"><label for="${idp}-u2">Secondary Santé Username</label>
<input id="${idp}-u2" class="inp${bad(fe, "alternate_username")}" type="text" name="alternate_username" maxlength="20" autocomplete="off" autocapitalize="none" value="${posted.alternate_username ?? ""}"${aria(fe, "alternate_username", `${idp}-u2`)}>
${fe.alternate_username ? html`<p class="err" id="${idp}-u2-msg">${fe.alternate_username}</p>` : html`<p class="hint">Used if your first choice is taken.</p>`}</div>
${reg.needs_address ? html`
<p class="hint" style="margin:6px 0 12px"><b>Delivery address</b>: where we ship your Membership Pack.</p>
${fe.delivery_address ? html`<p class="err" role="alert" style="margin:0 0 10px">${fe.delivery_address}</p>` : ""}
<div class="fld"><label for="${idp}-line">House number and street</label>
<input id="${idp}-line" class="inp${fe.delivery_address ? " bad" : ""}" type="text" name="line" autocomplete="address-line1" value="${posted.line ?? ""}"></div>
<div class="fld"><label for="${idp}-barangay">Barangay</label><input id="${idp}-barangay" class="inp" type="text" name="barangay" value="${posted.barangay ?? ""}"></div>
<div class="fld"><label for="${idp}-city">City or municipality</label>
<input id="${idp}-city" class="inp${fe.delivery_address ? " bad" : ""}" type="text" name="city" autocomplete="address-level2" value="${posted.city ?? ""}"></div>
<div class="fld"><label for="${idp}-province">Province</label>
<input id="${idp}-province" class="inp${fe.delivery_address || fe.province ? " bad" : ""}" type="text" name="province" autocomplete="address-level1" value="${posted.province ?? ""}"${fe.province ? html` aria-invalid="true" aria-describedby="${idp}-province-msg"` : ""}>
${fe.province ? html`<p class="err" id="${idp}-province-msg">${fe.province}</p>` : ""}</div>
<div class="fld"><label for="${idp}-zip">ZIP code</label><input id="${idp}-zip" class="inp${fe.zip ? " bad" : ""}" type="text" name="zip" inputmode="numeric" autocomplete="postal-code" value="${posted.zip ?? ""}"${fe.zip ? html` aria-invalid="true" aria-describedby="${idp}-zip-msg"` : ""}>
${fe.zip ? html`<p class="err" id="${idp}-zip-msg">${fe.zip}</p>` : ""}</div>` : ""}
${reg.terms_required && terms ? termsField(terms.version, posted, fe) : ""}
<button class="btn inline" type="submit">Save details</button>
</form>
${reg.terms_required && terms ? termsDialog(terms.version) : ""}`;
}

/* ---- the registration card (C8) ----------------------------------------------------------------------------------- */

export function registrationPanel(reg: RegistrationCard, mobile: MobileCheck, e: PanelErrors, inDialog: boolean, posted: Record<string, string> = {}, terms: TermsVersion | null = null): Markup {
  return html`<section class="pk-card" id="registration" aria-labelledby="pk-reg-title">
<div class="pk-top"><h2 id="pk-reg-title">Santé membership registration</h2><span class="pk-chip ${reg.tone}">${reg.label}</span></div>
${reg.status === "registered" && reg.sante_member_id ? html`
<div class="row"><div>Santé member ID</div><b>${reg.sante_member_id}</b></div>` : html`
<p>${reg.line}</p>
${reg.details_form && !inDialog ? detailsForm("reg", reg, mobile, e, posted, terms) : ""}`}
</section>`;
}

/* ---- the payment card (C7) and the rejection dialog (C9) ----------------------------------------------------------- */

function packCard(p: MemberPack): Markup {
  const paid = p.payment_status === "verified";
  return html`<section class="pk-card" aria-labelledby="pk-pack-title">
<div class="pk-top"><h2 id="pk-pack-title">Membership Pack</h2><span class="pk-chip ${p.tone}">${p.payment_label}</span></div>
<div class="row"><div>Order number</div><b>${p.order_number}</b></div>
<div class="row"><div>Payment</div><span>${p.method_label} · ${pesos(p.price_centavos)}</span></div>
${paid ? html`<div class="row"><div>Shipment</div><span>The store will let you know when it ships</span></div>`
  : html`<div class="row"><div>Shipment</div><span>Ships after the store verifies your payment</span></div>`}
</section>`;
}

function resubmitForm(p: MemberPack, e: PanelErrors, posted: Record<string, string>): Markup {
  const fe = e.field_errors;
  const lock = p.lock!;
  const field = (id: string, name: string, label: string, attrs: Markup): Markup => html`
<div class="fld"><label for="${id}">${label}</label>
<input id="${id}" class="inp${bad(fe, name)}" name="${name}" ${attrs}${posted[name] !== undefined ? html` value="${posted[name]}"` : ""}${aria(fe, name, id)}>
${fe[name] ? html`<p class="err" id="${id}-msg">${fe[name]}</p>` : ""}</div>`;
  return html`
${e.error_message && !Object.keys(fe).length ? html`<div class="note bad" role="alert">${e.error_message}</div>` : ""}
<form method="post" action="${RESUBMIT_PATH}" enctype="multipart/form-data" id="pk-resubmit" novalidate>
<input type="hidden" name="submit_key" value="${posted.submit_key ?? ""}">
<div class="pk-grid">
<div class="fld"><label for="pk-acct">Account you paid to</label>
<select id="pk-acct" class="inp${bad(fe, "account_id")}" name="account_id"${aria(fe, "account_id", "pk-acct")}>
<option value="">Choose an account</option>
${lock.accounts.map((a) => html`<option value="${a.id}"${posted.account_id === a.id ? html` selected` : ""}>${a.provider_name} · ${a.account_name}</option>`)}
</select>
${fe.account_id ? html`<p class="err" id="pk-acct-msg">${fe.account_id}</p>` : ""}</div>
${field("pk-bank", "sender_bank", "Sender Bank", html`type="text" maxlength="60" placeholder="BDO"`)}
${field("pk-ref", "reference_number", "Reference Number", html`type="text" maxlength="64" placeholder="1234 5678 90"`)}
${field("pk-name", "sender_name", "Sender Name", html`type="text" maxlength="120" placeholder="Juan dela Cruz"`)}
${field("pk-sender", "sender_account_number", "Sender Account Number", html`type="text" maxlength="64" placeholder="1234 5678 12"`)}
${field("pk-amt", "amount_sent", "Amount", html`type="text" inputmode="decimal"`)}
${field("pk-time", "transferred_at", "Time of Transfer", html`type="datetime-local" data-pk-picker`)}
<div class="fld"><label for="pk-proof">Payment proof</label>
<div class="pk-file${fe.proof ? " bad" : ""}"><input id="pk-proof" type="file" name="proof" accept="image/jpeg,image/png,image/webp,application/pdf"${aria(fe, "proof", "pk-proof")}></div>
${fe.proof ? html`<p class="err" id="pk-proof-msg">${fe.proof}</p>` : html`<p class="hint">JPEG, PNG, WebP or PDF, up to 4 MB.</p>`}</div>
</div>
</form>`;
}

export function lockDialog(
  p: MemberPack, reg: RegistrationCard | null, mobile: MobileCheck, e: PanelErrors, regErr: PanelErrors,
  posted: Record<string, string>, terms: TermsVersion | null = null,
): Markup {
  const lock = p.lock!;
  return html`<dialog class="pk-dlg" id="pk-lock" open aria-labelledby="pk-lock-title">
<div class="pk-dlg-head"><h1 id="pk-lock-title">Your payment needs attention</h1></div>
<div class="pk-dlg-body">
<div class="pk-reason"><b>Reason from the store</b>${lock.other_text ? html`Other: ${lock.other_text}` : lock.reason_label}</div>
${lock.resubmitted ? html`
<div class="note info" role="status"><b>We received your new proof. The store is reviewing it.</b></div>
<p class="hint" style="margin-bottom:16px">Your dashboard shows Home only until the store verifies your payment.</p>` : html`
<p>Please send your payment details and proof again. Until the store verifies your payment, your dashboard shows Home only.</p>
${resubmitForm(p, e, posted)}`}
${reg && reg.details_form ? html`
<div class="pk-sect"><h2>Santé membership registration</h2><p>${reg.line}</p>
${detailsForm("dlg", reg, mobile, regErr, {}, terms)}</div>` : ""}
</div>
<div class="pk-dlg-foot">
${!lock.resubmitted ? html`<button class="btn" type="submit" id="pk-send" form="pk-resubmit">Send new proof</button>` : ""}
<form method="post" action="/dashboard/sign-out/" class="pk-so"><button class="pk-linkbtn" type="submit">Sign out</button></form>
</div>
</dialog>`;
}

export type HomePanels = {
  pack: MemberPack | null;
  registration: RegistrationCard | null;
  mobile: MobileCheck;
  pack_errors?: PanelErrors;
  reg_errors?: PanelErrors;
  posted?: Record<string, string>;
  terms?: TermsVersion | null;
};

/** The panels the home shows, in TWCinc's order: the payment card, the registration card (the lock dialog when rejected). */
export function homePanels(h: HomePanels): Markup {
  const p = h.pack;
  if (!p) return html``;
  const pe = h.pack_errors ?? NO_ERRORS;
  const re = h.reg_errors ?? NO_ERRORS;
  const posted = h.posted ?? {};
  return html`<style>${safe(PANEL_CSS)}${h.registration?.terms_required ? safe(TERMS_CSS) : ""}</style>
${packCard(p)}
${h.registration ? registrationPanel(h.registration, h.mobile, re, !!p.lock, posted, h.terms ?? null) : ""}
${p.lock ? lockDialog(p, h.registration, h.mobile, pe, re, posted, h.terms ?? null) : ""}`;
}
