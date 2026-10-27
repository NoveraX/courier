/**
 * `@noverax/courier/internal` — what Courier's own packages build on.
 *
 * **Internal subpath.** The framework adapters, React, the mock server and
 * Studio reach the client proxy, the transports, the request executor and
 * Studio's hooks through it, and the command-line tools the style of their
 * terminal output. It is not part of the public API: it changes
 * with those packages, with no semver guarantee for anyone else. An
 * application uses the root entry and the documented subpaths.
 *
 * Its streaming factories load their stream and channel clients on the
 * first stream or channel. The transports' barrel it takes them from also
 * re-exports the factories that import those clients, so under Node this
 * entry loads them at once; a bundler drops what a page leaves unused, and
 * a page carries the clients only when it opens a stream or channel.
 */

export { type AddressTrust, addressTrust, deploymentTrust } from "../adapter/address-trust";
export { assertAllowedOrigins } from "../adapter/assert-allowed-origins";
export { clientAddress, type HeaderOf, requestClientAddress } from "../adapter/client-address";
export { discardBody } from "../adapter/discard-body";
export { BROWSERS_ONLY_REFUSAL } from "../adapter/entry-gate";
export { type ExposureDecision, exposureOf } from "../adapter/exposure";
export { isOriginAccepted, isOriginAllowed, isOriginListed } from "../adapter/origin-policy";
export { peerAddressOf, rememberPeerAddress } from "../adapter/peer-address";
export { type BoundedBody, readBoundedBody } from "../adapter/read-body";
export { frameCredentials, frameHeadersOver } from "../adapter/ws-frame-credentials";
export {
  adoptListenOrigin,
  DEV_SERVER_ORIGIN_ENV,
  getAppOriginParsed,
  NEXT_ORIGIN_ENV,
} from "../app-origin";
export {
  buildClientProxy,
  type ClientShape,
  createClientRoot,
  type ExecuteBackend,
  RUNTIME_HOOKS,
  shapeOfRoutes,
  shapeOfSource,
} from "../client";
export { isDefinedApi } from "../define/api";
export { groupOptionsOf } from "../define/group-options-of";
export {
  eachGroup,
  GROUP_PATH_SEPARATOR,
  type GroupNode,
  groupChain,
  groupNames,
  type PlacedGroup,
  subGroupsOf,
} from "../define/group-tree";
export { routesOf } from "../define/routes-of";
export { discoverAppOrigin, type ServerOrigin } from "../discover-app-origin";
export { readLogFormat } from "../logger/log-format";
export { eachEndpoint, type PlacedEndpoint } from "../openapi/endpoints";
export { standardJsonSchema } from "../openapi/json-schema";
export { withDefaultsShown } from "../openapi/variable-defaults";
export { mergeProxyPath, type ResolveOrigin, resolveProxyPath } from "../proxy-caller";
export { proxyDefaultsOf } from "../proxy-caller/proxy-defaults";
export type { ProxyCallerDefaults } from "../proxy-caller/types";
export { type ConnectionState, createConnectionState } from "../realtime/connection-state";
export { describeFailure, type StreamFailure } from "../realtime/describe-failure";
export { SSE_CONTROL_EVENTS } from "../realtime/sse/control-events";
export {
  createHeartbeat,
  type Heartbeat,
  type HeartbeatConfig,
} from "../realtime/ws/heartbeat";
export { decodeMessage, encodeMessage, type WSMessage } from "../realtime/ws/ws-protocol";
export { buildDirectWSUrl, parseWSTopic, type TopicEndpoint } from "../realtime/ws-address";
export { addressedOrigin } from "../session/addressed-origin";
export { isDeletion, parseSetCookie, serializeSetCookie } from "../session/set-cookie";
export { serverOriginOf } from "../socket-origin";
export { getSourcesGeneration, onSourcesChange, prepareSources } from "../sources";
export {
  abortPlayground,
  generateRequestId,
  PLAYGROUND_RID_HEADER,
  STUDIO_PASS_HEADER,
  STUDIO_PASS_REDEEMER,
  STUDIO_REQUEST_HEADER,
  type StudioHooks,
  studioHooks,
} from "../studio";
export { CARRIED_BODY_BYTES, type CarriedBody, carriedBody } from "../studio/carried-body";

export {
  type BodyPart,
  createKeptBodies,
  KEPT_BODY_BYTES,
  type KeptBodies,
} from "../studio/kept-bodies";
export {
  type Banner,
  type BannerRow,
  type ColorLevel,
  colorLevel,
  createTerminalStyle,
  type DeclaredOption,
  formatBanner,
  formatHelp,
  formatLink,
  type Glyphs,
  glyphsFor,
  type Help,
  type HelpCommand,
  type HelpExample,
  type HelpOption,
  helpOptions,
  type OutputStream,
  type Paint,
  styleFor,
  supportsUnicode,
  type TerminalStyle,
} from "../terminal";
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
export { anySignal } from "../utils/any-signal";
export { executeRequest } from "../utils/execute";
export { absentAs } from "../utils/execute-validation";
export { forwardedChain, forwardedFor } from "../utils/forwarded-for";
export {
  isReadingMethod,
  normalizeHttpMethod,
  sendsVariablesInQuery,
  toInternalMethod,
} from "../utils/helpers";
export { isCredentialHeader } from "../utils/is-credential-header";
export { isLoopbackHostname } from "../utils/loopback-host";
export { parseUrl } from "../utils/parse-url";
export {
  encodePathValue,
  escapePathText,
  fillPathParams,
  type PathPiece,
  pathParamNames,
  pathPieces,
} from "../utils/path-template";
export { proxyRefusal, type StandInCall } from "../utils/proxy-refusal";
export {
  type RenderMemo,
  type RenderMemoProvider,
  registerRenderMemo,
} from "../utils/render-memo";
export { withoutEdgeSlashes, withoutTrailingSlashes } from "../utils/trim-slashes";
export {
  type KnownWebhook,
  knownWebhooks,
  onKnownWebhooks,
} from "../webhooks/webhook-registry";
