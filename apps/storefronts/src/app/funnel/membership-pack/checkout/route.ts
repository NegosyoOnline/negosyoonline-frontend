/* The Membership Pack checkout page and its posts (steps, tokens and words: src/lib/checkout-flow.ts). A site that is
   not a served Santé site, or whose pack is switched off, gets the neutral 404. Never cached, never indexed. A post
   from another site, or from nowhere, is refused before anything is read. */
import { CHECKOUT, readMemberCookie } from "../../../../lib/cookies.ts";
import { checkoutGet, checkoutPost, readPost, type Flow } from "../../../../lib/checkout-flow.ts";
import { fetchPack } from "../../../../lib/django.ts";
import { storefrontEnv } from "../../../../lib/env.ts";
import { forbidden, postIsSameOrigin } from "../../../../lib/member.ts";
import { requestHost, siteFor } from "../../../../lib/site.ts";
import { visitorIp } from "../../../../lib/visitor.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

async function flowFor(request: Request): Promise<Flow | null> {
  const site = await siteFor(request);
  if (!site) return null;
  const env = storefrontEnv();
  const host = requestHost(request);
  const pack = await fetchPack(host, env);
  if (!pack) return null;
  return {
    site, pack, host, request, visitor_ip: visitorIp(request.headers), calls: { env },
    token: readMemberCookie(request, CHECKOUT),
  };
}

export async function GET(request: Request): Promise<Response> {
  const flow = await flowFor(request);
  if (!flow) return neutralNotFound();
  return checkoutGet(flow);
}

export async function POST(request: Request): Promise<Response> {
  const flow = await flowFor(request);
  if (!flow) return neutralNotFound();
  if (!postIsSameOrigin(request)) return forbidden();
  const posted = await readPost(request);
  if (!posted) return neutralNotFound();
  return (await checkoutPost(flow, posted.text, posted.proof)) ?? neutralNotFound();
}

export { neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
