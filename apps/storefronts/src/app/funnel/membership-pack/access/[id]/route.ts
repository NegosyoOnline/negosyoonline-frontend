/* The secure order-access link, /funnel/membership-pack/access/<signed-id>/. GET changes nothing (a mail scanner's
   GET spends nothing); only the button's POST spends the link and starts the buyer on a fresh checkout cookie. */
import { accessGet, accessLinkOk, accessPost } from "../../../../../lib/onboarding-flow.ts";
import { obFlowFor } from "../../../../../lib/onboarding-route.ts";
import { forbidden, postIsSameOrigin } from "../../../../../lib/member.ts";
import { neutralNotFound } from "../../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!accessLinkOk(id)) return neutralNotFound();
  const f = await obFlowFor(request);
  if (!f) return neutralNotFound();
  return (await accessGet(f, id)) ?? neutralNotFound();
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!accessLinkOk(id)) return neutralNotFound();
  const f = await obFlowFor(request);
  if (!f) return neutralNotFound();
  if (!postIsSameOrigin(request)) return forbidden();
  let text: Record<string, string> = {};
  try {
    const form = await request.formData();
    for (const [key, value] of form.entries()) if (typeof value === "string") text[key] = value;
  } catch {
    text = {};
  }
  return (await accessPost(f, id, text)) ?? neutralNotFound();
}

export { neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
