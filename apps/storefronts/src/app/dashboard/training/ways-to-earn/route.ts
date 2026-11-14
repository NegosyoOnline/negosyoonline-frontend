/* Member Training, GET only (src/lib/training-flow.ts). Signed out it goes to the store home. */
import { trainingWaysToEarn } from "../../../../lib/training-flow.ts";
import { dashGet } from "../../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, trainingWaysToEarn);

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
