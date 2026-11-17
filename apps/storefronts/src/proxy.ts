/* www -> apex for a custom hostname (ClickUp z8uq9mg8gw). Runs only for hosts that start with "www." (the matcher), asks Django
   whether the apex is a site's custom hostname (src/lib/custom-host.ts) and, only then, answers a permanent redirect to the
   apex with the same path and query. Every other host and every other answer passes through untouched. */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { wwwRedirectTarget } from "./lib/custom-host.ts";
import { isSecure } from "./lib/cookies.ts";
import { fetchSite } from "./lib/django.ts";
import { storefrontEnv } from "./lib/env.ts";
import { parseAliases } from "./lib/host.ts";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const env = storefrontEnv();
  const target = await wwwRedirectTarget({
    host: request.headers.get("host"),
    url: request.url,
    secure: isSecure(request),
    aliases: parseAliases(env.hostAliases),
    lookup: (host) => fetchSite(host, env),
  });
  if (!target) return NextResponse.next();
  const response = NextResponse.redirect(target, 308);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: [{ source: "/:path*", has: [{ type: "header", key: "host", value: "www\\..+" }] }],
};
