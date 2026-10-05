import { toast } from "sonner";

import type { RequestBodyPart } from "@/features/requests/request-body-file";
import { requestBodyFile } from "@/features/requests/request-body-file";
import { downloadFile } from "@/lib/export";
import { askForBody } from "@/socket/ask-for-body";
import type { RequestEntry } from "@/store/types";

/**
 * Download the whole body of a request whose event carried only a part of
 * it: the app that made it keeps the whole bodies of its latest requests,
 * and Studio asks it for one. A body it no longer keeps is said so.
 *
 * @param r - The request
 * @param part - Which of its bodies
 * @example
 * ```ts
 * await downloadRequestBody(request, "response"); // saves api.orders.list-response.json
 * ```
 */
export async function downloadRequestBody(r: RequestEntry, part: RequestBodyPart): Promise<void> {
  const answer = await askForBody({
    event: "request:body",
    sessionId: r.sessionId,
    requestId: r.id,
    part,
  });
  if (!answer.ok) {
    toast.error(`Could not download the whole ${part} body`, { description: answer.error });
    return;
  }
  downloadFile(answer.data, requestBodyFile(r, part));
}
