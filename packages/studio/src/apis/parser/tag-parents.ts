import { fieldOf, listAt, type SpecNode } from "./spec-node";
import { specText } from "./utils";

/**
 * The tag each tag sits under, as OpenAPI 3.2's `parent` declares it: only
 * a parent the specification declares too, and never one that would make a
 * tag sit under itself.
 *
 * A tag whose chain of parents runs into a loop — through itself, or
 * through tags above it — sits under none, so no loop is generated as
 * groups inside each other. Each tag is walked once, without recursion,
 * however deep the chains run.
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
  const looping = loopingChains(declared);
  const parents = new Map<string, string>();
  for (const [name, parent] of declared) {
    if (parent !== undefined && declared.has(parent) && !looping.has(name)) {
      parents.set(name, parent);
    }
  }
  return parents;
}

/*
 * The tags whose chain of parents runs into a loop. Each walk stops at a
 * tag already settled, so every tag is visited once: a walk that meets
 * itself found a loop, and every tag it passed leads into it.
 */
function loopingChains(declared: ReadonlyMap<string, string | undefined>): Set<string> {
  const looping = new Set<string>();
  const settled = new Set<string>();
  for (const start of declared.keys()) {
    const walked: string[] = [];
    const onWalk = new Set<string>();
    let at: string | undefined = start;
    while (at !== undefined && !settled.has(at) && !onWalk.has(at)) {
      walked.push(at);
      onWalk.add(at);
      at = declared.get(at);
    }
    const loops = at !== undefined && (onWalk.has(at) || looping.has(at));
    for (const tag of walked) {
      settled.add(tag);
      if (loops) looping.add(tag);
    }
  }
  return looping;
}
