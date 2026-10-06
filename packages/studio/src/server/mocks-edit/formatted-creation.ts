import type { PlanFormatting } from "../import-files/file-plan-types";
import { formatProjectFiles } from "../project-format/format-project-files";
import type { MocksPlan } from "./plan/types";

/** A plan, and how the file it creates was formatted. */
export interface FormattedPlan {
  plan: MocksPlan;
  /** The tools that formatted a created file, and what went wrong; `null` for an edit. */
  formatting: PlanFormatting | null;
}

/**
 * Format a mocks file Studio creates as the project formats its code: with
 * its Biome, ESLint and Prettier, as a file Studio writes for an import is.
 * An edit to a file the user has is left as planned: it only inserts, in
 * the file's own style, and formatting the whole file could change lines
 * that are the user's.
 *
 * @param root - The project root, symlinks resolved
 * @param path - The mocks file, relative to the root
 * @param plan - The planned edit
 * @returns The plan, its created file formatted, and how
 * @example
 * ```ts
 * const { plan, formatting } = await formattedCreation(root, "courier.mocks.ts", planMocksEdit(input));
 * ```
 */
export async function formattedCreation(
  root: string,
  path: string,
  plan: MocksPlan,
): Promise<FormattedPlan> {
  if (!plan.creates) return { plan, formatting: null };
  const { files, formattedWith, problem } = await formatProjectFiles(root, [
    { path, content: plan.text },
  ]);
  const text = files[0]?.content ?? plan.text;
  const formatted =
    text === plan.text ? plan : { ...plan, text, edits: [{ start: 0, end: 0, text }] };
  return { plan: formatted, formatting: { formattedWith, problem } };
}
