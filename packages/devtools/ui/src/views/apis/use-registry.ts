import { useState, useCallback, useRef, useMemo } from "react";

import type {
  SourceSummary,
  ScannedSource,
  SourceStatus,
  SourceStatusInfo,
  ParsedSpec,
} from "./types";
import {
  fetchRegistrySources,
  scanProject,
  checkSourceUpdates,
  checkAllUpdates,
  removeRegistrySource,
} from "./client";
import { useDevToolsStore } from "@/store";

/** Scanned source enriched with registry metadata (if imported) */
export interface EnrichedSource extends ScannedSource {
  registry?: SourceSummary;
}

interface UseRegistryReturn {
  /** All sources (imported + hand-written) with live data from scanner */
  imported: EnrichedSource[];
  handWritten: ScannedSource[];
  /** Per-source status (update check results) */
  statuses: Record<string, SourceStatusInfo>;
  loading: boolean;
  refresh: () => Promise<void>;
  checkUpdates: (name: string) => Promise<void>;
  checkAll: () => Promise<void>;
  remove: (name: string) => Promise<void>;
  getNewSpec: (name: string) => ParsedSpec | undefined;
}

export function useRegistry(): UseRegistryReturn {
  const [statuses, setStatuses] = useState<Record<string, SourceStatusInfo>>({});
  const newSpecsRef = useRef<Record<string, ParsedSpec>>({});

  // Live data from socket (pushed by server on connect + file changes)
  const scanSources = useDevToolsStore((s) => s.scanSources);
  const registrySources = useDevToolsStore((s) => s.registrySources);
  const connected = useDevToolsStore((s) => s.connected);
  const loading = !connected || (scanSources.length === 0 && registrySources.length === 0);

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

  // Manual refresh — re-fetches from server (for post-import, post-update)
  const refresh = useCallback(async () => {
    try {
      const [reg, scan] = await Promise.all([
        fetchRegistrySources(),
        scanProject(),
      ]);

      useDevToolsStore.getState().setScanSources(scan.sources);
      useDevToolsStore.getState().setRegistrySources(reg.sources);
    } catch {
      // Silently fail — server may not be ready
    }
  }, []);

  const checkUpdates = useCallback(async (name: string) => {
    setStatuses((prev) => ({
      ...prev,
      [name]: { status: "checking" as SourceStatus },
    }));
    try {
      const result = await checkSourceUpdates(name);
      if (result.newSpec) newSpecsRef.current[name] = result.newSpec;
      setStatuses((prev) => ({
        ...prev,
        [name]: {
          status: result.changed ? "updates-available" : "up-to-date",
          newSpec: result.newSpec,
        },
      }));
    } catch (err) {
      setStatuses((prev) => ({
        ...prev,
        [name]: {
          status: "error",
          error: err instanceof Error ? err.message : "Check failed",
        },
      }));
    }
  }, []);

  const checkAll = useCallback(async () => {
    const checking: Record<string, SourceStatusInfo> = {};
    for (const s of imported) checking[s.name] = { status: "checking" };
    setStatuses(checking);
    try {
      const { results } = await checkAllUpdates();
      const next: Record<string, SourceStatusInfo> = {};
      for (const [name, result] of Object.entries(results)) {
        next[name] = {
          status: result.changed ? "updates-available" : "up-to-date",
          error: result.error,
        };
      }
      setStatuses(next);
    } catch {
      setStatuses({});
    }
  }, [imported]);

  const remove = useCallback(async (name: string) => {
    await removeRegistrySource(name);
    const store = useDevToolsStore.getState();
    store.setScanSources(store.scanSources.filter((s) => s.name !== name));
    setStatuses((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const getNewSpec = useCallback((name: string) => {
    return newSpecsRef.current[name];
  }, []);

  return {
    imported,
    handWritten,
    statuses,
    loading,
    refresh,
    checkUpdates,
    checkAll,
    remove,
    getNewSpec,
  };
}
