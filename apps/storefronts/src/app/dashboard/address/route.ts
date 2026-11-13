/* The member Home address page, /dashboard/address/ (TWCinc's C14 editor). */
import { addressGet, addressPost } from "../../../lib/address-flow.ts";
import { dashGet, dashPost, textOf } from "../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, addressGet);
export const POST = (request: Request) => dashPost(request, (d, form) => addressPost(d, textOf(form)));

export { neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
