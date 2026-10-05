import { useCallback, useRef, useState } from "react";
import {
  type AppliedFiles,
  previewRemoval,
  type RemovalConfigNotes,
  removeImport,
} from "@/apis/client-file-changes";
import { fileCount, unremovedNote } from "@/features/apis/applied-notes";
import { consentBody, consentFor, toggleConfirmed } from "@/features/apis/plan-consent";
import { readPlanRefusal } from "@/features/apis/plan-refusal";
import { readFilePlan } from "@/features/apis/read-file-plan";
import type { PlanConsent } from "@/features/apis/types-file-plan";

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

function removedMessage(
  name: string,
  { removed, kept, backupDir, pruneFailures }: AppliedFiles,
): string {
  const notes = [
    removed.length > 0 ? `moved ${fileCount(removed.length)} into ${backupDir ?? "a backup"}` : "",
    kept.length > 0
      ? `left ${fileCount(kept.length)} as ${kept.length === 1 ? "it was" : "they were"}`
      : "",
    unremovedNote(pruneFailures.map((failure) => failure.path)),
  ].filter((note) => note !== "");
  return notes.length > 0
    ? `Removed ${name}: ${notes.join("; ")}`
    : `Removed ${name}; none of its files were left to remove`;
}

/**
 * Removing an import from the APIs page: the dialog previews which files go,
 * which wait for the user and which stay, and what courier.config still
 * says; nothing is removed until the user confirms. A plan that changed in
 * the meantime comes back to be looked at again.
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
  const [error, setError] = useState<string | null>(null);

  /* Each opening of the dialog: an answer that arrives for an earlier one is dropped. */
  const opening = useRef(0);

  const load = useCallback(async (importName: string, keptError: string | null) => {
    const mine = opening.current;
    setConsent(null);
    setNotes(null);
    setError(keptError);
    setLoading(true);
    try {
      const { plan, ...configNotes } = await previewRemoval(importName);
      if (opening.current !== mine) return;
      const read = readFilePlan(plan);
      if (read === null)
        throw new Error("Studio sent a plan this page cannot read; open the dialog again.");
      setConsent(consentFor(read));
      setNotes(configNotes);
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

  /* A plan that changed meanwhile is previewed again in full, notes included, with nothing allowed. */
  const confirm = useCallback(async () => {
    if (name === null || consent === null) return;
    const mine = opening.current;
    setRemoving(true);
    setError(null);
    try {
      const applied = await removeImport(name, consentBody(consent));
      if (opening.current !== mine) return;
      setName(null);
      onRemoved(name, removedMessage(name, applied));
    } catch (err) {
      if (opening.current !== mine) return;
      if (readPlanRefusal(err) !== null)
        await load(name, messageOf(err, "Could not remove the import"));
      else setError(messageOf(err, "Could not remove the import"));
    } finally {
      setRemoving(false);
    }
  }, [name, consent, onRemoved, load]);

  return {
    name,
    loading,
    removing,
    consent,
    notes,
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
