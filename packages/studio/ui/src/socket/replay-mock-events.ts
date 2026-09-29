import { handleMockEvent, isMockEvent } from "@/store/handle-mock-events";
import { useMockStore } from "@/store/mock-slice";

import { isStudioEvent } from "./event-guards";

/**
 * Take in the requests Studio's mocks answered, which Studio replays to a
 * page that connects, oldest first. A request the page already shows is kept
 * as it is, and an end is taken only by a request still waiting for one, so
 * a page that reconnects counts no request twice.
 *
 * @param events - What Studio sent with `mock:events:replay`
 *
 * @example
 * ```ts
 * socket.on("mock:events:replay", (data) => { if (Array.isArray(data)) replayMockEvents(data) })
 * ```
 */
export function replayMockEvents(events: readonly unknown[]): void {
  for (const event of events) {
    if (!isStudioEvent(event)) continue;
    const type: string = event.type;
    if (!isMockEvent(type)) continue;
    const shown = useMockStore.getState().logs.find((log) => log.id === event.requestId);
    const starts = type === "mock:request:start";
    if (starts ? shown === undefined : shown !== undefined && shown.status === undefined)
      handleMockEvent(event);
  }
}
