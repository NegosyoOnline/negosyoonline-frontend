# NegosyoOnline Frontend

Vercel frontend workspace with separate applications for the public site, subscriber dashboard, and customer-facing storefronts.

## Apps

| App | Vercel role | Local command |
| --- | --- | --- |
| `apps/site` | Public marketing site | `pnpm dev:site` |
| `apps/dash` | Subscriber dashboard | `pnpm dev:dash` |
| `apps/storefronts` | Subscriber customer sites | `pnpm dev:storefronts` |

Vercel linkage and environment variables are intentionally deferred until the corresponding deployment setup is approved.

## Storefronts staging domains

`negosyoonline-storefronts` has Vercel "Auto-assign Custom Domains" on, so each deploy from `main` is aliased to the project's attached domains. The `*.storefronts-staging.negosyonline.com` wildcard has a valid certificate, so any subdomain resolves without being attached individually. This relies on Vercel DNS being enabled for `negosyonline.com` and the `_acme-challenge.storefronts-staging` NS delegation to Vercel in Cloudflare; the production wildcard needs the same setup before launch.
