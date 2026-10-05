import { member } from "../member";
import type { NodeReader } from "./schema-node";
import { fieldsOf, listOf, nodeOf, scalarKind, valuesOf, withFlag } from "./schema-node";

function called(getter: unknown): unknown {
  return typeof getter === "function" ? getter() : undefined;
}

/**
 * Reads a Zod v4 schema from its definition, `schema._zod.def`.
 *
 * @param schema - The schema
 * @returns Its node, or `undefined` for a schema that is not Zod v4
 * @example
 * ```ts
 * readZodV4(z.string().optional()); // { kind: "string", optional: true, … }
 * ```
 */
export const readZodV4: NodeReader = (schema) => {
  const def = member(member(schema, "_zod"), "def");
  if (def === undefined) return undefined;
  const type = member(def, "type");
  const inner = () => readZodV4(member(def, "innerType"));
  switch (type) {
    case "optional":
    case "default":
    case "prefault":
      return withFlag(inner(), "optional");
    case "nullable":
      return withFlag(inner(), "nullable");
    case "nonoptional": {
      const node = inner();
      return node && { ...node, optional: false };
    }
    case "readonly":
    case "catch":
      return inner();
    case "pipe":
      return readZodV4(member(def, "in"));
    case "lazy":
      return readZodV4(called(member(def, "getter")));
    case "object":
      return nodeOf("object", { fields: fieldsOf(member(def, "shape")) });
    case "array":
      return nodeOf("array", { element: member(def, "element") });
    case "enum":
      return nodeOf("enum", { values: valuesOf(member(def, "entries")) });
    case "literal":
      return nodeOf("literal", { values: listOf(member(def, "values")) });
    case "union":
      return nodeOf("union", { options: listOf(member(def, "options")) });
    case "record":
      return nodeOf("record");
    default:
      return nodeOf(scalarKind(type) ?? "unknown");
  }
};

/**
 * Reads a Zod v3 schema from its definition, `schema._def`.
 *
 * @param schema - The schema
 * @returns Its node, or `undefined` for a schema that is not Zod v3
 * @example
 * ```ts
 * readZodV3(z3.array(z3.string())); // { kind: "array", element: …, … }
 * ```
 */
export const readZodV3: NodeReader = (schema) => {
  const def = member(schema, "_def");
  const name = member(def, "typeName");
  if (typeof name !== "string") return undefined;
  const inner = (key: string) => readZodV3(member(def, key));
  switch (name) {
    case "ZodOptional":
    case "ZodDefault":
      return withFlag(inner("innerType"), "optional");
    case "ZodNullable":
      return withFlag(inner("innerType"), "nullable");
    case "ZodReadonly":
    case "ZodCatch":
      return inner("innerType");
    case "ZodBranded":
      return inner("type");
    case "ZodEffects":
      return inner("schema");
    case "ZodPipeline":
      return inner("in");
    case "ZodLazy":
      return readZodV3(called(member(def, "getter")));
    case "ZodObject":
      return nodeOf("object", { fields: fieldsOf(called(member(def, "shape"))) });
    case "ZodArray":
      return nodeOf("array", { element: member(def, "type") });
    case "ZodEnum":
      return nodeOf("enum", { values: listOf(member(def, "values")) });
    case "ZodNativeEnum":
      return nodeOf("enum", { values: valuesOf(member(def, "values")) });
    case "ZodLiteral":
      return nodeOf("literal", { values: [member(def, "value")] });
    case "ZodUnion":
    case "ZodDiscriminatedUnion":
      return nodeOf("union", { options: listOf(member(def, "options")) });
    case "ZodRecord":
      return nodeOf("record");
    default:
      return nodeOf(scalarKind(name.replace(/^Zod/, "").toLowerCase()) ?? "unknown");
  }
};
