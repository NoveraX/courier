import { realpathSync } from "node:fs";
import { manualOutcome } from "./manual-outcome";
import { MocksEditRefusal } from "./mocks-edit-refusal";
import { snippetInputFromDisk } from "./snippet-input-from-disk";
import type { ManualOutcome, MockDeclaration, RefusalCode } from "./types";

/**
 * The outcome while Studio has not caught up with courier.config on disk:
 * asking again shortly succeeds. `STUDIO_STARTING` while the first load has
 * no outcome yet; `STUDIO_BUSY` while a later load or an edit outlasts the
 * wait, or files are still being saved — Studio then runs an older version
 * of the project, and a plan against it could name a source as missing that
 * the saved config declares.
 *
 * @param projectRoot - The project Studio serves
 * @param requests - The mocks asked for
 * @param code - Whether Studio is starting or busy
 * @returns A retryable manual outcome
 *
 * @example
 * ```ts
 * if (view.settling) return studioLoading(ctx.projectRoot, requests, "STUDIO_BUSY");
 * ```
 */
export function studioLoading(
  projectRoot: string,
  requests: readonly MockDeclaration[],
  code: Extract<RefusalCode, "STUDIO_STARTING" | "STUDIO_BUSY">,
): ManualOutcome {
  const refusal = new MocksEditRefusal(
    code,
    "Studio is still loading courier.config; try again in a moment.",
  );
  const input = snippetInputFromDisk(realpathSync(projectRoot), requests);
  return manualOutcome(refusal, input, input.existing?.name ?? null);
}
