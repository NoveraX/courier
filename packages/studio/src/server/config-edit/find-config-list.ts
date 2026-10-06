import type { Expression, ObjectExpression, ObjectPropertyKind, Program } from "oxc-parser";
import { propertyKeyName } from "../mocks-edit/plan/property-key-name";
import { unwrapExpression } from "../mocks-edit/plan/unwrap-expression";
import { topLevelConst } from "./top-level-const";

/** A list the config declares under a key: `sources` or `imports`. */
export type ConfigList =
  /** An object literal Studio can change, and the keys it writes out. */
  | { kind: "object"; object: ObjectExpression; keys: ReadonlySet<string> }
  /** No such key, and nothing that could declare it out of sight. */
  | { kind: "absent" }
  /** Anything else: `what` completes "The config …". */
  | { kind: "other"; what: string };

/**
 * Find what the config object declares under `key`: an object literal
 * written there, or one a top-level `const` binds to the name written
 * there. A config that spreads another object or computes a key may declare
 * it where Studio cannot see, so the key counts as absent only when every
 * property is a plain one.
 *
 * @param config - The object the config exports
 * @param key - The list to find
 * @param program - The parsed config, for the names a value refers to
 * @returns The list, its absence, or what the config does instead
 * @example
 * ```ts
 * // export default { sources: { api } };
 * findConfigList(config, "imports", program); // → { kind: "absent" }
 * ```
 */
export function findConfigList(
  config: ObjectExpression,
  key: "sources" | "imports",
  program: Program,
): ConfigList {
  const named = config.properties.filter((property) => keyOf(property) === key);
  if (named.length > 1) return other(`declares \`${key}\` more than once`);
  const [property] = named;
  if (property === undefined || property.type !== "Property") {
    const hidden = config.properties.some((p) => p.type === "SpreadElement" || p.computed);
    if (!hidden) return { kind: "absent" };
    return other(`spreads or computes keys of its config, which may declare \`${key}\``);
  }
  if (property.kind !== "init" || property.method) {
    return other(`declares \`${key}\` as a method or an accessor`);
  }
  return listIn(property.value, key, program);
}

function keyOf(property: ObjectPropertyKind): string | null {
  if (property.type !== "Property" || property.computed) return null;
  return propertyKeyName(property.key);
}

function listIn(value: Expression, key: string, program: Program): ConfigList {
  let current = unwrapExpression(value);
  if (current.type === "Identifier") {
    const init = topLevelConst(program, current.name);
    if (init === null)
      return other(`reads \`${key}\` from ${current.name}, which no top-level const declares`);
    current = unwrapExpression(init);
  }
  if (current.type !== "ObjectExpression") {
    return other(`builds \`${key}\` in a way Studio cannot change`);
  }
  const keys = new Set<string>();
  for (const property of current.properties) {
    const name = keyOf(property);
    if (name !== null) keys.add(name);
  }
  return { kind: "object", object: current, keys };
}

function other(what: string): ConfigList {
  return { kind: "other", what };
}
