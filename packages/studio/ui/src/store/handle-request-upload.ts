import { num, optNum, str } from "./event-helpers";
import { ROUTE_SOURCES } from "./handle-mock-request-events";
import type { MockEvent } from "./mock-event-types";
import { useMockStore } from "./mock-slice";
import type { MockRequestLog } from "./mock-slice-types";
import { readOneOf } from "./payload";

/**
 * A slow body still arriving at a mock: the request's row shows how much of
 * it has — made from this report when it is the first, so a long upload is
 * in the log as it comes, and its `start` fills the row in later.
 *
 * @param serverId - The mock the request came to
 * @param event - The `mock:request:upload` report
 * @example
 * ```ts
 * handleRequestUpload("api", { type: "mock:request:upload", requestId: "req_1", received: 65_536, total: 8_388_608 });
 * ```
 */
export function handleRequestUpload(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  const id = str(event.requestId);
  const upload = { received: num(event.received), total: optNum(event.total), arriving: true };
  const index = store.logs.findIndex((log) => log.id === id);
  const known = store.logs[index];
  if (!known) {
    store.addLog({
      id,
      serverId,
      timestamp: num(event.timestamp, Date.now()),
      httpMethod: str(event.httpMethod, "POST"),
      path: str(event.path),
      group: str(event.group),
      endpoint: str(event.endpoint),
      source: readOneOf(event.source, ROUTE_SOURCES),
      upload,
    });
    return;
  }
  const logs: MockRequestLog[] = [...store.logs];
  logs[index] = { ...known, upload };
  useMockStore.setState({ logs });
}
