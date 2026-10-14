import type { BodyPart } from "@/features/mocks/whole-body-file";
import type { WholeSource } from "@/inspector/tabs/use-whole-search";
import { askForBody } from "@/socket/ask-for-body";
import type { MockRequestLog } from "@/store/mock-slice";

/**
 * Where the whole of a body a mock logged in part comes from: the mock
 * keeps the whole bodies of its latest requests, and sends one when asked.
 *
 * @param log - The request the mock logged
 * @param part - Which of its bodies
 * @returns The source a search over the whole body reads
 * @example
 * ```tsx
 * <PayloadTab view={view.response} whole={mockWhole(log, "response")} />
 * ```
 */
export function mockWhole(log: MockRequestLog, part: BodyPart): WholeSource {
  return {
    key: `mock:${log.serverId}:${log.id}:${part}`,
    load: () => askForBody({ event: "mock:body", serverId: log.serverId, requestId: log.id, part }),
  };
}
