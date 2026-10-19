import { member } from "../member";
import { ownFieldsOf, withProtoField } from "./own-fields";
import type { NodeReader, SchemaNode } from "./schema-node";
import { fieldsOf, listOf, nodeOf, scalarNode, valuesOf, withFlag } from "./schema-node";
import { zodV3Limits, zodV4Limits } from "./zod-limits";

function called(getter: unknown): unknown {
  return typeof getter === "function" ? getter() : undefined;
}

/* A refinement checks the value in a way its node does not hold. */
function refined(node: SchemaNode | undefined, refinement: boolean): SchemaNode | undefined {
  return node && refinement ? { ...node, checked: true } : node;
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
  const own = ownFieldsOf(schema);
  if (own !== undefined) return withProtoField(readZodV4(own.fields), own.proto);
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
    case "string":
      return nodeOf("string", zodV4Limits(def));
    case "number":
      return nodeOf("number", zodV4Limits(def));
    case "array":
      return nodeOf("array", { element: member(def, "element"), ...zodV4Limits(def) });
    case "enum":
      return nodeOf("enum", { values: valuesOf(member(def, "entries")) });
    case "literal":
      return nodeOf("literal", { values: listOf(member(def, "values")) });
    case "union":
      return nodeOf("union", { options: listOf(member(def, "options")) });
    case "record":
      return nodeOf("record");
    default:
      return scalarNode(type);
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
      return refined(inner("schema"), member(member(def, "effect"), "type") === "refinement");
    case "ZodPipeline":
      return inner("in");
    case "ZodLazy":
      return readZodV3(called(member(def, "getter")));
    case "ZodObject":
      return nodeOf("object", { fields: fieldsOf(called(member(def, "shape"))) });
    case "ZodString":
      return nodeOf("string", zodV3Limits(def));
    case "ZodNumber":
      return nodeOf("number", zodV3Limits(def));
    case "ZodArray":
      return nodeOf("array", { element: member(def, "type"), ...zodV3Limits(def) });
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
      return scalarNode(name.replace(/^Zod/, "").toLowerCase());
  }
};
