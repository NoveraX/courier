import type { CacheHooks, DedupHooks, ProxyHooks, UploadHooks } from "./hooks-proxy-cache";
import type {
  HttpFetchHooks,
  MiddlewareHooks,
  RequestLifecycleHooks,
  ValidationHooks,
} from "./hooks-request";

export type { RequestFailureKind } from "./hooks-request";

import type { SourceDefinedHooks, StreamHooks, WSPlaygroundHooks } from "./hooks-stream";

/**
 * Studio instrumentation hooks — zero-cost when not connected.
 *
 * Composed from focused sub-interfaces (request lifecycle, proxy/cache,
 * stream/WS) into a single public `StudioHooks` type.
 */
export interface StudioHooks
  extends RequestLifecycleHooks,
    MiddlewareHooks,
    ValidationHooks,
    HttpFetchHooks,
    ProxyHooks,
    CacheHooks,
    DedupHooks,
    UploadHooks,
    StreamHooks,
    WSPlaygroundHooks,
    SourceDefinedHooks {}
