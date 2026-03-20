/**
 * Extract a default-values stub from a Standard Schema (Zod, Valibot, etc.).
 * Returns `{ fieldName: defaultValue }` or undefined if introspection fails.
 */
export function extractSchemaStub(schema: unknown): Record<string, unknown> | undefined {
  try {
    // Zod: schema.shape → { field: ZodType }
    const shape = (schema as { shape?: Record<string, unknown> }).shape;
    if (shape && typeof shape === "object") {
      const stub: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(shape)) {
        stub[key] = inferZodDefault(field);
      }
      return Object.keys(stub).length > 0 ? stub : undefined;
    }

    // Valibot: schema.entries → { field: SchemaType }
    const entries = (schema as { entries?: Record<string, unknown> }).entries;
    if (entries && typeof entries === "object") {
      const stub: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(entries)) {
        stub[key] = inferValibotDefault(field);
      }
      return Object.keys(stub).length > 0 ? stub : undefined;
    }
  } catch {
    // Schema introspection is best-effort
  }
  return undefined;
}

/** Infer a default value from a Zod field type (supports v3 + v4) */
export function inferZodDefault(field: unknown): unknown {
  // Zod v4: field._zod.def.type → "string", "number", etc.
  const zodV4 = (field as { _zod?: { def?: { type?: string; innerType?: unknown } } })?._zod?.def;
  if (zodV4?.type) {
    switch (zodV4.type) {
      case "string":
        return "";
      case "number":
      case "bigint":
        return 0;
      case "boolean":
        return false;
      case "array":
        return [];
      case "object":
        return {};
      case "optional":
      case "nullable":
        return inferZodDefault(zodV4.innerType);
      default:
        return "";
    }
  }

  // Zod v3: field._def.typeName → "ZodString", "ZodNumber", etc.
  const zodV3 = (field as { _def?: { typeName?: string; innerType?: unknown } })?._def;
  if (zodV3?.typeName) {
    switch (zodV3.typeName) {
      case "ZodString":
        return "";
      case "ZodNumber":
      case "ZodBigInt":
        return 0;
      case "ZodBoolean":
        return false;
      case "ZodArray":
        return [];
      case "ZodObject":
        return {};
      case "ZodOptional":
      case "ZodNullable":
        return inferZodDefault(zodV3.innerType);
      default:
        return "";
    }
  }

  return "";
}

/** Infer a default value from a Valibot field type */
export function inferValibotDefault(field: unknown): unknown {
  const type = (field as { type?: string })?.type;
  if (!type) return "";
  switch (type) {
    case "string":
      return "";
    case "number":
    case "bigint":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return "";
  }
}
