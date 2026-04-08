/**
 * State management hook for the unified manage dialog.
 *
 * Handles inventory loading, endpoint selection, preview, and apply.
 * Inventory loaders live in `./use-manage-loaders` and pure helpers in
 * `./use-manage-helpers`.
 */

import { useCallback, useState } from "react";

import type {
  EndpointInventory,
  ManagePreviewResult,
  ManageStep,
  ParsedSpec,
  SourceSummary,
} from "./types";
import { applyManage, previewManage } from "./client";
import { computeAllToggle, computeGroupToggle, toggleInSet } from "./manage-toggle";
import { serializeSets } from "./use-manage-helpers";
import { useInventoryLoaders } from "./use-manage-loaders";

export interface UseManageReturn {
  open: boolean;
  step: ManageStep;
  sourceName: string;
  importType: string;
  inventory: EndpointInventory | null;
  toAdd: Record<string, Set<string>>;
  toRemove: Record<string, Set<string>>;
  preview: ManagePreviewResult | null;
  error: string | null;
  /** Start manage flow for a source */
  start: (source: SourceSummary, spec?: ParsedSpec) => void;
  /** Provide spec after reupload */
  provideSpec: (spec: ParsedSpec) => Promise<void>;
  /** Toggle an endpoint: add or remove */
  toggleEndpoint: (group: string, name: string, currentlyActive: boolean) => void;
  /** Toggle all endpoints in a group */
  toggleGroup: (groupName: string) => void;
  /** Select all / deselect all */
  toggleAll: () => void;
  /** Request preview of pending changes */
  requestPreview: () => Promise<void>;
  /** Apply changes to disk */
  apply: () => Promise<void>;
  /** Go back one step */
  back: () => void;
  /** Close dialog */
  close: () => void;
  hasChanges: boolean;
}

export function useManage(onSuccess?: () => void): UseManageReturn {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ManageStep>("loading");
  const [sourceName, setSourceName] = useState("");
  const [importType, setImportType] = useState("");
  const [spec, setSpec] = useState<ParsedSpec | null>(null);
  const [inventory, setInventory] = useState<EndpointInventory | null>(null);
  const [toAdd, setToAdd] = useState<Record<string, Set<string>>>({});
  const [toRemove, setToRemove] = useState<Record<string, Set<string>>>({});
  const [preview, setPreview] = useState<ManagePreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasChanges = Object.values(toAdd).some((s) => s.size > 0)
    || Object.values(toRemove).some((s) => s.size > 0);

  const { loadInventory, fetchSpecAndLoadInventory } = useInventoryLoaders({
    setStep,
    setError,
    setInventory,
    setSpec,
  });

  const start = useCallback((source: SourceSummary, newSpec?: ParsedSpec) => {
    setSourceName(source.name);
    setImportType(source.importType);
    setSpec(newSpec ?? null);
    setInventory(null);
    setToAdd({});
    setToRemove({});
    setPreview(null);
    setError(null);
    setOpen(true);

    if (newSpec) {
      void loadInventory(source.name, newSpec);
    } else if (source.importType === "url" && source.specUrl) {
      void fetchSpecAndLoadInventory(source.name, source.specUrl);
    } else {
      setStep("reupload");
    }
  }, [loadInventory, fetchSpecAndLoadInventory]);

  const provideSpec = useCallback(async (parsedSpec: ParsedSpec) => {
    setSpec(parsedSpec);
    await loadInventory(sourceName, parsedSpec);
  }, [sourceName, loadInventory]);

  const toggleEndpoint = useCallback((group: string, name: string, currentlyActive: boolean) => {
    if (currentlyActive) {
      setToRemove((prev) => toggleInSet(prev, group, name));
    } else {
      setToAdd((prev) => toggleInSet(prev, group, name));
    }
  }, []);

  const toggleGroup = useCallback((groupName: string) => {
    if (!inventory) return;
    const group = inventory.groups.find((g) => g.name === groupName);
    if (!group) return;
    const result = computeGroupToggle(group, toAdd, toRemove);
    setToAdd(result.toAdd);
    setToRemove(result.toRemove);
  }, [inventory, toAdd, toRemove]);

  const toggleAll = useCallback(() => {
    if (!inventory) return;
    const result = computeAllToggle(inventory, toAdd, toRemove);
    setToAdd(result.toAdd);
    setToRemove(result.toRemove);
  }, [inventory, toAdd, toRemove]);

  const requestPreview = useCallback(async () => {
    if (!spec) return;
    setStep("preview");
    setError(null);
    try {
      const result = await previewManage(
        sourceName,
        spec,
        serializeSets(toAdd),
        serializeSets(toRemove),
      );
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
      setStep("inventory");
    }
  }, [spec, sourceName, toAdd, toRemove]);

  const apply = useCallback(async () => {
    if (!spec) return;
    setStep("applying");
    setError(null);
    try {
      await applyManage(
        sourceName,
        spec,
        serializeSets(toAdd),
        serializeSets(toRemove),
      );
      setStep("done");
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
      setStep("preview");
    }
  }, [spec, sourceName, toAdd, toRemove, onSuccess]);

  const back = useCallback(() => {
    if (step === "preview") setStep("inventory");
    else if (step === "inventory") setStep("reupload");
  }, [step]);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  return {
    open, step, sourceName, importType,
    inventory, toAdd, toRemove, preview, error,
    start, provideSpec, toggleEndpoint, toggleGroup, toggleAll,
    requestPreview, apply, back, close, hasChanges,
  };
}
