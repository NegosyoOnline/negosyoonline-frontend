/* The member Media Library page, /dashboard/media/ (a plain page until its task lands). Signed out it goes to the store home; a rejected order sends it to My Purchases. */
import { mediaPage } from "../../../lib/dashboard-flow.ts";
import { dashGet } from "../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, mediaPage);

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
