import type { ConfigStatusPayload } from "@/store/config-status";
import type { ConnectionStatus } from "@/store/types-ui";

/** What a page still waits for from Studio before it has anything to show. */
export interface FirstLoad {
  /** The requests Studio captured, which it sends as soon as the page connects. */
  requests: boolean;
  /** The project's sources, which Studio sends once it has loaded courier.config. */
  sources: boolean;
}

/** What {@link firstLoad} reads. */
export interface FirstLoadInput {
  status: ConnectionStatus;
  config: ConfigStatusPayload | null;
  /** How many sources the page has. */
  sourceCount: number;
}

/**
 * Whether a page is still waiting for its first data: before it first
 * connects to Studio, and — for the sources — while Studio has not loaded
 * courier.config yet. A page that lost Studio, or already shows sources,
 * waits for nothing: it says what it has.
 *
 * @param input - The connection, how the config loads, and the sources the page has
 * @returns What the page still waits for
 * @example
 * ```ts
 * firstLoad({ status: "connecting", config: null, sourceCount: 0 }); // → { requests: true, sources: true }
 * ```
 */
export function firstLoad({ status, config, sourceCount }: FirstLoadInput): FirstLoad {
  const connecting = status === "connecting";
  const configPending = config === null || config.state === "starting";
  return {
    requests: connecting,
    sources: sourceCount === 0 && (connecting || (status === "connected" && configPending)),
  };
}
