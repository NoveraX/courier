/**
 * Compositions that contain themselves.
 *
 * An `allOf` is merged where it stands: the properties of every schema it
 * refers to are copied in. A property among them may be that very
 * composition — a category's `parent`, `allOf: [Category, { depth }]` — and
 * merging it again inside itself never ended: the parse ran out of stack.
 * Such a composition is declared once, as a schema of its own named after
 * where the document writes it, `CategoryParent`, and every place that
 * merges it, itself among them, refers to that schema instead.
 */

import { compositionName } from "./composition-name";
import { pointersBeingRead } from "./pointer-refs";
import type { ParsedSchema, ParsedSpec, SpecNode } from "./types";

/** A composition being merged, and the name it is declared by once found inside itself. */
interface Merge {
  readonly members: readonly unknown[];
  /** The name it is merged under where it stands. */
  readonly name: string;
  /** How many references were being read in place when it began. */
  readonly pointers: number;
  refName: string | undefined;
  /** It is a component's own schema, which that component declares already. */
  owned: boolean;
}

/** What one parse declared for the compositions it found inside themselves. */
interface Parse {
  readonly spec: SpecNode;
  readonly names: Map<readonly unknown[], string>;
  readonly schemas: Map<string, ParsedSchema>;
  readonly reserved: Set<string>;
  /** The compositions being merged right now, outermost first. */
  readonly merging: Merge[];
}

/* The parse under way; none outside a parse. */
let current: Parse | undefined;

/**
 * Parse a specification, and declare among its schemas each composition
 * the parse found inside itself.
 *
 * @param spec - The specification as written
 * @param parse - The parse, whose compositions merge through {@link mergedComposition}
 * @returns What the parse returns, with those compositions among `schemas`
 * @example
 * ```ts
 * const parsed = withDeclaredCompositions(spec, () => parsedDocument(spec));
 * parsed.schemas.CategoryParent; // → the parent a category's `parent` composes
 * ```
 */
export function withDeclaredCompositions(spec: SpecNode, parse: () => ParsedSpec): ParsedSpec {
  const outer = current;
  const own: Parse = {
    spec,
    names: new Map(),
    schemas: new Map(),
    reserved: new Set(),
    merging: [],
  };
  current = own;
  let parsed: ParsedSpec;
  try {
    parsed = parse();
  } finally {
    current = outer;
  }
  if (own.schemas.size === 0) return parsed;
  return { ...parsed, schemas: { ...parsed.schemas, ...Object.fromEntries(own.schemas) } };
}

/**
 * Merge a composition, or refer to the schema it is declared as. Met again
 * inside itself with no reference read in place since it began, it is
 * declared, and so is every composition merged inside it on the way back;
 * met again through such a reference, it is cut where that reference comes
 * back to itself, as a reference read in place always is. Outside a parse,
 * it is merged.
 *
 * @param members - The composition's `allOf` list, as the document holds it
 * @param name - The name the merged schema takes where it stands
 * @param description - What the composition says about itself
 * @param merge - Merges the composition where it stands
 * @returns The merged schema, or a reference to the schema declared for it
 * @example
 * ```ts
 * mergedComposition(listAt(node, "allOf"), "CategoryParentValue", undefined, () => merge(node));
 * // → { name: "CategoryParentValue", type: "ref", refName: "CategoryParent" } inside itself
 * ```
 */
export function mergedComposition(
  members: readonly unknown[],
  name: string,
  description: string | undefined,
  merge: () => ParsedSchema,
): ParsedSchema {
  const parse = current;
  if (parse === undefined) return merge();
  const known = parse.names.get(members);
  if (known !== undefined) return reference(name, known, description);
  const open = parse.merging.findLastIndex((entry) => entry.members === members);
  if (open >= 0 && parse.merging[open]?.pointers === pointersBeingRead()) {
    return reentered(parse, open, name, description);
  }
  const entry: Merge = {
    members,
    name,
    pointers: pointersBeingRead(),
    refName: undefined,
    owned: false,
  };
  return declaredWhenInside(parse, entry, description, merge);
}

/* Merged; declared once it was found inside itself, unless a component declares it. */
function declaredWhenInside(
  parse: Parse,
  entry: Merge,
  description: string | undefined,
  merge: () => ParsedSchema,
): ParsedSchema {
  parse.merging.push(entry);
  let merged: ParsedSchema;
  try {
    merged = merge();
  } finally {
    parse.merging.pop();
  }
  if (entry.refName === undefined || entry.owned) return merged;
  parse.names.set(entry.members, entry.refName);
  parse.schemas.set(entry.refName, { ...merged, name: entry.refName });
  return reference(entry.name, entry.refName, description);
}

/* Met again inside itself: every composition merged since is on the way back to it, and named too. */
function reentered(
  parse: Parse,
  open: number,
  name: string,
  description: string | undefined,
): ParsedSchema {
  for (const entry of parse.merging.slice(open)) {
    if (entry.refName !== undefined) continue;
    const decided = compositionName(parse.spec, entry.members, entry.name, parse.reserved);
    entry.refName = decided.name;
    entry.owned = decided.owned;
    if (!decided.owned) parse.reserved.add(decided.name);
  }
  return reference(name, parse.merging[open]?.refName ?? name, description);
}

function reference(name: string, refName: string, description: string | undefined): ParsedSchema {
  return { name, type: "ref", refName, description };
}
