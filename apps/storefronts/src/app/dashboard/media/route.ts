/* The member Media Library page, /dashboard/media/ (the filters, the grid and "Load 12 more"). Signed out it goes to the store home; a rejected order sends it to My Purchases. */
import { dashGet } from "../../../lib/dashboard-route.ts";
import { mediaPage } from "../../../lib/media-flow.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, mediaPage);

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
