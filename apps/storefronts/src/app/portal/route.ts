/* The buyer portal sign-in, /portal/: for a paid Membership Pack buyer of a Santé site that is off. Signed in, it goes to
   /portal/orders/. A served site, an unknown host or a closed portal answers the neutral 404 (src/lib/portal-flow.ts).
   Never cached, never indexed. */
import { homeGet, signInPost } from "../../lib/portal-flow.ts";
import { neutralNotFound } from "../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => homeGet(request);
export const POST = (request: Request) => signInPost(request);

export { neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
