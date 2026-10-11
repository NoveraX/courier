import { createLogger } from "@noverax/courier";

import { isRecord } from "../is-record";
import { type CallLimits, callLimits } from "./call-limits";
import type { Connection } from "./connection";
import { clientOf, type Era, eraOf, legacyVersionFor } from "./era";
import {
  ERROR_CODE,
  errorOf,
  type JsonRpcRequest,
  type JsonRpcResponse,
  resultOf,
} from "./json-rpc";
import { listen } from "./listen";
import { McpProtocolError } from "./protocol-error";
import type { McpServerOptions } from "./server-options";
import { toolDefinition } from "./tool-definition";
import { callTool } from "./tools-call";
import { followToolChanges } from "./tools-changed";
import { META, MODERN_VERSIONS } from "./versions";
import { visibleTools } from "./visible-tools";

const log = createLogger("MCP");

/** How long a client may keep the tool list before asking again, in milliseconds. */
const LIST_TTL = 60_000;

/** Answers the requests of one MCP server, over whatever carries them. */
export interface McpServer {
  /**
   * Answer one request; `undefined` when its client stopped waiting, as
   * nothing may be sent for a request it cancelled.
   */
  request(
    message: JsonRpcRequest,
    connection: Connection,
    signal: AbortSignal,
  ): Promise<JsonRpcResponse | undefined>;
  /**
   * Tell a connection's client when the tools it may see change, for as
   * long as the connection lasts; returns how to stop.
   */
  connect(connection: Connection): () => void;
}

/**
 * A protocol server over a set of tools, speaking both eras of MCP: the
 * 2026-07-28 revision, whose every request names its version and its
 * client's capabilities, and the revisions a client opens with `initialize`,
 * which clients still speak by default.
 *
 * @param options - Its tools, how they run, and the rules around them
 * @returns The server
 * @example
 * ```ts
 * const server = createMcpServer({ info, catalog, run, allowDestructive: false, states, maxResultChars, transport: "stdio" });
 * ```
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  /* The calls its limited tools took, per caller, for as long as the server runs. */
  const limits = callLimits();
  return {
    async request(message, connection, signal) {
      try {
        const result = await answer(message, connection, signal, options, limits);
        return resultOf(message.id, result);
      } catch (error) {
        if (signal.aborted) return undefined;
        if (error instanceof McpProtocolError)
          return errorOf(message.id, error.code, error.message, error.data);
        log.error(`${message.method} failed`, error);
        return errorOf(message.id, ERROR_CODE.internal, "Internal error");
      }
    },
    connect: (connection) => followToolChanges(connection, options),
  };
}

/* Whether the server tells a client of a change to its tools: over stdio, where it may speak first, and where its host can tell. */
function capabilitiesOf(options: McpServerOptions): Record<string, unknown> {
  return {
    tools: { listChanged: options.transport === "stdio" && options.onToolsChanged !== undefined },
  };
}

async function answer(
  message: JsonRpcRequest,
  connection: Connection,
  signal: AbortSignal,
  options: McpServerOptions,
  limits: CallLimits,
): Promise<Record<string, unknown>> {
  if (message.method === "initialize") return initialize(message.params, connection, options);
  const era = eraOf(message.params, connection);
  const result = await methodResult(message, era, connection, signal, options, limits);
  if (era.kind === "legacy") return result;
  const own = isRecord(result._meta) ? result._meta : {};
  return {
    resultType: "complete",
    ...result,
    _meta: { ...own, [META.serverInfo]: options.info },
  };
}

async function methodResult(
  message: JsonRpcRequest,
  era: Era,
  connection: Connection,
  signal: AbortSignal,
  options: McpServerOptions,
  limits: CallLimits,
): Promise<Record<string, unknown>> {
  const { method, params } = message;
  if (method === "tools/call") return callTool(params, era, connection, signal, options, limits);
  if (method === "tools/list") return toolsList(params, era, connection, options);
  if (method === "server/discover" && era.kind === "modern") return discover(options);
  if (method === "subscriptions/listen" && era.kind === "modern") {
    const { listChanged } = capabilitiesOf(options).tools as { listChanged: boolean };
    return listen(params, message.id, connection, signal, listChanged);
  }
  if (method === "ping" && era.kind === "legacy") return {};
  throw new McpProtocolError(ERROR_CODE.methodNotFound, `Method not found: ${method}`);
}

function toolsList(
  params: Record<string, unknown>,
  era: Era,
  connection: Connection,
  options: McpServerOptions,
): Record<string, unknown> {
  if (params.cursor !== undefined) {
    throw new McpProtocolError(
      ERROR_CODE.invalidParams,
      "There is no such page: the tool list has one",
    );
  }
  const tools = visibleTools(options, connection.principal).map((tool) =>
    toolDefinition(tool, era.version),
  );
  if (era.kind === "legacy") return { tools };
  return { tools, ttlMs: LIST_TTL, cacheScope: options.allow === undefined ? "public" : "private" };
}

function discover(options: McpServerOptions): Record<string, unknown> {
  return {
    supportedVersions: [...MODERN_VERSIONS],
    capabilities: capabilitiesOf(options),
    ...(options.instructions !== undefined && { instructions: options.instructions }),
    ttlMs: LIST_TTL,
    cacheScope: "public",
  };
}

/* What a client opening with `initialize` settles for the rest of a stdio connection. An HTTP
   request keeps nothing: the client names the revision on each request after it, in a header. */
function initialize(
  params: Record<string, unknown>,
  connection: Connection,
  options: McpServerOptions,
): Record<string, unknown> {
  const version = legacyVersionFor(params.protocolVersion);
  if (connection.transport === "stdio") {
    const capabilities = isRecord(params.capabilities) ? params.capabilities : {};
    connection.legacy = { version, capabilities, client: clientOf(params.clientInfo) };
  }
  return {
    protocolVersion: version,
    capabilities: capabilitiesOf(options),
    serverInfo: options.info,
    ...(options.instructions !== undefined && { instructions: options.instructions }),
  };
}
