import { toast } from "sonner";

import { askForBody } from "@/socket/ask-for-body";
import type { RequestEntry } from "@/store/types";

/**
 * Send a request again with its whole variables, when its event carried a
 * part of them, too large for the event: the app that made the request
 * keeps them whole for its latest requests. A replay never sends a part for
 * the whole, so one whose variables the app no longer keeps is not sent,
 * and the toast says why.
 *
 * @param r - The request
 * @param send - Sends the request again with the variables given
 * @param failure - What the toast says when it cannot be sent
 * @example
 * ```ts
 * if (r.variablesCutFrom === undefined) send(r.variables);
 * else await replayWhole(r, send, "Could not replay api.orders.import");
 * ```
 */
export async function replayWhole(
  r: RequestEntry,
  send: (variables: unknown) => void,
  failure: string,
): Promise<void> {
  const answer = await askForBody({
    event: "request:body",
    sessionId: r.sessionId,
    requestId: r.id,
    part: "request",
  });
  if (answer.ok) send(JSON.parse(answer.data));
  else toast.error(failure, { description: answer.error });
}
