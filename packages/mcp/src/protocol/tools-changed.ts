import { createLogger } from "@noverax/courier";

import type { Connection } from "./connection";
import type { ServedTool } from "./served-tool";
import type { McpServerOptions } from "./server-options";
import { META } from "./versions";
import { visibleTools } from "./visible-tools";

const log = createLogger("MCP");

const LIST_CHANGED = "notifications/tools/list_changed";

/**
 * Tell a connection's client when the tools it may see change: a client on
 * the `initialize` handshake with `notifications/tools/list_changed`, and
 * each 2026-07-28 stream that asked for it with the same notification
 * tagged with its subscription. The list is compared with the one last
 * told, so a reload that changes nothing an agent sees tells nothing.
 *
 * @param connection - The client's connection, which can carry notifications
 * @param options - The server's tools, and what tells it they may have changed
 * @returns How to stop telling
 * @example
 * ```ts
 * const stop = followToolChanges(connection, options);
 * ```
 */
export function followToolChanges(connection: Connection, options: McpServerOptions): () => void {
  const { notify, listening } = connection;
  if (options.onToolsChanged === undefined || notify === undefined) return () => undefined;
  let told = fingerprintOf(connection, options);
  return options.onToolsChanged(() => {
    const now = fingerprintOf(connection, options);
    if (now === undefined || now === told) return;
    told = now;
    if (connection.legacy !== undefined) notify(LIST_CHANGED, {});
    for (const [id, filter] of listening ?? []) {
      if (filter.toolsListChanged) notify(LIST_CHANGED, { _meta: { [META.subscriptionId]: id } });
    }
  });
}

/* What an agent sees of the tools, in order; undefined while the tools cannot be built. */
function fingerprintOf(connection: Connection, options: McpServerOptions): string | undefined {
  try {
    return JSON.stringify(visibleTools(options, connection.principal).map(shapeOf));
  } catch (error) {
    log.error("The tools could not be built after a change; the client is told of none", error);
    return undefined;
  }
}

function shapeOf(tool: ServedTool): unknown[] {
  return [
    tool.name,
    tool.title,
    tool.description,
    tool.access,
    tool.confirm,
    tool.idempotent,
    tool.limit,
    tool.inputSchema,
    tool.outputSchema,
  ];
}
