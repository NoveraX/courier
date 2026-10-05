import type { FilterOption } from "./filter-options";

/** What separates the names in a group's path: `billing.invoices`. */
const SEPARATOR = ".";

interface Node {
  path: string;
  /** The requests of this group itself, `undefined` for a group only its sub-groups were seen in */
  own: FilterOption | undefined;
  children: Map<string, Node>;
}

/**
 * The Group filter's values as a tree: each group under the group it sits
 * in, named by its own name and indented by its depth, a group seen only
 * through the groups inside it added so they have somewhere to sit. Each
 * counts the requests of its whole subtree and lists the values in it, so
 * choosing a group chooses everything inside it. "No group" stays a value
 * of its own, first.
 *
 * @param flat - The Group filter's values, one per group path seen
 * @returns The values in tree order, outer groups before the groups inside them
 * @example
 * ```ts
 * groupTreeOptions([{ value: "billing.invoices", label: "billing.invoices", count: 3 }]);
 * // → billing (3, subtree ["billing", "billing.invoices"]), then invoices at depth 1
 * ```
 */
export function groupTreeOptions(flat: readonly FilterOption[]): FilterOption[] {
  const root: Node = { path: "", own: undefined, children: new Map() };
  const ungrouped = flat.filter((option) => option.value === "");
  for (const option of flat) {
    if (option.value !== "") place(root, option);
  }
  return [
    ...ungrouped,
    ...[...root.children.values()].sort(byCount).flatMap((node) => rows(node, 0)),
  ];
}

function place(root: Node, option: FilterOption): void {
  let node = root;
  for (const name of option.value.split(SEPARATOR)) {
    const path = node.path ? `${node.path}${SEPARATOR}${name}` : name;
    let child = node.children.get(name);
    if (!child) {
      child = { path, own: undefined, children: new Map() };
      node.children.set(name, child);
    }
    node = child;
  }
  node.own = option;
}

function rows(node: Node, depth: number): FilterOption[] {
  const children = [...node.children.values()].sort(byCount);
  const below = children.flatMap((child) => rows(child, depth + 1));
  const row: FilterOption = {
    value: node.path,
    label: node.path,
    name: node.path.split(SEPARATOR).at(-1) ?? node.path,
    depth,
    count: total(node),
    subtree: [node.path, ...below.map((option) => option.value)],
  };
  return [row, ...below];
}

/* The requests of a group and every group inside it. */
function total(node: Node): number {
  let count = node.own?.count ?? 0;
  for (const child of node.children.values()) count += total(child);
  return count;
}

function byCount(a: Node, b: Node): number {
  return total(b) - total(a) || a.path.localeCompare(b.path);
}
