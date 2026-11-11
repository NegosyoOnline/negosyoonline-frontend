/* The home's "Send a Message" form posts here. Sending is not built in this slice: a post
   sends nothing and stores nothing, and answers the home again with the approved "could not
   send" note and the typed values kept. Anything that is not a post from a served Santé site
   gets the neutral 404. */
import { htmlResponse } from "../../lib/html.ts";
import { siteFor } from "../../lib/site.ts";
import { neutralNotFound } from "../../views/neutral.ts";
import { homeDocument } from "../../views/sante/home.ts";
import { failedContactForm, homeModel } from "../../views/sante/model.ts";

export const dynamic = "force-dynamic";

const MAX_BODY = 64 * 1024; // the form's four fields hold under 5,000 characters in all

async function postedFields(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/x-www-form-urlencoded")) return new URLSearchParams();
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return new URLSearchParams();
  try {
    const body = await request.text();
    return new URLSearchParams(body.length > MAX_BODY ? "" : body);
  } catch {
    return new URLSearchParams();
  }
}

export async function POST(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  return htmlResponse(homeDocument(homeModel(site, failedContactForm(await postedFields(request)))));
}

export {
  neutralNotFound as GET,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
