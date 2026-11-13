/**
 * `@noverax/courier/internal` — what Courier's own packages build on.
 *
 * **Internal subpath.** The framework adapters, the mock server and Studio
 * reach the client proxy, the transports, the request executor and
 * Studio's hooks through it, and the command-line tools the style of their
 * terminal output. React's hooks, which run in a page, take the client's
 * pieces from `@noverax/courier/internal-client` instead. It is not part of
 * the public API: it changes with those packages, with no semver guarantee
 * for anyone else. An application uses the root entry and the documented
 * subpaths.
 *
 * Its streaming factories load their stream and channel clients on the
 * first stream or channel. The transports' barrel it takes them from also
 * re-exports the factories that import those clients, so under Node this
 * entry loads them at once; a bundler drops what a page leaves unused, and
 * a page carries the clients only when it opens a stream or channel.
 */

export { addressTrust, deploymentTrust } from "../adapter/address-trust";
export { BodyError } from "../adapter/body-error";
export { clientAddress, requestClientAddress } from "../adapter/client-address";
export { discardBody } from "../adapter/discard-body";
export { BROWSERS_ONLY_REFUSAL } from "../adapter/entry-gate";
export { exposureOf } from "../adapter/exposure";
export { readMultipartForm } from "../adapter/multipart/read-form";
export { readRecordUpload } from "../adapter/multipart/read-record";
export { isOriginAccepted, isOriginAllowed, isOriginListed } from "../adapter/origin-policy";
export { peerAddressOf, rememberPeerAddress } from "../adapter/peer-address";
export { requestBodyStream } from "../adapter/read-body";
export { readBodyText } from "../adapter/read-body-text";
export { readAllowedHosts, readAllowedOrigins } from "../adapter/runtime-policy";
export { closeOf, closeWithNotice, isSendableCloseCode, noticeOf } from "../adapter/ws-close";
export { WS_DEFAULTS } from "../adapter/ws-defaults";
export { frameCredentials, frameHeadersOver } from "../adapter/ws-frame-credentials";
export { authOkFrame, readFirstFrame } from "../adapter/ws-handshake";
export { agentOptionsOf } from "../agent/agent-options";
export {
  adoptListenOrigin,
  DEV_SERVER_ORIGIN_ENV,
  getAppOriginParsed,
  NEXT_ORIGIN_ENV,
} from "../app-origin";
export { buildClientProxy } from "../client/proxy";
export { RUNTIME_HOOKS } from "../client/proxy-members";
export { createClientRoot } from "../client/root";
export { shapeOfRoutes, shapeOfSource } from "../client/shape";
export { isSecretVariableName } from "../config/secret-variable-name";
export { isDefinedApi } from "../define/api";
export { groupOptionsOf } from "../define/group-options-of";
export {
  eachGroup,
  GROUP_PATH_SEPARATOR,
  groupChain,
  groupNames,
  subGroupsOf,
} from "../define/group-tree";
export { routesOf } from "../define/routes-of";
export { discoverAppOrigin } from "../discover-app-origin";
export { readLogFormat } from "../logger/log-format";
export { createRefusalLog } from "../logger/refusal-log";
export { eachEndpoint } from "../openapi/endpoints";
export { standardJsonSchema } from "../openapi/json-schema";
export { withDefaultsShown } from "../openapi/variable-defaults";
export { mergeProxyPath, resolveProxyPath } from "../proxy-caller";
export { proxyDefaultsOf } from "../proxy-caller/proxy-defaults";
export { createConnectionState } from "../realtime/connection-state";
export { describeFailure } from "../realtime/describe-failure";
export { SSE_CONTROL_EVENTS } from "../realtime/sse/control-events";
export { createHeartbeat } from "../realtime/ws/heartbeat";
export { WS_CODE } from "../realtime/ws/ws-codes";
export { decodeMessage, encodeMessage, PROTOCOL_VERSION } from "../realtime/ws/ws-protocol";
export { buildDirectWSUrl, parseWSTopic } from "../realtime/ws-address";
export { provideServerCapabilities } from "../server/provide-server-capabilities";
export { addressedOrigin } from "../server/session/addressed-origin";
export {
  checkSources,
  getSourcesGeneration,
  onSourcesChange,
  prepareSources,
} from "../server/sources";
export { isDeletion, parseSetCookie, serializeSetCookie } from "../session/set-cookie";
export { serverOriginOf } from "../socket-origin";
export {
  abortPlayground,
  generateRequestId,
  PLAYGROUND_RID_HEADER,
  STUDIO_PASS_HEADER,
  STUDIO_PASS_REDEEMER,
  STUDIO_REQUEST_HEADER,
  studioHooks,
} from "../studio";
export { CARRIED_BODY_BYTES, carriedBody } from "../studio/carried-body";
export { failureCause } from "../studio/failure-cause";
export { createKeptBodies, KEPT_BODY_BYTES } from "../studio/kept-bodies";
export {
  colorLevel,
  createTerminalStyle,
  formatBanner,
  formatHelp,
  formatLink,
  glyphsFor,
  helpOptions,
  styleFor,
  supportsUnicode,
} from "../terminal";
export {
  createDirectHTTPExecutor,
  createProxyHTTPExecutor,
  directStreamingFactories,
  proxyStreamingFactories,
} from "../transport";
export { anySignal } from "../utils/any-signal";
export { assertAllowedOrigins } from "../utils/assert-allowed-origins";
export {
  environmentVariable,
  inProduction,
  nodeEnvironment,
  ownEnvironment,
  writtenOrOwn,
} from "../utils/environment";
export { executeRequest } from "../utils/execute";
export { absentAs } from "../utils/execute-validation";
export { forwardedChain, forwardedFor } from "../utils/forwarded-for";
export { sendableValue } from "../utils/header-value";
export {
  isReadingMethod,
  normalizeHttpMethod,
  sendsVariablesInQuery,
  toInternalMethod,
} from "../utils/helpers";
export { isCredentialHeader } from "../utils/is-credential-header";
export { isLoopbackHostname } from "../utils/loopback-host";
export { middlewareChainOf } from "../utils/middleware-chain-of";
export { parseUrl } from "../utils/parse-url";
export {
  encodePathValue,
  escapePathText,
  fillPathParams,
  pathParamNames,
  pathPieces,
} from "../utils/path-template";
export { proxyRefusal } from "../utils/proxy-refusal";
export { RECORD_UPLOAD_TYPE } from "../utils/record-upload";
export {
  cutSecrets,
  cutText,
  REDACTED,
  splitUrlsWithoutSecrets,
  urlWithoutSecrets,
} from "../utils/redact";
export { redactAlso } from "../utils/redact/redacted-text";
export { isSecretHeader, isSecretValue } from "../utils/redact/secret-name";
export { registerRenderMemo } from "../utils/render-memo";
export { agentCallContext } from "../utils/server-call-marks";
export { sliceWhole } from "../utils/slice-whole";
export { withoutEdgeSlashes, withoutTrailingSlashes } from "../utils/trim-slashes";
export { formOf } from "../utils/variables-encoding";
export { knownWebhooks, onKnownWebhooks } from "../webhooks/webhook-registry";
/* Its types are named in types.ts. */
export type * from "./types";
