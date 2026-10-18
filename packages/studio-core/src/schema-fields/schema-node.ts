import { member } from "../member";

/** What a schema holds, as the field list reads it from any vendor. */
export type NodeKind =
  | "string"
  | "number"
  | "boolean"
  | "bigint"
  | "date"
  | "null"
  | "unknown"
  | "object"
  | "record"
  | "array"
  | "enum"
  | "literal"
  | "union";

/** A field of an object schema: its name, its schema, and — for JSON Schema — whether it may be left out. */
export interface NodeField {
  name: string;
  schema: unknown;
  optional?: boolean;
}

/** A schema, read: its kind, whether it may be left out or null, and what it holds. */
export interface SchemaNode {
  kind: NodeKind;
  optional: boolean;
  nullable: boolean;
  fields?: readonly NodeField[] | undefined;
  /** An array's element. */
  element?: unknown;
  /** A union's options. */
  options?: readonly unknown[] | undefined;
  /** An enum's or a literal's values. */
  values?: readonly unknown[] | undefined;
  /** The least a number may be, or the fewest characters or items a string or an array may hold. */
  least?: number | undefined;
  /** The most a number may be, or the most characters or items a string or an array may hold. */
  most?: number | undefined;
  /** What a number must be a multiple of. */
  step?: number | undefined;
  /** The format a string is checked for, by the name its vendor gives it: `email`, `uuid`, `date-time`. */
  format?: string | undefined;
  /**
   * The schema checks a value in a way the node does not hold — a pattern,
   * a refinement, a format with no sample — so one of its kind may still be
   * refused.
   */
  checked?: boolean | undefined;
}

/** The bounds, the format and the further checks a schema declares for its value. */
export type NodeLimits = Pick<SchemaNode, "least" | "most" | "step" | "format" | "checked">;

/** Reads one vendor's schemas into nodes; `undefined` for one it cannot read. */
export type NodeReader = (schema: unknown) => SchemaNode | undefined;

/**
 * A node of a kind, neither optional nor nullable.
 *
 * @param kind - What it holds
 * @param extra - Its fields, element, options or values
 * @returns The node
 * @example
 * ```ts
 * nodeOf("array", { element: itemSchema });
 * ```
 */
export function nodeOf(kind: NodeKind, extra: Partial<SchemaNode> = {}): SchemaNode {
  return { kind, optional: false, nullable: false, ...extra };
}

/**
 * The kind a schema's type name says, for the names every vendor shares.
 *
 * @param type - The type name
 * @returns The kind, or `undefined` for another name
 * @example
 * ```ts
 * scalarKind("integer"); // "number"
 * ```
 */
export function scalarKind(type: unknown): NodeKind | undefined {
  if (type === "integer") return "number";
  if (type === "any") return "unknown";
  const kinds: readonly NodeKind[] = [
    "string",
    "number",
    "boolean",
    "bigint",
    "date",
    "null",
    "unknown",
  ];
  return kinds.find((kind) => kind === type);
}

/**
 * The node of a type every vendor names alike — or, for a type the readers
 * have no kind for, one that may hold anything its schema checks for itself.
 *
 * @param type - The type name
 * @returns The node
 * @example
 * ```ts
 * scalarNode("string"); // { kind: "string", … }
 * scalarNode("custom"); // { kind: "unknown", checked: true, … }
 * ```
 */
export function scalarNode(type: unknown): SchemaNode {
  const kind = scalarKind(type);
  return kind ? nodeOf(kind) : nodeOf("unknown", { checked: true });
}

/**
 * A node with one of its flags set: optional, or nullable.
 *
 * @param node - The node, if read
 * @param flag - The flag to set
 * @returns The node with it set
 * @example
 * ```ts
 * withFlag(readZodV4(innerType), "optional");
 * ```
 */
export function withFlag(
  node: SchemaNode | undefined,
  flag: "optional" | "nullable",
): SchemaNode | undefined {
  return node && { ...node, [flag]: true };
}

/**
 * The fields of an object schema's shape: each name with its schema.
 *
 * @param shape - The shape, `{ name: schema }`
 * @returns The fields, or none for a shape that is not an object
 * @example
 * ```ts
 * fieldsOf({ id: z.string() }); // [{ name: "id", schema: z.string() }]
 * ```
 */
export function fieldsOf(shape: unknown): NodeField[] {
  if (typeof shape !== "object" || shape === null) return [];
  return Object.entries(shape).map(([name, schema]: [string, unknown]) => ({ name, schema }));
}

/**
 * A list a definition holds, or none when it holds something else.
 *
 * @param value - The value
 * @returns The list
 * @example
 * ```ts
 * listOf(member(def, "options")); // [optionA, optionB]
 * ```
 */
export function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * The distinct values of an enum held as an object.
 *
 * @param entries - The object, `{ key: value }`
 * @returns Its values, each once
 * @example
 * ```ts
 * valuesOf({ a: "a", b: "b" }); // ["a", "b"]
 * ```
 */
export function valuesOf(entries: unknown): readonly unknown[] {
  if (typeof entries !== "object" || entries === null) return [];
  const values = Object.entries(entries)
    .filter(([key, value]: [string, unknown]) => !mapsBack(entries, key, value))
    .map(([, value]: [string, unknown]) => value);
  return [...new Set(values)];
}

/* A numeric TypeScript enum maps each number back to its name, `E[0] === "A"`: no value of it. */
function mapsBack(entries: object, key: string, value: unknown): boolean {
  return typeof value === "string" && member(entries, value) === Number(key);
}
