import type { SSESubscription, WSChannel } from "../realtime/types";

/**
 * Uniform shape for HTTP transport primitives.
 * Both direct (executeRequest) and proxy (createProxyCallerFn) modes implement this.
 *
 * @param group - endpoint group name (empty string for flat endpoints)
 * @param method - method name within the group
 * @param variables - request variables (query params, body, etc.)
 * @param options - per-call options (timeout, headers, signal, etc.)
 * @param raw - if true, return raw HttpResponse instead of unwrapped data
 */
export type HTTPExecutor = (
  group: string,
  method: string,
  variables: unknown,
  options: Record<string, unknown>,
  raw: boolean,
) => Promise<unknown>;

/**
 * Uniform shape for SSE transport primitives.
 * Returns synchronously (subscription is async iterable).
 */
export type SSEFactory = (
  group: string,
  method: string,
  variables: unknown,
  options: Record<string, unknown>,
) => SSESubscription<unknown>;

/**
 * Uniform shape for **bidirectional** WS channel primitives.
 *
 * Used for endpoints declared with a `receive` schema (`WSChannelEndpoint`).
 * The returned channel exposes both `send()` and incoming `data` events.
 *
 * Kept separate from {@link WSPushFactory} so callers don't need a runtime
 * boolean flag to discriminate the return type — the type is known at the
 * call site through the factory choice.
 */
export type WSChannelFactory = (
  group: string,
  method: string,
  variables: unknown,
  options: Record<string, unknown>,
) => WSChannel<unknown, unknown>;

/**
 * Uniform shape for **server-push** WS primitives.
 *
 * Used for endpoints declared without a `receive` schema (`WSEndpoint`).
 * The returned subscription is iterable like an SSE subscription — server
 * pushes events to the client over a WebSocket transport.
 */
export type WSPushFactory = (
  group: string,
  method: string,
  variables: unknown,
  options: Record<string, unknown>,
) => SSESubscription<unknown>;
