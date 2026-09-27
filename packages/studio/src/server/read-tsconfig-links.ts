import type { ArrayExpressionElement, Expression, ObjectExpression } from "oxc-parser";
import { parseSync } from "oxc-parser";

import { propertyKeyName } from "./mocks-edit/plan/property-key-name";
import { unwrapExpression } from "./mocks-edit/plan/unwrap-expression";

/** What decides whether the path-alias reader looks past a tsconfig. */
export interface TsconfigLinks {
  /**
   * Each `extends` entry, in the order written; `null` for an entry that is
   * no string, where the reader fails and looks no further.
   */
  extends: Array<string | null>;
  /** Whether `compilerOptions.paths` is set to a truthy value, which ends the reader's search. */
  declaresPaths: boolean;
}

const NO_LINKS: TsconfigLinks = { extends: [], declaresPaths: false };

/**
 * Read a tsconfig's `extends` and whether it declares `compilerOptions.paths`,
 * as the path-alias reader of `@noverax/courier-studio-core` reads them.
 *
 * The reader parses a tsconfig as JSON5, and every JSON5 text is a
 * JavaScript expression, so oxc, which Studio already has, reads it as one;
 * nothing is evaluated. A text that is no object reads as declaring nothing,
 * as a text the reader cannot parse does. Where a key is written twice the
 * last one counts, as it does for the reader. The reader takes any truthy
 * `paths` as declared, an array or a string included, and an `extends` that
 * is neither a string nor an array as one it cannot follow. A text that is
 * JavaScript but not JSON5, which the reader refuses whole, is read here as
 * JavaScript, so its links are followed: that watches more files than the
 * reader reads, never fewer.
 *
 * @param text - The tsconfig's text
 * @returns Its `extends` entries and whether it declares `paths`
 *
 * @example
 * ```ts
 * readTsconfigLinks('{ "extends": "./tsconfig.base.json", // shared\n }');
 * // → { extends: ["./tsconfig.base.json"], declaresPaths: false }
 * ```
 */
export function readTsconfigLinks(text: string): TsconfigLinks {
  /* The line break ends a line comment the text may close on. */
  const result = parseSync("tsconfig.js", `(${text}\n)`, { lang: "js", sourceType: "script" });
  const [statement] = result.program.body;
  if (result.errors.length > 0 || statement?.type !== "ExpressionStatement") return NO_LINKS;
  const root = unwrapExpression(statement.expression);
  if (root.type !== "ObjectExpression") return NO_LINKS;
  const options = propertyValue(root, "compilerOptions");
  const paths = options?.type === "ObjectExpression" ? propertyValue(options, "paths") : null;
  return { extends: entriesOf(propertyValue(root, "extends")), declaresPaths: isTruthy(paths) };
}

function propertyValue(object: ObjectExpression, name: string): Expression | null {
  let value: Expression | null = null;
  for (const property of object.properties) {
    if (property.type !== "Property" || property.computed) continue;
    if (propertyKeyName(property.key) === name) value = unwrapExpression(property.value);
  }
  return value;
}

/* `null` means an entry the reader fails on; a JSON `null`, or no `extends`
   at all, is no entry. */
function entriesOf(value: Expression | null): Array<string | null> {
  if (value === null || isNullLiteral(value)) return [];
  if (value.type === "ArrayExpression") return value.elements.map(stringOf);
  return [stringOf(value)];
}

function stringOf(element: ArrayExpressionElement): string | null {
  return element?.type === "Literal" && typeof element.value === "string" ? element.value : null;
}

function isNullLiteral(value: Expression): boolean {
  return value.type === "Literal" && value.value === null;
}

/* JSON5 values only: an object, an array, a literal, `Infinity` and `NaN`,
   each maybe signed. */
function isTruthy(value: Expression | null): boolean {
  if (value === null) return false;
  if (value.type === "ObjectExpression" || value.type === "ArrayExpression") return true;
  if (value.type === "Literal") return Boolean(value.value);
  if (value.type === "Identifier") return value.name === "Infinity";
  if (value.type === "UnaryExpression") return isTruthy(unwrapExpression(value.argument));
  return false;
}
