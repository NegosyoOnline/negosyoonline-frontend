# Production notes (frontend)

Source: ClickUp z8uq9mhbeq, Coach Ed 2026-11-21 (z8uq9med6x comment 1100430000604811, "approve P1-P9 and B-P2 to B-P5 as recommended"); GATES production plan 2026-11-21, section 2. These notes name variables only. Values are set by Coach Ed in Vercel; nothing here creates a project, domain, DNS record or variable.

## Principle

Code defaults point at staging, so a deploy with no variables set never talks to production. Production projects set every variable below explicitly. The one hard stop is the HQ app: a production build (`VERCEL_ENV=production`) fails when `HQ_STAFF_API_BASE` is unset.

## Production Vercel projects

All four deploy from the frontend repository's `production` branch. The `production` branch is moved only by the `v*` tag flow (`.github/workflows/promote-production.yml`: full CI on the tagged commit, then fast-forward). The existing staging projects keep deploying from `main` and are not changed.

| Project | App directory | Production host |
| --- | --- | --- |
| `negosyoonline-site-production` | `apps/site` | `www.negosyonline.com` and the apex |
| `negosyoonline-dash-production` | `apps/dash` | `dash.negosyonline.com` |
| `negosyoonline-hq-production` | `apps/hq` | `hq.negosyonline.com` |
| `negosyoonline-storefronts-production` | `apps/storefronts` | `<label>.storefronts.negosyonline.com` and subscribers' own domains |

## Variable names per project

| Project | Variables to set |
| --- | --- |
| site | `SITE_API_BASE` (`https://api.negosyonline.com/v1`), `SITE_URL`, `SITE_DASH_URL` |
| dash | `SITE_API_BASE`, `SITE_URL`, `SITE_DASH_URL`, `SITE_MEDIA_ORIGIN` (production's public Blob store, `https://<store>.public.blob.vercel-storage.com`; unset keeps the staging store; any other shape fails the build) |
| hq | `HQ_STAFF_API_BASE` (`https://hq-api.negosyonline.com/staff/v1`) |
| storefronts | `STOREFRONT_API_BASE` (`https://api.negosyonline.com`), `STOREFRONT_SERVER_SECRET` (a new value, the same as on the production API), `STOREFRONT_MOBILE_APP_URL` |

Storefronts need no media variable: the CSP and the product-photo check already accept any `https://*.public.blob.vercel-storage.com` store.

## Never set in production

- `STOREFRONT_HOST_ALIASES` (local use only)
- `STOREFRONT_LOCAL_MEDIA_ORIGIN` (local development only)
- `STOREFRONT_XENDIT_FAKE_ORIGIN` (local preview only)

## Share image by host

`apps/storefronts/src/lib/seo.ts` (`SHARE_IMAGE_BY_HOST`) lists the Live4More hosts: `live4moreonline.store`, `www.live4moreonline.store`, `live4more.storefronts-staging.negosyonline.com` and `live4more.storefronts.negosyonline.com`.

## Related setup (not done by this repository)

- The apex and `www.negosyonline.com` already point at Vercel today; check which project serves them before moving them.
- The production storefront wildcard needs the same Vercel DNS and `_acme-challenge.storefronts` delegation as staging.
- The backend must list the production hosts (`DJANGO_ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `API_ALLOWED_ORIGINS`, `HQ_STAFF_ORIGIN=https://hq.negosyonline.com`, `SITE_PARENT_HOST=storefronts.negosyonline.com`, `PUBLIC_MEDIA_BASE_URL`).
