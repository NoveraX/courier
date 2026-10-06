import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import { codeMentions } from "./code-mentions";
import { planImportRemovals } from "./import-removals";

/**
 * Drop the imported names some removed code used and nothing left uses:
 * a name no other code in the file mentions goes from its import, and an
 * import left with no name goes whole. Names the removed code did not use
 * stay, used or not — they are the file's business.
 *
 * @param fileName - The file's name, for the parser
 * @param text - The file once the code was removed
 * @param candidates - The names the removed code used
 * @returns The file without the imports only that code needed
 * @example
 * ```ts
 * dropUnusedImports("index.ts", withoutDeletePet, new Set(["endpoint", "PetSchema"]));
 * ```
 */
export function dropUnusedImports(
  fileName: string,
  text: string,
  candidates: ReadonlySet<string>,
): string {
  if (candidates.size === 0) return text;
  const parsed = parseSource(fileName, text);
  if (parsed.problem !== null) return text;
  const mentions = codeMentions(parsed);
  return applyEdits(
    text,
    planImportRemovals(parsed, (name) => candidates.has(name) && !mentions(name)),
  );
}
