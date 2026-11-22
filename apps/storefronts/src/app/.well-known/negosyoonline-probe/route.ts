/* /.well-known/negosyoonline-probe?n=<nonce>: the answer to the domains worker's HTTPS probe (ClickUp z8uq9mhgvh, design z8uq9mcyu0
   R4). The worker asks it at https://www.<domain>/ with a one-time nonce; this server answers {"site": <public id>, "n": <nonce>},
   taking the site id from Django (GET /storefront/v1/domain-probe/?host=, server credential). The worker accepts the host only when
   the id is the claim's own and the nonce comes back.

   It answers by domain state, not by site, so it is not siteFor(). Anything else, with no nonce, a nonce of the wrong shape, a host
   Django does not know, or a backend that is off, is the neutral 404, so nothing is learned about a host that is not being connected.
   The answer is never cached, carries no cookie and no other field. */
import { fetchDomainProbe } from "../../../lib/django.ts";
import { storefrontEnv } from "../../../lib/env.ts";
import { requestHost } from "../../../lib/site.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

/* The backend's nonce is secrets.token_urlsafe(16): 22 characters of this alphabet. Wider bounds, never a free-form echo. */
const NONCE = /^[A-Za-z0-9_-]{16,64}$/;

export async function GET(request: Request): Promise<Response> {
  const nonce = new URL(request.url).searchParams.get("n") ?? "";
  if (!NONCE.test(nonce)) return neutralNotFound();
  const site = await fetchDomainProbe(requestHost(request), storefrontEnv());
  if (!site) return neutralNotFound();
  return Response.json({ site, n: nonce }, { headers: { "Cache-Control": "no-store" } });
}

export {
  neutralNotFound as POST,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
