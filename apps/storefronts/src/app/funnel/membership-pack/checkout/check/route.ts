/* The checkout's live contact check: the mobile and email the buyer just finished typing, asked of Django, answered
   as {errors: {field: message}} (TWCinc checkout_check_view). A limited or failed check marks nothing: the page reads
   any status but 200 as "no answer". */
import { localMobile } from "../../../../../lib/checkout-flow.ts";
import { storefrontEnv } from "../../../../../lib/env.ts";
import { forbidden, postIsSameOrigin } from "../../../../../lib/member.ts";
import { checkoutCheck } from "../../../../../lib/pack-api.ts";
import { requestHost, siteFor } from "../../../../../lib/site.ts";
import { visitorIp } from "../../../../../lib/visitor.ts";
import { neutralNotFound } from "../../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const MAX_BODY = 4096;

export async function POST(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  if (!postIsSameOrigin(request)) return forbidden();
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return Response.json({ errors: {} }, { status: 413, headers: HEADERS });
  let posted: URLSearchParams;
  try {
    posted = new URLSearchParams(await request.text());
  } catch {
    return Response.json({ errors: {} }, { status: 400, headers: HEADERS });
  }
  const answer = await checkoutCheck(
    { host: requestHost(request), visitor_ip: visitorIp(request.headers), mobile: localMobile(posted.get("mobile") ?? ""), email: (posted.get("email") ?? "").trim() },
    { env: storefrontEnv() },
  );
  if (answer.state === "ok") return Response.json({ errors: answer.errors }, { headers: HEADERS });
  if (answer.state === "unavailable") return neutralNotFound();
  return Response.json({ errors: {} }, { status: answer.state === "refused" && answer.status === 429 ? 429 : 503, headers: HEADERS });
}

export { neutralNotFound as GET, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
