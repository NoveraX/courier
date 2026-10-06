import { fieldOf, listAt, type SpecNode } from "./spec-node";
import { specText } from "./utils";

/**
 * The tag each tag sits under, as OpenAPI 3.2's `parent` declares it: only
 * a parent the specification declares too, and never one that would make a
 * tag sit under itself.
 *
 * @param spec - The specification
 * @returns Each nested tag's parent, by the tag's name
 * @example
 * ```ts
 * tagParents(spec).get("Invoices"); // → "Billing"
 * ```
 */
export function tagParents(spec: SpecNode): Map<string, string> {
  const declared = new Map<string, string | undefined>();
  for (const tag of listAt(spec, "tags")) {
    const name = specText(fieldOf(tag, "name"));
    if (name) declared.set(name, specText(fieldOf(tag, "parent")) || undefined);
  }
  const parents = new Map<string, string>();
  for (const [name, parent] of declared) {
    if (parent !== undefined && declared.has(parent) && !reaches(declared, parent, name)) {
      parents.set(name, parent);
    }
  }
  return parents;
}

/* Whether walking up from a tag reaches the one it would sit under: a cycle. */
function reaches(
  declared: ReadonlyMap<string, string | undefined>,
  from: string,
  to: string,
): boolean {
  const seen = new Set<string>();
  for (let at: string | undefined = from; at !== undefined; at = declared.get(at)) {
    if (at === to || seen.has(at)) return true;
    seen.add(at);
  }
  return false;
}
