import type { ExplorerModel, GroupNode } from "./explorer-model";

/**
 * The groups the graph shows: every group but those inside a folded one.
 *
 * @param model - The Explorer's model
 * @param folded - The folded groups, by key
 * @returns The groups shown, in the model's order
 * @example
 * ```ts
 * shownGroups(model, new Set(["api.billing"])).map((g) => g.key); // ["api.billing", "api.users"]
 * ```
 */
export function shownGroups(
  model: ExplorerModel,
  folded: ReadonlySet<string> | undefined,
): GroupNode[] {
  if (!folded?.size) return model.groups;
  const hidden = [...folded].map((key) => `${key}.`);
  return model.groups.filter((group) => !hidden.some((prefix) => group.key.startsWith(prefix)));
}
