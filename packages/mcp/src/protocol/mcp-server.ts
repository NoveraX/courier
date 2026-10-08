import { createLogger } from "@noverax/courier";

import { isRecord } from "../is-record";
import type { Connection } from "./connection";
import { clientOf, type Era, eraOf, legacyVersionFor } from "./era";
import {
  ERROR_CODE,
  errorOf,
  type JsonRpcRequest,
  type JsonRpcResponse,
  resultOf,
} from "./json-rpc";
import { McpProtocolError } from "./protocol-error";
import type { McpServerOptions } from "./server-options";
import { toolDefinition } from "./tool-definition";
import { callTool } from "./tools-call";
import { META, MODERN_VERSIONS } from "./versions";
import { visibleTools } from "./visible-tools";

const log = createLogger("MCP");

/** How long a client may keep the tool list before asking again, in milliseconds. */
const LIST_TTL = 60_000;
const CAPABILITIES = { tools: { listChanged: false } } as const;

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
  return {
    async request(message, connection, signal) {
      try {
        const result = await answer(message, connection, signal, options);
        return resultOf(message.id, result);
      } catch (error) {
        if (signal.aborted) return undefined;
        if (error instanceof McpProtocolError)
          return errorOf(message.id, error.code, error.message, error.data);
        log.error(`${message.method} failed`, error);
        return errorOf(message.id, ERROR_CODE.internal, "Internal error");
      }
    },
  };
}

async function answer(
  message: JsonRpcRequest,
  connection: Connection,
  signal: AbortSignal,
  options: McpServerOptions,
): Promise<Record<string, unknown>> {
  if (message.method === "initialize") return initialize(message.params, connection, options);
  const era = eraOf(message.params, connection);
  const result = await methodResult(message, era, connection, signal, options);
  if (era.kind === "legacy") return result;
  return { resultType: "complete", ...result, _meta: { [META.serverInfo]: options.info } };
}

async function methodResult(
  message: JsonRpcRequest,
  era: Era,
  connection: Connection,
  signal: AbortSignal,
  options: McpServerOptions,
): Promise<Record<string, unknown>> {
  const { method, params } = message;
  if (method === "tools/call") return callTool(params, era, connection, signal, options);
  if (method === "tools/list") return toolsList(params, era, connection, options);
  if (method === "server/discover" && era.kind === "modern") return discover(options);
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
    capabilities: CAPABILITIES,
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
    capabilities: CAPABILITIES,
    serverInfo: options.info,
    ...(options.instructions !== undefined && { instructions: options.instructions }),
  };
}
