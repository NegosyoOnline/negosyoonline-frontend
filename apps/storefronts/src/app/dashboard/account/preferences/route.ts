/* The promotional-text toggle's save, POST /dashboard/account/preferences/ (PROMO-CONSENT). */
import { preferencesPost } from "../../../../lib/account-flow.ts";
import { dashPost, textOf } from "../../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const POST = (request: Request) => dashPost(request, (d, form) => preferencesPost(d, textOf(form)));

export { neutralNotFound as GET, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
