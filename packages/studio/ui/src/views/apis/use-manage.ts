/**
 * The manage dialog's state: the spec, the import's endpoint inventory, the
 * endpoints picked to add and remove, and the plan previewed for them.
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
import { useInventoryLoaders } from "./use-manage-loaders";
import { useManagePlan } from "./use-manage-plan";
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
  const [error, setError] = useState<string | null>(null);
  const { reset, ...selection } = useManageSelection(inventory);
  const { toAdd, toRemove } = selection;
  const onApplied = useCallback((message: string) => {
    setOpen(false);
    onSuccess?.(message);
  }, [onSuccess]);
  const plan = useManagePlan({ sourceName, spec, toAdd, toRemove, setStep, setError, onApplied });
  const { clear } = plan;

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
    clear();
    setError(null);
    setOpen(true);

    if (newSpec) {
      void loadInventory(source.name, newSpec);
    } else if (source.importType === "url" && source.specUrl) {
      void fetchSpecAndLoadInventory(source.name, source.specUrl);
    } else {
      setStep("reupload");
    }
  }, [loadInventory, fetchSpecAndLoadInventory, reset, clear]);

  const provideSpec = useCallback(async (parsedSpec: ParsedSpec) => {
    setSpec(parsedSpec);
    await loadInventory(sourceName, parsedSpec);
  }, [sourceName, loadInventory]);

  const back = useCallback(() => {
    if (step === "preview") setStep("inventory");
    else if (step === "inventory") setStep("reupload");
  }, [step]);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  return {
    ...selection,
    open, step, sourceName, importType, inventory, error,
    preview: plan.preview,
    consent: plan.consent,
    start, provideSpec,
    requestPreview: plan.requestPreview,
    apply: plan.apply,
    toggleConfirmed: plan.toggleConfirmed,
    back, close,
  };
}
