# NegosyoOnline Frontend

## Scope

This repository contains the Vercel-deployed frontend applications for NegosyoOnline:

- `apps/site`: public NegosyoOnline marketing site.
- `apps/dash`: authenticated subscriber dashboard.
- `apps/storefronts`: future customer-facing subscriber storefronts and custom domains.

This repository is independent from TWCinc. TWCinc is reference-only during transition and must never become a runtime dependency or be copied wholesale.

## Safety

- Keep configuration in environment variables. Never commit credentials, API keys, Blob tokens, or provider keys.
- Vercel projects deploy separately from their respective app directories.
- Do not expose tenant data, billing data, or private-media URLs in browser code.
- The Django backend remains authoritative for identity, tenancy, money, orders, authorization, and webhook processing.

## Workflow

- Use pnpm from the repository root.
- Run the target app's lint and build before deployment review.
- Do not link a Vercel project, add secrets, or deploy without explicit approval.
