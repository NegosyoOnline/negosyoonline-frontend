/* Sign out, POST only: Django ends the session, both cookies are cleared, and the visitor goes to the store home
   (the next visit starts at the number box). Signing out twice, or with an old cookie, is not an error. */
import { CHECKOUT, MEMBER, MEMBER_PRE, clearCookie } from "../../../lib/cookies.ts";
import { memberSignOut } from "../../../lib/django.ts";
import { callFor, forbidden, postIsSameOrigin, redirect } from "../../../lib/member.ts";
import { siteFor } from "../../../lib/site.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  if (!postIsSameOrigin(request)) return forbidden();
  const call = callFor(request);
  if (call.member_token) await memberSignOut({ host: call.host, token: call.member_token }, { env: call.env });
  const response = redirect("/");
  clearCookie(response, request, MEMBER);
  clearCookie(response, request, MEMBER_PRE);
  clearCookie(response, request, CHECKOUT);
  return response;
}

export {
  neutralNotFound as GET,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
