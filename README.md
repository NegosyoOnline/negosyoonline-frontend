# NegosyoOnline Frontend

Vercel frontend workspace with separate applications for the public site, subscriber dashboard, and customer-facing storefronts.

## Apps

| App | Vercel role | Local command |
| --- | --- | --- |
| `apps/site` | Public marketing site | `pnpm dev:site` |
| `apps/dash` | Subscriber dashboard | `pnpm dev:dash` |
| `apps/storefronts` | Subscriber customer sites | `pnpm dev:storefronts` |

Vercel linkage and environment variables are intentionally deferred until the corresponding deployment setup is approved.
