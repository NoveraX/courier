/**
 * Shared types for in-process direct stream executors.
 *
 * These executors run SSE/WS endpoints inside the same process as the
 * caller (no network round-trip) but reuse the canonical adapter pipeline
 * — resolve → validate → middleware → handler → instrument — so the
 * observable behavior matches production proxy/direct execution exactly.
 *
 * Their primary consumer is the Studio Playground, which routes every
 * request through this path so that what it shows is what production does.
 */

import type { WSChannel } from "../../realtime/types";
import type { PlaygroundWSRegistry } from "./ws-registry";

/** Payload for direct in-process SSE execution */
export interface ExecuteDirectSSEPayload {
  /** Source name registered in the Sources map */
  source: string;
  /** Optional group name */
  group?: string | undefined;
  /** Endpoint method name */
  method: string;
  /** Untyped variables — validated against the endpoint's variables schema */
  variables?: Record<string, unknown> | undefined;
  /** User-supplied request headers (e.g. Authorization) — flowed into middleware */
  headers?: Record<string, string> | undefined;
}

/** Optional execution-time controls for in-process streams */
export interface ExecuteDirectStreamOptions {
  /**
   * External AbortSignal — when aborted, the underlying generator's
   * `ctx.signal` is also aborted and the stream closes cleanly.
   */
  signal?: AbortSignal;
  /**
   * Caller-supplied requestId for Studio correlation. When the caller already
   * tracks a stream by id (e.g. the Playground returning a requestId to the
   * UI before the stream starts) pass it here so all `stream:*` events use
   * the same id. Falls back to an auto-generated id when omitted.
   */
  requestId?: string;
}

/** Payload for direct in-process WS push (server→client async generator) execution */
export interface ExecuteDirectWSPushPayload {
  source: string;
  group?: string | undefined;
  method: string;
  variables?: Record<string, unknown> | undefined;
  headers?: Record<string, string> | undefined;
}

/** Payload for direct in-process WS bidirectional channel execution */
export interface ExecuteDirectWSChannelPayload {
  source: string;
  group?: string | undefined;
  method: string;
  variables?: Record<string, unknown> | undefined;
  headers?: Record<string, string> | undefined;
}

/**
 * A WS channel run in-process, whose `send` settles with the result.
 *
 * Over the network a message the server refuses comes back as an error
 * frame; in-process there is no frame, so `send` rejects instead — with the
 * receive-schema failure or the `onMessage` error. It is typed as a promise
 * so a caller cannot drop that rejection unnoticed: an unawaited one ended
 * the process.
 */
export interface InProcessWSChannel extends Omit<WSChannel, "send"> {
  send(data: unknown): Promise<void>;
}

/** Optional execution-time controls for in-process WS channels */
export interface ExecuteDirectWSChannelOptions {
  /** External abort signal that triggers `channel.close()` when fired */
  signal?: AbortSignal;
  /**
   * Caller-supplied requestId for Studio correlation. Same semantics as
   * `ExecuteDirectStreamOptions.requestId` — pass it when an outer tracking
   * id (e.g. Playground requestId) must match the `stream:*` events.
   */
  requestId?: string;
  /**
   * Playground broadcast registry — opt-in. Pass an explicit registry to
   * isolate broadcast scope (e.g. per-test, per-tab session). When omitted,
   * the module-level shared registry is used so multiple playground tabs in
   * the same process can broadcast between each other.
   */
  registry?: PlaygroundWSRegistry;
}
