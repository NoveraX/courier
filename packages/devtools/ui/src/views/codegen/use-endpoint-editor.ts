import { useState, useMemo, useCallback, useEffect } from "react";

import type { ParsedGroup, ParsedSpec, SourceSummary } from "./types";
import { fetchParseSpec, fetchGenerateCode, fetchWriteFiles } from "./api";
import { fetchRemoveSource } from "./api-registry";
import { fetchScanProject } from "./api-scanner";
import { formatWriteResult, groupKey } from "./helpers";
import { buildSelectionFromScan } from "./selection-helpers";
import { useSelectionActions } from "./use-selection-actions";

export function useEndpointEditor(source: SourceSummary, onApplied: () => void) {
  const [spec, setSpec] = useState<ParsedSpec | null>(null);
  const [selection, setSelection] = useState<Record<string, Set<string>>>({});
  const [initialSelection, setInitialSelection] = useState<Record<string, Set<string>>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const actions = useSelectionActions({ spec, setSelection, setExpandedGroups });

  const loadSpec = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!source.specUrl) {
        setError("Cannot load spec: source was imported from file/paste. Remove and re-import to edit endpoints.");
        return;
      }
      const [parsed, scan] = await Promise.all([
        fetchParseSpec(source.specUrl),
        fetchScanProject().catch(() => ({ sources: [], scannedFiles: 0 })),
      ]);
      setSpec(parsed);
      const scanned = scan.sources.find((s) => s.name === source.name);
      const initial = buildSelectionFromScan(parsed, scanned);
      setSelection(initial);
      setInitialSelection(initial);
      setExpandedGroups(new Set(parsed.groups.map((g, i) => groupKey(g, i))));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load spec");
    } finally {
      setLoading(false);
    }
  }, [source.name, source.specUrl]);

  /* Load spec when source changes */
  useEffect(() => { loadSpec(); }, [loadSpec]);

  const groupKeys = useMemo(() => {
    if (!spec) return new Map<ParsedGroup, string>();
    const map = new Map<ParsedGroup, string>();
    spec.groups.forEach((g, i) => map.set(g, groupKey(g, i)));
    return map;
  }, [spec]);

  const filteredGroups = useMemo(() => {
    if (!spec) return [];
    if (!search.trim()) return spec.groups;
    const q = search.toLowerCase();
    return spec.groups
      .map((g) => ({
        ...g,
        endpoints: g.endpoints.filter((e) =>
          e.name.toLowerCase().includes(q)
          || e.fullPath.toLowerCase().includes(q)
          || e.httpMethod.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.endpoints.length > 0 || g.name.toLowerCase().includes(q));
  }, [spec, search]);

  const { totalSelected, totalEndpoints, removedCount } = useMemo(() => {
    if (!spec) return { totalSelected: 0, totalEndpoints: 0, removedCount: 0 };
    let selected = 0;
    let total = 0;
    let removed = 0;
    for (const group of spec.groups) {
      const gKey = groupKeys.get(group) ?? group.name;
      total += group.endpoints.length;
      selected += selection[gKey]?.size ?? 0;
      /* Count endpoints on disk that are now deselected */
      const prevSet = initialSelection[gKey];
      if (prevSet) {
        const curSet = selection[gKey] ?? new Set();
        for (const name of prevSet) {
          if (!curSet.has(name)) removed++;
        }
      }
    }
    return { totalSelected: selected, totalEndpoints: total, removedCount: removed };
  }, [spec, selection, groupKeys, initialSelection]);

  const handleApply = useCallback(async () => {
    if (!spec) return;
    setApplying(true);
    setError(null);
    setResult(null);
    try {
      /* All endpoints deselected → remove source from registry */
      if (totalSelected === 0) {
        await fetchRemoveSource(source.name);
        setResult("Source removed from registry");
        onApplied();
        return;
      }
      const selectedEndpoints: Record<string, string[]> = {};
      for (const [gKey, endpoints] of Object.entries(selection)) {
        if (endpoints.size > 0) selectedEndpoints[gKey] = [...endpoints];
      }
      const opts = { ...source.options, selectedEndpoints };
      const files = await fetchGenerateCode(spec, opts);
      const writeResult = await fetchWriteFiles(files, {
        sourceName: source.name,
        spec,
        specUrl: source.specUrl,
        importType: source.importType,
        options: opts,
      });
      setResult(formatWriteResult(writeResult));
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  }, [spec, selection, totalSelected, source, onApplied]);

  return {
    spec, loading, applying, error, result, search,
    selection, expandedGroups, groupKeys, filteredGroups,
    totalSelected, totalEndpoints, removedCount,
    setSearch, handleApply,
    ...actions,
  };
}
