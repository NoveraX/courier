import type { JsonSchema } from "./sample-schema";

const SUCCESS = /^2\d\d$/;

/**
 * Give the objects a list answers with a schema of their own: each 2xx
 * answer that is an array of objects has its items moved to the document's
 * components, under the endpoint's name and `Item` — `ProductsListItem` —
 * and referred to from there. Code generated from the document then has a
 * named type for them, which carries each field's note, as an object
 * answer's type does.
 *
 * @param paths - The document's paths, changed in place
 * @returns The schemas moved, by name, for `components.schemas`
 * @example
 * ```ts
 * const schemas = nameListItems(paths); // { ProductsListItem: { type: "object", … } }
 * ```
 */
export function nameListItems(
  paths: Record<string, Record<string, JsonSchema>>,
): Record<string, JsonSchema> {
  const schemas: Record<string, JsonSchema> = {};
  for (const route of Object.values(paths)) {
    for (const operation of Object.values(route)) {
      const name = itemName(operation, schemas);
      const responses = isRecord(operation.responses) ? operation.responses : {};
      for (const [status, response] of Object.entries(responses)) {
        const content = SUCCESS.test(status) ? jsonContentOf(response) : undefined;
        const items =
          content && isRecord(content.schema) && content.schema.type === "array"
            ? content.schema.items
            : undefined;
        if (!isRecord(items) || items.type !== "object" || content === undefined) continue;
        schemas[name] = items;
        content.schema = {
          ...(content.schema as JsonSchema),
          items: { $ref: `#/components/schemas/${name}` },
        };
      }
    }
  }
  return schemas;
}

/* `ProductsListItem` from the operation's tag and id, numbered past a name already taken. */
function itemName(operation: JsonSchema, taken: Record<string, JsonSchema>): string {
  const tag =
    Array.isArray(operation.tags) && typeof operation.tags[0] === "string" ? operation.tags[0] : "";
  const id = typeof operation.operationId === "string" ? operation.operationId : "call";
  const base = `${pascal(tag)}${pascal(id)}Item`;
  let name = base;
  for (let n = 2; name in taken; n++) name = `${base}${n}`;
  return name;
}

function pascal(text: string): string {
  return text
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== "")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join("");
}

function jsonContentOf(response: unknown): JsonSchema | undefined {
  if (!isRecord(response) || !isRecord(response.content)) return undefined;
  const json = response.content["application/json"];
  return isRecord(json) ? json : undefined;
}

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
