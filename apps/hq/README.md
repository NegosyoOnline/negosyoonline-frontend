# NegosyoOnline HQ staff app

The staff area. Static HTML, CSS and JavaScript in `public/`, built the way `apps/dash` is: Next.js only serves it, and `next.config.ts` supplies the routing, the security headers and the CSP.

Staff sign in here with an emailed code and an authenticator or recovery code. **The backend checks every code and sets the session cookie. This app checks nothing, holds no token and no secret, and cannot read the cookie.**

## Rules (design sections 20 and 21, ClickUp z8uq9me128)

- The browser calls the staff routes on the hq host directly. This app has no API route, no middleware and no rewrite to another host, and must not gain one: nothing a staff member types or reads may pass through Vercel.
- Nothing is loaded from another host. The font is in `public/assets/fonts/`. The CSP allows script, styles and the font from this app only, and calls to the one staff address only.
- No inline script, `style` attribute or `<style>` block. No analytics, error reporting or session recording.
- Nothing is kept in the browser but the theme. No number, name, address or code in a page address, a query string, storage or the console.
- No page links to or names the Django Admin.
- Environment variables hold addresses only. Never a secret, token or key.

`tests/rules.test.mjs` holds these on the served files.

**A proof of payment has no address.** `finance.js` reads it through `NOHq.file`, holds it in the tab's memory and shows it from an object address (`blob:`), which it releases when the payment is closed. Only `image/jpeg` and `image/png` go into the `<img>`; `application/pdf` alone is opened in a new tab; any other type is never shown or opened. For this the CSP has `img-src 'self' blob:` and nothing else was added (Coach Ed, 2026-11-11). A frame, `object-src` or any other CSP word needs its own approval.

## Pages

| Path | File |
| --- | --- |
| `/sign-in/`, `/code/`, `/verify/` | `public/auth.html`, `assets/js/auth.js` |
| `/` | `public/index.html`, `assets/js/console.js`, the side menu from `assets/js/menu.js` (one line per page), and the user card and Sign out from `assets/js/shell.js` (loaded after `hq.js` and `menu.js`, before the page's own script, which calls `NOHqShell.signedIn(email)`) |
| `/finance/` | `public/finance.html`, `assets/js/finance.js`: the bank transfer payments an operator reviews (ClickUp z8uq9me581). One address; the open payment is held in memory, so a reload returns to the queue. It asks `me/` who is signed in, then calls the `finance/payments/` routes |
| any other path | `public/not-found.html` |

Shared: `assets/js/hq.js` (the client), `assets/js/theme.js`, `assets/css/hq.css`.

## Configuration

`/assets/js/config.js` is generated at build time by `src/app/assets/js/config.js/route.ts` from one variable (`src/lib/hq-env.mjs`):

| Variable | Default (staging) |
| --- | --- |
| `HQ_STAFF_API_BASE` | `https://hq-staging.negosyonline.com/staff/v1` |

The CSP `connect-src` follows it. The backend must name this app's address in `HQ_STAFF_ORIGIN`; no preview address is ever allowed there. Changing the variable changes where staff codes are sent, so it needs Coach Ed's approval.

## Local preview

```bash
HQ_STAFF_API_BASE=http://ggwp.negosyotest.com:8000/staff/v1 pnpm build
pnpm start --port 3003
```

Open http://hq.negosyotest.com:3003/sign-in/ (local, http, port 3003). It needs the backend running locally with `HQ_HOST=ggwp.negosyotest.com` and `HQ_STAFF_ORIGIN=http://hq.negosyotest.com:3003`.

Tests: `pnpm test` (`node --test`, no extra dependency).
