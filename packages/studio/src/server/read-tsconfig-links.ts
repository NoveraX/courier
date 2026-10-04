import type { ArrayExpressionElement, Expression, ObjectExpression } from "oxc-parser";
import { parseSync } from "oxc-parser";

import { propertyKeyName } from "./mocks-edit/plan/property-key-name";
import { unwrapExpression } from "./mocks-edit/plan/unwrap-expression";

/** What decides whether the path-alias reader looks past a tsconfig. */
export interface TsconfigLinks {
  /** The `extends` entries the reader follows, in the order written. */
  extends: string[];
  /** Whether `compilerOptions.paths` is an object, which ends the reader's search. */
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
 * last one counts, as it does for the reader. The reader takes `paths` as
 * declared only when it is an object, follows the paths an `extends` array
 * lists and skips any other entry, and follows no `extends` that is neither
 * a string nor an array. A text that is JavaScript but not JSON5, which the
 * reader refuses whole, is read here as JavaScript, so its links are
 * followed: that watches more files than the reader reads, never fewer.
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
  return {
    extends: entriesOf(propertyValue(root, "extends")),
    declaresPaths: paths?.type === "ObjectExpression",
  };
}

function propertyValue(object: ObjectExpression, name: string): Expression | null {
  let value: Expression | null = null;
  for (const property of object.properties) {
    if (property.type !== "Property" || property.computed) continue;
    if (propertyKeyName(property.key) === name) value = unwrapExpression(property.value);
  }
  return value;
}

function entriesOf(value: Expression | null): string[] {
  if (value === null) return [];
  const elements = value.type === "ArrayExpression" ? value.elements : [value];
  return elements.flatMap((element) => {
    const text = stringOf(element);
    return text === null ? [] : [text];
  });
}

function stringOf(element: ArrayExpressionElement): string | null {
  return element?.type === "Literal" && typeof element.value === "string" ? element.value : null;
}
