import { isSchemaType } from "../../parser/schema-type";
import type { SpecNode } from "../../parser/spec-node";
import { checkConstraints } from "./check-constraints";
import { checkName } from "./check-name";
import type { PendingNodes } from "./pending-nodes";
import type { SpecPath } from "./spec-path";

/**
 * Check a schema: its type, one a schema has, which a type alias writes as
 * code, and the name it refers to by, when it refers to one; then leave the
 * schemas, properties and constraints in it to be checked.
 *
 * @param schema - The schema, as the specification gives it
 * @param at - Where it is
 * @param pending - The nodes left to check
 * @throws {InvalidSpecError} For a value refused
 * @example
 * ```ts
 * pending.later(checkSchema, endpoint.requestBody, at, "requestBody");
 * ```
 */
export function checkSchema(schema: SpecNode, at: SpecPath, pending: PendingNodes): void {
  if (!isSchemaType(schema.type)) {
    at.field("type").refuse(schema.type, "it is no type a schema has");
  }
  if (schema.refName != null) checkName(schema.refName, at.field("refName"), "schema");
  pending.later(checkConstraints, schema.constraints, at, "constraints");
  pending.later(checkSchema, schema.items, at, "items");
  pending.later(checkSchema, schema.valueType, at, "valueType");
  pending.each(checkSchema, schema.variants, at, "variants");
  pending.entries(checkProperty, schema.properties, at, "properties");
}

/* A property's own type is only ever compared, never written. */
function checkProperty(property: SpecNode, at: SpecPath, pending: PendingNodes): void {
  if (property.refName != null) checkName(property.refName, at.field("refName"), "schema");
  pending.later(checkConstraints, property.constraints, at, "constraints");
  pending.later(checkSchema, property.items, at, "items");
  pending.later(checkSchema, property.shape, at, "shape");
  pending.later(checkSchema, property.valueType, at, "valueType");
}
