import { ConfigurationError } from "../errors/configuration-error";
import { isCount } from "../realtime/ws/frame-fields";
import { WS_DEFAULTS } from "./ws-defaults";
import type { WSHandlerConfig } from "./ws-types";

/* The longest wait a timer keeps: a longer one runs out at once. */
const MAX_TIMER_MS = 2_147_483_647;

/** The terms an `auth_ok` tells a client: the heartbeat, and the largest message read. */
export interface ClientTerms {
  /** How often the server pings, in milliseconds */
  readonly intervalMs: number;
  /** How long it waits for the pong, in milliseconds */
  readonly timeoutMs: number;
  /** The largest message it reads, in bytes */
  readonly maxMessageSize: number;
}

/** The terms a problem lies in, in the order they are set. */
export type ClientTermNames = readonly (keyof ClientTerms)[];

/* A handler's option for each term. */
const HANDLER_OPTIONS: Readonly<Record<keyof ClientTerms, keyof WSHandlerConfig>> = {
  intervalMs: "heartbeatIntervalMs",
  timeoutMs: "heartbeatTimeoutMs",
  maxMessageSize: "maxMessageSize",
};

/**
 * Refuse terms an `auth_ok` would tell a client and no client keeps, by
 * the client's own rules: a heartbeat whose interval or timeout is no
 * whole number of milliseconds, 1 or more, or whose two waits are longer
 * together than a timer waits, and a `maxMessageSize` that is no whole
 * number of bytes, 1 or more. A client takes such an `auth_ok` for a
 * server of another version of the protocol, and connects again for ever.
 *
 * @param terms - The terms, with the defaults the server would send
 * @param written - The call that set them, as its caller writes it with the options of those terms
 * @throws ConfigurationError `WS_OPTIONS_INVALID`, naming the options
 * @example
 * ```ts
 * assertClientTerms(
 *   { intervalMs: 25_000, timeoutMs: 10_000, maxMessageSize: 65_536 },
 *   (names) => `createWSHandler({ ${names.join(", ")} })`,
 * );
 * ```
 */
export function assertClientTerms(
  terms: ClientTerms,
  written: (names: ClientTermNames) => string,
): void {
  const problem = problemOf(terms);
  if (problem === undefined) return;
  const [names, what] = problem;
  throw new ConfigurationError(
    "WS_OPTIONS_INVALID",
    `[courier] ${written(names)} ${what}: no client keeps it.`,
  );
}

/**
 * Refuse, where a WebSocket handler is made, the terms its `auth_ok`
 * would tell a client and no client keeps, as `assertClientTerms` reads
 * them, naming the handler's options.
 *
 * @param config - The handler's options
 * @throws ConfigurationError `WS_OPTIONS_INVALID`, naming the option
 * @example
 * ```ts
 * assertHandlerTerms({ heartbeatIntervalMs: 25_000, maxMessageSize: 65_536 });
 * ```
 */
export function assertHandlerTerms(config: WSHandlerConfig): void {
  assertClientTerms(
    {
      intervalMs: config.heartbeatIntervalMs ?? WS_DEFAULTS.heartbeatIntervalMs,
      timeoutMs: config.heartbeatTimeoutMs ?? WS_DEFAULTS.heartbeatTimeoutMs,
      maxMessageSize: config.maxMessageSize ?? WS_DEFAULTS.maxMessageSize,
    },
    (names) => `createWSHandler({ ${names.map((name) => HANDLER_OPTIONS[name]).join(", ")} })`,
  );
}

/* The terms that are wrong, and what they take instead. */
function problemOf(terms: ClientTerms): readonly [ClientTermNames, string] | undefined {
  const { intervalMs, timeoutMs, maxMessageSize } = terms;
  if (!isCount(intervalMs)) return [["intervalMs"], wholeMs(intervalMs)];
  if (!isCount(timeoutMs)) return [["timeoutMs"], wholeMs(timeoutMs)];
  if (intervalMs + timeoutMs > MAX_TIMER_MS) {
    return [
      ["intervalMs", "timeoutMs"],
      `takes waits of ${MAX_TIMER_MS} ms at most together, not ${intervalMs + timeoutMs}`,
    ];
  }
  if (!isCount(maxMessageSize)) {
    return [
      ["maxMessageSize"],
      `takes a whole number of bytes, 1 or more, not ${String(maxMessageSize)}`,
    ];
  }
  return undefined;
}

function wholeMs(given: unknown): string {
  return `takes a whole number of milliseconds, 1 or more, not ${String(given)}`;
}
