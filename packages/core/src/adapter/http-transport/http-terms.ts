import { ConfigurationError } from "../../errors/configuration-error";
import { LIMITS } from "../../limits";
import { isCount } from "../../realtime/ws/frame-fields";
import { isRecord } from "../../utils/is-record";
import { ownFields } from "../../utils/own";
import { wsFrameLimit } from "../ws-frame-limit";
import type { WSHandlerConfig } from "../ws-types";

/** How a handler's HTTP transport holds its answers, as `createWSHandler({ http })` sets it. */
export interface HTTPTransportOptions {
  /**
   * The longest a poll is held with nothing to send, in ms (default 25000).
   * It ends sooner as soon as there is a frame, the heartbeat's ping among
   * them, so a poll is never held past the heartbeat's interval either.
   * Keep it under the idle timeout of every proxy in front of the server.
   */
  holdMs?: number | undefined;
  /**
   * The longest one stream runs, in ms (default 60000): the server then ends
   * it, and its client asks for the next with what it has taken, losing
   * nothing. A proxy that cuts a stream sooner loses nothing either.
   */
  streamMs?: number | undefined;
}

/** What a handler's connections over HTTP keep to. */
export interface HTTPTerms {
  /** The longest a poll is held with nothing to send */
  readonly holdMs: number;
  /** The longest a stream runs */
  readonly streamMs: number;
  /** How long a connection the server closed waits for an answer to tell its client on */
  readonly lingerMs: number;
  /** The bytes of answers a client reads before it acknowledges, unasked, the frames it took */
  readonly ackBytes: number;
  /** The largest body a request may have */
  readonly maxBodyBytes: number;
}

/** The transport's waits unless `http` sets them. */
export const HTTP_DEFAULTS = { holdMs: 25_000, streamMs: 60_000 } as const;

/* A poll's gap is a round trip: a client is back long before this. */
const LINGER_MS = 5_000;
/* Acknowledged a quarter of the buffer at a time at most, a stream keeps well under the limit
   that drops a slow client's events, without a request per frame. */
const ACK_BYTES = 65_536;
const MAX_TIMER_MS = 2_147_483_647;

/**
 * The terms of a handler's HTTP transport, from its options; none when
 * `http` is `false`. A request carries frames as a socket's frame does, so
 * its body is held to the frame limit of `maxMessageSize`.
 *
 * @param config - The handler's options
 * @returns The terms, or `undefined` without the transport
 * @throws ConfigurationError `WS_OPTIONS_INVALID` for a wait that is no
 *   whole number of milliseconds a timer keeps
 * @example
 * ```ts
 * httpTermsOf({ http: { holdMs: 20_000 } });
 * // { holdMs: 20000, streamMs: 60000, lingerMs: 5000, ackBytes: 65536, maxBodyBytes: 1048576 }
 * ```
 */
export function httpTermsOf(config: WSHandlerConfig): HTTPTerms | undefined {
  if (config.http === false) return undefined;
  const given: HTTPTransportOptions = isRecord(config.http) ? ownFields(config.http) : {};
  const holdMs = given.holdMs ?? HTTP_DEFAULTS.holdMs;
  const streamMs = given.streamMs ?? HTTP_DEFAULTS.streamMs;
  assertWait("holdMs", holdMs);
  assertWait("streamMs", streamMs);
  const maxBuffered = config.maxBufferedAmount ?? LIMITS.MAX_BUFFERED_AMOUNT;
  return {
    holdMs,
    streamMs,
    lingerMs: LINGER_MS,
    ackBytes: Math.max(1, Math.min(ACK_BYTES, Math.floor(maxBuffered / 4))),
    maxBodyBytes: wsFrameLimit(config.maxMessageSize),
  };
}

function assertWait(name: keyof HTTPTransportOptions, ms: number): void {
  if (isCount(ms) && ms <= MAX_TIMER_MS) return;
  throw new ConfigurationError(
    "WS_OPTIONS_INVALID",
    `[courier] createWSHandler({ http: { ${name} } }) is ${String(ms)}: it takes a whole number of milliseconds from 1 to ${MAX_TIMER_MS}.`,
  );
}
