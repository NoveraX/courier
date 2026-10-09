/**
 * `@noverax/courier-mcp/internal` — what Courier's own packages build an MCP
 * server on: Studio serves its views to an editor's agent through it.
 *
 * **Internal subpath.** It changes with those packages, with no semver
 * guarantee for anyone else. An application uses the root entry.
 */

export { CONFIRM_INPUT, canAsk } from "./protocol/confirmation";
export type { Connection } from "./protocol/connection";
export { createMcpServer, type McpServer } from "./protocol/mcp-server";
export { requestStates } from "./protocol/request-state";
export {
  type Refusal,
  type ServedTool,
  type ToolCaller,
  type ToolOutcome,
  type ToolSet,
  toolSet,
} from "./protocol/served-tool";
export type { McpServerOptions, ServerInfo } from "./protocol/server-options";
export { isLegacyVersion, META, MODERN_VERSIONS } from "./protocol/versions";
export { type HttpEndpoint, handleHttp } from "./transport/handle-http";
