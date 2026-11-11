/* Every path that has no page of its own: the neutral 404, whatever the host or method.
   Django is not asked: there is nothing here to show a served site either. */
import { neutralNotFound } from "../../views/neutral.ts";

export const dynamic = "force-dynamic";

export {
  neutralNotFound as GET,
  neutralNotFound as POST,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
