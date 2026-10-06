import type { CourierImportEntry } from "@noverax/courier/config";

/** What the last update check of an import found, at the URL it fetched. */
export type UpdateCheckRecord =
  /** The specification was read: its hash says whether it changed. */
  | { from: string; checkedAt: number; latestHash: string }
  /** It could not be read, or was not the specification pinned. */
  | { from: string; checkedAt: number; error: string };

/** An import's last update check, as the imports list carries it to every UI. */
export interface ImportCheck {
  status: "up-to-date" | "updates-available" | "error";
  /** When the check ended, in epoch milliseconds. */
  checkedAt: number;
  /** Why the check failed. */
  error?: string | undefined;
}

/** The last update check of each import, kept while Studio runs. */
export interface UpdateChecks {
  /** Remember an import's check, in place of the one before. */
  record(name: string, check: UpdateCheckRecord): void;
  /** Forget an import that is gone, so an import named the same later starts unchecked. */
  forget(name: string): void;
  /**
   * An import's last check, against the specification it was last generated
   * from: up to date once that is the specification the check read, an
   * update available while it is not. None for an import never checked, or
   * whose declaration now names another URL than the one checked.
   */
  of(
    name: string,
    entry: CourierImportEntry | undefined,
    specHash: string | undefined,
  ): ImportCheck | undefined;
}

/**
 * Keep the last update check of each import, so every page shows it — one
 * opened later, or reloaded, too — until the import changes or Studio stops.
 *
 * @returns No checks yet
 * @example
 * ```ts
 * const checks = createUpdateChecks();
 * checks.record("billing", { from, checkedAt: Date.now(), latestHash });
 * checks.of("billing", entry, state.specHash)?.status; // → "updates-available"
 * ```
 */
export function createUpdateChecks(): UpdateChecks {
  const checks = new Map<string, UpdateCheckRecord>();
  return {
    record(name, check) {
      checks.set(name, check);
    },
    forget(name) {
      checks.delete(name);
    },
    of(name, entry, specHash) {
      const check = checks.get(name);
      if (check === undefined || entry?.importType !== "url" || entry.from !== check.from) {
        return undefined;
      }
      if ("error" in check)
        return { status: "error", checkedAt: check.checkedAt, error: check.error };
      const status = check.latestHash === specHash ? "up-to-date" : "updates-available";
      return { status, checkedAt: check.checkedAt };
    },
  };
}
