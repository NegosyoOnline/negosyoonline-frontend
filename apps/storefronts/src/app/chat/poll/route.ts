/* The website chat widget posts here (see src/lib/chat-flow.ts). Only a same-origin JSON post from a served Santé site is
   answered; any other method, host or shape gets the neutral 404. */
import { chatPollPost as POST } from "../../../lib/chat-flow.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export { POST };
export {
  neutralNotFound as GET,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
