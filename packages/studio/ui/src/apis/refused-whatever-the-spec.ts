import { StudioRequestError } from "@/lib/studio-request-error";
import { isTokenRefusal } from "@/lib/token-refusal";

/* The code Studio refuses an import with whose files are still where Studio 0.3.0 bound it under another name. */
const IMPORT_RENAMED = "IMPORT_RENAMED";

/**
 * Whether Studio refused to manage an import for a reason no spec given
 * again changes: the page lacks the project's token, or the import's files
 * are still where Studio 0.3.0 bound it under a name Studio gives it no
 * more, which only removing the import and importing it again settles.
 *
 * @param error - What a manage request threw
 * @returns Whether it is such a refusal
 * @example
 * ```ts
 * setStep(refusedWhateverTheSpec(err) ? "refused" : "reupload");
 * ```
 */
export function refusedWhateverTheSpec(error: unknown): boolean {
  return (
    isTokenRefusal(error) || (error instanceof StudioRequestError && error.code === IMPORT_RENAMED)
  );
}
