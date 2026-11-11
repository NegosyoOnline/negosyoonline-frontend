/* What the onboarding routes share: the flow of a request, and the post guard. A site that is not a served Santé site, or
   whose pack is switched off, gets the neutral 404. A post from another site, or from nowhere, is refused before anything
   is read. */
import { CHECKOUT, readMemberCookie } from "./cookies.ts";
import { fetchPack } from "./django.ts";
import { storefrontEnv } from "./env.ts";
import { forbidden, postIsSameOrigin } from "./member.ts";
import type { ObFlow } from "./onboarding-flow.ts";
import { requestHost, siteFor } from "./site.ts";
import { visitorIp } from "./visitor.ts";
import { neutralNotFound } from "../views/neutral.ts";

export async function obFlowFor(request: Request): Promise<ObFlow | null> {
  const site = await siteFor(request);
  if (!site) return null;
  const env = storefrontEnv();
  const host = requestHost(request);
  const pack = await fetchPack(host, env);
  if (!pack) return null;
  return { site, pack, host, request, visitor_ip: visitorIp(request.headers), calls: { env }, token: readMemberCookie(request, CHECKOUT) };
}

/** A page route: GET only, never cached. */
export async function obGet(request: Request, run: (f: ObFlow) => Promise<Response | null>): Promise<Response> {
  const f = await obFlowFor(request);
  if (!f) return neutralNotFound();
  return (await run(f)) ?? neutralNotFound();
}

/** A step route: POST only, from this host, with the posted fields read as text. */
export async function obPost(
  request: Request, run: (f: ObFlow, text: Record<string, string>) => Promise<Response | null>,
): Promise<Response> {
  const f = await obFlowFor(request);
  if (!f) return neutralNotFound();
  if (!postIsSameOrigin(request)) return forbidden();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return neutralNotFound();
  }
  const text: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") text[key] = value;
  return (await run(f, text)) ?? neutralNotFound();
}

export const others = { PUT: neutralNotFound, PATCH: neutralNotFound, DELETE: neutralNotFound, OPTIONS: neutralNotFound };
