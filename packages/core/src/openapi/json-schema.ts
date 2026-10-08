import type { StandardJSONSchemaV1, StandardSchemaV1 } from "@standard-schema/spec";

import type { JSONSchema, JSONSchemaFallback, SchemaSide } from "./types";

/* What a document's schemas share: the definitions each schema carried, hoisted to its components. */
export type ComponentSchemas = Map<string, JSONSchema>;

const LOCAL_DEFINITION = "#/$defs/";
const COMPONENT = "#/components/schemas/";
/* OpenAPI's rule for a component's name. */
const NOT_IN_A_NAME = /[^A-Za-z0-9._-]/g;

/**
 * A schema as JSON Schema 2020-12, the dialect OpenAPI 3.1 and 3.2 take.
 * Zod, ArkType and every library that implements Standard JSON Schema
 * describe their own; another library's goes through `fallback`. A schema
 * neither can describe is `undefined`, which the document writes as
 * unspecified. The definitions a schema carries in `$defs` move to the
 * document's components under names of their own, and its references
 * follow them there, since an embedded `#/$defs/…` would point at the
 * document's root.
 *
 * @param schema - The schema, or `undefined` for one declared by its type alone
 * @param side - `input` for what a call sends, `output` for what it answers with
 * @param context - The document's components, a prefix for the names hoisted
 *   into them, and the fallback converter
 * @returns The schema, or `undefined` where none can be written
 * @example
 * ```ts
 * jsonSchemaOf(z.object({ id: z.string() }), "output", { components, prefix: "users.get.response" });
 * ```
 */
export function jsonSchemaOf(
  schema: StandardSchemaV1 | undefined,
  side: SchemaSide,
  context: {
    components: ComponentSchemas;
    prefix: string;
    fallback?: JSONSchemaFallback | undefined;
  },
): JSONSchema | undefined {
  if (schema === undefined) return undefined;
  const converted = convertedBy(schema, side) ?? context.fallback?.(schema, side);
  return converted === undefined ? undefined : hoisted(converted, context);
}

function convertedBy(schema: StandardSchemaV1, side: SchemaSide): JSONSchema | undefined {
  const converter = (schema["~standard"] as Partial<StandardJSONSchemaV1.Props>).jsonSchema;
  if (typeof converter?.[side] !== "function") return undefined;
  try {
    /* A value JSON cannot hold — a Date, a function — is left unspecified rather than refused. */
    return converter[side]({ target: "draft-2020-12", libraryOptions: { unrepresentable: "any" } });
  } catch {
    return undefined;
  }
}

function hoisted(
  schema: JSONSchema,
  context: { components: ComponentSchemas; prefix: string },
): JSONSchema {
  const { $schema: _dialect, $defs: definitions, ...rest } = schema;
  const names = new Map<string, string>();
  const local = isRecord(definitions) ? Object.entries(definitions) : [];
  for (const [name] of local) names.set(name, freeName(context, name));
  const rewrite = (value: unknown): unknown => rewritten(value, names);
  for (const [name, definition] of local) {
    const component = names.get(name);
    if (component !== undefined)
      context.components.set(component, rewrite(definition) as JSONSchema);
  }
  return rewrite(rest) as JSONSchema;
}

function freeName(
  context: { components: ComponentSchemas; prefix: string },
  local: string,
): string {
  const base = `${context.prefix}.${local}`.replace(NOT_IN_A_NAME, "_");
  let name = base;
  for (let n = 2; context.components.has(name); n++) name = `${base}_${n}`;
  context.components.set(name, {});
  return name;
}

/* A copy with each `#/$defs/<name>` reference pointed at the component it moved to. */
function rewritten(value: unknown, names: ReadonlyMap<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => rewritten(item, names));
  if (!isRecord(value)) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    copy[key] =
      key === "$ref" && typeof inner === "string"
        ? reference(inner, names)
        : rewritten(inner, names);
  }
  return copy;
}

function reference(ref: string, names: ReadonlyMap<string, string>): string {
  if (!ref.startsWith(LOCAL_DEFINITION)) return ref;
  const moved = names.get(ref.slice(LOCAL_DEFINITION.length));
  return moved === undefined ? ref : `${COMPONENT}${moved}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
