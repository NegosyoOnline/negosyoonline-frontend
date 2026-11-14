/* Marks all of the member's own notifications read, /dashboard/notifications/read-all/ (POST; JSON, same origin). */
import { bellReadAll } from "../../../../lib/bell-flow.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const POST = bellReadAll;

export { neutralNotFound as GET, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
