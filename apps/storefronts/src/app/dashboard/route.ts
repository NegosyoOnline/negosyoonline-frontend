/* The member dashboard home, /dashboard/. Signed out, it goes to the store home (as TWCinc's Santé theme does);
   signed in, the hero. Never cached, never indexed. */
import { MEMBER, clearCookie } from "../../lib/cookies.ts";
import { memberMe } from "../../lib/django.ts";
import { htmlResponse } from "../../lib/html.ts";
import { callFor, redirect } from "../../lib/member.ts";
import { siteFor } from "../../lib/site.ts";
import { neutralNotFound } from "../../views/neutral.ts";
import { chrome, homeDocument } from "../../views/sante/member.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  const call = callFor(request);
  if (!call.member_token) return redirect("/");
  const me = await memberMe({ host: call.host, token: call.member_token }, { env: call.env });
  if (me.state === "ok") return htmlResponse(homeDocument(chrome(site), me.member.full_name));
  if (me.state === "refused" && me.status === 401) {
    const response = redirect("/");
    clearCookie(response, request, MEMBER);
    return response;
  }
  return neutralNotFound(); // switched off, or Django not answering: nothing is shown
}

export {
  neutralNotFound as POST,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
