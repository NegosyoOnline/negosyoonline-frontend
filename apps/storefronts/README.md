# NegosyoOnline storefronts

The public pages of a Subscriber's site. Staging is `https://<address>.storefronts-staging.negosyonline.com` (Vercel project `negosyoonline-storefronts`, deployed from `main`).

The server draws every page. A request arrives for some host; the server asks Django whether a site is served there and, if so, returns the finished HTML page. Django stays authoritative: this app holds no tenant rule of its own, and the browser never calls the API.

## How a page is answered

1. `src/lib/host.ts` cleans the request's `Host` header. The host is untrusted and is only a lookup value.
2. `src/lib/django.ts` calls `GET <STOREFRONT_API_BASE>/storefront/v1/site/?host=<host>` with `Authorization: Bearer <STOREFRONT_SERVER_SECRET>`, never cached, 5-second limit. The surface is described in the backend's `docs/runbooks/storefront.md`.
3. A served Santé site gets its page. Everything else gets the neutral 404 (`src/views/neutral.ts`): a host that is not a served site, a site of another template, a path with no page, the API down or slow, a wrong or missing secret. Unknown fails closed, and the reason goes to the server log without the secret or the URL.

Pages are route handlers that return whole HTML documents (`src/app/route.ts`, `src/app/[...path]/route.ts`), not React components. Documents are built with the `html` tag in `src/lib/html.ts`, which escapes every interpolated value unless it is explicitly marked safe. No page carries an inline script.

Page templates live in `src/views/`, not `src/pages/`: Next.js treats a `src/pages` folder as its Pages Router.

| Path | Answer |
| --- | --- |
| `/` | A served Santé site: the Santé home. Otherwise the neutral 404. |
| `/contact/` | A post from a served Santé site: the home again with the "could not send" note and the typed values kept. The form's address is `/contact/#contact-form`, so the browser shows the answer at the "Send a Message" card, where the note is. Nothing is sent or stored; the sending is a later task. Any other method, or any other host: the neutral 404. |
| `/assets/sante/*` | The approved Santé files, served as static files. |
| anything else | The neutral 404, with or without a trailing slash, any method. |

Every page is sent with `Cache-Control: no-store` and `X-Robots-Tag: noindex`.

## The Santé home

`src/views/sante/home.ts` is the approved home page and its basket drawer, transcribed by script from TWCinc's `home.html` and `_store_drawer.html` (commit `ac483675c`): markup, class names, text, order and inline styles are the template's, character for character. Do not reformat it. Its header lists the few places where it differs on purpose. `src/views/sante/model.ts` builds what the page shows from the storefront surface's answer.

The page shows the store's own contact email and the distributor's mobile. The "Office Location" block is the Santé head office, fixed text, as the approved template prints it. The business seal and the distributor photo are off until private files exist. The basket is always empty: no product page exists yet. Links to pages of later slices (`/products/`, `/cart/`, `/checkout/`, `/dashboard/…`, `/funnel/…`) are kept as approved and answer the neutral 404 for now.

### Assets

The 24 approved files are in `public/assets/sante/{css,js,img}`, byte for byte as in TWCinc. A page links them through `asset()` in `src/lib/assets.ts`, which adds `?v=<first 8 characters of the file's SHA-256>`. To change a file: replace it, run `shasum -a 256` on it, and put the first 8 characters on its line in `src/lib/assets.ts`. `tests/assets.test.ts` fails while the two disagree.

## Configuration

Read on each request by `src/lib/env.ts`, on the server only. None is prefixed `NEXT_PUBLIC_`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `STOREFRONT_SERVER_SECRET` | none | The one credential for the Django storefront surface; the same value as on the API. At least 32 characters. Unset or shorter: every page is the neutral 404 and Django is not called. |
| `STOREFRONT_API_BASE` | `https://api-staging.negosyonline.com` | The API origin, so a deploy with no variables set never talks to production. |
| `STOREFRONT_HOST_ALIASES` | unset | Local use only. `from=to` pairs, comma-separated: a request for host `from` is looked up as `to`. Leave unset on Vercel. |

The secret is set by Coach Ed. It never goes in code, a test, a log line or a pull request. Local values live in `.env.local`, which is ignored.

## Headers

`next.config.ts` sends, on every path: the CSP (`script-src 'self'`; styles from this origin, inline `style` attributes and Google Fonts; images from this origin and `data:`; no framing; forms post to this origin only), `Strict-Transport-Security` without `includeSubDomains` or `preload`, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` and `Permissions-Policy`. `/assets/*` is cached for one hour.

## Local use

The API runs locally with `SITE_PARENT_HOST=negosyotest.com`, `BILLING_ENABLED=1`, `STOREFRONT_ENABLED=1` and a test secret. In `.env.local` here:

```
STOREFRONT_API_BASE=http://127.0.0.1:8032
STOREFRONT_SERVER_SECRET=<the local API's test secret>
STOREFRONT_HOST_ALIASES=www.santetest.com=<address>.negosyotest.com
```

```bash
pnpm dev
```

A site opens at `http://<address>.negosyotest.com:3002/` (HTTP, port 3002, local), and the Santé reference host at `http://www.santetest.com:3002/` through the alias. Without a hosts entry: `curl -H "Host: <address>.negosyotest.com" http://127.0.0.1:3002/`.

## Checks

```bash
pnpm lint
```

```bash
pnpm test
```

```bash
pnpm build
```

Tests are `tests/*.test.ts`, run by `node --test` (Node 22 runs TypeScript directly, which is why imports inside `src/` spell the `.ts` extension).
