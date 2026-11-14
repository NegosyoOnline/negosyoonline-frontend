/* The member dashboard home, /dashboard/. Signed out, it goes to the store home (as TWCinc's Santé theme does);
   signed in, the hero, the notices and the slots for the training tasks (a rejected order goes to My Purchases). Never cached, never indexed. */
import { homePage } from "../../lib/dashboard-flow.ts";
import { callFor } from "../../lib/member.ts";
import { siteFor } from "../../lib/site.ts";
import { neutralNotFound } from "../../views/neutral.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  const call = callFor(request);
  return homePage({ site, call, calls: { env: call.env } });
}

export {
  neutralNotFound as POST,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
