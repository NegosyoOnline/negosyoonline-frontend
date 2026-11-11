/* The mobile change in three steps, /dashboard/account/change-mobile/. */
import { changeGet, changePost } from "../../../../lib/account-flow.ts";
import { dashGet, dashPost, textOf } from "../../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, (d) => changeGet(d, "mobile"));
export const POST = (request: Request) => dashPost(request, (d, form) => changePost(d, "mobile", textOf(form)));

export { neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
