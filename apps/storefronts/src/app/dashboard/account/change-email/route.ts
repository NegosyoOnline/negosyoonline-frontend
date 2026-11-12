/* The email change in three steps, /dashboard/account/change-email/. */
import { changeGet, changePost } from "../../../../lib/account-flow.ts";
import { dashGet, dashPost, textOf } from "../../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, (d) => changeGet(d, "email"));
export const POST = (request: Request) => dashPost(request, (d, form) => changePost(d, "email", textOf(form)));

export { neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
