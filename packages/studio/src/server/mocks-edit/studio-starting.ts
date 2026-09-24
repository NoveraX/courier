import { realpathSync } from "node:fs";
import { manualOutcome } from "./manual-outcome";
import { MocksEditRefusal } from "./mocks-edit-refusal";
import { snippetInputFromDisk } from "./snippet-input-from-disk";
import type { ManualOutcome, MockDeclaration } from "./types";

/**
 * The outcome while Studio has not finished loading the config: asking again
 * shortly succeeds.
 *
 * @param projectRoot - The project Studio serves
 * @param requests - The mocks asked for
 * @returns A retryable manual outcome
 */
export function studioStarting(
  projectRoot: string,
  requests: readonly MockDeclaration[],
): ManualOutcome {
  const refusal = new MocksEditRefusal(
    "STUDIO_STARTING",
    "Studio is still loading courier.config; try again in a moment.",
  );
  const input = snippetInputFromDisk(realpathSync(projectRoot), requests);
  return manualOutcome(refusal, input, input.existing?.name ?? null);
}
