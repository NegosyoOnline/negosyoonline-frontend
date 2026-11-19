/* The site root. A served Santé site gets its home; anything else gets the neutral 404.
   "?contact=sent" is where /contact/ sends a visitor whose message went out: the home then
   shows the form's thank-you line, as the approved site does. */
import { storefrontEnv } from "../lib/env.ts";
import { htmlResponse } from "../lib/html.ts";
import { isSignedIn } from "../lib/member.ts";
import { afterResponse, metaPage } from "../lib/meta.ts";
import { homePayMethods } from "../lib/home-pay.ts";
import { homeDrawer } from "../lib/shop-flow.ts";
import { requestHost, siteFor } from "../lib/site.ts";
import { neutralNotFound } from "../views/neutral.ts";
import { homeDocument } from "../views/sante/home.ts";
import { emptyContactForm, homeModel, sentContactForm } from "../views/sante/model.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  const sent = new URL(request.url).searchParams.get("contact") === "sent";
  const [signedIn, pay_methods] = await Promise.all([isSignedIn(request), homePayMethods(requestHost(request))]);
  const model = { ...homeModel(site, sent ? sentContactForm() : emptyContactForm(), undefined, signedIn), pay_methods };
  /* The Meta Pixel: the notice, or after Accept the data block, with the server events sent after the response. */
  const meta = metaPage({ request, site, host: requestHost(request), env: storefrontEnv(), events: ["PageView"] });
  if (meta.send) await afterResponse(meta.send);
  return meta.finish(htmlResponse(homeDocument({ ...model, drawer: await homeDrawer(request, site), tracking: meta.markup }))); // the basket's badge and rows are the visitor's own
}

export {
  neutralNotFound as POST,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
