/* The bell's list and count, /dashboard/notifications/ (JSON, same origin, no-store). */
import { bellGet } from "../../../lib/bell-flow.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = bellGet;

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
