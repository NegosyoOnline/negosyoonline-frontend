/* The buyer's own payment proof, sent on from this host: no URL of the file store ever reaches the browser. */
import { proofGet } from "../../../../lib/portal-flow.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return proofGet(request, id);
}

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
