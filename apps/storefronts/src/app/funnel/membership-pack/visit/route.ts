/* The Membership Pack page visitor (ClickUp z8uq9mfw14). The landing script (js/pack-visit.js) and the checkout script
   (js/pack-checkout.js) post here, same origin only, as JSON:
     {op:"begin", ref?}                          -> {ref}
     {op:"event", ref, event, percent?}          -> {ok:true}     event: start | percent (25, 50, 75, 90, 100) | checkout
     {op:"contact", ref, full_name, mobile, email} -> {ok:true}   saved when a checkout field loses focus
   This server holds the credential and the visitor's address; the browser holds the ref in localStorage. Nothing here is
   logged or sent to Meta. The one cookie it writes is no_vid (ClickUp z8uq9mg7h3): a copy of the ref for the server's
   Meta events, set on a successful answer only after the visitor pressed Accept, HttpOnly, SameSite=Lax, 180 days (see
   src/lib/meta.ts). Without Accept nothing is set. Any refusal or failure answers a bare status the scripts ignore. */
import { localMobile } from "../../../../lib/checkout-flow.ts";
import { storefrontEnv } from "../../../../lib/env.ts";
import { forbidden, postIsSameOrigin } from "../../../../lib/member.ts";
import { setVisitorCookie } from "../../../../lib/meta.ts";
import { visitBegin, visitContact, visitEvent } from "../../../../lib/pack-api.ts";
import { requestHost, siteFor } from "../../../../lib/site.ts";
import { visitorIp } from "../../../../lib/visitor.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const MAX_BODY = 4096;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  if (!postIsSameOrigin(request)) return forbidden();
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return Response.json({}, { status: 413, headers: HEADERS });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await request.text());
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("shape");
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({}, { status: 400, headers: HEADERS });
  }
  const base = { host: requestHost(request), visitor_ip: visitorIp(request.headers) };
  const ref = text(body.ref, 40);
  const calls = { env: storefrontEnv() };
  let answer;
  if (body.op === "begin") answer = await visitBegin({ ...base, ref }, calls);
  else if (body.op === "event") {
    const percent = typeof body.percent === "number" && Number.isInteger(body.percent) ? body.percent : undefined;
    answer = await visitEvent({ ...base, ref, event: text(body.event, 16), ...(percent === undefined ? {} : { percent }) }, calls);
  } else if (body.op === "contact") {
    answer = await visitContact(
      { ...base, ref, full_name: text(body.full_name, 200), mobile: localMobile(text(body.mobile, 40)), email: text(body.email, 254).trim() },
      calls,
    );
  } else return Response.json({}, { status: 400, headers: HEADERS });
  if (answer.state === "ok") {
    const issued = "ref" in answer ? answer.ref : ref;
    const response = Response.json("ref" in answer ? { ref: answer.ref } : { ok: true }, { headers: HEADERS });
    setVisitorCookie(response, request, issued); // only after Accept, only a well-shaped ref
    return response;
  }
  if (answer.state === "unavailable") return neutralNotFound();
  return Response.json({}, { status: answer.state === "refused" ? answer.status : 503, headers: HEADERS });
}

export { neutralNotFound as GET, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
