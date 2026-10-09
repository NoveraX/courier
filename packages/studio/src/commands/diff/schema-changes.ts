import { fieldChanges } from "./field-changes";
import { relationOf, type Schema, typesOf } from "./schema-relation";
import { typeChangeOf, withoutBounds } from "./type-change";

/** How much a change matters to the API's callers. */
export type Severity = "breaking" | "warning" | "info";

/** One change between two definitions, as the report says it. */
export interface DefinitionChange {
  severity: Severity;
  /** `field-removed`, `type-narrowed`, `endpoint-removed`, … */
  kind: string;
  /** Where in the call: `body.items[].qty`, `query.page`, `answer.user.email`; empty for the endpoint itself */
  place: string;
  message: string;
}

/** What a walk over two schemas reads: which side of the call, and how a reference is followed. */
export interface SchemaWalk {
  side: "request" | "response";
  resolve: (schema: Schema) => Schema;
}

/* Two schemas deep in each other are compared this far, which no API outgrows. */
const DEEPEST = 12;

/**
 * The changes between a schema in the base definition and the same place in
 * the new one, field by field: for what a call sends, a field it must now
 * send or a value it may no longer send breaks it; for what it gets back, a
 * field gone, one that may now be absent, or a type it did not expect does.
 *
 * @param before - The schema in the base definition
 * @param after - The schema in the new one
 * @param walk - Which side of the call, and how references are followed
 * @param place - Where in the call the schemas sit
 * @returns The changes, outermost first
 * @example
 * ```ts
 * schemaChanges(old, now, { side: "response", resolve }, "answer");
 * ```
 */
export function schemaChanges(
  before: Schema,
  after: Schema,
  walk: SchemaWalk,
  place: string,
  depth = 0,
): DefinitionChange[] {
  if (depth > DEEPEST) return [];
  const a = walk.resolve(before);
  const b = walk.resolve(after);
  const changes: DefinitionChange[] = [];
  const relation = relationOf(
    walk.side === "request" ? a : withoutBounds(a),
    walk.side === "request" ? b : withoutBounds(b),
  );
  const typeChange = typeChangeOf(relation, walk.side, place, a, b);
  if (typeChange) changes.push(typeChange);
  if (typesOf(a).has("object") && typesOf(b).has("object"))
    changes.push(...fieldChanges(a, b, walk, place, depth));
  if (isSchema(a.items) && isSchema(b.items))
    changes.push(...schemaChanges(a.items, b.items, walk, `${place}[]`, depth + 1));
  return changes;
}

function isSchema(value: unknown): value is Schema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
