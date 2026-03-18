import { useState, useEffect, useCallback, useRef } from "react";

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

const DEBOUNCE_MS = 400;

export function useRegistry(): UseRegistryReturn {
  const [imported, setImported] = useState<EnrichedSource[]>([]);
  const [handWritten, setHandWritten] = useState<ScannedSource[]>([]);
  const [statuses, setStatuses] = useState<Record<string, SourceStatusInfo>>({});
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const newSpecsRef = useRef<Record<string, ParsedSpec>>({});

  const refresh = useCallback(async () => {
    try {
      const [reg, scan] = await Promise.all([
        fetchRegistrySources(),
        scanProject(),
      ]);

      const registryMap = new Map(reg.sources.map((s) => [s.name, s]));

      const enriched: EnrichedSource[] = [];
      const handW: ScannedSource[] = [];

      for (const source of scan.sources) {
        if (source.isImported) {
          enriched.push({ ...source, registry: registryMap.get(source.name) });
        } else {
          handW.push(source);
        }
      }

      setImported(enriched);
      setHandWritten(handW);
    } catch {
      // Silently fail — server may not be ready
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const handler = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void refresh(), DEBOUNCE_MS);
    };
    window.addEventListener("nexus:scan:updated", handler);
    window.addEventListener("nexus:registry:updated", handler);
    return () => {
      clearTimeout(debounceRef.current);
      window.removeEventListener("nexus:scan:updated", handler);
      window.removeEventListener("nexus:registry:updated", handler);
    };
  }, [refresh]);

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
    setImported((prev) => prev.filter((s) => s.name !== name));
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
