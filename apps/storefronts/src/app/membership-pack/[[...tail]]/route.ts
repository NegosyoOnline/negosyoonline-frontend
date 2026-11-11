/* The former /membership-pack/... paths, kept as redirects to /funnel/membership-pack/... (TWCinc urls.py, Coach
   Ed's 2026-10-29 ruling): 302 with the query string kept, 307 for a method that is not GET or HEAD so a POST keeps
   its method. Only the paths TWCinc listed redirect; a site that is not a served Santé site, and any other path,
   gets the neutral 404. */
import { siteFor } from "../../../lib/site.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

const TAILS: Record<string, string> = {
  "": "landing-page/",
  "checkout/": "checkout/",
  "checkout/return/": "checkout/return/",
  "checkout/status/": "checkout/status/",
  "checkout/done/": "checkout/done/",
  "checkout/retry/": "checkout/retry/",
  "checkout/continue/": "checkout/continue/",
};

async function legacy(request: Request, context: { params: Promise<{ tail?: string[] }> }): Promise<Response> {
  const { tail } = await context.params;
  const key = (tail ?? []).length ? `${(tail ?? []).join("/")}/` : "";
  const target = TAILS[key];
  if (target === undefined) return neutralNotFound();
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  const query = new URL(request.url).search;
  const status = request.method === "GET" || request.method === "HEAD" ? 302 : 307;
  return new Response(null, {
    status,
    headers: { Location: `/funnel/membership-pack/${target}${query}`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

export { legacy as GET, legacy as POST, legacy as PUT, legacy as PATCH, legacy as DELETE, legacy as HEAD };
export { neutralNotFound as OPTIONS };
