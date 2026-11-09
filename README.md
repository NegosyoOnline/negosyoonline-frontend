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

`negosyoonline-storefronts` has Vercel "Auto-assign Custom Domains" on, so each deploy from `main` is aliased to the project's attached domains. Only explicitly attached hosts (`demo1`-`demo5`, `live4more`) have a valid certificate on staging. The `*.storefronts-staging.negosyonline.com` wildcard has no usable certificate yet, which must be resolved before launch.
