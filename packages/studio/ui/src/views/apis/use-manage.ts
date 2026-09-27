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
import type { PlanConsent } from "./types-file-plan";
import { appliedMessage, countsOf } from "./applied-notes";
import { applyManage, previewManage } from "./client-file-changes";
import { consentBody, consentFor, toggleConfirmed } from "./plan-consent";
import { readPlanRefusal } from "./plan-refusal";
import { serializeSets } from "./use-manage-helpers";
import { useInventoryLoaders } from "./use-manage-loaders";
import { type ManageSelection, useManageSelection } from "./use-manage-selection";

export interface UseManageReturn extends Omit<ManageSelection, "reset"> {
  open: boolean;
  step: ManageStep;
  sourceName: string;
  importType: string;
  inventory: EndpointInventory | null;
  preview: ManagePreviewResult | null;
  /** The previewed plan, with the pending steps the user allowed. */
  consent: PlanConsent | null;
  error: string | null;
  /** Start manage flow for a source */
  start: (source: SourceSummary, spec?: ParsedSpec) => void;
  /** Provide spec after reupload */
  provideSpec: (spec: ParsedSpec) => Promise<void>;
  /** Request preview of pending changes */
  requestPreview: () => Promise<void>;
  /** Apply changes to disk */
  apply: () => Promise<void>;
  /** Allow a pending step of the plan, or withdraw allowing it */
  toggleConfirmed: (path: string) => void;
  /** Go back one step */
  back: () => void;
  /** Close dialog */
  close: () => void;
}

export function useManage(onSuccess?: (message: string) => void): UseManageReturn {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ManageStep>("loading");
  const [sourceName, setSourceName] = useState("");
  const [importType, setImportType] = useState("");
  const [spec, setSpec] = useState<ParsedSpec | null>(null);
  const [inventory, setInventory] = useState<EndpointInventory | null>(null);
  const [preview, setPreview] = useState<ManagePreviewResult | null>(null);
  const [consent, setConsent] = useState<PlanConsent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { reset, ...selection } = useManageSelection(inventory);
  const { toAdd, toRemove } = selection;

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
    reset();
    setPreview(null);
    setConsent(null);
    setError(null);
    setOpen(true);

    if (newSpec) {
      void loadInventory(source.name, newSpec);
    } else if (source.importType === "url" && source.specUrl) {
      void fetchSpecAndLoadInventory(source.name, source.specUrl);
    } else {
      setStep("reupload");
    }
  }, [loadInventory, fetchSpecAndLoadInventory, reset]);

  const provideSpec = useCallback(async (parsedSpec: ParsedSpec) => {
    setSpec(parsedSpec);
    await loadInventory(sourceName, parsedSpec);
  }, [sourceName, loadInventory]);

  /* The plan shown is dropped at once, so Apply waits for the plan of this selection. */
  const requestPreview = useCallback(async () => {
    if (!spec) return;
    setStep("preview");
    setPreview(null);
    setConsent(null);
    setError(null);
    try {
      const result = await previewManage(
        sourceName,
        spec,
        serializeSets(toAdd),
        serializeSets(toRemove),
      );
      setPreview(result);
      setConsent(consentFor(result.plan));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
      setStep("inventory");
    }
  }, [spec, sourceName, toAdd, toRemove]);

  const apply = useCallback(async () => {
    if (!spec || consent === null) return;
    setStep("applying");
    setError(null);
    try {
      const applied = await applyManage(
        sourceName,
        spec,
        serializeSets(toAdd),
        serializeSets(toRemove),
        consentBody(consent),
      );
      setStep("done");
      setOpen(false);
      onSuccess?.(appliedMessage(`Updated ${sourceName}`, countsOf(applied)));
    } catch (err) {
      /* The plan as it stands replaces the one shown, so the user allows its steps anew. */
      const refusal = readPlanRefusal(err);
      if (refusal) {
        setPreview((shown) => shown && { ...shown, plan: refusal.plan });
        setConsent(consentFor(refusal.plan));
      }
      setError(err instanceof Error ? err.message : "Apply failed");
      setStep("preview");
    }
  }, [spec, sourceName, toAdd, toRemove, consent, onSuccess]);

  const back = useCallback(() => {
    if (step === "preview") setStep("inventory");
    else if (step === "inventory") setStep("reupload");
  }, [step]);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const toggleStep = useCallback((path: string) => setConsent((c) => c && toggleConfirmed(c, path)), []);

  return {
    ...selection,
    open, step, sourceName, importType, inventory, preview, consent, error,
    start, provideSpec, requestPreview, apply, toggleConfirmed: toggleStep, back, close,
  };
}
