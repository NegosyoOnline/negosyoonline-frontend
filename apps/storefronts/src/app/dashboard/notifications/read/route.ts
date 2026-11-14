/* Marks one of the member's own notifications read, /dashboard/notifications/read/ (POST {"id"}; JSON, same origin). */
import { bellRead } from "../../../../lib/bell-flow.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const POST = bellRead;

export { neutralNotFound as GET, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
