import type { ParsedSource } from "@noverax/courier-cli/devkit";
import type { ArrayExpression, Expression, ObjectExpression } from "oxc-parser";

import { MocksEditRefusal } from "../mocks-edit-refusal";
import { isMockCallee } from "./is-mock-callee";
import { lineNumberAt } from "./line-number-at";
import { propertyKeyName } from "./property-key-name";
import type { MockImports } from "./read-mock-imports";
import { unwrapExpression } from "./unwrap-expression";

/** Where a mock's list is, and what it holds. */
export interface EndpointsList {
  array: ArrayExpression;
  names: string[];
}

/**
 * Find the list a mock answers: the `endpoints` array of its
 * `defineMockServer({ ... })` in the mocks object, and the names it holds.
 * Studio reads only what it can read in full: a mock declared as a plain
 * property, a call of `defineMockServer` imported from the mock package
 * with one object literal, and an array of string literals.
 *
 * @param parsed - The mocks file
 * @param mocks - Its mocks object
 * @param key - The mock's key
 * @param imports - What the file imports from the mock package
 * @returns The array and its names
 * @throws {MocksEditRefusal} `MOCK_NOT_FOUND`, `MOCK_NOT_LITERAL`, `MOCK_ANSWERS_ALL` or `ENDPOINTS_NOT_LITERAL`
 * @example
 * ```ts
 * endpointsListOf(parsed, located.object, "shop", imports).names; // → ["orders.list"]
 * ```
 */
export function endpointsListOf(
  parsed: ParsedSource,
  mocks: ObjectExpression,
  key: string,
  imports: MockImports,
): EndpointsList {
  const entry = propertyNamed(mocks, key);
  if (entry === undefined) {
    throw new MocksEditRefusal("MOCK_NOT_FOUND", `${parsed.fileName} declares no mock ${key}.`);
  }
  const options = serverOptionsOf(entry, parsed, key, imports);
  const listed = propertyNamed(options, "endpoints");
  if (listed === undefined) {
    throw new MocksEditRefusal(
      "MOCK_ANSWERS_ALL",
      `${key} in ${parsed.fileName} lists no endpoints: it answers every endpoint of its source already.`,
    );
  }
  const array = unwrapExpression(listed);
  const names = array.type === "ArrayExpression" ? namesIn(array) : null;
  if (array.type !== "ArrayExpression" || names === null) {
    const line = lineNumberAt(parsed.text, listed.start);
    throw new MocksEditRefusal(
      "ENDPOINTS_NOT_LITERAL",
      `${key} in ${parsed.fileName} (line ${line}) lists its endpoints other than as an array of strings, so Studio cannot add to it.`,
    );
  }
  return { array, names };
}

/* The value of a plain property the object declares under a name, if it does. */
function propertyNamed(object: ObjectExpression, name: string): Expression | undefined {
  for (const property of object.properties) {
    if (property.type !== "Property" || property.computed || property.kind !== "init") continue;
    if (!property.method && propertyKeyName(property.key) === name) return property.value;
  }
  return undefined;
}

/* The object literal a mock's `defineMockServer` call takes. */
function serverOptionsOf(
  entry: Expression,
  parsed: ParsedSource,
  key: string,
  imports: MockImports,
): ObjectExpression {
  const call = unwrapExpression(entry);
  const [argument, ...rest] = call.type === "CallExpression" ? call.arguments : [];
  const options =
    call.type === "CallExpression" &&
    isMockCallee(call.callee, "defineMockServer", imports) &&
    argument !== undefined &&
    argument.type !== "SpreadElement" &&
    rest.length === 0
      ? unwrapExpression(argument)
      : null;
  if (options?.type === "ObjectExpression") return options;
  throw new MocksEditRefusal(
    "MOCK_NOT_LITERAL",
    `${key} in ${parsed.fileName} is not a defineMockServer({ … }) call Studio can read.`,
  );
}

/* The names an array of string literals holds, or `null` for any other array. */
function namesIn(array: ArrayExpression): string[] | null {
  const names: string[] = [];
  for (const element of array.elements) {
    if (element === null || element.type !== "Literal" || typeof element.value !== "string") {
      return null;
    }
    names.push(element.value);
  }
  return names;
}
