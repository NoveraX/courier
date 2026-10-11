import { isRecord } from "../is-record";
import type { Connection, ListenFilter } from "./connection";
import { ERROR_CODE, type JsonRpcId } from "./json-rpc";
import { McpProtocolError } from "./protocol-error";
import { META } from "./versions";

/**
 * Answer `subscriptions/listen`, the 2026-07-28 revision's stream of
 * notifications: acknowledge first with the part of the filter the server
 * honors — the tool list's changes, where it can tell of them — then keep
 * the request open while the stream carries them, until the client cancels
 * it or the connection closes.
 *
 * @param params - The request's params, with its `notifications` filter
 * @param id - The request's id, which tags every message on the stream
 * @param connection - What it arrived over: stdio, where the server may speak first
 * @param signal - Fires when the client cancels the stream
 * @param listChanged - Whether the server can tell of a change to its tool list
 * @returns Settles once the stream ends
 * @throws McpProtocolError `-32601` where the transport carries no stream
 * @example
 * ```ts
 * await listen({ notifications: { toolsListChanged: true } }, 7, connection, signal, true);
 * ```
 */
export async function listen(
  params: Record<string, unknown>,
  id: JsonRpcId,
  connection: Connection,
  signal: AbortSignal,
  listChanged: boolean,
): Promise<Record<string, unknown>> {
  const { notify, listening } = connection;
  if (notify === undefined || listening === undefined) {
    throw new McpProtocolError(
      ERROR_CODE.methodNotFound,
      "Method not found: subscriptions/listen — this endpoint keeps no stream; ask for tools/list again once its ttlMs has passed",
    );
  }
  const asked = isRecord(params.notifications) ? params.notifications : {};
  const honored: ListenFilter =
    asked.toolsListChanged === true && listChanged ? { toolsListChanged: true } : {};
  notify("notifications/subscriptions/acknowledged", {
    _meta: { [META.subscriptionId]: id },
    notifications: honored,
  });
  listening.set(id, honored);
  try {
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve();
      else signal.addEventListener("abort", () => resolve(), { once: true });
    });
  } finally {
    listening.delete(id);
  }
  return { resultType: "complete", _meta: { [META.subscriptionId]: id } };
}
