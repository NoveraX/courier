/**
 * `@noverax/courier/internal` — what Courier's own packages build on.
 *
 * **Internal subpath.** The framework adapters, React, the mock server and
 * Studio reach the client proxy, the transports, the request executor and
 * Studio's hooks through it. It is not part of the public API: it changes
 * with those packages, with no semver guarantee for anyone else. An
 * application uses the root entry and the documented subpaths.
 *
 * Its stream and channel factories load their clients on the first stream
 * or channel: nothing here imports those clients, so a package built on
 * this entry carries them only when it opens one.
 */

export { isOriginAccepted, isOriginAllowed } from "../adapter/origin-policy";
export { discoverAppOrigin, getAppOriginParsed } from "../app-origin";
export {
  buildClientProxy,
  type ClientShape,
  createClientRoot,
  type ExecuteBackend,
  shapeOfClient,
} from "../client";
export { mergeProxyPath, type ResolveOrigin, resolveProxyPath } from "../proxy-caller";
export { type ConnectionState, createConnectionState } from "../realtime/connection-state";
export { describeFailure, type StreamFailure } from "../realtime/describe-failure";
export { SSE_CONTROL_EVENTS } from "../realtime/sse/control-events";
export { decodeMessage, encodeMessage, type WSMessage } from "../realtime/ws/ws-protocol";
export { buildDirectWSUrl } from "../realtime/ws-address";
export { getSourcesGeneration, onSourcesChange } from "../sources";
export { STUDIO_REQUEST_HEADER, type StudioHooks, studioHooks } from "../studio";
export {
  createDirectHTTPExecutor,
  createProxyHTTPExecutor,
  type DirectHTTPDefaults,
  type DirectSSEDefaults,
  type DirectWSDefaults,
  directStreamingFactories,
  type HTTPExecutor,
  type ProxySSEDefaults,
  type ProxyWSDefaults,
  proxyStreamingFactories,
  type SSEFactory,
  type StreamingFactories,
  type WSChannelFactory,
} from "../transport";
export { executeRequest } from "../utils/execute";
export { normalizeHttpMethod, toInternalMethod } from "../utils/helpers";
