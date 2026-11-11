/* The site root. A served Santé site gets its home; anything else gets the neutral 404. */
import { htmlResponse } from "../lib/html.ts";
import { siteFor } from "../lib/site.ts";
import { neutralNotFound } from "../views/neutral.ts";
import { placeholderDocument } from "../views/placeholder.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  return htmlResponse(placeholderDocument(site.display_name));
}

export {
  neutralNotFound as POST,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
