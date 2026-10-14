import type { RequestBodyPart } from "@/features/requests/request-body-file";
import { askForBody } from "@/socket/ask-for-body";
import type { RequestEntry } from "@/store/types";
import type { WholeSource } from "./tabs/use-whole-search";

/**
 * Where the whole of a request's body comes from, when its event carried
 * only a part of it: the app that made the request keeps the whole bodies
 * of its latest requests, and Studio asks it for one.
 *
 * @param r - The request
 * @param part - Which of its bodies
 * @returns The source a search over the whole body reads
 * @example
 * ```tsx
 * <PayloadTab view={responseView(request)} whole={requestWhole(request, "response")} />
 * ```
 */
export function requestWhole(r: RequestEntry, part: RequestBodyPart): WholeSource {
  return {
    key: `request:${r.sessionId}:${r.id}:${part}`,
    load: () =>
      askForBody({ event: "request:body", sessionId: r.sessionId, requestId: r.id, part }),
  };
}
