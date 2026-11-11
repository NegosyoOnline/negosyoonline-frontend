/* The home's "Send a Message" form posts here. The form goes to Django (src/lib/django.ts),
   which emails it to the store's own contact email; nothing of it is stored or logged here.

   Sent: on to the home with the thank-you line, by a redirect, so a reload sends nothing twice.
   Fields refused: the home again with each error under its field. Anything else (no contact
   email, over the limit, the API down or slow): the home again with the approved "could not
   send" note. The typed values are kept in both. Anything that is not a post from a served
   Santé site gets the neutral 404. */
import { sendContact } from "../../lib/django.ts";
import { storefrontEnv } from "../../lib/env.ts";
import { htmlResponse } from "../../lib/html.ts";
import { requestHost, siteFor } from "../../lib/site.ts";
import { visitorIp } from "../../lib/visitor.ts";
import { neutralNotFound } from "../../views/neutral.ts";
import { homeDocument } from "../../views/sante/home.ts";
import { CONTACT_SENT_PATH, failedContactForm, homeModel, invalidContactForm } from "../../views/sante/model.ts";

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
  const posted = await postedFields(request);
  const field = (key: string) => posted.get(key) ?? "";
  const result = await sendContact(
    {
      host: requestHost(request),
      visitor_ip: visitorIp(request.headers),
      name: field("name"),
      email: field("email"),
      subject: field("subject"),
      message: field("message"),
      website: field("website"),
    },
    storefrontEnv(),
  );
  if (result.state === "sent") {
    return new Response(null, { status: 303, headers: { Location: CONTACT_SENT_PATH, "Cache-Control": "no-store" } });
  }
  if (result.state === "invalid") {
    return htmlResponse(homeDocument(homeModel(site, invalidContactForm(posted, result.errors))), 400);
  }
  return htmlResponse(homeDocument(homeModel(site, failedContactForm(posted))));
}

export {
  neutralNotFound as GET,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
