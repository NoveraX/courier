import type { ObjectExpression, ObjectPropertyKind } from "oxc-parser";
import { MocksEditRefusal } from "../mocks-edit-refusal";
import type { RefusalCode } from "../types";
import { lineNumberAt } from "./line-number-at";
import type { ParsedSource } from "./parse-source";
import { propertyKeyName } from "./property-key-name";

/** Why one property keeps Studio from adding to the object. */
interface PropertyProblem {
  code: RefusalCode;
  /** What the property does, following "<file> (line N)". */
  does: string;
}

const HIDES = "so Studio cannot see every key.";

/**
 * Read the keys a mocks object literal declares, refusing an object whose
 * keys Studio cannot all see or whose entries are not plain properties.
 *
 * @param object - The mocks object literal
 * @param parsed - The file it is in
 * @returns Its keys in order, as written
 * @throws {MocksEditRefusal} `MOCKS_KEYS_HIDDEN` for a spread, a computed key or `__proto__`;
 *   `MOCKS_NOT_LITERAL` for a getter, setter or method
 *
 * @example
 * ```ts
 * // export default { users: 1, "billing-api": 2 };
 * readLiteralKeys(object, parsed); // → ["users", "billing-api"]
 * ```
 */
export function readLiteralKeys(object: ObjectExpression, parsed: ParsedSource): string[] {
  const keys: string[] = [];
  for (const property of object.properties) {
    const key =
      property.type === "Property" && !property.computed ? propertyKeyName(property.key) : null;
    const problem = problemOf(property, key);
    if (problem !== null) {
      const line = lineNumberAt(parsed.text, property.start);
      throw new MocksEditRefusal(problem.code, `${parsed.fileName} (line ${line}) ${problem.does}`);
    }
    if (key !== null) keys.push(key);
  }
  return keys;
}

function problemOf(property: ObjectPropertyKind, key: string | null): PropertyProblem | null {
  if (property.type === "SpreadElement") {
    return hidden(`spreads another object into the mocks, ${HIDES}`);
  }
  if (property.computed) return hidden(`computes a mock's key, ${HIDES}`);
  if (property.kind !== "init" || property.method) {
    const what = property.method ? "a method" : `a ${property.kind}ter`;
    return {
      code: "MOCKS_NOT_LITERAL",
      does: `declares ${what} among the mocks; Studio adds only to an object of plain properties.`,
    };
  }
  if (key === null) return hidden("declares a key Studio cannot read.");
  if (key === "__proto__" && !property.shorthand) {
    return hidden("sets the mocks object's prototype, which can supply keys Studio cannot see.");
  }
  return null;
}

function hidden(does: string): PropertyProblem {
  return { code: "MOCKS_KEYS_HIDDEN", does };
}
