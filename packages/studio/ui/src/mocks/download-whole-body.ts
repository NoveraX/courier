import { toast } from "sonner";

import type { BodyPart } from "@/features/mocks/whole-body-file";
import { wholeBodyFile } from "@/features/mocks/whole-body-file";
import { downloadFile } from "@/lib/export";
import { askForBody } from "@/socket/ask-for-body";
import type { MockRequestLog } from "@/store/mock-slice";

/**
 * Download the whole body of a request the mock logged only a part of: the
 * mock keeps the whole bodies of its latest requests, and sends one when
 * asked. A body it no longer keeps is said so.
 *
 * @param log - The request the mock logged
 * @param part - Which of its bodies
 * @example
 * ```ts
 * await downloadWholeBody(log, "response"); // saves orders.list-response.json
 * ```
 */
export async function downloadWholeBody(log: MockRequestLog, part: BodyPart): Promise<void> {
  const answer = await askForBody({
    event: "mock:body",
    serverId: log.serverId,
    requestId: log.id,
    part,
  });
  if (!answer.ok) {
    toast.error(`Could not download the whole ${part} body`, { description: answer.error });
    return;
  }
  downloadFile(answer.data, wholeBodyFile(log, part));
}
