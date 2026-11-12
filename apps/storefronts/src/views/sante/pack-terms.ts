/* The Santé Membership Terms tick and its popup, shared by the onboarding details step and the member dashboard's account
   details card (the one place the wording lives). The popup draws the terms PDF of one version with js/pack-terms-popup.js;
   `version` is the active agreement version the page read, posted back as agreement_version_id so the backend records the
   version the member was shown. */
import { html, type Markup } from "../../lib/html.ts";

export const AGREEMENT_PDF_PATH = "/funnel/membership-pack/membership-terms.pdf";
/* TWCinc constants.py and registration.py: the words of these pages. */
export const MEMBERSHIP_TERMS_URL = "https://www.santebarleyph.com/";
export const MEMBERSHIP_TERMS_LABEL = "Membership Terms";
export const TERMS_ERROR = "Please agree to the Santé Membership Terms to continue.";

/** The hidden version field, the tick and its error line. */
export function termsField(version: number | null, posted: Record<string, string>, fieldErrors: Record<string, string>): Markup {
  return html`
  <input type="hidden" name="agreement_version_id" value="${version ?? ""}">
  <label class="pp-co-agree pp-ob-terms" for="dt-terms">
    <input type="checkbox" id="dt-terms" name="terms" value="1"${posted.terms ? html` checked` : ""}>
    <span>I have read and agree to the <a class="lnk" href="${MEMBERSHIP_TERMS_URL}" target="_blank" rel="noopener noreferrer" data-terms-popup>Sant&eacute; ${MEMBERSHIP_TERMS_LABEL}&nbsp;&#8599;</a>.</span>
  </label>
  ${fieldErrors.terms ? html`<p class="err pp-ob-terms-err">${fieldErrors.terms}</p>` : ""}`;
}

/** The popup. It sits outside the form, as the onboarding step has it. */
export function termsDialog(version: number | null): Markup {
  return html`
<dialog class="pp-policy-dlg" id="pp-terms-dlg" aria-labelledby="pp-terms-dlg-title">
  <div class="pp-policy-dlg-head">
    <h2 id="pp-terms-dlg-title">Sant&eacute; ${MEMBERSHIP_TERMS_LABEL}</h2>
    <button type="button" class="pp-policy-dlg-close" id="pp-terms-dlg-close" aria-label="Close">&times;</button>
  </div>
  <div class="pp-policy-dlg-body pp-terms-body" id="pp-terms-dlg-body" tabindex="0">${version !== null ? html`
    <div class="pp-agr-pages" id="pp-terms-pages" data-file="${AGREEMENT_PDF_PATH}?v=${version}" data-viewer="/agreement-viewer/"><p class="pp-agr-status" id="pp-terms-status" role="status">Loading the Membership Terms…</p></div>` : html`
    <p>The Sant&eacute; ${MEMBERSHIP_TERMS_LABEL} have not been published yet. Please check back shortly.</p>`}</div>
</dialog>
`;
}
