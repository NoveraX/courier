import type { DefinitionChange, SchemaWalk } from "./schema-changes";
import { schemaChanges } from "./schema-changes";
import type { Schema } from "./schema-relation";

/**
 * The changes to an object's fields between two schemas: a field gone, a
 * field new, one that became required or optional — each said for its side
 * of the call — and the changes inside each field both have.
 *
 * @param a - The object's schema before
 * @param b - Its schema now
 * @param walk - Which side of the call, and how references are followed
 * @param place - Where in the call the object sits
 * @param depth - How deep the walk is
 * @returns The changes
 * @example
 * ```ts
 * fieldChanges(before, after, { side: "response", resolve }, "answer", 0);
 * ```
 */
export function fieldChanges(
  a: Schema,
  b: Schema,
  walk: SchemaWalk,
  place: string,
  depth: number,
): DefinitionChange[] {
  const before = isSchema(a.properties) ? a.properties : {};
  const after = isSchema(b.properties) ? b.properties : {};
  const wasRequired = new Set(list(a.required));
  const isRequired = new Set(list(b.required));
  const changes: DefinitionChange[] = [];
  const request = walk.side === "request";
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const at = place === "" ? key : `${place}.${key}`;
    const old = before[key];
    const now = after[key];
    if (!isSchema(now)) {
      changes.push(
        request
          ? {
              severity: "info",
              kind: "field-removed",
              place: at,
              message: `${at} is no longer read`,
            }
          : {
              severity: "breaking",
              kind: "field-removed",
              place: at,
              message: `${at} is no longer in the answer`,
            },
      );
    } else if (!isSchema(old)) {
      const needed = request && isRequired.has(key);
      changes.push(
        needed
          ? {
              severity: "breaking",
              kind: "field-added-required",
              place: at,
              message: `${at} must now be sent`,
            }
          : {
              severity: "info",
              kind: "field-added",
              place: at,
              message: request ? `${at} may now be sent` : `${at} is new in the answer`,
            },
      );
    } else {
      const required = requiredChange(at, wasRequired.has(key), isRequired.has(key), request);
      if (required) changes.push(required);
      changes.push(...schemaChanges(old, now, walk, at, depth + 1));
    }
  }
  return changes;
}

function requiredChange(
  at: string,
  was: boolean,
  is: boolean,
  request: boolean,
): DefinitionChange | undefined {
  if (was === is) return undefined;
  if (request) {
    return is
      ? {
          severity: "breaking",
          kind: "field-required",
          place: at,
          message: `${at} must now be sent`,
        }
      : {
          severity: "info",
          kind: "field-optional",
          place: at,
          message: `${at} need no longer be sent`,
        };
  }
  return is
    ? {
        severity: "info",
        kind: "field-required",
        place: at,
        message: `${at} is now always in the answer`,
      }
    : {
        severity: "breaking",
        kind: "field-optional",
        place: at,
        message: `${at} may now be missing from the answer`,
      };
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isSchema(value: unknown): value is Schema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
