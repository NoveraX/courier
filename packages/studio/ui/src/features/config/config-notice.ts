import { formatClockTime } from "@/lib/formatters";
import { configFileName } from "@/store/config-file-name";
import type { ConfigStatusPayload } from "@/store/config-status";

/** What the status bar says of a config Studio does not run as it is on disk. */
export interface ConfigNotice {
  label: string;
  /** The details, for the notice's title. */
  title: string;
  /** The config failed to load, rather than went away. */
  failed: boolean;
}

/**
 * The notice for how the config loads: "config error" while it does not
 * load, "config deleted" once it is gone after Studio ran it, nothing
 * otherwise — a project that never had a config gets none: the APIs page
 * says so.
 *
 * @param status - The config's status, or `null` while Studio has not told it
 * @returns The notice, or `null`
 * @example
 * ```ts
 * configNotice({ state: "missing", revision: 3, configFile: "courier.config.ts", lastGoodAt: 1 });
 * // → { label: "config deleted", title: "courier.config.ts was deleted; …", failed: false }
 * ```
 */
export function configNotice(status: ConfigStatusPayload | null): ConfigNotice | null {
  const file = configFileName(status);
  if (status?.state === "failed") {
    return {
      label: "config error",
      title: `${file} does not load: ${status.error.message}`,
      failed: true,
    };
  }
  if (status?.state !== "missing" || status.lastGoodAt === null) return null;
  return {
    label: "config deleted",
    title: `${file} was deleted; Studio runs what it loaded at ${formatClockTime(status.lastGoodAt)}`,
    failed: false,
  };
}
