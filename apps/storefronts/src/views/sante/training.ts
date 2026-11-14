/* The member Training area (index, three module pages) and the dashboard's announcements and promos panel.
   Styling is its own (tr-* for Training, nt-* for notices) so the two never look alike. All copy is a DRAFT (Coach Ed's). */
import { html, safe, type Markup } from "../../lib/html.ts";
import type { CatalogProduct } from "../../lib/shop-api.ts";
import { REFERRAL_TERMS_URL, TRAINING_MODULES, videoUrl, type Notice } from "../../lib/training-content.ts";
import { PRODUCT_PLACEHOLDER, safeImage } from "./shop-shell.ts";
import { truncate } from "./shop-products.ts";

export const TRAINING_PATH = "/dashboard/training/";

const CSS = `
.tr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:24px 0}
.tr-card{display:flex;flex-direction:column;gap:8px;padding:22px;background:#fff;border:1px solid #E2E8F0;border-top:4px solid #007A3D;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.06);text-decoration:none;color:#1F2933}
.tr-card:hover{box-shadow:0 6px 24px rgba(0,0,0,.12)}
.tr-card h2{margin:0;font-size:18px;font-weight:800;color:#005B2E}
.tr-card p{margin:0;font-size:14px;line-height:1.5;color:#4A5568}
.tr-card .tr-go{margin-top:auto;font-weight:700;font-size:14px;color:#007A3D}
.tr-back{display:inline-block;margin:20px 0 4px;font-weight:700;font-size:14px;color:#007A3D;text-decoration:none}
.tr-page{margin:8px 0 24px;padding:24px;background:#fff;border:1px solid #E2E8F0;border-radius:12px}
.tr-page h2{margin:0 0 10px;font-size:20px;color:#005B2E}
.tr-page p,.tr-page li{font-size:15px;line-height:1.65;color:#1F2933}
.tr-btn{display:inline-block;padding:12px 24px;border-radius:8px;background:#007A3D;color:#fff;font-weight:700;text-decoration:none}
.tr-soon{padding:28px;text-align:center;border:2px dashed #CBD5E0;border-radius:12px;color:#4A5568;font-weight:700;font-size:17px}
.tr-products{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:16px 0}
.tr-product{background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden}
.tr-product .tr-img{aspect-ratio:1/1;background:#F7F9F7;display:flex;align-items:center;justify-content:center}
.tr-product .tr-img img{width:100%;height:100%;object-fit:cover}
.tr-product .tr-body{padding:14px 16px 18px}
.tr-product h3{margin:0 0 6px;font-size:16px;color:#1F2933}
.tr-product p{margin:0;font-size:14px;line-height:1.5;color:#4A5568}
.nt-panel{margin:20px 0;padding:18px 20px;background:#FFF8E6;border:1px solid #E8C766;border-left:6px solid #C9A646;border-radius:12px}
.nt-panel>h2{margin:0 0 12px;font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:#7A5A00}
.nt-item{padding:12px 0;border-top:1px dashed #E8C766}
.nt-item:first-of-type{border-top:0;padding-top:0}
.nt-label{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:800;color:#fff;background:#7A5A00}
.nt-promo .nt-label{background:#B3261E}
.nt-item h3{margin:6px 0 4px;font-size:16px;color:#3A2E00}
.nt-item p{margin:0;font-size:14px;line-height:1.5;color:#3A2E00}
.nt-until{font-size:12.5px;color:#7A5A00;margin-top:4px}
@media (max-width:760px){.tr-grid,.tr-products{grid-template-columns:1fr}.tr-page{padding:18px}}
`;

const ICON = html`<span class="acct-hero-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8l10-5 10 5-10 5z"/><path d="M6 10.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-5.5"/></svg></span>`;

