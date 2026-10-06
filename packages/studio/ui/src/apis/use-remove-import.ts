import { useCallback, useRef, useState } from "react";
import { previewRemoval, type RemovalConfigNotes, removeImport } from "@/apis/client-file-changes";
import { type ConfigUndeclare, readConfigUndeclare } from "@/features/apis/config-undeclare";
import { consentBody, consentFor, toggleConfirmed } from "@/features/apis/plan-consent";
import { readPlanRefusal } from "@/features/apis/plan-refusal";
import { readFilePlan } from "@/features/apis/read-file-plan";
import { removedMessage } from "@/features/apis/removed-message";
import type { PlanConsent } from "@/features/apis/types-file-plan";
import { StudioRequestError } from "@/lib/studio-request-error";

/** The remove dialog: the import it is for, and what removing it does. */
export interface UseRemoveImportReturn {
  /** The import being removed; `null` while the dialog is closed. */
  name: string | null;
  loading: boolean;
  removing: boolean;
  /** The plan and the steps allowed, once previewed. */
  consent: PlanConsent | null;
  /** What courier.config still says about the import, once previewed. */
  notes: RemovalConfigNotes | null;
  /** The change that takes the import out of courier.config, once previewed; `null` where it declares none. */
  change: ConfigUndeclare | null;
  /** Whether Remove makes that change before the files go; only a ready change is made. */
  undeclare: boolean;
  setUndeclare: (undeclare: boolean) => void;
  error: string | null;
  /** Open the dialog for an import and preview removing it. */
  start: (name: string) => Promise<void>;
  toggleConfirmed: (path: string) => void;
  /** Remove the import as previewed, with the steps allowed. */
  confirm: () => Promise<void>;
  close: () => void;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Removing an import from the APIs page: the dialog previews which files go,
 * which wait for the user and which stay, and the change that takes the
 * import out of courier.config, made first unless the user says not to;
 * nothing is removed until the user confirms. A plan or a config that
 * changed in the meantime comes back to be looked at again, and so does a
 * config Studio could not change, with that change no longer asked for.
 *
 * @param onRemoved - Told the import removed and what happened to its files
 * @returns The dialog's state and actions
 * @example
 * ```ts
 * const removal = useRemoveImport((name, message) => toast.success(message));
 * removal.start("pets");
 * ```
 */
export function useRemoveImport(
  onRemoved: (name: string, message: string) => void,
): UseRemoveImportReturn {
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [consent, setConsent] = useState<PlanConsent | null>(null);
  const [notes, setNotes] = useState<RemovalConfigNotes | null>(null);
  const [change, setChange] = useState<ConfigUndeclare | null>(null);
  const [undeclare, setUndeclare] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Each opening of the dialog: an answer that arrives for an earlier one is dropped. */
  const opening = useRef(0);

  const load = useCallback(async (importName: string, keptError: string | null, offer = true) => {
    const mine = opening.current;
    setConsent(null);
    setNotes(null);
    setChange(null);
    setError(keptError);
    setLoading(true);
    try {
      const { plan, config, ...configNotes } = await previewRemoval(importName);
      if (opening.current !== mine) return;
      const read = readFilePlan(plan);
      if (read === null)
        throw new Error("Studio sent a plan this page cannot read; open the dialog again.");
      const shown = readConfigUndeclare(config);
      setConsent(consentFor(read));
      setNotes(configNotes);
      setChange(shown);
      setUndeclare(offer && shown?.status === "ready");
    } catch (err) {
      if (opening.current === mine)
        setError(messageOf(err, "Could not preview removing the import"));
    } finally {
      if (opening.current === mine) setLoading(false);
    }
  }, []);

  const start = useCallback(
    (importName: string) => {
      opening.current += 1;
      setName(importName);
      return load(importName, null);
    },
    [load],
  );

  /* A plan or a config that changed meanwhile is previewed again in full, with nothing allowed. */
  const confirm = useCallback(async () => {
    if (name === null || consent === null) return;
    const mine = opening.current;
    setRemoving(true);
    setError(null);
    try {
      const baseHash = undeclare && change?.status === "ready" ? change.baseHash : undefined;
      const applied = await removeImport(name, consentBody(consent), baseHash);
      if (opening.current !== mine) return;
      setName(null);
      onRemoved(name, removedMessage(name, applied));
    } catch (err) {
      if (opening.current !== mine) return;
      const message = messageOf(err, "Could not remove the import");
      const code = err instanceof StudioRequestError ? err.code : undefined;
      if (readPlanRefusal(err) !== null || code === "CONFIG_STALE") await load(name, message);
      else if (code === "CONFIG_NOT_CHANGED") await load(name, message, false);
      else setError(message);
    } finally {
      setRemoving(false);
    }
  }, [name, consent, change, undeclare, onRemoved, load]);

  return {
    name,
    loading,
    removing,
    consent,
    notes,
    change,
    undeclare,
    setUndeclare,
    error,
    start,
    confirm,
    toggleConfirmed: useCallback(
      (path: string) => setConsent((c) => c && toggleConfirmed(c, path)),
      [],
    ),
    close: useCallback(() => {
      opening.current += 1;
      setName(null);
    }, []),
  };
}
