import type { DefinitionChange, SchemaWalk } from "./schema-changes";
import { type relationOf, type Schema, typesOf } from "./schema-relation";

/**
 * The change to the values a place takes, said for its side of the call: a
 * call that sends fewer kinds of values, or gets more, is told so — and is
 * broken when it sends what is no longer taken, or may be by what it gets.
 *
 * @param relation - How the values changed
 * @param side - Which side of the call the place is on
 * @param place - Where in the call
 * @param a - The schema before
 * @param b - The schema now
 * @returns The change, or `undefined` while the values are the same
 * @example
 * ```ts
 * typeChangeOf("narrowed", "request", "body.qty", { type: "number" }, { type: "integer" });
 * ```
 */
export function typeChangeOf(
  relation: ReturnType<typeof relationOf>,
  side: SchemaWalk["side"],
  place: string,
  a: Schema,
  b: Schema,
): DefinitionChange | undefined {
  if (relation === "same") return undefined;
  const was = describe(a);
  const now = describe(b);
  if (relation === "changed")
    return {
      severity: "breaking",
      kind: "type-changed",
      place,
      message: `${place} was ${was}, now ${now}`,
    };
  const breaks = (relation === "narrowed") === (side === "request");
  const kind = relation === "narrowed" ? "type-narrowed" : "type-widened";
  if (side === "request") {
    return breaks
      ? {
          severity: "breaking",
          kind,
          place,
          message: `${place} takes fewer values: was ${was}, now ${now}`,
        }
      : {
          severity: "info",
          kind,
          place,
          message: `${place} takes more values: was ${was}, now ${now}`,
        };
  }
  return breaks
    ? {
        severity: "warning",
        kind,
        place,
        message: `${place} may come as values callers did not get before: was ${was}, now ${now}`,
      }
    : {
        severity: "info",
        kind,
        place,
        message: `${place} comes as fewer values: was ${was}, now ${now}`,
      };
}

function describe(schema: Schema): string {
  const values = [...list(schema.enum), ...("const" in schema ? [schema.const] : [])];
  if (values.length > 0) return values.map((value) => JSON.stringify(value)).join(" | ");
  return [...typesOf(schema)].sort().join(" | ");
}

/**
 * A schema without the bounds that say nothing of an answer's type: an
 * answer's bounds are promises the caller does not check.
 *
 * @param schema - The schema
 * @returns It, without its bounds
 * @example
 * ```ts
 * withoutBounds({ type: "number", minimum: 1 }); // { type: "number" }
 * ```
 */
export function withoutBounds(schema: Schema): Schema {
  const {
    minimum: _min,
    maximum: _max,
    minLength: _minLength,
    maxLength: _maxLength,
    pattern: _pattern,
    ...rest
  } = schema;
  return rest;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
