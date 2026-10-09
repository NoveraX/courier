import type { ExclusiveContext } from "../../exclusive-context";
import { hashFile } from "../../hash-file";
import { putBack, type SchemaFixDeps } from "./schema-fix-apply";

/** What undoing a fix came to. */
export type SchemaUndoOutcome =
  | { readonly status: "undone"; readonly files: readonly string[] }
  | { readonly status: "manual"; readonly reason: string };

/**
 * Take back the last fix Studio applied to an endpoint's schema: each file
 * it changed is written as it was, and the config runs again — only while
 * every one still holds what Studio wrote, so a person's later edit is
 * never lost.
 *
 * @param tx - The edit's hold on the reload chain
 * @param deps - The fixes applied
 * @param endpoint - The source and the endpoint's call
 * @returns What it came to
 * @example
 * ```ts
 * await runConfigEdit(project, (tx) => undoSchemaFix(tx, deps, { source: "shop", endpoint: "products.get" }));
 * ```
 */
export async function undoSchemaFix(
  tx: ExclusiveContext,
  deps: Pick<SchemaFixDeps, "applied">,
  { source, endpoint }: { source: string; endpoint: string },
): Promise<SchemaUndoOutcome> {
  const name = `${source}.${endpoint}`;
  const fix = deps.applied.get(name);
  if (fix === undefined) {
    return { status: "manual", reason: `Studio has no change to ${name}'s schema to take back.` };
  }
  const edited = fix.files.find((file) => hashFile(file.path) !== file.afterHash);
  if (edited !== undefined) {
    return {
      status: "manual",
      reason: `${edited.file} changed after Studio fixed ${name}'s schema, so Studio leaves it to you: undo it in your editor.`,
    };
  }
  deps.applied.delete(name);
  await putBack(tx, fix.files);
  return { status: "undone", files: fix.files.map((file) => file.file) };
}
