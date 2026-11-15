import { ConfigurationError } from "../errors/configuration-error";
import { isCount } from "../realtime/ws/frame-fields";
import { WS_DEFAULTS } from "./ws-defaults";
import type { WSHandlerConfig } from "./ws-types";

/* The longest wait a timer keeps: a longer one runs out at once. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Refuse, where the handler is made, the terms its `auth_ok` would tell a
 * client and no client keeps, by the client's own rules: a heartbeat
 * whose interval or timeout is no whole number of milliseconds, 1 or
 * more, or whose two waits are longer together than a timer waits, and a
 * `maxMessageSize` that is no whole number of bytes, 1 or more. A client
 * takes such an `auth_ok` for a server of another version of the
 * protocol, and connects again for ever.
 *
 * @param config - The handler's options
 * @throws ConfigurationError `WS_OPTIONS_INVALID`, naming the option
 * @example
 * ```ts
 * assertClientTerms({ heartbeatIntervalMs: 25_000, maxMessageSize: 65_536 });
 * ```
 */
export function assertClientTerms(config: WSHandlerConfig): void {
  const problem = problemOf(config);
  if (problem === undefined) return;
  const [options, what] = problem;
  throw new ConfigurationError(
    "WS_OPTIONS_INVALID",
    `[courier] createWSHandler({ ${options} }) ${what}: no client keeps it.`,
  );
}

/* The options that are wrong, and what they take instead. */
function problemOf(config: WSHandlerConfig): readonly [string, string] | undefined {
  const intervalMs = config.heartbeatIntervalMs ?? WS_DEFAULTS.heartbeatIntervalMs;
  const timeoutMs = config.heartbeatTimeoutMs ?? WS_DEFAULTS.heartbeatTimeoutMs;
  const maxMessageSize = config.maxMessageSize ?? WS_DEFAULTS.maxMessageSize;
  if (!isCount(intervalMs)) return ["heartbeatIntervalMs", wholeMs(intervalMs)];
  if (!isCount(timeoutMs)) return ["heartbeatTimeoutMs", wholeMs(timeoutMs)];
  if (intervalMs + timeoutMs > MAX_TIMER_MS) {
    return [
      "heartbeatIntervalMs, heartbeatTimeoutMs",
      `takes waits of ${MAX_TIMER_MS} ms at most together, not ${intervalMs + timeoutMs}`,
    ];
  }
  if (!isCount(maxMessageSize)) {
    return [
      "maxMessageSize",
      `takes a whole number of bytes, 1 or more, not ${String(maxMessageSize)}`,
    ];
  }
  return undefined;
}

function wholeMs(given: unknown): string {
  return `takes a whole number of milliseconds, 1 or more, not ${String(given)}`;
}
