/* Sign out of the buyer portal, POST only: Django ends the session, the cookies are cleared, and the visitor goes to /portal/. */
import { signOutPost } from "../../../lib/portal-flow.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const POST = (request: Request) => signOutPost(request);

export {
  neutralNotFound as GET,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
