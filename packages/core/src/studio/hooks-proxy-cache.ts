/**
 * Studio hook definitions for proxy, cache, dedup, and upload tracking.
 *
 * Groups together every event tied to the proxy adapter, the response
 * cache, inflight deduplication, and upload progress reporting.
 */

/**
 * Proxy adapter request/response + parse + origin reject + client timing.
 *
 * `requestId` is the id the call's request events carry, and is absent
 * while no request lifecycle is being traced.
 */
export interface ProxyHooks {
  /** Fired as a call arrives, before its body is read. */
  onProxyReceive?: (event: {
    proxyMethod: "GET" | "POST";
    source: string;
    group: string | undefined;
    method: string;
    requestId: string | undefined;
    timestamp: number;
  }) => void;

  /** Fired when the proxy answers, a refusal included. */
  onProxyRespond?: (event: {
    proxyMethod: "GET" | "POST";
    source: string;
    group: string | undefined;
    method: string;
    status: number;
    requestId: string | undefined;
    timestamp: number;
  }) => void;

  /** Fired once the call's variables are read. */
  onProxyParse?: (event: {
    source: string;
    group: string | undefined;
    method: string;
    variables: unknown;
    requestId: string | undefined;
    timestamp: number;
  }) => void;

  onProxyOriginReject?: (event: { origin: string; timestamp: number }) => void;

  /** Browser-side proxy timing — fired after fetch completes with network measurement */
  onProxyClientTiming?: (event: {
    requestId: string;
    networkLatency: number;
    download: number;
    totalRoundTrip: number;
    timestamp: number;
  }) => void;
}

/** Response cache hit/miss/store/invalidate instrumentation */
export interface CacheHooks {
  onCacheHit?: (event: { requestId: string; key: string; age: number; timestamp: number }) => void;

  onCacheMiss?: (event: { requestId: string; key: string; timestamp: number }) => void;

  onCacheStore?: (event: {
    requestId: string;
    key: string;
    ttl: number;
    timestamp: number;
  }) => void;

  onCacheInvalidate?: (event: { key: string; reason: string; timestamp: number }) => void;
}

/** In-flight request deduplication abort/reuse instrumentation */
export interface DedupHooks {
  onDedupAbort?: (event: { requestId: string; key: string; timestamp: number }) => void;

  onDedupReuse?: (event: { requestId: string; key: string; timestamp: number }) => void;
}

/** Multipart upload progress + completion */
export interface UploadHooks {
  onUploadProgress?: (event: {
    requestId: string;
    loaded: number;
    total: number;
    percentage: number;
    timestamp: number;
  }) => void;

  onUploadComplete?: (event: { requestId: string; timestamp: number }) => void;
}
