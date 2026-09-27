import type { ArrayExpressionElement, Expression, ObjectExpression, PropertyKey } from "oxc-parser";
import { parseSync } from "oxc-parser";

/**
 * Parse JSON as TypeScript reads a tsconfig: comments and trailing commas
 * are allowed, as a file people edit by hand carries both.
 *
 * A JSON value is a JavaScript expression, so oxc, which Studio already runs
 * to read modules, parses it; the tree is then turned into the value, and
 * anything JSON cannot hold is refused. A key is kept as an own property,
 * `__proto__` included, as `JSON.parse` keeps it.
 *
 * @param text - The file's text
 * @returns The value it holds
 * @throws {SyntaxError} When the text is not one JSON value, comments and trailing commas aside
 * @example
 * ```ts
 * parseJsonc('{\n  // Node\'s own resolution\n  "module": "NodeNext",\n}\n'); // → { module: "NodeNext" }
 * ```
 */
export function parseJsonc(text: string): unknown {
  /* The line break keeps a comment on the last line from swallowing the parenthesis. */
  const { program, errors } = parseSync("value.js", `(${text}\n)`, { preserveParens: false });
  const [error] = errors;
  if (error !== undefined) throw new SyntaxError(error.message);
  const [statement, ...rest] = program.body;
  if (statement?.type !== "ExpressionStatement" || rest.length > 0) {
    throw new SyntaxError("The text holds more than one value");
  }
  return jsonValue(statement.expression);
}

function jsonValue(node: Expression): unknown {
  switch (node.type) {
    case "Literal":
      return literalValue(node.value, "regex" in node);
    case "ArrayExpression":
      return node.elements.map(elementValue);
    case "ObjectExpression":
      return objectValue(node);
    case "UnaryExpression":
      if (node.operator === "-" && node.argument.type === "Literal") {
        const value = node.argument.value;
        if (typeof value === "number") return -value;
      }
      return notJson(node.type);
    default:
      return notJson(node.type);
  }
}

function literalValue(value: unknown, regex: boolean): unknown {
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") return value;
  if (value === null && !regex) return null;
  return notJson(regex ? "a regular expression" : "a bigint");
}

function elementValue(element: ArrayExpressionElement): unknown {
  if (element === null) return notJson("a hole in an array");
  if (element.type === "SpreadElement") return notJson(element.type);
  return jsonValue(element);
}

function objectValue(node: ObjectExpression): Record<string, unknown> {
  const entries = node.properties.map((property): [string, unknown] => {
    if (property.type === "SpreadElement") return notJson(property.type);
    if (property.computed || property.method || property.shorthand || property.kind !== "init") {
      return notJson("a property that is not a plain key and value");
    }
    return [keyOf(property.key), jsonValue(property.value)];
  });
  return Object.fromEntries(entries);
}

/* TypeScript reads an unquoted key too, reporting it without failing. */
function keyOf(key: PropertyKey): string {
  if (key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return notJson("a key that is not a string");
}

function notJson(what: string): never {
  throw new SyntaxError(`JSON holds no ${what}`);
}