function hero(title: string, memberName: string): Markup {
  return html`<div class="acct-hero">
  <div class="acct-hero-id">
    ${ICON}
    <div class="acct-hero-idtext">
      <h1>${title}</h1>
      <div class="acct-hero-sub"><span>Signed in as <strong>${memberName}</strong></span></div>
    </div>
  </div>
</div>`;
}

const back = html`<a class="tr-back" href="${TRAINING_PATH}">&larr; Back to Training</a>`;
const wrap = (id: string, inner: Markup): Markup => html`<div class="pd" id="${id}"><style>${safe(CSS)}</style>${inner}</div>`;

export function trainingIndex(memberName: string): Markup {
  return wrap("pp-training", html`${hero("Training", memberName)}
<div class="tr-grid">${TRAINING_MODULES.map((m) => html`
  <a class="tr-card" href="${m.path}"><h2>${m.title}</h2><p>${m.text}</p><span class="tr-go">Open &rarr;</span></a>`)}
</div>`);
}

export function mobileAppPage(memberName: string, url: string = videoUrl()): Markup {
  return wrap("pp-training-app", html`${hero("How to use the Santé Mobile App", memberName)}${back}
<div class="tr-page">
  <h2>Video guide</h2>
  ${url
    ? html`<p>Watch this short guide to see how the Santé Mobile App works.</p><p><a class="tr-btn" href="${url}" target="_blank" rel="noopener noreferrer">Watch the video</a></p>`
    : html`<div class="tr-soon">Video coming soon</div>`}
</div>`);
}

export function productTrainingCard(p: CatalogProduct): Markup {
  const image = safeImage(p.image_url);
  return html`<div class="tr-product">
  <div class="tr-img">${image ? html`<img src="${image}" alt="${p.name}" loading="lazy">` : PRODUCT_PLACEHOLDER}</div>
  <div class="tr-body"><h3>${p.name}</h3>${p.short_description ? html`<p>${truncate(p.short_description, 160)}</p>` : ""}</div>
</div>`;
}

/** `products` is null when the catalog could not be read. */
export function productTrainingsPage(memberName: string, products: CatalogProduct[] | null): Markup {
  return wrap("pp-training-products", html`${hero("Product Trainings", memberName)}${back}
${products && products.length
  ? html`<div class="tr-products">${products.map(productTrainingCard)}</div>`
  : html`<div class="tr-page"><div class="tr-soon">${products ? "Product trainings are coming soon." : "The products could not be loaded just now. Please try again shortly."}</div></div>`}`);
}

export function waysToEarnPage(memberName: string, termsUrl: string = REFERRAL_TERMS_URL): Markup {
  return wrap("pp-training-earn", html`${hero("Ways to Earn in Santé", memberName)}${back}
<div class="tr-page">
  <h2>Taking part in Santé</h2>
  <p>As a Santé member you can share Santé with people you know. What is open to you depends on your membership and on the terms of each program.</p>
  <p>Nothing on this page is a promise of income. Results differ from person to person, and no earnings are guaranteed.</p>
  <h2>Read the terms first</h2>
  ${termsUrl
    ? html`<p>Before you take part, read the Referral Program Terms.</p><p><a class="tr-btn" href="${termsUrl}">Referral Program Terms</a></p>`
    : html`<p>The Referral Program Terms are not published here yet. They will be linked on this page.</p>`}
</div>`);
}

/** The dashboard panel. Empty list: nothing at all (the panel is hidden). */
export function noticesPanel(items: Notice[]): Markup {
  if (!items.length) return html``;
  return html`<section class="nt-panel" aria-label="Announcements and promos"><style>${safe(CSS)}</style><h2>Announcements &amp; promos</h2>
${items.map((n) => html`<div class="nt-item nt-${n.kind}"><span class="nt-label">${n.kind === "promo" ? "Promo" : "Announcement"}</span><h3>${n.title}</h3><p>${n.body}</p>${n.until ? html`<div class="nt-until">${n.until}</div>` : ""}</div>`)}
</section>`;
}
