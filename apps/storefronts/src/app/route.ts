/* The site root. A served Santé site gets its home; anything else gets the neutral 404.
   "?contact=sent" is where /contact/ sends a visitor whose message went out: the home then
   shows the form's thank-you line, as the approved site does. */
import { htmlResponse } from "../lib/html.ts";
import { isSignedIn } from "../lib/member.ts";
import { siteFor } from "../lib/site.ts";
import { neutralNotFound } from "../views/neutral.ts";
import { homeDocument } from "../views/sante/home.ts";
import { emptyContactForm, homeModel, sentContactForm } from "../views/sante/model.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  const sent = new URL(request.url).searchParams.get("contact") === "sent";
  return htmlResponse(homeDocument(homeModel(site, sent ? sentContactForm() : emptyContactForm(), undefined, await isSignedIn(request))));
}

export {
  neutralNotFound as POST,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
