import type { ConfigStatusPayload } from "@/store/config-status";

import { configFileName } from "@/store/config-file-name";

/** Whether sources can be picked for new mocks, and why not. */
export type SourceAvailability =
  /** The UI is not connected to Studio. */
  | { kind: "connecting"; blocked: string }
  /** Studio has not told yet how the config loads, or its first load runs. */
  | { kind: "loading"; blocked: string }
  /** The config does not load. */
  | { kind: "failed"; blocked: string; configFile: string; message: string }
  /** There is no config, or it was deleted. */
  | { kind: "missing"; blocked: string; deleted: boolean }
  /** The config loads and declares no sources. */
  | { kind: "empty"; blocked: null; configFile: string }
  /** The config loads, and its sources can be picked. */
  | { kind: "sources"; blocked: null };

/** What the availability is derived from. */
export interface SourceAvailabilityInput {
  connected: boolean;
  status: ConfigStatusPayload | null;
  /** How many sources the catalogue Studio sent lists. */
  sourceCount: number;
}

/**
 * Whether the mock wizard can offer sources, from the connection and the
 * config's status. A mock serves a source the config declares, and Studio
 * plans the edit against the config it runs, so sources are offered only
 * while the config loads: while Studio starts, while the config fails to
 * load — even when Studio keeps running what it loaded last — and while
 * there is none, the wizard says why instead, and the entry points that
 * open it are turned off with the same reason (`blocked`).
 *
 * @param input - The connection, the config's status and the number of sources
 * @returns What the source step shows, and why adding a mock is refused
 *
 * @example
 * ```ts
 * const status = { state: "missing", revision: 1, configFile: null, lastGoodAt: null } as const;
 * sourceAvailability({ connected: true, status, sourceCount: 0 });
 * // → { kind: "missing", blocked: "Create courier.config.ts first", deleted: false }
 * ```
 */
export function sourceAvailability({
  connected,
  status,
  sourceCount,
}: SourceAvailabilityInput): SourceAvailability {
  if (!connected) return { kind: "connecting", blocked: "Studio is not connected" };
  if (status === null || status.state === "starting") {
    return { kind: "loading", blocked: "Studio is still loading courier.config" };
  }
  const configFile = configFileName(status);
  switch (status.state) {
    case "failed":
      return {
        kind: "failed",
        blocked: `${configFile} does not load; fix it first`,
        configFile,
        message: status.error.message,
      };
    case "missing":
      return status.lastGoodAt === null
        ? { kind: "missing", blocked: "Create courier.config.ts first", deleted: false }
        : { kind: "missing", blocked: `${configFile} was deleted; restore it first`, deleted: true };
    case "loaded":
      return sourceCount > 0
        ? { kind: "sources", blocked: null }
        : { kind: "empty", blocked: null, configFile };
  }
}
