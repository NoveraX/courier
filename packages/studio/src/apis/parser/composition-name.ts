/**
 * The name a composition found inside itself is declared by.
 */

import { componentIdentifier, componentIdentifiers } from "./component-identifier";
import { toSafeIdentifier } from "./naming-utils";
import { fieldOf, nodeAt, type SpecNode } from "./spec-node";

/* Per document: where each `allOf` list is first written, as the keys that lead to it. */
const PLACES = new WeakMap<SpecNode, Map<readonly unknown[], readonly string[]>>();

/** The name a composition is declared by. */
export interface CompositionName {
  readonly name: string;
  /** The composition is a component's own schema, which that component declares already. */
  readonly owned: boolean;
}

/**
 * Name a composition after where the document writes it: the component it
 * sits in and the path inside that component — `CategoryParent` for
 * Category's property `parent`, `NodeChildrenItem` for the items of Node's
 * `children`. A composition that is a component's own schema is named by
 * that component. A name a schema or its constant takes, or another
 * composition took, is numbered; the names come from the document, so a
 * newer version of it names the same compositions alike.
 *
 * @param spec - The whole specification
 * @param members - The composition's `allOf` list, as the document holds it
 * @param fallback - The name it is merged under, for one no component holds
 * @param reserved - The names other compositions of this parse took
 * @returns The name, and whether it is a component's own
 * @example
 * ```ts
 * compositionName(spec, parentAllOf, "CategoryParentValue", new Set());
 * // → { name: "CategoryParent", owned: false }
 * ```
 */
export function compositionName(
  spec: SpecNode,
  members: readonly unknown[],
  fallback: string,
  reserved: ReadonlySet<string>,
): CompositionName {
  const place = placesOf(spec).get(members) ?? [];
  const component = componentOf(place);
  if (component !== undefined && place.length === 3) {
    return { name: componentIdentifier(spec, component), owned: true };
  }
  const words = wordsOf(place.slice(3));
  const base =
    component === undefined || words.length === 0
      ? toSafeIdentifier(fallback)
      : `${componentIdentifier(spec, component)}${words.join("")}`;
  return { name: freeName(base, componentIdentifiers(spec), reserved), owned: false };
}

/* The component schema a place is inside, if it is inside one. */
function componentOf(place: readonly string[]): string | undefined {
  return place[0] === "components" && place[1] === "schemas" ? place[2] : undefined;
}

/* The words a path inside a schema reads as: its properties' names, `Item`, `Value`, `Variant2`. */
function wordsOf(path: readonly string[]): string[] {
  const words: string[] = [];
  for (let at = 0; at < path.length; at += 1) {
    const segment = path[at] ?? "";
    const next = path[at + 1];
    if (next !== undefined && (segment === "properties" || segment === "allOf")) {
      if (segment === "properties") words.push(toSafeIdentifier(next));
      at += 1;
    } else if (next !== undefined && (segment === "oneOf" || segment === "anyOf")) {
      words.push(`Variant${Number(next) + 1}`);
      at += 1;
    } else words.push(WORDS.get(segment) ?? toSafeIdentifier(segment));
  }
  return words;
}

const WORDS: ReadonlyMap<string, string> = new Map([
  ["items", "Item"],
  ["additionalProperties", "Value"],
]);

/* A name clear of every taken one, and of every taken one's constant, `${name}Schema`, both ways. */
function freeName(base: string, ...taken: ReadonlyArray<ReadonlySet<string>>): string {
  const clashes = (name: string): boolean =>
    taken.some(
      (names) =>
        names.has(name) ||
        names.has(`${name}Schema`) ||
        (name.endsWith("Schema") && names.has(name.slice(0, -"Schema".length))),
    );
  let name = base;
  for (let number = 2; clashes(name); number += 1) name = `${base}${number}`;
  return name;
}

/* Walked once per document, the component schemas first, each object once — YAML's aliases can
   put one object in many places — and without recursion, as a document nests deeper than a stack. */
function placesOf(spec: SpecNode): Map<readonly unknown[], readonly string[]> {
  let places = PLACES.get(spec);
  if (places) return places;
  places = new Map();
  const seen = new Set<object>();
  const components = nodeAt(nodeAt(spec, "components"), "schemas");
  walk(components, ["components", "schemas"], seen, places);
  walk(spec, [], seen, places);
  PLACES.set(spec, places);
  return places;
}

/* A place as the key that leads to it and the step before: a path is spelled out only where a list is found. */
interface Step {
  readonly key: string;
  readonly up: Step | undefined;
}

function walk(
  root: unknown,
  at: readonly string[],
  seen: Set<object>,
  places: Map<readonly unknown[], readonly string[]>,
): void {
  const pending: Array<[unknown, Step | undefined]> = [[root, undefined]];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [value, step] = next;
    if (typeof value !== "object" || value === null || seen.has(value)) continue;
    seen.add(value);
    const allOf = fieldOf(value, "allOf");
    if (Array.isArray(allOf) && !places.has(allOf)) places.set(allOf, [...at, ...keysTo(step)]);
    const children: Array<[string, unknown]> = Object.entries(value);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const [key, child] = children[index] ?? ["", undefined];
      pending.push([child, { key, up: step }]);
    }
  }
}

function keysTo(step: Step | undefined): string[] {
  const keys: string[] = [];
  for (let at = step; at !== undefined; at = at.up) keys.push(at.key);
  return keys.reverse();
}
