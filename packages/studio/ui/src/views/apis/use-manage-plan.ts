import { useCallback, useState } from "react";

import type { ManagePreviewResult, ManageStep, ParsedSpec } from "./types";
import type { PlanConsent } from "./types-file-plan";
import { appliedMessage, countsOf } from "./applied-notes";
import { applyManage, previewManage } from "./client-file-changes";
import { consentBody, consentFor, toggleConfirmed } from "./plan-consent";
import { readPlanRefusal } from "./plan-refusal";
import { readFilePlan } from "./read-file-plan";
import { serializeSets } from "./use-manage-helpers";

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
  requestPreview: () => Promise<void>;
  apply: () => Promise<void>;
  toggleConfirmed: (path: string) => void;
  /** Drop the plan shown, as a new opening of the dialog does. */
  clear: () => void;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Preview adding and removing the picked endpoints, and apply the plan the
 * user saw with the steps they allowed. A preview Studio refuses is said on
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

  const load = useCallback(async (keptError: string | null) => {
    if (!spec) return;
    setStep("preview");
    setPreview(null);
    setConsent(null);
    setError(keptError);
    try {
      const result = await previewManage(sourceName, spec, serializeSets(toAdd), serializeSets(toRemove));
      const plan = readFilePlan(result.plan);
      if (plan === null) throw new Error("Studio sent a plan this page cannot read; preview the changes again.");
      setPreview({ ...result, plan });
      setConsent(consentFor(plan));
    } catch (err) {
      setError(messageOf(err, "Preview failed"));
      setStep("inventory");
    }
  }, [spec, sourceName, toAdd, toRemove, setStep, setError]);

  const apply = useCallback(async () => {
    if (!spec || consent === null) return;
    setStep("applying");
    setError(null);
    try {
      const body = consentBody(consent);
      const applied = await applyManage(sourceName, spec, serializeSets(toAdd), serializeSets(toRemove), body);
      setStep("done");
      onApplied(appliedMessage(`Updated ${sourceName}`, countsOf(applied)));
    } catch (err) {
      if (readPlanRefusal(err) !== null) {
        await load(messageOf(err, "Apply failed"));
        return;
      }
      setError(messageOf(err, "Apply failed"));
      setStep("preview");
    }
  }, [spec, sourceName, toAdd, toRemove, consent, setStep, setError, onApplied, load]);

  return {
    preview,
    consent,
    requestPreview: useCallback(() => load(null), [load]),
    apply,
    toggleConfirmed: useCallback((path: string) => setConsent((c) => c && toggleConfirmed(c, path)), []),
    clear: useCallback(() => {
      setPreview(null);
      setConsent(null);
    }, []),
  };
}
