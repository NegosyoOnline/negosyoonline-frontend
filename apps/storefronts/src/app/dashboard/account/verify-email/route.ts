/* Email verification, /dashboard/account/verify-email/. */
import { verifyEmailGet, verifyEmailPost } from "../../../../lib/account-flow.ts";
import { dashGet, dashPost, textOf } from "../../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, verifyEmailGet);
export const POST = (request: Request) => dashPost(request, (d, form) => verifyEmailPost(d, textOf(form)));

export { neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
