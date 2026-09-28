import { useState, useMemo, useCallback, useRef } from "react";

import { useCatalog } from "@/hooks/use-catalog";
import { useStudioStore } from "@/store";
import type { CatalogEndpoint, CatalogEntry } from "@/store/types-ui";
import { sendableCatalog } from "./sendable-catalog";
import type { BodyKind } from "./body-section";
import { emptyField, type FormBodyField } from "./form-body";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Pick first available key, or fallback. null = "not selected" sentinel. */
function resolve(value: string | null, keys: string[]): string {
  if (value !== null && keys.includes(value)) return value;
  return keys[0] ?? "";
}

/** Build prefilled variables from schema stub or path params */
function buildVariablesStub(endpoint: CatalogEndpoint | null, indent: number): string {
  if (!endpoint) return "{}";

  // Prefer schema-derived stub (has field names + typed defaults)
  if (endpoint.variablesStub && Object.keys(endpoint.variablesStub).length > 0) {
    return JSON.stringify(endpoint.variablesStub, null, indent);
  }

  // Fallback: extract path params (`:id` → { "id": "" })
  if (!endpoint.path) return "{}";
  const params = endpoint.path.match(/:(\w+)/g);
  if (!params || params.length === 0) return "{}";
  const obj: Record<string, string> = {};
  for (const p of params) obj[p.slice(1)] = "";
  return JSON.stringify(obj, null, indent);
}

// ── Hook ───────────────────────────────────────────────────────────────────

export interface PlaygroundInitParams {
  source?: string;
  group?: string;
  method?: string;
}

export function usePlayground(init?: PlaygroundInitParams) {
  const catalog = useCatalog();
  const declared = useStudioStore((s) => s.scanSources);
  const bindingRows = useStudioStore((s) => s.bindingSnapshot.rows);
  const jsonIndent = useStudioStore((s) => s.settings.jsonIndent);
  const sourceMap = useMemo(
    () => sendableCatalog(catalog, declared, bindingRows),
    [catalog, declared, bindingRows],
  );
  const sourceKeys = useMemo(() => Object.keys(sourceMap), [sourceMap]);

  const [source, setSource] = useState<string | null>(init?.source ?? null);
  const [group, setGroup] = useState<string | null>(init?.group ?? null);
  const [method, setMethod] = useState<string | null>(init?.method ?? null);
  const [variables, setVariables] = useState("{}");
  const [headers, setHeaders] = useState("{}");
  const [mode, setMode] = useState<"direct" | "proxy">("direct");
  const [bodyKind, setBodyKind] = useState<BodyKind>("json");
  const [formFields, setFormFields] = useState<FormBodyField[]>(() => [emptyField()]);
  const [responseTab, setResponseTab] = useState("body");

  // Track previous endpoint to detect selection changes
  const prevEndpointKey = useRef("");

  const effectiveSource = resolve(source, sourceKeys);

  const groupKeys = useMemo(() => {
    const src = sourceMap[effectiveSource];
    return src ? Object.keys(src.groups) : [];
  }, [sourceMap, effectiveSource]);

  const effectiveGroup = resolve(group, groupKeys);

  const methodKeys = useMemo(() => {
    const grp = sourceMap[effectiveSource]?.groups[effectiveGroup];
    return grp ? Object.keys(grp.endpoints) : [];
  }, [sourceMap, effectiveSource, effectiveGroup]);

  const effectiveMethod = resolve(method, methodKeys);
  const sourceInfo: CatalogEntry | null = sourceMap[effectiveSource] ?? null;
  const groupPrefix = sourceInfo?.groups[effectiveGroup]?.prefix ?? "";
  const endpointInfo: CatalogEndpoint | null = useMemo(
    () => sourceInfo?.groups[effectiveGroup]?.endpoints[effectiveMethod] ?? null,
    [sourceInfo, effectiveGroup, effectiveMethod],
  );

  // Prefill variables when endpoint changes
  const endpointKey = `${effectiveSource}.${effectiveGroup}.${effectiveMethod}`;
  if (endpointKey !== prevEndpointKey.current) {
    prevEndpointKey.current = endpointKey;
    const stub = buildVariablesStub(endpointInfo, jsonIndent);
    if (stub !== "{}") setVariables(stub);
    else setVariables("{}");
  }

  const handleSource = useCallback((s: string) => {
    setSource(s);
    setGroup(null);
    setMethod(null);
  }, []);

  const handleGroup = useCallback((g: string) => {
    setGroup(g);
    setMethod(null);
  }, []);

  const selectEndpoint = useCallback((s: string, g: string, m: string) => {
    setSource(s);
    setGroup(g);
    setMethod(m);
  }, []);

  return {
    sourceMap,
    sources: sourceKeys,
    groups: groupKeys,
    methods: methodKeys,
    sourceInfo,
    groupPrefix,
    endpointInfo,
    source: effectiveSource,
    group: effectiveGroup,
    method: effectiveMethod,
    setSource: handleSource,
    setGroup: handleGroup,
    setMethod,
    selectEndpoint,
    variables,
    setVariables,
    headers,
    setHeaders,
    mode,
    setMode,
    bodyKind,
    setBodyKind,
    formFields,
    setFormFields,
    responseTab,
    setResponseTab,
    canSend: Boolean(effectiveSource && effectiveMethod && groupKeys.includes(effectiveGroup)),
  };
}
