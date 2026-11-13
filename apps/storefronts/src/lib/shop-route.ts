/* What the shop routes share: a served Santé site (else the neutral 404) and the same-site check on every post. */
import { forbidden, postIsSameOrigin } from "./member.ts";
import { readPost } from "./checkout-flow.ts";
import { siteFor } from "./site.ts";
import { shopOf, type Shop } from "./shop-flow.ts";
import { neutralNotFound } from "../views/neutral.ts";

export async function shopFor(request: Request): Promise<Shop | null> {
  const site = await siteFor(request);
  return site ? shopOf(request, site) : null;
}

export async function shopGet(request: Request, run: (s: Shop) => Promise<Response>): Promise<Response> {
  const s = await shopFor(request);
  return s ? run(s) : neutralNotFound();
}

/** A post: from this host only, read as text fields and an optional proof file. A post the page does not know is the neutral 404. */
export async function shopPost(request: Request, run: (s: Shop, text: Record<string, string>, proof: File | null) => Promise<Response | null>): Promise<Response> {
  const s = await shopFor(request);
  if (!s) return neutralNotFound();
  if (!postIsSameOrigin(request)) return forbidden();
  const posted = await readPost(request);
  if (!posted) return neutralNotFound();
  return (await run(s, posted.text, posted.proof)) ?? neutralNotFound();
}

export const others = { PUT: neutralNotFound, PATCH: neutralNotFound, DELETE: neutralNotFound, OPTIONS: neutralNotFound };
