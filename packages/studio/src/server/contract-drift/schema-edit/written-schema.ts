import type { Expression, ObjectExpression, ObjectProperty } from "oxc-parser";

import { boundValue, type Placed } from "./bound-value";
import type { SourceModules } from "./source-modules";

/** A Zod object schema as it is written. */
export interface WrittenObject {
  readonly path: string;
  /** Where its fields are declared, and where a new one goes: `z.object({…})`'s, or the outermost `.extend({…})`'s */
  readonly literal: ObjectExpression;
  /** The object it extends, which declares the fields the literal does not */
  readonly base?: WrittenObject | undefined;
}

/** A field as it is declared, in the module that declares it. */
export interface WrittenField {
  readonly path: string;
  readonly property: ObjectProperty;
}

/** What an expression is as a schema: an object, a list of something, or neither Studio can read. */
export type Written =
  | { readonly kind: "object"; readonly object: WrittenObject }
  | { readonly kind: "array"; readonly element: Placed }
  | { readonly kind: "unread"; readonly why: string };

const OBJECTS: ReadonlySet<string> = new Set(["object", "strictObject", "looseObject"]);

/* Calls that keep a schema's fields where they are written: modifiers, refinements, descriptions. */
const KEEPS_FIELDS: ReadonlySet<string> = new Set([
  "strict",
  "strip",
  "passthrough",
  "loose",
  "catchall",
  "describe",
  "meta",
  "readonly",
  "brand",
  "optional",
  "nullable",
  "nullish",
  "default",
  "prefault",
  "catch",
  "refine",
  "superRefine",
  "check",
  "transform",
  "pipe",
]);

/**
 * Read an expression as a Zod schema: `z.object({…})`, an object it
 * `.extend({…})`s, `z.array(…)` or `.array()`, through the modifiers that
 * keep its fields where they are written, through `_ownFields(…)`, which a
 * generated module writes an object with a field named like `constructor`
 * through, and through the names it is bound to, in this module or one it
 * imports.
 *
 * @param modules - The project's modules
 * @param placed - The expression, and the module it is written in
 * @returns What it is, or why Studio cannot read it
 * @example
 * ```ts
 * written(modules, { path, node: responseArgument }); // { kind: "array", element: … }
 * ```
 */
export function written(modules: SourceModules, placed: Placed): Written {
  const node = unwrapped(placed.node);
  const { path } = placed;
  if (node.type === "Identifier") {
    const bound = boundValue(modules, path, node.name);
    return bound === undefined
      ? { kind: "unread", why: `${node.name} is bound to no schema Studio can read` }
      : written(modules, bound);
  }
  const fields = ownFieldsArgument(node);
  if (fields !== undefined) return written(modules, { path, node: fields });
  if (
    node.type !== "CallExpression" ||
    node.callee.type !== "MemberExpression" ||
    node.callee.computed
  ) {
    return { kind: "unread", why: "the schema is built by an expression Studio does not read" };
  }
  const method = node.callee.property.type === "Identifier" ? node.callee.property.name : "";
  const receiver = node.callee.object;
  const [first] = node.arguments;
  const argument = first === undefined || first.type === "SpreadElement" ? undefined : first;
  if (OBJECTS.has(method) && argument?.type === "ObjectExpression") {
    return { kind: "object", object: { path, literal: argument } };
  }
  if (method === "array") {
    return { kind: "array", element: { path, node: argument ?? receiver } };
  }
  if (method === "extend" && argument?.type === "ObjectExpression") {
    const base = written(modules, { path, node: receiver });
    if (base.kind !== "object") return base;
    return { kind: "object", object: { path, literal: argument, base: base.object } };
  }
  if (KEEPS_FIELDS.has(method)) return written(modules, { path, node: receiver });
  return {
    kind: "unread",
    why: `the schema is built with .${method}(), which Studio does not read through`,
  };
}

/**
 * A field an object schema declares: in its own literal, or in the one it
 * extends.
 *
 * @param object - The object schema
 * @param key - The field's name
 * @returns The field, `undefined` when the object declares none by that
 *   name, or why Studio cannot tell: a spread it does not read
 * @example
 * ```ts
 * fieldOf(object, "rating"); // { path, property: <rating: z.number()> }
 * ```
 */
export function fieldOf(
  object: WrittenObject,
  key: string,
): WrittenField | { why: string } | undefined {
  const { properties } = object.literal;
  for (const property of properties) {
    if (property.type === "Property" && !property.computed && keyName(property) === key) {
      return { path: object.path, property };
    }
  }
  if (properties.some((property) => property.type === "SpreadElement")) {
    return { why: `${key} may be declared by a spread in its object, which Studio does not read` };
  }
  return object.base === undefined ? undefined : fieldOf(object.base, key);
}

/* What a field's key names: `rating`, `"x-rating"`. */
export function keyName(property: ObjectProperty): string | undefined {
  const { key } = property;
  if (key.type === "Identifier") return key.name;
  return key.type === "Literal" && typeof key.value === "string" ? key.value : undefined;
}

/* The object `_ownFields(object, …)` checks, which holds its fields as they are written. */
function ownFieldsArgument(node: Expression): Expression | undefined {
  if (node.type !== "CallExpression" || node.callee.type !== "Identifier") return undefined;
  if (node.callee.name !== "_ownFields") return undefined;
  const [first] = node.arguments;
  return first === undefined || first.type === "SpreadElement" ? undefined : first;
}

function unwrapped(node: Expression): Expression {
  let current = node;
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSNonNullExpression"
  ) {
    current = current.expression;
  }
  return current;
}
