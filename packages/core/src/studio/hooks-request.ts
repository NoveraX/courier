import type { SharedAnswer } from "../utils/shared-answer";
import type { FailureCause } from "./failure-cause";

/**
 * How a request failed: an upstream's error answer, a refused schema, a
 * request that got no answer, one that ran out of time, one its caller
 * cancelled, or the server's own failure.
 */
export type RequestFailureKind =
  | "http"
  | "validation"
  | "network"
  | "timeout"
  | "aborted"
  | "unknown";

/**
 * Studio hook definitions for the request lifecycle.
 *
 * Covers the core request flow + middleware + validation + raw HTTP fetch
 * timing — every event a single direct request can produce. All hooks
 * remain optional; consumers always merge them into the composite
 * `StudioHooks` interface in `hooks.ts`.
 */

export interface RequestLifecycleHooks {
  onRequestStart?:
    | ((event: {
        id: string;
        source: string;
        group: string | undefined;
        method: string;
        variables: unknown;
        /** How the call came: made by the app directly, through Courier's proxy, or delivered to it as a webhook. */
        mode: "direct" | "proxy" | "webhook";
        middlewareCount: number;
        hasValidation: { variables: boolean; response: boolean };
        /** The endpoint's HTTP verb (`"GET"`, `"DELETE"`), when it declares one. */
        httpMethod?: string;
        /** Whether the endpoint reads or writes. */
        endpointType?: "query" | "mutation";
        /** What the call is when it is a request the session makes rather than an endpoint's. */
        purpose?: "csrf-token";
        /** The agent tool the call ran for, when an MCP server made it, and the client as it named itself. */
        agent?: { tool: string; access: "read" | "write" | "destructive"; client?: string };
        /** The key the call sends in its endpoint's idempotency header, the same on every attempt. */
        idempotencyKey?: string;
        timestamp: number;
      }) => void)
    | undefined;

  onRequestEnd?:
    | ((event: {
        id: string;
        status: number;
        data: unknown;
        size: number;
        headers: Record<string, string>;
        requestHeaders: Record<string, string>;
        timing: {
          total: number;
          middleware: number;
          fetch: number;
          validation: number;
        };
        proxyTiming?:
          | {
              clientToProxy: number;
              proxyToBackend: number;
              backendToProxy: number;
              proxyToClient: number;
            }
          | undefined;
        /** How the call's read was answered by another call's request, when it was */
        shared?: SharedAnswer | undefined;
        timestamp: number;
      }) => void)
    | undefined;

  /**
   * A 2xx answer as it came back, before the endpoint's response schema read
   * it — for Studio to read its shape and set it beside the schema, while the
   * hook runs: the schema reads it next. Sent only for an endpoint with a
   * response schema, and never for a stream.
   */
  onAnswer?: ((event: { requestId: string; data: unknown; timestamp: number }) => void) | undefined;

  onRequestError?:
    | ((event: {
        id: string;
        error: {
          type: RequestFailureKind;
          /** The upstream's status, when it answered. */
          status?: number | undefined;
          message: string;
          /** Why no answer came, as the system said it: a DNS, connection or certificate failure. */
          cause?: FailureCause | undefined;
        };
        /** The status the caller received, when it received one — a proxy's own 422 or 502. */
        status?: number | undefined;
        /** The upstream's response headers, when it answered. */
        headers?: Record<string, string>;
        /** The headers the call came with, when the runtime has them: a refused webhook delivery's. */
        requestHeaders?: Record<string, string>;
        /** The upstream's error body, when it answered. */
        data?: unknown;
        /** How large the upstream's error body was, when it answered. */
        size?: number;
        /** How long the request took before it failed. */
        timing?: {
          total: number;
          middleware: number;
          fetch: number;
          validation: number;
        };
        /** How a proxied call's time split, as for one that succeeded. */
        proxyTiming?: {
          clientToProxy: number;
          proxyToBackend: number;
          backendToProxy: number;
          proxyToClient: number;
        };
        /** How the call's read was answered by another call's request, when it was */
        shared?: SharedAnswer | undefined;
        timestamp: number;
      }) => void)
    | undefined;

  onRequestAbort?:
    | ((event: {
        id: string;
        reason: "superseded" | "manual" | "timeout";
        timestamp: number;
      }) => void)
    | undefined;
}

/** Middleware enter/exit/error instrumentation */
export interface MiddlewareHooks {
  onMiddlewareEnter?:
    | ((event: {
        requestId: string;
        name: string;
        index: number;
        totalCount: number;
        phase: string;
        timestamp: number;
      }) => void)
    | undefined;

  onMiddlewareExit?:
    | ((event: {
        requestId: string;
        name: string;
        index: number;
        duration: number;
        phase: string;
        beforeDuration: number;
        afterDuration: number;
        headersAdded: string[];
        timestamp: number;
      }) => void)
    | undefined;

  onMiddlewareError?:
    | ((event: {
        requestId: string;
        name: string;
        index: number;
        phase: string;
        error: string;
        timestamp: number;
      }) => void)
    | undefined;
}

/** Schema validation pass/fail instrumentation */
export interface ValidationHooks {
  onValidationStart?:
    | ((event: {
        requestId: string;
        target: "variables" | "response" | "receive";
        timestamp: number;
      }) => void)
    | undefined;

  onValidationPass?:
    | ((event: {
        requestId: string;
        target: "variables" | "response" | "receive";
        duration: number;
        timestamp: number;
      }) => void)
    | undefined;

  onValidationFail?:
    | ((event: {
        requestId: string;
        target: "variables" | "response" | "receive";
        issues: readonly unknown[];
        duration: number;
        timestamp: number;
      }) => void)
    | undefined;
}

/** Raw HTTP fetch timing — wraps the underlying fetch() call */
export interface HttpFetchHooks {
  onHttpFetchStart?:
    | ((event: { requestId: string; url: string; method: string; timestamp: number }) => void)
    | undefined;

  onHttpFetchEnd?:
    | ((event: { requestId: string; status: number; duration: number; timestamp: number }) => void)
    | undefined;

  /** A fetch that failed: `status` is the code the upstream answered with, when it answered at all. */
  onHttpFetchError?:
    | ((event: { requestId: string; message: string; status?: number; timestamp: number }) => void)
    | undefined;
}
