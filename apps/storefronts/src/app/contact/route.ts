/* The home's "Send a Message" form posts here. The form goes to Django (src/lib/django.ts),
   which emails it to the store's own contact email; nothing of it is stored or logged here.

   Sent: on to the home with the thank-you line, by a redirect, so a reload sends nothing twice.
   Fields refused: the home again with each error under its field. Over the limit of messages
   from one address: the home again with the approved "too many messages" line. Anything else
   (no contact email, the API down or slow): the home again with the approved "could not send"
   note. The typed values are kept in all three, and the statuses (400, 429, 200) are the
   approved site's. Anything that is not a post from a served
   Santé site gets the neutral 404.

   The page's script (public/assets/sante/js/contact-form.js) posts the same form here and asks
   for JSON (Accept: application/json). It gets the same outcome as a small answer instead of a
   page: the state, and the field errors or the note the page would have shown. Nothing more. */
import { sendContact, type ContactResult } from "../../lib/django.ts";
import { storefrontEnv } from "../../lib/env.ts";
import { htmlResponse } from "../../lib/html.ts";
import { homePayMethods } from "../../lib/home-pay.ts";
import { isSignedIn } from "../../lib/member.ts";
import { requestHost, siteFor } from "../../lib/site.ts";
import { visitorIp } from "../../lib/visitor.ts";
import { neutralNotFound } from "../../views/neutral.ts";
import { homeDocument } from "../../views/sante/home.ts";
import {
  CONTACT_FAILED_NOTE, CONTACT_LIMITED_NOTE, CONTACT_SENT_PATH, failedContactForm, homeModel, invalidContactForm, limitedContactForm,
} from "../../views/sante/model.ts";

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

function wantsJson(request: Request): boolean {
  return (request.headers.get("accept") ?? "").toLowerCase().includes("application/json");
}

/** The outcome for the page's script: only what the page itself would have shown. */
function jsonAnswer(result: ContactResult): Response {
  const [status, body] =
    result.state === "sent" ? [200, { state: "sent" }]
    : result.state === "invalid" ? [400, { state: "invalid", errors: result.errors }]
    : result.state === "limited" ? [429, { state: "limited", note: CONTACT_LIMITED_NOTE }]
    : [200, { state: "failed", note: CONTACT_FAILED_NOTE }];
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
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
  if (wantsJson(request)) return jsonAnswer(result);
  if (result.state === "sent") {
    return new Response(null, { status: 303, headers: { Location: CONTACT_SENT_PATH, "Cache-Control": "no-store" } });
  }
  if (result.state === "invalid") {
    return htmlResponse(homeDocument({ ...homeModel(site, invalidContactForm(posted, result.errors), undefined, await isSignedIn(request)), pay_methods: await homePayMethods(requestHost(request)) }), 400);
  }
  if (result.state === "limited") {
    return htmlResponse(homeDocument({ ...homeModel(site, limitedContactForm(posted), undefined, await isSignedIn(request)), pay_methods: await homePayMethods(requestHost(request)) }), 429);
  }
  return htmlResponse(homeDocument({ ...homeModel(site, failedContactForm(posted), undefined, await isSignedIn(request)), pay_methods: await homePayMethods(requestHost(request)) }));
}

export {
  neutralNotFound as GET,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
