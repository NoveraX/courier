import { useCallback, useMemo, useRef, useState } from "react";
import { checkAllUpdates, checkSourceUpdates } from "@/apis/client";
import type { ApisPageState } from "@/features/apis/apis-page-state";
import { apisPageState } from "@/features/apis/apis-page-state";
import { checkStatuses, type PageStatus } from "@/features/apis/check-statuses";
import type {
  ParsedSpec,
  ScannedSource,
  SourceStatusInfo,
  SourceSummary,
} from "@/features/apis/types";
import { ownValue } from "@/lib/own-value";
import { useStudioStore } from "@/store";

/** Scanned source enriched with registry metadata (if imported) */
export interface EnrichedSource extends ScannedSource {
  registry?: SourceSummary | undefined;
}

interface UseRegistryReturn {
  /** All sources (imported + hand-written) with live data from scanner */
  imported: EnrichedSource[];
  handWritten: ScannedSource[];
  /** Per-source status (update check results) */
  statuses: Record<string, SourceStatusInfo>;
  /** What the page shows, and why Import is refused. */
  page: ApisPageState;
  checkUpdates: (name: string) => Promise<void>;
  checkAll: () => Promise<void>;
  /** Drop what the page knows of an import once it is removed. */
  forget: (name: string) => void;
  getNewSpec: (name: string) => ParsedSpec | undefined;
}

/**
 * The APIs page's sources and their update checks. Studio keeps each
 * check's outcome and sends it with the imports list, so it shows on every
 * page — one opened later, or reloaded, too; this page shows a check under
 * way, and the answer to its own check until that list comes.
 *
 * @returns The sources, their statuses, and the checks to run
 * @example
 * ```ts
 * const { imported, statuses, checkAll } = useRegistry();
 * ```
 */
export function useRegistry(): UseRegistryReturn {
  const [pageStatuses, setPageStatuses] = useState<Record<string, PageStatus>>({});
  const newSpecsRef = useRef<Record<string, ParsedSpec>>({});

  // Live data from socket (pushed by server on connect + file changes)
  const scanSources = useStudioStore((s) => s.scanSources);
  const registrySources = useStudioStore((s) => s.registrySources);
  const connected = useStudioStore((s) => s.connected);
  const configStatus = useStudioStore((s) => s.configStatus);
  const page = useMemo(
    () => apisPageState({ connected, status: configStatus, sourceCount: scanSources.length }),
    [connected, configStatus, scanSources.length],
  );
  const statuses = useMemo(
    () => checkStatuses(registrySources, pageStatuses),
    [registrySources, pageStatuses],
  );

  // Derive enriched/handWritten from store data
  const { imported, handWritten } = useMemo(() => {
    const registryMap = new Map(registrySources.map((s) => [s.name, s]));
    const enriched: EnrichedSource[] = [];
    const handW: ScannedSource[] = [];

    for (const source of scanSources) {
      if (source.isImported) {
        enriched.push({ ...source, registry: registryMap.get(source.name) });
      } else {
        handW.push(source);
      }
    }
    return { imported: enriched, handWritten: handW };
  }, [scanSources, registrySources]);

  /* The checks of `names` end with `answers`, each holding until Studio sends the list anew. */
  const answered = useCallback(
    (names: readonly string[], answers: Record<string, SourceStatusInfo>) => {
      const against = useStudioStore.getState().registrySources;
      setPageStatuses((prev) => {
        const next = { ...prev };
        for (const name of names) delete next[name];
        for (const [name, info] of Object.entries(answers)) next[name] = { info, against };
        return next;
      });
    },
    [],
  );

  const checking = useCallback((names: readonly string[]) => {
    setPageStatuses((prev) => {
      const next = { ...prev };
      for (const name of names) next[name] = { info: { status: "checking" }, against: null };
      return next;
    });
  }, []);

  const checkUpdates = useCallback(
    async (name: string) => {
      checking([name]);
      try {
        const result = await checkSourceUpdates(name);
        if (result.newSpec) newSpecsRef.current[name] = result.newSpec;
        const status = result.changed ? "updates-available" : "up-to-date";
        answered([name], { [name]: { status, checkedAt: Date.now() } });
      } catch (err) {
        const error = err instanceof Error ? err.message : "Check failed";
        answered([name], { [name]: { status: "error", error, checkedAt: Date.now() } });
      }
    },
    [checking, answered],
  );

  const checkAll = useCallback(async () => {
    const names = imported.map((s) => s.name);
    checking(names);
    try {
      const { results } = await checkAllUpdates();
      const next: Record<string, SourceStatusInfo> = {};
      const checkedAt = Date.now();
      for (const [name, result] of Object.entries(results)) {
        if (result.error) next[name] = { status: "error", error: result.error, checkedAt };
        else if (result.unchecked) next[name] = { status: "unchecked", error: result.unchecked };
        else
          next[name] = { status: result.changed ? "updates-available" : "up-to-date", checkedAt };
      }
      answered(names, next);
    } catch (err) {
      /* Every import shows why the check failed, rather than no status at all. */
      const error = err instanceof Error ? err.message : "Check failed";
      const failed: Record<string, SourceStatusInfo> = {};
      for (const name of names) failed[name] = { status: "error", error };
      answered(names, failed);
    }
  }, [imported, checking, answered]);

  /* The lists come back from Studio once the import's state is gone. A
     source the running config still imports stays listed until the config
     no longer imports it, since Studio still runs it. */
  const forget = useCallback((name: string) => answered([name], {}), [answered]);

  const getNewSpec = useCallback((name: string) => {
    return ownValue(newSpecsRef.current, name);
  }, []);

  return {
    imported,
    handWritten,
    statuses,
    page,
    checkUpdates,
    checkAll,
    forget,
    getNewSpec,
  };
}
