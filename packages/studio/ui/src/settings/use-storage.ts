import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  readStorageReport,
  type StorageKind,
  type StorageReport,
} from "@/features/storage/storage-report";
import { post } from "@/lib/api-client";

const messageOf = (failure: unknown): string =>
  failure instanceof Error ? failure.message : String(failure);

/** Studio's storage as the page knows it, and what changes it. */
export interface StorageControls {
  report: StorageReport | null;
  /** What the last measure or change failed with, when it did. */
  error: string | null;
  busy: boolean;
  refresh: () => Promise<void>;
  clear: (kinds: readonly StorageKind[]) => Promise<boolean>;
  compact: () => Promise<boolean>;
}

/**
 * Studio's storage: what it keeps in `.courier/` and how much room each part
 * takes, measured as the page opens, and the clears and compactions that
 * change it. A change says how it went in a toast, and the report it
 * answers with replaces the one shown.
 *
 * @returns The report and its controls
 * @example
 * ```tsx
 * const storage = useStorage();
 * <button onClick={() => void storage.clear(["requests"])}>Clear</button>
 * ```
 */
export function useStorage(): StorageControls {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (url: string, body?: unknown): Promise<boolean> => {
    try {
      const answered = readStorageReport(await post<unknown>(url, body));
      if (answered === undefined) throw new Error("Studio answered with no storage report.");
      setReport(answered);
      setError(null);
      return true;
    } catch (failure) {
      setError(messageOf(failure));
      return false;
    }
  }, []);

  const refresh = useCallback(async () => void (await run("/api/storage")), [run]);

  const change = useCallback(async (url: string, body: unknown, done: string): Promise<boolean> => {
    setBusy(true);
    try {
      const answered = readStorageReport(await post<unknown>(url, body));
      if (answered === undefined) throw new Error("Studio answered with no storage report.");
      setReport(answered);
      toast.success(done);
      return true;
    } catch (failure) {
      toast.error("Studio could not change its storage", { description: messageOf(failure) });
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    report,
    error,
    busy,
    refresh,
    clear: (kinds) =>
      change("/api/storage/clear", { kinds }, "Cleared, and the database compacted"),
    compact: () => change("/api/storage/compact", {}, "Compacted the database"),
  };
}
