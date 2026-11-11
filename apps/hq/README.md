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

**A proof of payment has no address.** `finance.js` reads it through `NOHq.file`, holds it in the tab's memory and shows it from an object address (`blob:`), which it releases when the payment is closed. Only `image/jpeg` and `image/png` go into the `<img>`; `application/pdf` is shown as a file tile (the CSP has no frame or object), and the Preview button opens the held object in a new tab with no second call; any other type is never shown or opened. For this the CSP has `img-src 'self' blob:` and nothing else was added (Coach Ed, 2026-11-11). A frame, `object-src` or any other CSP word needs its own approval.

## Pages

| Path | File |
| --- | --- |
| `/sign-in/`, `/code/`, `/verify/` | `public/auth.html`, `assets/js/auth.js` |
| `/` | `public/index.html`, `assets/js/console.js`, the side menu from `assets/js/menu.js` (one line per page), and the user chip, its pop-up card (name, email, theme, Sign out) and every Sign out button from `assets/js/shell.js` (loaded after `hq.js` and `menu.js`, before the page's own script, which calls `NOHqShell.signedIn(email)`) |
| `/finance/` | `public/finance.html`, `assets/js/finance.js`: the bank transfer payments an operator reviews (ClickUp z8uq9me581): the one-payment view is two cards (details, proof), and Confirm and Reject payment open dialogs. One address; the open payment is held in memory, so a reload returns to the queue. It asks `me/` who is signed in, then calls the `finance/payments/` routes |
| `/inbox/sms/`, `/inbox/sms/new/` | `public/inbox.html`, `assets/js/inbox.js` (ClickUp z8uq9me128): the SMS list, a conversation with its reply form, and New SMS. One document that changes view in the browser; the open conversation is held in memory, so no number, text or id is in an address and a reload returns to the list. It asks `me/` who is signed in, then calls the six `inbox/` routes. The Inbox menu entry, its unread count, and the search and bell buttons come alive only when `inbox/status/` answers 200 (`menu.js`); on any other answer the Inbox does not appear anywhere |
| `/inbox/messenger/`, `/inbox/instagram/`, `/inbox/tiktok/`, `/inbox/email/`, `/inbox/webchat/` | `public/inbox-platform.html`, `assets/js/inbox-platform.js`: one "not yet available" card |
| `/contacts/`, `/contacts/new/`, `/contacts/groups/`, `/contacts/upload/` | `public/contacts.html`, `assets/js/contacts.js`: the SMS contacts and groups (ClickUp z8uq9me128, plan 7). One document serves four addresses and none holds a name, number or id: an existing contact opens inside the list page with its id in memory, and a reload returns to the list. The CSV upload is two steps (check, then save); its text is resent at the save and nothing is stored in the browser. The Contacts menu entry shows only when `contacts/status/` answers that the feature is on |
| `/inbox/sms/bulk/` | `public/bulk.html`, `assets/js/bulk.js` (ClickUp z8uq9me128, plan 9): the Bulk SMS page. One address; the list of bulk sends with Stop, three steps (write the text and choose who gets it, check and confirm, progress). It calls the seven `bulk/` routes. The Bulk SMS button on the SMS list shows only when `bulk/status/` answers 200. No number, text or id is in an address; the file's text and pasted numbers are held in memory only, from the check to the confirm, and cleared on confirm and on leaving the page. There is no timer: Refresh and the tab becoming visible refresh the list and progress |
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
