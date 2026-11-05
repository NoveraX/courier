/**
 * The types the package's root exports, kept apart from its values: a file
 * that declares only types emits nothing, and the root re-exports every one
 * of them with `export type *`. A type the root offers is named here, from
 * the module that declares it.
 */
export type {
  AdapterHandler,
  AllowedHostsSetting,
  AllowedOriginsSetting,
  ClientConnection,
  ClusterOptions,
  ConnectionInfo,
  ConnectionMeta,
  ConnectionRegistry,
  ConnectionSelector,
  ConnectResult,
  DisconnectOptions,
  HandlerConfig,
  MemoryRateLimitOptions,
  MetaValue,
  NoConnectionMeta,
  ProxyRateLimit,
  RateLimitDecision,
  RateLimitStore,
  RateLimitWindow,
  RequireAuthOptions,
  RuntimeSetting,
  SSEBroadcastEvent,
  SSEBroadcastResult,
  SSECloseReason,
  SSEConnectionInfo,
  SSEConnectionRegistry,
  SSELifecycleConfig,
  WebSocketLike,
  WSHandler,
  WSHandlerConfig,
  WSHandlerDescriptor,
  WSHandlerStats,
} from "./adapter";
export type { AgentOffer, AgentPolicy } from "./agent/agent-policy";
export type { AgentAccess, AgentCall, AgentClient, AgentLimit, AgentOptions } from "./agent/types";
export type { CallerDefaults } from "./caller";
export type {
  FlatClient,
  GroupClient,
  InferClient,
  MixedClient,
  TypedClient,
  WithOptions,
} from "./client";
export type { RetryEvent, RetryOptions, RetryTrigger } from "./define/options";
export type {
  AbortErrorCode,
  ConfigurationErrorCode,
  CourierErrorOptions,
  RequestFailure,
  TimeoutScope,
} from "./errors";
export type { FetchClient, FetchClientOptions } from "./fetch";
export type {
  SourceDispatcher,
  SourceFetch,
  SourceSocketOptions,
  SourceWebSocket,
} from "./http-client/source-transport";
export type { TransportOptions } from "./http-client/transport-options";
export type {
  BaseOptions,
  CallOptions,
  Context,
  GroupOptions,
  HttpResponse,
  RequestContext,
  SearchParamsSerializer,
  UploadProgress,
} from "./http-client/types";
/* Named by the types an API's definition infers, so a project that emits declarations can name them too. */
export type { WebBody, WebCredentials } from "./http-client/web-types";
export type { Logger, LogLevel, ScopedLogger } from "./logger";
export type {
  AfterHandler,
  AfterMiddleware,
  BeforeHandler,
  BeforeMiddleware,
  CallPurpose,
  Middleware,
  MiddlewareContext,
  MiddlewarePhase,
  MiddlewareResponse,
  NextFn,
  RetryFailure,
  WrapHandler,
  WrapMiddleware,
} from "./middleware/types";
export type { ProxyCallerOptions, ProxyPath } from "./proxy-caller";
export type { CallerWSOptions } from "./realtime/ws/ws-types";
export type {
  HeaderReader,
  IncomingRequest,
  RelayedCookie,
  RequestContextProvider,
} from "./session/incoming-request";
export type { CookieAttributes, SetCookie } from "./session/set-cookie";
export type { CsrfOptions, EndpointSession, ForwardOptions, SessionOptions } from "./session/types";
export type { SmoothProgressOptions } from "./utils/smooth-progress";
export type { StreamedUpload } from "./utils/streamed-upload";
export type { CacheConfig, Transport, ValidationIssue } from "./validation";
