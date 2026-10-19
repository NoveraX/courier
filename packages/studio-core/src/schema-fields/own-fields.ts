import { member } from "../member";
import type { SchemaNode } from "./schema-node";

/** What a generated `_ownFields(…)` wraps: the object of its fields, and zod's field `__proto__`. */
export interface OwnFields {
  fields: unknown;
  proto: unknown;
}

/**
 * The object a generated `_ownFields(…)` checks, which holds the fields as
 * its library writes them. Studio's generator writes an object whose fields
 * include a name every object inherits — `constructor`, `__proto__` —
 * through it, and the wrapper keeps the object as `fields`, a property no
 * library's schema has, and zod's field `__proto__`, which zod checks apart,
 * as `proto`. Read by its library's own form, the wrapper is a check of its
 * own, which lists no field.
 *
 * @param schema - A schema
 * @returns What it wraps, or `undefined` for a schema that is no such wrapper
 * @example
 * ```ts
 * ownFieldsOf(ThingSchema)?.fields; // z.looseObject({ id: z.string(), constructor: … })
 * ```
 */
export function ownFieldsOf(schema: unknown): OwnFields | undefined {
  const fields = member(schema, "fields");
  if (typeof fields !== "object" && typeof fields !== "function") return undefined;
  return fields === null ? undefined : { fields, proto: member(schema, "proto") };
}

/**
 * An object's node with zod's field `__proto__` among its fields, which the
 * object of its fields does not hold.
 *
 * @param node - The node of the object of fields
 * @param proto - The schema of its field `__proto__`, or `undefined` for none
 * @returns The node with the field
 * @example
 * ```ts
 * withProtoField(readZodV4(own.fields), own.proto)?.fields?.at(-1)?.name; // "__proto__"
 * ```
 */
export function withProtoField(
  node: SchemaNode | undefined,
  proto: unknown,
): SchemaNode | undefined {
  if (node?.kind !== "object" || proto === undefined) return node;
  return { ...node, fields: [...(node.fields ?? []), { name: "__proto__", schema: proto }] };
}
