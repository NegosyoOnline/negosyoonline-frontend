/* There is no manual "Mark complete" (Coach Ed, 2026-11-22): a video lesson completes by watching, through /dashboard/training/lesson/<id>/watch/.
   This old address answers the neutral 404 to every method, so an old page or bookmark gets a clean answer and nothing reaches the API. */
import { neutralNotFound } from "../../../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export {
  neutralNotFound as GET, neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS,
};
