/* The member Account page, /dashboard/account/. */
import { accountPage } from "../../../lib/account-flow.ts";
import { dashGet } from "../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, accountPage);

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
