import { useCallback, useState } from "react";
import { applyManage, previewManage } from "@/apis/client-file-changes";
import { appliedMessage, countsOf } from "@/features/apis/applied-notes";
import { serializeSets } from "@/features/apis/manage-sets";
import { consentBody, consentFor, toggleConfirmed } from "@/features/apis/plan-consent";
import { readPlanRefusal } from "@/features/apis/plan-refusal";
import { readFilePlan } from "@/features/apis/read-file-plan";
import type { ManagePreviewResult, ManageStep, ParsedSpec } from "@/features/apis/types";
import type { PlanConsent } from "@/features/apis/types-file-plan";
import type { ManageChange } from "@/features/apis/types-manage";

/** What the manage dialog applies, and how it reports. */
export interface ManagePlanInput {
  sourceName: string;
  spec: ParsedSpec | null;
  toAdd: Record<string, Set<string>>;
  toRemove: Record<string, Set<string>>;
  setStep: (step: ManageStep) => void;
  setError: (error: string | null) => void;
  /** Told what the apply did, once it applied. */
  onApplied: (message: string) => void;
}

/** The previewed plan, the steps allowed, and the actions on it. */
export interface ManagePlan {
  preview: ManagePreviewResult | null;
  consent: PlanConsent | null;
  /** Whether the plan shown writes every file again from the spec, as asked. */
  regenerating: boolean;
  /** Preview the change picked; with `regenerate`, every file written again from the spec. */
  requestPreview: (regenerate?: boolean) => Promise<void>;
  apply: () => Promise<void>;
  toggleConfirmed: (path: string) => void;
  /** Drop the plan shown, as a new opening of the dialog does. */
  clear: () => void;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Preview adding and removing the picked endpoints, or writing every file
 * again from the spec, and apply the plan the user saw with the steps they
 * allowed. A preview Studio refuses is said on
 * the endpoint list; an apply it refuses because the files changed is
 * previewed again in full, so the warnings and the plan shown are the
 * current ones, with nothing allowed.
 *
 * @param input - The import, the picked endpoints, and the dialog's step and error setters
 * @returns The plan and its actions
 * @example
 * ```ts
 * const plan = useManagePlan({ sourceName, spec, toAdd, toRemove, setStep, setError, onApplied });
 * ```
 */
export function useManagePlan(input: ManagePlanInput): ManagePlan {
  const { sourceName, spec, toAdd, toRemove, setStep, setError, onApplied } = input;
  const [preview, setPreview] = useState<ManagePreviewResult | null>(null);
  const [consent, setConsent] = useState<PlanConsent | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const changeOf = useCallback(
    (regenerate: boolean): ManageChange => ({
      toAdd: serializeSets(toAdd),
      toRemove: serializeSets(toRemove),
      ...(regenerate && { regenerate }),
    }),
    [toAdd, toRemove],
  );

  const load = useCallback(
    async (keptError: string | null, regenerate: boolean) => {
      if (!spec) return;
      setStep("preview");
      setPreview(null);
      setConsent(null);
      setRegenerating(regenerate);
      setError(keptError);
      try {
        const result = await previewManage(sourceName, spec, changeOf(regenerate));
        const plan = readFilePlan(result.plan);
        if (plan === null)
          throw new Error("Studio sent a plan this page cannot read; preview the changes again.");
        setPreview({ ...result, plan });
        setConsent(consentFor(plan));
      } catch (err) {
        setError(messageOf(err, "Preview failed"));
        setStep("inventory");
      }
    },
    [spec, sourceName, changeOf, setStep, setError],
  );

  const apply = useCallback(async () => {
    if (!spec || consent === null) return;
    setStep("applying");
    setError(null);
    try {
      const applied = await applyManage(
        sourceName,
        spec,
        changeOf(regenerating),
        consentBody(consent),
      );
      setStep("done");
      onApplied(appliedMessage(`Updated ${sourceName}`, countsOf(applied)));
    } catch (err) {
      if (readPlanRefusal(err) !== null) {
        await load(messageOf(err, "Apply failed"), regenerating);
        return;
      }
      setError(messageOf(err, "Apply failed"));
      setStep("preview");
    }
  }, [spec, sourceName, changeOf, regenerating, consent, setStep, setError, onApplied, load]);

  return {
    preview,
    consent,
    regenerating,
    requestPreview: useCallback((regenerate = false) => load(null, regenerate), [load]),
    apply,
    toggleConfirmed: useCallback(
      (path: string) => setConsent((c) => c && toggleConfirmed(c, path)),
      [],
    ),
    clear: useCallback(() => {
      setPreview(null);
      setConsent(null);
    }, []),
  };
}
