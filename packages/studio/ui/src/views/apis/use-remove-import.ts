import { useCallback, useRef, useState } from "react";

import type { PlanConsent } from "./types-file-plan";
import { type AppliedFiles, type RemovalConfigNotes, previewRemoval, removeImport } from "./client-file-changes";
import { fileCount } from "./applied-notes";
import { consentBody, consentFor, toggleConfirmed } from "./plan-consent";
import { readPlanRefusal } from "./plan-refusal";

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

function removedMessage(name: string, { removed, kept, backupDir }: AppliedFiles): string {
  const notes = [
    removed.length > 0 ? `moved ${fileCount(removed.length)} into ${backupDir}` : "",
    kept.length > 0 ? `left ${fileCount(kept.length)} as ${kept.length === 1 ? "it was" : "they were"}` : "",
  ].filter((note) => note !== "");
  return notes.length > 0 ? `Removed ${name}: ${notes.join("; ")}` : `Removed ${name}; none of its files were left to remove`;
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
export function useRemoveImport(onRemoved: (name: string, message: string) => void): UseRemoveImportReturn {
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [consent, setConsent] = useState<PlanConsent | null>(null);
  const [notes, setNotes] = useState<RemovalConfigNotes | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* The import the latest preview is for: a preview answered after the dialog moved on is dropped. */
  const previewing = useRef<string | null>(null);

  const start = useCallback(async (importName: string) => {
    previewing.current = importName;
    setName(importName);
    setConsent(null);
    setNotes(null);
    setError(null);
    setLoading(true);
    try {
      const { plan, ...configNotes } = await previewRemoval(importName);
      if (previewing.current !== importName) return;
      setConsent(consentFor(plan));
      setNotes(configNotes);
    } catch (err) {
      if (previewing.current !== importName) return;
      setError(err instanceof Error ? err.message : "Could not preview removing the import");
    } finally {
      if (previewing.current === importName) setLoading(false);
    }
  }, []);

  const confirm = useCallback(async () => {
    if (name === null || consent === null) return;
    setRemoving(true);
    setError(null);
    try {
      const applied = await removeImport(name, consentBody(consent));
      setName(null);
      onRemoved(name, removedMessage(name, applied));
    } catch (err) {
      const refusal = readPlanRefusal(err);
      if (refusal) setConsent(consentFor(refusal.plan));
      setError(err instanceof Error ? err.message : "Could not remove the import");
    } finally {
      setRemoving(false);
    }
  }, [name, consent, onRemoved]);

  return {
    name, loading, removing, consent, notes, error, start, confirm,
    toggleConfirmed: useCallback((path: string) => setConsent((c) => c && toggleConfirmed(c, path)), []),
    close: useCallback(() => {
      previewing.current = null;
      setName(null);
    }, []),
  };
}
