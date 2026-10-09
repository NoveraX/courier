/**
 * The manage dialog's state: the spec, the import's endpoint inventory, the
 * endpoints picked to add and remove, and the plan previewed for them. An
 * import declared from traffic reads its traffic again for the spec.
 */

import { useCallback, useState } from "react";
import type {
  EndpointInventory,
  ManagePreviewResult,
  ManageStep,
  ParsedSpec,
  SourceSummary,
} from "@/features/apis/types";
import type { PlanConsent } from "@/features/apis/types-file-plan";
import { useInventoryLoaders } from "./use-manage-loaders";
import { useManagePlan } from "./use-manage-plan";
import { type ManageSelection, useManageSelection } from "./use-manage-selection";

export interface UseManageReturn extends Omit<ManageSelection, "reset"> {
  open: boolean;
  step: ManageStep;
  sourceName: string;
  importType: string;
  /** The import was declared from traffic, which is read again rather than a spec given. */
  fromTraffic: boolean;
  inventory: EndpointInventory | null;
  preview: ManagePreviewResult | null;
  /** The previewed plan, with the pending steps the user allowed. */
  consent: PlanConsent | null;
  error: string | null;
  /** Start the manage flow for a source, from a spec given, with an endpoint picked to add */
  start: (source: SourceSummary, spec?: ParsedSpec, picked?: PickedEndpoint) => void;
  /** Provide spec after reupload */
  provideSpec: (spec: ParsedSpec) => Promise<void>;
  /** Whether the plan shown writes every file again from the spec. */
  regenerating: boolean;
  /** Preview the changes picked; with `regenerate`, every file written again from the spec */
  requestPreview: (regenerate?: boolean) => Promise<void>;
  /** Apply changes to disk */
  apply: () => Promise<void>;
  /** Allow a pending step of the plan, or withdraw allowing it */
  toggleConfirmed: (path: string) => void;
  /** Go back one step */
  back: () => void;
  /** Close dialog */
  close: () => void;
}

/** An endpoint to add, picked before the inventory shows: a traffic-only endpoint's own. */
export interface PickedEndpoint {
  group: string;
  name: string;
}

export function useManage(onSuccess?: (message: string) => void): UseManageReturn {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ManageStep>("loading");
  const [sourceName, setSourceName] = useState("");
  const [importType, setImportType] = useState("");
  const [fromTraffic, setFromTraffic] = useState(false);
  const [spec, setSpec] = useState<ParsedSpec | null>(null);
  const [inventory, setInventory] = useState<EndpointInventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { reset, ...selection } = useManageSelection(inventory);
  const { toggleEndpoint } = selection;
  const { toAdd, toRemove } = selection;
  const onApplied = useCallback(
    (message: string) => {
      setOpen(false);
      onSuccess?.(message);
    },
    [onSuccess],
  );
  const plan = useManagePlan({ sourceName, spec, toAdd, toRemove, setStep, setError, onApplied });
  const { clear } = plan;

  const { loadInventory, fetchSpecAndLoadInventory, readTrafficAndLoadInventory } =
    useInventoryLoaders({
      setStep,
      setError,
      setInventory,
      setSpec,
    });

  const start = useCallback(
    (source: SourceSummary, newSpec?: ParsedSpec, picked?: PickedEndpoint) => {
      setSourceName(source.name);
      setImportType(source.importType);
      setFromTraffic(source.fromTraffic === true);
      setSpec(newSpec ?? null);
      setInventory(null);
      reset();
      clear();
      setError(null);
      setOpen(true);

      const loading = newSpec
        ? loadInventory(source.name, newSpec)
        : source.fromTraffic
          ? readTrafficAndLoadInventory(source.name)
          : source.importType === "url" && source.specUrl
            ? fetchSpecAndLoadInventory(source.name, source.specUrl)
            : undefined;
      if (!loading) {
        setStep("reupload");
        return;
      }
      /* Picked once the inventory shows it, among the endpoints the import does not have yet. */
      const pick = async () => {
        if ((await loading) && picked) toggleEndpoint(picked.group, picked.name, false);
      };
      void pick();
    },
    [
      loadInventory,
      fetchSpecAndLoadInventory,
      readTrafficAndLoadInventory,
      reset,
      clear,
      toggleEndpoint,
    ],
  );

  const provideSpec = useCallback(
    async (parsedSpec: ParsedSpec) => {
      setSpec(parsedSpec);
      await loadInventory(sourceName, parsedSpec);
    },
    [sourceName, loadInventory],
  );

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
    open,
    step,
    sourceName,
    importType,
    fromTraffic,
    inventory,
    error,
    preview: plan.preview,
    consent: plan.consent,
    regenerating: plan.regenerating,
    start,
    provideSpec,
    requestPreview: plan.requestPreview,
    apply: plan.apply,
    toggleConfirmed: plan.toggleConfirmed,
    back,
    close,
  };
}
