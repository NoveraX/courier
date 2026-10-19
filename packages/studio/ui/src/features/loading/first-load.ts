import type { ConfigStatusPayload } from "@/store/config-status";
import type { ConnectionStatus, Received } from "@/store/types-ui";

/** What a page still waits for from Studio before it has anything to show. */
export interface FirstLoad {
  /** The requests Studio captured, which it sends as soon as the page connects. */
  requests: boolean;
  /** Which apps are attached, which Studio sends as soon as the page connects. */
  runtimes: boolean;
  /** The project's sources, which Studio sends once it has loaded courier.config. */
  sources: boolean;
}

/** What {@link firstLoad} reads. */
export interface FirstLoadInput {
  status: ConnectionStatus;
  /** Which of what Studio sends a page as it connects has come. */
  received: Received;
  config: ConfigStatusPayload | null;
  /** How many sources the page has. */
  sourceCount: number;
}

/**
 * Whether a page is still waiting for its first data: before it first
 * connects to Studio; for the runtimes, while connected until Studio has
 * said which apps are attached; and for the sources, while Studio has not
 * loaded courier.config yet. A page that lost Studio, or already shows
 * sources, waits for nothing: it says what it has.
 *
 * @param input - The connection, what Studio has sent, how the config loads, and the sources the page has
 * @returns What the page still waits for
 * @example
 * ```ts
 * const received = { runtimes: false, requests: false };
 * firstLoad({ status: "connecting", received, config: null, sourceCount: 0 });
 * // → { requests: true, runtimes: true, sources: true }
 * ```
 */
export function firstLoad({ status, received, config, sourceCount }: FirstLoadInput): FirstLoad {
  const connecting = status === "connecting";
  const connected = status === "connected";
  const configPending = config === null || config.state === "starting";
  return {
    requests: connecting,
    runtimes: connecting || (connected && !received.runtimes),
    sources: sourceCount === 0 && (connecting || (connected && configPending)),
  };
}
