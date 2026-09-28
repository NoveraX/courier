import type { MockRequestContext } from "../types";
import { generateRecords } from "./data-generator";
import { generateValue } from "./data-generator/value";
import type { RouteInfo } from "./route-analyzer";
import { analyzeField, extractShape, unwrapArraySchema } from "./schema-introspect";

/** How many items a made-up list has. */
const LIST_LENGTH = 5;

/**
 * The answer of an endpoint that is none of its collection's operations — a
 * search, a login, a report — made up from its response schema: an object as
 * a record, anything else — a string, a map, a list of numbers — as a value
 * of its type. An endpoint with no response schema answers with nothing,
 * rather than with "No mock", which left a generated `logoutUser` failing.
 *
 * @param route - The endpoint's route
 * @returns The handler answering it
 * @example
 * ```ts
 * makeCustomHandler(inventoryRoute)(ctx); // → { sold: 12, pending: 3 } for a map of numbers
 * ```
 */
export function makeCustomHandler(route: RouteInfo): (ctx: MockRequestContext) => unknown {
  const schema = route.responseSchema;
  if (!schema) return () => null;
  const item = unwrapArraySchema(schema);
  if (extractShape(item ?? schema)) {
    return () => {
      const records = generateRecords(schema, item ? LIST_LENGTH : 1);
      return item ? records : records[0];
    };
  }
  const meta = analyzeField(item ?? schema);
  if (!item) return () => generateValue(route.endpoint, meta, 1);
  return () =>
    Array.from({ length: LIST_LENGTH }, (_, at) => generateValue(route.endpoint, meta, at + 1));
}
