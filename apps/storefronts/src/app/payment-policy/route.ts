/* /payment-policy/: one store policy page. */
import { policyRoute } from "../../lib/policy-route.ts";
import { neutralNotFound } from "../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = policyRoute("payment-policy");

export {
  neutralNotFound as POST,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
