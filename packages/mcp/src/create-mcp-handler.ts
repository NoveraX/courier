import { ConfigurationError, createLogger } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import { assertAllowedOrigins, prepareSources } from "@noverax/courier/internal";
import type { JSONSchemaFallback } from "@noverax/courier/openapi";

import { createMcpServer } from "./protocol/mcp-server";
import { requestStates } from "./protocol/request-state";
import type { ServedTool } from "./protocol/served-tool";
import type { ToolSummary } from "./tools/agent-tool";
import { courierTools } from "./tools/courier-tools";
import { type ToolSource, toolSource } from "./tools/tool-source";
import { handleHttp } from "./transport/handle-http";
import { refusal } from "./transport/http-responses";

const log = createLogger("MCP");

/** The application's MCP endpoint: one function from a request to its response. */
export interface McpHandler {
  /** Answer one HTTP request — mount it for POST and OPTIONS, and for GET to say it takes none. */
  handle(request: Request): Promise<Response>;
}

/** How the application's MCP endpoint offers its tools, and to whom. */
export interface McpHandlerOptions<TPrincipal> {
  /**
   * Who is asking: whatever the application knows a caller by — a user, a
   * service, an API key's owner — handed to the middleware as
   * `ctx.agent.principal`. `null` or `undefined` turns the request away with
   * a 401; a `Response` answers it as it is, for an OAuth challenge.
   */
  readonly authorize: (
    request: Request,
  ) => TPrincipal | Response | null | undefined | Promise<TPrincipal | Response | null | undefined>;
  /** The sources whose `.agent()` endpoints are offered; the registered ones, read per request, when absent. */
  readonly sources?: Sources | undefined;
  /** Whether a caller may see and call a tool: one it may not is unknown to it. Every tool, when absent. */
  readonly allow?: ((tool: ToolSummary, principal: TPrincipal) => boolean) | undefined;
  /** Origins a browser-based client may call from; the endpoint's own always may. */
  readonly allowedOrigins?: readonly string[] | undefined;
  /**
   * Run a destructive tool without asking a person, leaving the decision to
   * the client's own approval — the only way under a revision that cannot
   * carry the question over HTTP. Off by default.
   */
  readonly allowDestructive?: boolean | undefined;
  /**
   * The secret a confirmation is signed with, the same on every replica that
   * serves the endpoint, at least 32 characters. A random one per process
   * when absent, which holds for a single process.
   */
  readonly confirmSecret?: string | undefined;
  /** The name the server gives in every result (default `courier`). */
  readonly name?: string | undefined;
  /** The version it gives (default: the application's, as npm started it). */
  readonly version?: string | undefined;
  /** What the model is told about the tools as a whole. */
  readonly instructions?: string | undefined;
  /** The longest answer handed to a model, in characters (default 100 000). */
  readonly maxResultChars?: number | undefined;
  /** How long a call may take when its endpoint names no timeout, in milliseconds (default 60 000). */
  readonly timeoutMs?: number | undefined;
  /** The largest request body taken, in bytes (default 1 MiB). */
  readonly maxBodyBytes?: number | undefined;
  /** A converter for schemas whose library has no Standard JSON Schema. */
  readonly jsonSchema?: JSONSchemaFallback | undefined;
}

/**
 * The application's MCP endpoint: its endpoints marked `.agent()`, offered
 * as tools over Streamable HTTP to the agents `authorize` lets in. A tool's
 * call runs as the application's own calls do — through the source's and
 * the endpoint's middleware, its schemas and Studio — with `ctx.agent`
 * saying which agent asked; a destructive one runs once a person confirmed.
 *
 * @param options - Who may call, and how the tools are offered
 * @returns The handler
 * @throws ConfigurationError `AGENT_HANDLER_INVALID` without `authorize`
 * @example
 * ```ts
 * // app/mcp/route.ts
 * const mcp = createMcpHandler({ authorize: (request) => apiKeys.verify(request.headers.get("authorization")) });
 * export const POST = mcp.handle;
 * export const GET = mcp.handle;
 * export const OPTIONS = mcp.handle;
 * ```
 */
export function createMcpHandler<TPrincipal>(options: McpHandlerOptions<TPrincipal>): McpHandler {
  checked(options);
  if (options.sources !== undefined) {
    prepareSources(
      options.sources,
      "createMcpHandler",
      "createMcpHandler({ sources: { api }, authorize })",
    );
  }
  const tools = toolSource(options.sources, { jsonSchema: options.jsonSchema });
  const { allow } = options;
  const server = createMcpServer({
    info: { name: options.name ?? "courier", version: options.version ?? applicationVersion() },
    instructions: options.instructions,
    tools: courierTools(tools, options.timeoutMs ?? 60_000),
    ...(allow !== undefined && {
      allow: (tool: ServedTool, principal: unknown) =>
        allow(summaryOf(tools, tool), principal as TPrincipal),
    }),
    allowDestructive: options.allowDestructive === true,
    states: requestStates(secretOf(options.confirmSecret)),
    maxResultChars: options.maxResultChars ?? 100_000,
    transport: "http",
  });
  const endpoint = {
    server,
    authorize: guarded(options.authorize),
    allowedOrigins: options.allowedOrigins,
    maxBodyBytes: options.maxBodyBytes ?? 1_048_576,
  };
  return { handle: (request) => handleHttp(request, endpoint) };
}

function checked<TPrincipal>(options: McpHandlerOptions<TPrincipal>): void {
  if (typeof options?.authorize !== "function") {
    throw new ConfigurationError(
      "AGENT_HANDLER_INVALID",
      "[courier] createMcpHandler needs authorize: who may call the application's tools, which run with its credentials.",
    );
  }
  if (options.confirmSecret !== undefined && options.confirmSecret.length < 32) {
    throw new ConfigurationError(
      "AGENT_HANDLER_INVALID",
      "[courier] createMcpHandler's confirmSecret is at least 32 characters.",
    );
  }
  if (options.allowedOrigins !== undefined)
    assertAllowedOrigins(options.allowedOrigins, "createMcpHandler");
}

/* The version npm started the application with; an edge runtime has no `process` to say. */
function applicationVersion(): string {
  return (typeof process === "undefined" ? undefined : process.env.npm_package_version) ?? "0.0.0";
}

function secretOf(given: string | undefined): Uint8Array {
  return given === undefined
    ? crypto.getRandomValues(new Uint8Array(32))
    : new TextEncoder().encode(given);
}

function summaryOf(tools: ToolSource, tool: ServedTool): ToolSummary {
  const placed = tools.catalog().byName.get(tool.name);
  return {
    name: tool.name,
    access: tool.access,
    path: placed?.path ?? tool.name,
    description: tool.description,
  };
}

/* A failure inside `authorize` is the application's: it is logged, and the client is told no more. */
function guarded(authorize: (request: Request) => unknown): (request: Request) => Promise<unknown> {
  return async (request) => {
    try {
      return await authorize(request);
    } catch (error) {
      log.error("authorize threw; the request is refused", error);
      return refusal(500, "authorize failed");
    }
  };
}
