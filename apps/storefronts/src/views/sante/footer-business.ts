/* The storefront's business-details footer block: the dark registration card (Registered business, DTI registration no., BIR tax ID no. (TIN), the BIR seal)
   and the copyright and wellness lines under it. One function, used by the storefront home footer (home.ts) and by the desktop footer of the signed-in
   member pages (member.ts), so the two never drift apart. Every value comes from the store's own record; a missing value or seal draws nothing. */
import { html, type Markup } from "../../lib/html.ts";

export type FooterBusiness = {
  year: number;
  store_name: string;
  biz: { registered_name: string; dti_business_number: string; tin: string; has_seal: boolean };
};

export function footerBusiness(v: FooterBusiness): Markup {
  return html`${v.biz.has_seal || v.biz.registered_name || v.biz.tin || v.biz.dti_business_number ? html`
    <div class="footer-registration">
      <ul class="footer-reg-list">
        ${v.biz.registered_name ? html`<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V6l8-3 8 3v15M9 21v-5h6v5M8 9h2M14 9h2M8 12.5h2M14 12.5h2"/></svg><div><span>Registered business</span>${v.biz.registered_name}</div></li>` : ""}
        ${v.biz.dti_business_number ? html`<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 21h18M3 9h18"/></svg><div><span>DTI registration no.</span>${v.biz.dti_business_number}</div></li>` : ""}
        ${v.biz.tin ? html`<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/></svg><div><span>BIR tax ID no. (TIN)</span>${v.biz.tin}</div></li>` : ""}
      </ul>
      ${v.biz.has_seal ? html`<div class="footer-seal-box"><img class="footer-seal" src="/business-seal/" alt="BIR registered business seal" width="240" height="84"></div>` : ""}
    </div>
    ` : ""}
    ${footerBottom(v)}
  `;
}

/* The © line and the wellness disclaimer on their own (the member pages' desktop footer carries no business-details card). */
export function footerBottom(v: { year: number; store_name: string }): Markup {
  return html`<div class="footer-bottom">
      <div class="footer-meta">
        <div class="footer-copyright">&#169; ${v.year} ${v.store_name}. All rights reserved.</div>
        <div class="footer-disclaimer">Products are for general wellness support only. Not intended to diagnose, treat, cure, or prevent any disease. Results may vary.</div>
      </div>
    </div>`;
}
