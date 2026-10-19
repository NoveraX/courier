/**
 * References that point somewhere other than a component schema.
 *
 * A bundled specification writes each schema once, where it is first used,
 * and points every later use at that place — DigitalOcean's published one
 * has 2,798 references and every one of them reads like
 * `#/paths/~1v2~1droplets/get/responses/200/…/items`. Such a reference
 * names no schema the import declares, so it is read where it points and
 * converted in place.
 */

import { resolveRef } from "./ref-utils";
import type { SpecNode } from "./types";

/* The references being read right now, innermost last. */
const expanding = new Set<string>();

/**
 * How many references are being read in place right now, each inside the
 * one before. A composition met again inside itself with no more of them
 * open came back to itself without passing through one.
 *
 * @returns The count
 * @example
 * ```ts
 * const before = pointersBeingRead();
 * ```
 */
export function pointersBeingRead(): number {
  return expanding.size;
}

/**
 * Convert what a reference points at, in place of the reference.
 *
 * @param ref - A reference that names no component schema
 * @param spec - The whole specification, `undefined` when there is none to read
 * @param convert - Converts the schema found there
 * @param unresolved - What to use when it cannot be read: there is no
 *   specification, or the reference leads back into itself — a schema that
 *   contains itself cannot be written out in place
 * @returns The converted schema, or the fallback
 * @example
 * ```ts
 * expandPointer("#/paths/~1pets/get/responses/200/content/application~1json/schema", spec,
 *   (target) => convertSchema("Pets", target, spec), () => ({ name: "Pets", type: "any" }));
 * ```
 */
export function expandPointer<TConverted>(
  ref: string,
  spec: SpecNode | undefined,
  convert: (target: SpecNode) => TConverted,
  unresolved: () => TConverted,
): TConverted {
  if (spec === undefined || expanding.has(ref)) return unresolved();
  expanding.add(ref);
  try {
    return convert(resolveRef(spec, ref));
  } finally {
    expanding.delete(ref);
  }
}
