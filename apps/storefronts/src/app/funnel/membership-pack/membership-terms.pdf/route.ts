/* The Membership Terms PDF of one version (?v=<id>), sent on from this host: shown by the popup's viewer, and the
   popup's Download link (&download=1). The version shown is the version recorded, because both links name it. */
import { storefrontEnv } from "../../../../lib/env.ts";
import { fetchAgreementPdf } from "../../../../lib/pack-api.ts";
import { requestHost, siteFor } from "../../../../lib/site.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

const MAX_VERSION_ID_DIGITS = 18; // a bigint primary key has at most 19 digits; anything past this is not a version id

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const version = query.get("v") ?? "";
  if (!/^[0-9]+$/.test(version) || version.length > MAX_VERSION_ID_DIGITS) return neutralNotFound();
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  const file = await fetchAgreementPdf(Number(version), requestHost(request), { env: storefrontEnv() });
  if (!file || file.contentType !== "application/pdf") return neutralNotFound();
  return new Response(file.bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${query.get("download") ? "attachment" : "inline"}; filename="membership-terms.pdf"`,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
